"""Offline success-handoff fault models. No production Docker, SQL or HTTP."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import stat
import tempfile
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_start_candidates as fixtures
import finalize_candidates as finalizer
import start_candidates as starter
import maintenance_guard as guard
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
import deploy_release as deploy
from release_contract import ReleaseContractError
from test_deployment_plan import OLD, NEW, NOW


class SuccessHandoffTests(unittest.TestCase):
    def setUp(self):
        self.stage = fixtures.StartReadinessTests(
            "test_exact_registered_ids_start_once_and_ready_never_commits_active")
        self.stage.setUp()
        self.addCleanup(self.stage.doCleanups)
        self.case = self.stage.case
        self.env = ("SENSITIVE_FIXTURE=DO_NOT_PERSIST\nSANQ_IMAGE_SHA=" + OLD + "\n").encode()
        # Seed a coherent private review fixture before running the real start adapter.
        values = copy.deepcopy(self.case.values)
        values["current"]["configurationSha256"] = hashlib.sha256(
            self.env + b"\0rendered-compose\0" + plan._canonical(self.case.expanded)).hexdigest()
        raw = plan.create_plan(created_at=NOW, **values)
        self.identity = storage.save_plan(raw)
        record = guard.status()
        record["planId"] = self.identity
        policies = {"api": {"Name": "on-failure", "MaximumRetryCount": 7},
                    "ubereats-worker": {"Name": "unless-stopped", "MaximumRetryCount": 0},
                    "web": {"Name": "no", "MaximumRetryCount": 0}}
        for service in guard.SERVICES:
            record["originalContainers"][service]["restartPolicy"] = policies[service]
        self.case.fixture.marker.write_bytes(guard._raw(record))
        self.stage.identity = self.identity
        self.stage.start()
        self.attempt = record["attemptId"]
        self.controller = self.case.controller
        self.controller.RELEASE_LINE = deploy.RELEASE_LINE
        self.stack = self.case.fixture.stack
        self.state = {"schemaVersion": 1, "phase": "pending", "current": NEW, "previous": OLD,
                      "reason": "candidate-create-start", "updatedAt": NOW}
        self.writes, self.calls, self.policy_updates = [], [], []
        self.bad_target = self.bad_readiness = self.bad_state_readback = False
        self.fail_policy = None
        self.old_private = collector._private_bytes
        def private(path, owner, **kwargs):
            if path == self.controller.ENV:
                return self.env
            return self.old_private(path, owner, **kwargs)
        self.stack.enter_context(patch.object(collector, "_private_bytes", side_effect=private))
        self.stack.enter_context(patch.object(finalizer, "_env_metadata", return_value=(0, 0, 0o600)))
        self.stack.enter_context(patch.object(finalizer, "_state", side_effect=lambda controller: copy.deepcopy(self.state)))
        self.sync = self.stack.enter_context(patch.object(finalizer, "_sync_runtime"))
        self.target = self.stack.enter_context(patch.object(finalizer, "_target_binding",
                                                            side_effect=self.target_binding))
        def update_env(path, value):
            self.assertEqual(guard.status()["phase"], "FINALIZING")
            self.assertEqual(path, self.controller.ENV)
            self.env = value.encode()
            for service in guard.SERVICES:
                name = "sanq-web" if service == "web" else "sanq-api"
                self.case.expanded["services"][service]["image"] = values["candidate"]["images"][name]["ref"]
        def write_state(phase, *, current, previous, reason):
            self.assertEqual((phase, current, previous, reason), ("active", NEW, OLD, "readiness-verified"))
            self.assertEqual(guard.status()["phase"], "FINALIZING")
            self.writes.append((phase, current, previous, reason))
            self.state.update(phase=phase, current=OLD if self.bad_state_readback else current,
                              previous=previous, reason=reason)
        self.controller.atomic_write.side_effect = update_env
        self.controller.write_state.side_effect = write_state

    def target_binding(self, original, expected_env, expected_expanded, metadata, controller, run):
        if self.bad_target:
            raise ReleaseContractError("target configuration changed")
        self.assertEqual(expected_env, self.env)
        self.assertEqual(expected_expanded, self.case.expanded)
        self.assertEqual(metadata, (0, 0, 0o600))
        return expected_expanded

    def observe_command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:2] == ["docker", "update"]:
            identifier = args[-1]
            if identifier not in self.stage.info:
                raise ReleaseContractError("removed original")
            policy = args[2].removeprefix("--restart=")
            name, separator, count = policy.partition(":")
            value = {"Name": name, "MaximumRetryCount": int(count) if separator else 0}
            if name != "no":
                self.assertEqual(self.state["phase"], "active")
            self.stage.info[identifier]["HostConfig"]["RestartPolicy"] = value
            self.policy_updates.append((identifier, value))
            if identifier == self.fail_policy and name != "no":
                raise ReleaseContractError("policy result unknown after effect")
            return ""
        if args[0] == "bash":
            if self.bad_readiness:
                raise ReleaseContractError("target readiness failed")
        return self.stage.observe_command(args, **kwargs)

    def finish(self):
        return finalizer.finalize_ready(self.identity, self.attempt, controller=self.controller,
            run=self.observe_command, fetch=Mock(), now=lambda: self.case.fixture.time)

    def assert_incident(self):
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertTrue(all(not row["State"]["Running"] for row in self.stage.info.values()))
        self.assertTrue(all(row["HostConfig"]["RestartPolicy"]["Name"] == "no"
                            for row in self.stage.info.values()))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_success_preserves_env_keys_publishes_only_authority_restores_exact_policies_then_clears(self):
        expected = copy.deepcopy(guard.status()["originalContainers"])
        result = self.finish()
        self.assertEqual(result["outcome"], "ACTIVE")
        self.assertEqual(result["currentSha"], NEW)
        self.assertFalse(result["canExecute"])
        self.assertEqual((self.state["phase"], self.state["current"], self.state["previous"]),
                         ("active", NEW, OLD))
        self.assertEqual(self.env, ("SENSITIVE_FIXTURE=DO_NOT_PERSIST\nSANQ_IMAGE_SHA=" + NEW + "\n").encode())
        self.assertEqual(len(self.writes), 1)
        self.assertEqual(self.sync.call_count, 2)
        for service in guard.SERVICES:
            self.assertEqual(self.stage.info[self.case.ids[service]]["HostConfig"]["RestartPolicy"],
                             expected[service]["restartPolicy"])
        self.assertTrue(all(row["State"]["Running"] for row in self.stage.info.values()))
        self.assertFalse(guard.status()["maintenance"])
        guard.check_startup()
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any(args[:2] in (["docker", "start"], ["docker", "compose"]) and
                             ("create" in args or "start" in args or "up" in args) for args in self.calls))
        with self.assertRaises(ReleaseContractError):
            self.finish()



    def test_successful_digest_handoff_can_become_next_frozen_baseline_and_creation_intent(self):
        first = plan.validate_plan(storage.load_plan(self.identity), self.identity)
        saved_policies = copy.deepcopy(guard.status()["originalContainers"])
        self.assertEqual(self.finish()["outcome"], "ACTIVE")
        self.assertFalse(guard.status()["maintenance"])
        for service in guard.SERVICES:
            name = "sanq-web" if service == "web" else "sanq-api"
            self.assertEqual(self.stage.info[self.case.ids[service]]["Config"]["Image"],
                             collector._pinned(first["candidate"]["images"][name]))
        # Build a distinct reviewed next release. The preceding handoff is real
        # adapter code; Docker, external proof and fresh collection remain models.
        observations = copy.deepcopy(job._observations(first))
        observations["current"].update(applicationSha=NEW,
            releaseStateSha256=hashlib.sha256(plan._canonical(self.state)).hexdigest(),
            configurationSha256=hashlib.sha256(self.env + b"\0rendered-compose\0" +
                plan._canonical(self.case.expanded)).hexdigest())
        third = "8" * 40
        observations["candidate"]["sourceSha"] = third
        for name, image in observations["candidate"]["images"].items():
            image["ref"] = f"ghcr.io/sanqin888/{name}:{third}"
            image["digest"] = "sha256:" + ("1" if name == "sanq-api" else "2") * 64
        raw = plan.create_plan(created_at=NOW, **observations)
        identity = storage.save_plan(raw)
        observed = plan.create_plan(created_at=self.case.fixture.time, **observations)
        with patch.object(guard.release, "sealed_release_for_sha",
                          return_value=first["candidate"]) as seal:
            frozen = guard.freeze_for_plan(identity, controller=self.controller,
                run=self.stage.observe_command, observe=Mock(return_value=observed),
                fetch=Mock(), now=lambda: self.case.fixture.time)
        seal.assert_called_once()
        self.assertEqual(seal.call_args.args[0], NEW)
        self.assertEqual(frozen["observedApplicationSha"], NEW)
        self.assertNotEqual(frozen["attemptId"], self.attempt)
        for service, row in frozen["originalContainers"].items():
            self.assertEqual(row["containerId"], self.case.ids[service])
            self.assertEqual(row["restartPolicy"], saved_policies[service]["restartPolicy"])
        intention = guard.begin_candidate_creation(identity, frozen["attemptId"],
            controller=self.controller, run=self.stage.observe_command,
            now=lambda: self.case.fixture.time)
        self.assertEqual(intention["phase"], "CREATING_CANDIDATES")
        self.assertEqual(intention["candidate"]["release"]["sourceSha"], third)
        self.assertEqual(self.state["phase"], "active")
        self.assertEqual(self.state["current"], NEW)
        self.assertEqual(len(self.writes), 1)
        self.controller.apply_reviewed_migrations.assert_not_called()
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_crlf_env_preserves_all_original_line_endings(self):
        self.env = self.env.replace(b"\n", b"\r\n")
        original = plan.validate_plan(storage.load_plan(self.identity), self.identity)
        observations = job._observations(original)
        observations["current"] = {**original["current"], "configurationSha256": hashlib.sha256(
            self.env + b"\0rendered-compose\0" + plan._canonical(self.case.expanded)).hexdigest()}
        raw = plan.create_plan(created_at=original["createdAt"], **observations)
        self.identity = storage.save_plan(raw)
        record = guard.status()
        record["planId"] = self.identity
        self.case.fixture.marker.write_bytes(guard._raw(record))
        expected = self.env.replace(OLD.encode(), NEW.encode())
        self.assertEqual(self.finish()["outcome"], "ACTIVE")
        self.assertEqual(self.env, expected)

    def test_root_wrong_attempt_and_global_lock_prevent_handoff(self):
        with patch.object(guard.os, "geteuid", return_value=1000):
            with self.assertRaises(ReleaseContractError):
                self.finish()
        old = self.attempt
        self.attempt = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.attempt = old
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.writes, [])
        self.controller.atomic_write.assert_not_called()
        self.assertEqual(guard.status()["phase"], "CANDIDATES_READY")

    def test_not_healthy_anymore_rejects_before_mutation(self):
        self.stage.info[self.case.ids["api"]]["State"]["Health"]["Status"] = "starting"
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.controller.atomic_write.assert_not_called()
        self.assertEqual(guard.status()["phase"], "CANDIDATES_READY")

    def test_finalizing_sync_unknown_never_updates_env_or_policy(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("unknown intention sync")):
            with self.assertRaises(OSError):
                self.finish()
        self.controller.atomic_write.assert_not_called()
        self.assertEqual(self.policy_updates, [])
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_env_directory_sync_unknown_keeps_actual_env_and_pending_then_stops(self):
        self.sync.side_effect = OSError("unknown env directory sync")
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertIn(NEW.encode(), self.env)
        self.assertEqual(self.state["phase"], "pending")
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_target_config_or_readiness_failure_never_writes_active(self):
        self.bad_target = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_readiness_failure_after_env_change_keeps_incident(self):
        self.bad_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.writes, [])
        self.assert_incident()

    def test_active_directory_sync_unknown_preserves_actual_active_without_rewrite(self):
        self.sync.side_effect = [None, OSError("unknown active directory sync")]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.state["phase"], "active")
        self.assertEqual(len(self.writes), 1)
        self.assert_incident()

    def test_active_readback_mismatch_never_restores_original_policy(self):
        self.bad_state_readback = True
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertTrue(all(policy["Name"] == "no" for _, policy in self.policy_updates))
        self.assert_incident()

    def test_policy_unknown_after_effect_resets_saved_ids_and_retains_selected_version(self):
        self.fail_policy = self.case.ids["api"]
        with self.assertRaises(ReleaseContractError):
            self.finish()
        self.assertEqual(self.state["phase"], "active")
        self.assertEqual(self.state["current"], NEW)
        self.assertEqual(len(self.writes), 1)
        self.assert_incident()

    def test_committed_marker_sync_unknown_stops_without_rewriting_unknown_marker(self):
        real_sync, count = os.fsync, 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 4:
                raise OSError("unknown committed marker sync")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaisesRegex(ReleaseContractError, "record durability unknown"):
                self.finish()
        self.assertEqual(count, 4)
        self.assertEqual(guard.status()["phase"], "HANDOFF_COMMITTED")
        self.assertEqual(self.state["phase"], "active")
        self.assertTrue(all(not row["State"]["Running"] for row in self.stage.info.values()))
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_unlink_failure_is_completion_unknown_and_retains_committed_marker(self):
        with patch.object(finalizer.os, "unlink", side_effect=OSError("unlink unavailable")):
            with self.assertRaisesRegex(ReleaseContractError, "clear outcome unknown"):
                self.finish()
        self.assertEqual(self.state["phase"], "active")
        self.assertEqual(guard.status()["phase"], "HANDOFF_COMMITTED")
        self.assertTrue(all(row["State"]["Running"] for row in self.stage.info.values()))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_clear_directory_sync_unknown_does_not_stop_valid_published_release_or_recreate_marker(self):
        real_sync, count = os.fsync, 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 5:
                raise OSError("unknown clear directory sync")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaisesRegex(ReleaseContractError, "clear outcome unknown"):
                self.finish()
        self.assertEqual(count, 5)
        self.assertEqual(self.state["phase"], "active")
        self.assertFalse(guard.status()["maintenance"])
        self.assertTrue(all(row["State"]["Running"] for row in self.stage.info.values()))
        self.assertEqual(len(self.policy_updates), 3)
        guard.check_startup()
        with self.assertRaises(ReleaseContractError):
            self.finish()

    def test_committed_marker_still_can_be_fenced_by_stop_post_without_auto_clear(self):
        with patch.object(finalizer.os, "unlink", side_effect=OSError("unlink unavailable")):
            with self.assertRaises(ReleaseContractError):
                self.finish()
        result = guard.cleanup_after_task(self.identity, "exit-code", controller=self.controller,
            run=self.observe_command, now=lambda: self.case.fixture.time)
        self.assertEqual(result["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assert_incident()

    def test_clear_requires_same_committed_plan_attempt_and_no_leftovers(self):
        with storage._directory_fd(guard.MAINTENANCE_DIR) as root:
            with self.assertRaises(ReleaseContractError):
                finalizer._clear_committed(root, self.identity, self.attempt)
        self.assertEqual(guard.status()["phase"], "CANDIDATES_READY")
        with patch.object(finalizer.os, "unlink", side_effect=OSError("retain committed marker")):
            with self.assertRaises(ReleaseContractError):
                self.finish()
        with storage._directory_fd(guard.MAINTENANCE_DIR) as root:
            for identity, attempt in (("a" * 64, self.attempt), (self.identity, "f" * 32)):
                with self.assertRaises(ReleaseContractError):
                    finalizer._clear_committed(root, identity, attempt)
            (self.case.fixture.maintenance / "partial.tmp").write_bytes(b"partial")
            with self.assertRaises(ReleaseContractError):
                finalizer._clear_committed(root, self.identity, self.attempt)

    def test_policy_conversion_retains_retry_count_and_rejects_bad_shapes(self):
        self.assertEqual(finalizer._policy_argument({"Name": "on-failure", "MaximumRetryCount": 7}),
                         "on-failure:7")
        self.assertEqual(finalizer._policy_argument({"Name": "no", "MaximumRetryCount": 0}), "no")
        with self.assertRaises(ReleaseContractError):
            finalizer._policy_argument({"Name": "always", "MaximumRetryCount": 7})



class FinalBindingTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.PendingBindingTests(
            "test_pending_binding_requires_exact_state_env_manifest_runtime_and_config")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.env = ("SANQ_IMAGE_SHA=" + NEW + "\n").encode()
        self.expected_env = self.fixture.env
        self.expanded = copy.deepcopy(self.fixture.expanded)
        self.metadata = (0, 0, 0o600)

    def binding(self, metadata=None):
        with patch.object(collector, "_private_bytes", side_effect=self.fixture.private_bytes), \
             patch.object(finalizer, "_env_metadata", return_value=self.metadata):
            return finalizer._target_binding(self.fixture.original, self.expected_env,
                self.expanded, self.metadata if metadata is None else metadata,
                self.fixture.controller, self.fixture.observe_config)

    def test_target_binding_rejects_extra_env_or_changed_ownership(self):
        self.assertEqual(self.binding(), self.expanded)
        with self.assertRaises(ReleaseContractError):
            self.binding((42, 0, 0o600))
        self.fixture.env += b"UNREVIEWED_KEY=value\n"
        with self.assertRaises(ReleaseContractError):
            self.binding()

    def test_target_binding_rejects_manifest_runtime_and_config_drift(self):
        self.fixture.manifest = b"changed manifest"
        with self.assertRaises(ReleaseContractError):
            self.binding()
        self.fixture.manifest = b"manifest fixture"
        self.fixture.files[plan.RUNTIME_FILES[0]] = b"changed runtime"
        with self.assertRaises(ReleaseContractError):
            self.binding()
        self.fixture.files[plan.RUNTIME_FILES[0]] = b"fixed runtime fixture"
        self.fixture.expanded["name"] = "wrong-project"
        with self.assertRaises(ReleaseContractError):
            self.binding()


    def test_runtime_sync_flushes_file_metadata_before_parent_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            controller = SimpleNamespace(ROOT=root, ENV=root / "env", STATE=root / "state")
            controller.ENV.write_bytes(b"env fixture")
            controller.STATE.write_bytes(b"state fixture")
            controller.ENV.chmod(0o400)
            controller.STATE.chmod(0o600)
            observed, real_sync = [], os.fsync
            def sync(fd):
                observed.append("directory" if stat.S_ISDIR(os.fstat(fd).st_mode) else "file")
                return real_sync(fd)
            with patch.object(finalizer.os, "fsync", side_effect=sync):
                finalizer._sync_runtime(controller, "env")
                finalizer._sync_runtime(controller, "state")
            self.assertEqual(observed, ["file", "directory", "file", "directory"])
            self.assertEqual(stat.S_IMODE(controller.ENV.stat().st_mode), 0o400)

    def test_active_readback_requires_exact_sole_state(self):
        value = {"schemaVersion": 1, "phase": "active", "current": NEW, "previous": OLD,
                 "reason": "readiness-verified", "updatedAt": NOW}
        with patch.object(collector, "_private_bytes", side_effect=lambda *a, **k: json.dumps(value).encode()):
            finalizer._active(self.fixture.original, self.fixture.controller)
            for key, bad in (("phase", "pending"), ("current", OLD), ("previous", NEW),
                             ("reason", "other"), ("schemaVersion", True)):
                old = value[key]
                value[key] = bad
                with self.assertRaises(ReleaseContractError):
                    finalizer._active(self.fixture.original, self.fixture.controller)
                value[key] = old


if __name__ == "__main__":
    unittest.main()
