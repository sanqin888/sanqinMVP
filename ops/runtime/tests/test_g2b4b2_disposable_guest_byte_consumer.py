"""Unprivileged synthetic characterization for disposable Guest B4B-2 entry.

CI does not run a privileged guest, and these results are never evidence that
a VirtualBox host/snapshot, root Bootstrap, or Python dependency is trusted.
"""
import hashlib
import os
import secrets
import shutil
import stat
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from g2b4b2_disposable_guest_byte_consumer import (  # noqa: E402
    FIXTURE_PREFIX, SOURCE_BYTES, SOURCE_SHA256, MARKER, MARKER_BYTES,
    SOURCE_NAME, GuestBoundaryBlocked, SyntheticSnapshot,
    snapshot_verified_synthetic_bytes, consume_synthetic_snapshot, main,
)


@unittest.skipIf(os.geteuid() == 0,
                 "This synthetic CI characterization must remain unprivileged")
class GuestOnlyByteConsumerTests(unittest.TestCase):
    def setUp(self):
        self.case_id = secrets.token_hex(4)
        self.root = Path("/tmp") / (FIXTURE_PREFIX + self.case_id)
        self.root.mkdir(mode=0o700)
        self.addCleanup(shutil.rmtree, self.root)
        self.marker = self.root / MARKER
        self.source = self.root / SOURCE_NAME
        self.marker.write_bytes(MARKER_BYTES)
        self.marker.chmod(0o600)
        self.source.write_bytes(SOURCE_BYTES)
        self.source.chmod(0o600)

    def capture(self, case_id=None):
        return snapshot_verified_synthetic_bytes(
            self.case_id if case_id is None else case_id,
            _synthetic_uid=os.geteuid(),
        )

    def test_verified_bytes_are_really_compiled_but_never_operator_code(self):
        snapshot = self.capture()
        result = consume_synthetic_snapshot(snapshot)
        self.assertTrue(result["fixedSyntheticCodeConsumed"])
        self.assertEqual(result["fixtureSourceSha256"], SOURCE_SHA256)
        self.assertEqual(hashlib.sha256(SOURCE_BYTES).hexdigest(), SOURCE_SHA256)
        self.assertEqual(result["decision"], "BLOCKED")
        for key in ("operatorCodeExecuted", "independentGuestIdentityAuthenticated",
                    "bootstrapSourceIndependentlyAuthenticated",
                    "interpreterAndDependencyClosureAuthenticated",
                    "rootGuestExecutionIndependentlyWitnessed",
                    "maintenanceIsolationVerified", "externalRecoveryKitVerified",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(result[key], False)

    def test_path_swap_after_capture_cannot_change_consumed_bytes(self):
        snapshot = self.capture()
        self.source.rename(self.root / "original")
        self.source.write_bytes(b"RESULT = 999\n")
        self.source.chmod(0o600)
        self.assertTrue(consume_synthetic_snapshot(snapshot)["fixedSyntheticCodeConsumed"])
        with self.assertRaises(GuestBoundaryBlocked):
            self.capture()

    def test_source_content_size_and_mode_drift_fail_closed(self):
        for payload in (b"RESULT = 40 + 3\n", b"", SOURCE_BYTES + b"# extra\n"):
            with self.subTest(payload=payload):
                self.source.write_bytes(payload)
                with self.assertRaises(GuestBoundaryBlocked):
                    self.capture()
        self.source.write_bytes(SOURCE_BYTES)
        self.source.chmod(0o644)
        with self.assertRaises(GuestBoundaryBlocked):
            self.capture()

    def test_symlink_hardlink_and_marker_changes_fail_closed(self):
        original = self.root / "sibling"
        self.source.rename(original)
        self.source.symlink_to(original)
        with self.assertRaises((GuestBoundaryBlocked, OSError)):
            self.capture()
        self.source.unlink()
        os.link(original, self.source)
        with self.assertRaises(GuestBoundaryBlocked):
            self.capture()
        self.source.unlink()
        original.rename(self.source)
        self.marker.write_bytes(b"tampered marker\n")
        with self.assertRaises(GuestBoundaryBlocked):
            self.capture()

    def test_private_directory_and_fixed_case_only(self):
        self.root.chmod(0o777)
        with self.assertRaises(GuestBoundaryBlocked):
            self.capture()
        self.root.chmod(0o700)
        for name in ("../evil", "123", "ABCDEF12", "ffffffff/", "", None):
            with self.subTest(name=name):
                with self.assertRaises(GuestBoundaryBlocked):
                    self.capture(name)

    def test_python_cannot_consume_arbitrary_bytes_or_identity(self):
        snap = self.capture()
        for obj in (
            SyntheticSnapshot(b"RESULT = 999\n", snap.device, snap.inode,
                              hashlib.sha256(b"RESULT = 999\n").hexdigest()),
            SyntheticSnapshot(b"", snap.device, snap.inode, SOURCE_SHA256),
            SyntheticSnapshot(snap.source_bytes, -1, snap.inode, SOURCE_SHA256),
            SyntheticSnapshot(snap.source_bytes, snap.device, True, SOURCE_SHA256),
        ):
            with self.subTest(obj=obj):
                with self.assertRaises(GuestBoundaryBlocked):
                    consume_synthetic_snapshot(obj)

    def test_cli_does_not_grant_nonroot_guest_execution(self):
        with self.assertRaises(SystemExit):
            main([])
        with patch("sys.stderr"):
            self.assertEqual(main(["--case-id", self.case_id]), 2)

    def test_runtime_bundle_and_service_integrations_untouched(self):
        import g2b4b2_disposable_guest_byte_consumer as module
        for unsafe in ("subprocess", "socket", "requests", "shutil", "docker"):
            self.assertNotIn(unsafe, module.__dict__)
        self.assertNotIn(
            "ops/runtime/g2b4b2_disposable_guest_byte_consumer.py",
            __import__("build_bundle").SOURCE_FILES,
        )


if __name__ == "__main__":
    unittest.main()
