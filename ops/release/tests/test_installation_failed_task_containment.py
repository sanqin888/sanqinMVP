"""Failed stop-post containment with real private records/locks and modeled host clients."""
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
from release_contract import ReleaseContractError


class FailedTaskContainmentTests(unittest.TestCase):
    def setUp(self):
        self.writer = supervised.SupervisedWriterStageTests()
        self.writer.setUp()
        self.addCleanup(self.writer.doCleanups)
        self.writer.observe()
        self.root = self.writer.base.intent_path().parent
        self.docker = self.writer.base.combined.docker
        self.context = {**self.writer.context, "role": "cleanup"}
        self.environment = {"SERVICE_RESULT": "signal", "EXIT_CODE": "killed", "EXIT_STATUS": "KILL"}
        self.actions = []
        self.after_action = None

    def manager(self, source, retention, role, **kwargs):
        self.writer.base.assert_locks_held()
        self.assertEqual((source, retention, role), (self.writer.source, self.writer.materials.identity, "cleanup"))
        return dict(self.context)

    def command(self, intent, writers, identity, role, action, **kwargs):
        self.writer.base.assert_locks_held()
        args = installer._saved_writer_args(intent, writers, identity, role, action)
        self.assertIn(args[-1], self.docker.ids[:3])
        self.actions.append((role, action, args[-1]))
        row = self.docker.containers[args[-1]]
        if action == "disable-restart":
            row["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
        else:
            row["State"].update(Running=False, Status="exited")
        if self.after_action:
            self.after_action()

    def contain(self, command=None):
        with patch.dict(os.environ, self.environment), \
             patch.object(installer, "_installation_task_context", side_effect=self.manager), \
             patch.object(installer, "_installation_writer_command", side_effect=self.command if command is None else command), \
             patch.object(installer, "_observation_command", side_effect=lambda args, **kwargs: self.docker.observe_command(args)):
            return installer._contain_failed_installation_task(self.writer.materials.identity, self.writer.source,
                fetch=self.writer.materials.case.fetch)

    def originals(self):
        return {path.name: path.read_bytes() for path in self.root.iterdir() if path.is_file()}

    def assert_stopped(self):
        for identifier in self.docker.ids[:3]:
            row = self.docker.containers[identifier]
            self.assertFalse(row["State"]["Running"])
            self.assertEqual(row["HostConfig"]["RestartPolicy"], {"Name": "no", "MaximumRetryCount": 0})

    def test_failed_task_uses_original_order_and_ids_without_mutating_records_marker_or_database(self):
        records, marker = self.originals(), self.writer.base.marker.read_bytes()
        # The CI repair must not broaden the general private-directory name allowlist.
        with self.assertRaisesRegex(ReleaseContractError, "unreviewed private directory"):
            with installer._private_directory(-1, installer.INSTALLATION_RUNS):
                self.fail("general directory helper accepted the transaction namespace")
        db = copy.deepcopy(self.docker.containers[self.docker.ids[3]])
        result = self.contain()
        expected = [(role, "disable-restart") for role in installer.INSTALL_WRITER_ROLES]
        expected += [(role, "stop") for role in reversed(installer.INSTALL_WRITER_ROLES)]
        self.assertEqual([(role, action) for role, action, _ in self.actions], expected)
        self.assert_stopped()
        self.assertEqual(records, self.originals())
        self.assertEqual(marker, self.writer.base.marker.read_bytes())
        self.assertEqual(db, self.docker.containers[self.docker.ids[3]])
        self.assertTrue(result["originalWritersStoppedObserved"])
        self.assertFalse(result["installationComplete"])
        self.assertFalse(result["canExecute"])
        self.assertFalse(result["restoreProven"])

    def test_nonzero_exit_and_success_result_with_signal_are_failure_candidates(self):
        with patch.dict(os.environ, {"SERVICE_RESULT": "exit-code", "EXIT_CODE": "exited", "EXIT_STATUS": "1"}):
            self.assertEqual(installer._failed_installation_task_status(), ("exit-code", "exited", "1"))
        self.environment.update(SERVICE_RESULT="success", EXIT_STATUS="TERM")
        self.contain()
        self.assert_stopped()

    def test_clean_exit_does_not_authorize_containment_or_installation_success(self):
        self.environment.update(SERVICE_RESULT="success", EXIT_CODE="exited", EXIT_STATUS="0")
        with self.assertRaises(ReleaseContractError):
            self.contain()
        self.assertEqual(self.actions, [])

    def test_unknown_missing_noncanonical_and_inconsistent_status_values_refuse(self):
        for result, code, status in ((None, None, None), ("other", "exited", "1"),
                                    ("exit-code", "exited", "0"), ("exit-code", "exited", "01"),
                                    ("exit-code", "exited", "256"), ("signal", "exited", "1"),
                                    ("core-dump", "killed", "KILL"), ("signal", "killed", "SIGKILL"),
                                    ("signal", "killed", "KILL;bad")):
            self.environment = dict(zip(("SERVICE_RESULT", "EXIT_CODE", "EXIT_STATUS"), (result, code, status)))
            # Missing manager variables are represented by absent keys, never os.environ None values.
            self.environment = {key: value for key, value in self.environment.items() if value is not None}
            with self.subTest(values=(result, code, status)), patch.dict(os.environ, {}, clear=True), \
                 self.assertRaises(ReleaseContractError):
                self.contain()
        self.assertEqual(self.actions, [])

    def test_wrong_manager_generation_cannot_adopt_old_task_originals(self):
        self.context["invocationId"] = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.contain()
        self.assertEqual(self.actions, [])

    def test_missing_association_refuses_without_rediscovering_or_saving_writers(self):
        self.writer.target().unlink()
        with self.assertRaises((ReleaseContractError, OSError)):
            self.contain()
        self.assertEqual(self.actions, [])
        self.assertTrue(self.writer.base.marker.exists())

    def test_unknown_record_blocks_before_any_mutation(self):
        extra = self.root / "unknown.partial"
        extra.write_bytes(b"preserve")
        with self.assertRaises(ReleaseContractError):
            self.contain()
        self.assertEqual(self.actions, [])
        self.assertEqual(extra.read_bytes(), b"preserve")

    def test_second_transaction_blocks_before_any_mutation(self):
        other = self.root.parent / ("f" * 64)
        other.mkdir(mode=0o700)
        with self.assertRaises(ReleaseContractError):
            self.contain()
        self.assertEqual(self.actions, [])
        self.assertTrue(other.exists())

    def test_known_partial_auxiliary_material_is_not_loaded_as_containment_permission(self):
        partial = self.root / installer.INSTALL_COMPLETION_FILE
        partial.write_bytes(b"partial inert audit")
        partial.chmod(0o600)
        recovery = self.root / "recovery"
        recovery.mkdir(mode=0o700)
        (recovery / "partial").write_bytes(b"unknown recovery output")
        self.contain()
        self.assert_stopped()
        self.assertEqual(partial.read_bytes(), b"partial inert audit")
        self.assertTrue((recovery / "partial").exists())

    def test_command_lost_reply_attempts_other_original_actions_once_and_remains_unknown(self):
        def unknown(*args, **kwargs):
            self.command(*args, **kwargs)
            if len(self.actions) == 1:
                raise OSError("lost reply")
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.contain(unknown)
        self.assertEqual(len(self.actions), 6)
        self.assertEqual(len(set(self.actions)), 6)
        self.assert_stopped()
        self.assertTrue(self.writer.base.marker.exists())

    def test_acknowledgments_without_stopped_state_do_not_claim_a_fence(self):
        def ineffective(intent, writers, identity, role, action, **kwargs):
            args = installer._saved_writer_args(intent, writers, identity, role, action)
            self.actions.append((role, action, args[-1]))
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.contain(ineffective)
        self.assertEqual(len(self.actions), 6)
        self.assertTrue(self.docker.containers[self.docker.ids[0]]["State"]["Running"])

    def test_boolean_restart_retry_count_cannot_pass_final_state_verification(self):
        def malformed():
            if len(self.actions) == 6:
                self.docker.containers[self.docker.ids[0]]["HostConfig"]["RestartPolicy"]["MaximumRetryCount"] = False
        self.after_action = malformed
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.contain()
        self.assertEqual(len(self.actions), 6)

    def test_record_same_bytes_replacement_after_first_action_blocks_further_actions(self):
        def replace():
            target = self.root / "writers.json"
            other = target.with_suffix(".replacement")
            other.write_bytes(target.read_bytes())
            other.chmod(0o600)
            other.replace(target)
        self.after_action = replace
        with self.assertRaises(ReleaseContractError):
            self.contain()
        self.assertEqual(len(self.actions), 1)

    def test_source_change_after_first_action_blocks_further_actions(self):
        def changed():
            source = self.writer.bootstrap / installer.BOOTSTRAP
            source.write_bytes(source.read_bytes() + b"# changed during cleanup\n")
        self.after_action = changed
        with self.assertRaises(ReleaseContractError):
            self.contain()
        self.assertEqual(len(self.actions), 1)

    def test_manager_generation_change_after_first_action_blocks_further_actions(self):
        self.after_action = lambda: self.context.update(invocationId="f" * 32)
        with self.assertRaises(ReleaseContractError):
            self.contain()
        self.assertEqual(len(self.actions), 1)

    def test_absent_marker_is_not_success_and_is_not_recreated_during_late_failure_containment(self):
        self.writer.base.marker.unlink()
        self.contain()
        self.assert_stopped()
        self.assertFalse(self.writer.base.marker.exists())

    def test_foreign_marker_is_preserved_and_blocks_mutations(self):
        self.writer.base.marker.write_bytes(b"foreign marker")
        with self.assertRaises((ReleaseContractError, ValueError)):
            self.contain()
        self.assertEqual(self.actions, [])
        self.assertEqual(self.writer.base.marker.read_bytes(), b"foreign marker")


if __name__ == "__main__":
    unittest.main()
