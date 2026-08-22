from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlsplit
from urllib.request import Request, urlopen

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

mcp = FastMCP("SanQ VM")

PROD_REPO_ROOT = Path(
    os.environ.get("SANQ_REPO_ROOT", "/home/ubuntu/sanq-app")
).resolve()
WORKSPACE_ROOT = Path(
    os.environ.get("SANQ_WORKSPACE_ROOT", "/home/ubuntu/sanq-mcp-workspace")
).resolve()
GITHUB_REPOSITORY = os.environ.get(
    "SANQ_GITHUB_REPOSITORY", "sanqin888/sanqinMVP"
).strip()
GITHUB_API_BASE = "https://api.github.com"

DockerService = Literal["api", "web", "db", "ubereats-worker"]
ProcessScope = Literal["system", "production", "workspace"]

MAX_COMMAND_OUTPUT_CHARS = 120_000
MAX_LOG_RESULT_LINES = 1_000
MAX_CODE_RESULT_LINES = 300
MAX_FILE_WRITE_CHARS = 1_000_000
MAX_DB_RESULT_ROWS = 500

READ_ONLY_ANNOTATIONS = ToolAnnotations(
    read_only_hint=True,
    open_world_hint=False,
)
LOCAL_WRITE_ANNOTATIONS = ToolAnnotations(
    read_only_hint=False,
    open_world_hint=False,
)
GITHUB_READ_ANNOTATIONS = ToolAnnotations(
    read_only_hint=True,
    open_world_hint=True,
)
GITHUB_WRITE_ANNOTATIONS = ToolAnnotations(
    read_only_hint=False,
    open_world_hint=True,
)

_SECRET_ASSIGNMENT_RE = re.compile(
    r"""(?ix)
    (
      ["']?
      [A-Z0-9_.-]*
      (?:
        CLIENT_SECRET
        |JWT_SECRET
        |COOKIE_SIGNING_SECRET
        |OAUTH_STATE_SECRET
        |SIGNING_KEY
        |ACCESS_TOKEN
        |REFRESH_TOKEN
        |AUTH_TOKEN
        |PASSWORD
        |API_KEY
        |PRIVATE_KEY
        |ACCESS_KEY_ID
        |CREDENTIAL_ENCRYPTION_KEYS
      )
      [A-Z0-9_.-]*
      ["']?
      \s*[:=]\s*
    )
    (["']?)
    ([^,\s}\]]+)
    \2
    """
)
_BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")
_URL_TOKEN_RE = re.compile(
    r"(?i)([?&](?:access_token|refresh_token|token|api_key)=)[^&#\s]+"
)

_FIXED_PROCESS_COMMANDS = {
    ("date", "--iso-8601=seconds"),
    ("uptime",),
    ("free", "-h"),
    ("df", "-h", "/"),
    ("systemctl", "is-active", "docker"),
    ("systemctl", "is-active", "sanq-mcp-tunnel"),
}
_PRODUCTION_GIT_SUBCOMMANDS = {"status", "log", "diff", "show"}
_WORKSPACE_GIT_SUBCOMMANDS = {
    "status",
    "log",
    "diff",
    "show",
    "fetch",
    "switch",
    "checkout",
    "add",
    "commit",
    "push",
}
_ALLOWED_DOCKER_COMPOSE_SUBCOMMANDS = {"ps", "logs"}

_SENSITIVE_REPO_GLOBS = (
    ".git/**",
    "**/.git/**",
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    ".ssh/**",
    "**/.ssh/**",
    "id_rsa",
    "id_ed25519",
    "**/id_rsa",
    "**/id_ed25519",
    "credentials",
    "credentials.json",
    "credentials.yaml",
    "credentials.yml",
    "**/credentials",
    "**/credentials.json",
    "**/credentials.yaml",
    "**/credentials.yml",
    "secrets.json",
    "**/secrets.json",
    "service-account*.json",
    "**/service-account*.json",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "**/*.pem",
    "**/*.key",
    "**/*.p12",
    "**/*.pfx",
)
_SEARCH_EXCLUDED_GLOBS = (
    "node_modules/**",
    "**/node_modules/**",
    "uploads/**",
    "**/uploads/**",
    "backups/**",
    "**/backups/**",
    *_SENSITIVE_REPO_GLOBS,
)

_BLOCKED_DB_KEYWORDS_RE = re.compile(
    r"(?i)\b(?:INSERT|UPDATE|DELETE|MERGE|UPSERT|ALTER|DROP|CREATE|TRUNCATE|"
    r"GRANT|REVOKE|COMMENT|VACUUM|ANALYZE|REINDEX|CLUSTER|REFRESH|COPY|CALL|DO|"
    r"SET|RESET|LISTEN|UNLISTEN|NOTIFY|DISCARD|LOCK|PREPARE|EXECUTE|DEALLOCATE|"
    r"SECURITY|OWNER|INTO)\b"
)
_BLOCKED_DB_FUNCTION_RE = re.compile(
    r"(?i)\b(?:pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|"
    r"pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|"
    r"pg_rotate_logfile|pg_promote|pg_switch_wal|pg_create_restore_point|"
    r"lo_import|lo_export|dblink|set_config)\s*\("
)
_BLOCKED_DB_LOCK_RE = re.compile(
    r"(?i)\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b"
)


def _redact(text: str) -> str:
    if not text:
        return text
    text = _SECRET_ASSIGNMENT_RE.sub(r"\1[REDACTED]", text)
    text = _BEARER_RE.sub("Bearer [REDACTED]", text)
    text = _URL_TOKEN_RE.sub(r"\1[REDACTED]", text)
    return text


def _is_within(path: Path, root: Path) -> bool:
    path = path.resolve()
    root = root.resolve()
    return path == root or root in path.parents


def _assert_workspace_is_separate() -> None:
    if _is_within(WORKSPACE_ROOT, PROD_REPO_ROOT) or _is_within(
        PROD_REPO_ROOT, WORKSPACE_ROOT
    ):
        raise ValueError(
            "SANQ_WORKSPACE_ROOT must be separate from the production repository"
        )


def _assert_workspace_ready() -> None:
    _assert_workspace_is_separate()
    if not WORKSPACE_ROOT.exists() or not WORKSPACE_ROOT.is_dir():
        raise ValueError(
            "workspace is not provisioned; set SANQ_WORKSPACE_ROOT to a separate Git clone"
        )
    if not (WORKSPACE_ROOT / ".git").exists():
        raise ValueError("workspace root is not a Git working tree")


def _validate_plain_text(value: str, *, name: str, max_len: int = 500) -> str:
    value = value or ""
    if "\x00" in value:
        raise ValueError(f"{name} contains a NUL byte")
    if len(value) > max_len:
        raise ValueError(f"{name} is too long (max {max_len} characters)")
    return value


