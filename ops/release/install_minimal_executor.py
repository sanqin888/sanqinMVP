#!/usr/bin/env python3
"""Delivery, bound material retention and owned stages. No public host-apply CLI.

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
                               include_filesystem=False, include_prerequisites=False, include_application_binding=False, include_migrations=False, include_effective_configuration=False, include_external_backup=False, _record_intent=False, _load_deny_gates=False, _save_writers=False, _freeze_writers=False, _retain_recovery=False, _snapshot_channel=None, _snapshot_target=None, _retain_snapshot_review=False, _confirm_offhost_index=False, _write_tools=False, _handover_gates=False, _verify_gate_api=False, _verify_application=False, _restore_policies=False, _complete_installation=False, _task_source_sha=None):
    """Private staged observer; writes require complete fresh observations, never a CLI permit."""
    _need(all(type(flag) is bool for flag in (include_configuration, include_docker, include_systemd,
                                             include_filesystem, include_prerequisites, include_application_binding, include_migrations, include_effective_configuration, include_external_backup, _record_intent, _load_deny_gates, _save_writers, _freeze_writers, _retain_recovery, _retain_snapshot_review, _confirm_offhost_index, _write_tools, _handover_gates, _verify_gate_api, _verify_application, _restore_policies, _complete_installation))
          and (not include_docker or include_configuration) and (not include_systemd or include_docker)
          and (not include_filesystem or include_systemd) and (not include_prerequisites or include_filesystem)
          and (not include_application_binding or include_prerequisites) and (not include_migrations or include_application_binding)
          and (not include_effective_configuration or include_migrations)
          and (not include_external_backup or include_effective_configuration)
          and (not _record_intent or include_external_backup) and (not _load_deny_gates or _record_intent)
          and (not _save_writers or _load_deny_gates) and (not _freeze_writers or _save_writers)
          and (not _retain_recovery or _freeze_writers),
          "invalid installation observation switches")
    _need(_snapshot_channel is None or _retain_recovery and type(_snapshot_channel) is tuple
          and len(_snapshot_channel) == 2, "snapshot evidence wait requires complete recovery flow")
    _need(_snapshot_target is None or include_external_backup
          and (not _record_intent or _retain_recovery),
          "target storage requires a read-only observation or the complete owned recovery flow")
    _need(not _retain_snapshot_review or _snapshot_channel is not None and _snapshot_target is not None
          and _retain_recovery, "snapshot review retention requires the complete bound live flow")
    _need(not _confirm_offhost_index or _retain_snapshot_review,
          "off-host confirmation requires this bound live durable review")
    _need(not _write_tools or _confirm_offhost_index, "tool writes require this complete live off-host confirmation")
    _need(not _handover_gates or _write_tools, "permanent gate handover requires this complete tool write flow")
    _need(not _verify_gate_api or _handover_gates, "installed gate API requires this complete permanent handover")
    _need(not _verify_application or _verify_gate_api, "application verification requires this complete installed gate API flow")
    _need(not _restore_policies or _verify_application, "policy restoration requires this complete original application verification")
    _need(not _complete_installation or _restore_policies, "installation completion requires this full saved policy restoration")
    _need(_task_source_sha is None or _save_writers and type(_task_source_sha) is str
          and release.require_sha(_task_source_sha) == _task_source_sha,
          "supervised task binding requires the full saved writer observation")
    target = _installation_snapshot_target(_snapshot_target) if _snapshot_target is not None else None
    channel_identity = (_installation_snapshot_fds(*_snapshot_channel) if _snapshot_channel is not None else None)
    deadline = time.monotonic() + 300
    run = lambda args: _docker_command(args, deadline=deadline)
    storage_original = None
    tool_progress = None
    gate_handover = None
    application_progress = {}
    def snapshot(*, temporary_files=None):
        nonlocal storage_original
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
        baseline = (runtime, configuration, docker, systemd, filesystem, prerequisites, binding, migrations, effective, external_backup)
        if target is not None:
            storage = _installation_storage_snapshot(target, docker, prerequisites,
                lambda args: _runtime_command(args, deadline=deadline), deadline=deadline,
                _capture_target=_snapshot_target if _record_intent else None)
            if _record_intent:
                storage, original = storage
                if storage_original is None:
                    storage_original = original
            return (*baseline, storage)
        return baseline
    _need(isinstance(identity, str) and re.fullmatch(r"[a-f0-9]{64}", identity), "invalid retention identity")
    with _installation_application_ownership(application_progress), _private_session() as folders, _private_directory(folders["installations"], identity) as root, contextlib.ExitStack() as source_stack:
        _idle_for_materials(folders)
        kit, old, value = _retained_contents(root, identity)
        _need(_task_source_sha is None or _task_source_sha == value["sourceSha"],
              "task source differs from retained source")
        source_check = (source_stack.enter_context(_bound_bootstrap_sources(kit, _task_source_sha, fetch=fetch))
                        if _task_source_sha is not None else None)
        _need(_task_source_sha is None or callable(source_check), "bound installation source check unavailable")
        review = review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch)
        _need(not review["requiresAdditionalPlatformReview"], "retained transition exceeds tool-only scope")
        if source_check is not None:
            source_check()
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
        if target is not None:
            result.update({"outcome": "PRE_SNAPSHOT_STORAGE_OBSERVED",
                           "snapshotTargetAndStorageObserved": True, "snapshotStorage": before[10]})
        if _record_intent:
            frozen_recheck = frozen_local_recheck = None
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
                nonlocal frozen_recheck, frozen_local_recheck
                def verify_local_context():
                    check_owned()
                    _need(_retained_contents(root, identity) == (kit, old, value),
                          "installation materials changed during writer freeze")
                    if tool_progress is None:
                        _need(_installed_runtime_snapshot(old, value["currentArchiveSourceSha"]) == before[0],
                              "installed files or recovery baseline changed during writer freeze")
                    else:
                        _installation_tool_progress_check(tool_progress)
                    _need(_configuration_snapshot() == before[1]
                          and _host_filesystem_snapshot(deadline=deadline) == before[4]
                          and _external_backup_snapshot(before[0][0]) == before[9],
                          "installed files or recovery baseline changed during writer freeze")
                    if target is not None:
                        _need(_json(_installation_storage_snapshot(target, before[2], before[5],
                              lambda args: _runtime_command(args, deadline=deadline), deadline=deadline))
                              == _json(before[10]), "bound target storage changed during writer freeze")
                    if gate_handover is None:
                        _temporary_gate_systemd_parity(before[3],
                            lambda args: _systemd_command(args, deadline=deadline), loaded["files"])
                    else:
                        _temporary_gate_systemd_parity(before[3],
                            lambda args: _systemd_command(args, deadline=deadline), loaded["files"],
                            _handover=gate_handover)
                    database = _docker_json(_installation_history_args(before[2]["containers"]["db"]["containerId"]),
                                             lambda args: _runtime_command(args, deadline=deadline))
                    _need(type(database) is dict and set(database) == {*before[5]["databaseIdentity"], "history"}
                          and _json({key: val for key, val in database.items() if key != "history"}) == _json(before[5]["databaseIdentity"])
                          and _hash(_json(database["history"])) == before[5]["migrationHistorySha256"],
                          "database identity or migration history changed during writer freeze")
                    if application_progress.get("binding") is not None:
                        _need(_application_binding_snapshot(before[2], run) == application_progress["binding"],
                              "restarted application binding changed after verification")
                    check_owned()
                def verify_context():
                    check_owned()
                    _need(review_transition(kit, value["sourceSha"], old, value["currentArchiveSourceSha"], fetch=fetch)
                          == review, "installation materials changed during writer freeze")
                    verify_local_context()
                frozen = _freeze_saved_installation_writers(intent, writers, installation_id,
                    loaded["files"], before[2], run=run, check_owned=check_owned, verify_context=verify_context,
                    mutate=lambda role, action: _installation_writer_command(
                        intent, writers, installation_id, role, action, deadline=deadline),
                    systemd_run=lambda args: _systemd_command(args, deadline=deadline))
                def recheck_frozen():
                    verify_context()
                    if application_progress:
                        _installation_application_observation(application_progress, run)
                    else:
                        _installation_writer_observation(_installation_writers_match(intent, writers, installation_id),
                            before[2], run, set(INSTALL_WRITER_ROLES), set(INSTALL_WRITER_ROLES))
                    check_owned()
                def recheck_local_frozen():
                    verify_local_context()
                    if application_progress:
                        _installation_application_observation(application_progress, run)
                    else:
                        _installation_writer_observation(_installation_writers_match(intent, writers, installation_id),
                            before[2], run, set(INSTALL_WRITER_ROLES), set(INSTALL_WRITER_ROLES))
                    check_owned()
                frozen_recheck = recheck_frozen
                frozen_local_recheck = recheck_local_frozen
                return frozen
            capture = None
            if _retain_recovery:
                capture = _installation_recovery_sources(folders, identity, kit, old, value)
                capture = _installation_recovery_host_capture(capture, before, run,
                    lambda args: _systemd_command(args, deadline=deadline), fetch=fetch)
                if target is not None:
                    capture = _installation_recovery_storage_capture(capture, storage_original, result)
            def retain_recovery(persist, check_owned, intent, writers, installation_id):
                _need(capture is not None and callable(frozen_recheck), "recovery retention requires this owned frozen flow")
                try:
                    frozen_recheck()
                    _recovery_private_matches(folders, capture)
                    _recovery_retention_matches(folders, capture)
                    payload = _installation_recovery_payload(capture, intent, writers, installation_id)
                    receipt = _installation_recovery_receipt(payload, intent, writers, installation_id, _hash(_json(capture[1])))
                    check_owned()
                    scope = _installation_recovery_scope(payload, receipt, intent, writers, installation_id,
                        fetch=fetch, require_target_storage=target is not None)
                    _need(target is None or scope.get("snapshotTargetStorageReviewed") is True,
                          "recovery scope lacks original target storage binding")
                    check_owned()
                    result = persist(payload, receipt)
                    _recovery_retention_matches(folders, capture)
                    frozen_recheck()
                    check_owned()
                    return {**result, "scopeReview": scope}
                except BaseException:
                    raise release.ReleaseContractError("FENCE_UNCONFIRMED: review retained recovery payload and installation evidence") from None
            def review_snapshot(check_owned, intent, writers, installation_id, payload, receipt, *, persist_snapshot=None, persist_offhost=None, complete_installation=None):
                nonlocal deadline, tool_progress, gate_handover
                try:
                    def fresh_context():
                        nonlocal deadline
                        deadline = time.monotonic() + 300
                        check_owned()
                        frozen_recheck()
                        _recovery_private_matches(folders, capture)
                        _recovery_retention_matches(folders, capture)
                        scope = _installation_recovery_scope(payload, receipt, intent, writers, installation_id,
                        fetch=fetch, require_target_storage=target is not None)
                        _need(scope["packageScopeReviewed"] is True and time.monotonic() < deadline,
                              "snapshot review context budget expired")
                        check_owned()
                    _need((complete_installation is not None) == _complete_installation
                          and (complete_installation is None or callable(complete_installation)),
                          "completion is outside this owned flow")
                    _need((persist_offhost is not None) == _confirm_offhost_index
                          and (persist_offhost is None or callable(persist_offhost)),
                          "off-host confirmation is outside this owned flow")
                    _need((persist_snapshot is not None) == _retain_snapshot_review
                          and (persist_snapshot is None or callable(persist_snapshot)),
                          "snapshot review persistence is outside this owned flow")
                    _need(callable(frozen_recheck) and _snapshot_channel is not None
                          and _installation_snapshot_fds(*_snapshot_channel) == channel_identity,
                          "snapshot review channel or frozen context changed")
                    fresh_context()
                    request = _installation_snapshot_request(payload, receipt, intent, writers, installation_id)
                    sent_times = []
                    if target is not None:
                        bound = _installation_recovery_storage_value(capture[3], before[2],
                            _installation_record_value(intent, installation_id))["facts"]
                        _need(_json(bound) == _json(before[10]), "snapshot target no longer matches original intent")
                        request = _snapshot_content_request(request, bound)
                        response = _installation_snapshot_exchange(request, *_snapshot_channel,
                            deadline=time.monotonic() + MAX_SNAPSHOT_REVIEW_SECONDS,
                            _request_sent=lambda: sent_times.append(_snapshot_utc_now()))
                    else:
                        response = _installation_snapshot_exchange(request, *_snapshot_channel,
                            deadline=time.monotonic() + MAX_SNAPSHOT_REVIEW_SECONDS)
                    received_at = _snapshot_utc_now() if target is not None else None
                    value = _installation_snapshot_reply_value(response, request)
                    _need(_installation_snapshot_fds(*_snapshot_channel) == channel_identity,
                          "snapshot review descriptors changed during wait")
                    fresh_context()
                    if target is not None:
                        _need(len(sent_times) == 1, "snapshot challenge output was not confirmed complete")
                        reviewed = _installation_snapshot_content_value(response, request, bound,
                            request_sent_at=sent_times[0], reply_received_at=received_at)
                        if persist_snapshot is not None:
                            record = _snapshot_review_bytes(request, response, bound,
                                request_sent_at=sent_times[0], reply_received_at=received_at)
                            fresh_context()
                            saved = persist_snapshot(record)
                            fresh_context()
                            if persist_offhost is not None:
                                index = _snapshot_offhost_index(record, payload, receipt, intent, writers, installation_id)
                                _need(_json(index) == _json(saved["offHostIndex"]), "off-host index changed after durable review")
                                transfer = _snapshot_index_transfer(index)
                                _need(_installation_snapshot_fds(*_snapshot_channel) == channel_identity,
                                      "off-host confirmation channel changed")
                                sent_times = []
                                ack = _installation_snapshot_index_exchange(transfer, *_snapshot_channel,
                                    deadline=time.monotonic() + MAX_SNAPSHOT_REVIEW_SECONDS,
                                    _request_sent=lambda: sent_times.append(_snapshot_utc_now()))
                                ack_received = _snapshot_utc_now()
                                _need(len(sent_times) == 1
                                      and _installation_snapshot_fds(*_snapshot_channel) == channel_identity,
                                      "off-host output or channel ownership changed")
                                _snapshot_index_ack_value(ack, transfer)
                                fresh_context()
                                offhost_raw = _snapshot_offhost_record_bytes(transfer, ack, record, payload, receipt,
                                    intent, writers, installation_id, request_sent_at=sent_times[0], reply_received_at=ack_received)
                                confirmed = persist_offhost(offhost_raw)
                                fresh_context()
                                materials = _snapshot_recovery_material_review(_json(index), payload, receipt,
                                    intent, writers, installation_id, fetch=fetch)
                                fresh_context()
                                confirmed_result = {**reviewed, **saved, **confirmed, "recoveryMaterialReview": materials,
                                    "outcome": "OFFHOST_INDEX_CONFIRMED"}
                                if _write_tools:
                                    plan, targets = _installation_tool_write_set(kit, review["sourceSha"], old,
                                        review["currentRuntimeSourceSha"], before[0][0], fetch=fetch)
                                    fresh_context()
                                    _need(callable(frozen_local_recheck), "tool writes lack this owned frozen context")
                                    with _installation_tool_directories(before[0][1]) as directories:
                                        names = {parts: set(os.listdir(fd)) for parts, fd in directories.items()}
                                        _need(all(not any(name.startswith(".sanq-install-") for name in members)
                                                  for members in names.values()), "installation has pending tool files")
                                        tool_progress = {"original": before[0], "plan": plan, "targets": targets,
                                            "names": names, "completed": {}, "active": None}
                                        deadline = time.monotonic() + 300
                                        def write_context():
                                            check_owned()
                                            frozen_local_recheck()
                                            _recovery_private_matches(folders, capture)
                                            _recovery_retention_matches(folders, capture)
                                            check_owned()
                                        write_context()
                                        for row in plan["operations"]:
                                            path = row["path"]
                                            parts = Path(path).parts
                                            parent = directories[parts[:-1]]
                                            tool_progress["active"] = path
                                            prior = before[0][0].get(path)
                                            written = _write_installation_tool_member(parent, path,
                                                prior[0] if prior is not None else None, targets[path],
                                                expected_identity=prior[1] if prior is not None else None,
                                                parent_identity=_directory_identity(os.fstat(parent)),
                                                check_context=write_context, deadline=deadline)
                                            tool_progress["completed"][path] = (tuple(written["identity"])
                                                if written["changed"] else prior[1])
                                            tool_progress["active"] = None
                                            write_context()
                                        files = _installation_tool_progress_check(tool_progress)
                                        _need(set(files) == set(INSTALL_TOOL_PATHS), "installation tool write set is incomplete")
                                    fresh_context()
                                    tool_result = {**confirmed_result, "outcome": "TOOL_FILES_WRITTEN_FENCED", "toolFilesWritten": True,
                                        "toolWriteSetSha256": plan["writeSetSha256"], "toolFiles": files,
                                        "snapshotMaterialsConfirmed": True, "restoreValidationDeferred": True,
                                        "restoreProven": False, "permanentGatesLoaded": False,
                                        "installationComplete": False, "recoveryReady": False, "canExecute": False}
                                    if _handover_gates:
                                        gate_handover = _installation_gate_handover_begin()
                                        deadline = time.monotonic() + 300
                                        write_context()
                                        for unit in DROPINS:
                                            gate_handover["active"] = unit
                                            written = _replace_installation_permanent_gate(unit, gate_handover,
                                                check_context=write_context, deadline=deadline)
                                            gate_handover["completed"][unit] = written
                                            gate_handover["active"] = None
                                            write_context()
                                        _installation_daemon_reload(deadline=deadline)
                                        gate_handover["reloaded"] = True
                                        write_context()
                                        fresh_context()
                                        gate_result = {**tool_result, "outcome": "PERMANENT_GATES_LOADED_FENCED",
                                            "permanentGatesLoaded": True, "permanentGatePropertiesObserved": True,
                                            "permanentGateFiles": _installation_handover_gate_files(gate_handover),
                                            "permanentGatePropertiesSha256": gate_handover["effectivePropertiesSha256"],
                                            "permanentGateApiVerified": False, "requiresInstalledGateApiVerification": True,
                                            "requiresApplicationVerification": True}
                                        if _verify_gate_api:
                                            report = _installation_gate_api_observation(intent, installation_id,
                                                check_context=write_context, deadline=deadline)
                                            fresh_context()
                                            api_result = {**gate_result, "outcome": "PERMANENT_GATE_API_VERIFIED_FENCED",
                                                "permanentGateApiVerified": True, "startupDenialObserved": True,
                                                "installedToolPermissionsRechecked": True, "permanentGateApiReport": report,
                                                "requiresInstalledGateApiVerification": False}
                                            if _verify_application:
                                                application_progress.update({"intent": intent, "writers": writers,
                                                    "identity": installation_id, "docker": before[2], "started": {},
                                                    "requireHealthy": False, "attempted": False, "containmentAttempted": False,
                                                    "binding": None, "health": {}, "restoredPolicies": set()})
                                                deadline = time.monotonic() + 300
                                                application = _start_saved_installation_application(application_progress,
                                                    run=run, check_context=write_context,
                                                    bind_application=lambda: _installation_restarted_binding(before[2], before[6], run),
                                                    deadline=deadline)
                                                fresh_context()
                                                if _restore_policies:
                                                    deadline = time.monotonic() + 300
                                                    policies = _restore_saved_installation_policies(application_progress,
                                                        run=run, check_context=write_context, deadline=deadline)
                                                    fresh_context()
                                                    facts = {**api_result, **application, **policies}
                                                    if complete_installation is not None:
                                                        completion_deadline = time.monotonic() + 300
                                                        def completion_context():
                                                            _need(time.monotonic() < completion_deadline, "completion deadline expired")
                                                            fresh_context()
                                                            _need(time.monotonic() < completion_deadline, "completion context deadline expired")
                                                        completed = complete_installation(facts, completion_context, completion_deadline)
                                                        return {**facts, **completed}
                                                    return facts
                                                return {**api_result, **application}
                                            return api_result
                                        return gate_result
                                    return tool_result
                                return confirmed_result
                            return {**reviewed, **saved, "outcome": "SNAPSHOT_REVIEW_RETAINED"}
                        return reviewed
                    return {"outcome": "SNAPSHOT_EVIDENCE_RECEIVED_UNVERIFIED",
                        "requestSha256": _hash(_json(request)), "replySha256": _hash(response),
                        "evidenceSha256": _hash(_json(value["evidence"])), "replyBytes": len(response),
                        "unverifiedEvidenceReceived": True, "snapshotEvidenceValidated": False,
                        "snapshotAvailable": False, "recoveryReady": False, "canExecute": False,
                        "requiresSnapshotValidation": True, "requiresHostRecheck": True}
                except BaseException:
                    raise release.ReleaseContractError("FENCE_UNCONFIRMED: review snapshot input and retained installation evidence") from None
            with _installation_application_ownership(application_progress):
                result["installationIntent"] = _write_installation_intent_locked(
                    folders, identity, result, recheck=recheck, load_gates=load_gates if _load_deny_gates else None,
                    save_writers=save_writers if _save_writers else None,
                    freeze_writers=freeze_writers if _freeze_writers else None,
                    retain_recovery=retain_recovery if _retain_recovery else None,
                    recovery_namespace=capture[1]["privateNamespace"] if _retain_recovery else None,
                    snapshot_review=review_snapshot if _snapshot_channel is not None else None,
                    retain_snapshot_review=_retain_snapshot_review, confirm_offhost_index=_confirm_offhost_index,
                    complete_installation=_complete_installation, task_source_sha=_task_source_sha,
                    task_source_check=source_check)
            if _write_tools:
                result["observationTiming"] = "PRE_INSTALLATION_INTENT"
            if _verify_application:
                result["installationIntent"].update(writersFrozen=False,
                    writersRestartInhibited=result["installationIntent"]["snapshotReview"]["writersRestartInhibited"])
                if _restore_policies:
                    result["installationIntent"]["restartPoliciesRestored"] = True
                result["installationIntent"]["frozenWriters"]["observationTiming"] = "PRE_APPLICATION_RESTART"
            if _complete_installation:
                result["installationComplete"] = True
                result["installationIntent"].update(installationComplete=True, maintenanceMarkerCleared=True,
                    startupFenceConfirmed=False)
                result["installationIntent"]["temporaryGates"]["observationTiming"] = "PRE_PERMANENT_GATE_HANDOVER"
            result["outcome"] = ("INSTALLATION_COMPLETE" if _complete_installation else
                                 "INSTALLATION_RESTART_POLICIES_RESTORED_MAINTENANCE_ACTIVE" if _restore_policies else
                                 "INSTALLATION_OLD_APPLICATION_READY_RESTART_INHIBITED" if _verify_application else
                                 "INSTALLATION_PERMANENT_GATE_API_VERIFIED_FENCED" if _verify_gate_api else
                                 "INSTALLATION_PERMANENT_GATES_LOADED_FENCED" if _handover_gates else
                                 "INSTALLATION_TOOL_FILES_WRITTEN_FENCED" if _write_tools else
                                 "INSTALLATION_OFFHOST_INDEX_CONFIRMED" if _confirm_offhost_index else
                                 "INSTALLATION_SNAPSHOT_REVIEW_RETAINED" if _retain_snapshot_review else
                                 "INSTALLATION_SNAPSHOT_CONTENT_VALIDATED" if target is not None and _snapshot_channel is not None else
                                 "INSTALLATION_SNAPSHOT_EVIDENCE_RECEIVED" if _snapshot_channel is not None else
                                 "INSTALLATION_TARGET_STORAGE_RETAINED" if target is not None and _retain_recovery else
                                 "INSTALLATION_RECOVERY_FILES_RETAINED" if _retain_recovery else
                                 "INSTALLATION_WRITERS_FROZEN" if _freeze_writers else
                                 "INSTALLATION_WRITERS_SAVED" if _save_writers else
                                 "TEMPORARY_DENY_GATES_LOADED" if _load_deny_gates else "INSTALLATION_INTENT_RECORDED")
            if target is not None:
                result["snapshotStorageBoundToIntent"] = True
        if source_check is not None:
            source_check()
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
        application = _installation_configuration_value({name: row[0] for name, row in files.items()})
        return files, {**application, "ubuntuUid": account.pw_uid, "ubuntuGid": account.pw_gid}


def _installation_configuration_value(files):
    env = files[".env"]
    _need(b"\0" not in env and b"\r" not in env.replace(b"\r\n", b""),
          "installation environment contains ambiguous line encoding")
    text = env.decode("utf-8")
    assignments = re.findall(r"(?m)^[ \t]*(?:export[ \t]+)?SANQ_IMAGE_SHA[ \t]*=", text)
    values = re.findall(r"(?m)^SANQ_IMAGE_SHA=([^\r\n]*)\r?$", text)
    _need(len(assignments) == len(values) == 1, "installation environment SHA assignment is ambiguous")
    application = release.require_sha(values[0])
    raw_state = files[".sanq-release-state.json"]
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
    _need(files[".sanq-backup-layout-activated"].decode("utf-8").strip() == "SANQ_BACKUP_LAYOUT_C4_V1",
          "installation C4 activation marker differs")
    return {"applicationSha": application, "previousApplicationSha": state["previous"],
            "releaseStatePhase": state["phase"]}


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


def _bounded_host_client(args, *, deadline, _writer=None, _installation_gate_api=False, _application_start=None, _policy_restore=None):
    if _policy_restore is not None:
        _need(type(_policy_restore) is tuple and len(_policy_restore) == 4
              and _writer is None and _installation_gate_api is False and _application_start is None
              and args == _saved_restart_policy_args(*_policy_restore), "unreviewed saved restart policy command")
    if _application_start is not None:
        _need(type(_application_start) is tuple and len(_application_start) == 4
              and _writer is None and _installation_gate_api is False
              and args == _saved_application_start_args(*_application_start), "unreviewed saved application start command")
    _need(type(_installation_gate_api) is bool and (not _installation_gate_api
          or (args == list(INSTALL_GATE_API_ARGS) and _writer is None)),
          "unreviewed installed gate API command")
    if _writer is not None:
        _need(type(_writer) is tuple and len(_writer) == 5
              and args == _saved_writer_args(*_writer), "unreviewed installation writer command")
    _need(os.geteuid() == 0 and (_docker_allowed(args) or _systemd_allowed(args) or _installation_task_show_allowed(args)
          or _runtime_observation_allowed(args) or args == [*SYSTEMCTL, "daemon-reload"]
          or _writer is not None or _installation_gate_api or _application_start is not None or _policy_restore is not None),
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
    if tuple(args) in (PYTHON_ARGS, INSTALL_BLOCK_ARGS) or any(tuple(args) == (*CURL_ARGS, url) for url in READINESS_URLS):
        return True
    position = len(DOCKER) + 1
    if len(args) == len(DOCKER) + 8 and re.fullmatch(r"[a-f0-9]{64}", args[position]):
        return args == _installation_inventory_args(args[position])
    return (len(args) == len(DOCKER) + 7 and re.fullmatch(r"[a-f0-9]{64}", args[position]) is not None
            and args in (_installation_history_args(args[position]), _installation_storage_args(args[position])))


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


def _installation_database_history_value(database):
    """Validate fixed read-only identity/history JSON; shared by live and retained observations."""
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
    return database


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
    database = _installation_database_history_value(_docker_json(_installation_history_args(identifier), run))
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
    _need(name in ("intent.json", "active.json", "writers.json", INSTALL_COMPLETION_FILE), "unreviewed installation record name")
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
    _need(os.geteuid() == 0 and name in ("intent.json", "active.json", "writers.json", INSTALL_COMPLETION_FILE),
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
                _need(owned_records is None or set(owned_records) <= {"writers.json", "recovery", SNAPSHOT_REVIEW_FILE, SNAPSHOT_OFFHOST_FILE, INSTALL_COMPLETION_FILE, INSTALL_TASK_ORIGINALS_FILE},
                      "unreviewed owned installation records")
                recovery = (owned_records or {}).get("recovery")
                _need(recovery is None or set(recovery[0]) == RECOVERY_FILES, "incomplete owned recovery pair")
                _installation_owned_run(fd, owned_identity, saved_writers=(owned_records or {}).get("writers.json"),
                                        recovery=recovery, snapshot_review=(owned_records or {}).get(SNAPSHOT_REVIEW_FILE),
                                        snapshot_offhost=(owned_records or {}).get(SNAPSHOT_OFFHOST_FILE),
                                        completion=(owned_records or {}).get(INSTALL_COMPLETION_FILE),
                                        task_handoff=(owned_records or {}).get(INSTALL_TASK_ORIGINALS_FILE))
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



def _installation_owned_run(namespace, identity, *, saved_writers=None, recovery=None, snapshot_review=None, snapshot_offhost=None, completion=None, task_handoff=None):
    _need(saved_writers is None or type(saved_writers) is bytes, "invalid owned writer record proof")
    _need(set(os.listdir(namespace)) == {identity}, "installation transaction inventory changed")
    with _private_directory(namespace, identity) as root:
        expected = {"intent.json"} | ({"writers.json"} if saved_writers is not None else set())
        _need(task_handoff is None or saved_writers is not None and type(task_handoff) is tuple
              and len(task_handoff) == 3 and type(task_handoff[0]) is dict
              and type(task_handoff[1]) is bytes and type(task_handoff[2]) is tuple
              and len(task_handoff[2]) == 9 and all(type(v) is int for v in task_handoff[2]),
              "invalid owned task handoff proof")
        if task_handoff is not None:
            expected.add(INSTALL_TASK_ORIGINALS_FILE)
        _need(recovery is None or saved_writers is not None and type(recovery) is tuple and len(recovery) == 2,
              "invalid owned recovery proof")
        if recovery is not None:
            expected.add("recovery")
        _need(snapshot_review is None or type(snapshot_review) is bytes and recovery is not None
              and set(recovery[0]) == RECOVERY_FILES, "snapshot review requires the original complete recovery pair")
        if snapshot_review is not None:
            expected.add(SNAPSHOT_REVIEW_FILE)
        _need(snapshot_offhost is None or type(snapshot_offhost) is bytes and snapshot_review is not None,
              "off-host confirmation requires the original snapshot review")
        if snapshot_offhost is not None:
            expected.add(SNAPSHOT_OFFHOST_FILE)
        _need(completion is None or type(completion) is bytes and snapshot_offhost is not None,
              "completion requires this owned off-host record")
        if completion is not None:
            expected.add(INSTALL_COMPLETION_FILE)
        _need(set(os.listdir(root)) == expected, "unexpected installation transaction members")
        intent = _installation_record_read(root, "intent.json", identity)
        if saved_writers is not None:
            actual = _installation_record_read(root, "writers.json", identity)
            _need(actual == saved_writers, "owned saved writer bytes changed")
            _installation_writers_match(intent, actual, identity)
        if task_handoff is not None:
            context, raw, fingerprint = task_handoff
            observed, actual_fingerprint = _installation_task_handoff_read(root, context, intent, saved_writers, identity)
            _need(observed == raw and actual_fingerprint == fingerprint,
                  "original owned task handoff bytes or identity changed")
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
        if snapshot_review is not None:
            _need(_snapshot_review_read(root) == snapshot_review, "owned snapshot review bytes changed")
            _snapshot_review_value(snapshot_review, recovery[0]["recovery.tar"], recovery[0]["recovery.json"],
                                   intent, saved_writers, identity)
        if snapshot_offhost is not None:
            _need(_snapshot_offhost_record_read(root) == snapshot_offhost, "owned off-host confirmation bytes changed")
            _snapshot_offhost_record_value(snapshot_offhost, snapshot_review, recovery[0]["recovery.tar"],
                recovery[0]["recovery.json"], intent, saved_writers, identity)
        if completion is not None:
            _need(_installation_record_read(root, INSTALL_COMPLETION_FILE, identity) == completion,
                  "owned completion bytes changed")
            value = _installation_completion_value(completion, identity)
            inputs = (intent, saved_writers, recovery[0]["recovery.tar"], recovery[0]["recovery.json"],
                      snapshot_review, snapshot_offhost, _installation_marker_bytes(intent, identity))
            _need(all(value[key] == _hash(content) for key, content in zip(INSTALL_COMPLETION_DIGESTS[:-1], inputs)),
                  "completion audit no longer binds original owned records")
        return intent


def _write_installation_intent_locked(folders, retention_id, observation, *, recheck, load_gates=None, save_writers=None, freeze_writers=None, retain_recovery=None, recovery_namespace=None, snapshot_review=None, retain_snapshot_review=False, confirm_offhost_index=False, complete_installation=False, task_source_sha=None, task_source_check=None):
    """Private observer continuation only; no CLI or externally imported approval."""
    _need(os.geteuid() == 0, "installation intent requires root")
    _need(snapshot_review is None or retain_recovery is not None, "snapshot wait requires recovery persistence")
    _need(type(retain_snapshot_review) is bool and (not retain_snapshot_review or snapshot_review is not None),
          "snapshot review retention requires the live owned continuation")
    _need(type(confirm_offhost_index) is bool and (not confirm_offhost_index or retain_snapshot_review),
          "off-host confirmation requires this live snapshot review")
    _need(type(complete_installation) is bool and (not complete_installation or confirm_offhost_index),
          "installation completion requires this owned off-host continuation")
    _need((retain_recovery is None) == (recovery_namespace is None),
          "recovery continuation requires original private namespace facts")
    if recovery_namespace is not None:
        _need(_recovery_namespace_snapshot(folders) == recovery_namespace,
              "recovery private namespace changed before intent")
    _need(task_source_sha is None or save_writers is not None and type(task_source_sha) is str
          and release.require_sha(task_source_sha) == observation["sourceSha"],
          "task handoff requires exact observed source and saved writers")
    _need(task_source_sha is None and task_source_check is None
          or task_source_sha is not None and callable(task_source_check),
          "supervised installation requires the live bound source check")
    task_context = None
    if task_source_sha is not None:
        task_source_check()
        task_context = _installation_task_context(task_source_sha, retention_id, "run",
            deadline=time.monotonic() + 30)
        _need(type(task_context) is dict and task_context.get("managerContextObserved") is True
              and task_context.get("sourceSha") == task_source_sha
              and task_context.get("retentionId") == retention_id and task_context.get("role") == "run",
              "installation task run context unavailable")
        task_source_check()
    def task_check():
        if task_context is not None:
            task_source_check()
            current = _installation_task_context(task_source_sha, retention_id, "run",
                deadline=time.monotonic() + 30)
            _need(current == task_context, "installation task manager generation changed")
            task_source_check()
        return task_context
    original_recheck = recheck
    def guarded_recheck():
        task_check()
        original_recheck()
        task_check()
    recheck = guarded_recheck
    identity = os.urandom(32).hex()
    gate_result = saved_result = frozen_result = recovery_result = snapshot_result = task_result = None
    owned_records = {}
    marker_cleared = False
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
                    marker_identity = _installed_fingerprint(os.stat("active.json", dir_fd=folders["maintenance"], follow_symlinks=False))
                    def check_owned():
                        task_check()
                        state_matches()
                        current_state = os.stat("deploy-state", dir_fd=anchor, follow_symlinks=False)
                        _private_info(current_state, directory=True)
                        _need(_directory_identity(current_state) == _directory_identity(os.fstat(state)),
                              "owned installation state directory replaced")
                        _material_jobs_idle(folders)
                        _need(_installation_owned_run(namespace, identity, saved_writers=owned_records.get("writers.json"),
                                                       recovery=owned_records.get("recovery"),
                                                       snapshot_review=owned_records.get(SNAPSHOT_REVIEW_FILE),
                                                       snapshot_offhost=owned_records.get(SNAPSHOT_OFFHOST_FILE),
                                                       completion=owned_records.get(INSTALL_COMPLETION_FILE),
                                                       task_handoff=owned_records.get(INSTALL_TASK_ORIGINALS_FILE)) == raw
                              and (not os.listdir(folders["maintenance"]) if marker_cleared else
                                   set(os.listdir(folders["maintenance"])) == {"active.json"}
                                   and _installation_record_read(folders["maintenance"], "active.json", identity) == marker
                                   and _installed_fingerprint(os.stat("active.json", dir_fd=folders["maintenance"], follow_symlinks=False)) == marker_identity)
                              and _directory_identity(os.fstat(root)) == initial
                              == _directory_identity(os.stat(identity, dir_fd=namespace, follow_symlinks=False)),
                              "owned installation intent or marker changed")
                        current_namespace = os.stat(INSTALLATION_RUNS, dir_fd=state, follow_symlinks=False)
                        _private_info(current_namespace, directory=True)
                        _need(_directory_identity(current_namespace) == _directory_identity(os.fstat(namespace)),
                              "owned installation namespace replaced")
                        task_check()
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
                        if task_context is not None:
                            task_result = _persist_owned_installation_task_handoff(root, task_check(), raw,
                                owned_records["writers.json"], identity, owned_records, check_owned=check_owned)
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
                    if snapshot_review is not None:
                        _need(recovery_result is not None and recovery_result["recoveryArchiveDurable"] is True
                              and recovery_result["scopeReview"]["packageScopeReviewed"] is True,
                              "snapshot wait requires this durable reviewed recovery pair")
                        check_owned()
                        records = owned_records["recovery"][0]
                        if retain_snapshot_review:
                            def persist_snapshot(review_raw):
                                check_owned()
                                _need(SNAPSHOT_REVIEW_FILE not in owned_records, "snapshot review is already owned")
                                _snapshot_review_value(review_raw, records["recovery.tar"], records["recovery.json"],
                                                       raw, owned_records["writers.json"], identity)
                                _snapshot_review_write(root, review_raw)
                                owned_records[SNAPSHOT_REVIEW_FILE] = review_raw
                                check_owned()
                                index = _snapshot_offhost_index(review_raw, records["recovery.tar"], records["recovery.json"],
                                                               raw, owned_records["writers.json"], identity)
                                return {"snapshotReviewDurable": True, "snapshotReviewSha256": _hash(review_raw),
                                    "snapshotReviewBytes": len(review_raw), "requiresDurableSnapshotReceipt": False,
                                    "offHostIndexGenerated": True, "offHostIndex": index,
                                    "offHostIndexSha256": _hash(_json(index)), "offHostIndexBytes": len(_json(index)),
                                    "offHostRetentionConfirmed": False, "requiresOffHostRetention": True,
                                    "snapshotAvailable": False, "recoveryReady": False, "canExecute": False}
                            def persist_offhost(offhost_raw):
                                check_owned()
                                _need(SNAPSHOT_REVIEW_FILE in owned_records and SNAPSHOT_OFFHOST_FILE not in owned_records,
                                      "off-host confirmation requires this round's unique durable review")
                                _snapshot_offhost_record_value(offhost_raw, owned_records[SNAPSHOT_REVIEW_FILE],
                                    records["recovery.tar"], records["recovery.json"], raw, owned_records["writers.json"], identity)
                                _snapshot_offhost_record_write(root, offhost_raw)
                                owned_records[SNAPSHOT_OFFHOST_FILE] = offhost_raw
                                check_owned()
                                return {"offHostReceiptDurable": True, "offHostReceiptSha256": _hash(offhost_raw),
                                    "offHostReceiptBytes": len(offhost_raw), "offHostRetentionConfirmed": True,
                                    "requiresOffHostRetention": False,
                                    "offHostVerificationMethod": "operator-ssh-peer-durable-receipt",
                                    "offHostLocationIndependentlyAuthenticated": False,
                                    "snapshotAvailable": False, "recoveryReady": False, "canExecute": False,
                                    "requiresRecoveryValidation": True, "requiresHostRecheck": True}
                            def finish_installation(facts, check_context, deadline):
                                nonlocal marker_cleared
                                check_owned()
                                _need(complete_installation and not marker_cleared
                                      and INSTALL_COMPLETION_FILE not in owned_records, "completion cannot replay")
                                check_context()
                                completed = _installation_completion_bytes(raw, owned_records["writers.json"], identity,
                                    owned_records["recovery"], owned_records[SNAPSHOT_REVIEW_FILE],
                                    owned_records[SNAPSHOT_OFFHOST_FILE], facts)
                                disk = os.fstatvfs(root)
                                _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + len(completed),
                                      "insufficient completion storage reserve")
                                _installation_record_write(root, INSTALL_COMPLETION_FILE, completed, identity)
                                owned_records[INSTALL_COMPLETION_FILE] = completed
                                check_context()
                                def cleared():
                                    nonlocal marker_cleared
                                    marker_cleared = True
                                _clear_owned_installation_marker(folders["maintenance"], raw, identity,
                                    check_context=check_context, mark_cleared=cleared, deadline=deadline,
                                    expected_identity=marker_identity)
                                _need(marker_cleared and not os.listdir(folders["maintenance"]), "final marker was not cleared")
                                check_owned()
                                return {"outcome": "INSTALLATION_COMPLETE", "completionRecordDurable": True,
                                    "completionRecordSha256": _hash(completed), "maintenanceMarkerCleared": True,
                                    "installationComplete": True, "requiresInstallationCompletion": False,
                                    "canExecute": False, "restoreProven": False, "recoveryReady": False}
                            continuation = {"persist_snapshot": persist_snapshot}
                            if complete_installation:
                                continuation["complete_installation"] = finish_installation
                            if confirm_offhost_index:
                                continuation["persist_offhost"] = persist_offhost
                            snapshot_result = snapshot_review(check_owned, raw, owned_records["writers.json"], identity,
                                records["recovery.tar"], records["recovery.json"], **continuation)
                        else:
                            snapshot_result = snapshot_review(check_owned, raw, owned_records["writers.json"], identity,
                                records["recovery.tar"], records["recovery.json"])
                        check_owned()
                state_matches()
            _need((not os.listdir(folders["maintenance"]) if marker_cleared else
                   _installation_record_read(folders["maintenance"], "active.json", identity) == marker),
                  "installation marker changed after namespace validation")
            task_check()
            return {"installationId": identity, "intentSha256": _hash(raw), "markerSha256": _hash(marker),
                    "canExecute": False, "startupFenceConfirmed": gate_result is not None, "writersFrozen": frozen_result is not None,
                    "requiresHostRecheck": True, **({"temporaryGates": gate_result} if gate_result is not None else {}),
                    **({"savedWriters": saved_result} if saved_result is not None else {}),
                    **({"taskHandoff": task_result} if task_result is not None else {}),
                    **({"frozenWriters": frozen_result} if frozen_result is not None else {}),
                    **({"recoveryFiles": recovery_result} if recovery_result is not None else {}),
                    **({"snapshotReview": snapshot_result} if snapshot_result is not None else {})}
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



def _temporary_gate_systemd_parity(baseline, run, files, *, _handover=None):
    """Compare original manager/disk facts, allowing only this write's deny gates."""
    if _handover is None:
        _need(_verify_temporary_gates(run)["files"] == files, "temporary loaded gates changed")
    else:
        _need(_handover["original"] == files, "handover lost original temporary gates")
        files = _installation_handover_gate_files(_handover)
    def normalized(args):
        raw = run(args)
        _need(isinstance(raw, str) and len(raw.encode("utf-8")) <= 65536, "manager parity output exceeds budget")
        unit = args[3]
        if _handover is not None and unit in DROPINS:
            _handover["effectivePropertiesSha256"][unit] = _hash(raw.encode("utf-8"))
        lines = []
        for line in raw.splitlines():
            key, sep, value = line.partition("=")
            if unit in INSTALL_DENY_DROPINS and key == "DropInPaths":
                expected = "/etc/systemd/system/" + unit + ".d/" + INSTALL_GATE_NAME
                _need(sep == "=" and value.split() == [expected], "loaded deny path changed")
                line = "DropInPaths="
            elif _handover is not None and unit in DROPINS and key == "NeedDaemonReload":
                _need(sep == "=" and value in ("no", "yes")
                      and (not _handover["reloaded"] or value == "no"), "handover manager reload is unresolved")
                line = "NeedDaemonReload=no"
            elif unit in ("docker.service", "sanq-backup.service") and key == "ExecStartPre":
                _need(_installation_loaded_gate_command(value, _handover), "loaded denial changed")
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
                    _need((_temporary_gate_read(directory, unit) if _handover is None else
                           _installation_handover_gate_read(directory, unit, _handover)) == files[unit],
                          "owned gate identity changed")
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
    _need((_temporary_gate_files() if _handover is None else _installation_handover_gate_files(_handover)) == files,
          "owned gate files changed after manager parity")
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
    _need(name in ("intent.json", "active.json", "writers.json", INSTALL_COMPLETION_FILE), "unreviewed installation record")
    return (_installation_completion_value(raw, identity) if name == INSTALL_COMPLETION_FILE else
            _installation_writers_value(raw, identity) if name == "writers.json" else
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


def _installation_writer_observation(value, docker, run, disabled, stopped, *, _allow_starting=False):
    _need(type(_allow_starting) is bool, "invalid saved application health mode")
    health = {}
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
                  and type(state.get("Health")) is dict and state["Health"].get("Status") in (
                       ("starting", "healthy") if _allow_starting and role in INSTALL_WRITER_ROLES else ("healthy",)),
                  "saved running container is not steadily healthy")
            health[role] = state["Health"]["Status"]
    return health


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
    _need(type(capture) is tuple and len(capture) in (2, 3, 4)
          and type(capture[0]) is dict and type(capture[1]) is dict, "invalid recovery source capture")
    files, summary = capture[:2]
    recorded = _installation_record_value(intent, identity)
    saved = _installation_writers_match(intent, writers, identity)
    _recovery_namespace_value(summary.get("privateNamespace"))
    _need(summary.get("scope") == ("pre-install-files-host-and-target-storage" if len(capture) == 4 else
                                      "pre-install-files-and-host-observations" if len(capture) == 3
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
          and len(files) + 3 + (len(capture) >= 3) + (len(capture) == 4) <= MAX_RECOVERY_MEMBERS,
          "recovery fixed inventory differs")
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
    if len(capture) >= 3:
        raw = capture[2]
        host = _installation_recovery_host_value(raw, saved)
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
    if len(capture) == 4:
        raw = capture[3]
        reviewed = _installation_recovery_storage_value(raw, host["docker"], recorded)
        _need(summary.get("snapshotStorage") == {
              "member": RECOVERY_STORAGE_MEMBER, "sha256": _hash(raw), "bytes": len(raw),
              "preGate": True, "observationSha256": reviewed["observationSha256"]}
              and type(summary["snapshotStorage"]["bytes"]) is int
              and summary["snapshotStorage"]["preGate"] is True
              and total + len(capture[2]) + len(raw) <= MAX_RECOVERY_SOURCE_BYTES,
              "recovery target storage metadata or shared budget differs")
        host_entries[RECOVERY_STORAGE_MEMBER] = raw
    else:
        _need("snapshotStorage" not in summary, "recovery target storage originals are missing")
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



def _installation_recovery_members(payload):
    """Bounded in-memory reading only; never unpack paths or execute archived commands."""
    _need(type(payload) is bytes and 0 < len(payload) <= MAX_RECOVERY_ARCHIVE_BYTES,
          "recovery scope archive exceeds budget")
    members, total = {}, 0
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
            for member in archive:
                _need(len(members) < MAX_RECOVERY_MEMBERS and member.name not in members
                      and member.type == tarfile.REGTYPE and 0 < member.size <= MAX_RECOVERY_SOURCE_BYTES,
                      "invalid recovery scope member")
                total += member.size
                _need(total <= MAX_RECOVERY_ARCHIVE_BYTES, "recovery scope bytes exceed budget")
                stream = archive.extractfile(member)
                _need(stream is not None, "unreadable recovery scope member")
                raw = stream.read(member.size + 1)
                stream.close()
                _need(len(raw) == member.size, "truncated recovery scope member")
                members[member.name] = raw
    except (tarfile.TarError, ValueError, UnicodeError, OSError, EOFError):
        raise release.ReleaseContractError("invalid recovery scope archive") from None
    return members


def _installation_recovery_scope(payload, receipt, intent, writers, identity, *, fetch, require_target_storage=False):
    """Audit retained bytes and replay observations as data. No host or AWS commands."""
    _need(type(require_target_storage) is bool, "invalid recovery target storage requirement")
    try:
        members = _installation_recovery_members(payload)
        index = _installation_recovery_index(payload, intent, writers, identity)
        summary = index["capture"]
        files = {name[len("originals"):]: raw for name, raw in members.items() if name.startswith("originals/")}
        _need(RECOVERY_HOST_MEMBER in members, "recovery scope lacks original host observations")
        _need(not require_target_storage or RECOVERY_STORAGE_MEMBER in members,
              "recovery scope lacks required target storage originals")
        capture = files, summary, members[RECOVERY_HOST_MEMBER]
        if RECOVERY_STORAGE_MEMBER in members:
            capture = (*capture, members[RECOVERY_STORAGE_MEMBER])
        entries = _installation_recovery_entries(capture, intent, writers, identity)
        _installation_recovery_verify(payload, entries)
        _installation_recovery_receipt_value(receipt, payload, intent, writers, identity)
        recorded = _installation_record_value(intent, identity)
        saved = _installation_writers_match(intent, writers, identity)
        groups = {}
        for directory in summary["retainedMaterialDirectories"]:
            raw = {name: files[directory + "/" + name] for name in PRIVATE_FILES}
            value = json.loads(raw["retained.json"], object_pairs_hook=_unique)
            _need(type(value) is dict, "invalid recovery scope material record")
            expected = _retention_record(raw["delivery-kit.tar.gz"], value["sourceSha"],
                raw["current-runtime-archive.tar.gz"], value["currentArchiveSourceSha"], complete=True)
            _need(expected["retentionId"] == directory.rsplit("/", 1)[1]
                  and raw["retained.json"] == _json(expected)
                  and raw["retaining.json"] == _json({**expected, "phase": "RETAINING"}),
                  "recovery scope historical material binding differs")
            groups[expected["retentionId"]] = raw, expected
        original, material = groups[recorded["retentionId"]]
        _need(material["sourceSha"] == recorded["targetSourceSha"]
              and material["currentArchiveSourceSha"] == recorded["installedRuntimeSourceSha"],
              "recovery scope current material source differs")
        archive_raw = original["current-runtime-archive.tar.gz"]
        manifest, runtime = _runtime_files(archive_raw, material["currentArchiveSourceSha"])
        with tarfile.open(fileobj=io.BytesIO(archive_raw), mode="r:gz") as archive:
            stream = archive.extractfile(bundle.RUNTIME_PREFIX + "/" + bundle.MANIFEST)
            _need(stream is not None, "recovery scope old Manifest missing")
            manifest_raw = stream.read(MAX_FILE + 1)
            stream.close()
        _need(all(files["/opt/sanq/runtime/" + name] == raw for name, raw in runtime.items())
              and files["/opt/sanq/runtime/runtime-release.json"] == manifest_raw,
              "recovery scope old Runtime differs from its retained archive")
        for parts, name, member, _, _ in EXTERNAL_BACKUP_FILES:
            path = "/" + "/".join((*parts, name))
            _need(files[path] == runtime[member], "recovery scope external backup original differs")
        _need(files["/etc/systemd/system/sanq-backup.service"] == runtime["ops/backup/sanq-backup.service"],
              "recovery scope backup service original differs")
        application = _installation_configuration_value(
            {name: files["/opt/sanq/runtime/" + name] for name in CONFIGURATION_NAMES})
        _need(application["applicationSha"] == saved["applicationSha"],
              "recovery scope application state differs")
        host = _installation_recovery_host_value(capture[2], saved)
        rows, position = host["commands"], 0
        pending = {}
        for row in rows:
            pending.setdefault(tuple(row["argv"]), []).append(row["stdout"])
        def replay(args):
            nonlocal position
            observations = pending.get(tuple(args))
            _need(observations, "recovery scope host observation missing")
            position += 1
            return observations.pop(0)
        docker = _docker_snapshot(application, runtime["docker-compose.yml"], replay, fetch)
        _need(docker == host["docker"]
              and _application_binding_snapshot(docker, replay) == host["applicationBinding"]
              and _effective_configuration_snapshot(docker, replay) == host["effectiveConfiguration"],
              "recovery scope host observation content differs")
        units = _systemd_loaded_units(replay)
        systemd = {"units": {unit: {**{key: fields[key] for key in SYSTEMD_KEYS},
                    "effectivePropertiesSha256": _hash(_json(fields))} for unit, fields in units.items()},
            "installedBackupUnits": {name: summary["files"]["/etc/systemd/system/" + name]
                                     for name in ("sanq-backup.service", "sanq-backup.timer")},
            "overrideDirectories": summary["overrideDirectories"],
            "systemdDirectoryIdentity": summary["systemdDirectoryIdentity"],
            "reservedMaintenanceDropinsAbsent": True, "backupTimerSourceAuthenticated": False,
            "vendorUnitBytesAuthenticated": False}
        _need(position == len(rows) and host["systemd"] == systemd,
              "recovery scope loaded properties differ")
        return {"outcome": "RECOVERY_PACKAGE_SCOPE_REVIEWED", "archiveSha256": _hash(payload),
            "receiptSha256": _hash(receipt), "captureSha256": _hash(_json(summary)),
            "originalFiles": len(files), "originalAbsentFiles": len(summary["absentFiles"]),
            "retainedMaterialGroups": len(groups), "hostObservations": len(rows),
            "oldRuntimeMembers": len(runtime), "applicationSha": application["applicationSha"],
            "packageScopeReviewed": True, "snapshotAvailable": False, "recoveryReady": False,
            **({"snapshotTargetStorageReviewed": True,
                "snapshotStorageOriginalsSha256": _hash(capture[3])} if len(capture) == 4 else {}),
            "canExecute": False, "requiresHostRecheck": True}
    except (json.JSONDecodeError, UnicodeError, KeyError, TypeError, ValueError, tarfile.TarError, OSError, EOFError,
            bundle.BundleBlocked):
        raise release.ReleaseContractError("invalid recovery package scope") from None


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



MAX_SNAPSHOT_REVIEW_SECONDS = 1800
MAX_SNAPSHOT_REPLY_BYTES = 64 * 1024


def _recovery_private_matches(folders, capture):
    private = _recovery_private_sources(folders)
    expected = {path: raw for path, raw in capture[0].items()
        if path.startswith(("/opt/sanq/deploy-state/jobs/", "/opt/sanq/deploy-state/plans/"))}
    _need(private[0] == expected and private[2] == capture[1]["originalLockMetadata"]
          and private[3] == capture[1]["privateDirectories"]
          and all(private[1][path] == capture[1]["files"][path]["identity"] for path in private[0]),
          "recovery private originals changed after capture")


def _installation_snapshot_fds(input_fd, output_fd):
    _need(type(input_fd) is int and type(output_fd) is int
          and input_fd >= 0 and output_fd >= 0 and input_fd != output_fd,
          "invalid snapshot review descriptors")
    identities = []
    for fd, access in ((input_fd, (os.O_RDONLY, os.O_RDWR)), (output_fd, (os.O_WRONLY, os.O_RDWR))):
        info, flags = os.fstat(fd), fcntl.fcntl(fd, fcntl.F_GETFL)
        _need((stat.S_ISFIFO(info.st_mode) or stat.S_ISCHR(info.st_mode) and os.isatty(fd))
              and flags & os.O_ACCMODE in access, "snapshot review requires live pipes or terminal")
        identities.append((info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
                           info.st_rdev, flags & os.O_ACCMODE))
    _need(identities[0][:2] != identities[1][:2] or stat.S_ISCHR(identities[0][2]),
          "snapshot review cannot loop back through one pipe")
    return tuple(identities)


def _installation_snapshot_request(payload, receipt, intent, writers, identity):
    _installation_recovery_receipt_value(receipt, payload, intent, writers, identity)
    return {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-evidence-request",
        "installationId": identity, "intentSha256": _hash(intent), "writersSha256": _hash(writers),
        "archiveSha256": _hash(payload), "receiptSha256": _hash(receipt), "challenge": os.urandom(32).hex(),
        "maxWaitSeconds": MAX_SNAPSHOT_REVIEW_SECONDS, "snapshotAvailable": False, "canExecute": False}


def _installation_snapshot_exchange(request, input_fd, output_fd, *, deadline, _request_sent=None, _request_limit=4096):
    """One bounded live frame. Borrow descriptors; never close caller IO or open a path."""
    _installation_snapshot_fds(input_fd, output_fd)
    _need(_request_sent is None or callable(_request_sent), "invalid snapshot output observer")
    now = time.monotonic()
    _need(type(deadline) in (int, float) and now < deadline <= now + MAX_SNAPSHOT_REVIEW_SECONDS,
          "invalid snapshot review deadline")
    raw = _json(request)
    _need(type(_request_limit) is int and _request_limit in (4096, MAX_SNAPSHOT_INDEX_TRANSFER)
          and len(raw) <= _request_limit, "snapshot review request exceeds budget")
    saved_flags = {}
    try:
        for fd in (input_fd, output_fd):
            saved_flags[fd] = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, saved_flags[fd] | os.O_NONBLOCK)
        with selectors.DefaultSelector() as selector:
            selector.register(output_fd, selectors.EVENT_WRITE)
            sent, reply = 0, bytearray()
            while True:
                remaining = deadline - time.monotonic()
                _need(remaining > 0, "snapshot review input timed out")
                events = selector.select(min(1, remaining))
                for key, _ in events:
                    if key.fd == output_fd:
                        try:
                            count = os.write(output_fd, raw[sent:])
                        except BlockingIOError:
                            continue
                        _need(count > 0, "snapshot review output made no progress")
                        sent += count
                        if sent == len(raw):
                            if _request_sent is not None:
                                _request_sent()
                            selector.unregister(output_fd)
                            selector.register(input_fd, selectors.EVENT_READ)
                    else:
                        try:
                            block = os.read(input_fd, min(4096, MAX_SNAPSHOT_REPLY_BYTES + 1 - len(reply)))
                        except BlockingIOError:
                            continue
                        _need(block, "snapshot review channel ended without a reply")
                        reply.extend(block)
                        _need(len(reply) <= MAX_SNAPSHOT_REPLY_BYTES, "snapshot review reply exceeds budget")
                        if b"\n" in reply:
                            _need(reply.count(b"\n") == 1 and reply.endswith(b"\n")
                                  and time.monotonic() < deadline, "invalid snapshot review frame")
                            return bytes(reply)
    except OSError:
        raise release.ReleaseContractError("snapshot review channel IO failed") from None
    finally:
        failed = False
        for fd, flags in saved_flags.items():
            try:
                fcntl.fcntl(fd, fcntl.F_SETFL, flags)
            except OSError:
                failed = True
        _need(not failed, "snapshot review channel flags restoration failed")


def _installation_snapshot_reply_value(raw, request):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_SNAPSHOT_REPLY_BYTES,
          "invalid snapshot evidence frame size")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid snapshot evidence JSON constant"))
        canonical = _json(value)
    except (ValueError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid snapshot evidence JSON") from None
    bound = ("installationId", "intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "challenge")
    _need(type(value) is dict and set(value) == {"schemaVersion", "kind", *bound, "evidence"}
          and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == "sanq-minimal-snapshot-evidence-reply"
          and all(value[key] == request[key] for key in bound)
          and type(value["evidence"]) is dict and bool(value["evidence"])
          and raw == canonical, "snapshot evidence frame binding differs")
    return value


def _receive_installation_snapshot_evidence(retention_id, *, input_fd, output_fd, fetch=release.github_json):
    """Private continuation only. Receipt of unverified evidence never means snapshot available."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True, _freeze_writers=True,
        _retain_recovery=True, _snapshot_channel=(input_fd, output_fd))


# D2 snapshot prerequisites: read-only, before any installation intent or writer mutation.
INSTALL_BLOCK_ARGS = ("/usr/bin/lsblk", "--json", "--bytes", "--paths", "--list",
                      "--output", "NAME,TYPE,MAJ:MIN,PKNAME,SIZE")
INSTALL_DB_DATA = "/var/lib/docker/volumes/sanq-app_pgdata/_data"
INSTALL_DB_DIRECTORIES = ("base", "global", "pg_commit_ts", "pg_dynshmem", "pg_logical", "pg_multixact",
    "pg_notify", "pg_replslot", "pg_serial", "pg_snapshots", "pg_stat", "pg_stat_tmp", "pg_subtrans",
    "pg_tblspc", "pg_twophase", "pg_wal", "pg_xact")
INSTALL_DB_CONFIG = ("postgresql.conf", "pg_hba.conf", "pg_ident.conf", "postgresql.auto.conf")
INSTALL_STORAGE_DIRECTORIES = (
    "/opt/sanq/runtime", "/opt/sanq/deploy-state", "/srv/sanq/uploads", "/srv/sanq/backups",
    "/home/ubuntu/sanq-assets/sounds", "/home/ubuntu", "/etc/systemd/system",
    "/etc/sudoers.d", "/usr/local/sbin", INSTALL_DB_DATA,
    *(INSTALL_DB_DATA + "/" + name for name in INSTALL_DB_DIRECTORIES),
)
INSTALL_STORAGE_SQL = """BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SELECT pg_catalog.json_build_object(
 'database',pg_catalog.current_database(),'port',pg_catalog.current_setting('port'),
 'dataDirectory',pg_catalog.current_setting('data_directory'),
 'transactionReadOnly',pg_catalog.current_setting('transaction_read_only'),
 'inRecovery',pg_catalog.pg_is_in_recovery(),
 'configFile',pg_catalog.current_setting('config_file'),'hbaFile',pg_catalog.current_setting('hba_file'),
 'identFile',pg_catalog.current_setting('ident_file'),
 'tablespaces',(SELECT COALESCE(pg_catalog.json_agg(pg_catalog.json_build_object(
   'oid',oid::text,'name',spcname,'location',pg_catalog.pg_tablespace_location(oid))
   ORDER BY oid),'[]'::json) FROM
   (SELECT oid,spcname FROM pg_catalog.pg_tablespace ORDER BY oid LIMIT 1025) AS t));
COMMIT;"""


def _installation_storage_args(identifier):
    args = _installation_history_args(identifier)
    return [*args[:-2], "sanq-install-storage", INSTALL_STORAGE_SQL]


def _installation_snapshot_target(raw):
    """Operator-reviewed pre-stop input, never an AWS signature or an execution permit."""
    _need(type(raw) is bytes and 0 < len(raw) <= 65536, "invalid pre-snapshot target size")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid target JSON constant"))
        _need(_json(value) == raw, "pre-snapshot target must use canonical original bytes")
    except (ValueError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid pre-snapshot target JSON") from None
    fields = {"schemaVersion", "kind", "accountId", "region", "instanceArn", "instanceName",
              "sshTarget", "sshHostKeySha256", "linuxSystemDisk", "operatorConfirmed", "instance"}
    _need(type(value) is dict and set(value) == fields
          and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == "sanq-minimal-pre-snapshot-target"
          and value["operatorConfirmed"] is True, "pre-snapshot target fields or confirmation differ")
    for key in ("accountId", "region", "instanceArn", "instanceName", "sshTarget",
                "sshHostKeySha256", "linuxSystemDisk"):
        _need(type(value[key]) is str, "invalid pre-snapshot target field type")
    _need(re.fullmatch(r"[0-9]{12}", value["accountId"])
          and re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-[0-9]+", value["region"])
          and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,254}", value["instanceName"])
          and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.@:-]{0,253}", value["sshTarget"])
          and re.fullmatch(r"SHA256:[A-Za-z0-9+/]{43}", value["sshHostKeySha256"])
          and re.fullmatch(r"/dev/[A-Za-z0-9_.-]{1,100}", value["linuxSystemDisk"]),
          "invalid pre-snapshot target identity")
    prefix = "arn:aws:lightsail:" + value["region"] + ":" + value["accountId"] + ":Instance/"
    _need(value["instanceArn"].startswith(prefix)
          and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}",
                           value["instanceArn"][len(prefix):]), "target instance ARN differs")
    instance = value["instance"]
    _need(type(instance) is dict and instance.get("arn") == value["instanceArn"]
          and instance.get("name") == value["instanceName"] and instance.get("resourceType") == "Instance"
          and type(instance.get("location")) is dict
          and instance["location"].get("regionName") == value["region"]
          and type(instance["location"].get("availabilityZone")) is str
          and re.fullmatch(re.escape(value["region"]) + r"[a-z]", instance["location"]["availabilityZone"])
          and type(instance.get("hardware")) is dict
          and type(instance["hardware"].get("disks")) is list and len(instance["hardware"]["disks"]) == 1,
          "operator instance or single-system-disk inventory differs")
    disk = instance["hardware"]["disks"][0]
    _need(type(disk) is dict and disk.get("isSystemDisk") is True and disk.get("isAttached") is True
          and type(disk.get("sizeInGb")) is int and 0 < disk["sizeInGb"] <= 65536
          and type(disk.get("path")) is str and re.fullmatch(r"/dev/[A-Za-z0-9_.-]{1,100}", disk["path"]),
          "operator system disk identity differs")
    _need(("attachedTo" not in disk or disk["attachedTo"] in ("", value["instanceName"]))
          and ("resourceType" not in disk or disk["resourceType"] == "Disk")
          and ("location" not in disk or type(disk["location"]) is dict
               and disk["location"].get("regionName") == value["region"]
               and disk["location"].get("availabilityZone") == instance["location"]["availabilityZone"]),
          "operator disk attachment or location contradicts the instance")
    return {key: value[key] for key in fields - {"instance"}} | {
        "targetInputSha256": _hash(raw), "availabilityZone": instance["location"]["availabilityZone"],
        "cloudSystemDiskPath": disk["path"], "cloudSystemDiskSizeInGb": disk["sizeInGb"],
        "verificationMethod": "operator-aws-session-and-verified-ssh",
        "awsOriginAuthenticated": False}


@contextlib.contextmanager
def _snapshot_directory(root, parts):
    """Only internally fixed components; retain and recheck every traversed directory FD."""
    _need(type(parts) is tuple and bool(parts) and all(
        type(part) is str and part not in ("", ".", "..") and "/" not in part for part in parts),
        "invalid snapshot directory components")
    anchor = os.dup(root)
    current, opened = anchor, []
    try:
        for name in parts:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
            opened.append((current, name, child, _directory_identity(os.fstat(child))))
            info = os.fstat(child)
            _need(stat.S_ISDIR(info.st_mode) and not stat.S_IMODE(info.st_mode) & 0o7022,
                  "snapshot directory type or write permissions differ")
            current = child
        yield current
        for parent, name, fd, identity in reversed(opened):
            _need(_directory_identity(os.fstat(fd)) == identity
                  == _directory_identity(os.stat(name, dir_fd=parent, follow_symlinks=False)),
                  "snapshot directory changed during observation")
    finally:
        for _, _, fd, _ in reversed(opened):
            os.close(fd)
        os.close(anchor)


def _snapshot_hostkey(root, *, _capture=False):
    with _snapshot_directory(root, ("etc", "ssh")) as parent:
        _installed_info(os.fstat(parent), directory=True)
        fd = os.open("ssh_host_ed25519_key.pub", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            before = os.fstat(fd)
            _installed_info(before)
            _need(0 < before.st_size <= 4096, "SSH public host key size differs")
            raw = os.read(fd, 4097)
            _need(len(raw) == before.st_size
                  and _installed_fingerprint(before) == _installed_fingerprint(os.fstat(fd))
                  == _installed_fingerprint(os.stat("ssh_host_ed25519_key.pub", dir_fd=parent, follow_symlinks=False)),
                  "SSH public host key changed")
        finally:
            os.close(fd)
    _need(type(_capture) is bool, "invalid public key capture switch")
    facts = {"sha256": _snapshot_key_fingerprint(raw), "identity": list(_installed_fingerprint(before))}
    return (facts, raw) if _capture else facts


def _snapshot_mountinfo(*, deadline):
    fd = os.open("/proc/self/mountinfo", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        _installed_info(os.fstat(fd))
        chunks, size = [], 0
        while size <= MAX_HOST_OUTPUT:
            _need(time.monotonic() < deadline, "snapshot mount observation timed out")
            raw = os.read(fd, min(65536, MAX_HOST_OUTPUT + 1 - size))
            if not raw:
                break
            chunks.append(raw)
            size += len(raw)
        _need(0 < size <= MAX_HOST_OUTPUT, "snapshot mount inventory exceeds budget")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _snapshot_mounts(raw):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_HOST_OUTPUT, "invalid mount inventory size")
    try:
        lines = raw.decode("utf-8").splitlines()
    except UnicodeError:
        raise release.ReleaseContractError("invalid mount inventory encoding") from None
    _need(0 < len(lines) <= 8192, "mount inventory count exceeds budget")
    result = {}
    def unescape(value):
        _need(re.search(r"\\(?!040|011|012|134)", value) is None, "invalid mount path escape")
        return re.sub(r"\\(040|011|012|134)", lambda m: chr(int(m[1], 8)), value)
    for line in lines:
        fields = line.split(" ")
        _need(fields.count("-") == 1, "mount separator is missing or ambiguous")
        separator = fields.index("-")
        _need(separator >= 6 and len(fields) == separator + 4
              and all(fields) and re.fullmatch(r"[1-9][0-9]*", fields[0])
              and re.fullmatch(r"[0-9]+", fields[1])
              and re.fullmatch(r"[0-9]+:[0-9]+", fields[2])
              and fields[0] not in result, "invalid or duplicate mount identity")
        result[fields[0]] = {"id": fields[0], "device": fields[2], "root": unescape(fields[3]),
            "mountpoint": unescape(fields[4]), "options": fields[5], "filesystem": fields[separator + 1],
            "source": unescape(fields[separator + 2]), "superOptions": fields[separator + 3]}
        _need(result[fields[0]]["mountpoint"].startswith("/"), "mountpoint must be absolute")
    return result


def _snapshot_coverage(mounts, paths):
    roots = [entry for entry in mounts.values() if entry["mountpoint"] == "/"]
    _need(len(roots) == 1 and roots[0]["root"] == "/" and roots[0]["filesystem"] in ("ext4", "xfs")
          and "rw" in roots[0]["options"].split(","), "root filesystem needs platform review")
    root = roots[0]
    for path, identity in paths.items():
        _need(root["device"] == str(os.major(identity[0])) + ":" + str(os.minor(identity[0])),
              "snapshot path filesystem differs from root")
        for entry in mounts.values():
            point = entry["mountpoint"]
            _need(point == "/" or not (path == point or path.startswith(point.rstrip("/") + "/")
                  or point.startswith(path.rstrip("/") + "/")),
                  "snapshot path has a separate, nested or bind mount")
    return root


def _snapshot_block_root(value, root, target):
    _need(type(value) is dict and set(value) == {"blockdevices"}
          and type(value["blockdevices"]) is list and 0 < len(value["blockdevices"]) <= 1024,
          "invalid block inventory")
    rows, names = {}, set()
    for item in value["blockdevices"]:
        _need(type(item) is dict and set(item) == {"name", "type", "maj:min", "pkname", "size"}
              and type(item["name"]) is str and re.fullmatch(r"/dev/[A-Za-z0-9_.-]{1,100}", item["name"])
              and type(item["type"]) is str and bool(item["type"])
              and type(item["maj:min"]) is str and re.fullmatch(r"[0-9]+:[0-9]+", item["maj:min"])
              and item["maj:min"] not in rows and item["name"] not in names
              and type(item["size"]) is int and item["size"] >= 0
              and (item["pkname"] is None or type(item["pkname"]) is str
                   and re.fullmatch(r"/dev/[A-Za-z0-9_.-]{1,100}", item["pkname"])),
              "block device fields or identities differ")
        rows[item["maj:min"]] = item
        names.add(item["name"])
    disks = [row for row in rows.values() if row["type"] == "disk"]
    _need(len(disks) == 1 and disks[0]["name"] == target["linuxSystemDisk"]
          and disks[0]["pkname"] is None and disks[0]["size"] > 0, "local system disk inventory differs")
    disk = disks[0]
    partition = rows.get(root["device"])
    _need(partition is not None and partition["size"] > 0
          and (partition == disk or partition["type"] == "part" and partition["pkname"] == disk["name"]
               and partition["size"] <= disk["size"]),
          "root filesystem is not on the operator-bound plain system disk")
    return {"disk": disk, "rootDevice": partition}


def _snapshot_database_configuration(root):
    result = {}
    with _snapshot_directory(root, tuple(INSTALL_DB_DATA.strip("/").split("/"))) as parent:
        for name in INSTALL_DB_CONFIG:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            try:
                before = os.fstat(fd)
                _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                      and not stat.S_IMODE(before.st_mode) & 0o7022 and before.st_size <= MAX_FILE
                      and _installed_fingerprint(before) == _installed_fingerprint(os.fstat(fd))
                      == _installed_fingerprint(os.stat(name, dir_fd=parent, follow_symlinks=False)),
                      "database configuration file identity or permissions differ")
                result[name] = list(_installed_fingerprint(before))
            finally:
                os.close(fd)
    return result


def _installation_storage_snapshot(target, docker, prerequisites, run, *, deadline, _capture_target=None):
    """Read local facts; optional raw capture stays private and grants no authority."""
    _need(docker["dockerEngine"]["DockerRootDir"] == "/var/lib/docker",
          "nonstandard Docker storage needs platform review")
    if _capture_target is not None:
        _need(_json(_installation_snapshot_target(_capture_target)) == _json(target),
              "storage capture target differs from the original input")
    commands = []
    def observed(args):
        raw = run(args)
        if _capture_target is not None:
            commands.append({"argv": list(args), "stdout": raw})
        return raw
    before_raw = _snapshot_mountinfo(deadline=deadline)
    before_mounts = _snapshot_mounts(before_raw)
    blocks = _docker_json(INSTALL_BLOCK_ARGS, observed)
    identifier = docker["containers"]["db"]["containerId"]
    database = _docker_json(_installation_storage_args(identifier), observed)
    _installation_storage_database(database, prerequisites)
    paths, tablespaces = {}, None
    root_fd = _host_storage_root()
    try:
        hostkey, key_raw = _snapshot_hostkey(root_fd, _capture=True)
        _need(hostkey["sha256"] == target["sshHostKeySha256"], "operator SSH host key differs from this host")
        for path in INSTALL_STORAGE_DIRECTORIES:
            with _snapshot_directory(root_fd, tuple(path.strip("/").split("/"))) as directory:
                paths[path] = list(_directory_identity(os.fstat(directory)))
                if path == INSTALL_DB_DATA + "/pg_tblspc":
                    tablespaces = os.listdir(directory)
                    _need(not tablespaces, "custom or unregistered tablespace needs platform review")
        configuration = _snapshot_database_configuration(root_fd)
        root = _snapshot_coverage(before_mounts, paths)
        block_root = _snapshot_block_root(blocks, root, target)
        _need(_snapshot_hostkey(root_fd) == hostkey and _snapshot_database_configuration(root_fd) == configuration,
              "SSH host key or database configuration changed around storage observation")
    finally:
        os.close(root_fd)
    after_raw = _snapshot_mountinfo(deadline=deadline)
    _need(_snapshot_coverage(_snapshot_mounts(after_raw), paths) == root
          and _snapshot_block_root(_docker_json(INSTALL_BLOCK_ARGS, observed), root, target) == block_root
          and _json(_docker_json(_installation_storage_args(identifier), observed)) == _json(database)
          and time.monotonic() < deadline, "snapshot storage baseline changed during observation")
    facts = _installation_storage_facts(target, hostkey, paths, root, block_root, configuration, database, identifier)
    if _capture_target is None:
        return facts
    raw = _json({"schemaVersion": 1, "kind": "sanq-minimal-storage-originals",
        "targetOriginal": _capture_target.decode("ascii"), "publicHostKeyOriginal": key_raw.decode("ascii"),
        "publicHostKeyIdentity": hostkey["identity"], "directories": paths, "databaseConfiguration": configuration,
        "mountinfoOriginals": [before_raw.decode("utf-8"), after_raw.decode("utf-8")],
        "commands": commands, "databaseContainerId": identifier, "tablespaceEntries": tablespaces})
    _need(_json(_installation_storage_originals_value(raw, docker, prerequisites)) == _json(facts),
          "storage original capture differs from live facts")
    return facts, raw


def _observe_installed_snapshot_storage(retention_id, target, *, fetch=release.github_json):
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _snapshot_target=target)


# Raw snapshot prerequisites live inside the existing recovery pair, never as a permit file.
RECOVERY_STORAGE_MEMBER = "observations/pre-snapshot-storage.json"


def _snapshot_key_fingerprint(raw):
    _need(type(raw) is bytes and 0 < len(raw) <= 4096, "invalid SSH public host key size")
    try:
        text = raw.decode("ascii").strip()
        _need(len(text.splitlines()) == 1, "SSH public host key must contain one line")
        fields = text.split()
        _need(len(fields) >= 2 and fields[0] == "ssh-ed25519", "fixed SSH host key algorithm differs")
        blob = base64.b64decode(fields[1], validate=True)
        _need(len(blob) == 51 and blob[:19] == b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20",
              "SSH public host key encoding differs")
    except (ValueError, UnicodeError):
        raise release.ReleaseContractError("invalid SSH public host key") from None
    return "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")


def _storage_metadata(value, *, directory=False, public_key=False):
    _need(type(value) is list and len(value) == (5 if directory else 9)
          and all(type(item) is int and 0 <= item < 2**64 for item in value)
          and value[0] < 2**63 and value[1] > 0,
          "invalid storage observation metadata")
    mode = value[4] if directory else value[7]
    _need(not stat.S_IMODE(mode) & 0o7022
          and (stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)
               and value[8] == 1 and value[2] <= MAX_FILE), "storage observation metadata policy differs")
    if public_key:
        _need(value[2] > 0 and value[2] <= 4096
              and value[5:7] == [PRIVATE_OWNER_UID, PRIVATE_GROUP_GID], "public key metadata differs")


def _installation_storage_database(database, prerequisites):
    expected = {key: prerequisites["databaseIdentity"][key] for key in (
        "database", "port", "dataDirectory", "transactionReadOnly", "inRecovery")}
    _need(_json(expected) == _json({"database": "sanqin_db", "port": "5432",
          "dataDirectory": "/var/lib/postgresql/data", "transactionReadOnly": "on", "inRecovery": False}),
          "storage observation database baseline differs")
    expected.update({"configFile": "/var/lib/postgresql/data/postgresql.conf",
                     "hbaFile": "/var/lib/postgresql/data/pg_hba.conf",
                     "identFile": "/var/lib/postgresql/data/pg_ident.conf"})
    expected["tablespaces"] = [{"oid": "1663", "name": "pg_default", "location": ""},
                               {"oid": "1664", "name": "pg_global", "location": ""}]
    _need(_json(database) == _json(expected), "database storage identity or default tablespaces differ")


def _installation_storage_facts(target, hostkey, paths, root, block_root, configuration, database, identifier):
    facts = {"target": target, "sshHostKey": hostkey, "directories": paths, "rootMount": root,
             "blockStorage": block_root, "databaseConfiguration": configuration,
             "databaseStorageSha256": _hash(_json(database)),
             "databaseContainerId": identifier, "defaultTablespacesOnly": True,
             "localSystemDiskCoverageObserved": True, "awsOriginAuthenticated": False,
             "snapshotAvailable": False, "recoveryReady": False, "canExecute": False,
             "requiresIntentBinding": True, "requiresHostRecheck": True, "restoreProven": False}
    return {**facts, "observationSha256": _hash(_json(facts))}


def _installation_storage_originals_value(raw, docker, prerequisites):
    """Recompute the same facts from original data only. No filesystem, SQL or host replay."""
    try:
        _need(type(raw) is bytes and 0 < len(raw) <= MAX_RECOVERY_HOST_BYTES,
              "storage originals exceed budget")
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid storage originals JSON constant"))
        fields = {"schemaVersion", "kind", "targetOriginal", "publicHostKeyOriginal", "publicHostKeyIdentity",
                  "directories", "databaseConfiguration", "mountinfoOriginals", "commands",
                  "databaseContainerId", "tablespaceEntries"}
        _need(type(value) is dict and set(value) == fields and type(value["schemaVersion"]) is int
              and value["schemaVersion"] == 1 and value["kind"] == "sanq-minimal-storage-originals"
              and _json(value) == raw and type(value["targetOriginal"]) is str
              and type(value["publicHostKeyOriginal"]) is str
              and value["tablespaceEntries"] == [] and type(value["tablespaceEntries"]) is list,
              "storage originals fields or canonical bytes differ")
        target = _installation_snapshot_target(value["targetOriginal"].encode("ascii"))
        key_raw = value["publicHostKeyOriginal"].encode("ascii")
        key_identity = value["publicHostKeyIdentity"]
        _storage_metadata(key_identity, public_key=True)
        _need(key_identity[2] == len(key_raw), "public key original size differs")
        hostkey = {"sha256": _snapshot_key_fingerprint(key_raw), "identity": key_identity}
        _need(hostkey["sha256"] == target["sshHostKeySha256"], "archived SSH binding differs")
        paths, configuration = value["directories"], value["databaseConfiguration"]
        _need(type(paths) is dict and set(paths) == set(INSTALL_STORAGE_DIRECTORIES)
              and type(configuration) is dict and set(configuration) == set(INSTALL_DB_CONFIG),
              "storage original path inventory differs")
        for metadata in paths.values():
            _storage_metadata(metadata, directory=True)
        for metadata in configuration.values():
            _storage_metadata(metadata)
        identifier = docker["containers"]["db"]["containerId"]
        _need(value["databaseContainerId"] == identifier
              and docker["dockerEngine"]["DockerRootDir"] == "/var/lib/docker",
              "storage originals database or Docker identity differs")
        mountinfo, rows = value["mountinfoOriginals"], value["commands"]
        expected = [list(INSTALL_BLOCK_ARGS), _installation_storage_args(identifier)] * 2
        _need(type(mountinfo) is list and len(mountinfo) == 2 and all(type(item) is str for item in mountinfo)
              and type(rows) is list and len(rows) == 4, "storage original observation count differs")
        for row, argv in zip(rows, expected):
            _need(type(row) is dict and set(row) == {"argv", "stdout"} and type(row["argv"]) is list
                  and _json(row["argv"]) == _json(argv) and type(row["stdout"]) is str
                  and 0 < len(row["stdout"].encode("utf-8")) <= MAX_HOST_OUTPUT,
                  "storage original command differs")
        position = 0
        def replay(args):
            nonlocal position
            _need(position < len(rows) and args == expected[position], "storage observation order differs")
            output = rows[position]["stdout"]
            position += 1
            return output
        root = _snapshot_coverage(_snapshot_mounts(mountinfo[0].encode("utf-8")), paths)
        block_root = _snapshot_block_root(_docker_json(INSTALL_BLOCK_ARGS, replay), root, target)
        database = _docker_json(_installation_storage_args(identifier), replay)
        _installation_storage_database(database, prerequisites)
        _need(_snapshot_coverage(_snapshot_mounts(mountinfo[1].encode("utf-8")), paths) == root
              and _snapshot_block_root(_docker_json(INSTALL_BLOCK_ARGS, replay), root, target) == block_root
              and _json(_docker_json(_installation_storage_args(identifier), replay)) == _json(database)
              and position == len(rows), "storage originals changed across collection")
        return _installation_storage_facts(target, hostkey, paths, root, block_root, configuration, database, identifier)
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid storage originals") from None


def _installation_recovery_storage_value(raw, docker, recorded=None):
    try:
        _need(type(raw) is bytes and 0 < len(raw) <= MAX_RECOVERY_HOST_BYTES,
              "recovery storage originals exceed budget")
        value = json.loads(raw, object_pairs_hook=_unique,
                           parse_constant=lambda _: _need(False, "invalid recovery storage JSON constant"))
        _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "originalObservation", "storageOriginals"}
              and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
              and value["kind"] == "sanq-minimal-recovery-target-storage" and _json(value) == raw
              and type(value["originalObservation"]) is dict, "recovery storage envelope differs")
        observation = value["originalObservation"]
        _need(observation.get("outcome") == "PRE_SNAPSHOT_STORAGE_OBSERVED"
              and observation.get("snapshotTargetAndStorageObserved") is True
              and "installationIntent" not in observation
              and all(observation.get(key) is False for key in (
                  "canExecute", "readyToInstall", "authorizedToMutateProduction", "hostPreflightComplete"))
              and _json(observation["docker"]) == _json(docker),
              "recovery storage original observation differs")
        facts = _installation_storage_originals_value(_json(value["storageOriginals"]), docker, observation["prerequisites"])
        _need(_json(facts) == _json(observation["snapshotStorage"]),
              "recovery storage originals disagree with the original observation")
        if recorded is not None:
            _need(recorded["observationSha256"] == _hash(_json(observation))
                  and observation["sourceSha"] == recorded["targetSourceSha"]
                  and observation["currentArchiveSourceSha"] == recorded["installedRuntimeSourceSha"]
                  and observation["retentionId"] == recorded["retentionId"],
                  "recovery storage observation is not bound to the original intent")
        return {"value": value, "facts": facts, "observationSha256": _hash(_json(observation))}
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid recovery storage originals") from None


def _installation_recovery_storage_capture(capture, original, observation):
    _need(type(capture) is tuple and len(capture) == 3, "storage originals require the pre-gate host capture")
    _need(type(original) is bytes and 0 < len(original) <= MAX_RECOVERY_HOST_BYTES
          and type(observation) is dict, "invalid recovery storage original capture")
    value = json.loads(original, object_pairs_hook=_unique,
                       parse_constant=lambda _: _need(False, "invalid storage capture JSON constant"))
    _need(_json(value) == original, "recovery storage originals must keep canonical original bytes")
    raw = _json({"schemaVersion": 1, "kind": "sanq-minimal-recovery-target-storage",
                 "originalObservation": observation, "storageOriginals": value})
    reviewed = _installation_recovery_storage_value(raw, observation["docker"])
    _need(capture[1]["capturedBytes"] + len(capture[2]) + len(raw) <= MAX_RECOVERY_SOURCE_BYTES,
          "storage originals exceed the shared recovery budget")
    summary = {**capture[1], "scope": "pre-install-files-host-and-target-storage",
               "snapshotStorage": {"member": RECOVERY_STORAGE_MEMBER, "sha256": _hash(raw), "bytes": len(raw),
                   "preGate": True, "observationSha256": reviewed["observationSha256"]}}
    return capture[0], summary, capture[2], raw


def _retain_installation_target_storage(retention_id, target, *, fetch=release.github_json):
    """Fresh owned flow only; preserve exact target/storage originals, never install or resume."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True, _freeze_writers=True,
        _retain_recovery=True, _snapshot_target=target)


def _snapshot_timestamp(value):
    """Selected input: RFC3339 with explicit zone and at most microsecond precision."""
    _need(type(value) is str and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})",
        value), "snapshot timestamp must have an explicit timezone")
    try:
        # -00:00 means an unknown offset in RFC3339, not verified UTC.
        _need(not value.endswith("-00:00"), "unknown snapshot timezone offset")
        offset = value[-6:] if not value.endswith("Z") else "+00:00"
        _need(int(offset[1:3]) < 24 and int(offset[4:]) < 60, "invalid snapshot timezone offset")
        parsed = dt.datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
        return parsed.astimezone(dt.timezone.utc)
    except (ValueError, OverflowError):
        raise release.ReleaseContractError("invalid snapshot timestamp") from None


