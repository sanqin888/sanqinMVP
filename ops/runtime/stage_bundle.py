#!/usr/bin/env python3
"""Batch C2: safely PLAN or STAGE an inert, source-verified Runtime bundle.

This script never executes Docker, migrates data, changes .env, creates
runtime symlinks, activates a release or alters the existing production tree.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any

# A read-only plan must not create Python bytecode caches in the checkout.
sys.dont_write_bytecode = True

from build_bundle import (
    ROOT, RUNTIME_PREFIX, MANIFEST, SOURCE_FILES,
    BundleBlocked, _source_bytes, verify_bundle_bytes,
)
sys.path.insert(0, str(ROOT / "ops/release"))
from release_contract import (  # noqa: E402
    REPOSITORY, discover_release, github_json, require_sha,
)

LAYOUT_FILE = "ops/runtime/runtime-layout.v1.json"
STAGING_PARENT = Path("/opt/sanq/staging")
LAYOUT_V1 = {
    "schemaVersion": 1,
    "contractKind": "sanq-runtime-layout-proposal",
    "activationAuthorized": False,
    "composeProjectName": "sanq-app",
    "legacyRuntimeRoot": "/home/ubuntu/sanq-app",
    "proposedRuntimeRoot": "/opt/sanq/runtime",
    "proposedStagingRoot": str(STAGING_PARENT),
    "proposedUploadsRoot": "/srv/sanq/uploads",
    "proposedBackupsRoot": "/srv/sanq/backups",
    "preservedDatabaseVolume": "sanq-app_pgdata",
    "preservedSoundsRoot": "/home/ubuntu/sanq-assets/sounds",
    "sourceCheckoutRequiredForStaging": True,
    "migrationExecutionAuthorized": False,
    "productionCutoverAuthorized": False,
}


class StagingBlocked(BundleBlocked):
    """Inert Runtime staging safety condition failed."""


def validated_archive_files(payload: bytes, expected_sha: str) -> tuple[dict[str, Any], dict[str, bytes]]:
    """Check archive first, then read ONLY the named, verified members.

    Do not use tar.extractall: archive member parsing cannot select filesystem
    output paths and no link/device member can ever be staged.
    """
    manifest = verify_bundle_bytes(payload, require_sha(expected_sha))
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        files = {}
        for name in SOURCE_FILES:
            member = archive.getmember(f"{RUNTIME_PREFIX}/{name}")
            entry = archive.extractfile(member)
            if entry is None:
                raise StagingBlocked("validated source entry unavailable")
            files[name] = entry.read()
    if set(files) != set(SOURCE_FILES):
        raise StagingBlocked("invalid archive contents")
    return manifest, files


def validate_layout(files: dict[str, bytes]) -> dict[str, Any]:
    """Layout contract is immutable in C2 and cannot redirect a host write."""
    try:
        layout = json.loads(files[LAYOUT_FILE])
    except (KeyError, UnicodeError, json.JSONDecodeError) as exc:
        raise StagingBlocked("missing/invalid staging layout proposal") from exc
    if layout != LAYOUT_V1:
        raise StagingBlocked("unsupported or activation-capable runtime layout")
    return layout


def verify_checkout_sources(files: dict[str, bytes], source_root: Path, expected_sha: str) -> None:
    """Temporary C2 source provenance gate: require exact clean main checkout.

    This is *not* suitable for checkout-free activation. C5 must add trusted
    downloadable artifact attestations before removing the production .git.
    """
    expected_sha = require_sha(expected_sha)
    result = subprocess.run(
        ["git", "rev-parse", "--verify", "HEAD"],
        cwd=source_root, capture_output=True, text=True, check=False,
    )
    if result.returncode != 0 or result.stdout.strip() != expected_sha:
        raise StagingBlocked("reviewed checkout HEAD differs from bundle source")
    result = subprocess.run(
        ["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
        cwd=source_root, capture_output=True, text=True, check=False,
    )
    if result.returncode or result.stdout.strip() != "main":
        raise StagingBlocked("staging requires the existing main checkout")
    result = subprocess.run(
        ["git", "diff", "HEAD", "--exit-code", "--", *SOURCE_FILES],
        cwd=source_root, capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise StagingBlocked("runtime source changes in local checkout")
    for name, local_bytes in _source_bytes(source_root).items():
        if files.get(name) != local_bytes:
            raise StagingBlocked(f"bundle differs from checked-out source file: {name}")


def verify_paired_publication(manifest: dict[str, Any], fetch=github_json) -> dict[str, Any]:
    """Recheck trusted GitHub source commit seal before any staging."""
    candidate = discover_release(fetch=fetch)
    sha = require_sha(manifest["sourceSha"])
    if candidate["sourceSha"] != sha:
        raise StagingBlocked("bundle source is not the newest sealed main release")
    publish_id = manifest["publishRunId"]
    expected_url = f"https://github.com/{REPOSITORY}/actions/runs/{publish_id}"
    if candidate["publicationUrl"] != expected_url:
        raise StagingBlocked("runtime bundle does not match sealed publishing run")
    for name in ("sanq-api", "sanq-web"):
        published = candidate["images"][name]
        image = manifest["applicationImages"][name]
        if image["digest"] != published["digest"] or image["ref"] != published["ref"]:
            raise StagingBlocked("Runtime application image digest differs from publication seal")
    return candidate


def ensure_private_staging_parent(parent: Path) -> None:
    if not parent.is_absolute():
        raise StagingBlocked("staging directory must be an absolute path")
    current = Path(parent.anchor)
    for component in parent.parts[1:]:
        current = current / component
        if current.is_symlink():
            raise StagingBlocked("staging parent contains a symlink")
    if not parent.is_dir():
        raise StagingBlocked("staging parent must already exist; cannot create host directories")
    metadata = parent.stat()
    if metadata.st_uid != os.geteuid() or stat.S_IMODE(metadata.st_mode) & 0o022:
        raise StagingBlocked("staging directory must be owned by the operator and not group/world-writable")


def stage_verified_files(
    files: dict[str, bytes], manifest: dict[str, Any], parent: Path
) -> Path:
    """Explicit-only inert staging in a private, pre-created staging directory."""
    ensure_private_staging_parent(parent)
    sha = require_sha(manifest["sourceSha"])
    if manifest["productionActivationAuthorized"] is not False:
        raise StagingBlocked("activation is never authorized by a staged bundle")
    validate_layout(files)
    if set(files) != set(SOURCE_FILES):
        raise StagingBlocked("unreviewed source member found")
    record = manifest.get("files")
    if not isinstance(record, dict) or set(record) != set(SOURCE_FILES):
        raise StagingBlocked("manifest source checksum listing missing")
    for relative, data in files.items():
        entry = record.get(relative)
        if (
            not isinstance(entry, dict)
            or entry.get("sha256") != hashlib.sha256(data).hexdigest()
            or entry.get("bytes") != len(data)
        ):
            raise StagingBlocked("source bytes do not match signed-off manifest")
    target = parent / sha
    if target.exists() or target.is_symlink():
        raise StagingBlocked("staged release already exists; refusing overwrite")
    scratch = Path(tempfile.mkdtemp(prefix=".sanq-stage-", dir=parent))
    try:
        for relative, data in files.items():
            destination = scratch / relative
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            fd = os.open(destination, flags, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
        marker = scratch / MANIFEST
        with marker.open("x", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        if target.exists() or target.is_symlink():
            raise StagingBlocked("staging target appeared during preflight")
        scratch.rename(target)
        return target
    finally:
        if scratch.exists():
            shutil.rmtree(scratch)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("plan", "stage"))
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument(
        "--execute", action="store_true",
        help="Required for stage; never implies production activation",
    )
    args = parser.parse_args()
    if args.operation == "plan" and args.execute:
        parser.error("plan does not accept --execute")
    if args.operation == "stage" and not args.execute:
        parser.error("stage requires --execute")
    try:
        sha = require_sha(args.source_sha)
        if args.bundle.is_symlink() or not args.bundle.is_file():
            raise StagingBlocked("bundle must be a regular, non-symlink file")
        # Current source checkout and release seal prove provenance; neither
        # the embedded checksum nor GitHub image seal alone proves file bytes.
        manifest, files = validated_archive_files(args.bundle.read_bytes(), sha)
        validate_layout(files)
        verify_checkout_sources(files, ROOT, sha)
        verify_paired_publication(
            manifest,
            fetch=lambda path: github_json(path, token=os.environ.get("GITHUB_TOKEN") or None),
        )
        print(json.dumps({
            "status": "source-and-publication-verified",
            "sourceSha": sha,
            "stagingParent": str(STAGING_PARENT),
            "wouldWriteStagedFiles": len(files) + 1 if args.execute else 0,
            "productionActivationAuthorized": False,
        }, indent=2), flush=True)
        if args.operation == "stage" and args.execute:
            destination = stage_verified_files(files, manifest, STAGING_PARENT)
            print(f"Inert runtime staged at {destination}; NO activation performed")
    except (OSError, ValueError, KeyError, tarfile.TarError) as exc:
        print(f"SanQ runtime staging blocked: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
