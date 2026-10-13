"""C5-G2-B2B5: inert inode-aware /proc reference sensor for one lab PID.

Only compares the fixed 'probe.txt' in a private same-user
/tmp/sanq-g2b2b-lab-* fixture with a single same-UID process. Neither the
reported absence nor presence is a maintenance, root or installation gate.
No user-supplied paths, network, Docker, systemd, sudo or process mutation.
"""
from __future__ import annotations

import os
from pathlib import Path
import stat
from typing import Any

from isolated_proc_holder_probe import (
    LabProcessBlocked, MAX_FDS, PROC, _private_lab, _require,
)
from proc_reference_census import _parse_pid_stat

SENTINEL = "probe.txt"
MAX_MAP_BYTES = 4 * 1024 * 1024
MAX_MAP_LINES = 65536


def _file_identity(lab_fd: int) -> tuple[int, int]:
    metadata = os.stat(SENTINEL, dir_fd=lab_fd, follow_symlinks=False)
    _require(stat.S_ISREG(metadata.st_mode)
             and metadata.st_uid == os.geteuid()
             and metadata.st_gid == os.getegid()
             and stat.S_IMODE(metadata.st_mode) == 0o600
             and metadata.st_nlink >= 1,
             "unsafe isolated sentinel")
    # Deliberately allow a hardlink: it is the attack/failure case tested.
    return (metadata.st_dev, metadata.st_ino)


def _mapped_inode(pid_dir: Path, identity: tuple[int, int]) -> bool:
    # No path or mapping content enters receipts. The maps device/inode fields
    # are kernel-supplied and work for a mapping whose original fd was closed.
    with (pid_dir / "maps").open("rb") as reader:
        data = reader.read(MAX_MAP_BYTES + 1)
    _require(len(data) <= MAX_MAP_BYTES, "process mappings exceed scan budget")
    matches = False
    for count, raw in enumerate(data.splitlines()):
        _require(count < MAX_MAP_LINES, "process mapping count exceeds budget")
        fields = raw.split(None, 5)
        _require(len(fields) >= 5, "malformed process mapping")
        dev = fields[3].split(b":")
        _require(len(dev) == 2, "malformed map device")
        try:
            device = os.makedev(int(dev[0], 16), int(dev[1], 16))
            inode = int(fields[4])
        except ValueError as exc:
            raise LabProcessBlocked("malformed process map identity") from exc
        if (device, inode) == identity:
            matches = True
    return matches


def inspect_lab_inode_refs(root: Path, pid: int) -> dict[str, Any]:
    """Strictly bounded, same-user, single-file **observation**, never an unlock."""
    _require(type(pid) is int and 1 <= pid < 2**31,
             "invalid isolated PID")
    lab_fd = _private_lab(root)
    try:
        try:
            identity = _file_identity(lab_fd)
            pid_dir = PROC / str(pid)
            proc_info = os.stat(pid_dir, follow_symlinks=False)
            _require(stat.S_ISDIR(proc_info.st_mode)
                     and proc_info.st_uid == os.geteuid(),
                     "process is not owned by observer")
            before, excluded = _parse_pid_stat(pid_dir / "stat")
            _require(not excluded, "process lacks userspace references")
            fd_match = False
            with os.scandir(pid_dir / "fd") as listing:
                for count, entry in enumerate(listing):
                    _require(count < MAX_FDS, "process fd count exceeds budget")
                    _require(entry.name.isascii() and entry.name.isdecimal(),
                             "invalid process fd name")
                    # stat follows the procfs fd link to the held object. An
                    # alias or unlinked pathname can still match its inode.
                    pointed = os.stat(entry.path)
                    if (pointed.st_dev, pointed.st_ino) == identity:
                        fd_match = True
            mapping_match = _mapped_inode(pid_dir, identity)
            after, excluded = _parse_pid_stat(pid_dir / "stat")
            _require(not excluded and before == after,
                     "process changed identity during scan")
            _require(_file_identity(lab_fd) == identity,
                     "isolated sentinel changed during scan")
            lab_info = os.fstat(lab_fd)
            named = os.stat(root, follow_symlinks=False)
            _require((lab_info.st_dev, lab_info.st_ino)
                     == (named.st_dev, named.st_ino),
                     "isolated fixture path changed during scan")
        except OSError as exc:
            raise LabProcessBlocked("incomplete process identity inspection") from exc
        return {
            "kind": "c5-g2b2b5-isolated-inode-reference-v1",
            "observedPid": pid,
            "fdReferencesSentinelInode": fd_match,
            "mmapReferencesSentinelInode": mapping_match,
            "anyInodeReference": fd_match or mapping_match,
            "singleFileSingleSameUserPid": True,
            "rootLevelCoverageVerified": False,
            "mountNamespaceAliasesVerified": False,
            "newConsumerExclusionVerified": False,
            "crossProcessQuiescenceVerified": False,
            "readyToInstall": False,
            "authorizedToMutateProduction": False,
        }
    finally:
        os.close(lab_fd)
