"""C5-G2 B02-B2: read-only FD-anchored root-private source verifier.

This is a *source component*, not a production root launcher or delivery tool.
No CLI, chmod/chown/copy, exec, sudo, service operation or Runtime write.
A trusted caller must separately authenticate the pre-opened anchor and the
expected hash; a matching receipt never grants install/production authority.
"""
from __future__ import annotations

import hashlib
import os
import re
import stat

# The future independently controlled root-private delivery location.
# This component receives an FD for /root; it NEVER opens /root itself.
ROOT_ANCHOR = "/root"
DIRECTORY = "sanq-runtime-operator"
VERSION_DIRECTORY = "v1"
SOURCE_FILE = "operator.py"
MAX_SOURCE = 2 * 1024 * 1024
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC


class RootPrivateSourceBlocked(ValueError):
    """The pinned source is absent, changed, aliased or otherwise untrusted."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise RootPrivateSourceBlocked(reason)


def _identity(info: os.stat_result) -> tuple[int, int]:
    return (info.st_dev, info.st_ino)


def _match_entry(parent_fd: int, name: str, child_fd: int) -> None:
    entry = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    opened = os.fstat(child_fd)
    _require(_identity(entry) == _identity(opened)
             and stat.S_IFMT(entry.st_mode) == stat.S_IFMT(opened.st_mode),
             "entry replaced during FD inspection")


def _directory(parent_fd: int, name: str, *, uid: int, device: int) -> int:
    fd = os.open(name, DIR_FLAGS, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        _require(stat.S_ISDIR(info.st_mode) and info.st_uid == uid
                 and info.st_gid == uid and stat.S_IMODE(info.st_mode) == 0o700
                 and info.st_dev == device, "private directory identity invalid")
        _match_entry(parent_fd, name, fd)
        return fd
    except BaseException:
        os.close(fd)
        raise


def inspect_root_private_source(anchor_fd: int, *, expected_sha256: str,
                                _fixture_uid: int | None = None) -> dict[str, object]:
    """Inspect only the fixed descendant of an independently verified anchor.

    The fixture UID override enables unprivileged CI. It is NOT an authority
    escape hatch: receipts are always negative even in the root UID case.
    """
    _require(isinstance(expected_sha256, str)
             and DIGEST.fullmatch(expected_sha256) is not None,
             "invalid independently pinned source digest")
    _require(type(anchor_fd) is int and anchor_fd >= 0,
             "invalid pre-opened anchor FD")
    uid = 0 if _fixture_uid is None else _fixture_uid
    _require(type(uid) is int and uid >= 0, "invalid fixture owner")
    anchor = os.fstat(anchor_fd)
    _require(stat.S_ISDIR(anchor.st_mode) and anchor.st_uid == uid
             and anchor.st_gid == uid and stat.S_IMODE(anchor.st_mode) == 0o700,
             "untrusted anchor FD")
    device = anchor.st_dev
    first = _directory(anchor_fd, DIRECTORY, uid=uid, device=device)
    try:
        second = _directory(first, VERSION_DIRECTORY, uid=uid, device=device)
        try:
            file_fd = os.open(SOURCE_FILE, FILE_FLAGS, dir_fd=second)
            try:
                before = os.fstat(file_fd)
                _require(stat.S_ISREG(before.st_mode)
                         and before.st_uid == uid and before.st_gid == uid
                         and stat.S_IMODE(before.st_mode) == 0o600
                         and before.st_nlink == 1
                         and before.st_dev == device
                         and 0 < before.st_size <= MAX_SOURCE,
                         "source file identity, mode or size invalid")
                _match_entry(second, SOURCE_FILE, file_fd)
                chunks = bytearray()
                while len(chunks) <= MAX_SOURCE:
                    part = os.read(file_fd, min(65536, MAX_SOURCE + 1 - len(chunks)))
                    if not part:
                        break
                    chunks.extend(part)
                after = os.fstat(file_fd)
                _require(len(chunks) == before.st_size
                         and (before.st_dev, before.st_ino, before.st_size,
                              before.st_mtime_ns, before.st_ctime_ns)
                         == (after.st_dev, after.st_ino, after.st_size,
                             after.st_mtime_ns, after.st_ctime_ns),
                         "source file mutated during bounded read")
                _match_entry(second, SOURCE_FILE, file_fd)
                _match_entry(first, VERSION_DIRECTORY, second)
                _match_entry(anchor_fd, DIRECTORY, first)
                _require(hashlib.sha256(chunks).hexdigest() == expected_sha256,
                         "installed source hash differs from independently pinned bytes")
                return {
                    "kind": "c5-g2-b02b2-source-fd-inspection-v1",
                    "path": ROOT_ANCHOR + "/" + DIRECTORY + "/" +
                            VERSION_DIRECTORY + "/" + SOURCE_FILE,
                    "sourceBytes": len(chunks),
                    "sourceSha256": expected_sha256,
                    "fdInspectionConsistent": True,
                    "anchorProvenanceAuthenticated": False,
                    "independentWitnessVerified": False,
                    "rootOperatorExecuted": False,
                    "readyToInstall": False,
                    "authorizedToMutateProduction": False,
                }
            finally:
                os.close(file_fd)
        finally:
            os.close(second)
    finally:
        os.close(first)
