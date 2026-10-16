"""C5 B02-A: negative-only review of independently collected installer source evidence.

This module does not probe a host, follow paths, execute an operator, or grant
root installation. The caller must collect evidence independently in a
disposable guest; a self-reported clean record is NOT proof of provenance.
"""
from __future__ import annotations

import re
from typing import Any

SHA256 = re.compile(r"[0-9a-f]{64}\Z")
RUNTIME = "/opt/sanq/runtime"


class SourceReviewBlocked(ValueError):
    """The proposed root operator source has unsafe or incomplete evidence."""


def _check(value: bool, message: str) -> None:
    if not value:
        raise SourceReviewBlocked(message)


def review_trusted_operator_source(evidence: Any, expected_digest: str) -> dict[str, Any]:
    """Fail closed on mismatched source/path claims; return NON-authoritative receipt."""
    _check(isinstance(expected_digest, str) and SHA256.fullmatch(expected_digest) is not None,
           "invalid independent expected source digest")
    _check(isinstance(evidence, dict) and set(evidence) == {
        "kind", "schemaVersion", "sourceDigest", "installedDigest", "operatorPath",
        "pathComponents", "source", "runtimeRoot", "guestIsolationVerified",
    }, "incomplete or unknown source evidence")
    _check(evidence["kind"] == "c5-b02a-source-review-v1"
           and type(evidence["schemaVersion"]) is int and evidence["schemaVersion"] == 1,
           "unsupported evidence contract")
    _check(evidence["runtimeRoot"] == RUNTIME, "unexpected active Runtime identity")
    _check(evidence["guestIsolationVerified"] is True,
           "disposable guest isolation not confirmed")
    digest = evidence["sourceDigest"]
    installed = evidence["installedDigest"]
    _check(isinstance(digest, str) and SHA256.fullmatch(digest) is not None
           and installed == digest == expected_digest,
           "operator source bytes are not bound to independently pinned digest")
    path = evidence["operatorPath"]
    _check(isinstance(path, str) and path.startswith("/")
           and path != "/" and not path.startswith(RUNTIME + "/")
           and path not in (RUNTIME, "/tmp", "/var/tmp")
           and "//" not in path and "/./" not in path
           and ".." not in path.split("/")
           and not path.endswith("/"),
           "operator path is unsafe or lies inside active Runtime")
    parts = path.split("/")[1:]
    _check(all(parts) and all(parts), "operator path incomplete")
    ancestors = evidence["pathComponents"]
    _check(isinstance(ancestors, list) and len(ancestors) == len(parts)
           and len(parts) <= 16, "missing ancestor identity evidence")
    for idx, item in enumerate(ancestors):
        _check(isinstance(item, dict) and set(item) == {
            "path", "uid", "gid", "mode", "type", "symlink", "hardlinks",
            "device", "inode",
        }, "unknown ancestor metadata")
        current = "/" + "/".join(parts[:idx + 1])
        _check(item["path"] == current
               and type(item["uid"]) is int and item["uid"] == 0
               and type(item["gid"]) is int and item["gid"] == 0
               and type(item["mode"]) is int
               and item["mode"] == (0o600 if idx == len(parts) - 1 else 0o700)
               and item["type"] == ("file" if idx == len(parts) - 1 else "directory")
               and item["symlink"] is False
               and type(item["device"]) is int and item["device"] > 0
               and type(item["inode"]) is int and item["inode"] > 0
               and type(item["hardlinks"]) is int
               and (item["hardlinks"] == 1 if idx == len(parts) - 1
                    else item["hardlinks"] >= 2),
               "untrusted root-owned operator path")
    source = evidence["source"]
    _check(isinstance(source, dict) and set(source) == {
        "uid", "gid", "mode", "type", "hardlinks", "device", "inode", "bytes",
    }, "missing source file identity")
    leaf = ancestors[-1]
    _check(source["uid"] == 0 and source["gid"] == 0 and source["mode"] == 0o600
           and source["type"] == "file" and source["hardlinks"] == 1
           and type(source["device"]) is int and source["device"] == leaf["device"]
           and type(source["inode"]) is int and source["inode"] == leaf["inode"]
           and type(source["bytes"]) is int and 0 < source["bytes"] <= 2 * 1024 * 1024,
           "source FD identity or size mismatch")
    return {
        "kind": "c5-b02a-non-authorizing-source-review-v1",
        "structureConsistent": True,
        "expectedDigestMatched": True,
        "evidenceSourceAuthenticated": False,
        "rootOperatorExecutionVerified": False,
        "quiescenceVerified": False,
        "externalKitVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }
