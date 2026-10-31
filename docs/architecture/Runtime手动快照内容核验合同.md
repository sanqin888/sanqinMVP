# Runtime 手动快照内容核验合同

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
