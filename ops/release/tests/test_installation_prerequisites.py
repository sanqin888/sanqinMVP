"""Runtime prerequisites: modeled local commands/SQL/HTTP, disposable memory input."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_filesystem as filesystem
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationPrerequisiteTests(unittest.TestCase):
    def setUp(self):
        self.fs = filesystem.InstallationFilesystemTests(
            "test_whole_observation_checks_original_files_without_writes_or_restore_authority")
        self.fs.setUp()
        self.addCleanup(self.fs.doCleanups)
        self.materials, self.case = self.fs.materials, self.fs.case
        self.manager, self.docker = self.fs.base, self.fs.base.base
        self.python = {"version": [3, 10, 6], "implementation": "cpython",
                       "executable": "/usr/bin/python3", "platform": "linux"}
        self.database = {"database": "sanqin_db", "port": "5432", "dataDirectory": "/var/lib/postgresql/data",
                         "serverVersionNum": "150014", "inRecovery": False, "transactionReadOnly": "on",
                         "history": [{"name": "001_init", "sha256": "a" * 64, "state": "applied"},
                                     {"name": "002_more", "sha256": "b" * 64, "state": "rolled-back"},
                                     {"name": "002_more", "sha256": "b" * 64, "state": "applied"}]}
        self.statuses = dict.fromkeys(installer.READINESS_URLS, "200")
        self.calls = []
        self.real_memory = installer._memory_threshold_observed
        self.materials.stack.enter_context(patch.object(installer, "_memory_threshold_observed",
            return_value={"minimumAvailableMemoryBytes": installer.MIN_AVAILABLE_MEMORY,
                          "availableMemoryThresholdSatisfied": True}))

    def observe_command(self, args):
        self.assertTrue(installer._runtime_observation_allowed(args))
        self.calls.append(args)
        if tuple(args) == installer.PYTHON_ARGS:
            return json.dumps(self.python)
        if tuple(args[:-1]) == installer.CURL_ARGS:
            return self.statuses[args[-1]]
        self.assertEqual(args, installer._installation_history_args(self.docker.ids[3]))
        return json.dumps(self.database)

    def snapshot(self):
        return installer._runtime_prerequisite_snapshot(self.docker.snapshot(), self.observe_command)

    def observe(self):
        with patch.object(installer, "_docker_command", side_effect=lambda args, **_: self.docker.observe_command(args)), \
             patch.object(installer, "_systemd_command", side_effect=lambda args, **_: self.manager.observe_command(args)), \
             patch.object(installer, "_runtime_command", side_effect=lambda args, **_: self.observe_command(args)):
            return installer._observe_installed_prerequisites(self.materials.identity, fetch=self.case.fetch)

    def test_full_observation_reports_prerequisites_without_history_payload_or_install_authority(self):
        before = self.docker.config.base.image()
        with patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")):
            result = self.observe()
        self.assertEqual(before, self.docker.config.base.image())
        for key in ("runtimePrerequisitesObserved", "databaseHistoryObserved", "readinessEndpointsObserved"):
            self.assertTrue(result[key])
        for key in ("hostPreflightComplete", "installedBaselineObserved", "readyToInstall", "canExecute",
                    "authorizedToMutateProduction", "backupRestoreProven"):
            self.assertFalse(result[key])
        facts = result["prerequisites"]
        self.assertFalse(facts["databaseMigrationParityProven"])
        self.assertFalse(facts["systemPythonProvenanceAuthenticated"])
        self.assertEqual(facts["migrationHistoryRows"], 3)
        self.assertEqual(facts["rolledBackHistoryRows"], 1)
        self.assertEqual(facts["migrationHistorySha256"], installer._hash(installer._json(self.database["history"])))
        self.assertNotIn("001_init", str(facts))
        self.assertEqual(set(facts["httpStatuses"]), set(installer.READINESS_URLS))
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_system_python_requires_cpython_linux_and_supported_floor_with_strict_fields(self):
        for changes in ({"version": [3, 9, 99]}, {"version": [4, 0, 0]}, {"version": [3, 10, True]},
                        {"version": [3]}, {"implementation": "pypy"}, {"platform": "win32"},
                        {"executable": "/tmp/python"}, {"extra": "unknown"}):
            with patch.dict(self.python, changes), self.assertRaises(ReleaseContractError):
                self.snapshot()
        with patch.dict(self.python, {"version": [3, 12, 15]}):
            self.assertEqual(self.snapshot()["systemPython"]["version"], [3, 12, 15])

    def test_database_identity_local_directory_port_version_readonly_and_recovery_are_required(self):
        for changes in ({"database": "other"}, {"port": "5433"}, {"dataDirectory": "/other"},
                        {"serverVersionNum": "160001"}, {"serverVersionNum": 150014},
                        {"inRecovery": True}, {"inRecovery": 0}, {"transactionReadOnly": "off"},
                        {"extra": "unknown"}):
            with patch.dict(self.database, changes), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_failed_empty_invalid_or_oversized_history_blocks_without_inference(self):
        original = copy.deepcopy(self.database["history"])
        for history in ([], [{"name": "001", "sha256": "a" * 64, "state": "failed"}],
                        [{"name": "../bad", "sha256": "a" * 64, "state": "applied"}],
                        [{"name": "001", "sha256": "wrong", "state": "applied"}],
                        [{"name": "001", "sha256": "a" * 64, "state": "applied", "extra": True}],
                        [original[0]] * 20001):
            self.database["history"] = history
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.database["history"] = original

    def test_rolled_back_and_duplicate_history_rows_are_preserved_in_the_digest(self):
        before = self.snapshot()
        self.database["history"].append(copy.deepcopy(self.database["history"][-1]))
        after = self.snapshot()
        self.assertEqual(after["migrationHistoryRows"], 4)
        self.assertNotEqual(before["migrationHistorySha256"], after["migrationHistorySha256"])

    def test_all_six_http_checks_require_exact_200_and_never_follow_a_redirect(self):
        for url in installer.READINESS_URLS:
            for status in ("301", "204", "500", "200\n", ""):
                self.statuses[url] = status
                with self.assertRaises(ReleaseContractError):
                    self.snapshot()
            self.statuses[url] = "200"
        self.assertNotIn("--location", installer.CURL_ARGS)
        self.assertEqual(installer.CURL_ARGS[1], "--disable")
        self.assertEqual(installer.CURL_ARGS[installer.CURL_ARGS.index("--noproxy") + 1], "*")
        self.assertEqual(installer.CURL_ARGS[installer.CURL_ARGS.index("--request") + 1], "GET")

    def test_query_binds_saved_full_db_id_readonly_transaction_local_socket_and_fixed_database(self):
        args = installer._installation_history_args(self.docker.ids[3])
        self.assertEqual(args[len(installer.DOCKER) + 1], self.docker.ids[3])
        self.assertIn("BEGIN READ ONLY;", args[-1])
        self.assertIn("SET LOCAL statement_timeout='5s'", args[-1])
        self.assertIn("LIMIT 20001", args[-1])
        self.assertIn('exec /usr/bin/env -i', args[-3])
        self.assertIn("-X -w -qAt", args[-3])
        self.assertIn("-h /var/run/postgresql -p 5432", args[-3])
        self.assertIn("-d sanqin_db", args[-3])
        self.assertIn('-U "$POSTGRES_USER"', args[-3])
        self.assertFalse(installer._docker_allowed(args))
        self.assertTrue(installer._runtime_observation_allowed(args))

    def test_mutated_sql_database_ids_arbitrary_exec_or_urls_are_not_admitted(self):
        good = installer._installation_history_args(self.docker.ids[3])
        variants = [good[:-1] + [good[-1] + "\nDROP TABLE anything;"],
                    [*installer.DOCKER, "exec", self.docker.ids[3], "/bin/sh"],
                    [*installer.CURL_ARGS, "https://other.invalid/"], list(installer.PYTHON_ARGS[:-1]) + ["print('other')"],
                    [*installer.DOCKER, "start", self.docker.ids[3]], []]
        bad_id = list(good)
        bad_id[len(installer.DOCKER) + 1] = "db"
        variants.append(bad_id)
        for args in variants:
            self.assertFalse(installer._runtime_observation_allowed(args))
            with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                installer._runtime_command(args, deadline=installer.time.monotonic() + 5)
            spawn.assert_not_called()
        with self.assertRaises(ReleaseContractError):
            installer._installation_history_args("db")

    def test_missing_or_wrong_json_fields_duplicate_keys_and_nonfinite_constants_block(self):
        args = list(installer.PYTHON_ARGS)
        for raw in ('{"version":[],"version":[]}', '{"version":NaN}', "[]", "{}"):
            with self.assertRaises((ReleaseContractError, ValueError)):
                installer._runtime_prerequisite_snapshot(self.docker.snapshot(), lambda _: raw)
        self.assertTrue(installer._runtime_observation_allowed(args))

    def test_history_change_between_passes_blocks_even_when_endpoints_stay_healthy(self):
        snapshot = installer._runtime_prerequisite_snapshot
        done = []
        def racing(*args):
            value = snapshot(*args)
            if not done:
                done.append(True)
                self.database["history"][0]["sha256"] = "c" * 64
            return value
        with patch.object(installer, "_runtime_prerequisite_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_python_change_between_valid_passes_is_not_an_installation_permit(self):
        snapshot = installer._runtime_prerequisite_snapshot
        done = []
        def racing(*args):
            value = snapshot(*args)
            if not done:
                done.append(True)
                self.python["version"] = [3, 12, 15]
            return value
        with patch.object(installer, "_runtime_prerequisite_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_original_locks_cover_queries_and_late_maintenance_is_preserved(self):
        run = self.observe_command
        marker = self.materials.state / "maintenance/active.json"
        def racing(args):
            for acquire in (filesystem.systemd.docker.configuration.baseline.private.jobs._locked_directory,
                            filesystem.systemd.docker.configuration.baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            value = run(args)
            if not marker.exists():
                marker.write_bytes(b"preserved late incident")
            return value
        with patch.object(self, "observe_command", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"preserved late incident")

    def test_existing_apis_do_not_invoke_prerequisite_commands(self):
        with patch.object(installer, "_runtime_command", side_effect=AssertionError("runtime called")):
            self.fs.observe()
            self.fs.base.observe()

    def test_missing_filesystem_or_nonboolean_switch_is_rejected_and_no_new_cli_exists(self):
        for filesystem_mode, prerequisites in ((False, True), (True, "yes")):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch,
                    include_configuration=True, include_docker=True, include_systemd=True,
                    include_filesystem=filesystem_mode, include_prerequisites=prerequisites)
        for command in ("observe-prerequisites", "install", "apply"):
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                installer.main([command])

    def memory_probe(self, raw):
        path = self.materials.anchor / "meminfo-model"
        path.write_bytes(raw)
        path.chmod(0o600)
        open_file = installer.os.open
        def observed(name, flags):
            self.assertEqual(name, "/proc/meminfo")
            self.assertTrue(flags & os.O_NOFOLLOW)
            return open_file(path, flags)
        with patch.object(installer.os, "open", side_effect=observed):
            return self.real_memory()

    def test_memory_threshold_rejects_missing_ambiguous_low_or_oversized_kernel_input(self):
        for raw in (b"MemFree: 900000 kB\n", b"MemAvailable: 1 kB\n",
                    b"MemAvailable: 900000 kB\nMemAvailable: 900000 kB\n", b"x" * 65537):
            with self.assertRaises(ReleaseContractError):
                self.memory_probe(raw)

    def test_memory_above_threshold_reports_stable_boolean_without_live_byte_value(self):
        one = self.memory_probe(b"MemAvailable: 900000 kB\n")
        two = self.memory_probe(b"MemAvailable: 800000 kB\n")
        self.assertEqual(one, two)
        self.assertTrue(one["availableMemoryThresholdSatisfied"])

    def test_fixed_python_probe_ignores_site_and_environment_and_cannot_load_target_code(self):
        self.assertEqual(installer.PYTHON_ARGS[:5], ("/usr/bin/python3", "-I", "-S", "-B", "-c"))
        self.assertIn("import json,sys", installer.PYTHON_ARGS[-1])
        self.assertNotIn("/opt/sanq", installer.PYTHON_ARGS[-1])
        self.assertNotIn("exec(", installer.PYTHON_ARGS[-1])

    def test_runtime_client_uses_shared_bounded_reader_without_forwarding_db_or_python_environment(self):
        client = filesystem.systemd.docker.DockerObservationClientTests(
            "test_client_uses_local_endpoint_clean_environment_and_real_bounded_pipes")
        client.setUp()
        self.addCleanup(client.doCleanups)
        process = client.process(output=b"200")
        with patch.object(installer.subprocess, "Popen", return_value=process) as spawn, \
             patch.dict(installer.os.environ, {"PGHOST": "remote", "PYTHONPATH": "/untrusted", "HTTPS_PROXY": "remote"}):
            result = installer._runtime_command(list((*installer.CURL_ARGS, installer.READINESS_URLS[0])),
                                                deadline=installer.time.monotonic() + 5)
        self.assertEqual(result, "200")
        for key in ("PGHOST", "PYTHONPATH", "HTTPS_PROXY"):
            self.assertNotIn(key, spawn.call_args.kwargs["env"])

    def test_late_source_failure_after_prerequisite_reads_blocks_without_marker_cleanup(self):
        snapshot = installer._runtime_prerequisite_snapshot
        done = []
        def racing(*args):
            value = snapshot(*args)
            if not done:
                done.append(True)
                self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
            return value
        with patch.object(installer, "_runtime_prerequisite_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_command_failure_does_not_turn_partial_prerequisites_into_success(self):
        def failed(_):
            raise ReleaseContractError("modeled local query failure")
        with self.assertRaises(ReleaseContractError):
            installer._runtime_prerequisite_snapshot(self.docker.snapshot(), failed)


if __name__ == "__main__":
    unittest.main()
