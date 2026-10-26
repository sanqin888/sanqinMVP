"""F4-B1 local single-attempt consumption, never production admission.

Explicit context entry writes a durable unresolved claim under fixed pre-existing
root-private objects. No Flow wiring, source/host authentication, finalizer,
cleanup, replay, R2 epoch or effect permission. Closing only releases OS FDs.
"""
from __future__ import annotations

from contextlib import contextmanager, ExitStack
import fcntl
import os
import re
import secrets
import stat
import sys
import threading

from normal_runtime_inputs import parse_pinned_update_inputs, _document
from normal_runtime_launch import canonical, digest, TXID
from normal_runtime_source_anchor import (
    _platform, _flags, _open_namespace_root, _directory_key, _checked_recheck,
)

_OWNER = (0, 0)
_PARTS = ("root", "sanq-runtime-operator")
_LOCK = "normal-update.lock"
_LEDGER = "normal-update-transactions"
_ACTIVE = "active.json"
_LIMIT = 32768
_CLAIM_SCHEMA = "sanq.runtime.local-admission-claim.v1"
_ABORT_SCHEMA = "sanq.runtime.local-admission-abort-observation.v1"
_HEX = re.compile(r"[0-9a-f]{64}")
_BINDINGS = ("currentRuntimeSha", "targetRuntimeSha", "currentArchiveDigest",
             "targetArchiveDigest", "currentAppSha", "previousAppSha",
             "preservedStateSha256")
_FALSE = ("namespaceAuthenticated", "currentInstallationVerified",
          "sourceProvenanceAuthenticated", "continuousMaintenanceVerified",
          "flowInvoked", "readyToInstall", "authorizedToMutateProduction")


class LocalAdmissionBlocked(ValueError):
    pass


def _require(ok, reason):
    if not ok:
        raise LocalAdmissionBlocked(reason)


def _require_root():
    _require((os.getuid(), os.geteuid(), os.getgid(), os.getegid()) == (0, 0, 0, 0),
             "local admission requires real and effective root")


def _key(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _file_key(fd, device):
    info = os.fstat(fd)
    _require(stat.S_ISREG(info.st_mode) and (info.st_uid, info.st_gid) == _OWNER
             and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
             and info.st_dev == device and 0 <= info.st_size <= _LIMIT,
             "unsafe bounded local control file")
    return _key(info)


def _entry(parent, name, fd, key, device):
    _require(_file_key(fd, device) == key
             and _key(os.stat(name, dir_fd=parent, follow_symlinks=False)) == key,
             "local control file changed or replaced")


def _names(fd):
    # Bound even directory enumeration. No opening caller-selected paths.
    result = set()
    # Fresh open-file description: repeated scans cannot share directory offset.
    scan_fd = os.open(".", _flags(), dir_fd=fd)
    try:
        with os.scandir(scan_fd) as entries:
            for entry in entries:
                result.add(entry.name)
                _require(len(result) <= 3, "extra or excessive ledger controls")
    finally:
        os.close(scan_fd)
    return result


def _read(parent, name, device, stack):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                 dir_fd=parent)
    stack.callback(os.close, fd)
    key = _file_key(fd, device)
    raw = os.pread(fd, _LIMIT + 1, 0)
    _require(len(raw) == key[6], "local control read differs")
    _entry(parent, name, fd, key, device)
    return fd, key, raw


def _write(parent, name, raw, device, stack):
    _require(type(raw) is bytes and 0 < len(raw) <= _LIMIT, "bounded control bytes required")
    fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
                 | os.O_CLOEXEC, 0o600, dir_fd=parent)
    stack.callback(os.close, fd)
    info = os.fstat(fd)
    _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
             and (info.st_uid, info.st_gid) == _OWNER and info.st_dev == device,
             "unsafe newly created control")
    os.fchmod(fd, 0o600)  # Only this new exclusive object; never repair existing objects.
    offset = 0
    while offset < len(raw):
        written = os.write(fd, raw[offset:])
        _require(type(written) is int and 0 < written <= len(raw) - offset,
                 "control write made no valid progress")
        offset += written
    os.fsync(fd)
    key = _file_key(fd, device)
    _require(key[6] == len(raw) and os.pread(fd, _LIMIT + 1, 0) == raw,
             "control readback differs")
    _entry(parent, name, fd, key, device)
    os.fsync(parent)  # A failed/unknown sync leaves the create-only claim untouched.
    return fd, key, raw


@contextmanager
def _locked_base():
    _require_root()
    _platform()
    with ExitStack() as stack:
        root = _open_namespace_root()
        stack.callback(os.close, root)
        held = [("", root, _directory_key(root, *_OWNER, None))]
        device = held[0][2][0]
        for name in _PARTS:
            fd = os.open(name, _flags(), dir_fd=held[-1][1])
            stack.callback(os.close, fd)
            key = _directory_key(fd, *_OWNER, device)
            _require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700,
                     "private ancestors must already be 0700")
            held.append((name, fd, key))
        base = held[-1][1]
        lock_fd, lock_key, raw = _read(base, _LOCK, device, stack)
        _require(raw == b"", "pre-existing lock must be empty")
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise LocalAdmissionBlocked("installation lock busy") from exc
        fixed = tuple(held)

        def recheck():
            _checked_recheck(fixed, *_OWNER)
            _entry(base, _LOCK, lock_fd, lock_key, device)

        recheck()
        try:
            yield base, device, recheck, stack
        finally:
            # Never mask an original exception with an exit recheck failure.
            # Explicit close, never LOCK_UN: a fork shares the file description.
            if sys.exc_info()[0] is None:
                recheck()


@contextmanager
def _locked():
    # Preserve v1's exact scope/API; history inspection only reuses BASE+lock.
    with _locked_base() as (base, device, base_recheck, stack):
        ledger = os.open(_LEDGER, _flags(), dir_fd=base)
        stack.callback(os.close, ledger)
        key = _directory_key(ledger, *_OWNER, device)
        _require(stat.S_IMODE(os.fstat(ledger).st_mode) == 0o700,
                 "private ledger must already be 0700")

        def recheck():
            base_recheck()
            info = os.stat(_LEDGER, dir_fd=base, follow_symlinks=False)
            _require(_directory_key(ledger, *_OWNER, device) == key
                     and (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid) == key,
                     "private ledger edge changed")

        recheck()
        try:
            yield ledger, device, recheck, stack
        finally:
            if sys.exc_info()[0] is None:
                recheck()


def _report(status, **extra):
    return {"status": status, "scope": "LOCAL_CONSUMPTION_ONLY",
            "decision": "BLOCKED", **dict.fromkeys(_FALSE, False), **extra}


def _claim(raw):
    obj = _document(raw)
    expected = {"schema", "phase", "transactionId", "attemptId", "requestSha256",
                "launchMaterialsSha256", *_BINDINGS}
    _require(set(obj) == expected and canonical(obj) == raw
             and obj["schema"] == _CLAIM_SCHEMA
             and obj["phase"] == "UNRESOLVED_LOCAL_CONSUMPTION",
             "unrecognized local claim")
    _require(type(obj["transactionId"]) is str and TXID.fullmatch(obj["transactionId"])
             and all(type(obj[n]) is str and _HEX.fullmatch(obj[n])
                     for n in ("attemptId", "requestSha256", "launchMaterialsSha256",
                               "preservedStateSha256")), "invalid claim identity")
    for name in ("currentRuntimeSha", "targetRuntimeSha", "currentAppSha", "previousAppSha"):
        _require(type(obj[name]) is str and re.fullmatch(r"[0-9a-f]{40}", obj[name]),
                 "invalid claim source identity")
    for name in ("currentArchiveDigest", "targetArchiveDigest"):
        _require(type(obj[name]) is str and re.fullmatch(r"sha256:[0-9a-f]{64}", obj[name]),
                 "invalid claim archive identity")
    return obj


def _abort_receipt(raw, claim):
    _require(type(raw) is bytes and 0 < len(raw) <= 16384, "bounded abort receipt required")
    obj = _document(raw)
    _require(canonical(obj) == raw
             and obj.get("schema") == "sanq.runtime.normal-update-flow.v1"
             and obj.get("requestSha256") == claim["requestSha256"]
             and obj.get("launchMaterialsSha256") == claim["launchMaterialsSha256"]
             and obj.get("status") == "ABORTED" and obj.get("flowCompleted") is False
             and obj.get("authorizedToMutateProduction") is False
             and obj.get("readyToInstall") is False and obj.get("decision") == "BLOCKED",
             "abort observation differs from this attempt inputs")
    return obj


class _Attempt:
    """Live context only. Disk reports cannot reconstruct this held-lock object."""
    def __init__(self, ledger, device, recheck, stack, claim, controls):
        self._ledger, self._device = ledger, device
        self._recheck, self._stack = recheck, stack
        self._claim, self._controls = claim, controls
        self._owner = (os.getpid(), threading.get_ident())
        self._live = True
        self._abort_attempted = False

    def __reduce_ex__(self, protocol):
        raise TypeError("local attempt handles cannot be serialized")

    def _check(self):
        _require(self._live and self._owner == (os.getpid(), threading.get_ident()),
                 "attempt handle is closed or belongs to another process/thread")
        self._recheck()
        _require(_names(self._ledger) == set(self._controls), "ledger controls changed")
        for name, (fd, key, raw) in self._controls.items():
            _entry(self._ledger, name, fd, key, self._device)
            _require(os.pread(fd, _LIMIT + 1, 0) == raw, "held control bytes changed")

    def observation(self):
        self._check()
        return _report("LOCAL_ATTEMPT_HELD_UNRESOLVED",
                       transactionId=self._claim["transactionId"],
                       attemptId=self._claim["attemptId"],
                       requestSha256=self._claim["requestSha256"],
                       localConsumptionRecorded=True)

    def record_abort(self, receipt_bytes, *, attempt_id):
        self._check()
        _require(type(attempt_id) is str and attempt_id == self._claim["attemptId"],
                 "abort belongs to another attempt")
        receipt = _abort_receipt(receipt_bytes, self._claim)
        name = self._claim["transactionId"] + ".abort.json"
        raw = canonical({"schema": _ABORT_SCHEMA, "attemptId": attempt_id,
                         "claimSha256": digest(self._controls[_ACTIVE][2]),
                         "receiptSha256": digest(receipt_bytes), "receipt": receipt})
        # Poison before any write attempt, including an unknown create outcome.
        _require(not self._abort_attempted, "abort already attempted")
        self._abort_attempted = True
        self._controls[name] = _write(self._ledger, name, raw, self._device, self._stack)
        self._check()
        return digest(raw)


