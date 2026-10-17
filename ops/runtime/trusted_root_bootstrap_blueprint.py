"""C5-G2 B02-B4B-1: non-executing trusted Bootstrap boundary prototype.

Only inspect immutable synthetic source and *claimed* host metadata.  Never
open an FD/path, compile/import candidate code, execute a callback, or grant
root/Runtime permissions.  This is NOT a root Bootstrap or a loader.
"""
from __future__ import annotations

import ast
import hashlib
import re
from typing import Any

from root_operator_execution_binding import (
    ExecutionBindingBlocked, HANDOFF_MODE, InertSourceMaterial,
    review_inert_handoff,
)
from root_private_source_fd import DIGEST

BOOTSTRAP_PATH = "/root/sanq-runtime-operator/bootstrap-v1/bootstrap.py"
INTERPRETER_PATH = "/usr/bin/python3.12"
STDLIB_ROOT = "/usr/lib/python3.12/"
INTERPRETER_FLAGS = ("-I", "-S", "-B")
MODULE_NAME = re.compile(r"[a-z][a-z0-9_]*\Z")
SOURCE_CLAIM_FIELDS = {
    "path", "sha256", "uid", "gid", "mode", "type",
    "hardlinks", "device", "inode",
}
INTERPRETER_FIELDS = SOURCE_CLAIM_FIELDS | {"flags"}
DEPENDENCY_FIELDS = SOURCE_CLAIM_FIELDS


class BootstrapPreflightBlocked(ValueError):
    """Synthetic Bootstrap contract is incomplete or inconsistent."""


def _require(ok: bool, why: str) -> None:
    if not ok:
        raise BootstrapPreflightBlocked(why)


def _file_claim(value: Any, *, path: str, expected_sha256: str,
                expected_mode: int) -> None:
    _require(type(value) is dict and set(value) in (
        SOURCE_CLAIM_FIELDS, INTERPRETER_FIELDS),
        "unknown or missing pinned file metadata")
    _require(type(path) is str and type(expected_sha256) is str
             and DIGEST.fullmatch(expected_sha256) is not None,
             "invalid independently proposed pin")
    _require(type(value["path"]) is str and value["path"] == path
             and type(value["sha256"]) is str
             and value["sha256"] == expected_sha256,
             "file path or claimed digest drift")
    _require(type(value["uid"]) is int and value["uid"] == 0
             and type(value["gid"]) is int and value["gid"] == 0
             and type(value["mode"]) is int and value["mode"] == expected_mode
             and type(value["type"]) is str and value["type"] == "regular"
             and type(value["hardlinks"]) is int and value["hardlinks"] == 1
             and type(value["device"]) is int and value["device"] > 0
             and type(value["inode"]) is int and value["inode"] > 0,
             "unsafe file identity claim")


def _declared_direct_imports(source: bytes) -> set[str]:
    try:
        tree = ast.parse(source.decode("utf-8"), filename="<synthetic-operator>",
                         mode="exec")
    except (UnicodeError, SyntaxError, ValueError, RecursionError) as exc:
        raise BootstrapPreflightBlocked("operator bytes cannot be parsed") from exc
    names: set[str] = set()
    # This cannot prove absence of indirect imports; runtime closure stays false.
    prohibited_call_names = {
        "__import__", "eval", "exec", "compile", "getattr", "globals",
        "locals", "vars",
    }
    prohibited_call_attrs = {
        "import_module", "run_module", "run_path", "__import__",
        "exec", "eval", "compile",
    }
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                _require("." not in alias.name,
                         "package and nested imports are not modeled")
                names.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            _require(node.level == 0 and node.module is not None
                     and "." not in node.module
                     and all(alias.name != "*" for alias in node.names),
                     "relative, package and wildcard imports are not modeled")
            names.add(node.module)
        elif isinstance(node, ast.Call):
            target = node.func
            _require(not (isinstance(target, ast.Name)
                          and target.id in prohibited_call_names)
                     and not (isinstance(target, ast.Attribute)
                              and target.attr in prohibited_call_attrs),
                     "unmodeled dynamic code or module loading")
    _require(all(MODULE_NAME.fullmatch(name) for name in names),
             "module name outside fixed stdlib-file model")
    return names


