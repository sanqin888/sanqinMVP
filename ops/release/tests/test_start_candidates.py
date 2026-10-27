"""Offline exact-ID start/readiness and persistence faults; no real start or HTTP."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_create_candidates as fixtures
import start_candidates as starter
import maintenance_guard as guard
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
import deploy_release as deploy
from release_contract import ReleaseContractError
from test_deployment_plan import OLD, NEW, NOW, inputs


class StartReadinessTests(unittest.TestCase):
    def setUp(self):
        self.case = fixtures.CreateOnlyTests(
            "test_create_only_is_locked_exact_and_keeps_pending_and_maintenance")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.case.prepare()
        self.identity = self.case.identity
        self.attempt = guard.status()["attemptId"]
        self.original = copy.deepcopy(guard.status())
        self.info = self.case.fixture.info
        self.controller = self.case.controller
        self.bindings = self.case.stack.enter_context(patch.object(starter, "_pending_and_config",
                                                                   return_value=self.case.expanded))
        self.calls, self.starts = [], []
        self.fail_start = self.fail_stop = None
        self.readiness_error = None
        self.health = "healthy"
        self.replace_after_readiness = self.db_after_readiness = False
        self.clock, self.pause = Mock(return_value=0), Mock()

    def observe_command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:2] == ["docker", "start"]:
            self.assertEqual(guard.status()["phase"], "STARTING_CANDIDATES")
            self.assertIn(args[-1], self.case.ids.values())
            with self.assertRaises(ReleaseContractError):
                with job._locked_directory():
                    pass
            with self.assertRaises(ReleaseContractError):
                with storage.preparation_lock():
                    pass
            self.starts.append(args[-1])
            self.info[args[-1]]["State"] = {
                "Status": "running", "Running": True, "Restarting": False, "Paused": False,
                "Health": {"Status": self.health}}
            if args[-1] == self.fail_start:
                raise ReleaseContractError("start outcome unknown after effect")
            return ""
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            identifier = args[-1]
            self.assertIn(identifier, set(self.case.ids.values()) | set(self.case.fixture.ids.values()))
            if identifier not in self.info:
                raise ReleaseContractError("removed original")
            if args[1] == "stop" and identifier == self.fail_stop:
                raise ReleaseContractError("stop unavailable")
            if args[1] == "update":
                self.info[identifier]["HostConfig"]["RestartPolicy"] = {
                    "Name": "no", "MaximumRetryCount": 0}
            else:
                self.info[identifier]["State"] = {"Status": "exited", "Running": False,
                                                  "Restarting": False, "Paused": False}
            return ""
        if args[0] == "bash":
            self.assertEqual(args, ["bash", str(self.controller.ROOT / "ops/verify-runtime-readiness.sh"),
                                    str(self.controller.ENV), "https://sanq.ca"])
            self.assertEqual(kwargs["timeout"], 300)
            if self.readiness_error:
                raise self.readiness_error
            if self.replace_after_readiness:
                self.case.role_ids["api"] = "7" * 64
            if self.db_after_readiness:
                self.case.change_db = True
            return ""
        return self.case.observe_command(args, **kwargs)

    def start(self):
        return starter.start_and_verify(self.identity, self.attempt, controller=self.controller,
            run=self.observe_command, fetch=Mock(), now=lambda: self.case.fixture.time,
            clock=self.clock, pause=self.pause)

    def assert_incident(self, code="TASK_FAILED_WRITERS_STOPPED"):
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(guard.status()["errorCode"], code)
        if code == "TASK_FAILED_WRITERS_STOPPED":
            self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_exact_registered_ids_start_once_and_ready_never_commits_active(self):
        result = self.start()
        self.assertEqual(self.starts, [self.case.ids[name] for name in guard.SERVICES])
        self.assertEqual(result["outcome"], "CANDIDATES_READY")
        self.assertFalse(result["canExecute"])
        self.assertEqual(guard.status()["phase"], "CANDIDATES_READY")
        self.assertEqual(guard.status()["candidate"], self.original["candidate"])
        self.assertTrue(all(row["State"]["Running"] for row in self.info.values()))
        self.assertEqual(self.bindings.call_count, 2)
        self.controller.write_state.assert_not_called()
        self.controller.update_env_sha.assert_not_called()
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any("create" in args or "up" in args for args in self.calls))
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assertEqual(len(self.starts), 3)
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_root_attempt_and_shared_lock_deny_before_start(self):
        with patch.object(guard.os, "geteuid", return_value=1000):
            with self.assertRaises(ReleaseContractError):
                self.start()
        self.attempt = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.attempt = self.original["attemptId"]
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.start()
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")

    def test_pending_config_backup_history_and_proof_fail_before_start(self):
        self.bindings.side_effect = ReleaseContractError("pending/config differs")
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.bindings.side_effect = None
        for observer in (self.case.backup, self.case.history, self.case.proof):
            old = observer.return_value
            observer.return_value = {}
            with self.assertRaises(ReleaseContractError):
                self.start()
            observer.return_value = old
        self.assertEqual(self.starts, [])

    def test_previously_started_candidate_is_not_replayed(self):
        self.info[self.case.ids["api"]]["State"]["Status"] = "exited"
        with self.assertRaisesRegex(ReleaseContractError, "already started"):
            self.start()
        self.assertEqual(self.starts, [])

    def test_start_unknown_after_effect_stops_saved_writers_and_retains_incident(self):
        self.fail_start = self.case.ids["ubereats-worker"]
        with self.assertRaisesRegex(ReleaseContractError, "retained PENDING"):
            self.start()
        self.assertEqual(len(self.starts), 2)
        self.assert_incident()

    def test_unhealthy_candidate_fails_and_stops_all_saved_writers(self):
        self.health = "unhealthy"
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_starting_health_can_become_healthy_with_bounded_wait(self):
        self.health = "starting"
        def healthy(_):
            for row in self.info.values():
                row["State"]["Health"]["Status"] = "healthy"
        self.pause.side_effect = healthy
        self.assertEqual(self.start()["outcome"], "CANDIDATES_READY")
        self.pause.assert_called_once_with(2)

    def test_health_deadline_fails_without_real_sleep(self):
        self.health = "starting"
        self.clock.side_effect = [0, 91]
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.pause.assert_not_called()
        self.assert_incident()

    def test_readiness_failure_stops_candidates_and_keeps_pending(self):
        self.readiness_error = ReleaseContractError("readiness unavailable")
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()
        self.controller.write_state.assert_not_called()

    def test_python_interrupt_uses_shared_cleanup_without_reopening(self):
        self.readiness_error = KeyboardInterrupt()
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_partial_stop_failure_is_fence_unconfirmed(self):
        self.readiness_error = ReleaseContractError("readiness unavailable")
        self.fail_stop = self.case.ids["api"]
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.start()
        self.assert_incident("FENCE_UNCONFIRMED")
        self.assertTrue(self.info[self.case.ids["api"]]["State"]["Running"])

    def test_unknown_replacement_is_never_stopped_by_guessed_id(self):
        self.replace_after_readiness = True
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.start()
        self.assert_incident("FENCE_UNCONFIRMED")
        mutations = [args for args in self.calls if args[:2] in (["docker", "update"], ["docker", "stop"])]
        self.assertNotIn("7" * 64, [args[-1] for args in mutations])

    def test_db_change_after_readiness_is_not_ready(self):
        self.db_after_readiness = True
        with self.assertRaises(ReleaseContractError):
            self.start()
        self.assert_incident()

    def test_start_intention_sync_unknown_never_starts(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("unknown intention sync")):
            with self.assertRaises(OSError):
                self.start()
        self.assertEqual(self.starts, [])
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_final_ready_sync_unknown_stops_without_rewriting_record(self):
        real_sync = os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 4:
                raise OSError("unknown final directory sync")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaisesRegex(ReleaseContractError, "durability unknown"):
                self.start()
        self.assertEqual(count, 4)
        self.assertEqual(guard.status()["phase"], "CANDIDATES_READY")
        self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
        self.controller.write_state.assert_not_called()


class PendingBindingTests(unittest.TestCase):
    def setUp(self):
        self.expanded = {"name": "sanq-app", "services": {}}
        self.env = ("SANQ_IMAGE_SHA=" + OLD + "\n").encode()
        self.manifest = b"manifest fixture"
        self.files = {name: b"fixed runtime fixture" for name in plan.RUNTIME_FILES}
        self.config = hashlib.sha256(self.env + b"\0rendered-compose\0" +
                                     plan._canonical(self.expanded)).hexdigest()
        values = inputs()
        self.original = {"candidate": values["candidate"], "environment": values["environment"],
            "current": {**values["current"], "configurationSha256": self.config,
                        "manifestSha256": hashlib.sha256(self.manifest).hexdigest()},
            "runtimeContract": plan.runtime_contract(self.files, self.files)}
        self.state = {"schemaVersion": 1, "phase": "pending", "current": NEW, "previous": OLD,
                      "reason": "candidate-create-start", "updatedAt": NOW}
        self.controller = SimpleNamespace(ROOT=Path("/uninstalled"), ENV=Path("/uninstalled/.env"),
            STATE=Path("/uninstalled/state"), RUNTIME_MANIFEST=Path("/uninstalled/manifest"),
            ensure_repo_location=Mock(), current_sha_from_text=deploy.current_sha_from_text,
            pwd=SimpleNamespace(getpwnam=Mock(return_value=SimpleNamespace(pw_uid=0))))

    def private_bytes(self, path, owner, **kwargs):
        if path == self.controller.ENV:
            return self.env
        if path == self.controller.STATE:
            return json.dumps(self.state).encode()
        if path == self.controller.RUNTIME_MANIFEST:
            return self.manifest
        return self.files[str(path.relative_to(self.controller.ROOT))]

    def observe_config(self, args, **kwargs):
        return json.dumps(self.expanded)

    def binding(self):
        with patch.object(collector, "_private_bytes", side_effect=self.private_bytes), \
             patch.object(collector, "_configuration", return_value=(self.config, self.original["environment"])):
            return starter._pending_and_config(self.original, self.controller, self.observe_config)

    def test_pending_binding_requires_exact_state_env_manifest_runtime_and_config(self):
        self.assertEqual(self.binding(), self.expanded)
        for field, wrong in (("phase", "active"), ("current", OLD), ("previous", NEW),
                             ("reason", "rollout-start"), ("schemaVersion", True)):
            old = self.state[field]
            self.state[field] = wrong
            with self.assertRaises(ReleaseContractError):
                self.binding()
            self.state[field] = old
        self.env = ("SANQ_IMAGE_SHA=" + NEW + "\n").encode()
        with self.assertRaises(ReleaseContractError):
            self.binding()

    def test_binding_detects_runtime_manifest_and_second_config_drift(self):
        self.manifest = b"changed"
        with self.assertRaises(ReleaseContractError):
            self.binding()
        self.manifest = b"manifest fixture"
        self.files[plan.RUNTIME_FILES[0]] = b"changed runtime"
        with self.assertRaises(ReleaseContractError):
            self.binding()
        self.files[plan.RUNTIME_FILES[0]] = b"fixed runtime fixture"
        self.expanded["name"] = "other-project"
        with self.assertRaises(ReleaseContractError):
            self.binding()


if __name__ == "__main__":
    unittest.main()
