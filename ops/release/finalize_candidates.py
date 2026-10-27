"""Unwired success handoff for ready no-migration candidates.

The original release state remains the sole version authority. No CLI, SQL,
automatic replay, rollback, timer change or recovery/unfreeze entry is exposed.
"""

from __future__ import annotations

import copy
import hashlib
import os
import stat

import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import maintenance_guard as guard
import release_contract as release
import release_job as job
import start_candidates as starter


def _sync_runtime(controller, member):
    guard._need(member in ("env", "state"), "unknown durable runtime member")
    path = controller.ENV if member == "env" else controller.STATE
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        guard._need(stat.S_ISREG(os.fstat(fd).st_mode), "runtime member is not regular")
        os.fsync(fd)  # Include the existing atomic writer\'s final chmod/ownership metadata.
    finally:
        os.close(fd)
    fd = os.open(controller.ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _state(controller):
    value = collector._json(collector._private_bytes(controller.STATE, 0).decode("utf-8"))
    guard._need(type(value) is dict and set(value) == {"schemaVersion", "phase", "current",
                "previous", "reason", "updatedAt"} and type(value["schemaVersion"]) is int
                and value["schemaVersion"] == 1, "release state schema differs")
    return value


def _active(original, controller):
    state = _state(controller)
    guard._need(state["phase"] == "active" and state["current"] == original["candidate"]["sourceSha"]
                and state["previous"] == original["current"]["applicationSha"]
                and state["reason"] == "readiness-verified", "active release differs")


def _env_metadata(controller):
    info = controller.ENV.lstat()
    return info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)



def _write_env_exact(old_env, expected_env, metadata, controller):
    guard._need(collector._private_bytes(controller.ENV, metadata[0]) == old_env
                and _env_metadata(controller) == metadata, "environment changed before replacement")
    controller.atomic_write(controller.ENV, expected_env.decode("utf-8"))


def _target_binding(original, expected_env, expected_expanded, metadata, controller, run):
    controller.ensure_repo_location()
    env = collector._private_bytes(controller.ENV, metadata[0])
    guard._need(env == expected_env and _env_metadata(controller) == metadata,
                "target environment content or ownership differs")
    manifest = collector._private_bytes(controller.RUNTIME_MANIFEST, 0, private=False)
    installed = {name: collector._private_bytes(controller.ROOT / name, 0, private=False)
                 for name in plan.RUNTIME_FILES}
    guard._need(hashlib.sha256(manifest).hexdigest() == original["current"]["manifestSha256"]
                and plan.runtime_contract(installed, installed) == original["runtimeContract"],
                "installed runtime changed during handoff")
    expanded = collector._json(run(collector._compose(controller, "config", "--format", "json")))
    guard._need(expanded == expected_expanded, "target rendered configuration differs")
    return expanded


def _policy_argument(policy):
    guard._policy(policy)
    return policy["Name"] + (":" + str(policy["MaximumRetryCount"])
                              if policy["Name"] == "on-failure" else "")


def _clear_committed(root, identity, attempt):
    """Only called inline after durable ACTIVE, policy readbacks and committed marker."""
    record = guard._read(root)
    guard._need(record["phase"] == "HANDOFF_COMMITTED" and record["planId"] == identity
                and record["attemptId"] == attempt and set(os.listdir(root)) == {guard.MARKER},
                "committed maintenance identity differs")
    os.unlink(guard.MARKER, dir_fd=root)
    os.fsync(root)
    guard._need(not os.listdir(root), "maintenance clear readback differs")


