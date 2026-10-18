# C5-G2-B2B — Root-private operator / maintenance barrier readiness audit

> **R0 现行口径（2026-10-17 Toronto）：**D1–D5 已获用户批准并冻结；当前决策、进度、C1–C8 门禁与 R0–R5 队列以 [Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 为准。本文其余内容保留发表/取证时的状态：`LOCAL`、待审、未运行及“下一批”均是当时记录，不能覆盖 R0 当前进度；原始 PASS / NOT EXECUTED 与适用边界不变。旧命令不获得重新执行授权。旧 S12/冷掉电要求按 D5 退出首版默认门禁，进程中断及独立重装仍为必验，掉电持久性仍 NOT VERIFIED。`S2 PAUSED` 指日常配置扩充/接线暂缓，不表示现役备份 timer 已停止。**R0 DESIGN FROZEN；C5-G2 NO-GO。**

**Date:** 2026-10-13 (America/Toronto)  
**Baseline:** `origin/dev@223c25e57416feb0b35afb43544018b0633c0640`, G2-B2A PR #2793 CI #7173 all seven green.  
**Status (2026-10-13):** DESIGN REVIEW / ISOLATED SYNTHETIC BARRIER SOURCE IMPLEMENTED FOR LOCAL REVIEW. User authorized isolated development, not production authorization; no real root/systemd actions. S2 daily backup paused. See [B2B isolated rehearsal](./c5-g2b2b-isolated-operator-rehearsal-2026-10-13.md).

## Read-only audit: source evidence and actual ownership

- `ops/runtime/proc_reference_census.py` (G2-B2A) has a fixed read-only root-required entrypoint; it checks **textual** `/proc` references only and *unconditionally* returns `crossProcessQuiescenceVerified=false`. Its private fixture path seam is not a trusted production API.
- `ops/runtime/preinstall_maintenance_contract.py` (G2-B1) is a synthetic caller-evidence consistency checker, not a producer or authenticator. Even consistent evidence cannot grant privilege.
- `ops/runtime/offline_root_private_installer.py` remains hard-restricted to `/tmp/sanq-u2d2a-lab-*` and does not accept production Runtime paths. Removing that guard or importing its offline verifier as a trust anchor is **not acceptable**.
- `ops/runtime/offline_fd_inventory.py` has stronger FD-anchored source inventory patterns but also remains fixture-only, with different ownership/mode rules from installed production files. A full production inventory must validate the real fixed 17-member source allowlist, release-state, C4 activation, storage and image facts before and after handoff.
- `ops/release/deploy_release.py` writes `.env` and root Release State and runs Docker Compose. It does not participate in any newly invented root-owned installer `flock`.
- The installed backup unit is `sanq-backup.service`, `Type=oneshot`, `User=ubuntu`, executing the **independent installed** `/home/ubuntu/backup-db.sh`. A separately installed privileged Nginx helper has its own narrowly scoped sudoers rule. Neither is automatically stopped by a root installer lock.
- `ops/sanq-mcp/server.py` production tools may read from the active Runtime and invoke subprocesses whose cwd points there. MCP and interactive SSH can create new consumers between two point-in-time `/proc` samples.
- The prior U2C operator evidence confirmed an ext4 filesystem, root and ubuntu ownership, current app/runtime SHA distinction, and point-in-time Docker binds; **none** of that is a current cross-process exclusion proof.

## Required **new** authority and module responsibility

A working production handoff inevitably changes the current **operator boundary**: a root-owned, separately installed, independently audited one-shot executable would eventually coordinate maintenance, create a Kit and atomically exchange `/opt/sanq/runtime`. This is not within the authority of today's pure Python contracts or lab installer.

**Recommended design, subject to explicit user approval before implementation:**

1. Root operator operates from an authenticated, non-user-writable `0700` directory **outside** the active Runtime, using a separately reviewed executable source SHA-256; never `sudo python` on a checkout or create a reusable root launcher.
2. A root-only maintenance lock anchored outside `/opt/sanq/runtime` is held throughout the complete transaction, **plus** independently enforced exclusion for every nonparticipant. Since deploy/backup/MCP/SSH do not obey the lock, begin with an operator-managed maintenance window instead of changing all existing controllers in this slice.
3. Record the exact **original** enable/active/timer states before taking any barrier. Exclude new Deploy/Compose calls; pause backup trigger and verify service, helper, rclone, and backup child processes idle. Freeze MCP production requests and prove no child still has old cwd/fd. Require operator shells to leave the Runtime directory. Recheck all process, /proc, Docker, file-state and timer evidence immediately before any active write.
4. Production observation must include **inode and mount namespace** relationships, not merely G2-B2A's textual path matching. Unknown/unreadable process, mount namespace ambiguity, live mmap/fd/cwd reference, missing installed helper compatibility, or actor capable of starting a new consumer means **BLOCKED**.
5. The barrier does not itself authorize writes. The pre-install Recovery Kit must independently hold original, historically authenticated old + target Archives and protected live state off-VM, with create-only encrypted upload, decrypt/readback and hash validation, and compatible current application state. A failed or stale Kit preserves old successes but **never** permits Runtime exchange.
6. On abort before active write, preserve evidence and restore original service state only after it is safe to do so. After interrupted exchange, **no replay of the old journal**; quarantine and require a separately authorized fresh clean reinstall from off-VM original sources.
7. Production consent is a separate exact-target approval, including VM, old/target source SHA and archive digests, installer source digest, Kit transaction ID/readback receipt, running app SHA, maintenance time/window and rollback/abort path. Passing CI or local lab does not imply this consent.

## Architecture choices that require an explicit decision

| Choice | Preferred approach | Impact and alternative |
| --- | --- | --- |
| Privileged source | One-shot root-private operator, pinned hash | Adds root installation / active Runtime write responsibility; alternative: continue a fully manual audited operator procedure, less reusable |
| Barrier | Operator-controlled exclusion of non-cooperating backup, deploy, MCP and SSH | Temporary operational unavailability; alternative: extend each independently installed consumer to participate in a common maintenance protocol, **larger coordinated rollout** |
| File identity | Preserve original protected bytes, UID/GID, modes and path semantics; new inode permitted once all old references excluded | Alternative strict inode stability requires redesigning full directory exchange; cannot silently switch to in-place edits |
| Kit destination | Create-only crypt-encrypted off-VM original Archive + live state, with readback and escrow | Alternative separate immutable archive service requires a new provider/credential design; **do not** merge this into paused daily S2 |
| Failure response | Abort/quarantine/fresh independently verified reinstall, including same-version recovery | Alternative old journal resume violates the newly approved C5 recovery policy and requires renewed architecture authorization |

## Implementation boundaries once authorized

- **B2B-1:** standalone, offline-testable fixed operator source identity and actual host observation contract (root-only, read-only, inactive by default); no permanent sudoers grant, no production commands via MCP.
- **B2B-2:** root-private operator-controlled maintenance barrier, proven to exclude non-cooperative consumers and restore original service state, with isolated ext4 VM evidence. Any changes to installed backup helper/service or deploy controller require *separate* scoped C4-style approval.
- **B3:** original Archive long-term escrow and real encrypted pre-install Recovery Kit, independent of S2 scheduled daily backup. No live Runtime writes.
- **C:** independently reviewed one-shot runtime transaction + separate clean reinstall. This is a further privilege step, not included with read-only observer authorization.
- **D/E:** real isolated full-source recovery acceptance, then individually authorized production readiness and execution.

## Disposition and gate

**G2-B2B READINESS AUDIT RECORDED / USER AUTHORIZED ISOLATED DEVELOPMENT ONLY / PRODUCTION PRIVILEGED IMPLEMENTATION STILL NO-GO.**

Do not alter `SOURCE_FILES` (17), `AGENTS.md`, Prisma, production VM, systemd, sudoers, MCP production permissions, the app controller, the existing lab guard, or daily S2 as part of this audit. No tests, root execution, CI or source PR was performed for this document-only local review.
