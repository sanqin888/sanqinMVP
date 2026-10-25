"""C5-G2-B2B2: isolated two-sample process-exclusion corroboration.

Consumes only bounded result objects already produced by proc_reference_census.
It cannot operate systemd, inspect production /proc, execute root programs,
or grant maintenance/install authority. Contradictions always block.
"""
from __future__ import annotations

from typing import Any


class RevalidationBlocked(ValueError):
    """A process-exclusion claim lacked independent consistent evidence."""


EXPECTED_KIND = "c5-g2b2a-proc-reference-census-v1"
EXPECTED_ROOT = "/opt/sanq/runtime"


def _check(value: bool, reason: str) -> None:
    if not value:
        raise RevalidationBlocked(reason)


def _pids(value: Any) -> list[int]:
    _check(type(value) is list and len(value) <= 65536, "invalid pid list")
    _check(all(type(pid) is int and 0 < pid <= 2**31 - 1 for pid in value),
           "invalid pid identity")
    _check(value == sorted(set(value)), "repeated or unordered pid")
    return value


def _one(evidence: Any) -> tuple[int, int]:
    _check(type(evidence) is dict
           and set(evidence) == {
               "kind", "runtimeRoot", "processesObserved",
               "runtimeReferencePids", "unknownPids", "pathReferenceCount",
               "unresolvedProcessCount", "pathOnlyCensus",
               "mountNamespaceAndAliasesVerified",
               "evidenceSourceAuthenticated",
               "crossProcessQuiescenceVerified", "readyToInstall",
               "authorizedToMutateProduction",
           }, "unexpected census record")
    _check(evidence["kind"] == EXPECTED_KIND
           and evidence["runtimeRoot"] == EXPECTED_ROOT
           and evidence["pathOnlyCensus"] is True,
           "wrong reference sensor")
    for key in ("mountNamespaceAndAliasesVerified", "evidenceSourceAuthenticated",
                "crossProcessQuiescenceVerified", "readyToInstall",
                "authorizedToMutateProduction"):
        _check(evidence[key] is False, "sensor incorrectly claims privilege")
    holders = _pids(evidence["runtimeReferencePids"])
    unknown = _pids(evidence["unknownPids"])
    count = evidence["processesObserved"]
    _check(type(count) is int and 0 <= count <= 65536,
           "invalid census coverage")
    _check(type(evidence["pathReferenceCount"]) is int
           and evidence["pathReferenceCount"] == len(holders)
           and type(evidence["unresolvedProcessCount"]) is int
           and evidence["unresolvedProcessCount"] == len(unknown),
           "inconsistent census totals")
    _check(count >= len(set(holders) | set(unknown)),
           "inconsistent observed process count")
    _check(not holders and not unknown, "Runtime holder or unknown process remains")
    return count, len(holders)


def corroborate_isolated_exclusion(first: Any, second: Any) -> dict[str, Any]:
    """Require two complete idle reports, never turn them into installation proof."""
    first_count, _ = _one(first)
    second_count, _ = _one(second)
    return {
        "kind": "c5-g2b2b2-inert-reference-corroboration-v1",
        "samples": 2,
        "observedProcessCounts": [first_count, second_count],
        "noTextualRuntimeReferencesReported": True,
        "realHostObservationAuthenticated": False,
        "mountNamespaceAndAliasesVerified": False,
        "liveActorExclusionVerified": False,
        "crossProcessQuiescenceVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }
