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
                               include_filesystem=False, include_prerequisites=False, include_application_binding=False):
    """Initial install source observation only. No CLI, writes or installation permit."""
    _need(all(type(flag) is bool for flag in (include_configuration, include_docker, include_systemd,
                                             include_filesystem, include_prerequisites, include_application_binding))
          and (not include_docker or include_configuration) and (not include_systemd or include_docker)
          and (not include_filesystem or include_systemd) and (not include_prerequisites or include_filesystem)
          and (not include_application_binding or include_prerequisites),
          "invalid installation observation switches")
    deadline = time.monotonic() + 300
    run = lambda args: _docker_command(args, deadline=deadline)
    def snapshot():
        runtime = _installed_runtime_snapshot(old, value["currentArchiveSourceSha"])
        configuration = _configuration_snapshot() if include_configuration else None
        docker = (_docker_snapshot(configuration[1], runtime[0]["docker-compose.yml"][0], run, fetch)
                  if include_docker else None)
        systemd = (_systemd_snapshot(runtime[0]["ops/backup/sanq-backup.service"][0],
                                    lambda args: _systemd_command(args, deadline=deadline))
                   if include_systemd else None)
        filesystem = _host_filesystem_snapshot(deadline=deadline) if include_filesystem else None
        prerequisites = (_runtime_prerequisite_snapshot(docker, lambda args: _runtime_command(args, deadline=deadline))
                         if include_prerequisites else None)
        binding = _application_binding_snapshot(docker, run) if include_application_binding else None
        return runtime, configuration, docker, systemd, filesystem, prerequisites, binding
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
    _need(os.geteuid() == 0 and (_docker_allowed(args) or _systemd_allowed(args)
                                   or _runtime_observation_allowed(args)), "unreviewed or unprivileged Host observation")
    _need(not any(os.environ.get(key) for key in (
          "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")),
          "non-default Docker endpoint requires separate review")
    stop = min(deadline, time.monotonic() + 30)
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
        # Only terminate this read-only CLI process group, never any container.
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


def _systemd_snapshot(backup_source, run):
    disk = _systemd_disk_snapshot(backup_source)
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
