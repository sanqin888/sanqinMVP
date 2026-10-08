"""Batch C0 runtime layout inventory contracts; no production filesystem access."""

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "inspect_layout.py"
spec = importlib.util.spec_from_file_location("sanq_inspect_layout", SOURCE)
assert spec is not None and spec.loader is not None
layout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(layout)


def make_fixture(root: Path) -> None:
    for directory in [
        root / ".git",
        root / "uploads",
        root / "backups",
        root / "ops/backup",
    ]:
        directory.mkdir(parents=True, exist_ok=True)
    (root / ".env").write_text("NOT_A_REAL_CREDENTIAL=fixture\n")
    (root / ".env").chmod(0o600)
    (root / "docker-compose.yml").write_text(
        "\n".join(layout.REQUIRED_COMPOSE_TEXT)
    )
    (root / "ops/backup/backup-db.sh").write_text(
        "\n".join(layout.BACKUP_SOURCE_PATHS)
    )
    (root / "ops/backup/sanq-backup-protected-nginx").write_text(
        layout.EXPECTED_HELPER_DIR
    )
    (root / "ops/backup/sanq-backup.service").write_text(
        layout.EXPECTED_SERVICE_SOURCE + "\n" + layout.EXPECTED_SERVICE_JOURNAL
    )


class RuntimeLayoutTests(unittest.TestCase):
    def test_healthy_fixture_is_not_permission_to_cutover(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            with patch.object(layout, "BACKUP_SERVICE", Path("/impossible/should-not-inspect")):
                report = layout.inventory(root)
            self.assertEqual(report["blockers"], [])
            self.assertFalse(report["readyForProductionDirectoryCutover"])
            self.assertNotIn("liveBackupService", report["checks"])
            self.assertEqual(report["checks"]["productionEnv"]["mode"], "0o600")

    def test_missing_uploads_blocks_inventory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            (root / "uploads").rmdir()
            report = layout.inventory(root)
            self.assertIn("uploads", report["blockers"])
            self.assertEqual(report["checks"]["uploads"]["status"], "missing")

    def test_symlinked_uploads_or_env_blocks_inventory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            (root / "uploads").rmdir()
            (root / "uploads").symlink_to(root / "backups", target_is_directory=True)
            report = layout.inventory(root)
            self.assertIn("uploads", report["blockers"])
            self.assertEqual(report["checks"]["uploads"]["status"], "symlink")
            env = root / ".env"
            env.unlink()
            env.symlink_to(root / "docker-compose.yml")
            report = layout.inventory(root)
            self.assertIn("productionEnv", report["blockers"])
            self.assertEqual(report["checks"]["productionEnv"]["status"], "symlink")

    def test_env_permission_exposure_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            os.chmod(root / ".env", 0o644)
            report = layout.inventory(root)
            self.assertIn("envPermissions", report["blockers"])
            self.assertEqual(report["checks"]["envPermissions"]["status"], "unsafe")

    def test_source_contract_drift_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            (root / "docker-compose.yml").write_text("services:\n")
            report = layout.inventory(root)
            self.assertIn("composeMountContracts", report["blockers"])
            self.assertEqual(report["checks"]["composeMountContracts"]["status"], "contract-drift")

    def test_no_file_bytes_of_credentials_are_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            marker = "DO_NOT_ECHO_THIS_SECRET_VALUE"
            (root / ".env").write_text("DB_PASSWORD=" + marker)
            report = layout.inventory(root)
            self.assertNotIn(marker, str(report))
            self.assertFalse(report["readyForProductionDirectoryCutover"])


if __name__ == "__main__":
    unittest.main()
