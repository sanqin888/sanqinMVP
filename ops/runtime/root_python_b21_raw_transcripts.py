"""B2B2-B2 B2-1A: detached, READ-ONLY raw transcript gate for named C2 VMs.

Checks bytes and command coverage from *supplied* raw output, without running
VBoxManage, SSH, root, package tools or any subprocess. Never attests Host/Guest
origin, sender identity, snapshot state or installation authority.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

SOURCE_VM = "4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033"
SOURCE_SNAPSHOT = "028a681b-18b9-4dc7-a67f-69257e7cf85b"
RECOVERED_VM = "162701f1-bf68-413d-9f2d-76c513554881"
RECOVERED_DISK = "39381cc9-f526-4e35-8a09-3a265cfe79f4"

# Exact, already documented C2 source/recovered asset IDs; no shell or fallback.
HOST_COMMANDS = {
    "host.source-snapshots":
        ("VBoxManage", "snapshot", SOURCE_VM, "list", "--machinereadable"),
    "host.source-snapshot-info":
        ("VBoxManage", "snapshot", SOURCE_VM, "showvminfo", SOURCE_SNAPSHOT),
    "host.source-vm-info":
        ("VBoxManage", "showvminfo", SOURCE_VM, "--machinereadable"),
    "host.recovered-vm-info":
        ("VBoxManage", "showvminfo", RECOVERED_VM, "--machinereadable"),
    "host.recovered-disk-info":
        ("VBoxManage", "showmediuminfo", "disk", RECOVERED_DISK),
}
GUEST_COMMANDS = {
    "guest.identity": ("id", "-u"),
    "guest.kernel": ("uname", "-srmo"),
    "guest.os-release": ("cat", "/etc/os-release"),
    "guest.root-mount": ("findmnt", "-n", "-o", "SOURCE,FSTYPE,OPTIONS", "/"),
    "guest.root-stat":
        ("stat", "-c", "%n uid=%u gid=%g mode=%a dev=%d inode=%i type=%F",
         "/", "/lib", "/lib64", "/usr/bin/python3.12"),
    "guest.lib-alias": ("readlink", "/lib"),
    "guest.lib64-alias": ("readlink", "/lib64"),
    "guest.loader-alias": ("readlink", "/lib64/ld-linux-x86-64.so.2"),
    "guest.mount-namespace": ("readlink", "/proc/self/ns/mnt"),
}
EXPECTED_COMMANDS = {**HOST_COMMANDS, **GUEST_COMMANDS}
# Stable 2026-10-18 C2 Guest observations only; not a generic Ubuntu probe.
EXPECTED_GUEST_VALUES = {
    "guest.identity": b"1000",
    "guest.lib-alias": b"usr/lib",
    "guest.lib64-alias": b"usr/lib64",
    "guest.loader-alias": b"../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
}

RECORD_FIELDS = {
    "captureId", "argv", "channel", "actorId", "observedAtUtc",
    "innerExitCode", "outerExitCode", "stdoutSha256", "stderrSha256",
}
RAW_FIELDS = {"stdout", "stderr"}
SCHEMA = "sanq.c5.g2.r1.b2b2b2.b21-raw-transcript-review.v1"
MAX_RAW_BYTES_PER_CAPTURE = 65536
MAX_TOTAL_RAW_BYTES = 524288
_UTC = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\Z")
_ACTOR = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,95}\Z")
_SHA = re.compile(r"[0-9a-f]{64}\Z")


class ReadonlyTranscriptBlocked(ValueError):
    """Expected exact read-only output was missing, changed or unbounded."""


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise ReadonlyTranscriptBlocked(reason)


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _canonical(value: Any) -> bytes:
    try:
        raw = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=True, allow_nan=False).encode("ascii")
    except (TypeError, ValueError, OverflowError, RecursionError) as exc:
        raise ReadonlyTranscriptBlocked("malformed transcript metadata") from exc
    _require(len(raw) <= MAX_TOTAL_RAW_BYTES, "transcript metadata budget")
    return raw


def review_readonly_raw_transcripts(
    records: Any, raw_by_capture: Any, *, detached_record_pins: Any
) -> dict[str, Any]:
    """Validate synthetic/operator-provided raw receipts; NEVER grant trust.

    The detached pins must come from independently held raw originals, but
    this function cannot confirm their custody or authenticate their authors.
    stdout/stderr are bytes, never reconstructed from pasted terminal text.
    """
    _require(type(records) is list and len(records) == len(EXPECTED_COMMANDS)
             and type(raw_by_capture) is dict
             and set(raw_by_capture) == set(EXPECTED_COMMANDS)
             and type(detached_record_pins) is dict
             and set(detached_record_pins) == set(EXPECTED_COMMANDS),
             "missing/extra Host or Guest command evidence")
    seen: set[str] = set()
    total_raw_bytes = 0
    host_actors: set[str] = set()
    guest_actors: set[str] = set()
    for record in records:
        _require(type(record) is dict and set(record) == RECORD_FIELDS,
                 "invalid command record")
        capture_id = record["captureId"]
        _require(type(capture_id) is str and capture_id in EXPECTED_COMMANDS
                 and capture_id not in seen, "duplicate/unknown capture ID")
        seen.add(capture_id)
        argv = record["argv"]
        _require(type(argv) is list and argv == list(EXPECTED_COMMANDS[capture_id]),
                 "command not exact allowlisted read-only argv")
        host = capture_id.startswith("host.")
        _require(record["channel"] ==
                 ("host-direct" if host else "guest-ssh-unprivileged"),
                 "command source channel mismatch")
        actor = record["actorId"]
        _require(type(actor) is str and _ACTOR.fullmatch(actor) is not None,
                 "missing identified evidence operator")
        (host_actors if host else guest_actors).add(actor)
        observed_at = record["observedAtUtc"]
        _require(type(observed_at) is str
                 and _UTC.fullmatch(observed_at) is not None,
                 "missing UTC observation instant")
        _require(type(record["innerExitCode"]) is int
                 and record["innerExitCode"] == 0
                 and (record["outerExitCode"] is None if host else
                      (type(record["outerExitCode"]) is int
                       and record["outerExitCode"] == 0)),
                 "failed or missing command/SSH exit code")
        raw = raw_by_capture[capture_id]
        _require(type(raw) is dict and set(raw) == RAW_FIELDS
                 and all(type(raw[key]) is bytes for key in RAW_FIELDS),
                 "not raw stdout/stderr bytes")
        stdout, stderr = raw["stdout"], raw["stderr"]
        _require(0 < len(stdout) and len(stdout) + len(stderr)
                 <= MAX_RAW_BYTES_PER_CAPTURE,
                 "empty or oversized command raw output")
        total_raw_bytes += len(stdout) + len(stderr)
        _require(total_raw_bytes <= MAX_TOTAL_RAW_BYTES,
                 "combined raw evidence budget")
        if capture_id in EXPECTED_GUEST_VALUES:
            _require(stdout.strip() == EXPECTED_GUEST_VALUES[capture_id],
                     "disposable Guest identity or alias differs from C2 baseline")
        _require(type(record["stdoutSha256"]) is str
                 and _SHA.fullmatch(record["stdoutSha256"]) is not None
                 and record["stdoutSha256"] == _digest(stdout)
                 and type(record["stderrSha256"]) is str
                 and _SHA.fullmatch(record["stderrSha256"]) is not None
                 and record["stderrSha256"] == _digest(stderr),
                 "reported raw bytes/hash differ")
        pin = detached_record_pins[capture_id]
        _require(type(pin) is str and _SHA.fullmatch(pin) is not None
                 and pin == _digest(_canonical(record)),
                 "independent record metadata digest mismatch")
    _require(seen == set(EXPECTED_COMMANDS),
             "incomplete snapshot/Guest evidence coverage")
    _require(bool(host_actors) and bool(guest_actors),
             "unidentified Host or Guest reader")
    _require([r["captureId"] for r in records] == sorted(EXPECTED_COMMANDS),
             "transcript noncanonical command order")
    return {
        "schema": SCHEMA,
        "hostCommandClaimsCompared": len(HOST_COMMANDS),
        "guestCommandClaimsCompared": len(GUEST_COMMANDS),
        "rawByteClaimsMatchDetachedDigests": True,
        "allRequiredCommandsDeclared": True,
        "hostEnvironmentIndependentlyAuthenticated": False,
        "guestIdentityIndependentlyAuthenticated": False,
        "operatorAndWitnessIdentityAuthenticated": False,
        "packageSourceSignaturesVerified": False,
        "rootAnchorFdAuthenticated": False,
        "actualPythonElfDlopenConsumptionWitnessed": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
