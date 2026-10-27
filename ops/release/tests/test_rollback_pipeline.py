"""Whole rollback task: real locked stage bodies, modeled Docker/DB/PID1 and sources."""
import contextlib
import copy
import hashlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_rollback_create as fixtures
import test_deployment_plan as values
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import deploy_release as deploy
import maintenance_guard as guard
import release_job as job
import release_task as task
import start_candidates as starter
import finalize_candidates as finalizer
from release_contract import ReleaseContractError


class RollbackPipelineTests(unittest.TestCase):
    def setUp(self):
        self.case = fixtures.RollbackCreateTests(
            "test_exact_old_digest_creation_keeps_full_history_and_records_all_ids_without_start")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.controller, self.info = self.case.controller, self.case.rb.base.info
        # Reset ONLY this disposable model to the original reviewed active state.
        self.case.rb.base.marker.unlink()
        self.env = ("PRIVATE_FIXTURE=DO_NOT_PERSIST\nSANQ_IMAGE_SHA=" + values.NEW + "\n").encode()
        original = copy.deepcopy(self.case.rb.original)
        observations = job._observations(original)
        observations["current"]["configurationSha256"] = hashlib.sha256(
            self.env + b"\0rendered-compose\0" + plan._canonical(self.case.expanded)).hexdigest()
        self.raw = plan.create_rollback_review(release_state=original["releaseStateRaw"].encode(),
            target_inventory=original["targetMigrationInventory"], created_at=values.NOW, **observations)
        self.identity = storage.save_rollback_review(self.raw)
        self.original = plan.validate_rollback_review(self.raw, self.identity)
        self.approval = plan.rollback_review_summary(self.raw, self.identity)["compatibilityApprovalSha256"]
        self.case.identity = self.case.rb.identity = self.identity
        self.case.rb.raw, self.case.rb.original, self.case.rb.approval = self.raw, self.original, self.approval
        self.case.frozen["planId"], self.case.frozen["rollback"]["approvalSha256"] = self.identity, self.approval
        self.case.rb.snapshot.return_value = (self.original["current"], self.case.rb.files, self.original["environment"])
        self.fresh = plan.create_rollback_review(release_state=self.original["releaseStateRaw"].encode(),
            target_inventory=self.original["targetMigrationInventory"], created_at=self.case.rb.base.time,
            **job._observations(self.original))
        self.observe = Mock(return_value=self.fresh)
        self.policies = {"api": {"Name": "on-failure", "MaximumRetryCount": 7},
                         "ubereats-worker": {"Name": "unless-stopped", "MaximumRetryCount": 0},
                         "web": {"Name": "no", "MaximumRetryCount": 0}}
        for service, identifier in self.case.rb.base.ids.items():
            self.info[identifier]["State"].update(Status="running", Running=True, Dead=False,
                                                 Health={"Status": "unhealthy"})
            self.info[identifier]["HostConfig"]["RestartPolicy"] = copy.deepcopy(self.policies[service])
        self.controller.RELEASE_LINE = deploy.RELEASE_LINE
        self.state = {"schemaVersion": 1, "phase": "active", "current": values.NEW, "previous": values.OLD,
                      "reason": "readiness-verified", "updatedAt": values.NOW}
        self.calls, self.phases, self.writes = [], [], []
        self.seconds, self.readiness_count = 0, 0
        self.fail_readiness = None
        self.fail_start = False
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.context = self.stack.enter_context(patch.object(task, "_context"))
        self.stack.enter_context(patch.object(starter, "_pending_and_config", side_effect=self.pending_config))
        self.stack.enter_context(patch.object(finalizer, "_state", side_effect=lambda c: copy.deepcopy(self.state)))
        self.stack.enter_context(patch.object(finalizer, "_env_metadata", return_value=(0, 0, 0o600)))
        self.stack.enter_context(patch.object(finalizer, "_sync_runtime"))
        self.stack.enter_context(patch.object(finalizer, "_target_binding", side_effect=self.target_config))
        private = collector._private_bytes
        self.stack.enter_context(patch.object(collector, "_private_bytes",
            side_effect=lambda p, owner, **kw: self.env if p == self.controller.ENV else private(p, owner, **kw)))
        self.real_write = guard._write
        self.stack.enter_context(patch.object(guard, "_write", side_effect=self.record))
        pending = self.controller.write_creation_pending.side_effect
        def write_pending(current, target):
            pending(current, target)
            self.state.update(phase="pending", current=target, previous=current, reason="candidate-create-start")
        self.controller.write_creation_pending.side_effect = write_pending
        def env_write(path, text):
            self.assert_locked()
            self.assertEqual(guard.status()["phase"], "FINALIZING")
            self.env = text.encode()
            for service in guard.SERVICES:
                name = "sanq-web" if service == "web" else "sanq-api"
                self.case.expanded["services"][service]["image"] = self.original["candidate"]["images"][name]["ref"]
        self.controller.atomic_write.side_effect = env_write
        def state_write(phase, **kwargs):
            self.assert_locked()
            self.assertEqual((phase, kwargs["current"], kwargs["previous"], kwargs["reason"]),
                ("rolled-back", values.OLD, values.NEW, "rollback-verified"))
            self.writes.append(phase)
            self.state.update(phase=phase, **kwargs)
        self.controller.write_state.side_effect = state_write

    def assert_locked(self):
        for acquire in (job._locked_directory, storage.preparation_lock):
            with self.assertRaises(ReleaseContractError):
                with acquire():
                    pass

    def record(self, root, value, **kwargs):
        self.assert_locked()
        self.phases.append(value["phase"])
        self.assertEqual(value["rollback"]["approvalSha256"], self.approval)
        return self.real_write(root, value, **kwargs)

    def pending_config(self, original, controller, run):
        self.assertEqual((self.state["phase"], self.state["current"], self.state["previous"]),
                         ("pending", values.OLD, values.NEW))
        self.assertIn(values.NEW.encode(), self.env)
        return self.case.expanded

    def target_config(self, original, env, expanded, metadata, controller, run):
        self.assertEqual((env, expanded), (self.env, self.case.expanded))
        return expanded

    def command(self, args, **kwargs):
        self.calls.append((args[:], kwargs))
        if args[:2] == ["docker", "update"]:
            identifier = args[-1]
            if identifier not in self.info:
                raise ReleaseContractError("removed original")
            name, _, count = args[2].removeprefix("--restart=").partition(":")
            self.info[identifier]["HostConfig"]["RestartPolicy"] = {
                "Name": name, "MaximumRetryCount": int(count) if count else 0}
            return ""
        if args[:2] == ["docker", "start"]:
            self.assertEqual(guard.status()["phase"], "STARTING_CANDIDATES")
            self.assertIn(args[-1], self.case.ids.values())
            self.info[args[-1]]["State"].update(Status="running", Running=True, Dead=False,
                                               Health={"Status": "healthy"})
            if self.fail_start:
                raise ReleaseContractError("start outcome unknown")
            return ""
        if args[0] == "bash":
            self.readiness_count += 1
            if self.readiness_count == self.fail_readiness:
                raise ReleaseContractError("readiness failed")
            return ""
        return self.case.command(args, **kwargs)

    def execute(self, **kwargs):
        return task.run_task(self.identity, rollback_approval=kwargs.pop("approval", self.approval),
            controller=self.controller, run=self.command, observe=kwargs.pop("observe", self.observe),
            fetch=self.case.fetch, now=lambda: self.case.rb.base.time,
            clock=kwargs.pop("clock", lambda: self.seconds), pause=Mock(), **kwargs)

    def test_real_stages_share_original_locks_plan_attempt_and_commit_rolled_back_once(self):
        history = copy.deepcopy(self.case.rb.history.return_value)
        result = self.execute()
        self.assertEqual((result["outcome"], result["currentSha"], result["canExecute"]),
                         ("ROLLED_BACK", values.OLD, False))
        self.assertEqual(self.phases, ["ARMED", "FROZEN", "CREATING_CANDIDATES", "CANDIDATES_REGISTERED",
            "STARTING_CANDIDATES", "CANDIDATES_READY", "FINALIZING", "HANDOFF_COMMITTED"])
        self.assertEqual(self.writes, ["rolled-back"])
        self.assertEqual(storage.load_rollback_review(self.identity), self.raw)
        self.assertEqual(self.case.rb.history.return_value, history)
        self.assertEqual(len(history), 2)
        self.assertEqual(self.case.pending_writes, [(values.NEW, values.OLD)])
        self.assertEqual(len(self.case.creates), 1)
        self.assertEqual([args[-1] for args, _ in self.calls if args[:2] == ["docker", "start"]],
                         [self.case.ids[name] for name in guard.SERVICES])
        for service in guard.SERVICES:
            self.assertEqual(self.info[self.case.ids[service]]["HostConfig"]["RestartPolicy"], self.policies[service])
        self.assertFalse(guard.status()["maintenance"])
        guard.check_startup()
        self.observe.assert_called_once()
        self.assertFalse(self.observe.call_args.kwargs["cache_images"])
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any(word in args for args, _ in self.calls for word in ("up", "pull", "build", "sanq-migration")))
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(len(self.case.creates), 1)

    def test_missing_wrong_boolean_or_sql_approval_never_freezes(self):
        for approval in (None, True, "0" * 64):
            with self.assertRaises(ReleaseContractError):
                self.execute(approval=approval)
        self.assertFalse(self.phases)
        self.assertFalse(self.calls)

    def test_mixed_sql_and_compatibility_approval_blocks_before_context(self):
        with self.assertRaises(ReleaseContractError):
            task.run_task(self.identity, approval="f" * 64, rollback_approval=self.approval,
                          run=self.command, controller=self.controller)
        self.context.assert_not_called()
        self.assertFalse(self.phases)

    def test_changed_fresh_baseline_blocks_before_arming(self):
        observations = copy.deepcopy(job._observations(self.original))
        observations["candidate"]["ciRunId"] += 1
        self.observe.return_value = plan.create_rollback_review(
            release_state=self.original["releaseStateRaw"].encode(),
            target_inventory=self.original["targetMigrationInventory"],
            created_at=self.case.rb.base.time, **observations)
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertFalse(self.phases)
        self.assertFalse(guard.status()["maintenance"])

    def test_default_rollback_observer_receives_bounded_callbacks_and_cached_only(self):
        with patch.object(collector, "collect_rollback", return_value=self.fresh) as observe:
            self.assertEqual(self.execute(observe=None)["outcome"], "ROLLED_BACK")
        self.assertFalse(observe.call_args.kwargs["cache_images"])
        self.assertIs(observe.call_args.kwargs["controller"], self.controller)

    def test_partial_create_stays_pending_without_start_replay_or_outer_rewrite(self):
        self.case.partial = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        self.assertEqual(guard.status()["candidate"]["containers"], {})
        self.assertEqual(self.state["phase"], "pending")
        self.assertFalse(any(args[:2] == ["docker", "start"] for args, _ in self.calls))
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(len(self.case.creates), 1)

    def test_start_unknown_stops_saved_ids_and_preserves_real_pending_history(self):
        self.fail_start = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.state["phase"], "pending")
        self.assertEqual(self.writes, [])
        self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))

    def test_final_readiness_failure_keeps_target_env_and_pending(self):
        self.fail_readiness = 2
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertIn(values.OLD.encode(), self.env)
        self.assertEqual(self.state["phase"], "pending")
        self.assertEqual(self.writes, [])
        self.assertEqual(guard.status()["phase"], "INCIDENT")

    def test_budget_exhausted_before_freeze_never_arms(self):
        with self.assertRaises(ReleaseContractError):
            self.execute(clock=Mock(side_effect=[0, task.RUN_BUDGET_SECONDS]))
        self.assertFalse(self.phases)
        self.assertFalse(self.calls)

    def test_budget_at_registration_never_starts_and_stop_post_fences_without_plan(self):
        def expire(root, value, **kwargs):
            self.record(root, value, **kwargs)
            if value["phase"] == "CANDIDATES_REGISTERED":
                self.seconds = task.RUN_BUDGET_SECONDS
        with patch.object(guard, "_write", side_effect=expire), self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")
        self.assertFalse(any(args[:2] == ["docker", "start"] for args, _ in self.calls))
        # StopPost has its independent budget/lock; no need to parse the saved plan.
        cleanup = guard.cleanup_after_task
        with patch.object(guard, "_write", side_effect=self.real_write), \
             patch.object(storage, "load_rollback_review", side_effect=OSError("unavailable")), \
             patch.dict(os.environ, {"SERVICE_RESULT": "timeout"}), \
             patch.object(guard, "cleanup_after_task", wraps=lambda identity, result, run:
                cleanup(identity, result, controller=self.controller, run=run,
                              now=lambda: self.case.rb.base.time)):
            result = task.cleanup_task(self.identity, rollback_approval=self.approval, run=self.command)
        self.assertEqual(result["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertEqual(guard.status()["phase"], "INCIDENT")

    def test_remaining_task_budget_caps_all_commands_and_readiness(self):
        def observe(**kwargs):
            self.seconds = task.RUN_BUDGET_SECONDS - 2
            return self.fresh
        self.observe.side_effect = observe
        self.assertEqual(self.execute()["outcome"], "ROLLED_BACK")
        self.assertTrue(all(0 < kwargs["timeout"] <= 2 for _, kwargs in self.calls))

    def test_unknown_final_marker_does_not_rewrite_actual_committed_phase(self):
        def unknown(root, value, **kwargs):
            self.record(root, value, **kwargs)
            if value["phase"] == "HANDOFF_COMMITTED":
                raise OSError("committed marker outcome unknown")
        with patch.object(guard, "_write", side_effect=unknown), self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "HANDOFF_COMMITTED")
        self.assertEqual(self.writes, ["rolled-back"])
        self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))

    def test_clear_unknown_after_unlink_keeps_committed_release_without_replay(self):
        clear = finalizer._clear_committed
        def unknown(*args):
            clear(*args)
            raise OSError("clear outcome unknown")
        with patch.object(finalizer, "_clear_committed", side_effect=unknown), self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(self.state["phase"], "rolled-back")
        self.assertEqual(self.writes, ["rolled-back"])
        self.assertTrue(all(row["State"]["Running"] for row in self.info.values()))

    def test_stop_post_after_clear_does_not_recreate_marker_or_stop_committed_release(self):
        self.execute()
        self.calls.clear()
        with patch.dict(os.environ, {"SERVICE_RESULT": "signal"}):
            result = task.cleanup_task(self.identity, rollback_approval=self.approval, run=self.command)
        self.assertEqual(result["outcome"], "NO_RECORDED_MAINTENANCE")
        self.assertFalse(self.calls)
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(self.state["phase"], "rolled-back")
        self.assertTrue(all(row["State"]["Running"] for row in self.info.values()))

    def test_competing_task_or_plan_lock_prevents_pipeline(self):
        for acquire in (job._locked_directory, storage.preparation_lock):
            with acquire(), self.assertRaises(ReleaseContractError):
                self.execute()
        self.assertFalse(self.phases)
        self.assertFalse(self.calls)


if __name__ == "__main__":
    unittest.main()
