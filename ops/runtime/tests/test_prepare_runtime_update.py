"""Offline safety tests for U2 inert preparation (never production activation)."""
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("u2_prepare", ROOT / "prepare_runtime_update.py")
assert SPEC and SPEC.loader
u2 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(u2)
SHA = "a" * 40
ARCHIVE = b"offline-example-archive"
DIGEST = "sha256:" + hashlib.sha256(ARCHIVE).hexdigest()


def fixture():
    files = {name: (name + "\n").encode() for name in u2.SOURCE_FILES}
    manifest = {
        "sourceSha": SHA,
        "productionActivationAuthorized": False,
        "files": {
            path: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            for path, data in files.items()
        },
    }
    return manifest, files


class U2PreparationTests(unittest.TestCase):
    def test_verified_archive_produces_inert_private_tree(self):
        manifest, files = fixture()
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            parent.chmod(0o700)
            with patch.object(u2, "verify_independent_archive", return_value={
                "runtimeArchiveDigest": DIGEST,
            }), patch.object(u2, "validated_archive_files", return_value=(manifest, files)), \
                 patch.object(u2, "validate_layout"):
                result = u2.prepare_authenticated_archive(ARCHIVE, SHA, parent)
            self.assertEqual(result["status"], "inert-prepared-only")
            self.assertEqual(result["memberCount"], 17)
            self.assertFalse(result["readyToInstall"])
            tree = Path(result["path"])
            self.assertEqual((tree / u2.STAGED_ARCHIVE).read_bytes(), ARCHIVE)
            self.assertEqual(json.loads((tree / u2.MANIFEST).read_text()), manifest)
            self.assertEqual((tree / "ops/release/deploy_release.py").read_bytes(),
                             files["ops/release/deploy_release.py"])
            self.assertEqual(tree.stat().st_mode & 0o777, 0o700)

    def test_external_proof_failure_does_not_create_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            parent.chmod(0o700)
            with patch.object(u2, "verify_independent_archive",
                              side_effect=u2.PreparationBlocked("untrusted")):
                with self.assertRaisesRegex(u2.PreparationBlocked, "untrusted"):
                    u2.prepare_authenticated_archive(ARCHIVE, SHA, parent)
            self.assertEqual(list(parent.iterdir()), [])

    def test_digest_mismatch_fails_before_preparing(self):
        manifest, files = fixture()
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            parent.chmod(0o700)
            with patch.object(u2, "verify_independent_archive",
                              return_value={"runtimeArchiveDigest": "sha256:" + "0" * 64}), \
                 patch.object(u2, "validated_archive_files", return_value=(manifest, files)), \
                 patch.object(u2, "validate_layout"):
                with self.assertRaisesRegex(u2.PreparationBlocked, "digest"):
                    u2.prepare_authenticated_archive(ARCHIVE, SHA, parent)
            self.assertEqual(list(parent.iterdir()), [])

    def test_member_checksum_drift_is_blocked_before_writes(self):
        manifest, files = fixture()
        manifest["files"]["docker-compose.yml"]["sha256"] = "f" * 64
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            parent.chmod(0o700)
            with patch.object(u2, "verify_independent_archive",
                              return_value={"runtimeArchiveDigest": DIGEST}), \
                 patch.object(u2, "validated_archive_files", return_value=(manifest, files)), \
                 patch.object(u2, "validate_layout"):
                with self.assertRaisesRegex(u2.PreparationBlocked, "member mismatch"):
                    u2.prepare_authenticated_archive(ARCHIVE, SHA, parent)
            self.assertEqual(list(parent.iterdir()), [])

    def test_world_readable_or_symlink_staging_parent_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            base.chmod(0o700)
            shared = base / "shared"
            shared.mkdir(mode=0o755)
            with self.assertRaisesRegex(u2.PreparationBlocked, "mode 0700"):
                u2.ensure_private_parent(shared)
            alias = base / "alias"
            alias.symlink_to(shared, target_is_directory=True)
            with self.assertRaisesRegex(u2.PreparationBlocked, "symlinked"):
                u2.ensure_private_parent(alias)

    def test_no_install_or_command_authority(self):
        self.assertNotIn("subprocess", u2.__dict__)
        self.assertFalse(hasattr(u2, "activate"))
        self.assertFalse(hasattr(u2, "deploy"))
        self.assertFalse(hasattr(u2, "rollback"))


if __name__ == "__main__":
    unittest.main()
