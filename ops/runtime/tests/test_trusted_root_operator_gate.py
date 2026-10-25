"""B02-B fixed-identity one-shot root operator design tests; no root execution."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from trusted_root_operator_gate import (  # noqa: E402
    GATES, OperatorGateBlocked, review_proposed_one_shot_gate,
)


def proposal(operation="upgrade"):
    return {
        "kind": "c5-g2-b02b-one-shot-claim-v1",
        "schemaVersion": 1,
        "operation": operation,
        "runtimeRoot": "/opt/sanq/runtime",
        "composeProject": "sanq-app",
        "databaseVolume": "sanq-app_pgdata",
        "uploadsBind": "/srv/sanq/uploads",
        "oldRuntimeSha": "a" * 40,
        "targetRuntimeSha": "b" * 40,
        "oldArchiveDigest": "sha256:" + "c" * 64,
        "targetArchiveDigest": "sha256:" + "d" * 64,
        "currentAppSha": "e" * 40,
        "previousAppSha": "f" * 40,
        "gateClaims": {field: True for field in GATES},
    }


class OneShotGateTests(unittest.TestCase):
    def test_even_perfect_self_claims_never_grant_authority(self):
        for op in ("upgrade", "fresh-clean-reinstall"):
            with self.subTest(op=op):
                receipt = review_proposed_one_shot_gate(proposal(op))
                self.assertEqual(receipt["decision"], "BLOCKED")
                self.assertEqual(receipt["unmetClaimedGates"], [])
                for key in ("claimsIndependentlyAuthenticated", "runtimeMutationAttempted",
                            "operatorExecutionAttempted", "readyToInstall",
                            "authorizedToMutateProduction"):
                    self.assertIs(receipt[key], False)

    def test_unmet_gate_is_visible_not_granted(self):
        for gate in GATES:
            item = proposal()
            item["gateClaims"][gate] = False
            with self.subTest(gate=gate):
                receipt = review_proposed_one_shot_gate(item)
                self.assertEqual(receipt["unmetClaimedGates"], [gate])
                self.assertEqual(receipt["decision"], "BLOCKED")

    def test_missing_unknown_and_malformed_gates_block(self):
        for change in ("missing", "extra", "bool-not-true", "fake-dict"):
            item = proposal()
            if change == "missing":
                item["gateClaims"].pop(GATES[0])
            elif change == "extra":
                item["gateClaims"]["allowRoot"] = True
            elif change == "bool-not-true":
                item["gateClaims"][GATES[0]] = "true"
                # Incorrect typed claims must not be mistaken for satisfaction.
                self.assertIn(GATES[0], review_proposed_one_shot_gate(item)["unmetClaimedGates"])
                continue
            else:
                item["gateClaims"] = True
            with self.subTest(change=change):
                with self.assertRaises(OperatorGateBlocked):
                    review_proposed_one_shot_gate(item)

    def test_unknown_operation_path_storage_or_version_blocks(self):
        for field, value in (
            ("operation", "rollback"), ("runtimeRoot", "/tmp/runtime"),
            ("composeProject", "other"), ("databaseVolume", "wrong"),
            ("uploadsBind", "/tmp/uploads"), ("oldArchiveDigest", "bad"),
            ("currentAppSha", "bad"), ("schemaVersion", True),
        ):
            item = proposal()
            item[field] = value
            with self.subTest(field=field):
                with self.assertRaises(OperatorGateBlocked):
                    review_proposed_one_shot_gate(item)
        item = proposal()
        item["targetRuntimeSha"] = item["oldRuntimeSha"]
        with self.assertRaises(OperatorGateBlocked):
            review_proposed_one_shot_gate(item)
        # Only distinct future clean-reinstall entry may reuse source SHA.
        item["operation"] = "fresh-clean-reinstall"
        self.assertFalse(review_proposed_one_shot_gate(item)["readyToInstall"])

    def test_no_production_execution_surface_or_bundle_expansion(self):
        import trusted_root_operator_gate as mod
        for name in ("main", "install", "execute", "sudo", "deploy", "run"):
            self.assertFalse(hasattr(mod, name))
        for imported in ("os", "subprocess", "ctypes", "shutil"):
            self.assertNotIn(imported, mod.__dict__)
        self.assertNotIn("ops/runtime/trusted_root_operator_gate.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
