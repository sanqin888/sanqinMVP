"""Fixed read-only recovery DB transcripts, modeled ports and disposable original materials."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_recovery_replacement_target as replacement
from release_contract import ReleaseContractError


class RecoveryDatabaseProbeTests(unittest.TestCase):
    def setUp(self):
        self.base = replacement.RecoveryReplacementTargetTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.base
        self.identifier = "e" * 64
        self.history = {**copy.deepcopy(self.base.basis["basis"]["sourceDatabaseIdentity"]),
            "history": copy.deepcopy(self.materials.base.combined.git.history)}
        self.storage = copy.deepcopy(self.materials.base.storage.database)
        self.calls = []

    def originals(self):
        return (installer._json(self.materials.index), self.materials.payload, self.materials.receipt,
                self.materials.intent, self.materials.writers, self.materials.identity,
                installer._json(self.base.envelope()))

    def run_query(self, args, *, deadline):
        self.assertTrue(installer._runtime_observation_allowed(args))
        self.calls.append(copy.deepcopy(args))
        history = installer._installation_history_args(self.identifier)
        storage = installer._installation_storage_args(self.identifier)
        self.assertIn(args, (history, storage))
        return {"returncode": 0, "stdout": json.dumps(self.history if args == history else self.storage), "stderr": ""}

    def capture(self, **kwargs):
        return installer._capture_recovery_database_probe(*self.originals(),
            expected=kwargs.get("expected", self.base.expected),
            database_container_id=kwargs.get("identifier", self.identifier),
            run=kwargs.get("run", self.run_query), fetch=kwargs.get("fetch", self.materials.fetch),
            deadline=kwargs.get("deadline", installer.time.monotonic() + 60))

    def review(self, value=None, **kwargs):
        if value is None:
            _, raw = self.capture()
        else:
            raw = installer._json(value)
        return installer._snapshot_recovery_database_review(kwargs.get("raw", raw), *self.originals(),
            expected=kwargs.get("expected", self.base.expected),
            database_container_id=kwargs.get("identifier", self.identifier), fetch=self.materials.fetch)

    def captured_value(self):
        return json.loads(self.capture()[1])

    def change_outputs(self, value, positions, mutate):
        value = copy.deepcopy(value)
        for i in positions:
            output = json.loads(value["commands"][i]["stdout"])
            mutate(output)
            value["commands"][i]["stdout"] = json.dumps(output)
        return value

    def test_four_fixed_readonly_queries_retain_originals_and_compare_source_identity_history(self):
        facts, raw = self.capture()
        expected = [installer._installation_history_args(self.identifier), installer._installation_storage_args(self.identifier)] * 2
        self.assertEqual(self.calls, expected)
        value = json.loads(raw)
        self.assertEqual([row["argv"] for row in value["commands"]], expected)
        self.assertEqual(facts["outcome"], "RECOVERY_DATABASE_TRANSCRIPT_MATCHED_EVIDENCE_REQUIRED")
        self.assertTrue(facts["databaseTranscriptReviewed"])
        self.assertEqual(facts["captureSha256"], installer._hash(raw))
        self.assertEqual(facts["databaseIdentity"], self.base.basis["basis"]["sourceDatabaseIdentity"])
        self.assertEqual(facts["migrationHistorySha256"], self.base.basis["basis"]["sourceMigrationHistorySha256"])

    def test_transcript_never_grants_actual_host_container_image_cluster_isolation_or_install_authority(self):
        facts, _ = self.capture()
        for key in ("commandPortTargetAuthenticated", "databaseContainerBindingProven", "databaseImageIdentityProven",
                    "fullClusterContentProven", "replacementHostObserved", "cloudIsolationProven", "snapshotLineageProven",
                    "awsOriginAuthenticated", "trustedTimeProven", "restoreProven", "snapshotAvailable",
                    "recoveryReady", "readyToInstall", "canExecute", "authorizedToMutateProduction"):
            self.assertIs(facts[key], False, key)
        self.assertEqual(facts["requiredEvidence"], list(installer.RECOVERY_REQUIRED_EVIDENCE))
        self.assertTrue(facts["requiresHostRecheck"])

    def test_independent_replacement_context_mismatch_prevents_every_command(self):
        with self.assertRaises(ReleaseContractError):
            self.capture(expected={**self.base.expected, "instanceArn": self.base.source["instanceArn"]})
        self.assertEqual(self.calls, [])

    def test_source_review_failure_prevents_every_command(self):
        def unavailable(_):
            raise ReleaseContractError("modeled source unavailable")
        with self.assertRaises(ReleaseContractError):
            self.capture(fetch=unavailable)
        self.assertEqual(self.calls, [])

    def test_new_container_id_is_explicit_and_need_not_equal_source_lifetime_identity(self):
        source = self.materials.observation["prerequisites"]["databaseContainerId"]
        self.assertNotEqual(self.identifier, source)
        self.assertEqual(self.capture()[0]["databaseContainerId"], self.identifier)
        for bad in ("db", "e" * 63, True, None):
            with self.subTest(identifier=bad), self.assertRaises(ReleaseContractError):
                self.capture(identifier=bad)
        with self.assertRaises(ReleaseContractError):
            self.capture(run=None)
        with self.assertRaises(ReleaseContractError):
            self.capture(fetch=None)

    def test_exit_status_is_native_zero_and_failed_port_does_not_issue_followup_queries(self):
        for status in (1, -1, True, "0", None):
            calls = []
            def failed(args, *, deadline):
                calls.append(args)
                return {"returncode": status, "stdout": json.dumps(self.history), "stderr": "private diagnostic"}
            with self.subTest(status=status), self.assertRaises(ReleaseContractError):
                self.capture(run=failed)
            self.assertEqual(len(calls), 1)

    def test_port_result_has_exact_fields_and_native_bounded_text(self):
        for bad in (None, {"returncode": 0, "stdout": json.dumps(self.history)},
                    {"returncode": 0, "stdout": b"{}", "stderr": ""},
                    {"returncode": 0, "stdout": "{}", "stderr": "x" * 4097},
                    {"returncode": 0, "stdout": "", "stderr": ""},
                    {"returncode": 0, "stdout": "{}", "stderr": "", "canExecute": True},
                    {"returncode": 0, "stdout": chr(0xD800), "stderr": ""}):
            with self.subTest(kind=type(bad).__name__), self.assertRaises(ReleaseContractError):
                self.capture(run=lambda _, **kwargs: bad)

    def test_capture_canonical_schema_duplicates_constants_and_size_are_rejected(self):
        value = self.captured_value()
        raw = installer._json(value)
        for bad in (b"", "not bytes", raw + b" ", b"\xff", b'{"value":NaN}\n',
                    raw.replace(b'{"basisSha256":', b'{"schemaVersion":1,"basisSha256":', 1)):
            with self.subTest(kind=type(bad).__name__), self.assertRaises(ReleaseContractError):
                self.review(value, raw=bad)
        for change in ({"schemaVersion": True}, {"kind": "PASS"}, {"canExecute": True}):
            with self.subTest(change=change), self.assertRaises(ReleaseContractError):
                self.review({**value, **change})
        with patch.object(installer, "MAX_RECOVERY_HOST_BYTES", len(raw) - 1), self.assertRaises(ReleaseContractError):
            self.review(value, raw=raw)

    def test_each_capture_digest_and_selected_container_must_bind_current_originals(self):
        value = self.captured_value()
        for key in ("basisSha256", "indexSha256", "replacementInputSha256"):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.review({**value, key: "f" * 64})
        with self.assertRaises(ReleaseContractError):
            self.review({**value, "databaseContainerId": "f" * 64})
        with self.assertRaises(ReleaseContractError):
            self.review(value, identifier="f" * 64)

    def test_command_count_exact_order_argv_and_fields_cannot_be_replaced(self):
        value = self.captured_value()
        for commands in (value["commands"][:3], value["commands"] + value["commands"][:1],
                         list(reversed(value["commands"]))):
            with self.subTest(count=len(commands)), self.assertRaises(ReleaseContractError):
                self.review({**value, "commands": commands})
        for change in ({"argv": ["sh", "-c", "echo PASS"]}, {"argv": installer._installation_history_args("f" * 64)},
                       {"returncode": True}, {"extra": "PASS"}):
            changed = copy.deepcopy(value)
            changed["commands"][0].update(change)
            with self.subTest(change=list(change)), self.assertRaises(ReleaseContractError):
                self.review(changed)

    def test_history_must_be_stable_across_both_queries(self):
        value = self.captured_value()
        changed = self.change_outputs(value, [2], lambda obj: obj["history"][0].update(state="rolled-back"))
        with self.assertRaisesRegex(ReleaseContractError, "changed during"):
            self.review(changed)

    def test_self_consistent_changed_history_still_fails_against_source_originals(self):
        value = self.captured_value()
        for mutate in (lambda obj: obj["history"][0].update(state="rolled-back"),
                       lambda obj: obj["history"][0].update(sha256="f" * 64),
                       lambda obj: obj["history"].append(copy.deepcopy(obj["history"][0]))):
            with self.subTest(mutate=mutate), self.assertRaisesRegex(ReleaseContractError, "source originals"):
                self.review(self.change_outputs(value, [0, 2], mutate))

    def test_exact_source_pg_version_and_database_identity_are_required(self):
        value = self.captured_value()
        for key, wrong in (("serverVersionNum", "150099"), ("serverVersionNum", "160001"),
                           ("database", "postgres"), ("port", "5433"), ("inRecovery", True),
                           ("transactionReadOnly", "off"), ("dataDirectory", "/other")):
            changed = self.change_outputs(value, [0, 2], lambda obj: obj.update({key: wrong}))
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.review(changed)

    def test_unresolved_or_malformed_history_cannot_be_loaded(self):
        value = self.captured_value()
        for mutate in (lambda obj: obj["history"][0].update(state="failed"),
                       lambda obj: obj.update(history=[]),
                       lambda obj: obj["history"][0].update(sha256="unknown"),
                       lambda obj: obj.update(restoreProven=True)):
            with self.subTest(mutate=mutate), self.assertRaises(ReleaseContractError):
                self.review(self.change_outputs(value, [0, 2], mutate))

    def test_default_tablespaces_config_and_storage_identity_require_exact_fixed_scope(self):
        value = self.captured_value()
        for mutate in (lambda obj: obj["tablespaces"].append({"oid": "9999", "name": "custom", "location": "/other"}),
                       lambda obj: obj.update(configFile="/other/postgresql.conf"),
                       lambda obj: obj.update(transactionReadOnly="off"),
                       lambda obj: obj.update(database="other")):
            with self.subTest(mutate=mutate), self.assertRaises(ReleaseContractError):
                self.review(self.change_outputs(value, [1, 3], mutate))

    def test_storage_change_between_queries_is_rejected(self):
        value = self.captured_value()
        with self.assertRaisesRegex(ReleaseContractError, "changed during"):
            self.review(self.change_outputs(value, [3], lambda obj: obj.update(hbaFile="/changed")))

    def test_command_json_is_strict_but_original_whitespace_is_preserved_and_hashed(self):
        value = self.captured_value()
        changed = copy.deepcopy(value)
        changed["commands"][2]["stdout"] = json.dumps(self.history, indent=2) + "\n"
        facts = self.review(changed)
        self.assertNotEqual(facts["commandOutputSha256"][0], facts["commandOutputSha256"][2])
        for bad in ('{"database":NaN}', '{"database":"a","database":"b"}', "not JSON"):
            changed = copy.deepcopy(value)
            changed["commands"][0]["stdout"] = bad
            with self.subTest(bad=bad), self.assertRaises(ReleaseContractError):
                self.review(changed)

    def test_output_and_capture_budgets_stop_collection_instead_of_truncating(self):
        with patch.object(installer, "MAX_HOST_OUTPUT", 10), self.assertRaises(ReleaseContractError):
            self.capture()
        with patch.object(installer, "MAX_RECOVERY_HOST_BYTES", 10), self.assertRaises(ReleaseContractError):
            self.capture()

    def test_raw_private_stderr_is_retained_but_never_echoed_in_projection(self):
        def warning(args, *, deadline):
            row = self.run_query(args, deadline=deadline)
            return {**row, "stderr": "PRIVATE_DIAGNOSTIC_DO_NOT_ECHO"}
        facts, raw = self.capture(run=warning)
        self.assertIn("PRIVATE_DIAGNOSTIC_DO_NOT_ECHO", raw.decode())
        self.assertNotIn("PRIVATE_DIAGNOSTIC_DO_NOT_ECHO", json.dumps(facts))
        self.assertNotIn("stdout", facts)
        self.assertNotIn("commands", facts)
        self.assertTrue(facts["readOnlyQuerySessionObserved"])
        self.assertFalse(facts["fullClusterContentProven"])

    def test_retained_review_performs_no_host_io_process_http_or_command_replay(self):
        value = self.captured_value()
        with patch.object(installer.os, "open", side_effect=AssertionError("host open")), \
             patch.object(installer.os, "write", side_effect=AssertionError("host write")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            self.assertTrue(self.review(value)["databaseTranscriptReviewed"])

    def test_port_exception_propagates_without_retry_restart_or_cleanup(self):
        calls = []
        def unavailable(args, *, deadline):
            calls.append(args)
            raise OSError("modeled disconnected read-only port")
        with self.assertRaises(OSError):
            self.capture(run=unavailable)
        self.assertEqual(len(calls), 1)

    def test_port_cannot_mutate_recorded_fixed_argv_and_results_are_repeatable_without_mutation(self):
        def mutating(args, *, deadline):
            result = self.run_query(args, deadline=deadline)
            args[:] = ["untrusted replacement"]
            return result
        facts, raw = self.capture(run=mutating)
        value = json.loads(raw)
        before = copy.deepcopy(value)
        self.assertEqual(self.review(value), self.review(value))
        self.assertEqual(value, before)
        self.assertEqual(value["commands"][0]["argv"], installer._installation_history_args(self.identifier))
        self.assertTrue(facts["databaseTranscriptReviewed"])

    def test_probe_deadline_is_native_bounded_and_rechecked_after_the_port(self):
        for bad in (True, None, float("nan"), float("inf"), installer.time.monotonic() - 1,
                    installer.time.monotonic() + 1000):
            with self.subTest(deadline=bad), self.assertRaises(ReleaseContractError):
                self.capture(deadline=bad)
        with patch.object(installer.time, "monotonic", return_value=10) as clock:
            def late(args, *, deadline):
                self.assertEqual(deadline, 10.5)
                result = self.run_query(args, deadline=deadline)
                clock.return_value = 11
                return result
            with self.assertRaisesRegex(ReleaseContractError, "deadline"):
                self.capture(run=late, deadline=10.5)
