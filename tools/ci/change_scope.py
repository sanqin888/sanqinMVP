"""Select CI lanes from complete Git ranges; uncertainty selects every lane."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys


LEAVES = (
    "ops_mcp", "ops_backup", "ops_release", "ops_runtime", "api_static",
    "api_tests", "web", "browser_e2e", "printer", "windows",
    "image_api", "image_web",
)
FLAGS = LEAVES + ("ops_checks", "api_checks", "api_validation")
WORKSPACE = {"api_static", "api_tests", "web", "browser_e2e",
             "image_api", "image_web"}


def complete(selected):
    flags = {name: name in selected for name in LEAVES}
    flags["ops_checks"] = any(flags[name] for name in LEAVES[:4])
    flags["api_checks"] = flags["ops_checks"] or flags["api_static"]
    # Preserve the old API aggregate's dependency on both static matrix lanes.
    flags["api_validation"] = (flags["api_checks"] or flags["api_tests"]
                               or flags["web"])
    return flags


def all_lanes():
    return complete(set(LEAVES))


def classify_paths(paths):
    if not paths:
        return all_lanes()
    selected = set()
    for path in paths:
        if (not isinstance(path, str) or not path
                or any(part in ("", ".", "..") for part in path.split("/"))
                or any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in path)):
            return all_lanes()
        if path.endswith(".md") and ("/" not in path or path.startswith("docs/")):
            continue
        if path in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"):
            selected |= WORKSPACE
        elif path in ("apps/api/package.json", "apps/web/package.json",
                      "libs/foundation/package.json", "libs/order/package.json",
                      "libs/shared/package.json"):
            # Full frozen workspace installs and both Dockerfiles read all
            # workspace manifests, even when only one app's manifest changed.
            selected |= WORKSPACE
        elif path.startswith("apps/api/"):
            selected |= {"api_static", "api_tests", "browser_e2e", "image_api"}
        elif path.startswith("apps/web/"):
            # API architecture specs inspect Web source (Payments/Clover,
            # public config and Uber menu IDs); Web edits need API Jest too.
            selected |= {"web", "api_tests", "browser_e2e", "image_web"}
        elif path.startswith(("libs/foundation/", "libs/order/", "libs/shared/")):
            selected |= WORKSPACE
        elif path.startswith("ops/sanq-mcp/"):
            selected.add("ops_mcp")
        elif path.startswith("ops/backup/"):
            selected |= {"ops_backup", "ops_runtime", "ops_release"}
        elif path.startswith(("ops/runtime/", "ops/release/")):
            # deploy_release imports build_bundle, which imports release_contract.
            selected |= {"ops_runtime", "ops_release"}
        elif path in ("ops/verify-runtime-readiness.sh", "docker-compose.yml"):
            selected |= {"ops_runtime", "ops_release"}
        elif path.startswith("tools/architecture/") or path == "docs/architecture/active-compatibility-register.json":
            selected |= {"api_static", "api_tests"}
        elif path.startswith("tools/printer-server/"):
            selected.add("printer")
        elif path.startswith("tools/windows-pos-workstation/"):
            selected.add("windows")
        elif path == "Dockerfile.api":
            selected.add("image_api")
        elif path == "Dockerfile.web":
            selected.add("image_web")
        elif path == ".dockerignore":
            selected |= {"image_api", "image_web"}
        else:
            # CI/selector changes and new paths are intentionally included here.
            return all_lanes()
    return complete(selected)


def git(repo, *args):
    return subprocess.run(["git", *args], cwd=repo, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=45).stdout


def commit_sha(value):
    if (not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value)
            or value == "0" * 40):
        raise ValueError("missing comparable commit")
    return value


def decide(event_name, ref, event, repo):
    if event_name == "push" and ref == "refs/heads/main":
        return all_lanes(), "main promotion requires every lane"
    try:
        if event_name == "pull_request":
            pr = event["pull_request"]
            base = commit_sha(pr["base"]["sha"])
            head = commit_sha(pr["head"]["sha"])
            bases = git(repo, "merge-base", "--all", base, head).splitlines()
            if len(bases) != 1:
                raise ValueError("ambiguous PR merge base")
            base = commit_sha(bases[0].decode("ascii"))
        elif event_name == "push":
            base = commit_sha(event["before"])
            head = commit_sha(event["after"])
        else:
            return all_lanes(), "event has no reviewed selection contract"
        raw = git(repo, "diff", "--no-ext-diff", "--no-renames", "--name-only",
                  "-z", base, head, "--")
        if not raw or not raw.endswith(b"\0"):
            return all_lanes(), "empty/incomplete diff; run conservatively"
        paths = [x.decode("utf-8", errors="surrogateescape")
                 for x in raw[:-1].split(b"\0")]
        return classify_paths(paths), "complete changed-path dependency map"
    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError):
        return all_lanes(), "comparison unavailable; run conservatively"


def verify_selected(scope_result, outputs, needs, mappings):
    if scope_result != "success":
        raise ValueError("change selection failed; aggregate cannot pass")
    for flag, job in mappings:
        expected = outputs.get(flag)
        result = needs.get(job, {}).get("result")
        if (expected, result) not in (("true", "success"), ("false", "skipped")):
            raise ValueError(f"unexpected required/omitted result for {flag}")


def main():
    if sys.argv[1:2] == ["verify"]:
        mappings = [arg.split("=", 1) for arg in sys.argv[2:]]
        if not mappings or any(len(x) != 2 or x[0] not in FLAGS for x in mappings):
            raise ValueError("aggregate requires known lane-to-job mappings")
        verify_selected(os.environ.get("CI_SCOPE_RESULT"),
                        json.loads(os.environ["CI_EXPECTED"]),
                        json.loads(os.environ["CI_NEEDS"]), mappings)
        print("Selected prerequisites succeeded; omitted prerequisites were skipped.")
        return
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    except (KeyError, OSError, ValueError):
        event = {}
    flags, reason = decide(os.environ.get("GITHUB_EVENT_NAME", ""),
                           os.environ.get("GITHUB_REF", ""), event, Path.cwd())
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        for name in FLAGS:
            output.write(f"{name}={'true' if flags[name] else 'false'}\n")
    # Only fixed names/booleans enter Actions outputs; no event-controlled paths.
    message = "CI scope: " + reason + "\n" + "\n".join(
        f"- {name}: {'run' if flags[name] else 'skip'}" for name in FLAGS)
    print(message)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as output:
            output.write(message + "\n")


if __name__ == "__main__":
    main()
