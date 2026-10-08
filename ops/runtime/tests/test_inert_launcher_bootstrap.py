"""B3B2G stdlib-only inert Launcher packaging contract tests."""
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inert_launcher_bootstrap import BootstrapBlocked, INSTALL_PATH, validate_inert_bootstrap

PAYLOAD = b"synthetic isolated launcher package bytes"


def manifest():
    return {
        "schemaVersion": 1,
        "kind": "inert-root-launcher-package-v1",
        "installPath": INSTALL_PATH,
        "ownerUid": 0,
        "ownerGid": 0,
        "fileMode": "0500",
        "payloadSha256": "sha256:" + hashlib.sha256(PAYLOAD).hexdigest(),
        "packagingAuthority": "independent-root-operator-review-required",
        "bootstrapApproved": False,
        "productionActivationAuthorized": False,
    }


class BootstrapTests(unittest.TestCase):
    def test_matching_synthetic_bytes_never_confer_authority(self):
        actual = validate_inert_bootstrap(manifest(), PAYLOAD)
        self.assertTrue(actual["candidateArtifactMatchesManifest"])
        self.assertFalse(actual["authenticPublisherVerified"])
        self.assertFalse(actual["rootPrivilegeProvisioned"])
        self.assertFalse(actual["authorizedToMutateProduction"])

    def test_missing_wrong_or_untrusted_bytes_rejected(self):
        for payload in (b"", b"changed", "synthetic", None):
            with self.subTest(payload=payload), self.assertRaises(BootstrapBlocked):
                validate_inert_bootstrap(manifest(), payload)

    def test_manifest_mutations_rejected(self):
        for field, value in (
            ("installPath", "/opt/sanq/runtime/launcher"),
            ("ownerUid", 1000),
            ("ownerGid", 1000),
            ("ownerUid", False),
            ("fileMode", "0755"),
            ("packagingAuthority", "ubuntu"),
            ("bootstrapApproved", True),
            ("productionActivationAuthorized", True),
            ("payloadSha256", "sha256:" + "1" * 64),
            ("schemaVersion", 2),
        ):
            item = manifest()
            item[field] = value
            with self.subTest(field=field), self.assertRaises(BootstrapBlocked):
                validate_inert_bootstrap(item, PAYLOAD)
        item = manifest()
        item["shellCommand"] = "sudo"
        with self.assertRaises(BootstrapBlocked):
            validate_inert_bootstrap(item, PAYLOAD)


if __name__ == "__main__":
    unittest.main()
