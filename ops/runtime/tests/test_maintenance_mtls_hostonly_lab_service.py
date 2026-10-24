"""P2-C3C3 offline service boundary tests; NEVER establish a TLS listener.

Actual Mac LibreSSL ↔ Ubuntu OpenSSL mTLS handshake is NOT exercised in CI.
"""
from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import hashlib
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import maintenance_mtls_hostonly_lab_service as lab
    from maintenance_off_host_auth_wire import OfflineWireRequest
    from maintenance_boot_guard_contract import (
        BootGuardBlocked, BootGuardState, CasRequest, InstallationAnchor,
    )
    from normal_runtime_launch import canonical, digest
    from build_bundle import SOURCE_FILES
except BaseException:
    raise
finally:
    sys.path.pop(0)

HOST = "lab-recovery"
INSTALL = "recovery-install"
IDENTITY = "recovery-client"
DER = b"synthetic-certificate-der-for-contract-test-only"
CERT_SHA = hashlib.sha256(DER).hexdigest()
CA_BYTES = b"synthetic-public-ca-bytes"
CA_SHA = hashlib.sha256(CA_BYTES).hexdigest()


def anchor():
    return InstallationAnchor(HOST, INSTALL, "a" * 64, "b" * 64)


def config():
    return {
        "schema": lab.LAB_SCHEMA, "hostId": HOST, "installationId": INSTALL,
        "anchorSha256": anchor().sha256(), "clientIdentity": IDENTITY,
        "clientCertSha256": CERT_SHA, "caCertSha256": CA_SHA,
        "roles": ["READ", "SUBMIT"], "revoked": False,
    }


def head():
    return OfflineWireRequest("HEAD_READ", HOST, INSTALL, anchor().sha256(),
                              IDENTITY)


def lookup():
    return OfflineWireRequest("COMMIT_LOOKUP", HOST, INSTALL, anchor().sha256(),
                              IDENTITY, request_sha256="c" * 64)


def submit():
    state = BootGuardState(
        anchor().sha256(), HOST, INSTALL, "maintenance", "test-mtls-001",
        1, 0, "INSTALLED_INACTIVE", None, "d" * 64)
    cas = CasRequest(HOST, INSTALL, "maintenance", "test-mtls-001",
                     0, 1, None, state.sha256(), "e" * 64)
    return OfflineWireRequest(
        "CAS_SUBMIT", HOST, INSTALL, anchor().sha256(), IDENTITY,
        cas_request=cas, state_bytes=state.encode())


class Backend:
    def __init__(self):
        self.called = []
        self.response_head = None
        self.response_lookup = None
        self.response_submit = None

    def read_head(self, host, installation, client):
        self.called.append(("HEAD_READ", host, installation, client))
        return self.response_head

    def lookup_commit(self, host, installation, client, request_sha):
        self.called.append(("COMMIT_LOOKUP", host, installation, client, request_sha))
        return self.response_lookup

    def submit(self, proposal):
        self.called.append(("CAS_SUBMIT", proposal))
        return self.response_submit


