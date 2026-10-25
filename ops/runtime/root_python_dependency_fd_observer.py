"""C5-G2 B4B-3B-1: passive, UNTRUSTED FD observation for dependency files.

The caller, NOT this component, opens and authenticates path ancestors and FDs.
Only pre-opened regular read-only file descriptors are read via os.pread.
No path traversal, import discovery, subprocess, candidate execution, output
files or authority grants. A captured digest is NOT independently trusted.
"""
from __future__ import annotations

import fcntl
import hashlib
import os
import stat
from typing import Any

from root_python_dependency_manifest import (
    FILE_KINDS, review_dependency_manifest,
)

MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
READ_CHUNK = 256 * 1024
OBSERVATION_SCHEMA = "sanq.c5.g2.b4b3b1.fd-observation.v1"


class DependencyCaptureBlocked(ValueError):
    """An observation is unsafe, incomplete, or outside its strict bounds."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise DependencyCaptureBlocked(reason)


def _identity(info: os.stat_result) -> tuple[int, ...]:
    return (
        info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
        info.st_ctime_ns, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode),
        info.st_nlink,
    )


def capture_preopened_dependency_fds(
    manifest: Any, *, proposed_manifest_sha256: str,
    proposed_file_pins: dict[str, str],
    opened_file_fds: dict[str, int],
    expected_owner_uid: int = 0,
) -> dict[str, Any]:
    """Observe exactly the file nodes; no FD ownership or path trust proof.

    FDs must already be opened by an independently reviewed, no-follow opener.
    expected_owner_uid differs from 0 ONLY for unprivileged synthetic tests.
    """
    _require(type(expected_owner_uid) is int and expected_owner_uid >= 0,
             "invalid owner expectation")
    try:
        review_dependency_manifest(
            manifest, expected_manifest_sha256=proposed_manifest_sha256,
            proposed_external_file_pins=proposed_file_pins,
        )
        expected = {
            node["path"]: node["sha256"] for node in manifest["nodes"]
            if node["kind"] in FILE_KINDS
        }
    except (ValueError, TypeError, KeyError) as exc:
        raise DependencyCaptureBlocked("invalid proposed B4B-3A graph") from exc

    _require(type(opened_file_fds) is dict
             and set(opened_file_fds) == set(expected),
             "missing or additional file descriptors")
    _require(all(type(fd) is int and fd >= 0
                 for fd in opened_file_fds.values())
             and len(set(opened_file_fds.values())) == len(opened_file_fds),
             "invalid or repeated file descriptor")

    used_bytes = 0
    identities: set[tuple[int, int]] = set()
    records: list[dict[str, Any]] = []

    for path in sorted(expected):
        fd = opened_file_fds[path]
        try:
            before = os.fstat(fd)
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            _require((flags & os.O_ACCMODE) == os.O_RDONLY,
                     "supplied descriptor not read-only")
            mode = stat.S_IMODE(before.st_mode)
            owner_ok = (before.st_uid == expected_owner_uid
                        and (expected_owner_uid != 0 or before.st_gid == 0))
            _require(stat.S_ISREG(before.st_mode) and owner_ok,
                     "unexpected file type or owner")
            _require((mode & (stat.S_IWGRP | stat.S_IWOTH
                              | stat.S_ISUID | stat.S_ISGID)) == 0
                     and before.st_nlink == 1
                     and before.st_dev > 0 and before.st_ino > 0,
                     "unsafe file metadata")
            _require(0 < before.st_size <= MAX_FILE_BYTES
                     and used_bytes + before.st_size <= MAX_TOTAL_BYTES,
                     "file size outside accepted bounds")
            key = (before.st_dev, before.st_ino)
            _require(key not in identities, "two file paths reuse one inode")
            identities.add(key)

            digest = hashlib.sha256()
            offset = 0
            while offset < before.st_size:
                block = os.pread(fd, min(READ_CHUNK, before.st_size - offset),
                                 offset)
                _require(bool(block), "short FD read")
                digest.update(block)
                offset += len(block)
            after = os.fstat(fd)
        except (OSError, OverflowError, ValueError) as exc:
            raise DependencyCaptureBlocked("FD observation failed") from exc

        _require(_identity(before) == _identity(after),
                 "FD identity or content metadata drift during reading")
        used_bytes += before.st_size
        records.append({
            "path": path,
            "sha256": digest.hexdigest(),
            "size": before.st_size,
            "device": before.st_dev,
            "inode": before.st_ino,
            "mtimeNs": before.st_mtime_ns,
            "ctimeNs": before.st_ctime_ns,
            "uid": before.st_uid,
            "gid": before.st_gid,
            "mode": mode,
            "hardlinks": before.st_nlink,
        })

    return {
        "schema": OBSERVATION_SCHEMA,
        "claimedManifestSha256": proposed_manifest_sha256,
        "files": records,
        "proposedFileCount": len(records),
        "observedTotalBytes": used_bytes,
        "fileBytesObservedFromProvidedFDs": True,
        "preopenedFDAndPathProvenanceAuthenticated": False,
        "independentExternalPinProvenanceAuthenticated": False,
        "pythonImportClosureIndependentlyDiscovered": False,
        "elfNeededAndDlopenClosureIndependentlyDiscovered": False,
        "rootExecutionAttempted": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
