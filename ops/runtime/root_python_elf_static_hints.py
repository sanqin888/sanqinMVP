"""C5-G2 B4B-3B-2A: inert, bounded Python AST / ELF64 dependency hints.

No file access, import/exec, subprocess, native loader or production authority.
The caller supplies bytes without independently authenticated provenance. Static
hints are necessarily INCOMPLETE for CPython imports/dlopen/ld.so semantics.
"""
from __future__ import annotations

import ast
import hashlib
import re
import struct
from typing import Any

MAX_PYTHON_BYTES = 256 * 1024
MAX_ELF_BYTES = 32 * 1024 * 1024
MAX_ELF_PHDRS = 128
MAX_DYNAMIC_ENTRIES = 4096
MAX_ELF_STRTAB = 256 * 1024
MAX_SYMBOLS = 512
LIBRARY_NAME = re.compile(r"[A-Za-z0-9_+.-]{1,128}\.so(?:\.[0-9]+)*\Z")


class DependencyHintBlocked(ValueError):
    """Malformed or unsupported input cannot produce even candidate hints."""


def _require(ok: bool, message: str) -> None:
    if not ok:
        raise DependencyHintBlocked(message)


def _capture(data: Any, cap: int) -> bytes:
    _require(type(data) is bytes and 0 < len(data) <= cap,
             "invalid input type or byte limit")
    return data


def _receipt(kind: str, source: bytes) -> dict[str, Any]:
    return {
        "kind": kind,
        "candidateBytesSha256": hashlib.sha256(source).hexdigest(),
        "inputBytesProvenanceAuthenticated": False,
        "fileDescriptorPathAuthenticated": False,
        "transitiveDependencyClosureVerified": False,
        "dynamicImportAndDlopenClosureVerified": False,
        "actualRuntimeConsumptionWitnessed": False,
        "rootExecutionAttempted": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }


def inspect_python_import_hints(candidate_source_bytes: Any) -> dict[str, Any]:
    """Parse a synthetic or separately supplied Python source; NEVER execute it."""
    source = _capture(candidate_source_bytes, MAX_PYTHON_BYTES)
    try:
        parsed = ast.parse(source, filename="<untrusted-dependency-bytes>")
    except (SyntaxError, ValueError, TypeError, UnicodeError,
            MemoryError, RecursionError) as exc:
        raise DependencyHintBlocked("unsupported Python source") from exc

    direct: set[str] = set()
    hazards: set[str] = set()
    statement_count = 0
    for node in ast.walk(parsed):
        if isinstance(node, ast.Import):
            statement_count += 1
            for alias in node.names:
                direct.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            statement_count += 1
            if node.level:
                hazards.add("relative-import-resolution-unavailable")
            if node.module:
                direct.add(node.module)
            if any(alias.name == "*" for alias in node.names):
                hazards.add("wildcard-import-targets-unknown")
            hazards.add("from-import-submodule-vs-attribute-unknown")
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in {
                "__import__", "eval", "exec", "compile",
            }:
                hazards.add("dynamic-code-or-import-call")
            elif isinstance(func, ast.Attribute) and func.attr in {
                "import_module", "find_spec", "load_module",
                "exec_module", "CDLL", "PyDLL", "LoadLibrary",
                "dlopen",
            }:
                hazards.add("dynamic-loader-call")
        _require(statement_count <= MAX_SYMBOLS and len(direct) <= MAX_SYMBOLS,
                 "Python dependency hint count exceeds bound")

    receipt = _receipt("c5-g2-b4b3b2a-python-ast-import-hints-v1", source)
    receipt.update({
        "observedStaticImportNames": sorted(direct),
        "observedImportStatementCount": statement_count,
        "unresolvedStaticHazards": sorted(hazards),
        "staticImportHintsExtracted": True,
    })
    return receipt


def _unpack(fmt: str, source: bytes, offset: int) -> tuple[Any, ...]:
    size = struct.calcsize(fmt)
    _require(type(offset) is int and 0 <= offset <= len(source) - size,
             "truncated ELF field")
    try:
        return struct.unpack_from(fmt, source, offset)
    except struct.error as exc:
        raise DependencyHintBlocked("malformed ELF structure") from exc


def _check_range(source: bytes, offset: int, size: int) -> None:
    _require(type(offset) is int and type(size) is int
             and 0 <= offset <= len(source) and 0 <= size <= len(source) - offset,
             "ELF segment out of range")


def _slice(source: bytes, offset: int, size: int) -> bytes:
    _check_range(source, offset, size)
    return source[offset:offset + size]


def _text_cstring(source: bytes, start: int, end: int) -> str:
    _require(0 <= start < end <= len(source), "invalid ELF string location")
    nul = source.find(b"\0", start, end)
    _require(nul > start and nul - start <= 256,
             "unterminated or oversized ELF string")
    try:
        return source[start:nul].decode("ascii")
    except UnicodeDecodeError as exc:
        raise DependencyHintBlocked("non-ASCII ELF dependency") from exc


