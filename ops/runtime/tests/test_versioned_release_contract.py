"""C5-B2B1 offline historical publishing proof and version transition contracts."""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNTIME))
import build_bundle
import stage_bundle

SPEC = importlib.util.spec_from_file_location(
    "sanq_versioned_release", RUNTIME / "versioned_release_contract.py"
)
assert SPEC and SPEC.loader
v = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(v)

OLD = "a" * 40
NEW = "b" * 40
OLDER = "9" * 40
RUN_ID = 9001
IMAGE_DIGEST = "sha256:" + "d" * 64
PUB_URL = "https://github.com/sanqin888/sanqinMVP/actions/runs/9001"


def proof(sha=OLD):
    return {
        "schemaVersion": 1, "sourceBranch": "main", "sourceSha": sha,
        "ciRunId": 300, "publishRunId": RUN_ID,
        "verifiedAt": "2026-10-08T00:00:00Z",
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{sha}",
                "digest": IMAGE_DIGEST, "requiredPlatform": "linux/amd64",
            } for name in ("sanq-api", "sanq-web")
        },
    }


def bundle(sha=OLD):
    files = {
        name: (
            json.dumps(stage_bundle.LAYOUT_V1).encode()
            if name == stage_bundle.LAYOUT_FILE
            else f"file {name} {sha}".encode()
        ) for name in build_bundle.SOURCE_FILES
    }
    return build_bundle.encode_bundle(files, build_bundle.manifest_for_proof(proof(sha), files))


def status(context, description, *, state="success", run=PUB_URL, actor="github-actions[bot]"):
    return {
        "context": context, "description": description, "state": state,
        "target_url": run, "creator": {"login": actor},
    }


def successful_fetch(data, sha=OLD, *, pair=None, runtime=None, workflow=None, compare=None):
    statuses = [
        runtime if runtime is not None else status(v.RUNTIME_CONTEXT, v._sha256(data)),
        pair if pair is not None else status(
            v.RELEASE_CONTEXT, "a:" + "d" * 64 + " w:" + "d" * 64
        ),
    ]
    def fetch(path):
        if path == f"/repos/sanqin888/sanqinMVP/compare/{sha}...main":
            return compare if compare is not None else {
                "status": "ahead", "behind_by": 0,
                "merge_base_commit": {"sha": sha},
            }
        if path == f"/repos/sanqin888/sanqinMVP/commits/{sha}/statuses?per_page=100":
            return statuses
        if path == "/repos/sanqin888/sanqinMVP/actions/runs/9001":
            return workflow if workflow is not None else {
                "id": RUN_ID, "name": "publish-images",
                "event": "workflow_run", "status": "completed",
                "conclusion": "success",
                "repository": {"full_name": "sanqin888/sanqinMVP"},
            }
        raise AssertionError("unexpected GitHub request: " + path)
    return fetch


