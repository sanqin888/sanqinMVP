"""C5-U2D-2A isolated one-shot lab transaction tests.

All writes under a newly-created caller-owned /tmp/sanq-u2d2a-lab-*.
No host Runtime, privilege elevation, network, Docker or service operations.
"""
from __future__ import annotations

import fcntl
import hashlib
import importlib.util
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location(
    "offline_root_private_installer", ROOT / "offline_root_private_installer.py",
)
assert SPEC and SPEC.loader
operator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operator)

from build_bundle import encode_bundle  # noqa: E402

OLD = "a" * 40
NEW = "b" * 40
APP = "c" * 40
APP_PREVIOUS = "d" * 40


def members(sha):
    return {name: (sha + ":" + name + "\n").encode("utf-8")
            for name in operator.SOURCE_FILES}


def manifest(sha, files):
    return {
        "schemaVersion": 1,
        "artifactKind": "sanq-runtime-source-pinned",
        "sourceBranch": "main",
        "sourceSha": sha,
        "ciRunId": 1,
        "publishRunId": 2,
        "applicationImages": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{sha}",
                "digest": "sha256:" + "1" * 64,
            }
            for name in ("sanq-api", "sanq-web")
        },
        "files": {
            name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            for name, data in files.items()
        },
        "productionActivationAuthorized": False,
    }


def dynamic():
    owner, env_owner = operator._expected_owners()
    return {
        ".env": (("SANQ_IMAGE_SHA=" + APP + "\nSECRET=not-in-logs\n").encode(),
                 *env_owner, 0o600),
        ".sanq-release-state.json": (
            (json.dumps({"schemaVersion": 1, "phase": "active", "current": APP,
                         "previous": APP_PREVIOUS}) + "\n").encode(),
            *owner, 0o600,
        ),
        ".sanq-backup-layout-activated": (b"SANQ_BACKUP_LAYOUT_C4_V1\n",
                                           *owner, 0o644),
    }


def fixture():
    ctx = tempfile.TemporaryDirectory(prefix=operator.PREFIX, dir="/tmp")
    base = Path(ctx.name)
    base.chmod(0o700)
    marker = base / operator.MARKER
    marker.write_bytes(operator.MARKER_CONTENT)
    marker.chmod(0o600)
    for name in ("live", "stage", "retained", "recovery", "proof"):
        (base / name).mkdir(mode=0o700)
    old_files = members(OLD)
    new_files = members(NEW)
    operator._build_tree(base / "live", "runtime",
                         old_files, manifest(OLD, old_files), dynamic())
    archive = encode_bundle(new_files, manifest(NEW, new_files))
    target = base / "proof" / operator.ARCHIVE
    target.write_bytes(archive)
    target.chmod(0o600)
    return ctx


def trusted_in_fixture(archive: bytes, sha: str):
    # Synthetic verification used ONLY in the /tmp lab; never a real seal.
    return {
        "verified": True,
        "sourceSha": sha,
        "runtimeArchiveDigest": "sha256:" + hashlib.sha256(archive).hexdigest(),
        "productionActivationAuthorized": False,
    }


def activate(root: Path, stop_at=None, verifier=trusted_in_fixture):
    return operator.run_offline_operator_handoff(
        root, old_sha=OLD, new_sha=NEW, archive_verifier=verifier,
        stop_at=stop_at,
    )


@unittest.skipUnless(sys.platform == "linux", "renameat2 needs Linux")
class OfflineOperatorTests(unittest.TestCase):
    def test_cross_parent_atomic_exchange_retains_snapshot_and_bytes(self):
        with fixture() as folder:
            root = Path(folder)
            original = root / "live" / "runtime"
            old_inode = original.stat().st_ino
            old_script = original / "ops/release/deploy_release.py"
            old_script.chmod(0o755)
            original_dynamic = {
                p: (original / p).read_bytes() for p in operator.PRESERVED
            }
            old_env_inode = (original / ".env").stat().st_ino
            outcome = activate(root)
            self.assertEqual(outcome["status"], "lab-only-manual-verification-required")
            self.assertFalse(outcome["readyToInstall"])
            self.assertFalse(outcome["automaticRecovery"])
            self.assertFalse(outcome["authorizedToMutateProduction"])
            self.assertTrue(outcome["manualRecoveryRequired"])
            self.assertEqual(operator._source_tree(
                original, with_dynamic=True, sha=NEW)[0], members(NEW))
            old = root / "retained" / "previous"
            self.assertEqual(operator._source_tree(
                old, with_dynamic=True, sha=OLD)[0], members(OLD))
            snapshot = root / "recovery" / "preimage"
            self.assertEqual(operator._source_tree(
                snapshot, with_dynamic=True, sha=OLD)[0], members(OLD))
            self.assertEqual(old.stat().st_ino, old_inode)
            self.assertEqual(stat.S_IMODE((old / "ops/release/deploy_release.py").stat().st_mode), 0o755)
            self.assertEqual(stat.S_IMODE((snapshot / "ops/release/deploy_release.py").stat().st_mode), 0o755)
            self.assertEqual(stat.S_IMODE((original / "ops/release/deploy_release.py").stat().st_mode), 0o644)
            self.assertNotEqual(original.stat().st_ino, old_inode)
            self.assertNotEqual((original / ".env").stat().st_ino, old_env_inode)
            for name, data in original_dynamic.items():
                for slot in (original, old, snapshot):
                    self.assertEqual((slot / name).read_bytes(), data)
            inodes = {
                (slot / ".env").stat().st_ino for slot in (original, old, snapshot)
            }
            self.assertEqual(len(inodes), 3)
            self.assertFalse((root / "stage" / "candidate").exists())
            state = operator.inspect_offline_operator_incident(root, OLD, NEW)
            self.assertEqual(state["journalPhase"], "PREVIOUS_RETAINED")
            self.assertEqual(state["observed"], "previous_retained")
            self.assertFalse(state["automaticRecovery"])
            with self.assertRaisesRegex(ValueError, "unfinished"):
                activate(root)

    def test_injected_stop_keeps_incident_and_never_auto_resumes(self):
        checkpoints = {
            "before_journal": None,
            "after_journal": "before_exchange",
            "after_exchange": "after_exchange",
            "after_exchange_journal": "after_exchange",
            "after_retained": "previous_retained",
            "after_final_journal": "previous_retained",
        }
        for point, location in checkpoints.items():
            with self.subTest(point=point), fixture() as folder:
                root = Path(folder)
                with self.assertRaisesRegex(operator.InjectedStop, point):
                    activate(root, stop_at=point)
                self.assertTrue((root / "recovery" / "preimage").is_dir())
                if location is None:
                    self.assertFalse((root / operator.JOURNAL).exists())
                    self.assertEqual(operator._source_tree(
                        root / "live" / "runtime", with_dynamic=True, sha=OLD
                    )[0], members(OLD))
                else:
                    state = operator.inspect_offline_operator_incident(root, OLD, NEW)
                    self.assertEqual(state["observed"], location)
                    self.assertTrue(state["manualRecoveryRequired"])
                with self.assertRaisesRegex(ValueError, "unfinished"):
                    activate(root)

    def test_archive_untrusted_and_corrupt_block_before_staging(self):
        for attack in ("proof", "digest", "archive", "unchanged source"):
            with self.subTest(attack=attack), fixture() as folder:
                root = Path(folder)
                if attack == "proof":
                    checker = lambda data, sha: {
                        **trusted_in_fixture(data, sha), "verified": False,
                    }
                elif attack == "digest":
                    checker = lambda data, sha: {
                        **trusted_in_fixture(data, sha),
                        "runtimeArchiveDigest": "sha256:" + "0" * 64,
                    }
                elif attack == "unchanged source":
                    checker = trusted_in_fixture
                    # Source SHA differs, but no listed file actually changed.
                    new = members(OLD)
                    path = root / "proof" / operator.ARCHIVE
                    path.write_bytes(encode_bundle(new, manifest(NEW, new)))
                else:
                    checker = trusted_in_fixture
                    (root / "proof" / operator.ARCHIVE).write_bytes(b"not-gzip")
                with self.assertRaises((ValueError, OSError, TypeError)):
                    activate(root, verifier=checker)
                self.assertFalse((root / operator.JOURNAL).exists())
                self.assertFalse((root / "stage" / "candidate").exists())

    def test_unknown_paths_symlink_and_world_writable_roots_rejected(self):
        with fixture() as folder:
            root = Path(folder)
            for unsafe in (Path("/opt/sanq/runtime"), Path("/tmp"), root / "live"):
                with self.subTest(unsafe=str(unsafe)):
                    with self.assertRaises(ValueError):
                        activate(unsafe)
            alias = root.parent / ("alias-" + root.name)
            try:
                alias.symlink_to(root, target_is_directory=True)
                with self.assertRaises(ValueError):
                    activate(alias)
            finally:
                alias.unlink(missing_ok=True)
            root.chmod(0o777)
            with self.assertRaises(ValueError):
                activate(root)
            root.chmod(0o700)
            (root / operator.MARKER).write_bytes(b"forged")
            with self.assertRaises(ValueError):
                activate(root)

    def test_preflight_wrong_state_and_dynamic_owner_mode_and_hardlinks(self):
        for attack in ("pending", "env-drift", "bad-mode", "hardlink", "symlink"):
            with self.subTest(attack=attack), fixture() as folder:
                root = Path(folder)
                active = root / "live" / "runtime"
                if attack == "pending":
                    path = active / ".sanq-release-state.json"
                    state = json.loads(path.read_text())
                    state["phase"] = "pending"
                    path.write_text(json.dumps(state))
                elif attack == "env-drift":
                    (active / ".env").write_text("SANQ_IMAGE_SHA=" + NEW + "\n")
                elif attack == "bad-mode":
                    (active / ".env").chmod(0o644)
                elif attack == "hardlink":
                    path = active / "docker-compose.yml"
                    other = root / "proof" / "alias"
                    os.link(path, other)
                else:
                    path = active / "docker-compose.yml"
                    path.unlink()
                    path.symlink_to(root / "proof" / operator.ARCHIVE)
                with self.assertRaises((ValueError, OSError)):
                    activate(root)
                self.assertFalse((root / operator.JOURNAL).exists())
                self.assertFalse((root / "recovery" / "preimage").exists())

    def test_lock_and_existing_recovery_slot_fail_closed(self):
        with fixture() as folder:
            root = Path(folder)
            lock = os.open(root / operator.LOCK, os.O_CREAT | os.O_RDWR, 0o600)
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaisesRegex(ValueError, "concurrent"):
                    activate(root)
            finally:
                os.close(lock)
            self.assertFalse((root / operator.JOURNAL).exists())
        with fixture() as folder:
            root = Path(folder)
            (root / "recovery" / "preimage").mkdir()
            with self.assertRaisesRegex(ValueError, "unfinished"):
                activate(root)
            self.assertFalse((root / operator.JOURNAL).exists())

    def test_readonly_inspection_detects_corrupt_snapshot_and_advanced_journal(self):
        with fixture() as folder:
            root = Path(folder)
            with self.assertRaises(operator.InjectedStop):
                activate(root, stop_at="after_journal")
            journal = root / operator.JOURNAL
            record = json.loads(journal.read_text())
            record["phase"] = "PREVIOUS_RETAINED"
            journal.write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError, "ahead"):
                operator.inspect_offline_operator_incident(root, OLD, NEW)
        with fixture() as folder:
            root = Path(folder)
            activate(root)
            (root / "recovery" / "preimage" / ".env").write_bytes(b"drift")
            with self.assertRaises(ValueError):
                operator.inspect_offline_operator_incident(root, OLD, NEW)

    def test_corrupt_active_manifest_cannot_masquerade_as_exchanged(self):
        with fixture() as folder:
            root = Path(folder)
            with self.assertRaises(operator.InjectedStop):
                activate(root, stop_at="after_journal")
            active = root / "live" / "runtime" / operator.MANIFEST
            manifest_data = json.loads(active.read_text())
            manifest_data["sourceSha"] = "f" * 40
            active.write_text(json.dumps(manifest_data))
            with self.assertRaises(ValueError):
                operator.inspect_offline_operator_incident(root, OLD, NEW)

    def test_no_production_root_or_service_interface(self):
        for forbidden in ("deploy", "rollback", "production_install", "main"):
            self.assertFalse(hasattr(operator, forbidden))
        self.assertEqual(operator.PREFIX, "sanq-u2d2a-lab-")
        self.assertFalse(hasattr(operator, "sudo"))


if __name__ == "__main__":
    unittest.main()
