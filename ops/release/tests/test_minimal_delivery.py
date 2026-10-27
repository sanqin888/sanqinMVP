"""D1 offline source/authentication, inert archives and disposable artifact IO."""
import base64
import copy
import gzip
import io
import json
import os
import stat
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
from release_contract import ReleaseContractError

SHA, OLD, TREE = "b" * 40, "a" * 40, "c" * 40
REPO = {"full_name": installer.release.REPOSITORY}


class DeliveryFixture(unittest.TestCase):
    def setUp(self):
        self.runtime_files = {p: ("inert runtime " + p + "\n").encode() for p in installer.RUNTIME_MEMBERS}
        self.sources = {**self.runtime_files, **{p: ('raise RuntimeError("TARGET_MUST_NOT_EXECUTE ' + p + '")\n').encode()
            for p in (*installer.HELPERS, installer.BOOTSTRAP)}}
        self.sources["ops/release/maintenance_guard.py"] = (
            installer.GUARD_MODEL + '\nraise RuntimeError("TARGET_MUST_NOT_EXECUTE")\n').encode()
        self.runtime = self.archive(self.runtime_files, SHA, 40, 42)
        self.old_files = copy.deepcopy(self.runtime_files)
        self.old_files["ops/release/deploy_release.py"] = b"old deployment tool\n"
        self.old_runtime = self.archive(self.old_files, OLD, 44, 43)
        self.data, self.calls = {}, []
        self.add_runtime(SHA, self.runtime, 40, 42)
        self.add_runtime(OLD, self.old_runtime, 44, 43)
        self.data[installer.PREFIX + "/compare/" + SHA + "..." + SHA] = self.comparison(SHA, identical=True)
        self.data[installer.PREFIX + "/compare/" + OLD + "..." + SHA] = self.comparison(OLD)
        self.latest_key = installer.PREFIX + "/actions/workflows/ci.yml/runs?event=push&head_sha=" + SHA + "&per_page=100"
        self.data[self.latest_key] = {"workflow_runs": [self.ci(SHA, 41)]}
        self.data[installer.PREFIX + "/git/commits/" + SHA] = {"sha": SHA, "tree": {"sha": TREE}}
        self.tree_key = installer.PREFIX + "/git/trees/" + TREE + "?recursive=1"
        self.data[self.tree_key] = {"sha": TREE, "truncated": False, "tree": []}
        self.refresh_sources()

    def comparison(self, sha, identical=False):
        return {"status": "identical" if identical else "ahead", "behind_by": 0,
                "base_commit": {"sha": sha}, "merge_base_commit": {"sha": sha}}

    def ci(self, sha, identity):
        return {"id": identity, "path": ".github/workflows/ci.yml", "head_sha": sha,
                "head_branch": "main", "event": "push", "status": "completed",
                "conclusion": "success", "repository": REPO}

    def archive(self, files, sha, ci, publish):
        proof = {"schemaVersion": 1, "sourceBranch": "main", "sourceSha": sha,
            "ciRunId": ci, "publishRunId": publish, "verifiedAt": "2026-10-27T00:00:00Z",
            "images": {name: {"ref": "ghcr.io/sanqin888/" + name + ":" + sha,
                "digest": "sha256:" + "e" * 64, "requiredPlatform": "linux/amd64"}
                for name in ("sanq-api", "sanq-web")}}
        return installer.bundle.encode_bundle(files, installer.bundle.manifest_for_proof(proof, files))

    def add_runtime(self, sha, raw, ci, publish):
        url = "https://github.com/sanqin888/sanqinMVP/actions/runs/" + str(publish)
        self.data[installer.PREFIX + "/commits/" + sha + "/statuses?per_page=100"] = [
            {"context": installer.historical.RUNTIME_CONTEXT, "state": "success",
             "creator": {"login": "github-actions[bot]"}, "target_url": url,
             "description": "sha256:" + installer._hash(raw)},
            {"context": installer.release.RELEASE_CONTEXT, "state": "success",
             "creator": {"login": "github-actions[bot]"}, "target_url": url,
             "description": "a:" + "e" * 64 + " w:" + "e" * 64}]
        self.data[installer.PREFIX + "/compare/" + sha + "...main"] = self.comparison(sha)
        self.data[installer.PREFIX + "/actions/runs/" + str(publish)] = {
            "id": publish, "path": ".github/workflows/publish-images.yml", "name": "publish-images",
            "event": "workflow_run", "head_branch": "main", "status": "completed",
            "conclusion": "success", "repository": REPO}
        self.data[installer.PREFIX + "/actions/runs/" + str(ci)] = self.ci(sha, ci)

    def refresh_sources(self):
        rows = []
        for path, raw in self.sources.items():
            sha = installer._object(raw)
            rows.append({"path": path, "mode": "100644", "type": "blob", "sha": sha, "size": len(raw)})
            self.data[installer.PREFIX + "/git/blobs/" + sha] = {
                "sha": sha, "size": len(raw), "encoding": "base64",
                "content": base64.b64encode(raw).decode()}
        self.data[self.tree_key]["tree"] = rows

    def fetch(self, path):
        self.calls.append(path)
        return self.data[path]

    def pack(self, fetch=None):
        return installer.build_materials(self.runtime, SHA, fetch=self.fetch if fetch is None else fetch)

    def verify(self, payload):
        return installer.verify_materials(payload, SHA, fetch=self.fetch)

    def rewrite(self, contents, extra=None):
        output = io.BytesIO()
        with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                for path, raw in contents.items():
                    info = tarfile.TarInfo(path)
                    info.size, info.mode = len(raw), 0o600
                    archive.addfile(info, io.BytesIO(raw))
                if extra is not None:
                    info, raw = extra
                    archive.addfile(info, None if raw is None else io.BytesIO(raw))
        return output.getvalue()

    def test_inert_pack_is_deterministic_and_verifies_exact_inventory_without_executing_sources(self):
        payload = self.pack()
        self.assertEqual(payload, self.pack())
        result = self.verify(payload)
        self.assertEqual((result["runtimeMemberCount"], result["helperCount"],
                          result["bootstrapCount"], result["dropinCount"]), (17, 9, 1, 3))
        self.assertEqual((result["originalCiRunId"], result["latestMainCiRunId"]), (40, 41))
        self.assertTrue(result["sourceAuthenticated"])
        for flag in ("readyToInstall", "canExecute", "authorizedToMutateProduction", "installedBaselineObserved"):
            self.assertFalse(result[flag])
        contents = installer._read_kit(payload)
        self.assertEqual(contents[installer.RUNTIME_ARCHIVE], self.runtime)
        self.assertEqual(set(contents), installer.CONTENT_PATHS | {installer.RECORD})
        self.assertIn(b"TARGET_MUST_NOT_EXECUTE", contents["sources/" + installer.BOOTSTRAP])
        self.assertFalse(any("commits?sha=main" in path for path in self.calls))

    def test_fixed_lists_and_templates_match_actual_bootstrap_checkout(self):
        self.assertEqual(tuple(installer.bundle.SOURCE_FILES), installer.RUNTIME_MEMBERS)
        self.assertEqual((len(installer.RUNTIME_MEMBERS), len(installer.HELPERS), len(installer.SOURCES)), (17, 9, 27))
        self.assertEqual(len(set(installer.SOURCES)), 27)
        guard = (installer.ROOT / "ops/release/maintenance_guard.py").read_bytes()
        self.assertEqual(installer._dropins(guard),
                         {"dropins/" + name + ".conf": raw.encode() for name, raw in installer.DROPINS.items()})
        self.assertTrue(all((installer.ROOT / path).is_file() for path in installer.SOURCES))

    def test_sealed_manifest_wrong_schema_integer_or_duplicate_keys_is_rejected(self):
        original = installer.bundle.verify_bundle_bytes(self.runtime, SHA)
        for changes in ({"schemaVersion": True}, {"ciRunId": True}):
            raw = installer.bundle.encode_bundle(self.runtime_files, {**original, **changes})
            self.add_runtime(SHA, raw, 40, 42)
            with self.assertRaises(ReleaseContractError):
                installer.build_materials(raw, SHA, fetch=self.fetch)
        files = {installer.bundle.RUNTIME_PREFIX + "/" + path: raw for path, raw in self.runtime_files.items()}
        manifest = installer.bundle._json(original).rstrip()
        files[installer.bundle.RUNTIME_PREFIX + "/" + installer.bundle.MANIFEST] = (
            manifest[:-1] + b',"schemaVersion":1}\n')
        raw = self.rewrite(files)
        self.add_runtime(SHA, raw, 40, 42)
        with self.assertRaises(ReleaseContractError):
            installer.build_materials(raw, SHA, fetch=self.fetch)

    def test_later_failed_exact_ci_supersedes_original_success(self):
        self.data[self.latest_key]["workflow_runs"].append({**self.ci(SHA, 50), "conclusion": "failure"})
        with self.assertRaises(ReleaseContractError):
            self.pack()

    def test_original_archive_ci_must_still_match_exact_main_identity_and_success(self):
        key = installer.PREFIX + "/actions/runs/40"
        for changes in ({"conclusion": "failure"}, {"head_sha": OLD}, {"head_branch": "dev"},
                        {"event": "pull_request"}, {"path": ".github/workflows/other.yml"}, {"id": True}):
            old = self.data[key]
            self.data[key] = {**old, **changes}
            with self.subTest(changes=changes), self.assertRaises(ReleaseContractError):
                self.pack()
            self.data[key] = old

    def test_runtime_seal_failure_after_source_fetch_does_not_reuse_cached_success(self):
        key, reads = installer.PREFIX + "/commits/" + SHA + "/statuses?per_page=100", 0
        def fetch(path):
            nonlocal reads
            value = self.fetch(path)
            if path == key:
                reads += 1
                if reads == 2:
                    return [{**value[0], "state": "failure"}, *value]
            return value
        with self.assertRaises(ValueError):
            self.pack(fetch)
        self.assertEqual(reads, 2)

    def test_wrong_archive_or_wrong_source_sha_never_authenticates(self):
        with self.assertRaises(ValueError):
            installer.build_materials(self.old_runtime, SHA, fetch=self.fetch)
        with self.assertRaises(ValueError):
            installer.verify_materials(self.pack(), OLD, fetch=self.fetch)

    def test_archive_repacking_is_rejected_by_independent_digest(self):
        changed = bytearray(self.runtime)
        changed[4:8] = b"\x01\x00\x00\x00"
        with self.assertRaises(ValueError):
            installer.build_materials(bytes(changed), SHA, fetch=self.fetch)

    def test_commit_tree_binding_and_truncation_block(self):
        tree = self.data[self.tree_key]
        for changes in ({"sha": OLD}, {"truncated": True}, {"tree": []}):
            self.data[self.tree_key] = {**tree, **changes}
            with self.assertRaises(ReleaseContractError):
                self.pack()
        self.data[self.tree_key] = tree
        self.data[installer.PREFIX + "/git/commits/" + SHA]["sha"] = OLD
        with self.assertRaises(ReleaseContractError):
            self.pack()

    def test_missing_or_duplicate_fixed_source_path_blocks(self):
        rows = self.data[self.tree_key]["tree"]
        self.data[self.tree_key]["tree"] = rows[:-1]
        with self.assertRaises(ReleaseContractError):
            self.pack()
        self.data[self.tree_key]["tree"] = rows + [rows[0]]
        with self.assertRaises(ReleaseContractError):
            self.pack()

    def test_git_symlink_submodule_and_wrong_blob_size_or_bytes_block(self):
        rows = self.data[self.tree_key]["tree"]
        row = rows[-1]
        for changes in ({"mode": "120000"}, {"mode": "160000", "type": "commit"},
                        {"size": True}, {"size": installer.MAX_FILE + 1}):
            rows[-1] = {**row, **changes}
            with self.assertRaises(ReleaseContractError):
                self.pack()
        rows[-1] = row
        key = installer.PREFIX + "/git/blobs/" + row["sha"]
        blob = self.data[key]
        for changes in ({"size": True}, {"encoding": "utf-8"}, {"sha": OLD},
                        {"content": "!"}, {"content": base64.b64encode(b"x" * row["size"]).decode()}):
            self.data[key] = {**blob, **changes}
            with self.assertRaises(ValueError):
                self.pack()

    def test_more_than_300_unrelated_paths_do_not_change_fixed_member_review(self):
        self.data[self.tree_key]["tree"] += [{"path": "docs/item-" + str(i), "type": "blob"} for i in range(350)]
        self.assertTrue(self.verify(self.pack())["sourceAuthenticated"])

    def test_even_sealed_archive_must_match_exact_git_member_bytes(self):
        self.sources["ops/release/deploy_release.py"] = b"unrelated source\n"
        self.refresh_sources()
        with self.assertRaises(ReleaseContractError):
            self.pack()

    def test_reviewed_dropin_constants_are_compared_as_syntax_without_eval(self):
        self.sources["ops/release/maintenance_guard.py"] = self.sources[
            "ops/release/maintenance_guard.py"].replace(b"check-startup", b"other-command")
        self.refresh_sources()
        with self.assertRaises(ReleaseContractError):
            self.pack()

    def test_self_consistent_tampered_kit_manifest_does_not_authenticate_source(self):
        contents = installer._read_kit(self.pack())
        name = "sources/" + installer.BOOTSTRAP
        contents[name] = b"attacker replacement"
        record = json.loads(contents[installer.RECORD])
        record["files"][name] = {"sha256": installer._hash(contents[name]), "bytes": len(contents[name])}
        contents[installer.RECORD] = installer._json(record)
        with self.assertRaises(ReleaseContractError):
            self.verify(self.rewrite(contents))

    def test_duplicate_json_and_install_authority_fields_are_rejected(self):
        contents = installer._read_kit(self.pack())
        contents[installer.RECORD] = b'{"kind":1,"kind":2}\n'
        with self.assertRaises(ReleaseContractError):
            self.verify(self.rewrite(contents))
        contents = installer._read_kit(self.pack())
        record = json.loads(contents[installer.RECORD])
        record["readyToInstall"] = True
        contents[installer.RECORD] = installer._json(record)
        with self.assertRaises(ReleaseContractError):
            self.verify(self.rewrite(contents))

    def test_missing_extra_duplicate_traversal_or_link_tar_members_are_rejected(self):
        contents = installer._read_kit(self.pack())
        missing = dict(contents)
        missing.pop(next(iter(installer.CONTENT_PATHS)))
        with self.assertRaises(ReleaseContractError):
            self.verify(self.rewrite(missing))
        for name, kind in (("unreviewed.py", tarfile.REGTYPE),
                           ("../outside", tarfile.REGTYPE),
                           (installer.RECORD, tarfile.REGTYPE),
                           (installer.BOOTSTRAP, tarfile.SYMTYPE)):
            info = tarfile.TarInfo(name)
            info.mode, info.type = 0o600, kind
            info.size = 1 if kind == tarfile.REGTYPE else 0
            info.linkname = "/outside" if kind == tarfile.SYMTYPE else ""
            with self.subTest(name=name), self.assertRaises(ReleaseContractError):
                self.verify(self.rewrite(contents, (info, b"x" if info.size else None)))

    def test_changed_template_or_runtime_payload_in_kit_is_rejected(self):
        contents = installer._read_kit(self.pack())
        for name, raw in ((installer.RUNTIME_ARCHIVE, self.old_runtime),
                          ("dropins/docker.service.conf", b"[Service]\nExecStartPre=/usr/bin/true\n")):
            bad = {**contents, name: raw}
            with self.assertRaises(ValueError):
                self.verify(self.rewrite(bad))

    def test_kit_size_member_budget_and_truncated_bytes_are_rejected(self):
        payload = self.pack()
        for raw in (b"", payload[:50], b"not gzip"):
            with self.assertRaises((ValueError, EOFError, tarfile.TarError)):
                self.verify(raw)
        with patch.object(installer, "MAX_KIT", len(payload) - 1), self.assertRaises(ReleaseContractError):
            self.verify(payload)

    def test_plan_compares_supplied_archives_but_never_claims_installed_state(self):
        result = installer.review_transition(self.pack(), SHA, self.old_runtime, OLD, fetch=self.fetch)
        self.assertEqual(result["outcome"], "ARTIFACTS_REVIEWED")
        self.assertEqual(result["changedRuntimeFiles"], ["ops/release/deploy_release.py"])
        self.assertTrue(result["requiresHostRecheck"])
        for name in ("readyToInstall", "canExecute", "installedBaselineObserved", "authorizedToMutateProduction"):
            self.assertFalse(result[name])

    def test_compose_or_backup_difference_requires_additional_platform_review(self):
        for name in ("docker-compose.yml", "ops/backup/backup-db.sh"):
            old = {**self.old_files, name: b"other platform behavior"}
            raw = self.archive(old, OLD, 44, 43)
            self.add_runtime(OLD, raw, 44, 43)
            result = installer.review_transition(self.pack(), SHA, raw, OLD, fetch=self.fetch)
            self.assertEqual(result["outcome"], "NEEDS_PLATFORM_REVIEW")
            self.assertIn(name, result["requiresAdditionalPlatformReview"])
            self.assertFalse(result["readyToInstall"])

    def test_tool_downgrade_lineage_is_rejected(self):
        self.data[installer.PREFIX + "/compare/" + OLD + "..." + SHA]["status"] = "behind"
        with self.assertRaises(ReleaseContractError):
            installer.review_transition(self.pack(), SHA, self.old_runtime, OLD, fetch=self.fetch)


class ArtifactIOTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)

    def test_create_only_private_output_and_readback_never_overwrites(self):
        path = self.root / "kit.tar.gz"
        installer._save_new_artifact(path, b"review fixture")
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(installer._read_artifact(path, 100), b"review fixture")
        with self.assertRaises(FileExistsError):
            installer._save_new_artifact(path, b"other")
        self.assertEqual(path.read_bytes(), b"review fixture")

    def test_input_symlink_hardlink_directory_and_oversize_are_rejected(self):
        path = self.root / "source"
        path.write_bytes(b"fixture")
        link = self.root / "link"
        link.symlink_to(path)
        with self.assertRaises(ReleaseContractError):
            installer._read_artifact(link, 100)
        link.unlink()
        os.link(path, link)
        with self.assertRaises(ReleaseContractError):
            installer._read_artifact(path, 100)
        link.unlink()
        for file, maximum in ((self.root, 100), (path, 1)):
            with self.assertRaises(ReleaseContractError):
                installer._read_artifact(file, maximum)

    def test_partial_or_sync_unknown_output_is_preserved_and_not_replayed(self):
        path = self.root / "partial"
        with patch.object(installer.os, "fsync", side_effect=OSError("unknown sync")):
            with self.assertRaises(OSError):
                installer._save_new_artifact(path, b"fixture")
        self.assertTrue(path.exists())
        with self.assertRaises(FileExistsError):
            installer._save_new_artifact(path, b"fixture")

    def test_unsafe_parents_and_production_output_roots_are_rejected(self):
        link = self.root / "alias"
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ReleaseContractError):
            installer._save_new_artifact(link / "kit", b"fixture")
        for path in ("/opt/sanq/new-kit", "/srv/sanq/uploads/new-kit", "/home/ubuntu/sanq-app/new-kit",
                     "/etc/new-kit", "/proc/new-kit", "/run/new-kit"):
            with patch.object(installer.os, "open") as opened, self.assertRaises(ReleaseContractError):
                installer._save_new_artifact(path, b"fixture")
            opened.assert_not_called()
        self.root.chmod(0o770)
        with self.assertRaises(ReleaseContractError):
            installer._save_new_artifact(self.root / "kit", b"fixture")

    def test_cli_root_pack_is_rejected_before_any_read_or_write(self):
        with patch.object(installer.os, "geteuid", return_value=0), \
             patch.object(installer, "_read_artifact") as read, patch.object(installer, "_save_new_artifact") as save, \
             patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(installer.main(["pack", "--source-sha", SHA, "--runtime-archive", "in", "--output", "out"]), 1)
        read.assert_not_called()
        save.assert_not_called()

    def test_cli_has_no_apply_install_execute_or_arbitrary_command_entry(self):
        for command in ("apply", "install", "restore"):
            with patch("sys.stderr", new_callable=io.StringIO), self.assertRaises(SystemExit):
                installer.main([command])
        with patch("sys.stderr", new_callable=io.StringIO), self.assertRaises(SystemExit):
            installer.main(["verify", "--source-sha", SHA, "--kit", "in", "--execute"])

    def test_cli_failure_does_not_echo_untrusted_api_or_archive_text(self):
        with patch.object(installer, "_read_artifact", return_value=b"fixture"), \
             patch.object(installer, "verify_materials", side_effect=ValueError("DO_NOT_PRINT")), \
             patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(installer.main(["verify", "--source-sha", SHA, "--kit", "in"]), 1)
        self.assertNotIn("DO_NOT_PRINT", output.getvalue())

    def test_cli_pack_and_plan_route_only_material_arguments(self):
        with patch.object(installer.os, "geteuid", return_value=1001), \
             patch.object(installer, "_read_artifact", return_value=b"runtime"), \
             patch.object(installer, "build_materials", return_value=b"kit") as build, \
             patch.object(installer, "_save_new_artifact") as save, patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(installer.main(["pack", "--source-sha", SHA, "--runtime-archive", "in", "--output", "out"]), 0)
        self.assertEqual(build.call_args.args, (b"runtime", SHA))
        save.assert_called_once_with(Path("out"), b"kit")
        with patch.object(installer, "_read_artifact", side_effect=[b"kit", b"old"]), \
             patch.object(installer, "review_transition", return_value={}) as plan, patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(installer.main(["plan", "--source-sha", SHA, "--kit", "in",
                "--current-runtime-archive", "old", "--current-source-sha", OLD]), 0)
        self.assertEqual(plan.call_args.args, (b"kit", SHA, b"old", OLD))


if __name__ == "__main__":
    unittest.main()
