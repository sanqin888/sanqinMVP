"""Source-bound first-install write set and real disposable per-file durability operations."""
import copy
import json
import os
import stat
import sys
import tarfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_minimal_delivery as delivery
import test_private_install_materials as private
import install_minimal_executor as installer
from release_contract import ReleaseContractError


class InstallationToolWriteSetTests(unittest.TestCase):
    def setUp(self):
        self.base = delivery.DeliveryFixture()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.kit = self.base.pack()
        old_manifest, old = installer._runtime_files(self.base.old_runtime, delivery.OLD)
        self.observed = {path: (raw, (1, index + 100, len(raw), 1, 1,
            installer.PRIVATE_OWNER_UID, installer.PRIVATE_GROUP_GID, stat.S_IFREG | 0o644, 1))
            for index, (path, raw) in enumerate({**old, "runtime-release.json": installer._json(old_manifest)}.items())}

    def review(self, **kwargs):
        return installer._installation_tool_write_set(kwargs.get("kit", self.kit), delivery.SHA,
            self.base.old_runtime, delivery.OLD, kwargs.get("observed", self.observed),
            fetch=kwargs.get("fetch", self.base.fetch))

    def test_exact_order_helpers_then_runtime_and_original_target_manifest_last(self):
        plan, targets = self.review()
        rows = plan["operations"]
        self.assertEqual([row["path"] for row in rows], list(installer.INSTALL_TOOL_PATHS))
        self.assertEqual(len(rows), 27)
        self.assertEqual([row["action"] for row in rows[:9]], ["create"] * 9)
        self.assertEqual(rows[-1]["path"], "runtime-release.json")
        self.assertEqual(rows[-1]["stage"], "MANIFEST")
        self.assertEqual(set(targets), set(installer.INSTALL_TOOL_PATHS))
        self.assertNotIn(installer.BOOTSTRAP, targets)
        self.assertNotIn("dropins", targets)
        self.assertEqual([r["path"] for r in rows if r["action"] == "replace"],
                         ["ops/release/deploy_release.py", "runtime-release.json"])
        target_manifest, _ = installer._runtime_files(self.base.runtime, delivery.SHA)
        self.assertEqual(json.loads(targets["runtime-release.json"]), target_manifest)
        for row in rows:
            self.assertEqual(row["afterSha256"], installer._hash(targets[row["path"]]))
            self.assertEqual(row["bytes"], len(targets[row["path"]]))

    def test_source_plan_is_not_host_or_restore_authority_and_private_bytes_are_separate(self):
        plan, targets = self.review()
        for key in ("installedBaselineObserved", "restoreProven", "readyToInstall", "canExecute", "authorizedToMutateProduction"):
            self.assertIs(plan[key], False)
        self.assertTrue(plan["restoreValidationDeferred"])
        self.assertTrue(plan["requiresSnapshotAndOffhostConfirmation"])
        self.assertTrue(plan["requiresOwnedInstallationFlow"])
        self.assertNotIn("TARGET_MUST_NOT_EXECUTE", json.dumps(plan))
        self.assertIn(b"TARGET_MUST_NOT_EXECUTE", targets[installer.HELPERS[0]])
        self.assertEqual(len(plan["writeSetSha256"]), 64)

    def test_raw_installed_manifest_whitespace_and_original_modes_are_bound_without_normalizing(self):
        value = copy.deepcopy(self.observed)
        path = "runtime-release.json"
        raw = json.dumps(json.loads(value[path][0]), indent=2).encode() + b"\n"
        metadata = list(value[path][1])
        metadata[2], metadata[7] = len(raw), stat.S_IFREG | 0o640
        value[path] = raw, tuple(metadata)
        plan, _ = self.review(observed=value)
        row = plan["operations"][-1]
        self.assertEqual(row["beforeSha256"], installer._hash(raw))
        self.assertEqual(row["expectedIdentity"], metadata)
        self.assertEqual(row["mode"], 0o640)

    def test_changed_non_tool_member_requires_platform_review(self):
        self.base.runtime_files["docker-compose.yml"] += b"changed\n"
        self.base.sources["docker-compose.yml"] = self.base.runtime_files["docker-compose.yml"]
        self.base.runtime = self.base.archive(self.base.runtime_files, delivery.SHA, 40, 42)
        self.base.add_runtime(delivery.SHA, self.base.runtime, 40, 42)
        self.base.refresh_sources()
        self.kit = self.base.pack()
        with self.assertRaisesRegex(ReleaseContractError, "platform scope"):
            self.review()

    def test_full_original_inventory_bytes_metadata_owner_and_native_types_are_required(self):
        for mutate in (lambda value: value.pop("docker-compose.yml"),
                       lambda value: value.update({installer.HELPERS[0]: value["docker-compose.yml"]}),
                       lambda value: value.update({"docker-compose.yml": (b"wrong", value["docker-compose.yml"][1])}),
                       lambda value: value.update({"docker-compose.yml": ("not bytes", value["docker-compose.yml"][1])})):
            value = copy.deepcopy(self.observed)
            mutate(value)
            with self.subTest(mutate=mutate), self.assertRaises(ReleaseContractError):
                self.review(observed=value)
        for position, wrong in ((2, True), (5, 999999), (7, stat.S_IFREG | 0o666), (8, 2)):
            value = copy.deepcopy(self.observed)
            raw, metadata = value["docker-compose.yml"]
            changed = list(metadata)
            changed[position] = wrong
            value["docker-compose.yml"] = raw, tuple(changed)
            with self.subTest(position=position), self.assertRaises(ReleaseContractError):
                self.review(observed=value)

    def test_unavailable_source_or_tampered_kit_cannot_become_a_write_set(self):
        with self.assertRaises((ReleaseContractError, ValueError, tarfile.TarError)):
            self.review(kit=b"not an archive")
        def unavailable(_):
            raise ReleaseContractError("modeled unavailable source")
        with self.assertRaises(ReleaseContractError):
            self.review(fetch=unavailable)
        with self.assertRaises(ReleaseContractError):
            self.review(fetch=None)

    def test_plan_factory_has_no_host_io_or_target_execution_and_is_deterministic(self):
        before = copy.deepcopy(self.observed)
        with patch.object(installer.os, "open", side_effect=AssertionError("host open")), \
             patch.object(installer.subprocess, "Popen", side_effect=AssertionError("process")):
            first = self.review()
            self.assertEqual(first, self.review())
        self.assertEqual(self.observed, before)


