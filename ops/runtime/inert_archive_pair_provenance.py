"""C5-B3B2F: isolated exact-archive, paired-digest provenance correlation.

Reuses the existing B2B1 authenticated publication and member-inventory verifier.
No production operations; fetch is mandatory and injected by offline tests.
"""
from __future__ import annotations

from typing import Any, Callable

from versioned_persistence_contract import PersistenceBlocked, validate_journal
from versioned_release_contract import HistoricalReleaseBlocked, verify_historical_release


class ArchivePairBlocked(PersistenceBlocked):
    """Incomplete/mismatched archived version or publication evidence."""


def verify_inert_version_triplet(
    journal: Any,
    archives: Any,
    *,
    fetch: Callable[[str], Any],
) -> dict[str, Any]:
    """Validate exact current, previous and target archive+API/Web proofs.

    This is not a VM inspection or permission to install. The fetch callback
    is an injected test collaborator; production trust depends on separately
    reviewed host/network ownership and is not established by this function.
    """
    j = validate_journal(journal)
    required = {j["currentSha"], j["previousSha"], j["targetSha"]}
    if not isinstance(archives, dict) or set(archives) != required:
        raise ArchivePairBlocked("exact version archive set required")
    if not callable(fetch):
        raise ArchivePairBlocked("explicit provenance retrieval required")
    for sha in sorted(required):
        payload = archives[sha]
        if not isinstance(payload, bytes) or not payload:
            raise ArchivePairBlocked("missing retained archive bytes")
        try:
            verified = verify_historical_release(payload, sha, fetch=fetch)
        except (HistoricalReleaseBlocked, ValueError, TypeError, KeyError) as exc:
            raise ArchivePairBlocked("historical archive publication verification failed") from exc
        for name in ("currentVersion", "previousVersion", "targetVersion"):
            expected = j[name]
            if expected["sourceSha"] != sha:
                continue
            if (expected["runtimeArchiveSha256"] != verified["runtimeArchiveDigest"]
                    or expected["images"] != verified["images"]):
                raise ArchivePairBlocked("runtime or paired image digest mismatch")
    return {
        "schemaVersion": 1,
        "kind": "inert-runtime-version-triplet-correlation-v1",
        "versionCount": len(required),
        "versionShas": sorted(required),
        "requiresIndependentHostVerification": True,
        "requiresIndependentPublicationTrust": True,
        "readyToInstall": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
    }
