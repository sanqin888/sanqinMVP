"""U2B offline filesystem transaction / injected interruption tests (Linux only).

All writes remain inside disposable /tmp/sanq-u2b-offline-* fixtures.
No production code/volume/privileged paths are touched.
"""
import fcntl
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
SPEC = importlib.util.spec_from_file_location("u2b_handoff", ROOT / "offline_runtime_handoff.py")
assert SPEC and SPEC.loader
handoff = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(handoff)

OLD = "a" * 40
NEW = "b" * 40
DYNAMIC = {
    ".env": (b"SANQ_IMAGE_SHA=" + OLD.encode() + b"\n", 0o600),
    ".sanq-release-state.json": (b'{"phase":"active"}\n', 0o600),
    ".sanq-backup-layout-activated": (b"SANQ_BACKUP_LAYOUT_C4_V1\n", 0o644),
}


def runtime_tree(root: Path, slot: str, sha: str) -> None:
    tree = root / slot
    tree.mkdir(mode=0o700)
    members = {}
    for name in handoff.MEMBERS:
        file = tree / name
        file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        for ancestor in file.parents:
            if ancestor == tree:
                break
            ancestor.chmod(0o700)
        data = (sha + ":" + name).encode("utf-8")
        file.write_bytes(data)
        members[name] = {
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
        }
    (tree / "runtime-release.json").write_text(json.dumps({
        "schemaVersion": 1, "sourceBranch": "main", "sourceSha": sha,
        "productionActivationAuthorized": False, "files": members,
    }), encoding="utf-8")
    for name, (data, mode) in DYNAMIC.items():
        file = tree / name
        file.write_bytes(data)
        file.chmod(mode)


def fixture() -> tempfile.TemporaryDirectory:
    ctx = tempfile.TemporaryDirectory(prefix=handoff.PREFIX, dir="/tmp")
    root = Path(ctx.name)
    root.chmod(0o700)
    marker = root / handoff.MARKER
    marker.write_bytes(handoff.MARKER_VALUE)
    marker.chmod(0o600)
    runtime_tree(root, "runtime", OLD)
    runtime_tree(root, "candidate", NEW)
    return ctx


