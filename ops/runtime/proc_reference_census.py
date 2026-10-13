"""C5-G2-B2A: read-only /proc reference census, never an installer gate.

This is a point-in-time path-reference sensor for a future independently
authenticated maintenance operator. It does not stop consumers, prove that the
entire host was quiescent, or authorize a Runtime install. The production entry
is fixed to /proc and /opt/sanq/runtime and requires root. Fixture injection
is deliberately private, has no CLI, and is only exercised by offline tests.
"""
from __future__ import annotations

import os
import re
import stat
from pathlib import Path
from typing import Any

RUNTIME = "/opt/sanq/runtime"
PROC = Path("/proc")
KTHREAD_FLAG = 0x00200000
PROC_DIR = re.compile(r"[1-9][0-9]*\Z")
MAX_STAT_BYTES = 4096
MAX_PROC_ENTRIES = 65536
MAX_FDS_PER_PID = 8192
LINK_KINDS = ("cwd", "root", "exe")


class ProcCensusBlocked(ValueError):
    """Unable to obtain a safe, bounded census."""


def _parse_pid_stat(path: Path) -> tuple[int, bool]:
    # /proc/PID/stat comm may contain spaces and close parens. Only numeric
    # kernel fields following the LAST ') ' delimiter are used.
    with path.open("rb") as reader:
        raw = reader.read(MAX_STAT_BYTES + 1)
    if len(raw) > MAX_STAT_BYTES:
        raise ProcCensusBlocked("oversized process stat")
    separator = raw.rfind(b") ")
    if separator < 0:
        raise ProcCensusBlocked("malformed process stat")
    fields = raw[separator + 2:].split()
    if len(fields) < 20:
        raise ProcCensusBlocked("incomplete process stat")
    try:
        flags = int(fields[6])
        start_ticks = int(fields[19])
    except ValueError as exc:
        raise ProcCensusBlocked("invalid process stat counters") from exc
    if flags < 0 or start_ticks < 0:
        raise ProcCensusBlocked("negative process stat counters")
    state = fields[0]
    # Kernel-only tasks and zombies/dead tasks do not hold user-accessible
    # cwd/fds. This exclusion is deliberately based on kernel-supplied stat.
    excluded = bool(flags & KTHREAD_FLAG) or state in (b"Z", b"X", b"x")
    return start_ticks, excluded


def _runtime_link(target: str) -> bool:
    # The kernel may append ' (deleted)' to a no-longer-linked referenced path.
    # Preserve those as references instead of treating them as absent.
    original = target.removesuffix(" (deleted)")
    return original == RUNTIME or original.startswith(RUNTIME + "/")


def _snapshot(proc_dir: Path) -> dict[int, dict[str, Any]]:
    try:
        entries = []
        with os.scandir(proc_dir) as directory:
            for entry in directory:
                if len(entries) >= MAX_PROC_ENTRIES:
                    raise ProcCensusBlocked("procfs process inventory exceeds budget")
                entries.append(entry)
    except OSError as exc:
        raise ProcCensusBlocked("procfs enumeration unavailable") from exc
    if not stat.S_ISDIR(os.stat(proc_dir, follow_symlinks=False).st_mode):
        raise ProcCensusBlocked("procfs root is not a directory")
    result: dict[int, dict[str, Any]] = {}
    for entry in entries:
        if not PROC_DIR.fullmatch(entry.name):
            continue
        pid = int(entry.name)
        pid_dir = proc_dir / entry.name
        record: dict[str, Any] = {
            "startTicks": None, "references": set(), "unknown": False,
        }
        result[pid] = record
        try:
            birth, excluded = _parse_pid_stat(pid_dir / "stat")
            record["startTicks"] = birth
            if excluded:
                continue
            for kind in LINK_KINDS:
                target = os.readlink(pid_dir / kind)
                if _runtime_link(target):
                    record["references"].add(kind)
            fd_dir = pid_dir / "fd"
            with os.scandir(fd_dir) as descriptor_entries:
                for fd_index, descriptor in enumerate(descriptor_entries):
                    if fd_index >= MAX_FDS_PER_PID:
                        record["unknown"] = True
                        break
                    if not descriptor.name.isascii() or not descriptor.name.isdecimal():
                        record["unknown"] = True
                        continue
                    target = os.readlink(fd_dir / descriptor.name)
                    if _runtime_link(target):
                        record["references"].add("fd")
        except (OSError, ProcCensusBlocked):
            # An unreadable PID (including one exiting mid-scan) is unknown.
            # Silently skipping it could falsely report all consumers gone.
            record["unknown"] = True
    return result


def _inspect(proc_dir: Path) -> dict[str, Any]:
    """Private fixture seam. Caller cannot turn any result into install authority."""
    before = _snapshot(proc_dir)
    after = _snapshot(proc_dir)
    holders: set[int] = set()
    unknown: set[int] = set()
    for pid in set(before) | set(after):
        previous, current = before.get(pid), after.get(pid)
        if previous is None or current is None:
            unknown.add(pid)
            continue
        if previous["startTicks"] != current["startTicks"]:
            unknown.add(pid)  # PID exited/reused during the two samples
        if previous["unknown"] or current["unknown"]:
            unknown.add(pid)
        if previous["references"] or current["references"]:
            holders.add(pid)
    return {
        "kind": "c5-g2b2a-proc-reference-census-v1",
        "runtimeRoot": RUNTIME,
        "processesObserved": len(set(before) | set(after)),
        "runtimeReferencePids": sorted(holders),
        "unknownPids": sorted(unknown),
        "pathReferenceCount": len(holders),
        "unresolvedProcessCount": len(unknown),
        "pathOnlyCensus": True,
        "mountNamespaceAndAliasesVerified": False,
        "evidenceSourceAuthenticated": False,
        "crossProcessQuiescenceVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }


def inspect_production_proc_references() -> dict[str, Any]:
    """Root-only read-only observation; NOT a privileged maintenance entrypoint."""
    if os.geteuid() != 0:
        raise ProcCensusBlocked("root identity required for an exhaustive procfs read")
    # The fixed production path prevents user-supplied procfs or Runtime roots.
    return _inspect(PROC)
