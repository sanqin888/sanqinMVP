"""Offline real-file job durability and revalidation, without Docker or DB access."""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
from release_contract import ReleaseContractError
from test_deployment_plan import inputs, NOW, NEW


class ReadOnlyJobTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.parent = Path(temporary.name)
        self.parent.chmod(0o700)
        self.jobs, self.plans = self.parent / "jobs", self.parent / "plans"
        self.jobs.mkdir(mode=0o700)
        self.plans.mkdir(mode=0o700)
        self.maintenance = self.parent / "maintenance"
        self.maintenance.mkdir(mode=0o700)
        for module, name, value in (
            (job, "JOB_DIR", self.jobs), (storage, "PLAN_DIR", self.plans),
            (storage, "OWNER_UID", os.getuid())):
            patcher = patch.object(module, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.object(job.os, "geteuid", return_value=0)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.time = "2026-10-26T16:10:00Z"
        self.raw, self.identity = self.save_original()
        self.observer = Mock(return_value=self.fresh())
        self.target = self.jobs / (self.identity + ".json")

    def fresh(self, **changes):
        values = inputs()
        values.update(changes)
        return plan.create_plan(created_at=self.time, **values)

    def save_original(self, created_at=NOW):
        raw = plan.create_plan(created_at=created_at, **inputs())
        identity = json.loads(raw)["planId"]
        storage.save_plan(raw)
        return raw, identity

    def precheck(self, identity=None, **kwargs):
        return job.precheck(identity or self.identity, observe=self.observer,
                            now=lambda: self.time, **kwargs)

    def running(self):
        return {"schemaVersion": 1, "kind": job.KIND, "planId": self.identity,
                "attemptId": "f" * 32, "phase": "REVALIDATING",
                "createdAt": self.time, "updatedAt": self.time,
                "errorCode": None, "canExecute": False}

    def seed_running(self):
        with job._locked_directory() as root:
            job._write(root, self.running(), create=True)

    def test_precheck_retains_plan_and_saves_only_read_only_ready(self):
        result = self.precheck()
        self.observer.assert_called_once_with(NEW, cache_images=False)
        self.assertEqual(result, job.status(self.identity))
        self.assertEqual(result["phase"], "READY")
        self.assertFalse(result["canExecute"])
        self.assertEqual(result["kind"], job.KIND)
        self.assertNotIn("current", result)
        self.assertNotIn("previous", result)
        self.assertEqual(storage.load_plan(self.identity), self.raw)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)

    def test_intention_is_readable_and_locks_are_held_during_observation(self):
        def observe(*args, **kwargs):
            self.assertEqual(job.status(self.identity)["phase"], "REVALIDATING")
            with self.assertRaises(ReleaseContractError):
                with job._locked_directory():
                    self.fail("second job lock acquired")
            with self.assertRaises(ReleaseContractError):
                with storage.preparation_lock():
                    self.fail("second probe lock acquired")
            return self.fresh()
        self.observer.side_effect = observe
        self.precheck()
        self.assertEqual(job.status(self.identity)["phase"], "READY")

    def test_current_candidate_backup_and_history_drift_are_rejected(self):
        base = inputs()
        history = base["history"] + [{
            "name": base["inventory"][1]["name"],
            "sha256": base["inventory"][1]["sha256"], "state": "applied"}]
        cases = [
            {"current": {**base["current"], "configurationSha256": "f" * 64}},
            {"candidate": {**base["candidate"], "ciRunId": 99}},
            {"backup": {**base["backup"], "bytes": base["backup"]["bytes"] + 1}},
            {"history": history, "pending": []},
        ]
        for index, changes in enumerate(cases):
            raw, identity = self.save_original(f"2026-10-26T16:00:0{index + 1}Z")
            self.observer.return_value = self.fresh(**changes)
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                self.precheck(identity)
            value = job.status(identity)
            self.assertEqual(value["phase"], "BLOCKED")
            self.assertEqual(value["errorCode"], "PRECHECK_FAILED")
            self.assertEqual(storage.load_plan(identity), raw)

    def test_expired_backup_and_backward_clock_block_before_observation(self):
        for index, stamp in enumerate(("2026-10-28T16:10:00Z", "2026-10-26T15:59:00Z")):
            raw, identity = self.save_original(f"2026-10-26T16:00:0{index + 1}Z")
            with self.subTest(stamp=stamp), self.assertRaises(ReleaseContractError):
                job.precheck(identity, observe=self.observer, now=lambda: stamp)
            self.assertEqual(job.status(identity)["phase"], "BLOCKED")
        self.observer.assert_not_called()

    def test_stale_or_future_observation_clock_blocks(self):
        for index, stamp in enumerate((NOW, "2026-10-26T16:11:00Z")):
            _, identity = self.save_original(f"2026-10-26T16:00:0{index + 1}Z")
            self.observer.return_value = plan.create_plan(created_at=stamp, **inputs())
            with self.subTest(stamp=stamp), self.assertRaises(ReleaseContractError):
                self.precheck(identity)
            self.assertEqual(job.status(identity)["phase"], "BLOCKED")

    def test_observation_error_records_only_a_fixed_code(self):
        message = "{}={}".format("JWT_SECRET", "private-value")
        self.observer.side_effect = ValueError(message)
        with self.assertRaises(ValueError):
            self.precheck()
        value = job.status(self.identity)
        self.assertEqual(value["errorCode"], "PRECHECK_FAILED")
        self.assertNotIn("private-value", self.target.read_text())

    def test_interrupt_is_recorded_and_propagated_without_business_cleanup(self):
        self.observer.side_effect = KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.precheck()
        value = job.status(self.identity)
        self.assertEqual(value["phase"], "BLOCKED")
        self.assertEqual(value["errorCode"], "INTERRUPTED_OBSERVATION")

    def test_initial_sync_failure_prevents_any_observation(self):
        with patch.object(job.os, "fsync", side_effect=OSError("sync failed")):
            with self.assertRaises(OSError):
                self.precheck()
        self.observer.assert_not_called()
        self.assertEqual(job.status(self.identity)["phase"], "REVALIDATING")

    def test_partial_initial_record_is_preserved_and_blocks_another_job(self):
        real_write = os.write
        calls = 0
        def fail_after_prefix(fd, data):
            nonlocal calls
            calls += 1
            if calls == 1:
                return real_write(fd, data[:9])
            raise OSError("disk failure")
        with patch.object(job.os, "write", side_effect=fail_after_prefix):
            with self.assertRaises(OSError):
                self.precheck()
        original = self.target.read_bytes()
        self.assertEqual(len(original), 9)
        _, identity = self.save_original("2026-10-26T16:00:01Z")
        with self.assertRaises((ReleaseContractError, ValueError)):
            self.precheck(identity)
        self.assertEqual(self.target.read_bytes(), original)
        self.observer.assert_not_called()

    def test_final_directory_sync_unknown_does_not_retry_or_write_failed(self):
        real_sync = os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 4:  # READY rename happened; directory durability unknown.
                raise OSError("directory sync failed")
            return real_sync(fd)
        with patch.object(job.os, "fsync", side_effect=sync):
            with self.assertRaises(OSError):
                self.precheck()
        self.assertEqual(count, 4)
        self.assertEqual(job.status(self.identity)["phase"], "READY")
        self.assertFalse(job.status(self.identity)["canExecute"])
        self.observer.assert_called_once()

    def test_replace_failure_keeps_pending_and_partial_evidence(self):
        with patch.object(job.os, "replace", side_effect=OSError("rename failed")):
            with self.assertRaises(OSError):
                self.precheck()
        self.assertEqual(job.status(self.identity)["phase"], "REVALIDATING")
        leftovers = list(self.jobs.glob(".job-*.tmp"))
        self.assertEqual(len(leftovers), 1)
        _, identity = self.save_original("2026-10-26T16:00:01Z")
        with self.assertRaises(ReleaseContractError):
            self.precheck(identity)
        self.assertTrue(leftovers[0].exists())

    def test_same_plan_attempt_cannot_be_overwritten_or_replayed(self):
        self.precheck()
        original = self.target.read_bytes()
        with self.assertRaises(FileExistsError):
            self.precheck()
        self.assertEqual(self.target.read_bytes(), original)
        self.observer.assert_called_once()

    def test_unfinished_attempt_requires_exact_operator_acknowledgement(self):
        self.seed_running()
        _, identity = self.save_original("2026-10-26T16:00:01Z")
        with self.assertRaises(ReleaseContractError):
            self.precheck(identity)
        with self.assertRaises(ReleaseContractError):
            job.abandon(self.identity, "a" * 32, now=lambda: self.time)
        result = job.abandon(self.identity, "f" * 32, now=lambda: self.time)
        self.assertEqual(result["errorCode"], "ABANDONED_OBSERVATION")
        self.assertFalse(result["canExecute"])
        self.assertEqual(self.precheck(identity)["phase"], "READY")

    def test_abandon_cannot_take_a_live_lock_or_change_a_finished_attempt(self):
        self.seed_running()
        with job._locked_directory():
            with self.assertRaises(ReleaseContractError):
                job.abandon(self.identity, "f" * 32, now=lambda: self.time)
        job.abandon(self.identity, "f" * 32, now=lambda: self.time)
        with self.assertRaises(ReleaseContractError):
            job.abandon(self.identity, "f" * 32, now=lambda: self.time)

    def test_unknown_execution_kind_cannot_be_abandoned(self):
        self.seed_running()
        value = {**self.running(), "kind": "execution-job", "canExecute": True}
        self.target.write_bytes(plan._canonical(value) + b"\n")
        before = self.target.read_bytes()
        with self.assertRaises(ReleaseContractError):
            job.abandon(self.identity, "f" * 32, now=lambda: self.time)
        self.assertEqual(self.target.read_bytes(), before)

    def test_status_rejects_private_mode_links_and_wrong_identity(self):
        self.precheck()
        self.target.chmod(0o640)
        with self.assertRaises(ReleaseContractError):
            job.status(self.identity)
        self.target.chmod(0o600)
        alias = self.parent / "alias"
        os.link(self.target, alias)
        with self.assertRaises(ReleaseContractError):
            job.status(self.identity)
        alias.unlink()
        self.target.rename(alias)
        self.target.symlink_to(alias)
        with self.assertRaises(OSError):
            job.status(self.identity)
        with self.assertRaises(ReleaseContractError):
            job.status("../state")

    def test_invalid_duplicate_or_extra_job_fields_are_rejected(self):
        self.seed_running()
        valid = self.running()
        candidates = [b'{"planId":"a","planId":"b"}\n',
                      plan._canonical({**valid, "extra": True}) + b"\n",
                      plan._canonical({**valid, "canExecute": True}) + b"\n",
                      plan._canonical({**valid, "phase": "ACTIVE"}) + b"\n"]
        for raw in candidates:
            self.target.write_bytes(raw)
            with self.subTest(raw=raw[:30]), self.assertRaises((ReleaseContractError, ValueError)):
                job.status(self.identity)

    def test_unprovisioned_directory_and_nonroot_never_start_observation(self):
        self.jobs.rmdir()
        with self.assertRaises(OSError):
            self.precheck()
        self.assertFalse(self.jobs.exists())
        with patch.object(job.os, "geteuid", return_value=1000):
            with self.assertRaises(ReleaseContractError):
                self.precheck()
        self.observer.assert_not_called()

    def test_history_budget_and_unknown_partial_file_block(self):
        with patch.object(job, "MAX_JOBS", 1):
            self.precheck()
            _, identity = self.save_original("2026-10-26T16:00:01Z")
            with self.assertRaises(ReleaseContractError):
                self.precheck(identity)
        (self.jobs / ".unreviewed.tmp").write_bytes(b"evidence")
        with self.assertRaises(ReleaseContractError):
            self.precheck(identity)
        self.observer.assert_called_once()

    def test_maintenance_evidence_blocks_new_precheck_before_record_or_observation(self):
        (self.maintenance / "active.json").write_bytes(b"retained")
        with self.assertRaises(ReleaseContractError):
            self.precheck()
        self.assertFalse(self.target.exists())
        self.observer.assert_not_called()

    def test_bounded_cleanup_lock_wait_keeps_default_nonblocking(self):
        with job._locked_directory():
            with patch.object(job.time, "monotonic", side_effect=[0, 0.2]), \
                 self.assertRaises(ReleaseContractError):
                with job._locked_directory(wait_seconds=0.1):
                    self.fail("busy lock acquired")
        with self.assertRaises(ReleaseContractError):
            with job._locked_directory(wait_seconds=11):
                self.fail("excessive wait accepted")

    def test_busy_plan_resource_lock_leaves_a_blocked_job(self):
        with storage.preparation_lock():
            with self.assertRaises(ReleaseContractError):
                self.precheck()
        self.assertEqual(job.status(self.identity)["phase"], "BLOCKED")
        self.observer.assert_not_called()

    def test_cli_status_and_errors_never_echo_arbitrary_failure_text(self):
        self.precheck()
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(job.main(["status", self.identity]), 0)
        self.assertEqual(json.loads(output.getvalue())["phase"], "READY")
        message = "{}={}".format("JWT_SECRET", "private-value")
        with patch.object(job, "precheck", side_effect=ValueError(message)), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(job.main(["precheck", self.identity]), 1)
        self.assertNotIn("private-value", output.getvalue())
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            job.main(["apply", self.identity])
        self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
