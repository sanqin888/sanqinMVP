"""Persistent read-only precheck jobs, never an apply/deploy authority.

Not installed on production. No systemd, Docker policy, business state or SQL
mutation is available here. READY is an observation result, not release ACTIVE.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import re
import uuid
from pathlib import Path

import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
from release_contract import ReleaseContractError

JOB_DIR = Path("/opt/sanq/deploy-state/jobs")
MAX_JOB_BYTES = 4096
MAX_JOBS = 1024
KIND = "sanq-read-only-precheck"
ERRORS = {"PRECHECK_FAILED", "INTERRUPTED_OBSERVATION", "ABANDONED_OBSERVATION"}


def _need(condition: bool, reason: str) -> None:
    if not condition:
        raise ReleaseContractError(reason)


def _root_operator() -> None:
    _need(os.geteuid() == 0, "job mutation requires the authorized root operator")


def _attempt(value: str) -> str:
    _need(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{32}", value) is not None,
          "invalid attempt identity")
    return value


def _validate(value: dict, identity: str) -> None:
    _need(type(value) is dict and set(value) == {
        "schemaVersion", "kind", "planId", "attemptId", "phase", "createdAt",
        "updatedAt", "errorCode", "canExecute"}, "job fields differ")
    _need(type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == KIND and value["canExecute"] is False,
          "job is not a read-only precheck")
    _need(storage._plan_id(value["planId"]) == identity, "job plan identity differs")
    _attempt(value["attemptId"])
    _need(plan._utc(value["updatedAt"]) >= plan._utc(value["createdAt"]),
          "job clock moved backwards")
    _need(value["phase"] in ("REVALIDATING", "READY", "BLOCKED"), "unknown job phase")
    if value["phase"] == "BLOCKED":
        _need(value["errorCode"] in ERRORS, "invalid fixed job error code")
    else:
        _need(value["errorCode"] is None, "unexpected job error code")


def _bytes(value: dict) -> bytes:
    _validate(value, storage._plan_id(value.get("planId")))
    raw = plan._canonical(value) + b"\n"
    _need(len(raw) <= MAX_JOB_BYTES, "job record exceeds budget")
    return raw


def _read(root: int, identity: str) -> dict:
    fd = os.open(identity + ".json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                 dir_fd=root)
    try:
        before = os.fstat(fd)
        storage._check(before)
        _need(0 < before.st_size <= MAX_JOB_BYTES, "job size differs")
        raw = os.read(fd, MAX_JOB_BYTES + 1)
        after = os.fstat(fd)
        _need(len(raw) == before.st_size and collector._fingerprint(before) ==
              collector._fingerprint(after), "job changed during read")
        value = json.loads(raw, object_pairs_hook=plan._unique_object)
        _validate(value, identity)
        _need(raw == _bytes(value), "job is not canonical")
        return value
    finally:
        os.close(fd)


@contextlib.contextmanager
def _locked_directory():
    # The installer provisions the private directories. No mkdir/chown/chmod.
    with storage._directory_fd(JOB_DIR) as root:
        fd = os.open(".release.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW
                     | os.O_NONBLOCK, 0o600, dir_fd=root)
        try:
            storage._check(os.fstat(fd))
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise ReleaseContractError("another job holds the release lock") from exc
            yield root
        finally:
            os.close(fd)


def _no_pending(root: int) -> None:
    names = os.listdir(root)
    _need(len(names) <= MAX_JOBS, "job history budget exceeded")
    for name in names:
        if name == ".release.lock":
            continue
        _need(re.fullmatch(r"[a-f0-9]{64}\.json", name) is not None,
              "unrecognized or partial job file; operator review required")
        record = _read(root, name[:-5])
        _need(record["phase"] != "REVALIDATING",
              "unfinished observation job requires explicit review")


def _write(root: int, value: dict, *, create: bool = False) -> None:
    """Create once or replace one legal phase; preserve unknown/partial results."""
    raw = _bytes(value)
    identity, target = value["planId"], value["planId"] + ".json"
    if create:
        _need(value["phase"] == "REVALIDATING", "new job must begin revalidating")
        name = target
    else:
        previous = _read(root, identity)
        _need(previous["phase"] == "REVALIDATING" and value["phase"] in ("READY", "BLOCKED")
              and all(value[key] == previous[key] for key in
                      ("planId", "attemptId", "createdAt", "kind", "schemaVersion", "canExecute")),
              "illegal job transition or changed attempt")
        name = ".job-" + uuid.uuid4().hex + ".tmp"
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=root)
    try:
        storage._check(os.fstat(fd))
        remaining = memoryview(raw)
        while remaining:
            written = os.write(fd, remaining)
            if written <= 0:
                raise OSError("short job write")
            remaining = remaining[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    if not create:
        os.replace(name, target, src_dir_fd=root, dst_dir_fd=root)
    os.fsync(root)
    _need(_read(root, identity) == value, "job readback differs")


def _observations(value: dict) -> dict:
    return {"current": value["current"], "candidate": value["candidate"],
            "runtime_pins": value["runtimeContract"], "inventory": value["migrationInventory"],
            "history": value["migrationHistory"], "pending": value["pendingMigrations"],
            "backup": value["backup"], "environment": value["environment"]}


def _timestamp(now) -> str:
    value = now()
    plan._utc(value)
    return value


def status(identity: str) -> dict:
    """Read a canonical snapshot without blocking on the running job's lock."""
    identity = storage._plan_id(identity)
    with storage._directory_fd(JOB_DIR) as root:
        return _read(root, identity)


