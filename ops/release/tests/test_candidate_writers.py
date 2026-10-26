"""Offline candidate registration/cleanup models; no Docker, PID1 or SQL execution."""

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
import collect_deployment_plan as collector
from release_contract import ReleaseContractError
from test_deployment_plan import NEW, inputs


class CandidateWriterTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.MaintenanceFlowTests(
            "test_original_policies_persist_before_changes_and_all_writers_confirm_stopped")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.frozen = self.fixture.freeze()
        self.identity = self.fixture.identity
        self.ids = {service: character * 64 for service, character in
                    (("api", "4"), ("ubereats-worker", "5"), ("web", "6"))}
        self.originals = copy.deepcopy(self.fixture.info)
        self.info = self.fixture.info
        self.inventories = {}
        for service, identifier in self.ids.items():
            name = "sanq-web" if service == "web" else "sanq-api"
            self.info[identifier] = {
                "Id": identifier, "Image": "sha256:" + ("f" if service == "web" else "e") * 64,
                "Config": {"Image": collector._pinned(inputs()["candidate"]["images"][name]),
                           "Labels": {"com.docker.compose.project": "sanq-app",
                                      "com.docker.compose.service": service},
                           "Env": ["DO_NOT_PERSIST"]},
                "HostConfig": {"RestartPolicy": {"Name": "no", "MaximumRetryCount": 0}},
                "State": {"Status": "created", "Running": False, "Restarting": False, "Paused": False}}
            self.inventories[service] = [self.fixture.ids[service], identifier]
        self.calls = []
        self.fail_stop = None
        self.bad_image = None
        self.marker = self.fixture.marker

    def observe_command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:3] == ["docker", "ps", "-a"]:
            service = args[-3].split("=", 2)[-1]
            return "\n".join(self.inventories[service]) + "\n"
        if args[:3] == ["docker", "image", "inspect"]:
            name = "sanq-web" if args[-1] == self.info[self.ids["web"]]["Image"] else "sanq-api"
            return json.dumps({"Os": "linux", "Architecture": "amd64",
                "RepoDigests": ["ghcr.io/sanqin888/" + name + "@sha256:" + "0" * 64]
                    if self.bad_image == "digest" else [collector._pinned(inputs()["candidate"]["images"][name])],
                "Config": {"Labels": {"org.opencontainers.image.revision":
                                     "0" * 40 if self.bad_image == "revision" else NEW}}})
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            recorded = guard.status()
            self.assertEqual(recorded["schemaVersion"], 2)
            self.assertIn(recorded["phase"], ("CANDIDATES_REGISTERED", "INCIDENT"))
            self.assertIn(args[-1], set(self.ids.values()) | set(self.fixture.ids.values()))
            identifier = args[-1]
            if identifier not in self.info:
                raise ReleaseContractError("removed original")
            if args[1] == "stop" and identifier == self.fail_stop:
                raise ReleaseContractError("simulated stop failure")
            if args[1] == "update":
                self.info[identifier]["HostConfig"]["RestartPolicy"] = {
                    "Name": "no", "MaximumRetryCount": 0}
            else:
                self.info[identifier]["State"] = {
                    "Status": "exited", "Running": False, "Restarting": False, "Paused": False}
            return ""
        return self.fixture.observe_command(args, **kwargs)

    def register(self, **kwargs):
        return guard.register_created_candidates(self.identity, self.frozen["attemptId"],
            self.ids, run=self.observe_command, now=lambda: self.fixture.time, **kwargs)

    def cleanup(self, result="exit-code"):
        return guard.cleanup_after_task(self.identity, result, controller=self.fixture.controller,
            run=self.observe_command, now=lambda: self.fixture.time)

    def mutations(self):
        return [args for args in self.calls if args[:2] in (["docker", "update"], ["docker", "stop"])]

    def start_candidates(self):
        for identifier in self.ids.values():
            self.info[identifier]["State"] = {
                "Status": "running", "Running": True, "Restarting": False, "Paused": False}

    def remove_originals(self):
        for service, identifier in self.fixture.ids.items():
            del self.info[identifier]
            self.inventories[service].remove(identifier)

    def test_registration_is_durable_exact_and_read_only_for_business(self):
        result = self.register()
        self.assertEqual(guard.status(), result)
        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(result["phase"], "CANDIDATES_REGISTERED")
        self.assertEqual(result["candidate"]["release"], inputs()["candidate"])
        self.assertEqual(result["originalContainers"], self.frozen["originalContainers"])
        self.assertEqual(self.mutations(), [])
        self.assertFalse(result["canExecute"])
        self.assertNotIn("DO_NOT_PERSIST", self.marker.read_text())
        self.assertEqual(self.marker.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_registration_requires_root_same_plan_attempt_and_no_leftovers(self):
        with patch.object(guard.os, "geteuid", return_value=1000):
            with self.assertRaises(ReleaseContractError):
                self.register()
        for identity, attempt in (("a" * 64, self.frozen["attemptId"]),
                                   (self.identity, "f" * 32)):
            with self.assertRaises(ReleaseContractError):
                guard.register_created_candidates(identity, attempt, self.ids,
                    run=self.observe_command, now=lambda: self.fixture.time)
        (self.fixture.maintenance / "partial.tmp").write_bytes(b"partial")
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.assertEqual(self.calls, [])

    def test_rejects_partial_short_duplicate_or_original_ids(self):
        for identifiers in ({"api": self.ids["api"]}, {**self.ids, "api": "short"},
                            {**self.ids, "api": self.ids["web"]},
                            {**self.ids, "api": self.fixture.ids["api"]}):
            with self.subTest(identifiers=identifiers), self.assertRaises(ReleaseContractError):
                guard.register_created_candidates(self.identity, self.frozen["attemptId"], identifiers,
                    run=self.observe_command, now=lambda: self.fixture.time)
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.mutations(), [])

    def test_running_exited_restart_tag_role_and_image_errors_reject_before_write(self):
        baseline = copy.deepcopy(self.info[self.ids["api"]])
        mutations = (
            lambda row: row["State"].update(Status="running", Running=True),
            lambda row: row["State"].update(Status="exited"),
            lambda row: row["HostConfig"]["RestartPolicy"].update(Name="always"),
            lambda row: row["Config"].update(Image=inputs()["candidate"]["images"]["sanq-api"]["ref"]),
            lambda row: row["Config"]["Labels"].update({"com.docker.compose.service": "db"}),
            lambda row: row.update(Image="invalid"),
        )
        for change in mutations:
            self.info[self.ids["api"]] = copy.deepcopy(baseline)
            change(self.info[self.ids["api"]])
            with self.assertRaises(ReleaseContractError):
                self.register()
            self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.mutations(), [])

    def test_bad_digest_revision_or_different_worker_image_rejects(self):
        self.bad_image = True
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.bad_image = False
        self.info[self.ids["ubereats-worker"]]["Image"] = "sha256:" + "a" * 64
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.assertEqual(guard.status()["phase"], "FROZEN")

    def test_inventory_missing_candidate_extra_unknown_and_running_original_reject(self):
        baseline = copy.deepcopy(self.inventories)
        for identifiers in ([self.fixture.ids["api"]], [self.ids["api"], "7" * 64],
                            [self.ids["api"]] * 2):
            self.inventories["api"] = identifiers
            with self.assertRaises(ReleaseContractError):
                self.register()
        self.inventories = baseline
        self.info[self.fixture.ids["api"]]["State"].update(Status="running", Running=True)
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.assertEqual(self.mutations(), [])

    def test_removed_originals_are_accepted_only_with_complete_exact_candidate_inventory(self):
        self.remove_originals()
        self.assertEqual(self.register()["phase"], "CANDIDATES_REGISTERED")
        self.start_candidates()
        self.assertEqual(self.cleanup()["outcome"], "TASK_FAILED_WRITERS_STOPPED")

    def test_backup_gate_and_clock_failure_leave_original_evidence(self):
        self.fixture.backup_active = True
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.fixture.backup_active = False
        self.fixture.gate.side_effect = ReleaseContractError("gate unavailable")
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.fixture.gate.side_effect = None
        self.fixture.time = "2026-10-26T16:00:00Z"
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.mutations(), [])

    def test_duplicate_registration_and_record_substitution_never_overwrite(self):
        registered = self.register()
        with self.assertRaises(ReleaseContractError):
            self.register()
        with storage._directory_fd(guard.MAINTENANCE_DIR) as root:
            for changed in ({**registered, "schemaVersion": 1, "phase": "INCIDENT",
                             "errorCode": "FENCE_UNCONFIRMED"},
                            {**registered, "phase": "INCIDENT", "errorCode": "FENCE_UNCONFIRMED",
                             "candidate": {**registered["candidate"], "release":
                                 {**registered["candidate"]["release"], "ciRunId": 99}}}):
                if changed["schemaVersion"] == 1:
                    del changed["candidate"]
                with self.assertRaises(ReleaseContractError):
                    guard._write(root, changed)
        self.assertEqual(guard.status(), registered)

    def test_initial_sync_failure_retains_partial_and_never_starts(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("unknown sync")):
            with self.assertRaises(OSError):
                self.register()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertTrue(any(path.name.endswith(".tmp") for path in self.fixture.maintenance.iterdir()))
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()
        self.assertEqual(self.mutations(), [])

    def test_final_sync_unknown_keeps_registration_and_cleanup_can_stop_ids(self):
        original_sync = os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("directory sync unknown")
            return original_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaises(OSError):
                self.register()
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")
        self.assertEqual(self.mutations(), [])
        self.assertEqual(self.cleanup()["outcome"], "TASK_FAILED_WRITERS_STOPPED")

    def test_cleanup_stops_all_registered_ids_and_success_never_reopens(self):
        self.register()
        self.start_candidates()
        result = self.cleanup("success")
        self.assertEqual(result["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertEqual({args[-1] for args in self.mutations()}, set(self.ids.values()) | set(self.fixture.ids.values()))
        self.assertEqual(len(self.mutations()), 12)
        self.assertEqual({args[-1] for args in self.mutations()[:6]}, set(self.ids.values()))
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertTrue(all(not row["State"]["Running"] for row in self.info.values()))
        self.cleanup()
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_partial_candidate_stop_failure_attempts_every_id_and_records_unconfirmed(self):
        self.register()
        self.start_candidates()
        self.fail_stop = self.ids["api"]
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()
        self.assertEqual(len(self.mutations()), 12)
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")

    def test_unknown_replacement_is_never_stopped_or_reported_confirmed(self):
        self.register()
        self.start_candidates()
        self.inventories["api"] = ["7" * 64]
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()
        self.assertNotIn("7" * 64, [args[-1] for args in self.mutations()])
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")

    def test_changed_registered_image_or_missing_candidate_cannot_confirm_stop(self):
        self.register()
        self.info[self.ids["api"]]["Image"] = "sha256:" + "a" * 64
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()
        self.info[self.ids["api"]]["Image"] = "sha256:" + "e" * 64
        self.inventories["api"] = [self.fixture.ids["api"]]
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.cleanup()

    def test_corrupt_v2_cannot_authorize_cleanup(self):
        registered = self.register()
        registered["candidate"]["containers"]["api"]["containerId"] = "short"
        self.marker.write_text(json.dumps(registered))
        with self.assertRaises(ReleaseContractError):
            self.cleanup()
        self.assertEqual(self.mutations(), [])


if __name__ == "__main__":
    unittest.main()
