"""C1-SYN-001 offline approval tests; no trace or Host/Guest execution."""
from pathlib import Path
import sys
import unittest

MODULE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(MODULE_DIR))
try:
    import c1_syn001_approval_offline as m
finally:
    sys.path.pop(0)


def sources():
    return {
        name: (REPO_ROOT / "docs" / "architecture" / name).read_bytes()
        for name in m.MATERIALS
    }


def claims():
    return {
        "expectedVmUuid": "synthetic-vm-uuid",
        "observedVmUuid": "synthetic-vm-uuid",
        "expectedVdiUuid": "synthetic-vdi-uuid",
        "observedVdiUuid": "synthetic-vdi-uuid",
        "expectedSshHostKeySha256": "a" * 64,
        "observedSshHostKeySha256": "a" * 64,
        "expectedHostOnlyNetwork": "synthetic-hostonly",
        "observedHostOnlyNetwork": "synthetic-hostonly",
        "vmState": "running",
        "guestUid": 1000,
        "guestGid": 1000,
        "guestBootId": "synthetic-boot",
        "mountNamespace": "mnt:[4026532000]",
        "pidNamespace": "pid:[4026532001]",
        "expectedStraceSha256": "b" * 64,
        "observedStraceSha256": "b" * 64,
        "expectedPythonSha256": "c" * 64,
        "observedPythonSha256": "c" * 64,
        "expectedLoaderSha256": "d" * 64,
        "observedLoaderSha256": "d" * 64,
    }


