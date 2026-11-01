"""Offline review of the operator's claimed manual Lightsail snapshot evidence.

No AWS API calls, SSH, reply emission, durable file retention, installation
submission, or authorization. The VM remains the owner of the complete snapshot
content and recovery proof. A successful structural review is never a permit.
"""
import datetime as dt
import hashlib
import re

import sanq_install_frames as frames


def _need(condition):
    frames._need(condition)


def _timestamp(value):
    _need(type(value) is str and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
        r"(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})", value) is not None)
    _need(not value.endswith("-00:00"))
    offset = "+00:00" if value.endswith("Z") else value[-6:]
    _need(int(offset[1:3]) < 24 and int(offset[4:]) < 60)
    try:
        return dt.datetime.fromisoformat(value[:-1] + "+00:00"
            if value.endswith("Z") else value).astimezone(dt.timezone.utc)
    except (ValueError, OverflowError):
        raise frames.FrameRejected("snapshot time value is invalid") from None


class EvidenceReview:
    """Single-use, request-bound evidence comparison against a validated VM round.

    The caller must separately authenticate AWS and prepare real operator
    evidence. The input is untrusted and is not transformed into a VM reply.
    """

    __slots__ = ("round", "finished", "failed", "snapshot_identity", "reply_sha256")

    def __init__(self, review):
        _need(type(review) is frames.Review and review.phase == 2
              and review.failed is False
              and review.installation is not None and review.challenge is not None)
        instance = review.target["instance"]
        _need(type(instance.get("hardware")) is dict
              and type(instance["hardware"].get("disks")) is list
              and len(instance["hardware"]["disks"]) == 1)
        disk = instance["hardware"]["disks"][0]
        _need(type(disk) is dict and disk.get("isSystemDisk") is True
              and disk.get("isAttached") is True
              and type(disk.get("sizeInGb")) is int
              and 0 < disk["sizeInGb"] <= 65536)
        self.round = review
        self.finished = False
        self.failed = False
        self.snapshot_identity = None
        self.reply_sha256 = None

    def inspect(self, raw, *, request_sent_at, reply_received_at):
        _need(not self.finished and not self.failed and self.round.phase == 2
              and not self.round.failed)
        try:
            reply = frames._frame(raw, 64 * 1024)
            bound = ("installationId", "intentSha256", "writersSha256",
                     "archiveSha256", "receiptSha256", "challenge")
            snap = self.round.snap
            _need(set(reply) == {"schemaVersion", "kind", *bound, "evidence"}
                  and type(reply["schemaVersion"]) is int and reply["schemaVersion"] == 1
                  and reply["kind"] == "sanq-minimal-snapshot-evidence-reply"
                  and all(reply[key] == snap[key] for key in bound)
                  and type(reply["evidence"]) is dict)
            evidence = reply["evidence"]
            _need(set(evidence) == {"schemaVersion", "kind", "instanceSnapshot", "operatorVerification"}
                  and type(evidence["schemaVersion"]) is int and evidence["schemaVersion"] == 1
                  and evidence["kind"] == "sanq-minimal-manual-snapshot-content")
            snapshot, operator = evidence["instanceSnapshot"], evidence["operatorVerification"]
            required = {"arn", "name", "createdAt", "location", "resourceType", "state",
                        "fromAttachedDisks", "fromInstanceArn", "fromInstanceName",
                        "isFromAutoSnapshot", "sizeInGb"}
            _need(type(snapshot) is dict and required <= set(snapshot)
                  and type(operator) is dict)
            target = self.round.target
            prefix = ("arn:aws:lightsail:" + target["region"] + ":"
                      + target["accountId"] + ":InstanceSnapshot/")
            _need(type(snapshot["arn"]) is str and snapshot["arn"].startswith(prefix)
                  and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}",
                                   snapshot["arn"][len(prefix):]) is not None
                  and snapshot["name"] == "sanq-runtime-" + self.round.challenge
                  and snapshot["resourceType"] == "InstanceSnapshot"
                  and snapshot["state"] == "available"
                  and snapshot["fromInstanceArn"] == target["instanceArn"]
                  and snapshot["fromInstanceName"] == target["instanceName"]
                  and snapshot["isFromAutoSnapshot"] is False
                  and type(snapshot["fromAttachedDisks"]) is list
                  and not snapshot["fromAttachedDisks"]
                  and type(snapshot["sizeInGb"]) is int
                  and type(target["instance"]["hardware"]["disks"]) is list
                  and len(target["instance"]["hardware"]["disks"]) == 1
                  and snapshot["sizeInGb"] == target["instance"]["hardware"]["disks"][0]["sizeInGb"])
            location = snapshot["location"]
            _need(type(location) is dict
                  and location.get("regionName") == target["region"]
                  and location.get("availabilityZone") in (
                      "all", target["instance"]["location"]["availabilityZone"]))
            operator_fields = {"method", "accountId", "region", "instanceArn", "snapshotArn",
                               "authenticatedAwsSession", "createdAfterChallenge",
                               "availableObservedAt"}
            _need(set(operator) == operator_fields
                  and operator["method"] == "operator-authenticated-aws-session"
                  and operator["authenticatedAwsSession"] is True
                  and operator["createdAfterChallenge"] is True
                  and all(operator[key] == target[key] for key in
                          ("accountId", "region", "instanceArn"))
                  and operator["snapshotArn"] == snapshot["arn"])
            prepared = _timestamp(snap["challengePreparedAt"])
            sent, created, observed, received = (
                _timestamp(v) for v in (request_sent_at, snapshot["createdAt"],
                                        operator["availableObservedAt"], reply_received_at))
            _need(prepared <= sent <= created <= observed <= received)
            # Claimed identity only: no AWS authentication or VM receipt.
            self.snapshot_identity = (snapshot["arn"], snapshot["name"], created,
                                      observed, location["availabilityZone"])
            self.reply_sha256 = hashlib.sha256(raw).hexdigest()
            self.finished = True
            return {"schemaVersion": 1, "kind": "sanq-mac-snapshot-evidence-observation",
                    "outcome": "SNAPSHOT_EVIDENCE_STRUCTURE_MATCHED",
                    "requestedSourceSha": self.round.source,
                    "retentionId": self.round.retention,
                    "installationId": self.round.installation,
                    "challenge": self.round.challenge,
                    "replyInputSha256": hashlib.sha256(raw).hexdigest(),
                    "evidenceInputSha256": hashlib.sha256(frames._canonical(evidence)).hexdigest(),
                    "claimedSnapshotArn": snapshot["arn"],
                    "claimedSnapshotState": snapshot["state"],
                    "operatorClaimStructurallyMatched": True,
                    "awsOriginAuthenticated": False,
                    "snapshotAvailable": False,
                    "offHostRetentionConfirmed": False,
                    "trustedTimeProven": False,
                    "operatorReplyGenerated": False,
                    "remoteOperationPerformed": False,
                    "installationComplete": False,
                    "canExecute": False, "readyToInstall": False,
                    "restoreProven": False}
        except BaseException:
            self.failed = True
            raise
