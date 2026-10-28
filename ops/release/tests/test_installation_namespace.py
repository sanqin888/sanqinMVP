"""Fixed installation transaction namespace; disposable original locks and directories."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_private_install_materials as private
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationNamespaceTests(unittest.TestCase):
    def setUp(self):
        self.base = private.PrivateMaterialsTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.base.provision()
        self.root = self.base.state / "installation-runs"

    def observe(self, create=False):
        return installer._inspect_installation_runs(create=create)

    def test_absent_query_creates_nothing_and_does_not_sync(self):
        with patch.object(installer.os, "mkdir", side_effect=AssertionError("mkdir")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")):
            result = self.observe()
        self.assertFalse(result["namespacePresent"])
        self.assertFalse(self.root.exists())

    def test_create_and_existing_empty_query_keep_private_directory_and_no_install_permission(self):
        result = self.observe(create=True)
        self.assertTrue(result["namespaceCreated"])
        inode = self.root.stat().st_ino
        again = self.observe(create=True)
        self.assertFalse(again["namespaceCreated"])
        self.assertEqual(inode, self.root.stat().st_ino)
        self.assertEqual(self.root.stat().st_mode & 0o7777, 0o700)
        for key in ("canExecute", "readyToInstall", "operationSuccessProven"):
            self.assertFalse(result[key])
        self.assertTrue(result["requiresHostRecheck"])
        self.assertEqual(list(self.root.iterdir()), [])

    def test_bad_namespace_mode_and_symlink_are_not_repaired(self):
        self.root.mkdir(mode=0o755)
        with self.assertRaises(ReleaseContractError):
            self.observe(create=True)
        self.assertEqual(self.root.stat().st_mode & 0o7777, 0o755)
        self.root.rmdir()
        self.root.symlink_to(self.base.target, target_is_directory=True)
        with self.assertRaises(OSError):
            self.observe(create=True)
        self.assertTrue(self.root.is_symlink())

    def test_any_existing_transaction_or_unknown_entry_blocks_and_is_preserved(self):
        self.root.mkdir(mode=0o700)
        for name in ("a" * 64, "unknown", ".partial"):
            path = self.root / name
            path.write_bytes(b"keep evidence")
            with self.assertRaises(ReleaseContractError):
                self.observe()
            self.assertEqual(path.read_bytes(), b"keep evidence")
            path.unlink()
        (self.root / ("b" * 64)).mkdir(mode=0o700)
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_original_locks_cover_namespace_scans_and_keep_inode(self):
        self.observe(create=True)
        scan = installer._installation_runs_clear
        inodes = [(path, path.stat().st_ino) for path in
                  (self.base.state / "jobs/.release.lock", self.base.state / "plans/.prepare.lock")]
        def check(root):
            for acquire in (private.jobs._locked_directory, private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            return scan(root)
        with patch.object(installer, "_installation_runs_clear", side_effect=check):
            self.observe()
        self.assertTrue(all(path.stat().st_ino == inode for path, inode in inodes))

    def test_late_transaction_is_not_hidden_by_initial_empty_scan(self):
        self.observe(create=True)
        scan = installer._installation_runs_clear
        done = []
        def racing(root):
            value = scan(root)
            if not done:
                done.append(True)
                (self.root / "late").write_bytes(b"late evidence")
            return value
        with patch.object(installer, "_installation_runs_clear", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual((self.root / "late").read_bytes(), b"late evidence")

    def test_directory_sync_failure_preserves_new_empty_namespace(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("modeled sync failure")), self.assertRaises(OSError):
            self.observe(create=True)
        self.assertTrue(self.root.is_dir())
        self.assertEqual(list(self.root.iterdir()), [])

    def test_low_capacity_blocks_creation_and_late_maintenance_is_preserved(self):
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=1, f_frsize=1)), \
             self.assertRaises(ReleaseContractError):
            self.observe(create=True)
        self.assertFalse(self.root.exists())
        self.root.mkdir(mode=0o700)
        scan = installer._installation_runs_clear
        marker = self.base.state / "maintenance/active.json"
        def racing(root):
            value = scan(root)
            marker.write_bytes(b"late incident")
            return value
        with patch.object(installer, "_installation_runs_clear", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"late incident")

    def test_namespace_replacement_during_observation_is_detected(self):
        self.observe(create=True)
        scan = installer._installation_runs_clear
        done = []
        def racing(root):
            value = scan(root)
            if not done:
                done.append(True)
                self.root.rename(self.root.with_name("preserved-old"))
                self.root.mkdir(mode=0o700)
            return value
        with patch.object(installer, "_installation_runs_clear", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_original_four_materials_are_unchanged_and_no_new_cli_or_weak_switch(self):
        self.base.retain()
        before = {p.name: p.read_bytes() for p in self.base.target.iterdir()}
        self.observe(create=True)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.base.target.iterdir()})
        with self.assertRaises(ReleaseContractError):
            installer._inspect_installation_runs(create="yes")
        with patch("sys.stderr"), self.assertRaises(SystemExit):
            installer.main(["prepare-installation-runs"])


if __name__ == "__main__":
    unittest.main()
