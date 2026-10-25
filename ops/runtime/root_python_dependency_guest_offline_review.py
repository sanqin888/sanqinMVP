"""R1 B2B2-B2/B2-0: standalone, offline-only cross-source CLAIM review.

Separate from Guest capture and B1's opener; uses no Guest collector module.
Receipts/strings cannot authenticate AWS, VirtualBox, Ubuntu package signatures,
Host custody, or actual root execution. ALWAYS returns BLOCKED.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from root_python_dependency_manifest import FILE_KINDS, review_dependency_manifest
from root_python_dependency_offline_review import review_dependency_fd_evidence

GUEST_SCHEMA = "sanq.c5.g2.r1.b2b2b2.guest-claims.v1"
MAX_BYTES = 524288
GUEST_FIELDS = {
    "schema", "session", "collector", "claimedManifestSha256", "aliasTraces",
    "fdObservation", "rootAndPlatformAuthenticated",
    "externalReleaseProvenanceAuthenticated", "actualExecutionWitnessed",
    "readyToInstall", "authorizedToMutateProduction", "decision",
}
HOST_FIELDS = {
    "vmUuid", "diskUuid", "snapshotUuid", "rootFsUuid", "observerId",
    "originalEvidenceSha256", "recordedAtUtc", "exitCode",
}
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
PACKAGE_FIELDS = {
    "fileSha256", "packageName", "packageVersion", "architecture",
    "debSha256", "signedReleaseSha256", "signingKeyFingerprint", "sourceRef",
}
CUSTODY_FIELDS = {
    "guestPacketSha256", "fdObservationSha256", "hostRecordSha256",
    "packageRecordSha256", "guestCollectorId", "hostWitnessId",
    "packageWitnessId", "reviewerId", "offlineEvidenceRef",
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
_SHA = re.compile(r"[0-9a-f]{64}\Z")
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,95}\Z")
_UUID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\Z")
_UTC = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\Z")


class GuestOfflineEvidenceBlocked(ValueError):
    """Candidate evidence mismatch; no downstream execution is possible."""


def _require(ok: bool, message: str) -> None:
    if not ok:
        raise GuestOfflineEvidenceBlocked(message)


def _sha(value: Any) -> bool:
    return type(value) is str and _SHA.fullmatch(value) is not None


def _token(value: Any) -> bool:
    return type(value) is str and _ID.fullmatch(value) is not None


def _canonical(value: Any) -> bytes:
    try:
        raw = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=True, allow_nan=False).encode("ascii")
    except (ValueError, TypeError, OverflowError, RecursionError) as exc:
        raise GuestOfflineEvidenceBlocked("invalid detached JSON evidence") from exc
    _require(len(raw) <= MAX_BYTES, "detached evidence budget exceeded")
    return raw


def _matching_digest(value: Any, expected: Any) -> None:
    _require(_sha(expected) and hashlib.sha256(_canonical(value)).hexdigest()
             == expected, "detached evidence digest mismatch")


def review_separately_claimed_guest_evidence(
    manifest: Any, guest_packet: Any, *, expected_manifest_sha256: Any,
    host_record: Any, package_record: Any, custody: Any,
) -> dict[str, Any]:
    """Cross-check *separately presented* records, not their actual origin.

    Not even a fully matching record confers C1/source/root/installation trust.
    Independent Host/source signature/custody validation is a separate gate.
    """
    _require(type(guest_packet) is dict and set(guest_packet) == GUEST_FIELDS
             and guest_packet["schema"] == GUEST_SCHEMA,
             "unexpected Guest evidence schema")
    for flag in ("rootAndPlatformAuthenticated",
                 "externalReleaseProvenanceAuthenticated",
                 "actualExecutionWitnessed", "readyToInstall",
                 "authorizedToMutateProduction"):
        _require(guest_packet[flag] is False, "forged Guest authority")
    _require(guest_packet["decision"] == "BLOCKED"
             and guest_packet["claimedManifestSha256"] == expected_manifest_sha256,
             "invalid Guest decision or manifest")
    session = guest_packet["session"]
    collector = guest_packet["collector"]
    _require(type(session) is dict and set(session) == SESSION_FIELDS
             and type(collector) is dict and set(collector) == COLLECTOR_FIELDS
             and type(host_record) is dict and set(host_record) == HOST_FIELDS
             and type(package_record) is dict
             and set(package_record) == {"files", "links"}
             and type(custody) is dict and set(custody) == CUSTODY_FIELDS,
             "missing required detached evidence")
    _require(all(_token(custody[field]) for field in (
        "guestCollectorId", "hostWitnessId", "packageWitnessId", "reviewerId")),
        "unidentified evidence participants")
    _require(len({custody[field] for field in (
        "guestCollectorId", "hostWitnessId", "packageWitnessId",
        "reviewerId")}) == 4, "same claimed actor for independent roles")
    _require(_token(custody["offlineEvidenceRef"])
             and host_record["observerId"] == custody["hostWitnessId"]
             and collector["collectorId"] == custody["guestCollectorId"],
             "invalid Host witness/custody link")
    _matching_digest(guest_packet, custody["guestPacketSha256"])
    _matching_digest(host_record, custody["hostRecordSha256"])
    _matching_digest(package_record, custody["packageRecordSha256"])
    _matching_digest(guest_packet["fdObservation"],
                     custody["fdObservationSha256"])
    for field in ("vmUuid", "diskUuid", "snapshotUuid", "rootFsUuid"):
        _require(type(session.get(field)) is str
                 and _UUID.fullmatch(session[field]) is not None
                 and host_record[field] == session[field],
                 "Host/Guest system identity conflict")
    _require(host_record["exitCode"] == 0
             and type(host_record["exitCode"]) is int
             and _sha(host_record["originalEvidenceSha256"])
             and type(host_record["recordedAtUtc"]) is str
             and _UTC.fullmatch(host_record["recordedAtUtc"]) is not None,
             "invalid Host original readback reference")
    _require(_token(session.get("sessionId"))
             and type(session.get("guestBootId")) is str
             and _UUID.fullmatch(session["guestBootId"]) is not None
             and type(session.get("osVersion")) is str
             and 0 < len(session["osVersion"]) <= 64
             and session.get("osId") == "ubuntu"
             and session.get("architecture") == "x86_64"
             and session.get("pythonVersion") == "3.12.3"
             and type(session.get("mountNamespace")) is str
             and re.fullmatch(r"mnt:\[[1-9][0-9]*\]", session["mountNamespace"])
             is not None
             and all(type(session.get(k)) is int and session[k] > 0 for k in (
                 "rootMountId", "rootDevice", "rootInode"))
             and session.get("rootUid") == 0
             and type(session.get("rootUid")) is int
             and session.get("rootGid") == 0
             and type(session.get("rootGid")) is int
             and session.get("rootMode") == 0o40755
             and type(session.get("rootMode")) is int
             and type(session.get("observedAtUtc")) is str
             and _UTC.fullmatch(session["observedAtUtc"]) is not None,
             "Guest platform/root claims malformed")
    _require(type(collector.get("repoCommitSha")) is str
             and re.fullmatch(r"[0-9a-f]{40}", collector["repoCommitSha"])
             is not None
             and _sha(collector.get("collectorSourceSha256"))
             and collector.get("commandId") == "b2b2b2-guest-readonly-evidence-v1"
             and collector.get("exitCode") == 0
             and type(collector.get("exitCode")) is int,
             "invalid collector identity or result")
    _require(type(package_record["files"]) is dict
             and type(package_record["links"]) is dict,
             "invalid package records")
    try:
        proposed_file_pins = {
            path: source["fileSha256"]
            for path, source in package_record["files"].items()
        }
        review_dependency_manifest(
            manifest, expected_manifest_sha256=expected_manifest_sha256,
            proposed_external_file_pins=proposed_file_pins)
        review_dependency_fd_evidence(
            manifest, guest_packet["fdObservation"],
            expected_manifest_sha256=expected_manifest_sha256,
            separately_supplied_file_sha256=proposed_file_pins,
            expected_observation_sha256=custody["fdObservationSha256"])
    except (ValueError, TypeError, KeyError) as exc:
        raise GuestOfflineEvidenceBlocked("manifest/FD candidate differs from package pins") from exc
    paths = {n["path"] for n in manifest["nodes"] if n["kind"] in FILE_KINDS}
    _require(set(package_record["files"]) == paths,
             "missing or extra package file")
    for source in package_record["files"].values():
        _require(type(source) is dict and set(source) == PACKAGE_FIELDS
                 and _sha(source["fileSha256"])
                 and _sha(source["debSha256"])
                 and _sha(source["signedReleaseSha256"])
                 and type(source["signingKeyFingerprint"]) is str
                 and re.fullmatch(r"[0-9A-Fa-f]{40}", source["signingKeyFingerprint"])
                 is not None
                 and source["architecture"] == "amd64"
                 and _token(source["packageName"])
                 and type(source["packageVersion"]) is str
                 and re.fullmatch(r"[A-Za-z0-9.+:~_-]{1,96}",
                                  source["packageVersion"]) is not None
                 and type(source["sourceRef"]) is str
                 and re.fullmatch(r"[A-Za-z0-9._~:+/@=-]{1,256}",
                                  source["sourceRef"]) is not None,
                 "invalid Ubuntu package provenance *claim*")
    links = package_record["links"]
    _require(len(links) <= 8 and all(
        type(path) is str and type(text) is str
        and path.startswith("/") and 0 < len(path) <= 256
        and 0 < len(text) <= 256 and path.isascii() and text.isascii()
        and all(32 < ord(c) < 127 for c in path + text)
        for path, text in links.items()), "invalid independent link claims")
    traces = guest_packet["aliasTraces"]
    records = {r["path"]: r for r in guest_packet["fdObservation"]["files"]}
    _require(type(traces) is dict and set(traces) == paths,
             "Guest aliases/manifest differ")
    used_links: set[str] = set()
    for path, trace in traces.items():
        _require(type(trace) is dict and set(trace) == TRACE_FIELDS
                 and trace["logicalPath"] == path
                 and type(trace["proposedCanonicalPath"]) is str
                 and re.fullmatch(r"/[A-Za-z0-9_.+/-]+",
                                  trace["proposedCanonicalPath"]) is not None
                 and all(p not in ("", ".", "..")
                         for p in trace["proposedCanonicalPath"][1:].split("/"))
                 and type(trace["observedLinkCandidates"]) is list
                 and len(trace["observedLinkCandidates"]) <= 8
                 and trace["finalDevice"] == records[path]["device"]
                 and trace["finalDevice"] == session["rootDevice"]
                 and type(trace["finalDevice"]) is int
                 and trace["finalInode"] == records[path]["inode"]
                 and type(trace["finalInode"]) is int
                 and trace["finalMountId"] == session["rootMountId"]
                 and type(trace["finalMountId"]) is int,
                 "Guest B1 alias trace/FD mismatch")
        for flag in ("externalPinProvenanceAuthenticated",
                     "pathAndRootProvenanceAuthenticated",
                     "dynamicDependencyClosureVerified", "readyToInstall",
                     "authorizedToMutateProduction"):
            _require(trace[flag] is False, "forged B1 authority")
        _require(trace["decision"] == "BLOCKED", "forged B1 decision")
        for link in trace["observedLinkCandidates"]:
            _require(type(link) is dict and set(link) == LINK_FIELDS
                     and link["linkPath"] in links
                     and link["linkText"] == links[link["linkPath"]]
                     and type(link["device"]) is int
                     and link["device"] == session["rootDevice"]
                     and type(link["inode"]) is int and link["inode"] > 0
                     and link["uid"] == 0 and type(link["uid"]) is int
                     and link["gid"] == 0 and type(link["gid"]) is int
                     and link["mountId"] == session["rootMountId"]
                     and type(link["mountId"]) is int
                     and type(link["mode"]) is int,
                     "Guest link differs from package claim")
            used_links.add(link["linkPath"])
    _require(used_links == set(links), "unused package alias claim")
    return {
        "schema": "sanq.c5.g2.r1.b2b2b2.offline-claim-review.v1",
        "fileClaimsConsistent": True,
        "hostAndGuestIdentityClaimsAgree": True,
        "packageAndObservedByteClaimsAgree": True,
        "detachedReceiptDigestsMatch": True,
        "realGuestRootAuthenticated": False,
        "hostWitnessIndependentlyAuthenticated": False,
        "ubuntuReleaseSignaturesVerified": False,
        "originalArchiveCustodyIndependentlyAuthenticated": False,
        "actualPythonElfDlopenConsumptionWitnessed": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
