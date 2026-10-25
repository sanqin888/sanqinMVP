"""R1-B: inert non-root Linux fixtures and mocked root CLI; never live Guest."""
from __future__ import annotations

import copy
import hashlib
import io
import json
import os
import stat
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import root_python_r1b_guest_capture as capture  # noqa: E402
import root_python_dependency_alias_fds as aliases  # noqa: E402
import root_python_dependency_fd_observer as observer  # noqa: E402
import root_python_dependency_manifest as contract  # noqa: E402
import root_python_dependency_guest_evidence as packet_api  # noqa: E402


def manifest():
    bodies = {
        "/usr/bin/python3.12": b"inert synthetic interpreter; not executable\n",
        "/lib64/ld-linux-x86-64.so.2": b"inert synthetic loader; not ELF\n",
        "/usr/lib/python3.12/os.py": b"inert synthetic module; never imported\n",
    }
    pins = {p: hashlib.sha256(b).hexdigest() for p, b in bodies.items()}
    nodes = [
        {"id": "interpreter", "kind": "python-executable", "path": "/usr/bin/python3.12",
         "sha256": pins["/usr/bin/python3.12"], "requires": ["loader", "py:os"]},
        {"id": "loader", "kind": "elf-loader", "path": "/lib64/ld-linux-x86-64.so.2",
         "sha256": pins["/lib64/ld-linux-x86-64.so.2"], "requires": []},
        {"id": "py:os", "kind": "stdlib-module", "path": "/usr/lib/python3.12/os.py",
         "sha256": pins["/usr/lib/python3.12/os.py"], "requires": []},
    ]
    graph = {"schema": contract.SCHEMA, "platform": {
        "os": "linux", "architecture": "x86_64", "pythonVersion": "3.12.3",
        "isolationFlags": ["-I", "-S", "-B"]}, "nodes": nodes}
    return graph, pins, hashlib.sha256(contract.canonical_manifest_bytes(graph)).hexdigest(), bodies


def proposal(context=None):
    graph, pins, digest, _ = manifest()
    claims = {
        "sessionId": "synthetic-only", "vmUuid": "11111111-1111-1111-1111-111111111111",
        "diskUuid": "22222222-2222-2222-2222-222222222222",
        "snapshotUuid": "33333333-3333-3333-3333-333333333333",
        "guestBootId": "44444444-4444-4444-4444-444444444444",
        "rootFsUuid": "55555555-5555-5555-5555-555555555555",
        "osId": "ubuntu", "osVersion": "24.04.5", "architecture": "x86_64",
        "pythonVersion": "3.12.3", "mountNamespace": "mnt:[1234]",
        "rootDevice": 2050, "rootInode": 2, "rootUid": 0, "rootGid": 0,
        "rootMode": 0o40755,
    }
    if context:
        for k in claims.keys() & context.keys():
            claims[k] = context[k]
    return {"schema": capture.PROPOSAL_SCHEMA, "sessionClaims": claims,
            "manifest": graph, "manifestSha256": digest, "filePins": pins,
            "mountRecord": {"device": "8:2", "mountRoot": "/", "mountPoint": "/",
                            "fsType": "ext4", "source": "/dev/sda2"}}


MODULES = {
    capture.SOURCE_MODULES[0]: contract,
    capture.SOURCE_MODULES[-1]: packet_api,
}


def isolated_flags():
    # Preserve all host-version flags used internally by argparse/the stdlib.
    flags = {k: getattr(sys.flags, k) for k in dir(sys.flags)
             if not k.startswith("_") and not callable(getattr(sys.flags, k))}
    flags.update(isolated=1, no_site=1, dont_write_bytecode=1)
    return types.SimpleNamespace(**flags)


