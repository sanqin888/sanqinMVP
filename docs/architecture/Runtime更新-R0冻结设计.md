# Runtime 更新 R0 冻结设计

**交付记录：**[PR #2853](https://github.com/sanqin888/sanqinMVP/pull/2853) → `dev`；本批提交、最终 head 的 CI 与合并状态以该 PR 检查和事件为权威。

**决策状态：D1–D5 APPROVED / R0 DESIGN FROZEN。** 用户明确要求“五项都按照推荐方案进行 R0 一次冻结设计”，本记录据此生效，不再等待重复架构批准。冻结日为 2026-10-17（America/Toronto）；源码核对基线为 `origin/dev@592c534896d18ca51082b708b8ab677402fabe4a`，文档分支为 `docs/runtime-r0-design-freeze-20261017`。

**交付与运行状态：本批仅文档，已获用户远端交付授权；C5-G2 NO-GO；S2 DAILY CONFIG EXPANSION PAUSED。** R0 完成的是设计和文档收口，C1–C8 整体均未通过；没有新的 Guest/root、生产执行、MCP 权限、云配置、依赖、CI、Prisma/schema/migration 授权。本批没有新增迁移；仓库 PEM 等其他工作已有的 `MIGRATION REQUIRED` 状态不受本批影响。

## 1. 权威入口与有限边界

本文统一当前 Runtime 决策、进度、门禁、批次和首版验收范围。[G2 合同](./c5-g2-trusted-runtime-contract-2026-10-13.md) 保留 A–F 生产授权层级；[交付与安装约束](./Runtime交付与安装约束.md)、[Recovery Kit 合同](./c5-u2d-abort-clean-reinstall-recovery-kit-2026-10-11.md)、[S1](./c5-u2d-s1-protected-config-snapshot-2026-10-11.md) 按本文解释当前路线。较早日期文档、旧工作日志和[历史证据索引](./Runtime历史决策与证据索引.md) 保留当时事实，不能用旧的 LOCAL、下一批或未批准状态否定本次批准，也不能将历史局部 PASS 升为生产资格。

首版目标是可靠更新独立 Runtime，并能在安装中断后从外部资料完成新事务重装。应用发布/回退仍由 `ops/release/deploy_release.py` 所有；固定 17 个 Runtime 源文件加 `runtime-release.json`，不扩 Bundle、不接入应用 rollout 或业务数据修复。外部安装的备份脚本/helper/sudoers/systemd 仍需单独做源码与安装副本兼容核对。旧 checkout 删除另批处理。

## 2. 五项已批准且冻结的决策

| 决策 | 采用的推荐方案 | 固定边界与完成条件 |
| --- | --- | --- |
| D1 信任模型与平台 | v1 只支持一个独立认证的 Linux/Python/loader/native 基线及一份准确 Operator 发布；AWS/Guest、内核和受控 root 管理为明示信任前提 | 不递归主机自证内核绝无恶意；仍处理 root 误操作、未授权入口和未知进程。实际解释器、程序完整传递 import/ELF/dlopen 依赖、启动参数与环境须采集并独立认证，未知即拒绝；调用方 hash/布尔值、root 自报都不成为信任根。 |
| D2 维护路线 | 选 H2 **A：操作员控制的有限维护窗口**，先隔离 Guest，再精确生产审批 | 先验证唯一管理通道，再按清单 stop/禁入/排空/持续观察/复查/原状态恢复；覆盖 Backup、Deploy、MCP、SSH、调度器和 namespace。不能靠 advisory flock 或两次空扫描。H2 B（改所有消费者加入共享协议）不在首版范围。 |
| D3 离机 Kit | 保持 crypt + Drive 方向；R3 首先完成有界真实传输适配验证 | 精确 txid 和对象 ID、create-only、已存在/冲突拒绝、适配器无 update/delete、独立环境完整下载解密读回。优先验证 Drive 预分配 ID 与既有 rclone crypt 格式组合；禁止自研密码算法，检查后上传或单独 `copy --immutable` 不等于原子 create-only。 |
| D4 首次更新顺序 | mandatory preinstall Kit + 当前日常备份健康 + 独立 DR 可用性在首次更新前；S2 新 daily helper/扩充、接线与 sudoers 在 v1/C5 验收后独立推进 | C5 不再等待 S2 扩充，S2 仍不得提前部署。S2 PAUSED 不表示现役 timer 被停。root state 保持 root:root 0600，不向 ubuntu 放宽；现役每日备份故障仍阻止更新。 |
| D5 中断恢复 | **Abort & Clean Reinstall**：中断即放弃旧事务，独立外部资料、新 txid、新目录、新授权完成重装 | 不续跑/replay journal，不自动回滚 DB/Uploads；重复中断再次 ABORT。不明状态停止；磁盘、系统或业务数据受损转完整 DR。旧三检查点冷掉电取证不作 v1 默认门禁，原 NOT EXECUTED 和 VM/归档保留。物理/虚拟掉电持久性仍 **NOT VERIFIED**，SIGKILL 不等价掉电。 |

D1 不是认证任意当前 root 用户的说法。实验声明 Python 3.12.3 不是已认证生产平台；实际平台不同必须按实际版本形成对应基线和验收，不能改版本字符串放行。D3 create-only 是所审适配器的创建语义，不是对 Drive 账户管理员的 WORM 保证；若实际要求无法满足，停止并另审后端、权限、成本和依赖，不静默降为覆盖上传。

## 3. 真实进度与尚未成立的结论

| 工作 | 可追溯现状 | 不能据此关闭 |
| --- | --- | --- |
| S1 protected snapshot | PR #2789，dev merge `7723262e`，PR CI #7164 / dev CI #7165 通过；独立库契约已合并 | 没有真实 crypt/远端适配、生产 helper 安装或 daily 接线 |
| G2-A 及 B 系列模型 | 历史来源检查、维护模型、FD 读取/交付、声明绑定等源码已在核对基线；保持各自非授权边界 | 不是已实现的可信 privileged installer；旧日期“本地待审”不再是总进度 |
| B4B-3A 依赖清单 | PR #2848 已合并；merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`；final head `d4d5513f5dc734e0f9b9321e99e49582073cd263`；CI #7315 / run `39077195858` 通过 | 仅合成声明图校验；没有真实文件采集、独立来源认证或真实 Operator 执行 |
| B4B-2 Guest 实验 | 操作员报告固定合成字节机制 8/8；hash/原证据定位见对应验收文档 | 不是真实解释器完整闭包、独立见证或安装资格；曾跳过实际 snapshot restore，不豁免 C2 |
| B2B8 / H-01–H-08 | B2B8 仅 S1/S2/S11；H 系列为有限负向证据（H08 4/4） | 未形成可阻止新消费者的真实整机屏障，namespace/观察完整性仍需 R2 |
| 正式更新与独立恢复 | 仍缺真实执行闭包、维护禁入、真实 Kit 适配、正式安装/重装组合及同候选矩阵 | C1–C8 均无整门禁 PASS；生产 NO-GO |

上述是源码/已有证据核对，不是重新检查任何生产主机、Guest、快照、凭据或远端对象当前存在。已安装 Runtime 的历史身份仍见[发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)，不能用 dev SHA 替代 installed source 或 app image SHA。

## 4. 八个最终门禁与证据登记

| 门禁 | 关闭条件 | 当前状态及主要后续 |
| --- | --- | --- |
| C1 来源与可信执行 | 旧/新原始 Archive、发布 proof、Bootstrap/Operator 外部 pins；实际解释器/loader/完整传递依赖；FD 材料确实被受限执行，未知拒绝 | OPEN：B4B-3A 仅声明，R1 完成真实采集/执行/独立见证 |
| C2 可恢复的隔离环境 | Guest/磁盘/隔离/无生产资产/FS/UID/平台已独立检查，批准的恢复基线实际演练成功，原始证据离机保全 | OPEN：历史跳过 restore 不豁免；任何新 privileged Guest 试验前先满足 |
| C3 应用与存储一致性 | 本次 current/previous/env/running image、17+Manifest、C4、project/DB/Uploads 及外部安装副本相容，无 pending/未明事故 | OPEN：R3/R4，生产前另做当前主机核对 |
| C4 维护排他与禁入 | 精确入口控制、排空、PID/FD/inode/namespace 及完整持续观察；未知/预算不足拒绝；原触发状态恢复 | OPEN：R2 真实有限窗口，负向样本不代替正向禁入 |
| C5 可恢复的离机 Kit | 真实 create-only、冲突/重试无覆盖；完整独立取回解密读回；旧/新原 Archive 与 live config、长期 proof/保留/escrow 可用 | OPEN：R3；S2 daily 扩充不是前置 |
| C6 正式安装与独立重装 | root-private、FD-safe、完整候选/preimage/持久化/固定交接；普通同 SHA upgrade 拒绝，独立 recovery 可同版；不续 journal、不碰业务数据 | OPEN：R4；保留旧 lab-only guard，另建真实组合 |
| C7 同候选端到端矩阵 | 同一最终候选/平台完成正常更新、拒绝、中断、外部恢复、重复中断、原状态恢复及独立核对 | OPEN：R5，不能拼接不同版本局部 PASS |
| C8 精确生产交付 | C1–C7 后，准确主机/版本/Kit/窗口/操作者/停止条件获 G2-E 许可；执行后 G2-F 独立复验 | NOT REQUESTED / NO-GO：本批无生产操作 |

每份新增证据须登记 candidate 完整 SHA/执行 hash、平台和 Guest 身份、操作/授权定位、UTC 与执行顺序、原始 stdout/stderr/JSON、进程/FD/对象身份、退出码、失败/清理/恢复状态、原始字节离机 hash 对照及独立 witness 来源。runner 自写报告的再次读取不是独立见证。不得仅凭报告勾选或 `authorized=true` 接纳权限。

## 5. R0–R5 执行队列与依赖

| 批次 | 固定工作包 | 当前进度与依赖 |
| --- | --- | --- |
| R0 | D1–D5、接口边界、C1–C8、矩阵及全仓现行文档一次收口 | **设计与文档完成；远端交付已授权**，不等待重复批准 D1–D5 |
| R1 | B4B-3B/3C：真实执行基线、完整依赖/来源采集和独立消费见证 | IN PROGRESS：B4B-3B-1 已合并 PR #2854 / CI #7336 / dev merge `2bab5fe6`，仅为候选 FD 哈希与离机比对；B4B-3B-2A 已合并 PR #2855（dev `2db85d32`），提供仅内存 AST/ELF 静态线索；B4B-3B-2B1 已合并 PR #2857 / CI #7344（run `39098295751`）/ dev `1a82caff`，仅实现严格 no-follow 的候选目录 FD 逐段开启与合成测试；B4B-3B-2B2 进入本地只读 alias/root-anchor 设计评审（未授权实现），仍无真实 Guest / `/'` 锚点证明、系统 symlink/realpath 认证、完整动态 Python/ELF/dlopen 闭包、独立来源或消费见证。privileged Guest 试验须先满足 C2 和精确命令批准。详见 [B4B-3B-1](C5-G2-B4B3B1-只读FD证据与离机比对.md)、[B4B-3B-2B1](C5-G2-B4B3B2B1-受控路径FD候选开启.md) 与 [B4B-3B-2B2 设计评审](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) |
| R2 | B2B9-N/A：真实有限维护窗口、namespace 与新消费者禁入、原状态恢复 | PLANNED；按冻结接口可与 R1 准备并行；真实试验同样先满足 C2，不启动全消费者协议重构 |
| R3 | 首先证明真实 crypt/Drive create-only 适配，再组合 S1、实际 app/state 和 mandatory preinstall Kit | PLANNED；独立适配验证可准备，安装用 Kit 必须绑定 C1/C3/C4 与本次持续窗口 |
| R4 | 实际 root-private install + 新事务 clean reinstall；持久化/交接/不改业务数据 | PLANNED；组合 R1–R3 证据，保留旧 lab fixture 和 guard；不隐藏更换外部 helper |
| R5 | 同最终候选完整端到端、故障和恢复矩阵；再提交精确 C8 readiness/执行/复验 | PLANNED；前四批真实证据成立后进行；不自动取得生产授权 |

S2 是 **v1/C5 验收后**的 supplementary daily helper/扩充/接线/sudoers 独立项目，不在 R0–R5 首次更新关键路径。现行日常备份健康与独立 DR 可用性始终是更新前置。旧 S3/S4/S5 的 preinstall/recovery/外部安装审查职责分别由 R3/R4/C8 承接，daily 特有审查留给后续 S2，避免重新引入循环。

以下是后续采集和每次操作的必填值，**目前未知，不在本文编造**：真实 OS/arch/kernel/Python/loader/native 来源；Operator/Bootstrap 版本、独立 pin 和保管来源；旧/新完整 main SHA、原 Archive hash 和 image/proof；现场 app current/previous/state；实际 units/触发器原状态、管理通道、namespace/holder 清单；Kit 远端 parent/预分配对象 ID/txid、crypt 配置和 escrow 版本、成员数量/预期结果。R1–R3 必须取得真实值再执行；这些操作实例字段不是新的 D1–D5 待批准决策。新增支持平台、云后端、权限或依赖等范围变化才另行评审。

## 6. 单次操作顺序与保留

以下为待实现合同，不是可执行 root 命令：冻结旧/新发布身份 → 独立认证控制入口/执行闭包 → 先确认管理通道再建立持续维护/禁入/排空 → 捕获 live state 并 create-only 保存 Kit → 独立完整取回解密读回 → 重新检查持续屏障/现场一致性 → 在活跃树外准备并读回候选/preimage → 经批准的同设备原子目录交接和持久化 → 独立全量复验 → 按原 enabled/active/next-trigger 状态恢复维护。任一未知、状态漂移、来源/读回失败即无安装资格；不能用任意固定“新鲜分钟数”替代持续一致性。

Kit 至少包含/可独立取回：S1 五文件 `.env`、`.sanq-release-state.json`、`.sanq-backup-layout-activated`、`docker-compose.yml`、`runtime-release.json` 的准确 bytes/metadata；旧与新原始压缩 Archive 及外部来源 proof；独立执行材料/完整平台闭包和 pins；实际 app/镜像/存储身份；维护原状态、txid、完整读回证据；可用的离机密钥 escrow 前提。Manifest/self-hash 不认证来源，crypt 也不认证 GitHub 来源；长期原字节、权威 proof 与密钥可用性分别核验。

逻辑用途冻结为 `gdrive_secure:runtime-recovery/<txid>/`；真实 parent 和精确对象 ID 由 R3 验证/绑定，未创建生产目录或授权新凭据。保留 current、previous、目标及所有未关闭事故需要的验证集，无自动 prune；不沿用 GitHub Artifact 90 天或 daily config 30 天清理。不得覆盖、删除旧验证集或未明 journal/candidate。密钥、token、原始配置不得进入 Git/聊天/报告。

应用/密钥变化导致旧 Kit 过期时，不猜 previous/current、不回填旧 secret/C4 authority。活跃写已发生或是否写入未知即 ABORT、隔离留证，独立新事务恢复；正常同 SHA upgrade 拒绝，明确 recovery 入口可同版本；第二次中断仍 ABORT。磁盘/系统/业务数据损坏转[完整 DR 手册](../runbooks/backup-recovery.zh-CN.md)，不默认恢复 DB/Uploads。

## 7. 首版固定验收矩阵

下面 18 组是关闭要求，**均不是本批执行结果**。D5 已批准，旧三检查点冷取证退出首版默认范围；不删除原实验或将 NOT EXECUTED 改为 PASS。

| ID | 场景 | 必须观察的结果 / 主要门禁 |
| --- | --- | --- |
| A01 | Guest 身份/隔离/平台不符，恢复基线不可用 | root 实验前停止；C2 不关闭 |
| A02 | 正确来源与真实执行材料 | 外部 pins、FD/输入、实际消费及独立观察一致；固定表达式不足以代替；C1 |
| A03 | 错源码/解释器/依赖、路径替换、未知 import/动态库 | 在相关材料被执行前拒绝；不得只靠退出后告警；C1 |
| A04 | 错 main SHA、配对镜像/Archive、seal/run，伪造/重打包 | 无活跃写；历史指定版本不改选 latest；C1/C5 |
| A05 | pending、env/state/running image 不一致、错误 volume/bind/外部 helper | 无活跃写；不自动 normalize 或 repair；C3 |
| A06 | 已有备份服务/后代、deploy/Compose/MCP/SSH cwd/fd/mmap/别名引用 | 检测并等待经授权处置；无法确定就 BLOCKED；C4 |
| A07 | 持有者改名、PID churn、不可读/漏项/预算耗尽、bind/namespace | 不把零已知持有者当全覆盖；unsupported namespace 必须拒绝；C4 |
| A08 | 屏障建立后新消费者尝试进入 | 在批准威胁模型内确实阻止；仅观察到“进来了所以拒绝”不算正向屏障通过；C4 |
| A09 | Kit 同 txid/对象已存在、并发、上传超时/不确定成功 | 不能覆盖/删除已有验证集；不盲重试取得权威；无完整读回则无活跃写；C5 |
| A10 | 缺/坏/截断/错版本/过期状态 Kit，密码或 escrow 不可用 | 不能标 recoverable；不回填旧 secret/current/previous；C5 |
| A11 | GitHub Artifact 过期但离机原字节仍在 | 在仍可独立核验 provenance 的前提下实际下载/解密/验证成功；不能模拟字节存在；C5 |
| A12 | 完整正常更新 | 同一候选真实操作，全量文件/动态 bytes/owner/mode/app/storage/健康前后对照；无隐藏 rollout；C3–C7 |
| A13 | prepare/Kit/readback 期间注入失败，原定 enabled-active 与 disabled-inactive 状态 | 证明活跃树未变、事故有记录、原触发状态恢复或明确恢复失败；C4–C7 |
| A14 | 准备持久化、交接前后、保留旧树、收尾前等活跃窗口中断 | ABORT、留证、禁止旧事务重入和 journal replay；按本节 I1–I6 冻结检查点执行，并覆盖下述 S 场景映射；C6/C7 |
| A15 | 损坏活跃树不可作为输入，完整离机恢复 | 独立执行材料+原始 Archive+可用 Kit，从新 txid 完成 fresh clean reinstall；C1/C5–C7 |
| A16 | 普通同 SHA upgrade、独立同版本 recovery、占用旧 journal/candidate | 普通拒绝；recovery 仅新独立入口/新事务；旧槽不覆盖；C6 |
| A17 | recovery 第二次中断 | 再次 ABORT，下次新事务，完整证据和旧恢复集不丢；C6/C7 |
| A18 | 退出后 timer/MCP/管理入口恢复，或恢复动作失败 | 原状态精准恢复并独立观察；失败保持事故/未完成，不一律 enable/start；C4/C8 |


**A14 活跃窗口检查点一次冻结为 I1–I6：**I1 候选/preimage 写入与 fsync 完成前；I2 准备持久化完成后、交接前；I3 交接调用前后（须观察结果或不明状态停止）；I4 新树已活跃、父目录持久化完成前；I5 持久化后、独立全量复验/事故收尾前；I6 recovery 新事务中对应窗口的再次中断。具体 runner 可在这些边界内注入，不能把边界改成单一 prepare 阶段即宣称覆盖。实际交接必须按目标文件系统证明其支持的原子语义，不将 Python mock 或退出后检查代替。

原 S 场景映射：S1/S2 → A13/A18；S3–S7 → A06；S8/S9 → A07；S10 → A08；S11 → A13/A18；S12 的事务中断/禁止 replay 部分 → A14–A17，物理/虚拟掉电持久性部分按 D5 单独标 NOT VERIFIED。既有 S1/S2/S11 局部执行事实保留，不能冒充 R5 同候选整矩阵通过。

## 8. 交付与退出登记

本批 R0：已批准设计已写入，96 份 Markdown 逐一核对；现行合同、索引、runbook、总队列、当前依赖图和持续日志统一，历史证据原文按其边界保留。**用户已批准远端交付；本批 PR 最终 head 的 GitHub Actions 与合并记录为交付权威。** 未执行本地 lint/build/test、Guest/root、生产或远端 Kit 操作；文档冻结不伪造 CI/真实验收。

后续只按 R1–R5 补齐上表有限缺口。G2 A–F 的精确 Guest/生产许可和安装后独立复验仍有效；此处不再次请求 D1–D5 决策批准，也不因 R0 完成自动开始任何生产操作。
