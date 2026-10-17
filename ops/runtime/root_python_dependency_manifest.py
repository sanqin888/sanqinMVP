"""C5-G2 B02-B4B-3A: inert Python/ELF dependency manifest contract.

Review only an in-memory, caller-proposed CLOSED GRAPH and explicit hash pins.
This cannot discover imports/dlopen/ELF edges, read file bytes, authenticate a
pin origin or give root/Runtime authority. It is NOT a trusted loader.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any


SCHEMA = "sanq.c5.g2.b4b3a.dependency-manifest.v1"
PYTHON_PATH = "/usr/bin/python3.12"
LOADER_PATH = "/lib64/ld-linux-x86-64.so.2"
STDLIB_PATH = "/usr/lib/python3.12/"
EXTENSION_PATH = STDLIB_PATH + "lib-dynload/"
NATIVE_ROOTS = ("/lib/x86_64-linux-gnu/", "/usr/lib/x86_64-linux-gnu/")
ISOLATION_FLAGS = ["-I", "-S", "-B"]
MAX_NODES = 512
MAX_EDGES = 4096
MAX_MANIFEST_BYTES = 524288

HEX_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
MODULE_NAME = re.compile(r"[a-zA-Z_][a-zA-Z_0-9]*(?:\.[a-zA-Z_][a-zA-Z_0-9]*)*\Z")
NATIVE_BASENAME = re.compile(r"lib[a-zA-Z0-9_+.-]+\.so(?:\.[0-9]+)*\Z")
EXTENSION_SUFFIX = re.compile(r"(?:\.cpython-312-x86_64-linux-gnu|\.abi3)\.so\Z")
NODE_FIELDS = {"id", "kind", "path", "sha256", "requires"}
FILE_KINDS = {
    "python-executable", "elf-loader", "stdlib-module", "stdlib-package",
    "stdlib-extension", "native-library",
}
LOGICAL_KINDS = {"builtin", "frozen", "kernel-virtual"}


class DependencyManifestBlocked(ValueError):
    """The proposed dependency inventory is incomplete or inconsistent."""


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise DependencyManifestBlocked(reason)


def _sha256(value: Any) -> bool:
    return type(value) is str and HEX_SHA256.fullmatch(value) is not None


def _absolute_path(value: Any) -> bool:
    return (
        type(value) is str and value.startswith("/")
        and len(value) <= 256 and "\x00" not in value
        and all(part not in ("", ".", "..") for part in value[1:].split("/"))
    )


def _module_id(identifier: str, prefix: str) -> str:
    _require(identifier.startswith(prefix), "incorrect module identity prefix")
    name = identifier[len(prefix):]
    _require(MODULE_NAME.fullmatch(name) is not None, "invalid module identity")
    return name


def _file_path(node: dict[str, Any]) -> None:
    identifier, kind, path = node["id"], node["kind"], node["path"]
    _require(_absolute_path(path), "untrusted dependency path")
    if kind == "python-executable":
        _require(identifier == "interpreter" and path == PYTHON_PATH,
                 "unexpected interpreter location")
    elif kind == "elf-loader":
        _require(identifier == "loader" and path == LOADER_PATH,
                 "unexpected ELF loader location")
    elif kind == "stdlib-module":
        name = _module_id(identifier, "py:")
        _require(path == STDLIB_PATH + name.replace(".", "/") + ".py",
                 "unmodeled stdlib module path")
    elif kind == "stdlib-package":
        name = _module_id(identifier, "pkg:")
        _require(path == STDLIB_PATH + name.replace(".", "/") + "/__init__.py",
                 "unmodeled stdlib package path")
    elif kind == "stdlib-extension":
        name = _module_id(identifier, "ext:")
        _require("." not in name and path.startswith(EXTENSION_PATH),
                 "unmodeled extension module")
        leaf = path[len(EXTENSION_PATH):]
        _require(leaf.startswith(name + ".")
                 and EXTENSION_SUFFIX.fullmatch(leaf[len(name):]) is not None,
                 "unmodeled extension ABI or path")
    elif kind == "native-library":
        _require(identifier.startswith("lib:") and len(identifier) > 4,
                 "invalid native library identity")
        leaf = path.rsplit("/", 1)[-1]
        _require(path in {root + leaf for root in NATIVE_ROOTS}
                 and NATIVE_BASENAME.fullmatch(leaf) is not None
                 and identifier == "lib:" + leaf,
                 "native library outside reviewed path/model")


def _logical_node(node: dict[str, Any]) -> None:
    _require(node["path"] is None and node["sha256"] is None,
             "logical modules cannot claim independent file hashes")
    if node["kind"] in ("builtin", "frozen"):
        _module_id(node["id"], node["kind"] + ":")
    else:
        _require(node["kind"] == "kernel-virtual"
                 and node["id"] == "virtual:linux-vdso.so.1",
                 "unknown kernel virtual dependency")


def canonical_manifest_bytes(manifest: Any) -> bytes:
    """Canonicalize a bounded manifest, not an assertion of its provenance."""
    _require(type(manifest) is dict and set(manifest) ==
             {"schema", "platform", "nodes"}, "invalid manifest envelope")
    _require(type(manifest["nodes"]) is list
             and 2 <= len(manifest["nodes"]) <= MAX_NODES,
             "manifest node count out of bounds")
    try:
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":"),
                             ensure_ascii=True, allow_nan=False).encode("ascii")
    except (ValueError, TypeError, RecursionError, OverflowError) as exc:
        raise DependencyManifestBlocked("manifest is not canonical JSON") from exc
    _require(len(payload) <= MAX_MANIFEST_BYTES, "manifest exceeds byte bound")
    return payload


def review_dependency_manifest(
    manifest: Any, *, expected_manifest_sha256: Any,
    proposed_external_file_pins: Any,
) -> dict[str, Any]:
    """Structural only: even consistent *claims* always return BLOCKED.

    The caller-proposed edges are not independently discovered. There is no
    file I/O, module import, execution, subprocess or source-to-root handoff.
    """
    payload = canonical_manifest_bytes(manifest)
    _require(_sha256(expected_manifest_sha256)
             and hashlib.sha256(payload).hexdigest() == expected_manifest_sha256,
             "proposed manifest digest does not match")
    _require(manifest["schema"] == SCHEMA, "unknown manifest schema")
    platform = manifest["platform"]
    _require(type(platform) is dict and set(platform) ==
             {"os", "architecture", "pythonVersion", "isolationFlags"},
             "invalid platform declaration")
    _require(platform["os"] == "linux"
             and platform["architecture"] == "x86_64"
             and platform["pythonVersion"] == "3.12.3"
             and type(platform["isolationFlags"]) is list
             and platform["isolationFlags"] == ISOLATION_FLAGS,
             "unmodeled Python startup environment")

    nodes: dict[str, dict[str, Any]] = {}
    pins: dict[str, str] = {}
    path_owners: set[str] = set()
    module_origins: set[str] = set()
    edge_count = 0

    for node in manifest["nodes"]:
        _require(type(node) is dict and set(node) == NODE_FIELDS,
                 "invalid dependency node fields")
        identifier, kind = node["id"], node["kind"]
        _require(type(identifier) is str and 0 < len(identifier) <= 100
                 and identifier not in nodes, "duplicate or invalid dependency id")
        _require(type(kind) is str and kind in FILE_KINDS | LOGICAL_KINDS,
                 "unknown dependency node kind")
        requires = node["requires"]
        _require(type(requires) is list and len(requires) <= MAX_NODES
                 and all(type(x) is str and 0 < len(x) <= 100 for x in requires)
                 and len(set(requires)) == len(requires),
                 "invalid or duplicate dependency edge")
        edge_count += len(requires)
        _require(edge_count <= MAX_EDGES, "dependency graph exceeds edge bound")

        if kind in {"stdlib-module", "stdlib-package", "stdlib-extension",
                    "builtin", "frozen"}:
            module_name = identifier.split(":", 1)[-1]
            _require(module_name not in module_origins,
                     "same module name claimed by multiple origins")
            module_origins.add(module_name)

        if kind in FILE_KINDS:
            _require(_sha256(node["sha256"]), "missing or invalid file SHA-256")
            _file_path(node)
            path = node["path"]
            _require(path not in path_owners, "two dependency identities share one path")
            path_owners.add(path)
            pins[path] = node["sha256"]
        else:
            _logical_node(node)
        nodes[identifier] = node

    _require("interpreter" in nodes and nodes["interpreter"]["kind"] ==
             "python-executable" and "loader" in nodes
             and nodes["loader"]["kind"] == "elf-loader",
             "interpreter or dynamic loader missing")
    _require("loader" in nodes["interpreter"]["requires"],
             "interpreter lacks loader dependency")
    _require(type(proposed_external_file_pins) is dict
             and set(proposed_external_file_pins) == set(pins)
             and all(_sha256(value) and value == pins[path]
                     for path, value in proposed_external_file_pins.items()),
             "missing, extra or inconsistent proposed file SHA-256 pins")

    for node in nodes.values():
        _require(all(edge in nodes for edge in node["requires"]),
                 "unresolved transitive dependency")
    reached: set[str] = set()
    pending = ["interpreter", "loader"]
    while pending:
        node_id = pending.pop()
        if node_id not in reached:
            reached.add(node_id)
            pending.extend(nodes[node_id]["requires"])
    _require(len(reached) == len(nodes), "unreachable or undeclared dependency roots")

    return {
        "kind": "c5-g2-b02b4b3a-inert-dependency-manifest-v1",
        "declaredNodeCount": len(nodes),
        "declaredFileCount": len(pins),
        "declaredEdgeCount": edge_count,
        "proposedManifestSha256": expected_manifest_sha256,
        "declaredGraphStructurallyClosed": True,
        "manifestProvenanceIndependentlyAuthenticated": False,
        "fileBytesIndependentlyVerified": False,
        "pythonRuntimeDependencyClosureVerified": False,
        "dynamicImportsAndDlopenObserved": False,
        "kernelVirtualDependencyAuthenticated": False,
        "rootExecutionAttempted": False,
        "independentGuestWitnessVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
