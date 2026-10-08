from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


SERVER_PATH = Path(__file__).resolve().parents[1] / "server.py"


class _FakeToolAnnotations:
    def __init__(self, **kwargs: object) -> None:
        self.options = kwargs


class _FakeFastMCP:
    def __init__(self, _name: str) -> None:
        pass

    def tool(self, **_kwargs: object):
        def decorator(func):
            return func

        return decorator

    def run(self, **_kwargs: object) -> None:
        raise AssertionError("MCP runtime must not start while behavior tests import server.py")


def _load_server_module():
    mcp_module = types.ModuleType("mcp")
    mcp_server_module = types.ModuleType("mcp.server")
    mcp_fastmcp_module = types.ModuleType("mcp.server.fastmcp")
    mcp_types_module = types.ModuleType("mcp.types")
    mcp_module.__path__ = []
    mcp_server_module.__path__ = []
    mcp_module.server = mcp_server_module
    mcp_server_module.fastmcp = mcp_fastmcp_module
    mcp_fastmcp_module.FastMCP = _FakeFastMCP
    mcp_types_module.ToolAnnotations = _FakeToolAnnotations

    replacements = {
        "mcp": mcp_module,
        "mcp.server": mcp_server_module,
        "mcp.server.fastmcp": mcp_fastmcp_module,
        "mcp.types": mcp_types_module,
    }
    previous = {name: sys.modules.get(name) for name in replacements}
    sys.modules.update(replacements)

    try:
        spec = importlib.util.spec_from_file_location("sanq_mcp_server_under_test", SERVER_PATH)
        if spec is None or spec.loader is None:
            raise RuntimeError("unable to load SanQ MCP server module")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for name, old_module in previous.items():
            if old_module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = old_module


server = _load_server_module()


class _RootFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        base = Path(self.temp_dir.name)
        self.prod_root = base / "production"
        self.workspace_root = base / "workspace"
        self.prod_root.mkdir()
        self.workspace_root.mkdir()
        (self.workspace_root / ".git").mkdir()

        self.old_prod_root = server.PROD_REPO_ROOT
        self.old_workspace_root = server.WORKSPACE_ROOT
        server.PROD_REPO_ROOT = self.prod_root
        server.WORKSPACE_ROOT = self.workspace_root

    def tearDown(self) -> None:
        server.PROD_REPO_ROOT = self.old_prod_root
        server.WORKSPACE_ROOT = self.old_workspace_root
        self.temp_dir.cleanup()


