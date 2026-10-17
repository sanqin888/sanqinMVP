"""C5-G2 B4B-3A: synthetic, nonroot, in-memory closure-manifest checks.

All digests and dependency edges in these fixtures are fabricated test claims;
no test inspects or authenticates an actual interpreter, library or Guest.
"""
from copy import deepcopy
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_python_dependency_manifest import (  # noqa: E402
    SCHEMA, canonical_manifest_bytes, DependencyManifestBlocked,
    review_dependency_manifest,
)


def node(identifier, kind, path, digest, requires=()):
    return {
        "id": identifier, "kind": kind, "path": path,
        "sha256": digest, "requires": list(requires),
    }


def fixture():
    # This is deliberately NOT a list discovered from an actual running Python.
    rows = [
        node("interpreter", "python-executable", "/usr/bin/python3.12", "a" * 64,
             ["loader", "py:hashlib", "pkg:json", "builtin:sys", "frozen:os"]),
        node("loader", "elf-loader", "/lib64/ld-linux-x86-64.so.2", "b" * 64,
             ["lib:libc.so.6", "virtual:linux-vdso.so.1"]),
        node("py:hashlib", "stdlib-module", "/usr/lib/python3.12/hashlib.py",
             "c" * 64, ["ext:_hashlib"]),
        node("pkg:json", "stdlib-package", "/usr/lib/python3.12/json/__init__.py",
             "d" * 64, ["py:json.decoder"]),
        node("py:json.decoder", "stdlib-module",
             "/usr/lib/python3.12/json/decoder.py", "e" * 64, ["builtin:sys"]),
        node("ext:_hashlib", "stdlib-extension",
             "/usr/lib/python3.12/lib-dynload/"
             "_hashlib.cpython-312-x86_64-linux-gnu.so", "f" * 64,
             ["lib:libcrypto.so.3"]),
        node("lib:libcrypto.so.3", "native-library",
             "/lib/x86_64-linux-gnu/libcrypto.so.3", "0" * 64,
             ["lib:libc.so.6"]),
        node("lib:libc.so.6", "native-library",
             "/lib/x86_64-linux-gnu/libc.so.6", "1" * 64),
        node("builtin:sys", "builtin", None, None),
        node("frozen:os", "frozen", None, None),
        node("virtual:linux-vdso.so.1", "kernel-virtual", None, None),
    ]
    manifest = {
        "schema": SCHEMA,
        "platform": {
            "os": "linux", "architecture": "x86_64",
            "pythonVersion": "3.12.3",
            "isolationFlags": ["-I", "-S", "-B"],
        },
        "nodes": rows,
    }
    pins = {row["path"]: row["sha256"] for row in rows
            if row["path"] is not None}
    return manifest, pins


def review(manifest, pins, digest=None):
    if digest is None:
        digest = hashlib.sha256(canonical_manifest_bytes(manifest)).hexdigest()
    return review_dependency_manifest(
        manifest, expected_manifest_sha256=digest,
        proposed_external_file_pins=pins,
    )


def get(manifest, identifier):
    return next(row for row in manifest["nodes"] if row["id"] == identifier)


