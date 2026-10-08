#!/usr/bin/env python3
"""Batch C4-A: read-only source compatibility audit for Runtime cutover.

Only reviewed non-secret tracked files are read. No Docker, credentials,
production data, network, subprocesses, or filesystem mutation.
"""

from __future__ import annotations

import argparse
import json
import stat
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SOURCES = (
    "docker-compose.yml",
    "ops/release/deploy_release.py",
    "ops/verify-runtime-readiness.sh",
    "ops/runtime/runtime-layout.v1.json",
    "ops/backup/backup-db.sh",
    "ops/backup/sanq-backup-protected-nginx",
)
MAX_FILE_BYTES = 512 * 1024
PROJECT_NAME = "sanq-app"
DB_VOLUME = "sanq-app_pgdata"
UPLOADS = "/srv/sanq/uploads"
BACKUPS = "/srv/sanq/backups"
RUNTIME = "/opt/sanq/runtime"


def read_source(root: Path, relative: str) -> str | None:
    path = root
    try:
        for segment in Path(relative).parts:
            path = path / segment
            if path.is_symlink():
                return None
        meta = path.stat()
        if not stat.S_ISREG(meta.st_mode) or meta.st_size > MAX_FILE_BYTES:
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None


def audit_content(files: dict[str, str | None]) -> dict[str, Any]:
    blockers: dict[str, str] = {}
    missing = [name for name in SOURCES if not isinstance(files.get(name), str)]
    for name in missing:
        blockers[name] = "required source missing or unsafe"
    if missing:
        return report(blockers)

    compose = files["docker-compose.yml"] or ""
    controller = files["ops/release/deploy_release.py"] or ""
    readiness = files["ops/verify-runtime-readiness.sh"] or ""
    backups = files["ops/backup/backup-db.sh"] or ""
    helper = files["ops/backup/sanq-backup-protected-nginx"] or ""
    try:
        layout = json.loads(files["ops/runtime/runtime-layout.v1.json"] or "")
    except (json.JSONDecodeError, TypeError):
        layout = None
    expected = {
        "composeProjectName": PROJECT_NAME,
        "preservedDatabaseVolume": DB_VOLUME,
        "proposedRuntimeRoot": RUNTIME,
        "proposedUploadsRoot": UPLOADS,
        "proposedBackupsRoot": BACKUPS,
        "productionCutoverAuthorized": False,
        "migrationExecutionAuthorized": False,
    }
    if not isinstance(layout, dict) or any(layout.get(k) != v for k, v in expected.items()):
        blockers["layout"] = "frozen proposed paths or authorization flags differ"

    # Textual checks are conservative hints, not parsed/resolved Compose proof.
    if "name: sanq-app" not in compose:
        blockers["composeProject"] = "Compose project must remain pinned to sanq-app"
    if "./uploads:/app/uploads" in compose or compose.count(
        UPLOADS + ":/app/uploads"
    ) != 2:
        blockers["uploads"] = "API and Uber worker do not both pin /srv/sanq/uploads"
    if "pgdata:/var/lib/postgresql/data" not in compose or (
        "volumes:\n  pgdata:" not in compose
    ):
        blockers["database"] = "original logical Postgres data mount missing"
    if "/home/ubuntu/sanq-assets/sounds:/app/apps/web/public/sounds:ro" not in compose:
        blockers["sounds"] = "unchanged sounds mount missing"

    if (
        'ROOT = Path("/opt/sanq/runtime")' not in controller
        or 'SOURCE_CHECKOUT = Path("/home/ubuntu/sanq-app")' not in controller
        or 'BACKUP_DIR = Path("/srv/sanq/backups")' not in controller
        or '"--project-name", "sanq-app"' not in controller
        or "check_live_storage" not in controller
        or "verify_runtime_release" not in controller
        or "require_c4_activation" not in controller
        or 'backup_dir = ROOT / "backups"' in controller
    ):
        blockers["release"] = "controller lacks fixed runtime, backup, source, digest or mount gates"

    if (
        'compose=(docker compose --env-file "${ENV_FILE}")' in readiness
        or "--project-name" not in readiness
        or "--project-directory" not in readiness
    ):
        blockers["readiness"] = "health helper relies on implicit Compose project/directory"

    if any(phrase not in backups for phrase in (
        'PROJECT_ROOT="/opt/sanq/runtime"',
        'BACKUP_DIR="/srv/sanq/backups"',
        'UPLOADS_DIR="/srv/sanq/uploads"',
    )):
        blockers["backups"] = "backup source does not match proposed paths"
    if 'BACKUP_DIR="/srv/sanq/backups"' not in helper:
        blockers["helper"] = "protected helper backup root differs"

    return report(blockers)


def report(blockers: dict[str, str]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "audit": "c4-static-cutover-contract",
        "blockers": blockers,
        "sourceCompatible": not blockers,
        "productionCutoverAuthorized": False,
        "productionCutoverReady": False,
        "additionalEvidenceRequired": [
            "verified off-VM restore of database, encrypted config, SSL and uploads",
            "running sanq-app project and sanq-app_pgdata physical volume identity",
            "matched source-SHA runtime artifact and paired image manifest digests",
            "uploads ownership/hash reconciliation after a quiesced final copy",
            "backup timer/systemd/sudoers/helper installed identity and permissions",
            "API, worker, Web and backup verification with approved rollback window",
        ],
    }


def audit(root: Path) -> dict[str, Any]:
    return audit_content({
        name: read_source(root, name) for name in SOURCES
    })


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT,
                        help="fixed source checkout or synthetic test fixture")
    args = parser.parse_args()
    result = audit(args.root)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 2 if result["blockers"] else 0


if __name__ == "__main__":
    sys.exit(main())