class HostOnlyLabServiceContractTests(unittest.TestCase):

    def dispatch(self, request=None, cfg=None, der=DER, backend=None):
        return lab.dispatch_authenticated_lab(
            request if request is not None else head(),
            peer_cert_der=der,
            enrollment=cfg if cfg is not None else config(),
            ca_cert_sha256=CA_SHA,
            backend=backend if backend is not None else Backend())

    def test_hardcoded_single_ipv4_and_tls12_only_ciphers(self):
        self.assertEqual(lab.BIND_IP, "192.168.56.1")
        self.assertEqual(lab.BIND_PORT, 39443)
        self.assertNotIn("0.0.0.0", lab.BIND_IP)
        self.assertEqual(lab.CIPHERS,
                         "ECDHE-RSA-AES128-GCM-SHA256:"
                         "ECDHE-RSA-AES256-GCM-SHA384")
        self.assertNotIn("NULL", lab.CIPHERS)

    def test_head_read_authorized_only_as_lab_not_docker(self):
        backend = Backend()
        result = self.dispatch(backend=backend)
        self.assertIsNone(result["result"])
        self.assertEqual(result["classification"], "HOSTONLY_LAB_RESULT_NONATTESTING")
        self.assertIs(result["authorizedToStartDocker"], False)
        self.assertIs(result["offHostProductionAuthority"], False)
        self.assertEqual(backend.called,
                         [("HEAD_READ", HOST, INSTALL, IDENTITY)])

    def test_lookup_only_with_registered_identity(self):
        backend = Backend()
        output = self.dispatch(request=lookup(), backend=backend)
        self.assertIsNone(output["result"])
        self.assertEqual(backend.called, [(
            "COMMIT_LOOKUP", HOST, INSTALL, IDENTITY, "c" * 64)])

    def test_submit_uses_registered_identity_not_client_claim_authority(self):
        backend = Backend()
        backend.response_submit = Mock()
        backend.response_submit.encode.return_value = canonical({
            "schema": "sanq.runtime.offline-cas-lab-receipt.v2",
            "classification": "UNAUTHENTICATED_OFFLINE_LAB_ONLY"})
        result = self.dispatch(request=submit(), backend=backend)
        self.assertFalse(result["authorizedToStartDocker"])
        self.assertEqual(result["result"]["classification"],
                         "UNAUTHENTICATED_OFFLINE_LAB_ONLY")
        self.assertEqual(backend.called[0][0], "CAS_SUBMIT")
        self.assertEqual(backend.called[0][1].client_identity, IDENTITY)

    def test_missing_peer_or_wrong_cert_ca_denied_before_backend(self):
        for der, authority in ((b"", CA_SHA), (b"rogue-der", CA_SHA),
                               (DER, "f" * 64)):
            with self.subTest(der=der, authority=authority):
                backend = Backend()
                with self.assertRaises(BootGuardBlocked):
                    lab.dispatch_authenticated_lab(
                        head(), peer_cert_der=der, enrollment=config(),
                        ca_cert_sha256=authority, backend=backend)
                self.assertEqual(backend.called, [])

    def test_wrong_claimed_host_install_anchor_or_client_denied(self):
        for field, value in (
            ("host_id", "rogue-host"), ("installation_id", "rogue-install"),
            ("anchor_sha256", "f" * 64), ("client_identity", "rogue-peer")
        ):
            with self.subTest(field=field):
                backend = Backend()
                request = replace(head(), **{field: value})
                with self.assertRaises(BootGuardBlocked):
                    self.dispatch(request=request, backend=backend)
                self.assertEqual(backend.called, [])

    def test_revoked_client_denied(self):
        backend = Backend()
        with self.assertRaises(BootGuardBlocked):
            self.dispatch(cfg=dict(config(), revoked=True), backend=backend)
        self.assertEqual(backend.called, [])

    def test_role_denied_for_cas_and_read(self):
        for request, roles in ((submit(), ["READ"]), (head(), ["SUBMIT"])):
            backend = Backend()
            with self.assertRaises(BootGuardBlocked):
                self.dispatch(request=request, cfg=dict(config(), roles=roles),
                              backend=backend)
            self.assertEqual(backend.called, [])

    def test_cas_malformed_predecessor_cannot_execute(self):
        candidate = submit()
        wrong = replace(candidate, cas_request=replace(
            candidate.cas_request, expected_epoch=1, proposed_epoch=2,
            expected_state_sha256="c" * 64))
        backend = Backend()
        with self.assertRaises(BootGuardBlocked):
            self.dispatch(request=wrong, backend=backend)
        self.assertEqual(backend.called, [])

    def test_private_file_owner_mode_and_symlink(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder) / "private"
            directory.mkdir(mode=0o700)
            filename = directory / "enrollment.json"
            filename.write_bytes(canonical(config()))
            filename.chmod(0o600)
            self.assertEqual(lab._private_file(str(filename)), canonical(config()))
            filename.chmod(0o644)
            with self.assertRaises(BootGuardBlocked):
                lab._private_file(str(filename))
            filename.chmod(0o600)
            symlink = directory / "link.json"
            symlink.symlink_to(filename)
            with self.assertRaises(BootGuardBlocked):
                lab._private_file(str(symlink))

    def test_read_enrollment_rejects_duplicates_bad_roles_and_revocation(self):
        good = canonical(config())
        with self.assertRaises(BootGuardBlocked):
            lab._strict_config(good.replace(
                b'"roles":["READ","SUBMIT"]',
                b'"roles":["READ","READ"]'))
        with self.assertRaises(BootGuardBlocked):
            lab._strict_config(good.replace(b'"revoked":false',
                                            b'"revoked":null'))
        with self.assertRaises(BootGuardBlocked):
            lab._strict_config(good.replace(
                b'"hostId":"lab-recovery"',
                b'"hostId":"lab-recovery","hostId":"lab-recovery"'))
        self.assertEqual(lab._strict_config(good), config())

    def test_tls_context_config_hardening_via_mock(self):
        fake = Mock()
        fake.minimum_version = None
        fake.maximum_version = None
        fake.verify_mode = None
        fake.options = 0
        with patch.object(lab.ssl, "SSLContext", return_value=fake):
            ctx = lab.tls_context(ca_path="/private/ca.pem",
                                  cert_path="/private/server.pem",
                                  key_path="/private/server-key.pem")
        self.assertIs(ctx, fake)
        self.assertEqual(fake.minimum_version, lab.ssl.TLSVersion.TLSv1_2)
        self.assertEqual(fake.maximum_version, lab.ssl.TLSVersion.TLSv1_2)
        self.assertEqual(fake.verify_mode, lab.ssl.CERT_REQUIRED)
        fake.set_ciphers.assert_called_once_with(lab.CIPHERS)
        fake.load_verify_locations.assert_called_once_with(cafile="/private/ca.pem")
        fake.load_cert_chain.assert_called_once()

    def test_framing_rejects_giant_short_and_eof(self):
        for raw in ((lab.MAX_WIRE_BYTES + 1).to_bytes(4, "big"), b"\x00\x00\x00\x01"):
            stream = Mock()
            stream.recv.side_effect = [raw, b""]
            with self.assertRaises(BootGuardBlocked):
                lab._read_request(stream)

    def test_no_boot_guard_release_or_bundle_widening(self):
        self.assertNotIn("ops/runtime/maintenance_mtls_hostonly_lab_service.py",
                         SOURCE_FILES)
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertNotIn("ALLOW_DOCKER_START", lab.RESPONSE_SCHEMA)


if __name__ == "__main__":
    unittest.main()