"""Offline-only first-install VM frame validation.

This module is intentionally NOT an SSH submitter, AWS verifier, snapshot confirmer,
or reply generator. It models one untrusted three-request sequence from the
existing VM installer before any live peer is exposed.
"""
import datetime as dt
import hashlib
import json
import re


class FrameRejected(ValueError):
    """Fail closed; a rejected session must not be resumed."""


def _need(condition):
    if not condition:
        raise FrameRejected("first-install request is invalid or contradicts this review session")


def _hex(value, count):
    return type(value) is str and re.fullmatch(r"[a-f0-9]{" + str(count) + r"}", value) is not None


def _canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=True, allow_nan=False) + "\n").encode("ascii")


def _pairs(items):
    result = {}
    for key, value in items:
        _need(key not in result)
        result[key] = value
    return result


def _frame(raw, maximum):
    _need(type(raw) is bytes and 0 < len(raw) <= maximum)
    try:
        value = json.loads(raw.decode("ascii"), object_pairs_hook=_pairs,
                           parse_constant=lambda _: _need(False))
        _need(type(value) is dict and raw == _canonical(value))
        return value
    except (ValueError, UnicodeError, TypeError, RecursionError):
        raise FrameRejected("first-install request is not canonical bounded JSON") from None


def _time(value):
    _need(type(value) is str and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z", value) is not None)
    try:
        dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise FrameRejected("invalid first-install observation timestamp") from None


class Review:
    """Single-use, monotonic in-memory observation of three VM frames.

    Caller MUST bind the source and retained materials independently; this does
    not verify their provenance. Nothing here emits an acknowledgement or
    authorizes live task submission.
    """
    __slots__ = ("source", "retention", "target", "target_sha", "phase",
                 "installation", "challenge", "snap", "failed",
                 "index_transfer_sha", "offhost_attempted", "offhost_ack_sha")

    def __init__(self, source, retention, target_raw):
        _need(_hex(source, 40) and _hex(retention, 64))
        target = _frame(target_raw, 65536)
        _need(set(target) == {"schemaVersion", "kind", "accountId", "region", "instanceArn",
                              "instanceName", "sshTarget", "sshHostKeySha256",
                              "linuxSystemDisk", "operatorConfirmed", "instance"}
              and type(target["schemaVersion"]) is int and target["schemaVersion"] == 1
              and target["kind"] == "sanq-minimal-pre-snapshot-target"
              and target["operatorConfirmed"] is True
              and all(type(target[key]) is str for key in
                      ("accountId", "region", "instanceArn", "instanceName"))
              and type(target["instance"]) is dict
              and type(target["instance"].get("location")) is dict
              and type(target["instance"]["location"].get("availabilityZone")) is str)
        # The caller must first run the existing Mac _target_value(raw, profile)
        # against the fixed profile; this is a second structural assertion.
        self.source, self.retention, self.target = source, retention, target
        self.target_sha = hashlib.sha256(target_raw).hexdigest()
        self.phase = 0
        self.installation = self.challenge = self.snap = None
        self.failed = False
        self.index_transfer_sha = None
        self.offhost_attempted = False
        self.offhost_ack_sha = None

    def _target_request(self, frame):
        _need(set(frame) == {"schemaVersion", "kind", "sourceSha", "retentionId",
                             "maxWaitSeconds", "installationComplete", "canExecute"}
              and frame["kind"] == "sanq-minimal-install-target-request"
              and frame["sourceSha"] == self.source and frame["retentionId"] == self.retention
              and type(frame["maxWaitSeconds"]) is int and frame["maxWaitSeconds"] == 30
              and frame["installationComplete"] is False and frame["canExecute"] is False)
        self.phase = 1
        return "TARGET_REQUEST_MATCHED"

    def _snapshot_request(self, frame):
        hashes = ("installationId", "intentSha256", "writersSha256", "archiveSha256",
                  "receiptSha256", "challenge", "targetInputSha256", "targetStorageSha256")
        fields = {"schemaVersion", "kind", *hashes, "maxWaitSeconds",
                  "snapshotAvailable", "canExecute", "reviewMode", "expectedSnapshotName",
                  "expectedTarget", "challengePreparedAt"}
        expected = {key: self.target[key] for key in
                    ("accountId", "region", "instanceArn", "instanceName")}
        _need(set(frame) == fields and frame["kind"] == "sanq-minimal-snapshot-evidence-request"
              and type(frame["maxWaitSeconds"]) is int and frame["maxWaitSeconds"] == 1800
              and frame["snapshotAvailable"] is False and frame["canExecute"] is False
              and frame["reviewMode"] == "operator-content-v1"
              and type(frame["expectedTarget"]) is dict and frame["expectedTarget"] == expected
              and all(_hex(frame[key], 64) for key in hashes)
              and frame["targetInputSha256"] == self.target_sha
              and frame["expectedSnapshotName"] == "sanq-runtime-" + frame["challenge"])
        _time(frame["challengePreparedAt"])
        self.installation = frame["installationId"]
        self.challenge = frame["challenge"]
        self.snap = {key: frame[key] for key in hashes}
        self.snap["challengePreparedAt"] = frame["challengePreparedAt"]
        self.phase = 2
        return "SNAPSHOT_CHALLENGE_MATCHED"

    def _index_transfer(self, frame):
        _need(set(frame) == {"schemaVersion", "kind", "transferChallenge",
                             "indexSha256", "indexBytes", "index"}
              and frame["kind"] == "sanq-minimal-snapshot-index-transfer"
              and _hex(frame["transferChallenge"], 64)
              and _hex(frame["indexSha256"], 64)
              and type(frame["indexBytes"]) is int
              and type(frame["index"]) is dict)
        index_raw = _canonical(frame["index"])
        _need(frame["indexBytes"] == len(index_raw)
              and frame["indexSha256"] == hashlib.sha256(index_raw).hexdigest())
        idx = frame["index"]
        hashes = ("intentSha256", "writersSha256", "archiveSha256", "receiptSha256",
                  "requestSha256", "replySha256", "evidenceSha256",
                  "targetInputSha256", "targetStorageSha256", "snapshotReviewSha256")
        identities = ("installationId", "retentionId", "challenge")
        flags = ("offHostRetentionConfirmed", "snapshotContainsFinalReview",
                 "awsOriginAuthenticated", "trustedTimeProven", "restoreProven",
                 "snapshotAvailable", "recoveryReady", "canExecute")
        fields = {"schemaVersion", "kind", *hashes, *identities, *flags,
                  "requiresOffHostRetention", "targetSourceSha", "installedRuntimeSourceSha",
                  "snapshotReviewBytes", "snapshotArn", "snapshotName",
                  "fromInstanceArn", "fromInstanceName", "accountId", "region",
                  "sourceAvailabilityZone", "snapshotAvailabilityZone", "createdAt",
                  "availableObservedAt", "transactionPath", "retentionPath",
                  "snapshotReviewFile", "recoveryFiles"}
        _need(set(idx) == fields and type(idx["schemaVersion"]) is int
              and idx["schemaVersion"] == 1
              and idx["kind"] == "sanq-minimal-snapshot-offhost-index"
              and all(_hex(idx[key], 64) for key in (*hashes, *identities))
              and _hex(idx["targetSourceSha"], 40)
              and _hex(idx["installedRuntimeSourceSha"], 40)
              and all(idx[key] is False for key in flags)
              and idx["requiresOffHostRetention"] is True
              and type(idx["snapshotReviewBytes"]) is int
              and 0 < idx["snapshotReviewBytes"] <= 192 * 1024
              and idx["targetSourceSha"] == self.source
              and idx["retentionId"] == self.retention
              and idx["installationId"] == self.installation
              and idx["challenge"] == self.challenge
              and all(idx[key] == self.snap[key] for key in
                      ("intentSha256", "writersSha256", "archiveSha256",
                       "receiptSha256", "targetInputSha256", "targetStorageSha256"))
              and idx["snapshotName"] == "sanq-runtime-" + self.challenge
              and idx["fromInstanceArn"] == self.target["instanceArn"]
              and idx["fromInstanceName"] == self.target["instanceName"]
              and idx["accountId"] == self.target["accountId"]
              and idx["region"] == self.target["region"]
              and idx["snapshotReviewFile"] == "snapshot-review.json"
              and idx["recoveryFiles"] == ["recovery.json", "recovery.tar"]
              and idx["transactionPath"] ==
                  "/opt/sanq/deploy-state/installation-runs/" + self.installation
              and idx["retentionPath"] ==
                  "/opt/sanq/deploy-state/installations/" + self.retention
              and idx["sourceAvailabilityZone"] ==
                  self.target["instance"]["location"]["availabilityZone"]
              and idx["snapshotAvailabilityZone"] in
                  ("all", idx["sourceAvailabilityZone"])
              and type(idx["snapshotArn"]) is str
              and idx["snapshotArn"].startswith("arn:aws:lightsail:"
                  + idx["region"] + ":" + idx["accountId"] + ":InstanceSnapshot/")
              and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}",
                  idx["snapshotArn"].split("InstanceSnapshot/")[-1]) is not None)
        _time(idx["createdAt"])
        _time(idx["availableObservedAt"])
        _need(self.snap["challengePreparedAt"] <= idx["createdAt"]
              <= idx["availableObservedAt"])
        self.phase = 3
        return "OFFHOST_INDEX_TRANSFER_MATCHED"

    def inspect(self, raw):
        _need(not self.failed and self.phase in (0, 1, 2))
        try:
            frame = _frame(raw, 4096 if self.phase < 2 else 32768)
            _need(type(frame.get("schemaVersion")) is int and frame["schemaVersion"] == 1)
            if self.phase == 0:
                outcome = self._target_request(frame)
            elif self.phase == 1:
                outcome = self._snapshot_request(frame)
            else:
                outcome = self._index_transfer(frame)
                # Bind later local retention to the exact third-frame bytes.
                self.index_transfer_sha = hashlib.sha256(raw).hexdigest()
            return {"schemaVersion": 1, "kind": "sanq-mac-install-peer-frame-observation",
                    "outcome": outcome, "requestSourceSha": self.source,
                    "retentionId": self.retention, "phase": self.phase,
                    "operatorReplyGenerated": False, "remoteOperationPerformed": False,
                    "awsOriginAuthenticated": False, "snapshotAvailable": False,
                    "offHostRetentionConfirmed": False, "installationComplete": False,
                    "canExecute": False, "readyToInstall": False, "restoreProven": False}
        except BaseException:
            self.failed = True
            raise
