"""R2-A2-3-P1: offline Boot Guard candidate decision; never live authorization.

All inputs, including an OFF_HOST receipt, are caller-supplied claims. A future
privileged adapter must independently verify enrollment, code/unit pins,
atomic file+directory fsync, off-host signed/CAS authority and writer quiescence.
No Docker, systemd, host I/O, release or daemon start is implemented here.
"""
from __future__ import annotations

from dataclasses import dataclass

from maintenance_boot_guard_contract import (
    BootGuardBlocked, BootGuardState, CasRequest, CustodyReceipt,
    InstallationAnchor, correlate_claims, identity, require,
)

BOOT_CANDIDATE_PHASES = frozenset({"INSTALLED_INACTIVE", "READY_TO_ARM"})


@dataclass(frozen=True)
class BootGuardVerdict:
    """Positive *candidate* is never an execution permit or trust attestation."""

    candidate: str
    reason: str
    decision: str = "DENY"
    authorized_to_start_docker: bool = False
    persistence_verified: bool = False
    off_host_cas_verified: bool = False
    live_fence_verified: bool = False
    authorized_to_mutate_production: bool = False
    ready_to_install: bool = False


def _deny(reason: str) -> BootGuardVerdict:
    return BootGuardVerdict("DENY", reason)


def evaluate_boot_candidate(*, observed_host_id: str,
                            anchor: InstallationAnchor | None,
                            state: BootGuardState | None,
                            request: CasRequest | None,
                            receipts: tuple[CustodyReceipt, ...] | None,
                            off_host_available: bool) -> BootGuardVerdict:
    """Fail-closed pure adjudication, including missing enrollment and damaged state.

    'ALLOW_CANDIDATE' only means syntactically correlated claims in a nominal
    phase. It must never be connected directly to systemd ExecStartPre/Condition:
    the real start decision remains DENY in every returned verdict.
    """
    try:
        require(identity(observed_host_id), "UNKNOWN_HOST")
        require(type(anchor) is InstallationAnchor, "MISSING_ENROLLMENT_ANCHOR")
        anchor.document()
        require(anchor.host_id == observed_host_id, "WRONG_HOST")
        require(type(state) is BootGuardState, "MISSING_OR_INVALID_STATE")
        state.document()
        require(state.host_id == observed_host_id
                and state.installation_id == anchor.installation_id
                and state.anchor_sha256 == anchor.sha256(), "ANCHOR_STATE_MISMATCH")
        if state.phase not in BOOT_CANDIDATE_PHASES:
            return _deny("RELEASE_AUTHORITY_NOT_IMPLEMENTED" if state.phase == "RELEASED"
                         else "MAINTENANCE_OR_UNKNOWN")
        require(type(off_host_available) is bool and off_host_available,
                "OFF_HOST_UNREACHABLE")
        require(type(request) is CasRequest, "MISSING_CAS_REQUEST")
        require(type(receipts) is tuple, "MISSING_CUSTODY_PAIR")
        correlate_claims(state, request, receipts)
        return BootGuardVerdict("ALLOW_CANDIDATE", "CLAIMS_CORRELATED_ONLY")
    except BootGuardBlocked as exc:
        return _deny(str(exc))