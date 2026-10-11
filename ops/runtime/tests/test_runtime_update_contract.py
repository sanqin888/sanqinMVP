"""Offline C5-U1 contract tests; no Docker, root, network or filesystem mutation."""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("runtime_update_contract", ROOT / "runtime_update_contract.py")
assert SPEC and SPEC.loader
contract = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(contract)

OLD = "a" * 40
NEW = "b" * 40


def manifest(sha, changed=False):
    files = {p: {"sha256": "1" * 64, "bytes": 10} for p in contract.MEMBERS}
    if changed:
        files["ops/release/deploy_release.py"] = {"sha256": "2" * 64, "bytes": 12}
    return {
        "schemaVersion": 1, "sourceBranch": "main", "sourceSha": sha,
        "productionActivationAuthorized": False, "files": files,
    }


def fixture():
    current = {"sourceSha": OLD, "archiveDigest": "sha256:" + "3" * 64,
               "manifest": manifest(OLD)}
    target = {"sourceSha": NEW, "archiveDigest": "sha256:" + "4" * 64,
              "manifest": manifest(NEW, changed=True)}
    operational = {
        "runtimeRoot": "/opt/sanq/runtime",
        "composeProject": "sanq-app",
        "databaseVolume": "sanq-app_pgdata",
        "releasePhase": "active",
        "pendingIncident": False,
        "exclusiveLockAvailable": True,
        "authorizedToMutateProduction": False,
    }
    return current, target, operational


class RuntimeUpdateContractTests(unittest.TestCase):
    def test_inert_update_identifies_exact_changed_member(self):
        plan = contract.propose_update(*fixture())
        self.assertEqual(plan["changedMembers"], ["ops/release/deploy_release.py"])
        self.assertEqual(len(contract.MEMBERS), 17)
        self.assertEqual(plan["preserveOutsideArchive"], list(contract.PRESERVED))
        for key in ("readyToInstall", "readyToDeploy", "readyToRollback",
                    "authorizedToMutateProduction"):
            self.assertIs(plan[key], False)
        self.assertNotIn("subprocess", contract.__dict__)

    def test_same_version_and_unchanged_runtime_rejected(self):
        cur, target, op = fixture()
        target["sourceSha"] = OLD
        target["manifest"]["sourceSha"] = OLD
        with self.assertRaisesRegex(contract.RuntimeUpdateBlocked, "same Runtime"):
            contract.propose_update(cur, target, op)
        cur, target, op = fixture()
        target["manifest"]["files"] = cur["manifest"]["files"].copy()
        with self.assertRaisesRegex(contract.RuntimeUpdateBlocked, "image-only"):
            contract.propose_update(cur, target, op)

    def test_missing_or_extra_member_and_bad_proof_rejected(self):
        for kind in ("missing", "extra", "invalid", "oversized"):
            with self.subTest(kind=kind):
                cur, target, op = fixture()
                files = target["manifest"]["files"]
                if kind == "missing":
                    files.pop("docker-compose.yml")
                elif kind == "extra":
                    files["rogue.py"] = {"sha256": "1" * 64, "bytes": 1}
                elif kind == "invalid":
                    files["docker-compose.yml"]["sha256"] = "bogus"
                else:
                    files["docker-compose.yml"]["bytes"] = 3 * 1024 * 1024
                with self.assertRaises(contract.RuntimeUpdateBlocked):
                    contract.propose_update(cur, target, op)

    def test_pending_wrong_volume_root_and_mutation_authority_rejected(self):
        changes = (
            {"releasePhase": "pending"}, {"pendingIncident": True},
            {"exclusiveLockAvailable": False},
            {"runtimeRoot": "/home/ubuntu/sanq-app"},
            {"databaseVolume": "wrong"}, {"composeProject": "wrong"},
            {"authorizedToMutateProduction": True},
        )
        for change in changes:
            with self.subTest(change=change):
                cur, target, op = fixture()
                with self.assertRaises(contract.RuntimeUpdateBlocked):
                    contract.propose_update(cur, target, {**op, **change})

    def test_digest_and_immutable_manifest_authority_rejected(self):
        cur, target, op = fixture()
        target["archiveDigest"] = "wrong"
        with self.assertRaises(contract.RuntimeUpdateBlocked):
            contract.propose_update(cur, target, op)
        cur, target, op = fixture()
        target["manifest"]["productionActivationAuthorized"] = True
        with self.assertRaises(contract.RuntimeUpdateBlocked):
            contract.propose_update(cur, target, op)

    def test_failed_handoff_has_manual_recovery_only(self):
        plan = contract.propose_update(*fixture())
        self.assertIn("manual", plan["failureRecovery"]["handoff_interrupted"])
        self.assertIn("no automatic", plan["failureRecovery"]["readiness_failure"])
        self.assertNotIn("execute", plan)
        

if __name__ == "__main__":
    unittest.main()
