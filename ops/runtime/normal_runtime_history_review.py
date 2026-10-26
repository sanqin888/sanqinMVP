"""F4-B5 fixed v1/v2 history observation, never an admission or replay engine.

No writer, fsync, repair, migration, finalizer, network, CLI or caller path.
A structurally terminal disposition remains an UNAUTHENTICATED claim.
"""
from __future__ import annotations

from contextlib import contextmanager
import os
import re
import stat
import sys

import normal_runtime_local_admission as local
from normal_runtime_inputs import _document
from normal_runtime_launch import canonical, digest, TXID

_HISTORY = local._HISTORY
_SCHEMA = "sanq.runtime.local-history-event.v2"
_MAX_EVENTS = 256
_MAX_BYTES = 16384
_MAX_TOTAL = 4 * 1024 * 1024
_ZERO = "0" * 64
_HEX = re.compile(r"[0-9a-f]{64}")
_KEYS = {"schema", "sequence", "previousSha256", "kind", "transactionId",
         "attemptId", "requestSha256", "launchMaterialsSha256", "claimSha256", "payload"}


def _require(ok, message):
    if not ok:
        raise local.LocalAdmissionBlocked(message)


def _pin(value):
    return type(value) is str and _HEX.fullmatch(value) is not None and value != _ZERO


def _names(fd, maximum):
    found = set()
    scan_fd = os.open(".", local._flags(), dir_fd=fd)
    try:
        with os.scandir(scan_fd) as entries:
            for entry in entries:
                found.add(entry.name)
                _require(len(found) <= maximum, "history directory budget exceeded")
    finally:
        os.close(scan_fd)
    return found


@contextmanager
def _scope():
    with local._locked_base() as (base, device, base_recheck, stack):
        directories = {}
        keys = {}
        for name in (local._LEDGER, _HISTORY):
            fd = os.open(name, local._flags(), dir_fd=base)
            stack.callback(os.close, fd)
            keys[name] = local._directory_key(fd, *local._OWNER, device)
            _require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700,
                     "both history layout directories must already be 0700")
            directories[name] = fd
        _require(len(set(key[:2] for key in keys.values())) == 2,
                 "legacy and history directories alias")
        # Content timestamps detect additions/removals even if names return to
        # the same set. Ancestors retain their existing finite-edge semantics.
        snapshots = {name: local._key(os.fstat(fd)) for name, fd in directories.items()}

        def recheck():
            base_recheck()
            for name, fd in directories.items():
                entry = os.stat(name, dir_fd=base, follow_symlinks=False)
                _require(local._directory_key(fd, *local._OWNER, device) == keys[name]
                         and local._key(os.fstat(fd)) == snapshots[name]
                         and local._key(entry) == snapshots[name],
                         "history directory changed or replaced")

        recheck()
        try:
            yield directories[local._LEDGER], directories[_HISTORY], device, recheck, stack
        finally:
            if sys.exc_info()[0] is None:
                recheck()


def _read_event(parent, name, device, stack):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                 dir_fd=parent)
    stack.callback(os.close, fd)
    key = local._file_key(fd, device)
    _require(0 < key[6] <= _MAX_BYTES, "history event byte budget exceeded")
    raw = os.pread(fd, _MAX_BYTES + 1, 0)
    _require(len(raw) == key[6], "history event read differs")
    local._entry(parent, name, fd, key, device)
    return fd, key, raw


def _event(raw, sequence, previous):
    obj = _document(raw)
    _require(canonical(obj) == raw and set(obj) == _KEYS and obj["schema"] == _SCHEMA,
             "unrecognized history event")
    _require(type(obj["sequence"]) is int and obj["sequence"] == sequence
             and obj["previousSha256"] == previous,
             "history sequence or predecessor differs")
    _require(type(obj["kind"]) is str and obj["kind"] in
             {"CLAIM", "ABORT_OBSERVATION", "DISPOSITION_OBSERVATION"},
             "unsupported history event kind")
    _require(type(obj["transactionId"]) is str and TXID.fullmatch(obj["transactionId"])
             and all(_pin(obj[n]) for n in
                     ("attemptId", "requestSha256", "launchMaterialsSha256", "claimSha256"))
             and type(obj["payload"]) is dict, "invalid history event identity")
    return obj


