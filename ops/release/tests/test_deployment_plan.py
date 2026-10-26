"""Offline negative cases for exact candidate review and immutable plan contracts."""

from __future__ import annotations

import base64
import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import deployment_plan as plan
import release_contract as release

OLD = "a" * 40
NEW = "b" * 40
TREE = "c" * 40
PIN = "d" * 64
DIGEST = "sha256:" + "e" * 64
RUN_URL = "https://github.com/sanqin888/sanqinMVP/actions/runs/42"
NOW = "2026-10-26T16:00:00Z"
SQL = {"20261001000000_first": b"CREATE TABLE example(id integer);\n",
       "20261002000000_second": b"ALTER TABLE example ADD COLUMN value text;\n"}


def inputs():
    inventory = plan.migration_inventory(SQL)
    return {
        "current": {"applicationSha": OLD, "runtimeSourceSha": OLD,
                    "manifestSha256": PIN, "releaseStateSha256": PIN,
                    "configurationSha256": PIN},
        "candidate": {"sourceSha": NEW, "publicationUrl": RUN_URL, "ciRunId": 41,
                      "images": {name: {
                          "ref": f"ghcr.io/sanqin888/{name}:{NEW}", "digest": DIGEST
                      } for name in ("sanq-api", "sanq-web")}},
        "runtime_pins": {name: PIN for name in plan.RUNTIME_FILES},
        "inventory": inventory,
        "history": [{"name": inventory[0]["name"],
                     "sha256": inventory[0]["sha256"], "state": "applied"}],
        "pending": [{"name": inventory[1]["name"], "sha256": inventory[1]["sha256"]}],
        "backup": {"fileName": "sanqin_db_20261026_150000.sql.gz",
                   "sha256": PIN, "bytes": 123, "modifiedAt": "2026-10-26T15:00:00Z"},
        "environment": {"requiredKeys": ["DB_USER", "JWT_SECRET"], "missingKeys": []},
    }


def prepared(**changes):
    arguments = inputs()
    arguments.update(changes)
    raw = plan.create_plan(created_at=NOW, **arguments)
    return raw, json.loads(raw)["planId"]


def git_tree(inventory):
    return {"sha": TREE, "truncated": False, "tree": [{
        "path": f"apps/api/prisma/migrations/{item['name']}/migration.sql",
        "type": "blob", "mode": "100644", "sha": item["gitBlobSha"], "size": item["bytes"]
    } for item in inventory]}


def api_responses():
    status = {"context": release.RELEASE_CONTEXT, "state": "success",
              "creator": {"login": "github-actions[bot]"}, "target_url": RUN_URL,
              "description": "a:" + "e" * 64 + " w:" + "e" * 64}
    def comparison(base):
        return {"status": "ahead", "behind_by": 0,
                "base_commit": {"sha": base}, "merge_base_commit": {"sha": base},
                "total_commits": 500, "files": [{"filename": f"docs/{i}.md"} for i in range(300)]}
    repo = {"full_name": release.REPOSITORY}
    return {
        f"/repos/{release.REPOSITORY}/commits/{NEW}/statuses?per_page=100": [status],
        f"/repos/{release.REPOSITORY}/compare/{NEW}...main": comparison(NEW),
        f"/repos/{release.REPOSITORY}/compare/{OLD}...{NEW}": comparison(OLD),
        f"/repos/{release.REPOSITORY}/actions/runs/42": {
            "id": 42, "path": ".github/workflows/publish-images.yml", "event": "workflow_run",
            "head_branch": "main", "status": "completed", "conclusion": "success",
            "repository": repo,
        },
        f"/repos/{release.REPOSITORY}/actions/workflows/ci.yml/runs"
        f"?event=push&head_sha={NEW}&per_page=100": {"workflow_runs": [{
            "id": 41, "path": ".github/workflows/ci.yml", "head_sha": NEW,
            "head_branch": "main", "event": "push", "status": "completed",
            "conclusion": "success", "repository": repo,
        }]},
    }


