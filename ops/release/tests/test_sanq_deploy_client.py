"""Mac SSH adapter: real local files and local pipe children, never a network connection."""
import base64
import contextlib
import io
import hashlib
import os
from pathlib import Path
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sanq_deploy as client


class OperationTests(unittest.TestCase):
    def operation(self, *args):
        with contextlib.redirect_stderr(io.StringIO()):
            return client._operation(list(args))

    def test_all_operations_map_only_to_existing_fixed_server_cli(self):
        sha, identity, approval = "a" * 40, "b" * 64, "c" * 64
        cases = [
            (("plan", "--target-sha", sha), "collect_deployment_plan.py prepare --target-sha " + sha + " --save"),
            (("plan-rollback",), "collect_deployment_plan.py prepare-rollback --save"),
            (("show-plan", identity), "collect_deployment_plan.py show " + identity),
            (("show-sql", identity), "collect_deployment_plan.py show-sql " + identity),
            (("apply", identity, "--confirm-release"), "release_task.py submit " + identity + " --confirm-release"),
            (("apply", identity, "--confirm-release", "--approve-sql", approval),
             "release_task.py submit " + identity + " --confirm-release --approve-sql " + approval),
            (("status", identity), "release_task.py status " + identity),
            (("logs", identity), "release_task.py logs " + identity),
            (("show-rollback", identity), "collect_deployment_plan.py show-rollback " + identity),
            (("show-rollback-sql", identity), "collect_deployment_plan.py show-rollback-sql " + identity),
            (("check-rollback", identity, "--approve-compatibility", approval),
             "release_task.py check-rollback " + identity + " --approve-compatibility " + approval),
            (("rollback", identity, "--confirm-rollback", "--approve-compatibility", approval),
             "release_task.py submit-rollback " + identity + " --confirm-rollback --approve-compatibility " + approval),
            (("status-rollback", identity), "release_task.py status-rollback " + identity),
        ]
        for arguments, expected in cases:
            with self.subTest(arguments=arguments):
                operation = self.operation(*arguments)
                self.assertEqual(operation["remote"], client.REMOTE_PREFIX + expected)

    def test_apply_and_rollback_require_distinct_explicit_confirmations(self):
        identity, approval = "b" * 64, "c" * 64
        for arguments in (("apply", identity), ("apply", identity, "--confirm-rollback"),
                          ("rollback", identity, "--confirm-rollback"),
                          ("rollback", identity, "--approve-compatibility", approval),
                          ("rollback", identity, "--confirm-release", "--approve-compatibility", approval)):
            with self.subTest(arguments=arguments), self.assertRaises(SystemExit) as error:
                self.operation(*arguments)
            self.assertEqual(error.exception.code, 2)

    def test_shell_fragments_urls_uppercase_and_wrong_lengths_cannot_enter_remote(self):
        for value in ("b" * 63, "B" * 64, "b" * 63 + ";", "$(id)", "../plan", "https://example.test"):
            with self.subTest(value=value), self.assertRaises(SystemExit):
                self.operation("status", value)
        with self.assertRaises(SystemExit):
            self.operation("plan", "--target-sha", "a" * 39)

    def test_no_host_path_port_raw_command_or_internal_cleanup_overrides(self):
        identity = "b" * 64
        for arguments in (("status", identity, "--host", "other.example"),
                          ("logs", identity, "--identity", "/tmp/key"),
                          ("status", identity, "--port", "2222"),
                          ("run", identity), ("cleanup", identity), ("install",), ("exec", "id")):
            with self.subTest(arguments=arguments), self.assertRaises(SystemExit):
                self.operation(*arguments)

    def test_sql_approval_is_exact_and_cannot_be_reused_as_rollback_approval(self):
        identity = "b" * 64
        for arguments in (("apply", identity, "--confirm-release", "--approve-sql", "C" * 64),
                          ("apply", identity, "--confirm-release", "--approve-compatibility", "c" * 64),
                          ("rollback", identity, "--confirm-rollback", "--approve-sql", "c" * 64)):
            with self.subTest(arguments=arguments), self.assertRaises(SystemExit):
                self.operation(*arguments)

    def test_abbreviated_or_duplicate_flags_are_rejected(self):
        identity, approval = "b" * 64, "c" * 64
        for arguments in (("apply", identity, "--confirm-rel"),
                          ("apply", identity, "--confirm-release", "--confirm-release"),
                          ("apply", identity, "--confirm-release", "--approve-sql", approval, "--approve-sql=" + approval)):
            with self.subTest(arguments=arguments), self.assertRaises(SystemExit):
                self.operation(*arguments)

    def test_ssh_options_pin_target_key_user_and_disable_ambient_config_and_forwarding(self):
        operation = self.operation("status", "b" * 64)
        directory = Path("/Users/operator name/.sanq-deploy")
        argv = client._ssh_argv({"directory": directory, "host": "runtime.example"}, operation)
        self.assertEqual(argv[:6], ["/usr/bin/ssh", "-F", "/dev/null", "-n", "-T", "-o"])
        for option in ("StrictHostKeyChecking=yes", "HostKeyAlias=sanq-runtime",
                       "HostKeyAlgorithms=ssh-ed25519", "IdentitiesOnly=yes",
                       "ForwardAgent=no", "ClearAllForwardings=yes", "ProxyCommand=none",
                       "ProxyJump=none", "ControlPath=none", "UpdateHostKeys=no", "PermitLocalCommand=no"):
            self.assertIn(option, argv)
        self.assertIn('UserKnownHostsFile="/Users/operator name/.sanq-deploy/known_hosts"', argv)
        self.assertEqual(argv[-9:], ["-i", str(directory / "identity"), "-p", "22", "-l", "ubuntu", "--", "runtime.example", operation["remote"]])
        self.assertEqual(argv[-1], operation["remote"])


