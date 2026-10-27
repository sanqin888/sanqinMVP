"""Uninstalled asynchronous release task for exact plans and reviewed SQL.

One locked task owns freeze through final handoff. SQL requires its independent
scope digest. Query evidence after unknown results; never replay or restore.
"""

from __future__ import annotations

import argparse
import inspect
import json
import os
import re
import time
from pathlib import Path

import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import maintenance_guard as guard
import release_job as job
import start_candidates as starter
import finalize_candidates as finalizer
from release_contract import ReleaseContractError, require_sha

TASK_SCRIPT = Path("/opt/sanq/runtime/ops/release/release_task.py")
RUNTIME_ROOT = Path("/opt/sanq/runtime")
UNIT_PREFIX = "sanq-release-apply-"
RUN_BUDGET_SECONDS = 1800
START_TIMEOUT_SECONDS = 2100
STOP_TIMEOUT_SECONDS = 900


def _need(condition: bool, reason: str) -> None:
    if not condition:
        raise ReleaseContractError(reason)


def _unit(identity: str) -> str:
    return UNIT_PREFIX + storage._plan_id(identity) + ".service"


def _installed() -> None:
    _need(Path(__file__) == TASK_SCRIPT, "task helper is not installed at its fixed path")
    collector._private_bytes(TASK_SCRIPT, storage.OWNER_UID, private=False)
    _need(callable(getattr(guard, "cleanup_after_task", None))
          and callable(getattr(guard, "begin_candidate_creation", None))
          and callable(getattr(guard, "register_created_candidates", None))
          and callable(getattr(guard, "prepare_candidate_containers", None))
          and callable(getattr(guard, "_incident_locked", None))
          and callable(getattr(guard, "_freeze_for_plan_locked", None))
          and callable(getattr(guard, "_prepare_candidate_containers_locked", None))
          and callable(getattr(guard, "_begin_migration_creation_locked", None))
          and callable(getattr(guard, "_register_created_migration_locked", None))
          and callable(getattr(guard.migration, "creation_config", None))
          and callable(getattr(guard.migration, "assert_completed", None))
          and callable(getattr(guard.migration, "assert_applied_history", None))
          and callable(getattr(guard.migration, "assert_application_history", None))
          and "pending_config" in inspect.signature(guard._prepare_candidate_containers_locked).parameters
          and "controller" in inspect.signature(guard._register_created_candidates_locked).parameters
          and callable(getattr(starter, "_start_and_verify_locked", None))
          and callable(getattr(finalizer, "_finalize_ready_locked", None))
          and callable(getattr(starter, "start_and_verify", None))
          and callable(getattr(finalizer, "finalize_ready", None))
          and "policies" in inspect.signature(starter._running).parameters
          and "input_bytes" in inspect.signature(collector.command).parameters
          and callable(getattr(storage, "check_maintenance_clear", None))
          and "wait_seconds" in inspect.signature(job._locked_directory).parameters,
          "installed helper APIs are incomplete; do not mix tool versions")


def _command(role: str, identity: str, approval=None) -> str:
    if approval is not None:
        plan._sha256(approval)
    return ("/usr/bin/python3 -B " + str(TASK_SCRIPT) + " " + role + " " + storage._plan_id(identity)
            + ("" if approval is None else " --approve-sql " + approval))


def _command_matches(value: str, expected: str) -> bool:
    return (value.count("argv[]=") == 1
            and re.search(re.escape("argv[]=" + expected) + r"\s*;\s*ignore_errors=no\b", value) is not None)


def _cgroup() -> str:
    with open("/proc/self/cgroup", encoding="ascii") as source:
        raw = source.read(65536)
    _need(len(raw) < 65536, "cgroup observation exceeds budget")
    rows = [line[3:] for line in raw.splitlines() if line.startswith("0::")]
    _need(len(rows) == 1, "task requires the reviewed unified cgroup layout")
    return rows[0]


