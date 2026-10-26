"""Held protected writer scope in fake namespace; no real approval/consumption."""
import inspect
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import normal_runtime_writer_scope as scope
import normal_runtime_source_anchor as anchor
import normal_runtime_launch as launch
import normal_runtime_update as core
import normal_runtime_source_loader as loader
from normal_runtime_writer_loader import WRITER_MODULES


class ProtectedWriterScopeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.tx = "protected-writer-001"
        self.source = self.root / scope.bootstrap.SOURCE_ROOT[1:]
        self.approval = self.root / scope.bootstrap.APPROVAL_ROOT[1:] / self.tx
        self.source.mkdir(parents=True, mode=0o700)
        self.approval.mkdir(parents=True, mode=0o700)
        sources = {n + ".py": (ROOT / (n + ".py")).read_bytes() for n in WRITER_MODULES}
        sources[scope.bootstrap.BOOTSTRAP_SOURCE] = b"raise RuntimeError('not executed')\n"
        self.materials = launch.freeze_launch_materials(source_commit="c" * 40,
            transaction_id=self.tx, bootstrap_source=scope.bootstrap.BOOTSTRAP_SOURCE,
            sources=sources)
        request = core.UpdateRequest(self.tx, "a" * 40, "b" * 40,
            "sha256:" + "1" * 64, "sha256:" + "2" * 64,
            "d" * 40, "e" * 40, "5" * 64, self.materials)
        self.launch_raw = launch.canonical(self.materials.document())
        self.request_raw = launch.canonical(request.document())
        self.args = dict(expected_launch_sha256=launch.digest(self.launch_raw),
                         expected_request_sha256=launch.digest(self.request_raw))
        for name, raw in sources.items():
            path = self.source / name
            path.write_bytes(raw)
            path.chmod(0o400)
        inputs = {"launch.json": self.launch_raw, "request.json": self.request_raw,
                  "pins.json": launch.canonical({
                      "schema": "sanq.runtime.normal-update-bootstrap-pins.v1",
                      "transactionId": self.tx, "launchSha256": self.args["expected_launch_sha256"],
                      "requestSha256": self.args["expected_request_sha256"]})}
        for name, raw in inputs.items():
            path = self.approval / name
            path.write_bytes(raw)
            path.chmod(0o400)
        own = (os.getuid(), os.getgid())
        patches = [
            patch.object(scope, "_SOURCE_OWNER", own),
            patch.object(scope.bootstrap, "_owners",
                         side_effect=lambda i: (i.st_uid, i.st_gid) == own),
            patch.object(scope.bootstrap, "_open_namespace_root",
                         side_effect=lambda: os.open(self.root, anchor._flags())),
            patch.object(anchor, "_open_namespace_root",
                         side_effect=lambda: os.open(self.root, anchor._flags())),
            patch.object(scope, "require_current_launch_process"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def call(self, tx=None, **changes):
        return scope.assemble_protected_writer(self.tx if tx is None else tx,
                                               **{**self.args, **changes})

    def test_real_protected_inputs_sources_and_private_core_held_together(self):
        before = set(os.listdir("/proc/self/fd"))
        with self.call() as candidate:
            self.assertGreater(len(os.listdir("/proc/self/fd")), len(before))
            self.assertEqual(len(candidate.loaded.modules), 8)
            private = candidate.loaded.modules["normal_runtime_update"]
            self.assertIs(type(candidate.loaded.request), private.UpdateRequest)
            self.assertEqual(candidate.launch_sha256, self.args["expected_launch_sha256"])
            scope.require_current_launch_process.assert_called_once()
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)
        self.assertFalse(loader._namespace_keys("_sanq_candidate_writer_" + self.materials.sha256()))
        self.assertEqual({p.name for p in self.root.iterdir()}, {"root"})

    def test_bad_tx_or_external_pin_rejected_before_file_capture(self):
        with patch.object(scope.bootstrap, "_capture_private_tree",
                          side_effect=AssertionError("must not open")):
            for tx in ("../escape", "", "x"):
                with self.subTest(tx=tx), self.assertRaises(ValueError):
                    with self.call(tx=tx):
                        self.fail("bad tx")
            with self.assertRaises(ValueError):
                with self.call(expected_launch_sha256="0" * 64):
                    self.fail("bad pin")

    def test_installed_pins_cannot_override_external_expectation(self):
        path = self.approval / "pins.json"
        doc = json.loads(path.read_bytes())
        doc["requestSha256"] = "9" * 64
        path.write_bytes(launch.canonical(doc))
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("unapproved installed pin")

    def test_changed_input_rejected_before_source_loading(self):
        (self.approval / "request.json").write_bytes(self.request_raw + b" ")
        with patch.object(scope, "load_pinned_writer_candidate",
                          side_effect=AssertionError("must not load")):
            with self.assertRaises(ValueError):
                with self.call():
                    self.fail("input changed")

    def test_process_gate_failure_closes_input_fds(self):
        before = set(os.listdir("/proc/self/fd"))
        with patch.object(scope, "require_current_launch_process", side_effect=ValueError("process")):
            with self.assertRaises(ValueError):
                with self.call():
                    self.fail("process mismatch")
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_input_replacement_during_consumer_rejected_at_exit(self):
        before = set(os.listdir("/proc/self/fd"))
        with self.assertRaises(ValueError):
            with self.call():
                path = self.approval / "request.json"
                raw = path.read_bytes()
                path.unlink()
                path.write_bytes(raw)
                path.chmod(0o400)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_source_replacement_during_consumer_rejected_at_exit(self):
        with self.assertRaises(ValueError):
            with self.call():
                path = self.source / "normal_runtime_history_writer.py"
                raw = path.read_bytes()
                path.unlink()
                path.write_bytes(raw)
                path.chmod(0o400)

    def test_ancestor_replacement_during_consumer_rejected(self):
        with self.assertRaises(ValueError):
            with self.call():
                self.source.rename(self.source.with_name("displaced"))
                self.source.mkdir(mode=0o700)

    def test_unsafe_input_mode_and_unexpected_file_rejected(self):
        path = self.approval / "pins.json"
        path.chmod(0o666)
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("unsafe mode")
        path.chmod(0o400)
        (self.approval / "extra").write_bytes(b"x")
        with self.assertRaises(ValueError):
            with self.call():
                self.fail("extra input")

    def test_consumer_exception_remains_original_and_fds_close(self):
        before = set(os.listdir("/proc/self/fd"))
        error = RuntimeError("consumer")
        with self.assertRaises(RuntimeError) as caught:
            with self.call():
                raise error
        self.assertIs(caught.exception, error)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_fixed_api_has_no_source_or_approval_path_override(self):
        self.assertEqual(set(inspect.signature(scope.assemble_protected_writer).parameters),
                         {"transaction_id", "expected_launch_sha256", "expected_request_sha256"})


    def test_preexisting_source_drift_rejected_before_loader(self):
        (self.source / "normal_runtime_history_writer.py").write_bytes(b"changed source")
        with patch.object(scope, "load_pinned_writer_candidate",
                          side_effect=AssertionError("must not load")):
            with self.assertRaises(ValueError):
                with self.call():
                    self.fail("source drift accepted")

    def test_missing_approval_and_symlink_input_are_not_repaired(self):
        path = self.approval / "request.json"
        raw = path.read_bytes()
        path.unlink()
        with self.assertRaises((ValueError, OSError)):
            with self.call():
                self.fail("missing input accepted")
        outside = self.root / "outside-request"
        outside.write_bytes(raw)
        outside.chmod(0o400)
        path.symlink_to(outside)
        with self.assertRaises((ValueError, OSError)):
            with self.call():
                self.fail("input link followed")
        self.assertEqual(outside.read_bytes(), raw)

    def test_loader_failure_closes_both_file_scopes(self):
        before = set(os.listdir("/proc/self/fd"))
        error = ValueError("loader failure")
        with patch.object(scope, "load_pinned_writer_candidate", side_effect=error):
            with self.assertRaises(ValueError) as caught:
                with self.call():
                    self.fail("failed loader yielded")
        self.assertIs(caught.exception, error)
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_approval_ancestor_replacement_rejected_on_exit(self):
        with self.assertRaises(ValueError):
            with self.call():
                parent = self.approval.parent
                parent.rename(parent.with_name("saved-approvals"))
                parent.mkdir(mode=0o700)

    def test_consumer_interruptions_preserve_instances_and_close_fds(self):
        before = set(os.listdir("/proc/self/fd"))
        for error in (KeyboardInterrupt(), SystemExit(23)):
            with self.subTest(kind=type(error).__name__), self.assertRaises(type(error)) as caught:
                with self.call():
                    raise error
            self.assertIs(caught.exception, error)
            self.assertEqual(set(os.listdir("/proc/self/fd")), before)
            self.assertFalse(loader._namespace_keys("_sanq_candidate_writer_" + self.materials.sha256()))


if __name__ == "__main__":
    unittest.main()
