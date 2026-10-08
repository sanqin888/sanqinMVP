"""Offline-only B3B2J tests of untrusted Launcher claim shape and bytes."""
import copy
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inert_launcher_bootstrap import INSTALL_PATH
from inert_launcher_claim import DOMAIN, LauncherClaimBlocked, parse_inert_launcher_claim

PAYLOAD = b"synthetic untrusted launcher bytes"


def claim():
    return {
        "schemaVersion": 1, "kind": "sanq-root-launcher-publication-v1",
        "domain": DOMAIN, "sourceRepository": "sanqin888/sanqinMVP",
        "sourceSha": "a" * 40, "packageKind": "root-launcher",
        "packageFormat": "launcher-package-v1",
        "artifactSha256": "sha256:" + hashlib.sha256(PAYLOAD).hexdigest(),
        "artifactLength": len(PAYLOAD),
        "entrypointSha256": "sha256:" + "b" * 64,
        "inventorySha256": "sha256:" + "c" * 64,
        "buildWorkflowIdentity": "publisher/launcher-v1",
        "buildRunId": 23, "ciRunId": 22,
        "publisherIdentity": "sanq-launcher-publisher",
        "keyId": "launcher-key-1", "policyVersion": 1,
        "validFrom": "2026-10-08T00:00:00Z",
        "expiresAt": "2026-11-08T00:00:00Z",
        "replacesKeyId": None,
        "installPath": INSTALL_PATH,
        "ownerUid": 0, "ownerGid": 0, "mode": "0500",
        "requiresManualApproval": True,
        "productionActivationAuthorized": False,
    }


class InertClaimTests(unittest.TestCase):
    def test_valid_shape_cannot_claim_authenticity(self):
        out = parse_inert_launcher_claim(claim(), PAYLOAD)
        self.assertTrue(out["candidateClaimShapeConsistent"])
        for flag in (
            "detachedSignatureVerified", "independentPublisherVerified",
            "trustRootPinned", "keyRevocationChecked", "approvedMainSourceVerified",
            "packageMemberInventoryVerified", "readyToInstall", "readyToDeploy",
            "readyToRollback", "authorizedToMutateProduction",
        ):
            self.assertIs(out[flag], False)

    def test_domain_hash_length_and_production_claims_fail_closed(self):
        for field, value in (
            ("domain", "runtime.bundle.v1"), ("artifactLength", 2),
            ("artifactSha256", "sha256:" + "f" * 64),
            ("sourceSha", "not-a-source-sha"),
            ("installPath", "/opt/sanq/runtime/launcher"),
            ("ownerUid", True), ("requiresManualApproval", False),
            ("productionActivationAuthorized", True),
            ("schemaVersion", True), ("packageKind", "runtime"),
            ("policyVersion", 0),
            ("replacesKeyId", "launcher-key-1"),
            ("validFrom", "2026-10-08T12:00:00+00:00"),
            ("expiresAt", "2026-10-07T00:00:00Z"),
        ):
            raw = claim()
            raw[field] = value
            with self.subTest(field=field), self.assertRaises(LauncherClaimBlocked):
                parse_inert_launcher_claim(raw, PAYLOAD)
        for artifact in (None, b"", b"altered", "text"):
            with self.subTest(artifact=artifact), self.assertRaises(LauncherClaimBlocked):
                parse_inert_launcher_claim(claim(), artifact)

    def test_missing_unknown_and_substituted_member_claims(self):
        raw = claim()
        raw["verified"] = True
        with self.assertRaises(LauncherClaimBlocked):
            parse_inert_launcher_claim(raw, PAYLOAD)
        raw = claim()
        raw.pop("inventorySha256")
        with self.assertRaises(LauncherClaimBlocked):
            parse_inert_launcher_claim(raw, PAYLOAD)
        raw = claim()
        raw["inventorySha256"] = raw["entrypointSha256"]
        with self.assertRaises(LauncherClaimBlocked):
            parse_inert_launcher_claim(raw, PAYLOAD)
        raw = claim()
        raw["replacesKeyId"] = "launcher-key-0"
        self.assertFalse(parse_inert_launcher_claim(raw, PAYLOAD)["keyRevocationChecked"])


if __name__ == "__main__":
    unittest.main()
