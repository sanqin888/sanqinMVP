"""P2-C3C2 offline *synthetic* peer-binding and canonical wire contract.

An injected PeerEvidence is NOT verified TLS evidence. This module never opens
sockets or databases, signs receipts, authenticates certificates, or grants
access to Docker/systemd. Every binding verdict remains DENY for execution.
"""
from __future__ import annotations

from dataclasses import dataclass
import json

from maintenance_boot_guard_contract import (
    BootGuardBlocked, CasRequest, decode_state, identity, require, sha,
)
from maintenance_off_host_cas_contract import OfflineCasSubmission
from normal_runtime_launch import canonical, digest

WIRE_SCHEMA = "sanq.runtime.auth-cas-wire.v1"
CLASSIFICATION = "OFFLINE_SIMULATED_PEER_ONLY"
MAX_WIRE_BYTES = 32768
OPERATIONS = ("HEAD_READ", "COMMIT_LOOKUP", "CAS_SUBMIT")
ROLES = ("READ", "SUBMIT")
WIRE_FIELDS = frozenset({
    "schema", "operation", "hostId", "installationId", "anchorSha256",
    "clientIdentity", "requestSha256", "request", "state",
})
CAS_FIELDS = frozenset({
    "schema", "hostId", "installationId", "ownerId", "transactionId",
    "expectedEpoch", "proposedEpoch", "expectedStateSha256",
    "proposedStateSha256", "nonceSha256",
})


def _no_duplicate_keys(pairs):
    out = {}
    for key, value in pairs:
        require(key not in out, "DUPLICATE_WIRE_KEY")
        out[key] = value
    return out


def _parse_canonical(raw: bytes) -> dict:
    require(type(raw) is bytes and 0 < len(raw) <= MAX_WIRE_BYTES,
            "INVALID_WIRE_LENGTH")
    try:
        value = json.loads(
            raw.decode("ascii"), object_pairs_hook=_no_duplicate_keys,
            parse_constant=lambda _: require(False, "INVALID_WIRE_CONSTANT"))
        require(type(value) is dict and canonical(value) == raw,
                "NONCANONICAL_WIRE")
        return value
    except BootGuardBlocked:
        raise
    except (UnicodeError, ValueError, TypeError, RecursionError) as exc:
        raise BootGuardBlocked("INVALID_WIRE") from exc


def _cas_request(document: object) -> CasRequest:
    require(type(document) is dict and set(document) == CAS_FIELDS
            and document["schema"] == "sanq.runtime.boot-guard-cas.v1",
            "INVALID_WIRE_CAS_SCHEMA")
    request = CasRequest(
        document["hostId"], document["installationId"],
        document["ownerId"], document["transactionId"],
        document["expectedEpoch"], document["proposedEpoch"],
        document["expectedStateSha256"], document["proposedStateSha256"],
        document["nonceSha256"])
    request.document()
    return request


@dataclass(frozen=True)
class SyntheticPeerEvidence:
    """Caller-injected TEST evidence; cannot assert mTLS was actually verified."""

    client_identity: str
    certificate_sha256: str
    ca_sha256: str

    def document(self) -> dict:
        require(identity(self.client_identity)
                and sha(self.certificate_sha256) and sha(self.ca_sha256),
                "INVALID_SYNTHETIC_PEER")
        return {"clientIdentity": self.client_identity,
                "certificateSha256": self.certificate_sha256,
                "caSha256": self.ca_sha256,
                "classification": CLASSIFICATION}


@dataclass(frozen=True)
class OfflineEnrollment:
    """A standalone test fixture, not authority to enroll over a network."""

    host_id: str
    installation_id: str
    anchor_sha256: str
    client_identity: str
    certificate_sha256: str
    ca_sha256: str
    roles: tuple[str, ...]

    def document(self) -> dict:
        require(identity(self.host_id) and identity(self.installation_id)
                and identity(self.client_identity)
                and all(sha(x) for x in (
                    self.anchor_sha256, self.certificate_sha256, self.ca_sha256)),
                "INVALID_ENROLLMENT_CLAIM")
        require(type(self.roles) is tuple and len(self.roles) > 0
                and all(type(r) is str and r in ROLES for r in self.roles)
                and len(self.roles) == len(set(self.roles)),
                "INVALID_ENROLLMENT_ROLES")
        return {"hostId": self.host_id,
                "installationId": self.installation_id,
                "anchorSha256": self.anchor_sha256,
                "clientIdentity": self.client_identity,
                "certificateSha256": self.certificate_sha256,
                "caSha256": self.ca_sha256,
                "roles": self.roles,
                "classification": CLASSIFICATION}