def _resolve_under(
    root: Path,
    path: str,
    *,
    require_exists: bool = True,
) -> Path:
    path = _validate_plain_text(path.strip(), name="path", max_len=500)
    if not path:
        resolved = root
    else:
        candidate = Path(path)
        if candidate.is_absolute():
            raise ValueError("path must be relative to the configured repository root")
        resolved = (root / candidate).resolve()

    if not _is_within(resolved, root):
        raise ValueError("path escapes the configured repository root")

    if require_exists and not resolved.exists():
        raise ValueError(f"path does not exist: {path}")

    return resolved


def _relative_to(root: Path, path: Path) -> str:
    if path == root:
        return "."
    return str(path.relative_to(root))


def _assert_safe_repo_path(path: Path, root: Path) -> None:
    rel_parts = [part.lower() for part in path.relative_to(root).parts]
    name = path.name.lower()

    if ".ssh" in rel_parts or ".git" in rel_parts:
        raise ValueError("reading or writing this path is blocked")

    if name == ".env" or name.startswith(".env."):
        raise ValueError("environment files are blocked")

    if name in {
        "id_rsa",
        "id_ed25519",
        "secrets.json",
        "credentials",
        "credentials.json",
        "credentials.yaml",
        "credentials.yml",
    }:
        raise ValueError("private credential files are blocked")

    if name.startswith("service-account") and path.suffix.lower() == ".json":
        raise ValueError("private credential files are blocked")

    if path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}:
        raise ValueError("private key/certificate files are blocked")


def _git_sensitive_pathspecs() -> list[str]:
    return [f":(exclude,glob){pattern}" for pattern in _SENSITIVE_REPO_GLOBS]


def _git_pathspec_args(root: Path, path: str = "") -> list[str]:
    include = "."
    if path.strip():
        resolved = _resolve_under(root, path)
        _assert_safe_repo_path(resolved, root)
        include = _relative_to(root, resolved)
    return ["--", include, *_git_sensitive_pathspecs()]


def _rg_exclude_args() -> list[str]:
    args: list[str] = []
    for pattern in _SEARCH_EXCLUDED_GLOBS:
        args.extend(["--glob", f"!{pattern}"])
    return args


def _validate_revision(revision: str, *, name: str = "commit") -> str:
    revision = _validate_plain_text(revision.strip(), name=name, max_len=120)
    if not revision:
        raise ValueError(f"{name} is required")
    if not re.fullmatch(r"[A-Za-z0-9._/@^~+-]+", revision):
        raise ValueError(f"{name} contains unsupported characters")
    if revision.startswith("-"):
        raise ValueError(f"{name} may not begin with '-'")
    return revision


def _validate_branch(branch: str, *, name: str = "branch") -> str:
    branch = _validate_plain_text(branch.strip(), name=name, max_len=200)
    if not branch:
        raise ValueError(f"{name} is required")
    if branch.startswith("-") or branch.endswith("/") or ".." in branch:
        raise ValueError(f"{name} is not a safe Git branch name")
    if not re.fullmatch(r"[A-Za-z0-9._/-]+", branch):
        raise ValueError(f"{name} contains unsupported characters")
    return branch


def _assert_allowed_process(args: list[str], *, cwd: Path, scope: ProcessScope) -> None:
    if not args:
        raise ValueError("empty command is not allowed")

    command = tuple(args)
    if scope == "system" and command in _FIXED_PROCESS_COMMANDS:
        return

    executable = args[0]
    if executable == "git":
        if len(args) < 2:
            raise ValueError("git subcommand is required")
        subcommand = args[1]
        if scope == "production":
            if not _is_within(cwd, PROD_REPO_ROOT):
                raise ValueError("production Git commands must run inside production repo")
            if subcommand not in _PRODUCTION_GIT_SUBCOMMANDS:
                raise ValueError("production Git is read-only: status/log/diff/show only")
            return
        if scope == "workspace":
            _assert_workspace_ready()
            if not _is_within(cwd, WORKSPACE_ROOT):
                raise ValueError("workspace Git commands must run inside workspace")
            if subcommand not in _WORKSPACE_GIT_SUBCOMMANDS:
                raise ValueError(
                    "workspace Git allows status/log/diff/show/fetch/switch/checkout/"
                    "add/commit/push only"
                )
            return
        raise ValueError("git is not allowed in this process scope")

    if executable == "docker":
        if scope != "production":
            raise ValueError("docker is only available from the production read-only scope")
        if (
            len(args) < 3
            or args[1] != "compose"
            or args[2] not in _ALLOWED_DOCKER_COMPOSE_SUBCOMMANDS
        ):
            raise ValueError("only docker compose ps/logs are allowed")
        return

    if executable == "rg":
        if scope not in {"production", "workspace"}:
            raise ValueError("rg is only allowed inside a repository scope")
        root = PROD_REPO_ROOT if scope == "production" else WORKSPACE_ROOT
        if not _is_within(cwd, root):
            raise ValueError("rg must run inside the configured repository scope")
        return

    raise ValueError(f"process command is not allowed: {executable}")


def _run(
    args: list[str],
    *,
    cwd: Path,
    scope: ProcessScope,
    timeout: int = 30,
    max_chars: int = MAX_COMMAND_OUTPUT_CHARS,
) -> str:
    _assert_allowed_process(args, cwd=cwd, scope=scope)

    env = os.environ.copy()
    env["GIT_OPTIONAL_LOCKS"] = "0"

    proc = subprocess.run(
        args,
        cwd=str(cwd),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
        shell=False,
    )
    output = _redact(proc.stdout or "").rstrip()
    if len(output) > max_chars:
        output = output[-max_chars:]
        output = "[output truncated to most recent characters]\n" + output
    if proc.returncode != 0:
        prefix = f"[command exited {proc.returncode}]"
        return f"{prefix}\n{output}".rstrip()
    return output or "(no output)"


def _run_system(args: list[str], *, cwd: Path = Path("/"), timeout: int = 10) -> str:
    return _run(args, cwd=cwd, scope="system", timeout=timeout)


def _run_prod(
    args: list[str],
    *,
    timeout: int = 30,
    max_chars: int = MAX_COMMAND_OUTPUT_CHARS,
) -> str:
    return _run(
        args,
        cwd=PROD_REPO_ROOT,
        scope="production",
        timeout=timeout,
        max_chars=max_chars,
    )


def _run_workspace(
    args: list[str],
    *,
    timeout: int = 30,
    max_chars: int = MAX_COMMAND_OUTPUT_CHARS,
) -> str:
    _assert_workspace_ready()
    return _run(
        args,
        cwd=WORKSPACE_ROOT,
        scope="workspace",
        timeout=timeout,
        max_chars=max_chars,
    )


