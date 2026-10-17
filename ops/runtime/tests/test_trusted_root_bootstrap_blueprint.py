"""C5-G2 B02-B4B-1: inert Bootstrap prototype synthetic regressions.

Tests inspect only Python bytes/dictionaries. No root, filesystem probe,
Python candidate compilation/execution, subprocess, or Runtime mutation.
"""
from dataclasses import replace
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_operator_execution_binding import (  # noqa: E402
    freeze_inert_source_material,
)
from trusted_root_bootstrap_blueprint import (  # noqa: E402
    BOOTSTRAP_PATH, INTERPRETER_PATH, INTERPRETER_FLAGS, STDLIB_ROOT,
    BootstrapPreflightBlocked, review_trusted_bootstrap_blueprint,
)

SOURCE = b"import hashlib\nfrom os import path\n"
SOURCE_PIN = hashlib.sha256(SOURCE).hexdigest()
BOOTSTRAP_PIN = "a" * 64
INTERPRETER_PIN = "b" * 64
EXPECTED_MODULES = {"hashlib": "c" * 64, "os": "d" * 64}


def identity(size=len(SOURCE)):
    return {
        "device": 2050, "inode": 3201, "size": size,
        "mtimeNs": 1000200001, "ctimeNs": 1000200010,
    }


def file_claim(path, digest, mode, ino):
    return {
        "path": path, "sha256": digest, "uid": 0, "gid": 0,
        "mode": mode, "type": "regular", "hardlinks": 1,
        "device": 2050, "inode": ino,
    }


def build_case(source=SOURCE):
    digest = hashlib.sha256(source).hexdigest()
    material = freeze_inert_source_material(
        source, expected_sha256=digest,
        claimed_fd_identity=identity(len(source)))
    bootstrap = file_claim(BOOTSTRAP_PATH, BOOTSTRAP_PIN, 0o600, 201)
    interpreter = file_claim(INTERPRETER_PATH, INTERPRETER_PIN, 0o755, 202)
    interpreter["flags"] = INTERPRETER_FLAGS
    module_files = {
        name: file_claim(STDLIB_ROOT + name + ".py", pin, 0o644, i + 301)
        for i, (name, pin) in enumerate(EXPECTED_MODULES.items())
    }
    return {
        "material": material,
        "proposed_consumer_bytes": material.source_bytes,
        "operator_sha256": digest,
        "claimed_consumer_fd_identity": identity(len(source)),
        "bootstrap_claim": bootstrap,
        "independently_pinned_bootstrap_sha256": BOOTSTRAP_PIN,
        "interpreter_claim": interpreter,
        "independently_pinned_interpreter_sha256": INTERPRETER_PIN,
        "expected_direct_module_hashes": dict(EXPECTED_MODULES),
        "claimed_dependency_files": module_files,
    }


