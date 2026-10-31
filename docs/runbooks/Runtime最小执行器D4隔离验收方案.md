# Runtime 最小执行器 D4 隔离验收方案

## Mac固定Python3.14启动与本地预检（本地待审）

**MAC_PYTHON314_LAUNCHER_LOCAL / CI_PENDING / MAC_PREFLIGHT_NOT_RUN / NOT_INSTALLED。**

基于PR #3069合并dev `b29772c9d93a26d4d792c218a5ea2020d0589de2` 的本批继续接入Mac。操作者已报告独立安装命令 `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14 --version` 返回Python3.14.10；这只确认该路径可启动并报告版本，不代替客户端/SSH或解释器来源验收。既有Mac登记为macOS10.15.8、x86_64、Apple系统Python3.8.2与OpenSSH8.1p1／LibreSSL2.7.3。

sanq-deploy.sh已改为固定调用上述3.14框架路径，保持-I/-S/-B及-X pycache_prefix=/dev/null。文件缺失时直接阻断，无PATH、环境、CLI或系统Python回退；不覆盖Apple管理的/usr/bin/python3，不变更VM解释器。普通客户端语言版本门槛仍为3.9+，但交付启动器准确选用用户已安装的3.14路径；继续保留独立安装路线，不将兼容旧3.8列为必做交付项。

