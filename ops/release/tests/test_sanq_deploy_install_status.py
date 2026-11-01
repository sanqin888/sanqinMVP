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



class TargetMaterialTests(unittest.TestCase):
    """Operator-owned AWS observation is only structural input, never provenance."""

    def setUp(self):
        import tempfile
        self.temp = tempfile.TemporaryDirectory(prefix="sanq target peer ")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.home.chmod(0o700)
        self.target = {"home": self.home, "host": "52.60.180.44",
                       "fingerprint": "SHA256:" + "A" * 43, "check": lambda: None}
        instance_arn = ("arn:aws:lightsail:ca-central-1:123456789012:Instance/"
                        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        self.value = {"schemaVersion": 1, "kind": "sanq-minimal-pre-snapshot-target",
                      "accountId": "123456789012", "region": "ca-central-1",
                      "instanceArn": instance_arn, "instanceName": "sanq-prod",
                      "sshTarget": self.target["host"],
                      "sshHostKeySha256": self.target["fingerprint"],
                      "linuxSystemDisk": "/dev/sda", "operatorConfirmed": True,
                      "instance": {"arn": instance_arn, "name": "sanq-prod",
                                   "resourceType": "Instance",
                                   "location": {"regionName": "ca-central-1",
                                                "availabilityZone": "ca-central-1a"},
                                   "hardware": {"disks": [{"isSystemDisk": True, "isAttached": True,
                                                          "sizeInGb": 60, "path": "/dev/xvda",
                                                          "attachedTo": "sanq-prod"}]}}}

    def encode(self, value=None):
        return (json.dumps(self.value if value is None else value,
                sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")

    def save(self, raw=None):
        path = self.home / observer.TARGET_FILE
        path.write_bytes(self.encode() if raw is None else raw)
        path.chmod(0o600)
        return path

    def test_cli_is_local_only_and_exactly_bound_to_selected_source_and_retention(self):
        op = observer._operation(["check-target", "--source-sha", SOURCE, "--retention-id", RETENTION])
        self.assertEqual(op["command"], "target-check")
        self.assertIsNone(op["remote"])
        self.assertEqual((op["sourceSha"], op["retentionId"]), (SOURCE, RETENTION))
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            observer._operation(["check-target", "--source-sha", SOURCE,
                                 "--retention-id", RETENTION, "--host", "attacker.test"])

    def test_canonical_target_file_matches_pinned_host_and_returns_non_authority(self):
        raw = self.encode()
        self.save(raw)
        state = observer._target_value(observer._target_bytes(self.target), self.target)
        import hashlib
        self.assertEqual(state["targetInputSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(state["outcome"], "TARGET_STRUCTURE_MATCHED_FIXED_PROFILE")
        self.assertTrue(state["fixedHostKeyMatched"])
        for key in ("awsOriginAuthenticated", "operatorEvidenceIndependentlyVerified",
                    "readyToInstall", "installationComplete", "canExecute", "restoreProven"):
            self.assertIs(state[key], False)
        self.assertNotIn("accountId", state)
        self.assertNotIn("instanceArn", state)

    def test_wrong_profile_or_operator_fields_fail_closed(self):
        import copy
        for change in ("host", "host-key", "operator-confirmation", "account-id",
                       "disk-count", "disk-size", "disk-attached", "instance-arn",
                       "availability-zone", "bool-schema", "float-disk"):
            value = copy.deepcopy(self.value)
            if change == "host": value["sshTarget"] = "other.example"
            elif change == "host-key": value["sshHostKeySha256"] = "SHA256:" + "B" * 43
            elif change == "operator-confirmation": value["operatorConfirmed"] = False
            elif change == "account-id": value["accountId"] = "123"
            elif change == "disk-count": value["instance"]["hardware"]["disks"].append(
                value["instance"]["hardware"]["disks"][0].copy())
            elif change == "disk-size": value["instance"]["hardware"]["disks"][0]["sizeInGb"] = 0
            elif change == "disk-attached": value["instance"]["hardware"]["disks"][0]["isAttached"] = False
            elif change == "instance-arn": value["instanceArn"] = value["instanceArn"][:-1] + "b"
            elif change == "availability-zone": value["instance"]["location"]["availabilityZone"] = "us-east-1a"
            elif change == "bool-schema": value["schemaVersion"] = True
            else: value["instance"]["hardware"]["disks"][0]["sizeInGb"] = 60.0
            with self.subTest(change=change), self.assertRaises(observer.transport.ClientError):
                observer._target_value(self.encode(value), self.target)

    def test_noncanonical_and_duplicate_json_are_blocked(self):
        raw = self.encode()
        cases = [raw[:-1], raw.replace(b'"schemaVersion":1', b'"schemaVersion":1 '),
                 raw[:-2] + b',}\n', raw.replace(b'"accountId":', b'"accountId":"123456789012","accountId":'),
                 raw.replace(b'"operatorConfirmed":true', b'"operatorConfirmed":NaN'),
                 b"x" * (observer.TARGET_LIMIT + 1)]
        for data in cases:
            with self.subTest(raw=data[:30]), self.assertRaises(observer.transport.ClientError):
                observer._target_value(data, self.target)

    def test_file_absent_symlink_or_unsafe_mode_is_blocked(self):
        with self.assertRaises((OSError, observer.transport.ClientError)):
            observer._target_bytes(self.target)
        path = self.save()
        path.chmod(0o644)
        with self.assertRaises(observer.transport.ClientError):
            observer._target_bytes(self.target)
        path.chmod(0o600)
        other = self.home / "other.json"
        path.rename(other)
        path.symlink_to(other)
        with self.assertRaises((OSError, observer.transport.ClientError)):
            observer._target_bytes(self.target)
        path.unlink()
        import os
        os.link(other, path)
        with self.assertRaises(observer.transport.ClientError):
            observer._target_bytes(self.target)

    def test_late_same_bytes_file_replacement_is_blocked(self):
        path = self.save()
        read = observer.os.pread
        def replaced(fd, size, offset):
            raw = read(fd, size, offset)
            path.rename(self.home / "original.json")
            path.write_bytes(raw)
            path.chmod(0o600)
            return raw
        with patch.object(observer.os, "pread", side_effect=replaced):
            with self.assertRaises(observer.transport.ClientError):
                observer._target_bytes(self.target)

    def test_local_cli_does_not_ssh_or_submit(self):
        self.save()
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(observer.sys, "platform", "darwin"), \
             patch.object(observer.transport.os, "geteuid", return_value=501), \
             patch.object(observer.transport, "_profile",
                          return_value=contextlib.nullcontext(self.target)), \
             patch.object(observer.transport, "_execute", side_effect=AssertionError("must not SSH")), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = observer.main(["check-target", "--source-sha", SOURCE, "--retention-id", RETENTION])
        self.assertEqual(result, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertIs(json.loads(stdout.getvalue())["readyToInstall"], False)
        self.assertEqual(json.loads(stdout.getvalue())["requestedSourceSha"], SOURCE)
        self.assertEqual(json.loads(stdout.getvalue())["requestedRetentionId"], RETENTION)

    def test_invalid_local_target_never_emits_success_or_contacts_ssh(self):
        self.save(b"{}\n")
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(observer.sys, "platform", "darwin"), \
             patch.object(observer.transport.os, "geteuid", return_value=501), \
             patch.object(observer.transport, "_profile",
                          return_value=contextlib.nullcontext(self.target)), \
             patch.object(observer.transport, "_execute", side_effect=AssertionError("must not SSH")), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = observer.main(["check-target", "--source-sha", SOURCE, "--retention-id", RETENTION])
        self.assertEqual(result, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("查询被阻断", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
