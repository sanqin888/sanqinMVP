"""Off-host index client: strict data, real disposable files, no VM install or AWS calls."""
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
import test_installation_snapshot_review_receipt as receipt
from release_contract import ReleaseContractError


def index_fixture():
    index = {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-offhost-index",
        "installationId": "1" * 64, "retentionId": "2" * 64, "challenge": "3" * 64,
        "targetSourceSha": "a" * 40, "installedRuntimeSourceSha": "b" * 40,
        "snapshotReviewBytes": 4096, "accountId": "123456789012", "region": "ca-central-1",
        "fromInstanceArn": "arn:aws:lightsail:ca-central-1:123456789012:Instance/12345678-1234-1234-1234-123456789012",
        "fromInstanceName": "sanq-production",
        "snapshotArn": "arn:aws:lightsail:ca-central-1:123456789012:InstanceSnapshot/87654321-4321-4321-4321-210987654321",
        "snapshotName": "sanq-runtime-" + "3" * 64, "sourceAvailabilityZone": "ca-central-1a",
        "snapshotAvailabilityZone": "all", "createdAt": "2026-10-29T10:00:02.000000Z",
        "availableObservedAt": "2026-10-29T10:00:03.000000Z",
        "transactionPath": "/opt/sanq/deploy-state/installation-runs/" + "1" * 64,
        "retentionPath": "/opt/sanq/deploy-state/installations/" + "2" * 64,
        "snapshotReviewFile": "snapshot-review.json", "recoveryFiles": ["recovery.json", "recovery.tar"],
        "requiresOffHostRetention": True}
    for number, key in enumerate(("intentSha256", "writersSha256", "archiveSha256", "receiptSha256",
            "requestSha256", "replySha256", "evidenceSha256", "targetInputSha256", "targetStorageSha256", "snapshotReviewSha256")):
        index[key] = format(number + 1, "x") * 64
    for key in ("offHostRetentionConfirmed", "snapshotContainsFinalReview", "awsOriginAuthenticated", "trustedTimeProven",
                "restoreProven", "snapshotAvailable", "recoveryReady", "canExecute"):
        index[key] = False
    return index


def expected_context(index):
    return {key: index[source] for key, source in (
        ("accountId", "accountId"), ("region", "region"), ("instanceArn", "fromInstanceArn"),
        ("instanceName", "fromInstanceName"), ("installationId", "installationId"),
        ("snapshotReviewSha256", "snapshotReviewSha256"))}


