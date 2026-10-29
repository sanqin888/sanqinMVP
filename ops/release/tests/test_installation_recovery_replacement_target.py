"""Replacement selection uses original recovery materials, never source-host execution."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_recovery_material_review as materials
from release_contract import ReleaseContractError


class RecoveryReplacementTargetTests(unittest.TestCase):
    def setUp(self):
        self.base = materials.RecoveryMaterialReviewTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.basis = self.base.review()
        self.source = copy.deepcopy(self.base.base.storage.target)
        self.target = copy.deepcopy(self.source)
        self.target.update(instanceArn=self.source["instanceArn"].replace("12345678-", "87654321-", 1),
                           instanceName="sanq-isolated-restore", sshTarget="ubuntu@sanq-isolated-restore")
        self.target["instance"].update(arn=self.target["instanceArn"], name=self.target["instanceName"])
        self.expected = {key: self.target[key] for key in
            ("accountId", "region", "instanceArn", "instanceName", "sshTarget", "sshHostKeySha256")}
        self.expected.update(basisSha256=self.basis["basisSha256"], indexSha256=installer._hash(installer._json(self.base.index)))

    def envelope(self):
        return {"schemaVersion": 1, "kind": "sanq-minimal-recovery-replacement-target",
            "basisSha256": self.expected["basisSha256"], "indexSha256": self.expected["indexSha256"],
            "targetOriginal": installer._json(self.target).decode("utf-8")}

    def review(self, value=None, expected=None, **kwargs):
        return installer._snapshot_recovery_replacement_review(
            kwargs.get("index_raw", installer._json(self.base.index)),
            kwargs.get("payload", self.base.payload), self.base.receipt, self.base.intent, self.base.writers,
            self.base.identity, kwargs.get("raw", installer._json(self.envelope() if value is None else value)),
            expected=self.expected if expected is None else expected, fetch=kwargs.get("fetch", self.base.fetch))

    def sync_expected(self):
        for key in ("accountId", "region", "instanceArn", "instanceName", "sshTarget", "sshHostKeySha256"):
            self.expected[key] = self.target[key]

    def test_distinct_replacement_binds_original_materials_and_selected_context(self):
        result = self.review()
        self.assertEqual(result["outcome"], "RECOVERY_REPLACEMENT_BOUND_EVIDENCE_REQUIRED")
        self.assertTrue(result["replacementTargetReviewed"])
        self.assertTrue(result["materialBindingsReviewed"])
        self.assertEqual(result["basisSha256"], self.basis["basisSha256"])
        self.assertEqual(result["replacementTarget"]["instanceArn"], self.target["instanceArn"])
        self.assertEqual(result["sourceInstanceArn"], self.source["instanceArn"])
        self.assertEqual(result["requiredEvidence"], list(installer.RECOVERY_REQUIRED_EVIDENCE))

    def test_no_target_review_claims_isolation_lineage_ssh_authentication_or_recovery(self):
        result = self.review()
        for key in ("cloudIsolationProven", "snapshotLineageProven", "sshEndpointIndependentlyAuthenticated",
                    "replacementHostObserved", "restoreProven", "snapshotAvailable", "recoveryReady",
                    "readyToInstall", "canExecute", "authorizedToMutateProduction", "awsOriginAuthenticated", "trustedTimeProven"):
            self.assertIs(result[key], False, key)
        for key in ("requiresIndependentSshVerification", "requiresIsolatedRestoreEvidence", "requiresHostRecheck"):
            self.assertIs(result[key], True, key)

    def test_exact_source_instance_is_rejected_before_any_source_fetch(self):
        self.target = copy.deepcopy(self.source)
        self.sync_expected()
        with self.assertRaises(ReleaseContractError):
            self.review(fetch=lambda _: self.fail("target exclusion must precede source fetch"))

    def test_source_arn_cannot_be_hidden_by_a_different_name(self):
        self.target["instanceArn"] = self.source["instanceArn"]
        self.target["instance"]["arn"] = self.source["instanceArn"]
        self.sync_expected()
        with self.assertRaises(ReleaseContractError):
            self.review()

    def test_source_name_reused_for_another_arn_requires_a_different_explicit_replacement(self):
        self.target["instanceName"] = self.source["instanceName"]
        self.target["instance"]["name"] = self.source["instanceName"]
        self.sync_expected()
        with self.assertRaises(ReleaseContractError):
            self.review()

    def test_source_ssh_route_cannot_be_reused_even_with_a_new_cloud_identity(self):
        self.target["sshTarget"] = self.source["sshTarget"]
        self.sync_expected()
        with self.assertRaisesRegex(ReleaseContractError, "source route"):
            self.review()

    def test_cloned_public_host_key_is_not_mistaken_for_proof_of_source_or_new_identity(self):
        self.assertEqual(self.target["sshHostKeySha256"], self.source["sshHostKeySha256"])
        result = self.review()
        self.assertTrue(result["requiresIndependentSshVerification"])
        self.assertFalse(result["sshEndpointIndependentlyAuthenticated"])

    def test_every_independently_selected_context_field_must_match(self):
        for key in self.expected:
            expected = {**self.expected, key: "different"}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.review(expected=expected, fetch=lambda _: self.fail("context mismatch must precede fetch"))

    def test_expected_context_has_exact_bounded_native_string_fields(self):
        for value in (None, {}, {**self.expected, "canExecute": True},
                      {**self.expected, "instanceName": True}, {**self.expected, "sshTarget": ""},
                      {**self.expected, "instanceName": "x" * 257}):
            with self.subTest(value=type(value).__name__), self.assertRaises(ReleaseContractError):
                self.review(expected=value if value is not None else False)

    def test_replacement_digests_cannot_select_other_index_or_fabricated_basis(self):
        with self.assertRaises(ReleaseContractError):
            self.review(index_raw=installer._json({**self.base.index, "intentSha256": "f" * 64}))
        self.expected["basisSha256"] = "f" * 64
        with self.assertRaisesRegex(ReleaseContractError, "basis differs"):
            self.review()

    def test_original_recovery_material_tampering_cannot_be_hidden_by_a_target_plan(self):
        with self.assertRaises(ReleaseContractError):
            self.review(payload=self.base.payload + b"changed")

    def test_canonical_input_limits_duplicates_constants_and_native_schema_are_enforced(self):
        raw = installer._json(self.envelope())
        for bad in (b"", b"x" * 131073, "not bytes", raw + b" ", b"\xff", b'{"value":NaN}\n',
                    raw.replace(b'{"basisSha256":', b'{"schemaVersion":1,"basisSha256":', 1)):
            with self.subTest(kind=type(bad).__name__), self.assertRaises(ReleaseContractError):
                self.review(raw=bad)
        for change in ({"schemaVersion": True}, {"kind": "PASS"}, {"canExecute": True},
                       {"basisSha256": None}, {"targetOriginal": {}}, {"targetOriginal": chr(0xD800)}, {"indexSha256": "a" * 63}):
            with self.subTest(change=change), self.assertRaises(ReleaseContractError):
                self.review({**self.envelope(), **change})

    def test_target_original_is_strict_canonical_inventory_not_success_assertions(self):
        for change in ({"operatorConfirmed": False}, {"operatorConfirmed": 1},
                       {"canExecute": True}, {"sshTarget": "host;command"},
                       {"sshHostKeySha256": "unverified"}, {"linuxSystemDisk": "/dev/../etc/passwd"}):
            target = {**self.target, **change}
            with self.subTest(change=change), self.assertRaises(ReleaseContractError):
                self.review({**self.envelope(), "targetOriginal": installer._json(target).decode()})
        with self.assertRaises(ReleaseContractError):
            self.review({**self.envelope(), "targetOriginal": installer._json(self.target).decode() + " "})

    def test_cross_account_or_region_is_outside_the_current_recovery_scope(self):
        for account, region in (("999999999999", "ca-central-1"), ("123456789012", "us-east-1")):
            target = copy.deepcopy(self.target)
            target.update(accountId=account, region=region)
            target["instanceArn"] = "arn:aws:lightsail:" + region + ":" + account + ":Instance/87654321-1234-1234-1234-123456789012"
            target["instance"].update(arn=target["instanceArn"],
                location={"regionName": region, "availabilityZone": region + "a"})
            expected = {**self.expected, **{key: target[key] for key in ("accountId", "region", "instanceArn")}}
            with self.subTest(region=region, account=account), self.assertRaises(ReleaseContractError):
                self.review({**self.envelope(), "targetOriginal": installer._json(target).decode()}, expected=expected)

    def test_single_system_disk_inventory_and_original_capacity_remain_required(self):
        original = copy.deepcopy(self.target)
        for disks in ([], original["instance"]["hardware"]["disks"] * 2,
                      [{**original["instance"]["hardware"]["disks"][0], "isAttached": False}],
                      [{**original["instance"]["hardware"]["disks"][0], "sizeInGb": 81}]):
            self.target = copy.deepcopy(original)
            self.target["instance"]["hardware"]["disks"] = disks
            with self.subTest(disks=len(disks)), self.assertRaises(ReleaseContractError):
                self.review()

    def test_new_device_name_and_availability_zone_do_not_require_source_physical_identity(self):
        self.target["linuxSystemDisk"] = "/dev/nvme1n1"
        self.target["instance"]["location"]["availabilityZone"] = "ca-central-1b"
        self.target["instance"]["hardware"]["disks"][0]["path"] = "/dev/sda"
        result = self.review()
        self.assertEqual(result["replacementTarget"]["availabilityZone"], "ca-central-1b")
        self.assertEqual(result["replacementTarget"]["linuxSystemDisk"], "/dev/nvme1n1")
        self.assertFalse(result["replacementHostObserved"])

    def test_review_has_no_host_io_commands_or_ssh_connection(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("host file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("host write")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            self.assertTrue(self.review()["replacementTargetReviewed"])

    def test_projection_excludes_raw_cloud_metadata_credentials_and_archived_bytes(self):
        self.target["instance"]["operatorNote"] = "DO_NOT_ECHO_PRIVATE_NOTE"
        result = self.review()
        raw = json.dumps(result)
        for forbidden in ("DO_NOT_ECHO_PRIVATE_NOTE", "targetOriginal", "publicHostKeyOriginal",
                          "POSTGRES_PASSWORD", "MODEL_TOKEN=", "recovery.tar"):
            self.assertNotIn(forbidden, raw)
        self.assertEqual(result["replacementTarget"]["targetInputSha256"], installer._hash(installer._json(self.target)))

    def test_review_is_deterministic_does_not_mutate_inputs_and_requires_real_evidence(self):
        before = copy.deepcopy((self.target, self.expected, self.base.index))
        self.assertEqual(self.review(), self.review())
        self.assertEqual(before, (self.target, self.expected, self.base.index))
        with self.assertRaises(ReleaseContractError):
            self.review(fetch=lambda _: (_ for _ in ()).throw(ReleaseContractError("source unavailable")))
