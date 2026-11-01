"""Offline structural review of original VM first-install pre-clear records.

This is NOT a completion checker. The VM writes completion.json BEFORE
clearing the active maintenance marker. The verification facts hash comes from
the VM's in-memory flow and is not recomputable from these persisted files.
Inputs here are caller-supplied, not independently authenticated VM originals.
No SSH, AWS, systemd, root operations or filesystem writes.
"""
import datetime as dt
import hashlib
import re

import sanq_install_frames as frames

COMPLETION_DIGESTS = (
    ("intentSha256", "intent.json"),
    ("writersSha256", "writers.json"),
    ("recoveryArchiveSha256", "recovery.tar"),
    ("recoveryReceiptSha256", "recovery.json"),
    ("snapshotReviewSha256", "snapshot-review.json"),
    ("offHostReceiptSha256", "snapshot-offhost.json"),
)
EXPECTED = {filename for _, filename in COMPLETION_DIGESTS} | {"completion.json"}
COMPLETION_KIND = "sanq-minimal-executor-install-completion-prepared"
INTENT_KIND = "sanq-minimal-executor-install-intent"
WRITERS_KIND = "sanq-minimal-executor-saved-writers"


def _need(ok):
    frames._need(ok)


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _timestamp(value):
    _need(type(value) is str and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
        r"(?:\.[0-9]{1,6})?Z", value) is not None)
    try:
        dt.datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise frames.FrameRejected("invalid original VM record UTC time") from None


def _record(raw, maximum):
    return frames._frame(raw, maximum)


def _originals_validated(originals, installation_id, source_sha, retention_id):
    _need(type(originals) is dict and set(originals) == EXPECTED)
    for name in EXPECTED:
        _need(type(originals[name]) is bytes and bool(originals[name]))
    _need(len(originals["recovery.tar"]) <= 56 * 1024 * 1024)

    intent = _record(originals["intent.json"], 16384)
    _need(set(intent) == {"schemaVersion", "kind", "installationId", "retentionId",
                          "targetSourceSha", "installedRuntimeSourceSha",
                          "observationSha256", "createdAt", "canExecute"}
          and type(intent["schemaVersion"]) is int and intent["schemaVersion"] == 1
          and intent["kind"] == INTENT_KIND and intent["installationId"] == installation_id
          and intent["retentionId"] == retention_id
          and intent["targetSourceSha"] == source_sha
          and frames._hex(intent["installedRuntimeSourceSha"], 40)
          and frames._hex(intent["observationSha256"], 64)
          and intent["canExecute"] is False)
    _timestamp(intent["createdAt"])

    writers = _record(originals["writers.json"], 16384)
    _need(set(writers) == {"schemaVersion", "kind", "installationId",
                           "intentSha256", "applicationSha", "dockerEngineSha256",
                           "containers", "createdAt", "canExecute"}
          and type(writers["schemaVersion"]) is int and writers["schemaVersion"] == 1
          and writers["kind"] == WRITERS_KIND
          and writers["installationId"] == installation_id
          and writers["intentSha256"] == _sha(originals["intent.json"])
          and frames._hex(writers["applicationSha"], 40)
          and frames._hex(writers["dockerEngineSha256"], 64)
          and type(writers["containers"]) is dict
          and writers["canExecute"] is False)
    _timestamp(writers["createdAt"])
    _need(intent["createdAt"] <= writers["createdAt"])

    # The full VM-owned recovery/snapshot/off-host semantic validators remain
    # authoritative; this portable reviewer checks original byte digests only.
    receipt = _record(originals["recovery.json"], 16384)
    _need(set(receipt) == {"schemaVersion", "kind", "installationId", "intentSha256",
                            "writersSha256", "archiveSha256", "archiveBytes", "captureSha256",
                            "canExecute", "recoveryReady", "snapshotAvailable",
                            "completePrivateStateCaptured"}
          and type(receipt["schemaVersion"]) is int and receipt["schemaVersion"] == 1
          and receipt["kind"] == "sanq-minimal-executor-recovery-receipt"
          and receipt["installationId"] == installation_id
          and receipt["intentSha256"] == _sha(originals["intent.json"])
          and receipt["writersSha256"] == _sha(originals["writers.json"])
          and receipt["archiveSha256"] == _sha(originals["recovery.tar"])
          and type(receipt["archiveBytes"]) is int
          and receipt["archiveBytes"] == len(originals["recovery.tar"])
          and frames._hex(receipt["captureSha256"], 64)
          and all(receipt[key] is False for key in (
              "canExecute", "recoveryReady", "snapshotAvailable",
              "completePrivateStateCaptured")))
    snapshot = _record(originals["snapshot-review.json"], 192 * 1024)
    _need(set(snapshot) == {"schemaVersion", "kind", "installationId", "request",
                            "replyOriginal", "requestSentAt", "replyReceivedAt", "result"}
          and type(snapshot["schemaVersion"]) is int and snapshot["schemaVersion"] == 1
          and snapshot["kind"] == "sanq-minimal-snapshot-review"
          and snapshot["installationId"] == installation_id
          and type(snapshot["request"]) is dict
          and snapshot["request"].get("installationId") == installation_id
          and snapshot["request"].get("intentSha256") == _sha(originals["intent.json"])
          and snapshot["request"].get("writersSha256") == _sha(originals["writers.json"])
          and snapshot["request"].get("archiveSha256") == _sha(originals["recovery.tar"])
          and snapshot["request"].get("receiptSha256") == _sha(originals["recovery.json"]))
    offhost = _record(originals["snapshot-offhost.json"], 128 * 1024)
    _need(set(offhost) == {"schemaVersion", "kind", "installationId",
                            "snapshotReviewSha256", "transferOriginal", "ackOriginal",
                            "requestSentAt", "replyReceivedAt", "verificationMethod",
                            "offHostLocationIndependentlyAuthenticated",
                            "canExecute", "recoveryReady"}
          and type(offhost["schemaVersion"]) is int and offhost["schemaVersion"] == 1
          and offhost["kind"] == "sanq-minimal-snapshot-offhost-receipt"
          and offhost["installationId"] == installation_id
          and offhost["snapshotReviewSha256"] == _sha(originals["snapshot-review.json"])
          and offhost["verificationMethod"] == "operator-ssh-peer-durable-receipt"
          and type(offhost["transferOriginal"]) is str
          and type(offhost["ackOriginal"]) is str
          and all(offhost[key] is False for key in (
              "offHostLocationIndependentlyAuthenticated", "canExecute",
              "recoveryReady")))
    return intent, writers


