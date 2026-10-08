#!/usr/bin/env python3
"""SanQ C3-A: read-only backup/uploads migration boundary inventory.

Does not read .env contents, backups, uploaded files, credentials or TLS keys.
Does not execute Docker, rclone, sudo, migrations, or host modification.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
LAYOUT = ROOT / "ops/runtime/runtime-layout.v1.json"
LEGACY = Path("/home/ubuntu/sanq-app")

# Every assertion is about a reviewed, non-secret source contract only.
CONTRACTS: dict[str, tuple[str, ...]] = {
    "ops/backup/backup-db.sh": (
        'PROJECT_ROOT="/opt/sanq/runtime"',
        'BACKUP_DIR="/srv/sanq/backups"',
        'UPLOADS_DIR="/srv/sanq/uploads"',
        'ENV_FILE="$PROJECT_ROOT/.env"',
        'PROTECTED_NGINX_HELPER="/usr/local/sbin/sanq-backup-protected-nginx"',
        'REMOTE_UPLOADS_CURRENT="$REMOTE_ROOT/uploads-current"',
        'REMOTE_UPLOADS_HISTORY="$REMOTE_ROOT/uploads-history"',
        'RCLONE_SECURE_REMOTE="gdrive_secure"',
        'sudo -n "$PROTECTED_NGINX_HELPER" "$NGINX_FILENAME"',
        "rclone sync",
        "--backup-dir",
        "gzip -t",
        'verify_trusted_parent /srv/sanq',
        'verify_data_dir "$BACKUP_DIR" "$(id -u)"',
        'grep -Fxq \'BACKUP_DIR="/srv/sanq/backups"\'',
        'LAYOUT_ACTIVATION_MARKER="/opt/sanq/runtime/.sanq-backup-layout-activated"',
        'SANQ_BACKUP_LAYOUT_C4_V1',
        ".env docker-compose.yml",
    ),
    "ops/backup/sanq-backup-protected-nginx": (
        'BACKUP_DIR="/srv/sanq/backups"',
        'LAYOUT_ACTIVATION_MARKER="/opt/sanq/runtime/.sanq-backup-layout-activated"',
        'SANQ_BACKUP_LAYOUT_C4_V1',
        'RCLONE_CONFIG="/home/ubuntu/.config/rclone/rclone.conf"',
        'REMOTE_DIR="gdrive_secure:nginx"',
        'if [ "$EUID" -ne 0 ]',
        'if [ ! -d "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]',
        'cp -- "$RCLONE_CONFIG" "$tmp_rclone_config"',
        'chmod 600 "$tmp_rclone_config"',
        'chown root:root "$tmp_archive"',
        'chmod 600 "$tmp_archive"',
        'mv -T -- "$tmp_archive" "$archive_path"',
        'copyto',
        '"$tmp_archive"',
    ),
    "ops/backup/sanq-backup.service": (
        "User=ubuntu",
        "UMask=0077",
        "ExecStart=/home/ubuntu/backup-db.sh",
        "StandardOutput=journal",
        "StandardError=journal",
    ),
    "ops/backup/sanq-backup.sudoers": (
        "ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/sanq-backup-protected-nginx sanqin_nginx_*.tar.gz",
    ),
    "docker-compose.yml": (
        "pgdata:/var/lib/postgresql/data",
        "./uploads:/app/uploads",
        "/home/ubuntu/sanq-assets/sounds:/app/apps/web/public/sounds:ro",
    ),
}
EXPECTED_LAYOUT = {
    "composeProjectName": "sanq-app",
    "legacyRuntimeRoot": str(LEGACY),
    "proposedRuntimeRoot": "/opt/sanq/runtime",
    "proposedStagingRoot": "/opt/sanq/staging",
    "proposedUploadsRoot": "/srv/sanq/uploads",
    "proposedBackupsRoot": "/srv/sanq/backups",
    "preservedDatabaseVolume": "sanq-app_pgdata",
    "preservedSoundsRoot": "/home/ubuntu/sanq-assets/sounds",
    "activationAuthorized": False,
    "productionCutoverAuthorized": False,
    "migrationExecutionAuthorized": False,
    "sourceCheckoutRequiredForStaging": True,
    "schemaVersion": 1,
    "contractKind": "sanq-runtime-layout-proposal",
}


def safe_source_text(root: Path, relative: str) -> str | None:
    candidate = root
    for component in Path(relative).parts:
        candidate = candidate / component
        if candidate.is_symlink():
            return None
    try:
        if not candidate.is_file() or candidate.stat().st_size > 2 * 1024 * 1024:
            return None
        return candidate.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None


def source_contracts(root: Path) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    for name, required in CONTRACTS.items():
        source = safe_source_text(root, name)
        if source is None:
            checks[name] = {"status": "blocked", "reason": "missing or unsafe tracked source"}
            continue
        missing = [requirement for requirement in required if requirement not in source]
        # Presence is tested without emitting excerpts of configuration content.
        sudoers_rules = [
            line.strip() for line in source.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        unsafe = (
            ("--ignore-failed-read" in source and name.endswith("backup-db.sh"))
            or (
                sudoers_rules != [CONTRACTS[name][0]]
                if name.endswith(".sudoers") else False
            )
        )
        checks[name] = {
            "status": "drift" if missing or unsafe else "ok",
            "requiredChecks": len(required),
            "missingCheckCount": len(missing),
            "unsafeLegacyContract": bool(unsafe),
        }
    return checks


def verify_layout(root: Path) -> dict[str, Any]:
    source = safe_source_text(root, "ops/runtime/runtime-layout.v1.json")
    if source is None:
        return {"status": "blocked", "reason": "layout proposal missing or unsafe"}
    try:
        obj = json.loads(source)
    except json.JSONDecodeError:
        return {"status": "blocked", "reason": "invalid JSON"}
    return {
        "status": "ok" if obj == EXPECTED_LAYOUT else "drift",
        "matchingFrozenContract": obj == EXPECTED_LAYOUT,
    }


def observe_path(path: Path) -> dict[str, Any]:
    """Stat fixed-known locations only, without opening contents or traversal."""
    ancestor = Path(path.anchor)
    for component in path.parts[1:-1]:
        ancestor = ancestor / component
        if ancestor.is_symlink():
            return {"status": "symlink-ancestor"}
    try:
        info = path.lstat()
    except FileNotFoundError:
        return {"status": "missing"}
    except OSError as exc:
        return {"status": "unreadable", "reason": type(exc).__name__}
    if stat.S_ISLNK(info.st_mode):
        return {"status": "symlink"}
    kind = (
        "directory" if stat.S_ISDIR(info.st_mode)
        else "file" if stat.S_ISREG(info.st_mode)
        else "other"
    )
    return {
        "status": "ok" if kind != "other" else "wrong-type",
        "kind": kind,
        "uid": info.st_uid,
        "gid": info.st_gid,
        "mode": oct(stat.S_IMODE(info.st_mode)),
    }


def host_metadata() -> dict[str, Any]:
    paths = {
        "legacyUploads": LEGACY / "uploads",
        "legacyBackups": LEGACY / "backups",
        "legacyEnv": LEGACY / ".env",
        "legacyCompose": LEGACY / "docker-compose.yml",
        "futureUploads": Path(EXPECTED_LAYOUT["proposedUploadsRoot"]),
        "futureBackups": Path(EXPECTED_LAYOUT["proposedBackupsRoot"]),
        "futureRuntime": Path(EXPECTED_LAYOUT["proposedRuntimeRoot"]),
        "installedBackupScript": Path("/home/ubuntu/backup-db.sh"),
        "installedBackupUnit": Path("/etc/systemd/system/sanq-backup.service"),
        "installedBackupTimer": Path("/etc/systemd/system/sanq-backup.timer"),
        "installedNginxHelper": Path("/usr/local/sbin/sanq-backup-protected-nginx"),
        "installedBackupSudoers": Path("/etc/sudoers.d/sanq-backup"),
    }
    return {name: observe_path(path) for name, path in paths.items()}


def audit(root: Path, *, inspect_host: bool = False) -> dict[str, Any]:
    source = source_contracts(root)
    layout = verify_layout(root)
    blockers = [key for key, check in source.items() if check["status"] != "ok"]
    if layout["status"] != "ok":
        blockers.append("runtime-layout.v1.json")
    host = host_metadata() if inspect_host else {}
    if inspect_host:
        for key in ("legacyUploads", "legacyBackups", "legacyEnv", "legacyCompose"):
            if host[key]["status"] != "ok":
                blockers.append(key)
        env = host["legacyEnv"]
        if env.get("status") == "ok" and (
            env.get("kind") != "file" or int(env["mode"], 8) & 0o077
        ):
            blockers.append("legacyEnvPermissions")
        for key in ("futureUploads", "futureBackups", "futureRuntime"):
            # A future target may not exist yet; an existing symlink/unsafe
            # target is a migration risk, not a reason to switch directories.
            entry = host[key]
            if entry["status"] not in ("missing", "ok"):
                blockers.append(key)
            elif entry["status"] == "ok" and (
                entry.get("kind") != "directory"
                or int(entry["mode"], 8) & 0o022
            ):
                blockers.append(key + "Unsafe")
    return {
        "schemaVersion": 1,
        "purpose": "C3-A metadata-only source/host path readiness",
        "sourceChecks": source,
        "layoutCheck": layout,
        "hostMetadata": host,
        "blockers": blockers,
        "readyForProductionCutover": False,
        "backupAndMigrationAuthorization": False,
        "manualEvidenceRequired": [
            "installed systemd unit/timer and privileged-helper parity with reviewed source",
            "successful last backup run and independent remote rclone backup inventory",
            "isolated off-VM restoration proof for DB/config/SSL/uploads consistency",
            "immutable pre-cutover .env and Compose recovery copies",
            "two-pass uploads reconciliation while stopping new file writes at cutover",
            "file ownership, UID/GID and mode continuity across uploads/data targets",
            "API and Uber worker shared uploads mount parity with unchanged DB project and volume",
            "explicit user approval before modifying backup scripts, privileged helper, sudoers or live directories",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", action="store_true", help="Stat fixed production host paths only")
    args = parser.parse_args()
    result = audit(ROOT, inspect_host=args.host)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 2 if result["blockers"] else 0


if __name__ == "__main__":
    sys.exit(main())
