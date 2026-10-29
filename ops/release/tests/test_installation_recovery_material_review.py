"""Recovery material association: pre-snapshot originals, no claim of physical restore."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_storage_recovery_binding as binding
import test_installation_offhost_index_receiver as receiver
import test_installation_offhost_confirmation as confirmation
from release_contract import ReleaseContractError


class RecoveryMaterialReviewTests(unittest.TestCase):
    def setUp(self):
        self.base = binding.InstallationStorageRecoveryBindingTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.observation = self.base.observe()
        self.intent, self.writers, self.identity = self.base.base.originals()
        self.payload, self.receipt = self.base.base.payload(), self.base.base.receipt()
        self.fetch = self.base.combined.fetch
        recorded = installer._installation_record_value(self.intent, self.identity)
        target = self.observation["snapshotStorage"]["target"]
        self.index = receiver.index_fixture()
        self.index.update(installationId=self.identity, retentionId=recorded["retentionId"],
            targetSourceSha=recorded["targetSourceSha"], installedRuntimeSourceSha=recorded["installedRuntimeSourceSha"],
            intentSha256=installer._hash(self.intent), writersSha256=installer._hash(self.writers),
            archiveSha256=installer._hash(self.payload), receiptSha256=installer._hash(self.receipt),
            targetInputSha256=target["targetInputSha256"],
            targetStorageSha256=self.observation["snapshotStorage"]["observationSha256"],
            accountId=target["accountId"], region=target["region"], fromInstanceArn=target["instanceArn"],
            fromInstanceName=target["instanceName"], sourceAvailabilityZone=target["availabilityZone"],
            transactionPath="/opt/sanq/deploy-state/installation-runs/" + self.identity,
            retentionPath="/opt/sanq/deploy-state/installations/" + recorded["retentionId"])

    def review(self, index=None, **kwargs):
        return installer._snapshot_recovery_material_review(
            installer._json(self.index if index is None else index),
            kwargs.get("payload", self.payload), kwargs.get("receipt", self.receipt),
            kwargs.get("intent", self.intent), kwargs.get("writers", self.writers),
            kwargs.get("identity", self.identity), fetch=kwargs.get("fetch", self.fetch))

    def test_complete_material_binding_reports_exact_basis_and_still_requires_real_restore_evidence(self):
        result = self.review()
        self.assertEqual(result["outcome"], "RECOVERY_MATERIALS_BOUND_EVIDENCE_REQUIRED")
        self.assertTrue(result["materialBindingsReviewed"])
        self.assertTrue(result["requiresIsolatedRestoreEvidence"])
        self.assertEqual(result["requiredEvidence"], list(installer.RECOVERY_REQUIRED_EVIDENCE))
        self.assertEqual(len(result["requiredEvidence"]), 5)
        self.assertEqual(result["basisSha256"], installer._hash(installer._json(result["basis"])))
        for key in ("restoreProven", "snapshotAvailable", "recoveryReady", "readyToInstall",
                    "canExecute", "authorizedToMutateProduction", "awsOriginAuthenticated", "trustedTimeProven"):
            self.assertFalse(result[key])

    def test_pre_snapshot_materials_do_not_require_later_vm_review_or_confirmation_receipts(self):
        directory = self.base.base.directory().parent
        self.assertFalse((directory / installer.SNAPSHOT_REVIEW_FILE).exists())
        self.assertFalse((directory / installer.SNAPSHOT_OFFHOST_FILE).exists())
        result = self.review()
        self.assertFalse(result["postSnapshotReceiptsRequired"])
        self.assertFalse(result["postSnapshotReviewDigestRecomputed"])
        self.assertEqual(result["snapshotLocatorSource"], "operator-retained-offhost-index")
        self.assertNotIn("snapshotReviewSha256", result["basis"])

    def test_source_database_image_version_history_storage_and_application_are_derived_from_originals(self):
        basis = self.review()["basis"]
        original = self.observation
        self.assertEqual(basis["applicationSha"], original["applicationSha"])
        self.assertEqual(basis["sourceDatabaseImageId"], original["docker"]["containers"]["db"]["imageId"])
        self.assertEqual(basis["sourceDatabaseIdentity"], original["prerequisites"]["databaseIdentity"])
        self.assertEqual(basis["sourceMigrationHistorySha256"], original["prerequisites"]["migrationHistorySha256"])
        self.assertEqual(basis["sourceSystemPython"], original["prerequisites"]["systemPython"])
        self.assertEqual(basis["persistentPaths"], list(installer.INSTALL_STORAGE_DIRECTORIES))
        self.assertEqual(basis["oldRuntimeMembers"], 17)
        self.assertEqual(basis["storageOriginalsSha256"], installer._hash(self.base.capture[3]))

    def test_index_material_digest_mismatch_is_rejected_before_source_fetch(self):
        def fetch(path):
            self.fail("source fetch must not precede the original byte binding")
        for key in ("intentSha256", "writersSha256", "archiveSha256", "receiptSha256"):
            value = {**self.index, key: "f" * 64}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.review(value, fetch=fetch)

    def test_retention_source_and_installation_identity_must_match_original_intent(self):
        for key, wrong in (("retentionId", "f" * 64), ("targetSourceSha", "f" * 40),
                           ("installedRuntimeSourceSha", "f" * 40), ("installationId", "f" * 64)):
            value = {**self.index, key: wrong}
            if key == "retentionId":
                value["retentionPath"] = "/opt/sanq/deploy-state/installations/" + wrong
            if key == "installationId":
                value["transactionPath"] = "/opt/sanq/deploy-state/installation-runs/" + wrong
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.review(value)

    def test_same_name_wrong_instance_arn_or_storage_target_digest_cannot_be_substituted(self):
        for key, wrong in (("fromInstanceArn", self.index["fromInstanceArn"].replace("12345678-", "87654321-")),
                           ("fromInstanceName", "another-instance"), ("targetInputSha256", "f" * 64),
                           ("targetStorageSha256", "f" * 64), ("sourceAvailabilityZone", "ca-central-1b")):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.review({**self.index, key: wrong})

    def test_self_consistent_old_scope_without_storage_is_never_accepted_as_recovery_material_basis(self):
        files, summary, host, _ = copy.deepcopy(self.base.capture)
        summary.pop("snapshotStorage")
        summary["scope"] = "pre-install-files-and-host-observations"
        payload, receipt = self.base.rebuild((files, summary, host))
        index = {**self.index, "archiveSha256": installer._hash(payload), "receiptSha256": installer._hash(receipt)}
        with self.assertRaises(ReleaseContractError):
            self.review(index, payload=payload, receipt=receipt)

    def test_scope_must_explicitly_review_target_storage_and_cannot_silently_downgrade(self):
        with patch.object(installer, "_installation_recovery_scope", return_value={"packageScopeReviewed": True}), \
             self.assertRaises(ReleaseContractError):
            self.review()

    def test_saved_success_booleans_do_not_grant_restore_or_execution_authority(self):
        for key in ("restoreProven", "recoveryReady", "canExecute", "snapshotAvailable"):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.review({**self.index, key: True})
        result = self.review()
        self.assertTrue(result["materialBindingsReviewed"])
        self.assertFalse(result["restoreProven"])
        self.assertFalse(result["recoveryReady"])

    def test_original_material_type_limits_identity_and_fetch_port_are_checked_before_hashing(self):
        for kwargs in ({"payload": "not bytes"}, {"receipt": b""}, {"intent": None}, {"writers": b""},
                       {"identity": True}, {"fetch": None}):
            with self.subTest(keys=list(kwargs)), self.assertRaises(ReleaseContractError):
                self.review(**kwargs)
        with patch.object(installer, "MAX_RECOVERY_ARCHIVE_BYTES", 1), self.assertRaises(ReleaseContractError):
            self.review()

    def test_unavailable_source_review_is_not_replaced_by_self_consistent_local_hashes(self):
        def unavailable(path):
            raise ReleaseContractError("modeled source unavailable")
        with self.assertRaises(ReleaseContractError):
            self.review(fetch=unavailable)

    def test_data_review_never_opens_host_files_or_executes_archived_commands(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("host file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("fsync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            self.assertTrue(self.review()["materialBindingsReviewed"])

    def test_basis_does_not_echo_credentials_target_notes_raw_env_or_host_command_output(self):
        result = self.review()
        raw = json.dumps(result)
        for secret in ("MODEL_TOKEN=", "ORIGINAL_TARGET_NOTE_NEVER_ECHO", "publicHostKeyOriginal",
                       "commands", "POSTGRES_PASSWORD", "replyOriginal"):
            self.assertNotIn(secret, raw)
        self.assertLessEqual(len(installer._json(result["basis"])), installer.MAX_INSTALL_RECORD)

    def test_review_does_not_mutate_index_or_materials_and_basis_hash_is_repeatable(self):
        before = copy.deepcopy(self.index)
        first, second = self.review(), self.review()
        self.assertEqual(self.index, before)
        self.assertEqual(first, second)
        self.assertTrue(first["requiresHostRecheck"])
        self.assertTrue(first["sourceReviewUsesFetchPort"])


class RecoveryMaterialOwnedFlowTests(unittest.TestCase):
    def setUp(self):
        self.base = confirmation.OffhostConfirmationTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)

    def test_same_owned_flow_adds_review_after_both_vm_receipts_and_still_has_no_ready_permission(self):
        original = installer._snapshot_recovery_material_review
        checked = []
        def review(*args, **kwargs):
            self.base.retention.phase.gate.assert_locks_held()
            self.assertTrue(self.base.path().exists())
            self.assertTrue(self.base.base.record_path().exists())
            checked.append(True)
            return original(*args, **kwargs)
        with patch.object(installer, "_snapshot_recovery_material_review", side_effect=review):
            result = self.base.observe()
        facts = result["installationIntent"]["snapshotReview"]
        self.assertEqual(checked, [True])
        self.assertTrue(facts["offHostRetentionConfirmed"])
        self.assertTrue(facts["recoveryMaterialReview"]["materialBindingsReviewed"])
        self.assertFalse(facts["recoveryReady"])
        self.assertFalse(facts["recoveryMaterialReview"]["recoveryReady"])
        self.assertFalse(result["readyToInstall"])

    def test_material_review_failure_preserves_both_vm_receipts_and_frozen_originals(self):
        with patch.object(installer, "_snapshot_recovery_material_review",
                side_effect=ReleaseContractError("modeled material/source review failed")), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.assertTrue(self.base.path().exists())
        self.assertTrue(self.base.base.record_path().exists())
        self.base.assert_preserved()

    def test_post_review_storage_drift_is_caught_by_final_fresh_context_without_automatic_restart(self):
        original = installer._snapshot_recovery_material_review
        def drift(*args, **kwargs):
            result = original(*args, **kwargs)
            self.base.base.flow.binding.storage.mounts += b"13 11 0:99 / /srv/sanq/uploads rw - ext4 /dev/other rw\n"
            return result
        with patch.object(installer, "_snapshot_recovery_material_review", side_effect=drift), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.assertTrue(self.base.path().exists())
        self.base.assert_preserved()
