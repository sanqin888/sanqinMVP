"""B4B-3B-1 bounded FD observer + offline reviewer, unprivileged fixtures."""
import hashlib
import os
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_python_dependency_manifest import SCHEMA, canonical_manifest_bytes  # noqa: E402
from root_python_dependency_fd_observer import (  # noqa: E402
    DependencyCaptureBlocked, OBSERVATION_SCHEMA,
    capture_preopened_dependency_fds,
)
from root_python_dependency_offline_review import (  # noqa: E402
    DependencyEvidenceBlocked, canonical_observation_bytes,
    review_dependency_fd_evidence,
)

SOURCE_A = b"synthetic Python interpreter bytes\n"
SOURCE_B = b"synthetic ELF loader bytes\n"


def node(identity, kind, path, digest, requires):
    return {"id": identity, "kind": kind, "path": path,
            "sha256": digest, "requires": requires}


def synthetic_claims():
    files = {
        "/usr/bin/python3.12": hashlib.sha256(SOURCE_A).hexdigest(),
        "/lib64/ld-linux-x86-64.so.2": hashlib.sha256(SOURCE_B).hexdigest(),
    }
    manifest = {
        "schema": SCHEMA,
        "platform": {
            "os": "linux", "architecture": "x86_64",
            "pythonVersion": "3.12.3", "isolationFlags": ["-I", "-S", "-B"],
        },
        "nodes": [
            node("interpreter", "python-executable", "/usr/bin/python3.12",
                 files["/usr/bin/python3.12"], ["loader"]),
            node("loader", "elf-loader", "/lib64/ld-linux-x86-64.so.2",
                 files["/lib64/ld-linux-x86-64.so.2"], []),
        ],
    }
    pin = hashlib.sha256(canonical_manifest_bytes(manifest)).hexdigest()
    return manifest, files, pin


class FdEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sanq-b4b3b1-")
        self.addCleanup(self.tmp.cleanup)
        self.path_a = Path(self.tmp.name) / "fake-python"
        self.path_b = Path(self.tmp.name) / "fake-loader"
        self.path_a.write_bytes(SOURCE_A)
        self.path_b.write_bytes(SOURCE_B)
        self.path_a.chmod(0o600)
        self.path_b.chmod(0o600)
        self.manifest, self.file_pins, self.manifest_pin = synthetic_claims()
        self.owner_uid = os.getuid()
        self.fd_a = os.open(self.path_a, os.O_RDONLY | os.O_NOFOLLOW)
        self.fd_b = os.open(self.path_b, os.O_RDONLY | os.O_NOFOLLOW)
        self.addCleanup(os.close, self.fd_a)
        self.addCleanup(os.close, self.fd_b)
        self.fds = {
            "/usr/bin/python3.12": self.fd_a,
            "/lib64/ld-linux-x86-64.so.2": self.fd_b,
        }

    def observe(self, fds=None):
        return capture_preopened_dependency_fds(
            self.manifest, proposed_manifest_sha256=self.manifest_pin,
            proposed_file_pins=self.file_pins,
            opened_file_fds=self.fds if fds is None else fds,
            expected_owner_uid=self.owner_uid,
        )

    def review(self, observation, **overrides):
        kwargs = {
            "expected_manifest_sha256": self.manifest_pin,
            "separately_supplied_file_sha256": self.file_pins,
            "expected_observation_sha256": hashlib.sha256(
                canonical_observation_bytes(observation)).hexdigest(),
            "expected_owner_uid": self.owner_uid,
        }
        kwargs.update(overrides)
        return review_dependency_fd_evidence(
            self.manifest, observation, **kwargs,
        )

    def test_fd_observation_and_separate_offline_comparison_remain_blocked(self):
        observation = self.observe()
        self.assertEqual(observation["schema"], OBSERVATION_SCHEMA)
        self.assertTrue(observation["fileBytesObservedFromProvidedFDs"])
        self.assertFalse(observation["preopenedFDAndPathProvenanceAuthenticated"])
        self.assertEqual(observation["decision"], "BLOCKED")
        self.assertEqual(len(observation["files"]), 2)
        self.assertEqual(observation["files"][0]["sha256"],
                         self.file_pins["/lib64/ld-linux-x86-64.so.2"])
        outcome = self.review(observation)
        self.assertTrue(outcome["candidateFileDigestsMatchSeparatePins"])
        for key in ("filesystemPathAndFDProvenanceIndependentlyAuthenticated",
                    "externalPinAndReceiptCustodyIndependentlyAuthenticated",
                    "actualPythonImportAndElfClosureVerified",
                    "rootGuestExecutionIndependentlyWitnessed",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertFalse(outcome[key], key)
        self.assertEqual(outcome["decision"], "BLOCKED")

    def test_observer_rejects_missing_extra_duplicate_nonreadable_fd(self):
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe({"/usr/bin/python3.12": self.fd_a})
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe({**self.fds, "/tmp/other": self.fd_b})
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe({k: self.fd_a for k in self.fds})
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe({k: True if k == "/usr/bin/python3.12" else fd
                          for k, fd in self.fds.items()})
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe({"/usr/bin/python3.12": -1,
                          "/lib64/ld-linux-x86-64.so.2": self.fd_b})

    def test_observer_rejects_writeable_fd_unsafe_permissions_and_alias(self):
        writable = os.open(self.path_a, os.O_RDWR)
        try:
            with self.assertRaises(DependencyCaptureBlocked):
                self.observe({**self.fds, "/usr/bin/python3.12": writable})
        finally:
            os.close(writable)
        self.path_a.chmod(0o666)
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe()
        self.path_a.chmod(0o600)
        os.link(self.path_b, Path(self.tmp.name) / "hard-link")
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe()

    def test_observer_rejects_changed_source_claim_only_in_offline_review(self):
        observation = self.observe()
        # No self-authenticating digest assertion in the capture stage.
        changed_fd = os.open(self.path_a, os.O_WRONLY)
        try:
            os.pwrite(changed_fd, b"Q", 0)
        finally:
            os.close(changed_fd)
        changed = self.observe()
        self.assertNotEqual(observation["files"][-1]["sha256"],
                            changed["files"][-1]["sha256"])
        with self.assertRaises(DependencyEvidenceBlocked):
            self.review(changed)
        # The previously captured hash is not itself an independent witness.
        self.assertFalse(observation["preopenedFDAndPathProvenanceAuthenticated"])

    def test_pread_preserves_fd_offset_and_metadata_drift_blocks(self):
        os.lseek(self.fd_a, 7, os.SEEK_SET)
        self.observe()
        self.assertEqual(os.lseek(self.fd_a, 0, os.SEEK_CUR), 7)

        original = os.fstat
        calls = {"count": 0}

        def drifted_fstat(fd):
            info = original(fd)
            if fd == self.fd_b:
                calls["count"] += 1
                if calls["count"] == 2:
                    fields = {key: getattr(info, key) for key in (
                        "st_dev", "st_ino", "st_size", "st_mtime_ns",
                        "st_ctime_ns", "st_uid", "st_gid", "st_mode",
                        "st_nlink",
                    )}
                    fields["st_mtime_ns"] += 1
                    return SimpleNamespace(**fields)
            return info

        with mock.patch("root_python_dependency_fd_observer.os.fstat",
                        side_effect=drifted_fstat):
            with self.assertRaises(DependencyCaptureBlocked):
                self.observe()

    def test_offline_verifier_is_not_implemented_by_guest_collector(self):
        import root_python_dependency_fd_observer as guest
        import root_python_dependency_offline_review as independent
        self.assertEqual(guest.OBSERVATION_SCHEMA, independent.OBSERVATION_SCHEMA)
        self.assertEqual(guest.MAX_FILE_BYTES, independent.MAX_FILE_BYTES)
        self.assertEqual(guest.MAX_TOTAL_BYTES, independent.MAX_TOTAL_BYTES)
        self.assertNotIn("root_python_dependency_fd_observer",
                         independent.__dict__)

    def test_missing_or_drifted_external_pins_and_receipt_pin_block(self):
        observation = self.observe()
        mismatched = dict(self.file_pins)
        mismatched["/usr/bin/python3.12"] = "0" * 64
        with self.assertRaises(DependencyEvidenceBlocked):
            self.review(observation, separately_supplied_file_sha256=mismatched)
        with self.assertRaises(DependencyEvidenceBlocked):
            self.review(observation, expected_observation_sha256="0" * 64)
        with self.assertRaises(DependencyEvidenceBlocked):
            self.review(observation, expected_manifest_sha256="0" * 64)

    def test_tampered_evidence_even_with_recomputed_digest_remains_blocked(self):
        observation = self.observe()
        alterations = [
            lambda o: o["files"][0].update({"sha256": "0" * 64}),
            lambda o: o["files"][0].update({"path": "/tmp/rogue"}),
            lambda o: o["files"][0].update({"uid": True}),
            lambda o: o["files"][0].update({"hardlinks": 2}),
            lambda o: o["files"][0].update({"device": 0}),
            lambda o: o["files"][0].update({"size": -1}),
            lambda o: o["files"].pop(),
            lambda o: o["files"].append(deepcopy(o["files"][0])),
            lambda o: o.update({"observedTotalBytes": 1}),
            lambda o: o.update({"readyToInstall": True}),
            lambda o: o.update({"preopenedFDAndPathProvenanceAuthenticated": True}),
            lambda o: o.update({"extra": True}),
        ]
        for idx, alter in enumerate(alterations):
            candidate = deepcopy(observation)
            alter(candidate)
            with self.subTest(case=idx):
                with self.assertRaises(DependencyEvidenceBlocked):
                    self.review(candidate)

    def test_incomplete_or_unsafe_manifest_blocks_collector(self):
        self.manifest["nodes"][0]["requires"] = ["unknown"]
        self.manifest_pin = hashlib.sha256(
            canonical_manifest_bytes(self.manifest)).hexdigest()
        with self.assertRaises(DependencyCaptureBlocked):
            self.observe()

    def test_no_production_execution_or_bundle_expansion(self):
        import root_python_dependency_fd_observer as collector
        import root_python_dependency_offline_review as verifier
        self.assertNotIn(
            "ops/runtime/root_python_dependency_fd_observer.py",
            __import__("build_bundle").SOURCE_FILES)
        self.assertNotIn(
            "ops/runtime/root_python_dependency_offline_review.py",
            __import__("build_bundle").SOURCE_FILES)
        for module in (collector, verifier):
            for name in ("main", "run", "execute", "install", "subprocess",
                         "importlib", "ctypes"):
                self.assertFalse(hasattr(module, name), (module.__name__, name))


if __name__ == "__main__":
    unittest.main()
