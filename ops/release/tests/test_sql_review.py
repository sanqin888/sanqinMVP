"""Offline exact SQL review/approval binding; no database or Docker commands."""

from __future__ import annotations

import base64
import contextlib
import copy
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import deployment_plan as plan
import collect_deployment_plan as collector
from release_contract import ReleaseContractError
from test_deployment_plan import NEW, NOW, SQL, inputs


class SqlReviewTests(unittest.TestCase):
    def setUp(self):
        self.values = inputs()
        self.raw = plan.create_plan(created_at=NOW, **self.values)
        self.identity = json.loads(self.raw)["planId"]
        self.pending = self.values["inventory"][-1]
        self.fetch = Mock(side_effect=self.blob)

    def blob(self, path, **kwargs):
        self.assertEqual(path, "/repos/sanqin888/sanqinMVP/git/blobs/" + self.pending["gitBlobSha"])
        return {"sha": self.pending["gitBlobSha"], "size": self.pending["bytes"],
                "encoding": "base64", "content": base64.b64encode(SQL[self.pending["name"]]).decode()}

    def test_scope_hash_matches_only_exact_plan_and_never_claims_safety_or_permission(self):
        result = plan.sql_review(self.raw, self.identity)
        self.assertEqual(result["migrations"], [self.pending])
        self.assertEqual(result["targetSha"], NEW)
        self.assertEqual(result["apiImage"], self.values["candidate"]["images"]["sanq-api"])
        self.assertTrue(result["requiresExplicitApproval"])
        self.assertFalse(result["sqlSafetyAssessed"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(len(result["approvalSha256"]), 64)
        plan.assert_sql_approval(self.raw, self.identity, result["approvalSha256"])

    def test_changed_target_image_runtime_config_history_or_plan_time_invalidates_scope(self):
        approved = plan.sql_review(self.raw, self.identity)["approvalSha256"]
        changes = []
        value = copy.deepcopy(self.values)
        value["candidate"]["sourceSha"] = "c" * 40
        for name in value["candidate"]["images"]:
            value["candidate"]["images"][name]["ref"] = "ghcr.io/sanqin888/" + name + ":" + "c" * 40
        changes.append(value)
        for section, key, changed in (
                ("current", "configurationSha256", "f" * 64),
                ("current", "releaseStateSha256", "f" * 64),
                ("runtime_pins", next(iter(self.values["runtime_pins"])), "f" * 64)):
            value = copy.deepcopy(self.values)
            value[section][key] = changed
            changes.append(value)
        value = copy.deepcopy(self.values)
        value["candidate"]["images"]["sanq-api"]["digest"] = "sha256:" + "f" * 64
        changes.append(value)
        value = copy.deepcopy(self.values)
        value["history"].append({**value["history"][0], "state": "rolled-back"})
        changes.append(value)
        for values in changes:
            raw = plan.create_plan(created_at=NOW, **values)
            identity = json.loads(raw)["planId"]
            with self.subTest(values=values), self.assertRaises(ReleaseContractError):
                plan.assert_sql_approval(raw, identity, approved)
        raw = plan.create_plan(created_at="2026-10-26T16:01:00Z", **self.values)
        with self.assertRaises(ReleaseContractError):
            plan.assert_sql_approval(raw, json.loads(raw)["planId"], approved)

    def test_sql_byte_change_invalidates_same_named_migration_scope(self):
        values = copy.deepcopy(self.values)
        source = dict(SQL)
        source[self.pending["name"]] += b"-- changed bytes\n"
        values["inventory"] = plan.migration_inventory(source)
        values["pending"] = [{"name": row["name"], "sha256": row["sha256"]}
                             for row in values["inventory"] if row["name"] == self.pending["name"]]
        raw = plan.create_plan(created_at=NOW, **values)
        with self.assertRaises(ReleaseContractError):
            plan.assert_sql_approval(raw, json.loads(raw)["planId"],
                                     plan.sql_review(self.raw, self.identity)["approvalSha256"])

    def test_boolean_generic_plan_id_malformed_or_other_digest_never_approves_sql(self):
        for value in (None, True, 1, "", self.identity, "F" * 64, "0" * 64, "../other"):
            with self.subTest(value=value), self.assertRaises(ReleaseContractError):
                plan.assert_sql_approval(self.raw, self.identity, value)

    def test_no_pending_sql_needs_no_approval_and_does_not_fetch_any_blob(self):
        values = copy.deepcopy(self.values)
        values["history"] = [{"name": row["name"], "sha256": row["sha256"], "state": "applied"}
                             for row in values["inventory"]]
        values["pending"] = []
        raw = plan.create_plan(created_at=NOW, **values)
        identity = json.loads(raw)["planId"]
        self.assertIsNone(plan.sql_review(raw, identity)["approvalSha256"])
        plan.assert_sql_approval(raw, identity, None)
        with self.assertRaises(ReleaseContractError):
            plan.assert_sql_approval(raw, identity, "0" * 64)
        self.assertEqual(collector.review_sql(raw, identity, fetch=self.fetch)["migrations"], [])
        self.fetch.assert_not_called()

    def test_wrong_independent_plan_id_or_noncanonical_bytes_is_rejected(self):
        for raw, identity in ((self.raw, "0" * 64), (self.raw + b" ", self.identity)):
            with self.assertRaises(ReleaseContractError):
                plan.sql_review(raw, identity)
            with self.assertRaises(ReleaseContractError):
                collector.review_sql(raw, identity, fetch=self.fetch)
        self.fetch.assert_not_called()

    def test_pending_blob_is_verified_and_displayed_with_exact_commit_source(self):
        result = collector.review_sql(self.raw, self.identity, fetch=self.fetch)
        self.fetch.assert_called_once()
        self.assertEqual(result["mode"], "SQL_REVIEW_ONLY")
        self.assertEqual(result["approvalSha256"], plan.sql_review(self.raw, self.identity)["approvalSha256"])
        self.assertEqual(result["migrations"][0]["sqlText"].encode(), SQL[self.pending["name"]])
        self.assertIn("/blob/" + NEW + "/apps/api/prisma/migrations/",
                      result["migrations"][0]["sourceUrl"])
        self.assertFalse(result["canExecute"])

    def test_wrong_blob_identity_size_encoding_or_contents_are_rejected(self):
        original = self.blob("/repos/sanqin888/sanqinMVP/git/blobs/" + self.pending["gitBlobSha"])
        for changes in ({"sha": "f" * 40}, {"size": True}, {"size": 0},
                        {"encoding": "utf-8"}, {"content": "not base64!"},
                        {"content": base64.b64encode(b"x" * self.pending["bytes"]).decode()},
                        {"content": "A" * (4 * ((self.pending["bytes"] + 2) // 3) + 1025)}):
            with self.subTest(changes=changes), self.assertRaises((ReleaseContractError, ValueError)):
                collector.review_sql(self.raw, self.identity, fetch=Mock(return_value={**original, **changes}))

    def test_original_utf8_and_crlf_bytes_are_preserved_without_normalization(self):
        values = copy.deepcopy(self.values)
        source = dict(SQL)
        sql = "-- 中文\r\nSELECT 1;\r\n".encode()
        source[self.pending["name"]] = sql
        values["inventory"] = plan.migration_inventory(source)
        item = values["inventory"][-1]
        values["pending"] = [{"name": item["name"], "sha256": item["sha256"]}]
        raw = plan.create_plan(created_at=NOW, **values)
        blob = {"sha": item["gitBlobSha"], "size": len(sql), "encoding": "base64",
                "content": base64.b64encode(sql).decode() + "\n"}
        result = collector.review_sql(raw, json.loads(raw)["planId"], fetch=Mock(return_value=blob))
        self.assertEqual(result["migrations"][0]["sqlText"].encode(), sql)

    def test_source_and_encoded_output_budgets_fail_without_partial_output(self):
        with patch.object(collector, "MAX_OUTPUT", self.pending["bytes"] - 1):
            with self.assertRaises(ReleaseContractError):
                collector.review_sql(self.raw, self.identity, fetch=self.fetch)
        self.fetch.assert_not_called()
        with patch.object(collector, "MAX_OUTPUT", self.pending["bytes"] + 1):
            with self.assertRaises(ReleaseContractError):
                collector.review_sql(self.raw, self.identity, fetch=self.fetch)

    def test_prepare_show_summary_exposes_scope_but_never_marks_it_approved(self):
        summary = collector.summary(self.raw, self.identity)
        self.assertEqual(summary["sqlReview"], plan.sql_review(self.raw, self.identity))
        self.assertFalse(summary["canExecute"])
        self.assertNotIn("approved", summary["sqlReview"])

    def test_show_sql_cli_emits_verified_review_only_and_never_collects_or_executes(self):
        with patch.object(collector.store, "load_plan", return_value=self.raw), \
             patch.object(collector.release, "github_json", side_effect=self.blob), \
             patch.object(collector, "collect") as collect, \
             patch.object(collector, "command") as command, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["show-sql", self.identity]), 0)
        result = json.loads(output.getvalue())
        self.assertEqual(result["mode"], "SQL_REVIEW_ONLY")
        self.assertFalse(result["sqlSafetyAssessed"])
        collect.assert_not_called()
        command.assert_not_called()

    def test_blob_failure_prints_only_fixed_error_and_no_partial_sql_or_digest(self):
        with patch.object(collector.store, "load_plan", return_value=self.raw), \
             patch.object(collector.release, "github_json", side_effect=ValueError("SECRET_SQL")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["show-sql", self.identity]), 1)
        self.assertNotIn("SECRET_SQL", output.getvalue())
        self.assertNotIn("approvalSha256", output.getvalue())
        self.assertNotIn("ALTER TABLE", output.getvalue())


if __name__ == "__main__":
    unittest.main()
