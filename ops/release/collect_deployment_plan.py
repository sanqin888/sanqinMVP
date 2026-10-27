"""Prepare/show review-only plans. Never deploy, migrate, stop or restart services.

The CLI is not an installed production entry point until the separate tools
installation is reviewed. prepare may cache images, run one isolated file probe
and create private plan/lock files. It does not grant apply authority.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
import uuid
from types import SimpleNamespace

import deployment_plan as contract
import deployment_plan_store as store
import release_contract as release

MAX_OUTPUT = 4 * 1024 * 1024
MAX_BACKUP = 1024 * 1024 * 1024
HISTORY_SQL = """BEGIN READ ONLY;
SELECT COALESCE(json_agg(json_build_object('name', migration_name,
 'sha256', checksum, 'state', CASE WHEN rolled_back_at IS NOT NULL THEN 'rolled-back'
 WHEN finished_at IS NOT NULL THEN 'applied' ELSE 'failed' END)
 ORDER BY migration_name, started_at, id), '[]'::json) FROM "_prisma_migrations";
COMMIT;"""
HISTORY_COMMAND = ('exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" '
                   '-d "$POSTGRES_DB" -c "$1"')
SQL_PROBE = r"""
const fs=require('fs'), crypto=require('crypto');
const root='/app/apps/api/prisma/migrations', result=[];
let total=0;
for(const entry of fs.readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){
 if(entry.name==='migration_lock.toml' && entry.isFile()) continue;
 if(!entry.isDirectory() || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(entry.name))
  throw Error('invalid migration directory');
 const dir=root+'/'+entry.name, names=fs.readdirSync(dir);
 if(names.length!==1 || names[0]!=='migration.sql') throw Error('unexpected SQL members');
 const fd=fs.openSync(dir+'/migration.sql',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 let raw;
 try{
  const s=fs.fstatSync(fd);
  if(!s.isFile() || s.size<=0 || s.size>2097152) throw Error('invalid SQL file');
  raw=fs.readFileSync(fd);
 }finally{fs.closeSync(fd);}
 total+=raw.length;
 if(total>67108864 || result.length>=10000) throw Error('SQL budget exceeded');
 result.push({name:entry.name,bytes:raw.length,
  sha256:crypto.createHash('sha256').update(raw).digest('hex'),
  gitBlobSha:crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex')});
}
process.stdout.write(JSON.stringify(result));
"""


def _need(condition: bool, reason: str) -> None:
    if not condition:
        raise release.ReleaseContractError(reason)


def _json(raw: str):
    _need(isinstance(raw, str) and len(raw) <= MAX_OUTPUT, "JSON output exceeds budget")
    try:
        return json.loads(raw, object_pairs_hook=contract._unique_object)
    except (ValueError, RecursionError) as exc:
        raise release.ReleaseContractError("invalid or duplicate command JSON") from exc


def _canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def command(args: list[str], *, timeout: int = 60, limit: int = MAX_OUTPUT,
            input_bytes: bytes | None = None) -> str:
    """Bound memory/output, suppress raw stderr and never invoke a shell here."""
    _need(input_bytes is None or (type(input_bytes) is bytes and len(input_bytes) <= MAX_OUTPUT),
          "command input exceeds budget")
    environment = {**os.environ, "DOCKER_HOST": "unix:///var/run/docker.sock",
                   "DOCKER_CONTEXT": ""}
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors, tempfile.TemporaryFile() as source:
        if input_bytes is not None:
            source.write(input_bytes)
            source.seek(0)
        try:
            result = subprocess.run(args, stdin=source if input_bytes is not None else subprocess.DEVNULL, stdout=output,
                                    stderr=errors, timeout=timeout, check=False, env=environment)
        except (subprocess.TimeoutExpired, OSError) as exc:
            raise release.ReleaseContractError("plan observation command unavailable or timed out") from exc
        _need(result.returncode == 0, "plan observation command failed")
        size = output.tell()
        _need(size <= limit, "plan observation output exceeds budget")
        output.seek(0)
        try:
            return output.read(limit + 1).decode("utf-8")
        except UnicodeError as exc:
            raise release.ReleaseContractError("plan observation encoding invalid") from exc


def _compose(controller, *args: str) -> list[str]:
    return ["docker", "compose", "--project-name", "sanq-app", "--project-directory",
            str(controller.ROOT), "--env-file", str(controller.ENV),
            "-f", str(controller.COMPOSE), *args]


def _fingerprint(info) -> tuple:
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
            info.st_ctime_ns, info.st_uid, info.st_gid, info.st_mode, info.st_nlink)


def _private_bytes(path, owner: int, *, private: bool = True,
                   maximum: int = contract.MAX_FILE_BYTES) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
              and before.st_uid == owner and 0 <= before.st_size <= maximum,
              "observed file identity or size differs")
        forbidden = 0o077 if private else 0o022
        _need(not stat.S_IMODE(before.st_mode) & forbidden, "observed file mode differs")
        with os.fdopen(os.dup(fd), "rb") as stream:
            raw = stream.read(maximum + 1)
        _need(len(raw) == before.st_size and _fingerprint(before) ==
              _fingerprint(os.fstat(fd)) == _fingerprint(os.stat(path, follow_symlinks=False)),
              "observed file changed during read")
        return raw
    finally:
        os.close(fd)


def _configuration(controller, env_raw: bytes, run) -> tuple[str, dict]:
    compose_raw = _private_bytes(controller.COMPOSE, 0, private=False)
    variables = re.findall(rb"(?<!\$)\$\{([A-Z_][A-Z0-9_]*)([^}]*)\}", compose_raw)
    required = sorted({name.decode("ascii") for name, suffix in variables
                       if not suffix or suffix.startswith((b"?", b":?"))})
    environment = {}
    for line in run(_compose(controller, "config", "--environment")).splitlines():
        key, separator, value = line.partition("=")
        _need(separator == "=" and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key)
              and key not in environment, "invalid Compose environment observation")
        environment[key] = value
    _need(len(environment) <= 4096, "Compose environment exceeds budget")
    missing = [key for key in required if not environment.get(key)]
    _need(not missing, "required Compose environment keys missing")
    expanded = _json(run(_compose(controller, "config", "--format", "json")))
    _need(type(expanded) is dict and expanded.get("name") == "sanq-app"
          and type(expanded.get("services")) is dict, "expanded Compose identity differs")
    current = controller.current_sha_from_text(env_raw.decode("utf-8"))
    for service, image in (("api", "sanq-api"), ("ubereats-worker", "sanq-api"),
                           ("web", "sanq-web")):
        _need(expanded["services"].get(service, {}).get("image") ==
              f"ghcr.io/sanqin888/{image}:{current}", "expanded image is not current release")
    digest = hashlib.sha256(env_raw + b"\0rendered-compose\0" + _canonical(expanded)).hexdigest()
    return digest, {"requiredKeys": required, "missingKeys": []}


def _snapshot(controller, run) -> tuple[dict, dict, dict]:
    controller.ensure_repo_location()  # Includes all installed 17+Manifest checks.
    manifest = controller.runtime_manifest()
    env_uid = controller.pwd.getpwnam("ubuntu").pw_uid
    env = _private_bytes(controller.ENV, env_uid)
    state_raw = _private_bytes(controller.STATE, 0)
    manifest_raw = _private_bytes(controller.RUNTIME_MANIFEST, 0, private=False)
    state = _json(state_raw.decode("utf-8"))
    current = controller.current_sha_from_text(env.decode("utf-8"))
    _need(type(state) is dict and type(state.get("schemaVersion")) is int
          and state["schemaVersion"] == 1 and state.get("phase") in ("active", "rolled-back")
          and state.get("current") == current, "current release state is missing, pending or inconsistent")
    release.require_sha(state.get("previous", ""))
    config, environment = _configuration(controller, env, run)
    files = {path: _private_bytes(controller.ROOT / path, 0, private=False)
             for path in contract.RUNTIME_FILES}
    for path, raw in files.items():
        _need(manifest["files"][path]["sha256"] == hashlib.sha256(raw).hexdigest(),
              "installed runtime observation differs from Manifest")
    _need(_json(manifest_raw.decode("utf-8")) == manifest, "Manifest changed during observation")
    return {"applicationSha": current, "runtimeSourceSha": manifest["sourceSha"],
            "manifestSha256": hashlib.sha256(manifest_raw).hexdigest(),
            "releaseStateSha256": hashlib.sha256(state_raw).hexdigest(),
            "configurationSha256": config}, files, environment


def _pinned(image: dict) -> str:
    return image["ref"].rsplit(":", 1)[0] + "@" + release.checked_digest(image["digest"])


def _inspect_image(reference: str, expected: str, sha: str, run) -> None:
    info = _json(run(["docker", "image", "inspect", "--format", "{{json .}}", reference]))
    _need(type(info) is dict and info.get("Os") == "linux" and info.get("Architecture") == "amd64"
          and type(info.get("RepoDigests")) is list and expected in info["RepoDigests"]
          and type(info.get("Config")) is dict
          and type(info["Config"].get("Labels")) is dict
          and info["Config"]["Labels"].get("org.opencontainers.image.revision") == sha,
          "local image platform, revision or digest differs")


def _current_images(controller, current: str, run, fetch, *, include_stopped=False) -> dict:
    paired = release.sealed_release_for_sha(current, fetch)
    for service, image in (("api", "sanq-api"), ("ubereats-worker", "sanq-api"),
                           ("web", "sanq-web")):
        args = ("ps", "-a", "-q", service) if include_stopped else ("ps", "-q", service)
        identifier = run(_compose(controller, *args)).strip()
        pattern = r"[a-f0-9]{64}" if include_stopped else r"[a-f0-9]{12,64}"
        _need(re.fullmatch(pattern, identifier) is not None,
              "current service identity is missing or ambiguous")
        image_id = run(["docker", "inspect", "--format", "{{.Image}}", identifier]).strip()
        release.checked_digest(image_id)
        _inspect_image(image_id, _pinned(paired["images"][image]), current, run)
    return paired


def _history(controller, run) -> list:
    raw = run(_compose(controller, "exec", "-T", "db", "sh", "-c",
                       HISTORY_COMMAND, "sanq-plan-history", HISTORY_SQL))
    value = _json(raw)
    _need(type(value) is list and 0 < len(value) <= 2 * contract.MAX_MIGRATIONS,
          "database migration history is empty or invalid")
    return value


def _backup(controller) -> dict:
    controller._trusted_dir(controller.BACKUP_DIR,
                            owner=controller.pwd.getpwnam("ubuntu").pw_uid, private=True)
    candidates = [path for path in controller.BACKUP_DIR.iterdir()
                  if contract.BACKUP_NAME.fullmatch(path.name)]
    _need(bool(candidates), "no local database backup")
    latest = max(candidates, key=lambda path: path.lstat().st_mtime_ns)
    fd = os.open(latest, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
              and before.st_uid == controller.pwd.getpwnam("ubuntu").pw_uid
              and not stat.S_IMODE(before.st_mode) & 0o077
              and 0 < before.st_size <= MAX_BACKUP, "backup identity, mode or size differs")
        age = dt.datetime.now(dt.timezone.utc).timestamp() - before.st_mtime
        _need(0 <= age <= 26 * 3600, "backup is future-dated or older than 26 hours")
        digest = hashlib.sha256()
        with os.fdopen(os.dup(fd), "rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
            stream.seek(0)
            expanded = 0
            with gzip.GzipFile(fileobj=stream) as archive:
                for chunk in iter(lambda: archive.read(1024 * 1024), b""):
                    expanded += len(chunk)
                    _need(expanded <= 4 * MAX_BACKUP, "backup expanded size exceeds budget")
        _need(_fingerprint(before) == _fingerprint(os.fstat(fd)) ==
              _fingerprint(latest.lstat()), "backup changed during observation")
        return {"fileName": latest.name, "sha256": digest.hexdigest(), "bytes": before.st_size,
                "modifiedAt": dt.datetime.fromtimestamp(before.st_mtime, dt.timezone.utc)
                .isoformat().replace("+00:00", "Z")}
    finally:
        os.close(fd)


def _resource_preflight(controller) -> None:
    _need(shutil.disk_usage(controller.ROOT).free >= 5 * 1024**3,
          "insufficient free disk for candidate preparation (5 GiB reserve)")
    pages, page_size = os.sysconf("SC_AVPHYS_PAGES"), os.sysconf("SC_PAGE_SIZE")
    # Linux MemAvailable includes reclaimable cache; sysconf alone often doesn't.
    with open("/proc/meminfo", encoding="ascii") as source:
        match = re.search(r"^MemAvailable:\s+([0-9]+) kB$", source.read(65536), re.M)
    available = int(match.group(1)) * 1024 if match else pages * page_size
    _need(available >= 512 * 1024**2, "insufficient available memory for the bounded file probe")


def _probe_sql(pinned: str, run) -> list:
    nonce = uuid.uuid4().hex
    name = "sanq-plan-probe-" + nonce
    args = ["docker", "run", "--rm", "--name", name, "--label", "io.sanq.plan.probe=" + nonce,
            "--pull", "never", "--platform", "linux/amd64", "--read-only", "--network", "none",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--memory", "256m", "--memory-swap", "256m", "--cpus", "0.5", "--pids-limit", "64",
            "--no-healthcheck", "--env", "NODE_OPTIONS=", "--env", "NODE_PATH=",
            "--env", "NODE_COMPILE_CACHE=", "--entrypoint", "/usr/local/bin/node",
            pinned, "-e", SQL_PROBE]
    try:
        return _json(run(args, timeout=45))
    except BaseException:
        # A CLI timeout can leave a Docker-managed container behind. Only remove
        # this exact probe if the nonce label agrees, never a business container.
        try:
            info = _json(run(["docker", "inspect", "--format", "{{json .Config.Labels}}", name]))
            if type(info) is dict and info.get("io.sanq.plan.probe") == nonce:
                run(["docker", "rm", "-f", name])
        except (release.ReleaseContractError, OSError):
            pass  # Original error remains; cleanup was not proven.
        raise


def _verify_sql_source(source_sha: str, inventory: list, fetch) -> None:
    commit = fetch(f"/repos/{release.REPOSITORY}/git/commits/{source_sha}")
    _need(type(commit) is dict and commit.get("sha") == source_sha
          and type(commit.get("tree")) is dict, "candidate Git commit binding differs")
    tree_sha = release.require_sha(commit["tree"].get("sha", ""))
    tree = fetch(f"/repos/{release.REPOSITORY}/git/trees/{tree_sha}?recursive=1")
    contract.verify_migration_objects(inventory, tree, expected_tree_sha=tree_sha)


def collect(target_sha: str, *, controller=None, run=command, fetch=None,
            cache_images: bool = True) -> bytes:
    """Collect observations; cache_images=False never pulls a missing digest.

    Caller must separately authorize a real run. No apply authority is granted.
    """
    target_sha = release.require_sha(target_sha)
    _need(os.geteuid() == 0, "plan preparation requires the authorized root operator")
    _need(not any(os.environ.get(key) for key in (
        "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"
    )), "non-default Docker endpoint is unsupported")
    if controller is None:
        import deploy_release as controller
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    observe = SimpleNamespace(
        run=lambda args, **_: run(args).strip(),
        compose=lambda sha, *args, **_: run(_compose(controller, *args)).strip())
    before, installed, environment = _snapshot(controller, run)
    current = before["applicationSha"]
    candidate = release.verify_exact_candidate(current, target_sha, fetch)
    runtime_pins = contract.runtime_contract(installed, contract.fetch_runtime_files(target_sha, fetch))
    controller.check_running_images(current, observe=observe)
    controller.check_live_storage(current, observe=observe)
    _current_images(controller, current, run, fetch)
    run(["bash", str(controller.ROOT / "ops/verify-runtime-readiness.sh"),
         str(controller.ENV), "https://sanq.ca"])
    _resource_preflight(controller)
    backup = _backup(controller)
    for image in candidate["images"].values():
        pinned = _pinned(image)
        if cache_images:
            run(["docker", "pull", pinned], timeout=300)
        _inspect_image(pinned, pinned, target_sha, run)
    inventory = _probe_sql(_pinned(candidate["images"]["sanq-api"]), run)
    _verify_sql_source(target_sha, inventory, fetch)
    history = _history(controller, run)
    applied = {row.get("name") for row in history
               if type(row) is dict and row.get("state") == "applied"}
    pending = [{"name": item["name"], "sha256": item["sha256"]}
               for item in inventory if item["name"] not in applied]
    raw = contract.create_plan(current=before, candidate=candidate, runtime_pins=runtime_pins,
                               inventory=inventory, history=history, pending=pending,
                               backup=backup, environment=environment, created_at=now_utc())
    after, files_after, environment_after = _snapshot(controller, run)
    _need(before == after and installed == files_after and environment == environment_after
          and history == _history(controller, run), "current baseline changed; prepare again")
    _current_images(controller, current, run, fetch)
    controller.check_live_storage(current, observe=observe)
    # Re-evaluate the exact candidate, never substitute a newer release.
    _need(candidate == release.verify_exact_candidate(current, target_sha, fetch),
          "candidate proof changed during preparation")
    return raw


def collect_rollback(*, controller=None, run=command, fetch=None, cache_images=True) -> bytes:
    """Collect only the recorded previous target; no current-health requirement."""
    _need(os.geteuid() == 0, "rollback preparation requires the authorized root operator")
    _need(not any(os.environ.get(key) for key in (
        "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")),
        "non-default Docker endpoint is unsupported")
    if controller is None:
        import deploy_release as controller
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    store.check_maintenance_clear()
    before, installed, environment = _snapshot(controller, run)
    state_raw = _private_bytes(controller.STATE, 0, maximum=16384)
    state = _json(state_raw.decode("utf-8"))
    _need(type(state) is dict, "release state observation invalid")
    previous = release.require_sha(state.get("previous", ""))
    current = before["applicationSha"]
    contract._rollback_state(state_raw, before, {"sourceSha": previous}, now_utc())
    candidate = release.verify_exact_rollback(current, previous, fetch)
    pins = contract.runtime_contract(installed, contract.fetch_runtime_files(previous, fetch))
    # Existing mount checks use all app containers, including exited ones; DB
    # still uses running-only selection and the original fixed volume contract.
    def observed_compose(sha, *args, **kwargs):
        if len(args) == 3 and args[:2] == ("ps", "-q") and args[-1] in ("api", "ubereats-worker", "web"):
            args = ("ps", "-a", "-q", args[-1])
        return run(_compose(controller, *args)).strip()
    observe = SimpleNamespace(run=lambda args, **_: run(args).strip(), compose=observed_compose)
    controller.check_live_storage(current, observe=observe)
    paired = _current_images(controller, current, run, fetch, include_stopped=True)
    _resource_preflight(controller)
    backup = _backup(controller)
    for image in candidate["images"].values():
        pinned = _pinned(image)
        if cache_images:
            run(["docker", "pull", pinned], timeout=300)
        _inspect_image(pinned, pinned, previous, run)
    def database():
        identifier = run(_compose(controller, "ps", "-q", "db")).strip()
        _need(re.fullmatch(r"[a-f0-9]{64}", identifier) is not None, "rollback DB identity invalid")
        info = _json(run(["docker", "inspect", "--format", "{{json .}}", identifier]))
        _need(type(info) is dict and info.get("Id") == identifier
              and info.get("State", {}).get("Running") is True
              and info.get("Config", {}).get("Labels", {}).get("com.docker.compose.project") == "sanq-app"
              and info["Config"]["Labels"].get("com.docker.compose.service") == "db"
              and type(info.get("Mounts")) is list
              and sum(type(row) is dict and row.get("Type") == "volume"
                  and row.get("Name") == "sanq-app_pgdata"
                  and row.get("Destination") == "/var/lib/postgresql/data"
                  for row in info["Mounts"]) == 1, "rollback DB observation differs")
        release.checked_digest(info.get("Image"))
        return {key: info[key] for key in ("Id", "Image", "Mounts")}
    db = database()
    current_ref = _pinned(paired["images"]["sanq-api"])
    _inspect_image(current_ref, current_ref, current, run)
    current_inventory = _probe_sql(current_ref, run)
    _verify_sql_source(current, current_inventory, fetch)
    target_inventory = _probe_sql(_pinned(candidate["images"]["sanq-api"]), run)
    _verify_sql_source(previous, target_inventory, fetch)
    history = _history(controller, run)
    raw = contract.create_rollback_review(release_state=state_raw, current=before,
        candidate=candidate, runtime_pins=pins, inventory=current_inventory, history=history,
        pending=[], backup=backup, environment=environment, created_at=now_utc(),
        target_inventory=target_inventory)
    _need(_snapshot(controller, run) == (before, installed, environment)
          and _private_bytes(controller.STATE, 0, maximum=16384) == state_raw
          and _history(controller, run) == history and _backup(controller) == backup
          and database() == db, "rollback baseline changed during preparation")
    _need(_current_images(controller, current, run, fetch, include_stopped=True) == paired
          and release.verify_exact_rollback(current, previous, fetch) == candidate,
          "rollback image proof changed during preparation")
    controller.check_live_storage(current, observe=observe)
    store.check_maintenance_clear()
    return raw


def rollback_summary(raw: bytes, identity: str) -> dict:
    value = contract.validate_rollback_review(raw, identity)
    return {**contract.rollback_review_summary(raw, identity), "mode": "ROLLBACK_REVIEW_ONLY",
            "images": value["candidate"]["images"], "backup": value["backup"],
            "requiredEnvironmentKeys": value["environment"]["requiredKeys"]}


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def summary(raw: bytes, identity: str) -> dict:
    value = contract.validate_plan(raw, identity)
    return {"mode": "REVIEW_ONLY", "planId": identity,
            "currentSha": value["current"]["applicationSha"],
            "targetSha": value["candidate"]["sourceSha"],
            "images": value["candidate"]["images"],
            "pendingMigrations": value["pendingMigrations"],
            "backup": value["backup"], "requiredEnvironmentKeys": value["environment"]["requiredKeys"],
            "sqlReview": contract.sql_review(raw, identity), "canExecute": False}



def review_sql(raw: bytes, identity: str, *, fetch=None) -> dict:
    """Read only the exact pending blobs; emit nothing until all bytes verify."""
    review = contract.sql_review(raw, identity)
    _need(sum(item["bytes"] for item in review["migrations"]) <= MAX_OUTPUT,
          "SQL review exceeds bounded output; explicit separate review required")
    if fetch is None:
        fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    rows = []
    for item in review["migrations"]:
        response = fetch(f"/repos/{release.REPOSITORY}/git/blobs/{item['gitBlobSha']}")
        _need(type(response) is dict and response.get("sha") == item["gitBlobSha"]
              and type(response.get("size")) is int and response["size"] == item["bytes"]
              and response.get("encoding") == "base64" and isinstance(response.get("content"), str)
              and len(response["content"]) <= 4 * ((item["bytes"] + 2) // 3) + 1024,
              "SQL Git blob identity, size or encoding differs")
        encoded = response["content"].replace("\n", "").replace("\r", "")
        source = base64.b64decode(encoded, validate=True)
        _need(len(source) == item["bytes"]
              and hashlib.sha256(source).hexdigest() == item["sha256"]
              and hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest()
                  == item["gitBlobSha"], "SQL bytes differ from reviewed image inventory")
        path = "apps/api/prisma/migrations/" + item["name"] + "/migration.sql"
        rows.append({**item, "sourceUrl": "https://github.com/" + release.REPOSITORY
                     + "/blob/" + review["targetSha"] + "/" + path,
                     "sqlText": source.decode("utf-8")})
    result = {**review, "migrations": rows, "mode": "SQL_REVIEW_ONLY"}
    _need(len(json.dumps(result, indent=2).encode("utf-8")) + 1 <= MAX_OUTPUT,
          "encoded SQL review exceeds output budget; no partial review emitted")
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("prepare", help="Prepare a review plan, never apply it")
    prepare.add_argument("--target-sha", required=True)
    prepare.add_argument("--save", action="store_true", help="Create a private immutable plan file")
    show = sub.add_parser("show", help="Read an existing private plan by its independently retained id")
    show.add_argument("plan_id")
    sql = sub.add_parser("show-sql", help="Verify and show exact pending SQL; never execute it")
    sql.add_argument("plan_id")
    rollback = sub.add_parser("prepare-rollback", help="Review the recorded previous release; never execute")
    rollback.add_argument("--save", action="store_true")
    rollback.add_argument("--cached-only", action="store_true")
    rollback_show = sub.add_parser("show-rollback", help="Read a saved rollback review only")
    rollback_show.add_argument("plan_id")
    args = parser.parse_args(argv)
    try:
        if args.command in ("prepare-rollback", "show-rollback"):
            if args.command == "show-rollback":
                raw, identity = store.load_rollback_review(args.plan_id), args.plan_id
            else:
                with store.preparation_lock():
                    raw = collect_rollback(cache_images=not args.cached_only)
                    identity = json.loads(raw)["planId"]
                    if args.save:
                        store.check_maintenance_clear()
                        store.save_rollback_review(raw)
            print(json.dumps(rollback_summary(raw, identity), indent=2))
            return 0
        if args.command == "show-sql":
            raw = store.load_plan(args.plan_id)
            print(json.dumps(review_sql(raw, args.plan_id), indent=2))
            return 0
        if args.command == "show":
            raw, identity = store.load_plan(args.plan_id), args.plan_id
        else:
            with store.preparation_lock():
                raw = collect(args.target_sha)
                identity = json.loads(raw)["planId"]
                if args.save:
                    store.save_plan(raw)
        print(json.dumps(summary(raw, identity), indent=2))
        return 0
    except (release.ReleaseContractError, OSError, EOFError, ValueError, KeyError, TypeError, RecursionError):
        # Never echo subprocess output, dotenv values or arbitrary observation text.
        print("Plan preparation blocked; no deployment or migration was requested.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
