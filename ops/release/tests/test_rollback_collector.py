"""Offline rollback collection/typed storage; every Docker/GitHub call is modeled."""
import contextlib
import copy
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_rollback_review as review_fixtures
import test_deployment_plan_store as store_fixtures
import test_deployment_plan as fixtures
import collect_deployment_plan as collector
import deployment_plan as plan
import deployment_plan_store as storage
import release_contract as release


class RollbackCollectorTests(unittest.TestCase):
    def setUp(self):
        self.review = review_fixtures.RollbackReviewTests(
            "test_review_binds_original_state_and_lists_extra_sql_without_authority")
        self.review.setUp()
        self.raw, self.identity = self.review.make()
        self.values = self.review.values
        self.state_raw = self.review.state_bytes()
        self.files = {name: b"fixed runtime fixture" for name in plan.RUNTIME_FILES}
        self.controller = SimpleNamespace(ROOT=Path("/fixture"), ENV=Path("/fixture/.env"),
            STATE=Path("/fixture/state"), COMPOSE=Path("/fixture/compose"),
            check_live_storage=Mock(), check_running_images=Mock(side_effect=AssertionError("health must not gate rollback")))
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.dict(os.environ, {}, clear=True))
        self.stack.enter_context(patch.object(collector.os, "geteuid", return_value=0))
        self.clear = self.stack.enter_context(patch.object(storage, "check_maintenance_clear"))
        self.snapshot = self.replace(collector, "_snapshot", return_value=(
            self.values["current"], self.files, self.values["environment"]))
        self.private = self.replace(collector, "_private_bytes", return_value=self.state_raw)
        self.replace(collector, "_resource_preflight")
        self.backup = self.replace(collector, "_backup", return_value=self.values["backup"])
        self.paired = copy.deepcopy(fixtures.inputs()["candidate"])
        for name, image in self.paired["images"].items():
            image["digest"] = "sha256:" + ("c" if name == "sanq-api" else "d") * 64
        self.current = self.replace(collector, "_current_images", return_value=self.paired)
        self.inspect = self.replace(collector, "_inspect_image")
        current_ref = collector._pinned(self.paired["images"]["sanq-api"])
        self.probe = self.replace(collector, "_probe_sql", side_effect=lambda ref, run:
            self.values["inventory"] if ref == current_ref else self.review.target_inventory)
        self.history = self.replace(collector, "_history", return_value=self.values["history"])
        self.replace(collector, "now_utc", return_value=fixtures.NOW)
        self.proof = self.replace(release, "verify_exact_rollback", return_value=self.values["candidate"])
        self.replace(plan, "fetch_runtime_files", return_value=self.files)
        prefix = "/repos/" + release.REPOSITORY
        older_tree = "d" * 40
        self.responses = {}
        for sha, tree_sha, inventory in (
                (fixtures.NEW, fixtures.TREE, self.values["inventory"]),
                (fixtures.OLD, older_tree, self.review.target_inventory)):
            self.responses[prefix + "/git/commits/" + sha] = {"sha": sha, "tree": {"sha": tree_sha}}
            tree = fixtures.git_tree(inventory)
            tree["sha"] = tree_sha
            self.responses[prefix + "/git/trees/" + tree_sha + "?recursive=1"] = tree
        self.fetch = Mock(side_effect=self.responses.__getitem__)
        self.db_id = "9" * 64
        self.db = {"Id": self.db_id, "Image": "sha256:" + "1" * 64,
            "State": {"Running": True}, "Config": {"Labels": {
                "com.docker.compose.project": "sanq-app", "com.docker.compose.service": "db"}},
            "Mounts": [{"Type": "volume", "Name": "sanq-app_pgdata",
                        "Destination": "/var/lib/postgresql/data"}]}
        self.calls = []
        self.db_changed = False
        self.db_reads = 0

    def replace(self, owner, name, **kwargs):
        return self.stack.enter_context(patch.object(owner, name, **kwargs))

    def command(self, args, **kwargs):
        self.calls.append((args[:], kwargs))
        if args[-3:] == ["ps", "-q", "db"]:
            return self.db_id
        if args[:2] == ["docker", "inspect"]:
            self.db_reads += 1
            info = copy.deepcopy(self.db)
            if self.db_changed and self.db_reads > 1:
                info["Image"] = "sha256:" + "2" * 64
            return json.dumps(info)
        return ""

    def collect(self, **kwargs):
        return collector.collect_rollback(controller=self.controller, run=self.command,
            fetch=self.fetch, **kwargs)

    def test_exact_previous_both_sql_sources_and_no_health_or_application_mutation(self):
        raw = self.collect()
        value = plan.validate_rollback_review(raw, json.loads(raw)["planId"])
        self.assertEqual(value["candidate"]["sourceSha"], fixtures.OLD)
        self.assertEqual(value["migrationInventory"], self.values["inventory"])
        self.assertEqual(value["targetMigrationInventory"], self.review.target_inventory)
        self.assertEqual(value["releaseStateRaw"].encode(), self.state_raw)
        self.assertEqual(self.probe.call_count, 2)
        self.assertEqual(self.proof.call_count, 2)
        self.assertTrue(all(c.args[:2] == (fixtures.NEW, fixtures.OLD) for c in self.proof.call_args_list))
        self.assertEqual(self.current.call_count, 2)
        self.assertTrue(all(c.kwargs["include_stopped"] for c in self.current.call_args_list))
        self.controller.check_running_images.assert_not_called()
        self.assertEqual(self.controller.check_live_storage.call_count, 2)
        self.assertFalse(any(args[0] == "bash" for args, _ in self.calls))
        self.assertEqual([args[:2] for args, _ in self.calls if "pull" in args], [["docker", "pull"]] * 2)
        self.assertFalse(any(word in args for args, _ in self.calls
                             for word in ("start", "stop", "update", "create", "up", "build")))

    def test_cached_only_never_pulls_and_missing_image_blocks_before_probe(self):
        self.collect(cache_images=False)
        self.assertFalse(any("pull" in args for args, _ in self.calls))
        self.inspect.side_effect = release.ReleaseContractError("cache missing")
        self.probe.reset_mock()
        with self.assertRaises(release.ReleaseContractError):
            self.collect(cache_images=False)
        self.probe.assert_not_called()

    def test_state_bytes_or_snapshot_drift_blocks(self):
        self.private.side_effect = [self.state_raw, self.state_raw + b" "]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.private.side_effect = None
        changed = copy.deepcopy(self.snapshot.return_value)
        changed[0]["configurationSha256"] = "0" * 64
        self.snapshot.side_effect = [self.snapshot.return_value, changed]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()

    def test_pending_or_previous_mismatch_blocks_before_image_probes(self):
        state = copy.deepcopy(self.review.state)
        state["phase"] = "pending"
        self.private.return_value = json.dumps(state).encode()
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.probe.assert_not_called()
        self.proof.assert_not_called()

    def test_changed_history_backup_or_database_blocks(self):
        self.history.side_effect = [self.values["history"], []]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.history.side_effect = None
        self.backup.side_effect = [self.values["backup"], {}]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.backup.side_effect = None
        self.db_changed, self.db_reads = True, 0
        with self.assertRaises(release.ReleaseContractError):
            self.collect()

    def test_stopped_or_wrong_role_or_wrong_volume_database_blocks_before_sql_probe(self):
        original = copy.deepcopy(self.db)
        cases = []
        bad = copy.deepcopy(original)
        bad["State"]["Running"] = False
        cases.append(bad)
        bad = copy.deepcopy(original)
        bad["Config"]["Labels"]["com.docker.compose.service"] = "other"
        cases.append(bad)
        bad = copy.deepcopy(original)
        bad["Mounts"][0]["Name"] = "other_pgdata"
        cases.append(bad)
        for bad in cases:
            self.db = bad
            with self.assertRaises(release.ReleaseContractError):
                self.collect(cache_images=False)
        self.probe.assert_not_called()

    def test_current_or_previous_source_tree_truncation_or_sql_drift_blocks(self):
        original = copy.deepcopy(self.responses)
        for key in [key for key in self.responses if "/trees/" in key]:
            self.responses[key]["truncated"] = True
            with self.assertRaises(release.ReleaseContractError):
                self.collect()
            self.responses.clear()
            self.responses.update(copy.deepcopy(original))
        self.probe.side_effect = lambda ref, run: [{**self.values["inventory"][0], "gitBlobSha": "0" * 40}]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()

    def test_proof_runtime_or_mount_failure_blocks(self):
        self.proof.side_effect = [self.values["candidate"], {**self.values["candidate"], "ciRunId": 99}]
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.proof.side_effect = None
        with patch.object(plan, "fetch_runtime_files", return_value={
                **self.files, plan.RUNTIME_FILES[0]: b"different"}), self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.controller.check_live_storage.side_effect = release.ReleaseContractError("mount differs")
        with self.assertRaises(release.ReleaseContractError):
            self.collect()

    def test_maintenance_nonroot_and_custom_docker_endpoint_block_before_snapshot(self):
        self.clear.side_effect = release.ReleaseContractError("retained maintenance")
        with self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.snapshot.assert_not_called()
        self.clear.side_effect = None
        with patch.object(collector.os, "geteuid", return_value=1000), self.assertRaises(release.ReleaseContractError):
            self.collect()
        with patch.dict(os.environ, {"DOCKER_HOST": "remote"}), self.assertRaises(release.ReleaseContractError):
            self.collect()
        self.snapshot.assert_not_called()

    def test_mount_observer_includes_stopped_apps_but_not_stopped_db(self):
        self.collect(cache_images=False)
        observe = self.controller.check_live_storage.call_args.kwargs["observe"]
        observe.compose(fixtures.NEW, "ps", "-q", "api")
        self.assertEqual(self.calls[-1][0][-4:], ["ps", "-a", "-q", "api"])
        observe.compose(fixtures.NEW, "ps", "-q", "db")
        self.assertEqual(self.calls[-1][0][-3:], ["ps", "-q", "db"])

    def test_cli_saves_and_shows_only_typed_summary_without_state_original(self):
        raw = self.collect(cache_images=False)
        identity = json.loads(raw)["planId"]
        with patch.object(collector, "collect_rollback", return_value=raw) as collect, \
             patch.object(storage, "preparation_lock", side_effect=contextlib.nullcontext), \
             patch.object(storage, "save_rollback_review", return_value=identity) as save, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["prepare-rollback", "--save", "--cached-only"]), 0)
        collect.assert_called_once_with(cache_images=False)
        save.assert_called_once_with(raw)
        summary = json.loads(output.getvalue())
        self.assertEqual(summary["mode"], "ROLLBACK_REVIEW_ONLY")
        self.assertFalse(summary["canExecute"])
        self.assertNotIn("releaseStateRaw", summary)
        with patch.object(storage, "load_rollback_review", return_value=raw), \
             patch.object(collector, "collect_rollback") as collect, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(collector.main(["show-rollback", identity]), 0)
        collect.assert_not_called()

    def test_cli_cannot_choose_target_and_failure_does_not_echo_observations(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            collector.main(["prepare-rollback", "--target-sha", fixtures.OLD])
        with patch.object(collector, "collect_rollback", side_effect=ValueError("DO_NOT_PRINT")), \
             patch.object(storage, "preparation_lock", side_effect=contextlib.nullcontext), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(collector.main(["prepare-rollback"]), 1)
        self.assertNotIn("DO_NOT_PRINT", output.getvalue())

    def test_real_current_image_adapter_accepts_all_container_selection(self):
        paired = self.paired
        run = Mock(side_effect=["a" * 64, "sha256:" + "b" * 64] * 3)
        with patch.object(release, "sealed_release_for_sha", return_value=paired), \
             patch.object(collector, "_inspect_image"):
            # The instance fixture patches this adapter; load its saved original.
            result = self.real_current(self.controller, fixtures.NEW, run, Mock(), include_stopped=True)
        self.assertEqual(result, paired)
        self.assertTrue(all(call.args[0][-4:-1] == ["ps", "-a", "-q"]
                            for call in run.call_args_list[::2]))


# Save only the original adapter before per-instance patches, no project command runs.
RollbackCollectorTests.real_current = staticmethod(collector._current_images)


class RollbackStorageTests(unittest.TestCase):
    def setUp(self):
        self.fs = store_fixtures.PrivatePlanStoreTests(
            "test_create_private_and_load_same_original_by_retained_identity")
        self.fs.setUp()
        self.addCleanup(self.fs.doCleanups)
        self.review = review_fixtures.RollbackReviewTests(
            "test_review_binds_original_state_and_lists_extra_sql_without_authority")
        self.review.setUp()
        self.raw, self.identity = self.review.make()
        self.target = self.fs.directory / (self.identity + ".json")

    def test_same_private_store_but_wrong_kind_cannot_be_loaded_or_saved(self):
        self.assertEqual(storage.save_rollback_review(self.raw), self.identity)
        self.assertEqual(storage.load_rollback_review(self.identity), self.raw)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(release.ReleaseContractError):
            storage.load_plan(self.identity)
        with self.assertRaises(release.ReleaseContractError):
            storage.save_plan(self.raw)
        storage.save_plan(self.fs.raw)
        with self.assertRaises(release.ReleaseContractError):
            storage.load_rollback_review(self.fs.identity)
        with self.assertRaises(release.ReleaseContractError):
            storage.save_rollback_review(self.fs.raw)

    def test_duplicate_sync_unknown_and_partial_write_preserve_evidence(self):
        with patch.object(storage.os, "fsync", side_effect=OSError("sync unknown")), self.assertRaises(OSError):
            storage.save_rollback_review(self.raw)
        self.assertTrue(self.target.exists())
        with self.assertRaises(release.ReleaseContractError):
            storage.save_rollback_review(self.raw)
        self.assertEqual(self.target.read_bytes(), self.raw)

    def test_partial_write_is_not_retried_or_overwritten(self):
        real = os.write
        count = 0
        def partial(fd, data):
            nonlocal count
            count += 1
            if count == 1:
                return real(fd, data[:11])
            raise OSError("write interrupted")
        with patch.object(storage.os, "write", side_effect=partial), self.assertRaises(OSError):
            storage.save_rollback_review(self.raw)
        self.assertEqual(self.target.read_bytes(), self.raw[:11])
        with self.assertRaises(release.ReleaseContractError):
            storage.load_rollback_review(self.identity)
        with self.assertRaises(release.ReleaseContractError):
            storage.save_rollback_review(self.raw)

    def test_wrong_owner_mode_symlink_and_hardlink_are_rejected(self):
        storage.save_rollback_review(self.raw)
        self.target.chmod(0o640)
        with self.assertRaises(release.ReleaseContractError):
            storage.load_rollback_review(self.identity)
        self.target.chmod(0o600)
        with patch.object(storage, "OWNER_UID", os.getuid() + 1), self.assertRaises(release.ReleaseContractError):
            storage.load_rollback_review(self.identity)
        other = self.fs.parent / "other"
        self.target.rename(other)
        self.target.symlink_to(other)
        with self.assertRaises(OSError):
            storage.load_rollback_review(self.identity)
        self.target.unlink()
        os.link(other, self.target)
        with self.assertRaises(release.ReleaseContractError):
            storage.load_rollback_review(self.identity)


if __name__ == "__main__":
    unittest.main()