class ProfileFixture:
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="sanq mac ")
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        self.home.chmod(0o700)
        self.root = self.home / ".sanq-deploy"
        self.root.mkdir(mode=0o700)
        self.key_blob = struct.pack("!I", 11) + b"ssh-ed25519" + struct.pack("!I", 32) + bytes(range(32))
        self.contents = {"target": b"runtime.example\n",
            "known_hosts": b"sanq-runtime ssh-ed25519 " + base64.b64encode(self.key_blob) + b"\n",
            "identity": b"PRIVATE_KEY_BYTES_MUST_NOT_BE_READ"}
        for name, content in self.contents.items():
            (self.root / name).write_bytes(content)
            (self.root / name).chmod(0o600)
        self.real_home = client._home
        home = patch.object(client, "_home", return_value=self.home)
        home.start()
        self.addCleanup(home.stop)


class ProfileTests(ProfileFixture, unittest.TestCase):
    def test_profile_is_fixed_and_fingerprint_matches_ssh_key_blob(self):
        with client._profile() as target:
            self.assertEqual(target["host"], "runtime.example")
            expected = base64.b64encode(hashlib.sha256(self.key_blob).digest()).decode("ascii").rstrip("=")
            self.assertEqual(target["fingerprint"], "SHA256:" + expected)
            self.assertEqual(target["directory"], self.root)
            self.assertNotIn("identity", target)
            target["check"]()

    def test_private_identity_is_opened_for_metadata_but_never_read(self):
        inode = (self.root / "identity").stat().st_ino
        read = client.os.read
        seen = []
        def observed(fd, amount):
            seen.append(os.fstat(fd).st_ino)
            return read(fd, amount)
        with patch.object(client.os, "read", side_effect=observed):
            with client._profile():
                pass
        self.assertEqual(len(seen), 2)
        self.assertNotIn(inode, seen)

    def test_profile_does_not_use_shell_home_environment(self):
        with patch.object(client, "_home", side_effect=self.real_home), \
             patch.object(client.pwd, "getpwuid", return_value=SimpleNamespace(pw_dir=str(self.home))), \
             patch.dict(os.environ, {"HOME": "/untrusted/environment/home"}):
            with client._profile() as target:
                self.assertEqual(target["directory"], self.root)

    def test_loose_directory_or_file_mode_is_rejected_without_repairs(self):
        self.root.chmod(0o755)
        with self.assertRaises(client.ClientError):
            with client._profile():
                pass
        self.assertEqual(self.root.stat().st_mode & 0o777, 0o755)
        self.root.chmod(0o700)
        (self.root / "identity").chmod(0o644)
        with self.assertRaises(client.ClientError):
            with client._profile():
                pass
        self.assertEqual((self.root / "identity").stat().st_mode & 0o777, 0o644)

    def test_unknown_files_symlinks_hardlinks_and_fifos_are_not_adopted(self):
        extra = self.root / "unexpected"
        extra.write_bytes(b"preserve")
        with self.assertRaises(client.ClientError):
            with client._profile():
                pass
        self.assertEqual(extra.read_bytes(), b"preserve")
        extra.unlink()
        identity = self.root / "identity"
        link = self.home / "identity.link"
        os.link(identity, link)
        with self.assertRaises(client.ClientError):
            with client._profile():
                pass
        link.unlink()
        known = self.root / "known_hosts"
        known.unlink()
        known.symlink_to(identity)
        with self.assertRaises((client.ClientError, OSError)):
            with client._profile():
                pass
        known.unlink()
        os.mkfifo(known, 0o600)
        with self.assertRaises(client.ClientError):
            with client._profile():
                pass

    def test_changed_target_or_same_bytes_new_inode_is_detected(self):
        with self.assertRaises(client.ClientError):
            with client._profile() as target:
                replacement = self.root / "replacement"
                replacement.write_bytes((self.root / "target").read_bytes())
                replacement.chmod(0o600)
                replacement.replace(self.root / "target")
                target["check"]()

    def test_invalid_host_and_non_single_key_material_are_rejected(self):
        for raw in (b"-oProxyCommand=bad\n", b"ubuntu@runtime.example\n", b"ssh://host\n",
                    b"host:22\n", b"runtime.example\nsecond\n", b"999.1.1.1\n", b"127.000.0.1\n"):
            with self.subTest(raw=raw), self.assertRaises(client.ClientError):
                client._host(raw)
        for raw in (self.contents["known_hosts"] * 2,
                    self.contents["known_hosts"].replace(b"sanq-runtime", b"*"),
                    b"sanq-runtime ssh-ed25519 AAAA\n", self.contents["known_hosts"] + b"# comment\n"):
            with self.subTest(raw=raw), self.assertRaises(client.ClientError):
                client._host_key(raw)

    def test_environment_filters_injection_and_only_allows_the_account_agent_socket(self):
        with patch.dict(os.environ, {"BASH_ENV": "/tmp/evil", "PYTHONPATH": "/tmp/evil",
            "DYLD_INSERT_LIBRARIES": "/tmp/evil", "SSH_ASKPASS": "/tmp/evil"}, clear=True):
            result = client._environment(self.home)
            self.assertEqual(set(result), {"PATH", "HOME", "LANG", "LC_ALL", "TERM", "SSH_ASKPASS_REQUIRE"})
        path = self.home / "agent"
        with socket.socket(socket.AF_UNIX) as agent:
            agent.bind(str(path))
            with patch.dict(os.environ, {"SSH_AUTH_SOCK": str(path)}, clear=True):
                self.assertEqual(client._environment(self.home)["SSH_AUTH_SOCK"], str(path))
        with patch.dict(os.environ, {"SSH_AUTH_SOCK": str(self.root / "identity")}, clear=True):
            with self.assertRaises(client.ClientError):
                client._environment(self.home)


