"""C5-G2-B2B7 guest Gate0/1 claim-contract tests: no host calls."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import disposable_guest_gate01_contract as gate  # noqa: E402


def claimed_isolated_guest():
    return {
        "schemaVersion": 1,
        "kind": "c5-g2b2b7-claimed-guest-inventory-v1",
        "guest": {
            "hypervisor": "virtualbox",
            "uuid": "01234567-89ab-4cde-8f01-23456789abcd",
            "snapshotName": "SanQ-Clean-Baseline",
            "snapshotExistsClaimed": True,
        },
        "identity": {
            "operatorUid": 1000,
            "operatorGid": 1000,
            "operatorUser": "ubuntu",
            "rootUid": 0,
            "ubuntuUid": 1000,
        },
        "filesystem": {
            "rootType": "ext4",
            "tmpType": "ext4",
            "tmpOnSameDeviceClaimed": True,
        },
        "isolation": {
            "guestDedicatedClaimed": True,
            "snapshotRollbackClaimed": True,
            "networkPrivateClaimed": True,
            "productionMountsAbsentClaimed": True,
            "productionCredentialsAbsentClaimed": True,
            "runtimePathAbsentClaimed": True,
        },
        "systemd": {
            "state": "running",
            "labUnits": [],
            "labUnitFiles": [],
        },
    }


class GuestGate01ContractTests(unittest.TestCase):
    def test_self_consistent_claim_never_becomes_trusted(self):
        receipt = gate.review_claimed_guest_gate01(claimed_isolated_guest())
        self.assertIs(receipt["claimedEvidenceStructurallyConsistent"], True)
        for field in (
            "guestIdentityIndependentlyAuthenticated",
            "snapshotIndependentlyVerified", "fileSystemIndependentlyVerified",
            "productionIsolationIndependentlyVerified",
            "eligibleForRootGuestActions", "realHostQuiescenceVerified",
            "readyToInstall", "authorizedToMutateProduction",
        ):
            self.assertIs(receipt[field], False)
        self.assertEqual(len(receipt["requiredIndependentEvidence"]), 4)

    def test_extra_and_missing_top_level_fields_fail(self):
        original = claimed_isolated_guest()
        for changed in (
            {**original, "authorizedToMutateProduction": True},
            {key: value for key, value in original.items() if key != "guest"},
            {**original, "schemaVersion": True},
            {**original, "schemaVersion": 2},
            {**original, "kind": "already-authorized"},
            "trusted",
        ):
            with self.subTest(changed=type(changed).__name__):
                with self.assertRaises(gate.GuestGateBlocked):
                    gate.review_claimed_guest_gate01(changed)

    def test_guest_identity_and_snapshot_are_bounded(self):
        for field, bad in (
            ("hypervisor", "docker"),
            ("uuid", ""),
            ("uuid", "0" * 400),
            ("uuid", "01234567-89ab-4cde-8f01-23456789abcZ"),
            ("snapshotName", "../not-a-snapshot"),
            ("snapshotName", "name with spaces"),
            ("snapshotExistsClaimed", False),
            ("snapshotExistsClaimed", "true"),
        ):
            claim = claimed_isolated_guest()
            claim["guest"][field] = bad
            with self.subTest(field=field, bad=bad):
                with self.assertRaises(gate.GuestGateBlocked):
                    gate.review_claimed_guest_gate01(claim)

    def test_real_unprivileged_user_is_mandatory(self):
        for field, bad in (
            ("operatorUid", 0), ("operatorUid", True),
            ("operatorUid", "1000"), ("operatorUid", -5),
            ("operatorGid", 0), ("operatorGid", True),
            ("operatorUser", "root"), ("rootUid", 1000),
            ("rootUid", False), ("ubuntuUid", 2000),
        ):
            claim = claimed_isolated_guest()
            claim["identity"][field] = bad
            with self.subTest(field=field):
                with self.assertRaises(gate.GuestGateBlocked):
                    gate.review_claimed_guest_gate01(claim)

    def test_all_isolation_claims_and_ext4_constraints_required(self):
        original = claimed_isolated_guest()
        for field in original["isolation"]:
            for bad in (False, None, 1, "true"):
                claim = deepcopy(original)
                claim["isolation"][field] = bad
                with self.subTest(field=field, bad=bad):
                    with self.assertRaises(gate.GuestGateBlocked):
                        gate.review_claimed_guest_gate01(claim)
        for field, bad in (
            ("rootType", "tmpfs"), ("tmpType", "overlay"),
            ("tmpOnSameDeviceClaimed", False),
        ):
            claim = claimed_isolated_guest()
            claim["filesystem"][field] = bad
            with self.assertRaises(gate.GuestGateBlocked):
                gate.review_claimed_guest_gate01(claim)

    def test_synthetic_unit_collisions_and_unknown_systemd_block(self):
        for field, bad in (
            ("state", "degraded"),
            ("state", True),
            ("labUnits", ["sanq-g2b2b-lab-previous.service"]),
            ("labUnitFiles", ["sanq-g2b2b-lab-previous.timer"]),
            ("labUnits", None),
            ("labUnitFiles", "[]"),
        ):
            claim = claimed_isolated_guest()
            claim["systemd"][field] = bad
            with self.subTest(field=field):
                with self.assertRaises(gate.GuestGateBlocked):
                    gate.review_claimed_guest_gate01(claim)

    def test_no_hidden_exec_or_runtime_bundle_contract(self):
        for method in ("main", "install", "execute", "deploy", "quiesce",
                       "observe_host", "authorize"):
            self.assertFalse(hasattr(gate, method))
        self.assertNotIn("os", gate.__dict__)
        self.assertNotIn("subprocess", gate.__dict__)
        self.assertNotIn("ops/runtime/disposable_guest_gate01_contract.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
