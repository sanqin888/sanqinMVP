# R2-A2 — Maintenance Fence 离线模型与失败测试

**日期：2026-10-23（America/Toronto）。状态：A2-1 SOURCE CI VERIFIED / 25 SYNTHETIC TESTS INCLUDED / DEV DELIVERY AUTHORIZED。**

基线为已合并 R2-A1 H14–H18 文档的 `origin/dev@64f9968f9e1dab2cbed2fc10390466a89afd6cb2`（PR #2916）；本批分支 `feat/runtime-r2a2-offline-maintenance-fence-20261023`。用户本次明确要求开始 R2-A2 的离线模型和失败测试，覆盖 [HOST-READ-002 §5 A2-1 / §12](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md)。用户审阅本地报告后已明确授权提交远端；现为 [PR #2917](https://github.com/sanqin888/sanqinMVP/pull/2917) → dev。源码提交 `8d2425d9a63112a795c1c73ca7ce18c04ea08165` 的 [CI #7482](https://github.com/sanqin888/sanqinMVP/actions/runs/39969268220) SUCCESS；后续仅补记本次验证，最终文档 head 的 Checks 和合并事件仍须另核，本文不提前声明它已合并。

**门禁不变：R2-C4 OPEN / AWS S01–S12 OPEN / R1-C1 OPEN / C5-G2 NO-GO / S2 DAILY EXPANSION PAUSED。** A2-1 源码准备不是完整 R2-A2 关闭，更不是生产 Maintenance Fence 已建立。

## 1. 所有权、迁移类别与本批边界

实现属于现有 Runtime/Ops `ops/runtime`。选择 **A 类内部原子切片**：纯新增离线模型，唯一执行消费者是同批 synthetic unittest；没有旧持久化数据、公开 API 或独立部署消费者需要切换。v1 字节文档仅为候选持久化意图，未安装文件、创建数据库或接入任何真实持久化层，后续使用者不得据此越过部署/权限审阅。

| 文件 | 职责 |
| --- | --- |
| `maintenance_fence_contract.py` | 原策略、writer/startup registry、准确对象/分类、owner/txid/epoch/request/registry 绑定、本机/离机记录回执、完整观察合同与期望冻结 metadata |
| `maintenance_fence.py` | 不可变意图、双回执关联、连续新鲜观察、事故记录、精确 pin 重载复核和始终拒绝的 verdict |
| `tests/test_maintenance_fence.py` | 25 个 unittest 方法，含多组参数负例；只用内存 Host 和两份 bytes 模拟中断点 |

内部依赖为 `maintenance_fence → maintenance_fence_contract → normal_runtime_launch`，模型也直接复用既有 `canonical/digest`。没有新业务 owner、跨上下文导入、SCC/cycle/债务或 scanner baseline 改动；源码静态审阅后同步 [依赖图](current-dependency-graph.md) 与 [工作日志](worklog.md)。不添加第三方包，不改 CI、锁文件、Prisma、旧实验实现或受保护 17 成员/Manifest。

## 2. 对象、原策略与保留分类

原始记录精确保存 `object_key/kind/name/native_id/identity_sha256/role/disposition`，以及容器原 `restart_name/restart_max_retry/active_state` 或 systemd/入口的原 `enabled_state/active_state`。identity 摘要应由后续 adapter 将 image digest、mounts、来源等实际元数据准确绑定；当前输入只是声明，模型不读取或认证这些事实。容器 ID 不接受名称替代；unit 使用完整准确名称。原始清单序列化为不可变 bytes，调用方后改对象/报告不能重写它。

| 分类 | 离线模型规则 |
| --- | --- |
| BUSINESS / STARTUP / BACKUP | CONTROL；期望容器 metadata 为 restart=no、retry=0、exited；期望受控 unit 为 masked/inactive，普通入口为 disabled/inactive |
| MANAGEMENT / SANDBOX / SYSTEM | PRESERVE；冻结观察必须与原策略/身份一致，不能批量 stop 或改 restart=no |
| Clover 开发隧道 | `sanq-clover-dev-cloudflared` 强制 SANDBOX/PRESERVE，保留原 unless-stopped；其实际 Host 网络隔离及 Mac 反向 SSH 可用性仍未验收 |
| Docker/SSH/socket/系统安全更新入口 | 已识别受保护名称拒绝 CONTROL 分类；系统任务默认保留，服务重启如何与维护协调留给后续 adapter |
| 未分类、重复 ID/名称、缺少覆盖或未知消费者 | 拒绝准入或生成 INCIDENT；不靠忽略对象/放宽分类通过 |