@contextmanager
def consume_local_attempt(launch_bytes, request_bytes, *,
                          expected_launch_sha256, expected_request_sha256):
    """Consume canonical input identity once; caller must hold across whole Flow.

    This kernel DOES NOT verify source/current/target provenance or admit Flow.
    A future trusted composer must authenticate those before this context and
    retain it through all steps/abort. No caller 'verified' flag is accepted.
    """
    parsed = parse_pinned_update_inputs(launch_bytes, request_bytes,
        expected_launch_sha256=expected_launch_sha256,
        expected_request_sha256=expected_request_sha256)
    request = parsed.request.document()
    with _locked() as (ledger, device, recheck, stack):
        _require(not _names(ledger), "unresolved or consumed ledger blocks new attempts")
        recheck()
        claim = {"schema": _CLAIM_SCHEMA, "phase": "UNRESOLVED_LOCAL_CONSUMPTION",
                 "transactionId": request["transactionId"], "attemptId": secrets.token_hex(32),
                 "requestSha256": digest(request_bytes),
                 "launchMaterialsSha256": digest(launch_bytes),
                 **{n: request[n] for n in _BINDINGS}}
        raw = canonical(claim)
        controls = {_ACTIVE: _write(ledger, _ACTIVE, raw, device, stack)}
        # Global active entry is file+parent synced BEFORE consuming the tx name.
        name = request["transactionId"] + ".json"
        controls[name] = _write(ledger, name, raw, device, stack)
        handle = _Attempt(ledger, device, recheck, stack, claim, controls)
        handle._check()
        try:
            yield handle
            handle._check()
        finally:
            handle._live = False
        # Never unlink, finalize, repair, restore policy or release business.


def inspect_local_admission():
    """Bounded, read-only incident observation under the same nonblocking lock.

    Even empty means only 'no local claim observed', never permission. Invalid
    paths/lock raise; malformed ledger returns UNKNOWN_BLOCKING without repair.
    """
    with _locked() as (ledger, device, recheck, stack):
        try:
            names = _names(ledger)
            if not names:
                return _report("NO_LOCAL_CLAIM_OBSERVED", newAttemptAuthorized=False)
            _require(_ACTIVE in names, "orphan consumed or unknown controls")
            active_row = _read(ledger, _ACTIVE, device, stack)
            raw = active_row[2]
            claim = _claim(raw)
            tx = claim["transactionId"]
            consumed, abort = tx + ".json", tx + ".abort.json"
            _require(names in ({_ACTIVE, consumed}, {_ACTIVE, consumed, abort}),
                     "partial or extra ledger controls")
            controls = {_ACTIVE: active_row}
            consumed_row = _read(ledger, consumed, device, stack)
            consumed_raw = consumed_row[2]
            controls[consumed] = consumed_row
            _require(consumed_raw == raw, "claim and consumed identity differ")
            status = "UNRESOLVED_ATTEMPT"
            if abort in names:
                abort_row = _read(ledger, abort, device, stack)
                abort_raw = abort_row[2]
                controls[abort] = abort_row
                doc = _document(abort_raw)
                _require(canonical(doc) == abort_raw
                         and set(doc) == {"schema", "attemptId", "claimSha256",
                                          "receiptSha256", "receipt"}
                         and doc["schema"] == _ABORT_SCHEMA
                         and doc["attemptId"] == claim["attemptId"]
                         and doc["claimSha256"] == digest(raw),
                         "abort observation ownership differs")
                receipt_raw = canonical(doc["receipt"])
                _abort_receipt(receipt_raw, claim)
                _require(doc["receiptSha256"] == digest(receipt_raw), "abort receipt differs")
                status = "UNRESOLVED_WITH_ABORT_OBSERVATION"
            for name, (fd, key, expected) in controls.items():
                _entry(ledger, name, fd, key, device)
                _require(os.pread(fd, _LIMIT + 1, 0) == expected,
                         "incident controls changed during observation")
            _require(_names(ledger) == names, "incident controls changed")
            recheck()
            return _report(status, transactionId=tx, attemptId=claim["attemptId"],
                           newAttemptAuthorized=False)
        except (ValueError, OSError, KeyError, TypeError, RecursionError, OverflowError):
            recheck()
            return _report("UNKNOWN_BLOCKING", newAttemptAuthorized=False)
