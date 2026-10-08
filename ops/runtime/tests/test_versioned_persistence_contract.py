"""C5-B3A pure, offline persistence state and failure cases."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import versioned_persistence_contract as p

A, B, C = ("a" * 40, "b" * 40, "c" * 40)
T0, T1 = "2026-10-08T00:00:00Z", "2026-10-08T00:00:01Z"


def version(sha, char):
    return {
        "sourceSha": sha, "runtimeArchiveSha256": "sha256:" + char * 64,
        "images": {name: {
            "ref": f"ghcr.io/sanqin888/{name}:{sha}",
            "digest": "sha256:" + char * 64,
        } for name in ("sanq-api", "sanq-web")},
    }


def journal(phase="pending", action="deploy"):
    return {
        "schemaVersion": 1, "kind": p.JOURNAL_KIND,
        "phase": phase, "action": action, "transactionId": "d" * 32,
        "currentSha": A, "previousSha": C, "targetSha": B,
        "currentVersion": version(A, "1"),
        "previousVersion": version(C, "3"),
        "targetVersion": version(B, "2"),
        "createdAt": T0, "updatedAt": T0,
        "manualRecoveryRequired": phase in ("pending", "failed"),
        "authorizedToMutateProduction": False,
    }


class PersistenceTests(unittest.TestCase):
    def test_fixed_version_path_and_non_executable_layout(self):
        self.assertEqual(p.version_path(A), "/opt/sanq/releases/" + A)
        self.assertTrue(p.layout_contract()["activeRootMustBeRealDirectory"])
        self.assertFalse(p.layout_contract()["authorizedToMutateProduction"])
        with self.assertRaises(ValueError):
            p.version_path("../other")

    def test_strict_state_schema(self):
        self.assertEqual(p.validate_journal(journal())["phase"], "pending")
        for mutation in (
            lambda j: j.update(schemaVersion=2),
            lambda j: j.update(extra="unknown"),
            lambda j: j.update(transactionId="not-a-uuid"),
            lambda j: j.update(authorizedToMutateProduction=True),
            lambda j: j.update(updatedAt="2026-10-07T00:00:00Z"),
            lambda j: j.update(manualRecoveryRequired=False),
            lambda j: j.update(phase="unknown"),
            lambda j: j.update(currentSha="bad"),
            lambda j: j.update(targetSha=A),
            lambda j: j["targetVersion"].update(runtimeArchiveSha256="bad"),
            lambda j: j["targetVersion"]["images"]["sanq-api"].update(digest="bad"),
            lambda j: j["targetVersion"]["images"]["sanq-web"].update(ref="ghcr.io/evil/web"),
            lambda j: j["targetVersion"]["images"].pop("sanq-web"),
        ):
            value = copy.deepcopy(journal())
            mutation(value)
            with self.subTest(value=value), self.assertRaises(p.PersistenceBlocked):
                p.validate_journal(value)

    def test_rollback_requires_exact_recorded_version(self):
        invalid = journal(action="rollback")
        with self.assertRaisesRegex(p.PersistenceBlocked, "recorded"):
            p.validate_journal(invalid)
        valid = journal(action="rollback")
        valid["targetSha"] = C
        valid["targetVersion"] = version(C, "3")
        self.assertEqual(p.validate_journal(valid)["action"], "rollback")

    def test_failed_pending_and_unknown_cannot_be_deployed(self):
        for state in ("pending", "failed"):
            self.assertFalse(p.normal_deployment_allowed(journal(state)))
        for state in ("active", "rolled-back"):
            self.assertTrue(p.normal_deployment_allowed(journal(state)))
        broken = journal()
        broken.pop("targetVersion")
        with self.assertRaises(p.PersistenceBlocked):
            p.normal_deployment_allowed(broken)

    def test_fail_closed_transitions_and_interruptions(self):
        pending = journal()
        with self.assertRaisesRegex(p.PersistenceBlocked, "manual"):
            p.transition_journal(pending, "active", at=T1)
        with self.assertRaisesRegex(p.PersistenceBlocked, "illegal"):
            p.transition_journal(pending, "pending", at=T1)
        with self.assertRaisesRegex(p.PersistenceBlocked, "advance"):
            p.transition_journal(pending, "failed", at=T0)
        failed = p.transition_journal(pending, "failed", at=T1)
        self.assertFalse(p.normal_deployment_allowed(failed))
        with self.assertRaises(p.PersistenceBlocked):
            p.transition_journal(failed, "active", at="2026-10-08T00:00:02Z")
        recovered = p.transition_journal(failed, "rolled-back", at="2026-10-08T00:00:02Z", manually_reconciled=True)
        self.assertTrue(p.normal_deployment_allowed(recovered))
        self.assertEqual(pending["phase"], "pending")
        with self.assertRaises(p.PersistenceBlocked):
            p.transition_journal(recovered, "active", at="2026-10-08T00:00:03Z")

    def test_no_file_or_docker_execution_surface(self):
        self.assertFalse(hasattr(p, "subprocess"))
        self.assertFalse(hasattr(p, "os"))
        self.assertFalse(hasattr(p, "open"))


if __name__ == "__main__":
    unittest.main()
