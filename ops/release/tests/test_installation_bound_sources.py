"""Live bootstrap FD checks through modeled supervised writes and complete installation."""
import contextlib
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_supervised_writers as supervised
import test_installation_completion as completion
from release_contract import ReleaseContractError


class BoundWriterSourcesTests(unittest.TestCase):
    def setUp(self):
        self.writer = supervised.SupervisedWriterStageTests()
        self.writer.setUp()
        self.addCleanup(self.writer.doCleanups)
        self.source = self.writer.bootstrap / installer.BOOTSTRAP

    def replace_source(self):
        replacement = self.source.with_suffix(".replacement")
        replacement.write_bytes(self.source.read_bytes())
        replacement.chmod(0o600)
        replacement.replace(self.source)

    def test_five_original_file_descriptors_span_handoff_under_original_locks_and_close(self):
        read = installer._bootstrap_read
        write = installer._installation_task_handoff_write
        descriptors = {}
        def observe(fd, parent, name):
            descriptors[name] = fd
            return read(fd, parent, name)
        def persist(*args):
            self.writer.base.assert_locks_held()
            self.assertEqual(set(descriptors), {Path(path).name for path in installer.BOOTSTRAP_IMPORTS})
            self.assertEqual(len(set(descriptors.values())), 5)
            for fd in descriptors.values():
                self.assertGreater(os.fstat(fd).st_size, 0)
            return write(*args)
        with patch.object(installer, "_bootstrap_read", side_effect=observe), \
             patch.object(installer, "_installation_task_handoff_write", side_effect=persist):
            result = self.writer.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_SAVED")
        for fd in descriptors.values():
            with self.assertRaises(OSError):
                os.fstat(fd)

    def test_invalid_source_bytes_reject_before_intent_marker_or_gates(self):
        self.source.write_bytes(self.source.read_bytes() + b"# changed before start\n")
        with self.assertRaises(ReleaseContractError):
            self.writer.observe()
        self.assertFalse(self.writer.base.marker.exists())
        self.assertFalse(self.writer.base.reloads)

    def test_same_bytes_source_replacement_after_writers_blocks_handoff_and_preserves_originals(self):
        persist = installer._persist_owned_installation_task_handoff
        def changed(*args, **kwargs):
            self.replace_source()
            return persist(*args, **kwargs)
        with patch.object(installer, "_persist_owned_installation_task_handoff", side_effect=changed), \
             self.assertRaises(ReleaseContractError):
            self.writer.observe()
        self.assertTrue(self.writer.saved.record_path().exists())
        self.assertTrue(self.writer.base.marker.exists())
        self.assertFalse(self.writer.target().exists())

    def test_source_permission_change_after_gate_files_blocks_reload(self):
        write = installer._write_temporary_gate_files
        def changed():
            result = write()
            self.source.chmod(0o644)
            return result
        with patch.object(installer, "_write_temporary_gate_files", side_effect=changed), \
             self.assertRaises(ReleaseContractError):
            self.writer.observe()
        self.assertTrue(self.writer.base.marker.exists())
        self.assertFalse(self.writer.base.reloads)
        self.assertEqual(self.source.stat().st_mode & 0o777, 0o644)

    def test_source_change_after_association_preserves_record_and_marker(self):
        write = installer._installation_task_handoff_write
        def changed(*args):
            result = write(*args)
            self.replace_source()
            return result
        with patch.object(installer, "_installation_task_handoff_write", side_effect=changed), \
             self.assertRaises(ReleaseContractError):
            self.writer.observe()
        self.assertTrue(self.writer.target().exists())
        self.assertTrue(self.writer.base.marker.exists())

    def test_unsupervised_branch_does_not_open_bootstrap_source_context(self):
        with patch.object(installer, "_bound_bootstrap_sources", side_effect=AssertionError("bootstrap binding")):
            self.writer.saved.observe()
        self.assertFalse(self.writer.target().exists())

    def test_low_level_supervised_call_without_live_source_check_refuses_before_namespace_creation(self):
        with patch.object(installer.os, "urandom", side_effect=AssertionError("namespace identity")), \
             self.assertRaises(ReleaseContractError):
            installer._write_installation_intent_locked({}, self.writer.materials.identity,
                {"sourceSha": self.writer.source}, recheck=lambda: None,
                save_writers=lambda *args: None, task_source_sha=self.writer.source)

    def test_missing_context_check_is_not_silently_treated_as_unsupervised(self):
        with patch.object(installer, "_bound_bootstrap_sources", return_value=contextlib.nullcontext()), \
             self.assertRaises(ReleaseContractError):
            self.writer.observe()
        self.assertFalse(self.writer.base.marker.exists())


