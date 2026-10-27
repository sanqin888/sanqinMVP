"""Uninstalled migration-container identity checks; no create/start/SQL entry."""

from __future__ import annotations

import re
import collect_deployment_plan as collector
import deployment_plan as plan
import release_contract as release

ENTRYPOINT = ["/bin/sh"]
COMMAND = ["-lc", "cd /app/apps/api && exec npx --no-install prisma migrate deploy --schema=prisma/schema.prisma"]


def need(condition, reason):
    if not condition:
        raise release.ReleaseContractError(reason)


def identifier(value):
    need(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None,
         "migration container identity differs")
    return value


def validate(value, originals):
    need(type(value) is dict and set(value) == {"release", "approvalSha256", "container"},
         "migration fields differ")
    plan._candidate(value["release"])
    plan._sha256(value["approvalSha256"])
    row = value["container"]
    if row is not None:
        need(type(row) is dict and set(row) == {"containerId", "imageId"}, "migration identity fields differ")
        identifier(row["containerId"])
        release.checked_digest(row["imageId"])
        need(row["containerId"] not in {r["containerId"] for r in originals.values()},
             "migration identity overlaps original writer")


def ids(record, run):
    raw = run(["docker", "ps", "-a", "--no-trunc",
        "--filter", "label=io.sanq.release.role=migration",
        "--filter", "label=io.sanq.release.attempt=" + record["attemptId"],
        "--format", "{{.ID}}"], timeout=15)
    need(type(raw) is str and len(raw) <= 1024, "migration inventory exceeds budget")
    rows = raw.splitlines()
    need(len(rows) <= 1, "ambiguous migration inventory")
    return {identifier(row) for row in rows}


def inspect_container(record, container_id, run, *, created=False):
    item = record["migration"]
    image = item["release"]["images"]["sanq-api"]
    info = collector._json(run(["docker", "inspect", "--format", "{{json .}}",
                               identifier(container_id)], timeout=15))
    need(type(info) is dict and info.get("Id") == container_id
         and info.get("Name") == "/sanq-migrate-" + record["attemptId"],
         "migration name or identity differs")
    config, host, state = info.get("Config"), info.get("HostConfig"), info.get("State")
    need(type(config) is dict and type(host) is dict and type(state) is dict,
         "migration inspection fields missing")
    labels = config.get("Labels")
    need(type(labels) is dict and labels.get("io.sanq.release.role") == "migration"
         and labels.get("io.sanq.release.plan") == record["planId"]
         and labels.get("io.sanq.release.attempt") == record["attemptId"]
         and config.get("Image") == collector._pinned(image)
         and config.get("Entrypoint") == ENTRYPOINT and config.get("Cmd") == COMMAND,
         "migration role, release or command differs")
    need(host.get("RestartPolicy") == {"Name": "no", "MaximumRetryCount": 0}
         and host.get("AutoRemove") is False and host.get("Privileged") is False
         and host.get("NetworkMode") == "sanq-app_default" and info.get("Mounts") == [],
         "migration isolation or retained evidence differs")
    need(state.get("Running") is False and state.get("Restarting") is False
         and state.get("Paused") is False
         and state.get("Status") in (("created",) if created else ("created", "exited")),
         "migration writer is not confirmed stopped")
    release.checked_digest(info.get("Image"))
    collector._inspect_image(info["Image"], collector._pinned(image), item["release"]["sourceSha"], run)
    return info


def assert_stopped(record, run):
    row = record["migration"]["container"]
    need(row is not None, "migration creation outcome is unregistered")
    need(ids(record, run) == {row["containerId"]}, "migration container is missing or replaced")
    info = inspect_container(record, row["containerId"], run)
    need(info["Image"] == row["imageId"], "migration image identity changed")


def creation_config(expanded, record):
    """One fixed service; pass only the database URL via private config stdin."""
    environment = expanded.get("services", {}).get("api", {}).get("environment")
    need(type(environment) is dict and isinstance(environment.get("DATABASE_URL"), str)
         and 0 < len(environment["DATABASE_URL"]) <= 16384, "database environment is missing or invalid")
    service = {"image": collector._pinned(record["migration"]["release"]["images"]["sanq-api"]),
        "container_name": "sanq-migrate-" + record["attemptId"], "restart": "no",
        "entrypoint": ENTRYPOINT, "command": COMMAND, "privileged": False,
        "environment": {"DATABASE_URL": environment["DATABASE_URL"].replace("$", "$$")},
        "networks": ["default"], "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"], "mem_limit": "256m",
        "cpus": 0.5, "pids_limit": 64, "healthcheck": {"disable": True},
        "labels": {"io.sanq.release.role": "migration", "io.sanq.release.plan": record["planId"],
                   "io.sanq.release.attempt": record["attemptId"]}}
    return plan._canonical({"name": "sanq-app", "services": {"sanq-migration": service},
        "networks": {"default": {"external": True, "name": "sanq-app_default"}}})


def assert_completed(record, run):
    """A zero wait result alone cannot establish the retained container outcome."""
    assert_stopped(record, run)
    row = record["migration"]["container"]
    info = inspect_container(record, row["containerId"], run)
    state = info["State"]
    need(info["Image"] == row["imageId"] and state.get("Status") == "exited"
         and type(state.get("ExitCode")) is int and state["ExitCode"] == 0
         and state.get("OOMKilled") is False and state.get("Dead") is False
         and state.get("Error") == "" and type(info.get("RestartCount")) is int
         and info["RestartCount"] == 0, "migration completion is unconfirmed")


def assert_applied_history(original, history):
    """Preserve every old row and add exactly the approved applied rows."""
    expected = original["migrationHistory"] + [
        {**row, "state": "applied"} for row in original["pendingMigrations"]]
    need(type(history) is list and len(history) == len(expected)
         and sorted(plan._canonical(row) for row in history) ==
             sorted(plan._canonical(row) for row in expected),
         "migration history differs from the exact approved delta")


def assert_application_history(original, record, history, run):
    """Keep the original review immutable; require retained SQL proof when pending."""
    if not original["pendingMigrations"]:
        need(record["schemaVersion"] in (1, 2) and history == original["migrationHistory"],
             "application history differs from the no-SQL plan")
        return True
    need(record["schemaVersion"] == 4 or
         (record["schemaVersion"] == 3 and record["phase"] == "MIGRATION_VERIFIED"),
         "application creation requires verified migration evidence")
    item = record["migration"]
    need(item["release"] == original["candidate"]
         and record["observedApplicationSha"] == original["current"]["applicationSha"],
         "migration release differs from the reviewed application")
    plan.assert_sql_approval(plan._canonical(original) + b"\n", original["planId"], item["approvalSha256"])
    assert_completed(record, run)
    assert_applied_history(original, history)
    return True
