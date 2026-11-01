"""Offline-only first-install pre-clear completion audit fixtures.

The test never inspects a live VM, controls systemd or asserts installation.
"""
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sanq_install_frames as frames
import sanq_install_result as result

SOURCE = "a" * 40
RET = "b" * 64
INSTALL = "c" * 64
CREATED = "2026-11-01T15:00:00.000000Z"
LATER = "2026-11-01T15:02:00.000000Z"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def original_set():
    raw = {}
    raw["intent.json"] = frames._canonical({
        "schemaVersion": 1, "kind": result.INTENT_KIND, "installationId": INSTALL,
        "retentionId": RET, "targetSourceSha": SOURCE,
        "installedRuntimeSourceSha": "d" * 40, "observationSha256": "e" * 64,
        "createdAt": CREATED, "canExecute": False})
    raw["writers.json"] = frames._canonical({
        "schemaVersion": 1, "kind": result.WRITERS_KIND, "installationId": INSTALL,
        "intentSha256": sha(raw["intent.json"]), "applicationSha": SOURCE,
        "dockerEngineSha256": "0" * 64, "containers": {}, "createdAt": CREATED,
        "canExecute": False})
    raw["recovery.tar"] = b"synthetic test only; never a recovery archive"
    raw["recovery.json"] = frames._canonical({
        "schemaVersion": 1, "kind": "sanq-minimal-executor-recovery-receipt",
        "installationId": INSTALL, "intentSha256": sha(raw["intent.json"]),
        "writersSha256": sha(raw["writers.json"]),
        "archiveSha256": sha(raw["recovery.tar"]),
        "archiveBytes": len(raw["recovery.tar"]), "captureSha256": "1" * 64,
        "canExecute": False, "recoveryReady": False, "snapshotAvailable": False,
        "completePrivateStateCaptured": False})
    raw["snapshot-review.json"] = frames._canonical({
        "schemaVersion": 1, "kind": "sanq-minimal-snapshot-review",
        "installationId": INSTALL,
        "request": {"installationId": INSTALL, "intentSha256": sha(raw["intent.json"]),
                    "writersSha256": sha(raw["writers.json"]),
                    "archiveSha256": sha(raw["recovery.tar"]),
                    "receiptSha256": sha(raw["recovery.json"])},
        "replyOriginal": "synthetic", "requestSentAt": CREATED, "replyReceivedAt": CREATED,
        "result": {}})
    raw["snapshot-offhost.json"] = frames._canonical({
        "schemaVersion": 1, "kind": "sanq-minimal-snapshot-offhost-receipt",
        "installationId": INSTALL,
        "snapshotReviewSha256": sha(raw["snapshot-review.json"]),
        "transferOriginal": "synthetic", "ackOriginal": "synthetic",
        "requestSentAt": CREATED, "replyReceivedAt": CREATED,
        "verificationMethod": "operator-ssh-peer-durable-receipt",
        "offHostLocationIndependentlyAuthenticated": False,
        "canExecute": False, "recoveryReady": False})
    marker = frames._canonical({
        "schemaVersion": 1, "kind": result.INTENT_KIND, "installationId": INSTALL,
        "intentSha256": sha(raw["intent.json"])})
    hashes = {digest: sha(raw[name]) for digest, name in result.COMPLETION_DIGESTS}
    raw["completion.json"] = frames._canonical({
        "schemaVersion": 1, "kind": result.COMPLETION_KIND,
        "installationId": INSTALL, "createdAt": LATER,
        "phase": "PREPARED_BEFORE_MARKER_CLEAR", **hashes,
        "markerSha256": sha(marker), "verificationSha256": "f" * 64,
        "installationComplete": False, "canExecute": False, "restoreProven": False})
    return raw


class PreclearReviewTests(unittest.TestCase):
    def review(self, raw=None, **kwargs):
        return result.review_preclear_records(
            original_set() if raw is None else raw,
            installation_id=kwargs.get("installation_id", INSTALL),
            source_sha=kwargs.get("source_sha", SOURCE),
            retention_id=kwargs.get("retention_id", RET))

    def test_consistent_original_digest_chain_is_never_completion(self):
        report = self.review()
        self.assertEqual(report["outcome"], "PRE_CLEAR_DIGEST_CHAIN_STRUCTURALLY_MATCHED")
        self.assertEqual(report["sourceSha"], SOURCE)
        self.assertEqual(report["retentionId"], RET)
        self.assertEqual(report["installationId"], INSTALL)
        self.assertEqual(report["completionInputSha256"], sha(original_set()["completion.json"]))
        self.assertIs(report["providedByteDigestsMatched"], True)
        self.assertIs(report["markerHashFormulaMatched"], True)
        for field in ("vmOriginalsAuthenticated", "verificationFactsRecomputed",
                      "vmSemanticValidationComplete", "maintenanceMarkerAbsentObserved",
                      "managerGenerationVerified", "applicationHealthVerified",
                      "installationComplete", "canExecute", "readyToInstall", "restoreProven"):
            self.assertIs(report[field], False)

    def test_wrong_request_identity_rejected(self):
        for key, bad in (("installation_id", "d" * 64), ("source_sha", "f" * 40),
                         ("retention_id", "e" * 64), ("source_sha", "A" * 40),
                         ("installation_id", "bad"), ("retention_id", "bad")):
            with self.subTest(key=key, bad=bad), self.assertRaises(frames.FrameRejected):
                self.review(**{key: bad})

    def test_missing_extra_and_ambiguous_sources_rejected(self):
        for change in ("missing", "extra", "not-bytes", "empty"):
            originals = original_set()
            if change == "missing": del originals["completion.json"]
            elif change == "extra": originals["foreign.json"] = b"{}"
            elif change == "not-bytes": originals["recovery.tar"] = "string"
            else: originals["writers.json"] = b""
            with self.subTest(change=change), self.assertRaises(frames.FrameRejected):
                self.review(originals)

    def test_every_original_digest_tamper_is_blocked(self):
        for key in ("intent.json", "writers.json", "recovery.tar", "recovery.json",
                    "snapshot-review.json", "snapshot-offhost.json"):
            originals = original_set()
            originals[key] += b"X"
            with self.subTest(key=key), self.assertRaises(frames.FrameRejected):
                self.review(originals)

    def test_noncanonical_duplicate_or_permission_claim_rejected(self):
        orig = original_set()
        cases = [
            ("completion.json", orig["completion.json"][:-1]),
            ("completion.json", orig["completion.json"].replace(b'"installationComplete":false',
                                                    b'"installationComplete":true')),
            ("completion.json", orig["completion.json"].replace(b'"installationComplete":false',
                     b'"installationComplete":false,"installationComplete":false')),
            ("completion.json", orig["completion.json"].replace(b'"phase":"PREPARED_BEFORE_MARKER_CLEAR"',
                                                                 b'"phase":"COMPLETE"')),
            ("intent.json", orig["intent.json"].replace(b'"canExecute":false',b'"canExecute":true')),
        ]
        for name, bad in cases:
            originals = dict(orig)
            originals[name] = bad
            with self.subTest(name=name), self.assertRaises(frames.FrameRejected):
                self.review(originals)

    def test_marker_checksum_and_in_memory_verification_are_not_grants(self):
        originals = original_set()
        completion = frames._frame(originals["completion.json"], 16384)
        completion["markerSha256"] = "a" * 64
        originals["completion.json"] = frames._canonical(completion)
        with self.assertRaises(frames.FrameRejected):
            self.review(originals)

        originals = original_set()
        completion = frames._frame(originals["completion.json"], 16384)
        completion["verificationSha256"] = "not-proven"
        originals["completion.json"] = frames._canonical(completion)
        with self.assertRaises(frames.FrameRejected):
            self.review(originals)

        # A shaped 64-char verification hash is *not* enough to recompute
        # the VM's ephemeral verification facts; this never grants completion.
        originals = original_set()
        completion = frames._frame(originals["completion.json"], 16384)
        completion["verificationSha256"] = "7" * 64
        originals["completion.json"] = frames._canonical(completion)
        self.assertIs(self.review(originals)["verificationFactsRecomputed"], False)

    def test_late_or_invalid_record_time_rejected(self):
        for value in ("2026-02-30T15:00:00.000000Z",
                      "2026-11-01T14:59:59.000000Z", "no-date"):
            originals = original_set()
            c = frames._frame(originals["completion.json"], 16384)
            c["createdAt"] = value
            originals["completion.json"] = frames._canonical(c)
            with self.subTest(value=value), self.assertRaises(frames.FrameRejected):
                self.review(originals)

    def test_recovery_receipt_claims_cannot_masquerade_as_complete(self):
        for key, bad in (("archiveBytes", 1), ("recoveryReady", True),
                         ("snapshotAvailable", True),
                         ("installationId", "f"*64)):
            originals = original_set()
            record = frames._frame(originals["recovery.json"], 16384)
            record[key] = bad
            originals["recovery.json"] = frames._canonical(record)
            with self.subTest(key=key), self.assertRaises(frames.FrameRejected):
                self.review(originals)


if __name__ == "__main__":
    unittest.main()
