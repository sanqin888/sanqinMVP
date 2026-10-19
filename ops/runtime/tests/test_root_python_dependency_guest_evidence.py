"""B2B2-B2/B2-0: pure, synthetic, non-root Guest/Host/package claims."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from root_python_dependency_manifest import (  # noqa: E402
    SCHEMA as MANIFEST_SCHEMA, canonical_manifest_bytes,
)
from root_python_dependency_fd_observer import (  # noqa: E402
    OBSERVATION_SCHEMA,
)
from root_python_dependency_guest_evidence import (  # noqa: E402
    GuestEvidenceBlocked, build_claimed_guest_packet,
    canonical_guest_claim_bytes,
)
from root_python_dependency_guest_offline_review import (  # noqa: E402
    GuestOfflineEvidenceBlocked, review_separately_claimed_guest_evidence,
)

PY = "/usr/bin/python3.12"
LOADER = "/lib64/ld-linux-x86-64.so.2"
LINKS = {
    "/lib64": "/usr/lib64",
    "/usr/lib64/ld-linux-x86-64.so.2":
        "../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
}
DIGEST = lambda data: hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def _record(path, data, inode):
    return {
        "path": path, "sha256": DIGEST(data), "size": len(data),
        "device": 201, "inode": inode, "mtimeNs": 1000,
        "ctimeNs": 1000, "uid": 0, "gid": 0, "mode": 0o644, "hardlinks": 1,
    }


def evidence_fixture():
    # These are NOT real Python, ELF, Ubuntu distribution, or C2 files.
    bytes_by_path = {PY: b"synthetic python bytes", LOADER: b"synthetic loader bytes"}
    pins = {path: DIGEST(data) for path, data in bytes_by_path.items()}
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "platform": {"os": "linux", "architecture": "x86_64",
                     "pythonVersion": "3.12.3",
                     "isolationFlags": ["-I", "-S", "-B"]},
        "nodes": [
            {"id": "interpreter", "kind": "python-executable",
             "path": PY, "sha256": pins[PY], "requires": ["loader"]},
            {"id": "loader", "kind": "elf-loader", "path": LOADER,
             "sha256": pins[LOADER], "requires": []},
        ],
    }
    manifest_sha = DIGEST(canonical_manifest_bytes(manifest))
    records = [_record(LOADER, bytes_by_path[LOADER], 302),
               _record(PY, bytes_by_path[PY], 301)]
    observation = {
        "schema": OBSERVATION_SCHEMA, "claimedManifestSha256": manifest_sha,
        "files": records, "proposedFileCount": 2,
        "observedTotalBytes": sum(map(len, bytes_by_path.values())),
        "fileBytesObservedFromProvidedFDs": True,
        "preopenedFDAndPathProvenanceAuthenticated": False,
        "independentExternalPinProvenanceAuthenticated": False,
        "pythonImportClosureIndependentlyDiscovered": False,
        "elfNeededAndDlopenClosureIndependentlyDiscovered": False,
        "rootExecutionAttempted": False, "readyToInstall": False,
        "authorizedToMutateProduction": False, "decision": "BLOCKED",
    }
    def trace(path, inode, canonical_path, links):
        return {
            "logicalPath": path, "proposedCanonicalPath": canonical_path,
            "observedLinkCandidates": [
                {"linkPath": p, "linkText": LINKS[p], "device": 201,
                 "inode": 500 + i, "uid": 0, "gid": 0,
                 "mode": 0o777, "mountId": 99}
                for i, p in enumerate(links)
            ],
            "finalDevice": 201, "finalInode": inode, "finalMountId": 99,
            "externalPinProvenanceAuthenticated": False,
            "pathAndRootProvenanceAuthenticated": False,
            "dynamicDependencyClosureVerified": False,
            "readyToInstall": False,
            "authorizedToMutateProduction": False, "decision": "BLOCKED",
        }
    traces = {
        PY: trace(PY, 301, PY, []),
        LOADER: trace(LOADER, 302,
                      "/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
                      list(LINKS)),
    }
    session = {
        "sessionId": "synthetic-B2-0-01",
        "vmUuid": "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        "diskUuid": "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        "snapshotUuid": "cccccccc-cccc-4ccc-cccc-cccccccccccc",
        "guestBootId": "dddddddd-dddd-4ddd-dddd-dddddddddddd",
        "rootFsUuid": "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
        "osId": "ubuntu", "osVersion": "24.04.5",
        "architecture": "x86_64", "pythonVersion": "3.12.3",
        "mountNamespace": "mnt:[4026531841]", "rootMountId": 99,
        "rootDevice": 201, "rootInode": 2, "rootUid": 0, "rootGid": 0,
        "rootMode": 0o40755, "observedAtUtc": "2026-10-18T22:00:00Z",
    }
    collector = {
        "repoCommitSha": "f" * 40, "collectorSourceSha256": "a" * 64,
        "collectorId": "guestCollector",
        "commandId": "b2b2b2-guest-readonly-evidence-v1", "exitCode": 0,
    }
    packet = build_claimed_guest_packet(
        manifest, expected_manifest_sha256=manifest_sha,
        proposed_file_pins=pins, proposed_exact_links=LINKS,
        alias_traces=traces, fd_observation=observation,
        session=session, collector=collector,
    )
    host = {
        "vmUuid": session["vmUuid"], "diskUuid": session["diskUuid"],
        "snapshotUuid": session["snapshotUuid"],
        "rootFsUuid": session["rootFsUuid"], "observerId": "macHostWitness",
        "originalEvidenceSha256": "b" * 64,
        "recordedAtUtc": "2026-10-18T22:01:00Z", "exitCode": 0,
    }
    packages = {
        "files": {
            path: {
                "fileSha256": sha, "packageName": "python3.12-minimal"
                if path == PY else "libc6",
                "packageVersion": "3.12.3-1ubuntu0.1",
                "architecture": "amd64", "debSha256": "c" * 64,
                "signedReleaseSha256": "d" * 64,
                "signingKeyFingerprint": "e" * 40,
                "sourceRef": "ubuntu-pool-object-01",
            }
            for path, sha in pins.items()
        },
        "links": dict(LINKS),
    }
    custody = {
        "guestPacketSha256": DIGEST(canonical(packet)),
        "fdObservationSha256": DIGEST(canonical(observation)),
        "hostRecordSha256": DIGEST(canonical(host)),
        "packageRecordSha256": DIGEST(canonical(packages)),
        "guestCollectorId": "guestCollector",
        "hostWitnessId": "macHostWitness",
        "packageWitnessId": "ubuntuArchiveWitness",
        "reviewerId": "offlineReviewer",
        "offlineEvidenceRef": "private-artifact-001",
    }
    return manifest, packet, manifest_sha, host, packages, custody


def reseal(packet, host, packages, custody):
    """Only fixes synthetic digests so negative tests reach deeper guards."""
    custody["guestPacketSha256"] = DIGEST(canonical(packet))
    custody["fdObservationSha256"] = DIGEST(canonical(packet["fdObservation"]))
    custody["hostRecordSha256"] = DIGEST(canonical(host))
    custody["packageRecordSha256"] = DIGEST(canonical(packages))


class GuestClaimsTests(unittest.TestCase):
    def test_candidate_only_guest_packet_and_canonical_encoding(self):
        _, packet, _, _, _, _ = evidence_fixture()
        self.assertEqual(DIGEST(canonical_guest_claim_bytes(packet)),
                         DIGEST(canonical(packet)))
        for name in ("rootAndPlatformAuthenticated",
                     "externalReleaseProvenanceAuthenticated",
                     "actualExecutionWitnessed", "readyToInstall",
                     "authorizedToMutateProduction"):
            self.assertIs(packet[name], False)
        self.assertEqual(packet["decision"], "BLOCKED")

    def test_invalid_guest_session_and_root_anchor_are_blocked(self):
        manifest, packet, sha, _, packages, _ = evidence_fixture()
        for field, value in (("vmUuid", "not-a-uuid"), ("rootUid", 1000),
                             ("rootMode", 0o40777), ("rootMountId", 0),
                             ("mountNamespace", "mnt:unknown"),
                             ("pythonVersion", "3.13.0")):
            with self.subTest(field=field):
                sess = dict(packet["session"], **{field: value})
                with self.assertRaises(GuestEvidenceBlocked):
                    build_claimed_guest_packet(
                        manifest, expected_manifest_sha256=sha,
                        proposed_file_pins={
                            p: v["fileSha256"]
                            for p, v in packages["files"].items()},
                        proposed_exact_links=LINKS,
                        alias_traces=packet["aliasTraces"],
                        fd_observation=packet["fdObservation"],
                        session=sess, collector=packet["collector"])

    def test_inconsistent_fd_link_and_authority_are_blocked(self):
        manifest, packet, sha, _, packages, _ = evidence_fixture()
        for field, value in (("finalInode", 999),
                             ("finalMountId", 88),
                             ("authorizedToMutateProduction", True)):
            with self.subTest(field=field):
                traces = copy.deepcopy(packet["aliasTraces"])
                traces[LOADER][field] = value
                with self.assertRaises(GuestEvidenceBlocked):
                    build_claimed_guest_packet(
                        manifest, expected_manifest_sha256=sha,
                        proposed_file_pins={
                            p: v["fileSha256"]
                            for p, v in packages["files"].items()},
                        proposed_exact_links=LINKS,
                        alias_traces=traces,
                        fd_observation=packet["fdObservation"],
                        session=packet["session"], collector=packet["collector"])

    def test_root_mount_device_claim_cannot_diverge_from_final_fd(self):
        manifest, packet, sha, _, packages, _ = evidence_fixture()
        changed_session = dict(packet["session"], rootDevice=999)
        with self.assertRaises(GuestEvidenceBlocked):
            build_claimed_guest_packet(
                manifest, expected_manifest_sha256=sha,
                proposed_file_pins={
                    p: v["fileSha256"] for p, v in packages["files"].items()},
                proposed_exact_links=LINKS,
                alias_traces=packet["aliasTraces"],
                fd_observation=packet["fdObservation"],
                session=changed_session, collector=packet["collector"])

    def test_packet_is_detached_from_mutable_trace_input(self):
        manifest, packet, sha, _, packages, _ = evidence_fixture()
        traces = copy.deepcopy(packet["aliasTraces"])
        built = build_claimed_guest_packet(
            manifest, expected_manifest_sha256=sha,
            proposed_file_pins={
                p: v["fileSha256"] for p, v in packages["files"].items()},
            proposed_exact_links=LINKS, alias_traces=traces,
            fd_observation=packet["fdObservation"],
            session=packet["session"], collector=packet["collector"])
        traces[PY]["finalInode"] = 999
        self.assertEqual(built["aliasTraces"][PY]["finalInode"], 301)

    def test_extra_links_and_failed_capture_are_blocked(self):
        manifest, packet, sha, _, packages, _ = evidence_fixture()
        for links, collector in [
            ({**LINKS, "/unexpected": "elsewhere"}, packet["collector"]),
            (LINKS, dict(packet["collector"], exitCode=1)),
        ]:
            with self.assertRaises(GuestEvidenceBlocked):
                build_claimed_guest_packet(
                    manifest, expected_manifest_sha256=sha,
                    proposed_file_pins={
                        p: v["fileSha256"]
                        for p, v in packages["files"].items()},
                    proposed_exact_links=links,
                    alias_traces=packet["aliasTraces"],
                    fd_observation=packet["fdObservation"],
                    session=packet["session"], collector=collector)


class OfflineClaimReviewTests(unittest.TestCase):
    def setUp(self):
        (self.manifest, self.packet, self.manifest_sha,
         self.host, self.packages, self.custody) = evidence_fixture()

    def review(self):
        return review_separately_claimed_guest_evidence(
            self.manifest, self.packet,
            expected_manifest_sha256=self.manifest_sha,
            host_record=self.host, package_record=self.packages,
            custody=self.custody)

    def test_matching_detached_claims_still_block_all_authority(self):
        result = self.review()
        self.assertIs(result["detachedReceiptDigestsMatch"], True)
        self.assertIs(result["realGuestRootAuthenticated"], False)
        self.assertIs(result["ubuntuReleaseSignaturesVerified"], False)
        self.assertIs(result["hostWitnessIndependentlyAuthenticated"], False)
        self.assertIs(result["actualPythonElfDlopenConsumptionWitnessed"], False)
        self.assertIs(result["authorizedToMutateProduction"], False)
        self.assertEqual(result["decision"], "BLOCKED")

    def test_host_identity_conflict_even_if_resealed(self):
        self.host["diskUuid"] = "99999999-9999-4999-9999-999999999999"
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_altered_package_bytes_even_if_resealed(self):
        self.packages["files"][LOADER]["fileSha256"] = "1" * 64
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_root_mount_device_conflict_even_if_resealed(self):
        self.packet["session"]["rootDevice"] = 999
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_wrong_package_link_even_if_resealed(self):
        self.packages["links"]["/lib64"] = "../outside"
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_guest_inode_conflict_even_if_resealed(self):
        self.packet["aliasTraces"][PY]["finalInode"] = 9999
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_authority_forgery_even_if_resealed(self):
        self.packet["readyToInstall"] = True
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_repeated_actor_identity_blocks_claim_of_independence(self):
        self.custody["reviewerId"] = self.custody["hostWitnessId"]
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_missing_raw_evidence_digest_is_blocked(self):
        self.host["originalEvidenceSha256"] = ""
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_malformed_or_tampered_receipt_digest_is_blocked(self):
        self.custody["guestPacketSha256"] = "0" * 64
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_missing_package_member_and_extra_field_blocked(self):
        self.packages["files"].pop(PY)
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()
        self.setUp()
        self.packages["files"][PY]["trusted"] = True
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_guest_observation_forged_flags_fail_even_if_resealed(self):
        self.packet["fdObservation"]["rootExecutionAttempted"] = True
        reseal(self.packet, self.host, self.packages, self.custody)
        with self.assertRaises(GuestOfflineEvidenceBlocked):
            self.review()

    def test_untrusted_source_reference_is_only_a_claim(self):
        self.packages["files"][PY]["sourceRef"] = "private-synthetic-claim"
        reseal(self.packet, self.host, self.packages, self.custody)
        self.assertIs(self.review()["ubuntuReleaseSignaturesVerified"], False)


if __name__ == "__main__":
    unittest.main()
