"""Snapshot evidence reply reviews, offline-only. No AWS/SSH or generated ACK."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sanq_install_evidence as review
import sanq_install_frames as frames
import test_sanq_deploy_install_frames as fixture


SENT = "2026-10-31T15:02:01.000000Z"
CREATED = "2026-10-31T15:02:02.000000Z"
OBSERVED = "2026-10-31T15:02:03.000000Z"
RECEIVED = "2026-10-31T15:02:04.000000Z"


def request_round():
    session = frames.Review(fixture.SRC, fixture.RET, frames._canonical(fixture.target()))
    session.inspect(frames._canonical(fixture.first()))
    session.inspect(frames._canonical(fixture.second(session.target_sha)))
    return session


def reply(session):
    target = session.target
    snapshot = {"arn": fixture.SNAP_ARN, "name": "sanq-runtime-" + session.challenge,
                "createdAt": CREATED,
                "location": {"regionName": target["region"], "availabilityZone": "all"},
                "resourceType": "InstanceSnapshot", "state": "available",
                "fromAttachedDisks": [], "fromInstanceArn": target["instanceArn"],
                "fromInstanceName": target["instanceName"], "isFromAutoSnapshot": False,
                "sizeInGb": target["instance"]["hardware"]["disks"][0]["sizeInGb"]}
    operator = {"method": "operator-authenticated-aws-session",
                "accountId": target["accountId"], "region": target["region"],
                "instanceArn": target["instanceArn"], "snapshotArn": snapshot["arn"],
                "authenticatedAwsSession": True, "createdAfterChallenge": True,
                "availableObservedAt": OBSERVED}
    return {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-evidence-reply",
            **{k: session.snap[k] for k in
               ("installationId", "intentSha256", "writersSha256",
                "archiveSha256", "receiptSha256", "challenge")},
            "evidence": {"schemaVersion": 1, "kind": "sanq-minimal-manual-snapshot-content",
                         "instanceSnapshot": snapshot, "operatorVerification": operator}}


class EvidenceReviewTests(unittest.TestCase):
    def setUp(self):
        self.round = request_round()
        self.review = review.EvidenceReview(self.round)
        self.reply = reply(self.round)

    def submit(self, value=None, *, sent=SENT, received=RECEIVED):
        return self.review.inspect(frames._canonical(
            self.reply if value is None else value),
            request_sent_at=sent, reply_received_at=received)

    def test_valid_structure_does_not_authorize_cloud_snapshot_or_installation(self):
        outcome = self.submit()
        self.assertEqual(outcome["outcome"], "SNAPSHOT_EVIDENCE_STRUCTURE_MATCHED")
        self.assertEqual(outcome["installationId"], fixture.INSTALL)
        self.assertEqual(outcome["challenge"], fixture.CHALLENGE)
        self.assertEqual(outcome["retentionId"], fixture.RET)
        self.assertEqual(outcome["claimedSnapshotArn"], fixture.SNAP_ARN)
        for flag in ("awsOriginAuthenticated", "snapshotAvailable",
                     "offHostRetentionConfirmed", "trustedTimeProven",
                     "operatorReplyGenerated", "remoteOperationPerformed",
                     "installationComplete", "canExecute", "readyToInstall", "restoreProven"):
            self.assertIs(outcome[flag], False)
        self.assertTrue(self.review.finished)
        with self.assertRaises(frames.FrameRejected):
            self.submit()

    def test_reply_identity_bound_to_exact_round_and_canonical_bytes(self):
        for field, changed in (("installationId", "f" * 64),
                               ("intentSha256", "f" * 64),
                               ("writersSha256", "f" * 64),
                               ("archiveSha256", "f" * 64),
                               ("receiptSha256", "f" * 64),
                               ("challenge", "f" * 64),
                               ("schemaVersion", True),
                               ("kind", "other-kind")):
            with self.subTest(field=field):
                original = copy.deepcopy(self.reply)
                original[field] = changed
                with self.assertRaises(frames.FrameRejected):
                    review.EvidenceReview(request_round()).inspect(
                        frames._canonical(original),
                        request_sent_at=SENT, reply_received_at=RECEIVED)

    def test_manual_aws_snapshot_identity_and_disk_coverage_fail_closed(self):
        edits = (
            ("arn", fixture.SNAP_ARN.replace("123456789012", "999999999999")),
            ("name", "old-snapshot"),
            ("resourceType", "DiskSnapshot"),
            ("state", "pending"),
            ("state", True),
            ("fromInstanceArn", "wrong"),
            ("fromInstanceName", "wrong"),
            ("isFromAutoSnapshot", True),
            ("isFromAutoSnapshot", 0),
            ("fromAttachedDisks", [{}]),
            ("sizeInGb", 61),
            ("sizeInGb", 60.0),
            ("sizeInGb", True),
            ("sizeInGb", "60"),
        )
        for key, invalid in edits:
            with self.subTest(key=key, invalid=invalid):
                value = copy.deepcopy(self.reply)
                value["evidence"]["instanceSnapshot"][key] = invalid
                with self.assertRaises(frames.FrameRejected):
                    review.EvidenceReview(request_round()).inspect(
                        frames._canonical(value), request_sent_at=SENT,
                        reply_received_at=RECEIVED)

    def test_zone_and_operator_claims_must_match_target(self):
        for section, key, invalid in (
            ("instanceSnapshot", "location", {"regionName": "us-east-1", "availabilityZone": "all"}),
            ("instanceSnapshot", "location", {"regionName": "ca-central-1", "availabilityZone": "us-east-1a"}),
            ("operatorVerification", "method", "unreviewed"),
            ("operatorVerification", "accountId", "000000000000"),
            ("operatorVerification", "region", "us-east-1"),
            ("operatorVerification", "instanceArn", "wrong"),
            ("operatorVerification", "snapshotArn", "wrong"),
            ("operatorVerification", "createdAfterChallenge", False),
            ("operatorVerification", "createdAfterChallenge", 1),
            ("operatorVerification", "authenticatedAwsSession", False),
            ("operatorVerification", "authenticatedAwsSession", 1),
        ):
            value = copy.deepcopy(self.reply)
            value["evidence"][section][key] = invalid
            with self.subTest(section=section, key=key), self.assertRaises(frames.FrameRejected):
                review.EvidenceReview(request_round()).inspect(
                    frames._canonical(value), request_sent_at=SENT,
                    reply_received_at=RECEIVED)

    def test_timestamps_enforce_prepared_sent_created_available_received(self):
        cases = (
            ("createdAt", "2026-10-31T15:02:00.000000Z"),
            ("createdAt", "2026-10-31T15:02:05.000000Z"),
            ("createdAt", "2026-02-30T15:02:02.000000Z"),
            ("availableObservedAt", "2026-10-31T15:02:01.000000Z"),
            ("availableObservedAt", "2026-10-31T15:02:05.000000Z"),
            ("availableObservedAt", "2026-10-31T15:02:03.000000-00:00"),
        )
        for field, when in cases:
            value = copy.deepcopy(self.reply)
            section = ("instanceSnapshot" if field == "createdAt"
                       else "operatorVerification")
            value["evidence"][section][field] = when
            with self.subTest(field=field, when=when), self.assertRaises(frames.FrameRejected):
                review.EvidenceReview(request_round()).inspect(
                    frames._canonical(value), request_sent_at=SENT,
                    reply_received_at=RECEIVED)
        for sent, received in (
            ("2026-10-31T15:01:59.000000Z", RECEIVED),
            ("2026-10-31T15:02:03.000000Z", RECEIVED),
            (SENT, "2026-10-31T15:02:02.000000Z"),
            ("not-a-time", RECEIVED)):
            with self.subTest(sent=sent, received=received), self.assertRaises(frames.FrameRejected):
                review.EvidenceReview(request_round()).inspect(
                    frames._canonical(self.reply), request_sent_at=sent,
                    reply_received_at=received)

    def test_rejected_input_never_reuses_same_evidence_session(self):
        wrong = copy.deepcopy(self.reply)
        wrong["evidence"]["instanceSnapshot"]["state"] = "pending"
        with self.assertRaises(frames.FrameRejected):
            self.submit(wrong)
        self.assertTrue(self.review.failed)
        with self.assertRaises(frames.FrameRejected):
            self.submit()

    def test_before_snapshot_challenge_or_after_index_is_rejected(self):
        before = frames.Review(fixture.SRC, fixture.RET, frames._canonical(fixture.target()))
        before.inspect(frames._canonical(fixture.first()))
        with self.assertRaises(frames.FrameRejected):
            review.EvidenceReview(before)
        self.round.inspect(frames._canonical(fixture.third(
            fixture.second(self.round.target_sha))))
        with self.assertRaises(frames.FrameRejected):
            review.EvidenceReview(self.round)

    def test_unreviewed_target_storage_is_rejected_before_evidence_parsing(self):
        for disk in ([], [{"isSystemDisk": False, "isAttached": True, "sizeInGb": 60}],
                     [{"isSystemDisk": True, "isAttached": False, "sizeInGb": 60}],
                     [{"isSystemDisk": True, "isAttached": True, "sizeInGb": True}],
                     [{"isSystemDisk": True, "isAttached": True, "sizeInGb": 0}]):
            round_model = request_round()
            round_model.target["instance"]["hardware"]["disks"] = disk
            with self.subTest(disk=disk), self.assertRaises(frames.FrameRejected):
                review.EvidenceReview(round_model)

    def test_malformed_noncanonical_duplicate_and_oversized_are_rejected(self):
        raw = frames._canonical(self.reply)
        bad = (raw[:-1], raw[:-1] + b" \n",
               raw.replace(b'"challenge":', b'"challenge":"a","challenge":', 1),
               raw.replace(b'"authenticatedAwsSession":true',
                           b'"authenticatedAwsSession":NaN'),
               raw + b"x" * (64 * 1024))
        for value in bad:
            with self.subTest(size=len(value)), self.assertRaises(frames.FrameRejected):
                review.EvidenceReview(request_round()).inspect(
                    value, request_sent_at=SENT, reply_received_at=RECEIVED)


if __name__ == "__main__":
    unittest.main()
