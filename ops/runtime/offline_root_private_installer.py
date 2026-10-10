"""C5-U2D-2A: one-shot operator handoff kernel, LAB-BOUNDARY ONLY.

CAUTION: This module has NO production entry point. It refuses every path
except a directly-owned private /tmp/sanq-u2d2a-lab-* fixture. Even if run
as root, it cannot rename /opt/sanq/runtime. No Docker, sudo, service or
image deployment, schema mutation, automatic rollback or cleanup.

The archive verifier is injected ONLY for offline CI tests; any future
production adapter requires independent ownership, provenance and approval.
"""
from __future__ import annotations

import ctypes
import fcntl
import hashlib
import json
import os
import pwd
import re
import secrets
import stat
from pathlib import Path
from typing import Any, Callable

from build_bundle import MANIFEST, SOURCE_FILES, MAX_ARCHIVE_BYTES
from runtime_update_contract import PRESERVED, _inventory, _sha
from stage_bundle import validated_archive_files

PREFIX = "sanq-u2d2a-lab-"
MARKER = ".sanq-u2d2a-lab-only"
MARKER_CONTENT = b"SANQ_U2D2A_LAB_ONLY_V1\n"
JOURNAL = ".handoff-journal.json"
JOURNAL_NEXT = ".handoff-journal-next"
LOCK = ".handoff.lock"
ARCHIVE = "target.tar.gz"
PHASES = ("PENDING_EXCHANGE", "EXCHANGED_UNCONFIRMED", "PREVIOUS_RETAINED")
FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW
MAX_MANIFEST = 16384
MAX_DYNAMIC = 65536
_SHA = re.compile(r"[0-9a-f]{40}\Z")


class OperatorHandoffBlocked(ValueError):
    """Untrusted fixture, corrupted input or unfinished incident."""


class InjectedStop(RuntimeError):
    """Offline exception injection; U2D-2B will test process SIGKILL."""


def _require(ok: bool, why: str) -> None:
    if not ok:
        raise OperatorHandoffBlocked(why)


def _stat_dir(path: Path) -> os.stat_result:
    info = path.lstat()
    _require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid()
             and info.st_gid == os.getegid()
             and stat.S_IMODE(info.st_mode) == 0o700,
             "untrusted private directory")
    return info


def _guard(root: Path) -> None:
    _require(
        isinstance(root, Path) and root.is_absolute()
        and root.parent == Path("/tmp")
        and root.name.startswith(PREFIX)
        and not root.is_symlink(), "only direct /tmp lab fixture is permitted",
    )
    _stat_dir(root)
    marker = root / MARKER
    info = marker.lstat()
    _require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
             and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600,
             "lab marker invalid")
    _require(_read(marker, max_bytes=64) == MARKER_CONTENT, "lab marker mismatch")
    for name in ("live", "stage", "retained", "recovery", "proof"):
        child = root / name
        _require(child.lstat().st_dev == root.lstat().st_dev,
                 "lab path crosses devices")
        _stat_dir(child)


def _read(path: Path, *, max_bytes: int, uid: int | None = None) -> bytes:
    fd = os.open(path, FILE_FLAGS)
    try:
        info = os.fstat(fd)
        _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                 and info.st_uid == (os.geteuid() if uid is None else uid)
                 and info.st_size <= max_bytes,
                 "untrusted regular file")
        chunks = []
        remaining = max_bytes + 1
        while remaining:
            data = os.read(fd, min(65536, remaining))
            if not data:
                break
            chunks.append(data)
            remaining -= len(data)
        output = b"".join(chunks)
        _require(len(output) <= max_bytes and len(output) == info.st_size,
                 "file grew or changed during read")
        after = os.fstat(fd)
        _require((info.st_dev, info.st_ino, info.st_mtime_ns, info.st_size)
                 == (after.st_dev, after.st_ino, after.st_mtime_ns, after.st_size),
                 "file mutated during read")
        return output
    finally:
        os.close(fd)


def _write(path: Path, data: bytes, *, mode: int = 0o600,
           uid: int | None = None, gid: int | None = None) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as out:
            out.write(data)
            out.flush()
        os.fchmod(fd, mode)
        if uid is not None and gid is not None:
            if os.geteuid() == 0:
                os.fchown(fd, uid, gid)
            else:
                _require(uid == os.geteuid() and gid == os.getegid(),
                         "nonroot fixture cannot change ownership")
        os.fsync(fd)
    finally:
        os.close(fd)


