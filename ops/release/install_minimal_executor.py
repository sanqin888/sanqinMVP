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
import ipaddress
import json
import os
import pwd
import re
import selectors
import signal
import subprocess
import time
import stat
import sys
import tarfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

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
    _material_jobs_idle(folders)


def _material_jobs_idle(folders):
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
    return _root_observation_read(parent, name, maximum)


def _root_observation_read(parent, name, maximum):
    _need(name in {Path(p).name for p in RUNTIME_MEMBERS} | {"runtime-release.json", "sanq-backup.timer"},
          "unreviewed root observation input")
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


def _observe_installed_runtime(identity, *, fetch=release.github_json, include_configuration=False, include_docker=False, include_systemd=False,
                               include_filesystem=False, include_prerequisites=False, include_application_binding=False, include_migrations=False, include_effective_configuration=False, include_external_backup=False, _record_intent=False, _load_deny_gates=False, _save_writers=False, _freeze_writers=False, _retain_recovery=False):
    """Private staged observer; writes require complete fresh observations, never a CLI permit."""
    _need(all(type(flag) is bool for flag in (include_configuration, include_docker, include_systemd,
                                             include_filesystem, include_prerequisites, include_application_binding, include_migrations, include_effective_configuration, include_external_backup, _record_intent, _load_deny_gates, _save_writers, _freeze_writers, _retain_recovery))
          and (not include_docker or include_configuration) and (not include_systemd or include_docker)
          and (not include_filesystem or include_systemd) and (not include_prerequisites or include_filesystem)
          and (not include_application_binding or include_prerequisites) and (not include_migrations or include_application_binding)
          and (not include_effective_configuration or include_migrations)
          and (not include_external_backup or include_effective_configuration)
          and (not _record_intent or include_external_backup) and (not _load_deny_gates or _record_intent)
          and (not _save_writers or _load_deny_gates) and (not _freeze_writers or _save_writers)
          and (not _retain_recovery or _freeze_writers),
          "invalid installation observation switches")
    deadline = time.monotonic() + 300
    run = lambda args: _docker_command(args, deadline=deadline)
    def snapshot(*, temporary_files=None):
        runtime = _installed_runtime_snapshot(old, value["currentArchiveSourceSha"])
        configuration = _configuration_snapshot() if include_configuration else None
        docker = (_docker_snapshot(configuration[1], runtime[0]["docker-compose.yml"][0], run, fetch)
                  if include_docker else None)
        systemd_run = lambda args: _systemd_command(args, deadline=deadline)
        systemd = ((_temporary_gate_systemd_parity(before[3], systemd_run, temporary_files)
                    if temporary_files is not None else
                    _systemd_snapshot(runtime[0]["ops/backup/sanq-backup.service"][0], systemd_run))
                   if include_systemd else None)
        filesystem = _host_filesystem_snapshot(deadline=deadline) if include_filesystem else None
        prerequisites = (_runtime_prerequisite_snapshot(docker, lambda args: _runtime_command(args, deadline=deadline))
                         if include_prerequisites else None)
        binding = _application_binding_snapshot(docker, run) if include_application_binding else None
        migrations = (_installation_migration_snapshot(configuration[1]["applicationSha"], docker, prerequisites,
                          lambda args: _runtime_command(args, deadline=deadline), fetch=fetch) if include_migrations else None)
        effective = _effective_configuration_snapshot(docker, run) if include_effective_configuration else None
        external_backup = _external_backup_snapshot(runtime[0]) if include_external_backup else None
        return runtime, configuration, docker, systemd, filesystem, prerequisites, binding, migrations, effective, external_backup
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
        if include_docker:
            result.update({"containersObserved": True, "composeExpansionObserved": True,
                           "containerMountsObserved": True, "currentImagePairBound": True,
                           "docker": before[2]})
        if include_systemd:
            result.update({"systemdObserved": True, "systemd": before[3],
                           "maintenanceGatesLoaded": False, "backupIntegrityObserved": False})
        if include_filesystem:
            result.update({"hostPersistentDirectoriesObserved": True, "backupIntegrityObserved": True,
                           "backupRestoreProven": False, "filesystem": before[4]})
        if include_prerequisites:
            result.update({"runtimePrerequisitesObserved": True, "databaseHistoryObserved": True,
                           "readinessEndpointsObserved": True, "prerequisites": before[5]})
        if include_application_binding:
            result.update({"containerEnvironmentObserved": True, "databaseConnectionTargetObserved": True,
                           "applicationBinding": before[6]})
        if include_migrations:
            result.update({"databaseMigrationParityProven": True, "applicationReleaseAuthenticated": True,
                           "migrations": before[7]})
        if include_effective_configuration:
            result.update({"effectiveContainerConfigurationObserved": True, "effectiveConfiguration": before[8]})
        if include_external_backup:
            result.update({"externalBackupExecutablesObserved": True, "externalBackup": before[9]})
        if _record_intent:
            frozen_recheck = None
            def recheck():
                _need(review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch) == review,
                      "installation material source changed before intent recording")
                _need(snapshot() == before, "host changed before installation intent recording")
                _need(_retained_contents(root, identity) == (kit, old, value), "installation materials changed")
                _idle_for_materials(folders)
            def load_gates(check_owned):
                def source_matches():
                    _need(review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch)
                          == review, "installation source changed during gate loading")
                    _need(_retained_contents(root, identity) == (kit, old, value), "installation materials changed")
                check_owned()
                source_matches()
                _need(snapshot() == before, "host changed before temporary gate creation")
                check_owned()
                files = _write_temporary_gate_files()["files"]
                check_owned()
                _need(_temporary_gate_files() == files, "temporary gates changed before reload")
                _installation_daemon_reload(deadline=deadline)
                check_owned()
                loaded = _verify_temporary_gates(lambda args: _systemd_command(args, deadline=deadline))
                _need(loaded["files"] == files, "loaded temporary gates differ from this write")
                source_matches()
                _need(snapshot(temporary_files=files) == before, "host changed around temporary gate loading")
                check_owned()
                _need(_temporary_gate_files() == files, "temporary gate files changed after host recheck")
                return {**loaded, "startupFenceConfirmed": True, "writersFrozen": False,
                        "canExecute": False, "requiresHostRecheck": True}
            def save_writers(persist, check_owned, loaded):
                _need(loaded is not None and loaded["startupFenceConfirmed"] is True,
                      "saved writers require this round's loaded temporary gates")
                check_owned()
                saved = persist()
                _need(review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch)
                      == review and _retained_contents(root, identity) == (kit, old, value),
                      "installation materials changed after writer recording")
                _need(snapshot(temporary_files=loaded["files"]) == before,
                      "host changed after writer recording")
                check_owned()
                _need(_verify_temporary_gates(lambda args: _systemd_command(args, deadline=deadline))["files"]
                      == loaded["files"], "temporary gates changed after writer recording")
                return saved
            def freeze_writers(check_owned, intent, writers, installation_id, loaded):
                nonlocal frozen_recheck
                def verify_context():
                    check_owned()
                    _need(review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch)
                          == review and _retained_contents(root, identity) == (kit, old, value),
                          "installation materials changed during writer freeze")
                    _need(_installed_runtime_snapshot(old, value["currentArchiveSourceSha"]) == before[0]
                          and _configuration_snapshot() == before[1]
                          and _host_filesystem_snapshot(deadline=deadline) == before[4]
                          and _external_backup_snapshot(before[0][0]) == before[9],
                          "installed files or recovery baseline changed during writer freeze")
                    _temporary_gate_systemd_parity(before[3],
                        lambda args: _systemd_command(args, deadline=deadline), loaded["files"])
                    database = _docker_json(_installation_history_args(before[2]["containers"]["db"]["containerId"]),
                                             lambda args: _runtime_command(args, deadline=deadline))
                    _need(type(database) is dict and set(database) == {*before[5]["databaseIdentity"], "history"}
                          and _json({key: val for key, val in database.items() if key != "history"}) == _json(before[5]["databaseIdentity"])
                          and _hash(_json(database["history"])) == before[5]["migrationHistorySha256"],
                          "database identity or migration history changed during writer freeze")
                    check_owned()
                frozen = _freeze_saved_installation_writers(intent, writers, installation_id,
                    loaded["files"], before[2], run=run, check_owned=check_owned, verify_context=verify_context,
                    mutate=lambda role, action: _installation_writer_command(
                        intent, writers, installation_id, role, action, deadline=deadline),
                    systemd_run=lambda args: _systemd_command(args, deadline=deadline))
                def recheck_frozen():
                    verify_context()
                    _installation_writer_observation(_installation_writers_match(intent, writers, installation_id),
                        before[2], run, set(INSTALL_WRITER_ROLES), set(INSTALL_WRITER_ROLES))
                    check_owned()
                frozen_recheck = recheck_frozen
                return frozen
            capture = None
            if _retain_recovery:
                capture = _installation_recovery_sources(folders, identity, kit, old, value)
                capture = _installation_recovery_host_capture(capture, before, run,
                    lambda args: _systemd_command(args, deadline=deadline), fetch=fetch)
            def retain_recovery(persist, check_owned, intent, writers, installation_id):
                _need(capture is not None and callable(frozen_recheck), "recovery retention requires this owned frozen flow")
                try:
                    frozen_recheck()
                    private = _recovery_private_sources(folders)
                    expected_private = {path: raw for path, raw in capture[0].items()
                        if path.startswith(("/opt/sanq/deploy-state/jobs/", "/opt/sanq/deploy-state/plans/"))}
                    _need(private[0] == expected_private
                          and private[2] == capture[1]["originalLockMetadata"]
                          and private[3] == capture[1]["privateDirectories"]
                          and all(private[1][path] == capture[1]["files"][path]["identity"] for path in private[0]),
                          "recovery private originals changed after capture")
                    _recovery_retention_matches(folders, capture)
                    payload = _installation_recovery_payload(capture, intent, writers, installation_id)
                    receipt = _installation_recovery_receipt(payload, intent, writers, installation_id, _hash(_json(capture[1])))
                    check_owned()
                    result = persist(payload, receipt)
                    _recovery_retention_matches(folders, capture)
                    frozen_recheck()
                    check_owned()
                    return result
                except BaseException:
                    raise release.ReleaseContractError("FENCE_UNCONFIRMED: review retained recovery payload and installation evidence") from None
            result["installationIntent"] = _write_installation_intent_locked(
                folders, identity, result, recheck=recheck, load_gates=load_gates if _load_deny_gates else None,
                save_writers=save_writers if _save_writers else None,
                freeze_writers=freeze_writers if _freeze_writers else None,
                retain_recovery=retain_recovery if _retain_recovery else None,
                recovery_namespace=capture[1]["privateNamespace"] if _retain_recovery else None)
            result["outcome"] = ("INSTALLATION_RECOVERY_FILES_RETAINED" if _retain_recovery else
                                 "INSTALLATION_WRITERS_FROZEN" if _freeze_writers else
                                 "INSTALLATION_WRITERS_SAVED" if _save_writers else
                                 "TEMPORARY_DENY_GATES_LOADED" if _load_deny_gates else "INSTALLATION_INTENT_RECORDED")
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



# D2-4: allowlisted local Docker observations only. Never run/create/pull/exec.
DOCKER = ("/usr/bin/docker", "--host", "unix:///var/run/docker.sock")
COMPOSE = (*DOCKER, "compose", "--project-name", "sanq-app", "--project-directory", "/opt/sanq/runtime",
           "--env-file", "/opt/sanq/runtime/.env", "-f", "/opt/sanq/runtime/docker-compose.yml")
PROJECT_PS = (*DOCKER, "ps", "--all", "--no-trunc", "--filter",
              "label=com.docker.compose.project=sanq-app", "--format", "{{.ID}}")
MAX_HOST_OUTPUT = 2 * 1024 * 1024


def _docker_allowed(args):
    if type(args) is not list or not all(isinstance(v, str) for v in args):
        return False
    command = tuple(args)
    if command in ((*DOCKER, "info", "--format", "{{json .}}"), PROJECT_PS,
                   (*COMPOSE, "config", "--environment"), (*COMPOSE, "config", "--format", "json"),
                   (*DOCKER, "volume", "inspect", "--format", "{{json .}}", "sanq-app_pgdata"), NETWORK_INSPECT):
        return True
    return ((tuple(args[:-1]) == (*DOCKER, "inspect", "--type", "container", "--format", "{{json .}}")
             and re.fullmatch(r"[a-f0-9]{64}", args[-1]) is not None)
            or (tuple(args[:-1]) == (*DOCKER, "image", "inspect", "--format", "{{json .}}")
                and re.fullmatch(r"sha256:[a-f0-9]{64}", args[-1]) is not None))


def _docker_command(args, *, deadline):
    _need(_docker_allowed(args), "unreviewed Docker observation")
    return _observation_command(args, deadline=deadline)


def _observation_command(args, *, deadline):
    _need(_docker_allowed(args) or _systemd_allowed(args) or _runtime_observation_allowed(args),
          "unreviewed Host observation")
    return _bounded_host_client(args, deadline=deadline)


def _installation_daemon_reload(*, deadline):
    """Only this fixed manager mutation; a timeout never means reload was undone."""
    output = _bounded_host_client([*SYSTEMCTL, "daemon-reload"], deadline=deadline)
    _need(output == "", "unexpected installation reload output")


def _bounded_host_client(args, *, deadline, _writer=None):
    if _writer is not None:
        _need(type(_writer) is tuple and len(_writer) == 5
              and args == _saved_writer_args(*_writer), "unreviewed installation writer command")
    _need(os.geteuid() == 0 and (_docker_allowed(args) or _systemd_allowed(args)
          or _runtime_observation_allowed(args) or args == [*SYSTEMCTL, "daemon-reload"] or _writer is not None),
          "unreviewed or unprivileged Host observation")
    _need(not any(os.environ.get(key) for key in (
          "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")),
          "non-default Docker endpoint requires separate review")
    stop = min(deadline, time.monotonic() + (45 if _writer is not None and _writer[4] == "stop" else 30))
    _need(stop > time.monotonic(), "Host observation deadline exhausted")
    try:
        process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, start_new_session=True, cwd="/opt/sanq/runtime",
            env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8",
                 "DOCKER_HOST": "unix:///var/run/docker.sock", "DOCKER_CONTEXT": ""})
    except OSError:
        raise release.ReleaseContractError("Host observation client unavailable") from None
    try:
        output, total = [], 0
        with selectors.DefaultSelector() as selector:
            for stream in (process.stdout, process.stderr):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ)
            while selector.get_map():
                remaining = stop - time.monotonic()
                _need(remaining > 0, "Host observation timed out")
                for key, _ in selector.select(min(remaining, 0.25)):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    total += len(chunk)
                    _need(total <= MAX_HOST_OUTPUT, "Host observation output exceeds budget")
                    if key.fileobj is process.stdout:
                        output.append(chunk)
        remaining = stop - time.monotonic()
        _need(remaining > 0, "Host observation timed out")
        code = process.wait(timeout=remaining)
        _need(code == 0, "Host observation command failed")
        try:
            return b"".join(output).decode("utf-8")
        except UnicodeError:
            raise release.ReleaseContractError("Host observation output encoding invalid") from None
    except BaseException:
        # Only terminate this CLI client group. A manager mutation may already have taken effect.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            pass
        raise
    finally:
        process.stdout.close()
        process.stderr.close()


def _docker_json(args, run):
    raw = run(list(args))
    _need(isinstance(raw, str) and len(raw.encode("utf-8")) <= MAX_HOST_OUTPUT,
          "Docker JSON output exceeds budget")
    return json.loads(raw, object_pairs_hook=_unique,
                      parse_constant=lambda _: _need(False, "invalid Docker JSON constant"))


def _docker_snapshot(application, compose_source, run, fetch):
    sha = release.require_sha(application["applicationSha"])
    paired = release.sealed_release_for_sha(sha, fetch)
    engine = _docker_json((*DOCKER, "info", "--format", "{{json .}}"), run)
    _need(type(engine) is dict and engine.get("LiveRestoreEnabled") is False
          and type(engine.get("Swarm")) is dict and engine["Swarm"].get("LocalNodeState") == "inactive"
          and engine.get("OSType") == "linux" and engine.get("Architecture") in ("x86_64", "amd64")
          and isinstance(engine.get("ID"), str) and bool(engine["ID"])
          and isinstance(engine.get("DockerRootDir"), str) and engine["DockerRootDir"].startswith("/")
          and isinstance(engine.get("ServerVersion"), str) and bool(engine["ServerVersion"]),
          "Docker engine identity, platform or restart fence differs")
    required = {key.decode("ascii") for key, suffix in re.findall(
        rb"(?<!\$)\$\{([A-Z_][A-Z0-9_]*)([^}]*)\}", compose_source)
        if not suffix or suffix.startswith((b"?", b":?"))}
    environment = {}
    for line in run(list((*COMPOSE, "config", "--environment"))).splitlines():
        key, separator, value = line.partition("=")
        _need(separator == "=" and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key)
              and key not in environment and len(environment) < 4096, "Compose environment observation differs")
        environment[key] = value
    _need(all(environment.get(key) for key in required) and environment.get("SANQ_IMAGE_SHA") == sha,
          "required Compose environment is missing or has a different application SHA")
    expanded = _docker_json((*COMPOSE, "config", "--format", "json"), run)
    roles = ("api", "ubereats-worker", "web", "db")
    _need(type(expanded) is dict and expanded.get("name") == "sanq-app"
          and type(expanded.get("services")) is dict and set(expanded["services"]) == set(roles),
          "expanded Compose project or service set differs")
    for service in roles[:-1]:
        image = "sanq-web" if service == "web" else "sanq-api"
        _need(expanded["services"][service].get("image") == paired["images"][image]["ref"],
              "expanded Compose application image differs")
    _need(expanded["services"]["db"].get("image") == "postgres:15-alpine", "expanded DB image differs")
    identifiers = run(list(PROJECT_PS)).splitlines()
    _need(len(identifiers) == len(set(identifiers)) == 4 and all(
          re.fullmatch(r"[a-f0-9]{64}", value) for value in identifiers),
          "project container inventory is incomplete, ambiguous or has extra objects")
    volume = _docker_json((*DOCKER, "volume", "inspect", "--format", "{{json .}}", "sanq-app_pgdata"), run)
    _need(type(volume) is dict and volume.get("Name") == "sanq-app_pgdata"
          and volume.get("Driver") == volume.get("Scope") == "local"
          and volume.get("Options") in (None, {}) and type(volume.get("Labels")) is dict
          and volume["Labels"].get("com.docker.compose.project") == "sanq-app"
          and volume["Labels"].get("com.docker.compose.volume") == "pgdata"
          and volume.get("Mountpoint") == engine["DockerRootDir"].rstrip("/") + "/volumes/sanq-app_pgdata/_data",
          "existing DB volume identity or driver differs")
    result, images = {}, {}
    for identifier in sorted(identifiers):
        info = _docker_json((*DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", identifier), run)
        _need(type(info) is dict and info.get("Id") == identifier and type(info.get("Config")) is dict
              and type(info["Config"].get("Labels")) is dict, "container identity differs")
        config = info["Config"]
        labels = config["Labels"]
        service = labels.get("com.docker.compose.service")
        _need(labels.get("com.docker.compose.project") == "sanq-app" and service in roles
              and service not in result, "container role or project differs")
        state, host = info.get("State"), info.get("HostConfig")
        _need(type(state) is dict and state.get("Running") is True and state.get("Status") == "running"
              and state.get("Paused") is False and state.get("Restarting") is False and state.get("Dead") is False
              and type(state.get("Health")) is dict and state["Health"].get("Status") == "healthy"
              and type(host) is dict and host.get("Privileged") is False,
              "container is not healthy and steadily running")
        policy = host.get("RestartPolicy")
        _need(type(policy) is dict and set(policy) == {"Name", "MaximumRetryCount"}
              and policy["Name"] in ("no", "always", "unless-stopped", "on-failure")
              and type(policy["MaximumRetryCount"]) is int and policy["MaximumRetryCount"] >= 0
              and (policy["Name"] == "on-failure" or policy["MaximumRetryCount"] == 0),
              "container restart policy differs")
        image_id = release.checked_digest(info.get("Image"))
        if image_id not in images:
            images[image_id] = _docker_json((*DOCKER, "image", "inspect", "--format", "{{json .}}", image_id), run)
        image_info = images[image_id]
        _need(type(image_info) is dict and image_info.get("Id") == image_id
              and image_info.get("Os") == "linux" and image_info.get("Architecture") == "amd64"
              and type(image_info.get("Config")) is dict, "local image identity or platform differs")
        if service != "db":
            image = "sanq-web" if service == "web" else "sanq-api"
            pair = paired["images"][image]
            pinned = pair["ref"].rsplit(":", 1)[0] + "@" + release.checked_digest(pair["digest"])
            _need(config.get("Image") in (pair["ref"], pinned)
                  and type(image_info.get("RepoDigests")) is list and pinned in image_info["RepoDigests"]
                  and type(image_info["Config"].get("Labels")) is dict
                  and image_info["Config"]["Labels"].get("org.opencontainers.image.revision") == sha,
                  "current application image differs from sealed digest or revision")
        else:
            _need(config.get("Image") == "postgres:15-alpine", "current database image declaration differs")
        for field, option in (("Cmd", "command"), ("Entrypoint", "entrypoint")):
            desired = expanded["services"][service].get(option, image_info["Config"].get(field))
            _need((desired is None or type(desired) is list and all(isinstance(v, str) for v in desired))
                  and config.get(field) == desired, "container command differs from reviewed Compose/image")
        expected = (("volume", "/var/lib/postgresql/data", volume["Mountpoint"], True) if service == "db" else
                    ("bind", "/app/apps/web/public/sounds", "/home/ubuntu/sanq-assets/sounds", False) if service == "web"
                    else ("bind", "/app/uploads", "/srv/sanq/uploads", True))
        mounts = info.get("Mounts")
        _need(type(mounts) is list and len(mounts) == 1 and type(mounts[0]) is dict,
              "container persistent mount set differs")
        mount = mounts[0]
        _need((mount.get("Type"), mount.get("Destination"), mount.get("Source"), mount.get("RW")) == expected
              and type(mount.get("RW")) is bool
              and (service != "db" or mount.get("Name") == "sanq-app_pgdata"),
              "container persistent mount identity differs")
        _need(type(info.get("RestartCount")) is int and info["RestartCount"] >= 0
              and isinstance(state.get("StartedAt"), str) and bool(state["StartedAt"]),
              "container lifetime observation differs")
        result[service] = {"containerId": identifier, "imageId": image_id, "restartPolicy": policy,
                           "restartCount": info["RestartCount"], "startedAt": state["StartedAt"],
                           "configurationSha256": _hash(_json(config)), "mountSha256": _hash(_json(mounts))}
    _need(set(result) == set(roles) and result["api"]["imageId"] == result["ubereats-worker"]["imageId"],
          "service inventory or API/worker image pair differs")
    return {"containers": result, "currentImageSeal": paired,
            "renderedComposeSha256": _hash(_json(expanded)),
            "dockerEngine": {key: engine[key] for key in ("ID", "DockerRootDir", "ServerVersion", "OSType", "Architecture")},
            "databaseVolumeSha256": _hash(_json(volume))}


def _observe_installed_docker(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True, include_docker=True)



# D2-5: initial-install systemd observation. No reload/start/stop or gate writes.
SYSTEMD_UNITS = ("docker.service", "docker.socket", "sanq-backup.service", "sanq-backup.timer")
SYSTEMD_KEYS = ("LoadState", "ActiveState", "SubState", "UnitFileState", "FragmentPath",
                "DropInPaths", "NeedDaemonReload")
SYSTEMCTL = ("/usr/bin/systemctl", "--system")


def _systemd_keys(unit):
    _need(unit in SYSTEMD_UNITS, "unreviewed systemd unit")
    return SYSTEMD_KEYS + (("ExecStart", "ExecStartPre", "ExecStartPost", "ExecStopPost") if unit.endswith(".service")
                           else ("Triggers",)) + (("User", "Group", "UMask", "Type")
                                                  if unit == "sanq-backup.service" else ())


def _systemd_args(unit):
    return [*SYSTEMCTL, "show", unit, "--no-pager", "--property=" + ",".join(_systemd_keys(unit))]


def _systemd_allowed(args):
    return type(args) is list and any(args == _systemd_args(unit) for unit in SYSTEMD_UNITS)


def _systemd_command(args, *, deadline):
    _need(_systemd_allowed(args), "unreviewed systemd observation")
    return _observation_command(args, deadline=deadline)


def _systemd_root():
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in (None, "etc", "systemd", "system"):
            if name is not None:
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = child
            _installed_info(os.fstat(fd), directory=True)
        result, fd = fd, None
        return result
    finally:
        if fd is not None:
            os.close(fd)


def _systemd_disk_snapshot(backup_source):
    root = _systemd_root()
    try:
        before = os.fstat(root)
        _installed_info(before, directory=True)
        files = {name: _root_observation_read(root, name, 65536)
                 for name in ("sanq-backup.service", "sanq-backup.timer")}
        _need(files["sanq-backup.service"][0] == backup_source,
              "installed backup service differs from the old sealed Runtime member")
        for name in ("docker.service", "docker.socket"):
            try:
                os.stat(name, dir_fd=root, follow_symlinks=False)
            except FileNotFoundError:
                continue
            raise release.ReleaseContractError("local Docker unit override requires separate review")
        directories = {}
        # Include type-wide and dashed-prefix overrides, not just our reserved filename.
        for name in (*[unit + ".d" for unit in SYSTEMD_UNITS],
                     "service.d", "socket.d", "timer.d", "sanq-.service.d", "sanq-.timer.d"):
            try:
                fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
            except FileNotFoundError:
                directories[name] = None
                continue
            try:
                info = os.fstat(fd)
                _installed_info(info, directory=True)
                _need(not os.listdir(fd), "systemd override or maintenance drop-in residue requires separate review")
                actual = os.stat(name, dir_fd=root, follow_symlinks=False)
                _installed_info(actual, directory=True)
                _need(_installed_fingerprint(info) == _installed_fingerprint(os.fstat(fd)) ==
                      _installed_fingerprint(actual), "systemd override directory changed during read")
                directories[name] = _installed_fingerprint(info)
            finally:
                os.close(fd)
        after = os.fstat(root)
        _installed_info(after, directory=True)
        _need(_installed_fingerprint(before) == _installed_fingerprint(after),
              "systemd configuration directory changed during read")
        return files, directories, _installed_fingerprint(before)
    finally:
        os.close(root)


def _systemd_loaded_units(run):
    units = {}
    for unit in SYSTEMD_UNITS:
        keys = _systemd_keys(unit)
        raw = run(_systemd_args(unit))
        _need(isinstance(raw, str) and len(raw.encode("utf-8")) <= 65536,
              "systemd observation exceeds budget")
        fields = {}
        for line in raw.splitlines():
            key, separator, value = line.partition("=")
            _need(separator == "=" and key in keys and key not in fields,
                  "invalid or duplicate systemd property")
            fields[key] = value
        _need(set(fields) == set(keys), "incomplete systemd properties")
        _need(fields["LoadState"] == "loaded" and fields["NeedDaemonReload"] == "no"
              and fields["DropInPaths"] == ""
              and fields["UnitFileState"] in ("enabled", "disabled", "static", "indirect"),
              "systemd unit is unloaded, stale, masked or has unreviewed overrides")
        expected = ("/etc/systemd/system/" + unit,) if unit.startswith("sanq-") else (
            "/lib/systemd/system/" + unit, "/usr/lib/systemd/system/" + unit)
        _need(fields["FragmentPath"] in expected, "systemd full-unit override or unexpected source")
        if unit == "docker.service":
            _need((fields["ActiveState"], fields["SubState"]) == ("active", "running")
                  and bool(fields["ExecStart"]), "Docker service is not steadily running")
        elif unit == "docker.socket":
            _need((fields["ActiveState"], fields["SubState"]) == ("active", "listening")
                  and fields["Triggers"].split() == ["docker.service"], "Docker socket target or state differs")
        elif unit == "sanq-backup.timer":
            _need((fields["ActiveState"], fields["SubState"]) in (("active", "waiting"), ("inactive", "dead"))
                  and fields["Triggers"].split() == ["sanq-backup.service"], "backup timer target or state differs")
        else:
            command = "path=/home/ubuntu/backup-db.sh ; argv[]=/home/ubuntu/backup-db.sh ; ignore_errors=no"
            _need((fields["ActiveState"], fields["SubState"]) == ("inactive", "dead")
                  and fields["User"] == "ubuntu" and fields["Group"] in ("", "ubuntu")
                  and fields["UMask"] == "0077" and fields["Type"] == "oneshot"
                  and command in fields["ExecStart"] and fields["ExecStart"].count("path=") == 1
                  and fields["ExecStart"].count("argv[]=") == 1
                  and all(fields[key] == "" for key in ("ExecStartPre", "ExecStartPost", "ExecStopPost")),
                  "backup service is active, redirected or has unreviewed hooks")
        units[unit] = fields
    return units


def _systemd_snapshot(backup_source, run):
    disk = _systemd_disk_snapshot(backup_source)
    units = _systemd_loaded_units(run)
    _need(_systemd_disk_snapshot(backup_source) == disk, "systemd files changed around loaded-unit observation")
    files, directories, root = disk
    return {"units": {unit: {**{key: fields[key] for key in SYSTEMD_KEYS},
                             "effectivePropertiesSha256": _hash(_json(fields))}
                      for unit, fields in units.items()},
            "installedBackupUnits": {name: {"sha256": _hash(raw), "bytes": len(raw), "identity": list(info)}
                                     for name, (raw, info) in files.items()},
            "overrideDirectories": {name: list(info) if info is not None else None
                                    for name, info in directories.items()},
            "systemdDirectoryIdentity": list(root), "reservedMaintenanceDropinsAbsent": True,
            "backupTimerSourceAuthenticated": False, "vendorUnitBytesAuthenticated": False}


def _observe_installed_systemd(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True,
                                      include_docker=True, include_systemd=True)



# D2-6: host-directory and local backup observations. No backup/restore or data copy.
MAX_LOCAL_BACKUP = 1024 * 1024 * 1024
MAX_BACKUP_ENTRIES = 4096
BACKUP_FILE = re.compile(r"sanqin_db_[0-9]{8}_[0-9]{6}\.sql\.gz\Z")
HOST_DIRECTORIES = (
    (("srv",), "root"), (("srv", "sanq"), "root"),
    (("srv", "sanq", "uploads"), "data"), (("srv", "sanq", "backups"), "backup"),
    (("home",), "root"), (("home", "ubuntu"), "ubuntu"),
    (("home", "ubuntu", "sanq-assets"), "ubuntu"),
    (("home", "ubuntu", "sanq-assets", "sounds"), "data"),
)


def _directory_identity(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode)


def _host_storage_root():
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        _installed_info(os.fstat(fd), directory=True)
    except BaseException:
        os.close(fd)
        raise
    return fd


@contextlib.contextmanager
def _host_directory(parent, name, policy, account):
    _need(name in {parts[-1] for parts, _ in HOST_DIRECTORIES}
          and policy in ("root", "ubuntu", "backup", "data"), "unreviewed host directory")
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    def check(info):
        _need(stat.S_ISDIR(info.st_mode) and not stat.S_IMODE(info.st_mode) & 0o7022,
              "host data directory type or permissions differ")
        if policy != "data":
            owner, group = ((PRIVATE_OWNER_UID, PRIVATE_GROUP_GID) if policy == "root"
                            else (account.pw_uid, account.pw_gid))
            _need(info.st_uid == owner and info.st_gid == group, "host directory owner or group differs")
        if policy == "backup":
            _need(stat.S_IMODE(info.st_mode) == 0o700, "backup directory must retain private 0700 permissions")
    try:
        before = os.fstat(fd)
        check(before)
        path = os.stat(name, dir_fd=parent, follow_symlinks=False)
        check(path)
        _need(_directory_identity(before) == _directory_identity(path), "host directory changed during open")
        yield fd
        after = os.fstat(fd)
        path = os.stat(name, dir_fd=parent, follow_symlinks=False)
        check(after)
        check(path)
        _need(_directory_identity(before) == _directory_identity(after) == _directory_identity(path),
              "host directory changed during observation")
    finally:
        os.close(fd)


def _local_backup_snapshot(root, account, *, deadline):
    _need(time.monotonic() < deadline, "backup observation deadline exhausted")
    directory = os.fstat(root)
    candidates, count = [], 0
    with os.scandir(root) as entries:
        for entry in entries:
            count += 1
            _need(count <= MAX_BACKUP_ENTRIES, "backup directory entry budget exceeded")
            if BACKUP_FILE.fullmatch(entry.name):
                candidates.append((entry.stat(follow_symlinks=False).st_mtime_ns, entry.name))
    _need(bool(candidates), "no local database backup")
    # Choose newest first; a bad newest file never falls back to an older success.
    _, name = max(candidates)
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
              and before.st_uid == account.pw_uid and before.st_gid == account.pw_gid
              and stat.S_IMODE(before.st_mode) in (0o400, 0o600)
              and 0 < before.st_size <= MAX_LOCAL_BACKUP, "backup file identity, permissions or size differs")
        def fresh():
            age = dt.datetime.now(dt.timezone.utc).timestamp() - before.st_mtime
            _need(0 <= age <= 26 * 3600, "backup is future dated or older than 26 hours")
            _need(time.monotonic() < deadline, "backup observation timed out")
        fresh()
        digest, expanded = hashlib.sha256(), 0
        with os.fdopen(os.dup(fd), "rb") as source:
            compressed = 0
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                compressed += len(chunk)
                _need(compressed <= MAX_LOCAL_BACKUP, "backup compressed size exceeds budget")
                digest.update(chunk)
                fresh()
            _need(compressed == before.st_size, "backup changed during compressed read")
            source.seek(0)
            with gzip.GzipFile(fileobj=source) as archive:
                for chunk in iter(lambda: archive.read(1024 * 1024), b""):
                    expanded += len(chunk)
                    _need(expanded <= 4 * MAX_LOCAL_BACKUP, "backup expanded size exceeds budget")
                    fresh()
        _need(expanded > 0, "backup gzip has no SQL payload")
        fresh()
        after = os.fstat(fd)
        path = os.stat(name, dir_fd=root, follow_symlinks=False)
        _need(_installed_fingerprint(before) == _installed_fingerprint(after) == _installed_fingerprint(path)
              and _installed_fingerprint(directory) == _installed_fingerprint(os.fstat(root)),
              "backup file or inventory changed during observation")
        return {"fileName": name, "sha256": digest.hexdigest(), "bytes": before.st_size,
                "expandedBytes": expanded, "identity": list(_installed_fingerprint(before)),
                "gzipIntegrityObserved": True, "localAgeLimitHours": 26, "restoreProven": False}
    finally:
        os.close(fd)


def _host_filesystem_snapshot(*, deadline):
    account = pwd.getpwnam("ubuntu")
    _need(type(account.pw_uid) is int and account.pw_uid > 0
          and type(account.pw_gid) is int and account.pw_gid > 0, "fixed ubuntu account identity differs")
    with contextlib.ExitStack() as stack:
        root = _host_storage_root()
        stack.callback(os.close, root)
        directories = {(): root}
        identities = {}
        for parts, policy in HOST_DIRECTORIES:
            fd = stack.enter_context(_host_directory(directories[parts[:-1]], parts[-1], policy, account))
            directories[parts] = fd
            identities["/" + "/".join(parts)] = list(_directory_identity(os.fstat(fd)))
        state_parent = _state_parent()
        stack.callback(os.close, state_parent)
        disk = os.fstatvfs(state_parent)
        _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES,
              "installation filesystem has less than the 5 GiB reserve")
        backup = _local_backup_snapshot(directories[("srv", "sanq", "backups")], account, deadline=deadline)
        return {"hostDirectories": identities, "backup": backup,
                "installationFilesystemDevice": os.fstat(state_parent).st_dev,
                "diskReserveSatisfied": True, "requiredFreeBytes": MIN_PRIVATE_FREE_BYTES,
                "ubuntuUid": account.pw_uid, "ubuntuGid": account.pw_gid}


