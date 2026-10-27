"""Migration stage inside original host locks; stage protocol models only."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_application_binding as binding
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationLockedMigrationTests(unittest.TestCase):
    def setUp(self):
        self.base = binding.InstallationApplicationBindingTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials, self.case = self.base.materials, self.base.case
        self.calls = []
        self.result = {"databaseMigrationParityProven": True, "applicationReleaseAuthenticated": True,
                       "inventorySha256": "a" * 64, "canExecute": False, "requiresHostRecheck": True}

    def stage(self, sha, docker, prerequisites, run, *, fetch):
        self.calls.append(sha)
        self.assertEqual(sha, binding.prerequisites.filesystem.systemd.docker.configuration.APP)
        self.assertEqual(docker["containers"]["api"]["containerId"], self.base.docker.ids[0])
        self.assertEqual(prerequisites["databaseContainerId"], self.base.docker.ids[3])
        return copy.deepcopy(self.result)

    def observe(self):
        with patch.object(installer, "_docker_command", side_effect=lambda args, **_: self.base.observe_command(args)), \
             patch.object(installer, "_systemd_command",
                          side_effect=lambda args, **_: self.base.base.manager.observe_command(args)), \
             patch.object(installer, "_runtime_command",
                          side_effect=lambda args, **_: self.base.base.observe_command(args)), \
             patch.object(installer, "_installation_migration_snapshot", side_effect=self.stage):
            return installer._observe_installed_migrations(self.materials.identity, fetch=self.case.fetch)

    def test_combined_stage_is_run_twice_and_does_not_grant_installation(self):
        result = self.observe()
        self.assertEqual(len(self.calls), 2)
        self.assertTrue(result["databaseMigrationParityProven"])
        self.assertTrue(result["applicationReleaseAuthenticated"])
        for key in ("hostPreflightComplete", "installedBaselineObserved", "readyToInstall", "canExecute",
                    "authorizedToMutateProduction", "operationSuccessProven", "applicationConfigurationObserved"):
            self.assertFalse(result[key])

    def test_original_two_locks_are_held_through_each_migration_stage(self):
        stage = self.stage
        def check(*args, **kwargs):
            for acquire in (binding.prerequisites.filesystem.systemd.docker.configuration.baseline.private.jobs._locked_directory,
                            binding.prerequisites.filesystem.systemd.docker.configuration.baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            return stage(*args, **kwargs)
        with patch.object(self, "stage", side_effect=check):
            self.observe()

    def test_stage_drift_between_global_passes_blocks(self):
        stage = self.stage
        def racing(*args, **kwargs):
            value = stage(*args, **kwargs)
            self.result["inventorySha256"] = "b" * 64
            return value
        with patch.object(self, "stage", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_late_maintenance_marker_is_preserved(self):
        stage = self.stage
        marker = self.materials.state / "maintenance/active.json"
        def racing(*args, **kwargs):
            value = stage(*args, **kwargs)
            marker.write_bytes(b"late incident")
            return value
        with patch.object(self, "stage", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"late incident")

    def test_migration_failure_never_returns_partial_success(self):
        with patch.object(self, "stage", side_effect=ReleaseContractError("modeled source failure")), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_previous_binding_api_does_not_invoke_migration_stage(self):
        with patch.object(installer, "_installation_migration_snapshot", side_effect=AssertionError("called")):
            self.base.observe()

    def test_migrations_require_all_previous_stages_and_strict_boolean(self):
        for enabled, migrations in ((False, True), (True, "yes")):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch,
                    include_configuration=True, include_docker=True, include_systemd=True, include_filesystem=True,
                    include_prerequisites=True, include_application_binding=enabled, include_migrations=migrations)

    def test_no_new_public_install_or_observation_cli(self):
        for command in ("observe-migrations", "install"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
