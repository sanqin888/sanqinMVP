"""Offline fixtures for one bounded first-install Mac peer request sequence.

No SSH, systemd, AWS API, snapshot, durable ACK, or production writes.
"""
import copy
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sanq_install_frames as frames


SRC = "a" * 40
RET = "b" * 64
INSTALL = "c" * 64
CHALLENGE = "d" * 64
STAMP = "2026-10-31T15:02:00.000000Z"
ARN = "arn:aws:lightsail:ca-central-1:123456789012:Instance/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
SNAP_ARN = "arn:aws:lightsail:ca-central-1:123456789012:InstanceSnapshot/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def target():
    return {"schemaVersion": 1, "kind": "sanq-minimal-pre-snapshot-target",
            "accountId": "123456789012", "region": "ca-central-1",
            "instanceArn": ARN, "instanceName": "sanq-prod",
            "sshTarget": "52.60.180.44", "sshHostKeySha256": "SHA256:" + "A" * 43,
            "linuxSystemDisk": "/dev/sda", "operatorConfirmed": True,
            "instance": {"arn": ARN, "name": "sanq-prod", "resourceType": "Instance",
                         "location": {"regionName": "ca-central-1",
                                      "availabilityZone": "ca-central-1a"},
                         "hardware": {"disks": [{"isSystemDisk": True, "isAttached": True,
                                                "sizeInGb": 60, "path": "/dev/xvda"}]}}}


def first():
    return {"schemaVersion": 1, "kind": "sanq-minimal-install-target-request",
            "sourceSha": SRC, "retentionId": RET, "maxWaitSeconds": 30,
            "installationComplete": False, "canExecute": False}


def second(sha):
    return {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-evidence-request",
            "installationId": INSTALL, "intentSha256": "1" * 64, "writersSha256": "2" * 64,
            "archiveSha256": "3" * 64, "receiptSha256": "4" * 64,
            "challenge": CHALLENGE, "maxWaitSeconds": 1800,
            "snapshotAvailable": False, "canExecute": False,
            "reviewMode": "operator-content-v1",
            "expectedSnapshotName": "sanq-runtime-" + CHALLENGE,
            "targetInputSha256": sha, "targetStorageSha256": "5" * 64,
            "expectedTarget": {"accountId": "123456789012", "region": "ca-central-1",
                               "instanceArn": ARN, "instanceName": "sanq-prod"},
            "challengePreparedAt": STAMP}


def third(snapshot):
    index = {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-offhost-index",
             "installationId": INSTALL, "retentionId": RET, "challenge": CHALLENGE,
             "intentSha256": snapshot["intentSha256"],
             "writersSha256": snapshot["writersSha256"],
             "archiveSha256": snapshot["archiveSha256"],
             "receiptSha256": snapshot["receiptSha256"],
             "requestSha256": "6" * 64, "replySha256": "7" * 64, "evidenceSha256": "8" * 64,
             "targetInputSha256": snapshot["targetInputSha256"],
             "targetStorageSha256": snapshot["targetStorageSha256"],
             "snapshotReviewSha256": "9" * 64,
             "offHostRetentionConfirmed": False, "snapshotContainsFinalReview": False,
             "awsOriginAuthenticated": False, "trustedTimeProven": False,
             "restoreProven": False, "snapshotAvailable": False, "recoveryReady": False,
             "canExecute": False, "requiresOffHostRetention": True,
             "targetSourceSha": SRC, "installedRuntimeSourceSha": "f" * 40,
             "snapshotReviewBytes": 1200,
             "snapshotArn": SNAP_ARN, "snapshotName": "sanq-runtime-" + CHALLENGE,
             "fromInstanceArn": ARN, "fromInstanceName": "sanq-prod",
             "accountId": "123456789012", "region": "ca-central-1",
             "sourceAvailabilityZone": "ca-central-1a",
             "snapshotAvailabilityZone": "all",
             "createdAt": STAMP, "availableObservedAt": "2026-10-31T15:03:00.000000Z",
             "transactionPath": "/opt/sanq/deploy-state/installation-runs/" + INSTALL,
             "retentionPath": "/opt/sanq/deploy-state/installations/" + RET,
             "snapshotReviewFile": "snapshot-review.json",
             "recoveryFiles": ["recovery.json", "recovery.tar"]}
    raw = frames._canonical(index)
    import hashlib
    return {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-index-transfer",
            "transferChallenge": "e" * 64, "indexSha256": hashlib.sha256(raw).hexdigest(),
            "indexBytes": len(raw), "index": index}


def reseal(transfer):
    import hashlib
    value = copy.deepcopy(transfer)
    raw = frames._canonical(value["index"])
    value["indexBytes"] = len(raw)
    value["indexSha256"] = hashlib.sha256(raw).hexdigest()
    return value


