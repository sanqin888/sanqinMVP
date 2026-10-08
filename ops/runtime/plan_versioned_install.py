#!/usr/bin/env python3
"""C5-B2B2: pure, non-executable versioned Runtime installation plan.

This module never writes files, runs Docker/Git, grants privileges, or changes
the current controller. It consumes a C5-B2B1 transition intent and makes
the future transaction / recovery contract inspectable.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops/release"))

from release_contract import require_sha
from runtime_trust import DIGEST

EXPECTED_PROJECT = "sanq-app"
EXPECTED_VOLUME = "sanq-app_pgdata"
ACTIVE_ROOT = "/opt/sanq/runtime"
PROPOSED_RELEASES_ROOT = "/opt/sanq/releases"
UPLOADS_ROOT = "/srv/sanq/uploads"
BACKUPS_ROOT = "/srv/sanq/backups"
PHASES = frozenset(("active", "pending", "failed", "rolled-back"))
ACTIONS = frozenset(("deploy", "rollback"))


class InstallPlanBlocked(ValueError):
    """Unproven or ambiguous installation transaction state."""


def _version(value: Any, sha: str, digest: str) -> dict[str, str]:
    if not isinstance(value, dict) or value.get("sourceSha") != sha:
        raise InstallPlanBlocked("version provenance is absent or wrong")
    if value.get("runtimeArchiveDigest") != digest or (
        not isinstance(digest, str) or DIGEST.fullmatch(digest) is None
    ):
        raise InstallPlanBlocked("version archive digest mismatch")
    return {"sourceSha": sha, "runtimeArchiveDigest": digest}


def plan_install(
    transition: dict[str, Any], journal: dict[str, Any]
) -> dict[str, Any]:
    """Return a static transaction proposal, with no executable authority.

    The caller must independently obtain *fresh*, externally verified proofs
    before constructing a transition. Passing JSON alone is not trust.
    """
    if not isinstance(transition, dict) or transition.get("schemaVersion") != 1:
        raise InstallPlanBlocked("missing version transition contract")
    if transition.get("action") not in ACTIONS:
        raise InstallPlanBlocked("unsupported transaction action")
    if transition.get("authorizedToMutateProduction") is not False or any(
        transition.get(flag) is not False
        for flag in ("readyToInstall", "readyToDeploy", "readyToRollback")
    ):
        raise InstallPlanBlocked("transition unexpectedly carries execution authority")
    if (transition.get("preservedComposeProject") != EXPECTED_PROJECT
        or transition.get("preservedDatabaseVolume") != EXPECTED_VOLUME
        or transition.get("requiresExactVersionedRuntimePair") is not True
        or transition.get("requiresBackupAndRestoreGate") is not True
        or transition.get("requiresNoWriteCutoverAndReversibleRuntimeInstall") is not True):
        raise InstallPlanBlocked("immutable runtime or recovery contract drift")

    before = require_sha(transition.get("from", ""))
    after = require_sha(transition.get("to", ""))
    if before == after:
        raise InstallPlanBlocked("same-version transaction refused")
    if not isinstance(journal, dict) or journal.get("schemaVersion") != 1:
        raise InstallPlanBlocked("missing transaction journal")
    phase = journal.get("phase")
    if phase not in PHASES or phase in ("pending", "failed"):
        raise InstallPlanBlocked("pending/failed transaction requires manual recovery")
    if journal.get("current") != before:
        raise InstallPlanBlocked("journal current version differs from transition")
    require_sha(journal.get("previous", ""))
    if transition["action"] == "rollback" and journal["previous"] != after:
        raise InstallPlanBlocked("rollback may only target recorded previous version")

    current = _version(
        journal.get("currentRuntime"),
        before, transition.get("fromArchiveSha256"),
    )
    target = _version(
        journal.get("availableRuntime"),
        after, transition.get("toArchiveSha256"),
    )
    # No state is written here; these are proposed durable records for later
    # separately approved, transactional implementation.
    pending = {
        "schemaVersion": 1,
        "phase": "pending",
        "action": transition["action"],
        "current": before,
        "previous": journal["previous"],
        "target": after,
        "currentRuntime": current,
        "targetRuntime": target,
        "preservedComposeProject": EXPECTED_PROJECT,
        "preservedDatabaseVolume": EXPECTED_VOLUME,
        "manualRecoveryRequired": True,
    }
    return {
        "schemaVersion": 1,
        "planKind": "inert-versioned-runtime-install-v1",
        "transaction": pending,
        "proposedActiveRoot": ACTIVE_ROOT,
        "proposedVersionRoot": f"{PROPOSED_RELEASES_ROOT}/{after}",
        "proposedPreviousVersionRoot": f"{PROPOSED_RELEASES_ROOT}/{before}",
        "uploadsRoot": UPLOADS_ROOT,
        "backupsRoot": BACKUPS_ROOT,
        "requiredGates": [
            "Independent exact-SHA archive and API/Web digest verification for both versions",
            "Durable immutable archive retention and tested off-VM restore",
            "Exclusive operator lock, root-owned installed files and preserved ubuntu .env ownership",
            "Paused writers, fixed project and existing DB named volume identity",
            "Journal pending evidence fsync before any active file or image change",
            "Recovery snapshot of matching active Runtime files, state and Compose config",
            "Manual health verification before transaction completion; no automatic rollback",
        ],
        "readyToInstall": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
    }


def describe_plan(value: dict[str, Any]) -> str:
    return json.dumps(value, indent=2, sort_keys=True)
