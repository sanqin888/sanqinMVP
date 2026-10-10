# C5-U2C — Existing Runtime production handoff readiness audit

**2026-10-09 Toronto / 2026-10-10 UTC — READ-ONLY READINESS / NOT READY FOR INSTALL / NO PRODUCTION MUTATION.**

## Scope and evidence hierarchy

C5-U1 PR #2775, U2A PR #2776 and U2B PR #2777 are merged into `dev` with green GitHub Actions; U2B merge SHA is `16b6d22a6e04dc11997c4e725488d7f9e78c6eab`. U2B validates a synthetic `/tmp` Linux `renameat2(RENAME_EXCHANGE)` transaction, bounded manual incident classification and in-process crash-point injection. It is **not** a production-capable installer, does not authenticate actual release archives, and deliberately rejects root execution and production paths. The source change to `ops/release/deploy_release.py` (startup health gate, PR #2774) remains uninstalled.

Live read-only MCP evidence at **2026-10-10 02:57 UTC**: Docker and MCP tunnel services active; Compose `sanq-app` has four healthy containers; api, web, worker use `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`; DB is PostgreSQL 15. VM root filesystem 58G, 37G available; 1.9Gi RAM, 508Mi available; swap 891Mi used. `main` reported `ff5be8d5…`; latest `dev` has U2B. Runtime release-state ACTIVE, matching active application SHA, was verified by an earlier operator-controlled procedure, **not freshly reread through this MCP tool**. Earlier C4 installation/runbooks describe `/opt/sanq/runtime` real root-owned directory, `/srv/sanq/uploads`, `/srv/sanq/backups`, `sanq-app_pgdata` and backup `sanq-backup.timer`; these remain historical configuration evidence, not fresh filesystem attestations.

The read-only VM MCP **cannot** currently inspect arbitrary installed `systemd` unit files, process cwd/fds, live bind-mount identities, root-owned runtime manifest/file hashes, service timer activity, mount flags, or production filesystem `renameat2` support. Do not convert historical evidence to fresh PASS.

## GO/NO-GO matrix

| Gate | Current evidence | Decision |
| --- | --- | --- |
| U1 contract, U2A trusted inactive staging, U2B synthetic fault injection | Sources merged to dev; U2B GitHub CI green | SOURCE VERIFIED ONLY |
| Installed production controller startup-race fix | Source merged dev, no trusted Runtime update yet | **BLOCKED** |
| Authoritative target release proof | New fixed controller not promoted to main; no matching new main GHCR pair/archive proof frozen | **BLOCKED** |
| Actual installed 17-file root-owned hash/owner/mode/inode inventory | C4 historic pass; fresh MCP inspection unavailable | **PENDING EVIDENCE** |
| Active release-state / env / marker and runtime SHA | Earlier ACTIVE reconciliation; not fresh root-only evidence | **PENDING EVIDENCE** |
| Real systemd/backup/MCP/Compose/runtime consumer audit and quiescence plan | C4 paths documented but live fd/cwd/unit dependency census absent | **BLOCKED** |
| Production filesystem same-device and atomic-exchange capability | Only /tmp synthetic Linux CI exercised; /opt filesystem not tested | **BLOCKED** |
| Preserving dynamic .env, release-state, C4 marker metadata and inode semantics | U2B verifies synthetic bytes/mode/owner, not live inode or concurrent writers | **BLOCKED** |
| Verified complete previous Runtime snapshot, archive retention, durable incident journal | U2B fixture only; no real operator installer or recovery mechanism | **BLOCKED** |
| Root-owned trusted installer delivery, independent proof and reviewed manual recovery | Not implemented and not approved; must not sudo user-writable repo/staging source | **BLOCKED** |
| Production activation and recovery rehearsal | No production install / rollback permission; no real power-loss proof | **NOT AUTHORIZED** |

**Verdict: `C5-U2C NOT READY FOR PRODUCTION RUNTIME INSTALL`.** CI success on U2B is not an authorization signal.

## Critical architectural boundary and alternatives

Updating the root-owned `/opt/sanq/runtime` necessarily crosses from `ops/runtime`'s current inert source/planners into a privileged production handoff function. This is **a new installation responsibility** and must be explicitly approved after design review. The frozen 17 member allowlist must not be relaxed to load an untrusted arbitrary Python installer, nor may a user-writable workspace/staging script be sudo-executed.

For the installer handoff there are two reviewable alternatives:

1. **Recommended:** a separately verified, root-private, one-shot operator install procedure distributed outside the active Runtime member allowlist, with independently reviewed exact source and archive digests. The procedure only handles trust verification, exclusive quiescence, complete snapshot, fixed-target switch and manual incident recovery. It must not deploy API images or migrate data.
2. **Alternative:** an independently authorized **versioned trusted operator bundle/installer contract** with its own explicit source/version/provenance gate. This is broader to design, test and secure; do not silently fold an installer into existing Runtime `SOURCE_FILES`, as the incumbent manifest would otherwise no longer match.

A direct replacement of `ops/release/deploy_release.py` or edit of `runtime-release.json` checksums is **not** a safe alternative. Neither is double rename, mutable symlink at active Runtime, or reinterpretation of the U2B harness as root-capable.

The `RENAME_EXCHANGE` operation is atomic for directory entry visibility on supporting Linux filesystems but does **not** inherently preserve active path inode identity or quiesce file descriptors/working directories. Dynamic files must be kept trustworthy, 0600 .env ubuntu-owned, root state/marker unchanged, while preventing a process from concurrently changing release-state or reading mixed versions. An explicit transaction, phase journal and recovery plan must account for interruptions both before/after exchange and before/after old directory retention.

## Next review package (read-only first)

- Collect sanitized live evidence: exact runtime source SHA & 17 file checksum/owner/mode, active image SHA, actual mounts/DB volume, .env/state/marker owner/mode + hashes only, latest backup and timer process state. Do **not** echo secrets.
- Enumerate current active launch mechanisms and path/inode consumers: `systemctl cat`, `systemctl show`, `/proc/*/cwd`, `/proc/*/fd` (limited to relevant processes and sanitized); MCP tunnel, Docker Compose invocations, backup script/unit/timer, root helper, cron and watchdogs. Check whether all consumers can be safely paused in a maintenance window.
- Independently verify published target `main` archive and paired image SHA/digest after a separately approved promotion; preserve exact previous archive and verified recovery snapshot. No `dev` commit is directly a deploy target.
- Inspect /opt filesystem capabilities and mount boundaries using a separately approved **disposable same-filesystem** test location, never the live Runtime path. Evidence from /tmp CI is insufficient.
- Freeze root-private operator delivery design, exclusive lock, quiescence, fsync/journal/recovery semantics and dynamic file ownership/inode choices; separately review in-repo code + isolated failure injection before any VM installation.
- Obtain **separate production authorization**, with exact source SHA, target archive Digest, reviewed maintenance window, verified backups and explicit rollback/recovery steps, before touching production files.

## Delivery constraints

This document is a readiness audit, not code authority. No production operations, migrations, CI workflow, allowlist, .env, Docker, uploads, backups or old checkout deletion are changed by this audit. Follow `AGENTS.md`: review local docs/diff, then ask for remote PR approval if documentation delivery is desired. A production-root installer or changed module responsibility requires another explicit architecture authorization.
