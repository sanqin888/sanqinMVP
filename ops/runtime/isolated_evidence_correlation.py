"""C5-B3B2E: inert linkage of isolated layout, ledger and archive-byte proof.

Inputs are fixtures, not trusted VM observations. Nothing executes, persists,
opens caller-chosen paths, or authorizes a production operation.
"""
from __future__ import annotations

import hashlib
from typing import Any

from runtime_ledger_contract import LedgerBlocked, validate_chain
from versioned_persistence_contract import PersistenceBlocked, validate_journal


class IsolatedEvidenceBlocked(PersistenceBlocked):
    """Incomplete or contradictory offline evidence."""


def correlate_isolated_evidence(
    host: Any, ledger: Any, journals: Any, current_archive: Any
) -> dict[str, Any]:
    """Require exact archive bytes for modeled active version; still inert.

    The binary bytes are supplied directly by a test. This does NOT authenticate
    GitHub publication, independently read a VM filesystem, or inspect Docker.
    """
    fields = {
        "schemaVersion", "kind", "filesystemLayoutExamined",
        "productionHostExamined", "dockerAndVolumeVerified",
        "archiveAndDigestVerified", "physicalReconciliationVerified",
        "readyToInstall", "authorizedToMutateProduction",
    }
    if not isinstance(host, dict) or set(host) != fields:
        raise IsolatedEvidenceBlocked("unexpected host fixture schema")
    if (
        type(host["schemaVersion"]) is not int
        or host["schemaVersion"] != 1
        or host["kind"] != "isolated-host-inspection-v1"
        or host["filesystemLayoutExamined"] is not True
    ):
        raise IsolatedEvidenceBlocked("missing isolated layout inspection")
    for key in (
        "productionHostExamined", "dockerAndVolumeVerified",
        "archiveAndDigestVerified", "physicalReconciliationVerified",
        "readyToInstall", "authorizedToMutateProduction",
    ):
        if host[key] is not False:
            raise IsolatedEvidenceBlocked("fixture cannot assert real host authority")
    if not isinstance(current_archive, bytes) or not current_archive:
        raise IsolatedEvidenceBlocked("archive bytes unavailable")
    if not isinstance(journals, list) or not journals:
        raise IsolatedEvidenceBlocked("missing journal evidence")
    try:
        chain = validate_chain(ledger, journals)
        last = validate_journal(journals[-1])
    except PersistenceBlocked as exc:
        raise IsolatedEvidenceBlocked("invalid transaction chain") from exc
    if chain["modeledActiveSha"] != last["targetSha"]:
        raise IsolatedEvidenceBlocked("active checkpoint mismatched")
    actual = "sha256:" + hashlib.sha256(current_archive).hexdigest()
    if actual != last["targetVersion"]["runtimeArchiveSha256"]:
        raise IsolatedEvidenceBlocked("supplied archive bytes do not match record")
    return {
        "schemaVersion": 1,
        "kind": "inert-isolated-evidence-correlation-v1",
        "modeledActiveSha": chain["modeledActiveSha"],
        "lastLedgerRecordHash": chain["recordHash"],
        "candidateArchiveBytesMatch": True,
        "externalPublicationVerified": False,
        "productionHostExamined": False,
        "dockerAndVolumeVerified": False,
        "physicalReconciliationVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }
