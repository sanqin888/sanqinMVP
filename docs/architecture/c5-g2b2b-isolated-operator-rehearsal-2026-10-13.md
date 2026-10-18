# C5-G2-B2B — Isolated root-private operator barrier rehearsal

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**Status:** LOCAL SOURCE REVIEW ONLY / NOT PRODUCTION READY / NO LIVE HOST TEST.  
**Baseline:** dev `223c25e57416feb0b35afb43544018b0633c0640`; related [B2B readiness audit](./c5-g2b2b-root-operator-readiness-audit-2026-10-13.md).

## Implementation in this slice

Added `ops/runtime/isolated_maintenance_operator.py`, an isolated **synthetic adapter-only** rehearsal. The only writable file is a lock in a directly owned `/tmp/sanq-g2b2b-lab-*` directory, mode 0700; no production paths may be supplied, and a marker must be owner-private. The source is opened via `O_NOFOLLOW`, checked as single-link private regular file, revalidated by descriptor/inode/mtime, and compared to the separately provided, exact SHA256; the source **is never executed**. No sudo, root escalation, systemctl, Docker, MCP, rclone, network or production invocation is present.

For each rehearsed transaction: acquire exclusive nonblocking lab lock → read and pin synthetic initial timer/service/MCP state → request **fake** host exclusion → require two passing normalized B1 observations (all known process counts zero) → restore original states, verify restored state → release lock. Any failed observation, source validation, competing lock or incomplete restoration is BLOCKED. Receipts never grant `readyToInstall` or `authorizedToMutateProduction`. Existing `ops/runtime/proc_reference_census.py` and `ops/runtime/preinstall_maintenance_contract.py` remain unchanged.

`ops/runtime/tests/test_isolated_maintenance_operator.py` covers fake exclusion, busy uncooperative process, original state restoration, failed restoration, source tampering/symlink/owner/mode, forbidden production target, and competing same-lab transaction. Tests use only synthetic observations and a temporary directory; there is no attempt to alter production services. GitHub CI `api-checks` owns discovery after user authorization for PR. Per `AGENTS.md`, no local lint/build/tests executed before review.

## What is NOT implemented or proven

The system currently has no root-installed operator, production service manipulation, cross-process quiescence, inode/mount namespace consumer exclusion, remote encrypted Recovery Kit, independently escrowed original Runtime Archives, or live deployment. Synthetic HostAdapter state restoration is **not** systemd restoration evidence. This slice changes no backup owner, sudoers, app controller, MCP permission, 17 Runtime archive member, schema or migrations.

**Next authorization gate:** a separately reviewed root-private observer/maintenance implementation for a disposable Linux VM with real systemd/process consumers, independent source installation and root permissions; full isolated ext4 root acceptance and power-loss recovery evidence must precede any production source deployment. If a true barrier requires editing installed Backup/MCP/Deploy coordination boundaries, stop and seek narrower authorization for those owners. S2 daily backup integration remains suspended.
