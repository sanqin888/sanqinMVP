# Runtime 更新 — C1 P10-F4-B1 本机持久消费内核

**2026-10-25 F4-B2：CONTRACT_REVIEW_COMPLETE_LOCAL / FINALIZER_NOT_IMPLEMENTED / C1_OPEN。** F4-B1 [PR #2962](https://github.com/sanqin888/sanqinMVP/pull/2962)经[CI #7601](https://github.com/sanqin888/sanqinMVP/actions/runs/40231097040)成功合并e1b7d9eb：Runtime950/Release45/准确3.12.15回归282，含30新增测试，无修复。本批完成[终结与事故处置合同审阅](Runtime更新-C1-P10-F4B2终结与事故处置合同审阅.md)：现有非空ledger永久阻断，不能靠删除active或追加声明开放下一笔；需真实安装/保留状态/R2终态证据与配套多事务历史/崩溃协议。下一源码优先独立只读安装后目标复验；本批6份文档，无finalizer/schema升级、代码/依赖/迁移、R2或生产操作，无依赖图/债务/scanner基线变化，未运行新测试/CI、未推送。

**2026-10-25｜MERGED_DEV / CI_VERIFIED_OFFLINE / LOCAL_CONSUMPTION_ONLY / C1_OPEN。**

F4-B设计已由[PR #2961](https://github.com/sanqin888/sanqinMVP/pull/2961)交付，最终head `59248a3ed128f7ed397efc400764ed0d92bfc7ff` 经[CI #7599](https://github.com/sanqin888/sanqinMVP/actions/runs/40229924297)成功，范围作业成功、其余9作业按docs-only跳过，无CI修复；合并dev `99c79221751c31acf35776619d30388b3d22dc67`。本切片基于该提交，在feat/c1-p10f4b1-durable-admission-20261025实施。现由PR #2962最终head c55000c2862c0912a24371be4bb34f74f825ae25经CI #7601（run40231097040）成功，合并dev e1b7d9ebd6daa8c1bad358e1caeae7371b5ac291：4作业成功/6按范围跳过，Release45、Runtime950、准确CPython3.12.15回归282通过，包含30项新增测试，无CI修复。下文“未运行/未推送”保留为实施审阅时状态，以本段实际交付证据为准；不代表生产或真实断电验收。

## 1. 归属、入口与实际范围

新增ops/runtime/normal_runtime_local_admission.py，属于Runtime/Ops。仅依赖标准库与既有normal_runtime_inputs、normal_runtime_launch、normal_runtime_source_anchor；不依赖F4-A准备实现，不改变原Flow、R2、九源加载白名单、v1输入或固定17 Bundle。属于内部原子增量，无数据库迁移或包依赖变更。

- consume_local_attempt(launch_bytes, request_bytes, *, expected_launch_sha256, expected_request_sha256)：惰性context；进入时解析独立双pin及准确canonical v1输入，消费本机尝试身份并在context内持锁。
- handle.observation()：复核当前进程/线程、准确路径边及持有文件FD，返回本机观察。
- handle.record_abort(receipt_bytes, *, attempt_id)：仅本活跃handle/attempt追加一次有界、输入绑定的ABORTED观察；不能终结安装域。
- inspect_local_admission()：无参数、有界只读事故分类，也取得同一非阻塞锁；不修复状态。
- 不提供root/path/owner/安装ID覆盖、finalize/reset/delete/resume或从receipt重建handle的入口。handle拒绝pickle、跨进程/线程和关闭后使用。

这里消费的是**本机尝试身份**，尚未实现完整admit_and_verify_source。即使调用者提供匹配双pin，也不证明源码、当前安装、目标发布或主机真实身份；未来受信组合器必须先验证这些，再进入并持有context覆盖全部11阶段及必要abort。本批没有接Flow、产生StepCompletion、准备目标或获得效果能力。外部自报verified=true不属于入口参数。

## 2. 固定布局与对象绑定

预先受控交付的对象如下；本批未创建这些真实对象，也不提供部署命令。

| 对象 | 必需条件 |
| --- | --- |
| /root、/root/sanq-runtime-operator | root:root/0700目录，所有祖先和子对象同设备 |
| normal-update.lock（BASE下） | root:root/0600、空regular、单链接、既有稳定inode |
| normal-update-transactions（BASE下） | root:root/0700既有ledger父目录 |
| ledger/active.json | 本attempt全安装未知claim，create-only |
| ledger/<txid>.json | 同一claim原bytes的永久消费记录，create-only |
| ledger/<txid>.abort.json | 可选、本attempt的非授权事故观察，create-only |

BASE为/root/sanq-runtime-operator。从当前namespace的“/”逐层只读O_NOFOLLOW持有目录FD，核对类型、owner、mode、设备和路径边；lock以O_RDONLY|O_NOFOLLOW|O_NONBLOCK打开，再LOCK_EX|LOCK_NB。不同tx也用这个全安装锁。既有对象不自动创建/修复/chmod，不unlink/替换锁。

目录扫描最多接受3个控制对象，并用独立打开的“.”目录FD扫描，避免复用扫描偏移。控制文件最多32768字节，读取前先核regular/0600/root/单链接/设备；保留FD及准确stat/路径边，复核原bytes。FIFO、symlink、hardlink、错owner/mode/device、截断或额外对象拒绝。存在任何ledger内容时，首版内核均不开始新尝试；没有finalizer之前，即使旧记录完整也不放行新tx。

## 3. 创建顺序与未知状态

取得锁后检查ledger为空，再生成随机256bit attemptId；claim绑定txid、request/launch摘要、当前与目标Runtime/Archive、应用current/previous及保留状态摘要，schema为sanq.runtime.local-admission-claim.v1，phase为UNRESOLVED_LOCAL_CONSUMPTION。

1. dir_fd + O_EXCL创建active.json；只规范刚创建文件为0600，完成短写循环、文件fsync、同FD原bytes读回/对象核对、ledger父目录fsync。
2. 用同样规则创建<txid>.json，原bytes必须与active.json完全一致；再次文件与父目录fsync。
3. 复核准确两个成员、全部持有FD/原bytes和祖先/lock边，才yield活跃handle；context成功退出前再核对。
4. 任何创建/写入/读回/fsync失败都只关闭本次FD，保留未知claim/残片，不返回handle，不自动重试或删后再建。

退出context只关闭FD、释放OS锁；不清active、不解除消费、不恢复策略或业务。SIGKILL后由OS释放锁，但完整或残缺claim仍阻断新进程。实现不声称已验证真实断电/重启持久性、离机防回滚、快照回退或跨克隆单写者。

## 4. Abort与只读观察

Abort原件要求immutable、至多16384字节canonical JSON、现有normal-update-flow.v1 schema、status=ABORTED、flowCompleted=false、相同request/launch摘要、false权限及BLOCKED。保存其原canonical对象、摘要、claim摘要及准确attemptId，schema为sanq.runtime.local-admission-abort-observation.v1。它只是原观察的归属/完整性记录，**不认证其声称的生产效果**，不能作为已恢复或已终结证明。

写abort前先标记该handle已尝试，失败/未知不能再写一次；磁盘原claim不改。错误attempt或另一个request的receipt在写前拒绝，关闭/跨进程handle拒绝。内核不自动调用abort，也不把退出recheck的新错误覆盖原始异常；未来Flow组合仍须保留最初失败与独立abort失败。

| 只读status | 意义与后续 |
| --- | --- |
| NO_LOCAL_CLAIM_OBSERVED | 锁内点时观察为空；不是允许生产执行 |
| UNRESOLVED_ATTEMPT | 原claim与永久消费副本一致；所有新attempt仍阻断 |
| UNRESOLVED_WITH_ABORT_OBSERVATION | 另有本attempt准确关联的abort观察；仍未终结 |
| UNKNOWN_BLOCKING | 截断/缺失副本/额外控制/身份不一致等；无修复或删除 |

无效祖先/锁、锁busy抛拒绝异常；已有ledger结构异常返回UNKNOWN_BLOCKING。所有报告decision=BLOCKED，namespace/当前安装/来源真实性、持续维护、Flow、readyToInstall、authorizedToMutateProduction均false；newAttemptAuthorized在只读观察中恒false。磁盘JSON及本机锁不自证root namespace/真实installation。R2 InstallationAnchor/FenceBinding/epoch/CAS和持续维护仍是独立门禁。

## 5. 验证及下一步

新增30项聚焦测试，使用临时假namespace、真实Linux FD/flock及fork独立进程；没有生产路径或真实事务操作。覆盖同/不同tx跨进程竞争、关闭后新context/进程拒绝、SIGKILL后锁空闲仍阻断、错request/attempt abort、短写/零进度、文件/父目录fsync失败与顺序、消费副本失败、读回损坏、重复扫描、lock/ledger替换、owner/mode/device/link/FIFO、额外/孤立/截断/错误abort记录、FD关闭与原异常保留、空目录只读无授权和固定API。

已做源码/测试AST静态语法解析、输入合同/FD生命周期/失败语义及差异审阅；**未运行这30项测试或项目lint/build/test**。MCP-workspace未开放这些执行权限，实际验证必须由授权交付后的GitHub Actions完成。现有CI自动发现test_normal_runtime_*.py，并在Runtime总回归和准确CPython3.12.15回归中执行；未修改工作流/skip/基线。

下一步先远端交付并取得最终head CI证据；之后审阅独立终结器/事故处置的真实效果与R2验证合同，再推进可信组合器、全生命周期锁与F2/F3/F4-A交接。不能以本机claim、旧准备回执或Flow的REPORTED_COMPLETE替代这些工作。旧AWS观察与旧913258eb目标不自动升级为新现场状态，newest发布策略不变。P10-F/C1仍OPEN。
