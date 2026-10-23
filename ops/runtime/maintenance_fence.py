"""R2-A2-1: pure Maintenance Fence transitions, deny verdicts and restart review.

Only immutable input bytes/typed claims are consumed. No live adapters, CLI,
filesystem, clock, locks, AWS, Docker or automatic restore/release. A later
adapter must authenticate evidence and durably CAS both records before effects.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
import json

from normal_runtime_launch import canonical, digest
from maintenance_fence_contract import (
    FenceBinding, FenceBlocked, FenceObservation, OriginalPolicyRecord,
    PersistenceReceipt, SCOPES, WriterStartupRegistry, frozen_policy, pin,
    registry_from_document, require, token,
)

PHASES = ("PREPARED", "FREEZING", "FROZEN", "INCIDENT")
INCIDENT_REASONS = frozenset({
    "INVALID_PHASE", "PERSISTENCE_UNCONFIRMED", "INVALID_PERSISTENCE",
    "OBSERVATION_INVALID", "OBSERVATION_IDENTITY_MISMATCH", "COVERAGE_INCOMPLETE",
    "UNKNOWN_OBJECT", "CREDENTIALS_UNAVAILABLE", "MANAGEMENT_UNAVAILABLE",
    "ADMISSION_OPEN_OR_UNKNOWN", "EXTERNAL_EVENTS_UNKNOWN", "POLICY_OR_IDENTITY_DRIFT",
    "BOOT_CHANGED", "STALE_OBSERVATION", "RESTART_REVIEW_REQUIRED",
    "INTERRUPTED", "TIMEOUT", "TRANSPORT_LOST", "ABORT_EVIDENCE_UNAVAILABLE",
})
MAX_STATE_BYTES = 256 * 1024


def _json(raw: bytes) -> dict:
    require(type(raw) is bytes and 0 < len(raw) <= MAX_STATE_BYTES, "INVALID_STATE_BYTES")

    def unique(pairs):
        value = {}
        for key, item in pairs:
            require(key not in value, "DUPLICATE_JSON_KEY")
            value[key] = item
        return value

    try:
        value = json.loads(raw.decode("ascii"), object_pairs_hook=unique)
        require(type(value) is dict and canonical(value) == raw, "NONCANONICAL_STATE")
        return value
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise FenceBlocked("INVALID_STATE_BYTES") from exc


@dataclass(frozen=True)
class FenceState:
    binding: FenceBinding
    registry_bytes: bytes
    boot_id: str
    phase: str = "PREPARED"
    revision: int = 0
    previous_sha256: str | None = None
    sequence: int = 0
    failure_code: str | None = None
    failed_phase: str | None = None
    evidence_sha256: str | None = None

    def document(self) -> dict:
        require(type(self.binding) is FenceBinding, "TYPED_BINDING_REQUIRED")
        binding = self.binding.document()
        registry_document = _json(self.registry_bytes)
        registry = registry_from_document(registry_document)
        require(registry.sha256() == self.binding.registry_sha256
                and registry.host_id == self.binding.host_id, "REGISTRY_BINDING_MISMATCH")
        require(pin(self.boot_id), "INVALID_BOOT_ID")
        require(type(self.phase) is str and self.phase in PHASES, "INVALID_PHASE")
        require(type(self.revision) is int and 0 <= self.revision <= 2147483647
                and type(self.sequence) is int and 0 <= self.sequence <= 2147483647,
                "INVALID_STATE_COUNTER")
        if self.phase == "PREPARED":
            require(self.revision == self.sequence == 0 and self.previous_sha256 is None,
                    "INVALID_INITIAL_STATE")
        else:
            require(self.revision > 0 and pin(self.previous_sha256), "INVALID_STATE_CHAIN")
            require(self.sequence == self.revision - (1 if self.phase == "INCIDENT" else 0),
                    "INVALID_STATE_COUNTER")
            if self.phase != "INCIDENT":
                require(self.sequence > 0, "MISSING_OBSERVATION")
            if self.phase == "FREEZING":
                require(self.revision == 1, "INVALID_PHASE")
            if self.phase == "FROZEN":
                require(self.revision >= 2, "INVALID_PHASE")
        if self.phase == "INCIDENT":
            require(type(self.failure_code) is str and self.failure_code in INCIDENT_REASONS
                    and self.failed_phase in PHASES, "INVALID_INCIDENT")
        else:
            require(self.failure_code is None and self.failed_phase is None, "UNEXPECTED_INCIDENT")
        require(self.evidence_sha256 is None or pin(self.evidence_sha256), "INVALID_EVIDENCE")
        return {
            "schema": "sanq.runtime.maintenance-fence.v1", "binding": binding,
            "registry": registry_document, "bootId": self.boot_id,
            "phase": self.phase, "revision": self.revision,
            "previousSha256": self.previous_sha256, "sequence": self.sequence,
            "failureCode": self.failure_code, "failedPhase": self.failed_phase,
            "evidenceSha256": self.evidence_sha256,
            "businessAdmission": "DENY", "journalReplayAllowed": False,
            "persistenceVerified": False, "liveFenceVerified": False,
            "authorizedToMutateProduction": False, "readyToInstall": False,
            "decision": "BLOCKED",
        }

    def encode(self) -> bytes:
        raw = canonical(self.document())
        require(len(raw) <= MAX_STATE_BYTES, "STATE_BUDGET_EXCEEDED")
        return raw

    def sha256(self) -> str:
        return digest(self.encode())


def prepare_fence(binding: FenceBinding, registry: WriterStartupRegistry, boot_id: str) -> FenceState:
    require(type(binding) is FenceBinding and type(registry) is WriterStartupRegistry,
            "TYPED_INVENTORY_REQUIRED")
    state = FenceState(binding, canonical(registry.document()), boot_id)
    state.document()
    return state


def _bound(state: FenceState, binding: FenceBinding) -> None:
    require(type(state) is FenceState and type(binding) is FenceBinding, "TYPED_STATE_REQUIRED")
    state.document()
    binding.document()
    require(state.binding == binding, "FENCE_OWNER_OR_EPOCH_MISMATCH")


def _next(state: FenceState, **changes) -> FenceState:
    result = replace(state, revision=state.revision + 1, previous_sha256=state.sha256(), **changes)
    result.document()
    return result


def record_abort(state: FenceState, binding: FenceBinding, reason: str,
                 evidence_sha256: str | None = None) -> FenceState:
    _bound(state, binding)
    require(type(reason) is str and reason in INCIDENT_REASONS, "INVALID_ABORT_REASON")
    require(evidence_sha256 is None or pin(evidence_sha256), "INVALID_EVIDENCE")
    # First incident is immutable. Never replace another failure with a cleanup success.
    if state.phase == "INCIDENT":
        return state
    return _next(state, phase="INCIDENT", failed_phase=state.phase,
                 failure_code=reason, evidence_sha256=evidence_sha256)


def _receipts(state: FenceState, receipts: tuple[PersistenceReceipt, ...]) -> None:
    require(type(receipts) is tuple and len(receipts) == 2, "PERSISTENCE_UNCONFIRMED")
    require(all(type(receipt) is PersistenceReceipt for receipt in receipts),
            "INVALID_PERSISTENCE")
    require(all(type(receipt.location) is str for receipt in receipts), "INVALID_PERSISTENCE")
    require({receipt.location for receipt in receipts} == {"LOCAL", "OFF_HOST"},
            "INVALID_PERSISTENCE")
    for receipt in receipts:
        require(type(receipt.revision) is int and receipt.revision == state.revision
                and receipt.binding_sha256 == state.binding.sha256()
                and receipt.state_sha256 == state.sha256()
                and receipt.previous_sha256 == state.previous_sha256
                and pin(receipt.evidence_sha256), "INVALID_PERSISTENCE")


def _observation(state: FenceState, observation: FenceObservation, *, frozen: bool) -> None:
    require(type(observation) is FenceObservation, "OBSERVATION_INVALID")
    require(pin(observation.evidence_sha256), "OBSERVATION_INVALID")
    require(observation.binding_sha256 == state.binding.sha256()
            and observation.state_sha256 == state.sha256(), "OBSERVATION_IDENTITY_MISMATCH")
    require(type(observation.sequence) is int and observation.sequence == state.sequence + 1,
            "STALE_OBSERVATION")
    require(pin(observation.boot_id) and observation.boot_id == state.boot_id, "BOOT_CHANGED")
    require(type(observation.covered_scopes) is tuple and observation.covered_scopes == SCOPES,
            "COVERAGE_INCOMPLETE")
    require(type(observation.unknown_objects) is tuple and not observation.unknown_objects,
            "UNKNOWN_OBJECT")
    require(observation.credentials == "AVAILABLE", "CREDENTIALS_UNAVAILABLE")
    require(observation.management_available is True, "MANAGEMENT_UNAVAILABLE")
    require(observation.business_admission == "DENIED", "ADMISSION_OPEN_OR_UNKNOWN")
    require(observation.external_events == "HELD", "EXTERNAL_EVENTS_UNKNOWN")
    registry = registry_from_document(_json(state.registry_bytes))
    require(type(observation.records) is tuple and 1 <= len(observation.records) <= 128 and all(
        type(record) is OriginalPolicyRecord for record in observation.records),
        "OBSERVATION_INVALID")
    try:
        for record in observation.records:
            record.document()
    except (FenceBlocked, TypeError, AttributeError) as exc:
        raise FenceBlocked("OBSERVATION_INVALID") from exc
    expected = tuple(frozen_policy(record) for record in registry.records) if frozen else registry.records
    require(observation.records == expected, "POLICY_OR_IDENTITY_DRIFT")


def _assess(state: FenceState, binding: FenceBinding, receipts: tuple[PersistenceReceipt, ...],
            observation: FenceObservation, *, entering: bool) -> FenceState:
    _bound(state, binding)
    if state.phase == "INCIDENT":
        return state
    try:
        require(state.phase == "PREPARED" if entering else state.phase in ("FREEZING", "FROZEN"),
                "INVALID_PHASE")
        _receipts(state, receipts)
        _observation(state, observation, frozen=not entering)
    except FenceBlocked as exc:
        reason = str(exc) if str(exc) in INCIDENT_REASONS else "OBSERVATION_INVALID"
        evidence = (observation.evidence_sha256 if type(observation) is FenceObservation
                    and pin(observation.evidence_sha256) else None)
        return record_abort(state, binding, reason, evidence)
    return _next(state, phase="FREEZING" if entering else "FROZEN",
                 sequence=observation.sequence, evidence_sha256=observation.evidence_sha256)


def begin_freeze(state: FenceState, binding: FenceBinding, receipts: tuple[PersistenceReceipt, ...],
                 observation: FenceObservation) -> FenceState:
    """Record intent only after both original-state copies and admission-deny claims."""
    return _assess(state, binding, receipts, observation, entering=True)


def assess_frozen(state: FenceState, binding: FenceBinding, receipts: tuple[PersistenceReceipt, ...],
                  observation: FenceObservation) -> FenceState:
    """Continuous fresh review model; an error creates INCIDENT and leaves admission denied."""
    return _assess(state, binding, receipts, observation, entering=False)


def reload_for_review(raw: bytes, expected_sha256: str, binding: FenceBinding) -> FenceState:
    """Pins must come from separate trusted custody. Reload never resumes an operation."""
    require(pin(expected_sha256) and type(raw) is bytes and 0 < len(raw) <= MAX_STATE_BYTES
            and digest(raw) == expected_sha256,
            "STATE_PIN_MISMATCH")
    value = _json(raw)
    # Serialized names are deliberately checked by exact canonical re-encoding below.
    require(type(value.get("binding")) is dict and type(value.get("registry")) is dict,
            "INVALID_STATE_DOCUMENT")
    try:
        state = FenceState(
            binding=FenceBinding(**value["binding"]), registry_bytes=canonical(value["registry"]),
            boot_id=value["bootId"], phase=value["phase"], revision=value["revision"],
            previous_sha256=value["previousSha256"], sequence=value["sequence"],
            failure_code=value["failureCode"], failed_phase=value["failedPhase"],
            evidence_sha256=value["evidenceSha256"])
        require(state.encode() == raw, "STATE_DOCUMENT_CHANGED")
        _bound(state, binding)
        return record_abort(state, binding, "RESTART_REVIEW_REQUIRED")
    except (KeyError, TypeError, AttributeError) as exc:
        raise FenceBlocked("INVALID_STATE_DOCUMENT") from exc


def deny_verdict(state: FenceState, binding: FenceBinding, object_key: str, action: str) -> dict:
    """No allow path, including for synthetic FROZEN and preserved management objects."""
    _bound(state, binding)
    require(token(object_key) and token(action), "INVALID_ACTION")
    registry = registry_from_document(_json(state.registry_bytes))
    record = next((item for item in registry.records if item.object_key == object_key), None)
    reason = ("UNKNOWN_OBJECT" if record is None else
              "PRESERVE_OBJECT" if record.disposition == "PRESERVE" else
              "INCIDENT_REVIEW_REQUIRED" if state.phase == "INCIDENT" else "MAINTENANCE_FENCE")
    return {"decision": "DENY", "reason": reason, "objectKey": object_key, "action": action,
            "bindingSha256": binding.sha256(), "stateSha256": state.sha256(),
            "originalPoliciesSha256": binding.registry_sha256,
            "authorizedToMutateProduction": False, "readyToInstall": False}
