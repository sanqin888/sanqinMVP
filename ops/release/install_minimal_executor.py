#!/usr/bin/env python3
"""Inert delivery, private materials and installed source observation. No host apply.

Run from an independently reviewed bootstrap checkout. Never import or execute
Python from the kit. A transport manifest is not a release or root authority.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import ast
import base64
import gzip
import hashlib
import io
import json
import os
import pwd
import re
import stat
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops/runtime"))
import build_bundle as bundle
import versioned_release_contract as historical
import release_contract as release

RUNTIME_MEMBERS = (
    "docker-compose.yml", "ops/backup/backup-db.sh", "ops/backup/sanq-backup-protected-nginx",
    "ops/backup/sanq-backup.service", "ops/backup/sanq-backup.sudoers",
    "ops/release/deploy_release.py", "ops/release/release_contract.py",
    "ops/runtime/build_bundle.py", "ops/runtime/audit_compose_cutover.py",
    "ops/runtime/audit_release_provenance.py", "ops/runtime/inspect_layout.py",
    "ops/runtime/stage_bundle.py", "ops/runtime/runtime_trust.py",
    "ops/runtime/versioned_release_contract.py", "ops/runtime/plan_versioned_install.py",
    "ops/runtime/runtime-layout.v1.json", "ops/verify-runtime-readiness.sh",
)
HELPERS = tuple("ops/release/" + name + ".py" for name in (
    "deployment_plan", "deployment_plan_store", "collect_deployment_plan", "release_job",
    "maintenance_guard", "migration_container", "start_candidates", "finalize_candidates", "release_task"))
BOOTSTRAP = "ops/release/install_minimal_executor.py"
SOURCES = (*RUNTIME_MEMBERS, *HELPERS, BOOTSTRAP)
RUNTIME_ARCHIVE = "runtime-archive.tar.gz"
RECORD = "delivery.json"
MAX_FILE = 2 * 1024 * 1024
MAX_KIT = 20 * 1024 * 1024
MAX_TOTAL = 48 * 1024 * 1024
PREFIX = "/repos/" + release.REPOSITORY
ALLOWED_CHANGES = frozenset(("ops/release/deploy_release.py", "ops/release/release_contract.py"))
# These are syntax models, never evaluated. Keep identical to the reviewed guard.
GUARD_MODEL = '''MAINTENANCE_DIR = Path("/opt/sanq/deploy-state/maintenance")
GUARD_SCRIPT = Path("/opt/sanq/runtime/ops/release/maintenance_guard.py")
MARKER = "active.json"
GUARD_COMMAND = "/usr/bin/python3 -B " + str(GUARD_SCRIPT) + " check-startup"
DROPINS = {
    "docker.service": "[Service]\\nExecStartPre=" + GUARD_COMMAND + "\\n",
    "docker.socket": "[Unit]\\nConditionPathExists=!" + str(MAINTENANCE_DIR / MARKER) + "\\n",
    "sanq-backup.service": "[Unit]\\nConditionPathExists=!" + str(MAINTENANCE_DIR / MARKER)
        + "\\n\\n[Service]\\nExecStartPre=+" + GUARD_COMMAND + "\\n",
}
'''
COMMAND = "/usr/bin/python3 -B /opt/sanq/runtime/ops/release/maintenance_guard.py check-startup"
DROPINS = {
    "docker.service": "[Service]\nExecStartPre=" + COMMAND + "\n",
    "docker.socket": "[Unit]\nConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json\n",
    "sanq-backup.service": "[Unit]\nConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json"
        + "\n\n[Service]\nExecStartPre=+" + COMMAND + "\n",
}
CONTENT_PATHS = frozenset((RUNTIME_ARCHIVE, *("sources/" + p for p in SOURCES),
                          *("dropins/" + unit + ".conf" for unit in DROPINS)))


def _need(condition, message):
    if not condition:
        raise release.ReleaseContractError(message)


def _json(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()


def _unique(pairs):
    result = {}
    for key, value in pairs:
        _need(key not in result, "duplicate delivery JSON key")
        result[key] = value
    return result


def _hash(raw):
    return hashlib.sha256(raw).hexdigest()


def _object(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def _cache(fetch):
    values = {}
    def cached(path):
        if path not in values:
            values[path] = fetch(path)
        return values[path]
    return cached


def _runtime_files(payload, sha):
    _need(type(payload) is bytes and 0 < len(payload) <= bundle.MAX_ARCHIVE_BYTES, "runtime bytes exceed budget")
    _need(tuple(bundle.SOURCE_FILES) == RUNTIME_MEMBERS, "bootstrap Runtime allowlist changed")
    manifest = bundle.verify_bundle_bytes(payload, sha)
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        stream = archive.extractfile(bundle.RUNTIME_PREFIX + "/" + bundle.MANIFEST)
        _need(stream is not None, "runtime manifest unreadable")
        strict = json.loads(stream.read(MAX_FILE + 1), object_pairs_hook=_unique)
        _need(strict == manifest and set(strict) == {"schemaVersion", "artifactKind", "sourceBranch", "sourceSha",
              "ciRunId", "publishRunId", "applicationImages", "files", "productionActivationAuthorized"}
              and type(strict["schemaVersion"]) is int and strict["schemaVersion"] == 1
              and type(strict["ciRunId"]) is int and strict["ciRunId"] > 0
              and type(strict["publishRunId"]) is int and strict["publishRunId"] > 0,
              "runtime manifest fields or integer identities differ")
        files = {}
        for name in RUNTIME_MEMBERS:
            stream = archive.extractfile(bundle.RUNTIME_PREFIX + "/" + name)
            _need(stream is not None, "runtime member unreadable")
            files[name] = stream.read(MAX_FILE + 1)
            entry = manifest["files"][name]
            _need(set(entry) == {"sha256", "bytes"} and type(entry["bytes"]) is int,
                  "runtime file proof fields differ")
    return manifest, files


def _runtime_proof(payload, sha, fetch):
    manifest, files = _runtime_files(payload, sha)
    exact = release.verify_exact_candidate(sha, sha, fetch)
    proof = historical.verify_historical_release(payload, sha, fetch=fetch)
    _need(exact["publicationUrl"] == proof["publicationUrl"]
          and exact["images"] == proof["images"], "runtime and exact publication differ")
    ci_id = manifest.get("ciRunId")
    _need(type(ci_id) is int and ci_id > 0, "original main CI identity missing")
    ci = fetch(PREFIX + "/actions/runs/" + str(ci_id))
    _need(type(ci) is dict and type(ci.get("id")) is int and ci["id"] == ci_id
          and ci.get("path") == ".github/workflows/ci.yml" and ci.get("head_sha") == sha
          and ci.get("head_branch") == "main" and ci.get("event") == "push"
          and ci.get("status") == "completed" and ci.get("conclusion") == "success"
          and type(ci.get("repository")) is dict
          and ci["repository"].get("full_name") == release.REPOSITORY,
          "original archive CI is not exact successful main CI")
    return manifest, files, exact


def _source_files(sha, fetch):
    commit = fetch(PREFIX + "/git/commits/" + sha)
    _need(type(commit) is dict and commit.get("sha") == sha and type(commit.get("tree")) is dict,
          "source commit binding differs")
    tree_sha = release.require_sha(commit["tree"].get("sha", ""))
    tree = fetch(PREFIX + "/git/trees/" + tree_sha + "?recursive=1")
    _need(type(tree) is dict and tree.get("sha") == tree_sha and tree.get("truncated") is False
          and type(tree.get("tree")) is list and len(tree["tree"]) <= 100000,
          "complete source tree unavailable")
    rows = {}
    for row in tree["tree"]:
        _need(type(row) is dict and isinstance(row.get("path"), str) and row["path"] not in rows,
              "ambiguous Git tree path")
        rows[row["path"]] = row
    files, total = {}, 0
    for path in SOURCES:
        row = rows.get(path)
        _need(type(row) is dict and row.get("type") == "blob" and row.get("mode") in ("100644", "100755")
              and type(row.get("size")) is int and 0 < row["size"] <= MAX_FILE, "source member type or size differs")
        blob_sha = release.require_sha(row.get("sha", ""))
        blob = fetch(PREFIX + "/git/blobs/" + blob_sha)
        _need(type(blob) is dict and blob.get("sha") == blob_sha and type(blob.get("size")) is int
              and blob["size"] == row["size"] and blob.get("encoding") == "base64"
              and isinstance(blob.get("content"), str) and len(blob["content"]) <= 2 * MAX_FILE,
              "source blob fields differ")
        raw = base64.b64decode("".join(blob["content"].split()), validate=True)
        _need(len(raw) == row["size"] and _object(raw) == blob_sha, "source blob bytes differ")
        total += len(raw)
        _need(total <= MAX_TOTAL - bundle.MAX_ARCHIVE_BYTES, "source bytes exceed total budget")
        files[path] = raw
    return files


def _dropins(guard_source):
    def assignments(raw):
        tree = ast.parse(raw, feature_version=(3, 10))
        return {name: [ast.dump(node.value) for node in tree.body if isinstance(node, ast.Assign)
                      for target in node.targets if isinstance(target, ast.Name) and target.id == name]
                for name in ("MAINTENANCE_DIR", "GUARD_SCRIPT", "MARKER", "GUARD_COMMAND", "DROPINS")}
    _need(assignments(guard_source) == assignments(GUARD_MODEL), "reviewed guard template syntax changed")
    return {"dropins/" + unit + ".conf": raw.encode() for unit, raw in DROPINS.items()}


def _verified_inputs(runtime, sha, fetch):
    sha = release.require_sha(sha)
    manifest, runtime_files, proof = _runtime_proof(runtime, sha, _cache(fetch))
    sources = _source_files(sha, _cache(fetch))
    _need(all(sources[path] == runtime_files[path] for path in RUNTIME_MEMBERS),
          "sealed archive differs from exact Git source")
    dropins = _dropins(sources["ops/release/maintenance_guard.py"])
    # A fresh endpoint read brackets source fetching. Never keep a stale success.
    after_manifest, after_files, after_proof = _runtime_proof(runtime, sha, _cache(fetch))
    _need((manifest, runtime_files, proof) == (after_manifest, after_files, after_proof),
          "release evidence changed during material review")
    return manifest, sources, dropins, proof


def _contents(runtime, sha, manifest, sources, dropins):
    contents = {RUNTIME_ARCHIVE: runtime, **{"sources/" + p: b for p, b in sources.items()}, **dropins}
    _need(set(contents) == CONTENT_PATHS, "delivery content inventory differs")
    record = {"schemaVersion": 1, "kind": "sanq-minimal-executor-delivery", "sourceSha": sha,
              "originalCiRunId": manifest["ciRunId"], "publishRunId": manifest["publishRunId"],
              "files": {p: {"sha256": _hash(b), "bytes": len(b)} for p, b in sorted(contents.items())},
              "readyToInstall": False, "canExecute": False, "authorizedToMutateProduction": False}
    return {**contents, RECORD: _json(record)}


def build_materials(runtime: bytes, source_sha: str, *, fetch=release.github_json) -> bytes:
    """Inert in-memory pack. No local target source is imported or trusted."""
    manifest, sources, dropins, _ = _verified_inputs(runtime, source_sha, fetch)
    contents = _contents(runtime, source_sha, manifest, sources, dropins)
    _need(sum(map(len, contents.values())) <= MAX_TOTAL, "kit contents exceed total budget")
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for path, raw in sorted(contents.items()):
                info = tarfile.TarInfo(path)
                info.size, info.mode = len(raw), 0o600
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = ""
                archive.addfile(info, io.BytesIO(raw))
    payload = output.getvalue()
    _need(len(payload) <= MAX_KIT, "compressed kit exceeds budget")
    return payload


def _read_kit(payload):
    _need(type(payload) is bytes and 0 < len(payload) <= MAX_KIT, "invalid kit size or bytes")
    expected = CONTENT_PATHS | {RECORD}
    files, total = {}, 0
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        for member in archive:
            _need(member.name in expected and member.name not in files and member.type == tarfile.REGTYPE
                  and not member.pax_headers and not member.sparse and not member.linkname
                  and member.uname == member.gname == "" and member.uid == member.gid == 0
                  and member.mode == 0o600 and member.mtime == 0,
                  "unreviewed, duplicate or unsafe kit member")
            maximum = (bundle.MAX_ARCHIVE_BYTES if member.name == RUNTIME_ARCHIVE
                       else 65536 if member.name == RECORD else MAX_FILE)
            _need(0 < member.size <= maximum, "kit member exceeds budget")
            total += member.size
            _need(total <= MAX_TOTAL, "expanded kit exceeds budget")
            stream = archive.extractfile(member)
            _need(stream is not None, "kit member unreadable")
            raw = stream.read(maximum + 1)
            _need(len(raw) == member.size, "kit member truncated")
            files[member.name] = raw
    _need(set(files) == expected, "kit is incomplete")
    record = json.loads(files[RECORD], object_pairs_hook=_unique)
    _need(type(record) is dict and files[RECORD] == _json(record), "kit record is not canonical")
    return files


def _review(payload, source_sha, fetch):
    sha = release.require_sha(source_sha)
    contents = _read_kit(payload)
    manifest, sources, dropins, proof = _verified_inputs(contents[RUNTIME_ARCHIVE], sha, fetch)
    _need(contents == _contents(contents[RUNTIME_ARCHIVE], sha, manifest, sources, dropins),
          "kit differs from independently verified exact source")
    return contents, manifest, proof


def verify_materials(payload: bytes, source_sha: str, *, fetch=release.github_json) -> dict:
    contents, manifest, proof = _review(payload, source_sha, fetch)
    return {"sourceSha": source_sha, "kitSha256": _hash(payload),
            "runtimeArchiveSha256": _hash(contents[RUNTIME_ARCHIVE]),
            "originalCiRunId": manifest["ciRunId"], "latestMainCiRunId": proof["ciRunId"],
            "publishRunId": manifest["publishRunId"], "runtimeMemberCount": 17,
            "helperCount": 9, "bootstrapCount": 1, "dropinCount": 3, "sourceAuthenticated": True,
            "installedBaselineObserved": False, "readyToInstall": False, "canExecute": False,
            "authorizedToMutateProduction": False}


def review_transition(payload: bytes, source_sha: str, current_runtime: bytes, current_source_sha: str,
                      *, fetch=release.github_json) -> dict:
    """Compare supplied artifacts only; never infer installed VM bytes or readiness."""
    contents, manifest, _ = _review(payload, source_sha, fetch)
    old_sha = release.require_sha(current_source_sha)
    old_manifest, old_files = _runtime_files(current_runtime, old_sha)
    historical.verify_historical_release(current_runtime, old_sha, fetch=_cache(fetch))
    release._verify_lineage(old_sha, source_sha, fetch)
    target_manifest, target_files = _runtime_files(contents[RUNTIME_ARCHIVE], source_sha)
    changed = [p for p in RUNTIME_MEMBERS if old_files[p] != target_files[p]]
    outside = sorted(set(changed) - ALLOWED_CHANGES)
    return {"sourceSha": source_sha, "currentRuntimeSourceSha": old_sha,
            "currentArchiveSha256": _hash(current_runtime), "kitSha256": _hash(payload),
            "changedRuntimeFiles": changed, "requiresAdditionalPlatformReview": outside,
            "outcome": "NEEDS_PLATFORM_REVIEW" if outside else "ARTIFACTS_REVIEWED",
            "targetManifestCanonicalSha256": _hash(_json(target_manifest)),
            "currentManifestCanonicalSha256": _hash(_json(old_manifest)),
            "helperCount": len(HELPERS), "dropinCount": len(DROPINS),
            "installedBaselineObserved": False, "requiresHostRecheck": True,
            "readyToInstall": False, "canExecute": False, "authorizedToMutateProduction": False}


def _read_artifact(path, maximum):
    path = Path(path)
    for ancestor in (path, *path.parents):
        _need(not ancestor.is_symlink(), "symlink in artifact path")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
              and 0 < before.st_size <= maximum, "artifact type, links or size differs")
        chunks, size = [], 0
        while size <= maximum:
            raw = os.read(fd, min(65536, maximum + 1 - size))
            if not raw:
                break
            chunks.append(raw)
            size += len(raw)
        after = os.fstat(fd)
        fingerprint = lambda v: (v.st_dev, v.st_ino, v.st_size, v.st_mtime_ns, v.st_ctime_ns)
        _need(size == before.st_size and fingerprint(before) == fingerprint(after)
              == fingerprint(path.lstat()), "artifact changed during read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _save_new_artifact(path, payload):
    # The public pack CLI checks the unprivileged operator before reaching this writer.
    _need(type(payload) is bytes and 0 < len(payload) <= MAX_KIT, "artifact output exceeds budget")
    path = Path(path).absolute()
    _need(".." not in path.parts, "artifact output path is ambiguous")
    _need(not any(path == root or root in path.parents for root in map(Path, (
        "/opt/sanq", "/srv/sanq", "/home/ubuntu/sanq-app", "/etc", "/proc", "/sys", "/dev", "/run"))),
        "D1 artifact output cannot target a production or system path")
    for ancestor in (path.parent, *path.parent.parents):
        _need(not ancestor.is_symlink(), "symlink in artifact output parent")
    parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(parent)
        _need(info.st_uid == os.geteuid() and not stat.S_IMODE(info.st_mode) & 0o022,
              "artifact output parent ownership or mode differs")
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        try:
            _need(stat.S_ISREG(os.fstat(fd).st_mode) and os.fstat(fd).st_nlink == 1, "artifact output differs")
            remaining = memoryview(payload)
            while remaining:
                count = os.write(fd, remaining)
                _need(count > 0, "short artifact write")
                remaining = remaining[count:]
            os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(parent)
    finally:
        os.close(parent)
    _need(_read_artifact(path, MAX_KIT) == payload, "artifact output readback differs")



# D2-1: private, non-executing handoff only. No maintenance intent or host apply.
STATE_PARENT = Path("/opt/sanq")
PRIVATE_OWNER_UID = 0
PRIVATE_GROUP_GID = 0
MIN_PRIVATE_FREE_BYTES = 5 * 1024**3
PRIVATE_FILES = frozenset(("retaining.json", "delivery-kit.tar.gz",
                           "current-runtime-archive.tar.gz", "retained.json"))


def _private_info(info, *, directory=False):
    _need((stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode))
          and info.st_uid == PRIVATE_OWNER_UID and info.st_gid == PRIVATE_GROUP_GID
          and stat.S_IMODE(info.st_mode) == (0o700 if directory else 0o600)
          and (directory or info.st_nlink == 1), "private material owner, mode, links or type differs")


def _state_parent():
    """Fixed trusted anchor; no caller-controlled root or root symlink traversal."""
    _need(STATE_PARENT.is_absolute() and ".." not in STATE_PARENT.parts, "invalid fixed state parent")
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in (None, *STATE_PARENT.parts[1:]):
            if name is not None:
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = child
            info = os.fstat(fd)
            _need(stat.S_ISDIR(info.st_mode) and info.st_uid == PRIVATE_OWNER_UID and info.st_gid == PRIVATE_GROUP_GID
                  and not stat.S_IMODE(info.st_mode) & 0o022, "untrusted fixed state ancestor")
        result, fd = fd, None
        return result
    finally:
        if fd is not None:
            os.close(fd)


@contextlib.contextmanager
def _private_directory(parent, name, *, create=False, exclusive=False):
    _need(name in ("deploy-state", "plans", "jobs", "maintenance", "installations")
          or re.fullmatch(r"[a-f0-9]{64}", name) is not None, "unreviewed private directory name")
    if create:
        try:
            os.mkdir(name, mode=0o700, dir_fd=parent)
        except FileExistsError:
            if exclusive:
                raise
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        _private_info(os.fstat(fd), directory=True)
        _need((os.fstat(fd).st_dev, os.fstat(fd).st_ino) ==
              (os.stat(name, dir_fd=parent, follow_symlinks=False).st_dev,
               os.stat(name, dir_fd=parent, follow_symlinks=False).st_ino),
              "private directory changed during open")
        if create:
            # Also seal existing namespace entries after a prior interrupted provision.
            os.fsync(fd)
            os.fsync(parent)
        yield fd
    finally:
        os.close(fd)


@contextlib.contextmanager
def _private_lock(parent, name, *, create=False):
    _need(name in (".release.lock", ".prepare.lock"), "unreviewed private lock")
    flags = os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK
    fd = os.open(name, flags | (os.O_CREAT if create else 0), 0o600, dir_fd=parent)
    try:
        _private_info(os.fstat(fd))
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise release.ReleaseContractError("another task or probe owns the original lock") from error
        info = os.fstat(fd)
        _private_info(info)
        actual = os.stat(name, dir_fd=parent, follow_symlinks=False)
        _private_info(actual)
        _need((info.st_dev, info.st_ino) == (actual.st_dev, actual.st_ino), "original lock was replaced")
        if create:
            os.fsync(fd)
            os.fsync(parent)
        yield
    finally:
        os.close(fd)  # Preserve the original lock inode.


@contextlib.contextmanager
def _private_session(*, create=False):
    _need(os.geteuid() == 0, "private material handoff requires the authorized root operator")
    with contextlib.ExitStack() as stack:
        parent = _state_parent()
        stack.callback(os.close, parent)
        if create:
            disk = os.fstatvfs(parent)
            _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + MAX_KIT
                  + bundle.MAX_ARCHIVE_BYTES + 16384, "insufficient private material storage reserve")
        root = stack.enter_context(_private_directory(parent, "deploy-state", create=create))
        folders = {name: stack.enter_context(_private_directory(root, name, create=create))
                   for name in ("jobs", "plans", "maintenance", "installations")}
        stack.enter_context(_private_lock(folders["jobs"], ".release.lock", create=create))
        stack.enter_context(_private_lock(folders["plans"], ".prepare.lock", create=create))
        yield folders


def _private_read(root, name, maximum):
    _need(name in PRIVATE_FILES or re.fullmatch(r"[a-f0-9]{64}\.json", name) is not None,
          "unreviewed private material input")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        _need(0 < before.st_size <= maximum, "private material size differs")
        chunks, size = [], 0
        while size <= maximum:
            raw = os.read(fd, min(65536, maximum + 1 - size))
            if not raw:
                break
            chunks.append(raw)
            size += len(raw)
        after = os.fstat(fd)
        path = os.stat(name, dir_fd=root, follow_symlinks=False)
        fingerprint = lambda v: (v.st_dev, v.st_ino, v.st_size, v.st_mtime_ns, v.st_ctime_ns, v.st_nlink)
        _private_info(after)
        _private_info(path)
        _need(size == before.st_size and fingerprint(before) == fingerprint(after) == fingerprint(path),
              "private material changed during read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _private_write(root, name, raw):
    _need(name in PRIVATE_FILES and type(raw) is bytes and 0 < len(raw) <= MAX_KIT,
          "unreviewed private material output")
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
    try:
        _private_info(os.fstat(fd))
        remaining = memoryview(raw)
        while remaining:
            count = os.write(fd, remaining)
            _need(count > 0, "short private material write")
            remaining = remaining[count:]
        os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(root)
    _need(_private_read(root, name, MAX_KIT) == raw, "private material readback differs")


def _idle_for_materials(folders):
    _need(not os.listdir(folders["maintenance"]), "maintenance evidence blocks material handoff")
    names = os.listdir(folders["jobs"])
    _need(len(names) <= 1024, "job observation budget exceeded")
    for name in names:
        if name == ".release.lock":
            continue
        _need(re.fullmatch(r"[a-f0-9]{64}\.json", name) is not None, "unknown or partial observation job")
        raw = _private_read(folders["jobs"], name, 4096)
        value = json.loads(raw, object_pairs_hook=_unique)
        _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "planId", "attemptId", "phase",
              "createdAt", "updatedAt", "errorCode", "canExecute"}
              and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
              and value["kind"] == "sanq-read-only-precheck" and value["planId"] == name[:-5]
              and isinstance(value["attemptId"], str) and re.fullmatch(r"[a-f0-9]{32}", value["attemptId"])
              and value["phase"] in ("READY", "BLOCKED") and value["canExecute"] is False,
              "unfinished or invalid observation job")
        _need(value["errorCode"] in ("PRECHECK_FAILED", "INTERRUPTED_OBSERVATION", "ABANDONED_OBSERVATION")
              if value["phase"] == "BLOCKED" else value["errorCode"] is None,
              "invalid observation job error")
        stamps = []
        for key in ("createdAt", "updatedAt"):
            stamp = value[key]
            _need(isinstance(stamp, str) and re.fullmatch(
                r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z", stamp),
                "invalid observation job time")
            stamps.append(dt.datetime.fromisoformat(stamp[:-1] + "+00:00"))
        _need(stamps[1] >= stamps[0] and raw == _json(value), "job time or canonical bytes differ")


def _retention_record(payload, source_sha, current_runtime, current_source_sha, *, complete=False):
    identity = {"sourceSha": release.require_sha(source_sha),
                "currentArchiveSourceSha": release.require_sha(current_source_sha),
                "kitSha256": _hash(payload), "currentArchiveSha256": _hash(current_runtime)}
    retention = _hash(b"sanq-minimal-private-materials-v1\0" + _json(identity))
    return {"schemaVersion": 1, "kind": "sanq-private-install-materials", "retentionId": retention,
            **identity, "kitBytes": len(payload), "currentArchiveBytes": len(current_runtime),
            "phase": "MATERIALS_RETAINED" if complete else "RETAINING",
            "requiresHostRecheck": True, "installedBaselineObserved": False, "readyToInstall": False,
            "canExecute": False, "authorizedToMutateProduction": False}


def _retained_contents(root, identity):
    _need(isinstance(identity, str) and re.fullmatch(r"[a-f0-9]{64}", identity), "invalid retention identity")
    _need(set(os.listdir(root)) == PRIVATE_FILES, "private material handoff is incomplete or has leftovers")
    kit = _private_read(root, "delivery-kit.tar.gz", MAX_KIT)
    old = _private_read(root, "current-runtime-archive.tar.gz", bundle.MAX_ARCHIVE_BYTES)
    intent = _private_read(root, "retaining.json", 4096)
    complete = _private_read(root, "retained.json", 4096)
    value = json.loads(complete, object_pairs_hook=_unique)
    _need(type(value) is dict, "private material record differs")
    expected = _retention_record(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], complete=True)
    _need(expected["retentionId"] == identity and complete == _json(expected)
          and intent == _json({**expected, "phase": "RETAINING"}), "private material records or hashes differ")
    return kit, old, expected


def _retain_verified_materials(payload, source_sha, current_runtime, current_source_sha, *, fetch=release.github_json):
    """Internal D2-1 only. Never writes a maintenance marker, unit or Runtime file."""
    _need(os.geteuid() == 0, "private material handoff requires the authorized root operator")
    review = review_transition(payload, source_sha, current_runtime, current_source_sha, fetch=fetch)
    _need(not review["requiresAdditionalPlatformReview"], "artifact transition exceeds tool-only scope")
    intent = _retention_record(payload, source_sha, current_runtime, current_source_sha)
    with _private_session(create=True) as folders:
        _idle_for_materials(folders)
        with _private_directory(folders["installations"], intent["retentionId"], create=True, exclusive=True) as root:
            _private_write(root, "retaining.json", _json(intent))
            _private_write(root, "delivery-kit.tar.gz", payload)
            _private_write(root, "current-runtime-archive.tar.gz", current_runtime)
            # Fresh trust reads, not saved booleans, bracket the private copies.
            _need(review_transition(payload, source_sha, current_runtime, current_source_sha, fetch=fetch) == review,
                  "material source review changed before completion")
            _idle_for_materials(folders)
            complete = {**intent, "phase": "MATERIALS_RETAINED"}
            _private_write(root, "retained.json", _json(complete))
            _retained_contents(root, intent["retentionId"])
    return {**complete, "outcome": "MATERIALS_RETAINED", "hostPreflightComplete": False}


def _inspect_private_materials(identity, *, fetch=release.github_json):
    """Read retained bytes and refresh source evidence, never infer a right to install."""
    _need(isinstance(identity, str) and re.fullmatch(r"[a-f0-9]{64}", identity), "invalid retention identity")
    with _private_session() as folders, _private_directory(folders["installations"], identity) as root:
        kit, old, value = _retained_contents(root, identity)
        review = review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch)
        _need(not review["requiresAdditionalPlatformReview"], "retained transition exceeds tool-only scope")
        _need(_retained_contents(root, identity) == (kit, old, value), "private material observation changed")
        return {**value, "outcome": "PRIVATE_MATERIALS_OBSERVED", "operationSuccessProven": False,
                "hostPreflightComplete": False}



# D2-2: installed source bytes only. This is not the complete host preflight.
def _installed_fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
            info.st_ctime_ns, info.st_uid, info.st_gid, info.st_mode, info.st_nlink)


def _installed_info(info, *, directory=False):
    _need((stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode))
          and info.st_uid == PRIVATE_OWNER_UID and info.st_gid == PRIVATE_GROUP_GID
          and not stat.S_IMODE(info.st_mode) & 0o7022
          and (directory or info.st_nlink == 1),
          "installed Runtime owner, mode, links or type differs")


@contextlib.contextmanager
def _installed_directory(parent, name):
    _need(name in ("runtime", "ops", "backup", "release"),
          "unreviewed installed Runtime directory")
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        before = os.fstat(fd)
        _installed_info(before, directory=True)
        yield fd
        after = os.fstat(fd)
        path = os.stat(name, dir_fd=parent, follow_symlinks=False)
        _installed_info(after, directory=True)
        _installed_info(path, directory=True)
        identity = lambda v: (v.st_dev, v.st_ino, v.st_uid, v.st_gid, v.st_mode)
        _need(identity(before) == identity(after) == identity(path),
              "installed Runtime directory changed during observation")
    finally:
        os.close(fd)


def _installed_read(parent, name, maximum):
    _need(name in {Path(p).name for p in RUNTIME_MEMBERS} | {"runtime-release.json"},
          "unreviewed installed Runtime input")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        before = os.fstat(fd)
        _installed_info(before)
        _need(0 < before.st_size <= maximum, "installed Runtime size differs")
        chunks, size = [], 0
        while size <= maximum:
            raw = os.read(fd, min(65536, maximum + 1 - size))
            if not raw:
                break
            chunks.append(raw)
            size += len(raw)
        after = os.fstat(fd)
        path = os.stat(name, dir_fd=parent, follow_symlinks=False)
        _installed_info(after)
        _installed_info(path)
        _need(size == before.st_size and _installed_fingerprint(before) ==
              _installed_fingerprint(after) == _installed_fingerprint(path),
              "installed Runtime changed during read")
        return b"".join(chunks), _installed_fingerprint(before)
    finally:
        os.close(fd)


def _installed_runtime_snapshot(old, old_sha):
    """Read fixed protected files; do not import installed or target Python."""
    manifest, expected = _runtime_files(old, old_sha)
    with contextlib.ExitStack() as stack:
        anchor = _state_parent()
        stack.callback(os.close, anchor)
        root = stack.enter_context(_installed_directory(anchor, "runtime"))
        directories = {(): root}
        observed, identities = {}, {}
        for path in (*RUNTIME_MEMBERS, "runtime-release.json"):
            parts = Path(path).parts
            for depth in range(1, len(parts)):
                key = parts[:depth]
                if key not in directories:
                    directories[key] = stack.enter_context(
                        _installed_directory(directories[key[:-1]], key[-1]))
            observed[path] = _installed_read(directories[parts[:-1]], parts[-1],
                                            65536 if path == "runtime-release.json" else MAX_FILE)
        for key, fd in directories.items():
            info = os.fstat(fd)
            identities["/".join(key)] = (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode)
        for path in (*HELPERS, BOOTSTRAP):
            parts = Path(path).parts
            try:
                os.stat(parts[-1], dir_fd=directories[parts[:-1]], follow_symlinks=False)
            except FileNotFoundError:
                continue
            raise release.ReleaseContractError("existing executor file requires separate baseline review: " + path)
        raw = observed["runtime-release.json"][0]
        actual_manifest = json.loads(raw, object_pairs_hook=_unique)
        # Canonical byte equality distinguishes bool from int; preserve actual raw bytes.
        _need(_json(actual_manifest) == _json(manifest), "installed Runtime manifest differs from sealed archive")
        for path, content in expected.items():
            _need(observed[path][0] == content, "installed Runtime differs from sealed archive: " + path)
        return observed, identities


def _observe_installed_runtime(identity, *, fetch=release.github_json, include_configuration=False):
    """Initial install source observation only. No CLI, writes or installation permit."""
    _need(type(include_configuration) is bool, "configuration observation switch must be boolean")
    def snapshot():
        return (_installed_runtime_snapshot(old, value["currentArchiveSourceSha"]),
                _configuration_snapshot() if include_configuration else None)
    _need(isinstance(identity, str) and re.fullmatch(r"[a-f0-9]{64}", identity), "invalid retention identity")
    with _private_session() as folders, _private_directory(folders["installations"], identity) as root:
        _idle_for_materials(folders)
        kit, old, value = _retained_contents(root, identity)
        review = review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch)
        _need(not review["requiresAdditionalPlatformReview"], "retained transition exceeds tool-only scope")
        before = snapshot()
        _need(review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch) == review,
              "material source review changed during installed observation")
        _need(snapshot() == before,
              "installed Runtime baseline changed during observation")
        _need(_retained_contents(root, identity) == (kit, old, value), "retained material observation changed")
        _idle_for_materials(folders)
        observed, directories = before[0]
        result = {**value, "outcome": "INSTALLED_RUNTIME_FILES_OBSERVED",
                "installedRuntimeFilesObserved": True, "hostPreflightComplete": False,
                "operationSuccessProven": False, "requiresHostRecheck": True,
                "existingExecutorFilesAbsent": True, "systemdObserved": False,
                "applicationConfigurationObserved": False, "containersObserved": False,
                "installedManifestRawSha256": _hash(observed["runtime-release.json"][0]),
                "installedFiles": {p: {"sha256": _hash(raw), "bytes": len(raw),
                                     "identity": list(info)} for p, (raw, info) in observed.items()},
                "installedDirectories": {p: list(info) for p, info in directories.items()}}
        if include_configuration:
            files, application = before[1]
            result.update({key: application[key] for key in (
                "applicationSha", "previousApplicationSha", "releaseStatePhase")})
            result.update({"configurationFilesObserved": True,
                           "configurationFiles": {p: {"sha256": _hash(raw), "bytes": len(raw),
                                                     "identity": list(info)}
                                                  for p, (raw, info) in files.items()},
                           "composeExpansionObserved": False, "applicationReleaseAuthenticated": False,
                           "c4StorageObserved": False})
        return result



# D2-3: raw configuration observations, not Compose expansion or host readiness.
CONFIGURATION_NAMES = (".env", ".sanq-release-state.json", ".sanq-backup-layout-activated")


def _configuration_read(root, name, account):
    _need(name in CONFIGURATION_NAMES, "unreviewed installation configuration input")
    private = name != ".sanq-backup-layout-activated"
    maximum = MAX_FILE if name == ".env" else 65536 if private else 4096

    def check(info):
        if private:
            owner, group = ((account.pw_uid, account.pw_gid) if name == ".env"
                            else (PRIVATE_OWNER_UID, PRIVATE_GROUP_GID))
            _need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                  and info.st_uid == owner and info.st_gid == group
                  and stat.S_IMODE(info.st_mode) in (0o400, 0o600),
                  "installation configuration identity or permissions differ")
        else:
            _installed_info(info)

    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        check(before)
        _need(0 < before.st_size <= maximum, "installation configuration size differs")
        chunks, size = [], 0
        while size <= maximum:
            raw = os.read(fd, min(65536, maximum + 1 - size))
            if not raw:
                break
            chunks.append(raw)
            size += len(raw)
        after = os.fstat(fd)
        path = os.stat(name, dir_fd=root, follow_symlinks=False)
        check(after)
        check(path)
        _need(size == before.st_size and _installed_fingerprint(before) ==
              _installed_fingerprint(after) == _installed_fingerprint(path),
              "installation configuration changed during read")
        return b"".join(chunks), _installed_fingerprint(before)
    finally:
        os.close(fd)


def _configuration_snapshot():
    account = pwd.getpwnam("ubuntu")
    _need(type(account.pw_uid) is int and account.pw_uid > 0
          and type(account.pw_gid) is int and account.pw_gid > 0,
          "fixed ubuntu account identity differs")
    with contextlib.ExitStack() as stack:
        anchor = _state_parent()
        stack.callback(os.close, anchor)
        root = stack.enter_context(_installed_directory(anchor, "runtime"))
        files = {name: _configuration_read(root, name, account) for name in CONFIGURATION_NAMES}
        env = files[".env"][0]
        _need(b"\0" not in env and b"\r" not in env.replace(b"\r\n", b""),
              "installation environment contains ambiguous line encoding")
        text = env.decode("utf-8")
        assignments = re.findall(r"(?m)^[ \t]*(?:export[ \t]+)?SANQ_IMAGE_SHA[ \t]*=", text)
        values = re.findall(r"(?m)^SANQ_IMAGE_SHA=([^\r\n]*)\r?$", text)
        _need(len(assignments) == len(values) == 1, "installation environment SHA assignment is ambiguous")
        application = release.require_sha(values[0])
        raw_state = files[".sanq-release-state.json"][0]
        state = json.loads(raw_state, object_pairs_hook=_unique)
        _need(type(state) is dict and set(state) == {
              "schemaVersion", "phase", "current", "previous", "updatedAt", "reason"}
              and type(state["schemaVersion"]) is int and state["schemaVersion"] == 1
              and state["phase"] in ("active", "rolled-back")
              and state["current"] == application, "installation release state is unresolved or inconsistent")
        release.require_sha(state["previous"])
        _need(state["reason"] == ("readiness-verified" if state["phase"] == "active" else "rollback-verified"),
              "installation release state completion reason differs")
        stamp = state["updatedAt"]
        _need(isinstance(stamp, str) and re.fullmatch(
              r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|\+00:00)", stamp),
              "installation release state timestamp is not UTC")
        dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        _need(files[".sanq-backup-layout-activated"][0].decode("utf-8").strip() == "SANQ_BACKUP_LAYOUT_C4_V1",
              "installation C4 activation marker differs")
        return files, {"applicationSha": application, "previousApplicationSha": state["previous"],
                       "releaseStatePhase": state["phase"], "ubuntuUid": account.pw_uid,
                       "ubuntuGid": account.pw_gid}


def _observe_installed_configuration(identity, *, fetch=release.github_json):
    """Raw source/configuration observation only; never returns secret file bytes."""
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("pack", "verify", "plan"):
        sub = commands.add_parser(name)
        sub.add_argument("--source-sha", required=True)
        sub.add_argument("--runtime-archive" if name == "pack" else "--kit", type=Path, required=True)
        if name == "pack":
            sub.add_argument("--output", type=Path, required=True)
        if name == "plan":
            sub.add_argument("--current-runtime-archive", type=Path, required=True)
            sub.add_argument("--current-source-sha", required=True)
    args = parser.parse_args(argv)
    fetch = lambda path: release.github_json(path, token=os.environ.get("GITHUB_TOKEN") or None)
    try:
        if args.command == "pack":
            _need(os.geteuid() != 0, "D1 pack output requires an unprivileged operator")
            payload = build_materials(_read_artifact(args.runtime_archive, bundle.MAX_ARCHIVE_BYTES),
                                      args.source_sha, fetch=fetch)
            _save_new_artifact(args.output, payload)
            result = {"sourceSha": args.source_sha, "kitSha256": _hash(payload),
                      "outcome": "INERT_MATERIALS_WRITTEN", "readyToInstall": False,
                      "canExecute": False, "authorizedToMutateProduction": False}
        elif args.command == "verify":
            result = verify_materials(_read_artifact(args.kit, MAX_KIT), args.source_sha, fetch=fetch)
        else:
            result = review_transition(_read_artifact(args.kit, MAX_KIT), args.source_sha,
                _read_artifact(args.current_runtime_archive, bundle.MAX_ARCHIVE_BYTES),
                args.current_source_sha, fetch=fetch)
        print(json.dumps(result, sort_keys=True, indent=2))
        return 0
    except (release.ReleaseContractError, ValueError, OSError, EOFError, TypeError, KeyError,
            RecursionError, SyntaxError, tarfile.TarError):
        print("Delivery material review blocked; preserve artifacts. No host install or automatic retry.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