def _interpret(rows):
    previous = _ZERO
    consumed, attempts = set(), set()
    claim = None
    claim_sha = None
    abort_seen = False
    dispositions = 0
    for sequence, raw in enumerate(rows, 1):
        obj = _event(raw, sequence, previous)
        kind, payload = obj["kind"], obj["payload"]
        if kind == "CLAIM":
            _require(claim is None, "overlapping unresolved claims")
            candidate = local._claim(canonical(payload))
            _require(all(candidate[n] == obj[n] for n in
                         ("transactionId", "attemptId", "requestSha256", "launchMaterialsSha256"))
                     and digest(canonical(candidate)) == obj["claimSha256"],
                     "claim payload identity differs")
            _require(all(_pin(candidate[n]) for n in
                         ("attemptId", "requestSha256", "launchMaterialsSha256",
                          "preservedStateSha256"))
                     and candidate["currentRuntimeSha"] != candidate["targetRuntimeSha"]
                     and candidate["currentArchiveDigest"] != candidate["targetArchiveDigest"],
                     "invalid claim update identity")
            _require(obj["transactionId"] not in consumed and obj["attemptId"] not in attempts,
                     "transaction or attempt already consumed")
            consumed.add(obj["transactionId"])
            attempts.add(obj["attemptId"])
            claim, claim_sha, abort_seen = candidate, obj["claimSha256"], False
        else:
            _require(claim is not None and obj["claimSha256"] == claim_sha
                     and all(obj[n] == claim[n] for n in
                             ("transactionId", "attemptId", "requestSha256", "launchMaterialsSha256")),
                     "history observation belongs to another claim")
            if kind == "ABORT_OBSERVATION":
                _require(not abort_seen and set(payload) == {"receiptSha256", "receipt"},
                         "duplicate or malformed abort observation")
                raw_receipt = canonical(payload["receipt"])
                local._abort_receipt(raw_receipt, claim)
                _require(_pin(payload["receiptSha256"])
                         and payload["receiptSha256"] == digest(raw_receipt),
                         "abort receipt digest differs")
                abort_seen = True
            else:
                _require(set(payload) == {"outcome", "evidenceSha256", "r2StateSha256"}
                         and type(payload["outcome"]) is str
                         and payload["outcome"] in {"COMPLETION_CLAIM", "INCIDENT_DISPOSITION_CLAIM"}
                         and _pin(payload["evidenceSha256"]) and _pin(payload["r2StateSha256"]),
                         "invalid unauthenticated disposition observation")
                _require(not abort_seen or payload["outcome"] == "INCIDENT_DISPOSITION_CLAIM",
                         "abort cannot be followed by a normal completion claim")
                # STRUCTURAL terminal marker only; never verified closure.
                dispositions += 1
                claim, claim_sha = None, None
        previous = digest(raw)
    status = ("NO_LOCAL_HISTORY_OBSERVED" if not rows else
              "DISPOSITION_CLAIM_UNAUTHENTICATED" if claim is None else
              "UNRESOLVED_WITH_ABORT_OBSERVATION" if abort_seen else "UNRESOLVED_ATTEMPT")
    return dict(status=status, eventCount=len(rows), consumedTransactions=sorted(consumed),
                unauthenticatedDispositionCount=dispositions,
                unresolvedTransactionId=None if claim is None else claim["transactionId"],
                unresolvedAttemptId=None if claim is None else claim["attemptId"],
                historyHeadSha256=previous)


def _report(**observed):
    return {
        "kind": "normal-runtime-history-readonly-review-v2",
        "scope": "STRUCTURE_ONLY_UNAUTHENTICATED",
        **observed,
        "decision": "BLOCKED", "newAttemptAuthorized": False,
        "dispositionAuthenticated": False, "historyDurabilityVerified": False,
        "sourceProvenanceAuthenticated": False, "namespaceAuthenticated": False,
        "continuousMaintenanceVerified": False, "r2DispositionVerified": False,
        "transactionAdmitted": False, "transactionFinalized": False,
        "flowInvoked": False, "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }


def inspect_fixed_history():
    """Observe two fixed layouts under the same v1 global nonblocking lock.

    Unsafe/missing prerequisites, busy lock or path races raise. Malformed event
    data yields UNKNOWN_BLOCKING without partial identities, writes or repair.
    Legacy contents always block; old v1 admission is NOT switched by this API.
    """
    with _scope() as (legacy, history, device, recheck, stack):
        held = {}
        try:
            legacy_names = _names(legacy, 3)
            names = _names(history, _MAX_EVENTS)
            if legacy_names:
                result = _report(status="LEGACY_LEDGER_BLOCKING",
                                 legacyPresent=True, historyPresent=bool(names))
            else:
                expected = {f"{n:08d}.json" for n in range(1, len(names) + 1)}
                _require(names == expected, "history filenames are not an exact contiguous sequence")
                total = 0
                for name in sorted(names):
                    held[name] = _read_event(history, name, device, stack)
                    total += len(held[name][2])
                    _require(total <= _MAX_TOTAL, "history total byte budget exceeded")
                result = _report(**_interpret([row[2] for row in held.values()]))
        except (ValueError, OSError, KeyError, TypeError, RecursionError, OverflowError):
            result = _report(status="UNKNOWN_BLOCKING")
        # Even a parsed, nonauthorizing report must not escape a changed scope.
        for name, (fd, key, raw) in held.items():
            local._entry(history, name, fd, key, device)
            _require(os.pread(fd, _MAX_BYTES + 1, 0) == raw, "held history bytes changed")
        recheck()
    return result
