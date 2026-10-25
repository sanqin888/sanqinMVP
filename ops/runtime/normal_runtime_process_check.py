"""C1-PREP-08: current-process conformance to the existing pinned v1 proposal.

Reads only current Python/process views. Does not authenticate the interpreter,
OS, namespace or the already-executed outer code; cannot establish pre-start
trust, grant effects, sanitize/restart a process or issue an approval receipt.
"""
from __future__ import annotations

import os
import sys

from normal_runtime_launch import (
    FLAGS, LaunchMaterials, LaunchMaterialsBlocked, SHA256, canonical, digest,
)

FLAG_EXPECTATIONS = (
    ("isolated", 1), ("ignore_environment", 1), ("no_site", 1),
    ("no_user_site", 1), ("dont_write_bytecode", 1),
    ("safe_path", True), ("optimize", 0),
)


class LaunchProcessBlocked(ValueError):
    pass


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise LaunchProcessBlocked(reason)


def _observe_current_process() -> dict:
    # Internal only: the public guard never returns/logs env or argv views.
    return {
        "os": sys.platform,
        "architecture": os.uname().machine,
        "pythonVersion": ".".join(str(part) for part in sys.version_info[:3]),
        "releaseLevel": sys.version_info.releaselevel,
        "releaseSerial": sys.version_info.serial,
        "executable": sys.executable,
        "realUid": os.getuid(),
        "effectiveUid": os.geteuid(),
        "realGid": os.getgid(),
        "effectiveGid": os.getegid(),
        "cwd": os.getcwd(),
        "argv": tuple(sys.argv),
        "originalArgv": tuple(sys.orig_argv),
        "environment": dict(os.environ),
        "flags": {name: getattr(sys.flags, name) for name, _ in FLAG_EXPECTATIONS},
    }


def require_current_launch_process(
    materials: LaunchMaterials,
    *,
    expected_launch_sha256: str,
) -> None:
    """Reject mismatches before source capture; success returns no permit/data.

    Exact argv/env/cwd and root IDs reflect the unchanged v1 declaration.
    Python's environment view is not a libc/initial-env attestation. Observations
    are not atomic or continuous; trusted external pre-launch checks remain.
    """
    _require(type(materials) is LaunchMaterials, "typed launch materials required")
    _require(type(expected_launch_sha256) is str
             and SHA256.fullmatch(expected_launch_sha256) is not None
             and expected_launch_sha256 != "0" * 64,
             "invalid independently pinned launch digest")
    try:
        document = materials.document()
        _require(digest(canonical(document)) == expected_launch_sha256,
                 "launch differs from independently pinned digest")
        expected = {
            "os": document["platform"]["os"],
            "architecture": document["platform"]["architecture"],
            "pythonVersion": document["platform"]["pythonVersion"],
            "releaseLevel": "final",
            "releaseSerial": 0,
            "executable": document["argv"][0],
            "realUid": document["uid"],
            "effectiveUid": document["uid"],
            "realGid": document["gid"],
            "effectiveGid": document["gid"],
            "cwd": document["cwd"],
            "argv": tuple(document["argv"][1 + len(FLAGS):]),
            "originalArgv": tuple(document["argv"]),
            "environment": document["environment"],
            "flags": dict(FLAG_EXPECTATIONS),
        }
        observed = _observe_current_process()
        _require(type(observed) is dict and set(observed) == set(expected),
                 "launch process observation is incomplete")
        for field, wanted in expected.items():
            # Serialization distinguishes bool/int, without retaining a report.
            _require(canonical({"value": observed[field]}) == canonical({"value": wanted}),
                     "launch process field mismatch: " + field)
    except LaunchProcessBlocked:
        raise
    except (LaunchMaterialsBlocked, OSError, AttributeError, KeyError,
            ValueError, TypeError, OverflowError, RecursionError) as exc:
        # No actual env/argv value is interpolated into this public message.
        raise LaunchProcessBlocked("current launch process check failed") from exc
