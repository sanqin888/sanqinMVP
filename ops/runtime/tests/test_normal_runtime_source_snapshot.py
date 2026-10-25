"""C1-PREP-03 Linux FD fixtures; no candidate source is executed."""
from __future__ import annotations

import ast
from dataclasses import FrozenInstanceError, replace
import fcntl
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import normal_runtime_source_snapshot as reader
    from normal_runtime_launch import freeze_launch_materials
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)


class CandidateSourceSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.parent = Path(self.temp.name)
        self.directory = self.parent / "sources"
        self.directory.mkdir(mode=0o700)
        self.sources = {
            "bootstrap.py": b"raise RuntimeError('must never execute')\n",
            "normal_runtime_launch.py": b"proposal_marker = 1\n",
            "normal_runtime_update.py": b"adapter_marker = 2\n",
        }
        for name, raw in self.sources.items():
            path = self.directory / name
            path.write_bytes(raw)
            path.chmod(0o400)
        self.materials = freeze_launch_materials(
            source_commit="a" * 40, transaction_id="source-snapshot-001",
            bootstrap_source="bootstrap.py", sources=self.sources)
        self.fd = os.open(
            self.directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)

    def tearDown(self):
        if self.fd is not None:
            os.close(self.fd)
        self.temp.cleanup()

    def capture(self, **changes):
        options = {
            "directory_fd": self.fd,
            "materials": self.materials,
            "expected_launch_sha256": self.materials.sha256(),
            "expected_owner_uid": os.getuid(),
            "expected_owner_gid": os.getgid(),
        }
        options.update(changes)
        fd = options.pop("directory_fd")
        materials = options.pop("materials")
        return reader.capture_candidate_sources(fd, materials, **options)

    def fd_set(self):
        return set(os.listdir("/proc/self/fd"))

    def mutate(self, name, raw):
        path = self.directory / name
        path.chmod(0o600)
        path.write_bytes(raw)
        path.chmod(0o400)

    def test_reads_exact_immutable_source_bytes_without_execution(self):
        baseline = self.fd_set()
        before = self.materials.document()
        (self.directory / "normal_runtime_update.py").chmod(0o600)
        with self.capture() as snapshot:
            self.assertEqual(snapshot.source_commit, "a" * 40)
            self.assertEqual(snapshot.launch_sha256, self.materials.sha256())
            self.assertEqual([f.name for f in snapshot.files], sorted(self.sources))
            for name, raw in self.sources.items():
                self.assertEqual(snapshot.bytes_for(name), raw)
            with self.assertRaises(FrozenInstanceError):
                snapshot.source_commit = "b" * 40
            with self.assertRaises(FrozenInstanceError):
                snapshot.files[0].content = b"changed"
            with self.assertRaises(reader.CandidateSourceBlocked):
                snapshot.bytes_for("not-pinned.py")
        self.assertEqual(self.fd_set(), baseline)
        self.assertEqual(self.materials.document(), before)
        for field in ("launchAuthorized", "sourceProvenanceAuthenticated",
                      "dynamicDependencyClosureVerified"):
            self.assertIs(before[field], False)
        self.assertEqual((self.directory / "bootstrap.py").read_bytes(),
                         self.sources["bootstrap.py"])

    def test_borrowed_fd_flags_and_directory_position_remain_unchanged(self):
        flags = fcntl.fcntl(self.fd, fcntl.F_GETFL)
        fd_flags = fcntl.fcntl(self.fd, fcntl.F_GETFD)
        offset = os.lseek(self.fd, 0, os.SEEK_CUR)
        identity = os.fstat(self.fd).st_ino
        with self.capture():
            pass
        self.assertEqual(os.fstat(self.fd).st_ino, identity)
        self.assertEqual(fcntl.fcntl(self.fd, fcntl.F_GETFL), flags)
        self.assertEqual(fcntl.fcntl(self.fd, fcntl.F_GETFD), fd_flags)
        self.assertEqual(os.lseek(self.fd, 0, os.SEEK_CUR), offset)

    def test_caller_can_close_borrowed_fd_without_closing_owned_snapshot(self):
        with self.capture() as snapshot:
            os.close(self.fd)
            self.fd = None
            self.assertEqual(snapshot.bytes_for("bootstrap.py"),
                             self.sources["bootstrap.py"])

    def test_wrong_launch_pin_blocks_before_any_descriptor_is_duplicated(self):
        with patch.object(reader.os, "dup", side_effect=AssertionError("FD used")):
            for pin in ("b" * 64, "", None, True):
                with self.subTest(pin=pin), self.assertRaises(
                        reader.CandidateSourceBlocked):
                    with self.capture(expected_launch_sha256=pin):
                        pass

    def test_invalid_proposals_block_before_filesystem_access(self):
        invalid = (None, {}, replace(self.materials, sources=()))
        with patch.object(reader.os, "dup", side_effect=AssertionError("FD used")):
            for proposal in invalid:
                with self.subTest(proposal=proposal), self.assertRaises(
                        reader.CandidateSourceBlocked):
                    with self.capture(materials=proposal):
                        pass

    def test_invalid_owner_expectations_are_rejected(self):
        for field in ("expected_owner_uid", "expected_owner_gid"):
            for value in (True, -1, "0", None):
                with self.subTest(field=field, value=value), self.assertRaises(
                        reader.CandidateSourceBlocked):
                    with self.capture(**{field: value}):
                        pass

    def test_unsupported_platform_rejects_before_source_reads(self):
        with patch.object(reader.sys, "platform", "darwin"):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    pass

    def test_invalid_and_closed_directory_descriptors_are_rejected(self):
        closed = os.dup(self.fd)
        os.close(closed)
        for fd in (-1, True, None, "fd", closed):
            with self.subTest(fd=fd), self.assertRaises(
                    reader.CandidateSourceBlocked):
                with self.capture(directory_fd=fd):
                    pass

    def test_regular_file_or_opath_cannot_be_a_readable_source_directory(self):
        file_fd = os.open(self.directory / "bootstrap.py", os.O_RDONLY)
        path_fd = os.open(self.directory, os.O_PATH | os.O_DIRECTORY)
        try:
            for fd in (file_fd, path_fd):
                with self.subTest(fd=fd), self.assertRaises(
                        reader.CandidateSourceBlocked):
                    with self.capture(directory_fd=fd):
                        pass
        finally:
            os.close(file_fd)
            os.close(path_fd)

    def test_directory_ownership_and_private_mode_are_required(self):
        for change in ({"expected_owner_uid": os.getuid() + 1},
                       {"expected_owner_gid": os.getgid() + 1}):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture(**change):
                    pass
        self.directory.chmod(0o750)
        with self.assertRaises(reader.CandidateSourceBlocked):
            with self.capture():
                pass

    def test_missing_source_is_rejected_before_opening_sources(self):
        (self.directory / "bootstrap.py").unlink()
        with patch.object(reader, "_open_source",
                          side_effect=AssertionError("unexpected source open")):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    pass

    def test_extra_source_or_metadata_is_rejected_before_opening_sources(self):
        (self.directory / "approval.json").write_bytes(b"not trusted")
        with patch.object(reader, "_open_source",
                          side_effect=AssertionError("unexpected source open")):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    pass

    def test_symlink_source_is_not_followed(self):
        path = self.directory / "bootstrap.py"
        other = self.parent / "external.py"
        other.write_bytes(self.sources["bootstrap.py"])
        other.chmod(0o400)
        path.unlink()
        path.symlink_to(other)
        with self.assertRaises(reader.CandidateSourceBlocked):
            with self.capture():
                pass

    def test_directory_cannot_replace_a_pinned_regular_source(self):
        path = self.directory / "bootstrap.py"
        path.unlink()
        path.mkdir(mode=0o700)
        with self.assertRaises(reader.CandidateSourceBlocked):
            with self.capture():
                pass

    def test_multiple_hardlinks_are_rejected(self):
        os.link(self.directory / "bootstrap.py", self.parent / "extra-link.py")
        with self.assertRaises(reader.CandidateSourceBlocked):
            with self.capture():
                pass

    def test_nonprivate_and_executable_source_modes_are_rejected(self):
        path = self.directory / "bootstrap.py"
        for mode in (0o640, 0o644, 0o700, 0o4600):
            path.chmod(mode)
            with self.subTest(mode=oct(mode)), self.assertRaises(
                    reader.CandidateSourceBlocked):
                with self.capture():
                    pass

    def test_wrong_source_size_or_bytes_cannot_produce_a_snapshot(self):
        for raw in (b"x", b"x" * len(self.sources["bootstrap.py"])):
            self.mutate("bootstrap.py", raw)
            with self.subTest(size=len(raw)), self.assertRaises(
                    reader.CandidateSourceBlocked):
                with self.capture():
                    pass

    def test_short_or_failed_pread_is_rejected_and_does_not_leak_fds(self):
        baseline = self.fd_set()
        with patch.object(reader.os, "pread", return_value=b""):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    pass
        self.assertEqual(self.fd_set(), baseline)
        with patch.object(reader.os, "pread", side_effect=OSError("read failed")):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    pass
        self.assertEqual(self.fd_set(), baseline)

    def test_growth_during_read_cannot_hide_behind_correct_prefix_bytes(self):
        path = self.directory / "bootstrap.py"
        path.chmod(0o600)
        real_pread = os.pread
        changed = False

        def grow(fd, count, offset):
            nonlocal changed
            if not changed:
                changed = True
                with path.open("ab") as output:
                    output.write(b"extra")
            return real_pread(fd, count, offset)

        with patch.object(reader.os, "pread", side_effect=grow):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    pass

    def test_same_bytes_path_replacement_during_capture_blocks_before_yield(self):
        replacement = self.parent / "replacement.py"
        replacement.write_bytes(self.sources["bootstrap.py"])
        replacement.chmod(0o400)
        real_read = reader._read
        changed = False

        def replace_after_read(fd, size):
            nonlocal changed
            raw = real_read(fd, size)
            if not changed:
                changed = True
                os.replace(replacement, self.directory / "bootstrap.py")
            return raw

        with patch.object(reader, "_read", side_effect=replace_after_read):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    self.fail("replaced entry reached consumer")

    def test_snapshot_keeps_original_bytes_but_normal_exit_rejects_content_drift(self):
        old = self.sources["bootstrap.py"]
        with self.assertRaises(reader.CandidateSourceBlocked):
            with self.capture() as snapshot:
                self.mutate("bootstrap.py", b"x" * len(old))
                self.assertEqual(snapshot.bytes_for("bootstrap.py"), old)

    def test_normal_exit_rejects_replaced_same_bytes_entry_or_extra_input(self):
        replacement = self.parent / "replacement.py"
        replacement.write_bytes(self.sources["bootstrap.py"])
        replacement.chmod(0o400)
        with self.assertRaises(reader.CandidateSourceBlocked):
            with self.capture():
                os.replace(replacement, self.directory / "bootstrap.py")
        with self.assertRaises(reader.CandidateSourceBlocked):
            with self.capture():
                (self.directory / "extra.py").write_bytes(b"extra")

    def test_caller_exceptions_and_interruptions_are_preserved_without_fd_leaks(self):
        baseline = self.fd_set()
        for error in (RuntimeError("caller"), OSError("caller"),
                      KeyboardInterrupt(), SystemExit(23)):
            with self.subTest(error=type(error).__name__):
                with self.assertRaises(type(error)) as caught:
                    with self.capture():
                        raise error
                self.assertIs(caught.exception, error)
                self.assertEqual(self.fd_set(), baseline)

    def test_caller_failure_does_not_restore_changed_files_or_mask_original_cause(self):
        error = RuntimeError("original caller failure")
        with self.assertRaises(RuntimeError) as caught:
            with self.capture():
                self.mutate("bootstrap.py", b"changed")
                raise error
        self.assertIs(caught.exception, error)
        self.assertEqual((self.directory / "bootstrap.py").read_bytes(), b"changed")

    def test_partial_open_failure_closes_owned_fds_and_keeps_borrowed_fd(self):
        baseline = self.fd_set()
        real_open = reader._open_source
        calls = 0

        def fail_second(directory, name):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("source open failed")
            return real_open(directory, name)

        with patch.object(reader, "_open_source", side_effect=fail_second):
            with self.assertRaises(reader.CandidateSourceBlocked):
                with self.capture():
                    pass
        self.assertEqual(self.fd_set(), baseline)
        self.assertGreater(os.fstat(self.fd).st_ino, 0)

    def test_snapshot_does_not_retain_mutable_caller_proposal(self):
        before = self.materials.sha256()
        with self.capture() as snapshot:
            object.__setattr__(self.materials, "source_commit", "b" * 40)
            self.assertEqual(snapshot.source_commit, "a" * 40)
            self.assertEqual(snapshot.launch_sha256, before)

    def test_module_has_no_execution_cli_or_bundle_authority(self):
        source = (ROOT / "normal_runtime_source_snapshot.py").read_text()
        tree = ast.parse(source)
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(item.name for item in node.names)
            if isinstance(node, ast.ImportFrom):
                imports.add(node.module)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                self.assertNotIn(node.func.id, {"exec", "eval", "compile", "__import__"})
        self.assertLessEqual(imports, {
            "__future__", "contextlib", "dataclasses", "fcntl", "os", "stat",
            "sys", "typing", "normal_runtime_launch",
        })
        self.assertNotIn("__main__", source)
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/normal_runtime_source_snapshot.py", SOURCE_FILES)
        self.assertFalse(hasattr(reader.SourceSnapshot, "execute"))
        self.assertFalse(hasattr(reader.SourceSnapshot, "authorize"))


if __name__ == "__main__":
    unittest.main()
