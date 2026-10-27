"""Local backup and fixed data-directory observations; disposable filesystem only."""
import gzip
import os
import stat
import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_systemd as systemd
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationFilesystemTests(unittest.TestCase):
    def setUp(self):
        self.base = systemd.InstallationSystemdTests(
            "test_locked_full_observation_captures_loaded_units_but_does_not_grant_installation")
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials, self.case = self.base.materials, self.base.case
        self.root = self.materials.anchor
        self.account = self.base.base.config.account
        for parts, policy in installer.HOST_DIRECTORIES:
            path = self.root.joinpath(*parts)
            path.mkdir(mode=0o700 if policy == "backup" else 0o755)
            if policy in ("ubuntu", "backup") and self.materials.uid == 0:
                os.chown(path, self.account.pw_uid, self.account.pw_gid)
        self.backups = self.root / "srv/sanq/backups"
        self.uploads = self.root / "srv/sanq/uploads"
        self.sounds = self.root / "home/ubuntu/sanq-assets/sounds"
        self.real_root = installer._host_storage_root
        self.materials.stack.enter_context(patch.object(installer, "_host_storage_root",
            side_effect=lambda: os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)))
        self.latest = self.save_backup("sanqin_db_20261027_120000.sql.gz", b"private SQL payload never print\n", age=3600)

    def save_backup(self, name, raw, *, age=7200):
        path = self.backups / name
        path.write_bytes(gzip.compress(raw, mtime=0))
        path.chmod(0o600)
        if self.materials.uid == 0:
            os.chown(path, self.account.pw_uid, self.account.pw_gid)
        timestamp = time.time() - age
        os.utime(path, (timestamp, timestamp))
        return path

    def snapshot(self):
        return installer._host_filesystem_snapshot(deadline=installer.time.monotonic() + 60)

    def observe(self):
        with patch.object(installer, "_docker_command",
                          side_effect=lambda args, **_: self.base.base.observe_command(args)), \
             patch.object(installer, "_systemd_command",
                          side_effect=lambda args, **_: self.base.observe_command(args)):
            return installer._observe_installed_filesystem(self.materials.identity, fetch=self.case.fetch)

    def test_whole_observation_checks_original_files_without_writes_or_restore_authority(self):
        before = self.base.base.config.base.image()
        with patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")):
            result = self.observe()
        self.assertEqual(before, self.base.base.config.base.image())
        self.assertTrue(result["hostPersistentDirectoriesObserved"])
        self.assertTrue(result["backupIntegrityObserved"])
        self.assertEqual(set(result["filesystem"]["hostDirectories"]),
                         {"/" + "/".join(parts) for parts, _ in installer.HOST_DIRECTORIES})
        self.assertEqual(result["filesystem"]["backup"]["sha256"], installer._hash(self.latest.read_bytes()))
        for flag in ("backupRestoreProven", "hostPreflightComplete", "installedBaselineObserved",
                     "readyToInstall", "canExecute", "authorizedToMutateProduction", "c4StorageObserved"):
            self.assertFalse(result[flag])
        self.assertNotIn("private SQL", str(result))
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_newest_backup_is_used_and_bad_newest_never_falls_back_to_older_good_file(self):
        older = self.save_backup("sanqin_db_20261027_110000.sql.gz", b"older valid SQL\n", age=7200)
        self.assertEqual(self.snapshot()["backup"]["fileName"], self.latest.name)
        self.latest.write_bytes(b"not gzip")
        with self.assertRaises((ReleaseContractError, OSError, EOFError)):
            self.snapshot()
        self.assertTrue(older.exists())
        self.assertEqual(self.latest.read_bytes(), b"not gzip")

    def test_stale_future_and_missing_local_backups_block_without_repair(self):
        now = time.time()
        for timestamp in (now - 27 * 3600, now + 3600):
            os.utime(self.latest, (timestamp, timestamp))
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.latest.unlink()
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertFalse(self.latest.exists())

    def test_truncated_bad_crc_empty_sql_and_trailing_corruption_are_rejected(self):
        original = self.latest.read_bytes()
        invalid = (original[:-5], original[:-8] + b"\0" * 8, gzip.compress(b"", mtime=0),
                   original + b"trailing corruption")
        for raw in invalid:
            self.latest.write_bytes(raw)
            with self.assertRaises((ReleaseContractError, OSError, EOFError)):
                self.snapshot()
            self.assertEqual(self.latest.read_bytes(), raw)

    def test_concatenated_gzip_members_are_fully_checked_and_hashed(self):
        raw = gzip.compress(b"first\n", mtime=0) + gzip.compress(b"second\n", mtime=0)
        self.latest.write_bytes(raw)
        result = self.snapshot()["backup"]
        self.assertEqual(result["expandedBytes"], len(b"first\nsecond\n"))
        self.assertEqual(result["sha256"], installer._hash(raw))
        self.assertFalse(result["restoreProven"])

    def test_compressed_expanded_and_directory_entry_budgets_block(self):
        with patch.object(installer, "MAX_LOCAL_BACKUP", 8), self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.latest.write_bytes(gzip.compress(b"x" * 10000, mtime=0))
        with patch.object(installer, "MAX_LOCAL_BACKUP", 64), self.assertRaises(ReleaseContractError):
            self.snapshot()
        (self.backups / "unrelated").write_bytes(b"still counts toward inventory budget")
        with patch.object(installer, "MAX_BACKUP_ENTRIES", 1), self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_matching_directory_fifo_symlink_and_hardlinked_backups_are_not_read(self):
        saved = self.latest.with_name("saved")
        self.latest.rename(saved)
        self.latest.mkdir()
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.latest.rmdir()
        os.mkfifo(self.latest, 0o600)
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.latest.unlink()
        self.latest.symlink_to(saved)
        with self.assertRaises(OSError):
            self.snapshot()
        self.latest.unlink()
        os.link(saved, self.latest)
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertEqual(self.latest.stat().st_nlink, 2)

    def test_backup_file_and_directory_permissions_must_remain_private(self):
        for mode in (0o644, 0o440, 0o4600):
            self.latest.chmod(mode)
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
            self.assertEqual(stat.S_IMODE(self.latest.stat().st_mode), mode)
        self.latest.chmod(0o400)
        self.assertTrue(self.snapshot()["backup"]["gzipIntegrityObserved"])
        self.backups.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertEqual(stat.S_IMODE(self.backups.stat().st_mode), 0o755)
        self.backups.chmod(0o700)
        root = os.open(self.backups, os.O_RDONLY | os.O_DIRECTORY)
        try:
            for account in (SimpleNamespace(pw_uid=self.account.pw_uid + 1, pw_gid=self.account.pw_gid),
                            SimpleNamespace(pw_uid=self.account.pw_uid, pw_gid=self.account.pw_gid + 1)):
                with self.assertRaises(ReleaseContractError):
                    installer._local_backup_snapshot(root, account, deadline=installer.time.monotonic() + 5)
        finally:
            os.close(root)

    def test_root_ubuntu_and_data_directory_permissions_are_checked_without_chown(self):
        for path in (self.root / "srv", self.root / "srv/sanq", self.root / "home/ubuntu",
                     self.uploads, self.sounds):
            path.chmod(0o777)
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o777)
            path.chmod(0o755)
        wrong = SimpleNamespace(pw_uid=self.account.pw_uid + 1, pw_gid=self.account.pw_gid)
        with patch.object(installer.pwd, "getpwnam", return_value=wrong), self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_directory_symlinks_and_missing_directories_are_refused_without_creation(self):
        for path in (self.root / "srv/sanq", self.uploads, self.sounds):
            saved = path.with_name(path.name + "-saved")
            path.rename(saved)
            with self.assertRaises(FileNotFoundError):
                self.snapshot()
            self.assertFalse(path.exists())
            path.symlink_to(saved, target_is_directory=True)
            with self.assertRaises(OSError):
                self.snapshot()
            path.unlink()
            saved.rename(path)

    def test_low_free_space_blocks_installation_precheck_but_does_not_change_files(self):
        before = self.base.base.config.base.image()
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=1, f_frsize=1)), \
             self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertEqual(before, self.base.base.config.base.image())

    def test_free_space_and_ordinary_upload_content_changes_do_not_make_the_baseline_volatile(self):
        before = self.snapshot()
        (self.uploads / "business-file").write_bytes(b"new business upload")
        (self.sounds / "sound-file").write_bytes(b"sound content is not inventoried")
        with patch.object(installer.os, "fstatvfs",
                          return_value=SimpleNamespace(f_bavail=7 * 1024**3, f_frsize=1)):
            self.assertEqual(self.snapshot(), before)

    def test_empty_or_exhausted_monotonic_budget_cannot_start_backup_read(self):
        root = os.open(self.backups, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with self.assertRaises(ReleaseContractError):
                installer._local_backup_snapshot(root, self.account, deadline=installer.time.monotonic() - 1)
            with patch.object(installer.time, "monotonic", side_effect=[0, 0, 0, 101]), \
                 self.assertRaises(ReleaseContractError):
                installer._local_backup_snapshot(root, self.account, deadline=100)
        finally:
            os.close(root)

    def test_backup_replacement_during_gzip_read_is_preserved_and_blocks(self):
        gzip_file = installer.gzip.GzipFile
        done = []
        def racing(*args, **kwargs):
            stream = gzip_file(*args, **kwargs)
            if not done:
                done.append(True)
                replacement = self.backups / "replacement"
                replacement.write_bytes(self.latest.read_bytes())
                replacement.chmod(0o600)
                if self.materials.uid == 0:
                    os.chown(replacement, self.account.pw_uid, self.account.pw_gid)
                os.replace(replacement, self.latest)
            return stream
        with patch.object(installer.gzip, "GzipFile", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertTrue(self.latest.exists())

    def test_new_backup_or_matching_inventory_change_during_read_blocks(self):
        gzip_file = installer.gzip.GzipFile
        done = []
        def racing(*args, **kwargs):
            stream = gzip_file(*args, **kwargs)
            if not done:
                done.append(True)
                # Avoid using gzip.compress while the GzipFile constructor is mocked.
                extra = self.backups / "sanqin_db_20261027_130000.sql.gz"
                extra.write_bytes(self.latest.read_bytes())
                extra.chmod(0o600)
            return stream
        with patch.object(installer.gzip, "GzipFile", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.assertTrue((self.backups / "sanqin_db_20261027_130000.sql.gz").exists())

    def test_whole_passes_reject_equal_byte_backup_or_empty_directory_replacements(self):
        snapshot = installer._host_filesystem_snapshot
        done = []
        def racing(**kwargs):
            value = snapshot(**kwargs)
            if not done:
                done.append(True)
                saved = self.uploads.with_name("uploads-original")
                self.uploads.rename(saved)
                self.uploads.mkdir(mode=0o755)
            return value
        with patch.object(installer, "_host_filesystem_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_original_locks_cover_gzip_read_and_late_maintenance_is_not_cleared(self):
        snapshot = installer._host_filesystem_snapshot
        marker = self.materials.state / "maintenance/active.json"
        def racing(**kwargs):
            for acquire in (systemd.docker.configuration.baseline.private.jobs._locked_directory,
                            systemd.docker.configuration.baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            value = snapshot(**kwargs)
            if not marker.exists():
                marker.write_bytes(b"preserve late incident")
            return value
        with patch.object(installer, "_host_filesystem_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"preserve late incident")

    def test_older_observation_apis_do_not_read_business_directories_or_backups(self):
        with patch.object(installer, "_host_filesystem_snapshot", side_effect=AssertionError("filesystem read")):
            self.base.observe()
            self.base.base.observe()

    def test_filesystem_switch_requires_systemd_and_boolean_input_no_new_cli(self):
        for config, docker_mode, systemd_mode, filesystem in ((True, True, False, True), (True, True, True, "yes")):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch,
                    include_configuration=config, include_docker=docker_mode,
                    include_systemd=systemd_mode, include_filesystem=filesystem)
        for command in ("observe-filesystem", "install", "apply"):
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                installer.main([command])

    def test_unknown_directory_components_or_root_metadata_are_refused(self):
        root = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with self.assertRaises(ReleaseContractError):
                with installer._host_directory(root, "../../etc", "root", self.account):
                    pass
        finally:
            os.close(root)
        info = SimpleNamespace(st_mode=stat.S_IFDIR | 0o777, st_uid=self.materials.uid,
                               st_gid=self.materials.gid, st_nlink=2)
        with patch.object(installer.os, "open", return_value=123), \
             patch.object(installer.os, "fstat", return_value=info), \
             patch.object(installer.os, "close") as close, self.assertRaises(ReleaseContractError):
            self.real_root()
        close.assert_called_once_with(123)


if __name__ == "__main__":
    unittest.main()
