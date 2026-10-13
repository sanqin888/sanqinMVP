"""Offline S1 protected configuration snapshot safety contract tests.

Only synthetic directories, synthetic credentials and a fake encrypted transport.
No real VM root paths, sudo, Docker, or Google Drive.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "protected_config_snapshot.py"
SPEC = importlib.util.spec_from_file_location("protected_config_snapshot", MODULE)
assert SPEC and SPEC.loader
import sys
snapshot_module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = snapshot_module
SPEC.loader.exec_module(snapshot_module)

OLD_SHA = "a" * 40
APP_SHA = "b" * 40


class FakeEncryptedRemote:
    def __init__(self, *, corrupt: bool = False, reject: bool = False) -> None:
        self.objects: dict[str, bytes] = {}
        self.corrupt = corrupt
        self.reject = reject

    def create_only(self, key: str, payload: bytes) -> None:
        if self.reject or key in self.objects:
            raise OSError("remote failure or key already exists")
        self.objects[key] = payload

    def read_back(self, key: str) -> bytes:
        value = self.objects[key]
        return value + b"CORRUPT" if self.corrupt else value


class SnapshotSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="sanq-s1-")
        self.addCleanup(self.temp.cleanup)
        self.anchor = Path(self.temp.name)
        self.runtime = self.anchor / "runtime"
        self.runtime.mkdir(mode=0o700)
        uid, gid = os.getuid(), os.getgid()
        self.ids = snapshot_module.Identity(uid, gid, uid, gid)
        self.write(".env", ("SANQ_IMAGE_SHA=" + APP_SHA + "\nFIXTURE_SENTINEL=synthetic-only\n").encode(), 0o600)
        self.write(".sanq-release-state.json", json.dumps({
            "schemaVersion": 1, "phase": "active", "current": APP_SHA,
            "previous": OLD_SHA,
        }).encode(), 0o600)
        self.write(".sanq-backup-layout-activated",
                   snapshot_module.MARKER, 0o644)
        self.write("docker-compose.yml", (
            "name: sanq-app\n"
            "pgdata:/var/lib/postgresql/data\n"
            "/srv/sanq/uploads:/app/uploads\n"
            "/srv/sanq/uploads:/app/uploads\n"
        ).encode(), 0o644)
        self.write("runtime-release.json", json.dumps({
            "schemaVersion": 1, "artifactKind": "sanq-runtime-source-pinned",
            "sourceBranch": "main", "sourceSha": OLD_SHA,
            "productionActivationAuthorized": False,
            "applicationImages": {
                name: {"ref": f"ghcr.io/sanqin888/{name}:{OLD_SHA}",
                       "digest": "sha256:" + "2" * 64}
                for name in ("sanq-api", "sanq-web")
            },
            "files": {
                name: {"sha256": "1" * 64, "bytes": 12}
                for name in snapshot_module.RUNTIME_SOURCE_MEMBERS
            },
        }).encode(), 0o644)

    def write(self, name: str, data: bytes, mode: int) -> None:
        path = self.runtime / name
        path.write_bytes(data)
        path.chmod(mode)

    def capture(self):
        return snapshot_module._capture(self.runtime, anchor=self.anchor, ids=self.ids)

    def test_pinned_inventory_matches_runtime_source_allowlist(self) -> None:
        runtime_build = Path(__file__).resolve().parents[2] / "runtime" / "build_bundle.py"
        import ast
        source = ast.parse(runtime_build.read_text())
        declaration = next(node for node in source.body
                           if isinstance(node, ast.Assign)
                           and any(isinstance(target, ast.Name)
                                   and target.id == "SOURCE_FILES"
                                   for target in node.targets))
        self.assertEqual(tuple(ast.literal_eval(declaration.value)),
                         snapshot_module.RUNTIME_SOURCE_MEMBERS)
        self.assertEqual(len(snapshot_module.RUNTIME_SOURCE_MEMBERS), 17)
        self.assertEqual(len(snapshot_module.MEMBERS), 5)

    def test_exact_synthetic_bytes_roundtrip_and_redacted_receipt(self) -> None:
        shot = self.capture()
        self.assertEqual(shot.app_sha, APP_SHA)
        self.assertEqual(shot.runtime_sha, OLD_SHA)
        self.assertFalse(shot.ready_to_install)
        self.assertNotIn("synthetic-only", repr(shot))
        fake = FakeEncryptedRemote()
        receipt = snapshot_module.verify_remote_round_trip(
            shot, fake, mode="daily", transaction_id="c" * 32)
        self.assertEqual(receipt["fileCount"], 5)
        self.assertFalse(receipt["readyToInstall"])
        self.assertFalse(receipt["productionRemoteVerified"])
        self.assertNotIn("synthetic-only", str(receipt))
        self.assertEqual(len(fake.objects), 1)
        payload = next(iter(fake.objects.values()))
        self.assertNotIn(b"synthetic-only", str(receipt).encode())
        snapshot_module.verify_archive(payload, receipt["archiveSha256"])

    def test_completed_rollback_is_stable_for_daily_snapshot(self) -> None:
        self.write(".sanq-release-state.json", json.dumps({
            "schemaVersion": 1, "phase": "rolled-back",
            "current": APP_SHA, "previous": OLD_SHA,
        }).encode(), 0o600)
        shot = self.capture()
        self.assertEqual(shot.app_sha, APP_SHA)
        self.assertFalse(shot.ready_to_install)

    def test_preinstall_and_daily_namespaces_are_closed(self) -> None:
        shot = self.capture()
        remote = FakeEncryptedRemote()
        receipt = snapshot_module.verify_remote_round_trip(
            shot, remote, mode="preinstall", transaction_id="f" * 32)
        self.assertEqual(
            receipt["remoteKey"],
            "runtime-recovery/" + "f" * 32 + "/config-snapshot.tar.gz",
        )
        for mode, txid in (("evil", "a" * 32), ("daily", "../unsafe"),
                           ("preinstall", "A" * 32)):
            with self.subTest(mode=mode, txid=txid):
                with self.assertRaises(snapshot_module.SnapshotBlocked):
                    snapshot_module.verify_remote_round_trip(
                        shot, remote, mode=mode, transaction_id=txid)

    def test_remote_failures_are_never_verified(self) -> None:
        shot = self.capture()
        for fake in (FakeEncryptedRemote(corrupt=True),
                     FakeEncryptedRemote(reject=True)):
            with self.subTest(fake=vars(fake)):
                with self.assertRaises(snapshot_module.SnapshotBlocked):
                    snapshot_module.verify_remote_round_trip(
                        shot, fake, mode="daily", transaction_id="e" * 32)
        reused = FakeEncryptedRemote()
        snapshot_module.verify_remote_round_trip(
            shot, reused, mode="daily", transaction_id="e" * 32)
        with self.assertRaises(snapshot_module.SnapshotBlocked):
            snapshot_module.verify_remote_round_trip(
                shot, reused, mode="daily", transaction_id="e" * 32)

    def test_invalid_release_state_and_env(self) -> None:
        cases = (
            (".env", b"SANQ_IMAGE_SHA=" + APP_SHA.encode() + b"\nSANQ_IMAGE_SHA=" + APP_SHA.encode()),
            (".env", b"DB_PASSWORD=only"),
            (".sanq-release-state.json", json.dumps({
                "schemaVersion": 1, "phase": "pending",
                "current": APP_SHA, "previous": OLD_SHA,
            }).encode()),
            (".sanq-release-state.json", json.dumps({
                "schemaVersion": 1, "phase": "active",
                "current": OLD_SHA, "previous": APP_SHA,
            }).encode()),
            (".sanq-backup-layout-activated", b"UNACTIVATED\n"),
            ("docker-compose.yml", b"name: wrong\n"),
            ("runtime-release.json", b"{}"),
        )
        for name, corrupted in cases:
            with self.subTest(name=name, corrupted=corrupted[:40]):
                file = self.runtime / name
                original = file.read_bytes()
                file.write_bytes(corrupted)
                with self.assertRaises(snapshot_module.SnapshotBlocked):
                    self.capture()
                file.write_bytes(original)

    def test_symlinks_hardlinks_and_modes_rejected(self) -> None:
        file = self.runtime / ".sanq-release-state.json"
        original = file.read_bytes()
        file.unlink()
        file.symlink_to(self.runtime / ".env")
        with self.assertRaises(snapshot_module.SnapshotBlocked):
            self.capture()
        file.unlink()
        self.write(file.name, original, 0o600)
        linked = self.runtime / "alias"
        os.link(file, linked)
        with self.assertRaises(snapshot_module.SnapshotBlocked):
            self.capture()
        linked.unlink()
        file.chmod(0o640)
        with self.assertRaises(snapshot_module.SnapshotBlocked):
            self.capture()

    def test_root_and_ubuntu_identity_are_distinct_contracts(self) -> None:
        expected = self.ids
        wrong_ubuntu = snapshot_module.Identity(
            expected.root_uid, expected.root_gid,
            expected.ubuntu_uid + 1, expected.ubuntu_gid)
        with self.assertRaises(snapshot_module.SnapshotBlocked):
            snapshot_module._capture(self.runtime, anchor=self.anchor, ids=wrong_ubuntu)
        wrong_root = snapshot_module.Identity(
            expected.root_uid + 1, expected.root_gid,
            expected.ubuntu_uid, expected.ubuntu_gid)
        with self.assertRaises(snapshot_module.SnapshotBlocked):
            snapshot_module._capture(self.runtime, anchor=self.anchor, ids=wrong_root)

    def test_replacement_between_reads_rejected(self) -> None:
        real = snapshot_module._read_member
        reads = 0
        def swapped(fd, name, ids):
            nonlocal reads
            result = real(fd, name, ids)
            reads += 1
            if reads == len(snapshot_module.MEMBERS):
                self.write(".env", b"SANQ_IMAGE_SHA=" + APP_SHA.encode() + b"\nX=changed", 0o600)
            return result
        with patch.object(snapshot_module, "_read_member", side_effect=swapped):
            with self.assertRaises(snapshot_module.SnapshotBlocked):
                self.capture()

    def test_no_executable_or_root_escalation_entrypoint(self) -> None:
        source = MODULE.read_text()
        self.assertNotIn('if __name__ == "__main__":', source)
        self.assertNotIn("subprocess", source)
        self.assertNotIn("sudo ", source)
        self.assertNotIn("rclone copy", source)
        self.assertNotIn("os.system(", source)


if __name__ == "__main__":
    unittest.main()