class C1Syn001OfflineApprovalTests(unittest.TestCase):
    def test_frozen_three_source_bytes_are_exact(self):
        result = m.review(sources(), claims())
        self.assertTrue(result["sourceMaterialsMatched"])
        self.assertEqual(result["status"], "CLAIMS_CONSISTENT_ONLY")
        self.assertEqual(result["reasonCodes"], [])
        self.assertEqual(len(result["sourceMaterials"]), 3)

    def test_even_consistent_claims_never_authorize_trace_or_production(self):
        result = m.review(sources(), claims())
        for field in ("a0Approved", "a1Approved", "a2ExecutionAuthorized",
                      "guestExecutionAllowed", "readyToInstall",
                      "productionAuthorized", "siteClaimsAuthenticityProven"):
            self.assertIs(result[field], False, field)
        self.assertEqual(result["c0HistoricalDisposition"], "CLOSED_LIMITED_ACCEPTED")
        for scenario in result["scenarios"]:
            self.assertFalse(scenario["runAsRoot"])
            self.assertFalse(scenario["autoCleanup"])
            self.assertTrue(scenario["preservePartialAndFailedRaw"])
            self.assertTrue(scenario["captureStdoutStderrAndExitCodes"])
            self.assertEqual(scenario["maxWallSeconds"], 30)
            self.assertEqual(scenario["maxRawBytes"], 8 * 1024 * 1024)
            self.assertEqual(scenario["maxSingleTraceBytes"], 4 * 1024 * 1024)
            self.assertEqual(scenario["cwd"], m.ROOT)
            self.assertEqual(scenario["umaskOctal"], "0077")
            self.assertEqual(scenario["env"], m.ENVIRONMENT)
            self.assertEqual(scenario["argv"][0], "/usr/bin/strace")
            self.assertEqual(scenario["argv"][9], "/usr/bin/python3.12")

    def test_no_site_returns_blocked_without_execution_right(self):
        result = m.review(sources())
        self.assertEqual(result["status"], "REJECTED")
        self.assertIn("SITE_PREFLIGHT_MISSING", result["reasonCodes"])
        self.assertFalse(result["guestExecutionAllowed"])

    def test_modified_source_is_rejected_not_rehashed_as_approved(self):
        values = sources()
        values["C1-SYN-001-SYN-01.py.txt"] += b"# changed\n"
        r = m.review(values, claims())
        self.assertEqual(r["status"], "REJECTED")
        self.assertIn("SOURCE_BYTES_MISMATCH", r["reasonCodes"])

    def test_swapped_inputs_and_unknown_files_are_rejected(self):
        values = sources()
        values["C1-SYN-001-input.txt"] = values["C1-SYN-001-SYN-01.py.txt"]
        self.assertIn("SOURCE_BYTES_MISMATCH",
                      m.review(values, claims())["reasonCodes"])
        values = sources()
        values["unexpected.py"] = b"unsafe"
        self.assertIn("SOURCE_SET_MISMATCH", m.review(values, claims())["reasonCodes"])

    def test_materials_must_be_exact_bytes_not_str_or_bytearray(self):
        values = sources()
        values["C1-SYN-001-input.txt"] = bytearray(values["C1-SYN-001-input.txt"])
        self.assertIn("SOURCE_BYTES_MISMATCH",
                      m.review(values, claims())["reasonCodes"])
        self.assertIn("SOURCE_SET_MISMATCH", m.review(None, claims())["reasonCodes"])

    def test_unknown_claims_cannot_override_authority(self):
        site = claims()
        site["a2ExecutionAuthorized"] = True
        result = m.review(sources(), site)
        self.assertIn("SITE_PREFLIGHT_SCHEMA_INVALID", result["reasonCodes"])
        self.assertFalse(result["a2ExecutionAuthorized"])

    def test_ssh_key_mismatch_fail_closed(self):
        site = claims()
        site["observedSshHostKeySha256"] = "e" * 64
        self.assertIn("SSH_HOST_KEY_MISMATCH",
                      m.review(sources(), site)["reasonCodes"])

    def test_vm_and_vdi_mismatch_fail_closed(self):
        site = claims()
        site["observedVmUuid"] = "other-vm"
        site["observedVdiUuid"] = "other-vdi"
        reasons = m.review(sources(), site)["reasonCodes"]
        self.assertIn("VM_IDENTITY_MISMATCH", reasons)
        self.assertIn("VDI_IDENTITY_MISMATCH", reasons)

    def test_hostonly_and_native_source_mismatch_fail_closed(self):
        site = claims()
        site["observedHostOnlyNetwork"] = "wrong-network"
        site["observedStraceSha256"] = "f" * 64
        site["observedPythonSha256"] = "e" * 64
        site["observedLoaderSha256"] = "a" * 64
        reasons = m.review(sources(), site)["reasonCodes"]
        self.assertIn("HOST_ONLY_NETWORK_MISMATCH", reasons)
        self.assertIn("STRACE_SOURCE_MISMATCH", reasons)
        self.assertIn("PYTHON_SOURCE_MISMATCH", reasons)
        self.assertIn("LOADER_SOURCE_MISMATCH", reasons)

    def test_vm_must_be_running(self):
        site = claims()
        site["vmState"] = "poweroff"
        self.assertIn("VM_NOT_RUNNING", m.review(sources(), site)["reasonCodes"])

    def test_root_or_type_confusion_is_rejected(self):
        site = claims()
        site["guestUid"] = 0
        self.assertIn("ROOT_NOT_ALLOWED",
                      m.review(sources(), site)["reasonCodes"])
        site = claims()
        site["guestUid"] = True
        self.assertIn("SITE_PREFLIGHT_SCHEMA_INVALID",
                      m.review(sources(), site)["reasonCodes"])

    def test_malformed_sha_and_long_identifiers_rejected(self):
        site = claims()
        site["observedStraceSha256"] = "not-a-sha"
        self.assertIn("SITE_PREFLIGHT_SCHEMA_INVALID",
                      m.review(sources(), site)["reasonCodes"])
        site = claims()
        site["expectedVmUuid"] = "x" * 129
        self.assertIn("SITE_PREFLIGHT_SCHEMA_INVALID",
                      m.review(sources(), site)["reasonCodes"])

    def test_missing_claims_and_extra_claims_rejected(self):
        site = claims()
        del site["guestBootId"]
        self.assertIn("SITE_PREFLIGHT_SCHEMA_INVALID",
                      m.review(sources(), site)["reasonCodes"])
        self.assertIn("SITE_PREFLIGHT_SCHEMA_INVALID",
                      m.review(sources(), [])["reasonCodes"])

    def test_unknown_scenario_raises_without_running(self):
        with self.assertRaises(ValueError):
            m._argv("SYN-03")


if __name__ == "__main__":
    unittest.main()
