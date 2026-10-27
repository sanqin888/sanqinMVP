"""Current migration collection through fixed saved-container commands; models only."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_migration_source as source
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationMigrationSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.base = source.InstallationMigrationSourceTests()
        self.base.setUp()
        self.api, self.db = "a" * 64, "b" * 64
        self.pair = {"sanq-api": {"ref": "model", "digest": "sha256:" + "c" * 64}}
        self.docker = {"containers": {"api": {"containerId": self.api}, "db": {"containerId": self.db}},
                       "currentImageSeal": {"images": self.pair}}
        self.database = {"database": "sanqin_db", "history": self.base.history}
        self.prerequisites = {"databaseIdentity": {"database": "sanqin_db"}, "databaseContainerId": self.db,
                              "migrationHistorySha256": installer._hash(installer._json(self.base.history))}
        self.proof = {"sourceSha": self.base.sha, "images": self.pair, "ciRunId": 1}
        self.calls = []

    def run_read(self, args):
        self.assertTrue(installer._runtime_observation_allowed(args))
        self.calls.append(args)
        if args == installer._installation_inventory_args(self.api):
            return json.dumps(self.base.inventory)
        self.assertEqual(args, installer._installation_history_args(self.db))
        return json.dumps(self.database)

    def observe(self):
        with patch.object(installer.release, "verify_exact_candidate", return_value=copy.deepcopy(self.proof)):
            return installer._installation_migration_snapshot(self.base.sha, self.docker, self.prerequisites,
                                                              self.run_read, fetch=self.base.fetch)

    def test_two_pass_binding_keeps_ids_and_has_no_execution_permission(self):
        result = self.observe()
        self.assertTrue(result["databaseMigrationParityProven"])
        self.assertFalse(result["canExecute"])
        self.assertTrue(result["requiresHostRecheck"])
        self.assertEqual(result["apiContainerId"], self.api)
        self.assertEqual(result["databaseContainerId"], self.db)
        self.assertEqual(len(self.calls), 4)
        self.assertNotIn("SELECT", str(result))

    def test_exact_inventory_command_clears_node_environment_and_has_no_shell_or_prisma(self):
        args = installer._installation_inventory_args(self.api)
        self.assertEqual(args[4], self.api)
        self.assertEqual(args[5:10], ["/usr/bin/env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin",
                                    "/usr/local/bin/node", "--eval"])
        self.assertFalse(installer._docker_allowed(args))
        for bad in (args[:-1] + ["process.exit(0)"], args[:4] + ["api"] + args[5:]):
            self.assertFalse(installer._runtime_observation_allowed(bad))

    def test_changed_database_identity_history_or_saved_id_blocks(self):
        for changes in ({"database": "other"}, {"history": []}):
            with patch.dict(self.database, changes), self.assertRaises(ReleaseContractError):
                self.observe()
        self.prerequisites["databaseContainerId"] = "d" * 64
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_current_publication_must_match_source_and_saved_image_pair(self):
        for changes in ({"sourceSha": "3" * 40}, {"images": {}}):
            with patch.dict(self.proof, changes), self.assertRaises(ReleaseContractError):
                self.observe()

    def test_late_database_history_change_is_not_accepted(self):
        read = self.run_read
        def racing(args):
            value = read(args)
            if len(self.calls) == 2:
                self.database["history"] = []
            return value
        with patch.object(self, "run_read", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_late_source_blob_change_blocks(self):
        read = self.run_read
        def racing(args):
            value = read(args)
            if len(self.calls) == 3:
                self.base.content["content"] = "AAAA"
            return value
        with patch.object(self, "run_read", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_source_proof_failure_never_becomes_success(self):
        with patch.object(installer.release, "verify_exact_candidate", side_effect=ReleaseContractError("proof unavailable")), \
             self.assertRaises(ReleaseContractError):
            installer._installation_migration_snapshot(self.base.sha, self.docker, self.prerequisites,
                                                      self.run_read, fetch=self.base.fetch)
        self.assertEqual(self.calls, [])

    def test_unknown_commands_and_invalid_saved_identifiers_are_rejected(self):
        with self.assertRaises(ReleaseContractError):
            installer._installation_inventory_args("api")
        for args in ([*installer.DOCKER, "exec", self.api, "node", "--eval", "anything"],
                     [*installer.DOCKER, "run", "image"]):
            self.assertFalse(installer._runtime_observation_allowed(args))


if __name__ == "__main__":
    unittest.main()