class EncryptedIdentityTests(ProfileFixture, unittest.TestCase):
    """Encrypted envelope + agent tests use synthetic ciphertext and never contact a VM."""

    def setUp(self):
        super().setUp()
        def field(value):
            return struct.pack("!I", len(value)) + value
        inner = (b"openssh-key-v1\x00" + field(b"aes256-ctr") + field(b"bcrypt")
                 + field(b"synthetic-kdf") + struct.pack("!I", 1)
                 + field(self.key_blob) + field(b"synthetic-encrypted-private-bytes"))
        encoded = base64.b64encode(inner)
        text = (b"-----BEGIN OPENSSH PRIVATE KEY-----\n"
                + b"\n".join(encoded[i:i+70] for i in range(0, len(encoded), 70))
                + b"\n-----END OPENSSH PRIVATE KEY-----\n")
        (self.root / "identity").write_bytes(text)
        self.public_line = b"ssh-ed25519 " + base64.b64encode(self.key_blob) + b" test-agent\n"
        self.agent_path = self.home / "test-agent"

    @contextlib.contextmanager
    def agent(self, keys=None):
        with socket.socket(socket.AF_UNIX) as sock:
            sock.bind(str(self.agent_path))
            with patch.dict(os.environ, {"SSH_AUTH_SOCK": str(self.agent_path)}, clear=True), \
                 patch.object(client.subprocess, "run", return_value=SimpleNamespace(
                     returncode=0, stdout=self.public_line if keys is None else keys)) as listed:
                try:
                    yield listed
                finally:
                    self.agent_path.unlink()

    def test_matching_agent_pins_temporary_public_key_without_changing_profile(self):
        with self.agent() as listed, client._profile() as target:
            with client._agent_identity(target, client._environment(self.home)) as identity:
                self.assertNotEqual(identity, self.root / "identity")
                self.assertEqual(identity.read_bytes(), self.public_line.replace(b" test-agent", b""))
                self.assertEqual(identity.stat().st_mode & 0o777, 0o600)
                self.assertEqual(identity.parent.stat().st_mode & 0o777, 0o700)
                self.assertEqual(set(os.listdir(self.root)), client.PROFILE_FILES)
                argv = client._ssh_argv(target, client._operation(["status", "b" * 64]), identity)
                self.assertEqual(argv[-9:-7], ["-i", str(identity)])
                self.assertIn("IdentitiesOnly=yes", argv)
                self.assertIn("ForwardAgent=no", argv)
            self.assertFalse(identity.exists())
            self.assertFalse(identity.parent.exists())
            target["check"]()
        self.assertEqual(listed.call_args.args[0], ["/usr/bin/ssh-add", "-L"])
        self.assertNotIn("shell", listed.call_args.kwargs)
        self.assertEqual(listed.call_args.kwargs["stderr"], subprocess.DEVNULL)

    def test_mismatched_missing_or_duplicated_agent_key_refused_before_ssh(self):
        wrong = (b"ssh-ed25519 " + base64.b64encode(
            self.key_blob[:-1] + b"X") + b" wrong\n")
        for keys in (wrong, b"", self.public_line * 2, b"garbage\n"):
            with self.subTest(keys=keys), self.agent(keys), client._profile() as target:
                with self.assertRaises(client.ClientError):
                    with client._agent_identity(target, client._environment(self.home)):
                        self.fail("must never hand out a key")
        with patch.dict(os.environ, {}, clear=True), client._profile() as target:
            with self.assertRaisesRegex(client.ClientError, "requires a local SSH agent"):
                with client._agent_identity(target, client._environment(self.home)):
                    pass
        self.assertEqual(set(os.listdir(self.home)), {".sanq-deploy"})

    def test_bad_encrypted_envelopes_refuse_without_agent_fallback(self):
        valid = (self.root / "identity").read_bytes()
        for raw in (valid.replace(b"-----END", b"-----BAD", 1),
                    valid.replace(b"-----BEGIN OPENSSH PRIVATE KEY-----\n",
                                  b"-----BEGIN OPENSSH PRIVATE KEY-----\n%%%", 1),
                    b"-----BEGIN OPENSSH PRIVATE KEY-----\n%%%\n-----END OPENSSH PRIVATE KEY-----\n"):
            with self.subTest(raw=raw[:45]):
                (self.root / "identity").write_bytes(raw)
                with client._profile() as target:
                    with self.assertRaises(client.ClientError):
                        with client._agent_identity(target, {}):
                            self.fail("invalid keys cannot fall back")
        (self.root / "identity").write_bytes(valid)

    def test_encrypted_agent_missing_failure_or_timeout_never_creates_pub_file(self):
        with self.agent(), client._profile() as target, \
             patch.object(client.subprocess, "run", return_value=SimpleNamespace(
                 returncode=1, stdout=b"")):
            with self.assertRaises(client.ClientError):
                with client._agent_identity(target, client._environment(self.home)):
                    pass
        with self.agent(), client._profile() as target, \
             patch.object(client.subprocess, "run", side_effect=subprocess.TimeoutExpired("ssh-add", 10)):
            with self.assertRaises(subprocess.TimeoutExpired):
                with client._agent_identity(target, client._environment(self.home)):
                    pass
        self.assertEqual(set(os.listdir(self.home)), {".sanq-deploy"})

    def test_legacy_unencrypted_identity_does_not_require_agent(self):
        (self.root / "identity").write_bytes(b"UNENCRYPTED_OR_LEGACY_SSH_PRIVATE_KEY")
        with patch.dict(os.environ, {}, clear=True), client._profile() as target:
            with client._agent_identity(target, client._environment(self.home)) as identity:
                self.assertIsNone(identity)
                self.assertEqual(client._ssh_argv(target, client._operation(["status", "b" * 64]))[-8],
                                 str(self.root / "identity"))

    def test_execute_uses_agent_pinned_identity_for_one_local_ssh_child(self):
        observed = []
        original = subprocess.Popen

        def local_ssh(argv, **kwargs):
            self.assertEqual(argv[0], "/usr/bin/ssh")
            public_path = Path(argv[argv.index("-i") + 1])
            self.assertEqual(public_path.read_bytes(),
                             self.public_line.replace(b" test-agent", b""))
            self.assertEqual(kwargs["env"]["SSH_AUTH_SOCK"], str(self.agent_path))
            self.assertIn("BatchMode=yes", argv)
            observed.append(public_path)
            return original([sys.executable, "-c", "print('LOCAL_ONLY')"], **kwargs)

        with self.agent(), patch.object(client.subprocess, "Popen", side_effect=local_ssh), \
             client._profile() as target:
            result = client._execute(target, client._operation(["status", "b" * 64]))
        self.assertEqual(result, (0, "LOCAL_ONLY\n", ""))
        self.assertEqual(len(observed), 1)
        self.assertFalse(observed[0].exists())
        self.assertFalse(observed[0].parent.exists())

    def test_temp_public_key_removed_when_local_ssh_launch_fails(self):
        paths = []

        def refused(argv, **kwargs):
            candidate = Path(argv[argv.index("-i") + 1])
            self.assertTrue(candidate.is_file())
            paths.append(candidate)
            raise OSError("synthetic SSH launch failure")

        with self.agent(), patch.object(client.subprocess, "Popen", side_effect=refused), \
             client._profile() as target:
            with self.assertRaises(OSError):
                client._execute(target, client._operation(["status", "b" * 64]))
        self.assertEqual(len(paths), 1)
        self.assertFalse(paths[0].exists())
        self.assertFalse(paths[0].parent.exists())

    def test_profile_only_never_reads_private_key_even_when_encrypted(self):
        with patch.object(client.os, "pread", side_effect=AssertionError("private read")):
            with client._profile() as target:
                self.assertNotIn("identity", target)


class TransportTests(ProfileFixture, unittest.TestCase):
    @contextlib.contextmanager
    def local_child(self, code):
        popen = client.subprocess.Popen
        self.calls = []
        processes = []
        def child(argv, **kwargs):
            self.assertEqual(argv[0], "/usr/bin/ssh")
            self.calls.append((argv, kwargs))
            process = popen(["/usr/bin/python3", "-E", "-S", "-B", "-c", code], **kwargs)
            processes.append(process)
            return process
        with patch.object(client.subprocess, "Popen", side_effect=child), patch.dict(os.environ, {}, clear=True):
            yield processes

    def operation(self):
        return client._operation(["status", "b" * 64])

    def test_fixed_ssh_argv_minimal_environment_and_full_utf8_pipe_capture(self):
        code = 'import os; os.write(1,"你好\\n".encode()); os.write(2,b"note\\n")'
        with self.local_child(code), client._profile() as target:
            result = client._execute(target, self.operation())
        self.assertEqual(result, (0, "你好\n", "note\n"))
        self.assertEqual(len(self.calls), 1)
        arguments, kwargs = self.calls[0]
        self.assertEqual(arguments[-2], "runtime.example")
        self.assertIs(kwargs["stdin"], subprocess.DEVNULL)
        self.assertTrue(kwargs["close_fds"])
        self.assertTrue(kwargs["start_new_session"])
        self.assertNotIn("shell", kwargs)
        self.assertEqual(set(kwargs["env"]), {"PATH", "HOME", "LANG", "LC_ALL", "TERM", "SSH_ASKPASS_REQUIRE"})

    def test_nonzero_ssh_exit_is_not_retried_or_reclassified_as_completion(self):
        with self.local_child("import sys;sys.exit(255)"), client._profile() as target:
            result = client._execute(target, self.operation())
        self.assertEqual(result, (255, "", ""))
        self.assertEqual(len(self.calls), 1)

    def test_stdout_and_stderr_budgets_stop_only_the_local_process(self):
        for stream, limit in ((1, "MAX_OUTPUT"), (2, "MAX_ERROR")):
            with self.subTest(stream=stream), self.local_child("import os;os.write(" + str(stream) + ',b"x"*17)') as processes, \
                 client._profile() as target, patch.object(client, limit, 16):
                with self.assertRaises(client.ClientError):
                    client._execute(target, self.operation())
            self.assertEqual(len(self.calls), 1)
            self.assertIsNotNone(processes[0].poll())

    def test_timeout_reaps_local_client_without_remote_cancel_or_retry(self):
        operation = self.operation()
        operation["timeout"] = 0.05
        with self.local_child("import time;time.sleep(10)") as processes, client._profile() as target:
            with self.assertRaises(client.ClientError):
                client._execute(target, operation)
        self.assertIsNotNone(processes[0].poll())
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn("stop", self.calls[0][0][-1])

    def test_terminal_controls_or_invalid_utf8_are_not_emitted(self):
        for code in ('import os;os.write(1,b"\\x1b[2J")', 'import os;os.write(2,b"\\xff")'):
            with self.subTest(code=code), self.local_child(code), client._profile() as target:
                with self.assertRaises((client.ClientError, UnicodeError)):
                    client._execute(target, self.operation())

    def test_profile_drift_after_response_blocks_success_without_cleanup(self):
        code = ("from pathlib import Path;p=Path('.sanq-deploy/target');q=p.with_name('replacement');"
                "q.write_bytes(p.read_bytes());q.chmod(0o600);q.replace(p);print('response')")
        with self.local_child(code), self.assertRaises(client.ClientError):
            with client._profile() as target:
                client._execute(target, self.operation())
        self.assertEqual(len(self.calls), 1)
        self.assertEqual((self.root / "target").read_bytes(), self.contents["target"])


