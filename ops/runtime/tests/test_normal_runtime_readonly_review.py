"""Offline F2 tests: real bounded FD trees and mocked repository GETs only."""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_readonly_review as review
import build_bundle
from normal_runtime_launch import canonical, digest
from stage_bundle import LAYOUT_V1

OLD, NEW, APP, PREVIOUS = ("a" * 40, "b" * 40, "c" * 40, "d" * 40)
OLD_DIGEST = "sha256:" + "e" * 64
IMAGE = "f" * 64
REPO = "/repos/sanqin888/sanqinMVP"


def manifest(sha, files, ci, publish):
    proof = {"schemaVersion": 1, "sourceBranch": "main", "sourceSha": sha,
             "ciRunId": ci, "publishRunId": publish, "verifiedAt": "2026-10-25T00:00:00Z",
             "images": {n: {"ref": f"ghcr.io/sanqin888/{n}:{sha}",
                           "digest": "sha256:" + IMAGE, "requiredPlatform": "linux/amd64"}
                        for n in ("sanq-api", "sanq-web")}}
    return build_bundle.manifest_for_proof(proof, files)


def seal(context, description, publish):
    return {"context": context, "description": description, "state": "success",
            "creator": {"login": "github-actions[bot]"},
            "target_url": f"https://github.com/sanqin888/sanqinMVP/actions/runs/{publish}"}


class ReadonlyReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.original = {n: ("old " + n).encode() for n in review.SOURCE_FILES}
        self.original["ops/runtime/runtime-layout.v1.json"] = canonical(LAYOUT_V1)
        self.target_files = {**self.original, "ops/release/deploy_release.py": b"new reviewed source"}
        self.old_manifest = manifest(OLD, self.original, 10, 11)
        self.target = build_bundle.encode_bundle(self.target_files,
                                                 manifest(NEW, self.target_files, 20, 21))
        self.installed = {**self.original,
                          review.MANIFEST: (json.dumps(self.old_manifest, sort_keys=True) + "\n").encode(),
                          ".env": f"SANQ_IMAGE_SHA={APP}\nPRIVATE_VALUE=never-print-me\n".encode(),
                          ".sanq-release-state.json": canonical({"schemaVersion": 1, "phase": "active",
                                                                 "current": APP, "previous": PREVIOUS}),
                          ".sanq-backup-layout-activated": b"SANQ_BACKUP_LAYOUT_C4_V1\n"}
        for name, raw in self.installed.items():
            path = self.root / name
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            path.write_bytes(raw)
            path.chmod(0o600 if name in (".env", ".sanq-release-state.json") else 0o644)
        self.fd = os.open(self.root, review.DIR_FLAGS)
        self.addCleanup(os.close, self.fd)
        own = (os.getuid(), os.getgid())
        self.owners = patch.object(review, "_owners", return_value=(own, own))
        self.owners.start()
        self.addCleanup(self.owners.stop)
        fixture = json.loads((ROOT / "fixtures/c1_assembly_inputs.json").read_text())
        self.launch = canonical(fixture["launch.json"])
        uid, gid = own
        self.observation_doc = {"schema": "sanq.runtime.c1-preserved-observation.v1",
            "scope": "READ_ONLY_BOOTSTRAP", "evidenceKind": "synthetic-test-observation",
            "continuousMaintenanceVerified": False, "authorizedToMutateProduction": False,
            "currentRuntimeSha": OLD, "currentAppSha": APP, "previousAppSha": PREVIOUS,
            "runtimeManifestSha256": digest(self.installed[review.MANIFEST]), "containers": [],
            "files": {n: {"bytes": len(self.installed[n]), "sha256": digest(self.installed[n]),
                          "uid": uid, "gid": gid,
                          "mode": oct((self.root / n).stat().st_mode & 0o7777)} for n in review.PRESERVED}}
        self.observation = canonical(self.observation_doc)
        self.request_doc = {**fixture["request.json"], "currentRuntimeSha": OLD,
            "targetRuntimeSha": NEW, "currentArchiveDigest": OLD_DIGEST,
            "targetArchiveDigest": "sha256:" + digest(self.target),
            "currentAppSha": APP, "previousAppSha": PREVIOUS,
            "preservedStateSha256": digest(self.observation),
            "launchMaterialsSha256": digest(self.launch)}
        self.request = canonical(self.request_doc)
        self.calls = []

    def fetch(self, path):
        self.calls.append(path)
        if path == REPO + "/commits?sha=main&per_page=20":
            return [{"sha": NEW}]
        if path == REPO + f"/compare/{OLD}...main":
            return {"status": "ahead", "behind_by": 0, "merge_base_commit": {"sha": OLD}}
        for sha, ci, publish, archive in ((OLD, 10, 11, OLD_DIGEST),
                                        (NEW, 20, 21, "sha256:" + digest(self.target))):
            if path == REPO + f"/commits/{sha}/statuses?per_page=100":
                return [seal(review.RUNTIME_CONTEXT, archive, publish),
                        seal(review.RELEASE_CONTEXT, "a:" + IMAGE + " w:" + IMAGE, publish)]
            for run, name, event in ((ci, "ci", "push"), (publish, "publish-images", "workflow_run")):
                if path == REPO + f"/actions/runs/{run}":
                    return {"id": run, "name": name, "event": event, "head_sha": sha,
                            "head_branch": "main", "status": "completed", "conclusion": "success",
                            "repository": {"full_name": "sanqin888/sanqinMVP"},
                            "head_repository": {"full_name": "sanqin888/sanqinMVP"}}
        prefix, suffix = REPO + "/contents/", "?ref=" + OLD
        if path.startswith(prefix) and path.endswith(suffix):
            name = path[len(prefix):-len(suffix)]
            raw = self.original[name]
            return {"type": "file", "path": name, "encoding": "base64", "size": len(raw),
                    "content": base64.b64encode(raw).decode(),
                    "sha": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()}
        raise AssertionError("unexpected request: " + path)

    def run_review(self, fetch=None, **changes):
        args = dict(expected_launch_sha256=digest(self.launch),
                    expected_request_sha256=digest(self.request),
                    target_archive=self.target, installed_root_fd=self.fd,
                    preserved_observation=self.observation, fetch=fetch or self.fetch)
        args.update(changes)
        return review.review_readonly_update(self.launch, self.request, **args)

    def test_real_fd_inventory_and_publication_review_preserves_bytes_without_authority(self):
        result = self.run_review()
        self.assertEqual(result["changedMembers"], ["ops/release/deploy_release.py"])
        self.assertEqual(result["targetPolicy"], "EXISTING_NEWEST_PUBLICATION")
        for key in ("installedRootPathAuthenticated", "containerObservationAuthenticated",
                    "continuousMaintenanceVerified", "transactionAdmitted", "flowInvoked",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(result[key], False)
        self.assertIs(result["oldArchiveBytesRequired"], False)
        self.assertEqual(result["decision"], "BLOCKED")
        self.assertNotIn("never-print-me", json.dumps(result))
        for name, raw in self.installed.items():
            self.assertEqual((self.root / name).read_bytes(), raw)
        self.assertEqual(sum("/contents/" in p for p in self.calls), 17)
        os.fstat(self.fd)

    def test_wrong_independent_input_pin_blocks_before_network(self):
        with self.assertRaises(ValueError):
            self.run_review(expected_request_sha256="0" * 64)
        self.assertEqual(self.calls, [])

    def test_target_digest_and_immutable_archive_are_bound_to_request(self):
        for archive in (bytearray(self.target), b"repacked-corrupt-original"):
            with self.subTest(archive=type(archive).__name__), self.assertRaises(ValueError):
                self.run_review(target_archive=archive)
        self.request = canonical({**self.request_doc, "targetArchiveDigest": "sha256:" + "1" * 64})
        with self.assertRaisesRegex(ValueError, "target archive differs"):
            self.run_review()

    def test_non_newest_target_refused_without_fallback_or_current_tree_use(self):
        def fetch(path):
            if path == REPO + "/commits?sha=main&per_page=20":
                return []
            return self.fetch(path)
        with patch.object(review, "_installed", side_effect=AssertionError("tree must not open")):
            with self.assertRaises(ValueError):
                self.run_review(fetch)

    def test_missing_and_extra_source_members_rejected(self):
        leaf = self.root / "ops/release/deploy_release.py"
        leaf.unlink()
        with self.assertRaises(ValueError):
            self.run_review()
        leaf.write_bytes(self.original["ops/release/deploy_release.py"])
        (self.root / "unexpected").write_bytes(b"extra")
        with self.assertRaises(ValueError):
            self.run_review()

    def test_symlink_hardlink_and_fifo_rejected_without_following_or_hanging(self):
        path = self.root / "ops/release/deploy_release.py"
        saved = self.root.parent / (self.root.name + "-held")
        saved.write_bytes(path.read_bytes())
        self.addCleanup(saved.unlink)
        for kind in ("symlink", "hardlink", "fifo"):
            path.unlink()
            if kind == "symlink":
                path.symlink_to(saved)
            elif kind == "hardlink":
                os.link(saved, path)
            else:
                os.mkfifo(path)
            with self.subTest(kind=kind), self.assertRaises((ValueError, OSError)):
                self.run_review()

    def test_writable_directory_source_and_public_env_rejected(self):
        for relative, mode in (("ops", 0o777), ("ops/release/deploy_release.py", 0o666),
                               (".env", 0o644)):
            path = self.root / relative
            previous = path.stat().st_mode & 0o7777
            path.chmod(mode)
            with self.subTest(path=relative), self.assertRaises(ValueError):
                self.run_review()
            path.chmod(previous)

    def test_wrong_preserved_owner_rejected(self):
        with patch.object(review, "_owners", return_value=((os.getuid(), os.getgid()), (12345, 12345))):
            with self.assertRaises(ValueError):
                self.run_review()

    def test_current_seal_missing_changed_or_newer_failure_rejected(self):
        for kind in ("missing", "digest", "failure"):
            def fetch(path):
                value = self.fetch(path)
                if path == REPO + f"/commits/{OLD}/statuses?per_page=100":
                    if kind == "missing":
                        return value[1:]
                    if kind == "digest":
                        value[0]["description"] = "sha256:" + "2" * 64
                    else:
                        value.insert(0, {**value[0], "state": "failure"})
                return value
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.run_review(fetch)

    def test_current_workflow_wrong_repository_or_sha_rejected(self):
        for change in ({"head_sha": NEW}, {"repository": {"full_name": "attacker/else"}},
                       {"conclusion": "failure"}):
            def fetch(path):
                value = self.fetch(path)
                return {**value, **change} if path == REPO + "/actions/runs/11" else value
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.run_review(fetch)

    def test_installed_and_manifest_self_consistent_tampering_not_repo_authenticated(self):
        path = self.root / "ops/release/deploy_release.py"
        path.write_bytes(b"forged bytes")
        current = copy.deepcopy(self.old_manifest)
        current["files"]["ops/release/deploy_release.py"] = {"bytes": 12, "sha256": digest(b"forged bytes")}
        (self.root / review.MANIFEST).write_bytes(canonical(current))
        with self.assertRaisesRegex(ValueError, "repository bytes differ"):
            self.run_review()

    def test_repository_content_wrong_git_blob_or_type_rejected(self):
        for change in ({"sha": "0" * 40}, {"type": "symlink"}, {"content": "!!!"}):
            def fetch(path):
                value = self.fetch(path)
                return {**value, **change} if "/contents/" in path else value
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.run_review(fetch)

    def test_observation_and_dynamic_file_drift_rejected(self):
        with self.assertRaises(ValueError):
            self.run_review(preserved_observation=self.observation + b" ")
        (self.root / ".env").write_bytes(f"SANQ_IMAGE_SHA={NEW}\n".encode())
        with self.assertRaises(ValueError):
            self.run_review()

    def test_application_previous_pending_or_duplicate_env_identity_rejected(self):
        for state in ({"phase": "pending"}, {"previous": NEW}):
            raw = canonical({"schemaVersion": 1, "phase": "active", "current": APP,
                             "previous": PREVIOUS, **state})
            self._rebind_dynamic(".sanq-release-state.json", raw)
            with self.subTest(state=state), self.assertRaises(ValueError):
                self.run_review()
        self._rebind_dynamic(".sanq-release-state.json", self.installed[".sanq-release-state.json"])
        self._rebind_dynamic(".env", f"SANQ_IMAGE_SHA={APP}\nSANQ_IMAGE_SHA={APP}\n".encode())
        with self.assertRaises(ValueError):
            self.run_review()

    def _rebind_dynamic(self, name, raw):
        (self.root / name).write_bytes(raw)
        item = self.observation_doc["files"][name]
        item.update(bytes=len(raw), sha256=digest(raw))
        self.observation = canonical(self.observation_doc)
        self.request = canonical({**self.request_doc, "preservedStateSha256": digest(self.observation)})

    def test_replacement_during_network_review_rejected_and_borrowed_fd_survives(self):
        done = False
        def fetch(path):
            nonlocal done
            value = self.fetch(path)
            if "/contents/" in path and not done:
                done = True
                leaf = self.root / "ops/release/deploy_release.py"
                leaf.unlink()
                leaf.write_bytes(self.original["ops/release/deploy_release.py"])
            return value
        with self.assertRaisesRegex(ValueError, "changed|replaced"):
            self.run_review(fetch)
        os.fstat(self.fd)

    def test_duplicate_manifest_keys_and_oversized_member_rejected(self):
        path = self.root / review.MANIFEST
        path.write_bytes(b'{"schemaVersion":1,"schemaVersion":1}')
        with self.assertRaises(ValueError):
            self.run_review()
        path.write_bytes(self.installed[review.MANIFEST])
        leaf = self.root / "ops/release/deploy_release.py"
        with leaf.open("wb") as out:
            out.truncate(review.MAX_FILE_BYTES + 1)
        with self.assertRaises(ValueError):
            self.run_review()

    def test_unchanged_runtime_members_refused_even_for_distinct_releases(self):
        self.target = build_bundle.encode_bundle(self.original, manifest(NEW, self.original, 20, 21))
        self.request = canonical({**self.request_doc, "targetArchiveDigest": "sha256:" + digest(self.target)})
        with self.assertRaisesRegex(ValueError, "no Runtime member changed"):
            self.run_review()

    def test_invalid_marker_cannot_be_approved_by_rebinding_observation(self):
        self._rebind_dynamic(".sanq-backup-layout-activated", b"FAKE_MARKER")
        with self.assertRaisesRegex(ValueError, "marker differs"):
            self.run_review()

    def test_failure_closes_owned_fds_and_keeps_borrowed_fd(self):
        before = set(os.listdir("/proc/self/fd"))
        def fetch(path):
            if "/contents/" in path:
                raise OSError("synthetic offline error")
            return self.fetch(path)
        with self.assertRaises(OSError):
            self.run_review(fetch)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        os.fstat(self.fd)


class HeldReadonlyReviewTests(unittest.TestCase):
    def setUp(self):
        self.fixture = ReadonlyReviewTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def hold(self, **changes):
        f = self.fixture
        args = dict(expected_launch_sha256=digest(f.launch),
                    expected_request_sha256=digest(f.request),
                    target_archive=f.target, installed_root_fd=f.fd,
                    preserved_observation=f.observation, fetch=f.fetch)
        args.update(changes)
        return review.hold_readonly_update(f.launch, f.request, **args)

    def test_member_fds_held_through_consumer_and_borrowed_fd_survives(self):
        f = self.fixture
        before = set(os.listdir("/proc/self/fd"))
        with self.hold() as held:
            self.assertGreater(len(os.listdir("/proc/self/fd")),
                               len(before) + len(f.installed))
            held.recheck()
            result = held.report
            self.assertEqual(result["changedMembers"], ["ops/release/deploy_release.py"])
            self.assertEqual(result["decision"], "BLOCKED")
            self.assertFalse(result["transactionAdmitted"])
            self.assertNotIn("never-print-me", json.dumps(result))
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        os.fstat(f.fd)
        self.assertEqual({n: (f.root / n).read_bytes() for n in f.installed}, f.installed)

    def test_same_bytes_member_replacement_rejected_explicitly_and_on_exit(self):
        before = set(os.listdir("/proc/self/fd"))
        with self.assertRaises(ValueError):
            with self.hold() as held:
                path = self.fixture.root / "ops/release/deploy_release.py"
                raw = path.read_bytes()
                path.unlink()
                path.write_bytes(raw)
                path.chmod(0o644)
                with self.assertRaises(ValueError):
                    held.recheck()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_in_place_member_drift_rejected_on_normal_exit(self):
        with self.assertRaises(ValueError):
            with self.hold():
                (self.fixture.root / "ops/release/deploy_release.py").write_bytes(b"drift")

    def test_preserved_bytes_drift_rejected_explicitly_and_on_exit(self):
        with self.assertRaises(ValueError):
            with self.hold() as held:
                path = self.fixture.root / ".env"
                path.write_bytes(path.read_bytes() + b"OTHER=value\n")
                with self.assertRaises(ValueError):
                    held.recheck()

    def test_safe_but_changed_member_mode_rejected(self):
        with self.assertRaises(ValueError):
            with self.hold() as held:
                (self.fixture.root / "ops/release/deploy_release.py").chmod(0o640)
                with self.assertRaises(ValueError):
                    held.recheck()

    def test_directory_replacement_rejected_and_owned_fds_close(self):
        before = set(os.listdir("/proc/self/fd"))
        with self.assertRaises(ValueError):
            with self.hold() as held:
                path = self.fixture.root / "ops/release"
                path.rename(path.with_name("saved-release"))
                path.mkdir(mode=0o700)
                with self.assertRaises(ValueError):
                    held.recheck()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_extra_member_during_consumer_rejected_without_repair(self):
        path = self.fixture.root / "extra"
        with self.assertRaises(ValueError):
            with self.hold():
                path.write_bytes(b"unexpected")
        self.assertEqual(path.read_bytes(), b"unexpected")

    def test_network_time_replacement_rejected_before_yield(self):
        f = self.fixture
        replaced = False
        def fetch(path):
            nonlocal replaced
            result = f.fetch(path)
            if not replaced and "/contents/" in path:
                leaf = f.root / "ops/release/deploy_release.py"
                raw = leaf.read_bytes()
                leaf.unlink()
                leaf.write_bytes(raw)
                leaf.chmod(0o644)
                replaced = True
            return result
        before = set(os.listdir("/proc/self/fd"))
        with self.assertRaises(ValueError):
            with self.hold(fetch=fetch):
                self.fail("drifted installed tree was yielded")
        self.assertTrue(replaced)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_wrong_pin_and_network_failure_never_yield_and_close_owned_fds(self):
        before = set(os.listdir("/proc/self/fd"))
        with self.assertRaises(ValueError):
            with self.hold(expected_request_sha256="0" * 64):
                self.fail("wrong pin yielded")
        self.assertEqual(self.fixture.calls, [])
        f = self.fixture
        def fetch(path):
            if "/contents/" in path:
                raise OSError("repository unavailable")
            return f.fetch(path)
        with self.assertRaises(OSError):
            with self.hold(fetch=fetch):
                self.fail("failed verification yielded")
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        os.fstat(f.fd)

    def test_closed_handle_rejects_report_and_recheck_before_reusing_fds(self):
        with self.hold() as held:
            held.recheck()
        with patch.object(held, "_recheck", side_effect=AssertionError("closed FD use")):
            with self.assertRaises(ValueError):
                held.recheck()
        with self.assertRaises(ValueError):
            _ = held.report

    def test_report_copies_cannot_modify_stored_observation(self):
        with self.hold() as held:
            value = held.report
            value["transactionAdmitted"] = True
            value["preservedFiles"][".env"]["mode"] = "0o777"
            self.assertFalse(held.report["transactionAdmitted"])
            self.assertEqual(held.report["preservedFiles"][".env"]["mode"], "0o600")
            held.recheck()

    def test_live_handle_rejects_other_process_thread_and_serialization(self):
        import pickle
        with self.hold() as held:
            with patch.object(review.os, "getpid", return_value=-1):
                with self.assertRaises(ValueError):
                    held.recheck()
            with patch.object(review.threading, "get_ident", return_value=-1):
                with self.assertRaises(ValueError):
                    _ = held.report
            with self.assertRaises(TypeError):
                pickle.dumps(held)
            held.recheck()

    def test_original_exception_and_interruptions_survive_drift_and_close_error(self):
        before = set(os.listdir("/proc/self/fd"))
        close = os.close
        def failed_close(fd):
            close(fd)
            raise OSError("injected close failure after actual close")
        path = self.fixture.root / "ops/release/deploy_release.py"
        for error in (RuntimeError("consumer"), KeyboardInterrupt(), SystemExit(23)):
            with self.subTest(kind=type(error).__name__):
                with self.assertRaises(type(error)) as caught:
                    with patch.object(review.os, "close", side_effect=failed_close):
                        with self.hold() as held:
                            path.chmod(0o777)
                            raise error
                self.assertIs(caught.exception, error)
                self.assertEqual(set(os.listdir("/proc/self/fd")), before)
                with self.assertRaises(ValueError):
                    held.recheck()
                path.chmod(0o644)

    def test_normal_exit_close_failure_propagates_and_all_owned_fds_close(self):
        before = set(os.listdir("/proc/self/fd"))
        close = os.close
        def failed_close(fd):
            close(fd)
            raise OSError("injected close failure after actual close")
        with patch.object(review.os, "close", side_effect=failed_close):
            with self.assertRaises(OSError):
                with self.hold():
                    pass
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        os.fstat(self.fixture.fd)


    def test_normal_exit_inside_outer_exception_handler_still_rechecks(self):
        before = set(os.listdir("/proc/self/fd"))
        try:
            raise RuntimeError("unrelated outer handler")
        except RuntimeError:
            with self.assertRaises(ValueError):
                with self.hold():
                    (self.fixture.root / "ops/release/deploy_release.py").chmod(0o640)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)


if __name__ == "__main__":
    unittest.main()