class BootstrapPrototypeTests(unittest.TestCase):
    def test_matching_synthetic_claims_still_do_not_authorize(self):
        outcome = review_trusted_bootstrap_blueprint(**build_case())
        for key in (
            "claimedBootstrapSourceIdentityConsistent",
            "claimedInterpreterIdentityConsistent",
            "claimedDirectImportFilesConsistent",
            "sameSyntheticByteObject",
        ):
            self.assertIs(outcome[key], True)
        for key in (
            "bootstrapTrustRootAuthenticated",
            "operatorSourceFDIndependentlyWitnessed",
            "interpreterBinaryIndependentlyAuthenticated",
            "pythonRuntimeDependencyClosureVerified",
            "actualCodeConsumptionVerified",
            "rootExecutionAttempted",
            "maintenanceIsolationVerified",
            "externalRecoveryKitVerified",
            "readyToInstall",
            "authorizedToMutateProduction",
        ):
            self.assertIs(outcome[key], False)
        self.assertEqual(outcome["decision"], "BLOCKED")

    def test_untrusted_bootstrap_pin_or_identity_blocks(self):
        for field, value in (
            ("path", "/tmp/bootstrap.py"),
            ("sha256", "0" * 64), ("uid", 1000),
            ("mode", 0o644), ("hardlinks", 2),
            ("type", "symlink"), ("inode", 0),
            ("device", True),
        ):
            case = build_case()
            case["bootstrap_claim"][field] = value
            with self.subTest(field=field):
                with self.assertRaises(BootstrapPreflightBlocked):
                    review_trusted_bootstrap_blueprint(**case)
        case = build_case()
        case["independently_pinned_bootstrap_sha256"] = "f" * 64
        with self.assertRaises(BootstrapPreflightBlocked):
            review_trusted_bootstrap_blueprint(**case)

    def test_interpreter_binary_and_isolation_flags_block(self):
        for field, value in (
            ("path", "/usr/bin/python3"),
            ("sha256", "0" * 64), ("mode", 0o777),
            ("uid", 1000), ("flags", ("-I",)),
            ("flags", ["-I", "-S", "-B"]),
            ("flags", ("-I", "-S", "-B", "-c")),
            ("flags", ("-B", "-I", "-S")),
        ):
            case = build_case()
            case["interpreter_claim"][field] = value
            with self.subTest(field=field, value=value):
                with self.assertRaises(BootstrapPreflightBlocked):
                    review_trusted_bootstrap_blueprint(**case)

    def test_dependency_inventory_missing_extra_or_drift_blocks(self):
        cases = []
        absent = build_case()
        del absent["claimed_dependency_files"]["os"]
        cases.append(absent)
        extra = build_case()
        extra["expected_direct_module_hashes"]["subprocess"] = "f" * 64
        cases.append(extra)
        path = build_case()
        path["claimed_dependency_files"]["hashlib"]["path"] = "/tmp/hashlib.py"
        cases.append(path)
        digest = build_case()
        digest["claimed_dependency_files"]["os"]["sha256"] = "f" * 64
        cases.append(digest)
        mode = build_case()
        mode["claimed_dependency_files"]["os"]["mode"] = 0o666
        cases.append(mode)
        unknown = build_case()
        unknown["claimed_dependency_files"]["os"]["unexpected"] = True
        cases.append(unknown)
        for i, case in enumerate(cases):
            with self.subTest(case=i):
                with self.assertRaises(BootstrapPreflightBlocked):
                    review_trusted_bootstrap_blueprint(**case)

    def test_static_imports_and_indirect_import_attempts_fail_closed(self):
        source_variants = (
            b"import subprocess\n",
            b"import json.decoder\n",
            b"from os.path import exists\n",
            b"from . import local\n",
            b"from os import *\n",
            b"__import__('os')\n",
            b"exec('pass')\n",
            b"getattr(__builtins__, 'eval')('pass')\n",
            b"loader.import_module('os')\n",
            b"def bad(:\n",
            b"\xff",
        )
        for source in source_variants:
            with self.subTest(source=source):
                with self.assertRaises(BootstrapPreflightBlocked):
                    review_trusted_bootstrap_blueprint(**build_case(source))

    def test_same_source_bytes_object_is_not_a_runtime_consumption_proof(self):
        case = build_case()
        copied = bytes(bytearray(case["material"].source_bytes))
        self.assertEqual(copied, case["material"].source_bytes)
        self.assertIsNot(copied, case["material"].source_bytes)
        case["proposed_consumer_bytes"] = copied
        with self.assertRaises(BootstrapPreflightBlocked):
            review_trusted_bootstrap_blueprint(**case)
        case = build_case()
        case["claimed_consumer_fd_identity"]["inode"] += 1
        with self.assertRaises(BootstrapPreflightBlocked):
            review_trusted_bootstrap_blueprint(**case)

    def test_changed_material_or_pin_never_becomes_authorized(self):
        case = build_case()
        case["material"] = replace(case["material"], source_bytes=b"altered")
        with self.assertRaises(BootstrapPreflightBlocked):
            review_trusted_bootstrap_blueprint(**case)
        case = build_case()
        case["operator_sha256"] = "0" * 64
        with self.assertRaises(BootstrapPreflightBlocked):
            review_trusted_bootstrap_blueprint(**case)

    def test_source_is_not_a_root_launcher_or_runtime_bundle_member(self):
        import trusted_root_bootstrap_blueprint as component
        for forbidden in ("main", "run", "execute", "spawn", "install",
                          "open", "compile", "eval", "deliver"):
            self.assertFalse(hasattr(component, forbidden))
        for forbidden_import in ("os", "subprocess", "importlib", "runpy", "ctypes"):
            self.assertNotIn(forbidden_import, component.__dict__)
        self.assertNotIn(
            "ops/runtime/trusted_root_bootstrap_blueprint.py",
            __import__("build_bundle").SOURCE_FILES,
        )


if __name__ == "__main__":
    unittest.main()
