"""Recovery scope audit: real inert archives, modeled publication source, no host replay."""
import copy
import io
import json
import sys
import tarfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_recovery_retention as retention
import test_installation_recovery_material_history as history
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationRecoveryScopeTests(unittest.TestCase):
    def setUp(self):
        self.base = retention.InstallationRecoveryRetentionTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.phase.saved.materials

    def audit(self, payload=None, receipt=None):
        intent, writers, identity = self.base.originals()
        return installer._installation_recovery_scope(
            self.base.payload() if payload is None else payload,
            self.base.receipt() if receipt is None else receipt,
            intent, writers, identity, fetch=self.base.phase.gate.combined.fetch)

    def rebuild(self, capture):
        intent, writers, identity = self.base.originals()
        payload = installer._installation_recovery_payload(capture, intent, writers, identity)
        receipt = installer._installation_recovery_receipt(payload, intent, writers, identity,
                                                          installer._hash(installer._json(capture[1])))
        return payload, receipt

    def change_file(self, path, raw):
        files, summary, host = copy.deepcopy(self.base.capture)
        files[path] = raw
        proof = summary["files"][path]
        proof.update(sha256=installer._hash(raw), bytes=len(raw))
        proof["identity"][2] = len(raw)
        summary["capturedBytes"] = sum(map(len, files.values()))
        return self.rebuild((files, summary, host))

    def change_host(self, change):
        files, summary, raw = copy.deepcopy(self.base.capture)
        value = json.loads(raw)
        change(value)
        raw = installer._json(value)
        summary["hostObservations"].update(sha256=installer._hash(raw), bytes=len(raw))
        return self.rebuild((files, summary, raw))

    def test_same_flow_returns_bound_scope_summary_but_no_snapshot_or_execution_permission(self):
        result = self.base.observe()
        scope = result["installationIntent"]["recoveryFiles"]["scopeReview"]
        self.assertEqual(scope, self.audit())
        self.assertEqual(scope["outcome"], "RECOVERY_PACKAGE_SCOPE_REVIEWED")
        self.assertEqual(scope["archiveSha256"], installer._hash(self.base.payload()))
        self.assertEqual(scope["receiptSha256"], installer._hash(self.base.receipt()))
        self.assertEqual(scope["oldRuntimeMembers"], 17)
        self.assertEqual(scope["originalFiles"], 30)
        self.assertEqual(scope["originalAbsentFiles"], 15)
        self.assertEqual(scope["retainedMaterialGroups"], 1)
        self.assertTrue(scope["packageScopeReviewed"])
        for key in ("snapshotAvailable", "recoveryReady", "canExecute"):
            self.assertFalse(scope[key])
        self.assertNotIn("never_echo", json.dumps(scope))
        self.assertFalse(result["readyToInstall"])

    def test_archive_audit_replays_only_data_and_never_reads_or_mutates_live_host(self):
        self.base.observe()
        payload, receipt = self.base.payload(), self.base.receipt()
        originals = self.base.originals()
        with patch.object(installer.os, "open", side_effect=AssertionError("host file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("host command")), \
             patch.object(installer, "_docker_command", side_effect=AssertionError("docker")), \
             patch.object(installer, "_systemd_command", side_effect=AssertionError("systemd")):
            result = installer._installation_recovery_scope(payload, receipt, *originals,
                fetch=self.base.phase.gate.combined.fetch)
        self.assertTrue(result["packageScopeReviewed"])

    def test_audit_holds_both_locks_after_confirmed_freeze_before_archive_creation(self):
        original = installer._installation_recovery_scope
        def checked(*args, **kwargs):
            self.base.phase.gate.assert_locks_held()
            self.assertEqual(len(self.base.phase.actions), 6)
            self.base.assert_frozen_evidence()
            self.assertFalse(self.base.directory().exists())
            return original(*args, **kwargs)
        with patch.object(installer, "_installation_recovery_scope", side_effect=checked):
            self.base.observe()

    def test_scope_failure_preserves_frozen_evidence_without_creating_recovery_files(self):
        with patch.object(installer, "_installation_recovery_scope", side_effect=ReleaseContractError("modeled audit failure")), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.base.observe()
        self.base.assert_frozen_evidence()
        self.assertFalse(self.base.directory().exists())

    def test_all_historical_materials_are_audited_as_data(self):
        history.InstallationRecoveryMaterialHistoryTests.history(self)
        result = self.base.observe()
        scope = result["installationIntent"]["recoveryFiles"]["scopeReview"]
        self.assertEqual(scope["retainedMaterialGroups"], 2)
        self.assertEqual(scope["originalFiles"], 34)
        self.assertFalse(scope["canExecute"])

    def test_old_runtime_with_self_consistent_outer_hashes_must_match_original_archive(self):
        self.base.observe()
        payload, receipt = self.change_file("/opt/sanq/runtime/docker-compose.yml", b"inert but different Compose\n")
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_manifest_raw_bytes_must_match_original_archive_even_if_equivalent_json(self):
        self.base.observe()
        path = "/opt/sanq/runtime/runtime-release.json"
        raw = self.base.capture[0][path] + b" "
        payload, receipt = self.change_file(path, raw)
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_external_backup_original_must_match_sealed_old_source(self):
        self.base.observe()
        parts, name, _, _, _ = installer.EXTERNAL_BACKUP_FILES[0]
        payload, receipt = self.change_file("/" + "/".join((*parts, name)), b"not the original executable\n")
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_raw_application_state_cannot_disagree_with_environment_or_saved_writers(self):
        self.base.observe()
        path = "/opt/sanq/runtime/.sanq-release-state.json"
        value = json.loads(self.base.capture[0][path])
        value["current"] = "f" * 40
        payload, receipt = self.change_file(path, installer._json(value))
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_duplicate_environment_sha_and_invalid_c4_original_are_rejected(self):
        self.base.observe()
        path = "/opt/sanq/runtime/.env"
        cases = [(path, self.base.capture[0][path] + b"\nSANQ_IMAGE_SHA=" + b"f" * 40 + b"\n"),
                 ("/opt/sanq/runtime/.sanq-backup-layout-activated", b"other layout\n")]
        for path, raw in cases:
            payload, receipt = self.change_file(path, raw)
            with self.assertRaises(ReleaseContractError):
                self.audit(payload, receipt)

    def test_saved_stdout_container_configuration_cannot_be_replaced_by_self_consistent_hashes(self):
        self.base.observe()
        identifier = self.base.phase.docker.ids[0]
        def change(host):
            for row in host["commands"]:
                if row["argv"] == [*installer.DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", identifier]:
                    value = json.loads(row["stdout"])
                    value["Config"]["Env"].append("UNREVIEWED=value")
                    row["stdout"] = json.dumps(value)
        payload, receipt = self.change_host(change)
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_missing_repeat_and_extra_duplicate_observations_are_rejected(self):
        self.base.observe()
        def missing(host):
            for index, row in enumerate(host["commands"]):
                if row["argv"][:len(installer.DOCKER) + 1] == [*installer.DOCKER, "inspect"]:
                    host["commands"].pop(index)
                    return
            self.fail("expected a repeated container observation")
        for change in (missing, lambda host: host["commands"].append(copy.deepcopy(host["commands"][-1]))):
            payload, receipt = self.change_host(change)
            with self.assertRaises(ReleaseContractError):
                self.audit(payload, receipt)

    def test_distinct_command_order_does_not_depend_on_json_container_key_order(self):
        self.base.observe()
        def group(host):
            host["commands"].sort(key=lambda row: tuple(row["argv"]))
        payload, receipt = self.change_host(group)
        self.assertTrue(self.audit(payload, receipt)["packageScopeReviewed"])

    def test_bad_observation_json_is_a_fixed_contract_error(self):
        self.base.observe()
        def change(host):
            host["commands"][0]["stdout"] = "{"
        payload, receipt = self.change_host(change)
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_loaded_property_summary_and_raw_observation_must_agree(self):
        self.base.observe()
        def change(host):
            host["systemd"]["units"]["docker.service"]["ActiveState"] = "inactive"
        payload, receipt = self.change_host(change)
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_historical_record_must_still_bind_group_contents_even_when_outer_hashes_match(self):
        self.base.observe()
        directory = next(iter(self.base.capture[1]["retainedMaterialDirectories"]))
        path = directory + "/retained.json"
        value = json.loads(self.base.capture[0][path])
        value["kitSha256"] = "f" * 64
        payload, receipt = self.change_file(path, installer._json(value))
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_missing_host_member_cannot_be_promoted_from_a_file_only_package(self):
        self.base.observe()
        files, summary, _ = copy.deepcopy(self.base.capture)
        summary.pop("hostObservations")
        summary["scope"] = "pre-install-original-files-only"
        payload, receipt = self.rebuild((files, summary))
        with self.assertRaises(ReleaseContractError):
            self.audit(payload, receipt)

    def test_receipt_mismatch_and_truncated_or_extra_archive_bytes_are_rejected(self):
        self.base.observe()
        with self.assertRaises(ReleaseContractError):
            self.audit(receipt=self.base.receipt() + b" ")
        for raw in (self.base.payload()[:300], self.base.payload() + b"unexpected trailer"):
            with self.assertRaises(ReleaseContractError):
                self.audit(payload=raw)

    def test_member_reader_rejects_links_duplicates_and_oversized_declarations(self):
        for kind, duplicate, size in ((tarfile.SYMTYPE, False, 0),
                                      (tarfile.REGTYPE, True, 1),
                                      (tarfile.REGTYPE, False, installer.MAX_RECOVERY_SOURCE_BYTES + 1)):
            output = io.BytesIO()
            member = tarfile.TarInfo("unreviewed")
            member.type, member.size, member.mode = kind, size, 0o600
            if size > installer.MAX_RECOVERY_SOURCE_BYTES:
                raw = member.tobuf(format=tarfile.USTAR_FORMAT)
            else:
                with tarfile.open(fileobj=output, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                    archive.addfile(member, io.BytesIO(b"x") if size else None)
                    if duplicate:
                        archive.addfile(member, io.BytesIO(b"x"))
                raw = output.getvalue()
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_members(raw)

    def test_source_failure_in_scope_audit_is_not_a_snapshot_or_retry_permission(self):
        self.base.observe()
        intent, writers, identity = self.base.originals()
        def failed(path):
            raise ReleaseContractError("modeled publication unavailable")
        with self.assertRaises(ReleaseContractError):
            installer._installation_recovery_scope(self.base.payload(), self.base.receipt(), intent, writers, identity, fetch=failed)

    def test_original_freeze_entry_does_not_run_package_scope_audit(self):
        with patch.object(installer, "_installation_recovery_scope", side_effect=AssertionError("audit")):
            result = self.base.phase.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_FROZEN")
        self.assertFalse(self.base.directory().exists())


if __name__ == "__main__":
    unittest.main()
