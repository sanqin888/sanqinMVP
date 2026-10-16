"""Unprivileged, synthetic B02-B2 FD source inspection tests."""
import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_private_source_fd import (  # noqa: E402
    DIR_FLAGS, DIRECTORY, SOURCE_FILE, VERSION_DIRECTORY,
    RootPrivateSourceBlocked, inspect_root_private_source,
)


class PinnedSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sanq-b02b2-synthetic-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        self.first = self.root / DIRECTORY
        self.second = self.first / VERSION_DIRECTORY
        self.first.mkdir(mode=0o700)
        self.second.mkdir(mode=0o700)
        self.source = self.second / SOURCE_FILE
        self.source.write_bytes(b"# reviewed synthetic operator bytes\n")
        self.source.chmod(0o600)
        self.digest = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.fd = os.open(self.root, DIR_FLAGS)
        self.addCleanup(os.close, self.fd)

    def inspect(self, digest=None):
        return inspect_root_private_source(
            self.fd, expected_sha256=self.digest if digest is None else digest,
            _fixture_uid=os.getuid())

    def test_clean_fd_source_is_still_non_authorizing(self):
        receipt = self.inspect()
        self.assertTrue(receipt["fdInspectionConsistent"])
        self.assertFalse(receipt["anchorProvenanceAuthenticated"])
        self.assertFalse(receipt["independentWitnessVerified"])
        self.assertFalse(receipt["rootOperatorExecuted"])
        self.assertFalse(receipt["readyToInstall"])
        self.assertFalse(receipt["authorizedToMutateProduction"])

    def test_wrong_digest_and_truncated_source_block(self):
        with self.assertRaises(RootPrivateSourceBlocked):
            self.inspect("0" * 64)
        self.source.write_bytes(b"")
        with self.assertRaises(RootPrivateSourceBlocked):
            self.inspect()

    def test_symlink_and_hardlink_block(self):
        alternate = self.root / "other"
        self.source.rename(alternate)
        self.source.symlink_to(alternate)
        with self.assertRaises((RootPrivateSourceBlocked, OSError)):
            self.inspect()
        self.source.unlink()
        os.link(alternate, self.source)
        with self.assertRaises(RootPrivateSourceBlocked):
            self.inspect()

    def test_directory_aliases_and_permission_drift_block(self):
        self.second.chmod(0o777)
        with self.assertRaises(RootPrivateSourceBlocked):
            self.inspect()
        self.second.chmod(0o700)
        self.source.chmod(0o644)
        with self.assertRaises(RootPrivateSourceBlocked):
            self.inspect()
        self.source.chmod(0o600)
        self.first.rename(self.root / "original")
        self.first.symlink_to(self.root / "original", target_is_directory=True)
        with self.assertRaises((RootPrivateSourceBlocked, OSError)):
            self.inspect()

    def test_anchor_and_missing_source_block(self):
        self.root.chmod(0o755)
        with self.assertRaises(RootPrivateSourceBlocked):
            self.inspect()
        self.root.chmod(0o700)
        self.source.unlink()
        with self.assertRaises((RootPrivateSourceBlocked, OSError)):
            self.inspect()

    def test_no_execution_delivery_or_runtime_bundle_expansion(self):
        import root_private_source_fd as module
        for name in ("main", "install", "execute", "deliver", "copy", "chmod",
                     "chown", "sudo", "deploy"):
            self.assertFalse(hasattr(module, name))
        self.assertNotIn("subprocess", module.__dict__)
        self.assertNotIn("ops/runtime/root_private_source_fd.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
