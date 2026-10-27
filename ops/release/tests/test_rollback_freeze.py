"""Offline exact-previous maintenance. No real Docker, SQL, systemd or production files."""
import contextlib
import copy
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_maintenance_guard as maintenance_fixtures
import test_rollback_review as review_fixtures
import test_deployment_plan as fixtures
import maintenance_guard as guard
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
from release_contract import ReleaseContractError


class RollbackFreezeTests(unittest.TestCase):
    def setUp(self):
        self.base = maintenance_fixtures.MaintenanceFlowTests(
            "test_original_policies_persist_before_changes_and_all_writers_confirm_stopped")
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.review = review_fixtures.RollbackReviewTests(
            "test_review_binds_original_state_and_lists_extra_sql_without_authority")
        self.review.setUp()
        self.files = {name: b"fixed runtime fixture" for name in plan.RUNTIME_FILES}
        self.review.values["runtime_pins"] = plan.runtime_contract(self.files, self.files)
        self.raw, self.identity = self.review.make()
        storage.save_rollback_review(self.raw)
        self.base.identity = self.identity
        self.original = plan.validate_rollback_review(self.raw, self.identity)
        self.approval = plan.rollback_review_summary(self.raw, self.identity)["compatibilityApprovalSha256"]
        self.observer = Mock(return_value=plan.create_rollback_review(
            release_state=self.review.state_bytes(), target_inventory=self.review.target_inventory,
            created_at=self.base.time, **self.review.values))
        self.controller = self.base.controller
        self.controller.STATE = self.base.parent / "original-state"
        for service, identifier in self.base.ids.items():
            name = "sanq-web" if service == "web" else "sanq-api"
            info = self.base.info[identifier]
            info["Config"]["Image"] = f"ghcr.io/sanqin888/{name}:{fixtures.NEW}"
            info["State"].update(Dead=False, Health={"Status": "unhealthy"})
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.proof = self.replace(guard.release, "verify_exact_rollback", return_value=self.original["candidate"])
        self.snapshot = self.replace(guard.collector, "_snapshot", return_value=(
            self.original["current"], self.files, self.original["environment"]))
        self.private = self.replace(guard.collector, "_private_bytes", return_value=self.review.state_bytes())
        self.history = self.replace(guard.collector, "_history", return_value=self.original["migrationHistory"])
        self.backup = self.replace(guard.collector, "_backup", return_value=self.original["backup"])
        self.db_id = "9" * 64
        self.db = {"Id": self.db_id, "Image": "sha256:" + "5" * 64,
            "State": {"Running": True}, "Config": {"Labels": {
                "com.docker.compose.project": "sanq-app", "com.docker.compose.service": "db"}},
            "Mounts": [{"Type": "volume", "Name": "sanq-app_pgdata",
                        "Destination": "/var/lib/postgresql/data"}]}
        self.extra = {}
        self.extra_after_arm = False
        self.extra_after_stop = False
        self.fail_initial_stop = False
        self.db_after_arm = False

    def replace(self, owner, name, **kwargs):
        return self.stack.enter_context(patch.object(owner, name, **kwargs))

    def command(self, args, **kwargs):
        if args[:2] == ["docker", "compose"] and args[-1] == "db":
            self.base.calls.append(args[:])
            return self.db_id
        if args[:2] == ["docker", "inspect"] and args[-1] == self.db_id:
            self.base.calls.append(args[:])
            value = copy.deepcopy(self.db)
            if self.db_after_arm and self.base.marker.exists():
                value["Image"] = "sha256:" + "6" * 64
            return json.dumps(value)
        if args[:2] == ["docker", "ps"]:
            self.base.calls.append(args[:])
            service = next(word.partition("=")[2].partition("=")[2] for word in args
                           if word.startswith("label=com.docker.compose.service="))
            identifiers = [self.base.ids[service]]
            has_stopped = any(row[:2] == ["docker", "stop"] for row in self.base.calls)
            if service in self.extra or (self.extra_after_arm and self.base.marker.exists()) \
                    or (self.extra_after_stop and has_stopped):
                identifiers += [self.extra.get(service, "8" * 64)]
            return "\n".join(identifiers)
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            self.base.calls.append(args[:])
            record = guard.status()
            self.assertIn(record["phase"], ("ARMED", "FROZEN", "INCIDENT"))
            self.assertEqual(record["schemaVersion"], 5)
            self.assertEqual(record["rollback"]["approvalSha256"], self.approval)
            self.assertEqual(record["rollback"]["release"], self.original["candidate"])
            self.assertIn(args[-1], self.base.ids.values())
            self.assertLessEqual(kwargs["timeout"], 45)
            with self.assertRaises(ReleaseContractError):
                guard.check_startup()
            info = self.base.info[args[-1]]
            if args[1] == "update":
                if self.base.fail_update and args[-1] == self.base.ids["api"]:
                    raise ReleaseContractError("unknown update result")
                info["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            else:
                if self.fail_initial_stop and args[-1] == self.base.ids["api"]:
                    raise ReleaseContractError("stop unconfirmed")
                info["State"].update(Status="exited", Running=False, Restarting=False, Paused=False)
            return ""
        raw = self.base.observe_command(args, **kwargs)
        if args[:3] == ["docker", "image", "inspect"]:
            value = json.loads(raw)
            value["Config"]["Labels"]["org.opencontainers.image.revision"] = fixtures.NEW
            return json.dumps(value)
        return raw

    def freeze(self, **kwargs):
        return guard.freeze_rollback_for_plan(self.identity, kwargs.pop("approval", self.approval),
            controller=self.controller, run=self.command, observe=self.observer, fetch=Mock(),
            now=kwargs.pop("now", lambda: self.base.time), **kwargs)

    def mutations(self):
        return self.base.mutations()

    def assert_no_arm(self):
        self.assertFalse(self.base.marker.exists())
        self.assertEqual(self.mutations(), [])

    def test_persist_exact_target_scope_and_policies_before_stopping_unhealthy_or_exited_apps(self):
        self.base.info[self.base.ids["api"]]["State"].update(Status="exited", Running=False)
        self.base.info[self.base.ids["web"]]["HostConfig"]["RestartPolicy"] = {
            "Name": "on-failure", "MaximumRetryCount": 7}
        record = self.freeze()
        self.assertEqual(record["phase"], "FROZEN")
        self.assertEqual(record["schemaVersion"], 5)
        self.assertEqual(record["observedApplicationSha"], fixtures.NEW)
        self.assertEqual(record["rollback"]["release"]["sourceSha"], fixtures.OLD)
        self.assertEqual(record["originalContainers"]["web"]["restartPolicy"]["MaximumRetryCount"], 7)
        self.assertFalse(record["canExecute"])
        self.assertEqual([row[1] for row in self.mutations()], ["update"] * 3 + ["stop"] * 3)
        self.assertEqual(storage.load_rollback_review(self.identity), self.raw)
        self.assertEqual(self.base.marker.stat().st_mode & 0o777, 0o600)
        self.assertNotIn("DO_NOT_PERSIST", self.base.marker.read_text())
        self.assertTrue(self.observer.call_args.kwargs["cache_images"] is False)
        self.controller.check_running_images.assert_not_called()
        self.controller.write_state.assert_not_called()
        self.controller.write_creation_pending.assert_not_called()
        self.controller.atomic_write.assert_not_called()
        self.assertFalse(any(word in row for row in self.base.calls
                             for word in ("start", "up", "create", "pull", "build")))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_forward_writer_observation_still_rejects_an_exited_app(self):
        self.base.info[self.base.ids["api"]]["State"].update(Status="exited", Running=False)
        with self.assertRaises(ReleaseContractError):
            guard._original_containers(self.controller, fixtures.NEW, self.base.paired, self.command)
        self.assert_no_arm()

    def test_missing_wrong_boolean_or_other_scope_acknowledgement_blocks_before_collection(self):
        for approval in (None, True, self.identity, "0" * 64):
            with self.subTest(approval=approval), self.assertRaises(ReleaseContractError):
                self.freeze(approval=approval)
        self.observer.assert_not_called()
        self.assert_no_arm()

    def test_fresh_baseline_or_historical_proof_drift_cannot_arm(self):
        values = copy.deepcopy(self.review.values)
        values["backup"]["sha256"] = "f" * 64
        changed = plan.create_rollback_review(release_state=self.review.state_bytes(),
            target_inventory=self.review.target_inventory, created_at=self.base.time, **values)
        with patch.object(self.observer, "return_value", changed), self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()
        self.proof.return_value = {**self.original["candidate"], "ciRunId": 999}
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()

    def test_created_paused_restarting_dead_or_inconsistent_writer_state_is_rejected(self):
        state = self.base.info[self.base.ids["api"]]["State"]
        original = copy.deepcopy(state)
        for changes in ({"Status": "created", "Running": False}, {"Paused": True},
                        {"Restarting": True}, {"Dead": True}, {"Running": False},
                        {"Status": "exited", "Running": True}):
            state.clear()
            state.update(original, **changes)
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                self.freeze()
            self.assert_no_arm()

    def test_extra_role_object_before_arming_is_not_stopped_or_adopted(self):
        self.extra["api"] = "8" * 64
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()

    def test_late_unexpected_writer_keeps_incident_and_never_receives_mutation(self):
        self.extra_after_stop = True
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")
        self.assertNotIn("8" * 64, [row[-1] for row in self.mutations()])

    def test_late_state_history_backup_or_database_drift_fences_saved_ids_only(self):
        self.db_after_arm = True
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        record = guard.status()
        self.assertEqual(record["phase"], "INCIDENT")
        self.assertEqual(record["rollback"]["approvalSha256"], self.approval)
        self.assertEqual({row[-1] for row in self.mutations()}, set(self.base.ids.values()))
        self.controller.write_state.assert_not_called()
        self.controller.write_creation_pending.assert_not_called()

    def test_post_stop_history_change_cannot_be_reported_as_frozen(self):
        original = copy.deepcopy(self.original["migrationHistory"])
        def history(controller, run):
            if any(row[:2] == ["docker", "stop"] for row in self.base.calls):
                return original + [{**original[0], "state": "rolled-back"}]
            return original
        self.history.side_effect = history
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertFalse(any(info["State"]["Running"] for info in self.base.info.values()))

    def test_bad_snapshot_state_bytes_or_saved_plan_readback_block_before_arming(self):
        self.private.return_value += b" "
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()
        self.private.return_value = self.review.state_bytes()
        with patch.object(storage, "load_rollback_review", side_effect=[self.raw, self.raw + b" "]):
            with self.assertRaises(ReleaseContractError):
                self.freeze()
        self.assert_no_arm()

    def test_backup_active_root_gate_and_existing_evidence_block_without_overwrite(self):
        self.base.backup_active = True
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()
        self.base.backup_active = False
        with patch.object(guard.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()
        self.base.gate.side_effect = ReleaseContractError("not installed")
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()
        self.base.gate.side_effect = None
        self.base.marker.write_bytes(b"retained unknown")
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertEqual(self.base.marker.read_bytes(), b"retained unknown")
        self.assertEqual(self.mutations(), [])

    def test_both_real_locks_prevent_concurrent_maintenance_or_collection(self):
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.freeze()
        with storage.preparation_lock(), self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()

    def test_initial_marker_sync_unknown_stops_before_first_policy_change(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("sync unknown")):
            with self.assertRaises(OSError):
                self.freeze()
        self.assertTrue(self.base.marker.exists())
        self.assertEqual(self.mutations(), [])
        self.assertEqual(guard.status()["phase"], "ARMED")

    def test_final_frozen_directory_sync_unknown_is_not_rewritten_or_replayed(self):
        real = os.fsync
        calls = 0
        def sync(fd):
            nonlocal calls
            calls += 1
            if calls == 4:
                raise OSError("final directory sync unknown")
            return real(fd)
        with patch.object(guard.os, "fsync", side_effect=sync), self.assertRaises(OSError):
            self.freeze()
        self.assertEqual(calls, 4)
        self.assertEqual(guard.status()["phase"], "FROZEN")
        before = len(self.mutations())
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertEqual(len(self.mutations()), before)
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_policy_or_stop_failure_keeps_incident_and_attempts_each_saved_writer(self):
        self.base.fail_update = True
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertTrue(set(self.base.ids.values()) <= {row[-1] for row in self.mutations()})
        self.assertFalse(any(row[:2] == ["docker", "start"] for row in self.base.calls))

    def test_unconfirmed_stop_never_claims_frozen_or_restores_restart_policy(self):
        self.fail_initial_stop = True
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertTrue(self.base.info[self.base.ids["api"]]["State"]["Running"])
        self.assertTrue(all(row[:2] != ["docker", "update"] or row[2] == "--restart=no"
                            for row in self.mutations()))

    def test_task_failure_cleanup_preserves_rollback_scope_and_uses_only_saved_ids(self):
        record = self.freeze()
        result = guard.cleanup_after_task(self.identity, "signal", controller=self.controller,
                                         run=self.command, now=lambda: self.base.time)
        self.assertEqual(result["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(guard.status()["rollback"], record["rollback"])
        self.assertEqual(guard.status()["originalContainers"], record["originalContainers"])

    def test_schema_scope_and_backward_phase_transitions_cannot_be_overwritten(self):
        record = self.freeze()
        with storage._directory_fd(self.base.maintenance) as root:
            for change in ({"phase": "ARMED"}, {"phase": "CREATING_CANDIDATES"},
                           {"rollback": {**record["rollback"], "approvalSha256": "0" * 64}},
                           {"rollback": {**record["rollback"], "release": {**record["rollback"]["release"],
                                                                                "ciRunId": 999}}}):
                with self.subTest(change=change), self.assertRaises(ReleaseContractError):
                    guard._write(root, {**record, **change})
        self.assertEqual(guard.status(), record)

    def test_rollback_marker_rejects_bad_shape_unknown_schema_and_non_frozen_phases(self):
        record = self.freeze()
        for changes in ({"schemaVersion": True}, {"schemaVersion": 6},
                        {"phase": "MIGRATION_VERIFIED"}, {"phase": "CANDIDATES_READY"},
                        {"rollback": {}}, {"rollback": {**record["rollback"], "extra": True}},
                        {"rollback": {**record["rollback"], "approvalSha256": True}},
                        {"rollback": {**record["rollback"], "approvalSha256": "X" * 64}},
                        {"migration": {}}, {"candidate": {}}):
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                guard._validate({**record, **changes})

    def test_stale_collection_and_expired_backup_block_before_arming(self):
        original = self.observer.return_value
        self.observer.return_value = self.raw
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assert_no_arm()
        self.observer.return_value = original
        with self.assertRaises(ReleaseContractError):
            self.freeze(now=lambda: "2026-10-27T17:00:01Z")
        self.assert_no_arm()

    def test_forward_paths_and_cli_cannot_adopt_or_execute_rollback_record(self):
        with self.assertRaises(ReleaseContractError):
            guard.freeze_for_plan(self.identity, controller=self.controller, run=self.command,
                                  observe=self.observer, fetch=Mock(), now=lambda: self.base.time)
        self.assert_no_arm()
        record = self.freeze()
        with self.assertRaises(ReleaseContractError):
            guard.prepare_candidate_containers(self.identity, record["attemptId"],
                controller=self.controller, run=self.command, fetch=Mock(), now=lambda: self.base.time)
        self.assertEqual(guard.status(), record)
        for command in ("freeze-rollback", "rollback", "clear", "restore"):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                guard.main([command])


if __name__ == "__main__":
    unittest.main()
