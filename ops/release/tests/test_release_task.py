"""Offline transient-task context and stop-post lifecycle; no real systemd/Docker."""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import unittest
from unittest.mock import Mock, patch

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_task as task
import maintenance_guard as guard
from release_contract import ReleaseContractError
import test_maintenance_guard as fixtures


class TaskContextTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.MaintenanceFlowTests(
            "test_original_policies_persist_before_changes_and_all_writers_confirm_stopped")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        values = fixtures.inputs()
        values["pending"] = []
        values["history"] = [{"name": row["name"], "sha256": row["sha256"], "state": "applied"}
                             for row in values["inventory"]]
        raw = task.plan.create_plan(created_at=fixtures.NOW, **values)
        self.fixture.identity = task.storage.save_plan(raw)
        self.fixture.observer.return_value = task.plan.create_plan(created_at=self.fixture.time, **values)
        self.identity = self.fixture.identity
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.real_installed = task._installed
        self.installed = self.stack.enter_context(patch.object(task, "_installed"))
        self.stack.enter_context(patch.object(task, "_cgroup",
            return_value="/system.slice/" + task._unit(self.identity)))
        self.stack.enter_context(patch.object(task.Path, "cwd", return_value=task.RUNTIME_ROOT))
        unit = task._unit(self.identity)
        self.fields = {"LoadState": "loaded", "Transient": "yes", "Type": "oneshot",
            "Restart": "no", "RemainAfterExit": "yes", "KillMode": "control-group",
            "ActiveState": "activating", "SubState": "start", "MainPID": str(os.getpid()),
            "ControlPID": str(os.getpid()), "ControlGroup": "/system.slice/" + unit,
            "ExecStart": "{ argv[]=" + task._command("run", self.identity) + " ; ignore_errors=no ; }",
            "ExecStopPost": "{ argv[]=" + task._command("cleanup", self.identity) + " ; ignore_errors=no ; }",
            "NeedDaemonReload": "no", "DropInPaths": "",
            "FragmentPath": "/run/systemd/transient/" + unit,
            "WorkingDirectory": str(task.RUNTIME_ROOT), "User": "root", "Result": "success"}
        self.calls = []

    def observe_command(self, args, **kwargs):
        self.calls.append(args)
        if args[:2] == ["systemctl", "show"]:
            keys = args[-1].partition("=")[2].split(",")
            return "\n".join(f"{key}={self.fields[key]}" for key in keys)
        return "queued or journal fixture\n"

    def test_installed_helper_rejects_missing_cleanup_api_and_writable_source(self):
        source = self.fixture.parent / "release_task.py"
        source.write_text("# fixture")
        source.chmod(0o644)
        with patch.object(task, "__file__", str(source)), patch.object(task, "TASK_SCRIPT", source):
            self.real_installed()
            for api in ("cleanup_after_task", "begin_candidate_creation", "register_created_candidates",
                        "prepare_candidate_containers", "_incident_locked",
                        "_freeze_for_plan_locked", "_prepare_candidate_containers_locked"):
                with patch.object(guard, api, None), self.assertRaises(ReleaseContractError):
                    self.real_installed()
            with patch.object(task.starter, "start_and_verify", None), self.assertRaises(ReleaseContractError):
                self.real_installed()
            with patch.object(task.finalizer, "finalize_ready", None), self.assertRaises(ReleaseContractError):
                self.real_installed()
            with patch.object(task.starter, "_start_and_verify_locked", None), self.assertRaises(ReleaseContractError):
                self.real_installed()
            with patch.object(task.finalizer, "_finalize_ready_locked", None), self.assertRaises(ReleaseContractError):
                self.real_installed()
            with patch.object(task.starter, "_running", lambda *args: None), self.assertRaises(ReleaseContractError):
                self.real_installed()
            source.chmod(0o666)
            with self.assertRaises(ReleaseContractError):
                self.real_installed()

    def test_submission_is_asynchronous_bounded_and_contains_fixed_stop_post(self):
        result = task.submit(self.identity, run=self.observe_command, now=lambda: self.fixture.time)
        self.assertEqual(result["outcome"], "SUBMITTED")
        self.assertFalse(result["canExecute"])
        args = self.calls[-1]
        self.assertEqual(args[0], "systemd-run")
        for option in ("--no-block", "--remain-after-exit", "--service-type=oneshot",
                       "--property=User=root", "--property=Restart=no", "--property=KillMode=control-group",
                       "--property=TimeoutStartSec=2100", "--property=TimeoutStopSec=900",
                       "--property=MemoryMax=256M", "--property=CPUQuota=50%",
                       "--property=WorkingDirectory=" + str(task.RUNTIME_ROOT)):
            self.assertIn(option, args)
        self.assertIn("--property=ExecStopPost=" + task._command("cleanup", self.identity), args)
        self.assertEqual(args[-5:], ["/usr/bin/python3", "-B", str(task.TASK_SCRIPT),
                                     "run", self.identity])
        for forbidden in ("--scope", "--wait", "--pty", "--pipe", "--collect", "--replace"):
            self.assertNotIn(forbidden, args)

    def test_unknown_dispatch_result_is_not_retried_or_assumed_to_have_failed(self):
        observe = Mock(side_effect=ReleaseContractError("unknown dispatch"))
        with self.assertRaises(ReleaseContractError):
            task.submit(self.identity, run=observe, now=lambda: self.fixture.time)
        observe.assert_called_once()
        self.assertEqual(observe.call_args.args[0][0], "systemd-run")

    def test_uninstalled_or_existing_maintenance_prevents_dispatch(self):
        self.installed.side_effect = ReleaseContractError("uninstalled")
        with self.assertRaises(ReleaseContractError):
            task.submit(self.identity, run=self.observe_command)
        self.assertFalse(self.calls)
        self.installed.side_effect = None
        self.fixture.marker.write_bytes(b"retained evidence")
        with self.assertRaises(ReleaseContractError):
            task.submit(self.identity, run=self.observe_command)
        self.assertFalse(self.calls)

    def test_real_context_contract_accepts_run_and_stop_post_roles(self):
        task._context(self.identity, "run", self.observe_command)
        self.fields.update(ActiveState="deactivating", SubState="stop-post")
        task._context(self.identity, "cleanup", self.observe_command)

    def test_direct_wrong_pid_cgroup_restart_or_command_is_rejected(self):
        cases = [{"ControlPID": "0", "MainPID": "0"}, {"ControlGroup": "/user.slice"},
                 {"Restart": "always"}, {"Type": "exec"}, {"RemainAfterExit": "no"},
                 {"DropInPaths": "override.conf"}, {"WorkingDirectory": "/"},
                 {"ExecStart": self.fields["ExecStart"].replace(self.identity, "f" * 64)},
                 {"ExecStopPost": self.fields["ExecStopPost"].replace("ignore_errors=no", "ignore_errors=yes")}]
        for changes in cases:
            original = self.fields.copy()
            self.fields.update(changes)
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                task._context(self.identity, "run", self.observe_command)
            self.fields.clear()
            self.fields.update(original)
        with patch.object(task, "_cgroup", return_value="/other"), self.assertRaises(ReleaseContractError):
            task._context(self.identity, "run", self.observe_command)

    def test_invalid_manager_context_never_enters_release_stages(self):
        self.fields["ControlPID"] = self.fields["MainPID"] = "0"
        with patch.object(guard, "_freeze_for_plan_locked") as freeze, self.assertRaises(ReleaseContractError):
            task.run_task(self.identity, run=self.observe_command)
        freeze.assert_not_called()

    def test_cleanup_requires_control_pid_and_uses_manager_result_only_after_validation(self):
        self.fields.update(ActiveState="deactivating", SubState="stop-post")
        with patch.dict(os.environ, {"SERVICE_RESULT": "signal"}), \
             patch.object(guard, "cleanup_after_task", return_value={"canExecute": False}) as cleanup:
            task.cleanup_task(self.identity, run=self.observe_command)
            cleanup.assert_called_once_with(self.identity, "signal", run=self.observe_command)
        self.fields["ControlPID"] = "0"
        with patch.object(guard, "cleanup_after_task") as cleanup, self.assertRaises(ReleaseContractError):
            task.cleanup_task(self.identity, run=self.observe_command)
        cleanup.assert_not_called()

    def test_status_not_found_is_unknown_and_journal_query_is_bounded(self):
        self.fields["LoadState"] = "not-found"
        result = task.status(self.identity, run=self.observe_command)
        self.assertEqual(result["unitState"], {"LoadState": "unknown"})
        self.assertEqual(result["maintenancePhase"], "NO_RECORDED_MAINTENANCE")
        self.assertFalse(result["canExecute"])
        with patch.object(guard, "_properties", side_effect=ReleaseContractError("manager unavailable")):
            self.assertEqual(task.status(self.identity)["unitState"], {"LoadState": "unknown"})
        task.logs(self.identity, run=self.observe_command)
        self.assertEqual(self.calls[-1], ["journalctl", "--unit=" + task._unit(self.identity),
                                         "--no-pager", "--lines=80", "--output=short-iso"])

    def test_invalid_plan_or_missing_confirmation_never_schedules_a_task(self):
        with self.assertRaises(ReleaseContractError):
            task.submit("../other", run=self.observe_command)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            task.main(["submit", self.identity])
        self.assertFalse(self.calls)

    def test_cli_failure_does_not_echo_arbitrary_observation_output(self):
        with patch.object(task, "submit", side_effect=ValueError("DO_NOT_PRINT")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(task.main(["submit", self.identity, "--confirm-release"]), 1)
        self.assertNotIn("DO_NOT_PRINT", output.getvalue())


class StopPostTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.MaintenanceFlowTests(
            "test_original_policies_persist_before_changes_and_all_writers_confirm_stopped")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.identity = self.fixture.identity
        self.calls = []
        self.fail_stop = False

    def seed(self, phase="ARMED"):
        self.fixture.freeze()
        record = guard.status()
        record["phase"] = phase
        record["errorCode"] = "FENCE_UNCONFIRMED" if phase == "INCIDENT" else None
        self.fixture.marker.write_bytes(guard._raw(record))
        if phase != "FROZEN":
            for info in self.fixture.info.values():
                info["HostConfig"]["RestartPolicy"] = {"Name": "always", "MaximumRetryCount": 0}
                info["State"] = {"Status": "running", "Running": True, "Restarting": False, "Paused": False}

    def observe_command(self, args, **kwargs):
        self.calls.append(args)
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            self.assertIn(guard.status()["phase"], ("ARMED", "FROZEN", "INCIDENT"))
            self.assertIn(args[-1], self.fixture.ids.values())
            info = self.fixture.info[args[-1]]
            if args[1] == "update":
                info["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            else:
                if self.fail_stop and args[-1] == self.fixture.ids["api"]:
                    raise ReleaseContractError("stop unavailable")
                info["State"] = {"Status": "exited", "Running": False, "Restarting": False, "Paused": False}
            return ""
        return self.fixture.observe_command(args, **kwargs)

    def cleanup(self, result="signal"):
        return guard.cleanup_after_task(self.identity, result, controller=self.fixture.controller,
                                        run=self.observe_command, now=lambda: self.fixture.time)

    def test_killed_after_arm_stops_exact_writers_and_persists_incident(self):
        self.seed()
        result = self.cleanup()
        self.assertEqual(result["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        marker = guard.status()
        self.assertEqual(marker["phase"], "INCIDENT")
        self.assertEqual(marker["errorCode"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertFalse(marker["canExecute"])
        for info in self.fixture.info.values():
            self.assertFalse(info["State"]["Running"])
        self.assertEqual({args[-1] for args in self.calls if args[:2] == ["docker", "stop"]},
                         set(self.fixture.ids.values()))
        self.assertFalse(any(args[:2] in (["docker", "start"], ["systemctl", "start"]) for args in self.calls))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_killed_after_frozen_and_existing_incident_can_only_remain_incident(self):
        self.seed("FROZEN")
        self.assertEqual(self.cleanup()["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertEqual(self.cleanup()["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertEqual(guard.status()["phase"], "INCIDENT")

    def test_successful_preparation_never_reopens_or_changes_frozen_record(self):
        self.seed("FROZEN")
        before = self.fixture.marker.read_bytes()
        self.assertEqual(self.cleanup("success")["outcome"], "RECORDED_FROZEN")
        self.assertEqual(self.fixture.marker.read_bytes(), before)
        self.assertFalse(self.calls)

    def test_no_prearm_marker_is_not_success_and_never_stops_any_writer(self):
        self.assertEqual(self.cleanup()["outcome"], "NO_RECORDED_MAINTENANCE")
        self.assertFalse(self.calls)
        self.assertFalse(self.fixture.marker.exists())

    def test_foreign_or_corrupt_marker_never_authorizes_container_changes(self):
        self.seed()
        before = self.fixture.marker.read_bytes()
        with self.assertRaises(ReleaseContractError):
            guard.cleanup_after_task("f" * 64, "signal", controller=self.fixture.controller,
                                     run=self.observe_command, now=lambda: self.fixture.time)
        self.assertFalse(self.calls)
        self.assertEqual(self.fixture.marker.read_bytes(), before)
        self.fixture.marker.write_bytes(b"partial")
        with self.assertRaises((ReleaseContractError, ValueError)):
            self.cleanup()
        self.assertFalse(self.calls)
        self.assertEqual(self.fixture.marker.read_bytes(), b"partial")

    def test_unconfirmed_stop_or_gate_never_claims_writers_stopped(self):
        self.seed()
        self.fail_stop = True
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")
        self.assertTrue(self.fixture.info[self.fixture.ids["api"]]["State"]["Running"])
        self.assertEqual(len([args for args in self.calls if args[:2] == ["docker", "stop"]]), 3)

    def test_removed_gate_after_stop_keeps_unconfirmed_incident(self):
        self.seed()
        self.fixture.gate.side_effect = ReleaseContractError("gate changed")
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")

    def test_cleanup_durability_failure_keeps_original_and_residual_evidence(self):
        self.seed()
        with patch.object(guard.os, "fsync", side_effect=OSError("sync unknown")):
            with self.assertRaises(OSError):
                self.cleanup()
        self.assertEqual(guard.status()["phase"], "ARMED")
        self.assertTrue(list(self.fixture.maintenance.glob(".maintenance-*.tmp")))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()



class JointStatusTests(unittest.TestCase):
    def setUp(self):
        from types import SimpleNamespace
        self.identity = "a" * 64
        self.old, self.target = "b" * 40, "c" * 40
        self.controller = SimpleNamespace(ensure_repo_location=Mock())
        self.state = {"phase": "active", "current": self.target, "previous": self.old,
                      "reason": "readiness-verified", "updatedAt": "2026-10-27T00:00:00Z"}
        self.original = {"current": {"applicationSha": self.old, "manifestSha256": "d" * 64},
                         "candidate": {"sourceSha": self.target}, "runtimeContract": {}}
        self.snapshot = ({"applicationSha": self.target, "manifestSha256": "d" * 64}, {}, {})
        self.rows = {name: {"containerId": str(i) * 64, "imageId": "sha256:" + "f" * 64,
                     "restartPolicy": {"Name": "unless-stopped", "MaximumRetryCount": 0}}
                     for i, name in enumerate(guard.SERVICES, 1)}
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        def replace(owner, name, **kwargs):
            return self.stack.enter_context(patch.object(owner, name, **kwargs))
        self.lock = replace(task.job, "_locked_directory",
                            side_effect=lambda: contextlib.nullcontext())
        replace(task.storage, "preparation_lock", side_effect=lambda: contextlib.nullcontext())
        replace(task.storage, "load_plan", return_value=b"fixture")
        replace(task.plan, "validate_plan", return_value=self.original)
        self.marker = replace(guard, "status", return_value={"maintenance": False, "canExecute": False})
        self.read_state = replace(task.finalizer, "_state", side_effect=lambda c: self.state.copy())
        self.snap = replace(task.collector, "_snapshot", return_value=self.snapshot)
        replace(task.plan, "runtime_contract", return_value={})
        replace(task.collector, "_compose", return_value=["docker", "compose", "config"])
        self.run = Mock(return_value=json.dumps({"services": {s: {} for s in guard.SERVICES}}))
        self.real_writers = task._observed_writers
        self.writers = replace(task, "_observed_writers", return_value=self.rows)
        self.roles = replace(guard, "_role_ids",
                             side_effect=lambda s, r: {self.rows[s]["containerId"]})
        self.info = replace(guard, "_inspect",
                            return_value={"State": {"Health": {"Status": "healthy"}}})
        self.mounts = replace(guard, "_created_mounts")
        self.database = replace(guard, "_database_identity", return_value={"id": "db"})

    def observe(self):
        return task._release_observation(self.identity, controller=self.controller, run=self.run)

    def test_target_running_is_an_observation_never_operation_success_or_permission(self):
        result = self.observe()
        self.assertEqual(result["outcome"], "TARGET_RUNNING_OBSERVED")
        self.assertFalse(result["operationSuccessProven"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(result["releaseState"]["current"], self.target)
        self.assertNotIn("reason", result["releaseState"])
        self.assertEqual(self.writers.call_count, 2)
        self.assertEqual(self.run.call_args.args[0], ["docker", "compose", "config"])

    def test_active_with_committed_or_incident_marker_remains_unresolved(self):
        for phase in ("HANDOFF_COMMITTED", "INCIDENT", "FINALIZING"):
            self.marker.return_value = {"planId": self.identity, "phase": phase}
            self.assertEqual(self.observe()["outcome"], "MAINTENANCE_RETAINED")
        self.snap.assert_not_called()
        self.run.assert_not_called()

    def test_foreign_plan_marker_is_not_claimed(self):
        self.marker.return_value = {"planId": "f" * 64, "phase": "INCIDENT"}
        self.assertEqual(self.observe()["maintenancePhase"], "OTHER_PLAN")
        self.writers.assert_not_called()

    def test_pending_rolled_back_other_target_previous_or_reason_is_incomplete(self):
        for key, value in (("phase", "pending"), ("phase", "rolled-back"),
                           ("current", "e" * 40), ("previous", "e" * 40),
                           ("reason", "other")):
            previous = self.state[key]
            self.state[key] = value
            self.assertEqual(self.observe()["outcome"], "RELEASE_INCOMPLETE")
            self.state[key] = previous
        self.writers.assert_not_called()

    def test_invalid_state_or_read_failure_reports_fixed_unknown_without_secret(self):
        for error in (ReleaseContractError("SECRET"), OSError("SECRET"), ValueError("SECRET")):
            self.read_state.side_effect = error
            result = self.observe()
            self.assertEqual(result["outcome"], "UNKNOWN")
            self.assertNotIn("SECRET", json.dumps(result))
        self.read_state.side_effect = lambda c: {**self.state, "current": "bad"}
        self.assertEqual(self.observe()["outcome"], "UNKNOWN")

    def test_busy_lock_returns_unknown_without_observing_runtime(self):
        self.lock.side_effect = ReleaseContractError("busy")
        self.assertEqual(self.observe()["outcome"], "UNKNOWN")
        self.read_state.assert_not_called()
        self.run.assert_not_called()

    def test_real_writer_observation_requires_pinned_refs_health_roles_and_mounts(self):
        images = {name: {"ref": "ghcr.io/sanqin888/" + name + ":" + self.target,
                         "digest": "sha256:" + "f" * 64}
                  for name in ("sanq-api", "sanq-web")}
        candidate = {"sourceSha": self.target, "images": images}
        expanded = {"services": {s: {} for s in guard.SERVICES}}
        self.info.return_value = {"State": {"Status": "running", "Running": True,
            "Restarting": False, "Paused": False, "Health": {"Status": "healthy"}},
            "Image": "sha256:" + "f" * 64, "HostConfig": {
                "RestartPolicy": {"Name": "unless-stopped", "MaximumRetryCount": 0}}}
        with patch.object(guard, "_container_id", side_effect=lambda c, s, r: self.rows[s]["containerId"]), \
             patch.object(task.collector, "_inspect_image"):
            self.assertEqual(len(self.real_writers(self.controller, candidate, expanded, self.run)), 3)
            self.assertTrue(all("@" in call.kwargs["reference"] for call in self.info.call_args_list))
            self.info.return_value["State"]["Health"]["Status"] = "unhealthy"
            with self.assertRaises(ReleaseContractError):
                self.real_writers(self.controller, candidate, expanded, self.run)
            self.info.return_value["State"]["Health"]["Status"] = "healthy"
            self.roles.side_effect = lambda s, r: {"e" * 64}
            with self.assertRaises(ReleaseContractError):
                self.real_writers(self.controller, candidate, expanded, self.run)
            self.roles.side_effect = lambda s, r: {self.rows[s]["containerId"]}
            self.mounts.side_effect = ReleaseContractError("mount changed")
            with self.assertRaises(ReleaseContractError):
                self.real_writers(self.controller, candidate, expanded, self.run)

    def test_state_marker_database_or_snapshot_change_never_combines_old_evidence(self):
        self.read_state.side_effect = [self.state.copy(), {**self.state, "phase": "pending"}]
        self.assertEqual(self.observe()["outcome"], "UNKNOWN")
        self.read_state.side_effect = lambda c: self.state.copy()
        self.marker.side_effect = [{"maintenance": False}, {"planId": self.identity, "phase": "INCIDENT"}]
        self.assertEqual(self.observe()["outcome"], "UNKNOWN")
        self.marker.side_effect = None
        self.database.side_effect = [{"id": "db"}, {"id": "other"}]
        self.assertEqual(self.observe()["outcome"], "UNKNOWN")
        self.database.side_effect = None
        self.snap.side_effect = [self.snapshot, ({"applicationSha": self.old}, {}, {})]
        self.assertEqual(self.observe()["outcome"], "UNKNOWN")

    def test_manager_success_does_not_replace_joint_observation(self):
        with patch.object(task, "_release_observation", return_value={"outcome": "UNKNOWN"}), \
             patch.object(guard, "_properties", return_value={
                 "LoadState": "loaded", "ActiveState": "active", "SubState": "exited", "Result": "success"}):
            result = task.status(self.identity, run=self.run)
        self.assertEqual(result["releaseObservation"]["outcome"], "UNKNOWN")
        self.assertFalse(result["canExecute"])


if __name__ == "__main__":
    unittest.main()
