"""C1-SYN-001 offline approval packet; no Host/Guest, subprocess or file I/O.

Caller supplies the three exact source bytes and optional *untrusted* site claims.
This code only prepares an A0-A2 review. It never grants execution authority.
"""
from __future__ import annotations

import hashlib
import re

SCHEMA = "sanq.runtime.c1-syn001-approval-review.v1"
ROOT = "/tmp/sanq-c1-syn-001"
PYTHON = "/usr/bin/python3.12"
STRACE = "/usr/bin/strace"
MATERIALS = {
    "C1-SYN-001-input.txt":
        (25, "8df9b096863665361212a14784dccabcc9de929bd524ec1529ed1eb2f1df6552"),
    "C1-SYN-001-SYN-01.py.txt":
        (1028, "7e5d7e810ffd1e0a2720ada15a26e9a39004fda50ecd1317c8f80c82c9974cac"),
    "C1-SYN-001-SYN-02.py.txt":
        (1641, "411fa8ebc54301c554d3380d7d778d9cd7ae176b62833a3218673b5054c7c546"),
}
DESTINATIONS = {
    "C1-SYN-001-input.txt": ROOT + "/input.txt",
    "C1-SYN-001-SYN-01.py.txt": ROOT + "/syn01.py",
    "C1-SYN-001-SYN-02.py.txt": ROOT + "/syn02.py",
}
ENVIRONMENT = {
    "HOME": ROOT,
    "PATH": "/usr/bin:/bin",
    "LANG": "C",
    "LC_ALL": "C",
    "TZ": "UTC",
}
SITE_KEYS = frozenset({
    "expectedVmUuid", "observedVmUuid", "expectedVdiUuid", "observedVdiUuid",
    "expectedSshHostKeySha256", "observedSshHostKeySha256",
    "expectedHostOnlyNetwork", "observedHostOnlyNetwork", "vmState",
    "guestUid", "guestGid", "guestBootId", "mountNamespace", "pidNamespace",
    "expectedStraceSha256", "observedStraceSha256",
    "expectedPythonSha256", "observedPythonSha256",
    "expectedLoaderSha256", "observedLoaderSha256",
})
SHA = re.compile(r"[0-9a-f]{64}\Z")
ID = re.compile(r"[A-Za-z0-9._:\[\]-]{1,128}\Z")
# Bound format and preserve private host identifiers outside of the output.
MAX_FIELD = 128


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _argv(scenario: str) -> list[str]:
    if scenario not in {"SYN-01", "SYN-02"}:
        raise ValueError("UNKNOWN_SCENARIO")
    script = "syn01.py" if scenario == "SYN-01" else "syn02.py"
    trace = "syn01.trace" if scenario == "SYN-01" else "syn02.trace"
    return [
        STRACE, "-ff", "-ttt", "-T", "-yy", "-s", "128",
        "-o", ROOT + "/raw/" + trace,
        PYTHON, "-I", "-S", "-B", ROOT + "/" + script, scenario,
    ]


