"""Pre-install recovery originals: real disposable files, no host command execution."""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_installation_gate_load as gates
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationRecoverySourcesTests(unittest.TestCase):
    def setUp(self):
        self.base = gates.InstallationGateLoadTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.materials = self.base.materials
        self.runtime = self.base.combined.docker.config.runtime

    def observe(self):
        return installer._observe_installation_recovery_sources(
            self.materials.identity, fetch=self.base.combined.fetch)

    def plan(self, raw=b'{"inert":"private $bytes"}\n'):
        path = self.materials.state / "plans" / ("a" * 64 + ".json")
        path.write_bytes(raw)
        path.chmod(0o600)
        return path

    def capture(self):
        original = installer._installation_recovery_sources
        values = []
        def checked(*args):
            value = original(*args)
            values.append(value)
            return value
        with patch.object(installer, "_installation_recovery_sources", side_effect=checked):
            result = self.observe()
        self.assertEqual(len(values), 2)
        self.assertEqual(values[0], values[1])
        return result, values[0][0]

    def test_summary_has_no_original_secret_bytes_or_recovery_install_permission(self):
        result = self.observe()
        self.assertEqual(result["outcome"], "INSTALLATION_RECOVERY_SOURCES_OBSERVED")
        self.assertEqual(result["scope"], "pre-install-original-files-only")
        self.assertEqual(len(result["files"]), 30)
        self.assertEqual(len(result["absentFiles"]), 15)
        for key in ("completePrivateStateCaptured", "recoveryArchiveDurable", "snapshotAvailable",
                    "recoveryReady", "readyToInstall", "canExecute"):
            self.assertFalse(result[key])
        body = json.dumps(result)
        self.assertNotIn("DATABASE_URL=", body)
        self.assertNotIn("PRIVATE_VALUE=", body)
        self.assertNotIn("never_echo", body)
        self.assertTrue(result["requiresHostRecheck"])

    def test_internal_raw_capture_has_all_old_members_and_matching_metadata(self):
        result, files = self.capture()
        self.assertEqual(set(files), set(result["files"]))
        for path, raw in files.items():
            proof = result["files"][path]
            self.assertEqual(proof["sha256"], installer._hash(raw))
            self.assertEqual(proof["bytes"], len(raw))
            self.assertEqual(len(proof["identity"]), 9)
        for member in (*installer.RUNTIME_MEMBERS, "runtime-release.json", *installer.CONFIGURATION_NAMES):
            self.assertEqual(files["/opt/sanq/runtime/" + member], (self.runtime / member).read_bytes())
        self.assertEqual(result["capturedBytes"], sum(map(len, files.values())))

    def test_read_only_capture_has_no_write_sync_spawn_or_docker_manager_client_calls(self):
        with patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("sync")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("spawn")), \
             patch.object(installer, "_docker_command", side_effect=AssertionError("docker")), \
             patch.object(installer, "_systemd_command", side_effect=AssertionError("manager")):
            self.observe()
        self.assertFalse(self.base.marker.exists())

    def test_original_two_locks_span_both_captures_and_their_inodes_are_kept(self):
        paths = [self.materials.state / "jobs/.release.lock", self.materials.state / "plans/.prepare.lock"]
        before = [path.stat().st_ino for path in paths]
        original = installer._installation_recovery_sources
        def checked(*args):
            self.base.assert_locks_held()
            return original(*args)
        with patch.object(installer, "_installation_recovery_sources", side_effect=checked):
            result = self.observe()
        self.assertEqual(before, [path.stat().st_ino for path in paths])
        self.assertEqual(len(result["originalLockMetadata"]), 2)
        self.assertTrue(all(path not in result["files"] for path in result["originalLockMetadata"]))

    def test_configuration_original_crlf_dollars_and_readonly_mode_are_kept(self):
        path = self.runtime / ".env"
        path.chmod(0o600)
        raw = path.read_bytes() + b"\r\nMODEL_TOKEN=$one$$two\r\n"
        path.write_bytes(raw)
        path.chmod(0o400)
        result, files = self.capture()
        self.assertEqual(files["/opt/sanq/runtime/.env"], raw)
        self.assertEqual(path.read_bytes(), raw)
        self.assertEqual(result["files"]["/opt/sanq/runtime/.env"]["identity"][7] & 0o7777, 0o400)

    def test_private_plan_bytes_are_data_and_never_become_a_restore_lock(self):
        path = self.plan()
        result, files = self.capture()
        label = "/opt/sanq/deploy-state/plans/" + path.name
        self.assertEqual(files[label], path.read_bytes())
        self.assertEqual(result["files"][label]["sha256"], installer._hash(path.read_bytes()))
        self.assertFalse(result["completePrivateStateCaptured"])

    def test_systemd_backup_originals_and_absences_are_pre_gate_facts(self):
        result, files = self.capture()
        for unit in ("sanq-backup.service", "sanq-backup.timer"):
            self.assertEqual(files["/etc/systemd/system/" + unit],
                             (self.base.manager.directory / unit).read_bytes())
        for unit in installer.INSTALL_DENY_DROPINS:
            path = "/etc/systemd/system/" + unit + ".d/" + installer.INSTALL_GATE_NAME
            self.assertIn(path, result["absentFiles"])
            self.assertNotIn(path, files)
        self.assertEqual(len(installer.PRIVATE_FILES), 4)

    def test_temporary_gate_bytes_cannot_be_misidentified_as_original_dropin(self):
        installer._write_temporary_gate_files()
        path = self.base.manager.directory / "docker.service.d" / installer.INSTALL_GATE_NAME
        original = path.read_bytes()
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(path.read_bytes(), original)

    def test_modified_old_member_blocks_capture_and_is_not_repaired(self):
        path = self.runtime / "docker-compose.yml"
        path.write_bytes(b"locally changed old member")
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(path.read_bytes(), b"locally changed old member")

    def test_existing_helper_is_not_imported_or_recorded_as_absent(self):
        path = self.runtime / installer.HELPERS[0]
        path.write_bytes(b"raise AssertionError('must not execute')\n")
        path.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(path.exists())

    def test_late_same_bytes_configuration_replacement_blocks_public_summary(self):
        original = installer._installation_recovery_sources
        changed = []
        path = self.runtime / ".env"
        def racing(*args):
            value = original(*args)
            if not changed:
                changed.append(True)
                before = path.stat()
                replacement = path.with_name("replacement")
                replacement.write_bytes(path.read_bytes())
                replacement.chmod(before.st_mode & 0o7777)
                if os.getuid() == 0:
                    os.chown(replacement, before.st_uid, before.st_gid)
                os.replace(replacement, path)
            return value
        with patch.object(installer, "_installation_recovery_sources", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue(path.exists())

    def test_late_private_inventory_is_preserved_and_blocks_summary(self):
        original = installer._installation_recovery_sources
        changed = []
        def racing(*args):
            value = original(*args)
            if not changed:
                changed.append(True)
                self.plan()
            return value
        with patch.object(installer, "_installation_recovery_sources", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue((self.materials.state / "plans" / ("a" * 64 + ".json")).exists())

    def test_unknown_private_member_or_symlink_is_never_copied_or_removed(self):
        path = self.materials.state / "plans/unknown"
        path.write_bytes(b"preserve unknown")
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(path.read_bytes(), b"preserve unknown")
        path.unlink()
        link = self.materials.state / "plans" / ("a" * 64 + ".json")
        link.symlink_to(self.runtime / ".env")
        with self.assertRaises((ReleaseContractError, OSError)):
            self.observe()
        self.assertTrue(link.is_symlink())

    def test_hardlinked_or_wrong_mode_private_file_is_not_repaired(self):
        path = self.plan()
        duplicate = path.with_name("duplicate")
        os.link(path, duplicate)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(path.stat().st_nlink, 2)
        duplicate.unlink()
        path.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(path.stat().st_mode & 0o7777, 0o644)

    def test_global_and_private_capture_budgets_are_enforced(self):
        self.plan(b'{"inert":"oversized for model budget"}\n')
        with patch.object(installer, "MAX_RECOVERY_PRIVATE_BYTES", 1), self.assertRaises(ReleaseContractError):
            self.observe()
        with patch.object(installer, "MAX_RECOVERY_SOURCE_BYTES", 1), self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertTrue((self.materials.state / "plans" / ("a" * 64 + ".json")).exists())

    def test_source_review_late_drift_and_pending_maintenance_block_without_cleanup(self):
        original = installer.review_transition
        calls = []
        def changed(*args, **kwargs):
            value = original(*args, **kwargs)
            calls.append(True)
            return {**value, "unexpected": True} if len(calls) == 2 else value
        with patch.object(installer, "review_transition", side_effect=changed), self.assertRaises(ReleaseContractError):
            self.observe()
        self.base.marker.write_bytes(b"pending evidence")
        self.base.marker.chmod(0o600)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(self.base.marker.read_bytes(), b"pending evidence")

    def test_current_retained_originals_are_included_without_widening_material_names(self):
        result, files = self.capture()
        for name in installer.PRIVATE_FILES:
            label = "/opt/sanq/deploy-state/installations/" + self.materials.identity + "/" + name
            self.assertIn(label, files)
            self.assertEqual(files[label], (self.materials.state / "installations" / self.materials.identity / name).read_bytes())
        self.assertEqual(len(installer.PRIVATE_FILES), 4)
        self.assertFalse(result["recoveryArchiveDurable"])

    def test_invalid_identity_and_no_public_recovery_install_or_restore_cli(self):
        with self.assertRaises(ReleaseContractError):
            installer._observe_installation_recovery_sources("../unknown")
        for command in ("recovery-sources", "restore", "install", "resume"):
            with patch("sys.stderr"), self.assertRaises(SystemExit):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
