"""Offline maintenance adapter tests. Never invoke Docker, systemd or business SQL."""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import maintenance_guard as guard
import deployment_plan as plan
import deployment_plan_store as storage
import release_job as job
from release_contract import ReleaseContractError
from test_deployment_plan import OLD, NEW, NOW, inputs


class MaintenanceFlowTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.parent = Path(temporary.name)
        self.parent.chmod(0o700)
        self.maintenance, self.jobs, self.plans = [self.parent / name
                                                  for name in ("maintenance", "jobs", "plans")]
        for directory in (self.maintenance, self.jobs, self.plans):
            directory.mkdir(mode=0o700)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        for module, name, value in ((guard, "MAINTENANCE_DIR", self.maintenance),
                                    (job, "JOB_DIR", self.jobs), (storage, "PLAN_DIR", self.plans),
                                    (storage, "OWNER_UID", os.getuid())):
            self.stack.enter_context(patch.object(module, name, value))
        self.stack.enter_context(patch.object(guard.os, "geteuid", return_value=0))
        self.gate = self.stack.enter_context(patch.object(guard, "_installed_gate"))
        raw = plan.create_plan(created_at=NOW, **inputs())
        self.identity = json.loads(raw)["planId"]
        storage.save_plan(raw)
        self.time = "2026-10-26T16:10:00Z"
        self.observer = Mock(return_value=plan.create_plan(created_at=self.time, **inputs()))
        self.controller = Mock()
        self.controller.ROOT, self.controller.ENV, self.controller.COMPOSE = (
            Path("/uninstalled-fixture"), Path("/uninstalled-fixture/.env"),
            Path("/uninstalled-fixture/compose"))
        self.ids = {name: character * 64 for name, character in
                    (("api", "1"), ("ubereats-worker", "2"), ("web", "3"))}
        self.info = {}
        for service, identifier in self.ids.items():
            image = "sanq-web" if service == "web" else "sanq-api"
            self.info[identifier] = {
                "Id": identifier, "Image": "sha256:" + ("c" if service == "web" else "d") * 64,
                "Config": {"Image": f"ghcr.io/sanqin888/{image}:{OLD}",
                           "Labels": {"com.docker.compose.project": "sanq-app",
                                      "com.docker.compose.service": service},
                           "Env": ["DO_NOT_PERSIST"]},
                "State": {"Status": "running", "Running": True, "Restarting": False, "Paused": False},
                "HostConfig": {"RestartPolicy": {"Name": "always", "MaximumRetryCount": 0}},
            }
        self.paired = inputs()["candidate"]
        self.stack.enter_context(patch.object(guard.release, "sealed_release_for_sha",
                                             return_value=self.paired))
        self.calls = []
        self.fail_update = self.fail_stop = False
        self.backup_race = self.backup_active = False
        self.replace_writer = False
        self.marker = self.maintenance / guard.MARKER

    def run(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:2] == ["systemctl", "show"]:
            is_timer = args[2].endswith(".timer")
            active = (self.backup_active or (self.backup_race and self.marker.exists())) and not is_timer
            values = {"LoadState": "loaded", "ActiveState": "active" if is_timer or active else "inactive",
                      "SubState": "waiting" if is_timer else "running" if active else "dead",
                      "UnitFileState": "enabled" if is_timer else "static"}
            return "\n".join(f"{key}={value}" for key, value in values.items())
        if args[:3] == ["docker", "image", "inspect"]:
            image = "sanq-web" if args[-1] == "sha256:" + "c" * 64 else "sanq-api"
            return json.dumps({"Os": "linux", "Architecture": "amd64",
                "RepoDigests": [f"ghcr.io/sanqin888/{image}@" + inputs()["candidate"]["images"][image]["digest"]],
                "Config": {"Labels": {"org.opencontainers.image.revision": OLD}}})
        if args[:2] == ["docker", "compose"]:
            service = args[-1]
            if self.replace_writer and service == "api" and not self.info[self.ids["api"]]["State"]["Running"]:
                return "4" * 64
            return self.ids[service]
        if args[:2] == ["docker", "inspect"]:
            return json.dumps(self.info[args[-1]])
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            self.assertEqual(guard.status()["phase"], "ARMED")
            with self.assertRaises(ReleaseContractError):
                guard.check_startup()
            identifier = args[-1]
            if args[1] == "update":
                if self.fail_update and identifier == self.ids["api"]:
                    raise ReleaseContractError("simulated update failure")
                self.info[identifier]["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            else:
                if self.fail_stop and identifier == self.ids["api"]:
                    raise ReleaseContractError("simulated stop failure")
                self.info[identifier]["State"] = {
                    "Status": "exited", "Running": False, "Restarting": False, "Paused": False}
            return ""
        raise AssertionError("unexpected command: " + repr(args))

    def freeze(self):
        return guard.freeze_for_plan(self.identity, controller=self.controller,
                                     run=self.run, observe=self.observer,
                                     fetch=Mock(), now=lambda: self.time)

    def mutations(self):
        return [args for args in self.calls if args[:2] in (["docker", "update"], ["docker", "stop"])]

    def test_original_policies_persist_before_changes_and_all_writers_confirm_stopped(self):
        self.info[self.ids["api"]]["HostConfig"]["RestartPolicy"] = {
            "Name": "on-failure", "MaximumRetryCount": 7}
        value = self.freeze()
        self.assertEqual(value["phase"], "FROZEN")
        self.assertFalse(value["canExecute"])
        self.assertEqual(value["originalContainers"]["api"]["restartPolicy"],
                         {"Name": "on-failure", "MaximumRetryCount": 7})
        self.assertEqual(value["backupUnits"]["timer"]["UnitFileState"], "enabled")
        self.assertNotIn("DO_NOT_PERSIST", self.marker.read_text())
        self.assertEqual(self.marker.stat().st_mode & 0o777, 0o600)
        self.assertEqual([args[1] for args in self.mutations()], ["update"] * 3 + ["stop"] * 3)
        self.assertEqual({args[-1] for args in self.mutations()}, set(self.ids.values()))
        self.observer.assert_called_once_with(NEW, cache_images=False)
        for identifier in self.ids.values():
            self.assertFalse(self.info[identifier]["State"]["Running"])
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_missing_installed_gate_blocks_before_observation_or_marker(self):
        with patch.object(guard.os, "geteuid", return_value=1000):
            with self.assertRaises(ReleaseContractError):
                self.freeze()
        self.gate.assert_not_called()
        self.gate.side_effect = ReleaseContractError("not installed")
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.observer.assert_not_called()
        self.assertFalse(self.marker.exists())
        self.assertEqual(self.mutations(), [])

    def test_changed_plan_blocks_before_any_marker_or_policy_change(self):
        values = inputs()
        values["current"]["configurationSha256"] = "f" * 64
        self.observer.return_value = plan.create_plan(created_at=self.time, **values)
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertFalse(self.marker.exists())
        self.assertEqual(self.mutations(), [])

    def test_active_backup_or_existing_marker_blocks_before_container_changes(self):
        self.backup_active = True
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertFalse(self.marker.exists())
        self.assertEqual(self.mutations(), [])
        self.backup_active = False
        self.marker.write_bytes(b"existing")
        with self.assertRaises(ReleaseContractError):
            self.freeze()
        self.assertEqual(self.mutations(), [])
        self.assertEqual(self.marker.read_bytes(), b"existing")

    def test_backup_race_after_arming_keeps_incident_and_does_not_claim_frozen(self):
        self.backup_race = True
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.freeze()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")
        self.assertTrue(all(args[:2] != ["systemctl", "stop"] for args in self.calls))

    def test_restart_update_failure_attempts_other_writers_and_keeps_incident(self):
        self.fail_update = True
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.freeze()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        stopped = {args[-1] for args in self.mutations() if args[1] == "stop"}
        self.assertTrue(set(self.ids.values()) <= stopped)
        self.assertNotIn("start", [args[1] for args in self.calls])

    def test_stop_failure_remains_unconfirmed_even_if_other_services_are_stopped(self):
        self.fail_stop = True
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.freeze()
        self.assertTrue(self.info[self.ids["api"]]["State"]["Running"])
        self.assertEqual(guard.status()["phase"], "INCIDENT")

    def test_replaced_writer_never_receives_an_unreviewed_stop_and_blocks_frozen(self):
        self.replace_writer = True
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.freeze()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertNotIn("4" * 64, [args[-1] for args in self.mutations()])

    def test_initial_sync_failure_never_changes_container_policy(self):
        with patch.object(guard.os, "fsync", side_effect=OSError("sync failed")):
            with self.assertRaises(OSError):
                self.freeze()
        self.assertEqual(self.mutations(), [])
        self.assertTrue(self.marker.exists())
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_final_sync_unknown_never_clears_or_rewrites_evidence(self):
        real_sync = os.fsync
        count = 0
        def sync(fd):
            nonlocal count
            count += 1
            if count == 4:
                raise OSError("directory sync unknown")
            return real_sync(fd)
        with patch.object(guard.os, "fsync", side_effect=sync):
            with self.assertRaises(OSError):
                self.freeze()
        self.assertEqual(count, 4)
        self.assertEqual(guard.status()["phase"], "FROZEN")
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_clock_step_back_after_arming_cannot_commit_frozen(self):
        stamps = iter((self.time, "2026-10-26T16:11:00Z", "2026-10-26T16:10:30Z"))
        with self.assertRaises(ReleaseContractError):
            guard.freeze_for_plan(self.identity, controller=self.controller, run=self.run,
                                  observe=self.observer, fetch=Mock(), now=lambda: next(stamps))
        self.assertEqual(guard.status()["phase"], "ARMED")
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_cold_start_denies_partial_unknown_directory_and_symlink_evidence(self):
        guard.check_startup()
        for name in ("partial.tmp", guard.MARKER):
            path = self.maintenance / name
            path.write_bytes(b"partial")
            with self.subTest(name=name), self.assertRaises(ReleaseContractError):
                guard.check_startup()
            path.unlink()
        self.marker.symlink_to(self.parent / "missing")
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()

    def test_unprovisioned_or_public_directory_is_never_auto_created_or_accepted(self):
        self.maintenance.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            guard.check_startup()
        self.maintenance.chmod(0o700)
        self.maintenance.rmdir()
        with self.assertRaises(OSError):
            guard.check_startup()
        self.assertFalse(self.maintenance.exists())

    def test_global_job_and_plan_probe_locks_block_without_container_changes(self):
        with job._locked_directory():
            with self.assertRaises(ReleaseContractError):
                self.freeze()
        with storage.preparation_lock():
            with self.assertRaises(ReleaseContractError):
                self.freeze()
        self.assertFalse(self.marker.exists())
        self.assertEqual(self.mutations(), [])

    def test_cli_cannot_freeze_clear_or_start_services_and_does_not_echo_bad_content(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(guard.main(["status"]), 0)
        self.assertFalse(json.loads(output.getvalue())["maintenance"])
        self.marker.write_bytes(b"DO_NOT_ECHO")
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(guard.main(["status"]), 1)
        self.assertNotIn("DO_NOT_ECHO", output.getvalue())
        for command in ("freeze", "clear", "restore", "start"):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                guard.main([command])


class InstalledGateTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.script = self.root / "maintenance_guard.py"
        self.script.write_text("# fixture")
        self.script.chmod(0o644)
        self.stack.enter_context(patch.object(guard, "GUARD_SCRIPT", self.script))
        self.stack.enter_context(patch.object(guard, "__file__", str(self.script)))
        self.stack.enter_context(patch.object(guard, "DROPIN_ROOT", self.root))
        self.stack.enter_context(patch.object(storage, "OWNER_UID", os.getuid()))
        self.command = "/usr/bin/python3 -B " + str(self.script) + " check-startup"
        self.stack.enter_context(patch.object(guard, "GUARD_COMMAND", self.command))
        self.values = {}
        self.paths = {}
        for unit, content in guard.DROPINS.items():
            path = self.root / (unit + ".d") / "80-sanq-maintenance.conf"
            path.parent.mkdir()
            path.write_text(content)
            path.chmod(0o644)
            self.paths[unit] = path
            self.values[unit] = {
                "LoadState": "loaded", "NeedDaemonReload": "no", "DropInPaths": str(path),
                "Triggers": "docker.service",
                "ExecStartPre": "{ argv[]=" + self.command + " ; ignore_errors=no ; pid=0 ; }"}
        self.engine = {"LiveRestoreEnabled": False, "Swarm": {"LocalNodeState": "inactive"}}

    def run(self, args, **kwargs):
        if args[0] == "systemctl":
            keys = args[-1].partition("=")[2].split(",")
            return "\n".join(f"{key}={self.values[args[2]][key]}" for key in keys)
        return json.dumps(self.engine)

    def test_exact_installed_gate_and_inactive_swarm_are_accepted(self):
        guard._installed_gate(self.run)

    def test_reload_ignored_error_extra_override_and_socket_bypass_are_rejected(self):
        cases = [("docker.service", "NeedDaemonReload", "yes"),
                 ("docker.service", "DropInPaths", "other.conf"),
                 ("docker.service", "ExecStartPre", "{ argv[]=" + self.command + " ; ignore_errors=yes ; }"),
                 ("docker.socket", "Triggers", "other.service")]
        for unit, key, value in cases:
            original = self.values[unit][key]
            self.values[unit][key] = value
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                guard._installed_gate(self.run)
            self.values[unit][key] = original

    def test_changed_or_writable_dropin_is_rejected(self):
        path = self.paths["docker.service"]
        original = path.read_bytes()
        path.write_bytes(original + b"# changed\n")
        with self.assertRaises(ReleaseContractError):
            guard._installed_gate(self.run)
        path.write_bytes(original)
        path.chmod(0o666)
        with self.assertRaises(ReleaseContractError):
            guard._installed_gate(self.run)

    def test_live_restore_or_swarm_is_rejected_without_reconfiguration(self):
        for engine in ({"LiveRestoreEnabled": True, "Swarm": {"LocalNodeState": "inactive"}},
                       {"LiveRestoreEnabled": False, "Swarm": {"LocalNodeState": "active"}}):
            self.engine = engine
            with self.subTest(engine=engine), self.assertRaises(ReleaseContractError):
                guard._installed_gate(self.run)

    def test_repository_dropin_templates_match_the_fixed_contract(self):
        root = Path(__file__).resolve().parents[1] / "systemd"
        for unit, expected in guard.DROPINS.items():
            source = root / (unit + ".d") / "80-sanq-maintenance.conf"
            self.assertEqual(source.read_text(), expected)


if __name__ == "__main__":
    unittest.main()