@unittest.skipUnless(sys.platform == "linux", "renameat2 exchange requires Linux")
class OfflineTransactionTests(unittest.TestCase):
    def test_real_atomic_exchange_preserves_both_versions_and_dynamic_bytes(self):
        with fixture() as location:
            root = Path(location)
            result = handoff.run_offline_handoff(root)
            self.assertEqual(result["status"], "offline-awaiting-manual-verification")
            self.assertFalse(result["readyToInstall"])
            self.assertFalse(result["automaticRecovery"])
            self.assertFalse((root / "candidate").exists())
            self.assertEqual(handoff._tree(root, "runtime")[0], NEW)
            self.assertEqual(handoff._tree(root, "previous")[0], OLD)
            for slot in ("runtime", "previous"):
                for name, (data, mode) in DYNAMIC.items():
                    member = root / slot / name
                    self.assertEqual(member.read_bytes(), data)
                    self.assertEqual(member.stat().st_mode & 0o777, mode)
            evidence = handoff.inspect_offline_incident(root)
            self.assertEqual(evidence["journalPhase"], "awaiting_manual_verification")
            self.assertEqual(evidence["observed"], "previous_retained")
            with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "journal"):
                handoff.run_offline_handoff(root)

    def test_five_durability_boundary_injections_leave_recoverable_state(self):
        points = {
            "after_journal": ("before_exchange", OLD),
            "after_exchange": ("after_exchange", NEW),
            "after_exchange_journal": ("after_exchange", NEW),
            "after_retention": ("previous_retained", NEW),
            "after_final_journal": ("previous_retained", NEW),
        }
        for failure_point, (observed, sha) in points.items():
            with self.subTest(failure_point=failure_point), fixture() as location:
                root = Path(location)
                with self.assertRaisesRegex(handoff.InjectedInterruption, failure_point):
                    handoff.run_offline_handoff(root, interrupt_at=failure_point)
                self.assertTrue((root / "runtime").is_dir())
                report = handoff.inspect_offline_incident(root)
                self.assertEqual(report["observed"], observed)
                self.assertEqual(report["activeSha"], sha)
                self.assertEqual(report["manualRecoveryRequired"], "true")
                other = "previous" if observed == "previous_retained" else "candidate"
                self.assertEqual(handoff._tree(root, other)[0], NEW if sha == OLD else OLD)
                with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "journal"):
                    handoff.run_offline_handoff(root)

    def test_before_journal_injection_has_no_persistent_state_change(self):
        with fixture() as location:
            root = Path(location)
            with self.assertRaises(handoff.InjectedInterruption):
                handoff.run_offline_handoff(root, interrupt_at="before_journal")
            self.assertFalse((root / handoff.JOURNAL).exists())
            self.assertEqual(handoff._tree(root, "runtime")[0], OLD)
            self.assertEqual(handoff._tree(root, "candidate")[0], NEW)

    def test_dirty_candidate_and_corrupt_member_block_before_journal(self):
        for corruption in ("dynamic", "member", "symlink", "extra_directory"):
            with self.subTest(corruption=corruption), fixture() as location:
                root = Path(location)
                candidate = root / "candidate"
                if corruption == "dynamic":
                    (candidate / ".env").write_bytes(b"mismatch")
                elif corruption == "member":
                    (candidate / "docker-compose.yml").write_bytes(b"malicious")
                elif corruption == "symlink":
                    member = candidate / "docker-compose.yml"
                    member.unlink()
                    member.symlink_to(candidate / "runtime-release.json")
                else:
                    (candidate / "surprise").mkdir(mode=0o700)
                with self.assertRaises(handoff.OfflineHandoffBlocked):
                    handoff.run_offline_handoff(root)
                self.assertFalse((root / handoff.JOURNAL).exists())
                self.assertEqual(handoff._tree(root, "runtime")[0], OLD)

    def test_lock_contention_fails_closed_without_journal(self):
        with fixture() as location:
            root = Path(location)
            fd = os.open(root / handoff.LOCK, os.O_CREAT | os.O_RDWR, 0o600)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "concurrent"):
                    handoff.run_offline_handoff(root)
                self.assertFalse((root / handoff.JOURNAL).exists())
            finally:
                os.close(fd)

    def test_privileged_invocation_refused_even_for_an_offline_fixture(self):
        with fixture() as location:
            with patch.object(handoff.os, "geteuid", return_value=0):
                with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "privileged"):
                    handoff.run_offline_handoff(Path(location))

    def test_never_accepts_non_fixture_or_symlink_root(self):
        with fixture() as location:
            root = Path(location)
            alias = root.parent / ("alias-" + root.name)
            try:
                alias.symlink_to(root, target_is_directory=True)
                for unsafe in (Path("/opt/sanq/runtime"), root / "runtime", alias, Path("/tmp")):
                    with self.subTest(unsafe=unsafe):
                        with self.assertRaises(handoff.OfflineHandoffBlocked):
                            handoff.run_offline_handoff(unsafe)
            finally:
                alias.unlink(missing_ok=True)

    def test_partial_journal_write_fails_closed_without_exchange(self):
        with fixture() as location:
            root = Path(location)
            (root / ".u2b-journal-next").write_bytes(b"partial prior transaction")
            with self.assertRaises(FileExistsError):
                handoff.run_offline_handoff(root)
            self.assertEqual(handoff._tree(root, "runtime")[0], OLD)
            self.assertEqual(handoff._tree(root, "candidate")[0], NEW)
            self.assertFalse((root / handoff.JOURNAL).exists())

    def test_incident_inspection_detects_dynamic_drift_and_phase_impossibility(self):
        with fixture() as location:
            root = Path(location)
            with self.assertRaises(handoff.InjectedInterruption):
                handoff.run_offline_handoff(root, interrupt_at="after_exchange")
            old_candidate = root / "candidate" / ".env"
            old_candidate.write_bytes(b"tampered")
            with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "dynamic state"):
                handoff.inspect_offline_incident(root)
        with fixture() as location:
            root = Path(location)
            with self.assertRaises(handoff.InjectedInterruption):
                handoff.run_offline_handoff(root, interrupt_at="after_journal")
            journal = root / handoff.JOURNAL
            value = json.loads(journal.read_text(encoding="utf-8"))
            value["phase"] = "awaiting_manual_verification"
            journal.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "phase disagree"):
                handoff.inspect_offline_incident(root)

    def test_modified_journal_is_not_auto_recovered(self):
        with fixture() as location:
            root = Path(location)
            with self.assertRaises(handoff.InjectedInterruption):
                handoff.run_offline_handoff(root, interrupt_at="after_exchange")
            journal = root / handoff.JOURNAL
            value = json.loads(journal.read_text(encoding="utf-8"))
            value["productionActivationAuthorized"] = True
            journal.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "journal invalid"):
                handoff.inspect_offline_incident(root)
            with self.assertRaisesRegex(handoff.OfflineHandoffBlocked, "journal"):
                handoff.run_offline_handoff(root)


if __name__ == "__main__":
    unittest.main()
