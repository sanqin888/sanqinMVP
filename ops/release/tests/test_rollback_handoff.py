"""Offline rollback success handoff and durability faults; no Docker/SQL/HTTP/systemd."""
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
import test_rollback_start as fixtures
import test_finalize_candidates as binding_fixtures
import test_deployment_plan as values
import finalize_candidates as finalizer
import start_candidates as starter
import maintenance_guard as guard
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
import deploy_release as deploy
from release_contract import ReleaseContractError


class RollbackHandoffTests(unittest.TestCase):
    def setUp(self):
        self.stage = fixtures.RollbackStartTests(
            "test_start_saved_old_ids_once_and_keep_pending_history_scope_and_restart_inhibition")
        self.stage.setUp()
        self.addCleanup(self.stage.doCleanups)
        self.case, self.controller, self.info = self.stage.case, self.stage.controller, self.stage.info
        self.env = ("PRIVATE_FIXTURE=DO_NOT_PERSIST\nSANQ_IMAGE_SHA=" + values.NEW + "\n").encode()
        original = copy.deepcopy(self.case.rb.original)
        observations = job._observations(original)
        observations["current"]["configurationSha256"] = hashlib.sha256(
            self.env + b"\0rendered-compose\0" + plan._canonical(self.case.expanded)).hexdigest()
        self.raw = plan.create_rollback_review(release_state=original["releaseStateRaw"].encode(),
            target_inventory=original["targetMigrationInventory"], created_at=values.NOW, **observations)
        self.identity = storage.save_rollback_review(self.raw)
        self.approval = plan.rollback_review_summary(self.raw, self.identity)["compatibilityApprovalSha256"]
        record = guard.status()
        record["planId"], record["rollback"]["approvalSha256"] = self.identity, self.approval
        policies = {"api": {"Name": "on-failure", "MaximumRetryCount": 7},
                    "ubereats-worker": {"Name": "unless-stopped", "MaximumRetryCount": 0},
                    "web": {"Name": "no", "MaximumRetryCount": 0}}
        for service in guard.SERVICES:
            record["originalContainers"][service]["restartPolicy"] = policies[service]
        self.case.rb.base.marker.write_bytes(guard._raw(record))
        self.stage.identity, self.stage.approval, self.stage.original = self.identity, self.approval, copy.deepcopy(record)
        self.stage.start()
        self.ready = guard.status()
        self.attempt = self.ready["attemptId"]
        self.controller.RELEASE_LINE = deploy.RELEASE_LINE
        self.state = {"schemaVersion": 1, "phase": "pending", "current": values.OLD,
                      "previous": values.NEW, "reason": "candidate-create-start", "updatedAt": values.NOW}
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        private = collector._private_bytes
        self.stack.enter_context(patch.object(collector, "_private_bytes",
            side_effect=lambda path, owner, **kw: self.env if path == self.controller.ENV else private(path, owner, **kw)))
        self.stack.enter_context(patch.object(finalizer, "_env_metadata", return_value=(0, 0, 0o600)))
        self.stack.enter_context(patch.object(finalizer, "_state", side_effect=lambda controller: copy.deepcopy(self.state)))
        self.sync = self.stack.enter_context(patch.object(finalizer, "_sync_runtime"))
        self.target = self.stack.enter_context(patch.object(finalizer, "_target_binding", side_effect=self.target_binding))
        self.calls, self.writes, self.policies = [], [], []
        self.bad_target = self.bad_state = self.fail_state_after_effect = False
        self.fail_policy = None
        self.history_after_policies = self.policy_readback_bad = False
        self.controller.atomic_write.side_effect = self.write_env
        self.controller.write_state.side_effect = self.write_state

    def locked(self):
        with self.assertRaises(ReleaseContractError):
            with job._locked_directory():
                pass
        with self.assertRaises(ReleaseContractError):
            with storage.preparation_lock():
                pass

    def write_env(self, path, text):
        self.assertEqual(path, self.controller.ENV)
        self.assertEqual(guard.status()["phase"], "FINALIZING")
        self.assertEqual(guard.status()["rollback"], self.ready["rollback"])
        self.locked()
        self.env = text.encode()
        for service in guard.SERVICES:
            name = "sanq-web" if service == "web" else "sanq-api"
            self.case.expanded["services"][service]["image"] = self.ready["candidate"]["release"]["images"][name]["ref"]

    def write_state(self, phase, *, current, previous, reason):
        self.assertEqual((phase, current, previous, reason),
                         ("rolled-back", values.OLD, values.NEW, "rollback-verified"))
        self.assertEqual(guard.status()["phase"], "FINALIZING")
        self.assertEqual(self.env.count(values.OLD.encode()), 1)
        self.locked()
        self.writes.append((phase, current, previous, reason))
        self.state.update(phase=phase, current=values.NEW if self.bad_state else current,
                          previous=previous, reason=reason)
        if self.fail_state_after_effect:
            raise OSError("state write outcome unknown after effect")

    def target_binding(self, original, env, expanded, metadata, controller, run):
        if self.bad_target:
            raise ReleaseContractError("target binding changed")
        self.assertEqual((env, expanded, metadata), (self.env, self.case.expanded, (0, 0, 0o600)))
        self.assertEqual(original["planId"], self.identity)
        return expanded

    def command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:2] == ["docker", "update"]:
            identifier = args[-1]
            self.assertIn(identifier, {*self.case.ids.values(), *self.case.rb.base.ids.values()})
            if identifier not in self.info:
                raise ReleaseContractError("saved original removed")
            name, _, count = args[2].removeprefix("--restart=").partition(":")
            policy = {"Name": name, "MaximumRetryCount": int(count) if count else 0}
            restoring = name != "no" or (identifier == self.case.ids["web"] and len(self.policies) == 2
                and [row["Name"] for _, row in self.policies] == ["on-failure", "unless-stopped"])
            if restoring:
                self.assertEqual(guard.status()["phase"], "FINALIZING")
                self.assertEqual(guard.status()["rollback"], self.ready["rollback"])
                self.assertEqual(self.state["phase"], "rolled-back")
                self.assertEqual(self.sync.call_count, 2)
                self.locked()
            self.info[identifier]["HostConfig"]["RestartPolicy"] = policy
            self.policies.append((identifier, policy))
            if identifier == self.fail_policy and name != "no":
                raise ReleaseContractError("policy outcome unknown after effect")
            if len(self.policies) == 3:
                if self.history_after_policies:
                    self.case.rb.history.return_value = self.case.rb.original["migrationHistory"][:1]
                if self.policy_readback_bad:
                    self.info[self.case.ids["api"]]["HostConfig"]["RestartPolicy"]["MaximumRetryCount"] = 8
            return ""
        return self.stage.command(args, **kwargs)

    def finish(self, **kwargs):
        return finalizer.finalize_rollback_ready(self.identity, kwargs.pop("attempt", self.attempt),
            kwargs.pop("approval", self.approval), controller=self.controller, run=self.command,
            fetch=Mock(), now=kwargs.pop("now", lambda: self.case.rb.base.time), **kwargs)

    def assert_incident(self, code="TASK_FAILED_WRITERS_STOPPED"):
        record = guard.status()
        self.assertEqual((record["phase"], record["errorCode"]), ("INCIDENT", code))
        self.assertEqual(record["rollback"], self.ready["rollback"])
        self.assertEqual(record["candidate"], self.ready["candidate"])
        if code == "TASK_FAILED_WRITERS_STOPPED":
            self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
            self.assertTrue(all(row["HostConfig"]["RestartPolicy"]["Name"] == "no" for row in self.info.values()))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def assert_no_mutation(self):
        self.controller.atomic_write.assert_not_called()
        self.controller.write_state.assert_not_called()
        self.assertEqual(self.policies, [])
        self.assertEqual(guard.status(), self.ready)

    def test_success_commits_only_rolled_back_authority_preserves_history_and_restores_exact_policies(self):
        expected = copy.deepcopy(self.ready["originalContainers"])
        history = copy.deepcopy(self.case.rb.history.return_value)
        result = self.finish()
        self.assertEqual(result, {"planId": self.identity, "attemptId": self.attempt,
            "outcome": "ROLLED_BACK", "currentSha": values.OLD, "canExecute": False})
        self.assertEqual((self.state["phase"], self.state["current"], self.state["previous"], self.state["reason"]),
                         ("rolled-back", values.OLD, values.NEW, "rollback-verified"))
        self.assertEqual(self.env, ("PRIVATE_FIXTURE=DO_NOT_PERSIST\nSANQ_IMAGE_SHA=" + values.OLD + "\n").encode())
        self.assertEqual(len(self.writes), 1)
        self.assertEqual(self.sync.call_args_list[0].args, (self.controller, "env"))
        self.assertEqual(self.sync.call_args_list[1].args, (self.controller, "state"))
        for service in guard.SERVICES:
            self.assertEqual(self.info[self.case.ids[service]]["HostConfig"]["RestartPolicy"],
                             expected[service]["restartPolicy"])
        self.assertEqual(storage.load_rollback_review(self.identity), self.raw)
        self.assertEqual(self.case.rb.history.return_value, history)
        self.assertEqual(len(history), 2)
        self.assertEqual(len(plan.validate_rollback_review(self.raw, self.identity)["targetMigrationInventory"]), 1)
        self.assertTrue(all(row["State"]["Running"] for row in self.info.values()))
        self.assertFalse(guard.status()["maintenance"])
        guard.check_startup()
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any(word in row for row in self.calls for word in ("create", "start", "up", "pull", "build")))
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_crlf_handoff_preserves_every_original_line_ending(self):
        self.env = self.env.replace(b"\n", b"\r\n")
        original = plan.validate_rollback_review(self.raw, self.identity)
        observations = job._observations(original)
        observations["current"]["configurationSha256"] = hashlib.sha256(
            self.env + b"\0rendered-compose\0" + plan._canonical(self.case.expanded)).hexdigest()
        self.raw = plan.create_rollback_review(release_state=original["releaseStateRaw"].encode(),
            target_inventory=original["targetMigrationInventory"], created_at=values.NOW, **observations)
        self.identity = storage.save_rollback_review(self.raw)
        self.approval = plan.rollback_review_summary(self.raw, self.identity)["compatibilityApprovalSha256"]
        self.ready["planId"], self.ready["rollback"]["approvalSha256"] = self.identity, self.approval
        self.case.rb.base.marker.write_bytes(guard._raw(self.ready))
        expected = self.env.replace(values.NEW.encode(), values.OLD.encode())
        self.assertEqual(self.finish()["outcome"], "ROLLED_BACK")
        self.assertEqual(self.env, expected)

    def test_wrong_missing_boolean_acknowledgement_or_attempt_never_mutates(self):
        for approval in (None, True, self.identity, "0" * 64):
            with self.subTest(approval=approval), self.assertRaises(ReleaseContractError):
                self.finish(approval=approval)
        with self.assertRaises(ReleaseContractError):
            self.finish(attempt="f" * 32)
        self.assert_no_mutation()

    def test_forward_handoff_cannot_adopt_rollback_kind(self):
        with self.assertRaises(ReleaseContractError):
            finalizer.finalize_ready(self.identity, self.attempt, controller=self.controller,
                run=self.command, fetch=Mock(), now=lambda: self.case.rb.base.time)
        self.assert_no_mutation()

    def test_root_both_locks_and_expired_backup_block_before_intent(self):
        with patch.object(guard.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.finish()
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.finish()
        with storage.preparation_lock(), self.assertRaises(ReleaseContractError):
            self.finish()
        with self.assertRaises(ReleaseContractError):
            self.finish(now=lambda: "2026-10-27T17:00:01Z")
        self.assert_no_mutation()

    def test_unhealthy_or_dead_saved_candidate_is_rejected_before_intent(self):
        state = self.info[self.case.ids["api"]]["State"]
        state["Health"]["Status"] = "starting"
        with self.assertRaises(ReleaseContractError):
            self.finish()
        state["Health"]["Status"] = "healthy"
        state["Dead"] = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assert_no_mutation()

    def test_backup_history_or_exact_target_proof_drift_prevents_intent(self):
        backup = self.case.rb.backup.return_value
        self.case.rb.backup.return_value = {**backup, "sha256": "f" * 64}
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.case.rb.backup.return_value = backup
        history = self.case.rb.history.return_value
        self.case.rb.history.return_value = history[:1]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.case.rb.history.return_value = history
        self.case.rb.proof.return_value = {**self.case.rb.original["candidate"], "ciRunId": 999}
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assert_no_mutation()

    def test_late_pending_configuration_drift_is_rejected_before_intent(self):
        self.stage.bindings.side_effect = [self.case.expanded, {**self.case.expanded, "name": "other"}]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assert_no_mutation()

    def test_finalizing_sync_unknown_never_writes_environment_state_or_policy(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("intention sync unknown")):
            with self.assertRaises(OSError):
                self.finish()
        self.assertEqual(self.policies, [])
        self.controller.atomic_write.assert_not_called()
        self.controller.write_state.assert_not_called()
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_env_directory_sync_unknown_keeps_actual_env_and_pending_then_fences(self):
        self.sync.side_effect = OSError("environment sync unknown")
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertIn(values.OLD.encode(), self.env)
        self.assertEqual(self.state["phase"], "pending")
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_target_binding_failure_never_commits_release(self):
        self.bad_target = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_readiness_error_never_commits_release(self):
        self.stage.readiness_error = ReleaseContractError("target readiness failed")
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.state["phase"], "pending")
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_keyboard_interrupt_after_environment_change_keeps_actual_pending(self):
        self.stage.readiness_error = KeyboardInterrupt()
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.state["phase"], "pending")
        self.assertIn(values.OLD.encode(), self.env)
        self.assert_incident()

    def test_database_or_history_drift_after_readiness_never_commits_release(self):
        self.stage.db_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_full_history_after_readiness_cannot_be_trimmed_to_old_inventory(self):
        self.stage.history_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_unknown_writer_is_not_stopped_by_a_discovered_id(self):
        self.stage.replace_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.writes, [])
        self.assert_incident("FENCE_UNCONFIRMED")
        self.assertNotIn("7" * 64, [row[-1] for row in self.calls if row[:2] in (["docker", "stop"], ["docker", "update"])])

    def test_unconfirmed_stop_remains_fenced(self):
        self.stage.readiness_error = ReleaseContractError("readiness failed")
        self.stage.fail_stop = self.case.ids["api"]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assert_incident("FENCE_UNCONFIRMED")
        self.assertTrue(self.info[self.case.ids["api"]]["State"]["Running"])

    def test_sole_state_write_unknown_after_effect_is_never_rewritten_to_pending(self):
        self.fail_state_after_effect = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual((self.state["phase"], self.state["current"]), ("rolled-back", values.OLD))
        self.assertEqual(len(self.writes), 1)
        self.assert_incident()

    def test_state_directory_sync_unknown_retains_actual_rolled_back_and_stops(self):
        self.sync.side_effect = [None, OSError("release state directory sync unknown")]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual((self.state["phase"], self.state["current"]), ("rolled-back", values.OLD))
        self.assertEqual(len(self.writes), 1)
        self.assert_incident()

    def test_wrong_state_readback_never_restores_saved_policies(self):
        self.bad_state = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.state["current"], values.NEW)
        self.assertTrue(all(policy["Name"] == "no" for _, policy in self.policies))
        self.assert_incident()

    def test_policy_result_unknown_after_effect_retains_sole_state_and_fences_all_saved_ids(self):
        self.fail_policy = self.case.ids["api"]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual((self.state["phase"], self.state["current"]), ("rolled-back", values.OLD))
        self.assertEqual(len(self.writes), 1)
        self.assert_incident()

    def test_policy_readback_mismatch_blocks_commit_and_clear(self):
        self.policy_readback_bad = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.state["phase"], "rolled-back")
        self.assert_incident()

    def test_full_history_drift_after_policy_restore_blocks_commit_and_clear(self):
        self.history_after_policies = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.state["phase"], "rolled-back")
        self.assert_incident()

    def test_committed_directory_sync_unknown_retains_marker_and_stops_without_rewrite(self):
        real_sync, count = os.fsync, 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 4:
                raise OSError("committed directory sync unknown")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaisesRegex(ReleaseContractError, "record durability unknown"):
                self.finish()
        self.assertEqual(count, 4)
        self.assertEqual(guard.status()["phase"], "HANDOFF_COMMITTED")
        self.assertEqual(self.state["phase"], "rolled-back")
        self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_unlink_failure_retains_committed_scope_and_running_release_without_replay(self):
        with patch.object(finalizer.os, "unlink", side_effect=OSError("unlink unavailable")):
            with self.assertRaisesRegex(ReleaseContractError, "clear outcome unknown"):
                self.finish()
        self.assertEqual(guard.status()["phase"], "HANDOFF_COMMITTED")
        self.assertEqual(guard.status()["rollback"], self.ready["rollback"])
        self.assertEqual(self.state["phase"], "rolled-back")
        self.assertTrue(all(row["State"]["Running"] for row in self.info.values()))
        with self.assertRaises(ReleaseContractError):
            self.finish()
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_clear_directory_sync_unknown_does_not_stop_or_recreate_marker(self):
        real_sync, count = os.fsync, 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 5:
                raise OSError("clear directory sync unknown")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaisesRegex(ReleaseContractError, "clear outcome unknown"):
                self.finish()
        self.assertEqual(count, 5)
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(self.state["phase"], "rolled-back")
        self.assertTrue(all(row["State"]["Running"] for row in self.info.values()))
        self.assertEqual(len(self.policies), 3)
        guard.check_startup()
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_same_record_scope_cannot_change_or_skip_handoff_phases(self):
        with storage._directory_fd(guard.MAINTENANCE_DIR) as root:
            for changes in ({"phase": "HANDOFF_COMMITTED"},
                            {"phase": "FINALIZING", "rollback": {**self.ready["rollback"], "approvalSha256": "0" * 64}}):
                with self.assertRaises(ReleaseContractError):
                    guard._write(root, {**self.ready, **changes})
        self.assert_no_mutation()

    def test_clear_requires_same_committed_plan_attempt_and_empty_other_entries(self):
        with storage._directory_fd(guard.MAINTENANCE_DIR) as root:
            with self.assertRaises(ReleaseContractError):
                finalizer._clear_committed(root, self.identity, self.attempt)
        with patch.object(finalizer.os, "unlink", side_effect=OSError("retain committed marker")):
            with self.assertRaises(ReleaseContractError):
                self.finish()
        with storage._directory_fd(guard.MAINTENANCE_DIR) as root:
            for identity, attempt in (("a" * 64, self.attempt), (self.identity, "f" * 32)):
                with self.assertRaises(ReleaseContractError):
                    finalizer._clear_committed(root, identity, attempt)
            (self.case.rb.base.maintenance / "partial.tmp").write_bytes(b"partial")
            with self.assertRaises(ReleaseContractError):
                finalizer._clear_committed(root, self.identity, self.attempt)


class RollbackBindingTests(unittest.TestCase):
    def test_sole_state_readback_requires_exact_rollback_direction_reason_and_schema(self):
        original = {"candidate": {"sourceSha": values.OLD}, "current": {"applicationSha": values.NEW}}
        state = {"schemaVersion": 1, "phase": "rolled-back", "current": values.OLD,
                 "previous": values.NEW, "reason": "rollback-verified", "updatedAt": values.NOW}
        with patch.object(collector, "_private_bytes", side_effect=lambda *a, **k: json.dumps(state).encode()):
            finalizer._rolled_back(original, Mock())
            for key, bad in (("phase", "active"), ("current", values.NEW), ("previous", values.OLD),
                             ("reason", "readiness-verified"), ("schemaVersion", True)):
                old = state[key]
                state[key] = bad
                with self.assertRaises(ReleaseContractError):
                    finalizer._rolled_back(original, Mock())
                state[key] = old

    def test_real_target_binding_accepts_old_sha_and_rejects_env_metadata_runtime_or_render_drift(self):
        case = binding_fixtures.FinalBindingTests("test_target_binding_rejects_extra_env_or_changed_ownership")
        case.setUp()
        self.addCleanup(case.doCleanups)
        case.fixture.env = ("SANQ_IMAGE_SHA=" + values.OLD + "\n").encode()
        case.expected_env = case.fixture.env
        self.assertEqual(case.binding(), case.expanded)
        with self.assertRaises(ReleaseContractError):
            case.binding((42, 0, 0o600))
        case.fixture.expanded["name"] = "other"
        with self.assertRaises(ReleaseContractError):
            case.binding()
        case.fixture.expanded["name"] = case.expanded["name"]
        case.fixture.files[plan.RUNTIME_FILES[0]] = b"changed runtime"
        with self.assertRaises(ReleaseContractError):
            case.binding()


if __name__ == "__main__":
    unittest.main()
