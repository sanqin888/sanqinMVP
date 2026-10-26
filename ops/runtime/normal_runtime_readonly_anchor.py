"""P10-F3 fixed-path read-only Runtime review in the current namespace.

No caller root/owner/path override, CLI, transaction admission or effects.
Reuse PREP-04's held-directory checks; F2's finite member FDs stay inside them.
The current namespace and host/executor are NOT authenticated by opening "/".
"""
from __future__ import annotations

from contextlib import contextmanager
import os

from normal_runtime_readonly_review import (
    hold_readonly_update, ReadonlyReviewBlocked, _HeldReadonlyReview, _owned_fds,
)
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
    with _owned_fds() as stack:
        root = _open_namespace_root()
        stack.callback(os.close, root)
        first = _directory_key(root, uid, gid, None)
        held = [("", root, first)]
        for name in _PARTS:
            fd = os.open(name, _flags(), dir_fd=held[-1][1])
            stack.callback(os.close, fd)
            held.append((name, fd, _directory_key(fd, uid, gid, first[0])))
        fixed = tuple(held)
        def recheck():
            _checked_recheck(fixed, uid, gid)

        recheck()
        yield held[-1][1], tuple(
            {"component": name or "/", "device": key[0], "inode": key[1]}
            for name, _, key in held), recheck
        recheck()


@contextmanager
def hold_fixed_runtime_review(launch_bytes, request_bytes, *, expected_launch_sha256,
                               expected_request_sha256, target_archive,
                               preserved_observation, fetch=github_json):
    """Hold fixed ancestors and reviewed member FDs until consumer exit.

    Explicit recheck includes both layers; never a lock, freeze or permit.
    Not valid across an intentional Runtime replacement or frozen-state change.
    """
    with _fixed_runtime() as (fd, directories, recheck_path):
        with hold_readonly_update(launch_bytes, request_bytes,
                expected_launch_sha256=expected_launch_sha256,
                expected_request_sha256=expected_request_sha256,
                target_archive=target_archive, preserved_observation=preserved_observation,
                installed_root_fd=fd, fetch=fetch) as installed:
            report = installed.report
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

            def recheck():
                recheck_path()
                installed.recheck()

            recheck()
            held = _HeldReadonlyReview(result, recheck)
            try:
                yield held
            finally:
                held._live = False


def review_fixed_runtime(launch_bytes, request_bytes, *, expected_launch_sha256,
                         expected_request_sha256, target_archive,
                         preserved_observation, fetch=github_json):
    """Return the original point-in-time report after both scopes exit."""
    with hold_fixed_runtime_review(launch_bytes, request_bytes,
            expected_launch_sha256=expected_launch_sha256,
            expected_request_sha256=expected_request_sha256,
            target_archive=target_archive, preserved_observation=preserved_observation,
            fetch=fetch) as held:
        report = held.report
    return report
