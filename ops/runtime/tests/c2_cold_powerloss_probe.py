#!/usr/bin/env python3
"""C5-U2D-2B2-C: operator-only, disposable VM fault-barrier probe.

PREPARATION SOURCE ONLY. No host power-off, recovery, cleanup or production entry.
Must be independently reviewed/hash-verified before root-private installation.
Run only with /usr/bin/python3 -I -B on SanQ-Cold-Recovery-Test.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import stat
import sys
import tempfile

GUEST_HOSTNAME = "sanq-cold-recovery-test"
SOURCE_ROOT = Path("/root/sanq-u2d2b-pin-956549d3")
BASELINE = Path("/var/lib/sanq-c5-u2d2c/verified-baseline.tar.gz")
BASELINE_SHA256 = "78023e504b1fcd423303d808306f2bd21307c5040a41e8eb6f39852c0de10986"
PREPARED = ".c2-fault-probe.json"
CHECKPOINTS = (
    "pending_journal_before_parent_fsync",
    "after_journal",
    "after_exchange_before_parent_fsync",
    "after_exchange",
    "after_exchange_journal",
    "after_retained",
    "after_final_journal",
)


class ProbeBlocked(ValueError):
    """The requested operation violates the isolated operator-test boundary."""


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ProbeBlocked(message)


def private_file(path: Path, mode: int) -> os.stat_result:
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_gid == 0
            and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == mode,
            "root-private file owner/mode/type invalid")
    return info


def guard_host_and_source() -> None:
    require(sys.platform == "linux" and os.geteuid() == 0,
            "Linux root required on isolated guest")
    require(socket.gethostname() == GUEST_HOSTNAME, "wrong disposable VM hostname")
    require(sys.flags.isolated == 1 and sys.dont_write_bytecode,
            "invoke with /usr/bin/python3 -I -B")
    script = Path(__file__).absolute()
    require(script == SOURCE_ROOT / "ops/runtime/tests/c2_cold_powerloss_probe.py",
            "script must be installed under pinned root-private source")
    for directory in (
        SOURCE_ROOT,
        SOURCE_ROOT / "ops",
        SOURCE_ROOT / "ops/runtime",
        SOURCE_ROOT / "ops/runtime/tests",
        SOURCE_ROOT / "ops/release",
    ):
        info = directory.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
                and info.st_gid == 0 and stat.S_IMODE(info.st_mode) == 0o700,
                "source directory not root-private")
    private_file(script, 0o600)
    archive_dir = BASELINE.parent.lstat()
    require(stat.S_ISDIR(archive_dir.st_mode) and archive_dir.st_uid == 0
            and archive_dir.st_gid == 0
            and stat.S_IMODE(archive_dir.st_mode) == 0o700,
            "persistent baseline directory untrusted")
    meta = private_file(BASELINE, 0o600)
    require(meta.st_size <= 32 * 1024 * 1024, "baseline archive unexpectedly large")
    digest = hashlib.sha256(BASELINE.read_bytes()).hexdigest()
    require(digest == BASELINE_SHA256, "baseline hash mismatch")
    require(os.stat("/tmp").st_dev == os.stat(BASELINE.parent).st_dev,
            "lab /tmp must share disposable ext4 device with baseline")


def modules():
    # Only import repository helpers after validating the root-private host/source.
    test_dir = SOURCE_ROOT / "ops/runtime/tests"
    runtime_dir = SOURCE_ROOT / "ops/runtime"
    sys.path.insert(0, str(runtime_dir))
    sys.path.insert(0, str(test_dir))
    import test_offline_root_private_installer as fixture  # noqa: PLC0415
    from build_bundle import encode_bundle  # noqa: PLC0415
    return fixture, encode_bundle


def prepare(checkpoint: str) -> None:
    fixture, encode_bundle = modules()
    operator = fixture.operator
    # mkdtemp uses a brand-new, root-private direct /tmp entry. NEVER cleanup.
    lab = Path(tempfile.mkdtemp(prefix=operator.PREFIX, dir="/tmp"))
    operator._write(lab / operator.MARKER, operator.MARKER_CONTENT)
    for name in ("live", "stage", "retained", "recovery", "proof"):
        (lab / name).mkdir(mode=0o700)
    old_files, new_files = fixture.members(fixture.OLD), fixture.members(fixture.NEW)
    operator._build_tree(lab / "live", "runtime", old_files,
                         fixture.manifest(fixture.OLD, old_files), fixture.dynamic())
    archive = encode_bundle(new_files, fixture.manifest(fixture.NEW, new_files))
    operator._write(lab / "proof" / operator.ARCHIVE, archive)
    operator._write(
        lab / "proof" / PREPARED,
        (json.dumps({
            "schemaVersion": 1,
            "checkpoint": checkpoint,
            "hostname": GUEST_HOSTNAME,
            "syntheticArchiveVerifierOnly": True,
            "productionActivationAuthorized": False,
        }, sort_keys=True) + "\n").encode(),
    )
    for child in ("live", "stage", "retained", "recovery", "proof"):
        operator._sync_dir(lab / child)
    operator._sync_dir(lab)
    operator._sync_dir(Path("/tmp"))
    operator._guard(lab)
    operator._source_tree(lab / "live" / "runtime",
                          with_dynamic=True, sha=fixture.OLD)
    print(f"PREPARED checkpoint={checkpoint} lab={lab}", flush=True)
    print("NO POWER-LOSS ACTION WAS EXECUTED", flush=True)


def hold(lab: Path) -> None:
    fixture, _ = modules()
    operator = fixture.operator
    operator._guard(lab)  # retains the original direct /tmp restriction
    record = json.loads(operator._read(lab / "proof" / PREPARED, max_bytes=1024))
    require(isinstance(record, dict)
            and record.get("schemaVersion") == 1
            and record.get("checkpoint") in CHECKPOINTS
            and record.get("hostname") == GUEST_HOSTNAME
            and record.get("syntheticArchiveVerifierOnly") is True
            and record.get("productionActivationAuthorized") is False,
            "fault probe preparation marker invalid")
    checkpoint = record["checkpoint"]
    require(not any(p.exists() or p.is_symlink() for p in (
        lab / operator.JOURNAL,
        lab / operator.JOURNAL_NEXT,
        lab / "stage" / "candidate",
        lab / "recovery" / "preimage",
        lab / "retained" / "previous",
    )), "lab already used; never reuse incident fixture")
    operator._source_tree(lab / "live" / "runtime",
                          with_dynamic=True, sha=fixture.OLD)

    def barrier() -> None:
        # A network/TTY signal only. Do NOT fsync, sync, or write a marker at a
        # pre-fsync boundary; that could change the durability under test.
        print(f"FAULT_READY checkpoint={checkpoint} lab={lab}", flush=True)
        os.kill(os.getpid(), signal.SIGSTOP)
        # If resumed rather than cold-powered-off, fail closed; never continue.
        raise ProbeBlocked("paused operator resumed; refuse to advance transaction")

    original_stop = operator._stop
    original_exchange = operator._exchange
    original_sync_dir = operator._sync_dir

    def stop_at_barrier(point: str, requested: str | None) -> None:
        if point == checkpoint:
            barrier()
        original_stop(point, requested)

    def exchange_then_barrier(live_fd: int, stage_fd: int) -> None:
        original_exchange(live_fd, stage_fd)
        barrier()  # before BOTH parent fsync calls

    def sync_except_pending_journal(path: Path) -> None:
        if (path == lab and checkpoint == "pending_journal_before_parent_fsync"
                and (lab / operator.JOURNAL).is_file()):
            barrier()  # after journal replace, before root parent fsync
        original_sync_dir(path)

    operator._stop = stop_at_barrier
    if checkpoint == "after_exchange_before_parent_fsync":
        operator._exchange = exchange_then_barrier
    if checkpoint == "pending_journal_before_parent_fsync":
        operator._sync_dir = sync_except_pending_journal

    operator.run_offline_operator_handoff(
        lab, old_sha=fixture.OLD, new_sha=fixture.NEW,
        archive_verifier=fixture.trusted_in_fixture,
        stop_at=checkpoint,
    )
    raise ProbeBlocked("checkpoint not reached; fail closed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    prep = actions.add_parser("prepare", help="write fresh synthetic /tmp fixture")
    prep.add_argument("--checkpoint", choices=CHECKPOINTS, required=True)
    probe = actions.add_parser("hold", help="PAUSE root transaction; separate approval required")
    probe.add_argument("--lab", required=True)
    probe.add_argument("--ack-disposable-root-probe", required=True,
                       choices=("REVIEWED_C2_FAULT_WINDOW",))
    args = parser.parse_args()
    try:
        guard_host_and_source()
        if args.action == "prepare":
            prepare(args.checkpoint)
        else:
            hold(Path(args.lab))
        return 0
    except (ProbeBlocked, OSError, ValueError) as exc:
        print(f"BLOCKED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
