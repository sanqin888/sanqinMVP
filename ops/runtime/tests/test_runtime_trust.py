"""C5-B1 offline Runtime artifact release seal and verifier safety tests."""

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build_bundle  # noqa: E402

SPEC = importlib.util.spec_from_file_location("sanq_runtime_trust_test", ROOT / "runtime_trust.py")
assert SPEC and SPEC.loader
trust = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(trust)

SHA = "a" * 40
OTHER_SHA = "b" * 40
IMG = "sha256:" + "c" * 64
RUN_ID = 4242
URL = "https://github.com/sanqin888/sanqinMVP/actions/runs/4242"


def proof():
    return {
        "schemaVersion": 1,
        "sourceBranch": "main",
        "sourceSha": SHA,
        "ciRunId": 3000,
        "publishRunId": RUN_ID,
        "verifiedAt": "2026-10-08T04:00:00Z",
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{SHA}",
                "digest": IMG,
                "requiredPlatform": "linux/amd64",
            }
            for name in ("sanq-api", "sanq-web")
        },
    }


def archive() -> bytes:
    sources = {name: ("approved " + name).encode() for name in build_bundle.SOURCE_FILES}
    manifest = build_bundle.manifest_for_proof(proof(), sources)
    return build_bundle.encode_bundle(sources, manifest)


def status(context, description, *, actor="github-actions[bot]", state="success", url=URL):
    return {
        "context": context,
        "state": state,
        "creator": {"login": actor},
        "target_url": url,
        "description": description,
    }


def fetch_for_bundle(bundle: bytes, *, status_override=None, paired_override=None,
                     run_override=None):
    pair = status(
        trust.RELEASE_CONTEXT,
        "a:" + "c" * 64 + " w:" + "c" * 64,
    )
    runtime = status(trust.RUNTIME_CONTEXT, trust._sha256(bundle))
    statuses = [runtime if status_override is None else status_override,
                pair if paired_override is None else paired_override]

    def fetch(path):
        if path == "/repos/sanqin888/sanqinMVP/commits?sha=main&per_page=20":
            return [{"sha": SHA}]
        if path == "/repos/sanqin888/sanqinMVP/actions/runs/4242":
            return run_override if run_override is not None else {
                "id": RUN_ID, "name": "publish-images",
                "event": "workflow_run", "status": "completed",
                "conclusion": "success",
                "repository": {"full_name": "sanqin888/sanqinMVP"},
            }
        if path == f"/repos/sanqin888/sanqinMVP/commits/{SHA}/statuses?per_page=100":
            return statuses
        raise AssertionError("unexpected GitHub API access: " + path)

    return fetch


