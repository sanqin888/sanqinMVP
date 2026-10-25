"""C1-PREP-09: standalone, assembly-only Python 3.12.3 bootstrap candidate.

The operator must authenticate this script, Python/stdlib and the separately
installed approval pins BEFORE starting it. Root ownership is not provenance.
No project import, sys.path change or path-based code reload is used here.
This entry never runs the update flow or grants maintenance/install authority.
"""
from __future__ import annotations

import __future__ as _future
import builtins
import contextlib
from contextlib import contextmanager, ExitStack
import dataclasses
import fcntl
import hashlib
import json
import os
import re
import stat
import sys
import threading
import types
from types import MappingProxyType, ModuleType
import typing

SOURCE_ROOT = "/root/sanq-runtime-operator/normal-update-v1"
APPROVAL_ROOT = "/root/sanq-runtime-operator/normal-update-approvals"
BOOTSTRAP_SOURCE = "normal_runtime_bootstrap.py"
SUPPORT_MODULES = (
    "normal_runtime_launch", "normal_runtime_update", "normal_runtime_inputs",
    "normal_runtime_process_check", "normal_runtime_source_snapshot",
    "normal_runtime_source_anchor", "normal_runtime_source_loader",
    "normal_runtime_candidate_scope",
)
SOURCE_NAMES = frozenset(name + ".py" for name in SUPPORT_MODULES) | {BOOTSTRAP_SOURCE}
INPUT_LIMITS = {"pins.json": 1024, "launch.json": 1_100_000, "request.json": 4096}
TXID = re.compile(r"[a-z0-9][a-z0-9-]{7,79}\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_STDLIB = MappingProxyType({
    "__future__": _future, "builtins": builtins, "contextlib": contextlib,
    "dataclasses": dataclasses, "fcntl": fcntl, "hashlib": hashlib,
    "json": json, "os": os, "re": re, "stat": stat, "sys": sys,
    "threading": threading, "types": types, "typing": typing,
})
_REGISTRY_LOCK = threading.RLock()


class BootstrapBlocked(ValueError):
    pass


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise BootstrapBlocked(reason)


def _canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _object(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate bootstrap input key")
        result[key] = value
    return result


def _integer(token):
    _require(len(token) <= 20, "excessive bootstrap input integer")
    return int(token)


def _reject_number(token):
    raise BootstrapBlocked("unsupported bootstrap input number")


def _document(raw: bytes) -> dict:
    value = json.loads(raw.decode("ascii"), object_pairs_hook=_object,
                       parse_int=_integer, parse_float=_reject_number,
                       parse_constant=_reject_number)
    _require(type(value) is dict and _canonical(value) == raw,
             "bootstrap input is not an exact canonical object")
    return value


def _observe_process() -> dict:
    return {
        "platform": sys.platform, "machine": os.uname().machine,
        "version": tuple(sys.version_info), "executable": sys.executable,
        "ids": (os.getuid(), os.geteuid(), os.getgid(), os.getegid()),
        "argv": tuple(sys.argv), "originalArgv": tuple(sys.orig_argv),
        "environment": dict(os.environ), "cwd": os.getcwd(),
        "flags": {name: getattr(sys.flags, name) for name in (
            "isolated", "ignore_environment", "no_site", "no_user_site",
            "dont_write_bytecode", "safe_path", "optimize")},
    }


def _require_process(transaction_id: str) -> None:
    argv = (SOURCE_ROOT + "/" + BOOTSTRAP_SOURCE, "--transaction-id", transaction_id)
    expected = {
        "platform": "linux", "machine": "x86_64",
        "version": (3, 12, 3, "final", 0), "executable": "/usr/bin/python3.12",
        "ids": (0, 0, 0, 0), "argv": argv,
        "originalArgv": ("/usr/bin/python3.12", "-I", "-S", "-B", *argv),
        "environment": {"HOME": "/root", "LANG": "C", "LC_ALL": "C",
                        "PATH": "/usr/bin:/bin", "TZ": "UTC"},
        "cwd": SOURCE_ROOT,
        "flags": {"isolated": 1, "ignore_environment": 1, "no_site": 1,
                  "no_user_site": 1, "dont_write_bytecode": 1,
                  "safe_path": True, "optimize": 0},
    }
    _require(_canonical(_observe_process()) == _canonical(expected),
             "bootstrap process differs from the approved v1 invocation")


def _owners(info) -> bool:
    return info.st_uid == 0 and info.st_gid == 0


def _directory_key(info) -> tuple:
    _require(stat.S_ISDIR(info.st_mode) and _owners(info)
             and stat.S_IMODE(info.st_mode) & (0o022 | 0o7000) == 0
             and bool(info.st_mode & stat.S_IXUSR)
             and info.st_dev > 0 and info.st_ino > 0 and info.st_nlink > 0,
             "unsafe bootstrap ancestor")
    # Unrelated changes in a parent directory do not invalidate its identity.
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid)


