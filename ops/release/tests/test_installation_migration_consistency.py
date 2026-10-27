"""Pure installation migration consistency; no host collection or SQL execution."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationMigrationConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.inventory = [{"name": name, "bytes": 10, "sha256": char * 64, "gitBlobSha": char * 40}
                          for name, char in (("001_first", "a"), ("002_second", "b"))]
        self.history = [{"name": item["name"], "sha256": item["sha256"], "state": "applied"}
                        for item in self.inventory]

    def check(self):
        return installer._installation_migration_consistency(self.inventory, self.history)

    def test_complete_inputs_return_only_digests_and_no_host_proof_or_permission(self):
        before = copy.deepcopy((self.inventory, self.history))
        result = self.check()
        self.assertTrue(result["inputConsistencyObserved"])
        self.assertFalse(result["databaseMigrationParityProven"])
        self.assertFalse(result["canExecute"])
        self.assertTrue(result["requiresHostRecheck"])
        self.assertNotIn("001_first", str(result))
        self.assertEqual(before, (self.inventory, self.history))

    def test_pending_migration_is_rejected_even_with_a_valid_applied_prefix(self):
        self.history.pop()
        with self.assertRaises(ReleaseContractError):
            self.check()

    def test_missing_modified_or_duplicate_applied_migration_is_rejected(self):
        original = copy.deepcopy(self.history)
        for row in ({"name": "003_unknown", "sha256": "c" * 64, "state": "applied"},
                    {"name": "001_first", "sha256": "c" * 64, "state": "applied"}, original[0]):
            self.history = original + [row]
            with self.assertRaises(ReleaseContractError):
                self.check()

    def test_rolled_back_attempts_are_retained_without_counting_as_applied(self):
        row = {"name": "003_historical", "sha256": "c" * 64, "state": "rolled-back"}
        before = self.check()
        self.history.extend([row, dict(row)])
        result = self.check()
        self.assertEqual(result["rolledBackRows"], 2)
        self.assertEqual(result["migrationCount"], 2)
        self.assertNotEqual(result["historySha256"], before["historySha256"])
        self.history[0]["state"] = "rolled-back"
        with self.assertRaises(ReleaseContractError):
            self.check()

    def test_failed_unknown_or_malformed_history_is_rejected(self):
        for row in ({"name": "001_first", "sha256": "a" * 64, "state": "failed"},
                    {"name": "../bad", "sha256": "a" * 64, "state": "rolled-back"},
                    {"name": "001_first", "sha256": "BAD", "state": "applied"},
                    {"name": "001_first", "sha256": "a" * 64, "state": "applied", "extra": True}):
            self.history = [row]
            with self.assertRaises(ReleaseContractError):
                self.check()

    def test_inventory_must_be_unique_sorted_and_have_strict_fields(self):
        original = copy.deepcopy(self.inventory)
        for value in (list(reversed(original)), original + [original[0]], [dict(original[0], extra=True)]):
            self.inventory = value
            with self.assertRaises(ReleaseContractError):
                self.check()

    def test_inventory_name_hash_blob_and_integer_size_validation(self):
        original = copy.deepcopy(self.inventory[0])
        for changes in ({"name": "../bad"}, {"sha256": "A" * 64}, {"gitBlobSha": "short"},
                        {"bytes": True}, {"bytes": 0}, {"bytes": 2097153}):
            self.inventory[0] = {**original, **changes}
            with self.assertRaises(ReleaseContractError):
                self.check()

    def test_empty_and_oversized_collections_are_rejected(self):
        original = self.inventory
        for value in ([], None, original * 5001):
            self.inventory = value
            with self.assertRaises(ReleaseContractError):
                self.check()
        self.inventory = original
        for value in ([], None, self.history * 10001):
            self.history = value
            with self.assertRaises(ReleaseContractError):
                self.check()

    def test_total_sql_budget_is_enforced_before_history_comparison(self):
        self.inventory = [{"name": str(i).zfill(3), "bytes": 2097152,
                           "sha256": "a" * 64, "gitBlobSha": "b" * 40} for i in range(33)]
        with self.assertRaisesRegex(ReleaseContractError, "byte budget"):
            self.check()

    def test_history_order_is_preserved_in_the_digest_without_inventing_application_order(self):
        before = self.check()
        self.history.reverse()
        after = self.check()
        self.assertEqual(before["migrationCount"], after["migrationCount"])
        self.assertNotEqual(before["historySha256"], after["historySha256"])


if __name__ == "__main__":
    unittest.main()
