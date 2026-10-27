"""D2 Docker observations: offline protocol models and disposable client pipes."""
import contextlib
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_configuration as configuration
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationDockerTests(unittest.TestCase):
    def setUp(self):
        self.config = configuration.InstallationConfigurationTests(
            "test_success_keeps_runtime_application_and_target_distinct_and_returns_no_secret_bytes")
        self.config.setUp()
        self.addCleanup(self.config.doCleanups)
        self.case, self.materials = self.config.case, self.config.materials
        self.case.add_runtime(configuration.APP, b"not used as a Runtime archive", 99, 100)
        self.engine = {"ID": "fixed-local-engine", "DockerRootDir": "/var/lib/docker", "ServerVersion": "27.5.1",
                       "OSType": "linux", "Architecture": "x86_64", "LiveRestoreEnabled": False,
                       "Swarm": {"LocalNodeState": "inactive"}}
        self.expanded = {"name": "sanq-app", "services": {}}
        self.environment = "SANQ_IMAGE_SHA=" + configuration.APP + "\nREQUIRED_VALUE=model$secret\n"
        self.roles = ("api", "ubereats-worker", "web", "db")
        self.ids = [str(i) * 64 for i in range(1, 5)]
        self.containers, self.images, self.calls = {}, {}, []
        self.volume = {"Name": "sanq-app_pgdata", "Driver": "local", "Scope": "local", "Options": None,
                       "Labels": {"com.docker.compose.project": "sanq-app", "com.docker.compose.volume": "pgdata"},
                       "Mountpoint": "/var/lib/docker/volumes/sanq-app_pgdata/_data"}
        for role, identifier in zip(self.roles, self.ids):
            image_id = "sha256:" + ("f" if role == "db" else "d" if role == "web" else "a") * 64
            repository = "ghcr.io/sanqin888/" + ("sanq-web" if role == "web" else "sanq-api")
            declared = "postgres:15-alpine" if role == "db" else repository + ":" + configuration.APP
            default_cmd = ["postgres"] if role == "db" else ["node", "default-main"]
            command = ["node", "apps/api/dist/ubereats-worker.main.js"] if role == "ubereats-worker" else default_cmd
            entrypoint = ["docker-entrypoint.sh"]
            self.expanded["services"][role] = {"image": declared}
            if role == "ubereats-worker":
                self.expanded["services"][role]["command"] = command
            self.images[image_id] = {"Id": image_id, "Os": "linux", "Architecture": "amd64",
                "RepoDigests": [repository + "@sha256:" + "e" * 64],
                "Config": {"Labels": {"org.opencontainers.image.revision": configuration.APP},
                           "Cmd": default_cmd, "Entrypoint": entrypoint}}
            mount = ({"Type": "volume", "Destination": "/var/lib/postgresql/data",
                      "Name": "sanq-app_pgdata", "Source": self.volume["Mountpoint"], "RW": True}
                     if role == "db" else
                     {"Type": "bind", "Destination": "/app/apps/web/public/sounds",
                      "Source": "/home/ubuntu/sanq-assets/sounds", "RW": False}
                     if role == "web" else
                     {"Type": "bind", "Destination": "/app/uploads", "Source": "/srv/sanq/uploads", "RW": True})
            self.containers[identifier] = {"Id": identifier, "Image": image_id, "RestartCount": 0,
                "Config": {"Labels": {"com.docker.compose.project": "sanq-app", "com.docker.compose.service": role},
                           "Image": declared, "Cmd": command, "Entrypoint": entrypoint,
                           "Env": ["PRIVATE_VALUE=never_echo_$secret"]},
                "State": {"Running": True, "Status": "running", "Paused": False, "Restarting": False,
                          "Dead": False, "Health": {"Status": "healthy", "Log": []},
                          "StartedAt": "2026-10-27T00:00:00Z"},
                "HostConfig": {"Privileged": False, "RestartPolicy": {
                    "Name": "on-failure" if role == "ubereats-worker" else "always",
                    "MaximumRetryCount": 3 if role == "ubereats-worker" else 0}}, "Mounts": [mount]}
        self.materials.stack.enter_context(patch.dict(installer.os.environ, {}, clear=True))

    def run(self, args):
        self.assertTrue(installer._docker_allowed(args), args)
        self.calls.append(args)
        command = tuple(args)
        if command == (*installer.DOCKER, "info", "--format", "{{json .}}"):
            return json.dumps(self.engine)
        if command == (*installer.COMPOSE, "config", "--environment"):
            return self.environment
        if command == (*installer.COMPOSE, "config", "--format", "json"):
            return json.dumps(self.expanded)
        if command == installer.PROJECT_PS:
            return "\n".join(self.ids) + "\n"
        if command == (*installer.DOCKER, "volume", "inspect", "--format", "{{json .}}", "sanq-app_pgdata"):
            return json.dumps(self.volume)
        if command[:-1] == (*installer.DOCKER, "inspect", "--type", "container", "--format", "{{json .}}"):
            return json.dumps(self.containers[args[-1]])
        if command[:-1] == (*installer.DOCKER, "image", "inspect", "--format", "{{json .}}"):
            return json.dumps(self.images[args[-1]])
        raise AssertionError("not a modeled read command")

    def snapshot(self, compose=b"inert model Compose"):
        return installer._docker_snapshot({"applicationSha": configuration.APP}, compose, self.run, self.case.fetch)

    def observe(self):
        with patch.object(installer, "_docker_command", side_effect=lambda args, **_: self.run(args)):
            return installer._observe_installed_docker(self.materials.identity, fetch=self.case.fetch)

    def test_locked_end_to_end_observation_returns_only_stable_facts_and_no_permission(self):
        before = self.config.base.image()
        with patch.object(installer.os, "write", side_effect=AssertionError("host write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("host sync")):
            result = self.observe()
        self.assertEqual(self.config.base.image(), before)
        for key in ("containersObserved", "composeExpansionObserved", "containerMountsObserved", "currentImagePairBound"):
            self.assertTrue(result[key])
        for key in ("hostPreflightComplete", "installedBaselineObserved", "canExecute", "readyToInstall",
                    "authorizedToMutateProduction", "c4StorageObserved", "systemdObserved",
                    "applicationConfigurationObserved", "applicationReleaseAuthenticated"):
            self.assertFalse(result[key])
        self.assertEqual(set(result["docker"]["containers"]), set(self.roles))
        self.assertEqual(result["docker"]["containers"]["ubereats-worker"]["restartPolicy"]["MaximumRetryCount"], 3)
        text = json.dumps(result)
        self.assertNotIn("never_echo", text)
        self.assertNotIn("model$secret", text)
        self.assertTrue(all(installer._docker_allowed(args) for args in self.calls))

    def test_current_digest_declared_containers_remain_accepted(self):
        for role, identifier in zip(self.roles[:-1], self.ids):
            image = "sanq-web" if role == "web" else "sanq-api"
            self.containers[identifier]["Config"]["Image"] = "ghcr.io/sanqin888/" + image + "@sha256:" + "e" * 64
        self.assertEqual(len(self.snapshot()["containers"]), 4)

    def test_engine_live_restore_swarm_platform_or_identity_errors_block(self):
        for changes in ({"LiveRestoreEnabled": True}, {"Swarm": {"LocalNodeState": "active"}},
                        {"OSType": "windows"}, {"Architecture": "aarch64"}, {"ID": ""},
                        {"DockerRootDir": "relative"}, {"ServerVersion": ""}):
            with self.subTest(changes=changes), patch.dict(self.engine, changes), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_required_compose_values_and_duplicate_or_wrong_environment_are_refused(self):
        original = self.environment
        for raw in ("SANQ_IMAGE_SHA=" + configuration.APP + "\n",
                    original + "SANQ_IMAGE_SHA=" + configuration.APP + "\n",
                    original.replace(configuration.APP, "main"), original + "not-an-assignment\n"):
            self.environment = raw
            with self.assertRaises(ReleaseContractError):
                self.snapshot(b"image: $" b"{SANQ_IMAGE_SHA:?required}\nvalue: $" b"{REQUIRED_VALUE}\n")
        self.environment = original

    def test_compose_project_services_or_image_changes_block(self):
        original = copy.deepcopy(self.expanded)
        for mutate in (lambda: self.expanded.update(name="other"),
                       lambda: self.expanded["services"].pop("db"),
                       lambda: self.expanded["services"].update(extra={"image": "other"}),
                       lambda: self.expanded["services"]["api"].update(image="untrusted"),
                       lambda: self.expanded["services"]["db"].update(image="postgres:16")):
            self.expanded = copy.deepcopy(original)
            mutate()
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.expanded = original

    def test_extra_missing_duplicate_or_short_project_ids_block(self):
        original = list(self.ids)
        for values in (original + ["5" * 64], original[:-1], original + [original[0]], ["a" * 12] + original[1:]):
            self.ids = values
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.ids = original

    def test_project_roles_and_full_ids_cannot_be_substituted(self):
        info = self.containers[self.ids[0]]
        for field, value in (("com.docker.compose.project", "other"), ("com.docker.compose.service", "db")):
            with patch.dict(info["Config"]["Labels"], {field: value}), self.assertRaises(ReleaseContractError):
                self.snapshot()
        with patch.dict(info, {"Id": "5" * 64}), self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_unhealthy_exited_paused_restarting_dead_or_privileged_objects_block(self):
        info = self.containers[self.ids[0]]
        for change in ({"Running": False}, {"Status": "exited"}, {"Paused": True},
                       {"Restarting": True}, {"Dead": True}, {"Health": {"Status": "starting"}}):
            with patch.dict(info["State"], change), self.assertRaises(ReleaseContractError):
                self.snapshot()
        with patch.dict(info["HostConfig"], {"Privileged": True}), self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_digest_revision_platform_or_image_identity_mismatch_blocks(self):
        info = self.images[self.containers[self.ids[0]]["Image"]]
        for change in ({"Id": "sha256:" + "f" * 64}, {"Architecture": "arm64"}, {"Os": "windows"},
                       {"RepoDigests": []}, {"Config": {"Labels": {"org.opencontainers.image.revision": "f" * 40}}}):
            with patch.dict(info, change), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_worker_and_api_must_share_the_same_actual_image_id(self):
        info = self.containers[self.ids[1]]
        alternate = "sha256:" + "b" * 64
        self.images[alternate] = {**copy.deepcopy(self.images[info["Image"]]), "Id": alternate}
        info["Image"] = alternate
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_container_command_or_restart_policy_tampering_blocks(self):
        info = self.containers[self.ids[0]]
        with patch.dict(info["Config"], {"Cmd": ["sh", "-c", "unreviewed"]}), self.assertRaises(ReleaseContractError):
            self.snapshot()
        for policy in ({"Name": "always", "MaximumRetryCount": 1}, {"Name": "no", "MaximumRetryCount": True},
                       {"Name": "unknown", "MaximumRetryCount": 0}):
            with patch.dict(info["HostConfig"], {"RestartPolicy": policy}), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_persistent_mount_source_destination_rw_and_extra_mounts_are_checked(self):
        info = self.containers[self.ids[0]]
        for change in ({"Source": "/other"}, {"Destination": "/other"}, {"RW": False}, {"RW": 1}, {"Type": "volume"}):
            with patch.dict(info["Mounts"][0], change), self.assertRaises(ReleaseContractError):
                self.snapshot()
        info["Mounts"].append(copy.deepcopy(info["Mounts"][0]))
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_db_volume_driver_identity_options_and_source_must_match_existing_volume(self):
        for change in ({"Name": "replacement"}, {"Driver": "other"}, {"Scope": "global"},
                       {"Options": {"type": "nfs"}}, {"Mountpoint": "/other"}, {"Labels": {}}):
            with patch.dict(self.volume, change), self.assertRaises(ReleaseContractError):
                self.snapshot()
        info = self.containers[self.ids[3]]
        with patch.dict(info["Mounts"][0], {"Name": "replacement"}), self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_health_logs_are_volatile_but_identity_configuration_and_lifetime_changes_block(self):
        before = self.snapshot()
        for info in self.containers.values():
            info["State"]["Health"]["Log"] = [{"Output": "volatile probe output"}]
        self.assertEqual(self.snapshot(), before)
        info = self.containers[self.ids[0]]
        info["RestartCount"] += 1
        self.assertNotEqual(self.snapshot(), before)

    def test_two_pass_observation_refuses_replacement_even_when_all_new_objects_are_healthy(self):
        snapshot = installer._docker_snapshot
        count = []
        def racing(*args):
            value = snapshot(*args)
            count.append(True)
            if len(count) == 1:
                old = self.ids[0]
                self.ids[0] = "5" * 64
                self.containers[self.ids[0]] = {**self.containers.pop(old), "Id": self.ids[0]}
            return value
        with patch.object(installer, "_docker_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_original_locks_span_commands_and_late_maintenance_changes_block(self):
        for acquire in (configuration.baseline.private.jobs._locked_directory,
                        configuration.baseline.private.plans.preparation_lock):
            with acquire(), self.assertRaises(ReleaseContractError):
                self.observe()
        run = self.run
        marker = self.materials.state / "maintenance/active.json"
        def racing(args):
            for acquire in (configuration.baseline.private.jobs._locked_directory,
                            configuration.baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            value = run(args)
            if not marker.exists():
                marker.write_bytes(b"preserved incident")
            return value
        with patch.object(self, "run", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"preserved incident")

    def test_paired_seal_change_invalidates_the_same_application(self):
        original = self.case.data[installer.PREFIX + "/commits/" + configuration.APP + "/statuses?per_page=100"]
        seal = next(s for s in original if s["context"] == installer.release.RELEASE_CONTEXT)
        seal["state"] = "failure"
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        seal["state"] = "success"
        snapshot = installer._docker_snapshot
        calls = []
        def racing(*args):
            result = snapshot(*args)
            calls.append(True)
            if len(calls) == 1:
                seal["state"] = "failure"
            return result
        with patch.object(installer, "_docker_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_json_duplicate_keys_nonfinite_numbers_and_output_budget_block(self):
        args = list((*installer.DOCKER, "info", "--format", "{{json .}}"))
        for raw in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}', "x" * (installer.MAX_HOST_OUTPUT + 1)):
            with self.assertRaises((ReleaseContractError, ValueError)):
                installer._docker_json(args, lambda _: raw)

    def test_default_file_apis_do_not_invoke_docker_and_invalid_switches_are_refused(self):
        with patch.object(installer, "_docker_command", side_effect=AssertionError("Docker called")):
            self.config.observe()
            self.config.base.observe()
            for config, docker in ((False, True), (True, "yes")):
                with self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch,
                        include_configuration=config, include_docker=docker)

    def test_no_cli_allows_host_apply_or_docker_observation(self):
        for command in ("observe-docker", "install", "apply"):
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                installer.main([command])


class DockerObservationClientTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.dict(installer.os.environ, {}, clear=True))
        self.stack.enter_context(patch.object(installer.os, "geteuid", return_value=0))
        self.args = list((*installer.DOCKER, "info", "--format", "{{json .}}"))

    def process(self, output=b"observed", error=b"", code=0):
        readers = []
        for raw in (output, error):
            read, write = os.pipe()
            os.write(write, raw)
            os.close(write)
            readers.append(os.fdopen(read, "rb", buffering=0))
        self.addCleanup(lambda: [stream.close() for stream in readers if not stream.closed])
        return SimpleNamespace(stdout=readers[0], stderr=readers[1], pid=999999,
                               wait=lambda **_: code)

    def test_exact_read_allowlist_rejects_mutations_arbitrary_binaries_endpoints_and_identifiers(self):
        for args in (["/usr/bin/docker", "pull", "other"],
                     [*installer.DOCKER, "start", "a" * 64], [*installer.DOCKER, "exec", "db", "true"],
                     [*installer.COMPOSE, "up", "-d"], ["/bin/sh", "-c", "true"], [], tuple(self.args),
                     [*installer.DOCKER, "image", "inspect", "--format", "{{json .}}", "latest"],
                     [*installer.DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", "a" * 12]):
            self.assertFalse(installer._docker_allowed(args))
            with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                installer._docker_command(args, deadline=installer.time.monotonic() + 5)
            spawn.assert_not_called()

    def test_client_uses_local_endpoint_clean_environment_and_real_bounded_pipes(self):
        process = self.process(error=b"private stderr must not be returned")
        with patch.object(installer.subprocess, "Popen", return_value=process) as spawn, \
             patch.dict(installer.os.environ, {"GITHUB_TOKEN": "must-not-forward", "SANQ_IMAGE_SHA": "must-not-forward"}):
            self.assertEqual(installer._docker_command(self.args, deadline=installer.time.monotonic() + 5), "observed")
        kwargs = spawn.call_args.kwargs
        self.assertTrue(kwargs["start_new_session"])
        self.assertEqual(kwargs["stdin"], installer.subprocess.DEVNULL)
        self.assertEqual(kwargs["cwd"], "/opt/sanq/runtime")
        self.assertNotIn("GITHUB_TOKEN", kwargs["env"])
        self.assertNotIn("SANQ_IMAGE_SHA", kwargs["env"])
        self.assertNotIn("shell", kwargs)

    def test_inherited_remote_endpoint_nonroot_or_expired_budget_cannot_spawn(self):
        for key in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
            with patch.dict(installer.os.environ, {key: "unreviewed"}), \
                 patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                installer._docker_command(self.args, deadline=installer.time.monotonic() + 5)
            spawn.assert_not_called()
        with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            installer._docker_command(self.args, deadline=installer.time.monotonic() + 5)
        with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
            installer._docker_command(self.args, deadline=installer.time.monotonic() - 1)
        spawn.assert_not_called()

    def test_output_overflow_failure_bad_encoding_and_timeout_only_terminate_owned_client_group(self):
        for output, error, code, budget in ((b"x" * 1024, b"", 0, 128),
                                            (b"", b"private failure", 2, 4096), (b"\xff", b"", 0, 4096)):
            process = self.process(output, error, code)
            with patch.object(installer.subprocess, "Popen", return_value=process), \
                 patch.object(installer, "MAX_HOST_OUTPUT", budget), \
                 patch.object(installer.os, "killpg") as kill, self.assertRaises(ReleaseContractError) as caught:
                installer._docker_command(self.args, deadline=installer.time.monotonic() + 5)
            kill.assert_called_once_with(process.pid, installer.signal.SIGKILL)
            self.assertNotIn("private failure", str(caught.exception))
        process = self.process()
        with patch.object(installer.subprocess, "Popen", return_value=process), \
             patch.object(installer.time, "monotonic", side_effect=[0, 0, 31]), \
             patch.object(installer.os, "killpg") as kill, self.assertRaises(ReleaseContractError):
            installer._docker_command(self.args, deadline=100)
        kill.assert_called_once_with(process.pid, installer.signal.SIGKILL)


if __name__ == "__main__":
    unittest.main()
