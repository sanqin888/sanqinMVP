"""Mac A2 local-only sealing tests; no SSH, Guest, strace, or network."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))
try:
    import c1_syn001_mac_seal as m
finally:
    sys.path.pop(0)


class MacSealTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / "imported"
        self.source.mkdir(mode=0o700)
        self.raw = self.source / "raw"
        self.raw.mkdir(mode=0o700)
        self.target = self.base / "private"
        self.target.mkdir(mode=0o700)
        receipt = {"schema": "sanq.runtime.c1-syn001.capture-candidate.v1",
                   "guestExecutionAllowed": False, "traceAuthorized": False,
                   "classification": "LAB_ONLY_NOT_AUTHORIZED",
                   "files": {"stdout.bin": {
                       "bytes": len(b"ordinary lab output\n"),
                       "sha256": hashlib.sha256(b"ordinary lab output\n").hexdigest()},
                             "stderr.bin": {"bytes": 0, "sha256": hashlib.sha256(b"").hexdigest()}}}
        self.receipt_bytes = (json.dumps(receipt, sort_keys=True) + "\n").encode()
        self.receipt = self.source / "receipt.json"
        self.receipt.write_bytes(self.receipt_bytes)
        self.receipt.chmod(0o600)
        self.pin = hashlib.sha256(self.receipt_bytes).hexdigest()
        self.stdout = self.raw / "stdout.bin"
        self.stdout.write_bytes(b"ordinary lab output\n")
        self.stdout.chmod(0o600)
        self.stderr = self.raw / "stderr.bin"
        self.stderr.write_bytes(b"")
        self.stderr.chmod(0o600)

    def test_inspect_only_reports_self_consistency_not_site_authority(self):
        result = m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)
        self.assertEqual(result["members"]["raw/stdout.bin"]["bytes"], 20)
        self.assertFalse(result["guestExecutionAllowed"])
        self.assertEqual(result["classification"], "UNTRUSTED_LOCAL_RAW_MATCHES_PIN_ONLY")

    def test_seal_creates_private_no_overwrite_manifest(self):
        outcome = m.seal(self.source, self.target, expected_receipt_sha256=self.pin)
        folder = Path(outcome["path"])
        self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
        self.assertEqual((folder / "raw/stdout.bin").read_bytes(), b"ordinary lab output\n")
        self.assertIn("raw/stdout.bin", (folder / "SHA256SUMS.txt").read_text())
        self.assertFalse(outcome["siteAuthenticated"])
        with self.assertRaisesRegex(m.SealBlocked, "DESTINATION_ALREADY_EXISTS"):
            m.seal(self.source, self.target, expected_receipt_sha256=self.pin)

    def test_requires_receipt_pin_and_refuses_mismatch(self):
        with self.assertRaisesRegex(m.SealBlocked, "EXTERNAL_RECEIPT_PIN_REQUIRED"):
            m.inspect_candidate(self.source, expected_receipt_sha256="")
        with self.assertRaisesRegex(m.SealBlocked, "RECEIPT_PIN_MISMATCH"):
            m.inspect_candidate(self.source, expected_receipt_sha256="0" * 64)

    def test_extra_source_and_raw_entries_fail(self):
        (self.source / "extra").write_bytes(b"x")
        with self.assertRaisesRegex(m.SealBlocked, "UNEXPECTED_SOURCE_ENTRIES"):
            m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)
        (self.source / "extra").unlink()
        (self.raw / "secret").write_bytes(b"X")
        with self.assertRaisesRegex(m.SealBlocked, "UNKNOWN_RAW_MEMBER"):
            m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)

    def test_missing_stderr_stream_fails_closed(self):
        self.stderr.unlink()
        with self.assertRaisesRegex(m.SealBlocked, "REQUIRED_STREAMS_MISSING"):
            m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)

    def test_symlink_and_weak_permissions_fail(self):
        self.stdout.unlink()
        self.stdout.symlink_to(self.receipt)
        with self.assertRaises((m.SealBlocked, OSError)):
            m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)
        self.stdout.unlink()
        self.stdout.write_bytes(b"abc")
        self.stdout.chmod(0o644)
        with self.assertRaisesRegex(m.SealBlocked, "FILE_UNSAFE"):
            m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)

    def test_self_declared_authorization_is_not_accepted(self):
        obj = json.loads(self.receipt_bytes)
        obj["traceAuthorized"] = True
        raw = (json.dumps(obj, sort_keys=True) + "\n").encode()
        self.receipt.write_bytes(raw)
        with self.assertRaisesRegex(m.SealBlocked, "RECEIPT_AUTHORITY_CLAIM"):
            m.inspect_candidate(self.source, expected_receipt_sha256=hashlib.sha256(raw).hexdigest())

    def test_raw_tampering_fails_even_with_valid_receipt_pin(self):
        self.stdout.write_bytes(b"changed")
        with self.assertRaisesRegex(m.SealBlocked, "RECEIPT_FILE_BYTES_MISMATCH"):
            m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)

    def test_receipt_missing_file_manifest_is_blocked(self):
        obj = json.loads(self.receipt_bytes)
        del obj["files"]
        raw = (json.dumps(obj, sort_keys=True) + "\n").encode()
        self.receipt.write_bytes(raw)
        with self.assertRaisesRegex(m.SealBlocked, "RECEIPT_FILE_MANIFEST_MISMATCH"):
            m.inspect_candidate(self.source, expected_receipt_sha256=hashlib.sha256(raw).hexdigest())

    def test_total_and_member_limits_are_enforced(self):
        with self.assertRaisesRegex(m.SealBlocked, "FILE_UNSAFE_OR_TOO_LARGE"):
            old = m.MAX_MEMBER_BYTES
            try:
                m.MAX_MEMBER_BYTES = 5
                m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)
            finally:
                m.MAX_MEMBER_BYTES = old
        old = m.MAX_RAW_BYTES
        try:
            m.MAX_RAW_BYTES = 5
            with self.assertRaisesRegex(m.SealBlocked, "AGGREGATE_RAW_BUDGET_EXCEEDED"):
                m.inspect_candidate(self.source, expected_receipt_sha256=self.pin)
        finally:
            m.MAX_RAW_BYTES = old

    def test_destination_parent_must_be_private(self):
        self.target.chmod(0o755)
        with self.assertRaisesRegex(m.SealBlocked, "PRIVATE_DIRECTORY_INVALID"):
            m.seal(self.source, self.target, expected_receipt_sha256=self.pin)


if __name__ == "__main__":
    unittest.main()
