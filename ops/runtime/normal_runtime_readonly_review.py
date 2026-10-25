"""P10-F2 read-only publication/installed-byte review; no Flow or admission.

The caller supplies a readable directory FD whose fixed /opt/sanq/runtime path,
ancestors and namespace must be authenticated separately. This library checks
the borrowed tree, not that path. All output is non-authorizing point-in-time
evidence. Network access is limited to existing repository GET verification.
"""
from __future__ import annotations

import base64
from contextlib import contextmanager, ExitStack
import fcntl
import hashlib
import json
import os
import pwd
import re
import stat

from build_bundle import MANIFEST, SOURCE_FILES, MAX_ARCHIVE_BYTES, MAX_FILE_BYTES
from normal_runtime_inputs import parse_pinned_update_inputs
from normal_runtime_launch import canonical, digest
from release_contract import REPOSITORY, RELEASE_CONTEXT, SEALED_DIGEST_PATTERN, github_json
from runtime_trust import RUNTIME_CONTEXT, verify_runtime_publication
from runtime_update_contract import PRESERVED, _inventory
from stage_bundle import validated_archive_files, validate_layout
from versioned_release_contract import _main_ancestor, _status

DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC


class ReadonlyReviewBlocked(ValueError):
    pass


def _require(ok, reason):
    if not ok:
        raise ReadonlyReviewBlocked(reason)


