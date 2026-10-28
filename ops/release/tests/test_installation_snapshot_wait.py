"""Bounded live snapshot input: real pipes; host/source/root operations remain models."""
import fcntl
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_recovery_retention as retention
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationSnapshotWaitTests(unittest.TestCase):
    def setUp(self):
        self.base = retention.InstallationRecoveryRetentionTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.errors = []

    def pipes(self):
        incoming, sender = os.pipe()
        receiver, outgoing = os.pipe()
        def close():
            for fd in (incoming, sender, receiver, outgoing):
                try:
                    os.close(fd)
                except OSError:
                    pass
        self.addCleanup(close)
        return incoming, sender, receiver, outgoing

    def request(self):
        return {"schemaVersion": 1, "kind": "sanq-minimal-snapshot-evidence-request",
            **{key: str(index + 1) * 64 for index, key in enumerate((
                "installationId", "intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "challenge"))},
            "maxWaitSeconds": installer.MAX_SNAPSHOT_REVIEW_SECONDS, "snapshotAvailable": False, "canExecute": False}

    def reply(self, request, evidence=None):
        keys = ("installationId", "intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "challenge")
        return installer._json({"schemaVersion": 1, "kind": "sanq-minimal-snapshot-evidence-reply",
            **{key: request[key] for key in keys},
            "evidence": {"note": "unverified operator data"} if evidence is None else evidence})

    def peer(self, sender, receiver, respond=None):
        requests = []
        def work():
            try:
                raw = bytearray()
                while not raw.endswith(b"\n"):
                    block = os.read(receiver, 4096)
                    if not block:
                        return
                    raw.extend(block)
                    if len(raw) > 4096:
                        raise AssertionError("oversized request")
                value = json.loads(raw)
                requests.append(value)
                response = self.reply(value) if respond is None else respond(value)
                if response is None:
                    os.close(sender)
                    return
                remaining = memoryview(response)
                while remaining:
                    count = os.write(sender, remaining[:97])
                    remaining = remaining[count:]
            except BaseException as error:
                self.errors.append(error)
                try:
                    os.close(sender)
                except OSError:
                    pass
        thread = threading.Thread(target=work, daemon=True)
        thread.start()
        return thread, requests

    def observe(self, incoming, outgoing, *, wait_seconds=5):
        with patch.object(installer, "_retain_installation_recovery",
             side_effect=lambda identity, **kwargs: installer._receive_installation_snapshot_evidence(
                 identity, input_fd=incoming, output_fd=outgoing, **kwargs)), \
             patch.object(installer, "MAX_SNAPSHOT_REVIEW_SECONDS", wait_seconds):
            return self.base.observe()

    def assert_retained_fence(self):
        self.base.assert_frozen_evidence()
        self.assertTrue((self.base.directory() / "recovery.tar").exists())
        self.assertTrue((self.base.directory() / "recovery.json").exists())

    def test_real_pipe_exchange_handles_partial_frames_and_restores_caller_flags(self):
        incoming, sender, receiver, outgoing = self.pipes()
        before = [fcntl.fcntl(fd, fcntl.F_GETFL) for fd in (incoming, outgoing)]
        thread, requests = self.peer(sender, receiver)
        request = self.request()
        raw = installer._installation_snapshot_exchange(request, incoming, outgoing, deadline=time.monotonic() + 5)
        value = installer._installation_snapshot_reply_value(raw, request)
        thread.join(1)
        self.assertFalse(thread.is_alive())
        self.assertFalse(self.errors)
        self.assertEqual(requests, [request])
        self.assertEqual(value["evidence"], {"note": "unverified operator data"})
        self.assertEqual([fcntl.fcntl(fd, fcntl.F_GETFL) for fd in (incoming, outgoing)], before)
        self.assertTrue(all(os.fstat(fd) for fd in (incoming, outgoing)))

    def test_actual_short_output_writes_complete_one_request_without_losing_bytes(self):
        incoming, sender, receiver, outgoing = self.pipes()
        thread, requests = self.peer(sender, receiver)
        write = os.write
        def short(fd, raw):
            return write(fd, raw[:7])
        request = self.request()
        with patch.object(installer.os, "write", side_effect=short):
            raw = installer._installation_snapshot_exchange(request, incoming, outgoing, deadline=time.monotonic() + 5)
        thread.join(1)
        self.assertFalse(self.errors)
        self.assertEqual(requests, [request])
        installer._installation_snapshot_reply_value(raw, request)

    def test_input_timeout_is_bounded_and_keeps_descriptors_and_flags(self):
        incoming, sender, receiver, outgoing = self.pipes()
        before = [fcntl.fcntl(fd, fcntl.F_GETFL) for fd in (incoming, outgoing)]
        with self.assertRaisesRegex(ReleaseContractError, "timed out"):
            installer._installation_snapshot_exchange(self.request(), incoming, outgoing, deadline=time.monotonic() + 0.05)
        self.assertEqual([fcntl.fcntl(fd, fcntl.F_GETFL) for fd in (incoming, outgoing)], before)

    def test_output_backpressure_cannot_block_beyond_deadline(self):
        incoming, sender, receiver, outgoing = self.pipes()
        os.set_blocking(outgoing, False)
        while True:
            try:
                os.write(outgoing, b"x" * 4096)
            except BlockingIOError:
                break
        with self.assertRaisesRegex(ReleaseContractError, "timed out"):
            installer._installation_snapshot_exchange(self.request(), incoming, outgoing, deadline=time.monotonic() + 0.05)
        self.assertFalse(os.get_blocking(outgoing))

    def test_eof_is_not_an_empty_successful_reply(self):
        incoming, sender, receiver, outgoing = self.pipes()
        thread, _ = self.peer(sender, receiver, lambda request: None)
        with self.assertRaises(ReleaseContractError):
            installer._installation_snapshot_exchange(self.request(), incoming, outgoing, deadline=time.monotonic() + 5)
        thread.join(1)
        self.assertFalse(self.errors)

    def test_zero_output_progress_is_rejected_without_retry_loop(self):
        incoming, sender, receiver, outgoing = self.pipes()
        with patch.object(installer.os, "write", return_value=0), self.assertRaises(ReleaseContractError):
            installer._installation_snapshot_exchange(self.request(), incoming, outgoing, deadline=time.monotonic() + 5)

    def test_oversized_reply_is_rejected_before_json_parsing(self):
        incoming, sender, receiver, outgoing = self.pipes()
        thread, _ = self.peer(sender, receiver, lambda request: b"x" * (installer.MAX_SNAPSHOT_REPLY_BYTES + 1) + b"\n")
        with self.assertRaises(ReleaseContractError):
            installer._installation_snapshot_exchange(self.request(), incoming, outgoing, deadline=time.monotonic() + 5)
        thread.join(1)

    def test_multiple_frames_in_one_read_are_rejected(self):
        incoming, sender, receiver, outgoing = self.pipes()
        os.write(sender, b"{}\n{}\n")
        with self.assertRaises(ReleaseContractError):
            installer._installation_snapshot_exchange(self.request(), incoming, outgoing, deadline=time.monotonic() + 5)

    def test_files_sockets_same_fd_and_wrong_pipe_direction_are_not_live_review_channels(self):
        incoming, sender, receiver, outgoing = self.pipes()
        sock, other = socket.socketpair()
        self.addCleanup(sock.close)
        self.addCleanup(other.close)
        with tempfile.TemporaryFile() as file:
            cases = ((file.fileno(), outgoing), (sock.fileno(), outgoing), (incoming, incoming),
                     (sender, outgoing), (incoming, receiver), (True, outgoing))
            for args in cases:
                with self.subTest(args=args), self.assertRaises(ReleaseContractError):
                    installer._installation_snapshot_fds(*args)

    def test_one_pipe_cannot_loop_request_bytes_back_as_reply(self):
        incoming, sender = os.pipe()
        self.addCleanup(os.close, incoming)
        self.addCleanup(os.close, sender)
        with self.assertRaises(ReleaseContractError):
            installer._installation_snapshot_fds(incoming, sender)

    def test_expired_nonfinite_boolean_or_excessive_deadline_is_rejected(self):
        incoming, sender, receiver, outgoing = self.pipes()
        for deadline in (time.monotonic() - 1, float("inf"), float("nan"), True,
                         time.monotonic() + installer.MAX_SNAPSHOT_REVIEW_SECONDS + 100):
            with self.subTest(deadline=deadline), self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_exchange(self.request(), incoming, outgoing, deadline=deadline)

    def test_reply_must_bind_all_materials_and_fresh_challenge(self):
        request = self.request()
        original = json.loads(self.reply(request))
        for key in ("installationId", "intentSha256", "writersSha256", "archiveSha256", "receiptSha256", "challenge"):
            value = {**original, key: "f" * 64}
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_reply_value(installer._json(value), request)

    def test_reply_schema_permissions_duplicate_json_and_nonfinite_values_are_rejected(self):
        request = self.request()
        original = json.loads(self.reply(request))
        cases = [installer._json({**original, key: value}) for key, value in (
            ("schemaVersion", True), ("kind", "other"), ("canExecute", True), ("snapshotAvailable", True),
            ("evidence", {}), ("evidence", []))]
        raw = self.reply(request)
        cases += [b"{", b"\xff", raw + b" ", raw.replace(b'"schemaVersion":1', b'"schemaVersion":NaN'),
                  raw.replace(b'{"archiveSha256":', b'{"schemaVersion":1,"archiveSha256":', 1)]
        for raw in cases:
            with self.assertRaises(ReleaseContractError):
                installer._installation_snapshot_reply_value(raw, request)

    def test_same_owned_flow_waits_after_durable_pair_and_returns_only_unverified_summary(self):
        incoming, sender, receiver, outgoing = self.pipes()
        def respond(request):
            self.base.phase.gate.assert_locks_held()
            self.assert_retained_fence()
            self.assertEqual(len(self.base.phase.actions), 6)
            intent, writers, identity = self.base.originals()
            self.assertEqual(request["installationId"], identity)
            self.assertEqual(request["intentSha256"], installer._hash(intent))
            self.assertEqual(request["writersSha256"], installer._hash(writers))
            self.assertEqual(request["archiveSha256"], installer._hash(self.base.payload()))
            self.assertEqual(request["receiptSha256"], installer._hash(self.base.receipt()))
            return self.reply(request, {"snapshotAvailable": True, "note": "UNVERIFIED_PRIVATE_NOTE"})
        thread, _ = self.peer(sender, receiver, respond)
        result = self.observe(incoming, outgoing)
        thread.join(1)
        self.assertFalse(self.errors)
        self.assertEqual(result["outcome"], "INSTALLATION_SNAPSHOT_EVIDENCE_RECEIVED")
        received = result["installationIntent"]["snapshotReview"]
        self.assertTrue(received["unverifiedEvidenceReceived"])
        self.assertTrue(received["requiresSnapshotValidation"])
        for key in ("snapshotEvidenceValidated", "snapshotAvailable", "recoveryReady", "canExecute"):
            self.assertFalse(received[key])
        self.assertNotIn("UNVERIFIED_PRIVATE_NOTE", json.dumps(result))
        self.assertFalse(result["readyToInstall"])
        self.assertEqual(set(path.name for path in self.base.directory().iterdir()), installer.RECOVERY_FILES)

    def test_fresh_post_wait_context_does_not_reuse_expired_pre_wait_deadline(self):
        incoming, sender, receiver, outgoing = self.pipes()
        clock = [100.0]
        observed = []
        original = installer._host_filesystem_snapshot
        def filesystem(**kwargs):
            observed.append(kwargs["deadline"])
            return original(**kwargs)
        def exchange(request, *args, **kwargs):
            self.base.phase.gate.assert_locks_held()
            self.assert_retained_fence()
            clock[0] += 1000
            return self.reply(request)
        with patch.object(installer.time, "monotonic", side_effect=lambda: clock[0]), \
             patch.object(installer, "_host_filesystem_snapshot", side_effect=filesystem), \
             patch.object(installer, "_installation_snapshot_exchange", side_effect=exchange):
            result = self.observe(incoming, outgoing, wait_seconds=1800)
        self.assertEqual(result["outcome"], "INSTALLATION_SNAPSHOT_EVIDENCE_RECEIVED")
        self.assertIn(400.0, observed)
        self.assertIn(1400.0, observed)

    def test_wrong_reply_challenge_keeps_pair_frozen_and_is_not_replayed(self):
        incoming, sender, receiver, outgoing = self.pipes()
        def respond(request):
            value = json.loads(self.reply(request))
            value["challenge"] = "f" * 64
            return installer._json(value)
        thread, _ = self.peer(sender, receiver, respond)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(incoming, outgoing)
        thread.join(1)
        self.assert_retained_fence()
        count = len(self.base.phase.actions)
        with self.assertRaises(ReleaseContractError):
            self.observe(incoming, outgoing)
        self.assertEqual(len(self.base.phase.actions), count)

    def test_eof_after_request_preserves_recovery_pair_and_all_fences(self):
        incoming, sender, receiver, outgoing = self.pipes()
        thread, _ = self.peer(sender, receiver, lambda request: None)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(incoming, outgoing)
        thread.join(1)
        self.assert_retained_fence()

    def test_wait_timeout_in_owned_flow_preserves_the_durable_pair(self):
        incoming, sender, receiver, outgoing = self.pipes()
        with patch.object(installer, "_installation_snapshot_exchange",
             side_effect=ReleaseContractError("modeled review timeout")), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(incoming, outgoing)
        self.assert_retained_fence()

    def test_plan_change_during_wait_is_caught_by_fresh_private_originals_check(self):
        incoming, sender, receiver, outgoing = self.pipes()
        path = self.base.phase.saved.materials.state / "plans" / ("a" * 64 + ".json")
        def respond(request):
            path.write_bytes(b'{"inert":"changed during wait"}\n')
            path.chmod(0o600)
            return self.reply(request)
        thread, _ = self.peer(sender, receiver, respond)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(incoming, outgoing)
        thread.join(1)
        self.assertTrue(path.exists())
        self.assert_retained_fence()

    def test_database_restart_during_wait_is_detected_without_stopping_database(self):
        incoming, sender, receiver, outgoing = self.pipes()
        identifier = self.base.phase.docker.ids[3]
        def respond(request):
            self.base.phase.docker.containers[identifier]["RestartCount"] += 1
            return self.reply(request)
        thread, _ = self.peer(sender, receiver, respond)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(incoming, outgoing)
        thread.join(1)
        self.assert_retained_fence()
        self.assertTrue(self.base.phase.docker.containers[identifier]["State"]["Running"])
        self.assertTrue(all(row[2] != identifier for row in self.base.phase.actions))

    def test_channel_replacement_during_wait_is_not_adopted(self):
        incoming, sender, receiver, outgoing = self.pipes()
        replacement, other_sender, other_receiver, other_outgoing = self.pipes()
        def exchange(request, *args, **kwargs):
            os.dup2(replacement, incoming)
            return self.reply(request)
        with patch.object(installer, "_installation_snapshot_exchange", side_effect=exchange), \
             self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(incoming, outgoing)
        self.assert_retained_fence()

    def test_bad_channel_is_rejected_before_host_observation_or_intent(self):
        incoming, sender, receiver, outgoing = self.pipes()
        with tempfile.TemporaryFile() as file, self.assertRaises(ReleaseContractError):
            self.observe(file.fileno(), outgoing)
        self.assertEqual(self.base.phase.actions, [])
        self.assertFalse(self.base.phase.gate.marker.exists())

    def test_original_recovery_entry_never_opens_snapshot_channel_or_refreshes_for_a_wait(self):
        with patch.object(installer, "_installation_snapshot_exchange", side_effect=AssertionError("wait")):
            result = self.base.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_RECOVERY_FILES_RETAINED")
        self.assertNotIn("snapshotReview", result["installationIntent"])

    def test_strict_stage_switch_and_no_public_install_wait_or_resume_command(self):
        with self.assertRaises(ReleaseContractError):
            installer._observe_installed_runtime(self.base.phase.saved.materials.identity, _snapshot_channel=(0, 1))
        for command in ("snapshot-review", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
