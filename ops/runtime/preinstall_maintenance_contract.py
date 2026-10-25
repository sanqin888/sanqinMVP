"""C5-G2-B1: inert, *negative-only* maintenance evidence review.

This is not a live host observer, operator authority or production installer.
It evaluates a bounded, caller-supplied observation record and can only report
that a claimed observation is internally consistent. Even a clean observation
cannot prove a true process-wide maintenance barrier or authorize installation.
"""
from __future__ import annotations

import re
from typing import Any

RUNTIME_ROOT = "/opt/sanq/runtime"
PROJECT = "sanq-app"
DB_VOLUME = "sanq-app_pgdata"
UPLOADS = "/srv/sanq/uploads"
SHA = re.compile(r"[0-9a-f]{40}\Z")
SERVICES = ("api", "ubereats-worker", "web")

# Every process that might observe old Runtime cwd/fd or mutate the live state
# must be independently excluded by the future privileged live observer.
IDLE_COUNTERS = (
    "backupServiceProcesses",
    "backupHelperProcesses",
    "rcloneProcesses",
    "mcpProductionCalls",
    "deployProcesses",
    "composeMutationProcesses",
    "runtimeCwdFdHolders",
    "unknownRuntimeHolders",
)
REQUIRED_GATES = (
    "independent live root-owned Runtime file/inode and release-state verification",
    "trusted systemd, process and /proc cwd/fd census within approved maintenance window",
    "lock participation OR proven shutdown of every non-cooperative consumer",
    "crypt-encrypted create-only external Recovery Kit with readback of both original Archives",
    "approved target-vs-running-app and installed helper compatibility",
    "independent operator source hash, root-only execution path and explicit consent",
)


class MaintenanceObservationBlocked(ValueError):
    """A structural claim was missing, conflicting, or unsafe."""


def _require(value: bool, reason: str) -> None:
    if not value:
        raise MaintenanceObservationBlocked(reason)


def _sha(value: Any) -> str:
    _require(isinstance(value, str) and SHA.fullmatch(value) is not None,
             "invalid immutable SHA")
    return value


def _object(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    _require(isinstance(value, dict) and set(value) == keys,
             f"{label} evidence has missing or extra keys")
    return value


def review_maintenance_observation(evidence: Any) -> dict[str, Any]:
    """Review normalized observations without executing host commands.

    Evidence is caller-supplied and therefore NOT authenticated. The receipt
    stays permanently non-executable, including when all fields are coherent.
    """
    top = _object(evidence, {"schemaVersion", "kind", "runtime",
                             "application", "containers", "maintenance"}, "top")
    _require(type(top["schemaVersion"]) is int
             and top["schemaVersion"] == 1
             and top["kind"] == "sanq-maintenance-observation-v1",
             "unsupported observation schema")

    runtime = _object(top["runtime"], {
        "root", "sourceSha", "manifestSourceSha", "filesVerified",
        "rootOwnerVerified", "pendingIncident",
    }, "Runtime")
    _require(runtime["root"] == RUNTIME_ROOT
             and runtime["filesVerified"] is True
             and runtime["rootOwnerVerified"] is True
             and runtime["pendingIncident"] is False,
             "Runtime root/17-member inventory or incident is unsafe")
    _require(_sha(runtime["sourceSha"]) == _sha(runtime["manifestSourceSha"]),
             "installed Runtime SHA mismatch")

    app = _object(top["application"], {
        "phase", "current", "previous", "envSha", "stateSha",
    }, "application")
    _require(app["phase"] in ("active", "rolled-back"),
             "application release state not settled")
    current = _sha(app["current"])
    _sha(app["previous"])
    _require(_sha(app["envSha"]) == current
             and _sha(app["stateSha"]) == current,
             "application env/state SHA mismatch")

    containers = _object(top["containers"], {
        "project", "databaseVolume", "uploadsBind", "imageShas",
        "healthy", "databaseIdentityVerified", "uploadsIdentityVerified",
    }, "containers")
    _require(containers["project"] == PROJECT
             and containers["databaseVolume"] == DB_VOLUME
             and containers["uploadsBind"] == UPLOADS
             and containers["databaseIdentityVerified"] is True
             and containers["uploadsIdentityVerified"] is True
             and containers["healthy"] is True,
             "container/storage identity or health mismatch")
    image_shas = _object(containers["imageShas"], set(SERVICES), "images")
    for name in SERVICES:
        _require(_sha(image_shas[name]) == current,
                 "running application image does not match state")

    maintenance = _object(top["maintenance"], {
        "operatorLockClaimed", "backupTimerPaused", "backupServiceInactive",
        "mcpProductionPaused", "deployWritesBlocked", "composeWritesBlocked",
        "processCounts", "restoreOriginalTimerStateRecorded",
    }, "maintenance")
    for name in (
        "operatorLockClaimed", "backupTimerPaused", "backupServiceInactive",
        "mcpProductionPaused", "deployWritesBlocked", "composeWritesBlocked",
        "restoreOriginalTimerStateRecorded",
    ):
        _require(maintenance[name] is True,
                 "incomplete claimed maintenance exclusion: " + name)
    counts = _object(maintenance["processCounts"], set(IDLE_COUNTERS),
                     "process census")
    for name in IDLE_COUNTERS:
        _require(type(counts[name]) is int and counts[name] == 0,
                 "process still active or census invalid: " + name)

    return {
        "kind": "c5-g2b1-inert-maintenance-observation-review-v1",
        "observationStructurallyConsistent": True,
        "evidenceSourceAuthenticated": False,
        "crossProcessQuiescenceVerified": False,
        "externalKitVerified": False,
        "productionReady": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "requiredIndependentGates": list(REQUIRED_GATES),
    }
