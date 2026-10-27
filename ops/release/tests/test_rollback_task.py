"""Offline rollback dispatch, manager binding and observations; no real systemd."""
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
import test_release_task as contexts
import test_rollback_review as reviews
import test_deployment_plan as fixtures
import release_task as task
import maintenance_guard as guard
import deployment_plan as plan
import deployment_plan_store as storage
from release_contract import ReleaseContractError


class RollbackTaskContextTests(unittest.TestCase):
    def setUp(self):
        self.case = contexts.TaskContextTests("test_real_context_contract_accepts_run_and_stop_post_roles")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.forward = self.case.identity
        review = reviews.RollbackReviewTests("test_review_binds_original_state_and_lists_extra_sql_without_authority")
        review.setUp()
        self.raw, self.identity = review.make()
        storage.save_rollback_review(self.raw)
        self.approval = plan.rollback_review_summary(self.raw, self.identity)["compatibilityApprovalSha256"]
        unit = task._unit(self.identity)
        self.case.fields.update(ControlGroup="/system.slice/" + unit,
            FragmentPath="/run/systemd/transient/" + unit,
            ExecStart="{ argv[]=" + task._command("run", self.identity, rollback_approval=self.approval) + " ; ignore_errors=no ; }",
            ExecStopPost="{ argv[]=" + task._command("cleanup", self.identity, rollback_approval=self.approval) + " ; ignore_errors=no ; }")
        self.case.stack.enter_context(patch.object(task, "_cgroup", return_value="/system.slice/" + unit))

    def submit(self, approval=None):
        return task.submit_rollback(self.identity, approval=self.approval if approval is None else approval,
            run=self.case.observe_command, now=lambda: self.case.fixture.time)

    def test_queue_is_async_and_binds_exact_compatibility_to_run_and_stop_post(self):
        result = self.submit()
        self.assertEqual(result["outcome"], "SUBMITTED")
        self.assertFalse(result["canExecute"])
        args = self.case.calls[-1]
        self.assertEqual(args[-4:], ["run", self.identity, "--approve-compatibility", self.approval])
        self.assertIn("--property=ExecStopPost=" + task._command("cleanup", self.identity,
            rollback_approval=self.approval), args)
        for item in ("--no-block", "--remain-after-exit", "--service-type=oneshot",
                     "--property=Restart=no", "--property=KillMode=control-group",
                     "--property=TimeoutStartSec=2100", "--property=TimeoutStopSec=900",
                     "--property=MemoryMax=256M", "--property=CPUQuota=50%"):
            self.assertIn(item, args)
        for item in ("--wait", "--scope", "--pty", "--pipe", "--collect", "--replace", "--approve-sql"):
            self.assertNotIn(item, args)
        task._context(self.identity, "run", self.case.observe_command, rollback_approval=self.approval)
        self.case.fields.update(ActiveState="deactivating", SubState="stop-post")
        task._context(self.identity, "cleanup", self.case.observe_command, rollback_approval=self.approval)

    def test_missing_bad_boolean_wrong_and_mixed_approval_never_dispatch(self):
        for approval in (None, True, False, "", "0" * 64, self.identity, "../bad"):
            with self.subTest(approval=approval), self.assertRaises(ReleaseContractError):
                task.submit_rollback(self.identity, approval=approval, run=self.case.observe_command,
                                     now=lambda: self.case.fixture.time)
        with self.assertRaises(ReleaseContractError):
            task.submit(self.identity, approval="f" * 64, rollback_approval=self.approval,
                        run=self.case.observe_command)
        with self.assertRaises(ReleaseContractError):
            task.submit(self.identity, run=self.case.observe_command, now=lambda: self.case.fixture.time)
        with self.assertRaises(ReleaseContractError):
            task.submit_rollback(self.forward, approval=self.approval,
                run=self.case.observe_command, now=lambda: self.case.fixture.time)
        self.assertEqual(self.case.calls, [])

    def test_expired_review_or_maintenance_never_queues(self):
        with self.assertRaises(ReleaseContractError):
            task.submit_rollback(self.identity, approval=self.approval, run=self.case.observe_command,
                                 now=lambda: "2026-10-27T17:00:01Z")
        self.case.fixture.marker.write_bytes(b"unresolved")
        with self.assertRaises(ReleaseContractError):
            self.submit()
        self.assertEqual(self.case.calls, [])

    def test_unknown_dispatch_is_called_once_and_not_assumed_failed(self):
        run = Mock(side_effect=OSError("dispatch outcome unknown"))
        with self.assertRaises(OSError):
            task.submit_rollback(self.identity, approval=self.approval, run=run,
                                 now=lambda: self.case.fixture.time)
        run.assert_called_once()
        self.assertFalse(self.case.fixture.marker.exists())

    def test_context_rejects_missing_wrong_or_sql_substitution(self):
        for kwargs in ({}, {"rollback_approval": "0" * 64}, {"approval": self.approval},
                       {"approval": self.approval, "rollback_approval": self.approval}):
            with self.assertRaises(ReleaseContractError):
                task._context(self.identity, "run", self.case.observe_command, **kwargs)
        self.case.fields["ExecStopPost"] = self.case.fields["ExecStopPost"].replace(self.approval, "0" * 64)
        with self.assertRaises(ReleaseContractError):
            task._context(self.identity, "run", self.case.observe_command, rollback_approval=self.approval)

    def test_direct_wrong_pid_cgroup_or_restart_cannot_reach_stages(self):
        for changes in ({"ControlPID": "0", "MainPID": "0"}, {"ControlGroup": "/user.slice"},
                        {"Restart": "always"}):
            original = self.case.fields.copy()
            self.case.fields.update(changes)
            with patch.object(guard, "_freeze_rollback_for_plan_locked") as freeze, self.assertRaises(ReleaseContractError):
                task.run_task(self.identity, rollback_approval=self.approval, run=self.case.observe_command)
            freeze.assert_not_called()
            self.case.fields.clear()
            self.case.fields.update(original)

    def test_stop_post_authenticates_digest_and_result_without_loading_any_plan(self):
        self.case.fields.update(ActiveState="deactivating", SubState="stop-post")
        with patch.object(storage, "load_plan", side_effect=OSError("missing")) as forward, \
             patch.object(storage, "load_rollback_review", side_effect=OSError("missing")) as rollback, \
             patch.dict(os.environ, {"SERVICE_RESULT": "signal"}), \
             patch.object(guard, "cleanup_after_task", return_value={"outcome": "retained"}) as cleanup:
            task.cleanup_task(self.identity, rollback_approval=self.approval, run=self.case.observe_command)
        forward.assert_not_called()
        rollback.assert_not_called()
        cleanup.assert_called_once_with(self.identity, "signal", run=self.case.observe_command)
        self.case.fields["ControlPID"] = "0"
        with patch.object(guard, "cleanup_after_task") as cleanup, self.assertRaises(ReleaseContractError):
            task.cleanup_task(self.identity, rollback_approval=self.approval, run=self.case.observe_command)
        cleanup.assert_not_called()

    def test_installed_gate_rejects_missing_rollback_stage_or_old_signatures(self):
        source = self.case.fixture.parent / "release_task.py"
        source.write_text("# fixture")
        source.chmod(0o644)
        with patch.object(task, "__file__", str(source)), patch.object(task, "TASK_SCRIPT", source):
            self.case.real_installed()
            with patch.object(guard, "_freeze_rollback_for_plan_locked", None), self.assertRaises(ReleaseContractError):
                self.case.real_installed()
            for owner, name in ((guard, "_prepare_candidate_containers_locked"),
                                (task.starter, "_start_and_verify_locked"), (task.finalizer, "_finalize_ready_locked")):
                with patch.object(owner, name, lambda *a, pending_config=None, **kw: None), self.assertRaises(ReleaseContractError):
                    self.case.real_installed()

    def test_cli_requires_rollback_confirmation_and_routes_exact_scope(self):
        with patch.object(task, "submit_rollback", return_value={}) as submit, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(task.main(["submit-rollback", self.identity, "--confirm-rollback",
                                        "--approve-compatibility", self.approval]), 0)
        submit.assert_called_once_with(self.identity, approval=self.approval)
        for args in (["submit-rollback", self.identity, "--approve-compatibility", self.approval],
                     ["submit-rollback", self.identity, "--confirm-rollback"],
                     ["submit", self.identity, "--confirm-release", "--approve-compatibility", self.approval],
                     ["run", self.identity, "--approve-sql", self.approval, "--approve-compatibility", self.approval]):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                task.main(args)
        with patch.object(task, "run_task", return_value={}) as run, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(task.main(["run", self.identity, "--approve-compatibility", self.approval]), 0)
        run.assert_called_once_with(self.identity, rollback_approval=self.approval)

    def test_cli_status_and_errors_do_not_resume_or_echo_arbitrary_text(self):
        with patch.object(task, "status", return_value={}) as status, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(task.main(["status-rollback", self.identity]), 0)
        status.assert_called_once_with(self.identity, rollback=True)
        with patch.object(task, "submit_rollback", side_effect=ValueError("DO_NOT_PRINT")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(task.main(["submit-rollback", self.identity, "--confirm-rollback",
                                        "--approve-compatibility", self.approval]), 1)
        self.assertNotIn("DO_NOT_PRINT", output.getvalue())


class RollbackStatusTests(unittest.TestCase):
    def setUp(self):
        self.case = contexts.JointStatusTests("test_target_running_is_an_observation_never_operation_success_or_permission")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.case.state.update(phase="rolled-back", reason="rollback-verified")
        self.case.original["migrationHistory"] = [{"name": "full-current-history"}]
        self.case.stack.enter_context(patch.object(storage, "load_rollback_review", return_value=b"fixture"))
        self.case.stack.enter_context(patch.object(plan, "validate_rollback_review", return_value=self.case.original))
        self.history = self.case.stack.enter_context(patch.object(task.collector, "_history",
            return_value=copy.deepcopy(self.case.original["migrationHistory"])))

    def observe(self):
        return task._release_observation(self.case.identity, controller=self.case.controller,
                                         run=self.case.run, rollback=True)

    def test_matching_rolled_back_runtime_and_full_history_is_only_an_observation(self):
        result = self.observe()
        self.assertEqual(result["outcome"], "TARGET_RUNNING_OBSERVED")
        self.assertFalse(result["operationSuccessProven"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(self.history.call_count, 2)

    def test_active_wrong_direction_or_reason_is_incomplete(self):
        for changes in ({"phase": "active"}, {"reason": "readiness-verified"},
                        {"current": self.case.old}, {"previous": self.case.target}):
            old = self.case.state.copy()
            self.case.state.update(changes)
            self.assertEqual(self.observe()["outcome"], "RELEASE_INCOMPLETE")
            self.case.state.clear()
            self.case.state.update(old)
        self.case.writers.assert_not_called()

    def test_retained_marker_remains_unresolved_even_after_rolled_back_commit(self):
        self.case.marker.return_value = {"planId": self.case.identity, "phase": "HANDOFF_COMMITTED"}
        self.assertEqual(self.observe()["outcome"], "MAINTENANCE_RETAINED")
        self.case.writers.assert_not_called()

    def test_history_change_between_observations_is_unknown(self):
        self.history.side_effect = [self.case.original["migrationHistory"], []]
        self.assertEqual(self.observe()["outcome"], "UNKNOWN")

    def test_forward_status_does_not_guess_rollback_kind(self):
        self.assertEqual(self.case.observe()["outcome"], "RELEASE_INCOMPLETE")
        self.history.assert_not_called()


if __name__ == "__main__":
    unittest.main()
