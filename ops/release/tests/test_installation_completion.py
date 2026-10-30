"""Durable pre-clear audit and final marker removal; real temp files, modeled host."""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_restart_policy_restore as policy
import test_installation_snapshot_content as content
from release_contract import ReleaseContractError


class CompletionRecordTests(unittest.TestCase):
    def setUp(self):
        self.identity = "a" * 64
        self.value = {"schemaVersion": 1, "kind": installer.INSTALL_COMPLETION_KIND,
            "installationId": self.identity, "createdAt": "2026-10-30T01:00:00Z",
            "phase": "PREPARED_BEFORE_MARKER_CLEAR", "installationComplete": False,
            "canExecute": False, "restoreProven": False,
            **{key: "b" * 64 for key in installer.INSTALL_COMPLETION_DIGESTS}}

    def test_exact_inert_audit_round_trip_and_no_completion_permission(self):
        raw = installer._json(self.value)
        self.assertEqual(installer._installation_completion_value(raw, self.identity), self.value)
        self.assertIs(self.value["installationComplete"], False)
        self.assertIs(self.value["canExecute"], False)

    def test_unknown_fields_boolean_version_claims_and_invalid_digests_rejected(self):
        for key, value in (("extra", True), ("schemaVersion", True), ("installationComplete", True),
                           ("canExecute", 0), ("restoreProven", True), ("phase", "COMPLETE"),
                           ("kind", "other"), ("intentSha256", "B" * 64), ("installationId", "c" * 64),
                           ("createdAt", "2026-02-30T01:00:00Z")):
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._installation_completion_value(installer._json({**self.value, key: value}), self.identity)

    def test_duplicate_noncanonical_nonfinite_or_oversized_records_rejected(self):
        raw = installer._json(self.value)
        for malformed in (raw + b" ", b'{"schemaVersion":1,' + raw[1:],
                          raw.replace(b'"schemaVersion":1', b'"schemaVersion":NaN'), b"x" * 16385):
            with self.subTest(raw=malformed[:30]), self.assertRaises(ReleaseContractError):
                installer._installation_completion_value(malformed, self.identity)

    def test_record_primitive_is_create_only_and_readback_is_private(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(installer, "PRIVATE_OWNER_UID", os.getuid()), \
             patch.object(installer, "PRIVATE_GROUP_GID", os.getgid()), patch.object(installer.os, "geteuid", return_value=0):
            os.chmod(tmp, 0o700)
            fd = os.open(tmp, os.O_RDONLY | os.O_DIRECTORY)
            self.addCleanup(os.close, fd)
            raw = installer._json(self.value)
            installer._installation_record_write(fd, installer.INSTALL_COMPLETION_FILE, raw, self.identity)
            self.assertEqual(installer._installation_record_read(fd, installer.INSTALL_COMPLETION_FILE, self.identity), raw)
            with self.assertRaises(FileExistsError):
                installer._installation_record_write(fd, installer.INSTALL_COMPLETION_FILE, raw, self.identity)
            os.chmod(Path(tmp) / installer.INSTALL_COMPLETION_FILE, 0o644)
            with self.assertRaises(ReleaseContractError):
                installer._installation_record_read(fd, installer.INSTALL_COMPLETION_FILE, self.identity)


class FinalMarkerTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name)
        os.chmod(self.path, 0o700)
        self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, self.fd)
        self.identity = "a" * 64
        self.intent = installer._installation_intent_bytes(installation_id=self.identity, retention_id="b" * 64,
            target_source_sha="c" * 40, installed_runtime_source_sha="d" * 40,
            observation_sha256="e" * 64, created_at="2026-10-30T01:00:00Z")
        self.marker = self.path / "active.json"
        self.marker.write_bytes(installer._installation_marker_bytes(self.intent, self.identity))
        self.marker.chmod(0o600)
        self.saved = installer._installed_fingerprint(self.marker.stat())
        self.cleared = False
        self.calls = 0
        self.after_check = None
        self.uid = patch.object(installer, "PRIVATE_OWNER_UID", os.getuid())
        self.gid = patch.object(installer, "PRIVATE_GROUP_GID", os.getgid())
        self.root = patch.object(installer.os, "geteuid", return_value=0)
        for mock in (self.uid, self.gid, self.root):
            mock.start()
            self.addCleanup(mock.stop)

    def check(self):
        self.calls += 1
        self.assertEqual(set(os.listdir(self.fd)), set() if self.cleared else {"active.json"})
        if self.after_check:
            self.after_check()

    def mark(self):
        self.assertFalse(self.marker.exists())
        self.cleared = True

    def clear(self, deadline=None):
        return installer._clear_owned_installation_marker(self.fd, self.intent, self.identity,
            check_context=self.check, mark_cleared=self.mark,
            expected_identity=self.saved, deadline=installer.time.monotonic() + 60 if deadline is None else deadline)

    def test_last_unlink_is_followed_by_directory_sync_and_empty_readback(self):
        sync = installer.os.fsync
        seen = []
        def durable(fd):
            self.assertTrue(self.cleared)
            self.assertFalse(self.marker.exists())
            seen.append(fd)
            return sync(fd)
        with patch.object(installer.os, "fsync", side_effect=durable):
            self.clear()
        self.assertEqual(seen, [self.fd])
        self.assertTrue(self.cleared)
        self.assertEqual(self.calls, 3)

    def test_expired_budget_never_unlinks(self):
        with self.assertRaises(ReleaseContractError):
            self.clear(installer.time.monotonic() - 1)
        self.assertTrue(self.marker.exists())
        self.assertFalse(self.cleared)

    def test_foreign_marker_is_preserved(self):
        self.marker.write_bytes(b"foreign")
        with self.assertRaises(ReleaseContractError):
            self.clear()
        self.assertEqual(self.marker.read_bytes(), b"foreign")

    def test_same_bytes_replacement_before_clear_is_not_owned(self):
        raw = self.marker.read_bytes()
        replacement = self.path / "replacement"
        replacement.write_bytes(raw)
        replacement.chmod(0o600)
        replacement.replace(self.marker)
        with self.assertRaises(ReleaseContractError):
            self.clear()
        self.assertEqual(self.marker.read_bytes(), raw)

    def test_same_bytes_replacement_during_context_check_is_preserved(self):
        def change():
            if self.calls == 2:
                replacement = self.path / "replacement"
                replacement.write_bytes(self.marker.read_bytes())
                replacement.chmod(0o600)
                replacement.replace(self.marker)
        self.after_check = change
        with self.assertRaises(ReleaseContractError):
            self.clear()
        self.assertTrue(self.marker.exists())
        self.assertFalse(self.cleared)

    def test_unknown_unlink_never_retries_or_recreates(self):
        with patch.object(installer.os, "unlink", side_effect=OSError("unlink unknown")) as unlink, self.assertRaises(OSError):
            self.clear()
        self.assertEqual(unlink.call_count, 1)
        self.assertTrue(self.marker.exists())
        self.assertFalse(self.cleared)

    def test_post_unlink_sync_failure_preserves_actual_absence(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("sync unknown")), self.assertRaises(OSError):
            self.clear()
        self.assertFalse(self.marker.exists())
        self.assertTrue(self.cleared)

    def test_reappearing_marker_after_unlink_is_not_removed_again(self):
        sync = installer.os.fsync
        def replace(fd):
            self.marker.write_bytes(b"foreign after clear")
            self.marker.chmod(0o600)
            sync(fd)
        with patch.object(installer.os, "fsync", side_effect=replace), self.assertRaises(ReleaseContractError):
            self.clear()
        self.assertEqual(self.marker.read_bytes(), b"foreign after clear")


