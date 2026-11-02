"""FI-MAC-1B3b privileged read observation; never starts installation services."""
import contextlib
import io
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_installation_bound_sources as bound
from release_contract import ReleaseContractError


SOURCE = "b" * 40
RETENTION = "a" * 64
INVOCATION = "e" * 32


def manager_fields(*, loaded=False):
    return {key: "" for key in installer.INSTALL_TASK_KEYS} | {
        "LoadState": "loaded" if loaded else "not-found",
        "Transient": "yes" if loaded else "",
        "Type": "oneshot" if loaded else "",
        "ActiveState": "inactive" if loaded else "",
        "InvocationID": INVOCATION if loaded else "",
        "ExecStart": ("{ path=/usr/bin/python3 ; argv[]="
                      + " ".join(installer._installation_task_argv(SOURCE, RETENTION, "run"))
                      + " ; ignore_errors=no ; }") if loaded else "",
        "ExecStopPost": ("{ path=/usr/bin/python3 ; argv[]="
                         + " ".join(installer._installation_task_argv(SOURCE, RETENTION, "cleanup"))
                         + " ; ignore_errors=no ; }") if loaded else "",
    }


def wire(values):
    return "\n".join(key + "=" + values[key] for key in installer.INSTALL_TASK_KEYS) + "\n"


