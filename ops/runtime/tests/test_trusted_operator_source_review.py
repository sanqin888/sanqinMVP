"""B02-A negative-only trusted operator source evidence characterization."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from trusted_operator_source_review import (  # noqa: E402
    SourceReviewBlocked, review_trusted_operator_source,
)

DIGEST = "a" * 64


def evidence():
    parts = ["root", "sanq-operator", "operator.py"]
    paths = ["/" + "/".join(parts[:i + 1]) for i in range(len(parts))]
    return {
        "kind": "c5-b02a-source-review-v1",
        "schemaVersion": 1,
        "sourceDigest": DIGEST,
        "installedDigest": DIGEST,
        "operatorPath": paths[-1],
        "pathComponents": [
            {"path": path, "uid": 0, "gid": 0,
             "mode": 0o600 if i == 2 else 0o700,
             "type": "file" if i == 2 else "directory",
             "symlink": False, "hardlinks": 1 if i == 2 else 2,
             "device": 5, "inode": i + 10}
            for i, path in enumerate(paths)
        ],
        "source": {
            "uid": 0, "gid": 0, "mode": 0o600, "type": "file",
            "hardlinks": 1, "device": 5, "inode": 12, "bytes": 12345,
        },
        "runtimeRoot": "/opt/sanq/runtime",
        "guestIsolationVerified": True,
    }


class TrustedOperatorSourceReviewTests(unittest.TestCase):
    def test_valid_claim_is_never_install_authority(self):
        receipt = review_trusted_operator_source(evidence(), DIGEST)
        self.assertTrue(receipt["structureConsistent"])
        self.assertTrue(receipt["expectedDigestMatched"])
        for field in ("evidenceSourceAuthenticated", "rootOperatorExecutionVerified",
                      "quiescenceVerified", "externalKitVerified", "readyToInstall",
                      "authorizedToMutateProduction"):
            self.assertIs(receipt[field], False)

    def test_digest_mismatch_and_unknown_evidence_fail(self):
        for mutation in (
            lambda e: e.update(sourceDigest="b" * 64),
            lambda e: e.update(installedDigest="b" * 64),
            lambda e: e.update(kind="other"),
            lambda e: e.update(guestIsolationVerified=False),
            lambda e: e.update(unexpected=True),
            lambda e: e.pop("pathComponents"),
        ):
            item = evidence()
            mutation(item)
            with self.subTest(item=item):
                with self.assertRaises(SourceReviewBlocked):
                    review_trusted_operator_source(item, DIGEST)
        with self.assertRaises(SourceReviewBlocked):
            review_trusted_operator_source(evidence(), "bad")

    def test_dangerous_path_or_mismatched_identity_blocks(self):
        for path in ("/opt/sanq/runtime/operator.py", "/tmp/operator.py",
                     "/root/../root/operator.py", "/root//operator.py",
                     "/root/operator.py/"):
            item = evidence()
            item["operatorPath"] = path
            with self.subTest(path=path):
                with self.assertRaises(SourceReviewBlocked):
                    review_trusted_operator_source(item, DIGEST)
        for location, field, value in (
            ("pathComponents", "symlink", True),
            ("pathComponents", "uid", 1000),
            ("pathComponents", "mode", 0o777),
            ("pathComponents", "device", 0),
            ("source", "inode", 99),
            ("source", "hardlinks", 2),
            ("source", "bytes", 0),
        ):
            item = evidence()
            target = item["pathComponents"][1] if location == "pathComponents" else item["source"]
            target[field] = value
            with self.subTest(location=location, field=field):
                with self.assertRaises(SourceReviewBlocked):
                    review_trusted_operator_source(item, DIGEST)

    def test_not_a_host_observer_or_installer(self):
        import trusted_operator_source_review as module
        for name in ("install", "execute", "deploy", "sudo", "main", "open"):
            self.assertFalse(hasattr(module, name))
        self.assertNotIn("os", module.__dict__)
        self.assertNotIn("subprocess", module.__dict__)
        self.assertNotIn("ops/runtime/trusted_operator_source_review.py",
                         __import__("build_bundle").SOURCE_FILES)


if __name__ == "__main__":
    unittest.main()
