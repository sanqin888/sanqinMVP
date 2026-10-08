#!/usr/bin/env python3
"""C5-B3B1: offline-only crash-durable journal filesystem fixture.

This class owns a freshly created stdlib TemporaryDirectory. There is no path
argument, CLI, production-root accessor, installer, Docker or privilege bridge.
It tests durable operations but grants no production filesystem authority.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any

from versioned_persistence_contract import (
    PersistenceBlocked, transition_journal, validate_journal,
)

MAX_BYTES = 32768
NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
DIRECTORY = getattr(os, "O_DIRECTORY", 0)


class OfflineInterruption(PersistenceBlocked):
    """Deliberate interruption after a named durability boundary."""


class OfflineJournalFixture:
    """Exclusive single-transaction fixture confined to a new private tempdir."""

    def __init__(self) -> None:
        self._temp = tempfile.TemporaryDirectory(prefix="sanq-runtime-offline-")
        self.root = Path(self._temp.name)
        self._dirfd: int | None = None
        self._lockfd: int | None = None
        self._closed = False

    def __enter__(self) -> "OfflineJournalFixture":
        if self._closed or self._dirfd is not None:
            raise PersistenceBlocked("fixture already closed or opened")
        if self.root.is_symlink():
            raise PersistenceBlocked("offline sandbox symlink rejected")
        info = self.root.stat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise PersistenceBlocked("untrusted offline sandbox")
        dirfd = os.open(self.root, os.O_RDONLY | DIRECTORY | NOFOLLOW)
        lockfd = None
        try:
            lockfd = os.open("fixture.lock", os.O_RDWR | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=dirfd)
            fcntl.flock(lockfd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            if lockfd is not None:
                os.close(lockfd)
            os.close(dirfd)
            raise
        self._dirfd, self._lockfd = dirfd, lockfd
        return self

    def _fd(self) -> int:
        if self._closed or self._dirfd is None or self._lockfd is None:
            raise PersistenceBlocked("exclusive fixture lock required")
        return self._dirfd

    def _read(self, name: str) -> bytes | None:
        parent = self._fd()
        try:
            fd = os.open(name, os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        except FileNotFoundError:
            return None
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > MAX_BYTES:
                raise PersistenceBlocked("untrusted offline journal file")
            content = os.read(fd, MAX_BYTES + 1)
            if len(content) > MAX_BYTES:
                raise PersistenceBlocked("oversized journal")
            return content
        finally:
            os.close(fd)

    @staticmethod
    def _json(data: bytes | None) -> dict[str, Any]:
        if data is None:
            raise PersistenceBlocked("missing durability evidence")
        try:
            value = json.loads(data.decode("utf-8"))
        except (UnicodeError, ValueError) as exc:
            raise PersistenceBlocked("corrupt journal bytes") from exc
        if not isinstance(value, dict):
            raise PersistenceBlocked("journal object required")
        return value

    @staticmethod
    def _encode(value: dict[str, Any]) -> bytes:
        return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")

    def _files(self) -> set[str]:
        self._fd()
        return set(os.listdir(self.root))

    def _atomic_new(self, name: str, content: bytes, *, fault: str | None = None) -> None:
        if len(content) > MAX_BYTES:
            raise PersistenceBlocked("journal too large")
        directory = self._fd()
        tmp = ".incomplete-" + name
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=directory)
        try:
            with os.fdopen(fd, "wb", closefd=True) as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            if fault == "after-file-fsync":
                raise OfflineInterruption("after-file-fsync")
            if self._read(name) is not None:
                raise PersistenceBlocked("immutable record already exists")
            os.rename(tmp, name, src_dir_fd=directory, dst_dir_fd=directory)
            if fault == "after-rename":
                raise OfflineInterruption("after-rename")
            os.fsync(directory)
            if fault == "after-directory-fsync":
                raise OfflineInterruption("after-directory-fsync")
        except BaseException:
            # Never silently remove uncommitted evidence from an interrupted write.
            raise

    def _replace_head(self, content: bytes, *, fault: str | None = None) -> None:
        directory = self._fd()
        tmp = ".incomplete-head"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if fault == "before-head-rename":
            raise OfflineInterruption("before-head-rename")
        os.rename(tmp, "head.json", src_dir_fd=directory, dst_dir_fd=directory)
        if fault == "after-head-rename":
            raise OfflineInterruption("after-head-rename")
        os.fsync(directory)

    def snapshot(self) -> tuple[int, dict[str, Any]]:
        names = self._files()
        allowed = {"fixture.lock", "head.json"}
        files = sorted(n for n in names if n.startswith("record-") and n.endswith(".json"))
        if names != allowed | set(files) or not files:
            raise PersistenceBlocked("unexpected file or incomplete journal generation")
        head = self._json(self._read("head.json"))
        if set(head) != {"schemaVersion", "generation", "transactionId", "recordSha256", "committedActiveSha", "committedPreviousSha", "requiresPhysicalReconciliation"} or type(head["schemaVersion"]) is not int or head["schemaVersion"] != 1 or head["requiresPhysicalReconciliation"] is not True:
            raise PersistenceBlocked("invalid committed pointer")
        generation = head["generation"]
        if type(generation) is not int or generation < 1 or files != [f"record-{i:08d}.json" for i in range(1, generation + 1)]:
            raise PersistenceBlocked("missing/orphan/duplicate durable record")
        last = self._json(self._read(files[-1]))
        journal = validate_journal(last)
        content = self._read(files[-1])
        if content is None or head["recordSha256"] != hashlib.sha256(content).hexdigest() or head["transactionId"] != journal["transactionId"]:
            raise PersistenceBlocked("head and journal do not match")
        # Earlier generations are append-only transition evidence, not replaceable.
        previous = None
        for name in files:
            candidate = validate_journal(self._json(self._read(name)))
            if candidate["transactionId"] != journal["transactionId"]:
                raise PersistenceBlocked("mixed transaction IDs")
            if previous is None and candidate["phase"] != "pending":
                raise PersistenceBlocked("first durable record must be pending")
            if previous is not None:
                if candidate["createdAt"] != previous["createdAt"] or candidate["updatedAt"] <= previous["updatedAt"]:
                    raise PersistenceBlocked("historical journal order invalid")
                expected = transition_journal(
                    previous, candidate["phase"], at=candidate["updatedAt"],
                    manually_reconciled=candidate["phase"] in ("active", "rolled-back"),
                )
                if candidate != expected:
                    raise PersistenceBlocked("historical journal transition drift")
            previous = candidate
        active = journal["targetSha"] if journal["phase"] in ("active", "rolled-back") else journal["currentSha"]
        prior = journal["currentSha"] if journal["phase"] in ("active", "rolled-back") else journal["previousSha"]
        if head["committedActiveSha"] != active or head["committedPreviousSha"] != prior:
            raise PersistenceBlocked("committed pointer inconsistent")
        return generation, journal

    def _commit_record(self, value: dict[str, Any], number: int, *, fault: str | None = None) -> None:
        content = self._encode(value)
        # Durable interruption marker survives even a crash after head rename.
        # The offline fixture never decides that an incomplete mutation succeeded.
        self._atomic_new("operation.pending", b"pending\\n")
        self._atomic_new(f"record-{number:08d}.json", content,
                         fault=fault if fault in ("after-file-fsync", "after-rename", "after-directory-fsync") else None)
        if fault == "after-record-fsync":
            raise OfflineInterruption("after-record-fsync")
        finished = value["phase"] in ("active", "rolled-back")
        head = {
            "schemaVersion": 1, "generation": number,
            "transactionId": value["transactionId"],
            "recordSha256": hashlib.sha256(content).hexdigest(),
            "committedActiveSha": value["targetSha"] if finished else value["currentSha"],
            "committedPreviousSha": value["currentSha"] if finished else value["previousSha"],
            "requiresPhysicalReconciliation": True,
        }
        self._replace_head(self._encode(head), fault=fault)
        os.unlink("operation.pending", dir_fd=self._fd())
        os.fsync(self._fd())

    def begin(self, value: dict[str, Any], *, fault: str | None = None) -> None:
        journal = validate_journal(value)
        if journal["phase"] != "pending" or self._files() != {"fixture.lock"}:
            raise PersistenceBlocked("bootstrap must be a unique fresh pending transaction")
        self._commit_record(journal, 1, fault=fault)

    def advance(self, next_phase: str, *, at: str, expected_generation: int,
                manually_reconciled: bool = False, fault: str | None = None) -> None:
        generation, previous = self.snapshot()
        if generation != expected_generation:
            raise PersistenceBlocked("stale journal generation")
        updated = transition_journal(previous, next_phase, at=at, manually_reconciled=manually_reconciled)
        self._commit_record(updated, generation + 1, fault=fault)

    def close(self) -> None:
        if not self._closed:
            self._closed = True
            if self._lockfd is not None:
                fcntl.flock(self._lockfd, fcntl.LOCK_UN)
                os.close(self._lockfd)
                self._lockfd = None
            if self._dirfd is not None:
                os.close(self._dirfd)
                self._dirfd = None
            self._temp.cleanup()

    def __exit__(self, _typ: Any, _exc: Any, _tb: Any) -> None:
        self.close()
