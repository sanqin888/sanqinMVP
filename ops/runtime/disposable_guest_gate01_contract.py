"""C5-G2-B2B7: inert review of caller-supplied disposable guest Gate 0/1 claims.

No host access, file access, process access, privilege, shell, or CLI. Even
internally coherent claims do not authenticate a VM, prove isolation, or
authorize privileged experiments or Runtime installation.
"""
from __future__ import annotations

import re
from typing import Any

UUID = re.compile(r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\Z")
SNAPSHOT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")


class GuestGateBlocked(ValueError):
    """Missing, contradictory or unsafe caller-supplied guest inventory."""


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise GuestGateBlocked(reason)


def _object(item: Any, keys: set[str], label: str) -> dict[str, Any]:
    _require(type(item) is dict and set(item) == keys,
             label + " missing or unexpected fields")
    return item


def review_claimed_guest_gate01(evidence: Any) -> dict[str, Any]:
    """Validate claimed guest-only prerequisites, never confer gate PASS.

    All input comes from the caller; no operator identity, guest UUID,
    filesystem, snapshot or mount claim can be independently attested here.
    """
    root = _object(evidence, {"schemaVersion", "kind", "guest", "identity",
                              "filesystem", "isolation", "systemd"}, "top")
    _require(type(root["schemaVersion"]) is int and root["schemaVersion"] == 1
             and root["kind"] == "c5-g2b2b7-claimed-guest-inventory-v1",
             "unsupported guest inventory schema")

    guest = _object(root["guest"], {"hypervisor", "uuid", "snapshotName",
                                    "snapshotExistsClaimed"}, "guest")
    _require(guest["hypervisor"] == "virtualbox", "unreviewed guest hypervisor")
    _require(type(guest["uuid"]) is str and UUID.fullmatch(guest["uuid"]) is not None,
             "invalid guest identity")
    _require(type(guest["snapshotName"]) is str
             and SNAPSHOT.fullmatch(guest["snapshotName"]) is not None
             and guest["snapshotExistsClaimed"] is True,
             "unreviewed snapshot claim")

    identity = _object(root["identity"], {"operatorUid", "operatorGid",
                                         "operatorUser", "rootUid", "ubuntuUid"},
                       "identity")
    _require(type(identity["operatorUid"]) is int
             and 0 < identity["operatorUid"] < 2**31
             and type(identity["operatorGid"]) is int
             and 0 < identity["operatorGid"] < 2**31
             and identity["operatorUser"] == "ubuntu"
             and type(identity["rootUid"]) is int
             and identity["rootUid"] == 0
             and type(identity["ubuntuUid"]) is int
             and identity["ubuntuUid"] == identity["operatorUid"],
             "incorrect unprivileged guest identity")

    filesystem = _object(root["filesystem"], {"rootType", "tmpType",
                                              "tmpOnSameDeviceClaimed"}, "filesystem")
    _require(filesystem["rootType"] == "ext4"
             and filesystem["tmpType"] == "ext4"
             and filesystem["tmpOnSameDeviceClaimed"] is True,
             "guest ext4 precondition not met")

    isolation = _object(root["isolation"], {
        "guestDedicatedClaimed", "snapshotRollbackClaimed",
        "networkPrivateClaimed", "productionMountsAbsentClaimed",
        "productionCredentialsAbsentClaimed", "runtimePathAbsentClaimed",
    }, "isolation")
    for field, value in isolation.items():
        _require(value is True, "incomplete guest isolation claim: " + field)

    systemd = _object(root["systemd"], {"state", "labUnits", "labUnitFiles"}, "systemd")
    _require(systemd["state"] == "running", "guest systemd not healthy")
    for field in ("labUnits", "labUnitFiles"):
        _require(type(systemd[field]) is list and not systemd[field],
                 "existing synthetic unit collision: " + field)

    return {
        "kind": "c5-g2b2b7-inert-guest-gate01-claim-review-v1",
        "claimedEvidenceStructurallyConsistent": True,
        "guestIdentityIndependentlyAuthenticated": False,
        "snapshotIndependentlyVerified": False,
        "fileSystemIndependentlyVerified": False,
        "productionIsolationIndependentlyVerified": False,
        "eligibleForRootGuestActions": False,
        "realHostQuiescenceVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "requiredIndependentEvidence": [
            "current operator-controlled VirtualBox VM identity and snapshot readback",
            "current guest unprivileged /etc/os-release, id, mount and systemd outputs",
            "explicit no-production-mount, credential and network topology review",
            "separate approval of exact pinned source digest and privileged commands",
        ],
    }
