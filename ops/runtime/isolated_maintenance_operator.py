"""C5-G2-B2B: isolation-only operator-controlled maintenance barrier.

This module has NO production entrypoint. Only an independently owned direct
/tmp/sanq-g2b2b-lab-* fixture can be used. A host adapter must be supplied by a
synthetic test; there is no real systemctl, /proc, Docker or sudo integration.
A lock is only one gate: noncooperating consumers require explicit suspension
and double verified absence. Never confers Runtime installation authority.
"""
from __future__ import annotations

import fcntl
import hashlib
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from preinstall_maintenance_contract import review_maintenance_observation

PREFIX = "sanq-g2b2b-lab-"
MARKER = ".sanq-g2b2b-lab-only"
MARKER_BYTES = b"SANQ_G2B2B_LAB_V1\n"
LOCK = ".sanq-maintenance.lock"
OPERATOR = "operator-source.py"
MAX_SOURCE = 512 * 1024
FLAGS = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
DIR_FLAGS = FLAGS | os.O_DIRECTORY


class BarrierBlocked(ValueError):
    """A maintenance actor failed to establish complete exclusion."""


class HostAdapter(Protocol):
    def original_state(self) -> dict[str, bool]: ...
    def suspend(self) -> None: ...
    def restore(self, original: dict[str, bool]) -> None: ...
    def observe(self) -> dict: ...


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise BarrierBlocked(reason)


@dataclass(frozen=True)
class OperatorSource:
    sha256: str
    bytes: int


def _private_fixture(root: Path) -> int:
    _require(isinstance(root, Path) and root.is_absolute()
             and root.parent == Path("/tmp") and root.name.startswith(PREFIX),
             "only fixed lab fixture allowed")
    fd = os.open(root, DIR_FLAGS)
    try:
        info = os.fstat(fd)
        _require(stat.S_ISDIR(info.st_mode)
                 and info.st_uid == os.geteuid() and info.st_gid == os.getegid()
                 and stat.S_IMODE(info.st_mode) == 0o700,
                 "lab fixture must be private and owned")
        _file(fd, MARKER, MARKER_BYTES)
        _require(os.stat(root, follow_symlinks=False).st_ino == info.st_ino,
                 "lab fixture changed")
        return fd
    except BaseException:
        os.close(fd)
        raise


def _file(parent_fd: int, name: str, expected: bytes | None = None) -> bytes:
    fd = os.open(name, FLAGS | os.O_NONBLOCK, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                 and info.st_uid == os.geteuid() and info.st_gid == os.getegid()
                 and stat.S_IMODE(info.st_mode) == 0o600
                 and 0 < info.st_size <= MAX_SOURCE, "unsafe source member")
        data = b""
        while len(data) <= MAX_SOURCE:
            part = os.read(fd, min(65536, MAX_SOURCE + 1 - len(data)))
            if not part:
                break
            data += part
        after = os.fstat(fd)
        _require(len(data) == info.st_size
                 and (info.st_ino, info.st_dev, info.st_mtime_ns, info.st_ctime_ns)
                 == (after.st_ino, after.st_dev, after.st_mtime_ns, after.st_ctime_ns),
                 "lab member changed while reading")
        listed = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        _require((listed.st_dev, listed.st_ino) == (after.st_dev, after.st_ino),
                 "lab member pathname swapped")
        if expected is not None:
            _require(data == expected, "invalid lab marker")
        return data
    finally:
        os.close(fd)


def _source(fd: int, expected_sha256: str) -> OperatorSource:
    _require(type(expected_sha256) is str and len(expected_sha256) == 64
             and all(c in "0123456789abcdef" for c in expected_sha256),
             "invalid reviewed operator hash")
    content = _file(fd, OPERATOR)
    actual = hashlib.sha256(content).hexdigest()
    _require(actual == expected_sha256, "root-private source hash mismatch")
    return OperatorSource(sha256=actual, bytes=len(content))


def _is_excluded(observation: dict) -> None:
    receipt = review_maintenance_observation(observation)
    _require(receipt["observationStructurallyConsistent"] is True
             and receipt["authorizedToMutateProduction"] is False,
             "untrusted maintenance contract")
    # Review only normalized claims. This is a synthetic observation and
    # does not establish actual production quiescence.


def execute_isolated_barrier(root: Path, source_sha256: str,
                             host: HostAdapter) -> dict:
    """Exercise stop/check/restore ordering against a synthetic host.

    Never executes the pinned source. No archive read or Runtime file write.
    A failed restoration cannot be disguised as successful exclusion.
    """
    owned_fd = _private_fixture(root)
    try:
        source = _source(owned_fd, source_sha256)
        lock_fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW
                          | os.O_CLOEXEC, 0o600, dir_fd=owned_fd)
        try:
            lock_info = os.fstat(lock_fd)
            _require(stat.S_ISREG(lock_info.st_mode)
                     and lock_info.st_nlink == 1
                     and lock_info.st_uid == os.geteuid()
                     and lock_info.st_gid == os.getegid()
                     and stat.S_IMODE(lock_info.st_mode) == 0o600,
                     "untrusted maintenance lock file")
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise BarrierBlocked("concurrent isolated operator") from exc
            original = host.original_state()
            _require(type(original) is dict
                     and set(original) == {"backupTimerEnabled", "backupTimerActive",
                                           "backupServiceActive", "mcpActive"}
                     and all(type(v) is bool for v in original.values()),
                     "incomplete initial service state")
            failure: BaseException | None = None
            cleared = False
            try:
                host.suspend()
                _is_excluded(host.observe())
                _is_excluded(host.observe())
                cleared = True
            except BaseException as exc:
                failure = exc
            finally:
                try:
                    host.restore(original)
                    _require(host.original_state() == original,
                             "original service state not restored")
                except BaseException as exc:
                    # Fail closed even if the observation passed.
                    raise BarrierBlocked("maintenance restoration failed") from exc
            if failure is not None:
                raise BarrierBlocked("maintenance exclusion failed") from failure
            _require(cleared, "maintenance evidence incomplete")
            return {
                "kind": "c5-g2b2b-isolated-barrier-rehearsal-v1",
                "operatorSourceSha256": source.sha256,
                "operatorSourceBytes": source.bytes,
                "observations": 2,
                "syntheticConsumerExclusionClaimed": True,
                "originalServiceStateRestored": True,
                "independentRealHostQuiescenceVerified": False,
                "encryptedExternalKitVerified": False,
                "readyToInstall": False,
                "authorizedToMutateProduction": False,
            }
        finally:
            os.close(lock_fd)
    finally:
        os.close(owned_fd)
