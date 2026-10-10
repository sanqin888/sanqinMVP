"""C5-U2D-1: pure, inert review of proposed Runtime handoff evidence.

No filesystem, command, root operation, service access, external attestation, or
installation interface. All inputs are untrusted caller statements: a consistent
review NEVER proves provenance, quiescence, or permission to install/rollback.
"""
from __future__ import annotations

import re
from typing import Any

from runtime_update_contract import MEMBERS, PRESERVED, _digest, _inventory, _sha

RUNTIME_ROOT = "/opt/sanq/runtime"
PROJECT = "sanq-app"
DATABASE_VOLUME = "sanq-app_pgdata"
PHASES = (
    "PENDING_EXCHANGE",
    "EXCHANGED_UNCONFIRMED",
    "PREVIOUS_RETAINED",
    "VERIFIED_RETAINED",
)
HASH = re.compile(r"[0-9a-f]{64}\Z")
TXID = re.compile(r"[0-9a-f]{32}\Z")
KINDS = "inert-c5-u2d1-handoff-intent-v1"


class HandoffEvidenceBlocked(ValueError):
    """The supplied data is inconsistent or incomplete; never attempt recovery."""


def _require(ok: bool, description: str) -> None:
    if not ok:
        raise HandoffEvidenceBlocked(description)


def _exact(value: Any, keys: set[str], title: str) -> dict[str, Any]:
    _require(type(value) is dict and set(value) == keys, title + " fields invalid")
    return value


def _positive_number(value: Any, name: str) -> int:
    _require(type(value) is int and value > 0, name + " invalid")
    return value


def _manifest_record(value: Any) -> tuple[str, dict[str, Any]]:
    v = _exact(value, {"sourceSha", "archiveDigest", "manifest"}, "runtime version")
    sha = _sha(v["sourceSha"])
    _digest(v["archiveDigest"])
    members = _inventory(v["manifest"], sha)
    return sha, members


def _application(value: Any) -> dict[str, Any]:
    record = _exact(
        value, {"currentSha", "previousSha", "envSha", "runningImageSha", "releasePhase"},
        "application",
    )
    current = _sha(record["currentSha"])
    _sha(record["previousSha"])
    _require(
        record["envSha"] == current and record["runningImageSha"] == current,
        "application image/env/source identity drift",
    )
    _require(record["releasePhase"] == "active", "application release not ACTIVE")
    return record


def review_handoff_intent(intent: Any) -> dict[str, Any]:
    """Validate logical self-consistency; DO NOT authenticate any evidence."""
    record = _exact(
        intent,
        {"schemaVersion", "kind", "currentRuntime", "targetRuntime",
         "application", "runtimeRoot", "composeProject", "databaseVolume",
         "authorizedToMutateProduction"},
        "handoff intent",
    )
    _require(type(record["schemaVersion"]) is int and record["schemaVersion"] == 1,
             "unsupported intent schema")
    _require(record["kind"] == KINDS, "unknown handoff intent")
    _require(
        (record["runtimeRoot"], record["composeProject"], record["databaseVolume"])
        == (RUNTIME_ROOT, PROJECT, DATABASE_VOLUME),
        "fixed production identity mismatch",
    )
    _require(
        record["authorizedToMutateProduction"] is False,
        "production authority cannot be supplied by intent",
    )
    old, old_members = _manifest_record(record["currentRuntime"])
    new, new_members = _manifest_record(record["targetRuntime"])
    _require(old != new, "unchanged Runtime SHA")
    changes = [member for member in MEMBERS if old_members[member] != new_members[member]]
    _require(bool(changes), "no changed Runtime files; use image-only release")
    app = _application(record["application"])
    return {
        "schemaVersion": 1,
        "kind": "inert-c5-u2d1-consistency-review-v1",
        "oldRuntimeSourceSha": old,
        "targetRuntimeSourceSha": new,
        "applicationCurrentSha": app["currentSha"],
        "applicationPreviousSha": app["previousSha"],
        "changedRuntimeMembers": changes,
        "preservedExternalFiles": list(PRESERVED),
        "externalProvenanceVerified": False,
        "liveHostInspected": False,
        "quiescenceVerified": False,
        "readyToInstall": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
        "automaticRecovery": False,
        "manualRecoveryRequired": True,
    }


