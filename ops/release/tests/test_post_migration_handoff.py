"""Offline migration-to-application continuation using the real shared stages."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_finalize_candidates as fixtures
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import maintenance_guard as guard
import migration_container as migration
import release_job as job
import release_task as task
from release_contract import ReleaseContractError


class PostMigrationHandoffTests(unittest.TestCase):
    def setUp(self):
        self.handoff = fixtures.SuccessHandoffTests(
            "test_success_preserves_env_keys_publishes_only_authority_restores_exact_policies_then_clears")
        self.handoff.setUp()
        self.addCleanup(self.handoff.doCleanups)
        self.case = self.handoff.case
        self.stage = self.handoff.stage
        self.controller = self.handoff.controller
        base = plan.validate_plan(storage.load_plan(self.handoff.identity), self.handoff.identity)
        values = job._observations(base)
        values["history"] = values["history"][:-1]
        values["pending"] = [{key: base["migrationHistory"][-1][key] for key in ("name", "sha256")}]
        self.raw = plan.create_plan(created_at=base["createdAt"], **values)
        self.identity = storage.save_plan(self.raw)
        self.original = plan.validate_plan(self.raw, self.identity)
        self.approval = plan.sql_review(self.raw, self.identity)["approvalSha256"]
        old = guard.status()
        self.attempt = old["attemptId"]
        self.mid = "7" * 64
        self.mimage = "sha256:" + "8" * 64
        self.minfo = {"Id": self.mid, "Name": "/sanq-migrate-" + self.attempt,
            "Image": self.mimage, "RestartCount": 0,
            "Config": {"Image": collector._pinned(base["candidate"]["images"]["sanq-api"]),
                "Entrypoint": list(migration.ENTRYPOINT), "Cmd": list(migration.COMMAND),
                "Labels": {"io.sanq.release.role": "migration", "io.sanq.release.plan": self.identity,
                           "io.sanq.release.attempt": self.attempt}},
            "HostConfig": {"RestartPolicy": {"Name": "no", "MaximumRetryCount": 0},
                "AutoRemove": False, "Privileged": False, "NetworkMode": "sanq-app_default"},
            "Mounts": [], "State": {"Status": "exited", "Running": False, "Restarting": False,
                "Paused": False, "ExitCode": 0, "OOMKilled": False, "Dead": False, "Error": ""}}
        record = {key: value for key, value in old.items() if key != "candidate"}
        record.update(schemaVersion=3, phase="MIGRATION_VERIFIED", planId=self.identity,
            migration={"release": base["candidate"], "approvalSha256": self.approval,
                       "container": {"containerId": self.mid, "imageId": self.mimage}})
        # Seed disposable evidence at the boundary verified by the previous batch.
        self.case.fixture.marker.write_bytes(guard._raw(record))
        for service, saved in record["originalContainers"].items():
            info = copy.deepcopy(self.stage.info.pop(self.case.ids[service]))
            info["Id"], info["Image"] = saved["containerId"], saved["imageId"]
            name = "sanq-web" if service == "web" else "sanq-api"
            info["Config"]["Image"] = "ghcr.io/sanqin888/" + name + ":" + base["current"]["applicationSha"]
            info["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            info["State"] = {"Status": "exited", "Running": False, "Restarting": False, "Paused": False}
            self.stage.info[saved["containerId"]] = info
        self.case.role_ids = dict(self.case.fixture.ids)
        self.case.pending = True
        self.case.creates.clear()
        self.stage.starts.clear()
        self.calls = []
        self.migration_present = True
        self.fail_target_readiness = False
        self.controller.write_creation_pending.reset_mock()
        self.handoff.writes.clear()

    def command(self, args, **kwargs):
        for lock in (job._locked_directory, storage.preparation_lock):
            with self.assertRaises(ReleaseContractError):
                with lock():
                    pass
        self.calls.append(args[:])
        if args[:3] == ["docker", "ps", "-a"] and any("role=migration" in arg for arg in args):
            return self.mid + "\n" if self.migration_present else ""
        if args[:2] == ["docker", "inspect"] and args[-1] == self.mid:
            return json.dumps(self.minfo)
        if args[:3] == ["docker", "image", "inspect"] and args[-1] == self.mimage:
            return json.dumps({"Os": "linux", "Architecture": "amd64",
                "RepoDigests": [collector._pinned(self.original["candidate"]["images"]["sanq-api"])],
                "Config": {"Labels": {"org.opencontainers.image.revision": self.original["candidate"]["sourceSha"]}}})
        if args[:2] in (["docker", "update"], ["docker", "stop"]) and args[-1] == self.mid:
            self.minfo["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            self.minfo["State"].update(Status="exited", Running=False)
            return ""
        if args[0] == "bash" and guard.status()["phase"] == "FINALIZING" and self.fail_target_readiness:
            raise ReleaseContractError("target readiness failed")
        return self.handoff.observe_command(args, **kwargs)

    def finish(self):
        return task.handoff_migrated_release(self.identity, self.attempt, self.approval,
            controller=self.controller, run=self.command, fetch=Mock(),
            now=lambda: self.case.fixture.time, clock=Mock(return_value=0), pause=Mock())

    def test_shared_create_start_finalize_commits_once_and_retains_exited_migration(self):
        before = storage.load_plan(self.identity)
        result = self.finish()
        self.assertEqual(result["outcome"], "ACTIVE")
        self.assertEqual(len(self.case.creates), 1)
        self.assertEqual(self.stage.starts, [self.case.ids[name] for name in guard.SERVICES])
        self.assertEqual(len(self.handoff.writes), 1)
        self.assertEqual(self.handoff.state["current"], self.original["candidate"]["sourceSha"])
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(storage.load_plan(self.identity), before)
        self.controller.write_creation_pending.assert_not_called()
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any(args[:2] == ["docker", "start"] and args[-1] == self.mid for args in self.calls))
        self.assertFalse(any(args[:2] in (["docker", "rm"], ["docker", "wait"]) for args in self.calls))
        self.assertFalse(self.minfo["State"]["Running"])
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_wrong_approval_attempt_or_missing_migration_never_creates(self):
        approval = self.approval
        self.approval = "0" * 64
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.approval = approval
        attempt = self.attempt
        self.attempt = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.attempt = attempt
        self.migration_present = False
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertFalse(self.case.creates)
        self.assertEqual(guard.status()["phase"], "MIGRATION_VERIFIED")

    def test_partial_or_modified_history_blocks_before_creation(self):
        full = self.case.history.return_value
        for history in (self.original["migrationHistory"], full + [full[0]],
                        [{**full[0], "sha256": "0" * 64}, *full[1:]]):
            self.case.history.return_value = history
            with self.assertRaises(ReleaseContractError):
                self.finish()
        self.assertFalse(self.case.creates)

    def test_nonzero_migration_exit_or_changed_command_blocks_application_creation(self):
        self.minfo["State"]["ExitCode"] = 1
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.minfo["State"]["ExitCode"] = 0
        self.minfo["Config"]["Cmd"] = ["unreviewed"]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertFalse(self.case.creates)

    def test_partial_creation_retains_both_evidence_sets_and_denies_replay(self):
        self.case.fail_create = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        record = guard.status()
        self.assertEqual((record["schemaVersion"], record["phase"]), (4, "CREATING_CANDIDATES"))
        self.assertEqual(record["migration"]["container"]["containerId"], self.mid)
        self.assertEqual(record["candidate"]["containers"], {})
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(len(self.case.creates), 1)
        self.controller.write_state.assert_not_called()

    def test_start_failure_stops_migration_and_saved_candidates_without_undoing_sql(self):
        self.stage.fail_start = self.case.ids["ubereats-worker"]
        expected = copy.deepcopy(self.case.history.return_value)
        with self.assertRaises(ReleaseContractError):
            self.finish()
        record = guard.status()
        self.assertEqual(record["phase"], "INCIDENT")
        self.assertEqual(record["schemaVersion"], 4)
        self.assertEqual(record["migration"]["container"]["containerId"], self.mid)
        self.assertEqual(self.case.history.return_value, expected)
        self.assertTrue(all(not row["State"]["Running"] for row in self.stage.info.values()))
        self.controller.write_state.assert_not_called()
        stops = [args[-1] for args in self.calls if args[:2] == ["docker", "stop"]]
        self.assertEqual(stops[0], self.mid)

    def test_target_readiness_failure_keeps_actual_environment_and_incident(self):
        self.fail_target_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertIn(self.original["candidate"]["sourceSha"].encode(), self.handoff.env)
        self.assertEqual(self.handoff.state["phase"], "pending")

    def test_history_drift_before_active_blocks_commit(self):
        full = copy.deepcopy(self.case.history.return_value)
        def history(*args, **kwargs):
            return full if guard.status()["phase"] != "FINALIZING" else self.original["migrationHistory"]
        self.case.history.side_effect = history
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.controller.write_state.assert_not_called()

    def test_policy_failure_after_active_keeps_actual_authority_and_sql_evidence(self):
        self.handoff.fail_policy = self.case.ids["api"]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.handoff.state["phase"], "active")
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(guard.status()["migration"]["container"]["containerId"], self.mid)

    def test_intent_durability_unknown_never_creates_or_replays(self):
        real = guard._write
        def uncertain(root, value, **kwargs):
            real(root, value, **kwargs)
            if value["phase"] == "CREATING_CANDIDATES":
                raise OSError("intention durability unknown")
        with patch.object(guard, "_write", side_effect=uncertain), self.assertRaises(OSError):
            self.finish()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        self.assertFalse(self.case.creates)
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_v4_rejects_missing_migration_or_overlapping_container_identity(self):
        record = guard.status()
        upgraded = {**record, "schemaVersion": 4, "phase": "CREATING_CANDIDATES",
                    "candidate": {"release": self.original["candidate"], "containers": {}}}
        bad = copy.deepcopy(upgraded)
        del bad["migration"]
        with self.assertRaises(ReleaseContractError):
            guard._raw(bad)
        bad = copy.deepcopy(upgraded)
        bad["migration"]["container"]["containerId"] = next(iter(bad["originalContainers"].values()))["containerId"]
        with self.assertRaises(ReleaseContractError):
            guard._raw(bad)

    def test_committed_durability_unknown_keeps_actual_active_and_evidence(self):
        real = guard._write
        def uncertain(root, value, **kwargs):
            real(root, value, **kwargs)
            if value["phase"] == "HANDOFF_COMMITTED":
                raise OSError("committed durability unknown")
        with patch.object(guard, "_write", side_effect=uncertain), self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.handoff.state["phase"], "active")
        self.assertEqual(guard.status()["phase"], "HANDOFF_COMMITTED")
        self.assertEqual(guard.status()["migration"]["container"]["containerId"], self.mid)
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_clear_outcome_unknown_does_not_recreate_marker_or_rollback(self):
        real = task.finalizer._clear_committed
        def uncertain(*args):
            real(*args)
            raise OSError("clear durability unknown after effect")
        with patch.object(task.finalizer, "_clear_committed", side_effect=uncertain), self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertFalse(guard.status()["maintenance"])
        self.assertEqual(self.handoff.state["phase"], "active")
        self.assertTrue(all(row["State"]["Running"] for row in self.stage.info.values()))
        self.assertFalse(self.minfo["State"]["Running"])
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(len(self.handoff.writes), 1)

    def test_plain_creation_entry_cannot_bypass_migration_continuation(self):
        with self.assertRaises(ReleaseContractError):
            guard.prepare_candidate_containers(self.identity, self.attempt,
                controller=self.controller, run=self.command, fetch=Mock(),
                now=lambda: self.case.fixture.time)
        self.assertFalse(self.case.creates)
        self.assertEqual(guard.status()["phase"], "MIGRATION_VERIFIED")

    def test_frozen_sql_cannot_enter_application_intent_without_verified_migration(self):
        record = guard.status()
        frozen = {key: value for key, value in record.items() if key != "migration"}
        frozen.update(schemaVersion=1, phase="FROZEN")
        self.case.fixture.marker.write_bytes(guard._raw(frozen))
        with self.assertRaises(ReleaseContractError):
            guard.begin_candidate_creation(self.identity, self.attempt,
                controller=self.controller, run=self.command, now=lambda: self.case.fixture.time)
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertFalse(self.case.creates)

    def test_shared_locks_prevent_any_continuation(self):
        for lock in (job._locked_directory, storage.preparation_lock):
            with lock(), self.assertRaises(ReleaseContractError):
                self.finish()
        self.assertFalse(self.calls)


if __name__ == "__main__":
    unittest.main()
