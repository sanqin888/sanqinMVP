"""Owned handoff inventory and identity checks; disposable records/locks only."""
import contextlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_task_handoff_io as io_fixture
from release_contract import ReleaseContractError


class OwnedTaskHandoffTests(unittest.TestCase):
    def setUp(self):
        self.base = io_fixture.TaskHandoffIOTests("test_exact_create_readback_mode_and_both_syncs")
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.case = self.base.case
        self.identity = self.case.identity
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.root = self.stack.enter_context(installer._private_directory(
            self.base.root, self.identity, create=True, exclusive=True))
        installer._installation_record_write(self.root, "intent.json", self.case.intent, self.identity)
        installer._installation_record_write(self.root, "writers.json", self.case.writers, self.identity)
        self.owned = {"writers.json": self.case.writers}
        self.target = self.base.path / self.identity / installer.INSTALL_TASK_ORIGINALS_FILE
        self.lock_temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.lock_temp.cleanup)
        Path(self.lock_temp.name).chmod(0o700)
        locks = os.open(self.lock_temp.name, os.O_RDONLY | os.O_DIRECTORY)
        self.stack.callback(os.close, locks)
        self.locks = locks
        self.stack.enter_context(installer._private_lock(locks, ".release.lock", create=True))
        self.stack.enter_context(installer._private_lock(locks, ".prepare.lock", create=True))
        self.checks = 0

    def check(self):
        for name in (".release.lock", ".prepare.lock"):
            with self.assertRaises(ReleaseContractError):
                with installer._private_lock(self.locks, name):
                    pass
        self.checks += 1
        return installer._installation_owned_run(self.base.root, self.identity,
            saved_writers=self.case.writers,
            task_handoff=self.owned.get(installer.INSTALL_TASK_ORIGINALS_FILE))

    def persist(self):
        return installer._persist_owned_installation_task_handoff(self.root, self.case.context,
            self.case.intent, self.case.writers, self.identity, self.owned, check_owned=self.check)

    def test_record_is_registered_and_rechecked_under_original_caller_locks(self):
        result = self.persist()
        self.assertGreaterEqual(self.checks, 2)
        self.assertEqual(self.check(), self.case.intent)
        context, raw, fingerprint = self.owned[installer.INSTALL_TASK_ORIGINALS_FILE]
        self.assertEqual(context, self.case.context)
        self.assertIsNot(context, self.case.context)
        self.assertEqual(raw, self.target.read_bytes())
        self.assertEqual(result["taskOriginalsSha256"], installer._hash(raw))
        self.assertEqual(len(fingerprint), 9)
        self.assertIs(result["canExecute"], False)

    def test_without_owned_registration_even_correct_file_is_unknown(self):
        installer._installation_task_handoff_write(self.root, self.case.context,
            self.case.intent, self.case.writers, self.identity)
        with self.assertRaises(ReleaseContractError):
            self.check()

    def test_writer_proof_or_previous_registration_refuses_without_overwrite(self):
        self.owned.clear()
        with self.assertRaises(ReleaseContractError):
            self.persist()
        self.assertFalse(self.target.exists())
        self.owned["writers.json"] = self.case.writers
        self.persist()
        before = self.target.read_bytes(), self.target.stat().st_ino
        with self.assertRaises(ReleaseContractError):
            self.persist()
        self.assertEqual((self.target.read_bytes(), self.target.stat().st_ino), before)

    def test_late_same_bytes_replacement_is_detected_by_original_fingerprint(self):
        self.persist()
        other = self.target.with_suffix(".replacement")
        other.write_bytes(self.target.read_bytes())
        other.chmod(0o600)
        other.replace(self.target)
        with self.assertRaises(ReleaseContractError):
            self.check()

    def test_changed_memory_context_or_malformed_proof_is_rejected(self):
        self.persist()
        original = self.owned[installer.INSTALL_TASK_ORIGINALS_FILE]
        changed = {**original[0], "invocationId": "f" * 32}
        for proof in ((changed, original[1], original[2]), original[:2], (original[0], original[1], (0,) * 9)):
            self.owned[installer.INSTALL_TASK_ORIGINALS_FILE] = proof
            with self.subTest(proof_length=len(proof)), self.assertRaises(ReleaseContractError):
                self.check()

    def test_sync_unknown_preserves_unregistered_file_and_blocks_inventory(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("modeled unknown")), self.assertRaises(OSError):
            self.persist()
        self.assertTrue(self.target.exists())
        self.assertNotIn(installer.INSTALL_TASK_ORIGINALS_FILE, self.owned)
        with self.assertRaises(ReleaseContractError):
            self.check()

    def test_final_owned_check_failure_preserves_record_and_registration(self):
        calls = 0
        def failed():
            nonlocal calls
            calls += 1
            self.check()
            if calls == 2:
                raise ReleaseContractError("modeled final context drift")
        with self.assertRaises(ReleaseContractError):
            installer._persist_owned_installation_task_handoff(self.root, self.case.context,
                self.case.intent, self.case.writers, self.identity, self.owned, check_owned=failed)
        self.assertTrue(self.target.exists())
        self.assertIn(installer.INSTALL_TASK_ORIGINALS_FILE, self.owned)

    def test_namespace_exit_accepts_only_the_exact_registered_association(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        Path(temp.name).chmod(0o700)
        parent = os.open(temp.name, os.O_RDONLY | os.O_DIRECTORY)
        self.stack.callback(os.close, parent)
        owned = {}
        with installer._installation_namespace(parent, create=True, owned_identity=self.identity,
                                                owned_records=owned) as (namespace, created):
            self.assertTrue(created)
            with installer._private_directory(namespace, self.identity, create=True, exclusive=True) as root:
                installer._installation_record_write(root, "intent.json", self.case.intent, self.identity)
                installer._installation_record_write(root, "writers.json", self.case.writers, self.identity)
                owned["writers.json"] = self.case.writers
                def check():
                    return installer._installation_owned_run(namespace, self.identity,
                        saved_writers=self.case.writers, task_handoff=owned.get(installer.INSTALL_TASK_ORIGINALS_FILE))
                installer._persist_owned_installation_task_handoff(root, self.case.context,
                    self.case.intent, self.case.writers, self.identity, owned, check_owned=check)


if __name__ == "__main__":
    unittest.main()
