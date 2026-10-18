# C5-G2-B2B — Isolated root-private operator barrier rehearsal

> **R0 现行口径（2026-10-17 Toronto）：**D1–D5 已获用户批准并冻结；当前决策、进度、C1–C8 门禁与 R0–R5 队列以 [Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 为准。本文其余内容保留发表/取证时的状态：`LOCAL`、待审、未运行及“下一批”均是当时记录，不能覆盖 R0 当前进度；原始 PASS / NOT EXECUTED 与适用边界不变。旧命令不获得重新执行授权。旧 S12/冷掉电要求按 D5 退出首版默认门禁，进程中断及独立重装仍为必验，掉电持久性仍 NOT VERIFIED。`S2 PAUSED` 指日常配置扩充/接线暂缓，不表示现役备份 timer 已停止。**R0 DESIGN FROZEN；C5-G2 NO-GO。**

**Status:** LOCAL SOURCE REVIEW ONLY / NOT PRODUCTION READY / NO LIVE HOST TEST.  
**Baseline:** dev `223c25e57416feb0b35afb43544018b0633c0640`; related [B2B readiness audit](./c5-g2b2b-root-operator-readiness-audit-2026-10-13.md).

## Implementation in this slice

Added `ops/runtime/isolated_maintenance_operator.py`, an isolated **synthetic adapter-only** rehearsal. The only writable file is a lock in a directly owned `/tmp/sanq-g2b2b-lab-*` directory, mode 0700; no production paths may be supplied, and a marker must be owner-private. The source is opened via `O_NOFOLLOW`, checked as single-link private regular file, revalidated by descriptor/inode/mtime, and compared to the separately provided, exact SHA256; the source **is never executed**. No sudo, root escalation, systemctl, Docker, MCP, rclone, network or production invocation is present.

For each rehearsed transaction: acquire exclusive nonblocking lab lock → read and pin synthetic initial timer/service/MCP state → request **fake** host exclusion → require two passing normalized B1 observations (all known process counts zero) → restore original states, verify restored state → release lock. Any failed observation, source validation, competing lock or incomplete restoration is BLOCKED. Receipts never grant `readyToInstall` or `authorizedToMutateProduction`. Existing `ops/runtime/proc_reference_census.py` and `ops/runtime/preinstall_maintenance_contract.py` remain unchanged.

`ops/runtime/tests/test_isolated_maintenance_operator.py` covers fake exclusion, busy uncooperative process, original state restoration, failed restoration, source tampering/symlink/owner/mode, forbidden production target, and competing same-lab transaction. Tests use only synthetic observations and a temporary directory; there is no attempt to alter production services. GitHub CI `api-checks` owns discovery after user authorization for PR. Per `AGENTS.md`, no local lint/build/tests executed before review.

## What is NOT implemented or proven

The system currently has no root-installed operator, production service manipulation, cross-process quiescence, inode/mount namespace consumer exclusion, remote encrypted Recovery Kit, independently escrowed original Runtime Archives, or live deployment. Synthetic HostAdapter state restoration is **not** systemd restoration evidence. This slice changes no backup owner, sudoers, app controller, MCP permission, 17 Runtime archive member, schema or migrations.

**Next authorization gate:** a separately reviewed root-private observer/maintenance implementation for a disposable Linux VM with real systemd/process consumers, independent source installation and root permissions; full isolated ext4 root acceptance and power-loss recovery evidence must precede any production source deployment. If a true barrier requires editing installed Backup/MCP/Deploy coordination boundaries, stop and seek narrower authorization for those owners. S2 daily backup integration remains suspended.
