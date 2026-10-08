"""Offline safety tests for the manually triggered Batch B release controller."""

from __future__ import annotations

import importlib.util
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RELEASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RELEASE_DIR))
spec = importlib.util.spec_from_file_location(
    "sanq_deploy_release", RELEASE_DIR / "deploy_release.py"
)
assert spec is not None and spec.loader is not None
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

CURRENT = "a" * 40
TARGET = "b" * 40
DIGEST = "sha256:" + "f" * 64


def candidate(sha=TARGET):
    return {
        "sourceSha": sha,
        "publicationUrl": "https://github.com/sanqin888/sanqinMVP/actions/runs/42",
        "images": {
            name: {
                "ref": f"ghcr.io/sanqin888/{name}:{sha}",
                "digest": DIGEST,
            }
            for name in deploy.IMAGE_NAMES
        },
    }


class DeploymentSafetyTests(unittest.TestCase):
    def test_current_sha_requires_exact_single_key(self):
        self.assertEqual(
            deploy.current_sha_from_text("A=1\nSANQ_IMAGE_SHA=" + CURRENT + "\n"),
            CURRENT,
        )
        for text in [
            "DB_PASSWORD=redacted",
            "SANQ_IMAGE_SHA=latest",
            f"SANQ_IMAGE_SHA={CURRENT}\nSANQ_IMAGE_SHA={TARGET}\n",
        ]:
            with self.assertRaises(ValueError):
                deploy.current_sha_from_text(text)

    def test_env_change_is_atomic_preserves_keys_and_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / ".env"
            env.write_text(f"DB_USER=staff\nSANQ_IMAGE_SHA={CURRENT}\nDB_PASSWORD=unchanged\n")
            env.chmod(0o600)
            with patch.object(deploy, "ENV", env):
                deploy.update_env_sha(TARGET)
            self.assertEqual(env.stat().st_mode & 0o777, 0o600)
            self.assertEqual(
                env.read_text(),
                f"DB_USER=staff\nSANQ_IMAGE_SHA={TARGET}\nDB_PASSWORD=unchanged\n",
            )

    def test_symlink_env_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            actual = base / "real.env"
            actual.write_text(f"SANQ_IMAGE_SHA={CURRENT}\n")
            alias = base / ".env"
            alias.symlink_to(actual)
            with patch.object(deploy, "ENV", alias):
                with self.assertRaisesRegex(deploy.DeploymentBlocked, "symlink"):
                    deploy.update_env_sha(TARGET)

    def test_state_roundtrip_and_pending_blocks_new_deploy(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_file = Path(tmp) / "release.json"
            with patch.object(deploy, "STATE", state_file):
                deploy.write_state("pending", TARGET, CURRENT, reason="test")
                state = deploy.read_state()
                self.assertEqual(state["phase"], "pending")
                self.assertEqual(state["current"], TARGET)
                with patch.object(deploy, "ensure_repo_location"):
                    with patch.object(deploy, "read_current_sha", return_value=TARGET):
                        with self.assertRaisesRegex(deploy.DeploymentBlocked, "pending"):
                            deploy.deploy(execute=True)

    def test_plan_does_not_run_preflight_pull_or_recreate(self):
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current") as preflight, \
             patch.object(deploy, "pull_and_verify") as pull, \
             patch.object(deploy, "update_env_sha") as edit, \
             patch.object(deploy, "promote_images") as promote:
            deploy.deploy(execute=False)
            preflight.assert_not_called()
            pull.assert_not_called()
            edit.assert_not_called()
            promote.assert_not_called()

    def test_deploy_gate_failure_does_not_edit_env(self):
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current"), \
             patch.object(deploy, "pull_and_verify"), \
             patch.object(deploy, "candidate_migration_status", side_effect=deploy.DeploymentBlocked("pending migration")), \
             patch.object(deploy, "write_state") as state, \
             patch.object(deploy, "update_env_sha") as edit, \
             patch.object(deploy, "promote_images") as promote:
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "pending migration"):
                deploy.deploy(execute=True)
            edit.assert_not_called()
            promote.assert_not_called()
            state.assert_not_called()

    def test_deploy_writes_pending_before_up_and_only_active_after_readiness(self):
        order = []
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current"), \
             patch.object(deploy, "pull_and_verify"), \
             patch.object(deploy, "candidate_migration_status", return_value=False), \
             patch.object(deploy, "write_state", side_effect=lambda phase, **kw: order.append(phase)), \
             patch.object(deploy, "update_env_sha", side_effect=lambda sha: order.append("env")), \
             patch.object(deploy, "promote_images", side_effect=lambda sha: order.append("up")), \
             patch.object(deploy, "verify_after_switch", side_effect=lambda sha: order.append("ready")):
            deploy.deploy(execute=True)
        self.assertEqual(order, ["pending", "env", "up", "ready", "active"])

    def test_no_automatic_rollback_on_health_failure(self):
        phases = []
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current"), \
             patch.object(deploy, "pull_and_verify"), \
             patch.object(deploy, "candidate_migration_status", return_value=False), \
             patch.object(deploy, "write_state", side_effect=lambda phase, **kw: phases.append(phase)), \
             patch.object(deploy, "update_env_sha"), \
             patch.object(deploy, "promote_images"), \
             patch.object(deploy, "verify_after_switch", side_effect=deploy.DeploymentBlocked("not ready")):
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "PENDING incident"):
                deploy.deploy(execute=True)
        self.assertEqual(phases, ["pending"])

    def test_rollback_without_execute_is_read_only(self):
        state = {"current": TARGET, "previous": CURRENT, "phase": "active"}
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=TARGET), \
             patch.object(deploy, "read_state", return_value=state), \
             patch.object(deploy, "compose") as compose, \
             patch.object(deploy, "update_env_sha") as edit:
            deploy.rollback(execute=False)
            compose.assert_not_called()
            edit.assert_not_called()

    def test_unhealthy_active_release_does_not_block_explicit_rollback(self):
        state = {"current": TARGET, "previous": CURRENT, "phase": "active"}
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=TARGET), \
             patch.object(deploy, "read_state", return_value=state), \
             patch.object(deploy, "preflight_current") as old_readiness, \
             patch.object(deploy, "check_backup") as backup, \
             patch.object(deploy, "run"), \
             patch.object(deploy, "candidate_migration_status", return_value=False), \
             patch.object(deploy, "write_state"), \
             patch.object(deploy, "update_env_sha"), \
             patch.object(deploy, "promote_images"), \
             patch.object(deploy, "verify_after_switch"):
            deploy.rollback(execute=True)
        old_readiness.assert_not_called()
        backup.assert_called_once()

    def test_docker_up_never_includes_db_or_build(self):
        with patch.object(deploy, "compose") as compose:
            deploy.promote_images(TARGET)
            compose.assert_called_once_with(
                TARGET, "up", "-d", "--no-build", "--no-deps",
                "api", "ubereats-worker", "web",
            )

    def test_advance_fails_closed_on_diverged_release(self):
        with patch.object(deploy, "github_json", return_value={"status": "diverged", "behind_by": 1}):
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "forward"):
                deploy.check_main_advance(CURRENT, TARGET)
        with patch.object(deploy, "github_json", return_value={"status": "ahead", "behind_by": 0}):
            deploy.check_main_advance(CURRENT, TARGET)

    def test_pulled_digest_must_match_seal(self):
        with patch.object(deploy, "run", return_value=json.dumps(
            ["ghcr.io/sanqin888/sanq-api@sha256:" + "0" * 64]
        )):
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "digest differs"):
                deploy.verify_local_image(f"ghcr.io/sanqin888/sanq-api:{TARGET}", DIGEST)



    def test_candidate_status_only_accepts_clean_pending(self):
        from subprocess import CompletedProcess
        with patch.object(deploy.subprocess, "run", return_value=CompletedProcess([], 0, "", "")):
            self.assertIs(deploy.candidate_migration_status(TARGET), False)
        pending = "Following migration(s) have not yet been applied:\n20261008_example"
        with patch.object(deploy.subprocess, "run", return_value=CompletedProcess([], 1, "", pending)):
            self.assertIs(deploy.candidate_migration_status(TARGET), True)
        for output in (pending + "\nError: drift", "Error: database unavailable",
                       pending + "\nFailed migration history"):
            with self.subTest(output=output), patch.object(
                deploy.subprocess, "run", return_value=CompletedProcess([], 1, "", output)
            ):
                with self.assertRaises(deploy.DeploymentBlocked):
                    deploy.candidate_migration_status(TARGET)

    def test_pending_migration_requires_explicit_opt_in_before_state(self):
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current"), \
             patch.object(deploy, "pull_and_verify"), \
             patch.object(deploy, "candidate_migration_status", return_value=True), \
             patch.object(deploy, "write_state") as state, \
             patch.object(deploy, "apply_reviewed_migrations") as migration, \
             patch.object(deploy, "update_env_sha") as edit:
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "--apply-migrations"):
                deploy.deploy(execute=True)
            state.assert_not_called()
            migration.assert_not_called()
            edit.assert_not_called()

    def test_opted_in_pending_migration_precedes_env_update(self):
        order = []
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current"), \
             patch.object(deploy, "pull_and_verify"), \
             patch.object(deploy, "candidate_migration_status", return_value=True), \
             patch.object(deploy, "write_state", side_effect=lambda phase, **kw: order.append(phase)), \
             patch.object(deploy, "compose", side_effect=lambda sha, *args: order.append(args[0])), \
             patch.object(deploy, "apply_reviewed_migrations", side_effect=lambda sha: order.append("migrate")), \
             patch.object(deploy, "update_env_sha", side_effect=lambda sha: order.append("env")), \
             patch.object(deploy, "promote_images", side_effect=lambda sha: order.append("up")), \
             patch.object(deploy, "verify_after_switch", side_effect=lambda sha: order.append("ready")):
            deploy.deploy(execute=True, apply_migrations=True)
        self.assertEqual(order, ["pending", "stop", "migrate", "env", "up", "ready", "active"])

    def test_migration_failure_leaves_pending_without_env_change(self):
        phases = []
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current"), \
             patch.object(deploy, "pull_and_verify"), \
             patch.object(deploy, "candidate_migration_status", return_value=True), \
             patch.object(deploy, "write_state", side_effect=lambda phase, **kw: phases.append(phase)), \
             patch.object(deploy, "compose"), \
             patch.object(deploy, "apply_reviewed_migrations",
                          side_effect=deploy.DeploymentBlocked("migration failed")), \
             patch.object(deploy, "update_env_sha") as env, \
             patch.object(deploy, "promote_images") as promote:
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "PENDING"):
                deploy.deploy(execute=True, apply_migrations=True)
            self.assertEqual(phases, ["pending"])
            env.assert_not_called()
            promote.assert_not_called()

    def test_without_pending_migration_no_migration_or_stop(self):
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "verify_runtime_release"), \
             patch.object(deploy, "read_current_sha", return_value=CURRENT), \
             patch.object(deploy, "read_state", return_value=None), \
             patch.object(deploy, "latest_candidate", return_value=candidate()), \
             patch.object(deploy, "preflight_current"), \
             patch.object(deploy, "pull_and_verify"), \
             patch.object(deploy, "candidate_migration_status", return_value=False), \
             patch.object(deploy, "write_state"), \
             patch.object(deploy, "compose") as compose, \
             patch.object(deploy, "apply_reviewed_migrations") as migration, \
             patch.object(deploy, "update_env_sha"), \
             patch.object(deploy, "promote_images"), \
             patch.object(deploy, "verify_after_switch"):
            deploy.deploy(execute=True, apply_migrations=True)
            compose.assert_not_called()
            migration.assert_not_called()

if __name__ == "__main__":
    unittest.main()
