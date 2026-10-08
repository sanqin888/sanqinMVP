"""C5-B3B2L: inert Ed25519 envelope and independent-policy shape model.

NO signature verification, key generation, private-key handling or trust grant.
Bytes and policy data are untrusted caller fixtures, never installed root keys.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any

from inert_launcher_claim import DOMAIN, IDENT, LauncherClaimBlocked, parse_inert_launcher_claim

HEX = re.compile(r"sha256:[0-9a-f]{64}\Z")
KEY = re.compile(r"[0-9a-f]{64}\Z")
PREFIX = (DOMAIN + "\0").encode("ascii")


class EnvelopeBlocked(LauncherClaimBlocked):
    """Untrusted detached-envelope/policy mismatch."""


def _hash(raw: Any) -> str:
    if not isinstance(raw, str) or HEX.fullmatch(raw) is None:
        raise EnvelopeBlocked("malformed digest")
    return raw


def _canonical_claim_bytes(claim: Any) -> bytes:
    if not isinstance(claim, dict):
        raise EnvelopeBlocked("claim object required")
    try:
        return json.dumps(claim, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")
    except (TypeError, ValueError) as exc:
        raise EnvelopeBlocked("uncanonicalizable claim") from exc


def preview_ed25519_envelope(
    claim: Any, package_bytes: Any, envelope: Any, policy: Any,
) -> dict[str, Any]:
    """Check syntax and cross-references, NEVER Ed25519 cryptographic validity."""
    parsed = parse_inert_launcher_claim(claim, package_bytes)
    fields = {"schemaVersion", "kind", "domain", "algorithm", "keyId", "claimSha256", "signature"}
    if not isinstance(envelope, dict) or set(envelope) != fields:
        raise EnvelopeBlocked("unrecognized detached envelope fields")
    constants = {"schemaVersion": 1, "kind": "sanq-root-launcher-signature-v1",
                 "domain": DOMAIN, "algorithm": "Ed25519"}
    for key, expected in constants.items():
        if type(envelope[key]) is not type(expected) or envelope[key] != expected:
            raise EnvelopeBlocked("wrong signature-domain or algorithm")
    if envelope["keyId"] != claim["keyId"]:
        raise EnvelopeBlocked("detached key ID and claim disagree")
    digest = "sha256:" + hashlib.sha256(PREFIX + _canonical_claim_bytes(claim)).hexdigest()
    if _hash(envelope["claimSha256"]) != digest:
        raise EnvelopeBlocked("detached claim digest mismatch")
    signature = envelope["signature"]
    if not isinstance(signature, str) or len(signature) != 88 or not signature.endswith("=="):
        raise EnvelopeBlocked("wrong Ed25519 signature encoding")
    try:
        raw = base64.b64decode(signature, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise EnvelopeBlocked("invalid base64 signature") from exc
    if len(raw) != 64 or base64.b64encode(raw).decode("ascii") != signature:
        raise EnvelopeBlocked("noncanonical detached signature")

    policy_fields = {"schemaVersion", "kind", "algorithm", "policyVersion",
                     "minimumAcceptedVersion", "keyId", "publicKeyHex",
                     "revokedKeyIds", "revokedArtifactSha256", "publisherIdentity",
                     "buildWorkflowIdentity", "sourceRepository", "bootstrapAuthorized"}
    if not isinstance(policy, dict) or set(policy) != policy_fields:
        raise EnvelopeBlocked("unrecognized trust-policy fields")
    fixed = {"schemaVersion": 1, "kind": "inert-launcher-trust-policy-v1",
             "algorithm": "Ed25519", "sourceRepository": "sanqin888/sanqinMVP",
             "bootstrapAuthorized": False}
    for k, v in fixed.items():
        if type(policy[k]) is not type(v) or policy[k] != v:
            raise EnvelopeBlocked("wrong policy identity or authority")
    if type(policy["policyVersion"]) is not int or type(policy["minimumAcceptedVersion"]) is not int:
        raise EnvelopeBlocked("invalid policy generations")
    if not 1 <= policy["minimumAcceptedVersion"] <= policy["policyVersion"]:
        raise EnvelopeBlocked("policy epoch mismatch")
    if claim["policyVersion"] != policy["policyVersion"]:
        raise EnvelopeBlocked("policy version mismatch")
    if (policy["keyId"] != claim["keyId"] or
        policy["publisherIdentity"] != claim["publisherIdentity"] or
        policy["buildWorkflowIdentity"] != claim["buildWorkflowIdentity"]):
        raise EnvelopeBlocked("unmatched key, publisher or workflow")
    if not isinstance(policy["publicKeyHex"], str) or not KEY.fullmatch(policy["publicKeyHex"]):
        raise EnvelopeBlocked("incorrect public-key byte shape")
    for name, rule in (("revokedKeyIds", lambda x: isinstance(x, str) and IDENT.fullmatch(x) is not None),
                       ("revokedArtifactSha256", lambda x: isinstance(x, str) and HEX.fullmatch(x) is not None)):
        values = policy[name]
        if not isinstance(values, list) or len(values) > 128 or any(not rule(x) for x in values) or len(set(values)) != len(values):
            raise EnvelopeBlocked("invalid revocation list shape")
    if claim["keyId"] in policy["revokedKeyIds"] or claim["artifactSha256"] in policy["revokedArtifactSha256"]:
        raise EnvelopeBlocked("locally declared revocation")
    return {"schemaVersion": 1, "kind": "inert-ed25519-envelope-preview-v1",
            "sourceSha": parsed["sourceSha"], "claimDigestMatches": True,
            "signatureEncodingValid": True, "policyShapeConsistent": True,
            "signatureCryptographicallyVerified": False,
            "independentTrustRootVerified": False,
            "revocationAuthorityVerified": False,
            "publisherAuthenticated": False,
            "readyToInstall": False, "readyToDeploy": False, "readyToRollback": False,
            "authorizedToMutateProduction": False}