def precheck(identity: str, *, observe=None, now=collector.now_utc) -> dict:
    """Re-observe one retained plan. No code here may advance to business writes."""
    _root_operator()
    identity = storage._plan_id(identity)
    observe = collector.collect if observe is None else observe
    with _locked_directory() as root:
        _no_pending(root)
        raw = storage.load_plan(identity)
        original = plan.validate_plan(raw, identity)
        started = _timestamp(now)
        record = {"schemaVersion": 1, "kind": KIND, "planId": identity,
                  "attemptId": uuid.uuid4().hex, "phase": "REVALIDATING",
                  "createdAt": started, "updatedAt": started,
                  "errorCode": None, "canExecute": False}
        _write(root, record, create=True)  # Durable intention before collecting.
        try:
            # Expired plans/clock rollback fail before any expensive observation.
            plan.assert_same_observations(raw, identity, observed_at=started,
                                          **_observations(original))
            # Same lock order for every job: job lock -> plan resource lock.
            with storage.preparation_lock():
                fresh_raw = observe(original["candidate"]["sourceSha"], cache_images=False)
                _need(type(fresh_raw) is bytes and 0 < len(fresh_raw) <= plan.MAX_PLAN_BYTES,
                      "invalid fresh observation bytes")
                fresh = plan.validate_plan(fresh_raw, json.loads(fresh_raw)["planId"])
                finished = _timestamp(now)
                _need(plan._utc(started) <= plan._utc(fresh["createdAt"]) <= plan._utc(finished),
                      "observation clock differs from job interval")
                plan.assert_same_observations(raw, identity, observed_at=finished,
                                              **_observations(fresh))
        except BaseException as error:
            code = ("INTERRUPTED_OBSERVATION" if isinstance(error, (KeyboardInterrupt, SystemExit))
                    else "PRECHECK_FAILED")
            # Only an observation failure is recorded. No service cleanup/restart.
            try:
                _write(root, {**record, "phase": "BLOCKED",
                              "updatedAt": _timestamp(now), "errorCode": code})
            except BaseException as final_error:
                raise ReleaseContractError(
                    "job failure could not be durably recorded; inspect original files"
                ) from final_error
            raise
        ready = {**record, "phase": "READY", "updatedAt": finished}
        # If final durability is unknown, do not retry or replace it with FAILED.
        _write(root, ready)
        return ready


def abandon(identity: str, attempt_id: str, *, now=collector.now_utc) -> dict:
    """Operator acknowledges only an interrupted READ-ONLY observation attempt.

    The exclusive lock must be available. This does not clear a deployment,
    maintenance mark or probe container, and cannot finalize an execution job.
    """
    _root_operator()
    identity, attempt_id = storage._plan_id(identity), _attempt(attempt_id)
    with _locked_directory() as root:
        record = _read(root, identity)
        _need(record["attemptId"] == attempt_id and record["phase"] == "REVALIDATING",
              "abandon requires the same unfinished observation attempt")
        blocked = {**record, "phase": "BLOCKED", "updatedAt": _timestamp(now),
                   "errorCode": "ABANDONED_OBSERVATION"}
        _write(root, blocked)
        return blocked


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("precheck", "status", "abandon"):
        sub = commands.add_parser(name)
        sub.add_argument("plan_id")
        if name == "abandon":
            sub.add_argument("--attempt-id", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "precheck":
            value = precheck(args.plan_id)
        elif args.command == "abandon":
            value = abandon(args.plan_id, args.attempt_id)
        else:
            value = status(args.plan_id)
        print(json.dumps(value, indent=2))
        return 0
    except (ReleaseContractError, OSError, ValueError, TypeError, KeyError, RecursionError):
        print("Read-only job blocked; no deployment was requested.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