期望 metadata 不是可执行动作表；特别是 unit 的 masked 仅描述后续实现需要证明的禁入状态，本批没有安装 mask/drop-in/boot guard。静态原策略快照也不是完整 process census 或持续屏障。当前 SCOPES 仅约束输入必须声明覆盖 containers/systemd/cron/deploy-compose/backup-helpers/business-admission/management；声明齐全不证明真实清单全集已发现。其他用户 Cron、未知外部消费者等 R2-A1 缺口继续阻止生产实施。

## 3. 事务、状态与持久化意图

绑定包含准确 host、maintenance owner、transaction ID、正整数 epoch、request SHA256 和 registry SHA256。epoch 必须来自后续受信任的单调事务账本；这里不自行生成 epoch、不实现跨进程/跨实例锁、不认证 owner 或凭据。

| 状态 | 允许的离线推进 | 业务/安装判定 |
| --- | --- | --- |
| PREPARED | 原始清单及绑定已冻结；收到本机和离机准确回执，以及原策略/新业务禁入/外部事件保留/管理可用观察后，生成 FREEZING 意图 | DENY / BLOCKED |
| FREEZING | 当前意图双回执齐全，准确观察达到全部期望 metadata，才生成 FROZEN | DENY / BLOCKED |
| FROZEN | 以当前 state SHA 为 challenge，观察 sequence 单调 +1、同 boot/对象/策略、所有必需范围和保留入口一致，才接受下一次复验 | DENY / BLOCKED |
| INCIDENT | 保存首次失败类别、失败阶段、原清单和可用证据 pin；后续调用不覆盖首次事故、不继续旧事务 | DENY / BLOCKED |

每次意图包含 revision、previous SHA、观察 sequence、boot ID。两份 PersistenceReceipt 必须分别标明 LOCAL/OFF_HOST，并绑定同一 state、binding、revision、predecessor 和证据摘要；缺失、错事务、过期或两份本机回执不能替代双份。

**本批没有持久化实现。** receipt 只是候选 adapter 的相关联声明，不能证明 fsync、目录持久化、离机独立性、独占/CAS、不可回滚账本、断电可靠性或来源真实性。后续 adapter 必须在任何真实效果前完成受保护持久化与 CAS，且持续维持禁入；本模型的纯函数可被重复调用，不会因此成为真实事务准入器。模型也未对接 NormalUpdateFlow 的 StepCompletion，不将其原有合成 COMPLETE 提升为真实成功。

## 4. 失败、重载和拒绝语义

- 观察/回执失配、未知入口、缺少覆盖、凭据失效、管理通道不可用、禁入状态不明、外部事件未保留、boot 改变、对象重建或策略漂移，进入 INCIDENT。任何一次复验成功都不覆盖先前事故。
- TIMEOUT、TRANSPORT_LOST、INTERRUPTED、ABORT_EVIDENCE_UNAVAILABLE 可明确记录。只有固定原因码和证据摘要进入事故意图，不序列化异常原文或未知进程名/凭据。
- `reload_for_review` 要求外部另行供给准确 state pin 和 binding；拒绝截断、重复键、非规范 JSON、额外字段、伪造权限、错误 registry/request/owner/epoch。非事故旧状态重载后只生成 RESTART_REVIEW_REQUIRED 事故，不自动恢复推进；已事故记录保持首次原因和证据。
- 无 `restore_original_policies`、`release_business`、快照/安装/Host API 或 CLI；无失败 finally 恢复。准确原策略仅保留，未来 S11 恢复须独立实现与核验。
- 所有阶段的业务/启动/备份/安装/恢复/放行 verdict 均 DENY。PRESERVE 对象的停止/变更请求也 DENY；这不是撤销现实中的管理连通性，模型没有管理通道执行接口。
- 所有意图永远 `decision=BLOCKED`、`persistenceVerified/liveFenceVerified/authorizedToMutateProduction/readyToInstall=false`，即使 synthetic 状态名为 FROZEN。

