"""Offline complete SQL task plus manager-bound approval; no real SQL/systemd."""
import copy
import contextlib
import hashlib
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_release_pipeline as pipeline
import test_release_task as contexts
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import maintenance_guard as guard
import migration_container as migration
import release_job as job
import release_task as task
from release_contract import ReleaseContractError


class SQLTaskContextTests(unittest.TestCase):
    def setUp(self):
        self.case = contexts.TaskContextTests(
            "test_real_context_contract_accepts_run_and_stop_post_roles")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.no_sql = self.case.identity
        before = plan.validate_plan(storage.load_plan(self.no_sql), self.no_sql)
        values = job._observations(before)
        last = values["history"].pop()
        values["pending"] = [{key: last[key] for key in ("name", "sha256")}]
        raw = plan.create_plan(created_at=before["createdAt"], **values)
        self.identity = storage.save_plan(raw)
        self.approval = plan.sql_review(raw, self.identity)["approvalSha256"]
        self.case.fields.update(ControlGroup="/system.slice/" + task._unit(self.identity),
            FragmentPath="/run/systemd/transient/" + task._unit(self.identity),
            ExecStart="{ argv[]=" + task._command("run", self.identity, self.approval) + " ; ignore_errors=no ; }",
            ExecStopPost="{ argv[]=" + task._command("cleanup", self.identity, self.approval) + " ; ignore_errors=no ; }")
        self.case.stack.enter_context(patch.object(task, "_cgroup",
            return_value="/system.slice/" + task._unit(self.identity)))

    def test_submission_binds_exact_approval_to_run_and_stop_post(self):
        result = task.submit(self.identity, approval=self.approval,
            run=self.case.observe_command, now=lambda: self.case.fixture.time)
        self.assertEqual(result["outcome"], "SUBMITTED")
        args = self.case.calls[-1]
        self.assertEqual(args[-2:], ["--approve-sql", self.approval])
        self.assertIn("--property=ExecStopPost=" + task._command("cleanup", self.identity, self.approval), args)
        self.assertIn("--no-block", args)
        task._context(self.identity, "run", self.case.observe_command, approval=self.approval)
        self.case.fields.update(ActiveState="deactivating", SubState="stop-post")
        task._context(self.identity, "cleanup", self.case.observe_command, approval=self.approval)

    def test_missing_bad_boolean_wrong_or_unnecessary_approval_never_dispatches(self):
        for approval in (None, True, False, "", "0" * 64, self.identity, "../bad"):
            with self.assertRaises(ReleaseContractError):
                task.submit(self.identity, approval=approval, run=self.case.observe_command,
                            now=lambda: self.case.fixture.time)
        with self.assertRaises(ReleaseContractError):
            task.submit(self.no_sql, approval=self.approval, run=self.case.observe_command,
                        now=lambda: self.case.fixture.time)
        self.assertFalse(self.case.calls)

    def test_manager_rejects_missing_changed_or_mismatched_approval(self):
        for approval in (None, "0" * 64):
            with self.assertRaises(ReleaseContractError):
                task._context(self.identity, "run", self.case.observe_command, approval=approval)
        self.case.fields["ExecStopPost"] = self.case.fields["ExecStopPost"].replace(self.approval, "0" * 64)
        with self.assertRaises(ReleaseContractError):
            task._context(self.identity, "run", self.case.observe_command, approval=self.approval)

    def test_stop_post_authenticates_arguments_without_needing_the_plan(self):
        self.case.fields.update(ActiveState="deactivating", SubState="stop-post")
        with patch.object(storage, "load_plan", side_effect=OSError("plan unavailable")), \
             patch.dict(task.os.environ, {"SERVICE_RESULT": "signal"}), \
             patch.object(guard, "cleanup_after_task", return_value={"outcome": "retained"}) as cleanup:
            task.cleanup_task(self.identity, approval=self.approval, run=self.case.observe_command)
        cleanup.assert_called_once_with(self.identity, "signal", run=self.case.observe_command)

    def test_cli_requires_release_confirmation_and_forwards_only_exact_scope(self):
        with patch.object(task, "submit", return_value={}) as submit, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(task.main(["submit", self.identity, "--confirm-release",
                                        "--approve-sql", self.approval]), 0)
        submit.assert_called_once_with(self.identity, approval=self.approval)
        with patch.object(task, "submit") as submit, contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            task.main(["submit", self.identity, "--approve-sql", self.approval])
        submit.assert_not_called()


