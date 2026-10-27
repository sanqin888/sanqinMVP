"""Offline rollback create/register models; no real Docker, SQL, systemd or production files."""
import contextlib
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_rollback_freeze as freeze_fixtures
import test_deployment_plan as fixtures
import maintenance_guard as guard
import deployment_plan as plan
import deployment_plan_store as storage
import collect_deployment_plan as collector
import release_job as job
from release_contract import ReleaseContractError


class RollbackCreateTests(unittest.TestCase):
    def setUp(self):
        self.rb = freeze_fixtures.RollbackFreezeTests(
            "test_persist_exact_target_scope_and_policies_before_stopping_unhealthy_or_exited_apps")
        self.rb.setUp()
        self.addCleanup(self.rb.doCleanups)
        self.frozen = self.rb.freeze()
        self.identity, self.approval, self.controller = self.rb.identity, self.rb.approval, self.rb.controller
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(collector, "_resource_preflight"))
        self.probe = self.stack.enter_context(patch.object(collector, "_probe_sql",
            return_value=self.rb.original["targetMigrationInventory"]))
        self.fetch = Mock(side_effect=self.source)
        self.ids = {name: char * 64 for name, char in
                    (("api", "4"), ("ubereats-worker", "5"), ("web", "6"))}
        self.roles = {name: [identifier] for name, identifier in self.rb.base.ids.items()}
        self.expanded = {"name": "sanq-app", "services": {"db": {"image": "postgres:15"}},
            "networks": {"default": {"name": "sanq-app_default"}},
            "volumes": {"pgdata": {"name": "sanq-app_pgdata"}}}
        for service in guard.SERVICES:
            name = "sanq-web" if service == "web" else "sanq-api"
            self.expanded["services"][service] = {
                "image": f"ghcr.io/sanqin888/{name}:{fixtures.NEW}", "restart": "always",
                "depends_on": {"db": {"condition": "service_healthy"}},
                "networks": {"default": None}, "environment": {"PRIVATE_FIXTURE": "DO_NOT_PERSIST"},
                "volumes": [] if service == "web" else [
                    {"type": "bind", "source": "/srv/sanq/uploads", "target": "/app/uploads"}]}
        self.calls, self.creates, self.pending_writes = [], [], []
        self.partial = self.bad_mount = self.change_db = self.extra_role = False
        self.bad_state = self.bad_policy = self.bad_image = self.keep_originals = False
        self.truncated = self.fail_pending = False
        self.controller.write_creation_pending.side_effect = self.pending

    def pending(self, current, target):
        self.assertEqual((current, target), (fixtures.NEW, fixtures.OLD))
        record = guard.status()
        self.assertEqual((record["schemaVersion"], record["phase"]), (6, "CREATING_CANDIDATES"))
        self.assertEqual(record["rollback"], self.frozen["rollback"])
        self.assertEqual(record["candidate"]["containers"], {})
        self.pending_writes.append((current, target))
        if self.fail_pending:
            raise OSError("state write unknown")

    def source(self, path):
        prefix = "/repos/sanqin888/sanqinMVP/git/"
        if path == prefix + "commits/" + fixtures.OLD:
            return {"sha": fixtures.OLD, "tree": {"sha": fixtures.TREE}}
        self.assertEqual(path, prefix + "trees/" + fixtures.TREE + "?recursive=1")
        tree = fixtures.git_tree(self.rb.original["targetMigrationInventory"])
        tree["truncated"] = self.truncated
        return tree

    def command(self, args, **kwargs):
        self.calls.append(args[:])
        if args[:2] == ["docker", "compose"]:
            if args[-3:] == ["config", "--format", "json"]:
                return json.dumps(self.expanded)
            if args[-4:-1] == ["ps", "-a", "-q"] and args[-1] in guard.SERVICES:
                return self.roles[args[-1]][-1]
            if "create" in args:
                self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
                self.assertEqual(self.pending_writes, [(fixtures.NEW, fixtures.OLD)])
                with self.assertRaises(ReleaseContractError):
                    with job._locked_directory():
                        pass
                with self.assertRaises(ReleaseContractError):
                    with storage.preparation_lock():
                        pass
                self.creates.append((args[:], json.loads(kwargs["input_bytes"]), kwargs["timeout"]))
                for service in guard.SERVICES:
                    old_id, identifier = self.rb.base.ids[service], self.ids[service]
                    info = copy.deepcopy(self.rb.base.info[old_id])
                    info["Id"], info["Image"] = identifier, "sha256:" + ("b" if service == "web" else "a") * 64
                    name = "sanq-web" if service == "web" else "sanq-api"
                    info["Config"]["Image"] = collector._pinned(self.rb.original["candidate"]["images"][name])
                    info["State"] = {"Status": "running" if self.bad_state else "created",
                        "Running": self.bad_state, "Restarting": False, "Paused": False, "Dead": False}
                    info["HostConfig"]["RestartPolicy"] = {
                        "Name": "always" if self.bad_policy else "no", "MaximumRetryCount": 0}
                    info["Mounts"] = [] if service == "web" else [
                        {"Type": "bind", "Source": "/bad" if self.bad_mount else "/srv/sanq/uploads",
                         "Destination": "/app/uploads", "RW": True}]
                    self.rb.base.info[identifier] = info
                    self.roles[service] = ([old_id] if self.keep_originals else []) + [identifier]
                    if not self.keep_originals:
                        del self.rb.base.info[old_id]
                    if self.partial:
                        raise ReleaseContractError("create outcome unknown")
                return ""
        if args[:2] == ["docker", "ps"]:
            service = next(row.split("=", 2)[-1] for row in args
                           if row.startswith("label=com.docker.compose.service="))
            ids = self.roles[service] + (["8" * 64] if self.extra_role and self.creates else [])
            return "\n".join(ids)
        if args[:3] == ["docker", "image", "inspect"]:
            selected, target = args[-1], self.rb.original["candidate"]
            refs = {collector._pinned(row) for row in target["images"].values()}
            if selected in refs or selected in ("sha256:" + "a" * 64, "sha256:" + "b" * 64):
                name = "sanq-web" if "sanq-web" in selected or selected == "sha256:" + "b" * 64 else "sanq-api"
                return json.dumps({"Os": "linux", "Architecture": "amd64",
                    "RepoDigests": [collector._pinned(target["images"][name])],
                    "Config": {"Labels": {"org.opencontainers.image.revision":
                        fixtures.NEW if self.bad_image and self.creates else fixtures.OLD}}})
        if args[:2] == ["docker", "inspect"] and args[-1] == self.rb.db_id:
            info = copy.deepcopy(self.rb.db)
            if self.change_db and self.creates:
                info["Image"] = "sha256:" + "7" * 64
            return json.dumps(info)
        if args[:2] == ["docker", "inspect"]:
            if args[-1] not in self.rb.base.info:
                raise ReleaseContractError("saved object absent")
            return json.dumps(self.rb.base.info[args[-1]])
        if args[:2] in (["docker", "update"], ["docker", "stop"]):
            identifier = args[-1]
            self.assertIn(identifier, {*self.ids.values(), *self.rb.base.ids.values()})
            if identifier not in self.rb.base.info:
                raise ReleaseContractError("saved original removed")
            info = self.rb.base.info[identifier]
            info["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
            if args[1] == "stop":
                info["State"].update(Status="exited", Running=False)
            return ""
        return self.rb.command(args, **kwargs)

    def prepare(self, **kwargs):
        return guard.prepare_rollback_candidate_containers(self.identity,
            kwargs.pop("attempt", self.frozen["attemptId"]), kwargs.pop("approval", self.approval),
            controller=self.controller, run=self.command, fetch=self.fetch,
            now=kwargs.pop("now", lambda: self.rb.base.time), **kwargs)

    def cleanup(self):
        return guard.cleanup_after_task(self.identity, "exit-code", controller=self.controller,
            run=self.command, now=lambda: self.rb.base.time)

    def test_exact_old_digest_creation_keeps_full_history_and_records_all_ids_without_start(self):
        result = self.prepare()
        self.assertEqual(result["outcome"], "CANDIDATES_CREATED_NOT_STARTED")
        self.assertFalse(result["canExecute"])
        record = guard.status()
        self.assertEqual((record["schemaVersion"], record["phase"]), (6, "CANDIDATES_REGISTERED"))
        self.assertEqual(record["rollback"], self.frozen["rollback"])
        self.assertEqual(record["candidate"]["release"]["sourceSha"], fixtures.OLD)
        self.assertEqual(set(record["candidate"]["containers"]), set(guard.SERVICES))
        self.assertEqual(storage.load_rollback_review(self.identity), self.rb.raw)
        self.assertEqual(len(self.rb.original["migrationInventory"]), 2)
        self.assertEqual(len(self.rb.original["targetMigrationInventory"]), 1)
        args, body, timeout = self.creates[0]
        self.assertEqual(timeout, 180)
        self.assertEqual(args[-3:], list(guard.SERVICES))
        self.assertEqual(args[args.index("create") + 1:-3],
                         ["--no-build", "--pull", "never", "--force-recreate"])
        self.assertEqual(set(body["services"]), set(guard.SERVICES))
        self.assertNotIn("volumes", body)
        self.assertTrue(body["networks"]["default"]["external"])
        for service, fields in body["services"].items():
            name = "sanq-web" if service == "web" else "sanq-api"
            self.assertEqual(fields["image"], collector._pinned(self.rb.original["candidate"]["images"][name]))
            self.assertEqual(fields["restart"], "no")
            self.assertNotIn("depends_on", fields)
            self.assertFalse(self.rb.base.info[self.ids[service]]["State"]["Running"])
        self.assertNotIn("DO_NOT_PERSIST", self.rb.base.marker.read_text())
        self.controller.atomic_write.assert_not_called()
        self.controller.write_state.assert_not_called()
        self.controller.apply_reviewed_migrations.assert_not_called()
        self.assertFalse(any(word in row for row in self.calls for word in ("start", "up", "pull", "build")))
        guard._assert_stopped(self.controller, record, self.command)

    def test_retained_originals_and_registered_candidates_are_distinct_and_stopped(self):
        self.keep_originals = True
        self.prepare()
        guard._assert_stopped(self.controller, guard.status(), self.command)
        self.assertEqual(len(self.rb.base.info), 6)

    def test_wrong_missing_or_boolean_approval_and_wrong_attempt_cannot_create_intent(self):
        for approval in (None, True, self.identity, "0" * 64):
            with self.subTest(approval=approval), self.assertRaises(ReleaseContractError):
                self.prepare(approval=approval)
        with self.assertRaises(ReleaseContractError):
            self.prepare(attempt="0" * 32)
        self.assertEqual(self.creates, [])
        self.assertEqual(self.pending_writes, [])
        self.assertEqual(guard.status(), self.frozen)

    def test_target_proof_cached_sql_and_complete_source_tree_drift_block_before_intent(self):
        self.rb.proof.return_value = {**self.rb.original["candidate"], "ciRunId": 999}
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.rb.proof.return_value = self.rb.original["candidate"]
        self.probe.return_value = self.rb.original["migrationInventory"]
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.probe.return_value = self.rb.original["targetMigrationInventory"]
        self.truncated = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status(), self.frozen)
        self.assertEqual(self.creates, [])

    def test_current_snapshot_or_history_drift_cannot_replace_the_approved_baseline(self):
        self.rb.snapshot.return_value = ({**self.rb.original["current"], "configurationSha256": "f" * 64},
                                         self.rb.files, self.rb.original["environment"])
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.rb.snapshot.return_value = (self.rb.original["current"], self.rb.files,
                                        self.rb.original["environment"])
        self.rb.history.return_value = self.rb.original["migrationHistory"][:1]
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(self.creates, [])
        self.assertEqual(guard.status(), self.frozen)

    def test_partial_create_is_not_retried_or_adopted_by_cleanup(self):
        self.partial = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        self.assertEqual(guard.status()["candidate"]["containers"], {})
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(len(self.creates), 1)
        with self.assertRaises(ReleaseContractError):
            self.cleanup()
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        self.assertEqual(guard.status()["errorCode"], "FENCE_UNCONFIRMED")
        self.assertFalse(any(row[:2] in (["docker", "stop"], ["docker", "update"])
                             and row[-1] in self.ids.values() for row in self.calls))

    def test_unknown_pending_write_never_sends_create_and_keeps_intent(self):
        self.fail_pending = True
        with self.assertRaises(OSError):
            self.prepare()
        self.assertEqual(self.creates, [])
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        self.assertEqual(guard.status()["rollback"], self.frozen["rollback"])

    def test_database_change_during_create_blocks_registration(self):
        self.change_db = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        self.assertEqual(guard.status()["candidate"]["containers"], {})

    def test_post_create_history_change_preserves_pending_and_full_original_plan(self):
        original = copy.deepcopy(self.rb.original["migrationHistory"])
        self.rb.history.side_effect = lambda controller, run: original if not self.creates else [
            *original, {**original[0], "state": "rolled-back"}]
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        self.assertEqual(storage.load_rollback_review(self.identity), self.rb.raw)
        self.assertEqual(len(self.pending_writes), 1)

    def test_wrong_mount_cannot_be_registered(self):
        self.bad_mount = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["candidate"]["containers"], {})

    def test_running_candidate_is_rejected(self):
        self.bad_state = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["candidate"]["containers"], {})

    def test_automatic_restart_policy_is_rejected(self):
        self.bad_policy = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["candidate"]["containers"], {})

    def test_bad_created_image_revision_is_not_registered(self):
        self.bad_image = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["candidate"]["containers"], {})

    def test_unexpected_role_objects_cannot_be_adopted(self):
        self.extra_role = True
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(guard.status()["candidate"]["containers"], {})

    def test_registered_cleanup_uses_saved_candidates_before_originals(self):
        self.prepare()
        result = self.cleanup()
        self.assertEqual(result["outcome"], "TASK_FAILED_WRITERS_STOPPED")
        self.assertEqual(guard.status()["phase"], "INCIDENT")
        stops = [row[-1] for row in self.calls if row[:2] == ["docker", "stop"]]
        self.assertEqual(stops[:3], [self.ids[name] for name in guard.SERVICES])
        self.assertEqual(stops[3:], [self.rb.base.ids[name] for name in guard.SERVICES])
        self.assertEqual(guard.status()["rollback"], self.frozen["rollback"])

    def test_intent_write_unknown_is_not_replayed(self):
        real_write = guard._write
        def unknown(root, record, **kwargs):
            real_write(root, record, **kwargs)
            if record["phase"] == "CREATING_CANDIDATES":
                raise OSError("intent durability unknown")
        with patch.object(guard, "_write", side_effect=unknown), self.assertRaises(OSError):
            self.prepare()
        self.assertEqual(self.creates, [])
        self.assertEqual(guard.status()["phase"], "CREATING_CANDIDATES")
        with self.assertRaises(ReleaseContractError):
            self.prepare()

    def test_final_registration_unknown_preserves_actual_record_without_start(self):
        real_write = guard._write
        def unknown(root, record, **kwargs):
            real_write(root, record, **kwargs)
            if record["phase"] == "CANDIDATES_REGISTERED":
                raise OSError("registration durability unknown")
        with patch.object(guard, "_write", side_effect=unknown), self.assertRaises(OSError):
            self.prepare()
        self.assertEqual(guard.status()["phase"], "CANDIDATES_REGISTERED")
        with self.assertRaises(ReleaseContractError):
            self.prepare()
        self.assertEqual(len(self.creates), 1)
        self.assertFalse(any("start" in row for row in self.calls))

    def test_scope_downgrade_and_skipped_finalize_phase_cannot_overwrite_marker(self):
        self.prepare()
        record = guard.status()
        with storage._directory_fd(self.rb.base.maintenance) as root:
            for changes in ({"phase": "FINALIZING"}, {"phase": "CREATING_CANDIDATES"},
                            {"phase": "INCIDENT", "rollback": {**record["rollback"], "approvalSha256": "0" * 64}}):
                with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                    guard._write(root, {**record, **changes})
            downgraded = {key: value for key, value in record.items() if key != "rollback"}
            with self.assertRaises(ReleaseContractError):
                guard._write(root, {**downgraded, "schemaVersion": 2, "phase": "INCIDENT"})
        self.assertEqual(guard.status(), record)

    def test_resource_locks_and_forward_creation_cannot_bypass_rollback_approval(self):
        with storage.preparation_lock(), self.assertRaises(ReleaseContractError):
            self.prepare()
        with job._locked_directory(), self.assertRaises(ReleaseContractError):
            self.prepare()
        with self.assertRaises(ReleaseContractError):
            guard.prepare_candidate_containers(self.identity, self.frozen["attemptId"],
                controller=self.controller, run=self.command, fetch=self.fetch, now=lambda: self.rb.base.time)
        self.assertEqual(self.creates, [])
        self.assertEqual(guard.status(), self.frozen)

    def test_expired_backup_blocks_before_creation_intent(self):
        with self.assertRaises(ReleaseContractError):
            self.prepare(now=lambda: "2026-10-27T17:00:01Z")
        self.assertEqual(self.creates, [])
        self.assertEqual(guard.status(), self.frozen)


