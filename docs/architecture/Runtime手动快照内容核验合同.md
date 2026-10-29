# Runtime 手动快照内容核验合同

## D2 工具写入清单与耐久文件原语（本地待审）

**D2_TOOL_FILE_WRITE_LOCAL / TESTS_NOT_RUN / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

2026-10-29用户明确要求“恢复验证等交付之后抽空再做”。据此将新Lightsail完整快照恢复、PG/WAL/业务内容对照、仅机外取得和恢复适用范围验收移入交付后待办；不再阻断本项目源码推进或作为首版完成条件，也不记为PASS。恢复研究/已合并材料保留，restoreProven保持false。更新前准确手动快照available核验、旧工具/配置恢复材料保存及机外索引确认仍属于安装前置；安装/正常发布/失败冻结自身的验收继续按原交付范围执行。历史章节中“真实恢复通过后才能交付/RECOVERY_READY”的前置关系由本节调整，以SNAPSHOT_MATERIALS_READY表示安装材料就绪，与实际恢复证明分开。

基线为[PR #3049](https://github.com/sanqin888/sanqinMVP/pull/3049)合并dev `d7798ab48726574f47b04529a8ddcdf3c30c8e00`；其最终head `7062c657ed79c93f9fe1a3759204df23c166e5b2` 经[CI #7790](https://github.com/sanqin888/sanqinMVP/actions/runs/40909418492)SUCCESS（4成功/6范围跳过，两条Release各1244、Runtime1080、既有C1回归412）。本地分支 `feat/runtime-minimal-install-write-plan-20261029`。

私有_installation_tool_write_set复用exact main/归档/Git来源和原工具差异审计，再核完整18项旧观察的原字节/metadata；返回固定27项顺序清单及单独私有目标字节：先九helper独占创建，原17按批准范围替换或只核对，最后写原目标归档的准确Manifest。只允许deploy_release.py/release_contract.py两项Runtime内容变化，保留旧文件模式；helper为0644。bootstrap不落入Runtime，永久三门禁另属后续阶段。清单只绑定来源/顺序/摘要/原身份，不是现场观察或授权，readyToInstall/canExecute仍false。

私有_write_installation_tool_member使用调用方已固定的父目录FD、原字节/完整身份及现场复核回调；固定允许路径、root身份、owner/mode/单链接、≤300秒预算和5GiB余量。未变成员只读核对；写入先独占固定pending文件，短写循环、权限/文件fsync与整件读回，重新核原文件及pending后发布。替换用单文件rename并同步父目录；helper用不覆盖的硬链接发布、同步目录、移除pending后再同步目录，最终核内容/模式/身份。每个目录/文件原语不是整个安装原子事务。失败保留实际旧/新/pending，不清理或自动回滚；pending存在时连“未变核对”也拒绝。未修改现有读取白名单，也不以该底层原语独立认证来源/路径、锁或门禁。

新增28项原件/真实临时文件与故障模型测试，覆盖固定清单/源变更、原Manifest字节及权限、独占创建、同步/rename/读回顺序、短写/零进展、残件/竞态、链接/晚变、容量/截止、失败保留及无目标代码执行。Python3.10 AST/符号/差异/读回静态审阅完成；MCP-workspace未运行lint/build/test，本批未提交或推送。

本批仍为未接入现场事务的私有写入能力，现有安装入口不调用它。下一步在原两锁/同一owned流程、快照及机外确认后接逐项进度核验，再完成永久门禁、旧应用核验/完成交接和Mac入口；不能用导出的清单或随意回调发起生产安装。无新helper/永久unit、公开CLI、业务持久schema或第二应用state；仅新增固定pending中间件命名，后续owned清单须明确跟踪。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无依赖/业务迁移或生产/AWS/root安装/DB操作。

## D2 恢复数据库只读原始采集与比对（源码已合并）

**D2_RECOVERY_DATABASE_PROBE_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

最终[PR #3049](https://github.com/sanqin888/sanqinMVP/pull/3049)已由head `7062c657ed79c93f9fe1a3759204df23c166e5b2` 经[CI #7790](https://github.com/sanqin888/sanqinMVP/actions/runs/40909418492)全绿后合并dev `d7798ab48726574f47b04529a8ddcdf3c30c8e00`；两条Release各1244、Runtime1080、既有C1回归412通过。下文初次失败记录保留为历史。

本批已提交[PR #3049](https://github.com/sanqin888/sanqinMVP/pull/3049)。初次[CI #7789](https://github.com/sanqin888/sanqinMVP/actions/runs/40908506575)运行1244项Release测试，仅1项fixture失败：单行历史reverse不产生变化；同PR改为明确变更历史状态，保留原拒绝断言，未修改运行源码或CI门禁。修复后最终head的验证结果以该PR实际GitHub Actions记录为准。

基于[PR #3048](https://github.com/sanqin888/sanqinMVP/pull/3048)合并dev `ace53c9a6bf37563c44b203fa6c04aa89820e424` 创建 `feat/runtime-minimal-recovery-database-probe-20261029`。新增私有 `_capture_recovery_database_probe` 与纯数据 `_snapshot_recovery_database_review`：先重核独立新目标/原件，再通过已限定目标的只读端口执行原固定DB身份/迁移历史和存储查询各两次，保留四项准确argv、原始stdout/stderr及原生退出码。共享既有DB身份/历史校验器，原安装预检行为保持。

端口只接受固定查询和同一≤300秒截止时间，前后复核预算；输出每项stdout/stderr合计≤2MiB、stderr≤4KiB，完整规范采集≤8MiB。复核拒绝命令替换、顺序/数量/退出码/类型/摘要错配、前后漂移、源版本/身份/历史不符或默认表空间/配置路径越界。新容器ID必须独立指定，与源生命周期ID不要求相同；尚未通过真实Docker观察证明容器/镜像来源，不能只看SQL版本就宣称恢复成功。

成功仅为RECOVERY_DATABASE_TRANSCRIPT_MATCHED_EVIDENCE_REQUIRED / databaseTranscriptReviewed=true；readOnlyQuerySessionObserved只描述查询会话。端口目标认证、真实新主机、云隔离/血缘、DB镜像、完整集群/哨兵及持久内容仍未证明，恢复/安装/执行许可均false，五组真实证据保持OPEN。返回的raw为私有原件，不直接日志/输出；没有新增磁盘回执/SSH适配器/CLI，不接旧事务，不发HTTP或启停服务。真实调用方须先完成授权、新端点与容器绑定、隔离，并由端口所有者保留失败/中断的原始输出；本实现未实际访问恢复主机或声称已耐久保存。

新增23项回归测试，覆盖原始采集/严格复核、独立范围、固定查询/退出码、输入/输出预算、截止时间、源身份/版本/历史、前后漂移、默认表空间、无IO回放/秘密投影和断连不重试。完成Python3.10 AST/符号/差异/读回静态审阅；MCP-workspace未运行lint/build/test；实际执行与CI修复记录见本节PR说明。下一步在准确授权的新目标适配实际只读端口，补充真实Docker/主机/门禁与持久内容原件和D4统一恢复验收；当前不启用RECOVERY_READY。

本批为bootstrap同所有者内私有工具原子新增/校验器提取，无新helper/永久单元/持久schema/业务路径或第二应用state；已审阅，依赖图/基线无变化。17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持；无依赖、业务迁移、生产/AWS/root安装或DB写入。

详细原件格式与真实端口边界见[恢复前置证据合同](Runtime最小执行器恢复前置证据合同.md)。

## D2 独立恢复实例目标绑定（源码已合并）

**D2_RECOVERY_REPLACEMENT_TARGET_MERGED_DEV / SOURCE_CI_VERIFIED / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

本批[PR #3048](https://github.com/sanqin888/sanqinMVP/pull/3048)最终head `41bba8678fa2d77b06a4b83f277ca9c29e00cd38` 经[CI #7787](https://github.com/sanqin888/sanqinMVP/actions/runs/40903776855)SUCCESS（4成功/6范围跳过；两条Release各1221、Runtime1080、既有C1回归412），已合并dev `ace53c9a6bf37563c44b203fa6c04aa89820e424`，无需CI修复；无生产/AWS操作。

基于[PR #3047](https://github.com/sanqin888/sanqinMVP/pull/3047)合并dev `91c242aa1b0b8b488e4943d134d15cb9ca7f5563` 创建 `feat/runtime-minimal-recovery-replacement-target-20261029`。私有 `_snapshot_recovery_replacement_review` 复用原件材料审计重算basis，将新目标输入与独立传入的八项预期上下文逐项核对；拒绝源实例ARN、源名称或源SSH路由复用。目标限原账户/区域、单系统盘及原容量；设备名和同区域可用区可以变化，不能把源机物理身份直接套到克隆机。

恢复目标使用严格规范输入封装，保留原目标JSON的准确字节及摘要，复用既有实例/SSH/磁盘校验。它是数据核对入口，不接受PASS，不连接SSH、查询AWS、执行主机命令或写磁盘，不接回原安装事务。克隆可保留原SSH公钥；相同指纹既不证明新目标正确，也不是拒绝克隆的依据，须在准确新实例上独立核对。云来源、快照到新实例的实际血缘、启动前隔离和新主机观察均未证明，全部恢复/安装/执行许可保持false。

新增19项回归测试，覆盖独立上下文/原件/索引/basis错配、源实例与路由误用、跨账户/区域、规范输入和预算、单盘容量、克隆公钥/设备身份、原件来源不可用、无IO/命令和无秘密回显。Python3.10 AST/符号/最终差异静态审阅完成；MCP-workspace未运行lint/build/test；上述19项已随最终head两条Release各1221项通过CI。下一步按准确新目标实现只读原始证据采集与比对，真实D4证据和授权仍待落实，不能提前晋级RECOVERY_READY。

本批为bootstrap同所有者内新增私有能力，无新helper/永久单元/持久记录/公开CLI或第二应用state；已审阅，依赖图和基线无变化。17+Manifest/250/300、九helper/三永久模板和三组暂停研究保持；无依赖、业务迁移、生产/AWS/root安装或DB操作。

详细输入与真实采集边界见[恢复前置证据合同](Runtime最小执行器恢复前置证据合同.md)。

## D2 恢复材料关联审计与证据合同（源码已合并）

**D2_RECOVERY_MATERIAL_REVIEW_MERGED_DEV / SOURCE_CI_VERIFIED / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

本批[PR #3047](https://github.com/sanqin888/sanqinMVP/pull/3047)最终head `bc67365544f8d8e5dcaf13ee00eed3abf5d6e25e` 经[CI #7785](https://github.com/sanqin888/sanqinMVP/actions/runs/40900423458)SUCCESS（4成功/6范围跳过；两条Release各1202、Runtime1080、既有C1回归412），已合并dev `91c242aa1b0b8b488e4943d134d15cb9ca7f5563`，无需CI修复；无生产/AWS操作。

基于[PR #3046](https://github.com/sanqin888/sanqinMVP/pull/3046)合并dev `335cb5b1a117716f993b22e3dcec03edda12d1b6` 创建 `feat/runtime-minimal-recovery-material-review-20261029`。本批新增[恢复前置证据合同](Runtime最小执行器恢复前置证据合同.md)和私有 `_snapshot_recovery_material_review`：将机外index与快照拍摄前intent/writers/恢复二件关联，强制原目标/存储成员及整体来源/范围审计，核准确摘要、ID、source/retention、账户/区域/原实例、观察与应用绑定。既有VM确认流程在确认回执保存后调用，并再次复核现场；未新增磁盘记录、阶段开关或公开入口。

独立审计不要求晚于快照生成的snapshot-review/offhost回执，避免故障时依赖不可能在快照中的材料。index的review hash只是保留元数据，postSnapshotReviewDigestRecomputed=false；快照定位仍属于操作者保留的机外index，不视为云签名认证。输出原机basis/规范摘要（≤16KiB），包括source/应用、DB镜像ID/版本/迁移历史、Docker平台/系统Python、固定持久路径和原件摘要；它们不是新恢复机的已验证观察，也不能机械比较新机实例ID、设备/inode等易变身份。

成功只表示RECOVERY_MATERIALS_BOUND_EVIDENCE_REQUIRED / materialBindingsReviewed=true；恢复一致性、隔离替代实例门禁、完整集群、持久内容/Runtime和仅机外取得材料五组实际证据仍OPEN。requiresIsolatedRestoreEvidence/requiresHostRecheck为true，restoreProven/snapshotAvailable/recoveryReady/readyToInstall/canExecute/authorizedToMutateProduction保持false。当前无消费手填PASS/恢复结果的schema或晋级路径；hash自洽、available、只读SQL会话或CI均不替代真实恢复。

新增17项原件/主机模型与数据测试，覆盖不需要晚生成回执、原件摘要与source/retention/目标错配、自洽旧范围降级、来源不可用、输入/输出预算、无主机IO/命令回放、无秘密回显、basis重复性、同锁确认后审计、失败保留与最终现场晚变。Python3.10 AST/符号/差异静态核对完成；MCP-workspace未运行lint/build/test；上述17项已随最终head两条Release各1202项通过CI。下一步按合同固定真实隔离演练的目标/采集边界与原始证据格式，再实现严格证据验证及适用范围加载；真实授权/验收到位前不启用RECOVERY_READY。工具安装、永久门禁交接、Mac薄入口及D4统一验收仍待完成，不增加新长期研究。

本批是bootstrap同一所有者内的原子审计能力与兼容新增返回字段，没有新持久schema/业务双读路径或依赖/业务迁移；PRIVATE_FILES/RECOVERY_FILES、既有回执格式、17+Manifest/250/300、九helper/三永久模板和唯一应用state保持。旧源码/证据及三组暂停研究保留，无生产、AWS、root安装或数据库操作。

## D2 VM持锁离机索引确认与耐久回执（源码已合并）

**D2_OFFHOST_CONFIRMATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3046](https://github.com/sanqin888/sanqinMVP/pull/3046)最终head `31f0bfd01bdf08491a73de9bc668e1d1d80728c6` 经[CI #7783](https://github.com/sanqin888/sanqinMVP/actions/runs/40887429269)SUCCESS（4成功/6范围跳过；两条Release各1185、Runtime1080、既有C1回归412），已合并dev `335cb5b1a117716f993b22e3dcec03edda12d1b6`，无需CI修复；无生产/AWS操作。

基于[PR #3045](https://github.com/sanqin888/sanqinMVP/pull/3045)已合并dev `b241d21e1aa4fd906ccacf2a138d1c729be6c80d` 创建 `feat/runtime-minimal-offhost-confirmation-20261029`。新增私有 `_confirm_installation_offhost_index`：原两锁/完整目标与存储预检、意图/临时门禁/原ID停写、恢复包与snapshot-review耐久保存及现场复核后，从原件重算索引并生成本轮新transfer nonce，沿原活跃FD等待准确ack。旧回执入口不自动等待第二次输入；新原生bool开关要求完整前置，不接受导入ack/磁盘成功票据或resume。

复用原有界selectors/FD flags恢复/短写/单帧接收；普通快照请求默认仍≤4096字节，只有私有索引交接使用既定≤32KiB请求。底层原64KiB接收上限不变，严格ack解析再限≤16KiB；两次等待各自最多1800秒，不代表总维护时间承诺。每阶段前后重新启动300秒现场预算，核原件/来源/原意图、门禁/停写对象、DB/存储和恢复包；FD替换、超时、EOF、错nonce/hash/字节数或漂移沿FENCE_UNCONFIRMED保留，不自动重试或开启业务。

固定新增 `installation-runs/<installationId>/snapshot-offhost.json`，schemaVersion=1、kind=sanq-minimal-snapshot-offhost-receipt，精确12字段/≤128KiB，保存准确transfer/ack ASCII原字节、原review摘要、本轮ID、完整写出/收到时间及明确的信任/false许可。纯数据复核从原review+intent/writers/恢复二件重算索引，拒绝自洽改hash替换原件；时间必须在原review收到回复之后且本次写出≤收到ack。固定root:root/0600、父0700、5GiB余量、O_EXCL/nofollow、文件/目录fsync和完整读回/metadata重核。仅本调用栈持有准确原字节时owned/退出清单允许该成员；半写、读回失败或晚变均保留。

只有活跃ack比对、VM回执实际耐久保存及最终现场复核后，才返回OFFHOST_INDEX_CONFIRMED、offHostReceiptDurable/offHostRetentionConfirmed=true与requiresOffHostRetention=false；该确认明确限定operator-ssh-peer-durable-receipt，offHostLocationIndependentlyAuthenticated=false。既有不可变索引中的offHostRetentionConfirmed仍false，表示索引生成时状态，不回写其字节。AWS来源/可信时间/restore/snapshotAvailable/recoveryReady/canExecute仍false，requiresRecoveryValidation/requiresHostRecheck仍true；客户端持久化声明不代替准确拓扑的一致性/实际恢复证据。最终两份VM核验/确认回执均晚于快照，不能要求它们出现在该快照中。

新增22项真实双帧管道、一次性文件和主机模型测试，覆盖同锁且review/恢复包后交接、客户端实际写入、FD flags、完整写出回调、数据重算/原件与自洽hash篡改、错nonce/EOF/超时模型、通道替换、保存前后原件/存储漂移、等待超过旧预算、owned原字节/严格成员、短写/同步/读回/权限/链接/大小、部分保留、禁止重放与旧入口隔离。上述22项已随最终head两条Release各1185项通过CI；完成Python3.10 AST/符号/差异静态核对，MCP-workspace未运行lint/build/test，实际Mac/SSH/恢复仍未验收。下一步为真实恢复前置证据门禁/RECOVERY_READY，再接工具安装、永久门禁交接、Mac薄入口和D4统一隔离验收；不宣称已在实际Mac/SSH/生产完成交接。

本批为私有工具事务/协议的兼容增量，生产者与读者同bootstrap同步更新，仅新增固定确认回执；不改写历史intent/marker/writers、review或恢复包，不创建第二应用state/并行业务路径。PRIVATE_FILES四材料/RECOVERY_FILES二件、17+Manifest/250/300、九helper/三永久模板、依赖/业务schema与迁移保持；三组研究继续暂停，无生产/AWS操作。

### 本地VM确认与回执合同

| 对象 | 本批固定规则 |
| --- | --- |
| 唯一新入口 | 私有_confirm_installation_offhost_index，_confirm_offhost_index原生bool要求_retain_snapshot_review及原完整阶段；没有导入ack/回执、自动resume或公开CLI。普通回执入口仍只完成原一轮等待 |
| 交接顺序 | 原review文件耐久保存→完整现场/原件核对→从原review重算准确index→新transfer nonce→原FD完整输出→单帧ack→原件/现场重核→VM确认回执独占保存→再复核→返回内存确认 |
| 传输预算 | 普通请求默认4096，私有索引请求≤32KiB；底层接收沿原64KiB上限，ack严格解析≤16KiB。每轮独立≤1800秒；两轮前后各刷新300秒现场预算，完整输出回调必须恰好一次。借用FD原身份/flags前后核对，不开路径/进程或关闭调用者FD |
| 新固定文件 | /opt/sanq/deploy-state/installation-runs/<installationId>/snapshot-offhost.json；schemaVersion=1、kind=sanq-minimal-snapshot-offhost-receipt，≤128KiB，root:root/0600/nlink1，父0700。不是PRIVATE_FILES/recovery二件或原review文件，不回写历史字节 |
| 精确12字段 | schemaVersion/kind/installationId/snapshotReviewSha256/transferOriginal/ackOriginal/requestSentAt/replyReceivedAt/verificationMethod/offHostLocationIndependentlyAuthenticated/canExecute/recoveryReady。原transfer/ack以准确ASCII字符串保留；后四项为固定方法与明确false许可 |
| 数据复核 | 对照原intent/writers/tar/recovery回执及原review，重新生成index字节并与transfer精确比较，复核client ack的nonce/ID/review/index hash/大小/声明；换index后重算外层hash不能替代原review。原review收到回复≤本次完整写出≤收到ack，时间规范UTC微秒，不宣称独立可信时间 |
| IO/owned | 5GiB余量、固定叶名O_EXCL/nofollow、短写/文件与目录fsync、准确整件读回、写后metadata稳定；只接受本调用栈持有的原review和确认原字节。所有owned/退出清单重核，缺件/多件/半写/替换或晚变阻断，保留实际文件及停写 |
| 成功语义 | 顶层INSTALLATION_OFFHOST_INDEX_CONFIRMED，内层OFFHOST_INDEX_CONFIRMED；活跃匹配ack+实际VM耐久回执+最终重核后，外层offHostRetentionConfirmed/offHostReceiptDurable=true、requiresOffHostRetention=false。此结论限定operator-ssh-peer-durable-receipt，独立机外位置认证false；不可变index原false字段继续表示生成时状态 |
| 剩余门禁 | clientIndexDurable是对端程序的实际保存声明，未证明AWS认证、存储硬件或真实恢复；snapshotAvailable/recoveryReady/canExecute/restoreProven仍false，requiresRecoveryValidation/requiresHostRecheck仍true。仍须恢复前置证据门禁、Mac薄入口和D4真实Mac/SSH/拓扑恢复及中断验收 |

新VM确认回执晚于客户端索引写入，不把该回执摘要反向写进原index形成循环绑定；两份VM最终回执也均晚于原快照。灾难恢复时仍按准确机外对象索引与快照内原意图/writers/恢复包比对，不要求快照中存在晚生成材料，不凭已保存确认自动恢复或开启业务。

## D2 离机索引客户端耐久接收器（源码已合并）

**D2_OFFHOST_INDEX_RECEIVER_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3045](https://github.com/sanqin888/sanqinMVP/pull/3045)最终head `168699d42cbc27033e66961732e99d3993ee7c59` 经[CI #7781](https://github.com/sanqin888/sanqinMVP/actions/runs/40882535335)SUCCESS（4成功/6范围跳过；两条Release各1163、Runtime1080、既有C1回归412），已合并dev `b241d21e1aa4fd906ccacf2a138d1c729be6c80d`，无需CI修复；无生产/AWS操作。

基于[PR #3044](https://github.com/sanqin888/sanqinMVP/pull/3044)合并dev `cf99b573334eb6e1104c6ae73254748e2baf1d8f` 创建 `feat/runtime-minimal-offhost-index-receiver-20261029`。本批实现客户端索引交接的准备能力：既有索引生成器复用新增严格41字段解析器；私有transfer工厂生成独立随机32字节challenge并绑定准确索引hash/大小；客户端只在完成保存后生成确认帧。尚未把该协议接入VM原持锁等待/确认落盘链，不提升任何VM许可。

索引≤16KiB、transfer≤32KiB、ack≤16KiB，均规范JSON/严格字段/原生类型；逐项核摘要、source/安装/retention身份、账户/区域/实例/快照ARN、完整challenge名、可用区、规范UTC时间及固定材料路径，拒绝任意metadata或权限字段。客户端必须独立传入已验证SSH/本轮上下文六项：accountId、region、instanceArn、instanceName、installationId、snapshotReviewSha256；与输入不符即在IO前拒绝，不能从transfer自行建立“预期”目标。

私有 `_retain_snapshot_index_offhost` 只允许非root Linux/Darwin进程和原生true的机外操作员确认。调用者选已存在的绝对0700私有目录，逐级nofollow打开并保留/复核祖先FD身份；路径不来自VM帧，拒绝系统/生产路径、符号链接、歧义或不可信可写祖先。仅独占创建固定 `snapshot-index-<installationId>.json`、0600/单链接，短写循环、文件/目录fsync、完整读回及metadata/路径重核；不自动建目录、覆盖、删除或重试。Darwin还要求可用F_FULLFSYNC，文件/目录fsync之后执行，缺失或失败不降级；实际APFS/设备/SSH行为仍待D4。

只有全部IO和目录退出核对成功后，才返回绑定transferChallenge、installationId、review/index摘要及准确字节数的ack，clientIndexDurable/operatorConfirmedOffHost为true，canExecute/recoveryReady仍false。clientIndexDurable仅描述该进程实际系统调用/读回成功；机外位置依赖操作者及既有SSH上下文，不构成独立机器认证、AWS认证或存储硬件/真实恢复证明。索引原offHostRetentionConfirmed=false和全部false许可保持；VM尚未消费ack。断连/丢ack/部分文件均保留并阻断自动重放，未声明真正生产机外保存已完成。

新增22项纯数据、真实一次性文件与模型测试，覆盖所有必需字段/null、hash/ARN/名称/类型/权限/路径、独立上下文、实际短写与同步顺序、已有文件/链接/祖先替换、容量/读回/晚变/部分失败、Darwin能力/失败不回退、旧nonce确认拒绝、既有真实owned投影接新解析器及无VM命令/公开CLI。上述22项已随最终head两条Release各1163项通过CI；完成Python3.10 AST/符号和差异静态核对，MCP-workspace未运行lint/build/test，实际Mac/文件系统/SSH仍未验收。下一步把transfer/ack接入原持锁维护流，核准确VM回执并耐久保存确认，再落实恢复前置证据门禁和Mac薄入口/D4统一验收。

本批仅同bootstrap私有工具协议/用户侧索引文件的新增能力，旧索引41字段字节及既有VM入口行为保持，无旧数据回填、业务双读路径、依赖或业务schema/迁移；未改变PRIVATE_FILES/RECOVERY_FILES、17+Manifest/250/300、九helper/三永久模板或唯一应用state。三组研究继续暂停，无生产/AWS操作。

### 本地客户端交接协议

| 对象 | 当前私有合同 |
| --- | --- |
| index | 原schemaVersion=1、kind=sanq-minimal-snapshot-offhost-index，精确41字段/≤16KiB。新解析器与原生成器共用，不改原规范字节；本地解析只说明字段一致，不认证VM/AWS来源 |
| transfer | ≤32KiB规范JSON，精确六字段schemaVersion=1、kind=sanq-minimal-snapshot-index-transfer、transferChallenge（新32字节随机数的64位hex）、indexSha256、indexBytes（原生int）、index（严格对象）；与原快照challenge分开 |
| 独立上下文 | 客户端required expected精确六字段accountId/region/instanceArn/instanceName/installationId/snapshotReviewSha256，从既有已验证SSH会话及前段本轮信息固定；不得从待核transfer自行构造expected。另须原生true的operator_confirmed_off_host，不认证其物理机器声明 |
| 保存入口 | 私有_retain_snapshot_index_offhost，不是公开Mac CLI或root launcher。非root，仅Linux/Darwin；directory为调用者选定的已存在绝对0700目录，不取transfer路径作本地输出，不自动建目录或覆盖原文件 |
| 祖先/叶子 | 每段ODIR/nofollow且持FD，祖先仅root/当前UID持有、非组/其他可写（root sticky目录例外）；最终UID必须当前用户。固定snapshot-index-<installationId>.json，O_EXCL/nofollow、0600/nlink=1，≤16KiB；目录及FD/路径身份前后重核 |
| IO/同步 | 短写循环，1MiB+实际index大小余量，文件fsync→目录fsync；Darwin再F_FULLFSYNC(file)，缺能力/失败不回退。完整读回准确原规范index字节，晚变或路径替换不返回ack；保留所有部分/完整文件，不自动重试 |
| ack | ≤16KiB规范JSON，精确12字段schemaVersion=1、kind=sanq-minimal-snapshot-index-ack、installationId、snapshotReviewSha256、indexSha256、indexBytes、transferChallenge、operatorConfirmedOffHost=true、clientIndexDurable=true、syncMethod、canExecute=false、recoveryReady=false；syncMethod仅posix-fsync/darwin-fullfsync |
| 比对边界 | _snapshot_index_ack_value仅纯数据比对原transfer的nonce/本轮/准确hash/字节数；确认帧不是VM执行票据。VM尚不发送transfer、等待/消费ack、写确认记录或改变offHostRetentionConfirmed；不得用离线导入ack继续安装 |
| 中断/恢复 | 同installationId的已有文件（含半写、symlink、同字节重试）均拒绝覆盖；lost ack不是成功，也不自动重新保存/重放。机外位置依赖现有操作者/SSH信任，不扩大到PKI、Enrollment、可信时间或跨克隆研究 |

同步策略依据[Apple fsync存档](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/fsync.2.html)、[fcntl存档](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/fcntl.2.html)及[CPython fcntl常量源码](https://github.com/python/cpython/blob/main/Modules/fcntlmodule.c)核对（2026-10-29）；它们不证明所选Mac解释器、APFS、设备或断电恢复行为。实际F_FULLFSYNC可用性/目录同步/断连/磁盘读回必须在D4对准确Mac环境验收，不据Linux模型标Mac通过。

## D2 快照核验耐久回执与离机索引（源码已合并）

**D2_SNAPSHOT_REVIEW_RECEIPT_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3044](https://github.com/sanqin888/sanqinMVP/pull/3044)最终head `c5947522d852ba6356e2cad393f4da362a15eeab` 经[CI #7779](https://github.com/sanqin888/sanqinMVP/actions/runs/40879127073)SUCCESS（4成功/6范围跳过；两条Release各1141、Runtime1080、既有C1回归412），已合并dev `cf99b573334eb6e1104c6ae73254748e2baf1d8f`。初次CI #7778重放测试的等待线程断言遮住预期维护拒绝；同PR仅给fixture透传exchange，重放分支禁止进入等待，未改源码行为或CI门禁。

基于[PR #3043](https://github.com/sanqin888/sanqinMVP/pull/3043)已合并dev `11d733b240d1af1a27bcec5c57a8d1f034e2f1a2` 创建 `feat/runtime-minimal-snapshot-review-receipt-20261029`。新增私有 `_retain_installation_snapshot_review`，只在原两锁、完整目标/存储预检、意图/临时门禁/原ID停写、恢复包耐久保存、活跃challenge内容核验之后保存本轮回执；原内存核验入口仍不写新文件。

固定新增 `installation-runs/<installationId>/snapshot-review.json`：schemaVersion=1、kind=sanq-minimal-snapshot-review，保存完整规范请求、准确回复原始字节的ASCII字符串、完整写出/收到时间和可重算的原内容结果。原始结果继续保留写入前requiresDurableSnapshotReceipt=true；只有本流程实际O_EXCL/nofollow创建、root:root/0600、文件及目录fsync、整件读回、写后metadata稳定和最终现场复核完成，才对外返回snapshotReviewDurable=true及requiresDurableSnapshotReceipt=false。文件≤192KiB，父事务目录0700，复用5GiB余量；不增加原归档上限或改变PRIVATE_FILES四材料/RECOVERY_FILES二件。

纯数据复核先对照原intent/writers/恢复tar及回执五项准确绑定，再从恢复包原件重算目标/存储和原意图观察摘要，重跑快照内容/时间校验并逐字节比较结果；不能仅信持久化成功标记。原事务owned记录/退出清单只在持有本次准确回执字节与完整恢复包时允许该固定新成员；缺失、替换、额外文件、半写、同步/读回/保存后漂移均阻断并保留实际证据，不自动清理、重放或开启业务。

生成≤16KiB固定字段离机索引，包含准确账户/区域/源实例/快照对象、本轮challenge、意图/writers/归档/回执/目标/核验原件摘要、source/retention身份和固定材料路径；任意AWS metadata、完整回复、配置/主机原件不回显。索引只是待Mac保存的内存投影，offHostRetentionConfirmed=false、requiresOffHostRetention=true；快照先于最终回执，snapshotContainsFinalReview=false。保存回执不证明已存机外、云来源认证、可信时间或DB恢复，snapshotAvailable/recoveryReady/canExecute/restoreProven仍false。

新增20项一次性文件/主机模型及纯数据/IO测试，覆盖准确同锁/停写/耐久顺序、原件重算、字段/绑定/规范格式篡改、只投影索引、显式owned证据、实际短写/同步/读回、权限/链接/容量、失败原样保留与禁止重放、保存后存储漂移、旧入口隔离和无公开CLI。上述20项已随最终head两条Release各1141项通过CI；完成Python3.10 AST/符号/差异静态核对，MCP-workspace未运行lint/build/test，真实平台/恢复仍未验证。下一步补离机索引的耐久接收确认与真实恢复前置证据门禁，再接RECOVERY_READY/安装，D4真实恢复/中断验收仍OPEN。

本批为私有工具事务的兼容增量：生产者/读者在同一bootstrap同步发布，只新增固定回执，不改写历史意图/marker/writers/恢复包或创建业务双控制路径；无依赖、业务schema/迁移、17+Manifest/250/300、九helper/三永久模板或唯一应用state变化。三组研究保持暂停，无生产/AWS操作。

### 本地耐久回执与索引合同

| 对象 | 固定规则 |
| --- | --- |
| 新入口/开关 | _retain_installation_snapshot_review / _retain_snapshot_review=true，只允许完整原两锁+目标+活跃通道+恢复包流程；首次开始前即核原生bool及阶段依赖，无导入回执/resume/公开CLI |
| 回执位置 | /opt/sanq/deploy-state/installation-runs/<64位installationId>/snapshot-review.json；不是PRIVATE_FILES或recovery/成员，不改原意图、marker、writers和recovery二件 |
| 格式 | schemaVersion=1、kind=sanq-minimal-snapshot-review，精确八字段schemaVersion/kind/installationId/request/replyOriginal/requestSentAt/replyReceivedAt/result；规范JSON、≤192KiB。replyOriginal保留准确单帧ASCII原字节，可重建原摘要；request也可重建准确规范输出 |
| 校验绑定 | 请求严格固定字段/schema/1800秒/false许可，与原installationId及intent/writers/tar/recovery回执摘要精确匹配；重新核恢复包目标原件和原intent观察，再重跑内容/时间验证，结果必须规范字节一致。不靠自报result或重新计算外层hash替换原意图 |
| IO | root:root/0600、nlink=1，父0700；固定叶名O_EXCL+O_NOFOLLOW，短写循环、5GiB余量、文件及目录fsync、整件读回、写后FD/路径metadata一致。部分文件保留，不覆盖、不截断、不unlink；低层IO本身不授予安装权 |
| owned核对 | 只有当前调用栈记录的准确回执字节及完整原恢复包，才允许固定新成员；所有后续owned/退出检查重新读取/校验。额外文件、缺失、替换或保存后漂移阻断，不采用磁盘回执自动续跑 |
| 索引 | schemaVersion=1、kind=sanq-minimal-snapshot-offhost-index；固定字段≤16KiB，包含账户/区域/实例/快照、本轮六项绑定与核验原件hash、源/retention身份、固定材料路径及回执hash。未把索引嵌回回执，避免循环摘要；任意metadata/完整回复/配置不对外回显 |
| 实际状态 | 成功仅INSTALLATION_SNAPSHOT_REVIEW_RETAINED / SNAPSHOT_REVIEW_RETAINED；snapshotReviewDurable=true是本轮实际IO后的内存事实，record.result仍是保存前内容比较。索引只生成未保存机外，offHostRetentionConfirmed=false、requiresOffHostRetention=true；AWS/时间/restore/安装/恢复许可仍false |
| 快照恢复 | 最终回执生成在快照之后，snapshotContainsFinalReview=false；机外索引以后须和快照内原intent/writers/恢复包核对，不能要求快照内存在晚生成的回执，也不能只凭机内回执判故障机外材料已可得 |

该已合并批次补齐回执保存和索引生成，20项测试已随PR #3044最终CI通过；本地客户端接收/确认帧状态见首节，尚无VM活跃确认/持久化和真实Mac验收，也未完成准确拓扑的恢复前置证据门禁，不得直接提升为RECOVERY_READY。

## D2 手动快照内容校验（源码已合并）

**D2_SNAPSHOT_CONTENT_VALIDATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3043](https://github.com/sanqin888/sanqinMVP/pull/3043)最终head `51a945e67d7f304a21e6f2f475284c86e708e098` 经[CI #7776](https://github.com/sanqin888/sanqinMVP/actions/runs/40870736100)SUCCESS（4成功/6范围跳过；两条Release各1121、Runtime1080、既有C1回归412），已合并dev `11d733b240d1af1a27bcec5c57a8d1f034e2f1a2`，无需CI修复；无生产/AWS操作。

基于[PR #3042](https://github.com/sanqin888/sanqinMVP/pull/3042)已合并dev `02dc3be9b3741024bc9ac31f5ad062992b0b89b9` 创建 `feat/runtime-minimal-snapshot-content-validation-20261029`。私有 `_review_installation_snapshot_content` 将已绑定目标/存储恢复包接入原同锁等待链：耐久包之后才发challenge，等待前后强制核目标原件/意图与完整现场；旧只读、恢复保存及未核验输入入口继续各自原行为。

新请求展示原账户/区域/实例、目标/存储摘要及完整 `sanq-runtime-<64位challenge>` 名称。单帧回复沿原六项绑定/64KiB/1800秒限制，内容逐项核手动快照ARN/完整名称、来源实例、available状态、区域、原生bool/int、明确空fromAttachedDisks及系统盘大小；快照可用区允许all或准确源可用区，分别保留。操作者须明确确认已认证AWS会话及完整challenge后创建，并声明准确对象/available观察时间；这些是人工声明，不构成服务端AWS认证。

完整请求写入FD后、开始读回复前记录本机UTC时间；创建/观察必须满足prepared≤完整写出≤createdAt≤available观察≤收到回复。输入选用带显式时区的RFC3339字符串、秒小数0–6位，规范到UTC微秒；拒绝无时区、未知-00:00、非法日期/偏移、超精度及epoch数值，不猜AWS数字单位。Mac薄入口尚未实现，未来须显式转换数字时间；操作者确认实际显示后创建。该顺序仅在本机/人工时钟信任范围内有效，时钟矛盾阻断，不宣称可信时间。

新增25项纯内容比较、真实管道和完整主机模型测试，覆盖all/来源区分、每个必需字段缺失/null、错账户/区域/来源/名称、pending/error/伪成功、附加盘/类型、人工声明、时区/精度/顺序、原绑定替换、原件漂移、完整短写回调、同锁且耐久包后等待、失败保留及禁止重放。上述25项已随本批两条Release各1121项通过最终CI；Python3.10 AST/符号及差异静态核对完成，MCP-workspace未执行lint/build/test，真实平台/恢复仍未验证。

通过仅返回内存 `SNAPSHOT_CONTENT_VALIDATED` 摘要和 `snapshotContentValidated/snapshotEvidenceValidated=true`，不回显任意AWS元数据或原件。awsOriginAuthenticated/trustedTimeProven/restoreProven/snapshotAvailable/recoveryReady/canExecute仍false，requiresDurableSnapshotReceipt/requiresRecoveryValidation/requiresHostRecheck为true；尚无快照核验磁盘回执或离机索引。下一步为耐久核验回执、离机定位及真实恢复前置门禁，再接安装。该私有同bootstrap输入属于内部原子增量，无新持久schema/兼容路径、依赖或业务迁移；17+Manifest/250/300、PRIVATE_FILES、九helper/三永久模板、唯一应用state及三组研究暂停保持，无生产/AWS操作。

### 本地内容输入与结果字段

| 对象 | 当前私有合同 |
| --- | --- |
| 请求增量 | reviewMode=operator-content-v1、expectedSnapshotName、expectedTarget四字段、targetInputSha256、targetStorageSha256、challengePreparedAt；仍≤4096字节。目标来自原件及原意图，不取reply反向建立 |
| 外层reply | 沿原schemaVersion/kind及六项原绑定；evidence为严格四字段schemaVersion=1、kind=sanq-minimal-manual-snapshot-content、instanceSnapshot、operatorVerification |
| instanceSnapshot | 11个必需字段：arn/name/createdAt/location/resourceType/state/fromAttachedDisks/fromInstanceArn/fromInstanceName/isFromAutoSnapshot/sizeInGb；缺失或null均阻断。其他AWS metadata允许保留并纳入evidence摘要，不回显或执行；createdAt采用下述显式规范化输入，不声称是未经转换的AWS原始响应 |
| operatorVerification | 精确八字段：method=operator-authenticated-aws-session、accountId、region、instanceArn、snapshotArn、authenticatedAwsSession=true、createdAfterChallenge=true、availableObservedAt；布尔必须原生true，声明准确对象且实际显示完整challenge后创建 |
| 时间 | createdAt/availableObservedAt接受YYYY-MM-DDTHH:MM:SS[.1至6位小数](Z或±HH:MM)，例如2026-10-29T06:00:02.123456-04:00；规范为UTC六位小数。拒绝epoch数值、未知-00:00、非有限值、无时区、非法偏移/日历和超精度。只比较所选本机/人工时间，不授予可信时间证明 |
| 快照范围 | ARN账户/区域和唯一UUID、原实例ARN/name、完整77字符challenge名、isFromAutoSnapshot=false标志、available、单盘大小及明确空附加盘列表；source inventory仍由停写前完整原件/硬盘观察证明，不以快照空清单替代 |
| 返回结果 | 新入口顶层INSTALLATION_SNAPSHOT_CONTENT_VALIDATED；内层SNAPSHOT_CONTENT_VALIDATED，内容/证据比较为true、requiresSnapshotValidation=false仅表示本内容步骤结束。snapshotAvailable/recoveryReady/canExecute及AWS认证/可信时间/restore仍false，必须先补耐久回执/离机索引与恢复验收 |
| 原件/失败 | 本批输入/结果只在同一活跃调用栈中，未增磁盘票据；等待前后核原两锁、原件/意图/恢复包、固定目标存储/门禁/原ID停写及DB。任何异常沿FENCE_UNCONFIRMED保留，不自动恢复/重放 |

本批于2026-10-29再次核对[AWS InstanceSnapshot](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_InstanceSnapshot.html)和[get-instance-snapshot官方示例](https://docs.aws.amazon.com/cli/latest/reference/lightsail/get-instance-snapshot.html)：实例快照可用区all与源可用区分开记录，progress不代替state。该复核不表示执行AWS查询或生产操作。

## D2 目标存储原件与恢复包意图绑定（源码已合并）

**D2_STORAGE_RECOVERY_BINDING_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3042](https://github.com/sanqin888/sanqinMVP/pull/3042)最终head `c9c097e496573d3bbae85c57de11b3373add0f7c` 经[CI #7774](https://github.com/sanqin888/sanqinMVP/actions/runs/40859596784)SUCCESS（4成功/6范围跳过；两条Release各1096、Runtime1080、既有C1回归412），已合并dev `02dc3be9b3741024bc9ac31f5ad062992b0b89b9`，无需CI修复；未安装或执行生产/AWS操作。

基于[PR #3041](https://github.com/sanqin888/sanqinMVP/pull/3041)合并dev `db53bdaccce01cb110744fa055358c1f02f3a3de` 建立 `feat/runtime-minimal-storage-recovery-binding-20261029`。新增私有 `_retain_installation_target_storage`，在同一次原两锁/完整预检中捕获目标和存储原件，复用原意图、临时门禁、原ID停写、恢复包审计及成对耐久保存；当前不接快照等待、内容核验或安装。

恢复tar只增固定 `observations/pre-snapshot-storage.json` 成员及index.capture.snapshotStorage元数据：保存规范目标原始字节、公开SSH key原件/身份、两轮mountinfo、四次准确lsblk/只读SQL原stdout、目录/配置metadata、空表空间事实和写意图前完整观察。纯数据复核共用原验证规则重算facts，并将完整原观察摘要对照原intent.observationSha256；篡改后重算外层hash也不能替换该绑定。新owned流程强制require_target_storage=true，缺失原件不能降级为旧范围审计；旧格式与原入口保持原行为，不授予目标核验结果。

新增20项一次性文件/主机模型测试，覆盖同锁且意图前采集、冻结后/保存后复核、原件/metadata/命令/SQL/目标篡改、原观察摘要变动、缺成员/降级、字节预算、失败保留及禁止重放；旧23项测试只提取共享fixture准备方法，保留全部断言。完成Python3.10语法AST、符号/定义、差异与读回静态核对后，上述20项已随本批两条Release各1096项通过最终CI；MCP-workspace未执行lint/build/test，真实平台/恢复仍未验证。

本批按工具恢复归档的兼容增量扩展处理：读者/生产者同一bootstrap原子更新，保留历史证据格式；不是第二发布控制器或并行业务兼容路径。PRIVATE_FILES四材料、原意图/marker/writers/回执schema、现役17+Manifest/250/300、九helper/三永久模板、锁/owner/mode与原共享预算保持。单独只读facts仍保留requiresIntentBinding=true原值；新流程只在实际耐久读回及最终现场重核后返回snapshotStorageBoundToIntent/snapshotTargetStorageReviewed=true，snapshotAvailable/recoveryReady/canExecute仍false。快照内容核验、核验回执、安装/门禁交接、Mac入口及D4统一真实恢复/中断验收仍OPEN；三组研究继续暂停，无生产或AWS操作。

### 本批归档与调用边界

| 对象 | 本地实现与约束 |
| --- | --- |
| 原只读入口 | _observe_installed_snapshot_storage保持只读返回，不接受导入结果作为执行票据 |
| 新完整入口 | _retain_installation_target_storage要求从新调用开始，原两锁、全预检、意图/门禁/原ID停写和恢复保存完整组合；不能只带目标开启半段写入 |
| 归档新成员 | observations/pre-snapshot-storage.json，schemaVersion=1、kind=sanq-minimal-recovery-target-storage；原观察字典与storageOriginals完整嵌入，规范JSON且≤原8MiB host envelope上限 |
| 原件集合 | 原始目标JSON、公开Ed25519 key及指纹所对应metadata、两份mountinfo、准确原DB ID的两次只读SQL及两次固定lsblk stdout、固定目录/配置metadata、明确空pg_tblspc |
| 意图绑定 | 原观察完整字节的规范摘要必须等于原intent.observationSha256，并核目标/旧Runtime source与retentionId；不改写原意图或自报成功字段 |
| 范围审计 | 从成员原件重算target/facts，核index.capture.snapshotStorage的成员名/hash/大小/观察摘要；新流程必须require_target_storage=true，旧格式的packageScopeReviewed单独不能表示目标已核验 |
| 耐久交接 | 新成员随原recovery.tar/recovery.json一起独占写入、同步和准确读回；冻结期间及保存后复核现场，失败继续FENCE_UNCONFIRMED、保留实际证据，不自动重放或恢复业务 |

原PRIVATE_FILES四材料、host观察envelope、intent/marker/writers及回执的既有schema保持；只对工具恢复归档做增量扩展，不迁移/删除历史原件，不新增机内第三张成功票据。单个新增成员≤8MiB，整包仍受原48MiB源数据共享预算、归档总量和2100成员上限；不靠增加上限掩盖材料膨胀。旧归档通用审计继续明确它原有的有限范围；只有调用者明确要求目标原件并通过完整核验后，才返回snapshotTargetStorageReviewed。

此处“原件”是受信操作者/root本轮采集并保留的实际输入和输出，不是服务端AWS认证、可信时间、跨克隆身份证明或数据库恢复证明。路径/文件metadata按原只读观察规则复核，不据此声称已捕获所有主机配置include或扩展自定义存储。快照内容核验及真正RECOVERY_READY仍是下一段，不因恢复包已有新成员而自动通过。

## D2 停写前目标与系统盘只读观察（源码已合并）

**D2_PRE_SNAPSHOT_STORAGE_OBSERVATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3041](https://github.com/sanqin888/sanqinMVP/pull/3041)最终head `cb7f490e96a00046fec26f612ceef849af03e4c7` 经[CI #7772](https://github.com/sanqin888/sanqinMVP/actions/runs/40819628612)SUCCESS（4成功/6范围跳过；两条Release各1076、Runtime1080、既有C1回归412），已合并dev `db53bdaccce01cb110744fa055358c1f02f3a3de`。初次CI #7771因测试辅助方法覆盖TestCase.run失败；同PR仅改命令模拟器命名，未修改源码行为或CI门禁，修复后最终head通过。

基于[PR #3040](https://github.com/sanqin888/sanqinMVP/pull/3040)合并dev `d7b27fe0e573a32dd637f8c03a0baeb70efc0368` 建立 `feat/runtime-minimal-pre-snapshot-storage-20261028`。在现有安装器内新增私有只读 `_observe_installed_snapshot_storage`：沿原两锁/全预检双次观察，将停写前操作者AWS实例/SSH目标材料与本机固定Ed25519公钥指纹、系统盘/固定宿主路径、PG15默认数据/WAL/表空间及配置位置绑定；只返回观察与摘要，不创建意图/门禁、不停写。

新增固定lsblk argv与原DB完整ID上的固定只读SQL，复用原300秒/单命令/输出预算；不接受调用者命令、设备路径或SQL。原始目标材料≤64KiB规范JSON且严格字段/原生类型/人工确认；源实例须唯一已附系统盘，区域/ARN/名称与既定目标一致。Linux只接受ext4/xfs根、单一普通disk/part及标准DockerRootDir；固定目录逐级nofollow并核路径/FD，拒绝分盘、同设备bind/子挂载、WAL/默认PG目录重定向、自定义/残留表空间及迁出PGDATA的主配置位置。设备名差异由明确的人工Linux系统盘绑定承载，不凭云盘名字或容量猜身份；awsOriginAuthenticated仍false。

新增23项一次性文件/主机模型测试，覆盖完整同锁只读组合、原入口隔离、严格目标/同名错ARN/错SSH key、磁盘/挂载/PG目录/表空间/配置重定向、采集中及两轮间漂移、准确命令allowlist/预算和无公开CLI。完成静态核对后，上述23项已随本批两条Release各1076项实际通过最终CI；真实主机/SSH/设备/AWS及D4恢复仍未验证，不把源码CI当生产通过。

新观察明确requiresIntentBinding/requiresHostRecheck=true；snapshotAvailable/recoveryReady/canExecute/restoreProven均false，原写意图/停写/恢复包/等待入口不调用新观察。本批按内部原子新增的只读观察能力交付，未改变持久schema、PRIVATE_FILES四材料、17+Manifest/250/300、九helper/三永久模板、唯一应用state、依赖或业务迁移；无生产/AWS操作。下一步在同一owned流程把目标/存储原始事实接入意图与恢复包审计，再接内容核验/耐久回执；D4真实设备/SSH/lsblk版本、实际完整DB恢复和中断验收仍OPEN。三组研究继续暂停、不取消。

### 本批输入、观察与权限边界

| 输入/事实 | 本地实现规则 |
| --- | --- |
| 目标原件 | ≤64KiB，规范JSON，拒绝重复/额外顶层字段、非原生整数/布尔、非法编码/非有限值 |
| 顶层字段 | schemaVersion=1、kind=sanq-minimal-pre-snapshot-target、accountId、region、instanceArn、instanceName、sshTarget、sshHostKeySha256、linuxSystemDisk、operatorConfirmed=true、instance |
| 人工AWS材料 | instance的ARN/名称/resourceType/location及hardware.disks与既定目标一致；仅一个isSystemDisk=true且isAttached=true的系统盘，显式大小与设备路径；原件仅进摘要，不把JSON自洽称为AWS认证 |
| SSH对应 | 固定读取本机/etc/ssh/ssh_host_ed25519_key.pub，正规单行Ed25519 blob与文件/路径身份重核，指纹必须匹配人工已验证会话；不读取私钥，不自行证明运行中sshd的私钥配置 |
| 本地存储 | /proc/self/mountinfo + 固定lsblk显式列，根为ext4/xfs，单一普通disk/part对应linuxSystemDisk；AWS与Linux设备名字可不同，映射仍属于操作者已核事实，不能只凭大小推断 |
| 数据范围 | 标准/var/lib/docker下原命名卷；完整固定PG15目录/WAL及空pg_tblspc，并通过准确DB完整ID上的只读SQL核默认表空间、DB身份及主配置位置；配置文件仅核metadata、不读取秘密内容 |
| 许可 | 只读结果带原件/观察摘要和requiresIntentBinding=true；禁止与_record_intent/快照等待混用，原写入链尚未接入，所有安装/恢复许可仍false |

本批有意限定默认集群布局，不支持自定义表空间、WAL/PG目录链接、迁出的主配置或复杂块设备；不自动调整这些配置。它提供固定路径的覆盖观察，不宣称已完成所有配置include/扩展自定义存储的闭包审计、服务端AWS来源认证或真实恢复。无额外包安装；lsblk在实际目标平台的存在、JSON类型/PKNAME格式和时限行为仍须D4验证，不能用模型代替现场。

原只读阶段的返回摘要本身仍不是执行票据。当前新增owned流程已在本地把目标/设备原件及完整原观察接入同一次意图/恢复包审计与耐久保存，详见上节；原件保存及绑定的新测试尚未运行，不允许导入旧返回JSON重放。

依据：[Linux内核mountinfo说明](https://www.kernel.org/doc/html/latest/filesystems/proc.html)、[util-linux上游](https://github.com/util-linux/util-linux)、[PG15数据目录布局](https://www.postgresql.org/docs/15/storage-file-layout.html)、[PG15配置位置](https://www.postgresql.org/docs/15/runtime-config-file-locations.html)。该只读切片的23项测试已随PR #3041最终head通过CI；本次新增原件绑定的20项测试未执行。本文不授予任何生产操作权限。

## 已合并的手动快照内容核验合同基线

原合同由[PR #3040](https://github.com/sanqin888/sanqinMVP/pull/3040)经[文档CI #7769](https://github.com/sanqin888/sanqinMVP/actions/runs/40777661283)成功合并dev `d7b27fe0e573a32dd637f8c03a0baeb70efc0368`，最终head `96396fc494fb2a7a43bc7997dbcca51af4c76051`，1成功/9范围跳过。以下保留合同形成时的源码事实与验收要求；本节文档通过不表示新源码或生产验收通过。

## 基线与源码审计

原合同形成时，工作分支 `docs/runtime-snapshot-content-contract-20261028` 的 HEAD 与当时 `origin/dev` 均为 `d6484c6d7216c32bacd9eb36a980296a25ed2152`；下表描述该源码基线，新增只读观察的当前状态见上节。

| 准确位置 | 当前已实现行为 | 尚缺的能力 |
| --- | --- | --- |
| [安装器现场观察](../../ops/release/install_minimal_executor.py) `_host_filesystem_snapshot` | 固定目录身份、私有盘空间及 SQL gzip 完整性/时效；返回 `restoreProven=false` | Linux 路径→挂载/块设备→AWS 系统盘对应，WAL/表空间完整覆盖 |
| 同文件 `review_snapshot / fresh_context` | 原调用栈/两锁中，恢复包保存后等待；前后刷新 300 秒现场预算 | 停写前独立目标绑定、等待后 AWS 内容与人工声明核验 |
| 同文件 `_installation_snapshot_request / _installation_snapshot_reply_value` | 随机 32 字节 challenge、六项绑定、单行规范 JSON 与大小限制 | `evidence` 目前仅要求非空对象，未认证实例/快照/磁盘/时间 |
| 同文件 `_receive_installation_snapshot_evidence / main` | 私有续接只返回未核验摘要，四项安装许可均为 false；公开 CLI 仅 pack/verify/plan | 核验回执、RECOVERY_READY、安装/永久门禁及 Mac 入口 |
| [等待回归测试](../../ops/release/tests/test_installation_snapshot_wait.py) | 24 项管道/模型测试；明确嵌套 `snapshotAvailable=true` 不能授权，DB 重启导致拒绝且不停止 DB | 真实 SSH/TTY、实际设备/AWS 对象、快照恢复及中断/重启组合 |

[PR #3039](https://github.com/sanqin888/sanqinMVP/pull/3039) 最终 head `1a5beeb891e6e023b501f8746a602a59f5f43f96` 的 [CI #7766](https://github.com/sanqin888/sanqinMVP/actions/runs/40767652506) 为 success（4 成功、6 范围跳过）；Release 默认 Python/3.10、Runtime、既有 C1 回归按原 CI 执行。它验证的是已合并源码，不覆盖本批文档或尚未实现的内容核验。MCP-workspace 未开放 lint/build/test 执行权限，本批未执行这些命令。

## 证据来源与授权边界

快照由当前唯一操作者在自己的 AWS 已登录会话中手动创建和查看。VM 不保存 AWS 凭据，不调用创建/删除/恢复 API。复制来的 JSON 是待核对材料，结构正确不等于 AWS 对来源作了认证；最终记录必须区分“字段一致”和“操作者在已认证 AWS 会话中核验”，不能声称实现服务端 AWS 认证或可信时间证明。

当前 SSH 目标与 AWS 实例的对应关系须在停写前独立确定，并绑定进本轮原意图的 observation 摘要。目标账户/区域/实例 ARN 不能从等待后的回复中反向取得。hostname、IP、快照名字或裸 hash 单独均不构成目标身份；普通 SSH 主机密钥验证及操作者的目标核对继续有效。不引入 CA、Enrollment、离机 CAS 或跨克隆防护研究。

独立目标材料必须说明操作者核对的账户、区域、实例 ARN/名称、已验证的 SSH 目标/主机密钥及核对方式，绑定本轮停写前观察；实现时在原 observation 中明确承载并重核这些事实，不能只加入无原件的摘要。原合同基线的observation尚无这些字段；PR #3041/#3042已按本文首部所述实现原始目标/存储采集及原意图绑定。该人工绑定不是云签名证明，也不能事后补写旧意图、修改旧 schema 记录或从 reply 倒灌目标。

## AWS 字段依据

依据官方类型及 CLI 返回结构核对，查询日期 2026-10-28：

- [InstanceSnapshot](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_InstanceSnapshot.html)
- [Instance](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_Instance.html) 与 [InstanceHardware](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_InstanceHardware.html)
- [Disk](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_Disk.html)
- [get-instance-snapshot](https://docs.aws.amazon.com/cli/latest/reference/lightsail/get-instance-snapshot.html)
- [CreateInstanceSnapshot](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_CreateInstanceSnapshot.html)
- [PostgreSQL 15 文件系统备份](https://www.postgresql.org/docs/15/backup-file.html)

快照核对字段为 arn、name、createdAt、location、fromInstanceArn/fromInstanceName、isFromAutoSnapshot、fromAttachedDisks、sizeInGb、resourceType 和 state；实现须逐项固定类型及比较规则。progress 不是实例快照完成证据。AWS 可选字段缺失不等于本合同默认通过；必需字段缺失或 null 均阻断。

账户和区域由 ARN 与已绑定目标比较，`location.regionName` 同样精确匹配。**不要求快照与实例的 `location.availabilityZone` 相等**：AWS 官方 CLI 示例的实例快照为 `all`。实例可用区及快照原始可用区分别保留，非预期值阻断；不能因合法的 `all` 错拒绝，也不能用它豁免区域/来源核对。

源实例磁盘取自 `Instance.hardware.disks`；`InstanceSnapshot.fromAttachedDisks` 是另一份快照侧清单。首版须显式取得两者，不能把字段缺失等同空列表，也不能将这两个列表直接按名字/顺序一一相等。源清单须能确定唯一系统盘且无附加盘，快照侧非空附加盘或任何矛盾均阻断；不能靠快照侧空列表证明 VM 没有附加盘。Disk 的 attachmentState 已废弃；isAttached/isSystemDisk、path/大小只能参与对应，云端磁盘对象不能代替 Linux 设备观察。

## 首版范围与数据恢复前置

首版只接受已证明全部受影响持久路径落在该 VM 系统盘的拓扑：DB 卷实际路径、uploads、sounds、SQL 备份、Runtime 和 deploy-state，以及恢复所依赖的外部工具/配置路径。需要新增受限只读设备/挂载采集，把 Docker mount Source、宿主路径与实际挂载/块设备对应；当前目录 inode 和 Docker 卷摘要尚不能证明这一点。不得仅凭 `st_dev` 相等、设备名字或容量相近判定云盘身份。

数据库覆盖必须核到准确集群的数据目录、实际 WAL 位置及表空间目标；沿现有只读数据库身份核对取得事实。仅检查 Docker 卷根目录不足以排除符号链接/挂载转向另一块盘。相关位置缺失、不能受限读取或与已绑定系统盘不一致时阻断，不自动遍历任意用户路径或执行包内命令。

发现附加盘、分离文件系统、远端存储、无法对应的挂载或快照存储覆盖不明时，保留实际证据并进入平台范围审阅。停写前发现则不创建安装意图/门禁、不停业务；已经停写后发现则保留维护与恢复原件，不自动恢复。不得静默漏盘；首版不增加多盘快照协调、DB 重建或自动旧盘恢复。该限制是待实施的适用范围，不表示已调查生产磁盘。

**业务写入者停止不等于数据库已正常停止，快照 available 也不等于数据已验证可恢复。**当前等待流保持 DB 运行并复核其身份/迁移历史，不调用 DB stop；SQL gzip 完整性检查亦不等于 restore。沿[既有 AWS 恢复合同](Runtime更新-AWS快照与维护冻结方案.md)采用已审阅的一致恢复点路线：若 DB 继续运行，须证明所选单盘快照包含完整集群/WAL/表空间且恢复可用；不能将普通文件复制或仅停应用当作一致快照。若需要改为停止 DB，须先给出准确对象、顺序、对现有现场重核的影响和验证方案并取得对应授权，不能顺手扩大三应用停写范围。未具备一致性和 D4 实际恢复证据前，字段核验通过只能表示内容核验通过，不能标记生产 RECOVERY_READY。

## 必须逐项满足的核验表

| 项目 | 核验要求 | 失败处理 |
| --- | --- | --- |
| 本轮关联 | installationId、意图/writers/恢复包/回执摘要及 challenge 均来自当前持锁调用栈 | 拒绝旧回复和导入的成功标记 |
| 独立目标 | 账户、区域、实例 ARN 与停写前已核 SSH 目标一致 | 不从 reply 建立目标；不猜测同名 VM |
| 存储覆盖 | 固定路径、完整 DB/WAL/表空间已证明属于系统盘，源实例与快照磁盘信息无矛盾 | 缺失、附加盘或模糊对应阻断 |
| 新手动快照 | 当前 challenge 完整输出后由操作者创建，快照名绑定完整 challenge；isFromAutoSnapshot 必须准确为 false | 旧快照、自动快照或错名字拒绝 |
| 来源一致 | fromInstanceArn/name 匹配既定实例；快照 ARN 账户/区域与 location.regionName 一致，resourceType=InstanceSnapshot | 仅匹配名字、IP、大小或错误比较可用区均不通过 |
| 已完成 | 在操作者已认证 AWS 会话中针对准确快照重新观察到 state=available | pending/error/未知、单独 progress 或自报布尔不通过 |
| 创建顺序 | createdAt 合法且与本次创建/观察记录一致，操作者确认在本轮停写与 challenge 之后创建 | 不能用本机时钟自洽冒充可信时间；矛盾阻断 |
| 等待后现场 | 原两锁、原对象停写/策略、DB/卷、门禁、配置/材料及恢复包重核成功 | 任何漂移沿 FENCE_UNCONFIRMED |
| 数据恢复 | 已审阅的一致快照路线与 D4 真实恢复证据适用于准确平台/拓扑 | 内容字段一致不能代替数据恢复验收 |
| 耐久交接 | 后续核验回执绑定准确证据与原恢复包，独占同步读回后才能进入工具安装 | 本批尚无此回执，不能据内存摘要继续 |
| 离机定位 | VM 不可用时仍可取得准确账户/区域、实例/快照 ARN、本轮绑定及恢复材料索引 | 只有机内回执不足；不得依赖 latest 或猜测名字恢复 |

快照名拟固定为 `sanq-runtime-<本轮完整 challenge>`；现有 challenge 是 64 位小写十六进制，构成的 77 字符 ASCII 名称符合当前官方 API 公布的名称模式。实现仍须精确比较完整名字；D4 验证实际服务接受，不由模式核对宣称已创建成功。不把名字视为 AWS 认证，不截短 challenge 或碰撞后自动改名/重建。

创建和观察时间须在实现中固定一种有时区的规范表示及精度转换规则，拒绝无时区、非法日期、非有限值和互相矛盾的时间。monotonic 仅控制本轮超时；本机 UTC/人工声明只能提供所选信任范围内的顺序证据，不证明独立可信时间。不得盲目将 AWS CLI 的时间字符串当作 API epoch 数值或反之。

## 耐久回执与离机索引边界

后续回执至少绑定本轮六项请求字段、目标观察/设备覆盖摘要、准确快照 ARN/名称/源实例/区域、创建与 available 观察、原始输入摘要及独立的人工核验声明。不能只持久化 `snapshotAvailable=true`，也不把原始环境或 AWS 凭据写入回执。字段、固定目录、schema/大小/owner/mode、独占写入/fsync/读回和中断语义须随对应源码明确审阅；本合同不发明一个当前可被消费的磁盘成功票据。

快照拍摄先于核验回执写入，因此**该快照不会包含随后生成的最终核验回执**。沿用既有故障机外轻量清单要求，在工具活跃写入前由操作者保留不含秘密的准确对象/本轮绑定与材料索引；这不是离机 CAS、签名服务或第二份应用发布状态。真实恢复时将快照内原意图/恢复包与离机索引核对，不要求从快照中找一份拍照后才生成的回执，不自动重放旧事务。

## 实施批次与完结条件

1. 停写前目标/存储观察及原件接入意图/恢复包已分别随PR #3041/#3042通过最终CI；当前新入口只在同次owned流程组合，不接受独立摘要重放。
2. 单次输入的字段/challenge/人工声明/顺序校验已随PR #3043最终CI验证；当前新增耐久回执20项测试未运行，准确范围见本文首节，所有恢复/安装许可仍false。
3. VM持锁确认已随PR #3046最终CI通过；当前材料关联审计及17项测试尚待本批CI，详见[恢复前置证据合同](Runtime最小执行器恢复前置证据合同.md)。接下来固定真实采集边界/证据格式并严格验证适用范围，再接RECOVERY_READY、工具安装与Mac/D4验收。失败不补写、不重放、不自动开启业务。不得改变原 PRIVATE_FILES 四材料或手改 Manifest；不把“回执已保存”单独当成整套恢复验收完成。
4. 通过 CI 后，在 D4 统一真实隔离验收中验证准确 AWS 对象、真实根盘/挂载、完整集群恢复、SSH/TTY、超时、中断和恢复。未完成这些步骤前，不能标记为生产可用。

原文档批次只完成合同。目标/存储绑定至VM活跃确认已随PR #3042至#3046最终CI通过；当前恢复材料关联审计17项测试尚待CI，真实证据采集/验证、RECOVERY_READY、Mac薄入口、安装及真实恢复仍OPEN。既有17+Manifest/250/300、唯一应用state和三组研究暂停决定保持，无依赖、业务schema/迁移或生产操作。
