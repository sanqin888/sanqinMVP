"""Fixed live SSH first-install transport: LOCAL Python pipe fixtures only.

No network, SSH, systemd, AWS, snapshot or production operation is performed.
"""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sanq_install_live as live
import sanq_install_frames as frames
import sanq_install_evidence as evidence
import sanq_install_offhost as offhost
import test_sanq_deploy_install_frames as fixture
import test_sanq_deploy_install_evidence as evidence_fixture

SRC, RET = fixture.SRC, fixture.RET


def fake_target():
    return {"host": "52.60.180.44", "fingerprint": "SHA256:" + "A" * 43,
            "directory": Path("/Users/operator name/.sanq-deploy"),
            "home": Path("/Users/operator name"), "check": lambda: None}


def child_source(requests, *, exit_code=0, extra=False):
    return ("import os,sys\n"
            "requests=" + repr(requests) + "\n"
            "for request in requests:\n"
            " os.write(1,request)\n"
            " if not sys.stdin.buffer.readline(): sys.exit(3)\n"
            + ("os.write(1,b'extra output\\n')\n" if extra else "")
            + "sys.exit(" + str(exit_code) + ")\n")


class FixedArguments(unittest.TestCase):
    def test_fixed_vm_cli_reuses_pin_without_stdin_redirect(self):
        op = live.fixed_operation(SRC, RET)
        self.assertEqual(op["remote"],
            "/usr/bin/sudo -n -- /usr/bin/python3 -I -S -B "
            "/opt/sanq/install-bootstrap/" + SRC
            + "/ops/release/install_minimal_executor.py installation-submit"
            + " --source-sha " + SRC + " --retention-id " + RET)
        argv = live.live_ssh_argv(fake_target(), op)
        self.assertEqual(argv[:4], ["/usr/bin/ssh", "-F", "/dev/null", "-T"])
        self.assertNotIn("-n", argv)
        self.assertEqual(argv[-9:], ["-i", "/Users/operator name/.sanq-deploy/identity",
                                     "-p", "22", "-l", "ubuntu", "--",
                                     "52.60.180.44", op["remote"]])
        for opt in ("BatchMode=yes", "StrictHostKeyChecking=yes", "IdentitiesOnly=yes",
                    "HostKeyAlias=sanq-runtime", "ForwardAgent=no",
                    "ControlMaster=no", "ProxyCommand=none", "ProxyJump=none"):
            self.assertIn(opt, argv)

    def test_foreign_command_host_and_shell_fragments_rejected(self):
        for sha, retention in ((SRC[:-1], RET), (SRC, RET[:-1]),
                               (SRC.upper(), RET), (SRC, RET + ";id"),
                               ("$(id)", RET)):
            with self.subTest(sha=sha, retention=retention), self.assertRaises(frames.FrameRejected):
                live.fixed_operation(sha, retention)
        op = live.fixed_operation(SRC, RET)
        for key, value in (("remote", "id"), ("command", "run"),
                           ("host", "other"), ("extra", "test")):
            with self.subTest(key=key), self.assertRaises(frames.FrameRejected):
                live.live_ssh_argv(fake_target(), dict(op, **{key: value}))

    def test_mac_public_cli_has_no_install_submit(self):
        import sanq_install
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            sanq_install._operation(["submit", "--source-sha", SRC, "--retention-id", RET])
        self.assertNotIn("sanq_install_live", (Path(__file__).resolve().parents[1]
                                            / "sanq_install.py").read_text())


