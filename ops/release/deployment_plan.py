"""Review-only deployment plans. No filesystem, Docker, SQL or execution authority.

Inputs are observations from trusted adapters, not self-authenticating evidence.
The separate collector/store may prepare review records; guarded apply is later work.
"""

from __future__ import annotations

import base64
import binascii
import datetime as dt
import hashlib
import json
import re
from typing import Any

from release_contract import (
    REPOSITORY, RUN_URL_PATTERN, ReleaseContractError, checked_digest, require_sha,
)

RUNTIME_FILES = ("docker-compose.yml", "ops/verify-runtime-readiness.sh")
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_PLAN_BYTES = 4 * 1024 * 1024
MAX_MIGRATIONS = 10000
MIGRATION_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,199}\Z")
HEX = re.compile(r"[a-f0-9]{64}\Z")
ENV_KEY = re.compile(r"[A-Z_][A-Z0-9_]{0,127}\Z")
BACKUP_NAME = re.compile(r"sanqin_db_[0-9]{8}_[0-9]{6}\.sql\.gz\Z")


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise ReleaseContractError(reason)


def _fields(value: Any, fields: set[str], label: str) -> dict:
    _require(type(value) is dict and set(value) == fields, label + " fields differ")
    return value


def _sha256(value: Any) -> str:
    _require(isinstance(value, str) and HEX.fullmatch(value) is not None,
             "invalid SHA256")
    return value


def _integer(value: Any, *, maximum: int | None = None) -> int:
    _require(type(value) is int and value > 0
             and (maximum is None or value <= maximum), "invalid positive integer")
    return value


def _utc(value: Any) -> dt.datetime:
    _require(isinstance(value, str) and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z", value
    ) is not None, "timestamp must be UTC")
    try:
        parsed = dt.datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ReleaseContractError("invalid UTC timestamp") from exc
    return parsed


def _canonical(value: Any) -> bytes:
    try:
        result = json.dumps(value, ensure_ascii=True, sort_keys=True,
                            separators=(",", ":"), allow_nan=False).encode("ascii")
    except (TypeError, ValueError, RecursionError) as exc:
        raise ReleaseContractError("invalid plan JSON") from exc
    _require(len(result) <= MAX_PLAN_BYTES, "plan exceeds size budget")
    return result


