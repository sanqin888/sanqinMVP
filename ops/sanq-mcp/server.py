from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("SanQ VM")

REPO_ROOT = Path(os.environ.get("SANQ_REPO_ROOT", "/home/ubuntu/sanq-app")).resolve()

DockerService = Literal["api", "web", "db", "ubereats-worker"]

MAX_COMMAND_OUTPUT_CHARS = 120_000
MAX_LOG_RESULT_LINES = 1_000
MAX_CODE_RESULT_LINES = 300

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


def _redact(text: str) -> str:
    if not text:
        return text
    text = _SECRET_ASSIGNMENT_RE.sub(r"\1[REDACTED]", text)
    text = _BEARER_RE.sub("Bearer [REDACTED]", text)
    text = _URL_TOKEN_RE.sub(r"\1[REDACTED]", text)
    return text


def _run(
    args: list[str],
    *,
    cwd: Path = REPO_ROOT,
    timeout: int = 30,
    max_chars: int = MAX_COMMAND_OUTPUT_CHARS,
) -> str:
    proc = subprocess.run(
        args,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    output = _redact(proc.stdout or "").rstrip()
    if len(output) > max_chars:
        output = output[-max_chars:]
        output = "[output truncated to most recent characters]\n" + output
    if proc.returncode != 0:
        prefix = f"[command exited {proc.returncode}]"
        return f"{prefix}\n{output}".rstrip()
    return output or "(no output)"


def _validate_plain_text(value: str, *, name: str, max_len: int = 500) -> str:
    value = value or ""
    if "\x00" in value:
        raise ValueError(f"{name} contains a NUL byte")
    if len(value) > max_len:
        raise ValueError(f"{name} is too long (max {max_len} characters)")
    return value


def _resolve_repo_path(path: str, *, require_exists: bool = True) -> Path:
    path = _validate_plain_text(path.strip(), name="path", max_len=500)
    if not path:
        return REPO_ROOT

    candidate = Path(path)
    if candidate.is_absolute():
        raise ValueError("path must be relative to the SanQ repository")

    resolved = (REPO_ROOT / candidate).resolve()
    if resolved != REPO_ROOT and REPO_ROOT not in resolved.parents:
        raise ValueError("path escapes the SanQ repository")

    if require_exists and not resolved.exists():
        raise ValueError(f"path does not exist: {path}")

    return resolved


def _repo_relative(path: Path) -> str:
    if path == REPO_ROOT:
        return "."
    return str(path.relative_to(REPO_ROOT))


def _assert_safe_read_path(path: Path) -> None:
    rel_parts = [part.lower() for part in path.relative_to(REPO_ROOT).parts]
    name = path.name.lower()

    if ".ssh" in rel_parts or ".git" in rel_parts:
        raise ValueError("reading this path is blocked")

    if name == ".env" or name.startswith(".env."):
        raise ValueError("environment files are blocked")

    if name in {"id_rsa", "id_ed25519", "secrets.json", "credentials.json"}:
        raise ValueError("private credential files are blocked")

    if path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}:
        raise ValueError("private key/certificate files are blocked")


def _validate_revision(revision: str) -> str:
    revision = _validate_plain_text(revision.strip(), name="commit", max_len=120)
    if not revision:
        raise ValueError("commit is required")
    if not re.fullmatch(r"[A-Za-z0-9._/@{}^~:+-]+", revision):
        raise ValueError("commit contains unsupported characters")
    if revision.startswith("-"):
        raise ValueError("commit may not begin with '-'")
    return revision


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


@mcp.tool()
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
        rendered.append(f"## {title}\n{_run(args, cwd=Path('/'), timeout=10)}")
    return "\n\n".join(rendered)


@mcp.tool()
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
    return _run(args)


@mcp.tool()
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

    service: api, web, db, or ubereats-worker.
    tail: Number of recent raw lines when no time range is supplied (1..10000).
          When since/until is supplied, Docker's time range is used instead of tail.
    query: Optional literal text or regex to match (request id, order id, event name, etc.).
    since/until: Docker-compatible time values such as "30m", "2h",
                 or RFC3339 timestamps like "2026-08-17T14:50:00-04:00".
    regex: Interpret query as a regular expression. Literal matching is the safer default.
    ignore_case: Case-insensitive matching when true.
    context: Include this many lines before and after each match (0..20).
    max_results: Maximum returned lines after filtering (1..1000).
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

    raw = _run(args, timeout=45, max_chars=1_500_000)
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