def finalize_ready(identity: str, attempt: str, *, controller=None,
                   run=collector.command, fetch=None, now=collector.now_utc) -> dict:
    """Internal success-only stage. Never resumes FINALIZING/INCIDENT/COMMITTED."""
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    def bounded(args, **kwargs):
        kwargs["timeout"] = min(kwargs.get("timeout", 15), 45)
        return run(args, **kwargs)
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(guard.MAINTENANCE_DIR) as root:
        job._no_pending(jobs_root)
        guard._need(set(os.listdir(root)) == {guard.MARKER}, "unresolved maintenance leftovers")
        record = guard._read(root)
        guard._need(record["planId"] == identity and record["attemptId"] == attempt
                    and record["phase"] == "CANDIDATES_READY", "handoff requires the same ready attempt")
        raw = storage.load_plan(identity)
        original = plan.validate_plan(raw, identity)
        guard._need(not original["pendingMigrations"]
                    and record["observedApplicationSha"] == original["current"]["applicationSha"]
                    and record["candidate"]["release"] == original["candidate"],
                    "SQL path unavailable or handoff plan differs")
        plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now),
                                      **job._observations(original))
        guard._installed_gate(bounded)
        expanded = starter._pending_and_config(original, controller, bounded)
        guard._need(collector._backup(controller) == original["backup"]
                    and collector._history(controller, bounded) == original["migrationHistory"]
                    and release.verify_exact_candidate(original["current"]["applicationSha"],
                        original["candidate"]["sourceSha"], fetch) == original["candidate"]
                    and starter._running(record, expanded, bounded), "ready observations changed")
        database, units = guard._database_identity(controller, bounded), guard._backup(bounded)
        guard._need(units == record["backupUnits"], "backup units changed")
        owner = controller.pwd.getpwnam("ubuntu").pw_uid
        old_env = collector._private_bytes(controller.ENV, owner)
        metadata = _env_metadata(controller)
        # Bind the exact old bytes/render immediately before changing only its SHA line.
        guard._need(hashlib.sha256(old_env + b"\0rendered-compose\0" +
                    plan._canonical(expanded)).hexdigest() == original["current"]["configurationSha256"],
                    "environment changed before handoff")
        changed, count = controller.RELEASE_LINE.subn(
            lambda match: "SANQ_IMAGE_SHA=" + original["candidate"]["sourceSha"] +
            ("\r" if match.group(0).endswith("\r") else ""), old_env.decode("utf-8"))
        guard._need(count == 1, "ambiguous handoff environment")
        expected_env, expected_expanded = changed.encode("utf-8"), copy.deepcopy(expanded)
        for service in guard.SERVICES:
            name = "sanq-web" if service == "web" else "sanq-api"
            expected_expanded["services"][service]["image"] = original["candidate"]["images"][name]["ref"]
        finalizing = {**record, "phase": "FINALIZING", "updatedAt": job._timestamp(now)}
        guard._write(root, finalizing)  # Unknown intention never mutates env/state/policy.
        sealing = False
        try:
            _write_env_exact(old_env, expected_env, metadata, controller)
            _sync_runtime(controller, "env")
            _target_binding(original, expected_env, expected_expanded, metadata, controller, bounded)
            run(["bash", str(controller.ROOT / "ops/verify-runtime-readiness.sh"),
                 str(controller.ENV), "https://sanq.ca"], timeout=300)
            pending = _state(controller)
            guard._need(pending["phase"] == "pending"
                        and pending["current"] == original["candidate"]["sourceSha"]
                        and pending["previous"] == original["current"]["applicationSha"]
                        and pending["reason"] == "candidate-create-start"
                        and starter._running(record, expected_expanded, bounded)
                        and guard._database_identity(controller, bounded) == database
                        and collector._history(controller, bounded) == original["migrationHistory"],
                        "pre-commit observations changed")
            controller.write_state("active", current=original["candidate"]["sourceSha"],
                                   previous=original["current"]["applicationSha"], reason="readiness-verified")
            _sync_runtime(controller, "state")
            _active(original, controller)  # Never infer a lost ACTIVE write succeeded.
            policies = {service: record["originalContainers"][service]["restartPolicy"]
                        for service in guard.SERVICES}
            for service in guard.SERVICES:
                row = record["candidate"]["containers"][service]
                run(["docker", "update", "--restart=" + _policy_argument(policies[service]),
                     row["containerId"]], timeout=30)
            guard._need(starter._running(record, expected_expanded, bounded, policies=policies)
                        and guard._database_identity(controller, bounded) == database
                        and guard._backup(bounded) == units, "policy or final resource readback differs")
            _target_binding(original, expected_env, expected_expanded, metadata, controller, bounded)
            _active(original, controller)
            guard._installed_gate(bounded)
            committed = {**finalizing, "phase": "HANDOFF_COMMITTED", "updatedAt": job._timestamp(now)}
            sealing = True
            guard._write(root, committed)
        except BaseException as error:
            if sealing:
                guard._stop_best_effort(record, bounded)
                raise release.ReleaseContractError("handoff record durability unknown; inspect retained evidence") from error
            guard._incident_locked(root, identity, controller, bounded, now)
            raise release.ReleaseContractError("handoff incomplete; inspect actual release state and retained incident") from error
        # Terminal boundary: all version/config/policy checks above are durably committed.
        # A clear/fsync failure may leave a valid published release and no marker.
        try:
            _clear_committed(root, identity, attempt)
        except BaseException as error:
            raise release.ReleaseContractError(
                "release committed; maintenance clear outcome unknown; do not replay or roll back") from error
        return {"planId": identity, "attemptId": attempt, "outcome": "ACTIVE",
                "currentSha": original["candidate"]["sourceSha"], "canExecute": False}
