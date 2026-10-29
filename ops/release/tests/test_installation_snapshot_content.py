"""Snapshot content comparison and the original locked flow; no AWS or production operations."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_snapshot_wait as wait
import test_installation_storage_recovery_binding as binding
from release_contract import ReleaseContractError


class SnapshotContentValueTests(unittest.TestCase):
    def setUp(self):
        self.storage = {"localSystemDiskCoverageObserved": True, "defaultTablespacesOnly": True,
            "observationSha256": "a" * 64,
            "target": {"accountId": "123456789012", "region": "ca-central-1",
                "instanceArn": "arn:aws:lightsail:ca-central-1:123456789012:Instance/12345678-1234-1234-1234-123456789012",
                "instanceName": "sanq-production", "availabilityZone": "ca-central-1a",
                "cloudSystemDiskSizeInGb": 80, "targetInputSha256": "b" * 64}}
        base = wait.InstallationSnapshotWaitTests().request()
        with patch.object(installer, "_snapshot_utc_now", return_value="2026-10-29T10:00:00.000000Z"):
            self.request = installer._snapshot_content_request(base, self.storage)
        self.evidence = self.evidence_for(self.request, self.storage["target"])

    @staticmethod
    def evidence_for(request, target, timestamp="2026-10-29T10:00:02.000000Z"):
        arn = "arn:aws:lightsail:" + target["region"] + ":" + target["accountId"] + ":InstanceSnapshot/87654321-4321-4321-4321-210987654321"
        return {"schemaVersion": 1, "kind": "sanq-minimal-manual-snapshot-content",
            "instanceSnapshot": {"arn": arn, "name": request["expectedSnapshotName"], "createdAt": timestamp,
                "location": {"regionName": target["region"], "availabilityZone": "all"},
                "resourceType": "InstanceSnapshot", "state": "available", "fromAttachedDisks": [],
                "fromInstanceArn": target["instanceArn"], "fromInstanceName": target["instanceName"],
                "isFromAutoSnapshot": False, "sizeInGb": target["cloudSystemDiskSizeInGb"]},
            "operatorVerification": {"method": "operator-authenticated-aws-session",
                **{key: target[key] for key in ("accountId", "region", "instanceArn")}, "snapshotArn": arn,
                "authenticatedAwsSession": True, "createdAfterChallenge": True, "availableObservedAt": timestamp}}

    @staticmethod
    def reply(request, evidence):
        keys = ("installationId", "intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "challenge")
        return installer._json({"schemaVersion": 1, "kind": "sanq-minimal-snapshot-evidence-reply",
            **{key: request[key] for key in keys}, "evidence": evidence})

    def validate(self, evidence=None, *, request=None, storage=None, sent="2026-10-29T10:00:01.000000Z",
                 received="2026-10-29T10:00:04.000000Z"):
        request = self.request if request is None else request
        return installer._installation_snapshot_content_value(
            self.reply(request, self.evidence if evidence is None else evidence), request,
            self.storage if storage is None else storage, request_sent_at=sent, reply_received_at=received)

    def test_available_manual_content_is_validated_without_install_recovery_cloud_or_time_authority(self):
        result = self.validate()
        self.assertTrue(result["snapshotContentValidated"])
        self.assertTrue(result["snapshotEvidenceValidated"])
        self.assertTrue(result["operatorObservedAvailable"])
        self.assertTrue(result["requiresDurableSnapshotReceipt"])
        self.assertTrue(result["requiresRecoveryValidation"])
        self.assertTrue(result["requiresHostRecheck"])
        for key in ("awsOriginAuthenticated", "trustedTimeProven", "restoreProven", "snapshotAvailable", "recoveryReady", "canExecute"):
            self.assertFalse(result[key])
        self.assertEqual(result["targetStorageSha256"], self.storage["observationSha256"])

    def test_snapshot_all_zone_and_exact_source_zone_are_separately_preserved(self):
        for zone in ("all", "ca-central-1a"):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"]["location"]["availabilityZone"] = zone
            result = self.validate(value)
            self.assertEqual(result["snapshotAvailabilityZone"], zone)
            self.assertEqual(result["sourceAvailabilityZone"], "ca-central-1a")

    def test_every_required_snapshot_field_must_be_present_and_non_null(self):
        for key in self.evidence["instanceSnapshot"]:
            for remove in (True, False):
                value = copy.deepcopy(self.evidence)
                if remove:
                    del value["instanceSnapshot"][key]
                else:
                    value["instanceSnapshot"][key] = None
                with self.subTest(key=key, remove=remove), self.assertRaises(ReleaseContractError):
                    self.validate(value)

    def test_pending_error_progress_or_self_reported_success_cannot_replace_available(self):
        for state in ("pending", "error", "AVAILABLE", True, 1):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"].update(state=state, progress="100%", snapshotAvailable=True)
            with self.subTest(state=state), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_snapshot_arn_account_region_type_and_full_uuid_must_match(self):
        original = self.evidence["instanceSnapshot"]["arn"]
        for arn in (original.replace("123456789012", "999999999999"), original.replace("ca-central-1", "us-east-1"),
                    original.replace("InstanceSnapshot/", "Instance/"), original + "/extra",
                    original.replace("87654321-", "8765432G-"), "", True):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"]["arn"] = arn
            value["operatorVerification"]["snapshotArn"] = arn
            with self.subTest(arn=arn), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_same_name_wrong_source_arn_and_wrong_resource_type_are_rejected(self):
        for key, wrong in (("fromInstanceArn", self.storage["target"]["instanceArn"].replace("12345678-", "87654321-")),
                           ("fromInstanceName", "another-instance"), ("resourceType", "DiskSnapshot")):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"][key] = wrong
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_full_challenge_name_and_native_false_manual_marker_are_required(self):
        for key, wrong in (("name", self.request["expectedSnapshotName"][:-1]), ("name", "sanq-runtime-old"),
                           ("isFromAutoSnapshot", True), ("isFromAutoSnapshot", 0), ("isFromAutoSnapshot", "false")):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"][key] = wrong
            with self.subTest(key=key, wrong=wrong), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_explicit_empty_attached_disks_and_exact_native_integer_size_are_required(self):
        for key, wrong in (("fromAttachedDisks", None), ("fromAttachedDisks", {}), ("fromAttachedDisks", [{}]),
                           ("sizeInGb", True), ("sizeInGb", 80.0), ("sizeInGb", "80"), ("sizeInGb", 81)):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"][key] = wrong
            with self.subTest(key=key, wrong=wrong), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_snapshot_location_cannot_use_all_to_bypass_region_or_other_zone_mismatch(self):
        for location in ({}, None, {"regionName": "us-east-1", "availabilityZone": "all"},
                         {"regionName": "ca-central-1", "availabilityZone": "ca-central-1b"},
                         {"regionName": "ca-central-1", "availabilityZone": ["all"]}):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"]["location"] = location
            with self.subTest(location=location), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_content_schema_extra_authority_fields_and_wrong_shapes_are_rejected(self):
        for key, wrong in (("schemaVersion", True), ("kind", "other"), ("canExecute", True),
                           ("operatorVerification", []), ("instanceSnapshot", [])):
            value = copy.deepcopy(self.evidence)
            value[key] = wrong
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_operator_confirmation_is_explicit_native_true_with_exact_fields(self):
        for key, wrong in (("authenticatedAwsSession", 1), ("authenticatedAwsSession", False),
                           ("createdAfterChallenge", 1), ("createdAfterChallenge", False),
                           ("method", "self-reported"), ("canExecute", True)):
            value = copy.deepcopy(self.evidence)
            value["operatorVerification"][key] = wrong
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.validate(value)
        for key in self.evidence["operatorVerification"]:
            value = copy.deepcopy(self.evidence)
            del value["operatorVerification"][key]
            with self.subTest(missing=key), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_operator_identity_must_independently_name_the_bound_account_region_instance_and_snapshot(self):
        for key in ("accountId", "region", "instanceArn", "snapshotArn"):
            value = copy.deepcopy(self.evidence)
            value["operatorVerification"][key] = "wrong"
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_timestamp_offsets_and_microseconds_normalize_to_one_utc_representation(self):
        value = copy.deepcopy(self.evidence)
        value["instanceSnapshot"]["createdAt"] = "2026-10-29T06:00:02.123456-04:00"
        value["operatorVerification"]["availableObservedAt"] = "2026-10-29T10:00:03+00:00"
        result = self.validate(value)
        self.assertEqual(result["createdAt"], "2026-10-29T10:00:02.123456Z")
        self.assertEqual(result["availableObservedAt"], "2026-10-29T10:00:03.000000Z")

    def test_timestamp_type_zone_precision_invalid_calendar_and_nonfinite_values_are_rejected(self):
        invalid = ("2026-10-29T10:00:02", "2026-10-29 10:00:02Z", "2026-02-30T10:00:02Z",
                   "2026-10-29T10:00:60Z", "2026-10-29T10:00:02.1234567Z", "2026-10-29T10:00:02-00:00",
                   "2026-10-29T10:00:02+00:60", "2026-10-29T10:00:02+24:00",
                   1793268002, 1793268002.1, True, None, float("nan"), float("inf"))
        for timestamp in invalid:
            with self.subTest(timestamp=timestamp), self.assertRaises(ReleaseContractError):
                installer._snapshot_timestamp(timestamp)

    def test_created_before_full_output_observed_before_create_or_after_reply_is_rejected(self):
        for created, observed in (("2026-10-29T10:00:00Z", "2026-10-29T10:00:03Z"),
                                  ("2026-10-29T10:00:03Z", "2026-10-29T10:00:02Z"),
                                  ("2026-10-29T10:00:02Z", "2026-10-29T10:00:05Z")):
            value = copy.deepcopy(self.evidence)
            value["instanceSnapshot"]["createdAt"] = created
            value["operatorVerification"]["availableObservedAt"] = observed
            with self.subTest(created=created, observed=observed), self.assertRaises(ReleaseContractError):
                self.validate(value)
        with self.assertRaises(ReleaseContractError):
            self.validate(sent="2026-10-29T09:59:59Z")
        with self.assertRaises(ReleaseContractError):
            self.validate(received="2026-10-29T09:59:59Z")

    def test_request_cannot_replace_prebound_target_storage_or_challenge_name(self):
        for key, wrong in (("targetInputSha256", "0" * 64), ("targetStorageSha256", "0" * 64),
                           ("expectedTarget", {}), ("expectedSnapshotName", "old"), ("reviewMode", "unverified"),
                           ("challenge", "x" * 64)):
            request = {**self.request, key: wrong}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.validate(request=request)

    def test_missing_storage_coverage_does_not_accept_snapshot_reply_as_a_new_target(self):
        for key in ("localSystemDiskCoverageObserved", "defaultTablespacesOnly"):
            storage = {**self.storage, key: False}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.validate(storage=storage)

    def test_comparison_has_no_file_process_or_persistence_access(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("fsync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            self.assertTrue(self.validate()["snapshotContentValidated"])

    def test_optional_aws_metadata_is_hashed_but_not_echoed_and_inputs_are_not_modified(self):
        evidence = copy.deepcopy(self.evidence)
        evidence["instanceSnapshot"]["supportCode"] = "PRIVATE_METADATA_NEVER_ECHO"
        before = copy.deepcopy((evidence, self.request, self.storage))
        result = self.validate(evidence)
        self.assertNotIn("PRIVATE_METADATA_NEVER_ECHO", json.dumps(result))
        self.assertEqual((evidence, self.request, self.storage), before)
        self.assertEqual(result["evidenceSha256"], installer._hash(installer._json(evidence)))


class SnapshotContentOwnedFlowTests(unittest.TestCase):
    def setUp(self):
        self.binding = binding.InstallationStorageRecoveryBindingTests()
        self.binding.setUp()
        self.addCleanup(self.binding.doCleanups)
        self.wait = wait.InstallationSnapshotWaitTests()
        self.wait.base = self.binding.base
        self.wait.errors = []
        self.addCleanup(self.wait.doCleanups)

    def reply(self, request):
        evidence = SnapshotContentValueTests.evidence_for(request,
            installer._installation_snapshot_target(self.binding.storage.raw()), installer._snapshot_utc_now())
        return SnapshotContentValueTests.reply(request, evidence)

    def observe(self, respond=None, exchange=None):
        incoming, sender, receiver, outgoing = self.wait.pipes()
        thread = requests = None
        if exchange is None:
            thread, requests = self.wait.peer(sender, receiver, self.reply if respond is None else respond)
        with patch.object(installer, "_retain_installation_target_storage",
                side_effect=lambda identity, target, **kwargs: installer._review_installation_snapshot_content(
                    identity, target, input_fd=incoming, output_fd=outgoing, **kwargs)):
            if exchange is None:
                try:
                    return self.binding.observe(), requests
                finally:
                    thread.join(1)
                    self.assertFalse(thread.is_alive())
                    self.assertFalse(self.wait.errors)
            with patch.object(installer, "_installation_snapshot_exchange", side_effect=exchange):
                return self.binding.observe(), requests

    def test_complete_locked_flow_waits_after_durable_bound_pair_then_validates_content_without_new_disk_ticket(self):
        def respond(request):
            self.binding.base.phase.gate.assert_locks_held()
            self.wait.assert_retained_fence()
            self.assertTrue(self.binding.audit()["snapshotTargetStorageReviewed"])
            self.assertEqual(request["expectedTarget"]["instanceArn"], self.binding.storage.arn)
            self.assertEqual(request["expectedSnapshotName"], "sanq-runtime-" + request["challenge"])
            self.assertEqual(len(self.binding.base.phase.actions), 6)
            return self.reply(request)
        result, requests = self.observe(respond)
        self.assertEqual(result["outcome"], "INSTALLATION_SNAPSHOT_CONTENT_VALIDATED")
        reviewed = result["installationIntent"]["snapshotReview"]
        self.assertTrue(reviewed["snapshotContentValidated"])
        self.assertTrue(result["snapshotStorageBoundToIntent"])
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(reviewed["snapshotAvailable"])
        self.assertFalse(reviewed["recoveryReady"])
        self.assertFalse(reviewed["canExecute"])
        self.assertEqual(len(requests), 1)
        self.assertEqual(set(p.name for p in self.binding.base.directory().iterdir()), installer.RECOVERY_FILES)
        self.assertNotIn("ORIGINAL_TARGET_NOTE_NEVER_ECHO", json.dumps(result))
        self.binding.assert_preserved()

    def test_bad_content_preserves_original_fences_pair_and_cannot_be_replayed(self):
        def respond(request):
            value = json.loads(self.reply(request))
            value["evidence"]["instanceSnapshot"]["fromInstanceName"] = "wrong"
            return installer._json(value)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(respond)
        self.wait.assert_retained_fence()
        count = len(self.binding.base.phase.actions)
        with self.assertRaises(ReleaseContractError):
            self.observe(exchange=lambda *args, **kwargs: self.fail("replayed wait"))
        self.assertEqual(len(self.binding.base.phase.actions), count)

    def test_live_target_storage_change_during_wait_is_rejected_after_pair_is_saved(self):
        def respond(request):
            value = self.reply(request)
            self.binding.storage.mounts += b"13 11 0:99 / /srv/sanq/uploads rw - ext4 /dev/other rw\n"
            return value
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(respond)
        self.wait.assert_retained_fence()
        self.binding.assert_preserved()

    def test_missing_complete_output_observation_cannot_claim_challenge_creation_order(self):
        def exchange(request, *args, **kwargs):
            return self.reply(request)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(exchange=exchange)
        self.wait.assert_retained_fence()

    def test_new_flow_requires_target_storage_in_every_scope_review_before_and_after_wait(self):
        original = installer._installation_recovery_scope
        calls = []
        def scope(*args, **kwargs):
            calls.append(kwargs.get("require_target_storage"))
            return original(*args, **kwargs)
        with patch.object(installer, "_installation_recovery_scope", side_effect=scope):
            result, _ = self.observe()
        self.assertTrue(result["installationIntent"]["snapshotReview"]["snapshotContentValidated"])
        self.assertGreaterEqual(len(calls), 3)
        self.assertTrue(all(flag is True for flag in calls))


class SnapshotChallengeOutputTests(unittest.TestCase):
    def test_full_output_callback_runs_once_after_actual_partial_writes_before_reply_read(self):
        channel = wait.InstallationSnapshotWaitTests()
        channel.errors = []
        self.addCleanup(channel.doCleanups)
        incoming, sender, receiver, outgoing = channel.pipes()
        request = channel.request()
        thread, _ = channel.peer(sender, receiver)
        actual_write, actual_read = os.write, os.read
        written, callbacks = bytearray(), []
        def short(fd, raw):
            count = actual_write(fd, raw[:7])
            if fd == outgoing:
                written.extend(raw[:count])
            return count
        def sent():
            self.assertEqual(bytes(written), installer._json(request))
            callbacks.append(True)
        def read(fd, count):
            if fd == incoming:
                self.assertEqual(callbacks, [True])
            return actual_read(fd, count)
        with patch.object(installer.os, "write", side_effect=short), patch.object(installer.os, "read", side_effect=read):
            installer._installation_snapshot_exchange(request, incoming, outgoing,
                deadline=installer.time.monotonic() + 5, _request_sent=sent)
        thread.join(1)
        self.assertFalse(thread.is_alive())
        self.assertFalse(channel.errors)
        self.assertEqual(callbacks, [True])