def _snapshot_utc_now():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _snapshot_content_request(request, storage):
    _need(type(storage) is dict and storage.get("localSystemDiskCoverageObserved") is True
          and storage.get("defaultTablespacesOnly") is True, "snapshot requires bound storage coverage")
    target = storage["target"]
    return {**request, "reviewMode": "operator-content-v1",
        "expectedSnapshotName": "sanq-runtime-" + request["challenge"],
        "targetInputSha256": target["targetInputSha256"],
        "targetStorageSha256": storage["observationSha256"],
        "expectedTarget": {key: target[key] for key in ("accountId", "region", "instanceArn", "instanceName")},
        "challengePreparedAt": _snapshot_utc_now()}


def _installation_snapshot_content_value(raw, request, storage, *, request_sent_at, reply_received_at):
    """Compare operator evidence to this owned round. Never authenticate AWS or authorize writes."""
    reply = _installation_snapshot_reply_value(raw, request)
    target = storage["target"]
    expected = {key: target[key] for key in ("accountId", "region", "instanceArn", "instanceName")}
    _need(request.get("reviewMode") == "operator-content-v1"
          and request.get("expectedTarget") == expected
          and request.get("targetInputSha256") == target["targetInputSha256"]
          and request.get("targetStorageSha256") == storage["observationSha256"]
          and storage.get("localSystemDiskCoverageObserved") is True
          and storage.get("defaultTablespacesOnly") is True
          and type(request.get("challenge")) is str and re.fullmatch(r"[a-f0-9]{64}", request["challenge"])
          and request.get("expectedSnapshotName") == "sanq-runtime-" + request["challenge"],
          "snapshot request differs from the original bound target")
    evidence = reply["evidence"]
    _need(set(evidence) == {"schemaVersion", "kind", "instanceSnapshot", "operatorVerification"}
          and type(evidence["schemaVersion"]) is int and evidence["schemaVersion"] == 1
          and evidence["kind"] == "sanq-minimal-manual-snapshot-content",
          "snapshot content envelope differs")
    snapshot, operator = evidence["instanceSnapshot"], evidence["operatorVerification"]
    fields = {"arn", "name", "createdAt", "location", "resourceType", "state", "fromAttachedDisks",
              "fromInstanceArn", "fromInstanceName", "isFromAutoSnapshot", "sizeInGb"}
    _need(type(snapshot) is dict and fields <= set(snapshot), "snapshot required fields are missing")
    prefix = "arn:aws:lightsail:" + target["region"] + ":" + target["accountId"] + ":InstanceSnapshot/"
    _need(type(snapshot["arn"]) is str and snapshot["arn"].startswith(prefix)
          and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", snapshot["arn"][len(prefix):])
          and snapshot["name"] == request["expectedSnapshotName"]
          and snapshot["resourceType"] == "InstanceSnapshot" and snapshot["state"] == "available"
          and snapshot["fromInstanceArn"] == target["instanceArn"]
          and snapshot["fromInstanceName"] == target["instanceName"]
          and snapshot["isFromAutoSnapshot"] is False
          and type(snapshot["fromAttachedDisks"]) is list and not snapshot["fromAttachedDisks"]
          and type(snapshot["sizeInGb"]) is int
          and snapshot["sizeInGb"] == target["cloudSystemDiskSizeInGb"],
          "snapshot identity, state or disk coverage differs")
    location = snapshot["location"]
    _need(type(location) is dict and location.get("regionName") == target["region"]
          and location.get("availabilityZone") in ("all", target["availabilityZone"]),
          "snapshot location differs from the bound region or supported zone")
    operator_fields = {"method", "accountId", "region", "instanceArn", "snapshotArn",
                       "authenticatedAwsSession", "createdAfterChallenge", "availableObservedAt"}
    _need(type(operator) is dict and set(operator) == operator_fields
          and operator["method"] == "operator-authenticated-aws-session"
          and operator["authenticatedAwsSession"] is True and operator["createdAfterChallenge"] is True
          and all(operator[key] == target[key] for key in ("accountId", "region", "instanceArn"))
          and operator["snapshotArn"] == snapshot["arn"], "snapshot operator verification differs")
    prepared = _snapshot_timestamp(request["challengePreparedAt"])
    sent, received = _snapshot_timestamp(request_sent_at), _snapshot_timestamp(reply_received_at)
    created, observed = _snapshot_timestamp(snapshot["createdAt"]), _snapshot_timestamp(operator["availableObservedAt"])
    _need(prepared <= sent <= created <= observed <= received,
          "snapshot creation or observation order contradicts this round")
    return {"outcome": "SNAPSHOT_CONTENT_VALIDATED",
        "requestSha256": _hash(_json(request)), "replySha256": _hash(raw),
        "evidenceSha256": _hash(_json(evidence)), "replyBytes": len(raw),
        "targetInputSha256": target["targetInputSha256"], "targetStorageSha256": storage["observationSha256"],
        "snapshotArn": snapshot["arn"], "snapshotName": snapshot["name"],
        "fromInstanceArn": snapshot["fromInstanceArn"], "fromInstanceName": snapshot["fromInstanceName"],
        "accountId": target["accountId"], "region": target["region"],
        "sourceAvailabilityZone": target["availabilityZone"], "snapshotAvailabilityZone": location["availabilityZone"],
        "createdAt": created.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "availableObservedAt": observed.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "requestSentAt": sent.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "replyReceivedAt": received.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "verificationMethod": operator["method"], "operatorObservedAvailable": True,
        "snapshotContentValidated": True, "snapshotEvidenceValidated": True,
        "awsOriginAuthenticated": False, "trustedTimeProven": False, "restoreProven": False,
        "snapshotAvailable": False, "recoveryReady": False, "canExecute": False,
        "requiresSnapshotValidation": False, "requiresDurableSnapshotReceipt": True,
        "requiresRecoveryValidation": True, "requiresHostRecheck": True}


