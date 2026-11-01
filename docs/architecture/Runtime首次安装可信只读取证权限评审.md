# FI-MAC-1B3b：首次安装可信只读取证与权限边界审计（待单独授权）

> 2026-11-01，本地方案审阅；**DESIGN_ONLY / NO_PRIVILEGE_CHANGE / NO_PRIVILEGED_IMPLEMENTATION / PRODUCTION_NOT_INSTALLED**。本文件不是安装、生产 SSH、sudoers 或恢复操作授权。

## 已验证的基线与问题

- FI-MAC-1B3a [PR #3078](https://github.com/sanqin888/sanqinMVP/pull/3078) 最终 HEAD `ab047022e11f97019aedff78cb0940b2de5e6164`，[CI #7856](https://github.com/sanqin888/sanqinMVP/actions/runs/41325902899) SUCCESS，squash 合并 `dev` `c71cd2eaa0c5c5847c14e14bcdb8379993ebb80e`。其 `review_preclear_records` **只校验调用方提供的七份原字节**，既不认证原件来自当前 VM，也不证明安装结束。
- VM `_private_session(create=False)` 要求 `euid=0`，从固定 `_state_parent()` 逐级 `O_NOFOLLOW` 打开 root 私有 `deploy-state`，依序独占、非阻塞取得 `jobs/.release.lock` 与 `plans/.prepare.lock`；这些锁打开采用 `O_RDWR`，所以“业务只读”不等于文件系统绝无写权限。不得将其改成不加锁的读取捷径。
- 原 `installation-runs/<installationId>` 是唯一事务目录；`intent.json`、`writers.json`、`task-originals.json`（以源码常量为准）、`recovery/{recovery.tar,recovery.json}`、`snapshot-review.json`、`snapshot-offhost.json`、`completion.json` 的集合及目录/文件指纹必须与**同一** sourceSha/retentionId/installationId 对齐。现有 `_installation_record_read`、`_installation_recovery_read` 等函数有固定名字、字节上限、非符号链接和首尾指纹核验，不允许临时用 `cat`、通配符、`find` 或不受限 `sudo` 绕过。
- `completion.json` 的 `phase=PREPARED_BEFORE_MARKER_CLEAR`，其 `verificationSha256` 绑定 VM 安装时内存 `facts`，离线七原件无法重建；它**先于** `maintenance/active.json` 删除。即使文件齐全，也不能证明清标记、`ExecStopPost`、systemd 原生退出或容器健康。
- `_installation_task_cleanup` 的成功分支只在 **原 cleanup 角色的准确 manager 代次** 下、持两锁、核完整目录、无维护 marker、原审计链后返回 `CLEAN_INSTALLATION_TASK_EXIT_OBSERVED`；其返回仍固定 `installationComplete=false`。这不是可供任意时刻重放的历史成功证书。`CollectMode=inactive` 可能回收 unit，`not-found` 不是任务成功或重试许可。
- 既有 Mac `sanq-install.sh status` 仅通过非特权固定 `systemctl show` 读取 11 字段；不能读取 root 私有原件。既有 `installation-submit` 是**写入型**高权限入口，绝不能伪装成查询命令复用或由 status 调用。

## 当前权限下能做什么、不能做什么

**无需新增权限可做**：审阅 GitHub CI 和源码、Mac 本地固定 SSH hostkey/Agent profile、现有非特权 systemd 状态、操作者合法持有的离线原件副本的 B3a 摘要结构核验，以及明确保持 false 的审阅报告。任何本地模拟、Mac 文件或来自操作者的副本都不具有 VM 原件身份认证能力。

**不能在现有权限下完成**：由 Mac 实时、可信、原子地读取 root 私有七原件、准确判断维护 marker 缺席与两锁状态、确认当前/历史 cleanup manager 代次、以及把这些证据合成为可信安装结果。若无新增**受审阅的 root 只读取证入口或既有独立授权的 root 操作员现场取证**，本阶段技术上被权限边界阻断；不应制造“纯 Python 校验即可完成”的假象。

## 待批准的最小 VM 侧只读取证设计（此处仅设计，不实现）

1. **入口与身份**：新增与 `installation-submit` **分离**的固定命令及最窄 sudoers 规则，必须另行审批；只接受准确小写 40 位 sourceSha、64 位 retentionId，拒绝自定义路径、host、命令、unit、用户、FD、模式和目录枚举。根解释器、受审阅 bootstrap 源及固定 SSH 目标仍须独立来源核验。非交互、无通用 shell、无 agent forwarding、无 root 终端。
2. **事务与原锁**：在原固定 root 名称空间下仅打开既有目录（不 `mkdir`）、以原顺序非阻塞取得两锁；锁不存在、忙碌、权限/指纹异常均 BLOCKED，绝不创建/替换锁。检查保留材料准确 source/retention，固定事务目录只有一个 64hex 名称且等于该 source/retention/任务原件所绑定的 installationId；未知残件、第二事务、部分记录、跨代次一律 BLOCKED，不选“最新”。
3. **原件一致性**：同一持锁会话中按原 FD/路径指纹校验七份原字节与 `task-originals` 关联；对 recovery 子目录严格校验成员和上限，复用 VM 已有完整恢复/snapshot/offhost 验证器，而非以 Mac B3a 部分哈希替代。任何重读不一致、硬链接、软链接、重复 JSON 键、超限或未知格式均 BLOCKED。重核所有目录、锁和关键文件指纹直至结束。
4. **标记与 manager**：同一持锁窗口中以固定 `maintenance` 目录检查 `active.json` **真实不存在**且无外来名字，首尾复核；按准确 `sanq-runtime-install-<retention>.service` 及 `InvocationID` / run/cleanup 身份核 systemd。若 unit 已被回收，不能用缺失状态推断零退出；如需要历史退出证明，必须另行设计可审计、不可重写、持久且同代次绑定的**后清标记收尾证据**，该持久合同变更需单独审批。
5. **输出最小化**：优先在 VM root 侧完成原件摘要与语义检查，只返回有界 canonical JSON 观察摘要、明确来源/事务代次、每项证据的来源与未证实项；不默认向 Mac 传输可能含私密配置的 `recovery.tar`、原数据库备份、密钥、token、环境文件或敏感日志。若确实要求 Mac 独立验原字节，需另审脱敏、保密、大小预算、传输加密、Mac 0700/0600 保留与删除策略；仅发送 VM 自述摘要也不等于 Mac 独立验证原件。
6. **退出与结论**：输出只能是 `STRUCTURALLY_CONSISTENT_UNDER_PRIVILEGED_READ`、`BLOCKED` 或 `UNKNOWN` 等**观察性**结果，不能提供 `canExecute=true`、`readyToInstall=true`、`restoreProven=true` 或生产安装授权。系统健康、当前应用/DB 状态、发布镜像/来源、真实 AWS 快照、离机恢复能力需分开实测；无历史 cleanup 终态证据时保持 `installationComplete=false`。

## 需要用户单独授权的具体变更及影响

- **A：新增固定 root 只读取证入口与 sudoers allowlist**：属于现有权限边界扩展；需审阅准确命令 argv、可执行文件所有权/权限、源码/解释器来源、拒绝任意路径/参数、锁/读取副作用、超时、输出脱敏、生产部署方式、撤销和回滚。授权开发该入口**不等于**授权部署生产或执行安装。
- **B：如需可信历史成功结论，新增持久后清标记/cleanup 终态合同**：会改变持久审计 schema/语义与 VM 安装器写入顺序，须另行设计原子性、崩溃窗口、重放/重启/重试语义及来源证明；不能追认旧事务为成功。可选择只报告 UNKNOWN 并由现场独立核查代替新增持久合同。
- **C：现场读操作**：即便 A/B 经代码/CI 审阅，首次对生产 VM 运行、导出证据或进行首次安装仍需分别明确批准；禁止把 CI 通过当作生产授权。

## 替代路径与取舍

- **方案 1（最小权限变更，推荐先评审）**：保持当前 Mac status + B3a 离线审阅；由有权 root 的操作者在获批准的维护窗口，用受审阅的**现有**现场流程人工核对，不新增公共 sudoers。优点是本次不扩权；缺点是无法提供 Mac 自动可信历史取证，也不能据此自动判安装成功。
- **方案 2（受限新查询入口）**：按 A 实施固定 VM root 只读报告器，保留原两锁及原件验证；可提高准确性，但引入新的 root 可调用面、数据泄漏/TOCTOU/锁竞争风险。只有独立权限审查后才能开始。
- **方案 3（持久后清标记终态）**：在 B 基础上实现长期可核的后置审计，解决 unit 回收后缺少历史终态证明；改动最深，必须独立设计 crash consistency 和恢复，不是 B3a 哈希模型的自然延伸。

## 预期负向验证与放行门禁（均未执行）

测试需覆盖：无 root/无既有锁、锁占用、锁 inode 被替换、祖先/目录/文件软硬链接或权限漂移、第二事务/未知文件、错 source/retention/installationId、部分/重复/篡改原件、超限 archive、marker 存在或检查中重现、manager 错代次/已回收/退出 UNKNOWN、cleanup 失败、回执声称 true、运行中容器/健康不可证、输出泄漏敏感字节、超时/SSH 断连/异常时绝不自动重试或清理。Mac 3.14.10、VM 3.10、Runtime/C1 离线 CI 均需按 `.github/workflows/ci.yml` 重新通过；随后另行做真实 Mac/VM 只读权限与故障验证。**当前无特权查询实现、无新测试执行、无生产部署或首次安装；NO-GO 保持。**
