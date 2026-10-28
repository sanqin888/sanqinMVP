"""Owned recovery pair retention: disposable files, mocked host commands, inert tar."""
import copy
import io
import json
import os
import sys
import tarfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_freeze_writers as freeze
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationRecoveryRetentionTests(unittest.TestCase):
    def setUp(self):
        self.phase = freeze.InstallationFreezeWritersTests()
        self.phase.setUp()
        self.addCleanup(self.phase.doCleanups)
        self.capture = None
        self.captures = []

    def observe(self):
        original = installer._installation_recovery_sources
        def captured(*args):
            self.assertFalse(self.phase.gate.marker.exists())
            self.assertFalse((self.phase.gate.manager.directory / "docker.service.d" / installer.INSTALL_GATE_NAME).exists())
            value = original(*args)
            self.capture = value
            self.captures.append(value)
            return value
        with patch.object(installer, "_freeze_installation_writers", side_effect=installer._retain_installation_recovery), \
             patch.object(installer, "_installation_recovery_sources", side_effect=captured):
            return self.phase.observe()

    def directory(self):
        return self.phase.saved.record_path().parent / "recovery"

    def originals(self):
        return self.phase.saved.originals()

    def payload(self):
        return (self.directory() / "recovery.tar").read_bytes()

    def receipt(self):
        return (self.directory() / "recovery.json").read_bytes()

    def assert_frozen_evidence(self):
        self.assertTrue(self.phase.gate.marker.exists())
        self.assertTrue(self.phase.saved.record_path().exists())
        for identifier in self.phase.docker.ids[:3]:
            self.assertFalse(self.phase.docker.containers[identifier]["State"]["Running"])

    def test_same_owned_flow_keeps_partial_recovery_pair_but_never_install_permission(self):
        db = copy.deepcopy(self.phase.docker.containers[self.phase.docker.ids[3]])
        result = self.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_RECOVERY_FILES_RETAINED")
        facts = result["installationIntent"]["recoveryFiles"]
        self.assertTrue(facts["recoveryArchiveDurable"])
        for key in ("recoveryReady", "snapshotAvailable", "canExecute"):
            self.assertFalse(facts[key])
        self.assertFalse(result["readyToInstall"])
        self.assertTrue(result["installationIntent"]["writersFrozen"])
        self.assertEqual(len(self.captures), 1)
        self.assertEqual(set(path.name for path in self.directory().iterdir()), installer.RECOVERY_FILES)
        self.assertEqual(self.directory().stat().st_mode & 0o7777, 0o700)
        for path in self.directory().iterdir():
            self.assertEqual(path.stat().st_mode & 0o7777, 0o600)
        intent, writers, identity = self.originals()
        receipt = installer._installation_recovery_receipt_value(self.receipt(), self.payload(), intent, writers, identity)
        self.assertEqual(receipt["captureSha256"], installer._hash(installer._json(self.capture[1])))
        self.assertFalse(receipt["completePrivateStateCaptured"])
        self.assertEqual(db, self.phase.docker.containers[self.phase.docker.ids[3]])
        self.assertNotIn("MODEL_TOKEN=", json.dumps(result))

    def test_both_locks_and_confirmed_freeze_precede_archive_and_receipt_writes(self):
        write = installer._installation_recovery_write
        names = []
        def checked(*args):
            self.phase.gate.assert_locks_held()
            self.assertEqual(len(self.phase.actions), 6)
            self.assert_frozen_evidence()
            names.append(args[1])
            return write(*args)
        with patch.object(installer, "_installation_recovery_write", side_effect=checked):
            self.observe()
        self.assertEqual(names, ["recovery.tar", "recovery.json"])

    def test_original_freeze_entry_does_not_capture_or_write_recovery(self):
        with patch.object(installer, "_installation_recovery_sources", side_effect=AssertionError("capture")), \
             patch.object(installer, "_installation_recovery_write", side_effect=AssertionError("write")):
            result = self.phase.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_FROZEN")
        self.assertFalse(self.directory().exists())

    def test_partial_archive_keeps_frozen_originals_and_no_receipt_or_replay(self):
        def fail(root, name, raw):
            self.assertEqual(name, "recovery.tar")
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
            try:
                os.write(fd, raw[:19])
            finally:
                os.close(fd)
            raise OSError("modeled partial archive")
        with patch.object(installer, "_installation_recovery_write", side_effect=fail), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.payload()), 19)
        self.assertFalse((self.directory() / "recovery.json").exists())
        self.assert_frozen_evidence()
        before = len(self.phase.actions)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(len(self.phase.actions), before)

    def test_partial_receipt_preserves_full_archive_and_partial_receipt(self):
        write = installer._installation_recovery_write
        def fail(root, name, raw):
            if name == "recovery.tar":
                return write(root, name, raw)
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
            try:
                os.write(fd, raw[:7])
            finally:
                os.close(fd)
            raise OSError("modeled partial receipt")
        with patch.object(installer, "_installation_recovery_write", side_effect=fail), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.receipt()), 7)
        self.assert_frozen_evidence()
        intent, writers, identity = self.originals()
        installer._installation_recovery_verify(self.payload(),
            installer._installation_recovery_entries(self.capture, intent, writers, identity))

    def test_archive_sync_unknown_preserves_complete_bytes_without_receipt(self):
        write = installer._installation_recovery_write
        def fail(*args):
            with patch.object(installer.os, "fsync", side_effect=OSError("modeled sync unknown")):
                return write(*args)
        with patch.object(installer, "_installation_recovery_write", side_effect=fail), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertGreater(len(self.payload()), 19)
        self.assertFalse((self.directory() / "recovery.json").exists())
        self.assert_frozen_evidence()

    def test_real_short_writes_complete_both_private_files(self):
        write = installer._installation_recovery_write
        raw_write = installer.os.write
        calls = []
        def bounded(root, name, raw):
            def short(fd, value):
                calls.append(name)
                return raw_write(fd, value[:4096])
            with patch.object(installer.os, "write", side_effect=short):
                return write(root, name, raw)
        with patch.object(installer, "_installation_recovery_write", side_effect=bounded):
            result = self.observe()
        self.assertTrue(result["installationIntent"]["recoveryFiles"]["recoveryArchiveDurable"])
        self.assertGreater(calls.count("recovery.tar"), 1)
        self.assertIn("recovery.json", calls)

    def test_zero_progress_write_keeps_empty_archive_without_receipt(self):
        write = installer._installation_recovery_write
        def failing(*args):
            with patch.object(installer.os, "write", return_value=0):
                return write(*args)
        with patch.object(installer, "_installation_recovery_write", side_effect=failing), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(self.payload(), b"")
        self.assertFalse((self.directory() / "recovery.json").exists())
        self.assert_frozen_evidence()

    def test_archive_budget_failure_does_not_create_the_recovery_directory(self):
        with patch.object(installer, "MAX_RECOVERY_ARCHIVE_BYTES", 1), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertFalse(self.directory().exists())
        self.assert_frozen_evidence()

    def test_low_storage_keeps_empty_private_directory_and_does_not_unfreeze(self):
        write = installer._installation_recovery_write
        def low(*args):
            with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=0, f_frsize=1)):
                return write(*args)
        with patch.object(installer, "_installation_recovery_write", side_effect=low), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue(self.directory().is_dir())
        self.assertFalse(list(self.directory().iterdir()))
        self.assert_frozen_evidence()

    def test_marker_drift_after_archive_blocks_receipt_and_preserves_all_evidence(self):
        write = installer._installation_recovery_write
        def racing(*args):
            value = write(*args)
            if args[1] == "recovery.tar":
                self.phase.gate.marker.write_bytes(b"unknown marker")
            return value
        with patch.object(installer, "_installation_recovery_write", side_effect=racing), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(self.phase.gate.marker.read_bytes(), b"unknown marker")
        self.assertTrue((self.directory() / "recovery.tar").exists())
        self.assertFalse((self.directory() / "recovery.json").exists())

    def test_private_inventory_change_after_capture_blocks_recovery_write(self):
        capture = installer._installation_recovery_sources
        plan = self.phase.saved.materials.state / "plans" / ("a" * 64 + ".json")
        def racing(*args):
            value = capture(*args)
            plan.write_bytes(b'{"inert":"late state"}\n')
            plan.chmod(0o600)
            return value
        with patch.object(installer, "_installation_recovery_sources", side_effect=racing), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue(plan.exists())
        self.assertFalse(self.directory().exists())
        self.assert_frozen_evidence()

    def test_host_drift_after_receipt_does_not_return_durable_success(self):
        write = installer._installation_recovery_write
        def racing(*args):
            value = write(*args)
            if args[1] == "recovery.json":
                self.phase.docker.containers[self.phase.docker.ids[3]]["RestartCount"] += 1
            return value
        with patch.object(installer, "_installation_recovery_write", side_effect=racing), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue((self.directory() / "recovery.json").exists())
        self.assert_frozen_evidence()

    def test_same_bytes_replacement_during_readback_is_an_unknown_write(self):
        read = installer._installation_recovery_read
        changed = []
        def racing(root, name):
            value = read(root, name)
            if name == "recovery.tar" and not changed:
                changed.append(True)
                path = self.directory() / name
                replacement = path.with_name("replacement")
                replacement.write_bytes(value)
                replacement.chmod(0o600)
                os.replace(replacement, path)
            return value
        with patch.object(installer, "_installation_recovery_read", side_effect=racing), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue((self.directory() / "recovery.tar").exists())
        self.assertFalse((self.directory() / "recovery.json").exists())

    def test_payload_is_deterministic_and_preserves_original_bytes_mode_metadata_and_absences(self):
        self.observe()
        intent, writers, identity = self.originals()
        self.assertEqual(installer._installation_recovery_payload(self.capture, intent, writers, identity), self.payload())
        with tarfile.open(fileobj=io.BytesIO(self.payload()), mode="r:") as archive:
            self.assertEqual(archive.getnames(), sorted(archive.getnames()))
            for member in archive:
                self.assertEqual(member.mode, 0o600)
                self.assertEqual(member.type, tarfile.REGTYPE)
            for path, raw in self.capture[0].items():
                self.assertEqual(archive.extractfile("originals" + path).read(), raw)
            index = json.loads(archive.extractfile("recovery-index.json").read())
        self.assertEqual(index["capture"]["absentFiles"], self.capture[1]["absentFiles"])
        self.assertFalse(index["recoveryReady"])

    def test_payload_verifier_rejects_truncation_extra_tail_and_nonzero_padding(self):
        self.observe()
        intent, writers, identity = self.originals()
        entries = installer._installation_recovery_entries(self.capture, intent, writers, identity)
        payload = self.payload()
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
            member = next(value for value in archive if value.size % 512)
        offset = member.offset_data + member.size
        poisoned = payload[:offset] + b"X" + payload[offset + 1:]
        for bad in (payload[:-1], payload + b"X", payload + bytes(10240), poisoned):
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_verify(bad, entries)

    def test_payload_inventory_and_capture_permission_cannot_be_widened(self):
        self.observe()
        intent, writers, identity = self.originals()
        for key, value in (("recoveryReady", True), ("completePrivateStateCaptured", True),
                           ("sourceSha", "f" * 40), ("absentFiles", [])):
            capture = (self.capture[0], {**self.capture[1], key: value})
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_payload(capture, intent, writers, identity)
        files = dict(self.capture[0])
        files["/etc/shadow"] = b"forbidden"
        summary = copy.deepcopy(self.capture[1])
        summary["files"]["/etc/shadow"] = next(iter(summary["files"].values()))
        with self.assertRaises(ReleaseContractError):
            installer._installation_recovery_payload((files, summary), intent, writers, identity)

    def test_payload_verifier_rejects_links_wrong_mode_duplicate_and_traversal(self):
        self.observe()
        intent, writers, identity = self.originals()
        entries = installer._installation_recovery_entries(self.capture, intent, writers, identity)
        name = sorted(entries)[0]
        for alternate, mode, kind, duplicate in (("../escape", 0o600, tarfile.REGTYPE, False),
                                                (name, 0o644, tarfile.REGTYPE, False),
                                                (name, 0o600, tarfile.SYMTYPE, False),
                                                (name, 0o600, tarfile.REGTYPE, True)):
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                member = tarfile.TarInfo(alternate)
                member.mode, member.type = mode, kind
                member.size = len(entries[name]) if kind == tarfile.REGTYPE else 0
                if kind == tarfile.SYMTYPE:
                    member.linkname = "/outside"
                archive.addfile(member, io.BytesIO(entries[name]) if kind == tarfile.REGTYPE else None)
                if duplicate:
                    archive.addfile(member, io.BytesIO(entries[name]))
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_verify(output.getvalue(), entries)

    def test_receipt_is_strictly_bound_to_originals_payload_capture_and_false_permissions(self):
        self.observe()
        intent, writers, identity = self.originals()
        original = json.loads(self.receipt())
        for changes in ({"canExecute": True}, {"schemaVersion": True}, {"archiveBytes": True},
                        {"archiveSha256": "f" * 64}, {"captureSha256": "e" * 64},
                        {"intentSha256": "d" * 64}, {"snapshotAvailable": True}, {"unknown": 1}):
            raw = installer._json({**original, **changes})
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_receipt_value(raw, self.payload(), intent, writers, identity)
        for raw in (b"{", b"\xff", self.receipt() + b" ",
                    self.receipt().replace(b'"schemaVersion":1', b'"schemaVersion":1,"schemaVersion":1'),
                    self.receipt().replace(b'"archiveBytes":' + str(original["archiveBytes"]).encode("ascii"), b'"archiveBytes":NaN')):
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_receipt_value(raw, self.payload(), intent, writers, identity)

    def test_existing_pair_is_never_adopted_or_overwritten(self):
        self.observe()
        before = (self.payload(), self.receipt())
        root = os.open(self.directory(), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            with self.assertRaises(FileExistsError):
                installer._installation_recovery_write(root, "recovery.tar", self.payload())
        finally:
            os.close(root)
        parent = os.open(self.directory().parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            with self.assertRaises(FileExistsError):
                with installer._installation_recovery_directory(parent, create=True):
                    pass
        finally:
            os.close(parent)
        self.assertEqual(before, (self.payload(), self.receipt()))

    def test_recovery_file_permissions_links_and_unprivileged_write_are_not_repaired(self):
        self.observe()
        root = os.open(self.directory(), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        path = self.directory() / "recovery.json"
        try:
            path.chmod(0o644)
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_read(root, "recovery.json")
            self.assertEqual(path.stat().st_mode & 0o7777, 0o644)
            path.chmod(0o600)
            saved_path = path.with_name("saved")
            path.rename(saved_path)
            path.symlink_to(saved_path)
            with self.assertRaises(OSError):
                installer._installation_recovery_read(root, "recovery.json")
            with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
                installer._installation_recovery_write(root, "recovery.tar", b"not executable")
        finally:
            os.close(root)

    def test_legacy_record_material_allowlists_and_public_cli_are_unchanged(self):
        self.assertEqual(len(installer.PRIVATE_FILES), 4)
        self.assertNotIn("recovery.json", installer.PRIVATE_FILES)
        self.observe()
        root = os.open(self.directory().parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            with self.assertRaises(ReleaseContractError):
                installer._installation_record_read(root, "recovery.json", self.directory().parent.name)
        finally:
            os.close(root)
        with self.assertRaises(ReleaseContractError):
            installer._observe_installed_runtime(self.phase.saved.materials.identity, _retain_recovery=True)
        for command in ("retain-recovery", "restore", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
