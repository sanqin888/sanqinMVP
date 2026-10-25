"""R2-A2-3-P1 offline Boot Guard, fake receipt and CAS negative tests.

No actual storage, daemon, VM, systemd or off-host service is used or tested.
"""
from dataclasses import FrozenInstanceError, replace
import ast
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import maintenance_boot_guard as guard
    import maintenance_boot_guard_contract as contract
    from normal_runtime_launch import canonical, digest
    from build_bundle import SOURCE_FILES
finally:
    sys.path.pop(0)

HOST = "lab-host-01"
INSTALL = "lab-install-01"
OWNER = "synthetic-maintainer"
TXID = "r2a2-boot-0001"


def anchor():
    return contract.InstallationAnchor(HOST, INSTALL, "a" * 64, "b" * 64)


def initial():
    a = anchor()
    return contract.BootGuardState(a.sha256(), HOST, INSTALL, OWNER, TXID, 1, 0,
                                   "INSTALLED_INACTIVE", None, "c" * 64)


def proposed(*, phase="READY_TO_ARM"):
    old = initial()
    return replace(old, epoch=2, revision=1, previous_sha256=old.sha256(), phase=phase)


def proposal(state):
    return contract.CasRequest(
        state.host_id, state.installation_id, state.owner_id, state.transaction_id,
        state.epoch - 1, state.epoch, state.previous_sha256, state.sha256(), "d" * 64)


def receipts(state, request=None):
    request = request or proposal(state)
    return tuple(contract.CustodyReceipt(
        location, request.sha256(), state.host_id, state.installation_id,
        state.owner_id, state.transaction_id, state.epoch, state.revision,
        state.previous_sha256, state.sha256(), digest(location.encode()))
        for location in ("LOCAL", "OFF_HOST"))


class SyntheticLocalStore:
    """Mutable memory only: NEVER file/dir fsync or a trust anchor."""

    def __init__(self):
        self.state = None

    def commit_local(self, request, state_bytes):
        contract.require(digest(state_bytes) == request.proposed_state_sha256,
                         "LOCAL_BYTES_MISMATCH")
        self.state = state_bytes
        state = contract.decode_state(state_bytes)
        return receipts(state, request)[0]


class SyntheticRemoteCas:
    """Independent in-memory head for testing races; not off-host durability."""

    def __init__(self):
        self.epoch = 0
        self.state_sha256 = None

    def compare_and_swap(self, request):
        request.document()
        contract.require(request.expected_epoch == self.epoch
                         and request.expected_state_sha256 == self.state_sha256,
                         "REMOTE_CAS_CONFLICT")
        self.epoch = request.proposed_epoch
        self.state_sha256 = request.proposed_state_sha256
        return contract.CustodyReceipt(
            "OFF_HOST", request.sha256(), request.host_id,
            request.installation_id, request.owner_id, request.transaction_id,
            request.proposed_epoch, request.proposed_epoch - 1,
            request.expected_state_sha256, request.proposed_state_sha256,
            digest(b"synthetic-remote"))


def evaluate(state=None, *, installation=None, request=None, claims=None,
             host=HOST, reachable=True):
    state = proposed() if state is None else state
    return guard.evaluate_boot_candidate(
        observed_host_id=host, anchor=anchor() if installation is None else installation,
        state=state, request=proposal(state) if request is None else request,
        receipts=receipts(state) if claims is None else claims,
        off_host_available=reachable)


