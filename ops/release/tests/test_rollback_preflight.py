"""Offline compatibility acknowledgement/preflight; no real business or manager commands."""
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
import test_deployment_plan as fixtures
import test_rollback_review as review_fixtures
import test_rollback_collector as collector_fixtures
import test_deployment_plan_store as store_fixtures
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_task as task
from release_contract import ReleaseContractError


class RollbackAcknowledgementTests(unittest.TestCase):
    def setUp(self):
        self.case = review_fixtures.RollbackReviewTests(
            "test_review_binds_original_state_and_lists_extra_sql_without_authority")
        self.case.setUp()
        self.raw, self.identity = self.case.make()
        self.approval = plan.rollback_review_summary(self.raw, self.identity)["compatibilityApprovalSha256"]

    def fresh(self, created_at="2026-10-26T16:01:00Z"):
        return plan.create_rollback_review(release_state=self.case.state_bytes(),
            target_inventory=self.case.target_inventory, created_at=created_at, **self.case.values)

    def test_exact_independent_acknowledgement_is_required_even_with_identical_sql(self):
        plan.assert_rollback_compatibility(self.raw, self.identity, self.approval)
        self.case.target_inventory = copy.deepcopy(self.case.values["inventory"])
        raw, identity = self.case.make()
        approved = plan.rollback_review_summary(raw, identity)["compatibilityApprovalSha256"]
        plan.assert_rollback_compatibility(raw, identity, approved)
        with self.assertRaises(ReleaseContractError):
            plan.assert_rollback_compatibility(raw, identity, self.approval)
        self.assertFalse(plan.rollback_review_summary(raw, identity)["databaseCompatibilityProven"])

    def test_missing_boolean_generic_id_wrong_digest_and_forward_kind_rejected(self):
        for approval in (None, True, 1, "", self.identity, "0" * 64, self.approval.upper()):
            with self.subTest(approval=approval), self.assertRaises(ReleaseContractError):
                plan.assert_rollback_compatibility(self.raw, self.identity, approval)
        raw, identity = fixtures.prepared()
        with self.assertRaises(ReleaseContractError):
            plan.assert_rollback_compatibility(raw, identity, self.approval)

    def test_new_collection_time_is_allowed_but_original_approval_scope_stays_exact(self):
        fresh = self.fresh()
        plan.assert_same_rollback_observations(self.raw, self.identity, fresh_raw=fresh,
                                               observed_at="2026-10-26T16:02:00Z")
        self.assertNotEqual(json.loads(fresh)["planId"], self.identity)
        with self.assertRaises(ReleaseContractError):
            plan.assert_rollback_compatibility(fresh, json.loads(fresh)["planId"], self.approval)

    def test_any_valid_configuration_backup_history_runtime_or_target_proof_drift_blocks(self):
        original = copy.deepcopy(self.case.values)
        for section, key, value in (
                ("current", "configurationSha256", "f" * 64),
                ("backup", "sha256", "f" * 64),
                ("runtime_pins", plan.RUNTIME_FILES[0], "f" * 64),
                ("candidate", "ciRunId", 999)):
            self.case.values = copy.deepcopy(original)
            self.case.values[section][key] = value
            with self.subTest(section=section), self.assertRaises(ReleaseContractError):
                plan.assert_same_rollback_observations(self.raw, self.identity, fresh_raw=self.fresh(),
                                                       observed_at="2026-10-26T16:02:00Z")
        self.case.values = copy.deepcopy(original)
        self.case.values["history"].append({**original["history"][0], "state": "rolled-back"})
        with self.assertRaises(ReleaseContractError):
            plan.assert_same_rollback_observations(self.raw, self.identity, fresh_raw=self.fresh(),
                                                   observed_at="2026-10-26T16:02:00Z")
        self.case.values = original
        self.case.state["reason"] = "rollback-verified"
        self.case.state["phase"] = "rolled-back"
        raw, _ = self.case.make()
        with self.assertRaises(ReleaseContractError):
            plan.assert_same_rollback_observations(self.raw, self.identity, fresh_raw=raw,
                                                   observed_at="2026-10-26T16:02:00Z")

    def test_future_or_backwards_collection_and_expired_backup_block(self):
        for created, observed in (("2026-10-26T15:59:00Z", fixtures.NOW),
                                  ("2026-10-26T16:01:00Z", fixtures.NOW),
                                  ("2026-10-26T16:01:00Z", "2026-10-27T17:00:01Z")):
            with self.subTest(created=created, observed=observed), self.assertRaises(ReleaseContractError):
                plan.assert_same_rollback_observations(self.raw, self.identity, fresh_raw=self.fresh(created),
                                                       observed_at=observed)

    def test_malformed_noncanonical_wrong_kind_and_tampered_fresh_review_block(self):
        forward, _ = fixtures.prepared()
        for fresh in (None, b"[]", b"{}", b'{"planId":"x","planId":"x"}', self.raw + b" ",
                      self.raw.replace(b'"canExecute":false', b'"canExecute":true'), forward):
            with self.subTest(fresh=str(fresh)[:20]), self.assertRaises(ReleaseContractError):
                plan.assert_same_rollback_observations(self.raw, self.identity, fresh_raw=fresh,
                                                       observed_at=fixtures.NOW)

    def test_installation_refuses_missing_rollback_apis_before_any_collection(self):
        with patch.object(task, "TASK_SCRIPT", Path(task.__file__)), \
             patch.object(collector, "_private_bytes"):
            task._installed()
            for owner, name in ((storage, "load_rollback_review"), (collector, "collect_rollback"),
                                (plan, "assert_rollback_compatibility"),
                                (plan, "assert_same_rollback_observations")):
                with self.subTest(name=name), patch.object(owner, name, None):
                    with self.assertRaises(ReleaseContractError):
                        task._installed()


