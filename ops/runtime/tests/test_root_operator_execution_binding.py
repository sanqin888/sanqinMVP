"""B02-B4A pure synthetic execution-material binding characterization.

No root, OS process, filesystem source probing or operator execution.
"""
from dataclasses import replace
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_operator_execution_binding import (  # noqa: E402
    ExecutionBindingBlocked, HANDOFF_MODE, freeze_inert_source_material,
    review_inert_handoff,
)

SOURCE = b"# synthetic bytes; this content is never executed\n"
PIN = hashlib.sha256(SOURCE).hexdigest()


def identity(*, size=len(SOURCE)):
    return {
        "device": 2050, "inode": 1048603, "size": size,
        "mtimeNs": 123456789, "ctimeNs": 123456790,
    }


class InertExecutionBindingTests(unittest.TestCase):
    def material(self):
        return freeze_inert_source_material(
            SOURCE, expected_sha256=PIN, claimed_fd_identity=identity())

    def review(self, material, *, consumer=None, digest=PIN, fd_identity=None,
               mode=HANDOFF_MODE):
        return review_inert_handoff(
            material,
            proposed_consumer_bytes=(
                material.source_bytes if consumer is None else consumer),
            independently_pinned_sha256=digest,
            claimed_consumer_fd_identity=(
                identity() if fd_identity is None else fd_identity),
            handoff_mode=mode,
        )

    def test_same_immutable_snapshot_is_only_a_non_authorizing_model(self):
        result = self.review(self.material())
        self.assertTrue(result["sameSnapshotObjectClaimConsistent"])
        self.assertTrue(result["claimedFdIdentityConsistent"])
        self.assertTrue(result["sourceDigestConsistent"])
        self.assertEqual(result["decision"], "BLOCKED")
        for field in (
            "sourceProvenanceAuthenticated", "fdIdentityIndependentlyWitnessed",
            "pythonInterpreterAndImportClosureVerified",
            "actualConsumerExecutionVerified", "newConsumerAdmissionPrevented",
            "readyToInstall", "authorizedToMutateProduction",
        ):
            self.assertIs(result[field], False)

    def test_equal_bytes_in_a_new_object_do_not_prove_same_consumed_material(self):
        material = self.material()
        copied = bytes(bytearray(SOURCE))
        self.assertEqual(copied, material.source_bytes)
        self.assertIsNot(copied, material.source_bytes)
        with self.assertRaisesRegex(
                ExecutionBindingBlocked, "exact in-memory snapshot"):
            self.review(material, consumer=copied)

    def test_path_reopen_import_and_execution_strategies_cannot_be_accepted(self):
        material = self.material()
        for mode in ("path-reopen", "python-import", "importlib", "runpy",
                     "subprocess", "exec", "fd-reopen", "same-content-copy",
                     "", None, True):
            with self.subTest(mode=mode):
                with self.assertRaises(ExecutionBindingBlocked):
                    self.review(material, mode=mode)

    def test_source_digest_or_snapshot_tampering_blocks(self):
        material = self.material()
        with self.assertRaises(ExecutionBindingBlocked):
            self.review(material, digest="0" * 64)
        with self.assertRaises(ExecutionBindingBlocked):
            self.review(replace(material, source_bytes=b"altered"))
        with self.assertRaises(ExecutionBindingBlocked):
            self.review(replace(material, source_sha256="0" * 64))
        with self.assertRaises(ExecutionBindingBlocked):
            self.review(material, consumer=b"other bytes")

    def test_inode_or_size_drift_blocks_even_when_bytes_match(self):
        material = self.material()
        for field, value in (("inode", 22), ("device", 99),
                             ("mtimeNs", 1), ("ctimeNs", 1),
                             ("size", len(SOURCE) + 1),
                             ("inode", True)):
            observed = identity()
            observed[field] = value
            with self.subTest(field=field, value=value):
                with self.assertRaises(ExecutionBindingBlocked):
                    self.review(material, fd_identity=observed)

    def test_refuse_bad_identity_and_mutable_source_at_capture(self):
        invalid = (
            None, {"device": 1}, {**identity(), "extra": 1},
            {**identity(), "size": False},
            {**identity(), "inode": -1},
            {**identity(), "ctimeNs": "123"},
        )
        for candidate in invalid:
            with self.subTest(candidate=candidate):
                with self.assertRaises(ExecutionBindingBlocked):
                    freeze_inert_source_material(
                        SOURCE, expected_sha256=PIN,
                        claimed_fd_identity=candidate)
        for data in (bytearray(SOURCE), b"", SOURCE + b"mutated"):
            with self.subTest(data=data):
                with self.assertRaises(ExecutionBindingBlocked):
                    freeze_inert_source_material(
                        data, expected_sha256=PIN,
                        claimed_fd_identity=identity())

    def test_not_an_executor_and_not_a_runtime_bundle_member(self):
        import root_operator_execution_binding as module
        for forbidden in ("main", "execute", "run", "install",
                          "spawn", "compile", "open", "eval", "deliver"):
            self.assertFalse(hasattr(module, forbidden))
        for forbidden_import in ("os", "subprocess", "importlib", "ctypes", "runpy"):
            self.assertNotIn(forbidden_import, module.__dict__)
        self.assertNotIn(
            "ops/runtime/root_operator_execution_binding.py",
            __import__("build_bundle").SOURCE_FILES,
        )


if __name__ == "__main__":
    unittest.main()
