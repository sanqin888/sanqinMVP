# FI-MAC-1A：首次安装 Mac 只读状态查询

## FI-MAC-1B3b：可信 VM 原件只读取证权限审计（设计中，禁止执行）

FI-MAC-1B3a PR #3078 已经 [CI #7856](https://github.com/sanqin888/sanqinMVP/actions/runs/41325902899) SUCCESS 并合并 `dev` `c71cd2ea`，但 Mac 的 `status` 仍只能读固定 systemd 属性，不能访问 root 保护的原件目录。VM `_private_session` 强制 root、依次独占 `.release.lock` 与 `.prepare.lock`；`completion.json` 在 marker 删除之前写入，原 unit 可能已回收。**禁止用 status=0、unit not-found、SSH 子进程退出零、B3a 哈希一致或 PRE-CLEAR completion 当作生产安装成功/可重试许可。**

当前没有经批准的 root 原件只读查询入口。不得手工添加 sudoers、调用 `installation-submit` 作为查询、用任意 shell/cat/find 读取私有材料、向 Mac 导出恢复归档或在生产测试。若需要可信只读报告，先按 [FI-MAC-1B3b 权限评审](../architecture/Runtime首次安装可信只读取证权限评审.md) 分别审批固定 root 入口、可能的后清标记历史终态证据以及现场操作。未批准前只能运行原已授权的非特权 status 和操作者自有材料的离线 B3a 检查，均不证明安装成功；首次安装 NO-GO。

## FI-MAC-1B3a：首次安装 PRE-CLEAR 原件离线完整性审阅（已合并 dev）

新模块 `ops/release/sanq_install_result.py` 的 `review_preclear_records(originals, installation_id=..., source_sha=..., retention_id=...)` **仅为后续受限 VM 只读取证模块准备的内存审阅 API**，没有新增 shell/CLI 命令，不联网，也不读取真实 VM 文件。输入严格由 7 个具备精确固定名称的原始字节组成，缺失/多余/非 canonical JSON/跨代次/摘要失配均阻断；输出只有 `PRE_CLEAR_DIGEST_CHAIN_STRUCTURALLY_MATCHED`，始终标记 `vmOriginalsAuthenticated=false`、`verificationFactsRecomputed=false`、`maintenanceMarkerAbsentObserved=false`、`installationComplete=false`、`canExecute=false`。

记录目录即使包含合法 `completion.json`，它也只是 VM 清除维护标记之前写出的 `PREPARED_BEFORE_MARKER_CLEAR` 原件，不能证明原 systemd 任务完整退出、维护标记已清除、容器健康或本次未被旧事务/故障替换。这个模型只能重算原六份材料摘要及由 intent 生成的 marker **预期摘要**，无法观察 marker 的当前文件存在性、来源身份或恢复能力。特别是 `verificationSha256` 来自原 VM 在内存中构造的事实，现有七个文件不能把它重算为认证结论。真实取证必须先补上原 VM/原 root 名称空间的有限只读协议、不可重用的事务身份及 maintenance/locks/systemd/应用验证，还要遵循现场独立授权。**没有生产首次安装或重试许可。**

## FI-MAC-1B2d：未来安装 SSH 实时管道适配层（已合并 dev、禁止生产调用）

`ops/release/sanq_install_live.py` 是**私有库，不是当前可运行的安装命令**。它准备了固定源提交、保留材料 ID 的 `/usr/bin/sudo -n -- /usr/bin/python3 -I -S -B /opt/sanq/install-bootstrap/<sha>/ops/release/install_minimal_executor.py installation-submit --source-sha <sha> --retention-id <id>`，绝不接受其他 SSH host、路径、任意远端 shell 或内部 run/cleanup；使用之前已验证的严格 SSH hostkey/agent 原件与选项，唯一差异是允许活 stdin/stdout 管道，不改变原 `sanq-deploy.sh` 标准输入关闭规则。

同一次会话中先读取 VM `sanq-minimal-install-target-request`，仅允许回复完全相同、提前已核实的原目标 JSON；再读取 `sanq-minimal-snapshot-evidence-request`，只有操作者手工 AWS 来源材料经 `EvidenceReview` 核验且原字节摘要一致才能发送；最后读取 `sanq-minimal-snapshot-index-transfer`，只有 `retain_index` 本机 O_EXCL、fsync、Mac fullfsync 适用时、原件读回全部成功，并且回执 SHA-256 与该同代次一致，才能发送第三帧。每步管道输入输出限定格式/预算/超时、失败即中止，未知结果永不自动重连或重交；最后必须读完 stdout 至 EOF，验证 SSH 本机子进程原生 0，**不将其升级为 VM 持久安装完成**。

