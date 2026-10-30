"""Original restart policy restoration. Host clients and containers are modeled only."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_old_application as application
from release_contract import ReleaseContractError


class RestartPolicyRestorationTests(unittest.TestCase):
    def setUp(self):
        self.base = application.ApplicationObservationTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.configure({"api": {"Name": "always", "MaximumRetryCount": 0},
                        "ubereats-worker": {"Name": "on-failure", "MaximumRetryCount": 3},
                        "web": {"Name": "unless-stopped", "MaximumRetryCount": 0}})
        for role in installer.INSTALL_WRITER_ROLES:
            self.base.started(role)
        self.progress = self.base.progress
        self.progress.update(requireHealthy=True, attempted=True, binding={"model": True})
        self.commands = []
        self.http = "200"

    def configure(self, policies):
        for role, policy in policies.items():
            self.base.docker["containers"][role]["restartPolicy"] = dict(policy)
        self.base.writers = installer._installation_writers_bytes(self.base.intent, self.base.identity,
            "d" * 40, self.base.docker, created_at="2026-10-29T18:00:00Z")
        self.base.progress["writers"] = self.base.writers

    def command(self, intent, writers, identity, role, **kwargs):
        args = installer._saved_restart_policy_args(intent, writers, identity, role)
        self.commands.append((role, args[-1], args[-2]))
        policy = json.loads(writers)["containers"][role]["restartPolicy"]
        self.base.infos[args[-1]]["HostConfig"]["RestartPolicy"] = dict(policy)

    def contain(self, intent, writers, identity, role, action, **kwargs):
        args = installer._saved_writer_args(intent, writers, identity, role, action)
        info = self.base.infos[args[-1]]
        if action == "disable-restart":
            info["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
        else:
            info["State"].update(Running=False, Status="exited")

    def restore(self, command=None):
        with patch.object(installer, "_installation_restart_policy_command", side_effect=self.command if command is None else command), \
             patch.object(installer, "_runtime_command", return_value=self.http):
            return installer._restore_saved_installation_policies(self.progress,
                run=self.base.run_command, check_context=self.base.observe,
                deadline=installer.time.monotonic() + 60)

    def failure(self, command=None):
        with patch.object(installer, "_installation_writer_command", side_effect=self.contain) as contain, \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            with installer._installation_application_ownership(self.progress):
                self.restore(command)
        self.assertEqual(contain.call_count, 6)
        for role in installer.INSTALL_WRITER_ROLES:
            info = self.base.infos[self.base.docker["containers"][role]["containerId"]]
            self.assertEqual(info["HostConfig"]["RestartPolicy"], {"Name": "no", "MaximumRetryCount": 0})
            self.assertFalse(info["State"]["Running"])

    def test_exact_fixed_argv_preserves_all_supported_original_policy_modes(self):
        for policy, argument in (({"Name": "no", "MaximumRetryCount": 0}, "no"),
                                 ({"Name": "always", "MaximumRetryCount": 0}, "always"),
                                 ({"Name": "unless-stopped", "MaximumRetryCount": 0}, "unless-stopped"),
                                 ({"Name": "on-failure", "MaximumRetryCount": 0}, "on-failure:0"),
                                 ({"Name": "on-failure", "MaximumRetryCount": 7}, "on-failure:7")):
            self.configure({"api": policy})
            self.assertEqual(installer._saved_restart_policy_args(self.base.intent, self.base.writers, self.base.identity, "api"),
                [*installer.DOCKER, "update", "--restart=" + argument, self.base.docker["containers"]["api"]["containerId"]])
        for role in ("db", "other", "api;bad"):
            with self.subTest(role=role), self.assertRaises(ReleaseContractError):
                installer._saved_restart_policy_args(self.base.intent, self.base.writers, self.base.identity, role)

    def test_client_requires_exact_echo_and_unknown_reply_is_not_retried(self):
        identifier = self.base.docker["containers"]["api"]["containerId"]
        with patch.object(installer, "_bounded_host_client", return_value=identifier + "\n") as client:
            installer._installation_restart_policy_command(self.base.intent, self.base.writers, self.base.identity, "api", deadline=123)
        self.assertEqual(client.call_args.kwargs["_policy_restore"], (self.base.intent, self.base.writers, self.base.identity, "api"))
        for reply in ("", "other", identifier + "\nextra"):
            with patch.object(installer, "_bounded_host_client", return_value=reply) as client, self.assertRaises(ReleaseContractError):
                installer._installation_restart_policy_command(self.base.intent, self.base.writers, self.base.identity, "api", deadline=123)
            self.assertEqual(client.call_count, 1)
        with patch.object(installer, "_bounded_host_client", side_effect=OSError("unknown")) as client, self.assertRaises(OSError):
            installer._installation_restart_policy_command(self.base.intent, self.base.writers, self.base.identity, "api", deadline=123)
        self.assertEqual(client.call_count, 1)

    def test_policy_client_cannot_enter_general_observer_or_mix_mutation_modes(self):
        args = installer._saved_restart_policy_args(self.base.intent, self.base.writers, self.base.identity, "api")
        permit = (self.base.intent, self.base.writers, self.base.identity, "api")
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("spawn")):
            with self.assertRaises(ReleaseContractError):
                installer._observation_command(args, deadline=installer.time.monotonic() + 60)
            for wrong, extra in ((args[:-1] + ["f" * 64], {}),
                                 (args, {"_application_start": permit}),
                                 (args, {"_installation_gate_api": True}),
                                 (args, {"_writer": (*permit, "disable-restart")})):
                with self.subTest(extra=extra), self.assertRaises(ReleaseContractError):
                    installer._bounded_host_client(wrong, deadline=installer.time.monotonic() + 60, _policy_restore=permit, **extra)

    def test_ordered_restore_keeps_original_evidence_and_current_lifetimes_unchanged(self):
        original, lifetime = self.base.writers, copy.deepcopy(self.progress["started"])
        db = copy.deepcopy(self.base.infos[self.base.docker["containers"]["db"]["containerId"]])
        result = self.restore()
        self.assertEqual([row[0] for row in self.commands], list(installer.INSTALL_WRITER_ROLES))
        self.assertTrue(result["restartPoliciesRestored"])
        self.assertFalse(result["writersRestartInhibited"])
        self.assertFalse(result["requiresRestartPolicyRestoration"])
        self.assertTrue(result["requiresInstallationCompletion"])
        self.assertFalse(result["installationComplete"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(set(result["restartPolicyReadiness"]), set(installer.READINESS_URLS))
        self.assertEqual(self.base.writers, original)
        self.assertEqual(self.progress["started"], lifetime)
        self.assertEqual(db, self.base.infos[self.base.docker["containers"]["db"]["containerId"]])

    def test_original_no_policies_are_verified_without_unnecessary_update(self):
        self.configure({role: {"Name": "no", "MaximumRetryCount": 0} for role in installer.INSTALL_WRITER_ROLES})
        result = self.restore(lambda *args, **kwargs: self.fail("unnecessary update"))
        self.assertTrue(result["restartPoliciesRestored"])
        self.assertTrue(result["writersRestartInhibited"])
        self.assertEqual(self.commands, [])

    def test_unwritten_policy_cannot_be_adopted_and_restoration_progress_must_be_native(self):
        identifier = self.base.docker["containers"]["web"]["containerId"]
        self.base.infos[identifier]["HostConfig"]["RestartPolicy"] = {"Name": "unless-stopped", "MaximumRetryCount": 0}
        with self.assertRaises(ReleaseContractError):
            self.base.observe()
        self.base.infos[identifier]["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
        self.progress["restoredPolicies"] = ["api"]
        with self.assertRaises(ReleaseContractError):
            self.base.observe()

    def test_successful_reply_without_policy_change_is_rejected_and_contains(self):
        self.failure(lambda *args, **kwargs: None)

    def test_policy_applied_with_lost_reply_is_not_adopted_or_retried(self):
        def unknown(*args, **kwargs):
            self.command(*args, **kwargs)
            raise OSError("reply lost")
        self.failure(unknown)
        self.assertEqual(len(self.commands), 1)

    def test_completed_policy_late_change_blocks_remaining_roles_and_contains(self):
        def changed(*args, **kwargs):
            self.command(*args, **kwargs)
            if args[3] == "ubereats-worker":
                self.base.infos[self.base.docker["containers"]["api"]["containerId"]]["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
        self.failure(changed)
        self.assertEqual(len(self.commands), 2)

    def test_application_restart_during_policy_update_is_rejected_and_contains(self):
        def restarted(*args, **kwargs):
            self.command(*args, **kwargs)
            self.base.infos[self.commands[-1][1]]["RestartCount"] += 1
        self.failure(restarted)

    def test_post_policy_readiness_failure_contains_all_originals(self):
        self.http = "503"
        self.failure()
        self.assertEqual(len(self.commands), 3)

    def test_expired_or_not_ready_context_cannot_issue_any_policy_update(self):
        with patch.object(installer, "_installation_restart_policy_command", side_effect=AssertionError("update")):
            with self.assertRaises(ReleaseContractError):
                installer._restore_saved_installation_policies(self.progress, run=self.base.run_command,
                    check_context=self.base.observe, deadline=installer.time.monotonic() - 1)
            self.progress["requireHealthy"] = False
            with self.assertRaises(ReleaseContractError):
                installer._restore_saved_installation_policies(self.progress, run=self.base.run_command,
                    check_context=self.base.observe, deadline=installer.time.monotonic() + 60)

    def test_completed_policy_stage_cannot_replay_from_its_in_memory_progress(self):
        self.restore()
        with patch.object(installer, "_installation_restart_policy_command", side_effect=AssertionError("replay")), self.assertRaises(ReleaseContractError):
            installer._restore_saved_installation_policies(self.progress, run=self.base.run_command,
                check_context=self.base.observe, deadline=installer.time.monotonic() + 60)
        self.assertEqual(len(self.commands), 3)


class OwnedRestartPolicyTests(unittest.TestCase):
    def setUp(self):
        self.base = application.OwnedApplicationVerificationTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.commands = []
        self.after_policy = None
        self.http = "200"
        self.http_calls = []

    def command(self, intent, writers, identity, role, **kwargs):
        self.base.phase.gate.assert_locks_held()
        self.assertEqual(len(self.base.starts), 3)
        self.assertEqual(self.base.http_calls, list(installer.READINESS_URLS))
        self.assertTrue(self.base.phase.gate.marker.exists())
        args = installer._saved_restart_policy_args(intent, writers, identity, role)
        self.commands.append((role, args[-1], args[-2]))
        info = self.base.docker.containers[args[-1]]
        info["HostConfig"]["RestartPolicy"] = dict(json.loads(writers)["containers"][role]["restartPolicy"])
        if self.after_policy:
            self.after_policy(role, info)

    def observe(self, client=None):
        restore = installer._restore_saved_installation_policies
        def checked(*args, **kwargs):
            command = installer._runtime_command
            def http(args, **kwargs):
                if tuple(args[:-1]) == installer.CURL_ARGS:
                    self.http_calls.append(args[-1])
                    return self.http
                return command(args, **kwargs)
            with patch.object(installer, "_runtime_command", side_effect=http):
                return restore(*args, **kwargs)
        with patch.object(installer, "_verify_installation_old_application", side_effect=installer._restore_installation_restart_policies), \
             patch.object(installer, "_installation_restart_policy_command", side_effect=self.command), \
             patch.object(installer, "_restore_saved_installation_policies", side_effect=checked):
            return self.base.observe(client)

    def test_owned_restore_runs_after_readiness_and_keeps_marker_and_original_objects(self):
        db = copy.deepcopy(self.base.docker.containers[self.base.docker.ids[3]])
        result = self.observe()
        intent = result["installationIntent"]
        facts = intent["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_RESTART_POLICIES_RESTORED_MAINTENANCE_ACTIVE")
        self.assertEqual(facts["outcome"], "ORIGINAL_RESTART_POLICIES_RESTORED_MAINTENANCE_ACTIVE")
        self.assertEqual([row[0] for row in self.commands], list(installer.INSTALL_WRITER_ROLES))
        self.assertEqual(self.http_calls, list(installer.READINESS_URLS))
        self.assertTrue(intent["restartPoliciesRestored"])
        self.assertFalse(intent["writersRestartInhibited"])
        self.assertFalse(facts["requiresRestartPolicyRestoration"])
        self.assertTrue(facts["requiresInstallationCompletion"])
        self.assertFalse(facts["installationComplete"])
        self.assertFalse(facts["canExecute"])
        self.assertIs(facts["restoreProven"], False)
        self.assertTrue(self.base.phase.gate.marker.exists())
        saved = self.base.phase.saved.originals()[1]
        for role in installer.INSTALL_WRITER_ROLES:
            row = json.loads(saved)["containers"][role]
            self.assertEqual(self.base.docker.containers[row["containerId"]]["HostConfig"]["RestartPolicy"], row["restartPolicy"])
        self.assertEqual(db, self.base.docker.containers[self.base.docker.ids[3]])

    def test_old_application_entry_does_not_restore_policies(self):
        with patch.object(installer, "_installation_restart_policy_command", side_effect=AssertionError("restore")):
            result = self.base.observe()
        self.assertTrue(result["installationIntent"]["snapshotReview"]["writersRestartInhibited"])
        self.assertEqual(self.commands, [])

    def test_lost_policy_reply_contains_originals_once_and_keeps_evidence(self):
        def lost(role, info):
            raise OSError("lost policy reply")
        self.after_policy = lost
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual(len(self.base.phase.actions), 12)
        self.base.assert_failure_preserved()

    def test_post_policy_http_failure_disables_and_stops_originals(self):
        self.http = "503"
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.commands), 3)
        self.assertEqual(len(self.http_calls), 1)
        self.base.assert_failure_preserved()

    def test_final_source_failure_after_all_policies_still_contains_originals(self):
        review = installer.review_transition
        def changed(*args, **kwargs):
            if len(self.commands) == 3:
                raise ReleaseContractError("source changed after policies")
            return review(*args, **kwargs)
        with patch.object(installer, "review_transition", side_effect=changed), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.base.assert_failure_preserved()

    def test_native_restore_switch_requires_ready_application_flow_before_io(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("host IO")):
            for value in (True, 1):
                with self.subTest(value=value), self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("f" * 64, _restore_policies=value)
