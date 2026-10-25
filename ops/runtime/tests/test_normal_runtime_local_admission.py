"""F4-B1 real Linux FD/flock and independent-process tests, fake namespace only."""
from contextlib import ExitStack
import inspect
import json
import multiprocessing
import os
from pathlib import Path
import pickle
import signal
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_local_admission as admission


def _worker(connection, launch, request, args, hold):
    try:
        with admission.consume_local_attempt(launch, request, **args) as handle:
            connection.send(("HELD", handle.observation()))
            if hold:
                connection.recv()
        connection.send(("CLOSED", None))
    except (ValueError, OSError) as exc:
        connection.send(("BLOCKED", str(exc)))
    finally:
        connection.close()


class LocalAdmissionTests(unittest.TestCase):
    def setUp(self):
        import test_normal_runtime_readonly_review as f2
        self.fixture = f2.ReadonlyReviewTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.base = self.root
        for part in ("root", "sanq-runtime-operator"):
            self.base /= part
            self.base.mkdir(mode=0o700)
        self.ledger = self.base / "normal-update-transactions"
        self.ledger.mkdir(mode=0o700)
        self.lock = self.base / "normal-update.lock"
        self.lock.write_bytes(b"")
        self.lock.chmod(0o600)
        self.launch, self.request = self.fixture.launch, self.fixture.request
        self.args = dict(expected_launch_sha256=admission.digest(self.launch),
                         expected_request_sha256=admission.digest(self.request))
        self.txid = self.fixture.request_doc["transactionId"]
        self.real_guard = admission._require_root
        self.uid_gid = (os.getuid(), os.getgid())
        for p in (patch.object(admission, "_require_root"),
                  patch.object(admission, "_OWNER", self.uid_gid),
                  patch.object(admission, "_open_namespace_root",
                               side_effect=lambda: os.open(self.root, admission._flags()))):
            p.start()
            self.addCleanup(p.stop)

    def consume(self, **changes):
        return admission.consume_local_attempt(self.launch, self.request,
                                                **{**self.args, **changes})

    def inputs(self, txid):
        launch = json.loads(self.launch)
        launch["transactionId"] = txid
        launch["argv"][-1] = txid
        launch = admission.canonical(launch)
        request = admission.canonical({**json.loads(self.request), "transactionId": txid,
                                      "launchMaterialsSha256": admission.digest(launch)})
        return launch, request, dict(expected_launch_sha256=admission.digest(launch),
                                    expected_request_sha256=admission.digest(request))

    def receipt(self, **changes):
        return admission.canonical({
            "schema": "sanq.runtime.normal-update-flow.v1", "status": "ABORTED",
            "requestSha256": self.args["expected_request_sha256"],
            "launchMaterialsSha256": self.args["expected_launch_sha256"],
            "flowCompleted": False, "readyToInstall": False,
            "authorizedToMutateProduction": False, "decision": "BLOCKED",
            "failure": {"step": "PREPARE_PRIVATE", "type": "OSError"}, **changes})

    def files(self):
        return {p.name: p.read_bytes() for p in self.ledger.iterdir() if p.is_file()}

    def start(self, inputs=None, hold=False):
        launch, request, args = inputs or (self.launch, self.request, self.args)
        ctx = multiprocessing.get_context("fork")
        parent, child = ctx.Pipe()
        process = ctx.Process(target=_worker, args=(child, launch, request, args, hold))
        process.start()
        child.close()
        def cleanup():
            if process.is_alive():
                process.terminate()
            process.join(timeout=10)
            if process.is_alive():
                process.kill()
                process.join(timeout=10)
            parent.close()
        self.addCleanup(cleanup)
        return process, parent

    def receive(self, conn):
        self.assertTrue(conn.poll(15), "child process did not report within bound")
        return conn.recv()

    def test_context_is_lazy_then_durable_and_has_no_effect_authority(self):
        context = self.consume()
        self.assertEqual(self.files(), {})
        with context as handle:
            result = handle.observation()
            self.assertEqual(result["status"], "LOCAL_ATTEMPT_HELD_UNRESOLVED")
            for key in admission._FALSE:
                self.assertIs(result[key], False)
            self.assertEqual(result["decision"], "BLOCKED")
            self.assertEqual(set(self.files()), {"active.json", self.txid + ".json"})
            self.assertEqual(len(set(self.files().values())), 1)
            claim = json.loads(self.files()["active.json"])
            self.assertEqual(claim["requestSha256"], admission.digest(self.request))
            self.assertEqual(claim["currentRuntimeSha"],
                             self.fixture.request_doc["currentRuntimeSha"])
            self.assertEqual(claim["targetArchiveDigest"],
                             self.fixture.request_doc["targetArchiveDigest"])
        self.assertEqual(admission.inspect_local_admission()["status"], "UNRESOLVED_ATTEMPT")
        with self.assertRaisesRegex(ValueError, "closed"):
            handle.observation()

    def test_bad_pins_rejected_before_open_or_writes(self):
        with patch.object(admission, "_locked", side_effect=AssertionError("must not open")):
            with self.assertRaises(ValueError):
                with self.consume(expected_request_sha256="1" * 64):
                    self.fail("invalid input yielded")
        self.assertEqual(self.files(), {})

    def test_same_transaction_rejected_after_close_even_new_context(self):
        with self.consume():
            pass
        before = self.files()
        with self.assertRaisesRegex(ValueError, "blocks"):
            with self.consume():
                self.fail("consumed again")
        self.assertEqual(self.files(), before)

    def test_different_transaction_also_blocked_by_unresolved_claim(self):
        with self.consume():
            pass
        launch, request, args = self.inputs("c1-other-admission-001")
        with self.assertRaises(ValueError):
            with admission.consume_local_attempt(launch, request, **args):
                self.fail("unresolved installation reused")
        self.assertEqual(set(self.files()), {"active.json", self.txid + ".json"})

    def test_same_transaction_different_request_cannot_replace_original(self):
        with self.consume():
            pass
        before = self.files()
        self.request = admission.canonical({**json.loads(self.request),
                                           "preservedStateSha256": "e" * 64})
        self.args["expected_request_sha256"] = admission.digest(self.request)
        with self.assertRaises(ValueError):
            with self.consume():
                self.fail("changed request reused tx")
        self.assertEqual(self.files(), before)

    def test_independent_process_same_and_different_tx_excluded_while_held(self):
        first, pipe = self.start(hold=True)
        self.assertEqual(self.receive(pipe)[0], "HELD")
        for inputs in (None, self.inputs("c1-process-other-001")):
            process, other = self.start(inputs)
            status, reason = self.receive(other)
            self.assertEqual(status, "BLOCKED")
            self.assertIn("lock busy", reason)
            process.join(timeout=10)
            self.assertEqual(process.exitcode, 0)
        pipe.send("close")
        self.assertEqual(self.receive(pipe)[0], "CLOSED")
        first.join(timeout=10)
        self.assertEqual(first.exitcode, 0)
        process, other = self.start()
        self.assertEqual(self.receive(other)[0], "BLOCKED")
        process.join(timeout=10)

    def test_sigkill_releases_os_lock_but_claim_blocks_fresh_process(self):
        process, pipe = self.start(hold=True)
        self.assertEqual(self.receive(pipe)[0], "HELD")
        before = self.files()
        os.kill(process.pid, signal.SIGKILL)
        process.join(timeout=10)
        self.assertEqual(process.exitcode, -signal.SIGKILL)
        self.assertEqual(admission.inspect_local_admission()["status"], "UNRESOLVED_ATTEMPT")
        second, other = self.start(self.inputs("c1-after-kill-001"))
        status, reason = self.receive(other)
        self.assertEqual(status, "BLOCKED")
        self.assertIn("blocks", reason)
        second.join(timeout=10)
        self.assertEqual(self.files(), before)

    def test_exception_preserved_and_no_finally_abort_or_cleanup(self):
        failure = OSError("original failure")
        with self.assertRaises(OSError) as caught:
            with self.consume():
                raise failure
        self.assertIs(caught.exception, failure)
        self.assertEqual(set(self.files()), {"active.json", self.txid + ".json"})
        self.assertEqual(admission.inspect_local_admission()["status"], "UNRESOLVED_ATTEMPT")

    def test_abort_requires_live_same_attempt_and_bound_receipt(self):
        with self.consume() as handle:
            attempt = handle.observation()["attemptId"]
            for receipt, owner in ((self.receipt(), "f" * 64),
                                   (self.receipt(requestSha256="f" * 64), attempt),
                                   (self.receipt(status="COMPLETED"), attempt)):
                with self.assertRaises(ValueError):
                    handle.record_abort(receipt, attempt_id=owner)
            raw_digest = handle.record_abort(self.receipt(), attempt_id=attempt)
            self.assertEqual(raw_digest,
                             admission.digest(self.files()[self.txid + ".abort.json"]))
            with self.assertRaises(ValueError):
                handle.record_abort(self.receipt(), attempt_id=attempt)
        before = self.files()
        with self.assertRaisesRegex(ValueError, "closed"):
            handle.record_abort(self.receipt(), attempt_id=attempt)
        self.assertEqual(self.files(), before)
        self.assertEqual(admission.inspect_local_admission()["status"],
                         "UNRESOLVED_WITH_ABORT_OBSERVATION")

    def test_partial_writes_completed_without_replacing_controls(self):
        write = os.write
        with patch.object(admission.os, "write",
                          side_effect=lambda fd, raw: write(fd, raw[:max(1, len(raw)//3)])):
            with self.consume():
                pass
        self.assertEqual(admission.inspect_local_admission()["status"], "UNRESOLVED_ATTEMPT")

    def test_zero_write_preserves_empty_global_claim_and_blocks(self):
        with patch.object(admission.os, "write", return_value=0):
            with self.assertRaisesRegex(ValueError, "progress"):
                with self.consume():
                    self.fail("zero write yielded")
        self.assertEqual(self.files(), {"active.json": b""})
        self.assertEqual(admission.inspect_local_admission()["status"], "UNKNOWN_BLOCKING")
        with self.assertRaises(ValueError):
            with self.consume():
                self.fail("partial claim reused")

    def test_file_and_parent_fsync_failures_leave_unknown_claim(self):
        sync = os.fsync
        for kind in ("file", "directory"):
            # Fresh fake namespace per scenario; never repair production.
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as name:
                root = Path(name)
                root.chmod(0o700)
                base = root / "root" / "sanq-runtime-operator"
                base.mkdir(parents=True, mode=0o700)
                base.parent.chmod(0o700)
                (base / "normal-update.lock").touch(mode=0o600)
                ledger = base / "normal-update-transactions"
                ledger.mkdir(mode=0o700)
                def fail(fd):
                    is_file = stat.S_ISREG(os.fstat(fd).st_mode)
                    if is_file == (kind == "file"):
                        raise OSError("synthetic sync failure")
                    sync(fd)
                with patch.object(admission, "_open_namespace_root",
                                  side_effect=lambda: os.open(root, admission._flags())):
                    with patch.object(admission.os, "fsync", side_effect=fail):
                        with self.assertRaises(OSError):
                            with self.consume():
                                self.fail("unknown durability yielded")
                    self.assertEqual(set(p.name for p in ledger.iterdir()), {"active.json"})
                    self.assertEqual(admission.inspect_local_admission()["status"], "UNKNOWN_BLOCKING")

    def test_consumed_write_failure_leaves_global_claim_no_handle(self):
        write = admission._write
        def fail(parent, name, *args):
            if name != "active.json":
                raise OSError("consumed write failed")
            return write(parent, name, *args)
        with patch.object(admission, "_write", side_effect=fail):
            with self.assertRaises(OSError):
                with self.consume():
                    self.fail("no consumed identity")
        self.assertEqual(set(self.files()), {"active.json"})
        self.assertEqual(admission.inspect_local_admission()["status"], "UNKNOWN_BLOCKING")

    def test_sync_order_global_claim_precedes_consumed_and_yield(self):
        events = []
        sync = os.fsync
        def observe(fd):
            events.append(Path(os.readlink(f"/proc/self/fd/{fd}")).name)
            sync(fd)
        with patch.object(admission.os, "fsync", side_effect=observe):
            with self.consume():
                events.append("YIELD")
        self.assertEqual(events, ["active.json", "normal-update-transactions",
                                 self.txid + ".json", "normal-update-transactions", "YIELD"])

    def test_invalid_lock_objects_refused_without_repair(self):
        outside = self.root / "outside"
        outside.write_bytes(b"outside")
        for kind in ("mode", "content", "hardlink", "symlink", "fifo"):
            with self.subTest(kind=kind):
                self.lock.unlink()
                if kind == "symlink":
                    self.lock.symlink_to(outside)
                elif kind == "hardlink":
                    os.link(outside, self.lock)
                elif kind == "fifo":
                    os.mkfifo(self.lock, 0o600)
                else:
                    self.lock.write_bytes(b"x" if kind == "content" else b"")
                    self.lock.chmod(0o644 if kind == "mode" else 0o600)
                with self.assertRaises((ValueError, OSError)):
                    with self.consume():
                        self.fail("unsafe lock yielded")
                self.assertEqual(self.files(), {})
                self.assertEqual(outside.read_bytes(), b"outside")

    def test_missing_or_unsafe_parent_never_created_or_fixed(self):
        self.ledger.chmod(0o755)
        with self.assertRaises(ValueError):
            with self.consume():
                self.fail("unsafe ledger")
        self.assertEqual(self.ledger.stat().st_mode & 0o777, 0o755)
        self.ledger.chmod(0o700)
        self.ledger.rmdir()
        with self.assertRaises(OSError):
            with self.consume():
                self.fail("missing ledger")
        self.assertFalse(self.ledger.exists())

    def test_ancestor_symlink_owner_and_device_checks(self):
        original = self.ledger.with_name("saved-ledger")
        self.ledger.rename(original)
        self.ledger.symlink_to(original, target_is_directory=True)
        with self.assertRaises((ValueError, OSError)):
            with self.consume():
                self.fail("symlink ledger")
        self.ledger.unlink()
        original.rename(self.ledger)
        with patch.object(admission, "_OWNER", (12345, 12345)):
            with self.assertRaises(ValueError):
                with self.consume():
                    self.fail("wrong owner")
        with ExitStack() as stack:
            fd = os.open(self.lock, os.O_RDONLY)
            stack.callback(os.close, fd)
            with self.assertRaises(ValueError):
                admission._file_key(fd, os.fstat(fd).st_dev + 1)
        self.assertEqual(self.files(), {})

    def test_lock_inode_replacement_detected_without_overwrite(self):
        with self.assertRaisesRegex(ValueError, "changed or replaced"):
            with self.consume() as handle:
                self.lock.rename(self.base / "original-lock")
                self.lock.touch(mode=0o600)
                handle.observation()
        self.assertEqual(set(self.files()), {"active.json", self.txid + ".json"})

    def test_control_corruption_detected_and_readonly_classified(self):
        with self.consume():
            pass
        (self.ledger / (self.txid + ".json")).write_bytes(b"truncated")
        before = self.files()
        for _ in range(2):
            self.assertEqual(admission.inspect_local_admission()["status"], "UNKNOWN_BLOCKING")
        self.assertEqual(self.files(), before)

    def test_extra_orphan_symlink_or_excessive_controls_block_readonly(self):
        for kind in ("extra", "orphan", "symlink", "many"):
            with self.subTest(kind=kind):
                for p in self.ledger.iterdir():
                    p.unlink()
                if kind == "symlink":
                    (self.ledger / "active.json").symlink_to(self.lock)
                else:
                    count = 4 if kind == "many" else 1
                    for i in range(count):
                        path = self.ledger / ("orphan.json" if kind == "orphan" else str(i))
                        path.write_bytes(b"x")
                        path.chmod(0o600)
                names = set(p.name for p in self.ledger.iterdir())
                self.assertEqual(admission.inspect_local_admission()["status"], "UNKNOWN_BLOCKING")
                self.assertEqual(set(p.name for p in self.ledger.iterdir()), names)
                with self.assertRaises(ValueError):
                    with self.consume():
                        self.fail("unknown ledger admitted")

    def test_empty_readonly_observation_writes_nothing_and_has_no_permission(self):
        result = admission.inspect_local_admission()
        self.assertEqual(result["status"], "NO_LOCAL_CLAIM_OBSERVED")
        self.assertIs(result["newAttemptAuthorized"], False)
        self.assertEqual(self.files(), {})
        self.assertEqual(self.lock.read_bytes(), b"")
        for key in admission._FALSE:
            self.assertIs(result[key], False)

    def test_abort_write_failure_retains_original_claim_and_blocks_repeat(self):
        with self.consume() as handle:
            attempt = handle.observation()["attemptId"]
            with patch.object(admission, "_write", side_effect=OSError("abort write unknown")):
                with self.assertRaises(OSError):
                    handle.record_abort(self.receipt(), attempt_id=attempt)
            with self.assertRaisesRegex(ValueError, "already attempted"):
                handle.record_abort(self.receipt(), attempt_id=attempt)
        self.assertEqual(set(self.files()), {"active.json", self.txid + ".json"})

    def test_handle_cannot_pickle_or_cross_process_ownership(self):
        with self.consume() as handle:
            with self.assertRaises(TypeError):
                pickle.dumps(handle)
            with patch.object(admission.os, "getpid", return_value=os.getpid() + 100):
                with self.assertRaisesRegex(ValueError, "another process"):
                    handle.observation()

    def test_original_exception_survives_exit_recheck_problem(self):
        failure = RuntimeError("original failure")
        with self.assertRaises(RuntimeError) as caught:
            with self.consume():
                self.lock.rename(self.base / "displaced-lock")
                raise failure
        self.assertIs(caught.exception, failure)

    def test_failed_attempt_and_inspection_close_all_owned_fds(self):
        before = set(os.listdir("/proc/self/fd"))
        with patch.object(admission.os, "write", side_effect=OSError("synthetic disk error")):
            with self.assertRaises(OSError):
                with self.consume():
                    self.fail("write failed")
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        admission.inspect_local_admission()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_fixed_api_and_real_root_guard(self):
        self.assertEqual(set(inspect.signature(admission.consume_local_attempt).parameters),
                         {"launch_bytes", "request_bytes", "expected_launch_sha256",
                          "expected_request_sha256"})
        self.assertEqual(len(inspect.signature(admission.inspect_local_admission).parameters), 0)
        with patch.object(admission.os, "getuid", return_value=1000):
            with self.assertRaises(ValueError):
                self.real_guard()


    def test_repeated_directory_scans_keep_complete_names(self):
        with self.consume():
            pass
        fd = os.open(self.ledger, admission._flags())
        try:
            for _ in range(4):
                self.assertEqual(admission._names(fd), {"active.json", self.txid + ".json"})
        finally:
            os.close(fd)

    def test_abort_identity_corruption_is_never_finalized(self):
        with self.consume() as handle:
            handle.record_abort(self.receipt(), attempt_id=handle.observation()["attemptId"])
        path = self.ledger / (self.txid + ".abort.json")
        doc = json.loads(path.read_bytes())
        path.write_bytes(admission.canonical({**doc, "attemptId": "0" * 64}))
        before = self.files()
        self.assertEqual(admission.inspect_local_admission()["status"], "UNKNOWN_BLOCKING")
        self.assertEqual(self.files(), before)

    def test_readback_failure_keeps_claim_and_never_yields(self):
        real = os.pread
        def corrupt(fd, size, offset):
            raw = real(fd, size, offset)
            return b"X" + raw[1:] if raw else raw
        with patch.object(admission.os, "pread", side_effect=corrupt):
            with self.assertRaisesRegex(ValueError, "readback"):
                with self.consume():
                    self.fail("corrupt readback yielded")
        self.assertEqual(set(self.files()), {"active.json"})
        self.assertEqual(admission.inspect_local_admission()["status"], "UNKNOWN_BLOCKING")

    def test_changed_control_or_ledger_edge_detected_while_handle_held(self):
        with self.assertRaises((ValueError, OSError)):
            with self.consume() as handle:
                self.ledger.rename(self.base / "displaced-ledger")
                self.ledger.mkdir(mode=0o700)
                handle.observation()
        self.assertEqual(set(p.name for p in (self.base / "displaced-ledger").iterdir()),
                         {"active.json", self.txid + ".json"})


if __name__ == "__main__":
    unittest.main()
