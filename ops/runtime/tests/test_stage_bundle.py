"""C5-B2A inert Runtime staging: external SHA256 seal, no Git checkout."""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RUNTIME_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNTIME_DIR))
import build_bundle  # noqa: E402

SPEC = importlib.util.spec_from_file_location("sanq_stage_bundle", RUNTIME_DIR / "stage_bundle.py")
assert SPEC and SPEC.loader
stage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(stage)

SHA = "a" * 40
DIGEST = "sha256:" + "f" * 64


def proof():
    return {
        "schemaVersion": 1, "sourceBranch": "main", "sourceSha": SHA,
        "ciRunId": 2, "publishRunId": 3, "verifiedAt": "2026-10-08T21:00:00Z",
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{SHA}",
                "digest": DIGEST, "requiredPlatform": "linux/amd64",
            }
            for name in ("sanq-api", "sanq-web")
        },
    }


def fixture_files():
    return {
        name: (
            json.dumps(stage.LAYOUT_V1).encode("utf-8")
            if name == stage.LAYOUT_FILE
            else f"test fixture for {name}\n".encode("utf-8")
        )
        for name in build_bundle.SOURCE_FILES
    }


def runtime_fixture():
    files = fixture_files()
    manifest = build_bundle.manifest_for_proof(proof(), files)
    archive = build_bundle.encode_bundle(files, manifest)
    return files, manifest, archive


def trusted(archive: bytes):
    return {
        "sourceSha": SHA,
        "verified": True,
        "runtimeArchiveDigest": stage._sha256(archive),
        "productionActivationAuthorized": False,
    }


def stage_fixture(parent: Path, *, files=None, manifest=None, archive=None, attestation=None):
    default_files, default_manifest, default_archive = runtime_fixture()
    return stage.stage_verified_files(
        files if files is not None else default_files,
        manifest if manifest is not None else default_manifest,
        parent,
        archive=archive if archive is not None else default_archive,
        attestation=attestation if attestation is not None else trusted(default_archive),
    )


