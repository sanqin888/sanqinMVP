"""Explicit manual Runtime sudo: LOCAL fake SSH pipe/TTY fixtures; no network."""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import termios
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sanq_deploy_manual as manual
import sanq_deploy as existing


SHA = "a" * 40
PLAN = "b" * 64
APPROVAL = "c" * 64


def target():
    return {
        "host": "runtime.example", "directory": Path("/Users/operator/.sanq-deploy"),
        "home": Path("/Users/operator"), "check": lambda: None,
    }


class FakeSSH:
    """A finished *local* subprocess with real selector-readable pipe FDs."""
    def __init__(self, output=b"", error=b"", code=0):
        self.returncode = code
        self.stdout = self.pipe(output)
        self.stderr = self.pipe(error)
        self.term_calls = 0

    @staticmethod
    def pipe(data):
        reader, writer = os.pipe()
        try:
            if data:
                os.write(writer, data)
        finally:
            os.close(writer)
        return os.fdopen(reader, "rb", buffering=0)

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        return self.returncode

    def terminate(self):
        self.term_calls += 1
        self.returncode = -15

    def kill(self):
        self.term_calls += 1
        self.returncode = -9


class ExactManualOperations(unittest.TestCase):
    def operation(self, *args):
        with contextlib.redirect_stderr(io.StringIO()):
            return manual._operation(list(args))

    def test_exact_ordinary_commands_reused_and_sudo_password_not_passed_as_argument(self):
        cases = [
            ("plan", "--target-sha", SHA),
            ("plan-rollback",),
            ("show-plan", PLAN), ("show-sql", PLAN),
            ("apply", PLAN, "--confirm-release", "--approve-sql", APPROVAL),
            ("status", PLAN), ("logs", PLAN),
            ("show-rollback", PLAN), ("show-rollback-sql", PLAN),
            ("check-rollback", PLAN, "--approve-compatibility", APPROVAL),
            ("rollback", PLAN, "--confirm-rollback", "--approve-compatibility", APPROVAL),
            ("status-rollback", PLAN),
        ]
        for args in cases:
            with self.subTest(args=args):
                op = self.operation(*args)
                ordinary = existing._operation(list(args))
                self.assertEqual(op["remote"], manual.MANUAL_PREFIX +
                                 ordinary["remote"][len(existing.REMOTE_PREFIX):])
                self.assertTrue(op["remote"].startswith(
                    "cd /opt/sanq/runtime && exec /usr/bin/sudo -k -p "))
                self.assertNotIn("sudo -S", op["remote"])
                self.assertNotIn("sudo -n", op["remote"])
                self.assertEqual(op["planId"], ordinary["planId"])
                self.assertEqual(op["timeout"], ordinary["timeout"])
                self.assertTrue(op["manualSudo"])

    def test_no_arbitrary_command_host_private_install_or_root_shell(self):
        for args in (("profile",), ("local-check",), ("submit", PLAN),
                     ("run", PLAN), ("cleanup", PLAN), ("exec", "id"),
                     ("status", PLAN, "--host", "attacker"),
                     ("status", PLAN, "--tty", "false"),
                     ("apply", PLAN), ("rollback", PLAN),
                     ("status", PLAN + ";id"), ("status", PLAN.upper())):
            with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises((SystemExit, manual.transport.ClientError)):
                    self.operation(*args)

    def test_manual_ssh_forces_pty_but_retains_all_pinned_transport_constraints(self):
        operation = self.operation("status", PLAN)
        ordinary = existing._ssh_argv(target(), operation)
        argv = manual._ssh_argv(target(), operation)
        self.assertEqual(argv, ordinary[:3] + ["-tt"] + ordinary[5:])
        self.assertNotIn("-T", argv)
        self.assertNotIn("-n", argv)
        self.assertIn("BatchMode=yes", argv)
        for value in ("StrictHostKeyChecking=yes", "HostKeyAlgorithms=ssh-ed25519",
                      "ForwardAgent=no", "ForwardX11=no", "ProxyCommand=none",
                      "ProxyJump=none", "ControlPath=none", "ClearAllForwardings=yes",
                      "PermitLocalCommand=no", "IdentitiesOnly=yes"):
            self.assertIn(value, argv)
        self.assertEqual(argv[-3:], ["--", "runtime.example", operation["remote"]])
        for invalid in (
            dict(operation, remote="id"),
            dict(operation, remote=manual.MANUAL_PREFIX + "release_task.py run " + PLAN),
            dict(operation, manualArgv=("status", "c" * 64)),
            dict(operation, command="apply"),
            dict(operation, manualSudo=False),
        ):
            with self.subTest(invalid=invalid), self.assertRaises(manual.transport.ClientError):
                manual._ssh_argv(target(), invalid)

    def test_original_client_remains_closed_to_stdin_and_still_noninteractive(self):
        op = existing._operation(["status", PLAN])
        self.assertTrue(op["remote"].startswith(existing.REMOTE_PREFIX))
        argv = existing._ssh_argv(target(), op)
        self.assertEqual(argv[:5], ["/usr/bin/ssh", "-F", "/dev/null", "-n", "-T"])
        self.assertNotIn("-tt", argv)


class ManualLocalFixture(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(manual.sys, "platform", "darwin"))
        self.stack.enter_context(patch.object(manual.os, "geteuid", return_value=1000))
        self.stack.enter_context(patch.object(manual.os, "isatty", return_value=True))
        self.initial = ["terminal-state"]
        self.tcset = self.stack.enter_context(patch.object(manual.termios, "tcsetattr"))
        self.stack.enter_context(patch.object(manual.termios, "tcgetattr",
                                              return_value=self.initial))
        self.stack.enter_context(patch.object(manual.transport, "_profile",
                                              return_value=contextlib.nullcontext(target())))
        self.stack.enter_context(patch.object(manual.transport, "_agent_identity",
                                              return_value=contextlib.nullcontext(None)))
        self.stack.enter_context(patch.object(manual.transport, "_environment",
                                              return_value={"HOME": "/Users/operator", "PATH": "/usr/bin:/bin"}))
        self.spawn = self.stack.enter_context(patch.object(manual.subprocess, "Popen"))
        self.child = None

    def run_fake(self, output=b"SanQ sudo password for ubuntu: ", error=b"", code=0):
        self.child = FakeSSH(output, error, code)
        self.spawn.return_value = self.child
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            status = manual.main(["status", PLAN])
        return status, out.getvalue(), err.getvalue()

    def tearDown(self):
        if self.child is not None:
            self.assertTrue(self.child.stdout.closed)
            self.assertTrue(self.child.stderr.closed)


