"""C5-G2-B2B9-H: inert negative-only review of claimed guest H-case evidence.

Caller-supplied records are untrusted. This code never scans processes, changes
units, acquires a lock, executes shell commands or grants Runtime authority.
It is intentionally a review seam, not a guest acceptance producer.
"""
from __future__ import annotations

import re
from typing import Any

UUID = re.compile(r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
SNAPSHOT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")

# Exactly one synthetic negative challenge per receipt. No scenario proves a
# barrier. An observed blocker is not proof that later actors cannot enter.
CASE_FACTS: dict[str, tuple[str, str, str]] = {
    "H-01": ("surviving-oneshot-child", "parentUnitInactive", "descendantHoldsReference"),
    "H-02": ("competing-flock", "lockContended", "hostAdapterNotCalled"),
    "H-03": ("noncooperating-foreign-uid", "flockFree", "foreignUidHolderDetected"),
    "H-04": ("unresolved-pid", "pidIdentityUnstableOrUnreadable", "unknownClassifiedBlocked"),
    "H-05": ("lingering-helper", "timerInactive", "helperOrRcloneStillAlive"),
    "H-06": ("stale-tree-holder", "activePathChanged", "priorTreeInodeStillReferenced"),
    "H-07": ("uncontrolled-entry", "actorDoesNotHonorLock", "admissionStillPossible"),
    "H-08": ("incomplete-observer", "observerRecordIncomplete", "absenceNotInferred"),
}


class WholeHostEvidenceBlocked(ValueError):
    """Reject inconsistent, untrusted, privileged or falsely clearing evidence."""


def _require(condition: bool, why: str) -> None:
    if not condition:
        raise WholeHostEvidenceBlocked(why)


def _object(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    _require(type(value) is dict and set(value) == keys,
             f"{label} missing or unexpected fields")
    return value


def _systemd(value: Any, label: str) -> dict[str, Any]:
    state = _object(value, {"timerUnitFileState", "timerActiveState",
                            "timerNextTrigger", "serviceActiveState"}, label)
    _require(state["timerUnitFileState"] in ("enabled", "enabled-runtime", "disabled")
             and state["timerActiveState"] in ("active", "inactive")
             and type(state["timerNextTrigger"]) is str
             and len(state["timerNextTrigger"]) <= 128
             and state["serviceActiveState"] in ("active", "inactive", "failed"),
             "invalid original/restored systemd state")
    return state


def review_claimed_h_case(evidence: Any) -> dict[str, Any]:
    """Strictly validate *reported* fail-closed H behavior; never attest it."""
    root = _object(evidence, {"schemaVersion", "kind", "caseId", "sourceSha256",
                              "guest", "challenge", "restoration"}, "top")
    _require(type(root["schemaVersion"]) is int and root["schemaVersion"] == 1
             and root["kind"] == "c5-g2b2b9-h-claimed-negative-case-v1",
             "unsupported H evidence version")
    case = root["caseId"]
    _require(type(case) is str and case in CASE_FACTS, "unknown H case")
    digest = root["sourceSha256"]
    _require(type(digest) is str and SHA256.fullmatch(digest) is not None,
             "unreviewed source digest format")

    guest = _object(root["guest"], {"vmUuid", "snapshotName", "syntheticOnlyClaimed",
                                    "noProductionMountsClaimed", "noProductionSecretsClaimed"},
                    "guest")
    _require(type(guest["vmUuid"]) is str and UUID.fullmatch(guest["vmUuid"]) is not None
             and type(guest["snapshotName"]) is str
             and SNAPSHOT.fullmatch(guest["snapshotName"]) is not None
             and guest["syntheticOnlyClaimed"] is True
             and guest["noProductionMountsClaimed"] is True
             and guest["noProductionSecretsClaimed"] is True,
             "guest fixture identity/isolation claim incomplete")

    challenge = _object(root["challenge"], {"actorKind", "facts", "decision",
                                          "runtimeHandoffAttempted", "blockingReasonRecorded"},
                        "challenge")
    actor, first, second = CASE_FACTS[case]
    _require(challenge["actorKind"] == actor, "case actor mismatch")
    facts = _object(challenge["facts"], {first, second}, "case facts")
    _require(facts[first] is True and facts[second] is True,
             "missing claimed negative-case blocker")
    _require(challenge["decision"] == "BLOCKED"
             and challenge["runtimeHandoffAttempted"] is False
             and challenge["blockingReasonRecorded"] is True,
             "unsafe H decision or hidden handoff")

    restore = _object(root["restoration"], {"original", "after", "independentCheckClaimed"},
                      "restoration")
    original = _systemd(restore["original"], "original state")
    after = _systemd(restore["after"], "restored state")
    _require(original == after and restore["independentCheckClaimed"] is True,
             "original systemd state not identically restored")

    return {
        "kind": "c5-g2b2b9-h-inert-negative-case-review-v1",
        "caseId": case,
        "claimedNegativeCaseStructurallyConsistent": True,
        "guestIdentityIndependentlyAuthenticated": False,
        "observedSystemdStateIndependentlyAuthenticated": False,
        "rootLevelWholeHostExclusionVerified": False,
        "mountNamespaceCoverageVerified": False,
        "newConsumerAdmissionPrevented": False,
        "crossProcessQuiescenceVerified": False,
        "eligibleForRootGuestActions": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }
