#!/usr/bin/env python3
"""C5-A offline, read-only source checkout retirement dependency audit."""

from __future__ import annotations
import argparse
import json
import stat
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS: dict[str, tuple[str, ...]] = {
    "ops/sanq-mcp/server.py": (
        'os.environ.get("SANQ_REPO_ROOT", "/home/ubuntu/sanq-app")',
        '_PRODUCTION_GIT_SUBCOMMANDS = {"status", "log", "diff", "show"}',
        "return _read_repo_file(PROD_REPO_ROOT, path, start_line, end_line)",
        "cwd=PROD_REPO_ROOT,",
    ),
    "ops/runtime/stage_bundle.py": (
        "def verify_independent_archive(",
        "verify_runtime_publication(payload, sha)",
        'STAGED_ARCHIVE = "runtime-archive.tar.gz"',
    ),
    "ops/release/deploy_release.py": (
        "def runtime_manifest() -> dict[str, Any]:",
        "root-owned and not writable by others",
        "target changed Runtime files; separate Runtime update required",
    ),
    ".github/workflows/publish-images.yml": (
        "name: sanq-runtime-",
        "Mark validated source SHA as published",
        "retention-days: 90",
    ),
    "ops/release/release_contract.py": (
        'RELEASE_CONTEXT = "sanq/paired-images-published"',
        "SEALED_DIGEST_PATTERN = re.compile(",
    ),
    "ops/runtime/build_bundle.py": (
        '"sha256": hashlib.sha256(value).hexdigest()',
        '"sourceSha": p["sourceSha"]',
        '"productionActivationAuthorized": False',
    ),
}
DEPENDS_ON_CHECKOUT = (
    "ops/sanq-mcp/server.py",
)
MAX_BYTES = 2 * 1024 * 1024


def safe_source(root: Path, relative: str) -> str | None:
    path = root
    try:
        for part in Path(relative).parts:
            path = path / part
            if path.is_symlink():
                return None
        meta = path.stat()
        if not stat.S_ISREG(meta.st_mode) or meta.st_size > MAX_BYTES:
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None


def inspect(files: dict[str, str | None]) -> dict[str, Any]:
    checked: dict[str, dict[str, Any]] = {}
    for path, required in REQUIREMENTS.items():
        source = files.get(path)
        if not isinstance(source, str):
            checked[path] = {"status": "blocked", "reason": "missing or unsafe reviewed source"}
            continue
        count = sum(marker in source for marker in required)
        checked[path] = {
            "status": "known" if count == len(required) else "drift",
            "matchedChecks": count,
            "requiredChecks": len(required),
        }
    dependencies = {
        path: (
            "present" if checked[path]["status"] == "known"
            else "unknown-needs-review"
        )
        for path in DEPENDS_ON_CHECKOUT
    }
    return {
        "schemaVersion": 1,
        "audit": "C5-A offline retirement-readiness",
        "sourceContracts": checked,
        "checkoutDependencies": dependencies,
        "readyToDeleteProductionSourceCheckout": False,
        "authorizedToChangeMcpProductionBoundary": False,
        "authorizedToChangeReleaseArtifactTrust": False,
        "authorizedToDeleteProductionFiles": False,
        "requiredEvidence": [
            "Runtime artifact digest or attestation anchored to trusted GitHub publication, bound to SHA and image digests; internal manifest SHA256 alone is not sufficient",
            "C5-B2A stages externally authenticated Runtime archives without checkout; deployment controller still needs an independently reviewed B2B cutover",
            "MCP read/search/history/status behavior migrated to distinct source service or consciously retired without weakening secret/path safeguards",
            "MCP Docker ps/logs explicitly pinned to sanq-app and target Runtime Compose path",
            "MCP workspace stays independent of Runtime and source inspection origins",
            "Host installed systemd/tunnel/service, backup, Docker, and rollback tested under separate production authorization before checkout removal",
        ],
    }


def audit(root: Path) -> dict[str, Any]:
    return inspect({name: safe_source(root, name) for name in REQUIREMENTS})


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, default=ROOT)
    args = p.parse_args()
    print(json.dumps(audit(args.root), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
