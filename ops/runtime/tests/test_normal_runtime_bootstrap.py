"""C1-PREP-09: real fixed-byte assembly in an explicitly simulated root/process.

Never installs or invokes a production bootstrap, update flow or real effects.
"""
from __future__ import annotations

import ast
from contextlib import contextmanager, ExitStack, redirect_stderr, redirect_stdout
import gc
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import normal_runtime_bootstrap as bootstrap
    import normal_runtime_launch as launch
    import normal_runtime_update as ordinary_core
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)


class NormalRuntimeBootstrapTests(unittest.TestCase):
    def setUp(self):
        gc.collect()
        self.inherited = os.open(os.devnull, os.O_RDONLY | os.O_CLOEXEC)
        self.addCleanup(os.close, self.inherited)
        self.inherited_identity = os.fstat(self.inherited)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.operator = self.root / "root" / "sanq-runtime-operator"
        self.sources_path = self.operator / "normal-update-v1"
        self.approval_root = self.operator / "normal-update-approvals"
        self.transaction_id = "bootstrap-candidate-001"
        self.approval_path = self.approval_root / self.transaction_id
        for path in (self.operator.parent, self.operator, self.sources_path,
                     self.approval_root, self.approval_path):
            path.mkdir(mode=0o700)
        self.sources = {name: (ROOT / name).read_bytes() for name in bootstrap.SOURCE_NAMES}
        self.configure()
        self.events, self.roots = [], []
        self.before_assembly = self.before_publication = None
        self.real_observer = bootstrap._observe_process
        self.real_support = bootstrap._load_support
        self.real_capture = bootstrap._capture_private_tree
        self.patchers = (
            patch.object(bootstrap, "_observe_process", side_effect=self.process_fixture),
            patch.object(bootstrap, "_open_namespace_root", side_effect=self.open_root),
            # Explicit fixture ownership bridge; public API continues to require root.
            patch.object(bootstrap, "_owners", side_effect=lambda info:
                         info.st_uid == os.getuid() and info.st_gid == os.getgid()),
            patch.object(bootstrap, "_load_support", side_effect=self.support_fixture),
            patch.object(bootstrap, "_capture_private_tree", side_effect=self.capture_fixture),
        )
        self.mocks = []
        for patcher in self.patchers:
            self.addCleanup(patcher.stop)
            self.mocks.append(patcher.start())

    def write(self, path, raw):
        if path.exists():
            path.chmod(0o600)
        path.write_bytes(raw)
        path.chmod(0o400)

    def configure(self):
        for name, raw in self.sources.items():
            self.write(self.sources_path / name, raw)
        self.materials = launch.freeze_launch_materials(
            source_commit="c" * 40, transaction_id=self.transaction_id,
            bootstrap_source=bootstrap.BOOTSTRAP_SOURCE, sources=self.sources)
        self.request = ordinary_core.UpdateRequest(
            self.transaction_id, "a" * 40, "b" * 40,
            "sha256:" + "1" * 64, "sha256:" + "2" * 64,
            "d" * 40, "e" * 40, "5" * 64, self.materials)
        self.launch_document = self.materials.document()
        self.request_document = self.request.document()
        self.write_inputs()

    def write_inputs(self):
        self.launch_raw = launch.canonical(self.launch_document)
        self.request_raw = launch.canonical(self.request_document)
        self.pins = {
            "schema": "sanq.runtime.normal-update-bootstrap-pins.v1",
            "transactionId": self.transaction_id,
            "launchSha256": launch.digest(self.launch_raw),
            "requestSha256": launch.digest(self.request_raw),
        }
        self.write(self.approval_path / "launch.json", self.launch_raw)
        self.write(self.approval_path / "request.json", self.request_raw)
        self.write(self.approval_path / "pins.json", launch.canonical(self.pins))
        self.prefix = "_sanq_bootstrap_" + self.pins["launchSha256"]
        self.core_prefix = "_sanq_candidate_" + self.pins["launchSha256"]

    def process_fixture(self):
        document = self.materials.document()
        return {
            "platform": "linux", "machine": "x86_64", "version": (3, 12, 3, "final", 0),
            "executable": "/usr/bin/python3.12", "ids": (0, 0, 0, 0),
            "argv": tuple(document["argv"][4:]), "originalArgv": tuple(document["argv"]),
            "environment": document["environment"], "cwd": document["cwd"],
            "flags": {"isolated": 1, "ignore_environment": 1, "no_site": 1,
                      "no_user_site": 1, "dont_write_bytecode": 1,
                      "safe_path": True, "optimize": 0},
        }

    def core_process_fixture(self):
        view = self.process_fixture()
        return {
            "os": view["platform"], "architecture": view["machine"],
            "pythonVersion": "3.12.3", "releaseLevel": "final", "releaseSerial": 0,
            "executable": view["executable"], "realUid": 0, "effectiveUid": 0,
            "realGid": 0, "effectiveGid": 0, "cwd": view["cwd"],
            "argv": view["argv"], "originalArgv": view["originalArgv"],
            "environment": view["environment"], "flags": view["flags"],
        }

    def open_root(self):
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        self.roots.append(fd)
        return fd

    @contextmanager
    def capture_fixture(self, path, limits):
        kind = "source" if path == bootstrap.SOURCE_ROOT else "input"
        with self.real_capture(path, limits) as fixed:
            self.events.append(kind + "_open")
            yield fixed
        self.events.append(kind + "_closed")

    @contextmanager
    def support_fixture(self, fixed, pin):
        with self.real_support(fixed, pin) as modules, ExitStack() as patches:
            process = modules["normal_runtime_process_check"]
            anchor = modules["normal_runtime_source_anchor"]
            scope = modules["normal_runtime_candidate_scope"]
            real_source_capture = scope.capture_anchored_candidate_sources
            real_assembly = scope.assemble_pinned_normal_candidate

            @contextmanager
            def source_fixture(materials, **options):
                self.assertEqual((options["expected_owner_uid"], options["expected_owner_gid"]), (0, 0))
                options.update(expected_owner_uid=os.getuid(), expected_owner_gid=os.getgid())
                with real_source_capture(materials, **options) as captured:
                    yield captured

            @contextmanager
            def assembly_fixture(*args, **options):
                with real_assembly(*args, **options) as candidate:
                    if self.before_publication:
                        self.before_publication()
                    yield candidate

            patches.enter_context(patch.object(process, "_observe_current_process",
                                                side_effect=self.core_process_fixture))
            patches.enter_context(patch.object(anchor, "_open_namespace_root", side_effect=self.open_root))
            patches.enter_context(patch.object(scope, "capture_anchored_candidate_sources",
                                                side_effect=source_fixture))
            patches.enter_context(patch.object(scope, "assemble_pinned_normal_candidate",
                                                side_effect=assembly_fixture))
            self.events.append("support_ready")
            if self.before_assembly:
                self.before_assembly()
            yield modules
        self.events.append("support_closed")

    def assemble(self, transaction_id=None):
        return bootstrap.assemble_approved_normal_candidate(
            self.transaction_id if transaction_id is None else transaction_id)

    def fds(self):
        return set(os.listdir("/proc/self/fd"))

    def assert_closed(self, before):
        self.assertEqual(self.fds(), before)
        observed = os.fstat(self.inherited)
        self.assertEqual((observed.st_dev, observed.st_ino, observed.st_mode),
                         (self.inherited_identity.st_dev, self.inherited_identity.st_ino,
                          self.inherited_identity.st_mode))
        for fd in self.roots:
            with self.assertRaises(OSError):
                os.fstat(fd)
        for prefix in (self.prefix, self.core_prefix):
            self.assertFalse(bootstrap._namespace_keys(prefix))

    def assert_rejected(self):
        entered = False
        with self.assertRaises((bootstrap.BootstrapBlocked, OSError, ValueError)):
            with self.assemble():
                entered = True
        self.assertFalse(entered)

    def test_real_components_assemble_same_core_after_input_and_source_fds_close(self):
        before = self.fds()
        with self.assemble() as candidate:
            self.assertEqual(self.events, ["input_open", "source_open", "support_ready",
                                          "source_closed", "input_closed"])
            self.assertEqual(self.fds(), before)
            self.assertEqual(len(bootstrap._namespace_keys(self.prefix)), 9)
            self.assertEqual(len(bootstrap._namespace_keys(self.core_prefix)), 4)
            self.assertIs(type(candidate.loaded.request),
                          candidate.loaded.modules["normal_runtime_update"].UpdateRequest)
            self.assertIsNot(candidate.loaded.flow_type, ordinary_core.NormalUpdateFlow)
            self.assertEqual(launch.canonical(candidate.loaded.request.document()), self.request_raw)
            self.assertIs(candidate.loaded.request.launch.document()["launchAuthorized"], False)
        self.assertEqual(self.events[-1], "support_closed")
        self.assert_closed(before)

    def test_version_architecture_identity_environment_and_flags_reject_before_io(self):
        variants = (("version", (3, 10, 12, "final", 0)), ("version", (3, 12, 4, "final", 0)),
                    ("machine", "aarch64"), ("ids", (1000, 0, 0, 0)),
                    ("cwd", "/tmp"), ("executable", "/usr/bin/python3"),
                    ("environment", {"SECRET": "DO_NOT_ECHO"}), ("flags", {}))
        for field, value in variants:
            view = self.process_fixture()
            view[field] = value
            self.mocks[0].side_effect = lambda view=view: view
            with self.subTest(field=field):
                self.assert_rejected()
        self.mocks[4].assert_not_called()

    def test_actual_ci_process_is_rejected_without_repair_or_filesystem_capture(self):
        before = (tuple(sys.argv), dict(os.environ), os.getcwd())
        self.mocks[0].side_effect = self.real_observer
        self.assert_rejected()
        self.assertEqual((tuple(sys.argv), dict(os.environ), os.getcwd()), before)
        self.mocks[4].assert_not_called()

    def test_invalid_transaction_cannot_select_another_path(self):
        for value in ("../bootstrap-001", "/root/foo", "short", True, "A" * 12, "x" * 81):
            with self.subTest(kind=type(value).__name__), self.assertRaises(bootstrap.BootstrapBlocked):
                with self.assemble(value):
                    self.fail("invalid transaction entered")
        self.mocks[0].assert_not_called()
        self.mocks[4].assert_not_called()

    def test_bad_pins_wrong_transaction_and_extra_fields_prevent_source_loading(self):
        for key, value in (("launchSha256", "9" * 64), ("requestSha256", "0" * 64),
                           ("transactionId", "different-transaction"), ("extra", True)):
            pins = {**self.pins, key: value}
            self.write(self.approval_path / "pins.json", launch.canonical(pins))
            with self.subTest(key=key):
                self.assert_rejected()
        self.mocks[3].assert_not_called()

    def test_duplicate_noncanonical_and_nonobject_approval_inputs_reject(self):
        for raw in (b'{"schema":1,"schema":2}', b"[]", b"{}\n", b'{"x":NaN}', b"\xff"):
            self.write(self.approval_path / "pins.json", raw)
            with self.subTest(raw=repr(raw)):
                self.assert_rejected()
        self.mocks[3].assert_not_called()

    def test_approval_file_tamper_does_not_repin_itself(self):
        self.write(self.approval_path / "request.json", self.request_raw + b" ")
        self.assert_rejected()
        self.mocks[3].assert_not_called()

    def test_source_inventory_platform_and_subprocess_expansion_reject(self):
        original = self.materials.document()
        for key, value in (("platform", {"os": "linux", "architecture": "x86_64", "pythonVersion": "3.10.12"}),
                           ("sourceRoot", "/tmp/other"), ("bootstrapSource", "other.py"),
                           ("subprocessArgvs", [["/usr/bin/true"]]),
                           ("sourceFiles", {**original["sourceFiles"], "extra.py": {"sha256": "a" * 64, "bytes": 1}})):
            self.launch_document = {**original, key: value}
            self.write_inputs()
            with self.subTest(key=key):
                self.assert_rejected()
        self.mocks[3].assert_not_called()

    def test_wrong_source_bytes_prevent_even_support_initialization(self):
        name = "normal_runtime_launch.py"
        for raw in (b"#" + self.sources[name][1:],
                    self.sources[name] + b"\nraise RuntimeError('UNPINNED')\n"):
            self.write(self.sources_path / name, raw)
            self.assert_rejected()
        self.mocks[3].assert_not_called()

    def test_missing_or_unknown_files_reject_in_both_protected_directories(self):
        for path in (self.approval_path / "unknown", self.sources_path / "unknown.py"):
            self.write(path, b"unexpected\n")
            self.assert_rejected()
            path.unlink()
        for path in (self.approval_path / "request.json", self.sources_path / bootstrap.BOOTSTRAP_SOURCE):
            raw = path.read_bytes()
            path.unlink()
            self.assert_rejected()
            self.write(path, raw)

    def test_writable_ancestor_and_nonprivate_leaf_reject(self):
        for path, mode in ((self.operator, 0o722), (self.sources_path, 0o755),
                           (self.approval_path, 0o755)):
            path.chmod(mode)
            self.assert_rejected()
            path.chmod(0o700)

    def test_wrong_file_mode_hardlink_and_symlink_reject(self):
        path = self.approval_path / "request.json"
        path.chmod(0o644)
        self.assert_rejected()
        path.chmod(0o400)
        alias = self.operator / "request-alias"
        os.link(path, alias)
        self.assert_rejected()
        alias.unlink()
        path.unlink()
        path.symlink_to(self.operator / "request-alias")
        self.assert_rejected()

    def test_symlinked_ancestor_and_fifo_do_not_follow_or_block(self):
        relocated = self.operator / "moved-approvals"
        self.approval_root.rename(relocated)
        self.approval_root.symlink_to(relocated, target_is_directory=True)
        self.assert_rejected()
        self.approval_root.unlink()
        relocated.rename(self.approval_root)
        path = self.approval_path / "request.json"
        path.unlink()
        os.mkfifo(path, 0o600)
        self.assert_rejected()

    def test_wrong_owner_cross_device_and_size_are_rejected_by_metadata_gate(self):
        info = os.stat(self.approval_path / "request.json")
        values = {key: getattr(info, key) for key in (
            "st_dev", "st_ino", "st_mode", "st_uid", "st_gid", "st_size", "st_nlink",
            "st_mtime_ns", "st_ctime_ns")}
        for key, value in (("st_uid", os.getuid() + 1), ("st_gid", os.getgid() + 1),
                           ("st_dev", info.st_dev + 1), ("st_size", 0),
                           ("st_size", 4097), ("st_mode", stat.S_IFSOCK | 0o600)):
            with self.subTest(key=key), self.assertRaises(bootstrap.BootstrapBlocked):
                bootstrap._file_key(SimpleNamespace(**{**values, key: value}), info.st_dev, 4096)

    def test_oversized_approval_is_rejected_before_decode_or_support_load(self):
        self.write(self.approval_path / "pins.json", b"x" * 1025)
        self.assert_rejected()
        self.mocks[3].assert_not_called()

    def test_changed_input_inode_is_rejected_before_caller_entry(self):
        before = self.fds()
        def replace_input():
            path = self.approval_path / "request.json"
            path.unlink()
            self.write(path, self.request_raw)
        self.before_publication = replace_input
        self.assert_rejected()
        self.assert_closed(before)

    def test_short_read_growth_and_read_errors_stop_before_support_loading(self):
        before = self.fds()
        real_read = os.pread
        def growth(fd, size, offset):
            if size == 1 and offset == os.fstat(fd).st_size:
                return b"x"
            return real_read(fd, size, offset)
        for replacement in (lambda *args: b"", growth,
                            OSError("DO_NOT_ECHO_READ_ERROR")):
            with self.subTest(kind=type(replacement).__name__):
                with patch.object(bootstrap.os, "pread", side_effect=replacement):
                    self.assert_rejected()
                self.assert_closed(before)
        self.mocks[3].assert_not_called()

    def test_input_metadata_drift_is_rejected_even_if_new_mode_would_be_allowed(self):
        self.before_publication = lambda: (self.approval_path / "pins.json").chmod(0o600)
        self.assert_rejected()

    def test_changed_approval_ancestor_is_rejected_even_with_identical_leaf_bytes(self):
        before = self.fds()
        def replace_parent():
            saved = self.operator / "previous-approvals"
            self.approval_root.rename(saved)
            self.approval_root.mkdir(mode=0o700)
            (saved / self.transaction_id).rename(self.approval_path)
        self.before_publication = replace_parent
        self.assert_rejected()
        self.assert_closed(before)

    def test_unrelated_parent_entry_change_does_not_invalidate_pinned_edges(self):
        self.before_publication = lambda: (self.operator / "unrelated-note").write_bytes(b"unrelated")
        with self.assemble() as candidate:
            self.assertEqual(candidate.loaded.request.transaction_id, self.transaction_id)

    def test_recomputed_pins_do_not_bypass_the_existing_v1_transaction_parser(self):
        self.request_document["transactionId"] = "different-transaction"
        self.write_inputs()
        self.assert_rejected()

    def test_canonical_module_cache_is_not_used_for_bootstrap_or_loaded_core(self):
        poisoned = ModuleType("normal_runtime_launch")
        with patch.dict(sys.modules, {"normal_runtime_launch": poisoned}):
            with self.assemble() as candidate:
                self.assertIsNot(candidate.loaded.modules["normal_runtime_launch"], poisoned)
            self.assertIs(sys.modules["normal_runtime_launch"], poisoned)

    def test_support_compilation_finishes_before_any_project_module_initialization(self):
        self.sources["normal_runtime_candidate_scope.py"] = b"invalid syntax !!!\n"
        self.configure()
        before = self.fds()
        with patch.object(bootstrap, "exec", wraps=exec, create=True) as execute:
            self.assert_rejected()
            execute.assert_not_called()
        self.assert_closed(before)

    def test_unselected_or_relative_support_import_is_rejected_and_scopes_cleaned(self):
        original = self.sources["normal_runtime_candidate_scope.py"]
        for suffix in (b"\nimport socket\n", b"\nfrom . import unselected\n"):
            self.sources["normal_runtime_candidate_scope.py"] = original + suffix
            self.configure()
            before = self.fds()
            self.assert_rejected()
            self.assert_closed(before)

    def test_initialization_failure_cleans_fds_and_both_private_namespaces(self):
        self.sources["normal_runtime_candidate_scope.py"] += b"\nraise RuntimeError('DO_NOT_ECHO_SECRET')\n"
        self.configure()
        before = self.fds()
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            self.assertEqual(bootstrap.main(["--transaction-id", self.transaction_id]), 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn("DO_NOT_ECHO_SECRET", stderr.getvalue())
        self.assertEqual(json.loads(stderr.getvalue())["failureType"], "RuntimeError")
        self.assert_closed(before)

    def test_existing_support_namespace_is_preserved_and_not_overwritten(self):
        foreign = ModuleType(self.prefix)
        with patch.dict(sys.modules, {self.prefix: foreign}):
            self.assert_rejected()
            self.assertIs(sys.modules[self.prefix], foreign)

    def test_registry_exit_failure_prevents_success_output_and_preserves_foreign_entry(self):
        key = self.prefix + ".normal_runtime_inputs"
        foreign = ModuleType(key)
        self.before_publication = lambda: sys.modules.__setitem__(key, foreign)
        before = self.fds()
        stdout, stderr = io.StringIO(), io.StringIO()
        try:
            with redirect_stdout(stdout), redirect_stderr(stderr):
                self.assertEqual(bootstrap.main(["--transaction-id", self.transaction_id]), 2)
            self.assertEqual(stdout.getvalue(), "")
            self.assertEqual(json.loads(stderr.getvalue())["status"], "BLOCKED")
            self.assertIs(sys.modules.get(key), foreign)
        finally:
            if sys.modules.get(key) is foreign:
                del sys.modules[key]
        self.assert_closed(before)

    def test_caller_exception_and_interruptions_preserve_identity_and_close_resources(self):
        for error in (RuntimeError("caller"), KeyboardInterrupt(), SystemExit(17)):
            before = self.fds()
            with self.subTest(kind=type(error).__name__), self.assertRaises(type(error)) as caught:
                with self.assemble():
                    raise error
            self.assertIs(caught.exception, error)
            self.assert_closed(before)

    def test_prepublication_cleanup_failure_cannot_emit_success(self):
        before = self.fds()
        real_close = os.close
        failed = []
        def close_once(fd):
            real_close(fd)
            if self.roots and fd == self.roots[0] and not failed:
                failed.append(fd)
                raise OSError("simulated close failure after closure")
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(bootstrap.os, "close", side_effect=close_once), redirect_stdout(stdout), redirect_stderr(stderr):
            self.assertEqual(bootstrap.main(["--transaction-id", self.transaction_id]), 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(json.loads(stderr.getvalue())["status"], "BLOCKED")
        self.assert_closed(before)

    def test_cli_success_is_assembly_only_and_does_not_create_files_or_invoke_flow(self):
        before = sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*"))
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            self.assertEqual(bootstrap.main(["--transaction-id", self.transaction_id]), 0)
        report = json.loads(stdout.getvalue())
        self.assertEqual((report["status"], report["mode"], report["decision"]),
                         ("CANDIDATE_ASSEMBLED", "ASSEMBLY_ONLY", "BLOCKED"))
        for key in ("flowInvoked", "sourceProvenanceAuthenticated", "launchAuthorized",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(report[key], False)
        self.assertEqual(stderr.getvalue(), "")
        self.assertEqual(sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*")), before)

    def test_cli_has_no_extra_path_pin_or_execute_arguments(self):
        for argv in ([], ["--help"], ["--transaction-id", self.transaction_id, "--execute"],
                     ["--source-root", "/tmp"], ["--launch-sha256", "a" * 64]):
            with self.subTest(argv=argv), redirect_stdout(io.StringIO()) as stdout, redirect_stderr(io.StringIO()):
                self.assertEqual(bootstrap.main(argv), 2)
                self.assertEqual(stdout.getvalue(), "")
        self.mocks[4].assert_not_called()

    def test_production_surface_has_no_project_import_path_mutation_effect_or_bundle_expansion(self):
        tree = ast.parse((ROOT / "normal_runtime_bootstrap.py").read_text())
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(item.name for item in node.names)
            if isinstance(node, ast.ImportFrom):
                imports.add(node.module)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                self.assertNotIn(node.func.attr, {"run", "chdir", "chmod", "mkdir", "unlink",
                                                "write", "setuid", "setgid", "system", "execve"})
        self.assertLessEqual(imports, set(bootstrap._STDLIB))
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/normal_runtime_bootstrap.py", SOURCE_FILES)
        self.assertEqual(bootstrap.SOURCE_ROOT, launch.SOURCE_ROOT)
        self.assertEqual(self.process_fixture()["originalArgv"], tuple(self.materials.document()["argv"]))


if __name__ == "__main__":
    unittest.main()
