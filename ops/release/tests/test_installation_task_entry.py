"""Finite manager-bound internal roles; real source FDs/pipes/records, modeled systemd and Docker."""
import contextlib
import copy
import json
import io
import os
import select
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_snapshot_storage as storage
import test_installation_supervised_writers as supervised
import test_installation_bound_sources as bound
import test_installation_task_context as manager_fixture
from release_contract import ReleaseContractError


def close_fd(fd):
    try:
        os.close(fd)
    except OSError:
        pass


class TaskExitCorroborationTests(unittest.TestCase):
    def setUp(self):
        self.base = manager_fixture.InstallationTaskContextTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)

    def test_clean_exit_environment_requires_matching_manager_result_code_and_status(self):
        self.base.stop_post()
        self.assertEqual(self.base.context()["role"], "cleanup")
        for name, value in (("Result", "signal"), ("ExecMainCode", "2"), ("ExecMainStatus", "1")):
            original = self.base.props[name]
            self.base.props[name] = value
            with self.subTest(name=name), self.assertRaises(ReleaseContractError):
                self.base.context()
            self.base.props[name] = original

    def test_signal_environment_is_corroborated_by_numeric_manager_status(self):
        self.base.stop_post()
        self.base.props.update(Result="signal", ExecMainCode=str(os.CLD_KILLED), ExecMainStatus="9")
        with patch.dict(os.environ, {"SERVICE_RESULT": "signal", "EXIT_CODE": "killed", "EXIT_STATUS": "KILL"}):
            self.assertEqual(self.base.context()["role"], "cleanup")
            self.base.props["ExecMainStatus"] = "15"
            with self.assertRaises(ReleaseContractError):
                self.base.context()

    def test_pending_main_rejects_any_prior_exit_result(self):
        for key, value in (("Result", "exit-code"), ("ExecMainCode", "1"), ("ExecMainStatus", "1")):
            original = self.base.props[key]
            self.base.props[key] = value
            with self.subTest(key=key), self.assertRaises(ReleaseContractError):
                self.base.context()
            self.base.props[key] = original