def _file_key(info, device: int, limit: int) -> tuple:
    _require(stat.S_ISREG(info.st_mode) and _owners(info)
             and stat.S_IMODE(info.st_mode) in (0o400, 0o600)
             and info.st_nlink == 1 and info.st_dev == device
             and info.st_ino > 0 and 0 < info.st_size <= limit,
             "unsafe or oversized bootstrap file")
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_size, info.st_nlink, info.st_mtime_ns, info.st_ctime_ns)


def _open_namespace_root() -> int:
    return os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)


def _inventory(fd: int, names: frozenset) -> None:
    os.lseek(fd, 0, os.SEEK_SET)
    seen = set()
    with os.scandir(fd) as entries:
        for item in entries:
            _require(item.name in names and item.name not in seen,
                     "unexpected bootstrap directory entry")
            seen.add(item.name)
    _require(seen == names, "incomplete bootstrap directory")


def _recheck(directories, files, limits) -> None:
    device = directories[0][2][0]
    for index, (name, fd, expected) in enumerate(directories):
        _require(_directory_key(os.fstat(fd)) == expected,
                 "held bootstrap ancestor changed")
        if index:
            entry = os.stat(name, dir_fd=directories[index - 1][1], follow_symlinks=False)
            _require(_directory_key(entry) == expected,
                     "bootstrap ancestor entry changed")
    leaf = directories[-1][1]
    _inventory(leaf, frozenset(limits))
    for name, fd, expected in files:
        _require(_file_key(os.fstat(fd), device, limits[name]) == expected
                 and _file_key(os.stat(name, dir_fd=leaf, follow_symlinks=False),
                               device, limits[name]) == expected,
                 "bootstrap file or directory entry changed")


@contextmanager
def _capture_private_tree(path: str, limits: dict):
    """Internal fixed-path reader; no public owner/root/path override."""
    owned = []
    try:
        root = _open_namespace_root()
        _require(type(root) is int and root >= 0, "invalid bootstrap root descriptor")
        owned.append(root)
        directories = [("", root, _directory_key(os.fstat(root)))]
        device = directories[0][2][0]
        for name in path[1:].split("/"):
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
                         | os.O_CLOEXEC, dir_fd=directories[-1][1])
            owned.append(fd)
            key = _directory_key(os.fstat(fd))
            _require(key[0] == device, "bootstrap ancestry crosses devices")
            directories.append((name, fd, key))
        leaf = directories[-1][1]
        _require(stat.S_IMODE(os.fstat(leaf).st_mode) == 0o700,
                 "bootstrap leaf directory is not private")
        _inventory(leaf, frozenset(limits))
        files, fixed = [], {}
        for name in sorted(limits):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC
                         | os.O_NONBLOCK, dir_fd=leaf)
            owned.append(fd)
            key = _file_key(os.fstat(fd), device, limits[name])
            files.append((name, fd, key))
            chunks, offset = [], 0
            while offset < key[5]:
                block = os.pread(fd, min(8192, key[5] - offset), offset)
                _require(bool(block), "bootstrap input read ended early")
                chunks.append(block)
                offset += len(block)
            _require(os.pread(fd, 1, offset) == b"", "bootstrap input grew during read")
            fixed[name] = b"".join(chunks)
        _recheck(directories, files, limits)
        yield MappingProxyType(fixed)
        _recheck(directories, files, limits)
    finally:
        original_error = sys.exc_info()[0] is not None
        close_failed = False
        for fd in reversed(owned):
            try:
                os.close(fd)
            except OSError:
                close_failed = True
        if close_failed and not original_error:
            raise BootstrapBlocked("bootstrap descriptor cleanup failed")