def _review_installation_snapshot_content(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh owned flow only; no imported receipt, installation or resume authority."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True, _freeze_writers=True,
        _retain_recovery=True, _snapshot_target=target, _snapshot_channel=(input_fd, output_fd))


# A post-snapshot record cannot be present inside the snapshot that precedes it.
SNAPSHOT_REVIEW_FILE = "snapshot-review.json"
MAX_SNAPSHOT_REVIEW_RECORD = 192 * 1024


def _snapshot_review_bytes(request, reply, storage, *, request_sent_at, reply_received_at):
    result = _installation_snapshot_content_value(reply, request, storage,
        request_sent_at=request_sent_at, reply_received_at=reply_received_at)
    raw = _json({"schemaVersion": 1, "kind": "sanq-minimal-snapshot-review",
        "installationId": request["installationId"], "request": request,
        "replyOriginal": reply.decode("ascii"), "requestSentAt": request_sent_at,
        "replyReceivedAt": reply_received_at, "result": result})
    _need(len(raw) <= MAX_SNAPSHOT_REVIEW_RECORD, "snapshot review record exceeds budget")
    return raw


def _snapshot_review_value(raw, payload, receipt, intent, writers, identity):
    """Recompute the record from preserved data. Never resume an installation or query AWS."""
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_SNAPSHOT_REVIEW_RECORD,
          "invalid snapshot review record size")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid snapshot review JSON constant"))
        _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "installationId", "request",
                  "replyOriginal", "requestSentAt", "replyReceivedAt", "result"}
              and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
              and value["kind"] == "sanq-minimal-snapshot-review" and value["installationId"] == identity
              and _json(value) == raw and type(value["replyOriginal"]) is str,
              "snapshot review record fields differ")
        _installation_recovery_receipt_value(receipt, payload, intent, writers, identity)
        bound = {"installationId": identity, "intentSha256": _hash(intent), "writersSha256": _hash(writers),
                 "archiveSha256": _hash(payload), "receiptSha256": _hash(receipt)}
        request = value["request"]
        _need(type(request) is dict and set(request) == {"schemaVersion", "kind", *bound, "challenge",
                  "maxWaitSeconds", "snapshotAvailable", "canExecute", "reviewMode", "expectedSnapshotName",
                  "targetInputSha256", "targetStorageSha256", "expectedTarget", "challengePreparedAt"}
              and type(request["schemaVersion"]) is int and request["schemaVersion"] == 1
              and request["kind"] == "sanq-minimal-snapshot-evidence-request"
              and type(request["maxWaitSeconds"]) is int and request["maxWaitSeconds"] == MAX_SNAPSHOT_REVIEW_SECONDS
              and request["snapshotAvailable"] is False and request["canExecute"] is False
              and all(request[key] == original for key, original in bound.items()),
              "snapshot review request is not bound to the original recovery pair")
        members = _installation_recovery_members(payload)
        _need(RECOVERY_STORAGE_MEMBER in members, "snapshot review requires original target storage")
        storage_raw = members[RECOVERY_STORAGE_MEMBER]
        storage_value = json.loads(storage_raw, object_pairs_hook=_unique)
        storage = _installation_recovery_storage_value(storage_raw,
            storage_value["originalObservation"]["docker"], _installation_record_value(intent, identity))["facts"]
        result = _installation_snapshot_content_value(value["replyOriginal"].encode("ascii"), request, storage,
            request_sent_at=value["requestSentAt"], reply_received_at=value["replyReceivedAt"])
        _need(_json(result) == _json(value["result"]), "snapshot review result differs from preserved originals")
        return value
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid snapshot review record") from None


