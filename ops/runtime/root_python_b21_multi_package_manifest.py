"""B2-1D: inert cross-package file/link ownership claims for a B3A manifest.

This joins *untrusted* B2-1C candidate-member receipt dictionaries to the
inert manifest. It does not authenticate receipt origin, verify Ubuntu GPG,
resolve actual usrmerge paths, open root/Guest FDs, or grant Runtime authority.
"""
from __future__ import annotations

import re
from typing import Any

from root_python_dependency_manifest import (
    FILE_KINDS, review_dependency_manifest,
)
from root_python_b21_deb_members import SCHEMA as MEMBER_SCHEMA

SCHEMA = "sanq.c5.g2.r1.b2b2b2.multi-package-manifest-claims.v1"
MAX_PACKAGES = 32
MAX_LINK_ROUTES = 8
MAX_PATH = 256
_PACKAGE_ID = re.compile(r"[a-z0-9][a-z0-9.+_-]{0,95}\Z")
_SHA = re.compile(r"[0-9a-f]{64}\Z")
_RECEIPT_FIELDS = {
    "schema", "candidateDebSha256", "candidateFileSha256",
    "candidateSymlinkText", "candidateByteAndLinkTextClaimsMatch",
    "ubuntuReleaseSignatureIndependentlyAuthenticated",
    "debContainerPackageOriginIndependentlyAuthenticated",
    "filePinsIndependentlyAuthenticated",
    "guestRootFdAndInodeProvenanceAuthenticated",
    "actualDynamicPythonElfDlopenConsumptionWitnessed",
    "readyToInstall", "authorizedToMutateProduction", "decision",
}
_FALSE_FIELDS = (
    "ubuntuReleaseSignatureIndependentlyAuthenticated",
    "debContainerPackageOriginIndependentlyAuthenticated",
    "filePinsIndependentlyAuthenticated",
    "guestRootFdAndInodeProvenanceAuthenticated",
    "actualDynamicPythonElfDlopenConsumptionWitnessed",
    "readyToInstall", "authorizedToMutateProduction",
)