def _unique_object(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON field")
        result[key] = value
    return result


def fetch_runtime_files(source_sha: str, fetch) -> dict[str, bytes]:
    """Read two exact GitHub objects; never inspect a truncated whole-repo diff."""
    source_sha = require_sha(source_sha)
    result = {}
    for path in RUNTIME_FILES:
        item = fetch(f"/repos/{REPOSITORY}/contents/{path}?ref={source_sha}")
        _require(type(item) is dict and item.get("type") == "file"
                 and item.get("path") == path and item.get("encoding") == "base64",
                 "runtime object is not an exact regular file")
        size = _integer(item.get("size"), maximum=MAX_FILE_BYTES)
        blob = require_sha(item.get("sha", ""))
        encoded = item.get("content")
        _require(isinstance(encoded, str) and len(encoded) <= 3 * MAX_FILE_BYTES,
                 "runtime object content missing or oversized")
        try:
            raw = base64.b64decode(encoded.replace("\n", ""), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ReleaseContractError("runtime object encoding invalid") from exc
        _require(len(raw) == size, "runtime object size mismatch")
        git_hash = hashlib.sha1(b"blob " + str(size).encode() + b"\0" + raw).hexdigest()
        _require(git_hash == blob, "runtime object Git hash mismatch")
        result[path] = raw
    return result


def runtime_contract(installed: dict, target: dict) -> dict:
    """Return content pins only for actual first-version runtime requirements."""
    _require(type(installed) is dict and set(installed) == set(RUNTIME_FILES)
             and type(target) is dict and set(target) == set(RUNTIME_FILES),
             "runtime contract file set differs")
    result = {}
    for path in RUNTIME_FILES:
        old, new = installed[path], target[path]
        _require(type(old) is bytes and type(new) is bytes
                 and 0 < len(old) <= MAX_FILE_BYTES and 0 < len(new) <= MAX_FILE_BYTES,
                 "runtime contract needs bounded original bytes")
        _require(old == new, "NEEDS_PLATFORM_UPDATE: " + path)
        result[path] = hashlib.sha256(old).hexdigest()
    return result


def migration_inventory(files: dict[str, bytes]) -> list[dict]:
    """Hash original SQL bytes; never parse, execute or declare the SQL safe."""
    _require(type(files) is dict and 0 < len(files) <= MAX_MIGRATIONS,
             "invalid migration file collection")
    _require(all(isinstance(name, str) and MIGRATION_NAME.fullmatch(name)
                 for name in files), "invalid migration name")
    result = []
    total = 0
    for name, raw in sorted(files.items()):
        _require(type(raw) is bytes and 0 < len(raw) <= MAX_FILE_BYTES,
                 "invalid SQL bytes")
        total += len(raw)
        _require(total <= 32 * MAX_FILE_BYTES, "SQL collection exceeds budget")
        result.append({"name": name, "sha256": hashlib.sha256(raw).hexdigest(),
                       "bytes": len(raw),
                       "gitBlobSha": hashlib.sha1(
                           b"blob " + str(len(raw)).encode() + b"\0" + raw
                       ).hexdigest()})
    return result


def verify_migration_objects(inventory: list, tree: dict, *, expected_tree_sha: str) -> None:
    """Bind a complete image SQL inventory to a separately authenticated Git tree.

    The caller must authenticate the tree's commit binding. This function does
    not infer that binding from the tree's own sha or a caller-provided boolean.
    """
    _inventory(inventory)
    require_sha(expected_tree_sha)
    _require(type(tree) is dict and tree.get("sha") == expected_tree_sha
             and tree.get("truncated") is False
             and type(tree.get("tree")) is list, "incomplete migration Git tree")
    expected = {}
    prefix = "apps/api/prisma/migrations/"
    for entry in tree["tree"]:
        _require(type(entry) is dict and isinstance(entry.get("path"), str),
                 "invalid Git tree entry")
        path = entry["path"]
        if not path.startswith(prefix) or not path.endswith("/migration.sql"):
            continue
        name = path[len(prefix):-len("/migration.sql")]
        _require(MIGRATION_NAME.fullmatch(name) is not None
                 and entry.get("type") == "blob"
                 and entry.get("mode") in ("100644", "100755")
                 and name not in expected, "invalid migration Git object")
        expected[name] = (require_sha(entry.get("sha", "")),
                          _integer(entry.get("size"), maximum=MAX_FILE_BYTES))
    observed = {item["name"]: (item["gitBlobSha"], item["bytes"]) for item in inventory}
    _require(observed == expected, "image SQL inventory differs from source")


def _inventory(items: Any) -> dict:
    _require(type(items) is list and 0 < len(items) <= MAX_MIGRATIONS,
             "invalid migration inventory")
    result = {}
    for item in items:
        _fields(item, {"name", "sha256", "bytes", "gitBlobSha"}, "migration")
        name = item["name"]
        _require(isinstance(name, str) and MIGRATION_NAME.fullmatch(name)
                 and name not in result, "duplicate or invalid migration")
        _sha256(item["sha256"])
        require_sha(item["gitBlobSha"])
        _integer(item["bytes"], maximum=MAX_FILE_BYTES)
        result[name] = item
    _require(list(result) == sorted(result), "migrations must be in source order")
    return result


def _candidate(value: Any) -> None:
    _fields(value, {"sourceSha", "publicationUrl", "ciRunId", "images"}, "candidate")
    sha = require_sha(value["sourceSha"])
    _require(isinstance(value["publicationUrl"], str)
             and RUN_URL_PATTERN.fullmatch(value["publicationUrl"]) is not None,
             "invalid publication URL")
    _integer(value["ciRunId"])
    _fields(value["images"], {"sanq-api", "sanq-web"}, "image pair")
    for name, item in value["images"].items():
        _fields(item, {"ref", "digest"}, "image")
        _require(item["ref"] == f"ghcr.io/sanqin888/{name}:{sha}",
                 "candidate reference differs from exact SHA")
        checked_digest(item["digest"])


def _validate_body(body: Any) -> None:
    _fields(body, {"schemaVersion", "kind", "current", "candidate", "runtimeContract",
                   "migrationInventory", "migrationHistory", "pendingMigrations",
                   "backup", "environment", "createdAt", "canExecute"}, "plan")
    _require(type(body["schemaVersion"]) is int and body["schemaVersion"] == 1
             and body["kind"] == "sanq-deployment-review-plan"
             and body["canExecute"] is False, "plan is review-only")
    current = _fields(body["current"], {"applicationSha", "runtimeSourceSha",
                      "manifestSha256", "releaseStateSha256", "configurationSha256"},
                      "current")
    require_sha(current["applicationSha"])
    require_sha(current["runtimeSourceSha"])
    for key in ("manifestSha256", "releaseStateSha256", "configurationSha256"):
        _sha256(current[key])
    _candidate(body["candidate"])
    pins = _fields(body["runtimeContract"], set(RUNTIME_FILES), "runtime contract")
    for pin in pins.values():
        _sha256(pin)
    inventory = _inventory(body["migrationInventory"])
    history = body["migrationHistory"]
    _require(type(history) is list and len(history) <= 2 * MAX_MIGRATIONS,
             "invalid migration history")
    applied = {}
    for row in history:
        _fields(row, {"name", "sha256", "state"}, "history row")
        name = row["name"]
        _require(isinstance(name, str) and MIGRATION_NAME.fullmatch(name),
                 "invalid history name")
        _sha256(row["sha256"])
        _require(row["state"] in ("applied", "rolled-back"),
                 "failed or unknown migration history")
        if row["state"] == "applied":
            _require(name not in applied and name in inventory
                     and row["sha256"] == inventory[name]["sha256"],
                     "applied migration missing, modified or duplicated")
            applied[name] = row["sha256"]
    names = list(inventory)
    _require(set(names[:len(applied)]) == set(applied),
             "migration history is not a complete source prefix")
    pending = [{"name": name, "sha256": inventory[name]["sha256"]}
               for name in names if name not in applied]
    _require(body["pendingMigrations"] == pending,
             "pending SQL differs from source and database history")
    backup = _fields(body["backup"], {"fileName", "sha256", "bytes", "modifiedAt"},
                     "backup")
    _require(isinstance(backup["fileName"], str)
             and BACKUP_NAME.fullmatch(backup["fileName"]), "invalid backup identity")
    _sha256(backup["sha256"])
    _integer(backup["bytes"])
    created, modified = _utc(body["createdAt"]), _utc(backup["modifiedAt"])
    _require(dt.timedelta(0) <= created - modified <= dt.timedelta(hours=26),
             "backup is future-dated or older than 26 hours")
    environment = _fields(body["environment"], {"requiredKeys", "missingKeys"},
                          "environment")
    keys = environment["requiredKeys"]
    _require(type(keys) is list and len(keys) <= 512
             and all(isinstance(key, str) and ENV_KEY.fullmatch(key) for key in keys)
             and keys == sorted(set(keys)) and environment["missingKeys"] == [],
             "required environment keys are missing, duplicated or invalid")


def create_plan(*, current: dict, candidate: dict, runtime_pins: dict,
                inventory: list, history: list, pending: list,
                backup: dict, environment: dict, created_at: str) -> bytes:
    """Create canonical review bytes, not a capability or execution approval."""
    body = {
        "schemaVersion": 1, "kind": "sanq-deployment-review-plan",
        "current": current, "candidate": candidate, "runtimeContract": runtime_pins,
        "migrationInventory": inventory, "migrationHistory": history,
        "pendingMigrations": pending, "backup": backup, "environment": environment,
        "createdAt": created_at, "canExecute": False,
    }
    _validate_body(body)
    plan_id = hashlib.sha256(_canonical(body)).hexdigest()
    result = _canonical({**body, "planId": plan_id}) + b"\n"
    _require(len(result) <= MAX_PLAN_BYTES, "plan exceeds size budget")
    return result


def validate_plan(raw: bytes, expected_plan_id: str) -> dict:
    """Check canonical bytes and an independently retained plan id."""
    _sha256(expected_plan_id)
    _require(type(raw) is bytes and 0 < len(raw) <= MAX_PLAN_BYTES,
             "invalid plan bytes")
    try:
        value = json.loads(raw, object_pairs_hook=_unique_object)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise ReleaseContractError("invalid or duplicate plan JSON") from exc
    _require(type(value) is dict and "planId" in value, "plan id missing")
    body = {key: item for key, item in value.items() if key != "planId"}
    _validate_body(body)
    actual = hashlib.sha256(_canonical(body)).hexdigest()
    _require(value["planId"] == actual == expected_plan_id, "plan id mismatch")
    _require(raw == _canonical(value) + b"\n", "noncanonical plan bytes")
    return value


def assert_same_observations(raw: bytes, expected_plan_id: str, *,
                             observed_at: str, **observations) -> None:
    """Compare freshly collected observations, without authorizing an apply."""
    plan = validate_plan(raw, expected_plan_id)
    now = _utc(observed_at)
    _require(now >= _utc(plan["createdAt"]) and dt.timedelta(0) <=
             now - _utc(plan["backup"]["modifiedAt"]) <= dt.timedelta(hours=26),
             "clock moved backwards or backup expired; prepare a new plan")
    _require("created_at" not in observations, "cannot replace the plan timestamp")
    fresh = create_plan(created_at=plan["createdAt"], **observations)
    _require(fresh == raw, "plan baseline changed; prepare a new plan")


def sql_review(raw: bytes, expected_plan_id: str) -> dict:
    """Describe exact pending SQL. The digest binds review scope, not authority."""
    value = validate_plan(raw, expected_plan_id)
    inventory = {item["name"]: item for item in value["migrationInventory"]}
    body = {"kind": "sanq-exact-sql-review-v1", "planId": expected_plan_id,
            "targetSha": value["candidate"]["sourceSha"],
            "apiImage": dict(value["candidate"]["images"]["sanq-api"]),
            "migrations": [dict(inventory[item["name"]]) for item in value["pendingMigrations"]]}
    return {**body,
            "approvalSha256": hashlib.sha256(_canonical(body)).hexdigest() if body["migrations"] else None,
            "requiresExplicitApproval": bool(body["migrations"]),
            "sqlSafetyAssessed": False, "canExecute": False}


def assert_sql_approval(raw: bytes, expected_plan_id: str, approved_sha256: str | None) -> None:
    """Compare a separately supplied scope digest; never infer SQL safety or run it."""
    review = sql_review(raw, expected_plan_id)
    expected = review["approvalSha256"]
    if expected is None:
        _require(approved_sha256 is None, "no pending SQL permits no SQL approval")
    else:
        _require(_sha256(approved_sha256) == expected,
                 "SQL approval differs from the exact reviewed plan")



def _rollback_state(raw: bytes, current: dict, candidate: dict, created_at: str) -> dict:
    _require(type(raw) is bytes and 0 < len(raw) <= 16384, "rollback state bytes invalid")
    try:
        state = json.loads(raw, object_pairs_hook=_unique_object)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ReleaseContractError("rollback state JSON invalid") from exc
    _fields(state, {"schemaVersion", "phase", "current", "previous", "reason", "updatedAt"}, "release state")
    _require(type(state["schemaVersion"]) is int and state["schemaVersion"] == 1
             and state["phase"] in ("active", "rolled-back"), "rollback requires a resolved release state")
    _require(state["reason"] == ("readiness-verified" if state["phase"] == "active" else "rollback-verified"),
             "release state completion reason differs")
    require_sha(state["current"])
    require_sha(state["previous"])
    _require(state["current"] == current["applicationSha"]
             and state["previous"] == candidate["sourceSha"]
             and state["current"] != state["previous"], "rollback target must be the exact recorded previous")
    _require(hashlib.sha256(raw).hexdigest() == current["releaseStateSha256"],
             "rollback state bytes differ from current observation")
    _require(_utc(state["updatedAt"]) <= _utc(created_at), "rollback state is future dated")
    return state


def _validate_rollback_body(body: dict) -> None:
    _require(type(body) is dict and body.get("kind") == "sanq-rollback-review-plan"
             and "releaseStateRaw" in body and "targetMigrationInventory" in body,
             "rollback review kind or fields differ")
    common = {key: value for key, value in body.items()
              if key not in ("releaseStateRaw", "targetMigrationInventory")}
    _validate_body({**common, "kind": "sanq-deployment-review-plan"})
    _require(body["pendingMigrations"] == [], "rollback cannot apply unapplied current SQL")
    _require(isinstance(body["releaseStateRaw"], str), "rollback state original bytes missing")
    try:
        state_raw = body["releaseStateRaw"].encode("utf-8")
    except UnicodeError as exc:
        raise ReleaseContractError("rollback state encoding invalid") from exc
    _rollback_state(state_raw, body["current"], body["candidate"], body["createdAt"])
    target = _inventory(body["targetMigrationInventory"])
    current = body["migrationInventory"]
    _require(list(target.values()) == current[:len(target)],
             "rollback target SQL is not an unchanged source prefix")


def create_rollback_review(*, release_state: bytes, target_inventory: list, **observations) -> bytes:
    """Pure review artifact; no persistence, recovery or backward SQL execution."""
    forward = json.loads(create_plan(**observations))
    body = {key: value for key, value in forward.items() if key != "planId"}
    _require(type(release_state) is bytes and 0 < len(release_state) <= 16384,
             "rollback state original bytes missing or oversized")
    try:
        text = release_state.decode("utf-8")
    except UnicodeError as exc:
        raise ReleaseContractError("rollback state encoding invalid") from exc
    body.update(kind="sanq-rollback-review-plan", releaseStateRaw=text,
                targetMigrationInventory=target_inventory)
    _validate_rollback_body(body)
    identity = hashlib.sha256(_canonical(body)).hexdigest()
    raw = _canonical({**body, "planId": identity}) + b"\n"
    _require(len(raw) <= MAX_PLAN_BYTES, "rollback review exceeds size budget")
    return raw


def validate_rollback_review(raw: bytes, expected_plan_id: str) -> dict:
    _sha256(expected_plan_id)
    _require(type(raw) is bytes and 0 < len(raw) <= MAX_PLAN_BYTES, "rollback review bytes invalid")
    try:
        value = json.loads(raw, object_pairs_hook=_unique_object)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ReleaseContractError("rollback review JSON invalid") from exc
    _require(type(value) is dict and "planId" in value, "rollback review id missing")
    body = {key: item for key, item in value.items() if key != "planId"}
    _validate_rollback_body(body)
    _require(hashlib.sha256(_canonical(body)).hexdigest() == value["planId"] == expected_plan_id
             and raw == _canonical(value) + b"\n", "rollback review identity or canonical bytes differ")
    return value


def rollback_review_summary(raw: bytes, expected_plan_id: str) -> dict:
    value = validate_rollback_review(raw, expected_plan_id)
    extra = value["migrationInventory"][len(value["targetMigrationInventory"]):]
    scope = {"kind": "sanq-rollback-compatibility-review-v1", "planId": expected_plan_id}
    return {"planId": expected_plan_id, "currentSha": value["current"]["applicationSha"],
            "targetSha": value["candidate"]["sourceSha"], "extraAppliedMigrations": extra,
            "compatibilityApprovalSha256": hashlib.sha256(_canonical(scope)).hexdigest(),
            "requiresExplicitCompatibilityReview": True, "databaseCompatibilityProven": False,
            "incidentRecoveryAuthorized": False, "canExecute": False}


def assert_rollback_compatibility(raw: bytes, expected_plan_id: str, approved_sha256: str) -> None:
    """Bind an independent acknowledgement, including when SQL inventories match."""
    review = rollback_review_summary(raw, expected_plan_id)
    _require(_sha256(approved_sha256) == review["compatibilityApprovalSha256"],
             "compatibility acknowledgement differs from the exact rollback review")


def assert_same_rollback_observations(raw: bytes, expected_plan_id: str, *,
                                      fresh_raw: bytes, observed_at: str) -> None:
    """Compare two trusted collections, not a persisted permission to execute."""
    original = validate_rollback_review(raw, expected_plan_id)
    _require(type(fresh_raw) is bytes and 0 < len(fresh_raw) <= MAX_PLAN_BYTES,
             "fresh rollback review bytes invalid")
    try:
        fresh_id = json.loads(fresh_raw, object_pairs_hook=_unique_object)["planId"]
    except (ValueError, UnicodeError, RecursionError, KeyError, TypeError) as exc:
        raise ReleaseContractError("fresh rollback review identity invalid") from exc
    fresh = validate_rollback_review(fresh_raw, fresh_id)
    now = _utc(observed_at)
    _require(_utc(original["createdAt"]) <= _utc(fresh["createdAt"]) <= now
             and dt.timedelta(0) <= now - _utc(original["backup"]["modifiedAt"])
                 <= dt.timedelta(hours=26), "rollback clock moved backwards or backup expired")
    def baseline(value):
        return {key: item for key, item in value.items() if key not in ("createdAt", "planId")}
    _require(baseline(fresh) == baseline(original), "rollback baseline changed; prepare and review again")
