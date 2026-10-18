"""B4B-3B-2B2-A: synthetic-only alias claims, NO filesystem/Guest probes."""
import copy
import hashlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from root_python_dependency_manifest import (  # noqa: E402
    SCHEMA as MANIFEST_SCHEMA, canonical_manifest_bytes,
)
from root_python_usrmerge_alias_claims import (  # noqa: E402
    SCHEMA, UntrustedAliasBlocked, review_proposed_usrmerge_aliases,
)


def _synthetic_manifest(*, extra_nodes=None):
    nodes = [
        {
            "id": "interpreter", "kind": "python-executable",
            "path": "/usr/bin/python3.12", "sha256": "a" * 64,
            "requires": ["loader"],
        },
        {
            "id": "loader", "kind": "elf-loader",
            "path": "/lib64/ld-linux-x86-64.so.2", "sha256": "b" * 64,
            "requires": [],
        },
    ]
    nodes.extend(extra_nodes or [])
    for extra in extra_nodes or []:
        nodes[1]["requires"].append(extra["id"])
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "platform": {
            "os": "linux", "architecture": "x86_64",
            "pythonVersion": "3.12.3",
            "isolationFlags": ["-I", "-S", "-B"],
        },
        "nodes": nodes,
    }
    digest = hashlib.sha256(canonical_manifest_bytes(manifest)).hexdigest()
    pins = {
        node["path"]: node["sha256"] for node in nodes
        if node["path"] is not None
    }
    return manifest, pins, digest


def _native_file(name, path_root="/lib/x86_64-linux-gnu/"):
    return {
        "id": "lib:" + name, "kind": "native-library",
        "path": path_root + name, "sha256": "c" * 64,
        "requires": [],
    }


class InertUsrmergeAliasClaimsTests(unittest.TestCase):
    def setUp(self):
        self.manifest, self.pins, self.digest = _synthetic_manifest()
        self.aliases = [{
            "linkPath": "/lib64", "targetPath": "/usr/lib64",
        }]

    def inspect(self):
        return review_proposed_usrmerge_aliases(
            self.manifest,
            expected_manifest_sha256=self.digest,
            proposed_file_pins=self.pins,
            proposed_alias_claims=self.aliases,
        )

    def test_valid_synthetic_claims_are_still_blocked(self):
        before = copy.deepcopy((self.manifest, self.pins, self.aliases))
        result = self.inspect()
        self.assertEqual(result["schema"], SCHEMA)
        self.assertEqual(result["decision"], "BLOCKED")
        self.assertEqual(
            result["proposedFiles"],
            [
                {
                    "declaredPath": "/lib64/ld-linux-x86-64.so.2",
                    "proposedPathAfterClaims": "/usr/lib64/ld-linux-x86-64.so.2",
                    "claimedAliasPrefixes": ["/lib64"],
                },
                {
                    "declaredPath": "/usr/bin/python3.12",
                    "proposedPathAfterClaims": "/usr/bin/python3.12",
                    "claimedAliasPrefixes": [],
                },
            ],
        )
        self.assertTrue(result["manifestAndAliasClaimsStructurallyReviewed"])
        for field in (
            "proposedPathsAuthenticated", "symlinksOrLoaderPathsObserved",
            "rootAnchorOrMountNamespaceAuthenticated",
            "fileIdentityOrExternalPinProvenanceAuthenticated",
            "dynamicPythonElfAndDlopenClosureVerified",
            "independentGuestWitnessVerified", "readyToInstall",
            "authorizedToMutateProduction",
        ):
            self.assertIs(result[field], False, field)
        self.assertEqual(
            before, (self.manifest, self.pins, self.aliases),
            "input claims must remain untouched",
        )

    def test_lib_and_lib64_are_separate_claims(self):
        self.manifest, self.pins, self.digest = _synthetic_manifest(
            extra_nodes=[_native_file("libsanq.so.3")])
        self.aliases.append({"linkPath": "/lib", "targetPath": "/usr/lib"})
        output = self.inspect()
        native = next(f for f in output["proposedFiles"]
                      if "libsanq.so.3" in f["declaredPath"])
        self.assertEqual(native["proposedPathAfterClaims"],
                         "/usr/lib/x86_64-linux-gnu/libsanq.so.3")
        self.assertEqual(native["claimedAliasPrefixes"], ["/lib"])
        self.assertEqual(output["decision"], "BLOCKED")

    def test_rejects_unsupported_aliases_and_targets(self):
        for aliases in (
            [{"linkPath": "/etc", "targetPath": "/usr/etc"}],
            [{"linkPath": "/lib64", "targetPath": "/root/private"}],
            [{"linkPath": "/lib64", "targetPath": "/usr/lib64/../lib"}],
            [{"linkPath": "/lib64", "targetPath": "usr/lib64"}],
            [{"linkPath": "/lib64", "targetPath": "/usr/lib"}],
            [{"linkPath": "/lib64", "targetPath": "/usr/lib64",
              "authenticated": True}],
            [{"linkPath": "/lib64", "targetPath": "/usr/lib64"},
             {"linkPath": "/lib64", "targetPath": "/usr/lib64"}],
            [{"linkPath": "/lib", "targetPath": "/usr/lib"},
             {"linkPath": "/lib64", "targetPath": "/usr/lib64"},
             {"linkPath": "/usr/lib64", "targetPath": "/etc"}],
            [{"linkPath": "/lib64", "targetPath": "/usr/lib64"},
             {"linkPath": "/lib", "targetPath": "/usr/lib"}],
            [],
            "not-a-list",
        ):
            with self.subTest(aliases=aliases):
                self.aliases = aliases
                with self.assertRaises(UntrustedAliasBlocked):
                    self.inspect()

    def test_rejects_bad_manifest_or_unpinned_claims(self):
        self.digest = "f" * 64
        with self.assertRaises(UntrustedAliasBlocked):
            self.inspect()
        self.manifest, self.pins, self.digest = _synthetic_manifest()
        self.pins["/usr/bin/python3.12"] = "0" * 64
        with self.assertRaises(UntrustedAliasBlocked):
            self.inspect()

    def test_rejects_oversized_manifest_file_list(self):
        extras = [_native_file(f"libsanq{i}.so.3") for i in range(63)]
        self.manifest, self.pins, self.digest = _synthetic_manifest(
            extra_nodes=extras)
        with self.assertRaises(UntrustedAliasBlocked):
            self.inspect()

    def test_no_live_open_or_runtime_bundle_registration(self):
        import root_python_usrmerge_alias_claims as component
        self.assertNotIn(
            "ops/runtime/root_python_usrmerge_alias_claims.py",
            __import__("build_bundle").SOURCE_FILES,
        )
        for forbidden in ("main", "run", "execute", "install", "open",
                          "subprocess", "os", "pathlib", "ctypes",
                          "importlib", "readlink", "realpath"):
            self.assertFalse(hasattr(component, forbidden), forbidden)


if __name__ == "__main__":
    unittest.main()
