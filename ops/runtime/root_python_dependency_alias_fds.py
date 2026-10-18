"""B4B-3B-2B2-B1: bounded, UNTRUSTED symlink-to-file FD candidate walk.

Linux-only, standalone, no CLI/root entry, no file byte execution or writes.
Caller proposes BOTH a root FD and exact link texts. Neither is authenticated.
Every successful borrow is still BLOCKED for Runtime and C1/C2 purposes.
The B2B1 no-follow opener remains unchanged.
"""
from __future__ import annotations

from contextlib import contextmanager
import fcntl
import os
import stat
import sys
from typing import Any, Iterator

from root_python_dependency_manifest import FILE_KINDS, review_dependency_manifest

MAX_FILES = 64
MAX_COMPONENTS = 12
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
MAX_LINK_HOPS = 8
MAX_LINK_BYTES = 256
MAX_PATH_BYTES = 256
MAX_LINK_CLAIMS = 8
MAX_OPEN_FDS = 768
_FILE_FLAGS = os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC


class AliasFDPathBlocked(ValueError):
    """A candidate entry, mount or claimed symlink cannot be safely modeled."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise AliasFDPathBlocked(reason)


def _identity(info: os.stat_result) -> tuple[int, ...]:
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _safe(info: os.stat_result, *, device: int, uid: int, gid: int,
          kind: str) -> None:
    _require(info.st_dev == device and info.st_ino > 0
             and info.st_uid == uid and info.st_gid == gid,
             "entry device/owner mismatch")
    _require({"directory": stat.S_ISDIR, "file": stat.S_ISREG,
              "link": stat.S_ISLNK}[kind](info.st_mode), "wrong entry kind")
    if kind == "link":
        # Symlink mode normally reads 0777; verify parent ownership/mode
        # independently instead of treating link mode as file permissions.
        _require(info.st_nlink == 1, "unexpected symlink link count")
    else:
        _require((stat.S_IMODE(info.st_mode) & 0o6022) == 0,
                 "writable or privileged entry")
        if kind == "file":
            _require(info.st_nlink == 1
                     and 0 < info.st_size <= MAX_FILE_BYTES,
                     "unsafe regular file size or hardlinks")


def _ascii_path(path: Any) -> bool:
    return (type(path) is str and len(path) <= MAX_PATH_BYTES
            and path.isascii() and path.startswith("/")
            and all(32 < ord(c) < 127 for c in path)
            and all(p not in ("", ".", "..") for p in path[1:].split("/")))


def _valid_target(target: Any) -> bool:
    return (type(target) is str and target.isascii()
            and 0 < len(target.encode("ascii")) <= MAX_LINK_BYTES
            and all(32 < ord(c) < 127 for c in target)
            and not target.startswith("//"))


def _target_parts(target: str, parent: list[str]) -> list[str]:
    _require(_valid_target(target), "invalid link text")
    result = [] if target.startswith("/") else list(parent)
    for part in target.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            _require(bool(result), "symlink target escapes the provided root")
            result.pop()
        else:
            result.append(part)
        _require(len(result) <= MAX_COMPONENTS, "resolved path component budget")
    _require(bool(result), "link target points at root")
    return result


def _mount_id(fd: int) -> int:
    """Kernel fdinfo mnt_id; no stat(st_dev)-only or guessing fallback."""
    infofd = os.open(f"/proc/self/fdinfo/{fd}",
                     os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        data = os.read(infofd, 4096)
    finally:
        os.close(infofd)
    lines = [line for line in data.splitlines() if line.startswith(b"mnt_id:")]
    _require(len(lines) == 1, "unavailable or ambiguous mount ID")
    raw = lines[0].split(b":", 1)[1].strip()
    _require(raw.isdigit() and len(raw) <= 20, "malformed mount ID")
    value = int(raw)
    _require(value > 0, "invalid mount ID")
    return value


def _namespace() -> str:
    value = os.readlink("/proc/self/ns/mnt")
    _require(value.startswith("mnt:[") and value.endswith("]"),
             "mount namespace not observable")
    return value


def _match(parent: int, name: str, fd: int, *, kind: str,
           device: int, mount: int, uid: int, gid: int) -> None:
    entry = os.stat(name, dir_fd=parent, follow_symlinks=False)
    held = os.fstat(fd)
    _safe(entry, device=device, uid=uid, gid=gid, kind=kind)
    _safe(held, device=device, uid=uid, gid=gid, kind=kind)
    _require(_identity(entry) == _identity(held),
             "directory entry and held FD identity drift")
    _require(_mount_id(fd) == mount and _mount_id(parent) == mount,
             "mount boundary or mount identity changed")


@contextmanager
def borrow_candidate_alias_fds(
    root_anchor_fd: int,
    manifest: Any, *,
    expected_manifest_sha256: Any,
    proposed_file_pins: Any,
    proposed_exact_links: Any,
    _fixture_owner_uid: int | None = None,
    _fixture_owner_gid: int | None = None,
) -> Iterator[tuple[dict[str, int], dict[str, Any]]]:
    """Borrow read-only file FDs and UNTRUSTED logical->physical trace.

    The proposed_exact_links mapping is NOT an external attestation and its
    entries MUST be independently authenticated before any future production
    use. No pathname returned by this function is authorized for re-opening.
    """
    _require(sys.platform == "linux" and hasattr(os, "O_PATH"),
             "requires Linux O_PATH and procfs mount evidence")
    _require(type(root_anchor_fd) is int and root_anchor_fd >= 0,
             "invalid supplied root FD")
    uid = 0 if _fixture_owner_uid is None else _fixture_owner_uid
    gid = 0 if _fixture_owner_gid is None else _fixture_owner_gid
    _require(type(uid) is int and uid >= 0
             and type(gid) is int and gid >= 0, "invalid owner expectations")
    try:
        review_dependency_manifest(
            manifest, expected_manifest_sha256=expected_manifest_sha256,
            proposed_external_file_pins=proposed_file_pins,
        )
        paths = sorted(n["path"] for n in manifest["nodes"]
                       if n["kind"] in FILE_KINDS)
    except (ValueError, KeyError, TypeError) as exc:
        raise AliasFDPathBlocked("invalid B4B-3A manifest/pin claims") from exc
    _require(0 < len(paths) <= MAX_FILES, "file count budget exceeded")
    _require(type(proposed_exact_links) is dict
             and len(proposed_exact_links) <= MAX_LINK_CLAIMS
             and all(_ascii_path(p) and type(t) is str for p, t
                     in proposed_exact_links.items()),
             "invalid proposed link whitelist")
    for text in proposed_exact_links.values():
        _require(_valid_target(text), "invalid proposed link text")

    held: list[int] = []
    entries: list[tuple[int, str, int, str]] = []
    files: dict[str, int] = {}
    traces: dict[str, Any] = {}
    used_links: set[str] = set()
    seen_file_identities: set[tuple[int, int]] = set()
    seen_canonical_paths: set[str] = set()
    total_bytes = 0

    def _hold(fd: int) -> int:
        if len(held) >= MAX_OPEN_FDS:
            os.close(fd)
            raise AliasFDPathBlocked("FD budget exceeded")
        held.append(fd)
        return fd

    try:
        root = os.fstat(root_anchor_fd)
        _require((fcntl.fcntl(root_anchor_fd, fcntl.F_GETFL) & os.O_ACCMODE)
                 == os.O_RDONLY, "root FD not read-only")
        _safe(root, device=root.st_dev, uid=uid, gid=gid, kind="directory")
        root_identity = _identity(root)
        mount = _mount_id(root_anchor_fd)
        namespace = _namespace()
        flags = os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC

        for logical in paths:
            _require(_ascii_path(logical), "noncanonical manifest file path")
            remaining = logical[1:].split("/")
            _require(2 <= len(remaining) <= MAX_COMPONENTS,
                     "manifest path component budget exceeded")
            walked: list[str] = []
            parent = root_anchor_fd
            links: list[dict[str, Any]] = []
            hops = 0
            while remaining:
                _require(len(walked) + len(remaining) <= MAX_COMPONENTS,
                         "resolved path segment limit exceeded")
                name = remaining.pop(0)
                physical_path = "/" + "/".join(walked + [name])
                _require(len(physical_path.encode("ascii")) <= MAX_PATH_BYTES,
                         "resolved path length budget exceeded")
                candidate = _hold(os.open(name, flags, dir_fd=parent))
                kind = ("link" if stat.S_ISLNK(os.fstat(candidate).st_mode)
                        else "directory" if stat.S_ISDIR(os.fstat(candidate).st_mode)
                        else "file")
                _match(parent, name, candidate, kind=kind,
                       device=root.st_dev, mount=mount, uid=uid, gid=gid)
                entries.append((parent, name, candidate, kind))

                if kind == "link":
                    _require(hops < MAX_LINK_HOPS, "symlink hop limit exceeded")
                    _require(physical_path in proposed_exact_links,
                             "unlisted symlink (including leaf loader)")
                    actual_text = os.readlink("", dir_fd=candidate)
                    _require(actual_text == proposed_exact_links[physical_path],
                             "symlink FD text differs from the exact claim")
                    replacement = _target_parts(actual_text, walked)
                    _require(len(replacement) + len(remaining) <= MAX_COMPONENTS,
                             "symlink expansion exceeds path limit")
                    _require(len(("/" + "/".join(replacement + remaining))
                                 .encode("ascii")) <= MAX_PATH_BYTES,
                             "expanded path bytes exceeded")
                    info = os.fstat(candidate)
                    links.append({
                        "linkPath": physical_path, "linkText": actual_text,
                        "device": info.st_dev, "inode": info.st_ino,
                        "uid": info.st_uid, "gid": info.st_gid,
                        "mode": stat.S_IMODE(info.st_mode), "mountId": mount,
                    })
                    used_links.add(physical_path)
                    hops += 1
                    remaining = replacement + remaining
                    walked = []
                    parent = root_anchor_fd
                    continue
                _require(kind == ("directory" if remaining else "file"),
                         "unexpected directory/leaf file")
                walked.append(name)
                if kind == "directory":
                    parent = candidate
                    continue

                final = _hold(os.open(name, _FILE_FLAGS, dir_fd=parent))
                _match(parent, name, final, kind="file", device=root.st_dev,
                       mount=mount, uid=uid, gid=gid)
                info = os.fstat(final)
                _require(_identity(info) == _identity(os.fstat(candidate)),
                         "readable FD differs from nofollow entry FD")
                canonical = "/" + "/".join(walked)
                key = (info.st_dev, info.st_ino)
                _require(key not in seen_file_identities
                         and canonical not in seen_canonical_paths,
                         "file aliases collide across logical manifest nodes")
                seen_file_identities.add(key)
                seen_canonical_paths.add(canonical)
                total_bytes += info.st_size
                _require(total_bytes <= MAX_TOTAL_BYTES,
                         "total candidate bytes over budget")
                files[logical] = final
                traces[logical] = {
                    "logicalPath": logical, "proposedCanonicalPath": canonical,
                    "observedLinkCandidates": links,
                    "finalDevice": info.st_dev, "finalInode": info.st_ino,
                    "finalMountId": mount,
                    "externalPinProvenanceAuthenticated": False,
                    "pathAndRootProvenanceAuthenticated": False,
                    "dynamicDependencyClosureVerified": False,
                    "readyToInstall": False,
                    "authorizedToMutateProduction": False,
                    "decision": "BLOCKED",
                }

        _require(used_links == set(proposed_exact_links),
                 "unused or extra symlink claim")
        def _recheck() -> None:
            _require(_namespace() == namespace
                     and _mount_id(root_anchor_fd) == mount
                     and _identity(os.fstat(root_anchor_fd)) == root_identity,
                     "root FD / namespace / mount changed")
            for par, name, fd, kind in entries:
                _match(par, name, fd, kind=kind,
                       device=root.st_dev, mount=mount, uid=uid, gid=gid)

        _recheck()
        try:
            yield files, traces
        finally:
            _recheck()
    except (OSError, OverflowError, UnicodeError) as exc:
        raise AliasFDPathBlocked("anchored symlink FD observation failed") from exc
    finally:
        for fd in reversed(held):
            try:
                os.close(fd)
            except OSError:
                pass
