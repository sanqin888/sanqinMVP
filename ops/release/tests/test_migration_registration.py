"""Offline migration intent/registration and stop-post proofs; no SQL execution."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_maintenance_guard as fixtures
import maintenance_guard as guard
import migration_container as migration
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
from release_contract import ReleaseContractError


class MigrationRegistrationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.MaintenanceFlowTests(
            "test_original_policies_persist_before_changes_and_all_writers_confirm_stopped")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.frozen = self.fixture.freeze()
        self.identity, self.attempt = self.fixture.identity, self.frozen["attemptId"]
        self.approval = plan.sql_review(storage.load_plan(self.identity), self.identity)["approvalSha256"]
        self.container_id, self.image_id = "7" * 64, "sha256:" + "8" * 64
        self.inventory, self.info, self.stopped = [], None, []

    def observe_command(self, args, **kwargs):
        if args[:3] == ["docker", "ps", "-a"]:
            return "\n".join(self.inventory)
        if args[:2] == ["docker", "inspect"] and args[-1] == self.container_id:
            return json.dumps(self.info)
        if args[:3] == ["docker", "image", "inspect"] and args[-1] == self.image_id:
            image = fixtures.inputs()["candidate"]["images"]["sanq-api"]
            return json.dumps({"Os": "linux", "Architecture": "amd64",
                "RepoDigests": [guard.collector._pinned(image)],
                "Config": {"Labels": {"org.opencontainers.image.revision": fixtures.NEW}}})
        if args[:2] in (["docker", "stop"], ["docker", "update"]):
            identifier = args[-1]
            self.assertIn(identifier, [self.container_id, *self.fixture.ids.values()])
            info = self.info if identifier == self.container_id else self.fixture.info[identifier]
            if args[1] == "update":
                info["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            else:
                self.stopped.append(identifier)
                info["State"].update(Status="exited", Running=False)
            return ""
        return self.fixture.observe_command(args, **kwargs)

    def begin(self):
        return guard.begin_migration_creation(self.identity, self.attempt, self.approval,
            controller=self.fixture.controller, run=self.observe_command, now=lambda: self.fixture.time)

    def spawn_fixture(self):
        record = guard.status()
        self.inventory = [self.container_id]
        self.info = {"Id": self.container_id, "Name": "/sanq-migrate-" + self.attempt,
            "Image": self.image_id, "Config": {
                "Image": guard.collector._pinned(record["migration"]["release"]["images"]["sanq-api"]),
                "Entrypoint": list(migration.ENTRYPOINT), "Cmd": list(migration.COMMAND),
                "Labels": {"io.sanq.release.role": "migration", "io.sanq.release.plan": self.identity,
                           "io.sanq.release.attempt": self.attempt}},
            "HostConfig": {"RestartPolicy": {"Name": "no", "MaximumRetryCount": 0},
                           "AutoRemove": False, "Privileged": False, "NetworkMode": "sanq-app_default"},
            "Mounts": [], "State": {"Status": "created", "Running": False,
                                   "Restarting": False, "Paused": False}}

    def register(self):
        return guard.register_created_migration(self.identity, self.attempt, self.container_id,
            controller=self.fixture.controller, run=self.observe_command, now=lambda: self.fixture.time)

    def cleanup(self):
        return guard.cleanup_after_task(self.identity, "signal", controller=self.fixture.controller,
            run=self.observe_command, now=lambda: self.fixture.time)

    def test_intent_precedes_registration_exact_approval_and_container_are_retained(self):
        intent = self.begin()
        self.assertEqual(intent["phase"], "MIGRATION_CREATING")
        self.assertIsNone(intent["migration"]["container"])
        self.spawn_fixture()
        value = self.register()
        self.assertEqual(value["schemaVersion"], 3)
        self.assertEqual(value["migration"]["approvalSha256"], self.approval)
        self.assertEqual(value["migration"]["container"],
                         {"containerId": self.container_id, "imageId": self.image_id})
        self.assertFalse(value["canExecute"])
        self.assertFalse(self.stopped)
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()
        with self.assertRaises(ReleaseContractError):
            self.register()

    def test_wrong_approval_attempt_root_or_busy_lock_cannot_upgrade_frozen(self):
        self.approval = "0" * 64
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.approval = plan.sql_review(storage.load_plan(self.identity), self.identity)["approvalSha256"]
        with patch.object(guard.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.begin()
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.begin()
        self.attempt = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.begin()
        self.assertEqual(guard.status()["phase"], "FROZEN")

    def test_unregistered_creation_is_never_reported_as_confirmed_fence(self):
        self.begin()
        self.spawn_fixture()
        with self.assertRaises(ReleaseContractError):
            self.cleanup()
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")
        self.assertNotIn(self.container_id, self.stopped)

    def test_registered_writer_is_stopped_first_and_evidence_remains_incident(self):
        self.begin()
        self.spawn_fixture()
        self.register()
        self.info["State"].update(Status="running", Running=True)
        self.assertEqual(self.cleanup()["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertEqual(self.stopped[0], self.container_id)
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertFalse(self.info["State"]["Running"])

    def test_missing_or_extra_migration_object_blocks_confirmation(self):
        self.begin()
        self.spawn_fixture()
        self.register()
        self.inventory = []
        with self.assertRaises(ReleaseContractError):
            self.cleanup()
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")

    def test_wrong_command_image_role_network_mount_or_autoremove_cannot_register(self):
        self.begin()
        self.spawn_fixture()
        original = copy.deepcopy(self.info)
        variants = []
        for section, key, value in (("Config", "Cmd", ["other"]),
                ("Config", "Image", "ghcr.io/sanqin888/sanq-api:latest"),
                ("HostConfig", "AutoRemove", True),
                ("HostConfig", "NetworkMode", "host"),
                ("HostConfig", "RestartPolicy", {"Name": "always", "MaximumRetryCount": 0})):
            info = copy.deepcopy(original)
            info[section][key] = value
            variants.append(info)
        info = copy.deepcopy(original)
        info["Config"]["Labels"]["io.sanq.release.plan"] = "f" * 64
        variants.append(info)
        info = copy.deepcopy(original)
        info["Mounts"] = [{"Source": "/srv/sanq/uploads"}]
        variants.append(info)
        for info in variants:
            self.info = info
            with self.assertRaises(ReleaseContractError):
                self.register()
        self.assertEqual(guard.status()["phase"], "MIGRATION_CREATING")

    def test_already_started_or_ambiguous_container_cannot_register(self):
        self.begin()
        self.spawn_fixture()
        self.info["State"].update(Status="running", Running=True)
        with self.assertRaises(ReleaseContractError):
            self.register()
        self.info["State"].update(Status="created", Running=False)
        self.inventory.append("9" * 64)
        with self.assertRaises(ReleaseContractError):
            self.register()

    def test_unknown_intent_sync_never_registers_or_clears(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("sync unknown")):
            with self.assertRaises(OSError):
                self.begin()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertFalse(self.inventory)
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_unknown_registration_sync_retains_actual_record_and_no_replay(self):
        self.begin()
        self.spawn_fixture()
        real = guard.os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("directory sync unknown")
            return real(fd)
        with patch.object(guard.os, "fsync", side_effect=sync), self.assertRaises(OSError):
            self.register()
        self.assertEqual(guard.status()["phase"], "MIGRATION_REGISTERED")
        with self.assertRaises(ReleaseContractError):
            self.register()


if __name__ == "__main__":
    unittest.main()