class FrameModelTests(unittest.TestCase):
    def start(self):
        target_raw = frames._canonical(target())
        return frames.Review(SRC, RET, target_raw)

    def after_first(self):
        model = self.start()
        model.inspect(frames._canonical(first()))
        return model

    def after_second(self):
        model = self.after_first()
        snap = second(model.target_sha)
        model.inspect(frames._canonical(snap))
        return model, snap

    def test_full_three_frame_sequence_is_observation_only(self):
        model = self.start()
        for stage, request, expected in (
            (1, first(), "TARGET_REQUEST_MATCHED"),
            (2, second(model.target_sha), "SNAPSHOT_CHALLENGE_MATCHED"),
            (3, third(second(model.target_sha)), "OFFHOST_INDEX_TRANSFER_MATCHED"),
        ):
            status = model.inspect(frames._canonical(request))
            self.assertEqual(status["outcome"], expected)
            self.assertEqual(status["phase"], stage)
            self.assertEqual((status["requestSourceSha"], status["retentionId"]), (SRC, RET))
            for key in ("operatorReplyGenerated", "remoteOperationPerformed", "awsOriginAuthenticated",
                        "snapshotAvailable", "offHostRetentionConfirmed", "installationComplete",
                        "canExecute", "readyToInstall", "restoreProven"):
                self.assertIs(status[key], False)
        with self.assertRaises(frames.FrameRejected):
            model.inspect(frames._canonical(first()))

    def test_target_request_rejects_other_source_retention_and_false_claims(self):
        for key, value in (("sourceSha", "z" * 40), ("retentionId", "c" * 64),
                           ("maxWaitSeconds", 31), ("maxWaitSeconds", True),
                           ("installationComplete", True), ("canExecute", True),
                           ("kind", "other-kind"), ("extra", "anything")):
            with self.subTest(key=key, value=value):
                model = self.start()
                request = first()
                request[key] = value
                with self.assertRaises(frames.FrameRejected):
                    model.inspect(frames._canonical(request))
                with self.assertRaises(frames.FrameRejected):
                    model.inspect(frames._canonical(first()))

    def test_second_requires_target_original_hash_and_exact_operator_target(self):
        for change, value in (("targetInputSha256", "f" * 64),
                              ("challenge", "g" * 64),
                              ("maxWaitSeconds", 1801),
                              ("snapshotAvailable", True),
                              ("canExecute", True),
                              ("reviewMode", "auto-approve"),
                              ("targetStorageSha256", "bad"),
                              ("expectedSnapshotName", "wrong"),
                              ("challengePreparedAt", "2026-02-31T15:00:00.000000Z"),
                              ("extra", "anything")):
            with self.subTest(change=change):
                model = self.after_first()
                request = second(model.target_sha)
                request[change] = value
                with self.assertRaises(frames.FrameRejected):
                    model.inspect(frames._canonical(request))
        model = self.after_first()
        request = second(model.target_sha)
        request["expectedTarget"]["instanceArn"] = "other"
        with self.assertRaises(frames.FrameRejected):
            model.inspect(frames._canonical(request))

    def test_index_rejects_transaction_cross_binding_even_if_rehashed(self):
        for key, value in (("installationId", "f" * 64), ("retentionId", "f" * 64),
                           ("challenge", "f" * 64), ("intentSha256", "f" * 64),
                           ("targetInputSha256", "f" * 64),
                           ("targetStorageSha256", "f" * 64),
                           ("targetSourceSha", "e" * 40),
                           ("snapshotName", "other"),
                           ("fromInstanceArn", "other"),
                           ("offHostRetentionConfirmed", True),
                           ("canExecute", True),
                           ("transactionPath", "/tmp/anything"),
                           ("snapshotReviewFile", "other.json"),
                           ("recoveryFiles", ["recovery.tar", "recovery.json"]),
                           ("schemaVersion", True),
                           ("createdAt", "2026-10-31T15:01:59.000000Z")):
            with self.subTest(key=key):
                model, snapshot = self.after_second()
                payload = third(snapshot)
                payload["index"][key] = value
                with self.assertRaises(frames.FrameRejected):
                    model.inspect(frames._canonical(reseal(payload)))

    def test_index_transfer_tamper_with_digest_and_size_rejected(self):
        for key in ("indexSha256", "indexBytes", "transferChallenge"):
            model, snap = self.after_second()
            payload = third(snap)
            payload[key] = ("bad" if key != "indexBytes" else 1)
            with self.subTest(key=key), self.assertRaises(frames.FrameRejected):
                model.inspect(frames._canonical(payload))

    def test_noncanonical_duplicate_oversized_and_out_of_order_frames(self):
        good = frames._canonical(first())
        bad = (good[:-1], good.replace(b'"schemaVersion":1', b'"schemaVersion":1 '),
               good.replace(b'"sourceSha":', b'"sourceSha":"e","sourceSha":'),
               good.replace(b'"canExecute":false', b'"canExecute":NaN'),
               good + b"x" * 4096)
        for raw in bad:
            with self.subTest(raw=raw[:48]), self.assertRaises(frames.FrameRejected):
                self.start().inspect(raw)
        with self.assertRaises(frames.FrameRejected):
            self.start().inspect(frames._canonical(second("0" * 64)))
        with self.assertRaises(frames.FrameRejected):
            self.after_first().inspect(frames._canonical(first()))

    def test_invalid_state_cannot_be_resumed_or_silently_restarted(self):
        model = self.after_first()
        wrong = second(model.target_sha)
        wrong["challenge"] = "X"
        with self.assertRaises(frames.FrameRejected):
            model.inspect(frames._canonical(wrong))
        with self.assertRaises(frames.FrameRejected):
            model.inspect(frames._canonical(second(model.target_sha)))

    def test_constructor_rejects_malformed_retention_identity_or_input(self):
        for source, retention, raw in ((SRC[:-1], RET, frames._canonical(target())),
                                       (SRC, RET[:-1], frames._canonical(target())),
                                       (SRC, RET, b"{}")):
            with self.assertRaises(frames.FrameRejected):
                frames.Review(source, retention, raw)


if __name__ == "__main__":
    unittest.main()
