# C5-G2-B2B4 — Live process cwd/fd evidence in a disposable lab

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**Date:** 2026-10-13 America/Toronto  
**Baseline:** `origin/dev@618f599d409b6670fdaf2c2d3ff9c3d7da5096fb`, G2-B2B3 PR #2796 CI #7180 all seven green.  
**State:** LOCAL SOURCE FOR REVIEW / TEST NOT RUN / ISOLATED VM ROOT ACCEPTANCE NOT EXECUTED / PRODUCTION NO-GO.

## What B2B3 proved and what this increment adds

B2B3 established that a **separate real Linux process** holding the
fixture's `flock` blocks the cooperating rehearsal operator. It did **not**
show how a non-cooperating process can keep a directory or source file open
despite that lock.

B2B4 adds `ops/runtime/isolated_proc_holder_probe.py`, a narrowly scoped,
read-only observer of **one invoking-user-owned PID** and a direct
`/tmp/sanq-g2b2b-lab-*` fixture:

- Independent validation of fixture owner, group, 0700 directory, stable
  directory dev/inode, exact 0600 private marker and no symlink/hardlink marker.
- PID must be a strict integer from 1 to 2^31 - 1 and the process must
  belong to the observer's real effective UID. Does not inspect another user,
  production process, or configurable arbitrary Runtime path.
- Reads real kernel `/proc/PID/stat` process start ticks before/after,
  `cwd`, `exe`, `root`, and at most 8192 numeric `fd` symlink targets.
  Records only sanitized reference-kind labels, process PID, and inert booleans;
  never emits file names, secrets, cmdline or process environment.
- Incomplete inspection, an exited/reused PID, unreadable procfs or changed
  fixture identity is **blocked**, not interpreted as no reference.
- Reports `rootLevelProcessCoverageVerified=false`,
  `mountNamespacesAndInodeAliasesVerified=false`,
  `crossProcessQuiescenceVerified=false`,
  `readyToInstall=false`, `authorizedToMutateProduction=false`.

No interpreter entrypoint, root/sudo activation, service operation,
process signal, Docker action, maintenance-state write, deployment or
production permission is added. The existing Runtime's exact 17 source
members remain unchanged.

## New CI fixture tests

`ops/runtime/tests/test_isolated_proc_holder_probe.py` launches only
ordinary Python child processes in a private `/tmp` fixture, holding:
both cwd and open fd; open fd with cwd elsewhere; and neither reference.
It verifies that real kernel procfs observations detect both kinds of
noncooperating references, and a zero result **still does not authorize**
installation. Invalid PID, non-fixture paths, loosened permissions, marker
tamper and process exit are rejected.

These are CI Linux tests in the existing `api-checks` Runtime unittest
discovery; per AGENTS.md they are **not run locally** at this review stage.

## Independent VM acceptance still needed

A real, isolated Ubuntu/ext4 guest acceptance requires separate source
pinning to a root-owned location, read-only UID/mount verification,
controlled disposable systemd units, operator-managed actual exclusions,
and independently verified restoration of initial enabled/active timer state.
Full `/proc` owner/root/mount-namespace/inode/mmap scan, unknown process
blocking, real cross-process maintenance and failure injection are **not**
satisfied by this one-PID fixture test. It is not an operator execution
script and must not be adapted to `/opt/sanq/runtime` without a new
architecture review.

Before running guest root/systemd operations, record VM/snapshot,
pin the exact reviewed source commit/SHA256 and review the exact root
commands. Those actions require independent specific operator approval;
the present authorization permits isolated source development, not production
root privileges. Never run a user-writable Git checkout with sudo.

**G2-B3 encrypted off-VM original Archives and create-only Recovery Kit
remain blocked. S2 daily backup stays paused.**