def inspect_elf64_needed_hints(candidate_elf_bytes: Any) -> dict[str, Any]:
    """Inspect ELF64 little-endian x86-64 PT_DYNAMIC without loading it.

    DT_NEEDED alone is not the set of files the runtime will load: ld.so search,
    RPATH, environment, preloads, symbol versioning and dlopen are not modeled.
    """
    source = _capture(candidate_elf_bytes, MAX_ELF_BYTES)
    _require(len(source) >= 64 and source[:4] == b"\x7fELF"
             and source[4] == 2 and source[5] == 1 and source[6] == 1,
             "unsupported ELF class/endianness/version")
    h = _unpack("<HHIQQQIHHHHHH", source, 16)
    elf_type, machine, version, _, phoff, _, _, ehsize, phentsize, phnum = h[:10]
    _require(elf_type in {2, 3} and machine == 62 and version == 1
             and ehsize == 64 and phentsize == 56
             and 0 < phnum <= MAX_ELF_PHDRS,
             "unsupported ELF64 x86-64 header")
    _check_range(source, phoff, phentsize * phnum)

    loads: list[tuple[int, int, int]] = []
    dynamic: list[tuple[int, int]] = []
    interpreter: list[str] = []
    for index in range(phnum):
        p_type, _, offset, vaddr, _, filesz, memsz, _ = _unpack(
            "<IIQQQQQQ", source, phoff + index * phentsize
        )
        _check_range(source, offset, filesz)
        if p_type == 1:  # PT_LOAD
            _require(filesz <= memsz and memsz > 0, "invalid PT_LOAD")
            loads.append((vaddr, offset, filesz))
        elif p_type == 2:  # PT_DYNAMIC
            _require(not dynamic and filesz > 0 and filesz <=
                     MAX_DYNAMIC_ENTRIES * 16 and filesz % 16 == 0,
                     "missing or repeated/bad PT_DYNAMIC")
            dynamic.append((offset, filesz))
        elif p_type == 3:  # PT_INTERP
            _require(not interpreter and 0 < filesz <= 256,
                     "bad PT_INTERP")
            raw = _slice(source, offset, filesz)
            _require(raw.endswith(b"\0") and raw.count(b"\0") == 1,
                     "noncanonical PT_INTERP string")
            interpreter.append(_text_cstring(raw, 0, len(raw)))

    _require(bool(loads) and bool(dynamic), "ELF missing load/dynamic segment")

    dynamic_values: dict[int, list[int]] = {}
    terminated = False
    offset, dyn_bytes = dynamic[0]
    for index in range(dyn_bytes // 16):
        tag, value = _unpack("<qQ", source, offset + index * 16)
        if tag == 0:
            terminated = True
            break
        dynamic_values.setdefault(tag, []).append(value)
    _require(terminated and len(dynamic_values.get(5, [])) == 1
             and len(dynamic_values.get(10, [])) == 1,
             "ELF requires unique DT_STRTAB/DT_STRSZ and DT_NULL")
    string_va = dynamic_values[5][0]  # DT_STRTAB
    string_size = dynamic_values[10][0]  # DT_STRSZ
    _require(0 < string_size <= MAX_ELF_STRTAB,
             "ELF string table outside budget")

    mapped = []
    for base, file_offset, file_size in loads:
        if base <= string_va and string_va - base <= file_size:
            available = file_size - (string_va - base)
            if string_size <= available:
                mapped.append(file_offset + string_va - base)
    _require(len(mapped) == 1, "ELF string table mapping ambiguous/missing")
    table_offset = mapped[0]
    table_end = table_offset + string_size
    _check_range(source, table_offset, string_size)

    needed: set[str] = set()
    for index in dynamic_values.get(1, []):  # DT_NEEDED
        _require(index < string_size, "DT_NEEDED outside string table")
        name = _text_cstring(source, table_offset + index, table_end)
        _require(LIBRARY_NAME.fullmatch(name) is not None,
                 "unmodeled DT_NEEDED SONAME")
        _require(name not in needed, "duplicate ELF dependency SONAME")
        needed.add(name)
        _require(len(needed) <= MAX_SYMBOLS, "ELF dependency count over bound")

    hazards: set[str] = set()
    for tag, label in (
        (15, "DT_RPATH-unmodeled"),
        (29, "DT_RUNPATH-unmodeled"),
        (0x6ffffefc, "DT_AUDIT-unmodeled"),
        (0x6ffffefb, "DT_DEPAUDIT-unmodeled"),
        (0x7ffffffd, "DT_AUXILIARY-unmodeled"),
        (0x7fffffff, "DT_FILTER-unmodeled"),
    ):
        if tag in dynamic_values:
            hazards.add(label)
    if not interpreter:
        hazards.add("PT_INTERP-absent-or-shared-library")
    if interpreter and interpreter[0] != "/lib64/ld-linux-x86-64.so.2":
        hazards.add("PT_INTERP-unexpected-loader")
    # Unknown tags may be meaningful to a loader; never claim they were ruled out.
    recognized = {0, 1, 5, 10, 15, 29, 0x6ffffefc, 0x6ffffefb,
                  0x7ffffffd, 0x7fffffff}
    unknown_tags = sorted(k for k in dynamic_values if k not in recognized)
    receipt = _receipt("c5-g2-b4b3b2a-elf64-dt-needed-hints-v1", source)
    receipt.update({
        "neededSonames": sorted(needed),
        "declaredInterpreter": interpreter[0] if interpreter else None,
        "unmodeledSearchOrLoaderFlags": sorted(hazards),
        "unknownDynamicTagCount": len(unknown_tags),
        "staticElfHintsExtracted": True,
    })
    return receipt
