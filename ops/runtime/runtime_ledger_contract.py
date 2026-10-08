"""C5-B3B2C: pure cross-transaction Ledger continuity model.

Neither a record nor a modeled checkpoint authenticates physical host state.
No filesystem IO, Docker, subprocess, root operations, or execution authority.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from versioned_persistence_contract import PersistenceBlocked, validate_journal
from release_contract import require_sha

HASH = re.compile(r"sha256:[0-9a-f]{64}\Z")
ZERO = "sha256:" + "0" * 64


class LedgerBlocked(PersistenceBlocked):
    """Untrusted, damaged or discontinuous modeled runtime ledger."""


def _digest(value: Any) -> str:
    if not isinstance(value, str) or HASH.fullmatch(value) is None:
        raise LedgerBlocked("malformed ledger hash")
    return value


def _hash(obj: dict[str, Any]) -> str:
    data = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return "sha256:" + hashlib.sha256(data).hexdigest()


def checkpoint(journal: Any, *, generation: int, parent_hash: str,
               installation_id: str, physical_evidence_hash: str) -> dict[str, Any]:
    """Model a committed transaction boundary; does not assert a real deployment."""
    j = validate_journal(journal)
    if j["phase"] not in ("active", "rolled-back"):
        raise LedgerBlocked("unresolved transaction cannot make checkpoint")
    if type(generation) is not int or generation < 1:
        raise LedgerBlocked("invalid generation")
    if not isinstance(installation_id, str) or re.fullmatch(r"[0-9a-f]{32}", installation_id) is None:
        raise LedgerBlocked("invalid installation identity")
    result = {
        "schemaVersion": 1, "kind": "inert-runtime-ledger-checkpoint-v1",
        "generation": generation, "installationId": installation_id,
        "transactionId": j["transactionId"],
        "parentHash": _digest(parent_hash),
        "journalHash": _hash(j),
        "physicalEvidenceHash": _digest(physical_evidence_hash),
        "activeSha": j["targetSha"],
        "previousSha": j["currentSha"],
        "phase": j["phase"],
        "activeVersion": j["targetVersion"],
        "previousVersion": j["currentVersion"],
        "requiresIndependentPhysicalVerification": True,
        "authorizedToMutateProduction": False,
    }
    result["recordHash"] = _hash(result)
    return result


def validate_chain(entries: Any, journals: Any) -> dict[str, Any]:
    """No implicit bootstrap, no orphan generations or cross-transaction drift."""
    if not isinstance(entries, list) or not entries or len(entries) > 256:
        raise LedgerBlocked("missing/oversized chain")
    if not isinstance(journals, list) or len(journals) != len(entries):
        raise LedgerBlocked("missing journal evidence")
    previous = None
    ids: set[str] = set()
    for index, (record, source) in enumerate(zip(entries, journals), 1):
        if not isinstance(record, dict) or set(record) != {
            "schemaVersion", "kind", "generation", "installationId",
            "transactionId", "parentHash", "journalHash", "physicalEvidenceHash",
            "activeSha", "previousSha", "phase", "activeVersion", "previousVersion",
            "requiresIndependentPhysicalVerification", "authorizedToMutateProduction",
            "recordHash",
        }:
            raise LedgerBlocked("unknown ledger fields")
        j = validate_journal(source)
        parent = previous["recordHash"] if previous else ZERO
        expected = checkpoint(
            j, generation=index, parent_hash=parent,
            installation_id=record["installationId"],
            physical_evidence_hash=record["physicalEvidenceHash"],
        )
        if record != expected:
            raise LedgerBlocked("ledger hash/checkpoint mismatch")
        if record["transactionId"] in ids:
            raise LedgerBlocked("duplicate transaction identifier")
        ids.add(record["transactionId"])
        if previous is not None:
            if record["installationId"] != previous["installationId"]:
                raise LedgerBlocked("installation identity changed")
            if j["currentSha"] != previous["activeSha"]:
                raise LedgerBlocked("transaction entry continuity broken")
            if j["currentVersion"] != previous["activeVersion"]:
                raise LedgerBlocked("current release proof continuity broken")
            if j["previousSha"] != previous["previousSha"] and j["action"] == "rollback":
                raise LedgerBlocked("rollback historical pointer mismatch")
        previous = record
    assert previous is not None
    return {
        "generation": previous["generation"],
        "modeledActiveSha": require_sha(previous["activeSha"]),
        "modeledPreviousSha": require_sha(previous["previousSha"]),
        "recordHash": previous["recordHash"],
        "requiresIndependentPhysicalVerification": True,
        "authorizedToMutateProduction": False,
    }