def _snapshot_offhost_index(raw, payload, receipt, intent, writers, identity):
    """Non-secret projection only; generation is not proof of an off-host durable copy."""
    value = _snapshot_review_value(raw, payload, receipt, intent, writers, identity)
    recorded = _installation_record_value(intent, identity)
    result, request = value["result"], value["request"]
    index = {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-offhost-index",
        "installationId": identity, "retentionId": recorded["retentionId"],
        "targetSourceSha": recorded["targetSourceSha"],
        "installedRuntimeSourceSha": recorded["installedRuntimeSourceSha"],
        **{key: request[key] for key in ("intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "challenge")},
        **{key: result[key] for key in ("requestSha256", "replySha256", "evidenceSha256", "targetInputSha256",
            "targetStorageSha256", "snapshotArn", "snapshotName", "fromInstanceArn", "fromInstanceName",
            "accountId", "region", "sourceAvailabilityZone", "snapshotAvailabilityZone", "createdAt", "availableObservedAt")},
        "snapshotReviewSha256": _hash(raw), "snapshotReviewBytes": len(raw),
        "transactionPath": "/opt/sanq/deploy-state/installation-runs/" + identity,
        "retentionPath": "/opt/sanq/deploy-state/installations/" + recorded["retentionId"],
        "snapshotReviewFile": SNAPSHOT_REVIEW_FILE, "recoveryFiles": sorted(RECOVERY_FILES),
        "offHostRetentionConfirmed": False, "requiresOffHostRetention": True,
        "snapshotContainsFinalReview": False, "awsOriginAuthenticated": False,
        "trustedTimeProven": False, "restoreProven": False,
        "snapshotAvailable": False, "recoveryReady": False, "canExecute": False}
    _need(len(_json(index)) <= MAX_INSTALL_RECORD, "snapshot off-host index exceeds budget")
    return _snapshot_offhost_index_value(_json(index))


def _snapshot_review_read(root):
    _private_info(os.fstat(root), directory=True)
    fd = os.open(SNAPSHOT_REVIEW_FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        _need(0 < before.st_size <= MAX_SNAPSHOT_REVIEW_RECORD, "snapshot review file size differs")
        chunks, size = [], 0
        while size <= MAX_SNAPSHOT_REVIEW_RECORD:
            block = os.read(fd, min(65536, MAX_SNAPSHOT_REVIEW_RECORD + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
        after, path = os.fstat(fd), os.stat(SNAPSHOT_REVIEW_FILE, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need(size == before.st_size and _installed_fingerprint(before) == _installed_fingerprint(after)
              == _installed_fingerprint(path), "snapshot review changed around read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _snapshot_review_write(root, raw):
    """Fixed-leaf create-only IO; the owned caller must validate all original bindings first."""
    _need(os.geteuid() == 0 and type(raw) is bytes and 0 < len(raw) <= MAX_SNAPSHOT_REVIEW_RECORD,
          "invalid snapshot review write")
    _private_info(os.fstat(root), directory=True)
    disk = os.fstatvfs(root)
    _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + len(raw),
          "insufficient snapshot review storage reserve")
    fd = os.open(SNAPSHOT_REVIEW_FILE, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        remaining = memoryview(raw)
        while remaining:
            count = os.write(fd, remaining)
            _need(count > 0, "short snapshot review write")
            remaining = remaining[count:]
        os.fsync(fd)
        written = os.fstat(fd)
        _private_info(written)
        _need(written.st_size == len(raw), "snapshot review output size differs")
        os.fsync(root)
        _need(_snapshot_review_read(root) == raw, "snapshot review readback differs")
        after, path = os.fstat(fd), os.stat(SNAPSHOT_REVIEW_FILE, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)
              and _installed_fingerprint(written) == _installed_fingerprint(after)
              == _installed_fingerprint(path), "snapshot review output replaced")
    finally:
        os.close(fd)  # Preserve partial or complete evidence on every unknown result.


def _retain_installation_snapshot_review(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh original locks and live input only. A durable review still grants no installation permit."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True, _freeze_writers=True,
        _retain_recovery=True, _snapshot_target=target, _snapshot_channel=(input_fd, output_fd),
        _retain_snapshot_review=True)


# Shared strict data for the client receiver and this round's owned VM continuation.
MAX_SNAPSHOT_INDEX_TRANSFER = 32 * 1024


def _snapshot_offhost_index_value(raw):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_INSTALL_RECORD, "invalid off-host index size")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid off-host index JSON constant"))
        hashes = ("intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "requestSha256",
                  "replySha256", "evidenceSha256", "targetInputSha256", "targetStorageSha256", "snapshotReviewSha256")
        identities = ("installationId", "retentionId", "challenge")
        false_flags = ("offHostRetentionConfirmed", "snapshotContainsFinalReview", "awsOriginAuthenticated",
                       "trustedTimeProven", "restoreProven", "snapshotAvailable", "recoveryReady", "canExecute")
        fields = {"schemaVersion", "kind", *hashes, *identities, *false_flags, "requiresOffHostRetention",
                  "targetSourceSha", "installedRuntimeSourceSha", "snapshotReviewBytes", "snapshotArn", "snapshotName",
                  "fromInstanceArn", "fromInstanceName", "accountId", "region", "sourceAvailabilityZone",
                  "snapshotAvailabilityZone", "createdAt", "availableObservedAt", "transactionPath", "retentionPath",
                  "snapshotReviewFile", "recoveryFiles"}
        _need(type(value) is dict and set(value) == fields and _json(value) == raw
              and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
              and value["kind"] == "sanq-minimal-snapshot-offhost-index"
              and all(type(value[key]) is str and re.fullmatch(r"[a-f0-9]{64}", value[key]) for key in (*hashes, *identities))
              and all(type(value[key]) is str and re.fullmatch(r"[a-f0-9]{40}", value[key])
                      for key in ("targetSourceSha", "installedRuntimeSourceSha"))
              and all(value[key] is False for key in false_flags) and value["requiresOffHostRetention"] is True
              and type(value["snapshotReviewBytes"]) is int and 0 < value["snapshotReviewBytes"] <= MAX_SNAPSHOT_REVIEW_RECORD,
              "off-host index fields, bindings or authority flags differ")
        _need(type(value["accountId"]) is str and re.fullmatch(r"[0-9]{12}", value["accountId"])
              and type(value["region"]) is str and re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-[0-9]+", value["region"])
              and type(value["fromInstanceName"]) is str
              and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,254}", value["fromInstanceName"]),
              "off-host index target identity differs")
        prefix = "arn:aws:lightsail:" + value["region"] + ":" + value["accountId"] + ":"
        for key, resource in (("fromInstanceArn", "Instance/"), ("snapshotArn", "InstanceSnapshot/")):
            full = prefix + resource
            _need(type(value[key]) is str and value[key].startswith(full)
                  and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", value[key][len(full):]),
                  "off-host index ARN differs")
        _need(value["snapshotName"] == "sanq-runtime-" + value["challenge"]
              and type(value["sourceAvailabilityZone"]) is str
              and re.fullmatch(re.escape(value["region"]) + r"[a-z]", value["sourceAvailabilityZone"])
              and value["snapshotAvailabilityZone"] in ("all", value["sourceAvailabilityZone"])
              and value["transactionPath"] == "/opt/sanq/deploy-state/installation-runs/" + value["installationId"]
              and value["retentionPath"] == "/opt/sanq/deploy-state/installations/" + value["retentionId"]
              and value["snapshotReviewFile"] == SNAPSHOT_REVIEW_FILE
              and type(value["recoveryFiles"]) is list and value["recoveryFiles"] == sorted(RECOVERY_FILES),
              "off-host index names, paths or location differ")
        times = [_snapshot_timestamp(value[key]) for key in ("createdAt", "availableObservedAt")]
        _need(times[0] <= times[1] and all(parsed.strftime("%Y-%m-%dT%H:%M:%S.%fZ") == value[key]
              for parsed, key in zip(times, ("createdAt", "availableObservedAt"))), "off-host index time differs")
        return value
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid off-host index") from None


def _snapshot_index_transfer(index):
    index = _snapshot_offhost_index_value(_json(index))
    raw = _json({"schemaVersion": 1, "kind": "sanq-minimal-snapshot-index-transfer",
        "transferChallenge": os.urandom(32).hex(), "indexSha256": _hash(_json(index)),
        "indexBytes": len(_json(index)), "index": index})
    _need(len(raw) <= MAX_SNAPSHOT_INDEX_TRANSFER, "snapshot index transfer exceeds budget")
    return raw


def _snapshot_index_transfer_value(raw):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_SNAPSHOT_INDEX_TRANSFER, "invalid snapshot index transfer size")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid snapshot index transfer constant"))
        _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "transferChallenge", "indexSha256", "indexBytes", "index"}
              and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
              and value["kind"] == "sanq-minimal-snapshot-index-transfer" and _json(value) == raw
              and type(value["transferChallenge"]) is str and re.fullmatch(r"[a-f0-9]{64}", value["transferChallenge"]),
              "snapshot index transfer fields differ")
        index = _snapshot_offhost_index_value(_json(value["index"]))
        _need(value["indexSha256"] == _hash(_json(index)) and type(value["indexBytes"]) is int
              and value["indexBytes"] == len(_json(index)), "snapshot index transfer digest differs")
        return value
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid snapshot index transfer") from None


def _snapshot_index_ack_value(raw, transfer):
    request = _snapshot_index_transfer_value(transfer)
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_INSTALL_RECORD, "invalid snapshot index acknowledgement size")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid snapshot index acknowledgement constant"))
        index = request["index"]
        _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "installationId", "snapshotReviewSha256",
                  "indexSha256", "indexBytes", "transferChallenge", "operatorConfirmedOffHost", "clientIndexDurable",
                  "syncMethod", "canExecute", "recoveryReady"}
              and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
              and value["kind"] == "sanq-minimal-snapshot-index-ack" and _json(value) == raw
              and value["installationId"] == index["installationId"]
              and value["snapshotReviewSha256"] == index["snapshotReviewSha256"]
              and all(value[key] == request[key] for key in ("indexSha256", "transferChallenge"))
              and type(value["indexBytes"]) is int and value["indexBytes"] == request["indexBytes"]
              and value["operatorConfirmedOffHost"] is True and value["clientIndexDurable"] is True
              and value["syncMethod"] in ("posix-fsync", "darwin-fullfsync")
              and value["canExecute"] is False and value["recoveryReady"] is False,
              "snapshot index acknowledgement binding differs")
        return value
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid snapshot index acknowledgement") from None


@contextlib.contextmanager
def _offhost_index_directory(directory, uid):
    _need(type(directory) is str and 0 < len(directory) <= 4096 and all(ord(c) >= 32 for c in directory),
          "invalid client index directory")
    path = Path(directory)
    _need(path.is_absolute() and str(path) == directory and ".." not in path.parts and len(path.parts) <= 128,
          "ambiguous client index directory")
    _need(not any(path == root or root in path.parents for root in map(Path,
          ("/opt", "/srv", "/etc", "/proc", "/sys", "/dev", "/run", "/home/ubuntu/sanq-app"))),
          "client index destination is a system or production path")
    with contextlib.ExitStack() as stack:
        root = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        stack.callback(os.close, root)
        opened = []
        for name in path.parts[1:]:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
            stack.callback(os.close, child)
            info = os.fstat(child)
            _need(stat.S_ISDIR(info.st_mode) and info.st_uid in (0, uid)
                  and (not stat.S_IMODE(info.st_mode) & 0o022
                       or info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX)),
                  "untrusted client index ancestor")
            opened.append((root, name, child, _directory_identity(info)))
            root = child
        final = os.fstat(root)
        _need(final.st_uid == uid and stat.S_IMODE(final.st_mode) == 0o700, "client index directory must be private and owned")
        yield root
        for parent, name, child, identity in reversed(opened):
            _need(_directory_identity(os.fstat(child)) == identity
                  == _directory_identity(os.stat(name, dir_fd=parent, follow_symlinks=False)),
                  "client index directory changed during retention")


