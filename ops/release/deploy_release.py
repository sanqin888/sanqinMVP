#!/usr/bin/env python3
"""SanQ Batch B: operator-triggered, fail-closed release deployment.

NEVER runs migrations, builds images, touches the db service or prunes volumes.
No unattended daemon/watch mode. Deploy/rollback require --execute.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from release_contract import (
    REPOSITORY, ReleaseContractError, checked_digest,
    discover_release, github_json, require_sha,
)

ROOT = Path(__file__).resolve().parents[2]
ENV = ROOT / ".env"
COMPOSE = ROOT / "docker-compose.yml"
STATE = ROOT / ".sanq-release-state.json"
IMAGE_NAMES = ("sanq-api", "sanq-web")
APP_SERVICES = ("api", "ubereats-worker", "web")
RELEASE_LINE = re.compile(r"(?m)^SANQ_IMAGE_SHA=([^\r\n]*)\r?$")
BACKUP_NAME = re.compile(r"^sanqin_db_[0-9]{8}_[0-9]{6}\.sql\.gz$")


class DeploymentBlocked(ValueError):
    """An explicit deployment safety gate failed."""


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def require_safe_file(path: Path, *, allow_absent: bool = False) -> None:
    if path.is_symlink():
        raise DeploymentBlocked(f"symlink is not allowed: {path.name}")
    if not path.exists():
        if allow_absent:
            return
        raise DeploymentBlocked(f"required file missing: {path.name}")
    if not path.is_file():
        raise DeploymentBlocked(f"not a regular file: {path.name}")


def current_sha_from_text(text: str) -> str:
    lines = RELEASE_LINE.findall(text)
    if len(lines) != 1:
        raise DeploymentBlocked(".env must contain exactly one SANQ_IMAGE_SHA assignment")
    return require_sha(lines[0])


def read_current_sha() -> str:
    require_safe_file(ENV)
    return current_sha_from_text(ENV.read_text(encoding="utf-8"))


def read_state() -> dict[str, Any] | None:
    require_safe_file(STATE, allow_absent=True)
    if not STATE.exists():
        return None
    result = json.loads(STATE.read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        raise DeploymentBlocked("release state is not an object")
    if result.get("phase") not in ("pending", "active", "rolled-back"):
        raise DeploymentBlocked("release state has an unsupported phase")
    require_sha(result.get("current", ""))
    require_sha(result.get("previous", ""))
    return result


def atomic_write(path: Path, value: str) -> None:
    """Safely replace a non-symlink sibling file, preserving existing mode."""
    require_safe_file(path, allow_absent=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
    fd, tmp_name = tempfile.mkstemp(prefix=".sanq-release-tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as output:
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(tmp_name, mode)
        require_safe_file(path, allow_absent=True)
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def update_env_sha(new_sha: str) -> None:
    require_sha(new_sha)
    require_safe_file(ENV)
    original = ENV.read_text(encoding="utf-8")
    current_sha_from_text(original)
    updated, count = RELEASE_LINE.subn(f"SANQ_IMAGE_SHA={new_sha}", original)
    if count != 1:
        raise DeploymentBlocked("ambiguous .env SHA update")
    atomic_write(ENV, updated)


def write_state(phase: str, current: str, previous: str, *, reason: str) -> None:
    if phase not in ("pending", "active", "rolled-back"):
        raise DeploymentBlocked("invalid release phase")
    atomic_write(STATE, json.dumps({
        "schemaVersion": 1,
        "phase": phase,
        "current": require_sha(current),
        "previous": require_sha(previous),
        "updatedAt": now_utc(),
        "reason": reason,
    }, indent=2) + "\n")


def run(args: list[str], *, target_sha: str | None = None, capture: bool = False) -> str:
    """Execute fixed operations only; no shell or user-supplied command."""
    environment = os.environ.copy()
    if target_sha is not None:
        environment["SANQ_IMAGE_SHA"] = require_sha(target_sha)
    result = subprocess.run(
        args,
        cwd=ROOT,
        env=environment,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        check=False,
    )
    if result.returncode != 0:
        raise DeploymentBlocked(f"preflight/operation failed: {args[0]} {args[1] if len(args)>1 else ''}")
    return result.stdout.strip() if capture else ""


def compose(target_sha: str, *args: str, capture: bool = False) -> str:
    return run([
        "docker", "compose",
        "--project-name", "sanq-app",
        "--project-directory", str(ROOT),
        "--env-file", str(ENV),
        "-f", str(COMPOSE),
        *args,
    ], target_sha=target_sha, capture=capture)


def ensure_repo_location() -> None:
    if Path.cwd().resolve() != ROOT.resolve():
        raise DeploymentBlocked("run from the original SanQ production repository root")
    require_safe_file(COMPOSE)
    require_safe_file(ENV)
    require_safe_file(ROOT / "ops/verify-runtime-readiness.sh")
    if ENV.stat().st_uid != os.geteuid():
        raise DeploymentBlocked("production .env owner differs from the deploying user")
    if run(["git", "symbolic-ref", "--quiet", "--short", "HEAD"], capture=True) != "main":
        raise DeploymentBlocked("deployment source checkout must be on main")
    # Do not silently change Compose project identity or the upload bind source.
    source = COMPOSE.read_text(encoding="utf-8")
    if "pgdata:/var/lib/postgresql/data" not in source or "./uploads:/app/uploads" not in source:
        raise DeploymentBlocked("unexpected Compose database/upload storage contract")


def check_running_images(current: str) -> None:
    expected = {
        "api": f"ghcr.io/sanqin888/sanq-api:{current}",
        "ubereats-worker": f"ghcr.io/sanqin888/sanq-api:{current}",
        "web": f"ghcr.io/sanqin888/sanq-web:{current}",
    }
    for service, image in expected.items():
        container_id = compose(current, "ps", "-q", service, capture=True)
        if not container_id or len(container_id.splitlines()) != 1:
            raise DeploymentBlocked(f"exactly one running {service} container is required")
        actual = run(
            ["docker", "inspect", "--format", "{{.Config.Image}}", container_id],
            capture=True,
        )
        if actual != image:
            raise DeploymentBlocked(
                f"{service} image differs from the production release file (manual reconciliation required)"
            )


def check_backup() -> None:
    backup_dir = ROOT / "backups"
    if backup_dir.is_symlink() or not backup_dir.is_dir():
        raise DeploymentBlocked("production backup directory missing or unsafe")
    threshold = dt.datetime.now(dt.timezone.utc).timestamp() - 26 * 3600
    fresh = [
        p for p in backup_dir.iterdir()
        if BACKUP_NAME.fullmatch(p.name)
        and p.is_file() and not p.is_symlink()
        and p.stat().st_mtime >= threshold and p.stat().st_size > 0
    ]
    if not fresh:
        raise DeploymentBlocked("no recent local database backup (26-hour max age)")
    latest = max(fresh, key=lambda p: p.stat().st_mtime)
    # Read the full gzip stream; detect an incomplete local backup.
    with gzip.open(latest, "rb") as stream:
        while stream.read(1024 * 1024):
            pass


def check_main_advance(current_sha: str, candidate_sha: str) -> None:
    if current_sha == candidate_sha:
        return
    data = github_json(f"/repos/{REPOSITORY}/compare/{current_sha}...{candidate_sha}")
    if not isinstance(data, dict) or data.get("status") != "ahead" or data.get("behind_by") != 0:
        raise DeploymentBlocked("candidate is not a strict forward descendant of current main release")


def latest_candidate(current_sha: str) -> dict[str, Any]:
    candidate = discover_release(
        fetch=lambda path: github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    )
    target = require_sha(candidate["sourceSha"])
    check_main_advance(current_sha, target)
    for name in IMAGE_NAMES:
        image = candidate["images"][name]
        if image.get("ref") != f"ghcr.io/sanqin888/{name}:{target}":
            raise DeploymentBlocked("release image reference mismatch")
        checked_digest(image.get("digest"))
    return candidate


def preflight_current(current: str) -> None:
    check_running_images(current)
    compose(current, "config", "--quiet")
    # The existing helper is authoritative for current DB migration parity and
    # local/public API/Web readiness. It is read-only with respect to Prisma.
    run(["bash", str(ROOT / "ops/verify-runtime-readiness.sh"), str(ENV), "https://sanq.ca"], target_sha=current)
    check_backup()


def verify_local_image(ref: str, expected_digest: str) -> None:
    checked_digest(expected_digest)
    output = run(
        ["docker", "image", "inspect", "--format", "{{json .RepoDigests}}", ref],
        capture=True,
    )
    digests = json.loads(output)
    if not isinstance(digests, list):
        raise DeploymentBlocked("unexpected local Docker image digest listing")
    repo = ref.split(":")[0]
    if f"{repo}@{expected_digest}" not in digests:
        raise DeploymentBlocked("pulled image digest differs from sealed GHCR manifest")


def pull_and_verify(candidate: dict[str, Any]) -> None:
    for name in IMAGE_NAMES:
        image = candidate["images"][name]
        run(["docker", "pull", image["ref"]])
        verify_local_image(image["ref"], image["digest"])


def candidate_migration_status(target_sha: str) -> None:
    # Pure Prisma migrate status. NEVER prisma migrate deploy/reset/db push.
    compose(
        target_sha, "run", "--rm", "--no-deps", "-T", "api",
        "sh", "-lc",
        "cd /app/apps/api && npx prisma migrate status --schema=prisma/schema.prisma",
    )


def promote_images(target_sha: str) -> None:
    # Never run 'up' without a service list: DB must not be recreated.
    compose(target_sha, "up", "-d", "--no-build", "--no-deps", *APP_SERVICES)


def verify_after_switch(target_sha: str) -> None:
    check_running_images(target_sha)
    run(["bash", str(ROOT / "ops/verify-runtime-readiness.sh"), str(ENV), "https://sanq.ca"], target_sha=target_sha)


def deploy(*, execute: bool) -> None:
    ensure_repo_location()
    current = read_current_sha()
    state = read_state()
    if state and state["phase"] == "pending":
        raise DeploymentBlocked("unresolved pending deployment; review/rollback before continuing")
    if state and state["current"] != current:
        raise DeploymentBlocked("release state and production .env disagree")
    candidate = latest_candidate(current)
    target = candidate["sourceSha"]
    print(json.dumps({
        "action": "deploy" if execute else "plan",
        "currentSha": current,
        "candidateSha": target,
        "publishRun": candidate["publicationUrl"],
        "wouldRecreate": list(APP_SERVICES) if execute and target != current else [],
    }, indent=2), flush=True)
    if not execute:
        return
    if target == current:
        print("Already at the newest sealed release; no changes made.")
        return
    preflight_current(current)
    pull_and_verify(candidate)
    candidate_migration_status(target)
    # Durable pending record comes before any mutable production change.
    write_state("pending", current=target, previous=current, reason="rollout-start")
    update_env_sha(target)
    try:
        promote_images(target)
        verify_after_switch(target)
    except Exception as exc:
        raise DeploymentBlocked(
            "release activation incomplete: PENDING incident recorded; "
            "automatic rollback intentionally disabled. Inspect health and use "
            "explicit 'rollback --execute' after reviewing data compatibility."
        ) from exc
    write_state("active", current=target, previous=current, reason="readiness-verified")
    print(f"Release ACTIVE: {target}")


def rollback(*, execute: bool) -> None:
    ensure_repo_location()
    current = read_current_sha()
    state = read_state()
    if state is None:
        raise DeploymentBlocked("no recorded previous release for rollback")
    if state["current"] != current:
        raise DeploymentBlocked("release .env and state disagree; manual reconciliation required")
    if state["phase"] not in ("active", "pending"):
        raise DeploymentBlocked("no eligible active/pending deployment for rollback")
    previous = require_sha(state["previous"])
    if previous == current:
        raise DeploymentBlocked("previous and current SHA are identical")
    print(json.dumps({"action": "rollback" if execute else "rollback-plan", "from": current, "to": previous}, indent=2))
    if not execute:
        return
    # Rollback is a separately authorized operator action, not an automatic
    # reaction to health failure. An unhealthy current release must NOT block
    # an operator-authorized rollback; protect backup and migration parity.
    check_backup()
    for name in IMAGE_NAMES:
        ref = f"ghcr.io/sanqin888/{name}:{previous}"
        run(["docker", "image", "inspect", ref], capture=True)
    candidate_migration_status(previous)
    write_state("pending", current=previous, previous=current, reason="rollback-start")
    update_env_sha(previous)
    try:
        promote_images(previous)
        verify_after_switch(previous)
    except Exception as exc:
        raise DeploymentBlocked("rollback incomplete: PENDING incident requires manual review") from exc
    write_state("rolled-back", current=previous, previous=current, reason="rollback-verified")
    print(f"Rollback VERIFIED: {previous}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "deploy", "rollback"))
    parser.add_argument(
        "--execute", action="store_true",
        help="Required to mutate production; absent for read-only plan.",
    )
    args = parser.parse_args()
    if args.command == "plan" and args.execute:
        parser.error("plan is read-only and never accepts --execute")
    try:
        if args.command == "rollback":
            rollback(execute=args.execute)
        else:
            deploy(execute=args.command == "deploy" and args.execute)
    except (
        DeploymentBlocked, ReleaseContractError, OSError, ValueError,
        KeyError, subprocess.SubprocessError,
    ) as exc:
        # Do not print full subprocess output or environment/credential material.
        print(f"SanQ release blocked: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
