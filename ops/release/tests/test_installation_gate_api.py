"""Installed gate API checks: modeled host clients, real temporary gate/marker files."""
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import maintenance_guard as guard
import test_installation_permanent_gate_handover as handover
from release_contract import ReleaseContractError


def intent():
    return installer._installation_intent_bytes(
        installation_id="a" * 64, retention_id="b" * 64, target_source_sha="c" * 40,
        installed_runtime_source_sha="d" * 40, observation_sha256="e" * 64,
        created_at="2026-10-29T18:00:00Z")


def report(raw_intent=None, identity="a" * 64):
    marker = installer._installation_marker_bytes(intent() if raw_intent is None else raw_intent, identity)
    return {"schemaVersion": 1, "kind": "sanq-minimal-installation-fence-observation",
            "installationId": identity, "markerSha256": installer._hash(marker),
            "installedGateChecked": True, "startupDenied": True,
            "installationComplete": False, "canExecute": False}


class InstalledFenceApiTests(unittest.TestCase):
    def setUp(self):
        from contextlib import ExitStack
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.root.chmod(0o700)
        self.maintenance = self.root / "maintenance"
        self.maintenance.mkdir(mode=0o700)
        self.marker = self.maintenance / guard.MARKER
        self.marker.write_bytes(installer._installation_marker_bytes(intent(), "a" * 64))
        self.marker.chmod(0o600)
        self.script = self.root / "maintenance_guard.py"
        self.script.write_bytes(b"modeled installed guard source\n")
        self.script.chmod(0o644)
        self.guard_command = guard.GUARD_COMMAND.replace(str(guard.GUARD_SCRIPT), str(self.script))
        self.templates = {unit: raw.replace(str(guard.GUARD_SCRIPT), str(self.script))
                          .replace(str(guard.MAINTENANCE_DIR), str(self.maintenance))
                          for unit, raw in guard.DROPINS.items()}
        self.dropins = self.root / "systemd"
        self.dropins.mkdir(mode=0o755)
        self.rows = {}
        self.calls = []
        for unit, raw in self.templates.items():
            directory = self.dropins / (unit + ".d")
            directory.mkdir(mode=0o755)
            path = directory / "80-sanq-maintenance.conf"
            path.write_text(raw)
            path.chmod(0o644)
            self.rows[unit] = {"LoadState": "loaded", "NeedDaemonReload": "no", "DropInPaths": str(path)}
            if unit.endswith(".socket"):
                self.rows[unit]["Triggers"] = "docker.service"
            else:
                self.rows[unit]["ExecStartPre"] = "{ path=/usr/bin/python3 ; argv[]=" + self.guard_command + " ; ignore_errors=no ; }"
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        for module, key, value in ((guard, "MAINTENANCE_DIR", self.maintenance),
                                   (guard, "GUARD_SCRIPT", self.script), (guard, "__file__", str(self.script)),
                                   (guard, "DROPIN_ROOT", self.dropins), (guard, "GUARD_COMMAND", self.guard_command),
                                   (guard, "DROPINS", self.templates), (guard.storage, "OWNER_UID", os.getuid())):
            self.stack.enter_context(patch.object(module, key, value))
        self.stack.enter_context(patch.object(guard.os, "geteuid", return_value=0))

    def command(self, args):
        self.calls.append(args)
        if args[:2] == ["systemctl", "show"]:
            return "\n".join(key + "=" + value for key, value in self.rows[args[2]].items())
        self.assertEqual(args, ["docker", "info", "--format", "{{json .}}"])
        return json.dumps({"LiveRestoreEnabled": False, "Swarm": {"LocalNodeState": "inactive"}})

    def probe(self):
        return guard.check_installation_fence(run=self.command)

    def test_real_guard_api_reads_all_three_gates_and_actual_startup_denial_without_mutation(self):
        before = self.marker.read_bytes()
        with patch.object(guard.os, "unlink", side_effect=AssertionError("unlink")), \
             patch.object(guard.os, "replace", side_effect=AssertionError("replace")):
            self.assertEqual(self.probe(), report())
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(self.marker.read_bytes(), before)
        self.assertEqual(set(self.maintenance.iterdir()), {self.marker})

    def test_wrong_loaded_dropin_command_and_socket_target_cannot_pass(self):
        for unit, key, wrong in (("docker.service", "NeedDaemonReload", "yes"),
                                 ("sanq-backup.service", "ExecStartPre", ""),
                                 ("docker.socket", "Triggers", "other.service"),
                                 ("docker.service", "DropInPaths", "other.conf")):
            old = self.rows[unit][key]
            with self.subTest(unit=unit, key=key), self.assertRaises(ReleaseContractError):
                self.rows[unit][key] = wrong
                self.probe()
            self.rows[unit][key] = old

    def test_writable_installed_guard_or_symlink_dropin_is_rejected(self):
        self.script.chmod(0o666)
        with self.assertRaises(ReleaseContractError):
            self.probe()
        self.script.chmod(0o644)
        path = self.dropins / "docker.service.d/80-sanq-maintenance.conf"
        path.rename(path.with_suffix(".saved"))
        path.symlink_to(path.with_suffix(".saved"))
        with self.assertRaises(OSError):
            self.probe()

    def test_clear_missing_foreign_or_extra_maintenance_evidence_never_claims_installation_fence(self):
        original = self.marker.read_bytes()
        self.marker.unlink()
        with self.assertRaises(ReleaseContractError):
            self.probe()
        self.marker.write_bytes(b'{"kind":"other"}\n')
        self.marker.chmod(0o600)
        with self.assertRaises(ReleaseContractError):
            self.probe()
        self.marker.write_bytes(original)
        (self.maintenance / "unknown").write_bytes(b"residual")
        with self.assertRaises(ReleaseContractError):
            self.probe()

    def test_marker_modes_and_native_version_are_checked(self):
        self.marker.chmod(0o400)
        with self.assertRaises(ReleaseContractError):
            self.probe()
        self.marker.chmod(0o600)
        value = json.loads(self.marker.read_bytes())
        value["schemaVersion"] = True
        self.marker.write_bytes(installer._json(value))
        with self.assertRaises(ReleaseContractError):
            self.probe()

    def test_successful_startup_or_marker_late_change_is_rejected(self):
        with patch.object(guard, "check_startup", return_value=None), self.assertRaises(ReleaseContractError):
            self.probe()
        def changed():
            self.marker.write_bytes(b"late replacement")
            raise ReleaseContractError("modeled startup denial")
        with patch.object(guard, "check_startup", side_effect=changed), self.assertRaises(ReleaseContractError):
            self.probe()

    def test_nonroot_is_rejected_before_host_queries(self):
        with patch.object(guard.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.probe()
        self.assertEqual(self.calls, [])

    def test_readonly_cli_outputs_canonical_report_and_suppresses_failure_details(self):
        output = io.StringIO()
        with patch.object(guard, "check_installation_fence", return_value=report()), patch("sys.stdout", output):
            self.assertEqual(guard.main(["check-installation-fence"]), 0)
        self.assertEqual(output.getvalue(), installer._json(report()).decode("ascii"))
        output = io.StringIO()
        with patch.object(guard, "check_installation_fence", side_effect=ReleaseContractError("DO_NOT_ECHO")), \
             patch("sys.stdout", output):
            self.assertEqual(guard.main(["check-installation-fence"]), 1)
        self.assertNotIn("DO_NOT_ECHO", output.getvalue())


class GateApiReportTests(unittest.TestCase):
    def parse(self, raw):
        return installer._installation_gate_api_value(raw, intent(), "a" * 64)

    def test_strict_report_is_bound_to_current_marker_and_remains_non_authorizing(self):
        raw = installer._json(report()).decode("ascii")
        result = self.parse(raw)
        self.assertEqual(result["reportSha256"], installer._hash(raw.encode("ascii")))
        self.assertIs(result["canExecute"], False)
        self.assertIs(result["installationComplete"], False)

    def test_self_consistent_other_installation_hash_and_false_claims_are_rejected(self):
        for change in ({"installationId": "f" * 64}, {"markerSha256": "f" * 64},
                       {"installedGateChecked": False}, {"startupDenied": False},
                       {"canExecute": True}, {"installationComplete": True},
                       {"schemaVersion": True}, {"installedGateChecked": 1}, {"canExecute": 0},
                       {"kind": "other"}, {"extra": True}):
            with self.subTest(change=change), self.assertRaises(ReleaseContractError):
                self.parse(installer._json({**report(), **change}).decode("ascii"))

    def test_missing_duplicate_noncanonical_or_oversized_report_is_rejected(self):
        value = report()
        del value["startupDenied"]
        raw = installer._json(report()).decode("ascii")
        for wrong in (installer._json(value).decode("ascii"), raw.rstrip(), json.dumps(report()),
                      raw.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
                      "x" * 4097, raw.encode("ascii")):
            with self.subTest(wrong=wrong), self.assertRaises((ReleaseContractError, ValueError)):
                self.parse(wrong)

    def test_probe_is_bracketed_by_context_and_deadline_without_other_host_commands(self):
        events = []
        def client(args, **kwargs):
            self.assertEqual(args, list(installer.INSTALL_GATE_API_ARGS))
            self.assertIs(kwargs["_installation_gate_api"], True)
            events.append("probe")
            return installer._json(report()).decode("ascii")
        with patch.object(installer, "_bounded_host_client", side_effect=client):
            installer._installation_gate_api_observation(intent(), "a" * 64,
                check_context=lambda: events.append("check"), deadline=installer.time.monotonic() + 60)
        self.assertEqual(events, ["check", "probe", "check"])

    def test_expired_budget_or_failed_context_cannot_launch_installed_code(self):
        with patch.object(installer, "_bounded_host_client", side_effect=AssertionError("unexpected probe")):
            with self.assertRaises(ReleaseContractError):
                installer._installation_gate_api_observation(intent(), "a" * 64,
                    check_context=lambda: None, deadline=installer.time.monotonic() - 1)
            with self.assertRaises(ReleaseContractError):
                installer._installation_gate_api_observation(intent(), "a" * 64,
                    check_context=lambda: (_ for _ in ()).throw(ReleaseContractError("changed context")),
                    deadline=installer.time.monotonic() + 60)

    def test_fixed_probe_arguments_cannot_enter_general_observer_or_accept_alternate_client(self):
        with patch.object(installer.subprocess, "Popen", side_effect=AssertionError("spawn")):
            with self.assertRaises(ReleaseContractError):
                installer._observation_command(list(installer.INSTALL_GATE_API_ARGS), deadline=installer.time.monotonic() + 60)
            for args, flag in ((list(installer.INSTALL_GATE_API_ARGS[:-1]) + ["status"], True),
                               (list(installer.INSTALL_GATE_API_ARGS), 1)):
                with self.subTest(flag=flag, args=args), self.assertRaises(ReleaseContractError):
                    installer._bounded_host_client(args, deadline=installer.time.monotonic() + 60, _installation_gate_api=flag)


class OwnedGateApiTests(unittest.TestCase):
    def setUp(self):
        self.base = handover.InstallationPermanentGateHandoverTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.calls = []

    def client(self, args, **kwargs):
        self.base.gate.assert_locks_held()
        self.assertEqual(args, list(installer.INSTALL_GATE_API_ARGS))
        self.assertIs(kwargs["_installation_gate_api"], True)
        self.assertEqual(len(self.base.gate.reloads), 2)
        for unit, raw in installer.DROPINS.items():
            self.assertEqual(self.base.path(unit).read_bytes(), raw.encode())
        self.assertTrue(self.base.confirmation.path().exists())
        self.calls.append(args)
        value = json.loads(self.base.gate.marker.read_bytes())
        return installer._json({**report(), "installationId": value["installationId"],
            "markerSha256": installer._hash(self.base.gate.marker.read_bytes())}).decode("ascii")

    def observe(self, client=None):
        with patch.object(installer, "_handover_installation_permanent_gates",
                          side_effect=installer._verify_installation_permanent_gate_api), \
             patch.object(installer, "_bounded_host_client", side_effect=self.client if client is None else client):
            return self.base.observe()

    def test_owned_probe_runs_only_after_all_tools_and_loaded_permanent_gates_and_keeps_fence(self):
        result = self.observe()
        facts = result["installationIntent"]["snapshotReview"]
        self.assertEqual(result["outcome"], "INSTALLATION_PERMANENT_GATE_API_VERIFIED_FENCED")
        self.assertEqual(facts["outcome"], "PERMANENT_GATE_API_VERIFIED_FENCED")
        self.assertTrue(facts["permanentGateApiVerified"])
        self.assertTrue(facts["startupDenialObserved"])
        self.assertTrue(facts["installedToolPermissionsRechecked"])
        self.assertFalse(facts["requiresInstalledGateApiVerification"])
        self.assertTrue(facts["requiresApplicationVerification"])
        for key in ("installationComplete", "canExecute", "restoreProven", "recoveryReady"):
            self.assertIs(facts[key], False)
        self.assertEqual(len(self.calls), 1)
        self.base.assert_fenced()

    def test_old_handover_entry_never_runs_installed_api(self):
        with patch.object(installer, "_bounded_host_client", side_effect=AssertionError("unexpected installed API")):
            self.base.observe()
        self.base.assert_fenced()

    def test_unknown_probe_result_preserves_files_and_freeze_without_retry(self):
        calls = []
        def unknown(args, **kwargs):
            calls.append(args)
            raise OSError("probe reply lost")
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(unknown)
        self.assertEqual(len(calls), 1)
        self.base.assert_fenced()
        for unit, raw in installer.DROPINS.items():
            self.assertEqual(self.base.path(unit).read_bytes(), raw.encode())

    def test_tool_drift_after_child_report_blocks_success(self):
        def changed(args, **kwargs):
            raw = self.client(args, **kwargs)
            (self.base.base.runtime / installer.HELPERS[0]).write_bytes(b"changed installed helper")
            return raw
        with self.assertRaisesRegex(ReleaseContractError, "FENCE_UNCONFIRMED"):
            self.observe(changed)
        self.base.assert_fenced()

    def test_native_api_switch_requires_full_handover_chain_before_io(self):
        with patch.object(installer.os, "open", side_effect=AssertionError("host IO")):
            for value in (True, 1):
                with self.subTest(value=value), self.assertRaises(ReleaseContractError):
                    installer._observe_installed_runtime("f" * 64, _verify_gate_api=value)
