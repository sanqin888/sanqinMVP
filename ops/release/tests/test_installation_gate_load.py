"""Owned intent -> temporary gates -> bounded reload; no production operations."""
import copy
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_combined_preflight as combined
import test_private_install_materials as private
import test_installation_docker as docker
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationGateLoadTests(unittest.TestCase):
    def setUp(self):
        self.combined = combined.InstallationCombinedPreflightTests()
        self.combined.setUp()
        self.addCleanup(self.combined.doCleanups)
        self.materials = self.combined.materials
        self.manager = self.combined.base.base.manager
        self.marker = self.materials.state / "maintenance/active.json"
        self.namespace = self.materials.state / "installation-runs"
        self.reloads = []

    def assert_locks_held(self):
        for acquire in (private.jobs._locked_directory, private.plans.preparation_lock):
            with self.assertRaises(ReleaseContractError):
                with acquire():
                    pass

    def reload_manager(self, *, deadline):
        self.assert_locks_held()
        self.assertTrue(self.marker.exists())
        self.assertEqual(set(installer._temporary_gate_files()), set(installer.INSTALL_DENY_DROPINS))
        self.reloads.append(deadline)
        for unit in installer.INSTALL_DENY_DROPINS:
            self.manager.rows[unit]["DropInPaths"] = (
                "/etc/systemd/system/" + unit + ".d/" + installer.INSTALL_GATE_NAME)
            if unit.endswith(".service"):
                self.manager.rows[unit]["ExecStartPre"] = (
                    "{ path=/usr/bin/false ; argv[]=/usr/bin/false ; ignore_errors=no ; }")

    def observe(self):
        with patch.object(installer, "_observe_installed_external_backup",
                          side_effect=installer._load_installation_deny_gates), \
             patch.object(installer, "_installation_daemon_reload", side_effect=self.reload_manager):
            return self.combined.observe()

    def intent_path(self):
        return next(self.namespace.iterdir()) / "intent.json"

    def test_complete_owned_load_confirms_only_startup_fence_without_freezing_or_install_permission(self):
        before = copy.deepcopy(self.combined.docker.containers)
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("unmodeled spawn")):
            result = self.observe()
        self.assertEqual(result["outcome"], "TEMPORARY_DENY_GATES_LOADED")
        facts = result["installationIntent"]
        self.assertTrue(facts["startupFenceConfirmed"])
        self.assertTrue(facts["temporaryGates"]["denyGatePropertiesObserved"])
        self.assertFalse(facts["writersFrozen"])
        for key in ("canExecute", "readyToInstall", "hostPreflightComplete", "operationSuccessProven"):
            self.assertFalse(result[key])
        self.assertEqual(len(self.reloads), 1)
        self.assertEqual(self.combined.docker.containers, before)
        installer._installation_records_match(
            self.intent_path().read_bytes(), self.marker.read_bytes(), facts["installationId"])

    def test_original_locks_span_create_and_reload_and_default_intent_mode_never_loads(self):
        write = installer._write_temporary_gate_files
        def checked():
            self.assert_locks_held()
            self.assertTrue(self.marker.exists())
            return write()
        with patch.object(installer, "_write_temporary_gate_files", side_effect=checked):
            self.observe()

    def test_intent_only_mode_keeps_old_no_gate_behavior(self):
        with patch.object(installer, "_observe_installed_external_backup", side_effect=installer._record_installation_intent), \
             patch.object(installer, "_write_temporary_gate_files", side_effect=AssertionError("gate write")):
            result = self.combined.observe()
        self.assertFalse(result["installationIntent"]["startupFenceConfirmed"])
        self.assertFalse(self.reloads)

    def test_partial_gate_write_preserves_pair_and_file_without_reload_or_replay(self):
        write = installer._write_temporary_gate_files
        def fail():
            with patch.object(installer.os, "write", return_value=0):
                return write()
        with patch.object(installer, "_write_temporary_gate_files", side_effect=fail), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(self.intent_path().exists())
        self.assertTrue(self.marker.exists())
        self.assertEqual((self.manager.directory / "docker.service.d" / installer.INSTALL_GATE_NAME).read_bytes(), b"")
        self.assertFalse(self.reloads)
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_reload_unknown_keeps_gates_pair_and_loaded_manager_without_retry(self):
        reload_manager = self.reload_manager
        def unknown(**kwargs):
            reload_manager(**kwargs)
            raise OSError("modeled lost reload result")
        with patch.object(self, "reload_manager", side_effect=unknown), self.assertRaises(OSError):
            self.observe()
        saved = (self.marker.read_bytes(), self.intent_path().read_bytes(), installer._temporary_gate_files())
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(saved, (self.marker.read_bytes(), self.intent_path().read_bytes(), installer._temporary_gate_files()))
        self.assertEqual(len(self.reloads), 1)

    def test_marker_drift_after_writing_files_blocks_reload_and_preserves_evidence(self):
        write = installer._write_temporary_gate_files
        def racing():
            result = write()
            self.marker.write_bytes(b"unknown marker")
            return result
        with patch.object(installer, "_write_temporary_gate_files", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(self.marker.read_bytes(), b"unknown marker")
        self.assertFalse(self.reloads)
        self.assertEqual(len(installer._temporary_gate_files()), 3)

    def test_late_job_after_gate_files_blocks_reload(self):
        write = installer._write_temporary_gate_files
        incident = self.materials.state / "jobs/partial"
        def racing():
            value = write()
            incident.write_bytes(b"preserve job")
            return value
        with patch.object(installer, "_write_temporary_gate_files", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(incident.read_bytes(), b"preserve job")
        self.assertFalse(self.reloads)

    def test_unloaded_manager_result_never_confirms_fence(self):
        reload_manager = self.reload_manager
        def stale(**kwargs):
            reload_manager(**kwargs)
            self.manager.rows["docker.socket"]["NeedDaemonReload"] = "yes"
        with patch.object(self, "reload_manager", side_effect=stale), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(self.marker.exists())
        self.assertEqual(len(self.reloads), 1)

    def test_docker_drift_after_reload_blocks_owned_success(self):
        reload_manager = self.reload_manager
        def racing(**kwargs):
            reload_manager(**kwargs)
            self.combined.docker.containers[self.combined.docker.ids[0]]["HostConfig"]["AutoRemove"] = True
        with patch.object(self, "reload_manager", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(self.marker.exists())

    def test_unowned_unit_property_change_is_not_normalized_away(self):
        reload_manager = self.reload_manager
        def racing(**kwargs):
            reload_manager(**kwargs)
            self.manager.rows["docker.service"]["ExecStartPost"] = "{ path=/unreviewed ; }"
        with patch.object(self, "reload_manager", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(len(self.reloads), 1)

    def test_unowned_disk_override_after_reload_is_preserved_and_blocks(self):
        reload_manager = self.reload_manager
        incident = self.manager.directory / "service.d"
        def racing(**kwargs):
            reload_manager(**kwargs)
            incident.mkdir(mode=0o755)
            (incident / "unknown.conf").write_bytes(b"preserve override")
        with patch.object(self, "reload_manager", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual((incident / "unknown.conf").read_bytes(), b"preserve override")

    def test_source_change_after_reload_blocks_success_and_keeps_records(self):
        reload_manager = self.reload_manager
        review = installer.review_transition
        changed = []
        def racing(**kwargs):
            reload_manager(**kwargs)
            changed.append(True)
        def changed_review(*args, **kwargs):
            result = review(*args, **kwargs)
            return {**result, "unexpected": True} if changed else result
        with patch.object(self, "reload_manager", side_effect=racing), \
             patch.object(installer, "review_transition", side_effect=changed_review), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(self.intent_path().exists())
        self.assertTrue(self.marker.exists())

    def test_existing_empty_gate_directories_keep_original_identity(self):
        paths = [self.manager.directory / (unit + ".d") for unit in installer.INSTALL_DENY_DROPINS]
        for path in paths:
            path.mkdir(mode=0o755)
        before = [path.stat().st_ino for path in paths]
        self.observe()
        self.assertEqual(before, [path.stat().st_ino for path in paths])

    def test_backup_unit_same_bytes_replacement_after_reload_blocks(self):
        reload_manager = self.reload_manager
        path = self.manager.directory / "sanq-backup.service"
        def racing(**kwargs):
            reload_manager(**kwargs)
            replacement = path.with_name("replacement")
            replacement.write_bytes(path.read_bytes())
            replacement.chmod(0o644)
            os.replace(replacement, path)
        with patch.object(self, "reload_manager", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(self.marker.exists())

    def test_namespace_replacement_after_gate_write_blocks_reload_and_keeps_both_directories(self):
        write = installer._write_temporary_gate_files
        saved = self.namespace.with_name("installation-runs.saved")
        def racing():
            value = write()
            self.namespace.rename(saved)
            self.namespace.mkdir(mode=0o700)
            return value
        with patch.object(installer, "_write_temporary_gate_files", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(next(saved.iterdir()).joinpath("intent.json").exists())
        self.assertTrue(self.namespace.exists())
        self.assertTrue(self.marker.exists())
        self.assertFalse(self.reloads)

    def test_same_bytes_gate_replacement_after_reload_does_not_belong_to_this_write(self):
        reload_manager = self.reload_manager
        path = self.manager.directory / "docker.service.d" / installer.INSTALL_GATE_NAME
        def racing(**kwargs):
            reload_manager(**kwargs)
            replacement = path.with_name("replacement")
            replacement.write_bytes(path.read_bytes())
            replacement.chmod(0o644)
            os.replace(replacement, path)
        with patch.object(self, "reload_manager", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(self.marker.exists())

    def test_marker_change_after_reload_is_preserved_without_success(self):
        reload_manager = self.reload_manager
        def racing(**kwargs):
            reload_manager(**kwargs)
            self.marker.write_bytes(b"unknown after reload")
        with patch.object(self, "reload_manager", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(self.marker.read_bytes(), b"unknown after reload")

    def test_gate_mode_requires_complete_owned_observer_and_has_no_cli(self):
        for flags in ({"_load_deny_gates": True}, {"_load_deny_gates": "yes", "_record_intent": True}):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, **flags)
        for command in ("load-deny-gates", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


class InstallationReloadClientTests(unittest.TestCase):
    def setUp(self):
        self.client = docker.DockerObservationClientTests()
        self.client.setUp()
        self.addCleanup(self.client.doCleanups)

    def test_fixed_mutation_uses_clean_bounded_pipes_but_readonly_clients_still_deny_it(self):
        process = self.client.process(output=b"")
        with patch.object(installer.subprocess, "Popen", return_value=process) as spawn, \
             patch.dict(installer.os.environ, {"DBUS_SYSTEM_BUS_ADDRESS": "tcp:remote", "SYSTEMD_HOST": "remote"}):
            installer._installation_daemon_reload(deadline=installer.time.monotonic() + 5)
        self.assertEqual(spawn.call_args.args[0], [*installer.SYSTEMCTL, "daemon-reload"])
        self.assertTrue(spawn.call_args.kwargs["start_new_session"])
        self.assertNotIn("DBUS_SYSTEM_BUS_ADDRESS", spawn.call_args.kwargs["env"])
        self.assertNotIn("SYSTEMD_HOST", spawn.call_args.kwargs["env"])
        for read in (installer._systemd_command, installer._observation_command):
            with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                read([*installer.SYSTEMCTL, "daemon-reload"], deadline=installer.time.monotonic() + 5)
            spawn.assert_not_called()

    def test_reload_nonzero_overflow_encoding_timeout_output_and_nonroot_are_not_success(self):
        for output, error, code, budget in ((b"", b"private error", 1, 4096),
                                           (b"x" * 1024, b"", 0, 128), (b"\xff", b"", 0, 4096)):
            process = self.client.process(output, error, code)
            with patch.object(installer.subprocess, "Popen", return_value=process), \
                 patch.object(installer, "MAX_HOST_OUTPUT", budget), patch.object(installer.os, "killpg") as kill, \
                 self.assertRaises(ReleaseContractError) as caught:
                installer._installation_daemon_reload(deadline=installer.time.monotonic() + 5)
            kill.assert_called_once_with(process.pid, installer.signal.SIGKILL)
            self.assertNotIn("private error", str(caught.exception))
        process = self.client.process()
        with patch.object(installer.subprocess, "Popen", return_value=process), \
             patch.object(installer.time, "monotonic", side_effect=[0, 0, 31]), \
             patch.object(installer.os, "killpg") as kill, self.assertRaises(ReleaseContractError):
            installer._installation_daemon_reload(deadline=100)
        kill.assert_called_once_with(process.pid, installer.signal.SIGKILL)
        process = self.client.process(output=b"unexpected")
        with patch.object(installer.subprocess, "Popen", return_value=process), self.assertRaises(ReleaseContractError):
            installer._installation_daemon_reload(deadline=installer.time.monotonic() + 5)
        with patch.object(installer.os, "geteuid", return_value=1000), \
             patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
            installer._installation_daemon_reload(deadline=installer.time.monotonic() + 5)
        spawn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
