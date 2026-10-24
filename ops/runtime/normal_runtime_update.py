"""R1C-1: one-shot normal-update orchestration core, with no live adapters.

The same callable is intended for later R4 assembly. Today only synthetic tests
supply capabilities. Adapter completions are correlated claims, not authority:
the adapter must independently authenticate/hold its own source, transaction,
maintenance, snapshot and FD capabilities. No dict of booleans admits a write.
This module has no CLI, host reads, subprocess, AWS or active-path operations.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import re
from threading import Lock
from typing import Protocol

from normal_runtime_launch import (
    LaunchMaterials, LaunchMaterialsBlocked, SHA, SHA256, TXID, canonical, digest,
)

ARCHIVE = re.compile(r"sha256:[0-9a-f]{64}\Z")
ZERO = "0" * 64
STEPS = (
    ("VERIFY_SOURCE", "admit_and_verify_source"),
    ("PREPARE_PRIVATE", "prepare_private"),
    ("RECORD_ORIGINAL", "record_original_state"),
    ("FREEZE_MAINTENANCE", "freeze_maintenance"),
    ("SNAPSHOT_READY", "create_and_verify_snapshot"),
    ("RECHECK_FROZEN", "recheck_frozen"),
    ("HANDOFF", "handoff"),
    ("VERIFY_INSTALLED", "verify_installed"),
    ("RESTORE_POLICIES", "restore_original_policies"),
    ("VERIFY_RESTORED", "verify_restored"),
    ("RELEASE_BUSINESS", "release_business"),
)


class NormalUpdateBlocked(ValueError):
    pass


class NormalUpdateAborted(RuntimeError):
    def __init__(self, receipt: dict):
        super().__init__("normal update aborted at " + receipt["failure"]["step"])
        self.receipt = receipt


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise NormalUpdateBlocked(reason)


def _pin(value: str) -> bool:
    return type(value) is str and SHA256.fullmatch(value) is not None and value != ZERO


@dataclass(frozen=True)
class UpdateRequest:
    transaction_id: str
    current_runtime_sha: str
    target_runtime_sha: str
    current_archive_digest: str
    target_archive_digest: str
    current_app_sha: str
    previous_app_sha: str
    preserved_state_sha256: str
    launch: LaunchMaterials

    def document(self) -> dict:
        _require(type(self.transaction_id) is str and TXID.fullmatch(self.transaction_id) is not None,
                 "invalid transaction id")
        for value in (self.current_runtime_sha, self.target_runtime_sha,
                      self.current_app_sha, self.previous_app_sha):
            _require(type(value) is str and SHA.fullmatch(value) is not None, "invalid source SHA")
        _require(self.current_runtime_sha != self.target_runtime_sha, "same Runtime version")
        for value in (self.current_archive_digest, self.target_archive_digest):
            _require(type(value) is str and ARCHIVE.fullmatch(value) is not None,
                     "invalid archive digest")
        _require(self.current_archive_digest != self.target_archive_digest,
                 "unchanged Runtime archive")
        _require(_pin(self.preserved_state_sha256), "invalid preserved-state pin")
        _require(type(self.launch) is LaunchMaterials
                 and self.launch.transaction_id == self.transaction_id,
                 "launch transaction differs")
        try:
            launch_sha = self.launch.sha256()
        except LaunchMaterialsBlocked as exc:
            raise NormalUpdateBlocked("invalid launch materials") from exc
        return {
            "schema": "sanq.runtime.normal-update-request.v1",
            "operation": "upgrade",
            "transactionId": self.transaction_id,
            "currentRuntimeSha": self.current_runtime_sha,
            "targetRuntimeSha": self.target_runtime_sha,
            "currentArchiveDigest": self.current_archive_digest,
            "targetArchiveDigest": self.target_archive_digest,
            "currentAppSha": self.current_app_sha,
            "previousAppSha": self.previous_app_sha,
            "preservedStateSha256": self.preserved_state_sha256,
            "launchMaterialsSha256": launch_sha,
            "runtimeRoot": "/opt/sanq/runtime",
            "composeProject": "sanq-app",
            "databaseVolume": "sanq-app_pgdata",
            "uploadsBind": "/srv/sanq/uploads",
        }


@dataclass(frozen=True)
class FlowContext:
    """Immutable copies, not caller-owned mutable request/report objects."""
    step: str
    request_bytes: bytes
    launch_bytes: bytes
    completions: tuple[bytes, ...]
    original_state_sha256: str | None
    snapshot_record_sha256: str | None

    @property
    def request_sha256(self) -> str:
        return digest(self.request_bytes)

    @property
    def previous_completion_sha256(self) -> str:
        return digest(self.completions[-1]) if self.completions else ZERO


@dataclass(frozen=True)
class StepCompletion:
    step: str
    request_sha256: str
    previous_completion_sha256: str
    evidence_sha256: str
    preserved_state_sha256: str
    original_state_sha256: str | None
    snapshot_record_sha256: str | None
    status: str = "COMPLETE"


class UpdateCapabilities(Protocol):
    """Each method is bounded and authenticates its own real evidence.

    Admission must durably reject consumed/active/aborted transactions and
    independently verify the actual platform, executor and critical dependency/
    input sources, the exact target archive/publication, current installed
    provenance/17-member inventory, changed members and preserved app/storage.
    current_archive_digest remains required authenticated publication identity;
    it does not require possession of old archive bytes, and must not be
    fabricated from a manifest, repackaged files or the target archive. Exact
    target archive bytes remain required. Unknown source/loading/path risks
    need targeted resolution before use, not a default full dynamic closure.
    Holding maintenance is continuous, not a stat-before/stat-after assertion. Snapshot
    creation must resolve the exact request, require available/source/disks and
    off-host custody; an unknown result is not COMPLETE and is never retried by
    this core. verify_installed/verify_restored keep business admission fenced.
    restore_original_policies uses the exact recorded original policy inventory;
    release_business is the final, separate admission action.
    record_abort only preserves this attempt's evidence; it must never release
    maintenance, replay a journal or abort a different owner's transaction.
    """
    def admit_and_verify_source(self, ctx: FlowContext) -> StepCompletion: ...
    def prepare_private(self, ctx: FlowContext) -> StepCompletion: ...
    def record_original_state(self, ctx: FlowContext) -> StepCompletion: ...
    def freeze_maintenance(self, ctx: FlowContext) -> StepCompletion: ...
    def create_and_verify_snapshot(self, ctx: FlowContext) -> StepCompletion: ...
    def recheck_frozen(self, ctx: FlowContext) -> StepCompletion: ...
    def handoff(self, ctx: FlowContext) -> StepCompletion: ...
    def verify_installed(self, ctx: FlowContext) -> StepCompletion: ...
    def restore_original_policies(self, ctx: FlowContext) -> StepCompletion: ...
    def verify_restored(self, ctx: FlowContext) -> StepCompletion: ...
    def release_business(self, ctx: FlowContext) -> StepCompletion: ...
    def record_abort(self, ctx: FlowContext, receipt_bytes: bytes) -> str: ...


def _completion(raw: StepCompletion, ctx: FlowContext, preserved: str) -> bytes:
    _require(type(raw) is StepCompletion, "typed completion required; boolean claims rejected")
    _require(type(raw.status) is str and raw.status == "COMPLETE"
             and type(raw.step) is str and raw.step == ctx.step,
             "incomplete or wrong-stage completion")
    _require(_pin(raw.request_sha256)
             and type(raw.previous_completion_sha256) is str
             and SHA256.fullmatch(raw.previous_completion_sha256) is not None
             and _pin(raw.preserved_state_sha256)
             and (raw.original_state_sha256 is None or _pin(raw.original_state_sha256))
             and (raw.snapshot_record_sha256 is None or _pin(raw.snapshot_record_sha256)),
             "invalid completion identity fields")
    _require(raw.request_sha256 == ctx.request_sha256
             and raw.previous_completion_sha256 == ctx.previous_completion_sha256,
             "completion belongs to another request or predecessor")
    _require(_pin(raw.evidence_sha256) and raw.preserved_state_sha256 == preserved,
             "missing evidence or changed preserved state")
    if ctx.step == "RECORD_ORIGINAL":
        _require(_pin(raw.original_state_sha256), "missing original policies record")
    else:
        _require(raw.original_state_sha256 == ctx.original_state_sha256,
                 "original policies record drift")
    if ctx.step == "SNAPSHOT_READY":
        _require(_pin(raw.snapshot_record_sha256), "missing exact off-host snapshot record")
    else:
        _require(raw.snapshot_record_sha256 == ctx.snapshot_record_sha256,
                 "snapshot record drift")
    # Snapshot *record bytes*, not a made-up digest of a snapshot ARN/disk.
    return canonical({
        "step": raw.step,
        "status": raw.status,
        "requestSha256": raw.request_sha256,
        "previousCompletionSha256": raw.previous_completion_sha256,
        "evidenceSha256": raw.evidence_sha256,
        "preservedStateSha256": raw.preserved_state_sha256,
        "originalStateSha256": raw.original_state_sha256,
        "snapshotRecordSha256": raw.snapshot_record_sha256,
    })


def _receipt(ctx: FlowContext, attempted: tuple[str, ...], completed: tuple[str, ...],
             *, failure: dict | None) -> dict:
    handoff = ("REPORTED_COMPLETE" if "HANDOFF" in completed else
               "UNKNOWN" if "HANDOFF" in attempted else "NOT_REQUESTED")
    release = ("REPORTED_COMPLETE" if "RELEASE_BUSINESS" in completed else
               "UNKNOWN" if "RELEASE_BUSINESS" in attempted else "NOT_REQUESTED")
    return {
        "schema": "sanq.runtime.normal-update-flow.v1",
        "requestSha256": ctx.request_sha256,
        "launchMaterialsSha256": digest(ctx.launch_bytes),
        "status": "COMPLETED" if failure is None else "ABORTED",
        "flowCompleted": failure is None,
        "attemptedSteps": list(attempted),
        "completedSteps": list(completed),
        "completionSha256": [digest(raw) for raw in ctx.completions],
        "originalStateSha256": ctx.original_state_sha256,
        "snapshotRecordSha256": ctx.snapshot_record_sha256,
        "maintenanceRequested": "FREEZE_MAINTENANCE" in attempted,
        "maintenanceState": ("RELEASE_REPORTED" if release == "REPORTED_COMPLETE" else
                             "UNVERIFIED" if "FREEZE_MAINTENANCE" in attempted else
                             "NOT_REQUESTED"),
        "handoffState": handoff,
        "policyRestoreRequested": "RESTORE_POLICIES" in attempted,
        "businessReleaseState": release,
        "failure": failure,
        "abortRecordState": "NOT_REQUESTED",
        "abortRecordSha256": None,
        "adapterEvidenceIndependentlyAuthenticated": False,
        "actualConsumptionVerified": False,
        "journalReplayAllowed": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }


class NormalUpdateFlow:
    """An in-process single-use driver, NOT a cross-process lock or resume API."""
    def __init__(self):
        # Never released: even invalid input consumes this driver. This only
        # prevents local concurrent/reentrant use, not cross-process admission.
        self._admission = Lock()

    def run(self, request: UpdateRequest, capabilities: UpdateCapabilities) -> dict:
        _require(self._admission.acquire(blocking=False),
                 "flow already consumed; no retry or journal resume")
        _require(type(request) is UpdateRequest, "typed update request required")
        document = request.document()
        request_bytes = canonical(document)
        launch_bytes = canonical(request.launch.document())
        _require(digest(launch_bytes) == document["launchMaterialsSha256"],
                 "launch changed during request freezing")
        # Capture all bound methods before any callback, reject partial adapters.
        methods = tuple(getattr(capabilities, method, None) for _, method in STEPS)
        abort = getattr(capabilities, "record_abort", None)
        _require(all(callable(method) for method in methods) and callable(abort),
                 "all bounded update capabilities required")
        ctx = FlowContext("NOT_STARTED", request_bytes, launch_bytes, (), None, None)
        attempted: tuple[str, ...] = ()
        completed: tuple[str, ...] = ()
        try:
            for (step, _), method in zip(STEPS, methods):
                ctx = FlowContext(step, request_bytes, launch_bytes, ctx.completions,
                                  ctx.original_state_sha256, ctx.snapshot_record_sha256)
                # Record BEFORE invoking: a timeout/raise may follow a real effect.
                attempted += (step,)
                result = _completion(method(ctx), ctx, document["preservedStateSha256"])
                # Store immutable serialized copies, never a retained adapter object.
                record = json.loads(result)
                ctx = FlowContext(step, request_bytes, launch_bytes, ctx.completions + (result,),
                                  record["originalStateSha256"], record["snapshotRecordSha256"])
                completed += (step,)
        except (Exception, KeyboardInterrupt, SystemExit) as exc:
            report = _receipt(ctx, attempted, completed,
                              failure={"step": ctx.step, "type": type(exc).__name__[:80]})
            # No restore/cleanup/follow-on stage on any failure or interruption.
            try:
                proof = abort(ctx, canonical(report))
                _require(_pin(proof), "invalid abort record digest")
                report["abortRecordState"] = "REPORTED_RECORDED"
                report["abortRecordSha256"] = proof
            except (Exception, KeyboardInterrupt, SystemExit) as record_error:
                report["abortRecordState"] = "FAILED_OR_UNKNOWN"
                report["abortRecordFailureType"] = type(record_error).__name__[:80]
            raise NormalUpdateAborted(report) from exc
        return _receipt(ctx, attempted, completed, failure=None)
