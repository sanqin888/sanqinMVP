"""R2-A2-3 P2-C3A: versioned, OFFLINE-ONLY SQLite CAS proposal/receipt.

This module is not an authenticated OFF_HOST authority. Its lab receipts must
never be converted to P1 CustodyReceipt or used to enable Docker/systemd.
"""
from __future__ import annotations

from dataclasses import dataclass

from maintenance_boot_guard_contract import (
    BootGuardState, CasRequest, decode_state, identity, require, sha,
)
from normal_runtime_launch import canonical, digest

SUBMIT_SCHEMA = "sanq.runtime.offline-cas-submit.v2"
RECEIPT_SCHEMA = "sanq.runtime.offline-cas-lab-receipt.v2"
LAB_CLASSIFICATION = "UNAUTHENTICATED_OFFLINE_LAB_ONLY"


@dataclass(frozen=True)
class OfflineCasSubmission:
    """Canonical v2 envelope; client_identity is a test claim, NOT authentication."""

    request: CasRequest
    state_bytes: bytes
    anchor_sha256: str
    client_identity: str

    def state(self) -> BootGuardState:
        require(type(self.request) is CasRequest, "INVALID_REQUEST")
        self.request.document()
        require(sha(self.anchor_sha256) and identity(self.client_identity),
                "INVALID_LAB_SUBMISSION")
        state = decode_state(self.state_bytes)
        request = self.request
        require(state.anchor_sha256 == self.anchor_sha256
                and state.host_id == request.host_id
                and state.installation_id == request.installation_id
                and state.owner_id == request.owner_id
                and state.transaction_id == request.transaction_id
                and state.epoch == request.proposed_epoch
                and state.previous_sha256 == request.expected_state_sha256
                and request.expected_epoch == state.epoch - 1
                and request.proposed_state_sha256 == state.sha256(),
                "SUBMISSION_STATE_MISMATCH")
        return state

    def encode(self) -> bytes:
        state = self.state()
        return canonical({"schema": SUBMIT_SCHEMA,
                          "request": self.request.document(),
                          "state": state.document(),
                          "anchorSha256": self.anchor_sha256,
                          "clientIdentity": self.client_identity})

    def sha256(self) -> str:
        return digest(self.encode())


@dataclass(frozen=True)
class OfflineCasReceipt:
    """Durably stored lab record; NOT an authenticated off-host custody receipt."""

    host_id: str
    installation_id: str
    client_identity: str
    epoch: int
    request_sha256: str
    state_sha256: str
    proposal_sha256: str
    previous_commit_sha256: str | None
    commit_sha256: str

    def encode(self) -> bytes:
        require(identity(self.host_id) and identity(self.installation_id)
                and identity(self.client_identity)
                and type(self.epoch) is int and 1 <= self.epoch <= 2147483647
                and all(sha(item) for item in (
                    self.request_sha256, self.state_sha256,
                    self.proposal_sha256, self.commit_sha256))
                and (self.previous_commit_sha256 is None
                     or sha(self.previous_commit_sha256)),
                "INVALID_LAB_RECEIPT")
        return canonical({"schema": RECEIPT_SCHEMA,
                          "classification": LAB_CLASSIFICATION,
                          "hostId": self.host_id,
                          "installationId": self.installation_id,
                          "clientIdentity": self.client_identity,
                          "epoch": self.epoch,
                          "requestSha256": self.request_sha256,
                          "stateSha256": self.state_sha256,
                          "proposalSha256": self.proposal_sha256,
                          "previousCommitSha256": self.previous_commit_sha256,
                          "commitSha256": self.commit_sha256})


@dataclass(frozen=True)
class OfflineCasHead:
    """Latest lab head; this is not an independent anti-rollback attestation."""

    epoch: int
    state_sha256: str
    commit_sha256: str
    phase: str


@dataclass(frozen=True)
class OfflineCasLookup:
    receipt: OfflineCasReceipt
    is_current_head: bool
