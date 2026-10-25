"""C1-PREP-07: real chain in a temporary virtual root, no real updates."""
from __future__ import annotations

import ast
from contextlib import contextmanager
from dataclasses import FrozenInstanceError
import os
from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import normal_runtime_candidate_scope as scope
    import normal_runtime_launch as launch
    import normal_runtime_update as ordinary_core
    import normal_runtime_source_anchor as anchor
    import normal_runtime_source_loader as loader
    from normal_runtime_inputs import PinnedInputsBlocked
    from normal_runtime_source_snapshot import CandidateSourceBlocked
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)


class NormalCandidateScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.user_root = self.root / "root"
        self.operator = self.user_root / "sanq-runtime-operator"
        self.directory = self.operator / "normal-update-v1"
        for path in (self.user_root, self.operator, self.directory):
            path.mkdir(mode=0o700)
        self.sources = {
            name + ".py": (ROOT / (name + ".py")).read_bytes()
            for name in loader.SELECTED_MODULES}
        self.sources["bootstrap.py"] = b"raise RuntimeError('bootstrap must not execute')\n"
        self.configure()
        self.events = []
        self.opened_roots = []
        self.before_publication = None
        self.real_capture = anchor.capture_anchored_candidate_sources
        self.real_load = loader.load_pinned_normal_candidate
        patches = (
            ("root_mock", patch.object(
                anchor, "_open_namespace_root", side_effect=self.open_root)),
            ("capture_mock", patch.object(
                scope, "capture_anchored_candidate_sources",
                side_effect=self.capture_fixture)),
            ("load_mock", patch.object(
                scope, "load_pinned_normal_candidate", side_effect=self.load_fixture)),
        )
        for name, patcher in patches:
            self.addCleanup(patcher.stop)
            setattr(self, name, patcher.start())

    def configure(self):
        for name, raw in self.sources.items():
            path = self.directory / name
            if path.exists():
                path.chmod(0o600)
            path.write_bytes(raw)
            path.chmod(0o400)
        self.materials = launch.freeze_launch_materials(
            source_commit="c" * 40, transaction_id="candidate-scope-001",
            bootstrap_source="bootstrap.py", sources=self.sources)
        self.request = ordinary_core.UpdateRequest(
            self.materials.transaction_id, "a" * 40, "b" * 40,
            "sha256:" + "1" * 64, "sha256:" + "2" * 64,
            "d" * 40, "e" * 40, "5" * 64, self.materials)
        self.launch_raw = launch.canonical(self.materials.document())
        self.request_raw = launch.canonical(self.request.document())
        self.prefix = "_sanq_candidate_" + self.materials.sha256()

    def open_root(self):
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        self.opened_roots.append(fd)
        return fd

    @contextmanager
    def capture_fixture(self, materials, **options):
        # The PUBLIC entry must request root:root. Only this test bridge changes
        # the owner expectation for a CI-owned virtual filesystem root.
        self.assertEqual(options["expected_owner_uid"], 0)
        self.assertEqual(options["expected_owner_gid"], 0)
        options["expected_owner_uid"] = os.getuid()
        options["expected_owner_gid"] = os.getgid()
        self.events.append("sources_open")
        try:
            with self.real_capture(materials, **options) as observed:
                yield observed
        finally:
            self.events.append("sources_closed")

    @contextmanager
    def load_fixture(self, *args, **kwargs):
        self.events.append("modules_open")
        try:
            with self.real_load(*args, **kwargs) as candidate:
                self.events.append("modules_ready")
                if self.before_publication:
                    self.before_publication()
                yield candidate
        finally:
            self.events.append("modules_closed")

    def assemble(self, **changes):
        options = {
            "launch_bytes": self.launch_raw,
            "request_bytes": self.request_raw,
            "expected_launch_sha256": launch.digest(self.launch_raw),
            "expected_request_sha256": launch.digest(self.request_raw),
        }
        options.update(changes)
        return scope.assemble_pinned_normal_candidate(**options)

    def keys(self):
        return {name for name in tuple(sys.modules)
                if name == self.prefix or name.startswith(self.prefix + ".")}

    def fds(self):
        return set(os.listdir("/proc/self/fd"))

    def assert_closed(self, baseline):
        self.assertEqual(self.fds(), baseline)
        self.assertFalse(self.keys())

    def test_full_chain_rechecks_and_closes_source_fds_before_caller_entry(self):
        baseline = self.fds()
        with self.assemble() as assembled:
            self.assertEqual(self.events, [
                "sources_open", "modules_open", "modules_ready", "sources_closed"])
            self.assertEqual(self.fds(), baseline)
            for fd in self.opened_roots:
                with self.assertRaises(OSError):
                    os.fstat(fd)
            self.assertEqual(len(self.keys()), 4)
            self.assertEqual(assembled.sources.source_root, launch.SOURCE_ROOT)
            self.assertEqual(assembled.sources.source_snapshot.launch_sha256,
                             self.materials.sha256())
            self.assertIs(type(assembled.loaded.request),
                          assembled.loaded.modules["normal_runtime_update"].UpdateRequest)
            self.assertIsNot(assembled.loaded.flow_type, ordinary_core.NormalUpdateFlow)
            self.assertEqual(launch.canonical(assembled.loaded.request.document()),
                             self.request_raw)
            self.events.append("caller")
            with self.assertRaises(FrozenInstanceError):
                assembled.loaded = None
        self.assertEqual(self.events[-2:], ["caller", "modules_closed"])
        self.assert_closed(baseline)

    def test_wrong_independent_input_pins_prevent_any_source_capture(self):
        for field in ("expected_launch_sha256", "expected_request_sha256"):
            with self.subTest(field=field), self.assertRaises(PinnedInputsBlocked):
                with self.assemble(**{field: "9" * 64}):
                    self.fail("wrong pins reached caller")
        self.capture_mock.assert_not_called()
        self.load_mock.assert_not_called()
        self.root_mock.assert_not_called()

    def test_invalid_but_pinned_request_is_rejected_before_any_source_capture(self):
        document = self.request.document()
        document["transactionId"] = "different-scope-001"
        raw = launch.canonical(document)
        with self.assertRaises(PinnedInputsBlocked):
            with self.assemble(request_bytes=raw, expected_request_sha256=launch.digest(raw)):
                pass
        self.capture_mock.assert_not_called()
        self.load_mock.assert_not_called()

    def test_public_entry_has_no_snapshot_owner_root_loader_or_callback_override(self):
        for field in ("snapshot", "expected_owner_uid", "expected_owner_gid",
                      "root_fd", "root_path", "loader", "callback"):
            with self.subTest(field=field), self.assertRaises(TypeError):
                with self.assemble(**{field: object()}):
                    pass
        self.capture_mock.assert_not_called()

    def test_wrong_file_bytes_are_rejected_before_loader_entry(self):
        path = self.directory / "normal_runtime_update.py"
        path.chmod(0o600)
        path.write_bytes(b"x" * len(self.sources[path.name]))
        path.chmod(0o400)
        baseline = self.fds()
        with self.assertRaises(CandidateSourceBlocked):
            with self.assemble():
                self.fail("wrong source bytes reached caller")
        self.load_mock.assert_not_called()
        self.assert_closed(baseline)

    def test_extra_source_file_is_rejected_before_loader_entry(self):
        (self.directory / "extra.py").write_bytes(b"extra")
        baseline = self.fds()
        with self.assertRaises(CandidateSourceBlocked):
            with self.assemble():
                pass
        self.load_mock.assert_not_called()
        self.assert_closed(baseline)

    def test_missing_ancestor_does_not_load_modules_or_repair_paths(self):
        moved = self.user_root / "moved"
        os.rename(self.operator, moved)
        baseline = self.fds()
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.assemble():
                pass
        self.load_mock.assert_not_called()
        self.assertTrue(moved.is_dir())
        self.assertFalse(self.operator.exists())
        self.assert_closed(baseline)

    def test_selected_syntax_failure_never_publishes_and_closes_all_resources(self):
        self.sources["normal_runtime_inputs.py"] += b"\ninvalid syntax !!!\n"
        self.configure()
        baseline = self.fds()
        with self.assertRaises(loader.CandidateLoadBlocked):
            with self.assemble():
                self.fail("syntax failure reached caller")
        self.assert_closed(baseline)

    def test_unselected_import_failure_preserves_loader_error_and_closes_fds(self):
        self.sources["normal_runtime_update.py"] += b"\nimport os\n"
        self.configure()
        baseline = self.fds()
        with self.assertRaisesRegex(loader.CandidateLoadBlocked, "unselected"):
            with self.assemble():
                self.fail("unselected import reached caller")
        self.assert_closed(baseline)

    def test_parent_drift_during_loading_is_rejected_before_caller_entry(self):
        moved = self.user_root / "moved"
        self.before_publication = lambda: os.rename(self.operator, moved)
        baseline = self.fds()
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.assemble():
                self.fail("changed ancestor reached caller")
        self.assertTrue(moved.is_dir())
        self.assertFalse(self.operator.exists())
        self.assert_closed(baseline)

    def test_source_drift_during_loading_is_rejected_before_caller_entry(self):
        path = self.directory / "normal_runtime_update.py"

        def drift():
            path.chmod(0o600)
            path.write_bytes(b"x" * len(self.sources[path.name]))
            path.chmod(0o400)

        self.before_publication = drift
        baseline = self.fds()
        with self.assertRaises(CandidateSourceBlocked):
            with self.assemble():
                self.fail("source exit recheck was deferred until caller exit")
        self.assert_closed(baseline)

    def test_ancestor_permission_drift_during_loading_blocks_before_publication(self):
        self.before_publication = lambda: self.operator.chmod(0o775)
        baseline = self.fds()
        with self.assertRaises(anchor.SourceAnchorBlocked):
            with self.assemble():
                self.fail("unsafe ancestor reached caller")
        self.assertEqual(self.operator.stat().st_mode & 0o777, 0o775)
        self.assert_closed(baseline)

    def test_unrelated_parent_entry_change_does_not_freeze_the_whole_parent(self):
        self.before_publication = lambda: (self.operator / "unrelated").mkdir(mode=0o700)
        with self.assemble() as assembled:
            self.assertEqual(assembled.loaded.request.launch.sha256(),
                             self.materials.sha256())

    def test_after_publication_calls_use_fixed_loaded_bytes_not_source_paths(self):
        original = self.sources["normal_runtime_update.py"]
        with self.assemble() as assembled:
            path = self.directory / "normal_runtime_update.py"
            path.chmod(0o600)
            path.write_bytes(b"unusable source after loading")
            self.assertEqual(assembled.sources.source_snapshot.bytes_for(path.name), original)
            self.assertEqual(launch.canonical(assembled.loaded.request.document()),
                             self.request_raw)
        # Source metadata are completed observations, not a continuing path lease.
        self.assertEqual(path.read_bytes(), b"unusable source after loading")
        self.assertFalse(self.keys())

    def test_consumer_failures_keep_original_instances_and_close_module_scope(self):
        baseline = self.fds()
        for error in (RuntimeError("consumer"), OSError("consumer"),
                      KeyboardInterrupt(), SystemExit(23)):
            with self.subTest(kind=type(error).__name__):
                with self.assertRaises(type(error)) as caught:
                    with self.assemble():
                        raise error
                self.assertIs(caught.exception, error)
                self.assert_closed(baseline)

    def test_nested_same_candidate_rejection_does_not_harm_first_assembly(self):
        baseline = self.fds()
        with self.assemble() as first:
            with self.assertRaises(loader.CandidateLoadBlocked):
                with self.assemble():
                    pass
            core = first.loaded.modules["normal_runtime_update"]
            self.assertIs(sys.modules[core.__name__], core)
            self.assertEqual(first.loaded.request.transaction_id,
                             self.materials.transaction_id)
        self.assert_closed(baseline)

    def test_registry_drift_is_reported_and_foreign_replacement_is_preserved(self):
        baseline = self.fds()
        key = self.prefix + ".normal_runtime_update"
        foreign = ModuleType(key)
        with patch.dict(sys.modules):
            with self.assertRaises(loader.CandidateLoadBlocked):
                with self.assemble():
                    sys.modules[key] = foreign
            self.assertIs(sys.modules[key], foreign)
        self.assert_closed(baseline)

    def test_consumer_error_is_not_masked_by_module_registry_drift(self):
        error = RuntimeError("original")
        key = self.prefix + ".normal_runtime_update"
        with patch.dict(sys.modules):
            with self.assertRaises(RuntimeError) as caught:
                with self.assemble():
                    sys.modules[key] = ModuleType(key)
                    raise error
            self.assertIs(caught.exception, error)
        self.assertFalse(self.keys())

    def test_assembly_never_implicitly_invokes_the_normal_flow(self):
        self.sources["normal_runtime_update.py"] += (
            b"\nNormalUpdateFlow.run = lambda *args, **kwargs: "
            b"(_ for _ in ()).throw(AssertionError('must not invoke flow'))\n")
        self.configure()
        with self.assemble() as assembled:
            self.assertTrue(callable(assembled.loaded.flow_type.run))

    def test_assembly_does_not_supply_effect_capabilities_or_authority(self):
        with self.assemble() as assembled:
            core = assembled.loaded.modules["normal_runtime_update"]
            with self.assertRaises(core.NormalUpdateBlocked):
                assembled.loaded.flow_type().run(assembled.loaded.request, object())
            for field in ("sourceProvenanceAuthenticated",
                          "dynamicDependencyClosureVerified", "launchAuthorized"):
                self.assertIs(assembled.loaded.request.launch.document()[field], False)
            self.assertFalse(hasattr(assembled, "execute"))
            self.assertFalse(hasattr(assembled, "authorize"))

    def test_module_boundary_has_no_cli_io_flow_call_or_new_bundle_member(self):
        source = (ROOT / "normal_runtime_candidate_scope.py").read_text()
        tree = ast.parse(source)
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(item.name for item in node.names)
            if isinstance(node, ast.ImportFrom):
                imports.add(node.module)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                self.assertNotIn(node.func.id, {"open", "exec", "compile", "eval", "__import__"})
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                self.assertNotIn(node.func.attr, {"run", "write", "write_text", "write_bytes"})
        self.assertLessEqual(imports, {
            "__future__", "contextlib", "dataclasses", "typing",
            "normal_runtime_inputs", "normal_runtime_source_anchor",
            "normal_runtime_source_loader",
        })
        self.assertNotIn("__main__", source)
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/normal_runtime_candidate_scope.py", SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