class InstallationTaskEntryTests(unittest.TestCase):
    def setUp(self):
        self.base = storage.InstallationSnapshotStorageTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.base.materials
        self.sha = "b" * 40
        self.bootstrap = supervised.provision_bound_sources(self, self.materials, self.sha)
        self.context = {"sourceSha": self.sha, "retentionId": self.materials.identity,
            "unit": installer.INSTALL_TASK_PREFIX + self.materials.identity + ".service",
            "invocationId": "e" * 32, "role": "run", "managerContextObserved": True,
            "installationComplete": False, "canExecute": False}
        self.result = {"sourceSha": self.sha, "retentionId": self.materials.identity,
            "outcome": "INSTALLATION_COMPLETE", "installationComplete": True, "canExecute": False,
            "installationIntent": {"maintenanceMarkerCleared": True}}
        self.input, self.peer_write = os.pipe()
        self.peer_read, self.output = os.pipe()
        for fd in (self.input, self.peer_write, self.peer_read, self.output):
            self.addCleanup(close_fd, fd)

    def manager(self, source, retention, role, **kwargs):
        self.assertEqual((source, retention), (self.sha, self.materials.identity))
        return {**self.context, "role": role}

    def enter(self, *, reply=None, complete=None, exchange=True):
        def target(request, *args, **kwargs):
            if kwargs.get("_request_sent"):
                kwargs["_request_sent"]()
            return self.base.raw() if reply is None else reply
        with patch.object(installer, "_installation_task_context", side_effect=self.manager), \
             patch.object(installer, "_complete_installation", return_value=self.result,
                          side_effect=complete) as completed, \
             (patch.object(installer, "_installation_snapshot_exchange", side_effect=target)
              if exchange else contextlib.nullcontext()):
            status = installer._installation_task_entry("run", self.materials.identity, self.sha,
                input_fd=self.input, output_fd=self.output, fetch=self.materials.case.fetch)
        return status, completed

    def test_live_first_frame_uses_reviewed_target_and_fixed_source_retention(self):
        requests, errors = [], []
        def peer():
            try:
                self.assertTrue(select.select([self.peer_read], [], [], 5)[0])
                raw = os.read(self.peer_read, 4096)
                self.assertEqual(raw.count(b"\n"), 1)
                requests.append(json.loads(raw))
                self.assertEqual(os.write(self.peer_write, self.base.raw()), len(self.base.raw()))
            except BaseException as error:
                errors.append(error)
            finally:
                close_fd(self.peer_write)
        worker = threading.Thread(target=peer, daemon=True)
        worker.start()
        status, complete = self.enter(exchange=False)
        worker.join(timeout=6)
        self.assertFalse(worker.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(status, 0)
        self.assertEqual(requests[0]["kind"], "sanq-minimal-install-target-request")
        self.assertEqual((requests[0]["sourceSha"], requests[0]["retentionId"]), (self.sha, self.materials.identity))
        self.assertIs(requests[0]["canExecute"], False)
        self.assertEqual(complete.call_args.args, (self.materials.identity, self.base.raw()))
        self.assertEqual(complete.call_args.kwargs["task_source_sha"], self.sha)

    def test_source_fds_span_complete_return_while_original_locks_can_be_reacquired(self):
        original = installer._bootstrap_read
        descriptors = {}
        def read(fd, parent, name):
            descriptors[name] = fd
            return original(fd, parent, name)
        def complete(*args, **kwargs):
            self.assertEqual(len(descriptors), 5)
            for fd in descriptors.values():
                self.assertGreater(os.fstat(fd).st_size, 0)
            with installer._private_session():
                pass
            return self.result
        with patch.object(installer, "_bootstrap_read", side_effect=read):
            self.assertEqual(self.enter(complete=complete)[0], 0)
        for fd in descriptors.values():
            with self.assertRaises(OSError):
                os.fstat(fd)

    def test_unexpected_system_exit_zero_and_interrupt_do_not_become_task_success(self):
        for error in (SystemExit(0), KeyboardInterrupt(), OSError("unknown completion")):
            def complete(*args, failure=error, **kwargs):
                raise failure
            with self.subTest(error=type(error).__name__):
                self.assertEqual(self.enter(complete=complete)[0], 1)

    def test_partial_wrong_source_or_non_native_completion_cannot_exit_zero(self):
        for value in ({}, {**self.result, "sourceSha": "f" * 40},
                      {**self.result, "installationComplete": 1},
                      {**self.result, "installationIntent": {"maintenanceMarkerCleared": 1}}):
            with self.subTest(value=value):
                self.assertEqual(self.enter(complete=lambda *args, result=value, **kwargs: result)[0], 1)

    def test_malformed_target_refuses_before_complete_flow(self):
        status, complete = self.enter(reply=b'{"schemaVersion":true}\n')
        self.assertEqual(status, 1)
        complete.assert_not_called()

    def test_same_bytes_source_replacement_after_complete_blocks_zero_exit(self):
        def complete(*args, **kwargs):
            source = self.bootstrap / installer.BOOTSTRAP
            other = source.with_suffix(".replacement")
            other.write_bytes(source.read_bytes())
            other.chmod(0o600)
            other.replace(source)
            return self.result
        self.assertEqual(self.enter(complete=complete)[0], 1)

    def test_replaced_live_channel_after_complete_blocks_zero_exit(self):
        def complete(*args, **kwargs):
            read, write = os.pipe()
            self.addCleanup(close_fd, read)
            self.addCleanup(close_fd, write)
            os.dup2(read, self.input)
            return self.result
        self.assertEqual(self.enter(complete=complete)[0], 1)

    def test_internal_role_parser_has_no_descriptor_host_or_path_override(self):
        args = ["installation-run", "--source-sha", self.sha, "--retention-id", self.materials.identity]
        with patch.object(installer, "_installation_task_entry", return_value=1) as entry:
            self.assertEqual(installer.main(args), 1)
        self.assertEqual(entry.call_args.args, ("run", self.materials.identity, self.sha))
        for option in ("--input-fd", "--host", "--kit"):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                installer.main(args + [option, "7"])
            self.assertEqual(raised.exception.code, 2)


class CleanTaskCleanupTests(unittest.TestCase):
    def setUp(self):
        self.flow = bound.BoundCompleteInstallationTests()
        self.flow.setUp()
        self.addCleanup(self.flow.doCleanups)
        self.flow.observe()
        self.context = {**self.flow.context, "role": "cleanup"}
        self.actions = []

    def command(self, intent, writers, identity, role, action, **kwargs):
        self.flow.gate.assert_locks_held()
        args = installer._saved_writer_args(intent, writers, identity, role, action)
        self.actions.append((role, action, args[-1]))
        row = self.flow.application.docker.containers[args[-1]]
        if action == "disable-restart":
            row["HostConfig"]["RestartPolicy"] = {"Name": "no", "MaximumRetryCount": 0}
        else:
            row["State"].update(Running=False, Status="exited")

    def cleanup(self, *, result="success", code="exited", status="0", entry=False):
        with patch.dict(os.environ, {"SERVICE_RESULT": result, "EXIT_CODE": code, "EXIT_STATUS": status}), \
             patch.object(installer, "_installation_task_context", return_value=dict(self.context)), \
             patch.object(installer, "_installation_writer_command", side_effect=self.command), \
             patch.object(installer, "_observation_command",
                          side_effect=lambda args, **kwargs: self.flow.application.docker.observe_command(args)):
            if entry:
                return installer._installation_task_entry("cleanup", self.flow.materials.identity, self.flow.sha,
                    fetch=self.flow.materials.case.fetch)
            return installer._installation_task_cleanup(self.flow.materials.identity, self.flow.sha,
                fetch=self.flow.materials.case.fetch)

    def test_clean_main_exit_and_complete_audit_preserve_running_original_application(self):
        before = copy.deepcopy(self.flow.application.docker.containers)
        result = self.cleanup()
        self.assertEqual(result["outcome"], "CLEAN_INSTALLATION_TASK_EXIT_OBSERVED")
        self.assertTrue(result["cleanTaskExitObserved"])
        self.assertFalse(result["installationComplete"])
        self.assertFalse(result["canExecute"])
        self.assertEqual(self.actions, [])
        self.assertEqual(before, self.flow.application.docker.containers)
        self.assertFalse(self.flow.gate.marker.exists())
        self.assertFalse(json.loads(self.flow.complete.path().read_bytes())["installationComplete"])

    def test_cleanup_entry_returns_zero_only_after_clean_audit_without_container_mutation(self):
        self.assertEqual(self.cleanup(entry=True), 0)
        self.assertEqual(self.actions, [])

    def test_inert_receipt_cannot_override_a_failed_signal_even_after_marker_clear(self):
        self.cleanup(result="signal", code="killed", status="KILL")
        self.assertEqual(len(self.actions), 6)
        self.flow.complete.assert_contained()
        self.assertFalse(self.flow.gate.marker.exists())

    def test_wrong_generation_with_complete_disk_audit_is_not_adopted(self):
        self.context["invocationId"] = "f" * 32
        with self.assertRaises(ReleaseContractError):
            self.cleanup()
        self.assertEqual(self.actions, [])

    def test_partial_audit_cannot_authorize_clean_handover(self):
        self.flow.complete.path().write_bytes(b"partial")
        with self.assertRaises((ReleaseContractError, ValueError)):
            self.cleanup()
        self.assertEqual(self.actions, [])

    def test_reappearing_foreign_marker_is_preserved_and_blocks_clean_handover(self):
        self.flow.gate.marker.write_bytes(b"foreign marker")
        self.flow.gate.marker.chmod(0o600)
        with self.assertRaises((ReleaseContractError, ValueError)):
            self.cleanup()
        self.assertEqual(self.actions, [])
        self.assertEqual(self.flow.gate.marker.read_bytes(), b"foreign marker")

    def test_late_source_drift_during_clean_audit_refuses_without_stopping_business(self):
        owned = installer._installation_owned_run
        def changed(*args, **kwargs):
            value = owned(*args, **kwargs)
            self.flow.source.write_bytes(self.flow.source.read_bytes() + b"# late clean audit change\n")
            return value
        with patch.object(installer, "_installation_owned_run", side_effect=changed), \
             self.assertRaises(ReleaseContractError):
            self.cleanup()
        self.assertEqual(self.actions, [])


class TaskEntryCompleteFlowTests(unittest.TestCase):
    def exercise(self, *, late_source=False, replaced_lock=False):
        flow = bound.BoundCompleteInstallationTests()
        flow.setUp()
        self.addCleanup(flow.doCleanups)
        real_complete = installer._complete_installation
        statuses, final = [], []
        def dispatch(retention, target, *, input_fd, output_fd, fetch, **kwargs):
            exchange = installer._installation_snapshot_exchange
            def target_or_snapshot(request, *fds, **options):
                if request.get("kind") == "sanq-minimal-install-target-request":
                    if options.get("_request_sent"):
                        options["_request_sent"]()
                    return target
                return exchange(request, *fds, **options)
            def complete(*args, **options):
                value = real_complete(*args, **options)
                final.append(value)
                if late_source:
                    flow.source.write_bytes(flow.source.read_bytes() + b"# changed after complete return\n")
                if replaced_lock:
                    lock = flow.materials.state / "jobs/.release.lock"
                    other = lock.with_suffix(".replacement")
                    other.write_bytes(lock.read_bytes())
                    other.chmod(0o600)
                    other.replace(lock)
                return value
            with patch.object(installer, "_complete_installation", side_effect=complete), \
                 patch.object(installer, "_installation_snapshot_exchange", side_effect=target_or_snapshot):
                statuses.append(installer._installation_task_entry("run", retention, flow.sha,
                    input_fd=input_fd, output_fd=output_fd, fetch=fetch))
            return final[-1]
        with patch.object(flow, "manager", side_effect=lambda source, retention, role, **kwargs:
                          {**flow.context, "role": role}), \
             patch.object(installer, "_complete_installation", side_effect=dispatch):
            result = flow.observe()
        return flow, result, statuses

    def test_entry_zero_exit_wraps_the_existing_complete_supervised_host_model(self):
        flow, result, statuses = self.exercise()
        self.assertEqual(statuses, [0])
        self.assertTrue(result["installationComplete"])
        self.assertFalse(flow.gate.marker.exists())
        self.assertTrue(flow.association().exists())
        self.assertIs(json.loads(flow.complete.path().read_bytes())["installationComplete"], False)

    def test_late_source_error_after_complete_return_contains_originals_under_reacquired_locks(self):
        flow, _, statuses = self.exercise(late_source=True)
        self.assertEqual(statuses, [1])
        flow.complete.assert_contained()
        self.assertFalse(flow.gate.marker.exists())
        self.assertIs(json.loads(flow.complete.path().read_bytes())["installationComplete"], False)

    def test_late_failure_cannot_contain_through_replaced_lock_paths(self):
        flow, _, statuses = self.exercise(late_source=True, replaced_lock=True)
        self.assertEqual(statuses, [1])
        self.assertEqual(len(flow.application.phase.actions), 6)
        self.assertTrue(all(flow.application.docker.containers[key]["State"]["Running"]
                            for key in flow.application.docker.ids[:3]))

    def test_old_or_unbound_task_progress_cannot_enter_observation(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("host IO")):
            for progress in ({}, {"attempted": True}, [], True):
                with self.subTest(progress=progress), self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("a" * 64, _task_application_progress=progress)


if __name__ == "__main__":
    unittest.main()
