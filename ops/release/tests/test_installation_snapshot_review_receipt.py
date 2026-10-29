"""Durable snapshot review and non-secret index; disposable files and modeled host operations."""
import contextlib
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_snapshot_content as content
from release_contract import ReleaseContractError


class SnapshotReviewRetentionTests(unittest.TestCase):
    def setUp(self):
        self.flow = content.SnapshotContentOwnedFlowTests()
        self.flow.setUp()
        self.addCleanup(self.flow.doCleanups)
        self.base = self.flow.binding.base

    def observe(self):
        with patch.object(installer, "_review_installation_snapshot_content",
                side_effect=installer._retain_installation_snapshot_review):
            return self.flow.observe()[0]

    def record_path(self):
        return self.base.directory().parent / installer.SNAPSHOT_REVIEW_FILE

    def validate(self, raw=None, payload=None, receipt=None, originals=None):
        return installer._snapshot_review_value(self.record_path().read_bytes() if raw is None else raw,
            self.base.payload() if payload is None else payload, self.base.receipt() if receipt is None else receipt,
            *(self.base.originals() if originals is None else originals))

    def assert_preserved(self):
        self.flow.wait.assert_retained_fence()
        self.assertEqual(len(self.base.phase.actions), 6)

    def test_complete_owned_flow_creates_only_fixed_private_record_and_returns_no_install_or_offhost_authority(self):
        result = self.observe()
        reviewed = result["installationIntent"]["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_SNAPSHOT_REVIEW_RETAINED")
        self.assertEqual(reviewed["outcome"], "SNAPSHOT_REVIEW_RETAINED")
        self.assertTrue(reviewed["snapshotReviewDurable"])
        self.assertTrue(reviewed["offHostIndexGenerated"])
        self.assertFalse(reviewed["requiresDurableSnapshotReceipt"])
        self.assertTrue(reviewed["requiresOffHostRetention"])
        self.assertTrue(reviewed["requiresRecoveryValidation"])
        for key in ("offHostRetentionConfirmed", "snapshotAvailable", "recoveryReady", "canExecute", "restoreProven"):
            self.assertFalse(reviewed[key])
        self.assertFalse(result["readyToInstall"])
        self.assertEqual(set(p.name for p in self.record_path().parent.iterdir()),
            {"intent.json", "writers.json", "recovery", installer.SNAPSHOT_REVIEW_FILE})
        self.assertEqual(set(p.name for p in self.base.directory().iterdir()), installer.RECOVERY_FILES)
        self.assertEqual(self.record_path().stat().st_mode & 0o7777, 0o600)
        self.assertEqual(self.record_path().parent.stat().st_mode & 0o7777, 0o700)
        self.assertEqual(reviewed["snapshotReviewSha256"], installer._hash(self.record_path().read_bytes()))
        self.assertNotIn("ORIGINAL_TARGET_NOTE_NEVER_ECHO", json.dumps(result))
        self.assert_preserved()

    def test_record_preserves_exact_live_request_reply_times_and_recomputable_prewrite_result(self):
        self.observe()
        raw = self.record_path().read_bytes()
        value = self.validate(raw)
        self.assertEqual(installer._json(value), raw)
        reply = value["replyOriginal"].encode("ascii")
        self.assertEqual(installer._hash(reply), value["result"]["replySha256"])
        self.assertEqual(value["requestSentAt"], value["result"]["requestSentAt"])
        self.assertEqual(value["replyReceivedAt"], value["result"]["replyReceivedAt"])
        self.assertTrue(value["result"]["requiresDurableSnapshotReceipt"])
        self.assertFalse(value["result"]["recoveryReady"])

    def test_record_revalidation_needs_no_host_file_process_aws_or_persistence_access(self):
        self.observe()
        args = (self.record_path().read_bytes(), self.base.payload(), self.base.receipt(), *self.base.originals())
        with patch.object(installer.os, "open", side_effect=AssertionError("host file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("fsync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            value = installer._snapshot_review_value(*args)
        self.assertTrue(value["result"]["snapshotContentValidated"])

    def test_changed_result_request_material_bindings_or_original_reply_are_rejected(self):
        self.observe()
        original = json.loads(self.record_path().read_bytes())
        mutations = (
            lambda v: v["result"].update(canExecute=True),
            lambda v: v["result"].update(snapshotArn="another"),
            lambda v: v["request"].update(intentSha256="f" * 64),
            lambda v: v["request"].update(archiveSha256="f" * 64),
            lambda v: v["request"].update(receiptSha256="f" * 64),
            lambda v: v["request"].update(canExecute=True),
            lambda v: v["request"].update(maxWaitSeconds=True),
            lambda v: v["request"].update(extra=True),
            lambda v: v.update(installationId="f" * 64),
            lambda v: v.update(requestSentAt="2020-01-01T00:00:00Z"),
            lambda v: v.update(replyOriginal=v["replyOriginal"].replace("available", "pending", 1)),
        )
        for mutate in mutations:
            value = copy.deepcopy(original)
            mutate(value)
            with self.subTest(mutate=mutate), self.assertRaises(ReleaseContractError):
                self.validate(installer._json(value))

    def test_record_schema_size_canonical_bytes_and_duplicate_keys_are_strict(self):
        self.observe()
        raw = self.record_path().read_bytes()
        original = json.loads(raw)
        cases = [b"", b"{", b"\xff", raw + b" ", b"x" * (installer.MAX_SNAPSHOT_REVIEW_RECORD + 1),
                 raw.replace(b'"schemaVersion":1', b'"schemaVersion":NaN', 1),
                 raw.replace(b'{"installationId":', b'{"schemaVersion":1,"installationId":', 1)]
        cases += [installer._json({**original, key: wrong}) for key, wrong in (
            ("schemaVersion", True), ("kind", "other"), ("canExecute", True), ("replyOriginal", {}))]
        for value in cases:
            with self.subTest(size=len(value)), self.assertRaises(ReleaseContractError):
                self.validate(value)

    def test_changed_recovery_pair_intent_writers_or_identity_cannot_be_rebound_by_record(self):
        self.observe()
        intent, writers, identity = self.base.originals()
        cases = ({"payload": self.base.payload() + b"x"}, {"receipt": self.base.receipt() + b" "},
                 {"originals": (intent + b" ", writers, identity)},
                 {"originals": (intent, writers + b" ", identity)},
                 {"originals": (intent, writers, "f" * 64)})
        for kwargs in cases:
            with self.subTest(keys=list(kwargs)), self.assertRaises(ReleaseContractError):
                self.validate(**kwargs)

    def test_index_projects_exact_object_materials_and_record_digest_without_claiming_saved_offhost(self):
        reviewed = self.observe()["installationIntent"]["snapshotReview"]
        index = reviewed["offHostIndex"]
        value = self.validate()
        for key in ("installationId", "intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "challenge"):
            self.assertEqual(index[key], value["request"][key])
        for key in ("snapshotArn", "snapshotName", "accountId", "region", "targetStorageSha256", "evidenceSha256"):
            self.assertEqual(index[key], value["result"][key])
        self.assertEqual(index["snapshotReviewSha256"], installer._hash(self.record_path().read_bytes()))
        self.assertEqual(reviewed["offHostIndexSha256"], installer._hash(installer._json(index)))
        self.assertLessEqual(len(installer._json(index)), installer.MAX_INSTALL_RECORD)
        self.assertEqual(index["transactionPath"], "/opt/sanq/deploy-state/installation-runs/" + value["installationId"])
        for key in ("offHostRetentionConfirmed", "snapshotContainsFinalReview", "awsOriginAuthenticated",
                    "trustedTimeProven", "restoreProven", "snapshotAvailable", "recoveryReady", "canExecute"):
            self.assertFalse(index[key])
        for secret in ("MODEL_TOKEN=", "ORIGINAL_TARGET_NOTE_NEVER_ECHO", "replyOriginal", "commands", "publicHostKeyOriginal"):
            self.assertNotIn(secret, json.dumps(index))

    def test_original_locks_freeze_and_complete_recovery_pair_precede_snapshot_record_write(self):
        original = installer._snapshot_review_write
        writes = []
        def write(root, raw):
            self.base.phase.gate.assert_locks_held()
            self.assert_preserved()
            self.assertFalse(self.record_path().exists())
            self.validate(raw)
            writes.append(raw)
            return original(root, raw)
        with patch.object(installer, "_snapshot_review_write", side_effect=write):
            self.observe()
        self.assertEqual(writes, [self.record_path().read_bytes()])

    def test_prewrite_revalidation_rejects_tampered_generated_result_without_creating_record(self):
        original = installer._snapshot_review_bytes
        def invalid(*args, **kwargs):
            value = json.loads(original(*args, **kwargs))
            value["result"]["canExecute"] = True
            return installer._json(value)
        with patch.object(installer, "_snapshot_review_bytes", side_effect=invalid), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertFalse(self.record_path().exists())
        self.assert_preserved()

    def test_partial_record_write_keeps_pair_partial_file_fences_and_blocks_replay(self):
        def partial(root, raw):
            fd = os.open(installer.SNAPSHOT_REVIEW_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
            try:
                os.write(fd, raw[:19])
            finally:
                os.close(fd)
            raise OSError("modeled snapshot record interruption")
        with patch.object(installer, "_snapshot_review_write", side_effect=partial), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertEqual(self.record_path().stat().st_size, 19)
        self.assert_preserved()
        with patch.object(installer, "_snapshot_review_write", side_effect=AssertionError("replay")), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(len(self.base.phase.actions), 6)

    def test_storage_drift_after_record_write_preserves_complete_record_but_never_returns_success(self):
        original = installer._snapshot_review_write
        def drift(root, raw):
            original(root, raw)
            self.flow.binding.storage.mounts += b"13 11 0:99 / /srv/sanq/uploads rw - ext4 /dev/other rw\n"
        with patch.object(installer, "_snapshot_review_write", side_effect=drift), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue(self.record_path().exists())
        self.validate()
        self.assert_preserved()

    def test_owned_inventory_requires_explicit_original_record_proof_and_detects_replacement(self):
        self.observe()
        raw = self.record_path().read_bytes()
        intent, writers, identity = self.base.originals()
        recovery = ({"recovery.tar": self.base.payload(), "recovery.json": self.base.receipt()},
                    installer._directory_identity(self.base.directory().stat()))
        namespace = os.open(self.record_path().parent.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with self.assertRaises(ReleaseContractError):
                installer._installation_owned_run(namespace, identity, saved_writers=writers, recovery=recovery)
            self.assertEqual(installer._installation_owned_run(namespace, identity, saved_writers=writers,
                recovery=recovery, snapshot_review=raw), intent)
            self.record_path().write_bytes(raw + b" ")
            with self.assertRaises(ReleaseContractError):
                installer._installation_owned_run(namespace, identity, saved_writers=writers,
                    recovery=recovery, snapshot_review=raw)
        finally:
            os.close(namespace)

    def test_old_content_entry_keeps_memory_only_result_without_new_receipt_or_index(self):
        with patch.object(installer, "_snapshot_review_write", side_effect=AssertionError("record")):
            result, _ = self.flow.observe()
        self.assertFalse(self.record_path().exists())
        self.assertEqual(result["outcome"], "INSTALLATION_SNAPSHOT_CONTENT_VALIDATED")
        self.assertNotIn("offHostIndex", result["installationIntent"]["snapshotReview"])


class SnapshotReviewIoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.path.chmod(0o700)
        self.root = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, self.root)
        uid, gid = os.geteuid(), os.getegid()
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(installer, "PRIVATE_OWNER_UID", uid))
        stack.enter_context(patch.object(installer, "PRIVATE_GROUP_GID", gid))
        stack.enter_context(patch.object(installer.os, "geteuid", return_value=0))
        stack.enter_context(patch.object(installer.os, "fstatvfs",
            return_value=SimpleNamespace(f_bavail=8 * 1024**3, f_frsize=1)))
        self.raw = b'{"inert":"low-level IO fixture, not a validated review"}\n'

    def test_actual_partial_writes_fsync_file_then_directory_and_exact_readback(self):
        write, fsync = os.write, os.fsync
        synced = []
        def sync(fd):
            synced.append(fd)
            return fsync(fd)
        with patch.object(installer.os, "write", side_effect=lambda fd, raw: write(fd, raw[:7])), \
             patch.object(installer.os, "fsync", side_effect=sync):
            installer._snapshot_review_write(self.root, self.raw)
        self.assertEqual(installer._snapshot_review_read(self.root), self.raw)
        self.assertEqual(synced[-1], self.root)
        self.assertNotEqual(synced[0], self.root)

    def test_create_only_never_overwrites_existing_symlink_or_regular_file(self):
        target = self.path / "original"
        target.write_bytes(b"preserve")
        leaf = self.path / installer.SNAPSHOT_REVIEW_FILE
        leaf.symlink_to(target)
        with self.assertRaises(FileExistsError):
            installer._snapshot_review_write(self.root, self.raw)
        self.assertEqual(target.read_bytes(), b"preserve")
        leaf.unlink()
        leaf.write_bytes(b"existing")
        leaf.chmod(0o600)
        with self.assertRaises(FileExistsError):
            installer._snapshot_review_write(self.root, self.raw)
        self.assertEqual(leaf.read_bytes(), b"existing")

    def test_zero_write_and_sync_failure_preserve_unknown_evidence(self):
        with patch.object(installer.os, "write", return_value=0), self.assertRaises(ReleaseContractError):
            installer._snapshot_review_write(self.root, self.raw)
        leaf = self.path / installer.SNAPSHOT_REVIEW_FILE
        self.assertTrue(leaf.exists())
        self.assertEqual(leaf.stat().st_size, 0)
        leaf.unlink()
        with patch.object(installer.os, "fsync", side_effect=OSError("modeled fsync")), self.assertRaises(OSError):
            installer._snapshot_review_write(self.root, self.raw)
        self.assertEqual(leaf.read_bytes(), self.raw)

    def test_readback_mismatch_and_late_change_are_not_reported_as_durable(self):
        leaf = self.path / installer.SNAPSHOT_REVIEW_FILE
        with patch.object(installer, "_snapshot_review_read", return_value=b"wrong"), \
             self.assertRaises(ReleaseContractError):
            installer._snapshot_review_write(self.root, self.raw)
        self.assertEqual(leaf.read_bytes(), self.raw)
        leaf.unlink()
        read = installer._snapshot_review_read
        def changed(root):
            value = read(root)
            leaf.write_bytes(b"changed")
            return value
        with patch.object(installer, "_snapshot_review_read", side_effect=changed), self.assertRaises(ReleaseContractError):
            installer._snapshot_review_write(self.root, self.raw)
        self.assertEqual(leaf.read_bytes(), b"changed")

    def test_reader_rejects_wrong_mode_links_type_size_and_over_budget(self):
        leaf = self.path / installer.SNAPSHOT_REVIEW_FILE
        leaf.write_bytes(self.raw)
        leaf.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            installer._snapshot_review_read(self.root)
        leaf.chmod(0o600)
        link = self.path / "link"
        os.link(leaf, link)
        with self.assertRaises(ReleaseContractError):
            installer._snapshot_review_read(self.root)
        link.unlink()
        for raw in (b"", b"x" * (installer.MAX_SNAPSHOT_REVIEW_RECORD + 1)):
            leaf.write_bytes(raw)
            with self.assertRaises(ReleaseContractError):
                installer._snapshot_review_read(self.root)
        leaf.unlink()
        leaf.mkdir()
        with self.assertRaises(ReleaseContractError):
            installer._snapshot_review_read(self.root)

    def test_invalid_write_inputs_privilege_and_disk_reserve_fail_before_creation(self):
        for raw in (b"", "string", b"x" * (installer.MAX_SNAPSHOT_REVIEW_RECORD + 1)):
            with self.assertRaises(ReleaseContractError):
                installer._snapshot_review_write(self.root, raw)
        with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            installer._snapshot_review_write(self.root, self.raw)
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=0, f_frsize=1)), \
             self.assertRaises(ReleaseContractError):
            installer._snapshot_review_write(self.root, self.raw)
        self.assertFalse((self.path / installer.SNAPSHOT_REVIEW_FILE).exists())

    def test_stage_cannot_be_enabled_without_bound_live_flow_and_no_public_cli_is_added(self):
        with patch.object(installer, "_private_session", side_effect=AssertionError("host IO")):
            for flag in (True, 1):
                with self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("a" * 64, _retain_snapshot_review=flag)
        for command in ("snapshot-review", "snapshot-retain", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])
