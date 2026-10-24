"""C1-PREP-06: selected real source bytes and inert fixtures; no real updates."""
from __future__ import annotations

import ast
import builtins
from dataclasses import FrozenInstanceError, replace
import json
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
    import normal_runtime_source_loader as loader
    import normal_runtime_launch as launch
    import normal_runtime_update as ordinary_core
    import normal_runtime_source_snapshot as reader
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)


class PinnedSourceLoaderTests(unittest.TestCase):
    def setUp(self):
        self.original = {
            name + ".py": (ROOT / (name + ".py")).read_bytes()
            for name in loader.SELECTED_MODULES}
        self.original["bootstrap.py"] = b"raise RuntimeError('bootstrap must not execute')\n"
        self.configure()

    def configure(self, sources=None, transaction_id="pinned-loader-001"):
        self.sources = dict(self.original if sources is None else sources)
        self.materials = launch.freeze_launch_materials(
            source_commit="c" * 40, transaction_id=transaction_id,
            bootstrap_source="bootstrap.py", sources=self.sources)
        self.request = ordinary_core.UpdateRequest(
            transaction_id, "a" * 40, "b" * 40,
            "sha256:" + "1" * 64, "sha256:" + "2" * 64,
            "d" * 40, "e" * 40, "5" * 64, self.materials)
        self.launch_raw = launch.canonical(self.materials.document())
        self.request_raw = launch.canonical(self.request.document())
        self.snapshot = reader.SourceSnapshot(
            self.materials.source_commit, self.materials.sha256(), (),
            tuple(reader.SourceBytes(name, raw, launch.digest(raw), ())
                  for name, raw in sorted(self.sources.items())))
        self.prefix = "_sanq_candidate_" + self.materials.sha256()

    def arguments(self):
        return {
            "snapshot": self.snapshot,
            "launch_bytes": self.launch_raw,
            "request_bytes": self.request_raw,
            "expected_launch_sha256": launch.digest(self.launch_raw),
            "expected_request_sha256": launch.digest(self.request_raw),
        }

    def load(self, **changes):
        options = self.arguments()
        options.update(changes)
        return loader.load_pinned_normal_candidate(**options)

    def namespace_keys(self, prefix=None):
        prefix = self.prefix if prefix is None else prefix
        return {name for name in tuple(sys.modules)
                if name == prefix or name.startswith(prefix + ".")}

    def edit_core(self, suffix):
        sources = dict(self.original)
        sources["normal_runtime_update.py"] += suffix
        self.configure(sources)

    def test_loads_real_selected_bytes_with_one_shared_set_of_v1_types(self):
        canonical_modules = {name: sys.modules[name] for name in loader.SELECTED_MODULES}
        original_path, original_finders = tuple(sys.path), tuple(sys.meta_path)
        with self.load() as candidate:
            core = candidate.modules["normal_runtime_update"]
            self.assertEqual(set(candidate.modules), set(loader.SELECTED_MODULES))
            self.assertIs(type(candidate.request), core.UpdateRequest)
            self.assertIs(type(candidate.request.launch),
                          candidate.modules["normal_runtime_launch"].LaunchMaterials)
            self.assertIs(candidate.flow_type, core.NormalUpdateFlow)
            self.assertIsNot(candidate.flow_type, ordinary_core.NormalUpdateFlow)
            self.assertIs(core.LaunchMaterials, type(candidate.request.launch))
            self.assertEqual(launch.canonical(candidate.request.document()), self.request_raw)
            self.assertEqual(len(self.namespace_keys()), 4)
            for name, module in candidate.modules.items():
                self.assertEqual(module.__name__, self.prefix + "." + name)
                self.assertIn(launch.digest(self.sources[name + ".py"]), module.__file__)
                self.assertTrue(module.__file__.startswith("<sanq-pinned:"))
                self.assertIs(sys.modules[name], canonical_modules[name])
            with self.assertRaises(TypeError):
                candidate.modules["extra"] = core
            with self.assertRaises(FrozenInstanceError):
                candidate.request = None
        self.assertFalse(self.namespace_keys())
        self.assertEqual(tuple(sys.path), original_path)
        self.assertEqual(tuple(sys.meta_path), original_finders)
        for name, module in canonical_modules.items():
            self.assertIs(sys.modules[name], module)

    def test_candidate_absolute_imports_ignore_poisoned_canonical_caches(self):
        poison = {name: ModuleType(name) for name in loader.SELECTED_MODULES}
        with patch.dict(sys.modules, poison):
            with self.load() as candidate:
                core = candidate.modules["normal_runtime_update"]
                self.assertIs(type(candidate.request), core.UpdateRequest)
                self.assertIsNot(core, poison["normal_runtime_update"])
                for name, module in poison.items():
                    self.assertIs(sys.modules[name], module)
            for name, module in poison.items():
                self.assertIs(sys.modules[name], module)

    def test_selected_loading_has_no_source_path_or_finder_fallback(self):
        class RejectCandidateFinder:
            def find_spec(self, fullname, path=None, target=None):
                if fullname.startswith(("normal_runtime_", "_sanq_candidate_")):
                    raise AssertionError("candidate import machinery was used")
                return None

        with patch.object(sys, "meta_path", [RejectCandidateFinder(), *sys.meta_path]):
            with patch.object(builtins, "open", side_effect=AssertionError("path reopened")):
                with self.load() as candidate:
                    self.assertEqual(candidate.request.transaction_id,
                                     self.materials.transaction_id)

    def test_real_reader_snapshot_can_be_consumed_while_its_fds_are_held(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            directory.chmod(0o700)
            for name, raw in self.sources.items():
                path = directory / name
                path.write_bytes(raw)
                path.chmod(0o400)
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
            try:
                with reader.capture_candidate_sources(
                    fd, self.materials, expected_launch_sha256=self.materials.sha256(),
                    expected_owner_uid=os.getuid(), expected_owner_gid=os.getgid(),
                ) as observed:
                    with self.load(snapshot=observed) as candidate:
                        self.assertEqual(candidate.request.launch.sha256(),
                                         self.materials.sha256())
                os.fstat(fd)
            finally:
                os.close(fd)

    def test_wrong_independent_pins_block_before_compilation(self):
        for field in ("expected_launch_sha256", "expected_request_sha256"):
            with self.subTest(field=field), patch.object(loader, "_compile_selected") as compile_all:
                with self.assertRaises(loader.CandidateLoadBlocked):
                    with self.load(**{field: "9" * 64}):
                        self.fail("unapproved inputs reached consumer")
                compile_all.assert_not_called()
        self.assertFalse(self.namespace_keys())

    def test_invalid_snapshot_type_and_identity_block_before_compilation(self):
        variants = (
            None, {}, replace(self.snapshot, source_commit="f" * 40),
            replace(self.snapshot, launch_sha256="9" * 64),
            replace(self.snapshot, files=list(self.snapshot.files)),
            replace(self.snapshot, files=self.snapshot.files[:-1]),
        )
        for snapshot in variants:
            with self.subTest(kind=type(snapshot).__name__):
                with patch.object(loader, "_compile_selected") as compile_all:
                    with self.assertRaises(loader.CandidateLoadBlocked):
                        with self.load(snapshot=snapshot):
                            pass
                    compile_all.assert_not_called()

    def test_duplicate_extra_missing_or_untyped_source_bytes_are_rejected(self):
        files = self.snapshot.files
        variants = (
            (files[0],) + files[:-1],
            files + (reader.SourceBytes("extra.py", b"x", launch.digest(b"x"), ()),),
            files[:-1],
            ({},) + files[1:],
        )
        for value in variants:
            with self.subTest(size=len(value)), self.assertRaises(loader.CandidateLoadBlocked):
                with self.load(snapshot=replace(self.snapshot, files=value)):
                    pass
        self.assertFalse(self.namespace_keys())

    def test_wrong_hash_size_report_or_mutable_bytes_block_before_compilation(self):
        first = self.snapshot.files[0]
        variants = (
            replace(first, content=b"x" * len(first.content)),
            replace(first, content=first.content + b"x"),
            replace(first, sha256="9" * 64),
            replace(first, content=bytearray(first.content)),
            replace(first, name=True),
        )
        for item in variants:
            with self.subTest(kind=type(item.content).__name__):
                with patch.object(loader, "_compile_selected") as compile_all:
                    snapshot = replace(self.snapshot, files=(item,) + self.snapshot.files[1:])
                    with self.assertRaises(loader.CandidateLoadBlocked):
                        with self.load(snapshot=snapshot):
                            pass
                    compile_all.assert_not_called()

    def test_inputs_source_must_be_declared_in_the_pinned_inventory(self):
        sources = dict(self.original)
        del sources["normal_runtime_inputs.py"]
        self.configure(sources)
        with patch.object(loader, "_compile_selected") as compile_all:
            with self.assertRaises(loader.CandidateLoadBlocked):
                with self.load():
                    pass
            compile_all.assert_not_called()

    def test_bootstrap_and_unused_declared_sources_are_neither_compiled_nor_executed(self):
        sources = dict(self.original)
        sources["unused_adapter.py"] = b"raise RuntimeError('unused adapter')\n"
        self.configure(sources)
        with patch.object(loader, "compile", side_effect=builtins.compile, create=True) as compile_one:
            with self.load():
                pass
        self.assertEqual(compile_one.call_count, 3)
        seen = {call.args[0] for call in compile_one.call_args_list}
        self.assertNotIn(sources["bootstrap.py"], seen)
        self.assertNotIn(sources["unused_adapter.py"], seen)
        for call in compile_one.call_args_list:
            self.assertEqual(call.kwargs, {"dont_inherit": True, "optimize": 0})
            self.assertEqual(call.args[2], "exec")

    def test_all_selected_syntax_is_compiled_before_any_selected_module_executes(self):
        sources = dict(self.original)
        sources["normal_runtime_inputs.py"] += b"\ninvalid syntax !!!\n"
        self.configure(sources)
        with patch.object(loader, "exec", create=True) as execute:
            with self.assertRaises(loader.CandidateLoadBlocked) as caught:
                with self.load():
                    self.fail("invalid syntax reached consumer")
            execute.assert_not_called()
        self.assertIsInstance(caught.exception.__cause__, SyntaxError)
        self.assertFalse(self.namespace_keys())

    def test_verified_source_map_is_fixed_before_compilation_callbacks(self):
        real_compile = loader._compile_selected

        def mutate_after_copy(fixed):
            object.__setattr__(self.snapshot, "files", ())
            return real_compile(fixed)

        with patch.object(loader, "_compile_selected", side_effect=mutate_after_copy):
            with self.load() as candidate:
                self.assertEqual(candidate.request.transaction_id,
                                 self.materials.transaction_id)

    def test_unselected_import_during_initialization_is_rejected_without_fallback(self):
        self.edit_core(b"\nimport os\n")
        original_os = sys.modules["os"]
        with self.assertRaisesRegex(loader.CandidateLoadBlocked, "unselected"):
            with self.load():
                self.fail("unselected import reached consumer")
        self.assertIs(sys.modules["os"], original_os)
        self.assertFalse(self.namespace_keys())

    def test_relative_and_out_of_order_candidate_imports_are_rejected(self):
        cases = (
            ("normal_runtime_update.py", b"\nfrom . import normal_runtime_launch\n"),
            ("normal_runtime_launch.py", b"\nimport normal_runtime_inputs\n"),
        )
        for name, suffix in cases:
            sources = dict(self.original)
            sources[name] += suffix
            self.configure(sources)
            with self.subTest(name=name), self.assertRaises(loader.CandidateLoadBlocked):
                with self.load():
                    pass
            self.assertFalse(self.namespace_keys())

    def test_dynamic_candidate_import_still_cannot_fall_back_to_unselected_modules(self):
        self.edit_core(b"\ndef unselected_probe():\n    return __import__('os')\n")
        with self.load() as candidate:
            with self.assertRaisesRegex(loader.CandidateLoadBlocked, "unselected"):
                candidate.modules["normal_runtime_update"].unselected_probe()

    def test_late_imports_on_retained_modules_are_rejected_after_context_exit(self):
        self.edit_core(b"\ndef late_probe():\n    return __import__('json')\n")
        with self.load() as candidate:
            retained = candidate.modules["normal_runtime_update"]
            self.assertIs(retained.late_probe(), json)
        with self.assertRaisesRegex(loader.CandidateLoadBlocked, "outside"):
            retained.late_probe()
        self.assertFalse(self.namespace_keys())

    def test_initialization_error_keeps_cause_and_removes_owned_modules(self):
        self.edit_core(b"\nraise RuntimeError('initialization failed')\n")
        with self.assertRaises(loader.CandidateLoadBlocked) as caught:
            with self.load():
                self.fail("failed initialization reached consumer")
        self.assertIsInstance(caught.exception.__cause__, RuntimeError)
        self.assertFalse(self.namespace_keys())

    def test_initialization_interruptions_propagate_and_remove_owned_modules(self):
        for expression, kind in (("KeyboardInterrupt()", KeyboardInterrupt),
                                 ("SystemExit(23)", SystemExit)):
            self.edit_core(("\nraise " + expression + "\n").encode())
            with self.subTest(kind=kind), self.assertRaises(kind):
                with self.load():
                    pass
            self.assertFalse(self.namespace_keys())

    def test_preexisting_private_namespace_or_child_is_preserved_and_rejected(self):
        for key in (self.prefix, self.prefix + ".unrelated"):
            foreign = ModuleType(key)
            with self.subTest(key=key), patch.dict(sys.modules, {key: foreign}):
                with self.assertRaisesRegex(loader.CandidateLoadBlocked, "occupied"):
                    with self.load():
                        pass
                self.assertIs(sys.modules[key], foreign)
        self.assertFalse(self.namespace_keys())

    def test_same_candidate_nested_load_is_rejected_without_harming_active_scope(self):
        with self.load() as first:
            core = first.modules["normal_runtime_update"]
            with self.assertRaises(loader.CandidateLoadBlocked):
                with self.load():
                    pass
            self.assertIs(sys.modules[core.__name__], core)
            self.assertIs(type(first.request), core.UpdateRequest)
        self.assertFalse(self.namespace_keys())

    def test_different_candidates_can_load_without_aliasing_their_types(self):
        first_options, first_prefix = self.arguments(), self.prefix
        self.configure(transaction_id="pinned-loader-002")
        with loader.load_pinned_normal_candidate(**first_options) as first:
            with self.load() as second:
                self.assertIsNot(first.flow_type, second.flow_type)
                self.assertIsNot(type(first.request), type(second.request))
                self.assertTrue(self.namespace_keys(first_prefix))
                self.assertTrue(self.namespace_keys())
            self.assertTrue(self.namespace_keys(first_prefix))
        self.assertFalse(self.namespace_keys(first_prefix))
        self.assertFalse(self.namespace_keys())

    def test_reloading_after_exit_creates_fresh_modules_without_a_transaction_claim(self):
        with self.load() as first:
            first_type = first.flow_type
        with self.load() as second:
            self.assertIsNot(second.flow_type, first_type)
            self.assertFalse(hasattr(second, "transactionConsumed"))
            self.assertFalse(hasattr(second, "execute"))
            self.assertFalse(hasattr(second, "authorize"))

    def test_consumer_errors_and_interruptions_keep_original_instances(self):
        for error in (RuntimeError("consumer"), OSError("consumer"),
                      KeyboardInterrupt(), SystemExit(17)):
            with self.subTest(kind=type(error).__name__):
                with self.assertRaises(type(error)) as caught:
                    with self.load():
                        raise error
                self.assertIs(caught.exception, error)
                self.assertFalse(self.namespace_keys())

    def test_registry_drift_on_normal_exit_is_detected_without_deleting_foreign_entry(self):
        for key in (self.prefix + ".normal_runtime_update", self.prefix + ".unrelated"):
            foreign = ModuleType(key)
            with self.subTest(key=key), patch.dict(sys.modules):
                with self.assertRaisesRegex(loader.CandidateLoadBlocked, "registry"):
                    with self.load():
                        sys.modules[key] = foreign
                self.assertIs(sys.modules[key], foreign)
                self.assertEqual(self.namespace_keys(), {key})
            self.assertFalse(self.namespace_keys())

    def test_consumer_error_is_not_masked_by_private_registry_drift(self):
        error = RuntimeError("original consumer")
        key = self.prefix + ".normal_runtime_update"
        foreign = ModuleType(key)
        with patch.dict(sys.modules):
            with self.assertRaises(RuntimeError) as caught:
                with self.load():
                    sys.modules[key] = foreign
                    raise error
            self.assertIs(caught.exception, error)
            self.assertIs(sys.modules[key], foreign)
        self.assertFalse(self.namespace_keys())

    def test_candidate_parser_and_core_must_return_the_same_loaded_v1_types(self):
        sources = dict(self.original)
        sources["normal_runtime_inputs.py"] = sources["normal_runtime_inputs.py"].replace(
            b"return PinnedUpdateInputs(request, launch_bytes, request_bytes)",
            b"return PinnedUpdateInputs(None, launch_bytes, request_bytes)")
        self.configure(sources)
        with self.assertRaises(loader.CandidateLoadBlocked):
            with self.load():
                self.fail("mismatched candidate request reached consumer")
        self.assertFalse(self.namespace_keys())

    def test_candidate_launch_semantics_cannot_drift_from_pinned_v1_document(self):
        sources = dict(self.original)
        sources["normal_runtime_launch.py"] = sources["normal_runtime_launch.py"].replace(
            b'"pythonVersion": "3.12.3"', b'"pythonVersion": "3.10.12"')
        self.configure(sources)
        with self.assertRaises(loader.CandidateLoadBlocked):
            with self.load():
                self.fail("changed launch semantics reached consumer")
        self.assertFalse(self.namespace_keys())

    def test_loaded_request_runs_the_existing_core_only_when_caller_supplies_capabilities(self):
        with self.load() as candidate:
            core = candidate.modules["normal_runtime_update"]
            calls = []
            methods = {method for _, method in core.STEPS}

            class InertCapabilities:
                def __getattr__(self, name):
                    if name == "record_abort":
                        return lambda ctx, raw: launch.digest(raw)
                    if name not in methods:
                        raise AttributeError(name)

                    def complete(ctx):
                        calls.append(ctx.step)
                        original = ("6" * 64 if ctx.step == "RECORD_ORIGINAL"
                                    else ctx.original_state_sha256)
                        snapshot = ("7" * 64 if ctx.step == "SNAPSHOT_READY"
                                    else ctx.snapshot_record_sha256)
                        return core.StepCompletion(
                            ctx.step, ctx.request_sha256, ctx.previous_completion_sha256,
                            "8" * 64, "5" * 64, original, snapshot)
                    return complete

            self.assertEqual(calls, [])
            report = candidate.flow_type().run(candidate.request, InertCapabilities())
            self.assertEqual(calls, [step for step, _ in core.STEPS])
            self.assertEqual(report["status"], "COMPLETED")
            self.assertEqual(report["decision"], "BLOCKED")
            self.assertIs(report["readyToInstall"], False)
            self.assertIs(report["authorizedToMutateProduction"], False)
            self.assertIs(report["adapterEvidenceIndependentlyAuthenticated"], False)

    def test_loader_does_not_supply_effect_capabilities_or_relax_core_admission(self):
        with self.load() as candidate:
            core = candidate.modules["normal_runtime_update"]
            with self.assertRaises(core.NormalUpdateBlocked):
                candidate.flow_type().run(candidate.request, object())
            for key in ("sourceProvenanceAuthenticated",
                        "dynamicDependencyClosureVerified", "launchAuthorized"):
                self.assertIs(candidate.request.launch.document()[key], False)

    def test_module_boundary_has_no_filesystem_network_cli_or_flow_run(self):
        source = (ROOT / "normal_runtime_source_loader.py").read_text()
        tree = ast.parse(source)
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(item.name for item in node.names)
            if isinstance(node, ast.ImportFrom):
                imports.add(node.module)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                self.assertNotIn(node.func.id, {"open", "eval", "__import__"})
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                self.assertNotIn(node.func.attr, {"run", "write", "write_bytes", "write_text"})
        self.assertLessEqual(imports, {
            "__future__", "builtins", "contextlib", "dataclasses", "hashlib",
            "json", "re", "sys", "threading", "types", "typing",
            "normal_runtime_inputs", "normal_runtime_launch",
            "normal_runtime_source_snapshot",
        })
        self.assertEqual(loader.SELECTED_MODULES, (
            "normal_runtime_launch", "normal_runtime_update", "normal_runtime_inputs"))
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/normal_runtime_source_loader.py", SOURCE_FILES)
        self.assertNotIn("__main__", source)


if __name__ == "__main__":
    unittest.main()