def _sync_dir(path: Path) -> None:
    fd = os.open(path, FLAGS)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _expected_owners() -> tuple[tuple[int, int], tuple[int, int]]:
    root_owner = (os.geteuid(), os.getegid())
    if os.geteuid() != 0:
        return root_owner, root_owner
    ubuntu = pwd.getpwnam("ubuntu")
    return root_owner, (ubuntu.pw_uid, ubuntu.pw_gid)


def _source_tree(tree: Path, *, with_dynamic: bool, sha: str) -> tuple[dict[str, bytes], dict[str, tuple[bytes, int, int, int]]]:
    _stat_dir(tree)
    expected_dirs = {
        p.as_posix() for name in SOURCE_FILES for p in Path(name).parents
        if p != Path(".")
    }
    expected_files = set(SOURCE_FILES) | {MANIFEST}
    if with_dynamic:
        expected_files.update(PRESERVED)
    actual_dirs, actual_files = set(), set()
    for item in tree.rglob("*"):
        relative = item.relative_to(tree).as_posix()
        info = item.lstat()
        if stat.S_ISDIR(info.st_mode):
            _require(info.st_uid == os.geteuid() and info.st_gid == os.getegid()
                     and stat.S_IMODE(info.st_mode) == 0o700,
                     "unsafe Runtime subdirectory")
            actual_dirs.add(relative)
        else:
            _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
                     "Runtime member is symlink/hardlink/special")
            actual_files.add(relative)
    _require(actual_dirs == expected_dirs and actual_files == expected_files,
             "Runtime file inventory drift")
    manifest_bytes = _read(tree / MANIFEST, max_bytes=MAX_MANIFEST)
    _require(not (stat.S_IMODE((tree / MANIFEST).lstat().st_mode) & 0o022),
             "Runtime manifest writable by untrusted owner")
    manifest = json.loads(manifest_bytes)
    _require(isinstance(manifest, dict)
             and type(manifest.get("schemaVersion")) is int
             and manifest["schemaVersion"] == 1
             and manifest.get("artifactKind") == "sanq-runtime-source-pinned",
             "Runtime manifest kind invalid")
    _inventory(manifest, _sha(sha))
    files: dict[str, bytes] = {}
    for name in SOURCE_FILES:
        member = tree / name
        data = _read(member, max_bytes=2 * 1024 * 1024)
        info = member.lstat()
        _require(info.st_uid == os.geteuid()
                 and info.st_gid == os.getegid()
                 and not (stat.S_IMODE(info.st_mode) & 0o022)
                 and len(data) == manifest["files"][name]["bytes"]
                 and hashlib.sha256(data).hexdigest() == manifest["files"][name]["sha256"],
                 "Runtime member proof/owner/mode mismatch")
        files[name] = data
    extra: dict[str, tuple[bytes, int, int, int]] = {}
    if with_dynamic:
        root_owner, env_owner = _expected_owners()
        for name in PRESERVED:
            path = tree / name
            expected_owner = env_owner if name == ".env" else root_owner
            data = _read(path, max_bytes=MAX_DYNAMIC, uid=expected_owner[0])
            info = path.lstat()
            expected_mode = 0o644 if name == ".sanq-backup-layout-activated" else 0o600
            _require((info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode))
                     == (*expected_owner, expected_mode),
                     "dynamic file owner/mode mismatch")
            extra[name] = (data, info.st_uid, info.st_gid, expected_mode)
        _check_active_state(extra)
    return files, extra


def _check_active_state(dynamic: dict[str, tuple[bytes, int, int, int]]) -> None:
    env_text = dynamic[".env"][0].decode("utf-8")
    shas = re.findall(r"(?m)^SANQ_IMAGE_SHA=([^\r\n]*)\r?$", env_text)
    _require(len(shas) == 1 and _SHA.fullmatch(shas[0]) is not None,
             "production env image identity invalid")
    state = json.loads(dynamic[".sanq-release-state.json"][0])
    _require(isinstance(state, dict)
             and type(state.get("schemaVersion")) is int
             and state["schemaVersion"] == 1
             and state.get("phase") == "active"
             and state.get("current") == shas[0]
             and isinstance(state.get("previous"), str)
             and _SHA.fullmatch(state["previous"]) is not None,
             "application state/env disagreement")
    _require(dynamic[".sanq-backup-layout-activated"][0].strip()
             == b"SANQ_BACKUP_LAYOUT_C4_V1",
             "C4 activation marker mismatch")


