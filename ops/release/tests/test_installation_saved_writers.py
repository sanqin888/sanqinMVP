"""Saved original writer facts: real disposable records, modeled host services."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_gate_load as gates
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationSavedWritersTests(unittest.TestCase):
    def setUp(self):
        self.base = gates.InstallationGateLoadTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.materials

    def observe(self):
        with patch.object(installer, "_load_installation_deny_gates", side_effect=installer._save_installation_writers):
            return self.base.observe()

    def record_path(self):
        return self.base.intent_path().with_name("writers.json")

    def originals(self):
        intent = self.base.intent_path().read_bytes()
        return intent, self.record_path().read_bytes(), self.record_path().parent.name

    def test_owned_record_preserves_all_original_objects_without_mutating_container_or_application_state(self):
        containers = copy.deepcopy(self.base.combined.docker.containers)
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("unmodeled spawn")):
            result = self.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_SAVED")
        facts = result["installationIntent"]
        self.assertTrue(facts["startupFenceConfirmed"])
        self.assertFalse(facts["savedWriters"]["writersFrozen"])
        self.assertFalse(facts["canExecute"])
        for key in ("readyToInstall", "hostPreflightComplete", "operationSuccessProven"):
            self.assertFalse(result[key])
        intent, raw, identity = self.originals()
        value = installer._installation_writers_match(intent, raw, identity)
        self.assertEqual(set(value["containers"]), {"api", "ubereats-worker", "web", "db"})
        self.assertEqual(value["containers"], result["docker"]["containers"])
        self.assertEqual(facts["savedWriters"]["sha256"], installer._hash(raw))
        self.assertEqual(self.record_path().stat().st_mode & 0o7777, 0o600)
        self.assertEqual(containers, self.base.combined.docker.containers)
        self.assertEqual(len(installer.PRIVATE_FILES), 4)
        self.assertNotIn("writers.json", installer.PRIVATE_FILES)

    def test_original_locks_and_loaded_gates_precede_all_three_record_writes(self):
        write = installer._installation_record_write
        calls = []
        def checked(root, name, raw, identity):
            self.base.assert_locks_held()
            if name == "writers.json":
                self.assertEqual(len(self.base.reloads), 1)
                self.assertEqual(len(installer._temporary_gate_files()), 3)
            calls.append(name)
            return write(root, name, raw, identity)
        with patch.object(installer, "_installation_record_write", side_effect=checked):
            self.observe()
        self.assertEqual(calls, ["intent.json", "active.json", "writers.json"])

    def test_default_gate_load_does_not_save_a_writer_record(self):
        with patch.object(installer, "_installation_writers_bytes", side_effect=AssertionError("writer record")):
            result = self.base.observe()
        self.assertEqual(result["outcome"], "TEMPORARY_DENY_GATES_LOADED")
        self.assertFalse(self.record_path().exists())

    def test_second_attempt_never_replays_or_overwrites_saved_objects(self):
        self.observe()
        intent, raw, identity = self.originals()
        inode = self.record_path().stat().st_ino
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(self.originals(), (intent, raw, identity))
        self.assertEqual(self.record_path().stat().st_ino, inode)

    def test_partial_saved_record_keeps_pair_gates_and_partial_bytes(self):
        write = installer._installation_record_write
        def failing(root, name, raw, identity):
            if name != "writers.json":
                return write(root, name, raw, identity)
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
            try:
                os.write(fd, raw[:11])
            finally:
                os.close(fd)
            raise OSError("modeled partial writer record")
        with patch.object(installer, "_installation_record_write", side_effect=failing), self.assertRaises(OSError):
            self.observe()
        self.assertEqual(len(self.record_path().read_bytes()), 11)
        self.assertTrue(self.base.marker.exists())
        self.assertEqual(len(installer._temporary_gate_files()), 3)
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_sync_unknown_preserves_full_saved_record_without_claiming_success(self):
        write = installer._installation_record_write
        def failing(root, name, raw, identity):
            if name != "writers.json":
                return write(root, name, raw, identity)
            with patch.object(installer.os, "fsync", side_effect=OSError("modeled sync unknown")):
                return write(root, name, raw, identity)
        with patch.object(installer, "_installation_record_write", side_effect=failing), self.assertRaises(OSError):
            self.observe()
        intent, raw, identity = self.originals()
        self.assertFalse(installer._installation_writers_match(intent, raw, identity)["canExecute"])
        self.assertTrue(self.base.marker.exists())

    def test_host_drift_after_record_durability_blocks_success_and_keeps_original_policy(self):
        write = installer._installation_record_write
        def racing(*args):
            result = write(*args)
            if args[1] == "writers.json":
                self.base.combined.docker.containers[self.base.combined.docker.ids[0]]["HostConfig"]["AutoRemove"] = True
            return result
        with patch.object(installer, "_installation_record_write", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(self.record_path().exists())
        self.assertTrue(self.base.marker.exists())

    def test_intent_or_extra_record_change_after_durability_is_preserved(self):
        write = installer._installation_record_write
        def racing(*args):
            result = write(*args)
            if args[1] == "writers.json":
                self.record_path().with_name("unknown").write_bytes(b"preserve")
            return result
        with patch.object(installer, "_installation_record_write", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(self.record_path().with_name("unknown").read_bytes(), b"preserve")

    def test_original_intent_change_after_writer_record_is_not_accepted(self):
        write = installer._installation_record_write
        def racing(*args):
            result = write(*args)
            if args[1] == "writers.json":
                self.base.intent_path().write_bytes(b"unknown original intent")
            return result
        with patch.object(installer, "_installation_record_write", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(self.base.intent_path().read_bytes(), b"unknown original intent")
        self.assertTrue(self.record_path().exists())

    def test_self_consistent_foreign_record_cannot_bind_this_original_intent(self):
        self.observe()
        intent, raw, identity = self.originals()
        value = json.loads(raw)
        wrong = installer._json({**value, "intentSha256": "f" * 64})
        with self.assertRaises(ReleaseContractError):
            installer._installation_writers_match(intent, wrong, identity)
        with self.assertRaises(ReleaseContractError):
            installer._installation_writers_match(intent, raw, "e" * 64)

    def test_record_fields_versions_time_and_json_are_strict(self):
        self.observe()
        _, raw, identity = self.originals()
        value = json.loads(raw)
        variants = ({"schemaVersion": True}, {"kind": installer.INSTALL_INTENT_KIND}, {"canExecute": True},
                    {"applicationSha": "a" * 7}, {"dockerEngineSha256": "bad"}, {"unknown": 1},
                    {"createdAt": "2026-99-28T00:00:00Z"}, {"createdAt": "2026-10-28T00:00:00+00:00"})
        for change in variants:
            with self.assertRaises(ReleaseContractError):
                installer._installation_writers_value(installer._json({**value, **change}), identity)
        for invalid in (b"{", b"\xff", raw + b" ", raw.replace(b'"schemaVersion":1', b'"schemaVersion":1,"schemaVersion":1'),
                        b"x" * (installer.MAX_INSTALL_RECORD + 1)):
            with self.assertRaises(ReleaseContractError):
                installer._installation_writers_value(invalid, identity)

    def test_saved_roles_full_ids_image_pair_and_lifetime_are_strict(self):
        self.observe()
        _, raw, identity = self.originals()
        value = json.loads(raw)
        for role, change in (("api", {"containerId": "a" * 12}),
                             ("web", {"containerId": value["containers"]["api"]["containerId"]}),
                             ("api", {"imageId": "latest"}),
                             ("api", {"imageId": "sha256:" + "f" * 64}),
                             ("db", {"restartCount": True}), ("db", {"restartCount": -1}),
                             ("web", {"startedAt": "2026-99-28T00:00:00Z"}),
                             ("web", {"configurationSha256": "bad"})):
            changed = copy.deepcopy(value)
            changed["containers"][role].update(change)
            with self.assertRaises(ReleaseContractError):
                installer._installation_writers_value(installer._json(changed), identity)
        for rows in ({}, {**value["containers"], "extra": value["containers"]["api"]}):
            with self.assertRaises(ReleaseContractError):
                installer._installation_writers_value(installer._json({**value, "containers": rows}), identity)

    def test_original_restart_policies_are_exact_and_cannot_be_conflated_with_no_restart(self):
        self.observe()
        _, raw, identity = self.originals()
        value = json.loads(raw)
        for policy in ({"Name": "unknown", "MaximumRetryCount": 0}, {"Name": "always", "MaximumRetryCount": 3},
                       {"Name": "no", "MaximumRetryCount": True}, {"Name": "on-failure", "MaximumRetryCount": -1},
                       {"Name": "unless-stopped"}, {"Name": "no", "MaximumRetryCount": 0, "extra": 1}):
            changed = copy.deepcopy(value)
            changed["containers"]["api"]["restartPolicy"] = policy
            with self.assertRaises(ReleaseContractError):
                installer._installation_writers_value(installer._json(changed), identity)
        changed = copy.deepcopy(value)
        changed["containers"]["api"]["restartPolicy"] = {"Name": "on-failure", "MaximumRetryCount": 7}
        observed = installer._installation_writers_value(installer._json(changed), identity)
        self.assertEqual(observed["containers"]["api"]["restartPolicy"]["MaximumRetryCount"], 7)

    def test_saved_record_permissions_links_and_canonical_readback_are_not_repaired(self):
        self.observe()
        _, raw, identity = self.originals()
        root = os.open(self.record_path().parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            self.record_path().chmod(0o644)
            with self.assertRaises(ReleaseContractError):
                installer._installation_record_read(root, "writers.json", identity)
            self.assertEqual(self.record_path().stat().st_mode & 0o7777, 0o644)
            self.record_path().chmod(0o600)
            saved = self.record_path().with_name("saved")
            self.record_path().rename(saved)
            self.record_path().symlink_to(saved)
            with self.assertRaises(OSError):
                installer._installation_record_read(root, "writers.json", identity)
            self.record_path().unlink()
            os.link(saved, self.record_path())
            with self.assertRaises(ReleaseContractError):
                installer._installation_record_read(root, "writers.json", identity)
        finally:
            os.close(root)
        self.assertEqual(saved.read_bytes(), raw)

    def test_command_builder_targets_only_saved_writer_ids_and_never_database_or_names(self):
        self.observe()
        intent, raw, identity = self.originals()
        value = json.loads(raw)
        for role in installer.INSTALL_WRITER_ROLES:
            identifier = value["containers"][role]["containerId"]
            self.assertEqual(installer._saved_writer_args(intent, raw, identity, role, "disable-restart"),
                             [*installer.DOCKER, "update", "--restart=no", identifier])
            self.assertEqual(installer._saved_writer_args(intent, raw, identity, role, "stop"),
                             [*installer.DOCKER, "stop", "--time", "30", identifier])
        for role, action in (("db", "stop"), ("other", "stop"), ("api", "restart"), ("web", "start")):
            with self.assertRaises(ReleaseContractError):
                installer._saved_writer_args(intent, raw, identity, role, action)

    def test_built_stop_and_update_argv_are_still_rejected_by_all_existing_command_clients(self):
        self.observe()
        intent, raw, identity = self.originals()
        for action in ("disable-restart", "stop"):
            args = installer._saved_writer_args(intent, raw, identity, "api", action)
            for command in (installer._docker_command, installer._observation_command, installer._bounded_host_client):
                with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                    command(args, deadline=installer.time.monotonic() + 5)
                spawn.assert_not_called()

    def test_owned_record_proof_is_required_and_existing_writer_files_are_not_imported_as_permission(self):
        self.observe()
        intent, raw, identity = self.originals()
        namespace = os.open(self.base.namespace, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            with self.assertRaises(ReleaseContractError):
                installer._installation_owned_run(namespace, identity)
            self.assertEqual(installer._installation_owned_run(namespace, identity, saved_writers=raw), intent)
            with self.assertRaises(ReleaseContractError):
                installer._installation_owned_run(namespace, identity, saved_writers=raw + b" ")
        finally:
            os.close(namespace)

    def test_save_switch_requires_full_owned_gate_flow_and_no_public_cli_is_added(self):
        for flags in ({"_save_writers": True}, {"_save_writers": "yes", "_load_deny_gates": True, "_record_intent": True}):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, **flags)
        for command in ("save-installation-writers", "freeze", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
