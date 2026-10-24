"""C1-PREP-04: bind a proposed sourceRoot to held directory ancestors.

Opens "/" in the CURRENT process namespace, walks approved components without
following symlinks, and composes the existing read-only source snapshot reader.
No source loading, CLI, filesystem writes, subprocess, network or authority.
This does not authenticate the host/namespace, launch pins, Python or provenance.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import fcntl
import os
import re
import stat
import sys
from typing import Iterator

from normal_runtime_launch import (
    LaunchMaterials, LaunchMaterialsBlocked, SourcePin, SHA256, canonical, digest,
)
from normal_runtime_source_snapshot import (
    CandidateSourceBlocked, SourceSnapshot, capture_candidate_sources,
)

MAX_PATH_BYTES = 1024
MAX_COMPONENTS = 16
COMPONENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")


class SourceAnchorBlocked(CandidateSourceBlocked):
    pass


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise SourceAnchorBlocked(reason)


@dataclass(frozen=True)
class DirectoryBinding:
    path: str
    identity: tuple[int, ...]


@dataclass(frozen=True)
class AnchoredSourceSnapshot:
    """Path/byte observations, not an execution or source-authentication permit."""

    source_root: str
    directories: tuple[DirectoryBinding, ...]
    source_snapshot: SourceSnapshot


def _platform() -> None:
    _require(sys.platform == "linux"
             and all(hasattr(os, flag) for flag in (
                 "O_DIRECTORY", "O_NOFOLLOW", "O_CLOEXEC"))
             and os.open in os.supports_dir_fd
             and os.stat in os.supports_dir_fd
             and os.stat in os.supports_follow_symlinks,
             "required Linux anchor APIs are unavailable")


def _parts(path: str) -> tuple[str, ...]:
    _require(type(path) is str and 1 < len(path) <= MAX_PATH_BYTES
             and path.startswith("/") and path.isascii(),
             "invalid approved absolute sourceRoot")
    result = tuple(path[1:].split("/"))
    _require(1 <= len(result) <= MAX_COMPONENTS
             and all(COMPONENT.fullmatch(part) is not None
                     and part not in (".", "..") for part in result),
             "unsafe or excessive sourceRoot components")
    return result


def _freeze(materials: LaunchMaterials, expected: str
            ) -> tuple[LaunchMaterials, str]:
    _require(type(materials) is LaunchMaterials,
             "typed launch materials required")
    _require(type(expected) is str and SHA256.fullmatch(expected) is not None,
             "invalid independently pinned launch digest")
    try:
        document = materials.document()
        _require(digest(canonical(document)) == expected,
                 "launch proposal differs from independently pinned digest")
        frozen = LaunchMaterials(
            document["sourceCommit"], document["transactionId"],
            document["bootstrapSource"],
            tuple(SourcePin(name, pin["sha256"], pin["bytes"])
                  for name, pin in sorted(document["sourceFiles"].items())),
            tuple(tuple(argv) for argv in document["subprocessArgvs"]))
        _require(frozen.sha256() == expected,
                 "launch copy changed the approved proposal")
        return frozen, document["sourceRoot"]
    except SourceAnchorBlocked:
        raise
    except (LaunchMaterialsBlocked, ValueError, TypeError, KeyError,
            RecursionError) as exc:
        raise SourceAnchorBlocked("invalid launch proposal") from exc


def _flags() -> int:
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _open_namespace_root() -> int:
    # Fixed production entry, NOT a caller-selectable alternate filesystem root.
    return os.open("/", _flags())


def _info_key(info: os.stat_result, uid: int, gid: int,
              device: int | None) -> tuple[int, ...]:
    mode = stat.S_IMODE(info.st_mode)
    _require(stat.S_ISDIR(info.st_mode)
             and info.st_uid == uid and info.st_gid == gid
             and (mode & (0o022 | 0o7000)) == 0
             and bool(mode & stat.S_IXUSR)
             and info.st_nlink > 0 and info.st_dev > 0 and info.st_ino > 0
             and (device is None or info.st_dev == device),
             "ancestor type/owner/mode/device is unsafe")
    # Parent content changes are irrelevant; only the approved edge is examined.
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid)


def _directory_key(fd: int, uid: int, gid: int,
                   device: int | None) -> tuple[int, ...]:
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    _require((flags & os.O_ACCMODE) == os.O_RDONLY
             and not (flags & getattr(os, "O_PATH", 0)),
             "ancestor FD must be readable and read-only")
    return _info_key(os.fstat(fd), uid, gid, device)


def _recheck(
    held: tuple[tuple[str, int, tuple[int, ...]], ...], uid: int, gid: int,
) -> None:
    device = held[0][2][0]
    for index, (name, fd, expected) in enumerate(held):
        _require(_directory_key(fd, uid, gid, device) == expected,
                 "held ancestor metadata changed")
        if index:
            parent = held[index - 1][1]
            entry = os.stat(name, dir_fd=parent, follow_symlinks=False)
            _require(_info_key(entry, uid, gid, device) == expected,
                     "approved ancestor entry no longer identifies held FD")


def _checked_recheck(held, uid, gid) -> None:
    try:
        _recheck(held, uid, gid)
    except SourceAnchorBlocked:
        raise
    except (OSError, ValueError, TypeError, OverflowError) as exc:
        raise SourceAnchorBlocked("source ancestor recheck failed") from exc


@contextmanager
def capture_anchored_candidate_sources(
    materials: LaunchMaterials,
    *,
    expected_launch_sha256: str,
    expected_owner_uid: int = 0,
    expected_owner_gid: int = 0,
) -> Iterator[AnchoredSourceSnapshot]:
    """Resolve the approved v1 sourceRoot; hold all ancestors and source bytes.

    Defaults require root:root throughout. Nonzero owners exist only for
    unprivileged tests whose namespace-root provider is replaced by a fixture.
    There is no public root/path override, permission elevation or install path.
    """
    _platform()
    _require(type(expected_owner_uid) is int and expected_owner_uid >= 0
             and type(expected_owner_gid) is int and expected_owner_gid >= 0,
             "invalid expected ancestor ownership")
    frozen, source_root = _freeze(materials, expected_launch_sha256)
    parts = _parts(source_root)
    owned: list[int] = []
    try:
        try:
            root = _open_namespace_root()
            _require(type(root) is int and root >= 0,
                     "namespace root provider returned an invalid FD")
            owned.append(root)
            identity = _directory_key(
                root, expected_owner_uid, expected_owner_gid, None)
            held = [("", root, identity)]
            bindings = [DirectoryBinding("/", identity)]
            path = ""
            for name in parts:
                fd = os.open(name, _flags(), dir_fd=held[-1][1])
                owned.append(fd)
                identity = _directory_key(
                    fd, expected_owner_uid, expected_owner_gid, held[0][2][0])
                path += "/" + name
                held.append((name, fd, identity))
                bindings.append(DirectoryBinding(path, identity))
            fixed_ancestors = tuple(held)
            fixed_bindings = tuple(bindings)
            _recheck(fixed_ancestors, expected_owner_uid, expected_owner_gid)
        except SourceAnchorBlocked:
            raise
        except (OSError, ValueError, TypeError, OverflowError) as exc:
            raise SourceAnchorBlocked("source ancestor capture failed") from exc

        with capture_candidate_sources(
            held[-1][1], frozen,
            expected_launch_sha256=expected_launch_sha256,
            expected_owner_uid=expected_owner_uid,
            expected_owner_gid=expected_owner_gid,
        ) as snapshot:
            # The path must still bind after byte capture, before consumer entry.
            _checked_recheck(fixed_ancestors, expected_owner_uid,
                             expected_owner_gid)
            yield AnchoredSourceSnapshot(
                source_root, fixed_bindings, snapshot)
            _checked_recheck(fixed_ancestors, expected_owner_uid,
                             expected_owner_gid)
        _checked_recheck(fixed_ancestors, expected_owner_uid, expected_owner_gid)
    finally:
        for fd in reversed(owned):
            try:
                os.close(fd)
            except OSError:
                # Preserve any original consumer or source-reader exception.
                pass