def _select_log_lines(
    text: str,
    *,
    query: str,
    regex: bool,
    ignore_case: bool,
    context: int,
    max_results: int,
) -> tuple[list[str], int]:
    lines = text.splitlines()

    if not query:
        return lines[-max_results:], len(lines)

    flags = re.IGNORECASE if ignore_case else 0
    if regex:
        try:
            matcher = re.compile(query, flags)
        except re.error as exc:
            raise ValueError(f"invalid regex: {exc}") from exc

        def matches(line: str) -> bool:
            return matcher.search(line) is not None
    else:
        needle = query.casefold() if ignore_case else query

        def matches(line: str) -> bool:
            haystack = line.casefold() if ignore_case else line
            return needle in haystack

    match_indexes = [i for i, line in enumerate(lines) if matches(line)]
    if not match_indexes:
        return [], 0

    wanted: set[int] = set()
    for index in match_indexes:
        start = max(0, index - context)
        end = min(len(lines), index + context + 1)
        wanted.update(range(start, end))

    selected = [lines[i] for i in sorted(wanted)]
    return selected[-max_results:], len(match_indexes)


def _read_repo_file(root: Path, path: str, start_line: int, end_line: int) -> str:
    if start_line < 1:
        raise ValueError("start_line must be >= 1")
    if end_line < start_line:
        raise ValueError("end_line must be >= start_line")
    if end_line - start_line + 1 > 500:
        raise ValueError("at most 500 lines may be read per request")

    resolved = _resolve_under(root, path)
    _assert_safe_repo_path(resolved, root)
    if not resolved.is_file():
        raise ValueError("path is not a file")

    with resolved.open("r", encoding="utf-8", errors="replace") as handle:
        lines = handle.readlines()

    selected = lines[start_line - 1 : end_line]
    if not selected:
        return "(no lines in requested range)"

    rendered = "".join(
        f"{line_no}: {line}"
        for line_no, line in enumerate(selected, start=start_line)
    )
    return _redact(rendered.rstrip())


def _search_repo_code(
    root: Path,
    query: str,
    *,
    max_results: int,
    path: str,
    file_glob: str,
    regex: bool,
    ignore_case: bool,
    context: int,
    scope: Literal["production", "workspace"],
) -> str:
    query = _validate_plain_text(query, name="query", max_len=500)
    if not query:
        raise ValueError("query is required")
    if not 1 <= max_results <= MAX_CODE_RESULT_LINES:
        raise ValueError(f"max_results must be between 1 and {MAX_CODE_RESULT_LINES}")
    if not 0 <= context <= 10:
        raise ValueError("context must be between 0 and 10")

    file_glob = _validate_plain_text(file_glob.strip(), name="file_glob", max_len=200)

    target = root
    if path.strip():
        target = _resolve_under(root, path)
        _assert_safe_repo_path(target, root)

    args = [
        "rg",
        "--hidden",
        "--line-number",
        "--no-heading",
        "--color",
        "never",
    ]
    if not regex:
        args.append("--fixed-strings")
    if ignore_case:
        args.append("--ignore-case")
    if context:
        args.extend(["--context", str(context)])
    if file_glob:
        args.extend(["--glob", file_glob])
    args.extend(_rg_exclude_args())

    args.extend(["--", query, _relative_to(root, target)])
    output = _run(
        args,
        cwd=root,
        scope=scope,
        max_chars=500_000,
    )

    if output.startswith("[command exited 1]"):
        return "(no matches)"
    if output.startswith("[command exited"):
        return output

    lines = output.splitlines()
    if len(lines) > max_results:
        lines = lines[:max_results]
        lines.append(f"[truncated after {max_results} output lines]")
    return _redact("\n".join(lines))


def _git_log(
    root: Path,
    scope: Literal["production", "workspace"],
    *,
    limit: int,
    since: str,
    until: str,
    author: str,
    grep: str,
    path: str,
) -> str:
    if not 1 <= limit <= 50:
        raise ValueError("limit must be between 1 and 50")

    since = _validate_plain_text(since.strip(), name="since", max_len=100)
    until = _validate_plain_text(until.strip(), name="until", max_len=100)
    author = _validate_plain_text(author.strip(), name="author", max_len=200)
    grep = _validate_plain_text(grep.strip(), name="grep", max_len=300)

    args = [
        "git",
        "log",
        f"-n{limit}",
        "--date=iso",
        "--pretty=format:%h %ad %an %s",
    ]
    if since:
        args.append(f"--since={since}")
    if until:
        args.append(f"--until={until}")
    if author:
        args.append(f"--author={author}")
    if grep:
        args.append(f"--grep={grep}")

    args.extend(_git_pathspec_args(root, path))
    return _run(args, cwd=root, scope=scope)


def _git_diff(
    root: Path,
    scope: Literal["production", "workspace"],
    *,
    path: str,
    staged: bool,
    stat: bool,
) -> str:
    args = ["git", "diff", "--no-ext-diff"]
    if staged:
        args.append("--staged")
    if stat:
        args.append("--stat")
    args.extend(_git_pathspec_args(root, path))
    return _run(args, cwd=root, scope=scope)


def _git_show(
    root: Path,
    scope: Literal["production", "workspace"],
    *,
    commit: str,
    path: str,
    stat: bool,
) -> str:
    revision = _validate_revision(commit)
    args = ["git", "show", "--no-ext-diff", "--date=iso"]
    if stat:
        args.append("--stat")
    args.append(revision)
    args.extend(_git_pathspec_args(root, path))
    return _run(args, cwd=root, scope=scope)


def _workspace_current_branch() -> str:
    status = _run_workspace(["git", "status", "-sb", *_git_pathspec_args(WORKSPACE_ROOT)])
    first_line = status.splitlines()[0] if status else ""
    if not first_line.startswith("## "):
        raise ValueError("unable to determine current workspace branch")
    branch_info = first_line[3:]
    if branch_info.startswith("HEAD "):
        raise ValueError("workspace is in detached HEAD state")
    branch = branch_info.split("...", 1)[0].split(" ", 1)[0].strip()
    return _validate_branch(branch, name="current_branch")


def _assert_workspace_clean() -> None:
    status = _run_workspace(["git", "status", "--porcelain"])
    if status != "(no output)":
        raise ValueError(
            "workspace has uncommitted changes; finish or discard them before "
            "creating a feature branch"
        )


def _fetch_workspace_dev() -> str:
    result = _run_workspace(
        [
            "git",
            "fetch",
            "--no-tags",
            "origin",
            "+refs/heads/dev:refs/remotes/origin/dev",
        ],
        timeout=60,
        max_chars=250_000,
    )
    if result.startswith("[command exited"):
        raise ValueError(f"failed to fetch latest origin/dev:\n{result}")
    return result


def _github_repo_parts() -> tuple[str, str]:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", GITHUB_REPOSITORY):
        raise ValueError("SANQ_GITHUB_REPOSITORY must use owner/repo format")
    owner, repo = GITHUB_REPOSITORY.split("/", 1)
    return owner, repo


def _github_token() -> str:
    token = os.environ.get("SANQ_GITHUB_TOKEN", "").strip()
    if not token:
        raise ValueError(
            "SANQ_GITHUB_TOKEN is not configured for the MCP service"
        )
    return token


def _github_request(
    method: Literal["GET", "POST", "PUT"],
    path: str,
    *,
    payload: dict[str, object] | None = None,
) -> object:
    owner, repo = _github_repo_parts()
    prefix = f"/repos/{owner}/{repo}"
    if not path.startswith(prefix):
        raise ValueError("GitHub request path is outside the configured repository")

    url = f"{GITHUB_API_BASE}{path}"
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {_github_token()}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "sanq-mcp",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=15) as response:
            raw = response.read(2_000_000).decode("utf-8", errors="replace")
    except HTTPError as exc:
        body = exc.read(20_000).decode("utf-8", errors="replace")
        raise ValueError(
            f"GitHub API returned HTTP {exc.code}: {_redact(body)}"
        ) from exc
    except URLError as exc:
        raise ValueError(f"GitHub API request failed: {exc.reason}") from exc

    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("GitHub API returned invalid JSON") from exc


def _github_download_text(path: str, *, max_chars: int) -> str:
    owner, repo = _github_repo_parts()
    prefix = f"/repos/{owner}/{repo}"
    if not path.startswith(prefix):
        raise ValueError("GitHub request path is outside the configured repository")
    if not 1_000 <= max_chars <= 250_000:
        raise ValueError("max_chars must be between 1000 and 250000")

    request = Request(
        f"{GITHUB_API_BASE}{path}",
        method="GET",
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "sanq-mcp",
        },
    )
    # Job logs are downloaded through a signed redirect. Keep the repository PAT
    # on the initial api.github.com request only; urllib does not forward
    # unredirected headers to the signed storage URL.
    request.add_unredirected_header("Authorization", f"Bearer {_github_token()}")

    tail = bytearray()
    total_bytes = 0
    try:
        with urlopen(request, timeout=20) as response:
            while True:
                chunk = response.read(65_536)
                if not chunk:
                    break
                total_bytes += len(chunk)
                tail.extend(chunk)
                if len(tail) > max_chars:
                    del tail[: len(tail) - max_chars]
    except HTTPError as exc:
        body = exc.read(20_000).decode("utf-8", errors="replace")
        raise ValueError(
            f"GitHub API returned HTTP {exc.code}: {_redact(body)}"
        ) from exc
    except URLError as exc:
        raise ValueError(f"GitHub API request failed: {exc.reason}") from exc

    text = _redact(bytes(tail).decode("utf-8", errors="replace")).rstrip()
    truncated = total_bytes > max_chars
    header = (
        f"[downloaded_bytes={total_bytes} returned_chars={len(text)} "
        f"truncated={str(truncated).lower()}]"
    )
    return f"{header}\n{text or '(no output)'}"


