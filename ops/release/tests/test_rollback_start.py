"""Offline exact-ID rollback startup/readiness; no real Docker, SQL, HTTP or systemd."""
import contextlib
import copy
import hashlib
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_rollback_create as create_fixtures
import test_start_candidates as start_fixtures
import test_deployment_plan as fixtures
import start_candidates as starter
import maintenance_guard as guard
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
from release_contract import ReleaseContractError


class RollbackStartTests(unittest.TestCase):
    def setUp(self):
        self.case = create_fixtures.RollbackCreateTests(
            "test_exact_old_digest_creation_keeps_full_history_and_records_all_ids_without_start")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.case.prepare()
        self.identity = self.case.identity
        self.original = copy.deepcopy(guard.status())
        self.attempt, self.approval = self.original["attemptId"], self.case.approval
        self.controller, self.info = self.case.controller, self.case.rb.base.info
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.bindings = self.stack.enter_context(patch.object(starter, "_pending_and_config",
                                                             return_value=self.case.expanded))
        self.calls, self.starts = [], []
        self.health = "healthy"
        self.fail_start = self.fail_stop = None
        self.readiness_error = None
        self.replace_after_readiness = self.db_after_readiness = False
        self.history_after_readiness = self.policy_after_readiness = self.dead_after_readiness = False
        self.clock, self.pause = Mock(return_value=0), Mock()

    def command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:2] == ["docker", "start"]:
            record = guard.status()
            self.assertEqual((record["schemaVersion"], record["phase"]), (6, "STARTING_CANDIDATES"))
            self.assertEqual(record["rollback"], self.original["rollback"])
            self.assertIn(args[-1], self.case.ids.values())
            self.assertEqual(kwargs["timeout"], 30)
            with self.assertRaises(ReleaseContractError):
                with job._locked_directory():
                    pass
            with self.assertRaises(ReleaseContractError):
                with storage.preparation_lock():
                    pass
            self.starts.append(args[-1])
            self.info[args[-1]]["State"].update(Status="running", Running=True, Dead=False,
                                               Health={"Status": self.health})
            if args[-1] == self.fail_start:
                raise ReleaseContractError("start effect unknown")
            return ""
        if args[:2] == ["docker", "stop"] and args[-1] == self.fail_stop:
            raise ReleaseContractError("stop outcome unconfirmed")
        if args[0] == "bash":
            self.assertEqual(args, ["bash", str(self.controller.ROOT / "ops/verify-runtime-readiness.sh"),
                                    str(self.controller.ENV), "https://sanq.ca"])
            self.assertEqual(kwargs["timeout"], 300)
            if self.readiness_error:
                raise self.readiness_error
            if self.replace_after_readiness:
                self.case.roles["api"] = ["7" * 64]
            if self.db_after_readiness:
                self.case.change_db = True
            if self.history_after_readiness:
                self.case.rb.history.return_value = self.case.rb.original["migrationHistory"][:1]
            if self.policy_after_readiness:
                self.info[self.case.ids["api"]]["HostConfig"]["RestartPolicy"]["Name"] = "always"
            if self.dead_after_readiness:
                self.info[self.case.ids["api"]]["State"]["Dead"] = True
            return ""
        return self.case.command(args, **kwargs)

    def start(self, **kwargs):
        return starter.start_rollback_and_verify(self.identity, kwargs.pop("attempt", self.attempt),
            kwargs.pop("approval", self.approval), controller=self.controller, run=self.command,
            fetch=Mock(), now=kwargs.pop("now", lambda: self.case.rb.base.time),
            clock=self.clock, pause=self.pause, **kwargs)

    def assert_incident(self, code="TASK_FAILED_WRITERS_STOPPED"):
        record = guard.status()
        self.assertEqual(record["phase"], "INCIDENT")
        self.assertEqual(record["errorCode"], code)
        self.assertEqual(record["rollback"], self.original["rollback"])
        if code == "TASK_FAILED_WRITERS_STOPPED":
            self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()
        self.controller.write_state.assert_not_called()
        self.controller.atomic_write.assert_not_called()

    def test_start_saved_old_ids_once_and_keep_pending_history_scope_and_restart_inhibition(self):
        raw = storage.load_rollback_review(self.identity)
        result = self.start()
        record = guard.status()
        self.assertEqual(result["outcome"], "CANDIDATES_READY")
        self.assertFalse(result["canExecute"])
        self.assertEqual(record["phase"], "CANDIDATES_READY")
        self.assertEqual(record["schemaVersion"], 6)
        self.assertEqual(record["candidate"], self.original["candidate"])
        self.assertEqual(record["rollback"], self.original["rollback"])
        self.assertEqual(record["candidate"]["release"]["sourceSha"], fixtures.OLD)
        self.assertEqual(self.starts, [self.case.ids[name] for name in guard.SERVICES])
        self.assertEqual(storage.load_rollback_review(self.identity), raw)
        self.assertEqual(self.bindings.call_count, 3)
        for info in self.info.values():
            self.assertEqual(info["HostConfig"]["RestartPolicy"], {"Name": "no", "MaximumRetryCount": 0})
        self.assertEqual(self.case.pending_writes, [(fixtures.NEW, fixtures.OLD)])
        self.assertEqual(len(self.case.creates), 1)
        self.controller.write_state.assert_not_called()
        self.controller.atomic_write.assert_not_called()
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any(word in row for row in self.calls for word in ("create", "up", "pull", "build")))
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assertEqual(len(self.starts), 3)

    def test_missing_wrong_boolean_acknowledgement_or_attempt_never_starts(self):
        for approval in (None, True, self.identity, "0" * 64):
            with self.subTest(approval=approval), self.assertRaises(ReleaseContractError):
                self.start(approval=approval)
        with self.assertRaises(ReleaseContractError):
            self.start(attempt="0" * 32)
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status(), self.original)

    def test_ordinary_start_cannot_adopt_rollback_even_when_no_pending_sql(self):
        with self.assertRaises(ReleaseContractError):
            starter.start_and_verify(self.identity, self.attempt, controller=self.controller,
                run=self.command, fetch=Mock(), now=lambda: self.case.rb.base.time)
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status(), self.original)

    def test_config_backup_full_history_or_target_proof_drift_blocks_before_start_intent(self):
        self.bindings.side_effect = ReleaseContractError("pending/config changed")
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.bindings.side_effect = None
        for observer in (self.case.rb.backup, self.case.rb.history, self.case.rb.proof):
            original = observer.return_value
            observer.return_value = {}
            with self.assertRaises(ReleaseContractError):
                self.start()
            observer.return_value = original
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status(), self.original)

    def test_history_helper_requires_exact_rollback_kind_scope_and_all_applied_rows(self):
        original = self.case.rb.original
        history = original["migrationHistory"]
        self.assertTrue(starter._application_history(original, self.original, history, Mock()))
        for wrong in (history[:1], history + [{**history[0], "state": "rolled-back"}]):
            with self.assertRaises(ReleaseContractError):
                starter._application_history(original, self.original, wrong, Mock())
        for changes in ({"planId": "0" * 64}, {"observedApplicationSha": fixtures.OLD},
                        {"rollback": {**self.original["rollback"], "approvalSha256": "0" * 64}}):
            with self.assertRaises(ReleaseContractError):
                starter._application_history(original, {**self.original, **changes}, history, Mock())
        raw, identity = fixtures.prepared()
        with self.assertRaises(ReleaseContractError):
            starter._application_history(plan.validate_plan(raw, identity), self.original, history, Mock())

    def test_previously_started_or_replaced_candidate_is_not_replayed_or_adopted(self):
        self.info[self.case.ids["api"]]["State"].update(Status="exited", Running=False)
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.info[self.case.ids["api"]]["State"]["Status"] = "created"
        self.case.roles["api"] = ["7" * 64]
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status(), self.original)

    def test_unknown_start_after_effect_stops_only_saved_writers_and_keeps_incident(self):
        self.fail_start = self.case.ids["ubereats-worker"]
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assertEqual(len(self.starts), 2)
        self.assert_incident()

    def test_unhealthy_candidate_stops_all_saved_writers_without_reopening(self):
        self.health = "unhealthy"
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_starting_health_can_become_healthy_with_bounded_wait(self):
        self.health = "starting"
        def healthy(_):
            for info in self.info.values():
                info["State"]["Health"]["Status"] = "healthy"
        self.pause.side_effect = healthy
        self.assertEqual(self.start()["outcome"], "CANDIDATES_READY")
        self.pause.assert_called_once_with(2)

    def test_health_deadline_does_not_sleep_or_claim_ready(self):
        self.health = "starting"
        self.clock.side_effect = [0, 91]
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.pause.assert_not_called()
        self.assert_incident()

    def test_python_interrupt_does_not_clear_maintenance(self):
        self.readiness_error = KeyboardInterrupt()
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_readiness_failure_stops_saved_candidates_and_keeps_pending(self):
        self.readiness_error = ReleaseContractError("readiness failed")
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_late_config_drift_before_start_intent_issues_no_start(self):
        self.bindings.side_effect = [self.case.expanded, {**self.case.expanded, "name": "other"}]
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status(), self.original)

    def test_readiness_failure_with_unconfirmed_stop_stays_fenced(self):
        self.readiness_error = ReleaseContractError("readiness failed")
        self.fail_stop = self.case.ids["api"]
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.start()
        self.assert_incident("FENCE_UNCONFIRMED")
        self.assertTrue(self.info[self.case.ids["api"]]["State"]["Running"])

    def test_unexpected_writer_after_readiness_is_never_stopped_by_guessed_id(self):
        self.replace_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident("FENCE_UNCONFIRMED")
        self.assertNotIn("7" * 64, [row[-1] for row in self.calls
                                   if row[:2] in (["docker", "stop"], ["docker", "update"])])

    def test_database_drift_after_readiness_stops_candidates_and_keeps_pending(self):
        self.db_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_full_history_drift_after_readiness_cannot_be_hidden_by_old_image_inventory(self):
        self.history_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()
        self.assertEqual(len(self.case.rb.original["migrationInventory"]), 2)
        self.assertEqual(len(self.case.rb.original["targetMigrationInventory"]), 1)

    def test_restart_policy_drift_after_readiness_blocks_ready(self):
        self.policy_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_dead_candidate_after_readiness_is_not_accepted_as_running(self):
        self.dead_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_initial_start_intention_sync_unknown_never_issues_start(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("start intent unknown")):
            with self.assertRaises(OSError):
                self.start()
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_final_ready_sync_unknown_preserves_actual_record_and_stops_without_rewrite(self):
        real_sync = os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 4:
                raise OSError("ready directory sync unknown")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaisesRegex(ReleaseContractError, "durability unknown"):
                self.start()
        self.assertEqual(count, 4)
        self.assertEqual(guard.status()["phase"], "CANDIDATES_READY")
        self.assertTrue(all(not info["State"]["Running"] for info in self.info.values()))
        self.assertEqual(guard.status()["rollback"], self.original["rollback"])
        self.assertEqual(len(self.starts), 3)
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.controller.write_state.assert_not_called()

    def test_root_both_locks_and_expired_backup_block_before_start(self):
        with patch.object(guard.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.start()
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.start()
        with storage.preparation_lock(), self.assertRaises(ReleaseContractError):
            self.start()
        with self.assertRaises(ReleaseContractError):
            self.start(now=lambda: "2026-10-27T17:00:01Z")
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status(), self.original)


