"""Offline saved-ID migration execution and exact history delta; no real SQL."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_migration_create as fixtures
import collect_deployment_plan as collector
import deployment_plan_store as storage
import maintenance_guard as guard
import migration_container as migration
import release_job as job
import release_task as task
from release_contract import ReleaseContractError


class MigrationExecutionTests(unittest.TestCase):
    def setUp(self):
        self.creation = fixtures.MigrationCreateTests(
            "test_locked_create_uses_one_private_pinned_service_and_never_starts_sql")
        self.creation.setUp()
        self.addCleanup(self.creation.doCleanups)
        self.creation.prepare()
        self.model = self.creation.case
        self.controller = self.creation.controller
        self.identity, self.attempt = self.creation.identity, self.creation.attempt
        self.approval = self.creation.approval
        self.original = guard.plan.validate_plan(storage.load_plan(self.identity), self.identity)
        self.expected = self.original["migrationHistory"] + [
            {**row, "state": "applied"} for row in self.original["pendingMigrations"]]
        self.creation.stack.enter_context(patch.object(task.starter, "_pending_and_config",
                                                       return_value=self.creation.expanded))
        self.calls = []
        self.started, self.elapsed, self.wait_elapsed = 0, 0, 0
        self.wait_result, self.post_history = "0\n", None
        self.fail_start = self.fail_wait = False
        self.exit_update = {}
        self.proof = self.creation.proof
        self.history = self.creation.history

    def command(self, args, **kwargs):
        self.creation.assert_locked()
        self.calls.append((args[:], kwargs))
        if args[:2] == ["docker", "start"]:
            self.assertEqual(args[-1], self.model.container_id)
            self.assertEqual(guard.status()["phase"], "STARTING_MIGRATION")
            self.started += 1
            self.model.info["State"].update(Status="exited", Running=False, ExitCode=0,
                                           OOMKilled=False, Dead=False, Error="")
            self.model.info["State"].update(self.exit_update)
            self.model.info["RestartCount"] = 0
            self.history.return_value = copy.deepcopy(
                self.expected if self.post_history is None else self.post_history)
            if self.fail_start:
                raise ReleaseContractError("start outcome unknown after effect")
            return self.model.container_id + "\n"
        if args[:2] == ["docker", "wait"]:
            self.assertEqual(args[-1], self.model.container_id)
            self.elapsed += self.wait_elapsed
            if self.fail_wait:
                raise ReleaseContractError("wait timeout")
            return self.wait_result
        return self.creation.observe_command(args, **kwargs)

    def execute(self):
        return task.execute_registered_migration(self.identity, self.attempt, self.approval,
            controller=self.controller, run=self.command, fetch=Mock(),
            now=lambda: self.creation.fixture.time, clock=lambda: self.elapsed)

    def test_saved_id_only_exact_history_success_stays_pending_and_cannot_replay(self):
        result = self.execute()
        self.assertEqual(result["outcome"], "MIGRATION_VERIFIED")
        self.assertFalse(result["canExecute"])
        self.assertEqual(guard.status()["phase"], "MIGRATION_VERIFIED")
        self.assertEqual(self.started, 1)
        wait = next((args, kw) for args, kw in self.calls if args[:2] == ["docker", "wait"])
        self.assertEqual(wait[1]["timeout"], 900)
        self.assertFalse(any("create" in args or "rm" in args for args, _ in self.calls))
        self.controller.atomic_write.assert_not_called()
        self.controller.write_state.assert_not_called()
        self.controller.apply_reviewed_migrations.assert_not_called()
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.started, 1)

    def test_wrong_approval_attempt_or_replaced_id_never_starts(self):
        approval = self.approval
        self.approval = "0" * 64
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.approval = approval
        attempt = self.attempt
        self.attempt = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.attempt = attempt
        self.model.inventory = ["9" * 64]
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.started, 0)
        self.assertEqual(guard.status()["phase"], "MIGRATION_REGISTERED")

    def test_prestart_history_backup_proof_or_sql_drift_rejected(self):
        for observer in (self.history, self.creation.backup, self.proof, self.creation.inventory):
            previous = observer.return_value
            observer.return_value = []
            with self.assertRaises(ReleaseContractError):
                self.execute()
            observer.return_value = previous
        self.assertEqual(self.started, 0)
        self.assertEqual(guard.status()["phase"], "MIGRATION_REGISTERED")

    def test_intent_durability_unknown_never_starts_or_rewrites(self):
        real = guard._write
        def uncertain(root, value):
            real(root, value)
            if value["phase"] == "STARTING_MIGRATION":
                raise OSError("directory durability unknown")
        with patch.object(guard, "_write", side_effect=uncertain), self.assertRaises(OSError):
            self.execute()
        self.assertEqual(self.started, 0)
        self.assertEqual(guard.status()["phase"], "STARTING_MIGRATION")
        with self.assertRaises(ReleaseContractError):
            self.execute()

    def test_start_result_unknown_stops_saved_objects_preserves_applied_history(self):
        self.fail_start = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.history.return_value, self.expected)
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.model.stopped[0], self.model.container_id)
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.started, 1)

    def test_wait_timeout_keeps_incident_and_never_restarts(self):
        self.fail_wait = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.started, 1)
        self.assertTrue(self.model.stopped)

    def test_wait_zero_does_not_override_bad_inspected_exit_or_history(self):
        self.exit_update = {"ExitCode": 1}
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.history.return_value, self.expected)

    def test_nonzero_wait_result_does_not_become_success(self):
        self.wait_result = "1\n"
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")

    def test_partial_history_keeps_incident_without_rollback(self):
        self.post_history = self.original["migrationHistory"]
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.controller.write_state.assert_not_called()
        self.controller.atomic_write.assert_not_called()

    def test_stage_budget_includes_wait_and_allows_independent_cleanup(self):
        self.wait_elapsed = 901
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.model.stopped[0], self.model.container_id)

    def test_verified_durability_unknown_preserves_actual_record_without_replay(self):
        real = guard._write
        def uncertain(root, value):
            real(root, value)
            if value["phase"] == "MIGRATION_VERIFIED":
                raise OSError("final durability unknown")
        with patch.object(guard, "_write", side_effect=uncertain), self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "MIGRATION_VERIFIED")
        self.assertEqual(self.history.return_value, self.expected)
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.started, 1)

    def test_post_migration_database_replacement_is_retained_as_incident(self):
        self.creation.database.side_effect = [{"Id": "db"}, {"Id": "db"}, {"Id": "other"}]
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.started, 1)

    def test_history_read_unknown_after_effect_never_replays_or_restores(self):
        def observe(*args, **kwargs):
            if self.started:
                raise ReleaseContractError("history result unknown")
            return self.original["migrationHistory"]
        self.history.side_effect = observe
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.started, 1)
        self.controller.write_state.assert_not_called()

    def test_inspected_completion_rejects_oom_dead_errors_and_restarts(self):
        record = guard.status()
        self.model.info["State"].update(Status="exited", Running=False, ExitCode=0,
                                       OOMKilled=False, Dead=False, Error="")
        self.model.info["RestartCount"] = 0
        original = copy.deepcopy(self.model.info)
        with job._locked_directory(), storage.preparation_lock():
            migration.assert_completed(record, self.creation.observe_command)
            for key, value in (("OOMKilled", True), ("Dead", True), ("Error", "runtime error"),
                               ("ExitCode", True)):
                self.model.info = copy.deepcopy(original)
                self.model.info["State"][key] = value
                with self.assertRaises(ReleaseContractError):
                    migration.assert_completed(record, self.creation.observe_command)
            self.model.info = copy.deepcopy(original)
            self.model.info["RestartCount"] = 1
            with self.assertRaises(ReleaseContractError):
                migration.assert_completed(record, self.creation.observe_command)

    def test_exact_delta_preserves_old_rolled_back_rows_and_multiplicity(self):
        baseline = {"name": "old", "sha256": "1" * 64, "state": "rolled-back"}
        pending = {"name": "new", "sha256": "2" * 64}
        original = {"migrationHistory": [baseline], "pendingMigrations": [pending]}
        expected = [baseline, {**pending, "state": "applied"}]
        migration.assert_applied_history(original, list(reversed(expected)))
        variants = [expected[:1], expected + [baseline],
                    [{**baseline, "state": "applied"}, expected[1]],
                    [baseline, {**expected[1], "sha256": "3" * 64}],
                    [baseline, {**expected[1], "state": "failed"}]]
        for rows in variants:
            with self.assertRaises(ReleaseContractError):
                migration.assert_applied_history(original, rows)

    def test_competition_and_already_started_object_cannot_start(self):
        for lock in (job._locked_directory, storage.preparation_lock):
            with lock(), self.assertRaises(ReleaseContractError):
                self.execute()
        self.model.info["State"].update(Status="exited", Running=False, ExitCode=0)
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.started, 0)


if __name__ == "__main__":
    unittest.main()
