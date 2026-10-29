"""Owned tool-write continuation: real temporary Runtime files and original two-lock flow."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_offhost_confirmation as confirmation
from release_contract import ReleaseContractError


class OwnedInstallationToolWriteTests(unittest.TestCase):
    def setUp(self):
        self.base = confirmation.OffhostConfirmationTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.retention.phase.gate.combined.materials
        self.runtime = self.materials.anchor / "runtime"
        self.context = None
        self.writes = []

    def observe(self, exchange=None, *, first_exchange=None):
        with patch.object(installer, "_confirm_installation_offhost_index", side_effect=installer._write_installation_tools):
            return self.base.observe(exchange=exchange, first_exchange=first_exchange)

    def run_with_writer(self, hook=None):
        write = installer._write_installation_tool_member
        def wrapped(parent, path, before, after, **kwargs):
            self.base.retention.phase.gate.assert_locks_held()
            self.assertTrue(self.base.path().exists())
            self.assertTrue(self.base.base.record_path().exists())
            self.assertTrue(self.base.retention.directory().exists())
            self.writes.append(path)
            return write(parent, path, before, after, **kwargs) if hook is None else hook(write, parent, path, before, after, kwargs)
        with patch.object(installer, "_write_installation_tool_member", side_effect=wrapped):
            return self.observe()

    def assert_fenced(self):
        self.base.retention.assert_frozen_evidence()
        self.assertEqual(len(self.base.retention.phase.actions), 6)
        for identifier in self.base.retention.phase.docker.ids[:3]:
            self.assertEqual(self.base.retention.phase.docker.containers[identifier]["HostConfig"]["RestartPolicy"]["Name"], "no")
        self.assertTrue(self.base.path().exists())
        self.assertTrue(self.base.base.record_path().exists())

    def target_bytes(self):
        intent = json.loads(self.base.retention.originals()[0])
        kit_path = self.materials.state / "installations" / intent["retentionId"] / "delivery-kit.tar.gz"
        contents = installer._read_kit(kit_path.read_bytes())
        source_sha = json.loads(contents[installer.RECORD])["sourceSha"]
        _, runtime = installer._runtime_files(contents[installer.RUNTIME_ARCHIVE], source_sha)
        return contents, runtime

    def test_same_owned_flow_writes_all_27_in_order_after_durable_confirmation_and_stays_fenced(self):
        db = copy.deepcopy(self.base.retention.phase.docker.containers[self.base.retention.phase.docker.ids[3]])
        result = self.run_with_writer()
        facts = result["installationIntent"]["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_TOOL_FILES_WRITTEN_FENCED")
        self.assertEqual(result["observationTiming"], "PRE_INSTALLATION_INTENT")
        self.assertEqual(facts["outcome"], "TOOL_FILES_WRITTEN_FENCED")
        self.assertTrue(facts["toolFilesWritten"])
        self.assertTrue(facts["snapshotMaterialsConfirmed"])
        self.assertTrue(facts["restoreValidationDeferred"])
        self.assertEqual(self.writes, list(installer.INSTALL_TOOL_PATHS))
        self.assertEqual(set(facts["toolFiles"]), set(installer.INSTALL_TOOL_PATHS))
        for key in ("installationComplete", "permanentGatesLoaded", "restoreProven", "recoveryReady", "canExecute"):
            self.assertIs(facts[key], False)
        self.assertFalse(result["readyToInstall"])
        contents, target = self.target_bytes()
        for path in installer.RUNTIME_MEMBERS:
            self.assertEqual((self.runtime / path).read_bytes(), target[path])
        for path in installer.HELPERS:
            self.assertEqual((self.runtime / path).read_bytes(), contents["sources/" + path])
        self.assertFalse(any(self.runtime.rglob(".sanq-install-*")))
        self.assertEqual(self.base.retention.phase.docker.containers[self.base.retention.phase.docker.ids[3]], db)
        self.assert_fenced()

    def test_old_confirmation_entry_does_not_write_tools(self):
        with patch.object(installer, "_write_installation_tool_member", side_effect=AssertionError("unexpected write")):
            result = self.base.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_OFFHOST_INDEX_CONFIRMED")
        self.assertTrue(all(not (self.runtime / path).exists() for path in installer.HELPERS))

    def test_wrong_or_missing_live_ack_prevents_every_tool_write(self):
        def wrong(transfer, *fds, **kwargs):
            ack = json.loads(self.base.client(transfer, *fds, **kwargs))
            ack["transferChallenge"] = "f" * 64
            return installer._json(ack)
        with patch.object(installer, "_write_installation_tool_member", side_effect=AssertionError("write before ack")), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(wrong)
        self.assertTrue(all(not (self.runtime / path).exists() for path in installer.HELPERS))

    def test_source_failure_after_ack_prevents_writes_and_keeps_both_receipts(self):
        with patch.object(installer, "_installation_tool_write_set", side_effect=ReleaseContractError("modeled source failure")), \
             patch.object(installer, "_write_installation_tool_member", side_effect=AssertionError("write after source failure")), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assert_fenced()

    def test_success_does_not_change_application_configuration_state_or_c4_bytes(self):
        originals = {name: (self.runtime / name).read_bytes() for name in installer.CONFIGURATION_NAMES}
        self.observe()
        self.assertEqual(originals, {name: (self.runtime / name).read_bytes() for name in installer.CONFIGURATION_NAMES})
        self.assert_fenced()

    def test_permanent_gates_are_not_loaded_and_no_service_start_or_marker_clear_is_attempted(self):
        self.observe()
        manager = self.base.retention.phase.gate.manager
        for unit, text in installer.INSTALL_DENY_DROPINS.items():
            self.assertEqual((manager.directory / (unit + ".d") / installer.INSTALL_GATE_NAME).read_bytes(), text)
        self.assert_fenced()

    def test_failure_at_second_member_keeps_first_helper_and_all_fences_without_retry(self):
        def fail(write, parent, path, before, after, kwargs):
            if len(self.writes) == 2:
                raise ReleaseContractError("modeled second member failure")
            return write(parent, path, before, after, **kwargs)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(fail)
        self.assertEqual(self.writes, list(installer.HELPERS[:2]))
        self.assertTrue((self.runtime / installer.HELPERS[0]).exists())
        self.assertFalse((self.runtime / installer.HELPERS[1]).exists())
        self.assert_fenced()

    def test_no_resume_or_repeat_installation_after_partial_or_complete_tool_writes(self):
        self.observe()
        with patch.object(installer, "_write_installation_tool_member", side_effect=AssertionError("replayed tool write")), \
             self.assertRaises(ReleaseContractError):
            self.observe(first_exchange=lambda *args, **kwargs: self.fail("replayed snapshot wait"))
        self.assert_fenced()

    def test_existing_pending_file_is_rejected_before_first_tool_write(self):
        pending = self.runtime / "ops/release/.sanq-install-deployment_plan.py.pending"
        pending.write_bytes(b"unknown interrupted file")
        pending.chmod(0o600)
        with patch.object(installer, "_write_installation_tool_member", side_effect=AssertionError("write with pending")), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(pending.read_bytes(), b"unknown interrupted file")

    def test_unknown_file_appearing_during_writes_blocks_with_partial_actual_files_preserved(self):
        def changed(write, parent, path, before, after, kwargs):
            result = write(parent, path, before, after, **kwargs)
            (self.runtime / "ops/release/unexpected-tool.py").write_bytes(b"unexpected")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(changed)
        self.assertTrue((self.runtime / installer.HELPERS[0]).exists())
        self.assertTrue((self.runtime / "ops/release/unexpected-tool.py").exists())
        self.assert_fenced()

    def test_completed_member_late_mutation_is_not_accepted_as_a_new_baseline(self):
        def changed(write, parent, path, before, after, kwargs):
            result = write(parent, path, before, after, **kwargs)
            if len(self.writes) == 2:
                (self.runtime / installer.HELPERS[0]).write_bytes(b"changed completed helper")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(changed)
        self.assertEqual(len(self.writes), 2)
        self.assert_fenced()

    def test_unwritten_member_late_mutation_blocks_before_manifest_publication(self):
        def changed(write, parent, path, before, after, kwargs):
            result = write(parent, path, before, after, **kwargs)
            (self.runtime / "ops/release/deploy_release.py").write_bytes(b"changed unwritten source")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(changed)
        self.assertEqual(len(self.writes), 1)
        self.assert_fenced()

    def test_recovery_or_vm_receipt_mutation_during_writes_is_caught_by_owned_checks(self):
        def changed(write, parent, path, before, after, kwargs):
            result = write(parent, path, before, after, **kwargs)
            self.base.path().write_bytes(self.base.path().read_bytes() + b" ")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(changed)
        self.assertEqual(len(self.writes), 1)

    def test_storage_drift_during_writes_blocks_remaining_members(self):
        def changed(write, parent, path, before, after, kwargs):
            result = write(parent, path, before, after, **kwargs)
            self.base.base.flow.binding.storage.mounts += b"13 11 0:99 / /srv/sanq/uploads rw - ext4 /dev/other rw\n"
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(changed)
        self.assertEqual(len(self.writes), 1)
        self.assert_fenced()

    def test_configuration_drift_during_writes_is_not_overwritten_or_repaired(self):
        def changed(write, parent, path, before, after, kwargs):
            result = write(parent, path, before, after, **kwargs)
            with (self.runtime / ".env").open("ab") as stream:
                stream.write(b"\nUNEXPECTED_DRIFT=1\n")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(changed)
        self.assertIn(b"UNEXPECTED_DRIFT=1", (self.runtime / ".env").read_bytes())
        self.assertEqual(len(self.writes), 1)
        self.assert_fenced()

    def test_one_original_two_lock_context_covers_every_file_and_remains_held_during_progress_checks(self):
        check = installer._installation_tool_progress_check
        checks = []
        def checked(progress):
            self.base.retention.phase.gate.assert_locks_held()
            checks.append((len(progress["completed"]), progress["active"]))
            return check(progress)
        with patch.object(installer, "_installation_tool_progress_check", side_effect=checked):
            result = self.observe()
        self.assertTrue(result["installationIntent"]["snapshotReview"]["toolFilesWritten"])
        self.assertEqual(checks[0], (0, None))
        self.assertTrue(any(count == 27 and active is None for count, active in checks))

    def test_source_authentication_is_bracketed_but_not_repeated_for_every_file(self):
        combined = self.base.retention.phase.gate.combined
        fetch = combined.fetch
        active = [False]
        calls = []
        def checked_fetch(path):
            self.assertFalse(active[0], "Git requests must not multiply inside the file-write loop")
            calls.append(path)
            return fetch(path)
        def write_member(write, parent, path, before, after, kwargs):
            active[0] = True
            result = write(parent, path, before, after, **kwargs)
            if path == installer.INSTALL_TOOL_PATHS[-1]:
                active[0] = False
            return result
        with patch.object(combined, "fetch", side_effect=checked_fetch):
            self.run_with_writer(write_member)
        self.assertTrue(calls)
        self.assert_fenced()

    def test_directory_replacement_is_rejected_even_if_original_fd_remains_valid(self):
        def changed(write, parent, path, before, after, kwargs):
            result = write(parent, path, before, after, **kwargs)
            directory = self.runtime / "ops/release"
            directory.rename(self.runtime / "ops/release-old")
            directory.mkdir(mode=0o755)
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.run_with_writer(changed)
        self.assertTrue((self.runtime / "ops/release-old" / Path(installer.HELPERS[0]).name).exists())
        self.assert_fenced()

    def test_write_switch_is_native_and_requires_complete_live_confirmation_before_any_host_io(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("unexpected host IO")):
            for kwargs in ({"_write_tools": 1}, {"_write_tools": True}):
                with self.subTest(kwargs=kwargs), self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("f" * 64, **kwargs)
