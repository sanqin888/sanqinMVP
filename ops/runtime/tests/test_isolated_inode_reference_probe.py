"""G2-B2B5: real Linux inode alias and mmap holder probes, lab only."""
from __future__ import annotations

import os
from pathlib import Path
import select
import subprocess
import sys
import tempfile
import textwrap
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import isolated_inode_reference_probe as inode_probe  # noqa: E402
import isolated_proc_holder_probe as path_probe  # noqa: E402
from isolated_maintenance_operator import PREFIX, MARKER, MARKER_BYTES  # noqa: E402


@unittest.skipUnless(sys.platform == "linux", "requires Linux /proc")
class IsolatedInodeReferenceTests(unittest.TestCase):
    def fixture(self):
        holder = tempfile.TemporaryDirectory(prefix=PREFIX, dir="/tmp")
        root = Path(holder.name)
        root.chmod(0o700)
        (root / MARKER).write_bytes(MARKER_BYTES)
        (root / MARKER).chmod(0o600)
        (root / inode_probe.SENTINEL).write_bytes(b"inert alias mapping fixture")
        (root / inode_probe.SENTINEL).chmod(0o600)
        return holder, root

    def start(self, alias: Path, kind: str):
        code = textwrap.dedent("""
            import ctypes
            import os
            import sys
            mode, path = sys.argv[1:]
            held = None
            if mode == "fd":
                held = open(path, "rb")
            elif mode == "map":
                # Call the kernel directly: Python's mmap wrapper can
                # retain a duplicated fd, which obscures the mmap-only case.
                fd = os.open(path, os.O_RDONLY)
                size = os.fstat(fd).st_size
                libc = ctypes.CDLL(None, use_errno=True)
                libc.mmap.restype = ctypes.c_void_p
                libc.mmap.argtypes = [
                    ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int,
                    ctypes.c_int, ctypes.c_int, ctypes.c_long,
                ]
                address = libc.mmap(None, size, 1, 2, fd, 0)
                if address == ctypes.c_void_p(-1).value:
                    raise OSError(ctypes.get_errno(), "mmap failed")
                os.close(fd)
                os.unlink(path)
            print("READY", flush=True)
            sys.stdin.readline()
            if held is not None:
                held.close()
        """)
        child = subprocess.Popen(
            [sys.executable, "-c", code, kind, str(alias)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        readable, _, _ = select.select([child.stdout], [], [], 5)
        if not readable:
            child.kill()
            child.wait(timeout=5)
            self.fail("isolated child did not become ready")
        line = child.stdout.readline().strip()
        if line != "READY":
            child.kill()
            child.wait(timeout=5)
            self.fail("isolated child did not acknowledge READY")
        return child

    def finish(self, child: subprocess.Popen):
        try:
            if child.stdin is not None:
                child.stdin.write("\n")
                child.stdin.flush()
                child.stdin.close()
            child.wait(timeout=5)
        except (BrokenPipeError, subprocess.TimeoutExpired):
            child.kill()
            child.wait(timeout=5)
        self.assertEqual(child.returncode, 0)

    def test_external_hardlink_fd_caught_by_inode_not_path(self):
        holder, root = self.fixture()
        with holder, tempfile.TemporaryDirectory(
                prefix="sanq-b2b5-alias-", dir="/tmp") as outside:
            alias = Path(outside) / "external-name.txt"
            os.link(root / inode_probe.SENTINEL, alias)
            child = self.start(alias, "fd")
            try:
                path_only = path_probe.observe_isolated_pid(root, child.pid)
                self.assertFalse(path_only["hasLabReference"])
                result = inode_probe.inspect_lab_inode_refs(root, child.pid)
                self.assertTrue(result["fdReferencesSentinelInode"])
                self.assertTrue(result["anyInodeReference"])
                self.assertFalse(result["crossProcessQuiescenceVerified"])
                self.assertFalse(result["authorizedToMutateProduction"])
            finally:
                self.finish(child)

    def test_closed_fd_mmap_of_unlinked_alias_is_detected(self):
        holder, root = self.fixture()
        with holder, tempfile.TemporaryDirectory(
                prefix="sanq-b2b5-alias-", dir="/tmp") as outside:
            alias = Path(outside) / "mapped-and-removed.txt"
            os.link(root / inode_probe.SENTINEL, alias)
            child = self.start(alias, "map")
            try:
                path_only = path_probe.observe_isolated_pid(root, child.pid)
                self.assertFalse(path_only["hasLabReference"])
                result = inode_probe.inspect_lab_inode_refs(root, child.pid)
                self.assertTrue(result["mmapReferencesSentinelInode"])
                self.assertFalse(result["fdReferencesSentinelInode"])
                self.assertFalse(result["readyToInstall"])
            finally:
                self.finish(child)

    def test_absent_refs_are_not_install_authority(self):
        holder, root = self.fixture()
        with holder:
            child = self.start(root / inode_probe.SENTINEL, "idle")
            try:
                result = inode_probe.inspect_lab_inode_refs(root, child.pid)
                self.assertFalse(result["anyInodeReference"])
                for flag in ("rootLevelCoverageVerified",
                             "mountNamespaceAliasesVerified",
                             "newConsumerExclusionVerified",
                             "crossProcessQuiescenceVerified",
                             "readyToInstall",
                             "authorizedToMutateProduction"):
                    self.assertFalse(result[flag])
            finally:
                self.finish(child)

    def test_wrong_pid_unsafe_fixture_and_symlink_sentinel_block(self):
        holder, root = self.fixture()
        with holder:
            for pid in (-1, 0, True, "1", 2**31):
                with self.subTest(pid=pid), self.assertRaises(ValueError):
                    inode_probe.inspect_lab_inode_refs(root, pid)
            for directory in (Path("/opt/sanq/runtime"), Path("/tmp")):
                with self.assertRaises(ValueError):
                    inode_probe.inspect_lab_inode_refs(directory, os.getpid())
            (root / inode_probe.SENTINEL).unlink()
            (root / inode_probe.SENTINEL).symlink_to(root / MARKER)
            with self.assertRaises(ValueError):
                inode_probe.inspect_lab_inode_refs(root, os.getpid())

    def test_exited_pid_blocks(self):
        holder, root = self.fixture()
        with holder:
            child = self.start(root / inode_probe.SENTINEL, "fd")
            pid = child.pid
            self.finish(child)
            with self.assertRaises(inode_probe.LabProcessBlocked):
                inode_probe.inspect_lab_inode_refs(root, pid)

    def test_source_has_no_production_entrypoint(self):
        for method in ("main", "install", "execute", "deploy", "quiesce"):
            self.assertFalse(hasattr(inode_probe, method))
        for imported in ("subprocess", "fcntl", "systemctl"):
            self.assertNotIn(imported, inode_probe.__dict__)
        self.assertNotIn("ops/runtime/isolated_inode_reference_probe.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
