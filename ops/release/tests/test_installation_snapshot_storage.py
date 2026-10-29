"""Pre-stop target/storage observations: disposable paths, modeled kernel/AWS/commands."""
import base64
import copy
import hashlib
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_combined_preflight as combined
import test_private_install_materials as private
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationSnapshotStorageTests(unittest.TestCase):
    def setUp(self):
        self.base = combined.InstallationCombinedPreflightTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.root = self.base.materials.anchor
        self.blob = b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20" + b"k" * 32
        self.key = self.root / "etc/ssh/ssh_host_ed25519_key.pub"
        self.key.parent.mkdir(parents=True, exist_ok=True)
        self.key.write_bytes(b"ssh-ed25519 " + base64.b64encode(self.blob) + b" model-host\n")
        self.key.chmod(0o644)
        for path in installer.INSTALL_STORAGE_DIRECTORIES:
            self.root.joinpath(path.lstrip("/")).mkdir(parents=True, exist_ok=True)
        for name in installer.INSTALL_DB_CONFIG:
            config = self.root / installer.INSTALL_DB_DATA.lstrip("/") / name
            config.write_bytes(b"# modeled configuration; contents are not consumed\n")
            config.chmod(0o600)
        info = self.root.stat()
        self.device = str(os.major(info.st_dev)) + ":" + str(os.minor(info.st_dev))
        self.mounts = ("11 1 " + self.device + " / / rw,relatime - ext4 /dev/nvme0n1p1 rw\n"
                       "12 11 0:55 / /proc rw - proc proc rw\n").encode()
        self.blocks = {"blockdevices": [
            {"name": "/dev/nvme0n1", "type": "disk", "maj:min": "240:0", "pkname": None, "size": 80 * 1024**3},
            {"name": "/dev/nvme0n1p1", "type": "part", "maj:min": self.device,
             "pkname": "/dev/nvme0n1", "size": 79 * 1024**3}]}
        self.arn = "arn:aws:lightsail:ca-central-1:123456789012:Instance/12345678-1234-1234-1234-123456789012"
        self.target = {"schemaVersion": 1, "kind": "sanq-minimal-pre-snapshot-target",
            "accountId": "123456789012", "region": "ca-central-1", "instanceArn": self.arn,
            "instanceName": "sanq-production", "sshTarget": "ubuntu@sanq-production",
            "sshHostKeySha256": "SHA256:" + base64.b64encode(hashlib.sha256(self.blob).digest()).decode().rstrip("="),
            "linuxSystemDisk": "/dev/nvme0n1", "operatorConfirmed": True,
            "instance": {"arn": self.arn, "name": "sanq-production", "resourceType": "Instance",
                "location": {"regionName": "ca-central-1", "availabilityZone": "ca-central-1a"},
                "hardware": {"disks": [{"isSystemDisk": True, "isAttached": True, "path": "/dev/xvda", "sizeInGb": 80}]}}}
        self.prerequisites = {"databaseIdentity": copy.deepcopy(self.base.base.base.database)}
        self.database = {key: self.prerequisites["databaseIdentity"][key] for key in (
            "database", "port", "dataDirectory", "transactionReadOnly", "inRecovery")}
        self.database.update({"configFile": "/var/lib/postgresql/data/postgresql.conf",
            "hbaFile": "/var/lib/postgresql/data/pg_hba.conf", "identFile": "/var/lib/postgresql/data/pg_ident.conf"})
        self.database["tablespaces"] = [{"oid": "1663", "name": "pg_default", "location": ""},
                                       {"oid": "1664", "name": "pg_global", "location": ""}]
        self.calls = []
        self.read_mountinfo = installer._snapshot_mountinfo
        self.base.materials.stack.enter_context(patch.object(installer, "_snapshot_mountinfo",
            side_effect=lambda **_: self.mounts))

    def raw(self):
        return installer._json(self.target)

    def run(self, args):
        self.assertTrue(installer._runtime_observation_allowed(args))
        self.calls.append(args)
        if tuple(args) == installer.INSTALL_BLOCK_ARGS:
            return json.dumps(self.blocks)
        self.assertEqual(args, installer._installation_storage_args(self.base.docker.ids[3]))
        return json.dumps(self.database)

    def snapshot(self):
        return installer._installation_storage_snapshot(installer._installation_snapshot_target(self.raw()),
            self.base.docker.snapshot(), self.prerequisites, self.run, deadline=installer.time.monotonic() + 60)

    def observe(self):
        original = self.base.runtime_read
        def runtime(args):
            if tuple(args) == installer.INSTALL_BLOCK_ARGS or args == installer._installation_storage_args(self.base.docker.ids[3]):
                return self.run(args)
            return original(args)
        with patch.object(installer, "_observe_installed_external_backup",
                side_effect=lambda identity, **kwargs: installer._observe_installed_snapshot_storage(
                    identity, self.raw(), **kwargs)), patch.object(self.base, "runtime_read", side_effect=runtime):
            return self.base.observe()

    def assert_locks_held(self):
        for acquire in (private.jobs._locked_directory, private.plans.preparation_lock):
            with self.assertRaises(ReleaseContractError):
                with acquire():
                    pass

    def test_complete_locked_readonly_observation_binds_operator_target_and_all_fixed_paths(self):
        original = installer._installation_storage_snapshot
        checked = []
        def locked(*args, **kwargs):
            self.assert_locks_held()
            checked.append(True)
            return original(*args, **kwargs)
        before = copy.deepcopy(self.base.docker.containers)
        with patch.object(installer, "_installation_storage_snapshot", side_effect=locked), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("unmodeled process")):
            result = self.observe()
        self.assertEqual(len(checked), 2)
        self.assertEqual(result["outcome"], "PRE_SNAPSHOT_STORAGE_OBSERVED")
        facts = result["snapshotStorage"]
        self.assertEqual(set(facts["directories"]), set(installer.INSTALL_STORAGE_DIRECTORIES))
        self.assertEqual(facts["target"]["instanceArn"], self.arn)
        self.assertEqual(facts["target"]["targetInputSha256"], installer._hash(self.raw()))
        self.assertEqual(facts["target"]["cloudSystemDiskPath"], "/dev/xvda")
        self.assertEqual(facts["blockStorage"]["disk"]["name"], "/dev/nvme0n1")
        self.assertTrue(facts["localSystemDiskCoverageObserved"])
        self.assertTrue(facts["requiresIntentBinding"])
        for key in ("awsOriginAuthenticated", "snapshotAvailable", "recoveryReady", "canExecute", "restoreProven"):
            self.assertFalse(facts[key])
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(before, self.base.docker.containers)
        self.assertFalse((self.base.materials.state / "installation-runs").exists())
        self.assertFalse(list((self.base.materials.state / "maintenance").iterdir()))
        self.assertNotIn(base64.b64encode(self.blob).decode(), json.dumps(result))

    def test_target_requires_canonical_bounded_json_no_permissions_and_explicit_operator_confirmation(self):
        original = copy.deepcopy(self.target)
        variants = [{"operatorConfirmed": False}, {"operatorConfirmed": 1}, {"schemaVersion": True},
                    {"canExecute": True}, {"instanceArn": self.arn.replace("123456789012:Instance", "999999999999:Instance")},
                    {"region": "us-east-1"}, {"instanceName": "other"}, {"sshTarget": "host; touch /tmp/bad"},
                    {"sshHostKeySha256": "wrong"}, {"linuxSystemDisk": "/dev/../tmp/disk"}]
        for change in variants:
            self.target = {**original, **change}
            with self.subTest(change=change), self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_target(self.raw())
        self.target = original
        raw = self.raw()
        for bad in (b"", b"x" * 65537, raw + b" ", b"\xff", b'{"value":NaN}\n',
                    raw.replace(b'{"accountId":', b'{"schemaVersion":1,"accountId":', 1)):
            with self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_target(bad)

    def test_source_instance_same_name_wrong_arn_region_or_zone_does_not_bind(self):
        for change in ({"arn": self.arn.replace("12345678-", "87654321-", 1)},
                       {"resourceType": "InstanceSnapshot"}, {"name": "other"},
                       {"location": {"regionName": "us-east-1", "availabilityZone": "ca-central-1a"}},
                       {"location": {"regionName": "ca-central-1", "availabilityZone": "all"}}):
            with patch.dict(self.target["instance"], change), self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_target(self.raw())

    def test_cloud_disk_missing_null_extra_not_system_or_unattached_is_rejected(self):
        hardware = self.target["instance"]["hardware"]
        disk = copy.deepcopy(hardware["disks"][0])
        for disks in (None, [], [disk, disk], [{"isSystemDisk": True}],
                      [{**disk, "isSystemDisk": 1}], [{**disk, "isAttached": False}],
                      [{**disk, "sizeInGb": True}]):
            with patch.dict(hardware, {"disks": disks}), self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_target(self.raw())
        with patch.dict(hardware, {}, clear=True), self.assertRaises(ReleaseContractError):
            installer._installation_snapshot_target(self.raw())

    def test_optional_disk_facts_cannot_contradict_the_bound_instance(self):
        disk = self.target["instance"]["hardware"]["disks"][0]
        for change in ({"attachedTo": "another-instance"}, {"resourceType": "DiskSnapshot"},
                       {"location": {"regionName": "us-east-1", "availabilityZone": "us-east-1a"}}):
            with patch.dict(disk, change), self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_target(self.raw())

    def test_mount_reader_uses_only_fixed_proc_input_and_enforces_byte_and_time_limits(self):
        path = self.root / "mountinfo-model"
        path.write_bytes(self.mounts)
        path.chmod(0o644)
        open_file = installer.os.open
        def opened(name, flags, *args, **kwargs):
            self.assertEqual(name, "/proc/self/mountinfo")
            self.assertTrue(flags & os.O_NOFOLLOW)
            self.assertTrue(flags & os.O_NONBLOCK)
            return open_file(path, flags)
        with patch.object(installer.os, "open", side_effect=opened):
            self.assertEqual(self.read_mountinfo(deadline=installer.time.monotonic() + 60), self.mounts)
            with self.assertRaises(ReleaseContractError):
                self.read_mountinfo(deadline=installer.time.monotonic() - 1)
            path.write_bytes(b"x" * (installer.MAX_HOST_OUTPUT + 1))
            with self.assertRaises(ReleaseContractError):
                self.read_mountinfo(deadline=installer.time.monotonic() + 60)

    def test_wrong_host_key_fails_without_creating_intent_or_gate(self):
        self.target["sshHostKeySha256"] = "SHA256:" + "A" * 43
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse((self.base.materials.state / "installation-runs").exists())
        self.assertFalse(list((self.base.materials.state / "maintenance").iterdir()))

    def test_public_host_key_symlink_hardlink_fifo_or_writable_file_is_not_read(self):
        saved = self.key.with_name("saved.pub")
        self.key.rename(saved)
        self.key.symlink_to(saved)
        with self.assertRaises(OSError):
            self.snapshot()
        self.key.unlink()
        os.link(saved, self.key)
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.key.unlink()
        os.mkfifo(self.key)
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.key.unlink()
        self.key.write_bytes(saved.read_bytes())
        self.key.chmod(0o666)
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_wal_and_parent_directory_links_are_rejected_even_if_they_point_to_same_disk(self):
        for path in (*(installer.INSTALL_DB_DATA + "/" + name for name in installer.INSTALL_DB_DIRECTORIES),
                     "/srv/sanq/uploads"):
            directory = self.root / path.lstrip("/")
            saved = directory.with_name(directory.name + "-original")
            directory.rename(saved)
            directory.symlink_to(saved, target_is_directory=True)
            with self.subTest(path=path), self.assertRaises(OSError):
                self.snapshot()
            directory.unlink()
            saved.rename(directory)

    def test_database_configuration_must_be_in_pgdata_regular_and_not_redirected(self):
        for name in installer.INSTALL_DB_CONFIG:
            path = self.root / installer.INSTALL_DB_DATA.lstrip("/") / name
            saved = path.with_name(name + "-saved")
            path.rename(saved)
            path.symlink_to(saved)
            with self.subTest(name=name), self.assertRaises(OSError):
                self.snapshot()
            path.unlink()
            saved.rename(path)
        for field in ("configFile", "hbaFile", "identFile"):
            with patch.dict(self.database, {field: "/outside/config"}), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_registered_and_unregistered_custom_tablespaces_are_blocked(self):
        self.database["tablespaces"].append({"oid": "20000", "name": "custom", "location": "/extra"})
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.database["tablespaces"].pop()
        (self.root / installer.INSTALL_DB_DATA.lstrip("/") / "pg_tblspc" / "20000").symlink_to("/extra")
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_database_wrong_identity_readonly_type_or_extra_fields_is_rejected(self):
        for change in ({"database": "other"}, {"dataDirectory": "/extra"}, {"port": "5433"},
                       {"transactionReadOnly": "off"}, {"inRecovery": 0}, {"unknown": True}):
            with patch.dict(self.database, change), self.assertRaises(ReleaseContractError):
                self.snapshot()

    def test_separate_bind_or_nested_mounts_block_even_with_same_device_number(self):
        for point, device in (("/srv", self.device), ("/srv/sanq/uploads", self.device),
                              (installer.INSTALL_DB_DATA + "/pg_wal", "240:1"),
                              (installer.INSTALL_DB_DATA + "/base/nested", self.device)):
            saved = self.mounts
            self.mounts += ("13 11 " + device + " / " + point + " rw - ext4 /dev/extra rw\n").encode()
            with self.subTest(point=point), self.assertRaises(ReleaseContractError):
                self.snapshot()
            self.mounts = saved

    def test_overlay_or_readonly_root_and_device_number_mismatch_block(self):
        original = self.mounts
        for raw in (original.replace(b" - ext4 ", b" - overlay ", 1),
                    original.replace(b"rw,relatime", b"ro,relatime", 1),
                    original.replace(("11 1 " + self.device).encode(), b"11 1 999:999", 1)):
            self.mounts = raw
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.mounts = original

    def test_block_inventory_requires_one_plain_bound_disk_and_matching_root_partition(self):
        original = copy.deepcopy(self.blocks)
        variants = [
            original["blockdevices"] + [{"name": "/dev/nvme1n1", "type": "disk", "maj:min": "240:1", "pkname": None, "size": 1}],
            [original["blockdevices"][0], {**original["blockdevices"][1], "pkname": "/dev/other"}],
            [original["blockdevices"][0], {**original["blockdevices"][1], "type": "crypt"}],
            [original["blockdevices"][0], {**original["blockdevices"][1], "size": True}],
            original["blockdevices"] * 2]
        for rows in variants:
            self.blocks = {"blockdevices": rows}
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.blocks = original
        self.target["linuxSystemDisk"] = "/dev/other"
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_block_or_database_change_within_collection_is_detected(self):
        run = self.run
        count = [0]
        def changing(args):
            count[0] += tuple(args) == installer.INSTALL_BLOCK_ARGS
            if count[0] == 2:
                self.blocks["blockdevices"][0]["size"] += 1
            return run(args)
        with patch.object(self, "run", side_effect=changing), self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_host_key_change_between_complete_observation_passes_blocks(self):
        original = installer._installation_storage_snapshot
        seen = []
        def changed(*args, **kwargs):
            result = original(*args, **kwargs)
            if not seen:
                seen.append(True)
                self.key.write_bytes(self.key.read_bytes().replace(b"model-host", b"changed-host"))
            return result
        with patch.object(installer, "_installation_storage_snapshot", side_effect=changed), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_mount_parser_rejects_malformed_duplicate_and_oversized_inventory(self):
        for raw in (b"", b"x" * (installer.MAX_HOST_OUTPUT + 1), b"\xff",
                    self.mounts + self.mounts.splitlines(keepends=True)[0],
                    b"1 0 8:1 / / rw ext4 /dev/root rw\n", b"1 0 8:1 / /bad\\999 rw - ext4 /dev/root rw\n"):
            with self.assertRaises(ReleaseContractError):
                installer._snapshot_mounts(raw)

    def test_unknown_optional_mount_fields_are_ignored_and_escapes_are_decoded(self):
        value = installer._snapshot_mounts(b"1 0 8:1 / / rw shared:1 future:ok - ext4 /dev/root rw\n"
            b"2 1 0:2 / /unrelated\\040path rw - tmpfs tmpfs rw\n")
        self.assertEqual(value["2"]["mountpoint"], "/unrelated path")
        self.assertEqual(value["1"]["filesystem"], "ext4")

    def test_new_commands_are_exact_readonly_fixed_database_and_never_accept_paths_or_sql(self):
        args = installer._installation_storage_args(self.base.docker.ids[3])
        self.assertTrue(installer._runtime_observation_allowed(list(installer.INSTALL_BLOCK_ARGS)))
        self.assertTrue(installer._runtime_observation_allowed(args))
        self.assertIn("BEGIN READ ONLY;", args[-1])
        self.assertIn("LIMIT 1025", args[-1])
        self.assertIn("pg_catalog.pg_tablespace_location", args[-1])
        for bad in ([*installer.INSTALL_BLOCK_ARGS, "/dev/other"], [*args[:-1], "DROP TABLE anything"],
                    [*args[:-2], "other", args[-1]]):
            self.assertFalse(installer._runtime_observation_allowed(bad))

    def test_invalid_target_or_mixed_mutation_switches_fail_before_any_host_observation(self):
        with patch.object(installer, "_installed_runtime_snapshot", side_effect=AssertionError("host read")):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_snapshot_storage(self.base.materials.identity, b"{}",
                                                               fetch=self.base.fetch)
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.base.materials.identity, include_external_backup=True,
                    _record_intent=True, _snapshot_target=self.raw())

    def test_old_observer_never_reads_new_target_storage_or_host_key(self):
        with patch.object(installer, "_installation_storage_snapshot", side_effect=AssertionError("new observation")):
            result = self.base.observe()
        self.assertNotIn("snapshotStorage", result)

    def test_no_public_storage_install_or_resume_cli(self):
        for command in ("snapshot-storage", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
