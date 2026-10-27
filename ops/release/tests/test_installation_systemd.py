"""Initial-install systemd preflight: disposable files and modeled manager output."""
import copy
import os
import stat
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_docker as docker
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationSystemdTests(unittest.TestCase):
    def setUp(self):
        self.base = docker.InstallationDockerTests(
            "test_locked_end_to_end_observation_returns_only_stable_facts_and_no_permission")
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials, self.case = self.base.materials, self.base.case
        self.directory = self.materials.anchor / "systemd-model"
        self.directory.mkdir(mode=0o755)
        self.backup = self.case.old_files["ops/backup/sanq-backup.service"]
        for name, raw in (("sanq-backup.service", self.backup), ("sanq-backup.timer", b"[Timer]\nOnCalendar=daily\n")):
            path = self.directory / name
            path.write_bytes(raw)
            path.chmod(0o644)
        self.real_root = installer._systemd_root
        self.materials.stack.enter_context(patch.object(installer, "_systemd_root",
            side_effect=lambda: os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)))
        self.rows, self.calls = {}, []
        for unit in installer.SYSTEMD_UNITS:
            row = {key: "" for key in installer._systemd_keys(unit)}
            row.update(LoadState="loaded", UnitFileState="enabled", NeedDaemonReload="no",
                FragmentPath=("/etc/systemd/system/" if unit.startswith("sanq-") else "/lib/systemd/system/") + unit)
            if unit == "docker.service":
                row.update(ActiveState="active", SubState="running", ExecStart="{ path=/usr/bin/dockerd ; argv[]=/usr/bin/dockerd -H fd:// ; ignore_errors=no ; }")
            elif unit == "docker.socket":
                row.update(ActiveState="active", SubState="listening", Triggers="docker.service")
            elif unit.endswith(".timer"):
                row.update(ActiveState="active", SubState="waiting", Triggers="sanq-backup.service")
            else:
                row.update(ActiveState="inactive", SubState="dead", User="ubuntu", Group="", UMask="0077", Type="oneshot",
                    ExecStart="{ path=/home/ubuntu/backup-db.sh ; argv[]=/home/ubuntu/backup-db.sh ; ignore_errors=no ; }")
            self.rows[unit] = row

    def observe_command(self, args):
        self.assertTrue(installer._systemd_allowed(args))
        self.calls.append(args)
        return "\n".join(key + "=" + value for key, value in self.rows[args[3]].items()) + "\n"

    def snapshot(self):
        return installer._systemd_snapshot(self.backup, self.observe_command)

    def observe(self):
        with patch.object(installer, "_docker_command", side_effect=lambda args, **_: self.base.observe_command(args)), \
             patch.object(installer, "_systemd_command", side_effect=lambda args, **_: self.observe_command(args)):
            return installer._observe_installed_systemd(self.materials.identity, fetch=self.case.fetch)

    def test_locked_full_observation_captures_loaded_units_but_does_not_grant_installation(self):
        before = self.base.config.base.image()
        with patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")):
            result = self.observe()
        self.assertEqual(before, self.base.config.base.image())
        self.assertTrue(result["systemdObserved"])
        self.assertEqual(set(result["systemd"]["units"]), set(installer.SYSTEMD_UNITS))
        self.assertTrue(result["systemd"]["reservedMaintenanceDropinsAbsent"])
        for key in ("maintenanceGatesLoaded", "backupIntegrityObserved", "hostPreflightComplete",
                    "installedBaselineObserved", "canExecute", "readyToInstall", "authorizedToMutateProduction"):
            self.assertFalse(result[key])
        self.assertFalse(result["systemd"]["backupTimerSourceAuthenticated"])
        self.assertFalse(result["systemd"]["vendorUnitBytesAuthenticated"])
        self.assertTrue(all(installer._systemd_allowed(args) for args in self.calls))

    def test_vendor_fragment_aliases_and_idle_timer_are_observed(self):
        for unit in ("docker.service", "docker.socket"):
            self.rows[unit]["FragmentPath"] = "/usr/lib/systemd/system/" + unit
        self.rows["sanq-backup.timer"].update(ActiveState="inactive", SubState="dead", UnitFileState="disabled")
        result = self.snapshot()
        self.assertEqual(result["units"]["sanq-backup.timer"]["ActiveState"], "inactive")

    def test_loaded_state_reload_masking_and_unknown_dropins_block(self):
        row = self.rows["docker.service"]
        for change in ({"LoadState": "not-found"}, {"NeedDaemonReload": "yes"}, {"UnitFileState": "masked"},
                       {"DropInPaths": "/etc/systemd/system/service.d/unknown.conf"}):
            with patch.dict(row, change), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_full_unit_override_or_unexpected_fragment_path_blocks(self):
        for unit in installer.SYSTEMD_UNITS:
            for path in ("/run/systemd/system/" + unit, "/other/" + unit):
                with patch.dict(self.rows[unit], {"FragmentPath": path}), self.assertRaises(ReleaseContractError):
                    self.snapshot()
        with patch.dict(self.rows["docker.service"], {"FragmentPath": "/etc/systemd/system/docker.service"}), \
             self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_docker_service_and_socket_must_be_steadily_active_with_exact_target(self):
        for unit, changes in (("docker.service", {"ActiveState": "activating"}),
                              ("docker.service", {"SubState": "auto-restart"}),
                              ("docker.service", {"ExecStart": ""}),
                              ("docker.socket", {"SubState": "dead"}),
                              ("docker.socket", {"Triggers": "other.service"})):
            with patch.dict(self.rows[unit], changes), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_busy_backup_and_timer_races_or_wrong_target_are_refused(self):
        for unit, changes in (("sanq-backup.service", {"ActiveState": "active", "SubState": "running"}),
                              ("sanq-backup.service", {"ActiveState": "activating"}),
                              ("sanq-backup.timer", {"ActiveState": "failed"}),
                              ("sanq-backup.timer", {"Triggers": "other.service"})):
            with patch.dict(self.rows[unit], changes), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_backup_identity_mask_type_command_and_hooks_are_checked(self):
        row = self.rows["sanq-backup.service"]
        for change in ({"User": "root"}, {"Group": "root"}, {"UMask": "0022"}, {"Type": "simple"},
                       {"ExecStart": "{ path=/bin/sh ; argv[]=/bin/sh -c unsafe ; ignore_errors=no ; }"},
                       {"ExecStart": row["ExecStart"] + row["ExecStart"]},
                       {"ExecStartPre": "{ unreviewed }"}, {"ExecStartPost": "{ unreviewed }"},
                       {"ExecStopPost": "{ unreviewed }"}):
            with patch.dict(row, change), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_loaded_properties_must_be_complete_unique_and_bounded(self):
        args = installer._systemd_args("docker.service")
        valid = self.observe_command(args)
        for raw in (valid + "LoadState=loaded\n", valid.replace("LoadState=loaded\n", ""),
                    valid + "Unknown=value\n", "broken", "x" * 65537):
            with self.assertRaises(ReleaseContractError):
                installer._systemd_snapshot(self.backup, lambda _: raw)

    def test_external_backup_service_must_match_the_retained_old_sealed_bytes(self):
        path = self.directory / "sanq-backup.service"
        path.write_bytes(b"locally changed backup unit")
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertEqual(path.read_bytes(), b"locally changed backup unit")

    def test_missing_linked_hardlinked_or_unsafe_backup_unit_files_block_without_repair(self):
        for name in ("sanq-backup.service", "sanq-backup.timer"):
            path = self.directory / name
            saved = path.with_name(name + ".saved")
            path.rename(saved)
            with self.assertRaises(FileNotFoundError):
                self.snapshot()
            path.symlink_to(saved)
            with self.assertRaises(OSError):
                self.snapshot()
            path.unlink()
            os.link(saved, path)
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
            saved.unlink()
            path.chmod(0o666)
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o666)
            path.chmod(0o644)

    def test_existing_reserved_or_unknown_dropins_and_partial_residue_are_never_overwritten(self):
        for name in ("docker.service.d", "docker.socket.d", "sanq-backup.service.d", "sanq-backup.timer.d",
                     "service.d", "socket.d", "timer.d", "sanq-.service.d", "sanq-.timer.d"):
            directory = self.directory / name
            directory.mkdir(mode=0o755)
            path = directory / "80-sanq-maintenance.conf"
            path.write_bytes(b"preserve conflicting file")
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
            self.assertEqual(path.read_bytes(), b"preserve conflicting file")
            path.unlink()
            self.assertIsNotNone(self.snapshot()["overrideDirectories"][name])
            directory.rmdir()

    def test_empty_dropin_directory_symlinks_or_bad_permissions_are_refused(self):
        outside = self.directory / "outside"
        outside.mkdir(mode=0o755)
        path = self.directory / "docker.service.d"
        path.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.snapshot()
        path.unlink()
        path.mkdir(mode=0o777)
        path.chmod(0o777)
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o777)

    def test_local_docker_fragment_even_a_dangling_symlink_is_a_conflict(self):
        for name in ("docker.service", "docker.socket"):
            path = self.directory / name
            path.symlink_to(self.directory / "missing")
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
            self.assertTrue(path.is_symlink())
            path.unlink()

    def test_file_replacement_around_loaded_unit_reads_blocks_even_for_equal_bytes(self):
        run = self.observe_command
        done = []
        def racing(args):
            raw = run(args)
            if not done:
                done.append(True)
                path = self.directory / "sanq-backup.timer"
                replacement = path.with_name("replacement")
                replacement.write_bytes(path.read_bytes())
                replacement.chmod(0o644)
                os.replace(replacement, path)
            return raw
        with self.assertRaises(ReleaseContractError):
            installer._systemd_snapshot(self.backup, racing)

    def test_loaded_properties_change_between_whole_passes_blocks(self):
        snapshot = installer._systemd_snapshot
        done = []
        def racing(*args):
            value = snapshot(*args)
            if not done:
                done.append(True)
                self.rows["sanq-backup.timer"].update(ActiveState="inactive", SubState="dead")
            return value
        with patch.object(installer, "_systemd_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_original_locks_cover_manager_queries_and_late_maintenance_is_preserved(self):
        run = self.observe_command
        marker = self.materials.state / "maintenance/active.json"
        def racing(args):
            for acquire in (docker.configuration.baseline.private.jobs._locked_directory,
                            docker.configuration.baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            value = run(args)
            if not marker.exists():
                marker.write_bytes(b"incident evidence")
            return value
        with patch.object(self, "observe_command", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"incident evidence")

    def test_default_docker_and_file_observers_never_query_systemd(self):
        with patch.object(installer, "_systemd_command", side_effect=AssertionError("systemd called")):
            self.base.observe()
            self.base.config.observe()

    def test_switches_require_docker_and_accept_only_booleans(self):
        for configuration, docker_mode, systemd in ((True, False, True), (True, True, "yes")):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch,
                    include_configuration=configuration, include_docker=docker_mode, include_systemd=systemd)

    def test_whitelist_rejects_mutation_remote_targets_arbitrary_properties_and_no_new_cli(self):
        for args in ([*installer.SYSTEMCTL, "daemon-reload"], [*installer.SYSTEMCTL, "stop", "docker.service"],
                     ["/usr/bin/systemctl", "-H", "remote", "show", "docker.service"],
                     [*installer.SYSTEMCTL, "show", "unknown.service", "--no-pager"],
                     [*installer.SYSTEMCTL, "show", "docker.service", "--property=Environment"]):
            self.assertFalse(installer._systemd_allowed(args))
            with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                installer._systemd_command(args, deadline=installer.time.monotonic() + 5)
            spawn.assert_not_called()
        for command in ("observe-systemd", "install", "apply"):
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                installer.main([command])


    def test_fixed_systemd_anchor_walk_never_follows_ancestor_links_or_accepts_untrusted_metadata(self):
        opened, closed = [], []
        info = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=self.materials.uid,
                               st_gid=self.materials.gid, st_nlink=2)
        def open_directory(name, flags, **kwargs):
            opened.append((name, flags, kwargs))
            return 100 + len(opened)
        with patch.object(installer.os, "open", side_effect=open_directory), \
             patch.object(installer.os, "fstat", return_value=info), \
             patch.object(installer.os, "close", side_effect=closed.append):
            self.assertEqual(self.real_root(), 104)
        self.assertEqual([row[0] for row in opened], ["/", "etc", "systemd", "system"])
        self.assertTrue(all(row[1] & os.O_NOFOLLOW and row[1] & os.O_DIRECTORY for row in opened))
        self.assertEqual(closed, [101, 102, 103])
        info.st_mode = stat.S_IFDIR | 0o777
        with patch.object(installer.os, "open", return_value=105), \
             patch.object(installer.os, "fstat", return_value=info), patch.object(installer.os, "close") as close, \
             self.assertRaises(ReleaseContractError):
            self.real_root()
        close.assert_called_once_with(105)

    def test_systemd_client_reuses_bounded_reader_and_strips_inherited_bus_redirects(self):
        client = docker.DockerObservationClientTests(
            "test_client_uses_local_endpoint_clean_environment_and_real_bounded_pipes")
        client.setUp()
        self.addCleanup(client.doCleanups)
        process = client.process(output=b"LoadState=loaded\n")
        with patch.object(installer.subprocess, "Popen", return_value=process) as spawn, \
             patch.dict(installer.os.environ, {"DBUS_SYSTEM_BUS_ADDRESS": "tcp:host=remote",
                                               "SYSTEMD_HOST": "remote"}):
            raw = installer._systemd_command(installer._systemd_args("docker.service"),
                                             deadline=installer.time.monotonic() + 5)
        self.assertEqual(raw, "LoadState=loaded\n")
        self.assertNotIn("DBUS_SYSTEM_BUS_ADDRESS", spawn.call_args.kwargs["env"])
        self.assertNotIn("SYSTEMD_HOST", spawn.call_args.kwargs["env"])
        self.assertEqual(spawn.call_args.args[0][:2], ["/usr/bin/systemctl", "--system"])


if __name__ == "__main__":
    unittest.main()
