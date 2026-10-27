"""Offline creation-intent persistence and interruption models, never real create/start."""

from __future__ import annotations

import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_maintenance_guard as fixtures
import maintenance_guard as guard
import deployment_plan_store as storage
import deployment_plan as plan
import release_job as job
from release_contract import ReleaseContractError
from test_deployment_plan import inputs


class CreationIntentTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.MaintenanceFlowTests(
            "test_original_policies_persist_before_changes_and_all_writers_confirm_stopped")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        values = inputs()
        values["pending"] = []
        values["history"] = [{**{key: row[key] for key in ("name", "sha256")}, "state": "applied"}
                             for row in values["inventory"]]
        self.fixture.identity = storage.save_plan(plan.create_plan(created_at=fixtures.NOW, **values))
        self.fixture.observer.return_value = plan.create_plan(created_at=self.fixture.time, **values)
        self.frozen = self.fixture.freeze()
        self.identity = self.fixture.identity
        self.calls = []
        self.extra = []
        self.removed = set()

    def observe_command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:3] == ["docker", "ps", "-a"]:
            service = args[-3].split("=", 2)[-1]
            return "\n".join([self.fixture.ids[service]] + self.extra) + "\n"
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            self.assertIn(guard.status()["phase"], ("CREATING_CANDIDATES", "INCIDENT"))
            self.assertIn(args[-1], self.fixture.ids.values())
            if args[-1] in self.removed:
                raise ReleaseContractError("old ID removed by interrupted create")
            row = self.fixture.info[args[-1]]
            if args[1] == "update":
                row["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            else:
                row["State"] = {"Status": "exited", "Running": False,
                                "Restarting": False, "Paused": False}
            return ""
        return self.fixture.observe_command(args, **kwargs)

    def begin(self):
        return guard.begin_candidate_creation(self.identity, self.frozen["attemptId"],
            controller=self.fixture.controller, run=self.observe_command, now=lambda: self.fixture.time)

    def cleanup(self):
        return guard.cleanup_after_task(self.identity, "success", controller=self.fixture.controller,
            run=self.observe_command, now=lambda: self.fixture.time)

    def mutations(self):
        return [args for args in self.calls if args[:2] in (["docker", "update"], ["docker", "stop"])]

    def test_intention_persists_exact_candidate_and_empty_ids_before_any_create(self):
        result = self.begin()
        self.assertEqual(result, guard.status())
        self.assertEqual(result["phase"], "CREATING_CANDIDATES")
        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(result["candidate"], {"release": inputs()["candidate"], "containers": {}})
        self.assertEqual(result["originalContainers"], self.frozen["originalContainers"])
        self.assertEqual(result["attemptId"], self.frozen["attemptId"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(self.mutations(), [])
        self.assertFalse(any("create" in args or "start" in args or "up" in args for args in self.calls))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_root_same_plan_attempt_and_frozen_phase_required(self):
        with patch.object(guard.os, "geteuid", return_value=1000):
            with self.assertRaises(ReleaseContractError):
                self.begin()
        for identity, attempt in (("a" * 64, self.frozen["attemptId"]),
                                   (self.identity, "e" * 32)):
            with self.assertRaises(ReleaseContractError):
                guard.begin_candidate_creation(identity, attempt,
                    controller=self.fixture.controller, run=self.observe_command,
                    now=lambda: self.fixture.time)
        self.assertEqual(self.calls, [])
        self.begin()
        before = self.fixture.marker.read_bytes()
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(before, self.fixture.marker.read_bytes())

    def test_gate_and_unexpected_existing_candidate_deny_before_intention(self):
        self.fixture.gate.side_effect = ReleaseContractError("gate absent")
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.fixture.gate.side_effect = None
        self.extra = ["4" * 64]
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.mutations(), [])

    def test_running_old_writer_or_backup_change_denies(self):
        row = self.fixture.info[self.fixture.ids["api"]]
        row["State"].update(Status="running", Running=True)
        with self.assertRaises(ReleaseContractError):
            self.begin()
        row["State"].update(Status="exited", Running=False)
        self.fixture.backup_active = True
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.mutations(), [])

    def test_missing_plan_and_leftovers_deny_without_new_intention(self):
        path = self.fixture.plans / (self.identity + ".json")
        raw = path.read_bytes()
        path.unlink()
        with self.assertRaises(OSError):
            self.begin()
        path.write_bytes(raw)
        path.chmod(0o600)
        (self.fixture.maintenance / "partial.tmp").write_bytes(b"partial")
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(guard.status()["phase"], "FROZEN")

    def test_global_lock_prevents_concurrent_intention(self):
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(self.calls, [])

    def test_clock_regression_denies_without_creation(self):
        self.fixture.time = "2026-10-26T16:00:00Z"
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.mutations(), [])

    def test_initial_sync_unknown_preserves_old_marker_and_partial(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("unknown sync")):
            with self.assertRaises(OSError):
                self.begin()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertTrue(any(p.name.endswith(".tmp") for p in self.fixture.maintenance.iterdir()))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()
        self.assertEqual(self.mutations(), [])

    def test_final_sync_unknown_retains_intention_and_never_replays(self):
        real_sync = os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("directory sync unknown")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaises(OSError):
                self.begin()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(self.mutations(), [])

    def test_incomplete_creation_cleanup_stops_only_saved_old_ids_and_stays_unconfirmed(self):
        self.begin()
        self.extra = ["4" * 64, "5" * 64]  # Simulated partial create, no registered identity.
        self.removed.add(self.fixture.ids["api"])
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()
        result = guard.status()
        self.assertEqual(result["phase"], "INCIDENT")
        self.assertEqual(result["errorCode"], "FENCE_UNCONFIRMED")
        self.assertEqual(result["candidate"]["containers"], {})
        self.assertEqual(len(self.mutations()), 6)
        self.assertEqual({args[-1] for args in self.mutations()}, set(self.fixture.ids.values()))
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_direct_registration_without_durable_intention_is_rejected(self):
        identifiers = {service: character * 64 for service, character in
                       (("api", "4"), ("ubereats-worker", "5"), ("web", "6"))}
        with self.assertRaises(ReleaseContractError):
            guard.register_created_candidates(self.identity, self.frozen["attemptId"], identifiers,
                run=self.observe_command, now=lambda: self.fixture.time)
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.calls, [])

    def test_intention_cannot_change_target_partial_ids_or_claim_registered(self):
        result = self.begin()
        for changes in ({"phase": "CANDIDATES_REGISTERED"},
                        {"candidate": {**result["candidate"],
                                       "containers": {"api": {"containerId": "4" * 64,
                                                             "imageId": "sha256:" + "e" * 64}}}},
                        {"candidate": {**result["candidate"],
                                       "release": {**result["candidate"]["release"], "ciRunId": 99}}}):
            changed = {**copy.deepcopy(result), **changes}
            with storage._directory_fd(guard.MAINTENANCE_DIR) as root:
                with self.assertRaises(ReleaseContractError):
                    guard._write(root, changed)
        self.assertEqual(result, guard.status())


if __name__ == "__main__":
    unittest.main()
