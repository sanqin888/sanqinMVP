"""Effective ports/healthcheck/container retention: offline Docker models."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_docker as docker
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationEffectiveConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.base = docker.InstallationDockerTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        for role, identifier in zip(self.base.roles, self.base.ids):
            info = self.base.containers[identifier]
            ports = {str(port) + "/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}]
                     for port in installer.INSTALL_PORTS[role]}
            info["HostConfig"].update(AutoRemove=False, PublishAllPorts=False, PortBindings=copy.deepcopy(ports))
            info["NetworkSettings"] = {"Ports": copy.deepcopy(ports)}
            info["Config"]["Healthcheck"] = {"Test": ["CMD", "model-ready"], "Interval": 10000000000,
                                            "Timeout": 5000000000, "Retries": 6, "StartPeriod": 30000000000}
            self.base.expanded["services"][role].update(
                ports=[{"target": p, "published": str(p), "host_ip": "127.0.0.1", "protocol": "tcp", "mode": "ingress"}
                       for p in installer.INSTALL_PORTS[role]],
                healthcheck={"test": ["CMD", "model-ready"], "interval": "10s", "timeout": "5s",
                             "retries": 6, "start_period": "30s"})
        self.api = self.base.containers[self.base.ids[0]]

    def observe(self):
        return installer._effective_configuration_snapshot(self.base.snapshot(), self.base.observe_command)

    def test_valid_configuration_returns_only_stable_hashes_without_mutating_models(self):
        before = copy.deepcopy((self.base.containers, self.base.expanded))
        result = self.observe()
        self.assertEqual(set(result), set(self.base.roles))
        self.assertFalse(result["api"]["autoRemove"])
        self.assertNotIn("model-ready", str(result))
        self.assertEqual(before, (self.base.containers, self.base.expanded))

    def test_auto_remove_automatic_publication_or_privilege_blocks(self):
        for key in ("AutoRemove", "PublishAllPorts", "Privileged"):
            with patch.dict(self.api["HostConfig"], {key: True}), self.assertRaises(ReleaseContractError):
                self.observe()

    def test_wrong_public_missing_extra_or_inconsistent_actual_ports_block(self):
        original = copy.deepcopy(self.api["HostConfig"]["PortBindings"])
        for mapping in ({}, {**original, "9999/tcp": [{"HostIp": "127.0.0.1", "HostPort": "9999"}]},
                        {**original, "4000/tcp": [{"HostIp": "0.0.0.0", "HostPort": "4000"}]}):
            with patch.dict(self.api["HostConfig"], {"PortBindings": mapping}), self.assertRaises(ReleaseContractError):
                self.observe()
        self.api["NetworkSettings"]["Ports"]["4000/tcp"] = None
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_compose_port_alias_protocol_or_duplicate_ports_block(self):
        service = self.base.expanded["services"]["api"]
        original = copy.deepcopy(service["ports"])
        for changes in ({"host_ip": "0.0.0.0"}, {"published": "4999"}, {"protocol": "udp"}, {"target": True}):
            service["ports"] = [{**original[0], **changes}, original[1]]
            with self.assertRaises(ReleaseContractError):
                self.observe()
        service["ports"] = [original[0], original[0]]
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_health_command_timing_retry_type_and_disable_drift_block(self):
        original = copy.deepcopy(self.api["Config"]["Healthcheck"])
        for changes in ({"Test": ["CMD", "true"]}, {"Test": []}, {"Interval": 1}, {"Retries": True}):
            self.api["Config"]["Healthcheck"] = {**original, **changes}
            with self.assertRaises(ReleaseContractError):
                self.observe()
        self.api["Config"]["Healthcheck"] = original
        self.base.expanded["services"]["api"]["healthcheck"]["disable"] = True
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_health_dollars_decode_once_and_unpublished_image_ports_are_allowed(self):
        self.base.expanded["services"]["api"]["healthcheck"]["test"] = ["CMD-SHELL", "check $$VALUE"]
        self.api["Config"]["Healthcheck"]["Test"] = ["CMD-SHELL", "check $VALUE"]
        self.api["NetworkSettings"]["Ports"]["9999/tcp"] = None
        self.observe()
        self.api["Config"]["Healthcheck"]["Test"] = ["CMD-SHELL", "check $$VALUE"]
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_saved_container_identity_and_configuration_are_rechecked(self):
        saved = self.base.snapshot()
        self.api["Config"]["Healthcheck"]["Retries"] = 5
        with self.assertRaises(ReleaseContractError):
            installer._effective_configuration_snapshot(saved, self.base.observe_command)
        for duration in ("1.5s", "-1s", "5", None):
            with self.assertRaises(ReleaseContractError):
                installer._health_duration(duration)
        self.assertEqual(installer._health_duration("500ms"), 500000000)

    def test_old_api_default_is_unchanged_and_new_stage_requires_migrations(self):
        with patch.object(installer, "_effective_configuration_snapshot", side_effect=AssertionError("called")):
            self.base.observe()
        with self.assertRaises(ReleaseContractError):
            installer._observe_installed_runtime(self.base.materials.identity, fetch=self.base.case.fetch,
                include_effective_configuration=True)
        with patch("sys.stderr"), self.assertRaises(SystemExit):
            installer.main(["observe-effective-configuration"])


if __name__ == "__main__":
    unittest.main()
