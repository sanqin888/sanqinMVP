"""C5-U2D-1 pure-data review cases: no /tmp, VM, Docker, sudo or network."""
import copy
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location(
    "review_handoff_evidence", ROOT / "review_handoff_evidence.py",
)
assert SPEC and SPEC.loader
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)

OLD = "a" * 40
NEW = "b" * 40
APP = "c" * 40
PREVIOUS_APP = "d" * 40
TXID = "e" * 32


def manifest(sha, changed=False):
    files = {path: {"sha256": "1" * 64, "bytes": 10} for path in review.MEMBERS}
    if changed:
        files["ops/release/deploy_release.py"] = {"sha256": "2" * 64, "bytes": 15}
    return {
        "schemaVersion": 1,
        "sourceBranch": "main",
        "sourceSha": sha,
        "productionActivationAuthorized": False,
        "files": files,
    }


def application():
    return {
        "currentSha": APP,
        "previousSha": PREVIOUS_APP,
        "envSha": APP,
        "runningImageSha": APP,
        "releasePhase": "active",
    }


def intent():
    return {
        "schemaVersion": 1,
        "kind": review.KINDS,
        "currentRuntime": {
            "sourceSha": OLD,
            "archiveDigest": "sha256:" + "4" * 64,
            "manifest": manifest(OLD),
        },
        "targetRuntime": {
            "sourceSha": NEW,
            "archiveDigest": "sha256:" + "5" * 64,
            "manifest": manifest(NEW, changed=True),
        },
        "application": application(),
        "runtimeRoot": "/opt/sanq/runtime",
        "composeProject": "sanq-app",
        "databaseVolume": "sanq-app_pgdata",
        "authorizedToMutateProduction": False,
    }


def dynamic(seed, *, dev=66305):
    return {
        name: {
            "sha256": (str(index + 6) * 64),
            "uid": 1000 if name == ".env" else 0,
            "gid": 1000 if name == ".env" else 0,
            "mode": 0o644 if name == ".sanq-backup-layout-activated" else 0o600,
            "inode": seed + index + 1,
            "device": dev,
        }
        for index, name in enumerate(review.PRESERVED)
    }


def tree(sha, inode, seed, *, dev=66305):
    return {
        "sourceSha": sha,
        "device": dev,
        "inode": inode,
        "isSymlink": False,
        "dynamicFiles": dynamic(seed, dev=dev),
    }


def journal(phase="PENDING_EXCHANGE"):
    return {
        "schemaVersion": 1,
        "transactionId": TXID,
        "phase": phase,
        "oldRuntimeSourceSha": OLD,
        "targetRuntimeSourceSha": NEW,
        "applicationCurrentSha": APP,
        "manualRecoveryRequired": True,
        "productionActivationAuthorized": False,
    }


def observed(location):
    if location == "before_exchange":
        trees = {
            "runtime": tree(OLD, 10, 100),
            "candidate": tree(NEW, 20, 200),
        }
    elif location == "after_exchange":
        trees = {
            "runtime": tree(NEW, 20, 200),
            "candidate": tree(OLD, 10, 100),
        }
    else:
        trees = {
            "runtime": tree(NEW, 20, 200),
            "previous": tree(OLD, 10, 100),
        }
    return {
        "trees": trees,
        "snapshot": {
            "sourceSha": OLD,
            "device": 66305,
            "inode": 30,
            "completeVerified": True,
            "separatelyRetained": True,
        },
        "application": application(),
        "ubuntuUid": 1000,
        "ubuntuGid": 1000,
        "unresolvedWriter": False,
        "pathRefsPresent": False,
    }


