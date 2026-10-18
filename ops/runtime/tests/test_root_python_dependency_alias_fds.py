"""B2B2-B1: non-root Linux-only disposable symlink tree; never live Guest."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import root_python_dependency_alias_fds as alias_mod  # noqa: E402
from root_python_dependency_alias_fds import (  # noqa: E402
    AliasFDPathBlocked, borrow_candidate_alias_fds,
)
from root_python_dependency_fd_observer import (  # noqa: E402
    capture_preopened_dependency_fds,
)
from root_python_dependency_manifest import (  # noqa: E402
    SCHEMA, canonical_manifest_bytes,
)
from root_python_dependency_path_fds import (  # noqa: E402
    CandidatePathBlocked, borrow_candidate_dependency_fds,
)

PY = "/usr/bin/python3.12"
LOADER = "/lib64/ld-linux-x86-64.so.2"
ELF_LEAF = "/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"
PY_BYTES = b"synthetic python placeholder, NOT executable\n"
ELF_BYTES = b"synthetic ELF placeholder, NOT ELF\n"
ALIASES = {
    "/lib64": "/usr/lib64",
    "/usr/lib64/ld-linux-x86-64.so.2":
        "../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
}


def _manifest(extra=None):
    data = {PY: PY_BYTES, LOADER: ELF_BYTES}
    nodes = [
        {"id": "interpreter", "kind": "python-executable",
         "path": PY, "sha256": hashlib.sha256(PY_BYTES).hexdigest(),
         "requires": ["loader"] + (["lib:libsynthetic.so.1"] if extra else [])},
        {"id": "loader", "kind": "elf-loader",
         "path": LOADER, "sha256": hashlib.sha256(ELF_BYTES).hexdigest(),
         "requires": []},
    ]
    if extra:
        data["/lib/x86_64-linux-gnu/libsynthetic.so.1"] = extra
        nodes.append({
            "id": "lib:libsynthetic.so.1", "kind": "native-library",
            "path": "/lib/x86_64-linux-gnu/libsynthetic.so.1",
            "sha256": hashlib.sha256(extra).hexdigest(), "requires": [],
        })
    manifest = {"schema": SCHEMA, "platform": {
        "os": "linux", "architecture": "x86_64",
        "pythonVersion": "3.12.3", "isolationFlags": ["-I", "-S", "-B"],
    }, "nodes": nodes}
    return manifest, {k: hashlib.sha256(v).hexdigest()
                      for k, v in data.items()}, hashlib.sha256(
        canonical_manifest_bytes(manifest)).hexdigest()


@unittest.skipUnless(sys.platform == "linux" and hasattr(os, "O_PATH"),
                     "Linux O_PATH and procfs FD metadata required")
class BoundedAliasFDSyntheticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sanq-b2b2b1-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        for path, data in ((PY, PY_BYTES), (ELF_LEAF, ELF_BYTES)):
            dest = self.root / path.lstrip("/")
            dest.parent.mkdir(parents=True, exist_ok=True)
            for directory in dest.parents:
                if directory == self.root:
                    break
                directory.chmod(0o700)
            dest.write_bytes(data)
            dest.chmod(0o600)
        (self.root / "usr/lib64").mkdir(parents=True, exist_ok=True)
        (self.root / "usr/lib64").chmod(0o700)
        (self.root / "lib64").symlink_to("/usr/lib64", target_is_directory=True)
        (self.root / "usr/lib64/ld-linux-x86-64.so.2").symlink_to(
            ALIASES["/usr/lib64/ld-linux-x86-64.so.2"])
        self.manifest, self.pins, self.sha = _manifest()
        self.links = dict(ALIASES)
        self.anchor = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY
                             | os.O_NOFOLLOW | os.O_CLOEXEC)
        self.addCleanup(os.close, self.anchor)

    def borrow(self):
        return borrow_candidate_alias_fds(
            self.anchor, self.manifest,
            expected_manifest_sha256=self.sha,
            proposed_file_pins=self.pins,
            proposed_exact_links=self.links,
            _fixture_owner_uid=os.getuid(),
            _fixture_owner_gid=os.getgid(),
        )

    def test_directory_and_leaf_symlink_use_fd_not_resolved_name(self):
        with self.borrow() as (fds, trace):
            self.assertEqual(set(fds), {PY, LOADER})
            self.assertEqual(os.pread(fds[PY], 1024, 0), PY_BYTES)
            self.assertEqual(os.pread(fds[LOADER], 1024, 0), ELF_BYTES)
            self.assertEqual(trace[LOADER]["proposedCanonicalPath"], ELF_LEAF)
            self.assertEqual([x["linkPath"]
                              for x in trace[LOADER]["observedLinkCandidates"]],
                             list(ALIASES))
            self.assertFalse(trace[LOADER]["pathAndRootProvenanceAuthenticated"])
            self.assertFalse(trace[LOADER]["externalPinProvenanceAuthenticated"])
            self.assertFalse(trace[LOADER]["readyToInstall"])
            self.assertFalse(trace[LOADER]["authorizedToMutateProduction"])
            self.assertEqual(trace[LOADER]["decision"], "BLOCKED")
            receipt = capture_preopened_dependency_fds(
                self.manifest, proposed_manifest_sha256=self.sha,
                proposed_file_pins=self.pins, opened_file_fds=fds,
                expected_owner_uid=os.getuid(),
            )
            self.assertEqual(receipt["decision"], "BLOCKED")
            borrowed_fd = fds[LOADER]
        with self.assertRaises(OSError):
            os.fstat(borrowed_fd)

    def test_existing_strict_opener_still_rejects_all_symlinks(self):
        with self.assertRaises(CandidatePathBlocked):
            with borrow_candidate_dependency_fds(
                self.anchor, self.manifest,
                expected_manifest_sha256=self.sha,
                proposed_file_pins=self.pins,
                _fixture_owner_uid=os.getuid(),
                _fixture_owner_gid=os.getgid(),
            ):
                pass

    def test_native_lib_alias_is_independently_registered(self):
        name = "libsynthetic.so.1"
        dest = self.root / "usr/lib/x86_64-linux-gnu" / name
        dest.write_bytes(b"native mock, never executable\n")
        dest.chmod(0o600)
        (self.root / "lib").symlink_to("/usr/lib", target_is_directory=True)
        self.manifest, self.pins, self.sha = _manifest(dest.read_bytes())
        self.links["/lib"] = "/usr/lib"
        with self.borrow() as (fds, trace):
            path = "/lib/x86_64-linux-gnu/" + name
            self.assertEqual(os.pread(fds[path], 100, 0), dest.read_bytes())
            self.assertEqual(
                trace[path]["proposedCanonicalPath"],
                "/usr/lib/x86_64-linux-gnu/" + name)

    def test_wrong_link_text_unlisted_link_and_unused_claim(self):
        for variant in ("wrong", "missing", "unused"):
            with self.subTest(variant=variant):
                self.links = dict(ALIASES)
                if variant == "wrong":
                    self.links["/lib64"] = "/usr/other"
                elif variant == "missing":
                    del self.links["/usr/lib64/ld-linux-x86-64.so.2"]
                else:
                    self.links["/lib"] = "/usr/lib"
                with self.assertRaises(AliasFDPathBlocked):
                    with self.borrow():
                        pass

    def test_root_escape_and_cycle_fail_closed(self):
        leaf = self.root / "usr/lib64/ld-linux-x86-64.so.2"
        leaf.unlink()
        for link in ("../../../../../../etc/passwd",
                     "/lib64/ld-linux-x86-64.so.2"):
            with self.subTest(link=link):
                leaf.symlink_to(link)
                self.links[LOADER.replace("/lib64/", "/usr/lib64/")] = link
                with self.assertRaises(AliasFDPathBlocked):
                    with self.borrow():
                        pass
                leaf.unlink()

    def test_wrong_owner_writable_dir_fifo_and_hardlink(self):
        with self.assertRaises(AliasFDPathBlocked):
            with borrow_candidate_alias_fds(
                self.anchor, self.manifest,
                expected_manifest_sha256=self.sha,
                proposed_file_pins=self.pins, proposed_exact_links=self.links,
                _fixture_owner_uid=os.getuid() + 1,
                _fixture_owner_gid=os.getgid(),
            ):
                pass
        directory = self.root / "usr/lib"
        directory.chmod(0o777)
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass
        directory.chmod(0o700)

        destination = self.root / ELF_LEAF.lstrip("/")
        destination.rename(destination.with_suffix(".backup"))
        os.mkfifo(destination, 0o600)
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass
        destination.unlink()
        destination.with_suffix(".backup").rename(destination)
        os.link(destination, destination.with_suffix(".hardlink"))
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass

    def test_inode_replacement_detected_during_borrow(self):
        link = self.root / "usr/lib64/ld-linux-x86-64.so.2"
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow() as (fds, trace):
                self.assertEqual(os.pread(fds[LOADER], 100, 0), ELF_BYTES)
                link.rename(link.with_suffix(".old-link"))
                link.symlink_to(ALIASES["/usr/lib64/ld-linux-x86-64.so.2"])

    def test_mount_identity_and_namespace_drift_block(self):
        real_mount = alias_mod._mount_id
        anchor_inode = os.fstat(self.anchor).st_ino

        def inconsistent(fd):
            return real_mount(fd) + (
                1 if os.fstat(fd).st_ino != anchor_inode else 0
            )
        with mock.patch.object(alias_mod, "_mount_id", side_effect=inconsistent):
            with self.assertRaises(AliasFDPathBlocked):
                with self.borrow():
                    pass
        with mock.patch.object(alias_mod, "_mount_id",
                               side_effect=AliasFDPathBlocked("mnt_id missing")):
            with self.assertRaises(AliasFDPathBlocked):
                with self.borrow():
                    pass
        with mock.patch.object(alias_mod, "_namespace",
                               side_effect=["mnt:[11]", "mnt:[12]"]):
            with self.assertRaises(AliasFDPathBlocked):
                with self.borrow():
                    pass

    def test_reject_wrong_pins_and_invalid_permissions_claims(self):
        self.sha = "f" * 64
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass
        self.manifest, self.pins, self.sha = _manifest()
        self.pins[PY] = "e" * 64
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass
        self.manifest, self.pins, self.sha = _manifest()
        self.links = {"/lib64": "/usr/lib64", "/bad\n": "/usr/lib64"}
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass

    def test_reject_symlink_hops_limit_without_fd_leak(self):
        before = len(os.listdir("/proc/self/fd"))
        leaf = self.root / "usr/lib64/ld-linux-x86-64.so.2"
        leaf.unlink()
        leaf.symlink_to("/lib64/ld-linux-x86-64.so.2")
        self.links["/usr/lib64/ld-linux-x86-64.so.2"] = (
            "/lib64/ld-linux-x86-64.so.2")
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass
        self.assertEqual(len(os.listdir("/proc/self/fd")), before)

    def test_distinct_logical_nodes_cannot_share_one_final_inode(self):
        # A second B4B-3A module path is deliberately pointed at PY's inode.
        import copy
        self.manifest = copy.deepcopy(self.manifest)
        path = "/usr/lib/python3.12/synthetic.py"
        name = "py:synthetic"
        self.manifest["nodes"][0]["requires"].append(name)
        self.manifest["nodes"].append({
            "id": name, "kind": "stdlib-module",
            "path": path, "sha256": self.pins[PY], "requires": [],
        })
        self.pins[path] = self.pins[PY]
        self.sha = hashlib.sha256(
            canonical_manifest_bytes(self.manifest)).hexdigest()
        link = self.root / path.lstrip("/")
        link.parent.mkdir(parents=True, exist_ok=True)
        link.parent.chmod(0o700)
        link.symlink_to("/usr/bin/python3.12")
        self.links[path] = "/usr/bin/python3.12"
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass

    def test_file_and_symlink_byte_budgets_fail_closed(self):
        # Sparse test file: no real file content is read or executed.
        target = self.root / ELF_LEAF.lstrip("/")
        with target.open("r+b") as file:
            file.truncate(alias_mod.MAX_FILE_BYTES + 1)
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass

        target.unlink()
        target.write_bytes(ELF_BYTES)
        target.chmod(0o600)
        self.links["/usr/lib64/ld-linux-x86-64.so.2"] = (
            "a" * (alias_mod.MAX_LINK_BYTES + 1))
        with self.assertRaises(AliasFDPathBlocked):
            with self.borrow():
                pass

    def test_link_target_with_unknown_mount_evidence_never_falls_back(self):
        # Missing mount metadata is not equivalent to same st_dev.
        original = alias_mod._mount_id
        def missing_after_root(fd):
            if fd == self.anchor:
                return original(fd)
            raise OSError("synthetic unreadable proc fdinfo")
        with mock.patch.object(alias_mod, "_mount_id",
                               side_effect=missing_after_root):
            with self.assertRaises(AliasFDPathBlocked):
                with self.borrow():
                    pass

    def test_no_runtime_or_live_entry_point(self):
        import build_bundle
        self.assertNotIn(
            "ops/runtime/root_python_dependency_alias_fds.py",
            build_bundle.SOURCE_FILES)
        for forbidden in ("main", "run", "execute", "install", "subprocess",
                          "ctypes", "socket"):
            self.assertFalse(hasattr(alias_mod, forbidden), forbidden)


if __name__ == "__main__":
    unittest.main()
