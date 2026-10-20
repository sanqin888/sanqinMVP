"""R1C-1 synthetic capability scenarios; no root, VM, AWS, processes or live files."""
from dataclasses import replace
import ast
import copy
import json
from pathlib import Path
import sys
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import normal_runtime_launch as launch
    import normal_runtime_update as flow
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)

TXID = "r1c1-synthetic-0001"
ORIGINAL = {
    "api": {"restart": "always", "active": True},
    "worker": {"restart": "unless-stopped", "active": False},
    "backup": {"enabled": False, "active": False},
}
STATE_PIN = "5" * 64


def materials(transaction_id=TXID):
    # Not executable Guest/operator code. Hash-only startup fixture.
    return launch.freeze_launch_materials(
        source_commit="c" * 40, transaction_id=transaction_id,
        bootstrap_source="bootstrap.py",
        sources={"normal_runtime_update.py": b"CORE = 1\n",
                 "normal_runtime_launch.py": b"LAUNCH = 1\n",
                 "bootstrap.py": b"BOOTSTRAP = 1\n"})


def request():
    return flow.UpdateRequest(
        TXID, "a" * 40, "b" * 40, "sha256:" + "1" * 64, "sha256:" + "2" * 64,
        "c" * 40, "d" * 40, STATE_PIN, materials())


class SyntheticCapabilities:
    """Stateful fake resources, independent checks on ordering and preservation."""
    def __init__(self, *, ledger=None, before=None, after=None, error=RuntimeError,
                 corrupt=None, abort_error=False):
        self.ledger = ledger if ledger is not None else set()
        self.before, self.after, self.error = before, after, error
        self.corrupt, self.abort_error = corrupt, abort_error
        self.calls = []
        self.contexts = []
        self.records = []
        self.abort_receipts = []
        self.original = None
        self.original_pin = None
        self.snapshot_pin = None
        self.policies = copy.deepcopy(ORIGINAL)
        self.business_fenced = False
        self.phase = "INITIAL"
        self.snapshot_count = 0
        self.handoff_count = 0
        self.active_runtime_sha = "a" * 40

    def _start(self, ctx, step, phase):
        assert ctx.step == step
        assert self.phase == phase
        self.calls.append(step)
        self.contexts.append(ctx)
        if self.before == step:
            raise self.error("synthetic failure; secret detail must not be serialized")

    def _done(self, ctx):
        if self.after == ctx.step:
            raise self.error("synthetic failure after possible effect")
        result = flow.StepCompletion(
            ctx.step, ctx.request_sha256, ctx.previous_completion_sha256,
            launch.digest(ctx.step.encode()), STATE_PIN, self.original_pin, self.snapshot_pin)
        if self.corrupt:
            result = self.corrupt(ctx, result)
        self.records.append(result)
        return result

    def admit_and_verify_source(self, ctx):
        self._start(ctx, "VERIFY_SOURCE", "INITIAL")
        txid = json.loads(ctx.request_bytes)["transactionId"]
        if txid in self.ledger:
            raise ValueError("consumed transaction")
        self.ledger.add(txid)
        self.phase = "ADMITTED"
        return self._done(ctx)

    def prepare_private(self, ctx):
        self._start(ctx, "PREPARE_PRIVATE", "ADMITTED")
        assert self.active_runtime_sha == "a" * 40
        self.phase = "PREPARED"
        return self._done(ctx)

    def record_original_state(self, ctx):
        self._start(ctx, "RECORD_ORIGINAL", "PREPARED")
        self.original = copy.deepcopy(self.policies)
        self.original_pin = launch.digest(launch.canonical(self.original))
        self.phase = "ORIGINAL_RECORDED"
        return self._done(ctx)

    def freeze_maintenance(self, ctx):
        self._start(ctx, "FREEZE_MAINTENANCE", "ORIGINAL_RECORDED")
        assert self.original == ORIGINAL
        self.business_fenced = True
        self.policies["api"] = {"restart": "no", "active": False}
        self.policies["worker"] = {"restart": "no", "active": False}
        self.phase = "FROZEN"
        return self._done(ctx)

    def create_and_verify_snapshot(self, ctx):
        self._start(ctx, "SNAPSHOT_READY", "FROZEN")
        assert self.business_fenced and self.policies["api"]["restart"] == "no"
        assert not self.policies["api"]["active"]
        self.snapshot_count += 1
        self.snapshot_pin = launch.digest(b"synthetic exact source-bound available snapshot record")
        self.phase = "SNAPSHOT_READY"
        return self._done(ctx)

    def recheck_frozen(self, ctx):
        self._start(ctx, "RECHECK_FROZEN", "SNAPSHOT_READY")
        assert self.business_fenced and self.snapshot_pin
        assert self.policies["worker"]["restart"] == "no"
        self.phase = "READY_FOR_HANDOFF"
        return self._done(ctx)

    def handoff(self, ctx):
        self._start(ctx, "HANDOFF", "READY_FOR_HANDOFF")
        assert self.business_fenced and self.snapshot_pin and self.original_pin
        assert ctx.snapshot_record_sha256 == self.snapshot_pin
        self.handoff_count += 1
        self.active_runtime_sha = json.loads(ctx.request_bytes)["targetRuntimeSha"]
        self.phase = "HANDED_OFF"
        return self._done(ctx)

    def verify_installed(self, ctx):
        self._start(ctx, "VERIFY_INSTALLED", "HANDED_OFF")
        assert self.business_fenced and self.active_runtime_sha == "b" * 40
        self.phase = "VERIFIED_INSTALLED"
        return self._done(ctx)

    def restore_original_policies(self, ctx):
        self._start(ctx, "RESTORE_POLICIES", "VERIFIED_INSTALLED")
        assert self.business_fenced and ctx.original_state_sha256 == self.original_pin
        self.policies = copy.deepcopy(self.original)
        self.phase = "POLICIES_RESTORED"
        return self._done(ctx)

    def verify_restored(self, ctx):
        self._start(ctx, "VERIFY_RESTORED", "POLICIES_RESTORED")
        assert self.business_fenced and self.policies == ORIGINAL
        self.phase = "READY_TO_RELEASE"
        return self._done(ctx)

    def release_business(self, ctx):
        self._start(ctx, "RELEASE_BUSINESS", "READY_TO_RELEASE")
        assert self.business_fenced and self.policies == ORIGINAL
        self.business_fenced = False
        self.phase = "RELEASED"
        return self._done(ctx)

    def record_abort(self, ctx, receipt_bytes):
        self.abort_receipts.append((ctx, receipt_bytes))
        if self.abort_error:
            raise OSError("secondary abort persistence failure")
        return launch.digest(receipt_bytes)


class LaunchMaterialsTests(unittest.TestCase):
    def test_freezes_exact_bytes_and_complete_launch_proposal_without_authority(self):
        m = materials()
        d = m.document()
        self.assertEqual(d["argv"], [
            "/usr/bin/python3.12", "-I", "-S", "-B", launch.SOURCE_ROOT + "/bootstrap.py",
            "--transaction-id", TXID])
        self.assertEqual(d["environment"], {
            "HOME": "/root", "LANG": "C", "LC_ALL": "C", "PATH": "/usr/bin:/bin", "TZ": "UTC"})
        self.assertEqual((d["cwd"], d["uid"], d["gid"]), (launch.SOURCE_ROOT, 0, 0))
        self.assertEqual(d["entryPoint"], "normal_runtime_update.NormalUpdateFlow.run")
        self.assertEqual(d["platform"], {"os": "linux", "architecture": "x86_64",
                                         "pythonVersion": "3.12.3"})
        pin = d["sourceFiles"]["bootstrap.py"]
        self.assertEqual(pin, {"sha256": launch.digest(b"BOOTSTRAP = 1\n"), "bytes": 14})
        for key in ("sourceProvenanceAuthenticated", "dynamicDependencyClosureVerified", "launchAuthorized"):
            self.assertIs(d[key], False)
        d["environment"]["PYTHONPATH"] = "/tmp"
        self.assertNotIn("PYTHONPATH", m.document()["environment"])

    def test_source_change_changes_launch_binding_and_original_map_is_not_retained(self):
        raw = {"normal_runtime_update.py": b"one", "normal_runtime_launch.py": b"two",
               "bootstrap.py": b"three"}
        m = launch.freeze_launch_materials(source_commit="c" * 40, transaction_id=TXID,
                                           bootstrap_source="bootstrap.py", sources=raw)
        before = m.sha256()
        raw["bootstrap.py"] = b"changed"
        self.assertEqual(m.sha256(), before)
        changed = launch.freeze_launch_materials(source_commit="c" * 40, transaction_id=TXID,
                                                 bootstrap_source="bootstrap.py", sources=raw)
        self.assertNotEqual(changed.sha256(), before)

    def test_rejects_missing_core_unsafe_names_mutable_bytes_and_budgets(self):
        base = {"normal_runtime_update.py": b"x", "normal_runtime_launch.py": b"y",
                "bootstrap.py": b"z"}
        cases = [
            {"bootstrap.py": b"x"},
            {**base, "../escape.py": b"x"},
            {**base, "/absolute.py": b"x"},
            {**base, "bootstrap.py": bytearray(b"x")},
            {**base, "bootstrap.py": b""},
            {**base, "bootstrap.py": b"x" * 65537},
            {**base, **{f"extra_{i}.py": b"x" * 65536 for i in range(9)}},
        ]
        for sources in cases:
            with self.subTest(names=list(sources)):
                with self.assertRaises(launch.LaunchMaterialsBlocked):
                    launch.freeze_launch_materials(source_commit="c" * 40, transaction_id=TXID,
                                                   bootstrap_source="bootstrap.py", sources=sources)

    def test_rejects_forged_inventories_and_unbounded_subprocess_declarations(self):
        m = materials()
        values = [
            replace(m, source_commit=True), replace(m, transaction_id="short"),
            replace(m, bootstrap_source="normal_runtime_update.py"),
            replace(m, sources=m.sources + (m.sources[0],)),
            replace(m, sources=tuple(reversed(m.sources))),
            replace(m, sources=tuple(replace(p, size=True) for p in m.sources)),
            replace(m, subprocess_argvs=(("/bin/sh\n",),)),
            replace(m, subprocess_argvs=(("relative-command",),)),
            replace(m, subprocess_argvs=(("/usr/bin/../sudo",),)),
            replace(m, subprocess_argvs=(("/bin/..",),)),
            replace(m, subprocess_argvs=(("/usr/bin/id",),) * 2),
            replace(m, subprocess_argvs=(["/usr/bin/id"],)),
        ]
        for bad in values:
            with self.subTest(bad=bad):
                with self.assertRaises(launch.LaunchMaterialsBlocked):
                    bad.document()
        declared = replace(m, subprocess_argvs=(("/usr/bin/id", "-u"),)).document()
        self.assertEqual(declared["subprocessArgvs"], [["/usr/bin/id", "-u"]])


