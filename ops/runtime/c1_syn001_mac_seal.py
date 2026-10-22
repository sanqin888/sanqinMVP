"""A2-I Mac-only offline evidence sealing. No SSH, VM or Guest execution.

Integrity checks are not a proof of origin. An independently supplied receipt
SHA256 is required before creating a private, no-overwrite local evidence copy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

SCHEMA = "sanq.runtime.c1-syn001.mac-seal.v1"
RECEIPT = "receipt.json"
MAX_RECEIPT_BYTES = 64 * 1024
MAX_MEMBER_BYTES = 4 * 1024 * 1024
MAX_RAW_BYTES = 8 * 1024 * 1024
MAX_MEMBERS = 64
RAW_NAMES = re.compile(r"(?:stdout|stderr)\.bin|syn0[12]\.trace\.[0-9]{1,12}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")


class SealBlocked(ValueError):
    pass


def _private_dir(path: Path, uid: int) -> None:
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != uid
            or info.st_gid != os.getgid()
            or stat.S_IMODE(info.st_mode) != 0o700):
        raise SealBlocked("PRIVATE_DIRECTORY_INVALID")


def _read_file(path: Path, uid: int, maximum: int) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != uid
                or info.st_gid != os.getgid()
                or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) not in (0o400, 0o600)
                or info.st_size > maximum):
            raise SealBlocked("FILE_UNSAFE_OR_TOO_LARGE")
        with os.fdopen(os.dup(fd), "rb") as stream:
            data = stream.read(maximum + 1)
        if len(data) != info.st_size:
            raise SealBlocked("FILE_CHANGED_DURING_READ")
        if os.fstat(fd).st_size != info.st_size:
            raise SealBlocked("FILE_CHANGED_DURING_READ")
        return data
    finally:
        os.close(fd)


def inspect_candidate(source: Path, *, expected_receipt_sha256: str) -> dict:
    """Read an exact prepared local evidence directory without changing it."""
    if SHA.fullmatch(expected_receipt_sha256) is None:
        raise SealBlocked("EXTERNAL_RECEIPT_PIN_REQUIRED")
    if source.is_absolute() is False or source == Path("/"):
        raise SealBlocked("SOURCE_MUST_BE_ABSOLUTE")
    uid = os.getuid()
    _private_dir(source, uid)
    if {p.name for p in source.iterdir()} != {RECEIPT, "raw"}:
        raise SealBlocked("UNEXPECTED_SOURCE_ENTRIES")
    _private_dir(source / "raw", uid)
    receipt = _read_file(source / RECEIPT, uid, MAX_RECEIPT_BYTES)
    if hashlib.sha256(receipt).hexdigest() != expected_receipt_sha256:
        raise SealBlocked("RECEIPT_PIN_MISMATCH")
    try:
        parsed = json.loads(receipt)
    except (ValueError, UnicodeError) as exc:
        raise SealBlocked("RECEIPT_INVALID_JSON") from exc
    if not isinstance(parsed, dict) or parsed.get("schema") != "sanq.runtime.c1-syn001.capture-candidate.v1":
        raise SealBlocked("RECEIPT_SCHEMA_MISMATCH")
    # A received source receipt must not confer authority via self-asserted fields.
    if (parsed.get("guestExecutionAllowed") is not False
            or parsed.get("traceAuthorized") is not False):
        raise SealBlocked("RECEIPT_AUTHORITY_CLAIM")
    members = sorted((source / "raw").iterdir(), key=lambda p: p.name)
    if (len(members) > MAX_MEMBERS
            or not {"stdout.bin", "stderr.bin"}.issubset({p.name for p in members})):
        raise SealBlocked("REQUIRED_STREAMS_MISSING")
    data = {RECEIPT: receipt}
    total = 0
    manifest = {}
    for item in members:
        if not RAW_NAMES.fullmatch(item.name):
            raise SealBlocked("UNKNOWN_RAW_MEMBER")
        raw = _read_file(item, uid, MAX_MEMBER_BYTES)
        total += len(raw)
        if total > MAX_RAW_BYTES:
            raise SealBlocked("AGGREGATE_RAW_BUDGET_EXCEEDED")
        key = "raw/" + item.name
        data[key] = raw
        manifest[key] = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    declared = parsed.get("files")
    if (type(declared) is not dict
            or set(declared) != {key.split("/", 1)[1] for key in manifest}):
        raise SealBlocked("RECEIPT_FILE_MANIFEST_MISMATCH")
    for rel, details in manifest.items():
        if declared[rel.split("/", 1)[1]] != details:
            raise SealBlocked("RECEIPT_FILE_BYTES_MISMATCH")
    return {"schema": SCHEMA, "sourceReceiptSha256": expected_receipt_sha256,
            "members": manifest, "rawBytes": total,
            "classification": "UNTRUSTED_LOCAL_RAW_MATCHES_PIN_ONLY",
            "guestExecutionAllowed": False, "traceAuthorized": False,
            "_raw": data}


def _exclusive_write(path: Path, raw: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)


def seal(source: Path, private_parent: Path, *, expected_receipt_sha256: str) -> dict:
    """Exclusive local-only sealing; preserves partial destination if anything fails."""
    if private_parent.is_absolute() is False:
        raise SealBlocked("DESTINATION_MUST_BE_ABSOLUTE")
    _private_dir(private_parent, os.getuid())
    result = inspect_candidate(source, expected_receipt_sha256=expected_receipt_sha256)
    payload = result.pop("_raw")
    if private_parent == source or source in private_parent.parents:
        raise SealBlocked("OVERLAPPING_DESTINATION")
    folder = private_parent / ("A2-CAPTURE-SEAL-" + expected_receipt_sha256[:16])
    try:
        folder.mkdir(mode=0o700)
    except FileExistsError as exc:
        raise SealBlocked("DESTINATION_ALREADY_EXISTS") from exc
    # No rollback/auto cleanup: partial work must remain visible.
    (folder / "raw").mkdir(mode=0o700)
    hashes = {}
    for rel, data in sorted(payload.items()):
        _exclusive_write(folder / rel, data)
        if hashlib.sha256(_read_file(folder / rel, os.getuid(), max(len(data), 1))).digest() != hashlib.sha256(data).digest():
            raise SealBlocked("DESTINATION_READBACK_MISMATCH")
        hashes[rel] = hashlib.sha256(data).hexdigest()
    review = {k: v for k, v in result.items() if not k.startswith("_")}
    encoded = (json.dumps(review, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode()
    _exclusive_write(folder / "seal-review.json", encoded)
    hashes["seal-review.json"] = hashlib.sha256(encoded).hexdigest()
    lines = "".join(digest + "  " + name + "\n" for name, digest in sorted(hashes.items()))
    _exclusive_write(folder / "SHA256SUMS.txt", lines.encode("ascii"))
    return {"status": "SEALED_LOCAL_INTEGRITY_ONLY", "path": str(folder),
            "files": len(hashes), "sourceReceiptSha256": expected_receipt_sha256,
            "siteAuthenticated": False, "executionAuthorized": False}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline local-only A2 receipt sealing")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--expected-receipt-sha256", required=True)
    args = parser.parse_args(argv)
    parent = Path.home() / "sanq-r1c-private"
    # Never create the privacy container implicitly.
    try:
        result = seal(args.source, parent,
                      expected_receipt_sha256=args.expected_receipt_sha256)
    except (OSError, SealBlocked) as exc:
        print("BLOCKED: " + type(exc).__name__ + ": " + str(exc), file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