@mcp.tool()
def git_status(path: str = "") -> str:
    """Show branch and working-tree status, optionally scoped to a repository path."""
    args = ["git", "status", "-sb"]
    if path.strip():
        resolved = _resolve_repo_path(path)
        args.extend(["--", _repo_relative(resolved)])
    return _run(args)


@mcp.tool()
def git_log(
    limit: int = 15,
    since: str = "",
    until: str = "",
    author: str = "",
    grep: str = "",
    path: str = "",
) -> str:
    """Show recent Git commits with optional date, author, message, and path filters."""
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

    if path.strip():
        resolved = _resolve_repo_path(path)
        args.extend(["--", _repo_relative(resolved)])

    return _run(args)


@mcp.tool()
def git_diff(
    path: str = "",
    staged: bool = False,
    stat: bool = False,
) -> str:
    """Read current uncommitted Git changes, optionally staged-only, stat-only, or path-scoped."""
    args = ["git", "diff", "--no-ext-diff"]
    if staged:
        args.append("--staged")
    if stat:
        args.append("--stat")
    if path.strip():
        resolved = _resolve_repo_path(path)
        args.extend(["--", _repo_relative(resolved)])
    return _run(args)


@mcp.tool()
def git_show(
    commit: str,
    path: str = "",
    stat: bool = False,
) -> str:
    """Read a Git commit and diff, optionally scoped to one path."""
    revision = _validate_revision(commit)
    args = ["git", "show", "--no-ext-diff", "--date=iso"]
    if stat:
        args.append("--stat")
    args.append(revision)
    if path.strip():
        resolved = _resolve_repo_path(path)
        args.extend(["--", _repo_relative(resolved)])
    return _run(args)


@mcp.tool()
def read_file(
    path: str,
    start_line: int = 1,
    end_line: int = 300,
) -> str:
    """Read a source/configuration file inside the SanQ repository.

    Environment files, private keys, Git metadata, and paths outside the repository are blocked.
    At most 500 lines can be returned per request.
    """
    if start_line < 1:
        raise ValueError("start_line must be >= 1")
    if end_line < start_line:
        raise ValueError("end_line must be >= start_line")
    if end_line - start_line + 1 > 500:
        raise ValueError("at most 500 lines may be read per request")

    resolved = _resolve_repo_path(path)
    _assert_safe_read_path(resolved)
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


@mcp.tool()
def search_code(
    query: str,
    max_results: int = 100,
    path: str = "",
    file_glob: str = "",
    regex: bool = False,
    ignore_case: bool = False,
    context: int = 0,
) -> str:
    """Search source text in the SanQ repository with optional scope and matching controls.

    query: Literal text by default; set regex=true for a regular expression.
    path: Optional repository-relative directory/file to search within.
    file_glob: Optional ripgrep glob such as "*.ts" or "apps/api/**/*.ts".
    ignore_case: Case-insensitive matching.
    context: Number of surrounding lines to include (0..10).
    max_results: Maximum returned output lines (1..300).
    Secret env files, node_modules, uploads/backups, and Git metadata are excluded.
    """
    query = _validate_plain_text(query, name="query", max_len=500)
    if not query:
        raise ValueError("query is required")
    if not 1 <= max_results <= MAX_CODE_RESULT_LINES:
        raise ValueError(f"max_results must be between 1 and {MAX_CODE_RESULT_LINES}")
    if not 0 <= context <= 10:
        raise ValueError("context must be between 0 and 10")

    file_glob = _validate_plain_text(file_glob.strip(), name="file_glob", max_len=200)

    target = REPO_ROOT
    if path.strip():
        target = _resolve_repo_path(path)

    args = [
        "rg",
        "--hidden",
        "--line-number",
        "--no-heading",
        "--color",
        "never",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!.git/**",
        "--glob",
        "!.env",
        "--glob",
        "!.env.*",
        "--glob",
        "!uploads/**",
        "--glob",
        "!backups/**",
    ]
    if not regex:
        args.append("--fixed-strings")
    if ignore_case:
        args.append("--ignore-case")
    if context:
        args.extend(["--context", str(context)])
    if file_glob:
        args.extend(["--glob", file_glob])

    args.extend(["--", query, _repo_relative(target)])
    output = _run(args, max_chars=500_000)

    if output.startswith("[command exited 1]"):
        return "(no matches)"
    if output.startswith("[command exited"):
        return output

    lines = output.splitlines()
    if len(lines) > max_results:
        lines = lines[:max_results]
        lines.append(f"[truncated after {max_results} output lines]")
    return _redact("\n".join(lines))


if __name__ == "__main__":
    mcp.run(transport="stdio")
