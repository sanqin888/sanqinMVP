"""Complete read-only observation composition; real disposable files, modeled external services."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_application_binding as binding
import test_installation_migration_source as source
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationCombinedPreflightTests(unittest.TestCase):
    def setUp(self):
        self.base = binding.InstallationApplicationBindingTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials, self.case, self.docker = self.base.materials, self.base.case, self.base.docker
        self.git = source.InstallationMigrationSourceTests()
        self.git.setUp()
        self.git.sha = binding.prerequisites.filesystem.systemd.docker.configuration.APP
        self.git.tree = installer._object(b"combined migration tree model")
        self.git.commit["tree"]["sha"] = self.git.tree
        self.git.objects["sha"] = self.git.tree
        self.git.commit["sha"] = self.git.sha
        self.base.base.database["history"] = copy.deepcopy(self.git.history)
        self.proof = {"sourceSha": self.git.sha,
                      "images": self.docker.snapshot()["currentImageSeal"]["images"], "ciRunId": 1}
        for role, identifier in zip(self.docker.roles, self.docker.ids):
            info = self.docker.containers[identifier]
            ports = {str(p) + "/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(p)}]
                     for p in installer.INSTALL_PORTS[role]}
            info["HostConfig"].update(AutoRemove=False, PublishAllPorts=False, PortBindings=copy.deepcopy(ports))
            info["NetworkSettings"]["Ports"] = copy.deepcopy(ports)
            info["Config"]["Healthcheck"] = {"Test": ["CMD", "model-ready"], "Interval": 10000000000,
                                            "Timeout": 5000000000, "Retries": 6, "StartPeriod": 30000000000}
            self.docker.expanded["services"][role].update(
                ports=[{"target": p, "published": str(p), "host_ip": "127.0.0.1", "protocol": "tcp", "mode": "ingress"}
                       for p in installer.INSTALL_PORTS[role]],
                healthcheck={"test": ["CMD", "model-ready"], "interval": "10s", "timeout": "5s",
                             "retries": 6, "start_period": "30s"})
        self.external = []
        for parts, name, member, owner, mode in installer.EXTERNAL_BACKUP_FILES:
            parent = self.materials.anchor.joinpath(*parts)
            parent.mkdir(parents=True, exist_ok=True)
            path = parent / name
            path.write_bytes((self.docker.config.runtime / member).read_bytes())
            path.chmod(mode)
            if owner == "ubuntu" and self.materials.uid == 0:
                account = self.docker.config.account
                os.chown(path, account.pw_uid, account.pw_gid)
            self.external.append(path)
        self.calls = []
        self.verify = installer.release.verify_exact_candidate

    def fetch(self, path):
        if path in (installer.PREFIX + "/git/commits/" + self.git.sha,
                    installer.PREFIX + "/git/trees/" + self.git.tree + "?recursive=1",
                    installer.PREFIX + "/git/blobs/" + self.git.blob):
            return self.git.fetch(path)
        return self.case.fetch(path)

    def proof_read(self, current, target, fetch):
        if current == target == self.git.sha:
            return copy.deepcopy(self.proof)
        return self.verify(current, target, fetch)

    def runtime_read(self, args):
        self.calls.append(args)
        if args == installer._installation_inventory_args(self.docker.ids[0]):
            return json.dumps(self.git.inventory)
        return self.base.base.observe_command(args)

    def observe(self):
        with patch.object(installer, "_docker_command", side_effect=lambda args, **_: self.base.observe_command(args)), \
             patch.object(installer, "_systemd_command", side_effect=lambda args, **_: self.base.base.manager.observe_command(args)), \
             patch.object(installer, "_runtime_command", side_effect=lambda args, **_: self.runtime_read(args)), \
             patch.object(installer.release, "verify_exact_candidate", side_effect=self.proof_read):
            return installer._observe_installed_external_backup(self.materials.identity, fetch=self.fetch)

    def test_all_stages_compose_without_writes_but_do_not_grant_installation(self):
        with patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")):
            result = self.observe()
        for key in ("externalBackupExecutablesObserved", "effectiveContainerConfigurationObserved",
                    "databaseMigrationParityProven", "applicationReleaseAuthenticated"):
            self.assertTrue(result[key])
        for key in ("hostPreflightComplete", "installedBaselineObserved", "applicationConfigurationObserved",
                    "readyToInstall", "canExecute", "authorizedToMutateProduction", "operationSuccessProven"):
            self.assertFalse(result[key])
        self.assertFalse(result["applicationBinding"]["databaseLoginVerified"])
        self.assertFalse(result["externalBackup"]["backupExecutionVerified"])
        self.assertEqual(sum(args == installer._installation_inventory_args(self.docker.ids[0]) for args in self.calls), 4)
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_original_locks_cover_actual_migration_command_wiring(self):
        read = self.runtime_read
        def check(args):
            for acquire in (binding.prerequisites.filesystem.systemd.docker.configuration.baseline.private.jobs._locked_directory,
                            binding.prerequisites.filesystem.systemd.docker.configuration.baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            return read(args)
        with patch.object(self, "runtime_read", side_effect=check):
            self.observe()

    def test_external_replacement_after_first_complete_pass_blocks(self):
        snapshot = installer._external_backup_snapshot
        done = []
        def racing(runtime):
            result = snapshot(runtime)
            if not done:
                done.append(True)
                path = self.external[0]
                raw = path.read_bytes()
                path.unlink()
                path.write_bytes(raw)
                path.chmod(0o750)
                if self.materials.uid == 0:
                    os.chown(path, self.docker.config.account.pw_uid, self.docker.config.account.pw_gid)
            return result
        with patch.object(installer, "_external_backup_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_port_drift_after_first_complete_pass_blocks(self):
        snapshot = installer._external_backup_snapshot
        def racing(runtime):
            result = snapshot(runtime)
            self.docker.containers[self.docker.ids[0]]["HostConfig"]["AutoRemove"] = True
            return result
        with patch.object(installer, "_external_backup_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_database_history_change_during_composed_migration_reads_blocks(self):
        read = self.runtime_read
        def racing(args):
            result = read(args)
            if args == installer._installation_inventory_args(self.docker.ids[0]):
                self.base.base.database["history"] = []
            return result
        with patch.object(self, "runtime_read", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_late_maintenance_is_preserved_after_all_stages(self):
        snapshot = installer._external_backup_snapshot
        marker = self.materials.state / "maintenance/active.json"
        def racing(runtime):
            result = snapshot(runtime)
            marker.write_bytes(b"preserve late incident")
            return result
        with patch.object(installer, "_external_backup_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"preserve late incident")

    def test_final_source_revalidation_failure_blocks_without_side_effects(self):
        snapshot = installer._external_backup_snapshot
        def racing(runtime):
            result = snapshot(runtime)
            self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
            return result
        with patch.object(installer, "_external_backup_snapshot", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_strict_external_switch_cannot_skip_prior_stages(self):
        with self.assertRaises(ReleaseContractError):
            installer._observe_installed_runtime(self.materials.identity, fetch=self.fetch,
                include_configuration=True, include_docker=True, include_systemd=True, include_filesystem=True,
                include_prerequisites=True, include_application_binding=True, include_migrations=True,
                include_effective_configuration=True, include_external_backup="yes")


if __name__ == "__main__":
    unittest.main()
