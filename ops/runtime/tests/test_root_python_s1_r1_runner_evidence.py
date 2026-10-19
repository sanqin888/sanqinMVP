"""Offline regression of PR-only S1-R1 wrapper; no network or real GPGV."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import stat
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import root_python_s1_r1_runner_evidence as r1


class RunnerEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "sanq-s1-r1-evidence"
        self.sample_key = b"synthetic public keyring for offline tests"
        self.pin = hashlib.sha256(self.sample_key).hexdigest()
        self.env = {
            "GITHUB_ACTIONS": "true",
            "GITHUB_EVENT_NAME": "pull_request",
            "GITHUB_BASE_REF": "dev",
            "GITHUB_REPOSITORY": "sanqin888/sanqinMVP",
            "PR_HEAD_REPOSITORY": "sanqin888/sanqinMVP",
            "GITHUB_REF": "refs/pull/123/merge",
            "GITHUB_SHA": "a" * 40,
            "PR_HEAD_SHA": "b" * 40,
            "GITHUB_RUN_ID": "123456",
            "GITHUB_RUN_ATTEMPT": "1",
            "RUNNER_TEMP": self.temp.name,
        }

    def _collector_receipt(self, overrides=None):
        data = {
            "collectionCompleted": True,
            "gpgvExitCode": 0,
            "signatureCryptographicallyValidUnderProvidedKeyring": True,
            "trustedKeyringAuthenticatedByIndependentWitness": False,
            "officialArchiveMetadataAuthenticated": False,
            "decision": "BLOCKED",
            "readyToInstall": False,
            "authorizedToMutateProduction": False,
        }
        data.update(overrides or {})
        return data

    def _collect(self, *args, overrides=None):
        self.assertEqual("noble", args[0])
        self.assertEqual(str(self.root / "ubuntu-archive-keyring.gpg"), args[1])
        self.assertEqual(self.pin, args[2])
        self.assertEqual(r1.ARCHIVE_2018_FINGERPRINT, args[3])
        directory = Path(args[4])
        directory.mkdir(mode=0o700)
        record = self._collector_receipt(overrides)
        r1._new_file(directory / "receipt.json",
                     (json.dumps(record) + "\n").encode())
        return record

    def run_capture(self, overrides=None, key=None):
        with (
            mock.patch.object(r1, "CANDIDATE_KEYRING_SHA256", self.pin),
            mock.patch.object(r1, "_fetch_keyring", return_value=(
                self.sample_key if key is None else key)) as fetch,
            mock.patch.object(r1.s1, "collect",
                              side_effect=lambda *args: self._collect(
                                  *args, overrides=overrides)) as collect,
        ):
            result = r1.capture(dict(self.env))
        return result, fetch, collect

    def test_frozen_public_pin_and_archive_signer(self):
        self.assertEqual(
            "80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31",
            r1.CANDIDATE_KEYRING_SHA256)
        self.assertEqual(
            "F6ECB3762474EDA9D21B7022871920D1991BC93C",
            r1.ARCHIVE_2018_FINGERPRINT)
        self.assertEqual("noble", r1.POCKET)
        self.assertEqual(
            "https://archive.ubuntu.com/ubuntu/project/ubuntu-archive-keyring.gpg",
            r1.SOURCE_URL)

    def test_matching_pin_and_real_collector_claim_still_always_blocked(self):
        result, fetch, collector = self.run_capture()
        self.assertEqual(0, result)
        fetch.assert_called_once_with()
        collector.assert_called_once()
        receipt = json.loads((self.root / "runner-receipt.json").read_text())
        self.assertTrue(receipt["collectionCompleted"])
        self.assertEqual("BLOCKED", receipt["decision"])
        for name in ("independentWitnessApproved",
                     "officialArchiveAuthenticatedByIndependentWitness",
                     "authorizedToMutateProduction", "readyToInstall"):
            self.assertIs(receipt[name], False)
        self.assertEqual("a" * 40, receipt["runnerClaimedIdentity"]["checkoutMergeSha"])
        self.assertEqual("b" * 40, receipt["runnerClaimedIdentity"]["prHeadSha"])
        self.assertEqual(r1.SOURCE_URL, receipt["publicKeySource"])
        self.assertEqual(self.pin, receipt["downloadedKeyringSha256"])
        self.assertEqual(self.sample_key, (self.root / "ubuntu-archive-keyring.gpg").read_bytes())
        manifest = (self.root / "sha256-manifest.txt").read_text()
        self.assertIn("runner-receipt.json", manifest)
        self.assertIn("noble/receipt.json", manifest)
        self.assertNotIn("sha256-manifest.txt", manifest)
        for file in self.root.rglob("*"):
            if file.is_file():
                self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)

    def test_mismatching_downloaded_keyring_blocked_before_collector(self):
        result, _, collector = self.run_capture(key=b"attacker candidate")
        self.assertEqual(2, result)
        collector.assert_not_called()
        report = json.loads((self.root / "runner-receipt.json").read_text())
        self.assertEqual("RunnerBlocked", report["failureType"])
        self.assertFalse(report["collectionCompleted"])
        self.assertTrue((self.root / "sha256-manifest.txt").exists())

    def test_negative_collector_result_retained_as_failure(self):
        result, _, _ = self.run_capture(overrides={
            "collectionCompleted": False, "gpgvExitCode": 1,
            "signatureCryptographicallyValidUnderProvidedKeyring": False,
        })
        self.assertEqual(2, result)
        self.assertEqual("RunnerBlocked", json.loads(
            (self.root / "runner-receipt.json").read_text())["failureType"])
        self.assertTrue((self.root / "noble/receipt.json").exists())

    def test_collector_trust_authority_escalation_rejected(self):
        for changes in ({"decision": "PASS"},
                        {"readyToInstall": True},
                        {"authorizedToMutateProduction": True},
                        {"trustedKeyringAuthenticatedByIndependentWitness": True},
                        {"officialArchiveMetadataAuthenticated": True}):
            with self.subTest(changes=changes):
                # Fresh temporary root for every test instance, no overwrite.
                with tempfile.TemporaryDirectory() as p:
                    self.env["RUNNER_TEMP"] = p
                    self.root = Path(p) / "sanq-s1-r1-evidence"
                    rc, _, _ = self.run_capture(overrides=changes)
                    self.assertEqual(2, rc)
                    self.assertFalse(json.loads(
                        (self.root / "runner-receipt.json").read_text())["collectionCompleted"])

    def test_runner_refuses_forks_other_events_bases_and_bad_identity(self):
        changes = (
            ("GITHUB_EVENT_NAME", "push"),
            ("GITHUB_BASE_REF", "main"),
            ("PR_HEAD_REPOSITORY", "other/fork"),
            ("GITHUB_REPOSITORY", "other/repo"),
            ("GITHUB_ACTIONS", "false"),
            ("GITHUB_REF", "refs/heads/dev"),
            ("GITHUB_SHA", "not-a-sha"),
            ("PR_HEAD_SHA", ""),
            ("GITHUB_RUN_ATTEMPT", "0"),
        )
        for name, value in changes:
            with self.subTest(name=name):
                broken = dict(self.env, **{name: value})
                with self.assertRaises(r1.RunnerBlocked):
                    r1.capture(broken)
        self.assertFalse(self.root.exists())

    def test_create_only_no_legacy_evidence_overwrite(self):
        rc, _, _ = self.run_capture()
        self.assertEqual(0, rc)
        previous = (self.root / "runner-receipt.json").read_bytes()
        with self.assertRaises(FileExistsError):
            self.run_capture()
        self.assertEqual(previous, (self.root / "runner-receipt.json").read_bytes())

    def test_keyring_network_failure_keeps_fail_closed_receipt(self):
        with (
            mock.patch.object(r1, "_fetch_keyring",
                              side_effect=OSError("offline")),
            mock.patch.object(r1.s1, "collect") as collector,
        ):
            rc = r1.capture(self.env)
        self.assertEqual(2, rc)
        collector.assert_not_called()
        data = json.loads((self.root / "runner-receipt.json").read_text())
        self.assertEqual("OSError", data["failureType"])
        self.assertEqual("BLOCKED", data["decision"])

    def test_redirect_is_forbidden(self):
        with self.assertRaises(r1.RunnerBlocked):
            r1._NoRedirect().redirect_request(
                None, None, 301, "redirect", {}, "https://example.org/keyring.gpg")

    def test_keyring_budget_and_response_identity_rejected(self):
        class Response:
            status = 200
            def __init__(self, data, url=r1.SOURCE_URL):
                self.data, self.url = data, url
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return None
            def geturl(self):
                return self.url
            def read(self, n):
                return self.data[:n]

        for raw, url in ((b"", r1.SOURCE_URL),
                         (b"x" * (r1.MAX_KEYRING_BYTES + 1), r1.SOURCE_URL),
                         (b"good", "https://example.org/key.gpg")):
            with self.subTest(raw_size=len(raw), url=url):
                opener = mock.Mock()
                opener.open.return_value = Response(raw, url)
                with mock.patch.object(r1.urllib.request, "build_opener", return_value=opener):
                    with self.assertRaises(r1.RunnerBlocked):
                        r1._fetch_keyring()

    def test_workflow_statically_limits_execution_and_permissions(self):
        workflow = (Path(__file__).resolve().parents[3] /
                    r1.WORKFLOW_PATH).read_text()
        self.assertIn("  pull_request:", workflow)
        self.assertIn("branches: [dev]", workflow)
        self.assertIn("permissions:\n  contents: read", workflow)
        self.assertIn("head.repo.full_name == github.repository", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("actions/upload-artifact@v4", workflow)
        self.assertIn("if-no-files-found: error", workflow)
        self.assertIn("ops/runtime/root_python_s1_r1_runner_evidence.py", workflow)
        self.assertNotIn("workflow_dispatch:", workflow)
        self.assertNotIn("pull_request_target:", workflow)
        self.assertNotIn("secrets.", workflow)
        self.assertNotIn("id-token: write", workflow)
        self.assertNotIn("aws-actions", workflow)
        self.assertNotIn("rclone", workflow)
        self.assertIsNone(re.search(r"(?m)^  push:", workflow))


if __name__ == "__main__":
    unittest.main()
