# Production source-checkout retirement — second-stage readiness

**2026-10-08 · LOCAL READ-ONLY AUDIT / REVIEW PENDING / NO VM MUTATIONS**

Baseline: PR #2756 merged into dev `1ae72399d8467b6d10a7f45152eb4688c4e8aeaf` after seven green CI jobs. Installed production controller/Runtime cutover and checkout-free rollback have **not** been verified. No permission is implied to remove or rename `/home/ubuntu/sanq-app`.

## Grounded dependency inventory

| Consumer | Observed source contract | Release prerequisite |
| --- | --- | --- |
| Image deploy controller | `ops/release/deploy_release.py` no longer reads or executes Git in `SOURCE_CHECKOUT`; still requires root-owned installed Runtime/manifest file parity, source ancestry and no changed Runtime Bundle members | Independently approved installed Runtime handoff, no-checkout plan/deploy/rollback evidence |
| Production SanQ MCP source tools | **Previous deployed behavior:** `SANQ_REPO_ROOT=/home/ubuntu/sanq-app` for Git/read/search. **New local source:** `main` through authenticated GitHub API, with explicit full-SHA reads and repository/path restrictions | CI validation, reviewed MCP service update, actual `main`/SHA read/search, rate-limit and failure checks. Preserve workspace GitHub PR and production Docker/DB tools |
| MCP tool process | Separate `SANQ_WORKSPACE_ROOT=/home/ubuntu/sanq-mcp-workspace` default. Workspace Git operations do not require the old production checkout by definition | Verify actual installed service working directory, entrypoint, environment, permissions and tunnel before removal; do not assume the source script is installed independently |
| Backup | `ops/backup/backup-db.sh` references `/opt/sanq/runtime`; `sanq-backup.service` target uses `/home/ubuntu/backup-db.sh`; separate protected helper checks `/opt/sanq/runtime` | Inspect *installed* cron/systemd unit, helper, upload mounts, backup destination and restoration evidence; preserve backup data |
| Runtime staging/retirement audit | `stage_bundle.py` and `audit_release_provenance.py` validate published Runtime archive bytes without source checkout. `audit_source_retirement.py` still flags MCP as an outstanding checkout consumer | Do not confuse staging evidence with installed trusted Runtime or proof of production activation |
| Runtime layout legacy metadata | `ops/runtime/runtime-layout.v1.json`, `inspect_layout.py`, `audit_backup_cutover.py` mention the former checkout, often as **legacy input/audit** | Review references individually; do not delete transition-audit contracts solely because path is mentioned |
| Runbooks | `docs/runbooks/backup-recovery.zh-CN.md` contains legacy `cd /home/ubuntu/sanq-app` and legacy log paths; several older plans record historical roots | Update active recovery/runbooks to the verified installed paths before retiring checkout; keep historical sections clearly labeled |

## MCP GitHub main source cutover (local source)

**User decision:** use GitHub `main` as the source of truth for production source reads; allow explicit full Git commit SHA reads for deployed-version incident analysis. Do not create a second Git checkout.

Implemented in `ops/sanq-mcp/server.py`:

- `PROD_REPO_ROOT` is now the **independent Runtime Compose root** `/opt/sanq/runtime`, not `/home/ubuntu/sanq-app`. Docker ps/logs run in this fixed project root. The old production Git and ripgrep subprocess scope is refused; workspace Git remains separately scoped.
- `read_file` uses GitHub Contents API, defaults to `main` and permits `ref=<40-hex-SHA>`. Existing file-path/credential restrictions and redaction stay in effect.
- `git_log`, `git_show`, `git_status` use GitHub API. `git_diff` requires explicit `base` and optional `head` (default main), rather than reporting fictitious staged/unstaged VM changes.
- `search_code` uses repository-qualified GitHub Code Search, filters results by exact repository and protected path patterns, and labels results **matching file paths only, non-exhaustive**. It does not claim precise line matches, local regex parity, or complete results. Indexing, permissions, rate limits and GitHub API availability remain operational dependencies.
- This change does not change GitHub PR mutation tools, isolated workspace ownership or production database permissions.

**Important rollout dependency:** The source-only MCP server is not necessarily the currently installed service entrypoint. A reviewed service installation/restart, credentials and Runtime path validation are needed before enabling this in production. The old `SANQ_REPO_ROOT` environment setting no longer redirects the source tools; inspect and remove it from installed unit configuration separately. **Do not remove the VM source checkout until the installed MCP server, Docker logs, backup, scheduled jobs, Runtime deploy/rollback and production recovery are verified without it.**

## Next production readiness step

The user chose GitHub `main`, not a secondary source snapshot. The old production source-tool contract has now been changed **in local source only**, while isolated development workspace operations are untouched. Before installing the new MCP code, review GitHub token scopes and rate limits; confirm source read, search, GitHub comparisons and current Docker image display against the actual installed service; verify that the MCP process and tunnel can launch independently of the old checkout. Keep local production Git/working-tree operations retired rather than silently making them writable. Then audit other VM service dependencies prior to any checkout deletion.

## Production gate matrix — all pending

1. Record current `main` deployed GHCR image digests, installed Runtime source/manifest hashes, active Compose paths, DB volume and uploads mount identities, backup and restore evidence.
2. Read actual installed systemd/cron/tunnel/printer/MCP launcher and process working directories; confirm no source-checkout references remain. Existing MCP read-only tools do not expose arbitrary installed unit files: **not verified**.
3. Provide a reviewed, checkout-independent Runtime provisioning path. Production verification must use the *installed* controller, not only dev source.
4. Offline/controlled main→new application SHA deploy without Runtime changes; conditional migration authorization and no-migration skip; preserve PostgreSQL.
5. No-checkout manual rollback/incident recovery and post-deploy readiness.
6. Only afterward conduct a separately authorized path/ownership/symlink/mount inspection and delete **only** the exact checkout, not uploads, backup, environment, assets or shared workspace.

**Status: NOT READY FOR PRODUCTION CHECKOUT DELETION.** No production VM commands, live service mutations, migration executions or deletion in this stage.
