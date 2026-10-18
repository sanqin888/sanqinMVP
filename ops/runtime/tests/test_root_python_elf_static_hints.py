"""Synthetic only: AST/ELF64 import hints never execute or authenticate bytes."""
import hashlib
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_python_elf_static_hints import (  # noqa: E402
    DependencyHintBlocked, inspect_python_import_hints,
    inspect_elf64_needed_hints,
)


def synthetic_elf(*, needed=b"libcrypto.so.3", interp=b"/lib64/ld-linux-x86-64.so.2",
                  rpath=False):
    # A fabricated in-memory ELF64 image. No real executable, linker or I/O.
    image = bytearray(512)
    image[0:7] = b"\x7fELF\x02\x01\x01"
    image[7] = 0
    struct.pack_into("<HHIQQQIHHHHHH", image, 16,
                     2, 62, 1, 0, 64, 0, 0, 64, 56, 3, 0, 0, 0)
    struct.pack_into("<IIQQQQQQ", image, 64,
                     1, 5, 0, 0x400000, 0, 512, 512, 4096)
    entries = 5 if rpath else 4
    dyn_size = entries * 16
    struct.pack_into("<IIQQQQQQ", image, 120,
                     2, 4, 256, 0x400100, 0, dyn_size, dyn_size, 8)
    interpreter = interp + b"\0"
    struct.pack_into("<IIQQQQQQ", image, 176,
                     3, 4, 320, 0x400140, 0, len(interpreter),
                     len(interpreter), 1)
    image[320:320 + len(interpreter)] = interpreter
    table = b"\0" + needed + b"\0"
    image[384:384 + len(table)] = table
    dynamics = [(5, 0x400000 + 384), (10, len(table)), (1, 1)]
    if rpath:
        dynamics.append((29, 1))
    dynamics.append((0, 0))
    for i, item in enumerate(dynamics):
        struct.pack_into("<qQ", image, 256 + i * 16, *item)
    return bytes(image)


class StaticEvidenceHintTests(unittest.TestCase):
    def test_python_ast_has_hints_but_not_full_closure_or_execution(self):
        source = b"import os, json.decoder as dec\nfrom json import loads\n"
        receipt = inspect_python_import_hints(source)
        self.assertEqual(receipt["observedStaticImportNames"],
                         ["json", "json.decoder", "os"])
        self.assertEqual(receipt["observedImportStatementCount"], 2)
        self.assertIn("from-import-submodule-vs-attribute-unknown",
                      receipt["unresolvedStaticHazards"])
        self.assertEqual(receipt["candidateBytesSha256"],
                         hashlib.sha256(source).hexdigest())
        self.assertFalse(receipt["transitiveDependencyClosureVerified"])
        self.assertFalse(receipt["dynamicImportAndDlopenClosureVerified"])
        self.assertFalse(receipt["readyToInstall"])
        self.assertFalse(receipt["authorizedToMutateProduction"])
        self.assertEqual(receipt["decision"], "BLOCKED")

    def test_dynamic_relative_wildcard_import_hazards_reported(self):
        source = (b"from . import neighbor\nfrom pkg import *\n"
                  b"importlib.import_module('os')\n__import__('sys')\n")
        result = inspect_python_import_hints(source)
        self.assertIn("dynamic-code-or-import-call",
                      result["unresolvedStaticHazards"])
        self.assertIn("dynamic-loader-call",
                      result["unresolvedStaticHazards"])
        self.assertIn("relative-import-resolution-unavailable",
                      result["unresolvedStaticHazards"])
        self.assertIn("wildcard-import-targets-unknown",
                      result["unresolvedStaticHazards"])

    def test_ast_rejects_syntax_empty_and_unbounded_source(self):
        for data in (b"", b"def broken(:\n", b"x" * (256 * 1024 + 1),
                     "import os", [], 3):
            with self.subTest(value=str(data)[:15]):
                with self.assertRaises(DependencyHintBlocked):
                    inspect_python_import_hints(data)

    def test_elf64_synthetic_needed_and_loader_hints(self):
        data = synthetic_elf()
        result = inspect_elf64_needed_hints(data)
        self.assertEqual(result["neededSonames"], ["libcrypto.so.3"])
        self.assertEqual(result["declaredInterpreter"],
                         "/lib64/ld-linux-x86-64.so.2")
        self.assertTrue(result["staticElfHintsExtracted"])
        self.assertFalse(result["transitiveDependencyClosureVerified"])
        self.assertFalse(result["dynamicImportAndDlopenClosureVerified"])
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["authorizedToMutateProduction"])
        self.assertEqual(result["decision"], "BLOCKED")

    def test_elf_dynamic_loader_search_hazards_are_not_certified(self):
        data = synthetic_elf(rpath=True, interp=b"/tmp/untrusted-ld.so")
        result = inspect_elf64_needed_hints(data)
        self.assertIn("DT_RUNPATH-unmodeled",
                      result["unmodeledSearchOrLoaderFlags"])
        self.assertIn("PT_INTERP-unexpected-loader",
                      result["unmodeledSearchOrLoaderFlags"])
        self.assertFalse(result["transitiveDependencyClosureVerified"])

    def test_elf_parser_rejects_unsafe_file_headers_and_offsets(self):
        examples = [
            b"", b"random ELF", b"\x7fELF\x01\x01\x01" + b"\0" * 512,
            synthetic_elf()[:130], b"x" * (32 * 1024 * 1024 + 1),
            "not bytes",
        ]
        wrong_machine = bytearray(synthetic_elf())
        struct.pack_into("<H", wrong_machine, 18, 183)
        examples.append(bytes(wrong_machine))
        bad_phoff = bytearray(synthetic_elf())
        struct.pack_into("<Q", bad_phoff, 32, 999999)
        examples.append(bytes(bad_phoff))
        no_nul = bytearray(synthetic_elf())
        struct.pack_into("<qQ", no_nul, 256 + 3 * 16, 1, 1)
        examples.append(bytes(no_nul))
        bad_strtab = bytearray(synthetic_elf())
        struct.pack_into("<qQ", bad_strtab, 256, 5, 0x800000)
        examples.append(bytes(bad_strtab))
        bad_name = bytearray(synthetic_elf(needed=b"../../evil.so"))
        examples.append(bytes(bad_name))
        for i, data in enumerate(examples):
            with self.subTest(case=i):
                with self.assertRaises(DependencyHintBlocked):
                    inspect_elf64_needed_hints(data)

    def test_static_hints_are_outside_runtime_bundle(self):
        import root_python_elf_static_hints as module
        self.assertNotIn("ops/runtime/root_python_elf_static_hints.py",
                         __import__("build_bundle").SOURCE_FILES)
        for name in ("main", "install", "execute", "subprocess", "os",
                     "importlib", "ctypes"):
            self.assertFalse(hasattr(module, name), name)


if __name__ == "__main__":
    unittest.main()
