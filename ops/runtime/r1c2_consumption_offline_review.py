"""R1C-2B: offline-only, untrusted dynamic-consumption evidence reviewer.

Consumes caller-provided bytes; never opens paths, executes code or obtains authority.
CANDIDATE_REVIEWED is a *structural* result, always decision=BLOCKED.
The separately supplied pins are comparison inputs, not authenticated custody.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

SCHEMA = "sanq.runtime.r1c2-consumption-evidence.v1"
REVIEW_SCHEMA = "sanq.runtime.r1c2-offline-review.v1"
MAX_ENVELOPE = 32 * 1024 * 1024
MAX_EVENTS = 32768
MAX_PROCESSES = 64
MAX_FILES = 512
MAX_ARTIFACTS = 64
MAX_EVENT = 16 * 1024
# Private in-memory reviewer ceilings; do not weaken the frozen v1 limits.
MAX_ARTIFACT_BYTES = 32 * 1024 * 1024
MAX_TOTAL_ARTIFACT_BYTES = 64 * 1024 * 1024
SHA = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\Z")
PATH = re.compile(r"/[\x21-\x7e]{0,255}\Z")
COVERAGE = frozenset(f"COV-{n:02d}" for n in range(1, 11))
EVENT_TYPES = frozenset((
    "OBSERVATION_START", "PROCESS_FORK", "PROCESS_CLONE", "PROCESS_EXEC",
    "PROCESS_EXIT", "FILE_OPEN", "FILE_READ", "FILE_MMAP", "FILE_IDENTITY",
    "PYTHON_IMPORT", "PYTHON_CODE", "ELF_LOADER", "NATIVE_LOAD",
    "NATIVE_UNLOAD", "EVENT_LOSS", "OBSERVATION_END",
))
CLASSIFICATIONS = frozenset((
    "DISCOVERED_ONLY", "MATCHED_UNAUTHENTICATED",
    "INDEPENDENTLY_AUTHENTICATED", "GAP",
))
REASONS = frozenset((
    "START_NOT_WITNESSED", "END_NOT_WITNESSED", "CHILD_UNTRACED",
    "PROCESS_IDENTITY_AMBIGUOUS", "EVENT_LOST", "EVENT_ORDER_INVALID",
    "EVENT_BUDGET_EXCEEDED", "ARTIFACT_MISSING_OR_MISMATCHED",
    "RAW_REFERENCE_MISSING", "IMPORT_ORIGIN_UNKNOWN", "NATIVE_LOAD_UNMAPPED",
    "FILE_BINDING_AMBIGUOUS", "BYTE_CONSUMPTION_UNPROVEN",
    "SOURCE_UNAUTHENTICATED", "FILE_MUTABILITY_UNCONTROLLED",
    "CANDIDATE_CHANGED", "SCENARIO_COVERAGE_GAP",
    "OBSERVER_DEPENDENCY_UNKNOWN", "UNSUPPORTED_PLATFORM_OR_NAMESPACE",
    "SCHEMA_INVALID", "EXECUTION_INTERRUPTED_OR_UNKNOWN",
))
FIELDS = {
    "envelope": {"schema", "captureId", "scenarioId", "candidate", "scope", "session",
                 "rawArtifacts", "processes", "events", "fileBindings", "completeness",
                 "provenance", "assessment"},
    "candidate": {"sourceCommit", "launchMaterialsSha256", "requestSha256",
                  "entryPoint", "bootstrapSource", "effectAdapterSetSha256"},
    "scope": {"observerPlanId", "observerPlanSha256", "coverageIds",
              "sourceSetSha256", "permittedProcessPlanSha256", "budgetSha256"},
    "session": {"guestIdentity", "guestBootId", "mountNamespace", "pidNamespace",
                "rootMountId", "observerProcessIdentity", "pythonIdentity",
                "loaderIdentity", "observedStartUtc", "observedEndUtc", "clockDomain"},
    "artifact": {"artifactId", "kind", "sha256", "byteCount", "producer",
                 "custodyRef", "collectionScope", "completeness"},
    "process": {"processIdentity", "parentProcessIdentity", "pid", "tid",
                "startDiscriminator", "pidNamespace", "mountNamespace",
                "binaryFileBinding", "firstSeq", "lastSeq", "exitState"},
    "event": {"sequence", "timeMonotonic", "captureId", "processIdentity",
              "parentProcessIdentity", "eventType", "result", "object",
              "rawReference", "coverageIds", "uncertainty"},
    "object": {"kind", "identity", "fileBindingRef"},
    "reference": {"artifactId", "startByte", "endByte"},
    "file": {"logicalPath", "observedPath", "mountNamespace", "mountId",
             "device", "inode", "fdIdentity", "size", "sha256",
             "byteEvidenceSource", "firstEvent", "lastEvent",
             "moduleOrNativeOrigins", "aliasChain",
             "packageOrApprovedNonpackageSource", "mutabilityGuardEvidence",
             "classification"},
    "completeness": {"coveredIds", "startWitnessed", "endWitnessed",
                     "childrenCovered", "lostEventCount", "truncationDetected",
                     "observerInterrupted", "budgetExceeded", "gaps"},
    "provenance": {"separatelyPinnedSourceArtifactSha256", "reviewMethod",
                   "unverifiedFileBindingIds", "sourceGaps",
                   "independentReviewerReceiptSha256"},
    "assessment": {"reviewStatus", "reasonCodes", "decision",
                   "actualConsumptionAuthenticated", "readyToInstall",
                   "authorizedToMutateProduction"},
}


class ConsumptionReviewBlocked(ValueError):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def require(condition: bool, reason: str = "SCHEMA_INVALID") -> None:
    if not condition:
        raise ConsumptionReviewBlocked(reason)


def sha(value: Any) -> bool:
    return type(value) is str and SHA.fullmatch(value) is not None


def ident(value: Any) -> bool:
    return type(value) is str and ID.fullmatch(value) is not None


def uint(value: Any, *, positive: bool = False) -> bool:
    return type(value) is int and value >= (1 if positive else 0)


def obj(value: Any, name: str) -> dict:
    require(type(value) is dict and set(value) == FIELDS[name])
    return value


def text(value: Any, *, size: int = 256) -> bool:
    return (type(value) is str and 0 < len(value) <= size and
            value.isascii() and all(32 <= ord(c) < 127 for c in value))


def ids(value: Any, *, max_count: int) -> bool:
    return (type(value) is list and len(value) <= max_count and
            all(ident(v) for v in value) and len(set(value)) == len(value))


def cov(value: Any) -> bool:
    return ids(value, max_count=10) and set(value) <= COVERAGE


def canonical(value: Any) -> bytes:
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=True, allow_nan=False).encode("ascii")
    except (ValueError, TypeError, OverflowError, RecursionError) as exc:
        raise ConsumptionReviewBlocked("SCHEMA_INVALID") from exc


def _unique_pairs(pairs: list) -> dict:
    out = {}
    for key, value in pairs:
        require(key not in out)
        out[key] = value
    return out


def _reject_number(value: str) -> None:
    raise ConsumptionReviewBlocked("SCHEMA_INVALID")


def decode_envelope(raw: bytes) -> dict:
    """Require canonical, bounded UTF-8 JSON with no duplicate keys/floats."""
    require(type(raw) is bytes and 0 < len(raw) <= MAX_ENVELOPE,
            "EVENT_BUDGET_EXCEEDED")
    try:
        data = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_pairs,
                          parse_float=_reject_number, parse_constant=_reject_number)
    except (ValueError, UnicodeError, RecursionError, OverflowError) as exc:
        raise ConsumptionReviewBlocked("SCHEMA_INVALID") from exc
    obj(data, "envelope")
    require(data["schema"] == SCHEMA and raw == canonical(data))
    return data


def _raw_artifacts(items: Any, raw_artifacts: Any,
                   separately_pinned: Any) -> dict:
    require(type(items) is list and 1 <= len(items) <= MAX_ARTIFACTS,
            "EVENT_BUDGET_EXCEEDED")
    require(type(raw_artifacts) is dict and type(separately_pinned) is dict)
    result = {}
    total = 0
    for item in items:
        obj(item, "artifact")
        aid = item["artifactId"]
        require(ident(aid) and aid not in result)
        require(text(item["kind"]) and text(item["producer"])
                and text(item["custodyRef"], size=128)
                and text(item["collectionScope"], size=128)
                and item["completeness"] == "COMPLETE")
        require(sha(item["sha256"]) and uint(item["byteCount"]))
        require(aid in raw_artifacts and aid in separately_pinned,
                "ARTIFACT_MISSING_OR_MISMATCHED")
        raw = raw_artifacts[aid]
        require(type(raw) is bytes and len(raw) == item["byteCount"]
                and len(raw) <= MAX_ARTIFACT_BYTES,
                "ARTIFACT_MISSING_OR_MISMATCHED")
        total += len(raw)
        require(total <= MAX_TOTAL_ARTIFACT_BYTES, "EVENT_BUDGET_EXCEEDED")
        hashed = hashlib.sha256(raw).hexdigest()
        require(hashed == item["sha256"] and separately_pinned[aid] == hashed,
                "ARTIFACT_MISSING_OR_MISMATCHED")
        result[aid] = item
    require(set(result) == set(raw_artifacts) == set(separately_pinned),
            "ARTIFACT_MISSING_OR_MISMATCHED")
    return result


def _safe_path(value: Any) -> bool:
    return (type(value) is str and PATH.fullmatch(value) is not None
            and all(segment not in ("", ".", "..")
                    for segment in value[1:].split("/")))


def _files(records: Any, session: dict, artifacts: dict) -> dict:
    require(type(records) is list and len(records) <= MAX_FILES,
            "EVENT_BUDGET_EXCEEDED")
    found = {}
    used_inodes = {}
    for value in records:
        obj(value, "file")
        ref = value["fdIdentity"]
        require(ident(ref) and ref not in found, "FILE_BINDING_AMBIGUOUS")
        for field in ("logicalPath", "observedPath"):
            require(_safe_path(value[field]), "FILE_BINDING_AMBIGUOUS")
        require(value["mountNamespace"] == session["mountNamespace"]
                and uint(value["mountId"], positive=True)
                and uint(value["device"], positive=True)
                and uint(value["inode"], positive=True)
                and uint(value["size"]) and sha(value["sha256"]),
                "FILE_BINDING_AMBIGUOUS")
        require(uint(value["firstEvent"], positive=True)
                and uint(value["lastEvent"], positive=True)
                and value["firstEvent"] <= value["lastEvent"],
                "EVENT_ORDER_INVALID")
        require(ids(value["moduleOrNativeOrigins"], max_count=64)
                and type(value["aliasChain"]) is list
                and len(value["aliasChain"]) <= 16
                and all(_safe_path(p) for p in value["aliasChain"]))
        require(text(value["packageOrApprovedNonpackageSource"], size=128),
                "SOURCE_UNAUTHENTICATED")
        require(text(value["mutabilityGuardEvidence"], size=128),
                "FILE_MUTABILITY_UNCONTROLLED")
        require(value["classification"] in CLASSIFICATIONS)
        source = value["byteEvidenceSource"]
        require(ident(source) and source in artifacts,
                "BYTE_CONSUMPTION_UNPROVEN")
        require(value["sha256"] == artifacts[source]["sha256"]
                and value["size"] == artifacts[source]["byteCount"],
                "BYTE_CONSUMPTION_UNPROVEN")
        identity = (value["mountNamespace"], value["mountId"],
                    value["device"], value["inode"])
        other = used_inodes.get(identity)
        if other is not None:
            require(other["sha256"] == value["sha256"]
                    and other["size"] == value["size"],
                    "FILE_BINDING_AMBIGUOUS")
        used_inodes[identity] = value
        found[ref] = value
    return found


def _processes(records: Any, session: dict, files: dict) -> dict:
    require(type(records) is list and 1 <= len(records) <= MAX_PROCESSES,
            "EVENT_BUDGET_EXCEEDED")
    found = {}
    generations = set()
    pid_lifetimes = {}
    for value in records:
        obj(value, "process")
        ref = value["processIdentity"]
        require(ident(ref) and ref not in found, "PROCESS_IDENTITY_AMBIGUOUS")
        require(value["pidNamespace"] == session["pidNamespace"]
                and value["mountNamespace"] == session["mountNamespace"],
                "UNSUPPORTED_PLATFORM_OR_NAMESPACE")
        require(uint(value["pid"], positive=True) and uint(value["tid"], positive=True)
                and ident(value["startDiscriminator"])
                and uint(value["firstSeq"], positive=True)
                and uint(value["lastSeq"], positive=True)
                and value["lastSeq"] >= value["firstSeq"]
                and value["exitState"] in ("EXITED", "UNKNOWN"))
        require(value["binaryFileBinding"] in files,
                "FILE_BINDING_AMBIGUOUS")
        gen = (value["pidNamespace"], value["pid"], value["startDiscriminator"])
        require(ref == f"{gen[0]}:{gen[1]}:{gen[2]}",
                "PROCESS_IDENTITY_AMBIGUOUS")
        require(gen not in generations, "PROCESS_IDENTITY_AMBIGUOUS")
        generations.add(gen)
        pidkey = (value["pidNamespace"], value["pid"])
        for first, last in pid_lifetimes.get(pidkey, ()):
            require(value["lastSeq"] < first or value["firstSeq"] > last,
                    "PROCESS_IDENTITY_AMBIGUOUS")
        pid_lifetimes.setdefault(pidkey, []).append(
            (value["firstSeq"], value["lastSeq"]))
        found[ref] = value
    require(session["observerProcessIdentity"] in found and
            session["pythonIdentity"] in found)
    for ref, process in found.items():
        parent = process["parentProcessIdentity"]
        require(parent is None or
                (parent in found and parent != ref), "CHILD_UNTRACED")
        chain = {ref}
        while parent is not None:
            require(parent not in chain, "CHILD_UNTRACED")
            chain.add(parent)
            parent = found[parent]["parentProcessIdentity"]
    return found


def _events(records: Any, envelope: dict, artifacts: dict,
            processes: dict, files: dict) -> set[str]:
    require(type(records) is list and 1 <= len(records) <= MAX_EVENTS,
            "EVENT_BUDGET_EXCEEDED")
    seen = set()
    covered = set()
    forks = set()
    lifecycle = {}
    process_seq = {}
    last_clock = -1
    touched = {ref: [] for ref in files}
    for index, event in enumerate(records, 1):
        obj(event, "event")
        require(event["sequence"] == index and type(event["sequence"]) is int,
                "EVENT_ORDER_INVALID")
        require(len(canonical(event)) <= MAX_EVENT, "EVENT_BUDGET_EXCEEDED")
        require(uint(event["timeMonotonic"]) and
                event["timeMonotonic"] >= last_clock, "EVENT_ORDER_INVALID")
        last_clock = event["timeMonotonic"]
        require(event["captureId"] == envelope["captureId"] and
                event["processIdentity"] in processes,
                "PROCESS_IDENTITY_AMBIGUOUS")
        process = processes[event["processIdentity"]]
        require(event["parentProcessIdentity"] == process["parentProcessIdentity"],
                "CHILD_UNTRACED")
        require(process["firstSeq"] <= index <= process["lastSeq"],
                "EVENT_ORDER_INVALID")
        require(event["eventType"] in EVENT_TYPES and
                event["result"] in ("SUCCESS", "FAILURE", "UNKNOWN") and
                cov(event["coverageIds"]) and
                type(event["uncertainty"]) is list and
                ids(event["uncertainty"], max_count=32))
        obj(event["object"], "object")
        item = event["object"]
        require(item["kind"] in ("OBSERVATION", "PROCESS", "FILE",
                                 "FD", "MAPPING", "MODULE", "NATIVE", "CODE")
                and (item["identity"] is None or ident(item["identity"]))
                and (item["fileBindingRef"] is None or
                     item["fileBindingRef"] in files))
        if event["eventType"] in ("PROCESS_EXEC", "FILE_READ", "FILE_MMAP",
                                   "PYTHON_IMPORT", "PYTHON_CODE", "ELF_LOADER",
                                   "NATIVE_LOAD", "NATIVE_UNLOAD"):
            require(item["fileBindingRef"] in files,
                    "BYTE_CONSUMPTION_UNPROVEN")
            binding = files[item["fileBindingRef"]]
            require(binding["firstEvent"] <= index <= binding["lastEvent"],
                    "FILE_BINDING_AMBIGUOUS")
            touched[item["fileBindingRef"]].append(index)
        # Interpret only modeled loader classes. Unsupported/ambiguous origins
        # remain gaps, never inferred from a Python module name alone.
        if event["eventType"] in ("PYTHON_IMPORT", "PYTHON_CODE"):
            require(ident(item["identity"]), "IMPORT_ORIGIN_UNKNOWN")
            origin = files[item["fileBindingRef"]]["observedPath"]
            native_or_source = (type(origin) is str and
                                origin.endswith((".py", ".pyc", ".zip", ".so")))
            built_in = (type(item["identity"]) is str and
                        item["identity"].startswith(("builtin:", "frozen:")) and
                        item["fileBindingRef"] ==
                        processes[envelope["session"]["pythonIdentity"]]
                        ["binaryFileBinding"])
            require(item["kind"] == ("MODULE" if event["eventType"] ==
                                    "PYTHON_IMPORT" else "CODE")
                    and (native_or_source or built_in),
                    "IMPORT_ORIGIN_UNKNOWN")
        if event["eventType"] in ("ELF_LOADER", "NATIVE_LOAD", "NATIVE_UNLOAD"):
            require(ident(item["identity"]), "NATIVE_LOAD_UNMAPPED")
            origin = files[item["fileBindingRef"]]["observedPath"]
            require(item["kind"] == "NATIVE" and type(origin) is str
                    and re.search(r"\.so(?:\.[0-9]+)*\Z", origin) is not None,
                    "NATIVE_LOAD_UNMAPPED")
        if event["eventType"] in ("PROCESS_FORK", "PROCESS_CLONE"):
            require(item["identity"] in processes and
                    processes[item["identity"]]["parentProcessIdentity"]
                    == event["processIdentity"], "CHILD_UNTRACED")
            forks.add(item["identity"])
        rawref = obj(event["rawReference"], "reference")
        aid = rawref["artifactId"]
        require(aid in artifacts and
                uint(rawref["startByte"]) and uint(rawref["endByte"], positive=True)
                and rawref["startByte"] < rawref["endByte"]
                <= artifacts[aid]["byteCount"], "RAW_REFERENCE_MISSING")
        if event["eventType"] == "EVENT_LOSS":
            raise ConsumptionReviewBlocked("EVENT_LOST")
        if event["result"] == "UNKNOWN" or event["uncertainty"]:
            raise ConsumptionReviewBlocked("EXECUTION_INTERRUPTED_OR_UNKNOWN")
        seen.add(event["eventType"])
        covered.update(event["coverageIds"])
        lifecycle.setdefault(event["processIdentity"], set()).add(event["eventType"])
        process_seq.setdefault(event["processIdentity"], []).append(
            (index, event["eventType"]))
    require(covered == set(envelope["scope"]["coverageIds"]),
            "SCENARIO_COVERAGE_GAP")
    require(records[0]["eventType"] == "OBSERVATION_START"
            and records[-1]["eventType"] == "OBSERVATION_END",
            "START_NOT_WITNESSED")
    observer = envelope["session"]["observerProcessIdentity"]
    require(records[0]["processIdentity"] == observer
            and records[-1]["processIdentity"] == observer, "START_NOT_WITNESSED")
    require(all(p["lastSeq"] <= len(records) for p in processes.values()),
            "EVENT_ORDER_INVALID")
    for ref, binding in files.items():
        require(touched[ref], "FILE_BINDING_AMBIGUOUS")
        require(min(touched[ref]) == binding["firstEvent"]
                and max(touched[ref]) == binding["lastEvent"],
                "FILE_BINDING_AMBIGUOUS")
    for ref, p in processes.items():
        observed = process_seq.get(ref, [])
        require(observed and observed[0][0] == p["firstSeq"]
                and observed[-1][0] == p["lastSeq"],
                "EVENT_ORDER_INVALID")
        if ref == observer:
            continue
        require({"PROCESS_EXEC", "PROCESS_EXIT"} <= lifecycle.get(ref, set()),
                "END_NOT_WITNESSED")
        require(sum(t == "PROCESS_EXEC" for _, t in observed) == 1
                and sum(t == "PROCESS_EXIT" for _, t in observed) == 1
                and observed[0][1] == "PROCESS_EXEC"
                and observed[-1][1] == "PROCESS_EXIT",
                "EVENT_ORDER_INVALID")
        if p["parentProcessIdentity"] is not None:
            require(ref in forks, "CHILD_UNTRACED")
        require(p["exitState"] == "EXITED",
                "EXECUTION_INTERRUPTED_OR_UNKNOWN")
    return seen


def _validate(e: dict, raw_artifacts: Any, separate: Any) -> None:
    require(ident(e["captureId"]) and ident(e["scenarioId"]))
    candidate = obj(e["candidate"], "candidate")
    require(type(candidate["sourceCommit"]) is str
            and COMMIT.fullmatch(candidate["sourceCommit"]) is not None)
    for name in ("launchMaterialsSha256", "requestSha256",
                 "effectAdapterSetSha256"):
        require(sha(candidate[name]))
    require(text(candidate["entryPoint"]) and text(candidate["bootstrapSource"]))
    scope = obj(e["scope"], "scope")
    require(ident(scope["observerPlanId"]) and cov(scope["coverageIds"]))
    for name in ("observerPlanSha256", "sourceSetSha256",
                 "permittedProcessPlanSha256", "budgetSha256"):
        require(sha(scope[name]))
    session = obj(e["session"], "session")
    for name in ("guestIdentity", "guestBootId", "mountNamespace",
                 "pidNamespace", "clockDomain"):
        require(ident(session[name]))
    require(uint(session["rootMountId"], positive=True))
    for name in ("observedStartUtc", "observedEndUtc"):
        require(text(session[name]))
    require(ident(session["observerProcessIdentity"])
            and ident(session["pythonIdentity"])
            and ident(session["loaderIdentity"]))
    completeness = obj(e["completeness"], "completeness")
    require(cov(completeness["coveredIds"])
            and set(completeness["coveredIds"]) == set(scope["coverageIds"]),
            "SCENARIO_COVERAGE_GAP")
    for name in ("startWitnessed", "endWitnessed", "childrenCovered",
                 "truncationDetected", "observerInterrupted", "budgetExceeded"):
        require(type(completeness[name]) is bool)
    require(uint(completeness["lostEventCount"])
            and ids(completeness["gaps"], max_count=64))
    require(completeness["startWitnessed"], "START_NOT_WITNESSED")
    require(completeness["endWitnessed"], "END_NOT_WITNESSED")
    require(completeness["childrenCovered"], "CHILD_UNTRACED")
    require(completeness["lostEventCount"] == 0, "EVENT_LOST")
    require(not completeness["truncationDetected"]
            and not completeness["budgetExceeded"], "EVENT_BUDGET_EXCEEDED")
    require(not completeness["observerInterrupted"],
            "EXECUTION_INTERRUPTED_OR_UNKNOWN")
    require(not completeness["gaps"], "SCENARIO_COVERAGE_GAP")
    prov = obj(e["provenance"], "provenance")
    require(sha(prov["separatelyPinnedSourceArtifactSha256"])
            and sha(prov["independentReviewerReceiptSha256"])
            and text(prov["reviewMethod"]))
    require(ids(prov["unverifiedFileBindingIds"], max_count=MAX_FILES)
            and ids(prov["sourceGaps"], max_count=MAX_FILES))
    require(not prov["sourceGaps"] and not prov["unverifiedFileBindingIds"],
            "SOURCE_UNAUTHENTICATED")
    assess = obj(e["assessment"], "assessment")
    require(assess["reviewStatus"] in ("CANDIDATE_REVIEWED", "REJECTED")
            and assess["decision"] == "BLOCKED"
            and assess["actualConsumptionAuthenticated"] is False
            and assess["readyToInstall"] is False
            and assess["authorizedToMutateProduction"] is False
            and ids(assess["reasonCodes"], max_count=len(REASONS))
            and set(assess["reasonCodes"]) <= REASONS)
    if assess["reviewStatus"] == "REJECTED":
        require(bool(assess["reasonCodes"]))
        raise ConsumptionReviewBlocked(assess["reasonCodes"][0])
    require(not assess["reasonCodes"], "SCHEMA_INVALID")
    require(type(separate) is dict and
            set(separate) == {"captureId", "scenarioId", "candidate", "scope",
                              "session", "rawArtifactSha256",
                              "sourceArtifactSha256"})
    require(separate["captureId"] == e["captureId"]
            and separate["scenarioId"] == e["scenarioId"], "CANDIDATE_CHANGED")
    require(separate["candidate"] == candidate and
            separate["scope"] == scope and separate["session"] == session,
            "CANDIDATE_CHANGED")
    require(separate["sourceArtifactSha256"] ==
            prov["separatelyPinnedSourceArtifactSha256"],
            "SOURCE_UNAUTHENTICATED")
    artifacts = _raw_artifacts(e["rawArtifacts"], raw_artifacts,
                               separate["rawArtifactSha256"])
    files = _files(e["fileBindings"], session, artifacts)
    processes = _processes(e["processes"], session, files)
    require(session["loaderIdentity"] in files, "NATIVE_LOAD_UNMAPPED")
    _events(e["events"], e, artifacts, processes, files)
    if any(f["classification"] == "GAP" for f in files.values()):
        raise ConsumptionReviewBlocked("FILE_BINDING_AMBIGUOUS")
    if any(f["classification"] == "DISCOVERED_ONLY" for f in files.values()):
        raise ConsumptionReviewBlocked("SOURCE_UNAUTHENTICATED")
    if any(not f["mutabilityGuardEvidence"] for f in files.values()):
        raise ConsumptionReviewBlocked("FILE_MUTABILITY_UNCONTROLLED")


def review_consumption_evidence(raw_envelope: bytes, *,
                                raw_artifacts: Any,
                                expected_envelope_sha256: Any,
                                separately_supplied: Any) -> dict:
    """Structural comparison, NEVER independent trust or C1 approval."""
    try:
        require(sha(expected_envelope_sha256))
        require(type(raw_envelope) is bytes and
                0 < len(raw_envelope) <= MAX_ENVELOPE,
                "EVENT_BUDGET_EXCEEDED")
        require(hashlib.sha256(raw_envelope).hexdigest() ==
                expected_envelope_sha256, "ARTIFACT_MISSING_OR_MISMATCHED")
        envelope = decode_envelope(raw_envelope)
        _validate(envelope, raw_artifacts, separately_supplied)
        status, reasons = "CANDIDATE_REVIEWED", []
    except ConsumptionReviewBlocked as exc:
        status, reasons = "REJECTED", [exc.reason]
    except (TypeError, ValueError, KeyError, OverflowError, RecursionError):
        # Malformed nested types must never escape as reviewer exceptions.
        status, reasons = "REJECTED", ["SCHEMA_INVALID"]
    return {
        "schema": REVIEW_SCHEMA,
        "reviewStatus": status,
        "reasonCodes": reasons,
        "decision": "BLOCKED",
        "actualConsumptionAuthenticated": False,
        "sourceProvenanceAuthenticated": False,
        "eventCoverageIndependentlyVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }
