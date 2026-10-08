"""Offline C3-A non-mutating backup/Runtime migration boundary tests."""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "audit_backup_cutover.py"
SPEC = importlib.util.spec_from_file_location("sanq_backup_cutover_audit", SOURCE)
assert SPEC is not None and SPEC.loader is not None
audit_tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_tool)


def fixture(root: Path) -> None:
    for name, required in audit_tool.CONTRACTS.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(required) + "\n", encoding="utf-8")
    layout = root / "ops/runtime/runtime-layout.v1.json"
    layout.parent.mkdir(parents=True, exist_ok=True)
    layout.write_text(json.dumps(audit_tool.EXPECTED_LAYOUT), encoding="utf-8")


class BackupCutoverAuditTests(unittest.TestCase):
    def test_valid_source_fixture_is_not_cutover_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            result = audit_tool.audit(root)
            self.assertEqual(result["blockers"], [])
            self.assertFalse(result["readyForProductionCutover"])
            self.assertFalse(result["backupAndMigrationAuthorization"])
            self.assertEqual(result["hostMetadata"], {})
            self.assertTrue(result["layoutCheck"]["matchingFrozenContract"])

    def test_deviating_volume_and_path_are_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            layout = root / "ops/runtime/runtime-layout.v1.json"
            data = json.loads(layout.read_text())
            data["preservedDatabaseVolume"] = "new_empty_volume"
            layout.write_text(json.dumps(data))
            result = audit_tool.audit(root)
            self.assertIn("runtime-layout.v1.json", result["blockers"])

    def test_backup_privilege_widening_or_disappearing_contract_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            sudoers = root / "ops/backup/sanq-backup.sudoers"
            sudoers.write_text(sudoers.read_text() + "\nALL=(ALL) NOPASSWD: ALL\n")
            result = audit_tool.audit(root)
            self.assertIn("ops/backup/sanq-backup.sudoers", result["blockers"])
            self.assertTrue(
                result["sourceChecks"]["ops/backup/sanq-backup.sudoers"]["unsafeLegacyContract"]
            )
            script = root / "ops/backup/backup-db.sh"
            script.write_text("PROJECT_ROOT=/tmp\n")
            result = audit_tool.audit(root)
            self.assertIn("ops/backup/backup-db.sh", result["blockers"])

    def test_tracked_source_symlinks_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            helper = root / "ops/backup/sanq-backup-protected-nginx"
            helper.unlink()
            helper.symlink_to(root / "ops/backup/backup-db.sh")
            result = audit_tool.audit(root)
            self.assertIn("ops/backup/sanq-backup-protected-nginx", result["blockers"])

    def test_host_check_uses_stat_only_never_reads_env_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            old = root / "legacy"
            old.mkdir()
            for directory in ("uploads", "backups"):
                (old / directory).mkdir()
            (old / "docker-compose.yml").write_text("fake")
            secret = "fixture-credential-value"
            (old / ".env").write_text(secret)
            (old / ".env").chmod(0o600)
            def fake_host():
                return {
                    "legacyUploads": audit_tool.observe_path(old / "uploads"),
                    "legacyBackups": audit_tool.observe_path(old / "backups"),
                    "legacyEnv": audit_tool.observe_path(old / ".env"),
                    "legacyCompose": audit_tool.observe_path(old / "docker-compose.yml"),
                    "futureUploads": {"status": "missing"},
                    "futureBackups": {"status": "missing"},
                    "futureRuntime": {"status": "missing"},
                }
            with patch.object(audit_tool, "host_metadata", side_effect=fake_host):
                report = audit_tool.audit(root, inspect_host=True)
                self.assertEqual(report["blockers"], [])
                self.assertNotIn(secret, json.dumps(report))
                os.chmod(old / ".env", 0o644)
                report = audit_tool.audit(root, inspect_host=True)
                self.assertIn("legacyEnvPermissions", report["blockers"])

    def test_host_path_rejects_symlink_ancestor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            real = root / "real"
            real.mkdir()
            alias = root / "link"
            alias.symlink_to(real, target_is_directory=True)
            self.assertEqual(
                audit_tool.observe_path(alias / "uploads")["status"],
                "symlink-ancestor",
            )

    def test_existing_target_symlink_and_world_writable_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            with patch.object(audit_tool, "host_metadata", return_value={
                "legacyUploads": {"status": "ok", "kind": "directory"},
                "legacyBackups": {"status": "ok", "kind": "directory"},
                "legacyEnv": {"status": "ok", "kind": "file", "mode": "0o600"},
                "legacyCompose": {"status": "ok", "kind": "file"},
                "futureUploads": {"status": "symlink"},
                "futureBackups": {"status": "ok", "kind": "directory", "mode": "0o777"},
                "futureRuntime": {"status": "missing"},
            }):
                result = audit_tool.audit(root, inspect_host=True)
            self.assertIn("futureUploads", result["blockers"])
            self.assertIn("futureBackupsUnsafe", result["blockers"])


if __name__ == "__main__":
    unittest.main()
