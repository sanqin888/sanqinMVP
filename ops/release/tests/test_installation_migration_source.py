"""Exact Git migration objects; offline fetch models only."""
import base64
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationMigrationSourceTests(unittest.TestCase):
    def setUp(self):
        self.sha, self.tree = "1" * 40, "2" * 40
        self.raw = b"SELECT 1;\n"
        self.blob = installer._object(self.raw)
        self.inventory = [{"name": "001_first", "bytes": len(self.raw), "gitBlobSha": self.blob,
                           "sha256": installer._hash(self.raw)}]
        self.history = [{"name": "001_first", "sha256": installer._hash(self.raw), "state": "applied"}]
        self.row = {"path": "apps/api/prisma/migrations/001_first/migration.sql",
                    "type": "blob", "mode": "100644", "size": len(self.raw), "sha": self.blob}
        self.commit = {"sha": self.sha, "tree": {"sha": self.tree}}
        self.objects = {"sha": self.tree, "truncated": False, "tree": [self.row]}
        self.content = {"sha": self.blob, "size": len(self.raw), "encoding": "base64",
                        "content": base64.b64encode(self.raw).decode()}
        self.calls = []

    def fetch(self, path):
        self.calls.append(path)
        routes = {installer.PREFIX + "/git/commits/" + self.sha: self.commit,
                  installer.PREFIX + "/git/trees/" + self.tree + "?recursive=1": self.objects,
                  installer.PREFIX + "/git/blobs/" + self.blob: self.content}
        return copy.deepcopy(routes[path])

    def observe(self):
        return installer._installation_migration_source(self.sha, self.inventory, self.history, fetch=self.fetch)

    def test_exact_source_returns_summary_without_host_proof_or_sql_body(self):
        result = self.observe()
        self.assertTrue(result["gitMigrationObjectsMatched"])
        self.assertFalse(result["databaseMigrationParityProven"])
        self.assertFalse(result["applicationReleaseAuthenticated"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(result["sourceSha"], self.sha)
        self.assertNotIn("SELECT", str(result))
        self.assertEqual(len(self.calls), 3)

    def test_wrong_commit_tree_truncated_or_missing_objects_are_rejected(self):
        for target, changes in ((self.commit, {"sha": "3" * 40}),
                                (self.objects, {"sha": "3" * 40}),
                                (self.objects, {"truncated": True}),
                                (self.objects, {"tree": []})):
            original = copy.deepcopy(target)
            target.update(changes)
            with self.assertRaises(ReleaseContractError):
                self.observe()
            target.clear()
            target.update(original)

    def test_duplicate_path_and_missing_or_additional_sql_rejected(self):
        original = copy.deepcopy(self.objects["tree"])
        for rows in ([self.row, self.row], [], [self.row, {**self.row,
                    "path": "apps/api/prisma/migrations/002_extra/migration.sql"}]):
            self.objects["tree"] = rows
            with self.assertRaises(ReleaseContractError):
                self.observe()
        self.objects["tree"] = original

    def test_source_links_nested_names_wrong_sizes_and_blob_identity_rejected(self):
        original = dict(self.row)
        for changes in ({"mode": "120000"}, {"type": "tree"}, {"size": True}, {"size": 2097153},
                        {"sha": "3" * 40}, {"path": "apps/api/prisma/migrations/nested/name/migration.sql"}):
            self.row.clear()
            self.row.update({**original, **changes})
            with self.assertRaises(ReleaseContractError):
                self.observe()

    def test_blob_metadata_encoding_size_and_raw_bytes_must_match(self):
        original = dict(self.content)
        for changes in ({"sha": "3" * 40}, {"size": True}, {"encoding": "utf-8"},
                        {"content": base64.b64encode(b"SELECT 2;\n").decode()}):
            self.content.clear()
            self.content.update({**original, **changes})
            with self.assertRaises(ReleaseContractError):
                self.observe()

    def test_sha256_cannot_be_self_reported_even_when_git_blob_matches(self):
        self.inventory[0]["sha256"] = "f" * 64
        self.history[0]["sha256"] = "f" * 64
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_unresolved_history_blocks_before_network_fetch(self):
        self.history[0]["state"] = "rolled-back"
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(self.calls, [])

    def test_source_sha_and_complete_tree_budget_are_strict(self):
        with self.assertRaises(ReleaseContractError):
            installer._installation_migration_source("dev", self.inventory, self.history, fetch=self.fetch)
        self.objects["tree"] = [self.row] * 100001
        with self.assertRaises(ReleaseContractError):
            self.observe()


if __name__ == "__main__":
    unittest.main()
