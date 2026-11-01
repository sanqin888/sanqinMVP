"""Mac off-host index handoff fixtures; local temp files only, no SSH/AWS."""
import copy
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import install_minimal_executor as installer
import sanq_install_evidence as evidence
import sanq_install_frames as frames
import sanq_install_offhost as offhost
import test_sanq_deploy_install_evidence as evidence_fixture
import test_sanq_deploy_install_frames as fixture


def reviewed_round(*, change=None):
    session = evidence_fixture.request_round()
    claim = evidence.EvidenceReview(session)
    claim.inspect(frames._canonical(evidence_fixture.reply(session)),
                  request_sent_at=evidence_fixture.SENT,
                  reply_received_at=evidence_fixture.RECEIVED)
    transfer = fixture.third(fixture.second(session.target_sha))
    transfer["index"]["createdAt"] = evidence_fixture.CREATED
    transfer["index"]["availableObservedAt"] = evidence_fixture.OBSERVED
    if change is not None:
        change(transfer["index"])
    transfer = fixture.reseal(transfer)
    raw = frames._canonical(transfer)
    session.inspect(raw)
    return session, claim, raw, transfer


@unittest.skipIf(os.geteuid() == 0, "Mac off-host retention must run unprivileged")
class OffhostIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = self.temp.name
        self.round, self.claim, self.raw, self.transfer = reviewed_round()
        self.leaf = Path(self.directory) / ("snapshot-index-" + fixture.INSTALL + ".json")

    def retain(self, **kwargs):
        return offhost.retain_index(self.round, self.claim, self.raw, self.directory,
                                    operator_confirmed_off_host=True, **kwargs)

    def test_native_ack_only_after_create_only_durable_index_and_exact_readback(self):
        ack = self.retain()
        value = installer._snapshot_index_ack_value(ack, self.raw)
        self.assertEqual(self.leaf.read_bytes(), frames._canonical(self.transfer["index"]))
        self.assertEqual(stat.S_IMODE(self.leaf.stat().st_mode), 0o600)
        self.assertEqual(value["syncMethod"], "posix-fsync")
        self.assertTrue(value["operatorConfirmedOffHost"])
        self.assertTrue(value["clientIndexDurable"])
        self.assertIs(value["canExecute"], False)
        self.assertIs(value["recoveryReady"], False)
        self.assertEqual(value["snapshotReviewSha256"],
                         self.transfer["index"]["snapshotReviewSha256"])
        self.assertTrue(self.round.offhost_attempted)
        with self.assertRaises(frames.FrameRejected):
            self.retain()

    def test_no_claim_or_cross_round_cannot_create_ack(self):
        unreviewed = evidence.EvidenceReview(evidence_fixture.request_round())
        with self.assertRaises(frames.FrameRejected):
            offhost.retain_index(self.round, unreviewed, self.raw, self.directory,
                                 operator_confirmed_off_host=True)
        self.assertFalse(self.leaf.exists())
        other, _, _, _ = reviewed_round()
        with self.assertRaises(frames.FrameRejected):
            offhost.retain_index(other, self.claim, self.raw, self.directory,
                                 operator_confirmed_off_host=True)
        self.assertFalse(self.leaf.exists())

    def test_unconfirmed_offhost_or_wrong_type_is_fail_closed(self):
        with self.assertRaises(frames.FrameRejected):
            offhost.retain_index(self.round, self.claim, self.raw, self.directory,
                                 operator_confirmed_off_host=1)
        self.assertTrue(self.round.failed)
        self.assertFalse(self.leaf.exists())
        with self.assertRaises(frames.FrameRejected):
            self.retain()

    def test_transfer_bytes_are_exactly_bound_to_observed_third_frame(self):
        changed = copy.deepcopy(self.transfer)
        changed["transferChallenge"] = "f" * 64
        with self.assertRaises(frames.FrameRejected):
            offhost.retain_index(self.round, self.claim, frames._canonical(changed),
                                 self.directory, operator_confirmed_off_host=True)
        self.assertTrue(self.round.failed)
        self.assertFalse(self.leaf.exists())

    def test_evidence_identity_must_match_index_even_when_vm_frame_accepts_it(self):
        cases = (
            lambda idx: idx.update(snapshotArn=idx["snapshotArn"].replace("bbbb", "cccc")),
            lambda idx: idx.update(createdAt="2026-10-31T15:02:01.000000Z"),
            lambda idx: idx.update(availableObservedAt="2026-10-31T15:03:00.000000Z"),
            lambda idx: idx.update(snapshotAvailabilityZone="ca-central-1a"),
        )
        for change in cases:
            with self.subTest(change=change):
                session, claim, raw, _ = reviewed_round(change=change)
                with self.assertRaises(frames.FrameRejected):
                    offhost.retain_index(session, claim, raw, self.directory,
                                         operator_confirmed_off_host=True)
                self.assertTrue(session.failed)
                self.assertFalse(self.leaf.exists())

    def test_existing_file_never_overwritten_or_deleted(self):
        self.leaf.write_bytes(b"prior-index")
        with self.assertRaises(FileExistsError):
            self.retain()
        self.assertEqual(self.leaf.read_bytes(), b"prior-index")
        self.assertTrue(self.round.failed)

    def test_symlink_and_nonprivate_directory_are_rejected(self):
        link = Path(self.directory).with_name(Path(self.directory).name + "-link")
        link.symlink_to(self.directory, target_is_directory=True)
        self.addCleanup(link.unlink)
        with self.assertRaises(OSError):
            offhost.retain_index(self.round, self.claim, self.raw, str(link),
                                 operator_confirmed_off_host=True)
        self.assertFalse(self.leaf.exists())
        session, claim, raw, _ = reviewed_round()
        os.chmod(self.directory, 0o755)
        with self.assertRaises(frames.FrameRejected):
            offhost.retain_index(session, claim, raw, self.directory,
                                 operator_confirmed_off_host=True)
        self.assertFalse(self.leaf.exists())

    def test_fsync_error_preserves_unknown_partial_file_without_ack(self):
        with mock.patch.object(offhost.os, "fsync", side_effect=OSError("sync failed")):
            with self.assertRaises(OSError):
                self.retain()
        self.assertTrue(self.leaf.exists())
        self.assertTrue(self.round.failed)
        with self.assertRaises(frames.FrameRejected):
            self.retain()

    def test_readback_failure_preserves_file_and_refuses_ack(self):
        with mock.patch.object(offhost, "_readback", side_effect=OSError("readback failed")):
            with self.assertRaises(OSError):
                self.retain()
        self.assertTrue(self.leaf.exists())
        self.assertTrue(self.round.failed)

    def test_darwin_fullfsync_is_required_before_darwin_ack(self):
        with (mock.patch.object(offhost.sys, "platform", "darwin"),
              mock.patch.object(offhost.fcntl, "F_FULLFSYNC", 51, create=True),
              mock.patch.object(offhost.fcntl, "fcntl") as full):
            ack = self.retain()
        self.assertEqual(installer._snapshot_index_ack_value(ack, self.raw)["syncMethod"],
                         "darwin-fullfsync")
        full.assert_called_once()
        session, claim, raw, _ = reviewed_round()
        with (mock.patch.object(offhost.sys, "platform", "darwin"),
              mock.patch.object(offhost.fcntl, "F_FULLFSYNC", None, create=True)):
            with self.assertRaises(frames.FrameRejected):
                offhost.retain_index(session, claim, raw, self.directory,
                                     operator_confirmed_off_host=True)

    def test_noncanonical_or_oversized_bytes_cannot_reach_filesystem(self):
        for raw in (self.raw[:-1], self.raw + b"x" * (32 * 1024),
                    self.raw.replace(b'"indexBytes":', b'"indexBytes":1,"indexBytes":', 1)):
            session, claim, _, _ = reviewed_round()
            with self.subTest(size=len(raw)), self.assertRaises(frames.FrameRejected):
                offhost.retain_index(session, claim, raw, self.directory,
                                     operator_confirmed_off_host=True)
            self.assertFalse(self.leaf.exists())


if __name__ == "__main__":
    unittest.main()
