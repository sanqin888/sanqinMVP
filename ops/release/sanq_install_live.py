"""Private Mac first-install live SSH transport, not an installed CLI command.

Only a future separately reviewed operator peer may call open_live(). The one
fixed remote command is the existing VM installation-submit. Opening this
transport is a PRODUCTION-MUTATING operation if used against a prepared VM.
Do not expose it through sanq-install.sh before explicit production approval,
snapshot/off-host operator approval, and exact result readback are implemented.
"""
import contextlib
import hashlib
import os
import selectors
import subprocess
import sys
import time

import sanq_deploy as transport
import sanq_install_frames as frames
import sanq_install_evidence as evidence


BOOTSTRAP = "/opt/sanq/install-bootstrap/"
SCRIPT = "/ops/release/install_minimal_executor.py"
MAX_ERROR = 65536
FRAME_LIMITS = (4096, 65536, 32768)
REPLY_LIMITS = (65536, 65536, 32768)
FRAME_KINDS = (
    ("sanq-minimal-install-target-request", "sanq-minimal-pre-snapshot-target"),
    ("sanq-minimal-snapshot-evidence-request", "sanq-minimal-snapshot-evidence-reply"),
    ("sanq-minimal-snapshot-index-transfer", "sanq-minimal-snapshot-index-ack"),
)


def _need(condition):
    frames._need(condition)


def fixed_operation(source_sha, retention_id):
    """No caller-supplied host, executable, shell fragment, path or SSH option."""
    _need(frames._hex(source_sha, 40) and frames._hex(retention_id, 64))
    script = BOOTSTRAP + source_sha + SCRIPT
    command = ("/usr/bin/sudo -n -- /usr/bin/python3 -I -S -B "
               + script + " installation-submit --source-sha " + source_sha
               + " --retention-id " + retention_id)
    return {"command": "first-install-live-submit", "remote": command,
            "sourceSha": source_sha, "retentionId": retention_id}


def live_ssh_argv(target, operation, identity_path=None):
    _need(type(operation) is dict and
          operation == fixed_operation(operation.get("sourceSha"),
                                       operation.get("retentionId")))
    argv = transport._ssh_argv(target, operation, identity_path)
    # Reuse every pinned option/identity/host from the accepted read-only Mac
    # path; the unique necessary difference is removing '-n' for a live stdin.
    _need(argv[:5] == ["/usr/bin/ssh", "-F", "/dev/null", "-n", "-T"]
          and argv.count("-n") == 1 and argv.count("-T") == 1)
    return argv[:3] + argv[4:]


class LiveChannel:
    """Bounded half-duplex framing over *one* SSH child, one transaction only.

    No automatic reconnect, retry, remote reset/stop, shell execution or
    successful-installation conclusion. Caller must separately check the
    reviewed manual evidence and durable ACK before using write_frame.
    """

    def __init__(self, process, target, review):
        _need(process.stdin is not None and process.stdout is not None
              and process.stderr is not None
              and type(review) is frames.Review and review.phase == 0
              and not review.failed and not review.offhost_attempted
              and review.target["sshTarget"] == target["host"]
              and review.target["sshHostKeySha256"] == target["fingerprint"])
        self.process, self.target, self.review = process, target, review
        self.phase = 0
        self.failed = False
        self.output_buffer = bytearray()
        self.error_count = 0
        self.stderr_eof = False
        for f in (process.stdin, process.stdout, process.stderr):
            os.set_blocking(f.fileno(), False)

    def _poll(self, *, want_write, deadline):
        with selectors.DefaultSelector() as selector:
            if want_write:
                selector.register(self.process.stdin, selectors.EVENT_WRITE, "input")
            else:
                selector.register(self.process.stdout, selectors.EVENT_READ, "output")
            if not self.stderr_eof:
                selector.register(self.process.stderr, selectors.EVENT_READ, "error")
            remaining = deadline - time.monotonic()
            _need(remaining > 0)
            ready = selector.select(min(remaining, 0.2))
            _need(time.monotonic() < deadline)
            for key, _ in ready:
                if key.data == "error":
                    try:
                        chunk = os.read(key.fileobj.fileno(), 4096)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        self.stderr_eof = True
                    else:
                        self.error_count += len(chunk)
                        _need(self.error_count <= MAX_ERROR)
            return {key.data for key, _ in ready if key.data != "error"}

    def read_frame(self, maximum, timeout):
        """Only VM requests; a reply is required before the next request."""
        _need(not self.failed and self.phase in (0, 2, 4)
              and maximum == FRAME_LIMITS[self.phase // 2]
              and type(timeout) in (int, float) and 0 < timeout <= (30 if self.phase == 0 else 1800))
        deadline = time.monotonic() + timeout
        try:
            self.target["check"]()
            while True:
                if b"\n" in self.output_buffer:
                    _need(self.output_buffer.count(b"\n") == 1
                          and self.output_buffer.endswith(b"\n")
                          and time.monotonic() < deadline)
                    raw = bytes(self.output_buffer)
                    self.output_buffer.clear()
                    _need(frames._frame(raw, maximum)["kind"] == FRAME_KINDS[self.phase // 2][0])
                    _need(self.review.phase == self.phase // 2)
                    self.review.inspect(raw)
                    self.target["check"]()
                    self.phase += 1
                    return raw
                _need(self.process.poll() is None)
                ready = self._poll(want_write=False, deadline=deadline)
                if "output" in ready:
                    try:
                        chunk = os.read(self.process.stdout.fileno(),
                                        min(4096, maximum + 1 - len(self.output_buffer)))
                    except BlockingIOError:
                        continue
                    _need(chunk)
                    self.output_buffer.extend(chunk)
                    _need(len(self.output_buffer) <= maximum)
        except BaseException:
            self.failed = True
            raise

    def write_frame(self, raw, timeout, *, evidence_review=None):
        """Carry exact reviewed originals, never generic reply bytes.

        The target must be the pre-reviewed raw target; snapshot evidence must
        have completed the one-use evidence review; the ACK must come from
        the successfully fsynced and read-back local off-host original.
        """
        _need(not self.failed and self.phase in (1, 3, 5)
              and type(raw) is bytes and type(timeout) in (int, float)
              and 0 < timeout <= (30 if self.phase == 1 else 1800))
        deadline = time.monotonic() + timeout
        try:
            expected_kind = FRAME_KINDS[self.phase // 2][1]
            reply = frames._frame(raw, REPLY_LIMITS[self.phase // 2])
            _need(reply.get("kind") == expected_kind
                  and reply.get("canExecute") is not True
                  and reply.get("recoveryReady") is not True
                  and self.review.phase == (self.phase + 1) // 2)
            if self.phase == 1:
                _need(hashlib.sha256(raw).hexdigest() == self.review.target_sha
                      and reply == self.review.target)
            elif self.phase == 3:
                _need(type(evidence_review) is evidence.EvidenceReview
                      and evidence_review.round is self.review
                      and evidence_review.finished is True
                      and evidence_review.failed is False
                      and evidence_review.reply_sha256 == hashlib.sha256(raw).hexdigest())
            else:
                _need(self.review.offhost_attempted is True
                      and self.review.offhost_ack_sha == hashlib.sha256(raw).hexdigest())
            self.target["check"]()
            offset = 0
            while offset < len(raw):
                _need(self.process.poll() is None)
                ready = self._poll(want_write=True, deadline=deadline)
                if "input" in ready:
                    try:
                        sent = os.write(self.process.stdin.fileno(), raw[offset:])
                    except BlockingIOError:
                        continue
                    _need(sent > 0)
                    offset += sent
            self.target["check"]()
            self.phase += 1
        except BaseException:
            self.failed = True
            raise

    def exit_observation(self, timeout):
        """Exit zero is ONLY a live SSH child observation, not durable success."""
        _need(not self.failed and self.phase == 6
              and type(timeout) in (int, float) and 0 < timeout <= 10000)
        deadline = time.monotonic() + timeout
        try:
            self.target["check"]()
            self.process.stdin.close()
            # Do not equate process.poll() with stdout EOF: a child can exit
            # before its final unreviewed stdout bytes have been drained.
            eof = False
            while not eof:
                _need(self.process.poll() is None or time.monotonic() < deadline)
                ready = self._poll(want_write=False, deadline=deadline)
                if "output" in ready:
                    try:
                        data = os.read(self.process.stdout.fileno(), 4096)
                    except BlockingIOError:
                        continue
                    _need(not data)  # No extra frames, banners or forged success.
                    eof = True
            while self.process.poll() is None:
                remaining = deadline - time.monotonic()
                _need(remaining > 0)
                try:
                    self.process.wait(timeout=min(0.2, remaining))
                except subprocess.TimeoutExpired:
                    pass
            _need(type(self.process.returncode) is int and self.process.returncode == 0)
            self.target["check"]()
            return {"schemaVersion": 1, "kind": "sanq-install-live-transport-observation",
                    "outcome": "SSH_CHILD_EXIT_ZERO_OBSERVED", "liveTransportExitObserved": True,
                    "installationComplete": False, "canExecute": False,
                    "readyToInstall": False, "restoreProven": False}
        except BaseException:
            self.failed = True
            raise


@contextlib.contextmanager
def open_live(target, source_sha, retention_id, review):
    """Restricted internal launch point, not wired into any public CLI."""
    _need(sys.platform == "darwin" and os.geteuid() != 0
          and type(review) is frames.Review and review.phase == 0
          and not review.failed and review.source == source_sha
          and review.retention == retention_id
          and review.target["sshTarget"] == target["host"]
          and review.target["sshHostKeySha256"] == target["fingerprint"])
    operation = fixed_operation(source_sha, retention_id)
    target["check"]()
    env = transport._environment(target["home"])
    with transport._agent_identity(target, env) as identity_path:
        args = live_ssh_argv(target, operation, identity_path)
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, env=env, cwd=target["home"],
                                   close_fds=True, start_new_session=True)
        try:
            yield LiveChannel(process, target, review)
        finally:
            transport._stop_local(process)  # Local SSH client only; never reset remote unit.
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream is not None and not stream.closed:
                    stream.close()
            target["check"]()
