# C5-G2-B2B — Isolated root-private operator barrier rehearsal

## 2026-10-18 失败恢复行为修复（现行源码；下文保留历史实验）

**源码/回归测试已获远端交付授权，本地测试及 CI 尚未运行、未部署；C5-G2 NO-GO。** 用户指出旧实验在 `finally` 无条件调用 `host.restore(original)`，会在排他失败或中断后请求重新启动合成消费者。本批按 A 类内部原子修复，将恢复移出失败路径：`suspend`、第一/第二次观察或排他核验失败，以及可捕获的 `KeyboardInterrupt/SystemExit`，均保留原始异常为 cause，不调用自动恢复；仅完整成功的合成实验执行原状态恢复并核验。失败前未停止或只停止部分消费者时，只能声称“不请求恢复”，不能声称已建立完整冻结。成功清理时的恢复失败仍拒绝成功；不为真实更新提供恢复或放行能力。

聚焦测试覆盖忙消费者、第二次核验失败、非法声明、部分停止失败、两次观察的异常/中断；原成功恢复、恢复失败、来源、路径权限、锁竞争和 Bundle 排除护栏保留。权威验证仍为 `.github/workflows/ci.yml` 的 `ops-checks` / Runtime unittest discovery，未执行不记 PASS。

本函数仍仅用于指定 `/tmp` 合成 fixture，不能作为新 Runtime 更新入口。新流程须持续维护至整个安装、独立验收和必要外部对账完成；仅成功时准确恢复原策略，事故保持冻结，取消维护需另满足现行合同。清理 FD/锁不是解除生产维护；真实停止、跨重启禁入、持久化原策略、AWS 快照和恢复尚未在此实现。历史实验/CI/实测结果只对应原提交，不因本次修复追认新版通过。下面 2026-10-13 原始行为说明保留为历史记录。


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
