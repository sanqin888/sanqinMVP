"""Owned freeze models: original IDs only, no production Docker or systemd calls."""
import copy
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_saved_writers as saved
import test_installation_docker as clients
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationFreezeWritersTests(unittest.TestCase):
    def setUp(self):
        self.saved = saved.InstallationSavedWritersTests()
        self.saved.setUp()
        self.addCleanup(self.saved.doCleanups)
        self.gate = self.saved.base
        self.docker = self.gate.combined.docker
        self.actions = []
        self.after_mutation = None

    def mutate(self, intent, writers, identity, role, action, *, deadline):
        self.gate.assert_locks_held()
        self.assertTrue(self.saved.record_path().exists())
        value = installer._installation_writers_match(intent, writers, identity)
        identifier = value["containers"][role]["containerId"]
        self.assertNotEqual(identifier, value["containers"]["db"]["containerId"])
        self.actions.append((role, action, identifier))
        info = self.docker.containers[identifier]
        if action == "disable-restart":
            info["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
        elif action == "stop":
            info["State"].update(Running=False, Status="exited")
        else:
            raise AssertionError("unreviewed mutation")
        if self.after_mutation:
            self.after_mutation(role, action)

    def observe(self):
        with patch.object(installer, "_save_installation_writers", side_effect=installer._freeze_installation_writers), \
             patch.object(installer, "_installation_writer_command", side_effect=self.mutate):
            return self.saved.observe()

    def assert_fenced_failure(self, mutate):
        self.after_mutation = mutate
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue(self.gate.marker.exists())
        self.assertTrue(self.saved.record_path().exists())
        original_ids = set(self.docker.ids[:3])
        self.assertTrue(all(row[2] in original_ids for row in self.actions))

    def test_owned_sequence_freezes_only_saved_writers_with_db_and_original_records_unchanged(self):
        db = copy.deepcopy(self.docker.containers[self.docker.ids[3]])
        runtime = self.docker.config.runtime
        config = {name: (runtime / name).read_bytes() for name in installer.CONFIGURATION_NAMES}
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("unmodeled process")):
            result = self.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_FROZEN")
        facts = result["installationIntent"]
        self.assertTrue(facts["writersFrozen"])
        self.assertTrue(facts["frozenWriters"]["writersFrozen"])
        self.assertFalse(facts["frozenWriters"]["recoveryReady"])
        self.assertFalse(result["canExecute"])
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["operationSuccessProven"])
        self.assertEqual(self.actions, [(role, "disable-restart", self.docker.ids[index])
                                        for index, role in enumerate(installer.INSTALL_WRITER_ROLES)]
                         + [(role, "stop", self.docker.ids[index]) for index, role in
                            reversed(list(enumerate(installer.INSTALL_WRITER_ROLES)))])
        self.assertEqual(db, self.docker.containers[self.docker.ids[3]])
        self.assertEqual(config, {name: (runtime / name).read_bytes() for name in installer.CONFIGURATION_NAMES})
        intent, raw, identity = self.saved.originals()
        value = installer._installation_writers_match(intent, raw, identity)
        self.assertFalse(value["canExecute"])
        self.assertEqual(value["containers"]["ubereats-worker"]["restartPolicy"],
                         {"Name": "on-failure", "MaximumRetryCount": 3})
        self.assertEqual(set(self.saved.record_path().parent.iterdir()),
                         {self.saved.record_path(), self.gate.intent_path()})

    def test_saved_only_entry_never_executes_writer_mutations(self):
        with patch.object(installer, "_installation_writer_command", side_effect=AssertionError("mutation")):
            result = self.saved.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_SAVED")
        self.assertFalse(result["installationIntent"]["writersFrozen"])
        self.assertFalse(self.actions)

    def test_pre_mutation_observation_failure_does_not_issue_containment_commands(self):
        with patch.object(installer, "_installation_writer_observation",
                          side_effect=ReleaseContractError("modeled pre-mutation drift")), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(self.actions)
        self.assertTrue(self.saved.record_path().exists())

    def test_late_pre_first_action_drift_does_not_start_containment(self):
        original = installer._installation_writer_observation
        calls = []
        def racing(*args, **kwargs):
            calls.append(True)
            if len(calls) == 2:
                raise ReleaseContractError("modeled drift just before first action")
            return original(*args, **kwargs)
        with patch.object(installer, "_installation_writer_observation", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(len(calls), 2)
        self.assertFalse(self.actions)
        self.assertTrue(self.saved.record_path().exists())

    def test_lost_first_update_result_attempts_containment_without_success_or_replay(self):
        done = []
        def fail_once(role, action):
            if not done:
                done.append(True)
                raise OSError("modeled lost mutation response")
        self.assert_fenced_failure(fail_once)
        self.assertEqual(len(self.actions), 7)
        self.assertTrue(all(self.docker.containers[identifier]["State"]["Running"] is False for identifier in self.docker.ids[:3]))
        count = len(self.actions)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(len(self.actions), count)

    def test_every_containment_action_is_bounded_best_effort_and_never_restores_a_policy(self):
        def always_unknown(role, action):
            raise OSError("modeled all results unknown")
        self.assert_fenced_failure(always_unknown)
        self.assertEqual(len(self.actions), 7)
        self.assertEqual([row[1] for row in self.actions[-6:]], ["disable-restart"] * 3 + ["stop"] * 3)

    def test_lost_stop_result_does_not_become_a_success_after_containment(self):
        done = []
        def fail_stop(role, action):
            if action == "stop" and not done:
                done.append(True)
                raise OSError("modeled stop response lost")
        self.assert_fenced_failure(fail_stop)
        self.assertEqual(len(self.actions), 10)

    def test_marker_drift_after_first_update_is_preserved_while_only_original_ids_are_contained(self):
        def racing(role, action):
            if len(self.actions) == 1:
                self.gate.marker.write_bytes(b"unknown maintenance evidence")
        self.assert_fenced_failure(racing)
        self.assertEqual(self.gate.marker.read_bytes(), b"unknown maintenance evidence")

    def test_saved_record_drift_never_changes_the_in_memory_containment_targets(self):
        def racing(role, action):
            if len(self.actions) == 1:
                self.saved.record_path().write_bytes(b"unknown saved record")
        self.assert_fenced_failure(racing)
        self.assertEqual(self.saved.record_path().read_bytes(), b"unknown saved record")

    def test_gate_drift_after_mutation_keeps_the_real_gate_bytes_and_fences(self):
        path = self.gate.manager.directory / "docker.service.d" / installer.INSTALL_GATE_NAME
        def racing(role, action):
            if len(self.actions) == 1:
                path.write_bytes(b"unknown gate")
        self.assert_fenced_failure(racing)
        self.assertEqual(path.read_bytes(), b"unknown gate")

    def test_extra_container_is_not_inferred_as_a_new_stop_target(self):
        extra = "e" * 64
        def racing(role, action):
            if len(self.actions) == 1:
                self.docker.ids.append(extra)
                self.docker.containers[extra] = copy.deepcopy(self.docker.containers[self.docker.ids[0]])
                self.docker.containers[extra]["Id"] = extra
        self.assert_fenced_failure(racing)
        self.assertTrue(self.docker.containers[extra]["State"]["Running"])
        self.assertNotIn(extra, [row[2] for row in self.actions])

    def test_database_restart_drift_is_detected_and_database_never_becomes_a_mutation_target(self):
        def racing(role, action):
            if len(self.actions) == 1:
                self.docker.containers[self.docker.ids[3]]["RestartCount"] += 1
        self.assert_fenced_failure(racing)
        self.assertTrue(self.docker.containers[self.docker.ids[3]]["State"]["Running"])

    def test_inaccurate_policy_update_is_not_assumed_successful(self):
        def racing(role, action):
            if len(self.actions) == 1:
                self.docker.containers[self.docker.ids[0]]["HostConfig"]["RestartPolicy"] = {
                    "Name": "always", "MaximumRetryCount": 0}
        self.assert_fenced_failure(racing)

    def test_successful_stop_response_with_writer_still_running_is_fenced(self):
        def racing(role, action):
            if len(self.actions) == 4:
                self.docker.containers[self.docker.ids[2]]["State"].update(Running=True, Status="running")
        self.assert_fenced_failure(racing)

    def test_same_id_container_lifetime_change_is_not_accepted(self):
        def racing(role, action):
            if len(self.actions) == 1:
                self.docker.containers[self.docker.ids[1]]["State"]["StartedAt"] = "2026-10-28T00:00:00Z"
        self.assert_fenced_failure(racing)

    def test_mount_change_is_detected_before_next_primary_operation(self):
        def racing(role, action):
            if len(self.actions) == 1:
                self.docker.containers[self.docker.ids[1]]["Mounts"][0]["Source"] = "/different"
        self.assert_fenced_failure(racing)
        self.assertEqual(len(self.actions), 7)

    def test_post_stop_database_history_change_prevents_freeze_success(self):
        def racing(role, action):
            if len(self.actions) == 6:
                self.gate.combined.base.base.database["history"][0]["sha256"] = "f" * 64
        self.assert_fenced_failure(racing)
        self.assertEqual(len(self.actions), 12)

    def test_post_stop_backup_original_change_prevents_freeze_success(self):
        path = self.gate.manager.directory / "sanq-backup.timer"
        def racing(role, action):
            if len(self.actions) == 6:
                path.write_bytes(b"unknown backup unit")
        self.assert_fenced_failure(racing)
        self.assertEqual(path.read_bytes(), b"unknown backup unit")

    def test_full_observer_chain_and_no_public_freeze_or_resume_cli(self):
        for flags in ({"_freeze_writers": True}, {"_freeze_writers": "yes", "_save_writers": True}):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.saved.materials.identity, **flags)
        for command in ("freeze-installation-writers", "freeze", "resume", "install"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


class InstallationFreezeClientTests(unittest.TestCase):
    def setUp(self):
        self.base = saved.InstallationSavedWritersTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.base.observe()
        self.intent, self.writers, self.identity = self.base.originals()
        self.client = clients.DockerObservationClientTests()
        self.client.setUp()
        self.addCleanup(self.client.doCleanups)

    def test_only_dedicated_bound_record_client_can_execute_exact_argv(self):
        identifier = self.base.base.combined.docker.ids[0]
        for action in ("disable-restart", "stop"):
            process = self.client.process(output=(identifier + "\n").encode())
            with patch.object(installer.subprocess, "Popen", return_value=process) as spawn:
                installer._installation_writer_command(self.intent, self.writers, self.identity, "api", action,
                                                       deadline=installer.time.monotonic() + 60)
            args = installer._saved_writer_args(self.intent, self.writers, self.identity, "api", action)
            self.assertEqual(spawn.call_args.args[0], args)
            self.assertTrue(spawn.call_args.kwargs["start_new_session"])
            self.assertNotIn("shell", spawn.call_args.kwargs)
            for read in (installer._docker_command, installer._observation_command, installer._bounded_host_client):
                with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                    read(args, deadline=installer.time.monotonic() + 60)
                spawn.assert_not_called()

    def test_stop_gets_45_seconds_for_30_second_docker_grace_and_others_keep_30(self):
        identifier = self.base.base.combined.docker.ids[0]
        for action in ("stop", "disable-restart"):
            process = self.client.process(output=(identifier + "\n").encode())
            with patch.object(installer.subprocess, "Popen", return_value=process), \
                 patch.object(installer.time, "monotonic", side_effect=[0, 0] + [40] * 20), \
                 patch.object(installer.os, "killpg") as kill:
                if action == "stop":
                    installer._installation_writer_command(self.intent, self.writers, self.identity, "api", action, deadline=100)
                    kill.assert_not_called()
                else:
                    with self.assertRaises(ReleaseContractError):
                        installer._installation_writer_command(self.intent, self.writers, self.identity, "api", action, deadline=100)
                    kill.assert_called_once_with(process.pid, installer.signal.SIGKILL)

    def test_bad_proof_database_role_output_failure_or_expired_budget_never_counts_as_success(self):
        args = installer._saved_writer_args(self.intent, self.writers, self.identity, "api", "stop")
        for proof in (True, (), (self.intent, self.writers, self.identity, "db", "stop")):
            with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                installer._bounded_host_client(args, deadline=installer.time.monotonic() + 10, _writer=proof)
            spawn.assert_not_called()
        process = self.client.process(output=b"unexpected")
        with patch.object(installer.subprocess, "Popen", return_value=process), self.assertRaises(ReleaseContractError):
            installer._installation_writer_command(self.intent, self.writers, self.identity, "api", "stop",
                                                   deadline=installer.time.monotonic() + 60)
        for output, error, code, limit in ((b"", b"private error", 2, 4096), (b"\xff", b"", 0, 4096),
                                           (b"x" * 1024, b"", 0, 128)):
            process = self.client.process(output=output, error=error, code=code)
            with patch.object(installer.subprocess, "Popen", return_value=process), \
                 patch.object(installer, "MAX_HOST_OUTPUT", limit), patch.object(installer.os, "killpg") as kill, \
                 self.assertRaises(ReleaseContractError) as caught:
                installer._installation_writer_command(self.intent, self.writers, self.identity, "api", "stop",
                                                       deadline=installer.time.monotonic() + 60)
            kill.assert_called_once_with(process.pid, installer.signal.SIGKILL)
            self.assertNotIn("private error", str(caught.exception))
        with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
            installer._installation_writer_command(self.intent, self.writers, self.identity, "api", "stop",
                                                   deadline=installer.time.monotonic() - 1)
        spawn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
