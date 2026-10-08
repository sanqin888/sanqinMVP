"""C5-B3B2F exact historical provenance verifier reuse, offline only."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inert_archive_pair_provenance import ArchivePairBlocked, verify_inert_version_triplet
from test_versioned_persistence_contract import journal, A, B, C
from test_versioned_release_contract import bundle, successful_fetch
from runtime_trust import _sha256


def fixtures():
    archives = {sha: bundle(sha) for sha in (A, B, C)}
    j = journal("active")
    for label in ("currentVersion", "previousVersion", "targetVersion"):
        entry = j[label]
        entry["runtimeArchiveSha256"] = _sha256(archives[entry["sourceSha"]])
        for name in ("sanq-api", "sanq-web"):
            entry["images"][name]["digest"] = "sha256:" + "d" * 64
    fetches = {sha: successful_fetch(archives[sha], sha=sha) for sha in archives}
    def fetch(path):
        for sha, f in fetches.items():
            if f"/{sha}" in path:
                return f(path)
        return fetches[A](path)
    return j, archives, fetch


class InertArchivePairProvenanceTests(unittest.TestCase):
    def test_three_historical_archives_and_image_pair(self):
        j, archives, fetch = fixtures()
        result = verify_inert_version_triplet(j, archives, fetch=fetch)
        self.assertEqual(result["versionCount"], 3)
        self.assertFalse(result["readyToRollback"])
        self.assertFalse(result["authorizedToMutateProduction"])

    def test_missing_or_tampered_archive_is_blocked(self):
        j, archives, fetch = fixtures()
        for bad in (None, b"", b"not a real archive"):
            changed = dict(archives)
            changed[B] = bad
            with self.subTest(value=bad), self.assertRaises(ArchivePairBlocked):
                verify_inert_version_triplet(j, changed, fetch=fetch)
        changed = dict(archives)
        changed.pop(C)
        with self.assertRaises(ArchivePairBlocked):
            verify_inert_version_triplet(j, changed, fetch=fetch)

    def test_wrong_journal_image_pair_or_forged_status_blocked(self):
        j, archives, fetch = fixtures()
        changed = copy.deepcopy(j)
        changed["targetVersion"]["images"]["sanq-web"]["digest"] = "sha256:" + "e" * 64
        with self.assertRaises(ArchivePairBlocked):
            verify_inert_version_triplet(changed, archives, fetch=fetch)
        def bad_fetch(path):
            if "/statuses?" in path:
                return []
            return fetch(path)
        with self.assertRaises(ArchivePairBlocked):
            verify_inert_version_triplet(j, archives, fetch=bad_fetch)


if __name__ == "__main__":
    unittest.main()
