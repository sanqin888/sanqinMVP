"""C5-B2B2: pure versioned-install state planner, no production mutation."""

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("sanq_inert_install", ROOT / "plan_versioned_install.py")
assert SPEC is not None and SPEC.loader is not None
planner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(planner)

OLD = "a" * 40
NEW = "b" * 40
PREVIOUS = "c" * 40
FROM_DIGEST = "sha256:" + "1" * 64
TO_DIGEST = "sha256:" + "2" * 64


def transition(action="deploy"):
    return {
        "schemaVersion": 1, "action": action, "from": OLD, "to": NEW,
        "fromArchiveSha256": FROM_DIGEST, "toArchiveSha256": TO_DIGEST,
        "requiresExactVersionedRuntimePair": True,
        "requiresBackupAndRestoreGate": True,
        "requiresNoWriteCutoverAndReversibleRuntimeInstall": True,
        "preservedComposeProject": "sanq-app",
        "preservedDatabaseVolume": "sanq-app_pgdata",
        "readyToInstall": False, "readyToDeploy": False, "readyToRollback": False,
        "authorizedToMutateProduction": False,
    }


def journal(*, previous=PREVIOUS, phase="active"):
    return {
        "schemaVersion": 1, "phase": phase, "current": OLD,
        "previous": previous,
        "currentRuntime": {
            "sourceSha": OLD, "runtimeArchiveDigest": FROM_DIGEST,
        },
        "availableRuntime": {
            "sourceSha": NEW, "runtimeArchiveDigest": TO_DIGEST,
        },
    }


class VersionedInstallPlanTests(unittest.TestCase):
    def test_valid_forward_plan_is_not_executable(self):
        result = planner.plan_install(transition(), journal())
        self.assertEqual(result["proposedVersionRoot"], "/opt/sanq/releases/" + NEW)
        self.assertEqual(result["transaction"]["phase"], "pending")
        self.assertTrue(result["transaction"]["manualRecoveryRequired"])
        self.assertEqual(result["transaction"]["preservedDatabaseVolume"], "sanq-app_pgdata")
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["readyToDeploy"])
        self.assertFalse(result["readyToRollback"])
        self.assertFalse(result["authorizedToMutateProduction"])
        self.assertNotIn("subprocess", planner.__dict__)

    def test_recorded_previous_sha_is_only_rollback_target(self):
        with self.assertRaisesRegex(planner.InstallPlanBlocked, "previous version"):
            planner.plan_install(transition("rollback"), journal())
        result = planner.plan_install(transition("rollback"), journal(previous=NEW))
        self.assertEqual(result["transaction"]["target"], NEW)
        self.assertFalse(result["authorizedToMutateProduction"])

    def test_pending_and_failed_journals_fail_closed(self):
        for phase in ("pending", "failed"):
            with self.assertRaisesRegex(planner.InstallPlanBlocked, "manual recovery"):
                planner.plan_install(transition(), journal(phase=phase))

    def test_drift_or_forged_mutation_authority_fails(self):
        for changes in (
            {"preservedDatabaseVolume": "new_empty_volume"},
            {"preservedComposeProject": "different"},
            {"readyToDeploy": True},
            {"authorizedToMutateProduction": True},
            {"requiresBackupAndRestoreGate": False},
            {"fromArchiveSha256": "sha256:" + "0" * 64},
        ):
            attempt = {**transition(), **changes}
            with self.assertRaises((planner.InstallPlanBlocked, ValueError)):
                planner.plan_install(attempt, journal())

    def test_current_journal_drift_and_invalid_available_digest_fail(self):
        stale = journal()
        stale["current"] = PREVIOUS
        with self.assertRaisesRegex(planner.InstallPlanBlocked, "current version"):
            planner.plan_install(transition(), stale)
        invalid = journal()
        invalid["availableRuntime"] = {
            "sourceSha": NEW, "runtimeArchiveDigest": "invalid"
        }
        with self.assertRaisesRegex(planner.InstallPlanBlocked, "digest mismatch"):
            planner.plan_install(transition(), invalid)

    def test_immutable_plan_does_not_modify_inputs(self):
        original_transition = transition()
        original_journal = journal()
        t = dict(original_transition)
        j = dict(original_journal)
        planner.plan_install(t, j)
        self.assertEqual(t, original_transition)
        self.assertEqual(j, original_journal)


if __name__ == "__main__":
    unittest.main()