class DependencyClosureManifestTests(unittest.TestCase):
    def test_complete_synthetic_declarations_still_never_grant_authority(self):
        manifest, pins = fixture()
        receipt = review(manifest, pins)
        self.assertIs(receipt["declaredGraphStructurallyClosed"], True)
        self.assertEqual(receipt["declaredNodeCount"], 11)
        self.assertEqual(receipt["declaredFileCount"], 8)
        self.assertEqual(receipt["decision"], "BLOCKED")
        for key in (
            "manifestProvenanceIndependentlyAuthenticated",
            "fileBytesIndependentlyVerified",
            "pythonRuntimeDependencyClosureVerified",
            "dynamicImportsAndDlopenObserved",
            "kernelVirtualDependencyAuthenticated",
            "rootExecutionAttempted",
            "independentGuestWitnessVerified",
            "readyToInstall",
            "authorizedToMutateProduction",
        ):
            self.assertIs(receipt[key], False)

    def test_file_hashes_manifest_digest_or_envelope_mismatch_block(self):
        manifest, pins = fixture()
        with self.assertRaises(DependencyManifestBlocked):
            review(manifest, pins, "f" * 64)
        with self.assertRaises(DependencyManifestBlocked):
            review(manifest, pins, "F" * 64)
        cases = []
        missing = deepcopy(pins)
        del missing["/lib/x86_64-linux-gnu/libcrypto.so.3"]
        cases.append(missing)
        extra = deepcopy(pins)
        extra["/tmp/rogue.so"] = "1" * 64
        cases.append(extra)
        changed = deepcopy(pins)
        changed["/usr/bin/python3.12"] = "f" * 64
        cases.append(changed)
        malformed = deepcopy(pins)
        malformed["/usr/bin/python3.12"] = "A" * 64
        cases.append(malformed)
        for idx, candidate in enumerate(cases):
            with self.subTest(idx=idx):
                with self.assertRaises(DependencyManifestBlocked):
                    review(manifest, candidate)
        for field, value in (("schema", "unrecognized"), ("extra", True)):
            copy = deepcopy(manifest)
            copy[field] = value
            with self.assertRaises(DependencyManifestBlocked):
                review(copy, pins)

    def test_changed_platform_and_startup_flags_block(self):
        for field, value in (
            ("os", "darwin"), ("architecture", "aarch64"),
            ("pythonVersion", "3.13.0"),
            ("isolationFlags", ["-S", "-I", "-B"]),
            ("isolationFlags", ["-I", "-S", "-B", "-c"]),
            ("isolationFlags", ("-I", "-S", "-B")),
        ):
            manifest, pins = fixture()
            manifest["platform"][field] = value
            with self.subTest(field=field, value=value):
                with self.assertRaises(DependencyManifestBlocked):
                    review(manifest, pins)

    def test_malformed_or_unmodeled_node_blocks(self):
        changes = [
            ("interpreter", "path", "/tmp/python3.12"),
            ("loader", "path", "/tmp/ld-linux-x86-64.so.2"),
            ("py:json.decoder", "path", "/tmp/decoder.py"),
            ("pkg:json", "path", "/usr/lib/python3.12/json.py"),
            ("ext:_hashlib", "path", "/tmp/_hashlib.so"),
            ("ext:_hashlib", "path",
             "/usr/lib/python3.12/lib-dynload/_hashlib.cpython-313-x86_64-linux-gnu.so"),
            ("lib:libcrypto.so.3", "path", "/usr/local/lib/libcrypto.so.3"),
            ("lib:libcrypto.so.3", "path",
             "/lib/x86_64-linux-gnu/../x/libcrypto.so.3"),
            ("lib:libcrypto.so.3", "id", "lib:libcrypto.so.4"),
            ("builtin:sys", "path", "/usr/lib/python3.12/sys.py"),
            ("frozen:os", "sha256", "2" * 64),
            ("virtual:linux-vdso.so.1", "kind", "native-library"),
            ("py:hashlib", "sha256", None),
            ("py:hashlib", "kind", "arbitrary-module"),
            ("interpreter", "requires", ["builtin:sys"]),
        ]
        for identifier, field, value in changes:
            manifest, pins = fixture()
            get(manifest, identifier)[field] = value
            with self.subTest(identifier=identifier, field=field):
                with self.assertRaises(DependencyManifestBlocked):
                    review(manifest, pins)

    def test_missing_extra_duplicate_or_unreachable_edges_block(self):
        manipulations = [
            lambda m: get(m, "py:hashlib")["requires"].append("ext:_ssl"),
            lambda m: get(m, "loader")["requires"].append("lib:libc.so.6"),
            lambda m: get(m, "interpreter")["requires"].remove("loader"),
            lambda m: get(m, "pkg:json")["requires"].clear(),
            lambda m: m["nodes"].append(deepcopy(get(m, "builtin:sys"))),
            lambda m: m["nodes"].append(
                node("builtin:inspect", "builtin", None, None)),
            lambda m: m["nodes"].remove(get(m, "loader")),
            lambda m: get(m, "py:hashlib").update({"unexpected": True}),
        ]
        for idx, mutate in enumerate(manipulations):
            manifest, pins = fixture()
            mutate(manifest)
            with self.subTest(idx=idx):
                with self.assertRaises(DependencyManifestBlocked):
                    review(manifest, pins)

    def test_same_python_module_cannot_have_two_claimed_origins(self):
        manifest, pins = fixture()
        competing = node(
            "pkg:hashlib", "stdlib-package",
            "/usr/lib/python3.12/hashlib/__init__.py", "2" * 64)
        manifest["nodes"].append(competing)
        get(manifest, "interpreter")["requires"].append("pkg:hashlib")
        pins[competing["path"]] = competing["sha256"]
        with self.assertRaises(DependencyManifestBlocked):
            review(manifest, pins)

    def test_oversize_canonical_document_blocks_before_claim_review(self):
        manifest, pins = fixture()
        manifest["platform"]["os"] = "x" * 524289
        with self.assertRaises(DependencyManifestBlocked):
            review_dependency_manifest(
                manifest, expected_manifest_sha256="a" * 64,
                proposed_external_file_pins=pins)

    def test_cycles_can_be_described_without_unbounded_recursion(self):
        # Import/ELF graphs may contain cycles; a set-based walk must terminate.
        manifest, pins = fixture()
        get(manifest, "lib:libc.so.6")["requires"].append("loader")
        self.assertIs(review(manifest, pins)["declaredGraphStructurallyClosed"], True)

    def test_wrong_input_types_or_size_fail_closed(self):
        manifest, pins = fixture()
        for candidate in (None, [], {}, {"schema": SCHEMA, "nodes": []}):
            with self.subTest(candidate=candidate):
                with self.assertRaises(DependencyManifestBlocked):
                    review_dependency_manifest(
                        candidate, expected_manifest_sha256="a" * 64,
                        proposed_external_file_pins=pins)
        manifest["nodes"] *= 100
        with self.assertRaises(DependencyManifestBlocked):
            review_dependency_manifest(
                manifest, expected_manifest_sha256="a" * 64,
                proposed_external_file_pins=pins)

    def test_component_has_no_runtime_execution_or_bundle_membership(self):
        import root_python_dependency_manifest as component
        for name in ("main", "exec", "execute", "run", "install", "open",
                     "subprocess", "os", "importlib", "ctypes", "runpy"):
            self.assertFalse(hasattr(component, name), name)
        self.assertNotIn(
            "ops/runtime/root_python_dependency_manifest.py",
            __import__("build_bundle").SOURCE_FILES,
        )


if __name__ == "__main__":
    unittest.main()
