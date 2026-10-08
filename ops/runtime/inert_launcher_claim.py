"""C5-B3B2J: strictly inert Launcher publication claim parser.

Pure formatting/consistency checks only. No signer, trust anchor, signature
verification, network, filesystem, CLI, or production permission.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any

from inert_launcher_bootstrap import INSTALL_PATH
from versioned_persistence_contract import PersistenceBlocked

HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"sha256:[0-9a-f]{64}\Z")
IDENT = re.compile(r"[a-z0-9][a-z0-9._/-]{0,127}\Z")
DOMAIN = "sanq.root-launcher.publisher.v1"
MAX_PACKAGE_BYTES = 4 * 1024 * 1024


class LauncherClaimBlocked(PersistenceBlocked):
    """Malformed, inconsistent or unsafe *untrusted* publisher claim."""


def _instant(raw: Any) -> datetime:
    if not isinstance(raw, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", raw):
        raise LauncherClaimBlocked("non-canonical claim timestamp")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise LauncherClaimBlocked("invalid claim timestamp") from exc
    if parsed.tzinfo != timezone.utc or parsed.isoformat(timespec="seconds") != raw.replace("Z", "+00:00"):
        raise LauncherClaimBlocked("invalid UTC seconds")
    return parsed


def _sha(raw: Any) -> str:
    if not isinstance(raw, str) or not HEX64.fullmatch(raw):
        raise LauncherClaimBlocked("invalid SHA256 claim")
    return raw


def parse_inert_launcher_claim(claim: Any, package_bytes: Any) -> dict[str, Any]:
    """Validate a v1 *claim*, always without asserting publisher authenticity.

    No attestation is processed: future detached signature and pinned root
    identity must be validated by a separately approved trustworthy verifier.
    """
    fields = {
        "schemaVersion", "kind", "domain", "sourceRepository", "sourceSha",
        "packageKind", "packageFormat", "artifactSha256", "artifactLength",
        "entrypointSha256", "inventorySha256", "buildWorkflowIdentity",
        "buildRunId", "ciRunId", "publisherIdentity", "keyId",
        "policyVersion", "validFrom", "expiresAt", "replacesKeyId",
        "installPath", "ownerUid", "ownerGid", "mode",
        "requiresManualApproval", "productionActivationAuthorized",
    }
    if not isinstance(claim, dict) or set(claim) != fields:
        raise LauncherClaimBlocked("unknown or missing claim fields")
    exact = {
        "schemaVersion": 1, "kind": "sanq-root-launcher-publication-v1",
        "domain": DOMAIN, "sourceRepository": "sanqin888/sanqinMVP",
        "packageKind": "root-launcher", "packageFormat": "launcher-package-v1",
        "installPath": INSTALL_PATH, "ownerUid": 0, "ownerGid": 0,
        "mode": "0500", "requiresManualApproval": True,
        "productionActivationAuthorized": False,
    }
    for name, expected in exact.items():
        if type(claim[name]) is not type(expected) or claim[name] != expected:
            raise LauncherClaimBlocked("wrong fixed claim identity or authority")
    if not isinstance(claim["sourceSha"], str) or not HEX40.fullmatch(claim["sourceSha"]):
        raise LauncherClaimBlocked("unbound source SHA")
    if not isinstance(package_bytes, bytes) or not 0 < len(package_bytes) <= MAX_PACKAGE_BYTES:
        raise LauncherClaimBlocked("missing or oversized candidate package")
    if type(claim["artifactLength"]) is not int or claim["artifactLength"] != len(package_bytes):
        raise LauncherClaimBlocked("package length mismatch")
    if _sha(claim["artifactSha256"]) != "sha256:" + hashlib.sha256(package_bytes).hexdigest():
        raise LauncherClaimBlocked("package bytes mismatch")
    _sha(claim["entrypointSha256"])
    _sha(claim["inventorySha256"])
    if claim["entrypointSha256"] == claim["inventorySha256"]:
        raise LauncherClaimBlocked("entrypoint and inventory must be distinct proofs")
    for key in ("buildWorkflowIdentity", "publisherIdentity", "keyId"):
        raw = claim[key]
        if not isinstance(raw, str) or IDENT.fullmatch(raw) is None:
            raise LauncherClaimBlocked("invalid publisher identity/reference syntax")
    for key in ("buildRunId", "ciRunId", "policyVersion"):
        n = claim[key]
        if type(n) is not int or n <= 0:
            raise LauncherClaimBlocked("invalid policy or workflow generation")
    prior = claim["replacesKeyId"]
    if prior is not None and (not isinstance(prior, str) or IDENT.fullmatch(prior) is None or prior == claim["keyId"]):
        raise LauncherClaimBlocked("invalid predecessor key reference")
    start, end = _instant(claim["validFrom"]), _instant(claim["expiresAt"])
    if not start < end or (end - start).days > 366:
        raise LauncherClaimBlocked("invalid claim validity window")
    # Intentionally does not compare with local wall clock: this is an offline
    # syntax parser, not a real expiry/revocation verifier.
    return {
        "schemaVersion": 1, "kind": "inert-launcher-claim-preview-v1",
        "sourceSha": claim["sourceSha"],
        "candidateClaimShapeConsistent": True,
        "candidateArtifactBytesMatch": True,
        "detachedSignatureVerified": False,
        "independentPublisherVerified": False,
        "trustRootPinned": False,
        "keyRevocationChecked": False,
        "currentTimeValidityChecked": False,
        "packageMemberInventoryVerified": False,
        "entrypointBytesVerified": False,
        "approvedMainSourceVerified": False,
        "retentionVerified": False,
        "readyToInstall": False,
        "readyToDeploy": False,
        "readyToRollback": False,
        "authorizedToMutateProduction": False,
    }
