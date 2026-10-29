"""Owned target/storage originals: disposable recovery archives, no production operations."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_recovery_retention as retention
import test_installation_snapshot_storage as storage
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationStorageRecoveryBindingTests(unittest.TestCase):
    def setUp(self):
        self.base = retention.InstallationRecoveryRetentionTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.combined = self.base.phase.gate.combined
        self.storage = storage.InstallationSnapshotStorageTests()
        self.storage.base = self.combined
        self.storage.prepare_storage()
        self.capture = None
        self.storage.target["instance"]["operatorNote"] = "ORIGINAL_TARGET_NOTE_NEVER_ECHO"

    def observe(self):
        original_capture = installer._installation_recovery_storage_capture
        original_runtime = self.combined.runtime_read
        def captured(*args):
            self.base.phase.gate.assert_locks_held()
            self.assertFalse(self.base.phase.gate.marker.exists())
            self.assertFalse(self.base.phase.actions)
            self.capture = original_capture(*args)
            return self.capture
        def runtime(args):
            if tuple(args) == installer.INSTALL_BLOCK_ARGS or args == installer._installation_storage_args(self.combined.docker.ids[3]):
                return self.storage.observe_storage_command(args)
            return original_runtime(args)
        with patch.object(installer, "_retain_installation_recovery",
                side_effect=lambda identity, **kwargs: installer._retain_installation_target_storage(
                    identity, self.storage.raw(), **kwargs)), \
             patch.object(installer, "_installation_recovery_storage_capture", side_effect=captured), \
             patch.object(self.combined, "runtime_read", side_effect=runtime):
            return self.base.observe()

    def audit(self, payload=None, receipt=None, *, required=True):
        return installer._installation_recovery_scope(
            self.base.payload() if payload is None else payload,
            self.base.receipt() if receipt is None else receipt, *self.base.originals(),
            fetch=self.combined.fetch, require_target_storage=required)

    def rebuild(self, capture):
        intent, writers, identity = self.base.originals()
        payload = installer._installation_recovery_payload(capture, intent, writers, identity)
        receipt = installer._installation_recovery_receipt(payload, intent, writers, identity,
            installer._hash(installer._json(capture[1])))
        return payload, receipt

    def changed(self, mutate):
        files, summary, host, raw = copy.deepcopy(self.capture)
        value = json.loads(raw)
        mutate(value)
        raw = installer._json(value)
        summary["snapshotStorage"].update(sha256=installer._hash(raw), bytes=len(raw),
            observationSha256=installer._hash(installer._json(value["originalObservation"])))
        return files, summary, host, raw

    def assert_preserved(self):
        self.base.assert_frozen_evidence()
        self.assertFalse(installer._installation_record_value(
            self.base.originals()[0], self.base.originals()[2])["canExecute"])

    def test_complete_same_owned_flow_durably_binds_originals_to_original_intent_without_ready_permission(self):
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("unmodeled host command")):
            result = self.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_TARGET_STORAGE_RETAINED")
        self.assertTrue(result["snapshotStorageBoundToIntent"])
        facts = result["installationIntent"]["recoveryFiles"]
        self.assertTrue(facts["recoveryArchiveDurable"])
        self.assertTrue(facts["scopeReview"]["snapshotTargetStorageReviewed"])
        self.assertEqual(facts["scopeReview"], self.audit())
        for key in ("canExecute", "readyToInstall", "authorizedToMutateProduction"):
            self.assertFalse(result[key])
        for key in ("canExecute", "recoveryReady", "snapshotAvailable"):
            self.assertFalse(facts[key])
        self.assertFalse(result["snapshotStorage"]["restoreProven"])
        self.assertEqual(set(path.name for path in self.base.directory().iterdir()), installer.RECOVERY_FILES)
        self.assertNotIn("ORIGINAL_TARGET_NOTE_NEVER_ECHO", json.dumps(result))
        self.assert_preserved()

    def test_archive_keeps_original_target_public_key_mounts_commands_and_exact_original_observation(self):
        self.observe()
        members = installer._installation_recovery_members(self.base.payload())
        self.assertIn(installer.RECOVERY_STORAGE_MEMBER, members)
        value = json.loads(members[installer.RECOVERY_STORAGE_MEMBER])
        original = value["storageOriginals"]
        self.assertEqual(original["targetOriginal"].encode(), self.storage.raw())
        self.assertEqual(original["publicHostKeyOriginal"].encode(), self.storage.key.read_bytes())
        self.assertEqual(original["mountinfoOriginals"], [self.storage.mounts.decode()] * 2)
        self.assertEqual(len(original["commands"]), 4)
        self.assertEqual(original["tablespaceEntries"], [])
        self.assertIn("ORIGINAL_TARGET_NOTE_NEVER_ECHO", original["targetOriginal"])
        intent, _, identity = self.base.originals()
        record = installer._installation_record_value(intent, identity)
        self.assertEqual(record["observationSha256"], installer._hash(installer._json(value["originalObservation"])))
        self.assertEqual(len(self.capture), 4)
        self.assertEqual(self.capture[3], members[installer.RECOVERY_STORAGE_MEMBER])

    def test_archive_scope_recomputes_from_data_without_opening_files_or_executing_commands(self):
        self.observe()
        with patch.object(installer.os, "open", side_effect=AssertionError("host file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("host process")), \
             patch.object(installer, "_runtime_command", side_effect=AssertionError("SQL/client")):
            result = self.audit()
        self.assertTrue(result["snapshotTargetStorageReviewed"])
        self.assertFalse(result["canExecute"])

    def test_self_consistent_different_target_and_outer_hashes_cannot_replace_original_intent_observation(self):
        self.observe()
        def mutate(value):
            original = value["storageOriginals"]
            target = json.loads(original["targetOriginal"])
            target["instanceArn"] = target["instanceArn"].replace("12345678-", "87654321-", 1)
            target["instance"]["arn"] = target["instanceArn"]
            original["targetOriginal"] = installer._json(target).decode()
            observation = value["originalObservation"]
            observation["snapshotStorage"] = installer._installation_storage_originals_value(
                installer._json(original), observation["docker"], observation["prerequisites"])
        with self.assertRaises(ReleaseContractError):
            self.rebuild(self.changed(mutate))

    def test_original_observation_change_even_outside_storage_is_rejected_by_intent_digest(self):
        self.observe()
        capture = self.changed(lambda value: value["originalObservation"].update(requiresHostRecheck=False))
        with self.assertRaises(ReleaseContractError):
            self.rebuild(capture)

    def test_required_scope_rejects_dropping_member_and_summary_instead_of_downgrading_to_old_format(self):
        self.observe()
        files, summary, host, _ = copy.deepcopy(self.capture)
        summary.pop("snapshotStorage")
        summary["scope"] = "pre-install-files-and-host-observations"
        payload, receipt = self.rebuild((files, summary, host))
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)
        generic = self.audit(payload, receipt, required=False)
        self.assertNotIn("snapshotTargetStorageReviewed", generic)

    def test_missing_member_with_retained_summary_or_missing_summary_with_member_is_rejected(self):
        self.observe()
        with self.assertRaises(ReleaseContractError):
            self.rebuild(self.capture[:3])
        files, summary, host, raw = copy.deepcopy(self.capture)
        summary.pop("snapshotStorage")
        with self.assertRaises(ReleaseContractError):
            self.rebuild((files, summary, host, raw))

    def test_archived_mount_bind_or_device_change_is_rejected_even_when_both_observations_agree(self):
        self.observe()
        def mutate(value):
            raw = value["storageOriginals"]["mountinfoOriginals"]
            raw[:] = [item + "90 11 0:9 / /srv/sanq/uploads rw - tmpfs tmpfs rw\n" for item in raw]
        with self.assertRaises(ReleaseContractError):
            self.rebuild(self.changed(mutate))

    def test_archived_commands_reject_wrong_database_sql_missing_extra_and_reordered_rows(self):
        self.observe()
        for mutation in (
            lambda rows: rows[1]["argv"].__setitem__(len(installer.DOCKER) + 1, "f" * 64),
            lambda rows: rows[1]["argv"].__setitem__(-1, "SELECT unrelated"),
            lambda rows: rows.pop(),
            lambda rows: rows.append(copy.deepcopy(rows[0])),
            lambda rows: rows.reverse()):
            def mutate(value):
                mutation(value["storageOriginals"]["commands"])
            with self.subTest(mutation=mutation), self.assertRaises(ReleaseContractError):
                self.rebuild(self.changed(mutate))

    def test_archived_sql_output_disagreement_and_custom_tablespace_cannot_be_self_reported(self):
        self.observe()
        def mutate(value):
            originals = value["storageOriginals"]
            for row in (originals["commands"][1], originals["commands"][3]):
                database = json.loads(row["stdout"])
                database["tablespaces"].append({"oid": "20000", "name": "extra", "location": "/outside"})
                row["stdout"] = json.dumps(database)
        with self.assertRaises(ReleaseContractError):
            self.rebuild(self.changed(mutate))
        with self.assertRaises(ReleaseContractError):
            self.rebuild(self.changed(lambda value: value["storageOriginals"].update(tablespaceEntries=["20000"])))

    def test_archived_directory_config_and_host_key_metadata_are_strict_native_integers(self):
        self.observe()
        mutations = (
            lambda original: original["directories"]["/srv/sanq/uploads"].__setitem__(0, True),
            lambda original: original["directories"]["/srv/sanq/uploads"].__setitem__(0, 2**128),
            lambda original: original["directories"]["/srv/sanq/uploads"].__setitem__(4, 0o40777),
            lambda original: original["databaseConfiguration"]["postgresql.conf"].__setitem__(8, 2),
            lambda original: original["publicHostKeyIdentity"].__setitem__(2, 1),
            lambda original: original["directories"].pop(installer.INSTALL_DB_DATA + "/pg_wal"))
        for mutation in mutations:
            with self.assertRaises(ReleaseContractError):
                self.rebuild(self.changed(lambda value: mutation(value["storageOriginals"])))

    def test_archived_public_key_or_unconfirmed_target_is_rejected(self):
        self.observe()
        def mutate(value):
            original = value["storageOriginals"]
            target = json.loads(original["targetOriginal"])
            target["operatorConfirmed"] = False
            original["targetOriginal"] = installer._json(target).decode()
        with self.assertRaises(ReleaseContractError):
            self.rebuild(self.changed(mutate))
        with self.assertRaises(ReleaseContractError):
            self.rebuild(self.changed(lambda value: value["storageOriginals"].update(
                publicHostKeyOriginal="ssh-ed25519 invalid\n")))

    def test_bad_capture_before_intent_has_no_installation_namespace_or_writer_actions(self):
        with patch.object(installer, "_installation_recovery_storage_capture",
                side_effect=ReleaseContractError("modeled capture failure")), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(self.base.phase.gate.marker.exists())
        self.assertFalse(self.base.phase.gate.namespace.exists())
        self.assertFalse(self.base.phase.actions)

    def test_target_drift_after_first_writer_action_keeps_intent_and_saved_writers_fenced(self):
        changed = []
        def drift(role, action):
            if not changed:
                changed.append(True)
                self.storage.key.write_bytes(self.storage.key.read_bytes().replace(b"model-host", b"changed-host"))
        self.base.phase.after_mutation = drift
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assert_preserved()
        self.assertFalse(self.base.directory().exists())

    def test_storage_change_during_archive_save_preserves_pair_and_does_not_return_success(self):
        write = installer._installation_recovery_write
        def late(*args):
            result = write(*args)
            if args[1] == "recovery.tar":
                self.storage.key.write_bytes(self.storage.key.read_bytes().replace(b"model-host", b"changed-host"))
            return result
        with patch.object(installer, "_installation_recovery_write", side_effect=late), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assert_preserved()
        self.assertTrue((self.base.directory() / "recovery.tar").exists())
        self.assertTrue((self.base.directory() / "recovery.json").exists())

    def test_target_scope_is_required_before_persistence_and_second_attempt_never_replays(self):
        scope = installer._installation_recovery_scope
        required = []
        def checked(*args, **kwargs):
            required.append(kwargs.get("require_target_storage"))
            return scope(*args, **kwargs)
        with patch.object(installer, "_installation_recovery_scope", side_effect=checked):
            self.observe()
        self.assertTrue(required)
        self.assertTrue(all(value is True for value in required))
        before = self.base.payload(), self.base.receipt(), len(self.base.phase.actions)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(before, (self.base.payload(), self.base.receipt(), len(self.base.phase.actions)))

    def test_old_recovery_entry_never_adds_storage_member_and_required_audit_cannot_upgrade_it(self):
        with patch.object(installer, "_installation_recovery_storage_capture", side_effect=AssertionError("new capture")), \
             patch.object(installer, "_installation_storage_snapshot", side_effect=AssertionError("new storage")):
            result = self.base.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_RECOVERY_FILES_RETAINED")
        self.assertNotIn(installer.RECOVERY_STORAGE_MEMBER, installer._installation_recovery_members(self.base.payload()))
        with self.assertRaises(ReleaseContractError):
            self.audit()
        self.assertNotIn("snapshotTargetStorageReviewed", self.audit(required=False))

    def test_recovery_storage_originals_share_existing_byte_budget_and_no_new_private_files(self):
        self.observe()
        with patch.object(installer, "MAX_RECOVERY_SOURCE_BYTES",
                self.capture[1]["capturedBytes"] + len(self.capture[2]) + len(self.capture[3]) - 1), \
             self.assertRaises(ReleaseContractError):
            self.rebuild(self.capture)
        self.assertEqual(len(installer.PRIVATE_FILES), 4)
        self.assertEqual(installer.RECOVERY_FILES, {"recovery.tar", "recovery.json"})

    def test_storage_envelope_wrong_schema_permissions_canonical_bytes_and_extra_fields_are_rejected(self):
        self.observe()
        raw = self.capture[3]
        value = json.loads(raw)
        cases = [raw + b" ", b"x" * (installer.MAX_RECOVERY_HOST_BYTES + 1),
                 installer._json({**value, "schemaVersion": True}), installer._json({**value, "canExecute": True})]
        for bad in cases:
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_storage_value(bad, value["originalObservation"]["docker"])
        with self.assertRaises(ReleaseContractError):
            self.audit(required=1)
        original = installer._json(value["storageOriginals"])
        for bad in (original + b" ", b"x" * (installer.MAX_RECOVERY_HOST_BYTES + 1)):
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_storage_capture(
                    self.capture[:3], bad, value["originalObservation"])

    def test_no_public_target_recovery_install_or_resume_cli(self):
        for command in ("target-recovery", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
