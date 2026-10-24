"""VB-04D1 synthetic installation manifest tests; no filesystem or systemd I/O."""
from __future__ import annotations

from dataclasses import FrozenInstanceError, replace
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    import maintenance_boot_guard_install_manifest as install
    from build_bundle import SOURCE_FILES
    from maintenance_boot_guard import evaluate_boot_candidate
    from maintenance_boot_guard_contract import BootGuardBlocked
finally:
    sys.path.pop(0)

HOST = "lab-guest"
INSTALL = "install-001"


def unit(name):
    common = {
        "name": name, "fragment": install.UNIT_FILES[name],
        "exec_start": "", "listen": "",
        "requires": (), "wants": (), "after": (), "before": (),
        "triggers": (), "triggered_by": (), "drop_ins": (),
        "load_state": "loaded", "active_state": "inactive",
        "unit_file_state": "disabled",
    }
    if name == "docker.service":
        common.update(
            exec_start=install.DOCKER_COMMAND,
            requires=("docker.socket", "sysinit.target"),
            wants=("network-online.target", "containerd.service"),
            after=("docker.socket", "containerd.service", "network-online.target"),
            triggered_by=("docker.socket",))
    elif name == "docker.socket":
        common.update(
            listen="/run/docker.sock (Stream)",
            requires=("sysinit.target",), before=("docker.service",),
            triggers=("docker.service",))
    else:
        common.update(exec_start="/usr/bin/containerd", after=("basic.target",))
    return install.ObservedUnit(**common)


def baseline():
    return install.UnitBaseline(
        HOST, INSTALL, 249, tuple(unit(name) for name in install.UNIT_NAMES))


def manifest():
    current = baseline()
    paths = []
    for i, (role, (kind, path, mode)) in enumerate(install.PATH_LAYOUT.items()):
        paths.append(install.PathIntent(
            role, kind, path, "root", mode,
            (format(i + 1, "064x") if kind == "file" else None)))
    hooks = tuple(install.HookIntent(name, phase, install.GUARD_BINARY, True, True)
                  for name, phase in install.GATE_PHASES.items())
    return install.InstallManifest(
        current, current.sha256(), tuple(paths), hooks, install.UNRESOLVED)


class OfflineInstallManifestTests(unittest.TestCase):
    def assert_denied(self, value, candidate="REJECT"):
        result = install.evaluate_offline_manifest(value)
        self.assertEqual(result.candidate, candidate)
        self.assertEqual(result.decision, "DENY")
        self.assertEqual(result.classification, install.LAB_ONLY)
        self.assertFalse(result.authorized_to_install)
        self.assertFalse(result.authorized_to_start_docker)
        self.assertFalse(result.authenticated_off_host)
        self.assertFalse(result.runtime_guard_tested)
        self.assertFalse(result.can_arm)
        return result

    def test_exact_readonly_baseline_and_all_path_intents_are_static_only(self):
        plan = manifest()
        verdict = self.assert_denied(plan, "STATIC_STRUCTURE_VALID")
        self.assertEqual(verdict.reason, "SYSTEMD_AND_AUTHORITY_NOT_VERIFIED")
        record = plan.document()
        self.assertEqual(record["schema"], install.SCHEMA)
        self.assertIs(record["permissionToInstall"], False)
        self.assertIs(record["permissionToStartDocker"], False)
        self.assertEqual(len(record["paths"]), 9)
        self.assertEqual(len(record["hooks"]), 2)

    def test_canonical_pins_and_immutable_entries(self):
        plan = manifest()
        self.assertEqual(plan.sha256(), manifest().sha256())
        self.assertEqual(plan.encode(), manifest().encode())
        with self.assertRaises(FrozenInstanceError):
            plan.baseline_sha256 = "f" * 64
        with self.assertRaises(FrozenInstanceError):
            plan.paths[0].mode = 0o777

    def test_missing_manifest_or_unknown_object_denied(self):
        for value in (None, False, {}, "safe"):
            with self.subTest(value=value):
                self.assert_denied(value)

    def test_wrong_host_and_installation_identity_denied(self):
        for key, value in (("host_id", ""), ("host_id", "invalid host"),
                           ("installation_id", "")):
            changed = replace(baseline(), **{key: value})
            wrong = replace(manifest(), baseline=changed)
            self.assert_denied(wrong)

    def test_unexpected_systemd_version_or_type_denied(self):
        for value in (248, 250, "249", True):
            with self.subTest(value=value):
                changed = replace(baseline(), systemd_major=value)
                self.assert_denied(replace(manifest(), baseline=changed))

    def test_unit_missing_reordered_or_extra_denied(self):
        base = baseline()
        for items in ((), base.units[:2], base.units[::-1],
                      base.units + (unit("docker.socket"),)):
            with self.subTest(count=len(items)):
                self.assert_denied(replace(manifest(), baseline=replace(base, units=items)))

    def test_unit_fragment_vendor_change_denied(self):
        base = baseline()
        bad = replace(base.units[0], fragment="/etc/systemd/system/docker.service")
        self.assert_denied(replace(manifest(), baseline=replace(
            base, units=(bad,) + base.units[1:])))

    def test_service_dockerd_command_drift_denied(self):
        base = baseline()
        for command in ("/usr/bin/dockerd", "/usr/bin/dockerd -H tcp://0.0.0.0:2375",
                        install.DOCKER_COMMAND + " --live-restore"):
            changed = replace(base.units[0], exec_start=command)
            self.assert_denied(replace(manifest(), baseline=replace(
                base, units=(changed,) + base.units[1:])))

    def test_socket_listen_and_trigger_drift_denied(self):
        base = baseline()
        for change in ({"listen": "/run/sanq.sock (Stream)"},
                       {"triggers": ()}, {"triggers": ("other.service",)}):
            changed = replace(base.units[1], **change)
            self.assert_denied(replace(manifest(), baseline=replace(
                base, units=(base.units[0], changed, base.units[2]))))

    def test_socket_disabled_baseline_does_not_claim_activation_safe(self):
        plan = manifest()
        self.assertEqual(plan.baseline.units[1].active_state, "inactive")
        self.assertEqual(plan.baseline.units[1].unit_file_state, "disabled")
        self.assert_denied(plan, "STATIC_STRUCTURE_VALID")

    def test_existing_dropin_and_active_daemon_denied(self):
        base = baseline()
        for change in ({"drop_ins": ("/etc/systemd/system/docker.service.d/other.conf",)},
                       {"active_state": "active"}, {"unit_file_state": "enabled"}):
            changed = replace(base.units[0], **change)
            self.assert_denied(replace(manifest(), baseline=replace(
                base, units=(changed,) + base.units[1:])))

    def test_service_socket_requires_missing_denied(self):
        base = baseline()
        for change in ({"requires": ()},
                       {"after": ("containerd.service",)},
                       {"wants": ("network-online.target",)},
                       {"triggered_by": ()}):
            changed = replace(base.units[0], **change)
            self.assert_denied(replace(manifest(), baseline=replace(
                base, units=(changed,) + base.units[1:])))

    def test_graph_cycle_using_additional_after_edge_denied(self):
        base = baseline()
        changed = replace(base.units[1], after=("docker.service",))
        wrong = replace(base, units=(base.units[0], changed, base.units[2]))
        self.assertEqual(self.assert_denied(
            replace(manifest(), baseline=wrong)).reason, "UNIT_ORDER_CYCLE")

    def test_graph_self_cycle_and_before_cycle_denied(self):
        base = baseline()
        for change in ({"after": ("docker.socket",)},
                       {"before": ("docker.socket",)}):
            with self.subTest(change=change):
                changed = replace(base.units[1], **change)
                wrong = replace(base, units=(base.units[0], changed, base.units[2]))
                self.assert_denied(replace(manifest(), baseline=wrong))

    def test_duplicate_dependencies_denied(self):
        base = baseline()
        changed = replace(base.units[0], requires=("docker.socket", "docker.socket"))
        self.assert_denied(replace(manifest(), baseline=replace(
            base, units=(changed,) + base.units[1:])))

    def test_baseline_hash_mismatch_denied(self):
        self.assertEqual(self.assert_denied(
            replace(manifest(), baseline_sha256="f" * 64)).reason,
            "BASELINE_PIN_MISMATCH")

    def test_missing_duplicate_or_reordered_file_entries_denied(self):
        base = manifest()
        for values in ((), base.paths[1:], base.paths[::-1],
                       base.paths[:-1] + (base.paths[0],)):
            with self.subTest(size=len(values)):
                self.assert_denied(replace(base, paths=values))

    def test_path_traversal_relative_root_and_vendor_mutation_denied(self):
        base = manifest()
        path = base.paths[-2]
        for value in ("etc/systemd/system/docker.service.d/50-sanq-boot-guard.conf",
                      "/etc/systemd/system/../docker.service.d/50-sanq-boot-guard.conf",
                      "/lib/systemd/system/docker.service", "/etc/passwd"):
            with self.subTest(path=value):
                changed = replace(path, path=value)
                self.assert_denied(replace(
                    base, paths=base.paths[:-2] + (changed,) + base.paths[-1:]))

    def test_wrong_owner_mode_and_file_sha_denied(self):
        base = manifest()
        record = base.paths[-2]
        for change in ({"owner": "ubuntu"}, {"mode": 0o777},
                       {"mode": True}, {"content_sha256": "x" * 64},
                       {"content_sha256": None}):
            with self.subTest(change=change):
                changed = replace(record, **change)
                self.assert_denied(replace(
                    base, paths=base.paths[:-2] + (changed,) + base.paths[-1:]))

    def test_directory_having_content_pin_denied(self):
        base = manifest()
        wrong = replace(base.paths[0], content_sha256="f" * 64)
        self.assert_denied(replace(base, paths=(wrong,) + base.paths[1:]))

    def test_gate_missing_or_swapped_denied(self):
        base = manifest()
        for hooks in ((), base.hooks[:1], base.hooks[::-1],
                      base.hooks + (base.hooks[0],)):
            with self.subTest(count=len(hooks)):
                self.assert_denied(replace(base, hooks=hooks))

    def test_socket_prebind_and_service_preexec_cannot_be_faked(self):
        base = manifest()
        for idx in (0, 1):
            for change in ({"phase": "SERVICE_PRE_EXEC" if idx else "SOCKET_PRE_BIND"},
                           {"check_each_attempt": False},
                           {"deny_on_unknown": False},
                           {"verifier": "/bin/true"}):
                changed = replace(base.hooks[idx], **change)
                hooks = list(base.hooks)
                hooks[idx] = changed
                self.assert_denied(replace(base, hooks=tuple(hooks)))

    def test_unresolved_runtime_and_identity_risks_cannot_be_erased(self):
        base = manifest()
        for state in ((), base.unresolved[1:], tuple(reversed(base.unresolved)),
                      ("ALL_TESTS_PASS",)):
            with self.subTest(state=state):
                self.assert_denied(replace(base, unresolved=state))
        self.assert_denied(replace(base, classification="AUTHENTICATED_OFF_HOST"))

    def test_no_p1_wiring_or_bundle_expansion(self):
        self.assertNotIn(
            "ops/runtime/maintenance_boot_guard_install_manifest.py", SOURCE_FILES)
        self.assertEqual(len(SOURCE_FILES), 17)
        self.assertFalse(install.evaluate_offline_manifest(manifest()).authorized_to_start_docker)
        # P1 requires different fields and retains its deny verdict.
        verdict = evaluate_boot_candidate(
            observed_host_id=HOST, anchor=None, state=None, request=None,
            receipts=None, off_host_available=False)
        self.assertEqual(verdict.decision, "DENY")
        self.assertFalse(verdict.authorized_to_start_docker)


if __name__ == "__main__":
    unittest.main()
