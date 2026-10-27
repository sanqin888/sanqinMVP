"""External backup originals: disposable filesystem and modeled account/root only."""
import contextlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationExternalBackupTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.account = SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid())
        self.stack.enter_context(patch.object(installer, "PRIVATE_OWNER_UID", os.getuid()))
        self.stack.enter_context(patch.object(installer, "PRIVATE_GROUP_GID", os.getgid()))
        self.stack.enter_context(patch.object(installer.pwd, "getpwnam", return_value=self.account))
        self.stack.enter_context(patch.object(installer, "_host_storage_root",
            side_effect=lambda: os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)))
        self.runtime = {}
        for parts, name, source, owner, mode in installer.EXTERNAL_BACKUP_FILES:
            parent = self.root.joinpath(*parts)
            parent.mkdir(parents=True, exist_ok=True)
            raw = ("model sealed bytes: " + source + "\n").encode()
            (parent / name).write_bytes(raw)
            (parent / name).chmod(mode)
            self.runtime[source] = (raw, ())
        self.file = self.root / "home/ubuntu/backup-db.sh"

    def observe(self):
        return installer._external_backup_snapshot(self.runtime)

    def test_source_bound_files_return_hashes_without_execution_restore_or_body_proof(self):
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("spawn")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")):
            result = self.observe()
        self.assertEqual(len(result["files"]), 3)
        self.assertFalse(result["backupExecutionVerified"])
        self.assertFalse(result["restoreProven"])
        self.assertNotIn("model sealed bytes", str(result))

    def test_each_file_mode_and_source_bytes_are_enforced_without_repair(self):
        for parts, name, source, owner, mode in installer.EXTERNAL_BACKUP_FILES:
            path = self.root.joinpath(*parts, name)
            path.chmod(0o666)
            with self.assertRaises(ReleaseContractError):
                self.observe()
            self.assertEqual(path.stat().st_mode & 0o7777, 0o666)
            path.chmod(0o600)
            path.write_bytes(b"changed")
            path.chmod(mode)
            with self.assertRaises(ReleaseContractError):
                self.observe()
            path.chmod(0o600)
            path.write_bytes(self.runtime[source][0])
            path.chmod(mode)

    def test_missing_symlink_hardlink_or_fifo_file_is_never_accepted(self):
        saved = self.file.with_name("saved")
        self.file.rename(saved)
        with self.assertRaises(OSError):
            self.observe()
        self.file.symlink_to(saved)
        with self.assertRaises(OSError):
            self.observe()
        self.file.unlink()
        os.link(saved, self.file)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.file.unlink()
        os.mkfifo(self.file)
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_parent_write_permissions_and_directory_links_block(self):
        parent = self.file.parent
        parent.chmod(0o777)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        parent.chmod(0o755)
        moved = parent.with_name("moved")
        parent.rename(moved)
        parent.symlink_to(moved, target_is_directory=True)
        with self.assertRaises(OSError):
            self.observe()

    def test_account_identity_difference_blocks_before_reading_user_script(self):
        with patch.object(installer.pwd, "getpwnam",
                          return_value=SimpleNamespace(pw_uid=os.getuid() + 1, pw_gid=os.getgid())), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_read_race_with_same_bytes_replacement_is_detected(self):
        original = installer.os.read
        replaced = []
        def racing(fd, count):
            value = original(fd, count)
            if not replaced:
                replaced.append(True)
                temporary = self.file.with_name("replacement")
                temporary.write_bytes(self.runtime["ops/backup/backup-db.sh"][0])
                temporary.chmod(0o750)
                os.replace(temporary, self.file)
            return value
        with patch.object(installer.os, "read", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_empty_and_size_budget_are_enforced(self):
        self.file.write_bytes(b"")
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.file.write_bytes(b"x" * 16)
        with patch.object(installer, "MAX_FILE", 8), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_external_observation_requires_previous_stages_and_has_no_cli(self):
        with self.assertRaises(ReleaseContractError):
            installer._observe_installed_runtime("a" * 64, include_external_backup=True)
        with patch("sys.stderr"), self.assertRaises(SystemExit):
            installer.main(["observe-external-backup"])


if __name__ == "__main__":
    unittest.main()
