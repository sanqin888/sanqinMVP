"""R1C-1: immutable proposed launch materials, never a launcher or trust proof.

Only caller-supplied bytes are hashed. No path reads, imports of supplied code,
subprocesses or privileged entry point. A later reviewed bootstrap must verify
root-private paths, source provenance, the actual platform and safety-critical
dependency/input sources under R0 D1/4.1. Unknown executable loading or path
replacement risks require targeted evidence; a full dynamic closure is not the
default baseline. This proposal implements no live loader or trust authority.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re

SOURCE_ROOT = "/root/sanq-runtime-operator/normal-update-v1"
INTERPRETER = "/usr/bin/python3.12"
FLAGS = ("-I", "-S", "-B")
ENVIRONMENT = (("HOME", "/root"), ("LANG", "C"), ("LC_ALL", "C"),
               ("PATH", "/usr/bin:/bin"), ("TZ", "UTC"))
CORE_SOURCES = {"normal_runtime_update.py", "normal_runtime_launch.py"}
SHA = re.compile(r"[0-9a-f]{40}\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
TXID = re.compile(r"[a-z0-9][a-z0-9-]{7,79}\Z")
SOURCE_NAME = re.compile(r"[a-z][a-z0-9_]{0,95}\.py\Z")


class LaunchMaterialsBlocked(ValueError):
    pass


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise LaunchMaterialsBlocked(reason)


def canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _argv(value: tuple[str, ...]) -> None:
    require(type(value) is tuple and 1 <= len(value) <= 32, "invalid argv")
    require(all(type(s) is str and 0 < len(s) <= 1024
                and all(32 <= ord(c) < 127 for c in s) for s in value),
            "invalid argv token")
    require(value[0].startswith(("/usr/bin/", "/bin/"))
            and re.fullmatch(r"/(?:usr/bin|bin)/[A-Za-z0-9][A-Za-z0-9._-]*", value[0]) is not None,
            "unreviewed executable path")


@dataclass(frozen=True)
class SourcePin:
    name: str
    sha256: str
    size: int


@dataclass(frozen=True)
class LaunchMaterials:
    source_commit: str
    transaction_id: str
    bootstrap_source: str
    sources: tuple[SourcePin, ...]
    subprocess_argvs: tuple[tuple[str, ...], ...]

    def document(self) -> dict:
        require(type(self.source_commit) is str and SHA.fullmatch(self.source_commit) is not None,
                "invalid source commit")
        require(type(self.transaction_id) is str and TXID.fullmatch(self.transaction_id) is not None,
                "invalid transaction id")
        require(type(self.sources) is tuple and 3 <= len(self.sources) <= 64,
                "invalid source inventory")
        names = []
        pins = {}
        for pin in self.sources:
            require(type(pin) is SourcePin and type(pin.name) is str
                    and SOURCE_NAME.fullmatch(pin.name) is not None,
                    "invalid source name")
            require(type(pin.sha256) is str and SHA256.fullmatch(pin.sha256) is not None
                    and type(pin.size) is int and 0 < pin.size <= 65536,
                    "invalid source pin")
            names.append(pin.name)
            pins[pin.name] = {"sha256": pin.sha256, "bytes": pin.size}
        require(names == sorted(set(names)) and CORE_SOURCES <= set(names)
                and sum(p.size for p in self.sources) <= 524288,
                "duplicate, unsorted, missing or oversized sources")
        require(type(self.bootstrap_source) is str and self.bootstrap_source in pins
                and self.bootstrap_source not in CORE_SOURCES,
                "separate pinned bootstrap source required")
        require(type(self.subprocess_argvs) is tuple and len(self.subprocess_argvs) <= 16,
                "invalid subprocess inventory")
        for argv in self.subprocess_argvs:
            _argv(argv)
        require(len(set(self.subprocess_argvs)) == len(self.subprocess_argvs),
                "duplicate subprocess declaration")
        return {
            "schema": "sanq.runtime.normal-update-launch.v1",
            "sourceCommit": self.source_commit,
            "transactionId": self.transaction_id,
            "sourceRoot": SOURCE_ROOT,
            "platform": {"os": "linux", "architecture": "x86_64", "pythonVersion": "3.12.3"},
            "sourceFiles": pins,
            "entryPoint": "normal_runtime_update.NormalUpdateFlow.run",
            "bootstrapSource": self.bootstrap_source,
            "argv": [INTERPRETER, *FLAGS, SOURCE_ROOT + "/" + self.bootstrap_source,
                     "--transaction-id", self.transaction_id],
            "environment": dict(ENVIRONMENT),
            "cwd": SOURCE_ROOT,
            "uid": 0,
            "gid": 0,
            "subprocessArgvs": [list(argv) for argv in self.subprocess_argvs],
            "sourceProvenanceAuthenticated": False,
            "dynamicDependencyClosureVerified": False,
            "launchAuthorized": False,
        }

    def sha256(self) -> str:
        return digest(canonical(self.document()))


def freeze_launch_materials(*, source_commit: str, transaction_id: str,
                            bootstrap_source: str, sources: dict[str, bytes],
                            subprocess_argvs: tuple[tuple[str, ...], ...] = ()) -> LaunchMaterials:
    """Copy metadata from bounded bytes; never compile/execute a bootstrap."""
    require(type(sources) is dict and 3 <= len(sources) <= 64,
            "invalid source bytes inventory")
    pins = []
    # Validate names before sorting; mixed keys cannot escape as a TypeError.
    require(all(type(name) is str and SOURCE_NAME.fullmatch(name) is not None
                for name in sources), "invalid source name")
    for name in sorted(sources):
        raw = sources[name]
        require(type(raw) is bytes and 0 < len(raw) <= 65536,
                "invalid source bytes")
        pins.append(SourcePin(name, digest(raw), len(raw)))
    result = LaunchMaterials(source_commit, transaction_id, bootstrap_source,
                             tuple(pins), subprocess_argvs)
    result.document()
    return result
