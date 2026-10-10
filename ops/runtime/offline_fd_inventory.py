"""C5-U2D-2B2-A: read-only, descriptor-anchored offline Runtime inventory.

Independent of the U2D-2A transaction kernel. No mutation/production entry.
The lab root is a direct, private /tmp/sanq-u2d2a-lab-* fixture only.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat
from typing import Callable

from build_bundle import MANIFEST, SOURCE_FILES
from runtime_update_contract import PRESERVED
from offline_root_private_installer import PREFIX, MARKER, MARKER_CONTENT

DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
MAX_SOURCE = 2 * 1024 * 1024
MAX_DYNAMIC = 65536


class InventoryBlocked(ValueError):
    """Refuse an untrusted lab directory, race or member."""


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise InventoryBlocked(reason)


def identity(info: os.stat_result) -> tuple[int, int]:
    return (info.st_dev, info.st_ino)


def directory(fd: int, *, device: int, owner: int, group: int) -> os.stat_result:
    info = os.fstat(fd)
    require(stat.S_ISDIR(info.st_mode) and info.st_dev == device
            and info.st_uid == owner and info.st_gid == group
            and stat.S_IMODE(info.st_mode) == 0o700,
            "directory identity/owner/mode/device invalid")
    return info


def check_entry(parent_fd: int, name: str, fd: int) -> None:
    before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    require(identity(before) == identity(os.fstat(fd)),
            "directory entry changed while open")


def child_names(fd: int) -> set[str]:
    # os.dup(fd) shares directory offset; open "." creates an independent one.
    listing_fd = os.open(".", DIR_FLAGS, dir_fd=fd)
    try:
        return set(os.listdir(listing_fd))
    finally:
        os.close(listing_fd)


def open_directory(parent_fd: int, name: str, *, device: int,
                   owner: int, group: int) -> int:
    fd = os.open(name, DIR_FLAGS, dir_fd=parent_fd)
    try:
        directory(fd, device=device, owner=owner, group=group)
        check_entry(parent_fd, name, fd)
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_file(parent_fd: int, name: str, *, device: int, uid: int, gid: int,
              maximum: int, mode: int | None = None,
              before_read: Callable[[], None] | None = None
              ) -> tuple[bytes, os.stat_result]:
    fd = os.open(name, FILE_FLAGS, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                and info.st_dev == device and info.st_uid == uid
                and info.st_gid == gid and info.st_size <= maximum
                and not (stat.S_IMODE(info.st_mode) & 0o022),
                "file identity/owner/size/permissions invalid")
        if mode is not None:
            require(stat.S_IMODE(info.st_mode) == mode, "file mode invalid")
        check_entry(parent_fd, name, fd)
        if before_read is not None:
            before_read()
        data = bytearray()
        while len(data) <= maximum:
            block = os.read(fd, min(65536, maximum + 1 - len(data)))
            if not block:
                break
            data.extend(block)
        after = os.fstat(fd)
        require(len(data) <= maximum and len(data) == info.st_size
                and (info.st_mtime_ns, info.st_ctime_ns, info.st_size)
                == (after.st_mtime_ns, after.st_ctime_ns, after.st_size),
                "file changed while reading")
        check_entry(parent_fd, name, fd)
        return bytes(data), info
    finally:
        os.close(fd)


def inspect_lab_inventory(root: Path, *, slot: str = "live/runtime",
                          before_read: Callable[[], None] | None = None
                          ) -> dict[str, object]:
    """Validate exact tree entries with pinned directory descriptors.

    Returned metadata is point-in-time evidence, NOT a quiescence guarantee.
    The optional hook exists solely to deterministically test path swaps.
    """
    require(isinstance(root, Path) and root.is_absolute()
            and root.parent == Path("/tmp")
            and root.name.startswith(PREFIX)
            and slot in ("live/runtime", "stage/candidate",
                         "recovery/preimage", "retained/previous"),
            "non-lab path/slot refused")
    owner, group = os.geteuid(), os.getegid()
    tmp_fd = os.open("/tmp", DIR_FLAGS)
    owned: list[int] = [tmp_fd]
    try:
        tmp_dev = os.fstat(tmp_fd).st_dev
        root_fd = open_directory(tmp_fd, root.name, device=tmp_dev,
                                 owner=owner, group=group)
        owned.append(root_fd)
        marker, _ = read_file(root_fd, MARKER, device=tmp_dev,
                              uid=owner, gid=group, mode=0o600, maximum=64)
        require(marker == MARKER_CONTENT, "lab marker mismatch")
        current_fd = root_fd
        for part in slot.split("/"):
            current_fd = open_directory(current_fd, part, device=tmp_dev,
                                        owner=owner, group=group)
            owned.append(current_fd)
        tree_fd = current_fd
        source_paths = set(SOURCE_FILES) | {MANIFEST}
        expected_paths = source_paths | set(PRESERVED)
        folder_paths = {
            str(parent) for name in source_paths for parent in Path(name).parents
            if str(parent) != "."
        }
        # Traverse only allowlisted directories; check exact child names from
        # each pinned descriptor. Unexpected extra entries are always rejected.
        parents: dict[str, int] = {"": tree_fd}
        for name in sorted(folder_paths, key=lambda x: (x.count("/"), x)):
            parent, _, leaf = name.rpartition("/")
            fd = open_directory(parents[parent], leaf, device=tmp_dev,
                                owner=owner, group=group)
            owned.append(fd)
            parents[name] = fd
        expected_children: dict[str, set[str]] = {p: set() for p in parents}
        for directory_name in folder_paths:
            parent, _, leaf = directory_name.rpartition("/")
            expected_children[parent].add(leaf)
        for filename in expected_paths:
            parent, _, leaf = filename.rpartition("/")
            expected_children[parent].add(leaf)
        for directory_name, dir_fd in parents.items():
            require(child_names(dir_fd) == expected_children[directory_name],
                    "unexpected/missing Runtime members")
        members: dict[str, dict[str, int | str]] = {}
        for filename in sorted(expected_paths):
            parent, _, leaf = filename.rpartition("/")
            uid = owner
            gid = group
            mode = None
            maxbytes = MAX_SOURCE
            if filename in PRESERVED:
                maxbytes = MAX_DYNAMIC
                if filename == ".env" and owner == 0:
                    import pwd
                    user = pwd.getpwnam("ubuntu")
                    uid, gid = user.pw_uid, user.pw_gid
                mode = 0o644 if filename == ".sanq-backup-layout-activated" else 0o600
            elif filename == MANIFEST:
                maxbytes = 16384
            data, info = read_file(parents[parent], leaf, device=tmp_dev,
                                   uid=uid, gid=gid, mode=mode,
                                   maximum=maxbytes,
                                   before_read=before_read if filename == 'docker-compose.yml' else None)
            members[filename] = {
                "sha256": hashlib.sha256(data).hexdigest(),
                "size": len(data),
                "inode": info.st_ino,
                "device": info.st_dev,
                "uid": info.st_uid,
                "gid": info.st_gid,
                "mode": stat.S_IMODE(info.st_mode),
            }
        require(len({m["inode"] for m in members.values()}) == len(members),
                "intra-tree inode alias")
        # Recheck all pinned path components; a check/use gap alone
        # does not prove exclusive access, but a renamed entry fails closed.
        check_entry(tmp_fd, root.name, root_fd)
        slot_parent_fd = root_fd
        for part, opened_fd in zip(slot.split("/"), owned[2:2 + len(slot.split("/"))]):
            check_entry(slot_parent_fd, part, opened_fd)
            slot_parent_fd = opened_fd
        for name in sorted(folder_paths, key=lambda x: (x.count("/"), x)):
            parent, _, leaf = name.rpartition("/")
            check_entry(parents[parent], leaf, parents[name])
        for directory_name, dir_fd in parents.items():
            require(child_names(dir_fd) == expected_children[directory_name],
                    "Runtime directory entries changed during scan")
        return {
            "status": "offline-fd-inventory-only",
            "slot": slot, "treeInode": os.fstat(tree_fd).st_ino,
            "device": tmp_dev, "members": members,
            "quiescenceVerified": False,
            "productionActivationAuthorized": False,
            "readyToInstall": False,
        }
    finally:
        for fd in reversed(owned):
            os.close(fd)
