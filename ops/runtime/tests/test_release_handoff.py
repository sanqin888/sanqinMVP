"""C5-B2B0 handoff audit: exact staged bytes and external provenance required."""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RUNTIME = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNTIME))
import build_bundle
import stage_bundle

SPEC = importlib.util.spec_from_file_location("sanq_handoff_audit", RUNTIME / "audit_release_provenance.py")
assert SPEC and SPEC.loader
handoff = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(handoff)

SHA = "a" * 40
DIGEST = "sha256:" + "e" * 64


def proof():
    return {
        "schemaVersion": 1, "sourceBranch": "main", "sourceSha": SHA,
        "ciRunId": 31, "publishRunId": 32, "verifiedAt": "2026-10-08T01:00:00Z",
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{SHA}",
                "digest": DIGEST, "requiredPlatform": "linux/amd64",
            }
            for name in ("sanq-api", "sanq-web")
        },
    }


def fixture():
    files = {
        name: (
            json.dumps(stage_bundle.LAYOUT_V1).encode()
            if name == stage_bundle.LAYOUT_FILE else ("source " + name).encode()
        )
        for name in build_bundle.SOURCE_FILES
    }
    manifest = build_bundle.manifest_for_proof(proof(), files)
    archive = build_bundle.encode_bundle(files, manifest)
    return files, manifest, archive


def fake_publication(data: bytes, sha: str):
    return {
        "sourceSha": sha,
        "runtimeArchiveDigest": handoff._sha256(data),
        "verified": True,
        "productionActivationAuthorized": False,
    }


def staged(parent: Path) -> tuple[Path, bytes]:
    files, manifest, payload = fixture()
    root = stage_bundle.stage_verified_files(
        files, manifest, parent, archive=payload,
        attestation=fake_publication(payload, SHA),
    )
    return root, payload


class ReleaseHandoffReadinessTests(unittest.TestCase):
    def test_complete_external_evidence_is_not_activation_permission(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            root, payload = staged(parent)
            report = handoff.inspect_staging(
                SHA, staging_parent=parent, verify=fake_publication
            )
            self.assertEqual(report["runtimeArchiveDigest"], handoff._sha256(payload))
            self.assertEqual(report["authenticatedStagedFiles"], len(build_bundle.SOURCE_FILES))
            for gate in ("readyToInstallRuntime", "readyToDeploy", "readyToRollback",
                         "authorizedToChangeProduction"):
                self.assertFalse(report[gate])
            self.assertTrue((root / stage_bundle.STAGED_ARCHIVE).is_file())

    def test_changed_staged_source_and_manifest_are_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            root, _ = staged(parent)
            source = root / "docker-compose.yml"
            source.write_bytes(b"corrupted")
            with self.assertRaisesRegex(handoff.HandoffBlocked, "file differs"):
                handoff.inspect_staging(SHA, staging_parent=parent, verify=fake_publication)
            source.write_bytes(fixture()[0]["docker-compose.yml"])
            (root / build_bundle.MANIFEST).write_text("{}")
            with self.assertRaisesRegex(handoff.HandoffBlocked, "manifest differs"):
                handoff.inspect_staging(SHA, staging_parent=parent, verify=fake_publication)

    def test_bad_or_missing_seal_blocks_handoff(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            staged(parent)
            def missing(data, sha):
                return {**fake_publication(data, sha), "verified": False}
            with self.assertRaisesRegex(handoff.HandoffBlocked, "proof is incomplete"):
                handoff.inspect_staging(SHA, staging_parent=parent, verify=missing)
            def wrong(data, sha):
                return {**fake_publication(data, sha), "runtimeArchiveDigest": "sha256:" + "0" * 64}
            with self.assertRaisesRegex(handoff.HandoffBlocked, "proof is incomplete"):
                handoff.inspect_staging(SHA, staging_parent=parent, verify=wrong)

    def test_symlinks_and_extra_files_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            root, _ = staged(parent)
            (root / "unexpected").write_text("invalid")
            with self.assertRaisesRegex(handoff.HandoffBlocked, "unreviewed"):
                handoff.inspect_staging(SHA, staging_parent=parent, verify=fake_publication)
            (root / "unexpected").unlink()
            source = root / "docker-compose.yml"
            source.unlink()
            source.symlink_to(root / "ops/runtime/runtime-layout.v1.json")
            with self.assertRaisesRegex(handoff.HandoffBlocked, "symlink"):
                handoff.inspect_staging(SHA, staging_parent=parent, verify=fake_publication)

    def test_root_permissions_and_wrong_sha_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            staged(parent)
            parent.chmod(0o777)
            with self.assertRaisesRegex(handoff.HandoffBlocked, "permissions"):
                handoff.inspect_staging(SHA, staging_parent=parent, verify=fake_publication)
            parent.chmod(0o700)
            with self.assertRaises(handoff.HandoffBlocked):
                handoff.inspect_staging("b" * 40, staging_parent=parent, verify=fake_publication)

    def test_no_untrusted_source_checkout_required(self):
        self.assertNotIn("subprocess", handoff.__dict__)
        self.assertFalse(hasattr(handoff, "SOURCE_CHECKOUT"))
        self.assertFalse(hasattr(handoff, "PROD_REPO_ROOT"))


if __name__ == "__main__":
    unittest.main()