class ProposalAndSourcesTests(unittest.TestCase):
    def test_three_file_proposal_is_structural_only(self):
        self.assertIsNone(capture.validate_proposal(proposal(), MODULES))

    def test_wrong_schema_extra_fields_and_missing_claims_rejected(self):
        for change in ("schema", "extra", "missing"):
            p = proposal()
            if change == "schema":
                p["schema"] = "unapproved"
            elif change == "extra":
                p["execute"] = True
            else:
                del p["sessionClaims"]["guestBootId"]
            with self.subTest(change=change), self.assertRaises(ValueError):
                capture.validate_proposal(p, MODULES)

    def test_wrong_root_owner_mode_and_mount_model_rejected(self):
        for key, value in (("rootUid", 1000), ("rootGid", 1000), ("rootMode", 0o40777)):
            p = proposal()
            p["sessionClaims"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                capture.validate_proposal(p, MODULES)
        for key, value in (("fsType", "overlay"), ("mountPoint", "/tmp")):
            p = proposal()
            p["mountRecord"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                capture.validate_proposal(p, MODULES)

    def test_unknown_member_pin_and_wrong_manifest_hash_rejected(self):
        for change in ("extra-pin", "wrong-hash"):
            p = proposal()
            if change == "extra-pin":
                p["filePins"]["/etc/unapproved"] = "0" * 64
            else:
                p["manifestSha256"] = "0" * 64
            with self.subTest(change=change), self.assertRaises(ValueError):
                capture.validate_proposal(p, MODULES)

    def test_duplicate_nonfinite_or_nonobject_json_rejected(self):
        for raw in (b'{"a":1,"a":2}', b'{"value":NaN}', b'[]'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                capture.json_object(raw)

    def test_bounded_fd_rejects_output_over_budget(self):
        r, w = os.pipe()
        try:
            os.write(w, b"12345")
            os.close(w)
            w = None
            with self.assertRaisesRegex(capture.R1BCaptureBlocked, "budget"):
                capture.bounded_fd(r, 4)
        finally:
            os.close(r)
            if w is not None:
                os.close(w)

    def source_fixture(self):
        sources = {n: b"VALUE = 1\n" for n in capture.SOURCE_FILES}
        index = {"schema": capture.SOURCE_SCHEMA, "repoCommitSha": "a" * 40,
                 "files": {n: capture.sha(b) for n, b in sources.items()}}
        raw = capture.encoded(index)
        return sources, raw

    def test_source_set_checks_all_hashes_before_executing_modules(self):
        sources, raw = self.source_fixture()
        def read(path, maximum, **kwargs):
            return raw if Path(path).name == "source-set.json" else sources[Path(path).name]
        with mock.patch.object(capture, "__file__", "/review/root_python_r1b_guest_capture.py"), \
             mock.patch.object(capture, "read_owned", side_effect=read), mock.patch.dict(sys.modules):
            index, modules = capture.load_sources("/review/source-set.json", capture.sha(raw))
            self.assertEqual(set(modules), set(capture.SOURCE_MODULES))
            self.assertTrue(all(m.VALUE == 1 for m in modules.values()))
            self.assertEqual(index["repoCommitSha"], "a" * 40)

    def test_source_hash_mismatch_blocks_before_any_module_execution(self):
        sources, raw = self.source_fixture()
        sources[capture.SOURCE_MODULES[0] + ".py"] = b"raise AssertionError('must not execute')\n"
        def read(path, maximum, **kwargs):
            return raw if Path(path).name == "source-set.json" else sources[Path(path).name]
        with mock.patch.object(capture, "__file__", "/review/root_python_r1b_guest_capture.py"), \
             mock.patch.object(capture, "read_owned", side_effect=read), \
             self.assertRaisesRegex(capture.R1BCaptureBlocked, "source hash"):
            capture.load_sources("/review/source-set.json", capture.sha(raw))

    def test_source_index_hash_mismatch_rejected_before_sources_read(self):
        _, raw = self.source_fixture()
        with mock.patch.object(capture, "read_owned", return_value=raw) as read, \
             self.assertRaisesRegex(capture.R1BCaptureBlocked, "approved bytes"):
            capture.load_sources("/review/source-set.json", "0" * 64)
        self.assertEqual(read.call_count, 1)

    def test_source_index_missing_file_or_wrong_collector_location_rejected(self):
        _, raw = self.source_fixture()
        with mock.patch.object(capture, "read_owned", return_value=raw), \
             mock.patch.object(capture, "__file__", "/elsewhere/root_python_r1b_guest_capture.py"), \
             self.assertRaisesRegex(capture.R1BCaptureBlocked, "source directory"):
            capture.load_sources("/review/source-set.json", capture.sha(raw))
        index = capture.json_object(raw)
        del index["files"][capture.SOURCE_MODULES[0] + ".py"]
        raw = capture.encoded(index)
        with mock.patch.object(capture, "read_owned", return_value=raw), \
             self.assertRaisesRegex(capture.R1BCaptureBlocked, "source-set"):
            capture.load_sources("/review/source-set.json", capture.sha(raw))

    def owned_reader_fixture(self, *, parent_mode=0o700, file_mode=0o600,
                             file_uid=0, links=1):
        def info(mode, inode, size=0, uid=0, nlink=1):
            return types.SimpleNamespace(st_mode=mode, st_dev=1, st_ino=inode,
                st_uid=uid, st_gid=0, st_nlink=nlink, st_size=size,
                st_mtime_ns=10, st_ctime_ns=10)
        values = {10: info(stat.S_IFDIR | 0o755, 1),
                  11: info(stat.S_IFDIR | parent_mode, 2),
                  12: info(stat.S_IFREG | file_mode, 3, 2, file_uid, links)}
        def entry(name, **kwargs):
            return values[11 if name == "stage" else 12]
        return values, entry

    def test_owned_reader_private_permissions_and_held_entry_checks(self):
        values, entry = self.owned_reader_fixture()
        with mock.patch.object(capture.os, "open", side_effect=[10, 11, 12]), \
             mock.patch.object(capture.os, "fstat", side_effect=values.__getitem__), \
             mock.patch.object(capture.os, "stat", side_effect=entry), \
             mock.patch.object(capture.os, "close") as closed, \
             mock.patch.object(capture, "bounded_fd", return_value=b"{}"):
            self.assertEqual(capture.read_owned("/stage/input.json", 100, private=True), b"{}")
        self.assertEqual([c.args[0] for c in closed.call_args_list], [12, 11, 10])

    def test_owned_reader_rejects_readable_private_input_or_writable_owner(self):
        for options in ({"parent_mode": 0o755}, {"parent_mode": 0o777},
                        {"file_mode": 0o644}, {"file_mode": 0o622},
                        {"file_uid": 1000}, {"links": 2}):
            values, entry = self.owned_reader_fixture(**options)
            with self.subTest(options=options), \
                 mock.patch.object(capture.os, "open", side_effect=[10, 11, 12]), \
                 mock.patch.object(capture.os, "fstat", side_effect=values.__getitem__), \
                 mock.patch.object(capture.os, "stat", side_effect=entry), \
                 mock.patch.object(capture.os, "close"), \
                 mock.patch.object(capture, "bounded_fd", return_value=b"{}"), \
                 self.assertRaises(ValueError):
                capture.read_owned("/stage/input.json", 100, private=True)

    def test_owned_reader_rejects_relative_and_traversal_paths_before_open(self):
        for path in ("relative", "/review/../input", "/review//input"):
            with self.subTest(path=path), mock.patch.object(capture.os, "open") as opened, \
                 self.assertRaises(capture.R1BCaptureBlocked):
                capture.read_owned(path, 100)
            opened.assert_not_called()


@unittest.skipUnless(sys.platform == "linux" and hasattr(os, "O_PATH"),
                     "Linux O_PATH and procfs are required")
class GuestSessionSyntheticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sanq-r1b-fixture-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.manifest, self.pins, self.pin, bodies = manifest()
        for logical, raw in bodies.items():
            leaf = ("/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"
                    if logical.startswith("/lib64/") else logical)
            path = self.root / leaf.lstrip("/")
            path.parent.mkdir(parents=True, exist_ok=True)
            for parent in path.parents:
                if parent == self.root:
                    break
                parent.chmod(0o700)
            path.write_bytes(raw)
            path.chmod(0o600)
        (self.root / "usr/lib64").mkdir()
        (self.root / "usr/lib64").chmod(0o700)
        (self.root / "lib").symlink_to("usr/lib")
        (self.root / "lib64").symlink_to("usr/lib64")
        (self.root / "usr/lib64/ld-linux-x86-64.so.2").symlink_to(
            capture.LINKS["/usr/lib64/ld-linux-x86-64.so.2"])
        self.fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        self.addCleanup(os.close, self.fd)
        self.expected = capture.root_context(self.fd, _fixture_root=str(self.root))

    def run_capture(self, expected=None):
        return capture.observe_session(
            self.fd, manifest=self.manifest, manifest_sha256=self.pin, pins=self.pins,
            expected_context=self.expected if expected is None else expected,
            alias_api=aliases, observer_api=observer, _fixture_uid=os.getuid(),
            _fixture_gid=os.getgid(), _fixture_root=str(self.root))

    def test_real_held_fd_handoff_and_separate_lib_link_stay_blocked(self):
        result = self.run_capture()
        observation = result["fdObservation"]
        self.assertEqual({r["path"]: r["sha256"] for r in observation["files"]}, self.pins)
        self.assertEqual(result["extraRootAlias"]["linkText"], "usr/lib")
        self.assertEqual(result["extraRootAlias"]["mode"], 0o777)
        self.assertEqual(len(result["aliasTraces"]["/lib64/ld-linux-x86-64.so.2"]
                             ["observedLinkCandidates"]), 2)
        for trace in result["aliasTraces"].values():
            self.assertEqual(trace["decision"], "BLOCKED")
            self.assertFalse(trace["pathAndRootProvenanceAuthenticated"])
        self.assertFalse(observation["rootExecutionAttempted"])
        self.assertFalse(observation["readyToInstall"])

    def test_boot_namespace_and_root_identity_mismatch_rejected(self):
        for key, value in (("guestBootId", "wrong"), ("mountNamespace", "mnt:[1]"),
                           ("rootInode", self.expected["rootInode"] + 1)):
            expected = copy.deepcopy(self.expected)
            expected[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "approved candidate context"):
                self.run_capture(expected)

    def test_corrupted_regular_bytes_rejected(self):
        (self.root / "usr/lib/python3.12/os.py").write_bytes(b"changed inert bytes\n")
        with self.assertRaisesRegex(ValueError, "frozen candidate pins"):
            self.run_capture()

    def test_wrong_extra_root_link_is_rejected(self):
        link = self.root / "lib"
        link.unlink()
        link.symlink_to("usr/other")
        self.expected = capture.root_context(self.fd, _fixture_root=str(self.root))
        with self.assertRaisesRegex(ValueError, "alias FD/text"):
            self.run_capture()

    def test_wrong_loader_link_is_rejected_by_original_b1(self):
        link = self.root / "usr/lib64/ld-linux-x86-64.so.2"
        link.unlink()
        link.symlink_to("../lib/other")
        with self.assertRaises(ValueError):
            self.run_capture()

    def test_unused_alias_claim_is_still_rejected(self):
        with mock.patch.dict(capture.LINKS, {"/lib": "usr/lib"}), \
             self.assertRaisesRegex(ValueError, "unused"):
            self.run_capture()

    def test_namespace_change_before_capture_closure_blocks(self):
        changed = copy.deepcopy(self.expected)
        changed["mountNamespace"] = "mnt:[1]"
        with mock.patch.object(capture, "root_context", side_effect=[self.expected, changed]), \
             self.assertRaisesRegex(ValueError, "context changed"):
            self.run_capture()

    def test_root_alias_replacement_during_read_blocks(self):
        original = observer.capture_preopened_dependency_fds
        def changed(*args, **kwargs):
            result = original(*args, **kwargs)
            link = self.root / "lib"
            link.unlink()
            link.symlink_to("usr/lib")
            return result
        with mock.patch.object(observer, "capture_preopened_dependency_fds", side_effect=changed), \
             self.assertRaises(ValueError):
            self.run_capture()

    def test_regular_descriptor_is_not_accepted_as_root(self):
        fd = os.open(self.root / "usr/bin/python3.12", os.O_RDWR)
        try:
            with self.assertRaisesRegex(ValueError, "root anchor"):
                capture.root_context(fd, _fixture_root=str(self.root))
        finally:
            os.close(fd)

    def test_opath_directory_is_not_a_readable_root_anchor(self):
        fd = os.open(self.root, os.O_PATH | os.O_DIRECTORY)
        try:
            with self.assertRaisesRegex(ValueError, "root anchor"):
                capture.root_context(fd, _fixture_root=str(self.root))
        finally:
            os.close(fd)

    def test_borrowed_file_fds_close_before_returning_observation(self):
        original = observer.capture_preopened_dependency_fds
        borrowed = {}
        def observe(*args, **kwargs):
            borrowed.update(kwargs["opened_file_fds"])
            return original(*args, **kwargs)
        with mock.patch.object(observer, "capture_preopened_dependency_fds", side_effect=observe):
            self.run_capture()
        self.assertEqual(set(borrowed), capture.PATHS)
        for fd in borrowed.values():
            with self.assertRaises(OSError):
                os.fstat(fd)

    def test_root_path_replacement_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "expected root"):
            capture.root_context(self.fd, _fixture_root=str(self.root / "usr"))

    def test_mocked_root_cli_assembles_existing_packet_without_granting_authority(self):
        # Only the root CLI boundary is mocked; packet schema validation is real.
        result = self.run_capture()
        result = copy.deepcopy(result)
        context = result["context"]
        context.update(rootUid=0, rootGid=0, rootMode=0o40755)
        context["rootIdentity"][2:5] = [0o40755, 0, 0]
        for record in result["fdObservation"]["files"]:
            record.update(uid=0, gid=0)
        for trace in result["aliasTraces"].values():
            for link in trace["observedLinkCandidates"]:
                link.update(uid=0, gid=0)
        result["extraRootAlias"].update(uid=0, gid=0)
        p = proposal(context)
        p["mountRecord"] = {k: context["mountRecord"][k] for k in
                           ("device", "mountRoot", "mountPoint", "fsType", "source")}
        # Keep the fixed Guest mount policy inert and explicit at the CLI boundary.
        p["mountRecord"].update(mountRoot="/", mountPoint="/", fsType="ext4")
        context["mountRecord"].update(p["mountRecord"])
        raw = capture.encoded(p)
        source_index = {"schema": capture.SOURCE_SCHEMA, "repoCommitSha": "a" * 40,
                        "files": {n: "b" * 64 for n in capture.SOURCE_FILES}}
        modules = dict(MODULES)
        modules[capture.SOURCE_MODULES[1]] = aliases
        modules[capture.SOURCE_MODULES[2]] = observer
        output = types.SimpleNamespace(buffer=io.BytesIO())
        borrowed_root = os.dup(self.fd)
        from contextlib import ExitStack
        patches = [
            mock.patch.object(capture.sys, "platform", "linux"),
            mock.patch.object(capture.platform, "machine", return_value="x86_64"),
            mock.patch.object(capture.sys, "version_info", (3, 12, 3)),
            mock.patch.object(capture.sys, "flags", isolated_flags()),
            mock.patch.object(capture.os, "getuid", return_value=0),
            mock.patch.object(capture.os, "geteuid", return_value=0),
            mock.patch.object(capture.os, "getgid", return_value=0),
            mock.patch.object(capture.os, "getegid", return_value=0),
            mock.patch.object(capture.sys, "stdout", output),
            mock.patch.object(capture, "load_sources", return_value=(source_index, modules)),
            mock.patch.object(capture, "read_owned", return_value=raw),
            mock.patch.object(capture.os, "open", return_value=borrowed_root),
            mock.patch.object(capture, "root_context", return_value=context),
            mock.patch.object(capture, "observe_session", return_value=result),
        ]
        argv = ["--proposal", "/review/proposal.json",
                "--approved-proposal-sha256", capture.sha(raw),
                "--source-index", "/review/source-set.json",
                "--approved-source-index-sha256", "c" * 64,
                "--collector-id", "synthetic-root-boundary"]
        with ExitStack() as stack:
            for patch in patches:
                stack.enter_context(patch)
            status = capture.main(argv)
        receipt = json.loads(output.buffer.getvalue())
        self.assertEqual(status, 0, receipt["failure"])
        self.assertTrue(receipt["collectionCompleted"])
        self.assertTrue(receipt["collectorRanAsRoot"])
        for field in ("rootAndPlatformAuthenticated", "actualExecutionWitnessed",
                      "externalReleaseProvenanceAuthenticated", "readyToInstall",
                      "authorizedToMutateProduction"):
            self.assertIs(receipt[field], False)
            self.assertIs(receipt["guestPacket"][field], False)
        self.assertEqual(receipt["guestPacket"]["decision"], "BLOCKED")
        self.assertFalse(receipt["guestPacket"]["fdObservation"]["rootExecutionAttempted"])
        with self.assertRaises(OSError):
            os.fstat(borrowed_root)

    def test_observer_failure_is_not_converted_to_success(self):
        with mock.patch.object(observer, "capture_preopened_dependency_fds",
                               side_effect=ValueError("synthetic read failure")), \
             self.assertRaisesRegex(ValueError, "synthetic read failure"):
            self.run_capture()


class RootCliBoundaryTests(unittest.TestCase):
    ARGV = ["--proposal", "/review/proposal.json", "--approved-proposal-sha256", "0" * 64,
            "--source-index", "/review/source-set.json", "--approved-source-index-sha256", "1" * 64,
            "--collector-id", "fixture-only"]

    def output(self):
        return types.SimpleNamespace(buffer=io.BytesIO())

    def test_normal_user_cannot_start_root_capture_or_read_inputs(self):
        output = self.output()
        with mock.patch.object(capture.sys, "stdout", output), \
             mock.patch.object(capture.os, "geteuid", return_value=1000), \
             mock.patch.object(capture, "load_sources") as loader:
            status = capture.main(self.ARGV)
        receipt = json.loads(output.buffer.getvalue())
        loader.assert_not_called()
        self.assertEqual(status, 2)
        self.assertFalse(receipt["collectionCompleted"])
        self.assertIsNotNone(receipt["failure"])
        self.assertFalse(receipt["readyToInstall"])
        self.assertFalse(receipt["authorizedToMutateProduction"])

    def test_preflight_failure_emits_bounded_failure_receipt(self):
        output = self.output()
        patches = [
            mock.patch.object(capture.sys, "platform", "linux"),
            mock.patch.object(capture.platform, "machine", return_value="x86_64"),
            mock.patch.object(capture.sys, "version_info", (3, 12, 3)),
            mock.patch.object(capture.sys, "flags", isolated_flags()),
            mock.patch.object(capture.os, "getuid", return_value=0),
            mock.patch.object(capture.os, "geteuid", return_value=0),
            mock.patch.object(capture.os, "getgid", return_value=0),
            mock.patch.object(capture.os, "getegid", return_value=0),
            mock.patch.object(capture.sys, "stdout", output),
            mock.patch.object(capture, "load_sources", side_effect=ValueError("x" * 3000)),
        ]
        from contextlib import ExitStack
        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            status = capture.main(self.ARGV)
        receipt = json.loads(output.buffer.getvalue())
        self.assertEqual(status, 2)
        self.assertLessEqual(len(receipt["failure"]["message"]), 1024)
        self.assertTrue(receipt["collectorRanAsRoot"])
        self.assertFalse(receipt["rootAndPlatformAuthenticated"])
        self.assertFalse(receipt["actualExecutionWitnessed"])
        self.assertFalse(receipt["readyToInstall"])
        self.assertIsNone(receipt["guestPacket"])


if __name__ == "__main__":
    unittest.main()
