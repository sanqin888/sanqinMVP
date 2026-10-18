# C5-G2-B2B9-H — Whole-host exclusion, bounded local source review

> **R0 现行口径（2026-10-17 Toronto）：**D1–D5 已获用户批准并冻结；当前决策、进度、C1–C8 门禁与 R0–R5 队列以 [Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 为准。本文其余内容保留发表/取证时的状态：`LOCAL`、待审、未运行及“下一批”均是当时记录，不能覆盖 R0 当前进度；原始 PASS / NOT EXECUTED 与适用边界不变。旧命令不获得重新执行授权。旧 S12/冷掉电要求按 D5 退出首版默认门禁，进程中断及独立重装仍为必验，掉电持久性仍 NOT VERIFIED。`S2 PAUSED` 指日常配置扩充/接线暂缓，不表示现役备份 timer 已停止。**R0 DESIGN FROZEN；C5-G2 NO-GO。**

**Date:** 2026-10-13 (America/Toronto).  
**Baseline:** latest origin/dev after PR #2806 (`0179b6ec`), B2B8 RERUN-01 evidence archived.  
**State:** H-0 INERT CONTRACT + SYNTHETIC REGRESSION SOURCE FOR LOCAL REVIEW / TESTS NOT RUN / GUEST S3–S10 NOT EXECUTED / PRODUCTION C5-G2 NO-GO / S2 PAUSED.  
**Owner:** Runtime / Ops. No change to Backup, Deploy, MCP, systemd, sudoers, installed Runtime, installer or application controller.

## 1. B2B8 evidence precondition

The B2B8 closure at `docs/architecture/c5-g2b2b8-real-systemd-operator-acceptance-2026-10-13.md`
now links a separately archived **RERUN-01 original** JSON at
`docs/architecture/evidence/c5-g2b2b8-rerun-01-99-result.json`.
It was operator-supplied from the *second* disposable-guest rehearsal, not the
missing first-run `99-result.json`. The document reports the second file at
1,488 bytes and SHA-256
`fe9452cf42decc800fdaedcc918953087045f7c61268ee800bc7c0a19ead65d9`.
The raw receipt records S1/S2/S11 restoration and still explicitly denies
cross-process, mount-namespace and admission coverage. Its claimed identity is
not a third-party guest attestation or privileged execution permission.

## 2. H case matrix (frozen from B2B9 readiness)

| Case | Required negative observation | Acceptance meaning |
| --- | --- | --- |
| H-01 / S3 | Parent oneshot inactive, child still has Runtime fixture cwd/fd | BLOCKED despite inactive systemd unit |
| H-02 / S4 | Another process holds flock | BLOCKED before host adapter/handoff |
| H-03 / S5 | A different-UID noncooperator retains cwd/fd while flock is free | BLOCKED despite free lock |
| H-04 / S8 | PID reuse, unreadable proc, disappeared fd/stat, or scan budget exhaustion | Unknown must BLOCK |
| H-05 | Timer off but helper/rclone-like descendant remains | BLOCKED; timer state alone is insufficient |
| H-06 | Old renamed/deleted Runtime-like tree is still held by inode | BLOCKED; path prefix alone is insufficient |
| H-07 | Noncooperating Deploy/MCP/SSH analog can start/read despite lock | BLOCKED; admission gate belongs to B2B9-A |
| H-08 | Partial or uninspectable process observation | BLOCKED; cannot infer whole-host clear |

For H-06, observing renamed/inode identity overlaps B2B9-N; this H case
requires a detected blocker only and **does not** establish full namespace
coverage. For H-07, detection of continuing admission is failure evidence,
not evidence that admission has been prevented.

## 3. This local H-0 source slice

`ops/runtime/isolated_whole_host_exclusion_review.py` adds one narrowly
bounded *caller-supplied, untrusted* H case-review contract with eight exact
case IDs and a strict fail-closed shape. It checks source SHA-256 **syntax**
(not authenticity), reported guest/snapshot **syntax and claims** (not
hypervisor attestation), claimed `BLOCKED` decision, no attempted handoff,
and identical original/restored synthetic timer/service state including the
timer's next trigger. Any missing/extra field, mismatched case, incomplete
blocker, fake clear or state mismatch is rejected.

`ops/runtime/tests/test_isolated_whole_host_exclusion_review.py` supplies
synthetic per-case characterizations and tampering/authority regressions.
The test is discovered by the existing `api-checks` Python runtime unittest
step in `.github/workflows/ci.yml` only **after** reviewed PR delivery.
Per `AGENTS.md`, local tests, lint and build are not executed in this phase.

This reviewer does **not** observe `/proc`, check actual PID identity,
verify true independent state restoration, invoke systemd, acquire a lock,
run a subprocess, mount filesystems, or create a host runtime barrier. Its
positive output means only that the **reported negative case is internally
consistent**, and never treats it as proof of independently executed cases.

All returned receipts retain
`guestIdentityIndependentlyAuthenticated=false`,
`rootLevelWholeHostExclusionVerified=false`,
`mountNamespaceCoverageVerified=false`,
`newConsumerAdmissionPrevented=false`,
`crossProcessQuiescenceVerified=false`,
`eligibleForRootGuestActions=false`,
`readyToInstall=false`,
`authorizedToMutateProduction=false`.

## 4. Next independent guest acceptance gate (not included)

Only after a **separate** reviewed disposable-guest/root authorization:

1. Independently recheck VM UUID, snapshot **rollback usability**, unique
   disposable ext4 filesystem, network/credential/production-mount absence
   and stale `sanq-g2b2b-lab-*` collisions.
2. Independently approve exact source bytes SHA-256 and root-owned ancestor
   directories (0700), private source files (0600), and full explicit
   proposed privileged command list. Never sudo a writable checkout.
3. Use synthetic guest units and children only; capture each actor's PID,
   kernel start tick, parent/cgroup relationship, owner, fixture inode/dev,
   bounded cwd/fd/mmap observations, original enabled/active/next timer fields,
   and independent post-experiment cleanup/status observations.
4. Exercise H-01/H-02/H-03/H-04/H-05/H-06/H-07/H-08 separately with
   pre/held/post evidence and a failing condition that **blocks** any
   hypothetical handoff. An unknown/unreadable PID is never silently ignored.
5. Restore exactly the original state, and treat failed restoration as an
   unresolved incident with separately verified cleanup. Do not automatically
   replay a journal, delete unknown evidence, or claim installation authority.

Do not confuse this isolated H test with namespace-wide B2B9-N or actual
new-actor prevention B2B9-A. A complete H negative-only test run would still
be insufficient for a whole-host safety acceptance or production write gate.

## 5. Freeze and rollout

Unchanged: 17 fixed Runtime bundle source members; lab-only U2D guard;
`ops/release/deploy_release.py`; installed `/home/ubuntu/backup-db.sh`
and timer/service/helper; `ops/sanq-mcp/server.py` and its scopes;
Prisma, dependencies, GitHub CI and deployment services.
No root/systemd/guest/production command performed in this H-0 slice.

**H-0 is not the real H guest experiment.** User review of this
local source and the future exact root-guest command set are separate gates.
Production remains C5-G2 NO-GO; S2 DAILY BACKUP PAUSED.