class BoundCompleteInstallationTests(unittest.TestCase):
    def setUp(self):
        self.complete = completion.OwnedInstallationCompletionTests()
        self.complete.setUp()
        self.addCleanup(self.complete.doCleanups)
        self.policy = self.complete.base
        self.application = self.policy.base
        self.gate = self.application.phase.gate
        self.materials = self.gate.materials
        self.sha = "b" * 40
        self.bootstrap = supervised.provision_bound_sources(self, self.materials, self.sha)
        self.source = self.bootstrap / installer.BOOTSTRAP
        self.context = {"sourceSha": self.sha, "retentionId": self.materials.identity,
            "unit": installer.INSTALL_TASK_PREFIX + self.materials.identity + ".service",
            "invocationId": "e" * 32, "role": "run", "managerContextObserved": True,
            "installationComplete": False, "canExecute": False}
        self.manager_calls = 0

    def manager(self, source, retention, role, **kwargs):
        self.gate.assert_locks_held()
        self.assertEqual((source, retention, role), (self.sha, self.materials.identity, "run"))
        self.manager_calls += 1
        return dict(self.context)

    def observe(self):
        complete = installer._complete_installation
        def bound(*args, **kwargs):
            kwargs["task_source_sha"] = self.sha
            return complete(*args, **kwargs)
        with patch.object(installer, "_complete_installation", side_effect=bound), \
             patch.object(installer, "_installation_task_context", side_effect=self.manager):
            return self.complete.observe()

    def association(self):
        return self.gate.intent_path().with_name(installer.INSTALL_TASK_ORIGINALS_FILE)

    def test_complete_supervised_flow_retains_exact_binding_and_inert_audit(self):
        db = copy.deepcopy(self.application.docker.containers[self.application.docker.ids[3]])
        result = self.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_COMPLETE")
        self.assertTrue(result["installationComplete"])
        self.assertGreater(self.manager_calls, 2)
        self.assertFalse(self.gate.marker.exists())
        self.assertEqual(db, self.application.docker.containers[self.application.docker.ids[3]])
        association = json.loads(self.association().read_bytes())
        self.assertEqual(association["invocationId"], self.context["invocationId"])
        self.assertEqual(association["sourceSha"], self.sha)
        self.assertFalse(association["installationComplete"])
        self.assertFalse(association["canExecute"])
        self.assertFalse(json.loads(self.complete.path().read_bytes())["installationComplete"])

    def test_source_change_before_first_tool_write_blocks_write_and_keeps_frozen_originals(self):
        write = installer._write_installation_tool_member
        calls = []
        def changed(*args, **kwargs):
            calls.append(args[1])
            self.source.write_bytes(self.source.read_bytes() + b"# changed before tool write\n")
            return write(*args, **kwargs)
        with patch.object(installer, "_write_installation_tool_member", side_effect=changed), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.application.starts, [])
        self.assertTrue(self.gate.marker.exists())
        self.assertTrue(self.association().exists())
        self.complete.assert_contained()

    def test_source_change_after_application_start_contains_only_saved_original_ids(self):
        db = copy.deepcopy(self.application.docker.containers[self.application.docker.ids[3]])
        def changed(role, info):
            self.source.write_bytes(self.source.read_bytes() + b"# changed after start\n")
        self.application.after_start = changed
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.application.starts), 1)
        self.assertTrue(self.gate.marker.exists())
        self.complete.assert_contained()
        self.assertEqual(db, self.application.docker.containers[self.application.docker.ids[3]])
        self.assertTrue(all(row[2] in set(self.application.docker.ids[:3])
                            for row in self.application.phase.actions))

    def test_source_change_after_marker_clear_contains_without_recreating_marker_or_success_receipt(self):
        clear = installer._clear_owned_installation_marker
        def changed(*args, **kwargs):
            result = clear(*args, **kwargs)
            self.source.write_bytes(self.source.read_bytes() + b"# changed after clear\n")
            return result
        with patch.object(installer, "_clear_owned_installation_marker", side_effect=changed), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertFalse(self.gate.marker.exists())
        self.assertTrue(self.association().exists())
        self.assertFalse(json.loads(self.complete.path().read_bytes())["installationComplete"])
        self.complete.assert_contained()


if __name__ == "__main__":
    unittest.main()
