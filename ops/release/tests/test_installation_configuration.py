"""Raw installation configuration observation; no Compose, commands or host apply."""
import json
import os
import stat
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installed_runtime_baseline as baseline
import install_minimal_executor as installer
from release_contract import ReleaseContractError

APP, PREVIOUS = "c" * 40, "d" * 40


class InstallationConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.base = baseline.InstalledRuntimeTests(
            "test_matching_old_runtime_reports_only_partial_observation_and_never_reads_app_state")
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials, self.runtime, self.case = self.base.materials, self.base.runtime, self.base.case
        self.env = self.runtime / ".env"
        self.state = self.runtime / ".sanq-release-state.json"
        self.marker = self.runtime / ".sanq-backup-layout-activated"
        self.env.write_bytes(b"SANQ_IMAGE_SHA=" + APP.encode() + b"\nPRIVATE_VALUE='p$word$$unchanged'\n")
        self.env.chmod(0o600)
        # Keep real disposable ownership; root test runners model ubuntu with 1000.
        self.account = SimpleNamespace(pw_uid=self.materials.uid or 1000, pw_gid=self.materials.gid or 1000)
        if self.materials.uid == 0:
            os.chown(self.env, self.account.pw_uid, self.account.pw_gid)
        self.state_value = {"schemaVersion": 1, "phase": "active", "current": APP, "previous": PREVIOUS,
                            "updatedAt": "2026-10-27T12:00:00+00:00", "reason": "readiness-verified"}
        self.save_state()
        self.marker.write_bytes(b"SANQ_BACKUP_LAYOUT_C4_V1\n")
        self.marker.chmod(0o644)
        self.materials.stack.enter_context(patch.object(installer.pwd, "getpwnam", return_value=self.account))

    def save_state(self, **changes):
        self.state.write_bytes((json.dumps({**self.state_value, **changes}, indent=2) + "\n").encode())
        self.state.chmod(0o600)

    def observe(self):
        return installer._observe_installed_configuration(self.materials.identity, fetch=self.case.fetch)

    def test_success_keeps_runtime_application_and_target_distinct_and_returns_no_secret_bytes(self):
        before = self.base.image()
        with patch.object(installer.os, "write", side_effect=AssertionError("observation wrote")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("observation synced")):
            result = self.observe()
        self.assertEqual(self.base.image(), before)
        self.assertEqual(result["applicationSha"], APP)
        self.assertEqual(result["previousApplicationSha"], PREVIOUS)
        self.assertNotEqual(result["currentArchiveSourceSha"], APP)
        self.assertNotEqual(result["sourceSha"], APP)
        self.assertTrue(result["configurationFilesObserved"])
        self.assertEqual(set(result["configurationFiles"]), set(installer.CONFIGURATION_NAMES))
        self.assertEqual(result["configurationFiles"][".env"]["sha256"], installer._hash(self.env.read_bytes()))
        rendered = json.dumps(result)
        self.assertNotIn("p$word", rendered)
        self.assertNotIn("PRIVATE_VALUE", rendered)
        for flag in ("readyToInstall", "canExecute", "authorizedToMutateProduction", "hostPreflightComplete",
                     "installedBaselineObserved", "operationSuccessProven", "applicationConfigurationObserved",
                     "composeExpansionObserved", "applicationReleaseAuthenticated", "c4StorageObserved",
                     "containersObserved", "systemdObserved"):
            self.assertFalse(result[flag])
        self.assertTrue(result["requiresHostRecheck"])
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_crlf_quotes_and_dollars_remain_exact_without_compose_reescaping(self):
        raw = b"# original\r\nSANQ_IMAGE_SHA=" + APP.encode() + b"\r\nPRIVATE_VALUE='a$b$$c'\r\n"
        self.env.write_bytes(raw)
        result = self.observe()
        self.assertEqual(self.env.read_bytes(), raw)
        self.assertEqual(result["configurationFiles"][".env"]["sha256"], installer._hash(raw))

    def test_rolled_back_state_and_legacy_utc_forms_are_observed_without_rollback_authority(self):
        for stamp in ("2026-10-27T12:00:00Z", "2026-10-27T12:00:00.123456+00:00"):
            self.save_state(phase="rolled-back", reason="rollback-verified", updatedAt=stamp)
            result = self.observe()
            self.assertEqual(result["releaseStatePhase"], "rolled-back")
            self.assertFalse(result["canExecute"])

    def test_sha_assignment_duplicates_exports_indentation_quotes_and_non_sha_are_rejected(self):
        valid = b"SANQ_IMAGE_SHA=" + APP.encode() + b"\n"
        for raw in (valid + valid, valid + b"export " + valid, valid + b"  " + valid,
                    b"export " + valid, b" " + valid, b"SANQ_IMAGE_SHA='" + APP.encode() + b"'\n",
                    b"SANQ_IMAGE_SHA=main\n", b"# SANQ_IMAGE_SHA=" + APP.encode() + b"\n",
                    b"SANQ_IMAGE_SHA = " + APP.encode() + b"\n"):
            with self.subTest(raw=raw):
                self.env.write_bytes(raw)
                with self.assertRaises((ReleaseContractError, ValueError)):
                    self.observe()
                self.assertEqual(self.env.read_bytes(), raw)

    def test_environment_bad_utf8_nul_and_lone_cr_are_refused_without_conversion(self):
        raw = self.env.read_bytes()
        for suffix in (b"\xff", b"\0", b"OTHER=one\rtwo"):
            self.env.write_bytes(raw + suffix)
            with self.assertRaises((ReleaseContractError, UnicodeError)):
                self.observe()
            self.assertEqual(self.env.read_bytes(), raw + suffix)

    def test_missing_each_configuration_file_blocks_without_recreation(self):
        for path in (self.env, self.state, self.marker):
            saved = path.with_name(path.name + ".saved")
            path.rename(saved)
            with self.assertRaises(FileNotFoundError):
                self.observe()
            self.assertFalse(path.exists())
            saved.rename(path)

    def test_unresolved_or_inconsistent_release_state_is_never_fixed_from_environment(self):
        for changes in ({"schemaVersion": True}, {"schemaVersion": 2}, {"phase": "pending"},
                        {"phase": "unknown"}, {"current": PREVIOUS}, {"previous": "main"},
                        {"reason": "rollout-start"}, {"reason": "rollback-verified"},
                        {"updatedAt": "2026-02-30T12:00:00Z"}, {"updatedAt": "2026-10-27T12:00:00"},
                        {"updatedAt": "2026-10-27T12:00:00+01:00"}, {"updatedAt": True},
                        {"extra": "not understood"}):
            with self.subTest(changes=changes):
                self.save_state(**changes)
                before = self.state.read_bytes()
                with self.assertRaises((ReleaseContractError, ValueError)):
                    self.observe()
                self.assertEqual(self.state.read_bytes(), before)

    def test_missing_and_duplicate_state_keys_are_refused(self):
        value = {**self.state_value}
        del value["previous"]
        for raw in (installer._json(value), b'{"schemaVersion":1,"schemaVersion":1}',
                    b"[]", b"null", b"{broken"):
            self.state.write_bytes(raw)
            with self.assertRaises((ReleaseContractError, ValueError)):
                self.observe()

    def test_c4_marker_content_is_checked_but_does_not_claim_storage_is_verified(self):
        self.marker.write_bytes(b" \nSANQ_BACKUP_LAYOUT_C4_V1\n")
        self.assertFalse(self.observe()["c4StorageObserved"])
        for raw in (b"unknown", b"SANQ_BACKUP_LAYOUT_C4_V2\n", b"\xff"):
            self.marker.write_bytes(raw)
            with self.assertRaises((ReleaseContractError, UnicodeError)):
                self.observe()
            self.assertEqual(self.marker.read_bytes(), raw)

    def test_private_configuration_permissions_and_special_bits_are_not_repaired(self):
        for path in (self.env, self.state):
            for mode in (0o644, 0o440, 0o4600):
                path.chmod(mode)
                with self.assertRaises(ReleaseContractError):
                    self.observe()
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), mode)
                path.chmod(0o600)
        self.env.chmod(0o400)
        self.state.chmod(0o400)
        self.assertTrue(self.observe()["configurationFilesObserved"])

    def test_symlinks_and_hardlinks_on_each_configuration_file_are_refused(self):
        for path in (self.env, self.state, self.marker):
            saved = path.with_name(path.name + ".saved")
            os.link(path, saved)
            with self.assertRaises(ReleaseContractError):
                self.observe()
            saved.unlink()
            path.rename(saved)
            path.symlink_to(saved)
            with self.assertRaises(OSError):
                self.observe()
            path.unlink()
            saved.rename(path)

    def test_ubuntu_account_identity_is_required_and_owner_group_drift_blocks(self):
        for account in (SimpleNamespace(pw_uid=0, pw_gid=self.account.pw_gid),
                        SimpleNamespace(pw_uid=self.account.pw_uid + 1, pw_gid=self.account.pw_gid),
                        SimpleNamespace(pw_uid=self.account.pw_uid, pw_gid=self.account.pw_gid + 1)):
            with patch.object(installer.pwd, "getpwnam", return_value=account), \
                 self.assertRaises(ReleaseContractError):
                self.observe()
        with patch.object(installer.pwd, "getpwnam", side_effect=KeyError("ubuntu absent")), \
             self.assertRaises(KeyError):
            self.observe()

    def test_empty_and_oversized_files_are_rejected_before_parsing(self):
        for path, maximum in ((self.env, installer.MAX_FILE), (self.state, 65536), (self.marker, 4096)):
            original = path.read_bytes()
            for size in (0, maximum + 1):
                with path.open("wb") as stream:
                    stream.truncate(size)
                with self.assertRaises(ReleaseContractError):
                    self.observe()
            path.write_bytes(original)

    def test_same_byte_environment_replacement_between_reads_is_not_accepted(self):
        snapshot = installer._configuration_snapshot
        calls = []
        def racing():
            value = snapshot()
            calls.append(True)
            if len(calls) == 1:
                replacement = self.env.with_name(".replacement")
                replacement.write_bytes(self.env.read_bytes())
                replacement.chmod(0o600)
                if self.materials.uid == 0:
                    os.chown(replacement, self.account.pw_uid, self.account.pw_gid)
                os.replace(replacement, self.env)
            return value
        with patch.object(installer, "_configuration_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_matching_environment_and_state_changes_between_passes_are_also_refused(self):
        snapshot = installer._configuration_snapshot
        calls = []
        def racing():
            value = snapshot()
            calls.append(True)
            if len(calls) == 1:
                self.env.write_bytes(b"SANQ_IMAGE_SHA=" + PREVIOUS.encode() + b"\n")
                self.save_state(current=PREVIOUS)
            return value
        with patch.object(installer, "_configuration_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_torn_private_read_is_rejected_even_if_the_current_sha_is_unchanged(self):
        read = installer.os.read
        changed = []
        def racing(fd, count):
            raw = read(fd, count)
            if not changed:
                changed.append(True)
                self.env.write_bytes(self.env.read_bytes() + b"OTHER=changed\n")
            return raw
        parent = os.open(self.runtime, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            with patch.object(installer.os, "read", side_effect=racing), self.assertRaises(ReleaseContractError):
                installer._configuration_read(parent, ".env", self.account)
        finally:
            os.close(parent)

    def test_original_locks_span_all_configuration_reads_and_competing_job_is_blocked(self):
        snapshot = installer._configuration_snapshot
        def locked():
            for acquire in (baseline.private.jobs._locked_directory, baseline.private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            return snapshot()
        with patch.object(installer, "_configuration_snapshot", side_effect=locked):
            self.observe()

    def test_material_source_and_late_incident_are_rechecked_after_configuration_read(self):
        snapshot = installer._configuration_snapshot
        marker = self.materials.state / "maintenance/active.json"
        for late in ("source", "incident"):
            def racing():
                value = snapshot()
                if late == "source":
                    self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
                elif not marker.exists():
                    marker.write_bytes(b"preserve original incident")
                return value
            with self.subTest(late=late), patch.object(installer, "_configuration_snapshot", side_effect=racing), \
                 self.assertRaises(ReleaseContractError):
                self.observe()
            if late == "source":
                self.assertEqual(self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"], "failure")
                self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "success"
            else:
                self.assertEqual(marker.read_bytes(), b"preserve original incident")

    def test_source_only_api_does_not_read_configuration_and_boolean_switch_is_strict(self):
        self.env.write_bytes(b"invalid deliberately")
        with patch.object(installer, "_configuration_snapshot", side_effect=AssertionError("configuration read")):
            self.assertTrue(self.base.observe()["installedRuntimeFilesObserved"])
            with self.assertRaises(ReleaseContractError):
                installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch,
                                                      include_configuration="yes")

    def test_no_new_configuration_or_install_cli_or_arbitrary_file_reader(self):
        for command in ("observe-configuration", "install", "apply"):
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                installer.main([command])
        parent = os.open(self.runtime, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            for name in ("../../etc/shadow", "runtime-release.json", "other"):
                with self.assertRaises(ReleaseContractError):
                    installer._configuration_read(parent, name, self.account)
        finally:
            os.close(parent)


if __name__ == "__main__":
    unittest.main()