def _site_reasons(site: object) -> list[str]:
    """Check claims' *consistency*, not their provenance or authority."""
    if site is None:
        return ["SITE_PREFLIGHT_MISSING"]
    if type(site) is not dict or set(site) != SITE_KEYS:
        return ["SITE_PREFLIGHT_SCHEMA_INVALID"]
    for key, value in site.items():
        if key in {"guestUid", "guestGid"}:
            if type(value) is not int or value < 0 or value > 65534:
                return ["SITE_PREFLIGHT_SCHEMA_INVALID"]
        elif (type(value) is not str or len(value) > MAX_FIELD or not value):
            return ["SITE_PREFLIGHT_SCHEMA_INVALID"]
    for key in ("expectedSshHostKeySha256", "observedSshHostKeySha256",
                "expectedStraceSha256", "observedStraceSha256",
                "expectedPythonSha256", "observedPythonSha256",
                "expectedLoaderSha256", "observedLoaderSha256"):
        if SHA.fullmatch(site[key]) is None:
            return ["SITE_PREFLIGHT_SCHEMA_INVALID"]
    for key in ("expectedVmUuid", "observedVmUuid",
                "expectedVdiUuid", "observedVdiUuid",
                "expectedHostOnlyNetwork", "observedHostOnlyNetwork",
                "guestBootId", "mountNamespace", "pidNamespace"):
        if ID.fullmatch(site[key]) is None:
            return ["SITE_PREFLIGHT_SCHEMA_INVALID"]
    errors = []
    if site["expectedVmUuid"] != site["observedVmUuid"]:
        errors.append("VM_IDENTITY_MISMATCH")
    if site["expectedVdiUuid"] != site["observedVdiUuid"]:
        errors.append("VDI_IDENTITY_MISMATCH")
    if site["expectedSshHostKeySha256"] != site["observedSshHostKeySha256"]:
        errors.append("SSH_HOST_KEY_MISMATCH")
    if site["expectedHostOnlyNetwork"] != site["observedHostOnlyNetwork"]:
        errors.append("HOST_ONLY_NETWORK_MISMATCH")
    for obj in ("Strace", "Python", "Loader"):
        if site["expected" + obj + "Sha256"] != site["observed" + obj + "Sha256"]:
            errors.append(obj.upper() + "_SOURCE_MISMATCH")
    if site["vmState"] != "running":
        errors.append("VM_NOT_RUNNING")
    if site["guestUid"] == 0 or site["guestGid"] == 0:
        errors.append("ROOT_NOT_ALLOWED")
    return errors


def review(materials: object, site: object = None) -> dict:
    """Return a data-only proposed plan. Never execute or authorize anything.

    The caller must supply original source bytes, not text decoded/reformatted.
    Matching host/SSH pins in caller claims is *not* host authenticity proof.
    """
    reasons: list[str] = []
    matches = {}
    if type(materials) is not dict or set(materials) != set(MATERIALS):
        reasons.append("SOURCE_SET_MISMATCH")
    else:
        for name, (size, digest) in MATERIALS.items():
            raw = materials[name]
            ok = type(raw) is bytes and len(raw) == size and _sha(raw) == digest
            matches[name] = ok
            if not ok:
                reasons.append("SOURCE_BYTES_MISMATCH")
    site_reasons = _site_reasons(site)
    reasons.extend(site_reasons)
    reasons = sorted(set(reasons))
    scenarios = [
        {"scenarioId": scenario, "argv": _argv(scenario), "cwd": ROOT,
         "env": dict(ENVIRONMENT), "umaskOctal": "0077", "runAsRoot": False,
         "maxWallSeconds": 30, "maxRawBytes": 8 * 1024 * 1024,
         "maxSingleTraceBytes": 4 * 1024 * 1024,
         "captureStdoutStderrAndExitCodes": True,
         "preservePartialAndFailedRaw": True, "autoCleanup": False}
        for scenario in ("SYN-01", "SYN-02")
    ]
    return {
        "schema": SCHEMA,
        "status": "REJECTED" if reasons else "CLAIMS_CONSISTENT_ONLY",
        "reasonCodes": reasons,
        "c0HistoricalDisposition": "CLOSED_LIMITED_ACCEPTED",
        "sourceMaterialsMatched": all(matches.values()) and len(matches) == len(MATERIALS),
        "sourceMaterials": [
            {"name": name, "targetPath": DESTINATIONS[name],
             "byteCount": size, "sha256": digest,
             "matchesSuppliedBytes": matches.get(name, False)}
            for name, (size, digest) in MATERIALS.items()
        ],
        "siteClaimsPresent": site is not None,
        "siteClaimsAuthenticityProven": False,
        "a0Approved": False,
        "a1Approved": False,
        "a2ExecutionAuthorized": False,
        "guestExecutionAllowed": False,
        "readyToInstall": False,
        "productionAuthorized": False,
        "scenarios": scenarios,
    }
