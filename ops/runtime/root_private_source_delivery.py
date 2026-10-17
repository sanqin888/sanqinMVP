"""C5-G2 B02-B3: fixed-name, create-only root-private source delivery kernel.

No command line, privilege escalation, path selection, arbitrary execution or
production integration. Only writes a new file beneath a separately authenticated
pre-opened private root FD. The _fixture_uid parameter is for synthetic CI
alone; even a successful return never authorizes a Runtime mutation.
An interrupted delivery leaves the occupied file for manual incident review;
this implementation NEVER deletes, resumes, repairs or overwrites it.
"""
from __future__ import annotations

import hashlib
import os
import stat

from root_private_source_fd import (
    DIRECTORY, VERSION_DIRECTORY, SOURCE_FILE, MAX_SOURCE, DIGEST,
    DIR_FLAGS, FILE_FLAGS, RootPrivateSourceBlocked, _directory, _match_entry,
    inspect_root_private_source,
)

CREATE_FLAGS = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC


class SourceDeliveryBlocked(RootPrivateSourceBlocked):
    """Source bytes, private directory or create-only contract is unsafe."""


def _require(ok: bool, why: str) -> None:
    if not ok:
        raise SourceDeliveryBlocked(why)


def deliver_fixed_source(anchor_fd: int, source: bytes, *,
                         expected_sha256: str,
                         _fixture_uid: int | None = None) -> dict[str, object]:
    """Create-only delivery to fixed v1/operator.py; no path parameters.

    Caller must supply an independently authenticated root anchor FD and
    independently pinned source bytes/hash. Neither is authenticated here.
    No directory creation, rename, copy, chmod, chown or automatic cleanup.
    """
    _require(type(anchor_fd) is int and anchor_fd >= 0,
             "invalid anchor descriptor")
    _require(type(source) is bytes and 0 < len(source) <= MAX_SOURCE,
             "source must be bounded immutable bytes")
    _require(isinstance(expected_sha256, str)
             and DIGEST.fullmatch(expected_sha256) is not None
             and hashlib.sha256(source).hexdigest() == expected_sha256,
             "input differs from independently pinned source digest")
    uid = 0 if _fixture_uid is None else _fixture_uid
    _require(type(uid) is int and uid >= 0, "invalid synthetic owner")
    anchor = os.fstat(anchor_fd)
    _require(stat.S_ISDIR(anchor.st_mode)
             and anchor.st_uid == uid and anchor.st_gid == uid
             and stat.S_IMODE(anchor.st_mode) == 0o700,
             "private anchor owner/mode invalid")
    first = _directory(anchor_fd, DIRECTORY, uid=uid, device=anchor.st_dev)
    try:
        second = _directory(first, VERSION_DIRECTORY, uid=uid,
                            device=anchor.st_dev)
        try:
            # No existing target is ever replaced, even after a failed delivery.
            fd = os.open(SOURCE_FILE, CREATE_FLAGS, 0o600, dir_fd=second)
            try:
                before = os.fstat(fd)
                _require(stat.S_ISREG(before.st_mode)
                         and before.st_uid == uid and before.st_gid == uid
                         and stat.S_IMODE(before.st_mode) == 0o600
                         and before.st_nlink == 1
                         and before.st_dev == anchor.st_dev,
                         "new source inode identity invalid")
                written = 0
                while written < len(source):
                    count = os.write(fd, source[written:])
                    _require(count > 0, "short source write")
                    written += count
                os.fsync(fd)
                after = os.fstat(fd)
                _require(after.st_size == len(source)
                         and after.st_dev == before.st_dev
                         and after.st_ino == before.st_ino,
                         "new file changed during delivery")
                _match_entry(second, SOURCE_FILE, fd)
            finally:
                os.close(fd)
            os.fsync(second)
            _match_entry(first, VERSION_DIRECTORY, second)
            _match_entry(anchor_fd, DIRECTORY, first)
        finally:
            os.close(second)
    finally:
        os.close(first)
    # Reopen from fixed FD anchor and re-read exact bytes, not merely a
    # reported hash from the writing handle. The readback has NO authority.
    receipt = inspect_root_private_source(
        anchor_fd, expected_sha256=expected_sha256, _fixture_uid=_fixture_uid)
    return {
        "kind": "c5-g2-b02b3-create-only-source-delivery-v1",
        "sourceBytes": len(source),
        "sourceSha256": expected_sha256,
        "independentReadbackConsistent": receipt["fdInspectionConsistent"],
        "anchorProvenanceAuthenticated": False,
        "deliveryActorAuthenticated": False,
        "independentWitnessVerified": False,
        "operatorExecuted": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }
