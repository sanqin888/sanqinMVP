"""Offline exact historical release and rollback review; no apply/restore."""
import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_deployment_plan as fixtures
import deployment_plan as plan
import release_contract as release


def responses():
    data = fixtures.api_responses()
    prefix = "/repos/" + release.REPOSITORY
    data[prefix + "/commits/" + fixtures.OLD + "/statuses?per_page=100"] = copy.deepcopy(
        data[prefix + "/commits/" + fixtures.NEW + "/statuses?per_page=100"])
    current_main = copy.deepcopy(data[prefix + "/compare/" + fixtures.NEW + "...main"])
    previous_main = copy.deepcopy(current_main)
    previous_main["base_commit"]["sha"] = previous_main["merge_base_commit"]["sha"] = fixtures.OLD
    data[prefix + "/compare/" + fixtures.OLD + "...main"] = previous_main
    data[prefix + "/compare/" + fixtures.OLD + "..." + fixtures.OLD] = {
        **copy.deepcopy(previous_main), "status": "identical"}
    ci_key = prefix + "/actions/workflows/ci.yml/runs?event=push&head_sha="
    historical_ci = copy.deepcopy(data[ci_key + fixtures.NEW + "&per_page=100"])
    historical_ci["workflow_runs"][0].update(id=39, head_sha=fixtures.OLD)
    data[ci_key + fixtures.OLD + "&per_page=100"] = historical_ci
    return data


class ExactRollbackSourceTests(unittest.TestCase):
    def test_exact_previous_has_target_ci_seal_and_both_main_lineages(self):
        data = responses()
        calls = []
        def fetch(path):
            calls.append(path)
            return data[path]
        result = release.verify_exact_rollback(fixtures.NEW, fixtures.OLD, fetch)
        self.assertEqual(result["sourceSha"], fixtures.OLD)
        self.assertEqual(result["ciRunId"], 39)
        self.assertEqual(result["images"]["sanq-api"]["ref"],
                         "ghcr.io/sanqin888/sanq-api:" + fixtures.OLD)
        self.assertEqual(len(calls), 7)
        self.assertFalse(any("commits?sha=main" in call for call in calls))
        self.assertFalse(any("head_sha=" + fixtures.NEW in call for call in calls))

    def test_current_ci_failure_does_not_replace_historical_target_evidence(self):
        data = responses()
        key = "/repos/" + release.REPOSITORY + "/actions/workflows/ci.yml/runs?event=push&head_sha="
        data[key + fixtures.NEW + "&per_page=100"]["workflow_runs"][0]["conclusion"] = "failure"
        result = release.verify_exact_rollback(fixtures.NEW, fixtures.OLD, data.__getitem__)
        self.assertEqual(result["ciRunId"], 39)

    def test_newer_failed_previous_ci_blocks_despite_old_success(self):
        data = responses()
        key = "/repos/" + release.REPOSITORY + "/actions/workflows/ci.yml/runs?event=push&head_sha="
        runs = data[key + fixtures.OLD + "&per_page=100"]["workflow_runs"]
        runs.append({**runs[0], "id": 40, "conclusion": "failure"})
        with self.assertRaises(release.ReleaseContractError):
            release.verify_exact_rollback(fixtures.NEW, fixtures.OLD, data.__getitem__)

    def test_unsealed_previous_is_not_replaced_with_another_release(self):
        data = responses()
        key = "/repos/" + release.REPOSITORY + "/commits/" + fixtures.OLD + "/statuses?per_page=100"
        data[key].insert(0, {**data[key][0], "state": "failure"})
        with self.assertRaises(release.ReleaseContractError):
            release.verify_exact_rollback(fixtures.NEW, fixtures.OLD, data.__getitem__)

    def test_current_main_or_previous_ancestry_drift_blocks(self):
        prefix = "/repos/" + release.REPOSITORY + "/compare/"
        for key, change in (
                (prefix + fixtures.NEW + "...main", {"status": "diverged"}),
                (prefix + fixtures.OLD + "..." + fixtures.NEW, {"status": "behind"}),
                (prefix + fixtures.OLD + "..." + fixtures.NEW, {"behind_by": False}),
                (prefix + fixtures.OLD + "..." + fixtures.NEW,
                 {"merge_base_commit": {"sha": fixtures.NEW}})):
            data = responses()
            data[key].update(change)
            with self.assertRaises(release.ReleaseContractError):
                release.verify_exact_rollback(fixtures.NEW, fixtures.OLD, data.__getitem__)

    def test_same_or_invalid_target_rejected_without_fetching(self):
        fetch = Mock()
        for current, previous in ((fixtures.NEW, fixtures.NEW), ("latest", fixtures.OLD),
                                  (fixtures.NEW, "../other")):
            with self.assertRaises(release.ReleaseContractError):
                release.verify_exact_rollback(current, previous, fetch)
        fetch.assert_not_called()


