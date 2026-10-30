# Runtime 更新：AWS 整机快照与维护冻结方案

## 首次安装：同代次失败任务的原ID收尾（本地待审）

**INSTALL_FAILED_TASK_CONTAINMENT_LOCAL / CI_PENDING / INSTALL_TASK_DISPATCH_OPEN / NOT_INSTALLED。**

基于PR #3065合并dev `2e6e4eb9e30d691c39c49794626a52a51da1e3aa` 创建 `feat/runtime-install-failed-task-containment-20261030`。在既有bootstrap新增私有失败收尾函数，只接准确sourceSha/retentionId；持原两锁、五源码FD及完整来源上下文，新鲜核本次cleanup PID/cgroup/argv/InvocationID，再核唯一安装事务、原intent/writers与准确关联记录。只认同一运行代次的耐久双摘要，不扫描“最新”记录，也不把它替代普通owned流程的内存证明。

退出环境按[systemd官方语义](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)限定分类：已知非零退出/信号/超时等失败，以及success结果中的HUP/INT/TERM/PIPE信号终止可进入后续校验；success/exited/0、缺失、非规范或未知状态拒绝，均不是安装完成或跳过收尾许可。官方源码已核，实际隔离VM的systemd版本/行为仍待D4。本函数尚不能无条件挂入ExecStopPost，正常成功交接仍须后续任务入口实现。

通过本次失败身份和原件链后，按原三业务ID依次disable-restart、逆序stop；每项前后复核来源、manager、原路径/锁指纹、材料/记录、维护原件及300秒总预算。只读inspect准确原三ID，核原生状态和规范JSON策略，才能返回“本次观察已停止且禁重启”；命令回复丢失时继续其余准确动作各一次，但整体仍阻断，不重放、恢复策略、start、清/补marker、改gate或操作DB。源/manager/原件中途变化会阻断剩余动作，不宣称整体停写已保证。

已知辅助顶层对象允许保留部分输出，只核私有类型/指纹而不把内容当收尾或完成许可；未知名字/第二事务、错代次/原件/维护标记拒绝。原marker已不存在时可处理同代次明确失败，但不补造标记；部分completion也不变成成功凭证。无任何新持久记录、第二应用state或自动恢复入口。

新增17项测试定义，复用真实私有材料/原件、五源码FD和原两锁，模型化manager与Docker命令，覆盖准确顺序/原ID/DB与文件不变、失败分类/干净退出拒绝、错代次/缺关联/未知记录/第二事务、辅助残件、回复未知各一次、实际状态与原生策略校验、同字节替换/源码/manager变化、无marker晚到失败及外来marker保留。源码/测试Python3.10 AST、符号表及静态差异审阅完成；MCP-workspace未运行lint/build/test，17项测试待CI，本批尚未提交/推送。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。当前仍无公开安装CLI、专用unit提交/run/cleanup调度和正常成功交接，真实SIGKILL/断连/主机故障、快照/离机通道及D4未验收，G3仍OPEN。下一步接专用任务入口及成功/失败分支；生产/AWS/DB未操作。完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：受监督bootstrap源码FD贯穿安装（源码已合并）

**INSTALL_SUPERVISED_BOOTSTRAP_FDS_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3064合并dev `fa349da2740af9452449faab325e8f71e274b8ae` 创建 `feat/runtime-install-bound-source-fds-20261030`。受监督观察在原两锁内核准确保留材料后、现场观察与intent写入之前，进入既有五文件bootstrap来源上下文；持有原目录/文件FD直到观察退出，核私有权限、库存、原字节/身份与准确发布源码。普通分支不打开该上下文。

将本次活来源检查闭包传入owned调用；源码绑定与callable检查必须成对出现。首次manager前后、持续task_check/recheck/check_owned及返回/上下文正常退出复核源码，拒绝同字节替换、权限或内容变化，不重新绑定新原件。沿用原件关联和事故保留，不新增磁盘许可、应用state或恢复重试。

新增12项测试定义：真实临时五文件/FD、原两锁与已有现场模型，覆盖FD生命周期、初始坏源码、writers后同字节替换、gate后权限变化、关联后漂移、普通分支隔离、缺失检查拒绝；另覆盖受监督完整安装模型的关联/惰性完成审计、首个工具写入前、应用启动后及清marker后的源码变化。同步原10项受监督writers夹具以提供真实惰性源码文件。解释器/导入元数据与manager、Docker/systemd/HTTP仍为模型；快照/离机同伴仅既有测试夹具，不能代替真实通道与D4验收。

完整源码FD复核发生在Python导入之后，仍必须先由独立操作者审阅并配置bootstrap；这不是暂停中的受保护加载器研究。当前仍无公开安装CLI、专用unit提交/run/cleanup或独立收尾；最后清marker后错误不伪造标记/完成回执，既有按原ID尽力收尾不等于SIGKILL/主机故障停写保证，G3仍OPEN。

