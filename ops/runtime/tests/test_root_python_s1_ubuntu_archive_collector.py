"""Offline negative tests for S1 operator-side Ubuntu Archive signature evidence.

No network, no gpgv process and no real Ubuntu key material are used.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import root_python_s1_ubuntu_archive_collector as s1


def _release(pocket="noble-security", days=0, valid_days=1):
    now = datetime.now(timezone.utc)
    return (
        f"Origin: Ubuntu\nSuite: {pocket}\nCodename: noble\n"
        f"Architectures: amd64 arm64\n"
        f"Date: {format_datetime(now + timedelta(days=days))}\n"
        f"Valid-Until: {format_datetime(now + timedelta(days=valid_days))}\n"
        "SHA256:\n"
    ).encode()


def _validsig(fpr="F6ECB3762474EDA9D21B7022871920D1991BC93C"):
    return (b"[GNUPG:] GOODSIG 871920D1991BC93C Ubuntu Archive\n"
            + ("[GNUPG:] VALIDSIG " + fpr
               + " 2026-10-18 1792300000 0 4 0 1 8 00 " + fpr
               + "\n").encode())


class S1CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.parent = Path(self.temp.name)
        self.key = self.parent / "preapproved.gpg"
        self.key.write_bytes(b"synthetic-keyring-only")
        self.key.chmod(0o600)
        self.sha = hashlib.sha256(self.key.read_bytes()).hexdigest()
        self.fpr = "F6ECB3762474EDA9D21B7022871920D1991BC93C"
        self.out = self.parent / "evidence-new"

    def collect(self, release=None, signature=b"FAKE-SIGNATURE",
                stdout=None, returncode=0, fetch_exc=None):
        release = _release() if release is None else release
        stdout = _validsig(self.fpr) if stdout is None else stdout
        def fetch(_pocket, filename, _limit):
            if fetch_exc is not None:
                raise fetch_exc
            return release if filename == "Release" else signature
        with mock.patch.object(s1, "_download", side_effect=fetch), \
             mock.patch.object(s1.shutil, "which", return_value="/usr/bin/gpgv"), \
             mock.patch.object(s1.subprocess, "run",
                               return_value=subprocess.CompletedProcess(
                                   ["gpgv"], returncode,
                                   stdout=stdout, stderr=b"test stderr")):
            return s1.collect("noble-security", str(self.key), self.sha,
                              self.fpr, str(self.out))

    def test_faux_positive_s1_still_blocked_with_exact_flags(self):
        data = self.collect()
        self.assertTrue(data["collectionCompleted"])
        self.assertTrue(data["signatureCryptographicallyValidUnderProvidedKeyring"])
        self.assertFalse(data["trustedKeyringAuthenticatedByIndependentWitness"])
        self.assertFalse(data["officialArchiveMetadataAuthenticated"])
        self.assertFalse(data["guestRootEvidenceCaptured"])
        self.assertFalse(data["readyToInstall"])
        self.assertFalse(data["authorizedToMutateProduction"])
        self.assertEqual("BLOCKED", data["decision"])
        self.assertEqual(data, json.loads((self.out / "receipt.json").read_text()))
        for name in ("trusted-keyring.gpg", "Release", "Release.gpg",
                     "gpgv.stdout", "gpgv.stderr", "receipt.json"):
            self.assertTrue((self.out / name).is_file())
            self.assertEqual(0o600, stat.S_IMODE((self.out / name).stat().st_mode))
        self.assertEqual(0o700, stat.S_IMODE(self.out.stat().st_mode))

    def test_wrong_keyring_digest_fails_before_evidence_directory(self):
        with self.assertRaises(s1.S1Blocked):
            s1.collect("noble-security", str(self.key), "0" * 64,
                       self.fpr, str(self.out))
        self.assertFalse(self.out.exists())

    def test_unapproved_pocket_rejected(self):
        with self.assertRaises(s1.S1Blocked):
            s1.collect("focal", str(self.key), self.sha,
                       self.fpr, str(self.out))

    def test_unapproved_signer_rejected(self):
        with self.assertRaises(s1.S1Blocked):
            s1.collect("noble-security", str(self.key), self.sha,
                       "843938DF228D22F7B3742BC0D94AA3F0EFE21092",
                       str(self.out))

    def test_keyring_symlink_rejected(self):
        link = self.parent / "link.gpg"
        link.symlink_to(self.key)
        with self.assertRaises(OSError):
            s1.collect("noble-security", str(link), self.sha,
                       self.fpr, str(self.out))

    def test_world_writable_keyring_rejected(self):
        self.key.chmod(0o666)
        with self.assertRaises(s1.S1Blocked):
            s1.collect("noble-security", str(self.key), self.sha,
                       self.fpr, str(self.out))

    def test_evidence_directory_must_be_new(self):
        self.out.mkdir()
        with self.assertRaises(s1.S1Blocked):
            self.collect()

    def test_evidence_parent_must_be_private(self):
        self.parent.chmod(0o755)
        self.addCleanup(lambda: self.parent.chmod(0o700))
        with self.assertRaises(s1.S1Blocked):
            self.collect()

    def test_gpgv_binary_missing_fails_before_download(self):
        with mock.patch.object(s1.shutil, "which", return_value=None):
            with self.assertRaises(s1.S1Blocked):
                s1.collect("noble-security", str(self.key), self.sha,
                           self.fpr, str(self.out))
        self.assertFalse(self.out.exists())

    def test_bad_gpgv_exit_is_blocked_and_evidence_kept(self):
        data = self.collect(returncode=1)
        self.assertFalse(data["collectionCompleted"])
        self.assertEqual(1, data["gpgvExitCode"])
        self.assertTrue((self.out / "Release").exists())
        self.assertFalse(data["signatureCryptographicallyValidUnderProvidedKeyring"])

    def test_wrong_signer_is_blocked(self):
        other = "790BC7277767219C42C86F933B4FE6ACC0B21F32"
        data = self.collect(stdout=_validsig(other))
        self.assertFalse(data["collectionCompleted"])
        self.assertEqual("BLOCKED", data["decision"])

    def test_missing_validsig_is_blocked(self):
        data = self.collect(stdout=b"[GNUPG:] GOODSIG unknown\n")
        self.assertFalse(data["collectionCompleted"])

    def test_duplicate_validsig_is_blocked(self):
        status = _validsig(self.fpr)
        data = self.collect(stdout=status + status)
        self.assertFalse(data["collectionCompleted"])

    def test_expired_release_is_blocked(self):
        data = self.collect(release=_release(valid_days=-1))
        self.assertFalse(data["collectionCompleted"])

    def test_release_future_date_is_blocked(self):
        data = self.collect(release=_release(days=2, valid_days=3))
        self.assertFalse(data["collectionCompleted"])

    def test_other_suite_signed_release_is_blocked(self):
        data = self.collect(release=_release(pocket="noble-updates"))
        self.assertFalse(data["collectionCompleted"])

    def test_missing_architecture_is_blocked(self):
        data = self.collect(release=_release().replace(b"amd64 arm64", b"arm64"))
        self.assertFalse(data["collectionCompleted"])

    def test_missing_date_is_blocked(self):
        data = self.collect(release=_release().replace(b"Date: ", b"Time: "))
        self.assertFalse(data["collectionCompleted"])

    def test_archive_network_error_retains_failure_receipt(self):
        data = self.collect(fetch_exc=urllib.error.URLError("network offline"))
        self.assertFalse(data["collectionCompleted"])
        self.assertEqual("URLError", data["errorType"])
        self.assertTrue((self.out / "receipt.json").is_file())

    def test_redirect_not_accepted_by_transport(self):
        handler = s1._NoRedirect()
        with self.assertRaises(s1.S1Blocked):
            handler.redirect_request(None, None, 302, "Moved", {}, "https://example.org")

    def test_invalid_release_field_exceptions_do_not_become_pass(self):
        data = self.collect(release=b"\xff")
        self.assertFalse(data["collectionCompleted"])

    def test_gpgv_output_overflow_is_blocked(self):
        data = self.collect(stdout=b"a" * 65537)
        self.assertFalse(data["collectionCompleted"])
        self.assertFalse(data["signatureCryptographicallyValidUnderProvidedKeyring"])


if __name__ == "__main__":
    unittest.main()
