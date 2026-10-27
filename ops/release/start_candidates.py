"""Task-connected start/readiness stage for registered no-migration candidates.

No CLI, environment mutation, SQL apply, ACTIVE, policy restore or maintenance
clear. Candidate startup can write business data even while PENDING is retained.
"""

from __future__ import annotations

import hashlib
import os
import time

import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import maintenance_guard as guard
import release_contract as release
import release_job as job


def _pending_and_config(original, controller, run):
    controller.ensure_repo_location()
    owner = controller.pwd.getpwnam("ubuntu").pw_uid
    env = collector._private_bytes(controller.ENV, owner)
    state = collector._json(collector._private_bytes(controller.STATE, 0).decode("utf-8"))
    candidate = original["candidate"]
    guard._need(type(state) is dict and set(state) == {"schemaVersion", "phase", "current",
                "previous", "reason", "updatedAt"} and type(state["schemaVersion"]) is int
                and state["schemaVersion"] == 1, "pending state schema differs")
    guard._need(state.get("phase") == "pending" and state.get("current") == candidate["sourceSha"]
                and state.get("previous") == original["current"]["applicationSha"]
                and state.get("reason") == "candidate-create-start"
                and controller.current_sha_from_text(env.decode("utf-8")) ==
                original["current"]["applicationSha"], "pending release or environment differs")
    manifest = collector._private_bytes(controller.RUNTIME_MANIFEST, 0, private=False)
    guard._need(hashlib.sha256(manifest).hexdigest() == original["current"]["manifestSha256"],
                "installed manifest changed")
    installed = {name: collector._private_bytes(controller.ROOT / name, 0, private=False)
                 for name in plan.RUNTIME_FILES}
    config, environment = collector._configuration(controller, env, run)
    guard._need(config == original["current"]["configurationSha256"]
                and environment == original["environment"]
                and plan.runtime_contract(installed, installed) == original["runtimeContract"],
                "start configuration or runtime contract changed")
    expanded = collector._json(run(collector._compose(controller, "config", "--format", "json")))
    guard._need(hashlib.sha256(env + b"\0rendered-compose\0" + plan._canonical(expanded)).hexdigest()
                == config, "configuration changed during start preparation")
    return expanded


def _running(record, expanded, run, *, policies=None):
    healthy = True
    candidate = record["candidate"]
    for service in guard.SERVICES:
        row = candidate["containers"][service]
        old = record["originalContainers"][service]
        identifiers = guard._role_ids(service, run)
        guard._need(row["containerId"] in identifiers
                    and identifiers <= {row["containerId"], old["containerId"]},
                    "candidate identity changed during startup")
        if old["containerId"] in identifiers:
            guard._stopped_identity(guard._inspect(old["containerId"], service,
                record["observedApplicationSha"], run), old)
        name = "sanq-web" if service == "web" else "sanq-api"
        image = candidate["release"]["images"][name]
        info = guard._inspect(row["containerId"], service, candidate["release"]["sourceSha"],
                              run, reference=collector._pinned(image))
        state = info["State"]
        guard._need(info["Image"] == row["imageId"] and state.get("Status") == "running"
                    and state.get("Running") is True and state.get("Restarting") is False
                    and state.get("Paused") is False
                    and info["HostConfig"]["RestartPolicy"] ==
                    ({"Name": "no", "MaximumRetryCount": 0} if policies is None else policies[service]),
                    "candidate running state or restart inhibition differs")
        health = state.get("Health")
        guard._need(type(health) is dict and health.get("Status") in ("starting", "healthy"),
                    "candidate health is missing or unhealthy")
        healthy = healthy and health["Status"] == "healthy"
        guard._created_mounts(row["containerId"], expanded["services"][service].get("volumes", []), run)
    return healthy


def start_and_verify(identity: str, attempt: str, *, controller=None,
                     run=collector.command, fetch=None, now=collector.now_utc,
                     clock=time.monotonic, pause=time.sleep) -> dict:
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(guard.MAINTENANCE_DIR) as root:
        return _start_and_verify_locked(root, jobs_root, identity, attempt, controller=controller, run=run, fetch=fetch, now=now, clock=clock, pause=pause)


