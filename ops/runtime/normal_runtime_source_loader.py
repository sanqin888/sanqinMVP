"""C1-PREP-06: load the selected normal-update modules from fixed source bytes.

Only launch/update/inputs are compiled, after BOTH input pins and the complete
snapshot inventory match. Candidate imports use a private module map, never a
canonical-name cache/path fallback. Already loaded stdlib/loader prerequisites
must be trusted BEFORE this call. This is NOT a sandbox or executable bootstrap.
"""
from __future__ import annotations

import __future__ as _future
import builtins
from contextlib import contextmanager
from dataclasses import dataclass
import dataclasses
import hashlib
import json
import re
import sys
import threading
from types import MappingProxyType, ModuleType
from typing import Iterator, Mapping
import typing

from normal_runtime_inputs import PinnedInputsBlocked, parse_pinned_update_inputs
from normal_runtime_launch import canonical, digest
from normal_runtime_source_snapshot import SourceBytes, SourceSnapshot

SELECTED_MODULES = (
    "normal_runtime_launch", "normal_runtime_update", "normal_runtime_inputs",
)
_PRELOADED = MappingProxyType({
    "__future__": _future, "dataclasses": dataclasses, "hashlib": hashlib,
    "json": json, "re": re, "threading": threading, "typing": typing,
})
_REGISTRY_LOCK = threading.RLock()


class CandidateLoadBlocked(ValueError):
    pass


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise CandidateLoadBlocked(reason)


@dataclass(frozen=True)
class LoadedNormalCandidate:
    """Fixed mapping of mutable Python modules, not an execution permit."""

    request: object
    flow_type: type
    modules: Mapping[str, ModuleType]


def _verified_sources(snapshot: SourceSnapshot, parsed) -> dict[str, bytes]:
    materials = parsed.request.launch
    pins = materials.document()["sourceFiles"]
    _require(type(snapshot) is SourceSnapshot
             and type(snapshot.source_commit) is str
             and snapshot.source_commit == materials.source_commit
             and type(snapshot.launch_sha256) is str
             and snapshot.launch_sha256 == digest(parsed.launch_bytes)
             and type(snapshot.files) is tuple
             and len(snapshot.files) == len(pins),
             "snapshot does not identify the pinned launch")
    fixed = {}
    # Copy all immutable names/bytes before compiling or executing anything.
    for item in snapshot.files:
        _require(type(item) is SourceBytes, "typed source bytes required")
        name, raw, reported = item.name, item.content, item.sha256
        _require(type(name) is str and name in pins and name not in fixed
                 and type(raw) is bytes and len(raw) == pins[name]["bytes"]
                 and type(reported) is str and reported == pins[name]["sha256"]
                 and digest(raw) == pins[name]["sha256"],
                 "source inventory bytes differ from the pinned launch")
        fixed[name] = raw
    _require(set(fixed) == set(pins)
             and all(name + ".py" in fixed for name in SELECTED_MODULES),
             "selected normal-update sources are missing")
    # Directory/file metadata are observations owned by the outer FD context,
    # not proof of provenance or authority that this byte consumer can create.
    return fixed


def _compile_selected(fixed: dict[str, bytes]) -> tuple:
    compiled = []
    try:
        for name in SELECTED_MODULES:
            raw = fixed[name + ".py"]
            filename = "<sanq-pinned:" + name + ":" + digest(raw) + ">"
            compiled.append((name, compile(
                raw, filename, "exec", dont_inherit=True, optimize=0)))
    except Exception as exc:
        raise CandidateLoadBlocked("selected source compilation failed") from exc
    return tuple(compiled)


def _namespace_keys(prefix: str) -> set[str]:
    return {name for name in tuple(sys.modules)
            if type(name) is str
            and (name == prefix or name.startswith(prefix + "."))}


def _check_registry(prefix: str, modules, registered) -> None:
    _require(_namespace_keys(prefix) == set(registered)
             and all(sys.modules.get(name) is module
                 for name, module in registered.items())
             and all(getattr(registered[prefix], name, None) is module
                     for name, module in modules.items()),
             "private candidate module registry changed")


