"""C5-G2-B2B4: narrowly bounded live /proc observation of one lab process.

This is **not** the production census. It accepts only a direct, private,
same-owner /tmp/sanq-g2b2b-lab-* fixture with the existing offline marker
and one process belonging to the invoking UID. It is read-only; no root,
systemd, Docker, network, subprocess, install or general-purpose CLI.
"""
from __future__ import annotations

import os
from pathlib import Path
import stat
from typing import Any

from isolated_maintenance_operator import (
    PREFIX, MARKER, MARKER_BYTES, DIR_FLAGS, _file,
)
from proc_reference_census import _parse_pid_stat

MAX_FDS = 8192
PROC = Path("/proc")


class LabProcessBlocked(ValueError):
    """An unsafe fixture, untrusted process or incomplete observation."""


def _require(value: bool, reason: str) -> None:
    if not value:
        raise LabProcessBlocked(reason)


def _private_lab(root: Path) -> int:
    _require(isinstance(root, Path) and root.is_absolute()
             and root.parent == Path("/tmp") and root.name.startswith(PREFIX),
             "not a direct isolated fixture")
    try:
        fd = os.open(root, DIR_FLAGS)
        try:
            info = os.fstat(fd)
            listed = os.stat(root, follow_symlinks=False)
            _require(stat.S_ISDIR(info.st_mode)
                     and (listed.st_dev, listed.st_ino) == (info.st_dev, info.st_ino)
                     and info.st_uid == os.geteuid()
                     and info.st_gid == os.getegid()
                     and stat.S_IMODE(info.st_mode) == 0o700,
                     "untrusted isolated fixture identity")
            _require(_file(fd, MARKER, MARKER_BYTES) == MARKER_BYTES,
                     "invalid private marker")
            return fd
        except BaseException:
            os.close(fd)
            raise
    except OSError as exc:
        raise LabProcessBlocked("unavailable isolated fixture") from exc


def _target_in_lab(root: Path, target: str) -> bool:
    base = str(root)
    path = target.removesuffix(" (deleted)")
    return path == base or path.startswith(base + "/")


def observe_isolated_pid(root: Path, pid: int) -> dict[str, Any]:
    """Observe real cwd/fd references in a controlled **same-user** lab only.

    Do not use this evidence to claim root-level /proc coverage or quiescence.
    A process leaving or replacing its PID mid-scan must fail closed.
    """
    _require(type(pid) is int and 1 <= pid <= 2**31 - 1,
             "invalid isolated PID")
    fd = _private_lab(root)
    try:
        proc_dir = PROC / str(pid)
        try:
            owner = os.stat(proc_dir, follow_symlinks=False)
            _require(stat.S_ISDIR(owner.st_mode)
                     and owner.st_uid == os.geteuid(),
                     "isolated PID does not belong to observer")
            birth_before, excluded = _parse_pid_stat(proc_dir / "stat")
            _require(not excluded, "isolated PID has no userspace references")
            references: set[str] = set()
            for name in ("cwd", "exe", "root"):
                if _target_in_lab(root, os.readlink(proc_dir / name)):
                    references.add(name)
            with os.scandir(proc_dir / "fd") as descriptors:
                for index, entry in enumerate(descriptors):
                    _require(index < MAX_FDS, "isolated fd scan exceeded budget")
                    _require(entry.name.isascii() and entry.name.isdecimal(),
                             "malformed isolated fd entry")
                    if _target_in_lab(root, os.readlink(entry.path)):
                        references.add("fd")
            birth_after, gone = _parse_pid_stat(proc_dir / "stat")
            _require(not gone and birth_before == birth_after,
                     "isolated process exited or PID was reused")
            root_info = os.fstat(fd)
            current = os.stat(root, follow_symlinks=False)
            _require((root_info.st_dev, root_info.st_ino)
                     == (current.st_dev, current.st_ino),
                     "fixture was swapped during observation")
        except OSError as exc:
            raise LabProcessBlocked("incomplete isolated process inspection") from exc
        return {
            "kind": "c5-g2b2b4-isolated-single-pid-proc-v1",
            "observedPid": pid,
            "referenceKinds": sorted(references),
            "hasLabReference": bool(references),
            "pidStartStable": True,
            "singleSameUserPidOnly": True,
            "rootLevelProcessCoverageVerified": False,
            "mountNamespacesAndInodeAliasesVerified": False,
            "crossProcessQuiescenceVerified": False,
            "readyToInstall": False,
            "authorizedToMutateProduction": False,
        }
    finally:
        os.close(fd)
