"""B2B9-H negative-only synthetic schema tests (never operate a host)."""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import isolated_whole_host_exclusion_review as h  # noqa: E402


def claimed_case(case: str = "H-01") -> dict:
    actor, first, second = h.CASE_FACTS[case]
    state = {"timerUnitFileState": "enabled-runtime", "timerActiveState": "active",
             "timerNextTrigger": "Thu 2099-01-01 00:00:00 UTC", "serviceActiveState": "inactive"}
    return {
        "schemaVersion": 1, "kind": "c5-g2b2b9-h-claimed-negative-case-v1",
        "caseId": case, "sourceSha256": "a" * 64,
        "guest": {"vmUuid": "0d46a6e8-abaf-4fa6-bd8d-987756143ee9",
                  "snapshotName": "SanQ-2B2B-Verified", "syntheticOnlyClaimed": True,
                  "noProductionMountsClaimed": True, "noProductionSecretsClaimed": True},
        "challenge": {"actorKind": actor, "facts": {first: True, second: True},
                      "decision": "BLOCKED", "runtimeHandoffAttempted": False,
                      "blockingReasonRecorded": True},
        "restoration": {"original": state, "after": copy.deepcopy(state),
                        "independentCheckClaimed": True},
    }


class WholeHostClaimReviewTests(unittest.TestCase):
    def test_every_claimed_negative_case_is_never_install_authority(self) -> None:
        self.assertEqual(len(h.CASE_FACTS), 8)
        for case in h.CASE_FACTS:
            with self.subTest(case=case):
                receipt = h.review_claimed_h_case(claimed_case(case))
                self.assertEqual(receipt["caseId"], case)
                self.assertTrue(receipt["claimedNegativeCaseStructurallyConsistent"])
                for key in ("guestIdentityIndependentlyAuthenticated",
                            "observedSystemdStateIndependentlyAuthenticated",
                            "rootLevelWholeHostExclusionVerified",
                            "mountNamespaceCoverageVerified",
                            "newConsumerAdmissionPrevented", "crossProcessQuiescenceVerified",
                            "eligibleForRootGuestActions", "readyToInstall",
                            "authorizedToMutateProduction"):
                    self.assertIs(receipt[key], False)

    def test_reject_missing_extra_and_authority_suggestion(self) -> None:
        for mutate in (
            lambda r: r.pop("restoration"),
            lambda r: r.update(readyToInstall=True),
            lambda r: r["challenge"].update(authorizedToMutateProduction=True),
            lambda r: r["challenge"]["facts"].update(thirdFact=True),
            lambda r: r.update(schemaVersion=True),
        ):
            record = claimed_case()
            mutate(record)
            with self.assertRaises(h.WholeHostEvidenceBlocked):
                h.review_claimed_h_case(record)

    def test_each_case_missing_a_required_blocker_is_rejected(self) -> None:
        for case, (_, first, second) in h.CASE_FACTS.items():
            for field in (first, second):
                record = claimed_case(case)
                record["challenge"]["facts"][field] = False
                with self.subTest(case=case, field=field):
                    with self.assertRaises(h.WholeHostEvidenceBlocked):
                        h.review_claimed_h_case(record)

    def test_a_clean_lock_does_not_override_the_uncooperative_holder(self) -> None:
        record = claimed_case("H-03")
        record["challenge"]["facts"]["foreignUidHolderDetected"] = False
        with self.assertRaises(h.WholeHostEvidenceBlocked):
            h.review_claimed_h_case(record)

    def test_reject_wrong_actor_unblocked_decision_or_a_handoff(self) -> None:
        for key, value in (("actorKind", "cooperating-flock"),
                           ("decision", "CLEAR"), ("runtimeHandoffAttempted", True),
                           ("blockingReasonRecorded", False)):
            record = claimed_case("H-07")
            record["challenge"][key] = value
            with self.subTest(key=key):
                with self.assertRaises(h.WholeHostEvidenceBlocked):
                    h.review_claimed_h_case(record)

    def test_restoration_must_preserve_original_timer_next_trigger(self) -> None:
        for key, value in (("timerUnitFileState", "disabled"),
                           ("timerActiveState", "inactive"),
                           ("timerNextTrigger", ""),
                           ("serviceActiveState", "active")):
            record = claimed_case("H-05")
            record["restoration"]["after"][key] = value
            with self.subTest(key=key):
                with self.assertRaisesRegex(h.WholeHostEvidenceBlocked, "restored"):
                    h.review_claimed_h_case(record)

    def test_reject_bad_guest_source_and_unindependently_checked_restore(self) -> None:
        for group, key, value in (
            ("guest", "vmUuid", "not-a-uuid"),
            ("guest", "snapshotName", "../../unsafe"),
            ("guest", "syntheticOnlyClaimed", "true"),
            ("guest", "noProductionMountsClaimed", False),
            ("guest", "noProductionSecretsClaimed", False),
            ("restoration", "independentCheckClaimed", False),
        ):
            record = claimed_case()
            record[group][key] = value
            with self.subTest(group=group, key=key):
                with self.assertRaises(h.WholeHostEvidenceBlocked):
                    h.review_claimed_h_case(record)
        record = claimed_case()
        record["sourceSha256"] = "not-a-sha"
        with self.assertRaises(h.WholeHostEvidenceBlocked):
            h.review_claimed_h_case(record)

    def test_no_host_commands_or_runtime_bundle_membership(self) -> None:
        for forbidden in ("execute", "install", "run_production", "main", "systemctl"):
            self.assertFalse(hasattr(h, forbidden))
        for forbidden in ("os", "subprocess", "fcntl", "pathlib", "socket"):
            self.assertNotIn(forbidden, h.__dict__)
        import build_bundle
        self.assertEqual(len(build_bundle.SOURCE_FILES), 17)
        self.assertNotIn("ops/runtime/isolated_whole_host_exclusion_review.py",
                         build_bundle.SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