目前仅有离线本地子进程测试定义。**尚未提供公开的 `submit`/安装 CLI，没有实际 SSH 连接、没有生产新 sudoers/安装 bootstrap 来源验收，也不能声称手工 AWS 快照已经创建、离机材料可恢复或持久完成原件通过**。未来接入真实 CLI 时仍须独立审查冻结窗口、完整人工确认、仓库来源/身份、安装输出权限和持久只读结果；用户必须另行授权生产安装。本批不得在生产调用 `open_live`。生产首次安装保持 `NO-GO`。

## FI-MAC-1B2c：Mac 离机索引落盘与原生 ACK（已合并 dev、尚无 CLI）

新增 `ops/release/sanq_install_offhost.py` 的 `retain_index` **仅供后续经审阅的 Mac 双向交互 peer 在同一内存会话调用**；现在没有可操作的 `sanq-install.sh` 命令，也不得在生产运行。先以 FI-MAC-1B1 既有固定 SSH profile/目标原件预检，FI-MAC-1B2a 同一 `Review` 接收首帧与快照挑战；FI-MAC-1B2b 同一 `EvidenceReview` 核手工 AWS 快照**自述内容**，再由该 `Review` 校验第三帧完整原始 canonical 索引。仅当原第三帧字节摘要仍与该会话匹配、索引 ARN/快照名称/创建与可用观察时间/可用区与先前证据一致，且操作者明确确认本机目录确实**位于 Mac 而非 VM**，才允许本地持久化。仅凭 `operatorConfirmedOffHost=true` 不能认证来源或恢复能力。

操作者应事先在 Mac 上单独准备一个本人拥有的、**0700 且非软链接**的绝对路径目录（不要使用生产 VM、系统目录、`~/.sanq-deploy` 受保护 profile）；目录及祖先不能是不可信可写/可替换的链接。模块不创建目录、不接收任意文件名、不自动发送网络回复。目标 `snapshot-index-<installationId>.json` 只允许首次创建为 0600；文件和目录 fsync、Darwin `F_FULLFSYNC`、FD/路径原件读回全部成功后，才在内存中返回原 VM 既有 `sanq-minimal-snapshot-index-ack` canonical 字节。已有文件、部分写入、同步/读回失败均保持现场原件并阻断本轮，**不得删除或把未知结果当作未发生**。

返回的 ACK 包含同一安装 ID、snapshotReviewSha256、indexSha256/indexBytes、transferChallenge 和同步方式；`operatorConfirmedOffHost/clientIndexDurable=true` 表示操作者声称与本机文件操作成功，`canExecute/recoveryReady=false`。真实 AWS 会话/快照真实性、SSH 对端、ACK 交付、VM 是否接受、持久完成原件与恢复能力尚无证明；Linux CI 临时目录不能代替 Mac APFS `F_FULLFSYNC`/断电验收。下一步仍需单独审阅 live peer/VM 原件只读审计和明确的生产授权。**首次安装 NO-GO。**

## FI-MAC-1B2b：手工 AWS 快照证据同代次离线比对（已合并 dev，未实测 Mac）

新增 `ops/release/sanq_install_evidence.py` 的 `EvidenceReview`，供 **后续** 完成 Mac 双向交互实现时复用。目前尚无 CLI 子命令，不读取现场快照、不请求 AWS、不发送 `sanq-minimal-snapshot-evidence-reply` 或生成 `sanq-minimal-snapshot-index-ack`。只在同一内存会话 FI-MAC-1B2a 完成前两帧、`phase=2` 且未失败时构造评审。

输入仅为外部操作者**自行保存的原始 canonical JSON 回复数据**和由调用方传入的请求发出/回应收到时间（这些时间与操作声明都不是可信 AWS 来源证明）；模块检查来源/保留代次快照挑战、`installationId` 以及原 4 份 SHA-256、快照 ARN/固定 challenge 名称、手动/available/系统盘大小/可用区、身份确认声明及 prepared ≤ sent ≤ created ≤ observed ≤ received。拒绝错误代次、重复证据、自动快照、未 available、错误磁盘/地域、伪布尔、字段遗漏/重复、非规范 JSON、时间倒序和超限内容；失败后本次 `EvidenceReview` 不可再次调用。

