"""P10-F3 fixed-path read-only Runtime review in the current namespace.

No caller root/owner/path override, CLI, transaction admission or effects.
Reuse PREP-04's held-directory checks; F2's finite member FDs stay inside them.
The current namespace and host/executor are NOT authenticated by opening "/".
"""
from __future__ import annotations

from contextlib import contextmanager, ExitStack
import os

from normal_runtime_readonly_review import review_readonly_update, ReadonlyReviewBlocked
from normal_runtime_source_anchor import (
    _platform, _flags, _open_namespace_root, _directory_key, _checked_recheck,
)
from release_contract import github_json

_ROOT_OWNER = (0, 0)
_PARTS = ("opt", "sanq", "runtime")


@contextmanager
def _fixed_runtime():
    _platform()
    uid, gid = _ROOT_OWNER
    with ExitStack() as stack:
        root = _open_namespace_root()
        stack.callback(os.close, root)
        first = _directory_key(root, uid, gid, None)
        held = [("", root, first)]
        for name in _PARTS:
            fd = os.open(name, _flags(), dir_fd=held[-1][1])
            stack.callback(os.close, fd)
            held.append((name, fd, _directory_key(fd, uid, gid, first[0])))
        fixed = tuple(held)
        _checked_recheck(fixed, uid, gid)
        try:
            yield held[-1][1], tuple(
                {"component": name or "/", "device": key[0], "inode": key[1]}
                for name, _, key in held)
        finally:
            _checked_recheck(fixed, uid, gid)


def review_fixed_runtime(launch_bytes, request_bytes, *, expected_launch_sha256,
                         expected_request_sha256, target_archive,
                         preserved_observation, fetch=github_json):
    """Bind /opt/sanq/runtime before F2 review and recheck before returning.

    Fixed path binding is point-in-time within this process namespace, not host
    authentication, uninterrupted maintenance or a future install capability.
    Failure returns no cached review, releases all owned FDs and never repairs.
    """
    with _fixed_runtime() as (fd, directories):
        report = review_readonly_update(launch_bytes, request_bytes,
            expected_launch_sha256=expected_launch_sha256,
            expected_request_sha256=expected_request_sha256,
            target_archive=target_archive, preserved_observation=preserved_observation,
            installed_root_fd=fd, fetch=fetch)
        flags = ("installedRootPathAuthenticated", "containerObservationAuthenticated",
                 "continuousMaintenanceVerified", "transactionAdmitted",
                 "flowInvoked", "readyToInstall", "authorizedToMutateProduction")
        if (type(report) is not dict or report.get("decision") != "BLOCKED"
                or any(report.get(name) is not False for name in flags)):
            raise ReadonlyReviewBlocked("read-only report boundary differs")
        result = {**report, "fixedRuntimePathBound": True,
                  "runtimePathBinding": {"path": "/opt/sanq/runtime",
                                         "directories": list(directories),
                                         "namespaceAuthenticated": False,
                                         "continuousBindingVerified": False}}
    return result
