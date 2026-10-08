"""Offline-only C5-B3B2E correlation tests; no production host calls."""
import copy
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from isolated_host_fixture import IsolatedHostFixture
from isolated_evidence_correlation import IsolatedEvidenceBlocked, correlate_isolated_evidence
from runtime_ledger_contract import ZERO, checkpoint
from test_versioned_persistence_contract import journal


ARCHIVE = b"synthetic-release-archive\n"
DIGEST = "sha256:" + hashlib.sha256(ARCHIVE).hexdigest()
INSTALLATION_ID = "f" * 32
PHYSICAL = "sha256:" + "e" * 64


def evidence():
    j = journal("active")
    j["targetVersion"]["runtimeArchiveSha256"] = DIGEST
    entry = checkpoint(
        j, generation=1, parent_hash=ZERO,
        installation_id=INSTALLATION_ID,
        physical_evidence_hash=PHYSICAL,
    )
    return entry, j


class IsolatedEvidenceCorrelationTests(unittest.TestCase):
    def test_matching_isolated_evidence_remains_non_authoritative(self):
        with IsolatedHostFixture() as fixture:
            for name in fixture.NAMES:
                fixture.make_directory(name)
            entry, j = evidence()
            result = correlate_isolated_evidence(fixture.inspect(), [entry], [j], ARCHIVE)
            self.assertTrue(result["candidateArchiveBytesMatch"])
            self.assertFalse(result["productionHostExamined"])
            self.assertFalse(result["externalPublicationVerified"])
            self.assertFalse(result["authorizedToMutateProduction"])

    def test_wrong_archive_tampered_ledger_and_false_host_claims_block(self):
        with IsolatedHostFixture() as fixture:
            for name in fixture.NAMES:
                fixture.make_directory(name)
            host = fixture.inspect()
            entry, j = evidence()
            for item in (b"other", b"", None, "not raw bytes"):
                with self.subTest(item=item), self.assertRaises(IsolatedEvidenceBlocked):
                    correlate_isolated_evidence(host, [entry], [j], item)
            damaged = copy.deepcopy(entry)
            damaged["recordHash"] = ZERO
            with self.assertRaises(IsolatedEvidenceBlocked):
                correlate_isolated_evidence(host, [damaged], [j], ARCHIVE)
            for field in ("productionHostExamined", "dockerAndVolumeVerified",
                          "archiveAndDigestVerified", "authorizedToMutateProduction"):
                forbidden = dict(host)
                forbidden[field] = True
                with self.subTest(field=field), self.assertRaises(IsolatedEvidenceBlocked):
                    correlate_isolated_evidence(forbidden, [entry], [j], ARCHIVE)
            with self.assertRaises(IsolatedEvidenceBlocked):
                correlate_isolated_evidence(host, [], [], ARCHIVE)


if __name__ == "__main__":
    unittest.main()
