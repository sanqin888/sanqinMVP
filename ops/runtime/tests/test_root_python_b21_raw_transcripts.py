"""B2-1A exact C2 VM raw-command coverage (inert synthetic test vectors)."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from root_python_b21_raw_transcripts import (  # noqa: E402
    EXPECTED_COMMANDS, EXPECTED_GUEST_VALUES, ReadonlyTranscriptBlocked,
    review_readonly_raw_transcripts,
)


def _hash(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _pin(record: dict) -> str:
    return _hash(json.dumps(record, sort_keys=True,
                            separators=(",", ":"), ensure_ascii=True,
                            allow_nan=False).encode("ascii"))


def fixture():
    records = []
    raws = {}
    pins = {}
    for key in sorted(EXPECTED_COMMANDS):
        host = key.startswith("host.")
        raw = {
            "stdout": (EXPECTED_GUEST_VALUES[key] + b"\n"
                       if key in EXPECTED_GUEST_VALUES else
                       ("SYNTHETIC, NOT FROM MAC OR GUEST\n"
                        + key + "\n").encode("ascii")),
            "stderr": b"",
        }
        record = {
            "captureId": key,
            "argv": list(EXPECTED_COMMANDS[key]),
            "channel": "host-direct" if host else "guest-ssh-unprivileged",
            "actorId": "syntheticMacOperator" if host else "syntheticUbuntuOperator",
            "observedAtUtc": "2026-10-18T21:00:00Z",
            "innerExitCode": 0,
            "outerExitCode": None if host else 0,
            "stdoutSha256": _hash(raw["stdout"]),
            "stderrSha256": _hash(raw["stderr"]),
        }
        records.append(record)
        raws[key] = raw
        pins[key] = _pin(record)
    return records, raws, pins


def repin(records, pins):
    """Make altered synthetic metadata self-consistent to reach deeper guards."""
    for r in records:
        pins[r["captureId"]] = _pin(r)


class B21ReadOnlyRawTests(unittest.TestCase):
    def setUp(self):
        self.records, self.raws, self.pins = fixture()

    def review(self):
        return review_readonly_raw_transcripts(
            self.records, self.raws, detached_record_pins=self.pins)

    def test_complete_raw_claims_are_always_blocked(self):
        result = self.review()
        self.assertEqual(result["hostCommandClaimsCompared"], 5)
        self.assertEqual(result["guestCommandClaimsCompared"], 9)
        self.assertEqual(result["decision"], "BLOCKED")
        self.assertIs(result["readyToInstall"], False)
        self.assertIs(result["rootAnchorFdAuthenticated"], False)
        self.assertIs(result["hostEnvironmentIndependentlyAuthenticated"], False)
        self.assertIs(result["authorizedToMutateProduction"], False)

    def test_missing_or_duplicate_command_fails(self):
        self.records.pop()
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()
        self.setUp()
        self.records[0] = copy.deepcopy(self.records[1])
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_unallowlisted_guest_command_fails_even_if_rehashed(self):
        key = "guest.root-mount"
        record = next(r for r in self.records if r["captureId"] == key)
        record["argv"] = ["sudo", "findmnt", "/"]
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_unallowlisted_host_write_command_fails(self):
        key = "host.source-snapshots"
        record = next(r for r in self.records if r["captureId"] == key)
        record["argv"] = ["VBoxManage", "snapshot", "VM", "take", "new"]
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_guest_outer_ssh_rc_must_be_present(self):
        record = next(r for r in self.records if r["captureId"] ==
                      "guest.root-mount")
        record["outerExitCode"] = None
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_guest_inner_command_failure_is_not_silenced(self):
        record = next(r for r in self.records if r["captureId"] ==
                      "guest.root-mount")
        record["innerExitCode"] = 1
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_host_nonzero_rc_is_not_silenced(self):
        record = next(r for r in self.records if r["captureId"] ==
                      "host.recovered-disk-info")
        record["innerExitCode"] = 1
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_no_stdout_is_blocked(self):
        key = "host.recovered-disk-info"
        self.raws[key]["stdout"] = b""
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_disposable_guest_uid_mismatch_fails_even_with_correct_digests(self):
        key = "guest.identity"
        self.raws[key]["stdout"] = b"0\n"
        rec = next(r for r in self.records if r["captureId"] == key)
        rec["stdoutSha256"] = _hash(self.raws[key]["stdout"])
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_disposable_guest_alias_mismatch_fails_even_with_correct_digests(self):
        key = "guest.lib64-alias"
        self.raws[key]["stdout"] = b"/tmp/other\n"
        rec = next(r for r in self.records if r["captureId"] == key)
        rec["stdoutSha256"] = _hash(self.raws[key]["stdout"])
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_raw_bytes_mutation_detected(self):
        self.raws["host.recovered-disk-info"]["stdout"] += b"tamper"
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_metadata_mutation_detected_by_detached_pin(self):
        self.records[0]["actorId"] = "differentActor"
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_raw_record_swap_detected(self):
        first, second = "host.source-vm-info", "host.recovered-vm-info"
        self.raws[first], self.raws[second] = self.raws[second], self.raws[first]
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_oversize_capture_blocked_even_if_rehashed(self):
        key = "host.recovered-disk-info"
        self.raws[key]["stdout"] = b"x" * 65537
        record = next(r for r in self.records if r["captureId"] == key)
        record["stdoutSha256"] = _hash(self.raws[key]["stdout"])
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_forged_result_flag_is_not_input_contract(self):
        self.records[0]["authorizedToMutateProduction"] = True
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_guest_source_channel_swap_blocked(self):
        key = "guest.kernel"
        record = next(r for r in self.records if r["captureId"] == key)
        record["channel"] = "host-direct"
        repin(self.records, self.pins)
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_noncanonical_order_blocked(self):
        self.records.reverse()
        with self.assertRaises(ReadonlyTranscriptBlocked):
            self.review()

    def test_untrusted_self_consistent_pins_never_authenticate(self):
        self.records[0]["actorId"] = "pretendIndependentOperator"
        repin(self.records, self.pins)
        result = self.review()
        self.assertIs(result["operatorAndWitnessIdentityAuthenticated"], False)
        self.assertIs(result["packageSourceSignaturesVerified"], False)
        self.assertEqual(result["decision"], "BLOCKED")


if __name__ == "__main__":
    unittest.main()
