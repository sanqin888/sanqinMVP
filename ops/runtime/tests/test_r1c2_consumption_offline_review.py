"""R1C-2B synthetic-only fail-closed review tests; no Guest/OS IO."""
import copy
import hashlib
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import r1c2_consumption_offline_review as r
finally:
    sys.path.pop(0)

DIGEST = lambda raw: hashlib.sha256(raw).hexdigest()
OBSERVER = "pid:1:100:generation-1"
PYTHON = "pid:1:101:generation-1"


def synthetic():
    files_bytes = {"events": b"raw-event-archive",
                   "stdout": b"", "stderr": b"",
                   "exit": b"0", "observer-log": b"complete",
                   "argv": b"redacted",
                   "python-raw": b"python-executable",
                   "loader-raw": b"elf-loader",
                   "module-raw": b"python-module"}
    session = {
        "guestIdentity": "synthetic-guest", "guestBootId": "boot-A",
        "mountNamespace": "mnt:1", "pidNamespace": "pid:1",
        "rootMountId": 10, "observerProcessIdentity": OBSERVER,
        "pythonIdentity": PYTHON, "loaderIdentity": "loader",
        "observedStartUtc": "2026-10-20T00:00:00Z",
        "observedEndUtc": "2026-10-20T00:00:05Z",
        "clockDomain": "synthetic-ticks",
    }
    def binding(ref, aid, name, first, last, ino):
        raw = files_bytes[aid]
        return {
            "logicalPath": name, "observedPath": name,
            "mountNamespace": "mnt:1", "mountId": 10, "device": 1,
            "inode": ino, "fdIdentity": ref, "size": len(raw),
            "sha256": DIGEST(raw), "byteEvidenceSource": aid,
            "firstEvent": first, "lastEvent": last,
            "moduleOrNativeOrigins": [ref],
            "aliasChain": [name],
            "packageOrApprovedNonpackageSource": "unverified-source-claim",
            "mutabilityGuardEvidence": "unverified-guard-claim",
            "classification": "MATCHED_UNAUTHENTICATED",
        }
    def process(ref, first, last):
        return {
            "processIdentity": ref, "parentProcessIdentity": None,
            "pid": 100 if ref == OBSERVER else 101,
            "tid": 100 if ref == OBSERVER else 101,
            "startDiscriminator": "generation-1",
            "pidNamespace": "pid:1", "mountNamespace": "mnt:1",
            "binaryFileBinding": "py", "firstSeq": first,
            "lastSeq": last, "exitState": "EXITED",
        }
    types = (
        ("OBSERVATION_START", OBSERVER, None),
        ("PROCESS_EXEC", PYTHON, "py"),
        ("ELF_LOADER", PYTHON, "loader"),
        ("FILE_READ", PYTHON, "py"),
        ("PYTHON_IMPORT", PYTHON, "module"),
        ("NATIVE_LOAD", PYTHON, "loader"),
        ("PROCESS_EXIT", PYTHON, None),
        ("OBSERVATION_END", OBSERVER, None),
    )
    events = [{
        "sequence": n, "timeMonotonic": n,
        "captureId": "synthetic-capture",
        "processIdentity": proc, "parentProcessIdentity": None,
        "eventType": typ, "result": "SUCCESS",
        "object": {
            "kind": ("OBSERVATION" if proc == OBSERVER else
                     "MODULE" if typ == "PYTHON_IMPORT" else
                     "NATIVE" if typ in ("ELF_LOADER", "NATIVE_LOAD") else "FILE"),
            "identity": ref, "fileBindingRef": ref,
        },
        "rawReference": {"artifactId": "events", "startByte": 0, "endByte": 1},
        "coverageIds": (["COV-01", "COV-02"] if n == 1 else
                        ["COV-03", "COV-04"] if n == 2 else
                        ["COV-05", "COV-06"] if n == 3 else
                        [f"COV-{n + 3:02d}"] if n <= 7 else ["COV-10"]),
        "uncertainty": [],
    } for n, (typ, proc, ref) in enumerate(types, 1)]
    candidate = {
        "sourceCommit": "a" * 40,
        "launchMaterialsSha256": "b" * 64,
        "requestSha256": "c" * 64,
        "effectAdapterSetSha256": "d" * 64,
        "entryPoint": "normal_runtime_update.NormalUpdateFlow.run",
        "bootstrapSource": "bootstrap.py",
    }
    scope = {
        "observerPlanId": "synthetic-plan", "observerPlanSha256": "1" * 64,
        "coverageIds": sorted(r.COVERAGE), "sourceSetSha256": "2" * 64,
        "permittedProcessPlanSha256": "3" * 64, "budgetSha256": "4" * 64,
    }
    envelope = {
        "schema": r.SCHEMA, "captureId": "synthetic-capture",
        "scenarioId": "synthetic-only",
        "candidate": candidate, "scope": scope, "session": session,
        "rawArtifacts": [
            {"artifactId": aid, "kind": aid.upper(), "sha256": DIGEST(raw),
             "byteCount": len(raw), "producer": "synthetic-untrusted",
             "custodyRef": "test-only", "collectionScope": "synthetic",
             "completeness": "COMPLETE"}
            for aid, raw in files_bytes.items()
        ],
        "processes": [process(OBSERVER, 1, 8),
                      process(PYTHON, 2, 7)],
        "events": events,
        "fileBindings": [
            binding("py", "python-raw", "/usr/bin/python3.12", 2, 4, 1000),
            binding("loader", "loader-raw", "/lib64/ld-linux.so", 3, 6, 1001),
            binding("module", "module-raw", "/root/core.py", 5, 5, 1002),
        ],
        "completeness": {
            "coveredIds": sorted(r.COVERAGE), "startWitnessed": True,
            "endWitnessed": True, "childrenCovered": True,
            "lostEventCount": 0, "truncationDetected": False,
            "observerInterrupted": False, "budgetExceeded": False,
            "gaps": [],
        },
        "provenance": {
            "separatelyPinnedSourceArtifactSha256": "5" * 64,
            "reviewMethod": "offline-only",
            "unverifiedFileBindingIds": [], "sourceGaps": [],
            "independentReviewerReceiptSha256": "6" * 64,
        },
        "assessment": {
            "reviewStatus": "CANDIDATE_REVIEWED", "reasonCodes": [],
            "decision": "BLOCKED", "actualConsumptionAuthenticated": False,
            "readyToInstall": False, "authorizedToMutateProduction": False,
        }
    }
    separate = {
        "captureId": "synthetic-capture", "scenarioId": "synthetic-only",
        "candidate": copy.deepcopy(candidate), "scope": copy.deepcopy(scope),
        "session": copy.deepcopy(session),
        "sourceArtifactSha256": "5" * 64,
        "rawArtifactSha256": {aid: DIGEST(raw) for aid, raw in files_bytes.items()},
    }
    return envelope, files_bytes, separate


