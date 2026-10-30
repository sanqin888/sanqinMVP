"""First-install manager identity contract only; no actual unit, Docker or root execution."""
import contextlib
import io
import os
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
from release_contract import ReleaseContractError

SHA, RETENTION, INVOCATION = "b" * 40, "c" * 64, "d" * 32


class InstallationTaskContextTests(unittest.TestCase):
    def setUp(self):
        self.unit = installer.INSTALL_TASK_PREFIX + RETENTION + ".service"
        self.root = Path("/opt/sanq/install-bootstrap") / SHA
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.origin = self.stack.enter_context(patch.object(installer, "_bootstrap_invocation", return_value=SHA))
        self.stack.enter_context(patch.object(installer.os, "getpid", return_value=4321))
        self.stack.enter_context(patch.object(installer.Path, "cwd", return_value=self.root))
        self.stack.enter_context(patch.dict(os.environ, {"INVOCATION_ID": INVOCATION}))
        self.role = "run"
        self.props = {key: "" for key in installer.INSTALL_TASK_KEYS}
        self.props.update(LoadState="loaded", Transient="yes", Type="oneshot", Restart="no",
            RemainAfterExit="no", KillMode="control-group", NeedDaemonReload="no",
            TimeoutStartUSec="2h", TimeoutStopUSec="15min", TimeoutStartFailureMode="terminate",
            TimeoutStopFailureMode="terminate", SendSIGKILL="yes", CollectMode="inactive", Delegate="no",
            ActiveState="activating", SubState="start", MainPID="4321", ControlPID="0",
            ControlGroup="/system.slice/" + self.unit, InvocationID=INVOCATION,
            FragmentPath="/run/systemd/transient/" + self.unit, WorkingDirectory=str(self.root),
            User="root", Group="root", Result="success", ExecMainCode="0", ExecMainStatus="0",
            ExecStart=self.exec_value("run"), ExecStopPost=self.exec_value("cleanup"))
        self.command = self.stack.enter_context(patch.object(installer, "_bounded_host_client",
            side_effect=lambda args, **kwargs: self.output()))
        self.process = self.stack.enter_context(patch.object(installer, "_installation_task_process_file",
            side_effect=lambda name: (("0::/system.slice/" + self.unit + "\n").encode()
                if name == "cgroup" else b"\0".join(v.encode() for v in
                    installer._installation_task_argv(SHA, RETENTION, self.role)) + b"\0")))

    def exec_value(self, role):
        return ("{ path=/usr/bin/python3 ; argv[]=" + " ".join(
            installer._installation_task_argv(SHA, RETENTION, role))
            + " ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=4321 ; code=(null) ; status=0/0 }")

    def output(self):
        return "\n".join(key + "=" + value for key, value in self.props.items()) + "\n"

    def stop_post(self):
        self.role = "cleanup"
        self.props.update(ActiveState="deactivating", SubState="stop-post", MainPID="0", ControlPID="4321",
                          Result="success", ExecMainCode=str(os.CLD_EXITED), ExecMainStatus="0")
        self.stack.enter_context(patch.dict(os.environ,
            {"SERVICE_RESULT": "success", "EXIT_CODE": "exited", "EXIT_STATUS": "0"}))

    def context(self, role=None):
        return installer._installation_task_context(SHA, RETENTION, role or self.role,
                                                    deadline=time.monotonic() + 20)

    def test_main_and_stop_post_identity_return_only_observations(self):
        main = self.context()
        self.assertEqual(main["invocationId"], INVOCATION)
        self.assertEqual(main["unit"], self.unit)
        self.assertIs(main["managerContextObserved"], True)
        self.assertIs(main["canExecute"], False)
        self.assertIs(main["installationComplete"], False)
        self.origin.assert_called_with(SHA)
        self.assertEqual(self.command.call_args.args[0], installer._installation_task_show_args(RETENTION))
        self.stop_post()
        self.assertEqual(self.context()["role"], "cleanup")

    def test_fixed_argv_binds_both_source_and_retention_without_shell(self):
        self.assertEqual(installer._installation_task_argv(SHA, RETENTION, "run"),
            ["/usr/bin/python3", "-I", "-S", "-B", str(self.root / installer.BOOTSTRAP),
             "installation-run", "--source-sha", SHA, "--retention-id", RETENTION])
        self.assertEqual(installer._installation_task_argv(SHA, RETENTION, "cleanup")[5], "installation-cleanup")
        for sha, identity, role in ((SHA.upper(), RETENTION, "run"), (SHA, RETENTION + ";id", "run"),
                                    (SHA, RETENTION, "stop"), (SHA, True, "run")):
            with self.subTest(role=role), self.assertRaises(ReleaseContractError):
                installer._installation_task_argv(sha, identity, role)

    def test_only_exact_show_query_is_admitted_not_submission_or_manager_mutation(self):
        args = installer._installation_task_show_args(RETENTION)
        self.assertTrue(installer._installation_task_show_allowed(args))
        for candidate in (tuple(args), args + ["--all"], ["systemd-run", "--unit=" + self.unit],
                          [*installer.SYSTEMCTL, "stop", self.unit],
                          [*installer.SYSTEMCTL, "daemon-reload"], args[:3] + ["docker.service"] + args[4:],
                          args[:-1] + ["--property=Environment"]):
            with self.subTest(candidate=candidate):
                self.assertFalse(installer._installation_task_show_allowed(candidate))

    def test_unknown_missing_and_duplicate_properties_are_refused(self):
        original = self.output()
        for raw in (original + "Other=x\n", original + "User=root\n",
                    "\n".join(line for line in original.splitlines() if not line.startswith("Group=")),
                    original + "\n", "User\n", original.replace("status=0/0", "status=\0"),
                    original.replace("Group=root", "Group=root\r")):
            with self.subTest(raw=raw[-50:]), patch.object(installer, "_bounded_host_client", return_value=raw), \
                 self.assertRaises(ReleaseContractError):
                self.context()

    def test_every_fixed_manager_property_is_checked(self):
        dynamic = {"ActiveState", "SubState", "MainPID", "ControlPID", "InvocationID", "ExecStart", "ExecStopPost"}
        for key in installer.INSTALL_TASK_KEYS:
            if key in dynamic:
                continue
            original = self.props[key]
            self.props[key] = "unreviewed"
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.context()
            self.props[key] = original

    def test_wrong_unit_generation_environment_is_not_authority(self):
        for invocation in ("", "0" * 32, "D" * 32, "e" * 32):
            self.props["InvocationID"] = invocation
            with self.subTest(invocation=invocation), self.assertRaises(ReleaseContractError):
                self.context()
        self.props["InvocationID"] = INVOCATION
        with patch.dict(os.environ, {"INVOCATION_ID": "e" * 32}), self.assertRaises(ReleaseContractError):
            self.context()

    def test_main_pid_control_pid_and_state_cannot_impersonate_an_owner(self):
        original = self.props.copy()
        for changes in ({"MainPID": "99"}, {"MainPID": "0"}, {"MainPID": "04321"},
                        {"ControlPID": "99"}, {"ActiveState": "active"}, {"SubState": "exited"}):
            self.props.update(changes)
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                self.context()
            self.props = original.copy()
        self.props.update(MainPID="0", ControlPID="4321")
        self.assertTrue(self.context()["managerContextObserved"])

    def test_cleanup_requires_this_control_pid_and_stop_post_state(self):
        self.stop_post()
        original = self.props.copy()
        for changes in ({"MainPID": "4321"}, {"ControlPID": "0"},
                        {"ControlPID": "99"}, {"SubState": "stop"}, {"ActiveState": "failed"}):
            self.props.update(changes)
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                self.context()
            self.props = original.copy()

    def test_actual_cgroup_and_cmdline_must_match_manager_and_requested_role(self):
        original = self.process.side_effect
        for name, raw in (("cgroup", b"0::/user.slice/spoof.service\n"),
                          ("cgroup", b"0::/system.slice/x\n0::/system.slice/y\n"),
                          ("cmdline", b"/usr/bin/python3\0unreviewed.py\0")):
            self.process.side_effect = lambda actual, n=name, r=raw: r if actual == n else original(actual)
            with self.subTest(name=name), self.assertRaises(ReleaseContractError):
                self.context()
        self.process.side_effect = original
        with patch.object(installer.Path, "cwd", return_value=Path("/tmp")), self.assertRaises(ReleaseContractError):
            self.context()

    def test_exec_entries_reject_extra_command_suffix_prefix_ignore_errors_and_wrong_source(self):
        original = self.props["ExecStart"]
        for value in (original + " " + original, original.replace(" -I ", " -E "),
                      original.replace("ignore_errors=no", "ignore_errors=yes"),
                      original.replace("--source-sha " + SHA, "--source-sha " + "e" * 40),
                      original.replace("--retention-id " + RETENTION, "--retention-id " + "e" * 64),
                      original.replace(" ; ignore_errors", " --extra ; ignore_errors"),
                      original.replace("path=/usr/bin/python3", "path=/bin/sh")):
            self.props["ExecStart"] = value
            with self.subTest(value=value[-80:]), self.assertRaises(ReleaseContractError):
                self.context()
        self.props["ExecStart"] = original
        self.props["ExecStopPost"] = self.exec_value("run")
        with self.assertRaises(ReleaseContractError):
            self.context()

    def test_observation_deadline_expiry_and_output_limits_are_not_success(self):
        for budget in (-1, 31, float("inf"), float("nan")):
            with self.subTest(budget=budget), self.assertRaises(ReleaseContractError):
                installer._installation_task_context(SHA, RETENTION, "run", deadline=time.monotonic() + budget)
        for raw in ("", "x" * 65537, None):
            with self.subTest(raw_type=type(raw)), patch.object(installer, "_bounded_host_client", return_value=raw), \
                 self.assertRaises(ReleaseContractError):
                self.context()
        start = time.monotonic()
        with patch.object(installer.time, "monotonic", side_effect=[start, start, start + 50]), \
             self.assertRaises(ReleaseContractError):
            installer._installation_task_context(SHA, RETENTION, "run", deadline=start + 20)

    def test_bootstrap_rejection_precedes_manager_or_proc_reads(self):
        self.origin.side_effect = ReleaseContractError("untrusted origin")
        with self.assertRaises(ReleaseContractError):
            self.context()
        self.command.assert_not_called()
        self.process.assert_not_called()

    def test_process_reader_has_only_fixed_paths_and_bounded_binary_input(self):
        # The saved reader exercises bounded fixed-path IO under an open fixture.
        original_reader = self._actual_reader
        with patch("builtins.open", side_effect=lambda path, mode: io.BytesIO(b"abc")) as opened:
            self.assertEqual(original_reader("cmdline"), b"abc")
            opened.assert_called_once_with("/proc/self/cmdline", "rb")
        with patch("builtins.open") as opened, self.assertRaises(ReleaseContractError):
            original_reader("../environ")
        opened.assert_not_called()
        with patch("builtins.open", return_value=io.BytesIO(b"x" * 65537)), \
             self.assertRaises(ReleaseContractError):
            original_reader("cgroup")

    def test_internal_roles_require_reviewed_bootstrap_before_manager_or_host_io(self):
        self.origin.side_effect = ReleaseContractError("untrusted bootstrap")
        self.assertEqual(installer.main(["installation-run", "--source-sha", SHA, "--retention-id", RETENTION]), 1)
        self.command.assert_not_called()
        self.process.assert_not_called()

    _actual_reader = staticmethod(installer._installation_task_process_file)


if __name__ == "__main__":
    unittest.main()
