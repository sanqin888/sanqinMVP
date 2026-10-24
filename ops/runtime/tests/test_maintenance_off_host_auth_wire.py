"""P2-C3C2 synthetic peer/wire negative tests, no sockets, files or TLS."""
from __future__ import annotations

from dataclasses import FrozenInstanceError, replace
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import maintenance_off_host_auth_wire as wire
    from maintenance_boot_guard import evaluate_boot_candidate
    from maintenance_boot_guard_contract import (
        BootGuardBlocked, BootGuardState, CasRequest, InstallationAnchor,
    )
    from build_bundle import SOURCE_FILES
    from normal_runtime_launch import canonical, digest
finally:
    sys.path.pop(0)

HOST, INSTALL = "guest-recovery", "install-guest01"
CLIENT = "synthetic-peer"
OWNER, TXID = "maintenance-test", "test-wire-001"
CERT = "a" * 64
CA = "b" * 64
LOOKUP = "c" * 64


def anchor():
    return InstallationAnchor(HOST, INSTALL, "d" * 64, "e" * 64)


def peer(**kwargs):
    return replace(wire.SyntheticPeerEvidence(CLIENT, CERT, CA), **kwargs)


def enrollment(**kwargs):
    return replace(wire.OfflineEnrollment(
        HOST, INSTALL, anchor().sha256(), CLIENT, CERT, CA,
        ("READ", "SUBMIT")), **kwargs)


def head(**kwargs):
    return replace(wire.OfflineWireRequest(
        "HEAD_READ", HOST, INSTALL, anchor().sha256(), CLIENT), **kwargs)


def lookup(**kwargs):
    return replace(wire.OfflineWireRequest(
        "COMMIT_LOOKUP", HOST, INSTALL, anchor().sha256(), CLIENT,
        request_sha256=LOOKUP), **kwargs)


def state():
    return BootGuardState(anchor().sha256(), HOST, INSTALL,
                          OWNER, TXID, 1, 0, "INSTALLED_INACTIVE",
                          None, "f" * 64)


def submit(**kwargs):
    s = state()
    cas = CasRequest(
        HOST, INSTALL, OWNER, TXID, 0, 1, None, s.sha256(),
        digest(b"synthetic-nonce"))
    return replace(wire.OfflineWireRequest(
        "CAS_SUBMIT", HOST, INSTALL, anchor().sha256(), CLIENT,
        cas_request=cas, state_bytes=s.encode()), **kwargs)


