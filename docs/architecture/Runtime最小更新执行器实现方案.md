# Runtime 最小更新执行器实现方案

## 首次安装：关联记录受控登记与清单校验（本地待审）

**INSTALL_OWNED_TASK_HANDOFF_LOCAL / CI_PENDING / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3062合并dev `4c9c6bdec0e2dfc299879fa3292e9bb6a5ddb023` 创建 `feat/runtime-install-owned-task-handoff-20261030`。在既有bootstrap补受控关联记录登记：要求本次owned_records已有准确writers且无旧关联，调用方检查先通过，再核准确intent/writers原件，完成create-only IO与读回后才登记独立context副本、原字节及完整文件指纹，最后再次调用owned检查。失败保留已写文件与实际登记状态，不删除、重试或恢复营业。

将task-originals.json接入owned记录白名单、_installation_owned_run、check_owned和命名空间退出校验。仅本次内存登记证明存在时接受该成员；每次核原intent/writers关联、记录字节及完整文件指纹，拒绝同字节替换、变化的运行代次、坏证明和未知残件。没有登记的正确文件也不能被收养；这不新增第二应用state或磁盘resume许可。

受控登记本身不取得全局锁，也不刷新manager/来源；必须由上层准确原锁和受控check_owned闭包负责。新增测试使用真实临时文件及调用方持有的两个OS锁核检查时机，不代表实际VM全局锁/manager已验收。普通安装尚未调用登记生产者，仍不创建该关联文件；下一步须将它接原writers耐久之后、freeze之前，并补manager/来源新鲜检查及安装专用提交/run/cleanup。当前没有公开apply或独立收尾入口，G3仍OPEN。

新增8项测试定义，覆盖调用方锁与登记、无登记文件拒绝、旧登记/错writers拒绝、同字节替换、内存context/证明变化、同步未知保留未登记文件、末尾context失败保留登记及namespace退出。新增源码/测试Python3.10 AST、符号表与静态差异核对完成，MCP-workspace不运行lint/build/test，8项测试待本批CI，未提交/推送。

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

## D2 手动快照内容核验合同（文档已合并）

**CONTENT_REVIEW_CONTRACT_MERGED_DEV / DOCUMENTATION_CI_VERIFIED / NOT_IMPLEMENTED / NOT_INSTALLED。**

