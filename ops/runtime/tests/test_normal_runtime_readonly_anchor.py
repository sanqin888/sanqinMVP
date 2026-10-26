"""F3 fixed-path anchoring: real FD fixtures, no real /opt or namespace change."""
from contextlib import contextmanager
import inspect
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_readonly_anchor as anchor


def report():
    return {**{name: False for name in (
        "installedRootPathAuthenticated", "containerObservationAuthenticated",
        "continuousMaintenanceVerified", "transactionAdmitted", "flowInvoked",
        "readyToInstall", "authorizedToMutateProduction")}, "decision": "BLOCKED"}


@contextmanager
def held_report(value):
    yield SimpleNamespace(report=value, recheck=lambda: None)


class ReadonlyAnchorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.runtime = self.root / "opt/sanq/runtime"
        self.runtime.mkdir(parents=True, mode=0o755)
        self.args = dict(expected_launch_sha256="launch-pin",
                         expected_request_sha256="request-pin",
                         target_archive=b"archive", preserved_observation=b"observation",
                         fetch=lambda path: None)
        self.owner = patch.object(anchor, "_ROOT_OWNER", (os.getuid(), os.getgid()))
        self.root_provider = patch.object(anchor, "_open_namespace_root",
                                          side_effect=lambda: os.open(self.root, anchor._flags()))
        self.owner.start()
        self.root_provider.start()
        self.addCleanup(self.owner.stop)
        self.addCleanup(self.root_provider.stop)

    def call(self):
        return anchor.review_fixed_runtime(b"launch", b"request", **self.args)

    def test_fixed_leaf_fd_and_inputs_forwarded_inside_held_scope(self):
        captured = []
        def review(launch, request, **kwargs):
            self.assertEqual((launch, request), (b"launch", b"request"))
            for key, value in self.args.items():
                self.assertIs(kwargs[key], value)
            fd = kwargs["installed_root_fd"]
            captured.append(fd)
            self.assertEqual(os.fstat(fd).st_ino, self.runtime.stat().st_ino)
            return held_report(report())
        with patch.object(anchor, "hold_readonly_update", side_effect=review):
            result = self.call()
        self.assertIs(result["fixedRuntimePathBound"], True)
        self.assertEqual(result["runtimePathBinding"]["path"], "/opt/sanq/runtime")
        self.assertEqual(len(result["runtimePathBinding"]["directories"]), 4)
        self.assertIs(result["installedRootPathAuthenticated"], False)
        self.assertIs(result["runtimePathBinding"]["namespaceAuthenticated"], False)
        with self.assertRaises(OSError):
            os.fstat(captured[0])

    def test_no_public_path_owner_or_root_override(self):
        for entry in (anchor.review_fixed_runtime, anchor.hold_fixed_runtime_review):
            params = inspect.signature(entry).parameters
            for name in ("path", "root", "root_fd", "installed_root_fd", "owner", "uid"):
                self.assertNotIn(name, params)
            self.assertNotIn(inspect.Parameter.VAR_KEYWORD, {p.kind for p in params.values()})

    def test_symlink_ancestor_or_leaf_blocks_before_review(self):
        for relative in ("opt", "opt/sanq/runtime"):
            path = self.root / relative
            held = path.with_name(path.name + "-held")
            path.rename(held)
            path.symlink_to(held, target_is_directory=True)
            with patch.object(anchor, "hold_readonly_update") as review:
                with self.subTest(relative=relative), self.assertRaises((ValueError, OSError)):
                    self.call()
                review.assert_not_called()
            path.unlink()
            held.rename(path)

    def test_unsafe_ancestor_mode_or_owner_blocks_before_review(self):
        path = self.root / "opt"
        path.chmod(0o777)
        with patch.object(anchor, "hold_readonly_update") as review:
            with self.assertRaises(ValueError):
                self.call()
            review.assert_not_called()
        path.chmod(0o755)
        with patch.object(anchor, "_ROOT_OWNER", (12345, 12345)):
            with self.assertRaises(ValueError):
                self.call()

    def test_ancestor_replacement_during_review_rejected_after_callback(self):
        def review(*args, **kwargs):
            path = self.root / "opt/sanq"
            path.rename(path.with_name("sanq-held"))
            path.mkdir(mode=0o755)
            (path / "runtime").mkdir()
            return held_report(report())
        with patch.object(anchor, "hold_readonly_update", side_effect=review):
            with self.assertRaises(ValueError):
                self.call()

    def test_permission_drift_during_review_rejected_and_not_repaired(self):
        def review(*args, **kwargs):
            self.runtime.chmod(0o777)
            return held_report(report())
        with patch.object(anchor, "hold_readonly_update", side_effect=review):
            with self.assertRaises(ValueError):
                self.call()
        self.assertEqual(self.runtime.stat().st_mode & 0o777, 0o777)

    def test_unrelated_parent_entry_change_does_not_invalidate_fixed_edge(self):
        def review(*args, **kwargs):
            (self.root / "unrelated").mkdir()
            return held_report(report())
        with patch.object(anchor, "hold_readonly_update", side_effect=review):
            self.assertIs(self.call()["fixedRuntimePathBound"], True)

    def test_report_cannot_gain_authority_or_omit_required_false_flags(self):
        for bad in ({**report(), "transactionAdmitted": True}, {"decision": "BLOCKED"}):
            with patch.object(anchor, "hold_readonly_update", return_value=held_report(bad)):
                with self.subTest(bad=bad), self.assertRaises(ValueError):
                    self.call()

    def test_exception_and_incomplete_path_close_all_own_fds(self):
        before = set(os.listdir("/proc/self/fd"))
        with patch.object(anchor, "hold_readonly_update", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                self.call()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        self.runtime.rmdir()
        with self.assertRaises(OSError):
            self.call()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_real_f2_review_composes_with_fixed_path_fixture(self):
        # Reuse F2's existing data/fetch fixture, not its test methods.
        import test_normal_runtime_readonly_review as f2_tests
        fixture = f2_tests.ReadonlyReviewTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.runtime.rmdir()
        fixture.root.rename(self.runtime)
        fixture.root = self.runtime
        result = anchor.review_fixed_runtime(fixture.launch, fixture.request,
            expected_launch_sha256=f2_tests.digest(fixture.launch),
            expected_request_sha256=f2_tests.digest(fixture.request),
            target_archive=fixture.target, preserved_observation=fixture.observation,
            fetch=fixture.fetch)
        self.assertEqual(result["changedMembers"], ["ops/release/deploy_release.py"])
        self.assertIs(result["fixedRuntimePathBound"], True)
        self.assertIs(result["transactionAdmitted"], False)
        os.fstat(fixture.fd)


    def real_fixture(self):
        import test_normal_runtime_readonly_review as f2_tests
        fixture = f2_tests.ReadonlyReviewTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.runtime.rmdir()
        fixture.root.rename(self.runtime)
        fixture.root = self.runtime
        args = dict(expected_launch_sha256=f2_tests.digest(fixture.launch),
                    expected_request_sha256=f2_tests.digest(fixture.request),
                    target_archive=fixture.target, preserved_observation=fixture.observation,
                    fetch=fixture.fetch)
        return fixture, args

    def test_real_fixed_context_holds_both_layers_and_rechecks_without_network(self):
        fixture, args = self.real_fixture()
        before = set(os.listdir("/proc/self/fd"))
        with anchor.hold_fixed_runtime_review(fixture.launch, fixture.request, **args) as held:
            self.assertGreater(len(os.listdir("/proc/self/fd")), len(before) + 4)
            self.assertTrue(held.report["fixedRuntimePathBound"])
            self.assertFalse(held.report["runtimePathBinding"]["continuousBindingVerified"])
            calls = list(fixture.calls)
            held.recheck()
            self.assertEqual(fixture.calls, calls)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        with self.assertRaises(ValueError):
            held.recheck()
        os.fstat(fixture.fd)

    def test_consumer_ancestor_replacement_rejected_explicitly_and_at_exit(self):
        fixture, args = self.real_fixture()
        before = set(os.listdir("/proc/self/fd"))
        with self.assertRaises(ValueError):
            with anchor.hold_fixed_runtime_review(fixture.launch, fixture.request, **args) as held:
                path = self.root / "opt/sanq"
                path.rename(path.with_name("saved-sanq"))
                path.mkdir(mode=0o755)
                (path / "runtime").mkdir(mode=0o755)
                with self.assertRaises(ValueError):
                    held.recheck()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_consumer_member_replacement_is_included_in_fixed_recheck(self):
        fixture, args = self.real_fixture()
        before = set(os.listdir("/proc/self/fd"))
        with self.assertRaises(ValueError):
            with anchor.hold_fixed_runtime_review(fixture.launch, fixture.request, **args) as held:
                path = self.runtime / ".env"
                raw = path.read_bytes()
                path.unlink()
                path.write_bytes(raw)
                path.chmod(0o600)
                with self.assertRaises(ValueError):
                    held.recheck()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_unrelated_ancestor_sibling_change_allowed_during_consumer(self):
        fixture, args = self.real_fixture()
        with anchor.hold_fixed_runtime_review(fixture.launch, fixture.request, **args) as held:
            (self.root / "unrelated-sibling").mkdir()
            held.recheck()

    def test_consumer_interrupt_survives_path_drift_and_all_fds_close(self):
        fixture, args = self.real_fixture()
        before = set(os.listdir("/proc/self/fd"))
        error = KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt) as caught:
            with anchor.hold_fixed_runtime_review(fixture.launch, fixture.request, **args) as held:
                self.runtime.chmod(0o777)
                raise error
        self.assertIs(caught.exception, error)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        with self.assertRaises(ValueError):
            held.recheck()
        self.assertEqual(self.runtime.stat().st_mode & 0o777, 0o777)

    def test_fixed_context_normal_exit_propagates_owned_close_failure(self):
        fixture, args = self.real_fixture()
        before = set(os.listdir("/proc/self/fd"))
        close = os.close
        def failed_close(fd):
            close(fd)
            raise OSError("injected close failure after actual close")
        with patch.object(anchor.os, "close", side_effect=failed_close):
            with self.assertRaises(OSError):
                with anchor.hold_fixed_runtime_review(fixture.launch, fixture.request, **args):
                    pass
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)


    def test_outer_exception_handler_does_not_skip_normal_ancestor_exit_check(self):
        fixture, args = self.real_fixture()
        before = set(os.listdir("/proc/self/fd"))
        try:
            raise RuntimeError("unrelated outer handler")
        except RuntimeError:
            with self.assertRaises(ValueError):
                with anchor.hold_fixed_runtime_review(fixture.launch, fixture.request, **args):
                    (self.root / "opt/sanq").chmod(0o700)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)


if __name__ == "__main__":
    unittest.main()
