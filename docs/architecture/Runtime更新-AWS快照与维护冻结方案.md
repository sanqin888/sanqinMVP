# Runtime 更新：AWS 整机快照与维护冻结方案

## D2 恢复数据库只读原始采集与比对（源码已提交远端）

**D2_RECOVERY_DATABASE_PROBE_REMOTE / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

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

## D2 离机索引客户端耐久接收器（源码已合并）

**D2_OFFHOST_INDEX_RECEIVER_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3045](https://github.com/sanqin888/sanqinMVP/pull/3045)最终head `168699d42cbc27033e66961732e99d3993ee7c59` 经[CI #7781](https://github.com/sanqin888/sanqinMVP/actions/runs/40882535335)SUCCESS（4成功/6范围跳过；两条Release各1163、Runtime1080、既有C1回归412），已合并dev `b241d21e1aa4fd906ccacf2a138d1c729be6c80d`，无需CI修复；无生产/AWS操作。

基于[PR #3044](https://github.com/sanqin888/sanqinMVP/pull/3044)合并dev `cf99b573334eb6e1104c6ae73254748e2baf1d8f` 创建 `feat/runtime-minimal-offhost-index-receiver-20261029`。本批实现客户端索引交接的准备能力：既有索引生成器复用新增严格41字段解析器；私有transfer工厂生成独立随机32字节challenge并绑定准确索引hash/大小；客户端只在完成保存后生成确认帧。尚未把该协议接入VM原持锁等待/确认落盘链，不提升任何VM许可。

索引≤16KiB、transfer≤32KiB、ack≤16KiB，均规范JSON/严格字段/原生类型；逐项核摘要、source/安装/retention身份、账户/区域/实例/快照ARN、完整challenge名、可用区、规范UTC时间及固定材料路径，拒绝任意metadata或权限字段。客户端必须独立传入已验证SSH/本轮上下文六项：accountId、region、instanceArn、instanceName、installationId、snapshotReviewSha256；与输入不符即在IO前拒绝，不能从transfer自行建立“预期”目标。

私有 `_retain_snapshot_index_offhost` 只允许非root Linux/Darwin进程和原生true的机外操作员确认。调用者选已存在的绝对0700私有目录，逐级nofollow打开并保留/复核祖先FD身份；路径不来自VM帧，拒绝系统/生产路径、符号链接、歧义或不可信可写祖先。仅独占创建固定 `snapshot-index-<installationId>.json`、0600/单链接，短写循环、文件/目录fsync、完整读回及metadata/路径重核；不自动建目录、覆盖、删除或重试。Darwin还要求可用F_FULLFSYNC，文件/目录fsync之后执行，缺失或失败不降级；实际APFS/设备/SSH行为仍待D4。

只有全部IO和目录退出核对成功后，才返回绑定transferChallenge、installationId、review/index摘要及准确字节数的ack，clientIndexDurable/operatorConfirmedOffHost为true，canExecute/recoveryReady仍false。clientIndexDurable仅描述该进程实际系统调用/读回成功；机外位置依赖操作者及既有SSH上下文，不构成独立机器认证、AWS认证或存储硬件/真实恢复证明。索引原offHostRetentionConfirmed=false和全部false许可保持；VM尚未消费ack。断连/丢ack/部分文件均保留并阻断自动重放，未声明真正生产机外保存已完成。

新增22项纯数据、真实一次性文件与模型测试，覆盖所有必需字段/null、hash/ARN/名称/类型/权限/路径、独立上下文、实际短写与同步顺序、已有文件/链接/祖先替换、容量/读回/晚变/部分失败、Darwin能力/失败不回退、旧nonce确认拒绝、既有真实owned投影接新解析器及无VM命令/公开CLI。上述22项已随最终head两条Release各1163项通过CI；完成Python3.10 AST/符号和差异静态核对，MCP-workspace未运行lint/build/test，实际Mac/文件系统/SSH仍未验收。下一步把transfer/ack接入原持锁维护流，核准确VM回执并耐久保存确认，再落实恢复前置证据门禁和Mac薄入口/D4统一验收。

本批仅同bootstrap私有工具协议/用户侧索引文件的新增能力，旧索引41字段字节及既有VM入口行为保持，无旧数据回填、业务双读路径、依赖或业务schema/迁移；未改变PRIVATE_FILES/RECOVERY_FILES、17+Manifest/250/300、九helper/三永久模板或唯一应用state。三组研究继续暂停，无生产/AWS操作。

## D2 快照核验耐久回执与离机索引（源码已合并）

**D2_SNAPSHOT_REVIEW_RECEIPT_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3044](https://github.com/sanqin888/sanqinMVP/pull/3044)最终head `c5947522d852ba6356e2cad393f4da362a15eeab` 经[CI #7779](https://github.com/sanqin888/sanqinMVP/actions/runs/40879127073)SUCCESS（4成功/6范围跳过；两条Release各1141、Runtime1080、既有C1回归412），已合并dev `cf99b573334eb6e1104c6ae73254748e2baf1d8f`。初次CI #7778重放测试的等待线程断言遮住预期维护拒绝；同PR仅给fixture透传exchange，重放分支禁止进入等待，未改源码行为或CI门禁。

基于[PR #3043](https://github.com/sanqin888/sanqinMVP/pull/3043)已合并dev `11d733b240d1af1a27bcec5c57a8d1f034e2f1a2` 创建 `feat/runtime-minimal-snapshot-review-receipt-20261029`。新增私有 `_retain_installation_snapshot_review`，只在原两锁、完整目标/存储预检、意图/临时门禁/原ID停写、恢复包耐久保存、活跃challenge内容核验之后保存本轮回执；原内存核验入口仍不写新文件。

固定新增 `installation-runs/<installationId>/snapshot-review.json`：schemaVersion=1、kind=sanq-minimal-snapshot-review，保存完整规范请求、准确回复原始字节的ASCII字符串、完整写出/收到时间和可重算的原内容结果。原始结果继续保留写入前requiresDurableSnapshotReceipt=true；只有本流程实际O_EXCL/nofollow创建、root:root/0600、文件及目录fsync、整件读回、写后metadata稳定和最终现场复核完成，才对外返回snapshotReviewDurable=true及requiresDurableSnapshotReceipt=false。文件≤192KiB，父事务目录0700，复用5GiB余量；不增加原归档上限或改变PRIVATE_FILES四材料/RECOVERY_FILES二件。

纯数据复核先对照原intent/writers/恢复tar及回执五项准确绑定，再从恢复包原件重算目标/存储和原意图观察摘要，重跑快照内容/时间校验并逐字节比较结果；不能仅信持久化成功标记。原事务owned记录/退出清单只在持有本次准确回执字节与完整恢复包时允许该固定新成员；缺失、替换、额外文件、半写、同步/读回/保存后漂移均阻断并保留实际证据，不自动清理、重放或开启业务。

生成≤16KiB固定字段离机索引，包含准确账户/区域/源实例/快照对象、本轮challenge、意图/writers/归档/回执/目标/核验原件摘要、source/retention身份和固定材料路径；任意AWS metadata、完整回复、配置/主机原件不回显。索引只是待Mac保存的内存投影，offHostRetentionConfirmed=false、requiresOffHostRetention=true；快照先于最终回执，snapshotContainsFinalReview=false。保存回执不证明已存机外、云来源认证、可信时间或DB恢复，snapshotAvailable/recoveryReady/canExecute/restoreProven仍false。

新增20项一次性文件/主机模型及纯数据/IO测试，覆盖准确同锁/停写/耐久顺序、原件重算、字段/绑定/规范格式篡改、只投影索引、显式owned证据、实际短写/同步/读回、权限/链接/容量、失败原样保留与禁止重放、保存后存储漂移、旧入口隔离和无公开CLI。上述20项已随最终head两条Release各1141项通过CI；完成Python3.10 AST/符号/差异静态核对，MCP-workspace未运行lint/build/test，真实平台/恢复仍未验证。下一步补离机索引的耐久接收确认与真实恢复前置证据门禁，再接RECOVERY_READY/安装，D4真实恢复/中断验收仍OPEN。

本批为私有工具事务的兼容增量：生产者/读者在同一bootstrap同步发布，只新增固定回执，不改写历史意图/marker/writers/恢复包或创建业务双控制路径；无依赖、业务schema/迁移、17+Manifest/250/300、九helper/三永久模板或唯一应用state变化。三组研究保持暂停，无生产/AWS操作。

## D2 手动快照内容校验（源码已合并）

**D2_SNAPSHOT_CONTENT_VALIDATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3043](https://github.com/sanqin888/sanqinMVP/pull/3043)最终head `51a945e67d7f304a21e6f2f475284c86e708e098` 经[CI #7776](https://github.com/sanqin888/sanqinMVP/actions/runs/40870736100)SUCCESS（4成功/6范围跳过；两条Release各1121、Runtime1080、既有C1回归412），已合并dev `11d733b240d1af1a27bcec5c57a8d1f034e2f1a2`，无需CI修复；无生产/AWS操作。

基于[PR #3042](https://github.com/sanqin888/sanqinMVP/pull/3042)已合并dev `02dc3be9b3741024bc9ac31f5ad062992b0b89b9` 创建 `feat/runtime-minimal-snapshot-content-validation-20261029`。私有 `_review_installation_snapshot_content` 将已绑定目标/存储恢复包接入原同锁等待链：耐久包之后才发challenge，等待前后强制核目标原件/意图与完整现场；旧只读、恢复保存及未核验输入入口继续各自原行为。

新请求展示原账户/区域/实例、目标/存储摘要及完整 `sanq-runtime-<64位challenge>` 名称。单帧回复沿原六项绑定/64KiB/1800秒限制，内容逐项核手动快照ARN/完整名称、来源实例、available状态、区域、原生bool/int、明确空fromAttachedDisks及系统盘大小；快照可用区允许all或准确源可用区，分别保留。操作者须明确确认已认证AWS会话及完整challenge后创建，并声明准确对象/available观察时间；这些是人工声明，不构成服务端AWS认证。

完整请求写入FD后、开始读回复前记录本机UTC时间；创建/观察必须满足prepared≤完整写出≤createdAt≤available观察≤收到回复。输入选用带显式时区的RFC3339字符串、秒小数0–6位，规范到UTC微秒；拒绝无时区、未知-00:00、非法日期/偏移、超精度及epoch数值，不猜AWS数字单位。Mac薄入口尚未实现，未来须显式转换数字时间；操作者确认实际显示后创建。该顺序仅在本机/人工时钟信任范围内有效，时钟矛盾阻断，不宣称可信时间。

新增25项纯内容比较、真实管道和完整主机模型测试，覆盖all/来源区分、每个必需字段缺失/null、错账户/区域/来源/名称、pending/error/伪成功、附加盘/类型、人工声明、时区/精度/顺序、原绑定替换、原件漂移、完整短写回调、同锁且耐久包后等待、失败保留及禁止重放。上述25项已随本批两条Release各1121项通过最终CI；Python3.10 AST/符号及差异静态核对完成，MCP-workspace未执行lint/build/test，真实平台/恢复仍未验证。

通过仅返回内存 `SNAPSHOT_CONTENT_VALIDATED` 摘要和 `snapshotContentValidated/snapshotEvidenceValidated=true`，不回显任意AWS元数据或原件。awsOriginAuthenticated/trustedTimeProven/restoreProven/snapshotAvailable/recoveryReady/canExecute仍false，requiresDurableSnapshotReceipt/requiresRecoveryValidation/requiresHostRecheck为true；尚无快照核验磁盘回执或离机索引。下一步为耐久核验回执、离机定位及真实恢复前置门禁，再接安装。该私有同bootstrap输入属于内部原子增量，无新持久schema/兼容路径、依赖或业务迁移；17+Manifest/250/300、PRIVATE_FILES、九helper/三永久模板、唯一应用state及三组研究暂停保持，无生产/AWS操作。

## D2 目标存储原件与恢复包意图绑定（源码已合并）

**D2_STORAGE_RECOVERY_BINDING_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3042](https://github.com/sanqin888/sanqinMVP/pull/3042)最终head `c9c097e496573d3bbae85c57de11b3373add0f7c` 经[CI #7774](https://github.com/sanqin888/sanqinMVP/actions/runs/40859596784)SUCCESS（4成功/6范围跳过；两条Release各1096、Runtime1080、既有C1回归412），已合并dev `02dc3be9b3741024bc9ac31f5ad062992b0b89b9`，无需CI修复；未安装或执行生产/AWS操作。

基于[PR #3041](https://github.com/sanqin888/sanqinMVP/pull/3041)合并dev `db53bdaccce01cb110744fa055358c1f02f3a3de` 建立 `feat/runtime-minimal-storage-recovery-binding-20261029`。新增私有 `_retain_installation_target_storage`，在同一次原两锁/完整预检中捕获目标和存储原件，复用原意图、临时门禁、原ID停写、恢复包审计及成对耐久保存；当前不接快照等待、内容核验或安装。

恢复tar只增固定 `observations/pre-snapshot-storage.json` 成员及index.capture.snapshotStorage元数据：保存规范目标原始字节、公开SSH key原件/身份、两轮mountinfo、四次准确lsblk/只读SQL原stdout、目录/配置metadata、空表空间事实和写意图前完整观察。纯数据复核共用原验证规则重算facts，并将完整原观察摘要对照原intent.observationSha256；篡改后重算外层hash也不能替换该绑定。新owned流程强制require_target_storage=true，缺失原件不能降级为旧范围审计；旧格式与原入口保持原行为，不授予目标核验结果。

新增20项一次性文件/主机模型测试，覆盖同锁且意图前采集、冻结后/保存后复核、原件/metadata/命令/SQL/目标篡改、原观察摘要变动、缺成员/降级、字节预算、失败保留及禁止重放；旧23项测试只提取共享fixture准备方法，保留全部断言。完成Python3.10语法AST、符号/定义、差异与读回静态核对后，上述20项已随本批两条Release各1096项通过最终CI；MCP-workspace未执行lint/build/test，真实平台/恢复仍未验证。

本批按工具恢复归档的兼容增量扩展处理：读者/生产者同一bootstrap原子更新，保留历史证据格式；不是第二发布控制器或并行业务兼容路径。PRIVATE_FILES四材料、原意图/marker/writers/回执schema、现役17+Manifest/250/300、九helper/三永久模板、锁/owner/mode与原共享预算保持。单独只读facts仍保留requiresIntentBinding=true原值；新流程只在实际耐久读回及最终现场重核后返回snapshotStorageBoundToIntent/snapshotTargetStorageReviewed=true，snapshotAvailable/recoveryReady/canExecute仍false。快照内容核验、核验回执、安装/门禁交接、Mac入口及D4统一真实恢复/中断验收仍OPEN；三组研究继续暂停，无生产或AWS操作。

## D2 停写前目标与系统盘只读观察（源码已合并）

**D2_PRE_SNAPSHOT_STORAGE_OBSERVATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3041](https://github.com/sanqin888/sanqinMVP/pull/3041)最终head `cb7f490e96a00046fec26f612ceef849af03e4c7` 经[CI #7772](https://github.com/sanqin888/sanqinMVP/actions/runs/40819628612)SUCCESS（4成功/6范围跳过；两条Release各1076、Runtime1080、既有C1回归412），已合并dev `db53bdaccce01cb110744fa055358c1f02f3a3de`。初次CI #7771因测试辅助方法覆盖TestCase.run失败；同PR仅改命令模拟器命名，未修改源码行为或CI门禁，修复后最终head通过。

基于[PR #3040](https://github.com/sanqin888/sanqinMVP/pull/3040)合并dev `d7b27fe0e573a32dd637f8c03a0baeb70efc0368` 建立 `feat/runtime-minimal-pre-snapshot-storage-20261028`。在现有安装器内新增私有只读 `_observe_installed_snapshot_storage`：沿原两锁/全预检双次观察，将停写前操作者AWS实例/SSH目标材料与本机固定Ed25519公钥指纹、系统盘/固定宿主路径、PG15默认数据/WAL/表空间及配置位置绑定；只返回观察与摘要，不创建意图/门禁、不停写。

新增固定lsblk argv与原DB完整ID上的固定只读SQL，复用原300秒/单命令/输出预算；不接受调用者命令、设备路径或SQL。原始目标材料≤64KiB规范JSON且严格字段/原生类型/人工确认；源实例须唯一已附系统盘，区域/ARN/名称与既定目标一致。Linux只接受ext4/xfs根、单一普通disk/part及标准DockerRootDir；固定目录逐级nofollow并核路径/FD，拒绝分盘、同设备bind/子挂载、WAL/默认PG目录重定向、自定义/残留表空间及迁出PGDATA的主配置位置。设备名差异由明确的人工Linux系统盘绑定承载，不凭云盘名字或容量猜身份；awsOriginAuthenticated仍false。

新增23项一次性文件/主机模型测试，覆盖完整同锁只读组合、原入口隔离、严格目标/同名错ARN/错SSH key、磁盘/挂载/PG目录/表空间/配置重定向、采集中及两轮间漂移、准确命令allowlist/预算和无公开CLI。完成静态核对后，上述23项已随本批两条Release各1076项实际通过最终CI；真实主机/SSH/设备/AWS及D4恢复仍未验证，不把源码CI当生产通过。

新观察明确requiresIntentBinding/requiresHostRecheck=true；snapshotAvailable/recoveryReady/canExecute/restoreProven均false，原写意图/停写/恢复包/等待入口不调用新观察。本批按内部原子新增的只读观察能力交付，未改变持久schema、PRIVATE_FILES四材料、17+Manifest/250/300、九helper/三永久模板、唯一应用state、依赖或业务迁移；无生产/AWS操作。下一步在同一owned流程把目标/存储原始事实接入意图与恢复包审计，再接内容核验/耐久回执；D4真实设备/SSH/lsblk版本、实际完整DB恢复和中断验收仍OPEN。三组研究继续暂停、不取消。

## 最小执行器手动快照路线（2026-10-28 文档已合并）

原合同已由PR #3040经最终head文档CI #7769成功合并dev `d7b27fe0e573a32dd637f8c03a0baeb70efc0368`；下文状态为该文档交付范围，新只读源码状态以上节为准。

**CONTENT_REVIEW_CONTRACT_MERGED_DEV / DOCUMENTATION_CI_VERIFIED / NOT_IMPLEMENTED / NOT_INSTALLED。**原合同基线为 `origin/dev@d6484c6d7216c32bacd9eb36a980296a25ed2152`，当前独立合同见[手动快照内容核验](Runtime手动快照内容核验合同.md)。沿2026-10-26最小执行器方案，首次工具过渡允许操作者在自己的已认证AWS会话手动创建/观察准确快照；VM不持有AWS凭据、不调用云写API。下文2026-10-18完整协调器路线及原验收记录保留，不以其“自动创建”要求替代本次已选人工路线，也不据此恢复暂停的C1/R2研究或宣称旧验收通过。

本批复审补明：独立SSH目标绑定与完整系统盘/DB/WAL/表空间覆盖须先核；快照与实例的区域严格一致，可用区分别保留，不能错误要求实例可用区等于快照的all。源实例hardware.disks与快照fromAttachedDisks分别核验，缺失不当空清单。当前代码仅停止原三应用写入者，DB仍运行；不能从available、停应用或SQL gzip完整性推断可恢复。须沿本文件原一致恢复点要求补齐所选路线的实际恢复证据；需要改变DB停写范围时先审阅对应方案/授权。

核验回执晚于快照生成，不可能包含于该快照；继续本文件§2/§4的故障机外轻量清单要求，在工具活跃写入前保留准确对象与本轮绑定/材料索引。该离机索引不构成新CAS/PKI或应用state权威。目标/设备观察、内容核验、耐久回执及真实隔离恢复均未因本合同而实现；无生产预检、停写、安装、AWS或数据库操作。

## 既有完整方案与历史依据

> **2026-10-26 当前分工：**按[最小更新执行器与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)，普通应用镜像发布与低频平台维护分离。现役日常备份、必要更新前数据备份、平台重大维护的准确 AWS 快照/真实恢复与失败停写目标保留；暂停 C1 自建执行器来源研究与 R2 离机 CAS/PKI/可信时间/跨克隆接线 **不等于取消上述数据保护**。先恢复正常代码更新，再复审继续三组暂停项。下文原高保证步骤留作该路线合同，不能强制每次普通镜像更新先完成整套 C1/R2；现有 guard 未变，云 API/IAM/停服/安装/恢复仍须另行精确授权。

> **2026-10-22 取证规则更新（本地待审）：**R2/R3/R4/R5 的维护冻结、AWS 快照、安装和替代实例恢复，不再要求第三方见证、签署文件、见证邮件或外部人员验收；按 [R0 §4.1](Runtime更新-R0冻结设计.md) 留存受控 AWS 对象、维护状态、恢复清单、数据一致性与 SanQ 内部可重复技术核验。不得省略实际恢复测试、故障冻结和生产授权。

**状态：DESIGN APPROVED / DOCUMENTATION DELIVERY AUTHORIZED / IMPLEMENTATION NOT STARTED / AWS ACCEPTANCE NOT RUN / C5-G2 NO-GO。**
**文档交付：**[PR #2864](https://github.com/sanqin888/sanqinMVP/pull/2864) → `dev`；最终 head 的 GitHub Checks 与合并事件为权威，本文不预先声明 CI 或实际 AWS 验收通过。
**批准日期：**2026-10-18（America/Toronto）；用户明确批准“采用这两个方式（AWS整机快照+docker容器在更新前改为不自动重启并生成快照），更新现有文档”。
**本批基线：**`origin/dev@a76d526592b7a46e4659f485a3089d753e267b3c`；分支 `docs/runtime-aws-snapshot-recovery-20261018`。本批只更新文档；用户于 2026-10-18 明确授权提交远端，按功能分支→dev PR→最终 head CI 全绿→合并交付。没有 AWS/IAM/Guest/root/生产执行授权。同步保留共享工作区已提交的 C2-CHANGE-02 文档 `4eabfa2b16d0306e6c43bfc4e8ca0f586fb0b44b` 的既有规则/复核登记；这不是本批新实测，也不宣称该提交已合并远端。

## 1. 两项已批准变更与替代关系

| 决策 | 现行要求 | 被替代的更新必做项 |
| --- | --- | --- |
| RUNTIME-SNAPSHOT-01 | 本次更新进入持续维护停写后，由受限更新协调程序调用 Lightsail API 创建唯一手动实例快照；等待 `available` 并核对来源、覆盖磁盘和本次事务，之后才开始 Runtime 活跃写。更新中断/失败经操作者确认，用这份准确快照创建独立替代实例 | 不再为同一次 Runtime 更新强制另做 crypt/Drive mandatory preinstall Kit、下载解密双原 Archive 后的故障主机自举 clean reinstall |
| MAINT-RESTART-01 | 拍快照前记录原策略，临时将准确范围内现有容器的 restart policy 改为 `no`，停止业务容器，并禁用可重新启动它们的真实入口；停用状态及恢复清单必须进入快照且跨重启有效。成功后按记录恢复，恢复实例仍先维护再放行 | 不依赖 `always` 下的单次 stop，也不将 `unless-stopped` 当作本批选定方案；不永久取消生产自动恢复能力 |

两项变更更新 [R0](Runtime更新-R0冻结设计.md) 的 D2/D3/D4/D5 相关执行方式与 C4–C7 验收；D1 对正常更新执行器、目标发布包和实际平台的来源验证继续有效。C2-CHANGE-01（PR #2863）的“指定快照→新实例”恢复机制继续有效；它未自动通过真实 AWS 恢复验收。

本文件是这两项变更的操作合同。与旧 Kit/原事务恢复文字冲突时，以本文件及更新后的 R0 为准。旧源码、lab-only guard、合成清单、原始证据和已登记的有限 PASS 保留，不因文档变更被启用、删除或升级状态。

## 2. 恢复材料分工

- **每日定时备份保持：**既有 DB、Uploads、配置、TLS、roles/凭据 escrow 等备份与保管要求按各自真实状态继续；日常备份健康仍是更新前置。S2 新 daily 扩充继续后置，未部署状态不变。
- **本次更新专用备份：**AWS 整机手动快照承担主要恢复点；代码创建的“手动快照”不要求人去控制台点按钮。不重复强制再打一套同用途关键数据包或再实现旧 Kit 传输链。
- **轻量恢复清单：**在故障 VM 外记录账户/Region、源实例 ARN、快照 ARN/名称/时间/磁盘、事务 ID、已安装/目标 Runtime SHA、原应用 SHA/digests、状态/挂载摘要、原服务/容器策略、维护状态、API 操作 ID 和独立验证结果。保留现有凭据取回路径；secret、私钥、token 和原始配置不进 Git/聊天。
- **新版本发布资料：**目标 Runtime 原 Archive、准确 main SHA、CI/publish proof、配对镜像 digest 和 17+Manifest 验证保留。AWS 快照不能替代“准备执行的新代码”的来源校验。
- **旧版来源：**拍快照前确认当前安装完整性/健康/版本，建立其与准确 AWS 恢复点的关系。整机恢复不再要求故障主机先取回旧 tar.gz 或运行一个独立 Python 自举恢复器；相关历史 verifier 留作辅助，不自动成为每次云恢复的必做链。

AWS 控制面和受控账户权限属于已批准 D1 的信任前提。快照 ARN 不是 tar.gz SHA256，也不虚构整盘摘要、独立数字签名或 WORM。若有外置盘/远端存储未被该快照覆盖，必须明确对应恢复资产及同一恢复点策略；无法覆盖关键数据则阻止更新。

## 3. 操作分工与实现边界

**推荐实现分工：**故障 VM 外的协调程序负责受限 AWS API、快照身份和恢复记录；经准确授权的生产侧执行器负责维护与 Runtime 安装。由代码创建快照、等待和核对是已批准的实现方向；恢复切流仍须操作者确认。精确执行位置、认证方式、最小 IAM、命令/对象和独立管理通道在实现前审阅；本文件不创建账户权限、不在 VM 放长期 AWS 密钥。

正常更新只安装所审 Runtime，不变更应用发布 SHA、DB schema/卷、Uploads 内容或业务协议。暂停/恢复容器和任务是本次维护合同的一部分，不能再引用旧“安装器绝不操作 Docker/service”文字将它排除；必须限制为清单内准确对象，禁止任意命令/路径或放宽 MCP sudo。

**不得临时手改已认证 `/opt/sanq/runtime/docker-compose.yml` 来实现 restart:no。**该文件属于固定 17 成员/Manifest。维护程序应控制现有容器的实际 restart metadata，以及 systemd/cron/Compose 启动入口；记录预期 Compose/容器 ID。任何 recreate、外部 `compose up` 或新容器都可能重新带入原 `always` 策略，必须被维护入口阻止并持续复查。本批不修改 Compose、代码、17 文件、依赖、CI 或 sudoers。

## 4. 更新状态与准确顺序

以下为待实现状态合同，不是已可执行脚本；不与应用 release-state 的 `PENDING/ACTIVE` 混用。

1. **PREFLIGHT：**核对实际生产 OS/kernel/arch/Python/loader、Docker/Compose、内存/磁盘/FD 预算、卷与 bind、当前安装/应用/备份健康、无未明事故；验证目标发布和向后兼容。先确认保留的管理通道与外部协调记录可用。
2. **MAINTENANCE：**阻止新下单/支付发起/后台业务写入，排空或明确隔离在途任务；按真实清单暂停 worker、backup timer/service/helper、Messaging、deploy/Compose/MCP 生产调用和可重新启服务的入口。已发往外部的支付/订单可能仍完成，必须有独立事件保留、重放/权威对账安排；未知资金结果不能强制结案。
3. **FROZEN：**在策略变更前持久化原容器 restart policy、容器/服务身份、enabled/active 与任务状态，并离机记录；将批准容器实际策略设为 `no`，正常停止、确认无残留写入者。形成并记录 DB/文件一致恢复点；首版采用经批准的正常停止相关服务/数据库路线，或另证一致快照方法，不擅自强断电。维护停用状态跨 daemon/VM 重启必须有效，包含各启动入口，系统/SSH 管理入口仍可用。
4. **SNAPSHOT_PENDING：**针对批准账户/Region/源实例与唯一事务名调用 `CreateInstanceSnapshot`，记录操作；用 `GetInstanceSnapshot` 核对准确对象、fromInstanceArn/name、时间、覆盖磁盘和 `state=available`。请求返回 200、只看到名字或旧快照同名均不够。调用超时/结果未知先按准确操作/对象查询，不盲目创建多份或选 latest；碰撞/来源错/失败/超时无合格快照则不安装。
5. **SNAPSHOT_READY：**快照与故障 VM 外轻量清单均完成，预先在同平台/AWS 隔离环境证明此类恢复可用；再复查整个冻结窗口未破坏。自动快照不能替代本次准确手动快照；不自动删旧验证集。
6. **UPDATING：**只由准确受信任执行器安装目标 Runtime。正常安装的 FD/权限、候选、同设备交接与持久化校验继续；不得靠放宽旧 lab guard 开启生产。快照之后至最终放行业务前，持续停写，不并行应用 rollout、迁移或密钥/配置变更。
7. **VERIFYING：**先验证完整文件/Manifest、动态 bytes/owner/mode、原应用/卷/Uploads 与外部安装件兼容。需要启动服务做健康检查时仍保留业务入口/后台副作用/出网屏障，只做准确受控启动并记录当前策略，不能借健康启动提前接单。冻结被破坏、外部状态不明或原状态无法核对即 INCIDENT。
8. **RELEASED：**全部验收及必要外部对账成功后，按清单恢复原 restart policies 与原任务状态，受控启动并独立复查服务/路由/单写者，最后放行业务。恢复失败不标成功；不要一律 enable/start，也不要永久将所有生产容器设为 no。
9. **INCIDENT：**活跃更新已开始、是否写入未知或验收失败时，保持维护、不自动恢复写入。记录事故并由操作者决定准确快照→替代实例恢复；旧 journal 不 replay。仅在已独立证明活跃树未改、原状态完整且单独允许取消时，才可在受控核对后退出维护；禁止 `finally` 无条件启动一切。

快照未成功前不得发生 Runtime 活跃更新；维护策略/合成标记等前置写与 Runtime 安装写必须分别登记。快照包含“业务停止、restart=no”的状态和原策略清单，而不是正常营业态。故障机以外也必须能取得恢复记录，不能只写在将损坏的 VM 里。

## 5. 故障恢复与保护窗口

- 精确选择本次已验证手动快照，在 AWS 创建**独立替代实例**；保留故障实例和原证据，先 fence 原机写入/worker，防止复活双写。不是原机磁盘回退，也不续跑原 Runtime 安装事务。
- 新实例启动后仍是快照内的维护态；验证所有准确容器 `restart=no`、启动入口/任务禁用与管理通道。不能只靠未转移 Static IP 或关闭公网防火墙；Lightsail firewall 不控制全部出站/私网流量。
- 核对恢复点来源与可用基线、Runtime/应用身份、DB/WAL/卷、Uploads、配置权限、机器身份、TLS/roles/凭据取回、backup/MCP/tunnel、恢复清单；自定义 firewall、Static IP/IPv6/DNS/Cloudflare 作为外部资源单独恢复，不能假定随盘复制。
- 仅在准确数据恢复点、外部付款/订单事件和后台去重核对完成后，由操作者确认恢复原策略、受控启动与切流。AWS 新实例部署/切流仍需对应具体授权；不是失败超时就自动换机。
- **保护窗口是快照形成后至业务重新放行前。**窗口内完整持续停写，才可用本次快照作为更新失败的主要回退点。业务已放行后出现的新订单/付款/上传、密钥变化或未明写入不能直接回退；转独立 DR/向前修复与外部对账方案。
- 恢复自身再次失败/中断：新事故、新对象/新操作审批，旧资料保留；不回放旧更新 journal、不覆盖故障机或上一个替代实例。
- 日常/长期 DR、snapshot 丢失/账户或 Region 不可用仍依赖已有独立备份/escrow；不据此承诺零损失、固定 RTO 或已验证物理掉电持久性。

## 6. 现行验收与证据复用

| ID | 必验行为 | 拒绝/通过边界 |
| --- | --- | --- |
| S01 | 准确生产/同平台清单与目标包来源 | 平台、发行来源、安装/应用/存储不符即阻止；保留正常更新执行器来源与权限验证 |
| S02 | 原容器/任务策略可靠记录、设置 no、正常停止 | 记录先于改变；错误对象、不完整、未排空即阻止 |
| S03 | 冻结跨 Docker/VM 重启且不会被 Compose/任务绕过 | 快照恢复首启仍无业务容器/worker/定时副作用，管理通道可用；单次 stop 不算通过 |
| S04 | 自动创建本次准确快照并等 available | 覆盖实例/Region/盘、冲突、拒绝权限、失败/超时/不明结果；无合格快照绝不安装 |
| S05 | 清单离机可取回、快照保留与来源绑定 | 故障机不可用仍能由受控账户定位；不接受旧/错实例快照或猜造 hash |
| S06 | 持续冻结下正常安装与完整独立复验 | 同一候选、同平台、准确 17+Manifest/动态状态/卷/外部副本一致，无隐藏 rollout |
| S07 | 准备/策略/快照阶段失败 | 未发生 Runtime 活跃写；精确错误/原状态记录，不自动取消维护或删唯一恢复点 |
| S08 | I1–I5 更新/验证窗口中断 | 旧事务 ABORT、维护保留；准确快照→新实例恢复，不执行旧自举 clean reinstall |
| S09 | 真 AWS 新实例恢复、首启冻结及恢复点证明 | 指定对象、恢复点来源链/选定版本与数据/策略对照；VirtualBox 克隆/合成 HTTP 不是 AWS 控制面验收 |
| S10 | 恢复失败/再次中断 I6 | 新事故、不重入旧事务、不覆盖唯一资产；维护和单写者不失效 |
| S11 | 成功恢复原策略、受控启动和最后放行 | 兼容原 enabled/active；恢复失败拒绝关闭，旧机不双写 |
| S12 | 快照后意外写入/外部未知态/放行后故障 | 不直接回退并猜测资金终态；保存事件并进入独立 DR/向前修复 |

C2 指定快照→新实例机制与所属 B2B2 最新 N-01–N-07 证据合同保持；先复用现有来源链与有限 A/B 原件，不因旧 marker 缺失默认重演。同一轮真实 AWS 隔离验收可共同提供 C2/S03–S05/S09 等证据，不能强迫重复做内容相同的演练。2026-10-18 **C2 VirtualBox 隔离合成恢复前置项已按 B2B2 §9.6 有界 CLOSED / N-07 LIMITED-ACCEPTED**，既有 clone/HTTP 与 Guest A/B 证据可复用，但历史 rc/Host witness 限制永久登记。**S03–S05/S09 真实 AWS 同平台隔离验收和 MAINT-RESTART-01 持续冻结尚未执行，仍 OPEN**，本条不把 VirtualBox PASS 当成 AWS 控制面 PASS。

H06/H07/H08、FD/来源/权限/Archive 合成检查和现有 CI 可按原范围复用；只有影响到的代码、平台、合同或真实组合缺口补验。旧恢复自举器的专用 Python/ELF 重建/消费闭包不再为 AWS 控制面恢复设置重复门禁；正常更新所执行的新代码仍须按准确来源/平台验证。现有模型若不参与最终实现，不为“全部做过”而额外部署。

原 mandatory crypt/Drive preinstall Kit 的 create-only 适配、双旧/新 Archive 解密取回、故障 VM 上 same-version clean reinstall 验收退出本次更新关键路径；没有被标 PASS，源码/历史材料保留。S1 和 S2 daily 扩充继续各自后继审阅，不删除长期独立备份。

## 7. 下一批及批准边界

下一批先冻结真实生产清单、准确 AWS 认证/最小权限、协调器/生产执行器接口、可跨重启的维护动作表和轻量清单；设计状态/恢复持久化位置与失败分类，然后实现、合成测试和同平台 AWS 隔离验收。不得继续套用旧 R3 Kit/旧 R4 故障自举任务，也不以本次文档批准开放任意 root/AWS 写入。

本批没有部署代码、改变 `restart: always` 的现行 Compose、创建快照、停止业务、改 IAM/凭据/CI/依赖/Prisma。新功能的首次远端交付仍按 AGENTS 审阅流程；生产/云/实例/策略变更按准确对象授权。C1–C8 无门禁因设计批准自动关闭。

## 8. 官方接口与依据

- [CreateInstanceSnapshot](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_CreateInstanceSnapshot.html)：程序创建手动实例快照。
- [GetInstanceSnapshot](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_GetInstanceSnapshot.html) 与 [snapshot state](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_InstanceSnapshot.html)：available/source/Region/覆盖盘核对；请求成功不等于快照完成。
- [从快照创建新实例](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-create-instance-from-snapshot.html)：替代实例，支持同级或更大规格；自定义 firewall 不自动复制。
- [快照保留](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-keeping-automatic-snapshots.html)：自动快照滚动且随源删除，手动快照另保留；本次不自动清理。
- [Docker restart policy](https://docs.docker.com/engine/containers/start-containers-automatically/)：no/always/unless-stopped 的不同语义；独立启动入口须另控。
- [PG15 一致快照与 WAL](https://www.postgresql.org/docs/15/backup-file.html)：数据库/文件一致性不能从可启动或 available 推断。

