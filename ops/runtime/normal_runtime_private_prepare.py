"""P10-F4-A create-only, FD-bound static Runtime preparation, never activation.

Writes only a new tx leaf under an externally provisioned fixed private parent.
No public path/owner override, dynamic-state copy, ledger, CLI or activation.
Exact source/platform authority and production execution approval stay external.
"""
from __future__ import annotations

from contextlib import contextmanager, ExitStack
import io
import os
import stat
import tarfile

from build_bundle import MANIFEST, RUNTIME_PREFIX, SOURCE_FILES, MAX_ARCHIVE_BYTES
from normal_runtime_inputs import parse_pinned_update_inputs, _document
from normal_runtime_launch import canonical, digest
from normal_runtime_source_anchor import (
    _platform, _flags, _open_namespace_root, _directory_key, _checked_recheck,
)
from release_contract import github_json
from runtime_trust import verify_runtime_publication
from stage_bundle import validated_archive_files, validate_layout

_OWNER = (0, 0)
_PARTS = ("root", "sanq-runtime-operator", "normal-update-preparations")
_PARENT = "/root/sanq-runtime-operator/normal-update-preparations"
_RECEIPT = "preparation.json"
_ARCHIVE = "original.tar.gz"


class PrivatePreparationBlocked(ValueError):
    pass


def _require(ok, message):
    if not ok:
        raise PrivatePreparationBlocked(message)


def _require_root():
    _require((os.getuid(), os.geteuid(), os.getgid(), os.getegid()) == (0, 0, 0, 0),
             "private preparation requires real and effective root identity")


@contextmanager
def _parent():
    _platform()
    uid, gid = _OWNER
    with ExitStack() as stack:
        root = _open_namespace_root()
        stack.callback(os.close, root)
        held = [("", root, _directory_key(root, uid, gid, None))]
        for name in _PARTS:
            fd = os.open(name, _flags(), dir_fd=held[-1][1])
            stack.callback(os.close, fd)
            key = _directory_key(fd, uid, gid, held[0][2][0])
            _require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700,
                     "private preparation ancestors must already be 0700")
            held.append((name, fd, key))
        fixed = tuple(held)
        _checked_recheck(fixed, uid, gid)
        try:
            yield held[-1][1], fixed
        finally:
            _checked_recheck(fixed, uid, gid)


def _file_key(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _same_entry(parent, name, fd, key):
    _require(_file_key(os.fstat(fd)) == key
             and _file_key(os.stat(name, dir_fd=parent, follow_symlinks=False)) == key,
             "prepared file changed or replaced")


def _new_directory(parent, name, device, stack):
    # mkdir is the exclusive claim; an existing file/link/partial tree blocks.
    os.mkdir(name, mode=0o700, dir_fd=parent)
    os.fsync(parent)
    fd = os.open(name, _flags(), dir_fd=parent)
    stack.callback(os.close, fd)
    info = os.fstat(fd)
    _require(stat.S_ISDIR(info.st_mode) and (info.st_uid, info.st_gid) == _OWNER
             and info.st_dev == device and not stat.S_IMODE(info.st_mode) & 0o7022,
             "unsafe newly created directory")
    # Normalize ONLY the just-created object, including a restrictive umask.
    os.fchmod(fd, 0o700)
    key = _directory_key(fd, *_OWNER, device)
    entry = os.stat(name, dir_fd=parent, follow_symlinks=False)
    _require((entry.st_dev, entry.st_ino) == key[:2], "new directory entry replaced")
    os.fsync(fd)
    return fd, key


def _new_file(parent, name, raw, device, stack):
    flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
    fd = os.open(name, flags, 0o600, dir_fd=parent)
    stack.callback(os.close, fd)
    info = os.fstat(fd)
    _require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
             and (info.st_uid, info.st_gid) == _OWNER and info.st_dev == device,
             "unsafe new preparation file")
    os.fchmod(fd, 0o600)
    view = memoryview(raw)
    offset = 0
    while offset < len(view):
        written = os.write(fd, view[offset:offset + 65536])
        _require(type(written) is int and 0 < written <= min(65536, len(view) - offset),
                 "preparation write made no valid progress")
        offset += written
    os.fsync(fd)
    after = os.fstat(fd)
    _require(stat.S_ISREG(after.st_mode) and after.st_nlink == 1
             and (after.st_uid, after.st_gid) == _OWNER and after.st_dev == device
             and stat.S_IMODE(after.st_mode) == 0o600, "prepared file metadata differs")
    key = _file_key(after)
    _same_entry(parent, name, fd, key)
    _require(key[6] == len(raw), "prepared file size differs")
    return fd, key


def _verify_file(parent, name, fd, key, raw):
    _same_entry(parent, name, fd, key)
    offset = 0
    while offset < len(raw):
        block = os.pread(fd, min(65536, len(raw) - offset), offset)
        _require(bool(block) and block == raw[offset:offset + len(block)],
                 "prepared readback differs")
        offset += len(block)
    _require(not os.pread(fd, 1, offset), "prepared file has extra bytes")
    _same_entry(parent, name, fd, key)


