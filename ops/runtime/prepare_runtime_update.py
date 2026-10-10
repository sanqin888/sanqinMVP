"""C5-U2A: externally authenticated Runtime preparation without activation.

This deliberately has no install, active Runtime replacement, Docker, sudo,
symlink, shell, or service-mutation path. Staged bytes remain inert until a
separately reviewed, authorized U2 handoff implementation exists.
"""
from __future__ import annotations

import hashlib
import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any

from build_bundle import MANIFEST, SOURCE_FILES
from stage_bundle import (
    STAGED_ARCHIVE, validated_archive_files, validate_layout,
    verify_independent_archive,
)

class PreparationBlocked(ValueError):
    pass


def ensure_private_parent(parent: Path) -> None:
    """Fail closed on writable or symlinked staging parents."""
    if not parent.is_absolute() or parent == Path("/"):
        raise PreparationBlocked("preparation root must be absolute and private")
    for ancestor in (parent, *parent.parents):
        if ancestor.is_symlink() or not ancestor.is_dir():
            raise PreparationBlocked("unsafe preparation directory ancestor")
    info = parent.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise PreparationBlocked("preparation root must be caller-owned and mode 0700")
    if parent == Path("/opt/sanq/runtime") or Path("/opt/sanq/runtime") in parent.parents:
        raise PreparationBlocked("active Runtime must never be a preparation destination")


def _write_exclusive(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def prepare_authenticated_archive(
    archive: bytes, source_sha: str, parent: Path,
) -> dict[str, Any]:
    """Verify external publication first; prepare a *new* inert private tree.

    No existing path is overwritten; an interrupted preparation remains
    quarantined for manual inspection. No automatic cleanup or recovery occurs.
    """
    ensure_private_parent(parent)
    evidence = verify_independent_archive(archive, source_sha)
    manifest, files = validated_archive_files(archive, source_sha)
    validate_layout(files)
    if set(files) != set(SOURCE_FILES) or manifest.get("productionActivationAuthorized") is not False:
        raise PreparationBlocked("Runtime archive contract mismatch")
    for path, data in files.items():
        proof = manifest["files"].get(path)
        if not isinstance(proof, dict) or (
            proof.get("sha256") != hashlib.sha256(data).hexdigest()
            or proof.get("bytes") != len(data)
        ):
            raise PreparationBlocked("Runtime archive member mismatch")
    if evidence.get("runtimeArchiveDigest") != "sha256:" + hashlib.sha256(archive).hexdigest():
        raise PreparationBlocked("external archive digest differs from bytes")

    # Prefix may be created only after all network/archive checks succeeded.
    scratch = Path(tempfile.mkdtemp(prefix=".sanq-u2-unactivated-", dir=parent))
    for path, data in files.items():
        _write_exclusive(scratch / path, data)
    _write_exclusive(scratch / MANIFEST, (
        json.dumps(manifest, sort_keys=True, indent=2) + "\n"
    ).encode("utf-8"))
    _write_exclusive(scratch / STAGED_ARCHIVE, archive)

    # Verify actual files after writing (not only the in-memory source map).
    for path, data in files.items():
        actual = scratch / path
        if actual.is_symlink() or actual.read_bytes() != data:
            raise PreparationBlocked("prepared member bytes differ; manual quarantine required")
    if (scratch / MANIFEST).is_symlink() or (
        json.loads((scratch / MANIFEST).read_text(encoding="utf-8")) != manifest
    ):
        raise PreparationBlocked("prepared manifest differs; manual quarantine required")
    if (scratch / STAGED_ARCHIVE).read_bytes() != archive:
        raise PreparationBlocked("prepared archive differs; manual quarantine required")

    # Sync containing directory metadata before reporting prepared.
    fd = os.open(scratch, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return {
        "status": "inert-prepared-only",
        "path": str(scratch),
        "sourceSha": source_sha,
        "runtimeArchiveDigest": evidence["runtimeArchiveDigest"],
        "memberCount": len(files),
        "productionActivationAuthorized": False,
        "readyToInstall": False,
    }