def _observe_installed_filesystem(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True,
                                      include_docker=True, include_systemd=True, include_filesystem=True)



# D2-7: installed runtime prerequisites. Read-only SQL, fixed HTTP GET and stdlib probe.
MIN_AVAILABLE_MEMORY = 512 * 1024 * 1024
PYTHON_OBSERVATION = ("import json,sys; print(json.dumps({'version':list(sys.version_info[:3]),"
                      "'implementation':sys.implementation.name,'executable':sys.executable,'platform':sys.platform}))")
PYTHON_ARGS = ("/usr/bin/python3", "-I", "-S", "-B", "-c", PYTHON_OBSERVATION)
READINESS_URLS = ("http://127.0.0.1:4000/api/v1/ready", "http://127.0.0.1:4001/ready",
                  "http://127.0.0.1:3000/health", "https://sanq.ca/health",
                  "https://sanq.ca/api/v1/ready", "https://sanq.ca/api/v1/menu/public")
CURL_ARGS = ("/usr/bin/curl", "--disable", "--fail", "--silent", "--show-error",
             "--connect-timeout", "3", "--max-time", "10", "--noproxy", "*",
             "--proto", "=http,https", "--request", "GET", "--output", "/dev/null",
             "--write-out", "%{http_code}")
INSTALL_HISTORY_SQL = """BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SELECT pg_catalog.json_build_object(
 'database',pg_catalog.current_database(),'port',pg_catalog.current_setting('port'),
 'dataDirectory',pg_catalog.current_setting('data_directory'),
 'serverVersionNum',pg_catalog.current_setting('server_version_num'),
 'inRecovery',pg_catalog.pg_is_in_recovery(),
 'transactionReadOnly',pg_catalog.current_setting('transaction_read_only'),
 'history',(SELECT COALESCE(pg_catalog.json_agg(pg_catalog.json_build_object(
   'name',migration_name,'sha256',checksum,'state',CASE WHEN rolled_back_at IS NOT NULL THEN 'rolled-back'
   WHEN finished_at IS NOT NULL THEN 'applied' ELSE 'failed' END)
   ORDER BY migration_name,started_at,id),'[]'::json) FROM (
   SELECT migration_name,checksum,rolled_back_at,finished_at,started_at,id
   FROM public."_prisma_migrations" ORDER BY migration_name,started_at,id LIMIT 20001) AS m));
COMMIT;"""
INSTALL_HISTORY_COMMAND = (
    'exec /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=5 '
    'psql -X -w -qAt -v ON_ERROR_STOP=1 -h /var/run/postgresql -p 5432 '
    '-U "$POSTGRES_USER" -d sanqin_db -c "$1"')


def _installation_history_args(identifier):
    _need(isinstance(identifier, str) and re.fullmatch(r"[a-f0-9]{64}", identifier),
          "invalid saved database container identity")
    return [*DOCKER, "exec", identifier, "/bin/sh", "-c", INSTALL_HISTORY_COMMAND,
            "sanq-install-history", INSTALL_HISTORY_SQL]


def _runtime_observation_allowed(args):
    if type(args) is not list or not all(isinstance(value, str) for value in args):
        return False
    if tuple(args) == PYTHON_ARGS or any(tuple(args) == (*CURL_ARGS, url) for url in READINESS_URLS):
        return True
    position = len(DOCKER) + 1
    if len(args) == len(DOCKER) + 8 and re.fullmatch(r"[a-f0-9]{64}", args[position]):
        return args == _installation_inventory_args(args[position])
    return (len(args) == len(DOCKER) + 7 and re.fullmatch(r"[a-f0-9]{64}", args[position]) is not None
            and args == _installation_history_args(args[position]))


def _runtime_command(args, *, deadline):
    _need(_runtime_observation_allowed(args), "unreviewed runtime prerequisite command")
    return _observation_command(args, deadline=deadline)


def _memory_threshold_observed():
    fd = os.open("/proc/meminfo", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        _installed_info(os.fstat(fd))
        raw = os.read(fd, 65537)
        _need(len(raw) <= 65536, "memory observation exceeds budget")
    finally:
        os.close(fd)
    matches = re.findall(rb"(?m)^MemAvailable:[ \t]+([0-9]+) kB$", raw)
    _need(len(matches) == 1 and int(matches[0]) * 1024 >= MIN_AVAILABLE_MEMORY,
          "available memory is missing, ambiguous or below the 512 MiB reserve")
    return {"minimumAvailableMemoryBytes": MIN_AVAILABLE_MEMORY, "availableMemoryThresholdSatisfied": True}


def _runtime_prerequisite_snapshot(docker, run):
    resources = _memory_threshold_observed()
    # Reuse the bounded strict JSON decoder; arguments are independently allowlisted.
    python = _docker_json(PYTHON_ARGS, run)
    _need(type(python) is dict and set(python) == {"version", "implementation", "executable", "platform"}
          and type(python["version"]) is list and len(python["version"]) == 3
          and all(type(value) is int and value >= 0 for value in python["version"])
          and python["version"][0] == 3 and tuple(python["version"][:2]) >= (3, 10)
          and python["implementation"] == "cpython" and python["platform"] == "linux"
          and python["executable"] == "/usr/bin/python3", "system Python prerequisite differs")
    identifier = docker["containers"]["db"]["containerId"]
    database = _docker_json(_installation_history_args(identifier), run)
    _need(type(database) is dict and set(database) == {"database", "port", "dataDirectory",
          "serverVersionNum", "inRecovery", "transactionReadOnly", "history"}
          and database["database"] == "sanqin_db" and database["port"] == "5432"
          and database["dataDirectory"] == "/var/lib/postgresql/data"
          and isinstance(database["serverVersionNum"], str)
          and re.fullmatch(r"[0-9]{6}", database["serverVersionNum"])
          and 150000 <= int(database["serverVersionNum"]) < 160000
          and database["inRecovery"] is False and database["transactionReadOnly"] == "on"
          and type(database["history"]) is list and 0 < len(database["history"]) <= 20000,
          "local read-only database identity or history differs")
    for row in database["history"]:
        _need(type(row) is dict and set(row) == {"name", "sha256", "state"}
              and isinstance(row["name"], str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,199}", row["name"])
              and isinstance(row["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", row["sha256"])
              and row["state"] in ("applied", "rolled-back"), "database history is unresolved or invalid")
    statuses = {}
    for url in READINESS_URLS:
        code = run(list((*CURL_ARGS, url)))
        _need(code == "200", "fixed readiness endpoint did not return HTTP 200")
        statuses[url] = code
    return {"resources": resources, "systemPython": python, "databaseContainerId": identifier,
            "databaseIdentity": {key: value for key, value in database.items() if key != "history"},
            "migrationHistorySha256": _hash(_json(database["history"])),
            "migrationHistoryRows": len(database["history"]),
            "rolledBackHistoryRows": sum(row["state"] == "rolled-back" for row in database["history"]),
            "httpStatuses": statuses, "databaseMigrationParityProven": False,
            "systemPythonProvenanceAuthenticated": False}


def _observe_installed_prerequisites(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True)


# D2-8: compare effective environment and the saved local database route.
NETWORK_NAME = "sanq-app_default"
NETWORK_INSPECT = (*DOCKER, "network", "inspect", "--format", "{{json .}}", NETWORK_NAME)


def _container_environment(values):
    _need(type(values) is list and len(values) <= 4096, "container environment inventory differs")
    result = {}
    for item in values:
        _need(isinstance(item, str) and "\0" not in item, "invalid container environment entry")
        key, separator, value = item.partition("=")
        _need(separator == "=" and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key)
              and key not in result, "container environment key is missing or ambiguous")
        result[key] = value
    return result


def _compose_environment(values):
    _need(type(values) is dict and len(values) <= 4096, "expanded environment must be a bounded mapping")
    result = {}
    for key, value in values.items():
        _need(isinstance(key, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key)
              and isinstance(value, str) and "\0" not in value,
              "expanded environment key or value differs")
        # Compose config JSON escapes literal dollars. Decode this export once,
        # only for comparison; image/actual Env and retained config stay untouched.
        _need("$" not in value.replace("$$", ""), "unpaired dollar in Compose JSON export")
        result[key] = value.replace("$$", "$")
    return result


def _database_url_matches(value, database):
    _need(isinstance(value, str) and value.startswith("postgresql://")
          and not any(ord(char) <= 32 or ord(char) == 127 for char in value)
          and re.search(r"%(?![a-fA-F0-9]{2})", value) is None, "application database URL is invalid")
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == "postgresql" and parsed.hostname == "db" and parsed.port == 5432
                 and parsed.path == "/sanqin_db" and not parsed.query and not parsed.fragment
                 and parsed.username is not None and parsed.password is not None
                 and unquote(parsed.username, errors="strict") == database["POSTGRES_USER"]
                 and unquote(parsed.password, errors="strict") == database["POSTGRES_PASSWORD"])
    except (ValueError, UnicodeError):
        valid = False
    _need(valid, "application database URL does not match the saved local database environment")


def _application_network_snapshot(network, containers):
    identifiers = {info["Id"] for info in containers.values()}
    _need(type(network) is dict and network.get("Name") == NETWORK_NAME
          and isinstance(network.get("Id"), str) and re.fullmatch(r"[a-f0-9]{64}", network["Id"])
          and network.get("Driver") == "bridge" and network.get("Scope") == "local"
          and network.get("Internal") is False and network.get("EnableIPv6") is False
          and network.get("Ingress") is False and type(network.get("Labels")) is dict
          and network["Labels"].get("com.docker.compose.project") == "sanq-app"
          and network["Labels"].get("com.docker.compose.network") == "default"
          and network.get("Options") in (None, {}) and type(network.get("Containers")) is dict
          and set(network["Containers"]) == identifiers, "project network identity or endpoint inventory differs")
    ipam = network.get("IPAM")
    _need(type(ipam) is dict and ipam.get("Driver") == "default" and ipam.get("Options") in (None, {})
          and type(ipam.get("Config")) is list and len(ipam["Config"]) == 1
          and type(ipam["Config"][0]) is dict, "project network IPAM differs")
    try:
        subnet = ipaddress.IPv4Network(ipam["Config"][0]["Subnet"], strict=True)
        gateway = ipaddress.IPv4Address(ipam["Config"][0]["Gateway"])
        _need(gateway in subnet and gateway not in (subnet.network_address, subnet.broadcast_address),
              "project network gateway differs")
    except (KeyError, TypeError, ValueError) as exc:
        raise release.ReleaseContractError("project network IPv4 identity is invalid") from exc
    endpoints, addresses, endpoint_ids = {}, set(), set()
    for role, info in containers.items():
        host, settings = info.get("HostConfig"), info.get("NetworkSettings")
        _need(type(host) is dict and host.get("NetworkMode") == NETWORK_NAME
              and all(host.get(key) in (None, []) for key in ("ExtraHosts", "Links", "Dns", "DnsOptions", "DnsSearch"))
              and type(settings) is dict and type(settings.get("Networks")) is dict
              and set(settings["Networks"]) == {NETWORK_NAME}, "container network or resolver override differs")
        attached = settings["Networks"][NETWORK_NAME]
        endpoint = network["Containers"][info["Id"]]
        _need(type(attached) is dict and type(endpoint) is dict
              and attached.get("NetworkID") == network["Id"]
              and isinstance(attached.get("EndpointID"), str) and re.fullmatch(r"[a-f0-9]{64}", attached["EndpointID"])
              and endpoint.get("EndpointID") == attached["EndpointID"]
              and attached.get("EndpointID") not in endpoint_ids
              and type(attached.get("Aliases")) is list and 0 < len(attached["Aliases"]) <= 256
              and all(isinstance(alias, str) and alias and "\0" not in alias for alias in attached["Aliases"])
              and len(attached["Aliases"]) == len(set(attached["Aliases"]))
              and role in attached["Aliases"]
              and (role == "db" or "db" not in attached["Aliases"])
              and (role == "api" or "api" not in attached["Aliases"])
              and attached.get("GlobalIPv6Address", "") == "" and endpoint.get("IPv6Address", "") == "",
              "saved container network endpoint or service alias differs")
        try:
            interface = ipaddress.IPv4Interface(endpoint["IPv4Address"])
            address = ipaddress.IPv4Address(attached["IPAddress"])
            _need(interface.network == subnet and interface.ip == address and address not in addresses
                  and address not in (gateway, subnet.network_address, subnet.broadcast_address)
                  and type(attached.get("IPPrefixLen")) is int and attached["IPPrefixLen"] == subnet.prefixlen
                  and attached.get("Gateway") == str(gateway), "saved container IPv4 route differs")
        except (KeyError, TypeError, ValueError) as exc:
            raise release.ReleaseContractError("saved container IPv4 identity is invalid") from exc
        addresses.add(address)
        endpoint_ids.add(attached["EndpointID"])
        endpoints[role] = {"containerId": info["Id"], "endpointId": attached["EndpointID"],
                           "ipv4": str(interface), "aliases": sorted(attached["Aliases"])}
    return {"networkId": network["Id"], "subnet": str(subnet), "gateway": str(gateway), "endpoints": endpoints}


