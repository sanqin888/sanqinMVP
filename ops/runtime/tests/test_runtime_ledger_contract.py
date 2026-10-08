"""Offline C5-B3B2C cross-transaction modeled Ledger tests."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runtime_ledger_contract import ZERO, LedgerBlocked, checkpoint, validate_chain
from test_versioned_persistence_contract import journal, version, A, B, C

INSTALLATION = "e" * 32
EVIDENCE = "sha256:" + "f" * 64


def done(tx, before, after, prev, before_digest, after_digest, prev_digest):
    j = journal("active")
    j.update({
        "transactionId": tx, "currentSha": before, "targetSha": after,
        "previousSha": prev, "currentVersion": version(before, before_digest),
        "targetVersion": version(after, after_digest),
        "previousVersion": version(prev, prev_digest),
    })
    return j


class LedgerContractTests(unittest.TestCase):
    def test_two_successive_transactions_have_contiguous_identity(self):
        j1 = done("1" * 32, A, B, C, "1", "2", "3")
        j2 = done("2" * 32, B, C, A, "2", "3", "1")
        first = checkpoint(j1, generation=1, parent_hash=ZERO,
                           installation_id=INSTALLATION, physical_evidence_hash=EVIDENCE)
        second = checkpoint(j2, generation=2, parent_hash=first["recordHash"],
                            installation_id=INSTALLATION, physical_evidence_hash=EVIDENCE)
        result = validate_chain([first, second], [j1, j2])
        self.assertEqual(result["modeledActiveSha"], C)
        self.assertFalse(result["authorizedToMutateProduction"])
        for field, val in (("parentHash", ZERO), ("activeSha", A), ("generation", 3),
                           ("authorizedToMutateProduction", True), ("recordHash", ZERO)):
            copy_second = copy.deepcopy(second)
            copy_second[field] = val
            with self.subTest(field=field), self.assertRaises(LedgerBlocked):
                validate_chain([first, copy_second], [j1, j2])
        with self.assertRaises(LedgerBlocked):
            validate_chain([second], [j2])

    def test_duplicate_id_and_wrong_release_continuity_blocked(self):
        j1 = done("1" * 32, A, B, C, "1", "2", "3")
        first = checkpoint(j1, generation=1, parent_hash=ZERO,
                           installation_id=INSTALLATION, physical_evidence_hash=EVIDENCE)
        j2 = done("1" * 32, B, C, A, "2", "3", "1")
        second = checkpoint(j2, generation=2, parent_hash=first["recordHash"],
                            installation_id=INSTALLATION, physical_evidence_hash=EVIDENCE)
        with self.assertRaisesRegex(LedgerBlocked, "duplicate"):
            validate_chain([first, second], [j1, j2])
        j2["transactionId"] = "2" * 32
        j2["currentVersion"] = version(B, "9")
        second = checkpoint(j2, generation=2, parent_hash=first["recordHash"],
                            installation_id=INSTALLATION, physical_evidence_hash=EVIDENCE)
        with self.assertRaisesRegex(LedgerBlocked, "proof continuity"):
            validate_chain([first, second], [j1, j2])

    def test_pending_and_empty_fail_closed(self):
        with self.assertRaises(LedgerBlocked):
            validate_chain([], [])
        with self.assertRaises(LedgerBlocked):
            checkpoint(journal("pending"), generation=1, parent_hash=ZERO,
                       installation_id=INSTALLATION, physical_evidence_hash=EVIDENCE)
        with self.assertRaises(LedgerBlocked):
            checkpoint(journal("active"), generation=0, parent_hash=ZERO,
                       installation_id=INSTALLATION, physical_evidence_hash=EVIDENCE)


if __name__ == "__main__":
    unittest.main()
