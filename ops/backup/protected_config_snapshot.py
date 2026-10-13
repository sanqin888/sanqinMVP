"""C5-U2D S1: inert fixed-file Recovery Kit snapshot contract.

No CLI, sudo, Docker, rclone, filesystem writes, or production installation.
The private fixture seam is for offline tests only. A separately reviewed,
root-owned executable and crypt transport are required before S2/S3 deployment.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import pwd
import re
import stat
import tarfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

RUNTIME = Path("/opt/sanq/runtime")
MEMBERS = (
    ".env",
    ".sanq-release-state.json",
    ".sanq-backup-layout-activated",
    "docker-compose.yml",
    "runtime-release.json",
)
# Independently pinned; never trust the installed manifest to choose root reads.
RUNTIME_SOURCE_MEMBERS = (
    "docker-compose.yml", "ops/backup/backup-db.sh",
    "ops/backup/sanq-backup-protected-nginx", "ops/backup/sanq-backup.service",
    "ops/backup/sanq-backup.sudoers", "ops/release/deploy_release.py",
    "ops/release/release_contract.py", "ops/runtime/build_bundle.py",
    "ops/runtime/audit_compose_cutover.py",
    "ops/runtime/audit_release_provenance.py", "ops/runtime/inspect_layout.py",
    "ops/runtime/stage_bundle.py", "ops/runtime/runtime_trust.py",
    "ops/runtime/versioned_release_contract.py",
    "ops/runtime/plan_versioned_install.py",
    "ops/runtime/runtime-layout.v1.json", "ops/verify-runtime-readiness.sh",
)
CAPS = dict(zip(MEMBERS, (65536, 16384, 128, 2 * 1024 * 1024, 16384)))
MAX_ARCHIVE = 3 * 1024 * 1024
MARKER = b"SANQ_BACKUP_LAYOUT_C4_V1\n"
IMAGE_SHA = re.compile(rb"(?m)^SANQ_IMAGE_SHA=([^\r\n]*)\r?$")
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
TRANSACTION_ID = re.compile(r"[0-9a-f]{32}\Z")
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC


class SnapshotBlocked(ValueError):
    """An untrusted file, inconsistent state, or remote copy was rejected."""


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SnapshotBlocked(reason)


@dataclass(frozen=True)
class Identity:
    root_uid: int
    root_gid: int
    ubuntu_uid: int
    ubuntu_gid: int


@dataclass(frozen=True)
class Snapshot:
    # Secret-containing values are never emitted by repr or safe receipt.
    files: dict[str, bytes] = field(repr=False)
    metadata: dict[str, dict[str, int | str]] = field(repr=False)
    app_sha: str
    runtime_sha: str
    ready_to_install: bool = False


class EncryptedCreateOnlyRemote(Protocol):
    """S2/S3 will implement a pinned gdrive_secure rclone-crypt adapter.

    create_only MUST reject existing keys without overwrite and read_back MUST
    download/decrypt the entire remote object. A fake is used in S1 tests.
    """
    def create_only(self, key: str, payload: bytes) -> None: ...
    def read_back(self, key: str) -> bytes: ...


def _open_dir(parent_fd: int, name: str, ids: Identity) -> int:
    fd = os.open(name, DIR_FLAGS, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == ids.root_uid
                and info.st_gid == ids.root_gid
                and not (stat.S_IMODE(info.st_mode) & 0o022),
                "untrusted Runtime directory")
        _same_entry(parent_fd, name, fd)
        return fd
    except BaseException:
        os.close(fd)
        raise


def _same_entry(parent_fd: int, name: str, child_fd: int) -> None:
    path_info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    fd_info = os.fstat(child_fd)
    require((path_info.st_dev, path_info.st_ino, path_info.st_mode)
            == (fd_info.st_dev, fd_info.st_ino, fd_info.st_mode),
            "snapshot path changed during capture")


def _read_member(runtime_fd: int, name: str, ids: Identity) -> tuple[bytes, dict[str, int | str]]:
    require(name in MEMBERS, "unapproved snapshot member")
    fd = os.open(name, FILE_FLAGS, dir_fd=runtime_fd)
    try:
        before = os.fstat(fd)
        uid, gid = ((ids.ubuntu_uid, ids.ubuntu_gid) if name == ".env"
                    else (ids.root_uid, ids.root_gid))
        mode = stat.S_IMODE(before.st_mode)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                and before.st_uid == uid and before.st_gid == gid
                and before.st_dev == os.fstat(runtime_fd).st_dev
                and 0 < before.st_size <= CAPS[name],
                "snapshot member type/owner/size invalid")
        if name in (".env", ".sanq-release-state.json"):
            require(mode == 0o600, "private snapshot member mode invalid")
        else:
            require(not (mode & 0o022), "snapshot member writable by group/other")
        _same_entry(runtime_fd, name, fd)
        chunks: list[bytes] = []
        remaining = CAPS[name] + 1
        while remaining:
            block = os.read(fd, min(65536, remaining))
            if not block:
                break
            chunks.append(block)
            remaining -= len(block)
        data = b"".join(chunks)
        after = os.fstat(fd)
        require(len(data) == before.st_size and len(data) <= CAPS[name]
                and (before.st_mtime_ns, before.st_ctime_ns, before.st_size)
                == (after.st_mtime_ns, after.st_ctime_ns, after.st_size),
                "snapshot member changed while reading")
        _same_entry(runtime_fd, name, fd)
        return data, {
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data), "uid": uid, "gid": gid, "mode": mode,
            "device": before.st_dev, "inode": before.st_ino,
        }
    finally:
        os.close(fd)


def _validate(files: dict[str, bytes]) -> tuple[str, str]:
    require(set(files) == set(MEMBERS), "snapshot inventory incomplete")
    matches = IMAGE_SHA.findall(files[".env"])
    require(len(matches) == 1, "expected one SANQ_IMAGE_SHA")
    try:
        app_sha = matches[0].decode("ascii")
        state = json.loads(files[".sanq-release-state.json"])
        manifest = json.loads(files["runtime-release.json"])
        compose = files["docker-compose.yml"].decode("utf-8")
    except (ValueError, UnicodeError) as exc:
        raise SnapshotBlocked("snapshot data is not well formed") from exc
    require(SHA.fullmatch(app_sha) is not None, "invalid application SHA")
    require(isinstance(state, dict) and state.get("schemaVersion") == 1
            and state.get("phase") in ("active", "rolled-back")
            and state.get("current") == app_sha
            and isinstance(state.get("previous"), str)
            and SHA.fullmatch(state["previous"]) is not None,
            "Release State is unsettled or mismatches .env")
    require(files[".sanq-backup-layout-activated"] in
            (MARKER, MARKER[:-1]),
            "invalid C4 activation marker")
    require(isinstance(manifest, dict) and manifest.get("schemaVersion") == 1
            and manifest.get("artifactKind") == "sanq-runtime-source-pinned"
            and manifest.get("sourceBranch") == "main"
            and manifest.get("productionActivationAuthorized") is False
            and isinstance(manifest.get("sourceSha"), str)
            and SHA.fullmatch(manifest["sourceSha"]) is not None
            and isinstance(manifest.get("files"), dict)
            and set(manifest["files"]) == set(RUNTIME_SOURCE_MEMBERS),
            "installed Runtime manifest contract invalid")
    images = manifest.get("applicationImages")
    require(isinstance(images, dict) and set(images) == {"sanq-api", "sanq-web"},
            "installed Runtime image proof missing")
    for name, proof in images.items():
        require(isinstance(proof, dict)
                and proof.get("ref") == (
                    f"ghcr.io/sanqin888/{name}:{manifest['sourceSha']}")
                and isinstance(proof.get("digest"), str)
                and re.fullmatch(r"sha256:[0-9a-f]{64}", proof["digest"]) is not None,
                "installed Runtime image proof invalid")
    for proof in manifest["files"].values():
        require(isinstance(proof, dict)
                and isinstance(proof.get("sha256"), str)
                and DIGEST.fullmatch(proof["sha256"]) is not None
                and type(proof.get("bytes")) is int
                and 0 <= proof["bytes"] <= 2 * 1024 * 1024,
                "installed Runtime manifest inventory invalid")
    require(compose.count("/srv/sanq/uploads:/app/uploads") == 2
            and "./uploads:/app/uploads" not in compose
            and "pgdata:/var/lib/postgresql/data" in compose
            and "name: sanq-app" in compose,
            "Compose C4 storage contract mismatch")
    # Runtime source SHA is deliberately independent of application image SHA.
    return app_sha, manifest["sourceSha"]


def _capture(runtime: Path, *, anchor: Path, ids: Identity) -> Snapshot:
    """Private test seam. Caller must hold a real cross-process maintenance gate.

    Production wrapper (not implemented in S1) MUST pin RUNTIME and anchor=/,
    root identity and a trusted independent Docker image/mount check.
    """
    require(runtime.is_absolute() and anchor.is_absolute() and runtime != anchor
            and anchor in runtime.parents, "untrusted snapshot root")
    owned: list[int] = []
    path = runtime.relative_to(anchor)
    try:
        fd = os.open(anchor, DIR_FLAGS)
        owned.append(fd)
        anchor_info = os.fstat(fd)
        require(stat.S_ISDIR(anchor_info.st_mode)
                and anchor_info.st_uid == ids.root_uid
                and anchor_info.st_gid == ids.root_gid
                and not (stat.S_IMODE(anchor_info.st_mode) & 0o022),
                "untrusted anchor directory")
        for part in path.parts:
            fd = _open_dir(fd, part, ids)
            owned.append(fd)
        files: dict[str, bytes] = {}
        metadata: dict[str, dict[str, int | str]] = {}
        for name in MEMBERS:
            files[name], metadata[name] = _read_member(fd, name, ids)
        app_sha, runtime_sha = _validate(files)
        # Reject path replacement of an ancestor during multi-file reading.
        for parent_fd, part, child_fd in zip(owned, path.parts, owned[1:]):
            _same_entry(parent_fd, part, child_fd)
        for name in MEMBERS:
            # Reopen on pinned Runtime fd to identify late atomic replacement.
            again, new_metadata = _read_member(fd, name, ids)
            require(again == files[name] and new_metadata == metadata[name],
                    "mixed-version snapshot rejected")
        for parent_fd, part, child_fd in zip(owned, path.parts, owned[1:]):
            _same_entry(parent_fd, part, child_fd)
        return Snapshot(files=files, metadata=metadata,
                        app_sha=app_sha, runtime_sha=runtime_sha)
    except OSError as exc:
        raise SnapshotBlocked("unsafe or unavailable snapshot path") from exc
    finally:
        for fd in reversed(owned):
            os.close(fd)


def capture_production_config() -> Snapshot:
    """Read only. Never executable as a privileged CLI or installation gate."""
    require(os.geteuid() == 0, "root operator required to inspect protected state")
    ubuntu = pwd.getpwnam("ubuntu")
    return _capture(RUNTIME, anchor=Path("/"),
                    ids=Identity(0, 0, ubuntu.pw_uid, ubuntu.pw_gid))


def archive_snapshot(snapshot: Snapshot) -> bytes:
    """Build a private in-memory archive; never persist secrets to a shared path."""
    require(set(snapshot.files) == set(MEMBERS), "invalid snapshot inputs")
    app_sha, runtime_sha = _validate(snapshot.files)
    require((app_sha, runtime_sha) == (snapshot.app_sha, snapshot.runtime_sha),
            "snapshot identity changed")
    manifest = {
        "schemaVersion": 1, "kind": "sanq-protected-config-snapshot-v1",
        "applicationSha": app_sha, "runtimeSourceSha": runtime_sha,
        "members": snapshot.metadata,
        "readyToInstall": False,
    }
    output = io.BytesIO()
    with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode="w") as tar:
            for name, data in sorted({
                **snapshot.files,
                "snapshot-inventory.json": (
                    json.dumps(manifest, sort_keys=True) + "\n").encode("utf-8"),
            }.items()):
                info = tarfile.TarInfo(name)
                info.mode = 0o600
                info.size = len(data)
                info.uid = info.gid = info.mtime = 0
                tar.addfile(info, io.BytesIO(data))
    payload = output.getvalue()
    require(len(payload) <= MAX_ARCHIVE, "snapshot archive exceeds limit")
    return payload


def verify_archive(payload: bytes, expected_sha256: str) -> None:
    """Parse without extraction; verify every returned encrypted-remote byte."""
    require(len(payload) <= MAX_ARCHIVE
            and hashlib.sha256(payload).hexdigest() == expected_sha256,
            "remote snapshot digest mismatch")
    try:
        members: dict[str, bytes] = {}
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as tar:
            for info in tar:
                require(info.isfile()
                        and info.name in (*MEMBERS, "snapshot-inventory.json")
                        and info.name not in members
                        and info.size <= max(CAPS.values()),
                        "remote archive member invalid")
                stream = tar.extractfile(info)
                require(stream is not None, "remote archive missing file")
                data = stream.read(info.size + 1)
                require(len(data) == info.size, "remote member truncated")
                members[info.name] = data
        require(set(members) == {*MEMBERS, "snapshot-inventory.json"},
                "remote archive incomplete")
        inventory = json.loads(members.pop("snapshot-inventory.json"))
        app_sha, runtime_sha = _validate(members)
        require(isinstance(inventory, dict)
                and inventory.get("schemaVersion") == 1
                and inventory.get("kind") == "sanq-protected-config-snapshot-v1"
                and inventory.get("applicationSha") == app_sha
                and inventory.get("runtimeSourceSha") == runtime_sha
                and inventory.get("readyToInstall") is False
                and set(inventory["members"]) == set(MEMBERS),
                "remote snapshot inventory invalid")
        for name, meta in inventory["members"].items():
            require(meta["sha256"] == hashlib.sha256(members[name]).hexdigest()
                    and meta["bytes"] == len(members[name]),
                    "remote member checksum invalid")
    except (OSError, tarfile.TarError, ValueError, KeyError, TypeError) as exc:
        raise SnapshotBlocked("remote archive cannot be verified") from exc


def verify_remote_round_trip(snapshot: Snapshot, remote: EncryptedCreateOnlyRemote,
                             *, mode: str, transaction_id: str) -> dict[str, object]:
    """Inert S1 remote boundary: no actual transport or deploy is installed.

    Future pinned crypt transport must enforce create-only atomically and
    independent remote decryption. An untrusted generic remote is not proof.
    """
    require(mode in ("daily", "preinstall")
            and TRANSACTION_ID.fullmatch(transaction_id) is not None,
            "invalid snapshot trigger or transaction id")
    key = (f"config/{transaction_id}/snapshot.tar.gz" if mode == "daily"
           else f"runtime-recovery/{transaction_id}/config-snapshot.tar.gz")
    archive = archive_snapshot(snapshot)
    digest = hashlib.sha256(archive).hexdigest()
    try:
        remote.create_only(key, archive)
        returned = remote.read_back(key)
    except Exception as exc:
        raise SnapshotBlocked("remote upload/readback failed") from exc
    require(isinstance(returned, bytes), "remote did not return decrypted bytes")
    verify_archive(returned, digest)
    return {
        "kind": "inert-s1-round-trip-receipt", "remoteKey": key,
        "archiveSha256": digest, "applicationSha": snapshot.app_sha,
        "runtimeSourceSha": snapshot.runtime_sha,
        "fileCount": len(MEMBERS), "s1ContractRoundTrip": True,
        "productionRemoteVerified": False, "readyToInstall": False,
    }
