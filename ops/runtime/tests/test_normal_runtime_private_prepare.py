"""F4-A real file/FD preparation in a private fake namespace; no production writes."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
import hashlib
import inspect
import io
import json
import os
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
from threading import Barrier
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_private_prepare as prepare


class PrivatePrepareTests(unittest.TestCase):
    def setUp(self):
        import test_normal_runtime_readonly_review as f2
        self.fixture = f2.ReadonlyReviewTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.parent = self.root
        for part in ("root", "sanq-runtime-operator", "normal-update-preparations"):
            self.parent = self.parent / part
            self.parent.mkdir(mode=0o700)
        self.txid = self.fixture.request_doc["transactionId"]
        self.tx = self.parent / self.txid
        self.args = dict(expected_launch_sha256=f2.digest(self.fixture.launch),
                        expected_request_sha256=f2.digest(self.fixture.request),
                        target_archive=self.fixture.target, fetch=self.fixture.fetch)
        self.real_guard = prepare._require_root
        patches = [
            patch.object(prepare, "_require_root"),
            patch.object(prepare, "_OWNER", (os.getuid(), os.getgid())),
            patch.object(prepare, "_open_namespace_root",
                         side_effect=lambda: os.open(self.root, prepare._flags())),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def call(self, **changes):
        return prepare.prepare_private_target(self.fixture.launch, self.fixture.request,
                                               **{**self.args, **changes})

    def test_exact_static_bytes_manifest_archive_and_no_authority(self):
        result = self.call()
        self.assertEqual(result["memberCount"], 17)
        self.assertEqual(result["preparedFileCount"], 20)
        self.assertEqual(set(p.name for p in self.tx.iterdir()),
                         {"candidate", "original.tar.gz", "preparation.json"})
        for name, raw in self.fixture.target_files.items():
            path = self.tx / "candidate" / name
            self.assertEqual(path.read_bytes(), raw)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.tx / "original.tar.gz").read_bytes(), self.fixture.target)
        with tarfile.open(fileobj=io.BytesIO(self.fixture.target), mode="r:gz") as tar:
            original = tar.extractfile("sanq-runtime/" + prepare.MANIFEST).read()
        self.assertEqual((self.tx / "candidate" / prepare.MANIFEST).read_bytes(), original)
        record_raw = (self.tx / "preparation.json").read_bytes()
        record = json.loads(record_raw)
        self.assertEqual(result["preparationRecordSha256"], prepare.digest(record_raw))
        self.assertEqual(record["phase"], "CONTENT_SYNCED_NOT_ADMITTED")
        self.assertEqual(len(record["files"]), 19)
        for name, item in record["files"].items():
            raw = (self.tx / name).read_bytes()
            self.assertEqual(item, {"bytes": len(raw), "sha256": prepare.digest(raw)})
        self.assertEqual(result["treeInode"], self.tx.stat().st_ino)
        for key in ("dynamicStateCopied", "currentInstallationVerified", "namespaceAuthenticated",
                    "continuousMaintenanceVerified", "transactionAdmitted", "flowInvoked",
                    "readyToInstall", "authorizedToMutateProduction"):
            self.assertIs(result[key], False)
        self.assertEqual(result["decision"], "BLOCKED")
        self.assertFalse(any(p.name in (".env", ".sanq-release-state.json",
                                       ".sanq-backup-layout-activated") for p in self.tx.rglob("*")))

    def test_second_attempt_refused_without_overwriting_completed_tree(self):
        self.call()
        before = {p.relative_to(self.tx): p.read_bytes() for p in self.tx.rglob("*") if p.is_file()}
        with self.assertRaises(FileExistsError):
            self.call()
        self.assertEqual(before, {p.relative_to(self.tx): p.read_bytes()
                                  for p in self.tx.rglob("*") if p.is_file()})

    def test_existing_partial_file_directory_and_symlink_all_refused(self):
        held = self.root / "outside"
        held.write_bytes(b"must stay unchanged")
        for kind in ("directory", "file", "symlink"):
            if kind == "directory":
                self.tx.mkdir(mode=0o700)
                (self.tx / "partial").write_bytes(b"retain")
            elif kind == "file":
                self.tx.write_bytes(b"retain")
            else:
                self.tx.symlink_to(held)
            with self.subTest(kind=kind), self.assertRaises(FileExistsError):
                self.call()
            self.assertEqual(held.read_bytes(), b"must stay unchanged")
            if self.tx.is_dir() and not self.tx.is_symlink():
                self.assertEqual((self.tx / "partial").read_bytes(), b"retain")
                (self.tx / "partial").unlink()
                self.tx.rmdir()
            else:
                self.tx.unlink()

    def test_bad_input_or_target_digest_has_no_output(self):
        for changes in ({"expected_request_sha256": "0" * 64},
                        {"target_archive": b"corrupt"},
                        {"target_archive": bytearray(self.fixture.target)}):
            with self.subTest(changes=tuple(changes)), self.assertRaises(ValueError):
                self.call(**changes)
            self.assertEqual(list(self.parent.iterdir()), [])

    def test_pinned_target_mismatch_refused_before_parent_open(self):
        self.fixture.request = prepare.canonical({**self.fixture.request_doc,
                                                 "targetArchiveDigest": "sha256:" + "1" * 64})
        self.args["expected_request_sha256"] = prepare.digest(self.fixture.request)
        with patch.object(prepare, "_parent", side_effect=AssertionError("no output scope")):
            with self.assertRaisesRegex(ValueError, "proof differs"):
                self.call()

    def test_non_newest_target_refused_without_fallback(self):
        def fetch(path):
            if "/commits?sha=main" in path:
                return []
            return self.fixture.fetch(path)
        with self.assertRaises(ValueError):
            self.call(fetch=fetch)
        self.assertEqual(list(self.parent.iterdir()), [])

    def test_required_parent_not_created_and_existing_permissions_not_repaired(self):
        self.parent.chmod(0o755)
        with self.assertRaises(ValueError):
            self.call()
        self.assertEqual(self.parent.stat().st_mode & 0o777, 0o755)
        self.parent.chmod(0o700)
        self.parent.rmdir()
        with self.assertRaises(OSError):
            self.call()
        self.assertFalse(self.parent.exists())

    def test_symlink_parent_and_wrong_owner_refused(self):
        held = self.parent.with_name("held")
        self.parent.rename(held)
        self.parent.symlink_to(held, target_is_directory=True)
        with self.assertRaises((ValueError, OSError)):
            self.call()
        self.parent.unlink()
        held.rename(self.parent)
        with patch.object(prepare, "_OWNER", (12345, 12345)):
            with self.assertRaises(ValueError):
                self.call()
        self.assertEqual(list(self.parent.iterdir()), [])

    def test_partial_writes_are_completed_and_zero_progress_refused(self):
        write = os.write
        def partial(fd, data):
            return write(fd, data[:max(1, len(data) // 2)])
        with patch.object(prepare.os, "write", side_effect=partial):
            self.assertEqual(self.call()["preparedFileCount"], 20)
        # Use a new valid txid through independently rebound canonical inputs.
        self._new_transaction("c1-private-second-001")
        with patch.object(prepare.os, "write", return_value=0):
            with self.assertRaisesRegex(ValueError, "progress"):
                self.call()
        self.assertTrue(self.tx.is_dir())
        self.assertFalse((self.tx / "preparation.json").exists())

    def _new_transaction(self, txid):
        launch = json.loads(self.fixture.launch)
        launch["transactionId"] = txid
        launch["argv"][-1] = txid
        self.fixture.launch = prepare.canonical(launch)
        self.fixture.request = prepare.canonical({**self.fixture.request_doc,
            "transactionId": txid, "launchMaterialsSha256": prepare.digest(self.fixture.launch)})
        self.args["expected_launch_sha256"] = prepare.digest(self.fixture.launch)
        self.args["expected_request_sha256"] = prepare.digest(self.fixture.request)
        self.txid, self.tx = txid, self.parent / txid

    def test_write_failure_preserves_partial_outputs_and_prevents_retry(self):
        write = os.write
        count = 0
        def fail(fd, data):
            nonlocal count
            count += 1
            if count == 3:
                raise OSError("synthetic disk failure")
            return write(fd, data)
        with patch.object(prepare.os, "write", side_effect=fail):
            with self.assertRaises(OSError):
                self.call()
        self.assertTrue(list(self.tx.rglob("*")))
        self.assertFalse((self.tx / "preparation.json").exists())
        with self.assertRaises(FileExistsError):
            self.call()

    def test_file_fsync_failure_is_not_reported_complete(self):
        sync = os.fsync
        def fail(fd):
            if stat.S_ISREG(os.fstat(fd).st_mode):
                raise OSError("synthetic file sync failure")
            sync(fd)
        with patch.object(prepare.os, "fsync", side_effect=fail):
            with self.assertRaises(OSError):
                self.call()
        self.assertTrue(self.tx.exists())
        self.assertFalse((self.tx / "preparation.json").exists())

    def test_directory_fsync_failure_after_receipt_does_not_enable_resume(self):
        sync = os.fsync
        def fail(fd):
            if (self.tx / "preparation.json").exists() and stat.S_ISDIR(os.fstat(fd).st_mode):
                raise OSError("synthetic directory sync failure")
            sync(fd)
        with patch.object(prepare.os, "fsync", side_effect=fail):
            with self.assertRaises(OSError):
                self.call()
        self.assertTrue((self.tx / "preparation.json").exists())
        with self.assertRaises(FileExistsError):
            self.call()

    def test_directory_syncs_follow_file_syncs_and_receipt_is_last_file(self):
        sync = os.fsync
        events = []
        def observe(fd):
            events.append(("file" if stat.S_ISREG(os.fstat(fd).st_mode) else "dir",
                           Path(os.readlink(f"/proc/self/fd/{fd}")).name))
            sync(fd)
        with patch.object(prepare.os, "fsync", side_effect=observe):
            self.call()
        files = [(i, n) for i, (kind, n) in enumerate(events) if kind == "file"]
        self.assertEqual(len(files), 20)
        self.assertEqual(files[-1][1], "preparation.json")
        self.assertTrue(any(kind == "dir" for kind, _ in events[files[-2][0]+1:files[-1][0]]))
        self.assertTrue(all(kind == "dir" for kind, _ in events[files[-1][0]+1:]))

    def test_readback_corruption_refused_without_cleanup(self):
        real = prepare._new_file
        done = False
        def corrupt(*args, **kwargs):
            nonlocal done
            fd, key = real(*args, **kwargs)
            if not done:
                done = True
                os.pwrite(fd, b"X", 0)
            return fd, key
        with patch.object(prepare, "_new_file", side_effect=corrupt):
            with self.assertRaises(ValueError):
                self.call()
        self.assertTrue(self.tx.exists())
        self.assertFalse((self.tx / "preparation.json").exists())

    def test_directory_replacement_refused_before_receipt(self):
        real = prepare._new_file
        done = False
        def swap(*args, **kwargs):
            nonlocal done
            value = real(*args, **kwargs)
            if not done:
                done = True
                candidate = self.tx / "candidate"
                candidate.rename(self.tx / "held-candidate")
                candidate.mkdir(mode=0o700)
            return value
        with patch.object(prepare, "_new_file", side_effect=swap):
            with self.assertRaises(ValueError):
                self.call()
        self.assertFalse((self.tx / "preparation.json").exists())

    def test_concurrent_same_transaction_has_only_one_creator(self):
        barrier = Barrier(2)
        real = prepare._new_directory
        def contend(parent, name, device, stack):
            if name == self.txid:
                barrier.wait(timeout=5)
            return real(parent, name, device, stack)
        def attempt():
            try:
                return self.call()["status"]
            except FileExistsError:
                return "COLLISION"
        with patch.object(prepare, "_new_directory", side_effect=contend), ThreadPoolExecutor(2) as pool:
            futures = [pool.submit(attempt) for _ in range(2)]
            results = [f.result(timeout=20) for f in futures]
        self.assertCountEqual(results, ["INERT_STATIC_PREPARED_ONLY", "COLLISION"])

    def test_failure_closes_all_owned_fds(self):
        before = set(os.listdir("/proc/self/fd"))
        with patch.object(prepare.os, "write", side_effect=OSError("offline failure")):
            with self.assertRaises(OSError):
                self.call()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_wrong_device_new_directory_is_retained_but_never_admitted(self):
        fd = os.open(self.parent, prepare._flags())
        try:
            with ExitStack() as stack:
                with self.assertRaisesRegex(ValueError, "newly created directory"):
                    prepare._new_directory(fd, "wrong-device", os.fstat(fd).st_dev + 1, stack)
            self.assertTrue((self.parent / "wrong-device").is_dir())
        finally:
            os.close(fd)

    def test_no_public_path_owner_override_and_real_root_guard(self):
        params = inspect.signature(prepare.prepare_private_target).parameters
        for name in ("path", "parent", "root", "root_fd", "owner", "uid"):
            self.assertNotIn(name, params)
        self.assertNotIn(inspect.Parameter.VAR_KEYWORD, {p.kind for p in params.values()})
        with patch.object(prepare.os, "getuid", return_value=12345):
            with self.assertRaises(ValueError):
                self.real_guard()

    def test_nonregular_collision_cannot_overwrite_outside_file(self):
        real = prepare._new_file
        outside = self.root / "outside"
        outside.write_bytes(b"original")
        done = False
        def collide(parent, name, *args, **kwargs):
            nonlocal done
            if not done:
                done = True
                os.symlink(str(outside), name, dir_fd=parent)
            return real(parent, name, *args, **kwargs)
        with patch.object(prepare, "_new_file", side_effect=collide):
            with self.assertRaises(FileExistsError):
                self.call()
        self.assertEqual(outside.read_bytes(), b"original")


if __name__ == "__main__":
    unittest.main()