class NormalUpdateFlowTests(unittest.TestCase):
    def test_success_runs_the_same_core_and_restores_exact_original_states(self):
        caps = SyntheticCapabilities()
        report = flow.NormalUpdateFlow().run(request(), caps)
        expected = [stage for stage, _ in flow.STEPS]
        self.assertEqual(caps.calls, expected)
        self.assertEqual(report["completedSteps"], expected)
        self.assertEqual(report["attemptedSteps"], expected)
        self.assertEqual(report["status"], "COMPLETED")
        self.assertTrue(report["flowCompleted"])
        self.assertEqual(caps.policies, ORIGINAL)
        self.assertFalse(caps.business_fenced)
        self.assertEqual((caps.snapshot_count, caps.handoff_count), (1, 1))
        self.assertEqual(report["businessReleaseState"], "REPORTED_COMPLETE")
        self.assertEqual(report["abortRecordState"], "NOT_REQUESTED")
        self.assertFalse(caps.abort_receipts)
        self.assertEqual(report["decision"], "BLOCKED")
        for key in ("adapterEvidenceIndependentlyAuthenticated", "actualConsumptionVerified",
                    "journalReplayAllowed", "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(report[key], False)

    def test_request_rejections_and_missing_capability_do_not_call_any_adapter(self):
        for change in (
            {"current_runtime_sha": "b" * 40}, {"target_runtime_sha": "bad"},
            {"target_archive_digest": "sha256:" + "1" * 64},
            {"target_archive_digest": "bad"}, {"preserved_state_sha256": flow.ZERO},
            {"launch": materials("different-transaction-0001")}, {"transaction_id": True},
        ):
            caps = SyntheticCapabilities()
            with self.subTest(change=change), self.assertRaises(flow.NormalUpdateBlocked):
                flow.NormalUpdateFlow().run(replace(request(), **change), caps)
            self.assertEqual(caps.calls, [])
        caps = SyntheticCapabilities()
        caps.handoff = None
        with self.assertRaisesRegex(flow.NormalUpdateBlocked, "capabilities"):
            flow.NormalUpdateFlow().run(request(), caps)
        self.assertEqual(caps.calls, [])
        with self.assertRaises(flow.NormalUpdateBlocked):
            flow.NormalUpdateFlow().run({"readyToInstall": True}, SyntheticCapabilities())

    def test_failures_and_interruptions_at_every_boundary_never_run_follow_on_stages(self):
        steps = [stage for stage, _ in flow.STEPS]
        for where in ("before", "after"):
            for error in (ValueError, KeyboardInterrupt, SystemExit):
                for index, step in enumerate(steps):
                    caps = SyntheticCapabilities(**{where: step}, error=error)
                    driver = flow.NormalUpdateFlow()
                    with self.subTest(where=where, error=error, step=step):
                        with self.assertRaises(flow.NormalUpdateAborted) as caught:
                            driver.run(request(), caps)
                        report = caught.exception.receipt
                        self.assertIsInstance(caught.exception.__cause__, error)
                        self.assertEqual(report["status"], "ABORTED")
                        self.assertFalse(report["flowCompleted"])
                        self.assertEqual(report["attemptedSteps"], steps[:index + 1])
                        self.assertEqual(report["completedSteps"], steps[:index])
                        self.assertEqual(caps.calls, steps[:index + 1])
                        self.assertEqual(report["failure"]["step"], step)
                        self.assertNotIn("secret", json.dumps(report))
                        self.assertEqual(report["abortRecordState"], "REPORTED_RECORDED")
                        self.assertEqual(len(caps.abort_receipts), 1)
                        if index < steps.index("RESTORE_POLICIES"):
                            self.assertFalse(report["policyRestoreRequested"])
                        if index < steps.index("RELEASE_BUSINESS"):
                            self.assertEqual(report["businessReleaseState"], "NOT_REQUESTED")
                        with self.assertRaises(flow.NormalUpdateBlocked):
                            driver.run(request(), caps)
                        self.assertEqual(caps.calls, steps[:index + 1])

    def test_snapshot_timeout_after_creation_is_unknown_and_not_retried(self):
        caps = SyntheticCapabilities(after="SNAPSHOT_READY", error=TimeoutError)
        with self.assertRaises(flow.NormalUpdateAborted) as caught:
            flow.NormalUpdateFlow().run(request(), caps)
        r = caught.exception.receipt
        self.assertEqual(caps.snapshot_count, 1)
        self.assertEqual(caps.handoff_count, 0)
        self.assertIsNone(r["snapshotRecordSha256"])
        self.assertEqual(r["handoffState"], "NOT_REQUESTED")
        self.assertTrue(caps.business_fenced)
        self.assertEqual(caps.policies["api"]["restart"], "no")

    def test_partial_handoff_and_release_are_reported_unknown_not_rolled_back(self):
        for step in ("HANDOFF", "RELEASE_BUSINESS"):
            caps = SyntheticCapabilities(after=step)
            with self.subTest(step=step), self.assertRaises(flow.NormalUpdateAborted) as caught:
                flow.NormalUpdateFlow().run(request(), caps)
            report = caught.exception.receipt
            self.assertEqual(caps.active_runtime_sha, "b" * 40)
            self.assertEqual(report["maintenanceState"], "UNVERIFIED")
            if step == "HANDOFF":
                self.assertEqual(report["handoffState"], "UNKNOWN")
                self.assertTrue(caps.business_fenced)
                self.assertFalse(report["policyRestoreRequested"])
            else:
                self.assertEqual(report["businessReleaseState"], "UNKNOWN")
                self.assertFalse(caps.business_fenced)
                self.assertEqual(caps.policies, ORIGINAL)

    def test_wrong_or_unknown_completion_cannot_advance_or_restore(self):
        def corrupt(ctx, record):
            if ctx.step != "RECHECK_FROZEN":
                return record
            return replace(record, **changes)
        cases = (
            {"status": "UNKNOWN"}, {"step": "HANDOFF"},
            {"request_sha256": "f" * 64}, {"previous_completion_sha256": flow.ZERO},
            {"evidence_sha256": flow.ZERO}, {"preserved_state_sha256": "e" * 64},
            {"original_state_sha256": "e" * 64}, {"snapshot_record_sha256": "e" * 64},
            {"request_sha256": True}, {"original_state_sha256": True},
        )
        for changes in cases:
            caps = SyntheticCapabilities(corrupt=corrupt)
            with self.subTest(changes=changes), self.assertRaises(flow.NormalUpdateAborted):
                flow.NormalUpdateFlow().run(request(), caps)
            self.assertEqual(caps.handoff_count, 0)
            self.assertNotIn("RESTORE_POLICIES", caps.calls)
            self.assertTrue(caps.business_fenced)
        for forged in (True, {"status": "COMPLETE", "readyToInstall": True}):
            caps = SyntheticCapabilities(corrupt=lambda ctx, rec: forged)
            with self.assertRaises(flow.NormalUpdateAborted):
                flow.NormalUpdateFlow().run(request(), caps)
            self.assertEqual(caps.calls, ["VERIFY_SOURCE"])

    def test_missing_original_or_snapshot_record_blocks_before_handoff(self):
        for step, field in (("RECORD_ORIGINAL", "original_state_sha256"),
                            ("SNAPSHOT_READY", "snapshot_record_sha256")):
            caps = SyntheticCapabilities(corrupt=lambda ctx, rec: (
                replace(rec, **{field: None}) if ctx.step == step else rec))
            with self.subTest(step=step), self.assertRaises(flow.NormalUpdateAborted):
                flow.NormalUpdateFlow().run(request(), caps)
            self.assertEqual(caps.handoff_count, 0)
            self.assertNotIn("RESTORE_POLICIES", caps.calls)

    def test_abort_record_failure_preserves_original_cause_and_no_more_actions(self):
        caps = SyntheticCapabilities(after="HANDOFF", error=TimeoutError, abort_error=True)
        with self.assertRaises(flow.NormalUpdateAborted) as caught:
            flow.NormalUpdateFlow().run(request(), caps)
        self.assertIsInstance(caught.exception.__cause__, TimeoutError)
        r = caught.exception.receipt
        self.assertEqual(r["abortRecordState"], "FAILED_OR_UNKNOWN")
        self.assertEqual(r["abortRecordFailureType"], "OSError")
        self.assertEqual(r["failure"]["type"], "TimeoutError")
        self.assertEqual(caps.calls[-1], "HANDOFF")
        self.assertTrue(caps.business_fenced)

    def test_single_use_and_adapter_ledger_reject_new_driver_replay(self):
        caps = SyntheticCapabilities(after="HANDOFF")
        driver = flow.NormalUpdateFlow()
        with self.assertRaises(flow.NormalUpdateAborted):
            driver.run(request(), caps)
        with self.assertRaises(flow.NormalUpdateBlocked):
            driver.run(request(), caps)
        second = SyntheticCapabilities(ledger=caps.ledger)
        with self.assertRaises(flow.NormalUpdateAborted):
            flow.NormalUpdateFlow().run(request(), second)
        self.assertEqual(second.calls, ["VERIFY_SOURCE"])
        self.assertEqual(second.snapshot_count, 0)
        self.assertEqual(second.handoff_count, 0)


    def test_reentrant_driver_is_rejected_inside_a_capability_callback(self):
        caps = SyntheticCapabilities()
        driver = flow.NormalUpdateFlow()
        def attempt_reentry(ctx, completion):
            if ctx.step == "VERIFY_SOURCE":
                with self.assertRaises(flow.NormalUpdateBlocked):
                    driver.run(request(), caps)
            return completion
        caps.corrupt = attempt_reentry
        report = driver.run(request(), caps)
        self.assertTrue(report["flowCompleted"])
        self.assertEqual(caps.calls.count("VERIFY_SOURCE"), 1)

    def test_concurrent_driver_use_is_rejected_before_a_second_callback(self):
        entered, proceed = threading.Event(), threading.Event()
        caps = SyntheticCapabilities()
        driver = flow.NormalUpdateFlow()
        reports, failures = [], []
        def pause(ctx, completion):
            if ctx.step == "VERIFY_SOURCE":
                entered.set()
                if not proceed.wait(3):
                    raise TimeoutError("synthetic test rendezvous")
            return completion
        caps.corrupt = pause
        def run_first():
            try:
                reports.append(driver.run(request(), caps))
            except BaseException as exc:
                failures.append(exc)
        worker = threading.Thread(target=run_first, daemon=True)
        worker.start()
        try:
            self.assertTrue(entered.wait(3))
            with self.assertRaises(flow.NormalUpdateBlocked):
                driver.run(request(), caps)
        finally:
            proceed.set()
            worker.join(3)
        self.assertFalse(worker.is_alive())
        self.assertEqual(failures, [])
        self.assertEqual(len(reports), 1)
        self.assertTrue(reports[0]["flowCompleted"])
        self.assertEqual(caps.calls.count("VERIFY_SOURCE"), 1)

    def test_adapter_receipt_mutation_cannot_rewrite_accepted_predecessors(self):
        caps = SyntheticCapabilities()
        def corrupt(ctx, record):
            if ctx.step == "PREPARE_PRIVATE":
                object.__setattr__(caps.records[0], "evidence_sha256", "e" * 64)
            return record
        caps.corrupt = corrupt
        report = flow.NormalUpdateFlow().run(request(), caps)
        copied = caps.contexts[1].completions[0]
        self.assertNotEqual(json.loads(copied)["evidenceSha256"], "e" * 64)
        self.assertEqual(report["completionSha256"][0], launch.digest(copied))
        for previous, current in zip(caps.contexts, caps.contexts[1:]):
            self.assertEqual(current.completions[:-1], previous.completions)

    def test_completion_chain_and_launch_identity_are_bound_to_immutable_copies(self):
        caps = SyntheticCapabilities()
        req = request()
        r = flow.NormalUpdateFlow().run(req, caps)
        self.assertEqual(r["launchMaterialsSha256"], req.launch.sha256())
        for index, ctx in enumerate(caps.contexts):
            self.assertEqual(ctx.request_sha256, r["requestSha256"])
            self.assertEqual(len(ctx.completions), index)
            self.assertEqual(ctx.previous_completion_sha256,
                             flow.ZERO if index == 0 else launch.digest(ctx.completions[-1]))
            self.assertEqual(json.loads(ctx.request_bytes)["currentAppSha"], "c" * 40)
            self.assertEqual(json.loads(ctx.request_bytes)["previousAppSha"], "d" * 40)

    def test_architecture_keeps_sources_outside_bundle_without_live_imports_or_cli(self):
        self.assertEqual(len(SOURCE_FILES), 17)
        allowed = {"__future__", "dataclasses", "hashlib", "json", "re", "threading", "typing",
                   "normal_runtime_launch"}
        for name in ("normal_runtime_update.py", "normal_runtime_launch.py"):
            self.assertNotIn("ops/runtime/" + name, SOURCE_FILES)
            tree = ast.parse((ROOT / name).read_text())
            imports = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.update(n.name for n in node.names)
                elif isinstance(node, ast.ImportFrom):
                    imports.add(node.module)
            self.assertLessEqual(imports, allowed)
            self.assertNotIn("__main__", (ROOT / name).read_text())


if __name__ == "__main__":
    unittest.main()
