"""D2-1 root-private material handoff. Disposable files/real locks, no host install."""
import contextlib
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_minimal_delivery as fixtures
import install_minimal_executor as installer
import release_job as jobs
import deployment_plan_store as plans
from release_contract import ReleaseContractError


class PrivateMaterialsTests(unittest.TestCase):
    def setUp(self):
        self.case = fixtures.DeliveryFixture(
            "test_inert_pack_is_deterministic_and_verifies_exact_inventory_without_executing_sources")
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.kit = self.case.pack()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.anchor = Path(self.temp.name)
        self.anchor.chmod(0o700)
        self.state = self.anchor / "deploy-state"
        self.uid, self.gid = os.geteuid(), os.getegid()
        self.real_parent = installer._state_parent
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        # Only the fixed anchor and modeled root identity are redirected.
        # All files, permissions, OS locks, fsync and readbacks below remain real.
        self.stack.enter_context(patch.object(installer, "_state_parent",
            side_effect=lambda: os.open(self.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)))
        self.stack.enter_context(patch.object(installer, "PRIVATE_OWNER_UID", self.uid))
        self.stack.enter_context(patch.object(installer, "PRIVATE_GROUP_GID", self.gid))
        self.stack.enter_context(patch.object(installer.os, "geteuid", return_value=0))
        self.stack.enter_context(patch.object(installer.os, "fstatvfs",
            return_value=SimpleNamespace(f_bavail=8 * 1024**3, f_frsize=1)))
        self.stack.enter_context(patch.object(plans, "OWNER_UID", self.uid))
        self.stack.enter_context(patch.object(plans, "PLAN_DIR", self.state / "plans"))
        self.stack.enter_context(patch.object(jobs, "JOB_DIR", self.state / "jobs"))
        self.identity = installer._retention_record(self.kit, fixtures.SHA,
            self.case.old_runtime, fixtures.OLD)["retentionId"]
        self.target = self.state / "installations" / self.identity

    def retain(self):
        return installer._retain_verified_materials(self.kit, fixtures.SHA,
            self.case.old_runtime, fixtures.OLD, fetch=self.case.fetch)

    def inspect(self):
        return installer._inspect_private_materials(self.identity, fetch=self.case.fetch)

    def provision(self):
        with installer._private_session(create=True):
            pass

    def assert_no_install_effect(self):
        if self.state.exists():
            self.assertFalse(list((self.state / "maintenance").iterdir()))
        self.assertFalse((self.anchor / "runtime").exists())
        self.assertFalse((self.anchor / "systemd").exists())

    def job_record(self, *, phase="READY", **changes):
        value = {"schemaVersion": 1, "kind": "sanq-read-only-precheck",
            "planId": "a" * 64, "attemptId": "b" * 32, "phase": phase,
            "createdAt": "2026-10-27T00:00:00Z", "updatedAt": "2026-10-27T00:00:01Z",
            "errorCode": "PRECHECK_FAILED" if phase == "BLOCKED" else None, "canExecute": False}
        value.update(changes)
        return value

    def save_job(self, value):
        path = self.state / "jobs" / ("a" * 64 + ".json")
        path.write_bytes(installer._json(value))
        path.chmod(0o600)
        return path

    def test_success_retains_exact_inputs_privately_and_query_proves_no_host_install(self):
        result = self.retain()
        self.assertEqual(result["outcome"], "MATERIALS_RETAINED")
        self.assertEqual(result["retentionId"], self.identity)
        self.assertEqual(set(p.name for p in self.target.iterdir()), installer.PRIVATE_FILES)
        self.assertEqual((self.target / "delivery-kit.tar.gz").read_bytes(), self.kit)
        self.assertEqual((self.target / "current-runtime-archive.tar.gz").read_bytes(), self.case.old_runtime)
        for path in (self.state, *(self.state / name for name in ("plans", "jobs", "maintenance", "installations")), self.target):
            self.assertEqual((path.stat().st_uid, path.stat().st_gid, stat.S_IMODE(path.stat().st_mode)),
                             (self.uid, self.gid, 0o700))
        for path in self.target.iterdir():
            self.assertEqual((path.stat().st_uid, path.stat().st_gid, stat.S_IMODE(path.stat().st_mode), path.stat().st_nlink),
                             (self.uid, self.gid, 0o600, 1))
        observed = self.inspect()
        self.assertEqual(observed["outcome"], "PRIVATE_MATERIALS_OBSERVED")
        self.assertFalse(observed["operationSuccessProven"])
        for key in ("hostPreflightComplete", "installedBaselineObserved", "readyToInstall",
                    "canExecute", "authorizedToMutateProduction"):
            self.assertFalse(result[key])
            self.assertFalse(observed[key])
        self.assert_no_install_effect()

    def test_original_job_and_plan_locks_span_every_material_write_and_inodes_survive(self):
        self.provision()
        required = {(p.stat().st_dev, p.stat().st_ino) for p in (
            self.anchor, self.state, *(self.state / n for n in ("jobs", "plans", "maintenance", "installations")))}
        flushed, sync = set(), installer.os.fsync
        def durable(fd):
            info = os.fstat(fd)
            if stat.S_ISDIR(info.st_mode):
                flushed.add((info.st_dev, info.st_ino))
            return sync(fd)
        write = installer._private_write
        def locked(root, name, raw):
            for acquire in (jobs._locked_directory, plans.preparation_lock):
                with self.assertRaises(ReleaseContractError):
                    with acquire():
                        pass
            return write(root, name, raw)
        with patch.object(installer, "_private_write", side_effect=locked), \
             patch.object(installer.os, "fsync", side_effect=durable):
            self.retain()
        self.assertTrue(required <= flushed)
        before = [(p.stat().st_dev, p.stat().st_ino) for p in (
            self.state / "jobs/.release.lock", self.state / "plans/.prepare.lock")]
        self.inspect()
        after = [(p.stat().st_dev, p.stat().st_ino) for p in (
            self.state / "jobs/.release.lock", self.state / "plans/.prepare.lock")]
        self.assertEqual(before, after)

    def test_root_required_before_source_reads_or_namespace_creation(self):
        with patch.object(installer.os, "geteuid", return_value=1000), \
             patch.object(installer, "review_transition") as review, self.assertRaises(ReleaseContractError):
            self.retain()
        review.assert_not_called()
        self.assertFalse(self.state.exists())

    def test_failed_source_or_outside_tool_scope_never_creates_namespace(self):
        self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.state.exists())
        self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "success"
        old = {**self.case.old_files, "docker-compose.yml": b"other runtime behavior"}
        self.case.old_runtime = self.case.archive(old, fixtures.OLD, 44, 43)
        self.case.add_runtime(fixtures.OLD, self.case.old_runtime, 44, 43)
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.state.exists())

    def test_low_destination_storage_blocks_new_writes_but_not_readonly_material_query(self):
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=1, f_frsize=1)):
            with self.assertRaises(ReleaseContractError):
                self.retain()
        self.assertFalse(self.state.exists())
        self.retain()
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=1, f_frsize=1)):
            self.assertEqual(self.inspect()["outcome"], "PRIVATE_MATERIALS_OBSERVED")

    def test_existing_wrong_directory_mode_is_refused_without_repair(self):
        self.provision()
        path = self.state / "plans"
        path.chmod(0o755)
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o755)
        self.assertFalse(self.target.exists())

    def test_state_or_fixed_child_symlink_is_not_followed(self):
        outside = self.anchor / "outside"
        outside.mkdir(mode=0o700)
        self.state.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.retain()
        self.assertFalse(list(outside.iterdir()))
        self.state.unlink()
        self.provision()
        # Replace only this disposable namespace to model an unsafe existing child.
        (self.state / "plans/.prepare.lock").unlink()
        (self.state / "plans").rmdir()
        (self.state / "plans").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.retain()
        self.assertFalse(list(outside.iterdir()))

    def test_wrong_owner_or_group_is_not_silently_changed(self):
        self.provision()
        for attribute, value in (("PRIVATE_OWNER_UID", self.uid + 1), ("PRIVATE_GROUP_GID", self.gid + 1)):
            with patch.object(installer, attribute, value), self.assertRaises(ReleaseContractError):
                self.retain()
        self.assertEqual((self.state.stat().st_uid, self.state.stat().st_gid), (self.uid, self.gid))
        self.assertFalse(self.target.exists())

    def test_competing_original_job_or_plan_lock_blocks_before_retention_directory(self):
        self.provision()
        for acquire in (jobs._locked_directory, plans.preparation_lock):
            with acquire(), self.assertRaises(ReleaseContractError):
                self.retain()
        self.assertFalse(self.target.exists())
        self.assert_no_install_effect()

    def test_hardlinked_original_lock_is_refused_and_never_unlinked(self):
        self.provision()
        path = self.state / "jobs/.release.lock"
        other = self.anchor / "lock-copy"
        os.link(path, other)
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(path.stat().st_nlink, 2)
        self.assertEqual(path.stat().st_ino, other.stat().st_ino)
        self.assertFalse(self.target.exists())

    def test_maintenance_residual_blocks_without_overwrite_or_clear(self):
        self.provision()
        for name in ("active.json", "partial.tmp"):
            path = self.state / "maintenance" / name
            path.write_bytes(b"retained evidence")
            with self.assertRaises(ReleaseContractError):
                self.retain()
            self.assertEqual(path.read_bytes(), b"retained evidence")
            path.unlink()
        self.assertFalse(self.target.exists())

    def test_finished_native_job_records_remain_valid_and_are_preserved(self):
        self.provision()
        for phase in ("READY", "BLOCKED"):
            value = self.job_record(phase=phase)
            # Real original job schema/canonical encoder, not a second authority.
            raw = jobs._bytes(value)
            path = self.save_job(value)
            with installer._private_session() as folders:
                installer._idle_for_materials(folders)
            self.assertEqual(path.read_bytes(), raw)
        self.retain()
        self.assertEqual(path.read_bytes(), raw)

    def test_unfinished_bad_shape_clock_or_error_jobs_block_before_retention(self):
        self.provision()
        for changes in ({"phase": "REVALIDATING"}, {"canExecute": True}, {"schemaVersion": True},
                        {"attemptId": "x"}, {"updatedAt": "2026-10-26T00:00:00Z"},
                        {"createdAt": "not a time"}, {"errorCode": "PRECHECK_FAILED"}):
            path = self.save_job(self.job_record(**changes))
            before = path.read_bytes()
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                self.retain()
            self.assertEqual(path.read_bytes(), before)
        self.assertFalse(self.target.exists())

    def test_unknown_job_filename_or_partial_bytes_are_not_deleted(self):
        self.provision()
        path = self.state / "jobs/partial.tmp"
        path.write_bytes(b"partial")
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(path.read_bytes(), b"partial")
        path.unlink()
        path = self.save_job(self.job_record())
        path.write_bytes(b"partial JSON")
        with self.assertRaises(ValueError):
            self.retain()
        self.assertEqual(path.read_bytes(), b"partial JSON")

    def test_duplicate_retention_is_not_overwritten_or_assumed_replayable(self):
        self.retain()
        before = {p.name: (p.stat().st_ino, p.read_bytes()) for p in self.target.iterdir()}
        with self.assertRaises(FileExistsError):
            self.retain()
        self.assertEqual(before, {p.name: (p.stat().st_ino, p.read_bytes()) for p in self.target.iterdir()})

    def test_copy_unknown_preserves_partial_files_and_no_completion_marker(self):
        write = installer._private_write
        def unknown(root, name, raw):
            write(root, name, raw)
            if name == "delivery-kit.tar.gz":
                raise OSError("copy durability unknown")
        with patch.object(installer, "_private_write", side_effect=unknown), self.assertRaises(OSError):
            self.retain()
        self.assertEqual(set(p.name for p in self.target.iterdir()), {"retaining.json", "delivery-kit.tar.gz"})
        self.assertEqual((self.target / "delivery-kit.tar.gz").read_bytes(), self.kit)
        with self.assertRaises(ReleaseContractError):
            self.inspect()
        with self.assertRaises(FileExistsError):
            self.retain()
        self.assert_no_install_effect()

    def test_late_source_failure_leaves_copies_but_never_commits_complete_record(self):
        review, count = installer.review_transition, 0
        def changed(*args, **kwargs):
            nonlocal count
            count += 1
            if count == 2:
                self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
            return review(*args, **kwargs)
        with patch.object(installer, "review_transition", side_effect=changed), self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(count, 2)
        self.assertFalse((self.target / "retained.json").exists())
        self.assertEqual((self.target / "current-runtime-archive.tar.gz").read_bytes(), self.case.old_runtime)
        self.assert_no_install_effect()

    def test_final_write_unknown_can_only_be_observed_not_replayed_or_called_installed(self):
        write = installer._private_write
        def unknown(root, name, raw):
            write(root, name, raw)
            if name == "retained.json":
                raise OSError("completion durability unknown")
        with patch.object(installer, "_private_write", side_effect=unknown), self.assertRaises(OSError):
            self.retain()
        self.assertEqual(set(p.name for p in self.target.iterdir()), installer.PRIVATE_FILES)
        observed = self.inspect()
        self.assertFalse(observed["operationSuccessProven"])
        self.assertFalse(observed["hostPreflightComplete"])
        with self.assertRaises(FileExistsError):
            self.retain()
        self.assert_no_install_effect()

    def test_namespace_sync_unknown_never_claims_material_or_host_completion(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("directory sync unknown")):
            with self.assertRaises(OSError):
                self.retain()
        self.assertTrue(self.state.exists())
        self.assertFalse(self.target.exists())

    def test_tampered_record_or_material_bytes_are_rejected_by_readonly_query(self):
        self.retain()
        path = self.target / "retained.json"
        original = path.read_bytes()
        value = json.loads(original)
        value["readyToInstall"] = True
        path.write_bytes(installer._json(value))
        with self.assertRaises(ReleaseContractError):
            self.inspect()
        path.write_bytes(original)
        path = self.target / "delivery-kit.tar.gz"
        path.write_bytes(path.read_bytes() + b"changed")
        with self.assertRaises(ReleaseContractError):
            self.inspect()

    def test_private_file_links_and_leftovers_are_never_adopted(self):
        self.retain()
        path = self.target / "delivery-kit.tar.gz"
        data = path.read_bytes()
        outside = self.anchor / "other"
        outside.write_bytes(data)
        path.unlink()
        path.symlink_to(outside)
        with self.assertRaises(OSError):
            self.inspect()
        path.unlink()
        os.link(outside, path)
        with self.assertRaises(ReleaseContractError):
            self.inspect()
        path.unlink()
        path.write_bytes(data)
        path.chmod(0o600)
        (self.target / "extra.tmp").write_bytes(b"partial")
        with self.assertRaises(ReleaseContractError):
            self.inspect()

    def test_query_refreshes_source_and_does_not_clear_separate_maintenance_evidence(self):
        self.retain()
        marker = self.state / "maintenance/active.json"
        marker.write_bytes(b"other maintenance")
        self.assertEqual(self.inspect()["outcome"], "PRIVATE_MATERIALS_OBSERVED")
        self.assertEqual(marker.read_bytes(), b"other maintenance")
        self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
        with self.assertRaises(ReleaseContractError):
            self.inspect()
        self.assertEqual(marker.read_bytes(), b"other maintenance")

    def test_missing_or_invalid_query_identity_never_provisions_or_follows_a_path(self):
        with self.assertRaises(FileNotFoundError):
            self.inspect()
        self.assertFalse(self.state.exists())
        for identity in ("../other", "z" * 64, None, True):
            with self.assertRaises(ReleaseContractError):
                installer._inspect_private_materials(identity, fetch=self.case.fetch)
        self.assertFalse(self.state.exists())

    def test_private_write_allowlist_and_short_write_failure_preserve_actual_file(self):
        self.provision()
        with installer._private_session() as folders:
            root = folders["installations"]
            with self.assertRaises(ReleaseContractError):
                installer._private_write(root, "../escape", b"fixture")
            with self.assertRaises(ReleaseContractError):
                installer._private_read(root, "/etc/passwd", 100)
            with patch.object(installer.os, "write", return_value=0), self.assertRaises(ReleaseContractError):
                installer._private_write(root, "retaining.json", b"fixture")
        self.assertEqual((self.state / "installations/retaining.json").read_bytes(), b"")

    def test_no_root_handoff_or_host_apply_cli_is_exposed(self):
        for name in ("retain", "install", "apply", "restore"):
            with patch("sys.stderr", new_callable=io.StringIO), self.assertRaises(SystemExit):
                installer.main([name])

    def test_fixed_anchor_walk_requires_nofollow_root_owned_nonwritable_components(self):
        info = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0, st_gid=0)
        with patch.object(installer, "PRIVATE_OWNER_UID", 0), patch.object(installer, "PRIVATE_GROUP_GID", 0), \
             patch.object(installer.os, "open", side_effect=[10, 11, 12]) as opened, \
             patch.object(installer.os, "close") as closed, patch.object(installer.os, "fstat", return_value=info):
            self.assertEqual(self.real_parent(), 12)
        self.assertEqual([call.args[0] for call in opened.call_args_list], ["/", "opt", "sanq"])
        self.assertTrue(all(call.args[1] & os.O_NOFOLLOW and call.args[1] & os.O_DIRECTORY
                            for call in opened.call_args_list))
        self.assertEqual([call.args[0] for call in closed.call_args_list], [10, 11])
        info.st_mode = stat.S_IFDIR | 0o777
        with patch.object(installer, "PRIVATE_OWNER_UID", 0), patch.object(installer, "PRIVATE_GROUP_GID", 0), \
             patch.object(installer.os, "open", side_effect=[20, 21]), patch.object(installer.os, "close") as closed, \
             patch.object(installer.os, "fstat", side_effect=[
                 SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0, st_gid=0), info]), self.assertRaises(ReleaseContractError):
            self.real_parent()
        self.assertEqual([call.args[0] for call in closed.call_args_list], [20, 21])


if __name__ == "__main__":
    unittest.main()