观察通过只输出原证据的 SHA-256、声称的快照 ARN/状态及明确 `operatorClaimStructurallyMatched=true`；**不代表 AWS 真实已认证、快照存在/可恢复、已保存离机材料或 VM 已接受回执**。返回 `awsOriginAuthenticated/snapshotAvailable/offHostRetentionConfirmed/trustedTimeProven/operatorReplyGenerated/installationComplete/canExecute/readyToInstall/restoreProven=false`；不提供重新提交/继续任务的许可。真实 SSH `--pipe` 操作者同伴、一次性原始回复传递、人工 AWS 来源核验、离机 fsync 回执和任务退出后持久结果链均仍 OPEN，生产首次安装 NO-GO。

## FI-MAC-1B2a：三阶段请求帧离线审阅模型（GitHub CI 已通过，Mac / 真实通道未验收）

本切片在 `ops/release/sanq_install_frames.py` 实现**纯内存、只观察 VM 请求的模型**。它尚未接入 `sanq-install.sh` 的公共命令，不读 SSH 标准输入、不运行 `installation-submit`、不调用 AWS API 或写入离机材料，不产生任何可发送的确认帧。FI-MAC-1B1 的 `check-target` 在其前提供独立的固定 SSH 主机/主机密钥和用户原始目标材料本地结构预检，但该预检仍不能认证 AWS 来源。

单次模型的准确接收次序：

1. `sanq-minimal-install-target-request`：先绑定由操作者另行确认的 40 位 sourceSha 和 64 位 retentionId，严格核 30 秒目标请求、权限字段 false。
2. `sanq-minimal-snapshot-evidence-request`：同时核准确目标原字节 SHA-256、实例身份、challenge/installationId、存储绑定摘要、1800 秒快照等待；**不能用挑战自动创建或确认云快照**。
3. `sanq-minimal-snapshot-index-transfer`：对索引字节重算 SHA-256 和长度，核同一 source/retention/installationId/challenge、四份原摘要、目标/快照绑定与本来就为 false 的离机/执行许可；不能凭索引接收即签发 `operatorConfirmedOffHost/clientIndexDurable` 回执。

请求格式不规范、乱序/重放、错误身份/快照挑战、外来索引或任何权限升级均拒绝并终止当前内存模型。**观察三帧成功只能说明本次模型校验成立，不表示目标 VM 的这三帧曾实际发送、AWS 手工快照存在或离机保存已完成。** 无自动重试、无审阅替代物、无生产写入许可。下一小批应针对真实 SSH `--pipe` 活通道、受限三阶段操作者证据来源与 durable fsync、精确事务完成原件只读查询分别设计适配，生产首次安装仍为 NO-GO。

## FI-MAC-1B1：操作者目标材料本地预检（本地待审）

首次安装正式发送任何 VM 交互帧之前，可先对独立 AWS 会话取得并人工审阅的目标材料进行严格本地结构检查。**该动作没有 SSH 连接，不会访问 AWS API，也不能证实来源真实性**。

在 Mac 账户目录固定保存 `$HOME/sanq-install-target.json`，权限须 0400 或 0600；这是单独的用户文件，不得放进 `~/.sanq-deploy` 的三文件固定目录。内容是 VM 现有 `sanq-minimal-pre-snapshot-target` v1 的原 canonical JSON 对象，必须按字段名排序、紧凑分隔、ASCII 转义、末尾单个换行。准确字段：`schemaVersion=1`、`kind`、`accountId`、`region`、`instanceArn`、`instanceName`、`sshTarget`、`sshHostKeySha256`、`linuxSystemDisk`、`operatorConfirmed=true`、`instance`。其中 `instance` 须为独立 AWS 会话中目标 Lightsail 实例的原始观测对象，包含 `arn/name/resourceType/location.regionName/location.availabilityZone/hardware.disks`；只接受一个已附着系统盘。不得填造、猜测账户号、实例 ARN 或系统盘；不收录 AWS 密钥和登录令牌。

```sh
/bin/sh ops/release/sanq-install.sh check-target \
  --source-sha <准确40位main提交SHA> \
  --retention-id <准确64位保留材料ID>
```

返回的 `TARGET_STRUCTURE_MATCHED_FIXED_PROFILE` 仅证明严格字段结构、Mac 目标/host key 一致及单盘模型相符，输出 `targetInputSha256` 和输入请求的两个身份便于人工复核。始终报告 AWS 来源未经认证、独立核实未完成、无安装或恢复许可。文件权限错误、软链接/硬链接、目录原件变化、重复字段、非 canonical JSON、错主机/密钥、错实例/盘、非原生布尔均拒绝；不修复文件、不自动拉取 AWS、不提交 VM 任务。

实际交互提交/快照双帧/离机耐久回执/任务退出后的持久证据校验仍待 FI-MAC-1B2。此时 **NOT_READY_TO_INSTALL**，不能因预检成功而在生产执行安装。

> **FI-MAC-1A 已由 PR #3072 经 CI #7842 SUCCESS 合并 dev `6e9deea1`；Mac 真机首次安装状态查询未实测，生产仍未安装。以下旧实施与验收说明保留。**

本切片仅建立 **已有首次安装任务的 systemd manager 状态观察入口**，不是安装操作者交互/提交器，也不是安装结果的权威完成审计。已完成的 Mac 普通更新客户端 `sanq-deploy.sh` 不变。

## 固定入口与作用范围

使用已交付的 macOS 3.14.10 固定解释器及 `-I -S -B -X pycache_prefix=/dev/null`；独立入口 `ops/release/sanq-install.sh` 加载同目录 `sanq_install.py`，通过固定模块文件复用 `sanq_deploy.py` 的 `_profile/_signals/_execute`，沿用受保护的 `~/.sanq-deploy` 三文件、匹配 Agent Ed25519 公钥、唯一固定主机及受限 SSH 选项。新增脚本不允许其他目标/用户/端口/密钥或任意远端命令。

仅有以下**只读**子命令：

```sh
/bin/sh ops/release/sanq-install.sh status \
  --source-sha <40位小写main提交SHA> \
  --retention-id <64位小写保留材料ID>
```

实际命令只会通过固定身份运行：

```text
/usr/bin/systemctl --system show sanq-runtime-install-<retention-id>.service --no-pager --property=<固定11字段>
```

对 `loaded` 状态，核 `Transient=yes`、`Type=oneshot`，以及与目标 `source-sha` 和 `retention-id` 同时绑定的 **installation-run/installation-cleanup** 两条固定 `ExecStart/ExecStopPost` 命令。只允许从 `loaded` 或 `not-found` 得到观察结果；未知字段、重复字段、格式/身份错误、非零 SSH 返回和连接中断全部阻断，不输出成功观察。禁日志中回显原始的 `ExecStart` 及任何主机、密钥材料。查询只发一次 SSH，不自动重试。

观察 JSON 会明确输出 `managerIdentityMatched`、`invocationId` 及相关 manager 状态；始终固定 `installationComplete=false`、`canExecute=false`、`readyToInstall=false`、`restoreProven=false`。**manager 的 success、exit 0、unit not-found 以及本地客户端退出码 0 都不证明安装已完成或不存在历史任务**。首次安装服务既有 `CollectMode=inactive`，unit 可能被回收；后续仍需要独立、完整的持久证据链审阅，不能凭 unit 消失重提安装。

## 未实现/未授权事项

- 尚无 `installation-submit` Mac 交互同伴；未实现固定目标首帧、手工 AWS 快照内容核验、离机材料确认证据、过程中的可恢复交互协议。
- 尚无首次安装任务退出后**持久完成证据**的整体只读查询与独立一致性验证；本切片只查询 systemd 现存 unit。
- 生产目标/旧版 Runtime/配对镜像/交付包/受保护 bootstrap 尚须独立核验。首次安装不得借普通更新 `status` 代替。
- 现有 VM `install_minimal_executor.py installation-submit` 是高权限现场写入入口，**没有对外开放**；不允许根据本切片调用或将其复制到生产环境。
- 不创建系统服务、sudoers、持久状态/第二权威，未修改九 helper 或 17+Manifest；无依赖/Prisma 变动。

## 验证与下一批

新增 `ops/release/tests/test_sanq_deploy_install_status.py` 离线夹具，覆盖固定 SSH 命令、不准提交/任意参数、双角色 manager 同源同ID绑定、缺失/重复/非规范结果、误报成功、SSH 失败与无输出。Mac Python 3.14.10 CI 离线兼容 lane 通过既有 `test_sanq_deploy_*.py` 命名规则包含新增测试；release 两套 Python lane 继续覆盖。MCP-workspace 不提供 lint/build/test 权限，当前代码尚未在 CI/真机测试。

后续 **FI-MAC-1B** 在已审阅源码上增量实现安装操作者受限交互及准确持久结果查询，需要逐项复核现有 VM 首帧/双帧/离机协议、原两锁/任务身份、等待及未知结果语义。真实生产首次安装仍需新的明确授权，且 D4 后置故障/恢复验收保持 `DEFERRED`。
