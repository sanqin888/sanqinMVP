# C5-G2-B2B2 — Independent process census corroboration

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**Date:** 2026-10-13 America/Toronto  
**Baseline:** `origin/dev@9fdff22f1df8363bf8da98604648f663ffc50119`; prior B2B PR #2794 merged, CI #7176 seven of seven green (initial CI #7175 failed and was fixed).  
**Status:** LOCAL SOURCE REVIEW ONLY / NO ROOT HOST ACTION / NO PROD INSTALL / S2 PAUSED.

## Scope and design

`ops/runtime/isolated_maintenance_revalidation.py` is an offline **negative-only** two-census corroborator. It checks exact result shape, path identity, most importantly zero Runtime-reference PID and zero unknown PID in **both** G2-B2A-style bounded process census reports. It validates count consistency, PID type/uniqueness/ordering, untrusted privilege flags, and missing/extra fields. If a reference exists in either report, the condition is blocked. It does not accept a `clear=true` token.

The only output after internally consistent observations is an explicitly untrusted receipt: `realHostObservationAuthenticated=false`, `mountNamespaceAndAliasesVerified=false`, `liveActorExclusionVerified=false`, `crossProcessQuiescenceVerified=false`, `readyToInstall=false`, `authorizedToMutateProduction=false`.

Added synthetic negative tests at `ops/runtime/tests/test_isolated_maintenance_revalidation.py` under GitHub `api-checks` Python unittest discovery. Per AGENTS.md, local tests have not run; source/diff status only until user review.

## Architectural limits and next gated stages

Two clear textual `/proc` scans **cannot prove** that a new MCP, Deploy, Backup or SSH actor is unable to appear afterward. Nor do they resolve mount namespaces, bind aliases, mmap, device/inode references or root authority. This component deliberately does not import/execute the B2B synthetic operator, host systemctl, Docker, live `/proc` or any privilege-capable function. The source remains excluded from the fixed 17-file Runtime Archive.

**G2-B2B3 independent isolated Linux ext4 acceptance** must test real root-owned source delivery, independent hashes, live disposable systemd units and non-cooperating subprocesses, complete /proc and mount identity observation, enforced stop/start barrier, fail-closed behavior and original state restoration. No such VM test has been executed under this change; no production root/operator installation is authorized.

The original historical Runtime Archives + true create-only encrypted off-VM Recovery Kit remain separate G2-B3, blocked; S2 daily backup remains paused.
