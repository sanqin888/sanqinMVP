"""C4-B offline checks: runtime provenance, mount identity and mutation authority."""

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

RELEASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RELEASE_DIR))
spec = importlib.util.spec_from_file_location("sanq_c4_controller", RELEASE_DIR / "deploy_release.py")
assert spec is not None and spec.loader is not None
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

SHA = "a" * 40
OTHER = "b" * 40
DIGEST = "sha256:" + "e" * 64


def manifest(files):
    return {
        "schemaVersion": 1,
        "sourceSha": SHA,
        "sourceBranch": "main",
        "productionActivationAuthorized": False,
        "files": {
            name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            for name, data in files.items()
        },
        "applicationImages": {
            name: {"ref": f"ghcr.io/sanqin888/{name}:{SHA}", "digest": DIGEST}
            for name in deploy.IMAGE_NAMES
        },
    }


def candidate(sha=SHA, digest=DIGEST):
    return {
        "sourceSha": sha,
        "images": {
            name: {"ref": f"ghcr.io/sanqin888/{name}:{sha}", "digest": digest}
            for name in deploy.IMAGE_NAMES
        },
    }


class RuntimeControllerC4Tests(unittest.TestCase):
    def test_root_owned_runtime_requires_root_for_mutation(self):
        with patch.object(deploy.os, "geteuid", return_value=1000):
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "root operator"):
                deploy.require_mutation_privilege()
        with patch.object(deploy.os, "geteuid", return_value=0):
            deploy.require_mutation_privilege()

    def test_runtime_manifest_without_checkout_checks_root_owned_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "runtime"
            root.mkdir()
            data = {name: ("safe fixture " + name).encode() for name in deploy.SOURCE_FILES}
            for name, content in data.items():
                destination = root / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(content)
            record = manifest(data)
            record_path = root / "runtime-release.json"
            record_path.write_text(json.dumps(record))
            original_stat = Path.stat

            def root_owned(path, *args, **kwargs):
                info = original_stat(path, *args, **kwargs)
                return SimpleNamespace(st_mode=info.st_mode, st_uid=0, st_size=info.st_size)

            with patch.object(deploy, "ROOT", root), \
                 patch.object(deploy, "RUNTIME_MANIFEST", record_path), \
                 patch.object(Path, "stat", root_owned):
                self.assertEqual(deploy.runtime_manifest()["sourceSha"], SHA)
                with patch.object(deploy, "github_json", return_value={
                    "status": "ahead", "behind_by": 0,
                    "total_commits": 1, "files": [{"filename": "apps/web/src/page.tsx"}],
                }):
                    deploy.verify_runtime_release(candidate(sha=OTHER))
                (root / deploy.SOURCE_FILES[0]).write_bytes(b"tampered")
                with self.assertRaisesRegex(deploy.DeploymentBlocked, "checksum mismatch"):
                    deploy.runtime_manifest()

    def test_runtime_compatibility_blocks_changed_runtime_members(self):
        record = manifest({name: b"x" for name in deploy.SOURCE_FILES})
        with patch.object(deploy, "runtime_manifest", return_value=record):
            for changed in (
                [{"filename": "ops/release/deploy_release.py"}],
                [{"filename": "renamed-new", "previous_filename": "docker-compose.yml",
                  "status": "renamed"}],
            ):
                with self.subTest(changed=changed), patch.object(deploy, "github_json",
                    return_value={"status": "ahead", "behind_by": 0,
                                  "total_commits": 1, "files": changed}):
                    with self.assertRaisesRegex(deploy.DeploymentBlocked, "Runtime files"):
                        deploy.verify_runtime_release(candidate(sha=OTHER))
            with patch.object(deploy, "github_json", return_value={
                "status": "ahead", "behind_by": 0, "total_commits": 251, "files": []
            }):
                with self.assertRaises(deploy.DeploymentBlocked):
                    deploy.verify_runtime_release(candidate(sha=OTHER))
            with patch.object(deploy, "github_json", return_value={
                "status": "ahead", "behind_by": 0, "total_commits": 1,
            }):
                with self.assertRaises(deploy.DeploymentBlocked):
                    deploy.verify_runtime_release(candidate(sha=OTHER))

    def test_manifest_activation_claim_is_never_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            m = manifest({name: b"x" for name in deploy.SOURCE_FILES})
            m["productionActivationAuthorized"] = True
            path = root / "runtime-release.json"
            path.write_text(json.dumps(m))
            with patch.object(deploy, "RUNTIME_MANIFEST", path):
                with self.assertRaisesRegex(deploy.DeploymentBlocked, "source/activation"):
                    deploy.runtime_manifest()

    def test_live_volume_and_uploads_are_exact(self):
        evidence = {
            "db": [{
                "Type": "volume", "Destination": "/var/lib/postgresql/data",
                "Name": "sanq-app_pgdata",
            }],
            "api": [{
                "Type": "bind", "Destination": "/app/uploads",
                "Source": "/srv/sanq/uploads",
            }],
            "ubereats-worker": [{
                "Type": "bind", "Destination": "/app/uploads",
                "Source": "/srv/sanq/uploads",
            }],
        }
        def docker(args, **kwargs):
            if args[:3] == ["docker", "volume", "inspect"]:
                self.assertEqual(args[3], "sanq-app_pgdata")
                return "{}"
            service = args[-1].removeprefix("container-")
            return json.dumps(evidence[service])
        def compose(sha, *args, **kwargs):
            self.assertEqual(sha, SHA)
            self.assertEqual(args[:2], ("ps", "-q"))
            return "container-" + args[2]
        with patch.object(deploy, "compose", side_effect=compose), \
             patch.object(deploy, "run", side_effect=docker):
            deploy.check_live_storage(SHA)
            evidence["db"][0]["Name"] = "fresh_empty_volume"
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "db persistent mount"):
                deploy.check_live_storage(SHA)
            evidence["db"][0]["Name"] = "sanq-app_pgdata"
            evidence["api"][0]["Source"] = "/opt/sanq/runtime/uploads"
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "api persistent mount"):
                deploy.check_live_storage(SHA)

    def test_atomic_env_update_preserves_original_ownership(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / ".env"
            env.write_text(f"SANQ_IMAGE_SHA={SHA}\n")
            env.chmod(0o600)
            original = env.stat()
            with patch.object(deploy, "ENV", env), \
                 patch.object(deploy.os, "geteuid", return_value=0), \
                 patch.object(deploy.os, "fchown") as chown:
                deploy.update_env_sha(OTHER)
                chown.assert_called_once()
                self.assertEqual(chown.call_args.args[1:], (original.st_uid, original.st_gid))
            self.assertEqual(env.read_text(), f"SANQ_IMAGE_SHA={OTHER}\n")
            self.assertEqual(env.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
