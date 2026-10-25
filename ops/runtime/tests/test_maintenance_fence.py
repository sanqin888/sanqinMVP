"""R2-A2-1 synthetic failures; no live host, VM, AWS, files or processes."""
from dataclasses import replace
import ast
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import maintenance_fence as fence
    import maintenance_fence_contract as contract
    from normal_runtime_launch import canonical, digest
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)

BOOT = "b" * 64


def registry():
    # Synthetic identities, deliberately mixed original policies and disabled tasks.
    def container(name, number, *, role="BUSINESS", restart="always", active="running", retry=0):
        return contract.OriginalPolicyRecord(
            "container:" + name, "CONTAINER", name, str(number) * 64, "a" * 64,
            role, "PRESERVE" if role == "SANDBOX" else "CONTROL", active,
            restart_name=restart, restart_max_retry=retry)

    def unit(name, role, *, enabled="enabled", active="active"):
        return contract.OriginalPolicyRecord(
            "unit:" + name, "SYSTEMD", name, name, "c" * 64, role,
            "CONTROL" if role == "BACKUP" else "PRESERVE", active, enabled_state=enabled)

    def entry(name, role="STARTUP", enabled="enabled"):
        return contract.OriginalPolicyRecord(
            "entry:" + name, "ENTRYPOINT", name, name, "d" * 64, role, "CONTROL",
            "inactive", enabled_state=enabled)

    records = (
        container("api", 1), container("db", 2, restart="on-failure", retry=7),
        container("web", 3),
        container("ubereats-worker", 4, restart="unless-stopped", active="exited"),
        container("sanq-clover-dev-cloudflared", 5, role="SANDBOX", restart="unless-stopped"),
        unit("sanq-backup.timer", "BACKUP"),
        unit("sanq-backup.service", "BACKUP", enabled="disabled", active="inactive"),
        unit("ssh.service", "MANAGEMENT"), unit("docker.socket", "SYSTEM"),
        unit("apt-daily-upgrade.timer", "SYSTEM"),
        entry("deploy-release"), entry("compose-up"),
        entry("backup-helper", "BACKUP", "disabled"), entry("rclone", "BACKUP"),
        entry("root-cron-personal"),
    )
    return contract.WriterStartupRegistry(
        "synthetic-host-01", tuple(sorted(records, key=lambda item: item.object_key)), contract.SCOPES)


def prepared():
    inventory = registry()
    binding = contract.FenceBinding(
        inventory.host_id, "synthetic-maintainer-01", "r2a2-synthetic-0001", 17,
        "e" * 64, inventory.sha256())
    return fence.prepare_fence(binding, inventory, BOOT)


def receipts(state):
    return tuple(contract.PersistenceReceipt(
        location, state.binding.sha256(), state.sha256(), state.revision,
        state.previous_sha256, digest(("synthetic-" + location).encode()))
        for location in ("LOCAL", "OFF_HOST"))


def observation(state, *, frozen=False):
    inventory = contract.registry_from_document(json.loads(state.registry_bytes))
    records = tuple(contract.frozen_policy(item) for item in inventory.records) if frozen else inventory.records
    return contract.FenceObservation(
        state.binding.sha256(), state.sha256(), state.sequence + 1, state.boot_id, "f" * 64,
        records, contract.SCOPES, credentials="AVAILABLE", management_available=True,
        business_admission="DENIED", external_events="HELD")


def freezing():
    state = prepared()
    return fence.begin_freeze(state, state.binding, receipts(state), observation(state))


def frozen_state():
    state = freezing()
    return fence.assess_frozen(state, state.binding, receipts(state), observation(state, frozen=True))


class PowerCut(BaseException):
    pass


class SyntheticHost:
    """Only mutable tuples in this test; not an implementation of a live adapter."""
    def __init__(self):
        self.records = registry().records

    def apply_some(self, count=None):
        records = list(self.records)
        for index, item in enumerate(records):
            if count is not None and index == count:
                self.records = tuple(records)
                raise PowerCut()
            records[index] = contract.frozen_policy(item)
        self.records = tuple(records)


class SyntheticCustody:
    """Two byte strings model crash points, not fsync, custody or a durable CAS."""
    def __init__(self):
        self.local = None
        self.off_host = None

    def persist(self, state, *, cut=None):
        if cut == "BEFORE_LOCAL":
            raise PowerCut()
        self.local = state.encode()
        if cut == "AFTER_LOCAL":
            raise PowerCut()
        self.off_host = state.encode()
        if cut == "AFTER_OFF_HOST":
            raise PowerCut()
        return receipts(state)

    def claims_for(self, state):
        claims = receipts(state)
        return tuple(item for item in claims
                     if (self.local if item.location == "LOCAL" else self.off_host) == state.encode())


class FenceContractTests(unittest.TestCase):
    def test_original_policy_record_is_exact_and_restore_does_not_mean_enable_everything(self):
        inventory = registry()
        document = inventory.document()
        self.assertEqual(contract.registry_from_document(document), inventory)
        policies = {item.name: item for item in inventory.records}
        self.assertEqual(policies["db"].restart_max_retry, 7)
        self.assertEqual(policies["ubereats-worker"].active_state, "exited")
        self.assertEqual(policies["sanq-backup.service"].enabled_state, "disabled")
        self.assertEqual(policies["backup-helper"].enabled_state, "disabled")
        self.assertNotEqual(inventory.sha256(), replace(
            inventory, host_id="synthetic-other-host").sha256())

    def test_rejects_invalid_unknown_and_protected_policy_classification(self):
        records = {item.name: item for item in registry().records}
        cases = (
            replace(records["api"], native_id="not-a-container-id"),
            replace(records["api"], identity_sha256="0" * 64),
            replace(records["api"], active_state="unknown"),
            replace(records["api"], restart_name="default"),
            replace(records["api"], restart_max_retry=True),
            replace(records["api"], restart_max_retry=1),
            replace(records["api"], disposition="PRESERVE"),
            replace(records["api"], role=[]),
            replace(records["api"], enabled_state="enabled"),
            replace(records["ssh.service"], enabled_state="unknown"),
            replace(records["ssh.service"], native_id="different.service"),
            replace(records["ssh.service"], role="BACKUP", disposition="CONTROL"),
            replace(records["docker.socket"], role="STARTUP", disposition="CONTROL"),
            replace(records["apt-daily-upgrade.timer"], role="STARTUP", disposition="CONTROL"),
            replace(records["sanq-clover-dev-cloudflared"], role="BUSINESS", disposition="CONTROL"),
            replace(records["sanq-clover-dev-cloudflared"], role="SYSTEM"),
            replace(records["deploy-release"], restart_name="always"),
        )
        for item in cases:
            with self.subTest(item=item):
                with self.assertRaises(contract.FenceBlocked):
                    item.document()

    def test_registry_requires_complete_declared_coverage_and_unique_classified_identities(self):
        good = registry()
        other_key_same_native = replace(good.records[0], object_key="another-object")
        duplicate_name = replace(good.records[0], object_key="another-object", native_id="9" * 64)
        cases = (
            replace(good, covered_scopes=contract.SCOPES[:-1]),
            replace(good, unclassified_objects=("unknown-user-cron",)),
            replace(good, records=list(good.records)),
            replace(good, records=tuple(reversed(good.records))),
            replace(good, records=()),
            replace(good, records=good.records + (good.records[-1],)),
            replace(good, records=tuple(sorted(good.records + (other_key_same_native,),
                                               key=lambda item: item.object_key))),
            replace(good, records=tuple(sorted(good.records + (duplicate_name,),
                                               key=lambda item: item.object_key))),
            replace(good, records=tuple(item for item in good.records if item.role != "MANAGEMENT")),
        )
        for item in cases:
            with self.subTest(item=item):
                with self.assertRaises(contract.FenceBlocked):
                    item.document()

    def test_binding_rejects_boolean_or_invalid_epoch_and_mismatched_registry_host_or_pin(self):
        state = prepared()
        for changes in ({"epoch": True}, {"epoch": 0}, {"epoch": -1}, {"epoch": 2147483648},
                        {"transaction_id": "short"}, {"request_sha256": "0" * 64},
                        {"registry_sha256": "9" * 64}, {"host_id": "another-host"}):
            with self.subTest(changes=changes):
                with self.assertRaises(contract.FenceBlocked):
                    fence.prepare_fence(replace(state.binding, **changes), registry(), BOOT)

    def test_prepared_intent_copies_caller_policies_and_document_mutation_cannot_rewrite_it(self):
        inventory = registry()
        state = fence.prepare_fence(prepared().binding, inventory, BOOT)
        raw = state.encode()
        object.__setattr__(inventory.records[0], "restart_name", "no")
        document = state.document()
        document["registry"]["records"].clear()
        document["binding"]["epoch"] = 999
        self.assertEqual(state.encode(), raw)


class FenceTransitionTests(unittest.TestCase):
    def assert_denied(self, state):
        self.assertEqual(state.document()["businessAdmission"], "DENY")
        for item in registry().records:
            for action in ("WRITE", "START", "COMPOSE_UP", "DEPLOY", "BACKUP_RUN",
                           "RESTORE_POLICIES", "RELEASE_BUSINESS", "INSTALL_RUNTIME"):
                verdict = fence.deny_verdict(state, state.binding, item.object_key, action)
                self.assertEqual(verdict["decision"], "DENY")
                self.assertIs(verdict["authorizedToMutateProduction"], False)
                self.assertIs(verdict["readyToInstall"], False)

    def test_success_only_models_frozen_policy_claims_and_never_grants_writes(self):
        state = prepared()
        original_bytes = state.registry_bytes
        self.assert_denied(state)
        for transition, frozen in ((fence.begin_freeze, False), (fence.assess_frozen, True),
                                   (fence.assess_frozen, True)):
            previous = state
            state = transition(state, state.binding, receipts(state), observation(state, frozen=frozen))
            self.assertEqual(state.previous_sha256, previous.sha256())
            self.assertEqual(state.revision, previous.revision + 1)
            self.assertEqual(state.sequence, previous.sequence + 1)
            self.assertEqual(state.registry_bytes, original_bytes)
            self.assert_denied(state)
            for key in ("persistenceVerified", "liveFenceVerified", "journalReplayAllowed",
                        "authorizedToMutateProduction", "readyToInstall"):
                self.assertIs(state.document()[key], False)
        self.assertEqual(state.phase, "FROZEN")
        self.assertEqual(state.document()["decision"], "BLOCKED")

    def test_missing_local_or_off_host_persistence_never_enters_freezing(self):
        state = prepared()
        for claims in ((), receipts(state)[:1], receipts(state)[1:], list(receipts(state))):
            with self.subTest(claims=claims):
                result = fence.begin_freeze(state, state.binding, claims, observation(state))
                self.assertEqual(result.phase, "INCIDENT")
                self.assertEqual(result.failure_code, "PERSISTENCE_UNCONFIRMED")
                self.assertEqual(result.sequence, 0)
                self.assert_denied(result)

    def test_receipts_are_bound_to_exact_owner_epoch_predecessor_revision_and_evidence(self):
        state = freezing()
        local, remote = receipts(state)
        cases = (
            (local, local), (remote, remote), (local, {}),
            (replace(local, location=[]), remote),
            (replace(local, revision=True), remote),
            (replace(local, revision=0), remote),
            (replace(local, state_sha256="1" * 64), remote),
            (replace(local, binding_sha256="2" * 64), remote),
            (replace(local, previous_sha256=None), remote),
            (replace(local, evidence_sha256="0" * 64), remote),
            receipts(prepared()),
        )
        for claims in cases:
            with self.subTest(claims=claims):
                result = fence.assess_frozen(state, state.binding, claims, observation(state, frozen=True))
                self.assertEqual(result.phase, "INCIDENT")
                self.assertEqual(result.failure_code, "INVALID_PERSISTENCE")

    def test_unknown_consumers_missing_coverage_and_access_uncertainty_become_incidents(self):
        state = freezing()
        good = observation(state, frozen=True)
        cases = (
            ({"covered_scopes": contract.SCOPES[:-1]}, "COVERAGE_INCOMPLETE"),
            ({"unknown_objects": ("other-user-cron",)}, "UNKNOWN_OBJECT"),
            ({"credentials": "UNAVAILABLE"}, "CREDENTIALS_UNAVAILABLE"),
            ({"credentials": "UNKNOWN"}, "CREDENTIALS_UNAVAILABLE"),
            ({"management_available": False}, "MANAGEMENT_UNAVAILABLE"),
            ({"management_available": 1}, "MANAGEMENT_UNAVAILABLE"),
            ({"business_admission": "OPEN"}, "ADMISSION_OPEN_OR_UNKNOWN"),
            ({"business_admission": "UNKNOWN"}, "ADMISSION_OPEN_OR_UNKNOWN"),
            ({"external_events": "UNKNOWN"}, "EXTERNAL_EVENTS_UNKNOWN"),
            ({"evidence_sha256": "0" * 64}, "OBSERVATION_INVALID"),
        )
        for changes, reason in cases:
            with self.subTest(changes=changes):
                result = fence.assess_frozen(state, state.binding, receipts(state), replace(good, **changes))
                self.assertEqual((result.phase, result.failure_code), ("INCIDENT", reason))
                self.assert_denied(result)

    def test_rebuilt_containers_reenabled_tasks_and_changed_preserve_objects_are_not_frozen(self):
        state = freezing()
        good = observation(state, frozen=True)
        index_by_name = {item.name: index for index, item in enumerate(good.records)}
        cases = (
            ("api", {"native_id": "9" * 64}),
            ("api", {"identity_sha256": "9" * 64}),
            ("api", {"restart_name": "always"}),
            ("api", {"active_state": "running"}),
            ("sanq-backup.timer", {"enabled_state": "enabled"}),
            ("deploy-release", {"enabled_state": "enabled"}),
            ("rclone", {"active_state": "active"}),
            ("ssh.service", {"active_state": "inactive"}),
            ("docker.socket", {"active_state": "inactive"}),
            ("sanq-clover-dev-cloudflared", {"restart_name": "no"}),
            ("sanq-clover-dev-cloudflared", {"active_state": "exited"}),
        )
        for name, changes in cases:
            with self.subTest(name=name, changes=changes):
                records = list(good.records)
                index = index_by_name[name]
                records[index] = replace(records[index], **changes)
                result = fence.assess_frozen(state, state.binding, receipts(state),
                                             replace(good, records=tuple(records)))
                self.assertEqual((result.phase, result.failure_code),
                                 ("INCIDENT", "POLICY_OR_IDENTITY_DRIFT"))
        for records in (good.records[:-1], good.records + (good.records[0],),
                        tuple(reversed(good.records)), list(good.records), good.records * 129):
            result = fence.assess_frozen(state, state.binding, receipts(state),
                                         replace(good, records=records))
            self.assertEqual(result.phase, "INCIDENT")

    def test_observations_bind_fresh_sequence_exact_state_boot_and_fence_identity(self):
        state = frozen_state()
        good = observation(state, frozen=True)
        cases = (
            ({"sequence": state.sequence}, "STALE_OBSERVATION"),
            ({"sequence": state.sequence + 2}, "STALE_OBSERVATION"),
            ({"sequence": True}, "STALE_OBSERVATION"),
            ({"state_sha256": prepared().sha256()}, "OBSERVATION_IDENTITY_MISMATCH"),
            ({"binding_sha256": "9" * 64}, "OBSERVATION_IDENTITY_MISMATCH"),
            ({"boot_id": "9" * 64}, "BOOT_CHANGED"),
        )
        for changes, reason in cases:
            with self.subTest(changes=changes):
                result = fence.assess_frozen(state, state.binding, receipts(state), replace(good, **changes))
                self.assertEqual((result.phase, result.failure_code), ("INCIDENT", reason))

    def test_other_owner_request_host_transaction_or_epoch_cannot_advance_or_abort_this_fence(self):
        state = freezing()
        original = state.encode()
        for changes in ({"owner_id": "other-maintainer"}, {"transaction_id": "other-transaction"},
                        {"epoch": 18}, {"host_id": "another-host"},
                        {"request_sha256": "9" * 64}, {"registry_sha256": "9" * 64}):
            binding = replace(state.binding, **changes)
            with self.subTest(changes=changes):
                with self.assertRaises(contract.FenceBlocked):
                    fence.assess_frozen(state, binding, receipts(state), observation(state, frozen=True))
                with self.assertRaises(contract.FenceBlocked):
                    fence.record_abort(state, binding, "TRANSPORT_LOST")
                self.assertEqual(state.encode(), original)

    def test_repeated_begin_and_out_of_order_frozen_claims_do_not_skip_the_original_record(self):
        for state, transition, is_frozen in (
                (prepared(), fence.assess_frozen, True), (freezing(), fence.begin_freeze, False),
                (frozen_state(), fence.begin_freeze, False)):
            result = transition(state, state.binding, receipts(state), observation(state, frozen=is_frozen))
            self.assertEqual((result.phase, result.failure_code), ("INCIDENT", "INVALID_PHASE"))
        state = prepared()
        result = fence.begin_freeze(state, state.binding, receipts(state), observation(state, frozen=True))
        self.assertEqual(result.failure_code, "POLICY_OR_IDENTITY_DRIFT")

    def test_timeout_disconnect_interrupt_and_abort_storage_failure_never_restore_or_release(self):
        for state in (prepared(), freezing(), frozen_state()):
            for reason in ("TIMEOUT", "TRANSPORT_LOST", "INTERRUPTED", "ABORT_EVIDENCE_UNAVAILABLE"):
                with self.subTest(phase=state.phase, reason=reason):
                    result = fence.record_abort(state, state.binding, reason)
                    self.assertEqual(result.failed_phase, state.phase)
                    self.assertEqual(result.registry_bytes, state.registry_bytes)
                    self.assertIsNone(result.evidence_sha256)
                    self.assert_denied(result)

    def test_first_incident_is_preserved_and_new_calls_do_not_resume_it(self):
        state = freezing()
        incident = fence.record_abort(state, state.binding, "TIMEOUT", "f" * 64)
        self.assertIs(fence.record_abort(incident, incident.binding, "TRANSPORT_LOST"), incident)
        self.assertIs(fence.assess_frozen(incident, incident.binding, (), {}), incident)
        self.assertEqual(incident.failure_code, "TIMEOUT")
        with self.assertRaises(contract.FenceBlocked):
            fence.record_abort(state, state.binding, "error with secret detail")
        self.assertNotIn("secret", incident.encode().decode())

    def test_clover_tunnel_management_and_system_units_are_preserved_without_mutation_authority(self):
        original = registry()
        frozen = tuple(contract.frozen_policy(item) for item in original.records)
        for before, after in zip(original.records, frozen):
            if before.role in contract.PRESERVE_ROLES:
                self.assertIs(before, after)
                verdict = fence.deny_verdict(prepared(), prepared().binding, before.object_key, "STOP")
                self.assertEqual(verdict["reason"], "PRESERVE_OBJECT")
        tunnel = next(item for item in frozen if item.name == "sanq-clover-dev-cloudflared")
        self.assertEqual((tunnel.restart_name, tunnel.active_state), ("unless-stopped", "running"))

    def test_unknown_entrypoint_is_denied_in_every_phase(self):
        for state in (prepared(), freezing(), frozen_state()):
            verdict = fence.deny_verdict(state, state.binding, "unknown:compose", "COMPOSE_UP")
            self.assertEqual((verdict["decision"], verdict["reason"]), ("DENY", "UNKNOWN_OBJECT"))


class FenceCrashAndReloadTests(unittest.TestCase):
    def test_crash_before_either_original_copy_or_between_copies_cannot_begin_freezing(self):
        for cut in ("BEFORE_LOCAL", "AFTER_LOCAL"):
            state, custody, host = prepared(), SyntheticCustody(), SyntheticHost()
            original = host.records
            with self.assertRaises(PowerCut):
                custody.persist(state, cut=cut)
            result = fence.begin_freeze(state, state.binding, custody.claims_for(state), observation(state))
            self.assertEqual(result.phase, "INCIDENT")
            self.assertEqual(host.records, original)

    def test_crash_after_both_copies_reloads_for_review_and_never_implicitly_advances(self):
        for state in (prepared(), freezing(), frozen_state()):
            custody, host = SyntheticCustody(), SyntheticHost()
            original = host.records
            with self.assertRaises(PowerCut):
                custody.persist(state, cut="AFTER_OFF_HOST")
            self.assertEqual(custody.local, custody.off_host)
            for raw in (custody.local, custody.off_host):
                result = fence.reload_for_review(raw, state.sha256(), state.binding)
                self.assertEqual((result.phase, result.failure_code),
                                 ("INCIDENT", "RESTART_REVIEW_REQUIRED"))
                self.assertEqual(result.registry_bytes, state.registry_bytes)
                self.assertEqual(host.records, original)

    def test_partial_freeze_power_cut_preserves_changed_metadata_without_finally_restore(self):
        state, host, custody = freezing(), SyntheticHost(), SyntheticCustody()
        custody.persist(state)
        original = host.records
        with self.assertRaises(PowerCut):
            host.apply_some(2)
        partially_frozen = host.records
        self.assertNotEqual(partially_frozen, original)
        result = fence.reload_for_review(custody.off_host, state.sha256(), state.binding)
        self.assertEqual(result.phase, "INCIDENT")
        self.assertEqual(host.records, partially_frozen)
        self.assertEqual(json.loads(result.registry_bytes), registry().document())
        self.assertEqual(fence.deny_verdict(result, result.binding, "container:api", "START")["decision"],
                         "DENY")

    def test_local_and_off_host_divergence_rejects_stale_predecessor_receipts(self):
        old, state, custody = prepared(), freezing(), SyntheticCustody()
        custody.persist(old)
        with self.assertRaises(PowerCut):
            custody.persist(state, cut="AFTER_LOCAL")
        self.assertNotEqual(custody.local, custody.off_host)
        result = fence.assess_frozen(state, state.binding, custody.claims_for(state),
                                     observation(state, frozen=True))
        self.assertEqual((result.phase, result.failure_code), ("INCIDENT", "PERSISTENCE_UNCONFIRMED"))

    def test_reload_requires_separate_pin_and_exact_binding(self):
        state = frozen_state()
        for raw, expected, binding in (
                (state.encode(), "9" * 64, state.binding),
                (prepared().encode(), state.sha256(), state.binding),
                (state.encode(), state.sha256(), replace(state.binding, epoch=18)),
                (bytearray(state.encode()), state.sha256(), state.binding),
                (b"x" * (fence.MAX_STATE_BYTES + 1), "a" * 64, state.binding)):
            with self.subTest(expected=expected, binding=binding):
                with self.assertRaises(contract.FenceBlocked):
                    fence.reload_for_review(raw, expected, binding)

    def test_reload_rejects_truncated_duplicate_unknown_fields_noncanonical_and_forged_authority(self):
        state = frozen_state()
        value = state.document()
        cases = [state.encode()[:-1], state.encode() + b"\n",
                 b'{"schema":"one","schema":"two"}', b"[]",
                 b'{"value":NaN}', b"[" * 2000 + b"]" * 2000]
        for field, changed in (("unexpected", True), ("authorizedToMutateProduction", True),
                               ("businessAdmission", "ALLOW"), ("phase", "RELEASED"),
                               ("revision", True), ("previousSha256", None)):
            cases.append(canonical({**value, field: changed}))
        registry_value = value["registry"]
        cases.append(canonical({**value, "registry": {**registry_value, "unclassifiedObjects": ["unknown"]}}))
        for raw in cases:
            with self.subTest(raw=raw[:100]):
                with self.assertRaises(contract.FenceBlocked):
                    fence.reload_for_review(raw, digest(raw), state.binding)

    def test_reload_of_incident_keeps_first_abort_evidence_and_forbids_resume(self):
        state = freezing()
        incident = fence.record_abort(state, state.binding, "TRANSPORT_LOST", "f" * 64)
        reloaded = fence.reload_for_review(incident.encode(), incident.sha256(), incident.binding)
        self.assertEqual(reloaded.encode(), incident.encode())
        self.assertEqual(reloaded.failure_code, "TRANSPORT_LOST")


class FenceArchitectureTests(unittest.TestCase):
    def test_model_has_no_host_imports_cli_dynamic_execution_or_release_entrypoint(self):
        allowed = {"__future__", "dataclasses", "re", "json",
                   "normal_runtime_launch", "maintenance_fence_contract"}
        self.assertEqual(len(SOURCE_FILES), 17)
        for name in ("maintenance_fence_contract.py", "maintenance_fence.py"):
            self.assertNotIn("ops/runtime/" + name, SOURCE_FILES)
            source = (ROOT / name).read_text()
            self.assertNotIn("__main__", source)
            imports = set()
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.update(item.name for item in node.names)
                elif isinstance(node, ast.ImportFrom):
                    imports.add(node.module)
                elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    self.assertNotIn(node.func.id, {"open", "exec", "eval", "__import__"})
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    self.assertNotIn(node.name, {"restore_original_policies", "release_business",
                                                 "handoff", "create_and_verify_snapshot"})
            self.assertLessEqual(imports, allowed)


if __name__ == "__main__":
    unittest.main()
