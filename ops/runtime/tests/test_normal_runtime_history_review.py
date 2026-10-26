"""F4-B5 real FD trees and shared flock in private fake namespaces only."""
import inspect
import json
import multiprocessing
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_history_review as history
import normal_runtime_local_admission as local
from normal_runtime_launch import canonical, digest


def _child(connection, hold):
    try:
        if hold:
            with local._locked_base():
                connection.send("HELD")
                connection.recv()
        else:
            connection.send(history.inspect_fixed_history()["status"])
    except (ValueError, OSError) as exc:
        connection.send("BLOCKED:" + str(exc))
    finally:
        connection.close()


class HistoryReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.base = self.root / "root/sanq-runtime-operator"
        self.base.mkdir(parents=True, mode=0o700)
        self.base.parent.chmod(0o700)
        self.legacy = self.base / "normal-update-transactions"
        self.tree = self.base / "normal-update-history-v2"
        for folder in (self.legacy, self.tree):
            folder.mkdir(mode=0o700)
        self.lock = self.base / "normal-update.lock"
        self.lock.touch(mode=0o600)
        for p in (patch.object(local, "_require_root"),
                  patch.object(local, "_OWNER", (os.getuid(), os.getgid())),
                  patch.object(local, "_open_namespace_root",
                               side_effect=lambda: os.open(self.root, local._flags()))):
            p.start()
            self.addCleanup(p.stop)
        self.events = []

    def claim(self, tx="c1-history-001", attempt="1" * 64):
        return {
            "schema": "sanq.runtime.local-admission-claim.v1",
            "phase": "UNRESOLVED_LOCAL_CONSUMPTION", "transactionId": tx,
            "attemptId": attempt, "requestSha256": "2" * 64,
            "launchMaterialsSha256": "3" * 64,
            "currentRuntimeSha": "a" * 40, "targetRuntimeSha": "b" * 40,
            "currentArchiveDigest": "sha256:" + "c" * 64,
            "targetArchiveDigest": "sha256:" + "d" * 64,
            "currentAppSha": "e" * 40, "previousAppSha": "f" * 40,
            "preservedStateSha256": "4" * 64,
        }

    def event(self, kind="CLAIM", claim=None, payload=None):
        claim = self.claim() if claim is None else claim
        if payload is None:
            if kind == "CLAIM":
                payload = claim
            elif kind == "ABORT_OBSERVATION":
                receipt = {
                    "schema": "sanq.runtime.normal-update-flow.v1", "status": "ABORTED",
                    "requestSha256": claim["requestSha256"],
                    "launchMaterialsSha256": claim["launchMaterialsSha256"],
                    "flowCompleted": False, "readyToInstall": False,
                    "authorizedToMutateProduction": False, "decision": "BLOCKED",
                }
                payload = {"receipt": receipt, "receiptSha256": digest(canonical(receipt))}
            else:
                payload = {"outcome": "COMPLETION_CLAIM",
                           "evidenceSha256": "5" * 64, "r2StateSha256": "6" * 64}
        return {"schema": "sanq.runtime.local-history-event.v2",
                "sequence": len(self.events) + 1,
                "previousSha256": digest(self.events[-1]) if self.events else "0" * 64,
                "kind": kind, "transactionId": claim["transactionId"],
                "attemptId": claim["attemptId"], "requestSha256": claim["requestSha256"],
                "launchMaterialsSha256": claim["launchMaterialsSha256"],
                "claimSha256": digest(canonical(claim)), "payload": payload}

    def append(self, doc):
        raw = canonical(doc)
        self.events.append(raw)
        path = self.tree / f"{len(self.events):08d}.json"
        path.write_bytes(raw)
        path.chmod(0o600)
        return path

    def inspect(self):
        return history.inspect_fixed_history()

    def assert_blocked_flags(self, result):
        for key in ("newAttemptAuthorized", "dispositionAuthenticated", "historyDurabilityVerified",
                    "sourceProvenanceAuthenticated", "namespaceAuthenticated",
                    "continuousMaintenanceVerified", "r2DispositionVerified",
                    "transactionAdmitted", "transactionFinalized", "flowInvoked",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(result[key], False)
        self.assertEqual(result["decision"], "BLOCKED")

    def assert_unknown(self):
        result = self.inspect()
        self.assertEqual(result["status"], "UNKNOWN_BLOCKING")
        self.assertNotIn("consumedTransactions", result)
        self.assert_blocked_flags(result)

    def snapshot(self):
        return {str(p.relative_to(self.base)): (p.read_bytes(), p.stat().st_mode & 0o7777)
                for p in self.base.rglob("*") if p.is_file()}

    def start(self, hold=False):
        context = multiprocessing.get_context("fork")
        parent, child = context.Pipe()
        process = context.Process(target=_child, args=(child, hold))
        process.start()
        child.close()
        def cleanup():
            if process.is_alive():
                process.terminate()
            process.join(timeout=10)
            if process.is_alive():
                process.kill()
                process.join(timeout=10)
            parent.close()
        self.addCleanup(cleanup)
        return process, parent

    def receive(self, connection):
        self.assertTrue(connection.poll(15), "history child did not report in time")
        return connection.recv()

    def test_empty_layout_is_readonly_and_never_authorizes(self):
        before = self.snapshot()
        result = self.inspect()
        self.assertEqual(result["status"], "NO_LOCAL_HISTORY_OBSERVED")
        self.assertEqual(result["eventCount"], 0)
        self.assertEqual(result["consumedTransactions"], [])
        self.assert_blocked_flags(result)
        self.assertEqual(self.snapshot(), before)

    def test_claim_is_unresolved_and_consumed_identity_retained(self):
        self.append(self.event())
        before = self.snapshot()
        result = self.inspect()
        self.assertEqual(result["status"], "UNRESOLVED_ATTEMPT")
        self.assertEqual(result["consumedTransactions"], ["c1-history-001"])
        self.assertEqual(result["unresolvedAttemptId"], "1" * 64)
        self.assertEqual(result["historyHeadSha256"], digest(self.events[-1]))
        self.assert_blocked_flags(result)
        self.assertEqual(self.snapshot(), before)

    def test_abort_observation_does_not_resolve_claim(self):
        self.append(self.event())
        self.append(self.event("ABORT_OBSERVATION"))
        result = self.inspect()
        self.assertEqual(result["status"], "UNRESOLVED_WITH_ABORT_OBSERVATION")
        self.assertEqual(result["eventCount"], 2)
        self.assert_blocked_flags(result)

    def test_disposition_and_subsequent_claim_remain_unauthenticated(self):
        self.append(self.event())
        self.append(self.event("DISPOSITION_OBSERVATION"))
        result = self.inspect()
        self.assertEqual(result["status"], "DISPOSITION_CLAIM_UNAUTHENTICATED")
        self.assertIsNone(result["unresolvedTransactionId"])
        self.assertEqual(result["unauthenticatedDispositionCount"], 1)
        self.assert_blocked_flags(result)
        claim = self.claim("c1-history-002", "7" * 64)
        self.append(self.event(claim=claim))
        result = self.inspect()
        self.assertEqual(result["status"], "UNRESOLVED_ATTEMPT")
        self.assertEqual(result["consumedTransactions"], ["c1-history-001", "c1-history-002"])
        self.assertEqual(result["unauthenticatedDispositionCount"], 1)
        self.assert_blocked_flags(result)

    def test_incident_disposition_can_follow_abort_but_never_grants_permission(self):
        self.append(self.event())
        self.append(self.event("ABORT_OBSERVATION"))
        event = self.event("DISPOSITION_OBSERVATION")
        event["payload"]["outcome"] = "INCIDENT_DISPOSITION_CLAIM"
        self.append(event)
        self.assertEqual(self.inspect()["status"], "DISPOSITION_CLAIM_UNAUTHENTICATED")
        self.assert_blocked_flags(self.inspect())

    def test_duplicate_tx_with_same_or_different_request_refused(self):
        for changed in (False, True):
            with self.subTest(changed=changed):
                for path in self.tree.iterdir():
                    path.unlink()
                self.events = []
                self.append(self.event())
                self.append(self.event("DISPOSITION_OBSERVATION"))
                claim = self.claim(attempt="7" * 64)
                if changed:
                    claim["requestSha256"] = "8" * 64
                self.append(self.event(claim=claim))
                self.assert_unknown()

    def test_reused_attempt_id_across_different_transactions_refused(self):
        self.append(self.event())
        self.append(self.event("DISPOSITION_OBSERVATION"))
        self.append(self.event(claim=self.claim("c1-history-002")))
        self.assert_unknown()

    def test_overlapping_claims_refused(self):
        self.append(self.event())
        self.append(self.event(claim=self.claim("c1-history-002", "7" * 64)))
        self.assert_unknown()

    def test_orphan_or_duplicate_observations_refused(self):
        self.append(self.event("ABORT_OBSERVATION"))
        self.assert_unknown()
        for path in self.tree.iterdir():
            path.unlink()
        self.events = []
        self.append(self.event())
        self.append(self.event("ABORT_OBSERVATION"))
        self.append(self.event("ABORT_OBSERVATION"))
        self.assert_unknown()

    def test_abort_cannot_be_followed_by_normal_completion_claim(self):
        self.append(self.event())
        self.append(self.event("ABORT_OBSERVATION"))
        self.append(self.event("DISPOSITION_OBSERVATION"))
        self.assert_unknown()

    def test_wrong_sequence_predecessor_schema_kind_or_extra_field_refused(self):
        for change in ({"sequence": True}, {"sequence": 2}, {"previousSha256": "f" * 64},
                       {"schema": "wrong"}, {"kind": "FINALIZED"}, {"authorized": True}):
            doc = {**self.event(), **change}
            path = self.tree / "00000001.json"
            path.write_bytes(canonical(doc))
            path.chmod(0o600)
            with self.subTest(change=change):
                self.assert_unknown()

    def test_wrong_claim_digest_request_attempt_or_transaction_refused(self):
        for key, value in (("claimSha256", "9" * 64), ("requestSha256", "8" * 64),
                           ("attemptId", "7" * 64), ("transactionId", "c1-wrong-001")):
            doc = {**self.event(), key: value}
            path = self.tree / "00000001.json"
            path.write_bytes(canonical(doc))
            path.chmod(0o600)
            with self.subTest(key=key):
                self.assert_unknown()

    def test_wrong_observation_owner_or_receipt_digest_refused(self):
        self.append(self.event())
        event = self.event("ABORT_OBSERVATION")
        event["payload"]["receiptSha256"] = "9" * 64
        path = self.append(event)
        self.assert_unknown()
        event = self.event("DISPOSITION_OBSERVATION")
        event["sequence"] = 2
        event["previousSha256"] = digest(self.events[0])
        event["attemptId"] = "7" * 64
        path.write_bytes(canonical(event))
        self.assert_unknown()

    def test_zero_pin_same_runtime_or_same_archive_claim_refused(self):
        for change in ({"requestSha256": "0" * 64}, {"targetRuntimeSha": "a" * 40},
                       {"targetArchiveDigest": "sha256:" + "c" * 64}):
            claim = {**self.claim(), **change}
            path = self.tree / "00000001.json"
            path.write_bytes(canonical(self.event(claim=claim)))
            path.chmod(0o600)
            with self.subTest(change=change):
                self.assert_unknown()

    def test_gap_unknown_filename_empty_truncated_and_duplicate_json_refused(self):
        for name, raw in (("00000002.json", canonical(self.event())), ("latest.json", b"{}"),
                          ("00000001.json", b""), ("00000001.json", b'{"schema":'),
                          ("00000001.json", b'{"schema":1,"schema":2}')):
            for path in self.tree.iterdir():
                path.unlink()
            path = self.tree / name
            path.write_bytes(raw)
            path.chmod(0o600)
            with self.subTest(name=name, raw=raw):
                self.assert_unknown()

    def test_noncanonical_json_refused(self):
        path = self.tree / "00000001.json"
        path.write_bytes(json.dumps(self.event(), indent=2).encode())
        path.chmod(0o600)
        self.assert_unknown()

    def test_event_file_and_directory_count_budgets_refused_without_repair(self):
        path = self.tree / "00000001.json"
        path.write_bytes(b"x" * (history._MAX_BYTES + 1))
        path.chmod(0o600)
        self.assert_unknown()
        path.unlink()
        for n in range(1, history._MAX_EVENTS + 2):
            (self.tree / f"{n:08d}.json").touch(mode=0o600)
        self.assert_unknown()
        self.assertEqual(len(list(self.tree.iterdir())), 257)

    def test_total_budget_enforced_before_interpretation(self):
        self.append(self.event())
        with patch.object(history, "_MAX_TOTAL", 1):
            self.assert_unknown()

    def test_legacy_contents_and_dual_layout_conflict_always_block(self):
        path = self.legacy / "active.json"
        path.write_bytes(b"unknown legacy claim")
        path.chmod(0o600)
        result = self.inspect()
        self.assertEqual(result["status"], "LEGACY_LEDGER_BLOCKING")
        self.assertIs(result["historyPresent"], False)
        self.append(self.event())
        before = self.snapshot()
        result = self.inspect()
        self.assertEqual(result["status"], "LEGACY_LEDGER_BLOCKING")
        self.assertIs(result["historyPresent"], True)
        self.assert_blocked_flags(result)
        self.assertEqual(self.snapshot(), before)

    def test_missing_or_unsafe_layouts_are_not_created_or_fixed(self):
        self.tree.chmod(0o755)
        with self.assertRaises(ValueError):
            self.inspect()
        self.assertEqual(self.tree.stat().st_mode & 0o777, 0o755)
        self.tree.chmod(0o700)
        self.tree.rmdir()
        with self.assertRaises(OSError):
            self.inspect()
        self.assertFalse(self.tree.exists())

    def test_symlink_hardlink_fifo_and_public_event_file_refused(self):
        outside = self.root / "outside"
        outside.write_bytes(canonical(self.event()))
        outside.chmod(0o600)
        path = self.tree / "00000001.json"
        for kind in ("symlink", "hardlink", "fifo", "mode"):
            if kind == "symlink":
                path.symlink_to(outside)
            elif kind == "hardlink":
                os.link(outside, path)
            elif kind == "fifo":
                os.mkfifo(path, 0o600)
            else:
                path.write_bytes(outside.read_bytes())
                path.chmod(0o644)
            with self.subTest(kind=kind):
                self.assert_unknown()
            path.unlink()
        self.assertEqual(outside.read_bytes(), canonical(self.event()))

    def test_wrong_owner_or_device_and_symlink_directory_refused(self):
        with patch.object(local, "_OWNER", (12345, 12345)):
            with self.assertRaises(ValueError):
                self.inspect()
        fd = os.open(self.lock, os.O_RDONLY)
        try:
            with self.assertRaises(ValueError):
                local._file_key(fd, os.fstat(fd).st_dev + 1)
        finally:
            os.close(fd)
        self.tree.rename(self.base / "saved-history")
        self.tree.symlink_to(self.base / "saved-history", target_is_directory=True)
        with self.assertRaises((OSError, ValueError)):
            self.inspect()

    def test_shared_lock_excludes_independent_process_and_v1_scope(self):
        process, pipe = self.start(hold=True)
        self.assertEqual(self.receive(pipe), "HELD")
        second, other = self.start()
        self.assertIn("lock busy", self.receive(other))
        second.join(timeout=10)
        with self.assertRaisesRegex(ValueError, "lock busy"):
            with local._locked():
                self.fail("v1 acquired history's global lock")
        pipe.send("close")
        process.join(timeout=10)
        self.assertEqual(process.exitcode, 0)
        self.assertEqual(self.inspect()["status"], "NO_LOCAL_HISTORY_OBSERVED")

    def test_v1_scope_still_works_without_new_history_directory(self):
        self.tree.rmdir()
        with local._locked() as (fd, device, recheck, stack):
            self.assertEqual(os.fstat(fd).st_ino, self.legacy.stat().st_ino)
            recheck()
        self.assertFalse(self.tree.exists())
        # This compatibility is why v2 writers remain prohibited until shared
        # two-layout admission and old-entry controls are separately implemented.

    def test_same_byte_event_replacement_during_parse_is_rejected(self):
        path = self.append(self.event())
        parse = history._interpret
        def replace(rows):
            raw = path.read_bytes()
            path.unlink()
            path.write_bytes(raw)
            path.chmod(0o600)
            return parse(rows)
        with patch.object(history, "_interpret", side_effect=replace):
            with self.assertRaises(ValueError):
                self.inspect()

    def test_layout_and_lock_inode_replacement_are_rejected(self):
        parse = history._interpret
        def replace(rows):
            self.tree.rename(self.base / "displaced-history")
            self.tree.mkdir(mode=0o700)
            return parse(rows)
        with patch.object(history, "_interpret", side_effect=replace):
            with self.assertRaises(ValueError):
                self.inspect()
        self.tree.rmdir()
        (self.base / "displaced-history").rename(self.tree)
        def replace_lock(rows):
            self.lock.rename(self.base / "displaced-lock")
            self.lock.touch(mode=0o600)
            return parse(rows)
        with patch.object(history, "_interpret", side_effect=replace_lock):
            with self.assertRaises(ValueError):
                self.inspect()

    def test_fd_cleanup_on_good_and_malformed_history(self):
        before = set(os.listdir("/proc/self/fd"))
        self.inspect()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        self.append(self.event())
        (self.tree / "00000001.json").write_bytes(b"broken")
        self.assert_unknown()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_reader_never_calls_writes_fsync_mkdir_or_delete(self):
        self.append(self.event())
        before = self.snapshot()
        with patch.object(os, "write", side_effect=AssertionError("write forbidden")), \
             patch.object(os, "fsync", side_effect=AssertionError("fsync forbidden")), \
             patch.object(os, "mkdir", side_effect=AssertionError("mkdir forbidden")), \
             patch.object(os, "unlink", side_effect=AssertionError("unlink forbidden")), \
             patch.object(os, "rename", side_effect=AssertionError("rename forbidden")):
            self.assertEqual(self.inspect()["status"], "UNRESOLVED_ATTEMPT")
        self.assertEqual(self.snapshot(), before)

    def test_zero_argument_api_and_no_write_open_flags(self):
        self.assertEqual(len(inspect.signature(history.inspect_fixed_history).parameters), 0)
        self.append(self.event())
        real = os.open
        def readonly(path, flags, *args, **kwargs):
            self.assertEqual(flags & os.O_ACCMODE, os.O_RDONLY)
            self.assertFalse(flags & (os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            return real(path, flags, *args, **kwargs)
        with patch.object(os, "open", side_effect=readonly) as instrumented:
            # Keep the capability identity check accurate for the wrapper.
            with patch.object(os, "supports_dir_fd", os.supports_dir_fd | {instrumented}):
                self.assertEqual(self.inspect()["status"], "UNRESOLVED_ATTEMPT")


    def test_exact_256_event_boundary_preserves_all_consumed_identities(self):
        for n in range(1, 129):
            claim = self.claim(f"c1-history-{n:03d}", f"{n:064x}")
            self.append(self.event(claim=claim))
            self.append(self.event("DISPOSITION_OBSERVATION", claim=claim))
        result = self.inspect()
        self.assertEqual(result["eventCount"], 256)
        self.assertEqual(len(result["consumedTransactions"]), 128)
        self.assertEqual(result["unauthenticatedDispositionCount"], 128)
        self.assertEqual(result["status"], "DISPOSITION_CLAIM_UNAUTHENTICATED")
        self.assert_blocked_flags(result)

    def test_in_place_event_change_during_parse_is_rejected(self):
        path = self.append(self.event())
        parse = history._interpret
        def mutate(rows):
            with path.open("r+b") as stream:
                stream.write(b"X")
            return parse(rows)
        with patch.object(history, "_interpret", side_effect=mutate):
            with self.assertRaises(ValueError):
                self.inspect()


    def consume_legacy(self):
        if not hasattr(self, "_legacy_inputs"):
            import test_normal_runtime_readonly_review as f2
            fixture = f2.ReadonlyReviewTests()
            fixture.setUp()
            self.addCleanup(fixture.doCleanups)
            self._legacy_inputs = fixture.launch, fixture.request
        launch, request = self._legacy_inputs
        return local.consume_local_attempt(launch, request,
            expected_launch_sha256=digest(launch), expected_request_sha256=digest(request))

    def test_empty_v2_directory_disables_actual_legacy_consumption_without_writes(self):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "legacy entry disabled"):
            with self.consume_legacy():
                self.fail("legacy consumed with v2 present")
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(list(self.legacy.iterdir()), [])

    def test_any_v2_object_including_dangling_link_and_fifo_disables_legacy(self):
        self.tree.rmdir()
        for kind in ("file", "dangling-link", "fifo"):
            if kind == "file":
                self.tree.write_bytes(b"unknown v2 object")
            elif kind == "dangling-link":
                self.tree.symlink_to(self.base / "missing-history")
            else:
                os.mkfifo(self.tree, 0o600)
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, "legacy entry disabled"):
                with self.consume_legacy():
                    self.fail("legacy bypassed v2 object")
            self.assertEqual(list(self.legacy.iterdir()), [])
            self.tree.unlink()

    def test_v2_appearing_during_live_attempt_blocks_and_preserves_consumed_claim(self):
        self.tree.rmdir()
        with self.assertRaisesRegex(ValueError, "legacy entry disabled"):
            with self.consume_legacy() as handle:
                self.tree.mkdir(mode=0o700)
                handle.observation()
        names = {p.name for p in self.legacy.iterdir()}
        self.assertIn("active.json", names)
        self.assertEqual(len(names), 2)
        self.assertEqual(self.inspect()["status"], "LEGACY_LEDGER_BLOCKING")

    def test_v2_presence_prevents_legacy_inspection_and_abort_without_modifying_records(self):
        self.tree.rmdir()
        with self.consume_legacy() as handle:
            attempt = handle.observation()["attemptId"]
        self.tree.mkdir(mode=0o700)
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "legacy entry disabled"):
            local.inspect_local_admission()
        with self.assertRaises(ValueError):
            handle.record_abort(b"{}", attempt_id=attempt)
        self.assertEqual(self.snapshot(), before)

    def test_v2_stat_permission_error_does_not_mean_absent(self):
        self.tree.rmdir()
        real = os.stat
        def deny(path, *args, **kwargs):
            if path == local._HISTORY:
                raise PermissionError("synthetic inaccessible v2")
            return real(path, *args, **kwargs)
        with patch.object(os, "stat", side_effect=deny) as instrumented:
            # Preserve platform API identity while observing real dir_fd calls.
            with patch.object(os, "supports_dir_fd", os.supports_dir_fd | {instrumented}), \
                 patch.object(os, "supports_follow_symlinks", os.supports_follow_symlinks | {instrumented}):
                with self.assertRaises(PermissionError):
                    with local._locked():
                        self.fail("permission error treated as absent")
        self.assertEqual(list(self.legacy.iterdir()), [])

    def test_legacy_consumption_still_works_when_v2_absent_and_never_creates_v2(self):
        self.tree.rmdir()
        with self.consume_legacy() as handle:
            self.assertEqual(handle.observation()["status"], "LOCAL_ATTEMPT_HELD_UNRESOLVED")
        self.assertFalse(self.tree.exists())
        self.assertEqual(local.inspect_local_admission()["status"], "UNRESOLVED_ATTEMPT")


if __name__ == "__main__":
    unittest.main()
