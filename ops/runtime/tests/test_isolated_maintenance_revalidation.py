"""C5-G2-B2B2 synthetic dual-census fail-closed tests."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from isolated_maintenance_revalidation import (  # noqa: E402
    RevalidationBlocked, corroborate_isolated_exclusion,
)


def idle():
    return {
        "kind": "c5-g2b2a-proc-reference-census-v1",
        "runtimeRoot": "/opt/sanq/runtime",
        "processesObserved": 8,
        "runtimeReferencePids": [],
        "unknownPids": [],
        "pathReferenceCount": 0,
        "unresolvedProcessCount": 0,
        "pathOnlyCensus": True,
        "mountNamespaceAndAliasesVerified": False,
        "evidenceSourceAuthenticated": False,
        "crossProcessQuiescenceVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }


class IsolatedMaintenanceRevalidationTests(unittest.TestCase):
    def test_two_empty_samples_remain_non_authoritative(self):
        r = corroborate_isolated_exclusion(idle(), idle())
        self.assertEqual(r["observedProcessCounts"], [8, 8])
        for key in ("realHostObservationAuthenticated",
                    "mountNamespaceAndAliasesVerified",
                    "liveActorExclusionVerified",
                    "crossProcessQuiescenceVerified",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(r[key], False)

    def test_holder_or_unknown_in_either_sample_blocks(self):
        for index in (0, 1):
            for item, count in (("runtimeReferencePids", "pathReferenceCount"),
                                ("unknownPids", "unresolvedProcessCount")):
                with self.subTest(index=index, item=item):
                    samples = [idle(), idle()]
                    samples[index][item] = [123]
                    samples[index][count] = 1
                    with self.assertRaisesRegex(RevalidationBlocked,
                                                "holder or unknown"):
                        corroborate_isolated_exclusion(*samples)

    def test_forged_fields_and_bad_provenance_never_pass(self):
        original = idle()
        for key, value in (("kind", "other"),
                           ("runtimeRoot", "/tmp/runtime"),
                           ("pathOnlyCensus", False),
                           ("mountNamespaceAndAliasesVerified", True),
                           ("evidenceSourceAuthenticated", True),
                           ("crossProcessQuiescenceVerified", True),
                           ("readyToInstall", True),
                           ("authorizedToMutateProduction", True)):
            with self.subTest(key=key):
                modified = {**original, key: value}
                with self.assertRaises(RevalidationBlocked):
                    corroborate_isolated_exclusion(modified, idle())

    def test_no_extra_authority_or_missing_evidence(self):
        for modified in (
            {**idle(), "approved": True},
            {k: v for k, v in idle().items() if k != "unknownPids"},
            "trust me",
        ):
            with self.assertRaises(RevalidationBlocked):
                corroborate_isolated_exclusion(modified, idle())

    def test_counts_must_match_exact_pid_sets(self):
        for key, value in (("processesObserved", -1),
                           ("processesObserved", True),
                           ("processesObserved", 65537),
                           ("pathReferenceCount", True),
                           ("unresolvedProcessCount", "0")):
            with self.subTest(key=key):
                bad = {**idle(), key: value}
                with self.assertRaises(RevalidationBlocked):
                    corroborate_isolated_exclusion(bad, idle())

    def test_untrusted_pid_types_and_order_rejected(self):
        for bad in ([1, 1], [2, 1], [True], ["1"], [-1], [0],
                    [2**31], list(range(1, 65538))):
            record = idle()
            record["unknownPids"] = bad
            record["unresolvedProcessCount"] = len(bad)
            with self.subTest(size=len(bad)):
                with self.assertRaises(RevalidationBlocked):
                    corroborate_isolated_exclusion(record, idle())

    def test_component_has_no_host_execution_or_installer(self):
        import isolated_maintenance_revalidation as module
        for name in ("install", "execute", "start", "quiesce", "deploy", "main"):
            self.assertFalse(hasattr(module, name))
        self.assertNotIn("os", module.__dict__)
        self.assertNotIn("subprocess", module.__dict__)
        self.assertNotIn("ops/runtime/isolated_maintenance_revalidation.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
