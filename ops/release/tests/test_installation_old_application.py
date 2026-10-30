"""Original application startup models. No real Docker, HTTP or production mutation."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_gate_api as api
from release_contract import ReleaseContractError


class ApplicationObservationTests(unittest.TestCase):
    def setUp(self):
        self.identity = "a" * 64
        self.intent = api.intent()
        self.engine = {"ID": "original-engine", "LiveRestoreEnabled": False, "Swarm": {"LocalNodeState": "inactive"}}
        self.volume = {"Name": "sanq-app_pgdata"}
        self.infos, rows = {}, {}
        for index, role in enumerate((*installer.INSTALL_WRITER_ROLES, "db"), 1):
            identifier = str(index) * 64
            image = "sha256:" + ("a" if index <= 2 else "b" if index == 3 else "f") * 64
            config, mounts = {"role": role}, [{"original": role}]
            original_policy = {"Name": "always", "MaximumRetryCount": 0}
            rows[role] = {"containerId": identifier, "imageId": image, "restartPolicy": original_policy,
                "restartCount": 0, "startedAt": "2026-10-27T00:00:00Z",
                "configurationSha256": installer._hash(installer._json(config)), "mountSha256": installer._hash(installer._json(mounts))}
            self.infos[identifier] = {"Id": identifier, "Image": image, "Config": config, "Mounts": mounts, "RestartCount": 0,
                "HostConfig": {"RestartPolicy": original_policy if role == "db" else {"Name": "no", "MaximumRetryCount": 0},
                    "Privileged": False, "AutoRemove": False, "PublishAllPorts": False,
                    "PortBindings": {str(port) + "/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}]
                                     for port in installer.INSTALL_PORTS[role]}},
                "State": {"StartedAt": rows[role]["startedAt"], "Running": role == "db",
                    "Status": "running" if role == "db" else "exited", "Paused": False, "Restarting": False,
                    "Dead": False, "Health": {"Status": "healthy"}}}
        self.docker = {"dockerEngine": self.engine, "databaseVolumeSha256": installer._hash(installer._json(self.volume)), "containers": rows}
        self.writers = installer._installation_writers_bytes(self.intent, self.identity, "d" * 40,
            self.docker, created_at="2026-10-29T18:00:00Z")
        self.progress = {"intent": self.intent, "writers": self.writers, "identity": self.identity, "docker": self.docker,
            "started": {}, "requireHealthy": False, "attempted": False, "containmentAttempted": False, "binding": None, "health": {}}
        self.starts = []

    def run_command(self, args):
        args = tuple(args)
        if args == installer.PROJECT_PS:
            return "\n".join(self.infos)
        if args == (*installer.DOCKER, "info", "--format", "{{json .}}"):
            return json.dumps(self.engine)
        if args == (*installer.DOCKER, "volume", "inspect", "--format", "{{json .}}", "sanq-app_pgdata"):
            return json.dumps(self.volume)
        self.assertEqual(args[:-1], (*installer.DOCKER, "inspect", "--type", "container", "--format", "{{json .}}"))
        return json.dumps(self.infos[args[-1]])

    def start(self, intent, writers, identity, role, **kwargs):
        args = installer._saved_application_start_args(intent, writers, identity, role)
        self.starts.append((role, args[-1]))
        self.infos[args[-1]]["State"].update(Running=True, Status="running", StartedAt="2026-10-29T18:00:01Z")

    def started(self, role):
        self.start(self.intent, self.writers, self.identity, role)
        identifier = self.docker["containers"][role]["containerId"]
        self.progress["started"][role] = installer._installation_application_lifetime(self.infos[identifier], self.docker["containers"][role])
        return self.infos[identifier]

    def observe(self):
        return installer._installation_application_observation(self.progress, self.run_command)

    def start_stage(self):
        return installer._start_saved_installation_application(self.progress, run=self.run_command,
            check_context=self.observe, bind_application=lambda: {"network": "modeled"},
            deadline=installer.time.monotonic() + 60)

    def test_only_original_application_ids_can_enter_private_start_client(self):
        for role in installer.INSTALL_WRITER_ROLES:
            self.assertEqual(installer._saved_application_start_args(self.intent, self.writers, self.identity, role),
                [*installer.DOCKER, "start", self.docker["containers"][role]["containerId"]])
        for role in ("db", "other", "api;bad"):
            with self.subTest(role=role), self.assertRaises(ReleaseContractError):
                installer._saved_application_start_args(self.intent, self.writers, self.identity, role)
        args = installer._saved_application_start_args(self.intent, self.writers, self.identity, "api")
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("spawn")):
            with self.assertRaises(ReleaseContractError):
                installer._observation_command(args, deadline=installer.time.monotonic() + 60)
            with self.assertRaises(ReleaseContractError):
                installer._bounded_host_client(args[:-1] + ["f" * 64], deadline=installer.time.monotonic() + 60,
                    _application_start=(self.intent, self.writers, self.identity, "api"))

    def test_start_client_checks_exact_reply_and_never_retries_unknown_reply(self):
        identifier = self.docker["containers"]["api"]["containerId"]
        with patch.object(installer, "_bounded_host_client", return_value=identifier + "\n") as client:
            installer._installation_application_start_command(self.intent, self.writers, self.identity, "api", deadline=123)
        self.assertEqual(client.call_args.kwargs["_application_start"], (self.intent, self.writers, self.identity, "api"))
        for reply in ("", "other", identifier + "\nextra"):
            with patch.object(installer, "_bounded_host_client", return_value=reply) as client, self.assertRaises(ReleaseContractError):
                installer._installation_application_start_command(self.intent, self.writers, self.identity, "api", deadline=123)
            self.assertEqual(client.call_count, 1)

    def test_new_lifetime_is_separate_from_unchanged_original_evidence(self):
        original = self.writers
        self.assertNotIn("api", self.observe())
        self.started("api")
        self.assertEqual(self.observe()["api"], "healthy")
        self.assertEqual(self.writers, original)
        self.assertNotEqual(self.progress["started"]["api"]["startedAt"], json.loads(original)["containers"]["api"]["startedAt"])

    def test_original_frozen_observer_stays_strict_after_intentional_start(self):
        self.started("api")
        with self.assertRaises(ReleaseContractError):
            installer._installation_writer_observation(json.loads(self.writers), self.docker, self.run_command,
                set(installer.INSTALL_WRITER_ROLES), set(installer.INSTALL_WRITER_ROLES))

    def test_captured_started_at_restart_count_and_restart_inhibition_cannot_drift(self):
        info = self.started("api")
        for target, key, wrong in ((info["State"], "StartedAt", "2026-10-29T18:00:02Z"),
                                   (info, "RestartCount", 1),
                                   (info["HostConfig"], "RestartPolicy", {"Name": "always", "MaximumRetryCount": 0})):
            old = target[key]
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                target[key] = wrong
                self.observe()
            target[key] = old

    def test_new_lifetime_rejects_old_or_invalid_time_and_non_native_or_increased_counter(self):
        saved = self.docker["containers"]["api"]
        for stamp, count in ((saved["startedAt"], 0), ("bad", 0), ("2020-01-01T00:00:00Z", 0),
                             ("2026-10-29T18:00:01Z", True), ("2026-10-29T18:00:01Z", 1)):
            with self.subTest(stamp=stamp, count=count), self.assertRaises((ReleaseContractError, ValueError)):
                installer._installation_application_lifetime({"Id": saved["containerId"],
                    "State": {"StartedAt": stamp}, "RestartCount": count}, saved)

    def test_starting_is_temporary_only_and_never_applies_to_database(self):
        for role in installer.INSTALL_WRITER_ROLES:
            self.started(role)
        info = self.infos[self.docker["containers"]["api"]["containerId"]]
        info["State"]["Health"]["Status"] = "starting"
        self.assertEqual(self.observe()["api"], "starting")
        self.progress["requireHealthy"] = True
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.progress["requireHealthy"] = False
        info["State"]["Health"]["Status"] = "healthy"
        db = self.infos[self.docker["containers"]["db"]["containerId"]]
        db["State"]["Health"]["Status"] = "starting"
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_configuration_mount_image_or_original_database_lifetime_change_is_rejected(self):
        info = self.started("api")
        db = self.infos[self.docker["containers"]["db"]["containerId"]]
        for target, key, wrong in ((info, "Config", {"changed": True}), (info, "Mounts", []),
                                   (info, "Image", "sha256:" + "f" * 64),
                                   (db["State"], "StartedAt", "2026-10-29T18:00:01Z")):
            old = target[key]
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                target[key] = wrong
                self.observe()
            target[key] = old

    def test_changed_application_endpoints_can_be_rebound_but_database_and_network_cannot(self):
        original = {"databaseContainerId": "4" * 64, "environmentSha256": {"api": "e" * 64},
            "network": {"networkId": "n", "subnet": "subnet", "gateway": "gateway",
                "endpoints": {role: {"containerId": row["containerId"], "aliases": [role], "endpointId": role,
                                    "ipv4": role} for role, row in self.docker["containers"].items()}}}
        current = copy.deepcopy(original)
        current["network"]["endpoints"]["api"].update(endpointId="new", ipv4="new")
        with patch.object(installer, "_application_binding_snapshot", return_value=current):
            self.assertEqual(installer._installation_restarted_binding(self.docker, original, self.run_command), current)
        for target, key, wrong in ((current["network"]["endpoints"]["db"], "endpointId", "changed"),
                                   (current["network"], "networkId", "other"),
                                   (current["network"]["endpoints"]["api"], "aliases", ["other"]),
                                   (current, "environmentSha256", {})):
            old = target[key]
            target[key] = wrong
            with patch.object(installer, "_application_binding_snapshot", return_value=current), self.assertRaises(ReleaseContractError):
                installer._installation_restarted_binding(self.docker, original, self.run_command)
            target[key] = old

    def test_stage_waits_for_health_then_reads_only_fixed_readiness_endpoints(self):
        def starting(*args, **kwargs):
            self.start(*args, **kwargs)
            self.infos[self.starts[-1][1]]["State"]["Health"]["Status"] = "starting"
        def ready(seconds):
            for info in self.infos.values():
                info["State"]["Health"]["Status"] = "healthy"
        with patch.object(installer, "_installation_application_start_command", side_effect=starting), \
             patch.object(installer.time, "sleep", side_effect=ready) as sleep, \
             patch.object(installer, "_runtime_command", return_value="200") as http:
            result = self.start_stage()
        self.assertEqual(sleep.call_count, 1)
        self.assertEqual([call.args[0] for call in http.call_args_list], [list((*installer.CURL_ARGS, url)) for url in installer.READINESS_URLS])
        self.assertTrue(result["oldApplicationVerified"])
        self.assertTrue(result["requiresRestartPolicyRestoration"])
        self.assertFalse(result["writersFrozen"])
        self.assertFalse(result["installationComplete"])

    def test_partial_or_unknown_start_failure_contains_original_ids_once_across_nested_owners(self):
        def fail(*args, **kwargs):
            self.start(*args, **kwargs)
            if args[3] == "ubereats-worker":
                raise OSError("second start reply lost")
        with patch.object(installer, "_installation_application_start_command", side_effect=fail), \
             patch.object(installer, "_installation_writer_command") as contain, \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            with installer._installation_application_ownership(self.progress):
                with installer._installation_application_ownership(self.progress):
                    self.start_stage()
        self.assertEqual(len(self.starts), 2)
        self.assertEqual([(c.args[3], c.args[4]) for c in contain.call_args_list],
            [(role, "disable-restart") for role in installer.INSTALL_WRITER_ROLES]
            + [(role, "stop") for role in reversed(installer.INSTALL_WRITER_ROLES)])

    def test_containment_has_fresh_budget_continues_after_errors_and_never_reopens(self):
        self.progress["attempted"] = True
        with patch.object(installer.time, "monotonic", return_value=1000), \
             patch.object(installer, "_installation_writer_command", side_effect=OSError("containment unknown")) as contain, \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            with installer._installation_application_ownership(self.progress):
                raise OSError("expired application stage")
        self.assertEqual(contain.call_count, 6)
        self.assertTrue(all(c.kwargs["deadline"] == 1300 for c in contain.call_args_list))

    def test_pre_start_failure_or_expired_budget_never_launches_or_contains(self):
        with patch.object(installer, "_installation_application_start_command", side_effect=AssertionError("start")), \
             patch.object(installer, "_installation_writer_command", side_effect=AssertionError("contain")), \
             self.assertRaises(ReleaseContractError):
            with installer._installation_application_ownership(self.progress):
                installer._start_saved_installation_application(self.progress, run=self.run_command,
                    check_context=self.observe, bind_application=lambda: {}, deadline=installer.time.monotonic() - 1)


class OwnedApplicationVerificationTests(unittest.TestCase):
    def setUp(self):
        self.base = api.OwnedGateApiTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.phase = self.base.base.confirmation.retention.phase
        self.docker = self.phase.docker
        self.starts = []
        self.after_start = None
        self.http_result = "200"
        self.http_calls = []

    def start(self, intent, writers, identity, role, **kwargs):
        self.phase.gate.assert_locks_held()
        self.assertEqual(len(self.base.calls), 1)
        args = installer._saved_application_start_args(intent, writers, identity, role)
        self.starts.append((role, args[-1]))
        info = self.docker.containers[args[-1]]
        info["State"].update(Running=True, Status="running", StartedAt="2026-10-29T18:00:01Z")
        if self.after_start:
            self.after_start(role, info)

    def observe(self, client=None):
        stage = installer._start_saved_installation_application
        def checked(*args, **kwargs):
            command = installer._runtime_command
            def http(args, **kwargs):
                if tuple(args[:-1]) == installer.CURL_ARGS:
                    self.http_calls.append(args[-1])
                    return self.http_result
                return command(args, **kwargs)
            with patch.object(installer, "_runtime_command", side_effect=http):
                return stage(*args, **kwargs)
        with patch.object(installer, "_verify_installation_permanent_gate_api", side_effect=installer._verify_installation_old_application), \
             patch.object(installer, "_installation_application_start_command", side_effect=self.start), \
             patch.object(installer, "_start_saved_installation_application", side_effect=checked):
            return self.base.observe(client)

    def assert_failure_preserved(self):
        self.assertTrue(self.phase.gate.marker.exists())
        self.assertTrue(self.base.base.confirmation.path().exists())
        for identifier in self.docker.ids[:3]:
            info = self.docker.containers[identifier]
            self.assertFalse(info["State"]["Running"])
            self.assertEqual(info["HostConfig"]["RestartPolicy"], {"Name": "no", "MaximumRetryCount": 0})
        self.assertTrue(all(row[2] in set(self.docker.ids[:3]) for row in self.phase.actions))

    def test_owned_flow_restarts_only_original_ids_and_keeps_policies_inhibited_and_marker(self):
        db = copy.deepcopy(self.docker.containers[self.docker.ids[3]])
        runtime = self.base.base.base.runtime
        configuration = {name: (runtime / name).read_bytes() for name in installer.CONFIGURATION_NAMES}
        result = self.observe()
        facts = result["installationIntent"]["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_OLD_APPLICATION_READY_RESTART_INHIBITED")
        self.assertEqual(facts["outcome"], "OLD_APPLICATION_READY_RESTART_INHIBITED")
        self.assertEqual(self.starts, list(zip(installer.INSTALL_WRITER_ROLES, self.docker.ids[:3])))
        self.assertEqual(self.http_calls, list(installer.READINESS_URLS))
        self.assertTrue(facts["oldApplicationVerified"])
        self.assertTrue(facts["writersRestartInhibited"])
        self.assertFalse(facts["writersFrozen"])
        self.assertFalse(facts["requiresApplicationVerification"])
        self.assertTrue(facts["requiresRestartPolicyRestoration"])
        self.assertFalse(result["installationIntent"]["writersFrozen"])
        self.assertEqual(result["installationIntent"]["frozenWriters"]["observationTiming"], "PRE_APPLICATION_RESTART")
        for key in ("installationComplete", "canExecute", "restoreProven", "recoveryReady"):
            self.assertIs(facts[key], False)
        self.assertEqual(db, self.docker.containers[self.docker.ids[3]])
        self.assertEqual(configuration, {name: (runtime / name).read_bytes() for name in installer.CONFIGURATION_NAMES})
        self.assertTrue(self.phase.gate.marker.exists())
        for identifier in self.docker.ids[:3]:
            self.assertTrue(self.docker.containers[identifier]["State"]["Running"])
            self.assertEqual(self.docker.containers[identifier]["HostConfig"]["RestartPolicy"]["Name"], "no")

    def test_old_api_entry_does_not_start_application(self):
        with patch.object(installer, "_installation_application_start_command", side_effect=AssertionError("unexpected start")):
            self.base.observe()
        self.base.base.assert_fenced()

    def test_failed_api_has_no_start_or_application_containment(self):
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(lambda *args, **kwargs: (_ for _ in ()).throw(OSError("API unknown")))
        self.assertEqual(self.starts, [])
        self.assertEqual(len(self.phase.actions), 6)
        self.assert_failure_preserved()

    def test_lost_start_reply_stops_saved_ids_without_retry_or_database_action(self):
        def lost(role, info):
            raise OSError("start reply lost")
        self.after_start = lost
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.starts), 1)
        self.assertEqual(len(self.phase.actions), 12)
        self.assert_failure_preserved()

    def test_http_failure_stops_all_originals_and_preserves_evidence(self):
        self.http_result = "503"
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.starts), 3)
        self.assertEqual(len(self.http_calls), 1)
        self.assert_failure_preserved()

    def test_configuration_drift_after_start_does_not_block_saved_id_containment(self):
        def changed(role, info):
            info["Config"]["unexpected"] = True
        self.after_start = changed
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.starts), 1)
        self.assert_failure_preserved()

    def test_final_source_review_failure_after_healthy_start_still_contains_originals(self):
        review = installer.review_transition
        def changed(*args, **kwargs):
            if len(self.starts) == 3:
                raise ReleaseContractError("final source changed")
            return review(*args, **kwargs)
        with patch.object(installer, "review_transition", side_effect=changed), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(len(self.starts), 3)
        self.assert_failure_preserved()

    def test_native_application_switch_requires_api_flow_before_io(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("host IO")):
            for value in (True, 1):
                with self.subTest(value=value), self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("f" * 64, _verify_application=value)