class CandidateComposeLiteralTests(unittest.TestCase):
    def test_compose_exported_dollars_are_preserved_without_a_second_escape(self):
        candidate = fixtures.inputs()["candidate"]
        expanded = {"name": "sanq-app", "services": {"db": {"image": "postgres:15"}},
                    "networks": {"default": {"name": "sanq-app_default"}}}
        for service in guard.SERVICES:
            expanded["services"][service] = {
                "image": "unused", "restart": "always", "environment": {
                    "DATABASE_URL": "postgres://u:p$$word" + "$$" + "{literal}$$$$tail@db/x",
                    "PLAIN": "unchanged"},
                "command": ["sh", "-c", "echo $$HOME " + "$$" + "{unset} $$$$ 100%"],
                "labels": {"literal_key": "value$$tail"}, "volumes": []}
        before = copy.deepcopy(expanded)
        value = json.loads(guard._creation_config(expanded, candidate))
        self.assertEqual(expanded, before)
        for fields in value["services"].values():
            self.assertEqual(fields["environment"]["DATABASE_URL"],
                             "postgres://u:p$$word" + "$$" + "{literal}$$$$tail@db/x")
            self.assertEqual(fields["command"][-1], "echo $$HOME " + "$$" + "{unset} $$$$ 100%")
            self.assertEqual(fields["labels"], {"literal_key": "value$$tail"})
            self.assertEqual(fields["environment"]["PLAIN"], "unchanged")

    def test_export_retains_fixed_pins_network_and_non_string_values(self):
        candidate = fixtures.inputs()["candidate"]
        expanded = {"name": "sanq-app", "services": {"db": {"image": "postgres:15"}},
                    "networks": {"default": {"name": "sanq-app_default"}}}
        for service in guard.SERVICES:
            expanded["services"][service] = {"image": "unused", "restart": "always",
                "environment": {"EMPTY": "", "NULL": None}, "read_only": True,
                "pids_limit": 64, "volumes": []}
        value = json.loads(guard._creation_config(expanded, candidate))
        for service, fields in value["services"].items():
            name = "sanq-web" if service == "web" else "sanq-api"
            self.assertEqual(fields["image"], collector._pinned(candidate["images"][name]))
            self.assertTrue(fields["read_only"])
            self.assertEqual(fields["pids_limit"], 64)
            self.assertIsNone(fields["environment"]["NULL"])
        self.assertEqual(value["networks"]["default"], {"name": "sanq-app_default", "external": True})

    def test_migration_stdin_uses_the_same_compose_exported_url_without_double_escape(self):
        candidate = fixtures.inputs()["candidate"]
        exported = "postgres://u:p$$word" + "$$" + "{literal}$$$$tail@db/x"
        discarded = "DO_NOT_FORWARD"
        expanded = {"services": {"api": {"environment": {
            "DATABASE_URL": exported, "JWT_SECRET": discarded}}}}
        record = {"planId": "1" * 64, "attemptId": "2" * 32, "migration": {"release": candidate}}
        value = json.loads(guard.migration.creation_config(expanded, record))
        service = value["services"]["sanq-migration"]
        self.assertEqual(service["environment"], {"DATABASE_URL": exported})
        self.assertEqual(expanded["services"]["api"]["environment"]["DATABASE_URL"], exported)
        self.assertEqual(service["image"], collector._pinned(candidate["images"]["sanq-api"]))
        self.assertNotIn("DO_NOT_FORWARD", json.dumps(value))
        self.assertNotIn("volumes", service)
        self.assertEqual(service["restart"], "no")


if __name__ == "__main__":
    unittest.main()