class LocalPipeFixtures(unittest.TestCase):
    def _start(self, requests, *, exit_code=0, extra=False, review=None):
        process = subprocess.Popen([sys.executable, "-c",
                child_source(requests, exit_code=exit_code, extra=extra)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                close_fds=True, start_new_session=True)
        self.addCleanup(lambda: (live.transport._stop_local(process),
                        [f.close() for f in (process.stdin,process.stdout,process.stderr)
                         if not f.closed]))
        round_review = review if review is not None else frames.Review(
            SRC, RET, frames._canonical(fixture.target()))
        return live.LiveChannel(process, fake_target(), round_review)

    @staticmethod
    def requests():
        snapshot = fixture.second(frames.hashlib.sha256(
            frames._canonical(fixture.target())).hexdigest())
        transfer = fixture.third(snapshot)
        transfer["index"]["createdAt"] = evidence_fixture.CREATED
        transfer["index"]["availableObservedAt"] = evidence_fixture.OBSERVED
        return [frames._canonical(fixture.first()), frames._canonical(snapshot),
                frames._canonical(fixture.reseal(transfer))]

    def send_target(self, channel):
        channel.read_frame(4096, 5)
        channel.write_frame(frames._canonical(fixture.target()), 5)

    def send_evidence(self, channel):
        channel.read_frame(65536, 5)
        round_review = channel.review
        ev = evidence.EvidenceReview(round_review)
        raw = frames._canonical(evidence_fixture.reply(round_review))
        ev.inspect(raw, request_sent_at=evidence_fixture.SENT,
                   reply_received_at=evidence_fixture.RECEIVED)
        channel.write_frame(raw, 5, evidence_review=ev)
        return ev, raw

    def send_offhost(self, channel, ev):
        raw = channel.read_frame(32768, 5)
        temp = tempfile.TemporaryDirectory(prefix="sanq-local-offhost-")
        self.addCleanup(temp.cleanup)
        os.chmod(temp.name, 0o700)
        ack = offhost.retain_index(channel.review, ev, raw, temp.name,
                                    operator_confirmed_off_host=True)
        channel.write_frame(ack, 5)
        return ack

    def complete(self, *, exit_code=0, extra=False):
        requests = self.requests()
        channel = self._start(requests, exit_code=exit_code, extra=extra)
        self.send_target(channel)
        ev, _ = self.send_evidence(channel)
        ack = self.send_offhost(channel, ev)
        self.assertEqual(channel.phase, 6)
        return channel, ack

    def test_three_local_pipe_rounds_do_not_prove_installation(self):
        channel, ack = self.complete()
        self.assertEqual(frames._frame(ack, 32768)["kind"], "sanq-minimal-snapshot-index-ack")
        report = channel.exit_observation(5)
        self.assertEqual(report["outcome"], "SSH_CHILD_EXIT_ZERO_OBSERVED")
        for key in ("installationComplete", "canExecute", "readyToInstall", "restoreProven"):
            self.assertIs(report[key], False)
        with self.assertRaises(frames.FrameRejected):
            channel.read_frame(4096, 1)

    def test_original_target_larger_than_four_kib_keeps_original_reply_budget(self):
        target = fixture.target()
        target["instance"]["metadata"] = "x" * 6000
        original = frames._canonical(target)
        channel = self._start(self.requests(),
                              review=frames.Review(SRC, RET, original))
        channel.read_frame(4096, 5)
        channel.write_frame(original, 5)
        self.assertEqual(channel.phase, 2)

    def test_empty_pipe_before_first_request_fails_and_consumes_session(self):
        channel = self._start([])
        with self.assertRaises(frames.FrameRejected):
            channel.read_frame(4096, 5)
        self.assertTrue(channel.failed)

    def test_out_of_order_and_old_identity_requests_fail(self):
        for raw in (frames._canonical(fixture.second("0" * 64)),
                    frames._canonical(dict(fixture.first(), sourceSha="f" * 40)),
                    frames._canonical(dict(fixture.first(), canExecute=True))):
            channel = self._start([raw])
            with self.subTest(frame=raw[:35]), self.assertRaises(frames.FrameRejected):
                channel.read_frame(4096, 5)
            self.assertTrue(channel.failed)
            self.assertTrue(channel.review.failed or channel.failed)

    def test_target_reply_must_be_exact_preapproved_original(self):
        channel = self._start(self.requests())
        channel.read_frame(4096, 5)
        wrong = frames._canonical(dict(fixture.target(), operatorConfirmed=False))
        with self.assertRaises(frames.FrameRejected):
            channel.write_frame(wrong, 5)
        self.assertTrue(channel.failed)

    def test_snapshot_reply_requires_same_reviewed_original(self):
        channel = self._start(self.requests())
        self.send_target(channel)
        channel.read_frame(65536, 5)
        raw = frames._canonical(evidence_fixture.reply(channel.review))
        with self.assertRaises(frames.FrameRejected):
            channel.write_frame(raw, 5)
        self.assertTrue(channel.failed)

    def test_offhost_ack_cannot_be_sent_before_durable_readback(self):
        channel = self._start(self.requests())
        self.send_target(channel)
        ev, _ = self.send_evidence(channel)
        channel.read_frame(32768, 5)
        fake = frames._canonical({"schemaVersion": 1, "kind": "sanq-minimal-snapshot-index-ack",
                                  "canExecute": False, "recoveryReady": False})
        with self.assertRaises(frames.FrameRejected):
            channel.write_frame(fake, 5)
        self.assertTrue(channel.failed)

    def test_wrong_reply_kind_fails_and_cannot_retry(self):
        channel = self._start(self.requests())
        channel.read_frame(4096, 5)
        with self.assertRaises(frames.FrameRejected):
            channel.write_frame(frames._canonical({"kind":"wrong"}), 5)
        self.assertTrue(channel.failed)
        with self.assertRaises(frames.FrameRejected):
            channel.write_frame(frames._canonical(fixture.target()), 5)

    def test_late_stdout_blocks_zero_exit(self):
        channel, _ = self.complete(extra=True)
        with self.assertRaises(frames.FrameRejected):
            channel.exit_observation(5)
        self.assertTrue(channel.failed)

    def test_nonzero_ssh_child_blocks_zero_exit(self):
        channel, _ = self.complete(exit_code=9)
        with self.assertRaises(frames.FrameRejected):
            channel.exit_observation(5)
        self.assertTrue(channel.failed)


if __name__ == "__main__":
    unittest.main()