def _context(identity: str, role: str, run, *, approval=None) -> None:
    """Observed manager PID/cgroup/commands bind a call, never caller booleans."""
    _installed()
    keys = ["LoadState", "Transient", "Type", "Restart", "RemainAfterExit", "KillMode",
            "ActiveState", "SubState", "MainPID", "ControlPID", "ControlGroup",
            "ExecStart", "ExecStopPost", "NeedDaemonReload", "DropInPaths", "FragmentPath",
            "WorkingDirectory", "User"]
    unit = _unit(identity)
    fields = guard._properties(unit, keys, run)
    _need(fields["LoadState"] == "loaded" and fields["Transient"] == "yes"
          and fields["Type"] == "oneshot" and fields["Restart"] == "no"
          and fields["RemainAfterExit"] == "yes" and fields["KillMode"] == "control-group"
          and fields["NeedDaemonReload"] == "no" and not fields["DropInPaths"]
          and fields["FragmentPath"] == "/run/systemd/transient/" + unit
          and fields["WorkingDirectory"] == str(RUNTIME_ROOT) and Path.cwd() == RUNTIME_ROOT
          and fields["User"] == "root",
          "unreviewed task unit properties")
    expected_group = "/system.slice/" + unit
    _need(fields["ControlGroup"] == expected_group == _cgroup(),
          "task is outside its manager cgroup")
    pid = str(os.getpid())
    if role == "run":
        _need(fields["ActiveState"] == "activating" and fields["SubState"] == "start"
              and pid in (fields["MainPID"], fields["ControlPID"]), "not the active task process")
    else:
        _need(role == "cleanup" and fields["ActiveState"] == "deactivating"
              and fields["SubState"] == "stop-post" and pid == fields["ControlPID"],
              "not the task stop-post process")
    _need(_command_matches(fields["ExecStart"], _command("run", identity, approval))
          and _command_matches(fields["ExecStopPost"], _command("cleanup", identity, approval)),
          "task executable arguments or failure handling differ")


def submit(identity: str, *, approval=None, run=collector.command, now=collector.now_utc) -> dict:
    job._root_operator()
    identity = storage._plan_id(identity)
    _installed()
    guard._installed_gate(run)
    # Release the inspection lock before queueing: the child acquires it itself.
    with job._locked_directory() as root:
        storage.check_maintenance_clear(guard.MAINTENANCE_DIR)
        job._no_pending(root)
        raw = storage.load_plan(identity)
        original = plan.validate_plan(raw, identity)
        plan.assert_sql_approval(raw, identity, approval)
        _need(original["candidate"]["sourceSha"] != original["current"]["applicationSha"],
              "target is already the current release")
        plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now),
                                      **job._observations(original))
    args = ["systemd-run", "--unit=" + _unit(identity), "--service-type=oneshot",
            "--remain-after-exit", "--no-block", "--slice=system.slice",
            "--property=User=root", "--property=Restart=no", "--property=KillMode=control-group",
            "--property=TimeoutStartSec=" + str(START_TIMEOUT_SECONDS),
            "--property=TimeoutStopSec=" + str(STOP_TIMEOUT_SECONDS),
            "--property=WorkingDirectory=" + str(RUNTIME_ROOT),
            "--property=MemoryMax=256M", "--property=CPUQuota=50%",
            "--property=ExecStopPost=" + _command("cleanup", identity, approval),
            "--", "/usr/bin/python3", "-B", str(TASK_SCRIPT), "run", identity]
    if approval is not None:
        args += ["--approve-sql", approval]
    # No wait/pty/pipe/scope/replace/collect; a duplicate or unknown result is not retried.
    run(args, timeout=30)
    return {"planId": identity, "unit": _unit(identity), "outcome": "SUBMITTED",
            "canExecute": False}


def run_task(identity: str, *, approval=None, run=collector.command, controller=None, fetch=None,
             observe=None, now=collector.now_utc, clock=time.monotonic, pause=time.sleep) -> dict:
    job._root_operator()
    identity = storage._plan_id(identity)
    _context(identity, "run", run, approval=approval)
    if controller is None:
        import deploy_release as controller
    _need(all(callable(getattr(controller, name, None)) for name in (
              "ensure_repo_location", "write_creation_pending", "atomic_write", "write_state",
              "current_sha_from_text"))
          and callable(getattr(getattr(controller, "RELEASE_LINE", None), "subn", None)),
          "installed controller APIs are incomplete; do not enter maintenance")
    if fetch is None:
        fetch = lambda path: guard.release.github_json(
            path, token=os.environ.get("GITHUB_TOKEN") or None)
    deadline = clock() + RUN_BUDGET_SECONDS
    def remaining():
        value = deadline - clock()
        _need(value > 0, "release task time budget exhausted; query retained evidence")
        return value
    def bounded(args, **kwargs):
        kwargs["timeout"] = min(kwargs.get("timeout", 60), remaining())
        return run(args, **kwargs)
    original_fetch = fetch
    def bounded_fetch(path):
        remaining()
        value = original_fetch(path)  # Fixed GitHub transport has its own 15s timeout.
        remaining()
        return value
    if observe is None:
        observe = lambda target, **kwargs: collector.collect(
            target, controller=controller, run=bounded, fetch=bounded_fetch, **kwargs)
    # One pair of original OS locks spans ALL stages, including stage handoffs.
    # Locked implementations are the same bodies used by individual adapters.
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(guard.MAINTENANCE_DIR) as root:
        job._no_pending(jobs_root)
        storage.check_maintenance_clear(guard.MAINTENANCE_DIR)
        raw = storage.load_plan(identity)
        original = plan.validate_plan(raw, identity)
        plan.assert_sql_approval(raw, identity, approval)
        _need(original["candidate"]["sourceSha"] != original["current"]["applicationSha"],
              "target is already the current release")
        remaining()
        frozen = guard._freeze_for_plan_locked(root, jobs_root, identity, controller=controller,
            run=bounded, observe=observe, fetch=bounded_fetch, now=now)
        _need(frozen["planId"] == identity and frozen["phase"] == "FROZEN"
              and frozen["canExecute"] is False, "freeze stage result differs")
        attempt = job._attempt(frozen["attemptId"])
        if original["pendingMigrations"]:
            for stage, outcome in (
                    (_prepare_migration_container_locked, "MIGRATION_CREATED_NOT_STARTED"),
                    (_execute_registered_migration_locked, "MIGRATION_VERIFIED")):
                remaining()
                kwargs = {"controller": controller, "run": bounded, "fetch": bounded_fetch, "now": now}
                if stage is _execute_registered_migration_locked:
                    kwargs["clock"] = clock
                result = stage(root, jobs_root, identity, attempt, approval, **kwargs)
                _need(result["planId"] == identity and result["attemptId"] == attempt
                      and result["outcome"] == outcome and result["canExecute"] is False,
                      "migration stage result differs")
            remaining()
            return _handoff_migrated_release_locked(root, jobs_root, identity, attempt, approval,
                controller=controller, run=bounded, fetch=bounded_fetch, now=now,
                clock=clock, pause=pause)
        for stage, outcome in (
                (guard._prepare_candidate_containers_locked, "CANDIDATES_CREATED_NOT_STARTED"),
                (starter._start_and_verify_locked, "CANDIDATES_READY")):
            remaining()
            kwargs = {"controller": controller, "run": bounded, "fetch": bounded_fetch, "now": now}
            if stage is starter._start_and_verify_locked:
                kwargs.update(clock=clock, pause=pause)
            result = stage(root, jobs_root, identity, attempt, **kwargs)
            _need(result["planId"] == identity and result["attemptId"] == attempt
                  and result["outcome"] == outcome and result["canExecute"] is False,
                  "release stage result differs")
        remaining()
        # No outer exception handler rewrites a stage's unknown durability or
        # retries final clear. ExecStopPost independently handles failure/SIGKILL.
        return finalizer._finalize_ready_locked(root, jobs_root, identity, attempt,
            controller=controller, run=bounded, fetch=bounded_fetch, now=now)



def cleanup_task(identity: str, *, approval=None, run=collector.command) -> dict:
    job._root_operator()
    identity = storage._plan_id(identity)
    _context(identity, "cleanup", run, approval=approval)
    # Only trusted manager context reaches this branch. Unknown/missing result
    # is failure handling, never an instruction to reopen or clear maintenance.
    return guard.cleanup_after_task(identity, os.environ.get("SERVICE_RESULT", "unknown"), run=run)



def prepare_migration_container(identity, attempt, approval, *, controller=None,
                                run=collector.command, fetch=None, now=collector.now_utc):
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(guard.MAINTENANCE_DIR) as root:
        return _prepare_migration_container_locked(root, jobs_root, identity, attempt, approval,
            controller=controller, run=run, fetch=fetch, now=now)


