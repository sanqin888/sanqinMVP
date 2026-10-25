"""C5-G2-A: synthetic exact historical main Runtime publication evidence tests.

No actual GitHub requests, remote files, Docker, root privileges, or installations.
"""
from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNTIME))
import build_bundle  # noqa: E402
import historical_runtime_publication as history  # noqa: E402

OLD = "a" * 40
OTHER = "b" * 40
RUN = 4242
CI = 3000
IMAGE_DIGEST = "sha256:" + "c" * 64
URL = "https://github.com/sanqin888/sanqinMVP/actions/runs/4242"


def archive() -> bytes:
    proof = {
        "schemaVersion": 1, "sourceBranch": "main", "sourceSha": OLD,
        "ciRunId": CI, "publishRunId": RUN,
        "verifiedAt": "2026-10-13T11:00:00Z",
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{OLD}",
                "digest": IMAGE_DIGEST, "requiredPlatform": "linux/amd64",
            } for name in ("sanq-api", "sanq-web")
        },
    }
    files = {
        name: ("published " + name).encode()
        for name in build_bundle.SOURCE_FILES
    }
    return build_bundle.encode_bundle(
        files, build_bundle.manifest_for_proof(proof, files))


def sealed(context: str, detail: str, *,
           actor: str = "github-actions[bot]",
           state: str = "success", url: str = URL) -> dict:
    return {
        "context": context, "description": detail,
        "state": state, "creator": {"login": actor},
        "target_url": url,
    }


def fixture_api(data: bytes, *, compare=None, ci=None, publish=None,
                statuses=None):
    run_core = {
        "head_sha": OLD, "head_branch": "main", "status": "completed",
        "conclusion": "success",
        "repository": {"full_name": "sanqin888/sanqinMVP"},
        "head_repository": {"full_name": "sanqin888/sanqinMVP"},
    }
    trusted_ci = {"id": CI, "name": "ci", "event": "push", **run_core}
    trusted_publish = {
        "id": RUN, "name": "publish-images", "event": "workflow_run", **run_core
    }
    digest = "sha256:" + hashlib.sha256(data).hexdigest()
    seals = [
        sealed(history.RUNTIME_CONTEXT, digest),
        sealed(history.RELEASE_CONTEXT, "a:" + "c" * 64 + " w:" + "c" * 64),
    ]
    paths = {
        f"/repos/sanqin888/sanqinMVP/compare/{OLD}...main":
            {"status": "ahead", "behind_by": 0, "base_commit": {"sha": OLD}}
            if compare is None else compare,
        f"/repos/sanqin888/sanqinMVP/actions/runs/{CI}":
            trusted_ci if ci is None else ci,
        f"/repos/sanqin888/sanqinMVP/actions/runs/{RUN}":
            trusted_publish if publish is None else publish,
        f"/repos/sanqin888/sanqinMVP/commits/{OLD}/statuses?per_page=100":
            seals if statuses is None else statuses,
    }
    def fetch(path: str):
        if path not in paths:
            raise AssertionError("unexpected new network/discovery path: " + path)
        return paths[path]
    return fetch


