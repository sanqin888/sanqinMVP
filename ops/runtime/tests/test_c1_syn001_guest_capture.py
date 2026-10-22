"""A2-I lab-only checks. Never call the real SYN-01/SYN-02/strace."""
from pathlib import Path
import os
import stat
import sys
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(MODULE))
try:
    import c1_syn001_guest_capture as c
    import c1_syn001_mac_seal as seal
finally:
    sys.path.pop(0)


@unittest.skipIf(os.geteuid() == 0, "non-root fixture only")
class GuestCaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.sources = self.base / "sources"
        self.sources.mkdir(mode=0o700)
        for name in c.SOURCES:
            original = ("C1-SYN-001-input.txt" if name == "input.txt" else
                        "C1-SYN-001-SYN-01.py.txt" if name == "syn01.py" else
                        "C1-SYN-001-SYN-02.py.txt")
            dest = self.sources / name
            dest.write_bytes((ROOT / "docs" / "architecture" / original).read_bytes())
            dest.chmod(0o400)

    def test_frozen_review_finds_exact_all_sources(self):
        review = c.review_source_tree(self.sources)
        self.assertTrue(review["sourceMatched"])
        self.assertEqual(set(review["files"]), set(c.SOURCES))
        self.assertIs(review["traceAuthorized"], False)
        self.assertIs(review["guestExecutionAllowed"], False)

    def test_modified_source_and_extra_entry_fail(self):
        f = self.sources / "input.txt"
        f.chmod(0o600)
        f.write_bytes(b"X" * 25)
        f.chmod(0o400)
        with self.assertRaisesRegex(c.CaptureBlocked, "SOURCE_BYTES_MISMATCH"):
            c.review_source_tree(self.sources)
        (self.sources / "unexpected").touch()
        with self.assertRaisesRegex(c.CaptureBlocked, "UNEXPECTED_ENTRIES"):
            c.review_source_tree(self.sources)

    def test_symlink_and_unsafe_source_permissions_fail(self):
        f = self.sources / "syn01.py"
        f.chmod(0o600)
        with self.assertRaisesRegex(c.CaptureBlocked, "FILE_IDENTITY_INVALID"):
            c.review_source_tree(self.sources)
        f.unlink()
        f.symlink_to(self.sources / "syn02.py")
        with self.assertRaises((c.CaptureBlocked, OSError)):
            c.review_source_tree(self.sources)

    def test_frozen_scenario_argv_exact_and_unknown_blocked(self):
        a = c.frozen_argv("SYN-02")
        self.assertEqual(a[:7], ("/usr/bin/strace", "-ff", "-ttt", "-T", "-yy", "-s", "128"))
        self.assertEqual(a[-2:], (str(c.ROOT / "syn02.py"), "SYN-02"))
        self.assertEqual(a[9], "/usr/bin/python3.12")
        with self.assertRaises(c.CaptureBlocked):
            c.frozen_argv("SYN-03")

    def test_real_scenario_entry_is_never_enabled(self):
        with self.assertRaisesRegex(c.CaptureBlocked, "NOT_AUTHORIZED"):
            c.run_scenario("SYN-01")
        with self.assertRaisesRegex(c.CaptureBlocked, "REAL_SYN_FORBIDDEN"):
            d = self.base / "output"
            d.mkdir(mode=0o700)
            c._test_fixture_supervisor(("/usr/bin/strace", "-V"), d)

    def test_raw_trace_scan_rejects_symlink_unknown_and_budget(self):
        raw = self.base / "raw"
        raw.mkdir(mode=0o700)
        f = raw / "syn01.trace.123"
        f.write_bytes(b"abc")
        f.chmod(0o600)
        d = c.review_raw(raw, prefix="syn01", uid=os.getuid())
        self.assertEqual(d[f.name]["bytes"], 3)
        with self.assertRaisesRegex(c.CaptureBlocked, "SINGLE_TRACE_LIMIT_EXCEEDED"):
            c.review_raw(raw, prefix="syn01", uid=os.getuid(), single_limit=2)
        f.unlink()
        f.symlink_to(self.sources / "syn02.py")
        with self.assertRaises(c.CaptureBlocked):
            c.review_raw(raw, prefix="syn01", uid=os.getuid())

    def test_lab_captures_both_streams_without_authorization(self):
        output = self.base / "out"
        output.mkdir(mode=0o700)
        argv = (sys.executable, "-c",
                "import sys; print('HELLO'); print('ERROR', file=sys.stderr)")
        r = c._test_fixture_supervisor(argv, output)
        self.assertEqual(r["status"], "LAB_CAPTURED_CANDIDATE_ONLY")
        self.assertEqual((output / "raw" / "stdout.bin").read_bytes(), b"HELLO\n")
        self.assertEqual((output / "raw" / "stderr.bin").read_bytes(), b"ERROR\n")
        self.assertFalse(r["aggregateHardLimitEnforced"])
        self.assertFalse(r["detachedDescendantsExcluded"])
        self.assertFalse(r["traceAuthorized"])

    def test_lab_timeout_is_blocked_and_preserves_partial(self):
        output = self.base / "timeout"
        output.mkdir(mode=0o700)
        argv = (sys.executable, "-c", "import time; print('BEFORE',flush=True); time.sleep(3)")
        r = c._test_fixture_supervisor(argv, output, seconds=0.2)
        self.assertEqual(r["status"], "BLOCKED")
        self.assertIn("WALL_TIMEOUT", r["reasonCodes"])
        self.assertIn(b"BEFORE", (output / "raw" / "stdout.bin").read_bytes())

    def test_lab_overbudget_is_blocked_and_never_silently_passes(self):
        output = self.base / "budget"
        output.mkdir(mode=0o700)
        argv = (sys.executable, "-c", "import sys; sys.stdout.write('X'*20000); sys.stdout.flush()")
        r = c._test_fixture_supervisor(argv, output, total_limit=1000)
        self.assertEqual(r["status"], "BLOCKED")
        self.assertIn("RAW_LIMIT_EXCEEDED_PARTIAL_RETAINED", r["reasonCodes"])
        self.assertFalse(r["captureFullyPreserved"])

    def test_guest_lab_receipt_can_be_sealed_only_with_external_pin(self):
        import hashlib
        output = self.base / "imported"
        output.mkdir(mode=0o700)
        r = c._test_fixture_supervisor(
            (sys.executable, "-c", "print('INTEGRATION')"), output)
        self.assertEqual(r["status"], "LAB_CAPTURED_CANDIDATE_ONLY")
        receipt = (output / "receipt.json").read_bytes()
        pin = hashlib.sha256(receipt).hexdigest()
        private = self.base / "private"
        private.mkdir(mode=0o700)
        sealed = seal.seal(output, private, expected_receipt_sha256=pin)
        self.assertEqual(sealed["status"], "SEALED_LOCAL_INTEGRITY_ONLY")
        self.assertFalse(sealed["siteAuthenticated"])
        self.assertFalse(sealed["executionAuthorized"])

    def test_lab_rejects_file_outside_controlled_raw_path(self):
        output = self.base / "stray"
        output.mkdir(mode=0o700)
        r = c._test_fixture_supervisor(
            (sys.executable, "-c", "open('unauthorized','wb').write(b'x')"),
            output)
        self.assertEqual(r["status"], "BLOCKED")
        self.assertIn("UNEXPECTED_LAB_OUTPUT", r["reasonCodes"])
        self.assertTrue((output / "unauthorized").exists())

    def test_output_path_must_be_empty(self):
        output = self.base / "dirty"
        output.mkdir(mode=0o700)
        (output / "old").touch()
        with self.assertRaisesRegex(c.CaptureBlocked, "OUTPUT_NOT_EMPTY"):
            c._test_fixture_supervisor((sys.executable, "-c", "pass"), output)


if __name__ == "__main__":
    unittest.main()