def _dynamic(value: Any, *, ubuntu_uid: int, ubuntu_gid: int, device: int
             ) -> dict[str, dict[str, Any]]:
    files = _exact(value, set(PRESERVED), "dynamic files")
    for path in PRESERVED:
        row = _exact(
            files[path], {"sha256", "uid", "gid", "mode", "inode", "device"},
            "dynamic file " + path,
        )
        _require(isinstance(row["sha256"], str) and HASH.fullmatch(row["sha256"]) is not None,
                 "dynamic file digest malformed")
        _positive_number(row["inode"], "dynamic file inode")
        _require(type(row["device"]) is int and row["device"] == device,
                 "dynamic file device mismatch")
        if path == ".env":
            expected = (ubuntu_uid, ubuntu_gid, 0o600)
        elif path == ".sanq-release-state.json":
            expected = (0, 0, 0o600)
        else:
            expected = (0, 0, 0o644)
        _require(
            type(row["uid"]) is int and type(row["gid"]) is int
            and type(row["mode"]) is int
            and (row["uid"], row["gid"], row["mode"]) == expected,
            "dynamic file ownership/mode mismatch: " + path,
        )
    return files


def _tree(value: Any, *, ubuntu_uid: int, ubuntu_gid: int) -> dict[str, Any]:
    tree = _exact(
        value, {"sourceSha", "inode", "device", "isSymlink", "dynamicFiles"},
        "runtime tree",
    )
    _sha(tree["sourceSha"])
    _positive_number(tree["inode"], "runtime tree inode")
    _positive_number(tree["device"], "runtime tree device")
    _require(tree["isSymlink"] is False, "runtime tree symlink prohibited")
    dynamic = _dynamic(tree["dynamicFiles"], ubuntu_uid=ubuntu_uid, ubuntu_gid=ubuntu_gid,
                       device=tree["device"])
    inodes = [tree["inode"], *(row["inode"] for row in dynamic.values())]
    _require(len(set(inodes)) == len(inodes), "intra-tree inode alias")
    return tree