class HistoricalRuntimePublicationTests(unittest.TestCase):
    def test_valid_old_main_source_never_requires_newest_release(self):
        data = archive()
        receipt = history.verify_historical_runtime_publication(
            data, OLD, fetch=fixture_api(data))
        self.assertEqual(receipt["sourceSha"], OLD)
        self.assertEqual(receipt["runtimeArchiveDigest"],
                         "sha256:" + hashlib.sha256(data).hexdigest())
        self.assertTrue(receipt["historicalPublicationVerified"])
        for key in ("readyToInstall", "productionActivationAuthorized",
                    "authorizedToMutateProduction"):
            self.assertFalse(receipt[key])

    def test_non_ancestor_and_forged_compare_fail(self):
        data = archive()
        for comparison in (
            {}, {"status": "diverged", "behind_by": 1,
                 "base_commit": {"sha": OLD}},
            {"status": "ahead", "behind_by": 0,
             "base_commit": {"sha": OTHER}},
            {"status": "ahead", "behind_by": 1,
             "base_commit": {"sha": OLD}},
            {"status": "behind", "behind_by": 1,
             "base_commit": {"sha": OLD}},
        ):
            with self.subTest(comparison=comparison):
                with self.assertRaisesRegex(history.HistoricalPublicationBlocked,
                                            "main ancestry"):
                    history.verify_historical_runtime_publication(
                        data, OLD, fetch=fixture_api(data, compare=comparison))

    def test_source_specific_ci_and_publish_workflows(self):
        data = archive()
        base = {
            "head_sha": OLD, "head_branch": "main",
            "status": "completed", "conclusion": "success",
            "repository": {"full_name": "sanqin888/sanqinMVP"},
            "head_repository": {"full_name": "sanqin888/sanqinMVP"},
        }
        good_ci = {"id": CI, "name": "ci", "event": "push", **base}
        good_pub = {"id": RUN, "name": "publish-images",
                    "event": "workflow_run", **base}
        for bad in (
            {"head_sha": OTHER}, {"head_branch": "dev"},
            {"status": "in_progress"}, {"conclusion": "failure"},
            {"head_repository": {"full_name": "another/repo"}},
            {"repository": {"full_name": "another/repo"}},
            {"id": 123}, {"name": "forged"},
            {"event": "pull_request"},
        ):
            for name in ("ci", "publish"):
                with self.subTest(bad=bad, name=name):
                    run = {**(good_ci if name == "ci" else good_pub), **bad}
                    with self.assertRaisesRegex(
                            history.HistoricalPublicationBlocked,
                            "workflow identity"):
                        history.verify_historical_runtime_publication(
                            data, OLD, fetch=fixture_api(data, **{name: run}))

    def test_failed_or_spoofed_newest_status_blocks(self):
        data = archive()
        digest = "sha256:" + hashlib.sha256(data).hexdigest()
        good_runtime = sealed(history.RUNTIME_CONTEXT, digest)
        good_pair = sealed(
            history.RELEASE_CONTEXT, "a:" + "c" * 64 + " w:" + "c" * 64)
        alternatives = (
            [sealed(history.RUNTIME_CONTEXT, digest, state="failure"),
             good_runtime, good_pair],
            [good_runtime,
             sealed(history.RELEASE_CONTEXT, good_pair["description"],
                    actor="attacker"), good_pair],
            [good_pair],
            [good_runtime],
            [sealed(history.RUNTIME_CONTEXT, digest, url="https://example.org"),
             good_pair],
            [good_runtime,
             sealed(history.RELEASE_CONTEXT, "a:" + "c" * 64 + " w:" + "d" * 64)],
        )
        for statuses in alternatives:
            with self.subTest(statuses=statuses):
                with self.assertRaises(history.HistoricalPublicationBlocked):
                    history.verify_historical_runtime_publication(
                        data, OLD, fetch=fixture_api(data, statuses=statuses))

    def test_repacked_original_bytes_rejected_despite_valid_manifest(self):
        data = archive()
        files = {name: ("different " + name).encode()
                 for name in build_bundle.SOURCE_FILES}
        original_manifest = build_bundle.verify_bundle_bytes(data, OLD)
        repacked = build_bundle.encode_bundle(files, {
            **original_manifest,
            "files": {
                name: {"sha256": hashlib.sha256(value).hexdigest(),
                       "bytes": len(value)}
                for name, value in files.items()
            },
        })
        with self.assertRaisesRegex(
                history.HistoricalPublicationBlocked, "external SHA256"):
            history.verify_historical_runtime_publication(
                repacked, OLD, fetch=fixture_api(data))

    def test_no_install_or_prod_execution_capability(self):
        self.assertFalse(hasattr(history, "install"))
        self.assertFalse(hasattr(history, "activate"))
        self.assertFalse(hasattr(history, "deploy"))
        self.assertFalse(hasattr(history, "rollback"))
        self.assertNotIn("subprocess", history.__dict__)
        self.assertEqual(len(build_bundle.SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/historical_runtime_publication.py",
                         build_bundle.SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