def _application_binding_snapshot(docker, run):
    expanded = _docker_json((*COMPOSE, "config", "--format", "json"), run)
    _need(_hash(_json(expanded)) == docker["renderedComposeSha256"],
          "expanded Compose changed before application binding")
    environments, containers, images = {}, {}, {}
    for role, saved in docker["containers"].items():
        info = _docker_json((*DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", saved["containerId"]), run)
        _need(type(info) is dict and info.get("Id") == saved["containerId"] and info.get("Image") == saved["imageId"]
              and type(info.get("Config")) is dict and _hash(_json(info["Config"])) == saved["configurationSha256"]
              and _hash(_json(info.get("Mounts"))) == saved["mountSha256"],
              "saved container changed before application binding")
        image_id = saved["imageId"]
        if image_id not in images:
            images[image_id] = _docker_json((*DOCKER, "image", "inspect", "--format", "{{json .}}", image_id), run)
        image = images[image_id]
        _need(type(image) is dict and image.get("Id") == image_id and type(image.get("Config")) is dict,
              "saved image defaults differ")
        desired = _container_environment(image["Config"].get("Env", []))
        desired.update(_compose_environment(expanded["services"][role].get("environment", {})))
        actual = _container_environment(info["Config"].get("Env"))
        _need(actual == desired, "effective container environment differs from reviewed Compose and image defaults")
        environments[role], containers[role] = actual, info
    database = environments["db"]
    _need(all(isinstance(database.get(key), str) and database[key]
              for key in ("POSTGRES_USER", "POSTGRES_PASSWORD"))
          and database.get("POSTGRES_DB") == "sanqin_db"
          and database.get("PGDATA") == "/var/lib/postgresql/data",
          "saved database environment differs")
    api, worker = environments["api"], environments["ubereats-worker"]
    _need(api.get("DATABASE_URL") == worker.get("DATABASE_URL"), "API and worker database URLs differ")
    _database_url_matches(api.get("DATABASE_URL"), database)
    _need(environments["web"].get("API_UPSTREAM") == "http://api:4000", "web API upstream differs")
    network = _application_network_snapshot(_docker_json(NETWORK_INSPECT, run), containers)
    return {"environmentSha256": {role: _hash(_json(env)) for role, env in environments.items()},
            "environmentEntries": {role: len(env) for role, env in environments.items()},
            "databaseContainerId": docker["containers"]["db"]["containerId"],
            "network": network, "databaseLoginVerified": False, "databaseMigrationParityProven": False,
            "fullApplicationConfigurationProven": False}


def _observe_installed_application_binding(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True)



# D2-9a: pure input consistency only; collection/source binding remain separate.
def _installation_migration_consistency(inventory, history):
    """Reject pending SQL during tool installation. Inputs do not prove host facts."""
    _need(type(inventory) is list and 0 < len(inventory) <= 10000,
          "installation migration inventory is empty or exceeds budget")
    migrations, total = {}, 0
    for item in inventory:
        _need(type(item) is dict and set(item) == {"name", "bytes", "sha256", "gitBlobSha"},
              "installation migration inventory fields differ")
        name = item["name"]
        _need(isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,199}", name)
              and name not in migrations and type(item["bytes"]) is int and 0 < item["bytes"] <= 2 * 1024 * 1024
              and isinstance(item["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", item["sha256"])
              and isinstance(item["gitBlobSha"], str) and re.fullmatch(r"[a-f0-9]{40}", item["gitBlobSha"]),
              "installation migration inventory identity differs")
        total += item["bytes"]
        _need(total <= 64 * 1024 * 1024, "installation migration byte budget exceeded")
        migrations[name] = item
    _need(list(migrations) == sorted(migrations), "installation migrations are not in source order")
    _need(type(history) is list and 0 < len(history) <= 20000, "installation migration history exceeds budget")
    applied = set()
    for row in history:
        _need(type(row) is dict and set(row) == {"name", "sha256", "state"}
              and isinstance(row["name"], str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,199}", row["name"])
              and isinstance(row["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", row["sha256"])
              and row["state"] in ("applied", "rolled-back"), "installation migration history is unresolved")
        if row["state"] == "applied":
            _need(row["name"] in migrations and row["name"] not in applied
                  and row["sha256"] == migrations[row["name"]]["sha256"],
                  "installation applied migration is missing, modified or duplicated")
            applied.add(row["name"])
    _need(applied == set(migrations), "tool installation cannot have pending migrations")
    return {"inventorySha256": _hash(_json(inventory)), "historySha256": _hash(_json(history)),
            "migrationCount": len(migrations), "historyRows": len(history),
            "rolledBackRows": sum(row["state"] == "rolled-back" for row in history),
            "inputConsistencyObserved": True, "databaseMigrationParityProven": False,
            "requiresHostRecheck": True, "canExecute": False}



# D2-9b: exact Git objects for supplied inventory/history; no host collection.
def _installation_migration_source(source_sha, inventory, history, *, fetch=release.github_json):
    source_sha = release.require_sha(source_sha)
    consistency = _installation_migration_consistency(inventory, history)
    commit = fetch(PREFIX + "/git/commits/" + source_sha)
    _need(type(commit) is dict and commit.get("sha") == source_sha and type(commit.get("tree")) is dict,
          "migration source commit binding differs")
    tree_sha = release.require_sha(commit["tree"].get("sha", ""))
    tree = fetch(PREFIX + "/git/trees/" + tree_sha + "?recursive=1")
    _need(type(tree) is dict and tree.get("sha") == tree_sha and tree.get("truncated") is False
          and type(tree.get("tree")) is list and len(tree["tree"]) <= 100000,
          "complete migration source tree unavailable")
    prefix, rows, expected = "apps/api/prisma/migrations/", set(), {}
    for row in tree["tree"]:
        _need(type(row) is dict and isinstance(row.get("path"), str) and row["path"] not in rows,
              "ambiguous migration source path")
        path = row["path"]
        rows.add(path)
        if not path.startswith(prefix) or not path.endswith("/migration.sql"):
            continue
        name = path[len(prefix):-len("/migration.sql")]
        _need(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,199}", name)
              and row.get("type") == "blob" and row.get("mode") in ("100644", "100755")
              and type(row.get("size")) is int and 0 < row["size"] <= 2097152,
              "migration source object type or size differs")
        expected[name] = (release.require_sha(row.get("sha", "")), row["size"])
    _need(expected == {item["name"]: (item["gitBlobSha"], item["bytes"]) for item in inventory},
          "migration source set differs from supplied inventory")
    for item in inventory:
        blob = fetch(PREFIX + "/git/blobs/" + item["gitBlobSha"])
        _need(type(blob) is dict and blob.get("sha") == item["gitBlobSha"]
              and type(blob.get("size")) is int and blob["size"] == item["bytes"]
              and blob.get("encoding") == "base64" and isinstance(blob.get("content"), str)
              and len(blob["content"]) <= 2 * 2097152, "migration source blob fields differ")
        raw = base64.b64decode("".join(blob["content"].split()), validate=True)
        _need(len(raw) == item["bytes"] and _object(raw) == item["gitBlobSha"]
              and _hash(raw) == item["sha256"], "migration source blob bytes differ")
    return {**consistency, "sourceSha": source_sha, "treeSha": tree_sha,
            "gitMigrationObjectsMatched": True, "applicationReleaseAuthenticated": False}



INSTALL_INVENTORY_PROBE = "\nconst fs=require('fs'), crypto=require('crypto');\nconst root='/app/apps/api/prisma/migrations', result=[];\nlet total=0;\nfor(const entry of fs.readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){\n if(entry.name==='migration_lock.toml' && entry.isFile()) continue;\n if(!entry.isDirectory() || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(entry.name))\n  throw Error('invalid migration directory');\n const dir=root+'/'+entry.name, names=fs.readdirSync(dir);\n if(names.length!==1 || names[0]!=='migration.sql') throw Error('unexpected SQL members');\n const fd=fs.openSync(dir+'/migration.sql',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);\n let raw;\n try{\n  const s=fs.fstatSync(fd);\n  if(!s.isFile() || s.size<=0 || s.size>2097152) throw Error('invalid SQL file');\n  raw=fs.readFileSync(fd);\n }finally{fs.closeSync(fd);}\n total+=raw.length;\n if(total>67108864 || result.length>=10000) throw Error('SQL budget exceeded');\n result.push({name:entry.name,bytes:raw.length,\n  sha256:crypto.createHash('sha256').update(raw).digest('hex'),\n  gitBlobSha:crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\\0')).update(raw).digest('hex')});\n}\nprocess.stdout.write(JSON.stringify(result));\n"


def _installation_inventory_args(identifier):
    _need(isinstance(identifier, str) and re.fullmatch(r"[a-f0-9]{64}", identifier),
          "invalid saved API container identity")
    return [*DOCKER, "exec", identifier, "/usr/bin/env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin",
            "/usr/local/bin/node", "--eval", INSTALL_INVENTORY_PROBE]


def _installation_migration_snapshot(source_sha, docker, prerequisites, run, *, fetch=release.github_json):
    """Read current saved objects twice. Caller still owns original host locks."""
    source_sha = release.require_sha(source_sha)
    api_id, db_id = (docker["containers"][role]["containerId"] for role in ("api", "db"))
    def observe():
        proof = release.verify_exact_candidate(source_sha, source_sha, fetch)
        _need(proof["sourceSha"] == source_sha and proof["images"] == docker["currentImageSeal"]["images"],
              "current migration publication differs from saved image pair")
        inventory = _docker_json(_installation_inventory_args(api_id), run)
        database = _docker_json(_installation_history_args(db_id), run)
        _need(type(database) is dict and set(database) == set(prerequisites["databaseIdentity"]) | {"history"}
              and _json({key: value for key, value in database.items() if key != "history"}) == _json(prerequisites["databaseIdentity"])
              and prerequisites["databaseContainerId"] == db_id
              and _hash(_json(database["history"])) == prerequisites["migrationHistorySha256"],
              "database history changed before migration binding")
        result = _installation_migration_source(source_sha, inventory, database["history"], fetch=fetch)
        return {**result, "databaseMigrationParityProven": True, "applicationReleaseAuthenticated": True,
                "apiContainerId": api_id, "databaseContainerId": db_id, "currentPublication": proof}
    before = observe()
    _need(observe() == before, "current migration inventory, history or source changed during observation")
    return before


def _observe_installed_migrations(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True)



# Preflight A: effective published ports, healthcheck and container retention.
INSTALL_PORTS = {"api": (4000, 5555), "ubereats-worker": (4001,), "web": (3000,), "db": (5432,)}


def _health_duration(value):
    _need(isinstance(value, str), "health duration must be an explicit string")
    match = re.fullmatch(r"([0-9]+)(ns|us|ms|s|m|h)", value)
    _need(match is not None, "unsupported health duration")
    return int(match[1]) * {"ns": 1, "us": 1000, "ms": 1000000, "s": 1000000000,
                           "m": 60000000000, "h": 3600000000000}[match[2]]


def _effective_configuration_snapshot(docker, run):
    expanded = _docker_json((*COMPOSE, "config", "--format", "json"), run)
    _need(_hash(_json(expanded)) == docker["renderedComposeSha256"], "Compose changed before effective configuration")
    result = {}
    for role, saved in docker["containers"].items():
        info = _docker_json((*DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", saved["containerId"]), run)
        _need(type(info) is dict and info.get("Id") == saved["containerId"] and info.get("Image") == saved["imageId"]
              and _hash(_json(info.get("Config"))) == saved["configurationSha256"],
              "saved container changed before effective configuration")
        service, host = expanded["services"][role], info.get("HostConfig")
        _need(type(host) is dict and host.get("AutoRemove") is False
              and host.get("PublishAllPorts") is False and host.get("Privileged") is False,
              "container retention or automatic publication differs")
        expected = {str(port) + "/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}] for port in INSTALL_PORTS[role]}
        ports = service.get("ports")
        _need(type(ports) is list and len(ports) == len(expected), "Compose published port count differs")
        observed = {}
        for port in ports:
            _need(type(port) is dict and type(port.get("target")) is int
                  and str(port.get("published")) == str(port["target"]) and port.get("host_ip") == "127.0.0.1"
                  and port.get("protocol", "tcp") == "tcp" and port.get("mode", "ingress") == "ingress",
                  "Compose published endpoint differs")
            key = str(port["target"]) + "/tcp"
            _need(key not in observed, "duplicate Compose published endpoint")
            observed[key] = [{"HostIp": port["host_ip"], "HostPort": str(port["published"])}]
        _need(observed == expected and host.get("PortBindings") == expected,
              "actual published bindings differ")
        settings = info.get("NetworkSettings")
        _need(type(settings) is dict and type(settings.get("Ports")) is dict
              and {key: value for key, value in settings["Ports"].items() if value is not None} == expected,
              "running published endpoints differ")
        image = _docker_json((*DOCKER, "image", "inspect", "--format", "{{json .}}", saved["imageId"]), run)
        _need(type(image) is dict and image.get("Id") == saved["imageId"] and type(image.get("Config")) is dict,
              "saved healthcheck image differs")
        desired = dict(image["Config"].get("Healthcheck") or {})
        health = service.get("healthcheck")
        _need(type(health) is dict and not health.get("disable", False)
              and set(health) <= {"test", "interval", "timeout", "retries", "start_period", "start_interval"},
              "Compose healthcheck fields differ")
        for key, value in health.items():
            field = {"test": "Test", "interval": "Interval", "timeout": "Timeout", "retries": "Retries",
                     "start_period": "StartPeriod", "start_interval": "StartInterval"}[key]
            if key == "test":
                _need(type(value) is list and len(value) >= 2 and value[0] in ("CMD", "CMD-SHELL")
                      and all(isinstance(part, str) for part in value), "healthcheck command differs")
                value = [_compose_environment({"VALUE": part})["VALUE"] for part in value]
            elif key == "retries":
                _need(type(value) is int and value > 0, "healthcheck retries differ")
            else:
                value = _health_duration(value)
            desired[field] = value
        actual = info["Config"].get("Healthcheck")
        _need(type(actual) is dict and set(actual) <= {"Test", "Interval", "Timeout", "Retries", "StartPeriod", "StartInterval"}
              and type(actual.get("Test")) is list and len(actual["Test"]) >= 2
              and actual["Test"][0] in ("CMD", "CMD-SHELL")
              and all(type(actual.get(key, 0)) is int for key in ("Interval", "Timeout", "Retries", "StartPeriod", "StartInterval"))
              and {**{key: 0 for key in ("Interval", "Timeout", "Retries", "StartPeriod", "StartInterval")}, **actual}
              == {**{key: 0 for key in ("Interval", "Timeout", "Retries", "StartPeriod", "StartInterval")}, **desired},
              "effective healthcheck differs from Compose and image")
        result[role] = {"containerId": saved["containerId"], "portsSha256": _hash(_json(settings["Ports"])),
                        "healthcheckSha256": _hash(_json(actual)), "autoRemove": False, "publishAllPorts": False}
    return result


def _observe_installed_effective_configuration(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True)



EXTERNAL_BACKUP_FILES = (
    (("home", "ubuntu"), "backup-db.sh", "ops/backup/backup-db.sh", "ubuntu", 0o750),
    (("usr", "local", "sbin"), "sanq-backup-protected-nginx", "ops/backup/sanq-backup-protected-nginx", "root", 0o755),
    (("etc", "sudoers.d"), "sanq-backup", "ops/backup/sanq-backup.sudoers", "root", 0o440),
)


@contextlib.contextmanager
def _backup_external_directory(parent, name, account):
    _need(name in {"home", "ubuntu", "usr", "local", "sbin", "etc", "sudoers.d"},
          "unreviewed external backup directory")
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    def check(info):
        owner, group = ((account.pw_uid, account.pw_gid) if name == "ubuntu"
                        else (PRIVATE_OWNER_UID, PRIVATE_GROUP_GID))
        _need(stat.S_ISDIR(info.st_mode) and info.st_uid == owner and info.st_gid == group
              and not stat.S_IMODE(info.st_mode) & 0o7022, "external backup parent permissions differ")
    try:
        before = os.fstat(fd)
        check(before)
        path = os.stat(name, dir_fd=parent, follow_symlinks=False)
        check(path)
        _need(_directory_identity(before) == _directory_identity(path), "external backup parent changed during open")
        yield fd
        after, path = os.fstat(fd), os.stat(name, dir_fd=parent, follow_symlinks=False)
        check(after)
        check(path)
        _need(_directory_identity(before) == _directory_identity(after) == _directory_identity(path),
              "external backup parent changed during observation")
    finally:
        os.close(fd)


def _external_backup_snapshot(runtime):
    account = pwd.getpwnam("ubuntu")
    root = _host_storage_root()
    files, directories = {}, {}
    try:
        for parts, name, source, owner, mode in EXTERNAL_BACKUP_FILES:
            with contextlib.ExitStack() as stack:
                parent = root
                for index, part in enumerate(parts):
                    parent = stack.enter_context(_backup_external_directory(parent, part, account))
                    directories["/" + "/".join(parts[:index + 1])] = list(_directory_identity(os.fstat(parent)))
                fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                def check(info):
                    uid, gid = ((account.pw_uid, account.pw_gid) if owner == "ubuntu"
                                else (PRIVATE_OWNER_UID, PRIVATE_GROUP_GID))
                    _need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                          and info.st_uid == uid and info.st_gid == gid and stat.S_IMODE(info.st_mode) == mode
                          and 0 < info.st_size <= MAX_FILE, "external backup file metadata differs")
                try:
                    before = os.fstat(fd)
                    check(before)
                    chunks, size = [], 0
                    while size <= MAX_FILE:
                        raw = os.read(fd, min(65536, MAX_FILE + 1 - size))
                        if not raw:
                            break
                        chunks.append(raw)
                        size += len(raw)
                    after, path = os.fstat(fd), os.stat(name, dir_fd=parent, follow_symlinks=False)
                    check(after)
                    check(path)
                    _need(size == before.st_size and _installed_fingerprint(before) ==
                          _installed_fingerprint(after) == _installed_fingerprint(path),
                          "external backup file changed during read")
                    raw = b"".join(chunks)
                    _need(raw == runtime[source][0], "external backup executable differs from sealed Runtime source")
                    files["/" + "/".join((*parts, name))] = {
                        "source": source, "sha256": _hash(raw), "bytes": size,
                        "identity": list(_installed_fingerprint(before))}
                finally:
                    os.close(fd)
        return {"files": files, "directories": directories, "backupExecutionVerified": False,
                "restoreProven": False}
    finally:
        os.close(root)


def _observe_installed_external_backup(identity, *, fetch=release.github_json):
    return _observe_installed_runtime(identity, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True)



# Intent record primitives only. No namespace provisioning or installation CLI.
INSTALL_INTENT_KIND = "sanq-minimal-executor-install-intent"
MAX_INSTALL_RECORD = 16384


def _installation_record_value(raw, identity, *, marker=False):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_INSTALL_RECORD
          and isinstance(identity, str) and re.fullmatch(r"[a-f0-9]{64}", identity),
          "invalid installation record input")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid installation JSON constant"))
    except (json.JSONDecodeError, UnicodeError):
        raise release.ReleaseContractError("invalid installation record JSON") from None
    fields = ({"schemaVersion", "kind", "installationId", "intentSha256"} if marker else
              {"schemaVersion", "kind", "installationId", "retentionId", "targetSourceSha",
               "installedRuntimeSourceSha", "observationSha256", "createdAt", "canExecute"})
    _need(type(value) is dict and set(value) == fields and type(value["schemaVersion"]) is int
          and value["schemaVersion"] == 1 and value["kind"] == INSTALL_INTENT_KIND
          and value["installationId"] == identity, "installation record fields or identity differ")
    for key in (("intentSha256",) if marker else ("retentionId", "observationSha256")):
        _need(isinstance(value[key], str) and re.fullmatch(r"[a-f0-9]{64}", value[key]),
              "invalid installation record digest")
    if not marker:
        release.require_sha(value["targetSourceSha"])
        release.require_sha(value["installedRuntimeSourceSha"])
        stamp = value["createdAt"]
        _need(value["canExecute"] is False and isinstance(stamp, str)
              and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z", stamp),
              "installation intent is not an inert UTC audit record")
        dt.datetime.fromisoformat(stamp[:-1] + "+00:00")
    _need(_json(value) == raw, "installation record must use canonical original bytes")
    return value


def _installation_intent_bytes(*, installation_id, retention_id, target_source_sha,
                               installed_runtime_source_sha, observation_sha256, created_at):
    value = {"schemaVersion": 1, "kind": INSTALL_INTENT_KIND, "installationId": installation_id,
             "retentionId": retention_id, "targetSourceSha": target_source_sha,
             "installedRuntimeSourceSha": installed_runtime_source_sha,
             "observationSha256": observation_sha256, "createdAt": created_at, "canExecute": False}
    raw = _json(value)
    _installation_record_value(raw, installation_id)
    return raw


def _installation_marker_bytes(intent, installation_id):
    _installation_record_value(intent, installation_id)
    raw = _json({"schemaVersion": 1, "kind": INSTALL_INTENT_KIND,
                 "installationId": installation_id, "intentSha256": _hash(intent)})
    _installation_record_value(raw, installation_id, marker=True)
    return raw


def _installation_records_match(intent, marker, installation_id):
    _installation_record_value(intent, installation_id)
    value = _installation_record_value(marker, installation_id, marker=True)
    _need(value["intentSha256"] == _hash(intent), "installation marker does not bind original intent")


def _installation_record_read(root, name, installation_id):
    _need(name in ("intent.json", "active.json", "writers.json"), "unreviewed installation record name")
    _private_info(os.fstat(root), directory=True)
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        _need(0 < before.st_size <= MAX_INSTALL_RECORD, "installation record size differs")
        chunks, size = [], 0
        while size <= MAX_INSTALL_RECORD:
            block = os.read(fd, min(65536, MAX_INSTALL_RECORD + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
        after, path = os.fstat(fd), os.stat(name, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need(size == before.st_size and _installed_fingerprint(before) ==
              _installed_fingerprint(after) == _installed_fingerprint(path),
              "installation record changed during read")
        raw = b"".join(chunks)
        _installation_record_validate(name, raw, installation_id)
        return raw
    finally:
        os.close(fd)


def _installation_record_write(root, name, raw, installation_id):
    """Low-level create-only primitive; caller must own fixed namespace and original locks.

    Does not authorize installation or ensure a preceding intent exists for a marker.
    No public caller until the host orchestration is complete and reviewed.
    """
    _need(os.geteuid() == 0 and name in ("intent.json", "active.json", "writers.json"),
          "unprivileged or unreviewed installation record write")
    _private_info(os.fstat(root), directory=True)
    _installation_record_validate(name, raw, installation_id)
    fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        remaining = memoryview(raw)
        while remaining:
            count = os.write(fd, remaining)
            _need(count > 0, "short installation record write")
            remaining = remaining[count:]
        os.fsync(fd)
        after = os.fstat(fd)
        path = os.stat(name, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)
              and after.st_size == len(raw) and _installed_fingerprint(after) == _installed_fingerprint(path),
              "installation record identity changed during write")
        os.fsync(root)
        _need(_installation_record_read(root, name, installation_id) == raw,
              "installation record readback differs")
        final, path = os.fstat(fd), os.stat(name, dir_fd=root, follow_symlinks=False)
        _private_info(final)
        _private_info(path)
        _need(_installed_fingerprint(after) == _installed_fingerprint(final) == _installed_fingerprint(path),
              "installation record replaced after readback")
    finally:
        os.close(fd)  # Keep all partial files; never unlink, truncate, replay or clean markers.



# Fixed transaction namespace only. No intent/marker write orchestration yet.
INSTALLATION_RUNS = "installation-runs"


def _installation_runs_clear(root):
    _private_info(os.fstat(root), directory=True)
    with os.scandir(root) as entries:
        names = []
        for entry in entries:
            _need(len(names) < 1024, "installation transaction inventory exceeds budget")
            names.append(entry.name)
    _need(not names, "unresolved or unknown installation transaction requires review")


@contextlib.contextmanager
def _installation_namespace(parent, *, create=False, owned_identity=None, owned_records=None):
    _need(type(create) is bool and (owned_identity is None or create and isinstance(owned_identity, str)
          and re.fullmatch(r"[a-f0-9]{64}", owned_identity)), "invalid installation namespace switch")
    _need(owned_records is None or type(owned_records) is dict and not owned_records
          and owned_identity is not None, "installation namespace requires new owned record evidence")
    _private_info(os.fstat(parent), directory=True)
    created = False
    if create:
        disk = os.fstatvfs(parent)
        _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + MAX_INSTALL_RECORD,
              "insufficient installation transaction reserve")
        try:
            os.mkdir(INSTALLATION_RUNS, mode=0o700, dir_fd=parent)
            created = True
        except FileExistsError:
            pass
    try:
        fd = os.open(INSTALLATION_RUNS, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    except FileNotFoundError:
        _need(not create, "created installation namespace disappeared")
        yield None, False
        # A namespace appearing during an absent observation is unresolved.
        try:
            os.stat(INSTALLATION_RUNS, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            return
        _need(False, "installation namespace appeared during observation")
    else:
        try:
            before = os.fstat(fd)
            path = os.stat(INSTALLATION_RUNS, dir_fd=parent, follow_symlinks=False)
            _private_info(before, directory=True)
            _private_info(path, directory=True)
            _need(_directory_identity(before) == _directory_identity(path),
                  "installation namespace changed during open")
            _installation_runs_clear(fd)
            if create:
                os.fsync(fd)
                os.fsync(parent)
            yield fd, created
            if owned_identity is None:
                _installation_runs_clear(fd)
            else:
                _need(owned_records is None or set(owned_records) <= {"writers.json", "recovery"},
                      "unreviewed owned installation records")
                recovery = (owned_records or {}).get("recovery")
                _need(recovery is None or set(recovery[0]) == RECOVERY_FILES, "incomplete owned recovery pair")
                _installation_owned_run(fd, owned_identity, saved_writers=(owned_records or {}).get("writers.json"),
                                        recovery=recovery)
            after = os.fstat(fd)
            path = os.stat(INSTALLATION_RUNS, dir_fd=parent, follow_symlinks=False)
            _private_info(after, directory=True)
            _private_info(path, directory=True)
            _private_info(os.fstat(parent), directory=True)
            _need(_directory_identity(before) == _directory_identity(after) == _directory_identity(path),
                  "installation namespace replaced during observation")
        finally:
            os.close(fd)  # Preserve empty/partial namespace on every failure.


def _inspect_installation_runs(*, create=False):
    """Internal namespace preparation/query under original locks, not installation approval."""
    _need(type(create) is bool, "invalid installation namespace switch")
    with _private_session() as folders:
        _idle_for_materials(folders)
        anchor = _state_parent()
        try:
            with _private_directory(anchor, "deploy-state") as state:
                def check_state():
                    for name, saved in folders.items():
                        actual = os.stat(name, dir_fd=state, follow_symlinks=False)
                        _private_info(actual, directory=True)
                        _need(_directory_identity(actual) == _directory_identity(os.fstat(saved)),
                              "installation namespace no longer shares the original lock directories")
                check_state()
                with _installation_namespace(state, create=create) as (root, created):
                    _idle_for_materials(folders)
                    result = {"outcome": "INSTALLATION_NAMESPACE_OBSERVED", "namespacePresent": root is not None,
                              "namespaceCreated": created, "noInstallationTransactionsObserved": True,
                              "canExecute": False, "readyToInstall": False, "operationSuccessProven": False,
                              "requiresHostRecheck": True}
                    _idle_for_materials(folders)
                check_state()
                return result
        finally:
            os.close(anchor)



def _installation_owned_run(namespace, identity, *, saved_writers=None, recovery=None):
    _need(saved_writers is None or type(saved_writers) is bytes, "invalid owned writer record proof")
    _need(set(os.listdir(namespace)) == {identity}, "installation transaction inventory changed")
    with _private_directory(namespace, identity) as root:
        expected = {"intent.json"} | ({"writers.json"} if saved_writers is not None else set())
        _need(recovery is None or saved_writers is not None and type(recovery) is tuple and len(recovery) == 2,
              "invalid owned recovery proof")
        if recovery is not None:
            expected.add("recovery")
        _need(set(os.listdir(root)) == expected, "unexpected installation transaction members")
        intent = _installation_record_read(root, "intent.json", identity)
        if saved_writers is not None:
            actual = _installation_record_read(root, "writers.json", identity)
            _need(actual == saved_writers, "owned saved writer bytes changed")
            _installation_writers_match(intent, actual, identity)
        if recovery is not None:
            files, directory_identity = recovery
            _need(type(files) is dict and set(files) <= RECOVERY_FILES
                  and ("recovery.json" not in files or "recovery.tar" in files), "invalid owned recovery members")
            with _installation_recovery_directory(root) as directory:
                _need(_directory_identity(os.fstat(directory)) == directory_identity, "owned recovery directory replaced")
                _need(set(os.listdir(directory)) == set(files), "owned recovery inventory changed")
                for name, raw in files.items():
                    _need(_installation_recovery_read(directory, name) == raw, "owned recovery bytes changed")
                if "recovery.json" in files:
                    _installation_recovery_receipt_value(files["recovery.json"], files["recovery.tar"],
                                                         intent, saved_writers, identity)
        return intent


def _write_installation_intent_locked(folders, retention_id, observation, *, recheck, load_gates=None, save_writers=None, freeze_writers=None, retain_recovery=None, recovery_namespace=None):
    """Private observer continuation only; no CLI or externally imported approval."""
    _need(os.geteuid() == 0, "installation intent requires root")
    _need((retain_recovery is None) == (recovery_namespace is None),
          "recovery continuation requires original private namespace facts")
    if recovery_namespace is not None:
        _need(_recovery_namespace_snapshot(folders) == recovery_namespace,
              "recovery private namespace changed before intent")
    identity = os.urandom(32).hex()
    gate_result = saved_result = frozen_result = recovery_result = None
    owned_records = {}
    anchor = _state_parent()
    try:
        with _private_directory(anchor, "deploy-state") as state:
            owned_namespace = None
            def state_matches():
                for name, saved in folders.items():
                    actual = os.stat(name, dir_fd=state, follow_symlinks=False)
                    _private_info(actual, directory=True)
                    _need(_directory_identity(actual) == _directory_identity(os.fstat(saved)),
                          "installation intent lost original lock directories")
                if recovery_namespace is not None:
                    _recovery_namespace_owned(state, folders, owned_namespace, recovery_namespace)
            state_matches()
            with _installation_namespace(state, create=True, owned_identity=identity, owned_records=owned_records) as (namespace, created):
                owned_namespace = namespace
                if recovery_namespace is not None:
                    _need(created == (recovery_namespace["installationNamespace"] is None),
                          "installation namespace creation differs from captured absence")
                    state_matches()
                with _private_directory(namespace, identity, create=True, exclusive=True) as root:
                    initial = _directory_identity(os.fstat(root))
                    recheck()
                    _need(set(os.listdir(namespace)) == {identity} and not os.listdir(root),
                          "installation intent directory is not new and empty")
                    raw = _installation_intent_bytes(
                        installation_id=identity, retention_id=retention_id,
                        target_source_sha=observation["sourceSha"],
                        installed_runtime_source_sha=observation["currentArchiveSourceSha"],
                        observation_sha256=_hash(_json(observation)),
                        created_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"))
                    _installation_record_write(root, "intent.json", raw, identity)
                    recheck()
                    _need(set(os.listdir(root)) == {"intent.json"} and not os.listdir(folders["maintenance"]),
                          "installation intent or maintenance changed before marker")
                    _need(_installation_owned_run(namespace, identity) == raw, "installation intent changed before marker")
                    state_matches()
                    marker = _installation_marker_bytes(raw, identity)
                    _installation_record_write(folders["maintenance"], "active.json", marker, identity)
                    _need(set(os.listdir(folders["maintenance"])) == {"active.json"},
                          "unexpected maintenance evidence after intent marker")
                    actual = _installation_record_read(root, "intent.json", identity)
                    active = _installation_record_read(folders["maintenance"], "active.json", identity)
                    _installation_records_match(actual, active, identity)
                    _need(actual == raw and active == marker and initial == _directory_identity(os.fstat(root))
                          == _directory_identity(os.stat(identity, dir_fd=namespace, follow_symlinks=False)),
                          "installation intent path changed during recording")
                    def check_owned():
                        state_matches()
                        current_state = os.stat("deploy-state", dir_fd=anchor, follow_symlinks=False)
                        _private_info(current_state, directory=True)
                        _need(_directory_identity(current_state) == _directory_identity(os.fstat(state)),
                              "owned installation state directory replaced")
                        _material_jobs_idle(folders)
                        _need(_installation_owned_run(namespace, identity, saved_writers=owned_records.get("writers.json"),
                                                       recovery=owned_records.get("recovery")) == raw
                              and set(os.listdir(folders["maintenance"])) == {"active.json"}
                              and _installation_record_read(folders["maintenance"], "active.json", identity) == marker
                              and _directory_identity(os.fstat(root)) == initial
                              == _directory_identity(os.stat(identity, dir_fd=namespace, follow_symlinks=False)),
                              "owned installation intent or marker changed")
                        current_namespace = os.stat(INSTALLATION_RUNS, dir_fd=state, follow_symlinks=False)
                        _private_info(current_namespace, directory=True)
                        _need(_directory_identity(current_namespace) == _directory_identity(os.fstat(namespace)),
                              "owned installation namespace replaced")
                    if load_gates is not None:
                        check_owned()
                        gate_result = load_gates(check_owned)
                        check_owned()
                    if save_writers is not None:
                        _need(gate_result is not None, "writer recording requires loaded gates")
                        def persist_writers():
                            check_owned()
                            _need(not owned_records, "writer record already owned")
                            saved = _installation_writers_bytes(
                                raw, identity, observation["applicationSha"], observation["docker"],
                                created_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"))
                            _installation_record_write(root, "writers.json", saved, identity)
                            owned_records["writers.json"] = saved
                            check_owned()
                            return {"sha256": _hash(saved), "canExecute": False, "writersFrozen": False}
                        saved_result = save_writers(persist_writers, check_owned, gate_result)
                        check_owned()
                    if freeze_writers is not None:
                        _need(saved_result is not None and gate_result is not None, "writer freeze requires saved originals")
                        check_owned()
                        frozen_result = freeze_writers(check_owned, raw, owned_records["writers.json"], identity, gate_result)
                        check_owned()
                    if retain_recovery is not None:
                        _need(frozen_result is not None and frozen_result["writersFrozen"] is True,
                              "recovery persistence requires confirmed frozen writers")
                        def persist_recovery(payload, receipt):
                            check_owned()
                            _installation_recovery_receipt_value(receipt, payload, raw, owned_records["writers.json"], identity)
                            with _installation_recovery_directory(root, create=True) as directory:
                                records = {}
                                owned_records["recovery"] = (records, _directory_identity(os.fstat(directory)))
                                check_owned()
                                for name, content in (("recovery.tar", payload), ("recovery.json", receipt)):
                                    _installation_recovery_write(directory, name, content)
                                    records[name] = content
                                    check_owned()
                            return {"archiveSha256": _hash(payload), "archiveBytes": len(payload),
                                    "receiptSha256": _hash(receipt), "recoveryArchiveDurable": True,
                                    "recoveryReady": False, "snapshotAvailable": False, "canExecute": False}
                        recovery_result = retain_recovery(persist_recovery, check_owned, raw,
                                                          owned_records["writers.json"], identity)
                        check_owned()
                state_matches()
            _need(_installation_record_read(folders["maintenance"], "active.json", identity) == marker,
                  "installation marker changed after namespace validation")
            return {"installationId": identity, "intentSha256": _hash(raw), "markerSha256": _hash(marker),
                    "canExecute": False, "startupFenceConfirmed": gate_result is not None, "writersFrozen": frozen_result is not None,
                    "requiresHostRecheck": True, **({"temporaryGates": gate_result} if gate_result is not None else {}),
                    **({"savedWriters": saved_result} if saved_result is not None else {}),
                    **({"frozenWriters": frozen_result} if frozen_result is not None else {}),
                    **({"recoveryFiles": recovery_result} if recovery_result is not None else {})}
    finally:
        os.close(anchor)  # Never clean intent/marker/gates or retry an unknown result.


def _record_installation_intent(retention_id, *, fetch=release.github_json):
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True, _record_intent=True)



# Temporary deny gate file primitives and loaded-property verification only.
INSTALL_DENY_DROPINS = {
    "docker.service": b"[Service]\nExecStartPre=/usr/bin/false\n",
    "docker.socket": b"[Unit]\nConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json\n",
    "sanq-backup.service": b"[Service]\nExecStartPre=+/usr/bin/false\n",
}
INSTALL_GATE_NAME = "80-sanq-maintenance.conf"


@contextlib.contextmanager
def _temporary_gate_directory(parent, unit, *, create=False):
    _need(unit in INSTALL_DENY_DROPINS and type(create) is bool, "unreviewed temporary gate unit")
    name = unit + ".d"
    created = False
    if create:
        try:
            os.mkdir(name, mode=0o755, dir_fd=parent)
            created = True
        except FileExistsError:
            pass
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    def check(info):
        _installed_info(info, directory=True)
        _need(stat.S_IMODE(info.st_mode) == 0o755, "temporary gate directory must be 0755")
    try:
        if created:
            _installed_info(os.fstat(fd), directory=True)
            os.fchmod(fd, 0o755)
        before, path = os.fstat(fd), os.stat(name, dir_fd=parent, follow_symlinks=False)
        check(before)
        check(path)
        _need(_directory_identity(before) == _directory_identity(path), "temporary gate directory changed during open")
        if create:
            _need(not os.listdir(fd), "existing gate directory is not empty")
            os.fsync(fd)
            os.fsync(parent)
        yield fd
        after, path = os.fstat(fd), os.stat(name, dir_fd=parent, follow_symlinks=False)
        check(after)
        check(path)
        _need(_directory_identity(before) == _directory_identity(after) == _directory_identity(path),
              "temporary gate directory changed")
    finally:
        os.close(fd)


def _temporary_gate_read(root, unit):
    _need(unit in INSTALL_DENY_DROPINS and set(os.listdir(root)) == {INSTALL_GATE_NAME},
          "temporary gate directory inventory differs")
    fd = os.open(INSTALL_GATE_NAME, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _installed_info(before)
        _need(stat.S_IMODE(before.st_mode) == 0o644 and 0 < before.st_size <= 4096,
              "temporary gate metadata differs")
        raw = os.read(fd, 4097)
        after, path = os.fstat(fd), os.stat(INSTALL_GATE_NAME, dir_fd=root, follow_symlinks=False)
        _installed_info(after)
        _installed_info(path)
        _need(raw == INSTALL_DENY_DROPINS[unit] and len(raw) == before.st_size
              and _installed_fingerprint(before) == _installed_fingerprint(after) == _installed_fingerprint(path),
              "temporary gate bytes or identity differ")
        return {"sha256": _hash(raw), "identity": list(_installed_fingerprint(before))}
    finally:
        os.close(fd)


def _temporary_gate_files():
    root = _systemd_root()
    try:
        result = {}
        for unit in INSTALL_DENY_DROPINS:
            with _temporary_gate_directory(root, unit) as directory:
                result[unit] = _temporary_gate_read(directory, unit)
        return result
    finally:
        os.close(root)


def _write_temporary_gate_files():
    """Low-level root primitive; the owned observer verifies intent/marker/locks.

    No CLI. Only the fresh observer continuation calls this; no reload here.
    """
    _need(os.geteuid() == 0, "temporary gate file creation requires root")
    root = _systemd_root()
    try:
        for unit, raw in INSTALL_DENY_DROPINS.items():
            with _temporary_gate_directory(root, unit, create=True) as directory:
                fd = os.open(INSTALL_GATE_NAME, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o644, dir_fd=directory)
                try:
                    _installed_info(os.fstat(fd))
                    os.fchmod(fd, 0o644)
                    _need(stat.S_IMODE(os.fstat(fd).st_mode) == 0o644, "temporary gate file mode differs")
                    remaining = memoryview(raw)
                    while remaining:
                        count = os.write(fd, remaining)
                        _need(count > 0, "short temporary gate write")
                        remaining = remaining[count:]
                    os.fsync(fd)
                    os.fsync(directory)
                    _temporary_gate_read(directory, unit)
                    _need(_installed_fingerprint(os.fstat(fd)) == _installed_fingerprint(
                          os.stat(INSTALL_GATE_NAME, dir_fd=directory, follow_symlinks=False)),
                          "temporary gate replaced during readback")
                finally:
                    os.close(fd)
        return {"files": _temporary_gate_files(), "startupFenceConfirmed": False, "canExecute": False}
    finally:
        os.close(root)  # Preserve every partial file/directory; never roll back on failure.


def _verify_temporary_gates(run):
    before = _temporary_gate_files()
    units = {}
    for unit in INSTALL_DENY_DROPINS:
        keys = _systemd_keys(unit)
        raw = run(_systemd_args(unit))
        _need(isinstance(raw, str) and len(raw.encode("utf-8")) <= 65536, "temporary gate properties exceed budget")
        fields = {}
        for line in raw.splitlines():
            key, separator, value = line.partition("=")
            _need(separator == "=" and key in keys and key not in fields, "invalid temporary gate properties")
            fields[key] = value
        path = "/etc/systemd/system/" + unit + ".d/" + INSTALL_GATE_NAME
        _need(set(fields) == set(keys) and fields["LoadState"] == "loaded"
              and fields["NeedDaemonReload"] == "no" and fields["DropInPaths"].split() == [path],
              "temporary deny gate is not accurately loaded")
        fragments = ("/etc/systemd/system/" + unit,) if unit.startswith("sanq-") else (
            "/lib/systemd/system/" + unit, "/usr/lib/systemd/system/" + unit)
        _need(fields["FragmentPath"] in fragments, "temporary gate unit source differs")
        if unit == "docker.socket":
            _need(fields["Triggers"].split() == ["docker.service"], "temporary socket target differs")
        else:
            command = fields["ExecStartPre"]
            _need("path=/usr/bin/false ; argv[]=/usr/bin/false ; ignore_errors=no" in command
                  and command.count("path=") == command.count("argv[]=") == 1,
                  "temporary service denial is missing, additional or ignores failure")
        units[unit] = _hash(_json(fields))
    _need(_temporary_gate_files() == before, "temporary gate files changed around manager observation")
    return {"files": before, "effectivePropertiesSha256": units,
            "denyGatePropertiesObserved": True, "startupFenceConfirmed": False, "canExecute": False}



def _temporary_gate_systemd_parity(baseline, run, files):
    """Compare original manager/disk facts, allowing only this write's deny gates."""
    _need(_verify_temporary_gates(run)["files"] == files, "temporary loaded gates changed")
    def normalized(args):
        raw = run(args)
        _need(isinstance(raw, str) and len(raw.encode("utf-8")) <= 65536, "manager parity output exceeds budget")
        unit = args[3]
        lines = []
        for line in raw.splitlines():
            key, sep, value = line.partition("=")
            if unit in INSTALL_DENY_DROPINS and key == "DropInPaths":
                expected = "/etc/systemd/system/" + unit + ".d/" + INSTALL_GATE_NAME
                _need(sep == "=" and value.split() == [expected], "loaded deny path changed")
                line = "DropInPaths="
            elif unit in ("docker.service", "sanq-backup.service") and key == "ExecStartPre":
                _need("path=/usr/bin/false ; argv[]=/usr/bin/false ; ignore_errors=no" in value
                      and value.count("path=") == value.count("argv[]=") == 1, "loaded denial changed")
                line = "ExecStartPre="
            lines.append(line)
        return "\n".join(lines)
    units = _systemd_loaded_units(normalized)
    projection = {unit: {**{key: fields[key] for key in SYSTEMD_KEYS},
                         "effectivePropertiesSha256": _hash(_json(fields))}
                  for unit, fields in units.items()}
    _need(projection == baseline["units"], "manager changed beyond the owned temporary gates")
    root = _systemd_root()
    def stable(info):
        return [info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode]
    def from_fingerprint(info):
        return [info[index] for index in (0, 1, 5, 6, 7)]
    try:
        initial = os.fstat(root)
        _installed_info(initial, directory=True)
        _need(stable(initial) == from_fingerprint(baseline["systemdDirectoryIdentity"]),
              "systemd root identity changed")
        for name, saved in baseline["installedBackupUnits"].items():
            raw, info = _root_observation_read(root, name, 65536)
            _need({"sha256": _hash(raw), "bytes": len(raw), "identity": list(info)} == saved,
                  "original backup unit changed during gate loading")
        for name in ("docker.service", "docker.socket"):
            try:
                os.stat(name, dir_fd=root, follow_symlinks=False)
            except FileNotFoundError:
                continue
            _need(False, "local Docker unit override appeared")
        for name, saved in baseline["overrideDirectories"].items():
            unit = name[:-2]
            if unit in INSTALL_DENY_DROPINS:
                with _temporary_gate_directory(root, unit) as directory:
                    _need(_temporary_gate_read(directory, unit) == files[unit], "temporary gate identity changed")
                    if saved is not None:
                        _need(stable(os.fstat(directory)) == from_fingerprint(saved),
                              "original empty gate directory replaced")
                continue
            try:
                fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
            except FileNotFoundError:
                _need(saved is None, "original override directory disappeared")
                continue
            try:
                info = os.fstat(fd)
                _installed_info(info, directory=True)
                path = os.stat(name, dir_fd=root, follow_symlinks=False)
                _installed_info(path, directory=True)
                _need(saved is not None and not os.listdir(fd) and list(_installed_fingerprint(info))
                      == saved == list(_installed_fingerprint(os.fstat(fd))) == list(_installed_fingerprint(path)),
                      "unowned override directory changed")
            finally:
                os.close(fd)
        _need(_installed_fingerprint(initial) == _installed_fingerprint(os.fstat(root)),
              "systemd root changed during gate parity read")
    finally:
        os.close(root)
    _need(_temporary_gate_files() == files, "temporary files changed after manager parity")
    return baseline  # Comparison projection only; actual gate proof remains separate.


def _load_installation_deny_gates(retention_id, *, fetch=release.github_json):
    """New owned installation only; no resume, no public CLI and no writer stop."""
    return _observe_installed_runtime(retention_id, fetch=fetch,
        include_configuration=True, include_docker=True, include_systemd=True,
        include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True)



# These facts preserve original objects/policies, not application version authority.
INSTALL_WRITERS_KIND = "sanq-minimal-executor-saved-writers"
INSTALL_WRITER_ROLES = ("api", "ubereats-worker", "web")


def _installation_writers_value(raw, identity):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_INSTALL_RECORD
          and isinstance(identity, str) and re.fullmatch(r"[a-f0-9]{64}", identity),
          "invalid saved writer record input")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid saved writer JSON constant"))
    except (json.JSONDecodeError, UnicodeError):
        raise release.ReleaseContractError("invalid saved writer JSON") from None
    _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "installationId",
          "intentSha256", "applicationSha", "dockerEngineSha256", "containers", "createdAt", "canExecute"}
          and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == INSTALL_WRITERS_KIND and value["installationId"] == identity
          and value["canExecute"] is False, "saved writer fields or identity differ")
    release.require_sha(value["applicationSha"])
    for key in ("intentSha256", "dockerEngineSha256"):
        _need(isinstance(value[key], str) and re.fullmatch(r"[a-f0-9]{64}", value[key]),
              "invalid saved writer digest")
    stamp = value["createdAt"]
    _need(isinstance(stamp, str) and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z", stamp),
        "saved writer record requires UTC time")
    try:
        dt.datetime.fromisoformat(stamp[:-1] + "+00:00")
    except ValueError:
        raise release.ReleaseContractError("invalid saved writer UTC time") from None
    rows = value["containers"]
    _need(type(rows) is dict and set(rows) == {*INSTALL_WRITER_ROLES, "db"}, "saved container roles differ")
    identifiers = set()
    for row in rows.values():
        _need(type(row) is dict and set(row) == {"containerId", "imageId", "restartPolicy",
              "restartCount", "startedAt", "configurationSha256", "mountSha256"},
              "saved container fields differ")
        for key in ("containerId", "configurationSha256", "mountSha256"):
            _need(isinstance(row[key], str) and re.fullmatch(r"[a-f0-9]{64}", row[key]),
                  "invalid saved container identity or digest")
        _need(row["containerId"] not in identifiers, "saved containers share an identity")
        identifiers.add(row["containerId"])
        release.checked_digest(row["imageId"])
        policy = row["restartPolicy"]
        _need(type(policy) is dict and set(policy) == {"Name", "MaximumRetryCount"}
              and policy["Name"] in ("no", "always", "unless-stopped", "on-failure")
              and type(policy["MaximumRetryCount"]) is int and policy["MaximumRetryCount"] >= 0
              and (policy["Name"] == "on-failure" or policy["MaximumRetryCount"] == 0),
              "invalid saved restart policy")
        _need(type(row["restartCount"]) is int and row["restartCount"] >= 0
              and isinstance(row["startedAt"], str) and re.fullmatch(
                  r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z", row["startedAt"]),
              "invalid saved container lifetime")
        try:
            dt.datetime.fromisoformat(row["startedAt"][:-1] + "+00:00")
        except ValueError:
            raise release.ReleaseContractError("invalid saved container lifetime") from None
    _need(rows["api"]["imageId"] == rows["ubereats-worker"]["imageId"], "saved API/worker image pair differs")
    _need(_json(value) == raw, "saved writer record requires canonical original bytes")
    return value


def _installation_record_validate(name, raw, identity):
    _need(name in ("intent.json", "active.json", "writers.json"), "unreviewed installation record")
    return (_installation_writers_value(raw, identity) if name == "writers.json" else
            _installation_record_value(raw, identity, marker=name == "active.json"))


def _installation_writers_match(intent, raw, identity):
    _installation_record_value(intent, identity)
    value = _installation_writers_value(raw, identity)
    _need(value["intentSha256"] == _hash(intent), "saved writers are bound to a different intent")
    return value


def _installation_writers_bytes(intent, identity, application_sha, docker, *, created_at):
    value = {"schemaVersion": 1, "kind": INSTALL_WRITERS_KIND, "installationId": identity,
             "intentSha256": _hash(intent), "applicationSha": application_sha,
             "dockerEngineSha256": _hash(_json(docker["dockerEngine"])),
             "containers": docker["containers"], "createdAt": created_at, "canExecute": False}
    raw = _json(value)
    _installation_writers_match(intent, raw, identity)
    return raw


def _saved_writer_args(intent, raw, identity, role, action):
    """Pure argv construction, never execution permission or a resumable ticket."""
    value = _installation_writers_match(intent, raw, identity)
    _need(role in INSTALL_WRITER_ROLES and action in ("disable-restart", "stop"),
          "unreviewed saved writer action")
    identifier = value["containers"][role]["containerId"]
    return ([*DOCKER, "update", "--restart=no", identifier] if action == "disable-restart" else
            [*DOCKER, "stop", "--time", "30", identifier])


def _save_installation_writers(retention_id, *, fetch=release.github_json):
    """New owned installation only: save original facts, never stop or update."""
    return _observe_installed_runtime(retention_id, fetch=fetch,
        include_configuration=True, include_docker=True, include_systemd=True,
        include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True)



def _installation_writer_command(intent, writers, identity, role, action, *, deadline):
    """Fixed saved-ID mutation client. Its caller must hold and recheck the owned flow."""
    args = _saved_writer_args(intent, writers, identity, role, action)
    output = _bounded_host_client(args, deadline=deadline, _writer=(intent, writers, identity, role, action))
    _need(output in (args[-1], args[-1] + "\n"), "unexpected installation writer command output")


def _installation_writer_observation(value, docker, run, disabled, stopped):
    _need(set(stopped) <= set(disabled) <= set(INSTALL_WRITER_ROLES), "invalid writer observation stage")
    identifiers = run(list(PROJECT_PS)).splitlines()
    _need(len(identifiers) == 4 and set(identifiers) == {
        row["containerId"] for row in value["containers"].values()}, "saved project container inventory changed")
    engine = _docker_json((*DOCKER, "info", "--format", "{{json .}}"), run)
    _need(type(engine) is dict and engine.get("LiveRestoreEnabled") is False
          and type(engine.get("Swarm")) is dict and engine["Swarm"].get("LocalNodeState") == "inactive"
          and {key: engine.get(key) for key in docker["dockerEngine"]} == docker["dockerEngine"]
          and _hash(_json(docker["dockerEngine"])) == value["dockerEngineSha256"],
          "saved Docker engine or cold-start fence changed")
    volume = _docker_json((*DOCKER, "volume", "inspect", "--format", "{{json .}}", "sanq-app_pgdata"), run)
    _need(_hash(_json(volume)) == docker["databaseVolumeSha256"], "saved database volume changed")
    for role, saved in value["containers"].items():
        info = _docker_json((*DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", saved["containerId"]), run)
        _need(type(info) is dict and info.get("Id") == saved["containerId"] and info.get("Image") == saved["imageId"]
              and _hash(_json(info.get("Config"))) == saved["configurationSha256"]
              and _hash(_json(info.get("Mounts"))) == saved["mountSha256"]
              and type(info.get("RestartCount")) is int and info["RestartCount"] == saved["restartCount"],
              "saved container identity, image, configuration, mounts or lifetime changed")
        host, state = info.get("HostConfig"), info.get("State")
        policy = {"Name": "no", "MaximumRetryCount": 0} if role in disabled else saved["restartPolicy"]
        ports = {str(port) + "/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}] for port in INSTALL_PORTS[role]}
        _need(type(host) is dict and type(host.get("RestartPolicy")) is dict
              and _json(host["RestartPolicy"]) == _json(policy) and host.get("Privileged") is False
              and host.get("AutoRemove") is False and host.get("PublishAllPorts") is False
              and host.get("PortBindings") == ports, "saved container host settings or restart policy changed")
        _need(type(state) is dict and state.get("StartedAt") == saved["startedAt"]
              and state.get("Paused") is False and state.get("Restarting") is False and state.get("Dead") is False,
              "saved container state changed")
        if role in stopped:
            _need(state.get("Running") is False and state.get("Status") == "exited",
                  "saved writer is not confirmed stopped")
        else:
            _need(state.get("Running") is True and state.get("Status") == "running"
                  and type(state.get("Health")) is dict and state["Health"].get("Status") == "healthy",
                  "saved running container is not steadily healthy")


def _freeze_saved_installation_writers(intent, writers, identity, files, docker, *,
                                        run, check_owned, verify_context, mutate, systemd_run):
    """One in-memory owned continuation. A saved file alone never calls this stage."""
    value = _installation_writers_match(intent, writers, identity)
    _need(value["containers"] == docker["containers"], "saved original container baseline differs")
    disabled, stopped = set(), set()
    def observe():
        check_owned()
        _need(_verify_temporary_gates(systemd_run)["files"] == files, "temporary gates changed during writer freeze")
        _installation_writer_observation(value, docker, run, disabled, stopped)
        check_owned()
    observe()
    verify_context()
    started = False
    try:
        for role in INSTALL_WRITER_ROLES:
            observe()
            started = True
            mutate(role, "disable-restart")
            disabled.add(role)
            observe()
        for role in reversed(INSTALL_WRITER_ROLES):
            observe()
            mutate(role, "stop")
            stopped.add(role)
            observe()
        verify_context()
        observe()
    except BaseException:
        if not started:
            raise
        # Containment only: keep the original ID set even if records or inventory drift.
        # Use the caller's remaining bounded budget; never start, restore policy or replay the installer.
        for action, roles in (("disable-restart", INSTALL_WRITER_ROLES),
                              ("stop", tuple(reversed(INSTALL_WRITER_ROLES)))):
            for role in roles:
                try:
                    mutate(role, action)
                except BaseException:
                    pass
        raise release.ReleaseContractError("FENCE_UNCONFIRMED: review retained installation and original writer evidence") from None
    return {"writersFrozen": True, "savedWritersSha256": _hash(writers),
            "canExecute": False, "recoveryReady": False, "requiresHostRecheck": True}


def _freeze_installation_writers(retention_id, *, fetch=release.github_json):
    """New owned installation only. No resume, public CLI or recovery/installation permit."""
    return _observe_installed_runtime(retention_id, fetch=fetch,
        include_configuration=True, include_docker=True, include_systemd=True,
        include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True, _freeze_writers=True)



# In-memory recovery inputs only. Never serialize the returned raw mapping to logs/CLI.
MAX_RECOVERY_PRIVATE_BYTES = 16 * 1024 * 1024
MAX_RECOVERY_SOURCE_BYTES = MAX_TOTAL


def _recovery_private_sources(folders):
    files, metadata, locks, directories = {}, {}, {}, {}
    total = 0
    for name, lock in (("jobs", ".release.lock"), ("plans", ".prepare.lock")):
        root = folders[name]
        before = os.fstat(root)
        _private_info(before, directory=True)
        names = sorted(os.listdir(root))
        _need(len(names) <= 1025 and lock in names, "recovery private inventory exceeds budget or lacks original lock")
        directories["/opt/sanq/deploy-state/" + name] = list(_installed_fingerprint(before))
        for entry in names:
            info = os.stat(entry, dir_fd=root, follow_symlinks=False)
            _private_info(info)
            path = "/opt/sanq/deploy-state/" + name + "/" + entry
            if entry == lock:
                locks[path] = list(_installed_fingerprint(info))
                continue  # Retain lock metadata; never copy/recreate lock inodes as restore files.
            _need(re.fullmatch(r"[a-f0-9]{64}\.json", entry) is not None,
                  "unreviewed recovery private member")
            raw = _private_read(root, entry, MAX_FILE)
            after = os.stat(entry, dir_fd=root, follow_symlinks=False)
            _private_info(after)
            _need(_installed_fingerprint(info) == _installed_fingerprint(after),
                  "recovery private member changed around read")
            total += len(raw)
            _need(total <= MAX_RECOVERY_PRIVATE_BYTES, "recovery private bytes exceed budget")
            files[path], metadata[path] = raw, list(_installed_fingerprint(info))
        _need(sorted(os.listdir(root)) == names
              and _installed_fingerprint(before) == _installed_fingerprint(os.fstat(root)),
              "recovery private inventory changed")
    return files, metadata, locks, directories



MAX_RECOVERY_RETENTIONS = 64


def _recovery_retention_names(root):
    names = []
    with os.scandir(root) as entries:
        for entry in entries:
            _need(len(names) < MAX_RECOVERY_RETENTIONS
                  and re.fullmatch(r"[a-f0-9]{64}", entry.name) is not None,
                  "unknown or excessive recovery material directories")
            names.append(entry.name)
    return sorted(names)


def _recovery_retention_sources(folders):
    """Read every complete retention as data; no history selection or source execution."""
    parent = folders["installations"]
    before = os.fstat(parent)
    _private_info(before, directory=True)
    names = _recovery_retention_names(parent)
    files, metadata, directories = {}, {}, {}
    total = 0
    for identity in names:
        with _private_directory(parent, identity) as root:
            directory = os.fstat(root)
            _need(set(os.listdir(root)) == PRIVATE_FILES, "incomplete recovery material history")
            raw_files, fingerprints = {}, {}
            # Check sizes before reading this group, then retain the exact originals.
            limits = {name: (bundle.MAX_ARCHIVE_BYTES if name == "current-runtime-archive.tar.gz"
                      else MAX_KIT if name == "delivery-kit.tar.gz" else 4096) for name in PRIVATE_FILES}
            for name in sorted(PRIVATE_FILES):
                info = os.stat(name, dir_fd=root, follow_symlinks=False)
                _private_info(info)
                _need(0 < info.st_size <= limits[name], "recovery material history size differs")
                total += info.st_size
                _need(total <= MAX_RECOVERY_SOURCE_BYTES, "recovery material history exceeds source budget")
                fingerprints[name] = _installed_fingerprint(info)
            for name in sorted(PRIVATE_FILES):
                raw = _private_read(root, name, limits[name])
                _need(fingerprints[name] == _installed_fingerprint(
                      os.stat(name, dir_fd=root, follow_symlinks=False)),
                      "recovery material history changed around read")
                raw_files[name] = raw
            try:
                kit, old, value = _retained_contents(root, identity)
            except (json.JSONDecodeError, UnicodeError, KeyError, TypeError, ValueError):
                raise release.ReleaseContractError("invalid recovery material history records") from None
            _need(kit == raw_files["delivery-kit.tar.gz"] and old == raw_files["current-runtime-archive.tar.gz"]
                  and raw_files["retained.json"] == _json(value)
                  and raw_files["retaining.json"] == _json({**value, "phase": "RETAINING"}),
                  "recovery material history bytes differ")
            for name in sorted(PRIVATE_FILES):
                actual = os.stat(name, dir_fd=root, follow_symlinks=False)
                _private_info(actual)
                _need(fingerprints[name] == _installed_fingerprint(actual),
                      "recovery material history metadata changed")
                path = "/opt/sanq/deploy-state/installations/" + identity + "/" + name
                files[path], metadata[path] = raw_files[name], list(fingerprints[name])
            path = "/opt/sanq/deploy-state/installations/" + identity
            directories[path] = list(_installed_fingerprint(directory))
            current = os.stat(identity, dir_fd=parent, follow_symlinks=False)
            _private_info(current, directory=True)
            _need(_installed_fingerprint(directory) == _installed_fingerprint(os.fstat(root))
                  == _installed_fingerprint(current), "recovery material history directory replaced")
    _need(_recovery_retention_names(parent) == names
          and _installed_fingerprint(before) == _installed_fingerprint(os.fstat(parent)),
          "recovery material history inventory changed")
    return files, metadata, directories, list(_installed_fingerprint(before))


def _recovery_retention_matches(folders, capture):
    files, metadata, directories, namespace = _recovery_retention_sources(folders)
    expected = {path: raw for path, raw in capture[0].items()
                if path.startswith("/opt/sanq/deploy-state/installations/")}
    _need(files == expected and directories == capture[1]["retainedMaterialDirectories"]
          and namespace == capture[1]["retainedMaterialNamespace"]
          and all(metadata[path] == capture[1]["files"][path]["identity"] for path in files),
          "recovery material history changed after capture")



RECOVERY_STATE_DIRECTORIES = frozenset(("jobs", "plans", "maintenance", "installations"))


def _recovery_namespace_names(state):
    names = set()
    with os.scandir(state) as entries:
        for entry in entries:
            _need(entry.name in RECOVERY_STATE_DIRECTORIES | {INSTALLATION_RUNS}
                  and entry.name not in names and len(names) < 5, "unknown recovery private root member")
            names.add(entry.name)
    _need(RECOVERY_STATE_DIRECTORIES <= names, "incomplete recovery private root")
    return names


def _recovery_namespace_directory(info):
    _private_info(info, directory=True)
    return {"identity": list(_directory_identity(info)), "fingerprint": list(_installed_fingerprint(info))}


def _recovery_namespace_value(value):
    _need(type(value) is dict and set(value) == {"state", "directories", "installationNamespace",
          "originalEntries", "maintenanceEntries"} and type(value["directories"]) is dict
          and set(value["directories"]) == RECOVERY_STATE_DIRECTORIES
          and type(value["maintenanceEntries"]) is list and not value["maintenanceEntries"],
          "invalid recovery private namespace facts")
    rows = [value["state"], *value["directories"].values()]
    namespace = value["installationNamespace"]
    if namespace is not None:
        rows.append(namespace)
    for row in rows:
        _need(type(row) is dict and set(row) == {"identity", "fingerprint"}
              and type(row["identity"]) is list and len(row["identity"]) == 5
              and type(row["fingerprint"]) is list and len(row["fingerprint"]) == 9
              and all(type(part) is int for part in (*row["identity"], *row["fingerprint"])),
              "invalid recovery namespace directory metadata")
        info = row["fingerprint"]
        _need(row["identity"] == [info[index] for index in (0, 1, 5, 6, 7)]
              and info[5] == PRIVATE_OWNER_UID and info[6] == PRIVATE_GROUP_GID
              and stat.S_ISDIR(info[7]) and stat.S_IMODE(info[7]) == 0o700,
              "recovery namespace directory identity differs")
    _need(value["originalEntries"] == sorted(RECOVERY_STATE_DIRECTORIES
          | ({INSTALLATION_RUNS} if namespace is not None else set())),
          "recovery private root inventory differs")
    return value


def _recovery_namespace_snapshot(folders):
    """Record empty/absent namespaces before any owned transaction or maintenance write."""
    _need(set(folders) == RECOVERY_STATE_DIRECTORIES, "recovery private folder set differs")
    anchor = _state_parent()
    try:
        with _private_directory(anchor, "deploy-state") as state:
            before = _recovery_namespace_directory(os.fstat(state))
            names = _recovery_namespace_names(state)
            _need(RECOVERY_STATE_DIRECTORIES <= names <= RECOVERY_STATE_DIRECTORIES | {INSTALLATION_RUNS},
                  "unknown recovery private root member")
            directories = {}
            for name in sorted(RECOVERY_STATE_DIRECTORIES):
                row = _recovery_namespace_directory(os.stat(name, dir_fd=state, follow_symlinks=False))
                _need(row == _recovery_namespace_directory(os.fstat(folders[name])),
                      "recovery private path lost original lock directories")
                directories[name] = row
            _need(not os.listdir(folders["maintenance"]), "recovery maintenance originals are not empty")
            with _installation_namespace(state) as (namespace, _):
                original = None if namespace is None else _recovery_namespace_directory(os.fstat(namespace))
            if original is not None:
                _need(original == _recovery_namespace_directory(
                      os.stat(INSTALLATION_RUNS, dir_fd=state, follow_symlinks=False)),
                      "recovery empty installation namespace changed")
            _need(names == _recovery_namespace_names(state)
                  and before == _recovery_namespace_directory(os.fstat(state))
                  and all(row == _recovery_namespace_directory(os.fstat(folders[name]))
                          == _recovery_namespace_directory(os.stat(name, dir_fd=state, follow_symlinks=False))
                          for name, row in directories.items())
                  and not os.listdir(folders["maintenance"]),
                  "recovery private namespace changed during capture")
            current = os.stat("deploy-state", dir_fd=anchor, follow_symlinks=False)
            _need(before == _recovery_namespace_directory(current), "recovery private root replaced")
            return _recovery_namespace_value({"state": before, "directories": directories,
                "installationNamespace": original, "originalEntries": sorted(names), "maintenanceEntries": []})
    finally:
        os.close(anchor)


def _recovery_namespace_owned(state, folders, namespace, original):
    """Check only this stack's known namespace changes; existing owned-record checks still apply."""
    value = _recovery_namespace_value(original)
    expected = (set(value["originalEntries"]) if namespace is None
                else RECOVERY_STATE_DIRECTORIES | {INSTALLATION_RUNS})
    _need(_recovery_namespace_names(state) == expected
          and list(_directory_identity(os.fstat(state))) == value["state"]["identity"],
          "owned recovery private root changed")
    for name, saved in value["directories"].items():
        actual = _recovery_namespace_directory(os.stat(name, dir_fd=state, follow_symlinks=False))
        held = _recovery_namespace_directory(os.fstat(folders[name]))
        _need(actual["identity"] == held["identity"] == saved["identity"],
              "owned recovery private directory replaced")
    previous = value["installationNamespace"]
    if namespace is not None or previous is not None:
        actual = _recovery_namespace_directory(os.stat(INSTALLATION_RUNS, dir_fd=state, follow_symlinks=False))
        _need((namespace is None or actual["identity"] ==
               _recovery_namespace_directory(os.fstat(namespace))["identity"])
              and (previous is None or actual["identity"] == previous["identity"]),
              "owned recovery installation namespace replaced")


def _installation_recovery_sources(folders, retention_id, kit, old, retained):
    """Capture pre-gate originals into memory; not a complete or durable recovery kit."""
    private_namespace = _recovery_namespace_snapshot(folders)
    runtime, runtime_dirs = _installed_runtime_snapshot(old, retained["currentArchiveSourceSha"])
    configuration, application = _configuration_snapshot()
    units, overrides, systemd_root = _systemd_disk_snapshot(runtime["ops/backup/sanq-backup.service"][0])
    external = _external_backup_snapshot(runtime)
    private_files, private_metadata, locks, private_dirs = _recovery_private_sources(folders)
    files, metadata = {}, {}
    total = 0
    def add(path, raw, identity):
        nonlocal total
        _need(path not in files and type(raw) is bytes and 0 < len(raw) <= MAX_RECOVERY_SOURCE_BYTES,
              "duplicate or invalid recovery source")
        total += len(raw)
        _need(total <= MAX_RECOVERY_SOURCE_BYTES, "recovery source bytes exceed budget")
        files[path] = raw
        metadata[path] = {"sha256": _hash(raw), "bytes": len(raw), "identity": list(identity)}
    for path, (raw, identity) in {**runtime, **configuration}.items():
        add("/opt/sanq/runtime/" + path, raw, identity)
    for name, (raw, identity) in units.items():
        add("/etc/systemd/system/" + name, raw, identity)
    for path, proof in external["files"].items():
        # The reader proved exact equality to these sealed installed source bytes.
        add(path, runtime[proof["source"]][0], proof["identity"])
    for path, raw in private_files.items():
        add(path, raw, private_metadata[path])
    with _private_directory(folders["installations"], retention_id) as root:
        _need(_retained_contents(root, retention_id) == (kit, old, retained), "recovery retained originals changed")
    retained_files, retained_metadata, retained_dirs, retained_namespace = _recovery_retention_sources(folders)
    for path, raw in retained_files.items():
        add(path, raw, retained_metadata[path])
    with _private_directory(folders["installations"], retention_id) as root:
        _need(_retained_contents(root, retention_id) == (kit, old, retained), "recovery retained originals changed")
    absent = ["/opt/sanq/runtime/" + name for name in (*HELPERS, BOOTSTRAP)]
    absent += ["/etc/systemd/system/" + unit + ".d/" + INSTALL_GATE_NAME for unit in INSTALL_DENY_DROPINS]
    absent += ["/etc/systemd/system/" + unit for unit in ("docker.service", "docker.socket")]
    _need(_recovery_namespace_snapshot(folders) == private_namespace,
          "recovery private namespace changed around original file capture")
    summary = {"outcome": "INSTALLATION_RECOVERY_SOURCES_OBSERVED", "retentionId": retention_id,
        "privateNamespace": private_namespace,
        "scope": "pre-install-original-files-only", "applicationSha": application["applicationSha"],
        "sourceSha": retained["sourceSha"], "currentArchiveSourceSha": retained["currentArchiveSourceSha"],
        "files": metadata, "absentFiles": sorted(absent), "originalLockMetadata": locks,
        "runtimeDirectories": {name: list(value) for name, value in runtime_dirs.items()},
        "privateDirectories": private_dirs, "retainedMaterialDirectories": retained_dirs,
        "retainedMaterialNamespace": retained_namespace, "systemdDirectoryIdentity": list(systemd_root),
        "overrideDirectories": {name: list(value) if value is not None else None for name, value in overrides.items()},
        "externalDirectories": external["directories"], "capturedBytes": total,
        "completePrivateStateCaptured": False, "recoveryArchiveDurable": False, "snapshotAvailable": False,
        "recoveryReady": False, "readyToInstall": False, "canExecute": False, "requiresHostRecheck": True}
    return files, summary


def _observe_installation_recovery_sources(retention_id, *, fetch=release.github_json):
    """Read-only pre-install query. Return summaries only, never original secret bytes."""
    _need(isinstance(retention_id, str) and re.fullmatch(r"[a-f0-9]{64}", retention_id), "invalid recovery retention identity")
    with _private_session() as folders, _private_directory(folders["installations"], retention_id) as root:
        _idle_for_materials(folders)
        kit, old, retained = _retained_contents(root, retention_id)
        review = review_transition(kit, retained["sourceSha"], old, retained["currentArchiveSourceSha"], fetch=fetch)
        _need(not review["requiresAdditionalPlatformReview"], "recovery source transition exceeds tool-only scope")
        before = _installation_recovery_sources(folders, retention_id, kit, old, retained)
        _need(review_transition(kit, retained["sourceSha"], old, retained["currentArchiveSourceSha"], fetch=fetch)
              == review, "recovery source review changed")
        _need(_installation_recovery_sources(folders, retention_id, kit, old, retained) == before,
              "recovery source originals changed across capture")
        _need(_retained_contents(root, retention_id) == (kit, old, retained), "recovery retained materials changed")
        _idle_for_materials(folders)
        return before[1]



RECOVERY_FILES = frozenset(("recovery.tar", "recovery.json"))
MAX_RECOVERY_ARCHIVE_BYTES = MAX_RECOVERY_SOURCE_BYTES + 8 * 1024 * 1024
MAX_RECOVERY_MEMBERS = 2100

MAX_RECOVERY_HOST_BYTES = 8 * 1024 * 1024
RECOVERY_HOST_MEMBER = "observations/pre-install-host.json"


def _installation_recovery_host_commands(docker):
    """Exact read-only observations for these saved objects, never an executor."""
    commands = {(*DOCKER, "info", "--format", "{{json .}}"), PROJECT_PS,
                (*COMPOSE, "config", "--environment"), (*COMPOSE, "config", "--format", "json"),
                (*DOCKER, "volume", "inspect", "--format", "{{json .}}", "sanq-app_pgdata"),
                NETWORK_INSPECT}
    for row in docker["containers"].values():
        commands.add((*DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", row["containerId"]))
        commands.add((*DOCKER, "image", "inspect", "--format", "{{json .}}", row["imageId"]))
    commands.update(tuple(_systemd_args(unit)) for unit in SYSTEMD_UNITS)
    return commands


def _installation_recovery_host_capture(capture, baseline, run, systemd_run, *, fetch):
    """Keep exact pre-gate command outputs private; rerun existing baseline validators."""
    commands, total = [], 0
    allowed = _installation_recovery_host_commands(baseline[2])
    def observe(client, args):
        nonlocal total
        _need(type(args) is list and tuple(args) in allowed,
              "unreviewed recovery host observation")
        raw = client(args)
        _need(type(raw) is str and 0 < len(raw.encode("utf-8")) <= MAX_HOST_OUTPUT,
              "invalid recovery host output")
        total += len(raw.encode("utf-8"))
        _need(total <= MAX_RECOVERY_HOST_BYTES and len(commands) < 128,
              "recovery host observation exceeds budget")
        commands.append({"argv": list(args), "stdout": raw})
        return raw
    docker_run = lambda args: observe(run, args)
    manager_run = lambda args: observe(systemd_run, args)
    _need(_docker_snapshot(baseline[1][1], baseline[0][0]["docker-compose.yml"][0], docker_run, fetch) == baseline[2]
          and _application_binding_snapshot(baseline[2], docker_run) == baseline[6]
          and _effective_configuration_snapshot(baseline[2], docker_run) == baseline[8],
          "recovery host baseline changed during raw capture")
    units = _systemd_loaded_units(manager_run)
    _need(all(_hash(_json(fields)) == baseline[3]["units"][unit]["effectivePropertiesSha256"]
              for unit, fields in units.items()), "recovery loaded units changed during raw capture")
    _need({tuple(row["argv"]) for row in commands} == allowed,
          "recovery host observation inventory differs")
    raw = _json({"schemaVersion": 1, "kind": "sanq-minimal-executor-recovery-host",
                 "applicationSha": baseline[1][1]["applicationSha"], "docker": baseline[2],
                 "systemd": baseline[3], "applicationBinding": baseline[6],
                 "effectiveConfiguration": baseline[8], "commands": commands,
                 "canExecute": False, "recoveryReady": False})
    _need(len(raw) <= MAX_RECOVERY_HOST_BYTES, "recovery host envelope exceeds budget")
    files, summary = capture
    summary = {**summary, "scope": "pre-install-files-and-host-observations", "hostObservations": {"member": RECOVERY_HOST_MEMBER,
               "sha256": _hash(raw), "bytes": len(raw), "preGate": True, "completeHostStateCaptured": False}}
    _need(summary["capturedBytes"] + len(raw) <= MAX_RECOVERY_SOURCE_BYTES,
          "recovery source and host bytes exceed shared budget")
    return files, summary, raw


def _installation_recovery_host_value(raw, saved):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_RECOVERY_HOST_BYTES,
          "invalid recovery host bytes")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid recovery host JSON constant"))
    except (json.JSONDecodeError, UnicodeError):
        raise release.ReleaseContractError("invalid recovery host JSON") from None
    _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "applicationSha", "docker",
          "systemd", "applicationBinding", "effectiveConfiguration", "commands", "canExecute", "recoveryReady"}
          and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == "sanq-minimal-executor-recovery-host"
          and value["applicationSha"] == saved["applicationSha"]
          and value["canExecute"] is False and value["recoveryReady"] is False
          and all(type(value[key]) is dict for key in ("docker", "systemd", "applicationBinding", "effectiveConfiguration")),
          "recovery host fields or permissions differ")
    docker = value["docker"]
    _need(set(docker) == {"containers", "currentImageSeal", "renderedComposeSha256", "dockerEngine", "databaseVolumeSha256"}
          and _json(docker["containers"]) == _json(saved["containers"])
          and _hash(_json(docker["dockerEngine"])) == saved["dockerEngineSha256"],
          "recovery host saved objects differ")
    allowed = _installation_recovery_host_commands(docker)
    rows = value["commands"]
    _need(type(rows) is list and 0 < len(rows) <= 128, "invalid recovery host command count")
    observed = set()
    for row in rows:
        _need(type(row) is dict and set(row) == {"argv", "stdout"} and type(row["argv"]) is list
              and all(type(part) is str for part in row["argv"]) and tuple(row["argv"]) in allowed
              and type(row["stdout"]) is str and 0 < len(row["stdout"].encode("utf-8")) <= MAX_HOST_OUTPUT,
              "invalid recovery host command or output")
        observed.add(tuple(row["argv"]))
    _need(observed == allowed and _json(value) == raw, "incomplete or noncanonical recovery host observations")
    return value



def _installation_recovery_entries(capture, intent, writers, identity):
    _need(type(capture) is tuple and len(capture) in (2, 3)
          and type(capture[0]) is dict and type(capture[1]) is dict, "invalid recovery source capture")
    files, summary = capture[:2]
    recorded = _installation_record_value(intent, identity)
    saved = _installation_writers_match(intent, writers, identity)
    _recovery_namespace_value(summary.get("privateNamespace"))
    _need(summary.get("scope") == ("pre-install-files-and-host-observations" if len(capture) == 3
                                      else "pre-install-original-files-only")
          and summary.get("retentionId") == recorded["retentionId"]
          and summary.get("sourceSha") == recorded["targetSourceSha"]
          and summary.get("currentArchiveSourceSha") == recorded["installedRuntimeSourceSha"]
          and summary.get("applicationSha") == saved["applicationSha"]
          and type(summary.get("files")) is dict and set(summary["files"]) == set(files),
          "recovery capture is not bound to this installation")
    _need(all(summary.get(key) is False for key in ("canExecute", "readyToInstall", "recoveryReady",
          "snapshotAvailable", "recoveryArchiveDurable", "completePrivateStateCaptured")),
          "recovery source capture cannot authorize installation")
    fixed = {"/opt/sanq/runtime/" + name for name in (*RUNTIME_MEMBERS, "runtime-release.json", *CONFIGURATION_NAMES)}
    fixed |= {"/etc/systemd/system/" + unit for unit in ("sanq-backup.service", "sanq-backup.timer")}
    fixed |= {"/" + "/".join((*parts, name)) for parts, name, _, _, _ in EXTERNAL_BACKUP_FILES}
    retained_dirs = summary.get("retainedMaterialDirectories")
    namespace = summary.get("retainedMaterialNamespace")
    _need(type(retained_dirs) is dict and 0 < len(retained_dirs) <= MAX_RECOVERY_RETENTIONS
          and "/opt/sanq/deploy-state/installations/" + recorded["retentionId"] in retained_dirs,
          "recovery retained material directory inventory differs")
    for path, info in retained_dirs.items():
        _need(isinstance(path, str) and re.fullmatch(r"/opt/sanq/deploy-state/installations/[a-f0-9]{64}", path)
              and type(info) is list and len(info) == 9 and all(type(value) is int for value in info)
              and stat.S_ISDIR(info[7]) and stat.S_IMODE(info[7]) == 0o700,
              "recovery retained material directory metadata differs")
    _need(type(namespace) is list and len(namespace) == 9 and all(type(value) is int for value in namespace)
          and stat.S_ISDIR(namespace[7]) and stat.S_IMODE(namespace[7]) == 0o700,
          "recovery retained material namespace metadata differs")
    fixed |= {path + "/" + name for path in retained_dirs for name in PRIVATE_FILES}
    absent = {"/opt/sanq/runtime/" + name for name in (*HELPERS, BOOTSTRAP)}
    absent |= {"/etc/systemd/system/" + unit + ".d/" + INSTALL_GATE_NAME for unit in INSTALL_DENY_DROPINS}
    absent |= {"/etc/systemd/system/" + unit for unit in ("docker.service", "docker.socket")}
    _need(fixed <= set(files) and summary.get("absentFiles") == sorted(absent)
          and len(files) + 3 + (len(capture) == 3) <= MAX_RECOVERY_MEMBERS, "recovery fixed inventory differs")
    total = 0
    for path, raw in files.items():
        _need(isinstance(path, str) and (path in fixed or re.fullmatch(
              r"/opt/sanq/deploy-state/(jobs|plans)/[a-f0-9]{64}\.json", path) is not None),
              "unreviewed recovery payload path")
        proof = summary["files"][path]
        _need(type(raw) is bytes and 0 < len(raw) <= MAX_RECOVERY_SOURCE_BYTES and type(proof) is dict
              and set(proof) == {"sha256", "bytes", "identity"} and proof["sha256"] == _hash(raw)
              and type(proof["bytes"]) is int and proof["bytes"] == len(raw), "recovery source bytes differ")
        info = proof["identity"]
        _need(type(info) is list and len(info) == 9 and all(type(value) is int for value in info)
              and info[2] == len(raw) and info[8] == 1 and stat.S_ISREG(info[7]), "recovery source metadata differs")
        total += len(raw)
    _need(total <= MAX_RECOVERY_SOURCE_BYTES and type(summary.get("capturedBytes")) is int
          and summary["capturedBytes"] == total,
          "recovery total bytes differ")
    host_entries = {}
    if len(capture) == 3:
        raw = capture[2]
        _installation_recovery_host_value(raw, saved)
        _need(summary.get("hostObservations") == {"member": RECOVERY_HOST_MEMBER,
              "sha256": _hash(raw), "bytes": len(raw), "preGate": True, "completeHostStateCaptured": False}
              and type(summary["hostObservations"]["bytes"]) is int
              and summary["hostObservations"]["preGate"] is True
              and summary["hostObservations"]["completeHostStateCaptured"] is False
              and total + len(raw) <= MAX_RECOVERY_SOURCE_BYTES,
              "recovery host metadata or shared budget differs")
        host_entries[RECOVERY_HOST_MEMBER] = raw
    else:
        _need("hostObservations" not in summary, "recovery host originals are missing")
    index = _json({"schemaVersion": 1, "kind": "sanq-minimal-executor-recovery-files",
                   "installationId": identity, "intentSha256": _hash(intent), "writersSha256": _hash(writers),
                   "capture": summary, "canExecute": False, "recoveryReady": False})
    _need(len(index) <= 2 * 1024 * 1024, "recovery index exceeds budget")
    return {"originals" + path: raw for path, raw in files.items()} | host_entries | {
        "recovery-index.json": index, "installation/intent.json": intent, "installation/writers.json": writers}


def _installation_recovery_verify(payload, entries):
    _need(type(payload) is bytes and 0 < len(payload) <= MAX_RECOVERY_ARCHIVE_BYTES
          and len(entries) <= MAX_RECOVERY_MEMBERS, "recovery archive exceeds budget")
    seen, end = set(), 0
    names = iter(sorted(entries))
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
            for member in archive:
                _need(member.name in entries and member.name not in seen and member.name == next(names, None)
                      and member.type == tarfile.REGTYPE and member.mode == 0o600
                      and member.uid == member.gid == member.mtime == 0
                      and member.uname == member.gname == member.linkname == "" and not member.pax_headers,
                      "unreviewed recovery archive member")
                expected = entries[member.name]
                _need(member.size == len(expected)
                      and payload[member.offset:member.offset + 512] == member.tobuf(format=tarfile.USTAR_FORMAT),
                      "recovery archive header differs")
                stream = archive.extractfile(member)
                _need(stream is not None and stream.read(len(expected) + 1) == expected, "recovery archive bytes differ")
                stream.close()
                seen.add(member.name)
                end = member.offset_data + ((member.size + 511) // 512) * 512
                _need(not any(payload[member.offset_data + member.size:end]), "recovery member padding differs")
        canonical_size = ((end + 1024 + 10239) // 10240) * 10240
        _need(seen == set(entries) and len(payload) == canonical_size and not any(payload[end:]),
              "recovery archive inventory or trailer differs")
    except (tarfile.TarError, ValueError, UnicodeError, OSError, EOFError):
        raise release.ReleaseContractError("invalid recovery archive") from None


def _installation_recovery_payload(capture, intent, writers, identity):
    entries = _installation_recovery_entries(capture, intent, writers, identity)
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, raw in sorted(entries.items()):
            member = tarfile.TarInfo(name)
            member.size, member.mode = len(raw), 0o600
            member.uid = member.gid = member.mtime = 0
            archive.addfile(member, io.BytesIO(raw))
    payload = output.getvalue()
    _installation_recovery_verify(payload, entries)
    return payload



def _installation_recovery_index(payload, intent, writers, identity):
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
            member = archive.getmember("recovery-index.json")
            _need(member.type == tarfile.REGTYPE and 0 < member.size <= 2 * 1024 * 1024,
                  "invalid recovery index member")
            stream = archive.extractfile(member)
            _need(stream is not None, "recovery index missing")
            raw = stream.read(member.size + 1)
            stream.close()
            value = json.loads(raw, object_pairs_hook=_unique,
                               parse_constant=lambda _: _need(False, "invalid recovery index JSON constant"))
    except (tarfile.TarError, KeyError, ValueError, UnicodeError, OSError, EOFError):
        raise release.ReleaseContractError("invalid recovery index") from None
    _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "installationId", "intentSha256",
          "writersSha256", "capture", "canExecute", "recoveryReady"}
          and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == "sanq-minimal-executor-recovery-files" and value["installationId"] == identity
          and value["intentSha256"] == _hash(intent) and value["writersSha256"] == _hash(writers)
          and type(value["capture"]) is dict and value["canExecute"] is False and value["recoveryReady"] is False
          and raw == _json(value), "recovery index binding differs")
    return value


def _installation_recovery_receipt(payload, intent, writers, identity, capture_sha):
    _installation_writers_match(intent, writers, identity)
    _need(type(payload) is bytes and 0 < len(payload) <= MAX_RECOVERY_ARCHIVE_BYTES
          and isinstance(capture_sha, str) and re.fullmatch(r"[a-f0-9]{64}", capture_sha),
          "invalid recovery receipt input")
    _need(capture_sha == _hash(_json(_installation_recovery_index(payload, intent, writers, identity)["capture"])),
          "recovery receipt capture digest differs from its payload")
    return _json({"schemaVersion": 1, "kind": "sanq-minimal-executor-recovery-receipt",
        "installationId": identity, "intentSha256": _hash(intent), "writersSha256": _hash(writers),
        "archiveSha256": _hash(payload), "archiveBytes": len(payload), "captureSha256": capture_sha,
        "canExecute": False, "recoveryReady": False, "snapshotAvailable": False, "completePrivateStateCaptured": False})


def _installation_recovery_receipt_value(raw, payload, intent, writers, identity):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_INSTALL_RECORD, "recovery receipt exceeds budget")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid recovery JSON constant"))
    except (json.JSONDecodeError, UnicodeError):
        raise release.ReleaseContractError("invalid recovery receipt JSON") from None
    _need(type(value) is dict and isinstance(value.get("captureSha256"), str)
          and raw == _installation_recovery_receipt(payload, intent, writers, identity, value["captureSha256"]),
          "recovery receipt binding or canonical bytes differ")
    return value


@contextlib.contextmanager
def _installation_recovery_directory(parent, *, create=False):
    _need(type(create) is bool and (not create or os.geteuid() == 0), "unprivileged recovery directory creation")
    _private_info(os.fstat(parent), directory=True)
    if create:
        os.mkdir("recovery", mode=0o700, dir_fd=parent)  # Exclusive; never adopt a previous directory.
    fd = os.open("recovery", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        before = os.fstat(fd)
        _private_info(before, directory=True)
        path = os.stat("recovery", dir_fd=parent, follow_symlinks=False)
        _private_info(path, directory=True)
        _need(_directory_identity(before) == _directory_identity(path), "recovery directory changed during open")
        if create:
            _need(not os.listdir(fd), "new recovery directory is not empty")
            os.fsync(fd)
            os.fsync(parent)
        yield fd
        after, path = os.fstat(fd), os.stat("recovery", dir_fd=parent, follow_symlinks=False)
        _private_info(after, directory=True)
        _private_info(path, directory=True)
        _need(_directory_identity(before) == _directory_identity(after) == _directory_identity(path),
              "recovery directory changed")
    finally:
        os.close(fd)


def _installation_recovery_read(root, name):
    _need(name in RECOVERY_FILES, "unreviewed recovery file")
    _private_info(os.fstat(root), directory=True)
    maximum = MAX_RECOVERY_ARCHIVE_BYTES if name == "recovery.tar" else MAX_INSTALL_RECORD
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        _need(0 < before.st_size <= maximum, "recovery file size differs")
        chunks, size = [], 0
        while size <= maximum:
            block = os.read(fd, min(65536, maximum + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
        after, path = os.fstat(fd), os.stat(name, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need(size == before.st_size and _installed_fingerprint(before) == _installed_fingerprint(after)
              == _installed_fingerprint(path), "recovery file changed around read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _installation_recovery_write(root, name, raw):
    """Low-level create-only primitive. No caller path or standalone execution permit."""
    _need(os.geteuid() == 0 and name in RECOVERY_FILES and type(raw) is bytes, "unreviewed recovery write")
    _private_info(os.fstat(root), directory=True)
    maximum = MAX_RECOVERY_ARCHIVE_BYTES if name == "recovery.tar" else MAX_INSTALL_RECORD
    _need(0 < len(raw) <= maximum, "recovery output exceeds budget")
    disk = os.fstatvfs(root)
    _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + len(raw), "insufficient recovery storage reserve")
    fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        remaining = memoryview(raw)
        while remaining:
            count = os.write(fd, remaining)
            _need(count > 0, "short recovery write")
            remaining = remaining[count:]
        os.fsync(fd)
        os.fsync(root)
        _need(_installation_recovery_read(root, name) == raw, "recovery write readback differs")
        after, path = os.fstat(fd), os.stat(name, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)
              and _installed_fingerprint(after) == _installed_fingerprint(path), "recovery output replaced")
    finally:
        os.close(fd)  # Preserve empty, partial or complete files on every unknown result.


def _retain_installation_recovery(retention_id, *, fetch=release.github_json):
    """New owned installation only. Retain partial recovery files, never install/restore."""
    return _observe_installed_runtime(retention_id, fetch=fetch,
        include_configuration=True, include_docker=True, include_systemd=True,
        include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True, _freeze_writers=True, _retain_recovery=True)


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
