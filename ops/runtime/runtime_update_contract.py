"""C5-U1: inert contract for updating an already active SanQ Runtime.

This module accepts caller-provided evidence only; it NEVER authenticates that
evidence, installs files, invokes a command, or grants production authority.
U2 must independently verify every supplied proof before considering an install.
"""
from __future__ import annotations

import re
from typing import Any

SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
PROJECT = "sanq-app"
VOLUME = "sanq-app_pgdata"
RUNTIME = "/opt/sanq/runtime"
PRESERVED = (".env", ".sanq-release-state.json", ".sanq-backup-layout-activated")
MEMBERS = (
    "docker-compose.yml",
    "ops/backup/backup-db.sh",
    "ops/backup/sanq-backup-protected-nginx",
    "ops/backup/sanq-backup.service",
    "ops/backup/sanq-backup.sudoers",
    "ops/release/deploy_release.py",
    "ops/release/release_contract.py",
    "ops/runtime/build_bundle.py",
    "ops/runtime/audit_compose_cutover.py",
    "ops/runtime/audit_release_provenance.py",
    "ops/runtime/inspect_layout.py",
    "ops/runtime/stage_bundle.py",
    "ops/runtime/runtime_trust.py",
    "ops/runtime/versioned_release_contract.py",
    "ops/runtime/plan_versioned_install.py",
    "ops/runtime/runtime-layout.v1.json",
    "ops/verify-runtime-readiness.sh",
)
FAILURE_MATRIX = {
    "untrusted_archive": "stop before staging or active writes",
    "invalid_installed_inventory": "stop; preserve active Runtime for manual investigation",
    "concurrent_operator": "stop; do not acquire a second upgrade transaction",
    "prepare_interrupted": "keep active untouched; quarantine incomplete private preparation",
    "handoff_interrupted": "manual exclusive-lock recovery from matched complete snapshot",
    "post_handoff_invalid": "do not execute new controller; manually restore matched prior tree",
    "readiness_failure": "preserve release incident; no automatic image/schema rollback",
}


class RuntimeUpdateBlocked(ValueError):
    """An inert Runtime update proposal has failed its frozen safety contract."""


def _sha(value: Any) -> str:
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise RuntimeUpdateBlocked("invalid release SHA")
    return value


def _digest(value: Any) -> str:
    if not isinstance(value, str) or not DIGEST.fullmatch(value):
        raise RuntimeUpdateBlocked("invalid Runtime archive digest")
    return value


def _inventory(manifest: Any, sha: str) -> dict[str, dict[str, Any]]:
    if (
        not isinstance(manifest, dict)
        or manifest.get("schemaVersion") != 1
        or manifest.get("sourceBranch") != "main"
        or manifest.get("sourceSha") != sha
        or manifest.get("productionActivationAuthorized") is not False
    ):
        raise RuntimeUpdateBlocked("Runtime manifest identity invalid")
    files = manifest.get("files")
    if not isinstance(files, dict) or set(files) != set(MEMBERS):
        raise RuntimeUpdateBlocked("Runtime manifest members differ from frozen 17-file allowlist")
    for path in MEMBERS:
        value = files[path]
        if (
            not isinstance(value, dict)
            or not isinstance(value.get("sha256"), str)
            or re.fullmatch(r"[0-9a-f]{64}", value["sha256"]) is None
            or type(value.get("bytes")) is not int
            or not 0 <= value["bytes"] <= 2 * 1024 * 1024
        ):
            raise RuntimeUpdateBlocked("Runtime member proof malformed")
    return files


def propose_update(
    current: dict[str, Any], target: dict[str, Any], operational: dict[str, Any],
) -> dict[str, Any]:
    """Return a closed, NON-EXECUTABLE U2 design input.

    Runtime manifests/digests are syntactically checked, not externally authenticated.
    Installed file ownership, actual byte integrity, archive provenance, image
    digests, backups and mounts remain separate mandatory operator gates.
    """
    if not isinstance(current, dict) or not isinstance(target, dict) or not isinstance(operational, dict):
        raise RuntimeUpdateBlocked("missing input evidence")
    old = _sha(current.get("sourceSha"))
    new = _sha(target.get("sourceSha"))
    if old == new:
        raise RuntimeUpdateBlocked("same Runtime version")
    old_digest = _digest(current.get("archiveDigest"))
    new_digest = _digest(target.get("archiveDigest"))
    before = _inventory(current.get("manifest"), old)
    after = _inventory(target.get("manifest"), new)
    if not any(before[path] != after[path] for path in MEMBERS):
        raise RuntimeUpdateBlocked("no Runtime member changed; use ordinary image-only rollout")
    if (
        operational.get("runtimeRoot") != RUNTIME
        or operational.get("composeProject") != PROJECT
        or operational.get("databaseVolume") != VOLUME
        or operational.get("releasePhase") != "active"
        or operational.get("pendingIncident") is not False
        or operational.get("exclusiveLockAvailable") is not True
        or operational.get("authorizedToMutateProduction") is not False
    ):
        raise RuntimeUpdateBlocked("unsafe active Runtime or execution authority")
    return {
        "schemaVersion": 1,
        "kind": "inert-c5-runtime-update-contract-v1",
        "from": {"sourceSha": old, "archiveDigest": old_digest},
        "to": {"sourceSha": new, "archiveDigest": new_digest},
        "changedMembers": [path for path in MEMBERS if before[path] != after[path]],
        "fixedRuntimeRoot": RUNTIME,
        "preservedComposeProject": PROJECT,
        "preservedDatabaseVolume": VOLUME,
        "preserveOutsideArchive": list(PRESERVED),
        "requiredGates": [
            "independent GitHub main publication and exact archive-byte proof for both versions",
            "verify 17 installed root-owned member bytes, modes, manifest and fixed ancestor paths",
            "verify clean ACTIVE release-state, SHA alignment, no PENDING and backup/restore evidence",
            "exclusive operator lock with cross-process quiescence and no active controller invocation",
            "create and verify complete matched previous Runtime snapshot and recovery path",
            "prepare verified new full 17-file Runtime and matching manifest in private root area",
            "preserve .env, release-state and C4 marker with original owner, modes and byte identity",
            "perform reviewed handoff with explicit downtime/atomicity boundary and recovery journal",
            "reverify installed 17-file integrity before any new controller execution",
            "verify Compose/DB/uploads/backups identities and post-handoff health",
        ],
        "failureRecovery": dict(FAILURE_MATRIX),
        "readyToInstall": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
    }