def _build_tree(parent: Path, slot: str, sources: dict[str, bytes],
                manifest: dict[str, Any],
                dynamic: dict[str, tuple[bytes, int, int, int]] | None = None,
                source_modes: dict[str, int] | None = None,
                manifest_mode: int = 0o644) -> Path:
    path = parent / slot
    path.mkdir(mode=0o700)
    created: set[Path] = set()
    for name, data in sorted(sources.items()):
        parent_dir = path
        for piece in Path(name).parts[:-1]:
            parent_dir = parent_dir / piece
            if parent_dir not in created:
                parent_dir.mkdir(mode=0o700, exist_ok=True)
                created.add(parent_dir)
        _write(parent_dir / Path(name).name, data,
               mode=(source_modes or {}).get(name, 0o644))
    _write(path / MANIFEST, (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode(),
           mode=manifest_mode)
    for name, (data, uid, gid, mode) in (dynamic or {}).items():
        _write(path / name, data, mode=mode, uid=uid, gid=gid)
    for folder in sorted(created, key=lambda p: len(p.parts), reverse=True):
        _sync_dir(folder)
    _sync_dir(path)
    _sync_dir(parent)
    return path


def _journal(root: Path, phase: str, old: str, new: str,
             transaction_id: str, application_sha: str) -> None:
    _require(phase in PHASES, "invalid journal phase")
    record = {
        "schemaVersion": 1,
        "transactionId": transaction_id,
        "phase": phase,
        "oldRuntimeSourceSha": old,
        "targetRuntimeSourceSha": new,
        "applicationCurrentSha": application_sha,
        "manualRecoveryRequired": True,
        "productionActivationAuthorized": False,
    }
    _write(root / JOURNAL_NEXT, (json.dumps(record, sort_keys=True) + "\n").encode())
    os.replace(root / JOURNAL_NEXT, root / JOURNAL)
    _sync_dir(root)


def _exchange(live_fd: int, stage_fd: int) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    func = getattr(libc, "renameat2", None)
    _require(func is not None, "renameat2 unavailable")
    func.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    func.restype = ctypes.c_int
    if func(live_fd, b"runtime", stage_fd, b"candidate", 2) != 0:
        code = ctypes.get_errno()
        raise OperatorHandoffBlocked("atomic exchange failed: errno " + str(code))


def _move_retained_noreplace(stage_fd: int, retained_fd: int) -> None:
    """Never overwrite an unexpectedly created recovery entry."""
    libc = ctypes.CDLL(None, use_errno=True)
    func = getattr(libc, "renameat2", None)
    _require(func is not None, "renameat2 unavailable for retention")
    func.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    func.restype = ctypes.c_int
    if func(stage_fd, b"candidate", retained_fd, b"previous", 1) != 0:
        code = ctypes.get_errno()
        raise OperatorHandoffBlocked("old Runtime retention cannot overwrite: errno " + str(code))


def _stop(point: str, stop_at: str | None) -> None:
    if stop_at == point:
        raise InjectedStop(point)


def run_offline_operator_handoff(
    root: Path,
    *,
    old_sha: str,
    new_sha: str,
    archive_verifier: Callable[[bytes, str], dict[str, Any]],
    stop_at: str | None = None,
) -> dict[str, Any]:
    """Implement the *shape* of root-private handoff, only in a /tmp lab.

    The proof validator is injected deliberately: never bind this routine to
    production. It does not establish independent GitHub trust or real quiescence.
    """
    _guard(root)
    old_sha = _sha(old_sha)
    new_sha = _sha(new_sha)
    _require(old_sha != new_sha, "unchanged Runtime version")
    _require(callable(archive_verifier), "archive verifier required")
    # An unresolved prior transaction, dirty slot or pending next-journal must
    # require an operator: NEVER resume/erase on a new invocation.
    for path in (root / JOURNAL, root / JOURNAL_NEXT,
                 root / "stage" / "candidate", root / "retained" / "previous",
                 root / "recovery" / "preimage"):
        _require(not path.exists() and not path.is_symlink(),
                 "unfinished transaction or occupied recovery slot")
    lock_fd = os.open(root / LOCK, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        lock_info = os.fstat(lock_fd)
        _require(stat.S_ISREG(lock_info.st_mode)
                 and lock_info.st_uid == os.geteuid()
                 and lock_info.st_nlink == 1
                 and stat.S_IMODE(lock_info.st_mode) == 0o600
                 and lock_info.st_dev == root.stat().st_dev,
                 "untrusted operator lock")
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise OperatorHandoffBlocked("concurrent operator transaction") from exc
        # Recheck under the lock so a second cooperating attempt cannot start.
        for path in (root / JOURNAL, root / JOURNAL_NEXT,
                     root / "stage" / "candidate", root / "retained" / "previous",
                     root / "recovery" / "preimage"):
            _require(not path.exists() and not path.is_symlink(),
                     "unfinished locked transaction")
        sources_old, dynamic = _source_tree(root / "live" / "runtime",
                                            with_dynamic=True, sha=old_sha)
        archive = _read(root / "proof" / ARCHIVE, max_bytes=MAX_ARCHIVE_BYTES)
        attested = archive_verifier(archive, new_sha)
        _require(isinstance(attested, dict)
                 and attested.get("verified") is True
                 and attested.get("sourceSha") == new_sha
                 and attested.get("productionActivationAuthorized") is False
                 and attested.get("runtimeArchiveDigest")
                 == "sha256:" + hashlib.sha256(archive).hexdigest(),
                 "archive authentication evidence incomplete")
        manifest, files = validated_archive_files(archive, new_sha)
        _require(set(files) == set(SOURCE_FILES), "target Runtime files mismatch")
        _require(any(files[p] != sources_old[p] for p in SOURCE_FILES),
                 "no Runtime member changed")
        _build_tree(root / "stage", "candidate", files, manifest, dynamic)
        _source_tree(root / "stage" / "candidate", with_dynamic=True, sha=new_sha)
        _build_tree(root / "recovery", "preimage", sources_old,
                    json.loads(_read(root / "live" / "runtime" / MANIFEST, max_bytes=MAX_MANIFEST)),
                    dynamic, source_modes={
                        name: stat.S_IMODE((root / "live" / "runtime" / name).lstat().st_mode)
                        for name in SOURCE_FILES
                    },
                    manifest_mode=stat.S_IMODE(
                        (root / "live" / "runtime" / MANIFEST).lstat().st_mode),
                    )
        _source_tree(root / "recovery" / "preimage", with_dynamic=True, sha=old_sha)
        # No reused hardlinks: each dynamic and source file is a new inode.
        for name in (*SOURCE_FILES, *PRESERVED, MANIFEST):
            inodes = {
                (root / folder / sub / name).stat().st_ino
                for folder, sub in (("live", "runtime"),
                                    ("stage", "candidate"),
                                    ("recovery", "preimage"))
            }
            _require(len(inodes) == 3, "candidate/snapshot aliased active inode")
        application_sha = json.loads(dynamic[".sanq-release-state.json"][0])["current"]
        transaction_id = secrets.token_hex(16)
        _stop("before_journal", stop_at)
        _journal(root, "PENDING_EXCHANGE", old_sha, new_sha,
                 transaction_id, application_sha)
        _stop("after_journal", stop_at)
        live_fd = os.open(root / "live", FLAGS)
        stage_fd = os.open(root / "stage", FLAGS)
        try:
            # Reverify before the only operation that changes the active slot.
            _, latest_dynamic = _source_tree(
                root / "live" / "runtime", with_dynamic=True, sha=old_sha)
            _, staged_dynamic = _source_tree(
                root / "stage" / "candidate", with_dynamic=True, sha=new_sha)
            _require(latest_dynamic == staged_dynamic == dynamic,
                     "dynamic file changed during handoff preflight")
            _exchange(live_fd, stage_fd)
            os.fsync(live_fd)
            os.fsync(stage_fd)
            _stop("after_exchange", stop_at)
            _, new_dynamic = _source_tree(root / "live" / "runtime",
                                          with_dynamic=True, sha=new_sha)
            _, old_dynamic = _source_tree(root / "stage" / "candidate",
                                          with_dynamic=True, sha=old_sha)
            _require(new_dynamic == old_dynamic == dynamic,
                     "dynamic state mismatch after exchange")
            _journal(root, "EXCHANGED_UNCONFIRMED", old_sha, new_sha,
                     transaction_id, application_sha)
            _stop("after_exchange_journal", stop_at)
            retained_fd = os.open(root / "retained", FLAGS)
            try:
                _require(not (root / "retained" / "previous").exists(),
                         "old Runtime retention path occupied")
                _move_retained_noreplace(stage_fd, retained_fd)
                os.fsync(stage_fd)
                os.fsync(retained_fd)
            finally:
                os.close(retained_fd)
            _stop("after_retained", stop_at)
            _source_tree(root / "retained" / "previous", with_dynamic=True, sha=old_sha)
            _journal(root, "PREVIOUS_RETAINED", old_sha, new_sha,
                     transaction_id, application_sha)
            _stop("after_final_journal", stop_at)
        finally:
            os.close(live_fd)
            os.close(stage_fd)
        return {
            "status": "lab-only-manual-verification-required",
            "oldRuntimeSourceSha": old_sha, "newRuntimeSourceSha": new_sha,
            "readyToInstall": False, "authorizedToMutateProduction": False,
            "automaticRecovery": False, "manualRecoveryRequired": True,
        }
    finally:
        os.close(lock_fd)


def inspect_offline_operator_incident(root: Path, old_sha: str,
                                       new_sha: str) -> dict[str, Any]:
    """Read-only lab classification; no resume, delete or rollback behavior."""
    _guard(root)
    record = json.loads(_read(root / JOURNAL, max_bytes=8192))
    _require(isinstance(record, dict)
             and set(record) == {
                 "schemaVersion", "transactionId", "phase", "oldRuntimeSourceSha",
                 "targetRuntimeSourceSha", "applicationCurrentSha",
                 "productionActivationAuthorized", "manualRecoveryRequired",
             }
             and type(record.get("schemaVersion")) is int
             and record["schemaVersion"] == 1
             and isinstance(record.get("transactionId"), str)
             and re.fullmatch(r"[0-9a-f]{32}", record["transactionId"]) is not None
             and record.get("phase") in PHASES
             and record.get("oldRuntimeSourceSha") == _sha(old_sha)
             and record.get("targetRuntimeSourceSha") == _sha(new_sha)
             and record.get("productionActivationAuthorized") is False
             and record.get("manualRecoveryRequired") is True,
             "incident journal untrusted")
    snapshot, dynamic = _source_tree(root / "recovery" / "preimage",
                                    with_dynamic=True, sha=old_sha)
    _require(record["applicationCurrentSha"]
             == json.loads(dynamic[".sanq-release-state.json"][0])["current"],
             "journal application identity changed")
    _require(bool(snapshot), "snapshot incomplete")
    previous = root / "retained" / "previous"
    candidate = root / "stage" / "candidate"
    _require(previous.exists() != candidate.exists(), "ambiguous recovery slots")
    name = "previous" if previous.exists() else "candidate"
    other = previous if previous.exists() else candidate
    active_sha = new_sha if name == "previous" else None
    if name == "candidate":
        try:
            _source_tree(root / "live" / "runtime", with_dynamic=True, sha=old_sha)
            _source_tree(other, with_dynamic=True, sha=new_sha)
            location, active_sha = "before_exchange", old_sha
        except OperatorHandoffBlocked:
            _source_tree(root / "live" / "runtime", with_dynamic=True, sha=new_sha)
            _source_tree(other, with_dynamic=True, sha=old_sha)
            location, active_sha = "after_exchange", new_sha
    else:
        _source_tree(root / "live" / "runtime", with_dynamic=True, sha=new_sha)
        _source_tree(other, with_dynamic=True, sha=old_sha)
        location = "previous_retained"
    _, observed = _source_tree(root / "live" / "runtime", with_dynamic=True, sha=active_sha)
    _, observed_other = _source_tree(other, with_dynamic=True,
                                     sha=old_sha if active_sha == new_sha else new_sha)
    _require(observed == observed_other == dynamic,
             "retained/snapshot dynamic drift")
    phase = record["phase"]
    _require(not (
        (phase in ("EXCHANGED_UNCONFIRMED", "PREVIOUS_RETAINED")
         and location == "before_exchange")
        or (phase == "PREVIOUS_RETAINED" and location != "previous_retained")
    ), "incident journal ahead of directory state")
    return {
        "status": "lab-only-manual-incident-review",
        "journalPhase": phase, "observed": location,
        "activeRuntimeSourceSha": active_sha,
        "authorizedToMutateProduction": False,
        "automaticRecovery": False, "manualRecoveryRequired": True,
    }
