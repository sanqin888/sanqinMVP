"""Regression boundaries for lane selection, real Git ranges and aggregates."""

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "change_scope.py"
SPEC = importlib.util.spec_from_file_location("change_scope", SOURCE)
scope = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scope)


class DependencySelection(unittest.TestCase):
    def selected(self, paths):
        return {k for k, v in scope.classify_paths(paths).items() if v}

    def test_docs_skip_all_heavy_jobs(self):
        self.assertEqual(self.selected(["README.md", "AGENTS.md", "docs/设计.md"]), set())

    def test_runtime_and_release_keep_mutual_import_safety_without_node(self):
        expected = {"ops_runtime", "ops_release", "ops_checks", "api_checks", "api_validation"}
        self.assertEqual(self.selected(["ops/runtime/operator.py"]), expected)
        self.assertEqual(self.selected(["ops/release/deploy_release.py"]), expected)
        self.assertEqual(self.selected(["ops/backup/backup-db.sh"]), expected | {"ops_backup"})

    def test_app_and_cross_app_architecture_consumers(self):
        api = self.selected(["apps/api/src/main.ts"])
        self.assertTrue({"api_static", "api_tests", "browser_e2e", "image_api"} <= api)
        self.assertTrue({"web", "image_web", "printer", "windows", "ops_runtime"}.isdisjoint(api))
        web = self.selected(["apps/web/src/page.tsx"])
        self.assertTrue({"web", "api_tests", "browser_e2e", "image_web"} <= web)
        self.assertNotIn("api_static", web)

    def test_workspace_manifests_affect_both_builds_and_not_independent_agents(self):
        for path in ("package.json", "pnpm-lock.yaml", "apps/api/package.json",
                     "apps/web/package.json", "libs/shared/package.json", ".npmrc"):
            with self.subTest(path=path):
                chosen = self.selected([path])
                self.assertTrue(scope.WORKSPACE <= chosen)
                self.assertTrue({"printer", "windows", "ops_mcp"}.isdisjoint(chosen))

    def test_device_and_packaging_jobs_are_independent(self):
        self.assertEqual(self.selected(["tools/printer-server/printer-server.js"]), {"printer"})
        self.assertEqual(self.selected(["tools/windows-pos-workstation/validate.ps1"]), {"windows"})
        self.assertEqual(self.selected(["Dockerfile.api"]), {"image_api"})
        self.assertEqual(self.selected(["Dockerfile.web"]), {"image_web"})
        self.assertEqual(self.selected([".dockerignore"]), {"image_api", "image_web"})

    def test_unknown_workflow_selector_and_unsafe_names_select_everything(self):
        for paths in ([], ["unknown/new-file"], [".github/workflows/ci.yml"],
                      ["tools/ci/change_scope.py"], ["docs/../apps/api/main.ts"],
                      ["docs/line\nbreak.md"], ["README.md", "unknown/input"],
                      ["apps/future/package.json"], ["libs/future/package.json"],
                      ["libs/future/src/index.ts"]):
            with self.subTest(paths=paths):
                self.assertEqual(scope.classify_paths(paths), scope.all_lanes())

    def test_prisma_shared_and_architecture_inputs(self):
        for path in ("apps/api/prisma/schema.prisma", "apps/api/prisma/migrations/x/migration.sql"):
            self.assertTrue(scope.classify_paths([path])["browser_e2e"])
        self.assertTrue(scope.WORKSPACE <= self.selected(["libs/order/src/index.ts"]))
        self.assertTrue({"api_static", "api_tests"} <= self.selected(["tools/architecture/context-baseline.json"]))


class AggregateResults(unittest.TestCase):
    def test_only_success_for_selected_and_skipped_for_omitted_are_accepted(self):
        scope.verify_selected("success", {"api_static": "true", "ops_checks": "false"},
                              {"static": {"result": "success"}, "ops": {"result": "skipped"}},
                              [("api_static", "static"), ("ops_checks", "ops")])
        for expected in ("true", "false", "", None):
            for result in ("success", "skipped", "failure", "cancelled", None):
                if (expected, result) in (("true", "success"), ("false", "skipped")):
                    continue
                with self.subTest(expected=expected, result=result), self.assertRaises(ValueError):
                    scope.verify_selected("success", {"api_static": expected},
                                          {"static": {"result": result}}, [("api_static", "static")])
        with self.assertRaises(ValueError):
            scope.verify_selected("failure", {"api_static": "false"},
                                  {"static": {"result": "skipped"}}, [("api_static", "static")])


class GitRanges(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.git("init", "--quiet", "--initial-branch=main")
        self.git("config", "user.name", "Scope Test")
        self.git("config", "user.email", "scope-test@example.invalid")
        self.write("README.md", "baseline\n")
        self.write("apps/web/src/page.tsx", "source\n")
        self.base = self.commit()

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              timeout=10).stdout.decode().strip()

    def write(self, path, content):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def commit(self):
        self.git("add", "--all")
        self.git("-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture")
        return self.git("rev-parse", "HEAD")

    def push(self, before, after):
        return scope.decide("push", "refs/heads/dev", {"before": before, "after": after}, self.repo)[0]

    def pr(self, base, head):
        return scope.decide("pull_request", "refs/pull/1/merge",
                            {"pull_request": {"base": {"sha": base}, "head": {"sha": head}}}, self.repo)[0]

    def test_multi_commit_push_and_nul_delimited_paths(self):
        self.write("docs/设计 with spaces.md", "notes\n")
        docs = self.commit()
        self.assertFalse(any(self.push(self.base, docs).values()))
        self.write("apps/api/src/main.ts", "app\n")
        self.commit()
        self.write("README.md", "latest docs\n")
        self.assertTrue(self.push(docs, self.commit())["api_tests"])

    def test_target_advance_and_pr_history(self):
        self.git("checkout", "--quiet", "-b", "topic")
        self.write("docs/notes.md", "PR\n")
        head = self.commit()
        self.git("checkout", "--quiet", "main")
        self.write("apps/web/src/page.tsx", "target advancement\n")
        target = self.commit()
        self.assertFalse(any(self.pr(target, head).values()))
        self.git("checkout", "--quiet", "topic")
        self.write("apps/api/src/main.ts", "PR app\n")
        self.commit()
        self.write("docs/notes.md", "last docs\n")
        self.assertTrue(self.pr(target, self.commit())["api_tests"])

    def test_rename_out_of_source_keeps_deleted_input(self):
        self.git("mv", "apps/web/src/page.tsx", "README-source.md")
        self.assertTrue(self.push(self.base, self.commit())["browser_e2e"])

    def test_main_unknown_events_history_and_empty_ranges_run_everything(self):
        self.write("README.md", "docs\n")
        head = self.commit()
        self.assertEqual(scope.decide("push", "refs/heads/main",
                                     {"before": self.base, "after": head}, self.repo)[0], scope.all_lanes())
        for before in ("0" * 40, "a" * 40, "invalid", None, self.base):
            self.assertEqual(self.push(before, self.base), scope.all_lanes())
        self.assertEqual(scope.decide("pull_request", "", {}, self.repo)[0], scope.all_lanes())
        self.assertEqual(scope.decide("workflow_dispatch", "", {}, self.repo)[0], scope.all_lanes())


if __name__ == "__main__":
    unittest.main()