def _object(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def _json(raw):
    value = json.loads(raw, object_pairs_hook=_object)
    _require(type(value) is dict, "JSON object required")
    return value


def _owners():
    user = pwd.getpwnam("ubuntu")
    return (0, 0), (user.pw_uid, user.pw_gid)


def _key(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _directory(fd, owner, device):
    info = os.fstat(fd)
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    _require(stat.S_ISDIR(info.st_mode) and (info.st_uid, info.st_gid) == owner
             and info.st_dev == device and not stat.S_IMODE(info.st_mode) & 0o7022
             and info.st_mode & stat.S_IXUSR
             and flags & os.O_ACCMODE == os.O_RDONLY
             and not flags & getattr(os, "O_PATH", 0), "unsafe directory FD")
    return _key(info)


@contextmanager
def _installed(root_fd):
    """Hold all finite allowlisted edges and recheck before releasing bytes.

    No alternate pathname, writes, repair, scan hook or ownership override.
    The caller retains its FD. Nonblocking opens reject FIFOs without hanging.
    """
    _require(type(root_fd) is int and root_fd >= 0, "readable root FD required")
    root_owner, env_owner = _owners()
    names = set(SOURCE_FILES) | {MANIFEST} | set(PRESERVED)
    folders = {name.rpartition("/")[0] for name in names}
    folders |= {p for name in names for p in
                ("/".join(name.split("/")[:i]) for i in range(1, len(name.split("/"))))}
    folders.discard("")
    with ExitStack() as stack:
        root = os.dup(root_fd)
        stack.callback(os.close, root)
        device = os.fstat(root).st_dev
        directories = {"": root}
        directory_keys = {"": _directory(root, root_owner, device)}
        edges = []
        for folder in sorted(folders, key=lambda s: (s.count("/"), s)):
            parent, _, leaf = folder.rpartition("/")
            fd = os.open(leaf, DIR_FLAGS, dir_fd=directories[parent])
            stack.callback(os.close, fd)
            directories[folder] = fd
            directory_keys[folder] = _directory(fd, root_owner, device)
            edges.append((directories[parent], leaf, fd))
        children = {folder: set() for folder in directories}
        for name in names | folders:
            parent, _, leaf = name.rpartition("/")
            children[parent].add(leaf)
        data, metadata, held = {}, {}, []
        for folder, fd in directories.items():
            _require(set(os.listdir(fd)) == children[folder], "installed member set differs")
        for name in sorted(names):
            parent, _, leaf = name.rpartition("/")
            fd = os.open(leaf, FILE_FLAGS, dir_fd=directories[parent])
            stack.callback(os.close, fd)
            info = os.fstat(fd)
            owner = env_owner if name == ".env" else root_owner
            mode = stat.S_IMODE(info.st_mode)
            maximum = 65536 if name in PRESERVED or name == MANIFEST else MAX_FILE_BYTES
            _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                     and (info.st_uid, info.st_gid) == owner and info.st_dev == device
                     and not mode & 0o7022 and 0 <= info.st_size <= maximum,
                     "unsafe installed member")
            if name in PRESERVED:
                _require(mode == (0o644 if name == ".sanq-backup-layout-activated" else 0o600),
                         "preserved mode differs")
            key = _key(info)
            raw = bytearray()
            while len(raw) <= maximum:
                block = os.read(fd, min(65536, maximum + 1 - len(raw)))
                if not block:
                    break
                raw.extend(block)
            _require(len(raw) == info.st_size and _key(os.fstat(fd)) == key,
                     "installed member changed while read")
            data[name] = bytes(raw)
            metadata[name] = {"bytes": len(raw), "sha256": digest(bytes(raw)),
                              "uid": info.st_uid, "gid": info.st_gid, "mode": oct(mode)}
            held.append((directories[parent], leaf, fd, key))
        _require(len({(key[0], key[1]) for _, _, _, key in held}) == len(held),
                 "installed inode alias")
        try:
            yield data, metadata
        finally:
            for folder, fd in directories.items():
                _require(_directory(fd, root_owner, device) == directory_keys[folder]
                         and set(os.listdir(fd)) == children[folder],
                         "installed directory changed")
            for parent, name, fd in edges:
                _require(_key(os.stat(name, dir_fd=parent, follow_symlinks=False))
                         == _key(os.fstat(fd)), "installed directory entry replaced")
            for parent, name, fd, key in held:
                _require(_key(os.fstat(fd)) == key
                         and _key(os.stat(name, dir_fd=parent, follow_symlinks=False)) == key,
                         "installed member replaced or changed")


def _run(fetch, run_id, sha, name, event):
    _require(type(run_id) is int and run_id > 0, "invalid publishing identity")
    run = fetch(f"/repos/{REPOSITORY}/actions/runs/{run_id}")
    _require(type(run) is dict and run.get("id") == run_id
             and run.get("name") == name and run.get("event") == event
             and run.get("head_sha") == sha and run.get("head_branch") == "main"
             and run.get("status") == "completed" and run.get("conclusion") == "success"
             and type(run.get("repository")) is dict
             and run["repository"].get("full_name") == REPOSITORY
             and type(run.get("head_repository")) is dict
             and run["head_repository"].get("full_name") == REPOSITORY,
             "current publishing workflow differs")


def _current_publication(manifest, files, sha, archive_digest, fetch):
    """Authenticate metadata and exact repository source bytes, not old tar bytes."""
    _inventory(manifest, sha)
    _require(type(manifest.get("schemaVersion")) is int
             and manifest.get("artifactKind") == "sanq-runtime-source-pinned",
             "current manifest kind differs")
    _main_ancestor(sha, fetch)
    _run(fetch, manifest.get("ciRunId"), sha, "ci", "push")
    _run(fetch, manifest.get("publishRunId"), sha, "publish-images", "workflow_run")
    url = f"https://github.com/{REPOSITORY}/actions/runs/{manifest['publishRunId']}"
    statuses = fetch(f"/repos/{REPOSITORY}/commits/{sha}/statuses?per_page=100")
    seal = _status(statuses, RUNTIME_CONTEXT, url)
    _require(seal.get("description") == archive_digest, "current archive identity differs")
    paired = _status(statuses, RELEASE_CONTEXT, url)
    match = SEALED_DIGEST_PATTERN.fullmatch(paired.get("description", ""))
    _require(match is not None, "current image seal malformed")
    expected_images = {name: {"ref": f"ghcr.io/sanqin888/{name}:{sha}",
                             "digest": "sha256:" + value}
                       for name, value in zip(("sanq-api", "sanq-web"), match.groups())}
    _require(manifest.get("applicationImages") == expected_images,
             "current manifest paired images differ")
    for name in SOURCE_FILES:
        item = fetch(f"/repos/{REPOSITORY}/contents/{name}?ref={sha}")
        _require(type(item) is dict and item.get("type") == "file"
                 and item.get("path") == name and item.get("encoding") == "base64"
                 and type(item.get("size")) is int and 0 <= item["size"] <= MAX_FILE_BYTES
                 and type(item.get("content")) is str
                 and len(item["content"]) <= (MAX_FILE_BYTES * 4 // 3 + 100000),
                 "current repository member unavailable")
        raw = base64.b64decode("".join(item["content"].split()), validate=True)
        _require(len(raw) == item["size"] and raw == files[name]
                 and hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
                 == item.get("sha"), "current repository bytes differ")
        _require(manifest["files"][name] == {"bytes": len(raw), "sha256": digest(raw)},
                 "current manifest member differs")


def _pinned_observation(preserved_observation, request):
    _require(type(preserved_observation) is bytes and 0 < len(preserved_observation) <= 16384
             and digest(preserved_observation) == request["preservedStateSha256"],
             "preserved observation differs from request")
    observation = _json(preserved_observation)
    _require(canonical(observation) == preserved_observation
             and observation.get("schema") == "sanq.runtime.c1-preserved-observation.v1"
             and observation.get("scope") == "READ_ONLY_BOOTSTRAP"
             and observation.get("continuousMaintenanceVerified") is False
             and observation.get("authorizedToMutateProduction") is False
             and all(observation.get(k) == request[k] for k in
                     ("currentRuntimeSha", "currentAppSha", "previousAppSha")),
             "preserved observation identity differs")
    return observation


def _preserved_state(files, metadata, request, observation):
    _require(observation.get("files") == {n: metadata[n] for n in PRESERVED},
             "installed preserved observation changed")
    state = _json(files[".sanq-release-state.json"])
    _require(type(state.get("schemaVersion")) is int and state["schemaVersion"] == 1
             and state.get("phase") == "active"
             and state.get("current") == request["currentAppSha"]
             and state.get("previous") == request["previousAppSha"], "application state differs")
    image_shas = re.findall(rb"(?m)^SANQ_IMAGE_SHA=([^\r\n]*)\r?$", files[".env"])
    _require(image_shas == [request["currentAppSha"].encode("ascii")]
             and files[".sanq-backup-layout-activated"].strip() == b"SANQ_BACKUP_LAYOUT_C4_V1",
             "application env or marker differs")


def review_readonly_update(launch_bytes, request_bytes, *, expected_launch_sha256,
                           expected_request_sha256, target_archive,
                           installed_root_fd, preserved_observation, fetch=github_json):
    """Review fixed input/target and actual borrowed installed FD; never admit/run.

    Target policy is the UNCHANGED newest-release verifier. A pinned old target
    that is no longer newest fails; no historical fallback or target selection.
    Preserved observation is the existing C1 record, not a maintenance receipt.
    Container/mount liveness, root path/namespace, executor provenance, freshness
    beyond this scope and cross-process transaction admission remain unverified.
    """
    parsed = parse_pinned_update_inputs(launch_bytes, request_bytes,
        expected_launch_sha256=expected_launch_sha256,
        expected_request_sha256=expected_request_sha256)
    request = parsed.request.document()
    _require(type(target_archive) is bytes and 0 < len(target_archive) <= MAX_ARCHIVE_BYTES,
             "bounded original target bytes required")
    target = verify_runtime_publication(target_archive, request["targetRuntimeSha"], fetch=fetch)
    _require(target["runtimeArchiveDigest"] == request["targetArchiveDigest"],
             "target archive differs from request")
    _, target_files = validated_archive_files(target_archive, request["targetRuntimeSha"])
    validate_layout(target_files)
    observation = _pinned_observation(preserved_observation, request)
    with _installed(installed_root_fd) as (files, metadata):
        manifest = _json(files[MANIFEST])
        _current_publication(manifest, files, request["currentRuntimeSha"],
                             request["currentArchiveDigest"], fetch)
        _require(observation.get("runtimeManifestSha256") == digest(files[MANIFEST]),
                 "installed preserved observation changed")
        _preserved_state(files, metadata, request, observation)
        changed = [n for n in SOURCE_FILES if target_files[n] != files[n]]
        _require(bool(changed), "no Runtime member changed")
        report = {"kind": "normal-runtime-readonly-review-v1",
                  "requestSha256": digest(request_bytes), "launchMaterialsSha256": digest(launch_bytes),
                  "targetPublication": target, "currentArchiveDigest": request["currentArchiveDigest"],
                  "currentSourceSha": request["currentRuntimeSha"],
                  "currentManifestSha256": digest(files[MANIFEST]), "changedMembers": changed,
                  "preservedFiles": {n: metadata[n] for n in PRESERVED},
                  "targetPolicy": "EXISTING_NEWEST_PUBLICATION",
                  "oldArchiveBytesRequired": False, "installedRootPathAuthenticated": False,
                  "containerObservationAuthenticated": False, "continuousMaintenanceVerified": False,
                  "transactionAdmitted": False, "flowInvoked": False, "readyToInstall": False,
                  "authorizedToMutateProduction": False, "decision": "BLOCKED"}
    return report
