"""Capability-probe invariant tests (pure, no sudo/network/VM)."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest
from unittest import mock

PROBES = Path(__file__).resolve().parents[1] / "probes"
sys.path.insert(0, str(PROBES))
try:
    import github_runner_vm_capability as probe
finally:
    sys.path.pop(0)


class RunnerVmProbeContractTests(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(probe.os.environ, {
            "GITHUB_ACTIONS": "true",
            "RUNNER_ENVIRONMENT": "github-hosted",
            "GITHUB_EVENT_NAME": "pull_request",
            "GITHUB_REPOSITORY": "sanqin888/sanqinMVP",
        })
        env.start()
        self.addCleanup(env.stop)

    def test_non_github_host_or_event_never_starts_probe(self):
        with mock.patch.dict(probe.os.environ, {"GITHUB_ACTIONS": "false"}, clear=True):
            with mock.patch.object(probe, "runner_inventory") as inv:
                report = probe.run_probe(Path("/tmp/synthetic-only"), 60)
        inv.assert_not_called()
        self.assertEqual(report["capability"], "BLOCKED")
        self.assertEqual(report["reason"], "GITHUB_HOSTED_SAME_REPO_PR_REQUIRED")
        self.assertEqual(report["p0_01"], "NOT_RUN")

    def test_checksum_is_selected_by_exact_image_basename(self):
        sha = "a" * 64
        other = "b" * 64
        checksums = f"{sha} *{probe.IMAGE_NAME}\n{other} *not-the-target.img\n"
        self.assertEqual(probe.checksum_for(checksums, probe.IMAGE_NAME), sha)

    def test_checksum_rejects_missing_and_duplicate_image(self):
        with self.assertRaises(probe.ProbeUnavailable):
            probe.checksum_for("f" * 64 + " *wrong-name.img\n", probe.IMAGE_NAME)
        duplicate = ("a" * 64 + " *" + probe.IMAGE_NAME + "\n") * 2
        with self.assertRaises(probe.ProbeUnavailable):
            probe.checksum_for(duplicate, probe.IMAGE_NAME)

    def test_marker_requires_systemd_and_exact_serial_line(self):
        boot_a = "11111111-1111-4111-8111-111111111111"
        boot_b = "22222222-2222-4222-8222-222222222222"
        serial = (f"noise\nSANQ_PROBE_GUEST_BOOT=1 PID1=systemd BOOT_ID={boot_a}\r\n"
                  f"SANQ_PROBE_GUEST_BOOT=2 PID1=systemd BOOT_ID={boot_b}\n")
        self.assertEqual(probe.marker_counts(serial), (1, 2))
        self.assertTrue(probe.distinct_guest_boots(serial))
        self.assertFalse(probe.distinct_guest_boots(serial.replace(boot_b, boot_a)))
        self.assertEqual(probe.marker_counts(
            f"SANQ_PROBE_GUEST_BOOT=1 PID1=python BOOT_ID={boot_a}\n"
            f"prefix SANQ_PROBE_GUEST_BOOT=2 PID1=systemd BOOT_ID={boot_b}\n"), ())

    def test_guest_pass_requires_two_systemd_boots_and_actual_reset(self):
        self.assertEqual(probe.classify_guest(True, True, True, reset_sent=True), "PASS")
        for flags in ((True, False, True, True),
                      (False, True, True, True),
                      (True, True, False, True),
                      (True, True, True, False)):
            self.assertEqual(probe.classify_guest(*flags[:3], reset_sent=flags[3]), "BLOCKED")

    def test_kvm_unavailable_must_not_fetch_image_or_claim_success(self):
        with mock.patch.object(probe, "runner_inventory", return_value={
                "runner_os": True, "arch": "x86_64", "kernel": "synthetic",
                "pid1": "systemd", "mem_available_kib": 8 * 1024 * 1024,
                "free_disk_bytes": 10 * 1024**3, "kvm": "FILENOTFOUNDERROR",
                "qemu_binary_present": False, "cloud_localds_present": False}):
            with mock.patch.object(probe, "run_guest") as guest:
                report = probe.run_probe(Path("/tmp/synthetic-only"), 60)
        guest.assert_not_called()
        self.assertEqual(report["capability"], "BLOCKED")
        self.assertEqual(report["reason"], "KVM_UNAVAILABLE")
        self.assertEqual(report["p0_01"], "NOT_RUN")
        self.assertEqual(report["same_version_as_production"], "NOT_VERIFIED")
        self.assertEqual(report["phases"]["GUEST_RESET"], "NOT_RUN")

    def test_mock_guest_bad_evidence_never_grants_guest_pass(self):
        inventory = {
            "runner_os": True, "arch": "x86_64", "kernel": "synthetic",
            "pid1": "systemd", "mem_available_kib": 8 * 1024 * 1024,
            "free_disk_bytes": 10 * 1024**3, "kvm": "ACCESSIBLE",
            "qemu_binary_present": True, "cloud_localds_present": True,
        }
        with mock.patch.object(probe, "runner_inventory", return_value=inventory):
            with mock.patch.object(probe.shutil, "which", return_value="/fake/qemu"):
                with mock.patch.object(probe, "command", return_value="QEMU emulator version synthetic"):
                    with mock.patch.object(probe, "run_guest", return_value={
                            "result": "BLOCKED", "guest_systemd": True,
                            "reset_sent": False, "guest_network": "none"}):
                        report = probe.run_probe(Path("/tmp/synthetic-only"), 60)
        self.assertEqual(report["capability"], "BLOCKED")
        self.assertEqual(report["reason"], "GUEST_EVIDENCE_INCOMPLETE")
        self.assertEqual(report["p0_01"], "NOT_RUN")

    def test_guest_pass_never_marks_p0_01_pass(self):
        inventory = {
            "runner_os": True, "arch": "x86_64", "kernel": "synthetic",
            "pid1": "systemd", "mem_available_kib": 8 * 1024 * 1024,
            "free_disk_bytes": 10 * 1024**3, "kvm": "ACCESSIBLE",
            "qemu_binary_present": True, "cloud_localds_present": True,
        }
        with mock.patch.object(probe, "runner_inventory", return_value=inventory):
            with mock.patch.object(probe.shutil, "which", return_value="/fake/qemu"):
                with mock.patch.object(probe, "command", return_value="QEMU emulator version synthetic"):
                    with mock.patch.object(probe, "run_guest", return_value={
                            "result": "PASS", "guest_systemd": True,
                            "reset_sent": True, "guest_network": "none"}):
                        report = probe.run_probe(Path("/tmp/synthetic-only"), 60)
        self.assertEqual(report["capability"], "GUEST_RESET_PASS_SCOPE_ONLY")
        self.assertEqual(report["p0_01"], "NOT_RUN")
        self.assertEqual(report["same_version_as_production"], "NOT_VERIFIED")


if __name__ == "__main__":
    unittest.main()
