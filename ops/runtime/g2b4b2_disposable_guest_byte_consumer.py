"""B02-B4B-2: disposable-Linux-guest ONLY synthetic byte consumer.

NO production Runtime operation, no host service, no Docker, no backup, no
permissions changes, no network and no root installation. The fixed synthetic
byte sequence is the ONLY source this harness ever compiles/executes.

This script is NOT a trusted root Bootstrap. A root guest test is forbidden
until an independent operator pins/copies and verifies its exact bytes and
confirms the separate disposable guest/snapshot/isolation (Gate 0/1).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from dataclasses import dataclass

# Separate namespace, outside /opt/sanq/runtime and outside private operator.
FIXTURE_PREFIX = "sanq-g2b4b2-lab-"
CASE_ID_RE = re.compile(r"[0-9a-f]{8}\Z")
MARKER = ".sanq-g2b4b2-synthetic-only"
MARKER_BYTES = b"SANQ_G2B4B2_DISPOSABLE_GUEST_ONLY_V1\n"
SOURCE_NAME = "synthetic.py"
SOURCE_BYTES = b"RESULT = 40 + 2\n"
SOURCE_SHA256 = "d06a312be9e44e6885f40ce1d07653101be2c6eb864955009490097a18404a8f"
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC


class GuestBoundaryBlocked(ValueError):
    """The test fixture is untrusted, ambiguous, or modified."""


def _require(ok: bool, why: str) -> None:
    if not ok:
        raise GuestBoundaryBlocked(why)


@dataclass(frozen=True, slots=True)
class SyntheticSnapshot:
    source_bytes: bytes
    device: int
    inode: int
    source_sha256: str


def _verify_file(parent_fd: int, name: str, *, uid: int, device: int,
                 mode: int, expected: bytes) -> SyntheticSnapshot:
    fd = os.open(name, FILE_FLAGS, dir_fd=parent_fd)
    try:
        before = os.fstat(fd)
        _require(stat.S_ISREG(before.st_mode) and before.st_uid == uid
                 and before.st_gid == uid and stat.S_IMODE(before.st_mode) == mode
                 and before.st_dev == device and before.st_nlink == 1
                 and before.st_size == len(expected),
                 "untrusted synthetic fixture file")
        _same_path_entry(parent_fd, name, fd)
        # Fixed tiny source or marker only; bounded read then EOF.
        captured = os.read(fd, len(expected) + 1)
        _require(captured == expected and os.read(fd, 1) == b"",
                 "unexpected or tampered fixture bytes")
        after = os.fstat(fd)
        _require((before.st_dev, before.st_ino, before.st_size,
                  before.st_mtime_ns, before.st_ctime_ns)
                 == (after.st_dev, after.st_ino, after.st_size,
                     after.st_mtime_ns, after.st_ctime_ns),
                 "fixture mutated during FD read")
        _same_path_entry(parent_fd, name, fd)
        return SyntheticSnapshot(captured, before.st_dev, before.st_ino,
                                 hashlib.sha256(captured).hexdigest())
    finally:
        os.close(fd)


def _same_path_entry(parent_fd: int, name: str, fd: int) -> None:
    actual = os.fstat(fd)
    linked = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    _require((actual.st_dev, actual.st_ino, stat.S_IFMT(actual.st_mode))
             == (linked.st_dev, linked.st_ino, stat.S_IFMT(linked.st_mode)),
             "fixture entry replaced during inspection")


def snapshot_verified_synthetic_bytes(case_id: str, *,
                                      _synthetic_uid: int | None = None
                                      ) -> SyntheticSnapshot:
    """Read exact fixed bytes only from direct /tmp private fixture.

    The UID override is for non-root offline characterization ONLY. It is
    forbidden when running as root, and is not exposed on the CLI.
    """
    _require(type(case_id) is str and CASE_ID_RE.fullmatch(case_id) is not None,
             "invalid fixed synthetic case id")
    _require(sys.platform.startswith("linux"), "Linux-only guest fixture")
    if _synthetic_uid is not None:
        _require(os.geteuid() != 0 and type(_synthetic_uid) is int
                 and _synthetic_uid == os.geteuid()
                 and _synthetic_uid == os.getegid(),
                 "synthetic UID override forbidden outside unprivileged tests")
    uid = 0 if _synthetic_uid is None else _synthetic_uid
    temp_fd = os.open("/tmp", DIR_FLAGS)
    try:
        temp_info = os.fstat(temp_fd)
        _require(stat.S_ISDIR(temp_info.st_mode)
                 and temp_info.st_uid == 0
                 and temp_info.st_gid == 0
                 and stat.S_IMODE(temp_info.st_mode) == 0o1777,
                 "/tmp is not the reviewed sticky root-owned directory")
        name = FIXTURE_PREFIX + case_id
        fixture_fd = os.open(name, DIR_FLAGS, dir_fd=temp_fd)
        try:
            fixture = os.fstat(fixture_fd)
            _require(stat.S_ISDIR(fixture.st_mode)
                     and fixture.st_dev == temp_info.st_dev
                     and fixture.st_uid == uid and fixture.st_gid == uid
                     and stat.S_IMODE(fixture.st_mode) == 0o700,
                     "untrusted synthetic private directory")
            _same_path_entry(temp_fd, name, fixture_fd)
            _verify_file(fixture_fd, MARKER, uid=uid,
                         device=fixture.st_dev, mode=0o600,
                         expected=MARKER_BYTES)
            snap = _verify_file(fixture_fd, SOURCE_NAME, uid=uid,
                                device=fixture.st_dev, mode=0o600,
                                expected=SOURCE_BYTES)
            _same_path_entry(temp_fd, name, fixture_fd)
        finally:
            os.close(fixture_fd)
    finally:
        os.close(temp_fd)
    _require(snap.source_sha256 == SOURCE_SHA256,
             "synthetic source differs from reviewed fixed digest")
    return snap


def consume_synthetic_snapshot(snapshot: SyntheticSnapshot) -> dict[str, object]:
    """Actually consume one immutable reviewed byte snapshot, not a path.

    No caller-controlled source, imports, builtins, arguments, object hooks,
    globals or arbitrary filesystem effects are permitted.
    """
    _require(type(snapshot) is SyntheticSnapshot
             and type(snapshot.source_bytes) is bytes
             and snapshot.source_bytes == SOURCE_BYTES
             and type(snapshot.source_sha256) is str
             and snapshot.source_sha256 == SOURCE_SHA256
             and hashlib.sha256(snapshot.source_bytes).hexdigest() == SOURCE_SHA256
             and type(snapshot.device) is int and snapshot.device > 0
             and type(snapshot.inode) is int and snapshot.inode > 0,
             "snapshot is not the reviewed synthetic source")
    scope: dict[str, object] = {"__builtins__": {}}
    # This is a REAL CPython compile/exec of one literal benign synthetic
    # expression only, NOT an Operator, installer or supplied Python module.
    compiled = compile(snapshot.source_bytes, "<sanq-b4b2-synthetic>", "exec")
    exec(compiled, scope, scope)
    _require(set(scope) == {"__builtins__", "RESULT"}
             and type(scope["RESULT"]) is int and scope["RESULT"] == 42,
             "unexpected synthetic consumption outcome")
    return {
        "kind": "c5-g2-b02b4b2-synthetic-byte-consumer-v1",
        "fixtureSourceSha256": SOURCE_SHA256,
        "fixtureDevice": snapshot.device,
        "fixtureInode": snapshot.inode,
        "fixedSyntheticCodeConsumed": True,
        "operatorCodeExecuted": False,
        "independentGuestIdentityAuthenticated": False,
        "bootstrapSourceIndependentlyAuthenticated": False,
        "interpreterAndDependencyClosureAuthenticated": False,
        "rootGuestExecutionIndependentlyWitnessed": False,
        "maintenanceIsolationVerified": False,
        "externalRecoveryKitVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Disposable guest fixture ONLY")
    parser.add_argument("--case-id", required=True)
    args = parser.parse_args(argv)
    # Being root is NOT proof that we are inside the reviewed isolated guest.
    # Independent VM provenance and the original script SHA pin are mandatory.
    if os.getuid() != 0 or os.geteuid() != 0 or os.getgid() != 0:
        print("BLOCKED: root-only guest CLI; independent guest approval required",
              file=sys.stderr)
        return 2
    try:
        snapshot = snapshot_verified_synthetic_bytes(args.case_id)
        receipt = consume_synthetic_snapshot(snapshot)
    except (GuestBoundaryBlocked, OSError, ValueError) as exc:
        print("BLOCKED: synthetic source verification/consumption failed: "
              + type(exc).__name__, file=sys.stderr)
        return 2
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