def _stdlib_file_path(name: str) -> str:
    # Deliberately limited to top-level .py modules. Packages, builtins,
    # extensions and transitive imports require a new explicit architecture
    # review and cannot silently inherit this narrow synthetic contract.
    return STDLIB_ROOT + name + ".py"


def review_trusted_bootstrap_blueprint(
    material: InertSourceMaterial, *,
    proposed_consumer_bytes: bytes,
    operator_sha256: str,
    claimed_consumer_fd_identity: dict[str, int],
    bootstrap_claim: Any,
    independently_pinned_bootstrap_sha256: str,
    interpreter_claim: Any,
    independently_pinned_interpreter_sha256: str,
    expected_direct_module_hashes: Any,
    claimed_dependency_files: Any,
) -> dict[str, Any]:
    """Review candidate handoff + synthetic static Python environment.

    Source and file identities are caller claims, not witnessed FD evidence.
    Passing all structure checks NEVER creates a callable or an authority.
    """
    try:
        review_inert_handoff(
            material, proposed_consumer_bytes=proposed_consumer_bytes,
            independently_pinned_sha256=operator_sha256,
            claimed_consumer_fd_identity=claimed_consumer_fd_identity,
            handoff_mode=HANDOFF_MODE,
        )
    except ExecutionBindingBlocked as exc:
        raise BootstrapPreflightBlocked("operator byte handoff mismatch") from exc

    _require(type(bootstrap_claim) is dict
             and set(bootstrap_claim) == SOURCE_CLAIM_FIELDS,
             "untrusted bootstrap identity fields")
    _file_claim(bootstrap_claim, path=BOOTSTRAP_PATH,
                expected_sha256=independently_pinned_bootstrap_sha256,
                expected_mode=0o600)
    _require(type(interpreter_claim) is dict
             and set(interpreter_claim) == INTERPRETER_FIELDS,
             "untrusted interpreter identity fields")
    _file_claim(interpreter_claim, path=INTERPRETER_PATH,
                expected_sha256=independently_pinned_interpreter_sha256,
                expected_mode=0o755)
    _require(type(interpreter_claim["flags"]) is tuple
             and interpreter_claim["flags"] == INTERPRETER_FLAGS,
             "unmodeled interpreter isolation flags")

    _require(type(expected_direct_module_hashes) is dict
             and type(claimed_dependency_files) is dict,
             "dependency pins/inventory must be exact dictionaries")
    names = _declared_direct_imports(material.source_bytes)
    _require(set(expected_direct_module_hashes) == names
             and set(claimed_dependency_files) == names,
             "unexpected, missing or unpinned direct import")
    for name in sorted(names):
        digest = expected_direct_module_hashes[name]
        _require(type(digest) is str and DIGEST.fullmatch(digest) is not None,
                 "direct imported module digest is not pinned")
        claim = claimed_dependency_files[name]
        _require(type(claim) is dict and set(claim) == DEPENDENCY_FIELDS,
                 "invalid claimed module file fields")
        _file_claim(claim, path=_stdlib_file_path(name),
                    expected_sha256=digest, expected_mode=0o644)

    return {
        "kind": "c5-g2-b02b4b1-inert-bootstrap-review-v1",
        "claimedBootstrapSourceIdentityConsistent": True,
        "claimedInterpreterIdentityConsistent": True,
        "claimedDirectImportFilesConsistent": True,
        "sameSyntheticByteObject": True,
        "bootstrapTrustRootAuthenticated": False,
        "operatorSourceFDIndependentlyWitnessed": False,
        "interpreterBinaryIndependentlyAuthenticated": False,
        "pythonRuntimeDependencyClosureVerified": False,
        "actualCodeConsumptionVerified": False,
        "rootExecutionAttempted": False,
        "maintenanceIsolationVerified": False,
        "externalRecoveryKitVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
