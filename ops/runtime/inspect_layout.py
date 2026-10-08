#!/usr/bin/env python3
"""SanQ Batch C0: read-only inventory for the planned runtime-directory split.

Runs without Docker, network, privileged subprocesses or source mutation.
Never opens .env, private keys, user uploads or backup archive contents.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any

PRODUCTION_ROOT = Path("/home/ubuntu/sanq-app")
MCP_WORKSPACE = Path("/home/ubuntu/sanq-mcp-workspace")
SOUNDS_ROOT = Path("/home/ubuntu/sanq-assets/sounds")
HELPER = Path("/usr/local/sbin/sanq-backup-protected-nginx")
BACKUP_SERVICE = Path("/etc/systemd/system/sanq-backup.service")
BACKUP_TIMER = Path("/etc/systemd/system/sanq-backup.timer")
BACKUP_SUDOERS = Path("/etc/sudoers.d/sanq-backup")
REQUIRED_COMPOSE_TEXT = (
    "pgdata:/var/lib/postgresql/data",
    "/srv/sanq/uploads:/app/uploads",
    "/home/ubuntu/sanq-assets/sounds:/app/apps/web/public/sounds:ro",
)
BACKUP_SOURCE_PATHS = (
    'PROJECT_ROOT="/opt/sanq/runtime"',
    'BACKUP_DIR="/srv/sanq/backups"',
    'UPLOADS_DIR="/srv/sanq/uploads"',
    'ENV_FILE="$PROJECT_ROOT/.env"',
)
EXPECTED_SERVICE_SOURCE = "ExecStart=/home/ubuntu/backup-db.sh"
EXPECTED_SERVICE_JOURNAL = "StandardOutput=journal"
EXPECTED_HELPER_DIR = 'BACKUP_DIR="/srv/sanq/backups"'


def path_info(path: Path, expected: str) -> dict[str, Any]:
    """Report only metadata, never list any sensitive directory entries."""
    result: dict[str, Any] = {"path": str(path), "expected": expected}
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return {**result, "status": "missing"}
    except OSError as exc:
        return {**result, "status": "unreadable", "reason": type(exc).__name__}
    if stat.S_ISLNK(metadata.st_mode):
        return {**result, "status": "symlink"}
    actual = (
        "directory" if stat.S_ISDIR(metadata.st_mode)
        else "file" if stat.S_ISREG(metadata.st_mode)
        else "other"
    )
    return {
        **result,
        "status": "ok" if actual == expected else "wrong-type",
        "actual": actual,
        "mode": oct(stat.S_IMODE(metadata.st_mode)),
        "uid": metadata.st_uid,
        "gid": metadata.st_gid,
    }


def source_contains(source: Path, phrases: tuple[str, ...]) -> dict[str, Any]:
    """Inspect tracked non-secret source/config templates only."""
    path_state = path_info(source, "file")
    if path_state["status"] != "ok":
        return {"status": "blocked", "reason": "required source missing or unsafe"}
    try:
        content = source.read_text(encoding="utf-8")
    except (UnicodeError, OSError) as exc:
        return {"status": "blocked", "reason": type(exc).__name__}
    missing = [text for text in phrases if text not in content]
    return {"status": "ok" if not missing else "contract-drift", "missingContracts": missing}


def inventory(root: Path, *, actual_host_checks: bool = False) -> dict[str, Any]:
    """Inspect a nominated installation; host system paths are opt-in."""
    checks = {
        "runtimeRoot": path_info(root, "directory"),
        "compose": path_info(root / "docker-compose.yml", "file"),
        "productionEnv": path_info(root / ".env", "file"),
        "uploads": path_info(root / "uploads", "directory"),
        "backups": path_info(root / "backups", "directory"),
        "checkoutMetadata": path_info(root / ".git", "directory"),
        "backupSource": source_contains(
            root / "ops/backup/backup-db.sh", BACKUP_SOURCE_PATHS
        ),
        "composeMountContracts": source_contains(
            root / "docker-compose.yml", REQUIRED_COMPOSE_TEXT
        ),
        "helperSource": source_contains(
            root / "ops/backup/sanq-backup-protected-nginx", (EXPECTED_HELPER_DIR,)
        ),
        "backupUnitSource": source_contains(
            root / "ops/backup/sanq-backup.service",
            (EXPECTED_SERVICE_SOURCE, EXPECTED_SERVICE_JOURNAL),
        ),
    }
    # In test/CI a temporary mocked tree must never inspect real host paths.
    if actual_host_checks:
        checks.update({
            "liveBackupService": path_info(BACKUP_SERVICE, "file"),
            "liveBackupTimer": path_info(BACKUP_TIMER, "file"),
            "livePrivilegedHelper": path_info(HELPER, "file"),
            "liveBackupSudoers": path_info(BACKUP_SUDOERS, "file"),
            "mcpWorkspace": path_info(MCP_WORKSPACE, "directory"),
            "sounds": path_info(SOUNDS_ROOT, "directory"),
        })
    env = checks["productionEnv"]
    env_mode = int(env["mode"], 8) if env["status"] == "ok" else None
    # Production environment includes credentials; group/world access is unsafe.
    if env_mode is not None and env_mode & 0o077:
        checks["envPermissions"] = {"status": "unsafe", "reason": "group/world mode bits"}
    else:
        checks["envPermissions"] = {
            "status": "ok" if env_mode is not None else "unverified"
        }
    blockers = [
        name for name, check in checks.items()
        if check["status"] not in ("ok",)
    ]
    return {
        "schemaVersion": 1,
        "inspectionMode": "host" if actual_host_checks else "workspace-fixture",
        "checks": checks,
        "blockers": blockers,
        "readyForProductionDirectoryCutover": False,
        "manualEvidenceStillRequired": [
            "docker compose project identity and actual volume mount provenance",
            "current backup timer status plus latest off-VM upload and restore evidence",
            "production Nginx/SSL root-only permissions and protected-helper parity",
            "MCP systemd unit/tunnel configuration and production read root",
            "upload file ownership, counts, retention and two-pass transfer consistency",
            "operator-authorized maintenance window and backout procedure",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=PRODUCTION_ROOT,
        help="Path of installation to inspect (never written)",
    )
    parser.add_argument(
        "--host", action="store_true",
        help="Also inspect fixed known host service, helper, workspace and asset paths",
    )
    args = parser.parse_args()
    result = inventory(args.root, actual_host_checks=args.host)
    print(json.dumps(result, indent=2))
    # Nonzero on any local filesystem blocker, but never implies production
    # cutover authority when all passive checks happen to pass.
    return 2 if result["blockers"] else 0


if __name__ == "__main__":
    sys.exit(main())
