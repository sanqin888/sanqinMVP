"""Offline migration create-only orchestration, no Docker or SQL execution."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_migration_registration as fixtures
import release_task as task
import maintenance_guard as guard
import migration_container as migration
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
from release_contract import ReleaseContractError


UNFORWARDED_API_VALUE = "DO_NOT_FORWARD"


class MigrationCreateTests(unittest.TestCase):
    def setUp(self):
        self.case = fixtures.MigrationRegistrationTests(
            "test_intent_precedes_registration_exact_approval_and_container_are_retained")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.fixture = self.case.fixture
        self.controller = self.fixture.controller
        self.values = fixtures.fixtures.inputs()
        self.installed = {name: b"installed fixture" for name in plan.RUNTIME_FILES}
        self.values["runtime_pins"] = plan.runtime_contract(self.installed, self.installed)
        raw = plan.create_plan(created_at=fixtures.fixtures.NOW, **self.values)
        self.identity = storage.save_plan(raw)
        record = guard.status()
        record["planId"] = self.identity
        self.fixture.marker.write_bytes(guard._raw(record))  # Only seed disposable fixture.
        self.case.identity = self.identity
        self.attempt = record["attemptId"]
        self.approval = plan.sql_review(raw, self.identity)["approvalSha256"]
        self.stack = self.fixture.stack
        self.snapshot = self.stack.enter_context(patch.object(collector, "_snapshot",
            return_value=(self.values["current"], self.installed, self.values["environment"])))
        self.history = self.stack.enter_context(patch.object(collector, "_history", return_value=self.values["history"]))
        self.backup = self.stack.enter_context(patch.object(collector, "_backup", return_value=self.values["backup"]))
        self.proof = self.stack.enter_context(patch.object(guard.release, "verify_exact_candidate",
                                                        return_value=self.values["candidate"]))
        self.stack.enter_context(patch.object(collector, "_resource_preflight"))
        self.image = self.stack.enter_context(patch.object(collector, "_inspect_image"))
        self.inventory = self.stack.enter_context(patch.object(collector, "_probe_sql",
                                                              return_value=self.values["inventory"]))
        self.database = self.stack.enter_context(patch.object(guard, "_database_identity", return_value={"Id": "db"}))
        self.url = "postgresql://fixture:p$$word@db/database"  # Compose config JSON already escapes $.
        self.expanded = {"services": {"api": {"environment": {
            "DATABASE_URL": self.url, "JWT_SECRET": UNFORWARDED_API_VALUE}}}}
        self.calls, self.creates, self.pending = [], [], False
        self.fail_create = False
        def pending(old, new):
            self.assertEqual(old, self.values["current"]["applicationSha"])
            self.assertEqual(new, self.values["candidate"]["sourceSha"])
            self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
            self.pending = True
        self.controller.write_creation_pending.side_effect = pending

    def assert_locked(self):
        for lock in (job._locked_directory, storage.preparation_lock):
            with self.assertRaises(ReleaseContractError):
                with lock():
                    pass

    def observe_command(self, args, **kwargs):
        self.assert_locked()
        self.calls.append((args[:], kwargs))
        if args[:2] == ["docker", "compose"] and args[-3:] == ["config", "--format", "json"]:
            return json.dumps(self.expanded)
        if args[:2] == ["docker", "compose"] and "create" in args:
            self.assertTrue(self.pending)
            self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
            self.creates.append(json.loads(kwargs["input_bytes"]))
            self.case.spawn_fixture()
            if self.fail_create:
                raise ReleaseContractError("create outcome unknown after effect")
            return ""
        return self.case.observe_command(args, **kwargs)

    def prepare(self):
        return task.prepare_migration_container(self.identity, self.attempt, self.approval,
            controller=self.controller, run=self.observe_command, fetch=Mock(), now=lambda: self.fixture.time)

    def test_locked_create_uses_one_private_pinned_service_and_never_starts_sql(self):
        result = self.prepare()
        self.assertEqual(result["outcome"], "MIGRATION_CREATED_NOT_STARTED")
        self.assertEqual(guard.status()["phase"], "MIGRATION_REGISTERED")
        self.assertFalse(result["canExecute"])
        body = self.creates[0]
        self.assertEqual(set(body["services"]), {"sanq-migration"})
        service = body["services"]["sanq-migration"]
        self.assertEqual(service["environment"], {"DATABASE_URL": self.url})
        self.assertEqual(service["entrypoint"], migration.ENTRYPOINT)
        self.assertEqual(service["command"], migration.COMMAND)
        self.assertEqual(service["restart"], "no")
        self.assertNotIn("volumes", service)
        self.assertNotIn("depends_on", service)
        self.assertNotIn("DO_NOT_FORWARD", json.dumps(body))
        args, kwargs = next((a, kw) for a, kw in self.calls if "create" in a)
        self.assertEqual(args[-5:], ["create", "--no-build", "--pull", "never", "sanq-migration"])
        self.assertEqual(kwargs["timeout"], 180)
        self.assertNotIn(self.url, repr(args))
        self.assertFalse(any(a[:2] in (["docker", "start"], ["docker", "run"]) for a, _ in self.calls))
        self.controller.write_state.assert_not_called()
        self.controller.atomic_write.assert_not_called()
        self.controller.apply_reviewed_migrations.assert_not_called()
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(len(self.creates), 1)

    def test_wrong_attempt_or_approval_never_creates_or_writes_pending(self):
        self.attempt = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.attempt = self.case.attempt
        self.approval = "0" * 64
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertFalse(self.creates)
        self.assertFalse(self.pending)

    def test_current_backup_history_or_candidate_proof_drift_stops_before_intent(self):
        for observer in (self.backup, self.history, self.proof):
            old = observer.return_value
            observer.return_value = None
            with self.assertRaises(ReleaseContractError):
                self.prepare()
            observer.return_value = old
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertFalse(self.pending)

    def test_changed_sql_inventory_or_missing_database_url_never_creates(self):
        original = self.inventory.return_value
        self.inventory.return_value = []
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.inventory.return_value = original
        del self.expanded["services"]["api"]["environment"]["DATABASE_URL"]
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "FROZEN")

    def test_intention_sync_unknown_never_writes_pending_or_creates(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("sync unknown")):
            with self.assertRaises(OSError):
                self.prepare()
        self.assertFalse(self.pending)
        self.assertFalse(self.creates)

    def test_pending_write_unknown_leaves_intent_and_never_creates(self):
        self.controller.write_creation_pending.side_effect = OSError("pending outcome unknown")
        with self.assertRaises(OSError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
        self.assertFalse(self.creates)

    def test_create_unknown_keeps_unregistered_evidence_and_cannot_replay(self):
        self.fail_create = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
        self.assertIsNone(guard.status()["migration"]["container"])
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(len(self.creates), 1)

    def test_database_changed_after_create_blocks_registration(self):
        self.database.side_effect = [{"Id": "db"}, {"Id": "other"}]
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
        self.assertTrue(self.pending)

    def test_global_or_resource_lock_prevents_any_work(self):
        for lock in (job._locked_directory, storage.preparation_lock):
            with lock(), self.assertRaises(ReleaseContractError):
                self.prepare()
        self.assertFalse(self.calls)
        self.assertFalse(self.pending)


if __name__ == "__main__":
    unittest.main()