class RollbackSqlReviewTests(unittest.TestCase):
    def setUp(self):
        self.case = review_fixtures.RollbackReviewTests(
            "test_review_binds_original_state_and_lists_extra_sql_without_authority")
        self.case.setUp()
        self.raw, self.identity = self.case.make()
        self.item = self.case.values["inventory"][-1]
        self.blob = {"sha": self.item["gitBlobSha"], "size": self.item["bytes"],
                     "encoding": "base64",
                     "content": base64.b64encode(fixtures.SQL[self.item["name"]]).decode()}
        self.fetch = Mock(return_value=self.blob)

    def test_exact_extra_sql_uses_current_commit_not_old_target_and_preserves_bytes(self):
        result = collector.review_rollback_sql(self.raw, self.identity, fetch=self.fetch)
        row = result["extraAppliedMigrations"][0]
        self.assertEqual(row["sqlText"].encode(), fixtures.SQL[self.item["name"]])
        self.assertIn("/blob/" + fixtures.NEW + "/", row["sourceUrl"])
        self.assertEqual(self.fetch.call_args.args[0],
                         "/repos/sanqin888/sanqinMVP/git/blobs/" + self.item["gitBlobSha"])
        self.assertFalse(result["canExecute"])
        self.assertFalse(result["databaseCompatibilityProven"])
        self.assertFalse(result["incidentRecoveryAuthorized"])

    def test_identical_sql_still_has_acknowledgement_without_fetch(self):
        self.case.target_inventory = self.case.values["inventory"]
        raw, identity = self.case.make()
        result = collector.review_rollback_sql(raw, identity, fetch=self.fetch)
        self.assertEqual(result["extraAppliedMigrations"], [])
        self.assertTrue(result["requiresExplicitCompatibilityReview"])
        self.fetch.assert_not_called()

    def test_wrong_blob_fields_bytes_encoding_and_output_budget_rejected(self):
        for changes in ({"sha": "0" * 40}, {"size": True}, {"encoding": "utf-8"},
                        {"content": "!"}, {"content": base64.b64encode(b"x" * self.item["bytes"]).decode()}):
            with self.subTest(changes=changes), self.assertRaises((ReleaseContractError, ValueError)):
                collector.review_rollback_sql(self.raw, self.identity,
                    fetch=Mock(return_value={**self.blob, **changes}))
        for budget in (self.item["bytes"] - 1, self.item["bytes"]):
            with patch.object(collector, "MAX_OUTPUT", budget), self.assertRaises(ReleaseContractError):
                collector.review_rollback_sql(self.raw, self.identity, fetch=self.fetch)

    def test_sql_cli_typed_load_and_failure_emit_no_partial_or_arbitrary_text(self):
        with patch.object(storage, "load_rollback_review", return_value=self.raw), \
             patch.object(collector.release, "github_json", side_effect=lambda path, **kwargs: self.blob), \
             patch.object(collector, "collect_rollback") as collect, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["show-rollback-sql", self.identity]), 0)
        self.assertEqual(json.loads(output.getvalue())["mode"], "ROLLBACK_SQL_REVIEW_ONLY")
        collect.assert_not_called()
        with patch.object(storage, "load_rollback_review", return_value=self.raw), \
             patch.object(collector.release, "github_json", side_effect=ValueError("DO_NOT_PRINT")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["show-rollback-sql", self.identity]), 1)
        self.assertNotIn("DO_NOT_PRINT", output.getvalue())
        self.assertNotIn("sqlText", output.getvalue())


