"""C5-G2-B1 bounded untrusted maintenance observation tests.

Fixtures are synthetic. They never read /proc, call systemd, execute Docker,
acquire real host locks, access a VM, or authorize a root installation.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import preinstall_maintenance_contract as gate  # noqa: E402

APP = "a" * 40
OLD = "b" * 40
RUNTIME = "c" * 40


def claimed_idle_host():
    return {
        "schemaVersion": 1,
        "kind": "sanq-maintenance-observation-v1",
        "runtime": {
            "root": gate.RUNTIME_ROOT,
            "sourceSha": RUNTIME,
            "manifestSourceSha": RUNTIME,
            "filesVerified": True,
            "rootOwnerVerified": True,
            "pendingIncident": False,
        },
        "application": {
            "phase": "active", "current": APP, "previous": OLD,
            "envSha": APP, "stateSha": APP,
        },
        "containers": {
            "project": gate.PROJECT,
            "databaseVolume": gate.DB_VOLUME,
            "uploadsBind": gate.UPLOADS,
            "imageShas": {
                "api": APP, "ubereats-worker": APP, "web": APP,
            },
            "healthy": True,
            "databaseIdentityVerified": True,
            "uploadsIdentityVerified": True,
        },
        "maintenance": {
            "operatorLockClaimed": True,
            "backupTimerPaused": True,
            "backupServiceInactive": True,
            "mcpProductionPaused": True,
            "deployWritesBlocked": True,
            "composeWritesBlocked": True,
            "processCounts": {key: 0 for key in gate.IDLE_COUNTERS},
            "restoreOriginalTimerStateRecorded": True,
        },
    }


class PreinstallMaintenanceContractTests(unittest.TestCase):
    def test_all_claims_consistent_still_cannot_grant_installation(self):
        result = gate.review_maintenance_observation(claimed_idle_host())
        self.assertTrue(result["observationStructurallyConsistent"])
        for key in ("evidenceSourceAuthenticated", "crossProcessQuiescenceVerified",
                    "externalKitVerified", "productionReady", "readyToInstall",
                    "authorizedToMutateProduction"):
            self.assertIs(result[key], False)
        self.assertGreater(len(result["requiredIndependentGates"]), 4)

    def test_missing_and_extra_claims_do_not_create_a_permissive_default(self):
        original = claimed_idle_host()
        for edited in (
            {**original, "privilegedApproval": True},
            {k: v for k, v in original.items() if k != "maintenance"},
            {**original, "kind": "caller-authorized"},
            {**original, "schemaVersion": 2},
            {**original, "schemaVersion": True},
        ):
            with self.subTest(edited=edited):
                with self.assertRaises(gate.MaintenanceObservationBlocked):
                    gate.review_maintenance_observation(edited)

    def test_state_ownership_incident_and_image_mismatches_fail_closed(self):
        for outer, key, value in (
            ("runtime", "root", "/home/ubuntu/sanq-app"),
            ("runtime", "sourceSha", OLD),
            ("runtime", "filesVerified", False),
            ("runtime", "rootOwnerVerified", "true"),
            ("runtime", "pendingIncident", True),
            ("application", "phase", "pending"),
            ("application", "current", OLD),
            ("application", "previous", ""),
            ("application", "envSha", OLD),
            ("application", "stateSha", OLD),
            ("containers", "project", "other"),
            ("containers", "databaseVolume", "other_pgdata"),
            ("containers", "uploadsBind", "./uploads"),
            ("containers", "healthy", False),
            ("containers", "databaseIdentityVerified", False),
            ("containers", "uploadsIdentityVerified", False),
        ):
            with self.subTest(outer=outer, key=key):
                obs = claimed_idle_host()
                obs[outer][key] = value
                with self.assertRaises(gate.MaintenanceObservationBlocked):
                    gate.review_maintenance_observation(obs)

    def test_each_running_image_must_equal_app_sha_not_runtime_sha(self):
        self.assertNotEqual(APP, RUNTIME)
        for service in gate.SERVICES:
            obs = claimed_idle_host()
            obs["containers"]["imageShas"][service] = RUNTIME
            with self.subTest(service=service):
                with self.assertRaisesRegex(gate.MaintenanceObservationBlocked,
                                            "running application image"):
                    gate.review_maintenance_observation(obs)

    def test_all_maintenance_barriers_are_required_not_merely_flock(self):
        for key in (
            "operatorLockClaimed", "backupTimerPaused", "backupServiceInactive",
            "mcpProductionPaused", "deployWritesBlocked", "composeWritesBlocked",
            "restoreOriginalTimerStateRecorded",
        ):
            for bad in (False, None, "true", 1):
                with self.subTest(key=key, bad=bad):
                    obs = claimed_idle_host()
                    obs["maintenance"][key] = bad
                    with self.assertRaises(gate.MaintenanceObservationBlocked):
                        gate.review_maintenance_observation(obs)

    def test_noncooperative_process_is_not_quiesced_by_advisory_lock(self):
        for key in gate.IDLE_COUNTERS:
            for bad in (1, -1, None, "0", True):
                with self.subTest(key=key, bad=bad):
                    obs = claimed_idle_host()
                    obs["maintenance"]["processCounts"][key] = bad
                    with self.assertRaisesRegex(
                            gate.MaintenanceObservationBlocked, "process"):
                        gate.review_maintenance_observation(obs)

    def test_future_operator_fields_cannot_be_smuggled_into_claim(self):
        obs = claimed_idle_host()
        obs["maintenance"]["authorizedToMutateProduction"] = True
        with self.assertRaisesRegex(gate.MaintenanceObservationBlocked,
                                    "extra keys"):
            gate.review_maintenance_observation(obs)

    def test_does_not_add_runtime_bundle_member_or_invocation_authority(self):
        import build_bundle
        self.assertEqual(len(build_bundle.SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/preinstall_maintenance_contract.py",
                         build_bundle.SOURCE_FILES)
        for name in ("install", "execute", "deploy", "rollback"):
            self.assertFalse(hasattr(gate, name))
        self.assertNotIn("subprocess", gate.__dict__)
        self.assertNotIn("os", gate.__dict__)


if __name__ == "__main__":
    unittest.main()