def _prepare_migration_container_locked(root, jobs_root, identity, attempt, approval, *, controller=None,
                                run=collector.command, fetch=None, now=collector.now_utc):
    """Create-only adapter; the task invokes the same locked body."""
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    _need(callable(getattr(controller, "write_creation_pending", None))
          and callable(getattr(guard, "_begin_migration_creation_locked", None))
          and callable(getattr(guard, "_register_created_migration_locked", None))
          and callable(getattr(guard.migration, "creation_config", None)), "migration APIs are incomplete")
    if fetch is None:
        fetch = lambda path: guard.release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    job._no_pending(jobs_root)
    _need(set(os.listdir(root)) == {guard.MARKER}, "unresolved maintenance leftovers")
    record = guard._read(root)
    _need(record["planId"] == identity and record["attemptId"] == attempt
          and record["phase"] == "FROZEN", "migration creation attempt differs")
    original = plan.validate_plan(storage.load_plan(identity), identity)
    _need(bool(original["pendingMigrations"]), "migration creation requires pending SQL")
    plan.assert_sql_approval(storage.load_plan(identity), identity, approval)
    plan.assert_same_observations(storage.load_plan(identity), identity,
        observed_at=job._timestamp(now), **job._observations(original))
    before, installed, environment = collector._snapshot(controller, run)
    _need(before == original["current"] and environment == original["environment"]
          and plan.runtime_contract(installed, installed) == original["runtimeContract"]
          and collector._history(controller, run) == original["migrationHistory"]
          and collector._backup(controller) == original["backup"], "migration baseline changed")
    _need(guard.release.verify_exact_candidate(original["current"]["applicationSha"],
          original["candidate"]["sourceSha"], fetch) == original["candidate"], "candidate proof changed")
    collector._resource_preflight(controller)
    image = original["candidate"]["images"]["sanq-api"]
    collector._inspect_image(collector._pinned(image), collector._pinned(image),
                             original["candidate"]["sourceSha"], run)
    _need(collector._probe_sql(collector._pinned(image), run) == original["migrationInventory"],
          "cached image SQL inventory changed")
    expanded = collector._json(run(collector._compose(controller, "config", "--format", "json")))
    body = guard.migration.creation_config(expanded, {**record, "migration": {
        "release": original["candidate"]}})
    _need(len(body) <= collector.MAX_OUTPUT, "migration config exceeds input budget")
    database = guard._database_identity(controller, run)
    _need(collector._snapshot(controller, run) == (before, installed, environment),
          "configuration changed before migration intention")
    guard._begin_migration_creation_locked(root, jobs_root, identity, attempt, approval,
                                          controller=controller, run=run, now=now)
    controller.write_creation_pending(original["current"]["applicationSha"], original["candidate"]["sourceSha"])
    run(["docker", "compose", "--project-name", "sanq-app", "--project-directory", str(controller.ROOT),
         "--env-file", str(controller.ENV), "--parallel", "1", "-f", "-", "create",
         "--no-build", "--pull", "never", "sanq-migration"], input_bytes=body, timeout=180)
    _need(guard._database_identity(controller, run) == database
          and collector._history(controller, run) == original["migrationHistory"],
          "database or history changed during create")
    identifiers = guard.migration.ids(guard._read(root), run)
    _need(len(identifiers) == 1, "migration creation identity is unknown")
    value = guard._register_created_migration_locked(root, jobs_root, identity, attempt, identifiers.pop(),
                                                   controller=controller, run=run, now=now)
    return {"planId": identity, "attemptId": value["attemptId"],
            "outcome": "MIGRATION_CREATED_NOT_STARTED", "canExecute": False}


def execute_registered_migration(identity, attempt, approval, *, controller=None,
                                 run=collector.command, fetch=None, now=collector.now_utc,
                                 clock=time.monotonic):
    """Execution adapter; the task invokes the same locked body."""
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(guard.MAINTENANCE_DIR) as root:
        return _execute_registered_migration_locked(root, jobs_root, identity, attempt, approval,
            controller=controller, run=run, fetch=fetch, now=now, clock=clock)


