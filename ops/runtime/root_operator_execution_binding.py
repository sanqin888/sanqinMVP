"""C5-G2 B02-B4A: inert byte/claimed-FD identity binding model.

This module is deliberately pure: no paths, file descriptors, host reads,
Python compilation/import, subprocess, callbacks, execution, or installation.
The *same bytes object* rule only models a future in-memory handoff; it does
NOT prove a real interpreter used those bytes or that claimed FD facts are true.
Both snapshots and expected hash still require independent provenance.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any

from root_private_source_fd import DIGEST, MAX_SOURCE


class ExecutionBindingBlocked(ValueError):
    """Reject ambiguous or divergent proposed operator handoff material."""


@dataclass(frozen=True, slots=True)
class InertSourceMaterial:
    """Immutable synthetic material; not an authenticated source capability."""

    source_bytes: bytes
    source_sha256: str
    claimed_fd_identity: tuple[int, int, int, int, int]


IDENTITY_FIELDS = ("device", "inode", "size", "mtimeNs", "ctimeNs")
HANDOFF_MODE = "same-memory-buffer-no-execute"


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise ExecutionBindingBlocked(reason)


def _claimed_identity(value: Any, expected_size: int) -> tuple[int, int, int, int, int]:
    _require(type(value) is dict and set(value) == set(IDENTITY_FIELDS),
             "missing or unknown FD identity fields")
    _require(all(type(value[field]) is int for field in IDENTITY_FIELDS),
             "FD identity fields must be plain integers")
    _require(value["device"] > 0 and value["inode"] > 0
             and value["size"] == expected_size
             and value["mtimeNs"] > 0 and value["ctimeNs"] > 0,
             "invalid claimed FD identity or source size")
    return tuple(value[field] for field in IDENTITY_FIELDS)


def freeze_inert_source_material(source: bytes, *, expected_sha256: str,
                                 claimed_fd_identity: Any) -> InertSourceMaterial:
    """Snapshot only caller-provided immutable bytes; never open source path/FD."""
    _require(type(source) is bytes and 0 < len(source) <= MAX_SOURCE,
             "source must be bounded immutable bytes")
    _require(type(expected_sha256) is str
             and DIGEST.fullmatch(expected_sha256) is not None,
             "invalid separately pinned expected source SHA-256")
    _require(hashlib.sha256(source).hexdigest() == expected_sha256,
             "source bytes do not match expected digest")
    identity = _claimed_identity(claimed_fd_identity, len(source))
    return InertSourceMaterial(source, expected_sha256, identity)


def review_inert_handoff(material: Any, *, proposed_consumer_bytes: Any,
                         independently_pinned_sha256: str,
                         claimed_consumer_fd_identity: Any,
                         handoff_mode: str) -> dict[str, Any]:
    """Model same-object handoff; ALWAYS return BLOCKED for actual execution.

    A path reopen, copied equal-content bytes, divergent inode claim, or
    unsupported consumer mode cannot silently qualify. Re-hash the material,
    including a forged/replaced dataclass, at each review.
    """
    _require(type(material) is InertSourceMaterial,
             "missing or forged material type")
    _require(type(material.source_bytes) is bytes
             and 0 < len(material.source_bytes) <= MAX_SOURCE,
             "material bytes invalid")
    _require(type(independently_pinned_sha256) is str
             and DIGEST.fullmatch(independently_pinned_sha256) is not None
             and material.source_sha256 == independently_pinned_sha256
             and hashlib.sha256(material.source_bytes).hexdigest()
             == independently_pinned_sha256,
             "material no longer agrees with independently pinned bytes")
    _require(type(material.claimed_fd_identity) is tuple
             and len(material.claimed_fd_identity) == len(IDENTITY_FIELDS)
             and all(type(item) is int for item in material.claimed_fd_identity),
             "material FD identity shape invalid")
    _require(type(handoff_mode) is str and handoff_mode == HANDOFF_MODE,
             "path reopen, import-based or execution handoff forbidden in B4A")
    _require(type(proposed_consumer_bytes) is bytes
             and proposed_consumer_bytes is material.source_bytes,
             "consumer must reference the exact in-memory snapshot object")
    consumer_identity = _claimed_identity(
        claimed_consumer_fd_identity, len(material.source_bytes))
    _require(consumer_identity == material.claimed_fd_identity,
             "consumer claimed FD identity differs from source observation")
    # A matching purely in-memory model is NOT root/trust/execution evidence.
    return {
        "kind": "c5-g2-b02b4a-inert-binding-review-v1",
        "sameSnapshotObjectClaimConsistent": True,
        "claimedFdIdentityConsistent": True,
        "sourceDigestConsistent": True,
        "sourceProvenanceAuthenticated": False,
        "fdIdentityIndependentlyWitnessed": False,
        "pythonInterpreterAndImportClosureVerified": False,
        "actualConsumerExecutionVerified": False,
        "newConsumerAdmissionPrevented": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
