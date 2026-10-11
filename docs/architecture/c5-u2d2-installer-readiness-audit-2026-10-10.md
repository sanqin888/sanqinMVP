# C5-U2D-2 — Root-private installer readiness and architecture approval gate

**状态：READ-ONLY SOURCE AUDIT COMPLETE / OPTION A + INODE STRATEGY AUTHORIZED FOR LOCAL OFFLINE DEVELOPMENT / PRODUCTION INSTALL NOT AUTHORIZED**  
**基线：** `origin/dev` merge `7fe23fbb0b065dee467852582a6a044c782ec07a` (U2D-1 PR #2780; CI #7141 7/7 green)。审计分支：`audit/c5-u2d2-installer-readiness`。

## 1. 审计依据与已验收证据

本次依次审阅 `AGENTS.md`、`.github/workflows/ci.yml`、`.github/workflows/publish-images.yml`、`ops/runtime/{build_bundle,prepare_runtime_update,runtime_trust,stage_bundle,offline_runtime_handoff,runtime_update_contract,review_handoff_evidence}.py`、`ops/release/deploy_release.py`、C4-P2-A/P2-D runbooks、U2C/U2D 设计和 U2D-1 文档。

- 真实 Runtime: `/opt/sanq/runtime` root-owned，17/17 安装时完整性、ACTIVE state 和独立 ext4 同设备原子交换测试均为操作员现场的**点时 PASS**，非新一轮实际核验。Source SHA `a84b72007e6b4e82c981101e56c897355757c0ff`，线上镜像 SHA `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`。设备号 `66305`。应用和 Runtime **版本坐标不同**。
- API/worker Uploads bind `/srv/sanq/uploads`，DB volume `sanq-app_pgdata`；最新现场 backup.timer waiting，service idle，MCP tunnel active。cwd/fd 是一次瞬时检查，**不足以证明未来维护屏障有效**。
- U2D-1 新 `review_handoff_evidence.py` 只能验证**调用者自述**的逻辑一致性；始终拒绝给予真正权限，不能和特权安装执行逻辑拼接时把它当做实物可信验证。
- `SOURCE_FILES` 17 文件是封闭 Runtime 可信清单；C4-P2-A 明确禁止自动 root launcher 和 active symlink，生产更新需单独权责批准。

## 2. 真实 owner/机制审计发现

| Owner | 已有机制 | U2D-2 不得假设/跳过 |
| --- | --- | --- |
| `publish-images.yml` + `runtime_trust.py` | 只对通过 main CI、完整配对镜像发布成功、GitHub 归档外部 SHA seal 的发布作可信来源证明；Archive Artifact retention 90 天 | `verify_runtime_publication()` 当前要求**最新**完成的版本；若用户选定旧 target，不能在未改合同/重新审核的情况下绕过 freshness；旧版 Runtime 的历史归档也不能假装以同一最新检查通过 |
| `prepare_runtime_update.py` | 调用外部 GitHub 校验，然后输出用户独占私有 0700 的**惰性**源文件、Manifest、原始 Archive | 不能原地提升 staging 权限后直接执行；root 执行必须独立复制**原始 archive 字节**到 root-private 路径并独立校验，拒绝中途变化 |
| `build_bundle.py` | 17 固定 SOURCE_FILES，附独立 generated Manifest；Archive 有固定大小/类型限制 | 安装器、原始压缩包、事务 Journal/回退资产必须放在 Runtime active tree **之外**；不要扩充 17 白名单、篡改 Manifest 或新增隐式 source path |
| `deploy_release.py` | root operator 的独立**应用镜像** deploy/rollback，严格检查 Runtime Manifest、current env/state、固定 Compose、uploads/volume；执行时会修改 .env 和 release-state | 安装器不能复用 `deploy/rollback --execute` 或修改 `.sanq-release-state.json` 把 Runtime 安装误认成 app 发版。它不采用未来新增的安装器 flock，必须另行维护排他 |
| `verify_runtime_release()` | 校验旧 runtime source 作为 app target 的 bounded ancestor（<=250 commits），并检查比较文件没有变化的 Runtime member | 把较新 Runtime source 安装给仍运行旧 app image 时，没有“反向兼容”证明。**必须专门比较新 Runtime 与旧 app 的合同并审阅运行行为**，或者改为另行授权成组 Runtime+app 发布；不得放宽旧 controller 的安全比较门禁 |
| `sanq-backup.service` | 以 ubuntu 执行安装在 `/home/ubuntu/backup-db.sh` 的独立脚本；读取 Runtime 的 .env/Compose/C4 marker；protected Nginx helper 用独立 sudoers | Runtime Archive 中包含备份源码，并不意味着已安装的外部 service/helper/sudoers 自动更新。任何影响这些消费者的源码变更要判定是否触发独立 C4-style 成组变更 |
| `offline_runtime_handoff.py` | 只支持非 root 的 /tmp fixture，同一 fixture 父目录 `renameat2(RENAME_EXCHANGE)`、journal+注入异常 | 不是跨父目录的 root 安装器，也没有真实 SIGKILL/断电测试，不能 `sudo` 运行或取消 sandbox 限制以升格生产用途 |
| `review_handoff_evidence.py` | 不访问 host、不验证真实性，记录手工 incident 分类，永不 ready/authorized | “claimed snapshot verified” 仍是假设；root 安装器需要新的**真实** inode/hash/lock/进程/cwd/owner checks，与纯审阅器分离 |

## 3. 推荐最小架构及影响

**选项 A（推荐，需明确批准）：独立、operator-controlled 的 root-private 一次性安装/恢复组件**，源代码只在被审阅的专属 owner 下开发，通过单独校验的 source hash/原始 Archive hash，经授权操作员由可信路径独立复制到仅 root 可写目录后执行。安装器源码不会成为 Runtime bundle 17 成员、不会修改日常 App deploy controller，也不会创建常驻 root daemon、系统级 sudo 任意脚本接口、Web/API 操作端点或 MCP 任意 sudo 入口。

- **改变的职责**：新增以前不存在的对真实 `/opt/sanq/runtime` root-owned live path 的事务性安装权限；现有代码仅能 staging、模拟切换或独立 App rollout。
- **风险**：root 安装器自身交付链、活跃目录交换、读写并发、时序/掉电中断、动态状态 inode 改变以及恢复脚本的误执行面；必须以分阶段隔离仿真和人工授权约束。
- **优点**：单次 root-owned 人工操作，不引入长期提升权限或放松 source allowlist。
- **代价**：必须保留人工维护窗口、审批和演练；没有无感/无人值守热更新承诺。

**选项 B：单独签封并发布 Installer Artifact**。新建独立可信发布与校验合同，安装器 artifact 的发布、保存、原始哈希和签署机构另行治理；比 A 引入更多 CI/发布权限与信任面，不能搭便车用 Runtime Manifest 的源文件 SHA。

**选项 C：不建立通用 root 安装器**。继续对每一次 Runtime 更新单独准备人工分步执行手册，并由独立 root 操作员审核目录原子交换。代码较少，但重复人工操作风险和故障恢复可重复性更差；无法获得 U2D-2 的完整自动化故障注入收益。

在选项 A/B/C 尚未确定前，**不能**写具有 production root install/rollback 命令的代码；现在可继续的仅为只读合同或非特权隔离模拟。

## 4. 五项具体设计决策（授权前冻结）

1. **权限模型**：选 A/B/C，并确定独立安装器源代码存放的 owner，root-private 安装程序哈希与操作员批准书的绑定方式。仅同意“开始下一步”不等于批准新 root 能力。
2. **动态文件的 inode 语义**：推荐 path logical identity：`.env`、`.sanq-release-state.json`、C4 marker 的 bytes/owner/group/mode 保持，candidate 使用**不同** inode（不 hardlink）；因为原子交换真实目录会改变 active inode。若 inode 不变是业务硬门禁，禁止原子目录交换方案并另行设计。
3. **新版 Runtime 与当前 App 兼容性**：仅当新 Runtime 与当前运行 `ff5be8d5…` app、独立安装的 backup/service/helper 及固定 Compose/DB/Uploads 兼容性的可审阅证据齐全时允许 Runtime-only 手术；否则必须另行审批成组变更。绝不“修改 manifest source SHA/跳过发布检查”求通过。
4. **维护排他能力**：同意未来单独获批的维护窗口暂时屏蔽/停用 MCP 生产调用、暂停 backup timer 并等待实际 backup service/helper 退出、阻断 deploy、要求 SSH cwd 退出活跃目录；恢复 timer **原有状态**。安装器单独 flock 并不能独自阻止现有非协作消费者。
5. **事故保留/回退**：保留独立 root-owned preimage 完整快照、旧目录、原始 Archives、来源证明与 C4-P2-C 历史 rollback/legacy checkout；每个 txid 有唯一不可覆盖 incident Journal、人工确认恢复，**不自动 roll back app、DB 或镜像**。生产执行前必须证明已留存异机恢复能力和受测演练。

## 5. 推荐实施拆分（每一批均独立审阅）

**U2D-2A：operator-owned one-shot installer offline implementation（在授权选项 A 和 inode 策略后）**

- 独立非生产 fixture 设计：严格约束根目录及 marker；真实 source/target provenance gate 的可注入、纯函数端口；root-owned candidate 17-member exact bytes/hash/owner/mode 复验；固定双 fd 或唯一可信 sibling slot 的 `renameat2`；动态 state 独立复制；完整 preimage；严禁自动清理。
- **只在开发容器/临时 VM 运行**实际 root/euid 测试，不在生产执行。CI 无 root 主机安装权限验证，仍需独立 staging 验证。
- 处理 TOCTOU：经 `openat(... O_NOFOLLOW | O_DIRECTORY)`、`fstat`、dir_fd + 固定相对文件名操作；重验信任锚和 inode，在写 journal 前再次比对；禁止经路径遍历误指向 Runtime/source staging。
- Journal/fdatasync/fsync 按「候选完整落盘 → preimage 完整落盘 → PENDING durable → 单 syscall exchange → 双 parent fsync → old retained → final verification」顺序。中断保持事故，不自动第二次 exchange。
- 只输出“需要人工审查”的结构化事务报告，**生产 ready/execute 必须由受审阅的一次性 root-private operator 批准/执行门禁决定，不引入常驻 Root Launcher**；不得把 U2D1 逻辑审查返回值升格成权限 token。

**U2D-2B：failure injection / recovery evidence（A 完成审阅后）**

- 非 root/Linux 交换和 SIGKILL 子进程故障注入，覆盖 PENDING 前、journal fsync 前后、rename syscall、父目录 fsync、旧版保留、最终状态关闭；确认启动后 inspect-first，不进行自动恢复。
- 独立隔离 VM 的 root-private dry-run、owner/mode/文件 inode 真实性、cross-parent exchange、目录 fd 泄露、cross-device、并发 flock/进程 cwd 验证；使用假生产路径，**不得指向真实 /opt/sanq/runtime**。
- 恢复脚本的模拟人工批准分支、保留 snapshot 与反向切换校验。异常输入/不可恢复相位保持 fail closed。
- 真实断电/内核崩溃持久性需要独立隔离 VM 电源故障或文件系统镜像演练，不能把内存异常/SIGKILL 误报为 power-failure VERIFIED。

**U2D-2C：production installation readiness evidence（单独生产审批，**不自动执行**）**

- 冻结 target main full SHA + run/配对 GHCR digests + 原始 archive SHA；旧 archive 来源独立校验、备份可恢复与现场保护完成；维护排他/恢复 runbook 审阅并记录操作员 consent-id。
- **只有实际安装授权明确给出时**，才人工运行 root 私有脚本/步骤。原先 U2C 单次独立 scratch 交换授权不能泛化给 Runtime 更新、timer stop、MCP stop 或在生产 staging 写入。

## 6. 退出判定和当前状态

| Gate | 状态 |
| --- | --- |
| U2D-1 纯数据 analyzer + GitHub Actions | PASS（#2780 merged, CI #7141） |
| U2C 17/17 安装现状、layout、ext4 同设备 scratch exchange | POINT-IN-TIME PASS（已有独立现场证据） |
| Owner 边界/支持的发行和 Bundle trust model | SOURCE REVIEW PASS |
| 特权安装器方案 A/B/C 和 source execution ownership | **AUTHORIZED FOR LOCAL OFFLINE DEVELOPMENT (OPTION A)**；生产 operator source execution 不在本授权内 |
| 动态文件 inode 路径语义 | **APPROVED**：保持字节/owner/mode，允许新活跃路径 inode 变化 |
| Runtime-only backward compatibility target proof | **BLOCKED**：目标 main release SHA 尚未确定 |
| 跨进程 quiescence 对 backup/MCP/Deploy 的实际保障 | **NOT IMPLEMENTED / FUTURE MAINTENANCE GATE** |
| root-private one-shot code + real fault/cold recovery verification | **U2D-2A OFFLINE KERNEL LOCAL IMPLEMENTATION**；root cold recovery U2D-2B 尚未执行 |
| 生产安装、动态 state 和 container writes | **NOT AUTHORIZED** |

**裁定（原审计）：`C5-U2D-2 AUDIT COMPLETE / ROOT-CAPABLE IMPLEMENTATION AWAITING EXPLICIT ARCHITECTURE CHOICE / PRODUCTION INSTALL NO-GO`.**

**2026-10-10 授权更新：** 用户明确授权方案 A 的「一次性 root-private 安装器开发职责」及动态文件「字节/owner/mode 保留、inode 可以变化」策略，并要求开始 U2D-2A 修改。此授权**仅覆盖本地/隔离实现**，不覆盖在生产 VM 上运行脚本、修改生产 Runtime、停止 MCP/backup、上传 root-only 安装器、提交远端 PR 或执行真实升级。U2D-2A 为降低实施风险，先交付固定 `/tmp/sanq-u2d2a-lab-*` 的受限真实原子交换事务内核；对生产入口保持拒绝，root-side provenance 再独立核验、外部服务维护屏障和 cold-restore 在 U2D-2B/C 继续办理。新进度详见 `docs/architecture/c5-u2d2a-offline-operator-installer-2026-10-10.md`。

本地审计报告仅供审阅，不是 root install 脚本、临时目录写入批准或新的 PR 提交指令。遵循 `AGENTS.md`，本地保存和 diff/status 核查后停止；用户批准后方可提交 dev PR。
