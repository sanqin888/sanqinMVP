#!/usr/bin/env python3
"""C1 source-locked, inert Runtime artifact for the SanQ image publish workflow.

This utility packages a fixed allowlist of reviewed Runtime/Ops source and a
manifest. It cannot deploy containers, read secrets or change the VM runtime.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_PREFIX = "sanq-runtime"
MANIFEST = "runtime-release.json"
SOURCE_FILES = (
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
    "ops/runtime/runtime-layout.v1.json",
    "ops/verify-runtime-readiness.sh",
)
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ARCHIVE_BYTES = 12 * 1024 * 1024

sys.path.insert(0, str(ROOT / "ops/release"))
from release_contract import (  # noqa: E402
    ReleaseContractError,
    checked_digest,
    require_sha,
    validate_proof,
)


class BundleBlocked(ValueError):
    """A source release bundle contract has been violated."""


def _json(data: Any) -> bytes:
    return (json.dumps(data, sort_keys=True, indent=2, ensure_ascii=True) + "\n").encode("utf-8")


def _assert_safe_source(root: Path, relative: str) -> Path:
    if relative not in SOURCE_FILES:
        raise BundleBlocked("file not in fixed runtime allowlist")
    path = root
    for item in Path(relative).parts:
        path = path / item
        if path.is_symlink():
            raise BundleBlocked(f"symlink prohibited in runtime source: {relative}")
    try:
        metadata = path.stat()
    except OSError as exc:
        raise BundleBlocked(f"required runtime source unavailable: {relative}") from exc
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_FILE_BYTES:
        raise BundleBlocked(f"runtime file type/size invalid: {relative}")
    return path


def _source_bytes(root: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for relative in SOURCE_FILES:
        content = _assert_safe_source(root, relative).read_bytes()
        if len(content) > MAX_FILE_BYTES:
            raise BundleBlocked(f"runtime file exceeds size budget: {relative}")
        files[relative] = content
    return files


def manifest_for_proof(proof: Any, files: dict[str, bytes]) -> dict[str, Any]:
    p = validate_proof(proof)
    if set(files) != set(SOURCE_FILES):
        raise BundleBlocked("missing or unreviewed runtime source path")
    return {
        "schemaVersion": 1,
        "artifactKind": "sanq-runtime-source-pinned",
        "sourceBranch": "main",
        "sourceSha": p["sourceSha"],
        "ciRunId": p["ciRunId"],
        "publishRunId": p["publishRunId"],
        "applicationImages": {
            name: {
                "ref": p["images"][name]["ref"],
                "digest": checked_digest(p["images"][name]["digest"]),
            }
            for name in ("sanq-api", "sanq-web")
        },
        "files": {
            path: {
                "sha256": hashlib.sha256(value).hexdigest(),
                "bytes": len(value),
            }
            for path, value in sorted(files.items())
        },
        "productionActivationAuthorized": False,
    }


def _tar_entry(name: str, data: bytes | None) -> tuple[tarfile.TarInfo, io.BytesIO | None]:
    record = tarfile.TarInfo(name)
    record.uid = record.gid = record.mtime = 0
    record.uname = record.gname = ""
    if data is None:
        record.type = tarfile.DIRTYPE
        record.mode = 0o755
        return record, None
    record.type = tarfile.REGTYPE
    record.mode = 0o644
    record.size = len(data)
    return record, io.BytesIO(data)


def encode_bundle(files: dict[str, bytes], manifest: dict[str, Any]) -> bytes:
    if set(files) != set(SOURCE_FILES):
        raise BundleBlocked("runtime files differ from reviewed allowlist")
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
            directories = {RUNTIME_PREFIX}
            for path in SOURCE_FILES:
                parts = (RUNTIME_PREFIX, *Path(path).parts)
                for depth in range(1, len(parts)):
                    directories.add("/".join(parts[:depth]))
            for directory in sorted(directories):
                info, stream = _tar_entry(directory + "/", None)
                archive.addfile(info, stream)
            for path, data in sorted(files.items()):
                info, stream = _tar_entry(f"{RUNTIME_PREFIX}/{path}", data)
                archive.addfile(info, stream)
            info, stream = _tar_entry(f"{RUNTIME_PREFIX}/{MANIFEST}", _json(manifest))
            archive.addfile(info, stream)
    return output.getvalue()


def verify_bundle_bytes(payload: bytes, expected_sha: str) -> dict[str, Any]:
    require_sha(expected_sha)
    if len(payload) > MAX_ARCHIVE_BYTES:
        raise BundleBlocked("runtime archive exceeds safety budget")
    expected_files = {f"{RUNTIME_PREFIX}/{f}" for f in SOURCE_FILES}
    manifest_entry = f"{RUNTIME_PREFIX}/{MANIFEST}"
    contents: dict[str, bytes] = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
            seen: set[str] = set()
            for member in archive:
                if member.name in seen:
                    raise BundleBlocked("duplicate archive member")
                seen.add(member.name)
                if member.isdir():
                    # Only parent paths of approved members are allowed.
                    safe_dirs = {RUNTIME_PREFIX}
                    for path in (*expected_files, manifest_entry):
                        parts = path.split("/")
                        safe_dirs.update("/".join(parts[:i]) for i in range(1, len(parts)))
                    if member.name.rstrip("/") not in safe_dirs:
                        raise BundleBlocked("unexpected runtime archive directory")
                    continue
                if not member.isfile() or member.name not in (expected_files | {manifest_entry}):
                    raise BundleBlocked("unexpected or unsafe runtime archive entry")
                if member.size > MAX_FILE_BYTES:
                    raise BundleBlocked("oversized runtime archive member")
                entry = archive.extractfile(member)
                if entry is None:
                    raise BundleBlocked("runtime entry cannot be read")
                contents[member.name] = entry.read(MAX_FILE_BYTES + 1)
                if len(contents[member.name]) != member.size:
                    raise BundleBlocked("truncated runtime archive member")
    except (tarfile.TarError, EOFError, OSError) as exc:
        raise BundleBlocked("unreadable runtime archive") from exc
    if set(contents) != (expected_files | {manifest_entry}):
        raise BundleBlocked("runtime archive missing required files")
    manifest = json.loads(contents[manifest_entry])
    if not isinstance(manifest, dict):
        raise BundleBlocked("invalid runtime manifest")
    if (
        manifest.get("schemaVersion") != 1
        or manifest.get("artifactKind") != "sanq-runtime-source-pinned"
        or manifest.get("productionActivationAuthorized") is not False
        or manifest.get("sourceBranch") != "main"
        or manifest.get("sourceSha") != expected_sha
    ):
        raise BundleBlocked("runtime manifest source/provenance mismatch")
    images = manifest.get("applicationImages")
    if not isinstance(images, dict) or set(images) != {"sanq-api", "sanq-web"}:
        raise BundleBlocked("runtime manifest needs paired application images")
    for name, image in images.items():
        if not isinstance(image, dict) or image.get("ref") != (
            f"ghcr.io/sanqin888/{name}:{expected_sha}"
        ):
            raise BundleBlocked("runtime image source SHA mismatch")
        checked_digest(image.get("digest"))
    listing = manifest.get("files")
    if not isinstance(listing, dict) or set(listing) != set(SOURCE_FILES):
        raise BundleBlocked("runtime manifest source file list mismatch")
    for source in SOURCE_FILES:
        entry = listing[source]
        data = contents[f"{RUNTIME_PREFIX}/{source}"]
        if (
            not isinstance(entry, dict)
            or entry.get("sha256") != hashlib.sha256(data).hexdigest()
            or entry.get("bytes") != len(data)
        ):
            raise BundleBlocked(f"runtime artifact checksum mismatch: {source}")
    return manifest


def build_archive(source_root: Path, proof: Any, checkout_sha: str) -> bytes:
    require_sha(checkout_sha)
    if validate_proof(proof)["sourceSha"] != checkout_sha:
        raise BundleBlocked("checked-out source differs from validated CI release SHA")
    files = _source_bytes(source_root)
    manifest = manifest_for_proof(proof, files)
    archive = encode_bundle(files, manifest)
    verify_bundle_bytes(archive, checkout_sha)
    return archive


def _checkout_sha(root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--verify", "HEAD"],
        cwd=root, capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise BundleBlocked("unable to establish checked-out source SHA")
    return require_sha(result.stdout.strip())


def _save_archive(path: Path, data: bytes) -> None:
    if path.is_symlink():
        raise BundleBlocked("output path must not be a symlink")
    if not path.parent.is_dir():
        raise BundleBlocked("output parent directory missing")
    fd, tmp = tempfile.mkstemp(prefix=".sanq-runtime-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    create = sub.add_parser("create", help="Build source-pinned inert Runtime release archive")
    create.add_argument("--proof", type=Path, required=True)
    create.add_argument("--source-sha", required=True)
    create.add_argument("--output", type=Path, required=True)
    verify = sub.add_parser("verify", help="Read-only check of archive, no extraction")
    verify.add_argument("--bundle", type=Path, required=True)
    verify.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    try:
        if args.operation == "create":
            sha = require_sha(args.source_sha)
            if _checkout_sha(ROOT) != sha:
                raise BundleBlocked("current git checkout is not the validated source SHA")
            proof = json.loads(args.proof.read_text(encoding="utf-8"))
            payload = build_archive(ROOT, proof, sha)
            _save_archive(args.output, payload)
            print(f"Created inert SanQ Runtime bundle for {sha}")
        else:
            manifest = verify_bundle_bytes(args.bundle.read_bytes(), require_sha(args.source_sha))
            print(json.dumps({
                "sourceSha": manifest["sourceSha"],
                "publishRunId": manifest["publishRunId"],
                "fileCount": len(manifest["files"]),
                "verified": True,
                "productionActivationAuthorized": False,
            }, sort_keys=True))
    except (OSError, ValueError, json.JSONDecodeError, ReleaseContractError) as exc:
        print(f"Runtime bundle blocked: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
