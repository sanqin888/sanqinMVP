"""Local maintenance preparation and cold-start gate; NOT installed/activated.

The CLI only checks startup or reads status. freeze_for_plan is an unwired,
operator-only adapter for future controlled execution. No release, restore,
unfreeze, migration or service-start action is available.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import uuid
from pathlib import Path

import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_contract as release
import release_job as job

MAINTENANCE_DIR = Path("/opt/sanq/deploy-state/maintenance")
GUARD_SCRIPT = Path("/opt/sanq/runtime/ops/release/maintenance_guard.py")
MARKER = "active.json"
MAX_MARKER = 16384
SERVICES = ("api", "ubereats-worker", "web")
GUARD_COMMAND = "/usr/bin/python3 -B " + str(GUARD_SCRIPT) + " check-startup"
DROPINS = {
    "docker.service": "[Service]\nExecStartPre=" + GUARD_COMMAND + "\n",
    "docker.socket": "[Unit]\nConditionPathExists=!" + str(MAINTENANCE_DIR / MARKER) + "\n",
    "sanq-backup.service": "[Unit]\nConditionPathExists=!" + str(MAINTENANCE_DIR / MARKER)
        + "\n\n[Service]\nExecStartPre=+" + GUARD_COMMAND + "\n",
}
DROPIN_ROOT = Path("/etc/systemd/system")


def _need(condition: bool, reason: str) -> None:
    if not condition:
        raise release.ReleaseContractError(reason)


def _id(value: str) -> str:
    _need(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None,
          "container identity differs")
    return value


def _policy(value: dict) -> dict:
    _need(type(value) is dict and set(value) == {"Name", "MaximumRetryCount"}
          and value["Name"] in ("no", "always", "unless-stopped", "on-failure")
          and type(value["MaximumRetryCount"]) is int
          and value["MaximumRetryCount"] >= 0
          and (value["Name"] == "on-failure" or value["MaximumRetryCount"] == 0),
          "unknown original restart policy")
    return value


def _backup(run) -> dict:
    result = {}
    for label, unit in (("timer", "sanq-backup.timer"), ("service", "sanq-backup.service")):
        fields = _properties(unit, ["LoadState", "ActiveState", "SubState", "UnitFileState"], run)
        _need(fields["LoadState"] == "loaded"
              and fields["UnitFileState"] in ("enabled", "disabled", "static", "indirect"),
              "unsupported backup unit")
        if label == "service":
            _need(fields["ActiveState"] == "inactive" and fields["SubState"] == "dead",
                  "backup is active or unresolved")
        else:
            _need(fields["ActiveState"] in ("active", "inactive"), "backup timer is unresolved")
        result[label] = {key: fields[key] for key in ("ActiveState", "SubState", "UnitFileState")}
    return result


def _properties(unit: str, keys: list[str], run) -> dict:
    raw = run(["systemctl", "show", unit, "--no-pager", "--property=" + ",".join(keys)])
    result = {}
    for line in raw.splitlines():
        key, separator, value = line.partition("=")
        _need(separator == "=" and key in keys and key not in result,
              "invalid service-manager observation")
        result[key] = value
    _need(set(result) == set(keys), "incomplete service-manager observation")
    return result


def _installed_gate(run) -> None:
    _need(Path(__file__) == GUARD_SCRIPT, "maintenance helper is not installed at its fixed path")
    collector._private_bytes(GUARD_SCRIPT, storage.OWNER_UID, private=False)
    for unit, expected in DROPINS.items():
        path = DROPIN_ROOT / (unit + ".d") / "80-sanq-maintenance.conf"
        actual = collector._private_bytes(path, storage.OWNER_UID, private=False, maximum=4096)
        _need(actual == expected.encode(), "maintenance drop-in differs")
        keys = ["LoadState", "NeedDaemonReload", "DropInPaths"]
        keys += ["Triggers"] if unit.endswith(".socket") else ["ExecStartPre"]
        fields = _properties(unit, keys, run)
        _need(fields["LoadState"] == "loaded" and fields["NeedDaemonReload"] == "no"
              and fields["DropInPaths"].split() == [str(path)],
              "maintenance gate is not loaded or has unreviewed overrides")
        if unit.endswith(".socket"):
            _need(fields["Triggers"].split() == ["docker.service"], "unexpected socket activation target")
        else:
            command = "argv[]=" + GUARD_COMMAND + " ; ignore_errors=no"
            _need(command in fields["ExecStartPre"]
                  and fields["ExecStartPre"].count(str(GUARD_SCRIPT)) == 1,
                  "effective startup check is missing or ignores failure")
    engine = collector._json(run(["docker", "info", "--format", "{{json .}}"]))
    _need(type(engine) is dict and engine.get("LiveRestoreEnabled") is False
          and type(engine.get("Swarm")) is dict
          and engine["Swarm"].get("LocalNodeState") == "inactive",
          "live-restore or an unsupported orchestrator requires separate review")


def _inspect(identifier: str, service: str, sha: str, run, *, reference: str | None = None) -> dict:
    info = collector._json(run(["docker", "inspect", "--format", "{{json .}}", _id(identifier)]))
    _need(type(info) is dict and info.get("Id") == identifier
          and type(info.get("Config")) is dict and type(info["Config"].get("Labels")) is dict
          and info["Config"]["Labels"].get("com.docker.compose.project") == "sanq-app"
          and info["Config"]["Labels"].get("com.docker.compose.service") == service
          and info["Config"].get("Image") ==
          (reference or f"ghcr.io/sanqin888/{'sanq-web' if service == 'web' else 'sanq-api'}:{sha}"),
          "container role, project or release differs")
    release.checked_digest(info.get("Image"))
    _need(type(info.get("State")) is dict and type(info.get("HostConfig")) is dict,
          "container state is missing")
    _policy(info["HostConfig"].get("RestartPolicy"))
    return info


def _container_id(controller, service: str, run) -> str:
    return _id(run(collector._compose(controller, "ps", "-a", "-q", service)).strip())


def _original_containers(controller, sha: str, paired: dict, run) -> dict:
    result = {}
    for service in SERVICES:
        identifier = _container_id(controller, service, run)
        info = _inspect(identifier, service, sha, run)
        state = info["State"]
        _need(state.get("Status") == "running" and state.get("Running") is True
              and state.get("Restarting") is False and state.get("Paused") is False,
              "current writer is not steadily running")
        name = "sanq-web" if service == "web" else "sanq-api"
        collector._inspect_image(info["Image"], collector._pinned(paired["images"][name]), sha, run)
        result[service] = {"containerId": identifier, "imageId": info["Image"],
                           "restartPolicy": info["HostConfig"]["RestartPolicy"]}
    _need(len({row["containerId"] for row in result.values()}) == 3,
          "writer identities are not distinct")
    return result


def _validate(value: dict) -> None:
    fields = {
        "schemaVersion", "kind", "planId", "attemptId", "observedApplicationSha",
        "originalContainers", "backupUnits", "phase", "createdAt", "updatedAt",
        "errorCode", "canExecute"}
    _need(type(value) is dict, "maintenance record differs")
    version = value.get("schemaVersion")
    _need(type(version) is int and version in (1, 2)
          and set(value) == (fields if version == 1 else fields | {"candidate"}),
          "maintenance fields differ")
    _need(type(value["schemaVersion"]) is int
          and value["kind"] == "sanq-maintenance-marker" and value["canExecute"] is False,
          "invalid maintenance record kind")
    storage._plan_id(value["planId"])
    job._attempt(value["attemptId"])
    release.require_sha(value["observedApplicationSha"])
    _need(plan._utc(value["updatedAt"]) >= plan._utc(value["createdAt"]), "maintenance clock moved backwards")
    _need(value["phase"] in ("ARMED", "FROZEN", "INCIDENT", "CANDIDATES_REGISTERED"), "invalid maintenance phase")
    _need(value["errorCode"] in ("FENCE_UNCONFIRMED", "TASK_FAILED_WRITERS_STOPPED")
          if value["phase"] == "INCIDENT" else value["errorCode"] is None,
          "invalid maintenance error code")
    rows = value["originalContainers"]
    _need(type(rows) is dict and set(rows) == set(SERVICES), "writer role set differs")
    for row in rows.values():
        _need(type(row) is dict and set(row) == {"containerId", "imageId", "restartPolicy"},
              "writer record differs")
        _id(row["containerId"])
        release.checked_digest(row["imageId"])
        _policy(row["restartPolicy"])
    _need(len({row["containerId"] for row in rows.values()}) == 3, "duplicate writer identity")
    if version == 1:
        _need(value["phase"] != "CANDIDATES_REGISTERED", "candidate registration is missing")
    else:
        _need(value["phase"] in ("CANDIDATES_REGISTERED", "INCIDENT"), "invalid candidate phase")
        _candidate_record(value["candidate"], rows)
        _need(value["candidate"]["release"]["sourceSha"] != value["observedApplicationSha"],
              "candidate release is unchanged")
    backups = value["backupUnits"]
    _need(type(backups) is dict and set(backups) == {"timer", "service"}, "backup record differs")
    for name, fields in backups.items():
        _need(type(fields) is dict and set(fields) == {"ActiveState", "SubState", "UnitFileState"}
              and all(type(item) is str for item in fields.values())
              and fields["UnitFileState"] in ("enabled", "disabled", "static", "indirect"),
              "backup fields differ")
        _need((fields["ActiveState"] == "inactive" and fields["SubState"] == "dead")
              if name == "service" else fields["ActiveState"] in ("active", "inactive"),
              "backup was not quiescent")


def _raw(value: dict) -> bytes:
    _validate(value)
    raw = plan._canonical(value) + b"\n"
    _need(len(raw) <= MAX_MARKER, "maintenance record exceeds budget")
    return raw


def _read(root: int) -> dict:
    fd = os.open(MARKER, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        storage._check(before)
        _need(0 < before.st_size <= MAX_MARKER, "maintenance size differs")
        raw = os.read(fd, MAX_MARKER + 1)
        _need(len(raw) == before.st_size and collector._fingerprint(before) ==
              collector._fingerprint(os.fstat(fd)), "maintenance changed during read")
        value = json.loads(raw, object_pairs_hook=plan._unique_object)
        _need(raw == _raw(value), "maintenance is not canonical")
        return value
    finally:
        os.close(fd)


def _write(root: int, value: dict, *, create: bool = False) -> None:
    raw = _raw(value)
    if create:
        _need(value["phase"] == "ARMED" and not os.listdir(root), "maintenance already has evidence")
        name = MARKER
    else:
        old = _read(root)
        registering = (old["schemaVersion"] == 1 and old["phase"] == "FROZEN"
                       and value["schemaVersion"] == 2
                       and value["phase"] == "CANDIDATES_REGISTERED")
        allowed = {"ARMED": ("FROZEN", "INCIDENT"), "FROZEN": ("INCIDENT",),
                   "CANDIDATES_REGISTERED": ("INCIDENT",), "INCIDENT": ("INCIDENT",)}
        ignored = {"phase", "updatedAt", "errorCode"}
        if registering:
            ignored |= {"schemaVersion", "candidate"}
        _need((registering or value["phase"] in allowed[old["phase"]])
              and plan._utc(value["updatedAt"]) >= plan._utc(old["updatedAt"])
              and all(old.get(key) == value[key] for key in value if key not in ignored),
              "invalid maintenance transition")
        name = ".maintenance-" + uuid.uuid4().hex + ".tmp"
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
    try:
        storage._check(os.fstat(fd))
        remaining = memoryview(raw)
        while remaining:
            written = os.write(fd, remaining)
            if written <= 0:
                raise OSError("short maintenance write")
            remaining = remaining[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    if not create:
        os.replace(name, MARKER, src_dir_fd=root, dst_dir_fd=root)
    os.fsync(root)
    _need(_read(root) == value, "maintenance readback differs")


def check_startup() -> None:
    """No Docker/systemd calls or job lock: safe for daemon ExecStartPre."""
    storage.check_maintenance_clear(MAINTENANCE_DIR)


def status() -> dict:
    with storage._directory_fd(MAINTENANCE_DIR) as root:
        if not os.listdir(root):
            return {"maintenance": False, "canExecute": False}
        return _read(root)  # Missing/bad marker with leftovers is UNKNOWN, never clear.


def _assert_stopped(controller, record: dict, run) -> None:
    if record["schemaVersion"] == 2:
        _assert_registered_stopped(record, run)
        return
    for service, row in record["originalContainers"].items():
        _need(_container_id(controller, service, run) == row["containerId"], "writer was replaced")
        info = _inspect(row["containerId"], service, record["observedApplicationSha"], run)
        state = info["State"]
        _need(info["Image"] == row["imageId"]
              and info["HostConfig"]["RestartPolicy"] == {"Name": "no", "MaximumRetryCount": 0}
              and state.get("Status") == "exited" and state.get("Running") is False
              and state.get("Restarting") is False and state.get("Paused") is False,
              "writer stop or restart inhibition is unconfirmed")


def _stop_best_effort(record: dict, run) -> bool:
    success = True
    rows = list(record["originalContainers"].values())
    if record["schemaVersion"] == 2:
        rows = list(record["candidate"]["containers"].values()) + rows
    for row in rows:
        for args in (["docker", "update", "--restart=no", row["containerId"]],
                     ["docker", "stop", "--time", "30", row["containerId"]]):
            try:
                run(args, timeout=45)
            except Exception:
                success = False  # Never interpreted as proof that a writer stopped.
    return success


def _candidate_record(candidate: dict, originals: dict) -> None:
    _need(type(candidate) is dict and set(candidate) == {"release", "containers"},
          "candidate registration differs")
    plan._candidate(candidate["release"])
    rows = candidate["containers"]
    _need(type(rows) is dict and set(rows) == set(SERVICES), "candidate roles differ")
    for row in rows.values():
        _need(type(row) is dict and set(row) == {"containerId", "imageId"},
              "candidate identity fields differ")
        _id(row["containerId"])
        release.checked_digest(row["imageId"])
    _need(rows["api"]["imageId"] == rows["ubereats-worker"]["imageId"],
          "candidate API/worker images differ")
    identifiers = [row["containerId"] for row in originals.values()]
    identifiers += [row["containerId"] for row in rows.values()]
    _need(len(set(identifiers)) == 6, "candidate identities overlap")


def _role_ids(service: str, run) -> set[str]:
    raw = run(["docker", "ps", "-a", "--no-trunc",
               "--filter", "label=com.docker.compose.project=sanq-app",
               "--filter", "label=com.docker.compose.service=" + service,
               "--format", "{{.ID}}"])
    _need(type(raw) is str and len(raw) <= 1024, "writer inventory exceeds budget")
    identifiers = raw.splitlines()
    _need(len(identifiers) <= 2 and len(set(identifiers)) == len(identifiers),
          "writer inventory is ambiguous")
    return {_id(item) for item in identifiers}


def _stopped_identity(info: dict, row: dict, *, created: bool = False) -> None:
    state = info["State"]
    _need(info["Image"] == row["imageId"]
          and info["HostConfig"]["RestartPolicy"] == {"Name": "no", "MaximumRetryCount": 0}
          and state.get("Status") in (("created", "exited") if created else ("exited",))
          and state.get("Running") is False and state.get("Restarting") is False
          and state.get("Paused") is False, "registered writer stop is unconfirmed")


def _assert_registered_stopped(record: dict, run) -> None:
    """Require exact candidates; confirm absent originals by full role inventory."""
    candidate = record["candidate"]
    for service in SERVICES:
        original = record["originalContainers"][service]
        row = candidate["containers"][service]
        identifiers = _role_ids(service, run)
        _need(row["containerId"] in identifiers
              and identifiers <= {original["containerId"], row["containerId"]},
              "unknown, missing or replaced candidate writer")
        if original["containerId"] in identifiers:
            old = _inspect(original["containerId"], service, record["observedApplicationSha"], run)
            _stopped_identity(old, original)
        name = "sanq-web" if service == "web" else "sanq-api"
        image = candidate["release"]["images"][name]
        sha = candidate["release"]["sourceSha"]
        info = _inspect(row["containerId"], service, sha, run, reference=collector._pinned(image))
        _stopped_identity(info, row, created=True)


def register_created_candidates(identity: str, attempt: str, identifiers: dict, *,
                                run=collector.command, now=collector.now_utc) -> dict:
    """Unwired internal adapter: register all stopped candidates BEFORE any start.

    Never creates/starts containers, changes policy, writes release state or authorizes
    SQL. Future controller must create with restart=no and never start on unknown
    registration durability. An existing registration is never replayed or replaced.
    """
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    _need(type(identifiers) is dict and set(identifiers) == set(SERVICES),
          "exact candidate roles required")
    for identifier in identifiers.values():
        _id(identifier)
    with job._locked_directory(), storage._directory_fd(MAINTENANCE_DIR) as root:
        _need(set(os.listdir(root)) == {MARKER}, "unresolved maintenance leftovers")
        record = _read(root)
        _need(record["planId"] == identity and record["attemptId"] == attempt
              and record["schemaVersion"] == 1 and record["phase"] == "FROZEN",
              "candidate registration requires the same frozen attempt")
        _installed_gate(run)
        original_plan = plan.validate_plan(storage.load_plan(identity), identity)
        _need(original_plan["current"]["applicationSha"] == record["observedApplicationSha"],
              "plan baseline differs from maintenance")
        candidate = original_plan["candidate"]
        _need(candidate["sourceSha"] != record["observedApplicationSha"], "no new candidate")
        rows = {}
        for service in SERVICES:
            name = "sanq-web" if service == "web" else "sanq-api"
            image = candidate["images"][name]
            sha = candidate["sourceSha"]
            info = _inspect(identifiers[service], service, sha, run,
                            reference=collector._pinned(image))
            _need(info["State"].get("Status") == "created", "candidate was already started")
            row = {"containerId": identifiers[service], "imageId": info["Image"]}
            _stopped_identity(info, row, created=True)
            collector._inspect_image(info["Image"], collector._pinned(image), sha, run)
            rows[service] = row
        _need(rows["api"]["imageId"] == rows["ubereats-worker"]["imageId"],
              "API and worker must share the exact image")
        registered = {**record, "schemaVersion": 2, "phase": "CANDIDATES_REGISTERED",
                      "updatedAt": job._timestamp(now),
                      "candidate": {"release": candidate, "containers": rows}}
        _validate(registered)
        _assert_registered_stopped(registered, run)
        _need(_backup(run) == record["backupUnits"], "backup state changed")
        _write(root, registered)  # Unknown fsync/readback never permits a start.
        _assert_registered_stopped(registered, run)
        _installed_gate(run)
        return registered


def cleanup_after_task(identity: str, service_result: str, *, controller=None,
                       run=collector.command, now=collector.now_utc) -> dict:
    """Only the task adapter may call this after verifying its systemd context.

    No plan discovery, SQL, restore or clear. A missing pre-arm record is not
    success; a foreign or invalid marker never authorizes stopping any writer.
    """
    job._root_operator()
    identity = storage._plan_id(identity)
    with storage._directory_fd(MAINTENANCE_DIR) as root:
        if not os.listdir(root):
            return {"outcome": "NO_RECORDED_MAINTENANCE", "canExecute": False}
        record = _read(root)
        _need(record["planId"] == identity, "task does not own this maintenance marker")
    if service_result == "success" and record["phase"] == "FROZEN":
        return {"outcome": "RECORDED_FROZEN", "canExecute": False}
    if controller is None:
        import deploy_release as controller
    def bounded(args, **kwargs):
        return run(args, timeout=min(kwargs.get("timeout", 15), 45))
    with job._locked_directory(wait_seconds=10), storage._directory_fd(MAINTENANCE_DIR) as root:
        record = _read(root)
        _need(record["planId"] == identity, "maintenance owner changed before cleanup")
        _stop_best_effort(record, bounded)
        confirmed = False
        try:
            _assert_stopped(controller, record, bounded)
            _installed_gate(bounded)
            confirmed = True
        except Exception:
            confirmed = False
        code = "TASK_FAILED_WRITERS_STOPPED" if confirmed else "FENCE_UNCONFIRMED"
        incident = {**record, "phase": "INCIDENT", "updatedAt": job._timestamp(now),
                    "errorCode": code}
        _write(root, incident)
        if not confirmed:
            raise release.ReleaseContractError("FENCE_UNCONFIRMED: task cleanup requires review")
        return {"outcome": code, "planId": identity, "canExecute": False}


def freeze_for_plan(identity: str, *, controller=None, run=collector.command,
                    observe=None, fetch=None, now=collector.now_utc) -> dict:
    """Unwired maintenance adapter. Must NOT be called by the old deploy CLI."""
    job._root_operator()
    identity = storage._plan_id(identity)
    if controller is None:
        import deploy_release as controller
    observe = collector.collect if observe is None else observe
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    with job._locked_directory() as jobs_root, storage._directory_fd(MAINTENANCE_DIR) as root:
        job._no_pending(jobs_root)
        _need(not os.listdir(root), "unresolved maintenance evidence")
        _installed_gate(run)  # No policy/stop mutation before installed gate checks.
        raw = storage.load_plan(identity)
        original = plan.validate_plan(raw, identity)
        started = job._timestamp(now)
        plan.assert_same_observations(raw, identity, observed_at=started, **job._observations(original))
        with storage.preparation_lock():
            fresh_raw = observe(original["candidate"]["sourceSha"], cache_images=False)
            _need(type(fresh_raw) is bytes and 0 < len(fresh_raw) <= plan.MAX_PLAN_BYTES,
                  "invalid current observations")
            fresh = plan.validate_plan(fresh_raw, json.loads(fresh_raw)["planId"])
            observed_at = job._timestamp(now)
            _need(plan._utc(started) <= plan._utc(fresh["createdAt"]) <= plan._utc(observed_at),
                  "observation clock differs")
            plan.assert_same_observations(raw, identity, observed_at=observed_at,
                                          **job._observations(fresh))
            sha = original["current"]["applicationSha"]
            paired = release.sealed_release_for_sha(sha, fetch)
            containers = _original_containers(controller, sha, paired, run)
            backups = _backup(run)
            record = {"schemaVersion": 1, "kind": "sanq-maintenance-marker", "planId": identity,
                      "attemptId": uuid.uuid4().hex, "observedApplicationSha": sha,
                      "originalContainers": containers, "backupUnits": backups,
                      "phase": "ARMED", "createdAt": started, "updatedAt": observed_at,
                      "errorCode": None, "canExecute": False}
            _write(root, record, create=True)
            try:
                _need(_backup(run) == backups
                      and _original_containers(controller, sha, paired, run) == containers,
                      "baseline changed after maintenance arming")
                for row in containers.values():
                    run(["docker", "update", "--restart=no", row["containerId"]], timeout=45)
                for row in containers.values():
                    run(["docker", "stop", "--time", "30", row["containerId"]], timeout=45)
                _assert_stopped(controller, record, run)
                _need(_backup(run) == backups, "backup policy or state changed")
                _installed_gate(run)
            except BaseException:
                _stop_best_effort(record, run)
                try:
                    _write(root, {**record, "phase": "INCIDENT", "updatedAt": job._timestamp(now),
                                  "errorCode": "FENCE_UNCONFIRMED"})
                except BaseException as record_error:
                    raise release.ReleaseContractError(
                        "FENCE_UNCONFIRMED: maintenance outcome could not be persisted"
                    ) from record_error
                raise release.ReleaseContractError("FENCE_UNCONFIRMED: review retained maintenance evidence")
            frozen = {**record, "phase": "FROZEN", "updatedAt": job._timestamp(now)}
            _write(root, frozen)  # Unknown final durability is never retried/cleared.
            return frozen


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check-startup", "status"))
    args = parser.parse_args(argv)
    try:
        if args.command == "check-startup":
            check_startup()
        else:
            print(json.dumps(status(), indent=2))
        return 0
    except (release.ReleaseContractError, OSError, ValueError, TypeError, KeyError, RecursionError):
        print("Maintenance gate blocked; retained evidence requires review.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
