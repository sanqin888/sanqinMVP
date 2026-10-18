"""C5-G2 B4B-3B-1: offline review of UNTRUSTED FD observation records.

Expected digests/receipt hash must originate from a separate operator-controlled
channel. This module cannot validate that channel or discover Python/ELF edges.
Matching caller-supplied values is NOT independent authenticity or root authority.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from root_python_dependency_manifest import (
    FILE_KINDS, MAX_MANIFEST_BYTES, review_dependency_manifest,
)

# This verifier deliberately does NOT import the Guest collector or any host
# file/FD implementation. These format constants are independently pinned here;
# compatibility regressions compare the two sides without shared runtime code.
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
OBSERVATION_SCHEMA = "sanq.c5.g2.b4b3b1.fd-observation.v1"

RECORD_FIELDS = {
    "path", "sha256", "size", "device", "inode", "mtimeNs", "ctimeNs",
    "uid", "gid", "mode", "hardlinks",
}
OBSERVATION_FIELDS = {
    "schema", "claimedManifestSha256", "files", "proposedFileCount",
    "observedTotalBytes", "fileBytesObservedFromProvidedFDs",
    "preopenedFDAndPathProvenanceAuthenticated",
    "independentExternalPinProvenanceAuthenticated",
    "pythonImportClosureIndependentlyDiscovered",
    "elfNeededAndDlopenClosureIndependentlyDiscovered",
    "rootExecutionAttempted", "readyToInstall",
    "authorizedToMutateProduction", "decision",
}
MAX_OBSERVATION_BYTES = MAX_MANIFEST_BYTES


class DependencyEvidenceBlocked(ValueError):
    """Candidate captured evidence cannot be accepted even as a structural match."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise DependencyEvidenceBlocked(reason)


def _digest(value: Any) -> bool:
    return (type(value) is str and len(value) == 64
            and all(c in "0123456789abcdef" for c in value))


def canonical_observation_bytes(observation: Any) -> bytes:
    _require(type(observation) is dict
             and set(observation) == OBSERVATION_FIELDS,
             "invalid observation envelope")
    _require(type(observation["files"]) is list
             and len(observation["files"]) <= 512,
             "observation files count out of bounds")
    try:
        payload = json.dumps(observation, sort_keys=True,
                             separators=(",", ":"), allow_nan=False,
                             ensure_ascii=True).encode("ascii")
    except (ValueError, TypeError, OverflowError, RecursionError) as exc:
        raise DependencyEvidenceBlocked("observation JSON malformed") from exc
    _require(len(payload) <= MAX_OBSERVATION_BYTES,
             "observation exceeds bounded size")
    return payload


def review_dependency_fd_evidence(
    manifest: Any, observation: Any, *,
    expected_manifest_sha256: Any,
    separately_supplied_file_sha256: Any,
    expected_observation_sha256: Any,
    expected_owner_uid: int = 0,
) -> dict[str, Any]:
    """Compare independently *proposed* pins, NEVER authenticate provenance.

    These inputs require separate trusted custody. A matching offline comparison
    cannot certify how the opener mapped FD -> path, module discovery, ELF edges,
    file source, kernel, independent witness or a production Runtime.
    """
    try:
        review_dependency_manifest(
            manifest, expected_manifest_sha256=expected_manifest_sha256,
            proposed_external_file_pins=separately_supplied_file_sha256,
        )
    except (ValueError, KeyError, TypeError) as exc:
        raise DependencyEvidenceBlocked("B4B-3A manifest/pin mismatch") from exc
    data = canonical_observation_bytes(observation)
    _require(_digest(expected_observation_sha256)
             and hashlib.sha256(data).hexdigest() == expected_observation_sha256,
             "observation differs from independently supplied receipt pin")
    _require(type(expected_owner_uid) is int and expected_owner_uid >= 0,
             "invalid expected owner")
    _require(observation["schema"] == OBSERVATION_SCHEMA
             and observation["claimedManifestSha256"] == expected_manifest_sha256,
             "wrong observation schema/manifest")
    for field in (
        "preopenedFDAndPathProvenanceAuthenticated",
        "independentExternalPinProvenanceAuthenticated",
        "pythonImportClosureIndependentlyDiscovered",
        "elfNeededAndDlopenClosureIndependentlyDiscovered",
        "rootExecutionAttempted", "readyToInstall", "authorizedToMutateProduction",
    ):
        _require(observation[field] is False, "forged authority or witness flag")
    _require(observation["fileBytesObservedFromProvidedFDs"] is True
             and observation["decision"] == "BLOCKED",
             "invalid observation semantics")

    expected = {
        node["path"]: node["sha256"] for node in manifest["nodes"]
        if node["kind"] in FILE_KINDS
    }
    records = observation["files"]
    _require(type(observation["proposedFileCount"]) is int
             and len(records) == len(expected)
             and observation["proposedFileCount"] == len(expected),
             "observation file count mismatch")
    _require(type(observation["observedTotalBytes"]) is int,
             "invalid total byte record")
    seen: set[str] = set()
    identities: set[tuple[int, int]] = set()
    total = 0
    for record in records:
        _require(type(record) is dict and set(record) == RECORD_FIELDS,
                 "invalid evidence fields")
        path = record["path"]
        _require(type(path) is str and path in expected and path not in seen,
                 "unexpected/duplicate/absent file observation")
        seen.add(path)
        _require(_digest(record["sha256"])
                 and record["sha256"] == expected[path]
                 and record["sha256"] == separately_supplied_file_sha256[path],
                 "file digest does not match separately supplied pins")
        for field in ("size", "device", "inode", "mtimeNs", "ctimeNs",
                      "uid", "gid", "mode", "hardlinks"):
            _require(type(record[field]) is int,
                     "non-integer file metadata")
        _require(0 < record["size"] <= MAX_FILE_BYTES
                 and record["device"] > 0 and record["inode"] > 0
                 and record["mtimeNs"] > 0 and record["ctimeNs"] > 0
                 and record["uid"] == expected_owner_uid
                 and (expected_owner_uid != 0 or record["gid"] == 0)
                 and record["hardlinks"] == 1
                 and record["mode"] >= 0
                 and (record["mode"] & 0o6022) == 0,
                 "unsafe metadata claim")
        identity = (record["device"], record["inode"])
        _require(identity not in identities, "alias path reuses same inode")
        identities.add(identity)
        total += record["size"]
        _require(total <= MAX_TOTAL_BYTES, "total bytes over budget")
    _require(seen == set(expected)
             and total == observation["observedTotalBytes"],
             "observation is incomplete or total bytes differ")
    _require([record["path"] for record in records] == sorted(expected),
             "noncanonical evidence path ordering")

    return {
        "kind": "c5-g2-b02b4b3b1-offline-file-evidence-review-v1",
        "declaredFileCount": len(expected),
        "candidateFileDigestsMatchSeparatePins": True,
        "candidateReceiptMatchesSeparateDigest": True,
        "filesystemPathAndFDProvenanceIndependentlyAuthenticated": False,
        "externalPinAndReceiptCustodyIndependentlyAuthenticated": False,
        "actualPythonImportAndElfClosureVerified": False,
        "rootGuestExecutionIndependentlyWitnessed": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