def _start_and_verify_locked(root: int, jobs_root: int, identity: str, attempt: str, *, controller=None,
                     run=collector.command, fetch=None, now=collector.now_utc,
                     clock=time.monotonic, pause=time.sleep) -> dict:
    """Internal stage; successful READY remains PENDING and in maintenance."""
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    def bounded(args, **kwargs):
        kwargs["timeout"] = min(kwargs.get("timeout", 15), 45)
        return run(args, **kwargs)
    job._no_pending(jobs_root)
    guard._need(set(os.listdir(root)) == {guard.MARKER}, "unresolved maintenance leftovers")
    record = guard._read(root)
    guard._need(record["planId"] == identity and record["attemptId"] == attempt
                and record["phase"] == "CANDIDATES_REGISTERED", "start attempt or phase differs")
    raw = storage.load_plan(identity)
    original = plan.validate_plan(raw, identity)
    guard._need(not original["pendingMigrations"]
                and record["observedApplicationSha"] == original["current"]["applicationSha"]
                and record["candidate"]["release"] == original["candidate"],
                "SQL path is unavailable or candidate proof differs")
    plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now),
                                  **job._observations(original))
    guard._installed_gate(bounded)
    expanded = _pending_and_config(original, controller, bounded)
    guard._need(collector._backup(controller) == original["backup"]
                and collector._history(controller, bounded) == original["migrationHistory"]
                and release.verify_exact_candidate(original["current"]["applicationSha"],
                    original["candidate"]["sourceSha"], fetch) == original["candidate"],
                "backup, SQL history or candidate proof changed")
    collector._resource_preflight(controller)
    guard._assert_registered_stopped(record, bounded)
    for service, row in record["candidate"]["containers"].items():
        name = "sanq-web" if service == "web" else "sanq-api"
        image = record["candidate"]["release"]["images"][name]
        info = guard._inspect(row["containerId"], service, original["candidate"]["sourceSha"],
                               bounded, reference=collector._pinned(image))
        guard._need(info["State"].get("Status") == "created", "candidate was already started")
        collector._inspect_image(row["imageId"], collector._pinned(image),
                                 original["candidate"]["sourceSha"], bounded)
        guard._created_mounts(row["containerId"], expanded["services"][service].get("volumes", []), bounded)
    database = guard._database_identity(controller, bounded)
    backup_units = guard._backup(bounded)
    guard._need(backup_units == record["backupUnits"], "backup units changed")
    starting = {**record, "phase": "STARTING_CANDIDATES", "updatedAt": job._timestamp(now)}
    guard._write(root, starting)  # Unknown durability never reaches docker start.
    try:
        for service in guard.SERVICES:
            run(["docker", "start", record["candidate"]["containers"][service]["containerId"]], timeout=30)
        deadline = clock() + 90
        def health_command(args, **kwargs):
            remaining = deadline - clock()
            guard._need(remaining > 0, "candidate startup health timeout")
            kwargs["timeout"] = min(kwargs.get("timeout", 15), remaining)
            return run(args, **kwargs)
        while True:
            guard._need(clock() < deadline, "candidate startup health timeout")
            healthy = _running(record, expanded, health_command)
            remaining = deadline - clock()
            guard._need(remaining >= 0, "candidate startup health timeout")
            if healthy:
                break
            guard._need(remaining > 0, "candidate startup health timeout")
            pause(min(2, remaining))
        run(["bash", str(controller.ROOT / "ops/verify-runtime-readiness.sh"),
             str(controller.ENV), "https://sanq.ca"], timeout=300)
        guard._need(_running(record, expanded, bounded)
                    and guard._database_identity(controller, bounded) == database
                    and guard._backup(bounded) == backup_units
                    and collector._history(controller, bounded) == original["migrationHistory"],
                    "post-readiness baseline changed")
        _pending_and_config(original, controller, bounded)
        guard._installed_gate(bounded)
    except BaseException as error:
        guard._incident_locked(root, identity, controller, bounded, now)
        raise release.ReleaseContractError("candidate start/readiness failed; retained PENDING and incident") from error
    ready = {**starting, "phase": "CANDIDATES_READY", "updatedAt": job._timestamp(now)}
    try:
        guard._write(root, ready)
    except BaseException as error:
        # Do not rewrite an unknown final record. Stop only previously saved IDs.
        guard._stop_best_effort(record, bounded)
        raise release.ReleaseContractError("readiness record durability unknown; inspect retained evidence") from error
    return {"planId": identity, "attemptId": attempt, "outcome": "CANDIDATES_READY",
            "canExecute": False}
