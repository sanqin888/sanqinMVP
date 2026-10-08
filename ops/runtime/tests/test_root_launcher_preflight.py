"""C5-B3B2B stdlib-only pure candidate preflight regression tests."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_launcher_preflight import EXPECTED_PATHS, LauncherPreflightBlocked, preview_preflight
from test_versioned_persistence_contract import journal


def fixture():
    return {
        "schemaVersion": 1, "kind": "inert-root-launcher-preflight-v1",
        "paths": dict(EXPECTED_PATHS),
        "composeProject": "sanq-app", "databaseVolume": "sanq-app_pgdata",
        "backupRestoreVerified": True, "noWriteWindowVerified": True,
        "archivePairVerified": True, "imageDigestPairVerified": True,
        "physicalStateReconciled": True,
        "stableLauncherInstalled": False, "operatorAuthorized": False,
        "productionCutoverAuthorized": False,
    }


class RootLauncherPreflightTests(unittest.TestCase):
    def test_inert_preview_never_authorizes(self):
        result = preview_preflight(fixture(), journal("active"))
        self.assertFalse(result["authorizedToMutateProduction"])
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["readyToRollback"])
        self.assertTrue(result["requiresCrossTransactionLedger"])

    def test_corrupt_and_unresolved_transactions_are_blocked(self):
        for phase in ("pending", "failed"):
            with self.subTest(phase=phase), self.assertRaises(LauncherPreflightBlocked):
                preview_preflight(fixture(), journal(phase))
        broken = journal("active")
        broken.pop("targetVersion")
        with self.assertRaises(LauncherPreflightBlocked):
            preview_preflight(fixture(), broken)

    def test_rejects_all_external_path_and_authority_mismatch(self):
        for field, value in (
            ("schemaVersion", 2), ("composeProject", "other"),
            ("databaseVolume", "other_db"), ("stableLauncherInstalled", True),
            ("operatorAuthorized", True), ("productionCutoverAuthorized", True),
            ("backupRestoreVerified", False), ("archivePairVerified", False),
            ("imageDigestPairVerified", False), ("physicalStateReconciled", False),
            ("noWriteWindowVerified", False),
        ):
            value_dict = fixture()
            value_dict[field] = value
            with self.subTest(field=field), self.assertRaises(LauncherPreflightBlocked):
                preview_preflight(value_dict, journal("active"))
        for path in EXPECTED_PATHS:
            value_dict = fixture()
            value_dict["paths"][path] = "/tmp/unsafe"
            with self.subTest(path=path), self.assertRaises(LauncherPreflightBlocked):
                preview_preflight(value_dict, journal("active"))

    def test_unknown_fields_and_untrusted_claims_are_not_executable(self):
        p = fixture()
        p["arbitraryCommand"] = "sudo docker ps"
        with self.assertRaises(LauncherPreflightBlocked):
            preview_preflight(p, journal("active"))
        for flag in ("authorizedToMutateProduction", "readyToInstall"):
            self.assertFalse(preview_preflight(copy.deepcopy(fixture()), journal("active"))[flag])


if __name__ == "__main__":
    unittest.main()
