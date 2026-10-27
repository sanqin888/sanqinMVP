"""Offline whole-task no-SQL flow; real stage bodies, modeled Docker/PID1/proofs."""

from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_create_candidates as fixtures
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
from test_deployment_plan import OLD, NEW, NOW, inputs


class ReleasePipelineTests(unittest.TestCase):
    def setUp(self):
        self.case = fixtures.CreateOnlyTests(
            "test_create_only_is_locked_exact_and_keeps_pending_and_maintenance")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        # Reset ONLY this disposable test fixture to its pre-freeze state.
        self.case.fixture.marker.unlink()
        self.info = self.case.fixture.info
        self.policies = {"api": {"Name": "on-failure", "MaximumRetryCount": 7},
                         "ubereats-worker": {"Name": "unless-stopped", "MaximumRetryCount": 0},
                         "web": {"Name": "no", "MaximumRetryCount": 0}}
        for service, identifier in self.case.fixture.ids.items():
            self.info[identifier]["State"].update(Status="running", Running=True)
            self.info[identifier]["HostConfig"]["RestartPolicy"] = copy.deepcopy(self.policies[service])
        self.env = ("PRIVATE_FIXTURE=DO_NOT_PRINT\nSANQ_IMAGE_SHA=" + OLD + "\n").encode()
        self.values = self.case.values
        self.values["current"]["configurationSha256"] = hashlib.sha256(
            self.env + b"\0rendered-compose\0" + plan._canonical(self.case.expanded)).hexdigest()
        self.identity = storage.save_plan(plan.create_plan(created_at=NOW, **self.values))
        self.fresh = plan.create_plan(created_at=self.case.fixture.time, **self.values)
        self.observe = Mock(return_value=self.fresh)
        self.controller = self.case.controller
        self.controller.RELEASE_LINE = deploy.RELEASE_LINE
        self.state = {"schemaVersion": 1, "phase": "active", "current": OLD, "previous": "c" * 40,
                      "reason": "readiness-verified", "updatedAt": NOW}
        self.calls, self.phases, self.writes = [], [], []
        self.elapsed, self.readiness_count = 0, 0
        self.fail_readiness = None
        self.stack = self.case.stack
        self.context = self.stack.enter_context(patch.object(task, "_context"))
        self.stack.enter_context(patch.object(starter, "_pending_and_config",
                                              side_effect=self.pending_config))
        self.stack.enter_context(patch.object(finalizer, "_state",
                                              side_effect=lambda c: copy.deepcopy(self.state)))
        self.stack.enter_context(patch.object(finalizer, "_env_metadata", return_value=(0, 0, 0o600)))
        self.stack.enter_context(patch.object(finalizer, "_sync_runtime"))
        self.stack.enter_context(patch.object(finalizer, "_target_binding", side_effect=self.target_config))
        private = collector._private_bytes
        self.stack.enter_context(patch.object(collector, "_private_bytes",
            side_effect=lambda p, owner, **kw: self.env if p == self.controller.ENV
            else private(p, owner, **kw)))
        self.real_write = guard._write
        self.stack.enter_context(patch.object(guard, "_write", side_effect=self.record))
        original_pending = self.controller.write_creation_pending.side_effect
        def pending(current, target):
            original_pending(current, target)
            self.state.update(phase="pending", current=target, previous=current,
                              reason="candidate-create-start")
        self.controller.write_creation_pending.side_effect = pending
        def env_write(path, text):
            self.assertEqual(guard.status()["phase"], "FINALIZING")
            self.env = text.encode()
            for service in guard.SERVICES:
                name = "sanq-web" if service == "web" else "sanq-api"
                self.case.expanded["services"][service]["image"] = self.values["candidate"]["images"][name]["ref"]
        self.controller.atomic_write.side_effect = env_write
        def state_write(phase, **kwargs):
            self.assertEqual(guard.status()["phase"], "FINALIZING")
            self.writes.append(phase)
            self.state.update(phase=phase, **kwargs)
        self.controller.write_state.side_effect = state_write
        self.case.fixture.calls.clear()
        self.case.calls.clear()

    def record(self, root, value, **kwargs):
        self.assert_locked()
        self.phases.append(value["phase"])
        return self.real_write(root, value, **kwargs)

    def assert_locked(self):
        with self.assertRaises(ReleaseContractError):
            with job._locked_directory():
                pass
        with self.assertRaises(ReleaseContractError):
            with storage.preparation_lock():
                pass

    def pending_config(self, original, controller, run):
        self.assertEqual((self.state["phase"], self.state["current"]), ("pending", NEW))
        self.assertIn(OLD.encode(), self.env)
        return self.case.expanded

    def target_config(self, original, env, expanded, metadata, controller, run):
        self.assertEqual(env, self.env)
        self.assertEqual(expanded, self.case.expanded)
        return expanded

    def observe_command(self, args, **kwargs):
        self.assert_locked()
        self.calls.append((args[:], kwargs))
        if args[:2] == ["docker", "start"]:
            self.assertEqual(guard.status()["phase"], "STARTING_CANDIDATES")
            self.assertIn(args[-1], self.case.ids.values())
            self.info[args[-1]]["State"] = {
                "Status": "running", "Running": True, "Restarting": False, "Paused": False,
                "Health": {"Status": "healthy"}}
            return ""
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            identifier = args[-1]
            if identifier not in self.info:
                raise ReleaseContractError("removed old fixture")
            row = self.info[identifier]
            if args[1] == "update":
                name, separator, retries = args[2].removeprefix("--restart=").partition(":")
                row["HostConfig"]["RestartPolicy"] = {
                    "Name": name, "MaximumRetryCount": int(retries) if separator else 0}
            else:
                row["State"].update(Status="exited", Running=False)
            return ""
        if args[0] == "bash":
            self.readiness_count += 1
            if self.readiness_count == self.fail_readiness:
                raise ReleaseContractError("modeled readiness failure")
            return ""
        if args[:3] == ["docker", "image", "inspect"] and args[-1] in (
                "sha256:" + "c" * 64, "sha256:" + "d" * 64):
            return self.case.fixture.observe_command(args, **kwargs)
        return self.case.observe_command(args, **kwargs)

    def execute(self, **kwargs):
        return task.run_task(self.identity, controller=self.controller, run=self.observe_command,
            observe=self.observe, fetch=Mock(), now=lambda: self.case.fixture.time,
            clock=kwargs.pop("clock", lambda: self.elapsed), pause=Mock(), **kwargs)

    def test_all_stage_bodies_share_locks_plan_attempt_and_finish_active_once(self):
        result = self.execute()
        self.assertEqual(result["outcome"], "ACTIVE")
        self.assertEqual(result["currentSha"], NEW)
        self.assertEqual(self.state["phase"], "active")
        self.assertEqual(self.writes, ["active"])
        self.assertEqual(self.phases, ["ARMED", "FROZEN", "CREATING_CANDIDATES",
            "CANDIDATES_REGISTERED", "STARTING_CANDIDATES", "CANDIDATES_READY",
            "FINALIZING", "HANDOFF_COMMITTED"])
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(len(self.case.creates), 1)
        self.assertEqual([args[-1] for args, _ in self.calls if args[:2] == ["docker", "start"]],
                         [self.case.ids[s] for s in guard.SERVICES])
        for service, identifier in self.case.ids.items():
            self.assertEqual(self.info[identifier]["HostConfig"]["RestartPolicy"], self.policies[service])
        self.observe.assert_called_once_with(NEW, cache_images=False)
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any("up" in args or "pull" in args or "build" in args for args, _ in self.calls))
        with self.assertRaises(ReleaseContractError):
            self.execute()  # Stale pre-release observations cannot be replayed.
        self.assertEqual(len(self.case.creates), 1)

    def test_pending_sql_rejected_before_freeze_and_dispatch(self):
        raw = plan.create_plan(created_at=NOW, **inputs())
        self.identity = storage.save_plan(raw)
        with self.assertRaises(ReleaseContractError):
            self.execute()
        with patch.object(task, "_installed"), self.assertRaises(ReleaseContractError):
            task.submit(self.identity, run=self.observe_command, now=lambda: self.case.fixture.time)
        self.assertFalse(self.phases)
        self.assertFalse(guard.status()["maintenance"])

    def test_missing_controller_api_is_rejected_before_maintenance(self):
        self.controller.write_creation_pending = None
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertFalse(self.phases)
        self.assertFalse(self.calls)

    def test_partial_create_retains_empty_intent_pending_and_never_starts(self):
        self.case.fail_create = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        marker = guard.status()
        self.assertEqual(marker["phase"], "CREATING_CANDIDATES")
        self.assertEqual(marker["candidate"]["containers"], {})
        self.assertEqual(self.state["phase"], "pending")
        self.assertFalse(any(args[:2] == ["docker", "start"] for args, _ in self.calls))
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(len(self.case.creates), 1)

    def test_start_readiness_failure_keeps_incident_and_stops_saved_writers(self):
        self.fail_readiness = 1
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.state["phase"], "pending")
        self.assertFalse(self.writes)
        self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
        self.assertTrue(all(row["HostConfig"]["RestartPolicy"]["Name"] == "no" for row in self.info.values()))

    def test_final_readiness_failure_preserves_target_env_pending_and_incident(self):
        self.fail_readiness = 2
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertIn(NEW.encode(), self.env)
        self.assertEqual(self.state["phase"], "pending")
        self.assertFalse(self.writes)

    def test_clear_unknown_after_unlink_is_not_recreated_retried_or_rolled_back(self):
        clear = finalizer._clear_committed
        def unknown(*args):
            clear(*args)
            raise OSError("clear outcome unknown")
        with patch.object(finalizer, "_clear_committed", side_effect=unknown):
            with self.assertRaises(ReleaseContractError):
                self.execute()
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(self.state["phase"], "active")
        self.assertEqual(self.writes, ["active"])
        self.assertTrue(all(row["State"]["Running"] for row in self.info.values()))

    def test_committed_marker_unknown_stops_saved_ids_without_rewriting_record(self):
        def unknown(root, value, **kwargs):
            self.record(root, value, **kwargs)
            if value["phase"] == "HANDOFF_COMMITTED":
                raise OSError("commit durability unknown")
        with patch.object(guard, "_write", side_effect=unknown):
            with self.assertRaises(ReleaseContractError):
                self.execute()
        self.assertEqual(guard.status()["phase"], "HANDOFF_COMMITTED")
        self.assertEqual(self.state["phase"], "active")
        self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
        self.assertEqual(self.phases[-1], "HANDOFF_COMMITTED")

    def test_time_budget_exhaustion_before_freeze_has_no_maintenance_mutation(self):
        with self.assertRaises(ReleaseContractError):
            self.execute(clock=Mock(side_effect=[0, task.RUN_BUDGET_SECONDS]))
        self.assertFalse(self.phases)
        self.assertFalse(self.calls)

    def test_exhaustion_at_registration_never_advances_to_start(self):
        def expire(root, value, **kwargs):
            self.record(root, value, **kwargs)
            if value["phase"] == "CANDIDATES_REGISTERED":
                self.elapsed = task.RUN_BUDGET_SECONDS
        with patch.object(guard, "_write", side_effect=expire):
            with self.assertRaises(ReleaseContractError):
                self.execute()
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")
        self.assertFalse(any(args[:2] == ["docker", "start"] for args, _ in self.calls))

    def test_remaining_budget_caps_every_command_and_readiness_timeout(self):
        def observe(*args, **kwargs):
            self.elapsed = task.RUN_BUDGET_SECONDS - 2
            return self.fresh
        self.observe.side_effect = observe
        self.assertEqual(self.execute()["outcome"], "ACTIVE")
        self.assertTrue(self.calls)
        self.assertTrue(all(0 < kwargs["timeout"] <= 2 for _, kwargs in self.calls))

    def test_competing_task_or_plan_probe_cannot_enter_pipeline(self):
        for acquire in (job._locked_directory, storage.preparation_lock):
            with acquire(), self.assertRaises(ReleaseContractError):
                self.execute()
        self.assertFalse(self.phases)
        self.assertFalse(self.calls)

    def test_old_maintenance_confirmation_cannot_queue_full_release(self):
        with patch.object(task, "submit") as submit, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                task.main(["submit", self.identity, "--confirm-maintenance"])
        submit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
