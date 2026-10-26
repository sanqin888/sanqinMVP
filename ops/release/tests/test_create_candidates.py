"""Offline create-only orchestration; every Docker/PID1 call is a model."""

from __future__ import annotations

import copy
import contextlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_maintenance_guard as fixtures
import maintenance_guard as guard
import deployment_plan as plan
import deployment_plan_store as storage
import collect_deployment_plan as collector
import release_job as job
import deploy_release as deploy
from release_contract import ReleaseContractError
from test_deployment_plan import OLD, NEW, NOW, inputs


class CreateOnlyTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.MaintenanceFlowTests(
            "test_original_policies_persist_before_changes_and_all_writers_confirm_stopped")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.values = inputs()
        self.values["pending"] = []
        self.values["history"] = [{"name": row["name"], "sha256": row["sha256"], "state": "applied"}
                                  for row in self.values["inventory"]]
        self.installed = {name: b"fixed installed fixture" for name in plan.RUNTIME_FILES}
        self.values["runtime_pins"] = plan.runtime_contract(self.installed, self.installed)
        raw = plan.create_plan(created_at=NOW, **self.values)
        self.identity = storage.save_plan(raw)
        self.fixture.identity = self.identity
        self.fixture.observer.return_value = plan.create_plan(created_at=self.fixture.time, **self.values)
        self.frozen = self.fixture.freeze()
        self.controller = self.fixture.controller
        self.stack = self.fixture.stack
        self.snapshot = self.stack.enter_context(patch.object(collector, "_snapshot",
            return_value=(self.values["current"], self.installed, self.values["environment"])))
        self.history = self.stack.enter_context(patch.object(collector, "_history",
                                                            return_value=self.values["history"]))
        self.backup = self.stack.enter_context(patch.object(collector, "_backup",
                                                           return_value=self.values["backup"]))
        self.resources = self.stack.enter_context(patch.object(collector, "_resource_preflight"))
        self.proof = self.stack.enter_context(patch.object(guard.release, "verify_exact_candidate",
                                                          return_value=self.values["candidate"]))
        self.calls, self.creates = [], []
        self.pending = False
        self.fail_create = self.change_db = self.bad_mount = False
        self.ids = {service: character * 64 for service, character in
                    (("api", "4"), ("ubereats-worker", "5"), ("web", "6"))}
        self.role_ids = dict(self.fixture.ids)
        self.db_id = "9" * 64
        self.expanded = {"name": "sanq-app", "services": {"db": {"image": "postgres:15"}},
                         "networks": {"default": {"name": "sanq-app_default"}},
                         "volumes": {"pgdata": {"name": "sanq-app_pgdata"}}}
        for service in guard.SERVICES:
            name = "sanq-web" if service == "web" else "sanq-api"
            self.expanded["services"][service] = {
                "image": f"ghcr.io/sanqin888/{name}:{OLD}", "restart": "always",
                "depends_on": {"db": {"condition": "service_healthy"}},
                "environment": {"PRIVATE_FIXTURE": "DO_NOT_PERSIST"},
                "networks": {"default": None},
                "volumes": [] if service == "web" else [
                    {"type": "bind", "source": "/srv/sanq/uploads", "target": "/app/uploads"}]}
        def pending(current, target):
            self.assertEqual((current, target), (OLD, NEW))
            self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
            with self.assertRaises(ReleaseContractError):
                with job._locked_directory():
                    pass
            self.pending = True
        self.controller.write_creation_pending.side_effect = pending

    def observe_command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:2] == ["docker", "compose"]:
            if "create" in args:
                self.assertTrue(self.pending)
                self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
                with self.assertRaises(ReleaseContractError):
                    with job._locked_directory():
                        pass
                with self.assertRaises(ReleaseContractError):
                    with storage.preparation_lock():
                        pass
                body = json.loads(kwargs["input_bytes"])
                self.creates.append((args[:], body, kwargs["timeout"]))
                for service in guard.SERVICES:
                    identifier = self.ids[service]
                    old = self.fixture.info[self.fixture.ids[service]]
                    info = copy.deepcopy(old)
                    info["Id"], info["Config"]["Image"] = identifier, body["services"][service]["image"]
                    info["Image"] = "sha256:" + ("f" if service == "web" else "e") * 64
                    info["State"] = {"Status": "created", "Running": False,
                                     "Restarting": False, "Paused": False}
                    info["Mounts"] = [{"Type": "bind", "Source": "/srv/sanq/uploads",
                                       "Destination": "/app/uploads", "RW": True}]
                    if service == "web":
                        info["Mounts"] = []
                    if self.bad_mount and service == "api":
                        info["Mounts"][0]["Source"] = "/wrong-upload"
                    self.fixture.info[identifier] = info
                    self.role_ids[service] = identifier
                    del self.fixture.info[self.fixture.ids[service]]
                    if self.fail_create:
                        raise ReleaseContractError("unknown create outcome")
                return ""
            if args[-3:] == ["config", "--format", "json"]:
                return json.dumps(self.expanded)
            if args[-4:-1] == ["ps", "-a", "-q"]:
                return self.db_id if args[-1] == "db" else self.role_ids[args[-1]]
        if args[:3] == ["docker", "ps", "-a"]:
            service = args[-3].split("=", 2)[-1]
            return self.role_ids[service] + "\n"
        if args[:3] == ["docker", "image", "inspect"]:
            name = "sanq-web" if "sanq-web" in args[-1] or args[-1] == "sha256:" + "f" * 64 else "sanq-api"
            return json.dumps({"Os": "linux", "Architecture": "amd64",
                "RepoDigests": [collector._pinned(self.values["candidate"]["images"][name])],
                "Config": {"Labels": {"org.opencontainers.image.revision": NEW}}})
        if args[:2] == ["docker", "inspect"] and args[-1] == self.db_id:
            return json.dumps({"Id": self.db_id, "Image": "sha256:" +
                ("2" if self.creates and self.change_db else "1") * 64,
                "State": {"Running": True},
                "Config": {"Labels": {"com.docker.compose.project": "sanq-app",
                                       "com.docker.compose.service": "db"}},
                "Mounts": [{"Type": "volume", "Name": "sanq-app_pgdata",
                            "Destination": "/var/lib/postgresql/data"}]})
        return self.fixture.observe_command(args, **kwargs)

    def prepare(self):
        return guard.prepare_candidate_containers(self.identity, self.frozen["attemptId"],
            controller=self.controller, run=self.observe_command, fetch=Mock(),
            now=lambda: self.fixture.time)

    def test_create_only_is_locked_exact_and_keeps_pending_and_maintenance(self):
        result = self.prepare()
        self.assertEqual(result["outcome"], "CANDIDATES_CREATED_NOT_STARTED")
        self.assertFalse(result["canExecute"])
        args, body, timeout = self.creates[0]
        self.assertEqual(timeout, 180)
        self.assertEqual(args[-3:], list(guard.SERVICES))
        self.assertEqual(args[args.index("create") + 1:-3],
                         ["--no-build", "--pull", "never", "--force-recreate"])
        self.assertEqual(set(body["services"]), set(guard.SERVICES))
        self.assertNotIn("volumes", body)
        self.assertEqual(body["networks"], {"default": {"external": True, "name": "sanq-app_default"}})
        for service, fields in body["services"].items():
            self.assertEqual(fields["restart"], "no")
            self.assertNotIn("depends_on", fields)
            name = "sanq-web" if service == "web" else "sanq-api"
            self.assertEqual(fields["image"], collector._pinned(self.values["candidate"]["images"][name]))
            self.assertEqual(self.fixture.info[self.ids[service]]["State"]["Status"], "created")
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")
        self.assertNotIn("DO_NOT_PERSIST", self.fixture.marker.read_text())
        self.assertFalse(any("start" in args or "up" in args or "build" in args for args in self.calls))
        self.controller.update_env_sha.assert_not_called()
        self.controller.apply_reviewed_migrations.assert_not_called()

    def test_pending_sql_is_rejected_before_intention_and_create(self):
        raw = plan.create_plan(created_at=NOW, **inputs())
        self.identity = json.loads(raw)["planId"]  # Existing pending fixture plan.
        with self.assertRaisesRegex(ReleaseContractError, "SQL authorization"):
            self.prepare()
        self.assertEqual(self.creates, [])
        self.controller.write_creation_pending.assert_not_called()
        self.assertEqual(guard.status()["phase"], "FROZEN")

    def test_snapshot_history_backup_or_proof_drift_prevents_mutation(self):
        for observer in (self.snapshot, self.history, self.backup, self.proof):
            original = observer.return_value
            observer.return_value = {} if observer is not self.snapshot else ({}, self.installed, self.values["environment"])
            with self.assertRaises(ReleaseContractError):
                self.prepare()
            observer.return_value = original
        self.assertFalse(self.pending)
        self.assertEqual(self.creates, [])
        self.assertEqual(guard.status()["phase"], "FROZEN")

    def test_configuration_change_during_preparation_denies(self):
        baseline = self.snapshot.return_value
        self.snapshot.side_effect = [baseline, ({}, self.installed, self.values["environment"])]
        with self.assertRaisesRegex(ReleaseContractError, "configuration changed"):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "FROZEN")
        self.assertEqual(self.creates, [])

    def test_pending_durability_unknown_never_creates_or_retries(self):
        self.controller.write_creation_pending.side_effect = OSError("unknown durable state")
        with self.assertRaises(OSError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        self.assertEqual(self.creates, [])

    def test_create_timeout_retains_intention_and_never_retries(self):
        self.fail_create = True
        with self.assertRaisesRegex(ReleaseContractError, "unknown create"):
            self.prepare()
        self.assertEqual(len(self.creates), 1)
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(len(self.creates), 1)

    def test_changed_database_never_registers_candidates(self):
        self.change_db = True
        with self.assertRaisesRegex(ReleaseContractError, "database changed"):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")

    def test_wrong_created_mount_keeps_unfinished_creation(self):
        self.bad_mount = True
        with self.assertRaisesRegex(ReleaseContractError, "bind mount"):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")

    def test_unsupported_config_resources_are_rejected_before_pending(self):
        for key, value in (("build", "."), ("secrets", ["secret"]), ("scale", 2)):
            self.expanded["services"]["api"][key] = value
            with self.assertRaises(ReleaseContractError):
                self.prepare()
            del self.expanded["services"]["api"][key]
        self.expanded["networks"]["default"]["name"] = "other-network"
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(self.creates, [])
        self.assertFalse(self.pending)

    def test_new_controller_api_and_original_attempt_required(self):
        original = self.controller.write_creation_pending
        self.controller.write_creation_pending = None
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.controller.write_creation_pending = original
        self.frozen["attemptId"] = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(self.creates, [])
        self.assertFalse(self.pending)


class DurablePendingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.state, self.env = self.root / "state.json", self.root / ".env"
        self.env.write_text("SANQ_IMAGE_SHA=" + OLD + "\n")
        self.state.write_text(json.dumps({"phase": "active", "current": OLD, "previous": "c" * 40}))
        self.state.chmod(0o600)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.multiple(deploy, ROOT=self.root, STATE=self.state, ENV=self.env))
        self.privilege = self.stack.enter_context(patch.object(deploy, "require_mutation_privilege"))

    def test_pending_is_only_authority_and_directory_syncs_before_readback(self):
        with patch.object(deploy.os, "fsync", wraps=os.fsync) as sync:
            deploy.write_creation_pending(OLD, NEW)
        self.assertEqual(sync.call_count, 2)
        self.assertEqual(deploy.read_state()["phase"], "pending")
        self.assertEqual(deploy.read_state()["current"], NEW)
        self.assertEqual(deploy.read_state()["previous"], OLD)
        self.assertEqual(deploy.read_current_sha(), OLD)
        with self.assertRaises(deploy.DeploymentBlocked):
            deploy.write_creation_pending(OLD, NEW)

    def test_directory_sync_unknown_retains_pending_without_rewrite(self):
        real_sync = os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("unknown directory sync")
            return real_sync(fd)
        with patch.object(deploy.os, "fsync", side_effect=sync):
            with self.assertRaises(OSError):
                deploy.write_creation_pending(OLD, NEW)
        self.assertEqual(deploy.read_state()["phase"], "pending")


class PrivateCommandInputTests(unittest.TestCase):
    def test_private_bounded_stdin_never_appears_in_arguments(self):
        body = b'{"private":"DO_NOT_ECHO"}'
        def child(args, **kwargs):
            self.assertEqual(args, ["fixed-command"])
            self.assertEqual(kwargs["stdin"].read(), body)
            kwargs["stdout"].write(b"accepted")
            return SimpleNamespace(returncode=0)
        with patch.object(collector.subprocess, "run", side_effect=child):
            self.assertEqual(collector.command(["fixed-command"], input_bytes=body), "accepted")

    def test_input_budget_rejects_before_running_child(self):
        with patch.object(collector.subprocess, "run") as child:
            for body in ("not bytes", b"x" * (collector.MAX_OUTPUT + 1)):
                with self.assertRaises(ReleaseContractError):
                    collector.command(["fixed-command"], input_bytes=body)
            child.assert_not_called()


if __name__ == "__main__":
    unittest.main()
