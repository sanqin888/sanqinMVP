"""Owned observer continuation: intent then marker, real disposable files/locks."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_combined_preflight as combined
import test_private_install_materials as private
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationIntentFlowTests(unittest.TestCase):
    def setUp(self):
        self.base = combined.InstallationCombinedPreflightTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.materials
        self.namespace = self.materials.state / "installation-runs"
        self.marker = self.materials.state / "maintenance/active.json"

    def observe(self):
        with patch.object(installer, "_observe_installed_external_backup",
                          side_effect=installer._record_installation_intent):
            return self.base.observe()

    def run_dir(self):
        entries = list(self.namespace.iterdir())
        self.assertEqual(len(entries), 1)
        return entries[0]

    def test_owned_fresh_observation_records_exact_pair_without_freeze_or_install_permission(self):
        result = self.observe()
        facts = result["installationIntent"]
        self.assertEqual(result["outcome"], "INSTALLATION_INTENT_RECORDED")
        self.assertFalse(result["canExecute"])
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["hostPreflightComplete"])
        self.assertFalse(facts["startupFenceConfirmed"])
        self.assertFalse(facts["writersFrozen"])
        raw = (self.run_dir() / "intent.json").read_bytes()
        installer._installation_records_match(raw, self.marker.read_bytes(), facts["installationId"])
        self.assertEqual(installer._hash(raw), facts["intentSha256"])
        self.assertEqual(json_value(raw)["retentionId"], self.materials.identity)

    def test_second_attempt_refuses_existing_marker_and_preserves_all_bytes(self):
        self.observe()
        intent = self.run_dir() / "intent.json"
        before = (intent.read_bytes(), self.marker.read_bytes(), intent.stat().st_ino)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(before, (intent.read_bytes(), self.marker.read_bytes(), intent.stat().st_ino))

    def test_original_locks_span_both_record_writes(self):
        write = installer._installation_record_write
        calls = []
        def checked(*args):
            for acquire in (private.jobs._locked_directory, private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            calls.append(args[1])
            return write(*args)
        with patch.object(installer, "_installation_record_write", side_effect=checked):
            self.observe()
        self.assertEqual(calls, ["intent.json", "active.json"])

    def test_partial_intent_kept_and_marker_never_written(self):
        def failing(root, name, raw, identity):
            self.assertEqual(name, "intent.json")
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
            try:
                os.write(fd, raw[:9])
            finally:
                os.close(fd)
            raise OSError("modeled partial intent write")
        with patch.object(installer, "_installation_record_write", side_effect=failing), self.assertRaises(OSError):
            self.observe()
        self.assertEqual(len((self.run_dir() / "intent.json").read_bytes()), 9)
        self.assertFalse(self.marker.exists())
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_partial_marker_kept_without_erasing_durable_intent(self):
        write = installer._installation_record_write
        def failing(root, name, raw, identity):
            if name == "intent.json":
                return write(root, name, raw, identity)
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
            try:
                os.write(fd, raw[:7])
            finally:
                os.close(fd)
            raise OSError("modeled partial marker")
        with patch.object(installer, "_installation_record_write", side_effect=failing), self.assertRaises(OSError):
            self.observe()
        self.assertFalse(json_value((self.run_dir() / "intent.json").read_bytes())["canExecute"])
        self.assertEqual(len(self.marker.read_bytes()), 7)

    def test_host_drift_after_intent_durability_blocks_marker(self):
        write = installer._installation_record_write
        def racing(*args):
            result = write(*args)
            if args[1] == "intent.json":
                self.base.docker.containers[self.base.docker.ids[0]]["HostConfig"]["AutoRemove"] = True
            return result
        with patch.object(installer, "_installation_record_write", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue((self.run_dir() / "intent.json").exists())
        self.assertFalse(self.marker.exists())

    def test_late_maintenance_after_intent_is_preserved(self):
        write = installer._installation_record_write
        incident = self.marker.with_name("incident.json")
        def racing(*args):
            result = write(*args)
            if args[1] == "intent.json":
                incident.write_bytes(b"late evidence")
            return result
        with patch.object(installer, "_installation_record_write", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(incident.read_bytes(), b"late evidence")
        self.assertFalse(self.marker.exists())

    def test_namespace_sync_failure_keeps_partial_namespace_and_no_marker(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("modeled namespace sync")), \
             self.assertRaises(OSError):
            self.observe()
        self.assertTrue(self.namespace.is_dir())
        self.assertFalse(self.marker.exists())

    def test_unknown_transaction_blocks_new_attempt_without_cleanup(self):
        self.namespace.mkdir(mode=0o700)
        evidence = self.namespace / "unknown"
        evidence.write_bytes(b"preserved")
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(evidence.read_bytes(), b"preserved")
        self.assertFalse(self.marker.exists())

    def test_readonly_observation_has_no_writes_and_private_mode_cannot_skip_stages(self):
        with patch.object(installer, "_write_installation_intent_locked", side_effect=AssertionError("write called")):
            self.base.observe()
        self.assertFalse(self.namespace.exists())
        with self.assertRaises(ReleaseContractError):
            installer._observe_installed_runtime(self.materials.identity, _record_intent=True)
        for command in ("record-installation-intent", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


def json_value(raw):
    import json
    return json.loads(raw)


if __name__ == "__main__":
    unittest.main()
