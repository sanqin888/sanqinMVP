"""Restricted writer tests, private fake namespace and real FD/fsync only."""
import json
import multiprocessing
import os
from pathlib import Path
import signal
import stat
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_history_writer as writer
from normal_runtime_launch import canonical, digest


def _hold(pipe, launch, request):
    try:
        with writer.consume_v2_local_attempt(launch, request,
                expected_launch_sha256=digest(launch), expected_request_sha256=digest(request)):
            pipe.send("HELD")
            pipe.recv()
    except (ValueError, OSError):
        pipe.send("BLOCKED")
    finally:
        pipe.close()


class RestrictedWriterTests(unittest.TestCase):
    def setUp(self):
        import test_normal_runtime_history_review as history_fixture
        import test_normal_runtime_readonly_review as input_fixture
        self.disk = history_fixture.HistoryReviewTests()
        self.disk.setUp()
        self.addCleanup(self.disk.doCleanups)
        self.inputs = input_fixture.ReadonlyReviewTests()
        self.inputs.setUp()
        self.addCleanup(self.inputs.doCleanups)
        self.tree = self.disk.tree

    def call(self, **changes):
        return writer.consume_v2_local_attempt(self.inputs.launch, self.inputs.request,
            **{"expected_launch_sha256": digest(self.inputs.launch),
               "expected_request_sha256": digest(self.inputs.request), **changes})

    def receipt(self):
        return canonical({"schema": "sanq.runtime.normal-update-flow.v1", "status": "ABORTED",
            "requestSha256": digest(self.inputs.request),
            "launchMaterialsSha256": digest(self.inputs.launch), "flowCompleted": False,
            "readyToInstall": False, "authorizedToMutateProduction": False, "decision": "BLOCKED"})

    def test_claim_and_abort_match_reader_without_authority(self):
        with self.call() as handle:
            result = handle.observation()
            self.disk.assert_blocked_flags(result)
            first = (self.tree / "00000001.json").read_bytes()
            self.assertEqual(json.loads(first)["payload"]["requestSha256"], digest(self.inputs.request))
            proof = handle.record_abort(self.receipt(), attempt_id=result["attemptId"])
            second = (self.tree / "00000002.json").read_bytes()
            self.assertEqual(proof, digest(second))
            self.assertEqual(json.loads(second)["previousSha256"], digest(first))
        self.assertEqual(self.disk.inspect()["status"], "UNRESOLVED_WITH_ABORT_OBSERVATION")
        with self.assertRaises(ValueError):
            handle.observation()

    def test_second_context_and_legacy_entry_refused(self):
        with self.call():
            with self.assertRaises(ValueError):
                with self.disk.consume_legacy():
                    self.fail("legacy bypass")
        before = self.disk.snapshot()
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("reentry")
        self.assertEqual(before, self.disk.snapshot())

    def test_existing_disposition_history_is_not_permission(self):
        self.disk.append(self.disk.event())
        self.disk.append(self.disk.event("DISPOSITION_OBSERVATION"))
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("trusted disposition claim")

    def test_nonempty_legacy_blocks_before_creation(self):
        (self.disk.legacy / "unknown").write_bytes(b"x")
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("legacy ignored")
        self.assertEqual(list(self.tree.iterdir()), [])

    def test_invalid_pin_and_missing_directory_have_no_creation(self):
        with self.assertRaises(ValueError):
            with self.call(expected_request_sha256="0" * 64):
                self.fail("bad pin")
        self.tree.rmdir()
        with self.assertRaises(OSError):
            with self.call():
                self.fail("auto provision")
        self.assertFalse(self.tree.exists())

    def test_short_writes_complete(self):
        write = os.write
        with patch.object(os, "write", side_effect=lambda fd, raw: write(fd, raw[:7])):
            with self.call():
                pass
        self.assertEqual(self.disk.inspect()["status"], "UNRESOLVED_ATTEMPT")

    def test_zero_write_keeps_blocking_tail(self):
        with patch.object(os, "write", return_value=0):
            with self.assertRaises(ValueError):
                with self.call():
                    self.fail("zero write yielded")
        self.assertEqual((self.tree / "00000001.json").read_bytes(), b"")
        self.assertEqual(self.disk.inspect()["status"], "UNKNOWN_BLOCKING")
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("retry")

    def test_file_fsync_failure_keeps_event_and_no_handle(self):
        sync = os.fsync
        def fail(fd):
            if stat.S_ISREG(os.fstat(fd).st_mode):
                raise OSError("file sync unknown")
            sync(fd)
        with patch.object(os, "fsync", side_effect=fail):
            with self.assertRaises(OSError):
                with self.call():
                    self.fail("sync failure yielded")
        self.assertTrue((self.tree / "00000001.json").exists())

    def test_parent_fsync_failure_blocks_retry(self):
        sync = os.fsync
        def fail(fd):
            if stat.S_ISDIR(os.fstat(fd).st_mode):
                raise OSError("parent sync unknown")
            sync(fd)
        with patch.object(os, "fsync", side_effect=fail):
            with self.assertRaises(OSError):
                with self.call():
                    self.fail("directory sync failure")
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("retry")

    def test_sync_order_and_only_two_events(self):
        sync, events = os.fsync, []
        def record(fd):
            events.append(Path(os.readlink(f"/proc/self/fd/{fd}")).name)
            sync(fd)
        with patch.object(os, "fsync", side_effect=record):
            with self.call() as handle:
                events.append("YIELD")
                handle.record_abort(self.receipt(), attempt_id=handle.observation()["attemptId"])
        self.assertEqual(events, ["00000001.json", "normal-update-history-v2", "YIELD",
                                  "00000002.json", "normal-update-history-v2"])

    def test_abort_wrong_owner_duplicate_and_unknown_attempt_refused(self):
        with self.call() as handle:
            attempt = handle.observation()["attemptId"]
            with self.assertRaises(ValueError):
                handle.record_abort(self.receipt(), attempt_id="f" * 64)
            with patch.object(writer.local, "_write", side_effect=OSError("unknown abort")):
                with self.assertRaises(OSError):
                    handle.record_abort(self.receipt(), attempt_id=attempt)
            with self.assertRaises(ValueError):
                handle.record_abort(self.receipt(), attempt_id=attempt)
        self.assertEqual(len(list(self.tree.iterdir())), 1)

    def test_no_disposition_append_even_via_private_method(self):
        with self.call() as handle:
            with self.assertRaises(ValueError):
                handle._append("DISPOSITION_OBSERVATION", {})
        self.assertEqual(len(list(self.tree.iterdir())), 1)

    def test_same_bytes_replacement_or_legacy_creation_blocks_live_handle(self):
        with self.assertRaises(ValueError):
            with self.call() as handle:
                path = self.tree / "00000001.json"
                raw = path.read_bytes()
                path.unlink()
                path.write_bytes(raw)
                path.chmod(0o600)
                handle.observation()

    def test_exception_retains_original_and_consumption(self):
        error = RuntimeError("original")
        with self.assertRaises(RuntimeError) as caught:
            with self.call():
                raise error
        self.assertIs(caught.exception, error)
        self.assertEqual(len(list(self.tree.iterdir())), 1)

    def test_fd_cleanup_and_no_public_path_or_finalizer(self):
        import inspect
        before = set(os.listdir("/proc/self/fd"))
        with self.call():
            pass
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        self.assertEqual(set(inspect.signature(writer.consume_v2_local_attempt).parameters),
                         {"launch_bytes", "request_bytes", "expected_launch_sha256", "expected_request_sha256"})

    def test_independent_process_mutex_and_sigkill_retains_consumption(self):
        ctx = multiprocessing.get_context("fork")
        parent, child = ctx.Pipe()
        process = ctx.Process(target=_hold, args=(child, self.inputs.launch, self.inputs.request))
        process.start()
        child.close()
        try:
            self.assertTrue(parent.poll(15))
            self.assertEqual(parent.recv(), "HELD")
            with self.assertRaisesRegex(ValueError, "lock busy"):
                with self.call():
                    self.fail("concurrent writer")
            os.kill(process.pid, signal.SIGKILL)
            process.join(timeout=10)
            self.assertEqual(process.exitcode, -signal.SIGKILL)
            with self.assertRaises(ValueError):
                with self.call():
                    self.fail("replayed killed writer")
            self.assertEqual(self.disk.inspect()["status"], "UNRESOLVED_ATTEMPT")
        finally:
            if process.is_alive():
                process.kill()
            process.join(timeout=10)
            parent.close()


if __name__ == "__main__":
    unittest.main()
