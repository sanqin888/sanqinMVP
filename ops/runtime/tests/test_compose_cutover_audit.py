"""C4-A source-only cutover compatibility gates; no host or Docker access."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "audit_compose_cutover.py"
SPEC = importlib.util.spec_from_file_location("sanq_c4_source_audit", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def fixture(*, upgraded: bool = False):
    mount = (
        "/srv/sanq/uploads:/app/uploads" if upgraded
        else "./uploads:/app/uploads"
    )
    controller = (
        'ROOT = Path("/opt/sanq/runtime")\n'
        'SOURCE_CHECKOUT = Path("/home/ubuntu/sanq-app")\n'
        'BACKUP_DIR = Path("/srv/sanq/backups")\n'
        '"--project-name", "sanq-app"\n'
        "check_live_storage\nverify_runtime_release\nrequire_c4_activation\n"
        if upgraded else
        '"--project-name", "sanq-app"\n'
        'backup_dir = ROOT / "backups"\n'
    )
    helper = (
        'compose=(docker compose --project-name sanq-app --project-directory /opt/sanq/runtime -f /opt/sanq/runtime/docker-compose.yml)\n'
        if upgraded else
        'compose=(docker compose --env-file "${ENV_FILE}")\n'
    )
    files = {
        "docker-compose.yml": (
            ("name: sanq-app\n" if upgraded else "")
            + "services:\n"
            "  db:\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n"
            "  api:\n    volumes:\n      - " + mount + "\n"
            "  ubereats-worker:\n    volumes:\n      - " + mount + "\n"
            "  web:\n    volumes:\n      - /home/ubuntu/sanq-assets/sounds:/app/apps/web/public/sounds:ro\n"
            "volumes:\n  pgdata:\n"
        ),
        "ops/release/deploy_release.py": controller,
        "ops/verify-runtime-readiness.sh": helper,
        "ops/runtime/runtime-layout.v1.json": json.dumps({
            "composeProjectName": "sanq-app",
            "preservedDatabaseVolume": "sanq-app_pgdata",
            "proposedRuntimeRoot": "/opt/sanq/runtime",
            "proposedUploadsRoot": "/srv/sanq/uploads",
            "proposedBackupsRoot": "/srv/sanq/backups",
            "productionCutoverAuthorized": False,
            "migrationExecutionAuthorized": False,
        }),
        "ops/backup/backup-db.sh": (
            'PROJECT_ROOT="/opt/sanq/runtime"\n'
            'BACKUP_DIR="/srv/sanq/backups"\n'
            'UPLOADS_DIR="/srv/sanq/uploads"\n'
        ),
        "ops/backup/sanq-backup-protected-nginx": (
            'BACKUP_DIR="/srv/sanq/backups"\n'
        ),
    }
    assert set(files) == set(audit.SOURCES)
    return files


class CutoverAuditTests(unittest.TestCase):
    def test_existing_legacy_source_has_explicit_blockers(self):
        result = audit.audit_content(fixture())
        self.assertEqual(set(result["blockers"]), {
            "composeProject", "uploads", "release", "readiness",
        })
        self.assertFalse(result["sourceCompatible"])
        self.assertFalse(result["productionCutoverReady"])
        self.assertFalse(result["productionCutoverAuthorized"])

    def test_even_compatible_source_does_not_authorize_cutover(self):
        result = audit.audit_content(fixture(upgraded=True))
        self.assertEqual(result["blockers"], {})
        self.assertTrue(result["sourceCompatible"])
        self.assertFalse(result["productionCutoverReady"])
        self.assertFalse(result["productionCutoverAuthorized"])
        self.assertTrue(result["additionalEvidenceRequired"])

    def test_volume_or_layout_drift_fails_closed(self):
        f = fixture(upgraded=True)
        f["docker-compose.yml"] = f["docker-compose.yml"].replace(
            "pgdata:/var/lib/postgresql/data", "freshdb:/var/lib/postgresql/data"
        )
        self.assertIn("database", audit.audit_content(f)["blockers"])
        f = fixture(upgraded=True)
        layout = json.loads(f["ops/runtime/runtime-layout.v1.json"])
        layout["productionCutoverAuthorized"] = True
        f["ops/runtime/runtime-layout.v1.json"] = json.dumps(layout)
        self.assertIn("layout", audit.audit_content(f)["blockers"])

    def test_unsafe_source_symlink_rejected_and_no_secret_echo(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = fixture(upgraded=True)
            for name, content in files.items():
                dest = root / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(content)
            report = audit.audit(root)
            self.assertTrue(report["sourceCompatible"])
            path = root / "docker-compose.yml"
            path.unlink()
            path.symlink_to(root / "ops/backup/backup-db.sh")
            report = audit.audit(root)
            self.assertIn("docker-compose.yml", report["blockers"])
            self.assertNotIn("PROJECT_ROOT=", json.dumps(report))

    def test_missing_source_never_becomes_ready(self):
        f = fixture(upgraded=True)
        f.pop("ops/backup/backup-db.sh")
        result = audit.audit_content(f)
        self.assertFalse(result["sourceCompatible"])
        self.assertIn("ops/backup/backup-db.sh", result["blockers"])


if __name__ == "__main__":
    unittest.main()
