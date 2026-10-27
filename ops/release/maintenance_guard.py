"""Local maintenance preparation and cold-start gate; NOT installed/activated.

The CLI only checks startup or reads status. The separately verified task calls
internal locked stages. No standalone release, restore, unfreeze or SQL CLI.
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
import migration_container as migration

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
    repository = "ghcr.io/sanqin888/" + ("sanq-web" if service == "web" else "sanq-api")
    _need(type(info) is dict and info.get("Id") == identifier
          and type(info.get("Config")) is dict and type(info["Config"].get("Labels")) is dict
          and info["Config"]["Labels"].get("com.docker.compose.project") == "sanq-app"
          and info["Config"]["Labels"].get("com.docker.compose.service") == service
          and service in SERVICES, "container role or project differs")
    release.checked_digest(info.get("Image"))
    declared = info["Config"].get("Image")
    if reference is not None:
        _need(declared == reference, "container release reference differs")
    elif declared != repository + ":" + sha:
        # A previously promoted candidate keeps its digest declaration. Bind it
        # to the actual image on EVERY original-writer/cleanup observation.
        _need(isinstance(declared, str) and declared.startswith(repository + "@"),
              "original container release reference differs")
        release.checked_digest(declared[len(repository) + 1:])
        collector._inspect_image(info["Image"], declared, sha, run)
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
        pinned = collector._pinned(paired["images"][name])
        _need(info["Config"]["Image"] in (f"ghcr.io/sanqin888/{name}:{sha}", pinned),
              "original container reference differs from sealed release")
        collector._inspect_image(info["Image"], pinned, sha, run)
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
    _need(type(version) is int and version in (1, 2, 3, 4)
          and set(value) == (fields if version == 1 else fields |
              ({"candidate"} if version == 2 else {"migration"} if version == 3 else {"candidate", "migration"})),
          "maintenance fields differ")
    _need(type(value["schemaVersion"]) is int
          and value["kind"] == "sanq-maintenance-marker" and value["canExecute"] is False,
          "invalid maintenance record kind")
    storage._plan_id(value["planId"])
    job._attempt(value["attemptId"])
    release.require_sha(value["observedApplicationSha"])
    _need(plan._utc(value["updatedAt"]) >= plan._utc(value["createdAt"]), "maintenance clock moved backwards")
    _need(value["phase"] in ("ARMED", "FROZEN", "INCIDENT", "CREATING_CANDIDATES", "CANDIDATES_REGISTERED",
                              "STARTING_CANDIDATES", "CANDIDATES_READY", "FINALIZING", "HANDOFF_COMMITTED", "MIGRATION_CREATING", "MIGRATION_REGISTERED",
                              "STARTING_MIGRATION", "MIGRATION_VERIFIED"), "invalid maintenance phase")
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
    if version == 3:
        _need(value["phase"] in ("MIGRATION_CREATING", "MIGRATION_REGISTERED",
                                  "STARTING_MIGRATION", "MIGRATION_VERIFIED", "INCIDENT"),
              "invalid migration phase")
        migration.validate(value["migration"], rows)
        _need(value["migration"]["release"]["sourceSha"] != value["observedApplicationSha"],
              "migration target is unchanged")
        _need(value["phase"] == "INCIDENT" or
              (value["migration"]["container"] is None) == (value["phase"] == "MIGRATION_CREATING"),
              "migration registration phase differs")
    elif version == 1:
        _need(value["phase"] not in ("CREATING_CANDIDATES", "CANDIDATES_REGISTERED",
                                     "STARTING_CANDIDATES", "CANDIDATES_READY", "FINALIZING", "HANDOFF_COMMITTED"), "candidate registration is missing")
        _need(value["phase"] not in ("MIGRATION_CREATING", "MIGRATION_REGISTERED",
                                     "STARTING_MIGRATION", "MIGRATION_VERIFIED"), "migration record missing")
    else:
        _need(value["phase"] in ("CREATING_CANDIDATES", "CANDIDATES_REGISTERED", "INCIDENT",
                                 "STARTING_CANDIDATES", "CANDIDATES_READY", "FINALIZING", "HANDOFF_COMMITTED"), "invalid candidate phase")
        _candidate_record(value["candidate"], rows, incomplete=value["phase"] in ("CREATING_CANDIDATES", "INCIDENT"))
        if value["phase"] == "CREATING_CANDIDATES":
            _need(value["candidate"]["containers"] == {}, "creation intent already has identities")
        _need(value["candidate"]["release"]["sourceSha"] != value["observedApplicationSha"],
              "candidate release is unchanged")
    if version == 4:
        migration.validate(value["migration"], rows)
        item = value["migration"]
        _need(item["container"] is not None and item["release"] == value["candidate"]["release"]
              and item["container"]["containerId"] not in {
                  row["containerId"] for row in value["candidate"]["containers"].values()},
              "migration evidence overlaps or differs from application candidates")
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
        beginning = (((old["schemaVersion"] == 1 and old["phase"] == "FROZEN"
                       and value["schemaVersion"] == 2) or
                      (old["schemaVersion"] == 3 and old["phase"] == "MIGRATION_VERIFIED"
                       and value["schemaVersion"] == 4))
                     and value["phase"] == "CREATING_CANDIDATES"
                     and value["candidate"]["containers"] == {})
        registering = (old["schemaVersion"] in (2, 4)
                       and value["schemaVersion"] == old["schemaVersion"]
                       and old["phase"] == "CREATING_CANDIDATES"
                       and value["phase"] == "CANDIDATES_REGISTERED"
                       and old["candidate"]["containers"] == {}
                       and old["candidate"]["release"] == value["candidate"]["release"])
        migration_begin = (old["schemaVersion"] == 1 and old["phase"] == "FROZEN"
                           and value["schemaVersion"] == 3 and value["phase"] == "MIGRATION_CREATING")
        migration_register = (old["schemaVersion"] == value["schemaVersion"] == 3
            and old["phase"] == "MIGRATION_CREATING" and value["phase"] == "MIGRATION_REGISTERED"
            and old["migration"]["release"] == value["migration"]["release"]
            and old["migration"]["approvalSha256"] == value["migration"]["approvalSha256"])
        allowed = {"ARMED": ("FROZEN", "INCIDENT"), "FROZEN": ("INCIDENT",),
                   "CREATING_CANDIDATES": ("INCIDENT",),
                   "CANDIDATES_REGISTERED": ("STARTING_CANDIDATES", "INCIDENT"),
                   "STARTING_CANDIDATES": ("CANDIDATES_READY", "INCIDENT"),
                   "CANDIDATES_READY": ("FINALIZING", "INCIDENT"),
                   "FINALIZING": ("HANDOFF_COMMITTED", "INCIDENT"),
                   "HANDOFF_COMMITTED": ("INCIDENT",), "MIGRATION_CREATING": ("INCIDENT",),
                   "MIGRATION_REGISTERED": ("STARTING_MIGRATION", "INCIDENT"),
                   "STARTING_MIGRATION": ("MIGRATION_VERIFIED", "INCIDENT"),
                   "MIGRATION_VERIFIED": ("INCIDENT",), "INCIDENT": ("INCIDENT",)}
        ignored = {"phase", "updatedAt", "errorCode"}
        if migration_begin:
            ignored |= {"schemaVersion", "migration"}
        elif migration_register:
            ignored |= {"migration"}
        elif beginning:
            ignored |= {"schemaVersion", "candidate"}
        elif registering:
            ignored |= {"candidate"}
        _need((beginning or registering or migration_begin or migration_register or value["phase"] in allowed[old["phase"]])
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
    if record["schemaVersion"] in (2, 4):
        _need(bool(record["candidate"]["containers"]),
              "candidate creation is incomplete; no writer identity may be inferred")
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

    if record["schemaVersion"] in (3, 4):
        migration.assert_stopped(record, run)


def _stop_best_effort(record: dict, run) -> bool:
    success = True
    rows = list(record["originalContainers"].values())
    if record["schemaVersion"] in (2, 4):
        rows = list(record["candidate"]["containers"].values()) + rows
    if record["schemaVersion"] in (3, 4) and record["migration"]["container"] is not None:
        rows.insert(0, record["migration"]["container"])
    for row in rows:
        for args in (["docker", "update", "--restart=no", row["containerId"]],
                     ["docker", "stop", "--time", "30", row["containerId"]]):
            try:
                run(args, timeout=45)
            except Exception:
                success = False  # Never interpreted as proof that a writer stopped.
    return success


def _candidate_record(candidate: dict, originals: dict, *, incomplete: bool = False) -> None:
    _need(type(candidate) is dict and set(candidate) == {"release", "containers"},
          "candidate registration differs")
    plan._candidate(candidate["release"])
    rows = candidate["containers"]
    _need(type(rows) is dict, "candidate roles differ")
    if incomplete and not rows:
        return
    _need(set(rows) == set(SERVICES), "candidate roles differ")
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
    if record["schemaVersion"] == 4:
        migration.assert_stopped(record, run)
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


def begin_candidate_creation(identity: str, attempt: str, *, controller=None,
                             run=collector.command, now=collector.now_utc) -> dict:
    """Internal create-intention adapter; never create or start a container."""
    job._root_operator()
    with job._locked_directory(), storage._directory_fd(MAINTENANCE_DIR) as root:
        return _begin_candidate_creation_locked(root, identity, attempt, controller, run, now)

def _begin_candidate_creation_locked(root, identity, attempt, controller, run, now):
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    _need(set(os.listdir(root)) == {MARKER}, "unresolved maintenance leftovers")
    record = _read(root)
    _need(record["planId"] == identity and record["attemptId"] == attempt
          and ((record["schemaVersion"] == 1 and record["phase"] == "FROZEN")
               or (record["schemaVersion"] == 3 and record["phase"] == "MIGRATION_VERIFIED")),
          "creation requires the same frozen or migrated attempt")
    _installed_gate(run)
    original_plan = plan.validate_plan(storage.load_plan(identity), identity)
    _need(original_plan["current"]["applicationSha"] == record["observedApplicationSha"],
          "plan baseline differs from maintenance")
    if original_plan["pendingMigrations"]:
        migration.assert_application_history(original_plan, record, collector._history(controller, run), run)
    else:
        _need(record["schemaVersion"] == 1, "no-SQL creation requires the frozen record")
    _assert_stopped(controller, record, run)
    for service in SERVICES:
        _need(_role_ids(service, run) == {record["originalContainers"][service]["containerId"]},
              "unexpected writer exists before creation intent")
    _need(_backup(run) == record["backupUnits"], "backup state changed")
    intention = {**record, "schemaVersion": 4 if record["schemaVersion"] == 3 else 2,
                 "phase": "CREATING_CANDIDATES",
                 "updatedAt": job._timestamp(now),
                 "candidate": {"release": original_plan["candidate"], "containers": {}}}
    _write(root, intention)  # Neither an unknown write nor leftovers may be retried.
    return intention


def register_created_candidates(identity: str, attempt: str, identifiers: dict, *,
                                run=collector.command, now=collector.now_utc) -> dict:
    """Internal adapter; all created/no-restart candidates need a durable intention."""
    job._root_operator()
    with job._locked_directory(), storage._directory_fd(MAINTENANCE_DIR) as root:
        return _register_created_candidates_locked(root, identity, attempt, identifiers, run, now)

def _register_created_candidates_locked(root, identity, attempt, identifiers, run, now, *, controller=None):
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    _need(type(identifiers) is dict and set(identifiers) == set(SERVICES),
          "exact candidate roles required")
    for identifier in identifiers.values():
        _id(identifier)
    _need(set(os.listdir(root)) == {MARKER}, "unresolved maintenance leftovers")
    record = _read(root)
    _need(record["planId"] == identity and record["attemptId"] == attempt
          and record["schemaVersion"] in (2, 4) and record["phase"] == "CREATING_CANDIDATES"
          and record["candidate"]["containers"] == {},
          "candidate registration requires the same durable creation intent")
    _installed_gate(run)
    original_plan = plan.validate_plan(storage.load_plan(identity), identity)
    _need(original_plan["current"]["applicationSha"] == record["observedApplicationSha"],
          "plan baseline differs from maintenance")
    candidate = original_plan["candidate"]
    _need(candidate == record["candidate"]["release"], "creation intent and plan differ")
    if original_plan["pendingMigrations"]:
        if controller is None:
            import deploy_release as controller
        migration.assert_application_history(original_plan, record, collector._history(controller, run), run)
    else:
        _need(record["schemaVersion"] == 2, "no-SQL registration requires its original record")
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
    registered = {**record, "phase": "CANDIDATES_REGISTERED",
                  "updatedAt": job._timestamp(now),
                  "candidate": {"release": candidate, "containers": rows}}
    _validate(registered)
    _assert_registered_stopped(registered, run)
    _need(_backup(run) == record["backupUnits"], "backup state changed")
    _write(root, registered)  # Unknown fsync/readback never permits a start.
    _assert_registered_stopped(registered, run)
    _installed_gate(run)
    return registered


def _creation_config(expanded: dict, candidate: dict) -> bytes:
    """A complete stdin config excludes DB/dependencies and uses the existing network."""
    import copy
    _need(type(expanded) is dict and set(expanded) <= {"name", "services", "networks", "volumes"}
          and expanded.get("name") == "sanq-app"
          and set(expanded.get("services", {})) == {"db", *SERVICES}
          and set(expanded.get("networks", {})) == {"default"}
          and expanded["networks"]["default"].get("name") == "sanq-app_default",
          "unsupported creation configuration")
    services = copy.deepcopy({name: expanded["services"][name] for name in SERVICES})
    for service, fields in services.items():
        name = "sanq-web" if service == "web" else "sanq-api"
        _need("build" not in fields and "profiles" not in fields
              and "configs" not in fields and "secrets" not in fields
              and "deploy" not in fields
              and type(fields.get("scale", 1)) is int and fields.get("scale", 1) == 1
              and all(row.get("type") == "bind" for row in fields.get("volumes", [])),
              "unsupported candidate resources")
        fields.pop("depends_on", None)
        fields["image"], fields["restart"] = collector._pinned(candidate["images"][name]), "no"
    return plan._canonical({"name": "sanq-app", "services": services,
                            "networks": {"default": {"external": True, "name": "sanq-app_default"}}})


def _database_identity(controller, run) -> dict:
    identifier = _container_id(controller, "db", run)
    info = collector._json(run(["docker", "inspect", "--format", "{{json .}}", identifier]))
    _need(type(info) is dict and info.get("Id") == identifier
          and info.get("State", {}).get("Running") is True
          and info.get("Config", {}).get("Labels", {}).get("com.docker.compose.project") == "sanq-app"
          and info["Config"]["Labels"].get("com.docker.compose.service") == "db"
          and type(info.get("Mounts")) is list
          and sum(row.get("Type") == "volume" and row.get("Name") == "sanq-app_pgdata"
                  and row.get("Destination") == "/var/lib/postgresql/data"
                  for row in info["Mounts"]) == 1, "database identity differs")
    release.checked_digest(info.get("Image"))
    return {key: info[key] for key in ("Id", "Image", "Mounts")}


def _created_mounts(identifier: str, expected: list, run) -> None:
    info = collector._json(run(["docker", "inspect", "--format", "{{json .}}", identifier]))
    mounts = info.get("Mounts")
    _need(type(mounts) is list and len(mounts) == len(expected),
          "candidate mount count differs")
    for row in expected:
        _need(sum(actual.get("Type") == "bind" and actual.get("Source") == row["source"]
                  and actual.get("Destination") == row["target"]
                  and actual.get("RW") is (not row.get("read_only", False))
                  for actual in mounts) == 1, "candidate bind mount differs")


def prepare_candidate_containers(identity: str, attempt: str, *, controller=None,
                                 run=collector.command, fetch=None, now=collector.now_utc) -> dict:
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(MAINTENANCE_DIR) as root:
        return _prepare_candidate_containers_locked(root, jobs_root, identity, attempt, controller=controller, run=run, fetch=fetch, now=now)


def _prepare_candidate_containers_locked(root: int, jobs_root: int, identity: str, attempt: str, *, controller=None,
                                 run=collector.command, fetch=None, now=collector.now_utc,
                                 pending_config=None) -> dict:
    """Shared candidate creation stage body. No start, SQL, env update or ACTIVE.

    Holds both original locks through revalidation, intent, PENDING, create and
    registration. Unknown outcomes retain evidence and are never replayed here.
    """
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    _need(callable(getattr(controller, "write_creation_pending", None)),
          "installed controller lacks durable creation intent")
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    job._no_pending(jobs_root)
    raw = storage.load_plan(identity)
    original = plan.validate_plan(raw, identity)
    has_sql = bool(original["pendingMigrations"])
    _need(not has_sql or callable(pending_config), "SQL authorization path is not implemented")
    plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now),
                                  **job._observations(original))
    if has_sql:
        record = _read(root)
        _need(record["schemaVersion"] == 3 and record["phase"] == "MIGRATION_VERIFIED"
              and record["planId"] == identity and record["attemptId"] == attempt,
              "post-migration creation attempt differs")
        expanded = pending_config(original, controller, run)
        migration.assert_application_history(original, record, collector._history(controller, run), run)
        _need(collector._backup(controller) == original["backup"], "migration backup changed")
    else:
        before, installed, environment = collector._snapshot(controller, run)
        _need(before == original["current"] and environment == original["environment"]
              and plan.runtime_contract(installed, installed) == original["runtimeContract"]
              and collector._history(controller, run) == original["migrationHistory"]
              and collector._backup(controller) == original["backup"],
              "frozen plan observations changed")
    candidate = original["candidate"]
    _need(release.verify_exact_candidate(original["current"]["applicationSha"],
                                        candidate["sourceSha"], fetch) == candidate,
          "candidate proof changed")
    collector._resource_preflight(controller)
    for image in candidate["images"].values():
        collector._inspect_image(collector._pinned(image), collector._pinned(image),
                                 candidate["sourceSha"], run)
    rendered = collector._json(run(collector._compose(controller, "config", "--format", "json")))
    if has_sql:
        _need(rendered == expanded, "post-migration configuration drifted")
    expanded = rendered
    body = _creation_config(expanded, candidate)
    _need(len(body) <= collector.MAX_OUTPUT, "creation input exceeds command budget")
    database = _database_identity(controller, run)
    # Re-observe the exact base after preparing private stdin, before any durable mutation.
    if has_sql:
        _need(pending_config(original, controller, run) == expanded
              and collector._backup(controller) == original["backup"], "migration configuration changed")
        migration.assert_application_history(original, record, collector._history(controller, run), run)
    else:
        _need(collector._snapshot(controller, run) == (before, installed, environment),
              "configuration changed before creation")
    _begin_candidate_creation_locked(root, identity, attempt, controller, run, now)
    if not has_sql:
        controller.write_creation_pending(original["current"]["applicationSha"], candidate["sourceSha"])
    # Full config includes only the three app services and no depends_on/DB volumes.
    # Compose create has no --no-deps option; DB exclusion is structural.
    args = ["docker", "compose", "--project-name", "sanq-app", "--project-directory",
            str(controller.ROOT), "--env-file", str(controller.ENV), "--parallel", "1",
            "-f", "-", "create", "--no-build", "--pull", "never", "--force-recreate", *SERVICES]
    run(args, input_bytes=body, timeout=180)
    _need(_database_identity(controller, run) == database, "database changed during creation")
    identifiers = {service: _container_id(controller, service, run) for service in SERVICES}
    for service, identifier in identifiers.items():
        _created_mounts(identifier, expanded["services"][service].get("volumes", []), run)
    registered = _register_created_candidates_locked(root, identity, attempt, identifiers, run, now,
                                                      controller=controller)
    if has_sql:
        migration.assert_application_history(original, registered, collector._history(controller, run), run)
    return {"planId": identity, "attemptId": registered["attemptId"],
            "outcome": "CANDIDATES_CREATED_NOT_STARTED", "canExecute": False}

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
        return _incident_locked(root, identity, controller, bounded, now)


def _incident_locked(root, identity, controller, bounded, now):
    """Shared failed-stage cleanup; caller holds the original task lock."""
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
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(MAINTENANCE_DIR) as root:
        return _freeze_for_plan_locked(root, jobs_root, identity, controller=controller, run=run, observe=observe, fetch=fetch, now=now)


def _freeze_for_plan_locked(root: int, jobs_root: int, identity: str, *, controller=None, run=collector.command,
                    observe=None, fetch=None, now=collector.now_utc) -> dict:
    """Maintenance stage body; caller holds job and plan locks."""
    job._root_operator()
    identity = storage._plan_id(identity)
    if controller is None:
        import deploy_release as controller
    observe = collector.collect if observe is None else observe
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    job._no_pending(jobs_root)
    _need(not os.listdir(root), "unresolved maintenance evidence")
    _installed_gate(run)  # No policy/stop mutation before installed gate checks.
    raw = storage.load_plan(identity)
    original = plan.validate_plan(raw, identity)
    started = job._timestamp(now)
    plan.assert_same_observations(raw, identity, observed_at=started, **job._observations(original))
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


def begin_migration_creation(identity, attempt, approval, *, controller=None,
                             run=collector.command, now=collector.now_utc):
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(MAINTENANCE_DIR) as root:
        return _begin_migration_creation_locked(root, jobs_root, identity, attempt, approval, controller=controller, run=run, now=now)


def _begin_migration_creation_locked(root, jobs_root, identity, attempt, approval, *, controller=None,
                             run=collector.command, now=collector.now_utc):
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    job._no_pending(jobs_root)
    _need(set(os.listdir(root)) == {MARKER}, "unresolved maintenance leftovers")
    record = _read(root)
    _need(record["schemaVersion"] == 1 and record["phase"] == "FROZEN"
          and record["planId"] == identity and record["attemptId"] == attempt, "migration attempt differs")
    raw = storage.load_plan(identity)
    original = plan.validate_plan(raw, identity)
    _need(bool(original["pendingMigrations"]), "no SQL requires no migration container")
    plan.assert_sql_approval(raw, identity, approval)
    plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now),
                                  **job._observations(original))
    _need(record["observedApplicationSha"] == original["current"]["applicationSha"],
          "migration baseline differs")
    _installed_gate(run)
    _assert_stopped(controller, record, run)
    _need(_backup(run) == record["backupUnits"], "backup state changed")
    value = {**record, "schemaVersion": 3, "phase": "MIGRATION_CREATING",
             "updatedAt": job._timestamp(now), "migration": {
                 "release": original["candidate"], "approvalSha256": approval, "container": None}}
    _need(not migration.ids(value, run), "migration container already exists")
    _write(root, value)
    return value


def register_created_migration(identity, attempt, container_id, *, controller=None,
                               run=collector.command, now=collector.now_utc):
    job._root_operator()
    with job._locked_directory() as jobs_root, storage.preparation_lock(), storage._directory_fd(MAINTENANCE_DIR) as root:
        return _register_created_migration_locked(root, jobs_root, identity, attempt, container_id, controller=controller, run=run, now=now)


def _register_created_migration_locked(root, jobs_root, identity, attempt, container_id, *, controller=None,
                               run=collector.command, now=collector.now_utc):
    job._root_operator()
    identity, attempt = storage._plan_id(identity), job._attempt(attempt)
    if controller is None:
        import deploy_release as controller
    _need(set(os.listdir(root)) == {MARKER}, "unresolved maintenance leftovers")
    record = _read(root)
    _need(record["schemaVersion"] == 3 and record["phase"] == "MIGRATION_CREATING"
          and record["planId"] == identity and record["attemptId"] == attempt, "migration intent differs")
    raw = storage.load_plan(identity)
    original = plan.validate_plan(raw, identity)
    plan.assert_sql_approval(raw, identity, record["migration"]["approvalSha256"])
    plan.assert_same_observations(raw, identity, observed_at=job._timestamp(now),
                                  **job._observations(original))
    _need(original["candidate"] == record["migration"]["release"], "migration proof changed")
    _installed_gate(run)
    baseline = {k: v for k, v in record.items() if k != "migration"}
    _assert_stopped(controller, {**baseline, "schemaVersion": 1, "phase": "FROZEN"}, run)
    _need(_backup(run) == record["backupUnits"], "backup state changed")
    _need(migration.ids(record, run) == {migration.identifier(container_id)}, "migration inventory differs")
    info = migration.inspect_container(record, container_id, run, created=True)
    value = {**record, "phase": "MIGRATION_REGISTERED", "updatedAt": job._timestamp(now),
             "migration": {**record["migration"],
                           "container": {"containerId": container_id, "imageId": info["Image"]}}}
    _write(root, value)
    migration.assert_stopped(value, run)
    return value


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