@contextmanager
def load_pinned_normal_candidate(
    snapshot: SourceSnapshot,
    launch_bytes: bytes,
    request_bytes: bytes,
    *,
    expected_launch_sha256: str,
    expected_request_sha256: str,
) -> Iterator[LoadedNormalCandidate]:
    """Consume a live reader/anchor scope's fixed bytes; never reopen paths.

    External trust in pins, bootstrap/loader/stdlib/platform and the original FD
    scope remains a caller obligation. Does not load bootstrap/unused adapters,
    call NormalUpdateFlow, authenticate evidence, or grant any real effect.
    """
    try:
        parsed = parse_pinned_update_inputs(
            launch_bytes, request_bytes,
            expected_launch_sha256=expected_launch_sha256,
            expected_request_sha256=expected_request_sha256)
    except PinnedInputsBlocked as exc:
        raise CandidateLoadBlocked("pinned candidate inputs rejected") from exc
    fixed = _verified_sources(snapshot, parsed)
    compiled = _compile_selected(fixed)
    prefix = "_sanq_candidate_" + expected_launch_sha256
    package = ModuleType(prefix)
    package.__path__ = ()
    modules = {name: ModuleType(prefix + "." + name)
               for name in SELECTED_MODULES}
    registered = {prefix: package}
    registered.update({module.__name__: module for module in modules.values()})
    ready: set[str] = set()
    active = False

    def candidate_import(name, globals=None, locals=None, fromlist=(), level=0):
        _require(active and type(name) is str and type(level) is int and level == 0,
                 "candidate import outside the active absolute-import scope")
        _check_registry(prefix, modules, registered)
        if name in modules:
            _require(name in ready, "candidate import is cyclic or out of order")
            return modules[name]
        _require(name in _PRELOADED, "unselected candidate or stdlib import")
        return _PRELOADED[name]

    for name, module in modules.items():
        setattr(package, name, module)
        module.__package__ = prefix
        module.__file__ = "<sanq-pinned:" + name + ":" + digest(fixed[name + ".py"]) + ">"
        module.__cached__ = None
        private_builtins = dict(vars(builtins))
        private_builtins["__import__"] = candidate_import
        module.__dict__["__builtins__"] = private_builtins

    try:
        with _REGISTRY_LOCK:
            _require(not _namespace_keys(prefix),
                     "candidate module namespace is already occupied")
            for name, module in registered.items():
                sys.modules[name] = module
            active = True
        try:
            for name, code in compiled:
                _check_registry(prefix, modules, registered)
                exec(code, modules[name].__dict__)
                ready.add(name)
            # Reparse with the JUST-LOADED types: no cached-vs-candidate class mix.
            decoded = modules["normal_runtime_inputs"].parse_pinned_update_inputs(
                parsed.launch_bytes, parsed.request_bytes,
                expected_launch_sha256=expected_launch_sha256,
                expected_request_sha256=expected_request_sha256)
            core = modules["normal_runtime_update"]
            launch = modules["normal_runtime_launch"]
            _require(type(decoded) is modules["normal_runtime_inputs"].PinnedUpdateInputs
                     and type(decoded.request) is core.UpdateRequest
                     and type(decoded.request.launch) is launch.LaunchMaterials
                     and canonical(decoded.request.document()) == parsed.request_bytes
                     and canonical(decoded.request.launch.document()) == parsed.launch_bytes
                     and type(core.NormalUpdateFlow) is type
                     and callable(core.NormalUpdateFlow.run),
                     "loaded modules do not share the exact pinned v1 inputs/core")
            _check_registry(prefix, modules, registered)
        except CandidateLoadBlocked:
            raise
        except Exception as exc:
            raise CandidateLoadBlocked("selected candidate initialization failed") from exc
        yield LoadedNormalCandidate(
            decoded.request, core.NormalUpdateFlow, MappingProxyType(modules))
        _check_registry(prefix, modules, registered)
    finally:
        active = False
        with _REGISTRY_LOCK:
            for name, module in reversed(tuple(registered.items())):
                if sys.modules.get(name) is module:
                    del sys.modules[name]
