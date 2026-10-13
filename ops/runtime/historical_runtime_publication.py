#!/usr/bin/env python3
"""C5-G2-A: read-only validation of an EXACT historical published Runtime archive.

Not a root installer; never grants activation or proves that an archive remains
available off-VM. Uses a pinned source SHA, original bytes, exact matching CI
and publish runs, and both independently published GitHub commit status seals.
The existing newest-release verifier remains unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops/release"))
from release_contract import (  # noqa: E402
    REPOSITORY, RELEASE_CONTEXT, SEALED_DIGEST_PATTERN, checked_digest,
    github_json, require_sha,
)
from build_bundle import MAX_ARCHIVE_BYTES, verify_bundle_bytes  # noqa: E402
from runtime_trust import RUNTIME_CONTEXT, _bundle_bytes  # noqa: E402

DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")


class HistoricalPublicationBlocked(ValueError):
    """An original historical Runtime publication cannot be authenticated."""


def verify_historical_runtime_publication(
    original_archive: bytes,
    source_sha: str,
    *,
    fetch: Callable[[str], Any] = github_json,
) -> dict[str, Any]:
    """Return an inert evidence receipt; does not grant any install permission."""
    source_sha = require_sha(source_sha)
    if len(original_archive) > MAX_ARCHIVE_BYTES:
        raise HistoricalPublicationBlocked("historical archive too large")
    manifest = verify_bundle_bytes(original_archive, source_sha)
    ci_id, publish_id = manifest.get("ciRunId"), manifest.get("publishRunId")
    if (type(ci_id) is not int or ci_id <= 0
            or type(publish_id) is not int or publish_id <= 0):
        raise HistoricalPublicationBlocked("archive has invalid CI/publish run IDs")

    comparison = fetch(f"/repos/{REPOSITORY}/compare/{source_sha}...main")
    if (not isinstance(comparison, dict)
            or comparison.get("status") not in ("ahead", "identical")
            or comparison.get("behind_by") != 0
            or not isinstance(comparison.get("base_commit"), dict)
            or comparison["base_commit"].get("sha") != source_sha):
        raise HistoricalPublicationBlocked("source SHA not on main ancestry")

    def require_run(run_id: int, expected_name: str, expected_event: str) -> None:
        run = fetch(f"/repos/{REPOSITORY}/actions/runs/{run_id}")
        if (not isinstance(run, dict)
                or run.get("id") != run_id
                or run.get("name") != expected_name
                or run.get("event") != expected_event
                or run.get("head_sha") != source_sha
                or run.get("head_branch") != "main"
                or run.get("status") != "completed"
                or run.get("conclusion") != "success"
                or not isinstance(run.get("repository"), dict)
                or run["repository"].get("full_name") != REPOSITORY
                or not isinstance(run.get("head_repository"), dict)
                or run["head_repository"].get("full_name") != REPOSITORY):
            raise HistoricalPublicationBlocked("historical workflow identity invalid")

    require_run(ci_id, "ci", "push")
    require_run(publish_id, "publish-images", "workflow_run")
    publication_url = f"https://github.com/{REPOSITORY}/actions/runs/{publish_id}"

    statuses = fetch(f"/repos/{REPOSITORY}/commits/{source_sha}/statuses?per_page=100")
    if not isinstance(statuses, list):
        raise HistoricalPublicationBlocked("historical commit statuses unavailable")

    def latest_seal(context: str) -> dict[str, Any]:
        # The most recent matching status supersedes a previous success.
        seal = next(
            (entry for entry in statuses
             if isinstance(entry, dict) and entry.get("context") == context), None
        )
        if (not isinstance(seal, dict)
                or seal.get("state") != "success"
                or not isinstance(seal.get("creator"), dict)
                or seal["creator"].get("login") != "github-actions[bot]"
                or seal.get("target_url") != publication_url
                or not isinstance(seal.get("description"), str)):
            raise HistoricalPublicationBlocked("matching trusted GitHub seal absent")
        return seal

    paired_seal = latest_seal(RELEASE_CONTEXT)
    paired_match = SEALED_DIGEST_PATTERN.fullmatch(paired_seal["description"])
    if paired_match is None:
        raise HistoricalPublicationBlocked("paired digest seal malformed")
    for name, digest in (("sanq-api", paired_match.group(1)),
                         ("sanq-web", paired_match.group(2))):
        expected = manifest["applicationImages"][name]
        if (expected.get("ref") != f"ghcr.io/sanqin888/{name}:{source_sha}"
                or checked_digest(expected.get("digest")) != "sha256:" + digest):
            raise HistoricalPublicationBlocked("paired image digest mismatch")

    original_digest = "sha256:" + hashlib.sha256(original_archive).hexdigest()
    archive_seal = latest_seal(RUNTIME_CONTEXT)
    if (DIGEST.fullmatch(archive_seal["description"]) is None
            or archive_seal["description"] != original_digest):
        raise HistoricalPublicationBlocked("original archive external SHA256 mismatch")

    return {
        "kind": "c5-g2a-historical-runtime-publication-v1",
        "sourceSha": source_sha,
        "ciRunId": ci_id, "publishRunId": publish_id,
        "publicationUrl": publication_url,
        "runtimeArchiveDigest": original_digest,
        "historicalPublicationVerified": True,
        "productionActivationAuthorized": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    try:
        original_archive = _bundle_bytes(args.archive)
        evidence = verify_historical_runtime_publication(original_archive,
                                                          args.source_sha)
    except (ValueError, OSError) as exc:
        # No credentials, archive bytes, or archive member hashes in error text.
        print(f"Historical Runtime verification BLOCKED: {type(exc).__name__}",
              file=sys.stderr)
        return 1
    print(json.dumps(evidence, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
