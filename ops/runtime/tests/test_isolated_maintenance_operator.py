"""G2-B2B isolated barrier tests; all host actions are synthetic."""
import hashlib
import subprocess
from pathlib import Path
import sys
import tempfile
import textwrap
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import isolated_maintenance_operator as op  # noqa: E402
from test_preinstall_maintenance_contract import claimed_idle_host  # noqa: E402


class FakeHost:
    def __init__(self):
        self.state = {"backupTimerEnabled": True, "backupTimerActive": True,
                      "backupServiceActive": False, "mcpActive": True}
        self.original = self.state.copy()
        self.calls = []
        self.busy = False
        self.restoration_fails = False

    def original_state(self):
        self.calls.append("original")
        return self.state.copy()

    def suspend(self):
        self.calls.append("suspend")
        self.state.update(backupTimerActive=False, backupServiceActive=False,
                          mcpActive=False)

    def observe(self):
        self.calls.append("observe")
        item = claimed_idle_host()
        if self.busy:
            item["maintenance"]["processCounts"]["deployProcesses"] = 1
        return item

    def restore(self, original):
        self.calls.append("restore")
        self.state = original.copy()
        if self.restoration_fails:
            self.state["backupTimerActive"] = not self.state["backupTimerActive"]


class OperatorBarrierTests(unittest.TestCase):
    def lab(self):
        context = tempfile.TemporaryDirectory(prefix=op.PREFIX, dir="/tmp")
        root = Path(context.name)
        root.chmod(0o700)
        (root / op.MARKER).write_bytes(op.MARKER_BYTES)
        (root / op.MARKER).chmod(0o600)
        source = b"# pinned reviewed inert operator source\n"
        (root / op.OPERATOR).write_bytes(source)
        (root / op.OPERATOR).chmod(0o600)
        return context, root, hashlib.sha256(source).hexdigest()

    def test_complete_synthetic_barrier_restores_state_never_authorizes(self):
        context, root, digest = self.lab()
        with context:
            host = FakeHost()
            receipt = op.execute_isolated_barrier(root, digest, host)
            self.assertEqual(host.state, host.original)
            self.assertEqual(host.calls, [
                "original", "suspend", "observe", "observe", "restore", "original",
            ])
            for name in ("independentRealHostQuiescenceVerified",
                         "encryptedExternalKitVerified", "readyToInstall",
                         "authorizedToMutateProduction"):
                self.assertIs(receipt[name], False)

    def test_noncooperating_consumer_blocks_and_restores(self):
        context, root, digest = self.lab()
        with context:
            host = FakeHost()
            host.busy = True
            with self.assertRaisesRegex(op.BarrierBlocked, "exclusion failed"):
                op.execute_isolated_barrier(root, digest, host)
            self.assertEqual(host.state, host.original)
            self.assertEqual(host.calls.count("observe"), 1)

    def test_restoration_failure_is_not_success(self):
        context, root, digest = self.lab()
        with context:
            host = FakeHost()
            host.restoration_fails = True
            with self.assertRaisesRegex(op.BarrierBlocked, "restoration failed"):
                op.execute_isolated_barrier(root, digest, host)

    def test_reject_unreviewed_or_modified_source(self):
        context, root, digest = self.lab()
        with context:
            host = FakeHost()
            for bad in ("0" * 64, "bad", digest.upper()):
                with self.subTest(bad=bad):
                    with self.assertRaises(op.BarrierBlocked):
                        op.execute_isolated_barrier(root, bad, host)
            (root / op.OPERATOR).write_bytes(b"unreviewed different content")
            with self.assertRaises(op.BarrierBlocked):
                op.execute_isolated_barrier(root, digest, host)
            self.assertEqual(host.calls, [])

    def test_reject_nonprivate_symlinked_and_production_root(self):
        context, root, digest = self.lab()
        with context:
            for bad in (Path("/opt/sanq/runtime"), Path("/tmp"),
                        root / "unrecognized"):
                with self.assertRaises(op.BarrierBlocked):
                    op.execute_isolated_barrier(bad, digest, FakeHost())
            root.chmod(0o777)
            with self.assertRaises(op.BarrierBlocked):
                op.execute_isolated_barrier(root, digest, FakeHost())
            root.chmod(0o700)
            (root / op.OPERATOR).unlink()
            (root / op.OPERATOR).symlink_to(root / op.MARKER)
            with self.assertRaises(OSError):
                op.execute_isolated_barrier(root, digest, FakeHost())

    def test_invalid_claim_prevents_success(self):
        context, root, digest = self.lab()
        with context:
            host = FakeHost()
            def dishonest_observation():
                item = claimed_idle_host()
                item["maintenance"]["backupTimerPaused"] = False
                return item
            host.observe = dishonest_observation
            with self.assertRaises(op.BarrierBlocked):
                op.execute_isolated_barrier(root, digest, host)
            self.assertEqual(host.state, host.original)

    def test_same_lab_lock_is_exclusive(self):
        context, root, digest = self.lab()
        with context:
            host = FakeHost()
            def nested_observe():
                with self.assertRaisesRegex(op.BarrierBlocked, "concurrent"):
                    op.execute_isolated_barrier(root, digest, FakeHost())
                return claimed_idle_host()
            host.observe = nested_observe
            receipt = op.execute_isolated_barrier(root, digest, host)
            self.assertFalse(receipt["readyToInstall"])

    @unittest.skipUnless(sys.platform == "linux", "Linux flock isolation")
    def test_separate_process_lock_rejects_and_releases(self):
        # Use only the exact temporary lab lock; no production processes.
        context, root, digest = self.lab()
        with context:
            code = textwrap.dedent("""
                import fcntl
                import os
                import sys
                fd = os.open(sys.argv[1],
                             os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                fcntl.flock(fd, fcntl.LOCK_EX)
                print("HELD", flush=True)
                sys.stdin.readline()
                os.close(fd)
            """)
            child = subprocess.Popen(
                [sys.executable, "-c", code, str(root / op.LOCK)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True,
            )
            try:
                self.assertEqual(child.stdout.readline().strip(), "HELD")
                host = FakeHost()
                with self.assertRaisesRegex(op.BarrierBlocked, "concurrent"):
                    op.execute_isolated_barrier(root, digest, host)
                self.assertEqual(host.calls, [])
            finally:
                if child.stdin is not None:
                    child.stdin.write("\n")
                    child.stdin.flush()
                    child.stdin.close()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
            self.assertEqual(child.returncode, 0)
            result = op.execute_isolated_barrier(root, digest, FakeHost())
            self.assertFalse(result["authorizedToMutateProduction"])

    def test_no_production_action_or_implicit_privilege(self):
        for name in ("main", "install", "deploy", "apply", "run_production"):
            self.assertFalse(hasattr(op, name))
        self.assertNotIn("subprocess", op.__dict__)
        self.assertNotIn("systemctl", op.__dict__)
        self.assertNotIn("ops/runtime/isolated_maintenance_operator.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
