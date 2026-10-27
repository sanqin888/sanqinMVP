"""Initial installed source observation: disposable files, no Docker/systemd/apply."""
import json
import os
import stat
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_private_install_materials as private
import test_minimal_delivery as fixtures
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstalledRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.materials = private.PrivateMaterialsTests(
            "test_success_retains_exact_inputs_privately_and_query_proves_no_host_install")
        self.materials.setUp()
        self.addCleanup(self.materials.doCleanups)
        self.materials.retain()
        self.case = self.materials.case
        self.runtime = self.materials.anchor / "runtime"
        self.runtime.mkdir(mode=0o755)
        for name, raw in self.case.old_files.items():
            path = self.runtime / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
            path.chmod(0o644)
        self.manifest = self.runtime / "runtime-release.json"
        self.manifest.write_text(json.dumps(installer._runtime_files(
            self.case.old_runtime, fixtures.OLD)[0], indent=2) + "\n")
        self.manifest.chmod(0o644)

    def observe(self):
        return installer._observe_installed_runtime(self.materials.identity, fetch=self.case.fetch)

    def image(self):
        return {str(p.relative_to(self.materials.anchor)):
                (p.read_bytes(), p.stat().st_ino, p.stat().st_mode)
                for p in self.materials.anchor.rglob("*") if p.is_file() and not p.is_symlink()}

    def test_matching_old_runtime_reports_only_partial_observation_and_never_reads_app_state(self):
        (self.runtime / ".env").write_bytes(b"PRIVATE_ENV_MUST_NOT_BE_READ")
        (self.runtime / ".sanq-release-state.json").write_bytes(b"not a second version authority")
        before = self.image()
        with patch.object(installer.os, "write", side_effect=AssertionError("observation wrote")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("observation synced")):
            result = self.observe()
        self.assertEqual(before, self.image())
        self.assertEqual(result["outcome"], "INSTALLED_RUNTIME_FILES_OBSERVED")
        self.assertTrue(result["installedRuntimeFilesObserved"])
        self.assertEqual(result["currentArchiveSourceSha"], fixtures.OLD)
        self.assertEqual(result["sourceSha"], fixtures.SHA)
        self.assertEqual(set(result["installedFiles"]), set(installer.RUNTIME_MEMBERS) | {"runtime-release.json"})
        self.assertEqual(result["installedManifestRawSha256"], installer._hash(self.manifest.read_bytes()))
        for key in ("installedBaselineObserved", "hostPreflightComplete", "readyToInstall", "canExecute",
                    "authorizedToMutateProduction", "operationSuccessProven",
                    "systemdObserved", "applicationConfigurationObserved", "containersObserved"):
            self.assertFalse(result[key])
        self.assertNotIn("PRIVATE_ENV", json.dumps(result))
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_each_of_the_seventeen_members_must_match_the_old_archive_not_the_target(self):
        for name in installer.RUNTIME_MEMBERS:
            path = self.runtime / name
            raw = path.read_bytes()
            with self.subTest(name=name):
                path.write_bytes(raw + b"changed")
                with self.assertRaises(ReleaseContractError):
                    self.observe()
                path.write_bytes(raw)
        path = self.runtime / "ops/release/deploy_release.py"
        path.write_bytes(self.case.runtime_files["ops/release/deploy_release.py"])
        with self.assertRaises(ReleaseContractError):
            self.observe()

    def test_manifest_raw_format_is_preserved_but_wrong_values_and_duplicate_keys_are_rejected(self):
        raw = self.manifest.read_bytes()
        value = json.loads(raw)
        for bad in ({**value, "schemaVersion": True}, {**value, "sourceSha": fixtures.SHA},
                    {**value, "ciRunId": 999}, {**value, "extra": False}):
            self.manifest.write_bytes(installer._json(bad))
            with self.assertRaises(ReleaseContractError):
                self.observe()
        self.manifest.write_bytes(raw.rstrip()[:-1] + b', "sourceSha": "' + fixtures.OLD.encode() + b'"}')
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.manifest.write_bytes(raw)
        self.assertEqual(self.observe()["installedManifestRawSha256"], installer._hash(raw))

    def test_missing_manifest_or_member_blocks_without_repair(self):
        for name in ("runtime-release.json", "docker-compose.yml"):
            path = self.runtime / name
            raw = path.read_bytes()
            path.unlink()
            with self.assertRaises(FileNotFoundError):
                self.observe()
            self.assertFalse(path.exists())
            path.write_bytes(raw)
            path.chmod(0o644)

    def test_runtime_and_nested_directory_symlinks_are_refused(self):
        for path in (self.runtime, self.runtime / "ops/runtime"):
            moved = path.with_name(path.name + "-saved")
            path.rename(moved)
            path.symlink_to(moved, target_is_directory=True)
            with self.assertRaises(OSError):
                self.observe()
            path.unlink()
            moved.rename(path)

    def test_group_writable_ancestors_or_files_block_and_are_not_repaired(self):
        for path, mode in ((self.runtime, 0o775), (self.runtime / "ops", 0o777),
                           (self.runtime / "docker-compose.yml", 0o664)):
            original = path.stat().st_mode
            path.chmod(mode)
            with self.assertRaises(ReleaseContractError):
                self.observe()
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), mode)
            path.chmod(stat.S_IMODE(original))

    def test_installed_file_hardlinks_and_dangling_symlinks_are_refused(self):
        path = self.runtime / "docker-compose.yml"
        other = self.runtime / "saved-copy"
        os.link(path, other)
        with self.assertRaises(ReleaseContractError):
            self.observe()
        other.unlink()
        path.rename(other)
        path.symlink_to(self.runtime / "missing")
        with self.assertRaises(OSError):
            self.observe()
        self.assertTrue(path.is_symlink())

    def test_oversized_or_empty_installed_member_is_rejected_before_read(self):
        path = self.runtime / "docker-compose.yml"
        for size in (0, installer.MAX_FILE + 1):
            with path.open("wb") as stream:
                stream.truncate(size)
            with self.assertRaises(ReleaseContractError):
                self.observe()

    def test_wrong_root_owner_group_or_privilege_is_refused(self):
        info = (self.runtime / "docker-compose.yml").stat()
        for changes in ({"st_uid": info.st_uid + 1}, {"st_gid": info.st_gid + 1},
                        {"st_mode": stat.S_IFREG | 0o4644}):
            values = {name: getattr(info, name) for name in ("st_mode", "st_uid", "st_gid", "st_nlink")}
            values.update(changes)
            with self.assertRaises(ReleaseContractError):
                installer._installed_info(SimpleNamespace(**values))
        with patch.object(installer.os, "geteuid", return_value=1000), self.assertRaises(ReleaseContractError):
            self.observe()

    def test_existing_helper_or_bootstrap_even_a_dangling_link_requires_separate_review(self):
        for name in (*installer.HELPERS, installer.BOOTSTRAP):
            path = self.runtime / name
            path.symlink_to(self.runtime / "missing")
            with self.subTest(name=name), self.assertRaises(ReleaseContractError):
                self.observe()
            self.assertTrue(path.is_symlink())
            path.unlink()

    def test_same_bytes_replacement_between_snapshots_does_not_reuse_an_old_observation(self):
        observe = installer._installed_runtime_snapshot
        calls = []
        def changing(*args):
            value = observe(*args)
            calls.append(True)
            if len(calls) == 1:
                path = self.runtime / "docker-compose.yml"
                temporary = path.with_name("replacement")
                temporary.write_bytes(path.read_bytes())
                temporary.chmod(0o644)
                os.replace(temporary, path)
            return value
        with patch.object(installer, "_installed_runtime_snapshot", side_effect=changing), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_late_source_failure_prevents_a_successful_observation(self):
        observe = installer._installed_runtime_snapshot
        def changing(*args):
            value = observe(*args)
            self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
            return value
        with patch.object(installer, "_installed_runtime_snapshot", side_effect=changing), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertFalse(list((self.materials.state / "maintenance").iterdir()))

    def test_both_original_locks_span_host_reads_and_contention_blocks(self):
        observe = installer._installed_runtime_snapshot
        def locked(*args):
            for acquire in (private.jobs._locked_directory, private.plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            return observe(*args)
        with patch.object(installer, "_installed_runtime_snapshot", side_effect=locked):
            self.observe()
        for acquire in (private.jobs._locked_directory, private.plans.preparation_lock):
            with acquire(), self.assertRaises(ReleaseContractError):
                self.observe()

    def test_existing_or_late_maintenance_evidence_is_preserved_and_blocks(self):
        marker = self.materials.state / "maintenance/active.json"
        marker.write_bytes(b"original incident evidence")
        with self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"original incident evidence")
        marker.unlink()
        observe = installer._installed_runtime_snapshot
        def changing(*args):
            value = observe(*args)
            if not marker.exists():
                marker.write_bytes(b"late incident evidence")
            return value
        with patch.object(installer, "_installed_runtime_snapshot", side_effect=changing), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(marker.read_bytes(), b"late incident evidence")

    def test_invalid_or_missing_retention_is_read_only_and_never_provisions(self):
        before = self.image()
        for identity in ("../runtime", "f" * 64):
            with self.assertRaises((ReleaseContractError, OSError)):
                installer._observe_installed_runtime(identity, fetch=self.case.fetch)
        self.assertEqual(before, self.image())
        self.assertFalse((self.materials.state / "installations" / ("f" * 64)).exists())


    def test_replacement_during_file_read_cannot_return_a_torn_baseline(self):
        read = installer.os.read
        path = self.runtime / "docker-compose.yml"
        changed = []
        def racing(fd, count):
            raw = read(fd, count)
            if not changed:
                changed.append(True)
                path.write_bytes(b"changed while reading")
            return raw
        with patch.object(installer.os, "read", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            parent = os.open(self.materials.anchor, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with installer._installed_directory(parent, "runtime") as root:
                    installer._installed_read(root, "docker-compose.yml", installer.MAX_FILE)
            finally:
                os.close(parent)

    def test_directory_replacement_is_detected_before_snapshot_returns(self):
        read = installer._installed_read
        changed = []
        def racing(*args):
            value = read(*args)
            if not changed:
                changed.append(True)
                self.runtime.rename(self.runtime.with_name("runtime-original"))
                self.runtime.mkdir(mode=0o755)
            return value
        with patch.object(installer, "_installed_read", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()

    def test_late_unfinished_job_blocks_without_modifying_the_job(self):
        snapshot = installer._installed_runtime_snapshot
        job = self.materials.state / "jobs" / ("a" * 64 + ".json")
        raw = installer._json(self.materials.job_record(phase="REVALIDATING"))
        def racing(*args):
            value = snapshot(*args)
            job.write_bytes(raw)
            job.chmod(0o600)
            return value
        with patch.object(installer, "_installed_runtime_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(job.read_bytes(), raw)

    def test_late_retention_record_change_invalidates_the_observation_without_repair(self):
        snapshot = installer._installed_runtime_snapshot
        record = self.materials.target / "retained.json"
        raw = record.read_bytes() + b" "
        def racing(*args):
            value = snapshot(*args)
            record.write_bytes(raw)
            return value
        with patch.object(installer, "_installed_runtime_snapshot", side_effect=racing), \
             self.assertRaises(ReleaseContractError):
            self.observe()
        self.assertEqual(record.read_bytes(), raw)


    def test_no_installed_observation_or_apply_cli_is_exposed(self):
        for command in ("observe-installed", "install", "apply"):
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                installer.main([command])


if __name__ == "__main__":
    unittest.main()
