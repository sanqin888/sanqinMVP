"""C5-U2D-2B: bounded real SIGKILL interruption evidence on disposable /tmp fixtures.

Under CI the child is unprivileged; only the *child itself* receives
SIGKILL. No services, Docker, production VM, /opt, or production state touched.
SIGKILL is not a power-loss or fsync durability test.
"""
from __future__ import annotations

import fcntl
import hashlib
import os
from pathlib import Path
import signal
import subprocess
import sys
import unittest

# Reuse the existing exact, already-reviewed lab fixture and Archive encoder.
TEST_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = TEST_DIR.parent
sys.path.insert(0, str(TEST_DIR))
from test_offline_root_private_installer import (  # noqa: E402
    APP_PREVIOUS, NEW, OLD, fixture, members, operator,
)

CHILD = r"""
import hashlib
import os
from pathlib import Path
import signal
import sys

sys.path.insert(0, sys.argv[1])
import offline_root_private_installer as operator

root = Path(sys.argv[2])
stop = sys.argv[3]
old_sha = sys.argv[4]
new_sha = sys.argv[5]

def lab_proof(payload, sha):
    return {
        "verified": True,
        "sourceSha": sha,
        "runtimeArchiveDigest": "sha256:" + hashlib.sha256(payload).hexdigest(),
        "productionActivationAuthorized": False,
    }

def kill_only_at_checkpoint(point, requested):
    if point == requested:
        os.kill(os.getpid(), signal.SIGKILL)

operator._stop = kill_only_at_checkpoint
if stop == "after_exchange_before_parent_fsync":
    original_exchange = operator._exchange
    def exchange_then_die(live_fd, stage_fd):
        original_exchange(live_fd, stage_fd)
        os.kill(os.getpid(), signal.SIGKILL)
    operator._exchange = exchange_then_die
elif stop == "pending_journal_before_parent_fsync":
    original_sync = operator._sync_dir
    def sync_unless_pending_journal(path):
        if path == root and (root / operator.JOURNAL).exists():
            os.kill(os.getpid(), signal.SIGKILL)
        original_sync(path)
    operator._sync_dir = sync_unless_pending_journal
operator.run_offline_operator_handoff(
    root, old_sha=old_sha, new_sha=new_sha,
    archive_verifier=lab_proof, stop_at=stop,
)
sys.exit(77)  # Fails the test if the selected checkpoint was not reached.
"""


@unittest.skipUnless(sys.platform == "linux", "Linux renameat2/SIGKILL required")
class OfflineSigkillRecoveryTests(unittest.TestCase):
    def _killed_at(self, location: Path, checkpoint: str) -> None:
        self.assertEqual(location.parent, Path("/tmp"))
        self.assertTrue(location.name.startswith(operator.PREFIX))
        result = subprocess.run(
            [sys.executable, "-c", CHILD, str(RUNTIME_DIR), str(location),
             checkpoint, OLD, NEW],
            cwd=str(RUNTIME_DIR), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            check=False, timeout=20,
        )
        self.assertEqual(result.returncode, -signal.SIGKILL,
                         f"unexpected child exit at {checkpoint}: "
                         f"{result.stderr.decode('utf-8', errors='replace')[:1000]}")
        self.assertNotIn(b"SECRET=not-in-logs", result.stdout + result.stderr)

    def test_real_sigkill_across_durable_and_pre_fsync_boundaries(self) -> None:
        checkpoints = {
            "before_journal": (None, OLD, None),
            # The following two windows are deliberately *not* durable-proof.
            "pending_journal_before_parent_fsync": ("before_exchange", OLD, "PENDING_EXCHANGE"),
            "after_journal": ("before_exchange", OLD, "PENDING_EXCHANGE"),
            "after_exchange_before_parent_fsync": ("after_exchange", NEW, "PENDING_EXCHANGE"),
            "after_exchange": ("after_exchange", NEW, "PENDING_EXCHANGE"),
            "after_exchange_journal": ("after_exchange", NEW, "EXCHANGED_UNCONFIRMED"),
            "after_retained": ("previous_retained", NEW, "EXCHANGED_UNCONFIRMED"),
            "after_final_journal": ("previous_retained", NEW, "PREVIOUS_RETAINED"),
        }
        for checkpoint, (observed, active_sha, journal_phase) in checkpoints.items():
            with self.subTest(checkpoint=checkpoint), fixture() as folder:
                lab = Path(folder)
                old_file_bytes = {
                    name: (lab / "live" / "runtime" / name).read_bytes()
                    for name in operator.PRESERVED
                }
                old_app_previous = APP_PREVIOUS
                self._killed_at(lab, checkpoint)
                self.assertEqual(operator._source_tree(
                    lab / "live" / "runtime", with_dynamic=True,
                    sha=active_sha)[0], members(active_sha))
                # Old Runtime snapshot survives all kill points after its fsync.
                snapshot = lab / "recovery" / "preimage"
                self.assertEqual(operator._source_tree(
                    snapshot, with_dynamic=True, sha=OLD)[0], members(OLD))
                for name in operator.PRESERVED:
                    self.assertEqual((snapshot / name).read_bytes(),
                                     old_file_bytes[name])
                    self.assertEqual((lab / "live" / "runtime" / name).read_bytes(),
                                     old_file_bytes[name])
                self.assertIn(
                    ('"previous": "' + old_app_previous + '"').encode(),
                    (lab / "live" / "runtime" / ".sanq-release-state.json").read_bytes(),
                )
                if observed is None:
                    self.assertFalse((lab / operator.JOURNAL).exists())
                    self.assertTrue((lab / "stage" / "candidate").exists())
                    with self.assertRaises((OSError, ValueError)):
                        operator.inspect_offline_operator_incident(lab, OLD, NEW)
                else:
                    evidence = operator.inspect_offline_operator_incident(lab, OLD, NEW)
                    self.assertEqual(evidence["observed"], observed)
                    self.assertEqual(evidence["journalPhase"], journal_phase)
                    self.assertIs(evidence["manualRecoveryRequired"], True)
                    self.assertIs(evidence["automaticRecovery"], False)
                    self.assertIs(evidence["authorizedToMutateProduction"], False)
                # Kernel releases the advisory flock when SIGKILL closes the
                # child descriptors, but the durable incident marker still
                # blocks an automatic resume.
                lock_fd = os.open(lab / operator.LOCK, os.O_RDWR | os.O_NOFOLLOW)
                try:
                    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                finally:
                    os.close(lock_fd)
                with self.assertRaisesRegex(ValueError, "unfinished"):
                    operator.run_offline_operator_handoff(
                        lab, old_sha=OLD, new_sha=NEW,
                        archive_verifier=lambda payload, sha: {
                            "verified": True,
                            "sourceSha": sha,
                            "runtimeArchiveDigest": "sha256:" + hashlib.sha256(payload).hexdigest(),
                            "productionActivationAuthorized": False,
                        },
                    )

    def test_invalid_lab_paths_never_launch_sigkill_worker(self) -> None:
        # Caller guard and worker launch remain strictly test-owned.
        with fixture() as folder:
            lab = Path(folder)
            self.assertEqual(lab.parent, Path("/tmp"))
            self.assertNotEqual(lab, Path("/opt/sanq/runtime"))
            with self.assertRaises(operator.OperatorHandoffBlocked):
                operator._guard(Path("/opt/sanq/runtime"))
            self.assertEqual((lab / operator.MARKER).read_bytes(),
                             operator.MARKER_CONTENT)


if __name__ == "__main__":
    unittest.main()
