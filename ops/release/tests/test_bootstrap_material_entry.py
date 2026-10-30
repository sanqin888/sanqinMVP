"""Bound bootstrap material entry: real disposable sources/locks, no source execution or host install."""
import contextlib
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_minimal_executor as installer
import test_minimal_delivery as delivery
import test_private_install_materials as private
from release_contract import ReleaseContractError


class BootstrapMaterialEntryTests(unittest.TestCase):
    def setUp(self):
        # Composition avoids re-running all inherited fixture tests.
        self.private = private.PrivateMaterialsTests(
            "test_success_retains_exact_inputs_privately_and_query_proves_no_host_install")
        self.private.setUp()
        self.addCleanup(self.private.doCleanups)
        self.case, self.anchor, self.kit = self.private.case, self.private.anchor, self.private.kit
        self.root = self.anchor / "install-bootstrap" / delivery.SHA
        for path in installer.BOOTSTRAP_IMPORTS:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            target.write_bytes(self.case.sources[path])
            target.chmod(0o600)
        for directory in (self.anchor / "install-bootstrap", self.root, self.root / "ops",
                          self.root / "ops/release", self.root / "ops/runtime"):
            directory.chmod(0o700)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(installer, "STATE_PARENT", self.anchor))
        self.stack.enter_context(patch.object(installer, "ROOT", self.root))
        origins = (
            (installer, installer.BOOTSTRAP),
            (installer.release, "ops/release/release_contract.py"),
            (installer.bundle, "ops/runtime/build_bundle.py"),
            (installer.historical, "ops/runtime/versioned_release_contract.py"),
            (sys.modules["runtime_trust"], "ops/runtime/runtime_trust.py"),
        )
        for module, path in origins:
            self.stack.enter_context(patch.object(module, "__file__", str(self.root / path)))
        flags = {name: getattr(sys.flags, name) for name in dir(sys.flags)
                 if not name.startswith("_") and type(getattr(sys.flags, name)) is int}
        flags.update(isolated=1, no_site=1, dont_write_bytecode=1)
        self.flags = SimpleNamespace(**flags)
        self.stack.enter_context(patch.object(sys, "flags", self.flags))
        self.stack.enter_context(patch.object(sys, "executable", "/usr/bin/python3"))

    def retain(self):
        return installer._retain_from_bound_bootstrap(self.kit, delivery.SHA,
            self.case.old_runtime, delivery.OLD, fetch=self.case.fetch)

    def binding(self):
        return installer._bound_bootstrap_sources(self.kit, delivery.SHA, fetch=self.case.fetch)

    def test_material_entry_retains_exact_data_under_real_locks_without_installing(self):
        result = self.retain()
        self.assertEqual(result["outcome"], "MATERIALS_RETAINED")
        self.assertEqual(result["retentionId"], self.private.identity)
        self.assertEqual(set(p.name for p in self.private.target.iterdir()), installer.PRIVATE_FILES)
        self.private.assert_no_install_effect()
        for key in ("hostPreflightComplete", "readyToInstall", "canExecute", "authorizedToMutateProduction"):
            self.assertIs(result[key], False)
        # The fixture bootstrap bytes deliberately raise if imported; they are data only.
        self.assertIn(b"TARGET_MUST_NOT_EXECUTE", (self.root / installer.BOOTSTRAP).read_bytes())

    def test_root_system_interpreter_and_isolated_flags_required_before_source_fetch(self):
        for object_, attribute, value in (
            (installer.os, "geteuid", lambda: 1000), (sys, "platform", "darwin"),
            (sys, "executable", "/usr/local/bin/python3"), (sys, "version_info", (3, 9)),
            (self.flags, "isolated", 0), (self.flags, "no_site", 0),
            (self.flags, "dont_write_bytecode", 0),
        ):
            with self.subTest(attribute=attribute), patch.object(object_, attribute, value), \
                 patch.object(installer, "_review") as review, self.assertRaises(ReleaseContractError):
                self.retain()
            review.assert_not_called()
        self.assertFalse(self.private.state.exists())

    def test_fixed_root_and_every_import_origin_reject_other_paths(self):
        for module in (installer, installer.release, installer.bundle, installer.historical,
                       sys.modules["runtime_trust"]):
            with self.subTest(module=module.__name__), patch.object(module, "__file__", "/tmp/other.py"), \
                 self.assertRaises(ReleaseContractError):
                self.retain()
        with patch.object(installer, "ROOT", self.anchor), self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.private.state.exists())

    def test_each_of_five_source_bytes_must_match_independent_exact_release(self):
        for path in installer.BOOTSTRAP_IMPORTS:
            target = self.root / path
            original = target.read_bytes()
            target.write_bytes(original + b"# local edit\n")
            with self.subTest(path=path), self.assertRaises(ReleaseContractError):
                self.retain()
            target.write_bytes(original)
        self.assertFalse(self.private.state.exists())

    def test_failed_main_proof_blocks_before_private_retention(self):
        self.case.data[self.case.latest_key]["workflow_runs"][0]["conclusion"] = "failure"
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.private.state.exists())

    def test_missing_extra_and_other_version_members_are_refused_without_cleanup(self):
        extras = (self.root / "ops/runtime/sitecustomize.py", self.root / ".git",
                  self.anchor / "install-bootstrap" / ("d" * 40))
        for target in extras:
            target.write_bytes(b"unreviewed")
            with self.subTest(path=str(target)), self.assertRaises(ReleaseContractError):
                self.retain()
            self.assertEqual(target.read_bytes(), b"unreviewed")
            target.unlink()
        target = self.root / installer.BOOTSTRAP
        target.unlink()
        with self.assertRaises(FileNotFoundError):
            self.retain()
        self.assertFalse(self.private.state.exists())

    def test_file_symlink_hardlink_and_fifo_are_not_followed_or_repaired(self):
        target = self.root / installer.BOOTSTRAP
        raw = target.read_bytes()
        outside = self.anchor / "outside"
        outside.write_bytes(raw)
        outside.chmod(0o600)
        target.unlink()
        target.symlink_to(outside)
        with self.assertRaises(OSError):
            self.retain()
        self.assertTrue(target.is_symlink())
        target.unlink()
        os.link(outside, target)
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertEqual(target.stat().st_nlink, 2)
        target.unlink()
        os.mkfifo(target, 0o600)
        with self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.private.state.exists())

    def test_private_file_directory_and_owner_modes_are_strict(self):
        for target, mode in ((self.root / installer.BOOTSTRAP, 0o644), (self.root, 0o755)):
            original = target.stat().st_mode & 0o7777
            target.chmod(mode)
            with self.subTest(mode=mode), self.assertRaises(ReleaseContractError):
                self.retain()
            self.assertEqual(target.stat().st_mode & 0o7777, mode)
            target.chmod(original)
        with patch.object(installer, "PRIVATE_GROUP_GID", self.private.gid + 1), \
             self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertFalse(self.private.state.exists())

    def test_symlink_directory_is_refused_before_review(self):
        target = self.root / "ops/runtime"
        moved = self.anchor / "runtime-moved"
        target.rename(moved)
        target.symlink_to(moved, target_is_directory=True)
        with patch.object(installer, "_review") as review, self.assertRaises(OSError):
            self.retain()
        review.assert_not_called()
        self.assertFalse(self.private.state.exists())

    def test_same_bytes_file_replacement_and_in_place_edit_are_detected_while_held(self):
        target = self.root / installer.BOOTSTRAP
        with self.assertRaises(ReleaseContractError):
            with self.binding() as check:
                replacement = target.with_suffix(".new")
                replacement.write_bytes(target.read_bytes())
                replacement.chmod(0o600)
                replacement.replace(target)
                check()
        with self.assertRaises(ReleaseContractError):
            with self.binding() as check:
                target.write_bytes(target.read_bytes() + b"# late\n")
                check()

    def test_same_inventory_directory_replacement_and_late_member_are_detected(self):
        with self.assertRaises(ReleaseContractError):
            with self.binding() as check:
                directory = self.root / "ops/runtime"
                directory.rename(self.anchor / "old-runtime")
                directory.mkdir(mode=0o700)
                for name in ("build_bundle.py", "versioned_release_contract.py", "runtime_trust.py"):
                    target = directory / name
                    target.write_bytes((self.anchor / "old-runtime" / name).read_bytes())
                    target.chmod(0o600)
                check()
        with self.assertRaises(ReleaseContractError):
            with self.binding():
                (self.root / "ops/runtime/late.py").write_bytes(b"late")

    def test_state_anchor_replacement_cannot_rebind_held_source_tree(self):
        other = self.anchor / "other"
        other.mkdir(mode=0o700)
        original = installer._state_parent
        with self.assertRaises(ReleaseContractError):
            with self.binding() as check:
                with patch.object(installer, "_state_parent",
                                  side_effect=lambda: os.open(other, os.O_RDONLY | os.O_DIRECTORY)):
                    check()
        self.assertIs(installer._state_parent, original)

    def test_late_source_change_preserves_retained_records_and_never_reports_success(self):
        write = installer._private_write
        target = self.root / installer.BOOTSTRAP
        def changed(root, name, raw):
            result = write(root, name, raw)
            if name == "retained.json":
                replacement = target.with_suffix(".new")
                replacement.write_bytes(target.read_bytes())
                replacement.chmod(0o600)
                replacement.replace(target)
            return result
        with patch.object(installer, "_private_write", side_effect=changed), \
             self.assertRaises(ReleaseContractError):
            self.retain()
        self.assertTrue((self.private.target / "retained.json").is_file())
        self.private.assert_no_install_effect()
        with self.assertRaises(ReleaseContractError):
            self.retain()  # Existing retention is never adopted/replayed.

    def test_public_retain_dispatches_bound_adapter_and_cannot_apply(self):
        args = ["retain", "--source-sha", delivery.SHA, "--kit", "kit",
                "--current-runtime-archive", "old", "--current-source-sha", delivery.OLD]
        output = io.StringIO()
        with patch.object(installer, "_read_artifact", side_effect=[self.kit, self.case.old_runtime]), \
             patch.object(installer.release, "github_json", side_effect=self.case.fetch), \
             contextlib.redirect_stdout(output):
            self.assertEqual(installer.main(args), 0)
        self.assertEqual(json.loads(output.getvalue())["outcome"], "MATERIALS_RETAINED")
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
            installer.main(["apply"])
        self.assertEqual(raised.exception.code, 2)
        self.private.assert_no_install_effect()

    def test_public_retain_checks_invocation_before_opening_artifacts_and_does_not_leak_paths(self):
        output = io.StringIO()
        with patch.object(installer.os, "geteuid", return_value=1000), \
             patch.object(installer, "_read_artifact") as read, contextlib.redirect_stdout(output):
            self.assertEqual(installer.main(["retain", "--source-sha", delivery.SHA, "--kit", "/secret",
                "--current-runtime-archive", "/private", "--current-source-sha", delivery.OLD]), 1)
        read.assert_not_called()
        self.assertNotIn("/secret", output.getvalue())
        self.assertNotIn("/private", output.getvalue())


if __name__ == "__main__":
    unittest.main()