@dataclass(frozen=True)
class OfflineWireRequest:
    operation: str
    host_id: str
    installation_id: str
    anchor_sha256: str
    client_identity: str
    request_sha256: str | None = None
    cas_request: CasRequest | None = None
    state_bytes: bytes | None = None

    def document(self) -> dict:
        require(type(self.operation) is str and self.operation in OPERATIONS,
                "UNKNOWN_WIRE_OPERATION")
        require(identity(self.host_id) and identity(self.installation_id)
                and identity(self.client_identity) and sha(self.anchor_sha256),
                "INVALID_WIRE_IDENTITY")
        if self.operation == "HEAD_READ":
            require(self.request_sha256 is None
                    and self.cas_request is None and self.state_bytes is None,
                    "INVALID_HEAD_READ_SHAPE")
        elif self.operation == "COMMIT_LOOKUP":
            require(sha(self.request_sha256)
                    and self.cas_request is None and self.state_bytes is None,
                    "INVALID_LOOKUP_SHAPE")
        else:
            require(self.request_sha256 is None
                    and type(self.cas_request) is CasRequest
                    and type(self.state_bytes) is bytes,
                    "INVALID_SUBMIT_SHAPE")
            proposal = OfflineCasSubmission(
                self.cas_request, self.state_bytes, self.anchor_sha256,
                self.client_identity)
            state = proposal.state()
            require(self.cas_request.host_id == self.host_id
                    and self.cas_request.installation_id == self.installation_id,
                    "WIRE_SUBMIT_IDENTITY_MISMATCH")
            # The offline SQLite implementation has NO release transition.
            require(state.phase not in ("RELEASE_PENDING", "RELEASED",
                                        "UNKNOWN_OR_CORRUPT", "OFF_HOST_UNREACHABLE"),
                    "WIRE_PHASE_DENIED")
        state_document = (decode_state(self.state_bytes).document()
                          if self.state_bytes is not None else None)
        return {
            "schema": WIRE_SCHEMA, "operation": self.operation,
            "hostId": self.host_id, "installationId": self.installation_id,
            "anchorSha256": self.anchor_sha256,
            "clientIdentity": self.client_identity,
            "requestSha256": self.request_sha256,
            "request": self.cas_request.document() if self.cas_request else None,
            "state": state_document,
        }

    def encode(self) -> bytes:
        raw = canonical(self.document())
        require(len(raw) <= MAX_WIRE_BYTES, "WIRE_TOO_LARGE")
        return raw

    def sha256(self) -> str:
        return digest(self.encode())


def decode_wire(raw: bytes) -> OfflineWireRequest:
    """Parse *exact* canonical bytes; no duplicate fields or type coercion."""
    doc = _parse_canonical(raw)
    require(set(doc) == WIRE_FIELDS and doc["schema"] == WIRE_SCHEMA,
            "INVALID_WIRE_SCHEMA")
    cas = None if doc["request"] is None else _cas_request(doc["request"])
    if doc["state"] is None:
        state_bytes = None
    else:
        require(type(doc["state"]) is dict, "INVALID_WIRE_STATE")
        state_bytes = canonical(doc["state"])
        decode_state(state_bytes)
    request = OfflineWireRequest(
        doc["operation"], doc["hostId"], doc["installationId"],
        doc["anchorSha256"], doc["clientIdentity"], doc["requestSha256"],
        cas, state_bytes)
    require(request.encode() == raw, "NONCANONICAL_WIRE")
    return request


@dataclass(frozen=True)
class OfflineBindingVerdict:
    """Even valid synthetic claims never grant network/authority/start permission."""

    candidate: str
    reason: str
    classification: str = CLASSIFICATION
    decision: str = "DENY"
    authorized_to_execute_cas: bool = False
    authorized_to_start_docker: bool = False
    authenticated_off_host: bool = False
    tls_verified: bool = False


def assess_offline_binding(
    request: OfflineWireRequest | None,
    peer: SyntheticPeerEvidence | None,
    enrollment: OfflineEnrollment | None,
) -> OfflineBindingVerdict:
    try:
        require(type(request) is OfflineWireRequest
                and type(peer) is SyntheticPeerEvidence
                and type(enrollment) is OfflineEnrollment,
                "MISSING_OFFLINE_BINDING")
        request.document()
        peer.document()
        enrollment.document()
        require(request.host_id == enrollment.host_id
                and request.installation_id == enrollment.installation_id
                and request.anchor_sha256 == enrollment.anchor_sha256,
                "INSTALLATION_BINDING_MISMATCH")
        require(request.client_identity == peer.client_identity
                and peer.client_identity == enrollment.client_identity
                and peer.certificate_sha256 == enrollment.certificate_sha256
                and peer.ca_sha256 == enrollment.ca_sha256,
                "SYNTHETIC_PEER_BINDING_MISMATCH")
        role = "SUBMIT" if request.operation == "CAS_SUBMIT" else "READ"
        require(role in enrollment.roles, "OPERATION_ROLE_DENIED")
    except (BootGuardBlocked, TypeError, ValueError, RecursionError) as exc:
        reason = str(exc) if isinstance(exc, BootGuardBlocked) else "INVALID_BINDING"
        return OfflineBindingVerdict("REJECT", reason)
    return OfflineBindingVerdict(
        "STATIC_BINDING_CANDIDATE", "NO_ACTUAL_MTLS_OR_IO_EVIDENCE"
    )


@dataclass(frozen=True)
class UnknownCommitRecovery:
    """A retry plan, not a CAS result or evidence of negative commit."""

    next_operations: tuple[str, ...] = ("COMMIT_LOOKUP", "HEAD_READ")
    can_retry_submit: bool = False
    may_advance_epoch: bool = False
    authorized_to_start_docker: bool = False
    status: str = "OUTCOME_UNKNOWN_DENY"


def unknown_commit_recovery(request_sha256: str) -> UnknownCommitRecovery:
    require(sha(request_sha256), "INVALID_UNKNOWN_COMMIT_REQUEST")
    return UnknownCommitRecovery()