class OffhostIndexDataTests(unittest.TestCase):
    def setUp(self):
        self.index = index_fixture()
        self.transfer = installer._snapshot_index_transfer(self.index)

    def test_generated_transfer_preserves_canonical_index_and_fresh_independent_nonce(self):
        first = installer._snapshot_index_transfer_value(self.transfer)
        second = installer._snapshot_index_transfer_value(installer._snapshot_index_transfer(self.index))
        self.assertNotEqual(first["transferChallenge"], second["transferChallenge"])
        self.assertNotEqual(first["transferChallenge"], self.index["challenge"])
        self.assertEqual(first["index"], self.index)
        self.assertEqual(first["indexSha256"], installer._hash(installer._json(self.index)))
        self.assertEqual(first["indexBytes"], len(installer._json(self.index)))
        self.assertLessEqual(len(self.transfer), installer.MAX_SNAPSHOT_INDEX_TRANSFER)

    def test_every_index_field_is_required_and_null_is_never_a_default(self):
        for key in self.index:
            for remove in (True, False):
                value = copy.deepcopy(self.index)
                if remove:
                    del value[key]
                else:
                    value[key] = None
                with self.subTest(key=key, remove=remove), self.assertRaises(ReleaseContractError):
                    installer._snapshot_offhost_index_value(installer._json(value))

    def test_unknown_metadata_secrets_and_authority_fields_are_rejected(self):
        for key, wrong in (("extra", "SECRET_NEVER_ACCEPT"), ("schemaVersion", True), ("canExecute", 0),
                           ("offHostRetentionConfirmed", True), ("requiresOffHostRetention", 1),
                           ("snapshotAvailable", True), ("recoveryReady", True), ("restoreProven", True)):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._snapshot_offhost_index_value(installer._json({**self.index, key: wrong}))

    def test_exact_hash_lengths_native_sizes_source_commits_and_safe_paths_are_required(self):
        for key, wrong in (("intentSha256", "f" * 63), ("snapshotReviewSha256", "Z" * 64),
                           ("targetSourceSha", "a" * 64), ("installationId", True), ("snapshotReviewBytes", True),
                           ("snapshotReviewBytes", installer.MAX_SNAPSHOT_REVIEW_RECORD + 1),
                           ("transactionPath", "/tmp/from-server"), ("retentionPath", "../escape"),
                           ("snapshotReviewFile", "other.json"), ("recoveryFiles", ["recovery.tar"])):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._snapshot_offhost_index_value(installer._json({**self.index, key: wrong}))

    def test_arn_account_region_source_zone_full_challenge_and_time_order_must_agree(self):
        for key, wrong in (("snapshotArn", self.index["snapshotArn"].replace("123456789012", "999999999999")),
                           ("fromInstanceArn", self.index["fromInstanceArn"].replace("Instance/", "Disk/")),
                           ("snapshotName", self.index["snapshotName"][:-1]), ("accountId", 123456789012),
                           ("sourceAvailabilityZone", "all"), ("snapshotAvailabilityZone", "ca-central-1b"),
                           ("createdAt", "2026-10-29T06:00:02-04:00"),
                           ("createdAt", "2026-10-29T10:00:04.000000Z")):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._snapshot_offhost_index_value(installer._json({**self.index, key: wrong}))
        self.assertEqual(installer._snapshot_offhost_index_value(
            installer._json({**self.index, "snapshotAvailabilityZone": "ca-central-1a"}))["sourceAvailabilityZone"], "ca-central-1a")

    def test_index_and_transfer_size_duplicate_keys_bad_encoding_and_canonical_bytes_are_strict(self):
        raw = installer._json(self.index)
        cases = (b"", b"{", b"\xff", raw + b" ", b"x" * (installer.MAX_INSTALL_RECORD + 1),
                 raw.replace(b'"schemaVersion":1', b'"schemaVersion":NaN'),
                 raw.replace(b'{"accountId":', b'{"schemaVersion":1,"accountId":', 1))
        for value in cases:
            with self.subTest(size=len(value)), self.assertRaises(ReleaseContractError):
                installer._snapshot_offhost_index_value(value)
        for value in (b"", b"{", self.transfer + b" ", b"x" * (installer.MAX_SNAPSHOT_INDEX_TRANSFER + 1)):
            with self.assertRaises(ReleaseContractError):
                installer._snapshot_index_transfer_value(value)

    def test_transfer_schema_hash_byte_count_and_nonce_cannot_be_replaced(self):
        original = json.loads(self.transfer)
        for key, wrong in (("schemaVersion", True), ("kind", "other"), ("indexSha256", "f" * 64),
                           ("indexBytes", True), ("transferChallenge", "old"), ("canExecute", True), ("index", {})):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._snapshot_index_transfer_value(installer._json({**original, key: wrong}))

    def test_data_validation_does_not_open_files_spawn_processes_or_write_anything(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("file")), \
             patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            self.assertEqual(installer._snapshot_index_transfer_value(self.transfer)["index"], self.index)


class OffhostIndexClientTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name).resolve()
        self.directory.chmod(0o700)
        self.index = index_fixture()
        self.transfer = installer._snapshot_index_transfer(self.index)
        self.expected = expected_context(self.index)
        self.file = self.directory / ("snapshot-index-" + self.index["installationId"] + ".json")

    def retain(self, transfer=None, directory=None, expected=None, confirmed=True):
        return installer._retain_snapshot_index_offhost(self.transfer if transfer is None else transfer,
            str(self.directory) if directory is None else directory,
            expected=self.expected if expected is None else expected, operator_confirmed_off_host=confirmed)

    def test_unprivileged_client_writes_exact_private_index_before_returning_bound_ack(self):
        ack = self.retain()
        value = installer._snapshot_index_ack_value(ack, self.transfer)
        self.assertEqual(self.file.read_bytes(), installer._json(self.index))
        self.assertEqual(self.file.stat().st_mode & 0o7777, 0o600)
        self.assertEqual(self.file.stat().st_uid, os.geteuid())
        self.assertEqual(set(self.directory.iterdir()), {self.file})
        self.assertTrue(value["clientIndexDurable"])
        self.assertTrue(value["operatorConfirmedOffHost"])
        self.assertFalse(value["canExecute"])
        self.assertFalse(value["recoveryReady"])
        self.assertFalse(self.index["offHostRetentionConfirmed"])
        self.assertNotIn(str(self.directory), ack.decode())

    def test_each_independent_context_field_is_required_and_compared_before_io(self):
        for key in self.expected:
            for wrong in ("other", None):
                expected = {**self.expected, key: wrong}
                with self.subTest(key=key), patch.object(installer.os, "open", side_effect=AssertionError("write")), \
                     self.assertRaises(ReleaseContractError):
                    self.retain(expected=expected)
            expected = {k: v for k, v in self.expected.items() if k != key}
            with self.assertRaises(ReleaseContractError):
                self.retain(expected=expected)
        self.assertFalse(self.file.exists())

    def test_root_unsupported_platform_or_non_native_offhost_confirmation_never_opens_destination(self):
        for confirmed in (False, 1, "yes"):
            with patch.object(installer.os, "open", side_effect=AssertionError("file")), self.assertRaises(ReleaseContractError):
                self.retain(confirmed=confirmed)
        with patch.object(installer.os, "geteuid", return_value=0), self.assertRaises(ReleaseContractError):
            self.retain()
        with patch.object(installer.sys, "platform", "win32"), self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.file.exists())

    def test_actual_short_writes_finish_and_file_directory_sync_precede_ack(self):
        write, fsync = os.write, os.fsync
        syncs = []
        def sync(fd):
            syncs.append(os.fstat(fd).st_mode)
            return fsync(fd)
        with patch.object(installer.os, "write", side_effect=lambda fd, raw: write(fd, raw[:11])), \
             patch.object(installer.os, "fsync", side_effect=sync):
            ack = self.retain()
        self.assertTrue(installer._snapshot_index_ack_value(ack, self.transfer)["clientIndexDurable"])
        self.assertEqual(len(syncs), 2)
        self.assertTrue(installer.stat.S_ISREG(syncs[0]))
        self.assertTrue(installer.stat.S_ISDIR(syncs[1]))

    def test_existing_regular_file_symlink_and_same_round_retry_are_never_overwritten(self):
        original = self.directory / "preserved"
        original.write_bytes(b"original")
        self.file.symlink_to(original)
        with self.assertRaises(FileExistsError):
            self.retain()
        self.assertEqual(original.read_bytes(), b"original")
        self.file.unlink()
        self.file.write_bytes(b"existing")
        self.file.chmod(0o600)
        with self.assertRaises(FileExistsError):
            self.retain()
        self.assertEqual(self.file.read_bytes(), b"existing")
        self.file.unlink()
        self.retain()
        saved = self.file.read_bytes()
        with self.assertRaises(FileExistsError):
            self.retain(transfer=installer._snapshot_index_transfer(self.index))
        self.assertEqual(self.file.read_bytes(), saved)

    def test_unsafe_directory_modes_relative_dotdot_and_production_paths_are_blocked(self):
        for directory in ("relative", str(self.directory) + "/../escape", str(self.directory) + "/",
                          "/opt/sanq", "/srv/sanq/uploads", "/etc", "/run"):
            with self.subTest(directory=directory), self.assertRaises(ReleaseContractError):
                self.retain(directory=directory)
        self.directory.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.file.exists())

    def test_symlink_directory_and_ancestor_replacement_do_not_return_ack(self):
        link = self.directory / "link"
        child = self.directory / "child"
        child.mkdir(mode=0o700)
        link.symlink_to(child, target_is_directory=True)
        with self.assertRaises(OSError):
            self.retain(directory=str(link))
        read = installer._offhost_index_read
        def move(root, name, uid):
            result = read(root, name, uid)
            child.rename(self.directory / "moved")
            child.mkdir(mode=0o700)
            return result
        with patch.object(installer, "_offhost_index_read", side_effect=move), self.assertRaises(ReleaseContractError):
            self.retain(directory=str(child))
        self.assertTrue((self.directory / "moved" / self.file.name).exists())

    def test_zero_write_and_file_or_directory_sync_failure_keep_evidence_and_return_no_ack(self):
        with patch.object(installer.os, "write", return_value=0), self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(self.file.stat().st_size, 0)
        self.file.unlink()
        real_sync = os.fsync
        for fail_at in (1, 2):
            calls = []
            def fail(fd):
                calls.append(fd)
                if len(calls) == fail_at:
                    raise OSError("modeled sync failure")
                return real_sync(fd)
            with patch.object(installer.os, "fsync", side_effect=fail), self.assertRaises(OSError):
                self.retain()
            self.assertEqual(self.file.read_bytes(), installer._json(self.index))
            self.file.unlink()

    def test_readback_mismatch_or_late_mutation_keeps_file_but_never_returns_ack(self):
        with patch.object(installer, "_offhost_index_read", return_value=b"wrong"), self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(self.file.read_bytes(), installer._json(self.index))
        self.file.unlink()
        read = installer._offhost_index_read
        def changed(*args):
            raw = read(*args)
            self.file.write_bytes(b"changed")
            return raw
        with patch.object(installer, "_offhost_index_read", side_effect=changed), self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(self.file.read_bytes(), b"changed")

    def test_darwin_requires_fullsync_after_both_posix_syncs_without_fallback(self):
        events = []
        sync = os.fsync
        def synced(fd):
            events.append("file" if installer.stat.S_ISREG(os.fstat(fd).st_mode) else "directory")
            return sync(fd)
        with patch.object(installer.sys, "platform", "darwin"), \
             patch.object(installer.fcntl, "F_FULLFSYNC", 51, create=True), \
             patch.object(installer.os, "fsync", side_effect=synced), \
             patch.object(installer.fcntl, "fcntl", side_effect=lambda fd, command: events.append(("full", command))):
            ack = self.retain()
        self.assertEqual(events, ["file", "directory", ("full", 51)])
        self.assertEqual(installer._snapshot_index_ack_value(ack, self.transfer)["syncMethod"], "darwin-fullfsync")
        self.file.unlink()
        with patch.object(installer.sys, "platform", "darwin"), \
             patch.object(installer.fcntl, "F_FULLFSYNC", None, create=True), self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.file.exists())
        with patch.object(installer.sys, "platform", "darwin"), \
             patch.object(installer.fcntl, "F_FULLFSYNC", 51, create=True), \
             patch.object(installer.fcntl, "fcntl", side_effect=OSError("modeled fullsync")), self.assertRaises(OSError):
            self.retain()
        self.assertEqual(self.file.read_bytes(), installer._json(self.index))

    def test_capacity_failure_prevents_creation_and_reader_rejects_mode_links_and_oversize(self):
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=0, f_frsize=1)), \
             self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.file.exists())
        self.retain()
        root = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            self.file.chmod(0o644)
            with self.assertRaises(ReleaseContractError):
                installer._offhost_index_read(root, self.file.name, os.geteuid())
            self.file.chmod(0o600)
            linked = self.directory / "hardlink"
            os.link(self.file, linked)
            with self.assertRaises(ReleaseContractError):
                installer._offhost_index_read(root, self.file.name, os.geteuid())
            linked.unlink()
            self.file.write_bytes(b"x" * (installer.MAX_INSTALL_RECORD + 1))
            with self.assertRaises(ReleaseContractError):
                installer._offhost_index_read(root, self.file.name, os.geteuid())
        finally:
            os.close(root)

    def test_ack_schema_flags_hashes_size_nonce_and_old_ack_against_new_transfer_are_strict(self):
        raw = self.retain()
        original = json.loads(raw)
        for key, wrong in (("schemaVersion", True), ("kind", "other"), ("installationId", "f" * 64),
                           ("snapshotReviewSha256", "f" * 64), ("indexSha256", "f" * 64), ("indexBytes", True),
                           ("transferChallenge", "f" * 64), ("operatorConfirmedOffHost", 1),
                           ("clientIndexDurable", False), ("syncMethod", "none"), ("canExecute", True),
                           ("recoveryReady", True), ("extra", "private")):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._snapshot_index_ack_value(installer._json({**original, key: wrong}), self.transfer)
        for wrong in (b"", b"{", raw + b" ", b"x" * (installer.MAX_INSTALL_RECORD + 1)):
            with self.assertRaises(ReleaseContractError):
                installer._snapshot_index_ack_value(wrong, self.transfer)
        with self.assertRaises(ReleaseContractError):
            installer._snapshot_index_ack_value(raw, installer._snapshot_index_transfer(self.index))

    def test_receiver_never_opens_vm_session_runs_commands_or_adds_public_cli(self):
        with patch.object(installer, "_private_session", side_effect=AssertionError("VM session")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            self.retain()
        for command in ("snapshot-index-receive", "snapshot-retain", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


class OffhostIndexProjectionIntegrationTests(unittest.TestCase):
    def test_real_owned_review_projection_round_trips_through_the_same_strict_index_transfer_parser(self):
        base = receipt.SnapshotReviewRetentionTests()
        base.setUp()
        try:
            result = base.observe()
            original = result["installationIntent"]["snapshotReview"]["offHostIndex"]
            parsed = installer._snapshot_index_transfer_value(installer._snapshot_index_transfer(original))
            self.assertEqual(parsed["index"], original)
            self.assertFalse(parsed["index"]["offHostRetentionConfirmed"])
            self.assertEqual(parsed["index"]["snapshotReviewSha256"], installer._hash(base.record_path().read_bytes()))
        finally:
            base.doCleanups()
