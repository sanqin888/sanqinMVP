"""Create-only inert task association IO in disposable directories; no installation."""
import contextlib
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_task_originals as originals
from release_contract import ReleaseContractError


class TaskHandoffIOTests(unittest.TestCase):
    def setUp(self):
        self.case = originals.TaskOriginalsTests(
            "test_exact_originals_and_generation_are_bound_without_execution_authority")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.path.chmod(0o700)
        uid, gid = os.geteuid(), os.getegid()
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(installer, "PRIVATE_OWNER_UID", uid))
        self.stack.enter_context(patch.object(installer, "PRIVATE_GROUP_GID", gid))
        self.stack.enter_context(patch.object(installer.os, "geteuid", return_value=0))
        self.stack.enter_context(patch.object(installer.os, "fstatvfs",
            return_value=SimpleNamespace(f_bavail=8 * 1024**3, f_frsize=1)))
        self.root = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY)
        self.stack.callback(os.close, self.root)
        self.target = self.path / installer.INSTALL_TASK_ORIGINALS_FILE

    def write(self):
        return installer._installation_task_handoff_write(self.root, self.case.context,
            self.case.intent, self.case.writers, self.case.identity)

    def read(self):
        return installer._installation_task_handoff_read(self.root, self.case.context,
            self.case.intent, self.case.writers, self.case.identity)

    def test_exact_create_readback_mode_and_both_syncs(self):
        sync = installer.os.fsync
        synced = []
        def durable(fd):
            synced.append((os.fstat(fd).st_dev, os.fstat(fd).st_ino))
            return sync(fd)
        with patch.object(installer.os, "fsync", side_effect=durable):
            result = self.write()
        raw, fingerprint = self.read()
        self.assertEqual(raw, self.case.build())
        self.assertEqual(result["recordFingerprint"], fingerprint)
        self.assertEqual(result["recordSha256"], installer._hash(raw))
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)
        self.assertIn((self.target.stat().st_dev, self.target.stat().st_ino), synced)
        self.assertIn((self.path.stat().st_dev, self.path.stat().st_ino), synced)
        self.assertIs(result["canExecute"], False)
        self.assertIs(result["installationComplete"], False)
        self.assertIs(result["restoreProven"], False)

    def test_second_write_is_refused_without_modifying_original(self):
        self.write()
        before = self.target.read_bytes(), self.target.stat().st_ino
        with self.assertRaises(FileExistsError):
            self.write()
        self.assertEqual((self.target.read_bytes(), self.target.stat().st_ino), before)

    def test_unprivileged_or_low_storage_refuses_before_creation(self):
        with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.write()
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=0, f_frsize=1)), \
             self.assertRaises(ReleaseContractError):
            self.write()
        self.assertFalse(self.target.exists())

    def test_wrong_directory_and_file_modes_are_not_repaired(self):
        self.path.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            self.write()
        self.path.chmod(0o700)
        self.write()
        self.target.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            self.read()
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o644)

    def test_existing_symlink_hardlink_and_partial_bytes_are_preserved(self):
        outside = self.path / "outside"
        outside.write_bytes(b"original")
        outside.chmod(0o600)
        self.target.symlink_to(outside)
        with self.assertRaises(FileExistsError):
            self.write()
        self.assertTrue(self.target.is_symlink())
        self.target.unlink()
        os.link(outside, self.target)
        with self.assertRaises(ReleaseContractError):
            self.read()
        self.target.unlink()
        self.target.write_bytes(b"partial")
        self.target.chmod(0o600)
        with self.assertRaises(ReleaseContractError):
            self.read()
        self.assertEqual(self.target.read_bytes(), b"partial")

    def test_short_writes_are_completed_but_zero_write_preserves_partial(self):
        write = installer.os.write
        with patch.object(installer.os, "write", side_effect=lambda fd, raw: write(fd, raw[:7])):
            self.write()
        self.assertEqual(self.read()[0], self.case.build())
        self.target.unlink()  # Disposable fixture reset, never product behavior.
        calls = 0
        def interrupted(fd, raw):
            nonlocal calls
            calls += 1
            return write(fd, raw[:7]) if calls == 1 else 0
        with patch.object(installer.os, "write", side_effect=interrupted), self.assertRaises(ReleaseContractError):
            self.write()
        self.assertEqual(self.target.read_bytes(), self.case.build()[:7])

    def test_file_or_directory_sync_failure_never_deletes_or_retries(self):
        sync = installer.os.fsync
        for fail_directory in (False, True):
            def failed(fd):
                if stat.S_ISDIR(os.fstat(fd).st_mode) == fail_directory:
                    raise OSError("modeled sync failure")
                return sync(fd)
            with patch.object(installer.os, "fsync", side_effect=failed), self.assertRaises(OSError):
                self.write()
            self.assertEqual(self.target.read_bytes(), self.case.build())
            self.target.unlink()  # Independent disposable case.

    def test_same_bytes_replacement_during_readback_is_rejected(self):
        readback = installer._installation_task_handoff_read
        def replaced(*args):
            result = readback(*args)
            other = self.path / "replacement"
            other.write_bytes(self.target.read_bytes())
            other.chmod(0o600)
            other.replace(self.target)
            return result
        with patch.object(installer, "_installation_task_handoff_read", side_effect=replaced), \
             self.assertRaises(ReleaseContractError):
            self.write()
        self.assertEqual(self.target.read_bytes(), self.case.build())


if __name__ == "__main__":
    unittest.main()
