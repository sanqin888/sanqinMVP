#!/usr/bin/env python3
"""SanQ Batch A: verify paired GHCR images and discover sealed main releases.

The only network write is the seal subcommand, used by the trusted Actions job.
This script has no Docker pull, deployment, environment edit or database action.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPOSITORY = "sanqin888/sanqinMVP"
GITHUB_API = "https://api.github.com"
RELEASE_CONTEXT = "sanq/paired-images-published"
SHA_PATTERN = re.compile(r"^[a-f0-9]{40}$")
DIGEST_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
SEALED_DIGEST_PATTERN = re.compile(r"^a:([a-f0-9]{64}) w:([a-f0-9]{64})$")
RUN_URL_PATTERN = re.compile(
    r"^https://github\.com/sanqin888/sanqinMVP/actions/runs/[1-9][0-9]*$"
)
INDEX_MEDIA_TYPES = {
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
}
IMAGE_MEDIA_TYPES = {
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
}


class ReleaseContractError(ValueError):
    """Invalid or incomplete published-release evidence."""


def require_sha(value: str) -> str:
    if not isinstance(value, str) or not SHA_PATTERN.fullmatch(value):
        raise ReleaseContractError("source SHA must be exactly 40 lowercase hex characters")
    return value


def require_positive_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ReleaseContractError(f"{name} must be a positive integer")
    return value


def checked_digest(value: Any) -> str:
    if not isinstance(value, str) or not DIGEST_PATTERN.fullmatch(value):
        raise ReleaseContractError("registry manifest digest is missing or invalid")
    return value


def inspect_image_manifest(
    manifest: Any, image_config: Any, source_sha: str, image_name: str
) -> dict[str, Any]:
    """Validate remote registry evidence, including linux/amd64 availability."""
    if not isinstance(manifest, dict):
        raise ReleaseContractError(f"{image_name}: registry descriptor is not an object")
    digest = checked_digest(manifest.get("digest"))
    media_type = manifest.get("mediaType")
    if media_type in INDEX_MEDIA_TYPES:
        entries = manifest.get("manifests")
        if not isinstance(entries, list) or not any(
            isinstance(entry, dict)
            and isinstance(entry.get("platform"), dict)
            and entry["platform"].get("os") == "linux"
            and entry["platform"].get("architecture") == "amd64"
            and isinstance(entry.get("digest"), str)
            and DIGEST_PATTERN.fullmatch(entry["digest"])
            for entry in entries
        ):
            raise ReleaseContractError(f"{image_name}: no linux/amd64 image in registry index")
    elif media_type in IMAGE_MEDIA_TYPES:
        if not isinstance(image_config, dict) or (
            image_config.get("os") != "linux"
            or image_config.get("architecture") != "amd64"
        ):
            raise ReleaseContractError(f"{image_name}: unverified single-image platform")
    else:
        raise ReleaseContractError(f"{image_name}: unsupported registry manifest media type")

    # Buildx may not expose .Image for an OCI index. If available, enforce
    # the revision label. For a single-image manifest the config is required.
    if isinstance(image_config, dict):
        config = image_config.get("config")
        labels = config.get("Labels") if isinstance(config, dict) else None
        if isinstance(labels, dict) and labels.get("org.opencontainers.image.revision") != source_sha:
            raise ReleaseContractError(f"{image_name}: revision label differs from source SHA")

    return {
        "ref": f"ghcr.io/sanqin888/{image_name}:{source_sha}",
        "digest": digest,
        "requiredPlatform": "linux/amd64",
    }


def create_release_proof(
    *,
    source_sha: str,
    ci_run_id: int,
    publish_run_id: int,
    manifests: dict[str, Any],
    configs: dict[str, Any],
    generated_at: str,
) -> dict[str, Any]:
    require_sha(source_sha)
    require_positive_int(ci_run_id, "CI run ID")
    require_positive_int(publish_run_id, "publish run ID")
    if not isinstance(generated_at, str) or not generated_at.endswith("Z"):
        raise ReleaseContractError("publication timestamp must be UTC")
    if set(manifests) != {"sanq-api", "sanq-web"} or set(configs) != {"sanq-api", "sanq-web"}:
        raise ReleaseContractError("publication requires both API and Web registry checks")
    images = {
        name: inspect_image_manifest(manifests[name], configs[name], source_sha, name)
        for name in ("sanq-api", "sanq-web")
    }
    return {
        "schemaVersion": 1,
        "sourceBranch": "main",
        "sourceSha": source_sha,
        "ciRunId": ci_run_id,
        "publishRunId": publish_run_id,
        "verifiedAt": generated_at,
        "images": images,
    }


def validate_proof(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise ReleaseContractError("unsupported release proof schema")
    source_sha = require_sha(value.get("sourceSha", ""))
    if value.get("sourceBranch") != "main":
        raise ReleaseContractError("only main releases may be sealed")
    require_positive_int(value.get("ciRunId"), "CI run ID")
    require_positive_int(value.get("publishRunId"), "publish run ID")
    images = value.get("images")
    if not isinstance(images, dict) or set(images) != {"sanq-api", "sanq-web"}:
        raise ReleaseContractError("a complete release must have API and Web images")
    for name, image in images.items():
        if not isinstance(image, dict) or image.get("ref") != (
            f"ghcr.io/sanqin888/{name}:{source_sha}"
        ):
            raise ReleaseContractError(f"{name}: unexpected image reference")
        checked_digest(image.get("digest"))
        if image.get("requiredPlatform") != "linux/amd64":
            raise ReleaseContractError(f"{name}: unexpected platform")
    return value


def github_json(path: str, *, token: str | None = None, payload: Any = None) -> Any:
    if not path.startswith(f"/repos/{REPOSITORY}/"):
        raise ReleaseContractError("GitHub API path outside the fixed SanQ repository")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "sanq-paired-release-contract/1",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(GITHUB_API + path, data=data, headers=headers)
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError) as exc:
        # Never log request headers, tokens or authenticated error bodies.
        raise ReleaseContractError(f"GitHub release API request failed: {type(exc).__name__}") from exc


def is_sealed_status(status: Any) -> bool:
    if not isinstance(status, dict):
        return False
    creator = status.get("creator")
    return (
        status.get("context") == RELEASE_CONTEXT
        and status.get("state") == "success"
        and isinstance(creator, dict)
        and creator.get("login") == "github-actions[bot]"
        and isinstance(status.get("target_url"), str)
        and RUN_URL_PATTERN.fullmatch(status["target_url"]) is not None
        and isinstance(status.get("description"), str)
        and SEALED_DIGEST_PATTERN.fullmatch(status["description"]) is not None
    )


def sealed_release_for_sha(source_sha: str, fetch=github_json) -> dict[str, Any]:
    """Read the exact previous release seal; never substitute a newer release.

    GitHub statuses are newest-first. A later failed or pending seal of the
    same context overrides prior success, and missing evidence blocks rollback.
    This contract authenticates only the existing GitHub paired-image seal;
    local RepoDigests still need to be checked before any image switch.
    """
    source_sha = require_sha(source_sha)
    statuses = fetch(f"/repos/{REPOSITORY}/commits/{source_sha}/statuses?per_page=100")
    if not isinstance(statuses, list):
        raise ReleaseContractError("invalid historical release status response")
    seal = next(
        (s for s in statuses if isinstance(s, dict) and s.get("context") == RELEASE_CONTEXT),
        None,
    )
    if not is_sealed_status(seal):
        raise ReleaseContractError("previous release lacks a current valid paired-image seal")
    match = SEALED_DIGEST_PATTERN.fullmatch(seal["description"])
    if match is None:
        raise ReleaseContractError("invalid previous release digest seal")
    return {
        "sourceSha": source_sha,
        "publicationUrl": seal["target_url"],
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{source_sha}",
                "digest": "sha256:" + digest,
            }
            for name, digest in zip(("sanq-api", "sanq-web"), match.groups())
        },
    }


def _verify_lineage(base: str, head: str, fetch) -> None:
    comparison = fetch(f"/repos/{REPOSITORY}/compare/{base}...{head}")
    if (not isinstance(comparison, dict)
        or comparison.get("status") not in ("ahead", "identical")
        or type(comparison.get("behind_by")) is not int
        or comparison["behind_by"] != 0
        or not isinstance(comparison.get("base_commit"), dict)
        or comparison["base_commit"].get("sha") != base
        or not isinstance(comparison.get("merge_base_commit"), dict)
        or comparison["merge_base_commit"].get("sha") != base):
        raise ReleaseContractError("exact candidate is not on the required main lineage")
    if head != "main" and comparison["status"] != (
        "identical" if base == head else "ahead"
    ):
        raise ReleaseContractError("candidate is not a forward release")


def verify_exact_candidate(current_sha: str, target_sha: str, fetch=github_json) -> dict[str, Any]:
    """Read-only exact candidate checks; never discover or substitute latest.

    The paired seal is the existing trusted-workflow boundary. Run metadata and
    main ancestry are additional checks, not an independent artifact signature.
    No compare files/commit-count budget is used to infer runtime compatibility.
    """
    current_sha, target_sha = require_sha(current_sha), require_sha(target_sha)
    candidate = sealed_release_for_sha(target_sha, fetch)

    _verify_lineage(target_sha, "main", fetch)
    _verify_lineage(current_sha, target_sha, fetch)
    publish_id = int(candidate["publicationUrl"].rsplit("/", 1)[1])
    publication = fetch(f"/repos/{REPOSITORY}/actions/runs/{publish_id}")
    if (not isinstance(publication, dict)
        or type(publication.get("id")) is not int or publication["id"] != publish_id
        or publication.get("path") != ".github/workflows/publish-images.yml"
        or publication.get("event") != "workflow_run"
        or publication.get("head_branch") != "main"
        or publication.get("status") != "completed"
        or publication.get("conclusion") != "success"
        or not isinstance(publication.get("repository"), dict)
        or publication["repository"].get("full_name") != REPOSITORY):
        raise ReleaseContractError("exact publication run is not successful and trusted")
    data = fetch(
        f"/repos/{REPOSITORY}/actions/workflows/ci.yml/runs"
        f"?event=push&head_sha={target_sha}&per_page=100"
    )
    if not isinstance(data, dict) or not isinstance(data.get("workflow_runs"), list):
        raise ReleaseContractError("exact main CI evidence missing")
    runs = [
        run for run in data["workflow_runs"]
        if isinstance(run, dict) and run.get("head_sha") == target_sha
        and run.get("head_branch") == "main" and run.get("event") == "push"
        and run.get("path") == ".github/workflows/ci.yml"
    ]
    if not runs:
        raise ReleaseContractError("exact main CI run missing")
    for run in runs:
        require_positive_int(run.get("id"), "CI run ID")
    if len({run["id"] for run in runs}) != len(runs):
        raise ReleaseContractError("duplicate exact main CI run identity")
    latest = max(runs, key=lambda run: run["id"])
    if (latest.get("status") != "completed" or latest.get("conclusion") != "success"
        or not isinstance(latest.get("repository"), dict)
        or latest["repository"].get("full_name") != REPOSITORY):
        raise ReleaseContractError("latest exact main CI is not successful")
    return {**candidate, "ciRunId": latest["id"]}


def verify_exact_rollback(current_sha: str, previous_sha: str, fetch=github_json) -> dict[str, Any]:
    """Authenticate the exact historical target, not its database compatibility."""
    current_sha, previous_sha = require_sha(current_sha), require_sha(previous_sha)
    if current_sha == previous_sha:
        raise ReleaseContractError("rollback target equals current release")
    # Reuse all exact target seal/CI/publication checks. Current app health or
    # a newer failed current CI run is not historical-target authentication.
    candidate = verify_exact_candidate(previous_sha, previous_sha, fetch)
    _verify_lineage(current_sha, "main", fetch)
    _verify_lineage(previous_sha, current_sha, fetch)
    return candidate


def discover_release(fetch=github_json, *, max_commits: int = 20) -> dict[str, Any]:
    """Find the newest sealed main commit; unsealed CI results are not releases."""
    if not 1 <= max_commits <= 100:
        raise ReleaseContractError("max commits must be between 1 and 100")
    commits = fetch(f"/repos/{REPOSITORY}/commits?sha=main&per_page={max_commits}")
    if not isinstance(commits, list):
        raise ReleaseContractError("invalid main commit listing")
    for commit in commits:
        if not isinstance(commit, dict):
            raise ReleaseContractError("invalid main commit item")
        source_sha = require_sha(commit.get("sha", ""))
        statuses = fetch(f"/repos/{REPOSITORY}/commits/{source_sha}/statuses?per_page=100")
        if not isinstance(statuses, list):
            raise ReleaseContractError("invalid GitHub status response")
        # Statuses are newest first; pending/failure supersedes old success.
        seal = next(
            (s for s in statuses if isinstance(s, dict) and s.get("context") == RELEASE_CONTEXT),
            None,
        )
        if seal is not None and is_sealed_status(seal):
            match = SEALED_DIGEST_PATTERN.fullmatch(seal["description"])
            if match is None:
                raise ReleaseContractError("malformed publication digest seal")
            digests = {
                "sanq-api": "sha256:" + match.group(1),
                "sanq-web": "sha256:" + match.group(2),
            }
            return {
                "schemaVersion": 1,
                "sourceSha": source_sha,
                "sourceBranch": "main",
                "publicationUrl": seal["target_url"],
                "sealedAt": seal.get("created_at"),
                "images": {
                    name: {
                        "ref": f"ghcr.io/sanqin888/{name}:{source_sha}",
                        "digest": digests[name],
                    }
                    for name in ("sanq-api", "sanq-web")
                },
            }
    raise ReleaseContractError(
        "no sealed paired-image release found in the inspected main history"
    )


def read_registry_manifest(path: Path) -> dict[str, Any]:
    """Extract the registry manifest digest from the exact received OCI JSON bytes.

    Buildx .Manifest is not guaranteed to include a top-level digest field.
    The registry manifest digest is SHA256 of the raw response bytes, not of
    parsed/reformatted JSON.
    """
    raw = path.read_bytes()
    manifest = json.loads(raw)
    if not isinstance(manifest, dict) or "digest" in manifest:
        raise ReleaseContractError("invalid raw registry manifest payload")
    return {**manifest, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}


def run_verify(args: argparse.Namespace) -> None:
    proof = create_release_proof(
        source_sha=args.source_sha,
        ci_run_id=args.ci_run_id,
        publish_run_id=args.publish_run_id,
        manifests={
            "sanq-api": read_registry_manifest(args.api_manifest),
            "sanq-web": read_registry_manifest(args.web_manifest),
        },
        configs={
            "sanq-api": json.loads(args.api_image.read_text(encoding="utf-8")),
            "sanq-web": json.loads(args.web_image.read_text(encoding="utf-8")),
        },
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    )
    validate_proof(proof)
    args.output.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(f"Verified paired GHCR release {proof['sourceSha']}")


def run_seal(args: argparse.Namespace) -> None:
    proof = validate_proof(json.loads(args.proof.read_text(encoding="utf-8")))
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise ReleaseContractError("sealing requires a GitHub Actions token")
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("GITHUB_REPOSITORY") != REPOSITORY
        or os.environ.get("GITHUB_RUN_ID") != str(proof["publishRunId"])
    ):
        raise ReleaseContractError("seal requires the matching GitHub Actions publishing run")
    run_url = f"https://github.com/{REPOSITORY}/actions/runs/{proof['publishRunId']}"
    result = github_json(
        f"/repos/{REPOSITORY}/statuses/{proof['sourceSha']}",
        token=token,
        payload={
            "state": "success",
            "context": RELEASE_CONTEXT,
            # GitHub Status description supports at most 140 characters.
            # Both immutable manifest digests fit in 133 characters for a
            # public, token-free deployer to validate the pulled artifacts.
            "description": (
                "a:" + proof["images"]["sanq-api"]["digest"].removeprefix("sha256:")
                + " w:" + proof["images"]["sanq-web"]["digest"].removeprefix("sha256:")
            ),
            "target_url": run_url,
        },
    )
    if not isinstance(result, dict) or result.get("state") != "success":
        raise ReleaseContractError("release seal was not confirmed by GitHub")
    print(f"Sealed paired-image release {proof['sourceSha']}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    verify = sub.add_parser("verify", help="Verify both published GHCR manifest records")
    verify.add_argument("--source-sha", required=True)
    verify.add_argument("--ci-run-id", type=int, required=True)
    verify.add_argument("--publish-run-id", type=int, required=True)
    verify.add_argument("--api-manifest", type=Path, required=True)
    verify.add_argument("--web-manifest", type=Path, required=True)
    verify.add_argument("--api-image", type=Path, required=True)
    verify.add_argument("--web-image", type=Path, required=True)
    verify.add_argument("--output", type=Path, required=True)
    seal = sub.add_parser("seal", help="GitHub Actions only: seal uploaded proof")
    seal.add_argument("--proof", type=Path, required=True)
    discover = sub.add_parser("discover", help="Read-only: newest sealed main SHA")
    discover.add_argument("--max-commits", type=int, default=20)
    discover.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "verify":
            run_verify(args)
        elif args.command == "seal":
            run_seal(args)
        else:
            token = os.environ.get("GITHUB_TOKEN") or None
            candidate = discover_release(
                fetch=lambda path: github_json(path, token=token),
                max_commits=args.max_commits,
            )
            print(json.dumps(candidate, indent=2 if args.pretty else None))
    except (ReleaseContractError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Release contract blocked: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
