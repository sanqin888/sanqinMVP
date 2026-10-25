"""S1-R1: GitHub-hosted, PR-only, public Ubuntu Archive evidence capture.

This wrapper establishes NO trust authority. It pins a separately cross-checked
PUBLIC keyring candidate, delegates real Release.gpg verification to the
existing S1 collector, and persists provenance/hashes for independent review.
No credentials, production/Guest access, APT, or mutable external storage.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import urllib.request

import root_python_s1_ubuntu_archive_collector as s1


SOURCE_URL = "https://archive.ubuntu.com/ubuntu/project/ubuntu-archive-keyring.gpg"
# Two-route Mac Canonical HTTPS + Debian trixie ubuntu-keyring byte match
# observed 2026-10-19. CANDIDATE PIN; formal witness approval still pending.
CANDIDATE_KEYRING_SHA256 = "80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31"
ARCHIVE_2018_FINGERPRINT = "F6ECB3762474EDA9D21B7022871920D1991BC93C"
POCKET = "noble"
MAX_KEYRING_BYTES = 1024 * 1024
WORKFLOW_PATH = ".github/workflows/runtime-s1-r1-ubuntu-archive-evidence.yml"
SCHEMA = "sanq.c5.g2.r1.s1.runner-evidence.v1"
SHA40 = re.compile(r"[a-f0-9]{40}\Z")
POSITIVE_INT = re.compile(r"[1-9][0-9]*\Z")
PR_REF = re.compile(r"refs/pull/[1-9][0-9]*/merge\Z")


class RunnerBlocked(ValueError):
    pass


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise RunnerBlocked(reason)


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _runner_identity(env: dict[str, str]) -> dict[str, str]:
    # This is runner-provided attribution, not independent attestation.
    repo = "sanqin888/sanqinMVP"
    _require(env.get("GITHUB_ACTIONS") == "true", "not GitHub Actions")
    _require(env.get("GITHUB_EVENT_NAME") == "pull_request", "PR event required")
    _require(env.get("GITHUB_BASE_REF") == "dev", "dev base required")
    _require(env.get("GITHUB_REPOSITORY") == repo, "unexpected repository")
    _require(env.get("PR_HEAD_REPOSITORY") == repo, "fork PR not permitted")
    _require(PR_REF.fullmatch(env.get("GITHUB_REF", "")) is not None,
             "unexpected PR merge ref")
    _require(SHA40.fullmatch(env.get("GITHUB_SHA", "")) is not None,
             "missing merge commit")
    _require(SHA40.fullmatch(env.get("PR_HEAD_SHA", "")) is not None,
             "missing PR head")
    for key in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"):
        _require(POSITIVE_INT.fullmatch(env.get(key, "")) is not None,
                 "invalid run identity")
    return {
        "repository": repo,
        "baseRef": "dev",
        "eventName": "pull_request",
        "prMergeRef": env["GITHUB_REF"],
        "prHeadSha": env["PR_HEAD_SHA"],
        "checkoutMergeSha": env["GITHUB_SHA"],
        "runId": env["GITHUB_RUN_ID"],
        "runAttempt": env["GITHUB_RUN_ATTEMPT"],
        "runnerImage": env.get("ImageOS", "unknown"),
        "runnerImageVersion": env.get("ImageVersion", "unknown"),
    }


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RunnerBlocked("keyring source redirect forbidden")


def _fetch_keyring() -> bytes:
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), _NoRedirect())
    with opener.open(urllib.request.Request(SOURCE_URL), timeout=20) as response:
        _require(response.status == 200 and response.geturl() == SOURCE_URL,
                 "unexpected keyring HTTP response")
        raw = response.read(MAX_KEYRING_BYTES + 1)
    _require(0 < len(raw) <= MAX_KEYRING_BYTES, "keyring size out of bounds")
    return raw


def _new_file(path: Path, data: bytes) -> None:
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL
                 | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as file:
        file.write(data)


def _manifest(root: Path) -> bytes:
    lines = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise RunnerBlocked("symlink in evidence")
        if not path.is_file():
            continue
        _require(stat.S_IMODE(path.stat().st_mode) & 0o077 == 0,
                 "evidence file not private")
        lines.append(f"{_sha(path.read_bytes())}  {path.relative_to(root).as_posix()}\n")
    return "".join(lines).encode("ascii")


def capture(env: dict[str, str]) -> int:
    identity = _runner_identity(env)
    temp = Path(env.get("RUNNER_TEMP", ""))
    _require(temp.is_absolute() and temp.is_dir() and not temp.is_symlink(),
             "runner temp must be absolute existing directory")
    parent = temp / "sanq-s1-r1-evidence"
    # Create-only; never append to a previous attempt or overwrite evidence.
    prior_umask = os.umask(0o077)
    try:
        parent.mkdir(mode=0o700)
    finally:
        os.umask(prior_umask)
    report: dict[str, object] = {
        "schema": SCHEMA,
        "capturedAtUtc": datetime.now(timezone.utc).isoformat(),
        "runnerClaimedIdentity": identity,
        "publicKeySource": SOURCE_URL,
        "candidateKeyringSha256": CANDIDATE_KEYRING_SHA256,
        "archive2018Fingerprint": ARCHIVE_2018_FINGERPRINT,
        "requestedPocket": POCKET,
        "independentWitnessApproved": False,
        "officialArchiveAuthenticatedByIndependentWitness": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
        "collectionCompleted": False,
    }
    success = False
    try:
        repository = Path(__file__).resolve().parents[2]
        collector_path = repository / "ops/runtime/root_python_s1_ubuntu_archive_collector.py"
        workflow_path = repository / WORKFLOW_PATH
        report["collectorSourceSha256"] = _sha(collector_path.read_bytes())
        report["wrapperSourceSha256"] = _sha(Path(__file__).read_bytes())
        report["workflowSourceSha256"] = _sha(workflow_path.read_bytes())

        raw = _fetch_keyring()
        keyfile = parent / "ubuntu-archive-keyring.gpg"
        _new_file(keyfile, raw)
        report["downloadedKeyringSha256"] = _sha(raw)
        _require(report["downloadedKeyringSha256"] == CANDIDATE_KEYRING_SHA256,
                 "public keyring differs from fixed candidate pin")

        receipt = s1.collect(
            POCKET, str(keyfile), CANDIDATE_KEYRING_SHA256,
            ARCHIVE_2018_FINGERPRINT, str(parent / "noble"))
        report["collectorCompleted"] = receipt.get("collectionCompleted") is True
        report["collectorGpgvExitCode"] = receipt.get("gpgvExitCode")
        report["collectorReceiptSha256"] = _sha(
            (parent / "noble/receipt.json").read_bytes())
        _require(receipt.get("decision") == "BLOCKED"
                 and receipt.get("readyToInstall") is False
                 and receipt.get("authorizedToMutateProduction") is False
                 and receipt.get("trustedKeyringAuthenticatedByIndependentWitness") is False
                 and receipt.get("officialArchiveMetadataAuthenticated") is False,
                 "collector unexpectedly widened trust authority")
        _require(receipt.get("collectionCompleted") is True
                 and receipt.get("gpgvExitCode") == 0
                 and receipt.get("signatureCryptographicallyValidUnderProvidedKeyring") is True,
                 "real S1 collector did not complete")
        report["collectionCompleted"] = True
        success = True
    except Exception as exc:
        # Failure is always nonzero, with captured material preserved for review.
        report["failureType"] = type(exc).__name__
    finally:
        _new_file(parent / "runner-receipt.json",
                  (json.dumps(report, sort_keys=True, indent=2) + "\n").encode())
        _new_file(parent / "sha256-manifest.txt", _manifest(parent))
    print("S1-R1 runner evidence:", "COLLECTED" if success else "FAILED",
          "decision=BLOCKED; no installation authority")
    return 0 if success else 2


if __name__ == "__main__":
    try:
        sys.exit(capture(dict(os.environ)))
    except (RunnerBlocked, OSError) as exc:
        print("S1-R1 preflight BLOCKED:", type(exc).__name__, file=sys.stderr)
        sys.exit(2)
