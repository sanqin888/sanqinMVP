"""C1-PREP-04 virtual-root FD fixtures, never the real production /root."""
from __future__ import annotations

import ast
from contextlib import contextmanager
from dataclasses import FrozenInstanceError, replace
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import normal_runtime_launch as launch
    import normal_runtime_source_anchor as anchor
    from normal_runtime_source_snapshot import CandidateSourceBlocked
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)


class SourceAnchorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.user_root = self.root / "root"
        self.operator = self.user_root / "sanq-runtime-operator"
        self.directory = self.operator / "normal-update-v1"
        for path in (self.user_root, self.operator, self.directory):
            path.mkdir(mode=0o700)
        self.sources = {
            "bootstrap.py": b"raise RuntimeError('must never execute')\n",
            "normal_runtime_launch.py": b"proposal_marker = 1\n",
            "normal_runtime_update.py": b"adapter_marker = 2\n",
        }
        for name, raw in self.sources.items():
            path = self.directory / name
            path.write_bytes(raw)
            path.chmod(0o400)
        self.materials = launch.freeze_launch_materials(
            source_commit="a" * 40, transaction_id="source-anchor-001",
            bootstrap_source="bootstrap.py", sources=self.sources)
        self.provider = patch.object(
            anchor, "_open_namespace_root", side_effect=self.open_root)
        self.root_mock = self.provider.start()

    def tearDown(self):
        self.provider.stop()
        self.temp.cleanup()

    def open_root(self):
        return os.open(self.root, os.O_RDONLY | os.O_DIRECTORY
                       | os.O_NOFOLLOW | os.O_CLOEXEC)

    def capture(self, **changes):
        options = {
            "materials": self.materials,
            "expected_launch_sha256": self.materials.sha256(),
            "expected_owner_uid": os.getuid(),
            "expected_owner_gid": os.getgid(),
        }
        options.update(changes)
        materials = options.pop("materials")
        return anchor.capture_anchored_candidate_sources(materials, **options)

    def fds(self):
        return set(os.listdir("/proc/self/fd"))

    def test_binds_all_approved_ancestors_and_composes_fixed_source_bytes(self):
        baseline = self.fds()
        self.user_root.chmod(0o755)
        self.operator.chmod(0o750)
        with self.capture() as bound:
            self.assertEqual(bound.source_root, launch.SOURCE_ROOT)
            self.assertEqual([item.path for item in bound.directories], [
                "/", "/root", "/root/sanq-runtime-operator",
                "/root/sanq-runtime-operator/normal-update-v1"])
            self.assertEqual(bound.source_snapshot.source_commit, "a" * 40)
            self.assertEqual(bound.source_snapshot.launch_sha256,
                             self.materials.sha256())
            for name, raw in self.sources.items():
                self.assertEqual(bound.source_snapshot.bytes_for(name), raw)
            with self.assertRaises(FrozenInstanceError):
                bound.source_root = "/another"
        self.assertEqual(self.fds(), baseline)

    def test_wrong_launch_pin_does_not_open_namespace_root(self):
        for pin in ("b" * 64, "", None, True):
            with self.subTest(pin=pin), self.assertRaises(
                    anchor.SourceAnchorBlocked):
                with self.capture(expected_launch_sha256=pin):
                    pass
        self.root_mock.assert_not_called()

    def test_invalid_materials_are_rejected_before_namespace_access(self):
        for proposal in (None, {}, replace(self.materials, sources=())):
            with self.subTest(proposal=proposal), self.assertRaises(
                    anchor.SourceAnchorBlocked):
                with self.capture(materials=proposal):
                    pass
        self.root_mock.assert_not_called()

    def test_invalid_owner_expectations_do_not_open_namespace_root(self):
        for field in ("expected_owner_uid", "expected_owner_gid"):
            for value in (True, -1, "0", None):
                with self.subTest(field=field, value=value), self.assertRaises(
                        anchor.SourceAnchorBlocked):
                    with self.capture(**{field: value}):
                        pass
        self.root_mock.assert_not_called()

    def test_unsupported_platform_rejects_before_namespace_access(self):
        with patch.object(anchor.sys, "platform", "darwin"):
            with self.assertRaises(anchor.SourceAnchorBlocked):
                with self.capture():
                    pass
        self.root_mock.assert_not_called()

    def test_unsafe_or_excessive_approved_paths_are_rejected_before_io(self):
        paths = ("/", "relative", "/root//operator", "/root/../candidate",
                 "/root/./candidate", "/root/", "/root/\u2603",
                 "/" + "a" * 129, "/" + "/".join(["d"] * 17),
                 "/" + "a" * 1024)
        for path in paths:
            with self.subTest(path=path), patch.object(launch, "SOURCE_ROOT", path):
                with self.assertRaises(anchor.SourceAnchorBlocked):
                    with self.capture():
                        pass
        self.root_mock.assert_not_called()

    def test_wrong_ancestor_ownership_is_rejected_without_fd_leaks(self):
        baseline = self.fds()
        for change in ({"expected_owner_uid": os.getuid() + 1},
                       {"expected_owner_gid": os.getgid() + 1}):
            with self.assertRaises(anchor.SourceAnchorBlocked):
                with self.capture(**change):
                    pass
        self.assertEqual(self.fds(), baseline)

    def test_writable_or_privileged_ancestor_modes_are_rejected(self):
        baseline = self.fds()
        for mode in (0o775, 0o777, 0o1700, 0o2700):
            self.operator.chmod(mode)
            with self.subTest(mode=oct(mode)), self.assertRaises(
                    anchor.SourceAnchorBlocked):
                with self.capture():
                    pass
            self.operator.chmod(0o700)
        self.assertEqual(self.fds(), baseline)

    def test_missing_ancestor_is_rejected_and_held_fds_are_closed(self):
        baseline = self.fds()
        os.rename(self.operator, self.user_root / "moved")
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.capture():
                pass
        self.assertEqual(self.fds(), baseline)

    def test_symlink_ancestor_to_same_source_bytes_is_not_followed(self):
        moved = self.root / "external"
        os.rename(self.operator, moved)
        self.operator.symlink_to(moved, target_is_directory=True)
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.capture():
                pass

    def test_regular_file_cannot_replace_an_ancestor_directory(self):
        os.rename(self.operator, self.root / "moved")
        self.operator.write_bytes(b"not a directory")
        self.operator.chmod(0o600)
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.capture():
                pass

    def test_leaf_still_requires_the_snapshot_reader_private_mode(self):
        self.directory.chmod(0o755)
        baseline = self.fds()
        with self.assertRaises(CandidateSourceBlocked):
            with self.capture():
                pass
        self.assertEqual(self.fds(), baseline)

    def test_byte_verification_is_not_bypassed_by_valid_ancestor_binding(self):
        path = self.directory / "bootstrap.py"
        path.chmod(0o600)
        path.write_bytes(b"x" * len(self.sources["bootstrap.py"]))
        path.chmod(0o400)
        baseline = self.fds()
        with self.assertRaises(CandidateSourceBlocked):
            with self.capture():
                pass
        self.assertEqual(self.fds(), baseline)

    def test_source_inventory_rejections_are_preserved_by_composition(self):
        (self.directory / "unapproved.py").write_bytes(b"unapproved")
        with self.assertRaises(CandidateSourceBlocked):
            with self.capture():
                pass

    def test_materials_are_copied_before_the_first_filesystem_operation(self):
        pin = self.materials.sha256()

        def mutate_then_open():
            object.__setattr__(self.materials, "source_commit", "b" * 40)
            return self.open_root()

        self.root_mock.side_effect = mutate_then_open
        with self.capture(expected_launch_sha256=pin) as bound:
            self.assertEqual(bound.source_snapshot.source_commit, "a" * 40)
            self.assertEqual(bound.source_snapshot.launch_sha256, pin)

    def test_parent_replacement_after_byte_capture_blocks_before_consumer_entry(self):
        real_capture = anchor.capture_candidate_sources
        baseline = self.fds()

        @contextmanager
        def replaced(*args, **kwargs):
            with real_capture(*args, **kwargs) as snapshot:
                os.rename(self.operator, self.user_root / "moved")
                yield snapshot

        with patch.object(anchor, "capture_candidate_sources", replaced):
            with self.assertRaises(anchor.SourceAnchorBlocked):
                with self.capture():
                    self.fail("replaced ancestor reached consumer")
        self.assertEqual(self.fds(), baseline)

    def test_parent_rename_during_consumer_scope_is_detected_on_normal_exit(self):
        baseline = self.fds()
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.capture() as bound:
                os.rename(self.operator, self.user_root / "moved")
                self.assertEqual(bound.source_snapshot.bytes_for("bootstrap.py"),
                                 self.sources["bootstrap.py"])
        self.assertEqual(self.fds(), baseline)

    def test_rebuilt_parent_with_identical_source_bytes_is_still_rejected(self):
        moved = self.user_root / "original"
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.capture() as bound:
                os.rename(self.operator, moved)
                shutil.copytree(moved, self.operator)
                self.assertEqual(bound.source_snapshot.bytes_for("bootstrap.py"),
                                 self.sources["bootstrap.py"])

    def test_ancestor_permission_drift_is_detected_without_automatic_repair(self):
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.capture():
                self.operator.chmod(0o775)
        self.assertEqual(self.operator.stat().st_mode & 0o777, 0o775)

    def test_unrelated_parent_entries_do_not_require_a_whole_directory_freeze(self):
        with self.capture() as bound:
            (self.operator / "unrelated.json").write_bytes(b"unrelated")
            (self.operator / "unrelated-dir").mkdir(mode=0o700)
            self.assertEqual(bound.source_snapshot.bytes_for("bootstrap.py"),
                             self.sources["bootstrap.py"])

    def test_consumer_failures_and_interruptions_keep_original_cause_and_close_fds(self):
        baseline = self.fds()
        for error in (RuntimeError("consumer"), OSError("consumer"),
                      KeyboardInterrupt(), SystemExit(23)):
            with self.subTest(error=type(error).__name__):
                with self.assertRaises(type(error)) as caught:
                    with self.capture():
                        raise error
                self.assertIs(caught.exception, error)
                self.assertEqual(self.fds(), baseline)

    def test_consumer_error_is_not_masked_by_ancestor_drift_or_rollback(self):
        error = RuntimeError("original")
        moved = self.user_root / "moved"
        with self.assertRaises(RuntimeError) as caught:
            with self.capture():
                os.rename(self.operator, moved)
                raise error
        self.assertIs(caught.exception, error)
        self.assertTrue(moved.is_dir())
        self.assertFalse(self.operator.exists())

    def test_namespace_root_open_failure_is_controlled(self):
        error = OSError("namespace root unavailable")
        self.root_mock.side_effect = error
        with self.assertRaises(anchor.SourceAnchorBlocked) as caught:
            with self.capture():
                pass
        self.assertIs(caught.exception.__cause__, error)

    def test_non_directory_or_opath_namespace_root_fds_are_closed_and_rejected(self):
        baseline = self.fds()
        providers = (
            lambda: os.open(self.directory / "bootstrap.py", os.O_RDONLY),
            lambda: os.open(self.root, os.O_PATH | os.O_DIRECTORY),
        )
        for provider in providers:
            self.root_mock.side_effect = provider
            with self.assertRaises(anchor.SourceAnchorBlocked):
                with self.capture():
                    pass
            self.assertEqual(self.fds(), baseline)

    def test_module_has_no_loader_cli_or_public_alternate_root_parameter(self):
        source = (ROOT / "normal_runtime_source_anchor.py").read_text()
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
            "__future__", "contextlib", "dataclasses", "fcntl", "os", "re",
            "stat", "sys", "typing", "normal_runtime_launch",
            "normal_runtime_source_snapshot",
        })
        self.assertNotIn("__main__", source)
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                        and n.name == "capture_anchored_candidate_sources")
        names = [arg.arg for arg in function.args.args + function.args.kwonlyargs]
        self.assertNotIn("root_fd", names)
        self.assertNotIn("root_path", names)
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/normal_runtime_source_anchor.py", SOURCE_FILES)
        self.assertFalse(hasattr(anchor.AnchoredSourceSnapshot, "execute"))
        self.assertFalse(hasattr(anchor.AnchoredSourceSnapshot, "authorize"))


if __name__ == "__main__":
    unittest.main()
