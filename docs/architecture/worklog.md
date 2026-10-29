# SanQ 项目持续工作日志

## 2026-10-29 — 最小更新执行器：已安装门禁API与启动拒绝核验

**D2_INSTALLED_GATE_API_PR_OPEN / CI_FIX_AWAITING_RESULT / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批已提交[PR #3053](https://github.com/sanqin888/sanqinMVP/pull/3053)。初次[CI #7798](https://github.com/sanqin888/sanqinMVP/actions/runs/40932979284)运行1329项Release，仅1项新fixture报错：临时GUARD_SCRIPT路径与模拟加载命令未对齐。现于同PR同步fixture的路径、GUARD_COMMAND和DROPINS模板；保留原API严格路径/命令断言，未修改运行源码或CI门禁。最终验证以该PR修复后head的实际Actions结果为准。

[CI #7799](https://github.com/sanqin888/sanqinMVP/actions/runs/40934448683)的新API测试已通过，但既有工具写入重放用例在首次准备时收到FENCE_UNCONFIRMED。审阅发现真实管道fixture可在父进程完整写出回调记录时间前生成模拟快照时间，存在调度竞态；现用事件明确“完整写出回调后才生成模拟证据”，新增强制peer先收到字节的回归测试，并为该首次准备保留不含秘密的固定判定原因诊断。未放宽生产时间顺序、截止、原件或冻结规则，也未修改运行源码/CI门禁。

基于[PR #3052](https://github.com/sanqin888/sanqinMVP/pull/3052)合并dev `1ad9775578bff42d79a95d57b1abea3f37a68b9c` 创建 `feat/runtime-minimal-installed-gate-api-20261029`。新增私有_verify_installation_permanent_gate_api，沿原两锁/同一完整新鲜安装调用，在27项工具写入与三永久门禁文件/manager属性交接全部核对后，再执行准确已安装guard的只读API；新原生bool依赖完整handover。旧观察/工具写入/门禁交接入口默认不执行该API，不接受磁盘回执或resume。

maintenance_guard新增兼容只读命令check-installation-fence：要求root，调用既有_installed_gate核固定helper/drop-in、三个实际加载属性和Docker live-restore/Swarm，再核私有维护目录仅有本次规范四字段安装marker、0600/原件身份，实际调用check_startup并要求其阻断，最后重读标记。只返回八字段规范JSON（版本/kind/安装ID/marker摘要/门禁已查/启动已拒绝/两个false许可），不解析该marker为普通发布维护记录，不修改标记或取得安装执行权。旧check-startup/status和daemon/backup固定命令保持，命令不可启动/解冻/恢复业务。

bootstrap仅在独立私有client模式下允许固定/usr/bin/python3 -E -S -B -X pycache_prefix=/dev/null及固定已安装脚本/只读命令；普通观察白名单仍不接受它。忽略Python环境/站点加载，禁写pyc并把缓存前缀指向不可作目录的/dev/null，避免读取既有目标字节码；不导入交付kit或未完成/混装工具。复用原root/默认Docker端点、最小环境、无stdin、独立客户端进程组、≤30秒/总输出预算及未知结果不重试；子命令每项观察≤5秒且完成后核≤64KiB。真实系统Python加载/权限与文件系统行为仍待统一安装验收。

API前后继续原owned记录/锁、全部工具字节与权限/完整身份、门禁、原冻结对象、DB/存储、配置和快照材料复核，结束再完整核来源。父进程只接受≤4096字符、准确八字段/原生类型/规范字节的报告，安装ID和marker摘要必须与原intent重算一致；错报告、输出异常、子进程结果未知或任何晚变均沿FENCE_UNCONFIRMED保留实际文件和冻结，不清理/回滚/重放。报告摘要仅为本轮内存事实，不持久化新票据。

成功止于PERMANENT_GATE_API_VERIFIED_FENCED：permanentGateApiVerified/startupDenialObserved/installedToolPermissionsRechecked=true，requiresInstalledGateApiVerification=false；requiresApplicationVerification=true，installationComplete/canExecute/recoveryReady/restoreProven仍false。尚未启动原三应用、恢复restart策略、写耐久完成记录或最后清marker；原DB对象及业务state保持，完整恢复演练按用户决定留到交付后。

新增19项测试定义，覆盖实际guard函数和临时文件/主机模型、三unit/属性/权限/链接、缺失/异类/额外marker、原生类型与晚变、只读CLI/错误不回显、严格报告绑定/规范性、上下文与截止、私有argv隔离、同锁且加载后调用、旧入口隔离、未知结果不重试及工具晚变。完成Python3.10 AST/符号/差异及读回静态核对；MCP-workspace未运行lint/build/test，本批未提交或推送，尚无本批CI或真实安装结果。

本批为同一交付源内的内部原子接线及兼容只读入口新增，无新helper/unit、公开安装apply、持久阶段文件、业务schema/迁移或第二应用state。下一步验证旧应用与原策略，再做耐久完成记录及最后清marker，随后Mac薄入口和D4统一安装/正常发布/失败冻结验收；真实恢复演练另列交付后。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## 2026-10-29 — 最小更新执行器：永久门禁文件与加载交接

**D2_PERMANENT_GATE_HANDOVER_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3052](https://github.com/sanqin888/sanqinMVP/pull/3052)最终head `d4ece6f7bfebc8411f23f3748e72f8ed8168aa70` 经[CI #7796](https://github.com/sanqin888/sanqinMVP/actions/runs/40930009710)SUCCESS（4成功/6范围跳过；两条Release各1310、Runtime1080、既有C1回归412），已合并dev `1ad9775578bff42d79a95d57b1abea3f37a68b9c`，无需CI修复；无生产/AWS操作。

基于[PR #3051](https://github.com/sanqin888/sanqinMVP/pull/3051)合并dev `ef74c0c0b299d014a50f1624f2e41c557e53a208` 创建 `feat/runtime-minimal-permanent-gate-handover-20261029`。新增私有_handover_installation_permanent_gates，沿原两锁/新鲜完整安装调用，在27项工具全部读回后继续同三个固定drop-in的永久文本与manager加载交接。新原生bool必须依赖完整工具写入链；旧工具写入入口仍止于临时拒绝门禁，不接受磁盘回执/resume或公开apply。

固定顺序为docker.service→docker.socket→sanq-backup.service：核准确临时原件和目录身份，按源校验过的固定DROPINS文本，以同目录独占.sanq-install-gate.pending暂存、短写、root:root/0644、文件fsync/读回、原件/现场重核、单文件rename、目录fsync及最终读回替换；socket文本相同只核对，不换inode。维持原5GiB余量/独立300秒预算，临时和永久拒绝文本交替期间维护marker始终保留。失败保留实际新旧文件/pending和冻结，不自动清理、回滚或重放。

原systemd全组parity在私有handover进度存在时核每件原/目标/本次pending及目录清单：完成件钉本次完整身份，未写件仍钉原件，只有当前件允许明确中间状态。每步继续原冻结对象、DB/卷/存储、工具全组、配置/私有证据及原unit/非本轮override核对。文件交接期间只允许三个相关unit的NeedDaemonReload暂为yes/no，实际有效ExecStartPre仍须是原固定false；全部文件成功后只调用一次daemon-reload，随后必须NeedDaemonReload=no、唯一固定DropInPaths、准确Python/guard argv且不忽略错误。任何缺失/额外命令、加载旧值、未知reload或其他manager/磁盘漂移均阻断，不凭文件存在宣称已加载。原无handover调用仍使用既有严格临时门禁核验。

成功止于PERMANENT_GATES_LOADED_FENCED：permanentGatesLoaded/permanentGatePropertiesObserved=true并返回准确文件及属性摘要；permanentGateApiVerified/installationComplete/canExecute仍false，requiresInstalledGateApiVerification/requiresApplicationVerification=true。尚未调用新guard的完整_installed_gate/API验收，未启动旧应用、恢复restart策略、清marker或登记安装完成；该“加载”只表示固定磁盘文本和实际查询属性匹配。原三应用仍停写，DB保持原对象，restoreValidationDeferred=true/restoreProven=false；完整恢复演练继续交付后，不另作为本阶段前置。

新增19项真实临时文件/主机模型与数据测试，覆盖同锁/完整工具后顺序、两次阶段各自reload、旧入口隔离、部分替换/同步/rename失败、socket原inode、reload成功但属性未变/结果未知/仍需reload、严格命令/额外override、完成件/目录/工具晚变、阶段内无Git请求、拒绝重放及截止。Python3.10 AST/符号/差异及读回静态核对完成；MCP-workspace未运行lint/build/test，上述19项已随最终head两条Release各1310项通过CI；真实PID1/冷启动/文件系统行为未验收。

本批为同bootstrap私有交接/返回字段的原子增量，无新helper/unit、CLI、磁盘阶段记录、业务schema/迁移或第二应用state；只新增三固定unit目录下的pending中间件命名。下一步在同一流程核已安装guard/API及权限，验证旧应用和原策略，再做耐久完成记录与最后清marker，随后补Mac薄入口；完整恢复演练仍列交付后待办。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## 2026-10-29 — 最小更新执行器：原持锁事务接入工具写入

**D2_OWNED_TOOL_WRITES_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3051](https://github.com/sanqin888/sanqinMVP/pull/3051)最终head `4b0d426ab7401043290f9469b8703d26e1057be2` 经[CI #7794](https://github.com/sanqin888/sanqinMVP/actions/runs/40924109819)SUCCESS（4成功/6范围跳过；两条Release各1291、Runtime1080、既有C1回归412），已合并dev `ef74c0c0b299d014a50f1624f2e41c557e53a208`，无需CI修复；无生产/AWS操作。

基于[PR #3050](https://github.com/sanqin888/sanqinMVP/pull/3050)合并dev `a31f032511d09f77a087858f07dcf4c49460f158` 创建 `feat/runtime-minimal-owned-tool-writes-20261029`。新增私有_write_installation_tools，沿原两锁/完整预检/意图和临时门禁/原ID停写/恢复包/活跃快照核验及机外ack耐久确认的同一调用栈接入27项工具写入。新原生bool只允许完整确认链，旧观察、确认和其他入口默认不写工具；无导入批准、磁盘resume或公开apply CLI。

按原交付源重算写集、核现场后，固定旧目录FD和目录清单，在独立300秒写入预算内顺序处理九helper、原17和最后的准确Manifest，复用已合并单文件耐久原语。写入前拒绝任何既有.sanq-install-残件。源码/准确发布证明在写入阶段前后完整核验；逐文件回调保留原件/锁、冻结对象、DB历史/存储、门禁、配置及恢复材料复核，不在每个文件回调里重复全部Git网络请求。

新增只在本调用栈内持有的进度审计：已完成成员核目标准确字节和本次原语返回的完整身份；未写成员仍核原件/原身份或准确不存在；仅当前写入成员可处于原件/目标及准确pending的受限状态，最终每件再读回。固定目录路径和身份重核，目录成员只允许本轮已创建helper和当前pending；额外文件、原件/已写文件晚变、父目录替换、门禁/私有证据漂移均拒绝。该审计返回实际当前文件事实，不假装原Runtime仍未变；原全组观察明确observationTiming=PRE_INSTALLATION_INTENT，新文件事实在toolFiles单独返回。原只读白名单保持，仅新私有工具读者增加固定pending原件读取。

成功止于TOOL_FILES_WRITTEN_FENCED：toolFilesWritten/snapshotMaterialsConfirmed=true，仍保留临时拒绝门禁、维护marker、原三应用停写及restart=no；permanentGatesLoaded/installationComplete/canExecute为false，不启动业务或清marker，不执行新工具。restoreValidationDeferred=true/restoreProven=false，继续2026-10-29用户决定，不以完整恢复演练阻断交付；snapshotAvailable及独立AWS来源/可信时间旧flag不被伪改为true。

新增19项真实临时Runtime文件与主机模型测试，覆盖同锁且两份回执之后才写、27项顺序/准确目标、旧入口隔离、错ack/源失败、原配置/DB/临时门禁保持、部分失败与拒绝重放、残件/未知文件、已写/未写/配置/存储/回执漂移、目录替换、文件循环无Git请求和开关前置。Python3.10 AST/符号/差异及准确读回静态审阅完成；MCP-workspace未运行lint/build/test；上述19项已随最终head两条Release各1291项通过CI。真实安装与性能/文件系统/进程验收未执行。

本批是同bootstrap内部原子接线/私有返回新增，无新helper、unit、CLI、磁盘阶段文件、业务schema/迁移或第二应用state。进度仅为本次调用的内存事实，返回或中断均不产生续跑权；故障保留现有安装原件、临时门禁和实际新旧文件/pending，不自动回滚。下一步在同一流程继续永久门禁交接、旧应用核验和最终安装完成，再完成Mac入口；完整恢复演练仍列交付后待办。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## 2026-10-29 — 最小更新执行器：恢复演练延后与工具文件写入

**D2_TOOL_FILE_WRITE_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3050](https://github.com/sanqin888/sanqinMVP/pull/3050)最终head `aed624ff78d1023ad92989e14a6306f0332b572d` 经[CI #7792](https://github.com/sanqin888/sanqinMVP/actions/runs/40920524877)SUCCESS（4成功/6范围跳过；两条Release各1272、Runtime1080、既有C1回归412），已合并dev `a31f032511d09f77a087858f07dcf4c49460f158`，无需CI修复；无生产/AWS操作。

2026-10-29用户明确要求“恢复验证等交付之后抽空再做”。据此将新Lightsail完整快照恢复、PG/WAL/业务内容对照、仅机外取得和恢复适用范围验收移入交付后待办；不再阻断本项目源码推进或作为首版完成条件，也不记为PASS。恢复研究/已合并材料保留，restoreProven保持false。更新前准确手动快照available核验、旧工具/配置恢复材料保存及机外索引确认仍属于安装前置；安装/正常发布/失败冻结自身的验收继续按原交付范围执行。历史章节中“真实恢复通过后才能交付/RECOVERY_READY”的前置关系由本节调整，以SNAPSHOT_MATERIALS_READY表示安装材料就绪，与实际恢复证明分开。

基线为[PR #3049](https://github.com/sanqin888/sanqinMVP/pull/3049)合并dev `d7798ab48726574f47b04529a8ddcdf3c30c8e00`；其最终head `7062c657ed79c93f9fe1a3759204df23c166e5b2` 经[CI #7790](https://github.com/sanqin888/sanqinMVP/actions/runs/40909418492)SUCCESS（4成功/6范围跳过，两条Release各1244、Runtime1080、既有C1回归412）。本地分支 `feat/runtime-minimal-install-write-plan-20261029`。

私有_installation_tool_write_set复用exact main/归档/Git来源和原工具差异审计，再核完整18项旧观察的原字节/metadata；返回固定27项顺序清单及单独私有目标字节：先九helper独占创建，原17按批准范围替换或只核对，最后写原目标归档的准确Manifest。只允许deploy_release.py/release_contract.py两项Runtime内容变化，保留旧文件模式；helper为0644。bootstrap不落入Runtime，永久三门禁另属后续阶段。清单只绑定来源/顺序/摘要/原身份，不是现场观察或授权，readyToInstall/canExecute仍false。

私有_write_installation_tool_member使用调用方已固定的父目录FD、原字节/完整身份及现场复核回调；固定允许路径、root身份、owner/mode/单链接、≤300秒预算和5GiB余量。未变成员只读核对；写入先独占固定pending文件，短写循环、权限/文件fsync与整件读回，重新核原文件及pending后发布。替换用单文件rename并同步父目录；helper用不覆盖的硬链接发布、同步目录、移除pending后再同步目录，最终核内容/模式/身份。每个目录/文件原语不是整个安装原子事务。失败保留实际旧/新/pending，不清理或自动回滚；pending存在时连“未变核对”也拒绝。未修改现有读取白名单，也不以该底层原语独立认证来源/路径、锁或门禁。

新增28项原件/真实临时文件与故障模型测试，覆盖固定清单/源变更、原Manifest字节及权限、独占创建、同步/rename/读回顺序、短写/零进展、残件/竞态、链接/晚变、容量/截止、失败保留及无目标代码执行。Python3.10 AST/符号/差异/读回静态审阅完成；MCP-workspace未运行lint/build/test；上述28项已随最终head两条Release各1272项通过CI。

本批仍为未接入现场事务的私有写入能力，现有安装入口不调用它。下一步在原两锁/同一owned流程、快照及机外确认后接逐项进度核验，再完成永久门禁、旧应用核验/完成交接和Mac入口；不能用导出的清单或随意回调发起生产安装。无新helper/永久unit、公开CLI、业务持久schema或第二应用state；仅新增固定pending中间件命名，后续owned清单须明确跟踪。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无依赖/业务迁移或生产/AWS/root安装/DB操作。

## 2026-10-29 — 最小更新执行器：恢复数据库只读原始采集与比对

**D2_RECOVERY_DATABASE_PROBE_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

最终[PR #3049](https://github.com/sanqin888/sanqinMVP/pull/3049)已由head `7062c657ed79c93f9fe1a3759204df23c166e5b2` 经[CI #7790](https://github.com/sanqin888/sanqinMVP/actions/runs/40909418492)全绿后合并dev `d7798ab48726574f47b04529a8ddcdf3c30c8e00`；两条Release各1244、Runtime1080、既有C1回归412通过。下文初次失败记录保留为历史。

本批已提交[PR #3049](https://github.com/sanqin888/sanqinMVP/pull/3049)。初次[CI #7789](https://github.com/sanqin888/sanqinMVP/actions/runs/40908506575)运行1244项Release测试，仅1项fixture失败：单行历史reverse不产生变化；同PR改为明确变更历史状态，保留原拒绝断言，未修改运行源码或CI门禁。修复后最终head的验证结果以该PR实际GitHub Actions记录为准。

基于[PR #3048](https://github.com/sanqin888/sanqinMVP/pull/3048)合并dev `ace53c9a6bf37563c44b203fa6c04aa89820e424` 创建 `feat/runtime-minimal-recovery-database-probe-20261029`。新增私有 `_capture_recovery_database_probe` 与纯数据 `_snapshot_recovery_database_review`：先重核独立新目标/原件，再通过已限定目标的只读端口执行原固定DB身份/迁移历史和存储查询各两次，保留四项准确argv、原始stdout/stderr及原生退出码。共享既有DB身份/历史校验器，原安装预检行为保持。

端口只接受固定查询和同一≤300秒截止时间，前后复核预算；输出每项stdout/stderr合计≤2MiB、stderr≤4KiB，完整规范采集≤8MiB。复核拒绝命令替换、顺序/数量/退出码/类型/摘要错配、前后漂移、源版本/身份/历史不符或默认表空间/配置路径越界。新容器ID必须独立指定，与源生命周期ID不要求相同；尚未通过真实Docker观察证明容器/镜像来源，不能只看SQL版本就宣称恢复成功。

成功仅为RECOVERY_DATABASE_TRANSCRIPT_MATCHED_EVIDENCE_REQUIRED / databaseTranscriptReviewed=true；readOnlyQuerySessionObserved只描述查询会话。端口目标认证、真实新主机、云隔离/血缘、DB镜像、完整集群/哨兵及持久内容仍未证明，恢复/安装/执行许可均false，五组真实证据保持OPEN。返回的raw为私有原件，不直接日志/输出；没有新增磁盘回执/SSH适配器/CLI，不接旧事务，不发HTTP或启停服务。真实调用方须先完成授权、新端点与容器绑定、隔离，并由端口所有者保留失败/中断的原始输出；本实现未实际访问恢复主机或声称已耐久保存。

新增23项回归测试，覆盖原始采集/严格复核、独立范围、固定查询/退出码、输入/输出预算、截止时间、源身份/版本/历史、前后漂移、默认表空间、无IO回放/秘密投影和断连不重试。完成Python3.10 AST/符号/差异/读回静态审阅；MCP-workspace未运行lint/build/test；实际执行与CI修复记录见本节PR说明。下一步在准确授权的新目标适配实际只读端口，补充真实Docker/主机/门禁与持久内容原件和D4统一恢复验收；当前不启用RECOVERY_READY。

本批为bootstrap同所有者内私有工具原子新增/校验器提取，无新helper/永久单元/持久schema/业务路径或第二应用state；已审阅，依赖图/基线无变化。17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持；无依赖、业务迁移、生产/AWS/root安装或DB写入。

详细原件格式与真实端口边界见[恢复前置证据合同](Runtime最小执行器恢复前置证据合同.md)。

## 2026-10-29 — 最小更新执行器：独立恢复实例目标绑定

**D2_RECOVERY_REPLACEMENT_TARGET_MERGED_DEV / SOURCE_CI_VERIFIED / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

本批[PR #3048](https://github.com/sanqin888/sanqinMVP/pull/3048)最终head `41bba8678fa2d77b06a4b83f277ca9c29e00cd38` 经[CI #7787](https://github.com/sanqin888/sanqinMVP/actions/runs/40903776855)SUCCESS（4成功/6范围跳过；两条Release各1221、Runtime1080、既有C1回归412），已合并dev `ace53c9a6bf37563c44b203fa6c04aa89820e424`，无需CI修复；无生产/AWS操作。

基于[PR #3047](https://github.com/sanqin888/sanqinMVP/pull/3047)合并dev `91c242aa1b0b8b488e4943d134d15cb9ca7f5563` 创建 `feat/runtime-minimal-recovery-replacement-target-20261029`。私有 `_snapshot_recovery_replacement_review` 复用原件材料审计重算basis，将新目标输入与独立传入的八项预期上下文逐项核对；拒绝源实例ARN、源名称或源SSH路由复用。目标限原账户/区域、单系统盘及原容量；设备名和同区域可用区可以变化，不能把源机物理身份直接套到克隆机。

恢复目标使用严格规范输入封装，保留原目标JSON的准确字节及摘要，复用既有实例/SSH/磁盘校验。它是数据核对入口，不接受PASS，不连接SSH、查询AWS、执行主机命令或写磁盘，不接回原安装事务。克隆可保留原SSH公钥；相同指纹既不证明新目标正确，也不是拒绝克隆的依据，须在准确新实例上独立核对。云来源、快照到新实例的实际血缘、启动前隔离和新主机观察均未证明，全部恢复/安装/执行许可保持false。

新增19项回归测试，覆盖独立上下文/原件/索引/basis错配、源实例与路由误用、跨账户/区域、规范输入和预算、单盘容量、克隆公钥/设备身份、原件来源不可用、无IO/命令和无秘密回显。Python3.10 AST/符号/最终差异静态审阅完成；MCP-workspace未运行lint/build/test；上述19项已随最终head两条Release各1221项通过CI。下一步按准确新目标实现只读原始证据采集与比对，真实D4证据和授权仍待落实，不能提前晋级RECOVERY_READY。

本批为bootstrap同所有者内新增私有能力，无新helper/永久单元/持久记录/公开CLI或第二应用state；已审阅，依赖图和基线无变化。17+Manifest/250/300、九helper/三永久模板和三组暂停研究保持；无依赖、业务迁移、生产/AWS/root安装或DB操作。

详细输入与真实采集边界见[恢复前置证据合同](Runtime最小执行器恢复前置证据合同.md)。

## 2026-10-29 — 最小更新执行器：恢复材料关联审计与证据合同

**D2_RECOVERY_MATERIAL_REVIEW_MERGED_DEV / SOURCE_CI_VERIFIED / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

本批[PR #3047](https://github.com/sanqin888/sanqinMVP/pull/3047)最终head `bc67365544f8d8e5dcaf13ee00eed3abf5d6e25e` 经[CI #7785](https://github.com/sanqin888/sanqinMVP/actions/runs/40900423458)SUCCESS（4成功/6范围跳过；两条Release各1202、Runtime1080、既有C1回归412），已合并dev `91c242aa1b0b8b488e4943d134d15cb9ca7f5563`，无需CI修复；无生产/AWS操作。

基于[PR #3046](https://github.com/sanqin888/sanqinMVP/pull/3046)合并dev `335cb5b1a117716f993b22e3dcec03edda12d1b6` 创建 `feat/runtime-minimal-recovery-material-review-20261029`。本批新增[恢复前置证据合同](Runtime最小执行器恢复前置证据合同.md)和私有 `_snapshot_recovery_material_review`：将机外index与快照拍摄前intent/writers/恢复二件关联，强制原目标/存储成员及整体来源/范围审计，核准确摘要、ID、source/retention、账户/区域/原实例、观察与应用绑定。既有VM确认流程在确认回执保存后调用，并再次复核现场；未新增磁盘记录、阶段开关或公开入口。

独立审计不要求晚于快照生成的snapshot-review/offhost回执，避免故障时依赖不可能在快照中的材料。index的review hash只是保留元数据，postSnapshotReviewDigestRecomputed=false；快照定位仍属于操作者保留的机外index，不视为云签名认证。输出原机basis/规范摘要（≤16KiB），包括source/应用、DB镜像ID/版本/迁移历史、Docker平台/系统Python、固定持久路径和原件摘要；它们不是新恢复机的已验证观察，也不能机械比较新机实例ID、设备/inode等易变身份。

成功只表示RECOVERY_MATERIALS_BOUND_EVIDENCE_REQUIRED / materialBindingsReviewed=true；恢复一致性、隔离替代实例门禁、完整集群、持久内容/Runtime和仅机外取得材料五组实际证据仍OPEN。requiresIsolatedRestoreEvidence/requiresHostRecheck为true，restoreProven/snapshotAvailable/recoveryReady/readyToInstall/canExecute/authorizedToMutateProduction保持false。当前无消费手填PASS/恢复结果的schema或晋级路径；hash自洽、available、只读SQL会话或CI均不替代真实恢复。

新增17项原件/主机模型与数据测试，覆盖不需要晚生成回执、原件摘要与source/retention/目标错配、自洽旧范围降级、来源不可用、输入/输出预算、无主机IO/命令回放、无秘密回显、basis重复性、同锁确认后审计、失败保留与最终现场晚变。Python3.10 AST/符号/差异静态核对完成；MCP-workspace未运行lint/build/test；上述17项已随最终head两条Release各1202项通过CI。下一步按合同固定真实隔离演练的目标/采集边界与原始证据格式，再实现严格证据验证及适用范围加载；真实授权/验收到位前不启用RECOVERY_READY。工具安装、永久门禁交接、Mac薄入口及D4统一验收仍待完成，不增加新长期研究。

本批是bootstrap同一所有者内的原子审计能力与兼容新增返回字段，没有新持久schema/业务双读路径或依赖/业务迁移；PRIVATE_FILES/RECOVERY_FILES、既有回执格式、17+Manifest/250/300、九helper/三永久模板和唯一应用state保持。旧源码/证据及三组暂停研究保留，无生产、AWS、root安装或数据库操作。

## 2026-10-29 — 最小更新执行器：VM持锁离机索引确认与耐久回执

**D2_OFFHOST_CONFIRMATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3046](https://github.com/sanqin888/sanqinMVP/pull/3046)最终head `31f0bfd01bdf08491a73de9bc668e1d1d80728c6` 经[CI #7783](https://github.com/sanqin888/sanqinMVP/actions/runs/40887429269)SUCCESS（4成功/6范围跳过；两条Release各1185、Runtime1080、既有C1回归412），已合并dev `335cb5b1a117716f993b22e3dcec03edda12d1b6`，无需CI修复；无生产/AWS操作。

基于[PR #3045](https://github.com/sanqin888/sanqinMVP/pull/3045)已合并dev `b241d21e1aa4fd906ccacf2a138d1c729be6c80d` 创建 `feat/runtime-minimal-offhost-confirmation-20261029`。新增私有 `_confirm_installation_offhost_index`：原两锁/完整目标与存储预检、意图/临时门禁/原ID停写、恢复包与snapshot-review耐久保存及现场复核后，从原件重算索引并生成本轮新transfer nonce，沿原活跃FD等待准确ack。旧回执入口不自动等待第二次输入；新原生bool开关要求完整前置，不接受导入ack/磁盘成功票据或resume。

复用原有界selectors/FD flags恢复/短写/单帧接收；普通快照请求默认仍≤4096字节，只有私有索引交接使用既定≤32KiB请求。底层原64KiB接收上限不变，严格ack解析再限≤16KiB；两次等待各自最多1800秒，不代表总维护时间承诺。每阶段前后重新启动300秒现场预算，核原件/来源/原意图、门禁/停写对象、DB/存储和恢复包；FD替换、超时、EOF、错nonce/hash/字节数或漂移沿FENCE_UNCONFIRMED保留，不自动重试或开启业务。

固定新增 `installation-runs/<installationId>/snapshot-offhost.json`，schemaVersion=1、kind=sanq-minimal-snapshot-offhost-receipt，精确12字段/≤128KiB，保存准确transfer/ack ASCII原字节、原review摘要、本轮ID、完整写出/收到时间及明确的信任/false许可。纯数据复核从原review+intent/writers/恢复二件重算索引，拒绝自洽改hash替换原件；时间必须在原review收到回复之后且本次写出≤收到ack。固定root:root/0600、父0700、5GiB余量、O_EXCL/nofollow、文件/目录fsync和完整读回/metadata重核。仅本调用栈持有准确原字节时owned/退出清单允许该成员；半写、读回失败或晚变均保留。

只有活跃ack比对、VM回执实际耐久保存及最终现场复核后，才返回OFFHOST_INDEX_CONFIRMED、offHostReceiptDurable/offHostRetentionConfirmed=true与requiresOffHostRetention=false；该确认明确限定operator-ssh-peer-durable-receipt，offHostLocationIndependentlyAuthenticated=false。既有不可变索引中的offHostRetentionConfirmed仍false，表示索引生成时状态，不回写其字节。AWS来源/可信时间/restore/snapshotAvailable/recoveryReady/canExecute仍false，requiresRecoveryValidation/requiresHostRecheck仍true；客户端持久化声明不代替准确拓扑的一致性/实际恢复证据。最终两份VM核验/确认回执均晚于快照，不能要求它们出现在该快照中。

新增22项真实双帧管道、一次性文件和主机模型测试，覆盖同锁且review/恢复包后交接、客户端实际写入、FD flags、完整写出回调、数据重算/原件与自洽hash篡改、错nonce/EOF/超时模型、通道替换、保存前后原件/存储漂移、等待超过旧预算、owned原字节/严格成员、短写/同步/读回/权限/链接/大小、部分保留、禁止重放与旧入口隔离。上述22项已随最终head两条Release各1185项通过CI；完成Python3.10 AST/符号/差异静态核对，MCP-workspace未运行lint/build/test，实际Mac/SSH/恢复仍未验收。下一步为真实恢复前置证据门禁/RECOVERY_READY，再接工具安装、永久门禁交接、Mac薄入口和D4统一隔离验收；不宣称已在实际Mac/SSH/生产完成交接。

本批为私有工具事务/协议的兼容增量，生产者与读者同bootstrap同步更新，仅新增固定确认回执；不改写历史intent/marker/writers、review或恢复包，不创建第二应用state/并行业务路径。PRIVATE_FILES四材料/RECOVERY_FILES二件、17+Manifest/250/300、九helper/三永久模板、依赖/业务schema与迁移保持；三组研究继续暂停，无生产/AWS操作。

## 2026-10-29 — 最小更新执行器：离机索引客户端耐久接收器

**D2_OFFHOST_INDEX_RECEIVER_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3045](https://github.com/sanqin888/sanqinMVP/pull/3045)最终head `168699d42cbc27033e66961732e99d3993ee7c59` 经[CI #7781](https://github.com/sanqin888/sanqinMVP/actions/runs/40882535335)SUCCESS（4成功/6范围跳过；两条Release各1163、Runtime1080、既有C1回归412），已合并dev `b241d21e1aa4fd906ccacf2a138d1c729be6c80d`，无需CI修复；无生产/AWS操作。

基于[PR #3044](https://github.com/sanqin888/sanqinMVP/pull/3044)合并dev `cf99b573334eb6e1104c6ae73254748e2baf1d8f` 创建 `feat/runtime-minimal-offhost-index-receiver-20261029`。本批实现客户端索引交接的准备能力：既有索引生成器复用新增严格41字段解析器；私有transfer工厂生成独立随机32字节challenge并绑定准确索引hash/大小；客户端只在完成保存后生成确认帧。尚未把该协议接入VM原持锁等待/确认落盘链，不提升任何VM许可。

索引≤16KiB、transfer≤32KiB、ack≤16KiB，均规范JSON/严格字段/原生类型；逐项核摘要、source/安装/retention身份、账户/区域/实例/快照ARN、完整challenge名、可用区、规范UTC时间及固定材料路径，拒绝任意metadata或权限字段。客户端必须独立传入已验证SSH/本轮上下文六项：accountId、region、instanceArn、instanceName、installationId、snapshotReviewSha256；与输入不符即在IO前拒绝，不能从transfer自行建立“预期”目标。

私有 `_retain_snapshot_index_offhost` 只允许非root Linux/Darwin进程和原生true的机外操作员确认。调用者选已存在的绝对0700私有目录，逐级nofollow打开并保留/复核祖先FD身份；路径不来自VM帧，拒绝系统/生产路径、符号链接、歧义或不可信可写祖先。仅独占创建固定 `snapshot-index-<installationId>.json`、0600/单链接，短写循环、文件/目录fsync、完整读回及metadata/路径重核；不自动建目录、覆盖、删除或重试。Darwin还要求可用F_FULLFSYNC，文件/目录fsync之后执行，缺失或失败不降级；实际APFS/设备/SSH行为仍待D4。

只有全部IO和目录退出核对成功后，才返回绑定transferChallenge、installationId、review/index摘要及准确字节数的ack，clientIndexDurable/operatorConfirmedOffHost为true，canExecute/recoveryReady仍false。clientIndexDurable仅描述该进程实际系统调用/读回成功；机外位置依赖操作者及既有SSH上下文，不构成独立机器认证、AWS认证或存储硬件/真实恢复证明。索引原offHostRetentionConfirmed=false和全部false许可保持；VM尚未消费ack。断连/丢ack/部分文件均保留并阻断自动重放，未声明真正生产机外保存已完成。

新增22项纯数据、真实一次性文件与模型测试，覆盖所有必需字段/null、hash/ARN/名称/类型/权限/路径、独立上下文、实际短写与同步顺序、已有文件/链接/祖先替换、容量/读回/晚变/部分失败、Darwin能力/失败不回退、旧nonce确认拒绝、既有真实owned投影接新解析器及无VM命令/公开CLI。上述22项已随最终head两条Release各1163项通过CI；完成Python3.10 AST/符号和差异静态核对，MCP-workspace未运行lint/build/test，实际Mac/文件系统/SSH仍未验收。下一步把transfer/ack接入原持锁维护流，核准确VM回执并耐久保存确认，再落实恢复前置证据门禁和Mac薄入口/D4统一验收。

本批仅同bootstrap私有工具协议/用户侧索引文件的新增能力，旧索引41字段字节及既有VM入口行为保持，无旧数据回填、业务双读路径、依赖或业务schema/迁移；未改变PRIVATE_FILES/RECOVERY_FILES、17+Manifest/250/300、九helper/三永久模板或唯一应用state。三组研究继续暂停，无生产/AWS操作。

## 2026-10-29 — 最小更新执行器：快照核验耐久回执与离机索引

**D2_SNAPSHOT_REVIEW_RECEIPT_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3044](https://github.com/sanqin888/sanqinMVP/pull/3044)最终head `c5947522d852ba6356e2cad393f4da362a15eeab` 经[CI #7779](https://github.com/sanqin888/sanqinMVP/actions/runs/40879127073)SUCCESS（4成功/6范围跳过；两条Release各1141、Runtime1080、既有C1回归412），已合并dev `cf99b573334eb6e1104c6ae73254748e2baf1d8f`。初次CI #7778重放测试的等待线程断言遮住预期维护拒绝；同PR仅给fixture透传exchange，重放分支禁止进入等待，未改源码行为或CI门禁。

基于[PR #3043](https://github.com/sanqin888/sanqinMVP/pull/3043)已合并dev `11d733b240d1af1a27bcec5c57a8d1f034e2f1a2` 创建 `feat/runtime-minimal-snapshot-review-receipt-20261029`。新增私有 `_retain_installation_snapshot_review`，只在原两锁、完整目标/存储预检、意图/临时门禁/原ID停写、恢复包耐久保存、活跃challenge内容核验之后保存本轮回执；原内存核验入口仍不写新文件。

固定新增 `installation-runs/<installationId>/snapshot-review.json`：schemaVersion=1、kind=sanq-minimal-snapshot-review，保存完整规范请求、准确回复原始字节的ASCII字符串、完整写出/收到时间和可重算的原内容结果。原始结果继续保留写入前requiresDurableSnapshotReceipt=true；只有本流程实际O_EXCL/nofollow创建、root:root/0600、文件及目录fsync、整件读回、写后metadata稳定和最终现场复核完成，才对外返回snapshotReviewDurable=true及requiresDurableSnapshotReceipt=false。文件≤192KiB，父事务目录0700，复用5GiB余量；不增加原归档上限或改变PRIVATE_FILES四材料/RECOVERY_FILES二件。

纯数据复核先对照原intent/writers/恢复tar及回执五项准确绑定，再从恢复包原件重算目标/存储和原意图观察摘要，重跑快照内容/时间校验并逐字节比较结果；不能仅信持久化成功标记。原事务owned记录/退出清单只在持有本次准确回执字节与完整恢复包时允许该固定新成员；缺失、替换、额外文件、半写、同步/读回/保存后漂移均阻断并保留实际证据，不自动清理、重放或开启业务。

生成≤16KiB固定字段离机索引，包含准确账户/区域/源实例/快照对象、本轮challenge、意图/writers/归档/回执/目标/核验原件摘要、source/retention身份和固定材料路径；任意AWS metadata、完整回复、配置/主机原件不回显。索引只是待Mac保存的内存投影，offHostRetentionConfirmed=false、requiresOffHostRetention=true；快照先于最终回执，snapshotContainsFinalReview=false。保存回执不证明已存机外、云来源认证、可信时间或DB恢复，snapshotAvailable/recoveryReady/canExecute/restoreProven仍false。

新增20项一次性文件/主机模型及纯数据/IO测试，覆盖准确同锁/停写/耐久顺序、原件重算、字段/绑定/规范格式篡改、只投影索引、显式owned证据、实际短写/同步/读回、权限/链接/容量、失败原样保留与禁止重放、保存后存储漂移、旧入口隔离和无公开CLI。上述20项已随最终head两条Release各1141项通过CI；完成Python3.10 AST/符号/差异静态核对，MCP-workspace未运行lint/build/test，真实平台/恢复仍未验证。下一步补离机索引的耐久接收确认与真实恢复前置证据门禁，再接RECOVERY_READY/安装，D4真实恢复/中断验收仍OPEN。

本批为私有工具事务的兼容增量：生产者/读者在同一bootstrap同步发布，只新增固定回执，不改写历史意图/marker/writers/恢复包或创建业务双控制路径；无依赖、业务schema/迁移、17+Manifest/250/300、九helper/三永久模板或唯一应用state变化。三组研究保持暂停，无生产/AWS操作。

## 2026-10-29 — 最小更新执行器：手动快照内容校验

**D2_SNAPSHOT_CONTENT_VALIDATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3043](https://github.com/sanqin888/sanqinMVP/pull/3043)最终head `51a945e67d7f304a21e6f2f475284c86e708e098` 经[CI #7776](https://github.com/sanqin888/sanqinMVP/actions/runs/40870736100)SUCCESS（4成功/6范围跳过；两条Release各1121、Runtime1080、既有C1回归412），已合并dev `11d733b240d1af1a27bcec5c57a8d1f034e2f1a2`，无需CI修复；无生产/AWS操作。

基于[PR #3042](https://github.com/sanqin888/sanqinMVP/pull/3042)已合并dev `02dc3be9b3741024bc9ac31f5ad062992b0b89b9` 创建 `feat/runtime-minimal-snapshot-content-validation-20261029`。私有 `_review_installation_snapshot_content` 将已绑定目标/存储恢复包接入原同锁等待链：耐久包之后才发challenge，等待前后强制核目标原件/意图与完整现场；旧只读、恢复保存及未核验输入入口继续各自原行为。

新请求展示原账户/区域/实例、目标/存储摘要及完整 `sanq-runtime-<64位challenge>` 名称。单帧回复沿原六项绑定/64KiB/1800秒限制，内容逐项核手动快照ARN/完整名称、来源实例、available状态、区域、原生bool/int、明确空fromAttachedDisks及系统盘大小；快照可用区允许all或准确源可用区，分别保留。操作者须明确确认已认证AWS会话及完整challenge后创建，并声明准确对象/available观察时间；这些是人工声明，不构成服务端AWS认证。

完整请求写入FD后、开始读回复前记录本机UTC时间；创建/观察必须满足prepared≤完整写出≤createdAt≤available观察≤收到回复。输入选用带显式时区的RFC3339字符串、秒小数0–6位，规范到UTC微秒；拒绝无时区、未知-00:00、非法日期/偏移、超精度及epoch数值，不猜AWS数字单位。Mac薄入口尚未实现，未来须显式转换数字时间；操作者确认实际显示后创建。该顺序仅在本机/人工时钟信任范围内有效，时钟矛盾阻断，不宣称可信时间。

新增25项纯内容比较、真实管道和完整主机模型测试，覆盖all/来源区分、每个必需字段缺失/null、错账户/区域/来源/名称、pending/error/伪成功、附加盘/类型、人工声明、时区/精度/顺序、原绑定替换、原件漂移、完整短写回调、同锁且耐久包后等待、失败保留及禁止重放。上述25项已随本批两条Release各1121项通过最终CI；Python3.10 AST/符号及差异静态核对完成，MCP-workspace未执行lint/build/test，真实平台/恢复仍未验证。

通过仅返回内存 `SNAPSHOT_CONTENT_VALIDATED` 摘要和 `snapshotContentValidated/snapshotEvidenceValidated=true`，不回显任意AWS元数据或原件。awsOriginAuthenticated/trustedTimeProven/restoreProven/snapshotAvailable/recoveryReady/canExecute仍false，requiresDurableSnapshotReceipt/requiresRecoveryValidation/requiresHostRecheck为true；尚无快照核验磁盘回执或离机索引。下一步为耐久核验回执、离机定位及真实恢复前置门禁，再接安装。该私有同bootstrap输入属于内部原子增量，无新持久schema/兼容路径、依赖或业务迁移；17+Manifest/250/300、PRIVATE_FILES、九helper/三永久模板、唯一应用state及三组研究暂停保持，无生产/AWS操作。

## 2026-10-29 — 最小更新执行器：目标存储原件与恢复包意图绑定

**D2_STORAGE_RECOVERY_BINDING_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3042](https://github.com/sanqin888/sanqinMVP/pull/3042)最终head `c9c097e496573d3bbae85c57de11b3373add0f7c` 经[CI #7774](https://github.com/sanqin888/sanqinMVP/actions/runs/40859596784)SUCCESS（4成功/6范围跳过；两条Release各1096、Runtime1080、既有C1回归412），已合并dev `02dc3be9b3741024bc9ac31f5ad062992b0b89b9`，无需CI修复；未安装或执行生产/AWS操作。

基于[PR #3041](https://github.com/sanqin888/sanqinMVP/pull/3041)合并dev `db53bdaccce01cb110744fa055358c1f02f3a3de` 建立 `feat/runtime-minimal-storage-recovery-binding-20261029`。新增私有 `_retain_installation_target_storage`，在同一次原两锁/完整预检中捕获目标和存储原件，复用原意图、临时门禁、原ID停写、恢复包审计及成对耐久保存；当前不接快照等待、内容核验或安装。

恢复tar只增固定 `observations/pre-snapshot-storage.json` 成员及index.capture.snapshotStorage元数据：保存规范目标原始字节、公开SSH key原件/身份、两轮mountinfo、四次准确lsblk/只读SQL原stdout、目录/配置metadata、空表空间事实和写意图前完整观察。纯数据复核共用原验证规则重算facts，并将完整原观察摘要对照原intent.observationSha256；篡改后重算外层hash也不能替换该绑定。新owned流程强制require_target_storage=true，缺失原件不能降级为旧范围审计；旧格式与原入口保持原行为，不授予目标核验结果。

新增20项一次性文件/主机模型测试，覆盖同锁且意图前采集、冻结后/保存后复核、原件/metadata/命令/SQL/目标篡改、原观察摘要变动、缺成员/降级、字节预算、失败保留及禁止重放；旧23项测试只提取共享fixture准备方法，保留全部断言。完成Python3.10语法AST、符号/定义、差异与读回静态核对后，上述20项已随本批两条Release各1096项通过最终CI；MCP-workspace未执行lint/build/test，真实平台/恢复仍未验证。

本批按工具恢复归档的兼容增量扩展处理：读者/生产者同一bootstrap原子更新，保留历史证据格式；不是第二发布控制器或并行业务兼容路径。PRIVATE_FILES四材料、原意图/marker/writers/回执schema、现役17+Manifest/250/300、九helper/三永久模板、锁/owner/mode与原共享预算保持。单独只读facts仍保留requiresIntentBinding=true原值；新流程只在实际耐久读回及最终现场重核后返回snapshotStorageBoundToIntent/snapshotTargetStorageReviewed=true，snapshotAvailable/recoveryReady/canExecute仍false。快照内容核验、核验回执、安装/门禁交接、Mac入口及D4统一真实恢复/中断验收仍OPEN；三组研究继续暂停，无生产或AWS操作。

## 2026-10-28 — 最小更新执行器：停写前目标与系统盘只读观察

**D2_PRE_SNAPSHOT_STORAGE_OBSERVATION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3041](https://github.com/sanqin888/sanqinMVP/pull/3041)最终head `cb7f490e96a00046fec26f612ceef849af03e4c7` 经[CI #7772](https://github.com/sanqin888/sanqinMVP/actions/runs/40819628612)SUCCESS（4成功/6范围跳过；两条Release各1076、Runtime1080、既有C1回归412），已合并dev `db53bdaccce01cb110744fa055358c1f02f3a3de`。初次CI #7771因测试辅助方法覆盖TestCase.run失败；同PR仅改命令模拟器命名，未修改源码行为或CI门禁，修复后最终head通过。

基于[PR #3040](https://github.com/sanqin888/sanqinMVP/pull/3040)合并dev `d7b27fe0e573a32dd637f8c03a0baeb70efc0368` 建立 `feat/runtime-minimal-pre-snapshot-storage-20261028`。在现有安装器内新增私有只读 `_observe_installed_snapshot_storage`：沿原两锁/全预检双次观察，将停写前操作者AWS实例/SSH目标材料与本机固定Ed25519公钥指纹、系统盘/固定宿主路径、PG15默认数据/WAL/表空间及配置位置绑定；只返回观察与摘要，不创建意图/门禁、不停写。

新增固定lsblk argv与原DB完整ID上的固定只读SQL，复用原300秒/单命令/输出预算；不接受调用者命令、设备路径或SQL。原始目标材料≤64KiB规范JSON且严格字段/原生类型/人工确认；源实例须唯一已附系统盘，区域/ARN/名称与既定目标一致。Linux只接受ext4/xfs根、单一普通disk/part及标准DockerRootDir；固定目录逐级nofollow并核路径/FD，拒绝分盘、同设备bind/子挂载、WAL/默认PG目录重定向、自定义/残留表空间及迁出PGDATA的主配置位置。设备名差异由明确的人工Linux系统盘绑定承载，不凭云盘名字或容量猜身份；awsOriginAuthenticated仍false。

新增23项一次性文件/主机模型测试，覆盖完整同锁只读组合、原入口隔离、严格目标/同名错ARN/错SSH key、磁盘/挂载/PG目录/表空间/配置重定向、采集中及两轮间漂移、准确命令allowlist/预算和无公开CLI。完成静态核对后，上述23项已随本批两条Release各1076项实际通过最终CI；真实主机/SSH/设备/AWS及D4恢复仍未验证，不把源码CI当生产通过。

新观察明确requiresIntentBinding/requiresHostRecheck=true；snapshotAvailable/recoveryReady/canExecute/restoreProven均false，原写意图/停写/恢复包/等待入口不调用新观察。本批按内部原子新增的只读观察能力交付，未改变持久schema、PRIVATE_FILES四材料、17+Manifest/250/300、九helper/三永久模板、唯一应用state、依赖或业务迁移；无生产/AWS操作。下一步在同一owned流程把目标/存储原始事实接入意图与恢复包审计，再接内容核验/耐久回执；D4真实设备/SSH/lsblk版本、实际完整DB恢复和中断验收仍OPEN。三组研究继续暂停、不取消。

## 2026-10-28 — 最小更新执行器：手动快照内容核验合同

**CONTENT_REVIEW_CONTRACT_MERGED_DEV / DOCUMENTATION_CI_VERIFIED / NOT_IMPLEMENTED / NOT_INSTALLED。**

本批[PR #3040](https://github.com/sanqin888/sanqinMVP/pull/3040)最终head `96396fc494fb2a7a43bc7997dbcca51af4c76051` 经[CI #7769](https://github.com/sanqin888/sanqinMVP/actions/runs/40777661283)SUCCESS（1成功/9文档范围跳过），已合并dev `d7b27fe0e573a32dd637f8c03a0baeb70efc0368`；两次提交包含完整8份文档，无源码CI修复或生产操作。

原文档批次基线为 `d6484c6d7216c32bacd9eb36a980296a25ed2152`（PR #3039），原分支为 `docs/runtime-snapshot-content-contract-20261028`；文档改动已按上述回执合并。已制定并复审[手动快照内容核验合同](Runtime手动快照内容核验合同.md)：要求停写前独立绑定SSH目标/实例，观察系统盘及完整DB/WAL/表空间覆盖，再核本轮challenge关联的新手动快照；区分字段一致与人工AWS会话核验。这些能力尚未实现，未证明生产磁盘覆盖；首版仍阻断附加盘、分离/远端存储及覆盖不明，不增加多盘编排。

本次续审对照最新安装器、24项等待测试、CI工作流/实际回执及AWS/PostgreSQL官方文档，补齐快照可用区all与区域分别比较、源/快照磁盘清单分开核验、DB仍运行时的一致恢复前置，以及拍照后回执须有离机索引的边界；同步发布手册与AWS owner入口。本批仍仅文档，未增加验证器、未改ready许可、源码、依赖、业务schema或既有17+Manifest/250/300；未执行项目测试或生产操作。下一步为停写前独立目标与设备/完整DB存储观察，再接内容核验及耐久交接；三组研究继续暂停、不取消。

## 2026-10-28 — 最小更新执行器：快照材料有界等待与现场复核

**2026-10-28 当前进度：D2_SNAPSHOT_EVIDENCE_WAIT_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3039](https://github.com/sanqin888/sanqinMVP/pull/3039) head `1a5beeb891e6e023b501f8746a602a59f5f43f96` 经[CI #7766](https://github.com/sanqin888/sanqinMVP/actions/runs/40767652506)全绿（4成功/6范围跳过；Release默认Python与3.10各1053、Runtime1080、既有C1回归412），合并dev `d6484c6d7216c32bacd9eb36a980296a25ed2152`，无需CI修复；未执行生产操作。

本批从[PR #3038](https://github.com/sanqin888/sanqinMVP/pull/3038)已合并dev `921cb579e8e4f67a04e72760f8955250ea77bfa3` 建立 `feat/runtime-minimal-snapshot-review-wait-20261028`。内部_receive_installation_snapshot_evidence只续接同一次原两锁、全预检/意图/临时门禁/原ID停写、整体范围审计与恢复包成对耐久保存；最后才进入单次输入等待。旧恢复保存/停写入口不等待，新开关与完整阶段严格关联，仍无install/snapshot-review/resume公开CLI。

输入/输出只借用调用者已打开的管道或真实terminal FD，预检拒绝普通文件、socket、同FD、反向FD及同一管道回环，记录稳定身份并在等待前后核对。不打开调用者路径、不启动命令/后台进程或新建恢复记录。selectors配合临时O_NONBLOCK有界短写/分块读，完成后恢复原FD状态标志，不关闭调用者FD；恢复标志失败也阻断。请求≤4096字节，回复≤64KiB且单行规范JSON；输出背压、零进展、EOF、超时、超量或多帧均不能变成无限等待/空成功。

等待上限固定1800秒（运维边界，不是AWS完成时长保证）。请求绑定本次installationId、intent/writers/归档/回执SHA及新随机32字节challenge；回复必须准确对应这些字段、固定kind/schemaVersion=1和非空evidence对象，拒绝重复/额外字段、非有限值、坏编码/规范化及旧challenge。该结构只说明本次输入接收，不认证evidence里的VM、磁盘、快照、时间或available状态；即使evidence自报snapshotAvailable=true也仍未验证。原始输入只在本轮内存中处理，对外仅回请求/回复/evidence摘要与字节数，不回显输入或秘密，也不落成可供resume的磁盘票据。

等待前后各重新启动300秒monotonic现场复核预算，沿同一owned调用栈重核意图/marker/目录/恢复包准确字节、来源与原Runtime/配置/备份、冻结的原三ID/DB/卷、SQL历史、plans/jobs/原锁和全部retention，再从归档复核整体范围。普通原入口仍使用原预算；不复用已过期的等待前deadline，不放宽250/300来源guard。坏通道在现场预检/安装写入前拒绝；等待阶段任何异常或晚变仍FENCE_UNCONFIRMED，保留实际门禁/停写/原件/成对恢复包，不自动开启业务、清理或重放。

本阶段结果为INSTALLATION_SNAPSHOT_EVIDENCE_RECEIVED，snapshotReview.outcome=SNAPSHOT_EVIDENCE_RECEIVED_UNVERIFIED，仅unverifiedEvidenceReceived=true、requiresSnapshotValidation=true；snapshotEvidenceValidated/snapshotAvailable/recoveryReady/canExecute仍false。它是后续快照内容核验的输入层，不是RECOVERY_READY。后续必须在当前调用栈中核准确VM/区域/存储覆盖、停写后创建顺序及手动快照available证据，再接耐久核验回执/工具安装；本批不调用AWS、不创建快照，不恢复可信时间/跨克隆研究。

新增24项真实管道/线程及完整模型测试：部分帧/实际短写、输入超时/输出背压、EOF/零进展/超量/多帧、FD类型/方向/回环/非法截止、完整绑定/challenge/严格JSON/权限字段、同锁且耐久包之后才请求、摘要不泄露与嵌套available自报不授予许可、等待超过旧300秒后新预算、错challenge/超时/EOF的保留及禁止重放、等待中plan/DB/通道变化、坏通道提前拒绝、旧入口不等待/无CLI。主机/GitHub/根身份仍为模型；完成静态核对后，上述24项已随本批两套Release各1053项通过CI。D4仍须验证真实SSH/TTY模式与帧容量、FD断连/flags、中断/重启、backup timer触发及资源/预算。

原PRIVATE_FILES四材料、intent/marker/writers/恢复包与回执格式、17+Manifest/250/300、九helper/三永久模板及唯一应用state保持，无新依赖包或业务schema/迁移。快照证据内容核验、RECOVERY_READY、逐文件安装/永久门禁、旧应用核验交接、Mac薄入口及D4统一真实隔离验收仍OPEN。三组研究暂停、不取消；未执行生产预检、停写、安装、AWS或数据库写操作。

## 2026-10-28 — 最小更新执行器：恢复包整体范围审计

**2026-10-28 当前进度：D2_RECOVERY_PACKAGE_SCOPE_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3038](https://github.com/sanqin888/sanqinMVP/pull/3038) head `20f41f3e46deb88ec3d952dcad01125ab4b76bc2` 经[CI #7764](https://github.com/sanqin888/sanqinMVP/actions/runs/40763812539)全绿（4成功/6范围跳过；Release默认Python与3.10各1029、Runtime1080、既有C1回归412），合并dev `921cb579e8e4f67a04e72760f8955250ea77bfa3`，无需CI修复；未执行生产操作。

本批从[PR #3037](https://github.com/sanqin888/sanqinMVP/pull/3037)已合并dev `f561319216da20fb88fc9d702f8020d35aec0dc1` 建立 `feat/runtime-minimal-recovery-scope-review-20261028`。在原同锁完整停写/恢复保存流程中，生成归档与回执后、创建recovery目录前，直接从归档重建原件/host/index，核整包清单/规范USTAR/header/body/padding/尾部与原意图/writers/回执绑定。不是仅再次相信内存capture或自洽外部摘要；所有读取有原成员数、单件/总字节限制，绝不把包解压到文件系统或执行包内字节。

逐组核全部retention四材料原记录与内容派生ID，当前组绑定原意图的目标/旧Runtime source；以当前组旧封存归档重新验证17成员及原Manifest准确字节，并对照三外部备份原件及backup service。从现役配置观察提取原有纯解析主体，现场reader和包内.env/唯一state/C4共用相同规则；当前应用SHA必须与writers一致，未修改原字节或创建第二应用版本权威。

Host观察按准确argv分组，每个命令的原stdout按出现次序使用；复用现有Docker、环境/网络、有效端口/健康检查和已加载unit验证器重算，核对应摘要、原对象和全部命令消费完毕。跨不同命令不依赖JSON容器键顺序或ps展示顺序；缺少必要重复读或多余重复读阻断。实际命令客户端不参与回放，不查询已停止应用/HTTP或运行docker/systemctl；当前应用成对镜像仍经原fetch来源规则读取核对，故不称为完全离线来源认证。历史包只核记录和原字节、不执行或复活暂停研究。

审计通过只生成内存scopeReview摘要：归档/回执/capture摘要、原件/缺失项/历史组/观察数量、旧17与应用SHA、packageScopeReviewed=true。随后仍须按原规则独占耐久保存、整件读回及最终现场/历史/owned核对，才返回已保存结果；scopeReview不是磁盘安装票据。失败一律沿原FENCE_UNCONFIRMED保留停写/意图/marker/writers及已存在原件，不自动恢复或重放。旧单独停写入口不运行该审计，原恢复包/回执格式及其false许可字段保持。

| 恢复范围 | 本批整体核对 | 仍需的恢复证明 |
| --- | --- | --- |
| 旧17+原Manifest/归档 | 包内准确字节与旧封存归档一致 | 现场安装后旧应用核验 |
| 九工具/bootstrap、三drop-in原缺失 | 原固定缺失清单与index、包全集核对 | 实际安装/永久门禁交接 |
| .env/唯一state/C4及备份工具/unit | 共用原配置规则与原件对照 | SQL实际可恢复、平台来源不由此证明 |
| plans/jobs、全部已完成retention、私有目录 | 原字节/metadata/固定清单/原缺失事实及包绑定 | 全量主机恢复不由tar单独证明 |
| 四容器/镜像/挂载/网络/加载配置 | 已保存stdout数据回放与来源/既定摘要一致 | 当前现场新鲜性仍由原重核保证 |
| DB卷、uploads/sounds、SQL备份数据 | 既有现场路径/完整性摘要供核验；不复制成此工具tar | 停写后准确VM/存储覆盖的手动快照available及D4恢复 |

快照接入点明确为：本轮准确原ID停写且恢复包耐久读回/整体审计成功之后，WRITE_TOOLS之前。下一步须绑定本次installation/意图/writers/归档与准确VM、区域及存储覆盖、手动快照标识、停写后创建和available观察证据；不能把snapshotAvailable=true、裸hash或旧成功记录当确认。人工等待需单独有界，并在同一原两锁/owned调用栈中使用新的有界现场复核预算；不能复用过期命令deadline或放宽既有250/300来源guard。该等待/输入核验尚未实现，不自动调用AWS，不开放resume或提前改ready。

新增21项模型测试，覆盖完整组合与独立无主机IO审计、同锁且已冻结/保存前时序、审计失败保留、全部历史组、自洽外部hash下旧源码/原Manifest/外部备份/配置/state/C4篡改、stdout内容/加载投影不符、少/多重复读、不同命令顺序不影响语义、坏JSON、历史记录不符、缺host成员、回执/截断/尾部/成员类型/重复/超大声明、来源失败及旧入口不执行。静态检查含配置解析提取等价性、AST/名字/方法/空白、差异与准确读回；上述21项已随本批两套Release各1029项通过CI，真实系统验收仍OPEN。D4仍须验证实际内存/重复读取/300秒命令预算、真实恢复及中断边界。

completePrivateStateCaptured、snapshotAvailable、recoveryReady、readyToInstall/canExecute仍false；该表是已实现受限范围的对照，未完成整机恢复或安装交付。后续为快照核验、逐文件安装/永久门禁、旧应用核验交接、Mac薄入口及D4统一真实隔离验收。17+Manifest/250/300、九helper/三永久模板、唯一应用state、依赖包与业务schema保持。三组研究暂停、不取消；未执行生产预检、停写、安装、AWS或数据库写操作。

## 2026-10-28 — 最小更新执行器：私有目录清单与原缺失事实

**2026-10-28 当前进度：D2_RECOVERY_PRIVATE_NAMESPACE_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3037](https://github.com/sanqin888/sanqinMVP/pull/3037) head `9114a8217588a974bd80ba92994ae7bfdfdd0393` 经[CI #7762](https://github.com/sanqin888/sanqinMVP/actions/runs/40761211135)全绿（4成功/6范围跳过；Release默认Python与3.10各1008、Runtime1080、既有C1回归412），合并dev `f561319216da20fb88fc9d702f8020d35aec0dc1`，无需CI修复；未执行生产操作。

本批从[PR #3036](https://github.com/sanqin888/sanqinMVP/pull/3036)已合并dev `39bc6a5dee82b2a638c3494d7022e68ac9f84d84` 建立 `feat/runtime-minimal-recovery-private-namespace-20261028`。恢复原件采集在原两锁内增加deploy-state完整根清单、四固定目录路径/FD身份与完整指纹、maintenance原本为空、installation-runs原本缺失或为空的事实；开始/结束采集再次核对。不把本轮随后生成的marker、事务或临时门禁当旧原件。

根清单有界至多5项，仅jobs/plans/maintenance/installations及可选installation-runs；未知/重复/缺失项直接阻断。目录均nofollow、root 0700，路径与原持有FD必须匹配；原事务目录只能缺失或严格为空，任何残件继续阻断且不清理。规范privateNamespace事实只含固定目录原identity/fingerprint、originalEntries、空maintenanceEntries及可空installationNamespace，不保存新秘密字节，不增加磁盘记录或公开CLI。index打包须验证准确字段、原owner/mode、原生整数、identity投影及准确清单，不能漏掉或扩大原缺失事实。

恢复保存续接必须携带本轮采集的原namespace事实，并在写意图前重读完整事实一致。创建事务namespace时保留真实created结果：原本缺失必须由本次调用真正创建，不能收养中途出现的空目录；原本存在则必须保持原inode。之后在本轮state_matches/owned检查中只容许自身已知的根清单变化，持续核根/四原目录/事务namespace稳定身份；原有准确意图/marker/writers/recovery目录与成员证明继续检查，未用mtime例外放过未知目录或记录。

采集/写意图前漂移不产生停写动作；已开始变更后的异常继续按原保存ID尽力围堵并FENCE_UNCONFIRMED。归档/回执期间出现未知根或维护成员、事务namespace替换，都保留实际原件与空/部分/完整恢复包，不返回成功、不恢复策略/启动业务/删除证据或自动重放。新检查仅用于本轮完整恢复保存；单独意图/停写入口保持原范围，不接纳导入的事实作为执行许可。

新增23项模型测试：准确缺失/空事实、既有空目录inode、同锁只读无write/fsync/spawn、完整归档原事实、未知根文件/目录及旧事务残件、软链接/权限、采集后未知条目/空目录出现、创建竞态拒绝收养、原空目录替换、写意图前plan漂移、首个停写动作后未知根及保存后根/maintenance/namespace晚变、严格事实解析/打包、缺原事实的续接拒绝、旧停写入口不启用新采集。既有恢复保存的晚期plan漂移测试改为首个writer动作后注入，继续断言FENCE_UNCONFIRMED及保留停写证据；新测试另证明采集后、意图前plan变化提前阻断。完成静态AST/名字/方法/空白、差异与准确读回核对后，上述23项已随本批两套Release各1008项通过CI；真实系统验收仍OPEN。真实inode/权限、SIGKILL/重启及大材料资源/300秒预算仍属D4。

本批补齐固定私有根清单及原缺失事实，completePrivateStateCaptured、recoveryReady、snapshotAvailable、readyToInstall/canExecute仍false。下一步统一对照恢复范围并接停写后准确Lightsail手动快照available核验，再进入RECOVERY_READY与工具安装；永久门禁、旧应用核验交接、Mac薄入口和D4真实隔离验收仍OPEN。17+Manifest/250/300、九helper/三永久模板、原四材料及唯一应用state权威保持，无依赖包/业务schema变化。三组研究暂停、不取消；未执行生产预检、停写、安装、AWS或数据库写操作。

## 2026-10-28 — 最小更新执行器：恢复包保留全部历史交付材料

**2026-10-28 当前进度：D2_RECOVERY_MATERIAL_HISTORY_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3036](https://github.com/sanqin888/sanqinMVP/pull/3036) head `0ecc13c5bdc5bf8b9bdfc277417142a042ca0f6e` 经[CI #7760](https://github.com/sanqin888/sanqinMVP/actions/runs/40759140082)全绿（4成功/6范围跳过；Release默认Python与3.10各985、Runtime1080、既有C1回归412），合并dev `39bc6a5dee82b2a638c3494d7022e68ac9f84d84`，无需CI修复；未执行生产操作。

本批从[PR #3035](https://github.com/sanqin888/sanqinMVP/pull/3035)已合并dev `54209c55d6dfb2c7883f2d7f4d32b834c239a82a` 建立 `feat/runtime-minimal-recovery-material-history-20261028`。安装前原件采集从“本次retention四材料”扩展为installations目录中全部已完成retention，保留每组四份准确原字节、文件metadata、组目录及共同namespace完整指纹。固定PRIVATE_FILES四成员和各自格式保持；无历史版本选择、保留清理、恢复执行或新CLI。

扫描至多64个严格64hex目录，root 0700、四文件0600/nofollow/单链接；四成员齐全、大小预算、原目录与文件身份、规范retaining/retained记录、内容派生retentionId及两归档摘要/长度必须一致。读取前先检查本组声明大小，所有组继续受原48MiB来源总预算，打包时原件加宿主观察仍共享48MiB，原2100成员/56MiB归档/2MiB index/300秒截止保持。超预算直接阻断，不删历史、不选“最近一份”或静默漏项。未知名称、额外/不完整成员、坏记录、链接、权限或读取中替换均保留并拒绝。

历史交付包和旧Runtime归档仅按原记录核对字节/摘要，作为恢复数据保留；不执行/导入/解压其内容，也不把历史材料记录当当前安装许可、当前应用版本或历史Git来源重新证明。本次目标材料原新鲜来源审阅继续独立执行。原件清单新增retainedMaterialDirectories/retainedMaterialNamespace事实，打包固定路径集合只允许这些已审组的准确四文件，要求含本次retention；不能遗漏已声明组或任意扩展路径。

同一次原两锁、门禁前内存采集完成后，已确认停写的恢复保存阶段在生成归档前及成对保存后重新采集全部历史原字节/metadata/目录/namespace并比较。晚期增删、同字节替换或篡改均FENCE_UNCONFIRMED；保留实际原意图/marker/writers、临时门禁、已停止原容器及空/部分/完整恢复包，不启动业务、清理记录或自动重试。对外仍只返回摘要；旧单独停写入口默认不扫描额外历史。

新增25项模型测试，覆盖全部组原字节/摘要/目录、只读且数据不执行、摘要不泄露或授予许可、同锁完整保存/index/回执绑定、未知/缺失/额外成员、目录与文件软链接/硬链接/权限、坏JSON/缺字段/内容或身份不一致、组数/读取前字节预算、两轮采集间同字节文件替换、读取中同字节目录替换、停写后新增历史、回执后历史篡改的持久证据/禁止重放、打包缺组/未知路径及旧入口行为。完成静态AST/名字/方法/空白、差异和准确读回核对后，上述25项已随本批两套Release各985项通过CI；真实系统验收仍OPEN。真实系统上历史规模、内存/重复读取和300秒预算仍须D4验证。

当前只关闭了已完成retention历史材料的漏采缺口，不把completePrivateStateCaptured、recoveryReady、snapshotAvailable或readyToInstall/canExecute改为true。其余私有namespace/缺失事实的完整范围审计与停写后准确Lightsail手动快照available绑定仍OPEN；随后才可达到RECOVERY_READY并进入工具安装。永久门禁、旧应用核验交接、Mac薄入口及D4统一真实隔离验收仍OPEN。原17+Manifest/250/300、九helper/三永久模板、唯一应用state权威、依赖包与业务schema保持；三组研究暂停、不取消，未执行生产预检、停写、安装、AWS或数据库写操作。

## 2026-10-28 — 最小更新执行器：恢复包保留宿主原始观察

**2026-10-28 当前进度：D2_RECOVERY_HOST_OBSERVATIONS_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3035](https://github.com/sanqin888/sanqinMVP/pull/3035) head `138815e7ccf4b53baba9bffde26ae0156bcb9d5c` 经[CI #7758](https://github.com/sanqin888/sanqinMVP/actions/runs/40733769666)全绿（4成功/6范围跳过；Release默认Python与3.10各960、Runtime1080、既有C1回归412），合并dev `54209c55d6dfb2c7883f2d7f4d32b834c239a82a`，无需CI修复；未执行生产操作。

本批从[PR #3034](https://github.com/sanqin888/sanqinMVP/pull/3034)已合并dev `04b3e098bdeae866c3dd26ee90c43302bbda1263` 建立 `feat/runtime-minimal-recovery-host-facts-20261028`。内部恢复保存流程在原两锁、完整预检之后，写意图/marker和临时门禁之前，保存原四容器、实际镜像、Compose导出与展开配置、Docker engine/volume/network以及四unit已加载属性的固定只读命令原始stdout。复用原Docker、环境/网络绑定、有效端口/健康检查及systemd验证器，结果必须与本轮基线一致；采集失败或漂移在任何安装写入/停写前阻断。原只读观察和单独停写入口默认不额外采集。

原始输出随既有recovery.tar保存为observations/pre-install-host.json，不新增磁盘记录或CLI。该规范JSON保存命令argv/原stdout及所对应的既定基线摘要，准确绑定writers中的原四ID/镜像/策略/生命周期/config/mount与engine摘要；完整固定命令集合必须出现，拒绝任意对象、exec/stop/reload等命令及权限字段扩大。归档仅保留输出，不把argv当恢复脚本执行。Compose导出的$$和实际环境中的$分别原样保存，不在归档时再转义或解码。输出可能含数据库URL/凭据，沿用root 0700目录、0600归档/回执与完整耐久读回；对外结果只返回摘要。

原文件scope和两项内存捕获结构供既有只读源采集保留；完整保存流程改用pre-install-files-and-host-observations，第三项仅为本轮私有原始观察字节。index新增hostObservations的固定member/hash/bytes、preGate=true和completeHostStateCaptured=false；原文件capturedBytes仍只计原件，原件加观察合计受48MiB限制。观察另限128次、单次原2MiB、总8MiB，继续共享原300秒截止、2100成员/56MiB归档及2MiB index预算，不增加执行或权限通道。归档/回执原格式与未知保留规则保持；少观察原件、错摘要、字段或范围不一致均拒绝打包。

这只补齐当前受限预检使用的原始宿主观察，未证明全部Docker可选配置、全部manager属性/vendor文件来源、镜像离线恢复、DB应用凭据真实登录或完整私有历史。completeHostStateCaptured/completePrivateStateCaptured、recoveryReady、snapshotAvailable、readyToInstall/canExecute仍false，不形成第二应用版本权威，不允许覆盖工具或自动恢复业务/旧盘。后续补齐其他历史retention/私有材料范围及停写后准确Lightsail手动快照available核验，再达到RECOVERY_READY；工具安装、永久门禁、旧应用核验交接、Mac薄入口及D4真实隔离验收仍OPEN。

新增15项模型测试，覆盖私有原输出/摘要分离、同锁且门禁前采集、原意图/writers/index/回执绑定、Docker与有效加载属性漂移、只读客户端失败、独立/共享预算、缺失原件/错metadata/扩大权限、坏JSON/重复/非有限值/非规范编码、任意对象与变更命令拒绝、Compose导出与实际环境美元原字节、旧入口不采集；既有22项恢复保存测试更新采集观察点，失败保留/读回断言保留。仅执行静态AST/名字/方法/空白、差异与准确读回核对后，本批15项及更新的既有22项已随两套Release各960项通过CI；真实系统验收仍OPEN。D4须验证新增采集在真实主机上的资源/300秒预算、Compose版本差异及崩溃/重启恢复边界。

无17+Manifest/250/300、九helper/三永久模板、原四材料、依赖包或业务schema变化。三组研究继续暂停、不取消；未执行生产预检、停写、安装、AWS或数据库写操作。

## 2026-10-28 — 最小更新执行器：同锁恢复文件包耐久保存

**2026-10-28 当前进度：D2_RECOVERY_FILE_RETENTION_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3034](https://github.com/sanqin888/sanqinMVP/pull/3034) head `b8083e74be4834c07078c727c3a71f09ee498d93` 经[CI #7756](https://github.com/sanqin888/sanqinMVP/actions/runs/40728921253)全绿（4成功/6范围跳过；Release默认Python与3.10各945、Runtime1080、既有C1回归412），合并dev `04b3e098bdeae866c3dd26ee90c43302bbda1263`，无需CI修复；未执行生产操作。

本批基于[PR #3033](https://github.com/sanqin888/sanqinMVP/pull/3033)合并dev `99237607adf08bb21b1e2f6e9d68f88ce30d59b6` 建立 `feat/runtime-minimal-recovery-retention-20261028`。内部 _retain_installation_recovery 续接同一次原两锁/全部预检：写意图和临时门禁前在内存保留准确原件；本轮门禁加载、writers原件耐久保存及三原ID已知停写后，才允许保存恢复文件。新增严格阶段开关，旧观察/停写入口默认不采集或写恢复文件，无安装/恢复/resume公开CLI。

固定在本轮installation-runs/<installationId>/下独占创建recovery/（root:root 0700），先保存recovery.tar，再保存recovery.json，均root:root 0600、O_EXCL/nofollow/单链接。完整短写处理、文件与父目录fsync、整件读回及打开FD/路径身份核对；保留至少原5GiB余量。目录和文件原先存在、低容量、零写进展、同步未知或替换均阻断，保留空/部分/完整原件，不覆盖、截断、删除或自动重试。原四材料与intent/marker/writers读写白名单保持；只有当前调用栈的owned证明允许准确recovery目录/成员，namespace成功退出要求完整文件对。

归档为有界、确定性、未压缩USTAR：固定原件放在originals/<已审绝对路径去前导根后的层级>，另有准确intent/writers及recovery-index.json；运输header一律0600、uid/gid/mtime=0，原权限/owner/原缺失事实在index中保留。固定路径全集及仅plans/jobs的64hex.json扩展、文件metadata/原字节摘要、48MiB来源预算、2100成员/56MiB归档/2MiB index预算均校验；核准确成员顺序、header/body/零padding与尾部，无链接/PAX/额外成员或路径穿越。不解压到文件系统，不执行包内Python或其他字节。

index绑定准确安装ID、原意图/writers摘要及原采集摘要。回执为严格规范JSON、schemaVersion=1、独立kind=sanq-minimal-executor-recovery-receipt，准确十二字段：installationId、intentSha256、writersSha256、archiveSha256、archiveBytes、captureSha256及schemaVersion/kind、canExecute/recoveryReady/snapshotAvailable/completePrivateStateCaptured四个false；captureSha256还须对应包内index，不能仅靠自洽外部hash。只有归档已知同步/读回后才写回执，回执及成对绑定也须读回。

保存前后再核本次owned记录、冻结原四容器/DB/卷、门禁及既定来源/原Runtime/配置/备份/SQL历史；私有plans/jobs原字节、metadata、目录和原锁须匹配门禁前采集。任意晚期变化或保存未知一律FENCE_UNCONFIRMED，保留真实记录/文件及现有停写状态，不恢复原策略、启动业务或据归档恢复旧盘。SIGKILL/主机掉电及真实性能/资源边界仍由D4验证。

结果仅INSTALLATION_RECOVERY_FILES_RETAINED及摘要，recoveryArchiveDurable=true只指这份已知范围文件包；readyToInstall/hostPreflightComplete/operationSuccessProven/canExecute、recoveryReady和snapshotAvailable仍false。归档和回执明确completePrivateStateCaptured=false，不是完整RECOVERY_READY或续跑票据。完整私有状态/历史材料范围、容器与加载配置原件、停写后准确Lightsail手动快照available核验仍OPEN，不能据本批结果覆盖工具。

新增22项完整组合/真实临时文件模型测试：同锁采集/冻结/写入先后、原停写入口无额外动作、部分归档/回执、实际短写/零写/同步未知/预算/低容量、marker/私有清单/DB漂移、同字节替换、确定性原字节/权限/缺失事实、header/链接/顺序/越界/零padding/截断、严格回执绑定/坏JSON/重复或非有限值、已有对象/权限/链接/非root/旧白名单及无CLI。Docker/systemd/GitHub/根身份为模型；仅Python3.10 AST、名字/方法/空白、差异及准确写回静态核对，上述22项已随本批CI在两套Release各945项中通过；真实系统验收仍OPEN。

下一步补齐恢复材料完整范围与容器/有效加载配置，再绑定停写后准确快照available的操作者核验，完成RECOVERY_READY后才进入逐文件安装。永久门禁、原应用核验/最终交接、Mac薄入口和D4统一真实隔离验收仍OPEN；17+Manifest/250/300、九helper/三永久模板、原两锁/四材料和唯一应用state权威保持。三组研究继续暂停、不取消，无依赖包/业务schema或生产/AWS/数据库写操作。

## 2026-10-28 — 最小更新执行器：安装前恢复原件源采集

**2026-10-28 当前进度：D2_RECOVERY_ORIGINAL_SOURCES_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3033](https://github.com/sanqin888/sanqinMVP/pull/3033) head `0ddcaaeeb3bbd7b483b268d6680450b44576b9f4` 经[CI #7754](https://github.com/sanqin888/sanqinMVP/actions/runs/40719407895)全绿（4成功/6范围跳过；Release默认Python与3.10各923、Runtime1080、既有C1回归412），合并dev `99237607adf08bb21b1e2f6e9d68f88ce30d59b6`，无需CI修复；未执行生产操作。

本批基于[PR #3032](https://github.com/sanqin888/sanqinMVP/pull/3032)合并dev `178ce5b0346f2183b0dc150a5881facc06fc859b` 建立 `feat/runtime-minimal-recovery-sources-20261028`。先补RECOVERY_READY的原件采集层，未把“已有摘要”当完整恢复包，也未接收snapshotAvailable=true之类布尔输入来开放安装。新增三个内部只读函数，无公开CLI、归档写入、安装/续跑或AWS调用。

固定采集旧17+原Manifest、.env/唯一state/C4原字节、两备份unit及三外部备份文件、plans/jobs中既有64hex.json原字节，以及本次retention四份不可变材料。Runtime仍匹配旧封存归档；外部原件经原reader证明与封存源码准确相等后，使用该准确字节与外部元数据，不把单独hash当文件内容。保存九helper/独立bootstrap、三预留drop-in及两Docker完整unit原本不存在的事实。systemd原件reader拒绝任何已有drop-in，临时拒绝模板不会被当作安装前原件；采集必须发生在安装门禁写入前。

公开内部查询自行持原job→plan两锁，进入/退出核维护与未决job，刷新既定来源/工具范围，并对全组原字节、元数据、目录/清单与retention做两次稳定比较。仅返回摘要和元数据；原秘密字节仅在内部内存mapping中使用，不能直接输出/记录该mapping。原有读白名单/四材料、17及旧protected_config_snapshot固定17+5清单均未扩展，不导入九helper或目标Python。

私有plans/jobs目录固定且权限/文件单链接/nofollow严格核对；每目录最多1025项（含原锁），每文件沿MAX_FILE预算、私有内容合计16MiB、全组原件48MiB独立预算（默认与MAX_TOTAL一致）。原锁只记录元数据，不把锁当普通恢复payload复制/重建，保留原inode。任意坏权限、链接、未知成员、超限、清单/同字节换inode/晚期来源变化阻断，保留实际原件，不修复、清理或fsync。该查询不执行Docker/systemd命令、不停写或恢复业务。

仅结果INSTALLATION_RECOVERY_SOURCES_OBSERVED、scope=pre-install-original-files-only；completePrivateStateCaptured/recoveryArchiveDurable/snapshotAvailable/recoveryReady/readyToInstall/canExecute均false、requiresHostRecheck=true。尚未覆盖其余历史retention/安装事务与完整私有状态、当前完整容器/加载配置恢复材料、耐久恢复归档/读回及停写后准确Lightsail手动快照available证明。当前查询不是RECOVERY_READY，也不使已冻结事务可从文件resume。

新增18项临时真实文件模型测试：摘要无秘密/许可恒false、完整固定原字节及元数据、无写入/同步/命令、原两锁/inode、CRLF/$/$$和0400原样、私有plan按数据保存、unit原件与缺失事实、已有临时门禁拒绝、旧字节/helper冲突、同字节替换/晚期清单/来源、未知/软硬链接/坏mode/预算、原四材料及无CLI。根锚点/账户/GitHub为模型；仅Python3.10 AST、名字/方法/空白、全部原定义不变、差异及准确读回静态核对，上述18项已随本批CI在两套Release各923项中通过；真实系统验收仍OPEN。

下一步将原件采集接到同一次owned安装观察中，在写临时门禁前保留准确原件，再于已停写阶段完成私有恢复归档create-only耐久保存/读回及完整范围核对；随后绑定操作者对停写后准确Lightsail手动快照available的核验，不能自动调用AWS或据本批摘要覆盖工具。逐文件安装/永久门禁/原应用核验交接、Mac薄入口及D4统一真实隔离验收仍OPEN。三组研究继续暂停、不取消，无依赖包/业务schema或生产操作。

## 2026-10-28 — 最小更新执行器：原保存ID受限停写

**2026-10-28 当前进度：D2_SAVED_WRITER_FREEZE_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3032](https://github.com/sanqin888/sanqinMVP/pull/3032) head `986fcc8dfdb7e4d4145998efc735366ee2f099f3` 经[CI #7752](https://github.com/sanqin888/sanqinMVP/actions/runs/40711925725)全绿（4成功/6范围跳过；Release默认Python与3.10各905、Runtime1080、既有C1回归412），合并dev `178ce5b0346f2183b0dc150a5881facc06fc859b`，无需CI修复；未执行生产操作。

本批基于[PR #3031](https://github.com/sanqin888/sanqinMVP/pull/3031)合并dev `c1bbff97a3c28a867ec16ca29afa2053ba2f71cd`，分支 `feat/runtime-minimal-freeze-writers-20261028`。内部 _freeze_installation_writers 续接同一次原两锁、全部新鲜观察、新意图/marker、准确临时门禁加载及writers.json耐久保存；严格阶段开关，不从已存在记录resume，不新增CLI或完成记录格式。

首次变更前核准确owned记录/marker/目录、门禁、原四容器及宿主恢复基线。先对三原ID逐一update --restart=no，再按Web→worker→API逐个stop --time 30；DB不进入动作集合。每步前后核记录与有效门禁、项目准确四ID、Docker身份/live-restore=false/swarm inactive、DB volume摘要、原image/config/mount/startedAt/restartCount、受限HostConfig与本阶段准确策略/运行状态。只容许预期策略变化及已处理原对象退出，不推断新ID或按角色名停止容器。

阶段前后另核来源/四材料、旧Runtime与.env/唯一state/C4、宿主目录/备份实物、外部备份原件、systemd基线及DB本地只读身份/迁移历史。停写后不再要求已停止API执行Node库存或HTTP就绪；沿用停止前准确Git/镜像/库存证明并核DB历史未变。尚未扩大为完整Docker可选配置证明、真实DB应用凭据登录或停写后的恢复实物/快照available验收。

专用客户端只接受绑定原意图的准确writers字节及三角色/两动作，交给共同有界客户端时仍核准确argv；默认只读和共同客户端调用仍拒绝update/stop。单次普通命令30秒，只有此受限stop客户端45秒以容纳30秒Docker宽限；继续共享原300秒截止、两流合计2MiB、最小环境、准确原ID输出及仅结束自身CLI组。超时/输出未知不推断动作已撤销，无任意shell、名称、远端或DB变更入口。

首次变更前失败不发停写/围堵命令；变更已开始后的任意异常，只在剩余有界预算内尽力对原保存三ID禁重启并停止，随后一律FENCE_UNCONFIRMED，不因围堵看似成功改报成功。保留原意图、marker、writers及实际门禁/策略/退出状态；不恢复策略、启动业务、清理记录或重放安装。SIGKILL/主机掉电不会执行Python异常围堵，须依耐久原件和实际状态人工审阅，真实中断验收仍属D4。

仅同锁编排及最终复核成功返回INSTALLATION_WRITERS_FROZEN，内存结果writersFrozen=true；原writers.json不可变，仍canExecute=false。readyToInstall/hostPreflightComplete/operationSuccessProven/canExecute仍false，recoveryReady=false、requiresHostRecheck=true。无额外FROZEN文件或续跑票据，现有意图和原对象记录保留未知边界。

新增22项组合/真实pipe客户端模型测试：准确序列及DB/原件不变、旧入口默认不动作、首次及临近首动作前漂移、update/stop响应丢失、围堵全失败/不重放、marker/记录/门禁/额外容器/DB重启/策略/运行状态/lifetime/mount漂移、停写后DB历史/backup原件变化、完整阶段与无CLI、专用客户端精确参数/默认拒绝、45/30秒边界及坏证明/输出/预算。文件/锁/pipe为真实临时对象，Docker/systemd/GitHub/根锚点为模型；仅Python3.10 AST、全局名字/方法/空白、过程IO主体等价、差异及准确读回静态核对，上述22项已随本批CI在两套Release各905项中通过；真实系统验收仍OPEN。

下一步核此阶段CI及未知边界，接停写后手动快照available/完整旧工具恢复实物的RECOVERY_READY。逐文件工具安装、永久门禁、原应用核验/最终交接、Mac薄入口和D4统一真实隔离验收仍OPEN。17+Manifest/250/300、原四材料、九helper/三永久模板、依赖包、业务schema及唯一应用state权威保持；三组研究继续暂停、不取消，未执行生产预检、停写、安装、AWS或数据库写操作。

## 2026-10-28 — 最小更新执行器：原容器与重启策略耐久保存

**2026-10-28 当前进度：D2_SAVED_WRITERS_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3031](https://github.com/sanqin888/sanqinMVP/pull/3031) head `afb7a2132318aee338fa0fb6b5a5872f42b6bc49` 经[CI #7750](https://github.com/sanqin888/sanqinMVP/actions/runs/40709444423)全绿（4成功/6范围跳过；Release默认Python与3.10各883、Runtime1080、既有C1回归412），合并dev `c1bbff97a3c28a867ec16ca29afa2053ba2f71cd`，无需CI修复；未执行生产操作。

本批从[PR #3030](https://github.com/sanqin888/sanqinMVP/pull/3030)已合并dev `39d61bda9474b9e305bd11800f8563e323ca1313` 建立 `feat/runtime-minimal-saved-writers-20261028`，续接本轮原两锁、全套新鲜观察、独占意图/marker及临时门禁有效加载。仅内部 _save_installation_writers 开启保存阶段；原意图/门禁入口默认不写新记录，无公开CLI或旧事务resume。

在本轮私有事务目录create-only耐久保存writers.json，仍为root:root 0600、nofollow/单链接、16KiB预算、完整短写、文件/目录fsync及FD/路径身份读回。准确九字段：schemaVersion=1、独立kind=sanq-minimal-executor-saved-writers、installationId、intentSha256、applicationSha、dockerEngineSha256、containers、createdAt、canExecute=false。containers准确四角色：三原写入者与db观察锚点，保存完整64位ID、imageId、原restartPolicy、restartCount、startedAt及配置/挂载摘要；原策略不被改成no。严格拒绝重复/未知字段、错时间/JSON、短ID、重ID、API/worker镜像不一致及坏策略。

记录绑定原意图准确字节。本次owned记录证明只在耐久写入/读回成功后留在当前调用栈中；namespace和退出检查只接纳该准确原件，不从已有文件导入许可。保存后重新核来源、四材料、完整宿主稳定观察、准确marker/事务/原目录及有效门禁；记录未知、晚期漂移或残件均阻断并保留，不清理、覆盖、补写或自动重放。原PRIVATE_FILES四材料、普通namespace任意事务阻断及应用唯一state权威保持。

新增纯argv构造器只允许三保存角色的固定update --restart=no及stop --time 30，目标只能取绑定记录里的完整原ID；db/任意名称/动作拒绝。该函数不执行命令，原只读及共同有界客户端仍拒绝这两类变更，尚未接入停写执行器。结果仅INSTALLATION_WRITERS_SAVED及摘要，writersFrozen/canExecute/readyToInstall/hostPreflightComplete/operationSuccessProven仍false、requiresHostRecheck=true，不是停写完成或恢复就绪证明。

新增18项完整组合/格式模型测试，覆盖原两锁/门禁先后、四原对象与策略不变、旧入口默认不写、第二次拒绝、部分写入/同步未知、保存后主机/意图/未知成员漂移、原意图摘要绑定、严格格式/角色/ID/镜像/生命周期/策略、权限及链接、纯argv限制/既有客户端拒绝、准确owned原件证明和严格开关/无CLI。临时文件/锁为真实对象，GitHub/Docker/manager/根锚点为模型；仅Python3.10 AST、名字/方法/空白及差异/准确读回静态核对，上述18项已随本批CI在两套Release各883项中通过；真实系统验收仍OPEN。

下一步将已保存原件接到受限disable-restart→stop编排，逐次新鲜身份与门禁复核、故障只尽力处理保存ID并保持FENCE_UNCONFIRMED；真实停写仍OPEN。停写后手动快照available/完整旧工具恢复实物、逐文件安装/永久门禁/旧应用核验交接、Mac薄入口与D4统一真实隔离验收仍OPEN。无17+Manifest/250/300、九helper/三永久模板、依赖包或业务schema变化；三组研究继续暂停、不取消，未执行生产/数据库写操作。

## 2026-10-28 — 最小更新执行器：原两锁内临时门禁加载

**2026-10-28 当前进度：D2_OWNED_GATE_LOAD_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3030](https://github.com/sanqin888/sanqinMVP/pull/3030) 最终head `7787d5f5618e06a3172c6d068e57e55b228b5fbd` 经[CI #7748](https://github.com/sanqin888/sanqinMVP/actions/runs/40702042325)全绿（4成功/6范围跳过；Release默认Python与3.10各865、Runtime1080、既有C1回归412），合并dev `39d61bda9474b9e305bd11800f8563e323ca1313`。首轮两个坏marker模型暴露的底层JSON异常已统一为脱敏安装合同错误，证据保持/阻断规则不变；未执行生产操作。

基于已合并的[PR #3029](https://github.com/sanqin888/sanqinMVP/pull/3029) dev `38be9adcb89c800442badac54118a2c89b89b59e` 建立 `feat/runtime-minimal-owned-gate-load-20261028`。内部 _load_installation_deny_gates 只续接本轮完整新鲜观察和新写意图/marker，保持原job→plan两锁；无公开CLI、无旧事务resume。写门禁、reload及最终返回前核准确意图/marker原字节、唯一事务/维护全集、原目录身份和未决job；不接受导出dict或操作者布尔许可替代本轮观察。

三门禁create-only写入、耐久读回后，只允许固定 /usr/bin/systemctl --system daemon-reload。复用原有界进程IO主体，原只读Docker/systemd/runtime入口仍拒绝reload；共享300秒截止、单次30秒、两流合计2MiB及最小环境，失败只终止自身客户端组，不能推断manager动作被撤销。未知/非零/编码或输出异常保留意图、marker及全部门禁原件，无清理、重放或恢复业务。

reload后核准确文件/有效加载属性并重做来源、四材料与完整现场观察。systemd对比只扣除本轮准确三DropInPaths和两个拒绝pre命令，其他有效属性摘要须与原基线一致；旧backup unit原件完整身份、systemd根稳定身份及所有非本轮override目录仍核对。原只读systemd/未决job验证主体提取复用，默认行为保持。实际三门禁证明单独返回，不将对比投影冒充旧配置仍有效。

仅上述内部阶段全部通过时，installationIntent.startupFenceConfirmed=true、outcome=TEMPORARY_DENY_GATES_LOADED；writersFrozen、canExecute、readyToInstall、hostPreflightComplete、operationSuccessProven仍false，requiresHostRecheck=true。尚无安装CLI或完整安装/完成交接；本批不停止容器/daemon、不改restart策略、不覆盖Runtime或写DB。准确原ID停写前仍须保存恢复依据并新鲜复核，不能由加载摘要单独授权后续动作。

新增20项组合/真实pipe客户端模型测试，覆盖原两锁跨度、默认意图路径、部分写入、reload未知/不重放、marker/job/namespace晚变、未加载、Docker漂移、非本轮有效属性/override/backup原件变化、同字节门禁替换、原空目录身份、固定命令/环境及输出预算/超时/非root。文件/锁/pipe为真实临时对象，GitHub/Docker/manager/根锚点等为模型。仅Python3.10 AST、全局名字/方法/空白审阅、三段提取主体AST等价及准确写回核对，首轮CI #7747（head 92dabe00b059bf1ed281e9e19dd79a656348b8e8）执行865项，两个坏marker故障模型因底层JSONDecodeError未统一为安装合同错误而报错；已仅修正该错误边界，继续保留原件并阻断。修复后最终head已通过CI #7748，两套Release各865项；真实系统验收仍OPEN。

下一步接准确保存三原ID/镜像/策略、耐久恢复依据与受限停写；停写后手动快照available/完整旧工具恢复实物、逐文件安装/永久门禁/旧应用核验交接、Mac薄入口与D4统一真实隔离验收仍OPEN。17+Manifest/250/300、四材料、三永久模板、九helper及唯一应用state保持，无依赖包/业务schema变化；三组研究继续暂停、不取消，未执行现场或生产操作。

## 2026-10-28 — 最小更新执行器：临时拒绝门禁原语

**2026-10-28 当前进度：D2_TEMPORARY_GATE_PRIMITIVES_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

意图流程[PR #3028](https://github.com/sanqin888/sanqinMVP/pull/3028) head `11f3017e136dd40681f5aaa6b0213fa03e4c13a5` 经[CI #7743](https://github.com/sanqin888/sanqinMVP/actions/runs/40694971907)全绿（4成功/6范围跳过；Release默认Python与3.10各835、Runtime1080、既有C1回归412），合并dev `07b2275d59a2161c53adb5bdd0054c05d78b5662`，无CI修复；未执行生产操作。

本批[PR #3029](https://github.com/sanqin888/sanqinMVP/pull/3029) head `19bb93b4a56bf206fe3333cf7c28145903f8497d` 经[CI #7745](https://github.com/sanqin888/sanqinMVP/actions/runs/40699162830)全绿（4成功/6范围跳过；Release默认Python与3.10各845、Runtime1080、既有C1回归412），合并dev `38be9adcb89c800442badac54118a2c89b89b59e`，无CI修复；未执行生产操作。

本批从该dev建立feat/runtime-minimal-temporary-gates-20261028，新增三个固定临时拒绝模板与底层文件写入/有效加载属性校验原语。只占用/etc/systemd/system/<unit>.d/80-sanq-maintenance.conf：docker.service ExecStartPre=/usr/bin/false，sanq-backup.service ExecStartPre=+/usr/bin/false，docker.socket固定ConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json。不依赖尚未安装的目标Python，不导入九helper。

目录nofollow/root:root 0755，已有目录必须真实可信且为空；文件O_EXCL/nofollow/root:root 0644 create-only、完整短写处理、文件和目录fsync、准确字节/完整身份读回。仅对本次新建FD设定既定mode以兼容umask077，不修复已有对象；未知或已有成员、链接、权限不符阻断，任意失败保留已写文件/目录，不覆盖、删除或自动重试。新读原语不扩展原17成员清单或通用读取白名单。

独立加载核对先读三文件、读取原白名单固定systemctl show属性，再读文件比较。须loaded、NeedDaemonReload=no、唯一准确DropInPaths和既定vendor/backup FragmentPath；服务pre命令唯一/usr/bin/false且ignore_errors=no，socket仅触发docker.service。只返回文件/属性摘要与denyGatePropertiesObserved=true；startupFenceConfirmed/canExecute仍false。固定socket条件模板与loaded路径被核对，但本原语尚未核本次安装marker/意图和全部宿主上下文，不能单独证明围栏。

这批写原语还没有主机编排或公开CLI调用，调用方必须另行在原两锁内确认准确安装意图/marker及全部原基线；本批不执行daemon-reload、不调用stop/start/restart、不改容器策略，也未把文件写入接到意图准备入口。下一批才接明确受限的reload、原锁内准确marker绑定、有效加载复核与失败保持，全部已知成功之前不能停业务或覆盖工具。

新增10项临时目录/manager模型测试：准确三文件/加载摘要与许可恒false、umask077、本次文件不覆盖、未知成员/坏mode/目录链接、同步失败、零写进展残件、未加载/需reload/额外drop-in/错fragment、忽略失败/多命令/错socket目标、属性观察中原件变化、非root/未知unit/无CLI。真实文件与fsync，root/系统根和manager为模型；仅Python3.10 AST、全局名字/方法/空白、既有函数定义不变及准确读回，上述10项已随本批CI在两套Release各845项中通过；真实系统验收仍OPEN。

三永久drop-in合同保持，临时模板不得通过永久_installed_gate。原17+Manifest/250/300、两锁/四材料、唯一应用state保持；无新依赖包/持久化记录格式/业务schema/公开CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner。准确保存ID停写、停写后快照available/恢复实物、逐文件安装/交接、Mac入口与统一真实隔离验收仍OPEN。三组研究继续暂停、不取消；未执行生产预检或安装。

## 2026-10-28 — 最小更新执行器：原两锁内意图与marker写入

**2026-10-28 当前进度：D2_INSTALL_INTENT_FLOW_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

事务目录批[PR #3027](https://github.com/sanqin888/sanqinMVP/pull/3027) head `16a4a2628695219348522bcd47cee24cf84c7d49` 经[CI #7741](https://github.com/sanqin888/sanqinMVP/actions/runs/40693801613)全绿（4成功/6范围跳过；Release默认Python与3.10各825、Runtime1080、既有C1回归412），合并dev `51d8e345f27d3bf9cbd8b0f0488b1fa772cc811d`，无CI修复；未执行生产操作。

本批从该dev建立feat/runtime-minimal-intent-flow-20261028，新增内部_record_installation_intent续接完整主机观察。必须启用全部原预检阶段且保持原job→plan两锁，不从文件导入观察dict，不以caller授权布尔值替代观察；普通只读入口默认不写记录。记录入口无公开CLI，仅源码/模型中的内部安装准备阶段，完整安装就绪及实际执行仍待后续门禁。

完整双读通过后，固定state重开FD必须与原锁目录身份一致，显式建立/核对空installation-runs根；本次ID由内部32随机字节生成，不由调用者指定。exclusive建立0700事务目录、同步及读回；自行重做原来源、现场稳定结果、四材料及维护空闲复核后，构造绑定retention/准确新旧Runtime来源与本轮观察摘要的无执行权意图，create-only耐久保存。意图已知耐久后再做同一组新鲜复核，核准确原意图/空维护，再create-only写独立kind marker；两原件摘要互绑、原目录身份和维护全集均读回，未知结果保留，不删除、重试、补造或续跑。

namespace原查询默认仍拒绝任何条目；仅本次新建的owned事务分支在退出时允许准确一个ID目录及其中唯一intent.json，并严格重读原件，其他事务/成员仍阻断。marker写入成功后不再调用要求maintenance为空的普通材料检查，而是核唯一active.json与意图互绑；同锁流程结束前再次读marker，保留原锁inode。

结果为INSTALLATION_INTENT_RECORDED及摘要，canExecute/readyToInstall/hostPreflightComplete/operationSuccessProven仍false，startupFenceConfirmed/writersFrozen=false、requiresHostRecheck=true。意图与marker落盘不证明临时拒绝门禁有效，更不证明已停写；尚不安装drop-in、不reload/停启服务、不改restart策略或工具/state/DB。源码具备这个内部写阶段不代表本次已在生产执行，也不授权从其他入口绕过未决事务。

新增10项完整组合模型测试：同锁新鲜观察后准确成对记录/许可恒false、第二次尝试保留原件、两次写持原两锁、部分意图不写marker、部分marker保留耐久意图、意图后AutoRemove漂移阻断marker、晚期维护保留、namespace同步失败保留、未知事务阻断及旧只读入口/严格前置/无CLI。临时文件/目录/锁为真实对象，外部Docker/SQL/Node/HTTP/GitHub/根身份等仍为模型；仅Python3.10 AST、静态名字/方法/空白、改动定义范围与写回检查，项目测试待CI，不把825当本批结果。

下一步核该内部写流程的CI与剩余故障边界，再接三固定临时拒绝门禁的受限安装/有效加载核对。真实解释器/Compose/DB连接、美元往返、完整耗时/限流与系统中断验收仍OPEN；准确保存ID停写、手动快照available/恢复实物、逐文件工具安装/交接、Mac薄入口仍按原D2–D4继续。无新依赖包/九helper导入/公开CLI/业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、原两锁/四材料及三永久门禁保持。三组研究继续暂停、不取消；未执行生产预检或安装。

## 2026-10-28 — 最小更新执行器：固定安装事务namespace

**2026-10-28 当前进度：D2_INSTALLATION_NAMESPACE_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

意图原语[PR #3026](https://github.com/sanqin888/sanqinMVP/pull/3026) head `261d4f2305d6d89f8e45c982baf323ea98a5cbf7` 经[CI #7739](https://github.com/sanqin888/sanqinMVP/actions/runs/40689597233)全绿（4成功/6范围跳过；Release默认Python与3.10各815、Runtime1080、既有C1回归412），合并dev `db4e29d6b55fd5905c00b46d81fcf3dded042e9f`，无CI修复；未执行生产操作。

本批从该dev建立feat/runtime-minimal-installation-namespace-20261028，新增内部固定installation-runs目录检查/创建。入口自行获取原job→plan两锁，进入前后核原未决job/维护空闲，再经固定可信锚点打开deploy-state；不接受用户路径或已导出的观察dict。默认只读查询缺失目录，严格bool create才允许在原目录父FD下mkdir 0700；创建前核5GiB加记录预算，目录与父目录fsync、读前后owner/group/mode与FD/路径身份核对。已有坏权限、链接、替换或同步未知不修复/删除。

在原锁内两次扫描事务目录，有界最多1024项；任意条目（准确hex名空目录也包括在内）都视为未决/未知而阻断，不解析成成功或自动补意图。目录缺失查询中晚出现、原目录被替换、晚期条目或维护残件都阻断并保留。只有空的固定namespace允许观察成功，结果仍canExecute/readyToInstall/operationSuccessProven=false、requiresHostRecheck=true；namespaceCreated不等于安装事务或门禁成功。

本批仅创建/核对事务根目录，不创建每次installationId目录、不写intent/marker、不开放CLI，也未将新namespace扫描接到既有所有材料/主机入口；不能声称已阻断所有其他操作。意图→marker仍须在后续固定写入编排中取得同锁新鲜主机观察并明确就绪条件，不能从本批namespace结果推导写入许可。保留原记录原语/全部既有函数定义及PRIVATE_FILES四项。

新增10项临时目录/原OS锁模型测试：缺失查询无写同步、新建与已有空目录权限/inode及许可恒false、坏mode/链接不修、任意事务残件保留、原两锁跨度/inode保持、晚期条目、目录fsync失败保留、低容量与晚期维护、目录替换、旧四材料不变/严格开关/无CLI。固定锚点/root/容量为模型；仅Python3.10 AST、静态名字/方法/空白、既有函数不变和准确读回，项目测试待CI，不把815当本批结果。

下一步继续每次事务目录与未决事务门禁的接入，再完成原两锁下新鲜预检→意图耐久→marker耐久编排及故障测试，之后接临时拒绝门禁。当前完整安装就绪、恢复实物、准确原ID停写/停写后快照available、逐文件安装/完成交接、Mac入口与统一真实隔离验收仍OPEN。无新依赖包/九helper导入/业务schema/公开CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、原两锁/四材料与三永久门禁保持。三组研究继续暂停、不取消；未执行生产预检或安装。

## 2026-10-28 — 最小更新执行器：意图记录格式与耐久原语

**2026-10-28 当前进度：D2_INTENT_RECORD_PRIMITIVES_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

安装意图合同[PR #3025](https://github.com/sanqin888/sanqinMVP/pull/3025) head `810a7768e81e840e0441a133f9f8073c9496525a` 经[CI #7737](https://github.com/sanqin888/sanqinMVP/actions/runs/40687640526)成功（scope成功，其余9项范围跳过，未运行项目测试），合并dev `c3cb1f8a91de32f39be4159306f364793b72176d`。

本批从该dev建立feat/runtime-minimal-intent-records-20261028，实现合同的格式与底层耐久写入原语。意图准确九字段、marker准确四字段，均为sanq-minimal-executor-install-intent独立kind/严格整数schemaVersion=1、准确installationId/摘要/来源SHA，意图canExecute严格false，createdAt为有界精度UTC Z时间。拒绝未知/重复字段、非有限JSON、bool冒充整数、非规范原字节和超16KiB记录；marker摘要必须绑定原意图规范字节。

新增仅内部使用的FD读写原语，只允许intent.json/active.json，不扩PRIVATE_FILES或原四材料格式。写要求root及已核0700私有目录FD，O_EXCL/nofollow/0600 create-only；完整处理短写，文件fsync、目录fsync、准确读回并保持打开FD核原路径身份/元数据，失败只关闭FD，保留空/部分/完整残件，不unlink、截断、重放或清marker。读要求普通单链接0600、大小/FD与路径完整身份稳定和严格字节格式。

这只是记录原语：不创建installation-runs namespace，不核原两锁或新鲜主机事实，不保证marker之前已有耐久intent，也不把调用者数据当安装权限。当前没有任何公开CLI/主机编排调用这些写原语。后续必须用固定路径编排在原两锁内自行取得新鲜观察、完成意图耐久后才允许marker写入；不能直接将此底层函数当安装入口。整体hostPreflightComplete/readyToInstall/canExecute等原许可保持false，不写应用state或受保护工具。

新增12项临时目录/FD模型测试：规范格式与相互绑定、字段/类型/身份/摘要/UTC边界、重复/非规范/超限/非有限JSON、错意图摘要、create-only/模式/inode、短写与零进展、部分写异常、文件或目录fsync失败、读回失败/晚期权限变化、软硬链接/FIFO/坏权限、非root/坏目录/任意名称拒绝及无新CLI/四材料不变。真实临时文件和fsync，root身份/属主为模型；未运行项目测试，仅Python3.10 AST、静态名字/方法钩子/空白、原所有函数定义不变和写回核对，项目结果待CI。

下一批接固定installation-runs目录、未决事务扫描与原两锁下的意图→marker耐久编排，补目录创建/锁竞争/新鲜来源晚变及半记录保持；之后接临时拒绝门禁。该后续编排与主机执行就绪仍OPEN，不能据本批写原语成功宣称安装围栏已生效。无新依赖包/九helper导入/公开CLI/业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、原两锁/四材料和三永久门禁保持。三组研究继续暂停、不取消；未执行生产预检、安装、备份或数据库操作。

## 2026-10-27 — 最小更新执行器：安装意图记录合同

**2026-10-28 当前进度：D2_INSTALL_INTENT_CONTRACT_MERGED_DEV / DOCUMENTATION_ONLY / NOT_INSTALLED。**

2026-10-28 续接：PR #3024已合并；补齐中断时未同步的运行手册并核对六份文档。首次安装不假定guard或socket条件已部署/加载，marker存在本身不证明已阻断启动；只有临时拒绝门禁确认有效加载后才能进入停写。该合同批已通过PR #3025合并dev。

预检C组合批[PR #3024](https://github.com/sanqin888/sanqinMVP/pull/3024) head `cb1e1c38d972ed61d255333cc6191d7fb6f9ed88` 经[CI #7735](https://github.com/sanqin888/sanqinMVP/actions/runs/40595181934)全绿（4成功/6范围跳过；Release默认Python与3.10各803、Runtime1080、既有C1回归412），合并dev `8722324be77795ea5f9d0acbc4935b99cf68c0cd`，无CI修复。原批LOCAL/未运行描述仅为当时审阅状态；未执行现场预检或安装。

本批基于该dev建立docs/runtime-minimal-install-intent-contract-20261027，完成下一阶段安装意图记录合同。A/B/组合C的模型与CI证据已齐，但现场解释器/Node/Compose/DB连接、真实美元往返、完整运行耗时/限流、恢复实物与D4系统中断验证仍OPEN；hostPreflightComplete/readyToInstall不翻转。可继续实现安装执行器源码及故障模型，不等于允许生产写入。

选择独立/opt/sanq/deploy-state/installation-runs/<installationId>/保存安装事务记录，不扩展installations/<retentionId>/原四份不可变材料。意图先以create-only耐久保存并读回，再以独立kind的maintenance/active.json绑定准确意图摘要；临时拒绝门禁有效加载前不停止业务、不改策略、不覆盖工具。完整字段、顺序和中断规则见交付合同新节。

本批只更新六份文档，无代码/测试/依赖/CLI/持久化实现变化；新namespace/意图格式均为待实现合同。下一批实现意图与marker的严格格式、受限耐久写入及每个中断边界的模型，随后接临时拒绝门禁。调用者不能用导出的观察dict或布尔值授权写入，既有假值不被改成真值来绕过就绪。恢复实物、准确保存ID停写、停写后手动快照available、逐文件安装/完成交接、Mac薄入口及统一真实隔离验收仍OPEN。

无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner或项目测试；固定17+Manifest/250/300、九helper、原私有四文件/两锁及三永久门禁保持，三组研究继续暂停、不取消。仅作源码/合同审阅，未执行生产操作。

## 2026-10-27 — 最小更新执行器：预检C组合回归

**2026-10-27 当前进度：D2_COMBINED_PREFLIGHT_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

预检B[PR #3023](https://github.com/sanqin888/sanqinMVP/pull/3023) head `802e6610927b042917ebf80f96afd625a2a2c403` 经[CI #7733](https://github.com/sanqin888/sanqinMVP/actions/runs/40592294258)全绿（4成功/6范围跳过；Release默认Python与3.10各795、Runtime1080、既有C1回归412），合并dev `741448bc9c039ed553c67e5b7e68d793a83b5f9e`，无CI修复；未执行现场预检或安装。

本批从该dev建立test/runtime-minimal-combined-preflight-20261027，开始C组合回归与合同收口。新增8项组合测试，沿已有D1材料/root文件模型建立完整原件、配置、Docker/systemd/文件/资源、环境网络、迁移库存/Git/历史、有效端口health和外部备份观察。临时文件/目录/锁为真实对象；外部Docker/manager/SQL/Node/HTTP/GitHub/账户和锚点为模型。迁移阶段本身不再整体替换，接固定库存命令的模型结果与Git原始blob模型并执行实际Python校验。

覆盖全阶段成功仍无安装许可/无写同步、实际命令接线持原两锁、全局两遍共4次库存模型读取、外部同字节替换、AutoRemove晚变、迁移中历史改变、晚期维护marker保留、最终来源复核失败及严格开关。只审阅Python3.10 AST/静态名字/重复方法与写回，不运行项目测试。新增测试尚待CI，不把795计成本批结果。本批无生产Python/命令/格式/许可变化；A/B源码虽已合并，C尚未通过自身CI，不宣称闭环已完成。

预检责任核对：17/Manifest与材料来源、原配置和唯一发布state、容器/挂载/网络/环境、systemd有效配置、备份gzip与资源、固定HTTP就绪、迁移Git/历史及外部备份原件均已有只读源码路径和分项模型；本批补组合关系。applicationConfigurationObserved/hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute等仍false。databaseLoginVerified=false表示未独立以应用凭据登录，fullApplicationConfigurationProven=false表示未证明全部可选配置；不能只凭局部字段或模型成功消除这些边界。现场系统组合、真实Compose美元往返、DB连接行为、运行时权限及恢复材料均待统一隔离验收，仍不允许现场写入。

性能/范围核对：源码结构每次完整观察含两轮迁移阶段、每阶段内部两遍，因此库存命令共4次，Git原件也随各遍重读；实际HTTP请求总量取决于库存条目与原D1来源请求，未测得完整生产墙钟/限流结果。命令共享300s预算不等于整个网络/文件预检有硬300s上限。不虚报性能验证，也不为此恢复暂停的来源/可信时间研究；如后续优化，仅考虑本次观察内不可变准确对象，不缓存最新CI/主机成功资格。

下一步先由CI验证这批组合测试并根据日志修正，再据最终源码完成C的未证明项清单和安装意图记录合同；不得直接把本批模型当readyToInstall。新安装kind/journal、临时拒绝门禁、停写/手动快照available/完整恢复实物、逐文件安装/交接、Mac薄入口和D4统一真实隔离验收仍OPEN。无新依赖包/九helper导入/持久化格式/CLI/业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、私有四文件和三永久门禁保持。三组研究继续暂停、不取消。

## 2026-10-27 — 最小更新执行器：预检B外部备份实物绑定

**2026-10-27 当前进度：D2_EXTERNAL_BACKUP_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

预检A[PR #3022](https://github.com/sanqin888/sanqinMVP/pull/3022) head `d7166403fd668b0183fb2b83d3399f8660c2ebe2` 经[CI #7731](https://github.com/sanqin888/sanqinMVP/actions/runs/40591551676)全绿（4成功/6范围跳过；Release默认Python与3.10各787、Runtime1080、既有C1回归412），合并dev `2a4f70b62ca7441b137e9adab953e2cc70a69b88`，无CI修复。原批LOCAL/未运行说明为当时状态；仍未执行生产预检或安装。

本批从该dev建立feat/runtime-minimal-external-backup-20261027，实现审计B。固定读取/home/ubuntu/backup-db.sh、/usr/local/sbin/sanq-backup-protected-nginx及/etc/sudoers.d/sanq-backup，原字节分别绑定本轮已核旧封存Runtime的ops/backup对应成员，不扩大原17清单。逐层目录FD nofollow，普通root父目录及ubuntu用户目录按各自owner/group、无组/其他写和特殊权限核对，进入/退出核路径与FD稳定身份；不把ubuntu主脚本改成root所有。

文件nofollow/非阻塞打开，必须普通单链接、非空且≤原MAX_FILE，主脚本ubuntu:ubuntu 0750、helper root:root 0755、sudoers root:root 0440，沿既有安装合同检查而非修改。完整有界读取后核FD/原路径的dev/inode/大小/mtime/ctime/owner/gid/mode/link一致，再逐字比较封存源；相同字节换inode也拒绝。只返回固定路径、源成员、SHA256/大小/身份与目录身份，不输出脚本正文。

新增严格bool include_external_backup，要求全部前置直到effective_configuration；内部_observe_installed_external_backup在原两锁/全局双读中核三文件，旧接口不触发。仅externalBackupExecutablesObserved=true及摘要，backupExecutionVerified/restoreProven=false，整体hostPreflightComplete/applicationConfigurationObserved/readyToInstall/canExecute等继续false。未执行脚本、sudo、rclone、备份或恢复，不自动修权限/装文件/清残件；有界文件读取不扩称独立硬时间上限或现场备份成功。

新增8项临时真实文件模型测试：三原件准确摘要/无执行写入、逐文件权限与字节、不存在/软硬链接/FIFO、父目录写权限/链接、账户身份、读取中同字节替换、空/大小预算及前置开关/无CLI。root锚点与账户为模型，未运行项目测试；仅Python3.10 AST、全局名字/方法/空白审阅和准确写回核对，不把787当本批通过。完整阶段组合与真实系统验证留C/D4。

A已合并、B源码已通过PR #3023合并dev；下一步C做组合故障回归、逐项核预检合同并明确未证明项，不直接翻转整体完成许可。之后按既定顺序进入安装意图/临时拒绝门禁及恢复实物/停写快照、逐文件安装/交接、Mac入口和统一真实隔离验收。无新依赖包/九helper导入/持久化格式/公开CLI或业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、私有四文件及三永久门禁保持。三组研究继续暂停、不取消；未执行生产操作。

## 2026-10-27 — 最小更新执行器：预检A有效容器配置

**2026-10-27 当前进度：D2_EFFECTIVE_CONFIGURATION_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

审计文档[PR #3021](https://github.com/sanqin888/sanqinMVP/pull/3021) head `8d6ea058fcfc525b832845de105c7aec645a462c` 经[CI #7729](https://github.com/sanqin888/sanqinMVP/actions/runs/40590497085)成功（仅scope成功，其余9项范围跳过，未运行项目测试），合并dev `1fa95bbc7253a3a7ca0278207b410e97e13b8898`。

本批从该dev建立feat/runtime-minimal-effective-configuration-20261027，实现审计A的端口/healthcheck/AutoRemove只读核对。固定角色只允许127.0.0.1上的同号TCP端口：API4000/5555、worker4001、web3000、DB5432；Compose ports、HostConfig.PortBindings与NetworkSettings.Ports的实际发布项逐项一致，拒绝缺多/重复/公开地址/UDP或错端口。镜像暴露但未发布的Ports=null不当成对外端口，不生成端口修复。

保存完整容器ID/image/config摘要重新核对，AutoRemove/PublishAllPorts/Privileged须严格false。healthcheck从已观察image默认值合并Compose准确覆盖，核Test/Interval/Timeout/Retries/StartPeriod/StartInterval及类型；禁止disable/NONE/未知字段，显式时长只接受整数ns/us/ms/s/m/h，非支持格式阻断不猜测。Compose导出test中的美元按原规则只解码一次，实际/image默认不改；不执行healthcheck命令或改容器。

新严格bool include_effective_configuration要求此前直到migrations全部启用，内部_observe_installed_effective_configuration在原两锁/同截止/全局双读内调用新阶段；旧入口默认不调用。结果仅effectiveContainerConfigurationObserved=true与各角色端口/health摘要及保存ID，applicationConfigurationObserved/hostPreflightComplete/readyToInstall/canExecute等整体许可继续false。当前明确依赖的HostConfig检查为原restart策略、实际挂载/网络与解析覆盖、Privileged，加本批AutoRemove/PublishAllPorts/PortBindings；并不声称已比较所有Docker可选HostConfig字段或证明全应用配置。

新增8项离线Docker模型测试：合法摘要/输入不变、自动删除/自动发布/提权、缺多/公开/不一致实际端口、Compose端口/协议/重复、health命令/时长/整数类型/disable漂移、美元一次解码与未发布端口、保存config与时长格式、旧入口/前置开关/无CLI。仅Python3.10 AST、全局名字/方法/空白审阅及准确读回，项目测试待CI。组合全阶段故障与真实Compose导出差异留C/D4，不将模型等同真实Docker验收。

A源码已通过PR #3022合并dev；下一批B补外部备份脚本/helper/sudoers绑定，之后C统一组合及预检合同收口。安装意图、临时拒绝门禁、完整恢复实物与准确停写/快照、逐文件安装/交接、Mac入口和统一真实隔离验收仍OPEN。无新依赖包/九helper导入/持久化格式/公开CLI或业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、私有四文件及三永久门禁保持，三组研究继续暂停、不取消。未执行现场预检或生产安装。

## 2026-10-27 — 最小更新执行器：剩余预检缺口审计

**2026-10-27 当前进度：D2_PREFLIGHT_GAP_AUDIT_MERGED_DEV / DOCUMENTATION_ONLY / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

原两锁迁移接线批[PR #3020](https://github.com/sanqin888/sanqinMVP/pull/3020) head `e4d1dd8dc333832d605dc757d2db60de99d8b831` 经[CI #7727](https://github.com/sanqin888/sanqinMVP/actions/runs/40589684080)全绿（4成功/6范围跳过；Release默认Python与3.10各779项、Runtime1080、既有C1回归412），合并dev `6a1e423bcf4b0c1f74c6937d5a60cb6638ed0653`；无CI修复，未执行现场预检或安装。

本批基于该dev，在docs/runtime-minimal-preflight-gap-audit-20261027完成剩余预检源码审计。结论：现有来源/17原件/私有材料/环境/挂载/网络/资源/备份gzip/systemd/迁移观察已接线，但完整有效应用配置和外部备份执行文件绑定仍未齐全，不能将hostPreflightComplete、applicationConfigurationObserved或readyToInstall改为true。审计仅静态事实，无生产故障判断。

后续只读预检收敛为三批：A补端口/healthcheck/AutoRemove及保存身份漂移；B补固定外部备份脚本/helper/sudoers原件与旧封存源码绑定；C统一组合回归并逐条核对预检合同，明确真实隔离验收边界，再进入既定安装意图/临时拒绝门禁。完整表及退出条件见交付合同本节。不能仅因本地测试条目增加或多个观察flag为true而宣布预检完成。

本批只更新六份文档；无代码/测试/依赖/业务schema/持久化格式/CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner或项目测试。三组研究继续暂停、不取消；固定17+Manifest/250/300、九helper、私有四文件和三永久门禁不变。所有安装写入、准确原ID停写、手动快照available/恢复实物、Mac入口、统一真实隔离验收与生产交付仍OPEN。

## 2026-10-27 — 最小更新执行器：D2迁移观察接入原两锁

**2026-10-27 当前进度：D2_LOCKED_MIGRATIONS_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

库存/历史双读批[PR #3019](https://github.com/sanqin888/sanqinMVP/pull/3019) head `05ff70bd564a16004e9e78754a6e5d6d6a1b0919` 经[CI #7725](https://github.com/sanqin888/sanqinMVP/actions/runs/40589019392)全绿（4成功/6范围跳过；Release默认Python与3.10各771、Runtime1080、既有C1回归412），合并dev `cb42cd20cd3f16a061372456df246e9438573e02`，无CI修复；未执行生产预检或安装。旧批LOCAL/未运行描述仅为当时审阅状态。

本批从该dev建立feat/runtime-minimal-locked-migrations-20261027。将已实现的迁移库存/历史/Git来源双读接入原_observe_installed_runtime：新增严格bool include_migrations，必须启用全部既有阶段直到application_binding；新内部_observe_installed_migrations只打开这些开关。当前SHA取自本轮原配置观察，保存容器与镜像pair取自本轮Docker，DB身份/历史摘要取自本轮prerequisites，命令沿同一monotonic deadline与原最小环境。两次全局观察均在原job/plan两锁内执行该阶段，比较完整稳定结果，并保留前后材料/来源/原文件与维护空闲复核。

仅迁移分支成功时返回databaseMigrationParityProven/applicationReleaseAuthenticated=true与摘要，不改旧接口默认行为；整体hostPreflightComplete/installedBaselineObserved/applicationConfigurationObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven继续false、requiresHostRecheck=true。迁移阶段自身双读与全局双读共同覆盖来源/库存/历史中途变化，不产生持久化批准或新应用版本权威；失败直接保留实际证据，不写marker或恢复业务。完整主机预检仍部分完成，不能据此安装。

新增8项组合模型测试：两次接线/权限恒false、原两锁跨度、全局迁移摘要漂移、晚期维护marker保留、来源失败传播、旧接口不触发新阶段、前置开关/严格bool和无公开CLI。依赖已合并的独立采集模型，组合测试中的迁移阶段为替身，不能当真实Docker/DB/Node/PID1验收。仅Python3.10 AST、全局名字/方法钩子、差异及读回检查；项目测试待CI，不把771当本批通过。

下一步按合同审计剩余有效配置/主机预检缺口，收口后进入安装意图与临时拒绝门禁；恢复实物/准确原ID停写/快照available、逐文件安装与交接、D3 Mac薄入口和D4统一真实隔离验收仍OPEN。无新依赖包/九helper导入/CLI/持久化格式变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner。仅原观察主体接线加一内部包装，采集/来源/命令等全部其他已有函数保持；固定17+Manifest/250/300、私有四文件/三永久门禁不变。三组研究继续暂停、不取消；无业务schema/迁移或生产操作。

## 2026-10-27 — 最小更新执行器：D2当前迁移库存与历史双读

**2026-10-27 当前进度：D2_MIGRATION_SNAPSHOT_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

Git对象批[PR #3018](https://github.com/sanqin888/sanqinMVP/pull/3018) head `9a18df2983674e03e714ae8f66482e09cfea5536` 经[CI #7723](https://github.com/sanqin888/sanqinMVP/actions/runs/40587929409)全绿，合并dev `eb17c43f29ceff3622cff50451b1137433916f65`；无CI修复，未安装。原批LOCAL/未运行描述保留为当时审阅状态。

本批分支feat/runtime-minimal-migration-snapshot-20261027。新增固定保存API完整ID的docker exec读取命令，用/usr/bin/env -i清空NODE_OPTIONS/NODE_PATH等环境、固定PATH与/usr/local/bin/node --eval，只调用fs/crypto读取/app/apps/api/prisma/migrations普通SQL原字节，沿原collector的10000项/单项2MiB/合计64MiB预算。固定脚本无Prisma/npx/依赖安装或应用模块加载，不创建新容器；只扩运行前置白名单的准确形态，原Docker通用白名单仍拒绝exec。

内部_installation_migration_snapshot重复两次：准确当前SHA的最新main CI/成对发布证明须匹配传入的已保存镜像pair；读取保存API ID的完整库存、保存DB ID的原固定只读SQL，DB身份和完整历史摘要必须与前置观察一致，再调用Git对象/全量已应用判定。两次库存/历史/Git摘要或发布证明变化阻断，只输出摘要/来源/容器身份，不返回SQL或历史正文。局部结果databaseMigrationParityProven/applicationReleaseAuthenticated=true只表示该函数在调用者给定已保存Docker/前置事实下的关系成立；canExecute=false/requiresHostRecheck=true，不构成可复用安装许可。

该函数尚未接入原两锁覆盖的完整主机观察入口，调用者仍须负责锁、当前应用SHA和容器基线的前后重核；因此整体hostPreflightComplete/readyToInstall等仍未关闭。下一步将此阶段接入原全局双读，再审计剩余预检缺口后进入安装意图/临时拒绝门禁。未实际执行容器命令、数据库查询或生产安装。

新增8项模型测试覆盖双读与保存ID、固定命令/环境/任意脚本拒绝、DB身份/历史/ID晚变、发布SHA/pair不一致、第二次历史/来源漂移、来源失败及坏ID/任意exec拒绝。仅Python3.10 AST/静态名字/方法核对，项目测试待CI。无新依赖包、九helper导入、持久化/CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；仅原运行前置命令白名单接线，其余已有函数保持。固定17+Manifest/250/300、私有四文件与三永久门禁保持。三组研究继续暂停、不取消；完整恢复材料、真实安装、Mac入口及统一隔离验收仍OPEN。

## 2026-10-27 — 最小更新执行器：D2迁移Git对象绑定

**2026-10-27 当前进度：D2_MIGRATION_GIT_SOURCE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

迁移纯判定批[PR #3017](https://github.com/sanqin888/sanqinMVP/pull/3017) head `904142b98c9a617b7d10d69010e928abc5493a78` 经[CI #7721](https://github.com/sanqin888/sanqinMVP/actions/runs/40587343957)全绿（4成功/6范围跳过；Release默认Python与3.10各755、Runtime1080、既有C1回归412），合并dev `a1a9a3d04d7210c87e05775b2863f3b446bfcb4d`，无CI修复。原批LOCAL/未运行文字为当时审阅状态，尚未安装。

本批从该dev建立feat/runtime-minimal-migration-source-20261027，新增独立bootstrap内部_installation_migration_source。先复用完整迁移输入一致性判定，再读取准确SHA的Git commit与完整非截断tree（最多100000项），拒绝重复路径、坏名称、链接/非普通blob/坏大小；全部migration.sql的Git blob身份和大小必须与输入库存集合准确相等。逐项读取base64原始blob，核encoding/字段/预算、原大小、Git SHA1及SHA256，拒绝库存自报摘要或遗漏/额外SQL。沿既有单项2MiB/总64MiB及10000项库存预算，不解析/执行SQL，不导入九helper。

只返回原一致性摘要、sourceSha/treeSha与gitMigrationObjectsMatched=true；applicationReleaseAuthenticated/databaseMigrationParityProven/canExecute仍false、requiresHostRecheck=true。此接口只把给定库存/历史与准确Git对象绑定，尚未采集当前镜像或现场DB，也未把调用者提供的SHA当成当前应用版本证明。下一步仍须接保存的当前API容器库存读取、当前成对镜像来源及DB历史双读；完整预检、安装意图/临时拒绝门禁、恢复实物、Mac入口与真实隔离验收仍OPEN。

新增8项模型测试：准确对象/无正文或执行许可、commit/tree错绑/截断/缺失、重复路径/SQL多缺、链接/嵌套名/大小/身份、blob字段/编码/原字节、伪SHA256、历史未决先阻断及SHA/tree项预算。仅Python3.10 AST、静态名字/方法检查和写回核对，项目测试待CI，不把755当本批通过。无依赖包/持久化格式/CLI/既有函数修改，无业务schema或生产操作；依赖图/12上下文owner/SCC/债务基线无变化，未重跑scanner。固定17+Manifest/250/300、九helper及三永久门禁保持；三组研究继续暂停、不取消。

## 2026-10-27 — 最小更新执行器：D2迁移一致性纯判定

**2026-10-27 当前进度：D2_MIGRATION_CONSISTENCY_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

应用环境/网络批已由[PR #3016](https://github.com/sanqin888/sanqinMVP/pull/3016) head `03b3cb2f23cb255d66e15f7d123a2779a2c53e98` 经[CI #7719](https://github.com/sanqin888/sanqinMVP/actions/runs/40586796836)全绿（4成功/6范围跳过，Release默认Python与3.10各745项、Runtime1080、既有C1回归412），合并dev `7f67c9d3da56e3559c08dd44403bb79f7db0cfcc`；未执行生产安装。

本批分支feat/runtime-minimal-migration-consistency-20261027。新增bootstrap内部纯函数_installation_migration_consistency：库存要求非空、名称唯一有序、准确四字段、严格整数大小/两种摘要、最多10000项/单项2MiB/合计64MiB；历史最多20000项，保留完整顺序和rolled-back重复尝试，拒绝failed/未知字段、缺失/修改/重复applied。所有库存迁移必须已应用，首次工具安装不接受普通发布允许的待执行前缀。rolled-back尝试只保留历史，不计为已应用，不因历史残留推断兼容性。

结果只返回输入摘要/计数与inputConsistencyObserved=true，databaseMigrationParityProven=false/canExecute=false/requiresHostRecheck=true。本函数未接入现场观察，不新增命令、Docker exec、CLI或持久化记录；模型输入自洽不证明来自当前镜像、Git或数据库。下一步仍须将准确当前镜像库存、完整Git对象与已有只读历史双读绑定，再收口剩余预检及安装意图/临时拒绝门禁。

新增10项测试覆盖完整输入/摘要/不变性、待执行迁移、缺失修改重复应用、rolled-back保留、坏历史/库存、排序与字段、大小/计数/总预算及历史顺序摘要。仅Python3.10 AST与静态名字审阅，项目测试待CI；未运行生产命令。原全部函数定义/安装许可保持，无新增依赖包或九helper导入、无12上下文所有权/SCC/债务/依赖图基线变化，未重跑scanner。固定17+Manifest/250/300、私有四文件及三永久门禁保持；三组研究继续暂停，不取消。安装、恢复材料、Mac入口与统一真实隔离验收仍OPEN。

## 2026-10-27 — 最小更新执行器：D2应用环境与数据库网络目标核对

**2026-10-27 当前进度：D2_APPLICATION_BINDING_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增四容器有效环境与保存DB网络目标的只读比较，接原双锁、来源和主机双读；已通过PR #3016合并dev。

基于dev `11deb05597f79b736b2a3a99f5509579a886878c`，分支feat/runtime-minimal-application-binding-20261027；本批已合并dev，CI证据见上文。

运行环境/就绪前置批已由[PR #3015](https://github.com/sanqin888/sanqinMVP/pull/3015) 最终head `bfe2517c464c68cdbec872871636f3232d051d3b` 经 [CI #7717](https://github.com/sanqin888/sanqinMVP/actions/runs/40584486112) SUCCESS（4成功/6范围跳过；默认Python与CPython3.10的Release各725，Runtime1080，准确CPython3.12.15既有回归412），无CI修复，合并dev `11deb05597f79b736b2a3a99f5509579a886878c`。下文该批原LOCAL/未运行描述保留为原审阅时点；此证据不代表现场安装或真实隔离验收。

内部_observe_installed_application_binding要求原configuration/Docker/systemd/filesystem/prerequisites全部启用且开关严格bool，旧接口不触发新观察。在原两锁内，两次分别重读固定Compose JSON、已保存完整四容器ID与其image ID，逐项核既有renderedCompose/config/mount摘要与身份后比较；本批唯一新增Docker读取是固定sanq-app_default network inspect，仍用原300s共享monotonic命令截止/单次30s/2MiB及最小环境客户端，无connect/disconnect或任意network参数。

每容器Env为有界唯一KEY=value列表，值保留首个等号后的全部内容；镜像Config.Env默认值合并Compose environment覆盖后，与容器实际Config.Env完整映射相等，缺、多、改、重复键、空赋值缺separator/NUL/坏类型阻断。仅对Compose config JSON的environment值核美元成对后解码$$→$一次；镜像默认与实际Env不解码，原文件/Compose JSON/创建配置均不改。未配对美元阻断而非猜测；正常空字符串和多行值按原样比较。此为模型规则，真实Compose美元往返仍留D4。

DB环境须非空POSTGRES_USER/POSTGRES_PASSWORD、POSTGRES_DB=sanqin_db和PGDATA=/var/lib/postgresql/data；API/worker的DATABASE_URL必须逐字一致，解析后只允许postgresql、db:5432/sanqin_db、无额外query/fragment/控制空白、合法百分号编码，凭据仅解码一次后与保存DB环境相同。web API_UPSTREAM只允许http://api:4000。不把DB环境中的初始凭据当成数据库当前凭据的证明，不进行远程探测或登录写入。

固定网络须本地bridge/default IPAM、项目/default标签、非internal/ingress/IPv6、无额外网络选项；网络Containers全集准确等于保存四ID。核共同64位network ID与独立endpoint ID、IPv4/subnet/prefix/gateway、网络视图和容器视图一致及地址唯一；每容器只有该网络，无HostConfig DNS/搜索/hosts/links覆盖，准确服务alias存在且db/api不得被其他角色占用。未知拓扑原样阻断，不改现网来迎合。结果只给每角色环境SHA256/条目数、DB容器ID及稳定网络身份/端点，不回显环境、URL、凭据或stderr；两次有效网络身份变化仍阻断。

仅新增containerEnvironmentObserved/databaseConnectionTargetObserved=true及摘要；applicationConfigurationObserved/hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven继续false，requiresHostRecheck=true。databaseLoginVerified/databaseMigrationParityProven/fullApplicationConfigurationProven=false：环境与网络目标一致不等于实际使用这些凭据登录、完整应用配置或迁移库存/历史一致。

新增20项离线模型测试，覆盖组合只读/摘要脱敏、$/$$准确一次比较与原件不变、坏Env/重复键/超额清单、每角色实际环境漂移、镜像默认与Compose覆盖、DB必填/本地URL/编码凭据、API-worker不一致/web上游、网络身份/额外端点/主机DNS或hosts/别名歧义、地址/前缀/gateway/IPv6/IPAM、保存ID/config/mount/image晚变、两次合法网络替换、原两锁和晚期维护、旧接口默认不查询/严格开关/无新CLI及固定网络读取白名单与失败。仅静态Python3.10 AST、全局名字/重复方法/unittest.run钩子/空白和差异/读回；项目测试待CI，不把725当本批测试通过。所有Docker/systemd/GitHub/SQL/HTTP/root为模型，未执行现场检查或安装。

归Runtime/Ops独立bootstrap内部原子新增观察能力，不涉及持久化/外部合同迁移；仅新增标准库ipaddress/urllib.parse使用，无依赖清单变更、九helper导入、反向依赖或第二版本权威。已审阅无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。66个既有函数/类定义保持，仅原观察主体加可选分支、Docker白名单多一个固定network inspect；固定17+Manifest/250/300、九helper/三drop-in、私有四文件和公开pack/verify/plan保持。

下一步核当前镜像迁移库存与Git准确对象/数据库历史一致，并收口剩余有效配置和主机预检；之后进入安装意图/临时拒绝门禁。准确原ID停写、手动快照available及完整恢复实物、逐文件安装/交接、D3 Mac薄入口与D4统一真实隔离验收/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、DB写入或生产安装。

## 2026-10-27 — 最小更新执行器：D2运行环境与就绪/DB只读前置

**2026-10-27 当前进度：D2_RUNTIME_PREREQUISITES_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增运行环境、固定就绪地址和绑定原DB容器ID的只读历史观察，沿原两锁与来源/文件/Docker/systemd/备份双读；不运行迁移、生成依赖或写安装意图。

基于dev `a7b461dd8594c8c4497dbc7bf510380b55bd99bc`，分支feat/runtime-minimal-readiness-preflight-20261027。本批已通过PR #3015合并dev；准确head/CI/合并证据见本卷新批次记录。

备份/宿主目录批已由[PR #3014](https://github.com/sanqin888/sanqinMVP/pull/3014) 最终head `f44df660676c6586d9bfd0de04091f492bdf6ef5` 经 [CI #7715](https://github.com/sanqin888/sanqinMVP/actions/runs/40581035319) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各705、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `a7b461dd8594c8c4497dbc7bf510380b55bd99bc`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或真实隔离验收。

内部_observe_installed_prerequisites仅打开原观察主体严格bool前置开关，必须同时启用既有filesystem及其前置，默认原观察接口保持。固定/proc/meminfo普通root文件、有界64KiB读取，MemAvailable须唯一且≥512MiB；只返回门槛满足，不将正常可用字节变化列为基线漂移。固定/usr/bin/python3 -I -S -B -c仅import json/sys并输出版本/实现/路径/platform，要求CPython 3.10+且3.x、Linux、固定executable、准确字段与整数版本；不加载site/材料或现役Python。这里只观察系统解释器版本，systemPythonProvenanceAuthenticated=false，不恢复自建CPython/依赖证明研究。

新增独立运行前置命令白名单，复用原有界客户端，不放宽原Docker通用读取白名单。唯一docker exec采用本次Docker观察保存的64位DB容器ID，容器内固定/bin/sh -c调用/usr/bin/env -i，仅保留固定PATH/PGCONNECT_TIMEOUT与引号中的原POSTGRES_USER；psql -X -w固定本地/var/run/postgresql:5432、sanqin_db和固定SQL，不能改SQL/容器别名、访问任意exec或发起迁移。SQL为BEGIN READ ONLY、事务内5s statement/2s lock超时，只SELECT数据库名/端口/data_directory/PG15版本/恢复状态/transaction_read_only及最多20001行迁移历史投影，再COMMIT；验证目标身份、非恢复、只读on，历史必须1至20000行且name/64位checksum/完成状态完整，无failed/进行中。不删除rolled-back或重复行，不推断迁移兼容性。

就绪观察仅六个原合同固定GET地址：API 4000、worker 4001、web 3000与sanq.ca的health、API ready、public menu。固定curl --disable禁用curlrc、禁继承代理/自定参数、限制http/https与3s连接/10s总时，响应正文丢弃至/dev/null，只输出状态码且必须准确200，不跟随redirect、不附令牌或改URL。所有子进程仍原300s共享monotonic命令/文件截止、单次30s、stdout/stderr合计2MiB和最小环境，失败仅终止自身客户端组，不操作容器/服务；来源网络规则沿原D1，不扩称全安装被硬限300s。

两次观察比较稳定Python信息、内存门槛、已保存DB ID/身份、迁移投影的完整有序摘要/行数/rolled-back数量及六地址状态；重复历史保留计数，checksum/状态、解释器版本、来源或维护残件晚变阻断。不返回历史正文、SQL业务数据、HTTP正文或stderr。psql前通过固定本地socket和清空PG环境避免把PGHOST/PGSERVICE等继承值当现场数据库，不调用npx/Prisma迁移或依赖安装命令。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅runtimePrerequisitesObserved/databaseHistoryObserved/readinessEndpointsObserved=true及稳定摘要。databaseMigrationParityProven=false、systemPythonProvenanceAuthenticated=false；hostPreflightComplete/installedBaselineObserved/c4StorageObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven及backupRestoreProven仍false、requiresHostRecheck=true。历史完成和HTTP 200不证明当前镜像完整迁移库存与数据库准确一致，也不替代当前应用配置/数据库连接绑定、完整来源或安装意图。预检只读项仍待收口，不生成可复用批准记录/第二版本权威。

新增20项离线模型测试：原锁下组合无写同步/正文不输出/权限恒false、系统Python实现/版本/字段、DB名/端口/目录/版本/只读/恢复状态、失败/空/坏/超限历史、rolled-back和重复行摘要、六地址准确200/无跳转、SQL参数本地socket/清空环境/只读边界与保存ID、任意SQL/exec/URL拒绝、坏JSON/重复/非有限值、两次历史或Python变化、原两锁与晚期维护/来源、默认接口不读前置/严格开关/无CLI、临时内存输入的缺失/歧义/低值/预算与正常波动、固定Python隔离参数、共享真实pipe客户端不继承DB/Python/proxy环境及命令失败。Docker/systemd/GitHub/SQL/HTTP/Python/root/anchor为模型，未实际查询生产或运行项目测试；仅Python3.10 AST、静态名字/重复方法/unittest钩子、60个原定义不变及两处接线、差异/准确读回，不把前批705作为本批结果。

归Runtime/Ops独立bootstrap只读主机预检，无新依赖包/常规helper/反向导入/第二版本权威，未导入九helper、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原观察函数加可选前置分支，原共用客户端仅新增固定前置命令类别，其余60个既有函数/类保持；固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式和CLI不变。

下一步对齐当前镜像迁移库存/历史、有效应用配置与DB连接绑定等剩余预检合同，完成只读主机预检收口后接安装意图/临时拒绝门禁。准确原ID停写、手动快照available与完整恢复实物、逐文件安装/成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、现场预检或生产操作。

## 2026-10-27 — 最小更新执行器：D2备份与宿主目录核对

**2026-10-27 当前进度：D2_BACKUP_FILESYSTEM_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增宿主固定目录、部署磁盘余量及最新本地DB备份的只读核对，沿原两锁和来源/源码/配置/Docker/systemd双读；不备份、恢复、复制业务数据或写安装意图。

基于dev `fbbee891fba9820f31f3cf1d859d745286ee49f3`，分支feat/runtime-minimal-backup-filesystem-20261027。本批已通过PR #3014合并dev。

systemd预检批已由[PR #3013](https://github.com/sanqin888/sanqinMVP/pull/3013) 最终head `359a1c22400a222f90facbe78480dee914c425ae` 经 [CI #7713](https://github.com/sanqin888/sanqinMVP/actions/runs/40578976996) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各685、Runtime1080、准确CPython3.12.15回归412），无本批CI修复，合并dev `fbbee891fba9820f31f3cf1d859d745286ee49f3`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或真实隔离验收。

内部_observe_installed_filesystem只通过原观察主体的严格bool开关启用，要求原配置/Docker/systemd观察同时存在，默认原接口不读取业务目录/备份。固定从/逐层nofollow目录FD打开/srv、/srv/sanq、uploads/backups及/home、/home/ubuntu、sanq-assets/sounds，核真实目录、root或ubuntu祖先UID/GID、无组/其他写和特殊权限位，backups须ubuntu:ubuntu 0700。uploads/sounds按既有无其他写合同核目录，其实际owner/gid只保存为事实，不擅自chown或宣称无其他writer。每层核读前后FD与原路径inode/owner/gid/mode，部署/opt/sanq所在文件系统须余量至少5GiB；余量只报告门槛满足和设备，不把正常剩余字节波动当身份漂移。

备份目录最多4096项，匹配原sanqin_db_YYYYMMDD_HHMMSS.sql.gz合同，按mtime/ns与名称稳定选最新；最新缺失/坏类型/链接/权限/内容不回退选旧成功。原件nofollow/非阻塞打开，普通单链接、固定ubuntu UID/GID和0400/0600，非空压缩大小≤1GiB。用本机墙钟核0至26h时效，分块完整SHA256原压缩字节，再完整读取gzip（含多member、CRC/末尾错误），非空展开总量≤4GiB；沿原300s monotonic截止逐块检查并结束前重核时效。文件/目录清单读前后完整身份/mtime/ctime必须一致，读取中替换或新备份出现阻断，不改原件、不执行SQL、不生成新备份。时效仅本机时间检查，不恢复可信时间研究或证明跨克隆时间。

全局两次观察还比较最新备份原字节摘要/完整身份与宿主目录稳定身份；相同字节换文件inode、挂载目录被替换或维护/来源晚变仍阻断。目录仅核身份/权限，不递归盘点uploads/sounds，正常营业新增文件不因目录mtime变化被误判替换，也不宣称目录内容已快照。只返回固定路径/元数据、备份名称/摘要/字节数，不返回SQL正文或复制数据。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增hostPersistentDirectoriesObserved/backupIntegrityObserved=true及filesystem摘要；backupRestoreProven=false，内部restoreProven=false。hostPreflightComplete/installedBaselineObserved/c4StorageObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。gzip完整和26h时效不等于SQL可恢复、全量VM恢复、DB业务一致性或AWS快照available；DB卷的Docker绑定观察不扩称宿主卷inode/全部C4证明。内存/系统Python与剩余就绪/DB只读前置尚未完成，观察结果不持久化成安装票据或第二版本权威。

新增20项离线模型测试：原两锁下组合只读/无写同步/秘密不输出、最新选择与坏最新不回退、旧/未来/缺备份、截断/坏CRC/空payload/尾部损坏、多gzip member完整摘要、压缩/展开/目录项预算、同名目录/FIFO/软硬链接、私有权限/只读/owner/gid、root/ubuntu/data目录权限与缺失/链接不修复、低磁盘、正常上传及余量波动不致误报、起始/块间monotonic耗尽、同字节备份替换/读中新清单、两次目录替换、原锁与晚期维护保留、默认路径不读数据/严格开关/无CLI及固定根元数据。临时真实文件/gzip/目录/锁，Docker/systemd/GitHub/root/anchor/容量为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法/unittest钩子、55个既有定义不变及唯一观察函数接线、差异/准确读回，不把前批685当本批通过。

归Runtime/Ops独立bootstrap只读文件预检，复用标准库gzip/hash/FD与原来源和锁方向，不导入九helper或执行现役/目标Python；无新依赖包/常规helper/反向导入/第二版本权威或12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式和CLI保持，原观察函数仅加可选filesystem分支，其余55个既有函数/类定义不变。

下一步补本机运行环境/内存及剩余就绪与DB只读前置，完成主机预检收口后接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移或现场生产操作。

## 2026-10-27 — 最小更新执行器：D2 systemd有效配置与原件核对

**2026-10-27 当前进度：D2_SYSTEMD_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部systemd初次安装预检，沿原两锁、来源/源码/配置/Docker双读流程，核四个有效unit、未决reload/override和旧备份unit实物；没有安装/重载/停启服务或维护marker写入。

基于dev `ca0507f522a6bb10f982f0e0e9746a6d902a62fc`，分支feat/runtime-minimal-systemd-baseline-20261027。本批已通过PR #3013合并dev。

Docker/挂载批已由[PR #3012](https://github.com/sanqin888/sanqinMVP/pull/3012) 最终head `f20ede98945ae6ea2f740804f389d59410b7ac9c` 经 [CI #7711](https://github.com/sanqin888/sanqinMVP/actions/runs/40577327857) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各664、Runtime1080、准确CPython3.12.15回归412），合并dev `ca0507f522a6bb10f982f0e0e9746a6d902a62fc`。首次CI #7710因测试夹具run覆盖unittest.TestCase.run而中断；同分支仅将模拟方法及引用改名observe_command，生产代码/门禁未放宽。下文原LOCAL/未运行或修复待核仅为原审阅时点，仍未安装/真实隔离验收。

内部_observe_installed_systemd要求同时启用原配置/Docker采集，严格bool开关，默认已有文件/Docker观察不查询systemd。只允许/usr/bin/systemctl --system show固定docker.service、docker.socket、sanq-backup.service、sanq-backup.timer及固定属性全集；拒绝任意unit/属性/远端参数、daemon-reload/stop/start。原Docker客户端提取为共同有界只读客户端，保留原流读取/超时/仅结束自身CLI组主体与最小环境，systemd不继承DBUS_SYSTEM_BUS_ADDRESS/SYSTEMD_HOST等跳转。共用原300s Docker/manager命令截止、单次30s、stdout/stderr合计2MiB；每份show另核64KiB、准确键全集、无重复/未知/缺失键，原始命令属性只摘要，不回显。

有效unit必须loaded、NeedDaemonReload=no、无任何已加载DropInPaths且非masked/未知enable状态。Docker fragment只接受原/lib或/usr/lib的vendor路径别名，backup两unit只接受/etc/systemd/system固定原路径，其他完整override拒绝；Docker service active/running，socket active/listening且只触发docker.service。备份service须inactive/dead、ubuntu用户/默认或ubuntu组、0077/oneshot、准确无忽略失败的/home/ubuntu/backup-db.sh单一启动命令，无额外pre/post/stop-post；timer须active/waiting或inactive/dead且只触发sanq-backup.service。读取状态不证明当前维护门禁已加载。

固定/etc/systemd/system逐层root-owned/root-group、无组/其他写或特殊权限位及nofollow目录FD。旧sanq-backup.service/.timer须普通单链接root文件、有界读与完整FD/路径元数据重核；service字节必须等于旧已封存Runtime的原成员，timer原字节/元数据只观察摘要，不补造来源。拒绝本地docker.service/.socket文件（含悬空链接），四unit .d、service.d/socket.d/timer.d及sanq-前缀目录必须不存在或真实可信空目录；任何未知文件、预留80-sanq-maintenance.conf或部分残件原样保留并阻断。读loaded属性前后都重读磁盘原件和目录身份，全局两次观察再比较稳定unit属性摘要；相同字节换inode、目录或有效unit状态变化仍阻断。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增systemdObserved=true及四unit稳定属性/摘要、两备份unit原件摘要和预留门禁不存在的事实；maintenanceGatesLoaded/backupIntegrityObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。vendorUnitBytesAuthenticated/backupTimerSourceAuthenticated=false：只观察加载路径/属性及本地timer实物，未扩展到OS来源研究或宣称timer有封存Git来源。尚未核备份gzip/时效、宿主挂载目录/资源及剩余就绪/DB项，不把unit空闲当成停写/快照或恢复就绪证明。

新增21项离线模型测试，使用临时真实root模型文件/目录及原锁，覆盖组合只读/无写同步、vendor路径别名和空闲timer、load/reload/masked/未知loaded drop-in、完整override、Docker稳定状态与socket触发目标、忙碌backup与timer错误、有效用户/组/UMask/Type/单一命令/hooks、属性重复/缺失/未知/预算、service旧归档字节匹配、缺失/链接/硬链接/权限、三预留或其他/类型级/前缀drop-in残件与可信空目录、悬空本地Docker override、同字节替换/两次有效状态漂移、原两锁跨度与晚期维护、默认路径不查询systemd、严格开关/读白名单/无新CLI、固定anchor走向/元数据及共享真实pipe客户端最小环境。systemd/Docker/GitHub/root/固定anchor为模型，未实际调用管理器或运行项目测试；仅Python3.10 AST、静态名字/重复方法/禁止覆盖unittest.run钩子、43个既有定义不变、root读取主体及有界客户端主体AST等价、差异/准确读回，不把前批664当本批通过。

归Runtime/Ops独立bootstrap只读主机预检，无新依赖包/常规helper/反向导入/第二版本权威、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原root文件读取提取共用主体、原Docker客户端提取共用主体并仅扩固定读取命令分派，原观察函数加可选systemd分支，其余43个既有函数/类保持；不导入九helper或执行现役/材料Python。固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式及CLI不变；timer仅外部现役观察，不加入原17或变成第18成员。

下一步接备份完整性/26h时效、宿主uploads/sounds/backup目录实物与资源及剩余就绪/DB只读项；全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、现场预检或生产操作。

## 2026-10-27 — 最小更新执行器：D2 Docker/Compose与实际挂载核对

**2026-10-27 当前进度：D2_DOCKER_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部Docker/Compose只读观察，在原两锁与来源/源码/配置双读流程内，核当前四容器角色、健康和完整身份、实际应用镜像封存digest/OCI revision，以及DB卷和持久挂载。没有安装入口、维护意图或生产操作。

本批首次[CI #7710](https://github.com/sanqin888/sanqinMVP/actions/runs/40577015596) 在默认Python离线Release套件发现测试夹具将模拟Docker方法命名run，覆盖unittest.TestCase.run，套件于该类前中断。同分支仅将夹具方法及引用改为observe_command，生产代码/门禁不变；最终修复head与CI #7711/合并记录见上文；原待核仅为修复提交前时点，不把640或静态检查当本批通过。

基于dev `12f3f840387229a22adf62035f486bcb63ae36e4`，分支feat/runtime-minimal-docker-baseline-20261027。本批已通过PR #3012合并dev。

配置原件核对批已由[PR #3011](https://github.com/sanqin888/sanqinMVP/pull/3011) 最终head `2c785b95396dfe88bff45840f8e3d95bb6f378b3` 经 [CI #7708](https://github.com/sanqin888/sanqinMVP/actions/runs/40575133829) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各640、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `12f3f840387229a22adf62035f486bcb63ae36e4`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或完成真实隔离验收。

内部_observe_installed_docker只打开原观察主体的严格bool Docker/config开关；默认两种文件观察均不调用Docker。固定/usr/bin/docker --host unix:///var/run/docker.sock，白名单仅info、固定项目Compose config --environment/JSON、项目ps全量完整ID、准确容器/image ID inspect及原sanq-app_pgdata volume inspect；不能run/create/start/stop/pull/exec/build或传入任意命令/端点。拒绝继承的Docker端点覆盖，子进程仅固定最小PATH/LANG/本地endpoint环境，不转发GitHub令牌/环境SHA或秘密，不用shell。原状态锁跨度保持。Docker命令共享300s monotonic截止、单次至多30s；selectors并发读取stdout/stderr、合计2MiB上限，失败/超时只结束自身只读CLI进程组，不操作业务容器，stderr不回显。来源网络读取仍沿原D1规则，不宣称全部安装预检被300s全程硬限。

核本地Linux/amd64引擎且live-restore=false、Swarm inactive；Compose项目/准确四服务/所需非空环境和应用SHA，展开内容仅摘要、不重写$/$$。当前应用独立准确paired seal核实际API/web image ID、RepoDigests及OCI revision，容器允许当前tag或该准确digest声明，API与worker实际image ID一致。项目所有容器含已停止对象必须恰好api/ubereats-worker/web/db四角色，完整ID唯一且inspect相同，均稳定running/healthy、无paused/restarting/dead/privileged；核原restart策略及on-failure计数、实际命令/entrypoint与准确展开配置或已观察镜像默认值。DB只核已有对象/镜像ID及postgres:15-alpine声明，不额外宣称其来源证明。

原sanq-app_pgdata须local driver/scope、无额外驱动选项、准确项目/卷标签和引擎卷路径；DB挂载须该卷与对应Source、固定数据目标及RW=true。API/worker仅原/srv/sanq/uploads读写bind，web仅原sounds路径只读bind；错误/额外挂载拒绝。双读比较准确容器/镜像ID、策略、restartCount/StartedAt、配置/挂载/展开内容/卷摘要、稳定引擎身份与当前seal；不比较正常变化的健康检查日志。容器或来源晚变、额外对象和维护残件阻断，不自动重试/清理记录。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅containersObserved/composeExpansionObserved/containerMountsObserved/currentImagePairBound=true并返回稳定观察/摘要；applicationConfigurationObserved/applicationReleaseAuthenticated/c4StorageObserved/systemdObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。当前镜像仅沿原paired seal绑定，不等于全套当前main/CI/就绪证明；未核容器环境与Compose美元插值完整等价，未核宿主路径实物/资源/备份/systemd/SQL历史或公共就绪。返回结果不是第二版本权威、恢复包、停写证明或安装票据。

新增24项离线模型测试，覆盖锁内组合及秘密不输出/无写同步、当前digest声明、engine/live-restore/swarm/platform、Compose必要环境/重复/SHA/角色与镜像、额外/缺失/短/重复ID、错role/project/ID、健康/运行/privileged、实际digest/revision/image平台、API/worker同image、命令/策略、挂载目标/源/RW/额外对象、卷选项/身份、忽略健康日志但比较lifetime、双读健康替换、原两锁与晚期维护/paired seal变化、重复/非有限JSON与预算、默认文件路径不读Docker/严格开关和无CLI；客户端用真实可丢弃pipe/selectors、Popen/clock/root模型核白名单、最小环境、端点拒绝、输出超限/错误/编码/超时与仅kill自身CLI组。Docker/GitHub及固定anchor为模型，没有运行真实Docker/systemd/SSH或测试项目；仅Python3.10 AST、静态名字/重复方法、40个原定义不变及原观察函数接线审阅、差异/准确读回，不把前批640计作本批通过。

归Runtime/Ops独立bootstrap只读主机采集，增加selectors/signal/subprocess/time标准库；不导入九helper或执行现役/材料Python，无新常规helper/反向导入/第二版本权威、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in、D1/四私有材料格式及CLI保持，只有原观察函数加可选Docker分支，其他40个既有函数/类定义保持。

下一步补systemd有效units/override和原三外部文件事实、备份完整性/新鲜度、宿主挂载目录与资源及剩余就绪/DB只读项，全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无新依赖包/业务schema/迁移或现场生产操作。

## 2026-10-27 — 最小更新执行器：D2配置原件只读核对

**2026-10-27 当前进度：D2_CONFIGURATION_FILES_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部配置原件只读观察：与原17源码核对共用原job/计划锁和来源前后复核，新增.env、唯一发布state及C4标记的原字节/元数据一致性检查。只返回摘要，不写安装意图、不安装或停服务。

基于dev `b5bdddf4dba5fe0ee06ef781619c32b03d559093`，分支feat/runtime-minimal-configuration-baseline-20261027。本批已通过PR #3011合并dev。

现役Runtime源码核对批已由[PR #3010](https://github.com/sanqin888/sanqinMVP/pull/3010) 最终head `0824f2a0e14c956673903ae911f24a252b23de07` 经 [CI #7706](https://github.com/sanqin888/sanqinMVP/actions/runs/40573749428) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各620、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `b5bdddf4dba5fe0ee06ef781619c32b03d559093`。下文该批原LOCAL/未运行仅为原审阅时点，仍未现场安装或真实隔离验收。

内部_observe_installed_configuration仅通过原_observe_installed_runtime的严格bool内部配置开关，复用原来源、完整17/Manifest双读、材料读回、空维护/finished jobs及原两锁；默认源码观察仍不读取配置。固定真实Runtime根下仅三个白名单文件，nofollow/非阻塞FD，有界读取并核前后FD/路径完整身份。按固定ubuntu账户UID/GID核.env、按root:root核唯一state，均普通单链接且0400/0600；C4标记沿原root-owned无其他写及正确内容合同。缺失、链接/硬链接、错权限/owner/gid或读中变化阻断，不修复。

环境文件原字节保持LF/CRLF、引用、密码及$/$$；不执行dotenv/shell、不扩展Compose或重新转义值。SANQ_IMAGE_SHA要求原controller的唯一裸准确SHA行，重复/export/缩进别名、NUL/孤立CR和坏编码拒绝。唯一state严格六字段、整数schema=1、active/readiness-verified或rolled-back/rollback-verified、准确current/previous及UTC时间格式，current须与.env一致；pending/未知/错完成原因不从.env修复。接受旧controller的+00:00与新Z格式，时间格式检查不证明可信时间。Runtime来源SHA与应用current独立，无第二份current/previous权威。

配置与源码在同一原两锁内经来源刷新前后双读，原字节、inode、权限、账户身份变化均阻断，即使.env/state同时变成另一组相互一致值也不能沿用旧观察。结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅增加configurationFilesObserved=true及三个文件摘要/元数据、state中的应用SHA/phase；不返回原秘密、state正文或完整环境。applicationConfigurationObserved/composeExpansionObserved/applicationReleaseAuthenticated/c4StorageObserved/containersObserved/systemdObserved、installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven均false、requiresHostRecheck=true。C4标记内容正确不等于真实卷/目录已验证，观察结果不持久保存为安装许可/恢复包。

新增20项离线模型测试：三版本身份独立与秘密不输出/无写同步、原CRLF/$/$$不变、rolled-back与两种UTC、环境重复/别名/引用/坏编码、配置缺失及无修复、state未决/不一致/坏整数/原因/时间/缺字段/重复键、C4内容、私有权限/只读/特殊位、三文件链接/硬链接、ubuntu账户/owner/gid、空/超限、同字节替换及一致配置成组变化、读中秘密变化、原锁跨度与竞争、晚期来源/维护残件、默认源码观察不读配置、严格bool与无新CLI/任意路径。临时真实文件与锁，GitHub/账户/anchor/root为模型；项目测试未运行，仅Python3.10 AST、静态名字/重复方法、37个既有定义不变及唯一观察函数接线审阅、差异/准确读回核对，不把前批620用作本批结果。

归Runtime/Ops独立bootstrap文件观察，仅新增标准库pwd依赖；不加载现役/材料Python、不导入九helper，无新常规helper/反向导入/第二版本权威或12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式及CLI保持；原_observe_installed_runtime复用主体，仅加内部可选配置双读，其他37个既有函数/类定义保持。

下一步接真实Docker/Compose展开、容器完整ID/镜像/挂载、备份与systemd/本机环境的只读预检；全部前置完成后再写安装意图并加载临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离及生产材料仍OPEN。三组研究继续暂停、不取消；本批无依赖包/业务schema/迁移变更、实际主机预检或生产操作。

## 2026-10-27 — 最小更新执行器：D2现役Runtime源码只读核对

**2026-10-27 当前进度：D2_INSTALLED_RUNTIME_OBSERVATION_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部只读现役源码核对：持原job/计划锁，刷新保留材料的来源与工具差异，逐字节核现役17+Manifest并重读身份。仅首次工具安装基线，已有九辅助件或Runtime目录内bootstrap（含悬空链接）要求另审，不覆盖；尚无主机安装或root CLI。

基于dev `6f2378f23bfb80192f8f4f965daefccee98f8d4d`，分支feat/runtime-minimal-installed-baseline-20261027。本批已通过PR #3010合并dev。

D2私有材料交接批已由[PR #3009](https://github.com/sanqin888/sanqinMVP/pull/3009) 最终head `078306e9e0dda594d283ee133129027c5832f4c8` 经 [CI #7704](https://github.com/sanqin888/sanqinMVP/actions/runs/40570561979) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各600、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `6f2378f23bfb80192f8f4f965daefccee98f8d4d`。下文原LOCAL/未运行仅为该批原审阅时点；源码CI不代表安装或真实隔离验收。

内部_observe_installed_runtime只接受已保留的准确retention-id，在原两锁下拒绝维护残件及未完结job；重新认证旧归档/目标kit、准确来源和受保护差异。固定/opt/sanq/runtime真实目录，逐层nofollow目录FD、root:root及无组其他写/特殊权限位；17成员和runtime-release.json均普通单链接、有界读取、核owner/gid/mode与读前后FD/路径身份，原17逐字节等于旧已封存归档，Manifest严格无重复键且规范值含整数类型一致，允许原JSON排版并单列实际原字节摘要。全程不执行/import现役或目标Python。来源刷新后第二次读完整文件/目录身份，再核私有材料及空维护/finished jobs；同字节换inode、并发变化或来源失效亦阻断，不写修复或完成记录。

结果仅INSTALLED_RUNTIME_FILES_OBSERVED、installedRuntimeFilesObserved=true；installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。旧Runtime sourceSha独立于当前应用SHA；不读取.env/唯一state/C4、不观察Docker/DB/挂载/备份/systemd或宣布无override。三drop-in原件/缺失事实仍待系统预检，九辅助件不存在只是初次安装冲突检查，不能充作完整恢复包或安装票据。函数只返回摘要/元数据，不保存或清理记录，不新建目录、不fsync、不停服务。

新增20项离线模型测试，临时真实文件/目录/锁覆盖旧17逐项变更、目标字节冒充旧字节、Manifest错值/布尔/重复键及原排版、缺失/超限/空文件、目录/文件/悬空链接和硬链接、权限/owner/gid/root、已有辅助件/安装器冲突、同字节换inode/读中改写/目录换位、晚期来源/保留原件/维护/job变化、两原锁覆盖及竞争、缺失身份不建目录、无写入/同步和无CLI。GitHub/root身份与固定anchor为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法、原函数等价及差异/读回核对，不将前批600用作本批结果。

本批归Runtime/Ops独立bootstrap只读文件观察，沿installer→原D1来源校验/标准库FD方向；不导入九helper、无新常规helper/反向导入/第二版本权威、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in及D1/D2私有材料格式不变，D1 CLI与原私有材料函数主体保持。

下一步补.env/唯一state/C4、实际容器完整ID/镜像/挂载/备份及systemd/本机运行环境预检，全部前置满足后才接安装意图/临时拒绝门禁；后续准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离和生产材料仍OPEN。三组研究继续暂停、不取消；无依赖/业务schema/迁移、现场预检或生产操作。

## 2026-10-27 — 最小更新执行器：D2私有材料交接

**2026-10-27 当前进度：D2_PRIVATE_MATERIALS_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**独立installer新增内部root私有材料交接与只读观察：复制前后重新核D1来源/工具差异，在固定状态树持原job/计划锁，create-only保存材料包、旧Runtime原归档及准确保留记录，逐文件同步/读回。无root交接CLI、主机安装入口、维护marker或units变更。 基于dev `40aaf51b17eb738266990a9b8e5e230448164e90`，分支feat/runtime-minimal-private-materials-20261027。归Runtime/Ops独立bootstrap私有交接，沿installer→原D1来源核验和标准库FD/flock方向；不导入九辅助件，原job格式仅独立只读识别，无新版本权威/helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九常规helper/三永久drop-in、D1材料格式保持，新增权限面只在源码中，未现场安装或授权生产执行。 仅由独立审阅bootstrap的内部_retain_verified_materials调用，先重新验证准确kit/原归档/主线与工具差异，再检查固定/opt/sanq逐层owner/gid/无组其他写和nofollow目录FD。仅对缺失的deploy-state及jobs/plans/maintenance/installations建root:root 0700；已有类型/权限不符拒绝，不修复。写前按目标文件系统保留5GiB加最大32MiB材料与元数据空间，低空间不新建；只读查询不因空间不足被禁止。原jobs/.release.lock→plans/.prepare.lock非阻塞加锁、核同inode、同步并始终保留锁文件。维护任意残件、未完结/坏job或竞争阻断；已完成READY/BLOCKED原件按原格式核对保留。 私有材料按内容身份存/opt/sanq/deploy-state/installations/<64位retention-id>/，固定四文件retaining.json、delivery-kit.tar.gz、current-runtime-archive.tar.gz、retained.json均root:root 0600/单链接。先耐久保留意图和两份输入，锁内再读来源、重核空维护/finished jobs，最后写MATERIALS_RETAINED；每项O_EXCL、完整写入、文件/目录fsync及准确读回，未知不删残件、不覆盖或重试。该意图仅指材料复制，不是maintenance/active.json或安装许可；只读_inspect_private_materials重读完整材料/规范hash记录并刷新来源，即使看见完成记录也只返PRIVATE_MATERIALS_OBSERVED、operationSuccessProven=false。 保留记录绑定的是提供的旧Runtime原归档来源，不是主机当前应用或已安装版本；requiresHostRecheck=true，hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction均false。root私有复制不执行/import材料中代码，不观察或修改.env/state/原17/容器/DB，不宣称维护或停写生效。D1 pack/verify/plan的函数及CLI主体保持，仅增加内部材料函数；不会从用户可写staging提权执行目标代码。 新增26项离线模型测试，覆盖真实临时私有目录/文件/元数据/fsync与原两个OS锁及inode、root拒绝/源失败/差异超范围、低磁盘、坏权限/owner/gid/目录或文件链接、维护/job残件、原生成器READY/BLOCKED互通、未完结/错schema/时钟/错误码job、竞争/重复不可覆盖、短写/复制未知/最终记录未知/来源晚变、规范记录或材料篡改、只读查询不清其他维护/不自动建目录及无root/apply CLI；固定真实anchor走向为系统调用模型，GitHub/容量/root身份亦为模型。实际/opt/sanq、目标VM、systemd/Docker/SSH/SIGKILL及恢复未执行。仅Python3.10 AST、静态名字/重复方法、D1原函数等价和差异/读回核对，项目测试未运行，不把前批574当本批结果。 本批仅D2第一段私有材料交接，不代表D2安装器完成。下一步在独立bootstrap内接现役主机只读预检，再接安装意图/临时拒绝门禁、准确原ID停写/手动快照available、旧工具恢复实物及逐文件安装/成功交接；D3 Mac薄入口、D4统一真实隔离与生产材料仍OPEN。无依赖/业务schema/迁移或生产操作；三组研究继续暂停、不取消。 本批已通过PR #3009合并dev；详见[交付合同及D2](Runtime最小执行器工具交付与安装合同.md)。

## 2026-10-27 — 最小更新执行器：D1惰性材料与只读核验

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / HOST_INSTALL_NOT_IMPLEMENTED / NOT_INSTALLED。**新增独立交付工具ops/release/install_minimal_executor.py，仅pack/verify/plan。复用原17归档封存、准确main/CI/发布及固定Git对象，惰性材料含原归档、17+9+bootstrap共27份源码和三固定模板；重新核验来源后只输出材料/差异观察，所有安装/执行权限标志false。 基于dev `43d270d0e6d290a95eaa2732918edcbec040c906`，分支feat/runtime-minimal-delivery-review-20261027。独立交付工具归Runtime/Ops材料清点与只读核验，依赖已审阅build_bundle/versioned_release_contract/release_contract，不导入九辅助件，不由task导入或自更新。未修改既有执行主体、Bundle/schema/CI/publish/权限，无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。 D1由独立审阅的bootstrap运行，不import/exec材料包内Python。先核同准确S的最新main CI/成对seal及历史归档独立摘要/同publish，再另核Manifest原ciRunId的准确main/push成功；原CI与后续成功重跑ID分别报告。完整commit/tree/blob逐路径核27份普通文件及SHA1 Git对象/大小/SHA256，拒绝截断树、错对象和缺件；原17字节还须与已封存归档一致。源码获取后重新读来源，变化阻断。三drop-in采用固定文本，并以AST核已验guard常量语法，不求值或加载目标代码。 plan只比较提供的旧/新已验Runtime归档，要求准确主线方向；首次仅两个部署源差异在已定范围，其余列NEEDS_PLATFORM_REVIEW。它不读取现役VM或宣称旧归档等于已安装字节，installedBaselineObserved=false、requiresHostRecheck=true，Manifest摘要明确是规范JSON摘要；readyToInstall/canExecute/authorizedToMutateProduction始终false。不能将计划作为后续安装票据。 新增30项离线模型测试，覆盖确定性材料/17+9+bootstrap与三模板、实际checkout清单/guard语法一致、原CI与最新CI、封存晚期漂移、错/重包归档、严格Manifest整数/重复键、Git树/普通文件/完整blob/350个无关文件、模板变化、自洽篡改kit无效、多缺/重复/路径/链接与预算、差异范围/工具降级拒绝、0600/create-only/链接/不安全父目录/生产路径/同步未知，以及CLI只路由材料、拒绝root pack和install/apply/execute、错误脱敏。GitHub/CI为替身，临时文件实物；未访问实际网络/容器/DB/管理器。仅Python3.10 AST、静态名字/重复方法/空白/guard常量语法与差异读回核对，项目测试未运行，不把前批544或CI #7700作为本批测试结果。 D1已通过PR #3008合并dev；D1材料与只读核验批已由[PR #3008](https://github.com/sanqin888/sanqinMVP/pull/3008) 最终head `3bef681194eaa49868eb20bc6190af25fbf9d973` 经 [CI #7702](https://github.com/sanqin888/sanqinMVP/actions/runs/40566184983) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各574、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `40aaf51b17eb738266990a9b8e5e230448164e90`。原LOCAL/未运行是原审阅时点；仍未安装/真实隔离验收。 D2主机安装、独立bootstrap root落地/临时门禁/恢复材料/逐文件交接、D3 Mac薄入口、D4统一真实隔离验收及生产材料仍OPEN。当前打包器来自操作者独立审阅的bootstrap，材料包不能认证正在运行的验证器自身；后续root阶段必须重新验真，不能提权运行用户staging。17+Manifest、250/300旧guard、九常规helper/三永久drop-in数量保持，无新依赖/业务schema/迁移或生产操作，三组研究继续暂停、不取消。 详见[工具交付合同及D1](Runtime最小执行器工具交付与安装合同.md)。

## 2026-10-27 — 最小更新执行器：工具交付与安装合同核对

**2026-10-27 当前进度：CONTRACT_MERGED_DEV / SOURCE_AUDITED / INSTALLER_NOT_IMPLEMENTED / NOT_INSTALLED。**完成原17+Manifest、九辅助件、三drop-in、状态目录和现有staging/历史来源/备份材料的源码核对，新增[工具交付与安装合同](Runtime最小执行器工具交付与安装合同.md)。本批仅文档，不修改Bundle/schema/权限/guard或生产文件。 基于dev `d1768dbd5af4375467d6e998dd7e031665b6f306`，分支docs/runtime-minimal-delivery-contract-20261027。交付采用原已封存17归档加同准确main SHA的固定Git对象/模板，保留独立bootstrap审阅与root私有重验；transport清单不自证来源，不新设发布workflow/seal或版本权威。九辅助件和永久三drop-in独立交付，现有stage_bundle/plan_versioned_install不充当安装器，现有配置备份不能代替完整工具恢复实物。正式工具写入前拟先加载不依赖目标Python的临时拒绝门禁，逐文件替换后再转永久guard；该门禁、安装marker/记录、kit与installer均尚未实现。 首次工具过渡保持原.env/state/C4 marker/应用ID与DB卷，不自动更换应用镜像；真实旧17差异须逐项核对，超出两个部署工具源的变化另审。共享目录就绪后持原两锁，先意图/门禁、保存ID与策略并停写、核手动快照available和恢复材料，再安装/读回/核旧应用并最后清标记；未知保留真实证据，不恢复旧盘或自动续跑。 下一步D1仅实现惰性材料与只读核验/计划；随后D2受限安装、D3 Mac薄入口、D4统一真实隔离验收和生产材料，均沿原第三批范围。本批未运行项目测试，仅源码/路径/清单及文档差异核对；未测现场Python/Compose/systemd/Prisma/故障恢复，未选择生产main SHA/归档/快照。无新helper/依赖/业务schema/迁移、owner/SCC/债务/scanner基线变化，未重跑scanner；17+Manifest/250/300保持，三组研究继续暂停、不取消。 本批已通过PR #3007合并dev；交付合同已由[PR #3007](https://github.com/sanqin888/sanqinMVP/pull/3007) 最终head `5a703b4b4a309731f68a913ef42a271049eadd85` 经 [CI #7700](https://github.com/sanqin888/sanqinMVP/actions/runs/40562348239) SUCCESS（仅ci-change-scope成功，其余9作业按文档范围跳过；无Release/Runtime测试重跑），无CI修复，合并dev `43d270d0e6d290a95eaa2732918edcbec040c906`。文档合并不代表installer或生产验证完成。 详见[工具交付与安装合同](Runtime最小执行器工具交付与安装合同.md)。

## 2026-10-27 — 最小更新执行器：回退异步任务接线

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原release_task新增submit-rollback与status-rollback，复用同一systemd任务、两锁、整体预算及原阶段主体。独立准确兼容摘要绑定run和StopPost参数；子任务缓存重采集后执行回退freeze/create/start/finalize，提交唯一rolled-back并最后清标记。无SQL容器/反向SQL、外层异常改写、自动重放或恢复。 基于dev `678d50dde7e7295da05c3e2857d8f019ff7d553a`，分支feat/runtime-minimal-rollback-task-20261027。Runtime/Ops未安装工具内部原子增量，task仍负责调度/上下文/编排/观察，沿task→guard/starter/finalizer/collector/plan/store/job方向；复用原SQL与普通阶段主体，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。九helper/三drop-in仍须统一验真，旧工具签名拒绝；固定17+Manifest/250/300保持，受保护源改动必须走正式Bundle过渡。 新增30项离线模型测试：异步固定参数/准确兼容确认与SQL互斥、前向kind误用/坏确认/过期备份/维护残留/未知派发、PID/cgroup/策略/命令篡改、StopPost不读计划及坏PID拒绝、混装旧签名阻断、CLI确认/路由/脱敏、回退唯一state与完整history只读联合观察；整条真实阶段主体贯穿两锁、当前应用不健康、原计划/完整历史不变、旧digest三ID/原策略、缺错确认/新鲜基线漂移/默认缓存采集、部分create与禁止重放、start未知/最终readiness失败、总预算前后耗尽/逐命令剩余上限、独立StopPost计划不可用仍收尾、COMMITTED/clear未知及清除后不再停业务。现有预检测试改为executionImplemented=true、executionRequested=false，同时增加回退freeze/submit不调用断言，其业务只读/不排队规则不变。临时私有文件/锁为实物，Docker/DB/GitHub/HTTP/PID1为替身；仅Python3.10 AST、静态名字/重复方法、原函数等价、差异与读回审阅，项目测试未运行，不把前批514视为本批通过。 本批源码接齐受控回退异步主线，但尚未统一交付/安装或真实验收。下一步核对九helper/三drop-in与固定17+Manifest正式Bundle过渡的准确交付合同，再完成Mac薄入口及真实隔离的Compose美元往返、Docker/Prisma/PID1、SSH断开/SIGKILL、socket/daemon/reboot、故障/恢复/连续双发布验收。查询、SUBMITTED、COMMITTED或标记消失不是未知/事故续跑许可；旧程序可能已写数据，不能反向SQL或直接恢复旧盘。三组研究继续暂停、不取消；无依赖/业务schema/迁移文件及生产Docker/systemd/SQL/AWS操作。 本批已通过PR #3006合并dev；回退异步任务批已由[PR #3006](https://github.com/sanqin888/sanqinMVP/pull/3006) 最终head `69950aa86bc35587ef86979a6e32a74ad33ba8de` 经 [CI #7698](https://github.com/sanqin888/sanqinMVP/actions/runs/40558256262) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各544、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `d1768dbd5af4375467d6e998dd7e031665b6f306`。原LOCAL/未运行是原审阅时点；仍未安装/真实隔离验收。 详见[回退异步任务](Runtime最小更新执行器实现方案.md)。

## 2026-10-27 — 最小更新执行器：回退成功交接

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原finalizer新增内部finalize_rollback_ready，以独立准确兼容确认、原typed回退计划及同一v6/READY尝试复用原成功交接主体。先持久FINALIZING，再仅替换.env中的SHA、核目标配置/readiness和完整SQL历史，提交唯一rolled-back/rollback-verified；同步读回后只对保存三ID恢复原restart策略，重核后持久HANDOFF_COMMITTED并最后清标记。未知结果保留实际state/.env/维护证据，不重写PENDING或自动重放。 基于dev `c0fad842056f46d644a6075840ebefa203bcbae7`，分支feat/runtime-minimal-rollback-handoff-20261027。Runtime/Ops未安装工具内部原子增量；沿finalizer→starter/guard/collector/plan/store/release/job方向，九helper数量不变，无反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。guard仅扩v6阶段白名单；原维护转换/IO、普通finalize入口、env/state原子写/同步/目标绑定及清理主体保持。旧v6读者会拒绝新阶段，九helper/三drop-in须统一验真；17+Manifest/250/300保持，不直接覆盖受保护文件。 新增30项离线模型测试，覆盖准确旧目标唯一状态/完整history与原件不变、原策略含on-failure:7恢复、LF/CRLF、两锁贯穿、错误确认/attempt/root/过期备份/普通入口误用、健康/Dead/proof/配置/备份/history与晚期漂移、readiness/中断/DB/额外writer/不确认stop、.env与state同步/写入未知、错误state读回/策略结果或读回未知、恢复策略后history变化、最终marker同步与unlink/目录同步未知、scope不可变/阶段跳跃/清理身份，以及真实目标绑定与唯一rolled-back读回。私有临时文件和锁为实物，Docker/HTTP/DB/GitHub/PID1为替身；项目测试未运行，仅Python3.10 AST、静态名字/重复方法/差异及未改函数等价审阅，不把前批484视为本批通过。 本批仅完成内部回退成功交接；尚无异步回退submit/run/StopPost与状态接线或可执行回退CLI，check-rollback仍仅观察。下一步将回退各阶段接入原受控异步任务，保留独立兼容确认及未知结果阻断，再完成九helper/三drop-in统一交付、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收。READY/COMMITTED或标记消失均不是未知/事故续跑或旧盘恢复许可，旧程序可能已写业务数据，不能反向SQL。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件及生产Docker/systemd/SQL/AWS操作。 本批已通过PR #3005合并dev；回退交接批已由[PR #3005](https://github.com/sanqin888/sanqinMVP/pull/3005) 最终head `cfd05ec939d653f2bfd8fceee94d5718fdafdfed` 经 [CI #7696](https://github.com/sanqin888/sanqinMVP/actions/runs/40556088534) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各514、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `678d50dde7e7295da05c3e2857d8f019ff7d553a`。原LOCAL/未运行为原审阅时点；仍未安装/隔离验收。 详见[回退成功交接](Runtime最小更新执行器实现方案.md)。

## 2026-10-27 — 最小更新执行器：回退启动与就绪核验

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原starter新增内部start_rollback_and_verify，持原job/计划锁及维护目录FD，核同一v6已登记尝试、typed回退计划、独立准确兼容确认、历史目标proof、唯一PENDING/旧.env配置/运行合同/备份/实际三ID和挂载。复用原启动/健康/固定readiness及失败收尾主体；先持久STARTING_CANDIDATES，再仅start保存三ID，重核后写CANDIDATES_READY，仍保留PENDING、维护与restart=no，不改.env/提交rolled-back或清标记。 基于dev `7ee8c0a2b9648ca30e2a6f7b581ad67c29bd3e03`，分支feat/runtime-minimal-rollback-start-20261027。Runtime/Ops未安装工具内部原子增量，v6扩STARTING/READY但仍拒绝FINALIZING/HANDOFF；原维护IO/不可变rollback字段保持，starter→guard/collector/plan/store/release/job方向不变，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。新增23项离线模型测试，覆盖准确旧ID/独立确认/原件与完整history不变、普通start不能采用回退、pending/config/备份/history/proof与晚期配置漂移、原history核验合同及forward kind拒绝、已启动/被替换对象不得重放、start结果未知、unhealthy/starting→healthy/90s超时、readiness失败/Python中断/部分stop、额外writer/DB/history/策略/Dead漂移、初始与最终fsync未知、root/两锁/备份过期，以及真实pending绑定函数接受旧目标PENDING+原.env并拒绝反向关系。文件与锁为可丢弃临时实物，Docker/GitHub/HTTP/DB/PID1为替身；实际VM、SSH/SIGKILL、容器、Prisma及Compose往返未执行。仅Python3.10 AST、静态名字/重复方法、原启动变更段等价及差异/读回审阅，项目测试未运行，不把前批461结果当本批通过。原创建测试的“未实现阶段”负例改为仍未开放的FINALIZING，保留scope/降级/回退创建阻断断言；启动阶段现在通过真实共享主体覆盖。 本批仅完成内部回退启动与READY，尚无回退成功交接、唯一rolled-back提交、原策略恢复/最终清标记、异步submit/run/StopPost及状态接线；check-rollback仍仅观察，原前向任务不能采用回退kind。查询到READY不是从未知/事故续跑或重放的许可，旧应用启动可能写业务数据，不能据失败恢复旧盘或反向SQL。下一步接同一原计划/兼容确认/维护证据下的成功交接，再完成异步任务、九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。 本批已通过PR #3004合并dev；回退启动批已由[PR #3004](https://github.com/sanqin888/sanqinMVP/pull/3004) 最终head `604865cabea9ffcc009edbbcc32ae7d2fd56dbc9` 经 [CI #7694](https://github.com/sanqin888/sanqinMVP/actions/runs/40549990852) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各484、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `c0fad842056f46d644a6075840ebefa203bcbae7`。原LOCAL/未运行描述保留为原审阅时点；仍未安装/隔离验收。 详见[回退启动与就绪](Runtime最小更新执行器实现方案.md)。

## 2026-10-27 — 最小更新执行器：回退容器创建与登记

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原guard新增内部prepare_rollback_candidate_containers，持原job/计划锁与维护目录FD，以原typed回退计划、独立兼容确认及同一v5/FROZEN尝试进入，共用原三服务create/register主体。重核当前完整SQL/history、准确历史目标proof、缓存旧API SQL/source和运行基线；先保留rollback scope升级v6/CREATING_CANDIDATES，再写唯一PENDING、固定--no-build/--pull never创建和登记完整三ID/image ID，不start或执行SQL。登记结束仍保留维护、PENDING和旧.env，数据库历史不删减。 基于dev `45220d9a0ddacf8be6d108badea3025298e8bf16`，分支feat/runtime-minimal-rollback-create-20261027。Compose导出值边界已更正：已查Docker Compose的config实现会对已插值导出内容统一将$写为$$；应用创建配置原样保留该导出值，本批撤回“再转义一次”的临时改动。迁移creation_config原先额外replace会把已转义URL再次转义，本批移除该重复层，并将旧迁移测试夹具改为实际导出形态及原样保留断言。字面$需要Compose转义的原则仍成立，但应只在正确的输入边界执行一次；此前迁移美元测试只验证替身输入，不能作为真实往返证明。目标现场Compose版本的config→私有stdin→容器环境精确往返仍待隔离验收，不据上游源码或离线字符串断言宣布已通过。 新增23项离线模型测试，覆盖准确旧digest/先意图后PENDING/两锁贯穿/三服务无DB创建与登记、保留当前完整历史和原件/rollback scope、旧对象保留或被替换、缺错确认/attempt、proof/缓存SQL/完整source树/配置/history漂移、部分create与禁止重放/不得猜ID、PENDING/创建意图/登记耐久未知、DB/history变化、错误mount/运行状态/restart策略/image/额外角色拒绝、已登记候选优先收尾、scope不可变/降级/未实现启动阶段拒绝、锁/前向误用/备份过期，以及应用与迁移保留Compose导出美元值。另修正原迁移测试的导出URL夹具与对应断言；不削弱秘密不转发断言。临时私有计划/维护文件和锁为实物，Docker/SQL/PID1/现场采集均为替身。仅Python3.10 AST、静态名字/重复方法、IO与未改方法AST、差异/读回审阅，项目测试未运行，不把前批438结果当本批通过。 Runtime/Ops未安装工具内部原子增量，guard仍拥有维护/创建/登记/失败收尾，原依赖方向及九helper数量不变，无反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner；17+Manifest/250/300保持。本批仅完成内部回退创建与登记，v6只允许CREATING_CANDIDATES/CANDIDATES_REGISTERED/INCIDENT；没有回退启动/readiness、唯一rolled-back成功交接、恢复原策略/清标记或异步提交/执行接线。部分创建和未知结果保持真实PENDING/维护证据，不自动采用发现的ID、重放、反向SQL或旧盘恢复；创建成功也不代表数据库/业务兼容已证明。下一步接准确已登记旧容器的启动与就绪，再接成功交接及异步任务。统一九helper/三drop-in、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收仍OPEN；三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。 本批已通过PR #3003合并dev；详见[回退创建与登记](Runtime最小更新执行器实现方案.md)。


回退创建批已由[PR #3003](https://github.com/sanqin888/sanqinMVP/pull/3003) 最终head `6bce17db6e5128ee792770b4a39b5a3db455f426` 经 [CI #7692](https://github.com/sanqin888/sanqinMVP/actions/runs/40546110736) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各461、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `7ee8c0a2b9648ca30e2a6f7b581ad67c29bd3e03`。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：受控回退停写

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原guard增加内部freeze_rollback_for_plan及锁内主体，持原job/计划锁和维护目录FD，核typed原件、独立准确兼容确认、缓存镜像现场重采集、时间/来源与实际三writer，再与普通更新共用同一arm/停写主体。新增未安装v5维护记录保存准确目标proof与确认摘要；先持久ARMED和原ID/image/restart策略，再仅对保存ID设restart=no并stop，重核后FROZEN。当前应用可已退出或不健康，未知/替换/额外对象仍阻断；不改唯一state/.env或执行SQL。 基于dev `07ba60c8b470c53a8eb30fb365741056f261b48a`，分支feat/runtime-minimal-rollback-freeze-20261027。Runtime/Ops未安装工具内部原子增量，guard仍拥有维护记录/转换/收尾，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner；v1–v4与前向观察/停写顺序保持，v5拒绝混装旧读者。新增21项离线模型测试，覆盖不健康/已退出应用、准确目标/确认/原策略先保存、前向仍拒绝退出对象、缺/错确认、fresh/proof漂移、created/paused/restarting/dead/状态不一致、额外writer前后出现、DB/历史晚期漂移、state原字节与计划读回变化、root/安装门禁/备份/残留拒绝、原两锁竞争、初始与最终fsync未知、update/stop失败、原task失败收尾、v5结构/不可变scope与阶段拒绝、旧观测/过期备份，以及前向创建/CLI不能采用回退记录。私有计划/维护文件与锁为可丢弃临时实物；Docker/GitHub/DB/PID1/现场采集为替身。仅Python3.10 AST、静态名字/重复方法/差异及共享停写主体AST等价审阅，未运行项目测试，不把前批417等结果当本批通过。 本批仅完成内部回退停写阶段，尚无回退任务提交、旧镜像create/register/start/readiness、唯一rolled-back交接或清标记；v5当前仅接受ARMED/FROZEN/INCIDENT，旧前向/SQL路径不能采用它。check-rollback仍只观察，不触发新停写函数；不从持久FROZEN推导重试/续跑许可，不自动恢复策略/服务、反向SQL或旧盘。下一步在同一原计划/兼容确认/维护记录下接回退候选创建与登记、启动就绪和成功交接，再接异步任务；统一九helper/三drop-in、固定17+Manifest正式Bundle过渡、Mac薄入口及真实隔离故障/恢复/连续双发布验收仍OPEN。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。 本批已通过PR #3002合并dev；详见[受控回退停写](Runtime最小更新执行器实现方案.md)。


回退停写批已由[PR #3002](https://github.com/sanqin888/sanqinMVP/pull/3002) 最终head `c219a2d8d319ffc8d84a3e1df5a573b99e6f8d77` 经 [CI #7690](https://github.com/sanqin888/sanqinMVP/actions/runs/40541893634) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各438、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `45220d9a0ddacf8be6d108badea3025298e8bf16`。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：回退兼容确认与锁内复核

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原plan新增独立准确兼容确认及新旧现场审阅原件比对，collector新增show-rollback-sql，只展示当前数据库比旧镜像多出的已应用SQL。原task新增check-rollback <plan-id> --approve-compatibility <准确摘要>：持原job锁和计划锁，禁止未完结job/维护记录，缓存模式重新采集两镜像/两份SQL来源/现场基线，结束前重读原计划与门禁；只返回BASELINE_RECHECKED，不能排队或执行回退。canExecute/databaseCompatibilityProven/incidentRecoveryAuthorized始终false，executionImplemented=false。 基于dev `05c65d07f2ee059cdaf012378075e34f021ec747`，分支feat/runtime-minimal-rollback-check-20261027。新增18项离线模型测试：缺安装API拒绝及准确/缺失/布尔/错scope确认、同SQL仍需确认、采集时间与备份过期/时钟倒退、state/配置/历史/备份/运行pin/目标proof漂移、坏原件、准确SQL blob/当前commit/字节与输出预算、typed CLI/脱敏，以及持两锁的真实collector与私有store组合、禁pull/业务命令、未完结job/维护/门禁、读回变化、300s预算、竞争/root及CLI参数拒绝。文件存取使用可丢弃私有临时目录，Docker/GitHub/DB/PID1为替身。仅Python3.10 AST、静态名字/重复方法/差异及原SQL读取循环AST等价审阅，项目测试未运行，不把前批399结果当本批通过。 Runtime/Ops普通兼容新增，原task→collector/plan/store方向保持，无新helper/反向依赖/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner；原forward/SQL执行函数与唯一state/维护schema保持。本批未接回退停写、对象创建/启动、唯一rolled-back提交与清标记，也无异步回退任务或事故恢复入口。复核结果不保存批准文件/新job，不是可重用执行票据；未来执行仍须在同一锁内重核并保留原计划与数据库真实历史，不可伪装前向计划、执行反向SQL或调用旧rollback --execute。下一步接原维护主线的受控回退阶段，再完成九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口及真实隔离故障/恢复/连续双发布验收。三组研究继续暂停、不取消；无依赖/业务schema/迁移文件、生产Docker/systemd/SQL/AWS操作。 已通过PR #3001合并dev；详见[回退确认与复核](Runtime最小更新执行器实现方案.md)。


回退复核批已由[PR #3001](https://github.com/sanqin888/sanqinMVP/pull/3001) 最终head `ed3ee4af58f827fa10d3940d581915135dcea0d5` 经 [CI #7688](https://github.com/sanqin888/sanqinMVP/actions/runs/40538401235) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各417、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `07ba60c8b470c53a8eb30fb365741056f261b48a`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：回退采集与私有计划保存

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原collector新增prepare-rollback [--save] [--cached-only]和show-rollback <plan-id>，只从唯一state的previous确定目标，不接受任意SHA。重核17+Manifest/配置/state原字节、准确历史proof/两运行文件、当前与目标实际digest及各自API SQL/Git树、当前history/DB身份/真实挂载/备份；结束前重读关键基线，任一变化阻断。当前应用可不健康/已退出，但对象身份/镜像/挂载仍须证明，DB必须运行且是原固定卷；维护记录/PENDING仍拒绝。只输出兼容审阅摘要，canExecute保持false。 基于dev `17416da3333a34dc19defcbefcfc4a6f242f56e5`，分支feat/runtime-minimal-rollback-collect-20261027。原collector采两镜像SQL并绑定各自Git树，原store用同一create-only IO主体及各自kind validator，类型不互认；默认可缓存两个目标digest，--cached-only不pull，不停开业务或执行SQL。新增17项模型测试未运行，仅AST/静态名字/方法名/source与IO主体等价/差异检查。无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner；17+Manifest/唯一state不变，三组研究继续暂停。回退确认执行/安装/Mac/隔离/生产仍OPEN，无生产/业务schema/依赖操作，已合并dev；原本地测试未运行是审阅时点；详见[回退采集与保存](Runtime最小更新执行器实现方案.md)。


回退采集批已由[PR #3000](https://github.com/sanqin888/sanqinMVP/pull/3000) 最终head `ee12e4f1bb69c4cdee31e97ae7e6b1763bc0fd85` 经 [CI #7686](https://github.com/sanqin888/sanqinMVP/actions/runs/40532730955) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各399、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `05c65d07f2ee059cdaf012378075e34f021ec747`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：受控回退审阅门禁

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**在原release_contract/plan内补受控回退审阅门禁，无新helper或执行入口。准确历史目标校验复用seal/目标最新main CI/publication与同一祖先检查，要求目标是current的主线祖先，不发现latest，也不以当前应用健康或当前CI重跑失败替代历史目标证明。纯审阅计划绑定唯一发布state原始字节/哈希、current与准确previous、备份/环境/运行合同、当前完整SQL/history及旧镜像SQL清单；列明额外已应用迁移，兼容批准摘要仅绑定本次审阅范围，canExecute与databaseCompatibilityProven始终false。 基于dev `2d1aed320f59716ee233d7f5f79b37dd80a57095`，分支feat/runtime-minimal-rollback-review-20261027。新回退审阅kind与forward隔离，stateRaw仅为原state快照，兼容未证明/事故恢复未授权/执行权限恒false；无采集/持久保存/执行接线。复用历史来源和前向基础观测校验，原lineage主体提取AST一致；原本地审阅新增17项模型测试且未运行，仅AST/静态名字/方法名/差异审阅。无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。release_contract为固定17成员，必须正式Bundle/Manifest交付；现役工具/唯一state/业务schema/依赖不变，三组研究继续暂停。回退执行/安装/Mac入口/隔离/生产仍OPEN，无生产操作，已通过PR #2999合并dev；详见[回退审阅门禁](Runtime最小更新执行器实现方案.md)。


回退审阅批已由[PR #2999](https://github.com/sanqin888/sanqinMVP/pull/2999) 最终head `ca5993f258faafe7cbca85429ab7768073ef1753` 经 [CI #7684](https://github.com/sanqin888/sanqinMVP/actions/runs/40527848453) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各382、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `17416da3333a34dc19defcbefcfc4a6f242f56e5`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：完整 SQL 异步任务接线

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**同一release_task的submit/run/cleanup接收独立准确--approve-sql摘要；提交与停写前都用原计划校验，pending SQL缺失/错摘要、布尔或无迁移却附批准均拒绝。管理器ExecStart/ExecStopPost同时绑定planId与批准参数，PID/cgroup/固定unit校验保持。run持同一job锁/计划锁/维护目录FD完成freeze→迁移create/register→start/wait/history→原应用交接，仅前一阶段调用已知成功才继续；无新批准文件、发布状态或helper。 基于dev `3cb66317b49a2cdfdd8e97e6a9b21210369e4035`，分支feat/runtime-minimal-sql-task-20261027。整体1800s/管理器2100s/StopPost900s原预算保持，局部900s迁移与命令上限取剩余预算较小值；主进程未知不重放/改记录，独立StopPost不依赖计划重读。原两个适配器提取锁内主体，AST对照主体相同；缺迁移/helper API停写前拒绝。新增18项模型测试且扩安装API缺件测试，原本地审阅项目测试未运行；仅AST/静态名字/方法名/主体等价/差异审阅。无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。受控回退/安装/Mac入口/真实隔离和生产仍OPEN，九helper/三drop-in须统一交付，17+Manifest/唯一state不变，三组研究继续暂停。已通过PR #2998提交；首次CI #7681（run 40526052017）显示CLI批准夹具重复保存原不可变计划、事故收尾顺序断言误包含先前freeze停止；同分支仅改夹具createdAt为独立时间并核收尾四个保存ID的停止后缀，保留原计划拒绝覆盖和生产逻辑。修复head CI #7682通过并合并dev，无生产/业务schema/依赖操作；详见[完整SQL任务接线](Runtime最小更新执行器实现方案.md)。


完整SQL任务批已由[PR #2998](https://github.com/sanqin888/sanqinMVP/pull/2998) 最终head `af11fd4d3374ef180c5fbdc9f8d5e55abc6c7344` 经 [CI #7682](https://github.com/sanqin888/sanqinMVP/actions/runs/40526376795) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各365、Runtime1080、准确CPython3.12.15回归412），合并dev `2d1aed320f59716ee233d7f5f79b37dd80a57095`。首次CI #7681发现测试重复保存原不可变计划、停止顺序断言包含freeze命令，仅af11fd4d修正夹具时间及收尾停止后缀；生产逻辑/拒绝覆盖门禁不变。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：迁移后的应用交接

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**同一task新增内部handoff_migrated_release，持原job/计划锁和维护目录FD，独立核同一SQL批准后，复用原create/register→start/readiness→finalize锁内主体。原计划字节/planId不变；迁移后history按原历史+准确批准pending的applied差量验证，不清空pending或伪造无迁移计划。v3/MIGRATION_VERIFIED仅可前进到保留migration与candidate两组准确对象的v4创建意图；后续原阶段/唯一ACTIVE/准确restart策略/最终清标记继续使用同一实现，迁移容器保持退出、restart=no且不删除。 基于dev `e013287898a88dba7af375f9dc96279055b8f550`，分支feat/runtime-minimal-post-migration-handoff-20261027。未安装v4兼容保留SQL与应用对象证据，原三阶段复用同一准确history检查与原PENDING配置适配，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未运行scanner。v4事故先处理迁移ID再应用/旧writer，不撤销SQL或反写实际ACTIVE；封口/clear未知保留原边界。新增16项模型测试、校正两份原应用意图夹具为无SQL计划，原本地审阅仅静态检查、项目测试未运行。SQL异步任务参数/整体贯通、回退/安装/隔离/生产仍OPEN；九helper待统一验真、17+Manifest不变，三组研究继续暂停。无生产/业务schema/依赖操作，已通过PR #2997合并dev；详见[迁移后的应用交接](Runtime最小更新执行器实现方案.md)。


迁移后应用交接批已由[PR #2997](https://github.com/sanqin888/sanqinMVP/pull/2997) 最终head `96d6a3221d6742a6dda0ee9fbe1a8872ec870ffd` 经 [CI #7679](https://github.com/sanqin888/sanqinMVP/actions/runs/40523115618) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各347、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `3cb66317b49a2cdfdd8e97e6a9b21210369e4035`。其LOCAL/未运行记录是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：已登记迁移启动与历史核对

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**同一task新增内部execute_registered_migration及锁内主体，原job/计划锁和维护目录FD贯穿批准/时效、唯一PENDING与旧.env、Manifest/运行合同/展开配置、DB/history/备份/准确来源/缓存API digest与SQL inventory重核。只从同一v3/MIGRATION_REGISTERED进入；先耐久STARTING_MIGRATION再start已保存ID并wait，阶段monotonic预算900s（含重核与等待，start至多30s）。wait返回0还须确认同一对象exited/ExitCode=0、无OOM/Dead/Error/重启，以及数据库历史准确增加本计划有序pending对应的applied行、保留原历史含rolled-back行与重复数量，无额外SQL或失败项。复核完成写MIGRATION_VERIFIED，仍保留PENDING/维护标记/原策略禁止重启；不是ACTIVE或恢复许可。 基于dev `49e1d65705119386b21c79c144bdf30d8c078ed8`，分支feat/runtime-minimal-migration-execute-20261027。固定900s预算与保存ID start/wait，原incident/StopPost处理未知，不撤销已发生SQL或重放；原件最终同步未知只尽力停保存ID且不覆盖阶段。migration_container增加完成/准确历史delta检查，guard仅扩v3阶段枚举，task复用starter配置核验；无新helper/环/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原本地审阅新增16项离线模型测试且未运行，仅静态审阅/AST/名字/差异检查；原CLI仍拒绝SQL，迁移后应用交接/安装/隔离/生产仍OPEN。17+Manifest/业务schema/依赖不变，三组研究继续暂停。已通过PR #2996提交远端；首次CI #7676（run 40514716500）发现持久化转换表漏列REGISTERED→STARTING_MIGRATION→MIGRATION_VERIFIED，导致启动前被拒绝；同分支仅补准确两步与各阶段至INCIDENT的转换，保留原不可变字段检查，修复后的最终head CI #7677通过并合并dev。无生产操作；详见[已登记迁移执行](Runtime最小更新执行器实现方案.md)。


迁移执行批已由[PR #2996](https://github.com/sanqin888/sanqinMVP/pull/2996) 最终head `9da4771dbc7f7f2768b9d8a932471ab1a218ce5b` 经 [CI #7677](https://github.com/sanqin888/sanqinMVP/actions/runs/40514962099) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各331、Runtime1080、准确CPython3.12.15回归412），合并dev `e013287898a88dba7af375f9dc96279055b8f550`。首次CI #7676发现持久转换表遗漏新阶段，修复提交9da4771d仅补REGISTERED→STARTING_MIGRATION→MIGRATION_VERIFIED与事故转换，保留原不可变字段检查；不是放宽门禁。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：迁移容器只创建与登记接线

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原task新增内部prepare_migration_container，持原job/计划锁和维护目录FD贯穿重核、迁移意图、唯一PENDING、只创建、DB/history复核和准确ID登记。锁内重核准确SQL批准、计划时效/原配置/Manifest/运行合同、历史/备份/候选证明/缓存API digest及镜像SQL清单；配置只含一个迁移服务与已有external网络，DATABASE_URL通过原有界私有stdin传入并转义Compose美元符号，不转发JWT等API秘密。固定create --no-build --pull never、180s，不start/SQL/ACTIVE/改.env；未知保留意图/PENDING且禁止重跑。 基于dev `0224e0eb7bfba9b762d5098a0da673fa63d81eb2`，分支feat/runtime-minimal-migration-create-20261027。原guard两个入口委托同一锁内主体，task→guard/migration_container方向不变，无新增helper/反向导入/上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原本地审阅新增9项模型测试且未运行，仅AST/方法名/静态名字/差异检查，无依赖/业务schema/迁移/17+Manifest变化。完整SQL执行/应用接续、回退/安装/隔离/生产仍OPEN；九helper待统一验真交付，三组研究继续暂停。本批已合并dev、未安装，无生产操作，详见[迁移只创建](Runtime最小更新执行器实现方案.md)。


迁移只创建批已由[PR #2995](https://github.com/sanqin888/sanqinMVP/pull/2995) 最终head `b22b4ba0ad66d1eed2f798c02504048d5686e9a6` 经 [CI #7674](https://github.com/sanqin888/sanqinMVP/actions/runs/40512651573) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各315、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `49e1d65705119386b21c79c144bdf30d8c078ed8`。提交前修正Compose美元转义实现为两个美元符号，原回归用例随本head通过。其原LOCAL/未运行描述是原审阅时点，仍未安装/隔离验收。

## 2026-10-27 — 最小更新执行器：迁移容器登记与收尾

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原guard新增内部begin_migration_creation/register_created_migration，无CLI或任务调用。原FROZEN计划/attempt及独立SQL批准匹配、原writer已停/门禁/备份状态核验后，先将同一维护标记升级v3/MIGRATION_CREATING，容器身份暂空；只允许登记created、restart=no、非auto-remove、无挂载/非privileged、固定网络/名称/命令、准确计划标签/API digest与实际image ID/revision的平台对象。登记后MIGRATION_REGISTERED，不start或执行SQL。事故收尾先处理登记迁移ID再处理原writer；空身份/缺失/额外对象保持FENCE_UNCONFIRMED，不猜ID、不重放或清标记。 基于dev `afbd7c515e15603d5eff8b588c4f27561a98a578`，分支feat/runtime-minimal-migration-registration-20261027。新增migration_container，辅助件九件待统一交付；guard→migration_container→原collector/plan/release，无反向导入/新环或12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原维护schema新增v3兼容读取，无已安装消费者/双写，不改唯一发布state。新增9项模型测试未运行，仅AST/名字/差异静态审阅。完整create/start/SQL/历史与应用接续未接，task仍拒绝pending SQL；无依赖/业务迁移/17+Manifest/生产操作，三组研究暂停保留。迁移登记批已由[PR #2994](https://github.com/sanqin888/sanqinMVP/pull/2994) 最终head `531d95036dc55d735ae8a92598cabeaf8b88d1ab` 经 [CI #7672](https://github.com/sanqin888/sanqinMVP/actions/runs/40507815863) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各306、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `0224e0eb7bfba9b762d5098a0da673fa63d81eb2`。原本地未运行/未提交仅为原审阅时点；仍未安装/隔离验收。 详见[迁移容器登记](Runtime最小更新执行器实现方案.md)。

## 2026-10-27 — 最小更新执行器：准确SQL审阅与批准绑定

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**在原plan/collector补准确待执行SQL审阅与批准范围绑定，不新增helper、批准数据库或版本权威。plan.sql_review给出planId/目标/API digest/有序原始SQL元数据及域分离approvalSha256；assert_sql_approval只核独立传入的准确摘要，缺失/布尔/planId/错摘要拒绝，无pending只接受None。原prepare/show摘要新增sqlReview，show-sql按计划gitBlobSha读取固定SanQ GitHub blob，核size/base64/原字节SHA-256和Git blob SHA-1后展示UTF-8原文与准确commit来源；所有SQL核完且完整JSON不超过4MiB才输出。canExecute/sqlSafetyAssessed始终false，摘要不是授权凭证/安全判定，不写批准文件或执行SQL。 基于dev `73a8a162325e1dfcba10515541a00837ed8a9937`，分支 `feat/runtime-minimal-sql-review-20261027`。新增13项离线测试未运行，仅Python3.10 AST/方法名/差异静态审阅，无新依赖/业务schema/迁移/CI/17+Manifest变化。Runtime/Ops普通兼容新增，plan schema不变；collector→plan/release方向不变，无新增环/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。详情见[准确SQL审阅与批准绑定](Runtime最小更新执行器实现方案.md)。执行路径仍拒绝pending SQL，尚未接独立批准/迁移容器执行及事故收尾；无SQL/Docker/systemd/AWS或生产安装，三组研究暂停保留，SQL审阅批已由[PR #2993](https://github.com/sanqin888/sanqinMVP/pull/2993) 最终head `2d76d1da35ee98bee6183961816622e837a7ac6e` 经 [CI #7670](https://github.com/sanqin888/sanqinMVP/actions/runs/40504787295) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各297、Runtime1080、准确CPython3.12.15回归412），合并dev `afbd7c515e15603d5eff8b588c4f27561a98a578`。首次CI #7669因GitHub blob测试替身未接受token关键字导致CLI成功用例失败，仅补**kwargs后通过，生产逻辑/门禁不变。原LOCAL/未运行是原审阅时点，不等于已安装/隔离验收。

## 2026-10-27 — 最小更新执行器：无迁移异步任务贯通

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原release_task已接入同一无迁移计划的freeze→create/register→start/readiness→finalize；同一job锁/计划资源锁/维护目录FD贯穿阶段交接，四阶段主体提取为原入口与任务共同使用的内部函数，AST对照确认主体逻辑不变，不复制第二套发布器。执行/排队前拒绝pending SQL和目标等于当前版本；CLI提交确认改为--confirm-release，原--confirm-maintenance不再接受，unit前缀改为sanq-release-apply-，无已安装消费者。仅最终原finalize清标记已知完成返回ACTIVE；保留未知/事故语义。 基于dev `15fcbdcf1af0adbd32f48875e76073a918c89523`，分支 `feat/runtime-minimal-no-sql-task-20261027`。执行1800s、systemd启动2100s/StopPost900s独立预算，拒绝阶段间竞争与预算耗尽后继续；终结clear未知不由任务重写或回退。新增13项全任务离线方法及原task测试调整未运行，仅Python3.10 AST/四阶段主体AST对照/差异静态审阅，MCP工作区未执行项目测试。Runtime/Ops内部原子调整，无新增helper/反向导入、12上下文owner/SCC/债务/scanner基线变化，未重跑scanner；无依赖包/CI/业务schema/migration或17成员变化，八helper待统一验真安装。详细流程和未完成门禁见[无迁移任务贯通](Runtime最小更新执行器实现方案.md)。SQL/回退、安装/Mac入口、真实隔离/恢复及生产发布仍OPEN，三组研究暂停保留；无迁移任务贯通已由[PR #2992](https://github.com/sanqin888/sanqinMVP/pull/2992) 最终head `1f9b424056db494930edfa73f7ed950ba70b4607` 经 [CI #7667](https://github.com/sanqin888/sanqinMVP/actions/runs/40501959449) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各284、Runtime1080、准确CPython3.12.15回归412），合并dev `73a8a162325e1dfcba10515541a00837ed8a9937`。首次CI #7666中SQL拒绝测试重复保存原fixture计划而报错，仅把该测试createdAt改成独立时间戳，同分支追加 `1f9b4240` 修复；生产逻辑/门禁未改。原本地未运行/未提交为审阅时点，不代表隔离或生产已通过。 无生产操作。

## 2026-10-27 — 最小更新执行器：连续更新的digest原对象识别修正

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**修正首次digest候选成功交接后，下一次维护仍只识别SHA标签的问题。原guard._inspect保留固定仓库/角色/完整ID及显式候选引用的精确检查；旧writer若声明digest，逐次以实际image ID核linux/amd64、RepoDigests和目标revision。入维护前再与准确已封存release的SHA标签或digest二选一对齐；后续停写/登记/启动/交接/事故收尾通过同一检查并核原保存image ID，无新marker字段、发布权威或恢复入口。新增7项离线测试方法未运行，其中一项从真实阶段代码完成第一次交接，再对同一digest容器进入下一计划的freeze与创建意图；Docker/采集/GitHub为替身，尚未完成真实连续两次发布验收。 基于dev `efc0afebe595a760471f561012ae320e431da913` 创建分支 `fix/runtime-minimal-consecutive-updates-20261027`。Runtime/Ops内部原子修复，无新增导入/环/SCC/上下文owner/债务/scanner基线变化，未重跑scanner；无依赖/业务schema/迁移、CI、固定17+Manifest/250/300变化，三组研究暂停保留。本地仅静态语法/差异检查，无项目测试/生产操作，连续更新修正已由[PR #2991](https://github.com/sanqin888/sanqinMVP/pull/2991) 最终head `f37426a7088be8ff7e189d0995617be5281012ce` 经 [CI #7664](https://github.com/sanqin888/sanqinMVP/actions/runs/40498211632) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各271、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `15fcbdcf1af0adbd32f48875e76073a918c89523`。此前本地未运行/未推送为原审阅时点；仍未安装/隔离验收。范围与未完成验收见[连续更新修正](Runtime最小更新执行器实现方案.md)。

## 2026-10-26 — 最小更新执行器第二批续作：联合状态观察

**2026-10-26 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**成功交接已由PR #2989 / CI #7660合并dev `3391cf495dd9bbb4d56d2ae46648d75c6e2f44b1`。本批在原release_task.status内增加联合只读观察：同一job/计划锁内读取原计划、唯一发布状态与维护记录；有维护记录即保留未完结语义，无marker且准确目标ACTIVE才核安装合同、环境/状态一致、实际三writer/image digest/健康/角色列表/bind及DB，并重读关键观察拒绝漂移。返回TARGET_RUNNING_OBSERVED也固定operationSuccessProven=false/canExecute=false；它不是clear耐久回执、原策略恢复证明、最新GitHub证明、SQL兼容证明或重试/恢复许可。无新helper、常驻服务、发布状态、包依赖/业务迁移或生产操作；三组研究继续暂停。 分支 `feat/runtime-minimal-joint-status-20261026`，新增9项离线测试方法，覆盖目标观察、ACTIVE+维护、外来计划、未完结状态、未知/脱敏、锁忙、健康/角色/挂载拒绝、观测漂移及unit成功不代表发布成功。项目测试未运行，仅静态语法/差异审阅。Runtime/Ops owner、12上下文依赖图/SCC/债务/scanner基线与固定17+Manifest/旧guard均不变，未重跑scanner。原status字段保留，新字段兼容增加，无已安装消费者或双写。详细范围/缺口见[联合状态查询](Runtime最小更新执行器实现方案.md)。完整异步贯通、SQL/回退、安装/Mac入口、真实隔离与生产发布仍OPEN，联合状态批已由[PR #2990](https://github.com/sanqin888/sanqinMVP/pull/2990) 最终head `9737d0e338719cfbbb1017c2c3fc93615ddd6f87` 经 [CI #7662](https://github.com/sanqin888/sanqinMVP/actions/runs/40443398580) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各264、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `efc0afebe595a760471f561012ae320e431da913`。其原LOCAL/未运行为审阅时点，仍未安装或现场验收。

## 2026-10-26 — 最小更新执行器第二批续作：成功交接与受控清标记

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，前批PR #2988最终head6ca86a55 / CI #7658成功合并dev `d87c98b50582fc2ff58165921926433d4710776b`（原记录就地更新，首次CI缺COMPOSE夹具只补路径修复），新建 `feat/runtime-minimal-success-handoff-20261026`。新增内部finalize_candidates：原锁/私有READY计划重核，先FINALIZING，复用原atomic_write只换.env SHA并保留字节/LF或CRLF/uid/gid/mode，文件最终元数据与目录fsync/读回；目标readiness和资源复核后原state writer提交唯一ACTIVE，耐久读回后逐角色恢复保存原策略/次数并核验，HANDOFF_COMMITTED持久后最后clear/fsync/空目录读回。中途失败只停保存ID并保留实际state/INCIDENT，不把已写ACTIVE抹回旧版本或伪造PENDING；封口未知不重写marker，末尾clear未知可能已完成/营业，不重建marker、重放或自动回退。八helper+原drop-in待统一验真安装，task只检查API未接finalize，无第二发布权威。新增21项临时私有文件/观察替身离线方法未运行，仅Python3.10 grammar AST/保留方法名/静态名字/差异/导入/引用审阅，五文档同步，详见[成功顺序和终结未知](Runtime最小更新执行器实现方案.md)。Runtime/Ops内部单向兼容新增，v2扩阶段/完整ID约束，无跨上下文owner/环/SCC/债务/scanner基线、依赖包/CI/Prisma/迁移、17成员/Manifest或旧guard变化，未重跑scanner。异步任务贯通/联合status、准确SQL/回退、安装/Mac入口、隔离/恢复与真实发布仍OPEN；无真实Docker/HTTP/SQL/AWS或生产安装，三组研究暂停保留。本批随后由[PR #2989](https://github.com/sanqin888/sanqinMVP/pull/2989) 最终head `22b6f0f88e5a1247320f33c6cac206654137726d` 经 [CI #7660](https://github.com/sanqin888/sanqinMVP/actions/runs/40433850020) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10下Release各255、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `3391cf495dd9bbb4d56d2ae46648d75c6e2f44b1`。前述本地未运行/未推送为原审阅时点；CI不等于隔离或生产验收。

## 2026-10-26 — 最小更新执行器第二批续作：准确ID启动与就绪验证

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，前批PR #2987最终head fb9949e5 / CI #7655成功合并dev `067521149fd9104303f09d4c057b4277a489a2cd`，无修复，原记录就地更新；新建 `feat/runtime-minimal-start-readiness-20261026`。新增内部start_candidates阶段：同一job/计划锁内核计划/attempt/无SQL/pending/原.env配置/Manifest/运行合同/历史/备份/准确证明/镜像/挂载/DB/门禁，先持久STARTING再只start保存三ID；90s预算轮询同一身份/健康，执行固定readiness并再核，才写READY。候选仍no-restart，PENDING/原.env/维护不改；启动可能写业务，READY不等于ACTIVE或旧盘恢复许可。失败复用guard原锁内incident收尾，确认不了FENCE_UNCONFIRMED；最终READY同步未知只尽力停保存ID、不重写记录。v2阶段兼容新增，完整三ID不可替换；task仅检查新API未接start。七helper+原三drop-in待统一安装，不进17 Bundle，无第二控制器/发布权威。新增17项临时文件/Docker/PID1/HTTP替身离线方法未运行，仅Python3.10 grammar AST/保留方法名/静态名字/差异/导入/引用审阅，五文档同步，详见[当前启动阶段及缺口](Runtime最小更新执行器实现方案.md)。Runtime/Ops内部单向依赖，无跨上下文owner/环/SCC/债务/scanner基线、依赖包/CI/Prisma/迁移或17成员/旧guard变更，未重跑scanner。实际任务贯通、.env/ACTIVE/原策略和清标记、准确SQL、回退/隔离故障/安装/真实发布仍OPEN；无真实Docker/HTTP/SQL/AWS或生产安装，三组研究暂停保留。本批随后由[PR #2988](https://github.com/sanqin888/sanqinMVP/pull/2988) 最终head `6ca86a55d1aadef814f37d97d9f999212f55608f` 经 [CI #7658](https://github.com/sanqin888/sanqinMVP/actions/runs/40427556642) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各234、Runtime1080、准确CPython3.12.15回归412），合并dev `d87c98b50582fc2ff58165921926433d4710776b`。首次CI #7657因测试controller夹具缺COMPOSE使两项绑定测试报错，仅补一条路径后通过；生产逻辑/门禁不改。前述未运行/未提交限原审阅时点，本地仍未执行项目测试，CI不等于现场通过。

## 2026-10-26 — 最小更新执行器第二批续作：锁内候选创建与登记

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，前批PR #2986最终head 1d5d19a1 / CI #7653成功合并dev `d133e92eef9f76faeb8af8f1272e84eafaf02152`，无修复，原记录就地更新；新建 `feat/runtime-minimal-create-candidates-20261026`。guard新增无迁移create-only内部编排，提取同实现的begin/register锁内函数，让原job/计划锁贯穿真实基线/历史/备份/准确证明/缓存镜像核验、意图、唯一PENDING、三应用create、DB/挂载核验和ID登记。完整私有stdin配置仅三服务、固定digest/no-restart，无DB/依赖/命名卷，引用已有external网络；固定no-build/pull-never/串行/180s，不start/SQL/改.env/ACTIVE/恢复或清标记，未知不重放。collector扩有界私有stdin，既有controller加state目录fsync/读回的PENDING方法，task补API检查，无新helper/权威/反向依赖。新增14项Docker/PID1替身与临时文件离线方法，未运行项目测试；仅Python3.10 grammar AST/保留方法名/差异/导入/引用静态审阅。五文档同步，详见[创建实现和剩余执行](Runtime最小更新执行器实现方案.md)。Runtime/Ops普通兼容新增，无跨上下文owner/环/SCC/债务/scanner基线、依赖包/CI/Prisma/业务迁移变化，未重跑scanner。本批确实修改17成员内deploy_release源码，成员集合/Manifest/旧guard不变，须新正式Bundle验真安装，不覆写现役文件。任务/CLI未接create，start/readiness/ACTIVE/策略交接、准确SQL、隔离故障/安装仍OPEN；没有真实Docker/SQL/AWS/生产安装，三组研究暂停保留。本批随后由[PR #2987](https://github.com/sanqin888/sanqinMVP/pull/2987) 最终head `fb9949e54db8de90f7464fc43585187d1bd8b52e` 经 [CI #7655](https://github.com/sanqin888/sanqinMVP/actions/runs/40419873594) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各217、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `067521149fd9104303f09d4c057b4277a489a2cd`。前述未运行/未提交限原本地审阅时点，本地仍未执行项目测试；源码/CI不等于现场或生产通过。

## 2026-10-26 — 最小更新执行器第二批续作：创建前意图与登记接线

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，前批PR #2985最终head 2e95f410 / CI #7651成功合并dev `830c41a36e06d2dd8a9756ae60f5cf3d6f2cf7d9`（原记录就地更新，首次CI夹具修复证据保留），新建 `feat/runtime-minimal-creation-intent-20261026`。原guard内补begin_candidate_creation：同一v1/FROZEN计划/attempt、已停原ID/完整角色列表/门禁/备份核对后，先将准确候选与空ID表持久为v2/CREATING_CANDIDATES；原登记入口只接受此同一意图且原计划证明未变，不允许FROZEN直接登记、部分ID、换目标、重放或降级。创建不完整或空ID事故收尾只尝试停保存原ID，固定FENCE_UNCONFIRMED，不猜/停未登记对象或恢复业务。task补API一致检查；没有新helper、unit、任务数据库、发布状态权威或依赖边。新增13项临时私有目录/观察替身离线方法，原16项fixture接入创建前意图；项目测试未运行，仅Python3.10 grammar AST/保留方法名/差异/导入/引用静态审阅，五文档同步，详见[实现与缺口](Runtime最小更新执行器实现方案.md)。普通兼容扩展、无已安装消费者/双写；无跨上下文owner/环/SCC/债务/scanner基线、依赖包/CI/Prisma/迁移/17 Bundle/旧guard改变，未重跑scanner。实际create配置、贯穿执行锁、SQL批准/执行、PENDING/ACTIVE/策略恢复与真实故障/安装均OPEN；未创建/启动真实容器、执行SQL/AWS或生产安装，三组研究暂停保留。本批随后由[PR #2986](https://github.com/sanqin888/sanqinMVP/pull/2986) 最终head `1d5d19a12a7fa3abdcf902a7464c753c513c0a85` 经 [CI #7653](https://github.com/sanqin888/sanqinMVP/actions/runs/40400151439) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各203、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `d133e92eef9f76faeb8af8f1272e84eafaf02152`。前述未运行/未提交限原本地审阅时点，本地仍未执行项目测试；源码/CI不代表现场验收或发布资格。

## 2026-10-26 — 最小更新执行器第二批续作：候选身份登记与异常停写

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，前批PR #2984最终head cb7242bb / CI #7648成功合并dev `fabaa9a0f532528f02381896860aeaf8906b03bf`（下条原记录就地更新），新建 `feat/runtime-minimal-candidate-writers-20261026`。原maintenance_guard内新增同一计划/attempt的内部登记：三候选必须created/no-restart、准确角色/项目/digest/revision/image-id、API/worker同image、新旧六ID不同；完整有界角色列表只容许原/新对象，原对象已删须列表证明。单份marker从v1/FROZEN单向升级v2/CANDIDATES_REGISTERED并fsync/读回后再核，不重放或替换。异常收尾优先停登记候选再停原ID，已删原对象需完整列表确认；成功结果也不恢复/清标记，未知替换/停服失败记FENCE_UNCONFIRMED。task加接口检查及六ID收尾900s预算，仍用原锁/目录/发布权威，无新helper/任务数据库或第二控制器。新增16项临时私有目录/观察替身离线测试未运行，仅Python3.10 grammar AST/保留方法名/差异/导入/引用静态审阅，五文档同步，详见[当前实现与接线缺口](Runtime最小更新执行器实现方案.md)。普通兼容新增、无安装消费者，v1可读/v2不可降级；无跨上下文owner/环/SCC/债务/scanner基线、依赖包/CI/Prisma/迁移/17 Bundle/旧guard变更，未重跑scanner。未接create/apply/SQL授权/ACTIVE/策略恢复，创建前意图/部分创建恢复、真实故障与安装过渡仍OPEN；没有任何生产容器/systemd/SQL/AWS操作，三组研究暂停保留。本批随后由[PR #2985](https://github.com/sanqin888/sanqinMVP/pull/2985) 最终head `2e95f410d003cde732369104e57a3605e0653751` 经 [CI #7651](https://github.com/sanqin888/sanqinMVP/actions/runs/40398932645) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各191、Runtime1080、准确CPython3.12.15回归412），合并dev `830c41a36e06d2dd8a9756ae60f5cf3d6f2cf7d9`。首次CI #7650因坏镜像测试仍传布尔值而替身已按字符串分类失败；同分支只改测试为明确digest/revision负例后通过，不改生产逻辑或CI。前述未运行/未推送仅限原本地审阅时点，本地仍未执行项目测试，CI不代表现场验收。

## 2026-10-26 — 最小更新执行器第二批续作：独立任务与异常收尾

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，前批PR #2983测试helper最小修复后，以最终head b94f1f9d / CI #7646成功合并dev `0d16673aa8a56f024cc79bcba235333c867aa8d1`（原记录就地更新），创建 `feat/runtime-minimal-transient-task-20261026`。新增release_task，固定root路径/plan-id的systemd oneshot/no-block/Restart=no/受限资源与cwd，ExecStopPost仅处理同一维护记录；核对实际unit/PID/cgroup/命令角色后运行既有freeze或异常收尾，不信任caller布尔/环境自报。SSH断线不绑定主进程，未知提交不重试；查询组合unit/维护记录，日志只读最近80行。收尾仅保存的三ID关闭重启/停止并读回，确认后也保留INCIDENT/TASK_FAILED_WRITERS_STOPPED；未知保留FENCE_UNCONFIRMED，不开业务/改选目标/执行SQL/清标记。复用store维护FD检查，让新预检在维护证据前拒绝，原锁默认不等待，仅收尾有界10s；不新增任务数据库或发布状态权威。新增21项离线方法（task19/job2），仅临时文件和管理器/Docker替身，AST/保留方法名/差异/导入/引用静态审阅；本地未执行项目测试/新CI。五文档同步，详情见[当前实现与真实验收缺口](Runtime最小更新执行器实现方案.md)。普通兼容新增，无已安装消费者/双写收缩；Runtime/Ops内部单向依赖，无跨上下文owner/SCC/债务/scanner基线、依赖包/CI/Prisma/迁移/17 Bundle/旧发布入口变化，未重跑scanner。没有生产/systemd/Docker/SQL/AWS执行或安装；apply/新候选登记/ACTIVE/策略恢复、真实SIGKILL与过渡仍OPEN，三组研究暂停保留。本批随后由[PR #2984](https://github.com/sanqin888/sanqinMVP/pull/2984) 最终head `cb7242bb0af4c8d06c093642a81e2df6844447ad` 经 [CI #7648](https://github.com/sanqin888/sanqinMVP/actions/runs/40395107992) SUCCESS（4成功/6范围跳过，默认Python和CPython3.10.22下Release各175、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `fabaa9a0f532528f02381896860aeaf8906b03bf`。前述未运行/无新CI仅限原本地审阅时点，本地仍未执行项目测试；源码/CI不等于PID1现场验收或生产许可。

## 2026-10-26 — 最小更新执行器第二批续作：维护准备与冷启动门禁

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，在PR #2982/CI #7643成功合并的dev `1fa7bb2153dd3fdd7443612949ae542998e317cd` 上新建 `feat/runtime-minimal-maintenance-guard-20261026`，原记录就地更新CI证据。新增maintenance_guard及Docker service/socket、backup service三份drop-in模板，先核对安装/有效unit/no-live-restore/无Swarm，再锁内重核同一计划与原容器ID/image/restart/备份状态，持久ARMED后仅三应用no-restart/正常停服及读回才记FROZEN；失败尽力停保存的准确ID、保留INCIDENT/FENCE_UNCONFIRMED，无finally启动、策略恢复或清标记。startup只读检查任意维护记录/残件则拒绝daemon/backup启动；timer状态保留不修改。CLI仅check-startup/status，停写adapter未接旧发布CLI/真实执行器。新增20项离线测试（临时私有目录、Docker/systemctl替身），仅Python3.10 grammar AST、模板/导入/差异/引用静态审阅，未运行项目测试/新CI；五文档同步，详情见[当前实现与未完成故障项](Runtime最小更新执行器实现方案.md)。Runtime/Ops内部单向新增，无跨上下文owner/环/SCC/债务/scanner基线、兼容双写、包依赖/CI/Prisma/迁移/17 Bundle/旧guard变化，未重跑scanner。新权限/目录/unit均只是待安装源码，未对生产Docker/systemd/SQL/AWS/文件执行操作；第一批现场、第二批ExecStopPost/SIGKILL/新候选身份/apply/ACTIVE及第三批过渡仍OPEN，三组研究暂停保留。本批随后经 [PR #2983](https://github.com/sanqin888/sanqinMVP/pull/2983) 最终head b94f1f9d4f65885a01397c099ff2bdde67804bba / [CI #7646](https://github.com/sanqin888/sanqinMVP/actions/runs/40387127782) SUCCESS（4成功/6范围跳过，默认/3.10.22 Release各154、Runtime1080、准确3.12.15回归412）合并dev0d16673aa8a56f024cc79bcba235333c867aa8d1。CI #7645首次因测试helper覆盖unittest.TestCase.run失败，仅改两处helper及引用为observe_command后通过，未改维护逻辑/CI门禁。上述未运行/无新CI限原本地时点，本地仍未执行项目测试；不将CI、模拟或标记存在推断为生产已停写。

## 2026-10-26 — 最小更新执行器第二批起步：只读任务锁与准确计划重核

**MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“提交远端，合并后开始下一步”，前批PR #2981最终head e584be77/CI #7641全部10作业成功后合并dev `2b8677c6314843fe5746fa96170f630e1b43ab46`（证据就地更新下条原记录），从最新基线新建 `feat/runtime-minimal-job-precheck-20261026`。新增release_job，固定root私有jobs目录/记录与非阻塞任务锁，先持久化REVALIDATING意图，再持原计划资源锁核验同一plan-id/目标及全部观察，READY/BLOCKED只代表只读预检；新collector缓存只验选项拒绝缺失digest，不再pull/build。create-only尝试、阶段原子replace及文件/目录fsync/读回、残件/未知/未完结阻断，不从PID/SSH断线自动恢复；只允许准确attempt-id确认放弃READ-ONLY观察，不触碰维护/业务事故或执行型记录。记录始终canExecute=false，不写current/previous。新增23项离线方法（job21/collector2），仅临时文件及观察替身；本地仅Python3.10 grammar AST、导入/差异/引用静态审阅，未运行测试/新CI，无生产操作。详见[当前实现/固定权限和剩余验收](Runtime最小更新执行器实现方案.md)。五文档同批同步；Runtime/Ops内部单向依赖，无跨上下文owner/SCC/债务/scanner基线、兼容双写、包依赖/CI/Prisma/迁移/17 Bundle/旧guard变化。未接apply、迁移、systemd/Mac/启动门禁/生产目录安装；第一批现场及第二批执行缺口均OPEN，三组研究暂停保留。本批后由 [PR #2982](https://github.com/sanqin888/sanqinMVP/pull/2982) 最终head00bfc51961382c14148b6d35ae5fabe837050670，经 [CI #7643](https://github.com/sanqin888/sanqinMVP/actions/runs/40381159117) SUCCESS（4成功/6范围跳过，默认/3.10.22 Release各134、Runtime1080、准确3.12.15回归412，无修复）合并dev1fa7bb2153dd3fdd7443612949ae542998e317cd；前述“未运行/无新CI”限原本地时点，本地仍未执行项目测试。仍需受控执行/隔离故障验证，未部署生产。

## 2026-10-26 — 最小更新执行器第一批续作：真实观察与计划保存

**MERGED_DEV / SOURCE_CI_VERIFIED / BATCH1_OPEN / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**按用户“开始下一步”，基于 PR #2980 最终head8da416499add108bee4b4586ce6eb53a1aef980a / [CI #7639](https://github.com/sanqin888/sanqinMVP/actions/runs/40370911563) SUCCESS（Release69/Runtime1080/准确3.12.15回归412，4成功/6范围跳过）合并的 dev `7bb83d20808155c6056d7b1b5eb9bbe52e983e0a`，在原第一批内补 collect_deployment_plan 和 deployment_plan_store：复用当前17+Manifest/挂载校验，观察原配置/状态、真实当前 image ID/成对digest和准确目标，按digest缓存候选，仅隔离运行有资源上限的Node SQL原bytes清单，绑定commit/tree，固定READ ONLY事务读取迁移历史，校验原gzip备份和前后漂移。CLI只有REVIEW_ONLY prepare/show、固定canExecute=false；预装root私有目录内create-only保存、双fsync/读回/残件保留和非阻塞采集锁，不写current/previous。新增42个离线测试方法（采集26/存储16），CI显式设置Node20执行SQL fixture、补3.10 Release回归，原Release/Runtime/准确3.12.15不变；旧控制器两项Docker校验仅增可选observe适配器，新采集统一命令边界，旧入口默认行为不变。本地仅Python3.10 grammar AST、内嵌Node/YAML语法、导入/差异/引用静态审阅；随后 [PR #2981](https://github.com/sanqin888/sanqinMVP/pull/2981) 最终head e584be778a238cd53f862dc7d14d8b00408d54e7，经 [CI #7641](https://github.com/sanqin888/sanqinMVP/actions/runs/40377187532) 10/10 SUCCESS，Release111在默认Python和CPython3.10.22下各通过，Runtime1080/准确3.12.15回归412通过，无修复，合并dev2b8677c6314843fe5746fa96170f630e1b43ab46。本地未执行项目测试或生产采集。普通兼容新增、计划v1不变；Runtime/Ops内部单向边，未改跨上下文owner/SCC/债务/scanner基线、依赖/锁文件/Prisma/迁移、17 Bundle/旧guard/发布状态权威；无Docker/systemd/目录安装/数据库/AWS/生产动作，三组研究暂停保留。[实现边界与剩余工作](Runtime最小更新执行器实现方案.md)及owner/手册/依赖图同批同步。分支 `feat/runtime-minimal-plan-collector-20261026` 已按上述PR合并；第一批仍待实际平台/交付合同和隔离采集证据，不自动进入生产或恢复研究。

**本批实际 CI 续记（最小执行器第一步，同批记录）：**[PR #2980](https://github.com/sanqin888/sanqinMVP/pull/2980) 源码head c26c643cd7fd309e28a3d6cff9cf70a8b769178a 的 [CI #7638](https://github.com/sanqin888/sanqinMVP/actions/runs/40370375474) SUCCESS，Release69（含新增24）/Runtime1080/准确CPython3.12.15回归412通过，4成功/6按范围跳过，无源码修复。SOURCE_CI_VERIFIED，第一批仍OPEN，最终head检查/合并以PR事件为准；本条为下方“只读候选与计划合同”原批的验证阶段续记，不增加实施批次。本地未运行项目测试，未进行生产操作。

## 2026-10-26 — 最小更新执行器第一步：只读候选与计划合同

**SOURCE_CONTRACT_LOCAL / TESTS_NOT_RUN / BATCH1_OPEN / PRODUCTION_NOT_AUTHORIZED。**按用户“合并后开始本项目第一步”，基于方案 PR #2979 最终 head ef63d474 / CI #7636 SUCCESS 合并的准确 dev `bd9f254e8a8dc503a26b0835119da02c09f4281e` 开始源码。现有 release_contract 新增 exact main SHA/配对 seal/发布 run/最新 main push CI/祖先关系只读核验，新增 deployment_plan 纯合同与24项负例/正例测试，固定运行对象原bytes、SQL inventory/源树绑定、迁移历史/pending、备份26h/环境键、canonical原件和独立plan-id；始终canExecute=false，变更观察必须重做计划。详情见[实现方案当前状态](Runtime最小更新执行器实现方案.md)。旧deploy/rollback/CLI、250/300guard、17 Bundle/Manifest、current/previous权威不变；未接真实采集、计划持久化、Docker/SQL/Host执行或重启门禁，第一批不关闭。Runtime/Ops内新增计划→发布合同单向边，无跨上下文owner/SCC/债务/scanner基线、依赖/锁文件/CI/Prisma/迁移/生产变化；三组研究暂停保留。本地仅Python3.10 grammar AST、差异/导入/链接静态审阅，24项项目测试未执行、无本批源码CI，不把语法检查当3.10运行兼容。分支 `feat/runtime-minimal-executor-plan-contract-20261026`，未提交/推送本批。下一步先用户审阅/授权远端，以实际Release/Runtime CI核验；随后在原第一批内补真实只读采集/计划展示保存与所选系统Python回归，不恢复暂停研究或直接发布生产。

## 2026-10-26 — 最小更新执行器实现方案

**MERGED_DEV / CI_VERIFIED_DOCS / EXECUTOR_NOT_IMPLEMENTED_AT_PLAN_DELIVERY / PRODUCTION_NOT_AUTHORIZED。**方案 [PR #2979](https://github.com/sanqin888/sanqinMVP/pull/2979) 最终 head `ef63d474689e4b3709871764cd6396dfc3d24162` 经 [CI #7636](https://github.com/sanqin888/sanqinMVP/actions/runs/40364596712) SUCCESS（1 成功/9 按文档范围跳过），完整5份文档合并 dev `bd9f254e8a8dc503a26b0835119da02c09f4281e`；下文“本批未提交/推送”按方案制作时点保留。按用户“提交远端，合并后制作实现方案”的授权，在 PR #2978 成功合并 dev `343fefc7dce5849ca3401981ee6174f4f9d2ec59` 后，重新审阅现有 release/Compose/readiness/CI，新增[最小执行器实现方案](Runtime最小更新执行器实现方案.md)：固定范围与准确计划/迁移 SQL/运行合同、单一发布控制器、机内 transient job/本地重启门禁、薄 SSH 入口与一次性受审阅 installer，分四批明确退出条件和最终现场完结矩阵；明确候选启动可能已写入，失败不盲目恢复整盘。同步优先级 owner、发布手册、依赖图及本日志；C1/CPython/R2 三组暂停、不取消。只有文档，Runtime/Ops owner/依赖图/债务/scanner基线、兼容读写、17 Bundle/Manifest、源码/CI/依赖/权限/schema/migration、Host/AWS/生产均未变。仅文档差异/新增链接/范围静态审阅，MCP-workspace 未运行 lint/build/test，无本批新CI或现场验收；分支 `docs/runtime-minimal-executor-implementation-plan-20261026`，本批未提交/推送。下一步用户审阅方案后，再明确第一批源码范围和外置件/权限合同；不自动开始代码或恢复暂停研究。

## 2026-10-26 — Runtime 最小更新执行器优先与三组研究暂停保留

**MERGED_DEV / CI_VERIFIED_DOCS / PAUSED_NOT_CANCELLED / MINIMAL_EXECUTOR_IMPLEMENTATION_NOT_STARTED / PRODUCTION_NOT_AUTHORIZED。**[PR #2978](https://github.com/sanqin888/sanqinMVP/pull/2978) 最终 head `d2a739ecf36610fddf80564a26d52d25c053579c` 经 [CI #7633](https://github.com/sanqin888/sanqinMVP/actions/runs/40360253396) SUCCESS（1 成功/9 按范围跳过，无修复），合并 dev `343fefc7dce5849ca3401981ee6174f4f9d2ec59`；旧批“未推送/无本批CI/下一步”均为实施审阅时点。基于准确 `origin/dev@29004f5b277803b7b4ff597b4456d4b748e4f6f4`（已合并 C1 F4-B13 / PR #2977），按用户对 Runtime 重新评估报告的决定，新增[最小更新执行器与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)，同步 AGENTS、R0/G2、安装约束、AWS/发布手册、C1/P10-F/CPython PREP-12、R2 阶段与 B1 审计、依赖图说明。明确 C1 来源/输入固定/受保护加载、自建 CPython3.12.15/完整依赖证明、R2 离机 CAS/CA/CRL/Enrollment/可信时间/跨克隆工作先暂停、不取消；原代码/测试/安装与证据保留，正常代码更新恢复后复审继续。当前先交付 MacBook/SSH 预检/确认两步、应用与平台维护分离的最小执行器；原安全路线 OPEN/NO-GO 不改为 PASS，现役 guard 与数据保护不解除。Runtime/Ops owner、依赖边/SCC/债务/scanner基线、兼容读写、17 Bundle/Manifest、代码/CI/依赖/锁文件/Prisma/迁移及所有 Host/云/生产状态均无变化。本批仅文档差异/链接/状态静态审阅，MCP-workspace 未运行 lint/build/test，无本批 CI、真实发布或恢复验收；分支 `docs/runtime-minimal-executor-priority-20261026`，未推送/PR。下一步先完成本批用户审阅与远端交付，再另行开展最小执行器源码工作；不自动恢复暂停研究或进行生产动作。

## 2026-10-26 — C1 P10-F4-B13 保持安装只读检查作用域

**2026-10-26 F4-B13：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / HELD_READONLY_REVIEW_ONLY / C1_OPEN。** 基于dev61bb0e48（F4-B12 PR #2976经CI #7629 docs-only成功，无修复），新增[保持安装只读检查作用域](Runtime更新-C1-P10-F4B13保持安装只读检查作用域.md)：F2/F3有限成员和固定祖先FD保持至consumer退出，显式重检原bytes/元数据/路径边；深副本非授权报告、scope失效/原进程线程约束。旧公开报告接口复用单一实现，B3两处私有三元组解包原子更新；异常/中断保留原因，正常关闭或退出复核失败传播。新增22项测试，5份Python仅静态AST/生命周期/差异审阅，未执行项目测试/新CI。5文档同步及B12结果就地归档，无全局锁/消费/Flow或loader扩展，无owner/依赖图/债务/scanner基线、包依赖/迁移、R2/root/VM/云/生产变化；未推送。

## 2026-10-26 — C1 P10-F4-B12 检查至消费持有期与锁合同

**2026-10-26 F4-B12：MERGED_DEV / CI_VERIFIED_DOCS / CONTRACT_AUDIT_COMPLETE / REAL_ADMISSION_NOT_IMPLEMENTED / C1_OPEN。** [PR #2976](https://github.com/sanqin888/sanqinMVP/pull/2976) 最终head08bcca56c18564b6af85f806869a9cff387f5d96经 [CI #7629](https://github.com/sanqin888/sanqinMVP/actions/runs/40340308379) 成功，docs-only 1成功/9按范围跳过，无修复；合并dev61bb0e484f0748646ac5740bb2d69d31c85b07e4。五份文档明确[检查至消费持有期与锁合同](Runtime更新-C1-P10-F4B12检查至消费持有期与锁合同.md)：F2/F3返回前关闭FD、消费独立取锁；一次锁/动作前重检及HANDOFF交接，旧.handoff.lock与normal-update.lock不同，发布检查8个新增项目依赖及sys.path副作用仍阻止直接扩loader。完整保留R2 #2975，归档B11实际CI；无源码/依赖/迁移、owner/依赖图/债务/scanner基线或生产变化，未运行新Runtime测试。

## 2026-10-26 — Runtime R2 阶段基线复审与 B1 双层撤销实施前置审计

**状态：DOCUMENTS_LOCAL / READ_ONLY_B1_AUDIT_COMPLETE / IMPLEMENTATION_NOT_AUTHORIZED / C1_OPEN / R2-C4_OPEN / P1_DENY / PRODUCTION_NO-GO。** 基于已合并的准确 `origin/dev@003daa21dc0795ec092cac20502e0d9c2918f7aa`（C1 F4-B11 PR #2974、dev CI #7626 SUCCESS 的离线验证）更新 [R2阶段审计与B1—B6路线](Runtime更新-R2阶段审计与B1实施路线-20261026.md)，并形成 [R2-B1 可信身份与双层撤销实施前置审计](Runtime更新-R2-B1可信身份与双层撤销实施前置审计-20261026.md)：按 B9-DECISION D01—D08/T01—T08 核对现有 `maintenance_*` 源码的正式 Anchor、CA/完整 CRL 发行总账、Enrollment 角色/证书 pin、可信时间/单调 generation、F 前后的 in-flight COMMIT、UNKNOWN 恢复。静态发现仓库服务没有完整 CRL 加载/检查，CAS v1 没有撤销 generation/持久联动，Boot Guard 仍拒绝放行；保留 B10 TLS_ONLY 限域证据，未把它升级为 CAS 通过。此批仅新建两份文档、更新 R0 索引并追加该工作日志，原 Runtime/Ops owner、依赖图、17 Bundle、P1/Wire/CAS schema、CI、Prisma/锁文件、任何 Host/证书/VM/AWS/生产状态均不变；本地未执行测试、未提交/推远端。下一步先审 B1-0/B1-1 的授权边界和身份发行/审批/版本权威，禁止越级实施。

## 2026-10-26 — R2-A2-3 P2-C3C3 B10 TLS_ONLY 负例矩阵限域收口

**B10 TLS_ONLY：FIELD_RECEIPT_CLOSED_PASS_SCOPED / FORMAL_CAS_NOT_RUN / P1_DENY / PRODUCTION_NO-GO。** [B10 TLS_ONLY 安全负例证据收口](Runtime更新-R2-A2-3-P2-C3C3-B10-TLS_ONLY安全负例证据收口.md)按操作者 Mac/Ubuntu 双端回执收口：B10-0 原实验 CA/leaf pin、TLS1.2、两端证书有效与端口预检；B10-A 无 SAN `VERIFY_CODE=64`；B10-B 尚未生效 `VERIFY_CODE=9`；B10-C TLS1.0/1.1 两次协议拒绝；B10-D 两种非白名单 CBC Cipher 因 `NO_SHARED_CIPHER` 2/2 拒绝，全部停止后 Mac 39443 无监听。本批仅新增证据文档并链接 IMPLEMENT-A，不修改 Runtime 源码、17 Bundle、CI、CRL/Enrollment/SQLite、私钥/证书、Guard、VM/AWS/生产，也未重新运行网络测试；正式 Anchor、B1 fence、CRL、CAS 与 P1 仍独立 BLOCKED/NO-GO。

## 2026-10-26 — C1 P10-F4-B11受保护writer候选作用域

**2026-10-26 F4-B11：MERGED_DEV / CI_VERIFIED_OFFLINE / HELD_WRITER_ASSEMBLY_ONLY / C1_OPEN。** [PR #2974](https://github.com/sanqin888/sanqinMVP/pull/2974) 最终 head4485d9fdcec7663faca4f8fd30824378933d233f 基于 dev4f16dd27，经 [CI #7625](https://github.com/sanqin888/sanqinMVP/actions/runs/40329893226) 成功合并003daa21dc0795ec092cac20502e0d9c2918f7aa；ops job121596298756 实际 Release45、Runtime1058、准确CPython3.12.15回归390通过，含16新增测试。首次CI #7624的3项错误为0400测试材料直接覆盖在普通用户下失败，仅修正准备流程后恢复0400，生产实现不变。旧PR #2973关闭未合并，完整保留R2 #2972文档。本批[受保护writer候选作用域](Runtime更新-C1-P10-F4B11受保护writer候选作用域.md)固定三批准文件/独立双pin、原进程匹配、源码祖先/文件FD与私有模块scope至consumer退出；仅装配，无消费/Flow/实际效果许可。5文档同步，无owner/依赖图/债务/scanner基线、依赖/迁移或生产变化。

## 2026-10-26 — C1 P10-F4-B10 writer有限来源加载

**2026-10-26 F4-B10：MERGED_DEV / CI_VERIFIED_OFFLINE / WRITER_ASSEMBLY_ONLY / C1_OPEN。** [PR #2971](https://github.com/sanqin888/sanqinMVP/pull/2971)最终headb06c4fc386298c53ff4421529cf6f14ea7ecfe1d经[CI #7620](https://github.com/sanqin888/sanqinMVP/actions/runs/40327593654)成功（4成功/6跳过），合并dc195aba5e45d2053fda858507e9616add457902。Release45/Runtime1042/准确CPython3.12.15回归374全部通过，含16新增测试，无修复。固定八模块+未执行bootstrap私有加载及同组类型、旧三模块入口保持；5文档同步，无消费/Flow/依赖/迁移或生产变化；见[来源加载记录](Runtime更新-C1-P10-F4B10-writer有限来源加载.md)。

## 2026-10-26 — C1 P10-F4-B9可信组合与终结前置审阅

**2026-10-26 F4-B9：AUDIT_MERGED_DEV / REAL_ADMISSION_NOT_IMPLEMENTED / C1_OPEN。** [PR #2970](https://github.com/sanqin888/sanqinMVP/pull/2970)最终head64d0e59e8daf5bf45356ed0b3a179eba4943c793经[CI #7618](https://github.com/sanqin888/sanqinMVP/actions/runs/40326533121)成功（docs-only，1成功/9跳过）合并7516529d300e0b0ba848b0e13a84c62ae0b545fa，无修复。5文档核对来源/直接导入/同组类型/FD锁生命周期，未运行Runtime测试，无源码/schema/依赖/迁移或生产变化；见[组合审阅](Runtime更新-C1-P10-F4B9可信组合与终结前置审阅.md)。

## 2026-10-26 — C1 P10-F4-B8受限v2历史writer

**2026-10-26 F4-B8：MERGED_DEV / CI_VERIFIED_OFFLINE / LOCAL_CONSUMPTION_ONLY / C1_OPEN。** [PR #2969](https://github.com/sanqin888/sanqinMVP/pull/2969)最终head029ad1cad12a70e6d5a00b8ca57462f345b99ffe经[CI #7616](https://github.com/sanqin888/sanqinMVP/actions/runs/40324393082)成功（4成功/6跳过），合并77bf55ddbb273bdcb397cb030de6ca492e172059。Release45/Runtime1026/准确CPython3.12.15回归358全部通过，含16新增测试，无修复。空双布局首claim与同handle abort、create-only/文件及目录fsync/未知保留，无处置/第二笔准入/Flow；5文档同步，无依赖/迁移或生产变化；见[writer记录](Runtime更新-C1-P10-F4B8受限v2历史writer.md)。

## 2026-10-26 — C1 P10-F4-B7有界追加writer合同

**2026-10-26 F4-B7：CONTRACT_MERGED_DEV / WRITER_IMPLEMENTATION_SEPARATE / C1_OPEN。** [PR #2968](https://github.com/sanqin888/sanqinMVP/pull/2968)最终head76a756b4fa5b92392f2e0010a5674f47e500d539经[CI #7614](https://github.com/sanqin888/sanqinMVP/actions/runs/40323096587)成功（docs-only：1成功/9跳过）合并707749fd04837ce819f82fdea457dd9c2b074650，无修复。5份文档限定空双布局下首次claim/同handle abort及同步未知阻断；无writer源码/新schema/依赖/迁移/R2或生产操作；见[合同](Runtime更新-C1-P10-F4B7有界追加writer合同.md)。

## 2026-10-26 — C1 P10-F4-B6旧入口与双布局门禁

**2026-10-26 F4-B6：MERGED_DEV / CI_VERIFIED_OFFLINE / LEGACY_ENTRY_GATE_ONLY / C1_OPEN。** [PR #2967](https://github.com/sanqin888/sanqinMVP/pull/2967)最终headf7202f3641aaede69635d05ef5137b3d88356366经[CI #7612](https://github.com/sanqin888/sanqinMVP/actions/runs/40284643873)成功（4成功/6跳过），合并564f63d2f5a6f14454faa5c200c95cbbbf7ea73f。Release45/Runtime1010/准确CPython3.12.15回归342全部通过，含6新增测试，无修复。固定v2任意对象禁用旧v1入口并持有期复查，6文档同步，无writer/finalizer/依赖/迁移或生产变化；见[门禁记录](Runtime更新-C1-P10-F4B6旧入口与双布局门禁.md)。

## 2026-10-25 — C1 P10-F4-B5有界历史只读解释器

**F4-B5：MERGED_DEV / CI_VERIFIED_OFFLINE / HISTORY_STRUCTURE_ONLY / C1_OPEN。** [PR #2966](https://github.com/sanqin888/sanqinMVP/pull/2966)最终heade65ee0031a42e6e653c0394bb2c36b649752e5ef经[CI #7610](https://github.com/sanqin888/sanqinMVP/actions/runs/40274211158)成功合并ab49b2c82faaea25bd1b4c1b16794dae32da6e23；4成功/6跳过，Release45/Runtime1004/准确CPython3.12.15回归336通过，含31新增测试，无修复。固定双布局/共用锁下的有限事件只读解释器，处置声明未认证；v1只抽取共用scope，6文档同步，无writer/终结/依赖/迁移或生产变化。见[解释器记录](Runtime更新-C1-P10-F4B5有界历史只读解释器.md)。

## 2026-10-25 — C1 P10-F4-B4多事务历史与崩溃协议设计

**2026-10-25 F4-B4：DESIGN_MERGED_DEV / HISTORY_IMPLEMENTATION_SEPARATE / C1_OPEN。** [PR #2965](https://github.com/sanqin888/sanqinMVP/pull/2965)最终headca0f2f3df62dd9b5d1a1b96c8db7db3bfd2a17e1经[CI #7608](https://github.com/sanqin888/sanqinMVP/actions/runs/40236390823)成功（docs-only：1成功/9跳过）合并f7108a584e92bed7e55835663b7d5d4ae2edeba6，无修复，未运行Runtime测试。本批7份文档归档F4-B3并审阅[多事务历史与崩溃协议](Runtime更新-C1-P10-F4B4多事务历史与崩溃协议设计.md)：固定v2有界只追加、永久消费、双布局共同门禁及未知不放行；下一源码只读解释器。无history实现/schema、writer/finalizer、入口切换、R2/owner/基线/依赖/迁移或生产操作。

## 2026-10-25 — C1 P10-F4-B3安装后目标独立只读复验

**2026-10-25 F4-B3：MERGED_DEV / CI_VERIFIED_OFFLINE / READ_ONLY_POSTINSTALL_SCOPE / C1_OPEN。** 最终head39e98077583610a78416ec303c4589022d09a3c2由PR #2964经CI #7606（run40233916932）成功合并dev9434ab6956c9f3d0b8276b9beb26ac8707381bce：4作业成功/6按范围跳过，Release45/Runtime973/准确CPython3.12.15回归305全部通过，包含23新增测试。CI #7605的唯一失败是重排Manifest测试实际生成原样bytes；39e98077改用compact JSON并显式核对语义相同/字节不同，未改生产实现或削弱断言。 固定路径目标/原Manifest/17成员及原pin三动态文件只读核对，F2仅提取共用私有检查、原语义不变；历史观察不升级冻结基线，所有维护/终结/生产权限false。6文档同步，无owner/依赖图/基线/依赖/数据库或生产变化；见[安装后复验记录](Runtime更新-C1-P10-F4B3安装后目标只读复验.md)。

## 2026-10-25 — C1 P10-F4-B2终结与事故处置合同审阅

**2026-10-25 F4-B2：CONTRACT_REVIEW_MERGED_DEV / FINALIZER_NOT_IMPLEMENTED / C1_OPEN。** [PR #2963](https://github.com/sanqin888/sanqinMVP/pull/2963)最终head28a6478b10cf2ed6c29d8b3db0af97a7435fdf0a经[CI #7603](https://github.com/sanqin888/sanqinMVP/actions/runs/40232899946)成功（docs-only，1作业成功/9跳过）合并2240f5e0e0ec19faaf69f28deb2480b9edc116e6，无修复。本批6份文档归档F4-B1验收并完成[终结/事故处置合同审阅](Runtime更新-C1-P10-F4B2终结与事故处置合同审阅.md)：不能仅删active/靠Flow声明放行，需真实安装/保留状态/R2终态证据与多事务历史/崩溃协议；下一源码独立只读安装后复验。未运行Runtime测试，无代码/schema/依赖/数据库/owner/基线或生产变化。

## 2026-10-25 — C1 P10-F4-B1本机持久消费内核

**2026-10-25 F4-B1：MERGED_DEV / CI_VERIFIED_OFFLINE / LOCAL_CONSUMPTION_ONLY / C1_OPEN。** [PR #2962](https://github.com/sanqin888/sanqinMVP/pull/2962)最终head c55000c2862c0912a24371be4bb34f74f825ae25，经[CI #7601](https://github.com/sanqin888/sanqinMVP/actions/runs/40231097040)成功（4作业成功/6按范围跳过）合并e1b7d9ebd6daa8c1bad358e1caeae7371b5ac291。Release45、Runtime950、准确CPython3.12.15回归282全部通过，含30项新增真实FD/flock/独立进程测试，无CI修复。固定全安装锁、create-only claim/永久消费、abort与只读分类已通过离线回归；未接Flow/终结器/R2或生产效果。7文档同步，无owner/依赖图/基线/依赖/迁移变化；见[实现记录](Runtime更新-C1-P10-F4B1本机持久消费内核.md)。

## 2026-10-25 — C1 P10-F4-B一次性事务准入与全局锁设计


**2026-10-25 F4-B：DESIGN_MERGED_DEV / IMPLEMENTATION_SEPARATE / C1_OPEN。** 5份文档由[PR #2961](https://github.com/sanqin888/sanqinMVP/pull/2961)交付，最终head59248a3e经[CI #7599](https://github.com/sanqin888/sanqinMVP/actions/runs/40229924297)成功（docs-only：1作业成功、9跳过），合并99c79221，无CI修复。设计规定全安装锁与永久消费/未知claim，R2身份/epoch独立；本批无准入代码、root对象、依赖/迁移或生产操作。源码实施另见F4-B1批次。


## 2026-10-25 — C1 P10-F4-A FD安全非活跃准备


**2026-10-25 F4-A本地实施：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / INERT_PREPARATION_ONLY / C1_OPEN。** F4文档PR #2959经CI #7595（docs-only）合并daaf98cf；按用户授权新增固定root私有父目录、dir_fd/O_EXCL静态目标create-only准备库及20项聚焦测试，保存17+原Manifest/原Archive、文件与全部目录fsync/FD读回及失败残片。只生成被动内容证据，不能resume/消费事务或安装，动态配置不复制；namespace/当前安装/维护/Flow与执行权限false。见[F4-A实现](Runtime更新-C1-P10-F4A-FD安全非活跃准备.md)。本批未调用源码或创建真实目录，R2/九源/v1/17 Bundle不变，无依赖图/owner/基线/迁移变化；仅静态审阅，20项测试未运行，未推送。


## 2026-10-25 — C1 P10-F4事务准入与非活跃准备边界


**2026-10-25 P10-F4边界审计（本地）：BOUNDARY_AUDIT_COMPLETE_LOCAL / IMPLEMENTATION_NOT_STARTED / C1_OPEN。** F3 PR #2958最终CI #7593成功（Runtime900/Release45/准确3.12.15回归232），已合并64245335。下一步已核对既有prepare的路径写入/目录fsync缺口与R2 CAS职责，形成[事务准入及非活跃准备边界](Runtime更新-C1-P10-F4事务准入与非活跃准备边界.md)：建议先FD安全create-only准备，静态目标材料与冻结后的动态状态分开；ledger后续结合R2身份，不冒充维护CAS或新增第二套epoch。拟议固定目录未创建，未实施新写入或schema；无源码/依赖图/owner/基线/17 Bundle/依赖/迁移/生产变化。本批未运行项目测试/新CI，未推送。


## 2026-10-25 — C1 P10-F3固定Runtime路径只读锚点


**2026-10-25 P10-F3本地实施：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / FIXED_PATH_REVIEW_ONLY / C1_OPEN。** F2 PR #2957已由最终CI #7591成功（Runtime890/Release45/精确3.12.15回归222）合并63d44cb4，无需修复。本批新增固定/opt/sanq/runtime只读wrapper，复用既有祖先FD规则，持有路径scope内调用F2并退出复核；只新增点时绑定元数据，Host/namespace/维护/事务/Flow/权限仍未认证或false/BLOCKED。10项新测试已编写未运行，见[F3实现](Runtime更新-C1-P10-F3固定Runtime路径只读锚点.md)。无R2实现、原九源/v1/17 Bundle、依赖/数据库/生产变化；静态审阅，未推送。


## 2026-10-25 — C1 P10-F2来源与安装只读审阅


**2026-10-25 P10-F2本地实施：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / READONLY_REVIEW_ONLY / C1_OPEN。** P10-F1 PR #2956最终head4004fdb6经CI #7589（docs-only）合并9e0f4e87。本批新增外置只读review库及19项聚焦测试，复用目标newest发布校验，借入目录FD核对实际17+Manifest/三保留文件，按当前准确Git SHA源码+发布元数据认证旧摘要身份，不要求旧Archive bytes；保持所有安装/维护/事务权限false。FD不自证固定生产路径、容器/挂载未实测，故不作为正式VERIFY_SOURCE completion。见[F2实现与证据限制](Runtime更新-C1-P10-F2来源与安装只读准入.md)。原九源/输入/17 Bundle及R2实现不变，无依赖或数据库迁移；AST/差异静态审阅，未执行项目测试/真实现场核查，未推送。


## 2026-10-25 — C1 P10-F1完整候选装配就绪审计

**READINESS_AUDIT_COMPLETE_LOCAL / P10-F_OPEN / C1_OPEN。** 验收归档PR #2955经CI #7587十项成功合并7c368ca5；用户授权继续P10-F并另开R2。本批基于该dev核对固定九源/三模块loader与同组completion类型、12个能力方法的正式缺口、prepare默认newest和固定历史目标差异、持久准入/快照/安装边界，编制R2交接表与下一块来源/当前安装只读准入范围。没有新增纯内存流程或效果adapter，不改R2实现/9源/三输入/17 Bundle/原v1/依赖/业务/数据库，依赖图/owner/scanner基线不变。仅静态审阅，未运行项目测试/新CI或任何生产/AWS操作，无迁移；分支docs/c1-p10f-candidate-readiness-20261025，本地待审，未推送。详见[完整候选审计](Runtime更新-C1-P10-F完整候选装配就绪审计.md)。


## 2026-10-25 — C1同候选隔离负例验收归档

**ISOLATED_NEGATIVE_PASS_SCOPED / READ_ONLY_ACCEPTANCE_COMPLETE_SCOPED / C1_OPEN。** 用户授权归档run40210744043（dev@ecf8fc31，SUCCESS）的实际23项验收：2基线、2启动前拒绝、19 CLI RC2拒绝。已独立核对原ZIP SHA256 9392252c8eba14319ff56f621093b52363600bdb7c35128485634daacba3ad7d、69成员及23结果/raw输出；完整UTF-8原件与逐文件摘要归档JSON，GitHubartifact到期后仍可审阅。同步负例审计、C1总包/PREP-10、R0和依赖图：P10-E限定完成，P10-F/R2/R3/R4与最终C1仍OPEN。无源码/owner/依赖图/基线/17 Bundle/数据库变化，无新生产操作、无需迁移；仅静态核对，归档文档未运行新CI，未推送。详见[验收归档](evidence/c1-jammy-negative-acceptance-2026-10-25.md)。


## 2026-10-25 — C1隔离负例runner父目录准备修复

交付续记：PR #2954最终head ac7bbe34经CI #7585 SUCCESS（Runtime871/Release45/精确203）合并dev ecf8fc31；后续run40210744043的23项实际完成，见本卷最新归档。以下LOCAL/首跑失败为原修复审阅时点。

**FIX_IMPLEMENTED_LOCAL / LAB_FAILED_BEFORE_CASES / C1_OPEN。** 前批PR #2952/CI #7579十项通过并合并b9523cd3。首次手动run40209172466在dev@6d855c9f完成材料/依赖校验后因unsafe interpreter parent失败，23 case均未启动；无验收artifact。基于最新dev创建fix/c1-negative-runner-opt-20261025，只修改外部lab：guard之后将一次性runner /opt本身经无链接目录FD设置root:root/0755，保留原祖先拒绝，增加前后元数据及case前PREPARING诊断；不递归、不改9源/3输入/23断言/17 Bundle/业务或数据库。A类内部原子修复，无依赖图/基线变化，无迁移。静态审阅；项目测试与修复后lab未运行、未推送。详见[隔离负例审计第7节](Runtime更新-C1同候选隔离负例缺口审计.md)。


## 2026-10-25 — C1 Jammy同候选隔离负例工具与手动工作流

交付续记：PR #2952最终head 7cdd0189经CI #7579十项成功合并b9523cd3；首跑在case前失败后由PR #2954修复，23项验收证据见本卷最新归档。以下LOCAL/NOT_RUN为原实施审阅时点。

**2026-10-25 隔离负例工具实施（本地）：IMPLEMENTED_LOCAL / TESTS_NOT_RUN / LAB_NOT_RUN / C1_OPEN。**审计PR #2951已由CI #7577（docs-only）合并ff95601f。本批新增仅托管Jammy/dev手动可运行的外部lab工具、固定输入fixture、23个真实CLI/外层验收case及5个离线边界测试，复用构建run40192632845的准确Python产物，源码/双输入仍绑定711197d2。一次性runner可写其自己的root/prefix，禁止生产运行；不改9候选源码、17 Bundle、业务或数据库，无owner/依赖图/架构基线变化。AST/YAML/shell/独立输入摘要静态核对通过，未运行项目测试或lab、未推送。

## 2026-10-25 — C1同候选隔离负例缺口审计

**2026-10-25 同候选负例缺口审计（本地）：**前批PR #2950完整7文件已由最终CI #7575（docs-only）合并3b0d6cf5。已静态核对准确711197d2的8测试文件/203方法，含32个bootstrap方法；fixture模拟进程、根和owner，不替代真实Jammy CLI负例。已复用现有覆盖并限定预启动信任/进程/输入/支持源码/成员/权限/链接对象的最小隔离验收家族，建议下一批实现一次性Jammy负例harness及手动工作流；未编写harness、未执行lab或生产负例。无依赖图/owner/基线、9源码、17 Bundle或数据库变化。详见 [隔离负例审计](Runtime更新-C1同候选隔离负例缺口审计.md)。AUDIT_COMPLETE_LOCAL / LAB_NOT_RUN / C1_OPEN。

## 2026-10-25 — C1-PREP-12安装与同平台只读bootstrap验收收口

**2026-10-25 现场验收续记：PYTHON_INSTALLED_VERIFIED_SCOPED / READ_ONLY_BOOTSTRAP_PASS_SCOPED / C1_OPEN。** CPython3.12.15已在sanq-web准确prefix完成smoke及8368成员字节/权限验收；准确源码711197d2的九文件与三批准输入已root交付，事务c1-assembly-20261025-001得到CANDIDATE_ASSEMBLED / ASSEMBLY_ONLY / flowInvoked=false / 全部权限false / BLOCKED / RC0。GitHub构建run40192632845工具18/产物回归203通过；现场证据为操作者粘贴回执，非签名采集或助手独立执行。无目标Runtime安装、Flow、停服/AWS/数据库效果。详见 [安装与只读验收记录](evidence/c1-prep12-install-bootstrap-acceptance-2026-10-25.md)。下方LOCAL/NOT_RUN属于原实施时点，当前最高状态以本续记为准；仍缺同候选完整负例、R2/R3/R4效果组合及C1最终裁定。 本批基于dev@711197d2建立docs/runtime-c1-prep12-install-bootstrap-acceptance-20261025，新增完整范围化回执并同步PREP-12/PREP-10/C1/R0/依赖图；仅文档，无运行源码/17 Bundle/架构基线/数据库变化。本批静态审阅，未新增项目测试、未推送；下一步先文档交付，再审计同候选负例与完整效果候选缺口。

## 2026-10-25 — C1-PREP-12整体晋级与手动构建入口对齐

**IMPLEMENTED_LOCAL / CI_NOT_RUN / BUILD_NOT_RUN / C1_OPEN。** 用户选择整体dev→main方案，撤回未提交的dev push自动构建入口；基于PR #2947合并d2fe275d（CI #7566十项全绿及dev #7567成功），在现有本地分支保留仅workflow_dispatch，增加运行标题分支/完整SHA并说明main注册入口、手动选dev、核对准确运行及下载材料流程。记录整体晋级伴随main CI→API/Web镜像/Runtime Bundle自动发布、4份新增迁移及2个Bundle成员变化的审计范围；不等同生产部署许可。无依赖图、normal_runtime、构建工具算法、17 Bundle或数据库变化。YAML/shell/守卫与差异静态审阅完成，未运行项目测试/本批CI/构建、未提交远端或晋级main。详见 [PREP-12](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)。

## 2026-10-25 — C1-PREP-12 Python3.12.15可信构建与交付工具

**IMPLEMENTED_LOCAL / SOURCE_VERIFICATION_NOT_RUN / BUILD_NOT_RUN / CI_NOT_RUN / C1_OPEN。** 用户授权启动PREP-12修改，基于PREP-11 PR #2946最终CI #7563（十项全绿，Runtime848/Release45/精确3.12.15回归203）合并dev `bdfb25af7de88ecafbb17b1fda71b305e5cfd17c`，建立 `feat/runtime-c1-prep12-trusted-python-build-20261025`。已读AGENTS、R0/当前C1/PREP-12、旧Ubuntu来源链/采集器和相关CI。新增Runtime/Ops构建材料工具及18个离线测试方法，固定CPython3.12.15源包SHA256与Thomas Wouters完整主指纹，先验真后固定bytes安全解包；暂存成员、关键动态库字节与包归属、产物归档/日志/原始源签名材料及SHA256SUMS均保留审阅属性和false安装/执行权。新增仅workflow_dispatch/dev的Ubuntu22.04非root托管构建工作流，在一次性runner准备工具并用固定prefix与DESTDIR暂存，实际产物smoke/C1回归成功后才上传；无生产机root安装或系统Python替换。当前本地非已确认Jammy且无Docker，未通过MCP/缓存绕过项目执行限制；源包下载/验签/构建和新测试尚未执行。没有新增应用依赖/锁、17 Bundle/正常9源候选、生产入口、业务或数据库迁移变化；新工具/测试标准库关系均同owner，无跨上下文边/scanner baseline变化。静态AST/YAML/9段shell语法与差异已核对，首次远端交付待审，未推送；具体来源、流程和剩余安装门禁见 [PREP-12工作包](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)。

## 2026-10-24 — C1-PREP-11 实际平台身份与包元数据只读回执准备

**PR #2946 / SOURCE OPS VERIFIED / FINAL CI PENDING / INTERPRETER_PROVENANCE_OPEN / C1_OPEN。** 按PREP-10合并后继续授权，在PR #2944最终head `35e2150f3d13db0746b31f67a91df2d9b29050a2` 经 [CI #7558](https://github.com/sanqin888/sanqinMVP/actions/runs/40151007839) SUCCESS合并 `17188367684a155b7217881d695c8c615589e940` 后，新建 `docs/runtime-c1-prep11-platform-receipt-20261024`。准备 [选定AWS正常执行主机的5条非root只读查询与RC标记](Runtime更新-C1-PREP-11实际平台身份与包元数据只读回执.md)：uname、os-release、Python三包完整version/arch/status、解释器包归属和路径metadata；不先运行目标Python、不使用sudo或安装/修复。核对现有MCP的system_status仅时间/负载/内存/磁盘/服务，read_file限仓库、无目标查询接口，需操作者在该AWS终端回传原始stdout/stderr/RC；准备时现场尚未执行/收到，后续回执见同批续记。同步R0/C1总包/PREP-10最终交付/依赖图及原批日志。纯文档，无源码/依赖边/owner/兼容/scanner baseline、17 Bundle、依赖/锁/CI、数据库或权限变更；未运行项目test/scanner或现场/root/Host/Guest/AWS/生产命令，不需要迁移。首次审阅待用户批准，本批未推送；下一动作直接取得现场回执，按准确平台/revision复用既有来源证据，不再新增抽象准备作为读取前置。

**同批现场回执001续记：**用户回传P11-01～05格式化终端文本，RC0/0/1/1/1；[保留原样粘贴记录](evidence/c1-prep11-aws-platform-receipt-001-2026-10-24.md)，现场时间/原stdout-stderr文件未提供，不把重排文本当os-release原字节。观察 `sanq-web / Linux6.8.0-1061-aws / x86_64 / Ubuntu22.04.5 Jammy`，三个3.12包无匹配、`/usr/bin/python3.12`无归属且不存在。状态转为**FIRST RECEIPT RECEIVED / EXPECTED INTERPRETER PATH ABSENT / C1_PLATFORM_BLOCKED**；未据此断言全机没有其他3.12或系统Python具体版本。核对launch/process_check/bootstrap均固定3123与usr/bin路径及flags，保留原v1/guard；下一步只读查PATH中Python位置与系统包，平台方案变化按用户规则先审后授权。没有新增实施批次、运行代码/接口/依赖变更、主机安装/替换、目标Python执行或远端提交。

**同批现场回执002及平台方案：**用户回传P11-06～07，RC1/0；[原样格式化粘贴](evidence/c1-prep11-aws-platform-receipt-002-2026-10-24.md) 保留提示符/反斜杠/制表符，不冒充原始stdout。PATH列出python3及python3.10的usr/bin、bin路径，未列python3.12；版本化三个包均amd64 `3.10.12-1~22.04.18`、installed，通用包的3.10.6不等于解释器微版本，也未把四条路径当四套安装。源码核对发现process_check/bootstrap直接读取3.11起提供的safe_path，改用3.10需明确适配，不能只替换版本字符串或通用跳过缺项。P11 §8～9已说明launch/argv与canonical批准材料、双pins、bootstrap/进程核对、九源包及失败测试/同平台验证的影响，列出沿用系统维护构建、另备较新解释器、保持当前合同三方案。推荐当前Jammy以最小主机变更沿用系统候选，但上游3.10已于2026-10-01 EOL，Ubuntu22.04标准安全维护至2027年5月；官方USN-8744-1与revision字符串对应，不能当本机签名/成员字节或无漏洞证明。按用户冻结合同变更先审后授权规则，等待明确平台选择；原3.12.3/v1/guard和九源字节未改。本批仍仅文档，无项目测试或目标Python执行、主机安装/链接替换及远端提交。远端dev另有R2 PR #2945文档推进到 `32963a0c7ed093600aa91847d98204ede0795337`，未改本批规则/CI/源码；后续交付须保留该并行工作。

**同批3.12.15选择与变更审计：**用户明确采用Python3.12.15并要求审计，完成 [准确变更报告](Runtime更新-C1-PREP-11-Python31215变更审计.md)。复核远端dev仍为 `32963a0c`，根AGENTS/CI未变，按该提交读取9个C1运行源码与8个对应测试；必改launch/bootstrap两源码，process_check从document派生版本/路径无需算法改动，6个测试文件有版本或路径预期，source_loader旧token替换负例需防止空操作。现schema结构、owner/依赖、17 Bundle和全部guard保持，实施后必须重定九源、sourceCommit、launch/request/pins及新归档，旧PREP-10/R1-A/S5证据只按真实对象复用。3.12.15官方仅源码发布，建议独立版本目录与受控Jammy构建是待审具体交付方案，来源/产物/绝对路径尚未冻结；用户版本选择已定，无需重复确认，现源码仍为3.12.3。原CI联动Runtime/Release但不固定3.12.15，需后续补确切版本离线回归及真实Jammy必要验证；本轮没有编写/运行项目测试、修改Python/CI、源码交付或目标解释器下载/构建/安装/执行，没有数据库迁移或远端提交。本条继续沿用原PREP-11批次，原回执/选择前方案按历史时点保留，C1仍OPEN。
**2026-10-25同批授权实施：**用户要求按审计开始代码修改。在完整备份9份原文档后，基于最新dev `32963a0c` 建立 `feat/runtime-c1-python31215-20261025`，保留R2并行日志。launch/bootstrap两源码固定3.12.15 final与 `/opt/sanq/python/3.12.15/bin/python3.12`；process_check算法及另外7源码原字节保持，6个测试文件同步，新增2个旧材料/混合绑定负例，源码漂移负例断言替换命中。CI保留原Runtime/Release步骤，追加setup-python@v6精确3.12.15离线回归，通过独立python-path执行且不改后续环境；workflow变更遵循原selector，不绕过全量lane。已重新生成 [九源审阅快照](evidence/c1-prep11-python31215-source-review-2026-10-25.md)，sourceCommit因未提交明确为空，不冒充正式批准材料；launch→request.launchMaterialsSha256→双输入pins的最终重定待准确源码head/CI后完成。详见 [审计§9](Runtime更新-C1-PREP-11-Python31215变更审计.md)。仅静态语法/导入/配置/差异/摘要/归档检查，未运行项目test/scanner或目标Python；无owner/依赖边/兼容/scanner baseline/17 Bundle/业务/数据库迁移变化，无解释器安装、Flow、维护/AWS/生产操作，未提交远端。C1仍OPEN，准确解释器构建/来源/安装及Jammy同候选验证继续待完成。

**远端交付与CI续记（2026-10-25）：**用户已授权代码与此前文档一并远端交付及最终CI全绿后合并dev。[PR #2946](https://github.com/sanqin888/sanqinMVP/pull/2946) 首个源码head为 `802a0ae8e4c1e53b935bc5eacd950e9280853880`，19个文件包含原回执/审计全部新增文件。实际 [CI #7562](https://github.com/sanqin888/sanqinMVP/actions/runs/40166026342) 的ops-checks成功：Runtime848、Release45、精确CPython3.12.15回归203项通过；Browser E2E在Initialize containers拉取ECR Public PostgreSQL时连续返回Data limit exceeded，未进入测试，未记为E2E通过。最小修复只将CI服务镜像改为Docker Official Image上游 `docker.io/library/postgres:15-alpine`，保留同一标签、健康检查及全部测试门禁，不动业务/生产镜像或selector。修复head仍须实际CI全绿后合并，最终head/Checks/merge以PR事件为准；无需再次取得同分支CI修复授权。下一任务为 [PREP-12可信构建与交付](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)，本批只交接任务，尚未启动构建/安装，C1仍OPEN。


## 2026-10-24 — R2-A2-3 P2-C3C3 B9-DECISION 双层撤销合同冻结（文档交付）

**DOC_SEMANTICS_FROZEN / B1_OPTION_SELECTED / IMPLEMENTATION_NOT_AUTHORIZED。** 基于 M01-B9 PR #2942 的 scoped TLS 证据与当前 `dev@17188367684a155b7217881d695c8c615589e940` 只读审阅，形成 [B9-DECISION 双层撤销权威与 CRL 生命周期合同](Runtime更新-R2-A2-3-P2-C3C3-B9-DECISION双层撤销权威与CRL生命周期合同.md)：D01–D08 明确 CA/CRL 发行权威、Enrollment 审批权威、双层 AND/OR 拒绝、发行总账/CRL Number/时效/原子交付与受信 anti-rollback 前置；首版 B1 采用 fenced stop-and-replace，要求在 `REVOCATION_EFFECTIVE` 生效点 F 前证明全部旧 writer/事务/SSLContext 停止，UNKNOWN 只读对账；T01–T08 作为未来验收矩阵。运营建议 CRL ≤24 小时、提前 ≥6 小时刷新，正式运行前再审参数。未修改代码、证书/CRL、Enrollment/SQLite、Guard/VM/Docker/生产；正式 InstallationAnchor 和独立版本权威仍缺失，后续实施需单独授权。`P1 DENY / P0-01 NOT_RUN / PRODUCTION NO-GO`。

## 2026-10-24 — C1-PREP-10 候选源码固定与只读验收准备

**NINE SOURCES PINNED / SOURCE PACKAGE PREPARED_LOCAL / PLATFORM AND DELIVERY NOT_RUN / C1 OPEN。** 按用户“合并后开始下一步”，在 PREP-09 PR #2943 经最终CI #7553 SUCCESS（Runtime846/Release45）合并 `b7b7f27682700447d37bcdabd456f22087a54892` 后，新建 `docs/runtime-c1-prep10-source-delivery-20261024`。从GitHub按准确合并SHA取回九份只读候选源码，与最终head `3efa09f8763dbe870073a2a78847c0a19ac53466` 逐Git blob比对9/9相同，重算Git blob/SHA256/大小共78,274 bytes；生成 [候选源码清单](evidence/c1-prep10-source-inventory-2026-10-24.md) 和 [来源/只读验收工作包](Runtime更新-C1-PREP-10候选源码固定与只读验收准备.md)。制备源码审阅归档22,978 bytes，SHA256 `40d8d2d8fc7da7be7d15b06aff12c8ad413674e48853103c13476005a60b658c`，同环境重建相同、重新打开12成员逐字节一致；不执行包内源码，不生成未核实事务的launch/request/pins。同步R0/C1总包/入口方案/依赖图及原PREP-09最终交付事实，保留TLS并行记录。仅Runtime/Ops文档/来源记录，无源码/owner/导入/跨上下文边/兼容/scanner baseline、17 Bundle、依赖/锁/CI或数据库/迁移变化，不新增镜像测试；本地仅材料/JSON/差异静态核对，未运行项目test/scanner、目标Python或Host/Guest/root/AWS/生产操作。实际解释器包revision/关键依赖、启动前信任/真实受控交付及同平台只读实测仍待完成；Python3.12.3选择不变，完整效果候选未冻结。首次审阅待用户批准，**本批未推送/未创建PR**，C1最终随完整正式候选验收。

**同批 CI 修复（#7556）：**完整8文件 head `69082af5` 的 Browser E2E 在 Initialize containers 阶段拉取 `public.ecr.aws/docker/library/postgres:15-alpine` 失败，注册表返回 `Data limit exceeded`，未进入测试。原独立 JSON 记录按现有 `change_scope.py` 的未知路径规则触发全量 lane；该记录无程序消费者，现将仓库展示改为 Markdown，保留包内原 JSON、原 SHA256 和来源材料。未改 CI/selector/测试或执行逻辑。完整文件已补齐到同一 [PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944)，最终 head 仍须全部必需检查全绿；本地未运行项目测试，C1 仍 OPEN。

**同批修复后验证：**完整 Markdown 文档 head `712e99468a2f0f99eaad1fc2f7c31874ff38e577` 的 [CI #7557](https://github.com/sanqin888/sanqinMVP/actions/runs/40150848390) SUCCESS，`ci-change-scope` 实际通过，Runtime/Release/Browser等重lane按原选择器正常跳过；不作为本批新增运行测试通过。包内原 JSON及归档摘要不变，CI/selector未修改。用户已授权本批最终head必需检查全绿后合并dev并开始下一步；此前LOCAL/未推送为首次审阅状态，最终Checks/merge以 [PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944) 为准，C1仍OPEN。


## 2026-10-24 — C1-PREP-09 正式 Python 基线与只读 Bootstrap 候选

**PYTHON3.12.3 SELECTED / BOOTSTRAP ASSEMBLY LOCAL / 32 TEST METHODS AUTHORED_NOT_RUN / C1 OPEN。** 用户确认 AWS VM 的Python3.12.3并要求采用；从 `dev@9a20a026` 新建 MCP-workspace 分支 `feat/runtime-c1-prep09-bootstrap-20261024`，保留PR #2942 TLS文档，核实PREP-08的PR #2941/最终CI #7548 SUCCESS已合并 `814c1489`。新增standalone `normal_runtime_bootstrap.py`：沿用v1固定解释器/flags/root/argv/env/cwd，只收txid，先核对进程，再以no-follow持有固定审批三文件/源码及祖先FD，核对双pins和bootstrap自身+八模块字节；私有namespace只从固定bytes装配既有reader/anchor/parser/loader/scope/process核对与同一核心。输入/源码退出复检及FD关闭先于caller，CLI在全部context正常退出后才输出ASSEMBLY_ONLY；不调用Flow、不创建控制文件或真实能力/执行权。新增32项有明确虚拟根/属主/进程fixture桥接的真实组件与失败测试，**未运行**。同步 [工作包](Runtime更新-C1-PREP-09正式Python基线与只读Bootstrap候选.md)、R0、C1总包/入口装配方案及依赖图；仅Runtime/Ops内部新增，不改原v1/支持组件/false/guard、17 Bundle、owner/跨上下文边/兼容/scanner baseline、依赖/锁/CI或Prisma/迁移。Python版本选择不证明Ubuntu/包revision/关键依赖或bootstrap/批准pins可信来源；root权限和自洽hash不形成来源权威。仅AST/导入顺序、基线摘要/差异/空白/状态静态核对，未运行项目lint/build/test/scanner、入口或Host/Guest/Docker/AWS/生产命令；未部署，首次审阅待用户批准远端PR→dev，**未推送/未创建PR**。C1最终随真实正式候选验收；下一步是同候选来源/受控交付与同平台只读验证，效果随R2/R3/R4完成。

**同批远端验证续记（PR #2943）：**用户已授权本批远端提交、最终 head 全部必需 CI 全绿后合并 dev 并开始下一步。完整源码 head `97ac6fd38c6d6b1249636a6952a0bf4e027a966a` 的 [CI #7552](https://github.com/sanqin888/sanqinMVP/actions/runs/40149348914) SUCCESS：Runtime `846 tests / OK`（含本批新增32）、Release `45 tests / OK`、Runtime shell 语法检查通过，无需 CI 修复。上述“未运行/未推送/未创建PR”是首次本地审阅时点；本地仍未运行项目测试，当前只补验证记录，最终 head 的 CI/合并以 [PR #2943](https://github.com/sanqin888/sanqinMVP/pull/2943) 实际事件为准。CI 不认证真实 AWS Python/来源/权限，也不授予任何效果权限，C1 仍 OPEN。

**同批最终交付：**最终head `3efa09f8763dbe870073a2a78847c0a19ac53466` 的 [CI #7553](https://github.com/sanqin888/sanqinMVP/actions/runs/40149478415) SUCCESS（Runtime846/Release45），无需CI修复；[PR #2943](https://github.com/sanqin888/sanqinMVP/pull/2943) 已squash合并 `b7b7f27682700447d37bcdabd456f22087a54892`。PREP-09源码批已交付，原LOCAL/NOT_RUN与最终head待验为历史状态；C1真实来源/平台/效果验收仍OPEN。


## 2026-10-24～25 — P2-C3C3 M01-B9 安全证据收口与双层撤销优先候选

**M01-B9 EVIDENCE_AUDIT_CLOSED_PASS_SCOPED / OPTION_B_PREFERRED_NOT_IMPLEMENTED / FORMAL_CAS BLOCKED。** 在远端 `dev@814c14898ce01f915c345af7426de95b3c753bb5` 只读审阅 `maintenance_mtls_hostonly_lab_service.py` / 14 项单元测试及原 DESIGN-B/IMPLEMENT-A 后，将操作者 Mac LibreSSL2.8.3 ↔ Ubuntu OpenSSL3.0.2 的 B4～B8 双端回执整理为 [M01-B9 安全证据收口与双层撤销候选决策](Runtime更新-R2-A2-3-P2-C3C3-M01-B9安全证据收口与双层撤销候选决策.md)；IMPLEMENT-A 增补最新 §6，较早阶段的 `NOT_RUN` 文字保留历史时点而不改写。B4 正常双向 TLS1.2、B5 缺客户端证书、B6 错 CA(code19)、B7 错服务器 IP SAN(code64) 和 B8 的坏 EKU(静态 error26/Alert43)、时间边界(error9/10)、真实过期证书(verify10)、CRL 撤销(静态 error23/真实 revoked Alert)、会话恢复尝试(两次 `session_reused=False`)均为无 CAS 的离线验证或一次性 TLS_ONLY 端点中的 `PASS_SCOPED`；最后 Mac TCP39443 `lsof` 无监听。BAD EKU/CRL 的 Mac 内部精确拒绝步骤未证，Session 恢复未发生不等于永不发生。代码审计发现正式 `tls_context()` 仅加载 CA、未加载 CRL/启用 `VERIFY_CRL_CHECK_LEAF`，且已建立连接撤销与 SQLite COMMIT 的时序尚无证明；正式 `InstallationAnchor` 缺失，仓库 CAS/SQLite/真实 Guest client/Boot Guard 均未执行。用户选定 **Option B（Enrollment + X.509 CRL）为后续优先候选**，但未授权代码/CRL 权威/正式 enrollment/真实 CAS；仍需另外冻结完整 CRL 总账、原子投送、失效 fail-closed、身份 pin 编码和撤销线性化。实验 CRL `nextUpdate=2026-10-26T00:04:02Z`、不可用于正式信任源。独立 MCP-workspace 原有未提交内容未被覆盖；本批已获远端交付授权并在最新 dev 上独立重建，仅文档 PR，最终 CI 以 GitHub Actions 实际检查为准；未改源码/架构、17 Bundle、Docker、VM、AWS/生产。**`P1 DENY / P0-01 NOT_RUN / PRODUCTION NO-GO`**。

## 2026-10-24 — C1-PREP-08 运行进程声明核对与失败测试

**SOURCE CI #7546 VERIFIED / 20 NEW TEST METHODS INCLUDED / C1 OPEN / PR #2941。** 前批PR #2940最终head `8638f522…` / CI #7544 SUCCESS（Runtime 794 / Release 45，含PREP-07的21项）squash合并dev `fe170ab1797a7135737d3bd411069ecfeee4fe55`；其首次CI #7540的FD基线失败仅修正测试进入前GC与借入/根FD检查，修复源码CI #7541和最终CI均通过，原实现/guard不变。按用户合并后继续与独立缓存授权，本批新增Runtime/Ops normal_runtime_process_check及18项单元方法，并在candidate_scope pin后/source前调用进程核对；更新既有scope21项为明确模拟进程fixture并新增2项错误进程/不可读前置拒绝（scope共23），保留原严格FD检查。只对当前sys/os视图与现v1 Linux/x86_64/Python3.12.3 final、解释器、real/effective UID/GID、argv/orig_argv、五键env/cwd及相关flags比较；匹配返回None，不输出/保存实际环境argv或授权包、不改启动/身份/环境/cwd、不启动任何效果。新增 [C1-PREP-08 运行进程声明核对与失败测试](Runtime更新-C1-PREP-08运行进程声明核对与失败测试.md) 并同步R0/C1总包/依赖图与原PREP-07最终CI/合并证据。新增同owner边process_check→launch与candidate_scope→process_check，无跨上下文边/债务、owner/SCC/scanner baseline/兼容/部署单元、v1字段/guard/17 Bundle、依赖/锁、CI或Prisma/migration变更。仅静态审阅AST/导入/调用顺序、基线摘要、差异/空白与补丁可应用性，未运行guard/入口/模块/仓库lint/build/test/扫描，未连接用户/生产Host或Guest/VM/Docker/AWS/维护安装目标；日志低于1,000,000 UTF-8字节。用户现已授权本批远端交付；发布复核dev仍为 `fe170ab1`，六既有文件/AGENTS/CI/launch源码Git blob未漂移，保留共享workspace其他改动，使用独立缓存/GitHub插件PR→dev，[PR #2941](https://github.com/sanqin888/sanqinMVP/pull/2941) → dev；完整源码 head `d40c370eb482e52dd61ae6443429834413331859` 的 [CI #7546](https://github.com/sanqin888/sanqinMVP/actions/runs/40146872548) SUCCESS，Runtime `814 tests / OK`（含本批新增20）、Release `45 tests / OK`，Runtime shell语法检查通过，无需CI修复。当前同批只补验证记录，最终 head 仍须实际 CI 全绿才合并；最终 Checks/merge 状态以 PR 事件为准。此后启动声明核对不认证解释器/外层源码/关键来源、原生环境或namespace，不代表正式平台选择，受信bootstrap/启动前核验/关键输入保护及真实能力仍OPEN，C1最终随正式候选完成。

## 2026-10-24 — C1-PREP-07 受保护候选装配与失败测试

**FINAL CI #7544 VERIFIED / 21 TEST METHODS INCLUDED / C1 OPEN / PR #2940 MERGED。** 前批PR #2939最终head `ca69f3d2…` / CI #7538 SUCCESS（Runtime 773 / Release 45，含PREP-06的30项）squash合并dev `c808484c45096e29dd9760892fcf33f0baa497ea` 后，按用户合并后继续和独立缓存授权，新增Runtime/Ops `normal_runtime_candidate_scope.py` 与 `test_normal_runtime_candidate_scope.py`。组合层将两独立pin/原件v1解析置于I/O前，固定root:root策略走实际anchor/source捕获，在其FD上下文中初始化已固定bytes的同核心三模块，源/祖先退出复检完成且FD关闭后才交给caller，模块scope保留至caller退出；不接受外部snapshot/owner/root/loader/callback，不改变低层实现或复制/自动调用Flow。21项真实组件/虚拟根用例覆盖顺序/FD与模块生命周期、pins/源/祖先/语法/导入拒绝、初始化期间持久漂移在caller前拒绝、无关父变动、发布后固定对象、异常/占用/registry、无隐式效果和权威，本地未运行，已由修复后源码CI #7541实际覆盖。新增 [C1-PREP-07 受保护候选装配与失败测试](Runtime更新-C1-PREP-07受保护候选装配与失败测试.md) 并同步R0/C1总包/依赖图，更新原PREP-06最终CI/合并事实，保留PR #2938的LAB_ONLY限定结论。新同owner单向边 candidate_scope→inputs/anchor/loader，无跨上下文边/债务、owner/SCC/scanner baseline/兼容/部署单元、旧字段/guard/17 Bundle、依赖/锁、CI或Prisma/migration变更。只静态审阅AST/导入/调用、基线摘要、差异/空白与补丁可应用性，未调用入口或执行模块/仓库lint/build/test/扫描、未连接用户/生产Host或Guest/VM/Docker/AWS/维护安装目标；日志小于1,000,000 UTF-8字节。用户现已授权本批远端交付，发布复核dev仍为 `c808484c`，文档/六前置源码/AGENTS/CI的Git blob未漂移，保留共享workspace其他改动，通过独立缓存/GitHub插件PR→dev，[PR #2940](https://github.com/sanqin888/sanqinMVP/pull/2940) → dev；修复后源码 head `528088621f06ad7b445fd3cecf56cf3d5a6958c8` 的 [CI #7541](https://github.com/sanqin888/sanqinMVP/actions/runs/40145310353) SUCCESS，Runtime `794 tests / OK`（含本批21）、Release `45 tests / OK`，Runtime shell 语法检查通过。首次 CI #7540 的1项FD基线失败已仅在测试中修复：进入前gc.collect、保留退出时严格集合断言，并增加借入FD身份/存活及根FD关闭检查；未改实现或guard。最终 head `8638f522e04862ba30fb7c4b77ac9bf9b2bae87e` 的 [CI #7544](https://github.com/sanqin888/sanqinMVP/actions/runs/40145422597) SUCCESS（Runtime 794 / Release 45），PR #2940 已 squash 合并 dev `fe170ab1797a7135737d3bd411069ecfeee4fe55`；该批代码已交付，C1 仍 OPEN。已合并并按授权开始下一步；文件owner策略不认证实际进程/平台/解释器，不声明持续路径冻结，sources是装配时观察，真实bootstrap/关键输入保护/来源/效果能力仍OPEN，C1最终随正式候选完成。

## 2026-10-24 — C1-PREP-06 固定源码字节加载与失败测试

**FINAL CI #7538 VERIFIED / 30 TEST METHODS INCLUDED / C1 OPEN / PR #2939 MERGED。** 前批PR #2937最终head `88a774a2…` / CI #7531 SUCCESS（Runtime 743 / Release 45，含PREP-05的28项）squash合并dev `102eeeb5ac0c7e6ca658a4436928354925af8559` 后，按用户合并后继续及独立缓存授权，在该最新基线新增Runtime/Ops `normal_runtime_source_loader.py` 与 `test_normal_runtime_source_loader.py`。新增双pin/完整快照字节核对、三现有模块全量预编译后顺序初始化、候选私有模块名/有限本组与预载stdlib导入、同候选parser/core类型重解析，以及完整namespace绑定/异常保留/只清自己registry的生命周期；复用同一正常核心，不重开源码路径或复用canonical cache，不调用Flow或供给真实capability。30项真实源码/内存及临时FD用例覆盖pin/字节/语法与初始化拒绝、cache/finder/路径与类型隔离、导入/namespace漂移、异常/中断与caller原因、重载不防重放、原核心inert供给后仍BLOCKED/false和无CLI/第18成员，本地未运行，已由源码CI #7535实际覆盖。新增 [C1-PREP-06 固定源码字节加载与失败测试](Runtime更新-C1-PREP-06固定源码字节加载与失败测试.md) 并同步R0、C1总包、依赖图，更新原PREP-05记录最终CI/合并事实。新增loader→inputs/launch/source_snapshot的同owner静态边与对固定三模块bytes的有限装配关系；无跨上下文边/债务、owner/SCC/scanner baseline/兼容/部署单元、原合同/guard/17 Bundle、依赖/锁、CI或Prisma/migration变更。只静态审阅AST/导入/调用、准确基线摘要、差异/空白及补丁可应用性，未调用loader或执行模块/仓库lint/build/test/扫描，未连接用户/生产Host或Guest/VM/Docker/AWS/维护安装目标；日志现卷小于1,000,000 UTF-8字节。完成时dev由PR #2938推进至 `95d470cad5c08f8d6f8d6c49e3ae7726dd1c6d46`（仅mTLS现场文档与原日志条目变化），本批已重对齐并完整保留其LAB_ONLY TLS_ONLY四项/停止监听PASS_SCOPED及实际CAS/身份/Guard仍OPEN的限定结果，同时更新C1证据复用表；源码/规则/CI基线未变。用户现已授权本批远端交付；发布复核仍为dev `95d470ca`、文档/五前置源码/AGENTS/CI的Git blob未漂移，保留共享工作区另一批改动，通过独立缓存/GitHub插件PR→dev，[PR #2939](https://github.com/sanqin888/sanqinMVP/pull/2939) → dev；完整源码 head `42a5642d9b66f5d55910a9ff0e85847e50c79ad0` 的 [CI #7535](https://github.com/sanqin888/sanqinMVP/actions/runs/40143689266) SUCCESS，Runtime `773 tests / OK`（含本批30）、Release `45 tests / OK`，Runtime shell 语法检查通过，无需 CI 修复。最终 head `ca69f3d293f49d1d7f5b37724facd51ec3d32c7f` 的 [CI #7538](https://github.com/sanqin888/sanqinMVP/actions/runs/40143868669) SUCCESS（Runtime 773 / Release 45），PR #2939 已 squash 合并 dev `c808484c45096e29dd9760892fcf33f0baa497ea`；该批代码已交付，C1 仍 OPEN。已合并并按授权开始下一步；不认证supplied pins/外层启动源码/解释器/关键来源或live FD；非sandbox、事务锁或正式bootstrap，真实平台/受信入口/关键输入保护与effect adapter继续OPEN，C1最终随正式候选完成。

## 2026-10-24 — C1-PREP-05 固定启动输入解析与失败测试

**FINAL CI #7531 VERIFIED / 28 TEST METHODS INCLUDED / C1 OPEN / PR #2937 MERGED。** 前批 PR #2936 最终 head `78f67dad…` / CI #7527 SUCCESS（Runtime 715 / Release 45，含PREP-04的25项）squash 合并 dev `3c4823bf95672b8930990892cd253aad705754b2` 后，按用户“合并后开始下一步”及独立缓存授权，在该最新基线上新增 Runtime/Ops `normal_runtime_inputs.py` 与 `test_normal_runtime_inputs.py`。新增双独立摘要先于JSON、有界 immutable bytes/ASCII/重复键与数值拒绝、原LaunchMaterials/UpdateRequest类型重建及全部canonical原字节回环、launch摘要/事务交叉绑定，保留现v1目标/旧摘要/状态/false守卫，不创建新协议或批准模型。28项内存测试覆盖pin/预算/编码/重复键/字段/派生常量/bool-int/源码pin/argv、交叉绑定/旧摘要/最大转义预算/不可变及无I/O-loader-Flow-CLI-17Bundle边界，本地未运行，已由源码CI #7529实际覆盖。新增 [C1-PREP-05 固定启动输入解析与失败测试](Runtime更新-C1-PREP-05固定启动输入解析与失败测试.md) 并同步R0、C1总包、依赖图，更新原PREP-04记录的最终CI/合并证据；新同owner边 inputs→launch/update，无跨上下文边/债务、owner/SCC/scanner baseline/兼容/部署单元、原字段/guard、17 Bundle、依赖/锁、CI或Prisma/migration变更。只静态核对AST/导入/调用、基线摘要、差异/空白和补丁可应用性；未执行模块、项目lint/build/test/扫描或Host/Guest/VM/root/Docker/AWS/生产动作。日志现卷仍小于1,000,000 UTF-8字节。用户现已授权本批远端交付；发布复核 dev 仍为 `3c4823bf`，四份既有文档、launch/update、AGENTS和CI的Git blob未漂移；共享工作区另一批mTLS文档/日志改动保留，继续独立缓存/GitHub插件创建PR→dev，[PR #2937](https://github.com/sanqin888/sanqinMVP/pull/2937) → dev；完整源码 head `be783b091bc5604283166d0d92621ddb1840fa53` 的 [CI #7529](https://github.com/sanqin888/sanqinMVP/actions/runs/40141511752) SUCCESS，Runtime `743 tests / OK`（含本批28）、Release `45 tests / OK`，Runtime shell 语法检查通过，无需 CI 修复。最终 head `88a774a2e15daeb7cf171d8f4699bb7cf977a110` 的 [CI #7531](https://github.com/sanqin888/sanqinMVP/actions/runs/40141759436) SUCCESS（Runtime 743 / Release 45），PR #2937 已 squash 合并 dev `102eeeb5ac0c7e6ca658a4436928354925af8559`；该批代码已交付，C1 仍 OPEN。已合并并按授权开始下一步；解析不认证supplied pins、平台/解释器/已加载源码或发布物，不取旧Archive原字节，不构成真实入口或效果权限，C1最终随正式候选完成。

## 2026-10-24 — C1-PREP-04 源码目录锚点与失败测试

**FINAL CI #7527 VERIFIED / 25 TEST METHODS INCLUDED / C1 OPEN / PR #2936 MERGED。** 前批 PR #2935 最终 head `c6a1a158…` / CI #7523 SUCCESS（Runtime 690 / Release 45，含PREP-03的27项）squash 合并 dev `a667b3a9209ed0124e475fa0b81d1bdf7e7594aa` 后，按用户“合并后开始下一步”及本地缓存授权，在该最新基线上新增 Runtime/Ops `normal_runtime_source_anchor.py` 与 `test_normal_runtime_source_anchor.py`。实现当前 namespace `/`→固定 launch sourceRoot 的有限 no-follow 目录走查，校验祖先 type/device/inode/owner/mode、持有并复验批准目录边，复制 launch 材料后组合已合并 PREP-03 的固定源码 bytes；不检查无关父目录内容静止，不把路径观察授为 Host/namespace/来源/解释器或root权限认证。25个虚拟根/真实FD测试方法覆盖正常绑定、I/O前拒绝、祖先属主/权限/链接/缺失/O_PATH、叶目录/字节验证、读取后/运行期父目录替换与相同内容新inode、无关父级变动、异常原因与FD释放、无CLI/替代根/执行和17 Bundle边界，本地未运行，已由源码 CI #7525 实际覆盖。新增 [C1-PREP-04 源码目录锚点与失败测试](Runtime更新-C1-PREP-04源码目录锚点与失败测试.md) 并同步 R0、C1总包、依赖图，更新原 PREP-03 记录的最终CI/合并证据。新同owner边 source_anchor→source_snapshot/normal_runtime_launch；无跨上下文边/债务、owner/SCC/scanner baseline/兼容/部署单元、旧字段/接口/guard、17 Bundle、依赖/锁、CI或Prisma/migration变更。已静态审阅AST/导入/差异/空白、基线摘要与补丁可应用性；未执行项目lint/build/test、模块、扫描或Host/Guest/VM/root/Docker/AWS/生产动作，未创建实际/root目录；工作日志现卷仍小于1,000,000 UTF-8字节。用户现已授权本批远端交付，发布复核 dev 仍为 `a667b3a9`、四份既有文档与核心/reader/AGENTS/CI 的 Git blob 未漂移；共享工作区另一批 mTLS 文档/日志改动保留，继续独立缓存/GitHub 插件创建 PR→dev，[PR #2936](https://github.com/sanqin888/sanqinMVP/pull/2936) → dev；完整源码 head `eafe0188a1fe218277d118d7134dd78737b19bf2` 的 [CI #7525](https://github.com/sanqin888/sanqinMVP/actions/runs/40140724214) SUCCESS，Runtime `715 tests / OK`（含本批25）、Release `45 tests / OK`，Runtime shell 语法检查通过，无需 CI 修复。最终 head `78f67dad2b9221f0f383321b0b8eea7b37663345` 的 [CI #7527](https://github.com/sanqin888/sanqinMVP/actions/runs/40140803220) SUCCESS（Runtime 715 / Release 45），PR #2936 已 squash 合并 dev `3c4823bf95672b8930990892cd253aad705754b2`；该批代码已交付，C1 仍 OPEN。已合并并按授权开始下一步；真实平台/关键来源/输入及bootstrap/effects继续OPEN，C1最终随正式候选完成。

## 2026-10-24 — C1-PREP-03 受保护源码快照读取与失败测试

**FINAL CI #7523 VERIFIED / 27 TEST METHODS INCLUDED / C1 OPEN / PR #2935 MERGED。** 前批 PR #2933 的最终 head `185f9623…` / CI #7518 SUCCESS（Runtime 649 / Release 45）squash 合并 dev `51c7d01ba5928b5532d9e965b78797b8e372382b` 后，按用户“合并后开始下一步”及本地缓存/GitHub 插件授权，在该最新基线上新增 Runtime/Ops `normal_runtime_source_snapshot.py` 与 `test_normal_runtime_source_snapshot.py`；不占用/切换共享 workspace，不执行实际 Host/Guest/生产命令。reader 复用 LaunchMaterials 外部固定摘要，从借出的私有目录 FD 有界核对完整源集合、只读/no-follow/非阻塞 FD、owner/mode/regular/nlink/device/size、字节哈希与目录项身份，返回固定不可变源码 bytes，正常退出复检，异常保留原原因且只关自有 FD；借出 FD 与 sourceRoot/祖先、pins/平台/来源仍由外层独立认证，不授予 root/维护/安装能力。27个测试方法覆盖真实 fixture 的字节/权限/链接/缺项/哈希/短读/增长/同字节换 inode、生命周期/异常/FD 泄漏和架构边界，未本地运行，不拿前批 CI 充当新源码验证。同步 [C1-PREP-03 受保护源码快照与失败测试](Runtime更新-C1-PREP-03受保护源码快照与失败测试.md)、R0、C1 总包、依赖图，在原 PREP-02 日志更新合并证据。新增同 owner 单向边 source_snapshot→normal_runtime_launch；无跨上下文边/债务、owner/SCC/scanner baseline/兼容/部署单元、原接口/字段/guard、17 Bundle、依赖/锁、CI、Prisma/migration 变化。已完成静态 AST/导入/差异/空白和基线摘要审阅；未运行项目 lint/build/test/扫描，日志现卷仍低于1,000,000 UTF-8字节。本批已获用户远端交付授权，按发布时最新 `dev@0fad2000c05b76d2d0ec7ccb2514cde0bc12f4e4` 独立缓存重建，完整保留随后 PR #2934 的 mTLS 源码/测试与 R0/日志增量；[PR #2935](https://github.com/sanqin888/sanqinMVP/pull/2935) → dev；完整源码 head `084a124c3342f2576a76f8da7b02817f042eedce` 的 [CI #7522](https://github.com/sanqin888/sanqinMVP/actions/runs/40139007584) SUCCESS，Runtime `690 tests / OK`（含本批27）、Release `45 tests / OK`、Runtime shell 语法检查通过，无需修复。最终 head `c6a1a15875b452be32d5d4e41835cdf9e1b909c3` 的 [CI #7523](https://github.com/sanqin888/sanqinMVP/actions/runs/40139311338) SUCCESS（Runtime 690 / Release 45），PR #2935 squash 合并 dev `a667b3a9209ed0124e475fa0b81d1bdf7e7594aa`；该批已交付，不代表来源/平台认证或 C1 最终验收。真实平台/根锚/来源/消费入口及效果适配器继续 OPEN，C1 最终同正式执行候选收口。

## 2026-10-24 — P2-C3C3-IMPLEMENT-A Host-only mTLS 实验服务源码候选

**PR #2934 / CI #7520 SUCCESS / LAB_ONLY_MTLS_CORE_CLOSED PASS_SCOPED 4/4 / PRODUCTION NO-GO。** 原 IMPLEMENT-A 服务源码和模拟测试已合并；工作区清理后的操作者实测：M00-B 仅 Recovery Clone 运行、Host-only Mac `192.168.56.1` ↔ Guest `192.168.56.5`；Mac 加密 RSA3072 实验 CA（DER SHA256 `40788f66c5eb4572f41d7b49019a87d9138d4f2676be1a9ca1a8ee6f90e449e8`），服务端 `serverAuth/IP SAN 192.168.56.1` leaf（DER SHA256 `06b1d2f197565ab9b57222ff8317f2cb28e92e39dce671b9272855760800888d`）。Guest 正式 InstallationAnchor `NOT_PRESENT`，**用户独立批准 LAB_ONLY 方案 B**；Guest RSA3072 客户端加密私钥只留 Guest，Mac CA 签发 clientAuth leaf（DER SHA256 `d5dfb4c13a87295f1f2567b67ff65bc593045c727a08d48844ccce8bc83bdab7`），公钥证书回传、私钥与证书匹配及目录0700/文件0600通过。真实**非 CAS** 临时端点 TLS1.2 / `ECDHE-RSA-AES128-GCM-SHA256` mTLS 正向握手成功，缺 client cert、错误 CA（verify code19）、错误服务器 IP SAN（verify code64）各正确拒绝；四项核心实测 4/4 PASS_SCOPED，末次 Mac `lsof` TCP39443 无可见监听。client leaf 有效期至 UTC `2026-10-31T22:50:49Z`，server leaf 至 `2026-11-07T22:35:28Z`，CA 至 `2026-11-23T22:32:19Z`。错误 EKU、过期/未生效、CRL/撤销、会话恢复仍 NOT_RUN，真实 CAS socket/enrollment/SQLite/Guard 未运行；`P1 DENY / P0-01 NOT_RUN / PRODUCTION NO-GO`。详细回执见 [IMPLEMENT-A §2B～§2N](Runtime更新-R2-A2-3-P2-C3C3-IMPLEMENT-A本地Mac服务与证书交付门禁.md)。本次仅整理此原有工作日志条目及阶段文档，不改代码、架构、Schema、CI 或 17 Bundle；合并后开启扩展负例只读审计。

## 2026-10-24 — C1-PREP-02 正式入口装配与关键来源绑定

**SOURCE COMMENTS ALIGNED_LOCAL / ASSEMBLY DESIGN COMPLETE_LOCAL / REAL BOOTSTRAP NOT IMPLEMENTED / C1 OPEN / PR #2933 MERGED / FINAL CI #7518 SUCCESS。** 按“PR #2930 合并后开始下一步”授权，先确认其最终 head `5dc25a8d…` / CI #7511 SUCCESS、merge `67a88aae…`，再读取 TLS 文档 PR #2931 后最新 `dev@b7e8d882dbef75705ed63af911e265622fe59acc` 的 AGENTS/CI、正常核心/启动材料、prepare 与 lab installer 及现有测试。共享 workspace 保留原状，本批依用户明确许可在独立缓存准备。仅修改 `normal_runtime_launch.py` 模块 docstring 与 `normal_runtime_update.py` Protocol docstring，取消旧默认全量闭包/双原 Archive 义务表述，保持 v1 所有字段/平台/输入校验/流程和 false/拒绝字段；旧摘要须独立认证，不能由 Manifest/重打包/目标包代填。新增 [C1 候选入口装配与关键来源绑定方案](Runtime更新-C1候选入口装配与关键来源绑定方案.md)，细化四类身份、启动前信任/材料保护、原 11 步+abort 的真实接线缺口与聚焦验证；同步 R0、C1 总包、依赖图并在原 C1 日志更新合并证据。两处源码去除 docstring 后 AST 静态一致，差异/空白与基线 Git blob 核对通过；没有执行项目 lint/build/test 或 Runtime 模块，没有新增镜像注释的测试。Runtime/Ops owner、导入/依赖边/债务、SCC/scanner baseline、兼容、17 Bundle、字段/持久化合同、依赖/CI/Prisma/migration 和生产均无变化；日志现卷仍小于 1,000,000 UTF-8 字节。真实平台/bootstrap/adapters 与 C1 最终裁定继续 OPEN；用户已授权远端交付、CI 全绿后合并 dev 并开始下一步。发布复核为 `dev@a8898a90a4d71fec1d2bba871b63b70dbb86268c`，六份既有文件 blob 与准备时一致，保留 PR #2932 新增的其他设计；通过独立缓存/GitHub 插件交付，不切换/提交共享 workspace。[PR #2933](https://github.com/sanqin888/sanqinMVP/pull/2933) → dev；完整源码 head `1a7809e0632c54f023aac4c11548c7845db64885` 的 [CI #7517](https://github.com/sanqin888/sanqinMVP/actions/runs/40137267379) SUCCESS，Runtime `649 tests / OK`、Release `45 tests / OK`、Runtime shell 语法检查通过，无需 CI 修复。最终 head `185f962368b1d52d28c29dce05e54098f18b5bd5` 的 [CI #7518](https://github.com/sanqin888/sanqinMVP/actions/runs/40137391840) SUCCESS（Runtime 649 / Release 45），PR #2933 squash 合并 dev `51c7d01ba5928b5532d9e965b78797b8e372382b`；该批已交付，C1 正式验收仍 OPEN。未操作 Mac/Guest/VM/root/Docker/AWS/生产。

## 2026-10-24 — P2-C3C3-READ Mac/Guest TLS1.2、Host-only 与 14/14 密码套件名称交集实测收口

**OPERATOR-PASTED READ-ONLY / REPO ALIGNED TO dev@67a88aae / REAL_MTLS NOT_RUN / C3C3 SERVICE NOT_AUTHORIZED。** 继 PR #2929 / CI #7508 合并的 C3C2 模拟 Peer/Wire 后，已归档 Mac LibreSSL 2.8.3/Python3.8.2 与 Ubuntu Guest OpenSSL3.0.2/Python3.10.12 的 SSLContext/网络元数据。双方 Client context `CERT_REQUIRED` 且 `check_hostname=True`，Mac min TLS1.0/max TLS1.2、Guest min TLS1.2/max supported；Mac 37 个 Cipher 的旧标签全为 `TLSv1/SSLv3`，原先用 `TLSv1.2` 标签筛选为 0 的结论不成立，按名称与 Guest TLS1.2 清单交集 14/14，含 ECDHE AES-GCM。Mac Host-only `192.168.56.1`、Guest `192.168.56.5`，Mac C3B 实验目录 `apple` 权限 `0700`。**静态能力/名称交集 PASS_SCOPED，不是 TLS1.2 握手、mTLS 身份、证书 SAN/CRL 或启动权限验收。** 不生成/安装证书、不开端口、不运行 Guard/VM/Docker；新的 [P2-C3C3-READ 完整报告](Runtime更新-R2-A2-3-P2-C3C3-READ认证TLS与HostOnly就绪审计.md) 与 R0 同步。此 C3C3-READ 交付仅包含本批证据，PR #2930 已进入 dev 的 C1 内容保持原样；后续 C3C3-DESIGN-B 只允许设计，真正证书/Host-only 监听/Guest client 必须另批批准。`P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / PRODUCTION NO-GO`。

## 2026-10-24 — C1 最小可信执行基线对齐与候选准备

**DOC-ONLY / BASELINE ALIGNED_LOCAL / INVENTORY COMPLETE_LOCAL / CANDIDATE PREPARATION STARTED / C1 OPEN / PR #2930 MERGED / FINAL DOC CI #7511 SUCCESS。** 按用户要求复工后 fetch 并核对 `origin/dev@08e5031cd9f8727e4bbe69cf18e86cf71367bedb`，重读当前 R0/AGENTS/CI、R1/S1、正常更新与 R2 Guard/CAS 代码和现有记录；GitHub 实核 PR #2927 最终 head/CI #7504 及 PR #2929 最终 head/CI #7508 SUCCESS，旧未 CI 字样保留历史解释。更新 R0 当前 C1/R1/R2 进度与旧 §9 适用范围、R1-B/C 与 S1 的默认闭包/见证要求、SYN A2-II 的条件触发定位；新增 [C1 最小可信执行基线对齐与候选准备](Runtime更新-C1最小可信执行基线对齐与候选准备.md)，完成 I01–I12 实现盘点、证据复用/平台差异、旧 Python/完整闭包字段和双 Archive 输入衔接缺口、四项最终关闭条件。当前只有核心/离线模型与有限实测，真实 bootstrap、平台/关键依赖、完整 effect adapters 和正式同候选验收仍 OPEN；C1 源码准备可与 R2 并行，最终随正式执行候选收口。Runtime/Ops owner 不变，无代码/守卫、17 Bundle、依赖/锁、CI、Prisma/migration、跨上下文边/债务、SCC/scanner baseline 或兼容改动。工作日志现卷已核对低于 1,000,000 UTF-8 字节，新增后仍无需分卷。复工时已有 P2-C3C3-READ 文档改动，原工作区保留；用户随后明确授权提交远端、合并后开始下一步，并允许工作区占用时使用本地缓存/GitHub 插件。本次因此从最新 dev 在独立缓存重建 C1 七份文档，不带入 TLS 未提交内容、不暂存/提交或切换共享工作区；MCP 无 lint/build/test 权限，未运行，未操作 Mac/Guest/VM/root/Docker/AWS/生产。[PR #2930](https://github.com/sanqin888/sanqinMVP/pull/2930) → dev；完整文档 head `ea8c0cabc0fe36bd0d2974979f59f6e80c7e2eda` 的 [CI #7510](https://github.com/sanqin888/sanqinMVP/actions/runs/40135924881) SUCCESS，仅 docs-only scope lane，Runtime/Release 按规则跳过。最终文档 head `5dc25a8d14cb0ccc6af0fbeda198f631781a6c00` 的 [CI #7511](https://github.com/sanqin888/sanqinMVP/actions/runs/40136110790) SUCCESS，PR #2930 squash 合并 dev `67a88aae648b23266403b306b642d3d3a6526d2f`；仅文档 scope 验证，未运行 Runtime/Release 测试。**R2-C4 OPEN / P0-01 NOT_RUN / S03-G06-S09 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED**。

## 2026-10-24 — R2-A2-3 P2-C3C2 离线身份绑定/Wire 合同本地实现

**P2-C3C1 PR #2928 / CI #7506 SUCCESS / dev@09db31ec；P2-C3C2 LOCAL_IMPLEMENTED / TESTS NOT RUN / NO PR。** 按前次已审 B 方案的最小范围，只在 MCP-workspace 新增 `ops/runtime/maintenance_off_host_auth_wire.py`、25 项 `test_maintenance_off_host_auth_wire.py` 离线负例及 [C3C2 实施记录](Runtime更新-R2-A2-3-P2-C3C2离线认证身份与Wire合同实施记录.md)。Wire v1 严格 canonical JSON、三种操作、32KiB 上限；只注入未实际验证的 synthetic peer certificate/CA 指纹和 enrollment、READ/SUBMIT 角色，校验状态/锚点/nonce、unknown-commit 读回策略；所有输出始终 DENY 且无网络/SSL/真实 CAS 执行权。没有修改 P1/A2-1、原 CAS SQLite、VB-04D1 及 17 文件 Bundle；没有 Mac/Guest/证书/Docker/生产操作。下一批 C3C3 先严格只读环境核验与独立权限申请；`P0-01 NOT_RUN / S03-G06-S09 OPEN / PRODUCTION NO-GO`。

## 2026-10-24 — P2-C3C1 最小认证离机 CAS 信任边界设计（本地审阅）

**VB-04D1 PR #2927 / CI #7504 SUCCESS / dev@2b83edf2 / Runtime 624/624 PASS。** 首轮 CI #7503 新增负例测试存在一处括号未闭合，已在同 PR 以最小测试语法修复后重新运行全部必需作业并全绿合并。现根据主线进入 [P2-C3C1 最小认证 CAS 信任边界与实施分批设计](Runtime更新-R2-A2-3-P2-C3C1最小认证离机CAS信任边界设计.md)：确认 P1 `CustodyReceipt` 只是未认证 claim、P2-C3A `client_identity` 是调用方声明且 `LAB_ONLY`、Mac SQLite process-level PASS_SCOPED，不得直接接 Docker。候选新增版本化 wire + mTLS peer ↔ enrollment/role 身份绑定；`HEAD_READ`、`COMMIT_LOOKUP`、`CAS_SUBMIT` 三端口操作；响应丢失后的未知/对账；特别列出在线查询到 Docker 启动之间的 **TOCTOU**，因此本批不给 `ALLOW_DOCKER_START`。该跨进程/身份所有权扩展要按 `AGENTS.md §10` 取得单独授权，下一步优先 C3C2 纯离线合同与负例，Mac 网络/证书、Guest 文件、Unit 安装和 P0-01 均未授权。本批只改 MCP-workspace 文档，未 push/PR；`S03/G06/S09 OPEN / R2-C4 OPEN / PRODUCTION NO-GO`。

## 2026-10-24 — R2-A2-3 VB-04D1 离线 Unit/安装 Manifest 合同本地实现

**LOCAL IMPLEMENTED / TESTS NOT RUN / REVIEW PENDING / NO PR。** [VB-04C](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md) 通过 PR #2926 / CI #7501 已合并 `dev@05ec6ef8`。用户授权合并后开始下一阶段，现仅在 MCP-workspace Runtime/Ops 新增 `maintenance_boot_guard_install_manifest.py` 与聚焦负例 `test_maintenance_boot_guard_install_manifest.py`，并编写 [VB-04D1 本地记录](Runtime更新-R2-A2-3-VB-04D1离线Unit依赖与安装Manifest实施记录.md)。严格约束 Ubuntu systemd 249 / docker.service fd://、docker.socket 监听/触发、containerd、Unit 显式 After/Before 静态图、9 项 root 文件/目录及 SHA/mode 意图、service/socket 双入口重验；任何候选回执仍 `decision=DENY`，五项绕过/离机/G06/运行时未证风险强制保留。**没有真正 unit 文本、安装器、daemon/Socket 服务、文件/权限读写、mTLS、VM/生产操作；P1/A2-1 DENY 和 17 Bundle 未修改。** `P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`。未运行 workspace 测试，需用户审阅后才授权远端 GitHub CI。

## 2026-10-24 — R2-A2-3 VB-04C Boot Guard 安装/启动依赖/撤回设计（本地审阅）

**VB-04A/B OPERATOR-READONLY PASS_SCOPED / VB-04C DESIGN COMPLETE_LOCAL / NO ROOT OR VM WRITE / NO PR。** PR #2925（CI #7499 SUCCESS）已合并 `dev@427a7195`，P2-C3B 仅 Mac SQLite process-level PASS_SCOPED。最新操作者 Mac/Guest 回执确认 Recovery Clone 正在运行、原 Jammy VM 保持 poweroff、仅 Host-only NIC、Guest UID1000、Linux 5.15/systemd 249；`docker.service` 的 `/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock` 明确依赖 `docker.socket`，后者监听 `/run/docker.sock` 并可触发前者；containerd 独立 Unit，三个 Unit 目前 inactive/disabled、无 drop-ins/daemon.json 与相关正在运行进程。已形成 [VB-04C 安装依赖与撤回设计](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md)，区分可信安装与双回执、service+socket 准入、直接 dockerd/既有 shim writer/备份旁路、ARMING 竞态、G06 独立救援与预登记后禁止自动卸载。**未安装、未授权启动 Docker、未测试 P0-01A–F**；下一批提议 VB-04D1 仅离线 Unit/安装 manifest 合同/负例，P2-C3C/真实 root 另审批。`S03/G06/S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`；文档分支本地待审，未推送。

## 2026-10-24 — R2-A2-3 P2-C3B-001 Mac SQLite 进程级验收续记（本地文档）

**OPERATOR_TRANSCRIPT / MAC PROCESS-LEVEL PASS_SCOPED / P2-C3B-001 CLOSED_SCOPED / NO PR。** PR #2924 / CI #7497 Runtime 600/600 全绿，已 squash 合并 `dev@c8e1c13d`；操作者经用户态准确授权在 Mac 私有目录中完成 8/8 固定 Git blob 来源核验、原生 SQLite 22/22 测试、epoch2 两份历史回执重开读回、B05-A 未提交 SIGKILL 回滚和 B05-B 已提交后 SIGKILL 丢失响应读回（最终合成 epoch3/INCIDENT）。[完整范围/数据/不变量与限制](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md)。没有物理掉电、mTLS/Guest-to-Mac OFF_HOST 权威、Guard 实装或 P0-01；`S03/G06/S09 OPEN / C5-G2 NO-GO`。本批**仅文档**，未访问 Mac/VM/生产，待用户审阅再授权提交远端。

## 2026-10-24 — R2-A2-3 P2-C3A 离线 SQLite CAS 事务合同与失败测试本地实现

**MCP-WORKSPACE LOCAL IMPLEMENTED / TESTS NOT RUN / REVIEW PENDING / NO PR。** 用户明确授权仅在最新 dev 基线的 Runtime/Ops 工作区新建 V2 离线 CAS 提交/查询合同、受限用户态 SQLite 单写事务实现及聚焦负例测试，保留 P1/A2-1 DENY、现有 17 文件发布清单与生产/VM 边界。新增 `maintenance_off_host_cas_contract.py`、`maintenance_off_host_cas_sqlite.py`、`test_maintenance_off_host_cas_sqlite.py` 和 [P2-C3A 合同及失败测试记录](Runtime更新-R2-A2-3-P2-C3A离线SQLiteCAS合同与测试记录.md)。CAS 提交中验证独立登记、nonce/epoch/前驱、状态转换，并持久记录 head/commit/实验回执/成功审计；注入合成提交前与提交后响应丢失窗口。**实验记录明确不构成真实认证 OFF_HOST receipt、安装许可或 Boot Guard 允许启动。** 不新增依赖、Prisma migration、网络/服务/密钥，未在 MCP-workspace 运行测试，待审阅后单独授权远端 PR/CI。分支 `feat/runtime-r2a2-3-p2c3a-offline-sqlite-cas-20261024`；`P2-C3B NOT AUTHORIZED / P0-01 NOT_RUN / C5-G2 NO-GO`。

## 2026-10-24 — R2-A2-3 Jammy 隔离 VM Docker 离线基线与双快照状态对齐

**OPERATOR_TRANSCRIPT / VB-03 DOCKER_OFFLINE_INSTALLED PASS_SCOPED / TWO_SNAPSHOTS_REGISTERED / VB-04 NEXT / LOCAL DOC ONLY。** 10 月 23 日旧 Test-02（Ubuntu 24.04/Docker 缺失）记录保持历史有效；本轮用户另建 `SanQ-Runtime-Lab-Jammy-01` Ubuntu 22.04.5、systemd 249、Kernel 5.15，Host-only 唯一活动 NIC、Console-to-Mac SSH 指纹互证、1 vCPU/2 GiB RAM/2 GiB Swap。已登记 `SanQ-Jammy-Clean-Baseline-20261024`；经用户对**仅新机**明确批准，Docker/Ubuntu 签名+索引+本地 12/12 SHA 校验和无多余变更的离线 APT 模拟后安装 Docker CE/CLI `29.2.1`、containerd.io `2.2.1`、Compose `v5.0.2`，读回 runc `1.3.4`。临时 `policy-rc.d=101` 的标准服务启动拒绝在 `postinst` 可见，安装后 `docker.service/docker.socket/containerd.service` 均 `loaded/inactive/disabled`，临时策略移除、`dpkg --audit` 空；Guest 经身份/状态复核关机。Mac `snapshot list` 确认第二份 `SanQ-Jammy-Docker-Baseline-20261024` 为 current，第一份仍在；重试脚本的 `Original baseline mismatch` 来源是新快照已存在，**未重复创建**。证据仅为操作员对话日志与截图，私有 UUID/路径/SSH 指纹不入仓库；没有真实 snapshot clone/restore、当前新机 VDI 全链、daemon 运行/重启、同生产 unit/Engine API/live-restore 完整对照、合成 writer 或 P0-01 负例。详细：[VB-READ-001 §12](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md)、[R2-A2-3 §17](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)、[R0 当前状态](Runtime更新-R0冻结设计.md)。本次 MCP 操作仅为文档内容更新（未执行 Mac/Guest/生产命令），Runtime/Ops owner 与既有 `SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART` 设计不变，无代码/依赖/权限/CI/数据库架构改动；在分支 `docs/runtime-r2a2-3-virtualbox-readiness-audit-20261023` 本地审阅，**尚无远端 PR/合并**。下一阶段 VB-04 准确新机只读审计需要逐项明确授权；`P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`。


## 2026-10-23 — Test-02 VM 当前 Host running/Host-only 复核

**OPERATOR_TRANSCRIPT / EXACT_TEST02_HOST_RUNNING PASS_SCOPED / DOCKER_STACK_MISSING。** 用户在 Mac 宿主机原样回传 `VBoxManage list runningvms`，其中只有已批准 UUID 的 Test-02；随后 `showvminfo` 显示 Test-02 `VMState=running`、NIC1 `HostNetwork` host-only，NIC2–8 none、UUID/名称一致。这与同轮 SSH `ubuntu@192.168.56.2` Guest Ubuntu24.04.5/systemd255/Docker 缺失有一致性支持，但缺本次 Console host-key/boot ID 精确关联，证据仍限定 `PASS_SCOPED`。与此前只有 C2 恢复机运行的回执相比，**本次 C2 恢复机不在 runningvms 清单中，原因不明**；未开展对其的命令或假定关机原因。同步 [VB-READ-001 §11](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md) 与 R2-A2-3 §16，且未修改 VM/生产 Docker 或软件来源。进入生产 Docker/containerd/runc/Compose/systemd 版本比对提案审阅；实际安装须另行用户授权。仅本地文档，未推送；`VB-01/02 PASS_SCOPED / VB-03 DOCKER_MISSING / VB-04 RECOVERY_OPEN / P0-01 NOT_RUN / C5-G2 NO-GO`。

## 2026-10-23 — VB-03 Guest SSH 系统版本与 Docker 缺失审计

**OPERATOR_TRANSCRIPT / OS-SYSTEMD_OBSERVED / DOCKER_STACK_MISSING / P0-01 NOT_RUN**。用户从 Mac 使用 `ssh ubuntu@192.168.56.2` 并贴出 Guest 非 root 命令输出：Ubuntu 24.04.5 / Linux 6.8.0-146 x86_64 / systemd 255（255.4-1ubuntu8.17）、UID/GID 1000、`/dev/sda2 ext4`。没有 Docker CLI/Engine、Compose、containerd、runc；`systemctl show` 见两份 `LoadState=not-found`，G3 回传命令本体有拼贴错位，未补验真正独立命令退出码。本轮操作者以 SSH 而非计划的 VirtualBox Console 验证，**没有新鲜 VBoxManage running VM 与 Console SSH host-key pin 回执证实本 SSH Session 与唯一目标 Test-02 UUID 的精确绑定**；先保留 `CURRENT GUEST ENV OBSERVED / EXACT-VM SESSION BINDING PENDING`，不伪称全部 VB-03 通过。因 Docker stack 不存在，目前不具备 P0-01 Docker daemon/restart manager/socket/live-restore 实测能力。Ubuntu 命令提示安装版本只是发行包候选，不授权 sudo apt 安装；后续先独立只读核实生产 Docker/containerd/runc/Compose/systemd 版本、Test-02 已准身份和可恢复策略，经用户另批批准才可安装/修改 Sandbox。更新 [VB-READ-001 §10](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md) 与 [R2-A2-3 §15](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)，**只在 MCP-workspace 本地文档续记、无 Host/Guest/生产实际工具调用、不推远端**。门禁 `VB-03 DOCKER_MISSING / VB-04 RECOVERY_OPEN / VB-06 NOT_AUTHORIZED / P0-01 NOT_RUN / S03-G06 OPEN / C5-G2 NO-GO`。

## 2026-10-23 — VirtualBox Test-02 VB-03 开机及非 root Guest 读取获得授权

**EXACT-VM START AUTHORIZED / OPERATOR EXECUTION PENDING / NO INSTALL OR P0-01。** 用户在对话明确授权仅开机 `SanQ-Linux-Test-02` 的准确已核 VM UUID，并以 VM 本地控制台普通账户执行 VB-03 只读版本/状态检查。此前已完成 Host-only 网络/转发静态配置限定验证、Base→Child VDI 双向链 `PASS_SCOPED`，恢复仍 OPEN。本轮通过聊天给出 Mac 预检 `showvminfo` 与 `VBoxManage startvm <exact UUID> --type gui`（未执行；MCP 不连接 Mac），Guest `id`/OS/kernel/systemd/Docker Engine/Compose/containerd/runc/daemon/socket/live-restore 只读命令，遇缺少或拒绝即保留错误，不升级权限。不授权 `sudo`、安装软件、变更 Docker/unit/网络、Snapshot、故障注入或操作 C2 恢复 VM。已同步 [VB-READ-001 §9](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md) 与 R2-A2-3 §14。待操作者实际回传，状态 `VB-03 START AUTHORIZED / START/GUEST EVIDENCE PENDING / P0-01 NOT_RUN / C5-G2 NO-GO`；只有本地文档更新，未推远端。

## 2026-10-23 — VirtualBox Test-02 两级磁盘元数据链完成（VB-READ-001）

**OPERATOR_TRANSCRIPT / MEDIA_METADATA_CHAIN PASS_SCOPED / RECOVERY NOT_VERIFIED。** 用户在 Mac 上只读回传 Test-02 现役差分盘指定的准确 Base Parent：`Parent UUID=base`、`Type=normal(base)`、`State=created`、VDI/25600 MBytes、物理占用 4345 MBytes；`Child UUIDs` 与上轮当前 Test-02 差分盘 UUID 精确互相对应，`In use by VMs` 指向 Test-02 及其 Clean Baseline 快照。**双向父子关系与 VM/Snapshot 归属元数据完整**，但没有做盘块内容校验、Guest boot、Snapshot clone/restore，所以 `VB-04 MEDIA_METADATA_CHAIN PASS_SCOPED / RESTORE OPEN`，不是完整恢复 PASS。当前 Host-only/转发静态证据已足以进入下一个门禁的**审批**，Test-02 仍关机；仅获得用户明确开机授权后才可从其控制台以非 root 运行 Guest OS/systemd/Docker/Compose 只读版本检查。开机有 Guest 盘写副作用，不自动授权安装/启停 daemon、变更配置、快照动作或 P0-01。同步 [VB-READ-001 §8](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md) 与 [R2-A2-3 §13](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)。本地文档，未 push/PR/生产操作；`VB-03 GUEST NOT_RUN / S03-G06 OPEN / C5-G2 NO-GO`。

## 2026-10-23 — VirtualBox Test-02 差分盘父链与 Host forwarding 续报（VB-READ-001）

**OPERATOR_TRANSCRIPT / MEDIA_CHILD_PASS_SCOPED / PARENT_CHAIN OPEN / GUEST NOT_RUN。** 用户 Mac 原样回传已附着 Test-02 的 VDI `VBoxManage showmediuminfo`：子盘 UUID 与 `showvminfo SATA-ImageUUID-0-0` 相符，`Type=normal(differencing)`、`State=created`、`Parent UUID` 非 base、虚拟容量 25600 MBytes、差分 VDI 占 92 MBytes、`In use by VMs` 仅 Test-02；这是**现役 child VDI 关联核验**，还没有 parent/base medium 本身的读回、链完整性或可恢复证明。另有 `list hostonlyifs` stdout 空（复现 10-22 现场），Mac `net.inet.ip.forwarding=0`、`net.inet6.ip6.forwarding=0`，配合 NIC1 Host-only/其余 none 加强隔离配置证据；VirtualBox 7 Host-only Network 与传统 Host-only Adapter 分开，空 hostonlyifs 不据此判为网络失败或 Guest 实际已连通。详见 [VB-READ-001 §7](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md) 与 [R2-A2-3 §12](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)。下一 Host 只读步骤：精确当前 Parent UUID 的 `showmediuminfo disk`，若非 base 继续沿链逐级读；**尚无 Guest 开机、快照恢复、Docker 安装或 Guard 故障测试授权**。仅改 MCP-workspace 本地文档，未推远端。门禁 `VB-01/02 CONFIG PASS_SCOPED / VB-03 OPEN / VB-04 PARENT_CHAIN+RESTORE OPEN / VB-06 NOT_AUTHORIZED / P0-01 NOT_RUN / C5-G2 NO-GO`。

## 2026-10-23 — VirtualBox Test-02 当前 Host 配置回传（VB-READ-001）

**OPERATOR_TRANSCRIPT / CURRENT HOST CONFIG PASS_SCOPED / GUEST NOT_RUN。** 用户在原 Mac 回传 VirtualBox `7.0.26r168464` 的 VM 列表（4 台）与 runningvms（仅既有 C2 恢复机运行），并针对明确选定的 Test-02 VM UUID 提供 `showvminfo --machinereadable`、`snapshot list --machinereadable`、`list hostonlynets`：Test-02 `poweroff`、配置/hardware UUID 匹配，`1 vCPU / 2048 MB`，NIC1 `hostonlynetwork HostNetwork`、NIC2–8 none，Clipboard/DragDrop disabled，无共享目录映射显示，Host-only Network Enabled（192.168.56.0/24）。快照 `SanQ-Runtime-B4B2-Clean-Baseline-20261017` 在两条命令中一致，当前 SATA 盘明确指向 Snapshots 目录的一个 VDI；但**该当前 VDI 的父盘/差分介质链尚未取证，不等于快照能安全恢复**。本次用户输出未给每条 rc/离机 hash 及当前 Host forwarding/hostonlyifs；Guest 未启动，Docker/Compose/containerd/systemd 版本仍 OPEN。保留真实 VM/disk UUID、MAC、私有路径于操作者原件/对话，**不写入公开仓库**。已同步 [VB-READ-001 §6](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md)；后续先准确 VDI `showmediuminfo` 与 Host forwarding **只读**，尚未获准启动 Test-02 或创建/恢复快照、安装 Docker、重启 daemon、故障注入。**只更新本地文档，未提交远端**。门禁 `VB-01/02 HOST CONFIG PASS_SCOPED / VB-03 OPEN / VB-04 CHAIN+RESTORE OPEN / VB-06 NOT_AUTHORIZED / P0-01 NOT_RUN / C5-G2 NO-GO`。

## 2026-10-23 — R2-A2-3 VirtualBox VB-READ-001 环境核验第一轮

**LOCAL DOC AUDIT / HISTORICAL EVIDENCE REUSED / MAC ACCESS UNAVAILABLE / P0-01 NOT_RUN。** 用户批准启动 R2-A2-3 VirtualBox 环境核验；从已合并 PR #2921 的 `dev@24cc2e2efc331d8024b09ab5de1e96151f5f67be` 新建本地分支 `docs/runtime-r2a2-3-virtualbox-readiness-audit-20261023`。按 AGENTS/CI/R0/R2-A2-2/A2-3 复核 2026-10-22 [A0-SITE-001 Host §6](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md) 与 [A0-GUEST-001](R1C-2C-C-C1-SYN-001-A0-GUEST-001只读身份复核.md) 已有真实私有回执的**技术总结**：Host 8/8 rc0、17/17 SHA、host-only/其余 NIC none、forwarding0；Guest/Host 13/13 rc0、28/28 SHA、控制台 ED25519 pin + strict SSH、非 root 1000。限定采信历史 `PASS_SCOPED`，并不等于新一次现场状态；现有 MCP 无 Mac/VirtualBox Host 通道，无法实际读取 Guest Docker/systemd 版本或验证快照恢复。新增 [VB-READ-001 审计和最小只读命令包](Runtime更新-R2-A2-3-VB-READ-001环境核验与下一步审批.md)，在已确认同一私有 VM UUID 后先 Host `VBoxManage` 只读回读，再 Guest 原控制台非 root 探测 Docker Engine/Compose/containerd/runc/systemd/live-restore 与容器/卷；保留原件于 Mac 私有目录。同步 [R2-A2-3 §10](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)，**仅 3 个文档改动**，没有新代码/权限/VM/Host/AWS/生产变更，没有执行现场命令，没有远端 PR。门禁 `VB-01/02 HISTORICAL PASS_SCOPED-CURRENT UNKNOWN / VB-03 OPEN / VB-04 PARTIAL / VB-05 OPEN / VB-06 NOT_AUTHORIZED / P0-01 NOT_RUN / S03-G06 OPEN / C5-G2 NO-GO`。

## 2026-10-23 — 撤回 GitHub Runner VM 探针，转向 VirtualBox 首验

**USER-AUTHORIZED REVERT / VIRTUALBOX SELECTED / P0-01 NOT_RUN。** 用户确认放弃 PR #2920 的 GitHub 嵌套 VM 探针，改用已有独立 VirtualBox Ubuntu 测试 VM。[PR #2920](https://github.com/sanqin888/sanqinMVP/pull/2920) 原在 CI #7489 全绿后合并 `dev@ae47a8ee48e833235c658a84b3711cdc62dc49cc`；独立 [Actions #39993752638](https://github.com/sanqin888/sanqinMVP/actions/runs/39993752638) 虽 workflow SUCCESS，**真实 capability=BLOCKED / KVM_UNAVAILABLE；QEMU/GUEST/P0-01 NOT_RUN**。新分支 `revert/runtime-github-vm-probe-virtualbox-20261023` 通过独立逆向 PR 删除原增量的 `.github/workflows/runtime-vm-capability.yml`、Runner probe、对应 unittest 与 GitHub 专属设计文档，不重写历史 PR/CI 或削弱常规 CI；同步 [R2-A2-3 §8–9](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)、R0 和依赖图。此前 R2-A2-1/2 源码、通用启动屏障设计及 17 Bundle 均保留。VirtualBox 下一步严格从 **VB-01..VB-06 只读身份/版本/Host-only/可恢复前置核验**开始；任何 VM Guard/断电故障注入都需要进一步单独授权。当前仅代码仓库撤回，**不执行 VM/Host/生产操作**。门禁 `P0-01 NOT_RUN / S03-G06-S09 OPEN / C5-G2 NO-GO`。

## 2026-10-23 — R2-A2-3 GitHub Runner 隔离 VM 能力探针首批本地实现

**历史记录：当时 LOCAL IMPLEMENTATION；后续已 PR #2920 CI #7489 SUCCESS 合并，但独立能力探针 KVM_UNAVAILABLE / BLOCKED；现按上方退役记录撤回（非 P0-01）**。用户批准先将前批文档提交远端后，PR #2919 在 CI #7487 SUCCESS、squash `0f4579301f429bf0da378e925c164108f9a731d4` 后合并 `dev`；据此新建本地 `feat/runtime-github-runner-vm-capability-probe-20261023`，开始实现 GitHub-hosted Runner 虚拟化可行性实验（**非 A2-3 Guard 安装与非 P0-01**）。新增 `.github/workflows/runtime-vm-capability.yml` 独立同仓 PR/dev 路径触发、read-only contents/22min/7 天 evidence；`ops/runtime/probes/github_runner_vm_capability.py` 探测 KVM 权限、CPU/内存/空间，只有 KVM 能用才临时安装 QEMU/OVMF、取得 Canonical Ubuntu 24.04 qcow2（HTTPS 同站 SHA256 校验）、用**无网络 Guest** 实测两次 systemd marker 与一次 QEMU reset；`ops/runtime/tests/test_github_runner_vm_capability.py` 对 SHA 唯一性、marker 识别、KVM 缺失 BLOCKED、永不自称 P0-01 PASS 做纯合成 unittest。同步 [历史 GitHub 探针工作包（PR #2920 源码归档）](https://github.com/sanqin888/sanqinMVP/pull/2920/files)、[R2-A2-3 实验计划 §8](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)、R0、工作日志与依赖图不变声明。既有主 CI/17 Bundle/NormalUpdateFlow/A2-1 安全合同均保持，未更改 Docker/Host/systemd/密钥/权限/生产。MCP workspace 不能运行 lint/build/test；**目前仅本地实现，未触发真实 GitHub Runner**，不把工作流 SUCCESS 等同 KVM/Guest PASS；尚未推远端/PR，用户需再次授权。门禁 `KVM UNKNOWN / P0-01 NOT_RUN / S03/G06/S09/R2-C4 OPEN / C5-G2 NO-GO`。

## 2026-10-23 — R2-A2-3 Boot Barrier 同版本隔离 PoC 首验准备与持久化依赖

**LOCAL DOC READINESS / USER REVIEW REQUIRED / P0-01 NOT_RUN / NO PRODUCTION MUTATION。** PR #2918 已在 `CI #7485 SUCCESS` 后合并 `dev@d74992970c079a582b76d82db5ea8fc4b96aa7b2`，按“合并后开始下一步”从最新 dev 新建 `docs/runtime-r2a2-3-boot-barrier-isolated-poc-plan-20261023`，只读复核 R0 / R2-A2-1、A2-2、R2-A1 宿主证据及 Docker/systemd 原理。新增 [R2-A2-3 隔离 PoC 就绪与持久化前置审计](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)，将已批准的 `SAFE_STOP_DOCKER_ON_UNCERTAIN_RESTART` 实现前首验拆为 P0-01A～F：隔离 VM 原始 always、只改合成 API restart=no 后断电、ARMING 部分提交/重启、daemon-only/live-restore、socket activation、直接 dockerd、Host/SSH 独立救援与不可无授权撤销。首项不通过绝不走资源/插件实现；P0-02～04 依序覆盖等价生产资源写者、真实状态排他/CAS/离机回执、AuthZ 故障。已确认当前助手执行容器为 Debian 13/supervisord、无 Docker/完整 systemd/虚拟机，因此**不能声称同版本 PoC 已执行**；VirtualBox 既有 Ubuntu 24.04.5 仅候选，其 Docker 版本/Host 身份/配置/可丢弃性仍须独立预检。没有使用生产 VM、Clover/PG 数据/密钥，也未更改源码/模型、Compose、系统权限、17 Bundle、AWS 或 Docker。**A2-3 持久化未实现；P0-01 NOT_RUN / S03/G06/S09/R2-C4 OPEN / C5-G2 NO-GO；本地文档等待审阅授权，未推远端。**


## 2026-10-23 — R2-A2-2 Maintenance Fence 实际禁入适配、安装与撤回方案

**LOCAL DOC DESIGN / USER REVIEW GATE / NO ADAPTER IMPLEMENTATION / NO PUSH。** 用户明确要求先明确 Docker、Compose/deploy、备份入口的禁入方案与安装权限/撤回方式，**审阅授权后再实现**。最新 `origin/dev@fac45616` 已含 PR #2917 的 R2-A2-1 离线模型/25 合成负例；新建 `docs/runtime-r2a2-2-fence-adapter-permission-design-20261023`。复核 AGENTS、ops_runtime CI、R0/AWS Snapshot、R2-A1 Host H14–H18、R2-A2-1 现有完整源/测试与 `deploy_release.py`、`backup-db.sh`、systemd backup service/sudoers/helper 及 Compose。新增 [R2-A2-2 设计审批文档](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md)，约束 Docker 四业务容器的原 restart policy 与 ID/镜像/卷、启动禁止/受控 stop、Clover host-network SANDBOX 保留、`docker.socket` 管理不一刀切停止、deploy/rollback --execute/Compose up/run 绕过、backup timer/脚本/远端 rclone sync/delete 和 root helper 并发副作用。

**需要分别审阅的边界：**仅靠包装命令、timer disable、单次 stop/restart=no **不能防止**直接 Docker Engine API/ubuntu Docker socket/root 脚本绕过；Docker AuthZ/独立可信拦截可能需 daemon/socket/身份/服务重启新权限，先单独隔离同版本 PoC，**绝不本批安装**。当前 A2-1 `frozen_policy` 对 CONTROL SYSTEMD 固定 `masked`，但本地 backup unit 的 `/etc/systemd/system` 形态可能使普通 mask 失败，不能未经授权改该合同或假报已经符合。方案列拟定受保护 root 安装路径、原策略机内/离机 receipt、CAS/epoch、受限 sudo/操作者、预激活可撤回与 INCIDENT 绝不卸载、全量负例及 G06/S03/S09 预决条件。同步 [R2-A2-1 §7](Runtime更新-R2-A2-MaintenanceFence离线模型与失败测试.md)、R0、worklog，**只变文档**；未加 Host adapters、unit、权限、MCP allowlist、Docker auth 插件、17+Manifest、CI、依赖、schema/Prisma/migration、AWS/VM/生产操作。本地 MCP 无 lint/build/test，审阅后等用户授权远端；实现需另外精确授权。`R2-C4 OPEN / AWS S01–S12 OPEN / G06 OPEN / C5-G2 NO-GO / S2 DAILY EXPANSION PAUSED`。 **同日设计补充（用户已选择安全优先失败模式）：**在此本地分支更新 [R2-A2-2](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md) §2/§3.1/§3.2/§4/§6.1/§7–§8，并同步 [R2-A2-1 §8](Runtime更新-R2-A2-MaintenanceFence离线模型与失败测试.md) 与 R0。P0-01 规定“API 已设 restart=no，DB/Web/worker 尚 always 即断电”须由跨 boot Host/systemd guard **先阻断整个 Docker daemon 自动启动**，允许 Clover Sandbox host-network Tunnel 因 Docker 不可用而暂时离线，但未中断的正常维护仍不主动改它；事故态不能把 A2-1 SANDBOX/PRESERVE 观察假报 FROZEN。P0-02 资源级禁入覆盖生产 DB local volume、Uploads/Runtime、Docker socket、Host/网络路径及已存在 writer；P0-03 显式状态表区分已安装但未启用、ARMING、FENCED、INCIDENT、文件损坏及离机不可达，缺状态不自动解除；P0-04 AuthZ GET 失败与独立 SSH 救援。A2-3 真持久化/离机 CAS/epoch 之前只能离线/隔离验证，且未选定具体插件/代理/安装 Hook。**此次本地仅编辑文档，没有实现、部署、重启 Docker 或提权；尚未推远端。**

## 2026-10-23 — R2-A2-1 Maintenance Fence 离线模型与失败测试

**SOURCE CI VERIFIED / DEV DELIVERY AUTHORIZED。** 用户授权开始 R2-A2 离线模型/失败测试；基于 PR #2916 已合并的最新 `origin/dev@64f9968f9e1dab2cbed2fc10390466a89afd6cb2` 创建 `feat/runtime-r2a2-offline-maintenance-fence-20261023`。复核完整 AGENTS、当前 R0/AWS/R2-A1-HOST-READ-002、现有 NormalUpdateFlow/原维护合同/测试和 ops_runtime CI。Runtime/Ops 内新增 `maintenance_fence_contract.py`、`maintenance_fence.py` 与 25 个聚焦 unittest：准确原策略和 writer/startup 分类、owner/txid/epoch/request/registry 绑定、双份持久化意图回执、连续新鲜观察、事故与只供复核的重载；所有业务 verdict DENY，模型权限恒 false。Synthetic Host/双 bytes 覆盖部分冻结/两份记录分叉/中断、旧回执/错误身份、容器重建/策略漂移、凭据/管理/外部事件未知；Clover 开发 Tunnel、SSH/docker.socket/系统任务保持 PRESERVE。**没有真实持久化/CAS/跨进程锁、Host/AWS/安装/恢复放行 adapter，也未对接 NormalUpdateFlow；本地源码不证明生产屏障成立。** A 类纯新增内部切片，仅同 owner/标准库依赖；无业务 owner/跨上下文边/债务/SCC/scanner baseline/兼容/17 Bundle/CI/锁/Prisma/migration 改动。同步 [R2-A2 工作包](Runtime更新-R2-A2-MaintenanceFence离线模型与失败测试.md)、依赖图和 R0；按工作日志容量规则核对现卷全文低于 1,000,000 UTF-8 字节，不需分卷。用户审阅后已授权远端交付，[PR #2917](https://github.com/sanqin888/sanqinMVP/pull/2917) → dev；源码提交 `8d2425d9a63112a795c1c73ca7ce18c04ea08165` 的 [CI #7482](https://github.com/sanqin888/sanqinMVP/actions/runs/39969268220) SUCCESS，ops-checks Runtime `559 tests / OK`（含本批 25）、Release `45 tests / OK`、Runtime shell 语法检查通过，无需 CI 修复。当前同批只补验证记录，最终文档 head 仍需全绿，merge 状态/SHA 以 PR 事件为准。MCP 未开放 lint/build/test，未本地执行；无生产/SSH/Guest/root/Docker/AWS 动作。**R2-C4 OPEN / S01–S12 OPEN / R1-C1 OPEN / G06 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED**；本批远端交付已获授权；后续 adapter/安装/生产实施仍需对应独立授权。

## 2026-10-23 — R2-A1 HOST-READ-002 现场 H14–H18/G03/G05/G07 收口与文档同步

**DOCUMENTATION ONLY / LOCAL REVIEW / NO PUSH / NO PRODUCTION MUTATION。** 原 HOST-READ-002 文档由 PR #2915、CI #7478 SUCCESS、squash `3ba4ac2b2496c5b1411ff16f3d5a65499d68133f` 进入 dev；本次从最新 `origin/dev` 建独立分支 `docs/runtime-r2a1-host-evidence-closeout-20261023`，将随后经用户批准在生产 SSH 和 Cloudflare 控制台取得的 H14–H18、G03 root Cron、G05 Release State、G07 存储证据同步到 [HOST-READ-002 §§8–12](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) 与 [R2-A1 §10](Runtime更新-R2-A1真实生产清单与接口只读核验.md)。记录每批可见的 UTC 时间、rc、SHA、策略、异常和推论边界；受保护原文/Cloudflare Token/证书/`.env` 不进 Git。历史「尚未执行」条款仅表示当时审批状态，不覆盖本轮后来执行的真实查询。

**核验：**H14 全量 systemd service/unit/socket `rc0`，确认 `docker.socket`、备份 timer、SSH/MCP/SSM、EIC 配置状态；H15 system Cron 精确规则/daily/weekly 和 apt/unattended 当前周期，root 私有 Cron `no crontab for root rc1`（正常空任务），APT unattended 自动整机重启未启用（默认 False，仍有升级重启单项服务风险）。H16 Runtime Manifest SHA256 `6f4fe7d6…`、`sourceSha=a84b7200…`、17/17 内容/权限 `PASS`，经单独批准的 sudo 字段只读确认 Release State `active/current=ff5be8d5…/previous=a84b7200…`；生产未升级最新 Image 属有意保留。H17 deploy/backup/helper 三份已安装 SHA 与 Manifest 一致，Docker/rclone 可见。H17/H18 的 `sanq-clover-dev-cloudflared` 为 Host-network `unless-stopped` 的独立 Clover MacBook Sandbox 公网入口；Cloudflare 页面显示 `clover-dev.sanq.ca → https://127.0.0.1:18080`、受限 OAuth route、TLS SNI/CA Pool，`18080` 当时无 listener，不能宣称端到端连接或实际生产写入隔离已验证。G07 四个持久化目录为 `/dev/nvme0n1p1` 根盘，PostgreSQL volume `sanq-app_pgdata` local、无自定义 options；直接路径 `findmnt/stat rc1` 受权限阻断，后由 DockerRootDir/内核 mounts/lsblk 作高可信交叉证明，保留失败回执。

**最终有界门禁：`G01 PASS_SCOPED / G02 PARTIAL / G03 PASS_SCOPED / G04 PARTIAL / G05 PASS_SCOPED（独立 provenance 未完成）/ G06 OPEN / G07 ROOT_DISK_COVERAGE PASS_SCOPED 且 OVERALL PARTIAL / R2-A1 INVENTORY ENOUGH FOR OFFLINE R2-A2-1 ONLY / R2-C4 OPEN / S01–S12 OPEN / C5-G2 NO-GO`。** 尚未验证独立救援登录、跨 daemon/VM 维护锁、云快照/真 AWS 新实例恢复、PG WAL/外部事件一致性、长期 S2/离机恢复；Clover 开发隧道必须按保留类独立处理而不能与生产容器同停。本次只改文档/R0 状态索引/worklog；MCP workspace 不执行 lint/build/test，未运行新 Host 命令、未更改 systemd/Cron/Docker/IAM/AWS/网络/DB/镜像，也未推远端或建 PR。下一步离线 Fence 模型开发及任何后续生产动作均需对应独立授权。

## 2026-10-23 — R2-A1-HOST-READ-002 生产入口、Cron 与实装身份延续审计

**LOCAL DOC-ONLY / HOST H14–H17 PROPOSED NOT EXECUTED / G02–G03 PARTIAL / G04–G07 OPEN / NO PUSH。** 复核已合并 PR #2913/#2914（#2914 CI #7476 SUCCESS），已 fetch 的 `origin/dev@d98acb089448836bdfef82fa5c498329b027ba52`；新建独立本地分支 `docs/runtime-r2a1-host-read-002-20261023`。按 AGENTS、CI、R0、AWS 合同、现有 R2-A1 §7/§8 和 Runtime/Release/Backup/MCP 源码，只用已有 MCP `system_status`/`docker_status` 新鲜核对 UTC 12:20:56 四个 sanq-app 服务 healthy、Docker/MCP Tunnel active、应用镜像 `ff5be8d5…`。保留 4/4 restart=always、DB volume、Uploads、sounds、15 timer 与 ubuntu 空 Cron 的原操作员限定证据，不复查已充分确认项，也未用 GitHub main/dev SHA 替代已安装 Runtime identity。新增 [HOST-READ-002 审计与 H14–H17 精确只读候选](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md)，详细登记全量 service/unit、Cron 规则/权限、apt/unattended、真实 Runtime 17+Manifest owner/mode/SHA256/Release state、deploy/backup/rclone/Cloudflared、SSH/EIC/SSM/MCP、磁盘/DB/外部事件恢复覆盖和 R2-A2 最小适配器顺序。所有 Host 查询（包括带 sudo 的 root Cron）均**未执行且需独立批准**；无 Docker/systemd/Cron/IAM/AWS/生产变更，无代码/依赖/CI/Prisma/17 Bundle 修改。**G01 PASS_SCOPED / G02–G03 PARTIAL / G04–G07 OPEN / R2/C4 OPEN / S01–S12 OPEN / C5-G2 NO-GO**；A2 只具备离线设计/合成准备条件，生产冻结/快照仍禁止。MCP workspace 不具备 lint/build/test 权限；本地文档待审阅，未提交远端，远端交付需另获用户批准。

## 2026-10-22 — Runtime R2-A1 / MAINT-RESTART-01 真实生产清单与接口只读核验

**LOCAL DOC-ONLY / MCP LIVE PASS_SCOPED / HOST READ-001 PROPOSED NOT EXECUTED / NOT PUSHED。** 继已批准 AWS 维护冻结合同，从最新 `origin/dev@5e1b9608` 创建 `docs/runtime-r2a1-live-inventory-readonly-20261022`，读取 AGENTS、R0、AWS 合同、CI、现有 NormalUpdateFlow、deploy/backup/MCP 源码与 10-09 C4 历史验收。2026-10-22 19:34 UTC 实际 MCP 只读观测 Docker/MCP tunnel `active`、`sanq-app` 4/4 容器 `Up (healthy)`、配对应用镜像 `ff5be8d5…`；`main@ef5caa32` 是 GitHub 生产源码视图，不等于实际安装 Runtime SHA。生产 Compose 的四个 `restart: always` 仅属 source contract，MCP 不能读实际 container RestartPolicy/Mounts、systemd/cron、非容器写入者与独立 SSH 管理通道；现有 deploy Compose up/run 和 backup timer/helper 属须覆盖的风险入口。新增 [R2-A1 现场核验与 Host H01–H10 精确只读审批候选](Runtime更新-R2-A1真实生产清单与接口只读核验.md)，区分 LIVE/SOURCE/HISTORICAL/UNKNOWN，**不自行执行候选 SSH/Host 命令、不提升 root/sudo/生产权限、不碰 Docker/VM/AWS**。本批仅 docs，不改 owner、跨上下文依赖/图、17 Bundle、运行时源码/CI/依赖/Prisma/schema/迁移/生产；MCP 无本地 lint/build/test，首次远端交付待审阅另批授权。R2-A1 总体 PARTIAL，R2/C4 与 R1/C1 OPEN、G2 NO-GO、S2 DAILY PAUSED。 **2026-10-23 同批实测续记（LOCAL）**：生产 SSH H01–H07 显示准确四容器 `restart=always`、running/healthy、RestartCount=0、DB volume `sanq-app_pgdata` 与 API/worker uploads RW、Web sounds RO，docker/nginx/ssh/MCP 及 backup timer/service 真实状态；用户随后上传 H08–H10 终端清单，观察到 `cron`、Ubuntu apt/unattended-upgrades、SSM、MCP tunnel/uv/python3 和 Docker 容器进程，未见瞬时 rclone/deploy/compose；H08/H09 部分 unit 名截断，命令逐项 rc/独立封存缺失。已在 [R2-A1 §7](Runtime更新-R2-A1真实生产清单与接口只读核验.md) 记录 PASS_SCOPED 及 H11 完整 unit 名、H12 cron、H13 Runtime 取证候选（尚未执行）。G01 关键事实确认，G02 核心 unit 已确认但全量 OPEN，G03–G07 OPEN；生产正常运行，未变更策略、快照、权限、源码或 CI，维持 R2/C4 OPEN、G2 NO-GO。 **2026-10-23 H11/H12 续记（LOCAL）**：收到操作员 `systemctl list-timers --all --full` 完整15项 timer 清单（仅 `sanq-backup.timer` 为已识别 SanQ 自有 timer），`ubuntu` 的 `crontab -l` 仅注释而无调度行，`/etc/cron.d|hourly|daily|weekly|monthly` 已列普通文件名但未读执行规则。H11 的全量 service `--full` 未复查，root/其他用户 cron、`/etc/crontab` 与系统 Cron 文件正文仍未核实；判定 `H11 TIMER PASS_SCOPED / H12 UBUNTU PASS_SCOPED / G02 PARTIAL / G03 PARTIAL / G04–G07 OPEN`，详见 [R2-A1 §8](Runtime更新-R2-A1真实生产清单与接口只读核验.md)。未执行任何服务状态变更，生产仍营业，仍禁止冻结/快照/Runtime 正式更新；本地文档待审阅，不推远端。

## 2026-10-22 — C1-SYN-001 A2-II-R2 实际只读取证离机复核

**LOCAL EVIDENCE REVIEW / NO PUSH。** 用户从 Mac 运行冻结 R2 操作器后回传 `A2-II-R2-20261022T190353Z.zip`（SHA256 `3a2703c9284937a357f6d1262e9599034e0157bd3feada359dc19ed18f1b82d3`），整包 82 ZIP 条目、80/80 SHA256 清单重算匹配、39/39 stdout/stderr bytes/SHA 与 receipt 一致，27×rc0 与12×受控 `test -w rc1`，无 timeout/budget/gap。操作器 SHA 与冻结 §6 一致，Host/SSH ED25519、UID/GID/boot 一致，当前 session-37.scope 前后相同。R07 三个层级 root:root 0755、所有 9 个控制文件 root:root mode644/644/200，**UID1000 检查的12目标无直接写权限**，无法声称有 delegated cgroup；R08 A1 ext4 `rw,relatime` 无已配置 project quota 证明、cgroup2 mount `nsdelegate` 也不是用户委托凭据，8MiB aggregate 硬限制与异常 detached child 无孤儿保证仍 BLOCKED。操作器的 STATIC_METADATA_FORMAT_UNEXPECTED 等是 success 时仍返回固定失败 note 的 UI 缺陷，原始 39×`candidateMatch=true`；不重跑、不修改私有原件。本地补充 [R2 §7](R1C-2C-C-C1-SYN-001-A2-II-R2委托权限与Quota精确核验审批.md)、R1-C §29、R0；环境/权限调整方案后续必须说明影响与备选并获用户授权。**A2-S/A3/A4 NOT AUTHORIZED / C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED**；未操作 Guest/生产，未提交远端。

## 2026-10-22 — C1-SYN-001 A2-II-R2 cgroup delegated 与 ext4 quota 精确核验准备

**LOCAL DOC-ONLY / GUEST R07/R08 NOT EXECUTED / NO PUSH。** PR #2911 经 CI #7470 SUCCESS squash merge `dev@f62ee2c31e3527d75e373c1c5aa0f9870716e94a`，A2-II-R R01–R06 原件已 scoped close。新本地分支 `docs/runtime-c1-syn001-a2iir2-precise-capability-20261022` 结合 AGENTS/Runtime CI、R2 取证前提和 Linux cgroup v2 官方委托模型，新增 [R2 精确只读审批包](R1C-2C-C-C1-SYN-001-A2-II-R2委托权限与Quota精确核验审批.md)，冻结 R07.0 新鲜 `0::/user.slice/user-1000.slice/session-N.scope` 动态目录严格 allowlist，R07 stat/`test -w` 只查当前 UID slice、相关 `cgroup.procs`/`cgroup.subtree_control`/`cgroup.kill` 的静态元数据/访问候选，R08 同期只读 findmnt/statfs/已知块设备节点元数据，明确绝不修改 cgroup、启用 quota、根权限、真实 strace、Guest source/raw；规定命令时间/字节预算和 raw SHA 回执/失败冻结。**读取权限本身不等于实际 delegated cgroup/cgroup.kill 权限**；无法证明聚合 8MiB 硬限制、断线时所有后代终止，保持 A2-S/A3/A4 禁令。文档新批次在本地修改后停止，未现场执行、未提交远端。Mac 批处理只读候选 `A2-II-R2-Guest-ReadOnly-20261022.py` SHA256 `73d6a2e3477d1228cba777338b413afee29b53d30597a866eb2be6e6e5495dd7` 另作本地文件而不加入 Git，Python 语法编译/纯离线范围与正负例检查完成，等待真正现场授权。

## 2026-10-22 — C1-SYN-001 A2-II-R 现场只读原件离机复核

**LOCAL DOCS / GUEST READONLY PASS_SCOPED / HARD QUOTA & CHILD CONTAINMENT OPEN / NO PUSH。** 用户上传 `A2-II-R-20261022T183900Z.zip`（整体 SHA256 `fba18c72a6df84cd88cbb3a0fdbe11873778933d22a3a1dfb5e72a5030234689`），直接离线读取 ZIP 32 条目（1 目录、31 文件）、CRC OK、SHA256SUMS 30/30 匹配；14/14 Host+Guest 原始命令 rc0/no timeout/overBudget/gap，receipt stdout/stderr 各字节长度/SHA 与 ZIP 一致。操作器 SHA `d6e8b37a095ff12167db4ae533f45b9beff02313c91816e693697ac27489b7ca`，控制台 SSH ED25519 公钥 wire 指纹重新计算与批准 pin 匹配；与 A0-GUEST/A1-SOURCE 两批私有原始包交叉证实 Guest host key、UID/GID、boot 原始记录相同。Guest 当前 `0::/user.slice/user-1000.slice/session-34.scope`、root controllers `cpuset cpu io memory hugetlb pids rdma misc`、root subtree `cpu memory pids`、A1 ext4 root mount `rw,relatime`、strace 6.8、非 root 1000/1000；这些只证明现场读到的能力候选，不证明 delegated subtree/cgroup.kill、已配置 project quota、8MiB 全量硬限制或 SSH 断线所有 tracee 清退。独立限定裁定 `A2-II-R READONLY EVIDENCE PASS_SCOPED / RESOURCE GUARANTEES BLOCKED`，所有 operator 原始授权字段 false 不改。将结果同步 A2-II-R §5、R1-C §27、R0；下一阶段提议 R07/R08 更有针对性的**只读**权限和 quota 核验，待新命令范围获独立审批。**未执行额外 Guest/SSH/VM 操作，未推远端，C1 OPEN/C5-G2 NO-GO/S2 DAILY PAUSED。**

## 2026-10-22 — C1-SYN-001 A2-II-R 现场只读能力取证操作包准备

**LOCAL DOC-ONLY / READ-ONLY GUEST AUTHORIZATION PENDING / NO PR OR VM ACCESS。** PR #2909 CI #7466 SUCCESS，squash 合并 `dev@2dc710c93fec998c5766a6680bbf5ca26f8297c5`。新本地分支 `docs/runtime-c1-syn001-a2iir-readonly-probe-20261022` 复核 AGENTS、A0 Host/Guest strict SSH、A1 现场 pin 和 A2-II 技术选型，新增 [A2-II-R 现场只读取证审批包](R1C-2C-C-C1-SYN-001-A2-II-R现场只读取证审批包.md)。固定 Host S00–S05、Guest R01–R06 共 8 条小范围只读 argv，含私有 ED25519 控制台 pin/既有 VM/VDI/boot/UID/GID 准确绑定、超时/字节预算和原始回执。单独本地生成 Mac read-only 操作脚本 SHA256 `d6e8b37a095ff12167db4ae533f45b9beff02313c91816e693697ac27489b7ca`，语法及纯离线正/负例检查通过，无 SSH/VM/Guest/strace/生产操作；原始 Guest 身份/key/boot 数据不进入仓库。`A2-II-R EXECUTION NOT AUTHORIZED / C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本地文档审阅后停止，不推远端。

## 2026-10-22 — C1-SYN-001 A2-II 硬预算与子进程隔离可行性审计

**LOCAL DOC REVIEW / NO GUEST EXECUTION / NO PUSH。** PR #2908 已完成 CI #7463 SUCCESS，squash merge `dev@80f970bd6a1845a376fdd520d832a7a3ceead0c0`；基于最新 dev 新建 `feat/runtime-c1-syn001-a2-resource-gates-20261022`。在 AGENTS/Runtime Ops、A2 冻结合同和现有采集/封存实现约束下，查核官方 Linux cgroup v2、Ubuntu quotactl、strace 6.6+ 资料，确认当前 RLIMIT_FSIZE 与 process group 不能直接证明 `-ff` 多 PID 原始文件总计硬 8MiB 和 detached 子进程终止。新增 [A2-II 资源与生命周期技术选型](R1C-2C-C-C1-SYN-001-A2-II资源隔离与进程生命周期技术选型.md)；冻结候选 R01–R06 的 cgroup/mount/strace version/UID/boot **只读**核验目的和禁止推论。任何 cgroup delegation、quota/mount 特权准备、`--kill-on-exit` 或 `-ff` 改造影响已有冻结合同/权限，必须精确说明后分别取得用户批准，不能借本轮授权实现或执行。未修改 Runtime 源码、运行 SYN/strace、操作 VM/Guest/Mac/生产、迁移或依赖；`A2-II ENV CAPABILITY UNKNOWN / A2-S/A3/A4 NOT AUTHORIZED / C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。待用户审阅后停止，本分支不推远端。

## 2026-10-22 — R1C C1-SYN-001 A2-I Guest 采集与 Mac 私有封存核心开发

**LOCAL CODE + TESTS PREPARED / EXECUTION NOT AUTHORIZED / NO PUSH。** 用户确认 PR #2907 已 CI #7461 `SUCCESS` 并合并 `dev@16dfab28c5daad40690277002b9cede4642b23fd` 后，基于最新 origin/dev 创建新分支 `feat/runtime-c1-syn001-a2-collector-offline-20261022`。只在 `ops/runtime` 内新增 Guest non-root A1 三源精确 SHA/uid/mode/nlink 检查、固定 SYN argv/预算声明、实验室 fixture 受限双流 capture/30s 以内 watchdog/单文件 RLIMIT_FSIZE/TERM→KILL 与非 PASS 的部分失败回执，以及 Mac 仅本地 receipt-pin/严格成员/权限 SHA/独占私有封存器；新增两份 unittest 覆盖源码/输出负例和本地 Guest→Mac 归档联动。现有 `run_scenario` 恒 `BLOCKED`，当前 8MiB 原始总量硬限和子进程 detached/SSH 断线生命周期不能声称受保证；**绝无真实 SYN/strace 操作授权**。未改既有 approval/reviewer v1、Runtime core、生产/AWS/VM/SSH/依赖/数据库，也没有 MCP 本地执行测试的权限。同步 [A2 §6](R1C-2C-C-C1-SYN-001-A2-CAPTURE-001采集与失败保全审批草案.md)、R1-C §24、R0；仅内部 A 类新增，不改变公共 owner/依赖基线。`A2-I LOCAL REVIEW / A2-S/A3/A4 NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本地审阅后停止，未推 PR。

## 2026-10-22 — C1-SYN-001 / A2-CAPTURE-001 受控采集和失败保全差距审计

**LOCAL DOC-ONLY / A2 DRAFTED NOT AUTHORIZED / A3-A4 NOT EXECUTED。** 用户批准的 A1 证据已通过 PR #2906、CI #7459 success、squash `dev@d746698145a1f340cccacd464f5ddd21249c6519`；基于最新 dev 新建本地 `docs/runtime-c1-syn001-a2-capture-safety-20261022`，核查仓库 AGENTS/CI、A0/A1 受限技术裁定、C1 SYN D0 原始 argv 与 `c1_syn001_approval_offline.py`/tests。发现代码中的 30s/8MiB/4MiB 仅属计划数据、**不存在**具资源强制的实际 Guest collector，也没有 SSH 意外断开时父子进程可靠终止、stdout/stderr/rc 保全实现。新增 [A2-CAPTURE-001 受控采集审批草案](R1C-2C-C-C1-SYN-001-A2-CAPTURE-001采集与失败保全审批草案.md) 冻结两场景分离、非 root/cwd/env/原 trace argv/预算、专属 `raw/`、Guest-local 进程组监护与 Mac 回执、源与身份紧前 pin、失败冻结，明确**硬总量上限和断线无孤儿保证仍缺实现**，先做可信本地负例测试再申请执行。保持已投三源和原始 A1/A0 false 回执，不更改 v1/Runtime core、依赖、schema、CI、VM/Guest/AWS/生产；未运行 strace。`C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。新文档与三个进度文件均本地待审，未经用户再次授权不推远端。

## 2026-10-22 — A1-SOURCE-001 真实写入与独立回执限定复核

**LOCAL DOCUMENTATION / A1 TECHNICAL PASS_SCOPED / A2 NOT AUTHORIZED / NO PUSH。** 收到 `A1-SOURCE-001-20261022T161938Z.zip`，原包 SHA256 `fc288a8cf804283d9aecc3ae8506511626f4b58b791a42d6597fe0c525db942c`；独立只读核验 54 ZIP 成员（1 目录、53 文件），52/52 清单逐字节匹配、25/25 Host/Guest 操作 rc0/原始 stdout/stderr receipt 长度及 SHA 匹配、无超时或预算问题。复核受控 SSH pin、VM/VDI、Guest boot 与 mount/pid ns 相对 A0-GUEST 原件相同，`/tmp` ext4、本次目标先验不存在，目录 0700 非 root 1000/1000、三份 `dd` 独占传入与 `stat/sha256sum` Guest 读回符合三冻结摘要、mode 0400/nlink1/准确大小。ZIP 不含 Guest 三文件独立封存的完整字节；`a1Approved/a2Authorized/traceAuthorized=false` 原始字段不改，不冒充完整动态执行证明；未重新连接 Guest 或重跑投送。同步 [A1-SOURCE §7](R1C-2C-C-C1-SYN-001-A1-SOURCE-001安全投送与冻结审批.md)、R1-C §22 和 R0，下一步 A2 需要单独批准采集器/时限/原始写路径，不运行 SYN/strace。旧 C0 LIMITED-ACCEPTED、A0 PASS_SCOPED、C1 OPEN、C5-G2 NO-GO、S2 DAILY PAUSED。当前仅本地文档，未提交远端。

## 2026-10-22 — A1-SOURCE-001 用户授权与受控 Mac 执行准备

**USER AUTHORIZED / LOCAL OPERATOR PREPARED / SITE NOT EXECUTED / NO REMOTE PUSH。** 用户继 A1 方案审阅后明确准许在原已核验 Guest 中以非 root 身份单次创建 `/tmp/sanq-c1-syn-001` 和放入固定三源、逐项核对文件权限、owner、nlink、SHA；明确不包含实验脚本/`strace` 执行。离线备好 Mac 程序 `A1-SOURCE-001-Mac-Guest-Placement-20261022.py` SHA256 `51a3c2942ca728b3deab74e22bceebef200f13877e9157d07bbd6eeded8f8267`，嵌入 Git 提交 `d7f57ff2` 的精确三份字节，按现场控制台 SSH pin/VM/VDI/boot/ns/UID 与目录未存在强制 fail-closed，以已有 GNU coreutils `mkdir`、`dd conv=excl oflag=nofollow`、`stat`、`sha256sum` 实现，**无 Guest helper、无 sudo、无覆盖/清理**。已执行无网络/无 Guest 的离线模拟与小目录独占写安全语义测试；待用户在 Mac 上执行回传。更新 A1 §6、R1-C、R0，未推远端。

## 2026-10-22 — C1-SYN-001 / A1-SOURCE-001 安全投送与冻结审批准备

**LOCAL DOC-ONLY / GUEST WRITE NOT AUTHORIZED / A1 NOT EXECUTED。** 继 PR #2905 CI #7456 SUCCESS、dev squash `d7f57ff23814168a38d9eb4ea2d3489e2fee6965`，新建本地 `docs/runtime-c1-syn001-a1-delivery-plan-20261022` 分支，遵循 R0 §4.1 和已合并 A0 Host/Guest `PASS_SCOPED` 状态。检查现有 SYN-01、SYN-02 惰性源码及 input 的路径、固定 SHA 和 bytes、既有 Runtime 纯内存 `c1_syn001_approval_offline.py`，无重复造模块必要。新增 [A1-SOURCE-001 安全投送冻结/审批包](R1C-2C-C-C1-SYN-001-A1-SOURCE-001安全投送与冻结审批.md)，冻结 3 份合计 2694 字节到唯一 Guest `/tmp/sanq-c1-syn-001`（目录 0700、普通文件 0400、非 root、非 symlink、独占创建），严格绑定当前 VM/VDI/SSH key/boot 与源/目标 SHA，所有不符停，不盲目重试或删失败原件。精确 SSH/辅助写文件程序命令及副作用仍须审阅并获用户逐项授权；**本批未运行 Host/SSH/Guest/VM/strace、未写入文件、未改 v1/Runtime 源码、CI、依赖、Prisma/migration、生产环境。** `A1 PLAN PREPARED / EXECUTION NOT AUTHORIZED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本地审阅后停，未推远端。

## 2026-10-22 — C1-SYN-001 / A0-GUEST-001 只读身份原件复核

**LOCAL DOCUMENTS / NO REMOTE DELIVERY / A0-GUEST PASS_SCOPED / A1 OPEN。** 用户先在同一 VirtualBox Ubuntu 控制台取得 SSH ED25519 host key，再执行前获授权的 G01–G07 非 root 严格 SSH 检查；本轮独立读取 `A0-GUEST-001-20261022T145533Z.zip` (SHA256 `f309e9a96c6cda5c79d7e0fdf452606c53ab6b32237656e387f5fc6e653f70ec`)，28/28 原件清单、S00–S05 6/6 + G01–G07 7/7 rc0、13 份原始命令 stdout/stderr 的 bytes/hash/UTC 匹配。扫描 SSH 公钥、`known_hosts.approved` 同字节，从原始 Base64 重算指纹与先前控制台 pin 严格相同；UID/GID=1000，boot/ns 有效、ptrace_scope=1，`strace/Python/loader` SHA 与既存已验 Ubuntu 候选相同。历史首次漏输 `SHA256:` 导致格式拒绝，非 SSH 信任失配；S05 stderr 仅版本 banner。原 `guestAuthenticated/a0Approved/traceAuthorized/readyToInstall=false` 不倒改；本次 A0 scoped 技术要求满足，不授予 A1 投送、A2 执行或 A3/A4 trace 权限。新增 [A0-GUEST 专项复核文档](R1C-2C-C-C1-SYN-001-A0-GUEST-001只读身份复核.md)并同步 R1-C/R0/A0-SITE；无新现场命令、代码、CI、schema、依赖或生产变更，`C0 CLOSED/LIMITED-ACCEPTED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本地审阅后停，不推远端。

## 2026-10-22 — C1-SYN-001 / A0-SITE-001 Host 现场只读审批包

**LOCAL DOCS / NOT PUSHED / A0-SITE H01–H08 HOST RAW PASS_SCOPED / GUEST OPEN。** 用户现场执行获批八项 Mac Host 查询并上传 `A0-SITE-001-20261022T143528Z.zip`，独立复算 ZIP SHA256 `c6407f37c73ad98286ee62b8256fa7039e5081ea09b2670c713416972ca95ae7`、17/17 SHA256 清单、8/8 命令原始 stdout/stderr 的 bytes/hash 与 rc0、时间顺序/预算均一致；VM/VDI 及 Host-only 网络与批准历史目标相符、IPv4/IPv6 forwarding=0。H05 `hostonlyifs` stdout 空，H06 已记录 Enabled Host-only 网络，因此限定认可 Host 配置、保留单独接口存在未知；Guest SSH key/boot/ns 未核，`a0Approved=false`、`guestSshAuthorized=false`、`traceAuthorized=false` 原件值保留。更新 [A0-SITE §6](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md) 并继续内部复核准备。本文档本地待审，未推远端。** 先前授权记录： 用户 2026-10-22 已对 H01–H08 Host 只读检查范围作出明确执行授权；MCP-workspace 无用户 Mac Host 访问通道，尚未获得本次 argv 的 stdout/stderr/rc/UTC，因此不作 A0 PASS 裁定，不推送本阶段文档。使用历史 `C1-HOST-005` 的实际 VBoxManage 路径与 VM/VDI 仅为受控当次比对目标，若设备不符停止；Guest/SSH/strace/root/VM 修改仍不获准。此前本批形成资料：PR #2904 准确 head `cb5a7b18649615515cabfddacf5b75237547b13e`，CI #7454 SUCCESS（`ops-checks`/API checks/API build success）、squash merge `dev@035480312048b2af91ab24d3e184397cab2873a2`。在独立文档分支 `docs/runtime-c1-syn001-a0-site-readiness-20261022` 核查 R0 §4.1、C0 §7、C1 A0–A2 既有代码/审批边界，并新增 [A0-SITE-001 Mac Host-only、VM/VDI 身份/运行状态及转发配置的八条精准只读命令审批包](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md)。所有 VM/VDI/SSH/IP 原始身份需操作者填入私有准确批准槽位；Guest/SSH 首次 host-key 必须在受控控制台核实，Guest/trace 操作另获授权。本次没有实际 Mac/VirtualBox/SSH/Guest 命令、Root、AWS/生产、权限/CI/v1/Runtime 代码变更；`C0 HISTORICAL CLOSED/LIMITED-ACCEPTED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。本地工作区不运行 lint/build/test，远端 PR 须待用户审阅后另授权。

## 2026-10-22 — R1C-2C-C / C1-SYN-001 A0–A2 离线审批组件与门禁包

**LOCAL SOURCE+TESTS+DOCS / NO TRACE / NO PR / C0 CLOSED LIMITED-ACCEPTED / C1 OPEN / G2 NO-GO。** 先审阅 `AGENTS.md`、Runtime ops owner/v1 review/test、R0 §4.1、C0 §7、PR #2903 合并的最新 `dev@9845e698` 与既有 SYN-01/02 惰性源文件；在新分支 `feat/runtime-c1-syn001-preflight-20261022` 编制纯内存、无文件/Guest/root/SSH/子进程行为的 `ops/runtime/c1_syn001_approval_offline.py` 及 `ops/runtime/tests/test_c1_syn001_approval_offline.py`。精确比对三份 `.py.txt`/fixture 的 SHA256+大小，审核 caller-supplied site claims 的字段与不一致风险，仅构造双场景准确 argv、非 root 环境、30s/8MiB/4MiB 预算与失败留证结构，程序输出永远不能授权真实执行或生产。新增 [C1 A0–A2 逐项审批包](R1C-2C-C-C1-SYN-001-A0-A2离线预检与执行审批.md)并同步 R1-C §18/R0；旧 C0 历史证据保持原样，新 R0 不要求外部见证/多跳交接，A0 现场 VM/VDI/SSH 指纹/Guest UID 仍单独待核，A1 关键来源/实际材料尚待 pin，A2 逐条批准未获；A3/A4/A5 未执行。无 v1 合同/Runtime core/bootstrap 变更、无依赖、CI、schema/migration、生产改动。MCP-workspace 未开放 lint/build/test，不在此冒充 CI 通过；本地待审，未推送。`S2 DAILY PAUSED`。

## 2026-10-22 — C0 历史证据在 R0 新规则下限定收口

**LOCAL DOCS-ONLY / SCOPED CLOSEOUT PROPOSED / NO NEW HOST OR GUEST EXECUTION。** 与同一批 [R0 §4.1](Runtime更新-R0冻结设计.md) 取消第三方见证、最小必要取证变更**同时合并 dev 后**，将 [C0 §7](R1C-2C-C-C0独立身份与保管链证据复核.md) 从旧 `OPEN-LIMITED` 调整为 **`C0 HISTORICAL EVIDENCE = CLOSED / LIMITED-ACCEPTED`**。承认 B-001～004 与 C1-HOST-001～005 原始记录、B-004 98/98 同字节、Host 五批 115/115 清单与 35/35 命令回执；保留 B-003 SSH timeout、B-004 DMI/readelf 非零 rc、HOST-001 16/17 与历史 B-004 `LIMITED`。过去事前外部 VM/VDI/SSH 签认、第三方工作底稿和 ZIP 每跳交接不再是现行 C0 关闭门禁；历史 `known_hosts` 首次可信指纹及 SSH 精确会话绑定仍**未被历史材料完整证实**，不倒填 PASS。新 VM/VDI/Host-only/SSH key 身份核对转至 [C1-SYN-001 A0](R1C-2C-C-C1-SYN-001受控观察设计与审批草案.md) 每次执行前 Preflight，需 SanQ 内部认可来源及用户准确命令授权；首次 SSH 主机 key 不盲目 TOFU。**C1 动态执行 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED。** 未修改 reviewer/权限、未运行 SSH、Guest、strace、AWS、root 或生产；此次合并前仍是文档提议，不是自动生产授权。

## 2026-10-22 — R0 全流程证据精简与取消第三方见证（本地待审）

**DOCS ONLY / LOCAL REVIEW / NOT PUSHED。** 用户已明确取消 Runtime R0–R5、C1–C8、G2 全阶段第三方人员见证、见证邮件、PDF、独立人员底稿与 ZIP 多跳交接的强制要求，并要求取证只覆盖运行安全、稳定、维护、恢复相关关键事实。经复核 AGENTS/CI、R0/G2、AWS、R1-C 与离线 reviewer，从最新 `origin/dev@3c5379bd` 建立 `docs/runtime-r0-minimum-evidence-no-external-witness-20261022`；旧 C0 文档已在 PR #2902 合并入 dev，旧功能分支遗留的未交付暂存差异已从工作区清理，未删除仓库历史。更新 R0 §4.1 和相关 C2/Guest/Ubuntu/来源/C1-SYN/AWS/安装/G2 文档入口，内部技术核验替代外部人员见证，保留实际目标和 SSH 身份、官方来源、SHA/CI、维护冻结、快照、事故和资金/订单数据安全。**仅修改文档，没有更改任何代码 reviewer 的 `BLOCKED`、授权标志、权限、Runtime Bundle、CI 或业务与生产。** 本地无 lint/build/test 执行，远端 PR/CI/合并仍需单独审阅授权。


## 2026-10-21 — R1C-2C-C C0-EVIDENCE-RECONCILIATION-001 独立见证回邮与身份保管证据核对

**LOCAL DOCS-ONLY / C0 HISTORIC EXECUTION EVIDENCED / WITNESS LIMITED / IDENTITY-CUSTODY OPEN / NOT PUSHED。** PR #2901 最终 head `733e7438` / CI #7448 SUCCESS、合并 `dev@144abbd1` 后，在新分支 `docs/r1c2c-c0-evidence-reconciliation-20261021` 开始 C0 下一阶段，不覆盖已合并的 C1-SYN-001。独立读取已有见证回邮与 3 页 PDF 原始附件，按字节复算 SHA256 `85440dc4d25600d7dadd5334c304d08a4cad46715b1c96136fafc89f4fccf166`，纠正 PDF 第 2 页六项首选使用实心圆点标记（用户确认已选择），但逐项复算命令/rc/缺口原始回执未填写，声明 `LIMITED` 且缺准确签署 UTC/事前外部 expected pin 来源；邮箱中最终回邮及 PDF 自报的生成时钟不能证明此前现场 Host/Guest 身份。本轮新收 `归档.zip` 含 B-001～004，逐批 Host SHA256SUMS 20/20、23/23、23/23、23/23；Guest 003 为 28/28、004 为 97/97，全部匹配；B-004 的 98 个原始文件与先前 witness ZIP 逐字节一致，历史三项非零 rc 不删除，现又收到独立压缩包 `归档 2.zip`（SHA256 `2ef869603ae00cf62b195fe9b0d59abdf5c8978c89827a6a38bf443749acb0b8`），包含 C1-HOST-001～005 五批各 23 项完整原始 Host 归档，总 115/115 SHA 匹配，35/35 命令原始 receipt/双标准流匹配，所有命令 rc0；001 `vmRunning=false`（16/17），002～005 17/17，所有原始审阅均 `DISCOVERY_ONLY` 且 `authorizationGranted=false`。五批 VM/VDI/NIC 身份线索一致，但未取得独立事前 pin、SSH/Guest 当次会话绑定及完整保管见证；不把内部一致性提升为外部身份认证。新增 [C0 逐门禁证据矩阵与私有原件优先复用计划](R1C-2C-C-C0独立身份与保管链证据复核.md)，并同步 [R1-C §17](C5-G2-R1-B-只读GuestFD采集器与执行审批.md) 及 R0。S1-W1/R1 限定可信公钥/Ubuntu Release 证据可复用作 C1 软件来源，但不能当作 C0 的 SSH/Guest/保管认证。后续要在已有私有材料中按批次核对事前批准、Host-001～005、见证人历史工作底稿、交接链；确实没有的证据维持 OPEN。只做本地文档复核，不发新邮件、不新建 Guest/VM 取证、不修改 Runtime、evidence v1、CI、依赖、schema 或生产。MCP-workspace 未运行 lint/build/test；`C0 OPEN-LIMITED / R1-C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。

## 2026-10-21 — Runtime R1C-2C-C / C1-SYN-001 受控动态观察设计与逐项审批准备

**LOCAL DESIGN PREPARED / NOT EXECUTED / NOT PUSHED / C0 LIMITED / C1 DYNAMIC OPEN / C5-G2 NO-GO。** 在 `origin/dev@0fc583b0` 核查 `AGENTS.md`、CI 选择规则、R1-C §9–§15 与 `ops/runtime/r1c2_consumption_offline_review.py`、对应 tests、`normal_runtime_launch.py`；按既有 Owner/证据 v1 合同仅编制 [C1-SYN-001 两个非业务场景、原始源字节候选和实验独立审批材料](R1C-2C-C-C1-SYN-001受控观察设计与审批草案.md)。固定三份 inert 文本 SHA256/大小（SYN-01 exec/open/read/exit、SYN-02 fork/child exec/mmap/exit、25 字节 input）；拟议 argv、环境/cwd、来源/身份/离机 pin、失败保全、预算、两种真实 fork 时序和 v1 恰一次 `PROCESS_EXEC` 的不兼容点已登记；无 event 顺序伪造、不修改 v1 reviewer。复用已真实执行且 `LIMITED` 的 `R1C2C-B-004` / witness / ZIP 结构证据，不要求重复旧采集，但不跨会话推断 C0 身份或连续保管 PASS；A0–A2 新会话的准确现场凭据、命令/介质和用户执行授权仍需单独审阅。同步 R1-C §16 与 R0 最新状态；纯文档和不可执行的 `.py.txt` 源候选，无依赖图、架构/所有权、代码生效路径、17+Manifest、CI、schema/migration 变化。未运行 lint/build/test、Python 探针、strace、SSH、Guest/VM/AWS 或生产操作；本地改动待审，未推送。`R1/C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。

## 2026-10-21 — Runtime C1-HOST/PIN/SOURCE/OBSERVER 全批次取证续记与 C0/C1-SYN-001 交接

**LOCAL DOCS-ONLY / REMOTE REVIEW PENDING / R1-C1 OPEN / C5-G2 NO-GO。** 基于已上传的 C1-SOURCE-STRACE-001、C1-SOURCE-LIBC、C1-OBSERVER-NATIVE-SOURCE-001、C1-OBSERVER-NATIVE-003 独立离线审阅报告与用户 001/002/003 Mac 终端回执，在最新 `origin/dev@2e59c2cd` 的独立分支 `docs/r1c-c1-native-source-audit-20261021` 仅续记 [R1-C §14](C5-G2-R1-B-只读GuestFD采集器与执行审批.md) 和 [R0 进度入口](Runtime更新-R0冻结设计.md)。额外核对并登记此前遗漏的 `R1C2C-C1-HOST-001～005` 五个不同 Host 现场预检批次，明确 Host-003/004/005 与 Native-001/002/003 的对应关系，且没有 Host 全量原件的独立身份认证；`R1C2C-C1-PIN-001` 四 ELF/13项 SHA 全 OK 但 dpkg 原路径查询 rc=1、整体 PARTIAL/BLOCKED，`PIN-002` 三项查询 rc 0/0/0、12项 SHA 全 OK、整体仍 BLOCKED。`C1-SOURCE-LIBC` 的真实 R1-A 签名/包成员仅与操作员 PIN 摘要吻合；`C1-SOURCE-STRACE-001` 的 noble 来源独立技术链比对通过，但冻结 XZ 审核器合法第二空 Stream 误拒绝仍 BLOCKED。`C1-OBSERVER` 不是独立已执行的 trace 批次：`strace -V` 只发现版本、不能证明动态消费。001 SSH 超时证据保留；002 三个 Native ELF 的清单 13/13 OK、官方包成员摘要吻合，**但未收到 002 Guest 原始 ELF 供独立复算**；SOURCE-001 两个经批准 HTTPS GET 的包来源在已保存 Ubuntu 签名索引范围内核验匹配；003 的单个 `libunwind.so.8.0.1` 原始归档 SHA `c8e58e483d5c667b83734fc28c8dc0b702f74b7e101bd02a3422f86334ad3cc4`，独立 36/36 检查、Guest stdout 原始 ELF 与官方包成员逐字节一致。已识别 `strace` 的静态 `DT_NEEDED` 候选图暂未发现新缺失，不能将其外推为 `dlopen`/Python/runtime 动态消费完成；原冻结 strace XZ 审核器仍保留误拒绝缺口。下一阶段在本批 PR 全绿合并后先设计 C0 Host/Guest 身份、事前 pin 和离机保管证据矩阵，再准备 C1-SYN-001 的两套 non-root synthetic 场景及准确独立审批草案；**本批未获得 live trace/新 SSH/Guest/root/AWS 或任何生产授权**。改动分类为 A 类纯内部文档状态同步；原始证据未入 Git，未修改事实 owner、依赖图/SCC、Runtime 源码、v1 合同、测试、CI、依赖、数据库或部署。MCP-workspace 不执行 lint/build/test；依据 AGENTS.md 本地审阅后另行获取推送/PR/合并授权。`C0-IDENTITY/CUSTODY OPEN / C1 DYNAMIC OPEN / S2 DAILY PAUSED`。

## 2026-10-21 — Clover 网站与门店应用中英文法律页面补全

**LOCAL CONTENT REVIEWED / REMOTE DELIVERY AUTHORIZED / CI PENDING / NOT DEPLOYED / CLOVER LEGAL APPROVAL PENDING。** 用户授权按 Clover 要求修改网站法律页面，并明确要求中英文分别同步；在 clean MCP-workspace 从 `origin/dev@cce4b97d8f281af0f176f9152c8488c85cbaeee8` 建立 `fix/clover-legal-pos-scope-20261021`。复核 AGENTS、Web CI/变更范围选择、现有法律页、支付章程与 Phase E 最新验收边界；仅修改既有 `apps/web/src/app/[locale]/(site)/legal/{privacy,terms,contact}/page.tsx` 静态双语内容。隐私政策扩展至自营门店应用、获授权的 Clover 商户/交易及有限卡摘要、操作审计、用途/共享、凭据保护、保存/境外处理、撤销连接与隐私请求，并说明电子收据不等于营销同意；条款明确 SANQIN RESTAURANT 为应用提供方、自营门店使用许可及实际启用范围、Clover 独立服务关系、平台处理附加费、交易待核实与停止使用边界；联系页同步既有审核后台的 08:00–22:30 多伦多当地支持时段，增加接入/停止连接、交易查询、安全说明和本语言法律链接。中英文日期统一为 2026-10-21；保留顾客点餐、会员、退款与强制性权利，不套入第三方 SaaS 收费、美国法域或全量清除历史交易的承诺，不宣称未启用功能已上线。

依据：[App Terms / Privacy Guidelines](https://www.clover.com/legal-guidelines)、[App approval 法律文件要求](https://docs.clover.com/dev/docs/developer-app-approval-archive)、[Privacy Template 适用范围说明](https://docs.clover.com/dev/docs/clover-privacy-policy-template)、[EULA 参考模板](https://docs.clover.com/dev/docs/clover-eulaterms-of-service-template)、[附加费政策](https://docs.clover.com/dev/docs/clover-policies)。SanQ 同时经营顾客网站与自营门店，不能套用仅代表其他商户处理数据的模板角色；本批按真实用途自行撰写，并不代表 Clover 法律审核通过。

类别 A：既有页面内的内容更新，URL、语言选择/页面组件职责、业务 owner、依赖图/直接导入债务/SCC/scanner baseline、API/持久化/打印合同、权限和支付执行均不变；无 schema/migration、依赖/锁文件、CI 调整、付款/退款、部署或生产数据更改。仅静态双语及差异审阅，纯文案更新未新增自动化测试；MCP-workspace 不开放 lint/build/test，未运行或在其他环境代跑。授权远端后依现有选择器运行 Web lint/build/strict/Jest、API Jest 与 Browser E2E 等被选作业，不为本批改 CI。部署后需核对 `/en/legal/{privacy,terms,contact}` 与 `/zh/legal/{privacy,terms,contact}` 的文案、链接、移动/桌面排版；现有 App EULA/Privacy/Support URL 保持不变，但其线上新内容及本次文字对应的 Clover 审阅仍待完成。用户已审阅本地改动并于同日明确要求“提交远端”，本批获授权提交功能分支、创建目标为 dev 的 PR、修复本批 CI 失败并在最终 head 所有必需检查通过后合并；生产部署、Clover 送审及金融操作不在该授权内。最终 CI 与合并结果以该 PR 的准确 head 检查和合并事件为准。

## 2026-10-21 — Phase E 第二批 Unified Credit Refund + 积分/储值全额回滚 Sandbox 验收

**DOCS-ONLY / REMOTE DELIVERY AUTHORIZED；SANDBOX PROVIDER + DEVICE + DATABASE VERIFIED / SCOPED CLOSED；FULL PHASE E OPEN。** 用户在隔离 MacBook `restaurant` 的退款前/后两组只读 SQL 事务（均 `COMMIT`）、Nest 请求日志、Clover Test Merchant Refund 明细及当日列表提供闭环证据。复用 10/16 既有订单 `c27b98812c9e756e5c4738c68`、Checkout Attempt `d9f4383f-95ae-4b0c-baa2-0bb56624479c`（`COMPLETED`）、Clover 原 Payment `2YSC88CHESKS2`（`SALE SUCCEEDED`）；付款为 **Points 1 pt（折扣抵扣价值 CAD 1.00）+ Store Balance CAD 1.00 + Card CAD 14.82**，订单 `totalCents=1582`。10/21 单次 Refund ID `WZGHWZ8YHRQYE`、Terminal POST/Device Status/自动 Welcome/Platform Refund GET 全 HTTP 200、POS HTTP 201（9373ms）。本地 `SALE + REFUND` 两条 `SUCCEEDED`、原 Sale 已退 1482 cents、Refund `CLOVER_REFUND_CONFIRMED`；原 Ledger 3 条（积分 −1000000、余额 −1000000、奖励 +140000 micro）与反向 Ledger 3 条（积分 +1000000、余额 +1000000、奖励 −140000 micro）**各类型恰好 1 条**；账户退款前后积分 998280000→999140000 micro、余额 48000000→49000000 micro、累计消费 2600→1300 cents、BRONZE 保持；Order `refunded`、`RETENDER/FULL_REFUND/CONFIRMED` Amendment 恰好 1 条（1582 cents）、`order.financial_reversal.v1` 恰好 1 条。Clover 21-Oct-2026 官方 Sandbox Refund Details 核对 `WZGHWZ8YHRQYE`、原 Payment `2YSC88CHESKS2`、**CAD 14.82**、Discover 6668；当日 Refunds 列表仅 1 条、总额 CAD 14.82、无下一页（结论限于该日期/商户/筛选）。本批仅关闭指定混合支付+全额退款闭环；PR #2892 标准 Refund 首次响应实机通过，**未观察到延迟 GET 重查触发**，不升级该子场景；并发 Exactly-once、Interac、Accounting Journal 及生产/结算独立待验。店员不得代顾客调用优惠券，按用户要求本轮不验证 POS 券消费和返券、不变更券政策或权限。本次文档仅更新 [Phase E 计划](../payments/clover-pos-phase-plan.md)、[Phase 6 收口续记](phase-6-payments-pos-closeout.md) 和本 Worklog，无源码、合同、schema/migration、架构边界、依赖图/scanner、CI、数据写入、资金或生产变更；使用从 `origin/dev@f0fa2306` 创建的独立文档分支，已获操作员明确远端交付授权，须 CI 全绿后才能合并 `dev`；保留 Runtime 所有现状。已退款交易禁止重复资金命令，下一批 Interac 先只读 Readiness Audit。

## 2026-10-21 — Runtime R1C-2C-C / C0 独立文件环境复核、C1 观察器候选来源就绪

**LOCAL DOCS-ONLY / C0-OFFLINE-STRUCTURE CHECKED / C0-IDENTITY-CUSTODY OPEN / C1 SOURCE FREEZE BLOCKED / C2 LIVE TRACE NOT AUTHORIZED。** 操作员上传 `R1C2C-B-004-witness.zip` 原件；在独立于采集 Mac/Guest 的本地只读分析环境执行现有 C0 ZIP reviewer：真实归档 SHA256 与此前 LIMITED 见证表记录相符，Host 清单 23、Guest 清单 97、ZIP 有效文件 98、Host 自动检查 17/17、Guest 23 项 SSH raw 与解码原件字节一致；三项失败分别为 DMI 只读权限 rc=1 和 readelf 缺失 rc=127×2；结构校验 `OFFLINE_SELF_CONSISTENCY_CHECKED/BLOCKED`。未向 reviewer 提供独立预冻结 expected SHA，原始平台及见证保管链依旧不能提升认证。检查 004 Guest 实际 argv 有 `/usr/bin/strace -V`（6.8），但缺 strace binary SHA/ELF 来源、Python/native 完整 pins、会话身份，以及已固定的 non-root synthetic payload/场景；不能仅凭版本输出冻结观察器。沿既有 R1-C 合同新增 [§13 C0/C1 就绪审计与 C1-PIN-001 候选计划](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#13-2026-10-21--r1c-2c-c--c0-原件离线复核与-c1-观察器候选冻结就绪本地待审)。下一步需先单独批准**准确 Guest 只读来源 pin 采集**；非 root strace 动态执行、安装/提权、变更 evidence v1 均不在本轮授权。仅修改 Runtime 文档，不改源代码、CI、依赖、schema、Guest/VM、AWS 或生产，待本地审阅后再申请远端交付。R1/C1 OPEN、G2 NO-GO、S2 PAUSED、C2 LIMITED CLOSED。

**同批事后补录（2026-10-21 / 本地 docs-only 审阅，未追加 Host/Guest 执行）：**根据 10/20～21 实际聊天操作与已有私有证据，将 C0 的“已执行工作”和“仍未独立认证的门禁”正式拆开登记于 [R1-C §15](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#15-2026-10-21--r1c-2c-c--c0-身份与保管链实际执行证据补录非重新取证)：`R1C2C-B-004` ZIP SHA256 `d1bc78e709591eade7df67584e7340b6c6cc14edae5b9f49b597c866f544139b`；操作员 Host/Guest 双 `SHA256SUMS` 全 OK；2026-10-21 见证回邮 `.eml`/PDF `LIMITED`，PDF SHA256 `85440dc4d25600d7dadd5334c304d08a4cad46715b1c96136fafc89f4fccf166`，附件字节对应；随后独立于采集端的离线 ZIP 原件结构审核完成（Host 23/Guest 97/payload 98、`OFFLINE_SELF_CONSISTENCY_CHECKED/BLOCKED`）。因此 `C0 EXECUTION EVIDENCED / OFFLINE STRUCTURE CHECKED`，**不是**未开展；但采集前外部身份 pin、完整独立见证逐项命令/rc、交接 UTC/渠道仍缺，`C0 IDENTITY-CUSTODY ATTESTATION OPEN/LIMITED`。仅同步 R0 和本 worklog，不修改运行时、权限、架构/依赖图/SCC、合同、CI、Prisma、Guest/VM、AWS、生产；MCP 本地无 lint/build/test，待用户审阅后再授权远端 PR。`R1/C1 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED` 不变。

## 2026-10-21 — Phase E 第一批历史 Refund/VOID 供应商与本地证据收口

**DOCS-ONLY / PR #2895 CI #7436 SUCCESS / DEV MERGED `49f38a450d31a381353530faec6ddf138d27a674`；HISTORICAL SANDBOX RECONCILIATION VERIFIED / SCOPED CLOSED；FULL PHASE E OPEN。** 用户操作员在隔离 MacBook `restaurant` 执行 `BEGIN TRANSACTION READ ONLY`、SQL 核验与 `COMMIT`，回执 `transaction_read_only=on`：五笔历史原 Sale + Refund/VOID 合计 10 条 PaymentTransaction，每笔仅 1 原 SALE + 1 相应 REFUND/VOID 且均 `SUCCEEDED`；五个 Order 全 `refunded`、五条单独 `FULL_REFUND/CONFIRMED` Amendment（金额分别 CAD 5.65 / 11.30 / 5.65 / 11.30 / 16.95）、五条唯一 `order.financial_reversal.v1`（`REVERSAL / FULL_REFUND`）。二笔 Refund 的 Provider ID 分别 `WD51H52NKNDBM`、`76C5ZPZBS0DZT`；三笔真 VOID 原 Payment/供应商 Void ID 对应：`0KXYYAQYNPQAW/EXXAZJM0C1VE4`、`810H2903XCSEJ/THOSWEBX4K7Q8`、`TXNSXTYX6ZM4M/7E4C9BMT18R5Y`。Clover Test Merchant Dashboard 截图的 **2026/10/10—10/21** 指定筛选范围内，Refunds 列表恰 2 条，合计 CAD 16.95；Voids 列表恰 3 条，无下一页，三份独立 Void 详情核对原 Payment、Void ID 和金额合计 CAD 33.90；总计 5 个对应事实、CAD 50.85，未发现此范围内多余记录。不能由这批既有记录证明未来并发全局 exactly-once 或独立银行清算。第二笔自动 Welcome Refund `HY8KKDPK82HQT/76C5ZPZBS0DZT` 现补齐完整本地 Payment/Order/Amendment/Event，`DEVICE + PROVIDER + LOCAL DB VERIFIED`；True VOID 第三笔首次 POS 请求（约 5928ms、三次 Canonical GET）此前已 DEVICE VERIFIED，现补得 Clover Void `7E4C9BMT18R5Y`。Refund GET-only 代码 PR [#2892](https://github.com/sanqin888/sanqinMVP/pull/2892) 最终 head `4b462800` / [CI #7430](https://github.com/sanqin888/sanqinMVP/actions/runs/39491797533) SUCCESS、squash merge `dev@424df7be5b95f93047afe83b6b59429ed7131a9f`；但 #2892 新重查机制 **尚未真机单独验收**。Accounting Journal posting、Benefits 积分/余额/优惠券账本回滚、Interac、故障/并发场景仍 OPEN；第一批仅 `HISTORICAL PROVIDER + LOCAL DB RECONCILIATION / SANDBOX VERIFIED / SCOPED CLOSED`。本次仅更新 [Phase E 计划](../payments/clover-pos-phase-plan.md)、[Phase 6 状态续记](phase-6-payments-pos-closeout.md) 和 worklog，**无代码、DB、资金、CI/部署/架构改动**；第二批先从只读 Readiness Audit 开始，新的资金操作须另行授权。保留其他 Runtime 工作状态与历史记录。

## 2026-10-21 — Runtime R1C-2C-C 真实动态观察实验就绪审计与执行审批草案

**LOCAL DOCS-ONLY DRAFT / LIVE TRACE NOT AUTHORIZED / REVIEW PENDING / NOT PUSHED。** R1C-2C-B 文档 PR #2893 / CI #7432 SUCCESS，合并 `dev@7638832a` 后，按用户要求启动后续 R1C-2C-C 的**实施设计和审批准备**；不是 Guest 执行批准。复核 `normal_runtime_update.py` / `normal_runtime_launch.py` 与 2B 的纯内存 reviewer，确认 `strace 6.8` / `ptrace_scope=1` 仅为能力候选；当前真实 bootstrap、effect adapters 与持续消费字节保护尚未具备。新建 [R1-C §12：2C-C 就绪与执行审批草案](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#12-r1c-2c-c-真实动态观察实验就绪与执行审批包待审草案)，分层提出 C0–C5：独立原件及目标身份、观察器和无副作用 synthetic 候选来源、准确命令/权限另审、非 root tracing、离机原件复核、v1 合同适配裁定；登记真实 Linux 进程事件/namespace/预算/原件类别和内容绑定与现有 v1 的差距。此处**不修改冻结 v1 合同，不伪造 PROCESS_EXEC，不安装 readelf，不提升权限，不执行 strace/root/正常更新**；后续如需 v2、工具/权限变更必须另获授权。没有代码、CI/依赖、跨上下文架构或生产状态更改，本地未运行测试，远端尚未获授权。R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 LIMITED CLOSED。

## 2026-10-20 — Runtime R1C-2C-B 真实 Host/Guest 观察能力取证与独立见证准备

**OPERATOR-REPORTED DISCOVERY CAPTURED / MANIFEST CHECKS OK / LIMITED WITNESS EMAIL RECEIVED / RAW-EVIDENCE INDEPENDENT VERIFICATION PENDING / NO 2C-C AUTHORIZATION。** R1C2C-B-001/002 为取证 Kit 的 VirtualBox host-only 解析误判、保持原始 BLOCKED；003 v3 Host 自动检查 17/17 SATISFIED；004 Guest SSH rc=0、UID 1000、23 个只读命令内 20 项 rc=0，确认 Ubuntu 24.04.5 / Python 3.12.3 / kernel 6.8.0-146 / `strace 6.8`、`ptrace_scope=1`。DMI 仅普通用户读权限不足（rc=1）；两条 `readelf` 查找命令不存在（rc=127），未安装依赖、未提权。操作员已执行 `SHA256SUMS.host` 与 `.guest` 双清单全部 `OK`，只表明按本地清单复算匹配，不是来源独立认证。`guest-review` 仍 `DISCOVERY_ONLY`、独立 Host/Guest 见证 false、SSH combined-channel warning true；004 Host 原件及准确回执仍待见证人独立确认。2026-10-21 已收到独立见证回邮 .eml 及 PDF 附件：邮件和 PDF 结论均为 `LIMITED`，附件文件 SHA-256 与邮件正文声明及此前同名上传 PDF 字节一致；邮件头声称 DKIM/SPF/DMARC pass，尚未独立验签。`pdfsig` 未检出证书签名，未获得本轮 `004` 私有归档供助手独立复算，亦无见证人原始核验命令/rc 与第二渠道预期 hash 来源原件；限定声明可记录，不能宣称独立来源/真实消费 VERIFIED。邮件及个人信息在私有档案保留、不入 Git。无源码、模块边界/依赖、数据库、部署/VM/生产更改；R1/C1 OPEN、G2 NO-GO、S2 PAUSED、C2 有界 CLOSED，2C-C 未批准。详见 [R1-C §11](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)。

## 2026-10-20 — Phase E Refund Immediate Canonical Finality Hardening

**LOCAL SOURCE+TESTS AUTHORED / REMOTE DELIVERY AUTHORIZED / CI PENDING / DEVICE PENDING。** 用户授权在先前 Refund 风险只读审计后做最小修复，MCP-workspace 已恢复 clean；从最新 `origin/dev@0e417026` 创建 `fix/clover-phase-e-refund-immediate-finality-20261020`。仅在 Payments/Clover infrastructure：Terminal `SUCCEEDED/EXECUTION` 且原 Payment ID 一致时，限 `REFUND_NOT_FOUND`、明确 `REFUND_STATUS_PENDING` 或 `REVERSAL_NOT_YET_VISIBLE` 最多两次额外 GET（500/1000ms），在 Terminal 请求起算超过 12s 不再新增补查（并非硬请求超时）；已知 Refund ID 精确复查，任何失败/异常/事实/身份冲突立即保持 UNKNOWN。Gateway 细分明确 PENDING/非 PENDING 的诊断码；原 Refund POST 单次，既有同 Attempt 恢复、Interac 未决、Web Ecommerce 不变。聚焦 Jest 更新覆盖传播成功/持续 UNKNOWN / 同 ID 恢复/明确 FAILED+错 ID / 404+PENDING / BFF 时间门禁。**无新 owner/公共路由/Schema/migration、依赖锁、跨上下文导入/依赖图/SCC/scanner baseline、Orders/Benefits/Accounting、生产 Web 或部署变更**。MCP-workspace 未开放 lint/build/test，尚未运行；用户已审阅本地改动并于同日明确授权**连同四份文档提交远端 PR、CI 通过后合并 dev**；最终 head CI 和单独设备资金测试仍各自待验收。此前 VOID 首次 POS 新笔 CAD $16.95 现已受控 Sandbox 通过（PR #2890 CI #7422，Payment/Order/Amendment/事件本地核对），不会重碰旧交易；完整 Phase E OPEN。详情见 [Phase E](../payments/clover-pos-phase-plan.md) / [Phase 6](phase-6-payments-pos-closeout.md)。

## 2026-10-20 — Runtime R1C-2B 离线动态消费证据解析与独立审核

**LOCAL SOURCE+TESTS AUTHORED / TESTS NOT RUN / REVIEW PENDING / NOT PUSHED。** R1C-2A PR #2889 / [CI #7419](https://github.com/sanqin888/sanqinMVP/actions/runs/39482206485) success、dev merge `f8dc9808d80f2023fca00b0c8ff83e9ee3cf96af` 后，用户明确要求 R1C-2B。经 AGENTS、CI、R0、S1、R1-C §7–9、旧离机 reviewer、合成测试审阅，基于最新 `origin/dev@5a026e68` 创建 `feat/runtime-r1c2b-offline-consumption-review-20261020`。新增 Runtime/Ops 独立 caller-bytes-only reviewer `ops/runtime/r1c2_consumption_offline_review.py` 和 `ops/runtime/tests/test_r1c2_consumption_offline_review.py`；v1 strict canonical JSON、受限字段/预算/顺序、进程代际和父子边、Python/ELF/file event→binding/原件区间关联、独立参数 pins 的有界比较，任何未知/不完整 fail-closed。最高仅 `CANDIDATE_REVIEWED/BLOCKED`，始终 source/consumption/witness/installation/production authority false；synthetic 完整样本不冒充真实来源或连续字节保护。设计细节及剩余动态观察差距见 [R1-C §10](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)。类别 A：同 Runtime/Ops 内部新增独立模块与 tests，不更改旧 B3A/B3B1/Guest v1、17 Bundle、R1C-1、CI/依赖锁、Prisma/migration、公共/持久化合同、架构 owner、跨上下文导入/债务、SCC/scanner baseline 或现役部署。MCP-workspace 无 lint/build/test 权限，未运行，也未执行 Guest/root/AWS/生产；本地差异审核/远端提交须另授权。R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 有界 CLOSED。

## 2026-10-20 — Phase E VOID Immediate Canonical Finality Hardening

**LOCAL SOURCE+TESTS AUTHORED / CI NOT RUN / FIRST-ATTEMPT DEVICE VERIFICATION PENDING / NOT PUSHED。** 用户提供隔离 MacBook 第二笔 CAD $11.30 真实 POS VOID：Payment `810H2903XCSEJ`、Dashboard Void `THOSWEBX4K7Q8`、API 首次只查原 Payment 并返回 `UNKNOWN / CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE`，Order `making`；独立授权原 Attempt `refund_1c7de89a7fa95e2a882a9c67eb169a3adabf230156195b77` 的单次 Canonical-only 恢复后 HTTP 201 `SUCCEEDED/VOIDED`、Order `refunded`、Amendment 1、REVERSAL Event 1、原 Sale 已撤销 1130 cents。此前第一笔 CAD $5.65 同路径恢复也完成；旧代码补证 PR #2887 / CI #7415 success / `dev@fa6513a7` 已验证事后恢复，不代表首次设备 E2E 成功。本批从最新 `origin/dev@f8dc9808` 建立 `fix/clover-phase-e-void-immediate-finality-20261020`，仅在 Payments/Clover Adapter 对明确 Terminal `SUCCEEDED+EXECUTION` 的 `NOT_YET_VISIBLE` Canonical 做最多四次有限额外 GET，Platform Gateway 允许原 Payment `VOIDING` 阶段读 Collection 但严格保持 UNKNOWN，并加诊断；新增 Jest 延迟成功、超时未知、冲突立即停止、VOIDING 非终态测试；无新外部资金指令/权限、后台恢复任务、生产 Web、Orders/Benefits、公共 HTTP/DB、schema/migration、依赖锁、跨模块 owner/导入债务、SCC/scanner/baseline 或兼容性变更。MCP 尚不能执行 lint/build/test；本地完成后等待用户审核及**单独远端授权**，最终 head CI 及下一次独立 Sale+一次 VOID 真机验收尚未获授权。完整 Phase E OPEN；已有两笔 VOID 不得重复交易。详细 [Phase E](../payments/clover-pos-phase-plan.md) / [Phase 6 边界](phase-6-payments-pos-closeout.md)。

## 2026-10-20 — Runtime R1C-2A 观察覆盖与证据合同冻结

**LOCAL DOC-ONLY / CONTRACT AUTHORED / USER REVIEW PENDING / NOT PUSHED。** 承接 [R1C-1 PR #2888](https://github.com/sanqin888/sanqinMVP/pull/2888)、[CI #7417](https://github.com/sanqin888/sanqinMVP/actions/runs/39478774789) SUCCESS、dev merge `54638f2eb80cb6635a17c1d3c286c1c6e2980d2d`；在最新 `origin/dev@54638f2e` 上创建 `docs/runtime-r1c2a-observation-contract-20261020`，以 R0 D1–D5、R1-B §6–8/S5 有界证据、S1 和现有 AST/ELF/FD/launch/core 为依据，完成 [R1C-2A 合同（R1-C 工作包 §9）](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)：冻结 COV-01..10 观察矩阵、威胁/信任模型、观察器技术候选和独立 `sanq.runtime.r1c2-consumption-evidence.v1` 候选回执/事件/文件身份/来源/原件/预算/失效原因、2B 离线负例与 2C/2D 现场门禁。所有 v1 离线结论 `decision=BLOCKED`、无执行授权；不将系统调用事件或 hash 相等误认实际消费字节已被保护/认证。只新增 Runtime/Ops 内部文档，更新 R1-C 总览/依赖图/本日志；不修改旧 S5 原件、17 Bundle、现役运行器、依赖、CI、Prisma、GitHub 生产状态，未引入业务 owner/跨上下文导入/架构边、债务/SCC/scanner baseline 或兼容路径。MCP-workspace 不支持 lint/build/test，未运行，无 Guest/root/生产/AWS/外部工具执行；2B、2C、2D 均未开始，R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 有限 CLOSED。等待本地审阅与单独远端交付授权。

## 2026-10-20 — Runtime R1C-1 正常更新核心与执行场景

**LOCAL SOURCE/TESTS AUTHORED / TESTS NOT RUN / NOT PUSHED / USER REVIEW PENDING。** 用户在 S5/准备包 PR #2886 最终 head `4e31bd703442a3c546ad26952935dfabf47e8f0f` / CI #7411 success / dev merge `09354818c37dc5fa649b65ac466448dc5d64494b` 后明确要求开始 R1C-1；从最新 origin/dev `fa6513a71451309898ffc4ab3c720b8c63458511` 创建 `feat/runtime-r1c1-normal-update-flow-20261020`，未触碰并行 Payments。新增 normal_runtime_update.py 的同一 NormalUpdateFlow.run 和 normal_runtime_launch.py；严格来源/准备/原状态/维护/快照/冻结复核/交接/验证/精确恢复/复验/最后放行顺序，齐备狭窄能力和请求/前驱/保留状态/原策略/快照记录摘要绑定，实例 Lock 拒绝并发/重入；异常、KeyboardInterrupt、SystemExit 后不推进/重试/自动 restore，部分 handoff/release 记 UNKNOWN，abort 二次失败保留原 cause。启动材料只哈希输入 bytes，冻结候选来源/源码/参数/环境/子进程提案，不执行或授信。新增 test_normal_runtime_update.py 的 18 个合成测试，含 66 个逐阶段前后异常/中断子场景、原策略 inactive/disabled 保留、未知快照不交接、回执/摘要漂移、一次性与回执副本隔离、预算和 Bundle/导入边界。实际跨进程事务/连续屏障、bootstrap、Host/AWS/安装适配器、持久化和完整 S6 消费尚未实现；首批核心不用于关闭 C1。A 类新增 Runtime/Ops 内部能力，唯一新内部边 core→launch，无业务 owner/跨上下文导入/依赖图债务/SCC/scanner baseline、公共持久化合同、兼容路径、旧 lab guard、17 Bundle、CI/依赖锁、Prisma/migration 或现役/生产变更；无 Guest/root/AWS 执行。同步 [所属 §8](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#8-r1c-1-正常更新流程核心与执行场景)、S1/R0/graph；本地仅静态审阅，MCP-workspace 未运行 lint/build/test/扫描，也未在外部环境代跑仓库源码或测试。R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 有限 CLOSED。首次远端交付前按 AGENTS §4/§10 停在本地报告，不沿用前批提交授权。

## 2026-10-20 — Phase E 真 VOID Canonical 独立记录补证

**LOCAL SOURCE IMPLEMENTED / REMOTE NOT AUTHORIZED / EXISTING VOID RECOVERY PENDING。** 用户授权一笔 Guest CAD $5.65 Sandbox Sale 及一次 Void，MacBook Test Merchant Original Sale `0KXYYAQYNPQAW` 成功，Compact VOID HTTP 200 + Welcome HTTP 200；Clover Dashboard `Voids` 已显示唯一 Void `EXXAZJM0C1VE4` 关联原 Payment，但 SanQ reversal Attempt `refund_8f61333d8b54a313f8538f1e3ab26f4897ef5804a89eb753` 仍 UNKNOWN / `CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE`，Order `cf9bc132eafae6a569d9d31db` 尚未退款。后续用户授权代码修复、暂停后要求继续；从 `origin/dev@09354818` 建立 `fix/clover-phase-e-void-canonical-evidence-20261020`。只在 Payments-owned Clover Platform Gateway 补上官方 reconciliation 指南的 `externalPaymentId + expand=voids` 有界只读 Collection 核验及可验证 Boolean/独立 Void 事实；保留原 Payment/Refund 正常查询、强身份/金额/Tip/附加费/冲突门禁，缺证据或不完整仍 UNKNOWN。增加聚焦 Jest 回归；无 Order/Benefits/HTTP UI/跨 owner、Prisma/migration、依赖锁、CI/架构基线、AWS VM/生产更改；真实 Payload 尚未读取，未在 MCP 运行 lint/build/test，不能宣布 Canonical/Orders 已修复或本地资金核销。MCP 静态差异审阅后停，等待用户单独批准远端 PR；后续 Mac 仅对 **原 Attempt** 的 Canonical-only 资金状态恢复须再授权，禁止发新 Sale/VOID/REFUND。详细见 [Phase E 实机事故及修复合同](../payments/clover-pos-phase-plan.md)。

## 2026-10-20 — Runtime R1-C S6 就绪审计与实施拆分

**DOC-ONLY MERGED / READINESS AUDITED；当时 EXECUTOR AND LIVE S6 NOT IMPLEMENTED。** 最终 head `4e31bd703442a3c546ad26952935dfabf47e8f0f` / [CI #7411](https://github.com/sanqin888/sanqinMVP/actions/runs/39472256317) success，dev merge `09354818c37dc5fa649b65ac466448dc5d64494b`；纯文档 Runtime/应用测试 lane 按范围跳过，不作为后续 R1C-1 源码验证。以下保留该准备批次的范围，后续源码实施见本卷 R1C-1 单独记录。 用户在 S5 成功原件有界验收后要求“下一步”；从最新 `origin/dev@acd7f19311bd1117aab4f67f3c293f1a47d8758e` 创建 `docs/runtime-r1c-readiness-s5-closeout-20261020`。按 R0 D1–D5 与 S1 队列，审阅现有更新声明/准备、lab installer/maintenance、字节绑定与静态线索，确定正式正常更新执行入口与完整实际消费尚缺；新增 [R1-C S6 工作包](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#7-r1-c-s6-就绪审计与实施拆分)，首批先冻结同一正常更新核心/入口和场景，后续覆盖 bootstrap、CPython import、ELF/dlopen、子进程的有界观察、来源补齐与独立裁定，明确 R4 最终接线变更不得沿用早期合成认证。同步 S5 实际结果到原 R1-B 批次及所属文档/S1/R0/B21C/graph，历史记录保留原时间范围。A 类内部文档准备，无源码、owner/跨上下文导入/依赖图/债务/SCC/scanner baseline、兼容路径、CI/依赖锁、Prisma/migration、17 Bundle 或 Guest/生产/AWS 配置变更；未运行项目 lint/build/test/扫描，无新现场命令。S5 的一次执行已完成、不重采；R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED，C2 有限 CLOSED。原始资料留在私有证据中，本地差异已审阅；用户随后明确要求“提交远端”，授权本批 PR、必要 CI 修复及全绿后 dev 合并。本批交付为 [PR #2886](https://github.com/sanqin888/sanqinMVP/pull/2886) → dev；首个文档提交 `de0cc8002dd22446ba46c90afa16cb313eac6f12`，R1-C 完整工作包保存在既有 R1-B 文档 §7，同步引用，无新增独立文件遗漏。最终 CI/合并以本 PR 准确 head 的实际检查与事件为准，不提前登记通过。

## 2026-10-20 — Phase E VOID Readiness 最小安全修复

**SOURCE CI VERIFIED / DEVICE ACCEPTANCE PENDING。** [PR #2884](https://github.com/sanqin888/sanqinMVP/pull/2884) 源码 head `06eb1a7ddf8ed0c3e7da767055a1cd7ba69fb04f` / [CI #7407](https://github.com/sanqin888/sanqinMVP/actions/runs/39458387167) SUCCESS：API lint/build/strict、shared strict、架构 baseline gate、API Jest（532 suites / 3438 tests 通过，既有2 suites / 2 tests跳过）、Web lint/build/strict/Jest（81 suites / 354 tests）、Browser E2E（13 passed）及API汇总均通过。本次文档续记后的最终head仍须CI全绿，合并事件以PR为准。 用户批准审计最小方案并在暂停后恢复代码修改；从最新 `origin/dev@ac5fcfef2ab43489a9b35be7048c93b1b2d31b6a` 创建 `fix/clover-phase-e-void-readiness-20261020`。Payments/Clover保留不确定HTTP为UNKNOWN、VOID发送前校验、Canonical真VOID/转换Refund/冲突检查与同进程队列/明确空闲Welcome；前置核验不写回原Sale零退款观察。Payments领域派生实际撤回结果，Orchestration response可选扩展 `reversalOutcome`，POS双语通知区分结果并阻止响应丢失后的盲目重试。补窗口/同Attempt跨窗口/迟到观察/设备/Canonical/UI聚焦回归；MCP本地仅静态差异和格式审阅，未运行lint/build/Jest/架构扫描；实际验证来自上述GitHub CI。C类关键路径受控修复，无新增上下文owner/直接导入/依赖边、架构allowance/scanner baseline、Prisma/migration、依赖锁、生产Web、Phase F/G、AWS/Runtime或设备金融操作；Orders/Benefits实现不变。用户同日已明确授权提交远端、PR、CI修复及全绿后合并dev；CI成功后仍须MacBook身份readiness及单独金融授权；已有两笔Refund不得重复操作，第二笔独立DB审计仍PENDING；**FULL PHASE E OPEN / VOID DEVICE ACCEPTANCE NOT AUTHORIZED**。详细 [Phase E准备及门禁](../payments/clover-pos-phase-plan.md)，并同步phase-6/current-dependency-graph及支付章程。

## 2026-10-20 — Runtime B2-1C 真实 deb 格式适配源码准备

**SOURCE IMPLEMENTED / SOURCE CI VERIFIED。** [PR #2883](https://github.com/sanqin888/sanqinMVP/pull/2883) 源码 head `6e8afe043d262a45b8da5c5853d7efe9b59082ed` / [CI #7400](https://github.com/sanqin888/sanqinMVP/actions/runs/39442496016) success；Runtime 436 tests + paired-image release 45 tests 均 OK，日志确认 Python 3.14，正向 zstd 未 skip。后续最终 head `15e6ff4bb3643303d522cdc5634d1a3dfb082c4e` / CI #7401 success，已 squash merge dev `ac5fcfef2ab43489a9b35be7048c93b1b2d31b6a`；Mac 固定该版本的七包回归完成，原件五文件及交付脚本/参考 pins/冻结源码已重算匹配，回执 SHA `a8b33d5defcc9408ccc275b15b24006c60fd08781339c8cabfa0a1ce3d0de8bf`。 用户授权前置文档合并后开始下一步；文档 PR #2882 head `e45065e910cf70e04006777960dd28031bf0d105` / [CI #7398](https://github.com/sanqin888/sanqinMVP/actions/runs/39440447717) success，已 squash merge dev `5223c08fc2dc9d3e4316f5af1bb6567e9e8b5f15`。随后从最新 origin/dev 创建 `fix/runtime-b21c-deb-format-20261020`；在 Runtime/Ops 既有纯内存 member reviewer 兼容有/无尾斜杠 ar 短名和标准库 zstd 单帧有界读取，增加缺能力、格式/预算/摘要/CRC 等聚焦合成覆盖；未新增进程、第三方依赖或修改 Guest Python。xz/gzip、B2-1D SCHEMA、永久 BLOCKED/false、既有包/文件/链接预算保留，zstd 窗口≤64 MiB。A 类内部能力扩展，同 API/owner、无临时双读或公共/持久化迁移；无上下文依赖边/SCC/scanner、Bundle17、CI/锁、schema/migration、Guest/root/生产/AWS 变化。同步 [B2-1C §4](C5-G2-R1-B2B2-B21C-deb包内文件与链接候选合同.md) 与 current-dependency-graph。MCP 本地未运行 lint/build/test；上述 CI 只证明离线合成测试，后续 Mac 实包回归独立留有原件，但均不构成 Guest root/FD 认证或实际动态消费证明。本地静态审阅和报告完成后，用户已于同日明确要求“提交远端”，授权本批 PR、CI 修复与全绿后 dev 合并；真实 root 执行仍须准确命令单独批准。C1/R1 OPEN、G2 NO-GO、S2 daily PAUSED，C2 有界 CLOSED。

## 2026-10-20 — Runtime R1-B S4 只读 Guest FD 采集器准备

**SOURCE MERGED / S5 CAPTURE + ORIGINAL-EVIDENCE CONSISTENCY PASS_SCOPED。** [PR #2885](https://github.com/sanqin888/sanqinMVP/pull/2885) source head `523a973c` / CI #7404 Runtime 465 + release 45 合成测试 OK；最终 head `0533c209a9a34a2f33902ef9731a9a5053f9537c` / [CI #7405](https://github.com/sanqin888/sanqinMVP/actions/runs/39455730047) success，dev merge `8a99c99eb17a3ff27552e3b0f611204691e72984`。本条更新同批原实施记录，不另建 S5 重复批次。最初从 origin/dev@ac5fcfef 创建 `feat/runtime-r1b-readonly-guest-capture-20261020`，新增 Runtime/Ops 独立 root-owned 源码/index/proposal、根 O_RDONLY FD → B1 alias-FD → B3B1 pread 与单独 /lib FD 的候选采集器及聚焦测试，保留已有入口/17 Bundle/BLOCKED 语义。其后 PREP 原件 70 项、Host 15 项、Guest 45 项 manifest 与交付材料已核对，补齐先前仅摘要的停点；用户明确批准 S5 暂存与一次 root 只读取证。001 原件 23 项重算通过，root SSH 认证失败未启动远端命令；002 仅有 incoming SSH 认证失败的操作员摘要。仓库外 RESUME-v2 复用原 incoming，不改 root command 范围；003 成功归档 SHA256 `7d33106d340df9727276a969f12925852f6ab9ecc5542ff6ab88b9e8a3300ab9`，27 项清单、准确 plan/wrapper/root-command/六份源码/index/proposal、原始回执链与三个退出码 0/0/0 匹配；三个 FD 共 8,297,330 bytes 及三条链接匹配既有独立包成员 pins。操作员实际 root collector 成功、离机原件复核完成；无第二次独立执行或完整动态依赖证明，两端 UTC 偏差如实保留。001/002/003 不覆盖、不再重采。详细证据与限制统一在 [R1-B §6](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)；私有原件、Mac helper/密码/现场 UUID/boot/ns/路径不入 Git。后续本地 doc-only 续记同步 S1、R0、B21C、graph；无采集源码/owner/上下文导入/依赖边/SCC/scanner/兼容登记、CI/锁/Prisma/生产变更，MCP 未运行 lint/build/test，也未在外部环境代跑仓库实现/测试。全部原始 trust/closure/install/production authority=false、decision=BLOCKED；R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED，C2 有限 CLOSED。后续进入 [R1-C 准备](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#7-r1-c-s6-就绪审计与实施拆分)，新现场命令另有准确范围门禁；本次文档续记纳入已获远端交付授权的 R1-C 准备批次，最终 CI/合并以其 PR 为准。

## 2026-10-20 — Runtime R1-A 七包来源原件重算与有限人工文档确认

**DOC-ONLY MERGED：PR [#2882](https://github.com/sanqin888/sanqinMVP/pull/2882)，final head `e45065e910cf70e04006777960dd28031bf0d105` / CI #7398 success / squash dev `5223c08fc2dc9d3e4316f5af1bb6567e9e8b5f15`；EXACT-OBJECT TECHNICAL REVIEW PASS / HUMAN DOCUMENT REVIEW LIMITED；R1-A 整体正式验收仍 OPEN。** 用户要求先更新文档并合并后开始下一步；从最新 origin/dev（包含 PR #2881）创建 `docs/runtime-r1a-evidence-review-20261020`，只续记本批事实。实际读取私有封存归档 SHA `7ebd8a8fabf78c586ad0055b4c4049f0f99e14f06d91020e2150d7ec802e453a`，六批 261 个原文件及 268 个载荷逐项核对；独立于采集 Mac/Guest 的审阅环境重新 gpgv、完整 6,993 stanza 索引、七个 deb（9,914,130 bytes）、三个普通成员（8,297,330 bytes）及三条 link text 均匹配，dpkg-deb 交叉核对 14 条 tar 流字节一致。base-files 补齐 lib/lib64 来源；原 B2-1C 无尾斜杠 ar/zstd 兼容仍 OPEN。更正邮件 SHA `0358dd3c394ba2eb274897bf63059a64dbfcd5a81d4fca8f51d2ba021a4205bb` 已读取，明确人工文档审阅、未自行技术校验；日期改为 2026-10-20，原件分别保留，不提升为独立技术见证/生产许可。详细 hash、原 rc/UTC、来源/现场限制及先后顺序统一记在 [S1 §9](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)，R0/原审批包增加最新索引，历史不追改。Mac 辅助脚本、原始归档/完整报告/.eml 均不入 Git，公开仅脱敏摘要/opaque ID；无源码、CI、架构 owner/依赖图、17 Bundle、schema/migration、锁文件、Guest/root/生产/AWS 配置变化。MCP-workspace 未运行 lint/build/test；本批实际 GitHub Checks/合并事件为交付依据。保持原回执 BLOCKED、guestRouteAuthenticated=false、R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED、C2 有界 CLOSED。合并后开始 B2-1C 最小格式适配和后续 R1-B 准备，真实 root 命令仍另审。

## 2026-10-20 — Phase E Compact Discover Credit Refund 修复与有界验收（SCOPED SANDBOX CLOSED；FULL PHASE E OPEN）

**以下为本批首次代码实施阶段的历史状态（后续合并/实测已完成，见下方续记）。MCP-WORKSPACE LOCAL SOURCE/TESTS/DOC ONLY / TESTS NOT RUN / NOT PUSHED。** MacBook Test Merchant 操作员执行唯一一笔 CAD $5.65 Refund：Clover Refund `WD51H52NKNDBM` 关联原 Sale `WKQYSCVH8TSJW`，Dashboard 有退款且小费 $0；SanQ Payment `UNKNOWN`（`CLOVER_PLATFORM_REFUND_TIP_MISMATCH`），Order `completed`，Compact 显示转圈而只读设备状态明确 `IDLE`。在独立 `fix/clover-compact-refund-canonical-welcome-20261020` 分支，Payments-owned Platform adapter 受限处理原 Sale 零小费且退款响应确实省略 `tipAmount`，不放松非零 tip/金额/身份/附加费用或未知资金状态；Terminal Refund 正向回执后仅在设备明确 IDLE 且有退款 ID 时发送 best-effort Welcome，显示恢复不得影响资金事实。补聚焦状态/并发序列/负例单测；未执行 lint/build/test，GitHub CI 尚未运行；原 Refund 同 Attempt 对账、MacBook 真机复测及生产验收均 PENDING。无公共 HTTP、Prisma/schema/migration、依赖/锁文件、owner/架构图/SCC/scanner、生产 Web Ecommerce、AWS VM/Runtime、外部自动重试变更。参见 [Phase E 事故修复记录](../payments/clover-pos-phase-plan.md)。

**同一批次 2026-10-20 合并与首笔 Sandbox 验收续记（第二笔自动 Welcome 实测前的阶段状态）：** PR [#2880](https://github.com/sanqin888/sanqinMVP/pull/2880) 最终 head `0f9ac9309b9df22f34525363c980ce45fd36c650`；[GitHub CI #7394](https://github.com/sanqin888/sanqinMVP/actions/runs/39429762079) **SUCCESS**，squash merge `dev@af2238d46dc37aac8d452baaba08bcd0f68fea40`。MacBook 操作员拉取最新源代码并重启 API，`git merge-base --is-ancestor` 输出 `SOURCE VERSION: PASS`；对同一 Refund Attempt `refund_7158a8701059f583f2f293ed9f3ae4dcb4df5598bf8206fc` 执行一次获授权的本地恢复 POST，HTTP 201 / status `SUCCEEDED` / Order `refunded` / 退款 565 cents / `failureCode=null`。随后独立只读 Prisma 审计 **PASS 7/7**：退款成功、原 Provider Payment/Refund ID 一致、退款与原 Sale 累计 565、原 Sale Refund ID 绑定一致、Order `refunded`、SanQ 同付款仅一个 REFUND Attempt；Clover Test Merchant Dashboard 已有原 Refund `WD51H52NKNDBM` 的 CAD $5.65 关联交易记录。Compact 初次故障明确 IDLE，操作员后续报告已恢复 Welcome 待机；**不将其误记成新代码自动 Welcome 已在真实下一次退款中测试通过**。只关闭 **Discover Credit CAD $5.65 Full Refund SANDBOX VERIFIED / SCOPED CLOSED**；在当时，完整 Phase E 的 VOID、Interac/card/PIN、timeout/restart、duplicate/权益 once-only、自动 Welcome 真实场景仍 OPEN；自动 Welcome 已在下方同批第二笔交易中完成实测，生产未部署/未验，未独立确认 Clover 最终 Refund 列表条数或银行清算。不再次发起这笔退款；若扩展验收需独立测试交易和授权。本次续记仅文档，**MCP-WORKSPACE LOCAL DOC-ONLY / REVIEW PENDING / NOT PUSHED**，没有源码、schema/migration、公共合同、模块 owner/依赖图/SCC/scanner、Web Ecommerce、AWS VM/Runtime 或资金事实更改。详见 [Phase E 有界验收](../payments/clover-pos-phase-plan.md)。

**同批 2026-10-20 10:21 设备 Welcome 真机验收续记（当前最终范围）：** 操作员随后使用**新的独立 Sandbox 订单** `c2c34d11c67982d59b1c0201f`（Payment `HY8KKDPK82HQT`，Refund `76C5ZPZBS0DZT`）实施第二笔受控 Full Refund，回传同 `reqId=mvgru9ge-2ht0ap` 的连续 Nest 日志：Terminal `POST .../refunds` HTTP 200 → device `GET /status` HTTP 200 → **自动 `POST /device/welcome` HTTP 200** → Platform `GET /refunds/76C5ZPZBS0DZT` HTTP 200 → SanQ `POST .../full-refund` HTTP 201；操作员现场确认 Compact 转圈后**无需重启、无需人工 Welcome 就恢复待机**。故 **`Refund automatic Welcome / SANDBOX DEVICE VERIFIED / SCOPED CLOSED`**，无需为这一项再发生第三笔退款。第二笔没有提交独立 Prisma 最终状态审计，不能把 HTTP 201/供应商 200 keys 替代新交易 DB 7/7；第一笔已完成的退款/订单 DB 7/7 保持不变。另同订单 `CANCELLATION` 厨房打印 `a49a0fbb-87c1-4696-ae52-a9d4eccf7c5b` 因 `CLIENT_OFFLINE` 延迟，`kitchen=PENDING`，独立列为打印投递待处理，不能声称已打印完成或推断退款失败。**本批有界关闭 = 第一笔 Credit Refund 资金恢复 + 第二笔自动 Welcome 设备实测；FULL PHASE E 仍 OPEN**（Void、Interac、异常资金/权益、生产待验）；未执行新代码修改、额外资金操作或部署。本次仍是本地文档补记，待审阅未推送。详见 [Phase E 双场景验收](../payments/clover-pos-phase-plan.md)。

## 2026-10-19 — Runtime R1 S1-W1 / S1-R1 / D1 限定验收与剩余项核查

**DOC-ONLY / MCP-WORKSPACE LOCAL / REVIEW PENDING / NOT PUSHED；Runtime R1/C1 OPEN。** 基于 GitHub `dev@58e317b79024a027644be7ec55e5eb7b9ad71143` 只读核查，Runner [PR #2876](https://github.com/sanqin888/sanqinMVP/pull/2876) / merge `c2e33af27bb15ad5ba209dd3831a2aae5a462d4a` / [Actions run 39285377503](https://github.com/sanqin888/sanqinMVP/actions/runs/39285377503) success。操作员回传独立 Debian/Canonical keyring 3,607-byte SHA 一致、限定见证审批 .eml，MacBook D1 15/15 SHA256SUMS OK；经 `gdrive_secure:runtime-trust/v1/S1-W1R1-D1-20261019-0f0683a2/` 的 Google Drive object `1cOiq-V7wjef-F5kOivVsD5uC1Ct5QA-y` 解密读回 tar.gz SHA `0f0683a2a9ae2c68c572d28864d66c6e9646cd7da9d287c9423e1574fd282600` 与源包一致。没有单独验证 Gmail MIME 字节同源、U 盘副本或 WORM。**S1-W1/R1/D1 限定工作完成不等于 Runtime R1 整体或 C1 PASS**；最新剩余 R1-A（实际 Ubuntu 包认证和必要 S0/S3）→ R1-B（S4/S5 root FD）→ R1-C（S6 动态 Python/ELF/dlopen 消费和 C1 独立裁定）。历史“未执行”正文保留当时状态，新增 [S1 §8](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md) 与 [R0 §9](Runtime更新-R0冻结设计.md) 续记。无 Runtime/Ops 实现、17 Bundle/Manifest、架构所有权/依赖图/SCC、CI、应用、Prisma、锁文件、云/Guest/root/生产行为变化；C2 有界 CLOSED、R2–R5 原队列保留、C5-G2 NO-GO、S2 daily PAUSED。本地未运行 lint/build/test，首次远端交付须再次审阅并授权。

## 2026-10-19 — PEM-S1 持久化验收交接与 POS 本地待付款标记修复

**最终收口状态（2026-10-19）：PEM-S1 SANDBOX VERIFIED / CLOSED（FINANCIAL + DB + POS UI）。** MacBook operator-executed DB AUDIT **PASS 8/8**；UI 修复 PR [#2877](https://github.com/sanqin888/sanqinMVP/pull/2877) 最终 head `0e1ba6ed`，GitHub [CI #7387](https://github.com/sanqin888/sanqinMVP/actions/runs/39294177674) **SUCCESS**，已 squash merge `dev` 为 `03b2e3501e243efdf8978eba93e5ad8c6083a7d4`；MacBook POS 用户新截图确认黄色未决付款横幅消失、结算界面恢复正常。**不代表 Production PEM 已验证；本条同批记录更新，不新增实施批次。** 操作员在隔离 Test Compact 重启/恢复网络后对同一 `SANDBOX_CONFIRM_UNPAID` 案件受控续跑，提供 POS 截图显示 Payment/Checkout `FAILED`、`POS_TERMINAL_SANDBOX_OPERATOR_UNPAID`、Benefits RELEASE、Terminal Fence `FINALIZED`、Case `COMPLETED`；此前离线执行 `NEEDS_REVIEW` 的审计已读到一次兜底执行错误、原 Payment 保持未决，具体异常原文未持久化。其后用户在 MacBook 本地执行隔离门禁下的只读 Prisma 审计，回传 **DB AUDIT PASS 8/8**：Case `cmveb9ftd0000y6o4imwyb4qm` `COMPLETED`；执行 3 次，2 次历史 `RECOVERY_NEEDS_REVIEW` + 最后一次 `RECOVERY_COMPLETED`，`finishedAt=2026-10-19T15:49:36.419Z`，最终失败码 null；Payment/Checkout FAILED、Benefits RELEASE、Fence FINALIZED、SandboxRecovery 完整、原 Checkout 没有对应付费 Order。该状态仅限操作者回传的 MacBook Sandbox 持久化验收，不等于生产或 Clover 官方取消。POS 黄色警示是本地 pending marker 未清理：只更改 POS Web 既有只读 readback/对应门店案件 GET 的同 Attempt 严格交叉验证后清理浏览器态，保留 CANCELLED RELEASE 兼容及其他失败状态 fail-closed；新增 guard/readback 回归覆盖。无 Payments/Checkout/Benefits/Terminal 新写入、无生产 Ecommerce、schema/迁移、API/WebSocket 字段、依赖锁文件、上下文 owner/公共依赖方向、SCC 或 scanner baseline 改变；按前端内部收口和既有关键支付门禁审阅。新分支 `fix/pem-s1-pos-finalized-unpaid-pending-20261019` 从最新 `origin/dev` 创建，不触碰并行 Runtime 分支；MacBook DB 审计由操作员执行并回传 8/8 通过；Web 修复 PR #2877 最终 head CI #7387 全绿并合并 `dev`，用户随后回传 MacBook POS 截图，原黄色锁定提示消失且支付方式选择控件显示正常；界面右上「历史待处理·3」为核查列表数量，不能用来断言其他付款全部结清。本次只关闭指定 Sandbox CAD $16.95 Attempt 的金融恢复 + UI 遗留项，不声称 Clover 官方取消或生产 PEM 验收，操作员截图未独立附运行构建 SHA。详细所属文档：[PEM §7](../payments/支付异常管理-PEM.md)。

## 2026-10-18 — R1 S1-M0 MacBook 公钥候选脚本独立交付与仓库文档记录

**状态：MAC SCRIPT EXTERNALLY DELIVERED / REPO DOC-ONLY PR AUTHORIZED / MAC NOT RUN / NO REAL UBUNTU SIGNATURE VERIFIED。** 用户选择方案 B（现有 Google Drive + Mac 完整离机证据），授权分批执行 Mac T1 → GitHub Runner 真实 S1 验签 → 后续 Drive 归档 → 生产只读验证。按用户后续明确决定，Mac 专用 Canonical 公钥候选采集脚本及其 12 项本地模拟测试**仅通过聊天独立交付，不进入远端仓库/CI**；本批只提交分阶段设计与状态说明。Mac 的 /usr/bin/python3 已存在，尚缺 gpg；操作者可审阅安装 Homebrew gnupg。采集公钥不能自证信任；须由独立可信 Debian/Ubuntu 软件包签名链见证并人工批准准确 keyring SHA，才可另批建立 Runner workflow。Drive/生产 Runtime 接线尚未实施、不得越过独立权限审阅，原 17 Bundle、备份 OAuth、现役 daily/CI、AWS、Guest 和生产均未更改。详见 [S1 设计追加 §6](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — Runtime 旧隔离维护实验：失败/中断不自动恢复

**状态：SOURCE CI GREEN / FINAL DOCUMENTATION CHECKS PENDING / 未部署。** PR [#2874](https://github.com/sanqin888/sanqinMVP/pull/2874) 的源码提交 `201ea1b396a38d3df566a94588646a5f372e1f9a` 已通过 [CI #7379](https://github.com/sanqin888/sanqinMVP/actions/runs/39192838473)：4 个选中作业成功，Runtime 415 / Release 45 tests OK；其余无关作业按范围跳过。此处只追加实际证据，不改源码；最终文档 head 的 Checks 与合并事件仍为交付权威。本地测试未运行，未部署/未做真实主机验收，C5-G2 NO-GO。 用户明确指出历史合成维护实验的 `finally` 会在失败后恢复原服务。本批按 A 类内部原子修复移出无条件恢复：停止/观察/排他失败与可捕获中断保留 cause、不请求 restore，仅成功实验核对原状态恢复。更新忙消费者/非法声明断言，补第二次核验、部分停止与两次观察异常/中断回归；原成功恢复及恢复失败/来源/锁/Bundle 护栏保留。[所属文档](c5-g2b2b-isolated-operator-rehearsal-2026-10-13.md) 明确历史与当前源码、新更新流程不得直接复用本实验；同步依赖图无变化。Runtime/Ops 既有边界内修复，不是已部署生产问题，不增加真实维护/更新入口、特权或 AWS 动作。无 schema/依赖/CI/Bundle 变更；不需要迁移。MCP-workspace 无 lint/build/test 权限；用户已授权本补丁远端交付，分支 `fix/runtime-isolated-maintenance-failure-freeze-20261018` 从 `origin/dev@08937ee5` 创建，以最终 head 的 GitHub Actions 结果为准。


## 2026-10-18 — R1 S1 Ubuntu Archive 独立签名采集 CLI（本地、未执行）

**基线：**S0 审批与 Mac 回执文档 PR #2872 / GitHub Actions #7375 success / dev merge `001d7c345bff43f8c29391fdf9da45286c57fb81`。**本次状态：LOCAL SOURCE/TESTS/DOC ONLY / NOT RUN / NOT PUSHED / USER REVIEW PENDING。** 由于当前隔离 Debian 13 容器缺 Ubuntu 可信 Archive keyring、官方 archive URL DNS 返回 rc=6，没有伪造 gpgv 真实签名结果；而是在 `docs/c5-g2-r1-s1-real-ubuntu-signature-evidence-20261018` 构建独立于 Guest/生产的官方 `Release + Release.gpg` HTTPS 限域下载及预先固定 SHA 的 Archive keyring 对照、gpgv 主键指纹/摘要算法/发行时效校验、私有只读证据回执脚本，并编写 22 项虚构原件/模拟网络/gpgv 的合成负例。严格 `decision=BLOCKED`、不自动授信、不进入 Runtime 17 Bundle 或安装路径；详见 [S1 可审阅采集合同](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。Mac/Guest/root、系统安装、Archive 原件下载和真实 gpgv 都未在本批执行；S0 有界身份匹配、S1 仍未实际验签，C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — S0 Mac Host 五项只读身份预核对（操作员回传）

**S0：IDENTITY MATCHED (OPERATOR-OBSERVED) / EVIDENCE LIMITED / NOT FULLY VERIFIED。** 已审阅操作员上传的五条准确 VBoxManage snapshot list、snapshot showvminfo、Source/Recovered showvminfo、recovered VDI showmediuminfo 终端转贴。精确 Source/Snapshot/Recovered/VDI UUID 与冻结 C2 登记一致；Snapshot base VDI、Recovered base VDI、Host-only NIC、VM 电源状态、当前 clipboard/dragdrop 显示符合预期。特别保留 Source Snapshot 的双向剪贴板、Source 当前差分盘 UUID 与 Snapshot base 不同、Recovered VDI 在 running 状态下 locked write 等真实观察，不伪称矛盾或静默改配置。**欠缺每条真实 shell rc、原始 stdout/stderr 独立保管、采集 UTC、Mac Host witness、当前 Guest 内路由/共享文件夹完整闭包**，故未签认整机隔离/原件真实性。仅本地文档更新，不运行 Host/Guest/root。S1 真实独立 Ubuntu 官方 Release GPG 仍未验证，S2–S6 不启动；C1 OPEN / G2 NO-GO / S2 PAUSED。参见 [审批包 §9](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)。

## 2026-10-18 — R1 B2-1 真实 Ubuntu 来源与 C2 Host/Guest/root 取证审批准备

**首次文档状态：LOCAL DOCUMENT-ONLY / SOURCE NOT CAPTURED / NO ROOT OR GUEST EXECUTION / NOT PUSHED；2026-10-18 用户随后明确批准 S0 Host 身份预核对与 S1 Ubuntu 独立来源验签范围。已作真实工具可达性核查：MCP 不具备 Mac/VirtualBox Host 直连能力，S0 无新实测；独立 Debian 13 执行环境具备 gpgv 但无独立可信 Ubuntu keyring 且 archive.ubuntu.com DNS 失败（curl rc=6，下载接口亦失败），S1 未下载成功任何签名原件、未运行 gpgv。** 在用户明确授权开展**审批准备**后，基于 B2-1D PR #2871 / CI #7373 success / dev merge `e5f2e64376251f9f03edb1ebf337f74fab820d90`，在 `docs/c5-g2-r1-b21-real-provenance-root-approval-20261018` 整理 [真实来源验真与 Host/Guest/root 分组命令审批包](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)：历史准确 C2 资产身份、B2-1A Host5/Guest9 只读命令、Canonical Ubuntu Archive key/签名 Release→Packages→deb/member→manifest 独立证据闭包、离机 stdout/stderr/rc/actor/witness、root collector 需先源码 CI/SHA 冻结才能执行。尚未下载 Ubuntu 原件/执行签名验真、Mac/VM/Guest、sudo/root 或 AWS/生产操作。B2-1D 只实现合成 CI 绿，不提高独立来源认证；无代码、业务所有权、依赖边/SCC/scanner、17 Bundle、HTTP/Prisma、CI/锁文件或生产变更；C2 有界 CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — R1 B2B2-B2 B2-1D 跨包归属与 Manifest 候选覆盖

**首次本地审阅：SOURCE/TESTS AUTHORED / NOT RUN。后续远端交付 PR #2871 / CI #7373 success / merge commit `e5f2e64376251f9f03edb1ebf337f74fab820d90` 已进入 dev；仅合成 CI GREEN，未验 Ubuntu 原件、真实 Host/Guest/root。** 基于 B2-1C PR #2870 / CI #7371 success / dev merge `3c623b88a20962a820d6269ab330e6b6c48552f3`，从独立分支 `feat/c5-g2-r1-b2b2b2-b21d-manifest-provenance-offline-20261018` 新增外置 Runtime/Ops `root_python_b21_multi_package_manifest.py` 与纯内存合成测试。复用 B3A manifest validator 并严格核对 N 包候选 B2-1C receipt 的 regular SHA/声明式 symlink 原文、logical→member 唯一映射、无漏/多/孤儿/重复，全部结果 BLOCKED。详见 [B2-1D 审阅](C5-G2-R1-B2B2-B21D-跨包文件归属候选审阅.md)。不证明 GPG/真实发行源、Guest/Host/root FD 或动态消费；无业务 owner/import、依赖图/SCC/scanner、Runtime 17 Bundle、CI/依赖锁文件、Prisma/API/生产/AWS 变化。C2 有界 CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — R1 B2B2-B2 B2-1C Debian 包内 member 字节与 symlink 候选合同

**首次本地审阅：SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN。后续用户授权提交：PR #2870 / CI #7371 success / merge commit `3c623b88a20962a820d6269ab330e6b6c48552f3` 已进入 dev；仅合成 CI GREEN，不认证真实 Ubuntu 包或 Guest/root。** 基于 B2-1B PR #2869 / CI #7369 success / dev merge e823bb165c1cf0460cf1279cda8d44f0b6884366，在 feat/c5-g2-r1-b2b2b2-b21c-deb-members-offline-20261018 外置新增 ops/runtime/root_python_b21_deb_members.py 和纯虚构 .deb ar/data.tar 测试。仅对 caller 提供的候选 deb bytes/整体 SHA、明确选定包内 regular 文件 digest、symlink 原始 link text 进行有界纯内存核对；不跟随链接、绝不认证 Ubuntu GPG/官方包来源或 Guest FD，也不运行 VM/root/安装。详见 [B2-1C 合同](C5-G2-R1-B2B2-B21C-deb包内文件与链接候选合同.md)。不改业务 owner/导入、依赖边、SCC/scanner baseline、17 Bundle、B1/B3B1/B2-0/B2-1A/B2-1B 原合同、HTTP/Prisma、CI/锁文件、AWS/生产。C2 LIMITED CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — R1 B2B2-B2 B2-1B Ubuntu 来源 Release→Packages→deb 原始字节链

**首次本地审阅：SOURCE + TESTS AUTHORED / NOT RUN；后续用户授权远端交付：PR #2869 / CI #7369 SUCCESS / merge commit e823bb165c1cf0460cf1279cda8d44f0b6884366 已进入 dev；仅合成 CI GREEN，不认证外部源。** 基于 B2-1A PR #2868 / GitHub CI #7367 success / dev merge `5711aa1267cd7f5cbc9b011747edf5b99cd9f9a9` 创建 `feat/c5-g2-r1-b2b2b2-b21b-ubuntu-byte-chain-20261018`。在 `ops/runtime` 新增纯内存 Ubuntu Release/Release.gpg/Packages[.xz]/.deb 原始候选 bytes/size/SHA256/架构/版本/路径一致性审阅模块和虚构原件/XZ 合成负例，详见 [B2-1B 设计和状态](C5-G2-R1-B2B2-B21B-Ubuntu原始字节链合同.md)。不执行 GPG 验签、不提权、不触碰真实 Guest、VM、AWS/生产、不认证 deb 内成员与官方来源、不授予执行权限；保持 C2 有界 CLOSED / C1 OPEN / G2 NO-GO / S2 PAUSED。没有业务 owner、依赖边、SCC/scanner baseline、17 Bundle、CI/依赖锁文件/Prisma/HTTP/现役 Runtime 变化。

## 2026-10-18 — R1 B2B2-B2 B2-1A 原始 Host/Guest 只读取证合同

**初始审阅状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN。后续远端交付：PR #2868 / CI #7367 SUCCESS / merge commit `5711aa1267cd7f5cbc9b011747edf5b99cd9f9a9` 已进入 dev；仅合成 CI GREEN，不认证真实 Host/Guest/root。** 上一批 B2-0 PR #2867 已合并（CI #7365 success；merge commit `b95f09e1984a8ba134289775ae30aeddaff81c5c`）。本批基于最新 dev，分支 `docs/c5-g2-r1-b2b2b2-b21-readonly-evidence-approval-20261018`。外置 Runtime/Ops 新增 `root_python_b21_raw_transcripts.py` 和对应纯合成测试，仅对特定 C2 Source/Snapshot/Recovered VM/VDI 的五项 Host 和九项 Guest **已提供的原始 byte**、严格白名单 argv、内/外 rc、各材料 SHA、大小/顺序/补缺进行负向优先审阅；正常结构一致也永久 `BLOCKED`。同步 [B2-1A 精确审批包](C5-G2-R1-B2B2-B21A-原始只读取证审批包.md)，说明真实 Host、Ubuntu 包签名与未来 Guest root 必须另行授权。没有代码执行、Mac/Guest/SSH/root/VM/AWS/生产操作或真实平台证据；无业务模块/依赖方向/SCC、17 Bundle、Prisma、CI、锁文件、数据或生产行为变化。C2 有界 CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。

## 2026-10-18 — R1 B4B-3B-2B2-B2 第一批 B2-0 源码及 B2-1 只读取证设计

**状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO REMOTE PR。** 基于 `origin/dev@eec9668c5c90df38ed7be08cf7f1b2f0607516bc` 创建 `feat/c5-g2-r1-b2b2b2-evidence-contract-20261018`。在 Runtime/Ops 外置 `ops/runtime` 中增加 B1+B3B1 候选 Guest packet（严格结构/FD/alias/阻断状态）与独立 Host/Guest/Ubuntu .deb 来源 pin/custody **声明**比对模块以及纯虚构不执行的合成测试；[B2-1 合同](C5-G2-R1-B2B2-B2-取证合同与离机审核.md) 指定独立 Host/发行包/Guest 证据顺序与未来单独 root 审批。结果强制 BLOCKED/全部授权 false；不改变 B1/B3A/B3B1、17 Bundle、owner/依赖/SCC/scanner、CI/依赖/Prisma/HTTP/业务或生产。**首次审阅时**没有本地测试执行、CI、Guest/root、真实平台/包签名验证、AWS/生产操作。C2 维持有界 CLOSED、C1/C3–C7 OPEN、C8 NOT REQUESTED、C5-G2 NO-GO、S2 PAUSED。**同一批后续交付：**用户授权远端后提交源码 `8f8ed7538177500d30b99b824f5ce9badf959476`，PR #2867，GitHub Actions #7365 `success`（Runtime ops-checks 通过），merge commit `b95f09e1984a8ba134289775ae30aeddaff81c5c` 已进入 dev；这一状态仅表示合成 CI GREEN，不升级 Guest/root/软件包来源/C1 真实性。

## 2026-10-18 — C2 N-07 最终风险裁定与隔离恢复有界 Closeout

**状态：LOCAL DOCUMENTATION / C2 CLOSED — ISOLATED SYNTHETIC RECOVERY VERIFIED / N-07 LIMITED-ACCEPTED / C5-G2 NO-GO；首次远端交付待用户审阅。** 基于最新 `origin/dev@b22f90469963c73281bdaa4ae4861e1eb5b53d82`（PR #2865 / CI #7361 及先前 AWS 设计 PR #2864 已合并）重审 AGENTS、R0 C1–C8、C2-CHANGE-01/02、B2B2 §7/§9、G2、[AWS 快照新方案](Runtime更新-AWS快照与维护冻结方案.md)、恢复手册及既有 C2-0/C2-1 离机原件复核登记。依据用户「如果没什么大问题就 closeout C2」授权，**只针对已经验证的指定可丢弃 Test-02 → 独立新实例恢复流程**接受 N-07 的低影响残余风险（历史 Mac Host 无独立签名见证、部分外层 SSH rc 缺失、本轮 Host 实时输出未另行封存）；保留这三项真实性/取证边界，不把一致的归档 SHA、Guest 19/22 稳定观测、合成 HTTP 200 或独立 base VDI 夸大为整盘 hash / 真实 AWS 恢复。N-01/02/04/06 有界 VERIFIED、N-03/05 VERIFIED with limits、N-07 LIMITED-ACCEPTED。R0 **C2 有界 CLOSED**，C1/C3–C7 OPEN、C8 NOT REQUESTED，G2 不因此晋级；C1/root/FD/外部发行来源及 B2B2-B2 具体 Guest 操作须另批。**AWS RUNTIME-SNAPSHOT-01、MAINT-RESTART-01 只是设计批准，真实同平台 S01–S12 未验证、NO-GO；保留每日现役备份、S2 PAUSED。** 同步 B2B2 §9.6、R0、G2、AWS 设计、恢复手册和依赖图；未执行任何 VM/Guest/云/生产操作，无源码、owner、Prisma、CI、锁文件、Bundle 17、敏感原始证据提交。MCP workspace 不具备 lint/build/test 执行权限，本地仅差异/文档审阅；经用户审阅后另授权远端 PR→dev/CI→合并。

## 2026-10-18 — C2 最终 A/B Host 配置只读复核（基于 PR #2864 后的 dev）

**状态：C2-02 VIRTUALBOX SYNTHETIC RECOVERY VERIFIED（有限范围） / N-07 LIMITED / C2 OPEN / C5-G2 NO-GO。** 在 `origin/dev@4f34c6f86bfc0650d900da9696497c0cc9508188`（#2864 已合并、AWS 快照与维护冻结为现行设计）上只补录本次操作员提供的最终 A/B 核验：Mac 原件审阅脚本确认 C2-0（237 files、6 manifests、231 hashes，SHA `5503b6f9…`）及 C2-1（60 files、3 manifests、50 hashes，SHA `29257b27…`）完整，Guest 22 项中 19 同值、3 项 time/IP/mountinfo 预期不同，既有 clone rc=0 与合成 HTTP 切换/停止通过。**新 Host 只读核对**：源 Test-02 `4b1bd5e7-…` 的 Snapshot `028a681b-…` 指向原 base VDI `66ad835f-…`，`snapshot showvminfo` rc=0；Snapshot Host-only、剪贴板 **Bidirectional**。恢复 VM `162701f1-…` running，独立 MAC `08002703FDC2`、Host-only、clipboard disabled；VDI `39381cc9-…`、`Parent UUID: base`，normal/base 25600 MB、占用 4345 MB，`showmediuminfo` rc=0。**限制**：Host 查询这轮仅对话终端原文，未附新的离机 stdout/stderr/hash；管道 `grep` 的 VBoxManage 上游 rc 未单独记录；归档不能独立见证最初 Mac Host 身份，部分历史 SSH 外层 rc 缺失。将精确对象与 N-01–N-07 限定验收登记于 [B2B2 §9.5](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)，不宣称整盘快照逐字节证明、不重测 Marker A/B、不关闭 C2。**范围严格仅 docs；PR #2864 的 AWS RUNTIME-SNAPSHOT-01、MAINT-RESTART-01 仍仅批准设计、没有真实同平台 AWS S01–S12 验收；无 VM/Guest/root/生产操作**。该批由独立最新 dev 分支审阅，不再次提交已被 #2864 纳入的 C2-CHANGE-02 合同。

## 2026-10-18 — Runtime AWS 整机快照与维护冻结方案（同批持续更新）

- **批准与基线：**用户明确采用“AWS 整机快照 + 更新前容器不自动重启再生成快照”；从 `origin/dev@a76d526592b7a46e4659f485a3089d753e267b3c` 审阅。只做文档；用户在审阅 47 份文档报告后已明确授权本批远端交付，包含保留的 C2-CHANGE-02 文档规则/有限复核登记；没有云/生产操作授权。
- **远端交付：**[PR #2864](https://github.com/sanqin888/sanqinMVP/pull/2864) → `dev`，功能分支 `docs/runtime-aws-snapshot-recovery-20261018`。47 份文件均已显式暂存，包括新主方案；远端 PR 文件清单/最终 head 的 GitHub Checks 与合并事件为权威，不预先声明通过。未执行本地项目测试或生产操作。
- **并行记录保留：**保留共享工作区另一 C2 文档任务已提交的 `4eabfa2b16d0306e6c43bfc4e8ca0f586fb0b44b` 中的 C2-CHANGE-02 规则、原件复核和有限范围登记；其分支/提交原样保留，未 reset/覆盖未提交工作，不将其验收当本批执行。
- **合同：**新增 [AWS 快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md)，修订 R0 D2–D5/C4–C7/R2–R5、G2 A–F、安装约束、备份/恢复、索引与总队列。代码创建唯一 Lightsail 手动快照→核对 available/源/盘/txid；先记录原策略并离机保存，再准确容器 no/正常停服与启动入口禁入；快照和新实例首启保持维护，成功验证后按原状态恢复，故障不自动放行。
- **替代与保留：**旧 mandatory crypt/Drive preinstall Kit、双 Archive 解密取回与故障机自举 clean reinstall 退出本次强制范围；每日独立备份/escrow、正常更新执行器和目标来源保持。C2 既有证据规则与独立复核不覆盖，本批不伪造 PASS、不默认重建历史 VM/marker。放行后/外部 UNKNOWN 转独立 DR/向前修复及权威对账。
- **验证与状态：**47 份 Markdown（新增主方案 1 份、修改现有 46 份）逐份回读一致；91 个新增相对链接目标有效；历史正文/17 成员发布清单保留，新增 diff 无尾部空白或冲突标记。只做源文本/引用/历史边界和 diff/readback 审阅；本批无本地项目测试、Guest/root、实际快照、Docker policy/Compose、IAM/凭据、17 Bundle、依赖或 Prisma 变更。DOCUMENTATION DELIVERY AUTHORIZED / IMPLEMENTATION NOT STARTED / AWS ACCEPTANCE NOT RUN / C5-G2 NO-GO。本批提交/推送/dev PR/CI/合并已获用户授权；最终 head 的 Checks 和合并事件为交付权威，不提前宣称通过；后续状态更新本条，不另起同批日志。

## 2026-10-18 — Runtime C2-CHANGE-02：归档原件复核与 A/B 充分性合同

**状态：用户已明确授权修改恢复验收证据方法；LOCAL DOCS COMMIT / REMOTE PR NOT YET AUTHORIZED。** 基线 `origin/dev@a76d5265`（C2-CHANGE-01 PR #2863 / CI #7356 已通过并合并），分支 `docs/runtime-c2-ab-evidence-reuse-contract-20261018`。本次首次**直接读取**用户上传 C2-0/C2-1 两份原始 `.tar.gz`，复算 C2-0 SHA-256 `5503b6f9942613e66e886ddd945aad4544c4f4d56835539db97cd8bc0683eaea` 与 C2-1 `29257b278195725002754d8925edec5b7328526df5afe8da7f6d2872fe43f3cd`；可解析的 archive 内部 manifest 全部匹配；两轮 `guest.stdout` 各 22 命令，19 个输出/rc 完全一致，其余为 UTC、IP `.2`→`.3`、mountinfo 运行时 `pipe_ino` 的预期差异；clone 原始 rc=0、目标 VDI `Parent UUID: base`、HTTP 合成切流/停止结果均在原始文件中可复核。**来源界限：**clone stdout 仅报告成功，未包含完整 clone 命令；归档本身无法独立认证原始 Mac Host 在采集时的真实性，且 Guest A 不是创建 snapshot 瞬间的逐字节映像；外层 SSH rc 缺失及首次停止 404 保留。用户本轮明确取消强制 Marker A/B 与默认重新创建 VM/snapshot，N-02/N-03/N-05 改为从 Snapshot/source/medium → clone → 独立 VM/VDI → 已有 Guest 选定状态的只读 A/B 充分性核查。明确区分 VERIFIED/LIMITED/BLOCKED；只有关键不可替代的证据缺口才单独提补证方案和审批。同步 [R0](Runtime更新-R0冻结设计.md)、[B2B2 §7/§9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)、[G2](c5-g2-trusted-runtime-contract-2026-10-13.md)、[依赖图](current-dependency-graph.md) 和 [备份恢复手册附录 A](../runbooks/backup-recovery.zh-CN.md)。**C1/C2 OPEN、C5-G2 NO-GO、S2 DAILY CONFIG EXPANSION PAUSED**；无任何 Guest/VM/snapshot/生产操作，无 Runtime 源码、CI、业务 owner、模块依赖、schema/依赖/17 项 Bundle 变更；MCP-workspace 无本地 lint/build/test 权限，待本地审阅后再远端授权。

## 2026-10-18 — Runtime C2-CHANGE-01：生产模式新实例恢复验收合同直接替换

**状态：用户明确批准 C2 验收合同调整 / MCP-WORKSPACE LOCAL DOCUMENTATION / USER REVIEW PENDING / NO REMOTE PR。** 工作分支 `docs/runtime-c2-production-style-recovery-contract-20261018`，基于 `origin/dev@b18fb0e3`（前批 C2 文档 PR #2862 / CI #7354 已合并）。按用户本轮授权**直接替换**旧 C2-02 强制 VirtualBox 原机 `snapshot restore` 验收，不保留原 C2-02I 备选或另一个需审核的合同方向；唯一当前 C2-02 N-01–N-07 为受控 disposable source 的 Snapshot → 独立新实例、快照前基线 marker / 快照后差异 marker / 恢复目标的正负读回、Host/Guest/介质/隔离身份、合成端点接管、完整 rc、离机跨主体见证。旧 C2-0/C2-1 实测只在已记录范围内复用，不能因合同修改追认 PASS；新一轮 marker、退出码、独立 witness 未补齐，**C2 OPEN / C1 OPEN / C5-G2 NO-GO / S2 PAUSED**。同步 [R0](Runtime更新-R0冻结设计.md)、[B2B2 §7.3/§7.4/§9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)、[G2](c5-g2-trusted-runtime-contract-2026-10-13.md)、[备份恢复手册附录 A](../runbooks/backup-recovery.zh-CN.md) 与 [依赖图](current-dependency-graph.md)；不改变 D1–D5、C1/C3–C8/G2、业务 owner、依赖/SCC/scanner、Bundle 17、Prisma/CI/依赖、Guest/root/生产。未运行本地 lint/build/test；远端交付须经审阅授权。

## 2026-10-18 — Runtime C2-0 / C2-1A–D 生产式恢复实测记录与文档收口

**现行交付续记：PR #2862 / CI #7354（docs-only 选中作业 success）已 squash merge 至 dev `b18fb0e3`；以下 LOCAL/NO PR 代表首次撰写时历史状态，C2 未关闭。** **历史状态：OPERATOR-REPORTED C2-0 OBSERVATION + C2-1A–D SYNTHETIC NEW-INSTANCE RECOVERY / LOCAL DOCS REVIEW / NO PR / C2 STILL OPEN。** 基于最新 `origin/dev@5d69eb81` 新建 `docs/runtime-c2-recovery-evidence-closeout-20261018`，审阅 AGENTS/CI/R0/G2/B2B2/现行备份恢复手册；将用户在 Mac VirtualBox 的 C2-0 Host/Guest 普通用户观察、源磁盘/快照/隔离、C2-1 指定 snapshot → 独立 VM、新磁盘与 MAC、Ubuntu/loader baseline `diff=0`、Host-only 合成 HTTP 200/停止后 curl 7、C2-0/C2-1 证据包本机与 Google Drive 下载 SHA 校验 `OK` 的实际范围写入 [B2B2 §9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)；同步 [R0](Runtime更新-R0冻结设计.md)、[G2](c5-g2-trusted-runtime-contract-2026-10-13.md)、[依赖图](current-dependency-graph.md)、[Lightsail DR 草案（备份恢复手册附录 A）](../runbooks/backup-recovery.zh-CN.md)，并校正 B2B2-B1 PR #2861 / CI #7352 / dev `5d69eb81` 已合并事实。**限制：**C2-0 与恢复后 Guest SSH、HTTP 服务外层 SSH rc 未捕获，首次停止 404 已保留；C2-1 archive 完整 SHA 值未在对话提供、离机原件未被 MCP 独立重读。C2-1 为 `clonevm --snapshot --mode=machine` 而非真正 `snapshot restore`，故原 C2-02 与独立见证门禁仍 OPEN；没有真实 Web/API/DB/Static IP/Cloudflare/供应商或 root 测试，**C1/C2 OPEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。文档-only，无 owner/依赖/SCC/Bundle/CI/Prisma/业务或生产写入。MCP-workspace 不运行 lint/build/test；首次远端交付待用户审阅授权。

## 2026-10-18 — R1 / B4B-3B-2B2-B1：受限 symlink FD 合成候选解析器

**现行续记：PR #2861 / CI #7352 (run `39103592288`) 已成功合并 dev `5d69eb81`；仅合成检查，不是 Guest/C1/C2/生产验证。以下 LOCAL/NOT RUN 为首次写入时的历史状态。** **历史状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NO PR / USER REVIEW PENDING。** 最新源 `origin/dev@c9bfa566`（#2860 设计评审/CI #7350 已合并），工作分支 `feat/c5-g2-b4b3b2b2b1-controlled-alias-fds-20261018`。新增 `root_python_dependency_alias_fds.py` 与 `test_root_python_dependency_alias_fds.py`，精确声明的目录/leaf 链接由 Linux `O_PATH | O_NOFOLLOW` 持有并从链接 FD 读取 link text，限定相对/绝对目标归一、owner/权限/inode、mount ID/namespace、预算与前后验证；对原 B2B1 旧 no-follow 行为作独立回归，合成借出 FD 可送已有 observer 但任何结果仍为 `BLOCKED`，绝不升级权限。无业务 owner、跨模块导入依赖边、SCC/baseline、Runtime 17、HTTP、schema/迁移、CI、依赖、权限/生产写入变化。本地 MCP-workspace 不执行 test/lint/build；真实 Guest、C2 restore、root-anchor/外部 pin/动态消费证据未执行。详见 [B2B2 §8](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)。仅获源码和合成测试授权，首次远端推送需另审。**C1/C2 OPEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-18 — R1 / B4B-3B-2B2-B 受控解析专项评审与 C2 Guest 就绪准备

**状态：MCP-WORKSPACE LOCAL DESIGN/READINESS / USER REVIEW PENDING / NO PR / NO GUEST OR ROOT EXECUTION。** 基于 `origin/dev@d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386` 独立分支 `docs/runtime-b2b2b-c2-readiness-20261018`，审阅 AGENTS/CI、R0/G2、B2B2-D/2B1、实际 manifest/alias/path-FD/observer/offline 实现；更新**原有** #2859 同批记录为 MERGED / SYNTHETIC CI GREEN，不重复开发纯声明模型。新增 [受控解析/C2 就绪评审与准确操作清单](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)：根锚/别名/loader/FD/独立 pins 与重复 inode、mount/竞态 fail-closed 语义，C2 只读取证、经新授权才可执行的快照恢复演练、矩阵及分批审批。未实施 B2B2-B 源码、未运行 Guest/快照/云操作或 MCP-workspace 测试；未改 Runtime 17 项、B2B1 no-follow、CI/依赖/Prisma、业务 owner 或依赖边/架构基线/生产状态；R0 D1–D5 不重开，C1/C2 和 C5-G2 仍 NO-GO，S2 daily 扩充继续暂停（现役 timer 不变）。首次远端交付另需用户审阅授权。

## 2026-10-18 — R1 / B4B-3B-2B2-A：有限纯内存 usrmerge 别名声明模型

**状态：MERGED / SYNTHETIC CI GREEN：PR #2859，final head `d366d62a906fe5060f1dbfe85b6e930bfbe77dab`，CI #7348 / run `39101080529` 成功（选中 `ci-change-scope`、`ops-checks`、`api-checks`、`build-test (api)`；Runtime 281 tests OK、Release 45 tests OK；其余按范围跳过），dev merge `d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`。** 已合并的设计评审 PR #2858、CI #7346、dev `c9db47b7` 是本批源代码基线；实施分支 `feat/c5-g2-b4b3b2b2a-inert-alias-contract-20261018`。新增 `ops/runtime/root_python_usrmerge_alias_claims.py` 和 `ops/runtime/tests/test_root_python_usrmerge_alias_claims.py`，仅使用调用方提出的 B4B-3A manifest/pins 和固定两类**合成** `/lib`、`/lib64` 前缀关系，在内存中严格拒绝额外/错误/冗余路径与超预算；所有模型输出仍是 `decision=BLOCKED`。不会验证真实 Ubuntu 布局、根锚、FD→路径、外部独立来源或 Python/ELF/dlopen 动态闭包，不允许接入现有 B2B1 严格 no-follow 开启器或执行候选代码。无业务 owner / 依赖图基线 / Runtime 17 / 新依赖 / CI / Prisma / 权限 / Guest/root/生产写入变化。MCP-workspace 未运行测试；#2859 的 GitHub Actions `ops-checks` 已有权威**合成**结果，并非全站 E2E、真实 Guest、路径/FD 来源或 C1/C2 通过；B2B2-B 实际可信别名证据链仍单独评审。详细见 [B2B2 评审/实施记录](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)。C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED。

## 2026-10-18 — R1 / B4B-3B-2B2-D：Ubuntu usrmerge 别名与可信根锚设计评审

**状态：LOCAL DESIGN REVIEW / USER REVIEW PENDING / NO PR / NO IMPLEMENTATION。** 以 `origin/dev@1a82caff` 和已合并 PR #2857 / CI #7344 为基线，审阅 B4B-3B-2B1 的严格 `O_NOFOLLOW` FD 开启、B4B-3A 固定 `/lib64` loader 路径与 Ubuntu usrmerge symlink 的不兼容处。对比保持严格 no-follow、另建经外部认证的有限 alias 策略、以及不安全的 `realpath`/任意 symlink 直开三种方案；推荐独立审核 B 方案，**未经用户专项批准不得放宽现有代码的 fail-closed 路径规则**。本批仅新增 [B4B-3B-2B2 评审](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 并按真实 PR/CI 更新 B2B1、R0、G2 和依赖图，不修改业务 owner、依赖图边、Runtime 17 文件 Bundle、接口/CI/依赖/Prisma、Guest/root/生产状态；未运行本地测试。C1/C2 和 C5-G2 NO-GO 未关闭；S2 DAILY CONFIG EXPANSION PAUSED，现役备份 timer 不变。

## 2026-10-18 — R1 / B4B-3B-2B1：受控路径 FD 候选开启

**状态：MERGED / SYNTHETIC CI GREEN：PR #2857，head `9ad184a350189d58b557419434d50efd062c3361`，CI #7344（run `39098295751`；选中检查均通过），dev merge `1a82caff22b49881aad2893ae1c9374c03c97ffb`。** 基于最新 `origin/dev@b309c1bb` 的独立分支 `feat/c5-g2-b4b3b2b1-fd-anchored-paths-20261018`。承接 PR #2855 已合并 `dev@2db85d32` 的 Python AST / ELF 静态线索，按照 R0 D1 最小增量新增 `root_python_dependency_path_fds.py` 与纯临时文件合成测试：由调用方传入不自证的 root-anchor FD，基于 B4B-3A 的候选白名单逐段只读、nofollow 开启，保留入口/FD/owner/device/inode/permissions 身份、预借出/结束后复核，供 B4B-3B-1 候选摘要读取。会严格拒绝真实 Ubuntu `/lib64` 等 usrmerge symlink（不能擅自放宽），不证明 `/` 根锚与外部来源，也不执行真实系统/Guest/root。未改旧组件公共合同、17 文件 Runtime Bundle、模块归属/架构基线、CI/依赖/数据库/生产状态。根据最新 CI 范围选择机制，Runtime 测试已在 PR #2857 的 `ops-checks` 运行并通过；MCP-workspace 本地未运行；此 CI 仅证明合成测试。见 [B4B-3B-2B1 文档](C5-G2-B4B3B2B1-受控路径FD候选开启.md)。下一步需独立评审真实 usrmerge 路径解析、可信锚点与离机来源、Python/ELF 动态闭包及 B4B-3C C2 真实恢复演练；**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-18 — CI：全部作业按变更范围启动（同批扩展）

**最高状态：REMOTE DELIVERY / [PR #2856](https://github.com/sanqin888/sanqinMVP/pull/2856) / CI+MERGE: SEE PR FINAL HEAD。** 交付分支 `ci/dependency-aware-check-scope-20261018` ，源码审阅基线 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。按用户补充要求，将本批 E2E-only 选择器原子替换为通用 CI 范围与汇总合同；Ops 安全/API 静态/Jest/Web/E2E/printer/Windows 与两镜像仅在有关时启动。保留 API Jest 对 Web 源码的真实架构依赖、Runtime/Release 相互导入、workspace manifests 对两端的影响；原检查名、汇总失败语义、main 完整验收、成对发布/证明不变。不新增依赖/Action/权限，不改业务代码、owner/依赖图/架构基线、schema/migration、17 文件 Bundle 或生产。已编写合成 Git/汇总边界测试，但未在本地或远端执行；用户已授权远端交付；交付基线为最新 `origin/dev@2db85d32541f05e7e3268e7f5a2013812d59690e`，CI/合并以 PR 最终 head Checks 与事件为权威。详见 [CI 范围合同](CI按变更范围执行.md) 与 [CI 工作包](postmod-ci-performance.md)。本条替换同批原 E2E-only 记录，不重复登记批次。

## 2026-10-17 — R1 / B4B-3B-2A 静态 Python / ELF 依赖线索（本地）

**最高状态：PR #2855 OPEN / FIRST CI #7338 FAILED (synthetic fixture overlap) / LOCAL FIX AUTHORED / RERUN PENDING**，本地分支 `feat/c5-g2-b4b3b2a-static-dependency-evidence-20261017` 基于 PR #2854 合并后的 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。B4B-3B-1 已合并：PR #2854，CI #7336 全绿，merge SHA `2bab5fe6`。本批新建独立外置 `ops/runtime/root_python_elf_static_hints.py` 和只用内存源代码/ELF64 人工字节的合成负向测试，提取 Python AST import、ELF PT_DYNAMIC / DT_NEEDED 有限静态依赖线索，记录相对/from/动态导入、ELF 搜索/loader/标签歧义。不是 FD→真实路径认证、完整运行时 import/ELF/dlopen 闭包或来源可信认证；永久拒绝生产 authority。未改 B4B-1/2/3A/3B-1、Runtime 17、业务模块 owner/dependency、CI/依赖/Prisma/部署。文档：[B4B-3B-2A](C5-G2-B4B3B2A-Python与ELF静态依赖线索.md)。首次 PR #2855 / CI #7338 的 `api-checks` 因合成 ELF fixture 中 PT_DYNAMIC（含 RUNPATH）覆盖 PT_INTERP 导致 1 个测试报错；本批在同一 PR 内将 fixture 的 PT_INTERP 调整至不重叠偏移，保留解析器严格拒绝畸形 PT_INTERP 的行为；修复后的 CI 仍需重新运行并全部成功，不预先宣称通过。MCP-workspace 未运行 lint/build/test。后续 3B-2B 真实开链/依赖发现及 3C C2 后实测，均须独立审阅。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-17 — R1 / B4B-3B-1：只读 FD 依赖证据及离机比对

**最高状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO PR。** 基于最新 `origin/dev@1bc1381c` 在 `feat/c5-g2-b4b3b1-readonly-dependency-evidence-20261017` 开展。Runtime 在 B4B-3A 有界声明清单外新增两个非授权外置模块（预打开只读 FD 摘要/metadata 收集、离机 manifest/pins/原始记录摘要一致性比对）及合成负向测试，实际 FD→路径独立真实性、外部 pin 保管链、Python/ELF/dlopen 传递依赖发现均保持未认证，不引入 Host/Guest/root 调用或生产入口。D1–D5 R0 冻结设计及原 B4B-1/B4B-2/B4B-3A 不改；17 文件 Runtime Bundle、CI、所有者/依赖边、schema/迁移/依赖锁与运行状态不变。本地工作区未运行 lint/build/test，待用户授权远端后通过 GitHub Actions 检验。详见 [B4B-3B-1 合同](C5-G2-B4B3B1-只读FD证据与离机比对.md)。下一步 B4B-3B-2 真实路径/独立来源与模块发现须单独审阅，B4B-3C 先满足 C2 并另授实际 Guest 命令。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-17 — Runtime R0：D1–D5 一次冻结与全仓文档对齐

**最高状态：D1–D5 APPROVED / R0 DESIGN FROZEN / DOCUMENTATION COMPLETE / REMOTE DELIVERY / PR #2853 / CI+MERGE: SEE PR FINAL HEAD；C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED。** 基线 `origin/dev@592c534896d18ca51082b708b8ab677402fabe4a`，分支 `docs/runtime-r0-design-freeze-20261017`。

按用户明确批准冻结 D1 有限独立平台与执行闭包、D2-A 有限维护窗口、D3 crypt/Drive create-only 真适配优先、D4 preinstall 先于 S2 扩充、D5 Abort & Clean Reinstall。新增 [R0 冻结设计](./Runtime更新-R0冻结设计.md)，统一 C1–C8、R0–R5、18 组验收与 I1–I6 中断点；同步 G2、Kit、S1、安装约束、状态/runbook、总队列/索引与依赖图。全仓 96 份 Markdown 纳入核对；旧实验/归档/原始证据保持其事实和原状态，仅在适用旧篇加当前入口。B4B-3A 更正为 PR #2848 / CI #7315 已通过，不提升实际采集或安装资格。

仅文档；无代码、17 文件 Bundle、依赖、owner/graph/baseline、CI、权限、云/VM、生产、Prisma/schema/migration 变更；不清除 PEM 等其他批次已有迁移要求。未运行本地 lint/build/test 或 Guest/root/Kit 实验。检查文档引用、字节/readback、历史保真及 diff/status；真实验收与 GitHub CI 不宣称通过。用户已审阅并明确授权本批远端交付，现通过 [PR #2853](https://github.com/sanqin888/sanqinMVP/pull/2853) 交付至 dev；CI/合并以该 PR 最终 head 的 Checks 与事件为权威，本文不预先声明 CI 通过。后续从 R1 继续，不重复请求批准 D1–D5。


本文件遵循仓库 `AGENTS.md` 第 19 节，按批次记录项目后续开发、维护和验收。文件超过 1,000,000 UTF-8 字节前，应续写同目录的 `worklog2.md`，依次递增；旧的 `modularization-worklog*.md` 仍保留为历史资料。

## 2026-10-17 — PEM：付款异常通用案件、STAFF 申请和 ADMIN 审批

**最高状态：MCP-workspace LOCAL SOURCE + TESTS AUTHORED / NOT RUN / MIGRATION REQUIRED / NO PR。** 基线 origin/dev@9621e6af，分支 feat/pem-payment-exception-cases-approval-recovery-20261017。Payments 新增 Case/Evidence/Approval/Execution 与窄公共能力；编排复用既有原付款、Checkout/Benefits RELEASE、Terminal Fence 机制；POS Sandbox 操作员免角色审批但保留隔离环境与完整资金/设备安全检查，Production STAFF 申请、ADMIN+MFA 审批，仅已证实最终失败的资金可受控释放，未决只能调查。AGENTS 第14节经用户专项授权扩展隔离 Sandbox ALL_ATTEMPTS_FAILED 的 PEM 例外，旧 504/NOT_FOUND flag 逻辑保留，避免误将人工未收款记为 Clover 取消。四张 Prisma additive-only 模型需用户本地生成迁移；无依赖/CI/生产 Web Ecommerce 改动，不变更直接跨上下文导入规则或架构基线；差异/CI scanner 待审。详细：docs/payments/支付异常管理-PEM.md；本地未提交/推远端，未进行任何 Sandbox 数据/设备写操作。

## 2026-10-17 — C5-G2 / B02-B4B-3A：Python 依赖闭包清单第一批

**状态：MERGED / SYNTHETIC CI GREEN；PR #2848，merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`，CI #7315。** 分支 `feat/c5-g2-b4b3a-dependency-closure-manifest-20261017`（基于任务开始时最新 `origin/dev@1cd89d9e`）。新增独立 `ops/runtime/root_python_dependency_manifest.py`：纯内存结构审查含 stdlib .py、package、CPython native extension、ELF loader、shared libraries、builtin/frozen 和 Linux vDSO 的**声明式**哈希与依赖图；异常缺失与不匹配 fail-closed，声称的清单结构闭合仍永久拒绝认证和生产安装。配套合成测试 `ops/runtime/tests/test_root_python_dependency_manifest.py`；不改 B4B-1/B4B-2、17 文件 Runtime Bundle、现有业务所有者/依赖边/架构基线、CI、依赖锁文件、数据库迁移和生产状态。真正 Guest 哈希清单、完整传递导入/ELF 依赖动态可信采集和独立见证仍为 B4B-3B/C 的单独门禁。详见 [B4B-3A 清单合同](./C5-G2-B4B3A-Python依赖闭包清单.md) 及 [C5-G2 可信 Runtime 契约](./c5-g2-trusted-runtime-contract-2026-10-13.md)。最高状态 MERGED / SYNTHETIC CI GREEN，`C5-G2 NO-GO` / `S2 PAUSED`。


**R0 进度校正：**该批已通过 PR #2848 合并，final head `d4d5513f5dc734e0f9b9321e99e49582073cd263`，CI #7315 / run `39077195858` 成功。没有执行本地 lint/build/test；仅合成声明图，不代表真实文件/依赖采集、Guest/root 或生产验收。后续 B4B-3B/3C 进入 R0 队列 R1。

## 2026-10-17 — 文档清理第一批：过期入口与引用收口

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2849](https://github.com/sanqin888/sanqinMVP/pull/2849) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 交付分支 `docs/cleanup-obsolete-entrypoints-batch1-delivery-20261017`，已对齐 `origin/dev@dda7698e`；原本地审阅基线为 `1cd89d9e`。第一批移除 Web 通用模板、旧 Uber state 迁移建议及已被替代的 GHCR Batch B/C2/C4-A 文档；在中文文档索引中保留现行 schema/历史 migration/Phase 8 的证据去向，在新的 GHCR 状态入口承接既有发布、迁移、备份、PENDING/回退和 Runtime 安装门禁；同步更新根 README、C0 历史说明和 R5 runbook 引用。属于文档内部原子清理：业务代码、所有权、公共/持久化合同、依赖图/架构基线、CI、Prisma schema/migration、生产主机及历史日志均无变更。另一个 Runtime 任务经 PR #2848 合入后，在最新 origin/dev 上准备独立交付，仅追加本条日志，保留其原记录；本批不包含该任务的源码/测试。后续交付状态更新本条记录。详见 [项目文档索引](../文档索引.md) 和 [GHCR 发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)。

## 2026-10-17 — 文档清理第二批：Runtime 旧方案整合

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2850](https://github.com/sanqin888/sanqinMVP/pull/2850) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 分支 `docs/runtime-history-consolidation-batch2-20261017`，基线 `origin/dev@94bc7be6`。逐篇承接并删除 27 份旧 GHCR/Runtime 方案，新增中文 [交付与安装约束](./Runtime交付与安装约束.md) 与 [历史决策/证据索引](./Runtime历史决策与证据索引.md)；保留 exact Bundle、发布/历史来源、staging、动态状态、备份/消费者、维护屏障和新独立重装约束，并索引原文/blob身份、U2C/2B2-B有限范围PASS、SIGKILL边界与退役冷断电NOT EXECUTED/归档哈希。同步 GHCR 状态入口、R5、项目索引、G2/Recovery Kit/S1 导航，不重写历史日志或原始JSON，不修改代码/测试、17项Bundle、owner/依赖图/架构基线、权限/CI、Prisma/schema/migration、生产主机和VM/离机资产。G2 NO-GO、S2扩充接线暂停及各阶段授权门禁保持原意；本批不构成新实验或生产验收。后续CI/交付更新本条，不重复登记批次。

## 2026-10-17 — 文档清理第三批：已完结工作包全文归档

**状态：本地文档改动已审阅并获远端交付授权，现通过 [PR #2851](https://github.com/sanqin888/sanqinMVP/pull/2851) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 分支 `docs/archive-completed-work-batch3-20261017`，基线 `origin/dev@b3179ff4`（第二批 PR #2850 已合并，最终 PR CI #7321 七项成功）。将 17 份已完结记录迁入 `docs/archive/`，保留全部原文字节/Git blob 身份及旧路径映射；新增 [归档索引](../archive/README.md)、[长期约束](./已完结工作长期约束.md) 和 [浏览器 E2E 说明](../../apps/web/e2e/README.md)，将 A4 真实运行观察承接到现行工作站手册。同步项目入口、Backlog/Roadmap、依赖图中的文档引用与兼容登记证据路径；只有定位改变，compat_id/状态/owner/退出条件、依赖边/计数/架构基线均不变。Phase 7 保持源码/架构关闭的限定范围，Phase 9/Payroll/provider 及设备的递延证据仍显式保留，不宣称重新完成生产验证。历史 modularization 日志、原始 JSON 收据、Phase 6/8、Payroll、现役 Runtime、代码/测试、schema/migration、依赖/CI 和生产/VM/离机资产不变。详见归档索引；后续交付状态更新本条，不重复登记批次。