class RollbackPendingBindingTests(unittest.TestCase):
    def test_real_binding_accepts_old_target_pending_with_original_env_and_rejects_wrong_direction(self):
        case = start_fixtures.PendingBindingTests(
            "test_pending_binding_requires_exact_state_env_manifest_runtime_and_config")
        case.setUp()
        self.addCleanup(case.doCleanups)
        case.env = ("SANQ_IMAGE_SHA=" + fixtures.NEW + "\n").encode()
        candidate = copy.deepcopy(fixtures.inputs()["candidate"])
        candidate["sourceSha"] = fixtures.OLD
        for name, image in candidate["images"].items():
            image["ref"] = "ghcr.io/sanqin888/" + name + ":" + fixtures.OLD
        case.original["candidate"] = candidate
        case.original["current"]["applicationSha"] = fixtures.NEW
        case.config = hashlib.sha256(case.env + b"\0rendered-compose\0" +
                                     plan._canonical(case.expanded)).hexdigest()
        case.original["current"]["configurationSha256"] = case.config
        case.state.update(current=fixtures.OLD, previous=fixtures.NEW)
        self.assertEqual(case.binding(), case.expanded)
        case.state["current"] = fixtures.NEW
        with self.assertRaises(ReleaseContractError):
            case.binding()


if __name__ == "__main__":
    unittest.main()
