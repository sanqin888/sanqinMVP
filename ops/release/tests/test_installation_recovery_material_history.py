"""Complete retained-material inventory: disposable real files and modeled installation."""
import copy
import io
import json
import os
import shutil
import sys
import tarfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_recovery_retention as retention
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationRecoveryMaterialHistoryTests(unittest.TestCase):
    def setUp(self):
        self.base = retention.InstallationRecoveryRetentionTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.phase.saved.materials

    def history(self, suffix="one"):
        kit = b"raise AssertionError('historical delivery is data only')\n" + suffix.encode()
        old = b"inert historical Runtime bytes " + suffix.encode()
        value = installer._retention_record(kit, "c" * 40, old, "d" * 40, complete=True)
        root = self.materials.state / "installations" / value["retentionId"]
        root.mkdir(mode=0o700)
        contents = {"delivery-kit.tar.gz": kit, "current-runtime-archive.tar.gz": old,
                    "retained.json": installer._json(value),
                    "retaining.json": installer._json({**value, "phase": "RETAINING"})}
        for name, raw in contents.items():
            path = root / name
            path.write_bytes(raw)
            path.chmod(0o600)
        return root, contents

    def query(self):
        return installer._observe_installation_recovery_sources(
            self.materials.identity, fetch=self.base.phase.gate.combined.fetch)

    def sources(self):
        with installer._private_session() as folders:
            return installer._recovery_retention_sources(folders)

    def assert_before_install(self):
        self.assertFalse(self.base.phase.gate.marker.exists())
        namespace = self.base.phase.gate.namespace
        self.assertTrue(not namespace.exists() or not list(namespace.iterdir()))
        self.assertEqual(self.base.phase.actions, [])

    def test_all_complete_histories_are_included_with_exact_bytes_metadata_and_directories(self):
        roots = [self.history("one"), self.history("two")]
        files, metadata, directories, namespace = self.sources()
        self.assertEqual(len(files), 12)
        self.assertEqual(len(directories), 3)
        self.assertEqual(len(namespace), 9)
        for root, contents in roots:
            label = "/opt/sanq/deploy-state/installations/" + root.name
            self.assertIn(label, directories)
            for name, raw in contents.items():
                self.assertEqual(files[label + "/" + name], raw)
                self.assertEqual(metadata[label + "/" + name][2], len(raw))
        result = self.query()
        self.assertEqual(len(result["files"]), 38)
        self.assertEqual(result["retainedMaterialDirectories"], directories)
        self.assertEqual(result["retainedMaterialNamespace"], namespace)
        self.assertFalse(result["completePrivateStateCaptured"])

    def test_history_payloads_are_inert_without_archive_loading_import_or_host_execution(self):
        self.history()
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("host process")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")):
            self.query()
        self.assert_before_install()

    def test_summary_exposes_only_metadata_and_no_new_recovery_permission(self):
        root, contents = self.history()
        result = self.query()
        body = json.dumps(result)
        self.assertNotIn("historical delivery is data only", body)
        self.assertNotIn(contents["delivery-kit.tar.gz"].decode(), body)
        self.assertIn(root.name, body)
        for key in ("completePrivateStateCaptured", "recoveryReady", "snapshotAvailable", "readyToInstall", "canExecute"):
            self.assertFalse(result[key])

    def test_same_owned_flow_archive_and_receipt_bind_every_historical_original(self):
        root, contents = self.history()
        result = self.base.observe()
        with tarfile.open(fileobj=io.BytesIO(self.base.payload()), mode="r:") as archive:
            for name, raw in contents.items():
                label = "originals/opt/sanq/deploy-state/installations/" + root.name + "/" + name
                self.assertEqual(archive.extractfile(label).read(), raw)
            self.assertIn(installer.RECOVERY_HOST_MEMBER, archive.getnames())
            index = json.loads(archive.extractfile("recovery-index.json").read())
        self.assertEqual(index["capture"]["retainedMaterialDirectories"], self.base.capture[1]["retainedMaterialDirectories"])
        intent, writers, identity = self.base.originals()
        receipt = installer._installation_recovery_receipt_value(self.base.receipt(),
            self.base.payload(), intent, writers, identity)
        self.assertEqual(receipt["captureSha256"], installer._hash(installer._json(self.base.capture[1])))
        self.assertTrue(result["installationIntent"]["recoveryFiles"]["recoveryArchiveDurable"])
        self.assertFalse(receipt["recoveryReady"])

    def test_original_locks_cover_initial_capture_and_both_late_history_checks(self):
        self.history()
        original = installer._recovery_retention_sources
        phases = []
        def checked(folders):
            self.base.phase.gate.assert_locks_held()
            phases.append(self.base.phase.gate.marker.exists())
            return original(folders)
        with patch.object(installer, "_recovery_retention_sources", side_effect=checked):
            self.base.observe()
        self.assertIn(False, phases)
        self.assertGreaterEqual(phases.count(True), 2)

    def test_unknown_namespace_file_is_preserved_and_blocks_before_install(self):
        path = self.materials.state / "installations/unknown"
        path.write_bytes(b"preserve unknown history evidence")
        with self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertEqual(path.read_bytes(), b"preserve unknown history evidence")
        self.assert_before_install()

    def test_unknown_directory_name_is_not_silently_skipped(self):
        path = self.materials.state / "installations/partial"
        path.mkdir(mode=0o700)
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertTrue(path.exists())

    def test_missing_history_completion_record_blocks_without_repair(self):
        root, _ = self.history()
        (root / "retained.json").unlink()
        with self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertFalse((root / "retained.json").exists())
        self.assert_before_install()

    def test_extra_history_member_blocks_without_removal(self):
        root, _ = self.history()
        path = root / "unknown.json"
        path.write_bytes(b"preserve")
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertEqual(path.read_bytes(), b"preserve")

    def test_symlinked_history_directory_is_not_followed(self):
        root, _ = self.history()
        outside = self.materials.anchor / "saved-history"
        root.rename(outside)
        root.symlink_to(outside, target_is_directory=True)
        with self.assertRaises((ReleaseContractError, OSError)):
            self.query()
        self.assertTrue(root.is_symlink())

    def test_symlinked_history_member_is_not_followed(self):
        root, _ = self.history()
        path = root / "delivery-kit.tar.gz"
        outside = self.materials.anchor / "saved-delivery"
        path.rename(outside)
        path.symlink_to(outside)
        with self.assertRaises((ReleaseContractError, OSError)):
            self.query()
        self.assertTrue(path.is_symlink())

    def test_hardlinked_history_member_is_rejected_without_repair(self):
        root, _ = self.history()
        path = root / "delivery-kit.tar.gz"
        os.link(path, self.materials.anchor / "extra-link")
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertEqual(path.stat().st_nlink, 2)

    def test_wrong_history_directory_permissions_are_not_repaired(self):
        root, _ = self.history()
        root.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertEqual(root.stat().st_mode & 0o7777, 0o755)

    def test_wrong_history_file_permissions_are_not_repaired(self):
        root, _ = self.history()
        path = root / "retained.json"
        path.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertEqual(path.stat().st_mode & 0o7777, 0o644)

    def test_invalid_history_json_and_missing_fields_have_a_fixed_contract_error(self):
        root, contents = self.history()
        path = root / "retained.json"
        for raw in (b"{", b"\xff", b"{}\n", b'{"sourceSha":null}\n'):
            path.write_bytes(raw)
            with self.subTest(raw=raw), self.assertRaises(ReleaseContractError):
                self.query()
        path.write_bytes(contents["retained.json"])

    def test_history_hash_mismatch_and_unknown_record_permissions_are_rejected(self):
        root, contents = self.history()
        path = root / "delivery-kit.tar.gz"
        path.write_bytes(b"changed history bytes")
        with self.assertRaises(ReleaseContractError):
            self.query()
        path.write_bytes(contents["delivery-kit.tar.gz"])
        complete = root / "retained.json"
        value = json.loads(complete.read_bytes())
        value["canExecute"] = True
        complete.write_bytes(installer._json(value))
        with self.assertRaises(ReleaseContractError):
            self.query()

    def test_material_directory_name_must_match_its_content_derived_identity(self):
        root, _ = self.history()
        renamed = root.with_name("f" * 64)
        root.rename(renamed)
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertTrue(renamed.exists())

    def test_retention_count_budget_blocks_without_deletion(self):
        root, _ = self.history()
        with patch.object(installer, "MAX_RECOVERY_RETENTIONS", 1), self.assertRaises(ReleaseContractError):
            self.sources()
        self.assertTrue(root.exists())

    def test_declared_byte_budget_blocks_before_reading_any_group_contents(self):
        self.history()
        with patch.object(installer, "MAX_RECOVERY_SOURCE_BYTES", 1), \
             patch.object(installer, "_private_read", side_effect=AssertionError("read before size budget")), \
             self.assertRaises(ReleaseContractError):
            self.sources()

    def test_same_bytes_history_file_replacement_between_captures_blocks_summary(self):
        root, _ = self.history()
        path = root / "delivery-kit.tar.gz"
        original = installer._installation_recovery_sources
        changed = []
        def racing(*args):
            result = original(*args)
            if not changed:
                changed.append(True)
                temporary = root / "new-file"
                temporary.write_bytes(path.read_bytes())
                temporary.chmod(0o600)
                os.replace(temporary, path)
            return result
        with patch.object(installer, "_installation_recovery_sources", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.query()
        self.assertTrue(path.exists())

    def test_history_addition_after_freeze_starts_blocks_archive_and_keeps_fence(self):
        self.history()
        added = []
        def late(role, action):
            if not added:
                added.append(self.history("late")[0])
        self.base.phase.after_mutation = late
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.base.assert_frozen_evidence()
        self.assertFalse(self.base.directory().exists())
        self.assertTrue(added[0].exists())

    def test_history_change_after_receipt_keeps_durable_pair_and_reports_fence_unknown(self):
        root, _ = self.history()
        write = installer._installation_recovery_write
        def late(*args):
            value = write(*args)
            if args[1] == "recovery.json":
                (root / "delivery-kit.tar.gz").write_bytes(b"late changed history")
            return value
        with patch.object(installer, "_installation_recovery_write", side_effect=late), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.base.assert_frozen_evidence()
        self.assertTrue((self.base.directory() / "recovery.tar").exists())
        self.assertTrue((self.base.directory() / "recovery.json").exists())
        before = len(self.base.phase.actions)
        with self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertEqual(len(self.base.phase.actions), before)

    def test_same_bytes_directory_replacement_during_read_is_detected(self):
        root, _ = self.history()
        replacement = self.materials.anchor / "replacement-history"
        shutil.copytree(root, replacement)
        original = installer._private_read
        changed = []
        def racing(fd, name, maximum):
            raw = original(fd, name, maximum)
            if not changed and os.fstat(fd).st_ino == root.stat().st_ino:
                changed.append(True)
                root.rename(self.materials.anchor / "original-history")
                replacement.rename(root)
            return raw
        with patch.object(installer, "_private_read", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.sources()
        self.assertTrue(root.exists())

    def test_payload_cannot_omit_a_declared_history_group_or_admit_an_unknown_path(self):
        root, _ = self.history()
        self.base.observe()
        files, summary, host = self.base.capture
        intent, writers, identity = self.base.originals()
        label = "/opt/sanq/deploy-state/installations/" + root.name + "/delivery-kit.tar.gz"
        changed_files, changed_summary = dict(files), copy.deepcopy(summary)
        changed_files.pop(label)
        changed_summary["files"].pop(label)
        changed_summary["capturedBytes"] = sum(map(len, changed_files.values()))
        with self.assertRaises(ReleaseContractError):
            installer._installation_recovery_payload((changed_files, changed_summary, host), intent, writers, identity)
        changed = copy.deepcopy(summary)
        changed["retainedMaterialDirectories"]["/other/history"] = next(iter(changed["retainedMaterialDirectories"].values()))
        with self.assertRaises(ReleaseContractError):
            installer._installation_recovery_payload((files, changed, host), intent, writers, identity)

    def test_original_freeze_entry_does_not_collect_or_adopt_material_history(self):
        with patch.object(installer, "_recovery_retention_sources", side_effect=AssertionError("history scan")):
            result = self.base.phase.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_FROZEN")
        self.assertFalse(self.base.directory().exists())


if __name__ == "__main__":
    unittest.main()