def _approved_inputs(fixed, transaction_id: str):
    pins = _document(fixed["pins.json"])
    _require(set(pins) == {"schema", "transactionId", "launchSha256", "requestSha256"}
             and pins["schema"] == "sanq.runtime.normal-update-bootstrap-pins.v1"
             and pins["transactionId"] == transaction_id,
             "bootstrap approval identity differs")
    for key, name in (("launchSha256", "launch.json"), ("requestSha256", "request.json")):
        expected = pins[key]
        _require(type(expected) is str and SHA256.fullmatch(expected) is not None
                 and expected != "0" * 64 and _digest(fixed[name]) == expected,
                 "bootstrap input differs from the installed approval pin")
    launch = _document(fixed["launch.json"])
    _require(launch.get("transactionId") == transaction_id
             and launch.get("bootstrapSource") == BOOTSTRAP_SOURCE
             and launch.get("sourceRoot") == SOURCE_ROOT
             and launch.get("platform") == {
                 "os": "linux", "architecture": "x86_64", "pythonVersion": "3.12.3"}
             and launch.get("subprocessArgvs") == [],
             "unsupported bootstrap candidate")
    inventory = launch.get("sourceFiles")
    _require(type(inventory) is dict and set(inventory) == SOURCE_NAMES,
             "bootstrap support inventory differs")
    limits = {}
    for name, pin in inventory.items():
        _require(type(pin) is dict and set(pin) == {"sha256", "bytes"}
                 and type(pin["sha256"]) is str and SHA256.fullmatch(pin["sha256"]) is not None
                 and type(pin["bytes"]) is int and 0 < pin["bytes"] <= 65536,
                 "invalid bootstrap source pin")
        limits[name] = pin["bytes"]
    _require(sum(limits.values()) <= 524288, "oversized bootstrap source inventory")
    return pins, inventory, limits


def _namespace_keys(prefix: str) -> set:
    return {name for name in tuple(sys.modules) if type(name) is str
            and (name == prefix or name.startswith(prefix + "."))}


@contextmanager
def _load_support(fixed, launch_sha256: str):
    """Private imports consume verified bytes; canonical module caches are unused."""
    try:
        compiled = tuple((name, compile(fixed[name + ".py"],
                             "<sanq-bootstrap:" + name + ":" + _digest(fixed[name + ".py"]) + ">",
                             "exec", dont_inherit=True, optimize=0)) for name in SUPPORT_MODULES)
    except Exception as exc:
        raise BootstrapBlocked("bootstrap support compilation failed") from exc
    prefix = "_sanq_bootstrap_" + launch_sha256
    package = ModuleType(prefix)
    package.__path__ = ()
    modules = {name: ModuleType(prefix + "." + name) for name in SUPPORT_MODULES}
    registered = {prefix: package, **{module.__name__: module for module in modules.values()}}
    ready, active = set(), False

    def check_registry():
        _require(_namespace_keys(prefix) == set(registered)
                 and all(sys.modules.get(name) is module for name, module in registered.items())
                 and all(getattr(package, name, None) is module for name, module in modules.items()),
                 "bootstrap support registry changed")

    def support_import(name, globals=None, locals=None, fromlist=(), level=0):
        _require(active and type(name) is str and type(level) is int and level == 0,
                 "bootstrap import outside its active scope")
        check_registry()
        if name in modules:
            _require(name in ready, "cyclic or premature bootstrap support import")
            return modules[name]
        _require(name in _STDLIB, "unselected bootstrap support import")
        return _STDLIB[name]

    for name, module in modules.items():
        setattr(package, name, module)
        module.__package__ = prefix
        module.__file__ = "<sanq-bootstrap:" + name + ":" + _digest(fixed[name + ".py"]) + ">"
        module.__cached__ = None
        module.__dict__["__builtins__"] = {**vars(builtins), "__import__": support_import}
    try:
        with _REGISTRY_LOCK:
            _require(not _namespace_keys(prefix), "bootstrap support namespace is occupied")
            active = True
            for name, module in registered.items():
                sys.modules[name] = module
        for name, code in compiled:
            check_registry()
            exec(code, modules[name].__dict__)
            ready.add(name)
        check_registry()
        yield MappingProxyType(modules)
        check_registry()
    finally:
        if active:
            active = False
            with _REGISTRY_LOCK:
                for name, module in reversed(tuple(registered.items())):
                    if sys.modules.get(name) is module:
                        del sys.modules[name]


