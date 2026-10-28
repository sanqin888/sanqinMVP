"""Temporary deny file primitives and effective manager-property models."""
import contextlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationTemporaryGateTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.stack.enter_context(patch.object(installer, "PRIVATE_OWNER_UID", os.getuid()))
        self.stack.enter_context(patch.object(installer, "PRIVATE_GROUP_GID", os.getgid()))
        self.stack.enter_context(patch.object(installer.os, "geteuid", return_value=0))
        self.stack.enter_context(patch.object(installer, "_systemd_root",
            side_effect=lambda: os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)))
        self.fields = {}
        for unit in installer.INSTALL_DENY_DROPINS:
            value = dict.fromkeys(installer._systemd_keys(unit), "")
            value.update(LoadState="loaded", NeedDaemonReload="no",
                         FragmentPath="/etc/systemd/system/" + unit if unit.startswith("sanq-")
                         else "/lib/systemd/system/" + unit,
                         DropInPaths="/etc/systemd/system/" + unit + ".d/" + installer.INSTALL_GATE_NAME)
            if unit == "docker.socket":
                value["Triggers"] = "docker.service"
            else:
                value["ExecStartPre"] = "{ path=/usr/bin/false ; argv[]=/usr/bin/false ; ignore_errors=no ; }"
            self.fields[unit] = value

    def write(self):
        return installer._write_temporary_gate_files()

    def run_read(self, args):
        for unit, value in self.fields.items():
            if args == installer._systemd_args(unit):
                return "\n".join(key + "=" + val for key, val in value.items())
        raise AssertionError("unreviewed command")

    def verify(self):
        return installer._verify_temporary_gates(self.run_read)

    def test_exact_files_and_loaded_properties_still_do_not_claim_a_complete_fence(self):
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("spawn")):
            result = self.write()
            observed = self.verify()
        self.assertFalse(result["startupFenceConfirmed"])
        self.assertFalse(observed["startupFenceConfirmed"])
        self.assertFalse(observed["canExecute"])
        self.assertTrue(observed["denyGatePropertiesObserved"])
        for unit, expected in installer.INSTALL_DENY_DROPINS.items():
            path = self.root / (unit + ".d") / installer.INSTALL_GATE_NAME
            self.assertEqual(path.read_bytes(), expected)
            self.assertEqual(path.stat().st_mode & 0o7777, 0o644)

    def test_creation_works_with_private_umask_without_repairing_existing_objects(self):
        old = os.umask(0o077)
        try:
            self.write()
        finally:
            os.umask(old)
        for unit in installer.INSTALL_DENY_DROPINS:
            self.assertEqual((self.root / (unit + ".d")).stat().st_mode & 0o7777, 0o755)

    def test_existing_gate_is_never_overwritten(self):
        self.write()
        path = self.root / "docker.service.d" / installer.INSTALL_GATE_NAME
        before = (path.read_bytes(), path.stat().st_ino)
        with self.assertRaises(ReleaseContractError):
            self.write()
        self.assertEqual(before, (path.read_bytes(), path.stat().st_ino))

    def test_unknown_member_wrong_mode_or_directory_link_blocks(self):
        directory = self.root / "docker.service.d"
        directory.mkdir(mode=0o755)
        (directory / "unknown.conf").write_bytes(b"keep")
        with self.assertRaises(ReleaseContractError):
            self.write()
        self.assertEqual((directory / "unknown.conf").read_bytes(), b"keep")
        (directory / "unknown.conf").unlink()
        directory.chmod(0o700)
        with self.assertRaises(ReleaseContractError):
            self.write()
        directory.rmdir()
        directory.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(OSError):
            self.write()

    def test_sync_failure_keeps_partial_directories_without_cleanup(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("modeled sync failure")), self.assertRaises(OSError):
            self.write()
        self.assertTrue((self.root / "docker.service.d").exists())

    def test_zero_write_keeps_partial_gate_and_no_loaded_success(self):
        with patch.object(installer.os, "write", return_value=0), self.assertRaises(ReleaseContractError):
            self.write()
        path = self.root / "docker.service.d" / installer.INSTALL_GATE_NAME
        self.assertTrue(path.exists())
        self.assertEqual(path.read_bytes(), b"")
        with self.assertRaises(ReleaseContractError):
            self.write()

    def test_stale_unloaded_extra_dropin_or_wrong_fragment_blocks(self):
        self.write()
        value = self.fields["docker.service"]
        for changes in ({"NeedDaemonReload": "yes"}, {"LoadState": "not-found"},
                        {"DropInPaths": value["DropInPaths"] + " /other.conf"}, {"FragmentPath": "/tmp/docker.service"}):
            with patch.dict(value, changes), self.assertRaises(ReleaseContractError):
                self.verify()

    def test_false_command_cannot_ignore_failure_or_add_commands_and_socket_target_is_fixed(self):
        self.write()
        value = self.fields["docker.service"]
        original = value["ExecStartPre"]
        for command in (original.replace("ignore_errors=no", "ignore_errors=yes"), "",
                        original + original, original.replace("/usr/bin/false", "/usr/bin/true")):
            with patch.dict(value, {"ExecStartPre": command}), self.assertRaises(ReleaseContractError):
                self.verify()
        self.fields["docker.socket"]["Triggers"] = "other.service"
        with self.assertRaises(ReleaseContractError):
            self.verify()

    def test_file_drift_during_loaded_observation_blocks(self):
        self.write()
        read = self.run_read
        changed = []
        def racing(args):
            value = read(args)
            if not changed:
                changed.append(True)
                path = self.root / "docker.service.d" / installer.INSTALL_GATE_NAME
                path.write_bytes(b"unknown")
            return value
        with self.assertRaises(ReleaseContractError):
            installer._verify_temporary_gates(racing)

    def test_unprivileged_unknown_units_and_no_public_reload_install_cli(self):
        with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.write()
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with self.assertRaises(ReleaseContractError):
                with installer._temporary_gate_directory(fd, "other.service", create=True):
                    pass
        finally:
            os.close(fd)
        for command in ("load-deny-gates", "install"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