class BootGuardEligibilityTests(unittest.TestCase):
    def test_initial_and_ready_candidate_can_never_grant_start_or_writes(self):
        for state in (initial(), proposed()):
            with self.subTest(phase=state.phase):
                result = evaluate(state)
                self.assertEqual(result.candidate, "ALLOW_CANDIDATE")
                self.assertEqual(result.reason, "CLAIMS_CORRELATED_ONLY")
                self.assertEqual(result.decision, "DENY")
                for prop in ("authorized_to_start_docker", "persistence_verified",
                             "off_host_cas_verified", "live_fence_verified",
                             "authorized_to_mutate_production", "ready_to_install"):
                    self.assertIs(getattr(result, prop), False)

    def test_nominal_claims_do_not_turn_maintenance_incident_or_release_into_allow(self):
        for phase in ("ARMING", "FENCED", "INCIDENT", "UNKNOWN_OR_CORRUPT",
                      "OFF_HOST_UNREACHABLE", "RELEASE_PENDING", "RELEASED"):
            with self.subTest(phase=phase):
                result = evaluate(proposed(phase=phase))
                self.assertEqual(result.candidate, "DENY")
                self.assertFalse(result.authorized_to_start_docker)
                if phase == "RELEASED":
                    self.assertEqual(result.reason, "RELEASE_AUTHORITY_NOT_IMPLEMENTED")

    def test_missing_enrollment_never_means_unenrolled_legacy_allow(self):
        state = proposed()
        for changes, reason in (
            ({"anchor": None}, "MISSING_ENROLLMENT_ANCHOR"),
            ({"anchor": "not-an-anchor"}, "MISSING_ENROLLMENT_ANCHOR"),
            ({"anchor": replace(anchor(), host_id="other-host")}, "WRONG_HOST"),
            ({"state": None}, "MISSING_OR_INVALID_STATE"),
        ):
            with self.subTest(changes=changes):
                args = {"observed_host_id": HOST, "anchor": anchor(), "state": state,
                        "request": proposal(state), "receipts": receipts(state),
                        "off_host_available": True}
                args.update(changes)
                result = guard.evaluate_boot_candidate(**args)
                self.assertEqual((result.candidate, result.reason), ("DENY", reason))

    def test_host_install_anchor_pins_and_invalid_identity_fail_closed(self):
        state = proposed()
        for installation, altered_state, host in (
            (anchor(), state, "different-host"),
            (replace(anchor(), installation_id="other-install"), state, HOST),
            (replace(anchor(), guard_source_sha256="e" * 64), state, HOST),
            (replace(anchor(), unit_source_sha256="f" * 64), state, HOST),
            (anchor(), replace(state, anchor_sha256="e" * 64), HOST),
            (anchor(), replace(state, host_id="different-host"), HOST),
            (anchor(), replace(state, installation_id="other-install"), HOST),
            (anchor(), state, ""),
        ):
            with self.subTest(host=host, installation=installation, altered=altered_state):
                verdict = guard.evaluate_boot_candidate(
                    observed_host_id=host, anchor=installation, state=altered_state,
                    request=proposal(state), receipts=receipts(state),
                    off_host_available=True)
                self.assertEqual(verdict.candidate, "DENY")

    def test_off_host_unreachable_and_unknown_types_are_denied(self):
        state = proposed()
        for value in (False, None, 1, "YES"):
            with self.subTest(value=value):
                result = guard.evaluate_boot_candidate(
                    observed_host_id=HOST, anchor=anchor(), state=state,
                    request=proposal(state), receipts=receipts(state),
                    off_host_available=value)
                self.assertEqual((result.candidate, result.reason),
                                 ("DENY", "OFF_HOST_UNREACHABLE"))

    def test_missing_cas_or_receipts_denied(self):
        state = proposed()
        for request, pair, reason in (
            (None, receipts(state), "MISSING_CAS_REQUEST"),
            (proposal(state), None, "MISSING_CUSTODY_PAIR"),
            (proposal(state), (), "PAIR_REQUIRED"),
            (proposal(state), receipts(state)[:1], "PAIR_REQUIRED"),
            (proposal(state), receipts(state) + receipts(state)[:1], "PAIR_REQUIRED"),
            (proposal(state), list(receipts(state)), "MISSING_CUSTODY_PAIR"),
        ):
            with self.subTest(reason=reason, pair=pair):
                verdict = guard.evaluate_boot_candidate(
                    observed_host_id=HOST, anchor=anchor(), state=state,
                    request=request, receipts=pair, off_host_available=True)
                self.assertEqual((verdict.candidate, verdict.reason), ("DENY", reason))


