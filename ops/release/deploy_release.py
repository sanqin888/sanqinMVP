#!/usr/bin/env python3
"""SanQ Batch B: operator-triggered, fail-closed release deployment.

Skips migrations when not needed; reviewed pending SQL requires --apply-migrations.
Never generates migrations, builds images, recreates db or prunes volumes.
No unattended daemon/watch mode. Deploy/rollback require --execute.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import pwd
import re
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from release_contract import (
    REPOSITORY, ReleaseContractError, checked_digest,
    discover_release, github_json, require_sha,
)

# C4-B fixed host layout. Do NOT infer the active runtime from the checked-out
# source code; a source checkout is retained separately through C5.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtime"))
from build_bundle import SOURCE_FILES  # noqa: E402

ROOT = Path("/opt/sanq/runtime")
BACKUP_DIR = Path("/srv/sanq/backups")
UPLOADS_DIR = Path("/srv/sanq/uploads")
ENV = ROOT / ".env"
COMPOSE = ROOT / "docker-compose.yml"
STATE = ROOT / ".sanq-release-state.json"
RUNTIME_MANIFEST = ROOT / "runtime-release.json"
ACTIVATION_MARKER = ROOT / ".sanq-backup-layout-activated"
MARKER_CONTENT = "SANQ_BACKUP_LAYOUT_C4_V1"
EXPECTED_PROJECT = "sanq-app"
EXPECTED_DB_VOLUME = "sanq-app_pgdata"
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
    original = path.stat() if path.exists() else None
    mode = stat.S_IMODE(original.st_mode) if original else 0o600
    fd, tmp_name = tempfile.mkstemp(prefix=".sanq-release-tmp-", dir=str(path.parent))
    try:
        # The target Runtime directory remains root-owned; this controller is
        # operator-executed as root for atomic state/config updates only. Keep
        # the .env original ubuntu ownership so the unprivileged backup works.
        if original is not None and os.geteuid() == 0:
            os.fchown(fd, original.st_uid, original.st_gid)
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


def run(
    args: list[str], *, target_sha: str | None = None,
    capture: bool = False, cwd: Path | None = None
) -> str:
    """Execute fixed operations only; no shell or user-supplied command."""
    environment = os.environ.copy()
    if target_sha is not None:
        environment["SANQ_IMAGE_SHA"] = require_sha(target_sha)
    result = subprocess.run(
        args,
        cwd=cwd or ROOT,
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


def _trusted_dir(path: Path, *, owner: int = 0, private: bool = False) -> None:
    if path.is_symlink() or not path.is_dir():
        raise DeploymentBlocked(f"missing or symlinked directory: {path}")
    info = path.stat()
    forbidden = 0o077 if private else 0o022
    if info.st_uid != owner or (stat.S_IMODE(info.st_mode) & forbidden):
        raise DeploymentBlocked(f"untrusted directory owner/mode: {path}")


def require_c4_activation() -> None:
    require_safe_file(ACTIVATION_MARKER)
    info = ACTIVATION_MARKER.stat()
    if info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o022:
        raise DeploymentBlocked("C4 activation marker owner/mode mismatch")
    if ACTIVATION_MARKER.read_text(encoding="utf-8").strip() != MARKER_CONTENT:
        raise DeploymentBlocked("C4 activation marker content mismatch")


def runtime_manifest() -> dict[str, Any]:
    """Validate the installed Runtime independently of application image SHA."""
    require_safe_file(RUNTIME_MANIFEST)
    if RUNTIME_MANIFEST.stat().st_size > 16384:
        raise DeploymentBlocked("runtime release manifest is oversized")
    manifest = json.loads(RUNTIME_MANIFEST.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1:
        raise DeploymentBlocked("runtime manifest schema invalid")
    sha = require_sha(manifest.get("sourceSha", ""))
    if (manifest.get("sourceBranch") != "main" or
        manifest.get("productionActivationAuthorized") is not False):
        raise DeploymentBlocked("runtime manifest has invalid source/activation authority")
    files = manifest.get("files")
    if not isinstance(files, dict) or set(files) != set(SOURCE_FILES):
        raise DeploymentBlocked("runtime files differ from pinned release allowlist")

    # Trust only a previously operator-installed, root-owned manifest and
    # matching fixed Runtime member bytes; never execute Git on the VM.
    if (RUNTIME_MANIFEST.stat().st_uid != 0
        or stat.S_IMODE(RUNTIME_MANIFEST.stat().st_mode) & 0o022):
        raise DeploymentBlocked("Runtime manifest must be root-owned and not writable by others")
    for name in SOURCE_FILES:
        active = ROOT
        for component in Path(name).parts:
            active = active / component
            if active.is_symlink():
                raise DeploymentBlocked(f"symlink in Runtime source: {name}")
        require_safe_file(active)
        info = active.stat()
        if (info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o022
            or info.st_size > 2 * 1024 * 1024):
            raise DeploymentBlocked(f"untrusted Runtime member: {name}")
        data = active.read_bytes()
        proof = files[name]
        if (not isinstance(proof, dict)
            or proof.get("sha256") != hashlib.sha256(data).hexdigest()
            or type(proof.get("bytes")) is not int
            or proof["bytes"] != len(data)):
            raise DeploymentBlocked(f"runtime file checksum mismatch: {name}")
    return manifest


def verify_runtime_release(candidate: dict[str, Any]) -> None:
    manifest = runtime_manifest()
    runtime_sha = require_sha(manifest["sourceSha"])
    target_sha = require_sha(candidate["sourceSha"])
    # Validate the installed Runtime's own historical image-pair binding.
    # Candidate images have separately verified GHCR publication/digests.
    expected = manifest.get("applicationImages")
    if not isinstance(expected, dict) or set(expected) != set(IMAGE_NAMES):
        raise DeploymentBlocked("Runtime manifest must declare both images")
    for name in IMAGE_NAMES:
        pair = expected[name]
        if (not isinstance(pair, dict)
            or pair.get("ref") != f"ghcr.io/sanqin888/{name}:{runtime_sha}"):
            raise DeploymentBlocked("invalid installed Runtime image reference")
        checked_digest(pair.get("digest"))
    if runtime_sha == target_sha:
        return
    # No guessed compatibility ranges: unchanged Runtime source members on
    # the first-parent release interval are the concrete compatibility gate.
    comparison = github_json(f"/repos/{REPOSITORY}/compare/{runtime_sha}...{target_sha}")
    if (not isinstance(comparison, dict)
        or comparison.get("status") != "ahead"
        or comparison.get("behind_by") != 0
        or type(comparison.get("total_commits")) is not int
        or not 0 < comparison["total_commits"] <= 250):
        raise DeploymentBlocked("Runtime base is not a bounded ancestor of the application")
    changed = comparison.get("files")
    if not isinstance(changed, list) or len(changed) >= 300:
        raise DeploymentBlocked("Runtime compatibility diff unavailable or truncated")
    for entry in changed:
        if not isinstance(entry, dict) or not isinstance(entry.get("filename"), str):
            raise DeploymentBlocked("invalid Runtime compatibility diff entry")
        # Treat a rename's old name as a change too.
        names = {entry["filename"]}
        if entry.get("status") == "renamed":
            old = entry.get("previous_filename")
            if not isinstance(old, str):
                raise DeploymentBlocked("invalid Runtime member rename")
            names.add(old)
        if names.intersection(SOURCE_FILES):
            raise DeploymentBlocked("target changed Runtime files; separate Runtime update required")


def ensure_repo_location() -> None:
    """Legacy function name retained for tests; verify only fixed C4 roots."""
    if Path.cwd() != ROOT or Path.cwd().is_symlink():
        raise DeploymentBlocked("run from exact /opt/sanq/runtime, not source checkout")
    for path in (Path("/opt"), Path("/opt/sanq"), ROOT, Path("/srv"), Path("/srv/sanq")):
        _trusted_dir(path)
    _trusted_dir(BACKUP_DIR, owner=pwd.getpwnam("ubuntu").pw_uid, private=True)
    if UPLOADS_DIR.is_symlink() or not UPLOADS_DIR.is_dir():
        raise DeploymentBlocked("C4 uploads directory is missing or symlinked")
    if stat.S_IMODE(UPLOADS_DIR.stat().st_mode) & 0o022:
        raise DeploymentBlocked("C4 uploads directory group/world-writable")
    for path in (COMPOSE, ENV, ROOT / "ops/verify-runtime-readiness.sh"):
        require_safe_file(path)
    if (ENV.stat().st_uid != pwd.getpwnam("ubuntu").pw_uid
        or stat.S_IMODE(ENV.stat().st_mode) & 0o077):
        raise DeploymentBlocked("runtime .env must be ubuntu-owned with no group/world access")
    require_c4_activation()
    source = COMPOSE.read_text(encoding="utf-8")
    if (source.count("/srv/sanq/uploads:/app/uploads") != 2
        or "./uploads:/app/uploads" in source
        or "pgdata:/var/lib/postgresql/data" not in source
        or "name: sanq-app" not in source):
        raise DeploymentBlocked("unexpected Runtime Compose project/DB/uploads contract")
    runtime_manifest()


def require_mutation_privilege() -> None:
    # The C3-B root-owned Runtime directory forbids unprivileged atomic
    # .env/state replacement; only a separately authorized root operator can
    # perform the actual release. No sudo or privileged helper is invoked.
    if os.geteuid() != 0:
        raise DeploymentBlocked("release mutation requires an explicitly authorized root operator")


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


def check_live_storage(sha: str) -> None:
    """Verify actual container mounts, not just Compose source text.

    This is read-only. Never create a DB volume or silently accept a new one
    when the Compose working directory changes.
    """
    run(["docker", "volume", "inspect", EXPECTED_DB_VOLUME], capture=True)
    expected = {
        "db": ("volume", "/var/lib/postgresql/data", EXPECTED_DB_VOLUME),
        "api": ("bind", "/app/uploads", str(UPLOADS_DIR)),
        "ubereats-worker": ("bind", "/app/uploads", str(UPLOADS_DIR)),
    }
    for service, (mount_type, destination, identity) in expected.items():
        container = compose(sha, "ps", "-q", service, capture=True)
        if not container or len(container.splitlines()) != 1:
            raise DeploymentBlocked(f"cannot prove running {service} mount")
        mounts = json.loads(run(
            ["docker", "inspect", "--format", "{{json .Mounts}}", container],
            capture=True,
        ))
        if not isinstance(mounts, list):
            raise DeploymentBlocked(f"invalid live {service} mount evidence")
        matching = [
            mount for mount in mounts
            if isinstance(mount, dict)
            and mount.get("Type") == mount_type
            and mount.get("Destination") == destination
            and mount.get("Name" if mount_type == "volume" else "Source") == identity
        ]
        if len(matching) != 1:
            raise DeploymentBlocked(f"{service} persistent mount identity mismatch")


def check_backup() -> None:
    _trusted_dir(BACKUP_DIR, owner=pwd.getpwnam("ubuntu").pw_uid, private=True)
    threshold = dt.datetime.now(dt.timezone.utc).timestamp() - 26 * 3600
    fresh = [
        p for p in BACKUP_DIR.iterdir()
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
    check_live_storage(current)
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


def candidate_migration_status(target_sha: str) -> bool:
    """Return True only for Prisma's pending-migrations status.

    Reject ambiguous failures, drift, and failed migration histories.
    """
    args = [
        "docker", "compose", "--project-name", EXPECTED_PROJECT,
        "--project-directory", str(ROOT), "--env-file", str(ENV),
        "-f", str(COMPOSE), "run", "--rm", "--no-deps", "-T", "api",
        "sh", "-lc",
        "cd /app/apps/api && npx prisma migrate status --schema=prisma/schema.prisma",
    ]
    env = os.environ.copy()
    env["SANQ_IMAGE_SHA"] = require_sha(target_sha)
    result = subprocess.run(args, cwd=ROOT, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            check=False)
    if result.returncode == 0:
        return False
    output = result.stdout + "\n" + result.stderr
    pending = "Following migration(s) have not yet been applied:" in output
    forbidden = ("failed", "diverged", "modified", "does not match",
                 "migration history", "error:", "could not")
    if not pending or any(term in output.lower() for term in forbidden):
        raise DeploymentBlocked("candidate migration status is not cleanly pending")
    return True


def apply_reviewed_migrations(target_sha: str) -> None:
    """Operator-approved migration application, never schema generation."""
    compose(
        target_sha, "run", "--rm", "--no-deps", "-T", "api",
        "sh", "-lc",
        "cd /app/apps/api && npx prisma migrate deploy --schema=prisma/schema.prisma",
    )
    if candidate_migration_status(target_sha):
        raise DeploymentBlocked("candidate migrations remain pending after deploy")


def promote_images(target_sha: str) -> None:
    # Never run 'up' without a service list: DB must not be recreated.
    compose(target_sha, "up", "-d", "--no-build", "--no-deps", *APP_SERVICES)


def wait_for_app_health(target_sha: str, *, timeout_seconds: int = 90) -> None:
    """Bounded startup gate before probing HTTP; never treats 'starting' as failure."""
    deadline = time.monotonic() + timeout_seconds
    while True:
        pending = []
        for service in APP_SERVICES:
            container_id = compose(target_sha, "ps", "-q", service, capture=True)
            if not container_id or len(container_id.splitlines()) != 1:
                raise DeploymentBlocked(f"missing or ambiguous {service} container during startup")
            state = json.loads(run([
                "docker", "inspect", "--format", "{{json .State}}", container_id,
            ], capture=True))
            if not isinstance(state, dict) or state.get("Status") != "running":
                raise DeploymentBlocked(f"{service} is not running after image promotion")
            health = state.get("Health")
            health_status = health.get("Status") if isinstance(health, dict) else None
            if health_status not in ("healthy", "starting", "unhealthy"):
                raise DeploymentBlocked(f"{service} health status is unavailable")
            if health_status != "healthy":
                pending.append(service)
        if not pending:
            return
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise DeploymentBlocked("application health startup timeout: " + ", ".join(pending))
        time.sleep(min(2, remaining))


def verify_after_switch(target_sha: str) -> None:
    check_running_images(target_sha)
    check_live_storage(target_sha)
    wait_for_app_health(target_sha)
    run(["bash", str(ROOT / "ops/verify-runtime-readiness.sh"), str(ENV), "https://sanq.ca"], target_sha=target_sha)


def deploy(*, execute: bool, apply_migrations: bool = False) -> None:
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
    require_mutation_privilege()
    verify_runtime_release(candidate)
    if target == current:
        print("Already at the newest sealed release; no changes made.")
        return
    preflight_current(current)
    pull_and_verify(candidate)
    pending_migrations = candidate_migration_status(target)
    if pending_migrations and not apply_migrations:
        raise DeploymentBlocked(
            "candidate has pending migrations; review SQL, compatibility, "
            "backup and maintenance window, then explicitly use --apply-migrations"
        )
    # Durable pending record comes before any mutable production change.
    write_state("pending", current=target, previous=current, reason="rollout-start")
    try:
        if pending_migrations:
            # Prevent old writers from running across a schema transition.
            # This is intentionally disruptive and requires maintenance approval.
            compose(current, "stop", *APP_SERVICES)
            apply_reviewed_migrations(target)
        update_env_sha(target)
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
    require_mutation_privilege()
    # Rollback is a separately authorized operator action, not an automatic
    # reaction to health failure. An unhealthy current release must NOT block
    # an operator-authorized rollback; protect backup and migration parity.
    check_backup()
    for name in IMAGE_NAMES:
        ref = f"ghcr.io/sanqin888/{name}:{previous}"
        run(["docker", "image", "inspect", ref], capture=True)
    if candidate_migration_status(previous):
        raise DeploymentBlocked("rollback image requires unapplied migrations; manual recovery required")
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
    parser.add_argument(
        "--apply-migrations", action="store_true",
        help="Operator authorizes already-reviewed pending migration SQL during deploy.",
    )
    args = parser.parse_args()
    if args.command == "plan" and args.execute:
        parser.error("plan is read-only and never accepts --execute")
    if args.apply_migrations and (args.command != "deploy" or not args.execute):
        parser.error("--apply-migrations requires deploy --execute")
    try:
        if args.command == "rollback":
            rollback(execute=args.execute)
        else:
            deploy(execute=args.command == "deploy" and args.execute,
                   apply_migrations=args.apply_migrations)
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
