"""C5-G2 B4B-3B-2B2-A: untrusted, INERT usrmerge alias claims.

Review an entirely caller-proposed, in-memory *synthetic* prefix mapping.
This is not realpath, readlink, an FD opener, a filesystem observation, or
a platform/loader identity. Even valid claims can never authorize execution.
The existing B4B-3B-2B1 O_NOFOLLOW file opener is deliberately untouched.
"""
from __future__ import annotations

from typing import Any

from root_python_dependency_manifest import (
    FILE_KINDS, review_dependency_manifest,
)

SCHEMA = "sanq.c5.g2.b4b3b2b2a.inert-usrmerge-alias-claims.v1"
# These are LIMITED SYNTHETIC examples, NOT verified Ubuntu symlink facts.
# A real Guest may have different targets or a further leaf-level symlink.
_ALLOWED_PREFIX_CLAIMS = {
    "/lib": "/usr/lib",
    "/lib64": "/usr/lib64",
}
MAX_ALIASES = len(_ALLOWED_PREFIX_CLAIMS)
MAX_FILES = 64
MAX_HOPS = 2


class UntrustedAliasBlocked(ValueError):
    """Inconsistent, unsupported or ambiguous proposed path alias claims."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise UntrustedAliasBlocked(reason)


def _replace_prefix(path: str, source: str, target: str) -> str | None:
    if path == source:
        return target
    if path.startswith(source + "/"):
        return target + path[len(source):]
    return None


def review_proposed_usrmerge_aliases(
    manifest: Any,
    *,
    expected_manifest_sha256: Any,
    proposed_file_pins: Any,
    proposed_alias_claims: Any,
) -> dict[str, Any]:
    """Constrain *claims*, without proving any filesystem or Runtime fact.

    Exactly two synthetic top-level prefix shapes can be modeled. Every
    claimed alias must be used by at least one manifest file. A returned
    proposedPathAfterClaims MUST NEVER be opened as an authenticated path.
    """
    try:
        review_dependency_manifest(
            manifest,
            expected_manifest_sha256=expected_manifest_sha256,
            proposed_external_file_pins=proposed_file_pins,
        )
        file_paths = sorted(
            node["path"] for node in manifest["nodes"]
            if node["kind"] in FILE_KINDS
        )
    except (ValueError, TypeError, KeyError) as exc:
        raise UntrustedAliasBlocked("invalid B4B-3A manifest or proposed pins") from exc
    _require(0 < len(file_paths) <= MAX_FILES, "file count outside reviewed bound")
    _require(type(proposed_alias_claims) is list
             and 1 <= len(proposed_alias_claims) <= MAX_ALIASES,
             "alias claims count outside reviewed bound")

    aliases: dict[str, str] = {}
    for claim in proposed_alias_claims:
        _require(type(claim) is dict
                 and set(claim) == {"linkPath", "targetPath"},
                 "unrecognized alias claim fields")
        link, target = claim["linkPath"], claim["targetPath"]
        _require(type(link) is str and type(target) is str
                 and link in _ALLOWED_PREFIX_CLAIMS
                 and target == _ALLOWED_PREFIX_CLAIMS[link],
                 "unsupported synthetic usrmerge alias edge")
        _require(link not in aliases, "duplicate alias source")
        aliases[link] = target

    used: set[str] = set()
    seen_proposed_paths: set[str] = set()
    mapped_files: list[dict[str, Any]] = []
    for original in file_paths:
        proposed = original
        traversed: set[str] = set()
        applied: list[str] = []
        for _ in range(MAX_HOPS):
            matches: list[tuple[str, str]] = []
            for source, target in aliases.items():
                output = _replace_prefix(proposed, source, target)
                if output is not None:
                    matches.append((source, output))
            _require(len(matches) <= 1, "ambiguous alias prefix")
            if not matches:
                break
            source, output = matches[0]
            _require(source not in traversed and output != proposed,
                     "alias path cycle")
            traversed.add(source)
            used.add(source)
            applied.append(source)
            proposed = output
        else:
            _require(not any(
                _replace_prefix(proposed, source, target) is not None
                for source, target in aliases.items()
            ), "alias resolution exceeds hop budget")
        _require(proposed not in seen_proposed_paths,
                 "multiple declared files share a proposed target path")
        seen_proposed_paths.add(proposed)
        mapped_files.append({
            "declaredPath": original,
            "proposedPathAfterClaims": proposed,
            "claimedAliasPrefixes": applied,
        })

    _require(used == set(aliases), "unused alias claim")
    return {
        "schema": SCHEMA,
        "proposedManifestSha256": expected_manifest_sha256,
        "proposedAliasClaims": [
            {"linkPath": source, "targetPath": aliases[source]}
            for source in sorted(aliases)
        ],
        "proposedFiles": mapped_files,
        "manifestAndAliasClaimsStructurallyReviewed": True,
        "proposedPathsAuthenticated": False,
        "symlinksOrLoaderPathsObserved": False,
        "rootAnchorOrMountNamespaceAuthenticated": False,
        "fileIdentityOrExternalPinProvenanceAuthenticated": False,
        "dynamicPythonElfAndDlopenClosureVerified": False,
        "independentGuestWitnessVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
