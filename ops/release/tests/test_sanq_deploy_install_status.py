"""Offline first-install Mac status observer tests; no real SSH or systemd."""
import contextlib
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sanq_install as observer


SOURCE = "a" * 40
RETENTION = "b" * 64


def operation():
    return observer._operation(["status", "--source-sha", SOURCE, "--retention-id", RETENTION])


def manager(*, loaded=False, source=SOURCE, retention=RETENTION):
    fields = {key: "" for key in observer.KEYS}
    fields.update({"LoadState": "loaded" if loaded else "not-found",
                   "ActiveState": "active" if loaded else "inactive",
                   "SubState": "running" if loaded else "dead",
                   "Result": "success" if loaded else "",
                   "ExecMainCode": "0", "ExecMainStatus": "0"})
    if loaded:
        fields.update({"Transient": "yes", "Type": "oneshot", "InvocationID": "1" * 32})
        for key, role in (("ExecStart", "run"), ("ExecStopPost", "cleanup")):
            fields[key] = ("{ path=/usr/bin/python3 ; argv[]="
                           + observer._task_argv(source, retention, role)
                           + " ; ignore_errors=no ; start_time=[n/a] ; }")
    return "".join(key + "=" + fields[key] + "\n" for key in observer.KEYS)


class OperationTests(unittest.TestCase):
    def test_query_uses_one_fixed_read_only_systemctl_command(self):
        command = operation()
        unit = "sanq-runtime-install-" + RETENTION + ".service"
        self.assertEqual(command["unit"], unit)
        self.assertEqual(command["timeout"], 60)
        self.assertEqual(command["remote"], "/usr/bin/systemctl --system show " + unit
                         + " --no-pager --property=" + ",".join(observer.KEYS))
        self.assertNotIn("installation-submit", command["remote"])
        self.assertNotIn("/bin/sh", command["remote"])
        self.assertNotIn("sudo", command["remote"])

    def test_rejects_submission_and_arbitrary_commands_flags_and_identities(self):
        invalid = [
            ["submit", "--source-sha", SOURCE, "--retention-id", RETENTION],
            ["run", "--source-sha", SOURCE, "--retention-id", RETENTION],
            ["status", "--source-sha", SOURCE, "--retention-id", RETENTION, "--host", "evil"],
            ["status", "--source-sha", SOURCE, "--retention-id", RETENTION, "--exec", "id"],
            ["status", "--source-sha", SOURCE, "--retention-id", RETENTION, "--port", "22"],
            ["status", "--source-sha", SOURCE, "--retention-id", RETENTION, "--retention-id", RETENTION],
            ["status", "--source-sha", SOURCE.upper(), "--retention-id", RETENTION],
            ["status", "--source-sha", SOURCE, "--retention-id", RETENTION.upper()],
            ["status", "--source-sha", SOURCE, "--retention-id", "../evil"],
            ["status", "--source-sha", SOURCE, "--retention-id", RETENTION, "--source-sh", SOURCE],
            ["status", "--source-sha", SOURCE, "--retention-id", RETENTION + ";id"],
        ]
        for args in invalid:
            with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    observer._operation(args)
                self.assertEqual(error.exception.code, 2)

    def test_separate_launcher_keeps_original_fixed_python_and_isolation(self):
        script = (Path(__file__).resolve().parents[1] / "sanq-install.sh").read_text()
        self.assertIn("/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14", script)
        self.assertIn("-I -S -B -X pycache_prefix=/dev/null", script)
        self.assertIn('"$SCRIPT_DIR/sanq_install.py" "$@"', script)
        self.assertNotIn("sanq_deploy.py", script)
        self.assertNotIn("sudo", script)


class ManagerTests(unittest.TestCase):
    def test_unloaded_is_unknown_not_proof_of_no_previous_installation(self):
        state = observer._observation(operation(), manager())
        self.assertEqual(state["outcome"], "MANAGER_UNIT_NOT_FOUND")
        self.assertFalse(state["managerIdentityMatched"])
        self.assertIsNone(state["invocationId"])
        for key in ("installationComplete", "canExecute", "readyToInstall", "restoreProven"):
            self.assertIs(state[key], False)

    def test_exact_bound_live_manager_is_only_observation_not_success(self):
        state = observer._observation(operation(), manager(loaded=True))
        self.assertEqual(state["outcome"], "MANAGER_UNIT_OBSERVED")
        self.assertTrue(state["managerIdentityMatched"])
        self.assertEqual(state["invocationId"], "1" * 32)
        self.assertEqual(state["requestedSourceSha"], SOURCE)
        for key in ("installationComplete", "canExecute", "readyToInstall", "restoreProven"):
            self.assertIs(state[key], False)

    def test_wrong_source_or_retention_and_manager_cmd_are_blocked(self):
        for response in (manager(loaded=True, source="c" * 40),
                         manager(loaded=True, retention="c" * 64),
                         manager(loaded=True).replace("installation-cleanup", "installation-submit"),
                         manager(loaded=True).replace("Transient=yes", "Transient=no"),
                         manager(loaded=True).replace("ignore_errors=no", "ignore_errors=yes")):
            with self.subTest(response=response[-120:]):
                with self.assertRaises(observer.transport.ClientError):
                    observer._observation(operation(), response)

    def test_ambiguous_or_malformed_manager_state_is_blocked(self):
        good = manager()
        cases = [
            good + "LoadState=loaded\n",
            good + "Unknown=x\n",
            good.replace("LoadState=not-found\n", ""),
            good.replace("LoadState=not-found", "LoadState=masked"),
            good.replace("InvocationID=\n", "InvocationID=stale\n"),
            good.replace("ExecStart=\n", "ExecStart=evil\n"),
            good + ("X" * observer.OUTPUT_LIMIT),
            good.replace("Result=\n", "Result=\x1b[31m\n"),
            good.replace("Result=\n", "Result=\u2603\n"),
            good.replace("Result=\n", "Result=success\r\n"),
        ]
        for response in cases:
            with self.subTest(length=len(response)), self.assertRaises(observer.transport.ClientError):
                observer._observation(operation(), response)


class TransportTests(unittest.TestCase):
    def run_client(self, response):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(observer.sys, "platform", "darwin"), \
             patch.object(observer.transport.os, "geteuid", return_value=501), \
             patch.object(observer.transport, "_profile", return_value=contextlib.nullcontext({})), \
             patch.object(observer.transport, "_execute", return_value=response) as send, \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = observer.main(["status", "--source-sha", SOURCE, "--retention-id", RETENTION])
        send.assert_called_once()
        self.assertEqual(send.call_args.args[1]["remote"], operation()["remote"])
        return result, stdout.getvalue(), stderr.getvalue()

    def test_one_read_only_ssh_lookup_emits_observation(self):
        status, out, err = self.run_client((0, manager(loaded=True), ""))
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(out)["outcome"], "MANAGER_UNIT_OBSERVED")
        self.assertEqual(err, "")

    def test_remote_error_preserves_nonzero_and_never_claims_success(self):
        status, out, err = self.run_client((255, "", "Permission denied (publickey).\n"))
        self.assertEqual(status, 255)
        self.assertEqual(out, "")
        self.assertIn("禁止自动重新提交", err)

    def test_malformed_success_response_fails_closed(self):
        status, out, err = self.run_client((0, "Result=success\n", ""))
        self.assertEqual(status, 1)
        self.assertEqual(out, "")
        self.assertIn("查询被阻断", err)


if __name__ == "__main__":
    unittest.main()
