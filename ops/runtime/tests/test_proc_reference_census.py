"""Synthetic-only C5-G2-B2A /proc consumer-reference regression tests.

No reads from real /proc, no root, Docker, systemd, MCP, network, or install.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import proc_reference_census as census  # noqa: E402


def fake_pid(parent: Path, pid: int, *, cwd: str = "/home/ubuntu",
             fd_targets: tuple[str, ...] = ("socket:[42]",),
             flags: int = 0, state: str = "S", birth: int = 100) -> Path:
    directory = parent / str(pid)
    directory.mkdir()
    fields = [state] + ["0"] * 24
    fields[6] = str(flags)
    fields[19] = str(birth)
    (directory / "stat").write_text(
        f"{pid} (worker ) with spaces) " + " ".join(fields) + "\n",
        encoding="utf-8",
    )
    (directory / "cwd").symlink_to(cwd)
    (directory / "root").symlink_to("/")
    (directory / "exe").symlink_to("/usr/bin/python3")
    (directory / "fd").mkdir()
    for i, target in enumerate(fd_targets):
        (directory / "fd" / str(i)).symlink_to(target)
    return directory


class RuntimeProcCensusTests(unittest.TestCase):
    def test_idle_claim_never_grants_maintenance(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            fake_pid(proc, 42)
            result = census._inspect(proc)
            self.assertEqual(result["pathReferenceCount"], 0)
            self.assertEqual(result["unresolvedProcessCount"], 0)
            self.assertEqual(result["processesObserved"], 1)
            for key in ("mountNamespaceAndAliasesVerified",
                        "evidenceSourceAuthenticated",
                        "crossProcessQuiescenceVerified",
                        "readyToInstall",
                        "authorizedToMutateProduction"):
                self.assertIs(result[key], False)

    def test_cwd_fd_exe_root_and_deleted_reference_all_block(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            fake_pid(proc, 51, cwd=census.RUNTIME + "/ops/runtime")
            fake_pid(proc, 52, fd_targets=(census.RUNTIME + "/.env",))
            fake_pid(proc, 53, fd_targets=(
                census.RUNTIME + " (deleted)",))
            obj = fake_pid(proc, 54)
            (obj / "exe").unlink()
            (obj / "exe").symlink_to(census.RUNTIME + "/helper")
            obj = fake_pid(proc, 55)
            (obj / "root").unlink()
            (obj / "root").symlink_to(census.RUNTIME)
            result = census._inspect(proc)
            self.assertEqual(result["runtimeReferencePids"],
                             [51, 52, 53, 54, 55])
            self.assertEqual(result["pathReferenceCount"], 5)
            self.assertEqual(result["unknownPids"], [])

    def test_similar_prefix_does_not_create_false_reference(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            fake_pid(proc, 66, cwd=census.RUNTIME + "-old",
                     fd_targets=("/opt/sanq/runtime-backup/.env",
                                 "/srv/sanq/uploads"))
            result = census._inspect(proc)
            self.assertEqual(result["runtimeReferencePids"], [])

    def test_unreadable_or_disappearing_fd_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            directory = fake_pid(proc, 77)
            (directory / "fd" / "0").unlink()
            (directory / "fd" / "0").mkdir()
            fake_pid(proc, 88)
            (proc / "88" / "stat").unlink()
            result = census._inspect(proc)
            self.assertEqual(result["unknownPids"], [77, 88])
            self.assertEqual(result["unresolvedProcessCount"], 2)
            self.assertFalse(result["readyToInstall"])

    def test_pid_birth_change_or_churn_is_unknown(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            fake_pid(proc, 70)
            first = census._snapshot(proc)
            (proc / "70" / "stat").write_text(
                "70 (worker) " + " ".join(
                    ["S"] + ["0"] * 18 + ["200"] + ["0"] * 5
                ) + "\n", encoding="utf-8",
            )
            second = census._snapshot(proc)
            self.assertNotEqual(first[70]["startTicks"],
                                second[70]["startTicks"])
            with patch.object(census, "_snapshot",
                              side_effect=[first, second]):
                self.assertEqual(census._inspect(proc)["unknownPids"], [70])
            with patch.object(census, "_snapshot",
                              side_effect=[first, {}]):
                self.assertEqual(census._inspect(proc)["unknownPids"], [70])
            with patch.object(census, "_snapshot",
                              side_effect=[{}, second]):
                self.assertEqual(census._inspect(proc)["unknownPids"], [70])

    def test_kernel_threads_and_zombies_have_no_accessible_fds(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            fake_pid(proc, 8, cwd=census.RUNTIME,
                     flags=census.KTHREAD_FLAG)
            fake_pid(proc, 9, cwd=census.RUNTIME, state="Z")
            record = census._inspect(proc)
            self.assertEqual(record["runtimeReferencePids"], [])
            self.assertEqual(record["unknownPids"], [])

    def test_malformed_stat_is_unknown_not_clear(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            a = fake_pid(proc, 20)
            (a / "stat").write_bytes(b"invalid stat")
            b = fake_pid(proc, 21)
            (b / "stat").write_bytes(b"21 (bad) S 1\n")
            record = census._inspect(proc)
            self.assertEqual(record["unknownPids"], [20, 21])

    def test_process_and_fd_enumeration_budgets_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            fake_pid(proc, 55)
            with patch.object(census, "MAX_PROC_ENTRIES", 0):
                with self.assertRaisesRegex(
                        census.ProcCensusBlocked, "exceeds budget"):
                    census._inspect(proc)
            with patch.object(census, "MAX_FDS_PER_PID", 0):
                result = census._inspect(proc)
                self.assertEqual(result["unknownPids"], [55])
                self.assertFalse(result["readyToInstall"])

    def test_no_arbitrary_production_cli_or_mutating_capability(self):
        self.assertFalse(hasattr(census, "main"))
        self.assertFalse(hasattr(census, "install"))
        self.assertFalse(hasattr(census, "quiesce"))
        self.assertFalse(hasattr(census, "stop_service"))
        self.assertNotIn("subprocess", census.__dict__)
        self.assertNotIn("ops/runtime/proc_reference_census.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
