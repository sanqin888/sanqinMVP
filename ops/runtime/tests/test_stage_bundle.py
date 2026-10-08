"""C2 staged-only Runtime bundle validation; no production interaction."""

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
        "ciRunId": 2, "publishRunId": 3, "verifiedAt": "2026-10-07T21:00:00Z",
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


class InertStagingTests(unittest.TestCase):
    def test_revalidated_bundle_is_allowlisted(self):
        data = fixture_files()
        manifest = build_bundle.manifest_for_proof(proof(), data)
        archive = build_bundle.encode_bundle(data, manifest)
        received_manifest, files = stage.validated_archive_files(archive, SHA)
        self.assertEqual(files, data)
        self.assertEqual(received_manifest["sourceSha"], SHA)
        self.assertFalse(stage.validate_layout(files)["activationAuthorized"])

    def test_cannot_change_proposed_storage_or_activate(self):
        original = fixture_files()
        bad_layout = dict(stage.LAYOUT_V1, activationAuthorized=True)
        original[stage.LAYOUT_FILE] = json.dumps(bad_layout).encode("utf-8")
        with self.assertRaisesRegex(stage.StagingBlocked, "activation-capable"):
            stage.validate_layout(original)
        original = fixture_files()
        bad_layout = dict(stage.LAYOUT_V1, preservedDatabaseVolume="new_empty_db")
        original[stage.LAYOUT_FILE] = json.dumps(bad_layout).encode("utf-8")
        with self.assertRaises(stage.StagingBlocked):
            stage.validate_layout(original)

    def test_staging_owns_only_new_version_directory(self):
        data = fixture_files()
        manifest = build_bundle.manifest_for_proof(proof(), data)
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            version = stage.stage_verified_files(data, manifest, parent)
            self.assertEqual(version, parent / SHA)
            self.assertEqual((version / stage.LAYOUT_FILE).read_bytes(), data[stage.LAYOUT_FILE])
            self.assertTrue((version / "runtime-release.json").is_file())
            self.assertFalse((version / ".env").exists())
            self.assertFalse((version / "uploads").exists())
            with self.assertRaisesRegex(stage.StagingBlocked, "already exists"):
                stage.stage_verified_files(data, manifest, parent)

    def test_stage_function_revalidates_file_hashes(self):
        files = fixture_files()
        manifest = build_bundle.manifest_for_proof(proof(), files)
        files["docker-compose.yml"] = b"tampered staging content"
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp) / "staging"
            parent.mkdir(mode=0o700)
            with self.assertRaisesRegex(stage.StagingBlocked, "checksum|manifest"):
                stage.stage_verified_files(files, manifest, parent)
            self.assertEqual(list(parent.iterdir()), [])

    def test_stage_without_execute_is_rejected(self):
        with patch.object(sys, "argv", [
            "stage_bundle.py", "stage", "--bundle", "/not/read",
            "--source-sha", SHA,
        ]):
            with self.assertRaises(SystemExit):
                stage.main()

    def test_staging_target_parent_permissions_and_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            parent = root / "staging"
            parent.mkdir(mode=0o700)
            os.chmod(parent, 0o777)
            with self.assertRaisesRegex(stage.StagingBlocked, "group/world-writable"):
                stage.ensure_private_staging_parent(parent)
            parent.chmod(0o700)
            alias = root / "alias"
            alias.symlink_to(parent, target_is_directory=True)
            with self.assertRaisesRegex(stage.StagingBlocked, "symlink"):
                stage.ensure_private_staging_parent(alias)

    def test_published_image_digests_and_run_must_match(self):
        data = fixture_files()
        manifest = build_bundle.manifest_for_proof(proof(), data)
        candidate = {
            "sourceSha": SHA,
            "publicationUrl": "https://github.com/sanqin888/sanqinMVP/actions/runs/3",
            "images": manifest["applicationImages"],
        }
        with patch.object(stage, "discover_release", return_value=candidate):
            stage.verify_paired_publication(manifest)
            invalid = json.loads(json.dumps(manifest))
            invalid["publishRunId"] = 9
            with self.assertRaisesRegex(stage.StagingBlocked, "publishing run"):
                stage.verify_paired_publication(invalid)
            invalid = json.loads(json.dumps(manifest))
            invalid["applicationImages"]["sanq-web"]["digest"] = "sha256:" + "0" * 64
            with self.assertRaisesRegex(stage.StagingBlocked, "digest"):
                stage.verify_paired_publication(invalid)

    def test_plan_has_no_staging_side_effects(self):
        with tempfile.TemporaryDirectory() as tmp:
            package = Path(tmp) / "runtime.tar.gz"
            package.write_bytes(b"placeholder bytes")
            manifest = build_bundle.manifest_for_proof(proof(), fixture_files())
            with patch.object(stage, "validated_archive_files", return_value=(manifest, fixture_files())), \
                 patch.object(stage, "verify_checkout_sources"), \
                 patch.object(stage, "verify_paired_publication"), \
                 patch.object(stage, "stage_verified_files") as write:
                with patch.object(sys, "argv", [
                    "stage_bundle.py", "plan", "--bundle", str(package),
                    "--source-sha", SHA,
                ]):
                    self.assertEqual(stage.main(), 0)
                write.assert_not_called()

    def test_checkout_sha_branch_and_bytes_are_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = fixture_files()
            for name, data in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            completed = lambda stdout="", returncode=0: __import__("subprocess").CompletedProcess(
                args=["git"], returncode=returncode, stdout=stdout, stderr=""
            )
            with patch.object(stage.subprocess, "run", side_effect=[
                completed(SHA + "\n"), completed("main\n"), completed()
            ]):
                stage.verify_checkout_sources(files, root, SHA)
            with patch.object(stage.subprocess, "run", return_value=completed("dev\n")):
                with self.assertRaisesRegex(stage.StagingBlocked, "HEAD differs"):
                    stage.verify_checkout_sources(files, root, SHA)
            files["docker-compose.yml"] = b"not equal to checked-out compose"
            with patch.object(stage.subprocess, "run", side_effect=[
                completed(SHA + "\n"), completed("main\n"), completed()
            ]):
                with self.assertRaisesRegex(stage.StagingBlocked, "differs"):
                    stage.verify_checkout_sources(files, root, SHA)

    def test_forged_archive_or_wrong_sha_cannot_stage(self):
        data = fixture_files()
        manifest = build_bundle.manifest_for_proof(proof(), data)
        archive = build_bundle.encode_bundle(data, manifest)
        with self.assertRaises(ValueError):
            stage.validated_archive_files(archive, "b" * 40)
        data[stage.LAYOUT_FILE] = b"garbage"
        tampered_archive = build_bundle.encode_bundle(data, manifest)
        with self.assertRaisesRegex(build_bundle.BundleBlocked, "checksum"):
            stage.validated_archive_files(tampered_archive, SHA)


if __name__ == "__main__":
    unittest.main()
