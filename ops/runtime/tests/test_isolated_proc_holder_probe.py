"""C5-G2-B2B4 live Linux /proc observations of owned disposable processes."""
from __future__ import annotations

import os
import select
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import isolated_proc_holder_probe as probe  # noqa: E402
from isolated_maintenance_operator import (  # noqa: E402
    PREFIX, MARKER, MARKER_BYTES,
)


@unittest.skipUnless(sys.platform == "linux", "requires Linux /proc")
class LabProcHolderTests(unittest.TestCase):
    def fixture(self):
        holder = tempfile.TemporaryDirectory(prefix=PREFIX, dir="/tmp")
        root = Path(holder.name)
        root.chmod(0o700)
        (root / MARKER).write_bytes(MARKER_BYTES)
        (root / MARKER).chmod(0o600)
        (root / "probe.txt").write_bytes(b"synthetic fixture only")
        (root / "probe.txt").chmod(0o600)
        return holder, root

    def child(self, root: Path, *, cwd: bool, opened: bool):
        # Deliberately unprivileged, no production paths, no shell or sudo.
        code = textwrap.dedent("""
            import os
            import sys
            if sys.argv[2] == "1":
                os.chdir(sys.argv[1])
            held = open(os.path.join(sys.argv[1], "probe.txt"), "rb") if (
                sys.argv[3] == "1") else None
            print("READY", flush=True)
            sys.stdin.readline()
            if held is not None:
                held.close()
        """)
        child = subprocess.Popen(
            [sys.executable, "-c", code, str(root),
             "1" if cwd else "0", "1" if opened else "0"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        readable, _, _ = select.select([child.stdout], [], [], 5)
        if not readable:
            child.kill()
            child.wait(timeout=5)
            self.fail("isolated child did not reach its READY handshake")
        self.assertEqual(child.stdout.readline().strip(), "READY")
        return child

    def finish(self, child: subprocess.Popen):
        try:
            if child.stdin:
                child.stdin.write("\n")
                child.stdin.flush()
                child.stdin.close()
            child.wait(timeout=5)
        except (BrokenPipeError, subprocess.TimeoutExpired):
            child.kill()
            child.wait(timeout=5)
        self.assertEqual(child.returncode, 0)

    def test_live_child_cwd_and_file_descriptor_detected(self):
        context, root = self.fixture()
        with context:
            child = self.child(root, cwd=True, opened=True)
            try:
                receipt = probe.observe_isolated_pid(root, child.pid)
                self.assertEqual(receipt["referenceKinds"], ["cwd", "fd"])
                self.assertTrue(receipt["hasLabReference"])
                self.assertTrue(receipt["pidStartStable"])
                for gate in ("rootLevelProcessCoverageVerified",
                             "mountNamespacesAndInodeAliasesVerified",
                             "crossProcessQuiescenceVerified",
                             "readyToInstall",
                             "authorizedToMutateProduction"):
                    self.assertIs(receipt[gate], False)
            finally:
                self.finish(child)

    def test_uncooperative_child_fd_reference_detected_even_without_cwd(self):
        context, root = self.fixture()
        with context:
            child = self.child(root, cwd=False, opened=True)
            try:
                receipt = probe.observe_isolated_pid(root, child.pid)
                self.assertEqual(receipt["referenceKinds"], ["fd"])
            finally:
                self.finish(child)

    def test_process_without_reference_is_not_quiescence_proof(self):
        context, root = self.fixture()
        with context:
            child = self.child(root, cwd=False, opened=False)
            try:
                receipt = probe.observe_isolated_pid(root, child.pid)
                self.assertFalse(receipt["hasLabReference"])
                self.assertEqual(receipt["referenceKinds"], [])
                self.assertFalse(receipt["crossProcessQuiescenceVerified"])
            finally:
                self.finish(child)

    def test_invalid_pid_and_fixture_rejected(self):
        context, root = self.fixture()
        with context:
            for pid in (-1, 0, True, "1", 2**31):
                with self.subTest(pid=pid), self.assertRaises(ValueError):
                    probe.observe_isolated_pid(root, pid)
            for path in (Path("/opt/sanq/runtime"), Path("/tmp"),
                         root / "other"):
                with self.subTest(path=path), self.assertRaises(ValueError):
                    probe.observe_isolated_pid(path, os.getpid())
            root.chmod(0o777)
            with self.assertRaises(ValueError):
                probe.observe_isolated_pid(root, os.getpid())
            root.chmod(0o700)
            (root / MARKER).write_bytes(b"untrusted marker")
            with self.assertRaises(ValueError):
                probe.observe_isolated_pid(root, os.getpid())

    def test_process_exit_fails_closed(self):
        context, root = self.fixture()
        with context:
            child = self.child(root, cwd=True, opened=True)
            pid = child.pid
            self.finish(child)
            with self.assertRaises(probe.LabProcessBlocked):
                probe.observe_isolated_pid(root, pid)

    def test_no_installer_or_root_action_surface(self):
        for name in ("main", "install", "execute", "deploy", "quiesce"):
            self.assertFalse(hasattr(probe, name))
        for import_name in ("subprocess", "fcntl"):
            self.assertNotIn(import_name, probe.__dict__)
        self.assertNotIn("ops/runtime/isolated_proc_holder_probe.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
