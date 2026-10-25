"""C1-PREP-05 input bytes only; no filesystem, source execution or real effects."""
from __future__ import annotations

import ast
from dataclasses import FrozenInstanceError, replace
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import normal_runtime_inputs as inputs
    import normal_runtime_launch as launch
    import normal_runtime_update as flow
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)


class PinnedUpdateInputsTests(unittest.TestCase):
    def setUp(self):
        self.materials = launch.freeze_launch_materials(
            source_commit="c" * 40, transaction_id="pinned-inputs-001",
            bootstrap_source="bootstrap.py",
            sources={
                "bootstrap.py": b"raise RuntimeError('never execute')\n",
                "normal_runtime_launch.py": b"proposal_marker = 1\n",
                "normal_runtime_update.py": b"core_marker = 2\n",
            })
        self.request = flow.UpdateRequest(
            self.materials.transaction_id, "a" * 40, "b" * 40,
            "sha256:" + "1" * 64, "sha256:" + "2" * 64,
            "d" * 40, "e" * 40, "5" * 64, self.materials)
        self.launch_raw = launch.canonical(self.materials.document())
        self.request_raw = launch.canonical(self.request.document())

    def parse(self, **changes):
        options = {
            "launch_bytes": self.launch_raw,
            "request_bytes": self.request_raw,
            "expected_launch_sha256": launch.digest(self.launch_raw),
            "expected_request_sha256": launch.digest(self.request_raw),
        }
        options.update(changes)
        return inputs.parse_pinned_update_inputs(**options)

    def parse_raw(self, launch_raw, request_raw):
        return self.parse(
            launch_bytes=launch_raw, request_bytes=request_raw,
            expected_launch_sha256=launch.digest(launch_raw),
            expected_request_sha256=launch.digest(request_raw))

    def reject_launch(self, document):
        with self.assertRaises(inputs.PinnedInputsBlocked):
            self.parse_raw(launch.canonical(document), self.request_raw)

    def reject_request(self, document):
        with self.assertRaises(inputs.PinnedInputsBlocked):
            self.parse_raw(self.launch_raw, launch.canonical(document))

    def test_exact_bytes_decode_to_the_existing_types_without_running_flow(self):
        with patch.object(flow.NormalUpdateFlow, "run") as run:
            parsed = self.parse()
        run.assert_not_called()
        self.assertIs(type(parsed.request), flow.UpdateRequest)
        self.assertIs(type(parsed.request.launch), launch.LaunchMaterials)
        self.assertEqual(parsed.request.document(), self.request.document())
        self.assertEqual(parsed.launch_bytes, self.launch_raw)
        self.assertEqual(parsed.request_bytes, self.request_raw)
        self.assertEqual(parsed.request.launch.sha256(), launch.digest(self.launch_raw))
        with self.assertRaises(FrozenInstanceError):
            parsed.request_bytes = b"changed"
        with self.assertRaises(FrozenInstanceError):
            parsed.request.launch.sources[0].size = 1

    def test_both_digests_are_checked_before_any_json_decoding(self):
        for field in ("expected_launch_sha256", "expected_request_sha256"):
            with self.subTest(field=field), patch.object(inputs.json, "loads") as decode:
                with self.assertRaises(inputs.PinnedInputsBlocked):
                    self.parse(**{field: "9" * 64})
                decode.assert_not_called()

    def test_invalid_digest_types_zero_or_encoding_are_rejected(self):
        for field in ("expected_launch_sha256", "expected_request_sha256"):
            for value in (None, True, b"a" * 64, "", "a" * 63, "A" * 64, "0" * 64):
                with self.subTest(field=field, value=value):
                    with self.assertRaises(inputs.PinnedInputsBlocked):
                        self.parse(**{field: value})

    def test_mutable_or_non_byte_inputs_are_rejected_before_json_decoding(self):
        for field, raw in (("launch_bytes", self.launch_raw),
                           ("request_bytes", self.request_raw)):
            for value in (None, True, raw.decode(), bytearray(raw), memoryview(raw)):
                with self.subTest(field=field, kind=type(value).__name__):
                    with patch.object(inputs.json, "loads") as decode:
                        with self.assertRaises(inputs.PinnedInputsBlocked):
                            self.parse(**{field: value})
                        decode.assert_not_called()

    def test_empty_and_oversized_inputs_are_rejected_before_json_decoding(self):
        for field, limit in (("launch_bytes", inputs.MAX_LAUNCH_BYTES),
                             ("request_bytes", inputs.MAX_REQUEST_BYTES)):
            for value in (b"", b"x" * (limit + 1)):
                with self.subTest(field=field, size=len(value)):
                    with patch.object(inputs.json, "loads") as decode:
                        with self.assertRaises(inputs.PinnedInputsBlocked):
                            self.parse(**{field: value})
                        decode.assert_not_called()

    def test_changed_bytes_cannot_use_the_original_independent_digest(self):
        for field, raw in (("launch_bytes", self.launch_raw),
                           ("request_bytes", self.request_raw)):
            with self.subTest(field=field), self.assertRaises(inputs.PinnedInputsBlocked):
                self.parse(**{field: raw + b" "})

    def test_legacy_platform_cannot_be_repinned_as_the_current_candidate(self):
        legacy = json.loads(self.launch_raw)
        legacy["platform"]["pythonVersion"] = "3.12.3"
        legacy["argv"][0] = "/usr/bin/python3.12"
        legacy_raw = launch.canonical(legacy)
        request = json.loads(self.request_raw)
        request["launchMaterialsSha256"] = launch.digest(legacy_raw)
        with self.assertRaisesRegex(inputs.PinnedInputsBlocked, "v1 serialization"):
            self.parse_raw(legacy_raw, launch.canonical(request))

    def test_legacy_request_binding_cannot_be_mixed_with_current_launch(self):
        legacy = json.loads(self.launch_raw)
        legacy["platform"]["pythonVersion"] = "3.12.3"
        legacy["argv"][0] = "/usr/bin/python3.12"
        request = json.loads(self.request_raw)
        request["launchMaterialsSha256"] = launch.digest(launch.canonical(legacy))
        with self.assertRaisesRegex(inputs.PinnedInputsBlocked, "launch binding"):
            self.parse_raw(self.launch_raw, launch.canonical(request))

    def test_duplicate_top_level_keys_even_with_same_value_are_rejected(self):
        for which, raw in (("launch", self.launch_raw), ("request", self.request_raw)):
            schema = json.loads(raw)["schema"]
            duplicate = raw[:-1] + b',"schema":' + json.dumps(schema).encode() + b"}"
            with self.subTest(which=which):
                with self.assertRaisesRegex(inputs.PinnedInputsBlocked, "duplicate JSON key"):
                    if which == "launch":
                        self.parse_raw(duplicate, self.request_raw)
                    else:
                        self.parse_raw(self.launch_raw, duplicate)

    def test_duplicate_nested_source_pin_key_is_rejected(self):
        duplicate = self.launch_raw.replace(
            b'"sha256":"', b'"sha256":"9","sha256":"', 1)
        with self.assertRaisesRegex(inputs.PinnedInputsBlocked, "duplicate JSON key"):
            self.parse_raw(duplicate, self.request_raw)

    def test_malformed_json_and_non_object_roots_are_controlled(self):
        for raw in (b"{", b"[]", b"null", b"true", b"1", b'{"a":1}{}', b"\x00"):
            with self.subTest(raw=raw):
                with self.assertRaises(inputs.PinnedInputsBlocked):
                    self.parse_raw(raw, self.request_raw)
                with self.assertRaises(inputs.PinnedInputsBlocked):
                    self.parse_raw(self.launch_raw, raw)

    def test_non_ascii_utf16_and_bom_are_not_silently_normalized(self):
        for raw in (b"\xef\xbb\xbf" + self.launch_raw,
                    self.launch_raw.decode().encode("utf-16"),
                    self.launch_raw + b"\xff"):
            with self.subTest(prefix=raw[:4]), self.assertRaises(inputs.PinnedInputsBlocked):
                self.parse_raw(raw, self.request_raw)

    def test_valid_json_with_different_spacing_order_or_escapes_is_rejected(self):
        for raw in (
            self.launch_raw + b"\n",
            b" " + self.launch_raw,
            json.dumps(self.materials.document(), indent=2).encode(),
            json.dumps(self.materials.document(), separators=(",", ":")).encode(),
            self.launch_raw.replace(b'"linux"', b'"\\u006cinux"'),
        ):
            with self.subTest(prefix=raw[:30]), self.assertRaises(inputs.PinnedInputsBlocked):
                self.parse_raw(raw, self.request_raw)
        with self.assertRaises(inputs.PinnedInputsBlocked):
            self.parse_raw(self.launch_raw, self.request_raw + b"\n")

    def test_floating_and_non_finite_json_numbers_are_rejected(self):
        for token in (b"0.0", b"1e0", b"NaN", b"Infinity", b"-Infinity"):
            raw = self.launch_raw.replace(b'"uid":0', b'"uid":' + token)
            with self.subTest(token=token):
                with self.assertRaisesRegex(inputs.PinnedInputsBlocked, "JSON number"):
                    self.parse_raw(raw, self.request_raw)

    def test_excessive_integer_and_nesting_are_controlled(self):
        huge_integer = b'{"x":' + b"1" * 1000 + b"}"
        with self.assertRaisesRegex(inputs.PinnedInputsBlocked, "excessive JSON integer"):
            self.parse_raw(self.launch_raw, huge_integer)
        nested = b"[" * 2000 + b"0" + b"]" * 2000
        with self.assertRaises(inputs.PinnedInputsBlocked):
            self.parse_raw(self.launch_raw, nested)

    def test_launch_unknown_or_missing_fields_are_not_ignored_or_defaulted(self):
        for field in self.materials.document():
            document = self.materials.document()
            del document[field]
            with self.subTest(missing=field):
                self.reject_launch(document)
        document = self.materials.document()
        document["approved"] = True
        self.reject_launch(document)

    def test_launch_derived_environment_platform_and_entry_fields_remain_exact(self):
        changes = {
            "schema": "sanq.runtime.normal-update-launch.v2",
            "sourceRoot": "/tmp/operator",
            "platform": {"os": "linux", "architecture": "x86_64", "pythonVersion": "3.10.12"},
            "entryPoint": "another.run",
            "argv": ["/opt/sanq/python/3.12.15/bin/python3.12", self.materials.bootstrap_source],
            "environment": {"PATH": "/tmp"},
            "cwd": "/tmp",
            "uid": 1,
            "gid": 1,
            "sourceProvenanceAuthenticated": True,
            "dynamicDependencyClosureVerified": True,
            "launchAuthorized": True,
        }
        for field, value in changes.items():
            with self.subTest(field=field):
                document = self.materials.document()
                document[field] = value
                self.reject_launch(document)

    def test_boolean_integer_equivalence_does_not_change_derived_fields(self):
        for field in ("uid", "gid"):
            document = self.materials.document()
            document[field] = False
            self.reject_launch(document)
        for field in ("launchAuthorized", "sourceProvenanceAuthenticated",
                      "dynamicDependencyClosureVerified"):
            document = self.materials.document()
            document[field] = 0
            self.reject_launch(document)

    def test_invalid_source_pin_inventory_and_shape_are_rejected(self):
        for value in (None, [], {}, {"bootstrap.py": {"sha256": "1" * 64, "bytes": 3}}):
            document = self.materials.document()
            document["sourceFiles"] = value
            self.reject_launch(document)
        for value in ({}, {"sha256": "1" * 64},
                      {"sha256": "1" * 64, "bytes": True},
                      {"sha256": "1" * 64, "bytes": 65537},
                      {"sha256": "1" * 64, "bytes": 0},
                      {"sha256": "bad", "bytes": 1},
                      {"sha256": "1" * 64, "bytes": 1, "approved": True}):
            document = self.materials.document()
            document["sourceFiles"]["bootstrap.py"] = value
            self.reject_launch(document)
        document = self.materials.document()
        document["sourceFiles"]["../bootstrap.py"] = document["sourceFiles"].pop("bootstrap.py")
        self.reject_launch(document)

    def test_invalid_bootstrap_and_commit_are_rejected(self):
        for field, value in (("bootstrapSource", "normal_runtime_update.py"),
                             ("bootstrapSource", "missing.py"), ("sourceCommit", "short"),
                             ("transactionId", "UPPERCASE")):
            document = self.materials.document()
            document[field] = value
            self.reject_launch(document)

    def test_subprocess_arrays_keep_existing_argv_contract(self):
        for value in (None, {}, ["not an array"], [[]],
                      [["/tmp/run"]], [["/usr/bin/true", "control\n"]],
                      [["/usr/bin/true"]] * 2):
            document = self.materials.document()
            document["subprocessArgvs"] = value
            self.reject_launch(document)

    def test_request_is_bound_to_the_exact_launch_digest(self):
        document = self.request.document()
        document["launchMaterialsSha256"] = "8" * 64
        self.reject_request(document)

    def test_request_transaction_must_match_launch_even_when_both_bytes_are_pinned(self):
        document = self.request.document()
        document["transactionId"] = "different-inputs-001"
        self.reject_request(document)

    def test_request_unknown_or_missing_fields_are_not_ignored_or_defaulted(self):
        for field in self.request.document():
            document = self.request.document()
            del document[field]
            with self.subTest(missing=field):
                self.reject_request(document)
        document = self.request.document()
        document["authorizedToMutateProduction"] = True
        self.reject_request(document)

    def test_request_preserves_runtime_archive_state_and_fixed_target_guards(self):
        changes = {
            "schema": "sanq.runtime.normal-update-request.v2",
            "operation": "reinstall",
            "currentRuntimeSha": self.request.target_runtime_sha,
            "targetRuntimeSha": "short",
            "currentArchiveDigest": self.request.target_archive_digest,
            "targetArchiveDigest": None,
            "currentAppSha": True,
            "previousAppSha": "bad",
            "preservedStateSha256": "0" * 64,
            "runtimeRoot": "/tmp/runtime",
            "composeProject": "another-app",
            "databaseVolume": "another-pgdata",
            "uploadsBind": "/tmp/uploads",
        }
        for field, value in changes.items():
            with self.subTest(field=field):
                document = self.request.document()
                document[field] = value
                self.reject_request(document)

    def test_old_archive_digest_is_required_without_fetching_old_archive_bytes(self):
        parsed = self.parse()
        self.assertEqual(parsed.request.current_archive_digest,
                         "sha256:" + "1" * 64)
        for value in ("", None, "manifest-sha", "sha256:" + "2" * 64):
            document = self.request.document()
            document["currentArchiveDigest"] = value
            self.reject_request(document)

    def test_all_valid_v1_subprocess_args_fit_the_launch_budget_including_escapes(self):
        token = "\\" * 1024
        argvs = tuple(
            ("/usr/bin/true",) + (token,) * 30 + (token[:-len(str(i))] + str(i),)
            for i in range(16))
        materials = replace(self.materials, subprocess_argvs=argvs)
        request = replace(self.request, launch=materials)
        raw = launch.canonical(materials.document())
        self.assertGreater(len(raw), 1_000_000)
        self.assertLessEqual(len(raw), inputs.MAX_LAUNCH_BYTES)
        parsed = self.parse_raw(raw, launch.canonical(request.document()))
        self.assertEqual(parsed.request.launch.subprocess_argvs, argvs)

    def test_new_consistent_pins_decode_but_do_not_authenticate_their_own_source(self):
        materials = replace(self.materials, source_commit="f" * 40,
                            transaction_id="different-inputs-002")
        request = replace(self.request, launch=materials,
                          transaction_id=materials.transaction_id)
        parsed = self.parse_raw(
            launch.canonical(materials.document()), launch.canonical(request.document()))
        self.assertEqual(parsed.request.transaction_id, materials.transaction_id)
        document = parsed.request.launch.document()
        for field in ("sourceProvenanceAuthenticated",
                      "dynamicDependencyClosureVerified", "launchAuthorized"):
            self.assertIs(document[field], False)
        self.assertFalse(hasattr(parsed, "execute"))
        self.assertFalse(hasattr(parsed, "authorize"))

    def test_returned_materials_do_not_retain_mutable_decoded_dictionaries(self):
        parsed = self.parse()
        document = parsed.request.launch.document()
        document["sourceFiles"]["bootstrap.py"]["sha256"] = "7" * 64
        document["argv"].clear()
        self.assertEqual(parsed.request.launch.sha256(), launch.digest(self.launch_raw))
        self.assertEqual(launch.canonical(parsed.request.document()), self.request_raw)

    def test_module_boundary_has_no_io_loader_cli_or_flow_execution(self):
        source = (ROOT / "normal_runtime_inputs.py").read_text()
        tree = ast.parse(source)
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(item.name for item in node.names)
            if isinstance(node, ast.ImportFrom):
                imports.add(node.module)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                self.assertNotIn(node.func.id, {"open", "exec", "eval", "compile", "__import__"})
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                self.assertNotIn(node.func.attr, {"run", "write", "write_text", "write_bytes"})
        self.assertLessEqual(imports, {
            "__future__", "dataclasses", "json",
            "normal_runtime_launch", "normal_runtime_update",
        })
        self.assertNotIn("__main__", source)
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/normal_runtime_inputs.py", SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