class OfflineAuthWireTests(unittest.TestCase):
    def assert_denied(self, packet, identity=None, binding=None, candidate=None):
        result = wire.assess_offline_binding(
            packet, peer() if identity is None else identity,
            enrollment() if binding is None else binding)
        if candidate is not None:
            self.assertEqual(result.candidate, candidate)
        self.assertEqual(result.decision, "DENY")
        self.assertEqual(result.classification, wire.CLASSIFICATION)
        self.assertFalse(result.authorized_to_execute_cas)
        self.assertFalse(result.authorized_to_start_docker)
        self.assertFalse(result.authenticated_off_host)
        self.assertFalse(result.tls_verified)
        return result

    def test_exact_wire_operations_roundtrip_but_all_denied_for_execution(self):
        for packet in (head(), lookup(), submit()):
            with self.subTest(operation=packet.operation):
                raw = packet.encode()
                self.assertEqual(wire.decode_wire(raw).encode(), raw)
                self.assertEqual(packet.sha256(), digest(raw))
                self.assertLessEqual(len(raw), wire.MAX_WIRE_BYTES)
                self.assertEqual(self.assert_denied(
                    packet, candidate="STATIC_BINDING_CANDIDATE").reason,
                    "NO_ACTUAL_MTLS_OR_IO_EVIDENCE")

    def test_read_only_role_read_and_lookup_not_submit(self):
        binding = enrollment(roles=("READ",))
        for request in (head(), lookup()):
            self.assert_denied(request, binding=binding,
                               candidate="STATIC_BINDING_CANDIDATE")
        self.assertEqual(self.assert_denied(
            submit(), binding=binding).reason, "OPERATION_ROLE_DENIED")

    def test_submit_only_role_cannot_read(self):
        binding = enrollment(roles=("SUBMIT",))
        self.assert_denied(submit(), binding=binding,
                           candidate="STATIC_BINDING_CANDIDATE")
        self.assertEqual(self.assert_denied(
            head(), binding=binding).reason, "OPERATION_ROLE_DENIED")

    def test_missing_or_invalid_peer_and_enrollment(self):
        self.assert_denied(head(), identity=False, candidate="REJECT")
        self.assert_denied(head(), binding=False, candidate="REJECT")
        self.assert_denied(None, candidate="REJECT")
        self.assert_denied(head(), identity="I am verified", candidate="REJECT")

    def test_wrong_peer_cert_ca_identity_denied(self):
        for change in ({"client_identity": "another-peer"},
                       {"certificate_sha256": "1" * 64},
                       {"ca_sha256": "2" * 64}):
            with self.subTest(change=change):
                self.assertEqual(self.assert_denied(
                    head(), identity=peer(**change)).reason,
                    "SYNTHETIC_PEER_BINDING_MISMATCH")

    def test_enrollment_binding_wrong_host_install_anchor(self):
        for change in ({"host_id": "other-host"},
                       {"installation_id": "other-install"},
                       {"anchor_sha256": "1" * 64}):
            with self.subTest(change=change):
                self.assertEqual(self.assert_denied(
                    head(), binding=enrollment(**change)).reason,
                    "INSTALLATION_BINDING_MISMATCH")

    def test_body_client_identity_mismatch_even_if_cert_matches(self):
        self.assertEqual(self.assert_denied(
            head(client_identity="attacker")).reason,
            "SYNTHETIC_PEER_BINDING_MISMATCH")

    def test_body_host_install_anchor_mismatch(self):
        for change in ({"host_id": "wrong-host"},
                       {"installation_id": "wrong-install"},
                       {"anchor_sha256": "1" * 64}):
            self.assertEqual(self.assert_denied(
                head(**change)).reason, "INSTALLATION_BINDING_MISMATCH")

    def test_untrusted_claim_cannot_set_new_role(self):
        for roles in ((), ("ADMIN",), ("READ", "READ"), ("READ", "ADMIN"),
                      ("SUBMIT", "SUBMIT")):
            self.assertEqual(self.assert_denied(
                head(), binding=enrollment(roles=roles)).candidate, "REJECT")

    def test_reject_malformed_identity_cert_ca_digest(self):
        for change in ({"client_identity": ""},
                       {"client_identity": "invalid identity"},
                       {"certificate_sha256": "x" * 64},
                       {"ca_sha256": "0" * 64}):
            self.assert_denied(head(), identity=peer(**change), candidate="REJECT")

    def test_wire_no_replay_of_injected_tls_evidence_as_real_receipt(self):
        bound = self.assert_denied(head(), candidate="STATIC_BINDING_CANDIDATE")
        self.assertFalse(hasattr(bound, "receipt"))
        self.assertFalse(hasattr(bound, "signed_attestation"))
        self.assertFalse(hasattr(bound, "permit_start"))

    def test_wire_exact_schema_and_fields(self):
        good = head()
        packet = json.loads(good.encode())
        for changes in ({"schema": "sanq.runtime.unauthenticated.v1"},
                        {"operation": "RELEASE"},
                        {"evil": True}):
            mutated = dict(packet, **changes)
            with self.subTest(changes=changes), self.assertRaises(BootGuardBlocked):
                wire.decode_wire(canonical(mutated))
        packet.pop("anchorSha256")
        with self.assertRaises(BootGuardBlocked):
            wire.decode_wire(canonical(packet))

    def test_wire_reject_duplicate_keys_at_every_depth(self):
        good = head().encode()
        raw = good.replace(b'"hostId":"guest-recovery"',
                           b'"hostId":"guest-recovery","hostId":"guest-recovery"')
        with self.assertRaisesRegex(BootGuardBlocked, "DUPLICATE_WIRE_KEY"):
            wire.decode_wire(raw)
        nested = submit().encode()
        nested = nested.replace(
            b'"nonceSha256":"', b'"nonceSha256":"x","nonceSha256":"', 1)
        with self.assertRaisesRegex(BootGuardBlocked, "DUPLICATE_WIRE_KEY"):
            wire.decode_wire(nested)

    def test_wire_noncanonical_extra_whitespace_or_ascii_unicode_denied(self):
        data = head().encode()
        for raw in (b" " + data, data + b"\n", data[::-1], data + b" ",
                    data.replace(b'"operation"', b'"operati\\u006fn"'),
                    data + b"\xc3\xa9"):
            with self.subTest(raw=raw[:50]), self.assertRaises(BootGuardBlocked):
                wire.decode_wire(raw)

    def test_wire_rejects_oversized_and_wrong_data_type(self):
        for raw in (b"", b"x" * (wire.MAX_WIRE_BYTES + 1),
                    bytearray(head().encode()), "hello"):
            with self.assertRaises(BootGuardBlocked):
                wire.decode_wire(raw)

    def test_wire_rejects_nan_and_infinity(self):
        for raw in (b'{"k":NaN}', b'{"k":Infinity}', b'{"k":-Infinity}'):
            with self.assertRaises(BootGuardBlocked):
                wire.decode_wire(raw)

    def test_head_read_cannot_have_payload(self):
        for change in ({"request_sha256": LOOKUP},
                       {"state_bytes": state().encode()},
                       {"cas_request": submit().cas_request}):
            with self.assertRaises(BootGuardBlocked):
                head(**change).encode()

    def test_lookup_requires_exact_hash_and_no_cas_body(self):
        for change in ({"request_sha256": None},
                       {"request_sha256": "invalid"},
                       {"request_sha256": "0" * 64},
                       {"state_bytes": state().encode()},
                       {"cas_request": submit().cas_request}):
            with self.assertRaises(BootGuardBlocked):
                lookup(**change).encode()

    def test_cas_submit_rejects_invalid_missing_payload(self):
        for change in ({"request_sha256": LOOKUP},
                       {"cas_request": None},
                       {"state_bytes": None},
                       {"state_bytes": b"{}"}):
            with self.assertRaises(BootGuardBlocked):
                submit(**change).encode()

    def test_cas_submit_wrong_anchor_host_install_and_predecessor(self):
        candidate = submit()
        variants = (
            replace(candidate, anchor_sha256="1" * 64),
            replace(candidate, host_id="wrong-host"),
            replace(candidate, installation_id="wrong-install"),
            replace(candidate, cas_request=replace(
                candidate.cas_request, expected_epoch=1, proposed_epoch=2,
                expected_state_sha256="1" * 64)),
            replace(candidate, cas_request=replace(
                candidate.cas_request, proposed_state_sha256="1" * 64)),
        )
        for item in variants:
            with self.subTest(candidate=item), self.assertRaises(BootGuardBlocked):
                item.encode()

    def test_cas_submit_bool_epoch_invalid(self):
        candidate = submit()
        wrong = replace(candidate, cas_request=replace(
            candidate.cas_request, expected_epoch=True))
        with self.assertRaises(BootGuardBlocked):
            wrong.encode()

    def test_submit_rejects_release_or_unknown_phase(self):
        candidate = submit()
        for phase in ("RELEASE_PENDING", "RELEASED", "UNKNOWN_OR_CORRUPT",
                      "OFF_HOST_UNREACHABLE"):
            bad = replace(state(), phase=phase)
            # Invalid initial phases are blocked by base BootGuardState.
            with self.subTest(phase=phase), self.assertRaises(BootGuardBlocked):
                replace(candidate, state_bytes=bad.encode()).encode()

    def test_same_wire_identity_claim_cannot_mutate_offline_cas_record(self):
        candidate = submit()
        self.assertEqual(wire.decode_wire(candidate.encode()).cas_request.sha256(),
                         candidate.cas_request.sha256())
        self.assert_denied(candidate, candidate="STATIC_BINDING_CANDIDATE")

    def test_unknown_commit_cannot_retry_or_increment_epoch(self):
        policy = wire.unknown_commit_recovery(LOOKUP)
        self.assertEqual(policy.status, "OUTCOME_UNKNOWN_DENY")
        self.assertEqual(policy.next_operations, ("COMMIT_LOOKUP", "HEAD_READ"))
        self.assertFalse(policy.can_retry_submit)
        self.assertFalse(policy.may_advance_epoch)
        self.assertFalse(policy.authorized_to_start_docker)
        for bad in ("", "0" * 64, None, True):
            with self.assertRaises(BootGuardBlocked):
                wire.unknown_commit_recovery(bad)

    def test_immutable_candidates_do_not_change_existing_p1_or_bundle(self):
        with self.assertRaises(FrozenInstanceError):
            head().host_id = "different-host"
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/maintenance_off_host_auth_wire.py",
                         SOURCE_FILES)
        verdict = evaluate_boot_candidate(
            observed_host_id=HOST, anchor=None, state=None, request=None,
            receipts=None, off_host_available=False)
        self.assertEqual(verdict.decision, "DENY")
        self.assertFalse(verdict.authorized_to_start_docker)


if __name__ == "__main__":
    unittest.main()
