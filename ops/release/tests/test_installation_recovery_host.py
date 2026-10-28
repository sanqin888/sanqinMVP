"""Private pre-gate recovery observations; real disposable files, modeled host APIs."""
import copy
import io
import json
import sys
import tarfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_recovery_retention as retention
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationRecoveryHostTests(unittest.TestCase):
    def setUp(self):
        self.base = retention.InstallationRecoveryRetentionTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)

    def observe(self):
        return self.base.observe()

    def host_raw(self):
        with tarfile.open(fileobj=io.BytesIO(self.base.payload()), mode="r:") as archive:
            return archive.extractfile(installer.RECOVERY_HOST_MEMBER).read()

    def saved(self):
        intent, writers, identity = self.base.originals()
        return installer._installation_writers_match(intent, writers, identity)

    def assert_pre_intent_failure(self):
        self.assertFalse(self.base.phase.gate.marker.exists())
        namespace = self.base.phase.gate.namespace
        self.assertTrue(not namespace.exists() or not list(namespace.iterdir()))
        self.assertEqual(self.base.phase.actions, [])

    def capture_with(self, replacement):
        original = installer._installation_recovery_host_capture
        def capture(*args, **kwargs):
            return replacement(original, *args, **kwargs)
        return patch.object(installer, "_installation_recovery_host_capture", side_effect=capture)

    def test_exact_raw_host_observations_are_private_and_bound_to_saved_objects(self):
        result = self.observe()
        value = installer._installation_recovery_host_value(self.host_raw(), self.saved())
        self.assertEqual(value["docker"]["containers"], self.saved()["containers"])
        self.assertEqual(value["docker"]["dockerEngine"], result["docker"]["dockerEngine"])
        self.assertEqual(value["applicationBinding"], result["applicationBinding"])
        self.assertEqual(value["effectiveConfiguration"], result["effectiveConfiguration"])
        self.assertEqual(value["systemd"], result["systemd"])
        self.assertFalse(value["canExecute"])
        self.assertFalse(value["recoveryReady"])
        self.assertIn(b"PRIVATE_VALUE=never_echo_$secret", self.host_raw())
        self.assertNotIn("never_echo", json.dumps(result))

    def test_raw_stdout_is_preserved_exactly_before_marker_gate_and_writer_changes(self):
        captured = []
        def record(original, capture, baseline, run, manager, **kwargs):
            self.assert_pre_intent_failure()
            def observe(client, argv):
                raw = client(argv)
                captured.append({"argv": list(argv), "stdout": raw})
                return raw
            return original(capture, baseline, lambda args: observe(run, args),
                            lambda args: observe(manager, args), **kwargs)
        with self.capture_with(record):
            self.observe()
        value = installer._installation_recovery_host_value(self.host_raw(), self.saved())
        self.assertEqual(value["commands"], captured)
        for row in captured:
            if row["argv"] == installer._systemd_args("docker.service"):
                self.assertNotIn("/usr/bin/false", row["stdout"])
            if row["argv"][:len(installer.DOCKER)] == list(installer.DOCKER):
                self.assertTrue(installer._docker_allowed(row["argv"]))

    def test_archive_index_hash_and_receipt_bind_host_bytes_without_new_file_record(self):
        self.observe()
        capture = self.base.capture
        self.assertEqual(len(capture), 3)
        self.assertEqual(capture[2], self.host_raw())
        self.assertEqual(capture[1]["hostObservations"]["sha256"], installer._hash(self.host_raw()))
        self.assertEqual(capture[1]["hostObservations"]["bytes"], len(self.host_raw()))
        intent, writers, identity = self.base.originals()
        receipt = installer._installation_recovery_receipt_value(self.base.receipt(),
            self.base.payload(), intent, writers, identity)
        self.assertEqual(receipt["captureSha256"], installer._hash(installer._json(capture[1])))
        self.assertFalse(receipt["recoveryReady"])
        self.assertFalse(receipt["snapshotAvailable"])
        self.assertEqual(set(path.name for path in self.base.directory().iterdir()), installer.RECOVERY_FILES)

    def test_both_original_locks_cover_all_raw_host_commands(self):
        def record(original, capture, baseline, run, manager, **kwargs):
            def checked(client, argv):
                self.base.phase.gate.assert_locks_held()
                self.assert_pre_intent_failure()
                return client(argv)
            return original(capture, baseline, lambda args: checked(run, args),
                            lambda args: checked(manager, args), **kwargs)
        with self.capture_with(record):
            self.observe()

    def test_changed_docker_identity_during_capture_blocks_before_intent(self):
        def drift(original, capture, baseline, run, manager, **kwargs):
            def changed(argv):
                raw = run(argv)
                if argv == [*installer.DOCKER, "info", "--format", "{{json .}}"]:
                    value = json.loads(raw)
                    value["ServerVersion"] += "-changed"
                    return json.dumps(value)
                return raw
            return original(capture, baseline, changed, manager, **kwargs)
        with self.capture_with(drift), self.assertRaisesRegex(ReleaseContractError, "baseline changed"):
            self.observe()
        self.assert_pre_intent_failure()

    def test_changed_loaded_properties_block_before_intent(self):
        def drift(original, capture, baseline, run, manager, **kwargs):
            def changed(argv):
                raw = manager(argv)
                if argv == installer._systemd_args("docker.service"):
                    raw = raw.replace("UnitFileState=enabled", "UnitFileState=disabled")
                return raw
            return original(capture, baseline, run, changed, **kwargs)
        with self.capture_with(drift), self.assertRaisesRegex(ReleaseContractError, "loaded units changed"):
            self.observe()
        self.assert_pre_intent_failure()

    def test_failed_raw_client_does_not_create_intent_or_mutate_host(self):
        def fail(original, capture, baseline, run, manager, **kwargs):
            def broken(argv):
                raise OSError("modeled read failure")
            return original(capture, baseline, broken, manager, **kwargs)
        with self.capture_with(fail), self.assertRaises(OSError):
            self.observe()
        self.assert_pre_intent_failure()

    def test_host_byte_budget_blocks_before_any_durable_record(self):
        with patch.object(installer, "MAX_RECOVERY_HOST_BYTES", 32), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assert_pre_intent_failure()

    def test_shared_source_and_host_budget_cannot_be_bypassed(self):
        def bounded(original, capture, baseline, run, manager, **kwargs):
            with patch.object(installer, "MAX_RECOVERY_SOURCE_BYTES", capture[1]["capturedBytes"]):
                return original(capture, baseline, run, manager, **kwargs)
        with self.capture_with(bounded), self.assertRaisesRegex(ReleaseContractError, "shared budget"):
            self.observe()
        self.assert_pre_intent_failure()

    def test_missing_wrong_or_permission_widened_host_member_blocks_packaging(self):
        self.observe()
        files, summary, raw = self.base.capture
        intent, writers, identity = self.base.originals()
        for bad in ((files, summary), (files, summary, raw + b" "),
                    (files, {**summary, "hostObservations": {}}, raw)):
            with self.subTest(capture_length=len(bad)), self.assertRaises(ReleaseContractError):
                installer._installation_recovery_payload(bad, intent, writers, identity)
        for key, value in (("sha256", "f" * 64), ("bytes", True), ("preGate", 1),
                           ("completeHostStateCaptured", True), ("member", "other.json")):
            changed = copy.deepcopy(summary)
            changed["hostObservations"][key] = value
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._installation_recovery_payload((files, changed, raw), intent, writers, identity)

    def test_raw_host_json_rejects_wrong_identity_permissions_and_extra_fields(self):
        self.observe()
        value = json.loads(self.host_raw())
        for key, bad in (("schemaVersion", True), ("kind", "other"), ("applicationSha", "f" * 40),
                         ("canExecute", True), ("recoveryReady", True), ("extra", False)):
            changed = {**value, key: bad}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._installation_recovery_host_value(installer._json(changed), self.saved())
        changed = copy.deepcopy(value)
        changed["docker"]["containers"]["api"]["containerId"] = "f" * 64
        with self.assertRaises(ReleaseContractError):
            installer._installation_recovery_host_value(installer._json(changed), self.saved())

    def test_raw_host_json_rejects_corrupt_duplicate_noncanonical_and_nonfinite_inputs(self):
        self.observe()
        raw = self.host_raw()
        for bad in (b"{", b"\xff", raw + b" ", raw.replace(b'{"applicationBinding":',
                b'{"schemaVersion":1,"applicationBinding":', 1),
                raw.replace(b'"schemaVersion":1', b'"schemaVersion":NaN', 1)):
            with self.subTest(raw=bad[:20]), self.assertRaises(ReleaseContractError):
                installer._installation_recovery_host_value(bad, self.saved())

    def test_transcript_rejects_mutation_exec_arbitrary_object_and_missing_observations(self):
        self.observe()
        original = json.loads(self.host_raw())
        cases = []
        for argv in ([*installer.SYSTEMCTL, "daemon-reload"],
                     [*installer.DOCKER, "stop", "f" * 64],
                     [*installer.DOCKER, "exec", self.saved()["containers"]["db"]["containerId"], "sh"],
                     [*installer.DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", "f" * 64]):
            value = copy.deepcopy(original)
            value["commands"][0]["argv"] = argv
            cases.append(value)
        value = copy.deepcopy(original)
        value["commands"] = [row for row in value["commands"] if row["argv"] != installer._systemd_args("docker.socket")]
        cases.append(value)
        for value in cases:
            with self.assertRaises(ReleaseContractError):
                installer._installation_recovery_host_value(installer._json(value), self.saved())

    def test_compose_export_and_actual_environment_keep_their_original_dollar_bytes(self):
        docker = self.base.phase.docker
        identifier = docker.ids[0]
        actual = copy.deepcopy(docker.containers[identifier]["Config"]["Env"])
        exported = copy.deepcopy(docker.expanded["services"]["api"]["environment"])
        self.observe()
        value = json.loads(self.host_raw())
        observed_actual, observed_export = [], []
        for row in value["commands"]:
            if row["argv"] == [*installer.DOCKER, "inspect", "--type", "container", "--format", "{{json .}}", identifier]:
                observed_actual.append(json.loads(row["stdout"])["Config"]["Env"])
            if row["argv"] == [*installer.COMPOSE, "config", "--format", "json"]:
                observed_export.append(json.loads(row["stdout"])["services"]["api"]["environment"])
        self.assertTrue(observed_actual and observed_export)
        self.assertTrue(all(values == actual for values in observed_actual))
        self.assertTrue(all(values == exported for values in observed_export))
        self.assertNotEqual(dict(item.split("=", 1) for item in actual)["LITERAL_VALUE"], exported["LITERAL_VALUE"])

    def test_readonly_and_legacy_freeze_entries_do_not_collect_raw_host_material(self):
        with patch.object(installer, "_installation_recovery_host_capture", side_effect=AssertionError("capture")):
            result = self.base.phase.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_WRITERS_FROZEN")
        self.assertFalse(self.base.directory().exists())


if __name__ == "__main__":
    unittest.main()
