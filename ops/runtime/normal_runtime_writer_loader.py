"""Fixed-byte eight-module writer assembly; no bootstrap or effect permission.

Caller must retain and authenticate the original source FD/ancestor scope and
stdlib/platform/pins. This is not a sandbox; approved code can use trusted
stdlib capabilities. No writer invocation or source path fallback occurs here.
"""
from types import MappingProxyType
import contextlib
import fcntl
import os
import secrets
import stat
import sys

import normal_runtime_source_loader as loader

WRITER_MODULES = (
    "normal_runtime_launch", "normal_runtime_update", "normal_runtime_inputs",
    "normal_runtime_source_snapshot", "normal_runtime_source_anchor",
    "normal_runtime_local_admission", "normal_runtime_history_review",
    "normal_runtime_history_writer",
)
_WRITER_PRELOADED = MappingProxyType({
    **loader._PRELOADED, "contextlib": contextlib, "fcntl": fcntl, "os": os,
    "secrets": secrets, "stat": stat, "sys": sys,
})


def load_pinned_writer_candidate(snapshot, launch_bytes, request_bytes, *,
                                  expected_launch_sha256, expected_request_sha256):
    """Assemble writer+same-group core inside a private active import scope.

    Exact selected eight files plus the declared unexecuted bootstrap required.
    No arbitrary module/stdlib/path selector or implicit transaction admission.
    """
    return loader._load_candidate(snapshot, launch_bytes, request_bytes,
        expected_launch_sha256=expected_launch_sha256,
        expected_request_sha256=expected_request_sha256,
        _selected=WRITER_MODULES, _preloaded=_WRITER_PRELOADED,
        _tag="writer_", _exact=True,
        _compiler=lambda fixed: loader._compile_modules(fixed, WRITER_MODULES))