def _execute_registered_migration_locked(root, jobs_root, identity, attempt, approval, *,
        controller=None, run=collector.command, fetch=None, now=collector.now_utc,
        clock=time.monotonic):
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    if fetch is None:
        fetch = lambda path: guard.release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    deadline = clock() + 900
    def bounded(args, **kwargs):
        remaining = deadline - clock()
        _need(remaining > 0, "migration execution budget expired")
        kwargs["timeout"] = min(kwargs.get("timeout", 60), remaining)
        result = run(args, **kwargs)
        _need(clock() < deadline, "migration execution budget expired")
        return result
    job._no_pending(jobs_root)
    _need(set(os.listdir(root)) == {guard.MARKER}, "unresolved maintenance leftovers")
    record = guard._read(root)
    _need(record["schemaVersion"] == 3 and record["planId"] == identity
          and record["attemptId"] == attempt and record["phase"] == "MIGRATION_REGISTERED",
          "migration start attempt or phase differs")
    raw = storage.load_plan(identity)
    original = plan.validate_plan(raw, identity)
    _need(bool(original["pendingMigrations"])
          and record["migration"]["release"] == original["candidate"]
          and record["observedApplicationSha"] == original["current"]["applicationSha"]
          and record["migration"]["approvalSha256"] == approval, "migration approval or target differs")
    plan.assert_sql_approval(raw, identity, approval)
    plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now), **job._observations(original))
    guard._installed_gate(bounded)
    expanded = starter._pending_and_config(original, controller, bounded)
    database = guard._database_identity(controller, bounded)
    _need(collector._history(controller, bounded) == original["migrationHistory"]
          and collector._backup(controller) == original["backup"], "migration baseline changed")
    _need(guard.release.verify_exact_candidate(original["current"]["applicationSha"],
          original["candidate"]["sourceSha"], fetch) == original["candidate"], "candidate proof changed")
    _need(clock() < deadline, "migration proof exceeded execution budget")
    collector._resource_preflight(controller)
    image = original["candidate"]["images"]["sanq-api"]
    collector._inspect_image(collector._pinned(image), collector._pinned(image),
                             original["candidate"]["sourceSha"], bounded)
    _need(collector._probe_sql(collector._pinned(image), bounded) == original["migrationInventory"],
          "cached migration SQL differs")
    guard._assert_stopped(controller, record, bounded)
    row = record["migration"]["container"]
    info = guard.migration.inspect_container(record, row["containerId"], bounded, created=True)
    _need(info["Image"] == row["imageId"], "registered migration image changed")
    _need(starter._pending_and_config(original, controller, bounded) == expanded
          and guard._database_identity(controller, bounded) == database
          and collector._history(controller, bounded) == original["migrationHistory"]
          and collector._backup(controller) == original["backup"]
          and guard._backup(bounded) == record["backupUnits"], "migration baseline drifted")
    guard._installed_gate(bounded)
    starting = {**record, "phase": "STARTING_MIGRATION", "updatedAt": job._timestamp(now)}
    guard._write(root, starting)  # Unknown durability never permits docker start.
    try:
        bounded(["docker", "start", row["containerId"]], timeout=30)
        result = bounded(["docker", "wait", row["containerId"]], timeout=900)
        _need(type(result) is str and result.strip() == "0", "migration exit result is not zero")
        guard.migration.assert_completed(starting, bounded)
        guard.migration.assert_applied_history(original, collector._history(controller, bounded))
        guard._assert_stopped(controller, starting, bounded)
        _need(starter._pending_and_config(original, controller, bounded) == expanded
              and guard._database_identity(controller, bounded) == database
              and collector._backup(controller) == original["backup"]
              and guard._backup(bounded) == record["backupUnits"], "post-migration baseline changed")
        guard._installed_gate(bounded)
        # Re-read completion and history after the remaining observations.
        guard.migration.assert_completed(starting, bounded)
        guard.migration.assert_applied_history(original, collector._history(controller, bounded))
    except BaseException as error:
        def cleanup_command(args, **kwargs):
            kwargs["timeout"] = min(kwargs.get("timeout", 45), 45)
            return run(args, **kwargs)
        guard._incident_locked(root, identity, controller, cleanup_command, now)
        raise ReleaseContractError("migration outcome requires review; retained PENDING and incident") from error
    verified = {**starting, "phase": "MIGRATION_VERIFIED", "updatedAt": job._timestamp(now)}
    try:
        guard._write(root, verified)
    except BaseException as error:
        # Do not overwrite an unknown final record or infer permission to replay.
        guard._stop_best_effort(starting, run)
        raise ReleaseContractError("migration record durability unknown; inspect retained evidence") from error
    return {"planId": identity, "attemptId": attempt, "outcome": "MIGRATION_VERIFIED",
            "canExecute": False}



