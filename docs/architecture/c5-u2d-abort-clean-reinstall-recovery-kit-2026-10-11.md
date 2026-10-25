# C5-U2D — Abort & Clean Reinstall / Recovery Kit architecture amendment

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。

## 当前替代关系

本篇旧 crypt/Drive mandatory Kit / 故障主机自举 clean reinstall 已由 AWS 快照方案替代为本次更新默认恢复路线；保留原源码与历史合成证据，不再要求完成旧真实传输适配才推进更新。每日独立备份、配置/密钥 escrow 与新 Runtime 目标来源验证仍保留。

## 历史方案原文（本次更新已替代，非执行手册）

> **R0 现行口径（2026-10-17 Toronto）：**用户已批准 D1–D5 推荐方案；[Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 统一当前决策、门禁与执行顺序。**R0 DESIGN FROZEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。设计批准不等于真实安装、恢复验收或生产命令授权；S2 暂缓不表示现役备份 timer 已停。

**Status: D1–D5 APPROVED / R0 DESIGN FROZEN / S1 MERGED CI GREEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**

> 2026-10-11 S1 implementation record:
> [Protected Config Snapshot / old-plan retirement](./c5-u2d-s1-protected-config-snapshot-2026-10-11.md).
> S1 merged as PR #2789 / dev merge 7723262e (CI #7164 PR and #7165 dev green).
> G2-A PR #2791 已合并；它提供历史 Archive 来源核对契约，
> 不提供真实特权安装器或远端 Kit 适配。See
> [G2 architecture contract](./c5-g2-trusted-runtime-contract-2026-10-13.md).
> No sudoers, backup service, live Runtime or production install is authorized.  
**Date:** 2026-10-11 (America/Toronto)  
**Read-only baseline:** `origin/dev` `ffae689ec332d0499cefd9957273f6635041780d` (PR #2785 merged).  
**Change type:** 已批准的 R0 恢复/备份设计合同；尚未部署，不推导 Guest/root 或生产执行权限。

> **2026-10-17 documentation-only navigation:** prior U2D design, 2B2-B root-lab evidence and the retired 2B2-C cold plan are consolidated in [Runtime historical decisions and evidence](./Runtime历史决策与证据索引.md), including their fixed-version originals and explicit limits. [Inherited Runtime constraints](./Runtime交付与安装约束.md) preserve the surviving rules. This adds no implementation, acceptance PASS or production authority.

## 1. 已批准决策与目标

已批准 D5 的现行策略是 **Abort & Clean Reinstall**： if host power loss, process crash or another exceptional interruption occurs **during Runtime installation/update**, abandon that installation transaction outright. Do not resume the prior transaction, replay intermediate journal phases, auto-rollback the application/database, or require restoration of the exact prior filesystem-transaction execution point. After independent inspection and authorization, reconstruct a complete, trusted Runtime **from external GitHub/GHCR publication material and encrypted off-VM recovery configuration** in a new private location, then install and verify it as a **new transaction**.

This is a manual incident-recovery tradeoff: longer downtime is acceptable for an exceptionally rare event; silent unattended repair is not a requirement. **An ordinary VM restart outside an active Runtime installation is NOT a trigger for mandatory Runtime reinstall.** Application deploy/rollback remains under `ops/release/deploy_release.py`.

Retain the original C5 final objective: an operator-triggered, controlled one-command GHCR application release path with no production `/home/ubuntu/sanq-app` source checkout dependency, and separate approval for Runtime source updates. No new permanent root launcher/daemon, open sudo interface, symlink-based active Runtime, arbitrary MCP root execution, or application/database cutover is proposed.

本修订现为**已批准且冻结的 R0 恢复合同**。旧 U2D、2B2-B 及 2B2-C 保留历史事实与原 `PASS`/`NOT EXECUTED`。D5 已批准取消三检查点冷掉电取证作为 v1 默认门禁；进程中断、重复中断、独立外部重装仍必须完成，掉电持久性仍 NOT VERIFIED。

## 2. 已有事实与已批准但尚未实现的增量

| Area | 仓库核对/历史现场事实（不是本次重新检查主机） | R0 已批准增量；NOT deployed |
| --- | --- | --- |
| Daily scheduled backup | `sanq-backup.service` executes `/home/ubuntu/backup-db.sh` as `ubuntu`; project-config tar currently contains **only** `.env` and `docker-compose.yml` and uploads to `gdrive_secure:config` | Include independently validated root-only release state and C4 marker in a safe daily configuration snapshot |
| Dynamic identities | `.env` is ubuntu:ubuntu `0600`; `.sanq-release-state.json` root:root `0600`; `.sanq-backup-layout-activated` root:root `0644` | A restricted root component is required to read the protected state; **never** broaden permissions to make `ubuntu` read it |
| Runtime publication | Strict 17-member `SOURCE_FILES` + `runtime-release.json`, paired API/Web digests, independent GitHub publication status | Ensure at least one verified, durable off-VM original Runtime Archive plus its external provenance remains obtainable even after CI artifact expiry |
| Published artifacts | `publish-images.yml` uploads `sanq-runtime-<SHA>` artifact with **90-day** retention | Independent approved long-lived recovery retention / publication proof policy; do not imply GitHub artifacts are perpetual |
| Existing U2D handoff | Lab-only `offline_root_private_installer.py` rejects unfinished journal/occupied recovery slot; no production-capable root installer | Separate, independently authenticated clean-reinstall incident path, without relaxing ordinary install's fail-closed checks |
| Off-VM crypto | `gdrive_secure` is rclone crypt, and the backup runbook documents separate encrypted crypt-config escrow | Prove the recovery operator can independently retrieve/decrypt/read back each Recovery Kit, without relying on the failed Runtime |

The production U2C point-in-time source identity was `a84b72007e6b4e82c981101e56c897355757c0ff`, with application images `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`. **Runtime source SHA and application image SHA are different identity dimensions.** These values are audit history, not an approved future install target.

## 3. Chosen high-level direction: option 2 primary + option 1 supplementary

### Option 2 (PRIMARY): mandatory pre-install Recovery Kit

After independent operator consent for a specific Runtime source update, and **before any active-Runtime mutation**, establish a maintenance/quiescence barrier, freeze the selected versions and capture a complete off-VM `Runtime Recovery Kit`. Upload and independently **read back, decrypt and verify** the kit from `gdrive_secure`; only a matched, fresh, explicitly verified kit for the exact operation can satisfy the install preflight. A local archive, rclone upload exit 0 or remote listing alone is **not** an acceptable PASS. Failure at any step: **BLOCKED / no Runtime modification**.

D3 冻结逻辑用途为 `gdrive_secure:runtime-recovery/<txid>/`，不是已创建的生产目录。R3 首先验证真实 txid/精确对象 ID、create-only、冲突拒绝、无 update/delete 及完整独立解密读回；优先验证 Drive 预分配 ID 与既有 rclone crypt 格式组合。检查后上传或单独 `copy --immutable` 不足；不自研密码算法。适配器不提供对账户管理员的 WORM 保证；现行要求不能满足则停止并另审后端/权限/成本/依赖，不降低合同。外部 provenance 独立核对；current/previous/目标与未关闭事故恢复集无自动 prune，不套 daily 30 天或 GitHub Artifact 90 天清理。

The Kit must at least carry:

1. **Exact dynamic configuration bytes and metadata:** `.env`, `.sanq-release-state.json`, `.sanq-backup-layout-activated` and `docker-compose.yml`; record file type, size, owner, group, mode, timestamp, consistency checks, and protected hashes without printing secrets.
2. **Identity/compatibility record:** frozen `main` source SHA, Runtime `runtime-release.json`, exact 17-member allowlist, current/target archive digest and external seal/publication identifiers, paired GHCR API/Web image digests, actual application current/previous state, `SANQ_IMAGE_SHA` equality, fixed `sanq-app` project / `sanq-app_pgdata` volume and `/srv/sanq/uploads` bind identity.
3. **Recoverable original Runtime Archive byte stream**, either included in the off-VM kit or independently proven retrievable from an approved long-lived external source; **manifest/self-hash alone is not origin authentication**. Preserve trusted pinning for the independently delivered, root-private recovery executable, which is not a bundle member.
4. **Recovery evidence:** transaction id, source-of-truth provenance, snapshot capture/readback time, off-VM object names and immutable-in-purpose verification record, non-secret PASS/FAIL fields, and backup/key escrow retrieval prerequisites.

Production database dumps, uploads files and Nginx/SSL archives stay under their existing separate DR backup ownership; a Runtime Recovery Kit does **not** silently replace those backups or restore business data. The off-VM Kit must not store raw keys in plaintext logs, Git, status descriptions or user-visible audit reports.

### Option 1 (SUPPLEMENTARY): enrich scheduled daily configuration backup

**D4：S2 在首版 v1/C5 验收后独立推进，不作为首次更新或 recovery 激活前置。** 首次更新仍必须证明现役日常备份健康、独立 DR 可用与本次 mandatory preinstall Kit 完整；S2 暂缓不停止现役 timer。以下 daily helper/sudoers/接线均为后续范围。

Preserve the existing daily job's trigger, DB/Uploads/Messaging/Nginx duties and existing `gdrive_secure:config` purpose. Design a **shared restricted snapshot owner** used by both modes; daily snapshots should additionally include the exact protected release state and C4 marker alongside `.env` and Compose. Keep existing historical daily objects/retention until a separately approved policy change. The daily snapshot is an availability fallback, **not a guaranteed latest/quiescent reinstall input**.

Daily capture must fail closed on unsafe file types/modes, release state `pending`, `.env`/release-state SHA mismatch, conflicting installed/running image identity, or concurrent deploy/update, and must not overwrite the last verified backup on failure. Existing unrelated backup work should still report its own accurate result; never mark an incomplete full scheduled run successful. The shared capture component must not invent source-of-truth values or silently normalize incomplete state.

### Shared component, distinct authority

The two modes should reuse validated file enumeration, bounded FD-anchored reads, ownership/mode/regular-file checks, metadata/consistency tests, isolated archive creation, encrypted upload and remote readback logic. **Do not let the unprivileged daily `ubuntu` service read root:root `0600` state by loosening permissions.**

Audit a narrowly constrained, root-owned helper for fixed paths and fixed destination classes. Daily invocation may require a reviewed narrow sudoers entry; authorized pre-install invocation must bind to the separately approved root-private operator and transaction id. Neither entrypoint accepts arbitrary file paths, arbitrary URLs or shell fragments, expands MCP permissions, installs Runtime, or can amend deployment `.env`/state. Existing `sanq-backup-protected-nginx` is a **pattern only**, not an authorization to extend its Nginx-only sudoers scope. New helper delivery, service wiring and root trust boundary need separate approval.

The daily and pre-install modes have different concurrency requirements: a scheduled backup must coordinate or fail closed when deploy/state writes overlap; pre-install must run under a proven maintenance barrier covering `deploy_release.py`, backup service/timer, MCP processes, shell cwd/fd and Docker/Compose reads. A new advisory flock alone does not stop legacy non-participants. Freeze and double-check dynamic bytes and application identities before and after backup; full cross-resource atomicity cannot be claimed without coordinated exclusion.

## 4. Trusted clean reinstall after an interrupted Runtime transaction

1. **ABORT** the old transaction on interruption. An independent trusted operator procedure prevents re-entry, records the incident out of the untrusted active Runtime, quarantines remaining installed/candidate material for investigation, and never resumes/patches the old journal. Do not automatically delete old assets.
2. **Inspect and separate faults:** verify host filesystem health, preserved PostgreSQL/Uploads/backup identities, actual running containers and potential automatic Docker restart. If the disk/VM or business data is damaged, switch to the established full off-VM disaster recovery runbook instead. No blanket database restore on a Runtime incident.
3. **Select a coherent external recovery point:** an independently verified Kit (pre-install kit preferred; daily backup only after explicit stale-state review), exact trusted GitHub/GHCR source and digests, source/application compatibility, live or separately authenticated externally retained dynamic state. A backup snapshot may be older than Clover/Uber credential changes, release-state or running images. **Never copy outdated `.env` or guess `previous`, `current` or C4 activation from an archive.** Missing consistency proof = BLOCKED.
4. **Prepare a fresh Runtime**, from a trusted executable/source and original verified Archive in a new root-private, non-user-writable area, checking full 17-member inventory and ownership/modes. The recovery path cannot execute a script from the damaged active tree, an ordinary checkout or a writable staging path.
5. **Perform a new separately authorized install** under reviewed cross-process maintenance exclusion, without modifying `sanq-app_pgdata`, `/srv/sanq/uploads`, application images, database migrations or hosted backup records. A second interruption means abandon this new attempt and start over from external sources.
6. **Validate before closing:** active Runtime hash/manifest, dynamic config and current application identities, Compose/DB/Uploads mounts, backup helper/timer compatibility, all service health and provider/worker restart safety. Only then independently close the incident and restore the original maintenance service/timer state.

Do not equate 'a crypt-encrypted backup exists' with 'this is the latest valid production state'; integrity, provenance, recency and compatibility are separate gates. The C4 marker is **evidence of prior activation, not authority to skip C4 layout/storage checks on restore**.

## 5. R0 已冻结验收合同（NOT a claim of PASS）

**Required before production-capable recovery implementation is activated:**

- 首次 v1 更新前：现役 daily backup 健康与独立 DR 可用。新增 daily helper 的 root `0600` 读取、固定文件包、crypt/读回、retention/failure isolation 和并发/pending fail-closed 属于 **v1/C5 后 S2 自身验收**，不再阻塞首次 mandatory preinstall/recovery；不放宽权限。
- Mandatory pre-install: source/manifest/digest match, running application-state coherence, full remote readback, expired artifact fallback, prior successful Kit preservation, remote failure/stale/partial/corrupt kit => **no active Runtime write**.
- Recovery: interruption during prepare and across active handoff, occupied prior journal/candidate, independently selected external recovery point, same-version clean reinstall, fresh secret preservation, cross-process exclusion, and repeated interruption => **new isolated transaction, never resume/overwrite**.
- Root/ownership: malicious symlink/hardlink/race, FD-safe file reading/writing, path and snapshot isolation, fixed root helper arguments/permissions, sudoers lint and refusal, authentic reviewed installer source.
- Run on a genuinely isolated Linux ext4 VM with synthetic credentials plus CI unit tests; demonstrate at least one **complete end-to-end external-source restore** without any damaged Runtime input. Demonstrate a failed/incomplete snapshot is not marked recoverable. Production source handoff and legacy checkout retirement retain independent deployment approval and verification gates.

D5 已批准：旧三检查点冷掉电取证退出首版默认验收，原 NOT EXECUTED 与历史证据不改写、不删除。真实物理/虚拟掉电持久性仍 **NOT VERIFIED**；SIGKILL 不等价掉电。必须完成 R0 A14–A17 的进程中断、重复中断和独立外部新事务重装；未知状态停止，磁盘/系统损坏转完整 DR。若将来要证明掉电落盘保证，另开明确范围。

## 6. 实施队列与权限边界

R0 已完成设计/文档收口，下一批 R1 真实执行基线/依赖与见证；R2 维护禁入、R3 真实 Kit、R4 安装/独立重装、R5 同候选矩阵和独立 C8 交付，详细次序与必填字段以 R0 为准。此前“下一对话只读审计”为当时任务，不能覆盖当前已批准路线。C2 Guest 可恢复环境与精确 root 命令仍需先行满足；本文件不提供执行授权。

不扩 17 成员、不改变 Prisma/schema、app release owner、现役 backup/VM 服务或云配置。外部 helper/sudoers/script/service 的安装和兼容性仍单独做 C4-style 审查；不能以 R0 或 S1 代替。

## 7. 当前结论

`D1–D5 APPROVED / R0 DESIGN FROZEN / S1 MERGED CI GREEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED`。

S1 PR #2789 与 G2-A PR #2791 已合并；B4B-3A PR #2848 / CI #7315 已通过，但仅为合成清单校验。本次没有真实执行闭包、远端 Kit、安装或 daily cutover 验收。C1–C8 仍按 R0 登记，不把源码/CI 当生产 PASS。旧冷掉电持久性仍 NOT VERIFIED；不删除 Mac/VirtualBox 或原始证据。