class MainTests(ProfileFixture, unittest.TestCase):
    def run_main(self, arguments, execute=None):
        output, error = io.StringIO(), io.StringIO()
        with patch.object(client.sys, "platform", "darwin"), patch.object(client.os, "geteuid", return_value=1001), \
             contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            if execute is None:
                result = client.main(arguments)
            else:
                with patch.object(client, "_execute", side_effect=execute):
                    result = client.main(arguments)
        return result, output.getvalue(), error.getvalue()

    def test_profile_is_local_and_never_starts_ssh(self):
        with patch.object(client, "_execute", side_effect=AssertionError("network")):
            code, output, error = self.run_main(["profile"])
        self.assertEqual(code, 0)
        self.assertIn("Host: runtime.example\nHost key: SHA256:", output)
        self.assertNotIn("PRIVATE_KEY", output + error)

    def test_transport_success_only_forwards_queued_response_without_claiming_active(self):
        queued = '{"outcome":"TASK_QUEUED"}\n'
        before = {number: signal.getsignal(number) for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
        def execute(target, operation):
            self.assertIn("release_task.py submit ", operation["remote"])
            return 0, queued, ""
        code, output, error = self.run_main(["apply", "b" * 64, "--confirm-release"], execute)
        self.assertEqual((code, output, error), (0, queued, ""))
        self.assertEqual(before, {number: signal.getsignal(number) for number in before})

    def test_lost_connection_or_signal_keeps_same_plan_query_guidance(self):
        code, output, error = self.run_main(["status", "b" * 64], lambda *args: (255, "", "connection lost\n"))
        self.assertEqual(code, 255)
        self.assertEqual(output, "")
        self.assertIn("不自动重提", error)
        def interrupted(*args):
            raise client.ClientInterrupted(signal.SIGINT)
        code, output, error = self.run_main(["status", "b" * 64], interrupted)
        self.assertEqual(code, 130)
        self.assertEqual(output, "")
        self.assertIn("原 plan-id", error)
        code, output, error = self.run_main(["plan", "--target-sha", "a" * 40], lambda *args: (255, "", ""))
        self.assertEqual(code, 255)
        self.assertEqual(output, "")
        self.assertIn("在VM只读核查留存计划", error)

    def test_non_mac_or_root_refuses_before_loading_profile(self):
        with patch.object(client, "_profile", side_effect=AssertionError("profile IO")), \
             contextlib.redirect_stderr(io.StringIO()):
            with patch.object(client.sys, "platform", "linux"):
                self.assertEqual(client.main(["profile"]), 1)
            with patch.object(client.sys, "platform", "darwin"), patch.object(client.os, "geteuid", return_value=0):
                self.assertEqual(client.main(["profile"]), 1)

    def test_shell_launcher_locates_adjacent_client_with_spaces_and_hostile_search_path(self):
        import shutil
        import shlex
        bundle = self.home / "client bundle with spaces"
        bundle.mkdir()
        source = Path(client.__file__).parent
        for name in ("sanq-deploy.sh", "sanq_deploy.py"):
            shutil.copyfile(source / name, bundle / name)
        fixed_python = "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14"
        launcher = (source / "sanq-deploy.sh").read_text(encoding="utf-8")
        self.assertEqual(launcher.count(fixed_python), 1)
        self.assertNotIn("exec /usr/bin/python3 ", launcher)
        # Only the disposable test copy uses the running CI interpreter; the delivered launcher is fixed.
        (bundle / "sanq-deploy.sh").write_text(launcher.replace(fixed_python, shlex.quote(sys.executable)), encoding="utf-8")
        for name in ("pathlib.py", "json.py"):
            (bundle / name).write_text('raise RuntimeError("local module shadow must not execute")\n', encoding="utf-8")
        completed = subprocess.run(["/bin/sh", str(bundle / "sanq-deploy.sh"), "--help"],
            cwd=self.home, env={"PATH": "/untrusted/missing", "PYTHONPATH": "/untrusted/missing",
                               "HOME": str(self.home)}, capture_output=True, text=True, timeout=10)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("apply", completed.stdout)
        self.assertIn("profile", completed.stdout)

    def test_missing_fixed_python_does_not_fall_back_to_path_or_system_python(self):
        import shlex
        source = Path(client.__file__).parent / "sanq-deploy.sh"
        text = source.read_text(encoding="utf-8")
        fixed_python = "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14"
        self.assertEqual(text.count(fixed_python), 1)
        missing = self.home / "missing framework python"
        script = self.home / "fixed-launcher.sh"
        script.write_text(text.replace(fixed_python, shlex.quote(str(missing))), encoding="utf-8")
        commands = self.home / "hostile-bin"
        commands.mkdir()
        marker = self.home / "fallback-was-used"
        fallback = commands / "python3"
        fallback.write_text("#!/bin/sh" + chr(10) + "/usr/bin/touch " + shlex.quote(str(marker)) + chr(10), encoding="utf-8")
        fallback.chmod(0o700)
        subprocess.run([str(fallback)], cwd=self.home, check=True, timeout=10)
        self.assertTrue(marker.exists())
        marker.unlink()
        completed = subprocess.run(["/bin/sh", str(script), "--help"], cwd=self.home,
            env={"PATH": str(commands), "PYTHON": str(fallback), "PYTHON3": str(fallback)},
            capture_output=True, text=True, timeout=10)
        self.assertNotEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout, "")
        self.assertFalse(marker.exists())
