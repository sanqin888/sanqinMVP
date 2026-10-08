"""C5-B3B2D isolated-only trusted directory inspection fixture.

No user-supplied path or host/production entry point. This fixture builds its
own temporary tree; all inspection is read-only and retains no execution
authority. It does not inspect the actual VM.
"""
from __future__ import annotations

import os
import stat
import tempfile
from pathlib import Path

from versioned_persistence_contract import PersistenceBlocked


class HostFixtureBlocked(PersistenceBlocked):
    pass


class IsolatedHostFixture:
    NAMES = ("active", "releases", "state", "launcher", "uploads", "backups")

    def __init__(self) -> None:
        self._temp = tempfile.TemporaryDirectory(prefix="sanq-host-isolated-")
        self.root = Path(self._temp.name)
        self._closed = False
        self._root_stat = os.stat(self.root, follow_symlinks=False)

    def __enter__(self) -> "IsolatedHostFixture":
        return self

    def make_directory(self, name: str, *, mode: int = 0o700) -> Path:
        """Fixture construction only, confined to our fresh temporary root."""
        if self._closed or name not in self.NAMES:
            raise HostFixtureBlocked("invalid isolated fixture directory")
        path = self.root / name
        path.mkdir(mode=mode, exist_ok=False)
        return path

    def _trusted_root(self) -> int:
        if self._closed:
            raise HostFixtureBlocked("fixture closed")
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        fd = os.open(self.root, flags)
        info = os.fstat(fd)
        if (info.st_dev, info.st_ino) != (self._root_stat.st_dev, self._root_stat.st_ino):
            os.close(fd)
            raise HostFixtureBlocked("sandbox inode replacement")
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            os.close(fd)
            raise HostFixtureBlocked("sandbox owner/mode mismatch")
        return fd

    def inspect(self) -> dict[str, object]:
        """Inspect fixed isolated direct children using no-follow descriptor opens."""
        parent = self._trusted_root()
        try:
            entries = set(os.listdir(parent))
            if entries != set(self.NAMES):
                raise HostFixtureBlocked("missing or unknown isolated child")
            ids = set()
            for name in self.NAMES:
                fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                try:
                    info = os.fstat(fd)
                    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid()
                        or stat.S_IMODE(info.st_mode) & 0o022
                        or (info.st_dev, info.st_ino) in ids
                        or info.st_dev != self._root_stat.st_dev):
                        raise HostFixtureBlocked("unsafe isolated child inode/owner/mode/device")
                    ids.add((info.st_dev, info.st_ino))
                finally:
                    os.close(fd)
        except (OSError, ValueError) as exc:
            raise HostFixtureBlocked("isolated host identity check blocked") from exc
        finally:
            os.close(parent)
        return {
            "schemaVersion": 1,
            "kind": "isolated-host-inspection-v1",
            "filesystemLayoutExamined": True,
            "productionHostExamined": False,
            "dockerAndVolumeVerified": False,
            "archiveAndDigestVerified": False,
            "physicalReconciliationVerified": False,
            "readyToInstall": False,
            "authorizedToMutateProduction": False,
        }

    def close(self) -> None:
        if not self._closed:
            self._closed = True
            self._temp.cleanup()

    def __exit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        self.close()
