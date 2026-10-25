"""G2-B2B9-H1: unprivileged Linux orphan-holder characterization.

Tests own disposable /tmp/sanq-g2b2b-lab-* fixtures and same-UID children.
No root, systemd, guest access, production Runtime, backup, Docker or network.
This is only a parent-exit/child-reference example, NOT S3 systemd acceptance.
"""
from __future__ import annotations

import fcntl
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import isolated_proc_holder_probe as probe  # noqa: E402
from isolated_maintenance_operator import LOCK, MARKER, MARKER_BYTES, PREFIX  # noqa: E402
from proc_reference_census import _parse_pid_stat  # noqa: E402


_CHILD = textwrap.dedent("""
    import os
    import sys
    import time

    root = sys.argv[1]
    os.chdir(root)
    held = os.open("probe.txt", os.O_RDONLY)
    # The parent has already spawned us; a private marker signals FD+cwd readiness.
    with open(".child-ready", "xb") as ready:
        ready.write(b"READY")
    deadline = time.monotonic() + 15
    while not os.path.exists(".release") and time.monotonic() < deadline:
        time.sleep(.025)
    os.close(held)
""")

_PARENT = textwrap.dedent("""
    import subprocess
    import sys

    child = subprocess.Popen(
        [sys.executable, "-c", sys.argv[2], sys.argv[1]],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True,
    )
    print(child.pid, flush=True)
    # Exit immediately, leaving the separately created process running.
""")


@unittest.skipUnless(sys.platform == "linux", "Linux /proc fixture required")
class DetachedConsumerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix=PREFIX, dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        (self.root / MARKER).write_bytes(MARKER_BYTES)
        (self.root / MARKER).chmod(0o600)
        (self.root / "probe.txt").write_bytes(b"inert detached-holder fixture")
        (self.root / "probe.txt").chmod(0o600)

    def _identity(self, pid: int) -> int | None:
        try:
            start, excluded = _parse_pid_stat(Path("/proc") / str(pid) / "stat")
        except (OSError, ValueError):
            return None
        return None if excluded else start

    def _release(self, pid: int, birth: int) -> None:
        # Always arrange voluntary exit before the temporary directory is removed.
        (self.root / ".release").write_bytes(b"RELEASE")
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self._identity(pid) != birth:
                return
            time.sleep(.05)
        # Only signal the lab child while its kernel start identity still matches.
        if self._identity(pid) == birth:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if self._identity(pid) != birth:
                return
            time.sleep(.05)
        self.fail("isolated grandchild remained alive after release and termination")

    def _start_orphan(self) -> tuple[int, int]:
        parent = subprocess.run(
            [sys.executable, "-c", _PARENT, str(self.root), _CHILD],
            capture_output=True, text=True, timeout=5, check=True,
        )
        self.assertEqual(parent.stderr, "")
        self.assertEqual(len(parent.stdout.strip().splitlines()), 1)
        pid = int(parent.stdout.strip())
        birth = self._identity(pid)
        self.assertIsNotNone(birth, "owned child PID identity unavailable")
        self.addCleanup(self._release, pid, birth)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if (self.root / ".child-ready").exists():
                break
            time.sleep(.03)
        self.assertEqual((self.root / ".child-ready").read_bytes(), b"READY")
        self.assertEqual(self._identity(pid), birth)
        return pid, birth

    def test_parent_exit_does_not_remove_live_child_cwd_and_fd(self) -> None:
        pid, birth = self._start_orphan()
        self.assertEqual(self._identity(pid), birth)
        receipt = probe.observe_isolated_pid(self.root, pid)
        self.assertEqual(receipt["referenceKinds"], ["cwd", "fd"])
        self.assertTrue(receipt["hasLabReference"])
        for key in ("rootLevelProcessCoverageVerified", "crossProcessQuiescenceVerified",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(receipt[key], False)

    def test_free_flock_does_not_exclude_noncooperating_orphan(self) -> None:
        pid, _ = self._start_orphan()
        descriptor = os.open(self.root / LOCK, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            receipt = probe.observe_isolated_pid(self.root, pid)
            self.assertTrue(receipt["hasLabReference"])
            self.assertFalse(receipt["crossProcessQuiescenceVerified"])
        finally:
            os.close(descriptor)

    def test_no_guest_or_production_operation_added(self) -> None:
        import build_bundle
        self.assertEqual(len(build_bundle.SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/tests/test_h1_detached_consumer.py",
                         build_bundle.SOURCE_FILES)
        for restricted in ("sudo", "systemctl", "docker", "mount"):
            self.assertNotIn(restricted, (_PARENT + _CHILD).lower())


if __name__ == "__main__":
    unittest.main()