源码/测试Python3.10 AST、符号表及静态差异审阅完成；MCP-workspace未运行lint/build/test，本批[PR #3065](https://github.com/sanqin888/sanqinMVP/pull/3065) head `a244e6218b951757a7305087a073d0a9d4a08ce2` 经[CI #7826](https://github.com/sanqin888/sanqinMVP/actions/runs/41109645658)SUCCESS（4成功/6范围跳过；两条Release各1491、Runtime1080、既有C1回归412），已合并dev `2e6e4eb9e30d691c39c49794626a52a51da1e3aa`，无CI修复。已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步仍为安装专用提交/run/cleanup与真实快照/离机通道和成功/失败交接；生产/AWS/DB未操作。完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：受监督writers阶段与登记时序（源码已合并）

**INSTALL_SUPERVISED_WRITER_HANDOFF_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3063合并dev `06170a4af56ae2f0cd8b1c3dbbb97ce18b8aecec` 创建 `feat/runtime-install-supervised-writers-20261030`。将私有可选_task_source_sha从完整现场观察传到owned安装调用，要求已有完整writers观察且准确匹配保留材料/现场源码。首次manager核验在intent/marker/gate写入之前；空观测、错源码或非run角色提前拒绝。recheck、check_owned及末尾返回持续核同一manager运行代次，拒绝中途换代，不收养新任务。

受监督分支在原writers已耐久保存并核对后、freeze回调之前调用受控关联登记；其原件清单及退出校验继续钉准确字节/身份。新增taskHandoff摘要输出，canExecute/installationComplete/restoreProven保持false。新增私有_save_supervised_installation_writers仅走到保存证据阶段，不冻结、不安装工具；完整安装私有包装器可显式传task_source_sha，未传时原分支不查manager、不创建关联文件。

目前没有公开安装CLI、专用unit提交、run/cleanup或自动恢复。manager校验含既有bootstrap固定路径/解释器前置，但完整源码FD持有仍须后续受限任务入口负责；本次不能把路径、CI模型或已有completion审计当安装许可。新增完整包装器参数的测试只核传递，不能代替全流程快照/通道或真实systemd实测；SIGKILL、主机故障及最后清marker未知仍未验收，G3保持OPEN。

新增10项测试定义，以已有现场模型、真实私有文件与原两锁，模拟manager核保存原件后登记、freeze之前时序、连续代次、manager初始失败/空观测、错源码、同步未知保留、原分支隔离及完整包装器参数。新增源码/测试Python3.10 AST、符号表与静态差异审阅完成；MCP-workspace不运行lint/build/test，本批[PR #3064](https://github.com/sanqin888/sanqinMVP/pull/3064) head `58fad5fb8c1279221ce0aa0647a926e532225bb1` 经[CI #7824](https://github.com/sanqin888/sanqinMVP/actions/runs/41097966917)SUCCESS（4成功/6范围跳过；两条Release各1479、Runtime1080、既有C1回归412），已合并dev `fa349da2740af9452449faab325e8f71e274b8ae`，无CI修复。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步完成受限bootstrap FD持有/专用提交与run/cleanup、快照双帧/离机通道和成功/失败交接，再做真实D4。生产/AWS/DB未操作，完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：关联记录受控登记与清单校验（源码已合并）

**INSTALL_OWNED_TASK_HANDOFF_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3062合并dev `4c9c6bdec0e2dfc299879fa3292e9bb6a5ddb023` 创建 `feat/runtime-install-owned-task-handoff-20261030`。在既有bootstrap补受控关联记录登记：要求本次owned_records已有准确writers且无旧关联，调用方检查先通过，再核准确intent/writers原件，完成create-only IO与读回后才登记独立context副本、原字节及完整文件指纹，最后再次调用owned检查。失败保留已写文件与实际登记状态，不删除、重试或恢复营业。

将task-originals.json接入owned记录白名单、_installation_owned_run、check_owned和命名空间退出校验。仅本次内存登记证明存在时接受该成员；每次核原intent/writers关联、记录字节及完整文件指纹，拒绝同字节替换、变化的运行代次、坏证明和未知残件。没有登记的正确文件也不能被收养；这不新增第二应用state或磁盘resume许可。

受控登记本身不取得全局锁，也不刷新manager/来源；必须由上层准确原锁和受控check_owned闭包负责。新增测试使用真实临时文件及调用方持有的两个OS锁核检查时机，不代表实际VM全局锁/manager已验收。普通安装尚未调用登记生产者，仍不创建该关联文件；下一步须将它接原writers耐久之后、freeze之前，并补manager/来源新鲜检查及安装专用提交/run/cleanup。当前没有公开apply或独立收尾入口，G3仍OPEN。

新增8项测试定义，覆盖调用方锁与登记、无登记文件拒绝、旧登记/错writers拒绝、同字节替换、内存context/证明变化、同步未知保留未登记文件、末尾context失败保留登记及namespace退出。新增源码/测试Python3.10 AST、符号表与静态差异核对完成，MCP-workspace不运行lint/build/test，本批[PR #3063](https://github.com/sanqin888/sanqinMVP/pull/3063) head `cfe4d7d91e9329fed0716879fbd90aba26098e7d` 经[CI #7822](https://github.com/sanqin888/sanqinMVP/actions/runs/41092595964)SUCCESS（4成功/6范围跳过；两条Release各1469、Runtime1080、既有C1回归412），已合并dev `06170a4af56ae2f0cd8b1c3dbbb97ce18b8aecec`，无CI修复。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。真实D4、生产/AWS/DB操作未执行；完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：任务关联记录受限读写（源码已合并）

**INSTALL_TASK_HANDOFF_IO_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3061合并dev `125a9c0a209a3c8d00ea94d7c8df58fbd5b3188c` 创建 `feat/runtime-install-task-handoff-io-20261030`。在既有bootstrap新增固定task-originals.json的私有create-only写/读回原语，复用原run上下文与intent/writers准确关联模型；读回仍要求原run上下文，不是cleanup进程可直接使用的事故收尾API。

只接收调用者已持有的目录FD，不接受文件名或路径参数。目录root:root 0700、文件0600普通单链接，大小≤16KiB；创建前核root与空间余量，以EXCL/NOFOLLOW新建，处理短写、文件fsync、目录fsync及规范字节/完整FD/路径身份读回，末尾再核原FD、路径与目录。未知写入/同步/替换或残件均原样保留，不覆盖、截断、unlink或自动重试。结果只有摘要/指纹与installationComplete/canExecute/restoreProven=false。

这是私有IO原语，尚未接入原安装调用链、owned_records或命名空间库存；既有安装流程仍不创建此文件。原语本身不取得原两锁、不验证目录FD来自准确安装namespace、不刷新manager或验证来源/原件耐久性，这些必须由后续owned接线保证。不能凭一次读回或现存文件收养任务、执行安装/清理、跳过失败收尾或宣布冻结；未提交unit、未开放安装apply，G3仍OPEN。

新增8项测试定义，仅在真实临时目录、模型root身份和空间下验证字节/权限/双fsync、重复创建、权限/链接/部分记录、短写/零写、文件/目录同步失败及读回后同字节替换。新增源码/测试Python3.10 AST、符号表和静态差异审阅完成；MCP-workspace不运行lint/build/test，本批[PR #3062](https://github.com/sanqin888/sanqinMVP/pull/3062) head `b7f597773aa57e2cdf5b5fe42f04160e4e1bc844` 经[CI #7820](https://github.com/sanqin888/sanqinMVP/actions/runs/41086363103)SUCCESS（4成功/6范围跳过；两条Release各1461、Runtime1080、既有C1回归412），已合并dev `4c9c6bdec0e2dfc299879fa3292e9bb6a5ddb023`，无CI修复。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步在原writers耐久后、freeze前接入准确manager代次/原件持久关联、owned清单和原锁，再完成安装提交/run/cleanup及快照/离机通道。真实D4与生产/AWS/DB操作未执行；完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：任务与原件关联模型（源码已合并）

**INSTALL_TASK_ORIGINALS_MODEL_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3060合并dev `f98e4f293f4f64e8e87df360f9f401eb0bbae9d6` 创建 `feat/runtime-install-task-originals-20261030`，在既有bootstrap增加任务与原件关联的惰性字节模型及准确核对。严格核本次run观察字段/native bool、sourceSha、retentionId、固定unit和非零InvocationID；复用原intent/writers解析与摘要绑定，拒绝另一材料、源码、安装ID、运行代次或改动原件。

规范JSON关联包含schemaVersion=1、独立kind、源码/材料/安装/unit/运行代次、intent/writers两摘要，installationComplete/canExecute/restoreProven始终false。核对只接受本次上下文和两原件重新计算出的准确字节，拒绝重复/额外字段、非规范编码或成功声明。它不证明上下文新鲜、来源可信、原件已经耐久存在或磁盘归属；不提供任何执行许可。

当前只有内存模型，未新增持久文件/安装schema写入、未接安装回调、未提交unit、不扫描/收养事故记录，也不执行Docker/systemd/SQL或清marker。未来必须在完整来源FD上下文、准确manager新鲜核对及原两锁内，接线原件耐久交接与独立收尾；本模型不能独立作为SIGKILL安全、成功后跳过收尾或resume依据，G3仍OPEN。

新增8项测试定义，复用惰性原容器事实夹具，核准确双摘要、严格上下文、错源码/材料/unit/运行代次、intent/writers变化、非规范/重复字段/伪造成功及输入预算。新增源码/测试Python3.10 AST、符号表与静态差异核对完成；MCP-workspace不运行lint/build/test，本批[PR #3061](https://github.com/sanqin888/sanqinMVP/pull/3061) head `37cfca62f7ea00e4f508e984730b8409027d43bb` 经[CI #7818](https://github.com/sanqin888/sanqinMVP/actions/runs/41079971358)SUCCESS（4成功/6范围跳过；两条Release各1453、Runtime1080、既有C1回归412），已合并dev `125a9c0a209a3c8d00ea94d7c8df58fbd5b3188c`，无CI修复。

已审阅owner/依赖图，基线无变化；17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。真实D4、生产/AWS/DB操作均未执行；完整VM/数据库恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。下一步仍须交付安装提交/run/cleanup、耐久原件关联及快照/离机通道。

## 首次安装：安装任务manager身份校验（源码已合并）

**INSTALL_TASK_MANAGER_CONTEXT_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3059合并dev `e85fb8298e07f9ef0cbbfa0e99848cd242af1a4d` 创建 `feat/runtime-install-manager-context-20261030`，继续G3安装监督的只读身份边界。在既有bootstrap增加准确retention-id固定unit名、系统Python/准确bootstrap的run与cleanup参数模型，以及有界systemctl show查询；两个内部角色尚未加入CLI，不提交unit、不开放安装apply，也不读取磁盘writers后执行停容器。

先复核既有bootstrap固定路径/解释器调用前置；完整发布源码FD验真仍须由未来上层持有，本观察函数不重新验证kit/main。校验本次manager的InvocationID并与进程环境交叉核对，要求正确主进程/stop-post控制PID、实际/proc/self/cgroup与cmdline、当前目录、精确ExecStart/ExecStopPost单条命令、root用户/组、transient/oneshot/Restart=no/RemainAfterExit=yes和固定fragment；拒绝额外ExecCondition/启动或停止动作、drop-in、环境/根目录覆盖、自定义成功退出码、未知/重复/缺失属性、错误代次与≤30秒预算耗尽。只增加准确安装unit的show读权限，不扩大普通systemd调用或添加任意命令入口。

结果仅managerContextObserved=true，installationComplete/canExecute仍false；它不是持久安装授权、冻结证明、磁盘原件收养许可或成功后跳过收尾的依据。原材料ID先于随机installationId存在；两者及原intent/writers的耐久摘要关联尚未接线，不能凭unit名反查“最新”记录。未来执行流程仍须持完整bootstrap来源上下文和原两锁，在具体边界新鲜复核manager，不能把一次只读结果长期复用。

新增14项测试定义，模拟manager输出/进程元数据而不启动systemd，覆盖主进程/stop-post、准确命令和只读show白名单、每个固定属性、代次/PID/cgroup/实际argv/目录、额外或忽略失败命令、来源先拒绝、截止与有界proc读取；两个内部角色仍被公开CLI拒绝。新增源码/测试Python3.10 AST、符号表、重复测试/空白与读回静态审阅完成，MCP-workspace不运行lint/build/test，本批[PR #3060](https://github.com/sanqin888/sanqinMVP/pull/3060) head `f8ba5d39538ea32d6ff289e4020dbafa49bc2cd6` 经[CI #7816](https://github.com/sanqin888/sanqinMVP/actions/runs/41075422332)SUCCESS（4成功/6范围跳过；两条Release各1445、Runtime1080、既有C1回归412），已合并dev `f98e4f293f4f64e8e87df360f9f401eb0bbae9d6`，无CI修复。

已审阅owner/依赖图，基线无变化；无新helper/unit/持久schema/依赖/业务迁移或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步仍须接安装专用提交/run/cleanup、准确原件与invocation绑定、快照双帧/离机通道和成功/失败交接判别；真实D4与生产未执行。完整VM/DB恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：固定bootstrap来源与材料保留入口（源码已合并）

**INSTALL_BOOTSTRAP_MATERIAL_ENTRY_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3058合并dev `8f0b6f11a8b61b0f83a4888764e15b2da5642998` 创建 `feat/runtime-install-bootstrap-binding-20261030`。在既有bootstrap增加有限`retain`材料入口，调用已有两锁/create-only材料保留；只保存验证后的kit/旧归档与原记录，不写Runtime、门禁或安装marker，不运行Docker/systemd/SQL，不开放安装apply或收养旧进度。

要求操作者在Python启动前独立审阅、准备固定`/opt/sanq/install-bootstrap/<准确source-sha>/`，仅包含bootstrap、release_contract、build_bundle、versioned_release_contract、runtime_trust五文件，目录root:root 0700、文件0600单链接；安装bootstrap父目录仅当前准确SHA，不自动创建/修权/清旧版本。固定系统/usr/bin/python3 CPython3.10+、Linux/root、-I -S -B及五模块准确来源；持有原目录/文件FD，结合完整Git/main发布材料逐字节核对，材料保留前后重核路径/FD/库存/完整指纹，拒绝额外文件、链接、同字节替换和晚变。已验证kit仅作数据，绝不从中提取或导入Python。

这是独立审阅启动后的有限调用边界检查，不能使尚未受信的Python启动过程自证安全，不是暂停C1受保护loader/自建CPython证明，也不防恶意root或验证进程内存遭修改。启动前人工来源/权限审阅仍必要。失败只保留已落盘材料，不清理、重试或标安装成功；MATERIALS_RETAINED及所有原false权限字段保持，G3的安装transient/独立收尾/快照与离机通道仍OPEN，G1/G2/G4及20项真实验收未完成。

新增15项测试定义，以真实临时文件、原OS锁和耐久读回覆盖成功材料保留、系统调用前置/五来源、每文件准确字节、main失败、目录库存/权限/链接/FIFO、持有期间文件/目录/anchor替换、晚变保留证据和公开CLI分发/拒绝apply。测试只模型化root身份、解释器flags/模块路径与固定anchor，夹具源码为惰性数据不执行；没有真实root安装、SSH或AWS。已完成Python3.10 AST/符号表、重复测试/空白及静态差异核对；MCP-workspace不运行lint/build/test，15项已提交[PR #3059](https://github.com/sanqin888/sanqinMVP/pull/3059)。初始head 7609b889 的[CI #7813](https://github.com/sanqin888/sanqinMVP/actions/runs/41068929792)默认Release运行1431项，发现1失败/1错误，不能记为通过：新增重放测试错误期待ReleaseContractError，实际create-only正确抛FileExistsError；新增CLI测试的GitHub模拟未接受token关键字。仅修测试为准确异常、重放零写/原件不变断言及接收token的模拟，生产实现不变；已推同PR重跑，修复后最终head `40a12ecc413735bca57c8fde613a82ca9d5f6dee` 已经[CI #7814](https://github.com/sanqin888/sanqinMVP/actions/runs/41070377603)SUCCESS（4成功/6范围跳过；两条Release各1431、Runtime1080、既有C1回归412），由[PR #3059](https://github.com/sanqin888/sanqinMVP/pull/3059)合并dev `e85fb8298e07f9ef0cbbfa0e99848cd242af1a4d`。

owner/依赖图已审阅，基线无变化；无新helper/unit/持久schema/依赖/业务迁移或第二应用state，17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持。下一步在同一G3范围接安装监督、原ID独立失败收尾和快照通道，不能把材料入口当安装完成。完整VM/数据库恢复实演继续交付后；更新前手动快照/内容核验、恢复材料及离机确认保留，生产未部署，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## D4执行前审计与固定隔离验收方案（文档已合并）

**D4_PLAN_MERGED_DEV / VM_NOT_BOUND / INSTALL_ADAPTER_OPEN / NOT_EXECUTED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

基于[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292` 创建 `docs/runtime-minimal-d4-readiness-20261030`，继续第三批内部D4执行前审计。新增[统一隔离验收方案](../runbooks/Runtime最小执行器D4隔离验收方案.md)，固定目标/准确来源、安装/发布/回退/中断的20个case、证据字段、停止条件及第四批生产材料；全部case仍NOT_RUN，源码CI不能替代现场结果。

核出四项实际前置：本次尚未绑定新的隔离VM；D1仍要求准确main发布来源，dev/PR CI不能冒充；首次安装的材料保留/完整安装/快照双帧与离机确认仍为私有调用链，该方案审阅时公开CLI仅pack/verify/plan（本地retain入口进度见最新节），尚无安装专用transient/独立失败收尾；六就绪端点含固定sanq.ca，隔离环境须证明实际路由，不能拿生产200补验收。普通发布release_task已有受控transient不代表初始bootstrap监督已接线，Python异常收束不能证明SIGKILL安全。

只读GitHub观察记录main@d3a896f32f1db71e49433f9e87bef534e27589bb与PR初始head6b8d1e77的发散元信息，不用compare文件清单作来源/完整性证明，实际晋级与材料准备前仍需重核。新VM应使用隔离凭据/数据与受审阅网络，不切生产DNS/业务，不假定AWS旧Blueprint可选、不自动创建计费资源。本批不合main、发布镜像或执行root/systemd/AWS/SQL操作。

方案明确下一步先交付既有bootstrap内有限的受控入口、manager关联、准确原ID独立收尾及快照实际通道适配，配合目标/材料/路由只读核查，再做真实写入验收。不新建常驻控制器、通用root launcher、CA/CAS或另一应用state；可复用现有私有函数作经审阅的一次性适配，不要求另造通用公开安装API；不以临时python -c/nohup绕过来源/目标、监督与通道检查。最后清marker后的未知状态仍按实际存在/不存在记录，不伪造围栏/冻结或成功回执。

本批仅文档与既有进度同步，无代码/CLI/schema/unit/依赖/测试变化，未运行项目测试或实际D4场景；完成差异、相对链接/固定case/源函数及边界静态审阅。D4方案已由[PR #3058](https://github.com/sanqin888/sanqinMVP/pull/3058) head `686a70f8ec2c2598ad6cd73189fb195b2e0d4a72` 经[CI #7811](https://github.com/sanqin888/sanqinMVP/actions/runs/41066304814)SUCCESS（文档范围：1成功/9跳过，未重跑Release/Runtime测试）合并dev `8f0b6f11a8b61b0f83a4888764e15b2da5642998`。owner/依赖图基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持。完整VM/数据库恢复实演继续交付后，更新前手动快照/内容核验、恢复材料/离机确认仍保留，生产未部署，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## D3 Mac固定目标薄入口（源码已合并）

**D3_MAC_ENTRY_MERGED_DEV / SOURCE_CI_VERIFIED / MAC_ACCEPTANCE_OPEN / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)最终head `6b8d1e77cfef23228160021b37779e4eed2a3c48` 经[CI #7809](https://github.com/sanqin888/sanqinMVP/actions/runs/41054754179)SUCCESS（4成功/6范围跳过；两条Release各1416、Runtime1080、既有C1回归412），已合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292`，无需CI修复；无生产/AWS操作。

基于PR #3056合并dev `f957b3867b7a228eb336c310b2b4bcc586952110` 创建 `feat/runtime-minimal-mac-entry-20261030`。新增本地sanq-deploy.sh＋相邻sanq_deploy.py，复用VM现有collect_deployment_plan/release_task，不增加第二控制器/应用state，也不加入九VM helper、27项安装集合或17+Manifest。脚本经/bin/sh调用，固定系统/usr/bin/python3（CPython3.9+）及-I/-S/-B隔离，客户端只用标准库，仅普通Mac账户可发请求；--help可离线读取。无依赖包/VM权限变更或新sudoers。

固定读取账户数据库home下.sanq-deploy/：本人0700真实目录，只能有target、known_hosts、identity三个本人0400/0600普通单链接文件。target为单行小写DNS/规范IPv4，known_hosts只接受sanq-runtime别名的一份Ed25519公钥；身份私钥只核元数据，由SSH读取。主机key必须由操作者先独立核指纹，客户端不扫描/接受/更新key，也不自动创建、修权限或清理文件；真实生产key与Mac配置未核实，不填造值。原FD/路径与完整指纹在连接前后重核，拒绝同字节替换/额外成员；不从HOME环境、当前目录或命令参数选目标。

仅允许plan/show-plan/show-sql/apply/status/logs及独立回退审阅/查询/提交固定操作。SHA/plan-id/SQL与兼容摘要均严格hex，拒绝缩写/重复选项、任意host/user/port/key/path/命令及VM内部run/cleanup。apply必须--confirm-release，有SQL时仍由VM要求该计划准确SQL摘要；rollback须独立--confirm-rollback及准确compatibility摘要。固定远端cd到/opt/sanq/runtime，再非交互sudo执行固定Python及两个既有helper之一；只有固定词元和验证后的hex进入远端shell，不重新选latest、不运行反向SQL。

固定/usr/bin/ssh、ubuntu:22、空配置、严格单alias/Ed25519主机验证；禁默认known_hosts、密钥更新、代理、转发、PTY、复用与本地命令。最小环境不传shell/Python/DYLD/askpass注入，仅可保留本人真实agent socket且不转发。单次连接、无stdin/新进程组，stdout4MiB/stderr64KiB，完整收集并核UTF-8/控制字符与本地原件后才开始输出；普通show/logs60秒、计划与任务/状态900秒，超限/未知不自动重连或重提。捕获本地信号并还原处理，异常只尽力结束本地SSH，不发远端stop/cleanup/恢复。SSH255、超时或客户端中断不能推断VM任务停止；重连查询原plan-id；若计划响应中断尚未收到ID，先在VM只读核查留存计划，不猜latest或自动重试。

TASK_QUEUED、SSH退出0、READY或unit success均不由客户端升级成ACTIVE/安装成功；唯一业务状态和实际结果仍由VM核验。客户端不保存发布成功旗标，回退查询使用status-rollback；计划准备是同步审阅，已提交发布仍由既有transient service脱离SSH运行。操作合同、本地三文件与待验收项见[Mac入口说明](../runbooks/Runtime最小执行器Mac入口.md)；runbook内部另提供官方OpenSSH手册来源，不把当前手册语义当目标Mac实测。

新增26项测试定义，覆盖固定命令/独立确认/摘要与注入/缩写/重复拒绝；真实本地文件、权限/链接/FIFO/同字节替换、主机key、私钥不读及最小环境/agent；仅用本地管道子进程模拟SSH输出/UTF-8/255/超时/漂移，不连接SSH/生产；另核本地profile、提交不冒充ACTIVE、信号恢复、非Mac/root拒绝及带空格路径/恶意搜索路径与同目录stdlib阴影模块下的shell入口。Python3.9源码与3.10测试AST、嵌套符号、重复测试/空白及读回静态核对完成；MCP-workspace未运行lint/build/test，上述26项已随最终head两条Release各1416项通过CI，真实Mac仍未验收。

下一步先CI验证Mac批，再进行D4统一隔离安装、真实Mac往返、正常发布及失败冻结验收。生产未部署，完整恢复演练按用户决定继续交付后；更新前手动快照/内容核验、恢复材料及离机确认保留，不伪改restoreProven。owner/依赖图已审阅、基线无变化；无业务schema/迁移，17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## D2 耐久完成审计与最后维护交接（源码已合并）

**D2_INSTALLATION_COMPLETION_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3056](https://github.com/sanqin888/sanqinMVP/pull/3056)最终head `863348bd91df7b6e7178c199681e74495fe1f5db` 经[CI #7807](https://github.com/sanqin888/sanqinMVP/actions/runs/41043711822)SUCCESS（4成功/6范围跳过；两条Release各1390、Runtime1080、既有C1回归412），已合并dev `f957b3867b7a228eb336c310b2b4bcc586952110`；仅修复下述重放测试peer夹具，无生产/AWS操作。

基于PR #3055合并dev `022b4590bde7fe27a3c28a05a232ecd042670614` 创建 `feat/runtime-minimal-installation-completion-20261030`。新增私有_complete_installation及严格原生bool前置，必须在同一新鲜完整安装调用、原job/plan两锁内，走完工具/永久门禁/API、原三应用ID就绪及准确原策略恢复，才进入完成交接。原策略恢复入口仍保留marker，无公开apply、磁盘resume或新生产许可。

新增固定installation-runs/<installationId>/completion.json：root:root 0600普通单链接、≤16KiB规范JSON、create-only。独立kind sanq-minimal-executor-install-completion-prepared，schemaVersion严格整数1，准确16字段；绑定原intent/writers、恢复归档/回执、快照核验/离机回执、原marker及本次最终工具/门禁/应用/策略/就绪结果的八个SHA256，另含installationId/UTC审计时间。phase固定PREPARED_BEFORE_MARKER_CLEAR，installationComplete/canExecute/restoreProven严格false：它记录清marker之前已核准备事实，不单凭记录存在宣称安装完成，不形成第二份应用current/previous权威或续跑许可。

沿既有受限FD原语先核容量、独占创建、处理短写、文件fsync/目录fsync、规范字节与身份读回，再只在本次owned_records登记。所有后续owned及namespace退出核对均包含准确完成记录和原件摘要；同名残件、部分/未知写入、晚变或错误绑定均保留并阻断，不覆盖、截断、清理或重试。

最后只移除本次准确maintenance/active.json。原marker在初始登记后钉完整指纹；清理前持打开FD，持续核原目录/锁/记录与全部现场、准确规范字节及FD/路径完整身份，拒绝同字节替换和未知成员。独立≤300秒完成预算贯穿最终来源复核、记录持久化、清理及清理后复核，不因fresh_context更新内部命令预算而延长完成预算。unlink成功才在本栈记录marker_cleared，随即目录fsync、空目录/身份读回，再完整核来源与现态；只有本次已知删除后，owned检查才允许maintenance为空。原入口仍严格要求marker存在。

全部成功、命名空间/原目录退出核对无误才返回INSTALLATION_COMPLETE与installationComplete/maintenanceMarkerCleared/completionRecordDurable=true，requiresInstallationCompletion=false；canExecute/recoveryReady/restoreProven仍false。startupFenceConfirmed改为false，临时门禁另标PRE_PERMANENT_GATE_HANDOVER历史观察，不把清marker之后描述为仍被启动围栏阻断。唯一应用state、原DB对象和所有保存原件不回写，三个永久门禁文件保持；记录自身仍是清理前的惰性审计，不将其false字段当当前业务状态。

任何可捕获失败继续对准确原三ID尽力禁重启/逆序stop，结果仍FENCE_UNCONFIRMED，不因发命令就宣称冻结已证明。unlink/目录fsync或清理后核对未知时不重试删除、不重造marker、不改完成记录为成功，准确保留实际存在或不存在状态；永久围栏可能已解除，必须据实人工审阅，不能声称marker一定保留。SIGKILL/主机故障/真实持久性及启动放行、备份/正常发布仍归D4统一隔离验收，当前私有源码能力未部署。

新增20项测试定义，覆盖严格惰性格式/规范/摘要/类型、真实临时文件create-only/权限、原marker身份、截止/同字节替换/未知删除/目录同步失败/重现marker、同锁且策略及六端点后才登记、旧入口隔离、记录未知/晚变/末尾来源故障和清理后异常收束，以及磁盘记录不能重放和开关前置。Python3.10 AST/嵌套全局符号/重复定义/空白与差异静态核对完成；MCP-workspace未运行lint/build/test，本批[PR #3056](https://github.com/sanqin888/sanqinMVP/pull/3056)初始head 4209717d 经[CI #7806](https://github.com/sanqin888/sanqinMVP/actions/runs/41041996642)默认Release发现1项新增夹具失败（1390项运行，不能记为通过）：第二次安装已在预检拒绝，但模拟快照peer仍在等待。修复仅将该次重放探测改为不启动peer，任何快照交换/应用启动重放仍直接使测试失败，并补核原完成记录和已清marker保持；生产逻辑不变。修复已随最终head两条Release各1390项通过CI，真实安装仍未执行。

本批仅新增同bootstrap内部完成审计格式/私有接线，无新helper/unit、依赖包、业务schema/迁移或第二应用state。下一步推进Mac薄入口及D4统一安装/正常发布/失败冻结验收；完整恢复演练按用户决定继续交付后。已审阅，owner/依赖图基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## D2 准确原重启策略恢复（源码已合并）

**D2_RESTART_POLICY_RESTORE_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3055](https://github.com/sanqin888/sanqinMVP/pull/3055)最终head `445a0add05c3c51615adfa66a53729de6a0cd98e` 经[CI #7804](https://github.com/sanqin888/sanqinMVP/actions/runs/41003961731)SUCCESS（4成功/6范围跳过；两条Release各1370、Runtime1080、既有C1回归412），已合并dev `022b4590bde7fe27a3c28a05a232ecd042670614`，无需CI修复；无生产/AWS操作。

基于[PR #3054](https://github.com/sanqin888/sanqinMVP/pull/3054)合并dev `c68618f6b20a8096ab9fb35375b39c060dc4507d` 创建 `feat/runtime-minimal-restart-policy-restore-20261029`。新增私有_restore_installation_restart_policies及原生bool前置，只在原两锁/同一完整新鲜安装调用中，工具与永久门禁/API核验、原三ID启动、实际绑定和六端点就绪均通过后，才恢复保存的准确原重启策略。旧应用验证入口仍止于restart=no，不收养磁盘进度或回执为resume许可。

固定私有Docker update客户端仅接受writers原记录中的api→ubereats-worker→web完整ID；策略只由原件生成，保留no、always、unless-stopped及on-failure的准确MaximumRetryCount（含0），不从参数指定新策略。独立模式不能进入普通观察白名单，不能与start、停写或gate API模式混用；复用root、固定Unix端点、最小环境、无stdin、客户端进程组、≤30秒/有界输出及准确ID回复校验。超时/未知不重试。原策略已经no的角色只核对，不多发一次update。

本轮内存restoredPolicies只登记明确回复的完成角色：已完成件必须准确等于原策略，未完成件仍须restart=no；任何提前恢复、错误/无效读回、完成件晚变或集合类型/阶段不符均拒绝。旧观察和无恢复进度的应用核验继续严格要求全部no。每步持续核同原ID/image/配置/挂载、新启动时间/计数、健康、DB原对象与网络绑定、工具/权限、门禁、原件/锁、恢复材料和存储；不得为恢复策略接受一次新的容器重启。整个恢复与恢复后HTTP复核共享独立≤300秒预算，不在循环中续期，最后完整核来源。

全部角色成功后，六个既定本机/公网GET端点再次全部200，才返回ORIGINAL_RESTART_POLICIES_RESTORED_MAINTENANCE_ACTIVE。restartPoliciesRestored=true，requiresRestartPolicyRestoration=false、requiresInstallationCompletion=true；writersRestartInhibited按准确原策略计算，通常false，原策略全no则仍true。当前原策略和恢复后就绪结果单独返回，不回写writers/intent、历史生命周期或应用current/previous权威；installationComplete/canExecute/recoveryReady/restoreProven仍false，维护marker和永久门禁保持，尚无耐久完成记录或清marker。

任一更新可能已生效后发生错误，继续使用既有应用所有权保护，在独立有界预算内尽力对保存原ID禁重启再逆序stop，某项未知仍尝试其余对象；不操作替代ID/DB，不自动恢复策略、重放安装或回盘。最后仍FENCE_UNCONFIRMED，不因发出命令宣称停写已证明。成功恢复策略后，运行中的Docker可按原策略重启容器，因此该阶段不能继续描述为全局restart抑制；SIGKILL/主机故障的真实监督与冷启动行为仍待D4统一验收，当前私有能力未部署。

新增19项测试定义，覆盖四种策略/计数与准确argv、私有模式隔离、准确回复/未知不重试、顺序与原件/生命周期不变、原no跳过写入、未完成策略不收养、无效进度、no-op读回、部分恢复/完成件漂移/应用重启、恢复后503、截止/阶段/重放拒绝、同锁且先就绪、旧入口隔离及末尾来源失败收束。Python3.10 AST/符号/差异及读回静态核对完成；MCP-workspace未运行lint/build/test，上述19项已随最终head两条Release各1370项通过CI，真实安装仍未执行。

本批为同bootstrap内部原子增量，无新helper/unit、公开apply、持久阶段文件、业务schema/迁移或第二应用state。下一步做耐久安装完成记录与最后清marker，再推进Mac薄入口及D4统一安装/发布/失败冻结验收；完整恢复演练继续列交付后。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## D2 原应用ID启动与就绪核验（源码已合并）

**D2_OLD_APPLICATION_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3054](https://github.com/sanqin888/sanqinMVP/pull/3054)最终head `260dc1db8a7aa410b98c563213e0861bc914ceba` 经[CI #7802](https://github.com/sanqin888/sanqinMVP/actions/runs/40983785449)SUCCESS（4成功/6范围跳过；两条Release各1351、Runtime1080、既有C1回归412），已合并dev `c68618f6b20a8096ab9fb35375b39c060dc4507d`，无需CI修复；无生产/AWS操作。

基于[PR #3053](https://github.com/sanqin888/sanqinMVP/pull/3053)合并dev `86f2c572d332ebee837477561ae87ef75107169d` 创建 `feat/runtime-minimal-old-application-20261029`。新增私有_verify_installation_old_application及原生bool完整前置：沿同两锁/准确新鲜调用，在工具写入、永久门禁加载及已安装guard API核验后，才进入保存原ID的应用启动/就绪阶段。旧API/交接/工具写入入口默认不启动应用；无公开apply、磁盘resume、容器重建/镜像切换或DB启停。

固定新增私有Docker start客户端，只允许原writers记录中的api→ubereats-worker→web三个完整ID；独立模式不进入普通观察白名单，也不能与其他变更模式混用。继续root、默认Unix端点、最小环境、无stdin、独立客户端进程组与≤30秒有界输出；命令回复必须准确对应ID，不把超时当失败后重试。整个启动/等待/HTTP阶段共享独立≤300秒预算，不在轮询中续期。

原writers.json、intent、快照/恢复包等原字节和身份始终保留。每件明确start回复后观察新StartedAt与RestartCount：时间必须合法且晚于保存的原生命周期，计数只接受0或原值，随后钉住本轮准确新值；不把原旧StartedAt继续冒充现态。全组继续核原四容器全集、ID/image/配置/挂载、端口/host设置、engine/卷和DB原生命周期；三个应用始终restart=no。只有本阶段正在等待的应用允许starting，DB及旧观察入口仍严格healthy；所有应用healthy后改为严格持续健康核验。

启动后复用实际环境/DB URL/镜像与Compose核验。网络ID/子网/网关、DB原端点及各角色ID/aliases须保持；只允许已启动原应用形成新的合法端点/IP，并将本轮完整绑定固定到后续复核。随后六个既定本机/公网GET端点必须全部200；每步继续owned原件/锁、工具/权限、门禁、配置、DB历史/存储及材料复核，末尾再完整核来源。启动可产生营业写入；失败只处理原ID并保留实际数据，不据旧快照自动回盘。

任何首次start尝试后的可捕获异常（包括健康/HTTP/原件/最终来源和退出核对失败），均用独立≤300秒预算尽力对原三个ID先禁重启、再逆序stop；不重新发现/操作替代ID或DB，某一命令未知仍尝试其余对象。同一调用的内外层所有权保护最多发起一组收束：主体异常在原锁内处理，目录/锁退出错误另有外层兜底。最后始终FENCE_UNCONFIRMED，不因发出stop就宣称停止已证明，不自动重放或清理标记。SIGKILL/主机故障无法由Python异常处理兜底；新入口仍为私有能力，其真实监督/中断/冷启动行为留D4统一验收，不标记已验证。

成功仅为OLD_APPLICATION_READY_RESTART_INHIBITED：oldApplicationVerified/writersRestartInhibited=true、writersFrozen=false；requiresApplicationVerification=false、requiresRestartPolicyRestoration=true，installationComplete/canExecute/recoveryReady/restoreProven仍false。应用运行在原ID/原镜像上，维护marker与三个永久门禁仍保留，尚未恢复原restart策略、写耐久完成记录或清marker。顶层旧主机事实继续标PRE_INSTALLATION_INTENT，历史frozenWriters另标PRE_APPLICATION_RESTART，当前生命周期/绑定摘要在本阶段单独返回。

新增21项测试定义，覆盖私有argv/准确回复、原件与新生命周期分开、旧观察严格性、计数/时间/策略晚变、starting边界、镜像/配置/挂载/DB漂移、应用新网络端点与原DB限制、健康等待/固定HTTP、部分/未知启动与独立收束预算、同锁且API后启动、旧入口隔离、503/配置/末尾来源错误和原生开关。Python3.10 AST/符号/差异及读回静态核对完成；MCP-workspace未运行lint/build/test，上述21项已随最终head两条Release各1351项通过CI，真实安装仍未执行。

本批为同bootstrap内部原子增量，无新helper/unit、持久阶段票据、业务schema/迁移或第二应用state。下一步在同流程恢复准确原策略、耐久完成记录与最后清marker，再推进Mac薄入口及D4统一安装/发布/失败冻结验收；完整恢复演练继续交付后。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## D2 已安装门禁API与启动拒绝核验（源码已合并）

**D2_INSTALLED_GATE_API_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3053](https://github.com/sanqin888/sanqinMVP/pull/3053)最终head `b3c8b4c9ed1883078bad9a79890c9abb4b6563e9` 经[CI #7800](https://github.com/sanqin888/sanqinMVP/actions/runs/40936263813)SUCCESS（4成功/6范围跳过；两条Release各1330、Runtime1080、既有C1回归412），已合并dev `86f2c572d332ebee837477561ae87ef75107169d`。两次CI修复仅对齐临时fixture路径/命令/模板，并用事件同步模拟快照的完整写出顺序（另补1项回归）；未放宽运行源码或CI门禁，无生产/AWS操作。

基于[PR #3052](https://github.com/sanqin888/sanqinMVP/pull/3052)合并dev `1ad9775578bff42d79a95d57b1abea3f37a68b9c` 创建 `feat/runtime-minimal-installed-gate-api-20261029`。新增私有_verify_installation_permanent_gate_api，沿原两锁/同一完整新鲜安装调用，在27项工具写入与三永久门禁文件/manager属性交接全部核对后，再执行准确已安装guard的只读API；新原生bool依赖完整handover。旧观察/工具写入/门禁交接入口默认不执行该API，不接受磁盘回执或resume。

maintenance_guard新增兼容只读命令check-installation-fence：要求root，调用既有_installed_gate核固定helper/drop-in、三个实际加载属性和Docker live-restore/Swarm，再核私有维护目录仅有本次规范四字段安装marker、0600/原件身份，实际调用check_startup并要求其阻断，最后重读标记。只返回八字段规范JSON（版本/kind/安装ID/marker摘要/门禁已查/启动已拒绝/两个false许可），不解析该marker为普通发布维护记录，不修改标记或取得安装执行权。旧check-startup/status和daemon/backup固定命令保持，命令不可启动/解冻/恢复业务。

bootstrap仅在独立私有client模式下允许固定/usr/bin/python3 -E -S -B -X pycache_prefix=/dev/null及固定已安装脚本/只读命令；普通观察白名单仍不接受它。忽略Python环境/站点加载，禁写pyc并把缓存前缀指向不可作目录的/dev/null，避免读取既有目标字节码；不导入交付kit或未完成/混装工具。复用原root/默认Docker端点、最小环境、无stdin、独立客户端进程组、≤30秒/总输出预算及未知结果不重试；子命令每项观察≤5秒且完成后核≤64KiB。真实系统Python加载/权限与文件系统行为仍待统一安装验收。

API前后继续原owned记录/锁、全部工具字节与权限/完整身份、门禁、原冻结对象、DB/存储、配置和快照材料复核，结束再完整核来源。父进程只接受≤4096字符、准确八字段/原生类型/规范字节的报告，安装ID和marker摘要必须与原intent重算一致；错报告、输出异常、子进程结果未知或任何晚变均沿FENCE_UNCONFIRMED保留实际文件和冻结，不清理/回滚/重放。报告摘要仅为本轮内存事实，不持久化新票据。

成功止于PERMANENT_GATE_API_VERIFIED_FENCED：permanentGateApiVerified/startupDenialObserved/installedToolPermissionsRechecked=true，requiresInstalledGateApiVerification=false；requiresApplicationVerification=true，installationComplete/canExecute/recoveryReady/restoreProven仍false。尚未启动原三应用、恢复restart策略、写耐久完成记录或最后清marker；原DB对象及业务state保持，完整恢复演练按用户决定留到交付后。

新增19项API等测试定义，CI修复另补1项管道时序回归，覆盖实际guard函数和临时文件/主机模型、三unit/属性/权限/链接、缺失/异类/额外marker、原生类型与晚变、只读CLI/错误不回显、严格报告绑定/规范性、上下文与截止、私有argv隔离、同锁且加载后调用、旧入口隔离、未知结果不重试及工具晚变。完成Python3.10 AST/符号/差异及读回静态核对；MCP-workspace未运行lint/build/test，上述测试已随最终head两条Release各1330项通过CI，真实安装仍未执行。

本批为同一交付源内的内部原子接线及兼容只读入口新增，无新helper/unit、公开安装apply、持久阶段文件、业务schema/迁移或第二应用state。下一步验证旧应用与原策略，再做耐久完成记录及最后清marker，随后Mac薄入口和D4统一安装/正常发布/失败冻结验收；真实恢复演练另列交付后。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## D2 永久门禁文件与加载交接（源码已合并）

**D2_PERMANENT_GATE_HANDOVER_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3052](https://github.com/sanqin888/sanqinMVP/pull/3052)最终head `d4ece6f7bfebc8411f23f3748e72f8ed8168aa70` 经[CI #7796](https://github.com/sanqin888/sanqinMVP/actions/runs/40930009710)SUCCESS（4成功/6范围跳过；两条Release各1310、Runtime1080、既有C1回归412），已合并dev `1ad9775578bff42d79a95d57b1abea3f37a68b9c`，无需CI修复；无生产/AWS操作。

基于[PR #3051](https://github.com/sanqin888/sanqinMVP/pull/3051)合并dev `ef74c0c0b299d014a50f1624f2e41c557e53a208` 创建 `feat/runtime-minimal-permanent-gate-handover-20261029`。新增私有_handover_installation_permanent_gates，沿原两锁/新鲜完整安装调用，在27项工具全部读回后继续同三个固定drop-in的永久文本与manager加载交接。新原生bool必须依赖完整工具写入链；旧工具写入入口仍止于临时拒绝门禁，不接受磁盘回执/resume或公开apply。

固定顺序为docker.service→docker.socket→sanq-backup.service：核准确临时原件和目录身份，按源校验过的固定DROPINS文本，以同目录独占.sanq-install-gate.pending暂存、短写、root:root/0644、文件fsync/读回、原件/现场重核、单文件rename、目录fsync及最终读回替换；socket文本相同只核对，不换inode。维持原5GiB余量/独立300秒预算，临时和永久拒绝文本交替期间维护marker始终保留。失败保留实际新旧文件/pending和冻结，不自动清理、回滚或重放。

原systemd全组parity在私有handover进度存在时核每件原/目标/本次pending及目录清单：完成件钉本次完整身份，未写件仍钉原件，只有当前件允许明确中间状态。每步继续原冻结对象、DB/卷/存储、工具全组、配置/私有证据及原unit/非本轮override核对。文件交接期间只允许三个相关unit的NeedDaemonReload暂为yes/no，实际有效ExecStartPre仍须是原固定false；全部文件成功后只调用一次daemon-reload，随后必须NeedDaemonReload=no、唯一固定DropInPaths、准确Python/guard argv且不忽略错误。任何缺失/额外命令、加载旧值、未知reload或其他manager/磁盘漂移均阻断，不凭文件存在宣称已加载。原无handover调用仍使用既有严格临时门禁核验。

成功止于PERMANENT_GATES_LOADED_FENCED：permanentGatesLoaded/permanentGatePropertiesObserved=true并返回准确文件及属性摘要；permanentGateApiVerified/installationComplete/canExecute仍false，requiresInstalledGateApiVerification/requiresApplicationVerification=true。尚未调用新guard的完整_installed_gate/API验收，未启动旧应用、恢复restart策略、清marker或登记安装完成；该“加载”只表示固定磁盘文本和实际查询属性匹配。原三应用仍停写，DB保持原对象，restoreValidationDeferred=true/restoreProven=false；完整恢复演练继续交付后，不另作为本阶段前置。

新增19项真实临时文件/主机模型与数据测试，覆盖同锁/完整工具后顺序、两次阶段各自reload、旧入口隔离、部分替换/同步/rename失败、socket原inode、reload成功但属性未变/结果未知/仍需reload、严格命令/额外override、完成件/目录/工具晚变、阶段内无Git请求、拒绝重放及截止。Python3.10 AST/符号/差异及读回静态核对完成；MCP-workspace未运行lint/build/test，上述19项已随最终head两条Release各1310项通过CI；真实PID1/冷启动/文件系统行为未验收。

本批为同bootstrap私有交接/返回字段的原子增量，无新helper/unit、CLI、磁盘阶段记录、业务schema/迁移或第二应用state；只新增三固定unit目录下的pending中间件命名。下一步在同一流程核已安装guard/API及权限，验证旧应用和原策略，再做耐久完成记录与最后清marker，随后补Mac薄入口；完整恢复演练仍列交付后待办。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## D2 原持锁事务接入工具写入（源码已合并）

**D2_OWNED_TOOL_WRITES_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3051](https://github.com/sanqin888/sanqinMVP/pull/3051)最终head `4b0d426ab7401043290f9469b8703d26e1057be2` 经[CI #7794](https://github.com/sanqin888/sanqinMVP/actions/runs/40924109819)SUCCESS（4成功/6范围跳过；两条Release各1291、Runtime1080、既有C1回归412），已合并dev `ef74c0c0b299d014a50f1624f2e41c557e53a208`，无需CI修复；无生产/AWS操作。

基于[PR #3050](https://github.com/sanqin888/sanqinMVP/pull/3050)合并dev `a31f032511d09f77a087858f07dcf4c49460f158` 创建 `feat/runtime-minimal-owned-tool-writes-20261029`。新增私有_write_installation_tools，沿原两锁/完整预检/意图和临时门禁/原ID停写/恢复包/活跃快照核验及机外ack耐久确认的同一调用栈接入27项工具写入。新原生bool只允许完整确认链，旧观察、确认和其他入口默认不写工具；无导入批准、磁盘resume或公开apply CLI。

按原交付源重算写集、核现场后，固定旧目录FD和目录清单，在独立300秒写入预算内顺序处理九helper、原17和最后的准确Manifest，复用已合并单文件耐久原语。写入前拒绝任何既有.sanq-install-残件。源码/准确发布证明在写入阶段前后完整核验；逐文件回调保留原件/锁、冻结对象、DB历史/存储、门禁、配置及恢复材料复核，不在每个文件回调里重复全部Git网络请求。

新增只在本调用栈内持有的进度审计：已完成成员核目标准确字节和本次原语返回的完整身份；未写成员仍核原件/原身份或准确不存在；仅当前写入成员可处于原件/目标及准确pending的受限状态，最终每件再读回。固定目录路径和身份重核，目录成员只允许本轮已创建helper和当前pending；额外文件、原件/已写文件晚变、父目录替换、门禁/私有证据漂移均拒绝。该审计返回实际当前文件事实，不假装原Runtime仍未变；原全组观察明确observationTiming=PRE_INSTALLATION_INTENT，新文件事实在toolFiles单独返回。原只读白名单保持，仅新私有工具读者增加固定pending原件读取。

成功止于TOOL_FILES_WRITTEN_FENCED：toolFilesWritten/snapshotMaterialsConfirmed=true，仍保留临时拒绝门禁、维护marker、原三应用停写及restart=no；permanentGatesLoaded/installationComplete/canExecute为false，不启动业务或清marker，不执行新工具。restoreValidationDeferred=true/restoreProven=false，继续2026-10-29用户决定，不以完整恢复演练阻断交付；snapshotAvailable及独立AWS来源/可信时间旧flag不被伪改为true。

新增19项真实临时Runtime文件与主机模型测试，覆盖同锁且两份回执之后才写、27项顺序/准确目标、旧入口隔离、错ack/源失败、原配置/DB/临时门禁保持、部分失败与拒绝重放、残件/未知文件、已写/未写/配置/存储/回执漂移、目录替换、文件循环无Git请求和开关前置。Python3.10 AST/符号/差异及准确读回静态审阅完成；MCP-workspace未运行lint/build/test；上述19项已随最终head两条Release各1291项通过CI。真实安装与性能/文件系统/进程验收未执行。

本批是同bootstrap内部原子接线/私有返回新增，无新helper、unit、CLI、磁盘阶段文件、业务schema/迁移或第二应用state。进度仅为本次调用的内存事实，返回或中断均不产生续跑权；故障保留现有安装原件、临时门禁和实际新旧文件/pending，不自动回滚。下一步在同一流程继续永久门禁交接、旧应用核验和最终安装完成，再完成Mac入口；完整恢复演练仍列交付后待办。已审阅，依赖图/基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持，无生产/AWS/root安装/DB操作。

## D2 工具写入清单与耐久文件原语（源码已合并）

**D2_TOOL_FILE_WRITE_MERGED_DEV / SOURCE_CI_VERIFIED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

本批[PR #3050](https://github.com/sanqin888/sanqinMVP/pull/3050)最终head `aed624ff78d1023ad92989e14a6306f0332b572d` 经[CI #7792](https://github.com/sanqin888/sanqinMVP/actions/runs/40920524877)SUCCESS（4成功/6范围跳过；两条Release各1272、Runtime1080、既有C1回归412），已合并dev `a31f032511d09f77a087858f07dcf4c49460f158`，无需CI修复；无生产/AWS操作。

2026-10-29用户明确要求“恢复验证等交付之后抽空再做”。据此将新Lightsail完整快照恢复、PG/WAL/业务内容对照、仅机外取得和恢复适用范围验收移入交付后待办；不再阻断本项目源码推进或作为首版完成条件，也不记为PASS。恢复研究/已合并材料保留，restoreProven保持false。更新前准确手动快照available核验、旧工具/配置恢复材料保存及机外索引确认仍属于安装前置；安装/正常发布/失败冻结自身的验收继续按原交付范围执行。历史章节中“真实恢复通过后才能交付/RECOVERY_READY”的前置关系由本节调整，以SNAPSHOT_MATERIALS_READY表示安装材料就绪，与实际恢复证明分开。

基线为[PR #3049](https://github.com/sanqin888/sanqinMVP/pull/3049)合并dev `d7798ab48726574f47b04529a8ddcdf3c30c8e00`；其最终head `7062c657ed79c93f9fe1a3759204df23c166e5b2` 经[CI #7790](https://github.com/sanqin888/sanqinMVP/actions/runs/40909418492)SUCCESS（4成功/6范围跳过，两条Release各1244、Runtime1080、既有C1回归412）。本地分支 `feat/runtime-minimal-install-write-plan-20261029`。

私有_installation_tool_write_set复用exact main/归档/Git来源和原工具差异审计，再核完整18项旧观察的原字节/metadata；返回固定27项顺序清单及单独私有目标字节：先九helper独占创建，原17按批准范围替换或只核对，最后写原目标归档的准确Manifest。只允许deploy_release.py/release_contract.py两项Runtime内容变化，保留旧文件模式；helper为0644。bootstrap不落入Runtime，永久三门禁另属后续阶段。清单只绑定来源/顺序/摘要/原身份，不是现场观察或授权，readyToInstall/canExecute仍false。

私有_write_installation_tool_member使用调用方已固定的父目录FD、原字节/完整身份及现场复核回调；固定允许路径、root身份、owner/mode/单链接、≤300秒预算和5GiB余量。未变成员只读核对；写入先独占固定pending文件，短写循环、权限/文件fsync与整件读回，重新核原文件及pending后发布。替换用单文件rename并同步父目录；helper用不覆盖的硬链接发布、同步目录、移除pending后再同步目录，最终核内容/模式/身份。每个目录/文件原语不是整个安装原子事务。失败保留实际旧/新/pending，不清理或自动回滚；pending存在时连“未变核对”也拒绝。未修改现有读取白名单，也不以该底层原语独立认证来源/路径、锁或门禁。

新增28项原件/真实临时文件与故障模型测试，覆盖固定清单/源变更、原Manifest字节及权限、独占创建、同步/rename/读回顺序、短写/零进展、残件/竞态、链接/晚变、容量/截止、失败保留及无目标代码执行。Python3.10 AST/符号/差异/读回静态审阅完成；MCP-workspace未运行lint/build/test；上述28项已随最终head两条Release各1272项通过CI。

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