class BootGuardContractTests(unittest.TestCase):
    def test_canonical_state_roundtrip_and_no_mutation(self):
        state = proposed()
        self.assertEqual(contract.decode_state(state.encode()), state)
        self.assertEqual(contract.decode_state(initial().encode()), initial())
        self.assertEqual(state.sha256(), digest(state.encode()))
        self.assertNotEqual(state.sha256(), initial().sha256())
        with self.assertRaises(FrozenInstanceError):
            state.phase = "FENCED"

    def test_anchor_decoder_rejects_missing_invalid_and_noncanonical_bytes(self):
        base = anchor()
        raw = canonical(base.document())
        self.assertEqual(contract.decode_anchor(raw), base)
        for bad in (b"", raw + b"\n", b'{"schema":"x","schema":"y"}',
                    canonical({**base.document(), "unexpected": "x"}),
                    canonical({**base.document(), "unitSourceSha256": "0" * 64}),
                    canonical({**base.document(), "schema": "other"})):
            with self.subTest(raw=bad[:80]):
                with self.assertRaises(contract.BootGuardBlocked):
                    contract.decode_anchor(bad)

    def test_state_decoder_rejects_noncanonical_forged_truncated_and_extra_fields(self):
        state = proposed()
        doc = state.document()
        cases = [
            b"", b"{", b"[]", b'{"schema":"x","schema":"y"}',
            b'{"x":NaN}', b'{"x":Infinity}', b"\xff",
            state.encode() + b"\n", b" " + state.encode(),
            canonical({**doc, "unexpected": True}),
            canonical({**doc, "phase": "LEGACY_NOT_ENROLLED"}),
            canonical({**doc, "phase": "RELEASED", "revision": True}),
            canonical({**doc, "epoch": True}),
            canonical({**doc, "revision": 999}),
            canonical({**doc, "anchorSha256": "0" * 64}),
            canonical({**doc, "previousSha256": None}),
            state.encode() + b" " * contract.MAX_RECORD_BYTES,
            b"[" * 2000 + b"]" * 2000,
        ]
        for raw in cases:
            with self.subTest(raw=raw[:85]):
                with self.assertRaises(contract.BootGuardBlocked):
                    contract.decode_state(raw)
        # A correctly encoded but wrong-host state is syntactically valid;
        # independent enrollment and observed-host checks must still reject it.
        wrong_host = contract.decode_state(canonical({**doc, "hostId": "other-host"}))
        self.assertEqual(evaluate(wrong_host).candidate, "DENY")

    def test_invalid_anchor_state_and_epoch_types(self):
        old = initial()
        for state in (
            replace(old, epoch=0),
            replace(old, epoch=True),
            replace(old, revision=True),
            replace(old, phase="ARMING"),
            replace(old, previous_sha256="f" * 64),
            replace(old, registry_sha256="0" * 64),
            replace(old, transaction_id="bad"),
            replace(proposed(), previous_sha256=None),
            replace(proposed(), epoch=3),
            replace(proposed(), revision=0),
        ):
            with self.subTest(state=state):
                with self.assertRaises(contract.BootGuardBlocked):
                    state.document()
        for a in (replace(anchor(), guard_source_sha256="0" * 64),
                  replace(anchor(), installation_id=""),
                  replace(anchor(), host_id="other host")):
            with self.assertRaises(contract.BootGuardBlocked):
                a.document()

    def test_initial_and_next_epoch_cas_are_correlated(self):
        for state in (initial(), proposed()):
            request = proposal(state)
            pair = receipts(state, request)
            contract.correlate_claims(state, request, pair)
            self.assertEqual(request.proposed_epoch, request.expected_epoch + 1)
            self.assertEqual({r.location for r in pair}, {"LOCAL", "OFF_HOST"})

    def test_nonmonotonic_stale_or_wrong_cas_predecessor_is_rejected(self):
        state = proposed()
        good = proposal(state)
        for changes in (
            {"expected_epoch": 0},
            {"expected_epoch": True},
            {"proposed_epoch": 99},
            {"expected_state_sha256": None},
            {"expected_state_sha256": "e" * 64},
            {"proposed_state_sha256": "f" * 64},
            {"nonce_sha256": "0" * 64},
            {"host_id": "other-host"},
            {"installation_id": "other-install"},
            {"owner_id": "other-owner"},
            {"transaction_id": "other-transact-0001"},
        ):
            with self.subTest(changes=changes):
                bad = replace(good, **changes)
                with self.assertRaises(contract.BootGuardBlocked):
                    contract.correlate_claims(state, bad, receipts(state))
        self.assertEqual(evaluate(state, request=replace(good, expected_epoch=1,
                                                        proposed_epoch=1)).candidate, "DENY")

    def test_duplicate_or_forged_local_remote_claims_fail_closed(self):
        state = proposed()
        local, remote = receipts(state)
        for pair in (
            (local, local), (remote, remote),
            (local, replace(remote, location="LOCAL")),
            (local, {}),
            (replace(local, request_sha256="f" * 64), remote),
            (local, replace(remote, state_sha256="e" * 64)),
            (local, replace(remote, evidence_sha256="0" * 64)),
            (local, replace(remote, previous_sha256="f" * 64)),
            (local, replace(remote, epoch=1, revision=0, previous_sha256=None)),
            (local, replace(remote, epoch=True)),
            (local, replace(remote, owner_id="other-owner")),
            (local, replace(remote, installation_id="other-install")),
            (local, replace(remote, transaction_id="other-transact-0001")),
            (local, replace(remote, host_id="other-host")),
        ):
            with self.subTest(pair=pair):
                self.assertEqual(evaluate(state, claims=pair).candidate, "DENY")

    def test_off_host_old_epoch_replayed_against_new_head_denies(self):
        state = proposed()
        prior = initial()
        newer = replace(state, epoch=3, revision=2, phase="ARMING",
                        previous_sha256=state.sha256())
        # Old receipt is never a valid claim for this new epoch.
        self.assertEqual(evaluate(state, claims=(receipts(state)[0],
                                                  receipts(prior)[1])).candidate, "DENY")
        self.assertEqual(evaluate(newer, claims=(receipts(state)[0],
                                                  receipts(newer)[1])).candidate, "DENY")
        self.assertEqual(evaluate(newer).candidate, "DENY")

    def test_wrong_receipt_revision_and_boolean_not_normalized_to_integer(self):
        state = initial()
        local, remote = receipts(state)
        for revision in (True, -1, 1):
            with self.subTest(revision=revision):
                pair = (replace(local, revision=revision), remote)
                self.assertEqual(evaluate(state, claims=pair).candidate, "DENY")

    def test_synthetic_cas_competing_writers_replay_and_wrong_predecessor(self):
        remote = SyntheticRemoteCas()
        base = initial()
        accepted_base = remote.compare_and_swap(proposal(base))
        self.assertEqual(accepted_base.state_sha256, base.sha256())
        with self.assertRaisesRegex(contract.BootGuardBlocked, "REMOTE_CAS_CONFLICT"):
            remote.compare_and_swap(proposal(base))  # replay of same epoch

        winner = proposed(phase="READY_TO_ARM")
        loser = proposed(phase="ARMING")  # same predecessor, different head
        accepted_winner = remote.compare_and_swap(proposal(winner))
        self.assertEqual(accepted_winner.state_sha256, winner.sha256())
        with self.assertRaisesRegex(contract.BootGuardBlocked, "REMOTE_CAS_CONFLICT"):
            remote.compare_and_swap(proposal(loser))
        with self.assertRaisesRegex(contract.BootGuardBlocked, "REMOTE_CAS_CONFLICT"):
            remote.compare_and_swap(proposal(winner))  # duplicate nonce/request

    def test_interruption_between_local_and_remote_cannot_claim_pair(self):
        local, remote = SyntheticLocalStore(), SyntheticRemoteCas()
        base = initial()
        base_local = local.commit_local(proposal(base), base.encode())
        base_remote = remote.compare_and_swap(proposal(base))
        contract.correlate_claims(base, proposal(base), (base_local, base_remote))

        next_state = proposed()
        next_local = local.commit_local(proposal(next_state), next_state.encode())
        self.assertEqual(remote.epoch, 1)
        # Power cut occurs here: remote still holds the previous epoch.
        self.assertEqual(evaluate(next_state, claims=(next_local, base_remote)).candidate,
                         "DENY")
        self.assertNotEqual(remote.state_sha256, digest(local.state))
        # Finishing the CAS later is a claim of correlation, still not a real permit.
        next_remote = remote.compare_and_swap(proposal(next_state))
        verdict = evaluate(next_state, claims=(next_local, next_remote))
        self.assertEqual(verdict.candidate, "ALLOW_CANDIDATE")
        self.assertFalse(verdict.persistence_verified)
        self.assertFalse(verdict.authorized_to_start_docker)

    def test_protocols_are_interface_declarations_only_and_not_adapters(self):
        self.assertTrue(hasattr(contract.LocalDurableCustody, "commit_local"))
        self.assertTrue(hasattr(contract.OffHostCasCustody, "compare_and_swap"))
        for module in ("maintenance_boot_guard.py", "maintenance_boot_guard_contract.py"):
            self.assertNotIn("ops/runtime/" + module, SOURCE_FILES)
            source = (ROOT / module).read_text()
            tree = ast.parse(source)
            imports = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.update(alias.name for alias in node.names)
                if isinstance(node, ast.ImportFrom):
                    imports.add(node.module)
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    self.assertNotIn(node.func.id, {"open", "exec", "eval", "__import__"})
            self.assertFalse(imports & {"os", "subprocess", "socket", "pathlib",
                                        "requests", "boto3", "docker", "ctypes", "fcntl"})
            self.assertNotIn("__main__", source)
        self.assertEqual(len(SOURCE_FILES), 17)

    def test_caller_can_fabricate_consistent_claims_but_never_live_authority(self):
        # Deliberately synthesize both receipts with no external signer.
        result = evaluate()
        self.assertEqual(result.candidate, "ALLOW_CANDIDATE")
        self.assertFalse(result.off_host_cas_verified)
        self.assertFalse(result.authorized_to_start_docker)
        self.assertFalse(result.ready_to_install)


if __name__ == "__main__":
    unittest.main()