class GithubSourceTests(unittest.TestCase):
    def test_main_and_sha_refs_and_sensitive_paths(self) -> None:
        self.assertEqual(server._github_source_ref(), "main")
        self.assertEqual(server._github_source_ref("a" * 40), "a" * 40)
        for bad in ("dev", "a" * 39, "../main", "main~1"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                server._github_source_ref(bad)
        for bad in (".env", ".git/config", "../ops/file.py",
                    "nested/secrets.json", "/tmp/file", "x\\y"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                server._github_source_path(bad)

    def test_read_file_is_github_only_and_supports_deployed_commit(self) -> None:
        import base64
        record = {"type": "file", "encoding": "base64",
                  "content": base64.b64encode(b"alpha\nbeta\n").decode("ascii")}
        with mock.patch.object(server, "_github_request", return_value=record) as request, \
             mock.patch.object(server, "_run_prod") as local:
            self.assertEqual(server.read_file("apps/web/src/page.tsx", 2, 2, ref="b" * 40),
                             "2: beta")
            self.assertIn("ref=" + "b" * 40, request.call_args.args[1])
            local.assert_not_called()

    def test_github_status_and_commit_compare(self) -> None:
        with mock.patch.object(server, "_github_request", return_value={
            "commit": {"sha": "a" * 40}
        }), mock.patch.object(server, "_run_prod", return_value="api image sha"):
            self.assertIn("a" * 40, server.git_status())
            self.assertIn("api image sha", server.git_status())
        with self.assertRaisesRegex(ValueError, "base commit SHA required"):
            server.git_diff()
        with self.assertRaisesRegex(ValueError, "no local staged"):
            server.git_diff(staged=True, base="a" * 40)
        with mock.patch.object(server, "_github_request", return_value={
            "total_commits": 1,
            "files": [{"filename": "apps/api/src/main.ts", "status": "modified",
                       "patch": "@@ example"}]
        }):
            self.assertIn("main.ts", server.git_diff(base="a" * 40, head="b" * 40))

    def test_search_is_scoped_and_not_claimed_complete(self) -> None:
        with mock.patch.object(server, "_github_request", return_value={
            "items": [{"path": "apps/api/src/main.ts", "repository": {
                "full_name": server.GITHUB_REPOSITORY}}],
            "total_count": 1, "incomplete_results": False
        }) as request:
            result = server.search_code("Controller")
            self.assertIn('"complete": false', result)
            self.assertIn("main.ts", result)
            self.assertIn("/search/code?", request.call_args.args[1])
        with self.assertRaises(ValueError):
            server.search_code("Controller", regex=True)


class WorkspaceIsolationTests(_RootFixture):
    def test_separate_roots_are_accepted(self) -> None:
        server._assert_workspace_is_separate()

    def test_nested_workspace_is_rejected(self) -> None:
        nested_workspace = self.prod_root / "workspace"
        nested_workspace.mkdir()
        server.WORKSPACE_ROOT = nested_workspace

        with self.assertRaisesRegex(ValueError, "must be separate"):
            server._assert_workspace_is_separate()

    def test_path_traversal_and_absolute_paths_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "escapes"):
            server._resolve_under(
                self.workspace_root,
                "../outside.txt",
                require_exists=False,
            )
        with self.assertRaisesRegex(ValueError, "relative"):
            server._resolve_under(
                self.workspace_root,
                str(self.workspace_root / "inside.txt"),
                require_exists=False,
            )


class SensitivePathTests(_RootFixture):
    def test_sensitive_repository_paths_are_rejected(self) -> None:
        blocked = [
            ".env",
            ".env.production",
            ".git/config",
            ".ssh/id_ed25519",
            "credentials.json",
            "nested/secrets.json",
            "service-account-prod.json",
            "certs/client.pem",
            "certs/client.key",
            "certs/client.p12",
            "certs/client.pfx",
        ]

        for relative in blocked:
            with self.subTest(relative=relative):
                target = self.workspace_root / relative
                with self.assertRaises(ValueError):
                    server._assert_safe_repo_path(target, self.workspace_root)

    def test_ordinary_source_path_is_accepted(self) -> None:
        server._assert_safe_repo_path(
            self.workspace_root / "apps/api/src/main.ts",
            self.workspace_root,
        )

    def test_workspace_git_add_blocks_environment_files_before_git_exec(self) -> None:
        with self.assertRaisesRegex(ValueError, "environment files are blocked"):
            server.workspace_git_add([".env"])


class ProcessAllowlistTests(_RootFixture):
    def test_production_git_subprocesses_are_retired(self) -> None:
        for command in (["git", "status"], ["git", "checkout", "dev"]):
            with self.assertRaisesRegex(ValueError, "GitHub API"):
                server._assert_allowed_process(
                    command, cwd=self.prod_root, scope="production"
                )

    def test_docker_is_limited_to_compose_ps_and_logs(self) -> None:
        server._assert_allowed_process(
            ["docker", "compose", "ps"],
            cwd=self.prod_root,
            scope="production",
        )
        server._assert_allowed_process(
            ["docker", "compose", "logs"],
            cwd=self.prod_root,
            scope="production",
        )
        with self.assertRaisesRegex(ValueError, "ps/logs"):
            server._assert_allowed_process(
                ["docker", "compose", "exec", "api", "sh"],
                cwd=self.prod_root,
                scope="production",
            )

    def test_system_commands_are_exact_allowlist_entries(self) -> None:
        server._assert_allowed_process(
            ["date", "--iso-8601=seconds"],
            cwd=Path("/"),
            scope="system",
        )
        with self.assertRaisesRegex(ValueError, "not allowed"):
            server._assert_allowed_process(
                ["cat", "/etc/passwd"],
                cwd=Path("/"),
                scope="system",
            )


class GitAndPullRequestWriteGuardTests(_RootFixture):
    def test_direct_push_to_dev_is_rejected_before_git_exec(self) -> None:
        with self.assertRaisesRegex(ValueError, "direct pushes to main/dev"):
            server.workspace_git_push("dev")

    def test_feature_branch_creation_reserves_main_and_dev(self) -> None:
        for branch in ("main", "dev"):
            with self.subTest(branch=branch):
                with self.assertRaisesRegex(ValueError, "must not be main/dev"):
                    server.workspace_create_feature_branch(branch)

    def test_mcp_created_pull_request_must_target_dev(self) -> None:
        with self.assertRaisesRegex(ValueError, "must target dev"):
            server.github_create_pr(
                title="test",
                head="feature/test",
                base="main",
            )

    def test_merge_fails_closed_when_actions_are_not_green(self) -> None:
        pull_request = {
            "state": "open",
            "draft": False,
            "mergeable": True,
            "head": {
                "ref": "feature/test",
                "sha": "abc123",
                "repo": {"full_name": server.GITHUB_REPOSITORY},
            },
            "base": {"ref": "dev"},
        }
        checks = {
            "actions_state": "pending",
            "workflow_runs": [
                {
                    "event": "pull_request",
                    "status": "in_progress",
                    "conclusion": None,
                }
            ],
        }

        with (
            mock.patch.object(server, "_github_request", return_value=pull_request),
            mock.patch.object(server, "_github_ci_for_sha", return_value=checks),
        ):
            with self.assertRaisesRegex(ValueError, "not all successful"):
                server.github_merge_pr(123)


class ReadOnlySqlPolicyTests(unittest.TestCase):
    def test_select_and_with_queries_are_accepted(self) -> None:
        self.assertEqual(server._validate_readonly_sql("SELECT 1;"), "SELECT 1")
        self.assertEqual(
            server._validate_readonly_sql(
                "WITH sample AS (SELECT 1 AS value) SELECT value FROM sample"
            ),
            "WITH sample AS (SELECT 1 AS value) SELECT value FROM sample",
        )

    def test_multiple_statements_and_writes_are_rejected(self) -> None:
        blocked = [
            "SELECT 1; SELECT 2",
            "INSERT INTO users(id) VALUES (1)",
            "WITH changed AS (DELETE FROM users RETURNING id) SELECT * FROM changed",
            "SELECT * FROM users FOR UPDATE",
            "SELECT pg_read_file('/etc/passwd')",
            "SELECT set_config('x', 'y', false)",
        ]

        for sql in blocked:
            with self.subTest(sql=sql):
                with self.assertRaises(ValueError):
                    server._validate_readonly_sql(sql)

    def test_db_environment_forces_read_only_timeouts(self) -> None:
        with mock.patch.dict(
            server.os.environ,
            {
                "SANQ_DB_READONLY_DSN": (
                    "postgresql://readonly:secret@db.example/sanq?sslmode=require"
                )
            },
            clear=True,
        ):
            env = server._db_connection_env()

        self.assertEqual(env["PGHOST"], "db.example")
        self.assertEqual(env["PGDATABASE"], "sanq")
        self.assertEqual(env["PGUSER"], "readonly")
        self.assertEqual(env["PGPORT"], "5432")
        self.assertEqual(env["PGSSLMODE"], "require")
        self.assertIn("default_transaction_read_only=on", env["PGOPTIONS"])
        self.assertIn("statement_timeout=5000", env["PGOPTIONS"])
        self.assertIn("lock_timeout=1000", env["PGOPTIONS"])


class RedactionAndBoundedOutputTests(unittest.TestCase):
    def test_secret_bearer_and_url_tokens_are_redacted(self) -> None:
        raw = (
            "COOKIE_SIGNING_SECRET=super-secret\n"
            "Authorization: Bearer abc.def-123\n"
            "https://example.invalid/callback?access_token=url-secret&next=1"
        )
        redacted = server._redact(raw)

        self.assertNotIn("super-secret", redacted)
        self.assertNotIn("abc.def-123", redacted)
        self.assertNotIn("url-secret", redacted)
        self.assertIn("COOKIE_SIGNING_SECRET=[REDACTED]", redacted)
        self.assertIn("Bearer [REDACTED]", redacted)
        self.assertIn("access_token=[REDACTED]", redacted)

    def test_process_output_is_bounded_after_redaction(self) -> None:
        fake_process = subprocess.CompletedProcess(
            args=["date", "--iso-8601=seconds"],
            returncode=0,
            stdout="prefix-" + ("Z" * 80),
        )

        with mock.patch.object(server.subprocess, "run", return_value=fake_process):
            output = server._run(
                ["date", "--iso-8601=seconds"],
                cwd=Path("/"),
                scope="system",
                max_chars=20,
            )

        self.assertTrue(output.startswith("[output truncated to most recent characters]"))
        self.assertTrue(output.endswith("Z" * 20))
        self.assertNotIn("prefix-", output)

    def test_log_selection_caps_returned_context(self) -> None:
        selected, matches = server._select_log_lines(
            "\n".join(f"line-{index}" for index in range(20)),
            query="line",
            regex=False,
            ignore_case=False,
            context=0,
            max_results=5,
        )

        self.assertEqual(matches, 20)
        self.assertEqual(selected, [f"line-{index}" for index in range(15, 20)])


if __name__ == "__main__":
    unittest.main()
