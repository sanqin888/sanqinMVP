"""Offline contract tests for SanQ Batch A release discovery and seal safety."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "release_contract.py"
spec = importlib.util.spec_from_file_location("sanq_release_contract", SOURCE)
assert spec is not None and spec.loader is not None
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

SHA_OLD = "a" * 40
SHA_NEW = "b" * 40
DIGEST = "sha256:" + "f" * 64
INDEX = {
    "schemaVersion": 2,
    "mediaType": "application/vnd.oci.image.index.v1+json",
    "digest": DIGEST,
    "manifests": [
        {"digest": DIGEST, "platform": {"os": "unknown", "architecture": "unknown"}},
        {"digest": DIGEST, "platform": {"os": "linux", "architecture": "amd64"}},
    ],
}
SINGLE = {
    "schemaVersion": 2,
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "digest": DIGEST,
}
RUN_URL = "https://github.com/sanqin888/sanqinMVP/actions/runs/123"


def valid_status(state="success", creator="github-actions[bot]"):
    return {
        "context": release.RELEASE_CONTEXT,
        "state": state,
        "creator": {"login": creator},
        "target_url": RUN_URL,
        "created_at": "2026-10-07T20:00:00Z",
    }


def proof():
    return release.create_release_proof(
        source_sha=SHA_NEW,
        ci_run_id=11,
        publish_run_id=12,
        manifests={"sanq-api": INDEX, "sanq-web": INDEX},
        configs={"sanq-api": None, "sanq-web": None},
        generated_at="2026-10-07T20:00:00Z",
    )


class ReleaseContractTests(unittest.TestCase):
    def test_index_pair_produces_reviewable_digest_proof(self):
        result = release.validate_proof(proof())
        self.assertEqual(result["sourceSha"], SHA_NEW)
        self.assertEqual(set(result["images"]), {"sanq-api", "sanq-web"})
        self.assertEqual(result["images"]["sanq-api"]["digest"], DIGEST)
        self.assertEqual(result["images"]["sanq-web"]["requiredPlatform"], "linux/amd64")

    def test_registry_raw_digest_uses_exact_bytes(self):
        raw = b'{"schemaVersion":2, "mediaType":"application/vnd.oci.image.index.v1+json", "manifests":[]}'
        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "raw.json"
            manifest.write_bytes(raw)
            parsed = release.read_registry_manifest(manifest)
            self.assertEqual(parsed["digest"], "sha256:" + hashlib.sha256(raw).hexdigest())
            self.assertEqual(parsed["schemaVersion"], 2)

    def test_rejects_missing_image_or_wrong_sha(self):
        with self.assertRaises(release.ReleaseContractError):
            release.create_release_proof(
                source_sha=SHA_NEW,
                ci_run_id=1,
                publish_run_id=2,
                manifests={"sanq-api": INDEX},
                configs={"sanq-api": None, "sanq-web": None},
                generated_at="2026-10-07T20:00:00Z",
            )
        with self.assertRaises(release.ReleaseContractError):
            release.create_release_proof(
                source_sha="not-a-sha",
                ci_run_id=1,
                publish_run_id=2,
                manifests={"sanq-api": INDEX, "sanq-web": INDEX},
                configs={"sanq-api": None, "sanq-web": None},
                generated_at="2026-10-07T20:00:00Z",
            )

    def test_rejects_wrong_architecture_or_manifest_digest(self):
        wrong_platform = {
            **INDEX,
            "manifests": [{"digest": DIGEST, "platform": {"os": "linux", "architecture": "arm64"}}],
        }
        with self.assertRaisesRegex(release.ReleaseContractError, "linux/amd64"):
            release.inspect_image_manifest(wrong_platform, None, SHA_NEW, "sanq-api")
        with self.assertRaisesRegex(release.ReleaseContractError, "digest"):
            release.inspect_image_manifest({**INDEX, "digest": ""}, None, SHA_NEW, "sanq-web")

    def test_single_image_needs_amd64_config_and_matching_revision_label(self):
        config = {
            "os": "linux",
            "architecture": "amd64",
            "config": {"Labels": {"org.opencontainers.image.revision": SHA_NEW}},
        }
        result = release.inspect_image_manifest(SINGLE, config, SHA_NEW, "sanq-api")
        self.assertEqual(result["digest"], DIGEST)
        with self.assertRaisesRegex(release.ReleaseContractError, "unverified"):
            release.inspect_image_manifest(SINGLE, None, SHA_NEW, "sanq-api")
        with self.assertRaisesRegex(release.ReleaseContractError, "revision label"):
            release.inspect_image_manifest(
                SINGLE,
                {**config, "config": {"Labels": {"org.opencontainers.image.revision": SHA_OLD}}},
                SHA_NEW,
                "sanq-api",
            )

    def test_proof_rejects_one_image_missing_and_tampered_fields(self):
        data = proof()
        del data["images"]["sanq-web"]
        with self.assertRaisesRegex(release.ReleaseContractError, "API and Web"):
            release.validate_proof(data)
        data = proof()
        data["images"]["sanq-web"]["ref"] = "ghcr.io/sanqin888/sanq-web:latest"
        with self.assertRaisesRegex(release.ReleaseContractError, "reference"):
            release.validate_proof(data)
        data = proof()
        data["images"]["sanq-api"]["digest"] = "sha256:invalid"
        with self.assertRaisesRegex(release.ReleaseContractError, "digest"):
            release.validate_proof(data)

    def test_discover_newest_sealed_main_commit_not_unsealed_head(self):
        calls = []
        def fake_fetch(path):
            calls.append(path)
            if path.endswith("commits?sha=main&per_page=20"):
                return [{"sha": SHA_NEW}, {"sha": SHA_OLD}]
            if f"/{SHA_NEW}/" in path:
                return []
            if f"/{SHA_OLD}/" in path:
                return [valid_status()]
            raise AssertionError(path)
        result = release.discover_release(fake_fetch)
        self.assertEqual(result["sourceSha"], SHA_OLD)
        self.assertEqual(result["publicationUrl"], RUN_URL)
        self.assertEqual(len(calls), 3)

    def test_discover_denies_spoofed_or_failed_seal_and_stale_success(self):
        for bad in [
            valid_status(creator="somebody"),
            valid_status(state="failure"),
            {**valid_status(), "target_url": "https://evil.example/actions/runs/123"},
        ]:
            def fake_fetch(path):
                if "commits?sha" in path:
                    return [{"sha": SHA_NEW}]
                return [bad]
            with self.assertRaisesRegex(release.ReleaseContractError, "no sealed"):
                release.discover_release(fake_fetch)
        def newest_failed(path):
            if "commits?sha" in path:
                return [{"sha": SHA_NEW}]
            return [valid_status(state="failure"), valid_status()]
        with self.assertRaisesRegex(release.ReleaseContractError, "no sealed"):
            release.discover_release(newest_failed)

    def test_discover_fails_closed_on_bad_api_or_truncated_search(self):
        with self.assertRaises(release.ReleaseContractError):
            release.discover_release(lambda _path: {"unexpected": "object"})
        with self.assertRaises(release.ReleaseContractError):
            release.discover_release(lambda _path: [], max_commits=0)

    def test_seal_requires_token_and_only_posts_validated_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            filename = Path(tmp) / "proof.json"
            filename.write_text(json.dumps(proof()), encoding="utf-8")
            args = SimpleNamespace(proof=filename)
            with patch.dict("os.environ", {}, clear=True):
                with self.assertRaisesRegex(release.ReleaseContractError, "token"):
                    release.run_seal(args)
            calls = []
            def fake_github(path, *, token=None, payload=None):
                calls.append((path, token, payload))
                return {"state": "success"}
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_TOKEN": "test-token",
                    "GITHUB_ACTIONS": "true",
                    "GITHUB_REPOSITORY": "sanqin888/sanqinMVP",
                    "GITHUB_RUN_ID": "12",
                },
                clear=True,
            ):
                with patch.object(release, "github_json", side_effect=fake_github):
                    release.run_seal(args)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0], f"/repos/sanqin888/sanqinMVP/statuses/{SHA_NEW}")
            self.assertEqual(calls[0][2]["context"], release.RELEASE_CONTEXT)
            self.assertEqual(calls[0][2]["target_url"], "https://github.com/sanqin888/sanqinMVP/actions/runs/12")
            with patch.dict(
                "os.environ",
                {
                    "GITHUB_TOKEN": "test-token",
                    "GITHUB_ACTIONS": "true",
                    "GITHUB_REPOSITORY": "sanqin888/sanqinMVP",
                    "GITHUB_RUN_ID": "999",
                },
                clear=True,
            ):
                with self.assertRaisesRegex(release.ReleaseContractError, "matching"):
                    release.run_seal(args)


if __name__ == "__main__":
    unittest.main()
