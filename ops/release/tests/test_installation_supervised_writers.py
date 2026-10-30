"""Supervised owned writer-stage binding; modeled manager, real private records and locks."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_saved_writers as saved
from release_contract import ReleaseContractError


class SupervisedWriterStageTests(unittest.TestCase):
    def setUp(self):
        self.saved = saved.InstallationSavedWritersTests()
        self.saved.setUp()
        self.addCleanup(self.saved.doCleanups)
        self.base = self.saved.base
        self.materials = self.saved.materials
        self.source = "b" * 40
        self.context = {"sourceSha": self.source, "retentionId": self.materials.identity,
            "unit": installer.INSTALL_TASK_PREFIX + self.materials.identity + ".service",
            "invocationId": "e" * 32, "role": "run", "managerContextObserved": True,
            "installationComplete": False, "canExecute": False}
        self.calls = 0

    def manager(self, source, retention, role, **kwargs):
        self.base.assert_locks_held()
        self.assertEqual((source, retention, role), (self.source, self.materials.identity, "run"))
        self.calls += 1
        return dict(self.context)

    def observe(self):
        def stage(retention, *, fetch):
            return installer._save_supervised_installation_writers(retention, self.source, fetch=fetch)
        with patch.object(installer, "_load_installation_deny_gates", side_effect=stage), \
             patch.object(installer, "_installation_task_context", side_effect=self.manager):
            return self.base.observe()

    def target(self):
        return self.base.intent_path().with_name(installer.INSTALL_TASK_ORIGINALS_FILE)

    def test_supervised_stage_binds_originals_without_freezing_or_installing(self):
        before = copy.deepcopy(self.base.combined.docker.containers)
        result = self.observe()
        self.assertGreater(self.calls, 2)
        intent, writers, identity = self.saved.originals()
        association = self.target().read_bytes()
        self.assertTrue(installer._installation_task_originals_match(
            association, self.context, intent, writers, identity)["originalRecordsMatched"])
        facts = result["installationIntent"]
        self.assertEqual(facts["taskHandoff"]["taskOriginalsSha256"], installer._hash(association))
        self.assertFalse(facts["writersFrozen"])
        self.assertFalse(facts["taskHandoff"]["canExecute"])
        self.assertEqual(before, self.base.combined.docker.containers)

    def test_writers_are_durable_and_original_locks_held_before_association(self):
        write = installer._installation_task_handoff_write
        def checked(root, context, intent, writers, identity):
            self.base.assert_locks_held()
            self.assertEqual(self.saved.record_path().read_bytes(), writers)
            self.assertEqual(self.base.intent_path().read_bytes(), intent)
            return write(root, context, intent, writers, identity)
        with patch.object(installer, "_installation_task_handoff_write", side_effect=checked):
            self.observe()

    def test_record_exists_before_freeze_continuation_can_run(self):
        original = installer._write_installation_intent_locked
        reached = []
        def freeze(*args):
            self.base.assert_locks_held()
            self.assertTrue(self.target().is_file())
            reached.append(True)
            raise RuntimeError("stop before modeled freeze")
        def wrapped(*args, **kwargs):
            kwargs["freeze_writers"] = freeze
            return original(*args, **kwargs)
        with patch.object(installer, "_write_installation_intent_locked", side_effect=wrapped), \
             self.assertRaisesRegex(RuntimeError, "modeled freeze"):
            self.observe()
        self.assertEqual(reached, [True])

    def test_manager_failure_precedes_marker_and_gate_writes(self):
        with patch.object(self, "manager", side_effect=ReleaseContractError("manager unavailable")), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(self.base.marker.exists())
        self.assertFalse(self.base.reloads)

    def test_changed_generation_after_association_is_preserved_and_blocks_success(self):
        write = installer._installation_task_handoff_write
        def changed(*args):
            result = write(*args)
            self.context["invocationId"] = "f" * 32
            return result
        with patch.object(installer, "_installation_task_handoff_write", side_effect=changed), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(json.loads(self.target().read_bytes())["invocationId"], "e" * 32)
        self.assertTrue(self.base.marker.exists())

    def test_sync_unknown_keeps_file_and_marker_without_replay(self):
        write = installer._installation_task_handoff_write
        def failed(*args):
            with patch.object(installer.os, "fsync", side_effect=OSError("modeled sync unknown")):
                return write(*args)
        with patch.object(installer, "_installation_task_handoff_write", side_effect=failed), \
             self.assertRaises(OSError):
            self.observe()
        self.assertTrue(self.target().exists())
        self.assertTrue(self.base.marker.exists())

    def test_unsupervised_writer_entry_never_queries_manager_or_creates_association(self):
        with patch.object(installer, "_installation_task_context", side_effect=AssertionError("manager query")):
            self.saved.observe()
        self.assertFalse(self.target().exists())

    def test_wrong_source_or_missing_writer_stage_refuses_before_marker(self):
        self.source = "f" * 40
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(self.base.marker.exists())
        with self.assertRaises(ReleaseContractError):
            installer._observe_installed_runtime(self.materials.identity, _task_source_sha="b" * 40)

    def test_missing_manager_observation_cannot_silently_disable_binding(self):
        with patch.object(self, "manager", return_value=None), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(self.base.marker.exists())

    def test_full_install_wrapper_passes_explicit_source_without_changing_default(self):
        with patch.object(installer, "_observe_installed_runtime", return_value={}) as observe:
            installer._complete_installation("a" * 64, {}, input_fd=1, output_fd=2, task_source_sha=self.source)
        self.assertEqual(observe.call_args.kwargs["_task_source_sha"], self.source)


if __name__ == "__main__":
    unittest.main()
