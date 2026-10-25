"""B4B-3B-2B1: unprivileged, disposable tree only, no Guest/root access."""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_python_dependency_manifest import (  # noqa: E402
    SCHEMA, canonical_manifest_bytes,
)
from root_python_dependency_fd_observer import (  # noqa: E402
    capture_preopened_dependency_fds,
)
from root_python_dependency_path_fds import (  # noqa: E402
    CandidatePathBlocked, borrow_candidate_dependency_fds,
)

PYTHON_PATH = "/usr/bin/python3.12"
LOADER_PATH = "/lib64/ld-linux-x86-64.so.2"
SYNTHETIC_BYTES = {
    PYTHON_PATH: b"not actual Python or an executable\n",
    LOADER_PATH: b"not an actual ELF dynamic loader\n",
}


def synthetic_manifest():
    pins = {path: hashlib.sha256(contents).hexdigest()
            for path, contents in SYNTHETIC_BYTES.items()}
    manifest = {
        "schema": SCHEMA,
        "platform": {
            "os": "linux", "architecture": "x86_64",
            "pythonVersion": "3.12.3",
            "isolationFlags": ["-I", "-S", "-B"],
        },
        "nodes": [
            {
                "id": "interpreter", "kind": "python-executable",
                "path": PYTHON_PATH, "sha256": pins[PYTHON_PATH],
                "requires": ["loader"],
            },
            {
                "id": "loader", "kind": "elf-loader",
                "path": LOADER_PATH, "sha256": pins[LOADER_PATH],
                "requires": [],
            },
        ],
    }
    digest = hashlib.sha256(canonical_manifest_bytes(manifest)).hexdigest()
    return manifest, pins, digest


class CandidateAnchoredPathsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sanq-b4b3b2b1-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        for relpath, data in SYNTHETIC_BYTES.items():
            dest = self.root / relpath.lstrip("/")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.parent.chmod(0o700)
            dest.write_bytes(data)
            dest.chmod(0o600)
        self.root_fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.addCleanup(os.close, self.root_fd)
        self.manifest, self.pins, self.pin = synthetic_manifest()

    def open_files(self):
        return borrow_candidate_dependency_fds(
            self.root_fd, self.manifest,
            expected_manifest_sha256=self.pin,
            proposed_file_pins=self.pins,
            _fixture_owner_uid=os.getuid(),
            _fixture_owner_gid=os.getgid(),
        )

    def test_borrowed_fd_identity_is_stable_but_never_authority(self):
        with self.open_files() as fd_map:
            self.assertEqual(set(fd_map), set(SYNTHETIC_BYTES))
            for path, fd in fd_map.items():
                self.assertEqual(os.pread(fd, 128, 0), SYNTHETIC_BYTES[path])
            observation = capture_preopened_dependency_fds(
                self.manifest, proposed_manifest_sha256=self.pin,
                proposed_file_pins=self.pins, opened_file_fds=fd_map,
                expected_owner_uid=os.getuid(),
            )
            self.assertEqual(observation["decision"], "BLOCKED")
            self.assertFalse(observation["preopenedFDAndPathProvenanceAuthenticated"])
            self.assertFalse(observation["readyToInstall"])
            self.assertFalse(observation["authorizedToMutateProduction"])
            owned_fd = fd_map[PYTHON_PATH]
        with self.assertRaises(OSError):
            os.fstat(owned_fd)

    def test_directory_symlink_and_file_symlink_are_blocked(self):
        original = self.root / "usr"
        renamed = self.root / "usr-old"
        original.rename(renamed)
        original.symlink_to("usr-old", target_is_directory=True)
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass

        original.unlink()
        renamed.rename(original)
        source = self.root / PYTHON_PATH.lstrip("/")
        source.rename(source.with_name("real-python"))
        source.symlink_to("real-python")
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass

    def test_rejects_writable_directory_and_file(self):
        (self.root / "usr").chmod(0o777)
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass
        (self.root / "usr").chmod(0o700)
        (self.root / PYTHON_PATH.lstrip("/")).chmod(0o666)
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass

    def test_rejects_hardlink_or_missing_file(self):
        source = self.root / LOADER_PATH.lstrip("/")
        os.link(source, source.with_name("alias.so"))
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass
        source.with_name("alias.so").unlink()
        source.unlink()
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass

    def test_fifo_rejected_without_blocking(self):
        source = self.root / PYTHON_PATH.lstrip("/")
        source.unlink()
        os.mkfifo(source, 0o600)
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass

    def test_invalid_anchor_fd_or_claimed_owner_rejected(self):
        with self.assertRaises(CandidatePathBlocked):
            with borrow_candidate_dependency_fds(
                True, self.manifest,
                expected_manifest_sha256=self.pin,
                proposed_file_pins=self.pins,
                _fixture_owner_uid=os.getuid(),
                _fixture_owner_gid=os.getgid(),
            ):
                pass
        with self.assertRaises(CandidatePathBlocked):
            with borrow_candidate_dependency_fds(
                self.root_fd, self.manifest,
                expected_manifest_sha256=self.pin,
                proposed_file_pins=self.pins,
                _fixture_owner_uid=os.getuid() + 1,
                _fixture_owner_gid=os.getgid(),
            ):
                pass

    def test_rejects_unpinned_manifest_and_untrusted_anchor(self):
        self.pin = "f" * 64
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass
        self.pin = synthetic_manifest()[2]
        (self.root / "usr").chmod(0o700)
        self.root.chmod(0o777)
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files():
                pass

    def test_path_replacement_detected_after_fd_observation(self):
        original = self.root / PYTHON_PATH.lstrip("/")
        with self.assertRaises(CandidatePathBlocked):
            with self.open_files() as fd_map:
                observed = os.pread(fd_map[PYTHON_PATH], 256, 0)
                self.assertEqual(observed, SYNTHETIC_BYTES[PYTHON_PATH])
                original.rename(original.with_name("previous"))
                original.write_bytes(b"replacement bytes with different inode\n")
                original.chmod(0o600)
        # This deterministic post-capture test is NOT a general race proof.
        self.assertEqual(original.read_bytes(),
                         b"replacement bytes with different inode\n")

    def test_anchor_identity_never_proves_host_root(self):
        # Any caller-supplied private directory FD is accepted as a candidate
        # anchor; only an external witness could authenticate real '/'.
        with self.open_files() as fds:
            self.assertIsInstance(fds[PYTHON_PATH], int)
        self.assertNotEqual(str(self.root), "/")

    def test_no_runtime_bundle_or_command_entry(self):
        import root_python_dependency_path_fds as component
        self.assertNotIn(
            "ops/runtime/root_python_dependency_path_fds.py",
            __import__("build_bundle").SOURCE_FILES,
        )
        for name in ("main", "install", "run", "execute",
                     "subprocess", "importlib", "ctypes"):
            self.assertFalse(hasattr(component, name), name)


if __name__ == "__main__":
    unittest.main()