def _offhost_index_read(root, name, uid):
    _need(type(name) is str and re.fullmatch(r"snapshot-index-[a-f0-9]{64}\.json", name), "invalid client index leaf")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_uid == uid and before.st_nlink == 1
              and stat.S_IMODE(before.st_mode) == 0o600 and 0 < before.st_size <= MAX_INSTALL_RECORD,
              "client index metadata differs")
        chunks, size = [], 0
        while size <= MAX_INSTALL_RECORD:
            block = os.read(fd, min(4096, MAX_INSTALL_RECORD + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
        after, path = os.fstat(fd), os.stat(name, dir_fd=root, follow_symlinks=False)
        _need(size == before.st_size and _installed_fingerprint(before) == _installed_fingerprint(after)
              == _installed_fingerprint(path), "client index changed around read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _retain_snapshot_index_offhost(transfer, directory, *, expected, operator_confirmed_off_host=False):
    """Unprivileged client only. The caller supplies independently known SSH/round context."""
    uid = os.geteuid()
    _need(uid > 0 and sys.platform in ("linux", "darwin") and operator_confirmed_off_host is True,
          "client retention requires an unprivileged confirmed off-host operator")
    request = _snapshot_index_transfer_value(transfer)
    index = request["index"]
    context = {key: index[source] for key, source in (
        ("accountId", "accountId"), ("region", "region"), ("instanceArn", "fromInstanceArn"),
        ("instanceName", "fromInstanceName"), ("installationId", "installationId"),
        ("snapshotReviewSha256", "snapshotReviewSha256"))}
    _need(type(expected) is dict and set(expected) == set(context)
          and all(type(expected[key]) is str for key in context) and _json(expected) == _json(context),
          "client retention differs from the independently known target and round")
    fullsync = getattr(fcntl, "F_FULLFSYNC", None) if sys.platform == "darwin" else None
    _need(sys.platform != "darwin" or type(fullsync) is int, "Darwin full-sync capability is unavailable")
    raw = _json(index)
    name = "snapshot-index-" + index["installationId"] + ".json"
    with _offhost_index_directory(directory, uid) as root:
        disk = os.fstatvfs(root)
        _need(disk.f_bavail * disk.f_frsize >= 1024 * 1024 + len(raw), "insufficient client index reserve")
        fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
        try:
            before = os.fstat(fd)
            _need(stat.S_ISREG(before.st_mode) and before.st_uid == uid and before.st_nlink == 1
                  and stat.S_IMODE(before.st_mode) == 0o600, "client index output metadata differs")
            remaining = memoryview(raw)
            while remaining:
                count = os.write(fd, remaining)
                _need(count > 0, "short client index write")
                remaining = remaining[count:]
            os.fsync(fd)
            os.fsync(root)
            if fullsync is not None:
                fcntl.fcntl(fd, fullsync)
            written = os.fstat(fd)
            _need(written.st_size == len(raw), "client index output size differs")
            _need(_offhost_index_read(root, name, uid) == raw, "client index readback differs")
            final, path = os.fstat(fd), os.stat(name, dir_fd=root, follow_symlinks=False)
            _need((before.st_dev, before.st_ino) == (final.st_dev, final.st_ino)
                  and _installed_fingerprint(written) == _installed_fingerprint(final)
                  == _installed_fingerprint(path), "client index replaced after readback")
        finally:
            os.close(fd)  # Never remove or overwrite partial/complete evidence after an unknown result.
    ack = _json({"schemaVersion": 1, "kind": "sanq-minimal-snapshot-index-ack",
        "installationId": index["installationId"], "snapshotReviewSha256": index["snapshotReviewSha256"],
        **{key: request[key] for key in ("indexSha256", "indexBytes", "transferChallenge")},
        "operatorConfirmedOffHost": True, "clientIndexDurable": True,
        "syncMethod": "darwin-fullfsync" if fullsync is not None else "posix-fsync",
        "canExecute": False, "recoveryReady": False})
    _snapshot_index_ack_value(ack, transfer)
    return ack


# Acknowledgements are data in this operator/SSH trust scope, never a recovery permit.
SNAPSHOT_OFFHOST_FILE = "snapshot-offhost.json"
MAX_SNAPSHOT_OFFHOST_RECORD = 128 * 1024


def _installation_snapshot_index_exchange(transfer, input_fd, output_fd, *, deadline, _request_sent=None):
    request = _snapshot_index_transfer_value(transfer)
    raw = _installation_snapshot_exchange(request, input_fd, output_fd, deadline=deadline,
        _request_sent=_request_sent, _request_limit=MAX_SNAPSHOT_INDEX_TRANSFER)
    _snapshot_index_ack_value(raw, transfer)
    return raw


def _snapshot_offhost_record_bytes(transfer, ack, review, payload, receipt, intent, writers, identity, *,
                                  request_sent_at, reply_received_at):
    raw = _json({"schemaVersion": 1, "kind": "sanq-minimal-snapshot-offhost-receipt",
        "installationId": identity, "snapshotReviewSha256": _hash(review),
        "transferOriginal": transfer.decode("ascii"), "ackOriginal": ack.decode("ascii"),
        "requestSentAt": request_sent_at, "replyReceivedAt": reply_received_at,
        "verificationMethod": "operator-ssh-peer-durable-receipt",
        "offHostLocationIndependentlyAuthenticated": False, "canExecute": False, "recoveryReady": False})
    _snapshot_offhost_record_value(raw, review, payload, receipt, intent, writers, identity)
    return raw


def _snapshot_offhost_record_value(raw, review, payload, receipt, intent, writers, identity):
    """Data-only binding to the original durable review and recovery materials; no host replay."""
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_SNAPSHOT_OFFHOST_RECORD,
          "invalid snapshot off-host record size")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid snapshot off-host record constant"))
        _need(type(value) is dict and set(value) == {"schemaVersion", "kind", "installationId", "snapshotReviewSha256",
                  "transferOriginal", "ackOriginal", "requestSentAt", "replyReceivedAt", "verificationMethod",
                  "offHostLocationIndependentlyAuthenticated", "canExecute", "recoveryReady"}
              and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
              and value["kind"] == "sanq-minimal-snapshot-offhost-receipt" and _json(value) == raw
              and value["installationId"] == identity and value["snapshotReviewSha256"] == _hash(review)
              and type(value["transferOriginal"]) is str and type(value["ackOriginal"]) is str
              and value["verificationMethod"] == "operator-ssh-peer-durable-receipt"
              and all(value[key] is False for key in ("offHostLocationIndependentlyAuthenticated", "canExecute", "recoveryReady")),
              "snapshot off-host record fields or authority flags differ")
        transfer = value["transferOriginal"].encode("ascii")
        request = _snapshot_index_transfer_value(transfer)
        expected = _snapshot_offhost_index(review, payload, receipt, intent, writers, identity)
        _need(_json(request["index"]) == _json(expected),
              "snapshot off-host transfer differs from the original durable review")
        _snapshot_index_ack_value(value["ackOriginal"].encode("ascii"), transfer)
        times = [_snapshot_timestamp(value[key]) for key in ("requestSentAt", "replyReceivedAt")]
        reviewed = _snapshot_review_value(review, payload, receipt, intent, writers, identity)
        _need(_snapshot_timestamp(reviewed["replyReceivedAt"]) <= times[0] <= times[1]
              and all(parsed.strftime("%Y-%m-%dT%H:%M:%S.%fZ") == value[key]
                      for parsed, key in zip(times, ("requestSentAt", "replyReceivedAt"))),
              "snapshot off-host confirmation time contradicts the original review")
        return value
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid snapshot off-host record") from None


def _snapshot_offhost_record_read(root):
    _private_info(os.fstat(root), directory=True)
    fd = os.open(SNAPSHOT_OFFHOST_FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        _need(0 < before.st_size <= MAX_SNAPSHOT_OFFHOST_RECORD, "snapshot off-host file size differs")
        chunks, size = [], 0
        while size <= MAX_SNAPSHOT_OFFHOST_RECORD:
            block = os.read(fd, min(65536, MAX_SNAPSHOT_OFFHOST_RECORD + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
        after, path = os.fstat(fd), os.stat(SNAPSHOT_OFFHOST_FILE, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need(size == before.st_size and _installed_fingerprint(before) == _installed_fingerprint(after)
              == _installed_fingerprint(path), "snapshot off-host record changed around read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def _snapshot_offhost_record_write(root, raw):
    """Owned caller validates all original bindings; never accept a caller-controlled leaf."""
    _need(os.geteuid() == 0 and type(raw) is bytes and 0 < len(raw) <= MAX_SNAPSHOT_OFFHOST_RECORD,
          "invalid snapshot off-host write")
    _private_info(os.fstat(root), directory=True)
    disk = os.fstatvfs(root)
    _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + len(raw),
          "insufficient snapshot off-host storage reserve")
    fd = os.open(SNAPSHOT_OFFHOST_FILE, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        remaining = memoryview(raw)
        while remaining:
            count = os.write(fd, remaining)
            _need(count > 0, "short snapshot off-host write")
            remaining = remaining[count:]
        os.fsync(fd)
        written = os.fstat(fd)
        _private_info(written)
        _need(written.st_size == len(raw), "snapshot off-host output size differs")
        os.fsync(root)
        _need(_snapshot_offhost_record_read(root) == raw, "snapshot off-host readback differs")
        after, path = os.fstat(fd), os.stat(SNAPSHOT_OFFHOST_FILE, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(path)
        _need((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)
              and _installed_fingerprint(written) == _installed_fingerprint(after)
              == _installed_fingerprint(path), "snapshot off-host record replaced after readback")
    finally:
        os.close(fd)  # Keep partial/complete evidence; no cleanup or replay after an unknown result.


def _confirm_installation_offhost_index(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh owned flow, live matching peer and durable VM receipt; no installation or resume."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True, include_docker=True,
        include_systemd=True, include_filesystem=True, include_prerequisites=True, include_application_binding=True,
        include_migrations=True, include_effective_configuration=True, include_external_backup=True,
        _record_intent=True, _load_deny_gates=True, _save_writers=True, _freeze_writers=True,
        _retain_recovery=True, _snapshot_target=target, _snapshot_channel=(input_fd, output_fd),
        _retain_snapshot_review=True, _confirm_offhost_index=True)


# Restore prerequisites: material association only; physical recovery evidence is still required.
RECOVERY_REQUIRED_EVIDENCE = (
    "PLATFORM_AND_SNAPSHOT_CONSISTENCY",
    "ISOLATED_REPLACEMENT_FENCING",
    "COMPLETE_CLUSTER_RESTORE",
    "PERSISTENT_CONTENT_AND_RUNTIME_RESTORE",
    "OFFHOST_ONLY_RETRIEVAL",
)


def _snapshot_recovery_material_review(index_raw, payload, receipt, intent, writers, identity, *, fetch):
    """Bind an operator-retained index to pre-snapshot originals, without later VM receipts."""
    _need(type(identity) is str and re.fullmatch(r"[a-f0-9]{64}", identity) and callable(fetch)
          and all(type(raw) is bytes and 0 < len(raw) <= maximum for raw, maximum in (
              (intent, MAX_INSTALL_RECORD), (writers, MAX_INSTALL_RECORD), (receipt, MAX_INSTALL_RECORD),
              (payload, MAX_RECOVERY_ARCHIVE_BYTES))), "invalid recovery material inputs")
    index = _snapshot_offhost_index_value(index_raw)
    _need(index["installationId"] == identity
          and index["intentSha256"] == _hash(intent) and index["writersSha256"] == _hash(writers)
          and index["archiveSha256"] == _hash(payload) and index["receiptSha256"] == _hash(receipt),
          "recovery material digests differ from the off-host index")
    recorded = _installation_record_value(intent, identity)
    _installation_writers_match(intent, writers, identity)
    _need(index["retentionId"] == recorded["retentionId"]
          and index["targetSourceSha"] == recorded["targetSourceSha"]
          and index["installedRuntimeSourceSha"] == recorded["installedRuntimeSourceSha"],
          "recovery material source or retention differs from the original intent")
    scope = _installation_recovery_scope(payload, receipt, intent, writers, identity,
        fetch=fetch, require_target_storage=True)
    _need(scope["packageScopeReviewed"] is True and scope.get("snapshotTargetStorageReviewed") is True,
          "recovery material scope lacks original target storage")
    members = _installation_recovery_members(payload)
    try:
        raw = members[RECOVERY_STORAGE_MEMBER]
        value = json.loads(raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid recovery material storage constant"))
        observation = value["originalObservation"]
        reviewed = _installation_recovery_storage_value(raw, observation["docker"], recorded)
        storage, target = reviewed["facts"], reviewed["facts"]["target"]
        _need(all(index[key] == target[source] for key, source in (
                  ("accountId", "accountId"), ("region", "region"), ("fromInstanceArn", "instanceArn"),
                  ("fromInstanceName", "instanceName"), ("sourceAvailabilityZone", "availabilityZone"),
                  ("targetInputSha256", "targetInputSha256")))
              and index["targetStorageSha256"] == storage["observationSha256"]
              and observation["applicationSha"] == scope["applicationSha"],
              "recovery index target differs from pre-snapshot originals")
        prerequisites, docker = observation["prerequisites"], observation["docker"]
        basis = {"installationId": identity, "retentionId": recorded["retentionId"],
            "targetSourceSha": recorded["targetSourceSha"], "installedRuntimeSourceSha": recorded["installedRuntimeSourceSha"],
            "applicationSha": scope["applicationSha"], "indexSha256": _hash(index_raw),
            **{key: index[key] for key in ("intentSha256", "writersSha256", "archiveSha256", "receiptSha256",
                "targetInputSha256", "targetStorageSha256", "accountId", "region", "fromInstanceArn", "fromInstanceName",
                "snapshotArn", "snapshotName", "challenge")},
            "originalObservationSha256": reviewed["observationSha256"],
            "storageOriginalsSha256": _hash(raw), "packageCaptureSha256": scope["captureSha256"],
            "sourceDockerPlatform": {key: docker["dockerEngine"][key] for key in ("OSType", "Architecture", "ServerVersion")},
            "sourceSystemPython": prerequisites["systemPython"],
            "sourceDatabaseImageId": docker["containers"]["db"]["imageId"],
            "sourceDatabaseIdentity": prerequisites["databaseIdentity"],
            "sourceMigrationHistorySha256": prerequisites["migrationHistorySha256"],
            "sourceMigrationHistoryRows": prerequisites["migrationHistoryRows"],
            "sourceSystemDiskSizeInGb": target["cloudSystemDiskSizeInGb"],
            "sourceStorageLayoutSha256": _hash(_json({"rootMount": storage["rootMount"], "blockStorage": storage["blockStorage"]})),
            "persistentPaths": list(INSTALL_STORAGE_DIRECTORIES),
            "oldRuntimeMembers": scope["oldRuntimeMembers"]}
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid recovery material association") from None
    _need(len(_json(basis)) <= MAX_INSTALL_RECORD, "recovery material basis exceeds budget")
    return {"outcome": "RECOVERY_MATERIALS_BOUND_EVIDENCE_REQUIRED",
        "schemaVersion": 1, "kind": "sanq-minimal-recovery-material-review",
        "basis": basis, "basisSha256": _hash(_json(basis)), "materialBindingsReviewed": True,
        "postSnapshotReceiptsRequired": False, "postSnapshotReviewDigestRecomputed": False,
        "snapshotLocatorSource": "operator-retained-offhost-index", "sourceReviewUsesFetchPort": True,
        "requiredEvidence": list(RECOVERY_REQUIRED_EVIDENCE), "requiresIsolatedRestoreEvidence": True,
        "awsOriginAuthenticated": False, "trustedTimeProven": False, "restoreProven": False,
        "snapshotAvailable": False, "recoveryReady": False, "readyToInstall": False,
        "canExecute": False, "authorizedToMutateProduction": False, "requiresHostRecheck": True}


def _snapshot_recovery_replacement_review(index_raw, payload, receipt, intent, writers, identity,
                                           replacement_raw, *, expected, fetch):
    """Review an independently selected replacement as data; never contact or authorize that host."""
    _need(type(replacement_raw) is bytes and 0 < len(replacement_raw) <= 131072,
          "invalid recovery replacement input size")
    try:
        value = json.loads(replacement_raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid recovery replacement JSON constant"))
        _need(_json(value) == replacement_raw, "recovery replacement input must be canonical")
    except (ValueError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid recovery replacement JSON") from None
    _need(type(value) is dict and set(value) == {
              "schemaVersion", "kind", "basisSha256", "indexSha256", "targetOriginal"}
          and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == "sanq-minimal-recovery-replacement-target"
          and type(value["targetOriginal"]) is str,
          "recovery replacement fields differ")
    for key in ("basisSha256", "indexSha256"):
        _need(type(value[key]) is str and re.fullmatch(r"[a-f0-9]{64}", value[key]),
              "invalid recovery replacement digest")
    fields = {"basisSha256", "indexSha256", "accountId", "region", "instanceArn",
              "instanceName", "sshTarget", "sshHostKeySha256"}
    _need(type(expected) is dict and set(expected) == fields
          and all(type(item) is str and 0 < len(item) <= 256 for item in expected.values()),
          "independent recovery replacement context differs")
    try:
        target_raw = value["targetOriginal"].encode("utf-8")
    except UnicodeError:
        raise release.ReleaseContractError("invalid recovery replacement target encoding") from None
    target = _installation_snapshot_target(target_raw)
    _need(all(expected[key] == value[key] for key in ("basisSha256", "indexSha256"))
          and all(expected[key] == target[key] for key in fields - {"basisSha256", "indexSha256"}),
          "replacement target differs from the independently selected context")
    _need(type(index_raw) is bytes and 0 < len(index_raw) <= MAX_INSTALL_RECORD
          and value["indexSha256"] == _hash(index_raw),
          "replacement index differs from the selected original")
    index = _snapshot_offhost_index_value(index_raw)
    _need(target["accountId"] == index["accountId"] and target["region"] == index["region"]
          and target["instanceArn"] != index["fromInstanceArn"]
          and target["instanceName"] != index["fromInstanceName"],
          "replacement must be a distinct instance in the reviewed account and region")
    materials = _snapshot_recovery_material_review(index_raw, payload, receipt, intent, writers, identity, fetch=fetch)
    _need(value["basisSha256"] == materials["basisSha256"],
          "replacement recovery basis differs from the reviewed originals")
    storage_raw = _installation_recovery_members(payload)[RECOVERY_STORAGE_MEMBER]
    storage = json.loads(storage_raw, object_pairs_hook=_unique)
    source = _installation_snapshot_target(storage["storageOriginals"]["targetOriginal"].encode("utf-8"))
    _need(target["sshTarget"] != source["sshTarget"],
          "replacement SSH route must not reuse the source route")
    _need(target["cloudSystemDiskSizeInGb"] == materials["basis"]["sourceSystemDiskSizeInGb"],
          "replacement disk size is outside the reviewed recovery scope")
    return {"schemaVersion": 1, "kind": "sanq-minimal-recovery-replacement-review",
        "outcome": "RECOVERY_REPLACEMENT_BOUND_EVIDENCE_REQUIRED",
        "basisSha256": materials["basisSha256"], "indexSha256": _hash(index_raw),
        "replacementInputSha256": _hash(replacement_raw), "replacementTarget": target,
        "replacementTargetReviewed": True, "materialBindingsReviewed": True,
        "sourceInstanceArn": source["instanceArn"], "sourceInstanceName": source["instanceName"],
        "sourceSshRouteExcluded": True, "requiresIndependentSshVerification": True,
        "sshEndpointIndependentlyAuthenticated": False, "cloudIsolationProven": False,
        "snapshotLineageProven": False, "replacementHostObserved": False,
        "requiredEvidence": list(RECOVERY_REQUIRED_EVIDENCE), "requiresIsolatedRestoreEvidence": True,
        "awsOriginAuthenticated": False, "trustedTimeProven": False, "restoreProven": False,
        "snapshotAvailable": False, "recoveryReady": False, "readyToInstall": False,
        "canExecute": False, "authorizedToMutateProduction": False, "requiresHostRecheck": True}


def _recovery_database_command_value(row, argv):
    _need(type(row) is dict and set(row) == {"argv", "returncode", "stdout", "stderr"}
          and type(row["argv"]) is list and _json(row["argv"]) == _json(argv)
          and type(row["returncode"]) is int and row["returncode"] == 0
          and type(row["stdout"]) is str and type(row["stderr"]) is str,
          "recovery database command, exit status or fields differ")
    try:
        _need(0 < len(row["stdout"].encode("utf-8")) <= MAX_HOST_OUTPUT
              and len(row["stderr"].encode("utf-8")) <= 4096
              and len(row["stdout"].encode("utf-8")) + len(row["stderr"].encode("utf-8")) <= MAX_HOST_OUTPUT,
              "recovery database command output exceeds budget")
    except UnicodeError:
        raise release.ReleaseContractError("invalid recovery database command encoding") from None
    try:
        return _docker_json(argv, lambda _: row["stdout"])
    except (ValueError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid recovery database command JSON") from None


def _snapshot_recovery_database_review(capture_raw, index_raw, payload, receipt, intent, writers,
                                       identity, replacement_raw, *, expected, database_container_id, fetch):
    """Recompute a scoped transcript comparison. No command replay or physical restore claim."""
    _need(type(capture_raw) is bytes and 0 < len(capture_raw) <= MAX_RECOVERY_HOST_BYTES
          and type(database_container_id) is str and re.fullmatch(r"[a-f0-9]{64}", database_container_id),
          "invalid recovery database capture input")
    try:
        value = json.loads(capture_raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid recovery database capture constant"))
        _need(_json(value) == capture_raw, "recovery database capture must be canonical")
    except (ValueError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid recovery database capture JSON") from None
    fields = {"schemaVersion", "kind", "basisSha256", "indexSha256", "replacementInputSha256",
              "databaseContainerId", "commands"}
    _need(type(value) is dict and set(value) == fields
          and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
          and value["kind"] == "sanq-minimal-recovery-database-capture"
          and value["databaseContainerId"] == database_container_id
          and type(value["commands"]) is list and len(value["commands"]) == 4,
          "recovery database capture fields differ")
    target = _snapshot_recovery_replacement_review(index_raw, payload, receipt, intent, writers,
        identity, replacement_raw, expected=expected, fetch=fetch)
    _need(all(type(value[key]) is str and value[key] == target[key] for key in
              ("basisSha256", "indexSha256", "replacementInputSha256")),
          "recovery database capture target or basis differs")
    argv = [_installation_history_args(database_container_id), _installation_storage_args(database_container_id)] * 2
    values = [_recovery_database_command_value(row, args) for row, args in zip(value["commands"], argv)]
    before = _installation_database_history_value(values[0])
    after = _installation_database_history_value(values[2])
    _need(_json(before) == _json(after) and _json(values[1]) == _json(values[3]),
          "recovery database identity, storage or history changed during capture")
    source = json.loads(_installation_recovery_members(payload)[RECOVERY_STORAGE_MEMBER],
                        object_pairs_hook=_unique)["originalObservation"]["prerequisites"]
    observed = {"databaseIdentity": {key: item for key, item in before.items() if key != "history"}}
    _installation_storage_database(values[1], observed)
    _need(_json(observed["databaseIdentity"]) == _json(source["databaseIdentity"])
          and len(before["history"]) == source["migrationHistoryRows"]
          and _hash(_json(before["history"])) == source["migrationHistorySha256"],
          "recovery database identity or history differs from source originals")
    return {"schemaVersion": 1, "kind": "sanq-minimal-recovery-database-review",
        "outcome": "RECOVERY_DATABASE_TRANSCRIPT_MATCHED_EVIDENCE_REQUIRED",
        **{key: target[key] for key in ("basisSha256", "indexSha256", "replacementInputSha256")},
        "captureSha256": _hash(capture_raw), "captureBytes": len(capture_raw),
        "databaseContainerId": database_container_id, "databaseTranscriptReviewed": True,
        "databaseIdentity": observed["databaseIdentity"],
        "migrationHistorySha256": _hash(_json(before["history"])), "migrationHistoryRows": len(before["history"]),
        "defaultTablespacesOnly": True, "readOnlyQuerySessionObserved": True,
        "commandOutputSha256": [_hash(row["stdout"].encode("utf-8")) for row in value["commands"]],
        "commandPortTargetAuthenticated": False, "databaseContainerBindingProven": False,
        "databaseImageIdentityProven": False, "fullClusterContentProven": False,
        "replacementHostObserved": False, "cloudIsolationProven": False, "snapshotLineageProven": False,
        "awsOriginAuthenticated": False, "trustedTimeProven": False, "restoreProven": False,
        "snapshotAvailable": False, "recoveryReady": False, "readyToInstall": False,
        "canExecute": False, "authorizedToMutateProduction": False,
        "requiredEvidence": list(RECOVERY_REQUIRED_EVIDENCE),
        "requiresIsolatedRestoreEvidence": True, "requiresHostRecheck": True}


def _capture_recovery_database_probe(index_raw, payload, receipt, intent, writers, identity,
                                     replacement_raw, *, expected, database_container_id, run, fetch, deadline):
    """Collect only four fixed queries through an already scoped port; return private raw bytes."""
    _need(callable(run) and callable(fetch) and type(database_container_id) is str
          and re.fullmatch(r"[a-f0-9]{64}", database_container_id), "invalid recovery database probe ports")
    _need(type(deadline) in (int, float) and time.monotonic() < deadline <= time.monotonic() + 300,
          "recovery database probe deadline differs")
    target = _snapshot_recovery_replacement_review(index_raw, payload, receipt, intent, writers,
        identity, replacement_raw, expected=expected, fetch=fetch)
    commands = []
    for argv in [_installation_history_args(database_container_id), _installation_storage_args(database_container_id)] * 2:
        _need(_runtime_observation_allowed(argv), "unreviewed recovery database probe command")
        _need(time.monotonic() < deadline, "recovery database probe deadline expired")
        result = run(list(argv), deadline=deadline)
        _need(time.monotonic() < deadline, "recovery database probe deadline expired")
        _need(type(result) is dict and set(result) == {"returncode", "stdout", "stderr"},
              "recovery database command port result differs")
        row = {"argv": list(argv), **result}
        _recovery_database_command_value(row, argv)
        commands.append(row)
        _need(len(_json(commands)) <= MAX_RECOVERY_HOST_BYTES, "recovery database capture exceeds budget")
    raw = _json({"schemaVersion": 1, "kind": "sanq-minimal-recovery-database-capture",
        **{key: target[key] for key in ("basisSha256", "indexSha256", "replacementInputSha256")},
        "databaseContainerId": database_container_id, "commands": commands})
    facts = _snapshot_recovery_database_review(raw, index_raw, payload, receipt, intent, writers,
        identity, replacement_raw, expected=expected, database_container_id=database_container_id, fetch=fetch)
    _need(time.monotonic() < deadline, "recovery database probe deadline expired")
    return facts, raw


# First-install tool files only. Permanent gates are handed over in a later owned stage.
INSTALL_TOOL_PATHS = (*HELPERS, *RUNTIME_MEMBERS, "runtime-release.json")


def _installation_tool_write_set(payload, source_sha, old, old_sha, observed, *, fetch):
    """Return a source-derived ordered plan and private target bytes, never installation authority."""
    _need(callable(fetch), "invalid installation tool source port")
    transition = review_transition(payload, source_sha, old, old_sha, fetch=fetch)
    _need(not transition["requiresAdditionalPlatformReview"], "tool write set exceeds reviewed platform scope")
    contents, _, _ = _review(payload, source_sha, fetch)
    old_manifest, old_files = _runtime_files(old, old_sha)
    _, target_files = _runtime_files(contents[RUNTIME_ARCHIVE], source_sha)
    with tarfile.open(fileobj=io.BytesIO(contents[RUNTIME_ARCHIVE]), mode="r:gz") as archive:
        target_files["runtime-release.json"] = archive.extractfile(
            bundle.RUNTIME_PREFIX + "/runtime-release.json").read(65537)
    _need(0 < len(target_files["runtime-release.json"]) <= 65536, "target Manifest exceeds write budget")
    _need(type(observed) is dict and set(observed) == {*RUNTIME_MEMBERS, "runtime-release.json"},
          "tool write set requires the complete original Runtime observation")
    for path, value in observed.items():
        _need(type(value) is tuple and len(value) == 2 and type(value[0]) is bytes
              and type(value[1]) is tuple and len(value[1]) == 9,
              "tool write set original fields differ")
        raw, identity = value
        _storage_metadata(list(identity))
        _need(0 < len(raw) <= (65536 if path == "runtime-release.json" else MAX_FILE)
              and identity[2] == len(raw) and identity[5:7] == (PRIVATE_OWNER_UID, PRIVATE_GROUP_GID),
              "tool write set original metadata differs")
        if path == "runtime-release.json":
            _need(_json(json.loads(raw, object_pairs_hook=_unique)) == _json(old_manifest),
                  "tool write set original Manifest differs")
        else:
            _need(raw == old_files[path], "tool write set original Runtime bytes differ")
    targets = {**{path: contents["sources/" + path] for path in HELPERS}, **target_files}
    operations = []
    for index, path in enumerate(INSTALL_TOOL_PATHS):
        previous = observed.get(path)
        raw, identity = previous if previous is not None else (None, None)
        after = targets[path]
        operations.append({"sequence": index, "path": path,
            "stage": "HELPERS" if path in HELPERS else "MANIFEST" if path == "runtime-release.json" else "RUNTIME",
            "action": "create" if raw is None else "verify" if raw == after else "replace",
            "beforeSha256": _hash(raw) if raw is not None else None,
            "expectedIdentity": list(identity) if identity is not None else None,
            "afterSha256": _hash(after), "bytes": len(after),
            "mode": stat.S_IMODE(identity[7]) if identity is not None else 0o644})
    body = {"schemaVersion": 1, "kind": "sanq-minimal-install-tool-write-set",
        "sourceSha": source_sha, "currentRuntimeSourceSha": old_sha, "kitSha256": _hash(payload),
        "oldArchiveSha256": _hash(old), "targetArchiveSha256": _hash(contents[RUNTIME_ARCHIVE]),
        "runtimeRoot": "/opt/sanq/runtime", "operations": operations}
    return {**body, "writeSetSha256": _hash(_json(body)), "outcome": "TOOL_WRITE_SET_REVIEWED",
        "sourceAuthenticated": True, "installedBaselineObserved": False,
        "restoreValidationDeferred": True, "restoreProven": False,
        "requiresSnapshotAndOffhostConfirmation": True, "requiresOwnedInstallationFlow": True,
        "requiresHostRecheck": True, "readyToInstall": False, "canExecute": False,
        "authorizedToMutateProduction": False}, targets


def _installation_tool_member_read(parent, path, *, _pending=False):
    _need(type(path) is str and path in INSTALL_TOOL_PATHS and type(_pending) is bool,
          "unreviewed installation tool path")
    name = ".sanq-install-" + Path(path).name + ".pending" if _pending else Path(path).name
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        before = os.fstat(fd)
        _installed_info(before)
        maximum = 65536 if path == "runtime-release.json" else MAX_FILE
        _need(0 < before.st_size <= maximum, "installation tool size differs")
        chunks, size = [], 0
        while size <= maximum:
            raw = os.read(fd, min(65536, maximum + 1 - size))
            if not raw:
                break
            chunks.append(raw)
            size += len(raw)
        _need(size == before.st_size and _installed_fingerprint(before) ==
              _installed_fingerprint(os.fstat(fd)) ==
              _installed_fingerprint(os.stat(name, dir_fd=parent, follow_symlinks=False)),
              "installation tool changed during read")
        return b"".join(chunks), _installed_fingerprint(before)
    finally:
        os.close(fd)


def _write_installation_tool_member(parent, path, before, after, *, expected_identity,
                                    parent_identity, check_context, deadline):
    """Private pinned-FD primitive. The future owned caller must authenticate source and hold both locks."""
    _need(os.geteuid() == 0 and type(parent) is int and parent >= 0
          and type(path) is str and path in INSTALL_TOOL_PATHS and callable(check_context)
          and type(after) is bytes and 0 < len(after) <= (65536 if path == "runtime-release.json" else MAX_FILE),
          "invalid installation tool write input")
    _need(type(parent_identity) is tuple and len(parent_identity) == 5
          and all(type(item) is int for item in parent_identity)
          and type(deadline) in (int, float) and time.monotonic() < deadline <= time.monotonic() + 300,
          "invalid installation tool parent or deadline")
    if path in HELPERS:
        _need(before is None and expected_identity is None, "first installation cannot replace an existing helper")
        mode = 0o644
    else:
        _need(type(before) is bytes and 0 < len(before) <= MAX_FILE
              and type(expected_identity) is tuple and len(expected_identity) == 9,
              "installation tool replacement needs original bytes and identity")
        _storage_metadata(list(expected_identity))
        _need(expected_identity[2] == len(before), "installation tool original size differs")
        _need(before == after or path in ALLOWED_CHANGES or path == "runtime-release.json",
              "installation tool replacement exceeds fixed platform scope")
        mode = stat.S_IMODE(expected_identity[7])
    name, temporary = Path(path).name, ".sanq-install-" + Path(path).name + ".pending"
    def context():
        _need(time.monotonic() < deadline, "installation tool write deadline expired")
        check_context()
        info = os.fstat(parent)
        _installed_info(info, directory=True)
        _need(_directory_identity(info) == parent_identity, "installation tool parent changed")
        _need(time.monotonic() < deadline, "installation tool write deadline expired")
    def original_matches():
        if before is None:
            try:
                os.stat(name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                return
            raise release.ReleaseContractError("first installation tool destination already exists")
        _need(_installation_tool_member_read(parent, path) == (before, expected_identity),
              "installation tool original changed")
    context()
    original_matches()
    try:
        os.stat(temporary, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise release.ReleaseContractError("installation tool pending file requires review")
    if before == after:
        context()
        original_matches()
        return {"path": path, "outcome": "TOOL_FILE_UNCHANGED_VERIFIED", "changed": False,
                "sha256": _hash(after), "canExecute": False}
    disk = os.fstatvfs(parent)
    _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + len(after),
          "installation tool write lacks disk reserve")
    fd = None
    try:
        _need(time.monotonic() < deadline, "installation tool write deadline expired")
        fd = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK,
                     0o600, dir_fd=parent)
        os.fchown(fd, PRIVATE_OWNER_UID, PRIVATE_GROUP_GID)
        offset = 0
        while offset < len(after):
            _need(time.monotonic() < deadline, "installation tool write deadline expired")
            count = os.write(fd, after[offset:offset + 65536])
            _need(type(count) is int and 0 < count <= min(65536, len(after) - offset),
                  "installation tool write made no progress")
            offset += count
        os.fchmod(fd, mode)
        os.fsync(fd)
        info = os.fstat(fd)
        _installed_info(info)
        expected = _installed_fingerprint(info)
        _need(info.st_size == len(after), "installation tool temporary size differs")
        os.lseek(fd, 0, os.SEEK_SET)
        chunks, size = [], 0
        while size <= len(after):
            chunk = os.read(fd, min(65536, len(after) + 1 - size))
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
        _need(b"".join(chunks) == after and expected == _installed_fingerprint(os.fstat(fd))
              == _installed_fingerprint(os.stat(temporary, dir_fd=parent, follow_symlinks=False)),
              "installation tool temporary readback differs")
        context()
        original_matches()
        _need(expected == _installed_fingerprint(os.fstat(fd))
              == _installed_fingerprint(os.stat(temporary, dir_fd=parent, follow_symlinks=False)),
              "installation tool temporary changed before publication")
        if before is None:
            os.link(temporary, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
            os.fsync(parent)
            os.unlink(temporary, dir_fd=parent)
        else:
            os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
        os.fsync(parent)
        current, identity = _installation_tool_member_read(parent, path)
        _need(current == after and identity == _installed_fingerprint(os.fstat(fd))
              and stat.S_IMODE(identity[7]) == mode, "installation tool published readback differs")
        context()
        _need(_installation_tool_member_read(parent, path) == (after, identity),
              "installation tool changed after context recheck")
        return {"path": path, "outcome": "TOOL_FILE_DURABLE", "changed": True,
                "sha256": _hash(after), "bytes": len(after), "identity": list(identity),
                "fileDurable": True, "canExecute": False}
    except BaseException:
        raise release.ReleaseContractError("TOOL_WRITE_UNCONFIRMED: preserve files and installation fence") from None
    finally:
        if fd is not None:
            os.close(fd)


@contextlib.contextmanager
def _installation_tool_directories(expected):
    """Pin the existing Runtime directories; no mkdir, redirection or target imports."""
    with contextlib.ExitStack() as stack:
        anchor = _state_parent()
        stack.callback(os.close, anchor)
        root = stack.enter_context(_installed_directory(anchor, "runtime"))
        directories = {(): root}
        for path in INSTALL_TOOL_PATHS:
            parts = Path(path).parts
            for depth in range(1, len(parts)):
                key = parts[:depth]
                if key not in directories:
                    directories[key] = stack.enter_context(_installed_directory(directories[key[:-1]], key[-1]))
        actual = {"/".join(parts): _directory_identity(os.fstat(fd)) for parts, fd in directories.items()}
        _need(actual == expected, "installation tool directory baseline changed")
        yield directories
        _need({"/".join(parts): _directory_identity(os.fstat(fd)) for parts, fd in directories.items()} == expected,
              "installation tool directories changed during write")


def _installation_tool_progress_check(progress):
    """Validate this call's partial writes as current facts, never pretend the old Runtime is installed."""
    original = progress["original"][0]
    rows = {row["path"]: row for row in progress["plan"]["operations"]}
    observed = {}
    with _installation_tool_directories(progress["original"][1]) as directories:
        allowed = {parts: set(names) for parts, names in progress["names"].items()}
        for path in INSTALL_TOOL_PATHS:
            parts = Path(path).parts
            parent, row = directories[parts[:-1]], rows[path]
            target = progress["targets"][path]
            completed = progress["completed"].get(path)
            active = progress["active"] == path
            try:
                actual = _installation_tool_member_read(parent, path)
            except FileNotFoundError:
                actual = None
            previous = original.get(path)
            if completed is not None:
                _need(actual == (target, completed), "completed installation tool changed")
            elif active and row["action"] != "verify":
                _need(actual == previous or actual is not None and actual[0] == target
                      and stat.S_IMODE(actual[1][7]) == row["mode"],
                      "active installation tool differs from original and target")
            else:
                _need(actual == previous, "unwritten installation tool changed")
            if path in HELPERS and actual is not None:
                _need(completed is not None or active, "unowned helper appeared")
                allowed[parts[:-1]].add(parts[-1])
            pending_name = ".sanq-install-" + parts[-1] + ".pending"
            try:
                pending = _installation_tool_member_read(parent, path, _pending=True)
            except FileNotFoundError:
                pending = None
            if pending is not None:
                _need(active and row["action"] != "verify" and actual == previous
                      and pending[0] == target and stat.S_IMODE(pending[1][7]) == row["mode"],
                      "installation pending file is outside this active write")
                allowed[parts[:-1]].add(pending_name)
            if actual is not None:
                observed[path] = {"sha256": _hash(actual[0]), "bytes": len(actual[0]), "identity": list(actual[1])}
        for parts, fd in directories.items():
            _need(set(os.listdir(fd)) == allowed[parts], "installation Runtime directory inventory changed")
    return observed


def _write_installation_tools(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh owned continuation only. Ends frozen after tool files, before permanent-gate handover."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True,
        include_application_binding=True, include_migrations=True, include_effective_configuration=True,
        include_external_backup=True, _record_intent=True, _load_deny_gates=True, _save_writers=True,
        _freeze_writers=True, _retain_recovery=True, _snapshot_target=target,
        _snapshot_channel=(input_fd, output_fd), _retain_snapshot_review=True, _confirm_offhost_index=True,
        _write_tools=True)


def _installation_loaded_gate_command(value, handover):
    needle = ("path=/usr/bin/false ; argv[]=/usr/bin/false ; ignore_errors=no"
              if handover is None or not handover["reloaded"] else
              "path=/usr/bin/python3 ; argv[]=" + COMMAND + " ; ignore_errors=no")
    return type(value) is str and needle + " ;" in value and value.count("path=") == value.count("argv[]=") == 1


INSTALL_GATE_PENDING = ".sanq-install-gate.pending"


def _installation_gate_leaf(root, name):
    _need(name in (INSTALL_GATE_NAME, INSTALL_GATE_PENDING), "unreviewed installation gate leaf")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        info = os.fstat(fd)
        _installed_info(info)
        _need(stat.S_IMODE(info.st_mode) == 0o644 and 0 < info.st_size <= 4096,
              "installation gate metadata differs")
        raw = os.read(fd, 4097)
        _need(len(raw) == info.st_size and _installed_fingerprint(info) == _installed_fingerprint(os.fstat(fd))
              == _installed_fingerprint(os.stat(name, dir_fd=root, follow_symlinks=False)),
              "installation gate changed during read")
        return raw, {"sha256": _hash(raw), "identity": list(_installed_fingerprint(info))}
    finally:
        os.close(fd)


def _installation_gate_handover_begin():
    original = _temporary_gate_files()
    root = _systemd_root()
    try:
        directories = {}
        for unit in DROPINS:
            with _temporary_gate_directory(root, unit) as directory:
                _need(_temporary_gate_read(directory, unit) == original[unit], "temporary gate changed before handover")
                directories[unit] = _directory_identity(os.fstat(directory))
        return {"original": original, "directories": directories, "completed": {},
                "active": None, "reloaded": False, "effectivePropertiesSha256": {}}
    finally:
        os.close(root)


def _installation_handover_gate_read(root, unit, progress):
    _need(_directory_identity(os.fstat(root)) == progress["directories"][unit],
          "installation gate directory replaced")
    raw, facts = _installation_gate_leaf(root, INSTALL_GATE_NAME)
    target = DROPINS[unit].encode()
    original = progress["original"][unit]
    if unit in progress["completed"]:
        _need(raw == target and facts == progress["completed"][unit], "completed permanent gate changed")
    elif progress["active"] == unit:
        _need(raw == INSTALL_DENY_DROPINS[unit] and facts == original or raw == target,
              "active gate differs from original and permanent target")
    else:
        _need(raw == INSTALL_DENY_DROPINS[unit] and facts == original, "unwritten temporary gate changed")
    allowed = {INSTALL_GATE_NAME}
    try:
        pending, _ = _installation_gate_leaf(root, INSTALL_GATE_PENDING)
    except FileNotFoundError:
        pass
    else:
        _need(progress["active"] == unit and facts == original and pending == target,
              "unowned permanent gate pending file")
        allowed.add(INSTALL_GATE_PENDING)
    _need(set(os.listdir(root)) == allowed, "installation gate directory inventory changed")
    return facts


def _installation_handover_gate_files(progress):
    root = _systemd_root()
    try:
        result = {}
        for unit in DROPINS:
            with _temporary_gate_directory(root, unit) as directory:
                result[unit] = _installation_handover_gate_read(directory, unit, progress)
        return result
    finally:
        os.close(root)


def _replace_installation_permanent_gate(unit, progress, *, check_context, deadline):
    """One fixed drop-in under this owned handover. Unknown results preserve actual files."""
    _need(os.geteuid() == 0 and type(unit) is str and unit in DROPINS and progress["active"] == unit
          and callable(check_context) and type(deadline) in (int, float)
          and time.monotonic() < deadline <= time.monotonic() + 300,
          "invalid permanent gate write context")
    check_context()
    root = _systemd_root()
    try:
        with _temporary_gate_directory(root, unit) as directory:
            _need(_directory_identity(os.fstat(directory)) == progress["directories"][unit],
                  "permanent gate parent changed before write")
            old, original = _installation_gate_leaf(directory, INSTALL_GATE_NAME)
            _need(old == INSTALL_DENY_DROPINS[unit] and original == progress["original"][unit],
                  "permanent gate original differs")
            raw = DROPINS[unit].encode()
            if raw == old:
                check_context()
                _need(time.monotonic() < deadline and _installation_gate_leaf(directory, INSTALL_GATE_NAME) == (old, original),
                      "unchanged socket gate drifted")
                return original
            disk = os.fstatvfs(directory)
            _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + len(raw),
                  "permanent gate write lacks reserve")
            fd = None
            try:
                _need(time.monotonic() < deadline, "permanent gate deadline expired")
                fd = os.open(INSTALL_GATE_PENDING, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK,
                             0o600, dir_fd=directory)
                os.fchown(fd, PRIVATE_OWNER_UID, PRIVATE_GROUP_GID)
                remaining = memoryview(raw)
                while remaining:
                    _need(time.monotonic() < deadline, "permanent gate deadline expired")
                    count = os.write(fd, remaining)
                    _need(type(count) is int and 0 < count <= len(remaining), "permanent gate write made no progress")
                    remaining = remaining[count:]
                os.fchmod(fd, 0o644)
                os.fsync(fd)
                staged, staged_facts = _installation_gate_leaf(directory, INSTALL_GATE_PENDING)
                _need(staged == raw and staged_facts["identity"] == list(_installed_fingerprint(os.fstat(fd))),
                      "permanent gate staged readback differs")
                check_context()
                _need(time.monotonic() < deadline and _installation_gate_leaf(directory, INSTALL_GATE_NAME) == (old, original)
                      and _installation_gate_leaf(directory, INSTALL_GATE_PENDING) == (raw, staged_facts),
                      "permanent gate changed before publication")
                os.replace(INSTALL_GATE_PENDING, INSTALL_GATE_NAME, src_dir_fd=directory, dst_dir_fd=directory)
                os.fsync(directory)
                actual, facts = _installation_gate_leaf(directory, INSTALL_GATE_NAME)
                _need(actual == raw and facts["identity"] == list(_installed_fingerprint(os.fstat(fd))),
                      "permanent gate published readback differs")
                check_context()
                _need(time.monotonic() < deadline and _installation_gate_leaf(directory, INSTALL_GATE_NAME) == (raw, facts),
                      "permanent gate changed after publication")
                return facts
            except BaseException:
                raise release.ReleaseContractError("GATE_HANDOVER_UNCONFIRMED: preserve gates and installation evidence") from None
            finally:
                if fd is not None:
                    os.close(fd)
    finally:
        os.close(root)


def _handover_installation_permanent_gates(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh install continuation through permanent file/loading checks; application remains frozen."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True,
        include_application_binding=True, include_migrations=True, include_effective_configuration=True,
        include_external_backup=True, _record_intent=True, _load_deny_gates=True, _save_writers=True,
        _freeze_writers=True, _retain_recovery=True, _snapshot_target=target,
        _snapshot_channel=(input_fd, output_fd), _retain_snapshot_review=True, _confirm_offhost_index=True,
        _write_tools=True, _handover_gates=True)


INSTALL_GATE_API_ARGS = (
    "/usr/bin/python3", "-E", "-S", "-B", "-X", "pycache_prefix=/dev/null",
    "/opt/sanq/runtime/ops/release/maintenance_guard.py", "check-installation-fence")


def _installation_gate_api_value(raw, intent, installation_id):
    marker = _installation_marker_bytes(intent, installation_id)
    _need(type(raw) is str and 0 < len(raw) <= 4096, "installed gate API output exceeds budget")
    value = json.loads(raw, object_pairs_hook=_unique,
                       parse_constant=lambda _: _need(False, "invalid installed gate API constant"))
    expected = {"schemaVersion": 1, "kind": "sanq-minimal-installation-fence-observation",
                "installationId": installation_id, "markerSha256": _hash(marker),
                "installedGateChecked": True, "startupDenied": True,
                "installationComplete": False, "canExecute": False}
    _need(type(value) is dict and value == expected and type(value["schemaVersion"]) is int
          and all(type(value[key]) is bool for key in ("installedGateChecked", "startupDenied",
                                                       "installationComplete", "canExecute"))
          and raw == _json(value).decode("ascii"), "installed gate API result differs from this installation")
    return {**value, "reportSha256": _hash(raw.encode("ascii"))}


def _installation_gate_api_observation(intent, installation_id, *, check_context, deadline):
    _installation_marker_bytes(intent, installation_id)
    _need(callable(check_context) and type(deadline) in (int, float)
          and time.monotonic() < deadline <= time.monotonic() + 300,
          "invalid installed gate API context")
    check_context()
    raw = _bounded_host_client(list(INSTALL_GATE_API_ARGS), deadline=deadline, _installation_gate_api=True)
    check_context()
    value = _installation_gate_api_value(raw, intent, installation_id)
    _need(time.monotonic() < deadline, "installed gate API deadline expired")
    return value


def _verify_installation_permanent_gate_api(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh owned install through installed gate API checks; no application restart or completion."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True,
        include_application_binding=True, include_migrations=True, include_effective_configuration=True,
        include_external_backup=True, _record_intent=True, _load_deny_gates=True, _save_writers=True,
        _freeze_writers=True, _retain_recovery=True, _snapshot_target=target,
        _snapshot_channel=(input_fd, output_fd), _retain_snapshot_review=True, _confirm_offhost_index=True,
        _write_tools=True, _handover_gates=True, _verify_gate_api=True)


def _saved_application_start_args(intent, writers, identity, role):
    value = _installation_writers_match(intent, writers, identity)
    _need(type(role) is str and role in INSTALL_WRITER_ROLES, "unreviewed saved application role")
    return [*DOCKER, "start", value["containers"][role]["containerId"]]


def _installation_application_start_command(intent, writers, identity, role, *, deadline):
    args = _saved_application_start_args(intent, writers, identity, role)
    output = _bounded_host_client(args, deadline=deadline, _application_start=(intent, writers, identity, role))
    _need(output in (args[-1], args[-1] + "\n"), "unexpected saved application start output")


def _installation_application_lifetime(info, saved):
    _need(type(info) is dict and info.get("Id") == saved["containerId"]
          and type(info.get("State")) is dict, "restarted application identity or state differs")
    state, count = info["State"], info.get("RestartCount")
    stamp = state.get("StartedAt")
    _need(type(stamp) is str and re.fullmatch(
          r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z", stamp)
          and type(count) is int and count >= 0 and count in (0, saved["restartCount"]),
          "restarted application lifetime differs")
    _need(dt.datetime.fromisoformat(stamp[:-1] + "+00:00")
          > dt.datetime.fromisoformat(saved["startedAt"][:-1] + "+00:00"),
          "saved application did not enter a new lifetime")
    return {"startedAt": stamp, "restartCount": count}


def _installation_application_observation(progress, run):
    value = _installation_writers_match(progress["intent"], progress["writers"], progress["identity"])
    _need(value["containers"] == progress["docker"]["containers"]
          and type(progress["started"]) is dict and set(progress["started"]) <= set(INSTALL_WRITER_ROLES)
          and type(progress["requireHealthy"]) is bool
          and (not progress["requireHealthy"] or set(progress["started"]) == set(INSTALL_WRITER_ROLES)),
          "invalid original application progress")
    restored = progress.get("restoredPolicies", set())
    _need(type(restored) is set and restored <= set(INSTALL_WRITER_ROLES)
          and (not restored or progress["requireHealthy"] is True), "invalid original policy restoration progress")
    rows = {role: dict(row) for role, row in value["containers"].items()}
    for role, lifetime in progress["started"].items():
        _need(type(lifetime) is dict and set(lifetime) == {"startedAt", "restartCount"},
              "restarted application lifetime fields differ")
        _installation_application_lifetime({"Id": rows[role]["containerId"],
            "State": {"StartedAt": lifetime["startedAt"]}, "RestartCount": lifetime["restartCount"]}, rows[role])
        rows[role].update(lifetime)
    health = _installation_writer_observation({**value, "containers": rows}, progress["docker"], run,
        set(INSTALL_WRITER_ROLES) - restored, set(INSTALL_WRITER_ROLES) - set(progress["started"]),
        _allow_starting=not progress["requireHealthy"])
    progress["health"] = health
    return health


def _installation_restarted_binding(docker, original, run):
    current = _application_binding_snapshot(docker, run)
    _need({key: val for key, val in current.items() if key != "network"}
          == {key: val for key, val in original.items() if key != "network"},
          "restarted application environment or database target differs")
    before, after = original["network"], current["network"]
    _need(all(after[key] == before[key] for key in ("networkId", "subnet", "gateway"))
          and after["endpoints"]["db"] == before["endpoints"]["db"]
          and all(after["endpoints"][role]["containerId"] == before["endpoints"][role]["containerId"]
                  and after["endpoints"][role]["aliases"] == before["endpoints"][role]["aliases"]
                  for role in INSTALL_WRITER_ROLES),
          "restarted application network or original database endpoint differs")
    return current


def _start_saved_installation_application(progress, *, run, check_context, bind_application, deadline):
    _need(type(progress) is dict and not progress["started"] and progress["requireHealthy"] is False
          and progress["attempted"] is False and callable(check_context) and callable(bind_application)
          and type(deadline) in (int, float) and time.monotonic() < deadline <= time.monotonic() + 300,
          "invalid saved application start context")
    value = _installation_writers_match(progress["intent"], progress["writers"], progress["identity"])
    check_context()
    _installation_application_observation(progress, run)
    for role in INSTALL_WRITER_ROLES:
        check_context()
        _need(time.monotonic() < deadline, "saved application start deadline expired")
        progress["attempted"] = True
        _installation_application_start_command(progress["intent"], progress["writers"], progress["identity"],
                                                 role, deadline=deadline)
        saved = value["containers"][role]
        actual = _docker_json((*DOCKER, "inspect", "--type", "container", "--format", "{{json .}}",
                               saved["containerId"]), run)
        progress["started"][role] = _installation_application_lifetime(actual, saved)
        check_context()
        _installation_application_observation(progress, run)
    while True:
        _need(time.monotonic() < deadline, "saved application health deadline expired")
        check_context()
        health = _installation_application_observation(progress, run)
        if all(health.get(role) == "healthy" for role in INSTALL_WRITER_ROLES):
            break
        time.sleep(min(0.5, max(0, deadline - time.monotonic())))
    progress["requireHealthy"] = True
    check_context()
    progress["binding"] = bind_application()
    check_context()
    statuses = {}
    for url in READINESS_URLS:
        _need(time.monotonic() < deadline, "saved application readiness deadline expired")
        check_context()
        code = _runtime_command(list((*CURL_ARGS, url)), deadline=deadline)
        _need(code == "200", "saved application readiness endpoint is not ready")
        statuses[url] = 200
        check_context()
    _need(time.monotonic() < deadline, "saved application verification deadline expired")
    check_context()
    return {"outcome": "OLD_APPLICATION_READY_RESTART_INHIBITED",
            "oldApplicationVerified": True, "writersFrozen": False, "writersRestartInhibited": True,
            "applicationLifetimes": {role: dict(row) for role, row in progress["started"].items()},
            "applicationBindingSha256": _hash(_json(progress["binding"])), "readiness": statuses,
            "requiresApplicationVerification": False, "requiresRestartPolicyRestoration": True,
            "installationComplete": False, "canExecute": False}


@contextlib.contextmanager
def _installation_application_ownership(progress):
    try:
        yield
    except BaseException:
        if progress.get("attempted") and not progress.get("containmentAttempted"):
            progress["containmentAttempted"] = True
            # A fresh containment budget is never a budget for resuming or reopening.
            deadline = time.monotonic() + 300
            for action, roles in (("disable-restart", INSTALL_WRITER_ROLES),
                                  ("stop", tuple(reversed(INSTALL_WRITER_ROLES)))):
                for role in roles:
                    try:
                        _installation_writer_command(progress["intent"], progress["writers"],
                            progress["identity"], role, action, deadline=deadline)
                    except BaseException:
                        pass
        if progress.get("attempted"):
            raise release.ReleaseContractError(
                "FENCE_UNCONFIRMED: review restarted original application and retained installation evidence") from None
        raise


def _verify_installation_old_application(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh owned install through original-ID readiness; restart remains inhibited."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True,
        include_application_binding=True, include_migrations=True, include_effective_configuration=True,
        include_external_backup=True, _record_intent=True, _load_deny_gates=True, _save_writers=True,
        _freeze_writers=True, _retain_recovery=True, _snapshot_target=target,
        _snapshot_channel=(input_fd, output_fd), _retain_snapshot_review=True, _confirm_offhost_index=True,
        _write_tools=True, _handover_gates=True, _verify_gate_api=True, _verify_application=True)


def _saved_restart_policy_args(intent, writers, identity, role):
    value = _installation_writers_match(intent, writers, identity)
    _need(type(role) is str and role in INSTALL_WRITER_ROLES, "unreviewed saved policy role")
    policy = value["containers"][role]["restartPolicy"]
    argument = policy["Name"] + (":" + str(policy["MaximumRetryCount"]) if policy["Name"] == "on-failure" else "")
    return [*DOCKER, "update", "--restart=" + argument, value["containers"][role]["containerId"]]


def _installation_restart_policy_command(intent, writers, identity, role, *, deadline):
    args = _saved_restart_policy_args(intent, writers, identity, role)
    output = _bounded_host_client(args, deadline=deadline, _policy_restore=(intent, writers, identity, role))
    _need(output in (args[-1], args[-1] + "\n"), "unexpected saved restart policy output")


def _restore_saved_installation_policies(progress, *, run, check_context, deadline):
    _need(type(progress) is dict and progress["requireHealthy"] is True and progress["attempted"] is True
          and set(progress["started"]) == set(INSTALL_WRITER_ROLES) and progress.get("binding") is not None
          and type(progress.get("restoredPolicies", set())) is set and not progress.get("restoredPolicies", set())
          and callable(check_context) and type(deadline) in (int, float)
          and time.monotonic() < deadline <= time.monotonic() + 300,
          "original restart policy restoration lacks this ready application context")
    value = _installation_writers_match(progress["intent"], progress["writers"], progress["identity"])
    progress["restoredPolicies"] = set()
    check_context()
    _installation_application_observation(progress, run)
    for role in INSTALL_WRITER_ROLES:
        check_context()
        _need(time.monotonic() < deadline, "saved restart policy deadline expired")
        if value["containers"][role]["restartPolicy"]["Name"] != "no":
            _installation_restart_policy_command(progress["intent"], progress["writers"], progress["identity"],
                                                 role, deadline=deadline)
        progress["restoredPolicies"].add(role)
        _installation_application_observation(progress, run)
        check_context()
    statuses = {}
    for url in READINESS_URLS:
        _need(time.monotonic() < deadline, "post-policy readiness deadline expired")
        check_context()
        _need(_runtime_command(list((*CURL_ARGS, url)), deadline=deadline) == "200",
              "post-policy application readiness failed")
        statuses[url] = 200
        check_context()
    _need(time.monotonic() < deadline, "saved restart policy verification deadline expired")
    check_context()
    _installation_application_observation(progress, run)
    policies = {role: dict(value["containers"][role]["restartPolicy"]) for role in INSTALL_WRITER_ROLES}
    return {"outcome": "ORIGINAL_RESTART_POLICIES_RESTORED_MAINTENANCE_ACTIVE",
            "restartPoliciesRestored": True, "applicationRestartPolicies": policies,
            "writersRestartInhibited": all(row["Name"] == "no" for row in policies.values()),
            "writersFrozen": False, "restartPolicyReadiness": statuses,
            "requiresRestartPolicyRestoration": False, "requiresInstallationCompletion": True,
            "installationComplete": False, "canExecute": False}


def _restore_installation_restart_policies(retention_id, target, *, input_fd, output_fd, fetch=release.github_json):
    """Fresh owned continuation through exact original policies; installation marker remains."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True,
        include_application_binding=True, include_migrations=True, include_effective_configuration=True,
        include_external_backup=True, _record_intent=True, _load_deny_gates=True, _save_writers=True,
        _freeze_writers=True, _retain_recovery=True, _snapshot_target=target,
        _snapshot_channel=(input_fd, output_fd), _retain_snapshot_review=True, _confirm_offhost_index=True,
        _write_tools=True, _handover_gates=True, _verify_gate_api=True, _verify_application=True,
        _restore_policies=True)



INSTALL_COMPLETION_FILE = "completion.json"
INSTALL_COMPLETION_KIND = "sanq-minimal-executor-install-completion-prepared"
INSTALL_COMPLETION_DIGESTS = ("intentSha256", "writersSha256", "recoveryArchiveSha256",
    "recoveryReceiptSha256", "snapshotReviewSha256", "offHostReceiptSha256", "markerSha256", "verificationSha256")


def _installation_completion_value(raw, identity):
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_INSTALL_RECORD
          and type(identity) is str and re.fullmatch(r"[a-f0-9]{64}", identity), "invalid completion record input")
    try:
        value = json.loads(raw, object_pairs_hook=_unique,
            parse_constant=lambda _: _need(False, "invalid completion JSON constant"))
        _need(type(value) is dict and set(value) == {
            "schemaVersion", "kind", "installationId", "createdAt", "phase",
            "installationComplete", "canExecute", "restoreProven", *INSTALL_COMPLETION_DIGESTS}
            and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
            and value["kind"] == INSTALL_COMPLETION_KIND and value["installationId"] == identity
            and value["phase"] == "PREPARED_BEFORE_MARKER_CLEAR"
            and all(value[key] is False for key in ("installationComplete", "canExecute", "restoreProven")),
            "completion record is not an inert pre-clear audit")
        for key in INSTALL_COMPLETION_DIGESTS:
            _need(type(value[key]) is str and re.fullmatch(r"[a-f0-9]{64}", value[key]), "invalid completion digest")
        stamp = value["createdAt"]
        _need(type(stamp) is str and re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z", stamp),
            "invalid completion UTC audit time")
        dt.datetime.fromisoformat(stamp[:-1] + "+00:00")
        _need(_json(value) == raw, "completion record requires canonical original bytes")
        return value
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise release.ReleaseContractError("invalid completion record") from None


def _installation_completion_bytes(intent, writers, identity, recovery, snapshot_review, offhost, facts):
    _installation_writers_match(intent, writers, identity)
    _need(type(facts) is dict and all(facts.get(key) is True for key in (
        "toolFilesWritten", "permanentGatesLoaded", "permanentGateApiVerified",
        "oldApplicationVerified", "restartPoliciesRestored", "snapshotMaterialsConfirmed"))
        and all(facts.get(key) is False for key in ("installationComplete", "canExecute", "restoreProven"))
        and facts.get("requiresInstallationCompletion") is True
        and set(facts.get("toolFiles", {})) == set(INSTALL_TOOL_PATHS)
        and type(facts.get("restartPolicyReadiness")) is dict
        and set(facts["restartPolicyReadiness"]) == set(READINESS_URLS)
        and all(type(code) is int and code == 200 for code in facts["restartPolicyReadiness"].values()),
        "completion requires this full verified application flow")
    _need(type(recovery) is tuple and len(recovery) == 2 and set(recovery[0]) == RECOVERY_FILES,
          "completion requires the original durable recovery pair")
    files = recovery[0]
    _snapshot_review_value(snapshot_review, files["recovery.tar"], files["recovery.json"], intent, writers, identity)
    _snapshot_offhost_record_value(offhost, snapshot_review, files["recovery.tar"], files["recovery.json"],
                                  intent, writers, identity)
    values = (intent, writers, files["recovery.tar"], files["recovery.json"],
              snapshot_review, offhost, _installation_marker_bytes(intent, identity), _json(facts))
    raw = _json({"schemaVersion": 1, "kind": INSTALL_COMPLETION_KIND, "installationId": identity,
        "createdAt": _snapshot_utc_now(), "phase": "PREPARED_BEFORE_MARKER_CLEAR",
        "installationComplete": False, "canExecute": False, "restoreProven": False,
        **{key: _hash(content) for key, content in zip(INSTALL_COMPLETION_DIGESTS, values)}})
    _installation_completion_value(raw, identity)
    return raw


def _clear_owned_installation_marker(root, intent, identity, *, check_context, mark_cleared, deadline, expected_identity):
    """Last owned mutation only; unknown unlink/fsync never retries or recreates a marker."""
    _need(os.geteuid() == 0 and callable(check_context) and callable(mark_cleared)
          and type(deadline) in (int, float) and time.monotonic() < deadline <= time.monotonic() + 300,
          "invalid final marker-clear context")
    expected = _installation_marker_bytes(intent, identity)
    _private_info(os.fstat(root), directory=True)
    directory = _directory_identity(os.fstat(root))
    check_context()
    _need(set(os.listdir(root)) == {"active.json"}
          and _installation_record_read(root, "active.json", identity) == expected,
          "final marker is not this owned installation")
    fd = os.open("active.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        _need(_installed_fingerprint(before) == expected_identity, "original owned marker identity changed")
        check_context()
        actual = os.stat("active.json", dir_fd=root, follow_symlinks=False)
        _private_info(actual)
        _need(time.monotonic() < deadline and directory == _directory_identity(os.fstat(root))
              and set(os.listdir(root)) == {"active.json"}
              and _installed_fingerprint(before) == _installed_fingerprint(os.fstat(fd))
              == _installed_fingerprint(actual)
              and _installation_record_read(root, "active.json", identity) == expected,
              "final owned marker changed before unlink")
        os.unlink("active.json", dir_fd=root)
        mark_cleared()
        os.fsync(root)
        _need(not os.listdir(root) and directory == _directory_identity(os.fstat(root))
              and time.monotonic() < deadline, "marker removal durability or directory changed")
        check_context()
        _need(not os.listdir(root) and time.monotonic() < deadline, "marker reappeared after final observation")
    finally:
        os.close(fd)


def _complete_installation(retention_id, target, *, input_fd, output_fd, fetch=release.github_json, task_source_sha=None):
    """Fresh owned complete flow; neither disk receipts nor old progress authorize replay."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True,
        include_application_binding=True, include_migrations=True, include_effective_configuration=True,
        include_external_backup=True, _record_intent=True, _load_deny_gates=True, _save_writers=True,
        _freeze_writers=True, _retain_recovery=True, _snapshot_target=target,
        _snapshot_channel=(input_fd, output_fd), _retain_snapshot_review=True, _confirm_offhost_index=True,
        _write_tools=True, _handover_gates=True, _verify_gate_api=True, _verify_application=True,
        _restore_policies=True, _complete_installation=True, _task_source_sha=task_source_sha)


# First-install material entry only. This is not the paused protected-loader work:
# an authorized operator must review/provision these five files BEFORE Python starts.
BOOTSTRAP_IMPORTS = (
    BOOTSTRAP, "ops/release/release_contract.py", "ops/runtime/build_bundle.py",
    "ops/runtime/versioned_release_contract.py", "ops/runtime/runtime_trust.py",
)


def _bootstrap_invocation(source_sha):
    sha = release.require_sha(source_sha)
    root = STATE_PARENT / "install-bootstrap" / sha
    _need(os.geteuid() == 0 and sys.platform == "linux"
          and sys.implementation.name == "cpython" and sys.version_info >= (3, 10)
          and sys.executable == "/usr/bin/python3"
          and sys.flags.isolated == 1 and sys.flags.no_site == 1
          and sys.flags.dont_write_bytecode == 1,
          "material entry requires reviewed root system Python with -I -S -B")
    origins = {
        BOOTSTRAP: __file__,
        "ops/release/release_contract.py": release.__file__,
        "ops/runtime/build_bundle.py": bundle.__file__,
        "ops/runtime/versioned_release_contract.py": historical.__file__,
        "ops/runtime/runtime_trust.py": getattr(sys.modules.get("runtime_trust"), "__file__", None),
    }
    _need(ROOT == root and all(type(path) is str and path == str(root / name)
          for name, path in origins.items()), "bootstrap imports are not the fixed reviewed source tree")
    return sha


def _bootstrap_read(fd, parent, name):
    before = os.fstat(fd)
    _private_info(before)
    _need(0 < before.st_size <= MAX_FILE, "bootstrap source size differs")
    os.lseek(fd, 0, os.SEEK_SET)
    chunks, size = [], 0
    while size <= MAX_FILE:
        raw = os.read(fd, min(65536, MAX_FILE + 1 - size))
        if not raw:
            break
        chunks.append(raw)
        size += len(raw)
    after = os.fstat(fd)
    actual = os.stat(name, dir_fd=parent, follow_symlinks=False)
    _private_info(after)
    _private_info(actual)
    identity = _installed_fingerprint(before)
    _need(size == before.st_size and identity == _installed_fingerprint(after)
          == _installed_fingerprint(actual), "bootstrap source changed during read")
    return b"".join(chunks), identity


@contextlib.contextmanager
def _bound_bootstrap_sources(payload, source_sha, *, fetch=release.github_json):
    """Hold independently provisioned source FDs; never extract/import kit Python."""
    sha = _bootstrap_invocation(source_sha)
    inventory = {
        ("install-bootstrap",): {sha},
        ("install-bootstrap", sha): {"ops"},
        ("install-bootstrap", sha, "ops"): {"release", "runtime"},
        ("install-bootstrap", sha, "ops", "release"): {"install_minimal_executor.py", "release_contract.py"},
        ("install-bootstrap", sha, "ops", "runtime"): {
            "build_bundle.py", "versioned_release_contract.py", "runtime_trust.py"},
    }
    with contextlib.ExitStack() as stack:
        anchor = _state_parent()
        stack.callback(os.close, anchor)
        anchor_identity = _directory_identity(os.fstat(anchor))
        folders, folder_ids = {(): anchor}, {}
        for parts in inventory:
            parent = folders[parts[:-1]]
            fd = os.open(parts[-1], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            stack.callback(os.close, fd)
            _private_info(os.fstat(fd), directory=True)
            folders[parts] = fd
            folder_ids[parts] = _directory_identity(os.fstat(fd))
        files, observed = {}, {}
        for path in BOOTSTRAP_IMPORTS:
            parts = ("install-bootstrap", sha, *Path(path).parts)
            parent = folders[parts[:-1]]
            fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            stack.callback(os.close, fd)
            files[path] = (fd, parent, parts[-1])
            observed[path] = _bootstrap_read(fd, parent, parts[-1])

        def check():
            _need(_bootstrap_invocation(sha) == sha, "bootstrap invocation changed")
            fresh = _state_parent()
            try:
                _need(anchor_identity == _directory_identity(os.fstat(anchor))
                      == _directory_identity(os.fstat(fresh)), "bootstrap anchor changed")
            finally:
                os.close(fresh)
            for parts, expected in inventory.items():
                fd = folders[parts]
                actual = os.stat(parts[-1], dir_fd=folders[parts[:-1]], follow_symlinks=False)
                _private_info(actual, directory=True)
                _private_info(os.fstat(fd), directory=True)
                _need(folder_ids[parts] == _directory_identity(os.fstat(fd))
                      == _directory_identity(actual) and set(os.listdir(fd)) == expected,
                      "bootstrap directory or inventory changed")
            for path, (fd, parent, name) in files.items():
                _need(_bootstrap_read(fd, parent, name) == observed[path],
                      "original bootstrap source replaced or modified")

        check()
        contents, _, _ = _review(payload, sha, fetch)
        _need(all(observed[path][0] == contents["sources/" + path] for path in BOOTSTRAP_IMPORTS),
              "reviewed bootstrap bytes differ from exact published source")
        check()
        yield check
        check()


def _retain_from_bound_bootstrap(payload, source_sha, current_runtime, current_source_sha,
                                 *, fetch=release.github_json):
    """Finite material-only adapter; no host preflight, maintenance or installation."""
    with _bound_bootstrap_sources(payload, source_sha, fetch=fetch) as check:
        check()
        result = _retain_verified_materials(payload, source_sha, current_runtime, current_source_sha, fetch=fetch)
        check()
    return result


# Read-only manager binding for the pending first-install adapter. These internal
# roles are not CLI commands yet; no unit is submitted and no cleanup is authorized.
INSTALL_TASK_PREFIX = "sanq-runtime-install-"
INSTALL_TASK_KEYS = (
    "LoadState", "Transient", "Type", "Restart", "RemainAfterExit", "KillMode",
    "ActiveState", "SubState", "MainPID", "ControlPID", "ControlGroup", "InvocationID",
    "ExecStart", "ExecStopPost", "ExecStartPre", "ExecStartPost", "ExecStop", "ExecCondition",
    "NeedDaemonReload", "DropInPaths", "FragmentPath", "WorkingDirectory", "User", "Group",
    "Environment", "EnvironmentFiles", "PassEnvironment", "UnsetEnvironment",
    "RootDirectory", "RootImage", "SuccessExitStatus",
)


def _installation_task_id(retention_id):
    _need(type(retention_id) is str and re.fullmatch(r"[a-f0-9]{64}", retention_id),
          "invalid installation task retention identity")
    return retention_id


def _installation_task_argv(source_sha, retention_id, role):
    sha = release.require_sha(source_sha)
    identity = _installation_task_id(retention_id)
    _need(type(role) is str and role in ("run", "cleanup"), "invalid installation task role")
    script = "/opt/sanq/install-bootstrap/" + sha + "/" + BOOTSTRAP
    return ["/usr/bin/python3", "-I", "-S", "-B", script, "installation-" + role,
            "--source-sha", sha, "--retention-id", identity]


def _installation_task_show_args(retention_id):
    unit = INSTALL_TASK_PREFIX + _installation_task_id(retention_id) + ".service"
    return [*SYSTEMCTL, "show", unit, "--no-pager", "--property=" + ",".join(INSTALL_TASK_KEYS)]


def _installation_task_show_allowed(args):
    if type(args) is not list or len(args) != 6 or not all(type(v) is str for v in args):
        return False
    unit = args[3]
    match = re.fullmatch(re.escape(INSTALL_TASK_PREFIX) + r"([a-f0-9]{64})\.service", unit)
    return match is not None and args == _installation_task_show_args(match.group(1))


def _installation_task_exec_matches(raw, args):
    # Exactly one manager command entry. Runtime metadata is not an argv suffix.
    return (type(raw) is str and len(raw) <= 16384 and raw.count("argv[]=") == 1
            and raw.count("path=") == 1
            and re.fullmatch(r"\{\s*path=/usr/bin/python3\s*;\s*argv\[\]="
                + re.escape(" ".join(args)) + r"\s*;\s*ignore_errors=no\s*;[^{}]*\}", raw) is not None)


def _installation_task_process_file(name):
    _need(name in ("cgroup", "cmdline"), "unreviewed task process input")
    # Fixed procfs observations, never a caller-supplied PID or file path.
    with open("/proc/self/" + name, "rb") as source:
        raw = source.read(65537)
    _need(0 < len(raw) <= 65536, "task process observation exceeds budget")
    return raw


def _installation_task_context(source_sha, retention_id, role, *, deadline):
    """Manager facts only; not authority to load disk writers, mutate or skip cleanup."""
    _bootstrap_invocation(source_sha)
    argv = _installation_task_argv(source_sha, retention_id, role)
    unit = INSTALL_TASK_PREFIX + retention_id + ".service"
    _need(type(deadline) in (int, float) and time.monotonic() < deadline <= time.monotonic() + 30,
          "invalid installation manager observation budget")
    raw = _bounded_host_client(_installation_task_show_args(retention_id), deadline=deadline)
    _need(type(raw) is str and 0 < len(raw.encode("utf-8")) <= 65536
          and all(char == "\n" or 32 <= ord(char) < 127 for char in raw),
          "installation manager output exceeds budget or contains controls")
    fields = {}
    for line in raw.splitlines():
        key, separator, value = line.partition("=")
        _need(separator == "=" and key in INSTALL_TASK_KEYS and key not in fields,
              "ambiguous installation manager property")
        fields[key] = value
    _need(set(fields) == set(INSTALL_TASK_KEYS), "incomplete installation manager properties")
    expected = {
        "LoadState": "loaded", "Transient": "yes", "Type": "oneshot", "Restart": "no",
        "RemainAfterExit": "yes", "KillMode": "control-group", "NeedDaemonReload": "no",
        "FragmentPath": "/run/systemd/transient/" + unit,
        "WorkingDirectory": "/opt/sanq/install-bootstrap/" + source_sha,
        "User": "root", "Group": "root", "ControlGroup": "/system.slice/" + unit,
        **{key: "" for key in ("DropInPaths", "ExecStartPre", "ExecStartPost", "ExecStop", "ExecCondition",
            "Environment", "EnvironmentFiles", "PassEnvironment", "UnsetEnvironment",
            "RootDirectory", "RootImage", "SuccessExitStatus")},
    }
    _need(all(fields[key] == value for key, value in expected.items())
          and Path.cwd() == Path(expected["WorkingDirectory"]),
          "unreviewed installation manager context")
    invocation = fields["InvocationID"]
    _need(re.fullmatch(r"[a-f0-9]{32}", invocation) is not None and invocation != "0" * 32
          and os.environ.get("INVOCATION_ID") == invocation,
          "installation manager invocation differs")
    pid = str(os.getpid())
    if role == "run":
        _need(fields["ActiveState"] == "activating" and fields["SubState"] == "start"
              and fields["MainPID"] in ("0", pid) and fields["ControlPID"] in ("0", pid)
              and pid in (fields["MainPID"], fields["ControlPID"]), "not the installation main process")
    else:
        _need(fields["ActiveState"] == "deactivating" and fields["SubState"] == "stop-post"
              and fields["ControlPID"] == pid and fields["MainPID"] == "0",
              "not the installation stop-post process")
    _need(_installation_task_exec_matches(fields["ExecStart"],
              _installation_task_argv(source_sha, retention_id, "run"))
          and _installation_task_exec_matches(fields["ExecStopPost"],
              _installation_task_argv(source_sha, retention_id, "cleanup")),
          "installation manager commands differ")
    _need(_installation_task_process_file("cgroup") == ("0::/system.slice/" + unit + "\n").encode("ascii")
          and _installation_task_process_file("cmdline") == b"\0".join(v.encode("ascii") for v in argv) + b"\0",
          "installation process cgroup or actual argv differs")
    _need(time.monotonic() < deadline, "installation manager observation expired")
    return {"sourceSha": source_sha, "retentionId": retention_id, "unit": unit, "invocationId": invocation, "role": role,
            "managerContextObserved": True, "installationComplete": False, "canExecute": False}


# Inert original-record association for a future owned installation handoff.
# No persistence, task submission, disk-record adoption or cleanup permission.
def _installation_task_originals_bytes(context, intent, writers, identity):
    _need(type(context) is dict and set(context) == {"sourceSha", "retentionId", "unit", "invocationId",
          "role", "managerContextObserved", "installationComplete", "canExecute"}
          and context["role"] == "run" and context["managerContextObserved"] is True
          and context["installationComplete"] is False and context["canExecute"] is False,
          "original record association requires this run observation")
    source = release.require_sha(context["sourceSha"])
    retained = _installation_task_id(context["retentionId"])
    invocation = context["invocationId"]
    _need(type(invocation) is str and re.fullmatch(r"[a-f0-9]{32}", invocation)
          and invocation != "0" * 32
          and context["unit"] == INSTALL_TASK_PREFIX + retained + ".service",
          "original record association manager identity differs")
    original = _installation_record_value(intent, identity)
    _installation_writers_match(intent, writers, identity)
    _need(original["targetSourceSha"] == source and original["retentionId"] == retained,
          "original records belong to another material or source")
    return _json({"schemaVersion": 1, "kind": "sanq-install-task-originals-binding",
        "sourceSha": source, "retentionId": retained, "installationId": identity,
        "unit": context["unit"], "invocationId": invocation,
        "intentSha256": _hash(intent), "writersSha256": _hash(writers),
        "installationComplete": False, "canExecute": False, "restoreProven": False})


def _installation_task_originals_match(raw, context, intent, writers, identity):
    """Exact canonical bytes only; a matching record never authorizes execution."""
    _need(type(raw) is bytes and 0 < len(raw) <= MAX_INSTALL_RECORD,
          "invalid task originals association bytes")
    expected = _installation_task_originals_bytes(context, intent, writers, identity)
    _need(raw == expected, "task originals association differs from this run and original records")
    return {"installationId": identity, "invocationId": context["invocationId"],
            "originalRecordsMatched": True, "installationComplete": False,
            "canExecute": False, "restoreProven": False}


INSTALL_TASK_ORIGINALS_FILE = "task-originals.json"


def _installation_task_handoff_read(root, context, intent, writers, identity):
    """Read one fixed inert association; caller must own the installation namespace."""
    _private_info(os.fstat(root), directory=True)
    directory = _directory_identity(os.fstat(root))
    fd = os.open(INSTALL_TASK_ORIGINALS_FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        _need(0 < before.st_size <= MAX_INSTALL_RECORD, "task handoff size differs")
        chunks, size = [], 0
        while size <= MAX_INSTALL_RECORD:
            block = os.read(fd, min(65536, MAX_INSTALL_RECORD + 1 - size))
            if not block:
                break
            chunks.append(block)
            size += len(block)
        after = os.fstat(fd)
        actual = os.stat(INSTALL_TASK_ORIGINALS_FILE, dir_fd=root, follow_symlinks=False)
        _private_info(after)
        _private_info(actual)
        fingerprint = _installed_fingerprint(before)
        _need(size == before.st_size and fingerprint == _installed_fingerprint(after)
              == _installed_fingerprint(actual) and directory == _directory_identity(os.fstat(root)),
              "task handoff changed during read")
        raw = b"".join(chunks)
        _installation_task_originals_match(raw, context, intent, writers, identity)
        return raw, fingerprint
    finally:
        os.close(fd)


def _installation_task_handoff_write(root, context, intent, writers, identity):
    """Create-only primitive, not an installation entry or permission to resume."""
    _need(os.geteuid() == 0, "task handoff requires the authorized root operator")
    raw = _installation_task_originals_bytes(context, intent, writers, identity)
    before_dir = os.fstat(root)
    _private_info(before_dir, directory=True)
    directory = _directory_identity(before_dir)
    disk = os.fstatvfs(root)
    _need(disk.f_bavail * disk.f_frsize >= MIN_PRIVATE_FREE_BYTES + len(raw),
          "insufficient task handoff storage reserve")
    fd = os.open(INSTALL_TASK_ORIGINALS_FILE, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=root)
    try:
        before = os.fstat(fd)
        _private_info(before)
        remaining = memoryview(raw)
        while remaining:
            count = os.write(fd, remaining)
            _need(count > 0, "short task handoff write")
            remaining = remaining[count:]
        os.fsync(fd)
        after = os.fstat(fd)
        _private_info(after)
        _need((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)
              and after.st_size == len(raw) and directory == _directory_identity(os.fstat(root)),
              "task handoff identity changed during write")
        os.fsync(root)
        readback, fingerprint = _installation_task_handoff_read(root, context, intent, writers, identity)
        final = os.fstat(fd)
        _private_info(final)
        actual = os.stat(INSTALL_TASK_ORIGINALS_FILE, dir_fd=root, follow_symlinks=False)
        _private_info(actual)
        _need(readback == raw and fingerprint == _installed_fingerprint(after)
              == _installed_fingerprint(final) == _installed_fingerprint(actual)
              and directory == _directory_identity(os.fstat(root)), "task handoff durability readback differs")
        return {"recordSha256": _hash(raw), "recordFingerprint": fingerprint,
                "installationComplete": False, "canExecute": False, "restoreProven": False}
    finally:
        os.close(fd)  # Preserve every partial/unknown record; no unlink, retry or truncation.


def _persist_owned_installation_task_handoff(root, context, intent, writers, identity,
                                            owned_records, *, check_owned):
    """Owned-flow primitive; caller supplies original locks and fresh source/manager checks."""
    _need(type(owned_records) is dict and callable(check_owned)
          and owned_records.get("writers.json") == writers
          and INSTALL_TASK_ORIGINALS_FILE not in owned_records,
          "task handoff requires the original owned writers and no previous association")
    _installation_task_originals_bytes(context, intent, writers, identity)
    check_owned()
    _need(_installation_record_read(root, "intent.json", identity) == intent
          and _installation_record_read(root, "writers.json", identity) == writers,
          "task handoff lost original durable records")
    result = _installation_task_handoff_write(root, context, intent, writers, identity)
    raw, fingerprint = _installation_task_handoff_read(root, context, intent, writers, identity)
    _need(result["recordSha256"] == _hash(raw) and result["recordFingerprint"] == fingerprint,
          "owned task handoff write and read identities differ")
    owned_records[INSTALL_TASK_ORIGINALS_FILE] = (dict(context), raw, fingerprint)
    check_owned()
    return {"taskOriginalsSha256": _hash(raw), "installationComplete": False,
            "canExecute": False, "restoreProven": False}


def _save_supervised_installation_writers(retention_id, source_sha, *, fetch=release.github_json):
    """Private supervised evidence stage; no freeze, tool install or public CLI."""
    return _observe_installed_runtime(retention_id, fetch=fetch, include_configuration=True,
        include_docker=True, include_systemd=True, include_filesystem=True, include_prerequisites=True,
        include_application_binding=True, include_migrations=True, include_effective_configuration=True,
        include_external_backup=True, _record_intent=True, _load_deny_gates=True, _save_writers=True,
        _task_source_sha=release.require_sha(source_sha))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("pack", "verify", "plan", "retain"):
        sub = commands.add_parser(name, allow_abbrev=False)
        sub.add_argument("--source-sha", required=True)
        sub.add_argument("--runtime-archive" if name == "pack" else "--kit", type=Path, required=True)
        if name == "pack":
            sub.add_argument("--output", type=Path, required=True)
        if name in ("plan", "retain"):
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
        elif args.command == "retain":
            _bootstrap_invocation(args.source_sha)
            result = _retain_from_bound_bootstrap(_read_artifact(args.kit, MAX_KIT), args.source_sha,
                _read_artifact(args.current_runtime_archive, bundle.MAX_ARCHIVE_BYTES),
                args.current_source_sha, fetch=fetch)
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