class ExactCandidateTests(unittest.TestCase):
    def test_exact_candidate_does_not_discover_latest_or_use_compare_file_budget(self):
        responses = api_responses()
        calls = []
        def fetch(path):
            calls.append(path)
            return responses[path]
        result = release.verify_exact_candidate(OLD, NEW, fetch)
        self.assertEqual(result, inputs()["candidate"])
        self.assertTrue(all("commits?sha=main" not in call for call in calls))
        self.assertEqual(len(calls), 5)

    def test_changed_main_lineage_and_wrong_response_binding_are_rejected(self):
        key = f"/repos/{release.REPOSITORY}/compare/{OLD}...{NEW}"
        for change in ({"status": "behind"}, {"behind_by": 1}, {"behind_by": False},
                       {"base_commit": {"sha": NEW}},
                       {"merge_base_commit": {"sha": NEW}}):
            responses = api_responses()
            responses[key].update(change)
            with self.subTest(change=change), self.assertRaises(release.ReleaseContractError):
                release.verify_exact_candidate(OLD, NEW, responses.__getitem__)

    def test_failed_spoofed_and_superseded_pair_seals_block(self):
        key = f"/repos/{release.REPOSITORY}/commits/{NEW}/statuses?per_page=100"
        for field, value in (("state", "failure"), ("creator", {"login": "attacker"}),
                             ("target_url", "https://example.invalid/runs/42"),
                             ("description", "missing digests")):
            responses = api_responses()
            bad = {**responses[key][0], field: value}
            responses[key].insert(0, bad)
            with self.subTest(field=field), self.assertRaises(release.ReleaseContractError):
                release.verify_exact_candidate(OLD, NEW, responses.__getitem__)

    def test_publication_run_identity_event_and_result_are_required(self):
        key = f"/repos/{release.REPOSITORY}/actions/runs/42"
        for change in ({"id": 43}, {"event": "push"}, {"head_branch": "dev"},
                       {"path": ".github/workflows/other.yml"}, {"status": "in_progress"},
                       {"conclusion": "failure"}, {"repository": {"full_name": "other/repo"}}):
            responses = api_responses()
            responses[key].update(change)
            with self.subTest(change=change), self.assertRaises(release.ReleaseContractError):
                release.verify_exact_candidate(OLD, NEW, responses.__getitem__)

    def test_newest_exact_main_ci_failure_overrides_older_success(self):
        responses = api_responses()
        key = next(key for key in responses if "/workflows/ci.yml/" in key)
        rows = responses[key]["workflow_runs"]
        rows.append({**rows[0], "id": 50, "conclusion": "failure"})
        with self.assertRaisesRegex(release.ReleaseContractError, "latest exact main CI"):
            release.verify_exact_candidate(OLD, NEW, responses.__getitem__)

    def test_duplicate_ci_identity_with_conflicting_result_rejects(self):
        responses = api_responses()
        key = next(key for key in responses if "/workflows/ci.yml/" in key)
        rows = responses[key]["workflow_runs"]
        rows.append({**rows[0], "conclusion": "failure"})
        with self.assertRaisesRegex(release.ReleaseContractError, "duplicate"):
            release.verify_exact_candidate(OLD, NEW, responses.__getitem__)

    def test_other_branch_or_other_sha_ci_cannot_authenticate_candidate(self):
        for change in ({"head_branch": "dev"}, {"head_sha": OLD}, {"event": "pull_request"}):
            responses = api_responses()
            key = next(key for key in responses if "/workflows/ci.yml/" in key)
            responses[key]["workflow_runs"][0].update(change)
            with self.subTest(change=change), self.assertRaises(release.ReleaseContractError):
                release.verify_exact_candidate(OLD, NEW, responses.__getitem__)


