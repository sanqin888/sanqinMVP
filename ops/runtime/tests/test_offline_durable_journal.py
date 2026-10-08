"""B3-B1 filesystem-durability fixture tests; only system temporary files."""
import copy
import fcntl
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from offline_durable_journal import OfflineInterruption, OfflineJournalFixture
from versioned_persistence_contract import PersistenceBlocked
from test_versioned_persistence_contract import journal

T1 = "2026-10-08T00:00:01Z"
T2 = "2026-10-08T00:00:02Z"


class OfflineDurabilityTests(unittest.TestCase):
    def test_record_is_durable_and_stale_generation_rejected(self):
        with OfflineJournalFixture() as f:
            f.begin(journal())
            n, state = f.snapshot()
            self.assertEqual(n, 1)
            self.assertEqual(state["phase"], "pending")
            f.advance("failed", at=T1, expected_generation=1)
            self.assertEqual(f.snapshot()[0], 2)
            with self.assertRaisesRegex(PersistenceBlocked, "stale"):
                f.advance("rolled-back", at=T2, expected_generation=1, manually_reconciled=True)
            f.advance("rolled-back", at=T2, expected_generation=2, manually_reconciled=True)
            self.assertEqual(f.snapshot()[1]["phase"], "rolled-back")
            with self.assertRaises(PersistenceBlocked):
                f.advance("active", at="2026-10-08T00:00:03Z", expected_generation=3)

    def test_unresolved_interruption_blocks_restart(self):
        for fault in ("after-file-fsync", "after-rename", "after-directory-fsync",
                      "after-record-fsync", "before-head-rename", "after-head-rename"):
            with self.subTest(fault=fault), OfflineJournalFixture() as f:
                with self.assertRaises(OfflineInterruption):
                    f.begin(journal(), fault=fault)
                with self.assertRaises(PersistenceBlocked):
                    f.snapshot()
                with self.assertRaises(PersistenceBlocked):
                    f.begin(journal())

    def test_interrupted_state_advance_does_not_guess_success(self):
        with OfflineJournalFixture() as f:
            f.begin(journal())
            with self.assertRaises(OfflineInterruption):
                f.advance("active", at=T1, expected_generation=1,
                          manually_reconciled=True, fault="after-head-rename")
            with self.assertRaises(PersistenceBlocked):
                f.snapshot()

    def test_corrupt_file_and_unexpected_files_fail_closed(self):
        with OfflineJournalFixture() as f:
            f.begin(journal())
            (f.root / "head.json").write_text("{", encoding="utf-8")
            with self.assertRaises(PersistenceBlocked):
                f.snapshot()
        with OfflineJournalFixture() as f:
            f.begin(journal())
            (f.root / "unexpected").write_text("data", encoding="utf-8")
            with self.assertRaises(PersistenceBlocked):
                f.snapshot()

    def test_no_lock_steal_and_no_caller_supplied_production_root(self):
        with OfflineJournalFixture() as f:
            fd = os.open(f.root / "fixture.lock", os.O_RDONLY)
            try:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                os.close(fd)
            self.assertNotEqual(str(f.root), "/opt/sanq/runtime")
            self.assertNotEqual(str(f.root), "/var/lib/sanq/runtime")
            self.assertEqual(f.root.stat().st_mode & 0o777, 0o700)

    def test_no_reuse_of_committed_transaction_fixture(self):
        with OfflineJournalFixture() as f:
            f.begin(copy.deepcopy(journal()))
            with self.assertRaises(PersistenceBlocked):
                f.begin(journal())


if __name__ == "__main__":
    unittest.main()