class InteractiveTTYTests(ManualLocalFixture):
    def test_real_terminal_required_before_profile_or_ssh_access(self):
        with patch.object(manual.os, "isatty", return_value=False):
            status, out, err = self.run_fake()
        self.assertEqual(status, 1)
        self.assertEqual(out, "")
        self.assertIn("terminal", err)
        self.spawn.assert_not_called()
        self.tcset.assert_not_called()
        # Fake child was constructed but not spawned: close fixture descriptors.
        self.child.stdout.close()
        self.child.stderr.close()

    def test_ssh_inherits_terminal_input_without_any_python_password_path(self):
        status, output, errors = self.run_fake(
            output=b"SanQ sudo password for ubuntu: \r\nquery observed\r\n")
        self.assertEqual(status, 0)
        self.assertIn("SanQ sudo password for ubuntu:", output)
        self.assertIn("query observed", output)
        self.assertIn("SSH", errors)
        argv, kwargs = self.spawn.call_args.args[0], self.spawn.call_args.kwargs
        self.assertEqual(argv[:4], ["/usr/bin/ssh", "-F", "/dev/null", "-tt"])
        self.assertIsNone(kwargs["stdin"])
        self.assertEqual(kwargs["stdout"], subprocess.PIPE)
        self.assertEqual(kwargs["stderr"], subprocess.PIPE)
        self.assertIs(kwargs["start_new_session"], False)
        self.assertTrue(kwargs["close_fds"])
        self.assertNotIn("sudo", " ".join(kwargs["env"]))
        self.tcset.assert_called_once_with(0, termios.TCSANOW, self.initial)

    def test_remote_nonzero_is_not_success_and_no_automatic_retry(self):
        status, _, err = self.run_fake(b"authentication failed\n", code=1)
        self.assertEqual(status, 1)
        self.assertIn("勿自动重试", err)
        self.spawn.assert_called_once()
        self.tcset.assert_called_once()

    def test_unsafe_escape_from_remote_terminal_is_blocked_and_restores_tty(self):
        status, _, err = self.run_fake(b"bad\x1b[2J remote output")
        self.assertEqual(status, 1)
        self.assertIn("结果未知", err)
        self.tcset.assert_called_once()

    def test_invalid_utf8_remote_terminal_is_blocked(self):
        status, _, err = self.run_fake(b"not-valid\xff")
        self.assertEqual(status, 1)
        self.assertIn("结果未知", err)
        self.tcset.assert_called_once()

    def test_output_limit_is_fail_closed_and_restores_tty(self):
        with patch.object(manual, "MAX_OUTPUT", 4):
            status, _, err = self.run_fake(b"long output")
        self.assertEqual(status, 1)
        self.assertIn("结果未知", err)
        self.tcset.assert_called_once()

    def test_running_ssh_is_stopped_when_untrusted_terminal_output_is_rejected(self):
        status, _, err = self.run_fake(b"unexpected\x1b[2J", code=None)
        self.assertEqual(status, 1)
        self.assertIn("结果未知", err)
        self.assertEqual(self.child.term_calls, 1)
        self.tcset.assert_called_once()

    def test_stderr_budget_is_independent_and_fail_closed(self):
        with patch.object(manual, "MAX_ERROR", 3):
            status, _, err = self.run_fake(b"safe", error=b"too much")
        self.assertEqual(status, 1)
        self.assertIn("结果未知", err)
        self.tcset.assert_called_once()

    def test_still_running_ssh_deadline_terminates_only_the_local_child(self):
        self.child = FakeSSH(code=None)
        self.spawn.return_value = self.child
        op = manual._operation(["status", PLAN])
        with self.assertRaises(manual.transport.ClientError):
            manual._transport(target(), op, {}, None, time.monotonic() + 0.02)
        self.assertEqual(self.child.term_calls, 1)
        self.spawn.assert_called_once()

    def test_split_utf8_decoder_and_carriage_return_never_send_terminal_escapes(self):
        decoder = manual.codecs.getincrementaldecoder("utf-8")("strict")
        self.assertEqual(manual._safe_text(b"\xe4", decoder), "")
        self.assertEqual(manual._safe_text(b"\xb8\xad\r", decoder), "中\r\n")
        self.assertEqual(manual._safe_text(b"", decoder, final=True), "")
        with self.assertRaises(manual.transport.ClientError):
            manual._safe_text(b"\x07", manual.codecs.getincrementaldecoder("utf-8")("strict"))

    def test_expired_deadline_never_spawns_ssh(self):
        op = manual._operation(["status", PLAN])
        with self.assertRaises(manual.transport.ClientError):
            manual._transport(target(), op, {}, None, time.monotonic() - 1)
        self.spawn.assert_not_called()

    def test_local_identity_drift_denies_before_ssh_and_restores_tty(self):
        op = manual._operation(["status", PLAN])
        with self.assertRaises(manual.transport.ClientError):
            manual._execute(target(), op, self.initial, (-1, -1))
        self.spawn.assert_not_called()
        self.tcset.assert_called_once_with(0, termios.TCSANOW, self.initial)


class LauncherContractTests(unittest.TestCase):
    def test_manual_launcher_isolated_and_no_password_intermediary(self):
        base = Path(__file__).resolve().parents[1]
        shell = (base / "sanq-deploy-manual.sh").read_text()
        source = (base / "sanq_deploy_manual.py").read_text()
        self.assertIn("/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14", shell)
        self.assertIn("-I -S -B -X pycache_prefix=/dev/null", shell)
        self.assertIn('"$SCRIPT_DIR/sanq_deploy_manual.py" "$@"', shell)
        for forbidden in ("getpass", "sudo -S", "sshpass", "askpass(", "input(",
                          "stdin=subprocess.PIPE"):
            self.assertNotIn(forbidden, source)
        self.assertIn("stdin=None", source)
        self.assertIn("termios.tcsetattr", source)
