"""C5-G2 B4B-3B-2B1: candidate FD opening under an UNAUTHENTICATED root FD.

A narrow *synthetic-only capable* path walker; no entry point, no sudo, no
subprocess, no byte execution, no filesystem writes. Caller supplies the anchor,
manifest and hash claims. Neither their provenance nor the anchor's actual
connection to the host '/' is established here; receipts MUST remain BLOCKED.
This deliberately rejects usrmerge symlinks instead of silently following them.
"""
from __future__ import annotations

from contextlib import contextmanager
import fcntl
import os
import stat
from typing import Any, Iterator

from root_python_dependency_manifest import (
    FILE_KINDS, review_dependency_manifest,
)

MAX_OPENED_FILES = 64
MAX_COMPONENTS = 12
MAX_CANDIDATE_FILE_BYTES = 32 * 1024 * 1024
_DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_FLAGS = os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC


class CandidatePathBlocked(ValueError):
    """Unmodeled entry, replacement or unsafe file identity."""


def _require(value: bool, reason: str) -> None:
    if not value:
        raise CandidatePathBlocked(reason)


def _identity(info: os.stat_result) -> tuple[int, ...]:
    return (
        info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
        info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns,
    )


def _safe_metadata(info: os.stat_result, *, uid: int, gid: int, device: int,
                   directory: bool) -> None:
    _require(info.st_dev == device and info.st_ino > 0
             and info.st_uid == uid and info.st_gid == gid,
             "untrusted owner or different mount device")
    _require((stat.S_ISDIR(info.st_mode) if directory
              else stat.S_ISREG(info.st_mode)),
             "wrong entry type")
    _require((stat.S_IMODE(info.st_mode) & 0o6022) == 0,
             "writable or privileged entry mode")
    if not directory:
        _require(info.st_nlink == 1
                 and 0 < info.st_size <= MAX_CANDIDATE_FILE_BYTES,
                 "invalid candidate size or hardlink count")


def _match_entry(parent_fd: int, name: str, child_fd: int,
                 *, uid: int, gid: int, device: int, directory: bool) -> None:
    # Stat *the directory entry*, not a followed symlink target.
    entry = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    opened = os.fstat(child_fd)
    _safe_metadata(entry, uid=uid, gid=gid, device=device, directory=directory)
    _safe_metadata(opened, uid=uid, gid=gid, device=device, directory=directory)
    _require(_identity(entry) == _identity(opened),
             "FD and directory-entry identity mismatch")


@contextmanager
def borrow_candidate_dependency_fds(
    root_anchor_fd: int,
    manifest: Any, *,
    expected_manifest_sha256: Any,
    proposed_file_pins: Any,
    _fixture_owner_uid: int | None = None,
    _fixture_owner_gid: int | None = None,
) -> Iterator[dict[str, int]]:
    """Open manifest-listed descendants beneath a previously opened root FD.

    All ancestors are walked one component at a time using dir_fd, O_NOFOLLOW
    and same-device owner/mode checks. Every entry is rechecked before
    handing FDs to the caller and on exit. The caller must use FDs only inside
    this context and must not re-open the path to read source bytes.

    The anchor may point to ANY directory FD; we cannot independently attest
    it is the host's '/' or that the proposed pins are externally controlled.
    _fixture_owner_uid is strictly for an unprivileged, temporary test tree.
    """
    _require(type(root_anchor_fd) is int and root_anchor_fd >= 0,
             "invalid root anchor FD")
    uid = 0 if _fixture_owner_uid is None else _fixture_owner_uid
    gid = 0 if _fixture_owner_gid is None else _fixture_owner_gid
    _require(type(uid) is int and uid >= 0
             and type(gid) is int and gid >= 0,
             "invalid fixture owner")
    try:
        review_dependency_manifest(
            manifest,
            expected_manifest_sha256=expected_manifest_sha256,
            proposed_external_file_pins=proposed_file_pins,
        )
        paths = sorted(node["path"] for node in manifest["nodes"]
                       if node["kind"] in FILE_KINDS)
    except (ValueError, TypeError, KeyError) as exc:
        raise CandidatePathBlocked("invalid proposed dependency manifest") from exc
    _require(0 < len(paths) <= MAX_OPENED_FILES, "candidate path budget exceeded")

    opened: list[int] = []
    entries: list[tuple[int, str, int, bool]] = []
    files: dict[str, int] = {}
    try:
        anchor = os.fstat(root_anchor_fd)
        _require((fcntl.fcntl(root_anchor_fd, fcntl.F_GETFL)
                  & os.O_ACCMODE) == os.O_RDONLY,
                 "anchor not read-only")
        _safe_metadata(anchor, uid=uid, gid=gid,
                       device=anchor.st_dev, directory=True)
        anchor_identity = _identity(anchor)

        for path in paths:
            parts = path[1:].split("/")
            _require(2 <= len(parts) <= MAX_COMPONENTS
                     and all(part not in ("", ".", "..") for part in parts),
                     "path outside strict component limits")
            parent = root_anchor_fd
            for position, name in enumerate(parts):
                directory = position < len(parts) - 1
                fd = os.open(
                    name, _DIR_FLAGS if directory else _FILE_FLAGS,
                    dir_fd=parent,
                )
                opened.append(fd)
                _match_entry(parent, name, fd, uid=uid, gid=gid,
                             device=anchor.st_dev, directory=directory)
                entries.append((parent, name, fd, directory))
                parent = fd
            files[path] = parent

        _require(_identity(os.fstat(root_anchor_fd)) == anchor_identity,
                 "anchor metadata changed")
        for parent, name, fd, directory in entries:
            _match_entry(parent, name, fd, uid=uid, gid=gid,
                         device=anchor.st_dev, directory=directory)

        try:
            # Not a trusted receipt. The caller may pass these FDs directly to
            # B4B-3B-1's bounded FD observer without re-opening their paths.
            yield files
        finally:
            _require(_identity(os.fstat(root_anchor_fd)) == anchor_identity,
                     "anchor metadata changed after observation")
            for parent, name, fd, directory in entries:
                _match_entry(parent, name, fd, uid=uid, gid=gid,
                             device=anchor.st_dev, directory=directory)
    except (OSError, OverflowError) as exc:
        raise CandidatePathBlocked("candidate path observation failed") from exc
    finally:
        for fd in reversed(opened):
            os.close(fd)
