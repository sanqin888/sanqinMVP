"""C5-G2 B02-B: inert one-shot root-operator admission contract (source only).

No production entry point, no privileged execution, no filesystem mutation.
This component specifies the fail-closed boundary for a later, *separately
reviewed* root-private executable. Caller-supplied reports cannot authorize
production installation, including when they claim every prerequisite passed.
"""
from __future__ import annotations

import re
from typing import Any

SHA = re.compile(r"[0-9a-f]{40}\Z")
SHA256 = re.compile(r"sha256:[0-9a-f]{64}\Z")
ROOT = "/opt/sanq/runtime"
PROJECT = "sanq-app"
VOLUME = "sanq-app_pgdata"
UPLOADS = "/srv/sanq/uploads"

# Claims are only an offline design fixture. A future privileged implementation
# must collect and authenticate evidence itself, not merely accept these booleans.
GATES = (
    "operatorSourceAuthenticated",
    "rootOwnedOperatorPathPinned",
    "oldArchiveExternallyAuthenticated",
    "targetArchiveExternallyAuthenticated",
    "originalArchivesRemoteReadbackVerified",
    "recoveryKitEncryptedCreateOnlyReadbackVerified",
    "recoveryKeyEscrowVerified",
    "liveRuntimeInventoryVerified",
    "applicationCompatibilityVerified",
    "releaseStateSettled",
    "databaseAndUploadsIdentityVerified",
    "backupTimerOriginalStateCaptured",
    "backupAndHelpersStopped",
    "deployMcpAndComposeWritersExcluded",
    "allRuntimeCwdFdAndInodeHoldersExcluded",
    "mountNamespacesCovered",
    "newConsumerAdmissionPrevented",
    "maintenanceWindowAuthenticated",
    "independentOperatorConsentVerified",
)


class OperatorGateBlocked(ValueError):
    """A one-shot Runtime operation is not independently authorized."""


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise OperatorGateBlocked(reason)


def review_proposed_one_shot_gate(claim: Any) -> dict[str, Any]:
    """Review synthetic negative evidence; NEVER return install authority."""
    _require(isinstance(claim, dict) and set(claim) == {
        "kind", "schemaVersion", "operation", "runtimeRoot", "composeProject",
        "databaseVolume", "uploadsBind", "oldRuntimeSha", "targetRuntimeSha",
        "oldArchiveDigest", "targetArchiveDigest", "currentAppSha",
        "previousAppSha", "gateClaims",
    }, "missing/unknown one-shot fields")
    _require(claim["kind"] == "c5-g2-b02b-one-shot-claim-v1"
             and type(claim["schemaVersion"]) is int
             and claim["schemaVersion"] == 1, "invalid contract version")
    _require(claim["operation"] in ("upgrade", "fresh-clean-reinstall"),
             "operation not allowlisted")
    _require(claim["runtimeRoot"] == ROOT
             and claim["composeProject"] == PROJECT
             and claim["databaseVolume"] == VOLUME
             and claim["uploadsBind"] == UPLOADS,
             "storage or fixed path identity drift")
    for field in ("oldRuntimeSha", "targetRuntimeSha", "currentAppSha", "previousAppSha"):
        _require(isinstance(claim[field], str)
                 and SHA.fullmatch(claim[field]) is not None,
                 "invalid pinned SHA: " + field)
    for field in ("oldArchiveDigest", "targetArchiveDigest"):
        _require(isinstance(claim[field], str)
                 and SHA256.fullmatch(claim[field]) is not None,
                 "invalid pinned archive digest")
    _require(claim["operation"] != "upgrade"
             or claim["oldRuntimeSha"] != claim["targetRuntimeSha"],
             "ordinary upgrade cannot reuse current Runtime version")
    gates = claim["gateClaims"]
    _require(isinstance(gates, dict) and set(gates) == set(GATES),
             "missing/extra mandatory gate")
    missing = [field for field in GATES if gates[field] is not True]
    # Do not endorse claims even if all fields are true. Boolean claims and
    # source bytes from a user-writable checkout are not an authority root.
    return {
        "kind": "c5-g2-b02b-inert-gate-review-v1",
        "operation": claim["operation"],
        "unmetClaimedGates": missing,
        "claimStructureValid": True,
        "claimsIndependentlyAuthenticated": False,
        "runtimeMutationAttempted": False,
        "operatorExecutionAttempted": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
