"""R1 B2B2-B2/B2-0: inert, caller-supplied Guest evidence envelope.

No Guest/root/Host access, opener, subprocess, package download or installation.
B1 alias traces and B3B1 FD observations are only STRUCTURAL CLAIMS here.
This module cannot authenticate the caller, root anchor, platform, or bytes.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from root_python_dependency_manifest import FILE_KINDS, review_dependency_manifest
from root_python_dependency_offline_review import (
    canonical_observation_bytes, review_dependency_fd_evidence,
)

SCHEMA = "sanq.c5.g2.r1.b2b2b2.guest-claims.v1"
MAX_PACKET_BYTES = 524288
SESSION_FIELDS = {
    "sessionId", "vmUuid", "diskUuid", "snapshotUuid", "guestBootId",
    "rootFsUuid", "osId", "osVersion", "architecture", "pythonVersion",
    "mountNamespace", "rootMountId", "rootDevice", "rootInode",
    "rootUid", "rootGid", "rootMode", "observedAtUtc",
}
COLLECTOR_FIELDS = {
    "repoCommitSha", "collectorSourceSha256", "collectorId", "commandId",
    "exitCode",
}
TRACE_FIELDS = {
    "logicalPath", "proposedCanonicalPath", "observedLinkCandidates",
    "finalDevice", "finalInode", "finalMountId",
    "externalPinProvenanceAuthenticated", "pathAndRootProvenanceAuthenticated",
    "dynamicDependencyClosureVerified", "readyToInstall",
    "authorizedToMutateProduction", "decision",
}
LINK_FIELDS = {
    "linkPath", "linkText", "device", "inode", "uid", "gid", "mode", "mountId",
}
PACKET_FIELDS = {
    "schema", "session", "collector", "claimedManifestSha256",
    "aliasTraces", "fdObservation", "rootAndPlatformAuthenticated",
    "externalReleaseProvenanceAuthenticated", "actualExecutionWitnessed",
    "readyToInstall", "authorizedToMutateProduction", "decision",
}
_SHA = re.compile(r"[0-9a-f]{64}\Z")
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,95}\Z")
_UUID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\Z")
_UTC = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\Z")


class GuestEvidenceBlocked(ValueError):
    """Unbounded, inconsistent, or forged-authority candidate claims."""


def _require(ok: bool, message: str) -> None:
    if not ok:
        raise GuestEvidenceBlocked(message)


def _sha(value: Any) -> bool:
    return type(value) is str and _SHA.fullmatch(value) is not None


def _positive(value: Any) -> bool:
    return type(value) is int and value > 0


def _session(value: Any) -> None:
    _require(type(value) is dict and set(value) == SESSION_FIELDS,
             "invalid Guest session contract")
    _require(type(value["sessionId"]) is str
             and _ID.fullmatch(value["sessionId"]) is not None,
             "invalid session identifier")
    for field in ("vmUuid", "diskUuid", "snapshotUuid", "guestBootId", "rootFsUuid"):
        _require(type(value[field]) is str
                 and _UUID.fullmatch(value[field]) is not None,
                 "missing precise Guest/disk/snapshot identity")
    _require(value["osId"] == "ubuntu"
             and type(value["osVersion"]) is str
             and 0 < len(value["osVersion"]) <= 64
             and value["architecture"] == "x86_64"
             and value["pythonVersion"] == "3.12.3",
             "Guest platform differs from frozen manifest platform")
    _require(type(value["mountNamespace"]) is str
             and re.fullmatch(r"mnt:\[[1-9][0-9]*\]", value["mountNamespace"])
             is not None, "invalid mount namespace claim")
    for field in ("rootMountId", "rootDevice", "rootInode"):
        _require(_positive(value[field]), "invalid root anchor identity")
    _require(value["rootUid"] == 0 and type(value["rootUid"]) is int
             and value["rootGid"] == 0 and type(value["rootGid"]) is int
             and value["rootMode"] == 0o40755
             and type(value["rootMode"]) is int,
             "root anchor claims do not meet declared fixed root policy")
    _require(type(value["observedAtUtc"]) is str
             and _UTC.fullmatch(value["observedAtUtc"]) is not None,
             "missing UTC observation instant")


def _collector(value: Any) -> None:
    _require(type(value) is dict and set(value) == COLLECTOR_FIELDS,
             "invalid collector claim")
    _require(type(value["repoCommitSha"]) is str
             and re.fullmatch(r"[0-9a-f]{40}", value["repoCommitSha"]) is not None,
             "invalid source commit")
    _require(_sha(value["collectorSourceSha256"])
             and type(value["collectorId"]) is str
             and _ID.fullmatch(value["collectorId"]) is not None,
             "invalid collector pin/identity")
    _require(value["commandId"] == "b2b2b2-guest-readonly-evidence-v1"
             and value["exitCode"] == 0 and type(value["exitCode"]) is int,
             "wrong collector command or unsuccessful capture")


def canonical_guest_claim_bytes(packet: Any) -> bytes:
    _require(type(packet) is dict and set(packet) == PACKET_FIELDS,
             "invalid Guest claim envelope")
    try:
        data = json.dumps(packet, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=True, allow_nan=False).encode("ascii")
    except (ValueError, TypeError, OverflowError, RecursionError) as exc:
        raise GuestEvidenceBlocked("invalid Guest packet JSON") from exc
    _require(len(data) <= MAX_PACKET_BYTES,
             "Guest packet exceeds evidence budget")
    return data


def build_claimed_guest_packet(
    manifest: Any, *, expected_manifest_sha256: Any,
    proposed_file_pins: Any, proposed_exact_links: Any,
    alias_traces: Any, fd_observation: Any, session: Any, collector: Any,
) -> dict[str, Any]:
    """Assemble synthetic/claimed B1+B3B1 outputs; ALWAYS BLOCKED.

    The observation hash supplied to the prior offline reviewer below is
    computed from the same caller object, so this step is NOT independent
    custody verification. The B2-1 offline reviewer takes separate evidence.
    """
    _session(session)
    _collector(collector)
    _require(type(proposed_exact_links) is dict
             and len(proposed_exact_links) <= 8
             and all(type(k) is str and type(v) is str
                     and 0 < len(k) <= 256 and 0 < len(v) <= 256
                     and k.isascii() and v.isascii()
                     and all(32 < ord(c) < 127 for c in k + v)
                     for k, v in proposed_exact_links.items()),
             "invalid caller link claims")
    try:
        review_dependency_manifest(
            manifest, expected_manifest_sha256=expected_manifest_sha256,
            proposed_external_file_pins=proposed_file_pins)
        observation_sha = hashlib.sha256(
            canonical_observation_bytes(fd_observation)).hexdigest()
        review_dependency_fd_evidence(
            manifest, fd_observation,
            expected_manifest_sha256=expected_manifest_sha256,
            separately_supplied_file_sha256=proposed_file_pins,
            expected_observation_sha256=observation_sha)
    except (ValueError, KeyError, TypeError) as exc:
        raise GuestEvidenceBlocked("B3B1 file observations invalid") from exc
    records = {r["path"]: r for r in fd_observation["files"]}
    paths = {n["path"] for n in manifest["nodes"] if n["kind"] in FILE_KINDS}
    _require(type(alias_traces) is dict and set(alias_traces) == paths,
             "alias trace/manifest coverage mismatch")
    used_links: set[str] = set()
    for path in sorted(paths):
        record, trace = records[path], alias_traces[path]
        _require(type(trace) is dict and set(trace) == TRACE_FIELDS
                 and trace["logicalPath"] == path
                 and type(trace["proposedCanonicalPath"]) is str
                 and re.fullmatch(r"/[A-Za-z0-9_.+/-]+",
                                  trace["proposedCanonicalPath"]) is not None
                 and all(p not in ("", ".", "..")
                         for p in trace["proposedCanonicalPath"][1:].split("/"))
                 and type(trace["observedLinkCandidates"]) is list
                 and len(trace["observedLinkCandidates"]) <= 8,
                 "invalid B1 alias trace")
        for field in ("externalPinProvenanceAuthenticated",
                      "pathAndRootProvenanceAuthenticated",
                      "dynamicDependencyClosureVerified",
                      "readyToInstall", "authorizedToMutateProduction"):
            _require(trace[field] is False, "forged B1 authority flag")
        _require(trace["decision"] == "BLOCKED"
                 and trace["finalDevice"] == record["device"]
                 and trace["finalDevice"] == session["rootDevice"]
                 and type(trace["finalDevice"]) is int
                 and trace["finalInode"] == record["inode"]
                 and type(trace["finalInode"]) is int
                 and trace["finalMountId"] == session["rootMountId"]
                 and type(trace["finalMountId"]) is int,
                 "B1 path/FD/mount claim mismatch")
        for link in trace["observedLinkCandidates"]:
            _require(type(link) is dict and set(link) == LINK_FIELDS
                     and link["linkPath"] in proposed_exact_links
                     and link["linkText"] == proposed_exact_links[link["linkPath"]]
                     and _positive(link["device"])
                     and link["device"] == session["rootDevice"]
                     and _positive(link["inode"])
                     and link["mountId"] == session["rootMountId"]
                     and type(link["mountId"]) is int
                     and link["uid"] == 0 and type(link["uid"]) is int
                     and link["gid"] == 0 and type(link["gid"]) is int
                     and type(link["mode"]) is int,
                     "symlink evidence conflicts with caller claims")
            used_links.add(link["linkPath"])
    _require(used_links == set(proposed_exact_links),
             "unobserved claimed symlinks")
    packet = {
        "schema": SCHEMA, "session": session, "collector": collector,
        "claimedManifestSha256": expected_manifest_sha256,
        "aliasTraces": alias_traces, "fdObservation": fd_observation,
        "rootAndPlatformAuthenticated": False,
        "externalReleaseProvenanceAuthenticated": False,
        "actualExecutionWitnessed": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
    # Freeze the caller's mutable nested dictionaries into a detached snapshot.
    return json.loads(canonical_guest_claim_bytes(packet))
