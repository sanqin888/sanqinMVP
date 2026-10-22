"""A2-I synthetic Guest capture core. No field execution entry point.

Only the synthetic laboratory adapter can supervise a supplied local fixture.
The frozen strace/SYN commands are intentionally not exposed to that adapter.
A3/A4 require separately reviewed resource isolation and site authorization.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import resource
import selectors
import signal
import stat
import subprocess
import sys
import time

ROOT = Path("/tmp/sanq-c1-syn-001")
SCHEMA = "sanq.runtime.c1-syn001.capture-candidate.v1"
MAX_SECONDS = 30
MAX_SINGLE_TRACE = 4 * 1024 * 1024
MAX_RAW = 8 * 1024 * 1024
SOURCES = {
    "input.txt": (25, "8df9b096863665361212a14784dccabcc9de929bd524ec1529ed1eb2f1df6552"),
    "syn01.py": (1028, "7e5d7e810ffd1e0a2720ada15a26e9a39004fda50ecd1317c8f80c82c9974cac"),
    "syn02.py": (1641, "411fa8ebc54301c554d3380d7d778d9cd7ae176b62833a3218673b5054c7c546"),
}
ENVIRONMENT = {"HOME": str(ROOT), "PATH": "/usr/bin:/bin",
               "LANG": "C", "LC_ALL": "C", "TZ": "UTC"}
TRACE_NAMES = {"SYN-01": "syn01", "SYN-02": "syn02"}
TRACE_SUFFIX = re.compile(r"syn0[12]\.trace\.[0-9]{1,12}\Z")


class CaptureBlocked(ValueError):
    """Strict refusal without silently weakening the frozen contract."""


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def frozen_argv(scenario: str) -> tuple[str, ...]:
    if scenario not in TRACE_NAMES:
        raise CaptureBlocked("UNKNOWN_SCENARIO")
    prefix = TRACE_NAMES[scenario]
    return ("/usr/bin/strace", "-ff", "-ttt", "-T", "-yy", "-s", "128",
            "-o", str(ROOT / "raw" / (prefix + ".trace")),
            "/usr/bin/python3.12", "-I", "-S", "-B",
            str(ROOT / (prefix + ".py")), scenario)


def _private_directory(path: Path, *, uid: int) -> None:
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != uid
            or info.st_gid != os.getgid()
            or stat.S_IMODE(info.st_mode) != 0o700):
        raise CaptureBlocked("PRIVATE_DIRECTORY_INVALID")


def _read_regular(path: Path, *, uid: int, mode: int,
                  maximum: int) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != uid
                or info.st_gid != os.getgid()
                or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != mode
                or info.st_size > maximum):
            raise CaptureBlocked("FILE_IDENTITY_INVALID")
        with os.fdopen(os.dup(fd), "rb", closefd=True) as stream:
            data = stream.read(maximum + 1)
        if len(data) != info.st_size:
            raise CaptureBlocked("FILE_SIZE_CHANGED")
        return data
    finally:
        os.close(fd)


def review_source_tree(root: Path = ROOT, *, uid: int | None = None) -> dict:
    """Strict immutable source readback; never runs any source or observer."""
    if uid is None:
        uid = os.geteuid()
    if (uid == 0 or uid != os.getuid() or uid != os.geteuid()
            or os.getegid() == 0 or os.getegid() != os.getgid()):
        raise CaptureBlocked("ROOT_NOT_ALLOWED")
    _private_directory(root, uid=uid)
    if {p.name for p in root.iterdir()} != set(SOURCES):
        # Existing A2 output directory is not required by A1 and is not accepted.
        raise CaptureBlocked("SOURCE_DIRECTORY_HAS_UNEXPECTED_ENTRIES")
    items = {}
    for name, (expected_size, expected_sha) in SOURCES.items():
        data = _read_regular(root / name, uid=uid, mode=0o400,
                             maximum=expected_size)
        if len(data) != expected_size or sha256(data) != expected_sha:
            raise CaptureBlocked("SOURCE_BYTES_MISMATCH")
        items[name] = {"bytes": len(data), "sha256": expected_sha}
    return {"schema": SCHEMA, "sourceMatched": True, "files": items,
            "guestExecutionAllowed": False, "traceAuthorized": False}


def review_raw(raw: Path, *, prefix: str, uid: int,
               single_limit: int = MAX_SINGLE_TRACE,
               total_limit: int = MAX_RAW) -> dict[str, dict]:
    """Detect missing/unknown/insecure trace files. NOT a hard aggregate quota."""
    _private_directory(raw, uid=uid)
    entries = list(raw.iterdir())
    if not entries:
        raise CaptureBlocked("TRACE_FILES_MISSING")
    if len(entries) > 64:
        raise CaptureBlocked("TRACE_MEMBER_COUNT_EXCEEDED")
    details: dict[str, dict] = {}
    total = 0
    for path in entries:
        if (not path.name.startswith(prefix + ".trace.")
                or TRACE_SUFFIX.fullmatch(path.name) is None):
            raise CaptureBlocked("UNEXPECTED_RAW_MEMBER")
        info = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != uid
                or info.st_gid != os.getgid()
                or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600):
            raise CaptureBlocked("RAW_FILE_IDENTITY_INVALID")
        if info.st_size > single_limit:
            raise CaptureBlocked("SINGLE_TRACE_LIMIT_EXCEEDED")
        total += info.st_size
        if total > total_limit:
            raise CaptureBlocked("AGGREGATE_BUDGET_EXCEEDED")
        data = _read_regular(path, uid=uid, mode=0o600, maximum=single_limit)
        details[path.name] = {"bytes": len(data), "sha256": sha256(data)}
    return details


def _limit_file_size(maximum: int) -> None:
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_FSIZE, (maximum, maximum))


def _signal_group(pid: int, sig: int) -> None:
    try:
        os.killpg(pid, sig)
    except ProcessLookupError:
        pass


def _group_empty(pid: int) -> bool:
    try:
        os.killpg(pid, 0)
        return False
    except ProcessLookupError:
        return True


def _test_fixture_supervisor(argv: tuple[str, ...], output: Path, *,
                             seconds: float = 2.0,
                             total_limit: int = 256 * 1024,
                             single_limit: int = 128 * 1024) -> dict:
    """Lab-only primitive; never used by the real SYN dispatcher.

    A separate process group and exact argv are used; descendant coverage is
    NOT proven when a child calls setsid(). Aggregate checking is detection,
    NOT an atomic filesystem quota. Preserves partial output on errors.
    """
    if not (isinstance(argv, tuple) and argv and all(type(s) is str for s in argv)):
        raise CaptureBlocked("INVALID_LAB_ARGV")
    if (len(argv) != 3 or argv[0] != sys.executable or argv[1] != "-c"
            or not os.path.isabs(argv[0])):
        raise CaptureBlocked("REAL_SYN_FORBIDDEN_IN_LAB")
    if (any(word in argv[2] for word in
            ("/usr/bin/strace", "syn01.py", "syn02.py", str(ROOT)))
            or output == ROOT or ROOT in output.parents):
        raise CaptureBlocked("REAL_SYN_FORBIDDEN_IN_LAB")
    if not (0 < seconds <= MAX_SECONDS and 0 < single_limit <= MAX_SINGLE_TRACE
            and 0 < total_limit <= MAX_RAW):
        raise CaptureBlocked("INVALID_BUDGET")
    if (os.geteuid() == 0 or os.getuid() != os.geteuid()
            or os.getegid() == 0):
        raise CaptureBlocked("ROOT_NOT_ALLOWED")
    _private_directory(output, uid=os.geteuid())
    if any(output.iterdir()):
        raise CaptureBlocked("OUTPUT_NOT_EMPTY")
    raw_dir = output / "raw"
    raw_dir.mkdir(mode=0o700)
    fds = {}
    for name in ("stdout.bin", "stderr.bin"):
        fds[name] = os.open(str(raw_dir / name),
                            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                            0o600)
    process = None
    reasons: list[str] = []
    count = 0
    started = time.monotonic()
    try:
        process = subprocess.Popen(
            argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, close_fds=True, start_new_session=True,
            cwd=output, env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
            preexec_fn=lambda: _limit_file_size(single_limit))
        assert process.stdout is not None and process.stderr is not None
        with selectors.DefaultSelector() as watcher:
            watcher.register(process.stdout, selectors.EVENT_READ, "stdout.bin")
            watcher.register(process.stderr, selectors.EVENT_READ, "stderr.bin")
            while watcher.get_map() or process.poll() is None:
                if time.monotonic() - started >= seconds:
                    reasons.append("WALL_TIMEOUT")
                    break
                for key, _ in watcher.select(timeout=0.03):
                    block = os.read(key.fileobj.fileno(), 4096)
                    if not block:
                        watcher.unregister(key.fileobj)
                        key.fileobj.close()
                        continue
                    count += len(block)
                    if count > total_limit:
                        reasons.append("RAW_LIMIT_EXCEEDED_PARTIAL_RETAINED")
                        break
                    view = memoryview(block)
                    while view:
                        written = os.write(fds[key.data], view)
                        if written <= 0:
                            raise OSError("SHORT_OUTPUT_WRITE")
                        view = view[written:]
                if reasons:
                    break
        if reasons:
            _signal_group(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=0.15)
            except subprocess.TimeoutExpired:
                pass
        _signal_group(process.pid, signal.SIGKILL)  # also catches group children after leader exit
        try:
            process.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            reasons.append("PROCESS_NOT_REAPED")
        if not _group_empty(process.pid):
            reasons.append("PROCESS_GROUP_NOT_EMPTY")
        if process.returncode != 0:
            reasons.append("NONZERO_OR_SIGNAL_EXIT")
    except (OSError, subprocess.SubprocessError) as exc:
        reasons.append("LAUNCH_OR_IO_FAILED:" + type(exc).__name__)
    finally:
        if process is not None:
            _signal_group(process.pid, signal.SIGKILL)
            try:
                process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                if "PROCESS_NOT_REAPED" not in reasons:
                    reasons.append("PROCESS_NOT_REAPED")
        for fd in fds.values():
            os.close(fd)
    if {p.name for p in output.iterdir()} != {"raw"}:
        reasons.append("UNEXPECTED_LAB_OUTPUT")
    files = {}
    for name in fds:
        data = _read_regular(raw_dir / name, uid=os.geteuid(),
                             mode=0o600, maximum=total_limit)
        files[name] = {"bytes": len(data), "sha256": sha256(data)}
    receipt = {"schema": SCHEMA, "classification": "LAB_ONLY_NOT_AUTHORIZED",
               "status": "BLOCKED" if reasons else "LAB_CAPTURED_CANDIDATE_ONLY",
               "reasonCodes": sorted(set(reasons)),
               "files": files, "captureFullyPreserved": not reasons,
               "aggregateHardLimitEnforced": False,
               "detachedDescendantsExcluded": False,
               "guestExecutionAllowed": False, "traceAuthorized": False}
    evidence = (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    receipt_fd = os.open(output / "receipt.json",
                         os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        view = memoryview(evidence)
        while view:
            written = os.write(receipt_fd, view)
            if written <= 0:
                raise OSError("SHORT_RECEIPT_WRITE")
            view = view[written:]
        os.fsync(receipt_fd)
    finally:
        os.close(receipt_fd)
    return receipt


def run_scenario(*_args: object, **_kwargs: object) -> None:
    """No A3/A4 dispatch until hard quota and descendant isolation are approved."""
    raise CaptureBlocked("A2_EXECUTION_NOT_AUTHORIZED")


if __name__ == "__main__":
    sys.exit("A2_EXECUTION_NOT_AUTHORIZED: code review only; no Guest run CLI")