class SQLReleasePipelineTests(unittest.TestCase):
    def setUp(self):
        self.flow = pipeline.ReleasePipelineTests(
            "test_all_stage_bodies_share_locks_plan_attempt_and_finish_active_once")
        self.flow.setUp()
        self.addCleanup(self.flow.doCleanups)
        self.case = self.flow.case
        values = self.flow.values
        values["history"] = values["history"][:-1]
        values["pending"] = [{key: values["inventory"][-1][key] for key in ("name", "sha256")}]
        self.case.expanded["services"]["api"]["environment"]["DATABASE_URL"] = "postgresql://fixture@db/fixture"
        values["current"]["configurationSha256"] = hashlib.sha256(
            self.flow.env + b"\0rendered-compose\0" + plan._canonical(self.case.expanded)).hexdigest()
        self.raw = plan.create_plan(created_at=pipeline.NOW, **values)
        self.identity = self.flow.identity = storage.save_plan(self.raw)
        self.flow.fresh = plan.create_plan(created_at=self.case.fixture.time, **values)
        self.flow.observe.return_value = self.flow.fresh
        self.original = plan.validate_plan(self.raw, self.identity)
        self.approval = plan.sql_review(self.raw, self.identity)["approvalSha256"]
        self.expected = values["history"] + [{**row, "state": "applied"} for row in values["pending"]]
        self.case.history.return_value = copy.deepcopy(values["history"])
        self.flow.stack.enter_context(patch.object(collector, "_probe_sql", return_value=values["inventory"]))
        self.mid, self.mimage = "7" * 64, "sha256:" + "8" * 64
        self.minfo = None
        self.calls, self.mcreates, self.mstarts = [], 0, 0
        self.fail_create = self.fail_start = self.fail_wait = False
        self.wait_elapsed = 0
        self.wait_result = "0\n"
        self.applied_history = None
        def pending(old, new):
            self.flow.assert_locked()
            self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
            self.case.pending = True
            self.flow.state.update(phase="pending", current=new, previous=old,
                                   reason="candidate-create-start")
        self.flow.controller.write_creation_pending.side_effect = pending

    def command(self, args, **kwargs):
        self.flow.assert_locked()
        self.calls.append((args[:], kwargs))
        if args[:2] == ["docker", "compose"] and "create" in args and args[-1] == "sanq-migration":
            self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
            self.mcreates += 1
            body = json.loads(kwargs["input_bytes"])
            service = body["services"]["sanq-migration"]
            self.assertEqual(set(body["services"]), {"sanq-migration"})
            self.assertEqual(set(service["environment"]), {"DATABASE_URL"})
            self.minfo = {"Id": self.mid, "Name": "/sanq-migrate-" + guard.status()["attemptId"],
                "Image": self.mimage, "RestartCount": 0,
                "Config": {"Image": service["image"], "Entrypoint": service["entrypoint"],
                           "Cmd": service["command"], "Labels": service["labels"]},
                "HostConfig": {"RestartPolicy": {"Name": "no", "MaximumRetryCount": 0},
                    "AutoRemove": False, "Privileged": False, "NetworkMode": "sanq-app_default"},
                "Mounts": [], "State": {"Status": "created", "Running": False,
                                       "Restarting": False, "Paused": False}}
            if self.fail_create:
                raise ReleaseContractError("migration creation result unknown")
            return ""
        if args[:3] == ["docker", "ps", "-a"] and any("role=migration" in arg for arg in args):
            return self.mid + "\n" if self.minfo is not None else ""
        if args[:2] == ["docker", "inspect"] and args[-1] == self.mid:
            return json.dumps(self.minfo)
        if args[:3] == ["docker", "image", "inspect"] and args[-1] == self.mimage:
            return json.dumps({"Os": "linux", "Architecture": "amd64",
                "RepoDigests": [collector._pinned(self.original["candidate"]["images"]["sanq-api"])],
                "Config": {"Labels": {"org.opencontainers.image.revision": self.original["candidate"]["sourceSha"]}}})
        if args[:2] == ["docker", "start"] and args[-1] == self.mid:
            self.assertEqual(guard.status()["phase"], "STARTING_MIGRATION")
            self.mstarts += 1
            self.minfo["State"].update(Status="exited", Running=False, ExitCode=0,
                                      OOMKilled=False, Dead=False, Error="")
            self.case.history.return_value = copy.deepcopy(
                self.expected if self.applied_history is None else self.applied_history)
            if self.fail_start:
                raise ReleaseContractError("migration start result unknown")
            return self.mid + "\n"
        if args[:2] == ["docker", "wait"] and args[-1] == self.mid:
            self.flow.elapsed += self.wait_elapsed
            if self.fail_wait:
                raise ReleaseContractError("wait outcome unknown")
            return self.wait_result
        if args[:2] in (["docker", "update"], ["docker", "stop"]) and args[-1] == self.mid:
            self.minfo["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            self.minfo["State"].update(Status="exited", Running=False)
            return ""
        return self.flow.observe_command(args, **kwargs)

    def execute(self, **kwargs):
        return task.run_task(self.identity, approval=kwargs.pop("approval", self.approval),
            controller=self.flow.controller, run=self.command, observe=self.flow.observe,
            fetch=kwargs.pop("fetch", Mock()), now=lambda: self.case.fixture.time,
            clock=lambda: self.flow.elapsed, pause=Mock(), **kwargs)

    def test_whole_task_holds_original_locks_and_runs_sql_and_handoff_once(self):
        result = self.execute()
        self.assertEqual(result["outcome"], "ACTIVE")
        self.assertEqual(self.flow.phases, ["ARMED", "FROZEN", "MIGRATION_CREATING",
            "MIGRATION_REGISTERED", "STARTING_MIGRATION", "MIGRATION_VERIFIED",
            "CREATING_CANDIDATES", "CANDIDATES_REGISTERED", "STARTING_CANDIDATES",
            "CANDIDATES_READY", "FINALIZING", "HANDOFF_COMMITTED"])
        self.assertEqual((self.mcreates, self.mstarts, len(self.case.creates)), (1, 1, 1))
        self.assertEqual(self.flow.writes, ["active"])
        self.assertEqual(self.flow.controller.write_creation_pending.call_count, 1)
        self.assertEqual(storage.load_plan(self.identity), self.raw)
        self.assertEqual(self.case.history.return_value, self.expected)
        self.assertFalse(guard.status()["maintenance"])
        self.assertFalse(self.minfo["State"]["Running"])
        self.assertEqual([args[-1] for args, _ in self.calls if args[:2] == ["docker", "start"]],
                         [self.mid, *[self.case.ids[name] for name in guard.SERVICES]])
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual((self.mcreates, self.mstarts), (1, 1))

    def test_missing_or_wrong_approval_never_freezes(self):
        for approval in (None, "0" * 64):
            with self.assertRaises(ReleaseContractError):
                self.execute(approval=approval)
        self.assertFalse(self.flow.phases)
        self.assertFalse(self.calls)

    def test_partial_migration_create_never_starts_or_replays(self):
        self.fail_create = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")
        self.assertEqual(self.flow.state["phase"], "pending")
        self.assertEqual(self.mstarts, 0)
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.mcreates, 1)

    def test_start_result_unknown_preserves_applied_sql_and_stops_saved_ids(self):
        self.fail_start = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.case.history.return_value, self.expected)
        self.assertFalse(self.case.creates)
        self.assertEqual(self.mstarts, 1)
        stops = [args[-1] for args, _ in self.calls if args[:2] == ["docker", "stop"]]
        self.assertEqual(stops[0], self.mid)

    def test_wait_unknown_never_advances_to_application_creation(self):
        self.fail_wait = True
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertFalse(self.case.creates)

    def test_nonzero_wait_or_wrong_history_cannot_publish(self):
        self.wait_result = "1\n"
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertFalse(self.flow.writes)

    def test_partial_history_cannot_enter_application_creation(self):
        self.applied_history = self.original["migrationHistory"]
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertFalse(self.case.creates)

    def test_migration_verified_durability_unknown_is_not_continued(self):
        def uncertain(root, value, **kwargs):
            self.flow.record(root, value, **kwargs)
            if value["phase"] == "MIGRATION_VERIFIED":
                raise OSError("verified record durability unknown")
        with patch.object(guard, "_write", side_effect=uncertain), self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "MIGRATION_VERIFIED")
        self.assertFalse(self.case.creates)
        self.assertEqual(self.flow.state["phase"], "pending")

    def test_failure_after_sql_keeps_actual_history_and_pending(self):
        self.flow.fail_readiness = 1
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(self.case.history.return_value, self.expected)
        self.assertEqual(self.flow.state["phase"], "pending")
        self.assertFalse(self.flow.writes)

    def test_shared_budget_exhaustion_after_sql_never_starts_applications(self):
        def expire(root, value, **kwargs):
            self.flow.record(root, value, **kwargs)
            if value["phase"] == "MIGRATION_VERIFIED":
                self.flow.elapsed = task.RUN_BUDGET_SECONDS
        with patch.object(guard, "_write", side_effect=expire), self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(guard.status()["phase"], "MIGRATION_VERIFIED")
        self.assertFalse(self.case.creates)
        self.assertEqual(self.mstarts, 1)

    def test_remaining_task_budget_caps_migration_wait(self):
        def observe(*args, **kwargs):
            self.flow.elapsed = task.RUN_BUDGET_SECONDS - 2
            return self.flow.fresh
        self.flow.observe.side_effect = observe
        self.assertEqual(self.execute()["outcome"], "ACTIVE")
        waits = [kw["timeout"] for args, kw in self.calls if args[:2] == ["docker", "wait"]]
        self.assertEqual(waits, [2])
        self.assertTrue(all(0 < kw["timeout"] <= 2 for _, kw in self.calls))

    def test_clear_unknown_does_not_rewrite_active_or_repeat_sql(self):
        real = task.finalizer._clear_committed
        def uncertain(*args):
            real(*args)
            raise OSError("clear result unknown after unlink")
        with patch.object(task.finalizer, "_clear_committed", side_effect=uncertain), self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(self.flow.state["phase"], "active")
        self.assertEqual(self.mstarts, 1)
        with self.assertRaises(ReleaseContractError):
            self.execute()
        self.assertEqual(self.mstarts, 1)

    def test_lock_competition_never_dispatches_stage_work(self):
        for lock in (job._locked_directory, storage.preparation_lock):
            with lock(), self.assertRaises(ReleaseContractError):
                self.execute()
        self.assertFalse(self.calls)


if __name__ == "__main__":
    unittest.main()