class RuntimeTrustTests(unittest.TestCase):
    def test_same_main_run_both_image_digests_and_external_archive_digest_required(self):
        data = archive()
        got = trust.verify_runtime_publication(data, SHA, fetch=fetch_for_bundle(data))
        self.assertEqual(got["runtimeArchiveDigest"], trust._sha256(data))
        self.assertFalse(got["productionActivationAuthorized"])

    def test_unrelated_or_failed_publishing_workflow_is_rejected(self):
        data = archive()
        good = {
            "id": RUN_ID, "name": "publish-images",
            "event": "workflow_run", "status": "completed",
            "conclusion": "success",
            "repository": {"full_name": "sanqin888/sanqinMVP"},
        }
        for bad in (
            {**good, "name": "untrusted-workflow"},
            {**good, "event": "pull_request"},
            {**good, "conclusion": "failure"},
            {**good, "repository": {"full_name": "someone/else"}},
            {**good, "id": 9999},
        ):
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "workflow identity"):
                trust.verify_runtime_publication(
                    data, SHA, fetch=fetch_for_bundle(data, run_override=bad)
                )

    def test_missing_runtime_seal_and_spoofed_actor_fail_closed(self):
        data = archive()
        def no_seal(path):
            if "commits?sha=" in path:
                return [{"sha": SHA}]
            if "actions/runs/" in path:
                return {
                    "id": RUN_ID, "name": "publish-images", "event": "workflow_run",
                    "status": "completed", "conclusion": "success",
                    "repository": {"full_name": "sanqin888/sanqinMVP"},
                }
            return [status(
                "sanq/paired-images-published",
                "a:" + "c" * 64 + " w:" + "c" * 64,
            )]
        with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "status absent"):
            trust.verify_runtime_publication(data, SHA, fetch=no_seal)
        for wrong in (
            status(trust.RUNTIME_CONTEXT, trust._sha256(data), actor="another-user"),
            status(trust.RUNTIME_CONTEXT, trust._sha256(data), state="failure"),
            status(trust.RUNTIME_CONTEXT, trust._sha256(data), url="https://example.org"),
            status(trust.RUNTIME_CONTEXT, "not-a-digest"),
        ):
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "status absent"):
                trust.verify_runtime_publication(
                    data, SHA, fetch=fetch_for_bundle(data, status_override=wrong)
                )

    def test_tampered_archive_with_unchanged_manifest_is_detected(self):
        data = archive()
        invalid = b"not-a-gzip" + data[10:]
        with self.assertRaises((trust.RuntimeTrustBlocked, build_bundle.BundleBlocked, OSError)):
            trust.verify_runtime_publication(invalid, SHA, fetch=fetch_for_bundle(data))

    def test_repacked_archive_with_valid_new_internal_hashes_fails_external_seal(self):
        data = archive()
        sources = {name: ("attacker content " + name).encode() for name in build_bundle.SOURCE_FILES}
        forged = build_bundle.encode_bundle(
            sources, build_bundle.manifest_for_proof(proof(), sources)
        )
        # Internal self-consistent SHA256 hashes are not proof of publication.
        self.assertEqual(build_bundle.verify_bundle_bytes(forged, SHA)["sourceSha"], SHA)
        with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "independent GitHub SHA256"):
            trust.verify_runtime_publication(forged, SHA, fetch=fetch_for_bundle(data))

    def test_wrong_source_sha_or_publishing_run_or_pair_digest_block(self):
        data = archive()
        with self.assertRaises(ValueError):
            trust.verify_runtime_publication(data, OTHER_SHA, fetch=fetch_for_bundle(data))
        wrong_run = status(
            trust.RUNTIME_CONTEXT, trust._sha256(data),
            url="https://github.com/sanqin888/sanqinMVP/actions/runs/9999",
        )
        with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "status absent"):
            trust.verify_runtime_publication(data, SHA,
                fetch=fetch_for_bundle(data, status_override=wrong_run))
        wrong_pair = status(
            "sanq/paired-images-published",
            "a:" + "c" * 64 + " w:" + "d" * 64
        )
        with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "digest/source mismatch"):
            trust.verify_runtime_publication(data, SHA,
                fetch=fetch_for_bundle(data, paired_override=wrong_pair))

    def test_stale_success_cannot_override_newer_runtime_failure(self):
        data = archive()
        def fetch(path):
            if "commits?sha=" in path:
                return [{"sha": SHA}]
            if "actions/runs/" in path:
                return {
                    "id": RUN_ID, "name": "publish-images", "event": "workflow_run",
                    "status": "completed", "conclusion": "success",
                    "repository": {"full_name": "sanqin888/sanqinMVP"},
                }
            return [
                status(trust.RUNTIME_CONTEXT, trust._sha256(data), state="failure"),
                status(trust.RUNTIME_CONTEXT, trust._sha256(data)),
                status("sanq/paired-images-published", "a:" + "c" * 64 + " w:" + "c" * 64),
            ]
        with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "status absent"):
            trust.verify_runtime_publication(data, SHA, fetch=fetch)

    def test_seal_requires_publishing_workflow_and_preserves_exact_status(self):
        data = archive()
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "token"):
                trust.seal_runtime_archive(proof(), data)
        variables = {
            "GITHUB_ACTIONS": "true",
            "GITHUB_REPOSITORY": "sanqin888/sanqinMVP",
            "GITHUB_WORKFLOW": "publish-images",
            "GITHUB_EVENT_NAME": "workflow_run",
            "GITHUB_RUN_ID": str(RUN_ID),
            "GITHUB_TOKEN": "example-secret",
        }
        writes = []
        def post(path, *, token, payload):
            writes.append((path, token, payload))
            return {"state": "success"}
        with patch.dict(os.environ, variables, clear=True):
            sealed = trust.seal_runtime_archive(proof(), data, post=post)
            self.assertEqual(sealed["sourceSha"], SHA)
            self.assertEqual(len(writes), 1)
            url, token, payload = writes[0]
            self.assertEqual(url, f"/repos/sanqin888/sanqinMVP/statuses/{SHA}")
            self.assertEqual(token, "example-secret")
            self.assertEqual(payload["context"], trust.RUNTIME_CONTEXT)
            self.assertEqual(payload["target_url"], URL)
            self.assertEqual(payload["description"], trust._sha256(data))
            os.environ["GITHUB_WORKFLOW"] = "untrusted-other-workflow"
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "workflow_run identity"):
                trust.seal_runtime_archive(proof(), data, post=post)
            self.assertEqual(len(writes), 1)

    def test_publisher_rejects_repacked_or_wrong_proof(self):
        data = archive()
        sources = {name: ("different " + name).encode() for name in build_bundle.SOURCE_FILES}
        repacked = build_bundle.encode_bundle(
            sources, build_bundle.manifest_for_proof(proof(), sources)
        )
        publisher = {
            "GITHUB_ACTIONS": "true",
            "GITHUB_REPOSITORY": "sanqin888/sanqinMVP",
            "GITHUB_WORKFLOW": "publish-images",
            "GITHUB_EVENT_NAME": "workflow_run",
            "GITHUB_RUN_ID": str(RUN_ID),
            "GITHUB_TOKEN": "fixture-token",
        }
        writes = []
        def post(*args, **kwargs):
            writes.append((args, kwargs))
            return {"state": "success"}
        with patch.dict(os.environ, publisher, clear=True):
            altered_proof = proof()
            altered_proof["images"]["sanq-web"]["digest"] = "sha256:" + "d" * 64
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "digest"):
                trust.seal_runtime_archive(altered_proof, data, post=post)
            # Self-consistent alternate archives need a trusted SHA source
            # comparison at consumer time; B1 publisher itself seals precisely
            # the bytes supplied after C1 build+verification.
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "source/proof"):
                invalid = proof()
                invalid["ciRunId"] += 1
                trust.seal_runtime_archive(invalid, repacked, post=post)
            self.assertEqual(writes, [])

    def test_symlink_or_missing_archive_disallowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "real.tar.gz"
            path.write_bytes(archive())
            alias = root / "alias.tar.gz"
            alias.symlink_to(path)
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "non-symlink"):
                trust._bundle_bytes(alias)
            with self.assertRaisesRegex(trust.RuntimeTrustBlocked, "non-symlink"):
                trust._bundle_bytes(root / "missing.tar.gz")


if __name__ == "__main__":
    unittest.main()
