"""Private create-only review-plan storage; no release-state or business writes."""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
import stat
from pathlib import Path

from deployment_plan import MAX_PLAN_BYTES, validate_plan
from release_contract import ReleaseContractError

PLAN_DIR = Path("/opt/sanq/deploy-state/plans")
OWNER_UID = 0


def _check(info, *, directory: bool = False) -> None:
    correct_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    expected = 0o700 if directory else 0o600
    if (not correct_type or info.st_uid != OWNER_UID
        or stat.S_IMODE(info.st_mode) != expected
        or (not directory and info.st_nlink != 1)):
        raise ReleaseContractError("plan storage owner, type or private mode differs")


@contextlib.contextmanager
def _directory_fd(directory: Path | None = None):
    # Only internal callers supply a fixed private directory; no CLI path input.
    directory = PLAN_DIR if directory is None else directory
    # Installation provisions the private parent and directory; never mkdir here.
    for ancestor in (directory, *directory.parents):
        if ancestor.is_symlink():
            raise ReleaseContractError("symlink in plan storage path")
    _check(directory.parent.stat(), directory=True)
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        _check(os.fstat(fd), directory=True)
        yield fd
    finally:
        os.close(fd)


def check_maintenance_clear(directory: Path | None = None) -> None:
    """Only fixed internal paths; no record, residual or missing private directory."""
    directory = PLAN_DIR.parent / "maintenance" if directory is None else directory
    with _directory_fd(directory) as root:
        if os.listdir(root):
            raise ReleaseContractError("maintenance evidence blocks a new observation job")


def _plan_id(value: str) -> str:
    if (not isinstance(value, str) or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)):
        raise ReleaseContractError("invalid plan id")
    return value


@contextlib.contextmanager
def preparation_lock():
    """Serialize resource-heavy plan probes only; this is not a maintenance fence."""
    with _directory_fd() as root:
        fd = os.open(".prepare.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW
                     | os.O_NONBLOCK, 0o600, dir_fd=root)
        try:
            _check(os.fstat(fd))
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise ReleaseContractError("another plan preparation is running") from exc
            yield
        finally:
            # Closing releases the OS lock. Do not unlink its stable inode.
            os.close(fd)


def save_plan(raw: bytes) -> str:
    """Preserve failed partial writes; never overwrite an existing identity."""
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_PLAN_BYTES:
        raise ReleaseContractError("invalid plan size or bytes before saving")
    try:
        identity = _plan_id(json.loads(raw)["planId"])
    except (TypeError, ValueError, KeyError, RecursionError) as exc:
        raise ReleaseContractError("invalid plan before saving") from exc
    validate_plan(raw, identity)
    with _directory_fd() as root:
        try:
            fd = os.open(identity + ".json", os.O_WRONLY | os.O_CREAT | os.O_EXCL
                         | os.O_NOFOLLOW, 0o600, dir_fd=root)
        except FileExistsError as exc:
            raise ReleaseContractError("plan already exists; refusing overwrite") from exc
        try:
            _check(os.fstat(fd))
            remaining = memoryview(raw)
            while remaining:
                written = os.write(fd, remaining)
                if written <= 0:
                    raise OSError("short plan write")
                remaining = remaining[written:]
            os.fsync(fd)
            os.fsync(root)
        finally:
            os.close(fd)
        # Read back under the same directory FD before reporting durable success.
        if _read(root, identity) != raw:
            raise ReleaseContractError("saved plan readback differs")
    return identity


def _read(root: int, identity: str) -> bytes:
    fd = os.open(identity + ".json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                 dir_fd=root)
    try:
        info = os.fstat(fd)
        _check(info)
        if not 0 < info.st_size <= MAX_PLAN_BYTES:
            raise ReleaseContractError("saved plan size invalid")
        data = bytearray()
        while len(data) <= MAX_PLAN_BYTES:
            chunk = os.read(fd, min(65536, MAX_PLAN_BYTES + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
        raw = bytes(data)
        after = os.fstat(fd)
        if (len(raw) != info.st_size or info.st_mtime_ns != after.st_mtime_ns
            or info.st_ctime_ns != after.st_ctime_ns or info.st_size != after.st_size):
            raise ReleaseContractError("saved plan changed during read")
        validate_plan(raw, identity)
        return raw
    finally:
        os.close(fd)


def load_plan(identity: str) -> bytes:
    identity = _plan_id(identity)
    with _directory_fd() as root:
        return _read(root, identity)
