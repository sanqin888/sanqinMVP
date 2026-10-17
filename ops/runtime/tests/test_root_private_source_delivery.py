"""B02-B3 synthetic, unprivileged create-only source delivery tests."""
import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_private_source_fd import (DIR_FLAGS, DIRECTORY, VERSION_DIRECTORY, SOURCE_FILE,
                                    RootPrivateSourceBlocked)
from root_private_source_delivery import deliver_fixed_source, SourceDeliveryBlocked

BYTES = b"# bounded synthetic source; NEVER execute\n"
DIGEST = hashlib.sha256(BYTES).hexdigest()


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.ctx = tempfile.TemporaryDirectory(prefix="sanq-b02b3-")
        self.addCleanup(self.ctx.cleanup)
        self.anchor = Path(self.ctx.name)
        self.anchor.chmod(0o700)
        self.parent = self.anchor / DIRECTORY
        self.version = self.parent / VERSION_DIRECTORY
        self.parent.mkdir(mode=0o700)
        self.version.mkdir(mode=0o700)
        self.target = self.version / SOURCE_FILE
        self.fd = os.open(self.anchor, DIR_FLAGS)
        self.addCleanup(os.close, self.fd)

    def deliver(self, data=BYTES, digest=DIGEST):
        return deliver_fixed_source(
            self.fd, data, expected_sha256=digest, _fixture_uid=os.getuid())

    def test_new_file_round_trip_is_non_authorizing(self):
        result = self.deliver()
        self.assertEqual(self.target.read_bytes(), BYTES)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
        self.assertTrue(result["independentReadbackConsistent"])
        for field in ("anchorProvenanceAuthenticated", "deliveryActorAuthenticated",
                      "independentWitnessVerified", "operatorExecuted",
                      "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(result[field], False)

    def test_never_overwrite_or_retry_occupied_target(self):
        self.deliver()
        with self.assertRaises(FileExistsError):
            self.deliver()
        self.assertEqual(self.target.read_bytes(), BYTES)
        # Corrupt/interrupted content is a preserved incident, never repaired.
        self.target.write_bytes(b"partial")
        with self.assertRaises(FileExistsError):
            self.deliver()
        self.assertEqual(self.target.read_bytes(), b"partial")

    def test_untrusted_source_and_permissions_block_before_create(self):
        for data, digest in ((b"", DIGEST), (BYTES, "0"*64),
                             (BYTES, "not-sha"), (BYTES + b"tamper", DIGEST)):
            with self.subTest(data=data, digest=digest):
                with self.assertRaises(SourceDeliveryBlocked):
                    self.deliver(data, digest)
                self.assertFalse(self.target.exists())
        self.version.chmod(0o777)
        with self.assertRaises(RootPrivateSourceBlocked):
            self.deliver()
        self.assertFalse(self.target.exists())

    def test_symlink_and_existing_target_block_without_touching_target(self):
        original = self.anchor / "original"
        original.write_bytes(b"original")
        self.target.symlink_to(original)
        with self.assertRaises((FileExistsError, OSError)):
            self.deliver()
        self.assertEqual(original.read_bytes(), b"original")

    def test_ancestor_swap_or_untrusted_anchor_blocks(self):
        self.parent.rename(self.anchor / "retained")
        self.parent.symlink_to(self.anchor / "retained", target_is_directory=True)
        with self.assertRaises((SourceDeliveryBlocked, OSError)):
            self.deliver()
        self.assertFalse((self.anchor / "retained" / VERSION_DIRECTORY / SOURCE_FILE).exists())
        self.parent.unlink()
        (self.anchor / "retained").rename(self.parent)
        self.anchor.chmod(0o755)
        with self.assertRaises(SourceDeliveryBlocked):
            self.deliver()

    def test_no_root_launcher_or_runtime_bundle_expansion(self):
        import root_private_source_delivery as module
        for field in ("main", "execute", "sudo", "deploy", "install_production"):
            self.assertFalse(hasattr(module, field))
        self.assertNotIn("subprocess", module.__dict__)
        self.assertNotIn("ops/runtime/root_private_source_delivery.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
