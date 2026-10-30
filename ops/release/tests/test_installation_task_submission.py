"""Fixed unit submission: real retained bytes/locks/pipes, disposable client and modeled manager."""
import contextlib
import io
import os
import select
import threading
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_private_install_materials as private
import test_installation_supervised_writers as supervised
import test_installation_task_context as manager
from release_contract import ReleaseContractError


def close_fd(fd):
    try:
        os.close(fd)
    except OSError:
        pass


class InstallationSubmissionTests(unittest.TestCase):
    def setUp(self):
        self.materials = private.PrivateMaterialsTests()
        self.materials.setUp()
        self.addCleanup(self.materials.doCleanups)
        self.materials.retain()
        self.source = "b" * 40
        self.bootstrap = supervised.provision_bound_sources(self, self.materials, self.source)
        self.input, self.peer_write = os.pipe()
        self.peer_read, self.output = os.pipe()
        for fd in (self.input, self.peer_write, self.peer_read, self.output):
            self.addCleanup(close_fd, fd)
        self.status = 0
        self.returncode = None
        self.waits, self.terminations, self.kills = [], 0, 0
        self.before_wait = None
        self.pending = 0
        self.descriptors = {}
        read = installer._bootstrap_read
        def capture(fd, parent, name):
            self.descriptors[name] = fd
            return read(fd, parent, name)
        self.read_patch = patch.object(installer, "_bootstrap_read", side_effect=capture)
        self.read_patch.start()
        self.addCleanup(self.read_patch.stop)

    def wait(self, *, timeout):
        self.waits.append(timeout)
        # Submission must not retain either original lock while the child acquires them.
        with installer._private_session():
            pass
        if timeout <= 1:
            for fd in self.descriptors.values():
                self.assertGreater(os.fstat(fd).st_size, 0)
        if self.before_wait:
            self.before_wait()
        if self.pending:
            self.pending -= 1
            raise subprocess.TimeoutExpired("fixed-client", timeout)
        self.returncode = self.status
        return self.status

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminations += 1

    def kill(self):
        self.kills += 1

    def submit(self, *, launch=None):
        with patch.object(installer.subprocess, "Popen", return_value=self, side_effect=launch) as opened:
            result = installer._installation_task_submit(self.materials.identity, self.source,
                input_fd=self.input, output_fd=self.output, fetch=self.materials.case.fetch)
        return result, opened

    def test_submit_once_holds_qualified_source_fds_but_releases_original_locks_and_borrows_pipes(self):
        self.pending = 1
        with patch.dict(os.environ, {"TERM": "unreviewed", "GITHUB_TOKEN": "fixture-secret",
                                     "SYSTEMD_UNIT": "unreviewed"}):
            result, opened = self.submit()
        self.assertEqual(result, 0)
        opened.assert_called_once()
        args, options = opened.call_args.args[0], opened.call_args.kwargs
        self.assertEqual(args, installer._installation_task_submit_args(self.source, self.materials.identity))
        self.assertEqual(options, {"stdin": self.input, "stdout": self.output,
            "stderr": subprocess.DEVNULL, "close_fds": True, "start_new_session": True, "cwd": "/",
            "env": {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}})
        self.assertEqual(len(self.descriptors), 5)
        for fd in self.descriptors.values():
            with self.assertRaises(OSError):
                os.fstat(fd)
        self.assertEqual((self.terminations, self.kills), (0, 0))
        self.assertEqual(os.write(self.peer_write, b"x"), 1)
        self.assertEqual(os.read(self.input, 1), b"x")
        self.materials.assert_no_install_effect()

    def test_live_borrowed_pipe_descriptors_reach_a_disposable_waiting_client(self):
        real_popen = subprocess.Popen
        errors, requests = [], []
        def peer():
            try:
                self.assertTrue(select.select([self.peer_read], [], [], 5)[0])
                requests.append(os.read(self.peer_read, 4096))
                self.assertEqual(os.write(self.peer_write, b"fixture-reply\n"), 14)
            except BaseException as error:
                errors.append(error)
        worker = threading.Thread(target=peer, daemon=True)
        worker.start()
        def disposable(args, **options):
            self.assertEqual(args, installer._installation_task_submit_args(self.source, self.materials.identity))
            # Exercise real FD inheritance through Popen, not the systemd manager or installer.
            program = ("import os,select; os.write(1,b'fixture-request'+bytes([10])); "
                       "ready=select.select([0],[],[],5)[0]; "
                       "raise SystemExit(0 if ready and os.read(0,4096)==b'fixture-reply'+bytes([10]) else 1)")
            return real_popen([sys.executable, "-I", "-S", "-B", "-c", program], **options)
        result, opened = self.submit(launch=disposable)
        worker.join(timeout=6)
        self.assertFalse(worker.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(requests, [b"fixture-request\n"])
        self.assertEqual(result, 0)
        opened.assert_called_once()

    def test_fixed_submit_argv_has_no_shell_remain_collect_reset_or_automatic_retry(self):
        args = installer._installation_task_submit_args(self.source, self.materials.identity)
        self.assertEqual(args[:6], ["/usr/bin/systemd-run", "--system", "--quiet",
                                   "--no-ask-password", "--pipe", "--wait"])
        self.assertIn("--property=RemainAfterExit=no", args)
        self.assertIn("--property=Restart=no", args)
        self.assertIn("--property=CollectMode=inactive", args)
        self.assertIn("--property=Delegate=no", args)
        self.assertIn("--property=TimeoutStartSec=7200", args)
        self.assertIn("--property=TimeoutStopSec=900", args)
        cleanup = "--property=ExecStopPost=" + " ".join(
            installer._installation_task_argv(self.source, self.materials.identity, "cleanup"))
        self.assertEqual(args.count(cleanup), 1)
        split = args.index("--")
        self.assertEqual(args[split + 1:],
                         installer._installation_task_argv(self.source, self.materials.identity, "run"))
        for option in ("--remain-after-exit", "--collect", "--no-block", "--scope", "--shell", "--pty"):
            self.assertNotIn(option, args)
        self.assertFalse(installer._installation_task_show_allowed(args))

    def test_nonzero_signal_or_non_native_wait_result_never_reports_success_or_resubmits(self):
        for status in (1, -15, None, True, "0"):
            self.status = status
            self.returncode = None
            with self.subTest(status=status):
                result, opened = self.submit()
                self.assertEqual(result, 1)
                opened.assert_called_once()

    def test_submission_transport_error_is_unknown_without_retry_or_host_command(self):
        with patch.object(installer, "_bounded_host_client", side_effect=AssertionError("host mutation")):
            result, opened = self.submit(launch=OSError("unknown D-Bus submission reply"))
        self.assertEqual(result, 1)
        opened.assert_called_once()
        self.assertEqual(self.waits, [])
        self.materials.assert_no_install_effect()

    def test_initial_bad_source_or_material_refuses_before_client_spawn(self):
        source = self.bootstrap / installer.BOOTSTRAP
        source.write_bytes(source.read_bytes() + b"# drift\n")
        result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_not_called()

    def test_previous_or_partial_transaction_blocks_even_if_unit_has_been_garbage_collected(self):
        namespace = self.materials.state / installer.INSTALLATION_RUNS
        namespace.mkdir(mode=0o700)
        (namespace / ("a" * 64)).mkdir(mode=0o700)
        result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_not_called()
        self.assertTrue((namespace / ("a" * 64)).is_dir())

    def test_maintenance_evidence_is_preserved_and_blocks_submission(self):
        marker = self.materials.state / "maintenance/active.json"
        marker.write_bytes(b"unresolved")
        marker.chmod(0o600)
        result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_not_called()
        self.assertEqual(marker.read_bytes(), b"unresolved")

    def test_original_lock_contention_prevents_submission(self):
        with installer._private_session():
            result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_not_called()

    def test_late_source_change_aborts_only_waiting_client_and_never_stops_or_replays_unit(self):
        def changed():
            self.before_wait = None
            source = self.bootstrap / installer.BOOTSTRAP
            source.write_bytes(source.read_bytes() + b"# during wait\n")
        self.before_wait, self.pending = changed, 1
        with patch.object(installer, "_bounded_host_client", side_effect=AssertionError("unit mutation")):
            result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_called_once()
        self.assertEqual((self.terminations, self.kills), (1, 0))

    def test_source_replacement_after_zero_client_exit_still_blocks_success(self):
        def replaced():
            source = self.bootstrap / installer.BOOTSTRAP
            other = source.with_suffix(".replacement")
            other.write_bytes(source.read_bytes())
            other.chmod(0o600)
            other.replace(source)
        self.before_wait = replaced
        result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_called_once()
        self.assertEqual(self.terminations, 0)

    def test_live_channel_replacement_during_wait_is_unknown_and_borrowed_fds_are_not_closed(self):
        def replaced():
            self.before_wait = None
            read, write = os.pipe()
            self.addCleanup(close_fd, read)
            self.addCleanup(close_fd, write)
            os.dup2(read, self.input)
        self.before_wait, self.pending = replaced, 1
        result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_called_once()
        self.assertGreaterEqual(os.fstat(self.input).st_ino, 0)
        self.assertEqual(self.terminations, 1)

    def test_interrupt_and_system_exit_zero_are_unknown_not_success(self):
        for failure in (KeyboardInterrupt(), SystemExit(0)):
            def interrupted():
                self.before_wait = None
                raise failure
            self.before_wait, self.returncode = interrupted, None
            with self.subTest(failure=type(failure).__name__):
                result, opened = self.submit()
                self.assertEqual(result, 1)
                opened.assert_called_once()
        self.assertEqual(self.terminations, 2)

    def test_expired_wait_budget_reaps_only_client_and_never_resubmits(self):
        with patch.object(installer, "INSTALL_TASK_CLIENT_SECONDS", -1):
            result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_called_once()
        self.assertEqual(self.terminations, 1)

    def test_stuck_waiting_client_is_killed_once_with_bounded_reap_and_no_unit_command(self):
        def unknown():
            self.before_wait = None
            raise OSError("waiting client result unknown")
        self.before_wait, self.pending = unknown, 1
        with patch.object(installer, "_bounded_host_client", side_effect=AssertionError("unit mutation")):
            result, opened = self.submit()
        self.assertEqual(result, 1)
        opened.assert_called_once()
        self.assertEqual((self.terminations, self.kills), (1, 1))
        self.assertEqual(self.waits[-2:], [5, 5])

    def test_submit_cli_accepts_only_fixed_source_and_retention_without_result_frame(self):
        args = ["installation-submit", "--source-sha", self.source,
                "--retention-id", self.materials.identity]
        output = io.StringIO()
        with patch.object(installer, "_installation_task_submit", return_value=1) as submit, \
             contextlib.redirect_stdout(output):
            self.assertEqual(installer.main(args), 1)
        self.assertEqual(submit.call_args.args, (self.materials.identity, self.source))
        self.assertEqual(output.getvalue(), "")
        for option in ("--host", "--command", "--unit", "--input-fd", "--kit", "--property"):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                installer.main(args + [option, "unreviewed"])

    def test_manager_rejects_remain_after_exit_or_unbounded_modified_timeouts(self):
        fixture = manager.InstallationTaskContextTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.assertEqual(fixture.context()["role"], "run")
        for key, value in (("RemainAfterExit", "yes"), ("TimeoutStartUSec", "infinity"),
                           ("TimeoutStopUSec", "infinity"), ("Delegate", "yes"),
                           ("CollectMode", "inactive-or-failed"), ("SendSIGKILL", "no"),
                           ("TimeoutStartFailureMode", "kill"), ("TimeoutStopFailureMode", "kill")):
            original = fixture.props[key]
            fixture.props[key] = value
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                fixture.context()
            fixture.props[key] = original


if __name__ == "__main__":
    unittest.main()
