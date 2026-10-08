#!/usr/bin/env python3
"""C5-B2B1: exact-SHA historical Runtime proof and inert transition contracts.

Read-only GitHub metadata and caller-supplied archive bytes. No Docker,
filesystem writes, sudo, downloads, install, deployment or rollback.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops/release"))

from release_contract import (
    REPOSITORY, RELEASE_CONTEXT, SEALED_DIGEST_PATTERN, github_json,
    require_sha, checked_digest,
)
from runtime_trust import (
    DIGEST, RUNTIME_CONTEXT, RuntimeTrustBlocked,
    _bundle_bytes, _checked_manifest, _sha256,
)

IMAGES = ("sanq-api", "sanq-web")
ALLOWED_ACTIONS = frozenset(("deploy", "rollback"))
ALLOWED_PHASES = frozenset(("active", "rolled-back", "pending"))


class HistoricalReleaseBlocked(ValueError):
    """Exact historical release or version transition lacks trusted evidence."""


def _status(statuses: Any, context: str, run_url: str) -> dict[str, Any]:
    if not isinstance(statuses, list) or len(statuses) > 100:
        raise HistoricalReleaseBlocked("GitHub release statuses missing or invalid")
    # GitHub returns newest first; a newer failure blocks older success.
    entry = next(
        (s for s in statuses if isinstance(s, dict) and s.get("context") == context),
        None,
    )
    if (
        not isinstance(entry, dict)
        or entry.get("state") != "success"
        or entry.get("target_url") != run_url
        or not isinstance(entry.get("creator"), dict)
        or entry["creator"].get("login") != "github-actions[bot]"
    ):
        raise HistoricalReleaseBlocked("latest trusted release status missing")
    return entry


def _main_ancestor(source_sha: str, fetch: Callable[[str], Any]) -> None:
    comparison = fetch(f"/repos/{REPOSITORY}/compare/{source_sha}...main")
    if (
        not isinstance(comparison, dict)
        or comparison.get("status") not in ("ahead", "identical")
        or comparison.get("behind_by") != 0
        or not isinstance(comparison.get("merge_base_commit"), dict)
        or comparison["merge_base_commit"].get("sha") != source_sha
    ):
        raise HistoricalReleaseBlocked("source SHA is not an ancestor of main")


def verify_historical_release(
    payload: bytes,
    source_sha: str,
    *,
    fetch: Callable[[str], Any] = github_json,
) -> dict[str, Any]:
    """Verify exact historical SHA without newest-only release discovery.

    This deliberately does not authorize installing the returned version.
    The original file bytes must still exist; an external SHA256 alone
    cannot reconstruct expired Actions artifacts.
    """
    source_sha = require_sha(source_sha)
    manifest = _checked_manifest(payload, source_sha)
    if (
        manifest.get("sourceBranch") != "main"
        or manifest.get("productionActivationAuthorized") is not False
        or type(manifest.get("publishRunId")) is not int
        or manifest["publishRunId"] <= 0
    ):
        raise HistoricalReleaseBlocked("untrusted historical Runtime manifest")
    _main_ancestor(source_sha, fetch)

    statuses = fetch(f"/repos/{REPOSITORY}/commits/{source_sha}/statuses?per_page=100")
    run_url = f"https://github.com/{REPOSITORY}/actions/runs/{manifest['publishRunId']}"
    paired = _status(statuses, RELEASE_CONTEXT, run_url)
    runtime = _status(statuses, RUNTIME_CONTEXT, run_url)

    if (
        not isinstance(paired.get("description"), str)
        or SEALED_DIGEST_PATTERN.fullmatch(paired["description"]) is None
        or not isinstance(runtime.get("description"), str)
        or DIGEST.fullmatch(runtime["description"]) is None
        or runtime["description"] != _sha256(payload)
    ):
        raise HistoricalReleaseBlocked("historical Runtime or paired-image digest mismatch")
    matched = SEALED_DIGEST_PATTERN.fullmatch(paired["description"])
    if matched is None:
        raise HistoricalReleaseBlocked("historical paired image seal is malformed")

    images = manifest.get("applicationImages")
    if not isinstance(images, dict) or set(images) != set(IMAGES):
        raise HistoricalReleaseBlocked("historical Runtime image pair incomplete")
    paired_digests = {
        "sanq-api": "sha256:" + matched.group(1),
        "sanq-web": "sha256:" + matched.group(2),
    }
    for name in IMAGES:
        image = images[name]
        if (
            not isinstance(image, dict)
            or image.get("ref") != f"ghcr.io/sanqin888/{name}:{source_sha}"
            or checked_digest(image.get("digest")) != paired_digests[name]
        ):
            raise HistoricalReleaseBlocked("historical Runtime and image seals differ")

    run_id = manifest["publishRunId"]
    workflow = fetch(f"/repos/{REPOSITORY}/actions/runs/{run_id}")
    if (
        not isinstance(workflow, dict)
        or workflow.get("id") != run_id
        or workflow.get("name") != "publish-images"
        or workflow.get("event") != "workflow_run"
        or workflow.get("status") != "completed"
        or workflow.get("conclusion") != "success"
        or not isinstance(workflow.get("repository"), dict)
        or workflow["repository"].get("full_name") != REPOSITORY
    ):
        raise HistoricalReleaseBlocked("historical publishing workflow identity mismatch")

    return {
        "schemaVersion": 1,
        "sourceSha": source_sha,
        "sourceBranch": "main",
        "publishRunId": run_id,
        "publicationUrl": run_url,
        "runtimeArchiveDigest": runtime["description"],
        "images": {
            name: {
                "ref": images[name]["ref"],
                "digest": paired_digests[name],
            } for name in IMAGES
        },
        "verified": True,
        "historical": True,
        "productionActivationAuthorized": False,
    }


def _attested(value: Any) -> dict[str, Any]:
    if (
        not isinstance(value, dict)
        or value.get("schemaVersion") != 1
        or value.get("verified") is not True
        or value.get("productionActivationAuthorized") is not False
        or value.get("sourceBranch") != "main"
    ):
        raise HistoricalReleaseBlocked("transition requires independently verified Runtime")
    sha = require_sha(value.get("sourceSha", ""))
    if (
        type(value.get("publishRunId")) is not int
        or value["publishRunId"] <= 0
        or not isinstance(value.get("runtimeArchiveDigest"), str)
        or DIGEST.fullmatch(value["runtimeArchiveDigest"]) is None
        or value.get("publicationUrl")
        != f"https://github.com/{REPOSITORY}/actions/runs/{value['publishRunId']}"
    ):
        raise HistoricalReleaseBlocked("transition Runtime provenance incomplete")
    images = value.get("images")
    if not isinstance(images, dict) or set(images) != set(IMAGES):
        raise HistoricalReleaseBlocked("transition image pair incomplete")
    for name in IMAGES:
        img = images[name]
        if (
            not isinstance(img, dict)
            or img.get("ref") != f"ghcr.io/sanqin888/{name}:{sha}"
        ):
            raise HistoricalReleaseBlocked("transition image ref mismatch")
        checked_digest(img.get("digest"))
    return value


def version_transition_contract(
    action: str,
    current: dict[str, Any],
    target: dict[str, Any],
    release_state: dict[str, Any],
    *,
    fetch: Callable[[str], Any] = github_json,
) -> dict[str, Any]:
    """Read-only transition intent; no mutation, even when all gates pass."""
    if action not in ALLOWED_ACTIONS:
        raise HistoricalReleaseBlocked("unsupported version transition action")
    current = _attested(current)
    target = _attested(target)
    before = current["sourceSha"]
    after = target["sourceSha"]
    if before == after:
        raise HistoricalReleaseBlocked("source and target versions are identical")
    if (
        not isinstance(release_state, dict)
        or release_state.get("current") != before
        or release_state.get("phase") not in ALLOWED_PHASES
    ):
        raise HistoricalReleaseBlocked("release state does not match authenticated current Runtime")
    previous = require_sha(release_state.get("previous", ""))
    if action == "rollback":
        if previous != after:
            raise HistoricalReleaseBlocked("rollback target is not the recorded previous Runtime")
    else:
        if release_state["phase"] == "pending":
            raise HistoricalReleaseBlocked("unresolved pending release blocks deploy")
        comparison = fetch(f"/repos/{REPOSITORY}/compare/{before}...{after}")
        if (
            not isinstance(comparison, dict)
            or comparison.get("status") != "ahead"
            or comparison.get("behind_by") != 0
            or not isinstance(comparison.get("merge_base_commit"), dict)
            or comparison["merge_base_commit"].get("sha") != before
        ):
            raise HistoricalReleaseBlocked("deploy target must be a strict main descendant")
    return {
        "schemaVersion": 1,
        "action": action,
        "from": before,
        "to": after,
        "fromArchiveSha256": current["runtimeArchiveDigest"],
        "toArchiveSha256": target["runtimeArchiveDigest"],
        "fromImages": current["images"],
        "toImages": target["images"],
        "requiresExactVersionedRuntimePair": True,
        "requiresBackupAndRestoreGate": True,
        "requiresNoWriteCutoverAndReversibleRuntimeInstall": True,
        "preservedComposeProject": "sanq-app",
        "preservedDatabaseVolume": "sanq-app_pgdata",
        "readyToInstall": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    try:
        proof = verify_historical_release(_bundle_bytes(args.bundle), args.source_sha)
        print(json.dumps(proof, sort_keys=True, indent=2))
    except (ValueError, OSError, KeyError, RuntimeTrustBlocked) as exc:
        print(f"SanQ historical Runtime blocked: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
