#!/usr/bin/env python3
"""C5-B3A: pure, non-executable versioned Runtime persistence contract.

No filesystem writes, locks, Docker, deployment, privilege or recovery actions.
A validated journal is evidence of recorded intent, never deployment authority.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from plan_versioned_install import ACTIVE_ROOT, PROPOSED_RELEASES_ROOT
from release_contract import require_sha, checked_digest
from runtime_trust import DIGEST

JOURNAL_KIND = "sanq-versioned-runtime-transaction"
SCHEMA_VERSION = 1
STATES = frozenset(("active", "pending", "failed", "rolled-back"))
ACTIONS = frozenset(("deploy", "rollback"))
TX_ID = re.compile(r"[0-9a-f]{32}\Z")
IMAGE_NAMES = frozenset(("sanq-api", "sanq-web"))
ROOT_OWNER = "root"
ROOT_MODE = "0755"
RELEASE_MODE = "0555"
JOURNAL_MODE = "0600"


class PersistenceBlocked(ValueError):
    """Corrupt, ambiguous, unsupported or unreconciled persistence state."""


def _sha(value: Any) -> str:
    try:
        return require_sha(value)
    except (TypeError, ValueError) as exc:
        raise PersistenceBlocked("invalid source SHA") from exc


def _timestamp(value: Any) -> str:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise PersistenceBlocked("timestamp must be canonical UTC")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise PersistenceBlocked("invalid timestamp") from exc
    if dt.tzinfo != timezone.utc or dt.isoformat(timespec="seconds").replace("+00:00", "Z") != value:
        raise PersistenceBlocked("timestamp must use UTC seconds")
    return value


def _version(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"sourceSha", "runtimeArchiveSha256", "images"}:
        raise PersistenceBlocked("version record fields invalid")
    sha = _sha(value["sourceSha"])
    digest = value["runtimeArchiveSha256"]
    if not isinstance(digest, str) or DIGEST.fullmatch(digest) is None:
        raise PersistenceBlocked("invalid Runtime archive digest")
    images = value["images"]
    if not isinstance(images, dict) or set(images) != IMAGE_NAMES:
        raise PersistenceBlocked("incomplete image pair")
    clean_images = {}
    for name in sorted(IMAGE_NAMES):
        entry = images[name]
        if not isinstance(entry, dict) or set(entry) != {"ref", "digest"}:
            raise PersistenceBlocked("image record fields invalid")
        if entry["ref"] != f"ghcr.io/sanqin888/{name}:{sha}":
            raise PersistenceBlocked("image source reference mismatch")
        try:
            image_digest = checked_digest(entry["digest"])
        except (ValueError, TypeError) as exc:
            raise PersistenceBlocked("invalid image digest") from exc
        clean_images[name] = {"ref": entry["ref"], "digest": image_digest}
    return {"sourceSha": sha, "runtimeArchiveSha256": digest, "images": clean_images}


def validate_journal(value: Any) -> dict[str, Any]:
    """Strict v1 decoding. Unknown versions/fields fail closed, never auto-upgrade."""
    fields = {
        "schemaVersion", "kind", "phase", "action", "transactionId",
        "currentSha", "previousSha", "targetSha", "currentVersion",
        "previousVersion", "targetVersion", "createdAt", "updatedAt",
        "manualRecoveryRequired", "authorizedToMutateProduction",
    }
    if not isinstance(value, dict) or set(value) != fields:
        raise PersistenceBlocked("journal fields missing or unexpected")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != SCHEMA_VERSION or value["kind"] != JOURNAL_KIND:
        raise PersistenceBlocked("unsupported journal schema")
    phase, action = value["phase"], value["action"]
    if phase not in STATES or action not in ACTIONS:
        raise PersistenceBlocked("unknown transaction state/action")
    tx = value["transactionId"]
    if not isinstance(tx, str) or TX_ID.fullmatch(tx) is None:
        raise PersistenceBlocked("invalid transaction identifier")
    current, previous, target = (_sha(value[k]) for k in ("currentSha", "previousSha", "targetSha"))
    versions = {name: _version(value[name]) for name in ("currentVersion", "previousVersion", "targetVersion")}
    for name, sha in (("currentVersion", current), ("previousVersion", previous), ("targetVersion", target)):
        if versions[name]["sourceSha"] != sha:
            raise PersistenceBlocked("version SHA binding mismatch")
    if current == target:
        raise PersistenceBlocked("current and target cannot match")
    if action == "rollback" and target != previous:
        raise PersistenceBlocked("rollback must target recorded verified previous")
    created, updated = _timestamp(value["createdAt"]), _timestamp(value["updatedAt"])
    if updated < created:
        raise PersistenceBlocked("audit time reversed")
    if value["authorizedToMutateProduction"] is not False:
        raise PersistenceBlocked("journal cannot grant mutation authority")
    if type(value["manualRecoveryRequired"]) is not bool:
        raise PersistenceBlocked("invalid recovery marker")
    if value["manualRecoveryRequired"] is not (phase in ("pending", "failed")):
        raise PersistenceBlocked("inconsistent recovery marker")
    return {**value, **versions}


def transition_journal(journal: dict[str, Any], next_phase: str, *, at: str, manually_reconciled: bool = False) -> dict[str, Any]:
    """Model only. Explicit manual reconciliation evidence is required to close uncertainty."""
    old = validate_journal(journal)
    _timestamp(at)
    if at <= old["updatedAt"]:
        raise PersistenceBlocked("audit time must advance")
    edges = {
        "pending": frozenset(("failed", "active", "rolled-back")),
        "failed": frozenset(("rolled-back",)),
        "active": frozenset(),
        "rolled-back": frozenset(),
    }
    if next_phase not in edges[old["phase"]]:
        raise PersistenceBlocked("illegal or duplicate transaction transition")
    if next_phase in ("active", "rolled-back") and manually_reconciled is not True:
        raise PersistenceBlocked("manual reconciliation evidence required")
    # This is a phase record, not a claim that files/containers were changed.
    result = {**old, "phase": next_phase, "updatedAt": at,
              "manualRecoveryRequired": next_phase in ("pending", "failed")}
    return validate_journal(result)


def normal_deployment_allowed(value: Any) -> bool:
    """Unknown/damaged state raises instead of defaulting to a safe-looking Active."""
    return validate_journal(value)["phase"] in ("active", "rolled-back")


def version_path(source_sha: str) -> str:
    """Fixed, lexical path only; B3-B must separately enforce realpath/no-symlink."""
    return PROPOSED_RELEASES_ROOT + "/" + _sha(source_sha)


def layout_contract() -> dict[str, Any]:
    return {
        "schemaVersion": 1, "activeRoot": ACTIVE_ROOT,
        "releasesRoot": PROPOSED_RELEASES_ROOT,
        "activeRootMustBeRealDirectory": True,
        "releaseDirectoriesMustBeRealDirectories": True,
        "owner": ROOT_OWNER, "directoryMode": ROOT_MODE,
        "verifiedReleaseMode": RELEASE_MODE, "journalMode": JOURNAL_MODE,
        "authorizedToMutateProduction": False,
    }
