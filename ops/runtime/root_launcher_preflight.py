"""C5-B3B2B: inert, strict candidate root Launcher preflight contract.

No production IO, filesystem reads/writes, subprocess, Docker, sudo or CLI.
A passed shape check does NOT authenticate self-reported evidence.
"""
from __future__ import annotations

from typing import Any

from plan_versioned_install import ACTIVE_ROOT, EXPECTED_PROJECT, EXPECTED_VOLUME, PROPOSED_RELEASES_ROOT, UPLOADS_ROOT, BACKUPS_ROOT
from versioned_persistence_contract import PersistenceBlocked, validate_journal

STATE_ROOT = "/var/lib/sanq/runtime"
LAUNCHER_ROOT = "/usr/local/libexec/sanq-runtime"
EXPECTED_PATHS = {
    "activeRuntime": ACTIVE_ROOT, "releases": PROPOSED_RELEASES_ROOT,
    "state": STATE_ROOT, "launcher": LAUNCHER_ROOT,
    "uploads": UPLOADS_ROOT, "backups": BACKUPS_ROOT,
}
ROOT_DIRECTORIES = ("activeRuntime", "releases", "state", "launcher")
DATA_DIRECTORIES = ("uploads", "backups")
ALLOWED_PHASES = ("active", "rolled-back")


class LauncherPreflightBlocked(PersistenceBlocked):
    """Any unknown, unverified, ambiguous or stale proposed launcher state."""


def _exact(value: Any, fields: set[str], what: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise LauncherPreflightBlocked(f"{what} fields invalid")
    return value


def preview_preflight(observations: Any, journal: Any) -> dict[str, Any]:
    """Validate untrusted *proposed* evidence; never claim actual host trust.

    Refuses pending/failed and all incomplete fixtures, and always returns
    execution-authority booleans False. Independent root-owned observation and
    provenance acquisition remain a separately reviewed production gate.
    """
    obs = _exact(observations, {
        "schemaVersion", "kind", "paths", "composeProject", "databaseVolume",
        "backupRestoreVerified", "noWriteWindowVerified", "archivePairVerified",
        "imageDigestPairVerified", "physicalStateReconciled",
        "stableLauncherInstalled", "operatorAuthorized", "productionCutoverAuthorized",
    }, "observation")
    if type(obs["schemaVersion"]) is not int or obs["schemaVersion"] != 1 or obs["kind"] != "inert-root-launcher-preflight-v1":
        raise LauncherPreflightBlocked("unsupported preflight schema")
    if obs["composeProject"] != EXPECTED_PROJECT or obs["databaseVolume"] != EXPECTED_VOLUME:
        raise LauncherPreflightBlocked("Compose project/physical volume contract mismatch")
    paths = _exact(obs["paths"], set(EXPECTED_PATHS), "fixed path")
    if paths != EXPECTED_PATHS:
        raise LauncherPreflightBlocked("mutable or unexpected runtime paths")
    for flag in ("backupRestoreVerified", "noWriteWindowVerified", "archivePairVerified",
                 "imageDigestPairVerified", "physicalStateReconciled"):
        if obs[flag] is not True:
            raise LauncherPreflightBlocked(f"missing proposed {flag} evidence")
    for flag in ("stableLauncherInstalled", "operatorAuthorized", "productionCutoverAuthorized"):
        if obs[flag] is not False:
            raise LauncherPreflightBlocked("candidate preflight cannot grant production authority")
    try:
        state = validate_journal(journal)
    except PersistenceBlocked as exc:
        raise LauncherPreflightBlocked("invalid transaction journal") from exc
    if state["phase"] not in ALLOWED_PHASES:
        raise LauncherPreflightBlocked("unresolved journal requires manual recovery")
    return {
        "schemaVersion": 1,
        "kind": "inert-root-launcher-preflight-preview-v1",
        "journalTransactionId": state["transactionId"],
        "transactionEntrySha": state["currentSha"],
        "modeledPhase": state["phase"],
        "requiresIndependentHostVerification": True,
        "requiresManualApproval": True,
        "requiresHistoricalArchiveBytes": True,
        "requiresCrossTransactionLedger": True,
        "requiresPrivilegedOwnerReview": True,
        "readyToInstall": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
    }
