"""C5-U2B disposable Linux filesystem transaction/fault-injection harness.

OFFLINE ONLY: accepts caller-owned /tmp/sanq-u2b-offline-* with a fixture marker.
It does not authenticate production releases or provide an installation CLI.
"""
from __future__ import annotations

import ctypes
import fcntl
import hashlib
import json
import os
import stat
from pathlib import Path
from typing import Any

from runtime_update_contract import MEMBERS, PRESERVED, _inventory, _sha

PREFIX = "sanq-u2b-offline-"
MARKER = ".sanq-u2b-offline-only"
MARKER_VALUE = b"SANQ_U2B_OFFLINE_FIXTURE_V1\n"
JOURNAL = ".u2b-journal.json"
LOCK = ".u2b.lock"
PHASES = ("pending", "exchanged", "awaiting_manual_verification")


class OfflineHandoffBlocked(ValueError):
    """A sandbox boundary or fixture integrity check failed."""


class InjectedInterruption(RuntimeError):
    """An injected stop immediately after a transaction boundary."""


def _regular(path: Path) -> os.stat_result:
    if path.is_symlink():
        raise OfflineHandoffBlocked("fixture symlink prohibited")
    try:
        info = path.stat()
    except OSError as exc:
        raise OfflineHandoffBlocked("fixture member missing") from exc
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid():
        raise OfflineHandoffBlocked("fixture member must be an owned regular file")
    return info


def _sandbox(root: Path) -> None:
    if os.geteuid() == 0:
        raise OfflineHandoffBlocked("offline harness refuses privileged execution")
    if (not root.is_absolute() or root.is_symlink()
        or root.parent.resolve() != Path("/tmp").resolve()
        or not root.name.startswith(PREFIX) or not root.is_dir()):
        raise OfflineHandoffBlocked("only private /tmp offline fixtures accepted")
    info = root.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise OfflineHandoffBlocked("offline root must be caller-owned 0700")
    marker = root / MARKER
    if stat.S_IMODE(_regular(marker).st_mode) != 0o600 or marker.read_bytes() != MARKER_VALUE:
        raise OfflineHandoffBlocked("offline fixture marker invalid")


