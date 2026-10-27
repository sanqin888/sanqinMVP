"""Uninstalled systemd transient no-migration release task.

Only an explicitly confirmed fixed plan is queued. No SQL, replay, restore or
recovery entry; query status/logs after disconnect or unknown results.
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
          and callable(getattr(starter, "_start_and_verify_locked", None))
          and callable(getattr(finalizer, "_finalize_ready_locked", None))
          and callable(getattr(starter, "start_and_verify", None))
          and callable(getattr(finalizer, "finalize_ready", None))
          and "policies" in inspect.signature(starter._running).parameters
          and "input_bytes" in inspect.signature(collector.command).parameters
          and callable(getattr(storage, "check_maintenance_clear", None))
          and "wait_seconds" in inspect.signature(job._locked_directory).parameters,
          "installed helper APIs are incomplete; do not mix tool versions")


def _command(role: str, identity: str) -> str:
    return "/usr/bin/python3 -B " + str(TASK_SCRIPT) + " " + role + " " + storage._plan_id(identity)


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


def _context(identity: str, role: str, run) -> None:
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
    _need(_command_matches(fields["ExecStart"], _command("run", identity))
          and _command_matches(fields["ExecStopPost"], _command("cleanup", identity)),
          "task executable arguments or failure handling differ")


def submit(identity: str, *, run=collector.command, now=collector.now_utc) -> dict:
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
        _need(not original["pendingMigrations"], "SQL authorization path is not implemented")
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
            "--property=ExecStopPost=" + _command("cleanup", identity),
            "--", "/usr/bin/python3", "-B", str(TASK_SCRIPT), "run", identity]
    # No wait/pty/pipe/scope/replace/collect; a duplicate or unknown result is not retried.
    run(args, timeout=30)
    return {"planId": identity, "unit": _unit(identity), "outcome": "SUBMITTED",
            "canExecute": False}


def run_task(identity: str, *, run=collector.command, controller=None, fetch=None,
             observe=None, now=collector.now_utc, clock=time.monotonic, pause=time.sleep) -> dict:
    job._root_operator()
    identity = storage._plan_id(identity)
    _context(identity, "run", run)
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
        original = plan.validate_plan(storage.load_plan(identity), identity)
        _need(not original["pendingMigrations"], "SQL authorization path is not implemented")
        _need(original["candidate"]["sourceSha"] != original["current"]["applicationSha"],
              "target is already the current release")
        remaining()
        frozen = guard._freeze_for_plan_locked(root, jobs_root, identity, controller=controller,
            run=bounded, observe=observe, fetch=bounded_fetch, now=now)
        _need(frozen["planId"] == identity and frozen["phase"] == "FROZEN"
              and frozen["canExecute"] is False, "freeze stage result differs")
        attempt = job._attempt(frozen["attemptId"])
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



def cleanup_task(identity: str, *, run=collector.command) -> dict:
    job._root_operator()
    identity = storage._plan_id(identity)
    _context(identity, "cleanup", run)
    # Only trusted manager context reaches this branch. Unknown/missing result
    # is failure handling, never an instruction to reopen or clear maintenance.
    return guard.cleanup_after_task(identity, os.environ.get("SERVICE_RESULT", "unknown"), run=run)


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
    args = parser.parse_args(argv)
    try:
        if args.command == "logs":
            print(logs(args.plan_id), end="")
        else:
            handlers = {"submit": submit, "run": run_task, "cleanup": cleanup_task, "status": status}
            print(json.dumps(handlers[args.command](args.plan_id), indent=2))
        return 0
    except (ReleaseContractError, OSError, ValueError, TypeError, KeyError, RecursionError):
        print("Task outcome requires review; query status/logs. No automatic retry or restore.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