class InertIntentTests(unittest.TestCase):
    def test_mismatched_runtime_and_app_sources_are_allowed_and_authority_never_granted(self):
        result = review.review_handoff_intent(intent())
        self.assertEqual(result["oldRuntimeSourceSha"], OLD)
        self.assertEqual(result["targetRuntimeSourceSha"], NEW)
        self.assertEqual(result["applicationCurrentSha"], APP)
        self.assertEqual(result["applicationPreviousSha"], PREVIOUS_APP)
        self.assertEqual(result["changedRuntimeMembers"], ["ops/release/deploy_release.py"])
        self.assertEqual(len(result["preservedExternalFiles"]), 3)
        for key in (
            "externalProvenanceVerified", "liveHostInspected", "quiescenceVerified",
            "readyToInstall", "readyToDeploy", "readyToRollback",
            "authorizedToMutateProduction", "automaticRecovery",
        ):
            self.assertIs(result[key], False)
        self.assertTrue(result["manualRecoveryRequired"])

    def test_invalid_or_forged_intents_are_blocked(self):
        changes = (
            ("new source same as old", lambda x: x["targetRuntime"].update(
                sourceSha=OLD, manifest=manifest(OLD, changed=True))),
            ("no member changed", lambda x: x["targetRuntime"]["manifest"].update(
                files=copy.deepcopy(x["currentRuntime"]["manifest"]["files"]))),
            ("bad archive digest", lambda x: x["targetRuntime"].update(archiveDigest="wrong")),
            ("extra source member", lambda x: x["targetRuntime"]["manifest"]["files"].update(
                {"hijack.py": {"sha256": "1" * 64, "bytes": 3}})),
            ("fake activation", lambda x: x["targetRuntime"]["manifest"].update(
                productionActivationAuthorized=True)),
            ("wrong project", lambda x: x.update(composeProject="different")),
            ("wrong volume", lambda x: x.update(databaseVolume="different")),
            ("wrong root", lambda x: x.update(runtimeRoot="/tmp/runtime")),
            ("forged authority", lambda x: x.update(authorizedToMutateProduction=True)),
            ("pending app", lambda x: x["application"].update(releasePhase="pending")),
            ("app/env mismatch", lambda x: x["application"].update(envSha=OLD)),
            ("wrong running image", lambda x: x["application"].update(runningImageSha=OLD)),
            ("new field", lambda x: x.update(execute=True)),
        )
        for title, change in changes:
            with self.subTest(title=title):
                value = intent()
                change(value)
                with self.assertRaises(ValueError):
                    review.review_handoff_intent(value)

    def test_no_privileged_or_external_capabilities_exist(self):
        for name in ("os", "subprocess", "ctypes", "socket", "requests", "pathlib", "shutil"):
            self.assertNotIn(name, review.__dict__)
        self.assertFalse(hasattr(review, "run_handoff"))


class IncidentReviewTests(unittest.TestCase):
    def test_three_observed_locations_are_only_manual_classifications(self):
        cases = [
            ("PENDING_EXCHANGE", "before_exchange", False),
            ("PENDING_EXCHANGE", "after_exchange", True),
            ("PENDING_EXCHANGE", "previous_retained", True),
            ("EXCHANGED_UNCONFIRMED", "after_exchange", False),
            ("EXCHANGED_UNCONFIRMED", "previous_retained", True),
            ("PREVIOUS_RETAINED", "previous_retained", False),
            ("VERIFIED_RETAINED", "previous_retained", False),
        ]
        for phase, location, lag in cases:
            with self.subTest(phase=phase, location=location):
                result = review.inspect_handoff_incident(
                    intent(), journal(phase), observed(location),
                )
                self.assertEqual(result["status"], "manual-incident-review-only")
                self.assertEqual(result["observed"], location)
                self.assertEqual(result["journalMayLagDisk"], lag)
                self.assertEqual(
                    result["activeRuntimeSourceSha"],
                    OLD if location == "before_exchange" else NEW,
                )
                self.assertTrue(result["manualRecoveryRequired"])
                for flag in (
                    "externalProvenanceVerified", "quiescenceVerified",
                    "readyToInstall", "readyToRollback", "authorizedToMutateProduction",
                    "automaticRecovery",
                ):
                    self.assertIs(result[flag], False)

    def test_journal_ahead_of_disk_fails_closed(self):
        for phase, location in (
            ("EXCHANGED_UNCONFIRMED", "before_exchange"),
            ("PREVIOUS_RETAINED", "before_exchange"),
            ("PREVIOUS_RETAINED", "after_exchange"),
            ("VERIFIED_RETAINED", "after_exchange"),
        ):
            with self.subTest(phase=phase, location=location):
                with self.assertRaisesRegex(ValueError, "journal ahead"):
                    review.inspect_handoff_incident(intent(), journal(phase), observed(location))

    def test_journal_tamper_and_identity_drift_block(self):
        mutations = (
            lambda j: j.update(productionActivationAuthorized=True),
            lambda j: j.update(manualRecoveryRequired=False),
            lambda j: j.update(transactionId="invalid"),
            lambda j: j.update(applicationCurrentSha=OLD),
            lambda j: j.update(oldRuntimeSourceSha=NEW),
            lambda j: j.update(phase="AUTO_ROLLBACK"),
            lambda j: j.update(readyToInstall=True),
        )
        for mut in mutations:
            with self.subTest(mut=repr(mut)):
                j = journal()
                mut(j)
                with self.assertRaises(ValueError):
                    review.inspect_handoff_incident(intent(), j, observed("before_exchange"))

    def test_dynamic_file_drift_mode_alias_and_device_block(self):
        cases = (
            lambda o: o["trees"]["candidate"]["dynamicFiles"][".env"].update(sha256="f" * 64),
            lambda o: o["trees"]["candidate"]["dynamicFiles"][".env"].update(mode=0o644),
            lambda o: o["trees"]["candidate"]["dynamicFiles"][".env"].update(uid=0),
            lambda o: o["trees"]["candidate"]["dynamicFiles"][".env"].update(inode=101),
            lambda o: o["trees"]["candidate"]["dynamicFiles"][".env"].update(inode=20),
            lambda o: o["trees"]["candidate"]["dynamicFiles"][".sanq-release-state.json"].update(inode=201),
            lambda o: o["trees"]["candidate"]["dynamicFiles"][".env"].update(device=5),
            lambda o: o["trees"]["candidate"].update(device=5),
            lambda o: o["trees"]["runtime"].update(isSymlink=True),
        )
        for mut in cases:
            with self.subTest(mut=repr(mut)):
                o = observed("before_exchange")
                mut(o)
                with self.assertRaises(ValueError):
                    review.inspect_handoff_incident(intent(), journal(), o)

    def test_snapshot_missing_alias_or_corrupt_and_slot_ambiguity_block(self):
        cases = (
            lambda o: o["snapshot"].update(completeVerified=False),
            lambda o: o["snapshot"].update(separatelyRetained=False),
            lambda o: o["snapshot"].update(sourceSha=NEW),
            lambda o: o["snapshot"].update(inode=10),
            lambda o: o["snapshot"].update(inode=101),
            lambda o: o["snapshot"].update(device=999),
            lambda o: o["trees"].update(previous=copy.deepcopy(o["trees"]["candidate"])),
            lambda o: o["trees"]["candidate"].update(sourceSha=OLD),
            lambda o: o.update(pathRefsPresent=True),
            lambda o: o.update(unresolvedWriter=True),
        )
        for mut in cases:
            with self.subTest(mut=repr(mut)):
                o = observed("before_exchange")
                mut(o)
                with self.assertRaises(ValueError):
                    review.inspect_handoff_incident(intent(), journal(), o)

    def test_application_state_cannot_be_drifted_by_handoff(self):
        cases = (
            lambda o: o["application"].update(previousSha=OLD),
            lambda o: o["application"].update(currentSha=NEW, envSha=NEW, runningImageSha=NEW),
            lambda o: o["application"].update(releasePhase="pending"),
            lambda o: o["application"].update(envSha=NEW),
        )
        for mut in cases:
            with self.subTest(mut=repr(mut)):
                o = observed("after_exchange")
                mut(o)
                with self.assertRaises(ValueError):
                    review.inspect_handoff_incident(intent(), journal(), o)


if __name__ == "__main__":
    unittest.main()