class PrivilegedQueryArgumentTests(unittest.TestCase):
    def args(self):
        return ["installation-evidence-query", "--source-sha", SOURCE,
                "--retention-id", RETENTION]

    def test_exact_cli_never_runs_submit_run_cleanup(self):
        sentinel = {"schemaVersion": 1, "kind": installer.INSTALL_QUERY_KIND,
                    "outcome": "UNKNOWN", "installationComplete": False}
        with patch.object(installer, "_installation_evidence_readonly", return_value=sentinel) as reader, \
             patch.object(installer, "_installation_task_submit", side_effect=AssertionError("submit")), \
             patch.object(installer, "_installation_task_entry", side_effect=AssertionError("task")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(installer.main(self.args()), 0)
        reader.assert_called_once()
        self.assertEqual(reader.call_args.args, (RETENTION, SOURCE))
        self.assertIn('"installationComplete": false'.replace(": ", ":"), output.getvalue())
        self.assertNotIn("GITHUB_TOKEN", output.getvalue())

    def test_duplicate_unknown_and_noncanonical_args_block_without_reading(self):
        variants = [
            self.args() + ["--retention-id", RETENTION],
            ["installation-evidence-query", "--retention-id", RETENTION,
             "--source-sha", SOURCE],
            self.args() + ["--path", "/tmp"],
            ["installation-evidence-query", "--source-sha", "B" * 40,
             "--retention-id", RETENTION],
            ["installation-evidence-query", "--source-sha", SOURCE,
             "--retention-id", RETENTION + ";id"],
        ]
        with patch.object(installer, "_installation_evidence_readonly",
                          side_effect=AssertionError("unexpected query")):
            for argv in variants:
                with self.subTest(argv=argv), contextlib.redirect_stdout(io.StringIO()) as output, \
                     contextlib.redirect_stderr(io.StringIO()):
                    try:
                        code = installer.main(argv)
                    except SystemExit as raised:  # argparse refuses unknown flag
                        code = raised.code
                    self.assertNotEqual(code, 0)
                    self.assertNotIn("installationComplete\":true", output.getvalue())

    def test_fail_closed_report_has_no_secrets_or_authority(self):
        with patch.object(installer, "_installation_evidence_readonly",
                          side_effect=ReleaseContractError("private source SECRET")):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(installer.main(self.args()), 1)
        text = output.getvalue()
        self.assertIn('"outcome":"BLOCKED"', text)
        self.assertIn('"installationComplete":false', text)
        self.assertNotIn("SECRET", text)
        self.assertNotIn("sourceSha", text)
        self.assertNotIn("retentionId", text)

    def test_readonly_entry_requires_fixed_bootstrap_root(self):
        with patch.object(installer, "_bootstrap_invocation",
                          side_effect=ReleaseContractError("root bootstrap required")), \
             patch.object(installer, "_private_session",
                          side_effect=AssertionError("opened private storage")):
            with self.assertRaises(ReleaseContractError):
                installer._installation_evidence_readonly(RETENTION, SOURCE)


class ManagerOnlyReadTests(unittest.TestCase):
    def test_absent_collected_unit_is_unknown_not_success(self):
        with patch.object(installer, "_bounded_host_client",
                          return_value=wire(manager_fields())) as host:
            raw, loaded = installer._installation_query_manager(SOURCE, RETENTION, INVOCATION)
        self.assertFalse(loaded)
        self.assertIn("LoadState=not-found", raw)
        host.assert_called_once()
        self.assertEqual(host.call_args.args[0],
                         installer._installation_task_show_args(RETENTION))

    def test_loaded_matching_inactive_unit_does_not_prove_clean_exit(self):
        with patch.object(installer, "_bounded_host_client",
                          return_value=wire(manager_fields(loaded=True))):
            _, loaded = installer._installation_query_manager(SOURCE, RETENTION, INVOCATION)
        self.assertTrue(loaded)

    def test_loading_live_foreign_replaced_or_duplicate_unit_fails_closed(self):
        initial = manager_fields(loaded=True)
        cases = [
            {"ActiveState": "activating"},
            {"InvocationID": "f" * 32},
            {"ExecStart": "/bin/sh -c id"},
            {"Transient": "no"},
            {"Type": "simple"},
        ]
        for changes in cases:
            with self.subTest(changes=changes), \
                 patch.object(installer, "_bounded_host_client",
                              return_value=wire({**initial, **changes})), \
                 self.assertRaises(ReleaseContractError):
                installer._installation_query_manager(SOURCE, RETENTION, INVOCATION)
        with patch.object(installer, "_bounded_host_client",
                          return_value=wire(initial) + "LoadState=loaded\n"), \
             self.assertRaises(ReleaseContractError):
            installer._installation_query_manager(SOURCE, RETENTION, INVOCATION)


class ExistingOwnerFixtureTests(unittest.TestCase):
    """Real protected-directory fixture with existing owner checks; no VM or cloud."""

    def setUp(self):
        self.flow = bound.BoundCompleteInstallationTests()
        self.flow.setUp()
        self.addCleanup(self.flow.doCleanups)
        self.flow.observe()

    def query(self):
        with patch.object(installer, "_installation_query_manager",
                          return_value=("LoadState=not-found\n", False)), \
             patch.object(installer, "_private_write", side_effect=AssertionError("write")), \
             patch.object(installer, "_installation_record_write", side_effect=AssertionError("write")), \
             patch.object(installer, "_installation_task_submit", side_effect=AssertionError("submit")):
            return installer._installation_evidence_readonly(
                self.flow.materials.identity, self.flow.sha, fetch=self.flow.materials.case.fetch)

    def test_same_generation_post_marker_clear_yields_structural_observation_only(self):
        report = self.query()
        self.assertEqual(report["outcome"], "STRUCTURALLY_CONSISTENT_UNDER_PRIVILEGED_READ")
        self.assertEqual(report["requestedSourceSha"], self.flow.sha)
        self.assertTrue(report["maintenanceMarkerAbsentAtRead"])
        self.assertTrue(report["privilegedOriginalsStructurallyMatched"])
        self.assertFalse(report["managerUnitLoaded"])
        for key in ("managerHistoricalCleanExitProven", "verificationFactsRecomputed",
                    "awsOriginAuthenticated", "offHostRestoreProven", "installationComplete",
                    "canExecute", "readyToInstall", "restoreProven"):
            self.assertIs(report[key], False)

    def test_same_source_partial_or_foreign_record_blocks(self):
        path = self.flow.association()
        original = path.read_bytes()
        for replacement in (original + b"x", b'{}\n'):
            path.write_bytes(replacement)
            with self.subTest(raw=replacement[:30]), self.assertRaises(
                    (ReleaseContractError, ValueError)):
                self.query()
        path.write_bytes(original)

    def test_tampered_preclear_completion_blocks_without_success(self):
        path = self.flow.complete.path()
        original = path.read_bytes()
        path.write_bytes(original.replace(b'"installationComplete":false',
                                          b'"installationComplete":true'))
        with self.assertRaises(ReleaseContractError):
            self.query()

    def test_manager_changes_during_read_block_observation(self):
        with patch.object(installer, "_installation_query_manager", side_effect=[
                ("LoadState=not-found\n", False), ("LoadState=loaded\n", True)]), \
             self.assertRaises(ReleaseContractError):
            installer._installation_evidence_readonly(
                self.flow.materials.identity, self.flow.sha,
                fetch=self.flow.materials.case.fetch)

    def test_marker_present_blocks_before_materials_query(self):
        marker = self.flow.gate.marker
        marker.write_bytes(b'{}\n')
        marker.chmod(0o600)
        with self.assertRaises(ReleaseContractError):
            self.query()

    def test_second_transaction_blocks_without_choosing_latest(self):
        runs = self.flow.gate.namespace
        self.assertTrue(runs.is_dir())
        another = runs / ("f" * 64)
        another.mkdir(mode=0o700)
        with self.assertRaises(ReleaseContractError):
            self.query()


if __name__ == "__main__":
    unittest.main()
