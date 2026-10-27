"""Uninstalled systemd transient maintenance-preparation task adapter.

No application apply, migration, resume, restore or unfreeze. Submission only
queues a task; status and logs must be queried after disconnect/unknown results.
"""

from __future__ import annotations

import argparse
import inspect
import json
import os
import re
from pathlib import Path

import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import maintenance_guard as guard
import release_job as job
import start_candidates as starter
import finalize_candidates as finalizer
from release_contract import ReleaseContractError

TASK_SCRIPT = Path("/opt/sanq/runtime/ops/release/release_task.py")
RUNTIME_ROOT = Path("/opt/sanq/runtime")
UNIT_PREFIX = "sanq-release-prepare-"


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
        plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now),
                                      **job._observations(original))
    args = ["systemd-run", "--unit=" + _unit(identity), "--service-type=oneshot",
            "--remain-after-exit", "--no-block", "--slice=system.slice",
            "--property=User=root", "--property=Restart=no", "--property=KillMode=control-group",
            "--property=TimeoutStartSec=900", "--property=TimeoutStopSec=900",
            "--property=WorkingDirectory=" + str(RUNTIME_ROOT),
            "--property=MemoryMax=256M", "--property=CPUQuota=50%",
            "--property=ExecStopPost=" + _command("cleanup", identity),
            "--", "/usr/bin/python3", "-B", str(TASK_SCRIPT), "run", identity]
    # No wait/pty/pipe/scope/replace/collect; a duplicate or unknown result is not retried.
    run(args, timeout=30)
    return {"planId": identity, "unit": _unit(identity), "outcome": "SUBMITTED",
            "canExecute": False}


def run_task(identity: str, *, run=collector.command) -> dict:
    job._root_operator()
    identity = storage._plan_id(identity)
    _context(identity, "run", run)
    result = guard.freeze_for_plan(identity, run=run)
    _need(result["planId"] == identity and result["phase"] == "FROZEN"
          and result["canExecute"] is False, "task did not finish maintenance preparation")
    return {"planId": identity, "outcome": "MAINTENANCE_PREPARED", "canExecute": False}


def cleanup_task(identity: str, *, run=collector.command) -> dict:
    job._root_operator()
    identity = storage._plan_id(identity)
    _context(identity, "cleanup", run)
    # Only trusted manager context reaches this branch. Unknown/missing result
    # is failure handling, never an instruction to reopen or clear maintenance.
    return guard.cleanup_after_task(identity, os.environ.get("SERVICE_RESULT", "unknown"), run=run)


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
            "maintenancePhase": phase, "canExecute": False}


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
            sub.add_argument("--confirm-maintenance", required=True, action="store_true")
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
