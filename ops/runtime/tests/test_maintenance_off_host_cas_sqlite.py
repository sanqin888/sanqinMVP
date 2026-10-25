"""P2-C3A synthetic SQLite CAS failure matrix; never accesses Mac/Guest/production."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    from maintenance_boot_guard import evaluate_boot_candidate
    from maintenance_boot_guard_contract import (
        BootGuardBlocked, BootGuardState, CasRequest, InstallationAnchor,
    )
    from maintenance_off_host_cas_contract import (
        LAB_CLASSIFICATION, OfflineCasReceipt, OfflineCasSubmission,
    )
    from maintenance_off_host_cas_sqlite import (
        OfflineSqliteCas, initialize_offline_lab,
    )
    from normal_runtime_launch import digest
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)

HOST = "lab-mac-guest-01"
INSTALL = "lab-install-01"
OWNER = "offline-maintainer"
TXID = "r2a2-sqlite-0001"
CLIENT = "synthetic-guest-client"


def anchor():
    return InstallationAnchor(HOST, INSTALL, "a" * 64, "b" * 64)


def initial():
    return BootGuardState(anchor().sha256(), HOST, INSTALL, OWNER, TXID,
                          1, 0, "INSTALLED_INACTIVE", None, "c" * 64)


def next_state(previous, phase="READY_TO_ARM"):
    return replace(previous, epoch=previous.epoch + 1,
                   revision=previous.epoch, phase=phase,
                   previous_sha256=previous.sha256())


def submission(state, *, client=CLIENT, nonce=None):
    request = CasRequest(
        state.host_id, state.installation_id, state.owner_id, state.transaction_id,
        state.epoch - 1, state.epoch, state.previous_sha256, state.sha256(),
        nonce or digest(("nonce-" + str(state.epoch) + "-" + state.phase).encode()))
    return OfflineCasSubmission(request, state.encode(), anchor().sha256(), client)


class OfflineCasDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="sanq-cas-offline-")
        os.chmod(self.directory.name, 0o700)
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "authority.sqlite3")
        initialize_offline_lab(self.path, anchor(), CLIENT)
        self.cas = OfflineSqliteCas(self.path)

    def test_explicit_enrollment_and_private_mode(self):
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o600)
        self.assertIsNone(self.cas.read_head(HOST, INSTALL, CLIENT))
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_DB_ALREADY_EXISTS"):
            initialize_offline_lab(self.path, anchor(), CLIENT)
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_IDENTITY_MISMATCH"):
            self.cas.read_head(HOST, INSTALL, "impostor")

    def test_commit_canonical_initial_and_read_back_after_reopen(self):
        proposal = submission(initial())
        receipt = self.cas.submit(proposal)
        self.assertIs(type(receipt), OfflineCasReceipt)
        self.assertIn(LAB_CLASSIFICATION.encode(), receipt.encode())
        self.assertEqual(receipt.epoch, 1)
        self.assertEqual(receipt.request_sha256, proposal.request.sha256())
        reopened = OfflineSqliteCas(self.path)
        head = reopened.read_head(HOST, INSTALL, CLIENT)
        self.assertEqual((head.epoch, head.state_sha256, head.phase),
                         (1, initial().sha256(), "INSTALLED_INACTIVE"))
        status = reopened.lookup_commit(HOST, INSTALL, CLIENT,
                                        proposal.request.sha256())
        self.assertEqual(status.receipt.encode(), receipt.encode())
        self.assertTrue(status.is_current_head)
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute(
                "SELECT count(*) FROM audit_events WHERE event_type='LAB_CAS_COMMITTED'"
            ).fetchone()[0], 1)

    def test_append_only_epochs_and_historical_lookup(self):
        first = submission(initial())
        receipt1 = self.cas.submit(first)
        second = submission(next_state(initial()))
        receipt2 = self.cas.submit(second)
        self.assertEqual(receipt2.previous_commit_sha256, receipt1.commit_sha256)
        head = self.cas.read_head(HOST, INSTALL, CLIENT)
        self.assertEqual((head.epoch, head.phase), (2, "READY_TO_ARM"))
        self.assertFalse(self.cas.lookup_commit(
            HOST, INSTALL, CLIENT, first.request.sha256()).is_current_head)
        self.assertTrue(self.cas.lookup_commit(
            HOST, INSTALL, CLIENT, second.request.sha256()).is_current_head)

    def test_same_cas_request_replay_is_denied_and_lookup_is_read_only(self):
        first = submission(initial())
        receipt = self.cas.submit(first)
        for _ in range(2):
            with self.assertRaisesRegex(BootGuardBlocked, "LAB_CAS_CONFLICT"):
                self.cas.submit(first)
        self.assertEqual(self.cas.lookup_commit(
            HOST, INSTALL, CLIENT, first.request.sha256()).receipt, receipt)
        self.assertEqual(self.cas.read_head(HOST, INSTALL, CLIENT).epoch, 1)

    def test_two_independent_connections_compete_for_one_epoch(self):
        self.cas.submit(submission(initial()))
        old = initial()
        a = submission(next_state(old, "READY_TO_ARM"))
        b = submission(next_state(old, "INCIDENT"))
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(OfflineSqliteCas(self.path).submit, item)
                       for item in (a, b)]
        results = []
        for future in futures:
            try:
                results.append(future.result())
            except BootGuardBlocked:
                results.append(None)
        self.assertEqual(sum(r is not None for r in results), 1)
        self.assertEqual(self.cas.read_head(HOST, INSTALL, CLIENT).epoch, 2)

    def test_old_epoch_wrong_predecessor_and_skipped_epoch(self):
        self.cas.submit(submission(initial()))
        good = submission(next_state(initial()))
        wrong = replace(good, request=replace(good.request,
                                              expected_state_sha256="e" * 64))
        with self.assertRaisesRegex(BootGuardBlocked, "SUBMISSION_STATE_MISMATCH"):
            self.cas.submit(wrong)
        skipped = replace(initial(), epoch=3, revision=2,
                          previous_sha256="e" * 64, phase="ARMING")
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_CAS_CONFLICT"):
            self.cas.submit(submission(skipped))
        self.assertEqual(self.cas.read_head(HOST, INSTALL, CLIENT).epoch, 1)

    def test_nonce_cannot_be_reused_for_next_epoch(self):
        first = submission(initial())
        self.cas.submit(first)
        second = submission(next_state(initial()), nonce=first.request.nonce_sha256)
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_TRANSACTION_FAILURE"):
            self.cas.submit(second)
        self.assertEqual(self.cas.read_head(HOST, INSTALL, CLIENT).epoch, 1)

    def test_wrong_host_installation_anchor_and_client_denied(self):
        base = submission(initial())
        with self.assertRaisesRegex(BootGuardBlocked, "SUBMISSION_STATE_MISMATCH"):
            self.cas.submit(replace(base, anchor_sha256="e" * 64))
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_IDENTITY_MISMATCH"):
            self.cas.submit(replace(base, client_identity="unregistered-client"))
        wrong_host = replace(base.request, host_id="wrong-host")
        with self.assertRaisesRegex(BootGuardBlocked, "SUBMISSION_STATE_MISMATCH"):
            self.cas.submit(replace(base, request=wrong_host))
        wrong_install = replace(base.request, installation_id="wrong-install")
        with self.assertRaisesRegex(BootGuardBlocked, "SUBMISSION_STATE_MISMATCH"):
            self.cas.submit(replace(base, request=wrong_install))
        self.assertIsNone(self.cas.read_head(HOST, INSTALL, CLIENT))

    def test_rejects_noncanonical_corrupt_and_invalid_state(self):
        proposal = submission(initial())
        for raw in (b"", b"{", b'{"schema":"x"}',
                    proposal.state_bytes + b"\n",
                    proposal.state_bytes.replace(b'"epoch":1', b'"epoch":true'),
                    proposal.state_bytes + b" " * 17000):
            with self.subTest(raw=raw[:60]):
                with self.assertRaises(BootGuardBlocked):
                    self.cas.submit(replace(proposal, state_bytes=raw))
        self.assertIsNone(self.cas.read_head(HOST, INSTALL, CLIENT))

    def test_forbidden_release_transitions_and_registry_changes(self):
        self.cas.submit(submission(initial()))
        ready = next_state(initial())
        self.cas.submit(submission(ready))
        for phase in ("RELEASE_PENDING", "RELEASED", "FENCED", "INSTALLED_INACTIVE"):
            with self.subTest(phase=phase):
                with self.assertRaisesRegex(BootGuardBlocked, "LAB_TRANSITION_DENIED"):
                    self.cas.submit(submission(next_state(ready, phase)))
        changed_registry = replace(next_state(ready, "ARMING"),
                                   registry_sha256="e" * 64)
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_TRANSITION_DENIED"):
            self.cas.submit(submission(changed_registry))
        self.assertEqual(self.cas.read_head(HOST, INSTALL, CLIENT).phase, "READY_TO_ARM")

    def test_incident_can_be_recorded_but_never_released(self):
        self.cas.submit(submission(initial()))
        incident = next_state(initial(), "INCIDENT")
        self.cas.submit(submission(incident))
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_TRANSITION_DENIED"):
            self.cas.submit(submission(next_state(incident, "READY_TO_ARM")))

    def test_before_commit_interruption_leaves_no_commit_or_head(self):
        proposal = submission(initial())
        with self.assertRaisesRegex(BootGuardBlocked, "SYNTHETIC_BEFORE_COMMIT"):
            self.cas.submit(proposal, _test_interrupt="before_commit")
        self.assertIsNone(OfflineSqliteCas(self.path).read_head(HOST, INSTALL, CLIENT))
        self.assertIsNone(self.cas.lookup_commit(
            HOST, INSTALL, CLIENT, proposal.request.sha256()))
        self.cas.submit(proposal)
        self.assertEqual(self.cas.read_head(HOST, INSTALL, CLIENT).epoch, 1)

    def test_after_commit_lost_response_requires_lookup_not_resubmit(self):
        proposal = submission(initial())
        with self.assertRaisesRegex(BootGuardBlocked, "SYNTHETIC_OUTCOME_UNKNOWN"):
            self.cas.submit(proposal, _test_interrupt="after_commit")
        restarted = OfflineSqliteCas(self.path)
        self.assertEqual(restarted.read_head(HOST, INSTALL, CLIENT).epoch, 1)
        self.assertTrue(restarted.lookup_commit(
            HOST, INSTALL, CLIENT, proposal.request.sha256()).is_current_head)
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_CAS_CONFLICT"):
            restarted.submit(proposal)

    def test_uncertain_outcome_requires_independent_head_read(self):
        proposal = submission(initial())
        self.assertIsNone(self.cas.lookup_commit(
            HOST, INSTALL, CLIENT, proposal.request.sha256()))
        self.assertIsNone(self.cas.read_head(HOST, INSTALL, CLIENT))
        self.assertIsNone(self.cas.lookup_commit(
            HOST, INSTALL, CLIENT, "e" * 64))
        with self.assertRaises(BootGuardBlocked):
            self.cas.lookup_commit(HOST, INSTALL, CLIENT, "not-a-hash")

    def test_missing_database_never_auto_initialized(self):
        db = str(Path(self.directory.name) / "never-initialized.sqlite3")
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_DB_UNAVAILABLE"):
            OfflineSqliteCas(db).read_head(HOST, INSTALL, CLIENT)
        self.assertFalse(os.path.exists(db))

    def test_symlink_and_world_readable_storage_denied(self):
        alias = str(Path(self.directory.name) / "alias.sqlite3")
        os.symlink(self.path, alias)
        with self.assertRaisesRegex(BootGuardBlocked, "UNSAFE_LAB_DB"):
            OfflineSqliteCas(alias).read_head(HOST, INSTALL, CLIENT)
        os.chmod(self.path, 0o644)
        with self.assertRaisesRegex(BootGuardBlocked, "UNSAFE_LAB_DB"):
            self.cas.read_head(HOST, INSTALL, CLIENT)

    def test_corrupt_head_or_receipt_never_trusted(self):
        self.cas.submit(submission(initial()))
        with sqlite3.connect(self.path) as connection:
            connection.execute("UPDATE heads SET state_sha256=?", ("e" * 64,))
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_HEAD_CORRUPT"):
            self.cas.read_head(HOST, INSTALL, CLIENT)

    def test_tampered_receipt_is_rejected_on_read(self):
        proposal = submission(initial())
        self.cas.submit(proposal)
        with sqlite3.connect(self.path) as connection:
            connection.execute("UPDATE commits SET receipt_bytes=?", (b"forged",))
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_RECEIPT_CORRUPT"):
            self.cas.lookup_commit(HOST, INSTALL, CLIENT,
                                   proposal.request.sha256())

    def test_missing_audit_event_is_not_accepted_as_complete_history(self):
        self.cas.submit(submission(initial()))
        with sqlite3.connect(self.path) as connection:
            connection.execute("DELETE FROM audit_events")
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_HISTORY_INCOMPLETE"):
            self.cas.read_head(HOST, INSTALL, CLIENT)

    def test_database_config_mismatch_denied(self):
        with sqlite3.connect(self.path) as connection:
            connection.execute("PRAGMA user_version=99")
        with self.assertRaisesRegex(BootGuardBlocked, "LAB_SCHEMA_MISMATCH"):
            self.cas.read_head(HOST, INSTALL, CLIENT)

    def test_unprivileged_receipt_cannot_grant_p1_boot(self):
        receipt = self.cas.submit(submission(initial()))
        self.assertNotIn(b'"location":"OFF_HOST"', receipt.encode())
        outcome = evaluate_boot_candidate(
            observed_host_id=HOST, anchor=anchor(), state=initial(),
            request=submission(initial()).request, receipts=(receipt, receipt),
            off_host_available=True)
        self.assertEqual(outcome.decision, "DENY")
        self.assertFalse(outcome.authorized_to_start_docker)
        self.assertFalse(outcome.persistence_verified)
        self.assertFalse(outcome.off_host_cas_verified)

    def test_existing_release_source_manifest_untouched(self):
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/maintenance_off_host_cas_sqlite.py", SOURCE_FILES)
        self.assertNotIn("ops/runtime/maintenance_off_host_cas_contract.py", SOURCE_FILES)
        with self.assertRaisesRegex(BootGuardBlocked, "INVALID_TEST_INTERRUPT"):
            self.cas.submit(submission(initial()), _test_interrupt="unsupported")


if __name__ == "__main__":
    unittest.main()