def review(envelope=None, artifacts=None, baseline=None):
    if envelope is None:
        envelope, artifacts, baseline = synthetic()
    raw = r.canonical(envelope)
    return r.review_consumption_evidence(
        raw, raw_artifacts=artifacts,
        separately_supplied=baseline, expected_envelope_sha256=DIGEST(raw))


class OfflineReviewerTest(unittest.TestCase):
    def setUp(self):
        self.doc, self.artifacts, self.baseline = synthetic()

    def assert_rejected(self, reason, doc=None, artifacts=None, baseline=None):
        result = review(doc or self.doc, artifacts or self.artifacts,
                        baseline or self.baseline)
        self.assertEqual(result["reviewStatus"], "REJECTED")
        self.assertIn(reason, result["reasonCodes"])
        self.assertEqual(result["decision"], "BLOCKED")
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["actualConsumptionAuthenticated"])
        self.assertFalse(result["authorizedToMutateProduction"])

    def test_synthetic_candidate_is_never_authority(self):
        result = review(self.doc, self.artifacts, self.baseline)
        self.assertEqual(result["reviewStatus"], "CANDIDATE_REVIEWED")
        for name in ("actualConsumptionAuthenticated",
                     "sourceProvenanceAuthenticated",
                     "eventCoverageIndependentlyVerified",
                     "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(result[name], False)
        self.assertEqual(result["decision"], "BLOCKED")

    def test_noncanonical_duplicate_float_and_wrong_encoding(self):
        raw = r.canonical(self.doc)
        for broken in (b'{"schema":"x","schema":"y"}',
                       raw.replace(b'"schema"', b'"schema" :', 1),
                       b'{"schema": NaN}', b'{"x":1.0}',
                       b'\xff' + raw, raw + b' '):
            result = r.review_consumption_evidence(
                broken, raw_artifacts=self.artifacts,
                expected_envelope_sha256=DIGEST(broken),
                separately_supplied=self.baseline)
            self.assertEqual(result["reviewStatus"], "REJECTED")
            self.assertEqual(result["decision"], "BLOCKED")

    def test_version_unknown_key_forged_authority(self):
        variants = [
            ("schema", "other"),
            ("assessment", {**self.doc["assessment"], "readyToInstall": True}),
            ("assessment", {**self.doc["assessment"], "decision": "PASS"}),
            ("assessment", {**self.doc["assessment"],
                            "actualConsumptionAuthenticated": True}),
            ("assessment", {**self.doc["assessment"], "extra": "injected"}),
        ]
        for key, value in variants:
            with self.subTest(key=key, value=value):
                e = copy.deepcopy(self.doc)
                e[key] = value
                self.assert_rejected("SCHEMA_INVALID", e)

    def test_declared_rejected_receipt_is_never_promoted(self):
        e = copy.deepcopy(self.doc)
        e["assessment"]["reviewStatus"] = "REJECTED"
        e["assessment"]["reasonCodes"] = ["EVENT_LOST"]
        self.assert_rejected("EVENT_LOST", e)

    def test_coverage_and_process_event_range_invariants(self):
        e = copy.deepcopy(self.doc)
        e["events"][0]["coverageIds"] = ["COV-01"]
        self.assert_rejected("SCENARIO_COVERAGE_GAP", e)
        e = copy.deepcopy(self.doc)
        e["fileBindings"][1]["lastEvent"] = 3
        self.assert_rejected("FILE_BINDING_AMBIGUOUS", e)
        e = copy.deepcopy(self.doc)
        e["processes"][1]["lastSeq"] = 8
        self.assert_rejected("EVENT_ORDER_INVALID", e)
        e = copy.deepcopy(self.doc)
        e["events"][6]["eventType"] = "FILE_OPEN"
        self.assert_rejected("END_NOT_WITNESSED", e)

    def test_python_origin_classes_and_native_unknowns(self):
        for suffix in (".pyc", ".zip", ".so"):
            with self.subTest(suffix=suffix):
                e = copy.deepcopy(self.doc)
                e["fileBindings"][2]["observedPath"] = "/root/core" + suffix
                result = review(e, self.artifacts, self.baseline)
                self.assertEqual(result["reviewStatus"], "CANDIDATE_REVIEWED")
                self.assertEqual(result["decision"], "BLOCKED")
        e = copy.deepcopy(self.doc)
        e["fileBindings"][2]["observedPath"] = "/root/unknown-data"
        self.assert_rejected("IMPORT_ORIGIN_UNKNOWN", e)
        e = copy.deepcopy(self.doc)
        e["events"][4]["object"]["kind"] = "FILE"
        self.assert_rejected("IMPORT_ORIGIN_UNKNOWN", e)
        e = copy.deepcopy(self.doc)
        e["fileBindings"][1]["observedPath"] = "/root/unknown-native"
        self.assert_rejected("NATIVE_LOAD_UNMAPPED", e)
        e = copy.deepcopy(self.doc)
        e["fileBindings"][0]["mutabilityGuardEvidence"] = ""
        self.assert_rejected("FILE_MUTABILITY_UNCONTROLLED", e)

    def test_start_end_loss_budget_and_unknown(self):
        variants = [
            ("startWitnessed", False, "START_NOT_WITNESSED"),
            ("endWitnessed", False, "END_NOT_WITNESSED"),
            ("childrenCovered", False, "CHILD_UNTRACED"),
            ("lostEventCount", 1, "EVENT_LOST"),
            ("truncationDetected", True, "EVENT_BUDGET_EXCEEDED"),
            ("observerInterrupted", True, "EXECUTION_INTERRUPTED_OR_UNKNOWN"),
            ("budgetExceeded", True, "EVENT_BUDGET_EXCEEDED"),
            ("gaps", ["missing"], "SCENARIO_COVERAGE_GAP"),
        ]
        for key, value, reason in variants:
            with self.subTest(key=key):
                e = copy.deepcopy(self.doc)
                e["completeness"][key] = value
                self.assert_rejected(reason, e)

    def test_sequence_raw_reference_and_events(self):
        variants = [
            ("sequence", 4, "EVENT_ORDER_INVALID"),
            ("timeMonotonic", -1, "EVENT_ORDER_INVALID"),
            ("processIdentity", "untraced", "PROCESS_IDENTITY_AMBIGUOUS"),
            ("result", "UNKNOWN", "EXECUTION_INTERRUPTED_OR_UNKNOWN"),
            ("uncertainty", ["gap"], "EXECUTION_INTERRUPTED_OR_UNKNOWN"),
        ]
        for field, value, reason in variants:
            with self.subTest(field=field):
                e = copy.deepcopy(self.doc)
                e["events"][2][field] = value
                self.assert_rejected(reason, e)
        e = copy.deepcopy(self.doc)
        e["events"][2]["rawReference"]["endByte"] = 99999
        self.assert_rejected("RAW_REFERENCE_MISSING", e)
        e = copy.deepcopy(self.doc)
        e["events"][2]["eventType"] = "EVENT_LOSS"
        self.assert_rejected("EVENT_LOST", e)
        e = copy.deepcopy(self.doc)
        e["events"][0]["eventType"] = "FILE_OPEN"
        self.assert_rejected("START_NOT_WITNESSED", e)

    def test_pid_reuse_namespace_untraced_child_and_cycle(self):
        e = copy.deepcopy(self.doc)
        e["processes"][1]["pid"] = 100
        e["processes"][1]["startDiscriminator"] = "generation-1"
        self.assert_rejected("PROCESS_IDENTITY_AMBIGUOUS", e)
        e = copy.deepcopy(self.doc)
        e["processes"][1]["mountNamespace"] = "mnt:2"
        self.assert_rejected("UNSUPPORTED_PLATFORM_OR_NAMESPACE", e)
        e = copy.deepcopy(self.doc)
        e["processes"][1]["parentProcessIdentity"] = "unknown"
        self.assert_rejected("CHILD_UNTRACED", e)

    def test_file_identity_ambiguity_and_dependency_gaps(self):
        e = copy.deepcopy(self.doc)
        e["fileBindings"][1]["fdIdentity"] = "py"
        self.assert_rejected("FILE_BINDING_AMBIGUOUS", e)
        e = copy.deepcopy(self.doc)
        e["events"][4]["object"]["fileBindingRef"] = None
        self.assert_rejected("BYTE_CONSUMPTION_UNPROVEN", e)
        e = copy.deepcopy(self.doc)
        e["session"]["loaderIdentity"] = "missing"
        baseline = copy.deepcopy(self.baseline)
        baseline["session"] = copy.deepcopy(e["session"])
        self.assert_rejected("NATIVE_LOAD_UNMAPPED", e, baseline=baseline)
        e = copy.deepcopy(self.doc)
        e["fileBindings"][0]["classification"] = "DISCOVERED_ONLY"
        self.assert_rejected("SOURCE_UNAUTHENTICATED", e)

    def test_out_of_band_pins_and_artifact_tamper(self):
        e = copy.deepcopy(self.doc)
        e["scenarioId"] = "different-scene"
        self.assert_rejected("CANDIDATE_CHANGED", e)
        e = copy.deepcopy(self.doc)
        e["candidate"]["effectAdapterSetSha256"] = "f" * 64
        self.assert_rejected("CANDIDATE_CHANGED", e)
        e = copy.deepcopy(self.doc)
        e["provenance"]["separatelyPinnedSourceArtifactSha256"] = "f" * 64
        self.assert_rejected("SOURCE_UNAUTHENTICATED", e)
        mutated_artifacts = dict(self.artifacts)
        mutated_artifacts["events"] = b"wrong"
        self.assert_rejected("ARTIFACT_MISSING_OR_MISMATCHED",
                             artifacts=mutated_artifacts)
        e = copy.deepcopy(self.doc)
        e["rawArtifacts"][0]["sha256"] = "f" * 64
        self.assert_rejected("ARTIFACT_MISSING_OR_MISMATCHED", e)

    def test_strict_types_and_record_budget(self):
        e = copy.deepcopy(self.doc)
        e["completeness"]["lostEventCount"] = False
        self.assert_rejected("SCHEMA_INVALID", e)
        e = copy.deepcopy(self.doc)
        e["events"][0]["sequence"] = True
        self.assert_rejected("EVENT_ORDER_INVALID", e)
        e = copy.deepcopy(self.doc)
        e["events"].extend(copy.deepcopy(e["events"]) * 4096)
        self.assert_rejected("EVENT_BUDGET_EXCEEDED", e)
        e = copy.deepcopy(self.doc)
        e["fileBindings"][0]["logicalPath"] = "/a" * 130
        self.assert_rejected("FILE_BINDING_AMBIGUOUS", e)
        e = copy.deepcopy(self.doc)
        e["fileBindings"][0]["observedPath"] = "/root/../escaped"
        self.assert_rejected("FILE_BINDING_AMBIGUOUS", e)
        e = copy.deepcopy(self.doc)
        e["fileBindings"][0]["observedPath"] = None
        self.assert_rejected("FILE_BINDING_AMBIGUOUS", e)

    def test_no_launch_or_import_dependency_on_execution_modules(self):
        source = (ROOT / "r1c2_consumption_offline_review.py").read_text()
        for forbidden in ("subprocess", "os.system", "exec(", "eval(",
                          "root_python_dependency_guest_evidence",
                          "normal_runtime_update", "boto3", "socket"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
