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
             patch.object(deploy, "verify_rollback_images"), \
             patch.object(deploy, "run"), \
             patch.object(deploy, "candidate_migration_status", return_value=False), \
             patch.object(deploy, "write_state"), \
             patch.object(deploy, "update_env_sha"), \
             patch.object(deploy, "promote_images"), \
             patch.object(deploy, "verify_after_switch"):
            deploy.rollback(execute=True)
        old_readiness.assert_not_called()
        backup.assert_called_once()

    def test_startup_waits_for_all_app_containers_before_http(self):
        observations = iter(["starting", "healthy", "healthy", "healthy", "healthy", "healthy"])

        def inspect(_args, **_kwargs):
            return json.dumps({"Status": "running", "Health": {"Status": next(observations)}})

        with patch.object(deploy, "compose", side_effect=lambda _sha, _cmd, _q, svc, capture: svc), \
             patch.object(deploy, "run", side_effect=inspect), \
             patch.object(deploy.time, "monotonic", side_effect=[0, 0, 1]), \
             patch.object(deploy.time, "sleep") as sleep:
            deploy.wait_for_app_health(TARGET)
        sleep.assert_called_once_with(2)

    def test_startup_timeout_does_not_accept_unhealthy_containers(self):
        with patch.object(deploy, "compose", side_effect=lambda _sha, _cmd, _q, svc, capture: svc), \
             patch.object(deploy, "run", return_value=json.dumps({
                 "Status": "running", "Health": {"Status": "unhealthy"},
             })), \
             patch.object(deploy.time, "monotonic", side_effect=[0, 91]), \
             patch.object(deploy.time, "sleep") as sleep:
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "startup timeout"):
                deploy.wait_for_app_health(TARGET)
        sleep.assert_not_called()

    def test_startup_exited_container_blocks_immediately(self):
        with patch.object(deploy, "compose", return_value="container-id"), \
             patch.object(deploy, "run", return_value=json.dumps({"Status": "exited"})), \
             patch.object(deploy.time, "sleep") as sleep:
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "not running"):
                deploy.wait_for_app_health(TARGET)
        sleep.assert_not_called()

    def test_post_switch_waits_before_http_readiness(self):
        order = []
        with patch.object(deploy, "check_running_images", side_effect=lambda _: order.append("images")), \
             patch.object(deploy, "check_live_storage", side_effect=lambda _: order.append("mounts")), \
             patch.object(deploy, "wait_for_app_health", side_effect=lambda _: order.append("health")), \
             patch.object(deploy, "run", side_effect=lambda *_args, **_kw: order.append("http")):
            deploy.verify_after_switch(TARGET)
        self.assertEqual(order, ["images", "mounts", "health", "http"])

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



    @staticmethod
    def _prisma_cli_status(names=(), *, count=191, executor="npx "):
        # Prisma v6.19.1 MigrateStatus.ts writes count and full status to
        # stdout; pending exits 1 and clean exits 0. These are synthetic
        # transcripts grounded in that pinned source, not observed DB runs.
        prefix = (
            "Prisma schema loaded from prisma/schema.prisma\n"
            'Datasource "db": PostgreSQL database "sanq", schema "public" at "db:5432"\n'
            f"\n{count} migration{'s' if count > 1 else ''} found in prisma/migrations\n"
        )
        if not names:
            return prefix + "\nDatabase schema is up to date!\n"
        return (
            prefix +
            f"Following migration{'s' if len(names) > 1 else ''} have not yet been applied:\n" +
            "\n".join(names) + "\n" +
            f"To apply migrations in development run {executor}prisma migrate dev.\n" +
            f"To apply migrations in production run {executor}prisma migrate deploy.\n"
        )

    def test_candidate_status_only_accepts_complete_clean_or_pending(self):
        from subprocess import CompletedProcess
        clean = self._prisma_cli_status()
        singular = self._prisma_cli_status(("20261016123456_add_test_field",))
        singular_only = self._prisma_cli_status(
            ("20261016123456_add_test_field",), count=1,
        )
        plural = self._prisma_cli_status((
            "20261016123456_add_test_field", "20261016124512_add_test_index",
        ))
        for code, stdout, expected in ((0, clean, False), (1, singular, True),
                                       (1, singular_only, True), (1, plural, True)):
            with self.subTest(code=code, stdout=stdout), patch.object(
                deploy.subprocess, "run",
                return_value=CompletedProcess([], code, stdout, ""),
            ):
                self.assertIs(deploy.candidate_migration_status(TARGET), expected)

    def test_prisma_status_fail_closed_on_truncated_or_mixed_transcripts(self):
        clean = self._prisma_cli_status()
        pending = self._prisma_cli_status(("20261016123456_add_test_field",))
        blocked = (
            (0, "", ""),
            (0, clean + "unexpected extra output\n", ""),
            (0, pending, ""),
            (1, clean, ""),
            (1, pending + "unexpected extra output\n", ""),
            (1, pending.replace("To apply migrations in production run npx prisma migrate deploy.\n", ""), ""),
            (1, pending.replace("Following migration have", "Following migrations have"), ""),
            (1, pending.replace("191 migrations found", "1 migrations found"), ""),
            (1, pending.replace("20261016123456_add_test_field", "fatal: unauthenticated"), ""),
            (1, pending.replace("20261016123456_add_test_field", "20261016123456_add_test_field\n20261016123456_add_test_field"), ""),
            (1, pending.replace("20261016123456_add_test_field", "20261016123456_add_test_field\nUnknown warning"), ""),
            (1, pending.replace("Prisma schema loaded from prisma/schema.prisma\n", ""), ""),
            (1, pending.replace('Datasource "db": PostgreSQL database "sanq", schema "public" at "db:5432"\n', ""), ""),
            (1, "Your local migration history and the migrations table from your database are different:\n" + pending, ""),
            (1, "Prisma schema loaded from prisma/schema.prisma\n"
                'Datasource "db": PostgreSQL database "sanq", schema "public" at "db:5432"\n'
                "\n191 migrations found in prisma/migrations\n"
                "Following migration have failed:\n20261016123456_add_test_field\n", ""),
            (1, "Prisma schema loaded from prisma/schema.prisma\n"
                'Datasource "db": PostgreSQL database "sanq", schema "public" at "db:5432"\n'
                "\n191 migrations found in prisma/migrations\n"
                "The current database is not managed by Prisma Migrate.\n", ""),
            (1, pending.replace("Prisma schema loaded from prisma/schema.prisma\n",
                                "Prisma schema loaded from prisma/schema.prisma\n"
                                "Prisma schema loaded from prisma/schema.prisma\n"), ""),
            (1, pending, "P3009: a failed migration"),
            (1, "", pending),
            (2, pending, ""),
            (0, clean, "unexpected warning"),
            (1, pending.replace("npx prisma migrate dev", "unknown prisma migrate dev"), ""),
            (1, pending + "\x1b[31m", ""),
            (1, pending * 1000, ""),
        )
        for code, stdout, stderr in blocked:
            with self.subTest(code=code, stdout=stdout[:100], stderr=stderr):
                with self.assertRaisesRegex(deploy.DeploymentBlocked, "ambiguous or unsafe"):
                    deploy.classify_prisma_migration_status(code, stdout, stderr)

    def test_prisma_status_accepts_recognized_v6_banner_variants(self):
        pending = self._prisma_cli_status(("20261016123456_add_test_field",))
        for executor in ("", "npx ", "pnpm ", "pnpm exec ", "yarn ", "bunx "):
            transcript = pending.replace("npx prisma migrate", executor + "prisma migrate")
            transcript = "Environment variables loaded from .env\n" + transcript
            with self.subTest(executor=executor):
                self.assertTrue(deploy.classify_prisma_migration_status(1, transcript, ""))

    def test_candidate_migration_status_uses_target_sha_and_is_read_only(self):
        from subprocess import CompletedProcess
        clean = self._prisma_cli_status()
        with patch.object(deploy.subprocess, "run",
                          return_value=CompletedProcess([], 0, clean, "")) as subprocess_call:
            self.assertFalse(deploy.candidate_migration_status(TARGET))
        args, kwargs = subprocess_call.call_args
        self.assertIn("migrate status", args[0][-1])
        self.assertNotIn("migrate deploy", args[0][-1])
        self.assertEqual(kwargs["env"]["SANQ_IMAGE_SHA"], TARGET)
        self.assertFalse(kwargs["check"])

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

    def test_batch_a_image_only_forward_and_runtime_change_gate(self):
        manifest = {
            "sourceSha": CURRENT,
            "applicationImages": {
                name: {"ref": f"ghcr.io/sanqin888/{name}:{CURRENT}", "digest": DIGEST}
                for name in deploy.IMAGE_NAMES
            },
        }
        unchanged = {"status": "ahead", "behind_by": 0, "total_commits": 1, "files": [
            {"filename": "apps/api/src/something.ts", "status": "modified"},
        ]}
        with patch.object(deploy, "runtime_manifest", return_value=manifest), \
             patch.object(deploy, "github_json", return_value=unchanged):
            deploy.verify_runtime_release(candidate())
        for comparison in (
            {**unchanged, "files": [{"filename": "ops/release/deploy_release.py", "status": "modified"}]},
            {**unchanged, "files": [{"filename": "ops/verify-runtime-readiness.sh", "status": "renamed", "previous_filename": "legacy"}]},
            {**unchanged, "files": None},
            {**unchanged, "status": "diverged", "behind_by": 1},
            {**unchanged, "total_commits": 251},
        ):
            with self.subTest(comparison=comparison), \
                 patch.object(deploy, "runtime_manifest", return_value=manifest), \
                 patch.object(deploy, "github_json", return_value=comparison):
                with self.assertRaises(deploy.DeploymentBlocked):
                    deploy.verify_runtime_release(candidate())

    def test_batch_a_previous_images_need_exact_digests(self):
        old_release = candidate(CURRENT)
        with patch.object(deploy, "sealed_release_for_sha", return_value=old_release) as sealed, \
             patch.object(deploy, "verify_local_image") as verify:
            deploy.verify_rollback_images(CURRENT)
            self.assertEqual(verify.call_count, 2)
            self.assertEqual({call.args[0] for call in verify.call_args_list},
                             {old_release["images"][name]["ref"] for name in deploy.IMAGE_NAMES})
            sealed.assert_called_once()
        with patch.object(deploy, "sealed_release_for_sha", return_value=old_release), \
             patch.object(deploy, "verify_local_image",
                          side_effect=deploy.DeploymentBlocked("digest differs")):
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "digest differs"):
                deploy.verify_rollback_images(CURRENT)

    def test_batch_a_rollback_digest_gate_is_before_pending_or_mutation(self):
        state = {"current": TARGET, "previous": CURRENT, "phase": "active"}
        with patch.object(deploy, "ensure_repo_location"), \
             patch.object(deploy, "require_mutation_privilege"), \
             patch.object(deploy, "read_current_sha", return_value=TARGET), \
             patch.object(deploy, "read_state", return_value=state), \
             patch.object(deploy, "check_backup"), \
             patch.object(deploy, "verify_rollback_images",
                          side_effect=deploy.DeploymentBlocked("previous image digest mismatch")), \
             patch.object(deploy, "candidate_migration_status") as migration, \
             patch.object(deploy, "write_state") as write_state, \
             patch.object(deploy, "update_env_sha") as env, \
             patch.object(deploy, "promote_images") as up:
            with self.assertRaisesRegex(deploy.DeploymentBlocked, "previous image digest mismatch"):
                deploy.rollback(execute=True)
            migration.assert_not_called()
            write_state.assert_not_called()
            env.assert_not_called()
            up.assert_not_called()

if __name__ == "__main__":
    unittest.main()