class RuntimeObjectTests(unittest.TestCase):
    def test_exact_bytes_are_bound_to_path_size_and_git_object(self):
        raw = b"reviewed runtime file\n"
        calls = []
        def fetch(path):
            calls.append(path)
            name = path.split("/contents/", 1)[1].split("?")[0]
            return {"type": "file", "path": name, "encoding": "base64", "size": len(raw),
                    "content": base64.b64encode(raw).decode() + "\n",
                    "sha": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()}
        result = plan.fetch_runtime_files(NEW, fetch)
        self.assertEqual(result, dict.fromkeys(plan.RUNTIME_FILES, raw))
        self.assertTrue(all(call.endswith("?ref=" + NEW) for call in calls))

    def test_symlink_wrong_object_and_truncated_or_invalid_content_reject(self):
        raw = b"x"
        good = {"type": "file", "path": plan.RUNTIME_FILES[0], "encoding": "base64",
                "size": 1, "content": "eA==",
                "sha": hashlib.sha1(b"blob 1\0x").hexdigest()}
        for change in ({"type": "symlink"}, {"path": "other"}, {"size": 2},
                       {"sha": OLD}, {"encoding": "none"}, {"content": "!!!"}):
            with self.subTest(change=change), self.assertRaises(release.ReleaseContractError):
                plan.fetch_runtime_files(NEW, lambda _: {**good, **change})

    def test_runtime_contract_change_requires_platform_update(self):
        installed = dict.fromkeys(plan.RUNTIME_FILES, b"same")
        self.assertEqual(set(plan.runtime_contract(installed, installed)), set(plan.RUNTIME_FILES))
        for path in plan.RUNTIME_FILES:
            with self.subTest(path=path), self.assertRaisesRegex(
                release.ReleaseContractError, "NEEDS_PLATFORM_UPDATE"
            ):
                plan.runtime_contract(installed, {**installed, path: b"changed"})

    def test_image_inventory_must_match_complete_independently_pinned_source_tree(self):
        inventory = plan.migration_inventory(SQL)
        tree = git_tree(inventory)
        plan.verify_migration_objects(inventory, tree, expected_tree_sha=TREE)
        for change in ({"truncated": True}, {"sha": OLD}, {"tree": tree["tree"][:-1]}):
            with self.subTest(change=change), self.assertRaises(release.ReleaseContractError):
                plan.verify_migration_objects(inventory, {**tree, **change}, expected_tree_sha=TREE)
        changed = copy.deepcopy(tree)
        changed["tree"][0]["mode"] = "120000"
        with self.assertRaises(release.ReleaseContractError):
            plan.verify_migration_objects(inventory, changed, expected_tree_sha=TREE)

    def test_sql_hash_is_from_original_bytes_and_file_names_cannot_escape(self):
        inventory = plan.migration_inventory(SQL)
        self.assertEqual(inventory[0]["sha256"], hashlib.sha256(next(iter(SQL.values()))).hexdigest())
        for bad in ({"../escape": b"SQL"}, {"valid": ""}, {"valid": b""}):
            with self.subTest(bad=bad), self.assertRaises(release.ReleaseContractError):
                plan.migration_inventory(bad)