class OwnedInstallationCompletionTests(unittest.TestCase):
    def setUp(self):
        self.base = policy.OwnedRestartPolicyTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.marker = self.base.base.phase.gate.marker
        self.receipt = None

    def observe(self):
        complete = installer._installation_completion_bytes
        def record(*args, **kwargs):
            self.base.base.phase.gate.assert_locks_held()
            self.assertTrue(self.marker.exists())
            self.assertEqual(len(self.base.commands), 3)
            self.assertEqual(self.base.http_calls, list(installer.READINESS_URLS))
            raw = complete(*args, **kwargs)
            self.receipt = raw
            return raw
        with patch.object(installer, "_restore_installation_restart_policies", side_effect=installer._complete_installation), \
             patch.object(installer, "_installation_completion_bytes", side_effect=record):
            return self.base.observe()

    def path(self):
        candidates = list(self.marker.parent.parent.glob("installation-runs/*/completion.json"))
        self.assertEqual(len(candidates), 1)
        return candidates[0]

    def assert_contained(self):
        for identifier in self.base.base.docker.ids[:3]:
            info = self.base.base.docker.containers[identifier]
            self.assertFalse(info["State"]["Running"])
            self.assertEqual(info["HostConfig"]["RestartPolicy"], {"Name": "no", "MaximumRetryCount": 0})

    def test_complete_flow_keeps_original_state_and_preclear_receipt_is_not_authority(self):
        db = copy.deepcopy(self.base.base.docker.containers[self.base.base.docker.ids[3]])
        result = self.observe()
        facts = result["installationIntent"]["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_COMPLETE")
        self.assertTrue(result["installationComplete"])
        self.assertFalse(result["installationIntent"]["startupFenceConfirmed"])
        self.assertTrue(facts["installationComplete"])
        self.assertTrue(facts["completionRecordDurable"])
        self.assertFalse(facts["requiresInstallationCompletion"])
        self.assertFalse(self.marker.exists())
        self.assertFalse(any(self.marker.parent.iterdir()))
        self.assertEqual(self.path().read_bytes(), self.receipt)
        record = json.loads(self.receipt)
        self.assertIs(record["installationComplete"], False)
        self.assertIs(record["canExecute"], False)
        self.assertIs(facts["restoreProven"], False)
        self.assertIs(facts["canExecute"], False)
        self.assertEqual(db, self.base.base.docker.containers[self.base.base.docker.ids[3]])

    def test_old_policy_entry_cannot_write_completion_or_clear_marker(self):
        with patch.object(installer, "_clear_owned_installation_marker", side_effect=AssertionError("clear")):
            result = self.base.observe()
        self.assertTrue(self.marker.exists())
        self.assertFalse(result["installationIntent"]["snapshotReview"]["installationComplete"])

    def test_record_write_unknown_keeps_marker_and_contains_without_retry(self):
        write = installer._installation_record_write
        def unknown(root, name, raw, identity):
            result = write(root, name, raw, identity)
            if name == installer.INSTALL_COMPLETION_FILE:
                raise OSError("completion sync unknown")
            return result
        with patch.object(installer, "_installation_record_write", side_effect=unknown), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue(self.marker.exists())
        self.assertEqual(self.path().read_bytes(), self.receipt)
        self.assert_contained()

    def test_completion_tampering_before_unlink_keeps_marker_and_contains(self):
        clear = installer._clear_owned_installation_marker
        def changed(*args, **kwargs):
            self.path().write_bytes(b"changed completion")
            return clear(*args, **kwargs)
        with patch.object(installer, "_clear_owned_installation_marker", side_effect=changed), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue(self.marker.exists())
        self.assert_contained()

    def test_final_source_failure_before_clear_preserves_receipt_and_marker(self):
        review = installer.review_transition
        def fail(*args, **kwargs):
            if self.receipt is not None and list(self.marker.parent.parent.glob("installation-runs/*/completion.json")):
                raise ReleaseContractError("source changed before clear")
            return review(*args, **kwargs)
        with patch.object(installer, "review_transition", side_effect=fail), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertTrue(self.marker.exists())
        self.assertEqual(self.path().read_bytes(), self.receipt)
        self.assert_contained()

    def test_post_unlink_failure_contains_without_fabricating_marker_or_complete_receipt(self):
        clear = installer._clear_owned_installation_marker
        def fail(*args, **kwargs):
            clear(*args, **kwargs)
            raise OSError("late failure after clear")
        with patch.object(installer, "_clear_owned_installation_marker", side_effect=fail), self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe()
        self.assertFalse(self.marker.exists())
        self.assertIs(json.loads(self.path().read_bytes())["installationComplete"], False)
        self.assert_contained()

    def test_successful_disk_record_does_not_authorize_second_installation(self):
        self.observe()
        observe_flow = content.SnapshotContentOwnedFlowTests.observe
        def without_peer(flow, respond=None, exchange=None):
            return observe_flow(flow, respond=respond,
                exchange=lambda *args, **kwargs: self.fail("replayed snapshot exchange"))
        with patch.object(content.SnapshotContentOwnedFlowTests, "observe", without_peer), \
             patch.object(installer, "_installation_application_start_command", side_effect=AssertionError("replay")), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(self.marker.exists())
        self.assertEqual(self.path().read_bytes(), self.receipt)

    def test_native_complete_switch_requires_full_flow_before_io(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("host IO")):
            for value in (True, 1):
                with self.subTest(value=value), self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("f" * 64, _complete_installation=value)
