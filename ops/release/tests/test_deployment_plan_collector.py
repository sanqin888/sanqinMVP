"""Offline collector orchestration and negative adapters; no Docker/SQL/HTTP."""

from __future__ import annotations

import contextlib
import copy
import gzip
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import collect_deployment_plan as collector
import deployment_plan as plan
import release_contract as release
from test_deployment_plan import OLD, NEW, TREE, NOW, inputs, prepared, git_tree


class CollectorFlowTests(unittest.TestCase):
    def setUp(self):
        self.values = inputs()
        self.files = {name: b"fixed runtime bytes" for name in plan.RUNTIME_FILES}
        self.controller = SimpleNamespace(
            ROOT=Path("/uninstalled-test-root"), ENV=Path("/uninstalled-test-root/.env"),
            COMPOSE=Path("/uninstalled-test-root/docker-compose.yml"),
            check_running_images=Mock(), check_live_storage=Mock())
        self.run = Mock(return_value="")
        responses = {
            f"/repos/{release.REPOSITORY}/git/commits/{NEW}":
                {"sha": NEW, "tree": {"sha": TREE}},
            f"/repos/{release.REPOSITORY}/git/trees/{TREE}?recursive=1":
                git_tree(self.values["inventory"]),
        }
        self.responses = responses
        self.fetch = Mock(side_effect=responses.__getitem__)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.dict(os.environ, {}, clear=True))
        self.stack.enter_context(patch.object(collector.os, "geteuid", return_value=0))
        self.snapshot = self.mock("_snapshot", return_value=(
            self.values["current"], self.files, self.values["environment"]))
        self.mock("_resource_preflight")
        self.mock("_backup", return_value=self.values["backup"])
        self.current_images = self.mock("_current_images")
        self.inspect_image = self.mock("_inspect_image")
        self.probe = self.mock("_probe_sql", return_value=self.values["inventory"])
        self.history = self.mock("_history", return_value=self.values["history"])
        self.mock("now_utc", return_value=NOW)
        self.candidate = self.stack.enter_context(patch.object(
            release, "verify_exact_candidate", return_value=self.values["candidate"]))
        self.stack.enter_context(patch.object(plan, "fetch_runtime_files", return_value=self.files))

    def mock(self, name, **kwargs):
        return self.stack.enter_context(patch.object(collector, name, **kwargs))

    def collect(self):
        return collector.collect(NEW, controller=self.controller, run=self.run, fetch=self.fetch)

    def test_exact_plan_has_original_proofs_and_no_business_mutation(self):
        raw = self.collect()
        value = json.loads(raw)
        self.assertFalse(value["canExecute"])
        self.assertEqual(value["candidate"], self.values["candidate"])
        self.assertEqual(value["pendingMigrations"], self.values["pending"])
        self.assertEqual(self.candidate.call_count, 2)
        self.assertEqual(self.snapshot.call_count, 2)
        self.assertEqual(self.history.call_count, 2)
        self.assertEqual(self.current_images.call_count, 2)
        self.assertEqual(self.controller.check_live_storage.call_count, 2)
        calls = [call.args[0] for call in self.run.call_args_list]
        self.assertEqual(len(calls), 3)  # Current readiness plus two digest pulls.
        self.assertEqual(calls[0][0], "bash")
        self.assertEqual([call[:2] for call in calls[1:]], [["docker", "pull"]] * 2)
        self.assertTrue(all("@sha256:" in call[2] for call in calls[1:]))
        self.assertEqual(self.inspect_image.call_count, 2)
        self.probe.assert_called_once_with(
            collector._pinned(self.values["candidate"]["images"]["sanq-api"]), self.run)
        self.assertNotIn("canExecute=true", raw.decode())

    def test_precheck_uses_only_cached_digest_images_without_pulling(self):
        raw = collector.collect(NEW, controller=self.controller, run=self.run,
                                fetch=self.fetch, cache_images=False)
        self.assertFalse(json.loads(raw)["canExecute"])
        self.assertEqual(self.inspect_image.call_count, 2)
        self.probe.assert_called_once()
        self.assertEqual(self.run.call_count, 1)
        self.assertEqual(self.run.call_args.args[0][0], "bash")

    def test_missing_cached_image_blocks_without_pull_or_probe(self):
        self.inspect_image.side_effect = release.ReleaseContractError("cache missing")
        with self.assertRaises(release.ReleaseContractError):
            collector.collect(NEW, controller=self.controller, run=self.run,
                              fetch=self.fetch, cache_images=False)
        self.probe.assert_not_called()
        self.assertTrue(all(call.args[0][:2] != ["docker", "pull"]
                            for call in self.run.call_args_list))

    def test_current_configuration_state_or_environment_drift_blocks(self):
        for position in (0, 1, 2):
            after = list(copy.deepcopy(self.snapshot.return_value))
            if position == 0:
                after[0]["configurationSha256"] = "f" * 64
            elif position == 1:
                after[1][plan.RUNTIME_FILES[0]] = b"changed"
            else:
                after[2]["requiredKeys"].append("NEW_KEY")
            self.snapshot.side_effect = [self.snapshot.return_value, tuple(after)]
            with self.subTest(position=position), self.assertRaises(release.ReleaseContractError):
                self.collect()

    def test_database_history_changed_after_inventory_blocks(self):
        self.history.side_effect = [self.values["history"], []]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()

    def test_candidate_proof_changed_without_substituting_latest_blocks(self):
        self.candidate.side_effect = [
            self.values["candidate"], {**self.values["candidate"], "ciRunId": 99}]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.assertTrue(all(call.args[:2] == (OLD, NEW)
                            for call in self.candidate.call_args_list))

    def test_commit_tree_binding_and_truncation_block(self):
        commit_key = next(key for key in self.responses if "/commits/" in key)
        tree_key = next(key for key in self.responses if "/trees/" in key)
        for bad_commit, bad_tree in (({"sha": OLD, "tree": {"sha": TREE}}, None),
                                     (None, {"truncated": True}),
                                     (None, {"sha": OLD})):
            original = copy.deepcopy(self.responses)
            if bad_commit is not None:
                self.responses[commit_key] = bad_commit
            if bad_tree is not None:
                self.responses[tree_key].update(bad_tree)
            with self.subTest(commit=bad_commit, tree=bad_tree), \
                 self.assertRaises(release.ReleaseContractError):
                self.collect()
            self.responses.clear()
            self.responses.update(original)

    def test_image_sql_different_from_exact_git_source_blocks(self):
        inventory = copy.deepcopy(self.values["inventory"])
        inventory[0]["gitBlobSha"] = OLD
        self.probe.return_value = inventory
        with self.assertRaises(release.ReleaseContractError):
            self.collect()

    def test_local_candidate_image_failure_precedes_sql_probe(self):
        self.inspect_image.side_effect = release.ReleaseContractError("wrong digest")
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.probe.assert_not_called()

    def test_runtime_contract_change_stops_before_image_cache_or_probe(self):
        with patch.object(plan, "fetch_runtime_files", return_value={
                **self.files, plan.RUNTIME_FILES[0]: b"changed"}):
            with self.assertRaisesRegex(release.ReleaseContractError, "NEEDS_PLATFORM_UPDATE"):
                self.collect()
        self.run.assert_not_called()
        self.probe.assert_not_called()

    def test_nonroot_and_custom_docker_endpoint_block_before_observation(self):
        with patch.object(collector.os, "geteuid", return_value=1000):
            with self.assertRaises(release.ReleaseContractError):
                self.collect()
        for key in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
            with self.subTest(key=key), patch.dict(os.environ, {key: "external"}), \
                 self.assertRaises(release.ReleaseContractError):
                self.collect()
        self.snapshot.assert_not_called()


class ObservationAdapterTests(unittest.TestCase):
    def test_probe_program_hashes_original_bytes_and_rejects_extra_members(self):
        # Execute only in authorized CI, against a disposable local fixture.
        # The ops Release lane sets up Node 20, matching the candidate image.
        import subprocess
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration = root / "20261001000000_first"
            migration.mkdir()
            sql = b"SELECT 'original bytes';\r\n"
            (migration / "migration.sql").write_bytes(sql)
            (root / "migration_lock.toml").write_text('provider = "postgresql"\n')
            program = collector.SQL_PROBE.replace(
                "'/app/apps/api/prisma/migrations'", json.dumps(str(root)), 1)
            result = subprocess.run(["node", "-e", program], capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            self.assertEqual(json.loads(result.stdout), plan.migration_inventory({migration.name: sql}))
            (migration / "unexpected").write_bytes(b"extra")
            result = subprocess.run(["node", "-e", program], capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            (migration / "unexpected").unlink()
            (migration / "migration.sql").unlink()
            (migration / "migration.sql").symlink_to(root / "migration_lock.toml")
            result = subprocess.run(["node", "-e", program], capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)

    def test_running_container_image_id_is_used_for_digest_observation(self):
        candidate = inputs()["candidate"]
        controller = SimpleNamespace(ROOT="/root", ENV="/root/.env", COMPOSE="/root/compose")
        image_id = "sha256:" + "9" * 64
        run = Mock(side_effect=["a" * 64, image_id] * 3)
        with patch.object(release, "sealed_release_for_sha", return_value=candidate), \
             patch.object(collector, "_inspect_image") as inspect:
            collector._current_images(controller, OLD, run, Mock())
        self.assertEqual(inspect.call_count, 3)
        self.assertTrue(all(call.args[0] == image_id for call in inspect.call_args_list))
        with patch.object(release, "sealed_release_for_sha", return_value=candidate), \
             self.assertRaises(release.ReleaseContractError):
            collector._current_images(controller, OLD, lambda _: "a" * 64 + "\n" + "b" * 64, Mock())

    def test_snapshot_observes_original_manifest_release_state_and_runtime(self):
        files = {name: b"runtime" for name in plan.RUNTIME_FILES}
        manifest = {"sourceSha": OLD, "files": {
            name: {"sha256": hashlib.sha256(raw).hexdigest()} for name, raw in files.items()}}
        state = {"schemaVersion": 1, "phase": "active", "current": OLD, "previous": OLD}
        controller = SimpleNamespace(
            ROOT=Path("/root"), ENV=Path("/root/.env"), STATE=Path("/root/state"),
            RUNTIME_MANIFEST=Path("/root/manifest"), ensure_repo_location=Mock(),
            runtime_manifest=Mock(return_value=manifest), current_sha_from_text=lambda _: OLD,
            pwd=SimpleNamespace(getpwnam=lambda _: SimpleNamespace(pw_uid=os.getuid())))
        env = b"private"
        def read(path, *args, **kwargs):
            if path == controller.ENV:
                return env
            if path == controller.STATE:
                return json.dumps(state).encode()
            if path == controller.RUNTIME_MANIFEST:
                return json.dumps(manifest).encode()
            return files[str(path.relative_to(controller.ROOT))]
        with patch.object(collector, "_private_bytes", side_effect=read), \
             patch.object(collector, "_configuration", return_value=(
                 "d" * 64, {"requiredKeys": [], "missingKeys": []})):
            observed, actual, _ = collector._snapshot(controller, Mock())
            self.assertEqual(actual, files)
            self.assertEqual(observed["manifestSha256"],
                             hashlib.sha256(json.dumps(manifest).encode()).hexdigest())
            self.assertEqual(observed["releaseStateSha256"],
                             hashlib.sha256(json.dumps(state).encode()).hexdigest())
            for changes in ({"phase": "pending"}, {"current": NEW}, {"schemaVersion": True}):
                prior = state.copy()
                state.update(changes)
                with self.subTest(changes=changes), self.assertRaises(release.ReleaseContractError):
                    collector._snapshot(controller, Mock())
                state.clear()
                state.update(prior)
            manifest["files"][plan.RUNTIME_FILES[0]]["sha256"] = "f" * 64
            with self.assertRaises(release.ReleaseContractError):
                collector._snapshot(controller, Mock())

    def test_reused_controller_checks_use_supplied_observer_and_retain_mount_gates(self):
        import deploy_release as controller
        broken_mount = False
        def observed(args, **_):
            if args[:3] == ["docker", "volume", "inspect"]:
                return "[]"
            service = args[-1].removeprefix("container-")
            if args[3] == "{{.Config.Image}}":
                image = "sanq-web" if service == "web" else "sanq-api"
                return f"ghcr.io/sanqin888/{image}:{OLD}"
            mount = ({"Type": "volume", "Destination": "/var/lib/postgresql/data",
                      "Name": "wrong" if broken_mount else controller.EXPECTED_DB_VOLUME}
                     if service == "db" else
                     {"Type": "bind", "Destination": "/app/uploads",
                      "Source": str(controller.UPLOADS_DIR)})
            return json.dumps([mount])
        observe = SimpleNamespace(run=Mock(side_effect=observed),
                                  compose=Mock(side_effect=lambda sha, *args, **_:
                                               "container-" + args[-1]))
        with patch.object(controller, "run", side_effect=AssertionError("legacy daemon path")), \
             patch.object(controller, "compose", side_effect=AssertionError("legacy daemon path")):
            controller.check_running_images(OLD, observe=observe)
            controller.check_live_storage(OLD, observe=observe)
            self.assertEqual(observe.run.call_count, 7)
            self.assertEqual(observe.compose.call_count, 6)
            broken_mount = True
            with self.assertRaises(controller.DeploymentBlocked):
                controller.check_live_storage(OLD, observe=observe)

    def test_image_requires_architecture_digest_and_revision(self):
        image = inputs()["candidate"]["images"]["sanq-api"]
        pinned = collector._pinned(image)
        good = {"Os": "linux", "Architecture": "amd64", "RepoDigests": [pinned],
                "Config": {"Labels": {"org.opencontainers.image.revision": NEW}}}
        collector._inspect_image(pinned, pinned, NEW, lambda _: json.dumps(good))
        for field, value in (("Architecture", "arm64"), ("RepoDigests", []),
                             ("Config", {"Labels": {"org.opencontainers.image.revision": OLD}})):
            with self.subTest(field=field), self.assertRaises(release.ReleaseContractError):
                collector._inspect_image(pinned, pinned, NEW,
                                         lambda _: json.dumps({**good, field: value}))

    def test_probe_is_isolated_and_bounded_without_business_environment(self):
        run = Mock(return_value=json.dumps(inputs()["inventory"]))
        collector._probe_sql("ghcr.io/sanqin888/sanq-api@sha256:" + "e" * 64, run)
        args = run.call_args.args[0]
        for flag, value in (("--network", "none"), ("--memory", "256m"),
                            ("--memory-swap", "256m"), ("--pids-limit", "64"),
                            ("--cpus", "0.5"), ("--entrypoint", "/usr/local/bin/node"), ("--pull", "never")):
            self.assertEqual(args[args.index(flag) + 1], value)
        self.assertIn("--read-only", args)
        self.assertIn("--rm", args)
        self.assertEqual([args[index + 1] for index, flag in enumerate(args) if flag == "--env"],
                         ["NODE_OPTIONS=", "NODE_PATH=", "NODE_COMPILE_CACHE="])
        self.assertNotIn("--env-file", args)
        self.assertNotIn("--mount", args)
        self.assertNotIn("--volume", args)
        self.assertEqual(run.call_args.kwargs["timeout"], 45)

    def test_probe_failure_removes_only_its_nonce_labelled_container(self):
        for labels, expected_calls in (({"io.sanq.plan.probe": "f" * 32}, 3),
                                       ({"io.sanq.plan.probe": "other"}, 2)):
            run = Mock(side_effect=[release.ReleaseContractError("probe failed"),
                                    json.dumps(labels), ""])
            with self.subTest(labels=labels), \
                 patch.object(collector.uuid, "uuid4", return_value=SimpleNamespace(hex="f" * 32)):
                with self.assertRaises(release.ReleaseContractError):
                    collector._probe_sql("pinned", run)
            self.assertEqual(run.call_count, expected_calls)
            if expected_calls == 3:
                self.assertEqual(run.call_args.args[0],
                                 ["docker", "rm", "-f", "sanq-plan-probe-" + "f" * 32])

    def test_history_uses_read_only_transaction_and_no_interpolated_sql(self):
        run = Mock(return_value=json.dumps(inputs()["history"]))
        controller = SimpleNamespace(ROOT="/root", ENV="/root/.env", COMPOSE="/root/compose")
        self.assertEqual(collector._history(controller, run), inputs()["history"])
        args = run.call_args.args[0]
        self.assertEqual(args[-1], collector.HISTORY_SQL)
        self.assertTrue(collector.HISTORY_SQL.startswith("BEGIN READ ONLY;"))
        self.assertNotIn("migrate deploy", " ".join(args))
        self.assertEqual(args[-3], collector.HISTORY_COMMAND)
        with self.assertRaises(release.ReleaseContractError):
            collector._history(controller, lambda _: "[]")

    def test_private_observation_rejects_links_modes_and_size(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "input"
            source.write_bytes(b"secret")
            source.chmod(0o600)
            self.assertEqual(collector._private_bytes(source, os.getuid()), b"secret")
            with self.assertRaises(release.ReleaseContractError):
                collector._private_bytes(source, os.getuid(), maximum=2)
            source.chmod(0o640)
            with self.assertRaises(release.ReleaseContractError):
                collector._private_bytes(source, os.getuid())
            source.chmod(0o600)
            alias = Path(directory) / "alias"
            os.link(source, alias)
            with self.assertRaises(release.ReleaseContractError):
                collector._private_bytes(source, os.getuid())
            alias.unlink()
            alias.symlink_to(source)
            with self.assertRaises(OSError):
                collector._private_bytes(alias, os.getuid())

    def test_configuration_hash_binds_actual_expansion_without_exporting_secrets(self):
        controller = SimpleNamespace(ROOT="/root", ENV="/root/.env", COMPOSE="/root/compose",
                                     current_sha_from_text=lambda _: OLD)
        services = {service: {"image": f"ghcr.io/sanqin888/{name}:{OLD}"}
                    for service, name in (("api", "sanq-api"), ("ubereats-worker", "sanq-api"),
                                          ("web", "sanq-web"))}
        expanded = {"name": "sanq-app", "services": services, "x-value": "actual-secret"}
        def run(args):
            if args[-1] == "--environment":
                values = {"JWT_SECRET": "actual-secret", "OPTIONAL": ""}
                return "".join(f"{key}={value}\n" for key, value in values.items())
            return json.dumps(expanded)
        compose = b"x: ${JWT_SECRET} ${OPTIONAL:-fallback} $${CONTAINER_ONLY}\n"
        with patch.object(collector, "_private_bytes", return_value=compose):
            first, observed = collector._configuration(controller, b"private-env", run)
            self.assertEqual(observed, {"requiredKeys": ["JWT_SECRET"], "missingKeys": []})
            self.assertNotIn("actual-secret", json.dumps(observed))
            expanded["x-value"] = "changed-through-inheritance"
            second, _ = collector._configuration(controller, b"private-env", run)
            self.assertNotEqual(first, second)
            with self.assertRaises(release.ReleaseContractError):
                collector._configuration(controller, b"private-env",
                                         lambda _: "{}=\n".format("JWT_SECRET"))
            expanded["services"]["api"]["image"] = "unexpected"
            with self.assertRaises(release.ReleaseContractError):
                collector._configuration(controller, b"private-env", run)

    def test_backup_hashes_original_gzip_and_rejects_corrupt_or_linked_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "sanqin_db_20261026_150000.sql.gz"
            compressed = gzip.compress(b"backup data\n", mtime=0)
            source.write_bytes(compressed)
            source.chmod(0o600)
            controller = SimpleNamespace(BACKUP_DIR=root, _trusted_dir=Mock(),
                pwd=SimpleNamespace(getpwnam=lambda _: SimpleNamespace(pw_uid=os.getuid())))
            value = collector._backup(controller)
            self.assertEqual(value["sha256"], hashlib.sha256(compressed).hexdigest())
            self.assertEqual(value["bytes"], len(compressed))
            source.write_bytes(b"corrupt")
            with self.assertRaises((OSError, EOFError)):
                collector._backup(controller)
            source.unlink()
            source.symlink_to(root / "missing")
            with self.assertRaises(OSError):
                collector._backup(controller)

    def test_stale_or_future_backup_is_rejected(self):
        import time
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "sanqin_db_20261026_150000.sql.gz"
            source.write_bytes(gzip.compress(b"backup", mtime=0))
            source.chmod(0o600)
            controller = SimpleNamespace(BACKUP_DIR=root, _trusted_dir=Mock(),
                pwd=SimpleNamespace(getpwnam=lambda _: SimpleNamespace(pw_uid=os.getuid())))
            for offset in (-27 * 3600, 3600):
                stamp = time.time() + offset
                os.utime(source, (stamp, stamp))
                with self.subTest(offset=offset), self.assertRaises(release.ReleaseContractError):
                    collector._backup(controller)

    def test_command_errors_do_not_include_raw_output_or_credentials(self):
        def failed(args, **kwargs):
            kwargs["stdout"].write(b"private-env-value")
            kwargs["stderr"].write(b"private-token")
            self.assertEqual(kwargs["env"]["DOCKER_HOST"], "unix:///var/run/docker.sock")
            self.assertEqual(kwargs["env"]["DOCKER_CONTEXT"], "")
            return SimpleNamespace(returncode=1)
        with patch.object(collector.subprocess, "run", side_effect=failed):
            with self.assertRaises(release.ReleaseContractError) as captured:
                collector.command(["fixed-command"])
        self.assertNotIn("private", str(captured.exception))

    def test_duplicate_command_json_and_oversized_output_are_rejected(self):
        for raw in ('{"x":1,"x":2}', "x" * (collector.MAX_OUTPUT + 1)):
            with self.assertRaises(release.ReleaseContractError):
                collector._json(raw)


class ReviewCliTests(unittest.TestCase):
    def test_prepare_saves_only_when_requested_and_always_displays_review_only(self):
        raw, identity = prepared()
        for save in (False, True):
            with self.subTest(save=save), \
                 patch.object(collector, "collect", return_value=raw), \
                 patch.object(collector.store, "preparation_lock", return_value=contextlib.nullcontext()), \
                 patch.object(collector.store, "save_plan") as persist, \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                args = ["prepare", "--target-sha", NEW] + (["--save"] if save else [])
                self.assertEqual(collector.main(args), 0)
                value = json.loads(output.getvalue())
                self.assertEqual(value["planId"], identity)
                self.assertEqual(value["mode"], "REVIEW_ONLY")
                self.assertFalse(value["canExecute"])
                self.assertEqual(persist.call_count, int(save))

    def test_show_requires_independent_id_and_no_apply_subcommand_exists(self):
        raw, identity = prepared()
        with patch.object(collector.store, "load_plan", return_value=raw), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["show", identity]), 0)
            self.assertEqual(json.loads(output.getvalue())["planId"], identity)
        with patch.object(collector.store, "load_plan", return_value=raw), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(collector.main(["show", "f" * 64]), 1)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            collector.main(["apply", identity])
        self.assertEqual(error.exception.code, 2)

    def test_failure_never_echoes_arbitrary_observation_text(self):
        message = "{}={}".format("JWT_SECRET", "private")
        with patch.object(collector.store, "preparation_lock", return_value=contextlib.nullcontext()), \
             patch.object(collector, "collect", side_effect=ValueError(message)), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["prepare", "--target-sha", NEW]), 1)
        self.assertNotIn("JWT_SECRET", output.getvalue())
        self.assertNotIn("private", output.getvalue())


if __name__ == "__main__":
    unittest.main()