def review_preclear_records(originals, *, installation_id, source_sha, retention_id):
    """Check a caller-supplied record set without inferring production success.

    Any missing record, malformed/cross-generation content or mismatch blocks.
    This does not authenticate origin, verify actual maintenance marker absence,
    validate the VM's complete recovery semantics or establish application health.
    """
    _need(frames._hex(installation_id, 64)
          and frames._hex(source_sha, 40)
          and frames._hex(retention_id, 64))
    intent, writers = _originals_validated(
        originals, installation_id, source_sha, retention_id)
    value = _record(originals["completion.json"], 16384)
    digest_names = {name for name, _ in COMPLETION_DIGESTS}
    _need(set(value) == {
        "schemaVersion", "kind", "installationId", "createdAt", "phase",
        "installationComplete", "canExecute", "restoreProven",
        *digest_names, "markerSha256", "verificationSha256"}
        and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
        and value["kind"] == COMPLETION_KIND
        and value["installationId"] == installation_id
        and value["phase"] == "PREPARED_BEFORE_MARKER_CLEAR"
        and all(value[key] is False for key in
                ("installationComplete", "canExecute", "restoreProven"))
        and frames._hex(value["verificationSha256"], 64))
    _timestamp(value["createdAt"])
    _need(writers["createdAt"] <= value["createdAt"])
    for digest, filename in COMPLETION_DIGESTS:
        _need(value[digest] == _sha(originals[filename]))
    marker = frames._canonical({
        "schemaVersion": 1, "kind": INTENT_KIND,
        "installationId": installation_id,
        "intentSha256": _sha(originals["intent.json"])})
    _need(value["markerSha256"] == _sha(marker))
    return {
        "schemaVersion": 1,
        "kind": "sanq-install-preclear-originals-offline-observation",
        "outcome": "PRE_CLEAR_DIGEST_CHAIN_STRUCTURALLY_MATCHED",
        "sourceSha": source_sha, "retentionId": retention_id,
        "installationId": installation_id,
        "completionInputSha256": _sha(originals["completion.json"]),
        "providedByteDigestsMatched": True,
        "markerHashFormulaMatched": True,
        "verificationFactsRecomputed": False,
        "vmOriginalsAuthenticated": False,
        "vmSemanticValidationComplete": False,
        "maintenanceMarkerAbsentObserved": False,
        "managerGenerationVerified": False,
        "applicationHealthVerified": False,
        "installationComplete": False,
        "canExecute": False, "readyToInstall": False,
        "restoreProven": False,
    }
