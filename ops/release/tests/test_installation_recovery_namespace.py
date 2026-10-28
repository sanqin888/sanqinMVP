"""Private root inventory and original absence facts; disposable files, modeled host."""
import contextlib
import copy
import io
import json
import os
import sys
import tarfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_recovery_retention as retention
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationRecoveryNamespaceTests(unittest.TestCase):
    def setUp(self):
        self.base = retention.InstallationRecoveryRetentionTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.phase.saved.materials
        self.namespace = self.base.phase.gate.namespace

    def query(self):
        return installer._observe_installation_recovery_sources(
            self.materials.identity, fetch=self.base.phase.gate.combined.fetch)

    def facts(self):
        with installer._private_session() as folders:
            return installer._recovery_namespace_snapshot(folders)

    def assert_before_intent(self):
        self.assertFalse(self.base.phase.gate.marker.exists())
        self.assertTrue(not self.namespace.exists() or not list(self.namespace.iterdir()))
        self.assertEqual(self.base.phase.actions, [])

    def after_host_capture(self, change):
        original = installer._installation_recovery_host_capture
        def capture(*args, **kwargs):
            value = original(*args, **kwargs)
            change()
            return value
        return patch.object(installer, "_installation_recovery_host_capture", side_effect=capture)

    def archive_facts(self):
        with tarfile.open(fileobj=io.BytesIO(self.base.payload()), mode="r:") as archive:
            return json.loads(archive.extractfile("recovery-index.json").read())["capture"]["privateNamespace"]

    def test_absent_transaction_namespace_and_empty_maintenance_are_exact_original_facts(self):
        facts = self.facts()
        self.assertEqual(facts["originalEntries"], sorted(installer.RECOVERY_STATE_DIRECTORIES))
        self.assertEqual(facts["maintenanceEntries"], [])
        self.assertIsNone(facts["installationNamespace"])
        self.assertEqual(set(facts["directories"]), installer.RECOVERY_STATE_DIRECTORIES)
        self.assertEqual(facts["state"]["identity"][1], self.materials.state.stat().st_ino)
        self.assertEqual(self.query()["privateNamespace"], facts)
        self.assert_before_intent()

    def test_existing_empty_namespace_identity_is_captured_without_creation_or_repair(self):
        self.namespace.mkdir(mode=0o700)
        info = self.namespace.stat()
        facts = self.query()["privateNamespace"]
        self.assertEqual(facts["installationNamespace"]["identity"][1], info.st_ino)
        self.assertEqual(facts["originalEntries"], sorted(installer.RECOVERY_STATE_DIRECTORIES | {installer.INSTALLATION_RUNS}))
        self.assertEqual(list(self.namespace.iterdir()), [])
        self.assertEqual(self.namespace.stat().st_ino, info.st_ino)

    def test_owned_flow_archives_original_absence_and_never_relabels_current_marker_as_original(self):
        result = self.base.observe()
        facts = self.archive_facts()
        self.assertIsNone(facts["installationNamespace"])
        self.assertEqual(facts["maintenanceEntries"], [])
        self.assertNotIn(installer.INSTALLATION_RUNS, facts["originalEntries"])
        self.assertTrue(self.base.phase.gate.marker.exists())
        self.assertTrue(self.namespace.exists())
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["installationIntent"]["recoveryFiles"]["recoveryReady"])

    def test_owned_flow_reuses_only_the_original_empty_namespace_inode(self):
        self.namespace.mkdir(mode=0o700)
        inode = self.namespace.stat().st_ino
        self.base.observe()
        self.assertEqual(self.archive_facts()["installationNamespace"]["identity"][1], inode)
        self.assertEqual(self.namespace.stat().st_ino, inode)
        self.base.assert_frozen_evidence()

    def test_readonly_namespace_capture_uses_both_locks_and_never_writes_syncs_or_spawns(self):
        original = installer._recovery_namespace_snapshot
        calls = []
        def checked(folders):
            self.base.phase.gate.assert_locks_held()
            calls.append(True)
            return original(folders)
        with patch.object(installer, "_recovery_namespace_snapshot", side_effect=checked), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("spawn")):
            self.query()
        self.assertTrue(calls)
        self.assert_before_intent()

    def test_unknown_private_root_file_is_preserved_and_blocks_before_intent(self):
        path = self.materials.state / "unreviewed.json"
        path.write_bytes(b"preserve unknown root evidence")
        with self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertEqual(path.read_bytes(), b"preserve unknown root evidence")
        self.assert_before_intent()

    def test_unknown_private_root_directory_is_not_silently_ignored(self):
        path = self.materials.state / "other-state"
        path.mkdir(mode=0o700)
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertTrue(path.exists())

    def test_existing_transaction_residue_blocks_readonly_capture_without_cleanup(self):
        self.namespace.mkdir(mode=0o700)
        path = self.namespace / ("a" * 64)
        path.mkdir(mode=0o700)
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertTrue(path.exists())
        self.assertFalse(self.base.phase.gate.marker.exists())

    def test_symlinked_transaction_namespace_is_rejected_without_following(self):
        outside = self.materials.anchor / "outside-namespace"
        outside.mkdir(mode=0o700)
        self.namespace.symlink_to(outside, target_is_directory=True)
        with self.assertRaises((ReleaseContractError, OSError)):
            self.query()
        self.assertTrue(self.namespace.is_symlink())

    def test_wrong_transaction_namespace_mode_is_not_repaired(self):
        self.namespace.mkdir(mode=0o755)
        self.namespace.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            self.query()
        self.assertEqual(self.namespace.stat().st_mode & 0o7777, 0o755)

    def test_unknown_root_appearing_after_host_capture_blocks_before_any_installation_write(self):
        path = self.materials.state / "late-unknown"
        with self.after_host_capture(lambda: path.write_bytes(b"late evidence")), self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertEqual(path.read_bytes(), b"late evidence")
        self.assert_before_intent()

    def test_empty_namespace_appearing_after_capture_cannot_be_adopted(self):
        with self.after_host_capture(lambda: self.namespace.mkdir(mode=0o700)), self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertTrue(self.namespace.exists())
        self.assert_before_intent()

    def test_empty_namespace_appearing_during_creation_is_not_claimed_as_our_creation(self):
        original = installer._installation_namespace
        injected = []
        @contextlib.contextmanager
        def racing(parent, **kwargs):
            if kwargs.get("create") and not injected:
                injected.append(True)
                os.mkdir(installer.INSTALLATION_RUNS, mode=0o700, dir_fd=parent)
            with original(parent, **kwargs) as value:
                yield value
        with patch.object(installer, "_installation_namespace", side_effect=racing), \
             self.assertRaisesRegex(ReleaseContractError, "creation differs"):
            self.base.observe()
        self.assertTrue(injected)
        self.assert_before_intent()

    def test_replaced_original_empty_namespace_before_intent_blocks_without_repair(self):
        self.namespace.mkdir(mode=0o700)
        original = self.namespace.stat().st_ino
        saved = self.materials.anchor / "old-empty-namespace"
        def replace():
            self.namespace.rename(saved)
            self.namespace.mkdir(mode=0o700)
        with self.after_host_capture(replace), self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertEqual(saved.stat().st_ino, original)
        self.assertNotEqual(self.namespace.stat().st_ino, original)
        self.assert_before_intent()

    def test_private_plan_change_after_capture_is_detected_before_intent(self):
        path = self.materials.state / "plans" / ("a" * 64 + ".json")
        def add():
            path.write_bytes(b'{"inert":"late plan"}\n')
            path.chmod(0o600)
        with self.after_host_capture(add), self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.assertTrue(path.exists())
        self.assert_before_intent()

    def test_unknown_root_after_first_writer_action_retains_fence_and_stops_original_ids(self):
        path = self.materials.state / "late-state"
        changed = []
        def add(role, action):
            if not changed:
                changed.append(True)
                path.write_bytes(b"late unknown")
        self.base.phase.after_mutation = add
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.base.assert_frozen_evidence()
        self.assertEqual(path.read_bytes(), b"late unknown")
        self.assertFalse(self.base.directory().exists())
        saved_ids = set(self.base.phase.docker.ids[:3])
        self.assertTrue(all(identifier in saved_ids for _, _, identifier in self.base.phase.actions))

    def test_unknown_root_after_receipt_preserves_complete_pair_and_blocks_success(self):
        write = installer._installation_recovery_write
        path = self.materials.state / "after-receipt"
        def add(*args):
            result = write(*args)
            if args[1] == "recovery.json":
                path.write_bytes(b"preserve late evidence")
            return result
        with patch.object(installer, "_installation_recovery_write", side_effect=add), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.base.assert_frozen_evidence()
        self.assertTrue((self.base.directory() / "recovery.tar").exists())
        self.assertTrue((self.base.directory() / "recovery.json").exists())
        self.assertTrue(path.exists())

    def test_unknown_maintenance_member_after_receipt_is_preserved(self):
        write = installer._installation_recovery_write
        path = self.materials.state / "maintenance/unknown"
        def add(*args):
            result = write(*args)
            if args[1] == "recovery.json":
                path.write_bytes(b"unknown maintenance evidence")
                path.chmod(0o600)
            return result
        with patch.object(installer, "_installation_recovery_write", side_effect=add), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.assertTrue(self.base.phase.gate.marker.exists())
        self.assertTrue((self.base.directory() / "recovery.json").exists())
        self.assertEqual(path.read_bytes(), b"unknown maintenance evidence")

    def test_namespace_replacement_after_receipt_keeps_original_evidence_without_adoption(self):
        write = installer._installation_recovery_write
        saved = self.materials.anchor / "retained-original-namespace"
        old_recovery = []
        def replace(*args):
            result = write(*args)
            if args[1] == "recovery.json":
                old_recovery.append(self.base.directory().relative_to(self.namespace))
                self.namespace.rename(saved)
                self.namespace.mkdir(mode=0o700)
            return result
        with patch.object(installer, "_installation_recovery_write", side_effect=replace), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.assertEqual(list(self.namespace.iterdir()), [])
        self.assertTrue((saved / old_recovery[0] / "recovery.tar").exists())
        self.assertTrue((saved / old_recovery[0] / "recovery.json").exists())
        self.assertTrue(self.base.phase.gate.marker.exists())

    def test_private_namespace_fact_parser_rejects_unknown_entries_bad_identity_and_boolean_metadata(self):
        original = self.facts()
        changes = []
        value = copy.deepcopy(original)
        value["originalEntries"].append("other")
        changes.append(value)
        value = copy.deepcopy(original)
        value["maintenanceEntries"] = ["active.json"]
        changes.append(value)
        value = copy.deepcopy(original)
        value["state"]["identity"][1] = True
        changes.append(value)
        value = copy.deepcopy(original)
        value["directories"]["jobs"]["fingerprint"][7] ^= 1
        changes.append(value)
        changes.append({**original, "extra": False})
        for value in changes:
            with self.assertRaises(ReleaseContractError):
                installer._recovery_namespace_value(value)

    def test_archive_cannot_omit_or_widen_original_namespace_facts(self):
        self.base.observe()
        files, summary, host = self.base.capture
        intent, writers, identity = self.base.originals()
        for facts in (None, {**summary["privateNamespace"], "maintenanceEntries": ["active.json"]}):
            changed = {**summary, "privateNamespace": facts}
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_payload((files, changed, host), intent, writers, identity)

    def test_recovery_continuation_without_original_namespace_facts_is_rejected_before_writes(self):
        with installer._private_session() as folders, self.assertRaises(ReleaseContractError):
            installer._write_installation_intent_locked(folders, self.materials.identity, {},
                recheck=lambda: None, retain_recovery=lambda *args: None)
        self.assert_before_intent()

    def test_original_freeze_entry_does_not_enable_new_namespace_capture(self):
        with patch.object(installer, "_recovery_namespace_snapshot", side_effect=AssertionError("capture")):
            result = self.base.phase.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_FROZEN")
        self.assertFalse(self.base.directory().exists())


if __name__ == "__main__":
    unittest.main()