class PackageManifestClaimsBlocked(ValueError):
    """Incomplete, contradictory, or forged candidate package ownership."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise PackageManifestClaimsBlocked(reason)


def _path(raw: Any, *, absolute: bool) -> bool:
    if type(raw) is not str or not raw.isascii() or len(raw) > MAX_PATH:
        return False
    if absolute:
        if not raw.startswith("/"):
            return False
        raw = raw[1:]
    elif raw.startswith("/"):
        return False
    return (bool(raw) and all(32 < ord(c) < 127 for c in raw)
            and all(part not in ("", ".", "..") for part in raw.split("/")))


def _sha(raw: Any) -> bool:
    return type(raw) is str and _SHA.fullmatch(raw) is not None


def _receipt(value: Any, deb_sha: str) -> tuple[dict[str, str], dict[str, str]]:
    _require(type(value) is dict and set(value) == _RECEIPT_FIELDS
             and value["schema"] == MEMBER_SCHEMA
             and value["candidateDebSha256"] == deb_sha
             and value["candidateByteAndLinkTextClaimsMatch"] is True
             and value["decision"] == "BLOCKED"
             and all(value[key] is False for key in _FALSE_FIELDS),
             "wrong or forged B2-1C candidate receipt contract")
    files = value["candidateFileSha256"]
    links = value["candidateSymlinkText"]
    _require(type(files) is dict and type(links) is dict
             and len(files) <= 64 and len(links) <= 8
             and len(files) + len(links) > 0
             and set(files).isdisjoint(links)
             and all(_path(k, absolute=False) and _sha(v)
                     for k, v in files.items())
             and all(_path(k, absolute=False) and type(v) is str
                     and 0 < len(v) <= 256 and v.isascii()
                     and all(32 < ord(c) < 127 for c in v)
                     for k, v in links.items()),
             "unbounded or malformed B2-1C member claims")
    return files, links


def review_candidate_multi_package_manifest(
    manifest: Any, *, expected_manifest_sha256: Any,
    proposed_external_file_pins: Any, packages: Any,
    file_routes: Any, symlink_routes: Any,
) -> dict[str, Any]:
    """Require complete, unique logical-file/member ownership, always BLOCKED.

    The receipts and routes are separate caller-provided CLAIMS, not
    independently authenticated Ubuntu content or real FD observations.
    """
    try:
        review_dependency_manifest(
            manifest, expected_manifest_sha256=expected_manifest_sha256,
            proposed_external_file_pins=proposed_external_file_pins)
    except (TypeError, KeyError, ValueError) as exc:
        raise PackageManifestClaimsBlocked("invalid B3A manifest candidate") from exc
    logical_pins = {
        n["path"]: n["sha256"] for n in manifest["nodes"]
        if n["kind"] in FILE_KINDS
    }
    _require(type(packages) is list and 1 <= len(packages) <= MAX_PACKAGES
             and type(file_routes) is dict
             and set(file_routes) == set(logical_pins)
             and type(symlink_routes) is dict
             and len(symlink_routes) <= MAX_LINK_ROUTES
             and not (set(file_routes) & set(symlink_routes)),
             "missing/extra logical file ownership or unsafe link routes")
    catalog: dict[str, tuple[dict[str, str], dict[str, str]]] = {}
    for package in packages:
        _require(type(package) is dict
                 and set(package) == {"packageId", "debSha256", "memberReceipt"},
                 "invalid package record")
        pid, digest = package["packageId"], package["debSha256"]
        _require(type(pid) is str and _PACKAGE_ID.fullmatch(pid) is not None
                 and pid not in catalog and _sha(digest),
                 "duplicate/invalid candidate package identity")
        catalog[pid] = _receipt(package["memberReceipt"], digest)

    file_used: set[tuple[str, str]] = set()
    for logical, route in file_routes.items():
        _require(type(route) is dict
                 and set(route) == {"packageId", "memberPath"},
                 "malformed logical file route")
        pid, member = route["packageId"], route["memberPath"]
        _require(type(pid) is str and pid in catalog
                 and _path(member, absolute=False)
                 and member in catalog[pid][0]
                 and (pid, member) not in file_used
                 and catalog[pid][0][member] == logical_pins[logical],
                 "logical file digest or package-member mapping disagrees")
        file_used.add((pid, member))
    link_used: set[tuple[str, str]] = set()
    for logical, route in symlink_routes.items():
        _require(_path(logical, absolute=True)
                 and type(route) is dict
                 and set(route) == {"packageId", "memberPath", "linkText"},
                 "invalid logical symlink route")
        pid, member = route["packageId"], route["memberPath"]
        text = route["linkText"]
        _require(type(pid) is str and pid in catalog
                 and _path(member, absolute=False)
                 and type(text) is str
                 and member in catalog[pid][1]
                 and catalog[pid][1][member] == text
                 and (pid, member) not in link_used,
                 "symlink provenance claim conflicts with package member")
        link_used.add((pid, member))

    _require(file_used == {
        (pid, member) for pid, (files, _) in catalog.items()
        for member in files
    }, "unclaimed extra or orphan candidate package files")
    _require(link_used == {
        (pid, member) for pid, (_, links) in catalog.items()
        for member in links
    }, "unclaimed extra or orphan candidate package symlinks")
    return {
        "schema": SCHEMA,
        "candidatePackageCount": len(catalog),
        "candidateLogicalFileCount": len(logical_pins),
        "candidateSymlinkRouteCount": len(symlink_routes),
        "allManifestFileClaimsCoveredBySinglePackageMember": True,
        "candidateDebMemberDigestsAgreeWithManifest": True,
        "candidateSymlinkTextsAgreeWithPackageMembers": True,
        "ubuntuSignedReleaseIndependentlyVerified": False,
        "packageReceiptsIndependentlyAuthenticated": False,
        "logicalToCanonicalGuestPathsAuthenticated": False,
        "guestRootFdAndActualBytesAuthenticated": False,
        "actualDynamicPythonElfDlopenConsumptionWitnessed": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