def _github_pr_summary(data: object) -> dict[str, object]:
    if not isinstance(data, dict):
        raise ValueError("unexpected GitHub pull request response")
    user = data.get("user") if isinstance(data.get("user"), dict) else {}
    head = data.get("head") if isinstance(data.get("head"), dict) else {}
    base = data.get("base") if isinstance(data.get("base"), dict) else {}
    return {
        "number": data.get("number"),
        "state": data.get("state"),
        "draft": data.get("draft"),
        "title": data.get("title"),
        "html_url": data.get("html_url"),
        "author": user.get("login"),
        "head": head.get("ref"),
        "head_sha": head.get("sha"),
        "base": base.get("ref"),
        "mergeable": data.get("mergeable"),
        "mergeable_state": data.get("mergeable_state"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def _github_ci_for_sha(commit: str) -> dict[str, object]:
    owner, repo = _github_repo_parts()
    revision = _validate_revision(commit, name="commit")
    safe_sha = quote(revision, safe="")

    workflows_raw = _github_request(
        "GET",
        f"/repos/{owner}/{repo}/actions/runs?head_sha={safe_sha}&per_page=20",
    )
    status_raw = _github_request(
        "GET",
        f"/repos/{owner}/{repo}/commits/{safe_sha}/status",
    )

    workflows: list[dict[str, object]] = []
    workflow_conclusions: list[str] = []
    workflow_pending = False

    if isinstance(workflows_raw, dict):
        raw_runs = workflows_raw.get("workflow_runs")
        if isinstance(raw_runs, list):
            for run in raw_runs[:20]:
                if not isinstance(run, dict):
                    continue

                run_id = run.get("id")
                jobs: list[dict[str, object]] = []
                if isinstance(run_id, int):
                    jobs_raw = _github_request(
                        "GET",
                        f"/repos/{owner}/{repo}/actions/runs/{run_id}/jobs"
                        "?filter=latest&per_page=100",
                    )
                    if isinstance(jobs_raw, dict):
                        raw_jobs = jobs_raw.get("jobs")
                        if isinstance(raw_jobs, list):
                            for job in raw_jobs[:100]:
                                if not isinstance(job, dict):
                                    continue
                                raw_steps = job.get("steps")
                                steps: list[dict[str, object]] = []
                                if isinstance(raw_steps, list):
                                    for step in raw_steps[:100]:
                                        if not isinstance(step, dict):
                                            continue
                                        steps.append(
                                            {
                                                "number": step.get("number"),
                                                "name": step.get("name"),
                                                "status": step.get("status"),
                                                "conclusion": step.get("conclusion"),
                                            }
                                        )
                                jobs.append(
                                    {
                                        "id": job.get("id"),
                                        "name": job.get("name"),
                                        "status": job.get("status"),
                                        "conclusion": job.get("conclusion"),
                                        "html_url": job.get("html_url"),
                                        "started_at": job.get("started_at"),
                                        "completed_at": job.get("completed_at"),
                                        "steps": steps,
                                    }
                                )

                run_status = run.get("status")
                run_conclusion = run.get("conclusion")
                if run_status != "completed":
                    workflow_pending = True
                if isinstance(run_conclusion, str):
                    workflow_conclusions.append(run_conclusion)

                workflows.append(
                    {
                        "id": run_id,
                        "name": run.get("name"),
                        "display_title": run.get("display_title"),
                        "event": run.get("event"),
                        "status": run_status,
                        "conclusion": run_conclusion,
                        "html_url": run.get("html_url"),
                        "run_number": run.get("run_number"),
                        "run_attempt": run.get("run_attempt"),
                        "created_at": run.get("created_at"),
                        "updated_at": run.get("updated_at"),
                        "jobs": jobs,
                    }
                )

    failure_conclusions = {
        "failure",
        "cancelled",
        "timed_out",
        "action_required",
        "startup_failure",
        "stale",
    }
    if workflow_pending:
        actions_state = "pending"
    elif any(item in failure_conclusions for item in workflow_conclusions):
        actions_state = "failure"
    elif workflows:
        actions_state = "success"
    else:
        actions_state = "none"

    statuses: list[dict[str, object]] = []
    combined_state = None
    if isinstance(status_raw, dict):
        combined_state = status_raw.get("state")
        raw_statuses = status_raw.get("statuses")
        if isinstance(raw_statuses, list):
            for status in raw_statuses[:100]:
                if not isinstance(status, dict):
                    continue
                statuses.append(
                    {
                        "context": status.get("context"),
                        "state": status.get("state"),
                        "description": status.get("description"),
                        "target_url": status.get("target_url"),
                        "updated_at": status.get("updated_at"),
                    }
                )

    return {
        "repository": GITHUB_REPOSITORY,
        "commit": revision,
        "actions_state": actions_state,
        "workflow_runs": workflows,
        "combined_status": combined_state,
        "commit_statuses": statuses,
    }


def _db_connection_env() -> dict[str, str]:
    env = os.environ.copy()

    dsn = os.environ.get("SANQ_DB_READONLY_DSN", "").strip()
    if dsn:
        parsed = urlsplit(dsn)
        if parsed.scheme not in {"postgres", "postgresql"}:
            raise ValueError("SANQ_DB_READONLY_DSN must be a PostgreSQL URL")
        if not parsed.hostname or not parsed.path or parsed.path == "/":
            raise ValueError("SANQ_DB_READONLY_DSN is missing host or database")
        if parsed.username:
            env["PGUSER"] = unquote(parsed.username)
        if parsed.password:
            env["PGPASSWORD"] = unquote(parsed.password)
        env["PGHOST"] = parsed.hostname
        env["PGPORT"] = str(parsed.port or 5432)
        env["PGDATABASE"] = unquote(parsed.path.lstrip("/"))
        query = parse_qs(parsed.query)
        if query.get("sslmode"):
            env["PGSSLMODE"] = query["sslmode"][0]
    else:
        mapping = {
            "SANQ_DB_READONLY_HOST": "PGHOST",
            "SANQ_DB_READONLY_PORT": "PGPORT",
            "SANQ_DB_READONLY_NAME": "PGDATABASE",
            "SANQ_DB_READONLY_USER": "PGUSER",
            "SANQ_DB_READONLY_PASSWORD": "PGPASSWORD",
            "SANQ_DB_READONLY_SSLMODE": "PGSSLMODE",
        }
        for source, target in mapping.items():
            value = os.environ.get(source, "").strip()
            if value:
                env[target] = value

    required = ["PGHOST", "PGDATABASE", "PGUSER"]
    missing = [name for name in required if not env.get(name)]
    if missing:
        raise ValueError(
            "read-only database credentials are not configured; missing "
            + ", ".join(missing)
        )

    existing_pgoptions = env.get("PGOPTIONS", "").strip()
    readonly_options = (
        "-c default_transaction_read_only=on "
        "-c statement_timeout=5000 "
        "-c lock_timeout=1000"
    )
    env["PGOPTIONS"] = (
        f"{existing_pgoptions} {readonly_options}".strip()
        if existing_pgoptions
        else readonly_options
    )
    return env


def _validate_readonly_sql(sql: str) -> str:
    sql = _validate_plain_text(sql.strip(), name="sql", max_len=20_000)
    if not sql:
        raise ValueError("sql is required")

    while sql.endswith(";"):
        sql = sql[:-1].rstrip()
    if ";" in sql:
        raise ValueError("multiple SQL statements are not allowed")

    if not re.match(r"(?is)^\s*(SELECT|WITH)\b", sql):
        raise ValueError("only SELECT or WITH queries are allowed")
    if _BLOCKED_DB_KEYWORDS_RE.search(sql):
        raise ValueError("query contains a write/admin SQL keyword that is blocked")
    if _BLOCKED_DB_FUNCTION_RE.search(sql):
        raise ValueError("query contains a blocked PostgreSQL function")
    if _BLOCKED_DB_LOCK_RE.search(sql):
        raise ValueError("row-locking SELECT queries are blocked")
    return sql


def _run_readonly_query(sql: str, max_rows: int) -> str:
    if not 1 <= max_rows <= MAX_DB_RESULT_ROWS:
        raise ValueError(f"max_rows must be between 1 and {MAX_DB_RESULT_ROWS}")

    query = _validate_readonly_sql(sql)
    wrapped = f"SELECT * FROM ({query}) AS sanq_mcp_query LIMIT {max_rows + 1}"
    env = _db_connection_env()

    try:
        proc = subprocess.run(
            [
                "psql",
                "-X",
                "--no-psqlrc",
                "--set=ON_ERROR_STOP=1",
                "--tuples-only",
                "--no-align",
                "--field-separator=\t",
            ],
            input=wrapped + "\n",
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=10,
            check=False,
            shell=False,
        )
    except FileNotFoundError as exc:
        raise ValueError("psql is not installed on the MCP host") from exc

    output = _redact(proc.stdout or "").rstrip()
    if proc.returncode != 0:
        raise ValueError(f"read-only database query failed: {output}")

    lines = output.splitlines() if output else []
    truncated = len(lines) > max_rows
    lines = lines[:max_rows]
    header = f"[rows={len(lines)} max_rows={max_rows} truncated={str(truncated).lower()}]"
    if not lines:
        return f"{header}\n(no rows)"
    return f"{header}\n" + "\n".join(lines)


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def system_status() -> str:
    """Inspect VM time, uptime/load, memory, root filesystem, and core service state."""
    sections = [
        ("time", ["date", "--iso-8601=seconds"]),
        ("uptime/load", ["uptime"]),
        ("memory", ["free", "-h"]),
        ("root filesystem", ["df", "-h", "/"]),
        ("docker service", ["systemctl", "is-active", "docker"]),
        ("sanq-mcp tunnel", ["systemctl", "is-active", "sanq-mcp-tunnel"]),
    ]
    rendered: list[str] = []
    for title, args in sections:
        rendered.append(f"## {title}\n{_run_system(args)}")
    return "\n\n".join(rendered)


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def docker_status(
    service: DockerService | None = None,
    include_stopped: bool = False,
) -> str:
    """Show SanQ Docker Compose container status, optionally for one service."""
    args = ["docker", "compose", "ps"]
    if include_stopped:
        args.append("--all")
    if service:
        args.append(service)
    return _run_prod(args)


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def docker_logs(
    service: DockerService,
    tail: int = 300,
    query: str = "",
    since: str = "",
    until: str = "",
    regex: bool = False,
    ignore_case: bool = True,
    context: int = 0,
    max_results: int = 300,
) -> str:
    """Read Docker Compose logs with precise filtering.

    Docker access is intentionally limited to compose ps/logs only.
    """
    if not 1 <= tail <= 10_000:
        raise ValueError("tail must be between 1 and 10000")
    if not 0 <= context <= 20:
        raise ValueError("context must be between 0 and 20")
    if not 1 <= max_results <= MAX_LOG_RESULT_LINES:
        raise ValueError(f"max_results must be between 1 and {MAX_LOG_RESULT_LINES}")

    query = _validate_plain_text(query, name="query", max_len=500)
    since = _validate_plain_text(since.strip(), name="since", max_len=100)
    until = _validate_plain_text(until.strip(), name="until", max_len=100)

    args = ["docker", "compose", "logs", "--no-color", "--timestamps"]
    if since:
        args.extend(["--since", since])
    if until:
        args.extend(["--until", until])
    if not since and not until:
        args.extend(["--tail", str(tail)])
    args.append(service)

    raw = _run_prod(args, timeout=45, max_chars=1_500_000)
    selected, match_count = _select_log_lines(
        raw,
        query=query,
        regex=regex,
        ignore_case=ignore_case,
        context=context,
        max_results=max_results,
    )

    mode = "time-range" if since or until else f"tail={tail}"
    header = (
        f"[service={service} mode={mode} query={query!r} "
        f"matches={match_count if query else 'n/a'} returned_lines={len(selected)}]"
    )

    if not selected:
        return f"{header}\n(no matching log lines)"
    return f"{header}\n" + "\n".join(selected)


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def git_status(path: str = "") -> str:
    """Show read-only Git status for the production repository."""
    args = ["git", "status", "-sb"]
    args.extend(_git_pathspec_args(PROD_REPO_ROOT, path))
    return _run_prod(args)


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def git_log(
    limit: int = 15,
    since: str = "",
    until: str = "",
    author: str = "",
    grep: str = "",
    path: str = "",
) -> str:
    """Show production-repository Git history without modifying it."""
    return _git_log(
        PROD_REPO_ROOT,
        "production",
        limit=limit,
        since=since,
        until=until,
        author=author,
        grep=grep,
        path=path,
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def git_diff(
    path: str = "",
    staged: bool = False,
    stat: bool = False,
) -> str:
    """Read current production-repository Git changes."""
    return _git_diff(
        PROD_REPO_ROOT,
        "production",
        path=path,
        staged=staged,
        stat=stat,
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def git_show(
    commit: str,
    path: str = "",
    stat: bool = False,
) -> str:
    """Read a production-repository Git commit and diff."""
    return _git_show(
        PROD_REPO_ROOT,
        "production",
        commit=commit,
        path=path,
        stat=stat,
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def read_file(
    path: str,
    start_line: int = 1,
    end_line: int = 300,
) -> str:
    """Read a file inside the production SanQ repository.

    Production is read-only. Environment files, private keys, Git metadata,
    and paths outside the repository are blocked.
    """
    return _read_repo_file(PROD_REPO_ROOT, path, start_line, end_line)


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def search_code(
    query: str,
    max_results: int = 100,
    path: str = "",
    file_glob: str = "",
    regex: bool = False,
    ignore_case: bool = False,
    context: int = 0,
) -> str:
    """Search source text in the read-only production repository."""
    return _search_repo_code(
        PROD_REPO_ROOT,
        query,
        max_results=max_results,
        path=path,
        file_glob=file_glob,
        regex=regex,
        ignore_case=ignore_case,
        context=context,
        scope="production",
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def workspace_status() -> str:
    """Show whether the isolated writable code workspace is ready."""
    _assert_workspace_is_separate()
    exists = WORKSPACE_ROOT.exists()
    git_repo = exists and (WORKSPACE_ROOT / ".git").exists()
    return (
        f"workspace={WORKSPACE_ROOT}\n"
        f"exists={str(exists).lower()}\n"
        f"git_worktree={str(git_repo).lower()}\n"
        f"production={PROD_REPO_ROOT}\n"
        "production_overlap=false"
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def workspace_read_file(
    path: str,
    start_line: int = 1,
    end_line: int = 300,
) -> str:
    """Read a source/configuration file inside the isolated writable workspace."""
    _assert_workspace_ready()
    return _read_repo_file(WORKSPACE_ROOT, path, start_line, end_line)


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_write_file(path: str, content: str) -> str:
    """Create or fully replace one UTF-8 file inside the isolated workspace.

    Production paths, .git, environment files, credentials, and key material are blocked.
    """
    _assert_workspace_ready()
    content = _validate_plain_text(content, name="content", max_len=MAX_FILE_WRITE_CHARS)
    resolved = _resolve_under(WORKSPACE_ROOT, path, require_exists=False)
    _assert_safe_repo_path(resolved, WORKSPACE_ROOT)
    if resolved.exists() and not resolved.is_file():
        raise ValueError("path exists but is not a file")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(content, encoding="utf-8")
    return f"wrote {_relative_to(WORKSPACE_ROOT, resolved)} ({len(content)} characters)"


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_apply_patch(
    path: str,
    old_text: str,
    new_text: str,
    expected_count: int = 1,
) -> str:
    """Replace an exact text fragment inside one existing workspace file.

    The target must be a safe UTF-8 file inside the isolated workspace. The
    replacement is rejected unless old_text occurs exactly expected_count times.
    """
    _assert_workspace_ready()
    if not 1 <= expected_count <= 1_000:
        raise ValueError("expected_count must be between 1 and 1000")
    old_text = _validate_plain_text(
        old_text,
        name="old_text",
        max_len=MAX_FILE_WRITE_CHARS,
    )
    new_text = _validate_plain_text(
        new_text,
        name="new_text",
        max_len=MAX_FILE_WRITE_CHARS,
    )
    if not old_text:
        raise ValueError("old_text is required")
    if old_text == new_text:
        raise ValueError("old_text and new_text must differ")

    resolved = _resolve_under(WORKSPACE_ROOT, path)
    _assert_safe_repo_path(resolved, WORKSPACE_ROOT)
    if not resolved.is_file():
        raise ValueError("path is not a file")

    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("path is not a UTF-8 text file") from exc
    if len(content) > MAX_FILE_WRITE_CHARS:
        raise ValueError(
            f"file is too large to patch (max {MAX_FILE_WRITE_CHARS} characters)"
        )

    match_count = content.count(old_text)
    if match_count != expected_count:
        raise ValueError(
            "patch rejected: "
            f"expected {expected_count} match(es), found {match_count}"
        )

    updated = content.replace(old_text, new_text, expected_count)
    if len(updated) > MAX_FILE_WRITE_CHARS:
        raise ValueError(
            f"patched file would be too large (max {MAX_FILE_WRITE_CHARS} characters)"
        )
    resolved.write_text(updated, encoding="utf-8")

    relative = _relative_to(WORKSPACE_ROOT, resolved)
    diff = _git_diff(
        WORKSPACE_ROOT,
        "workspace",
        path=relative,
        staged=False,
        stat=False,
    )
    return (
        f"patched {relative} ({match_count} replacement(s); "
        f"{len(old_text)} -> {len(new_text)} characters)\n{diff}"
    )


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_delete_file(path: str) -> str:
    """Delete one safe regular file from the isolated writable workspace.

    Directories, production paths, .git, environment files, credentials, and
    key material are blocked.
    """
    _assert_workspace_ready()
    resolved = _resolve_under(WORKSPACE_ROOT, path)
    _assert_safe_repo_path(resolved, WORKSPACE_ROOT)
    if not resolved.is_file():
        raise ValueError("path is not a file")

    relative = _relative_to(WORKSPACE_ROOT, resolved)
    resolved.unlink()
    return f"deleted {relative}"


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def workspace_search_code(
    query: str,
    max_results: int = 100,
    path: str = "",
    file_glob: str = "",
    regex: bool = False,
    ignore_case: bool = False,
    context: int = 0,
) -> str:
    """Search source text inside the isolated writable workspace."""
    _assert_workspace_ready()
    return _search_repo_code(
        WORKSPACE_ROOT,
        query,
        max_results=max_results,
        path=path,
        file_glob=file_glob,
        regex=regex,
        ignore_case=ignore_case,
        context=context,
        scope="workspace",
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def workspace_git_status(path: str = "") -> str:
    """Show Git status for the isolated workspace."""
    _assert_workspace_ready()
    args = ["git", "status", "-sb"]
    args.extend(_git_pathspec_args(WORKSPACE_ROOT, path))
    return _run_workspace(args)


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def workspace_git_log(
    limit: int = 15,
    since: str = "",
    until: str = "",
    author: str = "",
    grep: str = "",
    path: str = "",
) -> str:
    """Show Git history for the isolated workspace."""
    _assert_workspace_ready()
    return _git_log(
        WORKSPACE_ROOT,
        "workspace",
        limit=limit,
        since=since,
        until=until,
        author=author,
        grep=grep,
        path=path,
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def workspace_git_diff(
    path: str = "",
    staged: bool = False,
    stat: bool = False,
) -> str:
    """Read current Git changes in the isolated workspace."""
    _assert_workspace_ready()
    return _git_diff(
        WORKSPACE_ROOT,
        "workspace",
        path=path,
        staged=staged,
        stat=stat,
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def workspace_git_show(
    commit: str,
    path: str = "",
    stat: bool = False,
) -> str:
    """Read a Git commit and diff from the isolated workspace."""
    _assert_workspace_ready()
    return _git_show(
        WORKSPACE_ROOT,
        "workspace",
        commit=commit,
        path=path,
        stat=stat,
    )


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_git_fetch() -> str:
    """Fetch the latest dev ref from fixed remote origin into origin/dev.

    The working tree is not changed. Feature branches should be created with
    workspace_create_feature_branch().
    """
    _assert_workspace_ready()
    return _fetch_workspace_dev()


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_git_switch(branch: str) -> str:
    """Switch to an existing validated workspace branch.

    Creating branches through this tool is intentionally not supported. Use
    workspace_create_feature_branch() so every new feature branch starts from
    the latest fetched origin/dev.
    """
    _assert_workspace_ready()
    branch = _validate_branch(branch)
    return _run_workspace(["git", "switch", branch])


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_create_feature_branch(branch: str) -> str:
    """Fetch latest origin/dev and create a new feature branch from it.

    The workspace must be clean. main/dev are reserved and cannot be created.
    The start point and remote are fixed internally and cannot be supplied by
    the caller.
    """
    _assert_workspace_ready()
    branch = _validate_branch(branch)
    if branch.casefold() in {"main", "dev"}:
        raise ValueError("feature branch must not be main/dev")

    _assert_workspace_clean()
    fetch_output = _fetch_workspace_dev()
    switch_output = _run_workspace(["git", "switch", "-c", branch, "origin/dev"])
    if switch_output.startswith("[command exited"):
        raise ValueError(
            f"failed to create feature branch {branch!r} from origin/dev:\n"
            f"{switch_output}"
        )
    return f"{fetch_output}\n{switch_output}"


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_git_checkout(ref: str) -> str:
    """Checkout an existing validated ref inside the isolated workspace."""
    _assert_workspace_ready()
    revision = _validate_revision(ref, name="ref")
    return _run_workspace(["git", "checkout", revision])


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_git_add(paths: list[str]) -> str:
    """Stage selected workspace paths with git add, including deleted files."""
    _assert_workspace_ready()
    if not paths or len(paths) > 50:
        raise ValueError("paths must contain between 1 and 50 entries")
    rel_paths: list[str] = []
    for path in paths:
        resolved = _resolve_under(WORKSPACE_ROOT, path, require_exists=False)
        _assert_safe_repo_path(resolved, WORKSPACE_ROOT)
        rel_paths.append(_relative_to(WORKSPACE_ROOT, resolved))
    return _run_workspace(
        ["git", "add", "--", *rel_paths, *_git_sensitive_pathspecs()]
    )


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_git_commit(message: str) -> str:
    """Commit staged workspace changes without running repository commit hooks."""
    _assert_workspace_ready()
    message = _validate_plain_text(message.strip(), name="message", max_len=500)
    if not message:
        raise ValueError("message is required")
    return _run_workspace(["git", "commit", "--no-verify", "-m", message], timeout=45)


@mcp.tool(annotations=LOCAL_WRITE_ANNOTATIONS)
def workspace_git_push(branch: str, set_upstream: bool = False) -> str:
    """Push the current feature branch to the same named branch on fixed origin.

    Direct pushes to main/dev, cross-branch pushes, force pushes, and arbitrary
    remotes/refspecs are intentionally not exposed. Changes must reach dev via PR.
    """
    _assert_workspace_ready()
    branch = _validate_branch(branch)
    if branch.casefold() in {"main", "dev"}:
        raise ValueError("direct pushes to main/dev are blocked; use a feature branch and PR")
    current_branch = _workspace_current_branch()
    if current_branch != branch:
        raise ValueError(
            "push target must match the current workspace feature branch "
            f"({current_branch})"
        )
    args = ["git", "push"]
    if set_upstream:
        args.append("--set-upstream")
    args.extend(["origin", f"HEAD:refs/heads/{branch}"])
    return _run_workspace(args, timeout=60, max_chars=250_000)


@mcp.tool(annotations=GITHUB_WRITE_ANNOTATIONS)
def github_create_pr(
    title: str,
    head: str,
    base: str = "dev",
    body: str = "",
) -> str:
    """Create a feature-branch pull request targeting dev in the configured repo."""
    owner, repo = _github_repo_parts()
    title = _validate_plain_text(title.strip(), name="title", max_len=300)
    body = _validate_plain_text(body, name="body", max_len=20_000)
    head = _validate_branch(head, name="head")
    base = _validate_branch(base, name="base")
    if not title:
        raise ValueError("title is required")
    if base != "dev":
        raise ValueError("MCP-created pull requests must target dev")
    if head.casefold() in {"main", "dev"}:
        raise ValueError("pull request head must be a feature branch, not main/dev")

    data = _github_request(
        "POST",
        f"/repos/{owner}/{repo}/pulls",
        payload={"title": title, "head": head, "base": base, "body": body},
    )
    return json.dumps(_github_pr_summary(data), ensure_ascii=False, indent=2)


@mcp.tool(annotations=GITHUB_READ_ANNOTATIONS)
def github_read_pr(number: int) -> str:
    """Read one pull request from the configured SanQ GitHub repository."""
    if number < 1:
        raise ValueError("number must be >= 1")
    owner, repo = _github_repo_parts()
    data = _github_request("GET", f"/repos/{owner}/{repo}/pulls/{number}")
    return json.dumps(_github_pr_summary(data), ensure_ascii=False, indent=2)


@mcp.tool(annotations=GITHUB_READ_ANNOTATIONS)
def github_commit_checks(commit: str) -> str:
    """Read GitHub Actions workflow runs/jobs plus commit status for a commit."""
    data = _github_ci_for_sha(commit)
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool(annotations=GITHUB_READ_ANNOTATIONS)
def github_pr_checks(number: int) -> str:
    """Read GitHub Actions workflow runs/jobs and status for a PR head commit."""
    if number < 1:
        raise ValueError("number must be >= 1")
    owner, repo = _github_repo_parts()
    pr = _github_request("GET", f"/repos/{owner}/{repo}/pulls/{number}")
    if not isinstance(pr, dict):
        raise ValueError("unexpected GitHub pull request response")
    head = pr.get("head")
    if not isinstance(head, dict) or not isinstance(head.get("sha"), str):
        raise ValueError("pull request response is missing head SHA")
    data = _github_ci_for_sha(head["sha"])
    data["pull_request"] = number
    return json.dumps(data, ensure_ascii=False, indent=2)


@mcp.tool(annotations=GITHUB_READ_ANNOTATIONS)
def github_job_logs(job_id: int, max_chars: int = MAX_COMMAND_OUTPUT_CHARS) -> str:
    """Read bounded, redacted GitHub Actions log text for one job."""
    if job_id < 1:
        raise ValueError("job_id must be >= 1")
    owner, repo = _github_repo_parts()
    logs = _github_download_text(
        f"/repos/{owner}/{repo}/actions/jobs/{job_id}/logs",
        max_chars=max_chars,
    )
    return f"[repository={GITHUB_REPOSITORY} job_id={job_id}]\n{logs}"


@mcp.tool(annotations=GITHUB_WRITE_ANNOTATIONS)
def github_merge_pr(number: int) -> str:
    """Squash-merge a CI-green same-repository feature PR into dev.

    Only open, non-draft feature-branch PRs targeting dev are eligible. At least
    one pull_request Actions run must exist and all Actions runs for the checked
    head SHA must be successful. The merge request includes that exact head SHA
    so a newly pushed commit cannot race past the CI gate.
    """
    if number < 1:
        raise ValueError("number must be >= 1")

    owner, repo = _github_repo_parts()
    pr = _github_request("GET", f"/repos/{owner}/{repo}/pulls/{number}")
    if not isinstance(pr, dict):
        raise ValueError("unexpected GitHub pull request response")
    if pr.get("state") != "open":
        raise ValueError("pull request must be open")
    if pr.get("draft") is True:
        raise ValueError("draft pull requests cannot be merged")

    head = pr.get("head")
    base = pr.get("base")
    if not isinstance(head, dict) or not isinstance(base, dict):
        raise ValueError("pull request response is missing head/base data")

    head_ref_raw = head.get("ref")
    head_sha_raw = head.get("sha")
    if not isinstance(head_ref_raw, str) or not isinstance(head_sha_raw, str):
        raise ValueError("pull request response is missing head branch or SHA")
    head_ref = _validate_branch(head_ref_raw, name="head")
    head_sha = _validate_revision(head_sha_raw, name="head_sha")

    if base.get("ref") != "dev":
        raise ValueError("MCP can only merge pull requests targeting dev")
    if head_ref.casefold() in {"main", "dev"}:
        raise ValueError("pull request head must be a feature branch, not main/dev")

    head_repo = head.get("repo")
    if not isinstance(head_repo, dict) or head_repo.get("full_name") != GITHUB_REPOSITORY:
        raise ValueError("pull request head must belong to the configured repository")

    if pr.get("mergeable") is not True:
        raise ValueError("pull request is not currently mergeable")

    checks = _github_ci_for_sha(head_sha)
    workflows_raw = checks.get("workflow_runs")
    workflows = workflows_raw if isinstance(workflows_raw, list) else []
    pull_request_runs = [
        run
        for run in workflows
        if isinstance(run, dict) and run.get("event") == "pull_request"
    ]
    if not pull_request_runs:
        raise ValueError("no pull_request CI run exists for the current head SHA")
    if checks.get("actions_state") != "success":
        raise ValueError("GitHub Actions checks are not all successful")
    if any(
        run.get("status") != "completed" or run.get("conclusion") != "success"
        for run in pull_request_runs
    ):
        raise ValueError("pull_request CI has not completed successfully")

    merged = _github_request(
        "PUT",
        f"/repos/{owner}/{repo}/pulls/{number}/merge",
        payload={"sha": head_sha, "merge_method": "squash"},
    )
    if not isinstance(merged, dict) or merged.get("merged") is not True:
        message = merged.get("message") if isinstance(merged, dict) else None
        raise ValueError(f"GitHub did not merge the pull request: {message or 'unknown reason'}")

    return json.dumps(
        {
            "repository": GITHUB_REPOSITORY,
            "pull_request": number,
            "head": head_ref,
            "head_sha": head_sha,
            "base": "dev",
            "merge_method": "squash",
            "merged": True,
            "merge_sha": merged.get("sha"),
            "message": merged.get("message"),
        },
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool(annotations=READ_ONLY_ANNOTATIONS)
def db_query(sql: str, max_rows: int = 200) -> str:
    """Run a bounded read-only PostgreSQL SELECT/WITH query.

    The MCP service must use a dedicated read-only DB role. The tool also forces
    default_transaction_read_only, statement_timeout, lock_timeout, blocks write/admin
    keywords and dangerous server-side file/control functions, rejects multiple
    statements, and caps returned rows. It never uses Docker exec.
    """
    return _run_readonly_query(sql, max_rows)


if __name__ == "__main__":
    mcp.run(transport="stdio")