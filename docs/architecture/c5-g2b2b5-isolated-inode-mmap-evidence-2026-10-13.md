# C5-G2-B2B5 — Inode-alias and mmap evidence, isolated Linux only

> **R0 现行口径（2026-10-17 Toronto）：**D1–D5 已获用户批准并冻结；当前决策、进度、C1–C8 门禁与 R0–R5 队列以 [Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 为准。本文其余内容保留发表/取证时的状态：`LOCAL`、待审、未运行及“下一批”均是当时记录，不能覆盖 R0 当前进度；原始 PASS / NOT EXECUTED 与适用边界不变。旧命令不获得重新执行授权。旧 S12/冷掉电要求按 D5 退出首版默认门禁，进程中断及独立重装仍为必验，掉电持久性仍 NOT VERIFIED。`S2 PAUSED` 指日常配置扩充/接线暂缓，不表示现役备份 timer 已停止。**R0 DESIGN FROZEN；C5-G2 NO-GO。**

**Date:** 2026-10-13 (America/Toronto).  
**Base:** `origin/dev@0876ae2a176565c5f6ba8390f8e7a132e1a9b1e8` (G2-B2B4 PR #2797, CI #7182 7/7 success).  
**State (updated 2026-10-13):** MERGED PR #2798, head `45eaf2086197b348d427d90450075813e1dfc02a`, dev squash `ba27dc3d08c8202d77ed403b7c10409be228da43`, CI #7184 all 7 jobs PASS / independent root VM not tested / PRODUCTION NO-GO. S2 paused.

## Gap demonstrated after B2B4

A textual `/proc/PID/fd` or `cwd` target match misses a live
reference to the **same inode** opened through a hardlink outside
the designated Runtime directory. A file descriptor may also close
while an `mmap` mapping retains the inode. A zero path-reference
count is therefore not proof of quiescence.

## This slice

`ops/runtime/isolated_inode_reference_probe.py` adds an independent,
read-only, **single lab file / single same-UID PID** observation:

- Exact fixed sentinel `probe.txt` inside the previously established
  direct, private and owned `/tmp/sanq-g2b2b-lab-*` fixture.
  No arbitrary path, PID owner, production Runtime, or CLI is accepted.
- Anchors sentinel identity to `(st_dev, st_ino)`, checks regular
  0600 file, identity/owner, allows multiple links **specifically** to
  test alias detection; refuses symlinks.
- Scans bounded `/proc/PID/fd` using `stat` to compare referenced
  inode, including when the path text is outside the fixture, and
  bounded `/proc/PID/maps` device:inode fields for file-backed
  mappings (including after descriptor close/unlink).
- Checks PID start ticks before/after, fixture and sentinel identity
  before/after. Unreadable data, malformed fields, race or budget
  exhaustion are BLOCKED, not a zero-result.
- Emits only sanitized boolean holder flags and PID, not names, maps,
  links, environment or file contents.

New `ops/runtime/tests/test_isolated_inode_reference_probe.py`
uses **unprivileged** real Linux child processes to verify (1) external
hardlink open file descriptor detectable by inode but **missed by**
the previous path-only check; (2) an `mmap` through an outside
hardlink that is then unlinked, leaving no open user fd; (3) no reference
is still never install authority; and (4) incorrect UID/paths/PID,
symlinked sentinel, exited PID and forbidden interfaces block.

All tests are under existing Runtime `unittest discover` in GitHub
`api-checks`. As required by AGENTS.md, **no local test or build** was
run before user review.

## Explicit residual limitations

This is intentionally **not** a global inode or mount-namespace census.
It does not scan all files of a Runtime tree, hidden mount aliases,
other UID/PID namespaces or new processes after the observation.
The B2B5 receipt **always** records:

- `rootLevelCoverageVerified=false`
- `mountNamespaceAliasesVerified=false`
- `newConsumerExclusionVerified=false`
- `crossProcessQuiescenceVerified=false`
- `readyToInstall=false`
- `authorizedToMutateProduction=false`

No root command, systemd, Docker, sudoers, backup, deploy, MCP,
Runtime update, off-VM recovery, 17-member allowlist, dependency or
database migration change. S2 Daily Backup remains paused.

## Next gate

A separate independently reviewed **disposable ext4 guest** root-owned
source and synthetic systemd barrier exercise is still required:
identify guest baseline/snapshot, approve exact commands, freeze
read-only host evidence, then test stale/noncooperating consumers and
restoration with fault injection. Reaching true cross-process exclusion
may require a new scope-specific authorization for production owner
coordination; offline green tests cannot authorize production entry.
