"""Intent and marker byte contracts plus disposable-FD durability failure models."""
import contextlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationIntentRecordTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.root.chmod(0o700)
        self.stack.enter_context(patch.object(installer, "PRIVATE_OWNER_UID", os.getuid()))
        self.stack.enter_context(patch.object(installer, "PRIVATE_GROUP_GID", os.getgid()))
        self.stack.enter_context(patch.object(installer.os, "geteuid", return_value=0))
        self.fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.addCleanup(os.close, self.fd)
        self.identity = "a" * 64
        self.raw = installer._installation_intent_bytes(
            installation_id=self.identity, retention_id="b" * 64, target_source_sha="c" * 40,
            installed_runtime_source_sha="d" * 40, observation_sha256="e" * 64,
            created_at="2026-10-28T12:00:00Z")

    def write(self, raw=None):
        installer._installation_record_write(self.fd, "intent.json", self.raw if raw is None else raw, self.identity)

    def test_intent_and_marker_are_canonical_bound_and_inert(self):
        value = installer._installation_record_value(self.raw, self.identity)
        self.assertFalse(value["canExecute"])
        marker = installer._installation_marker_bytes(self.raw, self.identity)
        installer._installation_records_match(self.raw, marker, self.identity)
        self.assertEqual(len(json.loads(marker)), 4)
        self.assertEqual(self.raw, installer._json(value))
        self.assertNotIn("sanq-maintenance-marker", marker.decode())

    def test_wrong_fields_types_identity_hashes_and_execution_permission_are_rejected(self):
        original = json.loads(self.raw)
        for changes in ({"schemaVersion": True}, {"kind": "sanq-maintenance-marker"},
                        {"installationId": "f" * 64}, {"retentionId": "short"}, {"observationSha256": "F" * 64},
                        {"targetSourceSha": "dev"}, {"canExecute": True}, {"extra": True}):
            with self.assertRaises((ReleaseContractError, ValueError)):
                installer._installation_record_value(installer._json({**original, **changes}), self.identity)

    def test_duplicate_noncanonical_oversized_nonfinite_and_invalid_time_bytes_block(self):
        for raw in (self.raw[:-1], json.dumps(json.loads(self.raw), indent=2).encode(),
                    b'{"kind":"one","kind":"two"}', b'{"schemaVersion":NaN}', b"x" * 16385):
            with self.assertRaises((ReleaseContractError, ValueError)):
                installer._installation_record_value(raw, self.identity)
        for stamp in ("2026-02-30T12:00:00Z", "2026-10-28T12:00:00+00:00", "today", "2026-10-28T99:00:00Z"):
            with self.assertRaises((ReleaseContractError, ValueError)):
                installer._installation_record_value(installer._json({**json.loads(self.raw), "createdAt": stamp}), self.identity)

    def test_marker_cannot_bind_a_different_intent_or_installation(self):
        marker = installer._installation_marker_bytes(self.raw, self.identity)
        other = installer._json({**json.loads(self.raw), "observationSha256": "f" * 64})
        with self.assertRaises(ReleaseContractError):
            installer._installation_records_match(other, marker, self.identity)
        with self.assertRaises(ReleaseContractError):
            installer._installation_record_value(marker, "f" * 64, marker=True)

    def test_create_only_write_fsync_and_readback_keep_mode_and_inode(self):
        self.write()
        path = self.root / "intent.json"
        self.assertEqual(path.stat().st_mode & 0o7777, 0o600)
        inode = path.stat().st_ino
        self.assertEqual(installer._installation_record_read(self.fd, "intent.json", self.identity), self.raw)
        with self.assertRaises(FileExistsError):
            self.write()
        self.assertEqual(path.stat().st_ino, inode)
        self.assertEqual(path.read_bytes(), self.raw)

    def test_short_writes_are_completed_but_zero_progress_preserves_partial_file(self):
        write = installer.os.write
        def short(fd, raw):
            return write(fd, raw[:7])
        with patch.object(installer.os, "write", side_effect=short):
            self.write()
        self.assertEqual((self.root / "intent.json").read_bytes(), self.raw)
        (self.root / "intent.json").unlink()
        with patch.object(installer.os, "write", return_value=0), self.assertRaises(ReleaseContractError):
            self.write()
        self.assertTrue((self.root / "intent.json").exists())

    def test_partial_write_exception_keeps_original_partial_bytes_without_retry(self):
        write = installer.os.write
        calls = []
        def failing(fd, raw):
            if calls:
                raise OSError("modeled write failure")
            calls.append(True)
            return write(fd, raw[:9])
        with patch.object(installer.os, "write", side_effect=failing), self.assertRaises(OSError):
            self.write()
        self.assertEqual((self.root / "intent.json").read_bytes(), self.raw[:9])
        with self.assertRaises(FileExistsError):
            self.write()

    def test_file_or_directory_sync_failure_keeps_record_and_does_not_write_marker(self):
        sync = installer.os.fsync
        for fail_at in (1, 2):
            path = self.root / "intent.json"
            if path.exists():
                path.unlink()
            calls = []
            def failing(fd):
                calls.append(fd)
                if len(calls) == fail_at:
                    raise OSError("modeled sync failure")
                return sync(fd)
            with patch.object(installer.os, "fsync", side_effect=failing), self.assertRaises(OSError):
                self.write()
            self.assertEqual(path.read_bytes(), self.raw)
            self.assertFalse((self.root / "active.json").exists())

    def test_readback_failure_or_late_mode_change_never_cleans_the_record(self):
        with patch.object(installer, "_installation_record_read", return_value=b"other"), \
             self.assertRaises(ReleaseContractError):
            self.write()
        path = self.root / "intent.json"
        self.assertEqual(path.read_bytes(), self.raw)
        path.unlink()
        read = installer._installation_record_read
        def racing(*args):
            value = read(*args)
            path.chmod(0o640)
            return value
        with patch.object(installer, "_installation_record_read", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.write()
        self.assertEqual(path.stat().st_mode & 0o7777, 0o640)

    def test_symlink_hardlink_bad_permissions_and_fifo_are_not_valid_records(self):
        path = self.root / "intent.json"
        saved = self.root / "saved"
        saved.write_bytes(self.raw)
        saved.chmod(0o600)
        path.symlink_to(saved)
        with self.assertRaises(FileExistsError):
            self.write()
        with self.assertRaises(OSError):
            installer._installation_record_read(self.fd, "intent.json", self.identity)
        path.unlink()
        os.link(saved, path)
        with self.assertRaises(ReleaseContractError):
            installer._installation_record_read(self.fd, "intent.json", self.identity)
        path.unlink()
        os.mkfifo(path, 0o600)
        with self.assertRaises(ReleaseContractError):
            installer._installation_record_read(self.fd, "intent.json", self.identity)
        path.unlink()
        self.write()
        path.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            installer._installation_record_read(self.fd, "intent.json", self.identity)

    def test_bad_name_unprivileged_or_bad_directory_cannot_create_a_record(self):
        for name in ("../active.json", "retained.json", "unknown"):
            with self.assertRaises(ReleaseContractError):
                installer._installation_record_write(self.fd, name, self.raw, self.identity)
        with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.write()
        self.root.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            self.write()
        self.assertFalse((self.root / "intent.json").exists())

    def test_no_public_cli_or_private_material_allowlist_change(self):
        self.assertEqual(len(installer.PRIVATE_FILES), 4)
        self.assertNotIn("intent.json", installer.PRIVATE_FILES)
        for command in ("write-intent", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
