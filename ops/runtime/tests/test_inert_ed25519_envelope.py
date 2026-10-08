"""C5-B3B2L synthetic envelope/policy tests: no keys or crypto signing."""
import base64
import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inert_launcher_claim import DOMAIN
from inert_ed25519_envelope import EnvelopeBlocked, preview_ed25519_envelope
from test_inert_launcher_claim import PAYLOAD, claim


def evidence():
    c = claim()
    raw = json.dumps(c, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    e = {"schemaVersion": 1, "kind": "sanq-root-launcher-signature-v1",
         "domain": DOMAIN, "algorithm": "Ed25519", "keyId": c["keyId"],
         "claimSha256": "sha256:" + hashlib.sha256(DOMAIN.encode() + b"\0" + raw).hexdigest(),
         "signature": base64.b64encode(b"z" * 64).decode("ascii")}
    p = {"schemaVersion": 1, "kind": "inert-launcher-trust-policy-v1",
         "algorithm": "Ed25519", "policyVersion": 1, "minimumAcceptedVersion": 1,
         "keyId": c["keyId"], "publicKeyHex": "a" * 64,
         "revokedKeyIds": [], "revokedArtifactSha256": [],
         "publisherIdentity": c["publisherIdentity"],
         "buildWorkflowIdentity": c["buildWorkflowIdentity"],
         "sourceRepository": "sanqin888/sanqinMVP",
         "bootstrapAuthorized": False}
    return c, e, p


class InertEd25519EnvelopeTests(unittest.TestCase):
    def test_consistent_untrusted_envelope_never_authenticates(self):
        c, e, p = evidence()
        output = preview_ed25519_envelope(c, PAYLOAD, e, p)
        self.assertTrue(output["signatureEncodingValid"])
        for f in ("signatureCryptographicallyVerified", "independentTrustRootVerified",
                  "revocationAuthorityVerified", "publisherAuthenticated",
                  "readyToInstall", "readyToDeploy", "readyToRollback",
                  "authorizedToMutateProduction"):
            self.assertIs(output[f], False)

    def test_domain_algorithm_signature_digest_and_key_blocked(self):
        for field, val in (("domain", "sanq.runtime.v1"), ("algorithm", "RSA"),
                           ("signature", "A" * 88), ("signature", "bad"),
                           ("keyId", "forged"), ("claimSha256", "sha256:" + "0" * 64)):
            c, e, p = evidence()
            e[field] = val
            with self.subTest(field=field), self.assertRaises(EnvelopeBlocked):
                preview_ed25519_envelope(c, PAYLOAD, e, p)
        c, e, p = evidence()
        e["publicKey"] = "untrusted"
        with self.assertRaises(EnvelopeBlocked):
            preview_ed25519_envelope(c, PAYLOAD, e, p)

    def test_policy_epoch_revocation_and_spoofing_blocked(self):
        for field, val in (("policyVersion", 0), ("minimumAcceptedVersion", 2),
                           ("publicKeyHex", "bad"), ("keyId", "foreign"),
                           ("bootstrapAuthorized", True),
                           ("sourceRepository", "unknown/repo"),
                           ("publisherIdentity", "forged")):
            c, e, p = evidence()
            p[field] = val
            with self.subTest(field=field), self.assertRaises(EnvelopeBlocked):
                preview_ed25519_envelope(c, PAYLOAD, e, p)
        c, e, p = evidence()
        p["revokedKeyIds"] = [c["keyId"]]
        with self.assertRaises(EnvelopeBlocked):
            preview_ed25519_envelope(c, PAYLOAD, e, p)
        c, e, p = evidence()
        p["revokedArtifactSha256"] = [c["artifactSha256"]]
        with self.assertRaises(EnvelopeBlocked):
            preview_ed25519_envelope(c, PAYLOAD, e, p)
        c, e, p = evidence()
        p["extra"] = "ignored?"
        with self.assertRaises(EnvelopeBlocked):
            preview_ed25519_envelope(c, PAYLOAD, e, p)


if __name__ == "__main__":
    unittest.main()
