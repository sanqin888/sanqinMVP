"""VM acknowledgement continuation: original locks, real pipes/files and modeled host operations."""
import json
import os
import tempfile
import threading
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_snapshot_review_receipt as receipt
import test_installation_snapshot_wait as wait
import test_installation_offhost_index_receiver as receiver
from release_contract import ReleaseContractError


class OffhostConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.client_uid = os.geteuid()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.client_dir = Path(self.temp.name).resolve()
        self.client_dir.chmod(0o700)
        self.base = receipt.SnapshotReviewRetentionTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.retention = self.base.base
        self.transfers, self.acks = [], []

    def path(self):
        return self.base.record_path().parent / installer.SNAPSHOT_OFFHOST_FILE

    def client(self, transfer, *fds, deadline=None, _request_sent=None):
        self.retention.phase.gate.assert_locks_held()
        self.base.assert_preserved()
        self.assertTrue(self.base.record_path().exists())
        self.assertFalse(self.path().exists())
        if _request_sent is not None:
            _request_sent()
        request = installer._snapshot_index_transfer_value(transfer)
        target = self.base.flow.binding.storage.target
        expected = {key: target[key] for key in ("accountId", "region", "instanceArn", "instanceName")}
        expected.update(installationId=self.retention.originals()[2],
                        snapshotReviewSha256=installer._hash(self.base.record_path().read_bytes()))
        # The VM is blocked reading the peer; restore its modeled root identity before sending ack.
        with patch.object(installer.os, "geteuid", return_value=self.client_uid):
            ack = installer._retain_snapshot_index_offhost(transfer, str(self.client_dir),
                expected=expected, operator_confirmed_off_host=True)
        self.transfers.append(transfer)
        self.acks.append(ack)
        return ack

    def observe(self, exchange=None, *, real_transport=False, first_exchange=None):
        with patch.object(installer, "_retain_installation_snapshot_review",
                side_effect=installer._confirm_installation_offhost_index):
            if real_transport:
                return self.base.observe(exchange=first_exchange)
            with patch.object(installer, "_installation_snapshot_index_exchange",
                    side_effect=self.client if exchange is None else exchange):
                return self.base.observe(exchange=first_exchange)

    def validate(self, raw=None, review=None):
        return installer._snapshot_offhost_record_value(self.path().read_bytes() if raw is None else raw,
            self.base.record_path().read_bytes() if review is None else review,
            self.retention.payload(), self.retention.receipt(), *self.retention.originals())

    def assert_preserved(self):
        self.base.assert_preserved()
        self.assertTrue(self.base.record_path().exists())

    def test_owned_flow_confirms_only_after_client_save_vm_receipt_and_final_rechecks(self):
        result = self.observe()
        facts = result["installationIntent"]["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_OFFHOST_INDEX_CONFIRMED")
        self.assertEqual(facts["outcome"], "OFFHOST_INDEX_CONFIRMED")
        self.assertTrue(facts["snapshotReviewDurable"])
        self.assertTrue(facts["offHostReceiptDurable"])
        self.assertTrue(facts["offHostRetentionConfirmed"])
        self.assertFalse(facts["requiresOffHostRetention"])
        self.assertEqual(facts["offHostVerificationMethod"], "operator-ssh-peer-durable-receipt")
        for key in ("offHostLocationIndependentlyAuthenticated", "snapshotAvailable", "recoveryReady", "canExecute", "restoreProven"):
            self.assertFalse(facts[key])
        self.assertFalse(result["readyToInstall"])
        self.assertFalse(facts["offHostIndex"]["offHostRetentionConfirmed"])
        self.assertEqual(self.path().stat().st_mode & 0o7777, 0o600)
        self.assertEqual(set(p.name for p in self.path().parent.iterdir()),
            {"intent.json", "writers.json", "recovery", installer.SNAPSHOT_REVIEW_FILE, installer.SNAPSHOT_OFFHOST_FILE})
        self.assertEqual(facts["offHostReceiptSha256"], installer._hash(self.path().read_bytes()))
        self.assertEqual(len(self.transfers), 1)
        self.assertEqual(len(list(self.client_dir.iterdir())), 1)
        self.assert_preserved()

    def test_real_two_frame_pipe_flow_retains_actual_client_index_and_restores_borrowed_fd_flags(self):
        def peer(sender, receiver_fd, respond=None):
            requests = []
            def work():
                try:
                    for stage in range(2):
                        raw = bytearray()
                        while not raw.endswith(b"\n"):
                            block = os.read(receiver_fd, 4096)
                            if not block:
                                return
                            raw.extend(block)
                            if len(raw) > installer.MAX_SNAPSHOT_INDEX_TRANSFER:
                                raise AssertionError("oversized frame")
                        request = json.loads(raw)
                        requests.append(request)
                        response = respond(request) if stage == 0 else self.client(bytes(raw))
                        remaining = memoryview(response)
                        while remaining:
                            count = os.write(sender, remaining[:73])
                            remaining = remaining[count:]
                except BaseException as error:
                    self.base.flow.wait.errors.append(error)
                    os.close(sender)
            thread = threading.Thread(target=work, daemon=True)
            thread.start()
            return thread, requests
        original = installer._installation_snapshot_index_exchange
        checked = []
        def exchange(transfer, incoming, outgoing, **kwargs):
            flags = [installer.fcntl.fcntl(fd, installer.fcntl.F_GETFL) for fd in (incoming, outgoing)]
            raw = original(transfer, incoming, outgoing, **kwargs)
            self.assertEqual(flags, [installer.fcntl.fcntl(fd, installer.fcntl.F_GETFL) for fd in (incoming, outgoing)])
            checked.append(True)
            return raw
        with patch.object(self.base.flow.wait, "peer", side_effect=peer), \
             patch.object(installer, "_installation_snapshot_index_exchange", side_effect=exchange):
            result = self.observe(real_transport=True)
        self.assertEqual(checked, [True])
        self.assertTrue(result["installationIntent"]["snapshotReview"]["offHostRetentionConfirmed"])
        value = self.validate()
        self.assertEqual(value["transferOriginal"].encode(), self.transfers[0])
        self.assertEqual(value["ackOriginal"].encode(), self.acks[0])

    def test_receipt_revalidation_recomputes_all_data_without_host_io_commands_or_aws(self):
        self.observe()
        args = (self.path().read_bytes(), self.base.record_path().read_bytes(), self.retention.payload(),
                self.retention.receipt(), *self.retention.originals())
        with patch.object(installer.os, "open", side_effect=AssertionError("host file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("fsync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            self.assertEqual(installer._snapshot_offhost_record_value(*args)["verificationMethod"],
                "operator-ssh-peer-durable-receipt")

    def test_receipt_schema_canonical_size_flags_review_hash_and_time_are_strict(self):
        self.observe()
        original = json.loads(self.path().read_bytes())
        for key, wrong in (("schemaVersion", True), ("kind", "other"), ("installationId", "f" * 64),
                           ("snapshotReviewSha256", "f" * 64), ("verificationMethod", "cloud-authenticated"),
                           ("offHostLocationIndependentlyAuthenticated", True), ("canExecute", True),
                           ("recoveryReady", True), ("extra", True), ("requestSentAt", "2020-01-01T00:00:00.000000Z"),
                           ("replyReceivedAt", "2020-01-01T00:00:00.000000Z"), ("ackOriginal", {})):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.validate(installer._json({**original, key: wrong}))
        raw = self.path().read_bytes()
        for wrong in (b"", b"{", b"\xff", raw + b" ", b"x" * (installer.MAX_SNAPSHOT_OFFHOST_RECORD + 1),
                      raw.replace(b'"schemaVersion":1', b'"schemaVersion":NaN', 1)):
            with self.assertRaises(ReleaseContractError):
                self.validate(wrong)
        with self.assertRaises(ReleaseContractError):
            self.validate(review=self.base.record_path().read_bytes() + b" ")

    def test_self_consistent_transfer_index_hash_change_cannot_replace_original_durable_review(self):
        self.observe()
        value = json.loads(self.path().read_bytes())
        transfer = json.loads(value["transferOriginal"])
        transfer["index"]["targetInputSha256"] = "f" * 64
        transfer["indexSha256"] = installer._hash(installer._json(transfer["index"]))
        transfer["indexBytes"] = len(installer._json(transfer["index"]))
        ack = json.loads(value["ackOriginal"])
        ack.update(indexSha256=transfer["indexSha256"], indexBytes=transfer["indexBytes"])
        value.update(transferOriginal=installer._json(transfer).decode(), ackOriginal=installer._json(ack).decode())
        with self.assertRaises(ReleaseContractError):
            self.validate(installer._json(value))

    def test_wrong_ack_or_nonce_after_client_save_keeps_vm_review_without_confirmation_record(self):
        def wrong(transfer, *fds, **kwargs):
            value = json.loads(self.client(transfer, *fds, **kwargs))
            value["transferChallenge"] = "f" * 64
            return installer._json(value)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(wrong)
        self.assertFalse(self.path().exists())
        self.assertEqual(len(list(self.client_dir.iterdir())), 1)
        self.assert_preserved()

    def test_eof_after_vm_review_keeps_originals_and_cannot_replay(self):
        def ended(*args, **kwargs):
            raise ReleaseContractError("modeled EOF")
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(ended)
        self.assertFalse(self.path().exists())
        self.assert_preserved()
        with self.assertRaises(ReleaseContractError):
            self.observe(first_exchange=lambda *args, **kwargs: self.fail("replayed first wait"))
        self.assertEqual(len(self.retention.phase.actions), 6)

    def test_missing_complete_transfer_output_observation_is_not_confirmed(self):
        def missing(transfer, *fds, **kwargs):
            kwargs.pop("_request_sent")
            return self.client(transfer, *fds, **kwargs)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(missing)
        self.assertFalse(self.path().exists())
        self.assert_preserved()

    def test_channel_replacement_during_second_wait_is_not_adopted(self):
        def changed(transfer, incoming, outgoing, **kwargs):
            ack = self.client(transfer, incoming, outgoing, **kwargs)
            replacement, sender = os.pipe()
            try:
                os.dup2(replacement, incoming)
            finally:
                os.close(replacement)
                os.close(sender)
            return ack
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(changed)
        self.assertFalse(self.path().exists())
        self.assert_preserved()

    def test_storage_drift_after_ack_blocks_confirmation_write(self):
        def changed(transfer, *fds, **kwargs):
            ack = self.client(transfer, *fds, **kwargs)
            self.base.flow.binding.storage.mounts += b"13 11 0:99 / /srv/sanq/uploads rw - ext4 /dev/other rw\n"
            return ack
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(changed)
        self.assertFalse(self.path().exists())
        self.assert_preserved()

    def test_original_review_tampering_after_ack_is_caught_by_owned_check_before_confirmation(self):
        def changed(transfer, *fds, **kwargs):
            ack = self.client(transfer, *fds, **kwargs)
            self.base.record_path().write_bytes(self.base.record_path().read_bytes() + b" ")
            return ack
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(changed)
        self.assertFalse(self.path().exists())
        self.assert_preserved()

    def test_second_wait_gets_fresh_postwait_budget_instead_of_reusing_old_deadline(self):
        clock = [100.0]
        budgets = []
        original = installer._host_filesystem_snapshot
        def filesystem(**kwargs):
            budgets.append(kwargs["deadline"])
            return original(**kwargs)
        def delayed(transfer, *fds, **kwargs):
            clock[0] += 1000
            return self.client(transfer, *fds, **kwargs)
        def first(request, *fds, **kwargs):
            kwargs["_request_sent"]()
            return self.base.flow.reply(request)
        with patch.object(installer.time, "monotonic", side_effect=lambda: clock[0]), \
             patch.object(installer, "_host_filesystem_snapshot", side_effect=filesystem):
            result = self.observe(delayed, first_exchange=first)
        self.assertTrue(result["installationIntent"]["snapshotReview"]["offHostReceiptDurable"])
        self.assertIn(400.0, budgets)
        self.assertIn(1400.0, budgets)

    def test_vm_receipt_write_occurs_with_locks_review_and_recovery_pair_already_durable(self):
        write = installer._snapshot_offhost_record_write
        events = []
        def checked(root, raw):
            self.retention.phase.gate.assert_locks_held()
            self.assert_preserved()
            self.assertFalse(self.path().exists())
            self.validate(raw)
            events.append(raw)
            return write(root, raw)
        with patch.object(installer, "_snapshot_offhost_record_write", side_effect=checked):
            self.observe()
        self.assertEqual(events, [self.path().read_bytes()])

    def test_partial_confirmation_write_is_preserved_with_both_original_recovery_records(self):
        def partial(root, raw):
            fd = os.open(installer.SNAPSHOT_OFFHOST_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
            try:
                os.write(fd, raw[:17])
            finally:
                os.close(fd)
            raise OSError("modeled receipt interruption")
        with patch.object(installer, "_snapshot_offhost_record_write", side_effect=partial), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(self.path().stat().st_size, 17)
        self.assert_preserved()

    def test_post_save_drift_preserves_complete_confirmation_but_never_returns_success(self):
        write = installer._snapshot_offhost_record_write
        def drift(root, raw):
            write(root, raw)
            self.base.flow.binding.storage.mounts += b"13 11 0:99 / /srv/sanq/uploads rw - ext4 /dev/other rw\n"
        with patch.object(installer, "_snapshot_offhost_record_write", side_effect=drift), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.validate()
        self.assert_preserved()

    def test_owned_inventory_requires_original_confirmation_bytes_and_detects_late_tampering(self):
        self.observe()
        intent, writers, identity = self.retention.originals()
        recovery = ({"recovery.tar": self.retention.payload(), "recovery.json": self.retention.receipt()},
                    installer._directory_identity(self.retention.directory().stat()))
        review = self.base.record_path().read_bytes()
        raw = self.path().read_bytes()
        namespace = os.open(self.path().parent.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with self.assertRaises(ReleaseContractError):
                installer._installation_owned_run(namespace, identity, saved_writers=writers,
                    recovery=recovery, snapshot_review=review)
            self.assertEqual(installer._installation_owned_run(namespace, identity, saved_writers=writers,
                recovery=recovery, snapshot_review=review, snapshot_offhost=raw), intent)
            self.path().write_bytes(raw + b" ")
            with self.assertRaises(ReleaseContractError):
                installer._installation_owned_run(namespace, identity, saved_writers=writers,
                    recovery=recovery, snapshot_review=review, snapshot_offhost=raw)
        finally:
            os.close(namespace)

    def test_old_vm_review_entry_never_waits_for_ack_or_writes_confirmation(self):
        with patch.object(installer, "_installation_snapshot_index_exchange", side_effect=AssertionError("second wait")), \
             patch.object(installer, "_snapshot_offhost_record_write", side_effect=AssertionError("confirmation")):
            result = self.base.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_SNAPSHOT_REVIEW_RETAINED")
        self.assertFalse(self.path().exists())


class OffhostConfirmationIoTests(unittest.TestCase):
    def setUp(self):
        fixture = receipt.SnapshotReviewIoTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.path, self.root, self.raw = fixture.path, fixture.root, fixture.raw

    def test_offhost_write_short_writes_readback_and_create_only_behavior(self):
        write = os.write
        with patch.object(installer.os, "write", side_effect=lambda fd, raw: write(fd, raw[:7])):
            installer._snapshot_offhost_record_write(self.root, self.raw)
        self.assertEqual(installer._snapshot_offhost_record_read(self.root), self.raw)
        with self.assertRaises(FileExistsError):
            installer._snapshot_offhost_record_write(self.root, self.raw)

    def test_offhost_zero_sync_readback_failure_never_deletes_evidence(self):
        leaf = self.path / installer.SNAPSHOT_OFFHOST_FILE
        with patch.object(installer.os, "write", return_value=0), self.assertRaises(ReleaseContractError):
            installer._snapshot_offhost_record_write(self.root, self.raw)
        self.assertEqual(leaf.stat().st_size, 0)
        leaf.unlink()
        with patch.object(installer.os, "fsync", side_effect=OSError("modeled sync")), self.assertRaises(OSError):
            installer._snapshot_offhost_record_write(self.root, self.raw)
        self.assertEqual(leaf.read_bytes(), self.raw)
        leaf.unlink()
        with patch.object(installer, "_snapshot_offhost_record_read", return_value=b"wrong"), self.assertRaises(ReleaseContractError):
            installer._snapshot_offhost_record_write(self.root, self.raw)
        self.assertEqual(leaf.read_bytes(), self.raw)

    def test_offhost_reader_and_writer_enforce_native_bytes_budget_metadata_and_privilege(self):
        leaf = self.path / installer.SNAPSHOT_OFFHOST_FILE
        for raw in (b"", "string", b"x" * (installer.MAX_SNAPSHOT_OFFHOST_RECORD + 1)):
            with self.assertRaises(ReleaseContractError):
                installer._snapshot_offhost_record_write(self.root, raw)
        with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            installer._snapshot_offhost_record_write(self.root, self.raw)
        leaf.write_bytes(self.raw)
        leaf.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            installer._snapshot_offhost_record_read(self.root)
        leaf.chmod(0o600)
        linked = self.path / "linked"
        os.link(leaf, linked)
        with self.assertRaises(ReleaseContractError):
            installer._snapshot_offhost_record_read(self.root)

    def test_actual_second_transport_timeout_restores_borrowed_descriptors(self):
        channel = wait.InstallationSnapshotWaitTests()
        self.addCleanup(channel.doCleanups)
        incoming, sender, receiver_fd, outgoing = channel.pipes()
        flags = [installer.fcntl.fcntl(fd, installer.fcntl.F_GETFL) for fd in (incoming, outgoing)]
        transfer = installer._snapshot_index_transfer(receiver.index_fixture())
        with self.assertRaisesRegex(ReleaseContractError, "timed out"):
            installer._installation_snapshot_index_exchange(transfer, incoming, outgoing,
                deadline=installer.time.monotonic() + 0.05)
        self.assertEqual(flags, [installer.fcntl.fcntl(fd, installer.fcntl.F_GETFL) for fd in (incoming, outgoing)])
        self.assertTrue(all(os.fstat(fd) for fd in (incoming, outgoing)))

    def test_strict_switch_and_transport_limit_cannot_be_used_as_a_public_install_entry(self):
        with patch.object(installer, "_private_session", side_effect=AssertionError("host")):
            for flag in (True, 1):
                with self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("a" * 64, _confirm_offhost_index=flag)
        channel = wait.InstallationSnapshotWaitTests()
        self.addCleanup(channel.doCleanups)
        incoming, sender, receiver_fd, outgoing = channel.pipes()
        for limit in (True, 0, 1000000):
            with self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_exchange({}, incoming, outgoing,
                    deadline=installer.time.monotonic() + 1, _request_limit=limit)
        for command in ("offhost-confirm", "snapshot-resume", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])
