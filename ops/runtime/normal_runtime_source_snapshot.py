"""C1-PREP-03: bounded, read-only source bytes from a borrowed directory FD.

Only matches files to a caller's independently pinned LaunchMaterials proposal.
The caller authenticates that proposal, the FD/ancestors, platform and provenance.
This is NOT a bootstrap, code loader, trust attestation or execution permit.
No source compilation/import, filesystem writes, subprocess, network or CLI.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import fcntl
import os
import stat
import sys
from typing import Iterator

from normal_runtime_launch import (
    LaunchMaterials, LaunchMaterialsBlocked, SHA256, canonical, digest,
)

READ_CHUNK = 8192


class CandidateSourceBlocked(ValueError):
    pass


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise CandidateSourceBlocked(reason)


def _identity(info: os.stat_result) -> tuple[int, ...]:
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_size, info.st_nlink, info.st_mtime_ns, info.st_ctime_ns)


@dataclass(frozen=True)
class SourceBytes:
    name: str
    content: bytes
    sha256: str
    file_identity: tuple[int, ...]


@dataclass(frozen=True)
class SourceSnapshot:
    """Observed immutable bytes, never authenticated provenance or authority."""

    source_commit: str
    launch_sha256: str
    directory_identity: tuple[int, ...]
    files: tuple[SourceBytes, ...]

    def bytes_for(self, name: str) -> bytes:
        for item in self.files:
            if item.name == name:
                return item.content
        raise CandidateSourceBlocked("source is outside the frozen inventory")


def _platform() -> None:
    _require(sys.platform == "linux"
             and all(hasattr(os, flag) for flag in (
                 "O_DIRECTORY", "O_NOFOLLOW", "O_CLOEXEC", "O_NONBLOCK"))
             and os.scandir in os.supports_fd
             and os.open in os.supports_dir_fd
             and os.stat in os.supports_dir_fd
             and os.stat in os.supports_follow_symlinks,
             "required Linux FD APIs are unavailable")


def _readonly(fd: int) -> None:
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    _require((flags & os.O_ACCMODE) == os.O_RDONLY
             and not (flags & getattr(os, "O_PATH", 0)),
             "descriptor must be readable and read-only")


def _directory(fd: int, uid: int, gid: int) -> tuple[int, ...]:
    _readonly(fd)
    info = os.fstat(fd)
    _require(stat.S_ISDIR(info.st_mode)
             and info.st_uid == uid and info.st_gid == gid
             and stat.S_IMODE(info.st_mode) == 0o700
             and info.st_dev > 0 and info.st_ino > 0 and info.st_nlink > 0,
             "source directory type/owner/mode is unsafe")
    return _identity(info)


def _inventory(fd: int, names: frozenset[str]) -> None:
    # Reset only our independent directory description before each scan.
    # No unbounded listdir: stop at the first unexpected/duplicate entry.
    os.lseek(fd, 0, os.SEEK_SET)
    seen: set[str] = set()
    with os.scandir(fd) as entries:
        for entry in entries:
            _require(entry.name in names and entry.name not in seen,
                     "source directory has an unexpected or duplicate entry")
            seen.add(entry.name)
    _require(seen == names, "source directory inventory is incomplete")


def _open_source(directory: int, name: str) -> int:
    return os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC
                   | os.O_NONBLOCK, dir_fd=directory)


def _file(fd: int, uid: int, gid: int, device: int,
          expected_size: int) -> tuple[int, ...]:
    _readonly(fd)
    info = os.fstat(fd)
    _require(stat.S_ISREG(info.st_mode)
             and info.st_uid == uid and info.st_gid == gid
             and stat.S_IMODE(info.st_mode) in (0o400, 0o600)
             and info.st_nlink == 1 and info.st_dev == device
             and info.st_ino > 0 and info.st_size == expected_size,
             "source file type/owner/mode/link/device/size differs")
    return _identity(info)


def _read(fd: int, size: int) -> bytes:
    chunks: list[bytes] = []
    offset = 0
    while offset < size:
        block = os.pread(fd, min(READ_CHUNK, size - offset), offset)
        _require(bool(block), "source FD read ended early")
        chunks.append(block)
        offset += len(block)
    _require(os.pread(fd, 1, size) == b"", "source file grew beyond its pin")
    return b"".join(chunks)


def _recheck(directory: int, directory_identity: tuple[int, ...],
             files: tuple[tuple[str, int, tuple[int, ...]], ...],
             uid: int, gid: int) -> None:
    _require(_directory(directory, uid, gid) == directory_identity,
             "source directory metadata changed")
    _inventory(directory, frozenset(name for name, _, _ in files))
    for name, fd, expected in files:
        _require(_file(fd, uid, gid, directory_identity[0], expected[5])
                 == expected, "held source file metadata changed")
        entry = os.stat(name, dir_fd=directory, follow_symlinks=False)
        _require(_identity(entry) == expected,
                 "source directory entry no longer identifies the held FD")
    _require(_directory(directory, uid, gid) == directory_identity,
             "source directory changed during recheck")


@contextmanager
def capture_candidate_sources(
    directory_fd: int,
    materials: LaunchMaterials,
    *,
    expected_launch_sha256: str,
    expected_owner_uid: int = 0,
    expected_owner_gid: int = 0,
) -> Iterator[SourceSnapshot]:
    """Hold observed files and fixed bytes for the lifetime of this context.

    directory_fd is BORROWED; no absolute path or ancestor is opened/attested.
    The caller must authenticate its binding to the proposed sourceRoot.
    Nonzero owners are for unprivileged fixture review, not a root permission.
    The directory is source-only: exactly the pinned .py files, no metadata,
    subdirectories or __pycache__. Input/index files belong outside this FD.
    Only normal exit rechecks drift; caller errors keep their original cause.
    """
    _platform()
    _require(type(directory_fd) is int and directory_fd >= 0,
             "invalid borrowed directory FD")
    _require(type(expected_owner_uid) is int and expected_owner_uid >= 0
             and type(expected_owner_gid) is int and expected_owner_gid >= 0,
             "invalid expected source ownership")
    _require(type(materials) is LaunchMaterials,
             "typed launch materials required")
    _require(type(expected_launch_sha256) is str
             and SHA256.fullmatch(expected_launch_sha256) is not None,
             "invalid independently pinned launch digest")
    try:
        proposal = materials.document()
        frozen_launch = canonical(proposal)
    except (LaunchMaterialsBlocked, TypeError, ValueError, RecursionError) as exc:
        raise CandidateSourceBlocked("invalid launch proposal") from exc
    _require(digest(frozen_launch) == expected_launch_sha256,
             "launch proposal differs from independently pinned digest")
    # Copy plain immutable values before any filesystem operation or yield.
    pins = tuple((name, item["sha256"], item["bytes"])
                 for name, item in sorted(proposal["sourceFiles"].items()))
    names = frozenset(name for name, _, _ in pins)
    source_commit = proposal["sourceCommit"]
    owned: list[int] = []
    try:
        try:
            borrowed_copy = os.dup(directory_fd)
            owned.append(borrowed_copy)
            original = _directory(borrowed_copy, expected_owner_uid,
                                  expected_owner_gid)
            # Independent open description: scanning never consumes caller state.
            directory = os.open(
                ".", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=borrowed_copy)
            owned.append(directory)
            observed_directory = _directory(
                directory, expected_owner_uid, expected_owner_gid)
            _require(observed_directory == original,
                     "borrowed directory changed while taking ownership")
            _inventory(directory, names)
            held = []
            inodes = set()
            for name, _, size in pins:
                fd = _open_source(directory, name)
                owned.append(fd)
                identity = _file(fd, expected_owner_uid, expected_owner_gid,
                                 observed_directory[0], size)
                key = identity[:2]
                _require(key not in inodes, "source names share one inode")
                inodes.add(key)
                held.append((name, fd, identity))
            observed = []
            for (name, fd, identity), (_, sha256, size) in zip(held, pins):
                raw = _read(fd, size)
                _require(digest(raw) == sha256,
                         "source bytes differ from the pinned digest")
                observed.append(SourceBytes(name, raw, sha256, identity))
            held_files = tuple(held)
            _recheck(directory, observed_directory, held_files,
                     expected_owner_uid, expected_owner_gid)
            snapshot = SourceSnapshot(
                source_commit, digest(frozen_launch), observed_directory,
                tuple(observed))
        except CandidateSourceBlocked:
            raise
        except (OSError, ValueError, TypeError, OverflowError) as exc:
            raise CandidateSourceBlocked("candidate source capture failed") from exc

        # Caller exceptions are outside the conversion block and remain intact.
        yield snapshot

        try:
            _recheck(directory, observed_directory, held_files,
                     expected_owner_uid, expected_owner_gid)
        except CandidateSourceBlocked:
            raise
        except (OSError, ValueError, TypeError, OverflowError) as exc:
            raise CandidateSourceBlocked("candidate source recheck failed") from exc
    finally:
        for fd in reversed(owned):
            try:
                os.close(fd)
            except OSError:
                # Closing our own handles must not mask a caller exception.
                pass