新增local-check纯本地诊断：核普通Mac/CPython、隔离参数，观察pythonExecutable、configuredLauncherPython、版本和架构；home只读dir_fd/NOFOLLOW身份核对，匿名非阻塞管道/select观察；复用既有固定SSH选项，以-F /dev/null、数字回环目标和-G解析配置，移除远端命令槽，stdio丢弃、10秒预算和最小无agent环境。已按[OpenSSH8.1源码](https://github.com/openssh/openssh-portable/blob/V_8_1_P1/ssh.c)核-G在连接及身份密钥加载前退出。诊断不读取本地profile/私钥、不连接VM、不创建配置；这些只是运行观察，不是受保护加载器或来源证明。

只在完整检查后输出观察JSON；sshConnectionTested/remoteOperationPerformed/readyToInstall/canExecute始终false。Python3.8可观察但报告releaseClientVersionSupported=false并返回1，普通发布仍阻断；本地诊断0也不等于真实认证、VM工具安装或首次安装就绪。超时/非原生返回/缺失API/home替换阻断且不输出半份成功；中断恢复原信号处理。独立升级Python不代表系统SSH或LibreSSL同时升级，其实际行为仍待Mac只读验证。

本批共新增12项测试定义：local-check的11项（真实目录FD/管道、最小环境/固定-G、版本分支、原门槛、平台/root/隔离参数、未知/超时/缺失API、真实home替换、窄CLI、中断及CI主机本地-G）；另加固定解释器缺失不回退测试。原26项Mac测试继续回归，现合计38项。shell夹具先断言交付路径固定，只有一次性测试副本替换为当前CI解释器以核含空格路径/恶意PATH及pathlib/json阴影模块；交付脚本没有测试覆盖开关。新增CI步骤在ops_release范围使用精确CPython3.14.10 x64运行这38项Linux离线夹具，update-environment=false，原3.10和C1步骤保持；该结果不能代替用户Darwin/PSF安装器/OpenSSH8.1实测，当前尚未运行。

源码/测试Python3.8 AST、符号表与读回/差异静态检查完成，CI配置同步静态核对；MCP-workspace未运行lint/build/test。初始head `9a8128c31ad8e5edfb52b90069a2880f0299a852` 的[CI #7838](https://github.com/sanqin888/sanqinMVP/actions/runs/41232185005)在默认Release中新local-check测试处中止：测试sys.flags桩缺少Python3.14 argparse/importlib使用的ignore_environment/verbose，未形成完整Release计数，后续3.10/3.14专项/Runtime/C1未运行。仅修测试桩以保留实际解释器的全部公开非callable字段、覆盖三个隔离值，并在原CLI测试核ignore_environment/verbose不丢失；客户端运行逻辑不变。将原新增3.14专项提前到耗时Release全量之前以尽早暴露兼容问题，原全量步骤全部保留，仍为38项Mac测试，无跳过或放宽门槛。owner/依赖图已审阅，基线无变化：无VM helper/永久unit/业务schema/迁移/外部运行依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及C1/CPython/R2暂停研究保持。本批已推送PR #3070，修订后CI待验；真实Mac客户端/网络及生产/AWS/DB操作均未执行。生产首用与后置隔离/故障/恢复决策保持；下一步先经CI交付固定版本并完成Mac本地预检，再接首次安装操作者通道与完整结果查询。

## 2026-10-31：采用生产首用验证，隔离验收后置

**PRODUCTION_FIRST_USE_SELECTED / PREPARATION_OPEN / PRODUCTION_NOT_EXECUTED / ISOLATED_VALIDATION_DEFERRED。**

用户已决定：完成必要代码与操作准备后，在现有生产实例的明确非营业维护窗口进行首次正常安装／更新验证；新隔离实例及未做的隔离故障测试统一后置，完整VM／数据库恢复实演亦列入后置验证任务。本决定替代下文旧版“全部D4隔离验收通过后才能进入生产”的先后顺序；历史记录和隔离case判据保留，不将延期记为通过或删除缺口。

生产首用前仍须完成：Mac客户端兼容与真实SSH参数核验、首次安装操作者通道及准确任务结果查询；固定准确生产目标、main来源／发布镜像／Runtime归档与独立审阅的bootstrap，保持原来源、原两锁、门禁及现场检查。已登记操作者Mac为macOS 10.15.8、x86_64、系统Python 3.8.2、OpenSSH 8.1p1／LibreSSL 2.7.3；当前客户端仍要求Python3.9+，静态审阅未见明显3.9专用语法/API，但尚无3.8.2兼容实测，不能视为准备通过，也不降低版本门槛代替验证。

执行顺序为：只读预检与材料核对；落实非营业维护窗口及业务/外部写入、进行中事务处置安排；通过已审阅Mac通道提交一次受控首次安装任务；在同一任务监督和原两锁内，沿既定维护流程记录准确原件、加载门禁、禁自动重启并确认实际停写；原任务暂停等待操作者手动创建准确生产实例快照、available及内容核验，并等待原恢复材料机外耐久保存与确认；条件满足后由原任务继续工具写入及正常交接，核工具、门禁、原应用/DB/卷、策略、健康端点及真实结果。后续正常发布仅按真实需要与准确计划/批准执行，不为补验收数字在生产刻意制造SQL、连续发布或回退场景。

失败或结果未知时，按既有准确原件/同代次收尾与事故保留规则处理，核实际容器及marker状态；不自动重提、重放SQL、重开业务或恢复快照，不将本地SSH返回或旧完成审计单独升级为成功，也不把FENCE_UNCONFIRMED当停写保证。维护窗口结束时间不能作为保证恢复营业的依据；快照恢复所需的新实例与连接/切流安排仍须纳入现场恢复准备。

后置任务统一登记在D4 runbook：隔离实例创建/身份绑定、脱敏基线与隔离TLS/路由/外部调用准备、原20项隔离矩阵及未做的断线/并发/杀进程/部分写入/daemon/socket/VM重启/交接边界等故障验证、完整VM与数据库恢复实演。全部未执行项保留DEFERRED/NOT_RUN，未知项保留UNKNOWN/BLOCKED；生产现场证据按生产首用范围登记，不能冒充隔离case PASS。交付进度分开记录“生产首用验证结果”和“后置验证缺口”，不宣称完整故障/恢复验收完成，不标restoreProven或无保留MINIMAL_EXECUTOR_COMPLETE。

本批仅文档调整，已审阅owner/依赖图，基线无变化：17+Manifest、250commits/300files、九helper/三永久模板和唯一应用state保持；不新增schema、依赖、常驻控制器或绕过开关，C1受保护加载/自建CPython/R2 CA研究继续暂停。本次未执行生产/AWS/DB操作或项目测试；[PR #3069](https://github.com/sanqin888/sanqinMVP/pull/3069) head `076ef21785e44c4e8dc92d15ef09d8e92f39ed11` 经[CI #7836](https://github.com/sanqin888/sanqinMVP/actions/runs/41223126710)SUCCESS（文档范围1成功/9范围跳过，未重跑Release/Runtime）合并dev `b29772c9d93a26d4d792c218a5ea2020d0589de2`。下一步先完成Mac解释器路线与兼容核验、操作者通道及首次安装结果查询，再准备生产首用维护流程。

## 首次安装：固定transient提交与活通道继承（源码已合并）

**INSTALL_TASK_SUBMISSION_MERGED_DEV / SOURCE_CI_VERIFIED / OPERATOR_PEER_OPEN / NOT_INSTALLED。**

基于PR #3067合并dev `56d025f88771d32e999bc2949ad256c60ee71997` 创建 `feat/runtime-install-task-submission-20261030`。在既有bootstrap新增窄installation-submit入口，仅准确source-sha/retention-id，固定根解释器/源码路径和同一sanq-runtime-install-<retention>.service；以固定argv提交一次systemd-run，禁shell、任意unit/property/路径/FD覆盖、reset、自动重试或恢复。

提交前须独立审阅配置五源码，沿原两锁核私有保留材料、来源和空闲，拒绝任何既有/部分安装事务及维护证据；只读namespace不创建新许可。持原五源码FD贯穿提交、等待和返回检查，但提交前释放原两锁，由run/cleanup各自重取。借用stdin/stdout活管道或TTY、钉身份，以--pipe直接传递，复用目标首帧及原快照/离机协议；不注入额外成功JSON，不转发调用者环境/令牌，stderr隔离，现存严格角色审计继续执行。

按[systemd-run v249文档与源码](https://github.com/systemd/systemd/blob/v249/src/run/run.c)核--pipe/--wait、AddRef、manager Result和退出码传播；[service语义](https://github.com/systemd/systemd/blob/v249/man/systemd.service.xml)及实际退出分支已核。将本首次安装任务的RemainAfterExit改为no：oneshot主进程退出后自动进入ExecStopPost再停用，避免成功后持续active使等待不能完成；普通release_task既有协议不改。固定Restart=no、KillMode=control-group、Delegate=no、CollectMode=inactive、SendSIGKILL=yes，启动7200秒/停止900秒、失败模式terminate；角色manager固定show由34到41项，同步复核这些属性，超时字符串按[systemctl属性输出源码](https://github.com/systemd/systemd/blob/v249/src/shared/bus-print-properties.c)限定2h/15min。

本地等待客户端10000秒总预算、分段有界wait，来源/通道持续复核；仅准确原生零返回且预算/末尾上下文正常才返回0，含义为本次活等待链成功观察，不新增磁盘完成许可。异常/非原生返回/中断/SystemExit(0)/预算过期一律非零；只对本次Popen等待客户端尽力terminate/kill并有界回收，不对未知代次unit发stop/reset/start。unit仍由manager独立管理，非零不证明任务取消或停写；按同一身份核事实，不自动重交。成功unit可被正常回收，已有事务仍阻止新提交，不能据“unit不存在”恢复或重放。

新增17项测试定义：真实保留材料/五源码FD/原两锁、一次性子进程的实际管道继承，及模型等待客户端的固定参数、环境隔离、锁释放、单次提交、源码/活通道漂移、旧/部分事务与维护证据、返回未知/信号/非原生值、中断/超时/有界回收、窄CLI和manager期限属性拒绝。一次性子进程不执行systemd或安装器，实际systemd/SSH继承与故障行为仍未实测。Python3.10 AST/符号表与静态差异核对完成；MCP-workspace未运行lint/build/test，[PR #3068](https://github.com/sanqin888/sanqinMVP/pull/3068) 最终head `0fcf3f781adcfa194aa5684103fdfcf2d856310a` 经[CI #7834](https://github.com/sanqin888/sanqinMVP/actions/runs/41141055650)SUCCESS（4成功/6范围跳过；两条Release各1547，默认893.211秒/3.10为1238.750秒；Runtime1080/12.543秒，既有C1回归412/4.830秒），已合并dev `9c9d013069bb32be6c25f4e8724daa96a55d6f88`。提交期间补一次性管道测试子进程5秒读超时，运行时代码未因该修订变化。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新已安装helper文件/永久unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。当前仅提交器与既有通道的VM端接线；Mac操作者同伴、准确目标/SSH传输、快照内容/离机耐久确认及未知结果查询交付仍待接，不能作为已验收现场安装指令。G3及真实D4仍OPEN/NOT_RUN，生产/AWS/DB未操作。完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：固定任务角色入口与成功／失败交接（源码已合并）

**INSTALL_TASK_ROLE_ADAPTER_MERGED_DEV / SOURCE_CI_VERIFIED / TASK_SUBMISSION_OPEN / NOT_INSTALLED。**

基于PR #3066合并dev `e31eb11c319b136b783509494feab913144cf614` 创建 `feat/runtime-install-task-role-adapter-20261030`。在既有bootstrap接入固定installation-run/installation-cleanup内部角色，CLI仅source-sha/retention-id，无host、路径或FD覆盖。独立审阅配置bootstrap后，仍须准确transient manager的PID/cgroup/argv/运行代次和原两锁/材料；普通用户直接调用不能获得安装权限。尚未提供unit提交或可用的操作者端完整通道，不作为现场安装指令。

manager固定show由31项增到34项，仅增加Result/ExecMainCode/ExecMainStatus；按[systemd D-Bus声明](https://github.com/systemd/systemd/blob/main/src/core/dbus-execute.h)与退出环境交叉核对。运行中要求未退出状态，stop-post核真实退出码或信号；原8字段关联上下文和磁盘格式保持，不把环境success、零退出或完成审计单独当成功许可。

run先持五源码FD进入有界首帧目标交互，复用既有严格目标JSON，再交完整监督安装。首帧仅请求既定数据、非执行许可；后续仍需原快照内容核验及离机耐久确认。入口先释放材料只读锁作用域，再让完整流程重取原两锁；源码FD持续覆盖通道、完整安装返回与最终退出检查。只有准确source/材料、原生完成结果及marker清除返回后才可退出0；SystemExit(0)、已观测IO错误或其他异常统一非零，不在错误路径写可能阻塞的管道。最后一次必须交互之后断连不一定可立即观测，仍须按同一任务查manager，不能自动重试。

将新建空的监督进度对象贯穿完整流程与任务返回，不接受旧/未绑定进度作为重放许可。晚到失败若已有本次原件内存所有权，重取原两锁并钉住原目录/锁文件身份、核空闲后沿用原ID尽力收尾；不能取得锁或遇到未知时保持非零，不宣称停写保证，不补造marker/成功记录。原观察异常已收尾时不重复本次内存尝试。

cleanup复用同一准确原件上下文：明确失败沿用原ID收尾；干净零退出还要求marker不存在、七项完整库存及恢复/快照/离机/完成审计链一致。仅返回cleanTaskExitObserved等观察，installationComplete/canExecute/restoreProven仍false；错误、旧运行代次、部分审计或外来marker均不能授予正常交接。持久completion保持原“清marker前准备”惰性含义。

新增22项测试定义，含退出属性交叉校验、真实首帧管道、源码FD覆盖返回且原锁可重取、SystemExit/中断/非原生完成拒绝、末尾源码/通道替换、窄CLI、完整监督安装经新入口返回与晚到失败按原锁收尾、正常交接不误停、信号失败不被旧审计覆盖等。原14项manager夹具同步退出属性与受限角色解析；原失败收尾17项继续回归。源码/测试Python3.10 AST、符号表及静态差异审阅完成；MCP-workspace未运行lint/build/test，[PR #3067](https://github.com/sanqin888/sanqinMVP/pull/3067) head `cf1b91961f1135f3011271d7d3db3d1a7f9085ca` 经[CI #7831](https://github.com/sanqin888/sanqinMVP/actions/runs/41134764360)SUCCESS（4成功/6范围跳过；两条Release各1530，默认891.275秒/3.10为1265.859秒；Runtime1080/12.756秒，既有C1回归412/4.877秒），已合并dev `56d025f88771d32e999bc2949ad256c60ee71997`，无CI修复。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新已安装helper文件/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步仍须专用unit提交、操作者通道/状态结果与真实D4；实际systemd、管道继承、断连/SIGKILL/主机故障尚未验收，G3仍OPEN。生产/AWS/DB未操作；完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：同代次失败任务的原ID收尾（源码已合并）

**INSTALL_FAILED_TASK_CONTAINMENT_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_TASK_DISPATCH_OPEN / NOT_INSTALLED。**

基于PR #3065合并dev `2e6e4eb9e30d691c39c49794626a52a51da1e3aa` 创建 `feat/runtime-install-failed-task-containment-20261030`。在既有bootstrap新增私有失败收尾函数，只接准确sourceSha/retentionId；持原两锁、五源码FD及完整来源上下文，新鲜核本次cleanup PID/cgroup/argv/InvocationID，再核唯一安装事务、原intent/writers与准确关联记录。只认同一运行代次的耐久双摘要，不扫描“最新”记录，也不把它替代普通owned流程的内存证明。

退出环境按[systemd官方语义](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)限定分类：已知非零退出/信号/超时等失败，以及success结果中的HUP/INT/TERM/PIPE信号终止可进入后续校验；success/exited/0、缺失、非规范或未知状态拒绝，均不是安装完成或跳过收尾许可。官方源码已核，实际隔离VM的systemd版本/行为仍待D4。本函数尚不能无条件挂入ExecStopPost，正常成功交接仍须后续任务入口实现。

通过本次失败身份和原件链后，按原三业务ID依次disable-restart、逆序stop；每项前后复核来源、manager、原路径/锁指纹、材料/记录、维护原件及300秒总预算。只读inspect准确原三ID，核原生状态和规范JSON策略，才能返回“本次观察已停止且禁重启”；命令回复丢失时继续其余准确动作各一次，但整体仍阻断，不重放、恢复策略、start、清/补marker、改gate或操作DB。源/manager/原件中途变化会阻断剩余动作，不宣称整体停写已保证。

已知辅助顶层对象允许保留部分输出，只核私有类型/指纹而不把内容当收尾或完成许可；未知名字/第二事务、错代次/原件/维护标记拒绝。原marker已不存在时可处理同代次明确失败，但不补造标记；部分completion也不变成成功凭证。无任何新持久记录、第二应用state或自动恢复入口。

新增17项测试定义，复用真实私有材料/原件、五源码FD和原两锁，模型化manager与Docker命令，覆盖准确顺序/原ID/DB与文件不变、失败分类/干净退出拒绝、错代次/缺关联/未知记录/第二事务、辅助残件、回复未知各一次、实际状态与原生策略校验、同字节替换/源码/manager变化、无marker晚到失败及外来marker保留。源码/测试Python3.10 AST、符号表及静态差异审阅完成；MCP-workspace未运行lint/build/test，[PR #3066](https://github.com/sanqin888/sanqinMVP/pull/3066)初始head `d644a926118b1517908f927bb361d33678960c05` 的[CI #7828](https://github.com/sanqin888/sanqinMVP/actions/runs/41114231070)默认Release实际运行1508项/691.088秒，6失败/4错误均因通用目录白名单拒绝installation-runs而提前阻断，3.10/Runtime/C1未运行。已补固定既有namespace的只读打开器（无创建/白名单放宽），并在原正向测试中断言通用打开器仍拒绝该目录；追加修复最终head `6a4204812672de5b615f27831d29aba922034410` 经[CI #7829](https://github.com/sanqin888/sanqinMVP/actions/runs/41116362520)SUCCESS（4成功/6范围跳过；两条Release各1508、Runtime1080、既有C1回归412），已由PR #3066合并dev `e31eb11c319b136b783509494feab913144cf614`。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。当前仍无公开安装CLI、专用unit提交/run/cleanup调度和正常成功交接，真实SIGKILL/断连/主机故障、快照/离机通道及D4未验收，G3仍OPEN。下一步接专用任务入口及成功/失败分支；生产/AWS/DB未操作。完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 首次安装：受监督bootstrap源码FD贯穿安装（源码已合并）

**INSTALL_SUPERVISED_BOOTSTRAP_FDS_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3064合并dev `fa349da2740af9452449faab325e8f71e274b8ae` 创建 `feat/runtime-install-bound-source-fds-20261030`。受监督观察在原两锁内核准确保留材料后、现场观察与intent写入之前，进入既有五文件bootstrap来源上下文；持有原目录/文件FD直到观察退出，核私有权限、库存、原字节/身份与准确发布源码。普通分支不打开该上下文。

将本次活来源检查闭包传入owned调用；源码绑定与callable检查必须成对出现。首次manager前后、持续task_check/recheck/check_owned及返回/上下文正常退出复核源码，拒绝同字节替换、权限或内容变化，不重新绑定新原件。沿用原件关联和事故保留，不新增磁盘许可、应用state或恢复重试。

新增12项测试定义：真实临时五文件/FD、原两锁与已有现场模型，覆盖FD生命周期、初始坏源码、writers后同字节替换、gate后权限变化、关联后漂移、普通分支隔离、缺失检查拒绝；另覆盖受监督完整安装模型的关联/惰性完成审计、首个工具写入前、应用启动后及清marker后的源码变化。同步原10项受监督writers夹具以提供真实惰性源码文件。解释器/导入元数据与manager、Docker/systemd/HTTP仍为模型；快照/离机同伴仅既有测试夹具，不能代替真实通道与D4验收。

完整源码FD复核发生在Python导入之后，仍必须先由独立操作者审阅并配置bootstrap；这不是暂停中的受保护加载器研究。当前仍无公开安装CLI、专用unit提交/run/cleanup或独立收尾；最后清marker后错误不伪造标记/完成回执，既有按原ID尽力收尾不等于SIGKILL/主机故障停写保证，G3仍OPEN。

源码/测试Python3.10 AST、符号表及静态差异审阅完成；MCP-workspace未运行lint/build/test，本批[PR #3065](https://github.com/sanqin888/sanqinMVP/pull/3065) head `a244e6218b951757a7305087a073d0a9d4a08ce2` 经[CI #7826](https://github.com/sanqin888/sanqinMVP/actions/runs/41109645658)SUCCESS（4成功/6范围跳过；两条Release各1491、Runtime1080、既有C1回归412），已合并dev `2e6e4eb9e30d691c39c49794626a52a51da1e3aa`，无CI修复。已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步仍为安装专用提交/run/cleanup与真实快照/离机通道和成功/失败交接；生产/AWS/DB未操作。完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

> **2026-10-31（America/Toronto）｜PRODUCTION_FIRST_USE_SELECTED / D4_ISOLATED_DEFERRED / NOT_EXECUTED / RESTORE_VALIDATION_DEFERRED。**用户已调整为先进行非营业维护窗口的生产首用验证；本文件保留后置隔离与恢复验证的固定判据。当前生产执行及后置测试均未开始，实际执行以各自准确范围、目标/材料及就绪条件为准。

D4方案已由[PR #3058](https://github.com/sanqin888/sanqinMVP/pull/3058) head `686a70f8ec2c2598ad6cd73189fb195b2e0d4a72` 经[CI #7811](https://github.com/sanqin888/sanqinMVP/actions/runs/41066304814)SUCCESS（文档范围：1成功/9跳过，未重跑Release/Runtime测试）合并dev `8f0b6f11a8b61b0f83a4888764e15b2da5642998`。

## 当前结论与准确基线

Mac入口批[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292` 后，以该准确源码树作为本方案审阅基线。源码/CI通过、隔离验证、生产安装和最终交付分别记录；任何一项都不能代替下一项。

前序Mac入口批[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)最终head `6b8d1e77cfef23228160021b37779e4eed2a3c48` 经[CI #7809](https://github.com/sanqin888/sanqinMVP/actions/runs/41054754179)SUCCESS（4成功/6范围跳过；两条Release各1416、Runtime1080、既有C1回归412），已合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292`，无需CI修复；无生产/AWS操作。

本轮只读核到：GitHub main在观察时为 `d3a896f32f1db71e49433f9e87bef534e27589bb`，与PR初始head `6b8d1e77cfef23228160021b37779e4eed2a3c48` 的compare元信息为diverged、ahead103/behind1。该数字仅说明分支关系，不用compare文件清单证明材料完整、来源通过或可直接晋级。main和目标发布必须在实际准备前重新按准确对象核验，本批不自动合main或触发发布。

### 后置隔离执行的四项前置（不再整体作为生产首用之前置）

| 前置 | 已有能力与实际缺口 | 解除条件 |
| --- | --- | --- |
| G1：准确隔离目标 | 本次尚未核到并绑定新的隔离实例；当前连接提供生产只读与代码工作区，不能默认复用它作故障试验目标 | 填齐下表目标事实，独立核SSH主机key与AWS对象，确认无生产流量/凭据/真实外部写入 |
| G2：准确可验材料 | 生产首用与后置隔离都须核准确main来源/成对发布/原Runtime归档；dev CI或kit自报hash不能替代。隔离S1/S2和专项SQL/回退对象随隔离验收后置 | 生产首用固定S_tool及实际需要发布的准确材料；后置隔离执行前再固定其独立B0、S1/S2和SQL/兼容审阅对象 |
| G3：首次安装受控入口/监督 | 固定提交/run/cleanup、来源FD及同代次原件收尾已由PR #3068等合dev并经源码CI；Mac兼容、首次安装操作者通道与完整结果查询仍待完成 | 生产首用前完成必要接线/CI、真实Mac只读验证及准确生产目标/材料/快照通道准备；破坏性中断与隔离故障验证保留后置，不用任意导入/nohup或跳过校验替代 |
| G4：隔离就绪请求目标 | 安装器六端点含127.0.0.1与固定https://sanq.ca；新VM直接运行可能把生产200误作隔离结果 | 准确审阅隔离TLS/解析/路由与外部调用阻断，证明每个请求到隔离目标；不能改生产DNS/切流、跳TLS或借生产响应补通过 |

受控入口可以是经审阅的一次性适配，复用现有私有函数，不要求另造通用公开安装API。问题是尚未落实监督、来源/目标和通道的完整调用边界，不是函数名称带下划线就不能使用。

G3不是普通发布任务的缺口：release_task.py已有固定sanq-release-apply-<plan-id>.service、Restart=no、ExecStopPost及manager PID/cgroup检查。它不能直接当首次安装监督器，因为bootstrap运行在工具交接之前/之中，不可依赖尚未完整安装的release_task/guard，也不能根据目录里任意旧writers.json发root命令。

首次安装_installation_application_ownership仅捕获Python异常；固定stop-post及同代次原件收尾、unit提交已合dev并经源码CI，操作者完整通道仍待完成，实际SIGKILL/主机故障验证统一后置。准确原策略恢复后，运行中的daemon可能重启应用；最后清marker后，失败也不保证marker仍在。生产首用须如实保留这两个窗口的未验收边界，不把“门禁存在”“发过stop”或FENCE_UNCONFIRMED当停写证明；后置隔离执行时仍须覆盖独立收尾及实际中断测试，不新增CA、可信时间或常驻控制服务。

## 后置隔离与恢复验证统一登记

以下任务随隔离实例一起延期，后续单独安排；当前均未执行，不能据生产首用成功填为通过。

| 后置任务 | 范围 | 当前状态 |
| --- | --- | --- |
| 隔离实例与身份 | 创建/绑定独立实例、AWS对象、SSH key与系统版本 | DEFERRED / NOT_RUN |
| 脱敏旧基线与准确候选 | 原工具/示例数据、独立S1/S2发布与SQL/兼容对象 | DEFERRED / NOT_RUN |
| 隔离网络及外部调用 | TLS/解析/实际请求目标，支付/邮件/备份等隔离 | DEFERRED / NOT_RUN |
| 原D4-01至D4-20矩阵 | 完整正常场景、断线/并发/部分写入/杀进程/daemon/socket/VM重启及交接边界 | DEFERRED / NOT_RUN |
| 完整恢复实演 | VM及数据库真实恢复、恢复后数据/服务核验；所需实例与连接安排 | DEFERRED / NOT_RUN |

生产首用另按准确维护窗口、目标、材料、正常执行与实际结果保留证据。任何自然发生的故障仍按现场真实UNKNOWN/BLOCKED记录；延期不是停用现有失败保护或重放许可。

## 后置隔离目标与材料登记（待现场填写）

以下是人工审阅表，不是新的持久schema/授权文件；空值必须保持待定，不用示例替代真实事实。

| 对象 | 必须记录 |
| --- | --- |
| 隔离AWS对象 | account/region、instance名称及ARN、独立实例ID/SSH key指纹、创建来源；费用/套餐和实际Blueprint由操作者另定，不在本方案自动创建 |
| 真实系统 | /etc/os-release、uname、systemd/Docker/Compose版本、系统Python完整版本/路径、磁盘UUID/挂载/lsblk、资源；应匹配已审阅合同，不假定AWS仍提供某个旧Blueprint |
| 网络/外部隔离 | SSH实际目标；无生产Cloudflare/DNS切流；入站测试范围；Clover/Uber/邮件/备份等测试配置或受审阅阻断；不复制真实营业令牌或接生产DB |
| 旧基线B0 | 旧17+原Manifest、准确旧归档来源/独立压缩hash、四原容器ID/image/生命周期/策略、DB volume/project/挂载、原.env/state/C4与外部备份/units事实 |
| 工具S_tool | 准确40位main SHA、对应main/push CI、成对seal/publish与两digest、原Archive及其Manifest原ciRunId、bootstrap与九helper/三模板的完整Git对象 |
| 应用S1/S2 | 两次连续发布的准确main来源/digest及运行合同；SQL场景选已有可审阅安全增量与准确库存/历史/SQL摘要，不为试验手写业务迁移 |
| Mac | /usr/bin/python3、ssh版本、普通账户、固定本地profile与独立核对的key指纹；保留原plan-id与证据目录，不上传私钥 |
| 恢复材料 | 本次原工具/配置/私有历史归档、停写后准确手动快照available及内容核验、离机索引与耐久确认；完整恢复实演仍延后 |

可以用新实例重建受控旧工具/示例数据基线，不必先做完整生产快照恢复演练。不得直接让生产快照克隆带真实凭据联网营业；隔离方式和基线差异必须如实记录，不能将脱敏基线称为生产副本完全一致。

本节G1/G4及隔离基线只约束后置隔离执行，不能用生产目标代替隔离目标。生产首用按文首调整方案落实准确生产目标、可验材料、Mac/操作者/查询接线、维护窗口、停写与快照/离机确认等准备后进行一次正常执行；准备未通过时继续只读核查。主动故障注入统一保留后置。

## 后置隔离执行顺序与证据

1. 先完成四项前置及准确操作范围审阅，锁定S_tool、B0、应用候选和目标实例。真实测试均从可辨认的干净基线开始，不在未知残件上重试。
2. 先只读预检与拒绝场景，再一次正常旧→新工具安装。每次写入故障/主机重启用独立可丢弃试验基线；不要把上一条事故的现场清理后冒充同一轮恢复成功。
3. 安装通过后，验证普通无迁移发布、真实增量SQL、连续双发布和兼容镜像回退；SQL批准及回退兼容批准各自绑定准确计划。
4. 最后执行SSH断线、并发、SIGKILL、Docker socket/daemon/VM重启和交接中断。每条都核实际对象，不只看日志/退出码。
5. 汇总后置隔离真实结果、未处置现场及与既有生产首用事实的差异；没有足够证据的项保持NOT_RUN/UNKNOWN/BLOCKED，不倒填早期通过、不自动扩大范围或重新启用暂停研究。

证据目录放在操作者私有位置，不进入git。每个case保留：case-id、准确源码与目标、前置/注入时刻、实际argv/时间与退出码、unit/PID/cgroup、marker/intent/writers/completion等原件hash、前后容器/策略/DB/卷/挂载和唯一state观察、HTTP实际路由及返回、原始日志位置、结论与未决项。原件可能含配置/数据；仓库只收脱敏总结与摘要，不收.env、私钥、业务数据或恢复tar。

UTC只作审计时间，不作为可信时间证明。不要为演练新增证书权威/离机CAS服务；如需一次性隔离TLS夹具，应单独标其边界，它不能证明真实Cloudflare公网路由。公网端到端证据不足的项保留OPEN，第四批实际生产路由另验。

## 后置隔离验收矩阵（D4-01至D4-20均DEFERRED / NOT_RUN）

| case-id | 场景 | 最低判据与保留证据 |
| --- | --- | --- |
| D4-01 | 目标/来源/版本只读预检 | 准确AWS/SSH/系统与S_tool/B0相互对应；原件与来源不可得时提前拒绝，不开始停写 |
| D4-02 | 四种漂移拒绝 | current/state、配置、SQL库存/历史、候选proof逐项晚变均拒绝；不能换latest或跳过校验 |
| D4-03 | 锁竞争与未知残件 | 两锁顺序一致；第二任务、已有pending/未知安装成员拒绝；不unlink锁、清旧记录或重置阶段 |
| D4-04 | 正常首次安装 | 九helper/17+原Manifest逐项读回、三永久gate有效加载/API；原三ID/镜像与DB不变，原件保存；新生命周期、准确原策略和六端点就绪；completion预清审计耐久，最后marker为空 |
| D4-05 | 临时门禁加载失败 | 磁盘有文件但manager未生效不能改restart/停业务/写工具；准确保留实际文件和marker |
| D4-06 | 快照/离机确认中断 | 未停写、错目标、未available、内容/nonce不符、ack/通道丢失均不写工具；材料/部分回执保留，不伪造restoreProven |
| D4-07 | 工具写入/永久交接未知 | 写/rename/link/fsync/reload/读回失败保留实际新旧字节及pending；不执行混装工具、不自动撤回或重放 |
| D4-08 | 原应用启动与策略恢复失败 | 错ID/镜像/挂载/DB或健康/HTTP不符，含回复丢失及部分策略恢复，独立收尾只处理准确保存ID；未知仍FENCE_UNCONFIRMED |
| D4-09 | 安装任务SIGKILL | 在停写、工具交接、启动原应用、恢复策略各边界验证独立收尾；先补G3，不能用Python finally或普通发布unit代替 |
| D4-10 | 最后清marker边界 | 清理前、unlink后/目录同步前、同步后/最终核对前分别中断；核实际存在/不存在与应用状态，不重造/重删marker或改审计为成功，不把未知当已冻结 |
| D4-11 | 普通无迁移发布 | Mac plan一次、审阅后apply一次；固定目标/本地镜像、不隐式pull/build切换；唯一state最终ACTIVE与真实健康/HTTP匹配 |
| D4-12 | 准确增量SQL | show-sql准确原文/顺序/hash；无批准或错误摘要拒绝；有准确批准才执行；真实退出/历史核对与应用验证，不能把UNKNOWN当未执行重跑 |
| D4-13 | 连续两次发布 | S1、S2分别独立计划/确认；工具保持，current/previous无第二权威；没有残留marker/pending/未知job |
| D4-14 | 兼容镜像回退 | 独立rollback review/compatibility摘要与确认；DB历史不反向迁移；原卷/挂载保持，status-rollback与实际目标一致 |
| D4-15 | Mac断线/重复提交 | 提交后断SSH、客户端超时/信号；原transient继续/结果可查，重连同plan-id；第二提交不产生第二份执行，不把SSH退出0当ACTIVE |
| D4-16 | Mac身份/输出边界 | 错key/额外配置/权限/同字节替换/连接255/大输出与终端控制拒绝；固定target不被CLI/HOME/SSH配置覆盖；不泄露私钥 |
| D4-17 | 发布任务SIGKILL与健康失败 | 故障点覆盖新写入者创建/启动/验证；ExecStopPost真实运行并核保存或候选准确对象；不停止替代ID/DB，不自动重开 |
| D4-18 | daemon/socket/VM重启 | 门禁未解除时三入口真实拒绝；核live-restore/shim及实际容器，不以daemon停了当业务停了；不自动重放任务 |
| D4-19 | ACTIVE/策略/维护交接中断 | 每个持久间隙留原件；不一致时只报真实未知/事故；不凭某一状态文件或unit success宣布成功 |
| D4-20 | 备份与资源 | 维护期间timer触发被实际阻断；解除后按原enabled/active语义；观察内存/磁盘/材料大小、墙钟与限流，不靠自动prune或放宽300秒等预算通过 |

D4-18的破坏性步骤只对登记的隔离VM执行，不提供可误复制到生产的通用restart/kill脚本。故障注入应使用准确unit/PID/容器身份和已审阅时间点，测试后先记录证据与未知状态；是否重建试验基线是另一个显式操作，不自动清理或恢复营业。

## 首次安装适配的有限退出条件

G3后续实现仍放在既有bootstrap/一次性安装范围，不增加常驻service、通用root launcher、新sudoers或第二发布状态。至少要同时交付：

- 固定材料/retention/目标参数及root私有bootstrap验真/持有方式；拒绝用户可写staging直接提权执行、任意脚本路径或任意Docker/systemd命令。
- 与SSH脱离的受限安装执行及一次性manager关联；明确安装ID在原件落盘前后的绑定、两锁所有权、日志/查询、Restart=no和不重放。
- 独立失败收尾在原保存writers已耐久存在后才能使用其原ID；无writers/坏原件/替代ID保持未知，不能按角色重新发现后停止；不碰DB、不恢复策略/业务。
- 快照等待/索引离机确认的实际通道寿命与预算：操作者手动创建准确快照，机外接收器耐久确认；SSH断线不能变成自动批准或丢失维护所有权。
- 明确正常完成、最后marker清理与收尾之间的判别；当前completion记录本身installationComplete=false只是历史准备事实，不能单独授权“成功所以不收尾”，也不能在已成功后因无条件finally/ExecStopPost再次停业务。
- 对SIGKILL/主机故障/清理后未知给出准确可验语义及模型；不承诺绝对冻结或自动恢复，不改变用户延后的完整恢复演练决定。

这些条件来自现有D2/D4合同与实际未接线处，不把暂停的C1受保护加载、CPython全链、R2 CA/可信时间接回首版。适配源码及CI通过后才安排真实写入验收。

## 源码已合并：受监督writers阶段与登记时序

**INSTALL_SUPERVISED_WRITER_HANDOFF_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3063合并dev `06170a4af56ae2f0cd8b1c3dbbb97ce18b8aecec` 创建 `feat/runtime-install-supervised-writers-20261030`。将私有可选_task_source_sha从完整现场观察传到owned安装调用，要求已有完整writers观察且准确匹配保留材料/现场源码。首次manager核验在intent/marker/gate写入之前；空观测、错源码或非run角色提前拒绝。recheck、check_owned及末尾返回持续核同一manager运行代次，拒绝中途换代，不收养新任务。

受监督分支在原writers已耐久保存并核对后、freeze回调之前调用受控关联登记；其原件清单及退出校验继续钉准确字节/身份。新增taskHandoff摘要输出，canExecute/installationComplete/restoreProven保持false。新增私有_save_supervised_installation_writers仅走到保存证据阶段，不冻结、不安装工具；完整安装私有包装器可显式传task_source_sha，未传时原分支不查manager、不创建关联文件。

目前没有公开安装CLI、专用unit提交、run/cleanup或自动恢复。manager校验含既有bootstrap固定路径/解释器前置，但完整源码FD持有仍须后续受限任务入口负责；本次不能把路径、CI模型或已有completion审计当安装许可。新增完整包装器参数的测试只核传递，不能代替全流程快照/通道或真实systemd实测；SIGKILL、主机故障及最后清marker未知仍未验收，G3保持OPEN。

新增10项测试定义，以已有现场模型、真实私有文件与原两锁，模拟manager核保存原件后登记、freeze之前时序、连续代次、manager初始失败/空观测、错源码、同步未知保留、原分支隔离及完整包装器参数。新增源码/测试Python3.10 AST、符号表与静态差异审阅完成；MCP-workspace不运行lint/build/test，本批[PR #3064](https://github.com/sanqin888/sanqinMVP/pull/3064) head `58fad5fb8c1279221ce0aa0647a926e532225bb1` 经[CI #7824](https://github.com/sanqin888/sanqinMVP/actions/runs/41097966917)SUCCESS（4成功/6范围跳过；两条Release各1479、Runtime1080、既有C1回归412），已合并dev `fa349da2740af9452449faab325e8f71e274b8ae`，无CI修复。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步完成受限bootstrap FD持有/专用提交与run/cleanup、快照双帧/离机通道和成功/失败交接，再做真实D4。生产/AWS/DB未操作，完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 关联记录受控登记与清单校验（源码已合并）

**INSTALL_OWNED_TASK_HANDOFF_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3062合并dev `4c9c6bdec0e2dfc299879fa3292e9bb6a5ddb023` 创建 `feat/runtime-install-owned-task-handoff-20261030`。在既有bootstrap补受控关联记录登记：要求本次owned_records已有准确writers且无旧关联，调用方检查先通过，再核准确intent/writers原件，完成create-only IO与读回后才登记独立context副本、原字节及完整文件指纹，最后再次调用owned检查。失败保留已写文件与实际登记状态，不删除、重试或恢复营业。

将task-originals.json接入owned记录白名单、_installation_owned_run、check_owned和命名空间退出校验。仅本次内存登记证明存在时接受该成员；每次核原intent/writers关联、记录字节及完整文件指纹，拒绝同字节替换、变化的运行代次、坏证明和未知残件。没有登记的正确文件也不能被收养；这不新增第二应用state或磁盘resume许可。

受控登记本身不取得全局锁，也不刷新manager/来源；必须由上层准确原锁和受控check_owned闭包负责。新增测试使用真实临时文件及调用方持有的两个OS锁核检查时机，不代表实际VM全局锁/manager已验收。普通安装尚未调用登记生产者，仍不创建该关联文件；下一步须将它接原writers耐久之后、freeze之前，并补manager/来源新鲜检查及安装专用提交/run/cleanup。当前没有公开apply或独立收尾入口，G3仍OPEN。

新增8项测试定义，覆盖调用方锁与登记、无登记文件拒绝、旧登记/错writers拒绝、同字节替换、内存context/证明变化、同步未知保留未登记文件、末尾context失败保留登记及namespace退出。新增源码/测试Python3.10 AST、符号表与静态差异核对完成，MCP-workspace不运行lint/build/test，本批[PR #3063](https://github.com/sanqin888/sanqinMVP/pull/3063) head `cfe4d7d91e9329fed0716879fbd90aba26098e7d` 经[CI #7822](https://github.com/sanqin888/sanqinMVP/actions/runs/41092595964)SUCCESS（4成功/6范围跳过；两条Release各1469、Runtime1080、既有C1回归412），已合并dev `06170a4af56ae2f0cd8b1c3dbbb97ce18b8aecec`，无CI修复。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。真实D4、生产/AWS/DB操作未执行；完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 任务关联记录受限读写（源码已合并）

**INSTALL_TASK_HANDOFF_IO_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3061合并dev `125a9c0a209a3c8d00ea94d7c8df58fbd5b3188c` 创建 `feat/runtime-install-task-handoff-io-20261030`。在既有bootstrap新增固定task-originals.json的私有create-only写/读回原语，复用原run上下文与intent/writers准确关联模型；读回仍要求原run上下文，不是cleanup进程可直接使用的事故收尾API。

只接收调用者已持有的目录FD，不接受文件名或路径参数。目录root:root 0700、文件0600普通单链接，大小≤16KiB；创建前核root与空间余量，以EXCL/NOFOLLOW新建，处理短写、文件fsync、目录fsync及规范字节/完整FD/路径身份读回，末尾再核原FD、路径与目录。未知写入/同步/替换或残件均原样保留，不覆盖、截断、unlink或自动重试。结果只有摘要/指纹与installationComplete/canExecute/restoreProven=false。

这是私有IO原语，尚未接入原安装调用链、owned_records或命名空间库存；既有安装流程仍不创建此文件。原语本身不取得原两锁、不验证目录FD来自准确安装namespace、不刷新manager或验证来源/原件耐久性，这些必须由后续owned接线保证。不能凭一次读回或现存文件收养任务、执行安装/清理、跳过失败收尾或宣布冻结；未提交unit、未开放安装apply，G3仍OPEN。

新增8项测试定义，仅在真实临时目录、模型root身份和空间下验证字节/权限/双fsync、重复创建、权限/链接/部分记录、短写/零写、文件/目录同步失败及读回后同字节替换。新增源码/测试Python3.10 AST、符号表和静态差异审阅完成；MCP-workspace不运行lint/build/test，本批[PR #3062](https://github.com/sanqin888/sanqinMVP/pull/3062) head `b7f597773aa57e2cdf5b5fe42f04160e4e1bc844` 经[CI #7820](https://github.com/sanqin888/sanqinMVP/actions/runs/41086363103)SUCCESS（4成功/6范围跳过；两条Release各1461、Runtime1080、既有C1回归412），已合并dev `4c9c6bdec0e2dfc299879fa3292e9bb6a5ddb023`，无CI修复。

已审阅owner/依赖图，基线无变化；无业务schema/迁移、新helper/unit/依赖或第二应用state，17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。下一步在原writers耐久后、freeze前接入准确manager代次/原件持久关联、owned清单和原锁，再完成安装提交/run/cleanup及快照/离机通道。真实D4与生产/AWS/DB操作未执行；完整恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

## 任务与原件关联模型（源码已合并）

**INSTALL_TASK_ORIGINALS_MODEL_MERGED_DEV / SOURCE_CI_VERIFIED / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3060合并dev `f98e4f293f4f64e8e87df360f9f401eb0bbae9d6` 创建 `feat/runtime-install-task-originals-20261030`，在既有bootstrap增加任务与原件关联的惰性字节模型及准确核对。严格核本次run观察字段/native bool、sourceSha、retentionId、固定unit和非零InvocationID；复用原intent/writers解析与摘要绑定，拒绝另一材料、源码、安装ID、运行代次或改动原件。

规范JSON关联包含schemaVersion=1、独立kind、源码/材料/安装/unit/运行代次、intent/writers两摘要，installationComplete/canExecute/restoreProven始终false。核对只接受本次上下文和两原件重新计算出的准确字节，拒绝重复/额外字段、非规范编码或成功声明。它不证明上下文新鲜、来源可信、原件已经耐久存在或磁盘归属；不提供任何执行许可。

当前只有内存模型，未新增持久文件/安装schema写入、未接安装回调、未提交unit、不扫描/收养事故记录，也不执行Docker/systemd/SQL或清marker。未来必须在完整来源FD上下文、准确manager新鲜核对及原两锁内，接线原件耐久交接与独立收尾；本模型不能独立作为SIGKILL安全、成功后跳过收尾或resume依据，G3仍OPEN。

新增8项测试定义，复用惰性原容器事实夹具，核准确双摘要、严格上下文、错源码/材料/unit/运行代次、intent/writers变化、非规范/重复字段/伪造成功及输入预算。新增源码/测试Python3.10 AST、符号表与静态差异核对完成；MCP-workspace不运行lint/build/test，本批[PR #3061](https://github.com/sanqin888/sanqinMVP/pull/3061) head `37cfca62f7ea00e4f508e984730b8409027d43bb` 经[CI #7818](https://github.com/sanqin888/sanqinMVP/actions/runs/41079971358)SUCCESS（4成功/6范围跳过；两条Release各1453、Runtime1080、既有C1回归412），已合并dev `125a9c0a209a3c8d00ea94d7c8df58fbd5b3188c`，无CI修复。

已审阅owner/依赖图，基线无变化；17+Manifest/250/300、九helper/三永久模板及暂停C1/CPython/R2保持。真实D4、生产/AWS/DB操作均未执行；完整VM/数据库恢复实演继续交付后，更新前手动快照/内容核验、材料/离机确认保留，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。下一步仍须交付安装提交/run/cleanup、耐久原件关联及快照/离机通道。


## 安装任务manager身份边界（源码已合并）

既有bootstrap内新增只读_installation_task_context及固定argv/show模型，供后续受控run/cleanup接线。unit只按准确retention-id命名sanq-runtime-install-<64hex>.service；安装随机installationId在后续原intent落盘时才产生，当前没有将两者耐久关联，不能扫描目录选择旧writers或最新任务。

先核既有bootstrap固定路径/解释器前置；此函数不独立验证kit/main源码，完整来源FD上下文须由未来上层持有。≤30秒查询固定systemctl show属性；同时核manager InvocationID与本进程INVOCATION_ID、主/控制PID与阶段、真实/proc/self/cgroup、完整NUL分隔cmdline及当前目录。要求固定root transient oneshot、Restart=no、RemainAfterExit=yes、准确ExecStart/ExecStopPost单命令；拒绝drop-in、额外条件/启动/停止动作、环境/根目录覆盖及自定义成功退出码。只读结果仍canExecute/installationComplete=false，不证明故障后业务已停或安装成功。

两个预留内部角色installation-run/installation-cleanup尚未加入公开CLI，实际调用仍被拒绝；本批不生成systemd-run命令、不提交unit、不读取事故writers执行容器操作、不开放安装apply或清marker。新白名单只给准确安装unit的固定show查询，不接受stop/start/restart/任意property或任意unit。

官方参考：[systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)、[systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)。ExecStopPost也覆盖服务停止路径，不能一律停原应用；InvocationID区分unit运行代次，但它本身不是安装完成许可。所查为当前上游手册，不能替代目标systemd版本/真实show格式及D4实测。本批仅校验身份，不根据SERVICE_RESULT/EXIT_CODE或completion历史记录作成功/失败收尾决定。

14项manager/proc模型测试已随源码CI通过；本批[PR #3060](https://github.com/sanqin888/sanqinMVP/pull/3060) head `f8ba5d39538ea32d6ff289e4020dbafa49bc2cd6` 经[CI #7816](https://github.com/sanqin888/sanqinMVP/actions/runs/41075422332)SUCCESS（4成功/6范围跳过；两条Release各1445、Runtime1080、既有C1回归412），已合并dev `f98e4f293f4f64e8e87df360f9f401eb0bbae9d6`，无CI修复。没有真实systemd/VM/Mac验收。下一步需要同一owned流将准确manager代次、intent/writers原件和材料绑定，并接快照/离机实际通道、执行提交和独立失败收尾；正常交接后不可误停业务，清marker未知时不可伪称围栏仍在。G1–G4及20项真实验收状态不因此改为PASS。

## bootstrap材料保留入口（源码已合并）

`feat/runtime-install-bootstrap-binding-20261030`在既有install_minimal_executor.py增加`retain`，仅调用已审阅的root私有材料保留，不是安装执行或普通Mac发布动作。15项测试已进入PR #3059 CI；初始head 7609b889 的[CI #7813](https://github.com/sanqin888/sanqinMVP/actions/runs/41068929792)默认Release运行1431项，发现1失败/1错误，不能记为通过：新增重放测试错误期待ReleaseContractError，实际create-only正确抛FileExistsError；新增CLI测试的GitHub模拟未接受token关键字。仅修测试为准确异常、重放零写/原件不变断言及接收token的模拟，生产实现不变；已推同PR重跑，修复后最终head `40a12ecc413735bca57c8fde613a82ca9d5f6dee` 已经[CI #7814](https://github.com/sanqin888/sanqinMVP/actions/runs/41070377603)SUCCESS（4成功/6范围跳过；两条Release各1431、Runtime1080、既有C1回归412），由[PR #3059](https://github.com/sanqin888/sanqinMVP/pull/3059)合并dev `e85fb8298e07f9ef0cbbfa0e99848cd242af1a4d`。 G3仍OPEN；不会写Runtime/门禁/marker、运行Docker/systemd/SQL、提交安装unit或恢复营业。

启动前必须由已授权操作者从独立审阅的准确源码准备固定`/opt/sanq/install-bootstrap/<source-sha>/`，再按已审阅系统Python调用。不能直接把kit解压为root代码；kit中的Python始终只当验证数据。程序启动后才核自己的来源，不可能追溯阻止已发生的恶意import；因此人工启动前来源/目录审阅不可省略。这不是C1受保护加载或CPython供应链证明，不承诺隔离恶意root/已受损进程。

bootstrap树固定五文件：

| 目录 | 唯一文件 |
| --- | --- |
| ops/release | install_minimal_executor.py、release_contract.py |
| ops/runtime | build_bundle.py、versioned_release_contract.py、runtime_trust.py |

install-bootstrap父目录只允许本次准确SHA，其下只能上述ops/两子目录/五文件；不放.git、__pycache__、凭据、kit或额外脚本。所有bootstrap目录root:root 0700，源文件root:root 0600普通单链接；/opt/sanq祖先仍按既有保护规则核验。入口不自动创建bootstrap、chown/chmod、删除旧SHA或清未知成员。要保留其他bootstrap版本时先独立审阅安置方式，不绕过本入口库存限制。

要求Linux、root、CPython3.10+且sys.executable准确/usr/bin/python3，以-I -S -B启动；源码模块路径也必须准确对应该树。启动前就须遵守这些参数，不能期望检查失败撤销此前的Python加载/pycache行为。材料参数只选数据，不选择代码、目标Runtime或主机命令：

| 参数 | 准确内容 |
| --- | --- |
| --source-sha | 与bootstrap目录及独立main发布相同的40位小写SHA |
| --kit | 不执行/不解压的交付kit普通单链接文件 |
| --current-runtime-archive | 保留的准确旧Runtime原归档数据 |
| --current-source-sha | 该旧归档准确40位来源SHA |

本节只列接口，不给尚未绑定目标/材料的可复制root执行命令，也不授权当前连接执行retain。材料保留本身不要求先完成安装的网络/快照交互，但实际root写入范围仍须独立核对；它不能解除G1/G2/G4或授权完整安装/普通release_task适配。

入口先持有受保护目录与五个原文件FD/身份，核固定库存、权限、大小/单链接，与准确main/发布/完整Git来源逐字节一致，调用既有两锁下create-only/fsync材料保留，返回前再核原FD/路径、库存及身份。失败保留原件；晚变即使发生在retained.json已写后也不报告成功、不删除或重试。MATERIALS_RETAINED仍携带readyToInstall/canExecute/authorizedToMutateProduction=false，不证明已安装、已停写、来源未来不再变化或可重放。

尚需实现安装专用transient/manager关联、原writers准确ID独立收尾、快照双帧/离机确认通道及成功交接判别；本节不能拿来执行完整安装、SIGKILL验证或20项真实验收。首次安装与更新前快照/内容核验仍保留，完整VM/DB恢复实演继续交付后。

## 收口与本批边界

PR #3058只完成方案/审计，无代码/CLI/schema/unit/测试；后续bootstrap材料入口与manager观察的各自实现/CI/待验状态见对应进度节，不能回填为PR #3058的CI结果。没有操作AWS/VM/Mac/DB或运行项目测试。G1–G4未解除，20个case均未执行；源CI成功也不把它们改为PASS。相关入口：[实现方案](../architecture/Runtime最小更新执行器实现方案.md)、[安装合同](../architecture/Runtime最小执行器工具交付与安装合同.md)、[Mac入口](Runtime最小执行器Mac入口.md)、[当前优先级](../architecture/Runtime最小更新执行器与暂停恢复计划.md)。

D4通过后提交可审阅的第四批材料：准确目标/备份快照/工具包/最终来源、受限root步骤与每步验收/停止点、当前真实应用候选/配置/迁移审阅、残件与人工处置方案。生产root/systemd/AWS/数据库和dev→main晋级继续独立核对授权；不因本方案或一次模型成功自动执行。完整快照/数据库恢复实演列交付后，仍不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。