class RollbackPreflightTests(unittest.TestCase):
    def setUp(self):
        self.model = collector_fixtures.RollbackCollectorTests(
            "test_exact_previous_both_sql_sources_and_no_health_or_application_mutation")
        self.model.setUp()
        self.addCleanup(self.model.doCleanups)
        self.fs = store_fixtures.PrivatePlanStoreTests(
            "test_create_private_and_load_same_original_by_retained_identity")
        self.fs.setUp()
        self.addCleanup(self.fs.doCleanups)
        self.raw = self.model.collect(cache_images=False)
        self.identity = storage.save_rollback_review(self.raw)
        self.approval = plan.rollback_review_summary(self.raw, self.identity)["compatibilityApprovalSha256"]
        self.model.calls.clear()
        self.events = []
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.installed = self.replace(task, "_installed")
        self.gate = self.replace(task.guard, "_installed_gate")
        self.pending = self.replace(task.job, "_no_pending")
        self.replace(task.job, "_locked_directory", side_effect=self.job_lock)
        self.replace(storage, "preparation_lock", side_effect=self.plan_lock)
        self.writes = [self.replace(task.guard, "_freeze_for_plan_locked"),
                       self.replace(task, "submit"), self.replace(task, "run_task"),
                       self.replace(task.job, "_write"), self.replace(task.guard, "_write")]
        self.seconds = 0.0

    def replace(self, owner, name, **kwargs):
        return self.stack.enter_context(patch.object(owner, name, **kwargs))

    @contextlib.contextmanager
    def job_lock(self):
        self.events.append("job-enter")
        try:
            yield 123
        finally:
            self.events.append("job-exit")

    @contextlib.contextmanager
    def plan_lock(self):
        self.assertEqual(self.events, ["job-enter"])
        self.events.append("plan-enter")
        try:
            yield
        finally:
            self.events.append("plan-exit")

    def check(self, **kwargs):
        def run(args, **options):
            self.assertEqual(self.events, ["job-enter", "plan-enter"])
            return self.model.command(args, **options)
        return task.check_rollback(self.identity, approval=kwargs.pop("approval", self.approval),
            controller=self.model.controller, run=kwargs.pop("run", run), fetch=self.model.fetch,
            now=lambda: fixtures.NOW, clock=lambda: self.seconds, **kwargs)

    def test_real_collection_and_typed_store_recheck_under_both_locks_without_business_mutation(self):
        result = self.check()
        self.assertEqual(result["outcome"], "BASELINE_RECHECKED")
        self.assertTrue(result["compatibilityAcknowledged"])
        for field in ("canExecute", "databaseCompatibilityProven", "incidentRecoveryAuthorized",
                      "executionImplemented"):
            self.assertFalse(result[field])
        self.assertNotIn("releaseStateRaw", result)
        self.assertEqual(self.events, ["job-enter", "plan-enter", "plan-exit", "job-exit"])
        self.assertEqual(storage.load_rollback_review(self.identity), self.raw)
        self.assertEqual(self.pending.call_count, 2)
        self.assertEqual(self.gate.call_count, 2)
        for mock in self.writes:
            mock.assert_not_called()
        self.assertFalse(any(word in args for args, _ in self.model.calls
                             for word in ("pull", "up", "create", "start", "stop", "update", "build")))

    def test_wrong_acknowledgement_blocks_before_source_or_container_observation(self):
        self.model.proof.reset_mock()
        with self.assertRaises(ReleaseContractError):
            self.check(approval="0" * 64)
        self.model.proof.assert_not_called()
        self.assertEqual(self.model.calls, [])

    def test_runtime_source_history_or_backup_drift_blocks_without_new_plan_save(self):
        self.model.backup.return_value = {**self.model.values["backup"], "sha256": "f" * 64}
        with self.assertRaises(ReleaseContractError):
            self.check()
        self.assertEqual(storage.load_rollback_review(self.identity), self.raw)
        for mock in self.writes:
            mock.assert_not_called()

    def test_pending_job_maintenance_or_missing_gate_blocks_before_collection(self):
        self.model.proof.reset_mock()
        for mock in (self.pending, self.model.clear, self.gate):
            with self.subTest(mock=mock):
                mock.side_effect = ReleaseContractError("blocked")
                with self.assertRaises(ReleaseContractError):
                    self.check()
                mock.side_effect = None
                self.events.clear()
        self.model.proof.assert_not_called()

    def test_readback_change_and_budget_exhaustion_cannot_return_success(self):
        with patch.object(storage, "load_rollback_review", side_effect=[self.raw, self.raw + b" "]):
            with self.assertRaises(ReleaseContractError):
                self.check()
        self.events.clear()
        def slow(args, **kwargs):
            self.assertLessEqual(kwargs["timeout"], 60)
            self.seconds = 301
            return self.model.command(args, **kwargs)
        with self.assertRaises(ReleaseContractError):
            self.check(run=slow)
        for mock in self.writes:
            mock.assert_not_called()

    def test_concurrent_lock_and_non_root_cannot_collect(self):
        self.model.proof.reset_mock()
        with patch.object(task.job, "_locked_directory", side_effect=ReleaseContractError("busy")):
            with self.assertRaises(ReleaseContractError):
                self.check()
        with patch.object(task.job, "_root_operator", side_effect=ReleaseContractError("root required")):
            with self.assertRaises(ReleaseContractError):
                self.check()
        self.model.proof.assert_not_called()

    def test_check_cli_requires_exact_argument_and_never_accepts_sql_or_target_options(self):
        for extra in ([], ["--approve-sql", self.approval],
                      ["--approve-compatibility", self.approval, "--target-sha", fixtures.OLD]):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                task.main(["check-rollback", self.identity] + extra)
        with patch.object(task, "check_rollback", return_value={"canExecute": False}) as check, \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(task.main(["check-rollback", self.identity,
                                        "--approve-compatibility", self.approval]), 0)
        check.assert_called_once_with(self.identity, approval=self.approval)
        with patch.object(task, "check_rollback", side_effect=ValueError("DO_NOT_PRINT")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(task.main(["check-rollback", self.identity,
                                        "--approve-compatibility", self.approval]), 1)
        self.assertNotIn("DO_NOT_PRINT", output.getvalue())
        self.assertIn("no rollback task", output.getvalue())


if __name__ == "__main__":
    unittest.main()
