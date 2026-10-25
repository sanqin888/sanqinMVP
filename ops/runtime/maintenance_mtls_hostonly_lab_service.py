"""P2-C3C3 Mac Host-only *lab* mTLS CAS service; manual opt-in ONLY.

No certificate issuance, auto-enrollment, automatic service start, Docker or
P1 CustodyReceipt. This is NOT an independently durable OFF_HOST authority.
Only a manually invoked, private Mac account may start the listener. Mac/Guest
TLS handshake and failure evidence are required before any PASS claim.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import ssl
import stat
import struct
import time

from maintenance_boot_guard_contract import BootGuardBlocked, require, sha, identity
from maintenance_off_host_auth_wire import (
    OfflineWireRequest, MAX_WIRE_BYTES, decode_wire,
)
from maintenance_off_host_cas_contract import OfflineCasSubmission
from maintenance_off_host_cas_sqlite import OfflineSqliteCas
from normal_runtime_launch import canonical

LAB_SCHEMA = "sanq.runtime.mtls-hostonly-lab.v1"
RESPONSE_SCHEMA = "sanq.runtime.mtls-hostonly-lab-response.v1"
BIND_IP = "192.168.56.1"
BIND_PORT = 39443  # REVIEW CANDIDATE; never binds until operator explicitly runs.
CIPHERS = "ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384"
MAX_RESPONSE_BYTES = 32768
MAX_CONFIG_BYTES = 4096


def _private_file(path: str) -> bytes:
    """Reject symlinks and nonprivate files; no permission repair or creation."""
    p = Path(path)
    require(p.is_absolute(), "UNSAFE_LAB_PATH")
    parent = p.parent.lstat()
    leaf = p.lstat()
    require(stat.S_ISDIR(parent.st_mode) and parent.st_uid == os.getuid()
            and stat.S_IMODE(parent.st_mode) == 0o700,
            "UNSAFE_LAB_PARENT")
    require(stat.S_ISREG(leaf.st_mode) and leaf.st_uid == os.getuid()
            and stat.S_IMODE(leaf.st_mode) == 0o600 and leaf.st_nlink == 1,
            "UNSAFE_LAB_FILE")
    # An unprivileged account owner is the trust boundary, not hostile local root.
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(str(p), flags)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino) == (leaf.st_dev, leaf.st_ino),
                "LAB_FILE_RACE")
        with os.fdopen(fd, "rb", closefd=False) as f:
            data = f.read(MAX_CONFIG_BYTES + 1)
    finally:
        os.close(fd)
    require(0 < len(data) <= MAX_CONFIG_BYTES, "LAB_FILE_OVERSIZE")
    return data


def _strict_config(raw: bytes) -> dict:
    def unique(pairs):
        out = {}
        for k, v in pairs:
            require(k not in out, "DUPLICATE_ENROLLMENT_FIELD")
            out[k] = v
        return out

    try:
        config = json.loads(raw.decode("ascii"), object_pairs_hook=unique)
        require(type(config) is dict and canonical(config) == raw,
                "NONCANONICAL_ENROLLMENT")
    except (UnicodeError, TypeError, ValueError, RecursionError) as exc:
        raise BootGuardBlocked("INVALID_ENROLLMENT") from exc
    require(set(config) == {"schema", "hostId", "installationId",
                           "anchorSha256", "clientIdentity", "clientCertSha256",
                           "caCertSha256", "roles", "revoked"},
            "INVALID_ENROLLMENT_FIELDS")
    require(config["schema"] == LAB_SCHEMA and
            all(identity(config[k]) for k in (
                "hostId", "installationId", "clientIdentity")) and
            all(sha(config[k]) for k in (
                "anchorSha256", "clientCertSha256", "caCertSha256")) and
            type(config["roles"]) is list and len(config["roles"]) > 0 and
            all(type(k) is str and k in ("READ", "SUBMIT") for k in config["roles"]) and
            len(config["roles"]) == len(set(config["roles"])) and
            type(config["revoked"]) is bool,
            "INVALID_ENROLLMENT_VALUE")
    return config


def read_enrollment(path: str) -> dict:
    """Reload on EVERY request so revocation cannot be cached as an old PASS."""
    return _strict_config(_private_file(path))


def preflight_materials(*, enrollment_path: str, ca_path: str,
                        cert_path: str, key_path: str, db_path: str) -> dict:
    cfg = read_enrollment(enrollment_path)
    # Refuse the historic C3B database, even if called with the wrong path.
    require(Path(db_path).is_absolute() and Path(db_path).parent.name ==
            "P2-C3C3-001", "UNAPPROVED_LAB_DATASET")
    require(not cfg["revoked"], "ENROLLMENT_REVOKED")
    require(hashlib.sha256(_private_file(ca_path)).hexdigest() ==
            cfg["caCertSha256"], "CA_CERT_PIN_MISMATCH")
    # TLS material must exist in private files; TLS library owns PEM decoding.
    _private_file(cert_path)
    _private_file(key_path)
    # The CAS backend itself preflights 0600 file & 0700 parent on every open.
    backend = OfflineSqliteCas(db_path)
    # Existing DB/enrollment only: missing file MUST NOT initialize a new DB.
    backend.read_head(cfg["hostId"], cfg["installationId"],
                      cfg["clientIdentity"])
    return cfg


def tls_context(*, ca_path: str, cert_path: str, key_path: str) -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.maximum_version = ssl.TLSVersion.TLSv1_2
    ctx.set_ciphers(CIPHERS)
    ctx.verify_mode = ssl.CERT_REQUIRED
    ctx.load_verify_locations(cafile=ca_path)
    ctx.load_cert_chain(certfile=cert_path, keyfile=key_path)
    require(ctx.minimum_version == ssl.TLSVersion.TLSv1_2 and
            ctx.maximum_version == ssl.TLSVersion.TLSv1_2 and
            ctx.verify_mode == ssl.CERT_REQUIRED, "TLS_CONFIG_FAILED")
    # Even if session resumption is available, each request rechecks revocation.
    if hasattr(ssl, "OP_NO_TICKET"):
        ctx.options |= ssl.OP_NO_TICKET
    return ctx


def _read_exact(conn: ssl.SSLSocket, count: int, deadline: float) -> bytes:
    out = bytearray()
    while len(out) < count:
        remaining = deadline - time.monotonic()
        require(remaining > 0, "WIRE_DEADLINE_EXCEEDED")
        conn.settimeout(remaining)
        part = conn.recv(count - len(out))
        require(part != b"", "WIRE_EOF")
        out.extend(part)
    return bytes(out)


def _read_request(conn: ssl.SSLSocket) -> OfflineWireRequest:
    # One absolute deadline for the entire frame, not a fresh 10 s per byte.
    deadline = time.monotonic() + 10.0
    length = struct.unpack("!I", _read_exact(conn, 4, deadline))[0]
    require(0 < length <= MAX_WIRE_BYTES, "WIRE_LENGTH_DENIED")
    return decode_wire(_read_exact(conn, length, deadline))


def _send_response(conn: ssl.SSLSocket, document: dict) -> None:
    raw = canonical(document)
    require(0 < len(raw) <= MAX_RESPONSE_BYTES, "RESPONSE_TOO_LARGE")
    conn.sendall(struct.pack("!I", len(raw)) + raw)


def dispatch_authenticated_lab(
    request: OfflineWireRequest, *,
    peer_cert_der: bytes, enrollment: dict, ca_cert_sha256: str,
    backend: OfflineSqliteCas,
) -> dict:
    """Trusted transport calls only AFTER successful mTLS peer verification.

    This is callable from Python (not intrinsically unforgeable). Do not expose
    it as an unauthenticated RPC. No return value is a Docker start authority.
    """
    require(type(peer_cert_der) is bytes and len(peer_cert_der) > 0,
            "NO_VERIFIED_CERT")
    require(type(request) is OfflineWireRequest, "INVALID_WIRE_REQUEST")
    request.document()
    require(type(enrollment) is dict and not enrollment["revoked"],
            "ENROLLMENT_REVOKED")
    require(hashlib.sha256(peer_cert_der).hexdigest() ==
            enrollment["clientCertSha256"] and
            ca_cert_sha256 == enrollment["caCertSha256"],
            "PEER_CERT_NOT_ENROLLED")
    require(request.host_id == enrollment["hostId"] and
            request.installation_id == enrollment["installationId"] and
            request.anchor_sha256 == enrollment["anchorSha256"] and
            request.client_identity == enrollment["clientIdentity"],
            "PEER_BODY_IDENTITY_MISMATCH")
    role = "SUBMIT" if request.operation == "CAS_SUBMIT" else "READ"
    require(role in enrollment["roles"], "ROLE_DENIED")
    client = enrollment["clientIdentity"]
    if request.operation == "HEAD_READ":
        head = backend.read_head(request.host_id, request.installation_id, client)
        output = None if head is None else {
            "epoch": head.epoch, "stateSha256": head.state_sha256,
            "commitSha256": head.commit_sha256, "phase": head.phase}
    elif request.operation == "COMMIT_LOOKUP":
        lookup = backend.lookup_commit(
            request.host_id, request.installation_id, client,
            request.request_sha256)
        output = None if lookup is None else {
            "receipt": json.loads(lookup.receipt.encode()),
            "isCurrentHead": lookup.is_current_head}
    elif request.operation == "CAS_SUBMIT":
        proposal = OfflineCasSubmission(
            request.cas_request, request.state_bytes,
            request.anchor_sha256, client)
        receipt = backend.submit(proposal)
        output = json.loads(receipt.encode())
    else:
        raise BootGuardBlocked("UNKNOWN_WIRE_OPERATION")
    return {"schema": RESPONSE_SCHEMA, "status": "LAB_OPERATION_COMPLETED",
            "classification": "HOSTONLY_LAB_RESULT_NONATTESTING",
            "requestSha256": request.sha256(), "result": output,
            "authorizedToStartDocker": False,
            "offHostProductionAuthority": False}


def serve_manually(*, enrollment_path: str, ca_path: str,
                   cert_path: str, key_path: str, db_path: str) -> None:
    """Single-process sequential lab only; NO background service installation."""
    cfg = preflight_materials(enrollment_path=enrollment_path,
                              ca_path=ca_path, cert_path=cert_path,
                              key_path=key_path, db_path=db_path)
    ctx = tls_context(ca_path=ca_path, cert_path=cert_path, key_path=key_path)
    backend = OfflineSqliteCas(db_path)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        listener.bind((BIND_IP, BIND_PORT))
        listener.listen(4)
        while True:
            raw, _ = listener.accept()
            with raw:
                raw.settimeout(5.0)
                try:
                    with ctx.wrap_socket(raw, server_side=True) as conn:
                        require(conn.version() == "TLSv1.2",
                                "TLS_VERSION_MISMATCH")
                        cipher = conn.cipher()
                        require(cipher is not None and cipher[0] in CIPHERS.split(":"),
                                "TLS_CIPHER_MISMATCH")
                        cert_der = conn.getpeercert(binary_form=True)
                        # Reload certificate enrollment before each request.
                        current = read_enrollment(enrollment_path)
                        require(current == cfg and not current["revoked"],
                                "ENROLLMENT_CHANGED")
                        require(hashlib.sha256(_private_file(ca_path)).hexdigest() ==
                                current["caCertSha256"], "CA_CERT_CHANGED")
                        conn.settimeout(10.0)
                        request = _read_request(conn)
                        try:
                            response = dispatch_authenticated_lab(
                                request, peer_cert_der=cert_der,
                                enrollment=current,
                                ca_cert_sha256=current["caCertSha256"],
                                backend=backend)
                        except (BootGuardBlocked, OSError) as exc:
                            # A commit exception may mean success but no response.
                            # Never claim definite rollback or allow a CAS retry.
                            response = {
                                "schema": RESPONSE_SCHEMA, "status": "LAB_DENIED_OR_UNKNOWN",
                                "reason": "OUTCOME_UNKNOWN_RECONCILE" if
                                request.operation == "CAS_SUBMIT" else "DENIED",
                                "authorizedToStartDocker": False,
                                "offHostProductionAuthority": False}
                        _send_response(conn, response)
                except (BootGuardBlocked, ssl.SSLError, OSError, ValueError):
                    # Handshake and framed protocol failures are fail-closed.
                    # No key material or stack traces are emitted to clients.
                    continue


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manually run isolated Host-only mTLS CAS lab (never Boot Guard)")
    parser.add_argument("--enrollment-file", required=True)
    parser.add_argument("--ca-file", required=True)
    parser.add_argument("--server-cert", required=True)
    parser.add_argument("--server-key", required=True)
    parser.add_argument("--db-file", required=True)
    args = parser.parse_args()
    serve_manually(enrollment_path=args.enrollment_file,
                   ca_path=args.ca_file, cert_path=args.server_cert,
                   key_path=args.server_key, db_path=args.db_file)


if __name__ == "__main__":
    main()