class DeploymentPlanTests(unittest.TestCase):
    def test_plan_roundtrip_is_canonical_review_only_and_detached_from_inputs(self):
        arguments = inputs()
        raw = plan.create_plan(created_at=NOW, **arguments)
        value = json.loads(raw)
        plan.validate_plan(raw, value["planId"])
        self.assertIs(value["canExecute"], False)
        arguments["candidate"]["images"]["sanq-api"]["digest"] = "sha256:" + "f" * 64
        self.assertEqual(json.loads(raw)["candidate"]["images"]["sanq-api"]["digest"], DIGEST)

    def test_repeated_builds_are_identical_and_secret_values_are_not_fields(self):
        self.assertEqual(prepared()[0], prepared()[0])
        arguments = inputs()
        arguments["environment"]["JWT_SECRET"] = "fixture-value"
        with self.assertRaisesRegex(release.ReleaseContractError, "fields differ"):
            prepared(**arguments)

    def test_tampering_even_with_recomputed_self_hash_needs_original_plan_pin(self):
        raw, original = prepared()
        value = json.loads(raw)
        value["candidate"]["images"]["sanq-api"]["digest"] = "sha256:" + "f" * 64
        changed_body = {key: item for key, item in value.items() if key != "planId"}
        encoded_body = json.dumps(changed_body, sort_keys=True, separators=(",", ":")).encode()
        value["planId"] = hashlib.sha256(encoded_body).hexdigest()
        changed = json.dumps(value, sort_keys=True, separators=(",", ":")).encode() + b"\n"
        with self.assertRaisesRegex(release.ReleaseContractError, "plan id mismatch"):
            plan.validate_plan(changed, original)

    def test_duplicate_json_unknown_fields_noncanonical_bytes_and_execution_flag_reject(self):
        raw, pin = prepared()
        duplicate = raw.replace(b'"planId":', b'"planId":"duplicate","planId":', 1)
        with self.assertRaises(release.ReleaseContractError):
            plan.validate_plan(duplicate, pin)
        with self.assertRaisesRegex(release.ReleaseContractError, "noncanonical"):
            plan.validate_plan(b" " + raw, pin)
        for change in ({"schemaVersion": True}, {"canExecute": True}, {"approved": True}):
            value = json.loads(raw)
            value.update(change)
            altered = json.dumps(value, sort_keys=True, separators=(",", ":")).encode() + b"\n"
            with self.subTest(change=change), self.assertRaises(release.ReleaseContractError):
                plan.validate_plan(altered, pin)

    def test_bad_candidate_pair_reference_or_missing_image_reject(self):
        arguments = inputs()
        arguments["candidate"]["images"]["sanq-api"]["ref"] = "ghcr.io/sanqin888/sanq-api:latest"
        with self.assertRaises(release.ReleaseContractError):
            prepared(**arguments)
        arguments = inputs()
        del arguments["candidate"]["images"]["sanq-web"]
        with self.assertRaises(release.ReleaseContractError):
            prepared(**arguments)

    def test_pending_names_order_and_hashes_must_match_exact_sql(self):
        arguments = inputs()
        for pending in ([], [{"name": arguments["pending"][0]["name"], "sha256": PIN}],
                        arguments["pending"] * 2):
            with self.subTest(pending=pending), self.assertRaises(release.ReleaseContractError):
                prepared(pending=pending)

    def test_failed_modified_duplicate_or_nonprefix_database_history_reject(self):
        inventory = inputs()["inventory"]
        original = inputs()["history"][0]
        for history in ([{**original, "state": "failed"}], [{**original, "sha256": PIN}],
                        [original, original],
                        [{"name": inventory[1]["name"], "sha256": inventory[1]["sha256"],
                          "state": "applied"}]):
            with self.subTest(history=history), self.assertRaises(release.ReleaseContractError):
                prepared(history=history)

    def test_clean_and_rolled_back_histories_keep_exact_pending_semantics(self):
        arguments = inputs()
        arguments["history"].append({"name": arguments["inventory"][1]["name"],
                                     "sha256": PIN, "state": "rolled-back"})
        raw, pin = prepared(**arguments)
        self.assertEqual(len(plan.validate_plan(raw, pin)["pendingMigrations"]), 1)
        arguments = inputs()
        arguments["history"] = [{"name": item["name"], "sha256": item["sha256"],
                                 "state": "applied"} for item in arguments["inventory"]]
        raw, pin = prepared(**{**arguments, "pending": []})
        self.assertEqual(plan.validate_plan(raw, pin)["pendingMigrations"], [])

    def test_backup_future_expiry_bad_identity_and_invalid_integer_reject(self):
        backup = inputs()["backup"]
        for change in ({"modifiedAt": "2026-10-25T13:00:00Z"},
                       {"modifiedAt": "2026-10-26T17:00:00Z"}, {"bytes": True},
                       {"fileName": "../backup.sql.gz"}, {"modifiedAt": "2026-10-26Z"}):
            with self.subTest(change=change), self.assertRaises(release.ReleaseContractError):
                prepared(backup={**backup, **change})

    def test_environment_missing_keys_and_duplicate_inventory_reject(self):
        with self.assertRaises(release.ReleaseContractError):
            prepared(environment={"requiredKeys": ["DB_USER"], "missingKeys": ["DB_USER"]})
        with self.assertRaises(release.ReleaseContractError):
            prepared(inventory=inputs()["inventory"] * 2)

    def test_fresh_observation_change_or_stale_backup_invalidates_plan(self):
        raw, pin = prepared()
        plan.assert_same_observations(raw, pin, observed_at=NOW, **inputs())
        for key in ("configurationSha256", "releaseStateSha256", "manifestSha256"):
            arguments = inputs()
            arguments["current"][key] = "f" * 64
            with self.subTest(key=key), self.assertRaisesRegex(
                release.ReleaseContractError, "baseline changed"
            ):
                plan.assert_same_observations(raw, pin, observed_at=NOW, **arguments)
        for now in ("2026-10-27T18:00:00Z", "2026-10-26T14:00:00Z"):
            with self.subTest(now=now), self.assertRaises(release.ReleaseContractError):
                plan.assert_same_observations(raw, pin, observed_at=now, **inputs())

    def test_fractional_utc_and_bounded_raw_input(self):
        raw = plan.create_plan(created_at="2026-10-26T16:00:00.123456Z", **inputs())
        plan.validate_plan(raw, json.loads(raw)["planId"])
        with self.assertRaises(release.ReleaseContractError):
            plan.validate_plan(b"x" * (plan.MAX_PLAN_BYTES + 1), PIN)


if __name__ == "__main__":
    unittest.main()
