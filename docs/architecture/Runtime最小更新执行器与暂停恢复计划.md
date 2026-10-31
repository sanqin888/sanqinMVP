# Runtime 最小更新执行器与暂停恢复计划

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

**2026-10-27 当前进度：D2_APPLICATION_BINDING_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增四容器有效环境与保存DB网络目标的只读比较，接原双锁、来源和主机双读；已通过PR #3016合并dev。

运行环境/就绪前置批已由[PR #3015](https://github.com/sanqin888/sanqinMVP/pull/3015) 最终head `bfe2517c464c68cdbec872871636f3232d051d3b` 经 [CI #7717](https://github.com/sanqin888/sanqinMVP/actions/runs/40584486112) SUCCESS（4成功/6范围跳过；默认Python与CPython3.10的Release各725，Runtime1080，准确CPython3.12.15既有回归412），无CI修复，合并dev `11deb05597f79b736b2a3a99f5509579a886878c`。下文该批原LOCAL/未运行描述保留为原审阅时点；此证据不代表现场安装或真实隔离验收。

仅新增containerEnvironmentObserved/databaseConnectionTargetObserved=true及摘要；applicationConfigurationObserved/hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven继续false，requiresHostRecheck=true。databaseLoginVerified/databaseMigrationParityProven/fullApplicationConfigurationProven=false：环境与网络目标一致不等于实际使用这些凭据登录、完整应用配置或迁移库存/历史一致。

归Runtime/Ops独立bootstrap内部原子新增观察能力，不涉及持久化/外部合同迁移；仅新增标准库ipaddress/urllib.parse使用，无依赖清单变更、九helper导入、反向依赖或第二版本权威。已审阅无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。66个既有函数/类定义保持，仅原观察主体加可选分支、Docker白名单多一个固定network inspect；固定17+Manifest/250/300、九helper/三drop-in、私有四文件和公开pack/verify/plan保持。

新增20项离线模型测试，覆盖组合只读/摘要脱敏、$/$$准确一次比较与原件不变、坏Env/重复键/超额清单、每角色实际环境漂移、镜像默认与Compose覆盖、DB必填/本地URL/编码凭据、API-worker不一致/web上游、网络身份/额外端点/主机DNS或hosts/别名歧义、地址/前缀/gateway/IPv6/IPAM、保存ID/config/mount/image晚变、两次合法网络替换、原两锁和晚期维护、旧接口默认不查询/严格开关/无新CLI及固定网络读取白名单与失败。仅静态Python3.10 AST、全局名字/重复方法/unittest.run钩子/空白和差异/读回；项目测试待CI，不把725当本批测试通过。所有Docker/systemd/GitHub/SQL/HTTP/root为模型，未执行现场检查或安装。

下一步核当前镜像迁移库存与Git准确对象/数据库历史一致，并收口剩余有效配置和主机预检；之后进入安装意图/临时拒绝门禁。准确原ID停写、手动快照available及完整恢复实物、逐文件安装/交接、D3 Mac薄入口与D4统一真实隔离验收/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、DB写入或生产安装。

**2026-10-27 当前进度：D2_RUNTIME_PREREQUISITES_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增运行环境、固定就绪地址和绑定原DB容器ID的只读历史观察，沿原两锁与来源/文件/Docker/systemd/备份双读；不运行迁移、生成依赖或写安装意图。

备份/宿主目录批已由[PR #3014](https://github.com/sanqin888/sanqinMVP/pull/3014) 最终head `f44df660676c6586d9bfd0de04091f492bdf6ef5` 经 [CI #7715](https://github.com/sanqin888/sanqinMVP/actions/runs/40581035319) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各705、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `a7b461dd8594c8c4497dbc7bf510380b55bd99bc`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或真实隔离验收。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅runtimePrerequisitesObserved/databaseHistoryObserved/readinessEndpointsObserved=true及稳定摘要。databaseMigrationParityProven=false、systemPythonProvenanceAuthenticated=false；hostPreflightComplete/installedBaselineObserved/c4StorageObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven及backupRestoreProven仍false、requiresHostRecheck=true。历史完成和HTTP 200不证明当前镜像完整迁移库存与数据库准确一致，也不替代当前应用配置/数据库连接绑定、完整来源或安装意图。预检只读项仍待收口，不生成可复用批准记录/第二版本权威。

新增20项离线模型测试：原锁下组合无写同步/正文不输出/权限恒false、系统Python实现/版本/字段、DB名/端口/目录/版本/只读/恢复状态、失败/空/坏/超限历史、rolled-back和重复行摘要、六地址准确200/无跳转、SQL参数本地socket/清空环境/只读边界与保存ID、任意SQL/exec/URL拒绝、坏JSON/重复/非有限值、两次历史或Python变化、原两锁与晚期维护/来源、默认接口不读前置/严格开关/无CLI、临时内存输入的缺失/歧义/低值/预算与正常波动、固定Python隔离参数、共享真实pipe客户端不继承DB/Python/proxy环境及命令失败。Docker/systemd/GitHub/SQL/HTTP/Python/root/anchor为模型，未实际查询生产或运行项目测试；仅Python3.10 AST、静态名字/重复方法/unittest钩子、60个原定义不变及两处接线、差异/准确读回，不把前批705作为本批结果。

下一步对齐当前镜像迁移库存/历史、有效应用配置与DB连接绑定等剩余预检合同，完成只读主机预检收口后接安装意图/临时拒绝门禁。准确原ID停写、手动快照available与完整恢复实物、逐文件安装/成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、现场预检或生产操作。

详见[交付合同及D2运行前置](Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_BACKUP_FILESYSTEM_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增宿主固定目录、部署磁盘余量及最新本地DB备份的只读核对，沿原两锁和来源/源码/配置/Docker/systemd双读；不备份、恢复、复制业务数据或写安装意图。

systemd预检批已由[PR #3013](https://github.com/sanqin888/sanqinMVP/pull/3013) 最终head `359a1c22400a222f90facbe78480dee914c425ae` 经 [CI #7713](https://github.com/sanqin888/sanqinMVP/actions/runs/40578976996) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各685、Runtime1080、准确CPython3.12.15回归412），无本批CI修复，合并dev `fbbee891fba9820f31f3cf1d859d745286ee49f3`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或真实隔离验收。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增hostPersistentDirectoriesObserved/backupIntegrityObserved=true及filesystem摘要；backupRestoreProven=false，内部restoreProven=false。hostPreflightComplete/installedBaselineObserved/c4StorageObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。gzip完整和26h时效不等于SQL可恢复、全量VM恢复、DB业务一致性或AWS快照available；DB卷的Docker绑定观察不扩称宿主卷inode/全部C4证明。内存/系统Python与剩余就绪/DB只读前置尚未完成，观察结果不持久化成安装票据或第二版本权威。

新增20项离线模型测试：原两锁下组合只读/无写同步/秘密不输出、最新选择与坏最新不回退、旧/未来/缺备份、截断/坏CRC/空payload/尾部损坏、多gzip member完整摘要、压缩/展开/目录项预算、同名目录/FIFO/软硬链接、私有权限/只读/owner/gid、root/ubuntu/data目录权限与缺失/链接不修复、低磁盘、正常上传及余量波动不致误报、起始/块间monotonic耗尽、同字节备份替换/读中新清单、两次目录替换、原锁与晚期维护保留、默认路径不读数据/严格开关/无CLI及固定根元数据。临时真实文件/gzip/目录/锁，Docker/systemd/GitHub/root/anchor/容量为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法/unittest钩子、55个既有定义不变及唯一观察函数接线、差异/准确读回，不把前批685当本批通过。

下一步补本机运行环境/内存及剩余就绪与DB只读前置，完成主机预检收口后接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移或现场生产操作。

详见[交付合同及D2备份/目录预检](Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_SYSTEMD_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部systemd初次安装预检，沿原两锁、来源/源码/配置/Docker双读流程，核四个有效unit、未决reload/override和旧备份unit实物；没有安装/重载/停启服务或维护marker写入。

Docker/挂载批已由[PR #3012](https://github.com/sanqin888/sanqinMVP/pull/3012) 最终head `f20ede98945ae6ea2f740804f389d59410b7ac9c` 经 [CI #7711](https://github.com/sanqin888/sanqinMVP/actions/runs/40577327857) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各664、Runtime1080、准确CPython3.12.15回归412），合并dev `ca0507f522a6bb10f982f0e0e9746a6d902a62fc`。首次CI #7710因测试夹具run覆盖unittest.TestCase.run而中断；同分支仅将模拟方法及引用改名observe_command，生产代码/门禁未放宽。下文原LOCAL/未运行或修复待核仅为原审阅时点，仍未安装/真实隔离验收。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增systemdObserved=true及四unit稳定属性/摘要、两备份unit原件摘要和预留门禁不存在的事实；maintenanceGatesLoaded/backupIntegrityObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。vendorUnitBytesAuthenticated/backupTimerSourceAuthenticated=false：只观察加载路径/属性及本地timer实物，未扩展到OS来源研究或宣称timer有封存Git来源。尚未核备份gzip/时效、宿主挂载目录/资源及剩余就绪/DB项，不把unit空闲当成停写/快照或恢复就绪证明。

新增21项离线模型测试，使用临时真实root模型文件/目录及原锁，覆盖组合只读/无写同步、vendor路径别名和空闲timer、load/reload/masked/未知loaded drop-in、完整override、Docker稳定状态与socket触发目标、忙碌backup与timer错误、有效用户/组/UMask/Type/单一命令/hooks、属性重复/缺失/未知/预算、service旧归档字节匹配、缺失/链接/硬链接/权限、三预留或其他/类型级/前缀drop-in残件与可信空目录、悬空本地Docker override、同字节替换/两次有效状态漂移、原两锁跨度与晚期维护、默认路径不查询systemd、严格开关/读白名单/无新CLI、固定anchor走向/元数据及共享真实pipe客户端最小环境。systemd/Docker/GitHub/root/固定anchor为模型，未实际调用管理器或运行项目测试；仅Python3.10 AST、静态名字/重复方法/禁止覆盖unittest.run钩子、43个既有定义不变、root读取主体及有界客户端主体AST等价、差异/准确读回，不把前批664当本批通过。

下一步接备份完整性/26h时效、宿主uploads/sounds/backup目录实物与资源及剩余就绪/DB只读项；全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、现场预检或生产操作。

详见[交付合同及D2 systemd预检](Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_DOCKER_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部Docker/Compose只读观察，在原两锁与来源/源码/配置双读流程内，核当前四容器角色、健康和完整身份、实际应用镜像封存digest/OCI revision，以及DB卷和持久挂载。没有安装入口、维护意图或生产操作。

本批首次[CI #7710](https://github.com/sanqin888/sanqinMVP/actions/runs/40577015596) 在默认Python离线Release套件发现测试夹具将模拟Docker方法命名run，覆盖unittest.TestCase.run，套件于该类前中断。同分支仅将夹具方法及引用改为observe_command，生产代码/门禁不变；最终修复head与CI #7711/合并记录见上文；原待核仅为修复提交前时点，不把640或静态检查当本批通过。

配置原件核对批已由[PR #3011](https://github.com/sanqin888/sanqinMVP/pull/3011) 最终head `2c785b95396dfe88bff45840f8e3d95bb6f378b3` 经 [CI #7708](https://github.com/sanqin888/sanqinMVP/actions/runs/40575133829) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各640、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `12f3f840387229a22adf62035f486bcb63ae36e4`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或完成真实隔离验收。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅containersObserved/composeExpansionObserved/containerMountsObserved/currentImagePairBound=true并返回稳定观察/摘要；applicationConfigurationObserved/applicationReleaseAuthenticated/c4StorageObserved/systemdObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。当前镜像仅沿原paired seal绑定，不等于全套当前main/CI/就绪证明；未核容器环境与Compose美元插值完整等价，未核宿主路径实物/资源/备份/systemd/SQL历史或公共就绪。返回结果不是第二版本权威、恢复包、停写证明或安装票据。

新增24项离线模型测试，覆盖锁内组合及秘密不输出/无写同步、当前digest声明、engine/live-restore/swarm/platform、Compose必要环境/重复/SHA/角色与镜像、额外/缺失/短/重复ID、错role/project/ID、健康/运行/privileged、实际digest/revision/image平台、API/worker同image、命令/策略、挂载目标/源/RW/额外对象、卷选项/身份、忽略健康日志但比较lifetime、双读健康替换、原两锁与晚期维护/paired seal变化、重复/非有限JSON与预算、默认文件路径不读Docker/严格开关和无CLI；客户端用真实可丢弃pipe/selectors、Popen/clock/root模型核白名单、最小环境、端点拒绝、输出超限/错误/编码/超时与仅kill自身CLI组。Docker/GitHub及固定anchor为模型，没有运行真实Docker/systemd/SSH或测试项目；仅Python3.10 AST、静态名字/重复方法、40个原定义不变及原观察函数接线审阅、差异/准确读回，不把前批640计作本批通过。

下一步补systemd有效units/override和原三外部文件事实、备份完整性/新鲜度、宿主挂载目录与资源及剩余就绪/DB只读项，全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无新依赖包/业务schema/迁移或现场生产操作。

详见[交付合同及D2 Docker预检](Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_CONFIGURATION_FILES_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部配置原件只读观察：与原17源码核对共用原job/计划锁和来源前后复核，新增.env、唯一发布state及C4标记的原字节/元数据一致性检查。只返回摘要，不写安装意图、不安装或停服务。

现役Runtime源码核对批已由[PR #3010](https://github.com/sanqin888/sanqinMVP/pull/3010) 最终head `0824f2a0e14c956673903ae911f24a252b23de07` 经 [CI #7706](https://github.com/sanqin888/sanqinMVP/actions/runs/40573749428) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各620、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `b5bdddf4dba5fe0ee06ef781619c32b03d559093`。下文该批原LOCAL/未运行仅为原审阅时点，仍未现场安装或真实隔离验收。

配置与源码在同一原两锁内经来源刷新前后双读，原字节、inode、权限、账户身份变化均阻断，即使.env/state同时变成另一组相互一致值也不能沿用旧观察。结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅增加configurationFilesObserved=true及三个文件摘要/元数据、state中的应用SHA/phase；不返回原秘密、state正文或完整环境。applicationConfigurationObserved/composeExpansionObserved/applicationReleaseAuthenticated/c4StorageObserved/containersObserved/systemdObserved、installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven均false、requiresHostRecheck=true。C4标记内容正确不等于真实卷/目录已验证，观察结果不持久保存为安装许可/恢复包。

新增20项离线模型测试：三版本身份独立与秘密不输出/无写同步、原CRLF/$/$$不变、rolled-back与两种UTC、环境重复/别名/引用/坏编码、配置缺失及无修复、state未决/不一致/坏整数/原因/时间/缺字段/重复键、C4内容、私有权限/只读/特殊位、三文件链接/硬链接、ubuntu账户/owner/gid、空/超限、同字节替换及一致配置成组变化、读中秘密变化、原锁跨度与竞争、晚期来源/维护残件、默认源码观察不读配置、严格bool与无新CLI/任意路径。临时真实文件与锁，GitHub/账户/anchor/root为模型；项目测试未运行，仅Python3.10 AST、静态名字/重复方法、37个既有定义不变及唯一观察函数接线审阅、差异/准确读回核对，不把前批620用作本批结果。

下一步接真实Docker/Compose展开、容器完整ID/镜像/挂载、备份与systemd/本机环境的只读预检；全部前置完成后再写安装意图并加载临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离及生产材料仍OPEN。三组研究继续暂停、不取消；本批无依赖包/业务schema/迁移变更、实际主机预检或生产操作。

详见[交付合同及D2配置原件](Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_INSTALLED_RUNTIME_OBSERVATION_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部只读现役源码核对：持原job/计划锁，刷新保留材料的来源与工具差异，逐字节核现役17+Manifest并重读身份。仅首次工具安装基线，已有九辅助件或Runtime目录内bootstrap（含悬空链接）要求另审，不覆盖；尚无主机安装或root CLI。

D2私有材料交接批已由[PR #3009](https://github.com/sanqin888/sanqinMVP/pull/3009) 最终head `078306e9e0dda594d283ee133129027c5832f4c8` 经 [CI #7704](https://github.com/sanqin888/sanqinMVP/actions/runs/40570561979) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各600、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `6f2378f23bfb80192f8f4f965daefccee98f8d4d`。下文原LOCAL/未运行仅为该批原审阅时点；源码CI不代表安装或真实隔离验收。

结果仅INSTALLED_RUNTIME_FILES_OBSERVED、installedRuntimeFilesObserved=true；installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。旧Runtime sourceSha独立于当前应用SHA；不读取.env/唯一state/C4、不观察Docker/DB/挂载/备份/systemd或宣布无override。三drop-in原件/缺失事实仍待系统预检，九辅助件不存在只是初次安装冲突检查，不能充作完整恢复包或安装票据。函数只返回摘要/元数据，不保存或清理记录，不新建目录、不fsync、不停服务。

新增20项离线模型测试，临时真实文件/目录/锁覆盖旧17逐项变更、目标字节冒充旧字节、Manifest错值/布尔/重复键及原排版、缺失/超限/空文件、目录/文件/悬空链接和硬链接、权限/owner/gid/root、已有辅助件/安装器冲突、同字节换inode/读中改写/目录换位、晚期来源/保留原件/维护/job变化、两原锁覆盖及竞争、缺失身份不建目录、无写入/同步和无CLI。GitHub/root身份与固定anchor为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法、原函数等价及差异/读回核对，不将前批600用作本批结果。

下一步补.env/唯一state/C4、实际容器完整ID/镜像/挂载/备份及systemd/本机运行环境预检，全部前置满足后才接安装意图/临时拒绝门禁；后续准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离和生产材料仍OPEN。三组研究继续暂停、不取消；无依赖/业务schema/迁移、现场预检或生产操作。

详见[交付合同与当前D2进展](Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_PRIVATE_MATERIALS_MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**独立installer新增内部root私有材料交接与只读观察：复制前后重新核D1来源/工具差异，在固定状态树持原job/计划锁，create-only保存材料包、旧Runtime原归档及准确保留记录，逐文件同步/读回。无root交接CLI、主机安装入口、维护marker或units变更。

D1材料与只读核验批已由[PR #3008](https://github.com/sanqin888/sanqinMVP/pull/3008) 最终head `3bef681194eaa49868eb20bc6190af25fbf9d973` 经 [CI #7702](https://github.com/sanqin888/sanqinMVP/actions/runs/40566184983) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各574、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `40aaf51b17eb738266990a9b8e5e230448164e90`。原LOCAL/未运行是原审阅时点；仍未安装/真实隔离验收。

新增26项模型测试未运行，仅静态与差异核对。材料私有保留不观察现役版本、不建立维护或授予安装许可；hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute均false，普通任务/原目录记录和D1 CLI保持。本批仅D2第一段私有材料交接，不代表D2安装器完成。下一步在独立bootstrap内接现役主机只读预检，再接安装意图/临时拒绝门禁、准确原ID停写/手动快照available、旧工具恢复实物及逐文件安装/成功交接；D3 Mac薄入口、D4统一真实隔离与生产材料仍OPEN。无依赖/业务schema/迁移或生产操作；三组研究继续暂停、不取消。 详见[交付合同及D2](../architecture/Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / HOST_INSTALL_NOT_IMPLEMENTED / NOT_INSTALLED。**新增独立交付工具ops/release/install_minimal_executor.py，仅pack/verify/plan。复用原17归档封存、准确main/CI/发布及固定Git对象，惰性材料含原归档、17+9+bootstrap共27份源码和三固定模板；重新核验来源后只输出材料/差异观察，所有安装/执行权限标志false。

交付合同已由[PR #3007](https://github.com/sanqin888/sanqinMVP/pull/3007) 最终head `5a703b4b4a309731f68a913ef42a271049eadd85` 经 [CI #7700](https://github.com/sanqin888/sanqinMVP/actions/runs/40562348239) SUCCESS（仅ci-change-scope成功，其余9作业按文档范围跳过；无Release/Runtime测试重跑），无CI修复，合并dev `43d270d0e6d290a95eaa2732918edcbec040c906`。文档合并不代表installer或生产验证完成。

新增30项离线模型测试未运行，仅静态与差异审阅；pack是非root/create-only的材料输出，verify/plan不加载目标源码、不观察生产主机，不授予安装或续跑许可。D1本地源码尚未远端交付；D2主机安装、独立bootstrap root落地/临时门禁/恢复材料/逐文件交接、D3 Mac薄入口、D4统一真实隔离验收及生产材料仍OPEN。当前打包器来自操作者独立审阅的bootstrap，材料包不能认证正在运行的验证器自身；后续root阶段必须重新验真，不能提权运行用户staging。17+Manifest、250/300旧guard、九常规helper/三永久drop-in数量保持，无新依赖/业务schema/迁移或生产操作，三组研究继续暂停、不取消。 详见[工具交付合同及D1](../architecture/Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：CONTRACT_MERGED_DEV / SOURCE_AUDITED / INSTALLER_NOT_IMPLEMENTED / NOT_INSTALLED。**完成原17+Manifest、九辅助件、三drop-in、状态目录和现有staging/历史来源/备份材料的源码核对，新增[工具交付与安装合同](Runtime最小执行器工具交付与安装合同.md)。本批仅文档，不修改Bundle/schema/权限/guard或生产文件。

回退异步任务批已由[PR #3006](https://github.com/sanqin888/sanqinMVP/pull/3006) 最终head `69950aa86bc35587ef86979a6e32a74ad33ba8de` 经 [CI #7698](https://github.com/sanqin888/sanqinMVP/actions/runs/40558256262) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各544、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `d1768dbd5af4375467d6e998dd7e031665b6f306`。原LOCAL/未运行是原审阅时点；仍未安装/真实隔离验收。

交付采用原已封存17归档加同准确main SHA的固定Git对象/模板，保留独立bootstrap审阅与root私有重验；transport清单不自证来源，不新设发布workflow/seal或版本权威。九辅助件和永久三drop-in独立交付，现有stage_bundle/plan_versioned_install不充当安装器，现有配置备份不能代替完整工具恢复实物。正式工具写入前拟先加载不依赖目标Python的临时拒绝门禁，逐文件替换后再转永久guard；该门禁、安装marker/记录、kit与installer均尚未实现。

下一步D1仅实现惰性材料与只读核验/计划；随后D2受限安装、D3 Mac薄入口、D4统一真实隔离验收和生产材料，均沿原第三批范围。本批未运行项目测试，仅源码/路径/清单及文档差异核对；未测现场Python/Compose/systemd/Prisma/故障恢复，未选择生产main SHA/归档/快照。无新helper/依赖/业务schema/迁移、owner/SCC/债务/scanner基线变化，未重跑scanner；17+Manifest/250/300保持，三组研究继续暂停、不取消。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原release_task新增submit-rollback与status-rollback，复用同一systemd任务、两锁、整体预算及原阶段主体。独立准确兼容摘要绑定run和StopPost参数；子任务缓存重采集后执行回退freeze/create/start/finalize，提交唯一rolled-back并最后清标记。无SQL容器/反向SQL、外层异常改写、自动重放或恢复。

回退交接批已由[PR #3005](https://github.com/sanqin888/sanqinMVP/pull/3005) 最终head `cfd05ec939d653f2bfd8fceee94d5718fdafdfed` 经 [CI #7696](https://github.com/sanqin888/sanqinMVP/actions/runs/40556088534) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各514、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `678d50dde7e7295da05c3e2857d8f019ff7d553a`。原LOCAL/未运行为原审阅时点；仍未安装/隔离验收。

新增30项模型测试未运行，仅静态与差异审阅。check-rollback仍业务只读、不排队；executionImplemented=true只指源码主线已接，executionRequested/canExecute/数据库兼容与事故恢复证明仍false。本批源码接齐受控回退异步主线，但尚未统一交付/安装或真实验收。下一步核对九helper/三drop-in与固定17+Manifest正式Bundle过渡的准确交付合同，再完成Mac薄入口及真实隔离的Compose美元往返、Docker/Prisma/PID1、SSH断开/SIGKILL、socket/daemon/reboot、故障/恢复/连续双发布验收。查询、SUBMITTED、COMMITTED或标记消失不是未知/事故续跑许可；旧程序可能已写数据，不能反向SQL或直接恢复旧盘。三组研究继续暂停、不取消；无依赖/业务schema/迁移文件及生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原finalizer新增内部finalize_rollback_ready，以独立准确兼容确认、原typed回退计划及同一v6/READY尝试复用原成功交接主体。先持久FINALIZING，再仅替换.env中的SHA、核目标配置/readiness和完整SQL历史，提交唯一rolled-back/rollback-verified；同步读回后只对保存三ID恢复原restart策略，重核后持久HANDOFF_COMMITTED并最后清标记。未知结果保留实际state/.env/维护证据，不重写PENDING或自动重放。

回退启动批已由[PR #3004](https://github.com/sanqin888/sanqinMVP/pull/3004) 最终head `604865cabea9ffcc009edbbcc32ae7d2fd56dbc9` 经 [CI #7694](https://github.com/sanqin888/sanqinMVP/actions/runs/40549990852) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各484、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `c0fad842056f46d644a6075840ebefa203bcbae7`。原LOCAL/未运行描述保留为原审阅时点；仍未安装/隔离验收。

新增30项模型测试未运行，仅静态与差异审阅；真实Docker/Prisma/Compose美元往返、SSH/SIGKILL/socket/daemon/reboot及安装/生产行为仍待隔离验收。内部函数只能供后续同一受控任务在前一阶段已知成功后调用，不能在现役VM调用未安装源码或依据查询快照续跑。本批仅完成内部回退成功交接；尚无异步回退submit/run/StopPost与状态接线或可执行回退CLI，check-rollback仍仅观察。下一步将回退各阶段接入原受控异步任务，保留独立兼容确认及未知结果阻断，再完成九helper/三drop-in统一交付、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收。READY/COMMITTED或标记消失均不是未知/事故续跑或旧盘恢复许可，旧程序可能已写业务数据，不能反向SQL。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件及生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原starter新增内部start_rollback_and_verify，持原job/计划锁及维护目录FD，核同一v6已登记尝试、typed回退计划、独立准确兼容确认、历史目标proof、唯一PENDING/旧.env配置/运行合同/备份/实际三ID和挂载。复用原启动/健康/固定readiness及失败收尾主体；先持久STARTING_CANDIDATES，再仅start保存三ID，重核后写CANDIDATES_READY，仍保留PENDING、维护与restart=no，不改.env/提交rolled-back或清标记。

回退创建批已由[PR #3003](https://github.com/sanqin888/sanqinMVP/pull/3003) 最终head `6bce17db6e5128ee792770b4a39b5a3db455f426` 经 [CI #7692](https://github.com/sanqin888/sanqinMVP/actions/runs/40546110736) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各461、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `7ee8c0a2b9648ca30e2a6f7b581ad67c29bd3e03`。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

本批仍无可执行回退CLI/任务：内部start_rollback_and_verify只供后续同一受控任务在前一阶段已知成功后接续，不能在现役VM调用未安装源码或按观察到的REGISTERED/READY重试。新增23项模型测试未运行，仅静态与差异审阅；真实Docker/HTTP/Compose/PID1行为仍待隔离验收。本批仅完成内部回退启动与READY，尚无回退成功交接、唯一rolled-back提交、原策略恢复/最终清标记、异步submit/run/StopPost及状态接线；check-rollback仍仅观察，原前向任务不能采用回退kind。查询到READY不是从未知/事故续跑或重放的许可，旧应用启动可能写业务数据，不能据失败恢复旧盘或反向SQL。下一步接同一原计划/兼容确认/维护证据下的成功交接，再完成异步任务、九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原guard新增内部prepare_rollback_candidate_containers，持原job/计划锁与维护目录FD，以原typed回退计划、独立兼容确认及同一v5/FROZEN尝试进入，共用原三服务create/register主体。重核当前完整SQL/history、准确历史目标proof、缓存旧API SQL/source和运行基线；先保留rollback scope升级v6/CREATING_CANDIDATES，再写唯一PENDING、固定--no-build/--pull never创建和登记完整三ID/image ID，不start或执行SQL。登记结束仍保留维护、PENDING和旧.env，数据库历史不删减。

回退停写批已由[PR #3002](https://github.com/sanqin888/sanqinMVP/pull/3002) 最终head `c219a2d8d319ffc8d84a3e1df5a573b99e6f8d77` 经 [CI #7690](https://github.com/sanqin888/sanqinMVP/actions/runs/40541893634) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各438、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `45220d9a0ddacf8be6d108badea3025298e8bf16`。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

Compose导出值边界已更正：已查Docker Compose的config实现会对已插值导出内容统一将$写为$$；应用创建配置原样保留该导出值，本批撤回“再转义一次”的临时改动。迁移creation_config原先额外replace会把已转义URL再次转义，本批移除该重复层，并将旧迁移测试夹具改为实际导出形态及原样保留断言。字面$需要Compose转义的原则仍成立，但应只在正确的输入边界执行一次；此前迁移美元测试只验证替身输入，不能作为真实往返证明。目标现场Compose版本的config→私有stdin→容器环境精确往返仍待隔离验收，不据上游源码或离线字符串断言宣布已通过。

新阶段无可执行CLI或任务接线；check-rollback仍只做业务只读复核。新增23项离线模型测试未运行，现役VM不能直接调用未安装源码。本批仅完成内部回退创建与登记，v6只允许CREATING_CANDIDATES/CANDIDATES_REGISTERED/INCIDENT；没有回退启动/readiness、唯一rolled-back成功交接、恢复原策略/清标记或异步提交/执行接线。部分创建和未知结果保持真实PENDING/维护证据，不自动采用发现的ID、重放、反向SQL或旧盘恢复；创建成功也不代表数据库/业务兼容已证明。下一步接准确已登记旧容器的启动与就绪，再接成功交接及异步任务。统一九helper/三drop-in、固定17+Manifest正式Bundle过渡、Mac薄入口和真实隔离故障/恢复/连续双发布验收仍OPEN；三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原guard增加内部freeze_rollback_for_plan及锁内主体，持原job/计划锁和维护目录FD，核typed原件、独立准确兼容确认、缓存镜像现场重采集、时间/来源与实际三writer，再与普通更新共用同一arm/停写主体。新增未安装v5维护记录保存准确目标proof与确认摘要；先持久ARMED和原ID/image/restart策略，再仅对保存ID设restart=no并stop，重核后FROZEN。当前应用可已退出或不健康，未知/替换/额外对象仍阻断；不改唯一state/.env或执行SQL。

回退复核批已由[PR #3001](https://github.com/sanqin888/sanqinMVP/pull/3001) 最终head `ed3ee4af58f827fa10d3940d581915135dcea0d5` 经 [CI #7688](https://github.com/sanqin888/sanqinMVP/actions/runs/40538401235) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各417、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `07ba60c8b470c53a8eb30fb365741056f261b48a`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

本批没有新可执行CLI：check-rollback仍为只读业务预检，内部freeze_rollback_for_plan只供后续受控任务接线；不能在现役VM按此文档调用未安装源码。新增21项离线模型测试未运行，仅静态与原共享主体等价审阅。初始ARMED未知不改策略，后续失败保留维护证据，最终FROZEN未知不重写或重放。本批仅完成内部回退停写阶段，尚无回退任务提交、旧镜像create/register/start/readiness、唯一rolled-back交接或清标记；v5当前仅接受ARMED/FROZEN/INCIDENT，旧前向/SQL路径不能采用它。check-rollback仍只观察，不触发新停写函数；不从持久FROZEN推导重试/续跑许可，不自动恢复策略/服务、反向SQL或旧盘。下一步在同一原计划/兼容确认/维护记录下接回退候选创建与登记、启动就绪和成功交接，再接异步任务；统一九helper/三drop-in、固定17+Manifest正式Bundle过渡、Mac薄入口及真实隔离故障/恢复/连续双发布验收仍OPEN。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件或生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原plan新增独立准确兼容确认及新旧现场审阅原件比对，collector新增show-rollback-sql，只展示当前数据库比旧镜像多出的已应用SQL。原task新增check-rollback <plan-id> --approve-compatibility <准确摘要>：持原job锁和计划锁，禁止未完结job/维护记录，缓存模式重新采集两镜像/两份SQL来源/现场基线，结束前重读原计划与门禁；只返回BASELINE_RECHECKED，不能排队或执行回退。canExecute/databaseCompatibilityProven/incidentRecoveryAuthorized始终false，executionImplemented=false。

回退采集批已由[PR #3000](https://github.com/sanqin888/sanqinMVP/pull/3000) 最终head `ee12e4f1bb69c4cdee31e97ae7e6b1763bc0fd85` 经 [CI #7686](https://github.com/sanqin888/sanqinMVP/actions/runs/40532730955) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各399、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `05c65d07f2ee059cdaf012378075e34f021ec747`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

未安装接口的审阅顺序：prepare-rollback --save准备准确previous计划；show-rollback-sql <plan-id>核额外已应用SQL原文及当前commit，结合代码/数据语义完成兼容审阅；check-rollback <plan-id> --approve-compatibility <show-rollback摘要>只做缓存镜像现场复核。此命令不提交任务或恢复业务，结果不是长期许可；日常前向更新流程不增加这些回退专用操作。新增18项模型测试未运行，仅静态审阅；真实Docker/SQL/Compose/PID1与SSH/故障恢复仍待隔离验收。

本批未接回退停写、对象创建/启动、唯一rolled-back提交与清标记，也无异步回退任务或事故恢复入口。复核结果不保存批准文件/新job，不是可重用执行票据；未来执行仍须在同一锁内重核并保留原计划与数据库真实历史，不可伪装前向计划、执行反向SQL或调用旧rollback --execute。下一步接原维护主线的受控回退阶段，再完成九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口及真实隔离故障/恢复/连续双发布验收。三组研究继续暂停、不取消；无依赖/业务schema/迁移文件、生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：MERGED_DEV / SOURCE_CI_VERIFIED / NOT_INSTALLED。**原collector新增prepare-rollback [--save] [--cached-only]和show-rollback <plan-id>，只从唯一state的previous确定目标，不接受任意SHA。重核17+Manifest/配置/state原字节、准确历史proof/两运行文件、当前与目标实际digest及各自API SQL/Git树、当前history/DB身份/真实挂载/备份；结束前重读关键基线，任一变化阻断。当前应用可不健康/已退出，但对象身份/镜像/挂载仍须证明，DB必须运行且是原固定卷；维护记录/PENDING仍拒绝。只输出兼容审阅摘要，canExecute保持false。

回退审阅批已由[PR #2999](https://github.com/sanqin888/sanqinMVP/pull/2999) 最终head `ca5993f258faafe7cbca85429ab7768073ef1753` 经 [CI #7684](https://github.com/sanqin888/sanqinMVP/actions/runs/40527848453) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各382、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `17416da3333a34dc19defcbefcfc4a6f242f56e5`。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

本批仍无回退确认/提交/执行、自动恢复/反向SQL或旧rollback --execute调用；事故state/维护证据不得借prepare-rollback绕过，查询计划不是准许重放。下一步独立准确兼容确认及回退任务接线，再完成九helper/三drop-in统一验真、固定17+Manifest正式Bundle过渡、Mac薄入口与真实隔离故障/恢复/连续更新验收。release_contract/controller等受保护源改动不能直接覆盖现役文件或手改hash，250/300旧guard保持；三组研究继续暂停、不取消，无业务schema/迁移文件/依赖/生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：ROLLBACK_REVIEW_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**在原release_contract/plan内补受控回退审阅门禁，无新helper或执行入口。准确历史目标校验复用seal/目标最新main CI/publication与同一祖先检查，要求目标是current的主线祖先，不发现latest，也不以当前应用健康或当前CI重跑失败替代历史目标证明。纯审阅计划绑定唯一发布state原始字节/哈希、current与准确previous、备份/环境/运行合同、当前完整SQL/history及旧镜像SQL清单；列明额外已应用迁移，兼容批准摘要仅绑定本次审阅范围，canExecute与databaseCompatibilityProven始终false。

完整SQL任务批已由[PR #2998](https://github.com/sanqin888/sanqinMVP/pull/2998) 最终head `af11fd4d3374ef180c5fbdc9f8d5e55abc6c7344` 经 [CI #7682](https://github.com/sanqin888/sanqinMVP/actions/runs/40526376795) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各365、Runtime1080、准确CPython3.12.15回归412），合并dev `2d1aed320f59716ee233d7f5f79b37dd80a57095`。首次CI #7681发现测试重复保存原不可变计划、停止顺序断言包含freeze命令，仅af11fd4d修正夹具时间及收尾停止后缀；生产逻辑/拒绝覆盖门禁不变。其原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

本批未新增回退collector/计划保存/CLI/提交、确认或应用切换，不调用旧rollback --execute，不处理PENDING/INCIDENT恢复，不执行SQL/down migration、旧盘恢复或清维护标记。下一步将实际state/旧镜像与当前SQL/source树/runtime/DB/备份采集、保存与准确兼容确认接入同一受控回退主线，再统一安装/Mac入口及真实隔离故障/恢复/连续更新验收。九helper/三drop-in数量不变；本批release_contract.py属于固定17成员，后续必须随controller等变更走正式17+Manifest Bundle验真过渡，不能仅投递辅助件、手改hash或覆盖现役文件。三组研究继续暂停、不取消，无业务schema/迁移文件/依赖/生产Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：SQL_TASK_CONNECTED_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**同一release_task的submit/run/cleanup接收独立准确--approve-sql摘要；提交与停写前都用原计划校验，pending SQL缺失/错摘要、布尔或无迁移却附批准均拒绝。管理器ExecStart/ExecStopPost同时绑定planId与批准参数，PID/cgroup/固定unit校验保持。run持同一job锁/计划锁/维护目录FD完成freeze→迁移create/register→start/wait/history→原应用交接，仅前一阶段调用已知成功才继续；无新批准文件、发布状态或helper。

迁移后应用交接批已由[PR #2997](https://github.com/sanqin888/sanqinMVP/pull/2997) 最终head `96d6a3221d6742a6dda0ee9fbe1a8872ec870ffd` 经 [CI #7679](https://github.com/sanqin888/sanqinMVP/actions/runs/40523115618) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各347、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `3cb66317b49a2cdfdd8e97e6a9b21210369e4035`。其LOCAL/未运行记录是原审阅时点，仍未安装/隔离验收。

本批只完成完整SQL任务源码接线，不宣称第二批或最小执行器交付完成。下一步复审并补齐受控兼容镜像回退、统一验真打包/安装与Mac薄入口、实际系统Python/Compose/systemd及依赖验证；统一真实隔离采集、连续双发布、SSH断线/SIGKILL/socket/daemon/VM重启、工具交付中断及恢复演练后，才能申请生产过渡与准确main发布。九helper/三drop-in需统一版本交付，原controller源码仍须正式17+Manifest Bundle过渡；不覆盖现役文件、不手改hash或放宽250/300旧guard。三组研究继续暂停、不取消，无依赖/业务schema/迁移文件/生产目录、Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：POST_MIGRATION_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**同一task新增内部handoff_migrated_release，持原job/计划锁和维护目录FD，独立核同一SQL批准后，复用原create/register→start/readiness→finalize锁内主体。原计划字节/planId不变；迁移后history按原历史+准确批准pending的applied差量验证，不清空pending或伪造无迁移计划。v3/MIGRATION_VERIFIED仅可前进到保留migration与candidate两组准确对象的v4创建意图；后续原阶段/唯一ACTIVE/准确restart策略/最终清标记继续使用同一实现，迁移容器保持退出、restart=no且不删除。

迁移执行批已由[PR #2996](https://github.com/sanqin888/sanqinMVP/pull/2996) 最终head `9da4771dbc7f7f2768b9d8a932471ab1a218ce5b` 经 [CI #7677](https://github.com/sanqin888/sanqinMVP/actions/runs/40514962099) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各331、Runtime1080、准确CPython3.12.15回归412），合并dev `e013287898a88dba7af375f9dc96279055b8f550`。首次CI #7676发现持久转换表遗漏新阶段，修复提交9da4771d仅补REGISTERED→STARTING_MIGRATION→MIGRATION_VERIFIED与事故转换，保留原不可变字段检查；不是放宽门禁。原LOCAL/未运行是原审阅时点，仍未安装/隔离验收。

尚未把SQL批准/冻结/迁移创建/执行/本次交接串入同一systemd提交主线，原submit/run继续拒绝pending SQL，本内部函数没有CLI。必须仅在前一迁移执行调用已知成功的同一任务中使用；读取到VERIFIED记录不是从持久结果未知/事故恢复或续跑的许可。下一步统一SQL任务参数、阶段间锁及整体超时/StopPost，再补受控回退、固定交付/安装与Mac入口、真实隔离故障/连续双发布/恢复和生产过渡。九helper件数与17+Manifest/250/300旧guard不变，原controller正式Bundle交付仍待完成。三组研究暂停、不取消；无依赖/业务schema/迁移文件/生产目录、Docker/systemd/SQL/AWS操作。

**2026-10-27 当前进度：MIGRATION_EXECUTE_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**同一task新增内部execute_registered_migration及锁内主体，原job/计划锁和维护目录FD贯穿批准/时效、唯一PENDING与旧.env、Manifest/运行合同/展开配置、DB/history/备份/准确来源/缓存API digest与SQL inventory重核。只从同一v3/MIGRATION_REGISTERED进入；先耐久STARTING_MIGRATION再start已保存ID并wait，阶段monotonic预算900s（含重核与等待，start至多30s）。wait返回0还须确认同一对象exited/ExitCode=0、无OOM/Dead/Error/重启，以及数据库历史准确增加本计划有序pending对应的applied行、保留原历史含rolled-back行与重复数量，无额外SQL或失败项。复核完成写MIGRATION_VERIFIED，仍保留PENDING/维护标记/原策略禁止重启；不是ACTIVE或恢复许可。

迁移只创建批已由[PR #2995](https://github.com/sanqin888/sanqinMVP/pull/2995) 最终head `b22b4ba0ad66d1eed2f798c02504048d5686e9a6` 经 [CI #7674](https://github.com/sanqin888/sanqinMVP/actions/runs/40512651573) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各315、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `49e1d65705119386b21c79c144bdf30d8c078ed8`。提交前修正Compose美元转义实现为两个美元符号，原回归用例随本head通过。其原LOCAL/未运行描述是原审阅时点，仍未安装/隔离验收。

本批未接submit/run的SQL批准参数或完整异步SQL主线；原CLI仍拒绝pending SQL。后续须在同一批准/维护证据下接迁移后的应用create/start/finalize（实际history已变化，不能伪造原计划或删除SQL拒绝条件），再补受控回退、统一安装/Mac入口、真实隔离中断/恢复与连续双发布验收。九helper件数不变，无新执行器/批准数据库/current权威；17+Manifest/250/300旧guard保持，原controller正式Bundle交付仍待完成。业务schema/迁移/依赖/生产目录和unit不变；三组研究暂停、不取消，未执行生产Docker/systemd/SQL/AWS。

**2026-10-27 当前进度：MIGRATION_CREATE_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原task新增内部prepare_migration_container，持原job/计划锁和维护目录FD贯穿重核、迁移意图、唯一PENDING、只创建、DB/history复核和准确ID登记。锁内重核准确SQL批准、计划时效/原配置/Manifest/运行合同、历史/备份/候选证明/缓存API digest及镜像SQL清单；配置只含一个迁移服务与已有external网络，DATABASE_URL通过原有界私有stdin传入并转义Compose美元符号，不转发JWT等API秘密。固定create --no-build --pull never、180s，不start/SQL/ACTIVE/改.env；未知保留意图/PENDING且禁止重跑。 迁移登记批已由[PR #2994](https://github.com/sanqin888/sanqinMVP/pull/2994) 最终head `531d95036dc55d735ae8a92598cabeaf8b88d1ab` 经 [CI #7672](https://github.com/sanqin888/sanqinMVP/actions/runs/40507815863) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各306、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `0224e0eb7bfba9b762d5098a0da673fa63d81eb2`。原本地未运行/未提交仅为原审阅时点；仍未安装/隔离验收。

**2026-10-27 当前进度：MIGRATION_REGISTRATION_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原guard新增内部begin_migration_creation/register_created_migration，无CLI或任务调用。原FROZEN计划/attempt及独立SQL批准匹配、原writer已停/门禁/备份状态核验后，先将同一维护标记升级v3/MIGRATION_CREATING，容器身份暂空；只允许登记created、restart=no、非auto-remove、无挂载/非privileged、固定网络/名称/命令、准确计划标签/API digest与实际image ID/revision的平台对象。登记后MIGRATION_REGISTERED，不start或执行SQL。事故收尾先处理登记迁移ID再处理原writer；空身份/缺失/额外对象保持FENCE_UNCONFIRMED，不猜ID、不重放或清标记。 SQL审阅批已由[PR #2993](https://github.com/sanqin888/sanqinMVP/pull/2993) 最终head `2d76d1da35ee98bee6183961816622e837a7ac6e` 经 [CI #7670](https://github.com/sanqin888/sanqinMVP/actions/runs/40504787295) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各297、Runtime1080、准确CPython3.12.15回归412），合并dev `afbd7c515e15603d5eff8b588c4f27561a98a578`。首次CI #7669因GitHub blob测试替身未接受token关键字导致CLI成功用例失败，仅补**kwargs后通过，生产逻辑/门禁不变。原LOCAL/未运行是原审阅时点，不等于已安装/隔离验收。

**2026-10-27 当前进度：SQL_REVIEW_BINDING_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**在原plan/collector补准确待执行SQL审阅与批准范围绑定，不新增helper、批准数据库或版本权威。plan.sql_review给出planId/目标/API digest/有序原始SQL元数据及域分离approvalSha256；assert_sql_approval只核独立传入的准确摘要，缺失/布尔/planId/错摘要拒绝，无pending只接受None。原prepare/show摘要新增sqlReview，show-sql按计划gitBlobSha读取固定SanQ GitHub blob，核size/base64/原字节SHA-256和Git blob SHA-1后展示UTF-8原文与准确commit来源；所有SQL核完且完整JSON不超过4MiB才输出。canExecute/sqlSafetyAssessed始终false，摘要不是授权凭证/安全判定，不写批准文件或执行SQL。 无迁移任务贯通已由[PR #2992](https://github.com/sanqin888/sanqinMVP/pull/2992) 最终head `1f9b424056db494930edfa73f7ed950ba70b4607` 经 [CI #7667](https://github.com/sanqin888/sanqinMVP/actions/runs/40501959449) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各284、Runtime1080、准确CPython3.12.15回归412），合并dev `73a8a162325e1dfcba10515541a00837ed8a9937`。首次CI #7666中SQL拒绝测试重复保存原fixture计划而报错，仅把该测试createdAt改成独立时间戳，同分支追加 `1f9b4240` 修复；生产逻辑/门禁未改。原本地未运行/未提交为审阅时点，不代表隔离或生产已通过。

**2026-10-27 当前进度：NO_SQL_TASK_CONNECTED_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原release_task已接入同一无迁移计划的freeze→create/register→start/readiness→finalize；同一job锁/计划资源锁/维护目录FD贯穿阶段交接，四阶段主体提取为原入口与任务共同使用的内部函数，AST对照确认主体逻辑不变，不复制第二套发布器。执行/排队前拒绝pending SQL和目标等于当前版本；CLI提交确认改为--confirm-release，原--confirm-maintenance不再接受，unit前缀改为sanq-release-apply-，无已安装消费者。仅最终原finalize清标记已知完成返回ACTIVE；保留未知/事故语义。 连续更新修正已由[PR #2991](https://github.com/sanqin888/sanqinMVP/pull/2991) 最终head `f37426a7088be8ff7e189d0995617be5281012ce` 经 [CI #7664](https://github.com/sanqin888/sanqinMVP/actions/runs/40498211632) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各271、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `15fcbdcf1af0adbd32f48875e76073a918c89523`。此前本地未运行/未推送为原审阅时点；仍未安装/隔离验收。

**2026-10-27 当前进度：CONSECUTIVE_UPDATE_FIX_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**修正首次digest候选成功交接后，下一次维护仍只识别SHA标签的问题。原guard._inspect保留固定仓库/角色/完整ID及显式候选引用的精确检查；旧writer若声明digest，逐次以实际image ID核linux/amd64、RepoDigests和目标revision。入维护前再与准确已封存release的SHA标签或digest二选一对齐；后续停写/登记/启动/交接/事故收尾通过同一检查并核原保存image ID，无新marker字段、发布权威或恢复入口。新增7项离线测试方法未运行，其中一项从真实阶段代码完成第一次交接，再对同一digest容器进入下一计划的freeze与创建意图；Docker/采集/GitHub为替身，尚未完成真实连续两次发布验收。 联合状态批已由[PR #2990](https://github.com/sanqin888/sanqinMVP/pull/2990) 最终head `9737d0e338719cfbbb1017c2c3fc93615ddd6f87` 经 [CI #7662](https://github.com/sanqin888/sanqinMVP/actions/runs/40443398580) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各264、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `efc0afebe595a760471f561012ae320e431da913`。其原LOCAL/未运行为审阅时点，仍未安装或现场验收。

**2026-10-26 当前进度：JOINT_STATUS_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**成功交接已由PR #2989 / CI #7660合并dev `3391cf495dd9bbb4d56d2ae46648d75c6e2f44b1`。本批在原release_task.status内增加联合只读观察：同一job/计划锁内读取原计划、唯一发布状态与维护记录；有维护记录即保留未完结语义，无marker且准确目标ACTIVE才核安装合同、环境/状态一致、实际三writer/image digest/健康/角色列表/bind及DB，并重读关键观察拒绝漂移。返回TARGET_RUNNING_OBSERVED也固定operationSuccessProven=false/canExecute=false；它不是clear耐久回执、原策略恢复证明、最新GitHub证明、SQL兼容证明或重试/恢复许可。无新helper、常驻服务、发布状态、包依赖/业务迁移或生产操作；三组研究继续暂停。

> **2026-10-26（America/Toronto）｜优先级文档已由 PR #2978 / CI #7633 合并；MERGED_DEV / MINIMAL_EXECUTOR_SUCCESS_HANDOFF_LOCAL / PRODUCTION_NOT_AUTHORIZED。** 基线 `origin/dev@29004f5b277803b7b4ff597b4456d4b748e4f6f4`（已包含 C1 F4-B13 / PR #2977）。本文件是当前实施顺序、暂停范围与恢复条件的权威入口；不把文档批准等同源码实施、生产安装、数据库或 AWS 操作授权。

## 1. 当前目标与适用范围

**2026-10-26 当前实现：SUCCESS_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**前批由[PR #2988](https://github.com/sanqin888/sanqinMVP/pull/2988) 最终head `6ca86a55d1aadef814f37d97d9f999212f55608f` 经 [CI #7658](https://github.com/sanqin888/sanqinMVP/actions/runs/40427556642) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各234、Runtime1080、准确CPython3.12.15回归412），合并dev `d87c98b50582fc2ff58165921926433d4710776b`；CI #7657只补缺COMPOSE测试路径后通过。本批新增READY成功交接内部阶段：锁内重核、先持久FINALIZING、只改.env SHA并保留原字节/owner/mode、目标就绪、唯一ACTIVE耐久读回、恢复准确原策略并核验、HANDOFF_COMMITTED后最后清marker。中途失败保留实际版本及INCIDENT；末尾clear未知不伪造冻结或重跑。新增21项离线方法未运行，八helper待统一验真安装，见[顺序/终结未知与缺口](Runtime最小更新执行器实现方案.md)。异步贯通/联合status、准确SQL、隔离/安装与真实发布仍OPEN；本地待审未推送，无生产操作，三组研究暂停保留。

**交付与当前下一步：**[PR #2978](https://github.com/sanqin888/sanqinMVP/pull/2978) 最终 head `d2a739ecf36610fddf80564a26d52d25c053579c` 经 [CI #7633](https://github.com/sanqin888/sanqinMVP/actions/runs/40360253396) SUCCESS（1 成功/9 按文档范围跳过，无修复），合并 dev `343fefc7dce5849ca3401981ee6174f4f9d2ec59`。用户已授权合并后制作方案，现已形成本地[最小更新执行器实现方案](Runtime最小更新执行器实现方案.md)，列出范围、单一控制器/薄 SSH 入口、固定计划流程、四批实现与完结矩阵；待本地审阅，不代表代码已实现或生产已可更新。以下原批“本地/未推送”保留历史时点。

先完成一个适合单人运维的最小更新执行器：GitHub Actions 构建镜像，操作者在一台 MacBook 上通过 SSH 管理现有 Lightsail VM，日常发布以“预检计划一次、确认执行一次”为目标。应用镜像发布与低频平台工具维护分离；不为普通业务更新强制完成整套原 C1→R2→R3→R4→R5 高保证路线。

本次基于 2026-10-26 Runtime 重新评估报告更新文档。用户明确修订三项工作的安排为“先暂停（不取消），等最小更新执行器完成，可以正常进行代码更新后再回来继续进行”。这是实施顺序调整，不是删除长期安全目标或把未完成事项标为通过。

原 R0/G2、C1、R2 文档保留原始证据与适用边界。发生实施顺序/前置依赖冲突时，以本文件为准；已安装控制器、17+Manifest、现有代码 guard 与现场授权仍有效，不能根据本文件绕过。最小执行器采用独立、明确的验收范围，不能宣称原 C1/R2/G2 已关闭。

## 2. 三组暂停项与保留对象

| 工作 | 当前安排 | 保留内容与恢复入口 |
| --- | --- | --- |
| C1 的来源、输入固定、受保护加载研究（含后续装配/持有期接线） | **PAUSED_NOT_CANCELLED / C1_OPEN**；暂停后续研究、接线与专项验收，暂不作为最小执行器的前置条件 | 保留全部代码、测试、来源/批准输入、原始回执及已合并成果；从 [C1 基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[P10-F](Runtime更新-C1-P10-F完整候选装配就绪审计.md)及已合并 F4-B13 处复审继续 |
| 自建 CPython 3.12.15 及完整依赖证明 | **PAUSED_NOT_CANCELLED**；暂停进一步自建解释器、依赖闭包研究和专项证明 | 保留现有 prefix、构建/交付产物、源码、来源与限域验收；不卸载、不清理、不回退已有安装；恢复从 [PREP-12](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)及证据开始 |
| R2 离机 CAS、CA/CRL、Enrollment、可信时间/跨克隆防护 | **PAUSED_NOT_CANCELLED / R2-C4_OPEN**；暂停新身份/证书/离机权威的后续设计、实现及现场实验 | 保留 Option B/B1、Wire/SQLite/Guard 候选、证书/实验记录与未完成矩阵；恢复从 [R2 阶段计划](Runtime更新-R2阶段审计与B1实施路线-20261026.md)、[B1 审计](Runtime更新-R2-B1可信身份与双层撤销实施前置审计-20261026.md)复审 |

暂停不代表取消、退役、删除、失败或通过。已有 CI 测试和工作流不禁用；已有生产保护、日常备份、未知状态阻断和证据保留继续。原 C1/R2 `OPEN` 与其原路线 `NO-GO/DENY` 保持；这里改变的是它们对当前最小执行器交付的前置地位。

本地发布互斥、准确原策略记录、必要停写与常见重启后的维护门禁仍属最小执行器的数据保护范围；这不等于恢复离机 CAS/PKI 研究，也不得把本机锁或一次 stop 描述为已证明跨重启/跨克隆安全。

## 3. 最小执行器的信任与职责

- 信任操作者、经核验的 SSH 主机身份、受维护的 Ubuntu/root、GitHub 发布链及 AWS 账户。保护重点为误操作、混合版本、并发发布、下载损坏、迁移错误、SSH 中断和常见进程/VM 故障。
- 暂不要求自建恶意 root 对抗、离机身份发行/撤销、可信时间或跨快照/克隆抗回放控制面；本机状态不能提供这些保证，不能改口宣称已覆盖。
- 继续当前部署拓扑：Web、API、共用 API 镜像的 Uber worker、PostgreSQL，以及既有打印和管理设施。不引入微服务、多节点或新的常驻控制服务器。
- 复用已合并的 release_contract、备份/存储核验、readiness、迁移状态解析、启动健康等待与回退镜像认证。没有实际运行合同变化的应用发布，不应仅因打包/审计工具源码变更而强制维护整个平台。
- 解释器候选优先评估现有受支持系统环境并验证真实版本兼容性；暂停自建 3.12.15 证明不等于已经选定或安装替代 Python，也不能擅自修改旧候选的版本 pin。

## 4. 正常更新流程

以下是目标行为，接口尚未实现；不是可直接运行的命令。

1. **预检并固定计划：**选择已完成 main CI 和成对镜像发布的准确 SHA/digest，读取真实已安装工具、当前镜像/发布状态、project/volume/Uploads、环境要求、备份与准确迁移集合。显示实际变化、维护需要、停止条件和计划身份。
2. **操作员确认并执行：**执行前重核当前状态与计划身份；目标、运行配置、迁移集合或关键条件变化则停止，不悄悄改选 latest。获取本机互斥并保存持久进度/日志，拉取并验真镜像。
3. **按本次范围更新：**无迁移不执行 SQL；有迁移只执行明确批准的准确集合，按需要先停写。仅更新 api、ubereats-worker、web，不在 VM 编译镜像、不顺带更新 PostgreSQL 镜像或重建数据卷。
4. **等待并核验：**检查实际容器与存储身份、应用健康、本地/公网 Web、BFF/API、worker 及菜单 smoke；成功后记 ACTIVE。失败/未知记录 PENDING/INCIDENT，停止后续自动发布；已进入停写维护时保持维护，不在 finally 无条件恢复业务。
5. **断线与恢复：**任务应独立于交互 SSH 生命周期并可查询；SSH 断开不能当成取消、失败或重跑许可。进程中断/未明状态先审证据，不盲目续 journal。应用回退需另核镜像、当前数据库/数据语义兼容与操作授权，不自动反向迁移数据库。

main 晋级、生产执行与迁移授权继续由用户分别控制。两次操作的目标适用于普通发布，不把破坏性数据库变更、事故恢复或首次安装伪装成无需审阅的一键操作。

## 5. 平台维护、备份与一次性过渡

应用与平台工具分别登记准确版本及实际运行合同：端口/进程、Compose project、volume/mount、环境键、worker 启动与所需部署器能力。兼容判断核对受信、完整的具体对象，不依赖全仓 compare 是否达到 300 个文件或仅凭一个任意版本号。

当前已安装发布器仍受原 Manifest/来源/祖先/成员校验约束。未来必须以一次受审阅的工具安装完成过渡；不得先手工覆盖两份文件、伪改 Manifest、放宽权限或忽略截断比较来“恢复发布”。具体安装/原子交接方案、准确执行环境和受限任务权限在实现前明确审阅，本批不冻结新的 installer/长期 root launcher。

日常离机备份保持，必要的更新前数据备份与平台重大维护前准确 Lightsail 快照保留；普通镜像更新不重复整套整机灾备验收。AWS 快照/API 未知时按准确对象核对，不选 latest；如需云控制，可评估 Mac 侧受限协调，不默认新增 VM 长期云凭据或网络服务。账户/Region/盘覆盖仍须核验；完整真实恢复按2026-10-29用户决定列交付后待办，保留未验证状态。

涉及原 AWS 快照维护方案的操作，继续保留准确原策略、正常停写、一致恢复点、跨常见重启的维护保护、失败冻结、旧机隔离与人工切流；离机 CAS/CA/CRL 不再是当前交付前置。恢复旧快照不能自动重开业务；移走公网 IP 不足以阻止 worker 外部副作用；营业后新订单/支付不能被旧整盘覆盖。

## 6. 实施顺序、验收与完成条件

当前顺序固定为：**最小执行器设计/实现 → CI 与隔离验收 → 受审阅的一次性工具过渡 → 明确授权的真实应用发布 → 确认可正常更新 → 返回暂停项复审继续**。不再把原 B1-0/B1-1 或 C1 下一研究切片默认为当前下一步。

最小执行器必需覆盖：

- 无迁移发布与准确批准的兼容增量迁移；未知/失败迁移、SQL 不完整时拒绝。
- 镜像/发布证明错误，环境、挂载、备份或计划身份不符时拒绝。
- 并发发布、SSH 断线、执行进程退出、健康失败及停写后的重启门禁；不得从模拟结果推断真实故障已验收。
- 与当前数据库语义兼容的受控镜像回退；一次性工具安装的失败处置。
- 准确快照available、原工具/配置恢复材料及机外保存；完整真实恢复演练列交付后待办，交付注明RESTORE_VALIDATION_DEFERRED，不伪装已验证。

最小执行器完成且“可以正常进行代码更新”需要同时满足：源码经 CI/隔离验证；一次性过渡已获批完成；至少一次准确 main 镜像的真实发布与就绪检查成功；操作者可重复预检/执行/查询，有一页失败处置手册，且无未处置 PENDING。尚未执行的现场项保持未完成。

恢复暂停项前，先在最新 dev 上重新核对源码、安装/平台与原证据适用性，记录下一未完成步骤，再继续 C1/CPython/R2 的原目标；不从旧事务、旧证书或旧候选直接执行，不默认过期授权仍有效。本次用户决定确定了返回顺序，**无需再次询问是否永久保留这些项目**；实际源码/依赖/权限变化、远端交付及生产动作仍按各自既有审阅规则办理。完成条件不是定时提醒或自动启动后台任务。

## 7. 本批边界与历史记录

本批仅更新计划、根开发指引、现行 owner 文档、依赖图说明与单条工作日志；没有执行器实现、代码/CI/依赖/锁文件/schema/migration、17 Bundle/Manifest、Guard/CAS/Wire/证书、Docker/systemd/SSH/AWS/数据库变化。MCP-workspace 不执行 lint/build/test，当前无本批新 CI 或现场验证。

所有原 PR、SHA、限域验收和原始证据按原对象保留；不把 F4-B13 合并事实改回未完成，也不把旧正文的历史“下一步/未推送”当当前队列。本地文档完成后停在用户审阅，不自动推送、创建 PR、合并或开始执行器代码实现。
