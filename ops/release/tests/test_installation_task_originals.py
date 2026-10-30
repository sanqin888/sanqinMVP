"""Inert installation task/original record association; no host calls or persistence."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_old_application as application
from release_contract import ReleaseContractError


class TaskOriginalsTests(unittest.TestCase):
    def setUp(self):
        self.case = application.ApplicationObservationTests(
            "test_only_original_application_ids_can_enter_private_start_client")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.intent, self.writers, self.identity = self.case.intent, self.case.writers, self.case.identity
        original = json.loads(self.intent)
        self.context = {"sourceSha": original["targetSourceSha"], "retentionId": original["retentionId"],
            "unit": installer.INSTALL_TASK_PREFIX + original["retentionId"] + ".service",
            "invocationId": "e" * 32, "role": "run", "managerContextObserved": True,
            "installationComplete": False, "canExecute": False}

    def build(self):
        return installer._installation_task_originals_bytes(self.context, self.intent, self.writers, self.identity)

    def match(self, raw):
        return installer._installation_task_originals_match(raw, self.context, self.intent, self.writers, self.identity)

    def test_exact_originals_and_generation_are_bound_without_execution_authority(self):
        raw = self.build()
        value = json.loads(raw)
        self.assertEqual(value["intentSha256"], installer._hash(self.intent))
        self.assertEqual(value["writersSha256"], installer._hash(self.writers))
        self.assertEqual(value["installationId"], self.identity)
        self.assertEqual(value["invocationId"], "e" * 32)
        self.assertEqual(raw, installer._json(value))
        result = self.match(raw)
        self.assertIs(result["originalRecordsMatched"], True)
        for key in ("installationComplete", "canExecute", "restoreProven"):
            self.assertIs(value[key], False)
            self.assertIs(result[key], False)

    def test_context_fields_and_native_boolean_types_are_strict(self):
        baseline = self.context.copy()
        for key, value in (("managerContextObserved", 1), ("canExecute", 0),
                           ("installationComplete", 0), ("role", "cleanup"), ("extra", False)):
            self.context = {**baseline, key: value}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.build()
        self.context = baseline.copy()
        del self.context["role"]
        with self.assertRaises(ReleaseContractError):
            self.build()

    def test_another_source_material_unit_or_invocation_is_refused(self):
        baseline = self.context.copy()
        for key, value in (("sourceSha", "f" * 40), ("retentionId", "f" * 64),
                           ("unit", "other.service"), ("invocationId", "0" * 32),
                           ("invocationId", "E" * 32)):
            self.context = {**baseline, key: value}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.build()

    def test_matching_old_record_does_not_cross_manager_generations(self):
        raw = self.build()
        self.context["invocationId"] = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.match(raw)

    def test_changed_original_intent_requires_its_exact_writer_binding(self):
        value = json.loads(self.intent)
        value["observationSha256"] = ("0" if value["observationSha256"][0] != "0" else "1") + value["observationSha256"][1:]
        self.intent = installer._json(value)
        with self.assertRaises(ReleaseContractError):
            self.build()

    def test_changed_writer_bytes_and_container_facts_cannot_match_old_association(self):
        raw = self.build()
        value = json.loads(self.writers)
        value["containers"]["api"]["restartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
        self.writers = installer._json(value)
        with self.assertRaises(ReleaseContractError):
            self.match(raw)

    def test_noncanonical_duplicate_extra_and_success_claims_are_refused(self):
        raw = self.build()
        value = json.loads(raw)
        candidates = [json.dumps(value).encode(), raw + b"\n", raw.replace(b'{"canExecute":false,',
            b'{"canExecute":false,"canExecute":false,'), installer._json({**value, "extra": False})]
        for key in ("installationComplete", "canExecute", "restoreProven"):
            candidates.append(installer._json({**value, key: True}))
        for candidate in candidates:
            with self.subTest(candidate=candidate[:80]), self.assertRaises(ReleaseContractError):
                self.match(candidate)

    def test_wrong_installation_id_and_unbounded_or_nonbytes_input_are_refused(self):
        with self.assertRaises(ReleaseContractError):
            installer._installation_task_originals_bytes(self.context, self.intent, self.writers, "f" * 64)
        for raw in (b"", b"x" * (installer.MAX_INSTALL_RECORD + 1), "not bytes", None):
            with self.subTest(type=type(raw)), self.assertRaises(ReleaseContractError):
                self.match(raw)


if __name__ == "__main__":
    unittest.main()
