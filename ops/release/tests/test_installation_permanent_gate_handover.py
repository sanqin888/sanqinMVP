"""Permanent drop-in handover under the original installation locks, with modeled PID1 only."""
import json
import sys
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_owned_tool_writes as owned
from release_contract import ReleaseContractError


class InstallationPermanentGateHandoverTests(unittest.TestCase):
    def setUp(self):
        self.base = owned.OwnedInstallationToolWriteTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.confirmation = self.base.base
        self.gate = self.confirmation.retention.phase.gate
        self.manager = self.gate.manager
        self.events = []

    def path(self, unit, name=None):
        return self.manager.directory / (unit + ".d") / (installer.INSTALL_GATE_NAME if name is None else name)

    def reload_permanent(self, *, deadline):
        self.gate.assert_locks_held()
        self.assertTrue(self.gate.marker.exists())
        self.assertTrue(self.confirmation.path().exists())
        self.assertTrue(all((self.base.runtime / path).exists() for path in installer.HELPERS))
        for unit, raw in installer.DROPINS.items():
            self.assertEqual(self.path(unit).read_bytes(), raw.encode())
            self.manager.rows[unit]["NeedDaemonReload"] = "no"
            self.manager.rows[unit]["DropInPaths"] = "/etc/systemd/system/" + unit + ".d/" + installer.INSTALL_GATE_NAME
            if unit.endswith(".service"):
                self.manager.rows[unit]["ExecStartPre"] = (
                    "{ path=/usr/bin/python3 ; argv[]=" + installer.COMMAND + " ; ignore_errors=no ; }")
        self.gate.reloads.append(deadline)

    def observe(self, *, reload=None, first_exchange=None):
        initial = self.gate.reload_manager
        def reloader(*, deadline):
            if not self.gate.reloads:
                return initial(deadline=deadline)
            self.events.append("permanent-reload")
            return self.reload_permanent(deadline=deadline) if reload is None else reload(deadline=deadline)
        with patch.object(self.gate, "reload_manager", side_effect=reloader), \
             patch.object(installer, "_write_installation_tools", side_effect=installer._handover_installation_permanent_gates):
            return self.base.observe(first_exchange=first_exchange)

    def with_writer(self, hook=None, *, reload=None):
        write = installer._replace_installation_permanent_gate
        def checked(unit, progress, **kwargs):
            self.gate.assert_locks_held()
            self.assertTrue(self.confirmation.path().exists())
            self.assertTrue(self.gate.marker.exists())
            self.assertTrue(all((self.base.runtime / path).exists() for path in installer.HELPERS))
            self.events.append(unit)
            return write(unit, progress, **kwargs) if hook is None else hook(write, unit, progress, kwargs)
        with patch.object(installer, "_replace_installation_permanent_gate", side_effect=checked):
            return self.observe(reload=reload)

    def assert_fenced(self):
        self.base.assert_fenced()
        self.assertTrue(self.gate.marker.exists())

    def test_owned_flow_hands_over_all_three_then_reloads_and_keeps_application_frozen(self):
        originals = {}
        def capture(write, unit, progress, kwargs):
            originals[unit] = progress["original"][unit]
            return write(unit, progress, **kwargs)
        result = self.with_writer(capture)
        facts = result["installationIntent"]["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_PERMANENT_GATES_LOADED_FENCED")
        self.assertEqual(facts["outcome"], "PERMANENT_GATES_LOADED_FENCED")
        self.assertEqual(self.events, [*installer.DROPINS, "permanent-reload"])
        self.assertEqual(len(self.gate.reloads), 2)
        self.assertTrue(facts["toolFilesWritten"])
        self.assertTrue(facts["permanentGatesLoaded"])
        self.assertTrue(facts["permanentGatePropertiesObserved"])
        self.assertEqual(set(facts["permanentGateFiles"]), set(installer.DROPINS))
        self.assertEqual(facts["permanentGateFiles"]["docker.socket"], originals["docker.socket"])
        self.assertEqual(set(facts["permanentGatePropertiesSha256"]), set(installer.DROPINS))
        for unit, raw in installer.DROPINS.items():
            self.assertEqual(self.path(unit).read_bytes(), raw.encode())
            self.assertEqual(self.path(unit).stat().st_mode & 0o7777, 0o644)
            self.assertFalse(self.path(unit, installer.INSTALL_GATE_PENDING).exists())
        for key in ("permanentGateApiVerified", "installationComplete", "restoreProven", "recoveryReady", "canExecute"):
            self.assertIs(facts[key], False, key)
        self.assertTrue(facts["requiresApplicationVerification"])
        self.assertTrue(facts["requiresInstalledGateApiVerification"])
        self.assertTrue(facts["restoreValidationDeferred"])
        self.assert_fenced()

    def test_old_tool_write_entry_does_not_replace_gates_or_do_second_reload(self):
        with patch.object(installer, "_replace_installation_permanent_gate", side_effect=AssertionError("unexpected gate write")):
            result = self.base.observe()
        self.assertFalse(result["installationIntent"]["snapshotReview"]["permanentGatesLoaded"])
        self.assertEqual(len(self.gate.reloads), 1)
        for unit, raw in installer.INSTALL_DENY_DROPINS.items():
            self.assertEqual(self.path(unit).read_bytes(), raw)

    def test_native_handover_switch_requires_all_tool_write_preconditions_before_io(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("unexpected host IO")):
            for value in (True, 1):
                with self.subTest(value=value), self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("f" * 64, _handover_gates=value)

    def test_failure_at_second_gate_keeps_first_permanent_file_without_reload_or_rollback(self):
        def fail(write, unit, progress, kwargs):
            if unit == "docker.socket":
                raise ReleaseContractError("modeled second gate failure")
            return write(unit, progress, **kwargs)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(fail)
        self.assertEqual(self.path("docker.service").read_bytes(), installer.DROPINS["docker.service"].encode())
        self.assertEqual(self.path("sanq-backup.service").read_bytes(), installer.INSTALL_DENY_DROPINS["sanq-backup.service"])
        self.assertEqual(len(self.gate.reloads), 1)
        self.assert_fenced()

    def test_file_sync_failure_preserves_original_and_pending_without_retry(self):
        sync = installer.os.fsync
        def fail(write, unit, progress, kwargs):
            def fsync(fd):
                raise OSError("modeled gate file sync failure")
            with patch.object(installer.os, "fsync", side_effect=fsync):
                return write(unit, progress, **kwargs)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(fail)
        self.assertEqual(self.path("docker.service").read_bytes(), installer.INSTALL_DENY_DROPINS["docker.service"])
        self.assertTrue(self.path("docker.service", installer.INSTALL_GATE_PENDING).exists())
        self.assertEqual(len(self.gate.reloads), 1)
        self.assert_fenced()

    def test_rename_failure_preserves_original_and_staged_gate(self):
        def fail(write, unit, progress, kwargs):
            with patch.object(installer.os, "replace", side_effect=OSError("modeled gate rename failure")):
                return write(unit, progress, **kwargs)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(fail)
        self.assertEqual(self.path("docker.service").read_bytes(), installer.INSTALL_DENY_DROPINS["docker.service"])
        self.assertTrue(self.path("docker.service", installer.INSTALL_GATE_PENDING).exists())
        self.assert_fenced()

    def test_directory_sync_failure_after_rename_keeps_actual_permanent_gate(self):
        sync = installer.os.fsync
        def fail(write, unit, progress, kwargs):
            import stat
            def fsync(fd):
                if stat.S_ISDIR(installer.os.fstat(fd).st_mode):
                    raise OSError("modeled gate directory sync failure")
                return sync(fd)
            with patch.object(installer.os, "fsync", side_effect=fsync):
                return write(unit, progress, **kwargs)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(fail)
        self.assertEqual(self.path("docker.service").read_bytes(), installer.DROPINS["docker.service"].encode())
        self.assertFalse(self.path("docker.service", installer.INSTALL_GATE_PENDING).exists())
        self.assert_fenced()

    def test_reload_success_without_new_effective_commands_cannot_claim_handover(self):
        def noop(*, deadline):
            self.gate.reloads.append(deadline)
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(reload=noop)
        for unit, raw in installer.DROPINS.items():
            self.assertEqual(self.path(unit).read_bytes(), raw.encode())
        self.assertEqual(len(self.gate.reloads), 2)
        self.assert_fenced()

    def test_unknown_reload_result_keeps_all_new_files_and_does_not_reissue_reload(self):
        def unknown(*, deadline):
            self.reload_permanent(deadline=deadline)
            raise OSError("modeled reload reply lost")
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(reload=unknown)
        self.assertEqual(len(self.gate.reloads), 2)
        for unit, raw in installer.DROPINS.items():
            self.assertEqual(self.path(unit).read_bytes(), raw.encode())
        self.assert_fenced()

    def test_need_daemon_reload_after_command_is_still_unresolved(self):
        def stale(*, deadline):
            self.reload_permanent(deadline=deadline)
            self.manager.rows["docker.service"]["NeedDaemonReload"] = "yes"
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(reload=stale)
        self.assert_fenced()

    def test_command_parser_rejects_ignored_errors_wrong_paths_duplicates_and_wrong_phase(self):
        permanent = "{ path=/usr/bin/python3 ; argv[]=" + installer.COMMAND + " ; ignore_errors=no ; }"
        temporary = "{ path=/usr/bin/false ; argv[]=/usr/bin/false ; ignore_errors=no ; }"
        self.assertTrue(installer._installation_loaded_gate_command(temporary, None))
        self.assertTrue(installer._installation_loaded_gate_command(temporary, {"reloaded": False}))
        self.assertTrue(installer._installation_loaded_gate_command(permanent, {"reloaded": True}))
        for wrong in ("", permanent + permanent, permanent.replace("ignore_errors=no", "ignore_errors=yes"),
                      permanent.replace("ignore_errors=no", "ignore_errors=nope"),
                      permanent.replace("path=/usr/bin/python3", "path=/other/python"),
                      permanent.replace("/opt/sanq/runtime", "/tmp/untrusted"), temporary):
            with self.subTest(wrong=wrong):
                self.assertFalse(installer._installation_loaded_gate_command(wrong, {"reloaded": True}))

    def test_extra_loaded_dropin_path_is_rejected_after_reload(self):
        def extra(*, deadline):
            self.reload_permanent(deadline=deadline)
            self.manager.rows["docker.service"]["DropInPaths"] += " /etc/systemd/system/docker.service.d/unknown.conf"
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(reload=extra)
        self.assert_fenced()

    def test_completed_gate_mutation_during_next_unit_cannot_be_adopted(self):
        def changed(write, unit, progress, kwargs):
            result = write(unit, progress, **kwargs)
            if unit == "docker.socket":
                self.path("docker.service").write_bytes(b"changed completed gate")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(changed)
        self.assertEqual(self.events, ["docker.service", "docker.socket"])
        self.assertEqual(len(self.gate.reloads), 1)
        self.assert_fenced()

    def test_unknown_gate_directory_member_is_preserved_and_blocks_remaining_writes(self):
        unknown = self.path("sanq-backup.service", "unknown.conf")
        def changed(write, unit, progress, kwargs):
            result = write(unit, progress, **kwargs)
            unknown.write_bytes(b"unexpected override")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(changed)
        self.assertEqual(unknown.read_bytes(), b"unexpected override")
        self.assertEqual(self.events, ["docker.service"])
        self.assert_fenced()

    def test_parent_directory_replacement_is_detected_with_old_file_preserved(self):
        def changed(write, unit, progress, kwargs):
            result = write(unit, progress, **kwargs)
            directory = self.path(unit).parent
            directory.rename(self.manager.directory / (unit + ".old"))
            directory.mkdir(mode=0o755)
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(changed)
        self.assertTrue((self.manager.directory / "docker.service.old" / installer.INSTALL_GATE_NAME).exists())
        self.assert_fenced()

    def test_tool_file_drift_after_gate_write_is_detected_by_original_frozen_callback(self):
        def changed(write, unit, progress, kwargs):
            result = write(unit, progress, **kwargs)
            (self.base.runtime / installer.HELPERS[0]).write_bytes(b"changed installed helper")
            return result
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(changed)
        self.assertEqual(self.events, ["docker.service"])
        self.assert_fenced()

    def test_no_git_requests_are_issued_inside_gate_file_loop(self):
        combined = self.gate.combined
        fetch = combined.fetch
        active = [False]
        def checked_fetch(path):
            self.assertFalse(active[0], "Git requests inside permanent gate writes")
            return fetch(path)
        def write_gate(write, unit, progress, kwargs):
            active[0] = True
            result = write(unit, progress, **kwargs)
            if unit == tuple(installer.DROPINS)[-1]:
                active[0] = False
            return result
        with patch.object(combined, "fetch", side_effect=checked_fetch):
            self.with_writer(write_gate)
        self.assert_fenced()

    def test_completed_handover_has_no_resume_or_automatic_replay_path(self):
        self.observe()
        with patch.object(installer, "_replace_installation_permanent_gate", side_effect=AssertionError("replayed gate write")), \
             self.assertRaises(ReleaseContractError):
            self.observe(first_exchange=lambda *args, **kwargs: self.fail("replayed snapshot wait"))
        self.assert_fenced()

    def test_expired_gate_deadline_blocks_before_replacing_any_temporary_gate(self):
        def expired(write, unit, progress, kwargs):
            return write(unit, progress, **{**kwargs, "deadline": installer.time.monotonic() - 1})
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.with_writer(expired)
        for unit, raw in installer.INSTALL_DENY_DROPINS.items():
            self.assertEqual(self.path(unit).read_bytes(), raw)
        self.assertEqual(len(self.gate.reloads), 1)
        self.assert_fenced()