class InstallationToolFileWriteTests(unittest.TestCase):
    def setUp(self):
        self.base = private.PrivateMaterialsTests()
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.parent = self.base.anchor / "runtime/ops/release"
        self.parent.mkdir(parents=True)
        self.parent.chmod(0o755)
        self.fd = os.open(self.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.addCleanup(os.close, self.fd)
        self.parent_identity = installer._directory_identity(os.fstat(self.fd))
        self.path = "ops/release/deploy_release.py"
        self.old, self.new = b"ORIGINAL_TOOL\n", b"REVIEWED_NEW_TOOL\n"
        target = self.parent / Path(self.path).name
        target.write_bytes(self.old)
        target.chmod(0o640)
        self.original_identity = installer._installation_tool_member_read(self.fd, self.path)[1]
        self.checks = []

    def check_context(self):
        self.checks.append(True)

    def pending(self, path=None):
        return self.parent / (".sanq-install-" + Path(self.path if path is None else path).name + ".pending")

    def write(self, path=None, **kwargs):
        path = self.path if path is None else path
        helper = path in installer.HELPERS
        return installer._write_installation_tool_member(self.fd, path,
            kwargs.get("before", None if helper else self.old), kwargs.get("after", self.new),
            expected_identity=kwargs.get("identity", None if helper else self.original_identity),
            parent_identity=kwargs.get("parent_identity", self.parent_identity),
            check_context=kwargs.get("check_context", self.check_context),
            deadline=kwargs.get("deadline", installer.time.monotonic() + 60))

    def test_replacement_fsyncs_before_rename_and_directory_then_reads_exact_content_mode_and_new_inode(self):
        events = []
        sync, replace = installer.os.fsync, installer.os.replace
        def fsync(fd):
            events.append("directory-sync" if fd == self.fd else "file-sync")
            sync(fd)
        def rename(*args, **kwargs):
            events.append("replace")
            return replace(*args, **kwargs)
        with patch.object(installer.os, "fsync", side_effect=fsync), patch.object(installer.os, "replace", side_effect=rename):
            result = self.write()
        self.assertEqual(events, ["file-sync", "replace", "directory-sync"])
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.new)
        self.assertEqual(stat.S_IMODE((self.parent / Path(self.path).name).stat().st_mode), 0o640)
        self.assertNotEqual(result["identity"][1], self.original_identity[1])
        self.assertTrue(result["fileDurable"])
        self.assertFalse(result["canExecute"])
        self.assertFalse(self.pending().exists())
        self.assertEqual(len(self.checks), 3)

    def test_helper_is_exclusive_created_with_file_and_both_directory_syncs_no_target_import(self):
        path = installer.HELPERS[0]
        events = []
        sync, link, unlink = installer.os.fsync, installer.os.link, installer.os.unlink
        def fsync(fd):
            events.append("directory-sync" if fd == self.fd else "file-sync")
            sync(fd)
        def publish(*args, **kwargs):
            events.append("link")
            return link(*args, **kwargs)
        def remove(*args, **kwargs):
            events.append("unlink-pending")
            return unlink(*args, **kwargs)
        with patch.object(installer.os, "fsync", side_effect=fsync), \
             patch.object(installer.os, "link", side_effect=publish), patch.object(installer.os, "unlink", side_effect=remove):
            result = self.write(path)
        self.assertEqual(events, ["file-sync", "link", "directory-sync", "unlink-pending", "directory-sync"])
        target = self.parent / Path(path).name
        self.assertEqual(target.read_bytes(), self.new)
        self.assertEqual((stat.S_IMODE(target.stat().st_mode), target.stat().st_nlink), (0o644, 1))
        self.assertTrue(result["fileDurable"])

    def test_unchanged_member_only_verifies_without_writes_or_fsync(self):
        with patch.object(installer.os, "write", side_effect=AssertionError("write")), \
             patch.object(installer.os, "fsync", side_effect=AssertionError("fsync")), \
             patch.object(installer.os, "replace", side_effect=AssertionError("replace")):
            result = self.write(after=self.old)
        self.assertFalse(result["changed"])
        self.assertEqual(result["outcome"], "TOOL_FILE_UNCHANGED_VERIFIED")
        self.assertEqual(len(self.checks), 2)

    def test_existing_helper_is_never_overwritten_or_adopted(self):
        path = installer.HELPERS[0]
        target = self.parent / Path(path).name
        target.write_bytes(b"existing helper")
        target.chmod(0o644)
        with self.assertRaises(ReleaseContractError):
            self.write(path)
        self.assertEqual(target.read_bytes(), b"existing helper")
        self.assertFalse(self.pending(path).exists())

    def test_only_fixed_paths_and_two_runtime_changes_or_manifest_are_writable(self):
        for path in ("../release_contract.py", ".env", installer.BOOTSTRAP, "/etc/passwd", "ops/backup/backup-db.sh"):
            with self.subTest(path=path), self.assertRaises(ReleaseContractError):
                self.write(path)
        self.assertFalse(self.pending().exists())

    def test_input_native_types_context_parent_identity_deadline_and_limits_fail_before_writing(self):
        for kwargs in ({"before": None}, {"after": "not bytes"}, {"after": b""},
                       {"after": b"x" * (installer.MAX_FILE + 1)}, {"identity": None},
                       {"parent_identity": ()}, {"check_context": None},
                       {"deadline": True}, {"deadline": float("nan")}, {"deadline": float("inf")},
                       {"deadline": installer.time.monotonic() - 1},
                       {"deadline": installer.time.monotonic() + 1000}):
            with self.subTest(keys=list(kwargs)), self.assertRaises(ReleaseContractError):
                self.write(**kwargs)
        self.assertFalse(self.pending().exists())

    def test_changed_original_identity_or_bytes_and_wrong_parent_cannot_be_overwritten(self):
        with self.assertRaises(ReleaseContractError):
            self.write(before=b"wrong")
        with self.assertRaises(ReleaseContractError):
            self.write(parent_identity=tuple([self.parent_identity[0], self.parent_identity[1] + 1, *self.parent_identity[2:]]))
        (self.parent / Path(self.path).name).write_bytes(b"EXTERNAL_CHANGE\n")
        with self.assertRaises(ReleaseContractError):
            self.write()
        self.assertFalse(self.pending().exists())

    def test_symlink_hardlink_and_writable_original_are_rejected(self):
        target = self.parent / Path(self.path).name
        target.chmod(0o666)
        with self.assertRaises(ReleaseContractError):
            self.write()
        target.chmod(0o640)
        other = self.parent / "other"
        os.link(target, other)
        with self.assertRaises(ReleaseContractError):
            self.write()
        other.unlink()
        target.unlink()
        target.symlink_to(other)
        with self.assertRaises((ReleaseContractError, OSError)):
            self.write()
        self.assertFalse(self.pending().exists())

    def test_pending_file_blocks_both_new_write_and_unchanged_verification(self):
        self.pending().write_bytes(b"unknown previous attempt")
        for after in (self.new, self.old):
            with self.subTest(after=after), self.assertRaises(ReleaseContractError):
                self.write(after=after)
        self.assertEqual(self.pending().read_bytes(), b"unknown previous attempt")

    def test_real_short_writes_are_completed_and_zero_progress_keeps_pending_without_retry(self):
        write = installer.os.write
        with patch.object(installer.os, "write", side_effect=lambda fd, data: write(fd, data[:2])):
            self.assertTrue(self.write()["fileDurable"])
        path = installer.HELPERS[0]
        with patch.object(installer.os, "write", return_value=0), self.assertRaisesRegex(ReleaseContractError, "TOOL_WRITE_UNCONFIRMED"):
            self.write(path)
        self.assertTrue(self.pending(path).exists())
        self.assertFalse((self.parent / Path(path).name).exists())
        with self.assertRaises(ReleaseContractError):
            self.write(path)

    def test_file_sync_failure_keeps_original_and_pending(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("modeled file sync failure")), \
             self.assertRaisesRegex(ReleaseContractError, "TOOL_WRITE_UNCONFIRMED"):
            self.write()
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.old)
        self.assertTrue(self.pending().exists())

    def test_rename_failure_keeps_original_and_pending(self):
        with patch.object(installer.os, "replace", side_effect=OSError("modeled rename failure")), \
             self.assertRaisesRegex(ReleaseContractError, "TOOL_WRITE_UNCONFIRMED"):
            self.write()
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.old)
        self.assertTrue(self.pending().exists())

    def test_directory_sync_failure_after_rename_keeps_new_file_and_does_not_rollback(self):
        sync = installer.os.fsync
        def failed(fd):
            if fd == self.fd:
                raise OSError("modeled directory sync failure")
            return sync(fd)
        with patch.object(installer.os, "fsync", side_effect=failed), self.assertRaises(ReleaseContractError):
            self.write()
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.new)
        self.assertFalse(self.pending().exists())

    def test_helper_creation_race_cannot_replace_competing_destination(self):
        path = installer.HELPERS[0]
        link = installer.os.link
        target = self.parent / Path(path).name
        def racing(*args, **kwargs):
            target.write_bytes(b"competing destination")
            return link(*args, **kwargs)
        with patch.object(installer.os, "link", side_effect=racing), self.assertRaises(ReleaseContractError):
            self.write(path)
        self.assertEqual(target.read_bytes(), b"competing destination")
        self.assertTrue(self.pending(path).exists())

    def test_context_recheck_catches_original_mutation_before_publication(self):
        calls = []
        def context():
            calls.append(True)
            if len(calls) == 2:
                (self.parent / Path(self.path).name).write_bytes(b"changed after staging")
        with self.assertRaises(ReleaseContractError):
            self.write(check_context=context)
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), b"changed after staging")
        self.assertTrue(self.pending().exists())

    def test_context_recheck_catches_temporary_mutation_before_publication(self):
        calls = []
        def context():
            calls.append(True)
            if len(calls) == 2:
                self.pending().write_bytes(b"changed temporary")
        with self.assertRaises(ReleaseContractError):
            self.write(check_context=context)
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.old)
        self.assertTrue(self.pending().exists())

    def test_context_failure_after_publication_keeps_actual_new_file(self):
        calls = []
        def context():
            calls.append(True)
            if len(calls) == 3:
                raise ReleaseContractError("modeled late fence failure")
        with self.assertRaisesRegex(ReleaseContractError, "TOOL_WRITE_UNCONFIRMED"):
            self.write(check_context=context)
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.new)

    def test_insufficient_reserve_has_no_pending_file(self):
        with patch.object(installer.os, "fstatvfs", return_value=SimpleNamespace(f_bavail=1, f_frsize=1)), \
             self.assertRaises(ReleaseContractError):
            self.write()
        self.assertFalse(self.pending().exists())

    def test_deadline_after_staging_keeps_original_and_pending(self):
        write = installer.os.write
        with patch.object(installer.time, "monotonic", return_value=10) as clock:
            def late(fd, data):
                result = write(fd, data)
                clock.return_value = 12
                return result
            with patch.object(installer.os, "write", side_effect=late), self.assertRaises(ReleaseContractError):
                self.write(deadline=11)
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.old)
        self.assertTrue(self.pending().exists())

    def test_failed_pending_unlink_keeps_both_helper_names_without_claiming_completion(self):
        path = installer.HELPERS[0]
        with patch.object(installer.os, "unlink", side_effect=OSError("modeled unlink failure")), \
             self.assertRaises(ReleaseContractError):
            self.write(path)
        target = self.parent / Path(path).name
        self.assertEqual(target.read_bytes(), self.new)
        self.assertTrue(self.pending(path).exists())
        self.assertEqual(target.stat().st_nlink, 2)

    def test_published_readback_failure_preserves_actual_file(self):
        read = installer._installation_tool_member_read
        calls = []
        def changed(*args):
            calls.append(True)
            result = read(*args)
            return (b"modeled readback differs", result[1]) if len(calls) == 3 else result
        with patch.object(installer, "_installation_tool_member_read", side_effect=changed), self.assertRaises(ReleaseContractError):
            self.write()
        self.assertEqual((self.parent / Path(self.path).name).read_bytes(), self.new)
