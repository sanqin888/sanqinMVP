"""Offline source-pinned Runtime bundle contract tests."""

import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "build_bundle.py"
SPEC = importlib.util.spec_from_file_location("sanq_runtime_bundle", SOURCE)
assert SPEC and SPEC.loader
bundle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bundle)

SHA = "a" * 40
OTHER_SHA = "b" * 40
DIGEST = "sha256:" + "f" * 64


def proof(sha=SHA):
    return {
        "schemaVersion": 1,
        "sourceSha": sha,
        "sourceBranch": "main",
        "ciRunId": 1001,
        "publishRunId": 1002,
        "verifiedAt": "2026-10-07T23:00:00Z",
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{sha}",
                "digest": DIGEST,
                "requiredPlatform": "linux/amd64",
            }
            for name in ("sanq-api", "sanq-web")
        },
    }


def fixture(root):
    for name in bundle.SOURCE_FILES:
        f = root / name
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("# synthetic " + name + "\n")
    (root / ".env").write_text("fixture only")
    (root / "uploads").mkdir()
    (root / "uploads" / "example.txt").write_text("not packaged")


class BundleTests(unittest.TestCase):
    def test_deterministic_and_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            first = bundle.build_archive(root, proof(), SHA)
            second = bundle.build_archive(root, proof(), SHA)
            self.assertEqual(first, second)
            record = bundle.verify_bundle_bytes(first, SHA)
            self.assertFalse(record["productionActivationAuthorized"])
            self.assertEqual(set(record["files"]), set(bundle.SOURCE_FILES))

    def test_archive_contains_only_approved_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            payload = bundle.build_archive(root, proof(), SHA)
            with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
                members = [member.name for member in archive if member.isfile()]
            self.assertEqual(
                set(members),
                {f"sanq-runtime/{name}" for name in bundle.SOURCE_FILES}
                | {"sanq-runtime/runtime-release.json"},
            )

    def test_mismatched_source_sha_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            with self.assertRaisesRegex(bundle.BundleBlocked, "differs"):
                bundle.build_archive(root, proof(), OTHER_SHA)
            data = bundle.build_archive(root, proof(), SHA)
            with self.assertRaisesRegex(bundle.BundleBlocked, "mismatch"):
                bundle.verify_bundle_bytes(data, OTHER_SHA)

    def test_symlinked_source_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            original = root / bundle.SOURCE_FILES[0]
            original.unlink()
            original.symlink_to(root / bundle.SOURCE_FILES[1])
            with self.assertRaisesRegex(bundle.BundleBlocked, "symlink"):
                bundle.build_archive(root, proof(), SHA)

    def test_content_checksum_failure_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            source = bundle._source_bytes(root)
            manifest = bundle.manifest_for_proof(proof(), source)
            source[bundle.SOURCE_FILES[0]] = b"modified\n"
            payload = bundle.encode_bundle(source, manifest)
            with self.assertRaisesRegex(bundle.BundleBlocked, "checksum"):
                bundle.verify_bundle_bytes(payload, SHA)

    def test_missing_or_extra_file_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            source = bundle._source_bytes(root)
            manifest = bundle.manifest_for_proof(proof(), source)
            with self.assertRaisesRegex(bundle.BundleBlocked, "allowlist"):
                bundle.encode_bundle({**source, "other.txt": b"extra"}, manifest)
            (root / bundle.SOURCE_FILES[0]).unlink()
            with self.assertRaisesRegex(bundle.BundleBlocked, "unavailable"):
                bundle.build_archive(root, proof(), SHA)

    def test_invalid_archive_rejected(self):
        with self.assertRaisesRegex(bundle.BundleBlocked, "unreadable"):
            bundle.verify_bundle_bytes(b"bad bytes", SHA)


if __name__ == "__main__":
    unittest.main()
