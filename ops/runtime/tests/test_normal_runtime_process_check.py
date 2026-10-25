"""C1-PREP-08 process-view fixtures, not actual root/platform authentication."""
from __future__ import annotations

import ast
from collections import namedtuple
from contextlib import ExitStack
import copy
from dataclasses import replace
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import normal_runtime_launch as launch
    import normal_runtime_process_check as process_check
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)


class LaunchProcessCheckTests(unittest.TestCase):
    def setUp(self):
        self.materials = launch.freeze_launch_materials(
            source_commit="c" * 40, transaction_id="process-check-001",
            bootstrap_source="bootstrap.py",
            sources={"bootstrap.py": b"raise RuntimeError('do not execute')\n",
                     "normal_runtime_launch.py": b"proposal_marker = 1\n",
                     "normal_runtime_update.py": b"core_marker = 2\n"})
        self.observed = {
            "os": "linux", "architecture": "x86_64", "pythonVersion": "3.12.3",
            "releaseLevel": "final", "releaseSerial": 0,
            "executable": "/usr/bin/python3.12",
            "realUid": 0, "effectiveUid": 0, "realGid": 0, "effectiveGid": 0,
            "cwd": "/root/sanq-runtime-operator/normal-update-v1",
            "argv": ("/root/sanq-runtime-operator/normal-update-v1/bootstrap.py",
                     "--transaction-id", "process-check-001"),
            "originalArgv": ("/usr/bin/python3.12", "-I", "-S", "-B",
                             "/root/sanq-runtime-operator/normal-update-v1/bootstrap.py",
                             "--transaction-id", "process-check-001"),
            "environment": {"HOME": "/root", "LANG": "C", "LC_ALL": "C",
                            "PATH": "/usr/bin:/bin", "TZ": "UTC"},
            "flags": {"isolated": 1, "ignore_environment": 1, "no_site": 1,
                      "no_user_site": 1, "dont_write_bytecode": 1,
                      "safe_path": True, "optimize": 0},
        }
        self.real_observer = process_check._observe_current_process
        self.patcher = patch.object(
            process_check, "_observe_current_process",
            side_effect=lambda: copy.deepcopy(self.observed))
        self.observe_mock = self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def require(self, **changes):
        options = {"expected_launch_sha256": self.materials.sha256()}
        options.update(changes)
        materials = options.pop("materials", self.materials)
        return process_check.require_current_launch_process(materials, **options)

    def test_matching_process_returns_no_permit_or_observation(self):
        self.assertIsNone(self.require())
        self.observe_mock.assert_called_once_with()
        for key in ("sourceProvenanceAuthenticated",
                    "dynamicDependencyClosureVerified", "launchAuthorized"):
            self.assertIs(self.materials.document()[key], False)

    def test_wrong_or_invalid_pin_rejects_before_process_observation(self):
        for pin in ("9" * 64, "0" * 64, "", None, True, "A" * 64):
            with self.subTest(pin=pin), self.assertRaises(process_check.LaunchProcessBlocked):
                self.require(expected_launch_sha256=pin)
        self.observe_mock.assert_not_called()

    def test_invalid_materials_reject_before_process_observation(self):
        for materials in (None, {}, replace(self.materials, sources=())):
            with self.subTest(kind=type(materials).__name__):
                with self.assertRaises(process_check.LaunchProcessBlocked):
                    self.require(materials=materials)
        self.observe_mock.assert_not_called()

    def test_os_architecture_version_and_release_must_match_the_existing_v1(self):
        for field, value in (("os", "darwin"), ("architecture", "aarch64"),
                             ("pythonVersion", "3.10.12"), ("pythonVersion", "3.12.4"),
                             ("releaseLevel", "candidate"), ("releaseSerial", 1)):
            original = self.observed[field]
            self.observed[field] = value
            with self.subTest(field=field, value=value):
                with self.assertRaisesRegex(process_check.LaunchProcessBlocked, field):
                    self.require()
            self.observed[field] = original

    def test_interpreter_path_alias_or_missing_value_is_rejected(self):
        for value in ("/usr/bin/python3", "/tmp/python3.12", "", None):
            self.observed["executable"] = value
            with self.subTest(value=value), self.assertRaisesRegex(
                    process_check.LaunchProcessBlocked, "executable"):
                self.require()

    def test_real_and_effective_uid_gid_are_checked_independently(self):
        for field in ("realUid", "effectiveUid", "realGid", "effectiveGid"):
            for value in (1000, None, False):
                self.observed[field] = value
                with self.subTest(field=field, value=value):
                    with self.assertRaisesRegex(process_check.LaunchProcessBlocked, field):
                        self.require()
            self.observed[field] = 0

    def test_wrong_or_unavailable_cwd_is_rejected_without_repair(self):
        for value in ("/tmp", "", None):
            self.observed["cwd"] = value
            with self.subTest(value=value), self.assertRaisesRegex(
                    process_check.LaunchProcessBlocked, "cwd"):
                self.require()

    def test_original_interpreter_argv_is_exact_not_just_the_script_suffix(self):
        correct = self.observed["originalArgv"]
        variants = (
            correct[1:], correct[:1] + correct[2:], correct + ("--extra",),
            ("/usr/bin/python3",) + correct[1:],
            correct[:2] + ("-B", "-S") + correct[4:],
        )
        for value in variants:
            self.observed["originalArgv"] = value
            with self.subTest(size=len(value)), self.assertRaisesRegex(
                    process_check.LaunchProcessBlocked, "originalArgv"):
                self.require()

    def test_script_argv_checks_bootstrap_transaction_and_extra_arguments(self):
        for value in (("another.py", "--transaction-id", "process-check-001"),
                      ("bootstrap.py",), self.observed["argv"] + ("--extra",),
                      (self.observed["argv"][0], "--transaction-id", "another-process-001")):
            self.observed["argv"] = value
            with self.subTest(value=value), self.assertRaisesRegex(
                    process_check.LaunchProcessBlocked, "argv"):
                self.require()

    def test_environment_is_exact_and_errors_do_not_echo_values(self):
        correct = dict(self.observed["environment"])
        variants = (
            {**correct, "PYTHONPATH": "DO_NOT_ECHO_SECRET"},
            {key: value for key, value in correct.items() if key != "TZ"},
            {**correct, "HOME": "/tmp/DO_NOT_ECHO_SECRET"},
        )
        for value in variants:
            self.observed["environment"] = value
            with self.subTest(keys=tuple(value)):
                with self.assertRaisesRegex(process_check.LaunchProcessBlocked, "environment") as caught:
                    self.require()
                self.assertNotIn("DO_NOT_ECHO_SECRET", str(caught.exception))
                self.assertIsNone(caught.exception.__cause__)

    def test_required_isolation_site_bytecode_and_optimization_flags_are_checked(self):
        correct = dict(self.observed["flags"])
        for field in correct:
            self.observed["flags"] = dict(correct)
            self.observed["flags"][field] = 1 if field == "optimize" else 0
            with self.subTest(field=field), self.assertRaisesRegex(
                    process_check.LaunchProcessBlocked, "flags"):
                self.require()
        for value in ({}, {**correct, "unknown": 1}):
            self.observed["flags"] = value
            with self.assertRaisesRegex(process_check.LaunchProcessBlocked, "flags"):
                self.require()

    def test_serialization_does_not_confuse_boolean_and_integer_flag_values(self):
        for field, value in (("isolated", True), ("safe_path", 1)):
            correct = dict(self.observed["flags"])
            self.observed["flags"][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(
                    process_check.LaunchProcessBlocked, "flags"):
                self.require()
            self.observed["flags"] = correct

    def test_incomplete_or_untyped_observer_result_is_controlled(self):
        for value in (None, [], {}, {**self.observed, "extra": True}):
            self.observe_mock.side_effect = None
            self.observe_mock.return_value = value
            with self.subTest(kind=type(value).__name__):
                with self.assertRaises(process_check.LaunchProcessBlocked):
                    self.require()

    def test_os_and_missing_api_errors_keep_cause_without_logging_views(self):
        for error in (OSError("observation unavailable"), AttributeError("missing API")):
            self.observe_mock.side_effect = error
            with self.subTest(kind=type(error).__name__):
                with self.assertRaises(process_check.LaunchProcessBlocked) as caught:
                    self.require()
                self.assertIs(caught.exception.__cause__, error)

    def test_observation_interruptions_keep_original_exception_instances(self):
        for error in (KeyboardInterrupt(), SystemExit(23)):
            self.observe_mock.side_effect = error
            with self.subTest(kind=type(error).__name__):
                with self.assertRaises(type(error)) as caught:
                    self.require()
                self.assertIs(caught.exception, error)

    def test_private_observer_reads_current_interfaces_without_mutating_them(self):
        Version = namedtuple("Version", "major minor micro releaselevel serial")
        with ExitStack() as patches:
            values = {
                "platform": "linux", "executable": "/usr/bin/python3.12",
                "version_info": Version(3, 12, 3, "final", 0),
                "argv": list(self.observed["argv"]),
                "orig_argv": list(self.observed["originalArgv"]),
                "flags": SimpleNamespace(**self.observed["flags"]),
            }
            for field, value in values.items():
                patches.enter_context(patch.object(process_check.sys, field, value))
            for name in ("getuid", "geteuid", "getgid", "getegid"):
                patches.enter_context(patch.object(process_check.os, name, return_value=0))
            patches.enter_context(patch.object(
                process_check.os, "getcwd", return_value=self.observed["cwd"]))
            patches.enter_context(patch.object(
                process_check.os, "uname", return_value=SimpleNamespace(machine="x86_64")))
            environment = dict(self.observed["environment"])
            patches.enter_context(patch.object(process_check.os, "environ", environment))
            self.assertEqual(self.real_observer(), self.observed)
            self.assertEqual(environment, self.observed["environment"])

    def test_actual_ci_unittest_invocation_is_rejected_and_not_sanitized(self):
        argv_before, environment_before, cwd_before = tuple(sys.argv), dict(os.environ), os.getcwd()
        self.observe_mock.side_effect = self.real_observer
        with self.assertRaises(process_check.LaunchProcessBlocked):
            self.require()
        self.assertTrue(tuple(sys.argv) == argv_before, "argv changed")
        self.assertTrue(dict(os.environ) == environment_before, "environment changed")
        self.assertTrue(os.getcwd() == cwd_before, "cwd changed")

    def test_module_has_no_source_io_launcher_mutation_or_approval_output(self):
        source = (ROOT / "normal_runtime_process_check.py").read_text()
        tree = ast.parse(source)
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(item.name for item in node.names)
            if isinstance(node, ast.ImportFrom):
                imports.add(node.module)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                self.assertNotIn(node.func.id, {"open", "exec", "eval", "compile", "__import__", "print"})
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if isinstance(node.func.value, ast.Name) and node.func.value.id == "os":
                    self.assertIn(node.func.attr, {
                        "uname", "getuid", "geteuid", "getgid", "getegid", "getcwd"})
        self.assertLessEqual(imports, {"__future__", "os", "sys", "normal_runtime_launch"})
        self.assertNotIn("__main__", source)
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/normal_runtime_process_check.py", SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