本批[PR #3040](https://github.com/sanqin888/sanqinMVP/pull/3040)最终head `96396fc494fb2a7a43bc7997dbcca51af4c76051` 经[CI #7769](https://github.com/sanqin888/sanqinMVP/actions/runs/40777661283)SUCCESS（1成功/9文档范围跳过），已合并dev `d7b27fe0e573a32dd637f8c03a0baeb70efc0368`；两次提交包含完整8份文档，无源码CI修复或生产操作。

原文档批次基线为 `d6484c6d7216c32bacd9eb36a980296a25ed2152`（PR #3039），原分支为 `docs/runtime-snapshot-content-contract-20261028`；文档改动已按上述回执合并。已制定并复审[手动快照内容核验合同](Runtime手动快照内容核验合同.md)：要求停写前独立绑定SSH目标/实例，观察系统盘及完整DB/WAL/表空间覆盖，再核本轮challenge关联的新手动快照；区分字段一致与人工AWS会话核验。这些能力尚未实现，未证明生产磁盘覆盖；首版仍阻断附加盘、分离/远端存储及覆盖不明，不增加多盘编排。

本次续审对照最新安装器、24项等待测试、CI工作流/实际回执及AWS/PostgreSQL官方文档，补齐快照可用区all与区域分别比较、源/快照磁盘清单分开核验、DB仍运行时的一致恢复前置，以及拍照后回执须有离机索引的边界；同步发布手册与AWS owner入口。本批仍仅文档，未增加验证器、未改ready许可、源码、依赖、业务schema或既有17+Manifest/250/300；未执行项目测试或生产操作。下一步为停写前独立目标与设备/完整DB存储观察，再接内容核验及耐久交接；三组研究继续暂停、不取消。

## D2 快照材料有界等待与现场复核（源码已合并）

**2026-10-28 当前进度：D2_SNAPSHOT_EVIDENCE_WAIT_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3039](https://github.com/sanqin888/sanqinMVP/pull/3039) head `1a5beeb891e6e023b501f8746a602a59f5f43f96` 经[CI #7766](https://github.com/sanqin888/sanqinMVP/actions/runs/40767652506)全绿（4成功/6范围跳过；Release默认Python与3.10各1053、Runtime1080、既有C1回归412），合并dev `d6484c6d7216c32bacd9eb36a980296a25ed2152`，无需CI修复；未执行生产操作。

本批从[PR #3038](https://github.com/sanqin888/sanqinMVP/pull/3038)已合并dev `921cb579e8e4f67a04e72760f8955250ea77bfa3` 建立 `feat/runtime-minimal-snapshot-review-wait-20261028`。内部_receive_installation_snapshot_evidence只续接同一次原两锁、全预检/意图/临时门禁/原ID停写、整体范围审计与恢复包成对耐久保存；最后才进入单次输入等待。旧恢复保存/停写入口不等待，新开关与完整阶段严格关联，仍无install/snapshot-review/resume公开CLI。

输入/输出只借用调用者已打开的管道或真实terminal FD，预检拒绝普通文件、socket、同FD、反向FD及同一管道回环，记录稳定身份并在等待前后核对。不打开调用者路径、不启动命令/后台进程或新建恢复记录。selectors配合临时O_NONBLOCK有界短写/分块读，完成后恢复原FD状态标志，不关闭调用者FD；恢复标志失败也阻断。请求≤4096字节，回复≤64KiB且单行规范JSON；输出背压、零进展、EOF、超时、超量或多帧均不能变成无限等待/空成功。

等待上限固定1800秒（运维边界，不是AWS完成时长保证）。请求绑定本次installationId、intent/writers/归档/回执SHA及新随机32字节challenge；回复必须准确对应这些字段、固定kind/schemaVersion=1和非空evidence对象，拒绝重复/额外字段、非有限值、坏编码/规范化及旧challenge。该结构只说明本次输入接收，不认证evidence里的VM、磁盘、快照、时间或available状态；即使evidence自报snapshotAvailable=true也仍未验证。原始输入只在本轮内存中处理，对外仅回请求/回复/evidence摘要与字节数，不回显输入或秘密，也不落成可供resume的磁盘票据。

等待前后各重新启动300秒monotonic现场复核预算，沿同一owned调用栈重核意图/marker/目录/恢复包准确字节、来源与原Runtime/配置/备份、冻结的原三ID/DB/卷、SQL历史、plans/jobs/原锁和全部retention，再从归档复核整体范围。普通原入口仍使用原预算；不复用已过期的等待前deadline，不放宽250/300来源guard。坏通道在现场预检/安装写入前拒绝；等待阶段任何异常或晚变仍FENCE_UNCONFIRMED，保留实际门禁/停写/原件/成对恢复包，不自动开启业务、清理或重放。

本阶段结果为INSTALLATION_SNAPSHOT_EVIDENCE_RECEIVED，snapshotReview.outcome=SNAPSHOT_EVIDENCE_RECEIVED_UNVERIFIED，仅unverifiedEvidenceReceived=true、requiresSnapshotValidation=true；snapshotEvidenceValidated/snapshotAvailable/recoveryReady/canExecute仍false。它是后续快照内容核验的输入层，不是RECOVERY_READY。后续必须在当前调用栈中核准确VM/区域/存储覆盖、停写后创建顺序及手动快照available证据，再接耐久核验回执/工具安装；本批不调用AWS、不创建快照，不恢复可信时间/跨克隆研究。

新增24项真实管道/线程及完整模型测试：部分帧/实际短写、输入超时/输出背压、EOF/零进展/超量/多帧、FD类型/方向/回环/非法截止、完整绑定/challenge/严格JSON/权限字段、同锁且耐久包之后才请求、摘要不泄露与嵌套available自报不授予许可、等待超过旧300秒后新预算、错challenge/超时/EOF的保留及禁止重放、等待中plan/DB/通道变化、坏通道提前拒绝、旧入口不等待/无CLI。主机/GitHub/根身份仍为模型；完成静态核对后，上述24项已随本批两套Release各1053项通过CI。D4仍须验证真实SSH/TTY模式与帧容量、FD断连/flags、中断/重启、backup timer触发及资源/预算。

原PRIVATE_FILES四材料、intent/marker/writers/恢复包与回执格式、17+Manifest/250/300、九helper/三永久模板及唯一应用state保持，无新依赖包或业务schema/迁移。快照证据内容核验、RECOVERY_READY、逐文件安装/永久门禁、旧应用核验交接、Mac薄入口及D4统一真实隔离验收仍OPEN。三组研究暂停、不取消；未执行生产预检、停写、安装、AWS或数据库写操作。

## D2 恢复包整体范围审计（源码已合并）

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

## D2 私有目录清单与原缺失事实（源码已合并）

**2026-10-28 当前进度：D2_RECOVERY_PRIVATE_NAMESPACE_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3037](https://github.com/sanqin888/sanqinMVP/pull/3037) head `9114a8217588a974bd80ba92994ae7bfdfdd0393` 经[CI #7762](https://github.com/sanqin888/sanqinMVP/actions/runs/40761211135)全绿（4成功/6范围跳过；Release默认Python与3.10各1008、Runtime1080、既有C1回归412），合并dev `f561319216da20fb88fc9d702f8020d35aec0dc1`，无需CI修复；未执行生产操作。

本批从[PR #3036](https://github.com/sanqin888/sanqinMVP/pull/3036)已合并dev `39bc6a5dee82b2a638c3494d7022e68ac9f84d84` 建立 `feat/runtime-minimal-recovery-private-namespace-20261028`。恢复原件采集在原两锁内增加deploy-state完整根清单、四固定目录路径/FD身份与完整指纹、maintenance原本为空、installation-runs原本缺失或为空的事实；开始/结束采集再次核对。不把本轮随后生成的marker、事务或临时门禁当旧原件。

根清单有界至多5项，仅jobs/plans/maintenance/installations及可选installation-runs；未知/重复/缺失项直接阻断。目录均nofollow、root 0700，路径与原持有FD必须匹配；原事务目录只能缺失或严格为空，任何残件继续阻断且不清理。规范privateNamespace事实只含固定目录原identity/fingerprint、originalEntries、空maintenanceEntries及可空installationNamespace，不保存新秘密字节，不增加磁盘记录或公开CLI。index打包须验证准确字段、原owner/mode、原生整数、identity投影及准确清单，不能漏掉或扩大原缺失事实。

恢复保存续接必须携带本轮采集的原namespace事实，并在写意图前重读完整事实一致。创建事务namespace时保留真实created结果：原本缺失必须由本次调用真正创建，不能收养中途出现的空目录；原本存在则必须保持原inode。之后在本轮state_matches/owned检查中只容许自身已知的根清单变化，持续核根/四原目录/事务namespace稳定身份；原有准确意图/marker/writers/recovery目录与成员证明继续检查，未用mtime例外放过未知目录或记录。

采集/写意图前漂移不产生停写动作；已开始变更后的异常继续按原保存ID尽力围堵并FENCE_UNCONFIRMED。归档/回执期间出现未知根或维护成员、事务namespace替换，都保留实际原件与空/部分/完整恢复包，不返回成功、不恢复策略/启动业务/删除证据或自动重放。新检查仅用于本轮完整恢复保存；单独意图/停写入口保持原范围，不接纳导入的事实作为执行许可。

新增23项模型测试：准确缺失/空事实、既有空目录inode、同锁只读无write/fsync/spawn、完整归档原事实、未知根文件/目录及旧事务残件、软链接/权限、采集后未知条目/空目录出现、创建竞态拒绝收养、原空目录替换、写意图前plan漂移、首个停写动作后未知根及保存后根/maintenance/namespace晚变、严格事实解析/打包、缺原事实的续接拒绝、旧停写入口不启用新采集。既有恢复保存的晚期plan漂移测试改为首个writer动作后注入，继续断言FENCE_UNCONFIRMED及保留停写证据；新测试另证明采集后、意图前plan变化提前阻断。完成静态AST/名字/方法/空白、差异与准确读回核对后，上述23项已随本批两套Release各1008项通过CI；真实系统验收仍OPEN。真实inode/权限、SIGKILL/重启及大材料资源/300秒预算仍属D4。

本批补齐固定私有根清单及原缺失事实，completePrivateStateCaptured、recoveryReady、snapshotAvailable、readyToInstall/canExecute仍false。下一步统一对照恢复范围并接停写后准确Lightsail手动快照available核验，再进入RECOVERY_READY与工具安装；永久门禁、旧应用核验交接、Mac薄入口和D4真实隔离验收仍OPEN。17+Manifest/250/300、九helper/三永久模板、原四材料及唯一应用state权威保持，无依赖包/业务schema变化。三组研究暂停、不取消；未执行生产预检、停写、安装、AWS或数据库写操作。

## D2 恢复包保留全部历史交付材料（源码已合并）

**2026-10-28 当前进度：D2_RECOVERY_MATERIAL_HISTORY_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3036](https://github.com/sanqin888/sanqinMVP/pull/3036) head `0ecc13c5bdc5bf8b9bdfc277417142a042ca0f6e` 经[CI #7760](https://github.com/sanqin888/sanqinMVP/actions/runs/40759140082)全绿（4成功/6范围跳过；Release默认Python与3.10各985、Runtime1080、既有C1回归412），合并dev `39bc6a5dee82b2a638c3494d7022e68ac9f84d84`，无需CI修复；未执行生产操作。

本批从[PR #3035](https://github.com/sanqin888/sanqinMVP/pull/3035)已合并dev `54209c55d6dfb2c7883f2d7f4d32b834c239a82a` 建立 `feat/runtime-minimal-recovery-material-history-20261028`。安装前原件采集从“本次retention四材料”扩展为installations目录中全部已完成retention，保留每组四份准确原字节、文件metadata、组目录及共同namespace完整指纹。固定PRIVATE_FILES四成员和各自格式保持；无历史版本选择、保留清理、恢复执行或新CLI。

扫描至多64个严格64hex目录，root 0700、四文件0600/nofollow/单链接；四成员齐全、大小预算、原目录与文件身份、规范retaining/retained记录、内容派生retentionId及两归档摘要/长度必须一致。读取前先检查本组声明大小，所有组继续受原48MiB来源总预算，打包时原件加宿主观察仍共享48MiB，原2100成员/56MiB归档/2MiB index/300秒截止保持。超预算直接阻断，不删历史、不选“最近一份”或静默漏项。未知名称、额外/不完整成员、坏记录、链接、权限或读取中替换均保留并拒绝。

历史交付包和旧Runtime归档仅按原记录核对字节/摘要，作为恢复数据保留；不执行/导入/解压其内容，也不把历史材料记录当当前安装许可、当前应用版本或历史Git来源重新证明。本次目标材料原新鲜来源审阅继续独立执行。原件清单新增retainedMaterialDirectories/retainedMaterialNamespace事实，打包固定路径集合只允许这些已审组的准确四文件，要求含本次retention；不能遗漏已声明组或任意扩展路径。

同一次原两锁、门禁前内存采集完成后，已确认停写的恢复保存阶段在生成归档前及成对保存后重新采集全部历史原字节/metadata/目录/namespace并比较。晚期增删、同字节替换或篡改均FENCE_UNCONFIRMED；保留实际原意图/marker/writers、临时门禁、已停止原容器及空/部分/完整恢复包，不启动业务、清理记录或自动重试。对外仍只返回摘要；旧单独停写入口默认不扫描额外历史。

新增25项模型测试，覆盖全部组原字节/摘要/目录、只读且数据不执行、摘要不泄露或授予许可、同锁完整保存/index/回执绑定、未知/缺失/额外成员、目录与文件软链接/硬链接/权限、坏JSON/缺字段/内容或身份不一致、组数/读取前字节预算、两轮采集间同字节文件替换、读取中同字节目录替换、停写后新增历史、回执后历史篡改的持久证据/禁止重放、打包缺组/未知路径及旧入口行为。完成静态AST/名字/方法/空白、差异和准确读回核对后，上述25项已随本批两套Release各985项通过CI；真实系统验收仍OPEN。真实系统上历史规模、内存/重复读取和300秒预算仍须D4验证。

当前只关闭了已完成retention历史材料的漏采缺口，不把completePrivateStateCaptured、recoveryReady、snapshotAvailable或readyToInstall/canExecute改为true。其余私有namespace/缺失事实的完整范围审计与停写后准确Lightsail手动快照available绑定仍OPEN；随后才可达到RECOVERY_READY并进入工具安装。永久门禁、旧应用核验交接、Mac薄入口及D4统一真实隔离验收仍OPEN。原17+Manifest/250/300、九helper/三永久模板、唯一应用state权威、依赖包与业务schema保持；三组研究暂停、不取消，未执行生产预检、停写、安装、AWS或数据库写操作。

## D2 恢复包保留宿主原始观察（源码已合并）

**2026-10-28 当前进度：D2_RECOVERY_HOST_OBSERVATIONS_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3035](https://github.com/sanqin888/sanqinMVP/pull/3035) head `138815e7ccf4b53baba9bffde26ae0156bcb9d5c` 经[CI #7758](https://github.com/sanqin888/sanqinMVP/actions/runs/40733769666)全绿（4成功/6范围跳过；Release默认Python与3.10各960、Runtime1080、既有C1回归412），合并dev `54209c55d6dfb2c7883f2d7f4d32b834c239a82a`，无需CI修复；未执行生产操作。

本批从[PR #3034](https://github.com/sanqin888/sanqinMVP/pull/3034)已合并dev `04b3e098bdeae866c3dd26ee90c43302bbda1263` 建立 `feat/runtime-minimal-recovery-host-facts-20261028`。内部恢复保存流程在原两锁、完整预检之后，写意图/marker和临时门禁之前，保存原四容器、实际镜像、Compose导出与展开配置、Docker engine/volume/network以及四unit已加载属性的固定只读命令原始stdout。复用原Docker、环境/网络绑定、有效端口/健康检查及systemd验证器，结果必须与本轮基线一致；采集失败或漂移在任何安装写入/停写前阻断。原只读观察和单独停写入口默认不额外采集。

原始输出随既有recovery.tar保存为observations/pre-install-host.json，不新增磁盘记录或CLI。该规范JSON保存命令argv/原stdout及所对应的既定基线摘要，准确绑定writers中的原四ID/镜像/策略/生命周期/config/mount与engine摘要；完整固定命令集合必须出现，拒绝任意对象、exec/stop/reload等命令及权限字段扩大。归档仅保留输出，不把argv当恢复脚本执行。Compose导出的$$和实际环境中的$分别原样保存，不在归档时再转义或解码。输出可能含数据库URL/凭据，沿用root 0700目录、0600归档/回执与完整耐久读回；对外结果只返回摘要。

原文件scope和两项内存捕获结构供既有只读源采集保留；完整保存流程改用pre-install-files-and-host-observations，第三项仅为本轮私有原始观察字节。index新增hostObservations的固定member/hash/bytes、preGate=true和completeHostStateCaptured=false；原文件capturedBytes仍只计原件，原件加观察合计受48MiB限制。观察另限128次、单次原2MiB、总8MiB，继续共享原300秒截止、2100成员/56MiB归档及2MiB index预算，不增加执行或权限通道。归档/回执原格式与未知保留规则保持；少观察原件、错摘要、字段或范围不一致均拒绝打包。

这只补齐当前受限预检使用的原始宿主观察，未证明全部Docker可选配置、全部manager属性/vendor文件来源、镜像离线恢复、DB应用凭据真实登录或完整私有历史。completeHostStateCaptured/completePrivateStateCaptured、recoveryReady、snapshotAvailable、readyToInstall/canExecute仍false，不形成第二应用版本权威，不允许覆盖工具或自动恢复业务/旧盘。后续补齐其他历史retention/私有材料范围及停写后准确Lightsail手动快照available核验，再达到RECOVERY_READY；工具安装、永久门禁、旧应用核验交接、Mac薄入口及D4真实隔离验收仍OPEN。

新增15项模型测试，覆盖私有原输出/摘要分离、同锁且门禁前采集、原意图/writers/index/回执绑定、Docker与有效加载属性漂移、只读客户端失败、独立/共享预算、缺失原件/错metadata/扩大权限、坏JSON/重复/非有限值/非规范编码、任意对象与变更命令拒绝、Compose导出与实际环境美元原字节、旧入口不采集；既有22项恢复保存测试更新采集观察点，失败保留/读回断言保留。仅执行静态AST/名字/方法/空白、差异与准确读回核对后，本批15项及更新的既有22项已随两套Release各960项通过CI；真实系统验收仍OPEN。D4须验证新增采集在真实主机上的资源/300秒预算、Compose版本差异及崩溃/重启恢复边界。

无17+Manifest/250/300、九helper/三永久模板、原四材料、依赖包或业务schema变化。三组研究继续暂停、不取消；未执行生产预检、停写、安装、AWS或数据库写操作。

## D2 同锁恢复文件包耐久保存（源码已合并）

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

## D2 安装前恢复原件源采集（源码已合并）

**2026-10-28 当前进度：D2_RECOVERY_ORIGINAL_SOURCES_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3033](https://github.com/sanqin888/sanqinMVP/pull/3033) head `0ddcaaeeb3bbd7b483b268d6680450b44576b9f4` 经[CI #7754](https://github.com/sanqin888/sanqinMVP/actions/runs/40719407895)全绿（4成功/6范围跳过；Release默认Python与3.10各923、Runtime1080、既有C1回归412），合并dev `99237607adf08bb21b1e2f6e9d68f88ce30d59b6`，无需CI修复；未执行生产操作。

本批基于[PR #3032](https://github.com/sanqin888/sanqinMVP/pull/3032)合并dev `178ce5b0346f2183b0dc150a5881facc06fc859b` 建立 `feat/runtime-minimal-recovery-sources-20261028`。先补RECOVERY_READY的原件采集层，未把“已有摘要”当完整恢复包，也未接收snapshotAvailable=true之类布尔输入来开放安装。新增三个内部只读函数，无公开CLI、归档写入、安装/续跑或AWS调用。

固定采集旧17+原Manifest、.env/唯一state/C4原字节、两备份unit及三外部备份文件、plans/jobs中既有64hex.json原字节，以及本次retention四份不可变材料。Runtime仍匹配旧封存归档；外部原件经原reader证明与封存源码准确相等后，使用该准确字节与外部元数据，不把单独hash当文件内容。保存九helper/独立bootstrap、三预留drop-in及两Docker完整unit原本不存在的事实。systemd原件reader拒绝任何已有drop-in，临时拒绝模板不会被当作安装前原件；采集必须发生在安装门禁写入前。

公开内部查询自行持原job→plan两锁，进入/退出核维护与未决job，刷新既定来源/工具范围，并对全组原字节、元数据、目录/清单与retention做两次稳定比较。仅返回摘要和元数据；原秘密字节仅在内部内存mapping中使用，不能直接输出/记录该mapping。原有读白名单/四材料、17及旧protected_config_snapshot固定17+5清单均未扩展，不导入九helper或目标Python。

私有plans/jobs目录固定且权限/文件单链接/nofollow严格核对；每目录最多1025项（含原锁），每文件沿MAX_FILE预算、私有内容合计16MiB、全组原件48MiB独立预算（默认与MAX_TOTAL一致）。原锁只记录元数据，不把锁当普通恢复payload复制/重建，保留原inode。任意坏权限、链接、未知成员、超限、清单/同字节换inode/晚期来源变化阻断，保留实际原件，不修复、清理或fsync。该查询不执行Docker/systemd命令、不停写或恢复业务。

仅结果INSTALLATION_RECOVERY_SOURCES_OBSERVED、scope=pre-install-original-files-only；completePrivateStateCaptured/recoveryArchiveDurable/snapshotAvailable/recoveryReady/readyToInstall/canExecute均false、requiresHostRecheck=true。尚未覆盖其余历史retention/安装事务与完整私有状态、当前完整容器/加载配置恢复材料、耐久恢复归档/读回及停写后准确Lightsail手动快照available证明。当前查询不是RECOVERY_READY，也不使已冻结事务可从文件resume。

新增18项临时真实文件模型测试：摘要无秘密/许可恒false、完整固定原字节及元数据、无写入/同步/命令、原两锁/inode、CRLF/$/$$和0400原样、私有plan按数据保存、unit原件与缺失事实、已有临时门禁拒绝、旧字节/helper冲突、同字节替换/晚期清单/来源、未知/软硬链接/坏mode/预算、原四材料及无CLI。根锚点/账户/GitHub为模型；仅Python3.10 AST、名字/方法/空白、全部原定义不变、差异及准确读回静态核对，上述18项已随本批CI在两套Release各923项中通过；真实系统验收仍OPEN。

下一步将原件采集接到同一次owned安装观察中，在写临时门禁前保留准确原件，再于已停写阶段完成私有恢复归档create-only耐久保存/读回及完整范围核对；随后绑定操作者对停写后准确Lightsail手动快照available的核验，不能自动调用AWS或据本批摘要覆盖工具。逐文件安装/永久门禁/原应用核验交接、Mac薄入口及D4统一真实隔离验收仍OPEN。三组研究继续暂停、不取消，无依赖包/业务schema或生产操作。

## D2 原保存ID受限停写（源码已合并）

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

## D2 原容器与重启策略耐久保存（源码已合并）

**2026-10-28 当前进度：D2_SAVED_WRITERS_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3031](https://github.com/sanqin888/sanqinMVP/pull/3031) head `afb7a2132318aee338fa0fb6b5a5872f42b6bc49` 经[CI #7750](https://github.com/sanqin888/sanqinMVP/actions/runs/40709444423)全绿（4成功/6范围跳过；Release默认Python与3.10各883、Runtime1080、既有C1回归412），合并dev `c1bbff97a3c28a867ec16ca29afa2053ba2f71cd`，无需CI修复；未执行生产操作。

本批从[PR #3030](https://github.com/sanqin888/sanqinMVP/pull/3030)已合并dev `39d61bda9474b9e305bd11800f8563e323ca1313` 建立 `feat/runtime-minimal-saved-writers-20261028`，续接本轮原两锁、全套新鲜观察、独占意图/marker及临时门禁有效加载。仅内部 _save_installation_writers 开启保存阶段；原意图/门禁入口默认不写新记录，无公开CLI或旧事务resume。

在本轮私有事务目录create-only耐久保存writers.json，仍为root:root 0600、nofollow/单链接、16KiB预算、完整短写、文件/目录fsync及FD/路径身份读回。准确九字段：schemaVersion=1、独立kind=sanq-minimal-executor-saved-writers、installationId、intentSha256、applicationSha、dockerEngineSha256、containers、createdAt、canExecute=false。containers准确四角色：三原写入者与db观察锚点，保存完整64位ID、imageId、原restartPolicy、restartCount、startedAt及配置/挂载摘要；原策略不被改成no。严格拒绝重复/未知字段、错时间/JSON、短ID、重ID、API/worker镜像不一致及坏策略。

记录绑定原意图准确字节。本次owned记录证明只在耐久写入/读回成功后留在当前调用栈中；namespace和退出检查只接纳该准确原件，不从已有文件导入许可。保存后重新核来源、四材料、完整宿主稳定观察、准确marker/事务/原目录及有效门禁；记录未知、晚期漂移或残件均阻断并保留，不清理、覆盖、补写或自动重放。原PRIVATE_FILES四材料、普通namespace任意事务阻断及应用唯一state权威保持。

新增纯argv构造器只允许三保存角色的固定update --restart=no及stop --time 30，目标只能取绑定记录里的完整原ID；db/任意名称/动作拒绝。该函数不执行命令，原只读及共同有界客户端仍拒绝这两类变更，尚未接入停写执行器。结果仅INSTALLATION_WRITERS_SAVED及摘要，writersFrozen/canExecute/readyToInstall/hostPreflightComplete/operationSuccessProven仍false、requiresHostRecheck=true，不是停写完成或恢复就绪证明。

新增18项完整组合/格式模型测试，覆盖原两锁/门禁先后、四原对象与策略不变、旧入口默认不写、第二次拒绝、部分写入/同步未知、保存后主机/意图/未知成员漂移、原意图摘要绑定、严格格式/角色/ID/镜像/生命周期/策略、权限及链接、纯argv限制/既有客户端拒绝、准确owned原件证明和严格开关/无CLI。临时文件/锁为真实对象，GitHub/Docker/manager/根锚点为模型；仅Python3.10 AST、名字/方法/空白及差异/准确读回静态核对，上述18项已随本批CI在两套Release各883项中通过；真实系统验收仍OPEN。

下一步将已保存原件接到受限disable-restart→stop编排，逐次新鲜身份与门禁复核、故障只尽力处理保存ID并保持FENCE_UNCONFIRMED；真实停写仍OPEN。停写后手动快照available/完整旧工具恢复实物、逐文件安装/永久门禁/旧应用核验交接、Mac薄入口与D4统一真实隔离验收仍OPEN。无17+Manifest/250/300、九helper/三永久模板、依赖包或业务schema变化；三组研究继续暂停、不取消，未执行生产/数据库写操作。

## D2 原两锁内临时门禁加载（源码已合并）

**2026-10-28 当前进度：D2_OWNED_GATE_LOAD_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

本批[PR #3030](https://github.com/sanqin888/sanqinMVP/pull/3030) 最终head `7787d5f5618e06a3172c6d068e57e55b228b5fbd` 经[CI #7748](https://github.com/sanqin888/sanqinMVP/actions/runs/40702042325)全绿（4成功/6范围跳过；Release默认Python与3.10各865、Runtime1080、既有C1回归412），合并dev `39d61bda9474b9e305bd11800f8563e323ca1313`。首轮两个坏marker模型暴露的底层JSON异常已统一为脱敏安装合同错误，证据保持/阻断规则不变；未执行生产操作。

基于已合并的[PR #3029](https://github.com/sanqin888/sanqinMVP/pull/3029) dev `38be9adcb89c800442badac54118a2c89b89b59e` 建立 `feat/runtime-minimal-owned-gate-load-20261028`。内部 _load_installation_deny_gates 只续接本轮完整新鲜观察和新写意图/marker，保持原job→plan两锁；无公开CLI、无旧事务resume。写门禁、reload及最终返回前核准确意图/marker原字节、唯一事务/维护全集、原目录身份和未决job；不接受导出dict或操作者布尔许可替代本轮观察。

三门禁create-only写入、耐久读回后，只允许固定 /usr/bin/systemctl --system daemon-reload。复用原有界进程IO主体，原只读Docker/systemd/runtime入口仍拒绝reload；共享300秒截止、单次30秒、两流合计2MiB及最小环境，失败只终止自身客户端组，不能推断manager动作被撤销。未知/非零/编码或输出异常保留意图、marker及全部门禁原件，无清理、重放或恢复业务。

reload后核准确文件/有效加载属性并重做来源、四材料与完整现场观察。systemd对比只扣除本轮准确三DropInPaths和两个拒绝pre命令，其他有效属性摘要须与原基线一致；旧backup unit原件完整身份、systemd根稳定身份及所有非本轮override目录仍核对。原只读systemd/未决job验证主体提取复用，默认行为保持。实际三门禁证明单独返回，不将对比投影冒充旧配置仍有效。

仅上述内部阶段全部通过时，installationIntent.startupFenceConfirmed=true、outcome=TEMPORARY_DENY_GATES_LOADED；writersFrozen、canExecute、readyToInstall、hostPreflightComplete、operationSuccessProven仍false，requiresHostRecheck=true。尚无安装CLI或完整安装/完成交接；本批不停止容器/daemon、不改restart策略、不覆盖Runtime或写DB。准确原ID停写前仍须保存恢复依据并新鲜复核，不能由加载摘要单独授权后续动作。

新增20项组合/真实pipe客户端模型测试，覆盖原两锁跨度、默认意图路径、部分写入、reload未知/不重放、marker/job/namespace晚变、未加载、Docker漂移、非本轮有效属性/override/backup原件变化、同字节门禁替换、原空目录身份、固定命令/环境及输出预算/超时/非root。文件/锁/pipe为真实临时对象，GitHub/Docker/manager/根锚点等为模型。仅Python3.10 AST、全局名字/方法/空白审阅、三段提取主体AST等价及准确写回核对，首轮CI #7747（head 92dabe00b059bf1ed281e9e19dd79a656348b8e8）执行865项，两个坏marker故障模型因底层JSONDecodeError未统一为安装合同错误而报错；已仅修正该错误边界，继续保留原件并阻断。修复后最终head已通过CI #7748，两套Release各865项；真实系统验收仍OPEN。

下一步接准确保存三原ID/镜像/策略、耐久恢复依据与受限停写；停写后手动快照available/完整旧工具恢复实物、逐文件安装/永久门禁/旧应用核验交接、Mac薄入口与D4统一真实隔离验收仍OPEN。17+Manifest/250/300、四材料、三永久模板、九helper及唯一应用state保持，无依赖包/业务schema变化；三组研究继续暂停、不取消，未执行现场或生产操作。

## D2 临时拒绝门禁原语（源码已合并）

**2026-10-28 当前进度：D2_TEMPORARY_GATE_PRIMITIVES_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

意图流程[PR #3028](https://github.com/sanqin888/sanqinMVP/pull/3028) head `11f3017e136dd40681f5aaa6b0213fa03e4c13a5` 经[CI #7743](https://github.com/sanqin888/sanqinMVP/actions/runs/40694971907)全绿（4成功/6范围跳过；Release默认Python与3.10各835、Runtime1080、既有C1回归412），合并dev `07b2275d59a2161c53adb5bdd0054c05d78b5662`，无CI修复；未执行生产操作。

本批[PR #3029](https://github.com/sanqin888/sanqinMVP/pull/3029) head `19bb93b4a56bf206fe3333cf7c28145903f8497d` 经[CI #7745](https://github.com/sanqin888/sanqinMVP/actions/runs/40699162830)全绿（4成功/6范围跳过；Release默认Python与3.10各845、Runtime1080、既有C1回归412），合并dev `38be9adcb89c800442badac54118a2c89b89b59e`，无CI修复；未执行生产操作。

本批从该dev建立feat/runtime-minimal-temporary-gates-20261028，新增三个固定临时拒绝模板与底层文件写入/有效加载属性校验原语。只占用/etc/systemd/system/<unit>.d/80-sanq-maintenance.conf：docker.service ExecStartPre=/usr/bin/false，sanq-backup.service ExecStartPre=+/usr/bin/false，docker.socket固定ConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json。不依赖尚未安装的目标Python，不导入九helper。

目录nofollow/root:root 0755，已有目录必须真实可信且为空；文件O_EXCL/nofollow/root:root 0644 create-only、完整短写处理、文件和目录fsync、准确字节/完整身份读回。仅对本次新建FD设定既定mode以兼容umask077，不修复已有对象；未知或已有成员、链接、权限不符阻断，任意失败保留已写文件/目录，不覆盖、删除或自动重试。新读原语不扩展原17成员清单或通用读取白名单。

独立加载核对先读三文件、读取原白名单固定systemctl show属性，再读文件比较。须loaded、NeedDaemonReload=no、唯一准确DropInPaths和既定vendor/backup FragmentPath；服务pre命令唯一/usr/bin/false且ignore_errors=no，socket仅触发docker.service。只返回文件/属性摘要与denyGatePropertiesObserved=true；startupFenceConfirmed/canExecute仍false。固定socket条件模板与loaded路径被核对，但本原语尚未核本次安装marker/意图和全部宿主上下文，不能单独证明围栏。

这批写原语还没有主机编排或公开CLI调用，调用方必须另行在原两锁内确认准确安装意图/marker及全部原基线；本批不执行daemon-reload、不调用stop/start/restart、不改容器策略，也未把文件写入接到意图准备入口。下一批才接明确受限的reload、原锁内准确marker绑定、有效加载复核与失败保持，全部已知成功之前不能停业务或覆盖工具。

新增10项临时目录/manager模型测试：准确三文件/加载摘要与许可恒false、umask077、本次文件不覆盖、未知成员/坏mode/目录链接、同步失败、零写进展残件、未加载/需reload/额外drop-in/错fragment、忽略失败/多命令/错socket目标、属性观察中原件变化、非root/未知unit/无CLI。真实文件与fsync，root/系统根和manager为模型；仅Python3.10 AST、全局名字/方法/空白、既有函数定义不变及准确读回，上述10项已随本批CI在两套Release各845项中通过；真实系统验收仍OPEN。

三永久drop-in合同保持，临时模板不得通过永久_installed_gate。原17+Manifest/250/300、两锁/四材料、唯一应用state保持；无新依赖包/持久化记录格式/业务schema/公开CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner。准确保存ID停写、停写后快照available/恢复实物、逐文件安装/交接、Mac入口与统一真实隔离验收仍OPEN。三组研究继续暂停、不取消；未执行生产预检或安装。

## D2 原两锁内意图与marker写入（源码已合并）

**2026-10-28 当前进度：D2_INSTALL_INTENT_FLOW_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

事务目录批[PR #3027](https://github.com/sanqin888/sanqinMVP/pull/3027) head `16a4a2628695219348522bcd47cee24cf84c7d49` 经[CI #7741](https://github.com/sanqin888/sanqinMVP/actions/runs/40693801613)全绿（4成功/6范围跳过；Release默认Python与3.10各825、Runtime1080、既有C1回归412），合并dev `51d8e345f27d3bf9cbd8b0f0488b1fa772cc811d`，无CI修复；未执行生产操作。

本批从该dev建立feat/runtime-minimal-intent-flow-20261028，新增内部_record_installation_intent续接完整主机观察。必须启用全部原预检阶段且保持原job→plan两锁，不从文件导入观察dict，不以caller授权布尔值替代观察；普通只读入口默认不写记录。记录入口无公开CLI，仅源码/模型中的内部安装准备阶段，完整安装就绪及实际执行仍待后续门禁。

完整双读通过后，固定state重开FD必须与原锁目录身份一致，显式建立/核对空installation-runs根；本次ID由内部32随机字节生成，不由调用者指定。exclusive建立0700事务目录、同步及读回；自行重做原来源、现场稳定结果、四材料及维护空闲复核后，构造绑定retention/准确新旧Runtime来源与本轮观察摘要的无执行权意图，create-only耐久保存。意图已知耐久后再做同一组新鲜复核，核准确原意图/空维护，再create-only写独立kind marker；两原件摘要互绑、原目录身份和维护全集均读回，未知结果保留，不删除、重试、补造或续跑。

namespace原查询默认仍拒绝任何条目；仅本次新建的owned事务分支在退出时允许准确一个ID目录及其中唯一intent.json，并严格重读原件，其他事务/成员仍阻断。marker写入成功后不再调用要求maintenance为空的普通材料检查，而是核唯一active.json与意图互绑；同锁流程结束前再次读marker，保留原锁inode。

结果为INSTALLATION_INTENT_RECORDED及摘要，canExecute/readyToInstall/hostPreflightComplete/operationSuccessProven仍false，startupFenceConfirmed/writersFrozen=false、requiresHostRecheck=true。意图与marker落盘不证明临时拒绝门禁有效，更不证明已停写；尚不安装drop-in、不reload/停启服务、不改restart策略或工具/state/DB。源码具备这个内部写阶段不代表本次已在生产执行，也不授权从其他入口绕过未决事务。

新增10项完整组合模型测试：同锁新鲜观察后准确成对记录/许可恒false、第二次尝试保留原件、两次写持原两锁、部分意图不写marker、部分marker保留耐久意图、意图后AutoRemove漂移阻断marker、晚期维护保留、namespace同步失败保留、未知事务阻断及旧只读入口/严格前置/无CLI。临时文件/目录/锁为真实对象，外部Docker/SQL/Node/HTTP/GitHub/根身份等仍为模型；仅Python3.10 AST、静态名字/方法/空白、改动定义范围与写回检查，项目测试待CI，不把825当本批结果。

下一步核该内部写流程的CI与剩余故障边界，再接三固定临时拒绝门禁的受限安装/有效加载核对。真实解释器/Compose/DB连接、美元往返、完整耗时/限流与系统中断验收仍OPEN；准确保存ID停写、手动快照available/恢复实物、逐文件工具安装/交接、Mac薄入口仍按原D2–D4继续。无新依赖包/九helper导入/公开CLI/业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、原两锁/四材料及三永久门禁保持。三组研究继续暂停、不取消；未执行生产预检或安装。

## D2 固定安装事务namespace（源码已合并）

**2026-10-28 当前进度：D2_INSTALLATION_NAMESPACE_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

意图原语[PR #3026](https://github.com/sanqin888/sanqinMVP/pull/3026) head `261d4f2305d6d89f8e45c982baf323ea98a5cbf7` 经[CI #7739](https://github.com/sanqin888/sanqinMVP/actions/runs/40689597233)全绿（4成功/6范围跳过；Release默认Python与3.10各815、Runtime1080、既有C1回归412），合并dev `db4e29d6b55fd5905c00b46d81fcf3dded042e9f`，无CI修复；未执行生产操作。

本批从该dev建立feat/runtime-minimal-installation-namespace-20261028，新增内部固定installation-runs目录检查/创建。入口自行获取原job→plan两锁，进入前后核原未决job/维护空闲，再经固定可信锚点打开deploy-state；不接受用户路径或已导出的观察dict。默认只读查询缺失目录，严格bool create才允许在原目录父FD下mkdir 0700；创建前核5GiB加记录预算，目录与父目录fsync、读前后owner/group/mode与FD/路径身份核对。已有坏权限、链接、替换或同步未知不修复/删除。

在原锁内两次扫描事务目录，有界最多1024项；任意条目（准确hex名空目录也包括在内）都视为未决/未知而阻断，不解析成成功或自动补意图。目录缺失查询中晚出现、原目录被替换、晚期条目或维护残件都阻断并保留。只有空的固定namespace允许观察成功，结果仍canExecute/readyToInstall/operationSuccessProven=false、requiresHostRecheck=true；namespaceCreated不等于安装事务或门禁成功。

本批仅创建/核对事务根目录，不创建每次installationId目录、不写intent/marker、不开放CLI，也未将新namespace扫描接到既有所有材料/主机入口；不能声称已阻断所有其他操作。意图→marker仍须在后续固定写入编排中取得同锁新鲜主机观察并明确就绪条件，不能从本批namespace结果推导写入许可。保留原记录原语/全部既有函数定义及PRIVATE_FILES四项。

新增10项临时目录/原OS锁模型测试：缺失查询无写同步、新建与已有空目录权限/inode及许可恒false、坏mode/链接不修、任意事务残件保留、原两锁跨度/inode保持、晚期条目、目录fsync失败保留、低容量与晚期维护、目录替换、旧四材料不变/严格开关/无CLI。固定锚点/root/容量为模型；仅Python3.10 AST、静态名字/方法/空白、既有函数不变和准确读回，项目测试待CI，不把815当本批结果。

下一步继续每次事务目录与未决事务门禁的接入，再完成原两锁下新鲜预检→意图耐久→marker耐久编排及故障测试，之后接临时拒绝门禁。当前完整安装就绪、恢复实物、准确原ID停写/停写后快照available、逐文件安装/完成交接、Mac入口与统一真实隔离验收仍OPEN。无新依赖包/九helper导入/业务schema/公开CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、原两锁/四材料与三永久门禁保持。三组研究继续暂停、不取消；未执行生产预检或安装。

## D2 意图记录格式与耐久原语（源码已合并）

**2026-10-28 当前进度：D2_INTENT_RECORD_PRIMITIVES_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**

安装意图合同[PR #3025](https://github.com/sanqin888/sanqinMVP/pull/3025) head `810a7768e81e840e0441a133f9f8073c9496525a` 经[CI #7737](https://github.com/sanqin888/sanqinMVP/actions/runs/40687640526)成功（scope成功，其余9项范围跳过，未运行项目测试），合并dev `c3cb1f8a91de32f39be4159306f364793b72176d`。

本批从该dev建立feat/runtime-minimal-intent-records-20261028，实现合同的格式与底层耐久写入原语。意图准确九字段、marker准确四字段，均为sanq-minimal-executor-install-intent独立kind/严格整数schemaVersion=1、准确installationId/摘要/来源SHA，意图canExecute严格false，createdAt为有界精度UTC Z时间。拒绝未知/重复字段、非有限JSON、bool冒充整数、非规范原字节和超16KiB记录；marker摘要必须绑定原意图规范字节。

新增仅内部使用的FD读写原语，只允许intent.json/active.json，不扩PRIVATE_FILES或原四材料格式。写要求root及已核0700私有目录FD，O_EXCL/nofollow/0600 create-only；完整处理短写，文件fsync、目录fsync、准确读回并保持打开FD核原路径身份/元数据，失败只关闭FD，保留空/部分/完整残件，不unlink、截断、重放或清marker。读要求普通单链接0600、大小/FD与路径完整身份稳定和严格字节格式。

这只是记录原语：不创建installation-runs namespace，不核原两锁或新鲜主机事实，不保证marker之前已有耐久intent，也不把调用者数据当安装权限。当前没有任何公开CLI/主机编排调用这些写原语。后续必须用固定路径编排在原两锁内自行取得新鲜观察、完成意图耐久后才允许marker写入；不能直接将此底层函数当安装入口。整体hostPreflightComplete/readyToInstall/canExecute等原许可保持false，不写应用state或受保护工具。

新增12项临时目录/FD模型测试：规范格式与相互绑定、字段/类型/身份/摘要/UTC边界、重复/非规范/超限/非有限JSON、错意图摘要、create-only/模式/inode、短写与零进展、部分写异常、文件或目录fsync失败、读回失败/晚期权限变化、软硬链接/FIFO/坏权限、非root/坏目录/任意名称拒绝及无新CLI/四材料不变。真实临时文件和fsync，root身份/属主为模型；未运行项目测试，仅Python3.10 AST、静态名字/方法钩子/空白、原所有函数定义不变和写回核对，项目结果待CI。

下一批接固定installation-runs目录、未决事务扫描与原两锁下的意图→marker耐久编排，补目录创建/锁竞争/新鲜来源晚变及半记录保持；之后接临时拒绝门禁。该后续编排与主机执行就绪仍OPEN，不能据本批写原语成功宣称安装围栏已生效。无新依赖包/九helper导入/公开CLI/业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、原两锁/四材料和三永久门禁保持。三组研究继续暂停、不取消；未执行生产预检、安装、备份或数据库操作。

## D2 安装意图记录合同（已合并）

**2026-10-28 当前进度：D2_INSTALL_INTENT_CONTRACT_MERGED_DEV / DOCUMENTATION_ONLY / NOT_INSTALLED。**

2026-10-28 续接：PR #3024已合并；补齐中断时未同步的运行手册并核对六份文档。首次安装不假定guard或socket条件已部署/加载，marker存在本身不证明已阻断启动；只有临时拒绝门禁确认有效加载后才能进入停写。该合同批已通过PR #3025合并dev。

预检C组合批[PR #3024](https://github.com/sanqin888/sanqinMVP/pull/3024) head `cb1e1c38d972ed61d255333cc6191d7fb6f9ed88` 经[CI #7735](https://github.com/sanqin888/sanqinMVP/actions/runs/40595181934)全绿（4成功/6范围跳过；Release默认Python与3.10各803、Runtime1080、既有C1回归412），合并dev `8722324be77795ea5f9d0acbc4935b99cf68c0cd`，无CI修复。原批LOCAL/未运行描述仅为当时审阅状态；未执行现场预检或安装。

本批基于该dev建立docs/runtime-minimal-install-intent-contract-20261027，完成下一阶段安装意图记录合同。A/B/组合C的模型与CI证据已齐，但现场解释器/Node/Compose/DB连接、真实美元往返、完整运行耗时/限流、恢复实物与D4系统中断验证仍OPEN；hostPreflightComplete/readyToInstall不翻转。可继续实现安装执行器源码及故障模型，不等于允许生产写入。

选择独立/opt/sanq/deploy-state/installation-runs/<installationId>/保存安装事务记录，不扩展installations/<retentionId>/原四份不可变材料。意图先以create-only耐久保存并读回，再以独立kind的maintenance/active.json绑定准确意图摘要；临时拒绝门禁有效加载前不停止业务、不改策略、不覆盖工具。完整字段、顺序和中断规则见交付合同新节。

本批只更新六份文档，无代码/测试/依赖/CLI/持久化实现变化；新namespace/意图格式均为待实现合同。下一批实现意图与marker的严格格式、受限耐久写入及每个中断边界的模型，随后接临时拒绝门禁。调用者不能用导出的观察dict或布尔值授权写入，既有假值不被改成真值来绕过就绪。恢复实物、准确保存ID停写、停写后手动快照available、逐文件安装/完成交接、Mac薄入口及统一真实隔离验收仍OPEN。

无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner或项目测试；固定17+Manifest/250/300、九helper、原私有四文件/两锁及三永久门禁保持，三组研究继续暂停、不取消。仅作源码/合同审阅，未执行生产操作。

## D2 预检C组合回归（源码已合并）

**2026-10-27 当前进度：D2_COMBINED_PREFLIGHT_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

预检B[PR #3023](https://github.com/sanqin888/sanqinMVP/pull/3023) head `802e6610927b042917ebf80f96afd625a2a2c403` 经[CI #7733](https://github.com/sanqin888/sanqinMVP/actions/runs/40592294258)全绿（4成功/6范围跳过；Release默认Python与3.10各795、Runtime1080、既有C1回归412），合并dev `741448bc9c039ed553c67e5b7e68d793a83b5f9e`，无CI修复；未执行现场预检或安装。

本批从该dev建立test/runtime-minimal-combined-preflight-20261027，开始C组合回归与合同收口。新增8项组合测试，沿已有D1材料/root文件模型建立完整原件、配置、Docker/systemd/文件/资源、环境网络、迁移库存/Git/历史、有效端口health和外部备份观察。临时文件/目录/锁为真实对象；外部Docker/manager/SQL/Node/HTTP/GitHub/账户和锚点为模型。迁移阶段本身不再整体替换，接固定库存命令的模型结果与Git原始blob模型并执行实际Python校验。

覆盖全阶段成功仍无安装许可/无写同步、实际命令接线持原两锁、全局两遍共4次库存模型读取、外部同字节替换、AutoRemove晚变、迁移中历史改变、晚期维护marker保留、最终来源复核失败及严格开关。只审阅Python3.10 AST/静态名字/重复方法与写回，不运行项目测试。新增测试尚待CI，不把795计成本批结果。本批无生产Python/命令/格式/许可变化；A/B源码虽已合并，C尚未通过自身CI，不宣称闭环已完成。

预检责任核对：17/Manifest与材料来源、原配置和唯一发布state、容器/挂载/网络/环境、systemd有效配置、备份gzip与资源、固定HTTP就绪、迁移Git/历史及外部备份原件均已有只读源码路径和分项模型；本批补组合关系。applicationConfigurationObserved/hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute等仍false。databaseLoginVerified=false表示未独立以应用凭据登录，fullApplicationConfigurationProven=false表示未证明全部可选配置；不能只凭局部字段或模型成功消除这些边界。现场系统组合、真实Compose美元往返、DB连接行为、运行时权限及恢复材料均待统一隔离验收，仍不允许现场写入。

性能/范围核对：源码结构每次完整观察含两轮迁移阶段、每阶段内部两遍，因此库存命令共4次，Git原件也随各遍重读；实际HTTP请求总量取决于库存条目与原D1来源请求，未测得完整生产墙钟/限流结果。命令共享300s预算不等于整个网络/文件预检有硬300s上限。不虚报性能验证，也不为此恢复暂停的来源/可信时间研究；如后续优化，仅考虑本次观察内不可变准确对象，不缓存最新CI/主机成功资格。

下一步先由CI验证这批组合测试并根据日志修正，再据最终源码完成C的未证明项清单和安装意图记录合同；不得直接把本批模型当readyToInstall。新安装kind/journal、临时拒绝门禁、停写/手动快照available/完整恢复实物、逐文件安装/交接、Mac薄入口和D4统一真实隔离验收仍OPEN。无新依赖包/九helper导入/持久化格式/CLI/业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、私有四文件和三永久门禁保持。三组研究继续暂停、不取消。

## D2 预检B外部备份实物绑定（源码已合并）

**2026-10-27 当前进度：D2_EXTERNAL_BACKUP_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

预检A[PR #3022](https://github.com/sanqin888/sanqinMVP/pull/3022) head `d7166403fd668b0183fb2b83d3399f8660c2ebe2` 经[CI #7731](https://github.com/sanqin888/sanqinMVP/actions/runs/40591551676)全绿（4成功/6范围跳过；Release默认Python与3.10各787、Runtime1080、既有C1回归412），合并dev `2a4f70b62ca7441b137e9adab953e2cc70a69b88`，无CI修复。原批LOCAL/未运行说明为当时状态；仍未执行生产预检或安装。

本批从该dev建立feat/runtime-minimal-external-backup-20261027，实现审计B。固定读取/home/ubuntu/backup-db.sh、/usr/local/sbin/sanq-backup-protected-nginx及/etc/sudoers.d/sanq-backup，原字节分别绑定本轮已核旧封存Runtime的ops/backup对应成员，不扩大原17清单。逐层目录FD nofollow，普通root父目录及ubuntu用户目录按各自owner/group、无组/其他写和特殊权限核对，进入/退出核路径与FD稳定身份；不把ubuntu主脚本改成root所有。

文件nofollow/非阻塞打开，必须普通单链接、非空且≤原MAX_FILE，主脚本ubuntu:ubuntu 0750、helper root:root 0755、sudoers root:root 0440，沿既有安装合同检查而非修改。完整有界读取后核FD/原路径的dev/inode/大小/mtime/ctime/owner/gid/mode/link一致，再逐字比较封存源；相同字节换inode也拒绝。只返回固定路径、源成员、SHA256/大小/身份与目录身份，不输出脚本正文。

新增严格bool include_external_backup，要求全部前置直到effective_configuration；内部_observe_installed_external_backup在原两锁/全局双读中核三文件，旧接口不触发。仅externalBackupExecutablesObserved=true及摘要，backupExecutionVerified/restoreProven=false，整体hostPreflightComplete/applicationConfigurationObserved/readyToInstall/canExecute等继续false。未执行脚本、sudo、rclone、备份或恢复，不自动修权限/装文件/清残件；有界文件读取不扩称独立硬时间上限或现场备份成功。

新增8项临时真实文件模型测试：三原件准确摘要/无执行写入、逐文件权限与字节、不存在/软硬链接/FIFO、父目录写权限/链接、账户身份、读取中同字节替换、空/大小预算及前置开关/无CLI。root锚点与账户为模型，未运行项目测试；仅Python3.10 AST、全局名字/方法/空白审阅和准确写回核对，不把787当本批通过。完整阶段组合与真实系统验证留C/D4。

A已合并、B源码已通过PR #3023合并dev；下一步C做组合故障回归、逐项核预检合同并明确未证明项，不直接翻转整体完成许可。之后按既定顺序进入安装意图/临时拒绝门禁及恢复实物/停写快照、逐文件安装/交接、Mac入口和统一真实隔离验收。无新依赖包/九helper导入/持久化格式/公开CLI或业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、私有四文件及三永久门禁保持。三组研究继续暂停、不取消；未执行生产操作。

## D2 预检A有效容器配置（源码已合并）

**2026-10-27 当前进度：D2_EFFECTIVE_CONFIGURATION_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

审计文档[PR #3021](https://github.com/sanqin888/sanqinMVP/pull/3021) head `8d6ea058fcfc525b832845de105c7aec645a462c` 经[CI #7729](https://github.com/sanqin888/sanqinMVP/actions/runs/40590497085)成功（仅scope成功，其余9项范围跳过，未运行项目测试），合并dev `1fa95bbc7253a3a7ca0278207b410e97e13b8898`。

本批从该dev建立feat/runtime-minimal-effective-configuration-20261027，实现审计A的端口/healthcheck/AutoRemove只读核对。固定角色只允许127.0.0.1上的同号TCP端口：API4000/5555、worker4001、web3000、DB5432；Compose ports、HostConfig.PortBindings与NetworkSettings.Ports的实际发布项逐项一致，拒绝缺多/重复/公开地址/UDP或错端口。镜像暴露但未发布的Ports=null不当成对外端口，不生成端口修复。

保存完整容器ID/image/config摘要重新核对，AutoRemove/PublishAllPorts/Privileged须严格false。healthcheck从已观察image默认值合并Compose准确覆盖，核Test/Interval/Timeout/Retries/StartPeriod/StartInterval及类型；禁止disable/NONE/未知字段，显式时长只接受整数ns/us/ms/s/m/h，非支持格式阻断不猜测。Compose导出test中的美元按原规则只解码一次，实际/image默认不改；不执行healthcheck命令或改容器。

新严格bool include_effective_configuration要求此前直到migrations全部启用，内部_observe_installed_effective_configuration在原两锁/同截止/全局双读内调用新阶段；旧入口默认不调用。结果仅effectiveContainerConfigurationObserved=true与各角色端口/health摘要及保存ID，applicationConfigurationObserved/hostPreflightComplete/readyToInstall/canExecute等整体许可继续false。当前明确依赖的HostConfig检查为原restart策略、实际挂载/网络与解析覆盖、Privileged，加本批AutoRemove/PublishAllPorts/PortBindings；并不声称已比较所有Docker可选HostConfig字段或证明全应用配置。

新增8项离线Docker模型测试：合法摘要/输入不变、自动删除/自动发布/提权、缺多/公开/不一致实际端口、Compose端口/协议/重复、health命令/时长/整数类型/disable漂移、美元一次解码与未发布端口、保存config与时长格式、旧入口/前置开关/无CLI。仅Python3.10 AST、全局名字/方法/空白审阅及准确读回，项目测试待CI。组合全阶段故障与真实Compose导出差异留C/D4，不将模型等同真实Docker验收。

A源码已通过PR #3022合并dev；下一批B补外部备份脚本/helper/sudoers绑定，之后C统一组合及预检合同收口。安装意图、临时拒绝门禁、完整恢复实物与准确停写/快照、逐文件安装/交接、Mac入口和统一真实隔离验收仍OPEN。无新依赖包/九helper导入/持久化格式/公开CLI或业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、私有四文件及三永久门禁保持，三组研究继续暂停、不取消。未执行现场预检或生产安装。

## D2 剩余预检缺口审计（已合并）

**2026-10-27 当前进度：D2_PREFLIGHT_GAP_AUDIT_MERGED_DEV / DOCUMENTATION_ONLY / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

原两锁迁移接线批[PR #3020](https://github.com/sanqin888/sanqinMVP/pull/3020) head `e4d1dd8dc333832d605dc757d2db60de99d8b831` 经[CI #7727](https://github.com/sanqin888/sanqinMVP/actions/runs/40589684080)全绿（4成功/6范围跳过；Release默认Python与3.10各779项、Runtime1080、既有C1回归412），合并dev `6a1e423bcf4b0c1f74c6937d5a60cb6638ed0653`；无CI修复，未执行现场预检或安装。

本批基于该dev，在docs/runtime-minimal-preflight-gap-audit-20261027完成剩余预检源码审计。结论：现有来源/17原件/私有材料/环境/挂载/网络/资源/备份gzip/systemd/迁移观察已接线，但完整有效应用配置和外部备份执行文件绑定仍未齐全，不能将hostPreflightComplete、applicationConfigurationObserved或readyToInstall改为true。审计仅静态事实，无生产故障判断。

后续只读预检收敛为三批：A补端口/healthcheck/AutoRemove及保存身份漂移；B补固定外部备份脚本/helper/sudoers原件与旧封存源码绑定；C统一组合回归并逐条核对预检合同，明确真实隔离验收边界，再进入既定安装意图/临时拒绝门禁。完整表及退出条件见交付合同本节。不能仅因本地测试条目增加或多个观察flag为true而宣布预检完成。

本批只更新六份文档；无代码/测试/依赖/业务schema/持久化格式/CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner或项目测试。三组研究继续暂停、不取消；固定17+Manifest/250/300、九helper、私有四文件和三永久门禁不变。所有安装写入、准确原ID停写、手动快照available/恢复实物、Mac入口、统一真实隔离验收与生产交付仍OPEN。

## D2 迁移观察接入原两锁（源码已合并）

**2026-10-27 当前进度：D2_LOCKED_MIGRATIONS_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

库存/历史双读批[PR #3019](https://github.com/sanqin888/sanqinMVP/pull/3019) head `05ff70bd564a16004e9e78754a6e5d6d6a1b0919` 经[CI #7725](https://github.com/sanqin888/sanqinMVP/actions/runs/40589019392)全绿（4成功/6范围跳过；Release默认Python与3.10各771、Runtime1080、既有C1回归412），合并dev `cb42cd20cd3f16a061372456df246e9438573e02`，无CI修复；未执行生产预检或安装。旧批LOCAL/未运行描述仅为当时审阅状态。

本批从该dev建立feat/runtime-minimal-locked-migrations-20261027。将已实现的迁移库存/历史/Git来源双读接入原_observe_installed_runtime：新增严格bool include_migrations，必须启用全部既有阶段直到application_binding；新内部_observe_installed_migrations只打开这些开关。当前SHA取自本轮原配置观察，保存容器与镜像pair取自本轮Docker，DB身份/历史摘要取自本轮prerequisites，命令沿同一monotonic deadline与原最小环境。两次全局观察均在原job/plan两锁内执行该阶段，比较完整稳定结果，并保留前后材料/来源/原文件与维护空闲复核。

仅迁移分支成功时返回databaseMigrationParityProven/applicationReleaseAuthenticated=true与摘要，不改旧接口默认行为；整体hostPreflightComplete/installedBaselineObserved/applicationConfigurationObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven继续false、requiresHostRecheck=true。迁移阶段自身双读与全局双读共同覆盖来源/库存/历史中途变化，不产生持久化批准或新应用版本权威；失败直接保留实际证据，不写marker或恢复业务。完整主机预检仍部分完成，不能据此安装。

新增8项组合模型测试：两次接线/权限恒false、原两锁跨度、全局迁移摘要漂移、晚期维护marker保留、来源失败传播、旧接口不触发新阶段、前置开关/严格bool和无公开CLI。依赖已合并的独立采集模型，组合测试中的迁移阶段为替身，不能当真实Docker/DB/Node/PID1验收。仅Python3.10 AST、全局名字/方法钩子、差异及读回检查；项目测试待CI，不把771当本批通过。

下一步按合同审计剩余有效配置/主机预检缺口，收口后进入安装意图与临时拒绝门禁；恢复实物/准确原ID停写/快照available、逐文件安装与交接、D3 Mac薄入口和D4统一真实隔离验收仍OPEN。无新依赖包/九helper导入/CLI/持久化格式变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner。仅原观察主体接线加一内部包装，采集/来源/命令等全部其他已有函数保持；固定17+Manifest/250/300、私有四文件/三永久门禁不变。三组研究继续暂停、不取消；无业务schema/迁移或生产操作。

## D2 当前迁移库存与历史双读（源码已合并）

**2026-10-27 当前进度：D2_MIGRATION_SNAPSHOT_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

Git对象批[PR #3018](https://github.com/sanqin888/sanqinMVP/pull/3018) head `9a18df2983674e03e714ae8f66482e09cfea5536` 经[CI #7723](https://github.com/sanqin888/sanqinMVP/actions/runs/40587929409)全绿，合并dev `eb17c43f29ceff3622cff50451b1137433916f65`；无CI修复，未安装。原批LOCAL/未运行描述保留为当时审阅状态。

本批分支feat/runtime-minimal-migration-snapshot-20261027。新增固定保存API完整ID的docker exec读取命令，用/usr/bin/env -i清空NODE_OPTIONS/NODE_PATH等环境、固定PATH与/usr/local/bin/node --eval，只调用fs/crypto读取/app/apps/api/prisma/migrations普通SQL原字节，沿原collector的10000项/单项2MiB/合计64MiB预算。固定脚本无Prisma/npx/依赖安装或应用模块加载，不创建新容器；只扩运行前置白名单的准确形态，原Docker通用白名单仍拒绝exec。

内部_installation_migration_snapshot重复两次：准确当前SHA的最新main CI/成对发布证明须匹配传入的已保存镜像pair；读取保存API ID的完整库存、保存DB ID的原固定只读SQL，DB身份和完整历史摘要必须与前置观察一致，再调用Git对象/全量已应用判定。两次库存/历史/Git摘要或发布证明变化阻断，只输出摘要/来源/容器身份，不返回SQL或历史正文。局部结果databaseMigrationParityProven/applicationReleaseAuthenticated=true只表示该函数在调用者给定已保存Docker/前置事实下的关系成立；canExecute=false/requiresHostRecheck=true，不构成可复用安装许可。

该函数尚未接入原两锁覆盖的完整主机观察入口，调用者仍须负责锁、当前应用SHA和容器基线的前后重核；因此整体hostPreflightComplete/readyToInstall等仍未关闭。下一步将此阶段接入原全局双读，再审计剩余预检缺口后进入安装意图/临时拒绝门禁。未实际执行容器命令、数据库查询或生产安装。

新增8项模型测试覆盖双读与保存ID、固定命令/环境/任意脚本拒绝、DB身份/历史/ID晚变、发布SHA/pair不一致、第二次历史/来源漂移、来源失败及坏ID/任意exec拒绝。仅Python3.10 AST/静态名字/方法核对，项目测试待CI。无新依赖包、九helper导入、持久化/CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；仅原运行前置命令白名单接线，其余已有函数保持。固定17+Manifest/250/300、私有四文件与三永久门禁保持。三组研究继续暂停、不取消；完整恢复材料、真实安装、Mac入口及统一隔离验收仍OPEN。

## D2 迁移Git对象绑定（源码已合并）

**2026-10-27 当前进度：D2_MIGRATION_GIT_SOURCE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

迁移纯判定批[PR #3017](https://github.com/sanqin888/sanqinMVP/pull/3017) head `904142b98c9a617b7d10d69010e928abc5493a78` 经[CI #7721](https://github.com/sanqin888/sanqinMVP/actions/runs/40587343957)全绿（4成功/6范围跳过；Release默认Python与3.10各755、Runtime1080、既有C1回归412），合并dev `a1a9a3d04d7210c87e05775b2863f3b446bfcb4d`，无CI修复。原批LOCAL/未运行文字为当时审阅状态，尚未安装。

本批从该dev建立feat/runtime-minimal-migration-source-20261027，新增独立bootstrap内部_installation_migration_source。先复用完整迁移输入一致性判定，再读取准确SHA的Git commit与完整非截断tree（最多100000项），拒绝重复路径、坏名称、链接/非普通blob/坏大小；全部migration.sql的Git blob身份和大小必须与输入库存集合准确相等。逐项读取base64原始blob，核encoding/字段/预算、原大小、Git SHA1及SHA256，拒绝库存自报摘要或遗漏/额外SQL。沿既有单项2MiB/总64MiB及10000项库存预算，不解析/执行SQL，不导入九helper。

只返回原一致性摘要、sourceSha/treeSha与gitMigrationObjectsMatched=true；applicationReleaseAuthenticated/databaseMigrationParityProven/canExecute仍false、requiresHostRecheck=true。此接口只把给定库存/历史与准确Git对象绑定，尚未采集当前镜像或现场DB，也未把调用者提供的SHA当成当前应用版本证明。下一步仍须接保存的当前API容器库存读取、当前成对镜像来源及DB历史双读；完整预检、安装意图/临时拒绝门禁、恢复实物、Mac入口与真实隔离验收仍OPEN。

新增8项模型测试：准确对象/无正文或执行许可、commit/tree错绑/截断/缺失、重复路径/SQL多缺、链接/嵌套名/大小/身份、blob字段/编码/原字节、伪SHA256、历史未决先阻断及SHA/tree项预算。仅Python3.10 AST、静态名字/方法检查和写回核对，项目测试待CI，不把755当本批通过。无依赖包/持久化格式/CLI/既有函数修改，无业务schema或生产操作；依赖图/12上下文owner/SCC/债务基线无变化，未重跑scanner。固定17+Manifest/250/300、九helper及三永久门禁保持；三组研究继续暂停、不取消。

## D2 迁移一致性纯判定（源码已合并）

**2026-10-27 当前进度：D2_MIGRATION_CONSISTENCY_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

应用环境/网络批已由[PR #3016](https://github.com/sanqin888/sanqinMVP/pull/3016) head `03b3cb2f23cb255d66e15f7d123a2779a2c53e98` 经[CI #7719](https://github.com/sanqin888/sanqinMVP/actions/runs/40586796836)全绿（4成功/6范围跳过，Release默认Python与3.10各745项、Runtime1080、既有C1回归412），合并dev `7f67c9d3da56e3559c08dd44403bb79f7db0cfcc`；未执行生产安装。

本批分支feat/runtime-minimal-migration-consistency-20261027。新增bootstrap内部纯函数_installation_migration_consistency：库存要求非空、名称唯一有序、准确四字段、严格整数大小/两种摘要、最多10000项/单项2MiB/合计64MiB；历史最多20000项，保留完整顺序和rolled-back重复尝试，拒绝failed/未知字段、缺失/修改/重复applied。所有库存迁移必须已应用，首次工具安装不接受普通发布允许的待执行前缀。rolled-back尝试只保留历史，不计为已应用，不因历史残留推断兼容性。

结果只返回输入摘要/计数与inputConsistencyObserved=true，databaseMigrationParityProven=false/canExecute=false/requiresHostRecheck=true。本函数未接入现场观察，不新增命令、Docker exec、CLI或持久化记录；模型输入自洽不证明来自当前镜像、Git或数据库。下一步仍须将准确当前镜像库存、完整Git对象与已有只读历史双读绑定，再收口剩余预检及安装意图/临时拒绝门禁。

新增10项测试覆盖完整输入/摘要/不变性、待执行迁移、缺失修改重复应用、rolled-back保留、坏历史/库存、排序与字段、大小/计数/总预算及历史顺序摘要。仅Python3.10 AST与静态名字审阅，项目测试待CI；未运行生产命令。原全部函数定义/安装许可保持，无新增依赖包或九helper导入、无12上下文所有权/SCC/债务/依赖图基线变化，未重跑scanner。固定17+Manifest/250/300、私有四文件及三永久门禁保持；三组研究继续暂停，不取消。安装、恢复材料、Mac入口与统一真实隔离验收仍OPEN。

## D2 应用环境与数据库网络目标核对（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_APPLICATION_BINDING_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增四容器有效环境与保存DB网络目标的只读比较，接原双锁、来源和主机双读；已通过PR #3016合并dev。

运行环境/就绪前置批已由[PR #3015](https://github.com/sanqin888/sanqinMVP/pull/3015) 最终head `bfe2517c464c68cdbec872871636f3232d051d3b` 经 [CI #7717](https://github.com/sanqin888/sanqinMVP/actions/runs/40584486112) SUCCESS（4成功/6范围跳过；默认Python与CPython3.10的Release各725，Runtime1080，准确CPython3.12.15既有回归412），无CI修复，合并dev `11deb05597f79b736b2a3a99f5509579a886878c`。下文该批原LOCAL/未运行描述保留为原审阅时点；此证据不代表现场安装或真实隔离验收。

内部_observe_installed_application_binding要求原configuration/Docker/systemd/filesystem/prerequisites全部启用且开关严格bool，旧接口不触发新观察。在原两锁内，两次分别重读固定Compose JSON、已保存完整四容器ID与其image ID，逐项核既有renderedCompose/config/mount摘要与身份后比较；本批唯一新增Docker读取是固定sanq-app_default network inspect，仍用原300s共享monotonic命令截止/单次30s/2MiB及最小环境客户端，无connect/disconnect或任意network参数。

每容器Env为有界唯一KEY=value列表，值保留首个等号后的全部内容；镜像Config.Env默认值合并Compose environment覆盖后，与容器实际Config.Env完整映射相等，缺、多、改、重复键、空赋值缺separator/NUL/坏类型阻断。仅对Compose config JSON的environment值核美元成对后解码$$→$一次；镜像默认与实际Env不解码，原文件/Compose JSON/创建配置均不改。未配对美元阻断而非猜测；正常空字符串和多行值按原样比较。此为模型规则，真实Compose美元往返仍留D4。

DB环境须非空POSTGRES_USER/POSTGRES_PASSWORD、POSTGRES_DB=sanqin_db和PGDATA=/var/lib/postgresql/data；API/worker的DATABASE_URL必须逐字一致，解析后只允许postgresql、db:5432/sanqin_db、无额外query/fragment/控制空白、合法百分号编码，凭据仅解码一次后与保存DB环境相同。web API_UPSTREAM只允许http://api:4000。不把DB环境中的初始凭据当成数据库当前凭据的证明，不进行远程探测或登录写入。

固定网络须本地bridge/default IPAM、项目/default标签、非internal/ingress/IPv6、无额外网络选项；网络Containers全集准确等于保存四ID。核共同64位network ID与独立endpoint ID、IPv4/subnet/prefix/gateway、网络视图和容器视图一致及地址唯一；每容器只有该网络，无HostConfig DNS/搜索/hosts/links覆盖，准确服务alias存在且db/api不得被其他角色占用。未知拓扑原样阻断，不改现网来迎合。结果只给每角色环境SHA256/条目数、DB容器ID及稳定网络身份/端点，不回显环境、URL、凭据或stderr；两次有效网络身份变化仍阻断。

仅新增containerEnvironmentObserved/databaseConnectionTargetObserved=true及摘要；applicationConfigurationObserved/hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven继续false，requiresHostRecheck=true。databaseLoginVerified/databaseMigrationParityProven/fullApplicationConfigurationProven=false：环境与网络目标一致不等于实际使用这些凭据登录、完整应用配置或迁移库存/历史一致。

新增20项离线模型测试，覆盖组合只读/摘要脱敏、$/$$准确一次比较与原件不变、坏Env/重复键/超额清单、每角色实际环境漂移、镜像默认与Compose覆盖、DB必填/本地URL/编码凭据、API-worker不一致/web上游、网络身份/额外端点/主机DNS或hosts/别名歧义、地址/前缀/gateway/IPv6/IPAM、保存ID/config/mount/image晚变、两次合法网络替换、原两锁和晚期维护、旧接口默认不查询/严格开关/无新CLI及固定网络读取白名单与失败。仅静态Python3.10 AST、全局名字/重复方法/unittest.run钩子/空白和差异/读回；项目测试待CI，不把725当本批测试通过。所有Docker/systemd/GitHub/SQL/HTTP/root为模型，未执行现场检查或安装。

归Runtime/Ops独立bootstrap内部原子新增观察能力，不涉及持久化/外部合同迁移；仅新增标准库ipaddress/urllib.parse使用，无依赖清单变更、九helper导入、反向依赖或第二版本权威。已审阅无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。66个既有函数/类定义保持，仅原观察主体加可选分支、Docker白名单多一个固定network inspect；固定17+Manifest/250/300、九helper/三drop-in、私有四文件和公开pack/verify/plan保持。

下一步核当前镜像迁移库存与Git准确对象/数据库历史一致，并收口剩余有效配置和主机预检；之后进入安装意图/临时拒绝门禁。准确原ID停写、手动快照available及完整恢复实物、逐文件安装/交接、D3 Mac薄入口与D4统一真实隔离验收/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、DB写入或生产安装。

## D2 运行环境与就绪/DB只读前置（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_RUNTIME_PREREQUISITES_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增运行环境、固定就绪地址和绑定原DB容器ID的只读历史观察，沿原两锁与来源/文件/Docker/systemd/备份双读；不运行迁移、生成依赖或写安装意图。

备份/宿主目录批已由[PR #3014](https://github.com/sanqin888/sanqinMVP/pull/3014) 最终head `f44df660676c6586d9bfd0de04091f492bdf6ef5` 经 [CI #7715](https://github.com/sanqin888/sanqinMVP/actions/runs/40581035319) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各705、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `a7b461dd8594c8c4497dbc7bf510380b55bd99bc`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或真实隔离验收。

内部_observe_installed_prerequisites仅打开原观察主体严格bool前置开关，必须同时启用既有filesystem及其前置，默认原观察接口保持。固定/proc/meminfo普通root文件、有界64KiB读取，MemAvailable须唯一且≥512MiB；只返回门槛满足，不将正常可用字节变化列为基线漂移。固定/usr/bin/python3 -I -S -B -c仅import json/sys并输出版本/实现/路径/platform，要求CPython 3.10+且3.x、Linux、固定executable、准确字段与整数版本；不加载site/材料或现役Python。这里只观察系统解释器版本，systemPythonProvenanceAuthenticated=false，不恢复自建CPython/依赖证明研究。

新增独立运行前置命令白名单，复用原有界客户端，不放宽原Docker通用读取白名单。唯一docker exec采用本次Docker观察保存的64位DB容器ID，容器内固定/bin/sh -c调用/usr/bin/env -i，仅保留固定PATH/PGCONNECT_TIMEOUT与引号中的原POSTGRES_USER；psql -X -w固定本地/var/run/postgresql:5432、sanqin_db和固定SQL，不能改SQL/容器别名、访问任意exec或发起迁移。SQL为BEGIN READ ONLY、事务内5s statement/2s lock超时，只SELECT数据库名/端口/data_directory/PG15版本/恢复状态/transaction_read_only及最多20001行迁移历史投影，再COMMIT；验证目标身份、非恢复、只读on，历史必须1至20000行且name/64位checksum/完成状态完整，无failed/进行中。不删除rolled-back或重复行，不推断迁移兼容性。

就绪观察仅六个原合同固定GET地址：API 4000、worker 4001、web 3000与sanq.ca的health、API ready、public menu。固定curl --disable禁用curlrc、禁继承代理/自定参数、限制http/https与3s连接/10s总时，响应正文丢弃至/dev/null，只输出状态码且必须准确200，不跟随redirect、不附令牌或改URL。所有子进程仍原300s共享monotonic命令/文件截止、单次30s、stdout/stderr合计2MiB和最小环境，失败仅终止自身客户端组，不操作容器/服务；来源网络规则沿原D1，不扩称全安装被硬限300s。

两次观察比较稳定Python信息、内存门槛、已保存DB ID/身份、迁移投影的完整有序摘要/行数/rolled-back数量及六地址状态；重复历史保留计数，checksum/状态、解释器版本、来源或维护残件晚变阻断。不返回历史正文、SQL业务数据、HTTP正文或stderr。psql前通过固定本地socket和清空PG环境避免把PGHOST/PGSERVICE等继承值当现场数据库，不调用npx/Prisma迁移或依赖安装命令。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅runtimePrerequisitesObserved/databaseHistoryObserved/readinessEndpointsObserved=true及稳定摘要。databaseMigrationParityProven=false、systemPythonProvenanceAuthenticated=false；hostPreflightComplete/installedBaselineObserved/c4StorageObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven及backupRestoreProven仍false、requiresHostRecheck=true。历史完成和HTTP 200不证明当前镜像完整迁移库存与数据库准确一致，也不替代当前应用配置/数据库连接绑定、完整来源或安装意图。预检只读项仍待收口，不生成可复用批准记录/第二版本权威。

新增20项离线模型测试：原锁下组合无写同步/正文不输出/权限恒false、系统Python实现/版本/字段、DB名/端口/目录/版本/只读/恢复状态、失败/空/坏/超限历史、rolled-back和重复行摘要、六地址准确200/无跳转、SQL参数本地socket/清空环境/只读边界与保存ID、任意SQL/exec/URL拒绝、坏JSON/重复/非有限值、两次历史或Python变化、原两锁与晚期维护/来源、默认接口不读前置/严格开关/无CLI、临时内存输入的缺失/歧义/低值/预算与正常波动、固定Python隔离参数、共享真实pipe客户端不继承DB/Python/proxy环境及命令失败。Docker/systemd/GitHub/SQL/HTTP/Python/root/anchor为模型，未实际查询生产或运行项目测试；仅Python3.10 AST、静态名字/重复方法/unittest钩子、60个原定义不变及两处接线、差异/准确读回，不把前批705作为本批结果。

归Runtime/Ops独立bootstrap只读主机预检，无新依赖包/常规helper/反向导入/第二版本权威，未导入九helper、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原观察函数加可选前置分支，原共用客户端仅新增固定前置命令类别，其余60个既有函数/类保持；固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式和CLI不变。

下一步对齐当前镜像迁移库存/历史、有效应用配置与DB连接绑定等剩余预检合同，完成只读主机预检收口后接安装意图/临时拒绝门禁。准确原ID停写、手动快照available与完整恢复实物、逐文件安装/成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、现场预检或生产操作。

## D2 备份与宿主目录只读核对（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_BACKUP_FILESYSTEM_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增宿主固定目录、部署磁盘余量及最新本地DB备份的只读核对，沿原两锁和来源/源码/配置/Docker/systemd双读；不备份、恢复、复制业务数据或写安装意图。

systemd预检批已由[PR #3013](https://github.com/sanqin888/sanqinMVP/pull/3013) 最终head `359a1c22400a222f90facbe78480dee914c425ae` 经 [CI #7713](https://github.com/sanqin888/sanqinMVP/actions/runs/40578976996) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各685、Runtime1080、准确CPython3.12.15回归412），无本批CI修复，合并dev `fbbee891fba9820f31f3cf1d859d745286ee49f3`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或真实隔离验收。

内部_observe_installed_filesystem只通过原观察主体的严格bool开关启用，要求原配置/Docker/systemd观察同时存在，默认原接口不读取业务目录/备份。固定从/逐层nofollow目录FD打开/srv、/srv/sanq、uploads/backups及/home、/home/ubuntu、sanq-assets/sounds，核真实目录、root或ubuntu祖先UID/GID、无组/其他写和特殊权限位，backups须ubuntu:ubuntu 0700。uploads/sounds按既有无其他写合同核目录，其实际owner/gid只保存为事实，不擅自chown或宣称无其他writer。每层核读前后FD与原路径inode/owner/gid/mode，部署/opt/sanq所在文件系统须余量至少5GiB；余量只报告门槛满足和设备，不把正常剩余字节波动当身份漂移。

备份目录最多4096项，匹配原sanqin_db_YYYYMMDD_HHMMSS.sql.gz合同，按mtime/ns与名称稳定选最新；最新缺失/坏类型/链接/权限/内容不回退选旧成功。原件nofollow/非阻塞打开，普通单链接、固定ubuntu UID/GID和0400/0600，非空压缩大小≤1GiB。用本机墙钟核0至26h时效，分块完整SHA256原压缩字节，再完整读取gzip（含多member、CRC/末尾错误），非空展开总量≤4GiB；沿原300s monotonic截止逐块检查并结束前重核时效。文件/目录清单读前后完整身份/mtime/ctime必须一致，读取中替换或新备份出现阻断，不改原件、不执行SQL、不生成新备份。时效仅本机时间检查，不恢复可信时间研究或证明跨克隆时间。

全局两次观察还比较最新备份原字节摘要/完整身份与宿主目录稳定身份；相同字节换文件inode、挂载目录被替换或维护/来源晚变仍阻断。目录仅核身份/权限，不递归盘点uploads/sounds，正常营业新增文件不因目录mtime变化被误判替换，也不宣称目录内容已快照。只返回固定路径/元数据、备份名称/摘要/字节数，不返回SQL正文或复制数据。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增hostPersistentDirectoriesObserved/backupIntegrityObserved=true及filesystem摘要；backupRestoreProven=false，内部restoreProven=false。hostPreflightComplete/installedBaselineObserved/c4StorageObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。gzip完整和26h时效不等于SQL可恢复、全量VM恢复、DB业务一致性或AWS快照available；DB卷的Docker绑定观察不扩称宿主卷inode/全部C4证明。内存/系统Python与剩余就绪/DB只读前置尚未完成，观察结果不持久化成安装票据或第二版本权威。

新增20项离线模型测试：原两锁下组合只读/无写同步/秘密不输出、最新选择与坏最新不回退、旧/未来/缺备份、截断/坏CRC/空payload/尾部损坏、多gzip member完整摘要、压缩/展开/目录项预算、同名目录/FIFO/软硬链接、私有权限/只读/owner/gid、root/ubuntu/data目录权限与缺失/链接不修复、低磁盘、正常上传及余量波动不致误报、起始/块间monotonic耗尽、同字节备份替换/读中新清单、两次目录替换、原锁与晚期维护保留、默认路径不读数据/严格开关/无CLI及固定根元数据。临时真实文件/gzip/目录/锁，Docker/systemd/GitHub/root/anchor/容量为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法/unittest钩子、55个既有定义不变及唯一观察函数接线、差异/准确读回，不把前批685当本批通过。

归Runtime/Ops独立bootstrap只读文件预检，复用标准库gzip/hash/FD与原来源和锁方向，不导入九helper或执行现役/目标Python；无新依赖包/常规helper/反向导入/第二版本权威或12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式和CLI保持，原观察函数仅加可选filesystem分支，其余55个既有函数/类定义不变。

下一步补本机运行环境/内存及剩余就绪与DB只读前置，完成主机预检收口后接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移或现场生产操作。

## D2 systemd有效配置与原件只读核对（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_SYSTEMD_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部systemd初次安装预检，沿原两锁、来源/源码/配置/Docker双读流程，核四个有效unit、未决reload/override和旧备份unit实物；没有安装/重载/停启服务或维护marker写入。

Docker/挂载批已由[PR #3012](https://github.com/sanqin888/sanqinMVP/pull/3012) 最终head `f20ede98945ae6ea2f740804f389d59410b7ac9c` 经 [CI #7711](https://github.com/sanqin888/sanqinMVP/actions/runs/40577327857) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各664、Runtime1080、准确CPython3.12.15回归412），合并dev `ca0507f522a6bb10f982f0e0e9746a6d902a62fc`。首次CI #7710因测试夹具run覆盖unittest.TestCase.run而中断；同分支仅将模拟方法及引用改名observe_command，生产代码/门禁未放宽。下文原LOCAL/未运行或修复待核仅为原审阅时点，仍未安装/真实隔离验收。

内部_observe_installed_systemd要求同时启用原配置/Docker采集，严格bool开关，默认已有文件/Docker观察不查询systemd。只允许/usr/bin/systemctl --system show固定docker.service、docker.socket、sanq-backup.service、sanq-backup.timer及固定属性全集；拒绝任意unit/属性/远端参数、daemon-reload/stop/start。原Docker客户端提取为共同有界只读客户端，保留原流读取/超时/仅结束自身CLI组主体与最小环境，systemd不继承DBUS_SYSTEM_BUS_ADDRESS/SYSTEMD_HOST等跳转。共用原300s Docker/manager命令截止、单次30s、stdout/stderr合计2MiB；每份show另核64KiB、准确键全集、无重复/未知/缺失键，原始命令属性只摘要，不回显。

有效unit必须loaded、NeedDaemonReload=no、无任何已加载DropInPaths且非masked/未知enable状态。Docker fragment只接受原/lib或/usr/lib的vendor路径别名，backup两unit只接受/etc/systemd/system固定原路径，其他完整override拒绝；Docker service active/running，socket active/listening且只触发docker.service。备份service须inactive/dead、ubuntu用户/默认或ubuntu组、0077/oneshot、准确无忽略失败的/home/ubuntu/backup-db.sh单一启动命令，无额外pre/post/stop-post；timer须active/waiting或inactive/dead且只触发sanq-backup.service。读取状态不证明当前维护门禁已加载。

固定/etc/systemd/system逐层root-owned/root-group、无组/其他写或特殊权限位及nofollow目录FD。旧sanq-backup.service/.timer须普通单链接root文件、有界读与完整FD/路径元数据重核；service字节必须等于旧已封存Runtime的原成员，timer原字节/元数据只观察摘要，不补造来源。拒绝本地docker.service/.socket文件（含悬空链接），四unit .d、service.d/socket.d/timer.d及sanq-前缀目录必须不存在或真实可信空目录；任何未知文件、预留80-sanq-maintenance.conf或部分残件原样保留并阻断。读loaded属性前后都重读磁盘原件和目录身份，全局两次观察再比较稳定unit属性摘要；相同字节换inode、目录或有效unit状态变化仍阻断。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增systemdObserved=true及四unit稳定属性/摘要、两备份unit原件摘要和预留门禁不存在的事实；maintenanceGatesLoaded/backupIntegrityObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。vendorUnitBytesAuthenticated/backupTimerSourceAuthenticated=false：只观察加载路径/属性及本地timer实物，未扩展到OS来源研究或宣称timer有封存Git来源。尚未核备份gzip/时效、宿主挂载目录/资源及剩余就绪/DB项，不把unit空闲当成停写/快照或恢复就绪证明。

新增21项离线模型测试，使用临时真实root模型文件/目录及原锁，覆盖组合只读/无写同步、vendor路径别名和空闲timer、load/reload/masked/未知loaded drop-in、完整override、Docker稳定状态与socket触发目标、忙碌backup与timer错误、有效用户/组/UMask/Type/单一命令/hooks、属性重复/缺失/未知/预算、service旧归档字节匹配、缺失/链接/硬链接/权限、三预留或其他/类型级/前缀drop-in残件与可信空目录、悬空本地Docker override、同字节替换/两次有效状态漂移、原两锁跨度与晚期维护、默认路径不查询systemd、严格开关/读白名单/无新CLI、固定anchor走向/元数据及共享真实pipe客户端最小环境。systemd/Docker/GitHub/root/固定anchor为模型，未实际调用管理器或运行项目测试；仅Python3.10 AST、静态名字/重复方法/禁止覆盖unittest.run钩子、43个既有定义不变、root读取主体及有界客户端主体AST等价、差异/准确读回，不把前批664当本批通过。

归Runtime/Ops独立bootstrap只读主机预检，无新依赖包/常规helper/反向导入/第二版本权威、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原root文件读取提取共用主体、原Docker客户端提取共用主体并仅扩固定读取命令分派，原观察函数加可选systemd分支，其余43个既有函数/类保持；不导入九helper或执行现役/材料Python。固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式及CLI不变；timer仅外部现役观察，不加入原17或变成第18成员。

下一步接备份完整性/26h时效、宿主uploads/sounds/backup目录实物与资源及剩余就绪/DB只读项；全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、现场预检或生产操作。

## D2 Docker/Compose与实际挂载只读核对（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_DOCKER_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部Docker/Compose只读观察，在原两锁与来源/源码/配置双读流程内，核当前四容器角色、健康和完整身份、实际应用镜像封存digest/OCI revision，以及DB卷和持久挂载。没有安装入口、维护意图或生产操作。

本批首次[CI #7710](https://github.com/sanqin888/sanqinMVP/actions/runs/40577015596) 在默认Python离线Release套件发现测试夹具将模拟Docker方法命名run，覆盖unittest.TestCase.run，套件于该类前中断。同分支仅将夹具方法及引用改为observe_command，生产代码/门禁不变；最终修复head与CI #7711/合并记录见上文；原待核仅为修复提交前时点，不把640或静态检查当本批通过。

配置原件核对批已由[PR #3011](https://github.com/sanqin888/sanqinMVP/pull/3011) 最终head `2c785b95396dfe88bff45840f8e3d95bb6f378b3` 经 [CI #7708](https://github.com/sanqin888/sanqinMVP/actions/runs/40575133829) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各640、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `12f3f840387229a22adf62035f486bcb63ae36e4`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或完成真实隔离验收。

内部_observe_installed_docker只打开原观察主体的严格bool Docker/config开关；默认两种文件观察均不调用Docker。固定/usr/bin/docker --host unix:///var/run/docker.sock，白名单仅info、固定项目Compose config --environment/JSON、项目ps全量完整ID、准确容器/image ID inspect及原sanq-app_pgdata volume inspect；不能run/create/start/stop/pull/exec/build或传入任意命令/端点。拒绝继承的Docker端点覆盖，子进程仅固定最小PATH/LANG/本地endpoint环境，不转发GitHub令牌/环境SHA或秘密，不用shell。原状态锁跨度保持。Docker命令共享300s monotonic截止、单次至多30s；selectors并发读取stdout/stderr、合计2MiB上限，失败/超时只结束自身只读CLI进程组，不操作业务容器，stderr不回显。来源网络读取仍沿原D1规则，不宣称全部安装预检被300s全程硬限。

核本地Linux/amd64引擎且live-restore=false、Swarm inactive；Compose项目/准确四服务/所需非空环境和应用SHA，展开内容仅摘要、不重写$/$$。当前应用独立准确paired seal核实际API/web image ID、RepoDigests及OCI revision，容器允许当前tag或该准确digest声明，API与worker实际image ID一致。项目所有容器含已停止对象必须恰好api/ubereats-worker/web/db四角色，完整ID唯一且inspect相同，均稳定running/healthy、无paused/restarting/dead/privileged；核原restart策略及on-failure计数、实际命令/entrypoint与准确展开配置或已观察镜像默认值。DB只核已有对象/镜像ID及postgres:15-alpine声明，不额外宣称其来源证明。

原sanq-app_pgdata须local driver/scope、无额外驱动选项、准确项目/卷标签和引擎卷路径；DB挂载须该卷与对应Source、固定数据目标及RW=true。API/worker仅原/srv/sanq/uploads读写bind，web仅原sounds路径只读bind；错误/额外挂载拒绝。双读比较准确容器/镜像ID、策略、restartCount/StartedAt、配置/挂载/展开内容/卷摘要、稳定引擎身份与当前seal；不比较正常变化的健康检查日志。容器或来源晚变、额外对象和维护残件阻断，不自动重试/清理记录。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅containersObserved/composeExpansionObserved/containerMountsObserved/currentImagePairBound=true并返回稳定观察/摘要；applicationConfigurationObserved/applicationReleaseAuthenticated/c4StorageObserved/systemdObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。当前镜像仅沿原paired seal绑定，不等于全套当前main/CI/就绪证明；未核容器环境与Compose美元插值完整等价，未核宿主路径实物/资源/备份/systemd/SQL历史或公共就绪。返回结果不是第二版本权威、恢复包、停写证明或安装票据。

新增24项离线模型测试，覆盖锁内组合及秘密不输出/无写同步、当前digest声明、engine/live-restore/swarm/platform、Compose必要环境/重复/SHA/角色与镜像、额外/缺失/短/重复ID、错role/project/ID、健康/运行/privileged、实际digest/revision/image平台、API/worker同image、命令/策略、挂载目标/源/RW/额外对象、卷选项/身份、忽略健康日志但比较lifetime、双读健康替换、原两锁与晚期维护/paired seal变化、重复/非有限JSON与预算、默认文件路径不读Docker/严格开关和无CLI；客户端用真实可丢弃pipe/selectors、Popen/clock/root模型核白名单、最小环境、端点拒绝、输出超限/错误/编码/超时与仅kill自身CLI组。Docker/GitHub及固定anchor为模型，没有运行真实Docker/systemd/SSH或测试项目；仅Python3.10 AST、静态名字/重复方法、40个原定义不变及原观察函数接线审阅、差异/准确读回，不把前批640计作本批通过。

归Runtime/Ops独立bootstrap只读主机采集，增加selectors/signal/subprocess/time标准库；不导入九helper或执行现役/材料Python，无新常规helper/反向导入/第二版本权威、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in、D1/四私有材料格式及CLI保持，只有原观察函数加可选Docker分支，其他40个既有函数/类定义保持。

下一步补systemd有效units/override和原三外部文件事实、备份完整性/新鲜度、宿主挂载目录与资源及剩余就绪/DB只读项，全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无新依赖包/业务schema/迁移或现场生产操作。

## D2 配置原件只读核对（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_CONFIGURATION_FILES_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部配置原件只读观察：与原17源码核对共用原job/计划锁和来源前后复核，新增.env、唯一发布state及C4标记的原字节/元数据一致性检查。只返回摘要，不写安装意图、不安装或停服务。

现役Runtime源码核对批已由[PR #3010](https://github.com/sanqin888/sanqinMVP/pull/3010) 最终head `0824f2a0e14c956673903ae911f24a252b23de07` 经 [CI #7706](https://github.com/sanqin888/sanqinMVP/actions/runs/40573749428) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各620、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `b5bdddf4dba5fe0ee06ef781619c32b03d559093`。下文该批原LOCAL/未运行仅为原审阅时点，仍未现场安装或真实隔离验收。

内部_observe_installed_configuration仅通过原_observe_installed_runtime的严格bool内部配置开关，复用原来源、完整17/Manifest双读、材料读回、空维护/finished jobs及原两锁；默认源码观察仍不读取配置。固定真实Runtime根下仅三个白名单文件，nofollow/非阻塞FD，有界读取并核前后FD/路径完整身份。按固定ubuntu账户UID/GID核.env、按root:root核唯一state，均普通单链接且0400/0600；C4标记沿原root-owned无其他写及正确内容合同。缺失、链接/硬链接、错权限/owner/gid或读中变化阻断，不修复。

环境文件原字节保持LF/CRLF、引用、密码及$/$$；不执行dotenv/shell、不扩展Compose或重新转义值。SANQ_IMAGE_SHA要求原controller的唯一裸准确SHA行，重复/export/缩进别名、NUL/孤立CR和坏编码拒绝。唯一state严格六字段、整数schema=1、active/readiness-verified或rolled-back/rollback-verified、准确current/previous及UTC时间格式，current须与.env一致；pending/未知/错完成原因不从.env修复。接受旧controller的+00:00与新Z格式，时间格式检查不证明可信时间。Runtime来源SHA与应用current独立，无第二份current/previous权威。

配置与源码在同一原两锁内经来源刷新前后双读，原字节、inode、权限、账户身份变化均阻断，即使.env/state同时变成另一组相互一致值也不能沿用旧观察。结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅增加configurationFilesObserved=true及三个文件摘要/元数据、state中的应用SHA/phase；不返回原秘密、state正文或完整环境。applicationConfigurationObserved/composeExpansionObserved/applicationReleaseAuthenticated/c4StorageObserved/containersObserved/systemdObserved、installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven均false、requiresHostRecheck=true。C4标记内容正确不等于真实卷/目录已验证，观察结果不持久保存为安装许可/恢复包。

新增20项离线模型测试：三版本身份独立与秘密不输出/无写同步、原CRLF/$/$$不变、rolled-back与两种UTC、环境重复/别名/引用/坏编码、配置缺失及无修复、state未决/不一致/坏整数/原因/时间/缺字段/重复键、C4内容、私有权限/只读/特殊位、三文件链接/硬链接、ubuntu账户/owner/gid、空/超限、同字节替换及一致配置成组变化、读中秘密变化、原锁跨度与竞争、晚期来源/维护残件、默认源码观察不读配置、严格bool与无新CLI/任意路径。临时真实文件与锁，GitHub/账户/anchor/root为模型；项目测试未运行，仅Python3.10 AST、静态名字/重复方法、37个既有定义不变及唯一观察函数接线审阅、差异/准确读回核对，不把前批620用作本批结果。

归Runtime/Ops独立bootstrap文件观察，仅新增标准库pwd依赖；不加载现役/材料Python、不导入九helper，无新常规helper/反向导入/第二版本权威或12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in、D1/私有四文件格式及CLI保持；原_observe_installed_runtime复用主体，仅加内部可选配置双读，其他37个既有函数/类定义保持。

下一步接真实Docker/Compose展开、容器完整ID/镜像/挂载、备份与systemd/本机环境的只读预检；全部前置完成后再写安装意图并加载临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离及生产材料仍OPEN。三组研究继续暂停、不取消；本批无依赖包/业务schema/迁移变更、实际主机预检或生产操作。

## D2 现役Runtime源码只读核对（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_INSTALLED_RUNTIME_OBSERVATION_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部只读现役源码核对：持原job/计划锁，刷新保留材料的来源与工具差异，逐字节核现役17+Manifest并重读身份。仅首次工具安装基线，已有九辅助件或Runtime目录内bootstrap（含悬空链接）要求另审，不覆盖；尚无主机安装或root CLI。

D2私有材料交接批已由[PR #3009](https://github.com/sanqin888/sanqinMVP/pull/3009) 最终head `078306e9e0dda594d283ee133129027c5832f4c8` 经 [CI #7704](https://github.com/sanqin888/sanqinMVP/actions/runs/40570561979) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各600、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `6f2378f23bfb80192f8f4f965daefccee98f8d4d`。下文原LOCAL/未运行仅为该批原审阅时点；源码CI不代表安装或真实隔离验收。

内部_observe_installed_runtime只接受已保留的准确retention-id，在原两锁下拒绝维护残件及未完结job；重新认证旧归档/目标kit、准确来源和受保护差异。固定/opt/sanq/runtime真实目录，逐层nofollow目录FD、root:root及无组其他写/特殊权限位；17成员和runtime-release.json均普通单链接、有界读取、核owner/gid/mode与读前后FD/路径身份，原17逐字节等于旧已封存归档，Manifest严格无重复键且规范值含整数类型一致，允许原JSON排版并单列实际原字节摘要。全程不执行/import现役或目标Python。来源刷新后第二次读完整文件/目录身份，再核私有材料及空维护/finished jobs；同字节换inode、并发变化或来源失效亦阻断，不写修复或完成记录。

结果仅INSTALLED_RUNTIME_FILES_OBSERVED、installedRuntimeFilesObserved=true；installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。旧Runtime sourceSha独立于当前应用SHA；不读取.env/唯一state/C4、不观察Docker/DB/挂载/备份/systemd或宣布无override。三drop-in原件/缺失事实仍待系统预检，九辅助件不存在只是初次安装冲突检查，不能充作完整恢复包或安装票据。函数只返回摘要/元数据，不保存或清理记录，不新建目录、不fsync、不停服务。

新增20项离线模型测试，临时真实文件/目录/锁覆盖旧17逐项变更、目标字节冒充旧字节、Manifest错值/布尔/重复键及原排版、缺失/超限/空文件、目录/文件/悬空链接和硬链接、权限/owner/gid/root、已有辅助件/安装器冲突、同字节换inode/读中改写/目录换位、晚期来源/保留原件/维护/job变化、两原锁覆盖及竞争、缺失身份不建目录、无写入/同步和无CLI。GitHub/root身份与固定anchor为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法、原函数等价及差异/读回核对，不将前批600用作本批结果。

本批归Runtime/Ops独立bootstrap只读文件观察，沿installer→原D1来源校验/标准库FD方向；不导入九helper、无新常规helper/反向导入/第二版本权威、无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九helper/三永久drop-in及D1/D2私有材料格式不变，D1 CLI与原私有材料函数主体保持。

下一步补.env/唯一state/C4、实际容器完整ID/镜像/挂载/备份及systemd/本机运行环境预检，全部前置满足后才接安装意图/临时拒绝门禁；后续准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离和生产材料仍OPEN。三组研究继续暂停、不取消；无依赖/业务schema/迁移、现场预检或生产操作。

## D2 私有材料交接（2026-10-27，源码已合并）

**2026-10-27 当前进度：D2_PRIVATE_MATERIALS_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**独立installer新增内部root私有材料交接与只读观察：复制前后重新核D1来源/工具差异，在固定状态树持原job/计划锁，create-only保存材料包、旧Runtime原归档及准确保留记录，逐文件同步/读回。无root交接CLI、主机安装入口、维护marker或units变更。

D1材料与只读核验批已由[PR #3008](https://github.com/sanqin888/sanqinMVP/pull/3008) 最终head `3bef681194eaa49868eb20bc6190af25fbf9d973` 经 [CI #7702](https://github.com/sanqin888/sanqinMVP/actions/runs/40566184983) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各574、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `40aaf51b17eb738266990a9b8e5e230448164e90`。原LOCAL/未运行是原审阅时点；仍未安装/真实隔离验收。

仅由独立审阅bootstrap的内部_retain_verified_materials调用，先重新验证准确kit/原归档/主线与工具差异，再检查固定/opt/sanq逐层owner/gid/无组其他写和nofollow目录FD。仅对缺失的deploy-state及jobs/plans/maintenance/installations建root:root 0700；已有类型/权限不符拒绝，不修复。写前按目标文件系统保留5GiB加最大32MiB材料与元数据空间，低空间不新建；只读查询不因空间不足被禁止。原jobs/.release.lock→plans/.prepare.lock非阻塞加锁、核同inode、同步并始终保留锁文件。维护任意残件、未完结/坏job或竞争阻断；已完成READY/BLOCKED原件按原格式核对保留。

私有材料按内容身份存/opt/sanq/deploy-state/installations/<64位retention-id>/，固定四文件retaining.json、delivery-kit.tar.gz、current-runtime-archive.tar.gz、retained.json均root:root 0600/单链接。先耐久保留意图和两份输入，锁内再读来源、重核空维护/finished jobs，最后写MATERIALS_RETAINED；每项O_EXCL、完整写入、文件/目录fsync及准确读回，未知不删残件、不覆盖或重试。该意图仅指材料复制，不是maintenance/active.json或安装许可；只读_inspect_private_materials重读完整材料/规范hash记录并刷新来源，即使看见完成记录也只返PRIVATE_MATERIALS_OBSERVED、operationSuccessProven=false。

保留记录绑定的是提供的旧Runtime原归档来源，不是主机当前应用或已安装版本；requiresHostRecheck=true，hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction均false。root私有复制不执行/import材料中代码，不观察或修改.env/state/原17/容器/DB，不宣称维护或停写生效。D1 pack/verify/plan的函数及CLI主体保持，仅增加内部材料函数；不会从用户可写staging提权执行目标代码。

新增26项离线模型测试，覆盖真实临时私有目录/文件/元数据/fsync与原两个OS锁及inode、root拒绝/源失败/差异超范围、低磁盘、坏权限/owner/gid/目录或文件链接、维护/job残件、原生成器READY/BLOCKED互通、未完结/错schema/时钟/错误码job、竞争/重复不可覆盖、短写/复制未知/最终记录未知/来源晚变、规范记录或材料篡改、只读查询不清其他维护/不自动建目录及无root/apply CLI；固定真实anchor走向为系统调用模型，GitHub/容量/root身份亦为模型。实际/opt/sanq、目标VM、systemd/Docker/SSH/SIGKILL及恢复未执行。仅Python3.10 AST、静态名字/重复方法、D1原函数等价和差异/读回核对，项目测试未运行，不把前批574当本批结果。

归Runtime/Ops独立bootstrap私有交接，沿installer→原D1来源核验和标准库FD/flock方向；不导入九辅助件，原job格式仅独立只读识别，无新版本权威/helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。固定17+Manifest/250/300、九常规helper/三永久drop-in、D1材料格式保持，新增权限面只在源码中，未现场安装或授权生产执行。

本批仅D2第一段私有材料交接，不代表D2安装器完成。下一步在独立bootstrap内接现役主机只读预检，再接安装意图/临时拒绝门禁、准确原ID停写/手动快照available、旧工具恢复实物及逐文件安装/成功交接；D3 Mac薄入口、D4统一真实隔离与生产材料仍OPEN。无依赖/业务schema/迁移或生产操作；三组研究继续暂停、不取消。

## D1 惰性材料与只读核验（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / HOST_INSTALL_NOT_IMPLEMENTED / NOT_INSTALLED。**新增独立交付工具ops/release/install_minimal_executor.py，仅pack/verify/plan。复用原17归档封存、准确main/CI/发布及固定Git对象，惰性材料含原归档、17+9+bootstrap共27份源码和三固定模板；重新核验来源后只输出材料/差异观察，所有安装/执行权限标志false。

交付合同已由[PR #3007](https://github.com/sanqin888/sanqinMVP/pull/3007) 最终head `5a703b4b4a309731f68a913ef42a271049eadd85` 经 [CI #7700](https://github.com/sanqin888/sanqinMVP/actions/runs/40562348239) SUCCESS（仅ci-change-scope成功，其余9作业按文档范围跳过；无Release/Runtime测试重跑），无CI修复，合并dev `43d270d0e6d290a95eaa2732918edcbec040c906`。文档合并不代表installer或生产验证完成。

D1由独立审阅的bootstrap运行，不import/exec材料包内Python。先核同准确S的最新main CI/成对seal及历史归档独立摘要/同publish，再另核Manifest原ciRunId的准确main/push成功；原CI与后续成功重跑ID分别报告。完整commit/tree/blob逐路径核27份普通文件及SHA1 Git对象/大小/SHA256，拒绝截断树、错对象和缺件；原17字节还须与已封存归档一致。源码获取后重新读来源，变化阻断。三drop-in采用固定文本，并以AST核已验guard常量语法，不求值或加载目标代码。

传输kit固定32个普通文件成员（原归档1、源码27、模板3、delivery.json 1），规范清单仅作清点，不能自证来源。拒绝多缺/重复/链接/路径绕行/PAX或sparse等非预期成员、坏JSON及篡改；压缩20MiB、展开总量48MiB，单源码2MiB/原归档12MiB/清单64KiB上限。verify重新从可信GitHub核全部字节，不采信包内hash。pack只由非root CLI向安全的操作者目录create-only写0600材料，拒绝生产/系统路径；同步或读回未知保留实物，不覆盖/重试。verify/plan只读材料/来源，无生产目录/状态/units变更。

plan只比较提供的旧/新已验Runtime归档，要求准确主线方向；首次仅两个部署源差异在已定范围，其余列NEEDS_PLATFORM_REVIEW。它不读取现役VM或宣称旧归档等于已安装字节，installedBaselineObserved=false、requiresHostRecheck=true，Manifest摘要明确是规范JSON摘要；readyToInstall/canExecute/authorizedToMutateProduction始终false。不能将计划作为后续安装票据。

新增30项离线模型测试，覆盖确定性材料/17+9+bootstrap与三模板、实际checkout清单/guard语法一致、原CI与最新CI、封存晚期漂移、错/重包归档、严格Manifest整数/重复键、Git树/普通文件/完整blob/350个无关文件、模板变化、自洽篡改kit无效、多缺/重复/路径/链接与预算、差异范围/工具降级拒绝、0600/create-only/链接/不安全父目录/生产路径/同步未知，以及CLI只路由材料、拒绝root pack和install/apply/execute、错误脱敏。GitHub/CI为替身，临时文件实物；未访问实际网络/容器/DB/管理器。仅Python3.10 AST、静态名字/重复方法/空白/guard常量语法与差异读回核对，项目测试未运行，不把前批544或CI #7700作为本批测试结果。

独立交付工具归Runtime/Ops材料清点与只读核验，依赖已审阅build_bundle/versioned_release_contract/release_contract，不导入九辅助件，不由task导入或自更新。未修改既有执行主体、Bundle/schema/CI/publish/权限，无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。

D1本地源码尚未远端交付；D2主机安装、独立bootstrap root落地/临时门禁/恢复材料/逐文件交接、D3 Mac薄入口、D4统一真实隔离验收及生产材料仍OPEN。当前打包器来自操作者独立审阅的bootstrap，材料包不能认证正在运行的验证器自身；后续root阶段必须重新验真，不能提权运行用户staging。17+Manifest、250/300旧guard、九常规helper/三永久drop-in数量保持，无新依赖/业务schema/迁移或生产操作，三组研究继续暂停、不取消。 详细输入/接口见[工具交付合同及D1](Runtime最小执行器工具交付与安装合同.md)。

## 工具交付与安装合同（2026-10-27，文档已合并）

**2026-10-27 当前进度：CONTRACT_MERGED_DEV / SOURCE_AUDITED / INSTALLER_NOT_IMPLEMENTED / NOT_INSTALLED。**完成原17+Manifest、九辅助件、三drop-in、状态目录和现有staging/历史来源/备份材料的源码核对，新增[工具交付与安装合同](Runtime最小执行器工具交付与安装合同.md)。本批仅文档，不修改Bundle/schema/权限/guard或生产文件。

回退异步任务批已由[PR #3006](https://github.com/sanqin888/sanqinMVP/pull/3006) 最终head `69950aa86bc35587ef86979a6e32a74ad33ba8de` 经 [CI #7698](https://github.com/sanqin888/sanqinMVP/actions/runs/40558256262) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各544、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `d1768dbd5af4375467d6e998dd7e031665b6f306`。原LOCAL/未运行是原审阅时点；仍未安装/真实隔离验收。

交付采用原已封存17归档加同准确main SHA的固定Git对象/模板，保留独立bootstrap审阅与root私有重验；transport清单不自证来源，不新设发布workflow/seal或版本权威。九辅助件和永久三drop-in独立交付，现有stage_bundle/plan_versioned_install不充当安装器，现有配置备份不能代替完整工具恢复实物。正式工具写入前拟先加载不依赖目标Python的临时拒绝门禁，逐文件替换后再转永久guard；该门禁、安装marker/记录、kit与installer均尚未实现。

首次工具过渡保持原.env/state/C4 marker/应用ID与DB卷，不自动更换应用镜像；真实旧17差异须逐项核对，超出两个部署工具源的变化另审。共享目录就绪后持原两锁，先意图/门禁、保存ID与策略并停写、核手动快照available和恢复材料，再安装/读回/核旧应用并最后清标记；未知保留真实证据，不恢复旧盘或自动续跑。

下一步D1仅实现惰性材料与只读核验/计划；随后D2受限安装、D3 Mac薄入口、D4统一真实隔离验收和生产材料，均沿原第三批范围。本批未运行项目测试，仅源码/路径/清单及文档差异核对；未测现场Python/Compose/systemd/Prisma/故障恢复，未选择生产main SHA/归档/快照。无新helper/依赖/业务schema/迁移、owner/SCC/债务/scanner基线变化，未重跑scanner；17+Manifest/250/300保持，三组研究继续暂停、不取消。

## 回退异步任务接线（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原release_task新增submit-rollback与status-rollback，复用同一systemd任务、两锁、整体预算及原阶段主体。独立准确兼容摘要绑定run和StopPost参数；子任务缓存重采集后执行回退freeze/create/start/finalize，提交唯一rolled-back并最后清标记。无SQL容器/反向SQL、外层异常改写、自动重放或恢复。

回退交接批已由[PR #3005](https://github.com/sanqin888/sanqinMVP/pull/3005) 最终head `cfd05ec939d653f2bfd8fceee94d5718fdafdfed` 经 [CI #7696](https://github.com/sanqin888/sanqinMVP/actions/runs/40556088534) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各514、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `678d50dde7e7295da05c3e2857d8f019ff7d553a`。原LOCAL/未运行为原审阅时点；仍未安装/隔离验收。

### 提交、上下文与单一任务

未安装源码接口新增submit-rollback <plan-id> --confirm-rollback --approve-compatibility <准确摘要>，只接原typed回退计划及独立兼容确认，不接受任意目标SHA、SQL确认或前向kind。submit_rollback在进入共享submit前拒绝缺失/布尔摘要；共享纯参数函数校验64位小写摘要并禁止SQL/兼容双确认。原job锁内核未完成job、维护为空、原件/时效及确认范围；派发前释放检查锁，原systemd-run仍oneshot/root/Restart=no/KillMode=control-group、no-block/remain-after-exit，Start2100s/StopPost900s、256M/50%、固定目录及30s派发上限。run与ExecStopPost绑定同一个--approve-compatibility值，沿原PID/ControlPID、固定unit/cgroup、已加载属性与准确命令校验；派发未知不重试，SUBMITTED不代表成功。

子任务共用run_task，先校验安装API及controller，再以原两把锁与维护目录FD贯穿全程：typed原件/准确确认→原回退freeze（缓存镜像重新采集、全部现场/历史来源核对）→原三服务create/register→原start/readiness→原finalize/唯一rolled-back/策略恢复/清标记。每阶段只在前一调用已知成功返回后继续，不按查询到的阶段续跑；v5/v6原scope与同attempt保持。回退validator要求pending=[]，不能进入SQL阶段，完整当前migrationHistory不裁剪。默认回退observer直接采用collector.collect_rollback并接受原bounded run/fetch，不误调用前向collector。

继续沿原1800s任务预算、阶段前检查及逐命令剩余预算上限；不加入外层catch/finally重写未知证据。失败/SIGKILL/预算结束沿原独立StopPost：先重核管理器PID/cgroup与包含准确确认的run/cleanup命令，再根据真实marker只处理保存ID；不加载计划，因此原件不可读不会阻断已登记writer收尾。marker仍为维护证据而非第二版本权威，不能为恢复而补写/清除。初始/终态同步未知和最终清理未知继续保留原阶段语义。

### 只读观察与交付边界

status-rollback <plan-id>采用固定typed回退loader，在原联合观察中要求唯一state为rolled-back/current=旧目标/previous=原当前/reason=rollback-verified，核运行合同/实际健康writer/挂载/DB及前后完整history；任一变化UNKNOWN，保留marker则MAINTENANCE_RETAINED。即使TARGET_RUNNING_OBSERVED，operationSuccessProven/canExecute仍false，不授予重放或事故恢复许可；普通status仍只采用前向kind。日志继续沿原有限80行入口，不新建任务或发布权威。

check-rollback仍只预检，不排队/停写/启动；源码已有执行主线，能力字段现为executionImplemented=true，并单列executionRequested=false，canExecute/databaseCompatibilityProven/incidentRecoveryAuthorized继续false。该能力字段不证明已安装、现场兼容或生产可用；日常前向更新不增加回退专用审阅操作。

新增30项离线模型测试：异步固定参数/准确兼容确认与SQL互斥、前向kind误用/坏确认/过期备份/维护残留/未知派发、PID/cgroup/策略/命令篡改、StopPost不读计划及坏PID拒绝、混装旧签名阻断、CLI确认/路由/脱敏、回退唯一state与完整history只读联合观察；整条真实阶段主体贯穿两锁、当前应用不健康、原计划/完整历史不变、旧digest三ID/原策略、缺错确认/新鲜基线漂移/默认缓存采集、部分create与禁止重放、start未知/最终readiness失败、总预算前后耗尽/逐命令剩余上限、独立StopPost计划不可用仍收尾、COMMITTED/clear未知及清除后不再停业务。现有预检测试改为executionImplemented=true、executionRequested=false，同时增加回退freeze/submit不调用断言，其业务只读/不排队规则不变。临时私有文件/锁为实物，Docker/DB/GitHub/HTTP/PID1为替身；仅Python3.10 AST、静态名字/重复方法、原函数等价、差异与读回审阅，项目测试未运行，不把前批514视为本批通过。

Runtime/Ops未安装工具内部原子增量，task仍负责调度/上下文/编排/观察，沿task→guard/starter/finalizer/collector/plan/store/job方向；复用原SQL与普通阶段主体，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。九helper/三drop-in仍须统一验真，旧工具签名拒绝；固定17+Manifest/250/300保持，受保护源改动必须走正式Bundle过渡。

本批源码接齐受控回退异步主线，但尚未统一交付/安装或真实验收。下一步核对九helper/三drop-in与固定17+Manifest正式Bundle过渡的准确交付合同，再完成Mac薄入口及真实隔离的Compose美元往返、Docker/Prisma/PID1、SSH断开/SIGKILL、socket/daemon/reboot、故障/恢复/连续双发布验收。查询、SUBMITTED、COMMITTED或标记消失不是未知/事故续跑许可；旧程序可能已写数据，不能反向SQL或直接恢复旧盘。三组研究继续暂停、不取消；无依赖/业务schema/迁移文件及生产Docker/systemd/SQL/AWS操作。

## 回退成功交接（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原finalizer新增内部finalize_rollback_ready，以独立准确兼容确认、原typed回退计划及同一v6/READY尝试复用原成功交接主体。先持久FINALIZING，再仅替换.env中的SHA、核目标配置/readiness和完整SQL历史，提交唯一rolled-back/rollback-verified；同步读回后只对保存三ID恢复原restart策略，重核后持久HANDOFF_COMMITTED并最后清标记。未知结果保留实际state/.env/维护证据，不重写PENDING或自动重放。

回退启动批已由[PR #3004](https://github.com/sanqin888/sanqinMVP/pull/3004) 最终head `604865cabea9ffcc009edbbcc32ae7d2fd56dbc9` 经 [CI #7694](https://github.com/sanqin888/sanqinMVP/actions/runs/40549990852) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各484、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `c0fad842056f46d644a6075840ebefa203bcbae7`。原LOCAL/未运行描述保留为原审阅时点；仍未安装/隔离验收。

### 原计划与成功顺序

内部finalize_rollback_ready要求root、原job/计划锁及维护目录FD、同planId/attempt的v6/CANDIDATES_READY、typed原件及与marker完全一致的独立64位兼容确认。普通finalize_ready继续走前向validator，不能因回退无pending SQL而采用回退kind。重核准确历史来源、原PENDING current=旧目标/previous=原当前、原.env/Manifest/运行合同/配置、备份时效/文件、实际健康三ID/image/digest/revision/挂载、DB身份和备份unit；意图前再次读pending/config、完整history、备份/DB/unit。历史沿starter原分派逐行比对完整当前history，不裁成旧镜像清单，不执行迁移或推导数据库兼容。

仅在上述已知成功后沿原_write持久FINALIZING。沿原原子writer只换SANQ_IMAGE_SHA，保持其他字节、LF/CRLF、uid/gid/mode，追加文件元数据与父目录同步；核准确目标展开配置和运行合同，固定readiness后再次核PENDING/健康/DB/完整history。唯一.sanq-release-state.json写rolled-back，current=旧目标、previous=原当前、reason=rollback-verified，经同步和准确读回后才逐个恢复保存策略（包括on-failure次数），重核策略/健康/DB/备份unit、目标配置/state及完整history、安装门禁。最后持久保留原scope的HANDOFF_COMMITTED，再沿原同plan/attempt/无其他残留校验unlink、fsync目录和空目录读回。marker不是第二版本权威；不调用旧rollback --execute、不重建/启动对象或修改数据库。

### 未知结果与验证边界

初始FINALIZING写入/同步未知不改.env/state/策略；普通意图前拒绝仍保持实际READY证据，由未来同一任务的受控失败收尾处理，不能据观察阶段重试。交接中途失败沿原事故收尾只处理保存候选/原ID；实际.env可能已变、state可能PENDING或rolled-back，都不伪造回旧值。状态写入/同步或策略恢复未知不会宣告成功；无法确认停止保持FENCE_UNCONFIRMED。最终COMMITTED持久未知只尽力抑制并停保存ID，不重写实际marker。最终unlink/目录同步未知保留实际已提交release，可能marker仍在或已消失、业务仍运行；该异常边界不重新创建marker或回滚/重放，后续任务接线须沿原独立StopPost处理实际证据。

新增30项离线模型测试，覆盖准确旧目标唯一状态/完整history与原件不变、原策略含on-failure:7恢复、LF/CRLF、两锁贯穿、错误确认/attempt/root/过期备份/普通入口误用、健康/Dead/proof/配置/备份/history与晚期漂移、readiness/中断/DB/额外writer/不确认stop、.env与state同步/写入未知、错误state读回/策略结果或读回未知、恢复策略后history变化、最终marker同步与unlink/目录同步未知、scope不可变/阶段跳跃/清理身份，以及真实目标绑定与唯一rolled-back读回。私有临时文件和锁为实物，Docker/HTTP/DB/GitHub/PID1为替身；项目测试未运行，仅Python3.10 AST、静态名字/重复方法/差异及未改函数等价审阅，不把前批484视为本批通过。

Runtime/Ops未安装工具内部原子增量；沿finalizer→starter/guard/collector/plan/store/release/job方向，九helper数量不变，无反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。guard仅扩v6阶段白名单；原维护转换/IO、普通finalize入口、env/state原子写/同步/目标绑定及清理主体保持。旧v6读者会拒绝新阶段，九helper/三drop-in须统一验真；17+Manifest/250/300保持，不直接覆盖受保护文件。

本批仅完成内部回退成功交接；尚无异步回退submit/run/StopPost与状态接线或可执行回退CLI，check-rollback仍仅观察。下一步将回退各阶段接入原受控异步任务，保留独立兼容确认及未知结果阻断，再完成九helper/三drop-in统一交付、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收。READY/COMMITTED或标记消失均不是未知/事故续跑或旧盘恢复许可，旧程序可能已写业务数据，不能反向SQL。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件及生产Docker/systemd/SQL/AWS操作。

## 回退启动与就绪核验（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原starter新增内部start_rollback_and_verify，持原job/计划锁及维护目录FD，核同一v6已登记尝试、typed回退计划、独立准确兼容确认、历史目标proof、唯一PENDING/旧.env配置/运行合同/备份/实际三ID和挂载。复用原启动/健康/固定readiness及失败收尾主体；先持久STARTING_CANDIDATES，再仅start保存三ID，重核后写CANDIDATES_READY，仍保留PENDING、维护与restart=no，不改.env/提交rolled-back或清标记。

回退创建批已由[PR #3003](https://github.com/sanqin888/sanqinMVP/pull/3003) 最终head `6bce17db6e5128ee792770b4a39b5a3db455f426` 经 [CI #7692](https://github.com/sanqin888/sanqinMVP/actions/runs/40546110736) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各461、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `7ee8c0a2b9648ca30e2a6f7b581ad67c29bd3e03`。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

### 准确计划、历史和实际身份

- 内部start_rollback_and_verify只接受独立64位小写兼容确认；缺失/布尔/错摘要不得选普通前向分支。原两锁和维护目录FD贯穿检查、启动与READY持久化；仅同planId/attempt的v6/CANDIDATES_REGISTERED可进入，原typed原件、marker rollback.release/approval与实际candidate均须匹配。普通start仍使用前向validator，不因回退无pending SQL就自动放行。
- 原_start_and_verify_locked新增明确rollback_approval分支，仍调用同一启动/健康/readiness主体，不建立另一发布器。重核原计划时效/备份，复用_pending_and_config核唯一PENDING current=旧目标、previous=原当前，原.env仍指向原当前、Manifest/运行文件/展开配置均未变化；再核准确历史目标来源、原完整迁移历史、三created对象/保存image ID与digest/revision/平台、原bind、DB Id/Image/Mounts及备份unit。
- starter内_application_history对v6重验规范回退原件/确认范围、目标/current/planId与候选一致，要求完整原migrationHistory逐行不变且无pending；不把历史裁成旧镜像清单、不反向迁移或认为SQL前缀即兼容。普通前向/SQL继续委托原migration.assert_application_history，其迁移完成/精确delta规则不变。启动意图前额外重读pending/config、完整history、备份和DB，晚期变化仍在首次start前阻断。

### 共享启动顺序和未知结果

先沿原_write耐久写STARTING_CANDIDATES再按api/worker/web顺序start保存ID，每次30s上限；健康轮询沿原90s monotonic预算、每次命令取剩余预算与局部上限较小值，至多间隔2s。只接受准确role全集/目标reference/保存image ID、running且非Restarting/Paused、restart=no、已审bind及健康starting/healthy；v6补Dead=false要求。健康通过后沿原固定脚本/ENV/https://sanq.ca执行readiness，300s上限，再核实际三writer、DB/备份unit/完整history、pending配置和安装门禁，才写READY。各局部上限不构成新的整任务预算，未来异步回退仍须纳入原任务整体超时/独立StopPost预算。

初始STARTING写入/同步未知不发start；start可能已生效而结果未知、健康超时或不符、readiness/配置/DB/history等失败，均沿原incident收尾，只处理保存候选和原ID，保留实际PENDING/维护，不能确认即FENCE_UNCONFIRMED。最终READY持久结果未知只尽力停保存ID，不覆盖实际阶段或清标记；即使读到READY也不允许自动续跑。READY已运行的旧程序可能写入业务数据，这不是离线兼容证明或旧盘恢复许可。

v6当前扩到STARTING_CANDIDATES/CANDIDATES_READY，原REGISTERED→STARTING→READY及事故转换/不可变字段检查直接复用，不增加新schema字段或发布权威；FINALIZING/HANDOFF仍拒绝。成功READY仍是restart=no的维护中PENDING，没有恢复原策略、改.env或宣告成功rolled-back。

### 验证、归属和剩余工作

新增23项离线模型测试，覆盖准确旧ID/独立确认/原件与完整history不变、普通start不能采用回退、pending/config/备份/history/proof与晚期配置漂移、原history核验合同及forward kind拒绝、已启动/被替换对象不得重放、start结果未知、unhealthy/starting→healthy/90s超时、readiness失败/Python中断/部分stop、额外writer/DB/history/策略/Dead漂移、初始与最终fsync未知、root/两锁/备份过期，以及真实pending绑定函数接受旧目标PENDING+原.env并拒绝反向关系。文件与锁为可丢弃临时实物，Docker/GitHub/HTTP/DB/PID1为替身；实际VM、SSH/SIGKILL、容器、Prisma及Compose往返未执行。仅Python3.10 AST、静态名字/重复方法、原启动变更段等价及差异/读回审阅，项目测试未运行，不把前批461结果当本批通过。原创建测试的“未实现阶段”负例改为仍未开放的FINALIZING，保留scope/降级/回退创建阻断断言；启动阶段现在通过真实共享主体覆盖。

原_pending_and_config函数保持，原启动变更段除历史校验分派外保持同一顺序/异常收尾/最终未知语义；guard只扩v6阶段白名单，原_write IO/转换与冷启动门禁不变。Runtime/Ops未安装工具内部原子增量，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner；17+Manifest/250/300旧guard保持，九helper须统一验真交付，旧v6读者会拒绝新阶段，不能混装。

本批仅完成内部回退启动与READY，尚无回退成功交接、唯一rolled-back提交、原策略恢复/最终清标记、异步submit/run/StopPost及状态接线；check-rollback仍仅观察，原前向任务不能采用回退kind。查询到READY不是从未知/事故续跑或重放的许可，旧应用启动可能写业务数据，不能据失败恢复旧盘或反向SQL。下一步接同一原计划/兼容确认/维护证据下的成功交接，再完成异步任务、九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。

## 回退容器创建与登记（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原guard新增内部prepare_rollback_candidate_containers，持原job/计划锁与维护目录FD，以原typed回退计划、独立兼容确认及同一v5/FROZEN尝试进入，共用原三服务create/register主体。重核当前完整SQL/history、准确历史目标proof、缓存旧API SQL/source和运行基线；先保留rollback scope升级v6/CREATING_CANDIDATES，再写唯一PENDING、固定--no-build/--pull never创建和登记完整三ID/image ID，不start或执行SQL。登记结束仍保留维护、PENDING和旧.env，数据库历史不删减。

回退停写批已由[PR #3002](https://github.com/sanqin888/sanqinMVP/pull/3002) 最终head `c219a2d8d319ffc8d84a3e1df5a573b99e6f8d77` 经 [CI #7690](https://github.com/sanqin888/sanqinMVP/actions/runs/40541893634) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各438、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `45220d9a0ddacf8be6d108badea3025298e8bf16`。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

### 同一原计划、创建与登记

- 新内部适配器严格校验确认摘要，None/布尔不得误选普通前向分支；原job/计划锁和维护目录FD贯穿重核→意图→PENDING→create→登记。只从同一v5/FROZEN、planId/attempt和rollback release/approval精确匹配进入，不选择其他SHA、不从残留阶段自动续跑。
- 原共享创建主体新增明确rollback_approval分支，普通prepare_candidate_containers仍通过前向typed validator且不能采用回退原件。_review_for_record只按已验证维护schema选固定kind的validator，无fallback猜类型。时效/备份验证与实际snapshot/配置/Manifest/运行pin/环境/history/备份/DB复核分别执行；原当前完整inventory/history原封保留，旧API SQL必须与targetMigrationInventory一致并再次绑定完整Git source树。禁止清空history、伪造无迁移前向计划或重新执行已应用SQL。
- 原_begin_candidate_creation_locked在准确兼容确认下仅将v5/FROZEN升级v6/CREATING_CANDIDATES，保留不可变rollback字段、目标和原三ID/image/策略。唯一版本state沿原write_creation_pending写candidate-create-start，current=旧目标、previous=原当前，.env仍是原当前；不是新版本权威，也不是成功rolled-back。
- 共用原_creation_config和固定三服务create --no-build --pull never --force-recreate，180s上限；不包含DB服务/depends_on/新命名卷，仅原external网络与已审bind，restart=no、两个准确digest。前后DB身份/历史必须一致。只有完整三created对象、准确角色/reference/image ID/revision/digest/平台、restart=no、已审mount及不重叠ID核完才登记；API与worker须同一image ID。
- v6保存rollback与candidate两组证据，candidate.release须等于rollback.release；目前只允许创建/登记/事故三阶段。普通v1→v2、SQL v3→v4及原v5停写条件保持，新增v5→v6必须沿原转换/不可变字段校验，不能降级、丢确认、换目标或跳到启动阶段。原failed-task收尾对v6先处理保存候选ID，再处理原ID；部分创建未登记时仍FENCE_UNCONFIRMED，不猜新对象、重放或开业务。

### Compose导出边界修正

Compose导出值边界已更正：已查Docker Compose的config实现会对已插值导出内容统一将$写为$$；应用创建配置原样保留该导出值，本批撤回“再转义一次”的临时改动。迁移creation_config原先额外replace会把已转义URL再次转义，本批移除该重复层，并将旧迁移测试夹具改为实际导出形态及原样保留断言。字面$需要Compose转义的原则仍成立，但应只在正确的输入边界执行一次；此前迁移美元测试只验证替身输入，不能作为真实往返证明。目标现场Compose版本的config→私有stdin→容器环境精确往返仍待隔离验收，不据上游源码或离线字符串断言宣布已通过。

已核对[Docker Compose config实现](https://github.com/docker/compose/blob/main/cmd/compose/config.go)中runConfig对导出content的ReplaceAll步骤，以及[官方插值规则](https://docs.docker.com/reference/compose-file/interpolation/)。此处来源用于解释序列化边界，不替代本项目目标版本的现场证据，也不新增暂停中的来源/可信输入研究。应用_creation_config原方法保持；迁移配置仅移除对导出DATABASE_URL的额外replace，仍只通过有界私有stdin转发这一键，不转发JWT等其他API环境。

### 验证、未知与交付缺口

新增23项离线模型测试，覆盖准确旧digest/先意图后PENDING/两锁贯穿/三服务无DB创建与登记、保留当前完整历史和原件/rollback scope、旧对象保留或被替换、缺错确认/attempt、proof/缓存SQL/完整source树/配置/history漂移、部分create与禁止重放/不得猜ID、PENDING/创建意图/登记耐久未知、DB/history变化、错误mount/运行状态/restart策略/image/额外角色拒绝、已登记候选优先收尾、scope不可变/降级/未实现启动阶段拒绝、锁/前向误用/备份过期，以及应用与迁移保留Compose导出美元值。另修正原迁移测试的导出URL夹具与对应断言；不削弱秘密不转发断言。临时私有计划/维护文件和锁为实物，Docker/SQL/PID1/现场采集均为替身。仅Python3.10 AST、静态名字/重复方法、IO与未改方法AST、差异/读回审阅，项目测试未运行，不把前批438结果当本批通过。

创建意图写入/读回未知时不写PENDING或发create；PENDING写入未知时不create；部分create或DB/mount/history/登记失败保留实际意图和PENDING。最终登记同步未知即使原件显示REGISTERED也不得据此开始下一阶段。无自动清理、rm、清标记或策略恢复。新阶段尚无CLI/任务调用，必须仅由前一调用已知成功的同一受控任务接续，不能因查询到FROZEN/REGISTERED就重试。

Runtime/Ops未安装工具内部原子增量，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原guard→collector/plan/store/release/job/migration方向保持，migration仍拥有单一迁移对象配置/检查。九helper须统一验真交付，v6旧读者拒绝；17+Manifest/250/300旧guard不变，受保护controller/release_contract正式Bundle过渡仍待完成。

本批仅完成内部回退创建与登记，v6只允许CREATING_CANDIDATES/CANDIDATES_REGISTERED/INCIDENT；没有回退启动/readiness、唯一rolled-back成功交接、恢复原策略/清标记或异步提交/执行接线。部分创建和未知结果保持真实PENDING/维护证据，不自动采用发现的ID、重放、反向SQL或旧盘恢复；创建成功也不代表数据库/业务兼容已证明。下一步接准确已登记旧容器的启动与就绪，再接成功交接及异步任务。统一九helper/三drop-in、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收仍OPEN；三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。

## 受控回退停写（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原guard增加内部freeze_rollback_for_plan及锁内主体，持原job/计划锁和维护目录FD，核typed原件、独立准确兼容确认、缓存镜像现场重采集、时间/来源与实际三writer，再与普通更新共用同一arm/停写主体。新增未安装v5维护记录保存准确目标proof与确认摘要；先持久ARMED和原ID/image/restart策略，再仅对保存ID设restart=no并stop，重核后FROZEN。当前应用可已退出或不健康，未知/替换/额外对象仍阻断；不改唯一state/.env或执行SQL。

回退复核批已由[PR #3001](https://github.com/sanqin888/sanqinMVP/pull/3001) 最终head `ed3ee4af58f827fa10d3940d581915135dcea0d5` 经 [CI #7688](https://github.com/sanqin888/sanqinMVP/actions/runs/40538401235) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各417、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `07ba60c8b470c53a8eb30fb365741056f261b48a`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

### 同一原件与实际对象

- 内部适配器持原job锁、计划锁及维护目录FD，未完结job/任何维护残留先拒绝；核原安装门禁并只从load_rollback_review读取准确id，assert_rollback_compatibility核独立摘要。重采collect_rollback(cache_images=False)，新观测须在本次尝试开始后、最终观测前，除采集时刻外全部字段须与原计划一致；再核准确历史目标来源。无target/latest发现、健康绕过开关或另建批准/state数据库。
- 当前镜像仍通过sealed_release_for_sha与实际image ID/digest/revision/平台核验。原_original_containers新增仅供回退的include_exited模式：只接受running/Running=true或exited/Running=false，且Restarting/Paused/Dead均false；每个role的完整对象集只能是本次准确ID。Health不作门禁，created/restarting/dead、未知或替换对象不自动归为可回退。默认前向分支的原running条件保持。
- 准确原ID、实际image ID及原restart策略（含on-failure次数）和备份unit状态写入同一维护记录；v5额外rollback仅含已审目标release与approvalSha256，不增加current/previous权威。v5仅允许ARMED/FROZEN/INCIDENT，无candidate/migration字段；同schema普通转换继续沿原不可变字段检查，不能改目标/确认、降级或借用前向创建阶段。

### 共享停写顺序和失败边界

普通前向freeze的原arm→三个restart=no→三个stop→逐保存ID确认→FROZEN主体提取为_arm_and_freeze_locked；AST对照除新回退分支/核验回调外保持同一顺序、相同45s命令上限和错误语义，不复制另一发布器。回退在ARMED前、ARMED后策略变化前、停止后均重核原计划字节、安装/配置/运行pin/环境、唯一state原字节、SQL历史/备份与同一DB Id/Image/Mounts，并核时间/备份有效期；补充原两锁内未完结job检查。实际挂载和两份SQL完整来源仍由原重采collector验证，采集可启动原隔离文件探针，并非主机零写入。

ARMED必须文件/目录fsync及读回已知完成才改策略；初始持久结果未知不发后续业务变更。ARMED后观察/策略/停止失败只尽力update=no并stop已保存原ID，保留INCIDENT/FENCE_UNCONFIRMED，不猜新对象或恢复服务。v5停止核验额外要求role全集仍只含原ID、Dead=false；额外对象不因发现就被采用或操作。最终FROZEN写入/同步未知保持实际原件，不改写为已知结果、不清标记或重试。原cleanup_after_task沿同一原件与保存ID收尾，保留回退scope；cold-start门禁仍见任何残留即阻断，不增加finally重开路径。

### 验证、交付与结束位置

新增21项离线模型测试，覆盖不健康/已退出应用、准确目标/确认/原策略先保存、前向仍拒绝退出对象、缺/错确认、fresh/proof漂移、created/paused/restarting/dead/状态不一致、额外writer前后出现、DB/历史晚期漂移、state原字节与计划读回变化、root/安装门禁/备份/残留拒绝、原两锁竞争、初始与最终fsync未知、update/stop失败、原task失败收尾、v5结构/不可变scope与阶段拒绝、旧观测/过期备份，以及前向创建/CLI不能采用回退记录。私有计划/维护文件与锁为可丢弃临时实物；Docker/GitHub/DB/PID1/现场采集为替身。仅Python3.10 AST、静态名字/重复方法/差异及共享停写主体AST等价审阅，未运行项目测试，不把前批417等结果当本批通过。

本批为未安装工具内部原子增量，guard仍拥有原维护事实/转换/失败收尾，collector/plan/store和task职责不移动。原_write IO/转换主体、stop_best_effort、incident/冷启动及CLI均未变；v1–v4字段集合及普通前向判断保持。无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner；17+Manifest/250/300旧guard不变。v5须与九helper统一验真交付，旧读者遇v5拒绝，不能混装或直接覆盖现役受保护源。

本批仅完成内部回退停写阶段，尚无回退任务提交、旧镜像create/register/start/readiness、唯一rolled-back交接或清标记；v5当前仅接受ARMED/FROZEN/INCIDENT，旧前向/SQL路径不能采用它。check-rollback仍只观察，不触发新停写函数；不从持久FROZEN推导重试/续跑许可，不自动恢复策略/服务、反向SQL或旧盘。下一步在同一原计划/兼容确认/维护记录下接回退候选创建与登记、启动就绪和成功交接，再接异步任务；统一九helper/三drop-in、固定17+Manifest正式Bundle过渡、Mac薄入口及真实隔离故障/恢复/连续双发布验收仍OPEN。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。

## 回退兼容确认与锁内复核（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原plan新增独立准确兼容确认及新旧现场审阅原件比对，collector新增show-rollback-sql，只展示当前数据库比旧镜像多出的已应用SQL。原task新增check-rollback <plan-id> --approve-compatibility <准确摘要>：持原job锁和计划锁，禁止未完结job/维护记录，缓存模式重新采集两镜像/两份SQL来源/现场基线，结束前重读原计划与门禁；只返回BASELINE_RECHECKED，不能排队或执行回退。canExecute/databaseCompatibilityProven/incidentRecoveryAuthorized始终false，executionImplemented=false。

回退采集批已由[PR #3000](https://github.com/sanqin888/sanqinMVP/pull/3000) 最终head `ee12e4f1bb69c4cdee31e97ae7e6b1763bc0fd85` 经 [CI #7686](https://github.com/sanqin888/sanqinMVP/actions/runs/40532730955) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各399、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `05c65d07f2ee059cdaf012378075e34f021ec747`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

### 准确审阅和独立确认

- show-rollback-sql <plan-id>从原typed store读取回退原件，仅获取extraAppliedMigrations对应的准确Git blob；每项核完整SHA、size/base64、原字节SHA-256与Git blob SHA-1，使用当前commit的sourceUrl展示UTF-8原文。新旧调用共享原SQL读取循环，前向show-sql的校验与输出保持。原始SQL总字节和完整JSON均受原4MiB预算限制，全部核完才输出，不产生部分审阅。
- assert_rollback_compatibility仅接受原summary给出的准确64位小写compatibilityApprovalSha256，独立参数绑定完整planId；None/布尔/通用id/旧计划摘要拒绝。即使两版本SQL清单相同也必须确认，仍不推断应用数据格式/写入语义、配置、外部副作用或数据库兼容安全。
- assert_same_rollback_observations验证两个完整canonical回退原件，除createdAt/相应planId外所有字段必须相等；包括唯一state原字节、两份inventory、history、目标proof、运行pin/配置/安装/备份/环境。新采集时间须不早于原计划且不晚于最终观测，原备份仍须在26h内；只允许采集时刻自然前进，不放宽原计划确认范围。新计划自身的确认摘要不能替代原计划摘要。

### 同锁复核与输出边界

check-rollback先核root、固定安装API和原两锁，原未完结job及维护残留须为空；读取准确typed原件并核独立确认后才检查系统门禁和重新采集。复用collect_rollback(cache_images=False)，不pull/build或起停业务，缺缓存阻断；当前应用健康仍不作为前置，实际身份/镜像/挂载、运行DB、当前完整SQL/history和目标来源均须通过。原collector只读业务观察，可启动原隔离SQL文件探针并创建锁，不能表述为主机零写入。

300s monotonic总预算覆盖命令及来源请求前后，命令timeout取剩余预算与原局部限制较小者，GitHub传输保留原15s上限。完成采集后重读原计划字节、未完结job、维护目录和安装门禁，再按最终时刻比较；未知/变化均报固定脱敏错误，不自动产生新计划替代原件。整个入口不写job/维护/state/.env/批准文件，不调用systemd-run或旧回退。返回只描述本次锁内观察；锁释放后不是后续切换许可，executionImplemented=false。

### 验证、归属与剩余工作

新增18项离线模型测试：缺安装API拒绝及准确/缺失/布尔/错scope确认、同SQL仍需确认、采集时间与备份过期/时钟倒退、state/配置/历史/备份/运行pin/目标proof漂移、坏原件、准确SQL blob/当前commit/字节与输出预算、typed CLI/脱敏，以及持两锁的真实collector与私有store组合、禁pull/业务命令、未完结job/维护/门禁、读回变化、300s预算、竞争/root及CLI参数拒绝。文件存取使用可丢弃私有临时目录，Docker/GitHub/DB/PID1为替身。仅Python3.10 AST、静态名字/重复方法/差异及原SQL读取循环AST等价审阅，项目测试未运行，不把前批399结果当本批通过。

Runtime/Ops普通兼容新增，原task→collector/plan/store及collector→plan/release/store方向保持，无新helper/反向导入/12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。原submit/run/cleanup、前向/SQL执行主体、维护schema和唯一版本权威不变；17+Manifest与250/300旧guard保持，受保护源仍须正式Bundle过渡。

本批未接回退停写、对象创建/启动、唯一rolled-back提交与清标记，也无异步回退任务或事故恢复入口。复核结果不保存批准文件/新job，不是可重用执行票据；未来执行仍须在同一锁内重核并保留原计划与数据库真实历史，不可伪装前向计划、执行反向SQL或调用旧rollback --execute。下一步接原维护主线的受控回退阶段，再完成九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口及真实隔离故障/恢复/连续双发布验收。三组研究继续暂停、不取消；无依赖/业务schema/迁移文件、生产Docker/systemd/SQL/AWS操作。

## 回退现场采集与私有计划保存（2026-10-27，源码已合并）

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原collector新增prepare-rollback [--save] [--cached-only]和show-rollback <plan-id>，只从唯一state的previous确定目标，不接受任意SHA。重核17+Manifest/配置/state原字节、准确历史proof/两运行文件、当前与目标实际digest及各自API SQL/Git树、当前history/DB身份/真实挂载/备份；结束前重读关键基线，任一变化阻断。当前应用可不健康/已退出，但对象身份/镜像/挂载仍须证明，DB必须运行且是原固定卷；维护记录/PENDING仍拒绝。只输出兼容审阅摘要，canExecute保持false。

回退审阅批已由[PR #2999](https://github.com/sanqin888/sanqinMVP/pull/2999) 最终head `ca5993f258faafe7cbca85429ab7768073ef1753` 经 [CI #7684](https://github.com/sanqin888/sanqinMVP/actions/runs/40527848453) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各382、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `17416da3333a34dc19defcbefcfc4a6f242f56e5`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

### 采集、显示与未知边界

- 新prepare-rollback没有target参数；先验证root/固定本地Docker端点、原维护目录为空、安装17+Manifest与当前配置/state一致，再读取原state字节，核准确current/previous/已知完成phase/reason/时间。只有其previous的准确历史来源证明通过且两运行文件与现役合同相同才继续；不发现latest、不接受旧shell路径/任意URL，不修改运行时文件。
- 当前容器观察复用_current_images，新增仅供回退的include_stopped模式，compose ps -a -q要求单个完整64位ID，逐实际image ID核原seal/digest/revision/平台并返回原paired proof。默认前向调用的运行中选择/原12–64位观察条件不变。原controller.check_live_storage仍验真实挂载，回退适配器只对三应用的ps加入-a，DB仍只选择运行容器；不执行当前应用HTTP/readiness或check_running_images，避免健康失败阻断准确目标审阅。
- DB在SQL观察前后必须同一Id/Image/Mounts，完整ID/运行状态/project/service标签及sanq-app_pgdata卷与固定数据目录均须匹配；备份仍用原校验/hash/gzip及时效，资源仍需原5GiB/512MiB门禁。当前API digest必须已缓存且核验，目标默认只pull准确两个digest并各自验真；--cached-only完全不pull，缺缓存阻断，不build/prune或更新业务容器。
- 两次SQL文件探测都复用原network=none/read-only/有限内存CPU/固定Node程序，只读各自API image文件清单，不启动应用/worker或连接DB执行Prisma。分别从准确commit读取完整Git树核SQL blob/size，拒绝truncated、改动或多余对象。原forward collect的相同source块提取为_verify_sql_source，AST对照除参数名外保持，前向门禁不变。真实DB历史只读并必须完整对应当前inventory；旧inventory须为不变前缀，额外applied项供人工兼容审阅，仍不自动判安全。
- 生成审阅计划后，再核state字节/配置/Manifest与运行文件、history/备份、DB身份、当前paired proof/实际镜像、历史目标proof、真实挂载和维护目录。CLI持原preparation_lock贯穿采集及可选保存；普通更新任务亦持此锁，阶段不能插入。采集可写镜像缓存、启动原隔离文件探针并创建原锁/审阅文件，不能描述为主机零写入；不改业务state/.env/策略或停开服务。

### 同一原件存储与类型隔离

原store增加固定save_rollback_review/load_rollback_review，复用同一plans目录与create-only IO主体，不新建发布数据库。新旧kind通过各自固定validator验证，forward save/load和SQL/task不能接受rollback原件，也不通过fallback猜类型。文件名仍为域分离planId，原root私有0700目录/0600单链接文件、no-follow/owner检查、O_EXCL、完整写/fsync文件及父目录/同FD读回全部保留；保存或同步未知保留实际文件，不覆盖、删除或自动重试。静态AST对照除固定validator选择外IO主体不变。

show-rollback只读准确id原件，无网络/容器；prepare/show摘要包含目标镜像、备份、环境键名、额外迁移及兼容审阅摘要，不输出releaseStateRaw或.env/凭据。错误沿原固定消息，不回显任意子进程/观测文本。新CLI并未安装，不能据文档在现役路径直接操作。

### 验证与下一步

新增17项离线模型测试，覆盖准确previous/两份SQL-source/无健康门禁、缓存/缺镜像、state/配置/history/备份/DB/proof/runtime/mount漂移、DB停止/错role/卷、维护/root/远程端点拒绝、停止应用观察适配、CLI目标不可选/typed保存查询/错误脱敏，以及新旧kind互拒、权限/owner/链接、fsync未知/短写保留。仅临时私有存储为真实文件；Docker/GitHub/DB/系统观测均为替身。只做Python3.10 AST、静态名字/方法名、SQL source/IO主体等价及差异/读回审阅，项目测试未运行，不把前批382等结果当本批通过。

原plan/store/collector职责及九helper数量不变，无反向导入或12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。正常前向计划、SQL任务与维护schema保持；本批仅新增回退review准备能力，未完成受控回退或最小执行器交付。

本批仍无回退确认/提交/执行、自动恢复/反向SQL或旧rollback --execute调用；事故state/维护证据不得借prepare-rollback绕过，查询计划不是准许重放。下一步独立准确兼容确认及回退任务接线，再完成九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口与真实隔离故障/恢复/连续更新验收。release_contract/controller等受保护源改动不能直接覆盖现役文件或手改hash，250/300旧guard保持；三组研究继续暂停、不取消，无业务schema/迁移文件/依赖/生产Docker/systemd/SQL/AWS操作。

## 受控回退审阅门禁（2026-10-27，源码已合并）

**2026-10-27 当前进度：ROLLBACK_REVIEW_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**在原release_contract/plan内补受控回退审阅门禁，无新helper或执行入口。准确历史目标校验复用seal/目标最新main CI/publication与同一祖先检查，要求目标是current的主线祖先，不发现latest，也不以当前应用健康或当前CI重跑失败替代历史目标证明。纯审阅计划绑定唯一发布state原始字节/哈希、current与准确previous、备份/环境/运行合同、当前完整SQL/history及旧镜像SQL清单；列明额外已应用迁移，兼容批准摘要仅绑定本次审阅范围，canExecute与databaseCompatibilityProven始终false。

完整SQL任务批已由[PR #2998](https://github.com/sanqin888/sanqinMVP/pull/2998) 最终head `af11fd4d3374ef180c5fbdc9f8d5e55abc6c7344` 经 [CI #7682](https://github.com/sanqin888/sanqinMVP/actions/runs/40526376795) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各365、Runtime1080、准确CPython3.12.15回归412），合并dev `2d1aed320f59716ee233d7f5f79b37dd80a57095`。首次CI #7681发现测试重复保存原不可变计划、停止顺序断言包含freeze命令，仅af11fd4d修正夹具时间及收尾停止后缀；生产逻辑/拒绝覆盖门禁不变。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

### 准确目标与兼容审阅

- verify_exact_rollback只接受两个不同完整SHA；历史目标的当前有效paired seal、publication run和最新准确main CI须通过，目标/current各自须在main谱系，目标必须是current祖先。复用verify_exact_candidate(target,target)检查准确目标，再检查current→main及target→current，不用全仓250/300差异或任意标签猜旧镜像；当前应用是否健康不参与此纯来源检查，亦不要求当前CI重跑仍成功。默认七个固定只读GET，无镜像pull/inspect或版本修改。
- 原verify_exact_candidate内部forward主体提取为_verify_lineage，两次调用顺序、原条件与五个请求保持；AST对照确认提取主体不变。没有改变正常前向发布门禁或原historical seal协议；这些检查仍只代表既有可信workflow边界，不是新的离机签名或完整暂停来源研究。
- create_rollback_review接收受信采集者的观测，复用原create_plan验证当前全部SQL已应用、历史无未知/失败/缺失、备份时效/运行pin/环境/成对镜像结构；targetMigrationInventory必须是current inventory的完整不变前缀，改动/重排旧SQL或引入未应用SQL均拒绝。旧镜像少于当前数据库的部分以extraAppliedMigrations完整名称/摘要/字节/Git blob元数据展示，不因它是前缀就断言旧程序兼容新增结构。
- 唯一发布state原始UTF-8字节保留在审阅快照releaseStateRaw，逐字节SHA-256须等于current.releaseStateSha256，current须等于观测运行版本、previous须等于目标且二者不同。原件必须严格为已知schema、active/readiness-verified或rolled-back/rollback-verified，时间不得晚于审阅；PENDING/未知phase/reason、坏JSON/字段/摘要拒绝。这里只读取传入原件的快照，不生成第二current/previous权威，不替代之后对现场.env/state/维护记录的重核。rolled-back中的previous若不是主线祖先，准确来源检查仍拒绝该方向，应另行按前向发布审阅，不能据纯结构校验越过谱系条件。
- 新kind sanq-rollback-review-plan单独规范化验证/独立planId，原forward validator/store/SQL审阅不接受它；不是将旧目标伪装成正常前向计划。compatibilityApprovalSha256使用独立域绑定整个planId；任一state原字节/目标proof/配置/备份/history/清单变化均改变范围。即使额外SQL为空，仍requiresExplicitCompatibilityReview=true、databaseCompatibilityProven=false、incidentRecoveryAuthorized=false、canExecute=false，摘要不是授权、SQL安全证明或恢复许可。
- 两个模块的纯校验分别处理结构/字节绑定和准确GitHub来源，不能自证输入来自现场；下一步collector必须同时取得准确历史proof、实际镜像ID/digest与SQL、完整source树及当前/目标runtime等观测，并原件读回。此批没有伪造现场采集或新增可信输入服务。

### 验证与结束位置

新增17项离线测试：准确历史目标/七请求/无latest/当前CI失败不影响历史目标、历史最新CI失败/失效seal/错谱系或SHA拒绝；state原件及额外SQL展示、与forward/SQL路径隔离、未知/未来/不一致state、完整已应用当前history、旧SQL前缀/修改负例、同SQL仍须兼容审阅、摘要/原件空白/目标proof绑定、重复JSON/错id/非规范字节拒绝。GitHub为替身，其余为纯内存，不访问Docker/DB/文件/网络。仅Python3.10 AST、静态名字/方法名、祖先主体AST对照和差异审阅；项目测试未运行，不把前批365等结果当本批通过。

本批属于未安装工具内部原子增量；原forward计划v1、维护v1–v4、唯一state schema及task更新主线不变。无新helper、反向导入或12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。只完成回退审阅第一片，受控回退整体仍OPEN，最小执行器未交付。

本批未新增回退collector/计划保存/CLI/提交、确认或应用切换，不调用旧rollback --execute，不处理PENDING/INCIDENT恢复，不执行SQL/down migration、旧盘恢复或清维护标记。下一步将实际state/旧镜像与当前SQL/source树/runtime/DB/备份采集、保存与准确兼容确认接入同一受控回退主线，再统一安装/Mac入口及真实隔离故障/恢复/连续更新验收。九helper/三drop-in数量不变；本批release_contract.py属于固定17成员，后续必须随controller等变更走正式17+Manifest Bundle验真过渡，不能仅投递辅助件、手改hash或覆盖现役文件。三组研究继续暂停、不取消，无业务schema/迁移文件/依赖/生产Docker/systemd/SQL/AWS操作。

## 完整 SQL 异步任务接线（2026-10-27，源码已合并）

**2026-10-27 当前进度：SQL_TASK_CONNECTED_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**同一release_task的submit/run/cleanup接收独立准确--approve-sql摘要；提交与停写前都用原计划校验，pending SQL缺失/错摘要、布尔或无迁移却附批准均拒绝。管理器ExecStart/ExecStopPost同时绑定planId与批准参数，PID/cgroup/固定unit校验保持。run持同一job锁/计划锁/维护目录FD完成freeze→迁移create/register→start/wait/history→原应用交接，仅前一阶段调用已知成功才继续；无新批准文件、发布状态或helper。

迁移后应用交接批已由[PR #2997](https://github.com/sanqin888/sanqinMVP/pull/2997) 最终head `96d6a3221d6742a6dda0ee9fbe1a8872ec870ffd` 经 [CI #7679](https://github.com/sanqin888/sanqinMVP/actions/runs/40523115618) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各347、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `3cb66317b49a2cdfdd8e97e6a9b21210369e4035`。其LOCAL/未运行记录是原审阅时点，仍未安装/隔离验收。

### 固定参数与同一主线

- 无迁移提交仍为submit <plan-id> --confirm-release；有迁移还必须显式传--approve-sql <show-sql输出的approvalSha256>。它绑定同一planId/目标/API digest/准确待执行SQL，不是永久apply开关、数据库密码或SQL安全判定。原source/备份/兼容/停写/生产授权规则继续适用；新接口尚未安装，不据文档在现役工具上直接执行。
- submit先校验原计划/时效与准确批准，再异步systemd-run --no-block；批准只以严格64位小写hex进入固定run/cleanup命令，原两命令与unit/PID/cgroup均须准确匹配。无SQL仍保持原命令，无摘要不存在宽松自动批准；队列结果未知不重复提交。
- run在进入维护前再次校验同一独立批准及controller API。原job/计划锁、维护目录FD贯穿全部阶段，调用原锁内主体，不释放再获取或用重入/跳锁开关。prepare_migration_container、handoff_migrated_release提取锁内主体；AST规范化对照确认除外层持锁方式和说明文字外，原阶段主体未变，公有适配器仍加锁后委托。
- 每个迁移阶段返回planId/attemptId/准确outcome/canExecute=false都须匹配；MIGRATION_VERIFIED函数抛出耐久未知时，即使原件看似VERIFIED，也不会进入应用交接。不会从残留phase选路径、重选latest、自动重放、撤销SQL或恢复旧盘。部分create、最终封口/清标记未知仍沿原证据边界，没有外层通用catch覆盖原件。
- SQL路径调用原迁移创建/登记、迁移执行/准确history及共享应用create/start/finalize；无SQL继续原三应用主线。原PENDING只在创建迁移前写一次，.env保留旧SHA至成功交接，最终ACTIVE仍由原finalizer独占，之后才恢复原策略和清维护标记。

### 预算、收尾与安装一致性

整个任务继续使用monotonic 1800s；所有阶段外部命令timeout取局部限制与任务剩余预算较小者，GitHub调用前后检查整体剩余预算且传输保留自身15s限制。迁移阶段900s预算和start30s/wait上限、应用create180s/health90s/readiness300s等局部上限保留，不因含SQL就叠加成无限窗口；用尽后阻断下一阶段。systemd TimeoutStartSec=2100、TimeoutStopSec=900与原资源限制不变；文件/同步阻塞仍以管理器硬超时兜底，真实行为须隔离验收。

StopPost同样核带批准的准确ExecStart/ExecStopPost参数和ControlPID，但不重新读取可能损坏/消失的计划或依赖批准服务；确认管理器身份后，仍由原维护记录和保存ID执行失败收尾。它不执行SQL、开业务、改版本或清标记。主任务整体预算用尽可能使其内部收尾也无法发命令，独立StopPost进程仍有原单独预算；无法确认停止保持FENCE_UNCONFIRMED。

原task安装API门禁增加迁移begin/register/配置/退出/history接口、应用pending_config与登记controller参数，缺件在停写前拒绝；不能把部分新版文件装入现役九helper集合。未改记录schema、计划/批准算法、17+Manifest或生产systemd配置。

### 验证和结束位置

新增18项离线模型测试：5项批准/异步参数/管理器/独立StopPost/CLI门禁，13项从运行中旧writer开始的完整SQL任务，覆盖同锁12阶段、迁移仅执行一次/准确history/原计划字节不变/唯一PENDING与ACTIVE、缺批准停写前拒绝、部分create、start/wait未知/非零/部分history、VERIFIED同步未知不得继续、SQL后应用失败、整体预算与wait限额、最终clear未知不重放和锁竞争。原无SQL全任务/CLI测试保持，安装API缺件负例扩展。Docker/SQL/systemd/配置/网络/clock为替身，真实临时私有计划和维护文件不代表生产容器或Prisma验证。

本地只进行Python3.10 grammar AST、静态名字/重复方法名、两个提取主体AST等价、字节读回和差异审阅；未运行项目测试。本批CI待授权交付，不把前批347等结果当本批通过。真实Prisma/Compose配置往返、镜像内本地CLI、PID1/StopPost/信号/重启、备份恢复及实际业务兼容尚无本批证据；状态查询原operationSuccessProven=false保持，不根据unit成功/记录推断发布完成。

本批只完成完整SQL任务源码接线，不宣称第二批或最小执行器交付完成。下一步复审并补齐受控兼容镜像回退、统一验真打包/安装与Mac薄入口、实际系统Python/Compose/systemd及依赖验证；统一真实隔离采集、连续双发布、SSH断线/SIGKILL/socket/daemon/VM重启、工具交付中断及恢复演练后，才能申请生产过渡与准确main发布。九helper/三drop-in需统一版本交付，原controller源码仍须正式17+Manifest Bundle过渡；不覆盖现役文件、不手改hash或放宽250/300旧guard。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件/生产目录、Docker/systemd/SQL/AWS操作。

## 迁移后的应用交接（2026-10-27，源码已合并）

**2026-10-27 当前进度：POST_MIGRATION_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**同一task新增内部handoff_migrated_release，持原job/计划锁和维护目录FD，独立核同一SQL批准后，复用原create/register→start/readiness→finalize锁内主体。原计划字节/planId不变；迁移后history按原历史+准确批准pending的applied差量验证，不清空pending或伪造无迁移计划。v3/MIGRATION_VERIFIED仅可前进到保留migration与candidate两组准确对象的v4创建意图；后续原阶段/唯一ACTIVE/准确restart策略/最终清标记继续使用同一实现，迁移容器保持退出、restart=no且不删除。

迁移执行批已由[PR #2996](https://github.com/sanqin888/sanqinMVP/pull/2996) 最终head `9da4771dbc7f7f2768b9d8a932471ab1a218ce5b` 经 [CI #7677](https://github.com/sanqin888/sanqinMVP/actions/runs/40514962099) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各331、Runtime1080、准确CPython3.12.15回归412），合并dev `e013287898a88dba7af375f9dc96279055b8f550`。首次CI #7676发现持久转换表遗漏新阶段，修复提交9da4771d仅补REGISTERED→STARTING_MIGRATION→MIGRATION_VERIFIED与事故转换，保留原不可变字段检查；不是放宽门禁。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

### 原计划、持久记录与共享阶段

- migration_container新增assert_application_history：无SQL仍要求原history完全一致及v1/v2记录；有SQL则要求v3已VERIFIED或v4、相同目标/旧SHA/准确批准摘要、原迁移ID/image/digest/固定命令和exited/零退出/无OOM/重启证据，以及准确已批准history差量。SQL历史被改动、缺项、额外/失败/重复项、缺失或被替换的迁移对象均阻断，不用Prisma命令退出码单独批准应用运行。
- guard的未安装记录扩v4，仅在原字段上同时保留migration和candidate；原v1/v2/v3仍按各自结构读取，旧读取器遇v4拒绝。v3 VERIFIED→v4 CREATING_CANDIDATES须先核实际迁移历史/退出/原writer已停/备份unit/角色全集；随后登记仅允许相同v4、准确三created对象、candidate release与migration release一致、原/迁移/候选ID不重叠。新阶段转换保留migration原字段不可变，禁止降级、删证据、回到VERIFIED或重放。
- 原候选创建主体增加专用pending_config适配函数参数，只有task内部SQL交接传入原starter的PENDING/Manifest/运行文件/展开配置核验；未提供该函数的普通create入口仍拒绝SQL。它不是跳过检查开关，SQL分支还必须具有准确VERIFIED记录和实际history/迁移完成证明。无guard→starter反向导入；task已依赖二者。无迁移仍走原snapshot/历史校验及写PENDING，SQL分支保留已写PENDING、旧.env且不重复state写入。创建固定同一三服务、不涉及DB，前后核DB身份与实际history。
- start/readiness/finalize共享主体以同一history核验替换“必须无pending”的局部断言；只允许v2无迁移或v4已验证迁移，不能只删SQL限制。启动前后、每次运行健康检查、ACTIVE前与原策略恢复后的最终交接重核迁移对象；实际history在创建/登记/启动/就绪/ACTIVE前及提交封口前重核。原.env替换、唯一ACTIVE、原策略逐对象读回、HANDOFF_COMMITTED及最后clear顺序未更换，也不另建发布状态。
- v4失败收尾先停保存迁移ID，再停已登记应用候选与原writer，最后核对象/门禁；部分create尚无完整候选ID时仍FENCE_UNCONFIRMED，不猜对象或自动恢复业务。已执行SQL保留实际账本，应用失败不反向迁移或恢复旧盘；ACTIVE已写后的失败继续保留实际ACTIVE+INCIDENT，最终封口/clear未知沿原不覆盖、不重放边界处置。正常成功保留退出的迁移容器供核对，不自动rm。

### 验证、交付和结束位置

新增16项离线模型测试，从可丢弃的已验证迁移边界出发，运行原create/start/finalize主体，覆盖完整同锁交接、唯一ACTIVE/计划字节不变/不重复SQL或PENDING、批准/attempt/历史/退出/命令负例、部分create与禁止重放、启动/目标readiness/ACTIVE前history漂移、ACTIVE后策略失败、创建意图/提交封口/清标记结果未知、v4坏结构/ID重叠及锁竞争。Docker/SQL/配置、来源/时钟及文件writer为替身，真实临时计划/维护文件不代表真实生产迁移或容器行为。原candidate writer/creation-intent两份夹具改成准确无pending计划；它们原本借用了pending SQL的通用freeze夹具，新条件下不能以未验证迁移进入应用创建。原断言保留，并新增冻结SQL未验证不得进入应用意图的回归。

仅Python3.10 AST/静态名字/重复测试方法/差异审阅，项目测试未运行。本批不宣称SQL整任务贯通、第二批完成或可安装；所有九helper必须统一验真交付，不能让新记录被旧版本工具处理。guard仍独占持久记录/转换/收尾，migration_container拥有SQL对象/历史检查，task只编排原三个阶段，无新模块/反向导入环或12上下文owner/债务/scanner基线变化，未运行scanner。

尚未把SQL批准/冻结/迁移创建/执行/本次交接串入同一systemd提交主线，原submit/run继续拒绝pending SQL，本内部函数没有CLI。必须仅在前一迁移执行调用已知成功的同一任务中使用；读取到VERIFIED记录不是从持久结果未知/事故恢复或续跑的许可。下一步统一SQL任务参数、阶段间锁及整体超时/StopPost，再补受控回退、固定交付/安装与Mac入口、真实隔离故障/连续双发布/恢复和生产过渡。九helper件数与17+Manifest/250/300旧guard不变，原controller正式Bundle交付仍待完成。三组研究暂停、不取消；无依赖/业务schema/迁移文件/生产目录、Docker/systemd/SQL/AWS操作。

## 已登记迁移执行与准确历史核对（2026-10-27，源码已合并）

**2026-10-27 当前进度：MIGRATION_EXECUTE_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**同一task新增内部execute_registered_migration及锁内主体，原job/计划锁和维护目录FD贯穿批准/时效、唯一PENDING与旧.env、Manifest/运行合同/展开配置、DB/history/备份/准确来源/缓存API digest与SQL inventory重核。只从同一v3/MIGRATION_REGISTERED进入；先耐久STARTING_MIGRATION再start已保存ID并wait，阶段monotonic预算900s（含重核与等待，start至多30s）。wait返回0还须确认同一对象exited/ExitCode=0、无OOM/Dead/Error/重启，以及数据库历史准确增加本计划有序pending对应的applied行、保留原历史含rolled-back行与重复数量，无额外SQL或失败项。复核完成写MIGRATION_VERIFIED，仍保留PENDING/维护标记/原策略禁止重启；不是ACTIVE或恢复许可。

迁移只创建批已由[PR #2995](https://github.com/sanqin888/sanqinMVP/pull/2995) 最终head `b22b4ba0ad66d1eed2f798c02504048d5686e9a6` 经 [CI #7674](https://github.com/sanqin888/sanqinMVP/actions/runs/40512651573) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各315、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `49e1d65705119386b21c79c144bdf30d8c078ed8`。提交前修正Compose美元转义实现为两个美元符号，原回归用例随本head通过。其原LOCAL/未运行描述是原审阅时点，仍未安装/隔离验收。

### 执行、持久化及未知边界

- 仅同一plan/attempt、完整登记ID+image ID、独立准确SQL批准摘要及原目标证明匹配可进入；同一锁内核原writer停写、created迁移对象与完整inventory，无新pull/create/retry。已有starting/verified/incident记录均不可重放。普通URL/命令/SQL或任意容器ID不进入接口。
- 执行前沿原starter的PENDING/配置核验，复核DB Id/Image/Mounts、原history/备份、门禁及备份unit；来源/镜像SQL探测后再次检查配置/DB/history，不能把原create时点观察当执行许可。固定start只用保存ID，wait仅等待该ID；原固定npx --no-install配置才会在容器内运行，未接旧tag-based迁移路径。
- migration_container继续拥有对象完成与历史差量检查，不反向导入guard；guard只扩展未安装v3的两个阶段枚举，原持久字段不增、v1/v2仍只接受各自阶段，历史v3可读。新读取器必须与其余九helper统一安装，旧版读取器遇新阶段拒绝，不能混装或回退重放。此为未安装工具内部原子更新，业务/公开合同无变化。
- 历史比较以name/sha256/state原始行的多重集核准确delta，不依据显示排序、不删旧rolled-back行、不把旧行“修正”为applied。固定只读查询仍规范排序；名称/摘要及数量必须与原历史+已批准pending全部一致。这是Prisma账本核对，不证明任意SQL的业务安全、结构/数据语义或外部副作用正确；人审和最终验收仍须完成。
- STARTING写入fsync/readback未知时不start、不重写；start结果丢失、wait超时/非零、对象/DB/history结果未知或不符时，原incident收尾只停保存迁移ID及原writer，保留实际数据库和PENDING。阶段900s耗尽后收尾另用原每命令45s上限，若未来任务外层预算已耗尽仍由独立StopPost兜底；停止不能确认仍FENCE_UNCONFIRMED。无反向迁移/旧盘恢复、重试、清标记、restart恢复或删除迁移证据。
- 最终VERIFIED写入耐久未知时仅尽力停保存对象，保留原件实际阶段，不覆盖为另一个已知结果。即使原件显示VERIFIED，调用失败也不代表操作成功或可以继续；查询/人工核对后另行处置。

### 验证与下一步

新增16项离线模型测试，覆盖同锁/保存ID/完整流程、准确批准与对象、历史/备份/来源/SQL漂移、初始和最终持久未知、start结果丢失、wait超时/非零、真实inspect返回的退出/OOM/Dead/Error/重启负例、部分/未知history、DB替换、预算/竞争和禁止重放；临时私有文件真实，Docker/SQL/配置/来源和时钟为替身。这里只进行Python3.10语法AST、静态名字/测试方法名/差异审阅，未运行项目测试。真实Docker wait/Prisma/package/Compose、systemd PID1、SSH断线/SIGKILL/socket/daemon/重启及恢复尚无本批证据。

本批未接submit/run的SQL批准参数或完整异步SQL主线；原CLI仍拒绝pending SQL。后续须在同一批准/维护证据下接迁移后的应用create/start/finalize（实际history已变化，不能伪造原计划或删除SQL拒绝条件），再补受控回退、统一安装/Mac入口、真实隔离中断/恢复与连续双发布验收。九helper件数不变，无新执行器/批准数据库/current权威；17+Manifest/250/300旧guard保持，原controller正式Bundle交付仍待完成。业务schema/迁移/依赖/生产目录和unit不变；三组研究暂停、不取消，未执行生产Docker/systemd/SQL/AWS。

## 迁移容器只创建与登记接线（2026-10-27，源码已合并）

**2026-10-27 当前进度：MIGRATION_CREATE_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原task新增内部prepare_migration_container，持原job/计划锁和维护目录FD贯穿重核、迁移意图、唯一PENDING、只创建、DB/history复核和准确ID登记。锁内重核准确SQL批准、计划时效/原配置/Manifest/运行合同、历史/备份/候选证明/缓存API digest及镜像SQL清单；配置只含一个迁移服务与已有external网络，DATABASE_URL通过原有界私有stdin传入并转义Compose美元符号，不转发JWT等API秘密。固定create --no-build --pull never、180s，不start/SQL/ACTIVE/改.env；未知保留意图/PENDING且禁止重跑。

原guard的begin/register主体提取为同一锁内实现，原公有入口仍加锁后委托；task内部编排直接复用两个实现，不跳过锁或复制持久化逻辑。Docker单对象配置由原migration_container模块生成，无第十helper；guard只增加两个委托入口，不扩大其迁移对象校验职责。唯一发布状态复用原write_creation_pending（reason仍为candidate-create-start），原.env保留旧SHA，绝不新建版本权威；只有后续完整SQL/应用交接才可ACTIVE。

准确迁移配置：仅sanq-migration服务，固定API digest、attempt名称、plan/attempt/role标签、/bin/sh和本地npx --no-install prisma命令、restart=no、非privileged、无应用挂载/DB服务/depends_on，使用已有sanq-app_default网络，固定资源限制并禁用healthcheck。只将已展开API环境中的DATABASE_URL放入私有JSON stdin，$转义为$$以避免Compose二次插值；不把凭据放argv/维护记录/普通日志，不加.env转储。没有运行shell/npm/Prisma，命令只是尚未启动容器的固定配置。缺DB URL、坏批准、SQL inventory或来源/当前基线漂移在意图前拒绝。

原意图fsync/readback成功后才写PENDING，原state writer自带的耐久读回未知时不create。一次固定Compose create不使用force-recreate、不重试；创建前后核同一DB完整Id/Image/Mounts及原迁移历史，随后只能从本attempt完整列表取得唯一ID，再调用同一created/no-restart/digest/标签/命令核验登记。部分创建、命令/同步/DB未知保留v3意图、空ID和实际PENDING，不扫描猜取/停止未登记对象或恢复业务。创建后登记前若管理器收尾，沿原逻辑保留FENCE_UNCONFIRMED。

新增9项离线模型测试，覆盖完整锁/单服务/私有配置/凭据最小化/美元转义、批准/attempt/基线/SQL漂移、缺DB URL、初始意图/PENDING/创建未知、DB替换和竞争；原意图/登记9项测试继续通过同一主体使用。只做Python3.10 AST、阶段主体对照/方法名/静态名字/差异审阅，项目测试未运行。原task submit/run仍拒绝pending SQL，本函数没有CLI/异步接线。下一步独立批准传入任务、执行前完整重核、仅start保存迁移ID并有界等待/核准确DB历史、再接应用交接；回退/安装/Mac入口、真实中断/恢复/连续发布和生产更新仍OPEN。九helper一致安装/17+Manifest正式Bundle规则保持，业务schema/依赖与三组暂停研究不变，无生产Docker/systemd/SQL/AWS操作。

迁移登记批已由[PR #2994](https://github.com/sanqin888/sanqinMVP/pull/2994) 最终head `531d95036dc55d735ae8a92598cabeaf8b88d1ab` 经 [CI #7672](https://github.com/sanqin888/sanqinMVP/actions/runs/40507815863) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各306、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `0224e0eb7bfba9b762d5098a0da673fa63d81eb2`。原本地未运行/未提交仅为原审阅时点；仍未安装/隔离验收。

## 迁移容器意图、登记与事故收尾（2026-10-27，源码已合并）

**2026-10-27 当前进度：MIGRATION_REGISTRATION_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原guard新增内部begin_migration_creation/register_created_migration，无CLI或任务调用。原FROZEN计划/attempt及独立SQL批准匹配、原writer已停/门禁/备份状态核验后，先将同一维护标记升级v3/MIGRATION_CREATING，容器身份暂空；只允许登记created、restart=no、非auto-remove、无挂载/非privileged、固定网络/名称/命令、准确计划标签/API digest与实际image ID/revision的平台对象。登记后MIGRATION_REGISTERED，不start或执行SQL。事故收尾先处理登记迁移ID再处理原writer；空身份/缺失/额外对象保持FENCE_UNCONFIRMED，不猜ID、不重放或清标记。

新增migration_container.py仅持有迁移对象验证/只读inventory，不反向导入guard；guard仍独占维护原件、阶段转换、两个原锁和失败收尾，未新增发布状态或批准数据库。辅助件从八增为九件，第三批必须统一来源/版本/权限交付，不放进17 Bundle。guard约817行，此次按职责把新对象检查拆到小模块，持久状态转换留原owner；未夹带旧阶段重构。v1/v2仍可读；v3只含原基线和migration描述（准确release/批准摘要/可空container ID+image ID），不含candidate应用集合，不能降级、替换登记或重放。v3只能从MIGRATION_CREATING到REGISTERED或INCIDENT，REGISTERED只能事故收尾，尚无SQL运行/完成/应用接续阶段。

begin先核root/锁/原计划canonical/时效/pending非空/准确批准、同一FROZEN/attempt/旧SHA、原对象已停/no-restart、备份unit与已安装门禁，检查本attempt无迁移对象，再fsync/readback意图。登记再核原件、批准/时效/目标、原停写/备份与门禁，只接受完整单一ID和尚未启动对象，写前与写后核实际容器；目录残件/失败保留。该记录不是SQL执行许可，未重新核DB历史/备份内容/完整候选来源的执行前检查仍须下一步补齐。

迁移对象固定/bin/sh和受审阅migrate deploy命令，名称sanq-migrate-<attempt>，三项plan/attempt/role标签、sanq-app_default网络、无挂载、restart=no、AutoRemove=false及实际API镜像身份。未知/已运行过的对象不能首次登记；未来创建命令必须明确设置这些条件，不能直接套旧Compose run。当前源码**没有**创建/启动/等待迁移容器，没有执行SQL或变更发布.env/state。StopPost复用原收尾并核迁移对象created/exited且不运行、准确ID/image/角色列表；它只证明保存写入者已停，不证明迁移成功、失败或可重试。无登记ID时只停保存旧writer，固定FENCE_UNCONFIRMED，不扫描认领未知新对象。

新增9项离线fixture测试：意图先于登记、准确批准/attempt/root/竞争、未登记未知、迁移先停、缺失对象、命令/镜像/标签/网络/挂载/策略拒绝、已启动/额外对象及意图/登记fsync未知。Docker/PID1/SQL均为替身；仅Python3.10 AST/名字/差异审阅，项目测试未运行。下一步实际create-only与登记接线、批准传入任务、在完整执行前重核下启动/等待迁移和准确历史核对、迁移后应用交接；安装/回退、统一真实故障/恢复和最终生产发布仍OPEN。原task继续拒绝pending SQL。固定17+Manifest/旧guard、业务schema/migration和依赖不变，无生产目录/unit/Docker/DB/AWS操作；三组研究继续暂停。

SQL审阅批已由[PR #2993](https://github.com/sanqin888/sanqinMVP/pull/2993) 最终head `2d76d1da35ee98bee6183961816622e837a7ac6e` 经 [CI #7670](https://github.com/sanqin888/sanqinMVP/actions/runs/40504787295) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各297、Runtime1080、准确CPython3.12.15回归412），合并dev `afbd7c515e15603d5eff8b588c4f27561a98a578`。首次CI #7669因GitHub blob测试替身未接受token关键字导致CLI成功用例失败，仅补**kwargs后通过，生产逻辑/门禁不变。原LOCAL/未运行是原审阅时点，不等于已安装/隔离验收。

## 准确 SQL 审阅与批准绑定（2026-10-27，源码已合并）

**2026-10-27 当前进度：SQL_REVIEW_BINDING_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**在原plan/collector补准确待执行SQL审阅与批准范围绑定，不新增helper、批准数据库或版本权威。plan.sql_review给出planId/目标/API digest/有序原始SQL元数据及域分离approvalSha256；assert_sql_approval只核独立传入的准确摘要，缺失/布尔/planId/错摘要拒绝，无pending只接受None。原prepare/show摘要新增sqlReview，show-sql按计划gitBlobSha读取固定SanQ GitHub blob，核size/base64/原字节SHA-256和Git blob SHA-1后展示UTF-8原文与准确commit来源；所有SQL核完且完整JSON不超过4MiB才输出。canExecute/sqlSafetyAssessed始终false，摘要不是授权凭证/安全判定，不写批准文件或执行SQL。

### 当前范围和交付接口

- 复用原canonical计划及独立planId：批准范围的域为sanq-exact-sql-review-v1，包含planId、目标SHA、准确API image ref/digest和pending原顺序的name/sha256/bytes/gitBlobSha。planId已经绑定current/配置/运行合同/备份/完整inventory/history/paired images，任一变化或重新生成计划都使摘要变化；不是永久--apply-migrations或布尔批准。摘要可公开核对，没有签名/issuer/新PKI/离机服务或额外current/previous。
- `prepare/show`继续REVIEW_ONLY，并显示sqlReview；新只读`show-sql <plan-id>`从原私有计划读取，只GET固定仓库的准确blob SHA，不收任意URL/文件/SQL输入，不启动Docker、数据库或systemd。对SQL原字节做size/SHA-256/Git blob SHA-1三项核验，保留UTF-8/LF/CRLF，附准确目标commit文件链接；拒绝坏编码、错误大小/内容、非UTF-8或超预算，不先打印部分SQL或批准摘要。输出原文属于显式审阅操作，不进入发布任务普通日志。
- `assert_sql_approval`是后续执行路径复用的纯校验函数；哈希相同不证明操作者已经审过SQL、不证明无破坏性，也不是生产迁移授权。人仍须审阅兼容/数据保留/锁/备份/维护范围；真正执行前还要重新验证准确计划、时效、proof、实际DB历史与pending集合，不能用过期审阅快照跳过重核。
- 无pending时审批摘要None，show-sql不访问GitHub，不凭空执行SQL。审批/展示内容只派生自原计划，不改计划v1、维护v1/v2、job/state schema；summary字段/只读子命令为兼容新增，无已安装消费者或双写。固定17+Manifest/旧guard和八helper交付件数不变。

### 验证与结束位置

新增13项离线模型测试，覆盖准确范围/无执行权限、目标/image/config/runtime/history/时间/SQL原字节改变使旧批准失效、坏批准/计划原件、无pending不联网、准确pending-only blob和固定来源、坏元数据/内容/编码、UTF-8/CRLF保持、原文/JSON预算和CLI失败不输出部分SQL；Docker/DB/网络均不执行。本地仅Python3.10 AST、方法名/静态名字/差异审阅，尚无本批CI；前批284等结果不替代本批验证。

**迁移执行尚未接通：**release_task及create/start/finalize仍明确拒绝pending SQL，CLI没有接受此摘要的迁移执行开关。下一步把独立批准传入管理器任务、在原停写下重核并登记准确迁移临时容器，再执行/核对准确迁移历史、将其纳入超时/SIGKILL/StopPost和未知结果阻断，最后才接回候选应用交接。不能直接套用旧tag-based migrate deploy或在运行结果未知时重试；不自动反向迁移/恢复旧盘。受控回退、安装/Mac薄入口、真实隔离故障/连续双发布/恢复和生产发布仍OPEN。三组研究继续暂停、不取消，本批无依赖/schema/迁移文件、生产目录/unit/SQL/AWS操作。

无迁移任务贯通已由[PR #2992](https://github.com/sanqin888/sanqinMVP/pull/2992) 最终head `1f9b424056db494930edfa73f7ed950ba70b4607` 经 [CI #7667](https://github.com/sanqin888/sanqinMVP/actions/runs/40501959449) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各284、Runtime1080、准确CPython3.12.15回归412），合并dev `73a8a162325e1dfcba10515541a00837ed8a9937`。首次CI #7666中SQL拒绝测试重复保存原fixture计划而报错，仅把该测试createdAt改成独立时间戳，同分支追加 `1f9b4240` 修复；生产逻辑/门禁未改。原本地未运行/未提交为审阅时点，不代表隔离或生产已通过。

## 无迁移异步任务贯通（2026-10-27，源码已合并）

**2026-10-27 当前进度：NO_SQL_TASK_CONNECTED_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原release_task已接入同一无迁移计划的freeze→create/register→start/readiness→finalize；同一job锁/计划资源锁/维护目录FD贯穿阶段交接，四阶段主体提取为原入口与任务共同使用的内部函数，AST对照确认主体逻辑不变，不复制第二套发布器。执行/排队前拒绝pending SQL和目标等于当前版本；CLI提交确认改为--confirm-release，原--confirm-maintenance不再接受，unit前缀改为sanq-release-apply-，无已安装消费者。仅最终原finalize清标记已知完成返回ACTIVE；保留未知/事故语义。

### 流程、互斥与终结边界

1. 提交仍需root、固定task路径/权限、同版本helper API、有效三份启动门禁、无维护证据/未完结只读任务和同一计划时效。明确确认完整发布才systemd-run --no-block；未确认、旧确认参数、pending SQL或相同目标拒绝。排队结果不明仍不重试，不用latest重新选目标。
2. systemd管理器身份/PID/cgroup/固定ExecStart/StopPost验证后，任务持原job锁→计划资源锁→维护目录FD，完整执行四阶段；直接调用同一阶段主体的锁内函数，不调用会再次加锁的外层入口，不增加重入锁/跳过锁布尔开关、任务数据库或版本权威。公共阶段入口仍获取原锁并委托同一主体；属于未安装内部工具的原子实现调整，marker v1/v2、计划/只读job/state schema不变。
3. freeze重新采集同一目标（禁止pull），原计划/备份/历史/配置/成对证明变化拒绝，原停写记录先耐久；create只创建固定三服务并登记同一attempt，start只启动记录ID并验证；finalize仍独占原.env/唯一ACTIVE/准确原策略/最后clear的交接，不改变既有partial/unknown处理。
4. 原所有阶段持锁至最终函数返回，包括重核/网络证明/备份读取/创建/健康/成功清标记，竞争任务与资源探测在阶段间也无法插入。status原维护阶段和unit仍可只读查询，深度联合观察因锁忙返回UNKNOWN，不冒充一致快照。锁释放不等于完成、重跑或恢复许可。
5. 任务没有通用异常重写器或finally开业务；部分create、初始/终结fsync未知保留原阶段证据；启动/交接中途失败沿用原事故收尾。Python结束/被kill由原ExecStopPost独立处理保存ID。最终clear未知若marker已消失，仍可能是已选且运行的目标，StopPost不重建/反写版本；marker存在时可沿原路径停写/记事故。不能因unit成功单独认定发布完成。

### 时间预算、交付与验收

- 同一monotonic执行预算1800s，阶段进入/外部命令/每次GitHub调用前后检查剩余时间；命令timeout取本身上限与剩余预算较小者，原create180s、start30s、health90s、两次readiness各300s等局部限制保留。GitHub传输仍有自身15s超时，不改暂停的来源链研究。
- systemd TimeoutStartSec从维护准备的900调整为2100，给进程级1800预算及有限收尾留出余量；TimeoutStopSec独立900，Restart=no/kill control-group/root/Memory256M/CPU50%不变。阻塞文件/同步无法由Python预算强制中断，以管理器硬超时兜底，真实行为仍待隔离验收；1800/2100/900不是停写保证或性能承诺。进程预算耗尽时其命令收尾可能同样被拒绝，应保留未确认并由新进程StopPost预算重新核对，不自动放行。
- task一致API检查补四个锁内函数，并在停写前核controller写PENDING/原atomic writer/ACTIVE writer及SHA替换API，缺件先拒绝；八helper及三drop-in须统一验真交付；不增加第九helper或新unit模板，不修改17+Manifest/250/300旧guard。前批controller源码仍需正式Bundle/Manifest交付，不覆写现役文件。
- 新增13项全任务离线测试，使用真实临时维护/计划文件和四阶段主体、Docker/PID1/采集/文件/网络证明替身，覆盖完整顺序/互斥/唯一ACTIVE、SQL拒绝、部分创建不重放、两次readiness失败、封口/清标记未知、预算/命令上限、竞争和旧确认参数拒绝；更新原task入口/安装API/无SQL夹具。仅Python3.10 grammar AST、阶段主体AST对照、方法名/差异/导入审阅，尚未执行项目测试，待授权提交后的最终head CI。

本批只完成无迁移任务源码接线，不宣称第二批/项目完成。下一步：对最终head CI修复后，继续准确SQL批准/执行和受控回退；第三批固定交付/系统实际Python/权限/安装与Mac薄入口；统一真实隔离采集、连续两次更新、断线/SIGKILL/socket/daemon/VM/工具中断与恢复；最后独立授权生产过渡及至少一次准确main发布。三项研究继续暂停、不取消；无依赖包、业务schema/迁移、生产目录/unit/Docker/DB/AWS操作。

连续更新修正已由[PR #2991](https://github.com/sanqin888/sanqinMVP/pull/2991) 最终head `f37426a7088be8ff7e189d0995617be5281012ce` 经 [CI #7664](https://github.com/sanqin888/sanqinMVP/actions/runs/40498211632) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各271、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `15fcbdcf1af0adbd32f48875e76073a918c89523`。此前本地未运行/未推送为原审阅时点；仍未安装/隔离验收。



## 连续更新修正（2026-10-27，源码已合并）

**2026-10-27 当前进度：CONSECUTIVE_UPDATE_FIX_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**修正首次digest候选成功交接后，下一次维护仍只识别SHA标签的问题。原guard._inspect保留固定仓库/角色/完整ID及显式候选引用的精确检查；旧writer若声明digest，逐次以实际image ID核linux/amd64、RepoDigests和目标revision。入维护前再与准确已封存release的SHA标签或digest二选一对齐；后续停写/登记/启动/交接/事故收尾通过同一检查并核原保存image ID，无新marker字段、发布权威或恢复入口。新增7项离线测试方法未运行，其中一项从真实阶段代码完成第一次交接，再对同一digest容器进入下一计划的freeze与创建意图；Docker/采集/GitHub为替身，尚未完成真实连续两次发布验收。

修复范围为Runtime/Ops内部原子改动，保持函数签名/marker v1/v2/schema及已安装状态不变。旧SHA标签仍精确匹配，digest不是任意字符串放行：固定服务仓库、合法sha256、实际image ID/平台/revision/RepoDigests均须通过，首次观察还须匹配准确current release seal；latest、错SHA、外来仓库、坏digest、未封存本地alias或错revision/平台继续拒绝。显式candidate reference分支仍只接受计划中同一个digest。既有v1停写、v2原对象验证、starter原对象验证与共享incident收尾均复用修正；没有另存原始引用或更改current/previous。新增digest观察会增加有界只读image inspect，不pull/build/start或补标签。

测试包含SHA/digest混合维护、镜像平台/revision/digest负例、错误引用拒绝、未封存本地alias拒绝、原image ID替换拒绝、失败任务对digest原对象的确认停写，以及首批handoff→下一准确计划→freeze→创建意图模型。保留原策略（含重试次数）、唯一ACTIVE、维护阻断及无SQL语义。该模型只覆盖已发现的跨次边界，第二次完整create/start/finalize尚未贯通，不能宣称真实双发布已通过。

仅Python3.10 grammar AST、测试方法名/差异/导入静态审阅；本地未运行项目测试，待授权提交后以最终head CI为准。源码属于原八helper之一，不增加交付件，不更改17+Manifest/250/300旧guard或现役Runtime；统一安装与前批controller正式Bundle交付仍待完成。下一步仍为同一异步任务贯通及阶段间互斥/超时预算、准确SQL/回退、Mac入口/安装、统一隔离故障与连续两次真实发布验收。三组研究继续暂停、不取消，无生产Docker/systemd/DB/AWS动作。

联合状态批已由[PR #2990](https://github.com/sanqin888/sanqinMVP/pull/2990) 最终head `9737d0e338719cfbbb1017c2c3fc93615ddd6f87` 经 [CI #7662](https://github.com/sanqin888/sanqinMVP/actions/runs/40443398580) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各264、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `efc0afebe595a760471f561012ae320e431da913`。其原LOCAL/未运行为审阅时点，仍未安装或现场验收。

## 第二批续作：联合状态查询（源码已合并）

只扩展原task，不新增第九helper或执行入口。原unitState/maintenancePhase保留，新增releaseObservation；unit成功或消失都不能替代现场观察。锁忙、文件/安装/容器读失败与变化返回固定UNKNOWN，不回显任意异常或秘密；原维护记录损坏/残件继续报查询失败，不伪装无维护。查询只读取.env中的SHA，不返回环境正文。互斥沿用原锁设施，可能创建原.release.lock文件，不写发布/维护记录或容器策略。

有marker返回MAINTENANCE_RETAINED（外来计划标OTHER_PLAN），不据ACTIVE或COMMITTED自动清除/续跑。无marker但非准确目标ACTIVE/previous/reason返回RELEASE_INCOMPLETE。目标符合才读取实际容器/image/revision/digest/健康/角色全集/bind与DB，重读state/marker/配置快照/对象身份拒绝变化；成功仅TARGET_RUNNING_OBSERVED，固定operationSuccessProven=false。原策略记录随成功clear消失，查询不能反推出历史策略已耐久恢复，也不能证明此前clear的fsync成功；保留这种证据边界，不另造成功回执或current/previous权威。健康是有限时点观察，不是全程运行保证；不执行公网readiness、迁移、备份解压或最新发布链网络查询，过期计划仍可查询历史目标，不能因此apply。

新增9项观察替身测试未执行；只做Python3.10语法/测试方法名/差异静态检查。八helper统一交付仍待安装，17+Manifest/250/300与前批正式Bundle需求不变。下一步接通同一异步任务的无迁移freeze/create/start/finalize并处理阶段间互斥；SQL授权执行、回退、Mac薄入口、隔离故障/恢复与真实发布仍OPEN，MINIMAL_EXECUTOR_COMPLETE未达成。本批不操作生产。


**2026-10-26 当前进度：JOINT_STATUS_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**成功交接已由PR #2989 / CI #7660合并dev `3391cf495dd9bbb4d56d2ae46648d75c6e2f44b1`。本批在原release_task.status内增加联合只读观察：同一job/计划锁内读取原计划、唯一发布状态与维护记录；有维护记录即保留未完结语义，无marker且准确目标ACTIVE才核安装合同、环境/状态一致、实际三writer/image digest/健康/角色列表/bind及DB，并重读关键观察拒绝漂移。返回TARGET_RUNNING_OBSERVED也固定operationSuccessProven=false/canExecute=false；它不是clear耐久回执、原策略恢复证明、最新GitHub证明、SQL兼容证明或重试/恢复许可。无新helper、常驻服务、发布状态、包依赖/业务迁移或生产操作；三组研究继续暂停。

**2026-10-26 当前进度：SUCCESS_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**前批启动/就绪由[PR #2988](https://github.com/sanqin888/sanqinMVP/pull/2988) 最终head `6ca86a55d1aadef814f37d97d9f999212f55608f` 经 [CI #7658](https://github.com/sanqin888/sanqinMVP/actions/runs/40427556642) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各234、Runtime1080、准确CPython3.12.15回归412），合并dev `d87c98b50582fc2ff58165921926433d4710776b`。首次CI #7657发现测试controller夹具缺COMPOSE属性，同分支仅补一条路径后通过，不改生产逻辑/门禁。本批补READY候选的成功交接源码，仍未接CLI/异步任务，没有真实Docker/HTTP/SQL/AWS或生产安装。三组研究继续暂停、不取消。

## 第二批续作：成功交接与受控清标记（源码已合并）

### 顺序、唯一权威与故障边界

新增内部 `finalize_candidates.py`，只接受同一无迁移plan/attempt的CANDIDATES_READY，不提供事故恢复、手动clear、任意命令或CLI。它引用原controller的atomic_write/write_state、原启动验证、共享事故收尾和同一组锁/维护目录；不新增发布数据库或current/previous权威。平台辅助件现为**八件**加原三份drop-in，第三批必须统一来源/版本/导入/权限验真；本模块不加入固定17 Bundle。

1. 持原job锁及计划资源锁，重核READY、原pending/current/previous/reason、原.env/配置、Manifest/两运行文件、计划时效、无SQL、备份/历史/准确候选证明、准确候选健康/绑定、DB、备份unit与门禁。任一不符先拒绝；不从旧FINALIZING/INCIDENT/HANDOFF_COMMITTED继续或重放。
2. 先持久FINALIZING，再用既有atomic_write只替换.env的SANQ_IMAGE_SHA值。对原字节/UID/GID/mode重核，保留其他内容及LF/CRLF，文件最终mode/owner元数据及父目录分别fsync后读回；按原展开配置仅替换三服务的SHA声明得到期望值，实际展开配置必须逐项相同。实际容器仍按已保存image ID/digest认证，不把可变SHA标签当镜像证据。
3. 用目标.env执行固定readiness，复核候选/DB/历史及唯一pending，再通过原state writer把**唯一发布状态**写为ACTIVE（目标/原previous/readiness-verified），fsync目录并读回。ACTIVE记录的是已选且验证的目标版本；维护标记存在时交接仍未完成，不能仅凭ACTIVE启动新发布/冷启动或报告操作成功。
4. 只对保存的三候选ID逐项恢复各自原restart Name/MaximumRetryCount，包括on-failure次数、unless-stopped或原no，不一律always。逐对象健康/实际策略/挂载读回，DB/备份unit、目标配置/ACTIVE和门禁再核；不改timer enabled/active，也不start旧容器。
5. 全部确认后持久HANDOFF_COMMITTED，再核同一plan/attempt和目录仅有marker，最后unlink marker→fsync维护目录→空目录读回；只有此调用已知完成才返回ACTIVE。HANDOFF_COMMITTED本身不开放冷启动或赋予恢复/clear权限。
6. FINALIZING之前写入未知不改.env/state/policy。其后、提交封口之前失败时只停保存对象并保留INCIDENT/FENCE；.env与发布状态保持实际结果，**若ACTIVE已写，不自动改回旧版本或伪造PENDING**。ACTIVE+INCIDENT表示目标已选但事故未处置，不能报告完整交接成功；新发布/冷启动仍被维护目录拒绝。
7. 最终HANDOFF_COMMITTED写入/同步未知只尽力停保存ID，不重写未知marker。**最后清标记未知属于终结边界：**此时ACTIVE/目标配置/策略读回已完成，可能marker还在，也可能已不存在且目标继续运行；不重建marker、重跑或自动回退，以实际state/marker/容器审阅。重启后若marker重新出现仍由冷启动门禁拒绝；若已清空则可启动已确认的目标。不能把这种未知伪装成“仍PENDING且保证冻结”或“操作已成功”。marker若仍在，原ExecStopPost仍可按保存对象停写并记INCIDENT。

启动至交接之间已可能产生订单/外部副作用；失败不授权覆盖旧整盘、逆迁移或抹掉未知付款。固定两次操作目标适用于正常发布，终结未知仍是需审证据的事故/对账场景。

### 验证、交付与剩余工作

新增21项离线unittest方法，使用原create/start fixture、真实临时私有维护文件与Docker/PID1/HTTP替身，覆盖成功顺序/唯一state、准确原策略与重试次数、LF/CRLF/私有env字节、root/attempt/锁/健康拒绝、初始/环境/ACTIVE/封口/clear同步未知、配置/readiness/策略失败、已提交marker被StopPost收尾、禁止错误/有残件clear、target env/owner/Manifest/runtime/config与ACTIVE读回拒绝。没有执行项目测试；仅Python3.10 grammar AST、保留测试方法名/静态名字、差异/导入/引用审阅。前批CI不替代本批验证，mock不是真实故障证明。

marker v2兼容扩充FINALIZING/HANDOFF_COMMITTED，完整三ID/证明/原策略不允许更换；starter只新增内部期望策略读回参数，默认no-restart行为不变。task仅检查新API/签名，没有调用finalize或新增用户命令。Runtime/Ops归属、唯一state权威、固定17成员/Manifest及旧发布guard不变；旧控制器未改，原controller atomic_write被新阶段复用，前批controller源码仍须正式Bundle验真安装。

本批随后由[PR #2989](https://github.com/sanqin888/sanqinMVP/pull/2989) 最终head `22b6f0f88e5a1247320f33c6cac206654137726d` 经 [CI #7660](https://github.com/sanqin888/sanqinMVP/actions/runs/40433850020) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10下Release各255、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `3391cf495dd9bbb4d56d2ae46648d75c6e2f44b1`。前述本地未运行/未推送为原审阅时点；CI不等于隔离或生产验收。**普通无迁移发布的各内部阶段已有源码，不等于完整执行器已完成：**异步任务中freeze/create/start/finalize贯通、终结未知的联合status、准确SQL批准/执行、回退、八helper/单位安装及Mac入口、隔离中断/恢复与至少一次准确main真实发布仍OPEN；当前没有可生产使用的1–2次操作命令。没有新依赖包、业务schema/migration、生产权限/目录/unit或云动作，三组研究继续暂停。

**前批启动/就绪交付：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**前批候选创建已由[PR #2987](https://github.com/sanqin888/sanqinMVP/pull/2987) 最终head `fb9949e54db8de90f7464fc43585187d1bd8b52e` 经 [CI #7655](https://github.com/sanqin888/sanqinMVP/actions/runs/40419873594) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各217、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `067521149fd9104303f09d4c057b4277a489a2cd`。本批补已登记候选的受控启动/就绪阶段源码；尚未由任务或CLI调用，没有执行真实Docker/HTTP/SQL或生产安装。三组研究继续暂停、不取消。

## 第二批续作：准确ID启动与就绪验证（源码已合并）

### 范围、拆分与固定流程

新增内部阶段模块 `ops/release/start_candidates.py`，只负责已登记候选的start/readiness及失败收尾，引用原guard/job/plan/store/collector和既有controller；没有独立发布状态、整套发布控制器、CLI或服务。现有guard约700行、controller约750行，按启动阶段职责单独放置这段实现，原维护策略和失败确认继续由guard持有。平台辅助件从六增为**七件**，加原三份启动drop-in，第三批须把本模块纳入准确来源、统一版本、导入与权限读回清单；不加入固定17 Bundle。task仅校验新增API，没有接入start或新增用户命令。

1. 持原全局任务锁和计划资源锁，要求同一plan/attempt、CANDIDATES_REGISTERED、目录无残件及无未完结只读job。只接受无pending SQL，原维护基线/候选证明与计划一致、计划/备份未过期；重新核对root Runtime、唯一pending状态（目标/previous/固定reason）、原.env/配置hash、Manifest及两运行合同、备份、SQL历史、准确GitHub证明、缓存镜像、资源、DB身份/挂载、备份unit和有效门禁。
2. 核实原保存候选的完整ID/image/digest/角色/所有bind/no-restart，三只仍须created，已经运行过再退出也拒绝。先fsync/读回单份marker的 `STARTING_CANDIDATES`，未知同步不调用start；随后仅按三个已保存ID执行 `docker start`，单项30s，不up/create、不pull/build或改选标签。
3. 最多90s用monotonic观察同一ID、运行/restart/暂停状态、image、bind及health；starting可等待，缺health/unhealthy或身份变化失败。运行固定现有readiness脚本（300s上限）覆盖Prisma只读状态、本地API/worker/Web与公网health/BFF/menu；原.env仍是旧SHA，但脚本仅config/ps/exec与HTTP，不据此create或按标签重建容器。
4. readiness后再次核同一候选健康/挂载、DB身份、SQL历史、备份unit、pending/原配置及门禁，才持久 `CANDIDATES_READY`。返回canExecute=false，不写ACTIVE、改.env、恢复策略/备份或清维护。**候选启动已可能产生订单/外部副作用，PENDING/维护标记不等于业务零写入**；失败不能自动恢复旧整盘/逆迁移或抹掉未知付款。
5. STARTING持久之后的异常/健康失败/Python中断复用原guard同一个锁内事故收尾，不嵌套争锁、不复制停止策略。只处理保存的新旧ID；确认后INCIDENT/TASK_FAILED_WRITERS_STOPPED，确认不了FENCE_UNCONFIRMED，原发布状态保持PENDING，不在finally开业务。
6. 最终READY写入/同步未知时只尽力停原已保存ID，不重写未知记录；保留实际READY/STARTING/残件及PENDING并报未知。查询看到READY只是当前磁盘观察，可能对应已被停止的候选，不能据此推断耐久成功或清标记/营业。READY阶段收到ExecStopPost收尾也继续按保存对象停写并保留INCIDENT。

### 验证与结束位置

新增17项离线unittest方法，复用前批create fixture与临时私有文件；覆盖准确ID/锁贯穿、一次启动/不重放、root/attempt/pending/配置/备份/历史/证明拒绝、健康等待/超时、readiness/Python中断、停止失败/外来替换/DB变化、初始/最终fsync未知，以及真实绑定逻辑对pending/env/Manifest/运行合同与二次配置漂移的拒绝。Docker/PID1/HTTP均为替身，不代表真实SIGKILL/网络/生产通过。项目测试未执行；仅Python3.10 grammar AST、保留测试方法名/静态名字、差异/导入/引用审阅，前批CI不替代本批验证。

marker v2只兼容扩充STARTING_CANDIDATES/CANDIDATES_READY及严格的完整三ID约束，旧v1/前批v2可读，无已安装消费者/双写或降级迁移。共享incident函数只是原收尾的同实现抽取；Runtime/Ops owner和唯一current/previous权威不变。本批不改17成员/Manifest/旧guard，前批控制器源码变化仍须正式Bundle验真交付，不能直接覆写现役文件。

分支 `feat/runtime-minimal-start-readiness-20261026` 随后由[PR #2988](https://github.com/sanqin888/sanqinMVP/pull/2988) 最终head `6ca86a55d1aadef814f37d97d9f999212f55608f` 经 [CI #7658](https://github.com/sanqin888/sanqinMVP/actions/runs/40427556642) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各234、Runtime1080、准确CPython3.12.15回归412），合并dev `d87c98b50582fc2ff58165921926433d4710776b`；首次CI #7657缺COMPOSE测试夹具属性只补一条路径后通过。上文未运行/未提交为原审阅时点，本地仍未执行项目测试。**还不能正常生产更新：**create和start阶段尚未接到同一个异步执行任务，最终.env/PENDING→ACTIVE/原策略与维护标记交接、准确SQL批准/执行、回退、七helper安装/一页手册、隔离故障及真实发布均OPEN。成功READY仍保留PENDING/维护/no-restart，不把它标为第二批完结或最小执行器完成；无新包依赖/业务schema/migration、生产权限/目录/unit或AWS动作。

**前批候选创建交付：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**前批创建意图已由[PR #2986](https://github.com/sanqin888/sanqinMVP/pull/2986) 最终head `1d5d19a12a7fa3abdcf902a7464c753c513c0a85` 经 [CI #7653](https://github.com/sanqin888/sanqinMVP/actions/runs/40400151439) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各203、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `d133e92eef9f76faeb8af8f1272e84eafaf02152`。本批接入无迁移的“准确候选只创建、不启动”内部源码；尚未由任务或CLI调用，没有真实创建/发布或生产操作。三组研究继续暂停、不取消。

## 第二批续作：锁内候选创建与登记（源码已合并）

### 范围与执行顺序

新增原guard内部 `prepare_candidate_containers(plan-id, attempt-id)`，复用同一全局任务锁、计划资源锁与维护目录FD，锁贯穿重核→意图→PENDING→create→挂载/DB核验→登记。begin/register公有adapter仍各自加锁供原内部使用；实际创建主线调用相同实现的锁内函数，不嵌套争抢锁或复制维护逻辑。任务/CLI未接此入口，不能作为当前生产命令。

1. **仅接受无pending SQL。**持锁检查未完结只读job，读同一canonical计划并核时效；重读当前Runtime/配置/发布状态、两运行文件pins、环境键、真实迁移历史及gzip备份，重核准确候选GitHub证明/已缓存成对digest与资源；不pull/build或替换latest。配置准备后再读一次基线，变化先拒绝。
2. 从受核验的完整展开Compose配置，保留三应用的配置/环境/端口/命令/healthcheck/bind；只把image改为计划digest、restart改no，并去掉depends_on。生成**仅三服务、无DB服务/命名卷、仅已有external网络sanq-app_default**的完整JSON配置。未知额外服务/网络、build、profiles、configs/secrets、scale或非bind应用卷拒绝。输入不包含DB服务，因此不依赖不存在的create --no-deps参数。
3. 先持久CREATING_CANDIDATES，再调用原 `deploy_release.write_creation_pending`：核原current/状态、写唯一发布状态 `pending/current=目标/previous=原版本`、fsync目录并读回。该方法复用旧state writer，只有新路径使用；旧deploy/rollback默认逻辑不改。.env仍是原SHA，属于明确未完成交接，不伪造ACTIVE或第二份发布权威。
4. 固定 `docker compose --parallel 1 -f - create --no-build --pull never --force-recreate api ubereats-worker web`，绑定原project/project-directory/env-file，180s超时，不重试。完整配置经有界bytes stdin送入匿名私有临时文件，不进入argv、维护记录或普通日志；没有用户指定路径/shell/URL。collector命令边界仅新增有界私有stdin，原调用默认DEVNULL保持。
5. 创建前后核DB同一完整ID/image/Mounts及实际sanq-app_pgdata挂载；新容器逐项核所有bind Source/Destination/RW/数量，随后走原准确ID/digest/created/no-restart登记与门禁读回。只返回CANDIDATES_CREATED_NOT_STARTED/canExecute=false，保留PENDING和维护记录，不start/up/SQL、改.env、写ACTIVE、恢复策略、清维护或prune。
6. 任一同步/命令/部分创建/DB或挂载核验未知，保留实际CREATING_CANDIDATES或已登记证据及PENDING，不回滚、清标记或重跑。空ID下的收尾继续FENCE_UNCONFIRMED，不能凭create配置推定现场已停写。管理器断线/SIGKILL与真实Docker/Compose行为仍待隔离验收。

### 文件、验证与尚未完成

新增14项离线测试方法，覆盖锁贯穿、固定三服务/私有输入/无DB依赖、无迁移拒绝、基线/历史/备份/证明漂移、PENDING耐久未知、部分create不重放、DB/挂载变化、未知配置/attempt/API、真实临时文件中的唯一PENDING与目录fsync，以及stdin预算。Docker/PID1/网络全用替身；本地仅Python3.10 grammar AST、测试保留方法名、差异/导入/引用静态审阅，项目测试未执行。前批CI不代表本批通过，尚无本批CI或隔离实测。

**交付变化必须明确：本批修改固定17成员中的deploy_release.py源码，成员集合、Manifest规则和250/300旧guard不变。**新控制器必须随准确正式Bundle/Manifest验真交付，不允许直接覆写现役控制器或手改Manifest；外置六helper清单不增加，仍须第三批一致版本安装。本批无包依赖/业务schema/migration或新生产权限/目录/unit变化；Runtime/Ops归属、唯一current/previous权威保持。

分支 `feat/runtime-minimal-create-candidates-20261026` 随后由[PR #2987](https://github.com/sanqin888/sanqinMVP/pull/2987) 最终head `fb9949e54db8de90f7464fc43585187d1bd8b52e` 经 [CI #7655](https://github.com/sanqin888/sanqinMVP/actions/runs/40419873594) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各217、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `067521149fd9104303f09d4c057b4277a489a2cd`。上文未运行/未提交限原本地审阅时点，本地仍未执行项目测试。**无迁移完整apply仍未完成：**任务接线、登记后启动/健康/readiness、.env/PENDING→ACTIVE/原策略与清标记交接未接；准确SQL集合批准/执行、回退及完整故障/安装/恢复仍OPEN。暂无可对外报告的1–2次操作成功发布。参考[Docker create](https://docs.docker.com/reference/cli/docker/compose/create/)及[Compose stdin/多文件规则](https://docs.docker.com/reference/cli/docker/compose/)；官方选项不是目标Ubuntu/Compose现场证据。没有任何生产Docker/systemd/SQL/AWS执行。

**前批创建意图交付：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**前批候选登记已由[PR #2985](https://github.com/sanqin888/sanqinMVP/pull/2985) 最终head `2e95f410d003cde732369104e57a3605e0653751` 经 [CI #7651](https://github.com/sanqin888/sanqinMVP/actions/runs/40398932645) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各191、Runtime1080、准确CPython3.12.15回归412），合并dev `830c41a36e06d2dd8a9756ae60f5cf3d6f2cf7d9`。首次CI #7650发现坏镜像测试夹具仍传布尔值，生产观察替身已按字符串分类；同分支仅将测试改为明确digest/revision两种负例后通过，未改生产逻辑或CI门禁。本批补创建前意图与登记接线，尚未运行创建/发布或生产操作。

## 第二批续作：创建前意图与登记接线（源码已合并）

复用同一个maintenance_guard、active.json、全局任务锁和计划原件，不新增helper、unit、数据库或发布状态权威。内部新增 `begin_candidate_creation(plan-id, attempt-id)`；CLI和systemd任务仍不提供create/apply入口。普通兼容扩展，无已安装消费者，不改变原17+Manifest/旧deploy或三组暂停研究。

1. **先持久意图，再允许未来create。**要求同一v1/FROZEN计划/attempt、维护目录只有原marker、有效启动门禁、原三对象准确已停/no-restart、完整角色列表仅含原ID及备份状态原样。从原计划取准确候选证明，不接受调用者改目标；文件/目录fsync并读回 `v2/CREATING_CANDIDATES`，candidate.containers暂为空。
2. **登记必须接同一意图。**原register入口现在只接受CREATING_CANDIDATES，重新读取计划并比对候选证明完全一致，才可在前批created/no-restart、image/digest/角色等检查后持久CANDIDATES_REGISTERED。不能从v1/FROZEN直接登记，不能跳过意图、部分填ID、换证明/尝试、重放或降级；旧v1及前批已完整登记的v2仍可读取/事故收尾。
3. **创建未完成不推断安全。**CREATING_CANDIDATES或其INCIDENT空ID记录下，ExecStopPost即便收到success也只尝试停止原已保存ID，并固定保留INCIDENT/FENCE_UNCONFIRMED；不扫描猜取/停止未登记新ID，不把“未登记”解释为“未创建”。部分创建、旧对象已删、提交/同步未知均需审证据，不自动create、补登记、重开、清标记或续跑。
4. task补意图API的一致版本检查，六helper仍需第三批统一验真/安装；不声称API存在就是C1来源证明。记录v2只扩展阶段/空表的严格语义，没有第二份current/previous、兼容双写或新控制服务器；原900s收尾预算不变。

### 验证与本批结束位置

新增13项离线unittest方法，覆盖意图耐久/准确目标、同一root/plan/attempt/FROZEN、原writer/备份/外来对象拒绝、锁冲突、缺计划/残件、时钟倒退、初始/最终同步未知、未完成创建的保守收尾、禁止直接登记及记录变造；同步原16项候选测试fixture，让模拟创建发生在意图之后，更新task接口断言。仅临时私有目录与Docker/PID1替身，不实际运行create/start/SQL。项目测试未执行；仅Python3.10 grammar AST、测试保留方法名、差异/导入/引用静态审阅；前批CI不替代本批验证。

分支 `feat/runtime-minimal-creation-intent-20261026` 随后由[PR #2986](https://github.com/sanqin888/sanqinMVP/pull/2986) 最终head `1d5d19a12a7fa3abdcf902a7464c753c513c0a85` 经 [CI #7653](https://github.com/sanqin888/sanqinMVP/actions/runs/40400151439) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各203、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `d133e92eef9f76faeb8af8f1272e84eafaf02152`。上文未运行/未提交为原本地审阅时点，本地仍未执行项目测试。**本批不宣称创建协议或第二批执行已完成：**实际只create不启动的准确Compose/digest/no-restart配置、创建到登记/启动/验证的同一锁贯穿、SQL集合批准与执行、PENDING/ACTIVE和原策略/维护标记交接仍未接；begin/register各自锁仅保护自己的记录操作，返回不表示已持锁进入下一动作。完整create命令结果未知、部分创建及真实Docker行为必须在后续单一控制器接线/隔离环境处理。没有生产目录/unit安装、容器、数据库或AWS执行；真实断线/SIGKILL/socket/daemon/VM故障、第一批平台及完整交付合同、第三批过渡和最终发布均OPEN，三组研究继续暂停、不取消。

**前批候选登记源码交付：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**前批独立维护任务已由[PR #2984](https://github.com/sanqin888/sanqinMVP/pull/2984) 最终head `cb7242bb0af4c8d06c093642a81e2df6844447ad` 经 [CI #7648](https://github.com/sanqin888/sanqinMVP/actions/runs/40395107992) SUCCESS（4成功/6范围跳过，默认Python和CPython3.10.22下Release各175、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `fabaa9a0f532528f02381896860aeaf8906b03bf`。本批从该准确dev基线补候选容器登记及异常停写源码；没有创建/启动真实容器、执行apply、SQL或安装生产工具，三组研究继续暂停、不取消。

## 第二批续作：候选身份登记与异常停写（源码已合并）

本批只扩展现有 `maintenance_guard.py`，不新增发布控制器、helper交付件、任务数据库或current/previous权威。内部 `register_created_candidates(plan-id, attempt-id, identifiers)` 没有CLI入口，尚未接入任务/旧deploy。调用持原全局任务锁，要求同一FROZEN计划/尝试、目录无残件、有效门禁及原计划原件；候选来源固定为该计划，不能由调用者传新SHA/digest或换latest。

- 必须先由未来单一控制器创建三只**尚未启动（created）、restart=no**的候选，再调用登记；本批不执行create。逐角色验证完整64位ID、项目/角色、固定digest引用、实际image-id、linux/amd64、revision和计划digest，API/worker实际image-id相同，新旧共六ID不重叠。
- 对每个准确角色读取有界、完整ID列表；只允许原对象和指定候选，候选必须存在。原容器可已被替换删除，但必须由完整角色列表确认不存在；仍存在的原对象必须同一旧SHA/image-id、已停且restart=no。未知/多余/替换对象拒绝，不猜ID。
- 同一active.json一次 `v1/FROZEN → v2/CANDIDATES_REGISTERED`，追加原计划候选证明及三ID/image-id；原策略/身份/备份不变。文件与目录fsync并读回，随后再核容器/门禁；任何异常或耐久结果未知均不能启动。登记重复、替换、降级拒绝，canExecute仍false，登记不是应用ACTIVE/SQL授权。
- v2后ExecStopPost即便收到SERVICE_RESULT=success也不走旧FROZEN无动作分支。优先对三候选、再对三原ID逐项no-restart/stop，单项失败仍尝试其余；对仍存在的原对象、准确候选及完整角色列表读回，才可记INCIDENT/TASK_FAILED_WRITERS_STOPPED。已删原对象的stop报错不能单独决定结果，必须有完整列表与候选停止证据；丢失候选/未知对象/错镜像/部分停止或门禁失败均FENCE_UNCONFIRMED，绝不停止猜出的外来ID。
- v1原记录仍可读、原维护流程不改；v2仅新守卫理解，无已安装消费者。属于未安装内部工具的兼容新增/一次单向记录升级，不双写、不降级恢复。第三批必须把六helper及三启动drop-in作为一致版本验真安装，旧守卫不能处理v2。task的接口检查补登记API，仍不是C1来源认证。
- 因收尾最多覆盖六ID，固定TimeoutStopSec从前批600调整为900；Docker动作单项45s、收尾观察15s、锁等待10s不变。总超时/管理器失效仍可能导致UNKNOWN；900不是停写保证，不增加自动重启/重试/清维护。

### 本次验证与剩余接线

新增16项离线unittest方法，使用原维护fixture、临时私有目录与Docker/systemctl替身，覆盖准确登记/拒绝、已删原对象、候选优先收尾、成功任务不放行、部分失败/外来替换、记录不可变、初始/最终同步未知与坏v2。同步原task参数断言。仅Python3.10 grammar AST、保留测试方法名、差异/导入/相对链接静态审阅；项目测试未执行，本批尚无CI。前批CI不代表本批通过，mock不是真实Docker/PID1故障验收。

分支 `feat/runtime-minimal-candidate-writers-20261026` 随后由[PR #2985](https://github.com/sanqin888/sanqinMVP/pull/2985) 最终head `2e95f410d003cde732369104e57a3605e0653751` 经 [CI #7651](https://github.com/sanqin888/sanqinMVP/actions/runs/40398932645) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各191、Runtime1080、准确CPython3.12.15回归412），合并dev `830c41a36e06d2dd8a9756ae60f5cf3d6f2cf7d9`；CI #7650测试夹具布尔/字符串不一致仅作上述测试修复。上文未运行/未推送为原审阅时点，本地仍未执行项目测试。**未来控制器仍须实现create前持久意图、只create不启动的准确配置、部分创建/未知结果处理、同一锁贯穿apply、准确SQL授权、登记后启动/验证/ACTIVE交接、原策略恢复与受控清标记。**本批没有解决创建到登记之间的完整恢复协议；未登记对象必须始终保持未启动/no-restart，不能将该内部函数直接拼入旧up命令。真实创建/重建行为、断线/SIGKILL/daemon/socket/VM故障与安装/恢复仍OPEN，第一批实际平台/完整交付合同仍OPEN。17+Manifest、旧deploy/rollback、250/300guard、业务schema和依赖不变，无生产权限/目录/SQL/AWS操作。

**前批独立任务源码交付：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**维护准备 [PR #2983](https://github.com/sanqin888/sanqinMVP/pull/2983) 最终head `b94f1f9d4f65885a01397c099ff2bdde67804bba` 经 [CI #7646](https://github.com/sanqin888/sanqinMVP/actions/runs/40387127782) SUCCESS（4成功/6范围跳过），默认Python及CPython3.10.22下Release各154、Runtime1080、准确CPython3.12.15回归412通过，合并dev `0d16673aa8a56f024cc79bcba235333c867aa8d1`。初次CI #7645发现测试helper误覆盖unittest.run；同分支仅将两处helper及引用改名observe_command后通过，不改维护逻辑或门禁。本批基于准确合并状态补系统级独立任务、ExecStopPost及查询源码，尚未安装/运行或接apply；现场与完整故障验收仍OPEN。

## 第二批续作：独立任务与异常收尾（源码已合并）

新增 `ops/release/release_task.py`，只承载**维护准备**及查询/收尾，不是第二个应用发布器。辅助helper当前共六件，加原三份启动drop-in；第三批须完整验真/一致版本安装和权限读回。本批依然不改17 Bundle、唯一current/previous权威、旧deploy/rollback、业务schema或依赖包。

### 任务流程与操作边界

- 源码CLI为 `submit <plan-id> --confirm-maintenance`、`status/logs <plan-id>` 及仅供管理器调用的 `run/cleanup`。**不是当前可在生产运行的命令。**提交需要root、固定路径/不可组或全局写的task helper、必要helper API可用、已安装的三份有效维护门禁、无维护/未完结记录，以及同一原计划的时效检查；不传任意路径、脚本、shell、unit或URL。
- 只构造系统级transient service `sanq-release-prepare-<64位plan-id>.service`：User=root、oneshot、RemainAfterExit=yes、Restart=no、KillMode=control-group、固定WorkingDirectory=/opt/sanq/runtime、TimeoutStartSec=900/TimeoutStopSec=600、MemoryMax=256M、CPUQuota=50%。`--no-block` 提交，不用scope/wait/pty/pipe/replace/collect，不绑定SSH生命周期，不自动重试未知结果。回传SUBMITTED只表示排队请求被接受。
- submit在排队前释放检查锁，避免等待子任务取得同一锁而死锁；子任务自己持原任务/计划锁调用既有freeze adapter，不复制维护流程。run/cleanup均验证当前systemd transient unit的准确命令、Type/Restart/KillMode、fragment/drop-in/cwd、当前PID与统一cgroup成员身份；run需处在start阶段，cleanup需为stop-post的ControlPID。直接从普通SSH运行run/cleanup会拒绝；环境SERVICE_RESULT只有经过该上下文检查后才消费，不作为独立授权。
- oneshot成功后可能显示active(exited)，这里只表示维护准备任务已退出并保留查询对象，**不是业务ACTIVE或部署成功**。正常结果保留FROZEN，不开业务、不清标记。transient unit不跨VM重启自动重放；持久维护目录继续负责冷启动拒绝。status综合当前unit观察与维护记录，not-found按UNKNOWN处理；logs固定查询同一unit的最近80行，不跟随或自动重跑。
- 服务不继承SSH的临时环境/令牌，不把secret放进unit参数；当前仍使用现有普通系统/Root Docker凭据及公开GitHub读取路径。若需要私有源/额外凭据或遇限流，失败拒绝，凭据交付须在第三批另按准确来源审阅，不新增控制服务器或暗传业务.env。

### 异常、并发与保留证据

管理器在主进程失败/超时/被杀后的ExecStopPost调用固定cleanup，不依赖原Python finally。cleanup不要求旧应用健康或原计划仍新鲜：先读同一plan-id的私有维护记录，外来/坏/不完整记录拒绝、绝不猜ID；无记录只报告NO_RECORDED_MAINTENANCE，不报告成功或假定可以重试。它从来不改选latest、执行SQL、恢复策略、清维护或启动服务。

同一记录下，收尾以最多10s有界等待取得原任务锁，仅对保存的三容器ID关闭重启/停服（每项45s），元数据检查15s；读回准确身份/已停/restart=no及有效门禁后，保留 `INCIDENT/TASK_FAILED_WRITERS_STOPPED`。任一确认失败保留 `INCIDENT/FENCE_UNCONFIRMED` 并报错。允许ARMED/FROZEN/INCIDENT进入或保持INCIDENT，不能据此转回营业；原策略、plan/attempt和观察身份不变。写入未知保留原件/残件，不伪报收尾持久成功。

新只读预检持任务锁后先检查同一私有维护目录，任何证据或目录不可用都立即拒绝，避免主任务被杀后新重型预检抢占收尾。目录FD/是否清空复用store同一实现，不反向导入guard造成循环。原默认锁仍非阻塞，仅收尾选有界等待；冷启动检查继续不争用任务锁或调用Docker。

系统管理器不可用、进程/cgroup/磁盘或Docker失效、cleanup自身被杀、marker损坏时仍可能无法证实停写，必须保持UNKNOWN/FENCE_UNCONFIRMED；不能从配置了ExecStopPost就宣称真实SIGKILL保护已经通过。SSH断线/oneshot失败与目标Ubuntu/systemd输出、cgroup-v2布局、资源限制、日志跨重启保留，均须在隔离环境和第三批安装前核实。当前journal持久配置未更改。

### 验证和后续

本批新增 **21个离线unittest方法**（task19、job2），只使用临时私有目录和PID1/Docker观察替身，覆盖异步固定调度/未知结果不重试、unit/PID/cgroup/cwd/命令绑定、限权CLI、查询、模拟ARMED/FROZEN/INCIDENT异常收尾、外来/坏记录、部分停止/门禁失败、同步未知与新预检拒绝。借用原维护fixture，不重复运行原20项测试；没有运行项目测试，仅Python3.10 grammar AST、测试框架保留方法名、差异/导入/引用静态审阅。原CI入口及暂停研究测试保留。

分支 `feat/runtime-minimal-transient-task-20261026` 基于dev0d16673a，随后由[PR #2984](https://github.com/sanqin888/sanqinMVP/pull/2984) 最终head `cb7242bb0af4c8d06c093642a81e2df6844447ad` 经 [CI #7648](https://github.com/sanqin888/sanqinMVP/actions/runs/40395107992) SUCCESS（4成功/6范围跳过，默认Python和CPython3.10.22下Release各175、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `fabaa9a0f532528f02381896860aeaf8906b03bf`。上文未运行/本地只限原审阅时点；本地仍未执行项目测试，无生产/systemd/Docker/SQL/AWS执行。**apply、准确SQL授权、新候选身份/停止登记、最终ACTIVE交接、原策略恢复和受控清标记仍未接通**；真实断线/SIGKILL/daemon/socket/VM重启验收、第一批实际平台及完整安装/恢复合同仍OPEN。三组研究继续暂停、不取消。参考：[systemd-run](https://www.freedesktop.org/software/systemd/man/systemd-run.html)、[ExecStopPost/oneshot](https://www.freedesktop.org/software/systemd/man/systemd.service.html)；官方机制不是本机验收证据。

## 第二批续作：维护准备与冷启动门禁（源码已合并）

新增 `ops/release/maintenance_guard.py` 和三份 `systemd/**/80-sanq-maintenance.conf` 模板。Runtime/Ops内部普通兼容新增，无既有安装消费者，不改17 Bundle/Manifest、旧发布CLI或current/previous权威；`observedApplicationSha` 只记录维护前观察。辅助源码现为前四件加maintenance_guard及三份drop-in，第三批须统一验真/安装/撤回和权限读回；本批不增加生产权限、不安装unit或目录。

### 范围与执行顺序

1. 内部 `freeze_for_plan` 仅供未来受控执行器调用；CLI只提供 `check-startup/status`，没有freeze、clear、restore、apply或任意命令入口。函数要求root，持原任务锁与计划资源锁；未完结只读任务、维护记录/残件先拒绝，重新核对同一计划/缓存镜像及全部实际观察。
2. **先验证门禁已安装生效，后允许策略/停服动作。**执行路径必须是固定 `/opt/sanq/runtime/ops/release/maintenance_guard.py`，root非组/全局可写；三份root drop-in原bytes匹配，systemctl报告loaded/无需reload/仅所选drop-in，service有效ExecStartPre包含准确命令且不忽略失败，socket只触发docker.service。已有其他drop-in或未知输出拒绝，不自动删除配置或reload。Docker live-restore必须false，Swarm inactive，否则转单独平台审阅。
3. 观察三个准确角色的完整container-id、实际image-id/成对digest/revision、项目/镜像标签、运行状态及原restart name/retry-count；只接受三角色均稳定running。观察backup.timer原active/substate/enabled及backup.service原inactive/dead状态。原策略先完整写入私有 `ARMED` 标记，文件/目录fsync并读回成功才继续。
4. 再次核对基线；仅对这三个保存的完整ID执行restart=no，随后正常stop（30s宽限、命令45s超时）。不重建DB、停daemon/无关容器、prune、改Compose/.env或执行SQL/AWS；不根据名称追踪并停止未知新容器。
5. 逐角色读回同一container-id/image-id、restart=no/0、exited且Running/Restarting/Paused均false，backup状态原样、门禁仍有效，才持久写 `FROZEN`。它表示本次观察到三应用已停及门禁配置符合合同，不是快照完成、部署许可或跨克隆证明。
6. 过程失败时尽力对保存的三ID关闭重启/停止，不因一项失败而不尝试其他项；不恢复服务、原restart或timer策略，不删除标记。持久记 `INCIDENT/FENCE_UNCONFIRMED`，无法记录则保留原ARMED/残件。初始写入未知不改容器；最终rename/fsync未知不重试或改写为失败，状态查询只反映当前磁盘快照，不能据FROZEN推断前次调用已经报告耐久成功。

### 固定文件与启动规则

- 拟预装 `/opt/sanq/deploy-state/maintenance` 及父目录root:0700；`active.json` root:0600/普通单硬链接，最多16KiB，保存plan-id/attempt、原容器策略/备份状态、阶段/时间/固定错误码，固定canExecute=false。采集器不mkdir/chown/chmod；全目录只要有任意记录/残件/链接就拒绝冷启动，目录缺失或权限异常也拒绝。
- `docker.service` drop-in增加固定Python `check-startup` 的ExecStartPre；不在启动检查里调用Docker/systemctl或争用任务锁。Docker由socket拉起也须经过同一service门禁；socket模板另加active.json不存在的condition。**condition跳过不等于业务已停写**；坏链接/残件由service检查继续拒绝daemon启动。
- `sanq-backup.service` 增加marker condition及准确的root ExecStartPre（`+`仅提权这一固定只读检查），使ubuntu备份用户无需读私有目录；timer不stop/disable/enable，原状态保存但不修改。已运行备份进入维护前拒绝；ARMED后竞态或状态改变记INCIDENT，不能宣称冻结成功。
- marker存在时daemon冷启动会被拒绝，故事故重启也可能暂时阻断整个Docker及Clover开发隧道；正常准备只处理三应用角色。直接root/手工Docker/旧发布入口仍可绕过本机合作约束，不声称被强制拦截；root/SSH/OS为信任基础，C1/CPython/R2研究仍暂停。

### 验证与未完成项

本批新增 **20个离线unittest方法**，用真实临时私有目录和Docker/systemctl观察替身覆盖原策略先持久、同一计划、备份竞态、更新/停服失败、替换容器、初始/最终同步未知、坏目录/链接、锁冲突、无写CLI、模板与有效门禁/忽略失败/未reload/额外覆盖/live-restore/Swarm拒绝。本地未运行项目测试；后经上述PR #2983最终head/CI #7646验证通过。原本地仅Python3.10 grammar AST、模板字面合同、导入/差异/引用静态审阅。沿用既有Release/3.10/Runtime/准确3.12.15 CI入口，不改工作流。

**该阶段仍未完成现场验收：**以下为门禁源码合并时的缺口；本批已补独立任务/ExecStopPost源码，SIGKILL真实路径仍待隔离验证。仍缺新候选容器身份登记与停写、锁内apply/准确SQL授权/最终ACTIVE交接、原策略恢复及受控清标记；本批也没有恢复/清除维护态的API。当前SIGKILL可能留下ARMED且部分原应用仍在运行，不能自报FROZEN；持久标记仅阻断后续冷启动，不证明当下所有writer都已停。三份unit及目标Ubuntu版本的有效输出、socket/daemon/VM重启和真实停止行为必须隔离实测，不能以mock/最新官方文档冒充现场认证。完整故障保护与安装过渡完成前，不接生产发布。

分支 `feat/runtime-minimal-maintenance-guard-20261026` 已按上述最终head/CI合并；此处原未提交状态已更新。没有运行freeze/安装systemd/停写/SQL/AWS或任何生产动作，第一批现场缺口继续OPEN。参考：[systemd条件](https://www.freedesktop.org/software/systemd/man/systemd.unit.html)、[ExecStartPre与权限前缀](https://www.freedesktop.org/software/systemd/man/systemd.service.html)、[Docker重启策略](https://docs.docker.com/engine/containers/start-containers-automatically/)、[更新restart策略](https://docs.docker.com/reference/cli/docker/container/update/)；目标主机行为仍须实测。

## 第二批起步：锁内重核和持久只读任务（源码已合并）

**本次只实现执行前的任务基础，不实现 apply，也不把第一批现场缺口标为完成。**新增 `ops/release/release_job.py`，把任务生命周期留在 Runtime/Ops；只引用已有 plan、store、collector，不写 `.env`、发布 current/previous、数据库或业务容器策略。平台辅助件的当前源码清单增为四件：plan、collector、store、release_job；尚未安装，仍独立于固定17 Bundle，第三批需统一验真/安装/导入和权限读回，不允许直接塞入旧包。

| 范围 | 已编写行为 |
| --- | --- |
| 固定记录 | 拟用 `/opt/sanq/deploy-state/jobs/<plan-id>.json`，jobs及父目录预先 root:0700，文件root:0600/普通单硬链接/非链接。单条4KiB、最多1024条，不自动清理或越过容量；目录不创建、不改权限 |
| 独占与观察锁 | jobs内稳定 `.release.lock` 的非阻塞 flock；按“任务锁→原计划资源锁”顺序重核。状态查询不等待正在运行的任务锁。它不是维护 fence，不拦截旧手工部署/直接Docker，也不证明SIGKILL/reboot后业务已停写 |
| 持久阶段 | 每个计划只创建一次尝试，固定随机attempt-id；`REVALIDATING → READY/BLOCKED`。意图先fsync文件/目录并读回，之后才采集；终结用私有临时文件+fsync+replace+目录fsync+读回，不覆盖尝试身份，不重放同一plan-id |
| 准确重核 | 从固定私有计划目录按另行保留的plan-id读取canonical原件，先检查时效/时钟，再完整观察相同目标。新采集选项 `cache_images=False` 只inspect已缓存digest；缺失拒绝，不pull/build/改选latest。比较当前、候选、运行合同、SQL、历史/pending、备份、环境，并验证观察时间落在任务区间 |
| 结果与异常 | `kind=sanq-read-only-precheck`、`canExecute=false` 固定。READY只表示观察匹配，不是ACTIVE、SQL批准、持久性豁免或后续执行许可。错误只存固定code，不保存命令原输出/secret；中断记录BLOCKED后传播，无finally启动业务 |
| 未明记录 | 任何REVALIDATING、残件、未知/坏记录阻断新尝试。不会根据PID消失、锁释放或SSH断线自动清除。意图写入未知时不开始观察；最终rename/fsync未知时不重试或改写为FAILED，保留实际对象。查询仅反映当前磁盘快照，即使读到READY，也不能推断前次CLI已报告耐久成功或可以部署 |
| 有限确认 | 源码 `abandon <plan-id> --attempt-id <id>` 只允许root在任务锁可取得、同一未完结READ-ONLY记录下记BLOCKED/ABANDONED_OBSERVATION。它不删除记录/残件/探测容器，不清维护态或事故，不接受执行型/未知schema记录；解析不了的残件仍需人工审查，不能自动修复 |

源码CLI仅 `precheck/status/abandon`，**均不是当前生产可用命令**；没有systemd任务启动、Mac入口、部署、迁移、回退、Docker策略或启动门禁。未来真实执行仍须安装门禁、锁内再次核验、准确SQL授权和中断保护；不能把本次READY直接递给旧deploy。root/OS/SSH仍是信任基础，本机文件和时钟不提供暂停中的C1/R2保证。

本批新增 **23 个离线unittest方法**（job21、collector缓存边界2），覆盖锁竞争/可查询意图、漂移/过期/时钟、部分写/初始与终结同步未知、rename失败保留、重复尝试、未完结/固定身份确认、权限/链接/坏schema/容量及安全CLI。测试只用私有临时文件和观察替身，不调用Docker/DB/GitHub；本地未运行，后经上述PR #2982 / CI #7643验证通过。仅审阅副本的Python3.10 grammar AST、导入方向、差异和引用静态检查。复用已合并CI的默认Release/3.10/Runtime/准确3.12.15入口，不修改工作流。

分支 `feat/runtime-minimal-job-precheck-20261026` 已由上述PR合并；无生产操作。当前继续维护门禁、受控执行及隔离故障验证；以下只读任务行为仍不授予执行权。第一批现场/交付缺口与第二批执行缺口分别保持OPEN，三组研究继续暂停、不取消。

## 第一批续作：真实观察、展示和保存（源码已合并，隔离实采待验）

内部 helper 固定为三件：本批新增 `collect_deployment_plan.py`、`deployment_plan_store.py` 及前批 `deployment_plan.py`，同属 `ops/release/`。它们复用现有 `release_contract.py` 和 `deploy_release.py`；不复制发布控制器，不写 current/previous。新增件独立于现有 **17+Manifest**，尚未安装或加入 Bundle；第三批须交付可验证的准确三件及其所需现有模块版本、安装位置/导入路径/权限/读回合同，不能把当前源码直接放进旧 Runtime 后提权执行。

### 已实现的采集边界

| 观察 | 源码行为与拒绝边界 |
| --- | --- |
| 当前基线 | 复用控制器固定路径、C4 marker、17+Manifest 完整性和真实 DB/Uploads 挂载检查；直接读取原 Manifest、release-state 和 .env，核对 owner/mode/单硬链接/非链接/读取身份。仅接受 active/rolled-back 与 .env 的 current 一致；pending、缺失或不一致阻断 |
| 实际配置 | 用固定 project/Compose/env-file 展开配置；核对三应用镜像为当前 SHA。配置摘要绑定原 .env 与实际展开值，计划只存摘要和必需键名，不保存环境值。检查声明的必需键，不能自动发现任意业务代码里的动态配置需求 |
| 目标与当前镜像 | exact main SHA、paired seal、发布 run、最新准确 main push CI 和祖先关系；当前容器的实际 image ID 对应 digest/revision/platform，目标两镜像按 digest 拉取及检查 linux/amd64/revision/RepoDigests。新命令适配器固定本机 Docker socket，不接受环境变量指定外部 daemon；复用的两项旧 Docker 检查新增可选 observe 适配器，采集路径统一使用本机 socket/超时/输出预算，旧入口默认行为保持 |
| SQL 原件 | 候选 API 镜像只运行固定 Node 文件清单程序，覆盖入口为固定 /usr/local/bin/node，清空镜像自带的 NODE_OPTIONS/NODE_PATH/NODE_COMPILE_CACHE，避免继承预加载或编译缓存；无应用/worker 启动、数据库环境或主机卷。读取原 SQL bytes 的 SHA256/Git blob/大小/顺序；Git commit → tree SHA → 完整非截断 tree 独立绑定，拒绝缺项、链接、额外目录成员和不同对象 |
| DB 历史 | 在现有 db 容器内运行固定 psql SELECT，包在 `BEGIN READ ONLY` 事务中，凭据只取容器已有环境；读取迁移名/checksum/完成或撤回状态。纯合同验证前缀/摘要/失败历史并推导 pending。只读历史不是物理 schema 漂移检测或 SQL 安全批准 |
| 备份 | 选既有固定目录内最新命名匹配文件；验证 ubuntu 私有普通单链接、原压缩 bytes 的 SHA256/大小和 gzip 完整性，检查读取前后身份，计划合同检查 26h/非未来时效。不创建备份，不做恢复试验 |
| 一致性 | 采集结束再次观察当前文件/配置、DB 历史、真实镜像/挂载及准确候选证明；漂移就阻断。它是前后观察一致性检查，未构成发布锁、持续停写或全局原子快照；未来 apply 必须锁内重新核验 |

准备会写 Docker 镜像缓存、一次性探测容器、私有计划/锁文件及临时命令输出，不是整机零写入。仅该容器用 `--read-only --network none --cap-drop ALL --security-opt no-new-privileges`、256MiB 内存/相同 swap 上限、0.5 CPU/64 pids/`--pull never`，45s 命令超时；无网络/卷/env-file/业务入口。失败只尝试删除准确名称且随机 nonce label 一致的本次 probe，不处理业务容器；未能证实清理时本次失败，不能当成功或维护完成。镜像 pull CLI 单次 300s，超时不证明 daemon 后台下载已经停止，不自动重试；结果有输出预算，SQL 单件 2MiB/集合64MiB，备份压缩1GiB/展开4GiB。准备前要求 Runtime 所在文件系统至少空闲5GiB、MemAvailable至少512MiB；这只是保守准入，不保证任意未来镜像大小或整机峰值，安装/隔离验收仍须实测，不自动 prune。

### 计划目录、命令和权限

源码仅提供 `prepare --target-sha <40位SHA> [--save]` 与 `show <plan-id>`，**不是当前生产命令**，不提供 apply/deploy/migrate。只展示 REVIEW_ONLY、准确版本/digest、pending 摘要、备份及必需键名；失败不回显原命令输出、.env 或令牌。具体拒绝仍由合同/适配器阻断；当前 CLI 仅给通用安全错误，分阶段诊断留待任务接线。计划始终 `canExecute=false`，不能拿 JSON 字段当执行授权。

保存位置固定拟为 `/opt/sanq/deploy-state/plans/<plan-id>.json`；父目录 deploy-state 及 plans 均须预先安装为 root:0700，文件 root:0600/普通单硬链接，路径无软链接。采集器不 mkdir/chown/chmod；prepare 使用同目录稳定 inode 的 `.prepare.lock` + 非阻塞 flock，仅串行化采集资源，**不是维护/发布 fence**，show 不锁。创建用 O_EXCL/O_NOFOLLOW，完整写入、同步文件和目录、读回后才报告成功，不覆盖或删除已有身份；部分写入/同步未知保留原件并拒绝同 id 重写。show 用另行保留的 id 验证 canonical 原件，不能凭同文件自报 hash 认证来源。root/操作者和 OS 仍是信任基础，不恢复 C1 的受保护加载或 R2 跨克隆证明。

### 验证与尚未关闭项

本批新增 **42 个离线 unittest 方法**：26 个采集/CLI/观察适配测试和16个存储失败测试。CI 测试使用隔离临时文件/模拟 Docker、SQL、GitHub；其中 Node 文件程序只对可丢弃 fixture 执行，验证原 SQL bytes/Git blob 与拒绝额外成员/链接，不访问镜像或数据库。现有 ops-checks 自动发现新测试，另加 CPython3.10 Release 离线回归入口（同一 Release lane 显式 setup Node20，仅运行可丢弃 SQL fixture）；原默认 Release、Runtime、准确3.12.15 C1 回归完整保留。因本批修改 ci.yml，既有 change_scope 会选择全部 CI lanes；不修改选择器或跳过必需检查。3.10 lane 只验证该 CI 解释器，不冒充实际主机 patch/依赖或生产安装认证。

前批在 MCP-workspace 仅做静态审阅，后经上述 PR #2981 / CI #7641 验证并合并；此处原“未测试/未提交”状态已由真实 CI 更新。没有生产 Docker/SQL/文件/root/AWS 操作，也未安装工具。

**第一批仍 OPEN：**最终 head 的 Release/Runtime/新增3.10 CI 已通过；仍待系统实际版本/交付导入合同核实及隔离环境真实采集证据。旧 deploy/rollback/CLI 行为、250/300 guard 和17 Bundle/Manifest 均未改；本次只让新只读计划按两个实际运行对象判断兼容，不能据此绕过旧入口发布。旧执行入口替换、锁内 apply、任务/中断门禁属于第二批，安装/Mac 薄入口/一次性工具过渡属于第三批。三组研究继续暂停、不取消。

以下为前批合同和最初方案的历史记录。

**2026-10-26 源码 CI 记录：SOURCE_CI_VERIFIED / BATCH1_OPEN / NOT_INSTALLED。**[PR #2980](https://github.com/sanqin888/sanqinMVP/pull/2980) 源码 head `c26c643cd7fd309e28a3d6cff9cf70a8b769178a` 经 [CI #7638](https://github.com/sanqin888/sanqinMVP/actions/runs/40370375474) SUCCESS：ops job121739276109 实际 Release69（含本批24）/Runtime1080/准确CPython3.12.15回归412全部通过，4作业成功、6按范围跳过，无源码修复。本续记仅补证据；最终head检查/合并以PR事件为准，不从CI推出3.10运行兼容或生产就绪。下文 TESTS_NOT_RUN/未推送是原本地审阅时点，真实采集/CLI保存仍未完成，三组研究继续暂停保留。

## 2026-10-26 第一阶段起步：只读计划合同（本地）

**SOURCE_CONTRACT_LOCAL / TESTS_NOT_RUN / BATCH1_OPEN / NOT_INSTALLED / PRODUCTION_NOT_AUTHORIZED。**基于 dev `bd9f254e8a8dc503a26b0835119da02c09f4281e`。方案 PR [#2979](https://github.com/sanqin888/sanqinMVP/pull/2979) 最终 head `ef63d474689e4b3709871764cd6396dfc3d24162` 经 [CI #7636](https://github.com/sanqin888/sanqinMVP/actions/runs/40364596712) SUCCESS（1 成功/9 按文档范围跳过）合并；这是方案文档验证，不是本批源码 CI。

本次在 Runtime/Ops owner 内先实现可审阅的准确计划合同：现有 release_contract 新增 exact main 候选/配对 seal/发布 run/最新 main push CI/祖先关系只读核验，不重新选择 latest，也不从全仓 files/commit 数量推断兼容。新增纯计划模块 `ops/release/deployment_plan.py`，与原发布控制器分离，仅负责具体运行对象、SQL 原字节清单、数据库迁移历史与固定计划的结构/一致性；没有第二套部署流程或 current/previous 写入权。

首版计划 v1 使用 canonical JSON 原字节及另行保存的 plan-id：固定当前 app/runtime/Manifest/release-state/配置摘要、目标成对 digest 与发布/CI 身份、Compose/readiness 两个实际合同文件摘要、SQL 名称/顺序/SHA256/Git blob、历史与 pending 集、备份身份/26h 时效、环境键名、UTC 时间。拒绝重复 JSON/未知字段/缺项/篡改、失败或非前缀迁移历史和过期备份；`canExecute=false` 固定。计划摘要只证明匹配原件，不能认证观察来源、SQL 安全或生产权限。

`fetch_runtime_files` 固定 exact SHA/路径并校验 GitHub 原字节、大小和 Git blob；`runtime_contract` 只接受首版 Compose/readiness 原合同相同，改变即 NEEDS_PLATFORM_UPDATE；SQL 原字节 inventory 与独立固定的完整 Git tree 对照，拒绝截断、漏项与链接对象。Git tree 的 commit 绑定与输入观察真实性仍由后续真实采集器负责，不接受“字段合法就是已真实核验”的推断。

### 本批固定范围与剩余工作

- 本批只新增上述纯计划模块及 `test_deployment_plan.py`，在原 release_contract 新增只读 helper；没有改旧 deploy/rollback/plan CLI、旧 250/300 guard 或 Manifest 校验，更未解除生产发布阻塞。该 guard 的正式替换必须在第一批真实采集/计划接线时与完整当前安装校验一起完成。
- 新模块是 Runtime/Ops 的内部纯合同，不属于现有 17 Bundle。本批不新增第 18 项、不安装辅助件；后续交付件限定为计划模块、已拟定的 release_job/Mac 薄入口/有限 installer 与必要 unit，具体安装位置和认证交付仍在实现前审阅。
- 计划 v1 尚未持久写入。后续计划/job 记录只能关联 plan-id/尝试/阶段，不拥有第二套发布 current/previous；原 release-state 保持唯一权威。目录/owner/锁与崩溃间隙由后续接线明确，不创建生产目录。
- **第一批仍 OPEN：**缺真实只读采集（当前 17+Manifest/配置、Docker 候选 SQL/源树绑定、DB 历史、备份/环境）、计划展示/私有保存，以及现有系统 Python 的实际 Release 回归。当前只做 Python 3.10 grammar 的 AST 静态解析，不宣布已选定/认证生产解释器或完成 3.10 执行兼容。
- 24 个新 unittest 方法覆盖 exact 目标不漂移、300 文件/500 commit 不误阻、伪造/较新失败或重复 CI 身份、运行对象/SQL 源树不符、计划篡改/重复 JSON/错误 pending/历史、备份时效与环境缺项；测试已编写、未运行。本地仅 AST/导入方向/空白/差异静态审阅；授权远端后由现有 ops-checks 自动运行 Release/Runtime 与原 3.12.15 回归，不修改或禁用 CI。
- 按 A 类内部兼容新增处理，无外部消费者、持久迁移、兼容双写/删除或跨上下文边变化；不触及业务依赖、DB/Uploads、暂停研究或任何 Host/AWS/生产状态。新功能分支 `feat/runtime-minimal-executor-plan-contract-20261026` 本地待审，未提交远端。

以下保留方案审批时的设计正文与当时状态；源码进度、第一批未完成项以上述当前记录为准。

> **2026-10-26（America/Toronto）｜PLAN_DOCUMENTED_LOCAL / EXECUTOR_NOT_IMPLEMENTED / PRODUCTION_NOT_AUTHORIZED。**以 `dev@343fefc7dce5849ca3401981ee6174f4f9d2ec59` 为准确基线。前置文档 [PR #2978](https://github.com/sanqin888/sanqinMVP/pull/2978) 的最终 head `d2a739ecf36610fddf80564a26d52d25c053579c` 经 [CI #7633](https://github.com/sanqin888/sanqinMVP/actions/runs/40360253396) SUCCESS（1 成功、9 按文档范围跳过，无修复），已合并。本方案落实[当前优先级与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)，仅制作实现方案，不开始执行器代码或生产操作。

## 1. 范围与交付目标

在现有一台 Lightsail VM、Docker Compose 和 GitHub Actions/GHCR 基础上，交付单人可维护的更新入口。操作者用同一台 MacBook，经核验的 SSH 连接完成“准备计划一次、确认执行一次”；发布任务脱离交互连接运行，可重连查询。接受短暂维护窗口，不以零停机作为首版目标。

首版支持：同一运行配置合同内的应用镜像更新、经过审阅的兼容增量迁移、失败查询与经确认的兼容镜像回退；另完成一次从现役工具到新工具的受审阅过渡。真正的主机 OS/Docker/PostgreSQL 大版本升级、任意 Compose/端口/卷变更、破坏性迁移仍走独立维护方案。

**C1 来源/输入固定/受保护加载、自建 CPython 3.12.15 及完整依赖证明、R2 离机 CAS/CA/CRL/Enrollment/可信时间/跨克隆防护继续暂停、不取消。**不删除成果、修改旧候选 pin、禁用已有 CI，或把其 OPEN/NO-GO 改为已通过。最小执行器可复用适合的普通校验，不接回暂停的全量研究链。

## 2. 当前可复用实现与准确缺口

| 现有位置 | 保留复用 | 本项目必须补齐 |
| --- | --- | --- |
| `ops/release/release_contract.py` | main 发布发现、成对 seal、准确 SHA/digest、历史回退证明 | 验证计划指定的 exact SHA，不在执行时重新发现另一个 latest；完整处理证据缺失/失败状态 |
| `ops/release/deploy_release.py` | 固定根路径/owner、Manifest 完整性、C4 marker、真实挂载、备份、迁移解析、健康等待、受控回退 | 真正的预检计划、计划身份与 SQL 清单、进程间互斥、任务状态、受限执行入口及错误清理 |
| `verify_runtime_release` | 已安装 17 文件与原 Manifest 的准确完整性检查 | 取消以全仓 250 commits/300 files 限制代替运行兼容判断；改成指定对象与实际运行合同检查 |
| `plan/deploy` 当前路径 | 使用现有单一发布控制器 | plan 现在在完整 preflight/迁移检查之前返回；deploy 又调用 latest_candidate。必须形成“审阅哪个计划就执行哪个计划” |
| Prisma 状态检查 | 保留严格识别的 clean/pending/未知拒绝，不宽松匹配错误字符串 | 当前只有 bool，需取得准确名称/顺序/SQL 摘要及迁移历史；一个永久 `--apply-migrations` 不代表批准未来任意 SQL |
| `atomic_write`、release-state | 保留 `.env` owner/mode 和 current/previous 语义 | 复核文件与父目录同步、崩溃间隙和未明状态；已有文件 fsync/replace 不是整个发布事务持久性证明 |
| readiness 脚本、Compose | api/worker/web 健康、BFF/API、菜单 smoke；项目/DB/Uploads 身份 | 现场验证依赖、超时与启动先后，不能把容器 starting 当失败或仅凭 healthy 宣布业务正确 |
| CI 的 `ops-checks` | Release/Runtime 单元测试、shell 语法、准确 3.12.15 的已有回归 | 为入选系统执行环境增加聚焦验证；暂停研究不跳过原 CI，不为文档批跑无关 E2E |

以上均来自准确基线源码静态审阅，不代表本次运行或生产已安装。

## 3. 实现归属与最小文件边界

沿用 Runtime/Ops owner 和现有部署拓扑。**只保留一个应用发布控制器**，不复制 NormalUpdateFlow、旧离线实验或再建一份 current/previous 权威。

| 位置（新增名称为方案拟定） | 单一职责 |
| --- | --- |
| 现有 `ops/release/deploy_release.py` | 预检计划、准确候选部署、迁移、应用切换/验证及受控回退 |
| 现有 `ops/release/release_contract.py` | 发布来源、准确 SHA/digest、指定运行文件/声明与兼容判定 |
| 拟新增 `ops/release/release_job.py` | 固定参数的机内一次性任务、锁、计划/阶段记录、维护门禁查询和失败收尾；不拥有另一套业务发布状态 |
| 拟新增 `ops/release/sanq-deploy.sh` | Mac 薄入口，仅固定 SSH 目标/主机校验与 plan/apply/status/logs/rollback 参数；不接受任意 shell/URL/路径 |
| 拟新增 `ops/release/install_minimal_executor.py` | 离线验真准备和一次性平台工具安装/读回/失败处置，独立于普通应用发布，不变成通用 root launcher |
| 对应 `ops/release/tests/**`、现有 CI/必要 unit 模板 | 验证上述真实边界，避免只复制实现的形式测试 |

新增任务辅助程序或 unit 属平台工具独立交付件；**不直接塞入固定 17 文件 Bundle，也不把 installer 变成第 18 项**。首批实施先确定固定交付清单和安装前后兼容，再编码；若确需修改 Bundle/schema/权限，须先提交具体差异，不能作为“顺手接线”。

首选评估生产已维护的 `/usr/bin/python3`（历史 Jammy 回执为 3.10 系列），以真实版本和 Release 回归为准；不是假定 3.10 已兼容。无需重做自建 3.12.15 证明。已有 Python 标准库和系统能力优先，依赖变更另审。

## 4. 固定发布计划与兼容规则

### 4.1 操作入口与计划内容

以下为拟定接口，不是当前可执行命令：

- `sanq-deploy plan`：准备并展示计划，可等待任务完成后返回一个 plan-id。
- `sanq-deploy apply <plan-id>`：确认同一计划并开始执行；有 pending SQL 时，确认须绑定本次准确 SQL 清单。
- `sanq-deploy status <plan-id>` / `logs <plan-id>`：只读查询，断线后使用同一 id。
- `sanq-deploy rollback <plan-id>`：另行形成并审阅 previous 目标回退计划，不等同自动撤销。

计划至少固定：当前发布/工具版本、目标 main SHA、两个 digest 与发布 run/seal、Compose/关键运行合同摘要、当前发布状态、部署所需环境键检查结果（不存 secret）、迁移名称/顺序/原 SQL 摘要、当前数据库迁移历史摘要、备份对象及检查结果、维护范围/停止条件、计划 schema/id/摘要和生成时间。记录存放在 root 私有机内目录，用户输出不包含密钥或原始环境内容。

plan 允许创建受限计划记录、下载候选镜像以及运行一次性 Prisma 只读检查容器；不写业务数据、执行迁移、改变现役 `.env` 或重建业务容器。不能把“无业务变更”描述为整个主机零写入。候选探测只运行固定 Prisma/文件清单命令，不启动应用服务器或 worker。

apply 在锁内再次核对计划原件与摘要、当前版本/状态、运行配置、数据库历史和候选证明；备份时效、资源与可用性重新检查。关键条件变化停止并重新 plan；新发布出现也不擅自替换目标。digest 验证后不再次信任可变 SHA 标签，实际启动前后应核对最终 image ID/digest 与计划一致。切换阶段显式禁止隐式 pull/build，只使用已核验的本地镜像，避免标签变化触发再次取包。预检核对磁盘/镜像与备份空间、可用内存和当前任务；不并行运行两套完整应用，不自动 prune 镜像、数据卷或备份来腾空间，previous 恢复所需镜像保留。

### 4.2 首版兼容范围

1. **已安装工具完整性**继续验全部 17+Manifest，不能改 hash、跳过校验或把新文件冒充旧版本。
2. **应用是否需要平台维护**按运行合同判断。首版只自动接受当前 Compose、project/volume/mount、服务/端口/启动方式与既定 readiness 合同匹配的候选；变化明确显示 NEEDS_PLATFORM_UPDATE，转独立维护，不自动覆盖生产 Compose。
3. 不要求候选的打包器、审计工具、staging 或新部署器源文件与现役逐字相同；这些源码变化本身不要求应用暂停发布。
4. 对受信 exact SHA 逐路径取完整目标对象并比对；Git 祖先关系与文件完整性分别验证。不使用可能截断的全仓 files 列表证明兼容，不简单调大 250/300 阈值，也不把任意版本号当通行证。
5. 环境预检覆盖已声明的必需键、Compose 展开和候选发布审阅中的新增要求；不得声称能从任意应用代码自动识别全部动态环境依赖。未说明的新配置/外部安装需求不进入自动路径。
6. 继续用户控制 dev→main；只部署已完成 main CI/成对发布的准确版本。CI 合格不表示迁移、外部供应商开关或生产配置已获批准。

## 5. 执行流程与失败语义

| 阶段 | 必须完成后才能继续 | 失败处理 |
| --- | --- | --- |
| PREPARE_PLAN | 验源、候选下载/只读探测、运行合同/配置/存储/备份检查和可审阅计划 | BLOCKED；业务不切换 |
| REVALIDATE | 本机独占锁、同一 plan-id、当前基线与准确目标复核 | 拒绝；不改选目标，不争抢另一任务 |
| ARM_MAINTENANCE | 原策略/任务状态先持久化，跨重启门禁生效；与备份任务协调，确认没有未明任务 | 保留记录；未证实停写不能报告 FROZEN |
| STOP_AND_APPLY | 先记录 PENDING；短窗口停应用写入者；有准确授权才执行迁移；DB/卷身份不变 | 保持事故状态，停止继续变更；不反向迁移/恢复旧盘 |
| START_AND_VERIFY | 按计划只更新三应用容器，等待 health、核对 digest/挂载、HTTP/BFF/worker/menu | 按实际阶段停止候选写入者并保留日志；无法确认停止就报告 FENCE_UNCONFIRMED，不能自报维护成功 |
| COMMIT_ACTIVE | 验证结果与原策略读回，完成发布状态和维护标记交接 | 任一持久结果未知保留 PENDING/INCIDENT；不重放旧计划 |
| QUERY_OR_RECOVER | 读取持久状态/真实服务/证据，形成准确恢复或兼容回退计划 | 不自动清标记、重开业务或把 SSH 断开判失败 |

首版对普通应用更新也采用短维护窗口，避免为零停机增加蓝绿/多实例调度。PostgreSQL 不随普通镜像更新重建或升级。无迁移不运行 SQL；兼容新增迁移与无迁移使用同一执行主线，不另建迁移控制器。

`.sanq-release-state.json` 继续是发布 current/previous/phase 的唯一权威；辅助 job 记录仅保存 plan-id、尝试/阶段、进程/服务关联及错误。两个对象任何不一致都阻断，不根据其中一份猜成功。新增记录的 schema/目录/权限、锁与崩溃间隙测试属于第二批实现，不预先承诺无损续跑。

**启动候选就可能发生业务写入。** API 后台任务或 Uber worker 可以在 ACTIVE 之前产生副作用；因此“VERIFYING/尚未放行”不自动等于数据库仍是快照时点。失败时尽快停写并据实对账，不能保证追回已发生动作，不能无条件回滚整机；自动停写失败必须明确报告。

所有资源修改前先持久化意图；重试只允许明确无业务效果的读取或下载。数据库/容器/状态写入结果未知时先核对准确对象，不自动重试整个事务。成功路径也必须测试在写 ACTIVE、恢复原策略、清维护标记之间中断，避免形成假成功或启动窗口。

## 6. SSH 断线、常见重启与权限

选择系统级 transient service 承载已确认的一次性任务，固定服务名前缀/参数，`Restart=no`；不使用绑定 SSH 的 scope/pty/pipe 执行长任务。日志和结果留在 VM，进程退出/重启不会自动重放计划。Mac 不运行常驻 CA/CAS，不新增控制服务器。

常见故障保护采用**本机持久维护标记 + systemd/Docker 启动门禁 + 任务失败收尾**，不借离机权威保证本机标记不可能回退：

- 门禁部署并自检必须先于第一次策略/业务变更。至少验证 Docker service/socket 自动启动、任务被 SIGKILL、VM 重启和 socket 激活入口。
- 一次性任务异常结束采用受限收尾（如 ExecStopPost）尝试停止准确应用写入者；SIGKILL 不依赖 Python finally。OS/管理器失效时，由下一次启动门禁保持拒绝，不能靠 transient unit 自身跨 reboot 留存。
- 真实 Docker live-restore、daemon/containerd/shim 行为先核对；不把停止 daemon 等同停完容器。若与所选门禁不兼容，先报告并在隔离环境验证最小调整，不直接改生产 daemon。
- 原策略含容器 restart、相关任务 enabled/active；逐项记录/读回，不能一律 enable/start。重建容器可能带回 always，必须验证真实新对象与各中断点。
- 必要时事故重启阻断整个 Docker，会暂时影响 Clover 开发隧道；沿用既有安全优先决定，正常维护不主动停止无关开发设施。
- 信任 root/操作者，不自建对直接 root 绕过、克隆旧盘、恶意替换本机状态的防护；手工 Docker/Compose/部署须遵守维护指示。未确认的旁路不能假报已被硬性拦截。

复用现有 SSH 身份和交互 sudo/root 审阅方式；不默认增加 NOPASSWD、放宽 .env/state 权限或开放 MCP sudo。固定子命令的 root 执行、持久目录和 systemd drop-in 是具体新增权限面，在实施批次单独列出读写目标、安装/撤回方式与验证后取得对应授权；当前方案不代替现场授权。

## 7. 一次性工具过渡与恢复

普通应用发布不能更新正在执行的部署工具。第三批交付一个独立、有限、可审阅的 installer，用于首次安装及以后低频平台维护；不接 NormalUpdateFlow 的暂停研究、不在现场拉源码编译。

安装顺序：核对真实主机/系统 Python/已安装 17+Manifest、当前发布和挂载；验证目标准确 main/发布来源与原 Archive；对外置任务/helper/unit 另给固定文件清单和 exact source/digest 证明；在 root 私有位置重新验真（不把用户可写 staging 直接提权执行）；保存当前完整工具/动态状态与恢复记录；建立维护及恢复点；安装非活跃辅助件、执行受审阅的目录交接；完整读回与受控验证后结束维护。不能假称两个目录或全部外部 unit 能一次原子完成，其顺序与各中断点必须测试。

保持 /opt/sanq/runtime 固定真实 root 目录、.env 原 owner/mode、原 current/previous/C4 marker 和 sanq-app_pgdata、/srv/sanq/uploads；不自动删除旧安装、备份、快照、原源码 checkout 或暂停项目材料。恢复点按准确快照/备份对象保存，缺原始可恢复材料不能仅凭一个 hash 宣称恢复就绪。

平台重大维护延用已批准的停写→准确 Lightsail 手动快照→available 核对路线。Mac 侧受限 AWS 协调可减少生产 VM 长期云凭据；不把实现完整 AWS SDK/新 CA 服务作为普通发布前置。首次过渡可由用户与有限 installer 按准确清单完成受控操作，自动化只覆盖已审阅范围，不自动执行恢复/切流。

如安装失败，保持维护并人工选择经核验的工具恢复或准确快照新实例；旧机必须确认停止写入，新机默认不营业、不运行后台外部写入者。存在新订单/付款或 UNKNOWN 时先对账/向前修复，不直接恢复旧整盘。2026-10-29用户调整：完整VM/数据库真实恢复演练列为交付后待办，首版按RESTORE_VALIDATION_DEFERRED记录；准确快照available、恢复材料和机外保存前置保留，不把未验证恢复写成PASS。

## 8. 四个实施批次

| 批次 | 范围与交付 | 退出条件 |
| --- | --- | --- |
| **第一批：准确计划与兼容检查** | 复用两个 release 文件，实现 exact 目标、计划字段/SQL 清单、受信逐对象运行合同检查；明确系统 Python、平台辅助件固定清单和最小持久 schema。不创建生产目录或安装 unit | Release/Runtime 对最终 head 的实际 CI 通过；计划能显示准确版本、变化与拒绝原因，300+ 无关文件不再导致误判；错 digest/配置/SQL/状态拒绝；单独通过所选系统 Python 的聚焦回归。此时仍不能生产部署 |
| **第二批：受控执行与失败保护** | 单一控制器接计划；release_job、本机锁/持久阶段、SQL 授权绑定、短停写/镜像切换/验证、状态查询、失败收尾与本机重启门禁 | 模拟 + 隔离 VM 覆盖并发、SIGKILL、SSH 断线、socket/daemon/VM 重启、健康失败、迁移前后未知与 ACTIVE 交接中断；没有 finally 重开业务；外置守卫未部署生产。不能只以单元测试冒充现场保证 |
| **第三批：安装、Mac 入口与一次性过渡准备** | installer、薄 SSH 入口、辅助件交付清单、权限/目录/units 的精确安装与撤回计划、一页 runbook；验证工具与现有应用向后兼容 | 隔离环境真实完成旧→新工具安装、成功发布和中断/恢复；Mac 可在两次操作内完成普通发布并重连查询；准确快照available核验、恢复材料/机外索引及所需生产安装材料可审阅；完整快照恢复演练延后。生产执行仍另批授权 |
| **第四批：现场过渡与最终验收** | 经批准核对真实 VM、完成一次性工具过渡；核对积压变更/环境/迁移及用户控制的 main 晋级，执行准确候选的真实应用发布 | 满足下文全部完结条件；保留准确操作/版本/结果；只在实际通过后标最小执行器完成，再返回三组暂停研究复审 |

每批只建自己的实现/测试和必要 owner 文档；不为“以后可能需要”扩新身份系统或通用框架。固定四批是交付边界，遇实证缺陷在原批次修复，不无限添加小编号或新的完结目标。第一批优先把合同和可运行校验做实，不先重新开启 C1/R2。

每批沿用“本地修改→用户审阅→授权远端→PR 到 dev→最终 head 必需 CI 全绿→合并”。第四批的生产/root/systemd/AWS/数据库授权独立核对。schema 改动如有需要，仍按 AGENTS 由用户生成 Prisma 迁移；本项目不预设业务 schema 改动。

## 9. 固定验收矩阵与完结条件

| 验收项 | 最低证据 |
| --- | --- |
| 正常发布 | 隔离环境无迁移/准确增量迁移两条成功链；生产至少一次准确 main SHA/digest 发布后 ACTIVE 与完整 readiness |
| 准确计划 | 目标不漂移；current/config/SQL/history 变更拒绝；坏 seal/digest/缺文件拒绝；未运行 SQL 不宣称迁移完成 |
| 资源不变量 | DB volume/project/Uploads 不变；只更新三应用容器；API/worker 同镜像，.env 权限和秘密不泄露 |
| 断线与并发 | Mac 断开后原任务可查询且不重复执行；第二个发布被拒绝；锁释放不等于清除未明状态 |
| 故障与维护 | SIGKILL、daemon/VM 重启、socket 激活、health/迁移失败、状态写入中断均有真实隔离结果；不自报未证实停写 |
| 回退与恢复 | 真实验证过的兼容镜像回退；一次性工具中断失败保持及人工处置材料；完整快照/备份恢复演练按2026-10-29决定列交付后待办 |
| 单人操作 | Mac 普通发布 1–2 次操作，命令不会悄悄换版本；status/logs 和一页事故手册可用；现场无未处置 PENDING/INCIDENT |

**以上全部达到才能标 MINIMAL_EXECUTOR_COMPLETE。**代码合并或 CI 全绿只能标 SOURCE/CI_VERIFIED；隔离试验、生产安装、真实应用更新分别记录。两步发布不包含首次安装、破坏性迁移或事故处置，也不承诺免费/零停机/自动云灾备。

完成后即进入原定的暂停项目复审：重核最新 dev、平台、安装与证据，从原 C1/CPython/R2 的未完成点继续。它们不是最小执行器完结条件；不要求再有另一台控制服务器、独立 CA、可信时间或跨克隆证明才允许结束本项目。

## 10. 本批状态与参考

本批只制作方案并同步已有 owner 入口、依赖图说明及工作日志；没有新执行器、installer、unit、依赖、权限、持久目录、CI、Prisma/迁移、Docker/AWS 或生产变更。本地只做文档差异/相对链接/范围静态审阅，未运行项目测试。分支 `docs/runtime-minimal-executor-implementation-plan-20261026`，未提交/推送本批。

- [当前优先级与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)、[发布手册](../runbooks/GHCR发布与Runtime状态.md)、[安装约束](Runtime交付与安装约束.md)、[AWS 快照/维护合同](Runtime更新-AWS快照与维护冻结方案.md)。
- [现有发布器](../../ops/release/deploy_release.py)、[发布合同](../../ops/release/release_contract.py)、[readiness](../../ops/verify-runtime-readiness.sh)、[CI](../../.github/workflows/ci.yml)。上面新增文件仅为拟定范围，本批未创建这些源码。
- [systemd-run 官方说明](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html)：transient service 可由服务管理器异步运行；目标 Ubuntu/systemd 实际版本的参数和失败收尾行为须在第二批实测，不能用最新 man page 冒充现场兼容。
- [Docker live restore 官方说明](https://docs.docker.com/engine/daemon/live-restore/)：daemon 不可用时可配置容器继续运行，因此停止 daemon 不能单独证明业务停写。