class HistoricalRuntimeTests(unittest.TestCase):
    def test_exact_historical_main_sha_not_only_latest(self):
        data = bundle()
        verified = v.verify_historical_release(
            data, OLD, fetch=successful_fetch(data)
        )
        self.assertEqual(verified["sourceSha"], OLD)
        self.assertEqual(verified["images"]["sanq-api"]["digest"], IMAGE_DIGEST)
        self.assertTrue(verified["historical"])
        self.assertFalse(verified["productionActivationAuthorized"])

    def test_old_main_commit_with_explicit_identical_comparison_is_valid(self):
        data = bundle()
        compare = {
            "status": "identical", "behind_by": 0,
            "merge_base_commit": {"sha": OLD},
        }
        v.verify_historical_release(
            data, OLD, fetch=successful_fetch(data, compare=compare)
        )

    def test_diverged_or_missing_main_ancestry_blocks_history(self):
        data = bundle()
        for bad in (
            {"status": "diverged", "behind_by": 2, "merge_base_commit": {"sha": OLDER}},
            {"status": "ahead", "behind_by": 0, "merge_base_commit": {"sha": OLDER}},
            {"status": "behind", "behind_by": 1, "merge_base_commit": {"sha": OLD}},
            {},
        ):
            with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "ancestor"):
                v.verify_historical_release(data, OLD, fetch=successful_fetch(data, compare=bad))

    def test_wrong_runtime_archive_sha_or_repacked_bytes_block(self):
        original = bundle()
        changed = bundle(NEW)
        with self.assertRaises(ValueError):
            v.verify_historical_release(changed, OLD, fetch=successful_fetch(original))
        different = status(v.RUNTIME_CONTEXT, v._sha256(changed))
        with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "digest mismatch"):
            v.verify_historical_release(original, OLD,
                fetch=successful_fetch(original, runtime=different))

    def test_both_seals_must_be_latest_successful_bot_same_run(self):
        data = bundle()
        original = status(v.RELEASE_CONTEXT, "a:" + "d" * 64 + " w:" + "d" * 64)
        for bad in (
            status(v.RELEASE_CONTEXT, original["description"], state="failure"),
            status(v.RELEASE_CONTEXT, original["description"], actor="another-user"),
            status(v.RELEASE_CONTEXT, original["description"], run="https://example.org"),
            status(v.RELEASE_CONTEXT, "a:" + "d" * 64 + " w:" + "c" * 64),
        ):
            with self.assertRaises(v.HistoricalReleaseBlocked):
                v.verify_historical_release(data, OLD,
                    fetch=successful_fetch(data, pair=bad))
        for bad in (
            status(v.RUNTIME_CONTEXT, v._sha256(data), state="pending"),
            status(v.RUNTIME_CONTEXT, v._sha256(data), actor="fake-bot"),
            status(v.RUNTIME_CONTEXT, v._sha256(data), run="https://github.com/sanqin888/sanqinMVP/actions/runs/9002"),
        ):
            with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "status"):
                v.verify_historical_release(data, OLD,
                    fetch=successful_fetch(data, runtime=bad))

    def test_stale_success_does_not_override_newest_failed_status(self):
        data = bundle()
        original_fetch = successful_fetch(data)
        def fetch(path):
            response = original_fetch(path)
            if "/statuses?" in path:
                return [
                    status(v.RUNTIME_CONTEXT, v._sha256(data), state="failure"),
                    status(v.RUNTIME_CONTEXT, v._sha256(data)),
                    status(v.RELEASE_CONTEXT, "a:" + "d" * 64 + " w:" + "d" * 64),
                ]
            return response
        with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "status"):
            v.verify_historical_release(data, OLD, fetch=fetch)

    def test_failed_wrong_or_foreign_publisher_blocks(self):
        data = bundle()
        good = successful_fetch(data)("/repos/sanqin888/sanqinMVP/actions/runs/9001")
        for bad in (
            {**good, "name": "other-workflow"},
            {**good, "event": "push"},
            {**good, "conclusion": "failure"},
            {**good, "repository": {"full_name": "other/repo"}},
            {**good, "id": 9},
        ):
            with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "workflow identity"):
                v.verify_historical_release(data, OLD,
                    fetch=successful_fetch(data, workflow=bad))

    def test_absent_release_status_blocks(self):
        data = bundle()
        def fetch(path):
            if "/statuses?" in path:
                return []
            return successful_fetch(data)(path)
        with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "status"):
            v.verify_historical_release(data, OLD, fetch=fetch)

    def test_transition_planner_never_authorizes_production(self):
        first = v.verify_historical_release(bundle(OLD), OLD,
                                             fetch=successful_fetch(bundle(OLD)))
        second = v.verify_historical_release(bundle(NEW), NEW,
                                            fetch=successful_fetch(bundle(NEW), NEW))
        def compare(path):
            self.assertEqual(path, f"/repos/sanqin888/sanqinMVP/compare/{OLD}...{NEW}")
            return {"status": "ahead", "behind_by": 0,
                    "merge_base_commit": {"sha": OLD}}
        deploy = v.version_transition_contract(
            "deploy", first, second,
            {"current": OLD, "previous": OLDER, "phase": "active"},
            fetch=compare,
        )
        self.assertFalse(deploy["authorizedToMutateProduction"])
        self.assertFalse(deploy["readyToDeploy"])
        self.assertEqual(deploy["preservedDatabaseVolume"], "sanq-app_pgdata")
        rollback = v.version_transition_contract(
            "rollback", second, first,
            {"current": NEW, "previous": OLD, "phase": "pending"},
            fetch=lambda path: self.fail("rollback must not query forward branch"),
        )
        self.assertEqual(rollback["to"], OLD)
        self.assertFalse(rollback["readyToRollback"])

    def test_pending_deploy_divergence_and_wrong_rollback_block(self):
        first = v.verify_historical_release(bundle(OLD), OLD,
                                             fetch=successful_fetch(bundle(OLD)))
        second = v.verify_historical_release(bundle(NEW), NEW,
                                            fetch=successful_fetch(bundle(NEW), NEW))
        with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "pending"):
            v.version_transition_contract(
                "deploy", first, second,
                {"current": OLD, "previous": OLDER, "phase": "pending"})
        with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "previous"):
            v.version_transition_contract(
                "rollback", second, first,
                {"current": NEW, "previous": OLDER, "phase": "active"})
        with self.assertRaisesRegex(v.HistoricalReleaseBlocked, "strict main descendant"):
            v.version_transition_contract(
                "deploy", first, second,
                {"current": OLD, "previous": OLDER, "phase": "active"},
                fetch=lambda path: {
                    "status": "diverged", "behind_by": 1,
                    "merge_base_commit": {"sha": OLDER},
                })


if __name__ == "__main__":
    unittest.main()
