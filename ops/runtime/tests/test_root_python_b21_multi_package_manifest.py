"""B2-1D candidate-only multi-package/B3A ownership joins; synthetic objects."""
from __future__ import annotations

import copy
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from root_python_dependency_manifest import (  # noqa: E402
    SCHEMA as MANIFEST_SCHEMA, canonical_manifest_bytes,
)
from root_python_b21_deb_members import SCHEMA as MEMBER_SCHEMA  # noqa: E402
from root_python_b21_multi_package_manifest import (  # noqa: E402
    PackageManifestClaimsBlocked, review_candidate_multi_package_manifest,
)

PY = "/usr/bin/python3.12"
LD = "/lib64/ld-linux-x86-64.so.2"
PY_MEMBER = "usr/bin/python3.12"
LD_MEMBER = "usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"
LINK_PATH = "/usr/lib64/ld-linux-x86-64.so.2"
LINK_MEMBER = "usr/lib64/ld-linux-x86-64.so.2"
LINK_TEXT = "../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"
_A = "a" * 64
_B = "b" * 64
_C = "c" * 64
_FALSE_FIELDS = (
    "ubuntuReleaseSignatureIndependentlyAuthenticated",
    "debContainerPackageOriginIndependentlyAuthenticated",
    "filePinsIndependentlyAuthenticated",
    "guestRootFdAndInodeProvenanceAuthenticated",
    "actualDynamicPythonElfDlopenConsumptionWitnessed",
    "readyToInstall", "authorizedToMutateProduction",
)


def member_receipt(deb_digest, files, links):
    result = {
        "schema": MEMBER_SCHEMA,
        "candidateDebSha256": deb_digest,
        "candidateFileSha256": files,
        "candidateSymlinkText": links,
        "candidateByteAndLinkTextClaimsMatch": True,
        "decision": "BLOCKED",
    }
    result.update({key: False for key in _FALSE_FIELDS})
    return result


def fixture():
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "platform": {
            "os": "linux", "architecture": "x86_64",
            "pythonVersion": "3.12.3",
            "isolationFlags": ["-I", "-S", "-B"],
        },
        "nodes": [
            {"id": "interpreter", "kind": "python-executable",
             "path": PY, "sha256": _A, "requires": ["loader"]},
            {"id": "loader", "kind": "elf-loader",
             "path": LD, "sha256": _B, "requires": []},
        ],
    }
    return {
        "manifest": manifest,
        "expected_manifest_sha256": hashlib.sha256(
            canonical_manifest_bytes(manifest)).hexdigest(),
        "proposed_external_file_pins": {PY: _A, LD: _B},
        "packages": [
            {"packageId": "python3.12-minimal",
             "debSha256": _A,
             "memberReceipt": member_receipt(_A, {PY_MEMBER: _A}, {})},
            {"packageId": "libc6",
             "debSha256": _B,
             "memberReceipt": member_receipt(
                 _B, {LD_MEMBER: _B}, {LINK_MEMBER: LINK_TEXT})},
        ],
        "file_routes": {
            PY: {"packageId": "python3.12-minimal", "memberPath": PY_MEMBER},
            LD: {"packageId": "libc6", "memberPath": LD_MEMBER},
        },
        "symlink_routes": {
            LINK_PATH: {"packageId": "libc6",
                        "memberPath": LINK_MEMBER,
                        "linkText": LINK_TEXT},
        },
    }


class MultiPackageManifestTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture()

    def check(self):
        return review_candidate_multi_package_manifest(**self.data)

    def test_full_claims_are_always_blocked(self):
        result = self.check()
        self.assertEqual(result["candidatePackageCount"], 2)
        self.assertEqual(result["candidateLogicalFileCount"], 2)
        self.assertEqual(result["candidateSymlinkRouteCount"], 1)
        self.assertEqual(result["decision"], "BLOCKED")
        for key in ("ubuntuSignedReleaseIndependentlyVerified",
                    "packageReceiptsIndependentlyAuthenticated",
                    "logicalToCanonicalGuestPathsAuthenticated",
                    "guestRootFdAndActualBytesAuthenticated",
                    "actualDynamicPythonElfDlopenConsumptionWitnessed",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(result[key], False)

    def test_manifest_hash_mismatch_blocks(self):
        self.data["expected_manifest_sha256"] = _C
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_manifest_platform_mismatch_blocks(self):
        self.data["manifest"]["platform"]["pythonVersion"] = "3.13.0"
        self.data["expected_manifest_sha256"] = hashlib.sha256(
            canonical_manifest_bytes(self.data["manifest"])).hexdigest()
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_missing_manifest_logical_file_route(self):
        del self.data["file_routes"][LD]
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_extra_undeclared_file_route(self):
        self.data["file_routes"]["/tmp/unexpected"] = copy.deepcopy(
            self.data["file_routes"][LD])
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_member_hash_disagrees_with_manifest_even_if_receipt_self_consistent(self):
        self.data["packages"][1]["memberReceipt"]["candidateFileSha256"][LD_MEMBER] = _C
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_package_id_does_not_exist(self):
        self.data["file_routes"][LD]["packageId"] = "not-a-selected-package"
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_duplicate_package_id(self):
        duplicate = copy.deepcopy(self.data["packages"][0])
        self.data["packages"].append(duplicate)
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_member_receipt_wrong_deb_digest(self):
        self.data["packages"][0]["memberReceipt"]["candidateDebSha256"] = _C
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_receipt_claiming_external_authentication_is_rejected(self):
        self.data["packages"][0]["memberReceipt"][
            "ubuntuReleaseSignatureIndependentlyAuthenticated"] = True
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_receipt_cannot_override_blocked_decision(self):
        self.data["packages"][0]["memberReceipt"]["decision"] = "PASS"
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_extra_receipt_field_is_rejected(self):
        self.data["packages"][0]["memberReceipt"]["trustedSource"] = True
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_orphan_package_regular_member_is_rejected(self):
        self.data["packages"][0]["memberReceipt"][
            "candidateFileSha256"]["usr/bin/unclaimed"] = _C
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_missing_symlink_mapping_is_rejected(self):
        self.data["symlink_routes"] = {}
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_symlink_text_mismatch_is_rejected(self):
        self.data["symlink_routes"][LINK_PATH]["linkText"] = "/tmp/wrong"
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_symlink_route_undeclared_member_is_rejected(self):
        self.data["symlink_routes"][LINK_PATH]["memberPath"] = "usr/lib64/unknown"
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_path_traversal_in_member_mapping_rejected(self):
        self.data["file_routes"][LD]["memberPath"] = "../../etc/passwd"
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_absolute_logical_link_path_required(self):
        route = self.data["symlink_routes"].pop(LINK_PATH)
        self.data["symlink_routes"]["usr/lib64/ld-linux-x86-64.so.2"] = route
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_package_receipt_missing_keys_rejected(self):
        del self.data["packages"][0]["memberReceipt"]["candidateFileSha256"]
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()

    def test_unreferenced_extra_package_rejected(self):
        self.data["packages"].append({
            "packageId": "extra",
            "debSha256": _C,
            "memberReceipt": member_receipt(_C, {"usr/bin/other": _C}, {}),
        })
        with self.assertRaises(PackageManifestClaimsBlocked):
            self.check()


if __name__ == "__main__":
    unittest.main()
