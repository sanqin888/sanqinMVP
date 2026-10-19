"""R1 S1 operator-side Ubuntu Archive signature evidence collector.

OFF-PRODUCTION, explicit CLI only. Never part of Runtime bundle/installer.
A successful gpgv result is a property of a *provided* keyring; it does NOT
independently certify that keyring, the Guest, or package provenance.
No Guest/root/VM access, APT operations, package downloads, or production writes.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import urllib.error
import urllib.request

ARCHIVE_BASE = "https://archive.ubuntu.com/ubuntu/dists/"
POCKETS = ("noble", "noble-updates", "noble-security")
ARCHIVE_FPRS = frozenset({
    "790BC7277767219C42C86F933B4FE6ACC0B21F32",
    "F6ECB3762474EDA9D21B7022871920D1991BC93C",
})
MAX_KEYRING = 1024 * 1024
MAX_RELEASE = 256 * 1024
MAX_SIGNATURE = 32 * 1024
SHA_RE = re.compile(r"[a-f0-9]{64}\Z")
PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
SCHEMA = "sanq.c5.g2.r1.s1.ubuntu-archive-signature-evidence.v1"


class S1Blocked(ValueError):
    pass


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise S1Blocked(reason)


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _read_keyring(path: str, expected_sha256: str) -> bytes:
    _require(type(expected_sha256) is str
             and SHA_RE.fullmatch(expected_sha256) is not None,
             "keyring hash must be pre-approved lowercase SHA256")
    _require(os.path.isabs(path), "keyring path must be absolute")
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        _require(stat.S_ISREG(info.st_mode)
                 and info.st_uid in (0, os.getuid())
                 and stat.S_IMODE(info.st_mode) & 0o022 == 0
                 and 0 < info.st_size <= MAX_KEYRING,
                 "untrusted or oversized keyring inode")
        raw = os.read(fd, MAX_KEYRING + 1)
        _require(0 < len(raw) <= MAX_KEYRING
                 and len(raw) == info.st_size
                 and os.fstat(fd).st_size == info.st_size,
                 "keyring changed during read")
        _require(_digest(raw) == expected_sha256,
                 "keyring bytes differ from independently approved SHA256")
        return raw
    finally:
        os.close(fd)


def _private_dir(path: str) -> Path:
    _require(os.path.isabs(path), "evidence directory must be absolute")
    evidence = Path(path)
    parent = evidence.parent
    info = os.lstat(parent)
    _require(stat.S_ISDIR(info.st_mode)
             and info.st_uid == os.getuid()
             and stat.S_IMODE(info.st_mode) & 0o077 == 0,
             "parent must be a pre-existing user-owned private directory")
    _require(not evidence.exists() and not evidence.is_symlink(),
             "refuse existing evidence directory")
    evidence.mkdir(mode=0o700)
    return evidence


def _write_new(directory: Path, filename: str, raw: bytes) -> None:
    _require(filename in ("trusted-keyring.gpg", "Release", "Release.gpg",
                         "gpgv.stdout", "gpgv.stderr", "receipt.json"),
             "unexpected evidence file")
    fd = os.open(str(directory / filename),
                 os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as file:
        file.write(raw)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise S1Blocked("archive redirect forbidden")


def _download(pocket: str, filename: str, max_bytes: int) -> bytes:
    _require(pocket in POCKETS
             and filename in ("Release", "Release.gpg"),
             "unsupported repository object")
    url = ARCHIVE_BASE + pocket + "/" + filename
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect)
    with opener.open(urllib.request.Request(url), timeout=20) as response:
        _require(response.status == 200
                 and response.geturl() == url,
                 "unexpected archive HTTP response")
        raw = response.read(max_bytes + 1)
    _require(0 < len(raw) <= max_bytes, "archive object empty/over budget")
    return raw


def _signature_fingerprint(status: bytes, approved: str) -> str:
    try:
        lines = status.decode("ascii").splitlines()
    except UnicodeError as exc:
        raise S1Blocked("invalid gpgv status encoding") from exc
    vals = [line.split() for line in lines
            if line.startswith("[GNUPG:] VALIDSIG ")]
    _require(len(vals) == 1, "missing/ambiguous VALIDSIG status")
    fields = vals[0]
    _require(len(fields) >= 3
             and re.fullmatch(r"[A-Fa-f0-9]{40,64}", fields[2]) is not None,
             "malformed signature fingerprint")
    # A subkey's VALIDSIG may carry its primary key fingerprint in final field.
    _require(len(fields) >= 11 and fields[9] in ("8", "9", "10"),
             "signature uses an unapproved or weak digest algorithm")
    _require(not any(line.startswith(("[GNUPG:] BADSIG ",
                                      "[GNUPG:] ERRSIG ",
                                      "[GNUPG:] REVKEYSIG ",
                                      "[GNUPG:] EXPKEYSIG ",
                                      "[GNUPG:] EXPSIG ",
                                      "[GNUPG:] NO_PUBKEY ")) for line in lines),
             "gpgv status includes a rejected signature")
    primary = fields[-1] if len(fields) >= 12 else fields[2]
    _require(primary.upper() == approved,
             "signing key does not match approved Archive fingerprint")
    return primary.upper()


def _release_time(body: bytes, now: datetime, pocket: str) -> None:
    try:
        text = body.decode("utf-8")
    except UnicodeError as exc:
        raise S1Blocked("invalid Release encoding") from exc
    _require("\x00" not in text, "invalid Release control data")
    for field, expected in (("Origin", "Ubuntu"), ("Suite", pocket),
                            ("Codename", "noble")):
        values = [line[len(field) + 1:].strip() for line in text.splitlines()
                  if line.startswith(field + ":")]
        _require(values == [expected], "wrong/missing Release " + field)
    architectures = [line.split(":", 1)[1].strip()
                     for line in text.splitlines()
                     if line.startswith("Architectures:")]
    _require(len(architectures) == 1
             and "amd64" in architectures[0].split(),
             "Release architecture does not include amd64")
    for field, required in (("Date", True), ("Valid-Until", False)):
        values = [line[len(field) + 1:].strip() for line in text.splitlines()
                  if line.startswith(field + ":")]
        _require(len(values) <= 1 and (not required or len(values) == 1),
                 "missing/duplicate Release time field")
        if values:
            try:
                dt = parsedate_to_datetime(values[0])
                _require(dt.tzinfo is not None, "naive Release time")
                dt = dt.astimezone(timezone.utc)
            except (ValueError, TypeError, OverflowError) as exc:
                raise S1Blocked("malformed Release timestamp") from exc
            if field == "Date":
                _require(dt <= now + timedelta(minutes=5),
                         "Release signed data dated in future")
            else:
                _require(now <= dt, "Release valid-until expired")


def collect(pocket: str, keyring: str, keyring_sha256: str,
            approved_fingerprint: str, evidence_dir: str) -> dict[str, object]:
    """Collect *raw* signed metadata; success never confers Runtime authority."""
    _require(pocket in POCKETS, "pocket not approved")
    _require(approved_fingerprint in ARCHIVE_FPRS,
             "signer is not an explicitly approved Ubuntu Archive key")
    raw_key = _read_keyring(keyring, keyring_sha256)
    gpgv = shutil.which("gpgv", path=PATH)
    _require(gpgv is not None, "gpgv not installed")
    evidence = _private_dir(evidence_dir)
    now = datetime.now(timezone.utc)
    receipt: dict[str, object] = {
        "schema": SCHEMA,
        "pocket": pocket,
        "archiveBase": ARCHIVE_BASE,
        "capturedAtUtc": now.isoformat(),
        "approvedSigningFingerprint": approved_fingerprint,
        "keyringSha256": keyring_sha256,
        "trustedKeyringAuthenticatedByIndependentWitness": False,
        "signatureCryptographicallyValidUnderProvidedKeyring": False,
        "officialArchiveMetadataAuthenticated": False,
        "guestIdentityAuthenticated": False,
        "guestRootEvidenceCaptured": False,
        "packageBytesAuthenticated": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
    try:
        _write_new(evidence, "trusted-keyring.gpg", raw_key)
        release = _download(pocket, "Release", MAX_RELEASE)
        _write_new(evidence, "Release", release)
        receipt["releaseSha256"] = _digest(release)
        signature = _download(pocket, "Release.gpg", MAX_SIGNATURE)
        _write_new(evidence, "Release.gpg", signature)
        receipt["releaseGpgSha256"] = _digest(signature)
        run = subprocess.run(
            [gpgv, "--status-fd", "1", "--keyring",
             str(evidence / "trusted-keyring.gpg"),
             str(evidence / "Release.gpg"),
             str(evidence / "Release")],
            capture_output=True, timeout=30, check=False,
            env={"PATH": PATH, "LC_ALL": "C"},
        )
        _write_new(evidence, "gpgv.stdout", run.stdout[:65536])
        _write_new(evidence, "gpgv.stderr", run.stderr[:65536])
        receipt["gpgvExitCode"] = run.returncode
        _require(len(run.stdout) <= 65536 and len(run.stderr) <= 65536,
                 "gpgv output budget exceeded")
        _require(run.returncode == 0, "gpgv rejected archive Release")
        signer = _signature_fingerprint(run.stdout, approved_fingerprint)
        receipt["actualVerifiedSignerFingerprint"] = signer
        _release_time(release, datetime.now(timezone.utc), pocket)
        receipt["signatureCryptographicallyValidUnderProvidedKeyring"] = True
        receipt["collectionCompleted"] = True
    except (S1Blocked, OSError, urllib.error.URLError,
            subprocess.TimeoutExpired) as exc:
        receipt["collectionCompleted"] = False
        receipt["errorType"] = type(exc).__name__
    finally:
        _write_new(evidence, "receipt.json",
                   (json.dumps(receipt, sort_keys=True, indent=2)
                    + "\n").encode("utf-8"))
    return receipt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pocket", required=True, choices=POCKETS)
    parser.add_argument("--keyring", required=True)
    parser.add_argument("--approved-keyring-sha256", required=True)
    parser.add_argument("--approved-signer-fingerprint", required=True)
    parser.add_argument("--evidence-dir", required=True)
    args = parser.parse_args(argv)
    try:
        report = collect(args.pocket, args.keyring,
                         args.approved_keyring_sha256,
                         args.approved_signer_fingerprint,
                         args.evidence_dir)
    except (S1Blocked, OSError) as exc:
        print("S1 BLOCKED (preflight):", type(exc).__name__, file=sys.stderr)
        return 2
    print("S1 evidence receipt:", report["decision"],
          "collectionCompleted=" + str(report.get("collectionCompleted")),
          "no installation or trust authority granted")
    return 0 if report.get("collectionCompleted") else 2


if __name__ == "__main__":
    sys.exit(main())