class RollbackReviewTests(unittest.TestCase):
    def setUp(self):
        self.values = fixtures.inputs()
        self.values["current"]["applicationSha"] = fixtures.NEW
        self.values["candidate"]["sourceSha"] = fixtures.OLD
        for name, image in self.values["candidate"]["images"].items():
            image["ref"] = "ghcr.io/sanqin888/" + name + ":" + fixtures.OLD
        self.values["pending"] = []
        self.values["history"] = [{key: row[key] for key in ("name", "sha256")} | {"state": "applied"}
                                  for row in self.values["inventory"]]
        self.state = {"schemaVersion": 1, "phase": "active", "current": fixtures.NEW,
                      "previous": fixtures.OLD, "reason": "readiness-verified",
                      "updatedAt": fixtures.NOW}
        self.target_inventory = copy.deepcopy(self.values["inventory"][:1])

    def state_bytes(self):
        return (json.dumps(self.state, indent=2) + "\n").encode()

    def make(self, state_raw=None):
        raw = self.state_bytes() if state_raw is None else state_raw
        self.values["current"]["releaseStateSha256"] = hashlib.sha256(raw).hexdigest()
        review = plan.create_rollback_review(release_state=raw, target_inventory=self.target_inventory,
                                            created_at=fixtures.NOW, **self.values)
        return review, json.loads(review)["planId"]

    def test_review_binds_original_state_and_lists_extra_sql_without_authority(self):
        raw, identity = self.make()
        value = plan.validate_rollback_review(raw, identity)
        self.assertEqual(value["releaseStateRaw"].encode(), self.state_bytes())
        self.assertEqual(value["candidate"]["sourceSha"], fixtures.OLD)
        summary = plan.rollback_review_summary(raw, identity)
        self.assertEqual(summary["extraAppliedMigrations"], self.values["inventory"][1:])
        self.assertTrue(summary["requiresExplicitCompatibilityReview"])
        self.assertFalse(summary["databaseCompatibilityProven"])
        self.assertFalse(summary["incidentRecoveryAuthorized"])
        self.assertFalse(summary["canExecute"])

    def test_forward_plan_and_sql_review_cannot_accept_rollback_kind(self):
        raw, identity = self.make()
        with self.assertRaises(release.ReleaseContractError):
            plan.validate_plan(raw, identity)
        with self.assertRaises(release.ReleaseContractError):
            plan.sql_review(raw, identity)
        forward = plan.create_plan(created_at=fixtures.NOW, **self.values)
        forward_id = json.loads(forward)["planId"]
        with self.assertRaises(release.ReleaseContractError):
            plan.validate_rollback_review(forward, forward_id)

    def test_pending_unknown_completion_reason_or_future_state_rejected(self):
        original = copy.deepcopy(self.state)
        for changes in ({"phase": "pending"}, {"phase": "incident"}, {"reason": "unknown"},
                        {"updatedAt": "2026-10-27T00:00:00Z"}, {"schemaVersion": True}):
            self.state = {**original, **changes}
            with self.assertRaises(release.ReleaseContractError):
                self.make()
        self.state = original

    def test_previous_and_current_must_match_exact_selected_target(self):
        original = copy.deepcopy(self.state)
        for changes in ({"previous": "c" * 40}, {"current": "c" * 40},
                        {"previous": fixtures.NEW}):
            self.state = {**original, **changes}
            with self.assertRaises(release.ReleaseContractError):
                self.make()

    def test_rolled_back_resolved_state_remains_reviewable(self):
        self.state.update(phase="rolled-back", reason="rollback-verified")
        raw, identity = self.make()
        self.assertFalse(plan.rollback_review_summary(raw, identity)["canExecute"])

    def test_pending_or_failed_current_history_cannot_form_rollback_review(self):
        old = copy.deepcopy(self.values["history"])
        self.values["history"] = old[:1]
        self.values["pending"] = [{"name": self.values["inventory"][-1]["name"],
                                   "sha256": self.values["inventory"][-1]["sha256"]}]
        with self.assertRaises(release.ReleaseContractError):
            self.make()
        self.values["pending"] = []
        self.values["history"] = [*old[:1], {**old[-1], "state": "failed"}]
        with self.assertRaises(release.ReleaseContractError):
            self.make()

    def test_changed_reordered_or_new_target_sql_is_rejected(self):
        for inventory in ([self.values["inventory"][-1]],
                          list(reversed(self.values["inventory"])),
                          [{**self.values["inventory"][0], "sha256": "0" * 64}]):
            self.target_inventory = copy.deepcopy(inventory)
            with self.assertRaises(release.ReleaseContractError):
                self.make()

    def test_identical_sql_inventory_still_requires_compatibility_review(self):
        self.target_inventory = copy.deepcopy(self.values["inventory"])
        raw, identity = self.make()
        summary = plan.rollback_review_summary(raw, identity)
        self.assertEqual(summary["extraAppliedMigrations"], [])
        self.assertTrue(summary["requiresExplicitCompatibilityReview"])
        self.assertFalse(summary["databaseCompatibilityProven"])

    def test_tamper_wrong_id_duplicate_json_and_noncanonical_bytes_rejected(self):
        raw, identity = self.make()
        value = json.loads(raw)
        value["backup"]["sha256"] = "0" * 64
        changed = plan._canonical(value) + b"\n"
        for data, expected in ((changed, identity), (raw, "0" * 64),
                               (json.dumps(json.loads(raw), indent=2).encode(), identity),
                               (raw.replace(b'"kind":', b'"kind":"duplicate","kind":', 1), identity)):
            with self.assertRaises(release.ReleaseContractError):
                plan.validate_rollback_review(data, expected)

    def test_state_whitespace_and_target_proof_changes_bind_new_scope(self):
        raw, identity = self.make()
        first = plan.rollback_review_summary(raw, identity)
        raw2, identity2 = self.make(json.dumps(self.state, separators=(",", ":")).encode())
        self.assertNotEqual(identity, identity2)
        self.assertNotEqual(first["compatibilityApprovalSha256"],
                            plan.rollback_review_summary(raw2, identity2)["compatibilityApprovalSha256"])
        self.values["candidate"]["images"]["sanq-api"]["digest"] = "sha256:" + "1" * 64
        raw3, identity3 = self.make()
        self.assertNotEqual(identity, identity3)

    def test_state_hash_mismatch_missing_fields_or_bad_bytes_rejected(self):
        raw, identity = self.make()
        value = json.loads(raw)
        value["current"]["releaseStateSha256"] = "0" * 64
        body = {k: v for k, v in value.items() if k != "planId"}
        value["planId"] = hashlib.sha256(plan._canonical(body)).hexdigest()
        with self.assertRaises(release.ReleaseContractError):
            plan.validate_rollback_review(plan._canonical(value) + b"\n", value["planId"])
        del self.state["previous"]
        with self.assertRaises(release.ReleaseContractError):
            self.make()
        with self.assertRaises(release.ReleaseContractError):
            self.make(b"\xff")


if __name__ == "__main__":
    unittest.main()