@contextmanager
def assemble_approved_normal_candidate(transaction_id: str):
    """Read already-approved control files and assemble the existing fixed core.

    The fixed approval store is provisioned externally, never by this entry.
    Its pins are not a signature, admission ledger or proof of their own source.
    All source/input path rechecks and FD closure precede caller entry. Only
    the private Python module scopes stay open until the caller exits.
    """
    _require(type(transaction_id) is str and TXID.fullmatch(transaction_id) is not None,
             "invalid bootstrap transaction")
    _require_process(transaction_id)
    with ExitStack() as modules:
        with _capture_private_tree(APPROVAL_ROOT + "/" + transaction_id, INPUT_LIMITS) as inputs:
            pins, inventory, limits = _approved_inputs(inputs, transaction_id)
            with _capture_private_tree(SOURCE_ROOT, limits) as sources:
                _require(all(len(sources[name]) == pin["bytes"]
                             and _digest(sources[name]) == pin["sha256"]
                             for name, pin in inventory.items()),
                         "bootstrap source bytes differ from the approved launch")
                support = modules.enter_context(_load_support(sources, pins["launchSha256"]))
                assembled = modules.enter_context(
                    support["normal_runtime_candidate_scope"].assemble_pinned_normal_candidate(
                        inputs["launch.json"], inputs["request.json"],
                        expected_launch_sha256=pins["launchSha256"],
                        expected_request_sha256=pins["requestSha256"]))
        # Both protected file scopes have rechecked and closed BEFORE publication.
        yield assembled


def main(argv=None) -> int:
    """The unchanged v1 argv selects a transaction; there is no execute mode."""
    try:
        args = tuple(sys.argv[1:] if argv is None else argv)
        _require(len(args) == 2 and args[0] == "--transaction-id",
                 "expected one bootstrap transaction")
        with assemble_approved_normal_candidate(args[1]) as candidate:
            report = {
                "schema": "sanq.runtime.normal-update-bootstrap-result.v1",
                "status": "CANDIDATE_ASSEMBLED", "mode": "ASSEMBLY_ONLY",
                "transactionId": args[1],
                "sourceCommit": candidate.loaded.request.launch.source_commit,
                "launchMaterialsSha256": candidate.sources.source_snapshot.launch_sha256,
                "requestSha256": _digest(_canonical(candidate.loaded.request.document())),
                "sourceProvenanceAuthenticated": False, "flowInvoked": False,
                "launchAuthorized": False, "readyToInstall": False,
                "authorizedToMutateProduction": False, "decision": "BLOCKED",
            }
        # A registry/FD failure must not be followed by a successful stdout record.
        print(_canonical(report).decode("ascii"))
        return 0
    except (Exception, KeyboardInterrupt, SystemExit) as exc:
        print(_canonical({"status": "BLOCKED", "failureType": type(exc).__name__[:80],
                          "flowInvoked": False, "authorizedToMutateProduction": False,
                          "decision": "BLOCKED"}).decode("ascii"), file=sys.stderr)
        return 130 if isinstance(exc, KeyboardInterrupt) else 2


if __name__ == "__main__":
    sys.exit(main())
