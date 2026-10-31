"""Local Mac preflight: real directory FDs/pipes and local SSH -G, never a connection."""
import contextlib
import io
import json
import os
import shutil
import signal
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_sanq_deploy_client as base
client = base.client


class LocalPreflightTests(base.ProfileFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(client.sys, "platform", "darwin"))
        self.stack.enter_context(patch.object(client.sys, "version_info", (3, 8, 2)))
        self.stack.enter_context(patch.object(client.sys, "executable", "/usr/bin/python3"))
        # Preserve interpreter flags used by argparse/importlib and other stdlib internals.
        self.real_flags = {name: getattr(client.sys.flags, name) for name in dir(client.sys.flags)
                           if not name.startswith("_") and not callable(getattr(client.sys.flags, name))}
        self.stack.enter_context(patch.object(client.sys, "flags",
            SimpleNamespace(**dict(self.real_flags, isolated=1, no_site=1, dont_write_bytecode=1))))
        self.stack.enter_context(patch.object(client.sys, "pycache_prefix", "/dev/null"))
        self.stack.enter_context(patch.object(client.os, "geteuid", return_value=1001))
        self.real_run = subprocess.run
        self.ssh = self.stack.enter_context(patch.object(client.subprocess, "run",
            return_value=SimpleNamespace(returncode=0)))
        self.stack.enter_context(patch.object(client, "_profile", side_effect=AssertionError("profile/key access")))
        self.stack.enter_context(patch.object(client, "_execute", side_effect=AssertionError("remote operation")))

    def invoke(self):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            status = client.main(["local-check"])
        return status, out.getvalue(), err.getvalue()

    def test_python38_emits_local_observations_but_nonzero_and_no_execution_permission(self):
        opened, original = [], client.os.open
        def record(*args, **kwargs):
            fd = original(*args, **kwargs)
            opened.append((args[0], fd))
            return fd
        with patch.object(client.os, "open", side_effect=record), \
             patch.dict(os.environ, {"HOME": "/untrusted", "SSH_AUTH_SOCK": "/untrusted-agent",
                 "GITHUB_TOKEN": "fixture-secret", "PYTHONPATH": "/untrusted"}, clear=True):
            status, out, err = self.invoke()
        self.assertEqual((status, err), (1, ""))
        value = json.loads(out)
        self.assertEqual(value["pythonVersion"], "3.8.2")
        self.assertEqual(value["pythonExecutable"], "/usr/bin/python3")
        self.assertEqual(value["configuredLauncherPython"], "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14")
        self.assertEqual(value["outcome"], "LOCAL_PREFLIGHT_OBSERVED")
        self.assertIs(value["releaseClientVersionSupported"], False)
        for key in ("directoryFdObserved", "nonblockingPipeObserved", "sshOptionsParsed"):
            self.assertIs(value[key], True)
        for key in ("sshConnectionTested", "remoteOperationPerformed", "readyToInstall", "canExecute"):
            self.assertIs(value[key], False)
        self.assertEqual([str(path) for path, fd in opened], [str(self.home), "."])
        for path, fd in opened:
            with self.assertRaises(OSError):
                os.fstat(fd)
        self.assertNotIn(str(self.home), out)
        self.assertNotIn("PRIVATE_KEY", out + err)
        args, options = self.ssh.call_args.args[0], self.ssh.call_args.kwargs
        self.assertEqual(args[:7], ["/usr/bin/ssh", "-G", "-F", "/dev/null", "-n", "-T", "-o"])
        self.assertEqual(args[-1], "127.0.0.1")
        self.assertEqual(args.count("-G"), 1)
        self.assertNotIn("", args)
        self.assertNotIn("release_task.py", " ".join(args))
        for stream in ("stdin", "stdout", "stderr"):
            self.assertEqual(options[stream], subprocess.DEVNULL)
        self.assertEqual(options["timeout"], 10)
        self.assertTrue(options["close_fds"])
        self.assertTrue(options["start_new_session"])
        self.assertNotIn("SSH_AUTH_SOCK", options["env"])
        self.assertNotIn("GITHUB_TOKEN", options["env"])
        self.ssh.assert_called_once()

    def test_python39_local_result_is_still_not_profile_or_remote_readiness(self):
        with patch.object(client.sys, "version_info", (3, 9, 0)):
            status, out, err = self.invoke()
        self.assertEqual((status, err), (0, ""))
        value = json.loads(out)
        self.assertIs(value["releaseClientVersionSupported"], True)
        self.assertIs(value["readyToInstall"], False)
        self.assertIs(value["canExecute"], False)

    def test_non_mac_root_or_python_below38_refuses_before_local_file_io(self):
        for target, name, value in ((client.sys, "platform", "linux"),
                                    (client.sys, "version_info", (3, 7, 9))):
            with self.subTest(name=name), patch.object(target, name, value), \
                 patch.object(client, "_home", side_effect=AssertionError("home IO")):
                status, out, err = self.invoke()
            self.assertEqual((status, out), (1, ""))
        with patch.object(client.os, "geteuid", return_value=0), \
             patch.object(client, "_home", side_effect=AssertionError("home IO")):
            self.assertEqual(self.invoke()[:2], (1, ""))
        self.ssh.assert_not_called()

    def test_wrong_launcher_flags_or_pycache_refuses_before_home_io(self):
        cases = [(client.sys, "pycache_prefix", None)]
        for flag in ("isolated", "no_site", "dont_write_bytecode"):
            values = dict(self.real_flags, isolated=1, no_site=1, dont_write_bytecode=1)
            values[flag] = 0
            cases.append((client.sys, "flags", SimpleNamespace(**values)))
        for target, name, value in cases:
            with self.subTest(name=name, value=value), patch.object(target, name, value), \
                 patch.object(client, "_home", side_effect=AssertionError("home IO")):
                self.assertEqual(self.invoke()[:2], (1, ""))
        self.ssh.assert_not_called()

    def test_local_ssh_nonzero_timeout_and_unknown_do_not_emit_partial_success(self):
        for result in (1, -15, True, None):
            self.ssh.return_value = SimpleNamespace(returncode=result)
            with self.subTest(result=result):
                status, out, err = self.invoke()
                self.assertEqual((status, out), (1, ""))
                self.assertIn("请求被阻断", err)
        for failure in (subprocess.TimeoutExpired("fixed-local-ssh", 10), OSError("local query unknown")):
            self.ssh.side_effect = failure
            with self.subTest(error=type(failure).__name__):
                self.assertEqual(self.invoke()[:2], (1, ""))

    def test_unavailable_descriptor_api_refuses_before_local_ssh_and_closes_pipes(self):
        observed, pipe = [], client.os.pipe
        def opened():
            pair = pipe()
            observed.extend(pair)
            return pair
        with patch.object(client.os, "pipe", side_effect=opened), \
             patch.object(client.os, "set_blocking", side_effect=NotImplementedError("missing local API")):
            status, out, err = self.invoke()
        self.assertEqual((status, out), (1, ""))
        self.ssh.assert_not_called()
        for fd in observed:
            with self.assertRaises(OSError):
                os.fstat(fd)

    def test_real_home_replacement_after_ssh_query_blocks_result(self):
        moved = self.home.with_name(self.home.name + ".moved")
        self.addCleanup(lambda: shutil.rmtree(moved) if moved.exists() else None)
        def replaced(*args, **kwargs):
            self.home.rename(moved)
            self.home.mkdir(mode=0o700)
            return SimpleNamespace(returncode=0)
        self.ssh.side_effect = replaced
        status, out, err = self.invoke()
        self.assertEqual((status, out), (1, ""))
        self.assertIn("local home identity changed", err)
        self.ssh.assert_called_once()

    def test_python38_cannot_use_existing_profile_or_publication_entry(self):
        for args in (["profile"], ["apply", "b" * 64, "--confirm-release"], ["status", "b" * 64]):
            with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(client.main(args), 1)
        self.ssh.assert_not_called()

    def test_local_check_has_no_host_key_path_fd_or_command_override(self):
        self.assertEqual(client.sys.flags.ignore_environment, self.real_flags["ignore_environment"])
        self.assertEqual(client.sys.flags.verbose, self.real_flags["verbose"])
        operation = client._operation(["local-check"])
        self.assertIsNone(operation["remote"])
        for flag in ("--host", "--identity", "--input-fd", "--command", "--target-sha"):
            with self.subTest(flag=flag), contextlib.redirect_stderr(io.StringIO()), \
                 self.assertRaises(SystemExit):
                client._operation(["local-check", flag, "unreviewed"])

    def test_real_local_ssh_configuration_query_exits_without_remote_command(self):
        self.ssh.side_effect = self.real_run
        status, out, err = self.invoke()
        self.assertEqual((status, err), (1, ""))
        self.assertIs(json.loads(out)["sshOptionsParsed"], True)
        self.ssh.assert_called_once()
        self.assertEqual(self.ssh.call_args.args[0][-1], "127.0.0.1")

    def test_local_interrupt_restores_signal_handlers_and_does_not_report_a_connection(self):
        old = {number: signal.getsignal(number) for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
        self.ssh.side_effect = client.ClientInterrupted(signal.SIGINT)
        status, out, err = self.invoke()
        self.assertEqual((status, out), (130, ""))
        self.assertIn("尚未发起SSH", err)
        self.assertEqual(old, {number: signal.getsignal(number) for number in old})


if __name__ == "__main__":
    unittest.main()
