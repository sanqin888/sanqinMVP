"""F4-B3 actual fixed-tree target verification with offline publication fixtures."""
import inspect
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_postinstall_review as post
import normal_runtime_readonly_anchor as anchor
from normal_runtime_launch import canonical, digest


class PostinstallReviewTests(unittest.TestCase):
    def setUp(self):
        import test_normal_runtime_readonly_review as f2
        self.fixture = f2.ReadonlyReviewTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.namespace = Path(self.tmp.name)
        self.namespace.chmod(0o700)
        self.runtime = self.namespace / "opt/sanq/runtime"
        self.runtime.mkdir(parents=True, mode=0o700)
        self.launch, self.request = self.fixture.launch, self.fixture.request
        self.observation = self.fixture.observation
        self.target = self.fixture.target
        with tarfile.open(fileobj=io.BytesIO(self.target), mode="r:gz") as tar:
            self.target_manifest = tar.extractfile("sanq-runtime/" + post.MANIFEST).read()
        self.installed = {**self.fixture.installed, **self.fixture.target_files,
                          post.MANIFEST: self.target_manifest}
        for name, raw in self.installed.items():
            path = self.runtime / name
            path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            path.write_bytes(raw)
            path.chmod(0o600 if name in (".env", ".sanq-release-state.json") else 0o644)
        for p in (patch.object(anchor, "_ROOT_OWNER", (os.getuid(), os.getgid())),
                  patch.object(anchor, "_open_namespace_root",
                               side_effect=lambda: os.open(self.namespace, anchor._flags()))):
            p.start()
            self.addCleanup(p.stop)

    def call(self, **changes):
        args = dict(expected_launch_sha256=digest(self.launch),
                    expected_request_sha256=digest(self.request), target_archive=self.target,
                    preserved_observation=self.observation, fetch=self.fixture.fetch)
        args.update(changes)
        return post.review_fixed_installed_target(self.launch, self.request, **args)

    def rebind_observation(self, **changes):
        doc = {**json.loads(self.observation), **changes}
        self.observation = canonical(doc)
        self.request = canonical({**json.loads(self.request),
                                  "preservedStateSha256": digest(self.observation)})

    def rebind_dynamic(self, name, raw):
        (self.runtime / name).write_bytes(raw)
        doc = json.loads(self.observation)
        doc["files"][name].update(bytes=len(raw), sha256=digest(raw))
        self.rebind_observation(files=doc["files"])

    def snapshot(self):
        return {str(p.relative_to(self.runtime)): p.read_bytes()
                for p in self.runtime.rglob("*") if p.is_file()}

    def test_actual_target_original_manifest_and_preserved_bytes_match_without_authority(self):
        before = self.snapshot()
        request = self.request
        report = self.call()
        self.assertEqual(report["status"], "TARGET_AND_PINNED_PRESERVED_BYTES_MATCH")
        self.assertEqual(report["memberCount"], 17)
        self.assertEqual(report["originalCurrentSourceSha"], "a" * 40)
        self.assertEqual(report["targetSourceSha"], "b" * 40)
        self.assertEqual(report["installedManifestSha256"], digest(self.target_manifest))
        self.assertEqual(report["originalObservationManifestSha256"],
                         digest(self.fixture.installed[post.MANIFEST]))
        self.assertNotEqual(report["installedManifestSha256"],
                            report["originalObservationManifestSha256"])
        self.assertEqual(report["requestSha256"], digest(request))
        self.assertEqual(self.request, request)
        for name in ("targetInstalledBytesMatch", "preservedBytesMatchPinnedObservation",
                     "applicationIdentityBytesMatch", "fixedRuntimePathBound"):
            self.assertIs(report[name], True)
        for name in ("installedRootPathAuthenticated", "sourceProvenanceAuthenticated",
                     "frozenBaselineAuthenticated", "containerObservationAuthenticated",
                     "storageMountsAuthenticated", "continuousMaintenanceVerified",
                     "actualHandoffVerified", "originalPoliciesRestoredVerified",
                     "businessReleaseVerified", "r2DispositionVerified",
                     "transactionAdmitted", "transactionFinalized", "flowInvoked",
                     "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(report[name], False)
        self.assertIs(report["oldArchiveBytesRequired"], False)
        self.assertEqual(report["decision"], "BLOCKED")
        self.assertEqual(report["runtimePathBinding"]["path"], "/opt/sanq/runtime")
        self.assertEqual(len(report["runtimePathBinding"]["directories"]), 4)
        self.assertNotIn("never-print-me", json.dumps(report))
        self.assertEqual(self.snapshot(), before)

    def test_original_preinstall_review_still_accepts_original_tree(self):
        # The same original request has different pre/post semantics; no repinning current=target.
        self.assertEqual(self.fixture.run_review()["currentSourceSha"], "a" * 40)
        self.assertTrue(self.call()["targetInstalledBytesMatch"])

    def test_old_runtime_tree_is_not_an_installed_target(self):
        for name in (*post.SOURCE_FILES, post.MANIFEST):
            (self.runtime / name).write_bytes(self.fixture.installed[name])
        with self.assertRaisesRegex(ValueError, "manifest differs"):
            self.call()

    def test_target_member_corruption_rejected(self):
        (self.runtime / "ops/release/deploy_release.py").write_bytes(b"corrupt source")
        with self.assertRaisesRegex(ValueError, "member bytes differ"):
            self.call()

    def test_semantically_equal_reformatted_manifest_is_not_original_bytes(self):
        doc = json.loads(self.target_manifest)
        reformatted = canonical(doc)
        self.assertEqual(json.loads(reformatted), doc)
        self.assertNotEqual(reformatted, self.target_manifest)
        (self.runtime / post.MANIFEST).write_bytes(reformatted)
        with self.assertRaisesRegex(ValueError, "manifest differs"):
            self.call()

    def test_jointly_forged_member_and_manifest_do_not_authenticate(self):
        name = "ops/release/deploy_release.py"
        raw = b"forged"
        (self.runtime / name).write_bytes(raw)
        doc = json.loads(self.target_manifest)
        doc["files"][name] = {"bytes": len(raw), "sha256": digest(raw)}
        (self.runtime / post.MANIFEST).write_bytes(canonical(doc))
        with self.assertRaisesRegex(ValueError, "manifest differs"):
            self.call()

    def test_wrong_external_pin_rejected_before_tree_or_network(self):
        with patch.object(post, "_fixed_runtime", side_effect=AssertionError("must not open")):
            with self.assertRaises(ValueError):
                self.call(expected_request_sha256="f" * 64)
        self.assertEqual(self.fixture.calls, [])

    def test_mutable_corrupt_or_wrong_digest_archive_rejected(self):
        for archive in (bytearray(self.target), b"corrupt"):
            with self.subTest(kind=type(archive).__name__), self.assertRaises(ValueError):
                self.call(target_archive=archive)
        self.request = canonical({**json.loads(self.request),
                                  "targetArchiveDigest": "sha256:" + "1" * 64})
        with self.assertRaisesRegex(ValueError, "publication differs"):
            self.call()

    def test_non_newest_publication_refused_without_fallback(self):
        def fetch(path):
            if path.endswith("/commits?sha=main&per_page=20"):
                return []
            return self.fixture.fetch(path)
        with self.assertRaises(ValueError):
            self.call(fetch=fetch)

    def test_failed_publication_and_network_unavailable_not_cached(self):
        def failed(path):
            value = self.fixture.fetch(path)
            if "/commits/" in path and "/statuses" in path:
                value[0]["state"] = "failure"
            return value
        with self.assertRaises(ValueError):
            self.call(fetch=failed)
        with self.assertRaises(OSError):
            self.call(fetch=lambda path: (_ for _ in ()).throw(OSError("offline")))

    def test_original_preserved_pin_and_raw_bytes_remain_required(self):
        with self.assertRaisesRegex(ValueError, "observation differs"):
            self.call(preserved_observation=self.observation + b" ")
        with self.assertRaises(ValueError):
            self.call(preserved_observation=bytearray(self.observation))

    def test_each_dynamic_file_drift_rejected_without_rebinding(self):
        for name in (".env", ".sanq-release-state.json", ".sanq-backup-layout-activated"):
            path = self.runtime / name
            raw = path.read_bytes()
            path.write_bytes(raw + b"x")
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.call()
            path.write_bytes(raw)

    def test_application_previous_or_pending_state_rejected_even_if_baseline_matches(self):
        old = json.loads(self.installed[".sanq-release-state.json"])
        for change in ({"phase": "pending"}, {"previous": "b" * 40},
                       {"schemaVersion": True}):
            self.rebind_dynamic(".sanq-release-state.json", canonical({**old, **change}))
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, "application state"):
                self.call()

    def test_duplicate_image_sha_and_wrong_marker_rejected_even_if_baseline_matches(self):
        raw = self.installed[".env"]
        self.rebind_dynamic(".env", raw + b"SANQ_IMAGE_SHA=" + b"c" * 40 + b"\n")
        with self.assertRaisesRegex(ValueError, "env or marker"):
            self.call()
        self.rebind_dynamic(".env", raw)
        self.rebind_dynamic(".sanq-backup-layout-activated", b"WRONG_MARKER\n")
        with self.assertRaisesRegex(ValueError, "env or marker"):
            self.call()

    def test_observation_scope_identity_and_claimed_maintenance_rejected(self):
        original = self.observation
        for change in ({"scope": "FROZEN"}, {"currentRuntimeSha": "b" * 40},
                       {"continuousMaintenanceVerified": True},
                       {"authorizedToMutateProduction": True}):
            self.observation = original
            self.rebind_observation(**change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.call()

    def test_missing_or_invalid_original_manifest_baseline_rejected(self):
        original = self.observation
        for pin in (None, "0" * 64, "bad"):
            self.observation = original
            self.rebind_observation(runtimeManifestSha256=pin)
            with self.subTest(pin=pin), self.assertRaisesRegex(ValueError, "baseline missing"):
                self.call()

    def test_symlink_hardlink_fifo_and_extra_file_rejected(self):
        path = self.runtime / "ops/release/deploy_release.py"
        saved = self.namespace / "saved-source"
        saved.write_bytes(path.read_bytes())
        for kind in ("symlink", "hardlink", "fifo"):
            path.unlink()
            if kind == "symlink":
                path.symlink_to(saved)
            elif kind == "hardlink":
                os.link(saved, path)
            else:
                os.mkfifo(path)
            with self.subTest(kind=kind), self.assertRaises((ValueError, OSError)):
                self.call()
        path.unlink()
        path.write_bytes(saved.read_bytes())
        (self.runtime / "unexpected").write_bytes(b"extra")
        with self.assertRaises(ValueError):
            self.call()

    def test_wrong_directory_source_and_dynamic_modes_rejected(self):
        for relative, mode in (("ops", 0o777), ("ops/release/deploy_release.py", 0o666),
                               (".env", 0o644)):
            path = self.runtime / relative
            previous = path.stat().st_mode & 0o7777
            path.chmod(mode)
            with self.subTest(relative=relative), self.assertRaises(ValueError):
                self.call()
            path.chmod(previous)

    def test_same_byte_file_replacement_during_network_rejected(self):
        done = False
        def fetch(path):
            nonlocal done
            value = self.fixture.fetch(path)
            if not done:
                done = True
                target = self.runtime / "ops/release/deploy_release.py"
                raw = target.read_bytes()
                target.unlink()
                target.write_bytes(raw)
            return value
        with self.assertRaisesRegex(ValueError, "changed|replaced"):
            self.call(fetch=fetch)

    def test_ancestor_replacement_during_network_rejected(self):
        done = False
        def fetch(path):
            nonlocal done
            value = self.fixture.fetch(path)
            if not done:
                done = True
                parent = self.namespace / "opt/sanq"
                parent.rename(parent.with_name("displaced-sanq"))
                parent.mkdir(mode=0o755)
            return value
        with self.assertRaises((ValueError, OSError)):
            self.call(fetch=fetch)

    def test_unsafe_or_symlink_ancestor_refused(self):
        parent = self.namespace / "opt"
        parent.chmod(0o777)
        with self.assertRaises(ValueError):
            self.call()
        parent.chmod(0o755)
        parent.rename(self.namespace / "saved-opt")
        parent.symlink_to(self.namespace / "saved-opt", target_is_directory=True)
        with self.assertRaises((ValueError, OSError)):
            self.call()

    def test_network_failure_and_success_close_owned_fds(self):
        before = set(os.listdir("/proc/self/fd"))
        self.call()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        with self.assertRaises(OSError):
            self.call(fetch=lambda p: (_ for _ in ()).throw(OSError("network failed")))
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        os.fstat(self.fixture.fd)

    def test_no_public_path_owner_fd_or_permission_override(self):
        names = set(inspect.signature(post.review_fixed_installed_target).parameters)
        self.assertEqual(names, {"launch_bytes", "request_bytes", "expected_launch_sha256",
                                "expected_request_sha256", "target_archive",
                                "preserved_observation", "fetch"})


if __name__ == "__main__":
    unittest.main()
