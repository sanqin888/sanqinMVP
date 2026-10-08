#!/usr/bin/env python3
"""C5-B2B0: read-only evidence for a checkout-free deployment handoff.

Reports whether an inert SHA-scoped staged Runtime tree still exactly matches
the independently published archive. NEVER authorizes deploy/rollback or
changes active Runtime, Docker, .env, backups or databases.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any, Callable

from build_bundle import MANIFEST, MAX_FILE_BYTES, SOURCE_FILES
from release_contract import require_sha
from runtime_trust import _bundle_bytes, _sha256, verify_runtime_publication
from stage_bundle import STAGED_ARCHIVE, STAGING_PARENT, validated_archive_files, validate_layout


class HandoffBlocked(ValueError):
    """Runtime staging or independent publication evidence is insufficient."""


def private_directory(directory: Path, uid: int) -> None:
    if not directory.is_dir() or directory.is_symlink():
        raise HandoffBlocked("missing or symlinked private staging directory")
    info = directory.stat()
    if info.st_uid != uid or stat.S_IMODE(info.st_mode) & 0o077:
        raise HandoffBlocked("staging directory owner or permissions are unsafe")


def safe_staged_file(root: Path, relative: str) -> bytes:
    node = root
    for part in Path(relative).parts:
        node = node / part
        if node.is_symlink():
            raise HandoffBlocked("symlink in staged source path")
    try:
        meta = node.stat()
        if not stat.S_ISREG(meta.st_mode) or meta.st_size > MAX_FILE_BYTES:
            raise HandoffBlocked("staged source file type or size is invalid")
        return node.read_bytes()
    except OSError as exc:
        raise HandoffBlocked("staged source file is unavailable") from exc


def enforce_exact_tree(root: Path) -> None:
    """Refuse extra files, link-backed directories and unreviewed payloads."""
    allowed_files = set(SOURCE_FILES) | {MANIFEST, STAGED_ARCHIVE}
    allowed_dirs = set()
    for name in allowed_files:
        path = Path(name)
        for parent in list(path.parents)[:-1]:
            if str(parent) != ".":
                allowed_dirs.add(parent.as_posix())
    for entry in root.rglob("*"):
        if entry.is_symlink():
            raise HandoffBlocked("staging tree contains a symlink")
        relative = entry.relative_to(root).as_posix()
        if entry.is_dir():
            if relative not in allowed_dirs:
                raise HandoffBlocked("staging tree contains an unreviewed directory")
        elif not entry.is_file() or relative not in allowed_files:
            raise HandoffBlocked("staging tree contains an unreviewed file")


def inspect_staging(
    sha: str,
    *,
    staging_parent: Path = STAGING_PARENT,
    uid: int | None = None,
    verify: Callable[[bytes, str], dict[str, Any]] = verify_runtime_publication,
) -> dict[str, Any]:
    """Bounded read-only check. No checkout, extraction, shell or Docker."""
    source_sha = require_sha(sha)
    uid = os.geteuid() if uid is None else uid
    # Reject indirect redirects through parent symlinks before probing files.
    if not staging_parent.is_absolute():
        raise HandoffBlocked("staging parent must be absolute")
    cursor = Path(staging_parent.anchor)
    for part in staging_parent.parts[1:]:
        cursor = cursor / part
        if cursor.is_symlink():
            raise HandoffBlocked("staging parent contains a symlink")
    private_directory(staging_parent, uid)
    staged_root = staging_parent / source_sha
    private_directory(staged_root, uid)
    enforce_exact_tree(staged_root)

    archive_path = staged_root / STAGED_ARCHIVE
    payload = _bundle_bytes(archive_path)
    # Network publication proof must authenticate the COMPRESSED bytes first.
    evidence = verify(payload, source_sha)
    if (
        evidence.get("verified") is not True
        or evidence.get("productionActivationAuthorized") is not False
        or evidence.get("sourceSha") != source_sha
        or evidence.get("runtimeArchiveDigest") != _sha256(payload)
    ):
        raise HandoffBlocked("external Runtime publication proof is incomplete")
    manifest, files = validated_archive_files(payload, source_sha)
    validate_layout(files)

    recorded = safe_staged_file(staged_root, MANIFEST)
    try:
        actual_manifest = json.loads(recorded)
    except (ValueError, UnicodeError) as exc:
        raise HandoffBlocked("staged Runtime manifest invalid") from exc
    if actual_manifest != manifest:
        raise HandoffBlocked("staged manifest differs from authenticated archive")

    for name, data in files.items():
        if safe_staged_file(staged_root, name) != data:
            raise HandoffBlocked("staged Runtime file differs from authenticated archive")

    return {
        "sourceSha": source_sha,
        "runtimeArchiveDigest": evidence["runtimeArchiveDigest"],
        "authenticatedStagedFiles": len(files),
        "sourceCheckoutRequired": False,
        "readyToInstallRuntime": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToChangeProduction": False,
        "unresolved": [
            "Reviewed root-owned active Runtime installation and C4 cutover/rollback gates",
            "Separate historical-release proof for rollback; latest-only verification is insufficient",
            "Active Runtime manifest/archive and installed Compose/source parity after installation",
            "Runtime code/config rollback atomicity without changing the PostgreSQL data volume",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    try:
        report = inspect_staging(args.source_sha)
    except (ValueError, OSError, KeyError) as exc:
        print(f"SanQ Runtime handoff blocked: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