## 5. 失败测试矩阵与真实验证状态

| 测试组 | 已编写的核心断言 |
| --- | --- |
| 原策略与身份 | 混合 restart/retry、inactive worker、disabled backup 原样留存；原清单/返回 dict 后改不污染 bytes |
| 分类与覆盖 | 未分类、重复对象/ID、缺 management、缺范围、不合法状态和布尔 epoch/retry 拒绝 |
| 双回执 | 缺本机/离机、重复位置、错 state/owner/epoch/revision/predecessor、旧回执拒绝 |
| 状态顺序与重复调用 | 不能跳过 PREPARED/原记录，不能重复 begin；INCIDENT 不续跑、不同 owner 不能推进或替他人 abort |
| 持续复验 | 旧 state challenge、重放 sequence、sequence 跳变、boot 变化、凭据/管理/外部事件不明转事故 |
| 漂移/绕过 | api 重建、身份变化、restart=always 复活、backup timer/deploy/rclone 重新启用、未知 Compose 入口拒绝 |
| 保留设施 | SSH/docker.socket/apt timer 与 Clover Tunnel 不被改为停用；任何保留对象漂移拒绝 |
| 中断/掉电 | 原清单写前、只写本机、两份写完、部分冻结、两份记录分叉；不发生自动恢复或自动放行 |
| 重载/证据 | 准确另渠道 pin、完整规范 bytes、不可伪造 authority、首次事故不被覆盖、摘要之外无原始错误泄露 |
| 架构 | 仅标准库/同 Runtime 内部导入，无 live IO/CLI/动态执行/恢复放行入口，仍在固定 17 Bundle 外 |

**实际状态：源码 `8d2425d9…` 的 GitHub CI #7482 SUCCESS。** ops-checks 实际运行既有 Runtime discovery，`Ran 559 tests in 6.990s / OK`，包含本批全部 25 个新测试；同作业 Release `Ran 45 tests / OK`，Runtime shell 语法检查通过。其余检查按既有 change-scope 成功或正常跳过，无 CI 修复、无工作流变更。MCP-workspace 仍未执行 lint/build/test 或依赖扫描，没有任何真实生产 Host/SSH/Guest/AWS/Docker 运行。 内存 Fake 的 crash 只验证模型分支和拒绝语义，不证明真实磁盘掉电、跨重启屏障或 AWS 恢复。

按 AGENTS.md §§1/4/10，MCP-workspace 未开放执行权限，初次实现曾停本地供审阅；用户授权后已由 GitHub Actions 实际执行。沿用既有 `.github/workflows/ci.yml` 的 ops_runtime → ops-checks：

```bash
bash -n ops/verify-runtime-readiness.sh
python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'
```

不新增或削弱工作流，不把静态审阅记为测试通过；最终 PR head 必需 CI 全绿才可合并 dev。无数据库迁移。

## 6. 下一步与退出条件

A2-1 本地源码/测试/多文档同步与源码 CI 已完成；远端交付已获授权。当前补记 #7482 实际结果，最终文档提交仍需本 PR head 全部必需 Checks 通过后才合并 dev，最终 head/merge SHA 以 PR #2917 事件为准。此源码 CI 只关闭离线模型的自动化验证，不关闭 R2-A2 全部子项或生产验收。

后续 A2-2/3 需分别审阅真实受限 adapter、准确持久化位置与权限/CAS/epoch 账本、Compose/deploy/backup 准入、受保护 systemd/boot guard 安装及撤回方案。A2-4 再对接现有 NormalUpdateFlow 并绑定 request/原策略/step completion/事故证据。任何涉及安装布局、固定 17 成员、root/sudo/MCP allowlist、systemd/Cron/容器策略、生产或 AWS 的变更，须说明影响、替代方案和测试后另获明确授权。S03/S09、独立救援 G06、PG/WAL/外部事件和同平台 AWS 恢复仍需真实验收，不能由本批合成测试推定。
