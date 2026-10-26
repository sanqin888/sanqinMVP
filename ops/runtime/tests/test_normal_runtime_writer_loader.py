"""Private writer source assembly tests; imports inert, no real consumption."""
import builtins
from dataclasses import replace
import inspect
import os
from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_writer_loader as component
import normal_runtime_source_loader as loader
import normal_runtime_source_snapshot as reader


class WriterLoaderTests(unittest.TestCase):
    def setUp(self):
        import test_normal_runtime_source_loader as fixtures
        self.fixture = fixtures.PinnedSourceLoaderTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.sources = {name + ".py": (ROOT / (name + ".py")).read_bytes()
                        for name in component.WRITER_MODULES}
        self.sources["bootstrap.py"] = b"raise RuntimeError('must not execute bootstrap')\n"
        self.configure()

    def configure(self, sources=None):
        self.fixture.configure(self.sources if sources is None else sources)

    def load(self, **changes):
        options = self.fixture.arguments()
        options.update(changes)
        return component.load_pinned_writer_candidate(**options)

    def namespace(self):
        return "_sanq_candidate_writer_" + self.fixture.materials.sha256()

    def test_actual_eight_modules_use_same_core_parser_and_private_imports(self):
        with self.load() as candidate:
            modules = candidate.modules
            self.assertEqual(set(modules), set(component.WRITER_MODULES))
            self.assertIs(type(candidate.request), modules["normal_runtime_update"].UpdateRequest)
            self.assertIs(modules["normal_runtime_inputs"].UpdateRequest,
                          modules["normal_runtime_update"].UpdateRequest)
            self.assertIs(modules["normal_runtime_history_writer"].local,
                          modules["normal_runtime_local_admission"])
            self.assertIs(modules["normal_runtime_history_writer"].history,
                          modules["normal_runtime_history_review"])
            self.assertIs(modules["normal_runtime_source_anchor"].CandidateSourceBlocked,
                          modules["normal_runtime_source_snapshot"].CandidateSourceBlocked)
            self.assertTrue(callable(modules["normal_runtime_history_writer"].consume_v2_local_attempt))
        self.assertFalse(loader._namespace_keys(self.namespace()))

    def test_canonical_cache_poison_never_used(self):
        poison = {name: ModuleType(name) for name in component.WRITER_MODULES}
        with patch.dict(sys.modules, poison):
            with self.load() as candidate:
                for name, module in candidate.modules.items():
                    self.assertIsNot(module, poison[name])
                    self.assertIs(sys.modules[name], poison[name])

    def test_loading_does_not_open_write_or_consume(self):
        with patch.object(os, "open", side_effect=AssertionError("no FS")), \
             patch.object(os, "write", side_effect=AssertionError("no write")), \
             patch.object(os, "fsync", side_effect=AssertionError("no sync")), \
             patch.object(builtins, "open", side_effect=AssertionError("no source reopen")):
            with self.load() as candidate:
                self.assertFalse(hasattr(candidate, "transactionConsumed"))

    def test_live_real_reader_scope_can_supply_nine_exact_files(self):
        with tempfile.TemporaryDirectory() as name:
            path = Path(name)
            path.chmod(0o700)
            for leaf, raw in self.sources.items():
                file = path / leaf
                file.write_bytes(raw)
                file.chmod(0o400)
            fd = os.open(path, reader.os.O_RDONLY | reader.os.O_DIRECTORY)
            try:
                with reader.capture_candidate_sources(fd, self.fixture.materials,
                    expected_launch_sha256=self.fixture.materials.sha256(),
                    expected_owner_uid=os.getuid(), expected_owner_gid=os.getgid()) as snap:
                    with self.load(snapshot=snap) as candidate:
                        self.assertEqual(len(candidate.modules), 8)
                os.fstat(fd)
            finally:
                os.close(fd)

    def test_missing_selected_dependency_rejected_before_compile(self):
        for module in component.WRITER_MODULES[3:]:
            sources = dict(self.sources)
            del sources[module + ".py"]
            self.configure(sources)
            with patch.object(loader, "_compile_modules", side_effect=AssertionError("too early")):
                with self.subTest(module=module), self.assertRaises(ValueError):
                    with self.load():
                        self.fail("missing dependency accepted")

    def test_extra_declared_project_module_rejected(self):
        self.configure({**self.sources, "extra.py": b"raise RuntimeError('extra')"})
        with self.assertRaisesRegex(ValueError, "unexpected component"):
            with self.load():
                self.fail("extra loaded")

    def test_bad_pin_or_snapshot_bytes_rejected_before_compile(self):
        with self.assertRaises(ValueError):
            with self.load(expected_request_sha256="0" * 64):
                self.fail("wrong pin")
        snap = self.fixture.snapshot
        first = replace(snap.files[0], content=b"corrupt")
        with self.assertRaises(ValueError):
            with self.load(snapshot=replace(snap, files=(first,) + snap.files[1:])):
                self.fail("wrong bytes")

    def test_all_eight_compile_before_any_execution(self):
        self.configure({**self.sources, "normal_runtime_history_writer.py": b"syntax !!!!"})
        with patch.object(loader, "exec", create=True) as execute:
            with self.assertRaises(ValueError):
                with self.load():
                    self.fail("bad syntax")
            execute.assert_not_called()

    def test_only_selected_eight_compiled_bootstrap_not_executed(self):
        with patch.object(loader, "compile", side_effect=builtins.compile, create=True) as compile_one:
            with self.load():
                pass
        self.assertEqual(compile_one.call_count, 8)
        self.assertNotIn(self.sources["bootstrap.py"], {c.args[0] for c in compile_one.call_args_list})

    def test_unselected_project_or_stdlib_import_has_no_fallback(self):
        for line in (b"\nimport socket\n", b"\nimport normal_runtime_private_prepare\n",
                     b"\nfrom . import normal_runtime_launch\n"):
            self.configure({**self.sources,
                "normal_runtime_history_writer.py": self.sources["normal_runtime_history_writer.py"] + line})
            with self.subTest(line=line), self.assertRaises(ValueError):
                with self.load():
                    self.fail("unselected import")
            self.assertFalse(loader._namespace_keys(self.namespace()))

    def test_out_of_order_import_rejected(self):
        self.configure({**self.sources,
            "normal_runtime_launch.py": self.sources["normal_runtime_launch.py"] +
            b"\nimport normal_runtime_history_writer\n"})
        with self.assertRaises(ValueError):
            with self.load():
                self.fail("out of order")

    def test_nested_writer_namespace_rejected_and_old_three_can_coexist(self):
        with self.load() as candidate:
            with self.assertRaises(ValueError):
                with self.load():
                    self.fail("namespace reused")
            with loader.load_pinned_normal_candidate(**self.fixture.arguments()) as old:
                self.assertEqual(len(old.modules), 3)
                self.assertIsNot(old.flow_type, candidate.flow_type)
            self.assertIs(type(candidate.request), candidate.modules["normal_runtime_update"].UpdateRequest)

    def test_consumer_error_cleans_registry_and_preserves_original(self):
        error = RuntimeError("consumer")
        with self.assertRaises(RuntimeError) as caught:
            with self.load():
                raise error
        self.assertIs(caught.exception, error)
        self.assertFalse(loader._namespace_keys(self.namespace()))

    def test_initialization_failure_cleans_all_owned_modules(self):
        self.configure({**self.sources,
            "normal_runtime_history_writer.py": self.sources["normal_runtime_history_writer.py"] +
            b"\nraise RuntimeError('init')\n"})
        with self.assertRaises(ValueError):
            with self.load():
                self.fail("failed init yielded")
        self.assertFalse(loader._namespace_keys(self.namespace()))

    def test_late_import_on_retained_module_rejected_after_exit(self):
        self.configure({**self.sources,
            "normal_runtime_history_writer.py": self.sources["normal_runtime_history_writer.py"] +
            b"\ndef probe():\n    return __import__('os')\n"})
        with self.load() as candidate:
            module = candidate.modules["normal_runtime_history_writer"]
            self.assertIs(module.probe(), os)
        with self.assertRaisesRegex(ValueError, "outside"):
            module.probe()

    def test_fixed_api_exposes_no_module_or_stdlib_selector(self):
        self.assertEqual(set(inspect.signature(component.load_pinned_writer_candidate).parameters),
                         {"snapshot", "launch_bytes", "request_bytes",
                          "expected_launch_sha256", "expected_request_sha256"})


if __name__ == "__main__":
    unittest.main()
