#!/usr/bin/env python3
"""C5-B1 Runtime archive SHA256 seal, independently published on GitHub.

Publication adds a separate commit status AFTER the GitHub Actions Runtime
artifact upload. Verification requires both the paired-image release seal and
the Runtime archive digest status from that same publishing run.

This is a repository-scoped GitHub Actions trust record, not a cryptographic
Sigstore signature. Neither command installs, extracts or activates a release.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops/release"))
from release_contract import (  # noqa: E402
    REPOSITORY,
    RELEASE_CONTEXT,
    ReleaseContractError,
    checked_digest,
    discover_release,
    github_json,
    require_sha,
    validate_proof,
)
from build_bundle import (  # noqa: E402
    MAX_ARCHIVE_BYTES,
    BundleBlocked,
    verify_bundle_bytes,
)

RUNTIME_CONTEXT = "sanq/runtime-archive-sha256"
RUN_URL = re.compile(r"^https://github\.com/sanqin888/sanqinMVP/actions/runs/([1-9][0-9]*)$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
READ_LIMIT = MAX_ARCHIVE_BYTES + 1


class RuntimeTrustBlocked(ValueError):
    """An independent Runtime archive proof or publisher is missing/invalid."""


def _bundle_bytes(path: Path) -> bytes:
    if path.is_symlink():
        raise RuntimeTrustBlocked("Runtime archive must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except (OSError, ValueError) as exc:
        raise RuntimeTrustBlocked("Runtime archive must be a regular non-symlink file") from exc
    with os.fdopen(descriptor, "rb") as reader:
        info = os.fstat(reader.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise RuntimeTrustBlocked("Runtime archive must be a regular non-symlink file")
        if info.st_size > MAX_ARCHIVE_BYTES:
            raise RuntimeTrustBlocked("Runtime archive exceeds size budget")
        payload = reader.read(READ_LIMIT)
    if len(payload) > MAX_ARCHIVE_BYTES:
        raise RuntimeTrustBlocked("Runtime archive exceeds size budget")
    return payload


def _sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _checked_manifest(payload: bytes, source_sha: str) -> dict[str, Any]:
    return verify_bundle_bytes(payload, require_sha(source_sha))


def _match_proof(manifest: dict[str, Any], proof: Any) -> None:
    verified = validate_proof(proof)
    if (
        manifest.get("sourceSha") != verified["sourceSha"]
        or manifest.get("ciRunId") != verified["ciRunId"]
        or manifest.get("publishRunId") != verified["publishRunId"]
        or manifest.get("sourceBranch") != "main"
    ):
        raise RuntimeTrustBlocked("Runtime manifest does not match paired-image source/proof")
    for name in ("sanq-api", "sanq-web"):
        pair = manifest["applicationImages"][name]
        image = verified["images"][name]
        if pair.get("ref") != image["ref"] or pair.get("digest") != image["digest"]:
            raise RuntimeTrustBlocked("Runtime manifest does not match paired-image digest")


def _require_publisher(proof: Any) -> dict[str, Any]:
    verified = validate_proof(proof)
    if not os.environ.get("GITHUB_TOKEN"):
        raise RuntimeTrustBlocked("Runtime sealing needs the scoped GitHub Actions token")
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("GITHUB_REPOSITORY") != REPOSITORY
        or os.environ.get("GITHUB_WORKFLOW") != "publish-images"
        or os.environ.get("GITHUB_EVENT_NAME") != "workflow_run"
        or os.environ.get("GITHUB_RUN_ID") != str(verified["publishRunId"])
    ):
        raise RuntimeTrustBlocked("Runtime seal requires matching publish-images workflow_run identity")
    return verified


def seal_runtime_archive(
    proof: Any,
    payload: bytes,
    *,
    post: Callable[..., Any] = github_json,
) -> dict[str, Any]:
    """Called only by trusted publish-images job, AFTER artifact upload."""
    verified = _require_publisher(proof)
    manifest = _checked_manifest(payload, verified["sourceSha"])
    _match_proof(manifest, verified)
    digest = _sha256(payload)
    run_url = f"https://github.com/{REPOSITORY}/actions/runs/{verified['publishRunId']}"
    result = post(
        f"/repos/{REPOSITORY}/statuses/{verified['sourceSha']}",
        token=os.environ["GITHUB_TOKEN"],
        payload={
            "state": "success",
            "context": RUNTIME_CONTEXT,
            "description": digest,
            "target_url": run_url,
        },
    )
    if not isinstance(result, dict) or result.get("state") != "success":
        raise RuntimeTrustBlocked("GitHub did not confirm Runtime SHA256 status")
    return {
        "sourceSha": verified["sourceSha"],
        "publicationUrl": run_url,
        "runtimeArchiveDigest": digest,
        "sealed": True,
    }


def verify_runtime_publication(
    payload: bytes,
    source_sha: str,
    *,
    fetch: Callable[[str], Any] = github_json,
) -> dict[str, Any]:
    """Separate status is trust root; embedded file checksums are not."""
    source_sha = require_sha(source_sha)
    if len(payload) > MAX_ARCHIVE_BYTES:
        raise RuntimeTrustBlocked("Runtime archive exceeds size budget")
    manifest = _checked_manifest(payload, source_sha)
    published = discover_release(fetch=fetch)
    if published["sourceSha"] != source_sha:
        raise RuntimeTrustBlocked("Runtime SHA is not newest completed paired-image publication")
    url = published["publicationUrl"]
    run_match = RUN_URL.fullmatch(url)
    if run_match is None or manifest.get("publishRunId") != int(run_match.group(1)):
        raise RuntimeTrustBlocked("Runtime archive does not match the paired publishing run")
    # GitHub's status creator is repository-scoped, not a unique workflow
    # identity. Confirm the status target refers to a completed successful
    # publish-images run in the fixed repository, not an unrelated run URL.
    run_id = int(run_match.group(1))
    run = fetch(f"/repos/{REPOSITORY}/actions/runs/{run_id}")
    if (
        not isinstance(run, dict)
        or run.get("id") != run_id
        or run.get("name") != "publish-images"
        or run.get("event") != "workflow_run"
        or run.get("status") != "completed"
        or run.get("conclusion") != "success"
        or not isinstance(run.get("repository"), dict)
        or run["repository"].get("full_name") != REPOSITORY
    ):
        raise RuntimeTrustBlocked("trusted successful publish-images workflow identity missing")
    expected_images = published["images"]
    for name in ("sanq-api", "sanq-web"):
        pair = manifest["applicationImages"][name]
        if (
            pair.get("ref") != expected_images[name]["ref"]
            or checked_digest(pair.get("digest")) != expected_images[name]["digest"]
        ):
            raise RuntimeTrustBlocked("Runtime archive image digest/source mismatch")

    statuses = fetch(f"/repos/{REPOSITORY}/commits/{source_sha}/statuses?per_page=100")
    if not isinstance(statuses, list):
        raise RuntimeTrustBlocked("Runtime publication statuses missing or malformed")
    # GitHub statuses are newest first; any newest failed/pending/spoofed
    # status for this context supersedes a stale prior success.
    seal = next(
        (s for s in statuses if isinstance(s, dict) and s.get("context") == RUNTIME_CONTEXT),
        None,
    )
    if (
        not isinstance(seal, dict)
        or seal.get("state") != "success"
        or not isinstance(seal.get("creator"), dict)
        or seal["creator"].get("login") != "github-actions[bot]"
        or seal.get("target_url") != url
        or not isinstance(seal.get("description"), str)
        or DIGEST.fullmatch(seal["description"]) is None
    ):
        raise RuntimeTrustBlocked("trusted matching Runtime publication status absent")
    if seal["description"] != _sha256(payload):
        raise RuntimeTrustBlocked("Runtime archive bytes do not match independent GitHub SHA256 status")
    return {
        "sourceSha": source_sha,
        "publicationUrl": url,
        "runtimeArchiveDigest": seal["description"],
        "verified": True,
        "productionActivationAuthorized": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    seal = sub.add_parser("seal", help="GitHub Actions only; publish Runtime archive digest")
    seal.add_argument("--proof", required=True, type=Path)
    seal.add_argument("--bundle", required=True, type=Path)
    verify = sub.add_parser("verify", help="Read-only check against paired image + Runtime GitHub seals")
    verify.add_argument("--bundle", required=True, type=Path)
    verify.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    try:
        payload = _bundle_bytes(args.bundle)
        if args.action == "seal":
            proof = json.loads(args.proof.read_text(encoding="utf-8"))
            outcome = seal_runtime_archive(proof, payload)
        else:
            outcome = verify_runtime_publication(payload, args.source_sha)
        print(json.dumps(outcome, sort_keys=True, indent=2))
    except (RuntimeTrustBlocked, ReleaseContractError, BundleBlocked, OSError, ValueError) as exc:
        print(f"SanQ Runtime publication trust blocked: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