def handoff_migrated_release(identity, attempt, approval, *, controller=None,
        run=collector.command, fetch=None, now=collector.now_utc,
        clock=time.monotonic, pause=time.sleep):
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(guard.MAINTENANCE_DIR) as root:
        return _handoff_migrated_release_locked(root, jobs_root, identity, attempt, approval,
            controller=controller, run=run, fetch=fetch, now=now, clock=clock, pause=pause)


def _handoff_migrated_release_locked(root, jobs_root, identity, attempt, approval, *, controller=None,
        run=collector.command, fetch=None, now=collector.now_utc,
        clock=time.monotonic, pause=time.sleep):
    """Inline continuation after known migration success; never recovery or replay."""
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    _need("pending_config" in inspect.signature(guard._prepare_candidate_containers_locked).parameters
          and callable(getattr(guard.migration, "assert_application_history", None)),
          "post-migration helper APIs are incomplete")
    job._no_pending(jobs_root)
    _need(set(os.listdir(root)) == {guard.MARKER}, "unresolved maintenance leftovers")
    record = guard._read(root)
    _need(record["schemaVersion"] == 3 and record["phase"] == "MIGRATION_VERIFIED"
          and record["planId"] == identity and record["attemptId"] == attempt
          and record["migration"]["approvalSha256"] == approval, "migration continuation differs")
    plan.assert_sql_approval(storage.load_plan(identity), identity, approval)
    guard._prepare_candidate_containers_locked(root, jobs_root, identity, attempt,
        controller=controller, run=run, fetch=fetch, now=now,
        pending_config=starter._pending_and_config)
    starter._start_and_verify_locked(root, jobs_root, identity, attempt,
        controller=controller, run=run, fetch=fetch, now=now, clock=clock, pause=pause)
    return finalizer._finalize_ready_locked(root, jobs_root, identity, attempt,
        controller=controller, run=run, fetch=fetch, now=now)


def _observed_writers(controller, candidate, expanded, run):
    rows = {}
    for service in guard.SERVICES:
        name = "sanq-web" if service == "web" else "sanq-api"
        image = candidate["images"][name]
        identifier = guard._container_id(controller, service, run)
        _need(guard._role_ids(service, run) == {identifier}, "extra runtime writer")
        info = guard._inspect(identifier, service, candidate["sourceSha"], run,
                              reference=collector._pinned(image))
        state = info["State"]
        _need(state.get("Status") == "running" and state.get("Running") is True
              and state.get("Restarting") is False and state.get("Paused") is False
              and state.get("Health", {}).get("Status") == "healthy",
              "target is not steadily healthy")
        collector._inspect_image(info["Image"], collector._pinned(image),
                                 candidate["sourceSha"], run)
        guard._created_mounts(identifier, expanded["services"][service].get("volumes", []), run)
        rows[service] = {"containerId": identifier, "imageId": info["Image"],
                         "restartPolicy": info["HostConfig"]["RestartPolicy"]}
    _need(len({row["containerId"] for row in rows.values()}) == 3
          and rows["api"]["imageId"] == rows["ubereats-worker"]["imageId"],
          "writer or shared API image identities differ")
    return rows


