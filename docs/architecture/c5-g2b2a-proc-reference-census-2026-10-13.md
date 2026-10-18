# C5-G2-B2A — Read-only Runtime `/proc` reference census

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**State (2026-10-13): LOCAL SOURCE IMPLEMENTED / NO TEST EXECUTED / REVIEW PENDING / PRODUCTION NO-GO**  
**Baseline:** `origin/dev@84f2674aae7db318aa2ae9b348196a9e39427328` (G2-B1 PR #2792 merged, CI #7171 all seven green).  
**Owner:** Runtime / Ops. Existing app controller, backup, MCP and Docker ownership unchanged.

## Purpose

G2-B1 rejects inconsistent **caller-asserted** maintenance evidence. G2-B2A
adds the first bounded **read-only /proc path-reference observation** component
without pretending to establish maintenance exclusion.

`ops/runtime/proc_reference_census.py` provides
`inspect_production_proc_references()`, fixed to `/proc` and
`/opt/sanq/runtime`. It requires effective uid 0 to avoid silently
treating hidden process descriptors as absent, but **does not acquire root**
or install any executable, request sudo, run host commands, invoke Docker,
change systemd, or expose an MCP operation. It does not run as part of
production or CI; CI only executes synthetic fixture tests.

The private `_inspect(fixture_proc_root)` seam exists for deterministic
CI testing. It is not a public operator interface or selectable production
path/authorization target. Nothing in this module writes to `/proc`.

## Sensor contract

- Performs two bounded /proc PID-directory passes and reads kernel
  `stat` for PID start-ticks, kernel thread/zombie exclusion.
- Classifies `cwd`, `root`, `exe`, and each numeric `fd`
  readlink target, including Runtime path descendants and
  ` (deleted)` descriptors. It does **not** emit link target paths,
  process cmdlines, environment variables, open file bytes, credential
  material, or arbitrary `/proc` outputs.
- If process metadata, process cwd, root, executable or fd enumeration
  is missing/unreadable, the PID is **unknown**, not a clean exclusion.
  PID set change or PID reuse across the two scans is also unknown.
- Reports only PID lists/counts and inert status. A zero count means
  **no matching paths seen by this scanner in these two samples**;
  it does **not** prove host-wide quiescence.
- Always sets `mountNamespaceAndAliasesVerified=false`,
  `evidenceSourceAuthenticated=false`,
  `crossProcessQuiescenceVerified=false`,
  `readyToInstall=false`,
  `authorizedToMutateProduction=false`.
- The result does not populate or satisfy all process or storage claims in
  the G2-B1 contract, nor does it serve as a root maintenance consent token.

## Critical uncovered failure modes

1. Linux mount namespaces, bind aliases, renamed old Runtime slots,
   memory-mapped file references, and other inode-only aliases are not
   resolved by textual `/proc` symlink matching. A reported zero cannot
   be interpreted as no inode holders.
2. A process can create or release references after the second scan.
   Neither a second sample nor an advisory lock prevents new MCP, deploy,
   backup or shell activity. G2 must **first** establish an actual
   operator-controlled maintenance barrier outside active Runtime.
3. `/proc` permission failure, process churn, kernel-only accessibility
   and inconsistent device namespaces must be treated as BLOCKED at the
   later **trusted** operator gate. The scanner does not certify that
   its own source, caller, procfs mount, observation window or identity
   was independently authenticated.
4. Root-only inspection of actual Release State and 17/17 Runtime members,
   Docker inspect of image/mount identities, systemd state, current
   backup/Kit and crypt remote independent readback remain outside this
   component. No service state is changed.

## New source/test and next gate

- Added `ops/runtime/proc_reference_census.py`, **not** a member
  of the trusted 17-source Runtime bundle.
- Added `ops/runtime/tests/test_proc_reference_census.py` under the
  existing CI `api-checks` unittest discovery. Tests use only synthetic
  private `/tmp` proc directory structures: cwd/fd/root/exe,
  deleted refs, lookalike prefixes, unreadable/vanished process,
  PID birth changes, kernel tasks/zombies, and always-false authority.
- No changes to installed `ops/release/deploy_release.py`,
  `/home/ubuntu/backup-db.sh`, backup timer/service, sudoers,
  `ops/sanq-mcp/server.py`, Prisma, image release, or production.
- **G2-B2B still required:** isolate and independently pin the future
  root-private operator executable; inspect real `/proc` plus
  `fdinfo`, inode and namespace identities and actual service
  states under a proven maintenance gate; install only after approval.
- **G2-B3 still required:** long-term original Runtime Archive escrow,
  real create-only encrypted Kit storage + independent decrypt/readback,
  later clean reinstall exercise. S2 daily backup stays paused.

## Authorization and validation

No local tests/lint/build were executed per AGENTS.md. Any CI evidence
will be collected only after explicit review and PR approval.
Neither the B2A implementation nor its future CI success grants
permission to run it as root on the production VM, interrupt services,
modify sudoers, or install Runtime. Production status: **NO-GO**.
