# Runtime 更新 — C1 P10-F4-B5 有界历史只读解释器

**2026-10-25｜IMPLEMENTED_LOCAL / TESTS_NOT_RUN / HISTORY_STRUCTURE_ONLY / C1_OPEN。**

基于dev `f7108a584e92bed7e55835663b7d5d4ae2edeba6`。F4-B4设计[PR #2965](https://github.com/sanqin888/sanqinMVP/pull/2965)最终head ca0f2f3df62dd9b5d1a1b96c8db7db3bfd2a17e1 经[CI #7608](https://github.com/sanqin888/sanqinMVP/actions/runs/40236390823)成功（docs-only：1作业成功、9跳过），合并上述dev，无CI修复；该CI未运行Runtime测试。本批在feat/c1-p10f4b5-readonly-history-20261025实现，未推送、未运行新CI。

## 1. 范围与唯一入口

新增ops/runtime/normal_runtime_history_review.py，唯一公开入口inspect_fixed_history()无参数。仅观察固定root私有路径，获取既有全局flock，读取有限目录/事件并返回非授权结构报告；没有CLI、网络、writer、fsync、mkdir、chmod、删除、迁移、终结、恢复业务或Flow调用。

Runtime/Ops拥有新库及原local_admission；依赖为history_review→local_admission/inputs/launch和既有祖先工具，单向无循环，不改变业务owner或跨上下文边界。没有包依赖、数据库迁移、九源加载/v1批准输入、17 Bundle或Python3.12.15变更。

本批固定的是**只读解释器可识别的本机历史格式**，没有生产历史写入协议或部署。匹配此格式的文件仍全部是未认证声明，不能由其构造执行handle/StepCompletion或允许新事务。

## 2. 固定对象与共享锁

复用/root/sanq-runtime-operator及预交付normal-update.lock：真实/有效UID与GID均0，祖先root:root/0700、单设备、稳定路径边；锁必须既有空regular、root:root/0600、单链接，用只读NOFOLLOW/NONBLOCK/CLOEXEC FD取得LOCK_EX|LOCK_NB。

同时打开并保持两个既有root:root/0700、同设备、不同inode的目录：

- normal-update-transactions：原v1 ledger。任何成员均阻断；超过3项返回UNKNOWN_BLOCKING，不读取/修复其内容。
- normal-update-history-v2：本批有限历史。必须已经预交付；缺失、不安全或链接路径直接拒绝，不创建。

原normal_runtime_local_admission._locked仅将BASE祖先与lock部分抽成私有_locked_base；原_locked继续添加原v1目录FD/边关系检查，并保持原yield签名、root/owner/mode/device/lock规则、消费及abort语义。新解释器使用同一个helper/lock inode，从准确BASE打开两子目录，不走..或caller路径。成功前复查目录完整stat/边、祖先/锁；异常关闭本次自有FD，不覆盖原异常。

**没有切换v1消费入口。** 原v1仍不要求新v2目录，也尚未检查其历史；这正是F4-B4要求“任何未来v2 writer启用前须完成双布局共同准入和旧入口控制”的原因。本批不产生v2记录，不把只读解释器加入生产准入路径，不能因它存在就允许写入/绕过v1阻断。

## 3. 读取预算与对象保护

准确文件名为00000001.json至连续的00000256.json，不接受缺号、latest/额外文件或任意相对路径。最多256项、每项正数且不超过16384字节、总计不超过4 MiB。

用新打开的“.”目录FD进行有限扫描，避免扫描偏移复用；先核对准确名字集合，再只读O_NOFOLLOW|O_NONBLOCK打开事件。事件必须regular、root:root/0600、单链接、同设备；先检查大小再有限pread，保留所有合法文件FD、stat原键及原bytes。报告返回前再次核对FD/目录项和原bytes；目录mtime/ctime/nlink等也保持一致，不能在解析期间换出再换回同名对象。

读/解析失败可返回UNKNOWN_BLOCKING，但已有合法文件或目录/lock在观察期间改变时拒绝返回缓存结果。没有“修复尾项/补fsync/移走旧ledger再观察”的路径。

## 4. 准确认识的事件格式

每个原件必须ASCII、无重复key/float/nonfinite、准确canonical JSON对象，schema为sanq.runtime.local-history-event.v2，且只有以下字段：

| 字段 | 只读结构规则 |
| --- | --- |
| schema | 准确v2标识 |
| sequence | 准确int（不是bool），与文件序号相同 |
| previousSha256 | 首项64个0；其余等于前一事件完整原bytes的SHA256 |
| kind | CLAIM、ABORT_OBSERVATION或DISPOSITION_OBSERVATION |
| transactionId | 沿用原v1单叶txid语法 |
| attemptId、requestSha256、launchMaterialsSha256、claimSha256 | 非零64位小写hex；claimSha256指向claim payload原canonical bytes |
| payload | 对应种类的精确对象 |

CLAIM payload沿用sanq.runtime.local-admission-claim.v1及UNRESOLVED_LOCAL_CONSUMPTION，精确保留当前/目标Runtime与Archive、应用current/previous、保留状态摘要和attempt/input身份。顶层与payload必须一致，Runtime/Archive前后须不同；从全历史推导永久消费tx及已用attempt集合，禁止同tx重用（相同或不同request均拒绝）、attempt重复或两个未结束claim重叠。

ABORT_OBSERVATION payload只允许receiptSha256与receipt；原事故观察沿用normal-update-flow.v1的ABORTED、输入绑定及false/BLOCKED规则，摘要必须匹配，同attempt最多一条，不能结束claim。

DISPOSITION_OBSERVATION payload只允许outcome、evidenceSha256、r2StateSha256；outcome仅COMPLETION_CLAIM或INCIDENT_DISPOSITION_CLAIM，两摘要为非零hex。只关联当前同attempt/tx/input/claim；有abort后只能声明事故处置。解释器仅据此标记“结构上有处置声明”，不认证证据内容、R2、真实效果或fsync。之后新CLAIM即使结构相关，也不证明当时有真实准入。

本地序号/前序摘要不是R2 epoch、离机CAS、installation身份或抗快照回退证明。整段历史撤销/克隆等不能由这个本机解释器排除。

## 5. 报告上限

| status | 有限结论 |
| --- | --- |
| NO_LOCAL_HISTORY_OBSERVED | 两布局点时为空，不是执行许可 |
| LEGACY_LEDGER_BLOCKING | v1有成员，可能同时有v2历史；保留阻断 |
| UNRESOLVED_ATTEMPT | 有结构上未明claim，消费身份保留 |
| UNRESOLVED_WITH_ABORT_OBSERVATION | 另有归属相符的事故观察，仍未明 |
| DISPOSITION_CLAIM_UNAUTHENTICATED | 仅有结构相关的处置声明，不等于终结 |
| UNKNOWN_BLOCKING | 序列/字段/预算/对象等异常，不输出部分消费身份 |

有效结构报告包含eventCount、排序后的consumedTransactions、未认证处置数量、尚未明的tx/attempt及历史尾摘要。无效/未知报告不回传半解析身份或原件内容。

全部报告scope=STRUCTURE_ONLY_UNAUTHENTICATED、decision=BLOCKED，newAttemptAuthorized/dispositionAuthenticated/historyDurabilityVerified、来源与namespace认证、持续维护/R2处置、事务准入/终结、Flow、readyToInstall及authorizedToMutateProduction恒false。它不执行事件，不重放journal，不恢复策略或业务。

## 6. 验证、交付与下一步

新增31项测试，使用临时假namespace、真实FD/flock及fork独立进程，覆盖空/claim/abort/未认证处置和多事务序列、准确256项边界及257拒绝、各类预算、重复tx/attempt、错前序/身份/schema/类型/字段、截断/重复JSON/非canonical、v1残片/双布局冲突、link/FIFO/owner/mode/device/缺失目录、解析中原位写/同bytes替换/目录或lock替换、FD关闭、只读无写入及固定API。原30项v1内核测试继续覆盖共享scope整理后的消费/短写/fsync/中断/SIGKILL等行为。

已完成3份Python源码/测试AST静态语法检查、共享scope差异与FD生命周期/事件结构审阅；**31项新测试及项目lint/build/test尚未运行**。按AGENTS，实际门禁为授权后的GitHub Actions：Runtime全量与准确CPython3.12.15的test_normal_runtime_*.py回归自动发现，无CI修改或skip。

本批同步6份文档，未创建现场v2目录/锁/ledger、未执行生产源码或操作VM/云；owner/依赖图/债务/scanner基线不变。下一步先远端交付、核对最终head CI；随后实现前需审阅双布局共同准入/旧入口控制及有界追加的准确权限/失败协议。真实writer/finalizer、冻结基线采集、效果/R2验证及完整可信组合仍欠缺，P10-F/C1继续OPEN。
