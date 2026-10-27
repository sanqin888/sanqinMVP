"""Initial-install application environment and database-route binding models."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_prerequisites as prerequisites
import install_minimal_executor as installer
from release_contract import ReleaseContractError

DB_CREDENTIAL_KEY = "POSTGRES_PASSWORD"


class InstallationApplicationBindingTests(unittest.TestCase):
    def setUp(self):
        self.base = prerequisites.InstallationPrerequisiteTests(
            "test_full_observation_reports_prerequisites_without_history_payload_or_install_authority")
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials, self.case, self.docker = self.base.materials, self.base.case, self.base.docker
        self.user, self.credential = "sanq_model", "model$p=word"
        self.url = "postgresql://" + self.user + ":" + self.credential + "@db:5432/sanqin_db"
        self.network = {"Name": installer.NETWORK_NAME, "Id": "9" * 64, "Driver": "bridge", "Scope": "local",
            "Internal": False, "EnableIPv6": False, "Ingress": False, "Options": {},
            "Labels": {"com.docker.compose.project": "sanq-app", "com.docker.compose.network": "default"},
            "IPAM": {"Driver": "default", "Options": None,
                     "Config": [{"Subnet": "172.23.0.0/16", "Gateway": "172.23.0.1"}]}, "Containers": {}}
        for role, identifier in zip(self.docker.roles, self.docker.ids):
            info = self.docker.containers[identifier]
            image = self.docker.images[info["Image"]]
            image["Config"]["Env"] = ["PATH=/usr/local/bin:/usr/bin:/bin", "PRIVATE_VALUE=never_echo_$secret"]
            if role == "db":
                image["Config"]["Env"].append("PGDATA=/var/lib/postgresql/data")
            values = ({"POSTGRES_USER": self.user, DB_CREDENTIAL_KEY: self.credential, "POSTGRES_DB": "sanqin_db"}
                      if role == "db" else {"API_UPSTREAM": "http://api:4000"}
                      if role == "web" else {"DATABASE_URL": self.url, "NODE_ENV": "production",
                      "LITERAL_VALUE": "price=$5 next=$$token and $" + "{TOKEN}"})
            self.set_environment(role, values)
            index = self.docker.roles.index(role)
            endpoint_id = str(index + 5) * 64
            address = "172.23.0." + str(index + 2)
            info["HostConfig"]["NetworkMode"] = installer.NETWORK_NAME
            info["NetworkSettings"] = {"Networks": {installer.NETWORK_NAME: {
                "NetworkID": self.network["Id"], "EndpointID": endpoint_id, "IPAddress": address,
                "IPPrefixLen": 16, "Gateway": "172.23.0.1", "GlobalIPv6Address": "",
                "Aliases": [role, "sanq-app-" + role + "-1"]}}}
            self.network["Containers"][identifier] = {"EndpointID": endpoint_id,
                "IPv4Address": address + "/16", "IPv6Address": "", "Name": "sanq-app-" + role + "-1"}
        self.calls = []

    def info(self, role):
        return self.docker.containers[self.docker.ids[self.docker.roles.index(role)]]

    def set_environment(self, role, values):
        self.docker.expanded["services"][role]["environment"] = {
            key: value.replace("$", "$$") for key, value in values.items()}
        info = self.info(role)
        image = self.docker.images[info["Image"]]
        defaults = dict(item.split("=", 1) for item in image["Config"]["Env"])
        defaults.update(values)
        info["Config"]["Env"] = [key + "=" + value for key, value in defaults.items()]

    def observe_command(self, args):
        self.assertTrue(installer._docker_allowed(args))
        self.calls.append(args)
        if tuple(args) == installer.NETWORK_INSPECT:
            return json.dumps(self.network)
        return self.docker.observe_command(args)

    def snapshot(self):
        return installer._application_binding_snapshot(self.docker.snapshot(), self.observe_command)

    def observe(self):
        with patch.object(installer, "_docker_command", side_effect=lambda args, **_: self.observe_command(args)), \
             patch.object(installer, "_systemd_command",
                          side_effect=lambda args, **_: self.base.manager.observe_command(args)), \
             patch.object(installer, "_runtime_command", side_effect=lambda args, **_: self.base.observe_command(args)):
            return installer._observe_installed_application_binding(self.materials.identity, fetch=self.case.fetch)

    def test_combined_observation_compares_all_environments_without_secret_output_or_install_permission(self):
        before = self.docker.config.base.image()
        with patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")):
            result = self.observe()
        self.assertEqual(before, self.docker.config.base.image())
        self.assertTrue(result["containerEnvironmentObserved"])
        self.assertTrue(result["databaseConnectionTargetObserved"])
        for key in ("hostPreflightComplete", "installedBaselineObserved", "readyToInstall", "canExecute",
                    "authorizedToMutateProduction", "applicationConfigurationObserved", "operationSuccessProven"):
            self.assertFalse(result[key])
        facts = result["applicationBinding"]
        for key in ("databaseLoginVerified", "databaseMigrationParityProven", "fullApplicationConfigurationProven"):
            self.assertFalse(facts[key])
        self.assertEqual(facts["databaseContainerId"], self.docker.ids[3])
        self.assertEqual(set(facts["environmentSha256"]), set(self.docker.roles))
        for secret in (self.user, self.credential, self.url, "never_echo", "price=$5"):
            self.assertNotIn(secret, json.dumps(result))
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_dollar_decode_is_exactly_once_and_does_not_modify_compose_actual_or_image_values(self):
        before = copy.deepcopy((self.docker.expanded, self.docker.containers, self.docker.images))
        self.snapshot()
        self.assertEqual(before, (self.docker.expanded, self.docker.containers, self.docker.images))
        for actual, exported in (("$x", "$$x"), ("$$x", "$$$$x"), ("$", "$$"), ("$$$$", "$$$$$$$$"),
                                 ("a=b", "a=b"), ("line1\nline2", "line1\nline2")):
            self.assertEqual(installer._compose_environment({"VALUE": exported}), {"VALUE": actual})
        self.assertEqual(installer._container_environment(["VALUE=$$literal"]), {"VALUE": "$$literal"})

    def test_unpaired_export_dollars_null_values_and_nonmapping_compose_environment_block(self):
        for values in ({"VALUE": "$x"}, {"VALUE": "$$$x"}, {"VALUE": None}, {"VALUE": True},
                       {"VALUE": 1}, {"bad-key": "value"}, ["VALUE=one"]):
            with self.assertRaises(ReleaseContractError):
                installer._compose_environment(values)

    def test_actual_and_image_environment_reject_duplicate_missing_assignment_nul_or_excess_inventory(self):
        for values in (None, "VALUE=one", ["VALUE=one", "VALUE=two"], ["VALUE"], ["bad-key=one"],
                       ["VALUE=one\0two"], [False], ["VALUE=one"] * 4097):
            with self.assertRaises(ReleaseContractError):
                installer._container_environment(values)
        self.assertEqual(installer._container_environment(["VALUE=a=b", "EMPTY="]), {"VALUE": "a=b", "EMPTY": ""})

    def test_missing_extra_or_changed_actual_environment_blocks_for_every_role(self):
        for role in self.docker.roles:
            saved = self.info(role)["Config"]["Env"]
            for values in (saved[:-1], saved + ["UNREVIEWED=value"], ["PATH=changed"] + saved[1:]):
                self.info(role)["Config"]["Env"] = values
                with self.subTest(role=role), self.assertRaises(ReleaseContractError):
                    self.snapshot()
            self.info(role)["Config"]["Env"] = saved

    def test_image_defaults_are_merged_with_compose_overrides_and_have_no_dollar_decoding(self):
        role = "web"
        info = self.info(role)
        image = self.docker.images[info["Image"]]
        image["Config"]["Env"].append("PRIVATE_LITERAL=$$image")
        info["Config"]["Env"].append("PRIVATE_LITERAL=$$image")
        self.snapshot()
        self.set_environment(role, {"API_UPSTREAM": "http://api:4000", "PRIVATE_LITERAL": "$override"})
        self.snapshot()
        position = next(i for i, value in enumerate(info["Config"]["Env"]) if value.startswith("PRIVATE_LITERAL="))
        info["Config"]["Env"][position] = "PRIVATE_LITERAL=$$override"
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_database_environment_requires_fixed_database_directory_and_nonempty_credentials(self):
        original = {"POSTGRES_USER": self.user, DB_CREDENTIAL_KEY: self.credential, "POSTGRES_DB": "sanqin_db"}
        for changes in ({"POSTGRES_USER": ""}, {DB_CREDENTIAL_KEY: ""}, {"POSTGRES_DB": "other"},
                        {"PGDATA": "/other"}):
            self.set_environment("db", {**original, **changes})
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.set_environment("db", original)

    def test_remote_host_wrong_port_database_credentials_query_fragment_or_bad_percent_urls_block(self):
        db = {"POSTGRES_USER": self.user, DB_CREDENTIAL_KEY: self.credential}
        for value in (self.url.replace("@db:", "@remote:"), self.url.replace(":5432/", ":5433/"),
                      self.url.replace("/sanqin_db", "/other"), self.url.replace(self.user, "other"),
                      self.url.replace(self.credential, "other"), self.url + "?schema=other", self.url + "#other",
                      self.url.replace("postgresql", "postgres"), self.url.replace(self.credential, "%xx"),
                      self.url.replace(":5432/", ":bad/"), self.url + "\n", "postgresql://[bad", None):
            with self.assertRaises(ReleaseContractError):
                installer._database_url_matches(value, db)

    def test_encoded_credentials_bind_to_decoded_database_values_and_are_never_evaluated(self):
        database = {"POSTGRES_USER": "model@user", DB_CREDENTIAL_KEY: "p@ss:$%"}
        installer._database_url_matches("postgresql://model%40user:p%40ss%3A%24%25@db:5432/sanqin_db", database)
        with self.assertRaises(ReleaseContractError):
            installer._database_url_matches("postgresql://model%40user:p%40ss%3A%24%2525@db:5432/sanqin_db", database)

    def test_api_worker_url_disagreement_and_changed_web_upstream_block(self):
        self.set_environment("ubereats-worker", {"DATABASE_URL": self.url.replace("@db:", "@other:")})
        with self.assertRaises(ReleaseContractError):
            self.snapshot()
        self.set_environment("ubereats-worker", {"DATABASE_URL": self.url})
        self.set_environment("web", {"API_UPSTREAM": "http://remote:4000"})
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_network_name_id_driver_scope_labels_or_endpoint_inventory_mismatch_block(self):
        original = copy.deepcopy(self.network)
        for changes in ({"Name": "other"}, {"Id": "short"}, {"Driver": "overlay"}, {"Scope": "swarm"},
                        {"Internal": True}, {"EnableIPv6": True}, {"Ingress": True}, {"Options": {"unknown": "yes"}},
                        {"Labels": {}}, {"Containers": {}},
                        {"Containers": {**original["Containers"], "0" * 64: {}}}):
            self.network = {**copy.deepcopy(original), **changes}
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.network = original

    def test_extra_networks_or_host_dns_links_and_host_alias_overrides_block(self):
        original = copy.deepcopy(self.info("api"))
        for changes in ({"NetworkMode": "host"}, {"ExtraHosts": ["db:192.0.2.1"]}, {"Links": ["other:db"]},
                        {"Dns": ["192.0.2.1"]}, {"DnsOptions": ["ndots:0"]}, {"DnsSearch": ["other"]}):
            self.docker.containers[self.docker.ids[0]] = copy.deepcopy(original)
            self.info("api")["HostConfig"].update(changes)
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.docker.containers[self.docker.ids[0]] = copy.deepcopy(original)
        self.info("api")["NetworkSettings"]["Networks"]["unreviewed"] = {}
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_saved_endpoint_network_id_ip_prefix_gateway_or_ipv6_mismatch_blocks(self):
        attached = self.info("api")["NetworkSettings"]["Networks"][installer.NETWORK_NAME]
        original = copy.deepcopy(attached)
        for changes in ({"NetworkID": "8" * 64}, {"EndpointID": "short"}, {"IPAddress": "172.23.0.99"},
                        {"IPPrefixLen": True}, {"IPPrefixLen": 24}, {"Gateway": "172.23.0.9"},
                        {"GlobalIPv6Address": "::1"}):
            attached.clear()
            attached.update({**original, **changes})
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        attached.clear()
        attached.update(original)

    def test_db_and_api_aliases_must_be_unique_to_the_saved_service_endpoints(self):
        attached = self.info("api")["NetworkSettings"]["Networks"][installer.NETWORK_NAME]
        original = list(attached["Aliases"])
        for aliases in ([], ["other"], original + ["db"], original + ["api"], original + [False]):
            attached["Aliases"] = aliases
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        attached["Aliases"] = original
        self.info("web")["NetworkSettings"]["Networks"][installer.NETWORK_NAME]["Aliases"].append("api")
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_invalid_ipam_or_duplicate_endpoint_addresses_cannot_bind_the_database_route(self):
        original = copy.deepcopy(self.network)
        for ipam in (None, {"Driver": "other", "Config": []},
                     {"Driver": "default", "Config": [{"Subnet": "bad", "Gateway": "bad"}]},
                     {"Driver": "default", "Config": [{"Subnet": "172.23.0.0/16", "Gateway": "172.23.0.0"}]}):
            self.network["IPAM"] = ipam
            with self.assertRaises(ReleaseContractError):
                self.snapshot()
        self.network = original
        source = self.network["Containers"][self.docker.ids[0]]
        target = self.network["Containers"][self.docker.ids[3]]
        target["IPv4Address"] = source["IPv4Address"]
        self.info("db")["NetworkSettings"]["Networks"][installer.NETWORK_NAME]["IPAddress"] = "172.23.0.2"
        with self.assertRaises(ReleaseContractError):
            self.snapshot()

    def test_reinspection_cannot_substitute_a_changed_container_config_mount_image_or_id(self):
        saved = self.docker.snapshot()
        original = copy.deepcopy(self.info("api"))
        for changes in ({"Id": "0" * 64}, {"Image": "sha256:" + "0" * 64},
                        {"Config": {**original["Config"], "Env": ["OTHER=value"]}}, {"Mounts": []}):
            self.docker.containers[self.docker.ids[0]] = {**copy.deepcopy(original), **changes}
            with self.assertRaises(ReleaseContractError):
                installer._application_binding_snapshot(saved, self.observe_command)
        self.docker.containers[self.docker.ids[0]] = original
        self.docker.expanded["services"]["web"]["environment"]["PUBLIC_BASE_URL"] = "https://other.invalid"
        with self.assertRaises(ReleaseContractError):
            installer._application_binding_snapshot(saved, self.observe_command)

    def test_network_change_between_otherwise_valid_passes_blocks(self):
        snapshot = installer._application_binding_snapshot
        seen = []
        def racing(*args):
            value = snapshot(*args)
            if not seen:
                seen.append(True)
                self.network["Id"] = "0" * 64
                for info in self.docker.containers.values():
                    info["NetworkSettings"]["Networks"][installer.NETWORK_NAME]["NetworkID"] = self.network["Id"]
            return value
        with patch.object(installer, "_application_binding_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_original_locks_and_late_maintenance_fence_cover_application_binding(self):
        run = self.observe_command
        marker = self.materials.state / "maintenance/active.json"
        def racing(args):
            for acquire in (prerequisites.filesystem.systemd.docker.configuration.baseline.private.jobs._locked_directory,
                            prerequisites.filesystem.systemd.docker.configuration.baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            result = run(args)
            if tuple(args) == installer.NETWORK_INSPECT and not marker.exists():
                marker.write_bytes(b"late incident preserved")
            return result
        with patch.object(self, "observe_command", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"late incident preserved")

    def test_prior_observation_does_not_query_network_and_binding_requires_prerequisites_without_new_cli(self):
        with patch.object(installer, "_application_binding_snapshot", side_effect=AssertionError("binding called")):
            self.base.observe()
        for prerequisite, binding in ((False, True), (True, "yes")):
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch,
                    include_configuration=True, include_docker=True, include_systemd=True, include_filesystem=True,
                    include_prerequisites=prerequisite, include_application_binding=binding)
        with patch("sys.stderr"), self.assertRaises(SystemExit):
            installer.main(["observe-application-binding"])

    def test_network_read_allowlist_is_fixed_and_command_failures_do_not_grant_permission(self):
        self.assertTrue(installer._docker_allowed(list(installer.NETWORK_INSPECT)))
        for args in (list(installer.NETWORK_INSPECT[:-1]) + ["other"],
                     [*installer.DOCKER, "network", "disconnect", installer.NETWORK_NAME, self.docker.ids[0]],
                     [*installer.DOCKER, "network", "connect", installer.NETWORK_NAME, self.docker.ids[0]]):
            self.assertFalse(installer._docker_allowed(args))
            with patch.object(installer.subprocess, "Popen") as spawn, self.assertRaises(ReleaseContractError):
                installer._docker_command(args, deadline=installer.time.monotonic() + 5)
            spawn.assert_not_called()
        def fail(args):
            if tuple(args) == installer.NETWORK_INSPECT:
                raise ReleaseContractError("modeled read failure")
            return self.docker.observe_command(args)
        with self.assertRaises(ReleaseContractError):
            installer._application_binding_snapshot(self.docker.snapshot(), fail)


if __name__ == "__main__":
    unittest.main()