def _target(parsed, archive, fetch):
    request = parsed.request.document()
    _require(type(archive) is bytes and 0 < len(archive) <= MAX_ARCHIVE_BYTES,
             "bounded immutable target archive required")
    evidence = verify_runtime_publication(archive, request["targetRuntimeSha"], fetch=fetch)
    _require(evidence.get("verified") is True
             and evidence.get("sourceSha") == request["targetRuntimeSha"]
             and evidence.get("runtimeArchiveDigest") == request["targetArchiveDigest"]
             == "sha256:" + digest(archive)
             and evidence.get("productionActivationAuthorized") is False,
             "target proof differs from pinned request")
    manifest, files = validated_archive_files(archive, request["targetRuntimeSha"])
    validate_layout(files)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        item = tar.getmember(RUNTIME_PREFIX + "/" + MANIFEST)
        _require(item.isfile() and 0 < item.size <= 16384, "bounded original manifest required")
        stream = tar.extractfile(item)
        _require(stream is not None, "original manifest unavailable")
        with stream:
            manifest_bytes = stream.read(16385)
    _require(len(manifest_bytes) == item.size and _document(manifest_bytes) == manifest
             and type(manifest.get("schemaVersion")) is int, "original manifest differs")
    return request, files, manifest_bytes, evidence


def prepare_private_target(launch_bytes, request_bytes, *, expected_launch_sha256,
                           expected_request_sha256, target_archive, fetch=github_json):
    """Create inert static files, keep all partial outputs on failure.

    Does NOT authenticate current installed state, admit/consume a transaction,
    copy .env/state/marker, freeze writers or call NormalUpdateFlow. A tx leaf is
    a preparation collision guard, not the global update lock or R2 CAS.
    """
    _require_root()
    parsed = parse_pinned_update_inputs(launch_bytes, request_bytes,
        expected_launch_sha256=expected_launch_sha256,
        expected_request_sha256=expected_request_sha256)
    request, files, manifest_raw, proof = _target(parsed, target_archive, fetch)
    txid = request["transactionId"]
    payloads = {"candidate/" + name: files[name] for name in SOURCE_FILES}
    payloads["candidate/" + MANIFEST] = manifest_raw
    payloads[_ARCHIVE] = target_archive
    folders = {"/".join(name.split("/")[:i]) for name in payloads
               for i in range(1, len(name.split("/")))}
    with _parent() as (parent, ancestors), ExitStack() as stack:
        _checked_recheck(ancestors, *_OWNER)
        device = ancestors[0][2][0]
        tx_fd, tx_key = _new_directory(parent, txid, device, stack)
        directories = {"": tx_fd}
        keys = {"": tx_key}
        edges = [(parent, txid, tx_fd, tx_key)]
        for folder in sorted(folders, key=lambda s: (s.count("/"), s)):
            prefix, _, leaf = folder.rpartition("/")
            fd, key = _new_directory(directories[prefix], leaf, device, stack)
            directories[folder], keys[folder] = fd, key
            edges.append((directories[prefix], leaf, fd, key))
        children = {name: set() for name in directories}
        for name in set(payloads) | folders:
            prefix, _, leaf = name.rpartition("/")
            children[prefix].add(leaf)
        held_files = {}
        for name, raw in sorted(payloads.items()):
            prefix, _, leaf = name.rpartition("/")
            fd, key = _new_file(directories[prefix], leaf, raw, device, stack)
            held_files[name] = (directories[prefix], leaf, fd, key, raw)

        def recheck():
            _checked_recheck(ancestors, *_OWNER)
            for name, fd in directories.items():
                _require(_directory_key(fd, *_OWNER, device) == keys[name]
                         and set(os.listdir(fd)) == children[name],
                         "prepared directory changed")
            for prefix, leaf, fd, key in edges:
                info = os.stat(leaf, dir_fd=prefix, follow_symlinks=False)
                _require((info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid) == key,
                         "prepared directory entry replaced")
            for row in held_files.values():
                _verify_file(*row)

        def sync_directories():
            for name in sorted(directories, key=lambda s: (s.count("/"), len(s)), reverse=True):
                os.fsync(directories[name])
            os.fsync(parent)

        recheck()
        sync_directories()
        # A passive content-synced observation, never a resumable commit marker.
        record = {"kind": "normal-runtime-private-preparation-evidence-v1",
            "phase": "CONTENT_SYNCED_NOT_ADMITTED", "transactionId": txid,
            "requestSha256": digest(request_bytes), "launchMaterialsSha256": digest(launch_bytes),
            "targetSourceSha": request["targetRuntimeSha"],
            "targetArchiveDigest": proof["runtimeArchiveDigest"],
            "files": {n: {"bytes": len(raw), "sha256": digest(raw)}
                      for n, raw in sorted(payloads.items())},
            "dynamicStateCopied": False, "transactionAdmitted": False,
            "readyToInstall": False, "authorizedToMutateProduction": False}
        record_raw = canonical(record)
        fd, key = _new_file(tx_fd, _RECEIPT, record_raw, device, stack)
        held_files[_RECEIPT] = (tx_fd, _RECEIPT, fd, key, record_raw)
        children[""].add(_RECEIPT)
        sync_directories()
        recheck()
        result = {"status": "INERT_STATIC_PREPARED_ONLY", "transactionId": txid,
            "requestSha256": digest(request_bytes), "launchMaterialsSha256": digest(launch_bytes),
            "path": _PARENT + "/" + txid, "device": device, "treeInode": tx_key[1],
            "preparationRecordSha256": digest(record_raw), "targetPublication": proof,
            "memberCount": len(SOURCE_FILES), "preparedFileCount": len(held_files),
            "dynamicStateCopied": False, "currentInstallationVerified": False,
            "namespaceAuthenticated": False,
            "continuousMaintenanceVerified": False, "transactionAdmitted": False,
            "flowInvoked": False, "readyToInstall": False,
            "authorizedToMutateProduction": False, "decision": "BLOCKED"}
    # Parent recheck and FD closure precede successful return. No cleanup on error.
    return result
