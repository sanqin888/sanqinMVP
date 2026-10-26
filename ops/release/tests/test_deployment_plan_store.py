"""Offline private storage failures. Never use production paths or privileges."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import deployment_plan_store as store
from release_contract import ReleaseContractError
from test_deployment_plan import prepared


class PrivatePlanStoreTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.parent = Path(temporary.name)
        self.parent.chmod(0o700)
        self.directory = self.parent / "plans"
        self.directory.mkdir(mode=0o700)
        for name, value in (("PLAN_DIR", self.directory), ("OWNER_UID", os.getuid())):
            patcher = patch.object(store, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.raw, self.identity = prepared()
        self.target = self.directory / (self.identity + ".json")

    def test_create_private_and_load_same_original_by_retained_identity(self):
        self.assertEqual(store.save_plan(self.raw), self.identity)
        self.assertEqual(store.load_plan(self.identity), self.raw)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)

    def test_existing_identity_cannot_be_overwritten_even_with_same_bytes(self):
        store.save_plan(self.raw)
        with self.assertRaises(ReleaseContractError):
            store.save_plan(self.raw)
        self.assertEqual(self.target.read_bytes(), self.raw)

    def test_bad_identity_traversal_and_uppercase_are_rejected(self):
        for identity in ("../state", "A" * 64, "", self.identity[:-1]):
            with self.subTest(identity=identity), self.assertRaises(ReleaseContractError):
                store.load_plan(identity)

    def test_unprovisioned_directory_is_not_created(self):
        self.directory.rmdir()
        with self.assertRaises(OSError):
            store.save_plan(self.raw)
        self.assertFalse(self.directory.exists())

    def test_symlink_directory_is_rejected(self):
        alternate = self.parent / "alternate"
        self.directory.rename(alternate)
        self.directory.symlink_to(alternate, target_is_directory=True)
        with self.assertRaises(ReleaseContractError):
            store.save_plan(self.raw)

    def test_parent_or_directory_must_be_private(self):
        for directory in (self.parent, self.directory):
            with self.subTest(directory=directory):
                directory.chmod(0o755)
                with self.assertRaises(ReleaseContractError):
                    store.save_plan(self.raw)
                directory.chmod(0o700)

    def test_wrong_owner_is_rejected(self):
        with patch.object(store, "OWNER_UID", os.getuid() + 1):
            with self.assertRaises(ReleaseContractError):
                store.save_plan(self.raw)

    def test_group_readable_plan_is_rejected(self):
        store.save_plan(self.raw)
        self.target.chmod(0o640)
        with self.assertRaises(ReleaseContractError):
            store.load_plan(self.identity)

    def test_symlink_and_hardlink_plan_are_rejected(self):
        store.save_plan(self.raw)
        other = self.parent / "other"
        self.target.rename(other)
        self.target.symlink_to(other)
        with self.assertRaises(OSError):
            store.load_plan(self.identity)
        self.target.unlink()
        os.link(other, self.target)
        with self.assertRaises(ReleaseContractError):
            store.load_plan(self.identity)

    def test_empty_truncated_tampered_and_duplicate_json_are_rejected(self):
        for raw in (b"", self.raw[:-20], self.raw.replace(b'"canExecute":false',
                    b'"canExecute":true'), b'{"planId":"x","planId":"y"}'):
            with self.subTest(raw=raw[:20]), self.assertRaises(ReleaseContractError):
                store.save_plan(raw)
        self.assertFalse(self.target.exists())

    def test_non_bytes_and_oversized_inputs_are_rejected_before_json_parse(self):
        with patch.object(store.json, "loads", side_effect=AssertionError("must not parse")):
            for raw in ("{}", b"x" * (store.MAX_PLAN_BYTES + 1), None):
                with self.subTest(kind=type(raw)), self.assertRaises(ReleaseContractError):
                    store.save_plan(raw)

    def test_partial_write_is_preserved_and_never_retried_over_original(self):
        real_write = os.write
        calls = 0
        def interrupted(fd, data):
            nonlocal calls
            calls += 1
            if calls == 1:
                return real_write(fd, data[:11])
            raise OSError("simulated disk failure")
        with patch.object(store.os, "write", side_effect=interrupted):
            with self.assertRaises(OSError):
                store.save_plan(self.raw)
        self.assertEqual(self.target.read_bytes(), self.raw[:11])
        with self.assertRaises(ReleaseContractError):
            store.load_plan(self.identity)
        with self.assertRaises(ReleaseContractError):
            store.save_plan(self.raw)

    def test_short_writes_are_completed_and_both_objects_synced(self):
        real_write = os.write
        with patch.object(store.os, "write",
                          side_effect=lambda fd, data: real_write(fd, data[:17])), \
             patch.object(store.os, "fsync", wraps=os.fsync) as sync:
            store.save_plan(self.raw)
        self.assertEqual(sync.call_count, 2)
        self.assertEqual(store.load_plan(self.identity), self.raw)

    def test_sync_failure_is_not_reported_as_success_or_cleaned_up(self):
        with patch.object(store.os, "fsync", side_effect=OSError("sync failed")):
            with self.assertRaises(OSError):
                store.save_plan(self.raw)
        self.assertTrue(self.target.exists())
        with self.assertRaises(ReleaseContractError):
            store.save_plan(self.raw)

    def test_second_prepare_is_rejected_and_lock_inode_is_retained(self):
        with store.preparation_lock():
            inode = (self.directory / ".prepare.lock").stat().st_ino
            with self.assertRaises(ReleaseContractError):
                with store.preparation_lock():
                    self.fail("second preparation acquired lock")
        with store.preparation_lock():
            self.assertEqual((self.directory / ".prepare.lock").stat().st_ino, inode)

    def test_lock_symlink_is_not_followed(self):
        self.target.write_bytes(b"unchanged")
        (self.directory / ".prepare.lock").symlink_to(self.target)
        with self.assertRaises(OSError):
            with store.preparation_lock():
                self.fail("symlink lock acquired")
        self.assertEqual(self.target.read_bytes(), b"unchanged")


if __name__ == "__main__":
    unittest.main()
