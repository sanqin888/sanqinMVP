"""R2-A2-3-P1: pure, untrusted Boot Guard and custody protocol contracts.

These immutable values are *claims*, never filesystem durability, root ownership,
an authenticated off-host CAS, or permission to start Docker. No adapters here
perform I/O or grant any authority. A2-1 maintenance_fence stays independent.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Protocol

from normal_runtime_launch import canonical, digest

HEX = re.compile(r"[0-9a-f]{64}\Z")
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}\Z")
TXID = re.compile(r"[a-z0-9][a-z0-9-]{7,79}\Z")
PHASES = frozenset({
    "INSTALLED_INACTIVE", "READY_TO_ARM", "ARMING", "FENCED",
    "INCIDENT", "UNKNOWN_OR_CORRUPT", "OFF_HOST_UNREACHABLE",
    "RELEASE_PENDING", "RELEASED",
})
MAX_RECORD_BYTES = 16384


class BootGuardBlocked(ValueError):
    """Fixed-category rejection; no untrusted input in the message."""


def require(condition: bool, code: str) -> None:
    if not condition:
        raise BootGuardBlocked(code)


def sha(value: object) -> bool:
    return type(value) is str and HEX.fullmatch(value) is not None and value != "0" * 64


def identity(value: object) -> bool:
    return type(value) is str and ID.fullmatch(value) is not None


def transaction(value: object) -> bool:
    return type(value) is str and TXID.fullmatch(value) is not None


@dataclass(frozen=True)
class InstallationAnchor:
    """Enrollment must be independently proven by a future root-owned adapter."""

    host_id: str
    installation_id: str
    guard_source_sha256: str
    unit_source_sha256: str

    def document(self) -> dict:
        require(identity(self.host_id) and identity(self.installation_id),
                "INVALID_ANCHOR_IDENTITY")
        require(sha(self.guard_source_sha256) and sha(self.unit_source_sha256),
                "INVALID_SOURCE_PIN")
        return {"schema": "sanq.runtime.boot-guard-anchor.v1",
                "hostId": self.host_id, "installationId": self.installation_id,
                "guardSourceSha256": self.guard_source_sha256,
                "unitSourceSha256": self.unit_source_sha256}

    def sha256(self) -> str:
        return digest(canonical(self.document()))


@dataclass(frozen=True)
class BootGuardState:
    """A proposed persistent head. Epoch increments on every proposed commit."""

    anchor_sha256: str
    host_id: str
    installation_id: str
    owner_id: str
    transaction_id: str
    epoch: int
    revision: int
    phase: str
    previous_sha256: str | None
    registry_sha256: str

    def document(self) -> dict:
        require(sha(self.anchor_sha256) and sha(self.registry_sha256),
                "INVALID_STATE_PIN")
        require(identity(self.host_id) and identity(self.installation_id)
                and identity(self.owner_id) and transaction(self.transaction_id),
                "INVALID_STATE_IDENTITY")
        require(type(self.epoch) is int and 1 <= self.epoch <= 2147483647
                and type(self.revision) is int and self.revision == self.epoch - 1,
                "INVALID_EPOCH_OR_REVISION")
        require(type(self.phase) is str and self.phase in PHASES, "UNKNOWN_PHASE")
        if self.epoch == 1:
            require(self.phase == "INSTALLED_INACTIVE" and self.previous_sha256 is None,
                    "INVALID_INITIAL_STATE")
        else:
            require(sha(self.previous_sha256), "INVALID_PREDECESSOR")
        return {"schema": "sanq.runtime.boot-guard-head.v1",
                "anchorSha256": self.anchor_sha256, "hostId": self.host_id,
                "installationId": self.installation_id, "ownerId": self.owner_id,
                "transactionId": self.transaction_id, "epoch": self.epoch,
                "revision": self.revision, "phase": self.phase,
                "previousSha256": self.previous_sha256,
                "registrySha256": self.registry_sha256}

    def encode(self) -> bytes:
        raw = canonical(self.document())
        require(len(raw) <= MAX_RECORD_BYTES, "RECORD_TOO_LARGE")
        return raw

    def sha256(self) -> str:
        return digest(self.encode())


def _canonical_document(raw: bytes) -> dict:
    """Exact bytes only: bound size, ASCII, unique keys, canonical serialization."""
    require(type(raw) is bytes and 0 < len(raw) <= MAX_RECORD_BYTES, "INVALID_RECORD_BYTES")

    def unique(pairs):
        out = {}
        for key, value in pairs:
            require(key not in out, "DUPLICATE_KEY")
            out[key] = value
        return out

    try:
        doc = json.loads(raw.decode("ascii"), object_pairs_hook=unique,
                         parse_constant=lambda _: require(False, "INVALID_CONSTANT"))
        require(type(doc) is dict and canonical(doc) == raw, "NONCANONICAL_RECORD")
        return doc
    except (UnicodeError, ValueError, TypeError, RecursionError) as exc:
        if isinstance(exc, BootGuardBlocked):
            raise
        raise BootGuardBlocked("INVALID_RECORD_BYTES") from exc


def decode_anchor(raw: bytes) -> InstallationAnchor:
    """Parse a purported anchor; this does not attest its root-owned origin."""
    doc = _canonical_document(raw)
    require(set(doc) == {"schema", "hostId", "installationId",
                         "guardSourceSha256", "unitSourceSha256"}
            and doc["schema"] == "sanq.runtime.boot-guard-anchor.v1",
            "INVALID_ANCHOR_SCHEMA")
    anchor = InstallationAnchor(doc["hostId"], doc["installationId"],
                                doc["guardSourceSha256"], doc["unitSourceSha256"])
    require(canonical(anchor.document()) == raw, "NONCANONICAL_ANCHOR")
    return anchor


def decode_state(raw: bytes) -> BootGuardState:
    """Parse a purported state; independent enrollment and CAS still required."""
    doc = _canonical_document(raw)
    require(set(doc) == {"schema", "anchorSha256", "hostId", "installationId",
                         "ownerId", "transactionId", "epoch", "revision",
                         "phase", "previousSha256", "registrySha256"}
            and doc["schema"] == "sanq.runtime.boot-guard-head.v1",
            "INVALID_STATE_SCHEMA")
    state = BootGuardState(doc["anchorSha256"], doc["hostId"],
                           doc["installationId"], doc["ownerId"],
                           doc["transactionId"], doc["epoch"], doc["revision"],
                           doc["phase"], doc["previousSha256"], doc["registrySha256"])
    require(state.encode() == raw, "NONCANONICAL_STATE")
    return state


@dataclass(frozen=True)
class CasRequest:
    """Compare against off-host authoritative head; request is not a commit."""

    host_id: str
    installation_id: str
    owner_id: str
    transaction_id: str
    expected_epoch: int
    proposed_epoch: int
    expected_state_sha256: str | None
    proposed_state_sha256: str
    nonce_sha256: str

    def document(self) -> dict:
        require(identity(self.host_id) and identity(self.installation_id)
                and identity(self.owner_id) and transaction(self.transaction_id),
                "INVALID_CAS_IDENTITY")
        require(type(self.expected_epoch) is int and 0 <= self.expected_epoch < 2147483647
                and type(self.proposed_epoch) is int
                and self.proposed_epoch == self.expected_epoch + 1,
                "NONMONOTONIC_CAS")
        require((self.expected_state_sha256 is None if self.expected_epoch == 0
                 else sha(self.expected_state_sha256)), "INVALID_CAS_PREDECESSOR")
        require(sha(self.proposed_state_sha256) and sha(self.nonce_sha256)
                and self.proposed_state_sha256 != self.expected_state_sha256,
                "INVALID_CAS_PIN")
        return {"schema": "sanq.runtime.boot-guard-cas.v1",
                "hostId": self.host_id, "installationId": self.installation_id,
                "ownerId": self.owner_id, "transactionId": self.transaction_id,
                "expectedEpoch": self.expected_epoch,
                "proposedEpoch": self.proposed_epoch,
                "expectedStateSha256": self.expected_state_sha256,
                "proposedStateSha256": self.proposed_state_sha256,
                "nonceSha256": self.nonce_sha256}

    def sha256(self) -> str:
        return digest(canonical(self.document()))


@dataclass(frozen=True)
class CustodyReceipt:
    """Claim of a completed write. A hash is NOT authentication or fsync proof."""

    location: str
    request_sha256: str
    host_id: str
    installation_id: str
    owner_id: str
    transaction_id: str
    epoch: int
    revision: int
    previous_sha256: str | None
    state_sha256: str
    evidence_sha256: str

    def document(self) -> dict:
        require(type(self.location) is str and self.location in ("LOCAL", "OFF_HOST"),
                "INVALID_RECEIPT_LOCATION")
        require(sha(self.request_sha256) and sha(self.state_sha256)
                and sha(self.evidence_sha256), "INVALID_RECEIPT_PIN")
        require(identity(self.host_id) and identity(self.installation_id)
                and identity(self.owner_id) and transaction(self.transaction_id),
                "INVALID_RECEIPT_IDENTITY")
        require(type(self.epoch) is int and 1 <= self.epoch <= 2147483647
                and type(self.revision) is int and self.revision == self.epoch - 1,
                "INVALID_RECEIPT_EPOCH")
        require((self.previous_sha256 is None if self.epoch == 1
                 else sha(self.previous_sha256)), "INVALID_RECEIPT_PREDECESSOR")
        return {"schema": "sanq.runtime.boot-guard-receipt.v1",
                "location": self.location, "requestSha256": self.request_sha256,
                "hostId": self.host_id, "installationId": self.installation_id,
                "ownerId": self.owner_id, "transactionId": self.transaction_id,
                "epoch": self.epoch, "revision": self.revision,
                "previousSha256": self.previous_sha256,
                "stateSha256": self.state_sha256, "evidenceSha256": self.evidence_sha256}


def correlate_claims(state: BootGuardState, request: CasRequest,
                     receipts: tuple[CustodyReceipt, ...]) -> None:
    """Correlate purported records. This cannot prove their independent origin."""
    require(type(state) is BootGuardState and type(request) is CasRequest,
            "TYPED_CAS_REQUIRED")
    state.document()
    request.document()
    require(request.host_id == state.host_id
            and request.installation_id == state.installation_id
            and request.owner_id == state.owner_id
            and request.transaction_id == state.transaction_id
            and request.expected_epoch == state.epoch - 1
            and request.proposed_epoch == state.epoch
            and request.expected_state_sha256 == state.previous_sha256
            and request.proposed_state_sha256 == state.sha256(),
            "CAS_STATE_MISMATCH")
    require(type(receipts) is tuple and len(receipts) == 2
            and all(type(r) is CustodyReceipt for r in receipts),
            "PAIR_REQUIRED")
    require({r.location for r in receipts} == {"LOCAL", "OFF_HOST"},
            "INDEPENDENT_LOCATIONS_REQUIRED")
    for receipt in receipts:
        receipt.document()
        require(receipt.request_sha256 == request.sha256()
                and receipt.host_id == state.host_id
                and receipt.installation_id == state.installation_id
                and receipt.owner_id == state.owner_id
                and receipt.transaction_id == state.transaction_id
                and receipt.epoch == state.epoch
                and receipt.revision == state.revision
                and receipt.previous_sha256 == state.previous_sha256
                and receipt.state_sha256 == state.sha256(),
                "RECEIPT_MISMATCH")


class LocalDurableCustody(Protocol):
    """Future trusted implementation: root anchor, atomic write + file/dir fsync."""

    def read_anchor(self, host_id: str) -> bytes | None: ...
    def read_head(self, host_id: str) -> bytes | None: ...
    def commit_local(self, request: CasRequest, state_bytes: bytes) -> CustodyReceipt: ...


class OffHostCasCustody(Protocol):
    """Future independent writer: durable CAS, replay protection and authenticated read."""

    def compare_and_swap(self, request: CasRequest) -> CustodyReceipt: ...
    def read_head(self, host_id: str, installation_id: str) -> CustodyReceipt | None: ...