def _release_observation(identity: str, *, controller=None, run=collector.command) -> dict:
    """Bounded read-only observations, never a receipt or a replay permission."""
    unknown = {"outcome": "UNKNOWN", "canExecute": False, "operationSuccessProven": False}
    original_run = run
    def bounded(args, **kwargs):
        kwargs["timeout"] = min(kwargs.get("timeout", 15), 15)
        return original_run(args, **kwargs)
    run = bounded
    try:
        if controller is None:
            import deploy_release as controller
        with job._locked_directory(), storage.preparation_lock():
            raw = storage.load_plan(identity)
            original = plan.validate_plan(raw, identity)
            marker = guard.status()
            controller.ensure_repo_location()
            state = finalizer._state(controller)
            require_sha(state["current"])
            require_sha(state["previous"])
            plan._utc(state["updatedAt"])
            _need(state["phase"] in ("active", "pending", "rolled-back")
                  and isinstance(state["reason"], str), "release state values differ")
            selected = {"phase": state["phase"], "current": state["current"],
                        "previous": state["previous"]}
            result = {**unknown, "releaseState": selected}
            if "planId" in marker:
                return {**result, "outcome": "MAINTENANCE_RETAINED",
                        "maintenancePhase": marker["phase"] if marker["planId"] == identity
                        else "OTHER_PLAN"}
            if (state["phase"] != "active"
                    or state["current"] != original["candidate"]["sourceSha"]
                    or state["previous"] != original["current"]["applicationSha"]
                    or state["reason"] != "readiness-verified"):
                return {**result, "outcome": "RELEASE_INCOMPLETE"}
            before = collector._snapshot(controller, run)
            _need(before[0]["applicationSha"] == state["current"]
                  and before[0]["manifestSha256"] == original["current"]["manifestSha256"]
                  and plan.runtime_contract(before[1], before[1]) == original["runtimeContract"],
                  "target runtime differs from reviewed plan")
            expanded = collector._json(run(collector._compose(controller, "config", "--format", "json")))
            rows = _observed_writers(controller, original["candidate"], expanded, run)
            database = guard._database_identity(controller, run)
            # Do not combine observations from two updater stages or changed files.
            _need(collector._snapshot(controller, run) == before
                  and finalizer._state(controller) == state
                  and guard.status() == marker
                  and _observed_writers(controller, original["candidate"], expanded, run) == rows
                  and guard._database_identity(controller, run) == database,
                  "runtime changed during status observation")
            return {**result, "outcome": "TARGET_RUNNING_OBSERVED"}
    except (ReleaseContractError, OSError, ValueError, TypeError, KeyError, RecursionError):
        return unknown


def status(identity: str, *, run=collector.command) -> dict:
    identity = storage._plan_id(identity)
    marker = guard.status()
    try:
        fields = guard._properties(_unit(identity),
                                   ["LoadState", "ActiveState", "SubState", "Result"], run)
    except (ReleaseContractError, OSError):
        fields = {"LoadState": "unknown"}  # Keep durable maintenance evidence queryable.
    phase = "NO_RECORDED_MAINTENANCE"
    if "planId" in marker:
        phase = marker["phase"] if marker["planId"] == identity else "OTHER_PLAN"
    # A not-found unit is UNKNOWN; Result=success alone never implies completion.
    return {"planId": identity, "unit": _unit(identity),
            "unitState": fields if fields["LoadState"] == "loaded" else {"LoadState": "unknown"},
            "maintenancePhase": phase,
            "releaseObservation": _release_observation(identity, run=run), "canExecute": False}


def logs(identity: str, *, run=collector.command) -> str:
    return run(["journalctl", "--unit=" + _unit(identity), "--no-pager",
                "--lines=80", "--output=short-iso"], timeout=30)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("submit", "run", "cleanup", "status", "logs"):
        sub = commands.add_parser(name)
        sub.add_argument("plan_id")
        if name == "submit":
            sub.add_argument("--confirm-release", required=True, action="store_true")
        if name in ("submit", "run", "cleanup"):
            sub.add_argument("--approve-sql", help="exact SQL review SHA-256 for this plan")
    args = parser.parse_args(argv)
    try:
        if args.command == "logs":
            print(logs(args.plan_id), end="")
        else:
            handlers = {"submit": submit, "run": run_task, "cleanup": cleanup_task, "status": status}
            kwargs = {"approval": args.approve_sql} if args.command in ("submit", "run", "cleanup") else {}
            print(json.dumps(handlers[args.command](args.plan_id, **kwargs), indent=2))
        return 0
    except (ReleaseContractError, OSError, ValueError, TypeError, KeyError, RecursionError):
        print("Task outcome requires review; query status/logs. No automatic retry or restore.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