def _tree(root: Path, slot: str) -> tuple[str, dict[str, tuple[bytes, int, int]]]:
    tree = root / slot
    if (tree.is_symlink() or not tree.is_dir() or tree.stat().st_uid != os.geteuid()
        or stat.S_IMODE(tree.stat().st_mode) != 0o700):
        raise OfflineHandoffBlocked("fixture Runtime directory missing or unsafe")
    paths = set()
    directories = set()
    for item in tree.rglob("*"):
        if item.is_symlink() or item.stat().st_uid != os.geteuid():
            raise OfflineHandoffBlocked("untrusted fixture member")
        if item.is_file():
            _regular(item)
            paths.add(item.relative_to(tree).as_posix())
        elif not item.is_dir() or stat.S_IMODE(item.stat().st_mode) != 0o700:
            raise OfflineHandoffBlocked("special or nonprivate fixture directory")
        else:
            directories.add(item.relative_to(tree).as_posix())
    expected_directories = {
        parent.as_posix()
        for member in MEMBERS for parent in Path(member).parents
        if parent != Path(".")
    }
    if directories != expected_directories or paths != set(MEMBERS) | set(PRESERVED) | {"runtime-release.json"}:
        raise OfflineHandoffBlocked("fixture file inventory drift")
    manifest = json.loads((tree / "runtime-release.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise OfflineHandoffBlocked("fixture manifest invalid")
    try:
        sha = _sha(manifest.get("sourceSha"))
        inventory = _inventory(manifest, sha)
    except (ValueError, TypeError) as exc:
        raise OfflineHandoffBlocked("fixture manifest invalid") from exc
    for member in MEMBERS:
        data = (tree / member).read_bytes()
        proof = inventory[member]
        if len(data) != proof["bytes"] or hashlib.sha256(data).hexdigest() != proof["sha256"]:
            raise OfflineHandoffBlocked("fixture Runtime hash mismatch")
    dynamic = {}
    for name in PRESERVED:
        path = tree / name
        info = _regular(path)
        dynamic[name] = (path.read_bytes(), stat.S_IMODE(info.st_mode), info.st_uid)
    return sha, dynamic


def _journal(root: Path, phase: str, old: str, new: str) -> None:
    """Sync record, atomic replace, sync parent; never auto-clean interrupted data."""
    if phase not in PHASES or (root / JOURNAL).is_symlink():
        raise OfflineHandoffBlocked("journal path or phase invalid")
    next_path = root / ".u2b-journal-next"
    fd = os.open(next_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump({"schemaVersion": 1, "phase": phase, "before": old, "after": new,
                   "productionActivationAuthorized": False, "manualRecoveryRequired": True},
                  output, sort_keys=True)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    os.replace(next_path, root / JOURNAL)
    directory = os.open(root, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def _exchange(root_fd: int) -> None:
    """Atomic Linux renameat2(RENAME_EXCHANGE), never two separate renames."""
    libc = ctypes.CDLL(None, use_errno=True)
    func = getattr(libc, "renameat2", None)
    if func is None:
        raise OfflineHandoffBlocked("Linux renameat2 unavailable")
    func.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    func.restype = ctypes.c_int
    if func(root_fd, b"runtime", root_fd, b"candidate", 2) != 0:
        raise OfflineHandoffBlocked("filesystem cannot atomically exchange directories")


def _inject(point: str, selected: str | None) -> None:
    if selected == point:
        raise InjectedInterruption(point)


def run_offline_handoff(root: Path, *, interrupt_at: str | None = None) -> dict[str, Any]:
    """Mutate ONLY disposable fixture directories, never a production Runtime."""
    _sandbox(root)
    if (root / JOURNAL).exists() or (root / JOURNAL).is_symlink():
        raise OfflineHandoffBlocked("unfinished or completed journal requires manual review")
    if (root / "previous").exists() or (root / "previous").is_symlink():
        raise OfflineHandoffBlocked("preexisting recovery slot")
    fd = os.open(root, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0))
    try:
        lock_fd = os.open(root / LOCK, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    except BaseException:
        os.close(fd)
        raise
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise OfflineHandoffBlocked("concurrent transaction") from exc
        old, dynamic = _tree(root, "runtime")
        new, candidate_dynamic = _tree(root, "candidate")
        if old == new or candidate_dynamic != dynamic:
            raise OfflineHandoffBlocked("same release or dynamic file drift")
        _inject("before_journal", interrupt_at)
        _journal(root, "pending", old, new)
        _inject("after_journal", interrupt_at)
        _exchange(fd)
        os.fsync(fd)
        _inject("after_exchange", interrupt_at)
        active, new_dynamic = _tree(root, "runtime")
        retained, old_dynamic = _tree(root, "candidate")
        if (active, retained) != (new, old) or (new_dynamic, old_dynamic) != (dynamic, dynamic):
            raise OfflineHandoffBlocked("exchanged filesystem consistency failure")
        _journal(root, "exchanged", old, new)
        _inject("after_exchange_journal", interrupt_at)
        os.rename("candidate", "previous", src_dir_fd=fd, dst_dir_fd=fd)
        os.fsync(fd)
        _inject("after_retention", interrupt_at)
        _journal(root, "awaiting_manual_verification", old, new)
        _inject("after_final_journal", interrupt_at)
        return {"status": "offline-awaiting-manual-verification", "before": old,
                "after": new, "readyToInstall": False, "automaticRecovery": False}
    finally:
        os.close(lock_fd)
        os.close(fd)


def inspect_offline_incident(root: Path) -> dict[str, str]:
    """Read-only observation, NEVER auto-resume or rollback."""
    _sandbox(root)
    path = root / JOURNAL
    _regular(path)
    record = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(record, dict) or record.get("schemaVersion") != 1
        or record.get("phase") not in PHASES
        or record.get("productionActivationAuthorized") is not False
        or record.get("manualRecoveryRequired") is not True):
        raise OfflineHandoffBlocked("incident journal invalid")
    active, current_dynamic = _tree(root, "runtime")
    old, new = record.get("before"), record.get("after")
    if (root / "candidate").exists() and not (root / "previous").exists():
        other, retained_dynamic = _tree(root, "candidate")
        if (active, other) == (old, new):
            point = "before_exchange"
        elif (active, other) == (new, old):
            point = "after_exchange"
        else:
            raise OfflineHandoffBlocked("unreconcilable candidate/current")
    elif (root / "previous").exists() and not (root / "candidate").exists():
        other, retained_dynamic = _tree(root, "previous")
        if (active, other) != (new, old):
            raise OfflineHandoffBlocked("unreconcilable retained Runtime")
        point = "previous_retained"
    else:
        raise OfflineHandoffBlocked("missing or ambiguous recovery slot")
    if current_dynamic != retained_dynamic:
        raise OfflineHandoffBlocked("retained dynamic state no longer matches")
    if (record["phase"] == "exchanged" and point == "before_exchange") or (
        record["phase"] == "awaiting_manual_verification" and point != "previous_retained"
    ):
        raise OfflineHandoffBlocked("incident journal and filesystem phase disagree")
    return {"journalPhase": record["phase"], "observed": point,
            "activeSha": active, "manualRecoveryRequired": "true"}