class InertStagingTests(unittest.TestCase):
    def test_validated_bundle_requires_whitelisted_files(self):
        files, manifest, archive = runtime_fixture()
        received, restored = stage.validated_archive_files(archive, SHA)
        self.assertEqual(received, manifest)
        self.assertEqual(restored, files)
        self.assertFalse(stage.validate_layout(restored)["activationAuthorized"])
        self.assertFalse(stage.validate_layout(restored)["sourceCheckoutRequiredForStaging"])

    def test_cannot_modify_layout_or_authorize_activation(self):
        files = fixture_files()
        altered = dict(stage.LAYOUT_V1, activationAuthorized=True)
        files[stage.LAYOUT_FILE] = json.dumps(altered).encode()
        with self.assertRaisesRegex(stage.StagingBlocked, "activation-capable"):
            stage.validate_layout(files)
        altered = dict(stage.LAYOUT_V1, preservedDatabaseVolume="fresh_volume")
        files[stage.LAYOUT_FILE] = json.dumps(altered).encode()
        with self.assertRaises(stage.StagingBlocked):
            stage.validate_layout(files)
        altered = dict(stage.LAYOUT_V1, sourceCheckoutRequiredForStaging=True)
        files[stage.LAYOUT_FILE] = json.dumps(altered).encode()
        with self.assertRaises(stage.StagingBlocked):
            stage.validate_layout(files)

    def test_staging_retains_exact_attested_archive_in_inert_sha_directory(self):
        files, manifest, archive = runtime_fixture()
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            version = stage_fixture(parent)
            self.assertEqual(version, parent / SHA)
            self.assertEqual((version / stage.LAYOUT_FILE).read_bytes(), files[stage.LAYOUT_FILE])
            self.assertEqual((version / stage.STAGED_ARCHIVE).read_bytes(), archive)
            self.assertEqual((version / "runtime-release.json").read_text().count(SHA) >= 1, True)
            self.assertFalse((version / ".env").exists())
            self.assertFalse((version / "uploads").exists())
            with self.assertRaisesRegex(stage.StagingBlocked, "already exists"):
                stage_fixture(parent)

    def test_wrong_or_missing_external_archive_digest_blocks_before_any_write(self):
        files, manifest, archive = runtime_fixture()
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            for bad in (
                {**trusted(archive), "runtimeArchiveDigest": "sha256:" + "0" * 64},
                {**trusted(archive), "verified": False},
                {**trusted(archive), "sourceSha": "b" * 40},
                {**trusted(archive), "productionActivationAuthorized": True},
            ):
                with self.assertRaisesRegex(stage.StagingBlocked, "external Runtime archive digest"):
                    stage.stage_verified_files(
                        files, manifest, parent, archive=archive, attestation=bad
                    )
                self.assertEqual(list(parent.iterdir()), [])

    def test_staging_source_tampering_detected_against_authenticated_archive(self):
        files, manifest, archive = runtime_fixture()
        files["docker-compose.yml"] = b"tampered"
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            with self.assertRaisesRegex(stage.StagingBlocked, "archive bytes differ"):
                stage.stage_verified_files(
                    files, manifest, parent, archive=archive, attestation=trusted(archive)
                )
            self.assertEqual(list(parent.iterdir()), [])

    def test_private_parent_permissions_and_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            parent.chmod(0o777)
            with self.assertRaisesRegex(stage.StagingBlocked, "group/world-writable"):
                stage.ensure_private_staging_parent(parent)
            parent.chmod(0o700)
            alias = Path(tmp) / "alias"
            alias.symlink_to(parent, target_is_directory=True)
            with self.assertRaisesRegex(stage.StagingBlocked, "symlink"):
                stage.ensure_private_staging_parent(alias)

    def test_independent_verifier_must_return_complete_external_proof(self):
        _, _, archive = runtime_fixture()
        with patch.object(stage, "verify_runtime_publication", return_value=trusted(archive)) as remote:
            self.assertEqual(stage.verify_independent_archive(archive, SHA)["verified"], True)
            remote.assert_called_once_with(archive, SHA)
        for tampered in (
            {**trusted(archive), "runtimeArchiveDigest": "sha256:" + "0" * 64},
            {**trusted(archive), "sourceSha": "b" * 40},
        ):
            with patch.object(stage, "verify_runtime_publication", return_value=tampered):
                with self.assertRaisesRegex(stage.StagingBlocked, "incomplete"):
                    stage.verify_independent_archive(archive, SHA)

    def test_plan_is_checkout_free_and_never_stages_files(self):
        _, _, archive = runtime_fixture()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "runtime.tar.gz"
            path.write_bytes(archive)
            with patch.object(stage, "verify_runtime_publication", return_value=trusted(archive)), \
                 patch.object(stage, "stage_verified_files") as write:
                with patch.object(sys, "argv", [
                    "stage_bundle.py", "plan", "--bundle", str(path), "--source-sha", SHA
                ]):
                    self.assertEqual(stage.main(), 0)
                write.assert_not_called()

    def test_stage_command_stores_exact_verified_payload_only_after_external_proof(self):
        _, _, archive = runtime_fixture()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            parent = root / "staging"
            parent.mkdir(mode=0o700)
            bundle = root / "input.tar.gz"
            bundle.write_bytes(archive)
            with patch.object(stage, "STAGING_PARENT", parent), \
                 patch.object(stage, "verify_runtime_publication", return_value=trusted(archive)):
                with patch.object(sys, "argv", [
                    "stage_bundle.py", "stage", "--bundle", str(bundle),
                    "--source-sha", SHA, "--execute",
                ]):
                    self.assertEqual(stage.main(), 0)
            self.assertEqual((parent / SHA / stage.STAGED_ARCHIVE).read_bytes(), archive)
            self.assertFalse((parent / SHA / ".env").exists())

    def test_rejected_external_seal_prevents_staging_even_with_execute(self):
        _, _, archive = runtime_fixture()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            parent = root / "staging"
            parent.mkdir(mode=0o700)
            bundle = root / "input.tar.gz"
            bundle.write_bytes(archive)
            with patch.object(stage, "STAGING_PARENT", parent), \
                 patch.object(stage, "verify_runtime_publication", side_effect=ValueError("untrusted publication")):
                with patch.object(sys, "argv", [
                    "stage_bundle.py", "stage", "--bundle", str(bundle),
                    "--source-sha", SHA, "--execute",
                ]):
                    self.assertEqual(stage.main(), 1)
            self.assertEqual(list(parent.iterdir()), [])

    def test_stage_requires_execute(self):
        with patch.object(sys, "argv", [
            "stage_bundle.py", "stage", "--bundle", "/not/read", "--source-sha", SHA
        ]):
            with self.assertRaises(SystemExit):
                stage.main()

    def test_invalid_bundle_and_wrong_sha_fail_closed(self):
        files, manifest, archive = runtime_fixture()
        with self.assertRaises(ValueError):
            stage.validated_archive_files(archive, "b" * 40)
        files[stage.LAYOUT_FILE] = b"invalid"
        forged = build_bundle.encode_bundle(files, manifest)
        with self.assertRaisesRegex(build_bundle.BundleBlocked, "checksum"):
            stage.validated_archive_files(forged, SHA)


if __name__ == "__main__":
    unittest.main()