def inspect_handoff_incident(intent: Any, journal: Any, observed: Any) -> dict[str, Any]:
    """Classify *caller-described* disk slots; never resume or repair anything.

    A journal can lag a successful syscall. A journal claimed to be ahead of
    observed disk evidence is an inconsistency: block rather than guess.
    """
    plan = review_handoff_intent(intent)
    record = _exact(
        journal,
        {"schemaVersion", "transactionId", "phase", "oldRuntimeSourceSha",
         "targetRuntimeSourceSha", "applicationCurrentSha",
         "manualRecoveryRequired", "productionActivationAuthorized"},
        "handoff journal",
    )
    _require(type(record["schemaVersion"]) is int and record["schemaVersion"] == 1,
             "invalid journal schema")
    _require(isinstance(record["transactionId"], str)
             and TXID.fullmatch(record["transactionId"]) is not None,
             "invalid transaction id")
    _require(record["phase"] in PHASES, "invalid journal phase")
    _require(
        record["manualRecoveryRequired"] is True
        and record["productionActivationAuthorized"] is False,
        "forged journal authority",
    )
    _require(
        (record["oldRuntimeSourceSha"], record["targetRuntimeSourceSha"],
         record["applicationCurrentSha"])
        == (plan["oldRuntimeSourceSha"], plan["targetRuntimeSourceSha"],
            plan["applicationCurrentSha"]),
        "journal release identities do not match intent",
    )

    evidence = _exact(
        observed,
        {"trees", "snapshot", "application", "ubuntuUid", "ubuntuGid",
         "unresolvedWriter", "pathRefsPresent"},
        "observed state",
    )
    _require(evidence["unresolvedWriter"] is False
             and evidence["pathRefsPresent"] is False,
             "active writer or path references alleged")
    uid = _positive_number(evidence["ubuntuUid"], "ubuntu uid")
    gid = _positive_number(evidence["ubuntuGid"], "ubuntu gid")
    app = _application(evidence["application"])
    _require(app == intent["application"], "application state changed during handoff")

    slots = evidence["trees"]
    _require(type(slots) is dict and (
        set(slots) == {"runtime", "candidate"}
        or set(slots) == {"runtime", "previous"}
    ), "ambiguous runtime slots")
    active = _tree(slots["runtime"], ubuntu_uid=uid, ubuntu_gid=gid)
    alternate_name = "candidate" if "candidate" in slots else "previous"
    alternate = _tree(slots[alternate_name], ubuntu_uid=uid, ubuntu_gid=gid)
    _require(active["device"] == alternate["device"], "runtime tree device conflict")
    active_inodes = {active["inode"], *(row["inode"] for row in active["dynamicFiles"].values())}
    alternate_inodes = {
        alternate["inode"], *(row["inode"] for row in alternate["dynamicFiles"].values())
    }
    _require(not active_inodes.intersection(alternate_inodes), "cross-tree inode alias")

    old_sha = plan["oldRuntimeSourceSha"]
    new_sha = plan["targetRuntimeSourceSha"]
    if (active["sourceSha"], alternate["sourceSha"], alternate_name) == (
        old_sha, new_sha, "candidate"
    ):
        location = "before_exchange"
    elif (active["sourceSha"], alternate["sourceSha"], alternate_name) == (
        new_sha, old_sha, "candidate"
    ):
        location = "after_exchange"
    elif (active["sourceSha"], alternate["sourceSha"], alternate_name) == (
        new_sha, old_sha, "previous"
    ):
        location = "previous_retained"
    else:
        raise HandoffEvidenceBlocked("unreconcilable runtime version/slot identity")

    for name in PRESERVED:
        a = active["dynamicFiles"][name]
        b = alternate["dynamicFiles"][name]
        _require(
            (a["sha256"], a["uid"], a["gid"], a["mode"], a["device"])
            == (b["sha256"], b["uid"], b["gid"], b["mode"], b["device"]),
            "dynamic state mismatch: " + name,
        )
        _require(a["inode"] != b["inode"], "dynamic hardlink/inode alias: " + name)

    snap = _exact(
        evidence["snapshot"],
        {"sourceSha", "device", "inode", "completeVerified", "separatelyRetained"},
        "recovery snapshot",
    )
    _require(
        snap["sourceSha"] == old_sha and snap["completeVerified"] is True
        and snap["separatelyRetained"] is True
        and type(snap["device"]) is int and snap["device"] == active["device"]
        and type(snap["inode"]) is int and snap["inode"] > 0
        and snap["inode"] not in active_inodes.union(alternate_inodes),
        "recovery snapshot incomplete or aliased",
    )

    phase = record["phase"]
    if (
        (phase in ("EXCHANGED_UNCONFIRMED", "PREVIOUS_RETAINED", "VERIFIED_RETAINED")
         and location == "before_exchange")
        or (phase in ("PREVIOUS_RETAINED", "VERIFIED_RETAINED")
            and location != "previous_retained")
    ):
        raise HandoffEvidenceBlocked("journal ahead of observed disk state")

    order = {"before_exchange": 0, "after_exchange": 1, "previous_retained": 2}
    phase_order = {
        "PENDING_EXCHANGE": 0, "EXCHANGED_UNCONFIRMED": 1,
        "PREVIOUS_RETAINED": 2, "VERIFIED_RETAINED": 2,
    }
    return {
        "status": "manual-incident-review-only",
        "transactionId": record["transactionId"],
        "journalPhase": phase,
        "observed": location,
        "activeRuntimeSourceSha": active["sourceSha"],
        "journalMayLagDisk": order[location] > phase_order[phase],
        "previousSnapshotClaimConsistent": True,
        "externalProvenanceVerified": False,
        "quiescenceVerified": False,
        "readyToInstall": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
        "automaticRecovery": False,
        "manualRecoveryRequired": True,
    }
