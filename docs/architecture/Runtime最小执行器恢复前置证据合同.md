# Runtime 最小执行器恢复前置证据合同

## D4执行前审计与固定隔离验收方案（本地待审）

**D4_PREPARATION_LOCAL / VM_NOT_BOUND / INSTALL_ADAPTER_OPEN / NOT_EXECUTED / RESTORE_VALIDATION_DEFERRED / NOT_INSTALLED。**

基于[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292` 创建 `docs/runtime-minimal-d4-readiness-20261030`，继续第三批内部D4执行前审计。新增[统一隔离验收方案](../runbooks/Runtime最小执行器D4隔离验收方案.md)，固定目标/准确来源、安装/发布/回退/中断的20个case、证据字段、停止条件及第四批生产材料；全部case仍NOT_RUN，源码CI不能替代现场结果。

核出四项实际前置：本次尚未绑定新的隔离VM；D1仍要求准确main发布来源，dev/PR CI不能冒充；首次安装的材料保留/完整安装/快照双帧与离机确认仍为私有调用链，公开CLI仅pack/verify/plan，尚无安装专用transient/独立失败收尾；六就绪端点含固定sanq.ca，隔离环境须证明实际路由，不能拿生产200补验收。普通发布release_task已有受控transient不代表初始bootstrap监督已接线，Python异常收束不能证明SIGKILL安全。

只读GitHub观察记录main@d3a896f32f1db71e49433f9e87bef534e27589bb与PR初始head6b8d1e77的发散元信息，不用compare文件清单作来源/完整性证明，实际晋级与材料准备前仍需重核。新VM应使用隔离凭据/数据与受审阅网络，不切生产DNS/业务，不假定AWS旧Blueprint可选、不自动创建计费资源。本批不合main、发布镜像或执行root/systemd/AWS/SQL操作。

方案明确下一步先交付既有bootstrap内有限的受控入口、manager关联、准确原ID独立收尾及快照实际通道适配，配合目标/材料/路由只读核查，再做真实写入验收。不新建常驻控制器、通用root launcher、CA/CAS或另一应用state；可复用现有私有函数作经审阅的一次性适配，不要求另造通用公开安装API；不以临时python -c/nohup绕过来源/目标、监督与通道检查。最后清marker后的未知状态仍按实际存在/不存在记录，不伪造围栏/冻结或成功回执。

本批仅文档与既有进度同步，无代码/CLI/schema/unit/依赖/测试变化，未运行项目测试或实际D4场景；完成差异、相对链接/固定case/源函数及边界静态审阅，未提交或推送。owner/依赖图基线无变化；17+Manifest/250/300、九helper/三永久模板及三组暂停研究保持。完整VM/数据库恢复实演继续交付后，更新前手动快照/内容核验、恢复材料/离机确认仍保留，生产未部署，不标restoreProven或MINIMAL_EXECUTOR_COMPLETE。

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

## DB原始采集格式与真实端口边界

`_capture_recovery_database_probe` 的run端口是受信适配边界，签名为run(argv, *, deadline)，返回准确三字段returncode/stdout/stderr；生产者和纯数据读者同bootstrap同步增加，没有公开命令或持久化读者。端口不是任意shell执行接口，传入argv仅限既有_installation_history_args与_installation_storage_args，固定/bin/sh脚本+psql -X -w、Unix socket/sanqin_db、BEGIN READ ONLY及固定超时SQL；不拼接操作者SQL/容器名。它不启动DB或业务，不发业务HTTP，不写业务数据。没有SSH适配器的当前源码不能认证端口实际连接了哪台主机；调用方不能根据参数匹配自行宣布已绑定实际云实例/容器。

在新目标/原件核对成功后，按history→storage→history→storage采集，原生64位hex容器ID由独立新目标上下文提供，不从快照中的旧容器ID推断。run须执行同一单调时钟绝对deadline，初始窗口最多300秒，采集器每次调用前后及最终返回前检查；注入端口必须自行实现实际进程/网络超时，函数检查不能中断不守合同的阻塞端口。无默认无限重试、服务重启、自动清理或恢复旧事务。

内存原件为schemaVersion=1、kind=sanq-minimal-recovery-database-capture的规范JSON，准确七字段：schemaVersion、kind、basisSha256、indexSha256、replacementInputSha256、databaseContainerId、commands。commands准确四项，每项准确argv/returncode/stdout/stderr；保留原始输出字符串，不把输入布尔值当PASS。原生returncode必须0，stdout非空，stdout/stderr UTF-8合计≤2MiB、stderr≤4KiB，规范全件≤8MiB，不截断后放行。外层/各原始JSON严格拒绝重复字段/NaN等异常输入。

纯数据复核重新审计独立目标及原恢复材料，将三项hash和指定容器ID绑定到当前输入，逐项核固定argv和退出码，再解析原始stdout。两次完整DB身份/有序迁移历史及存储JSON必须规范语义一致；身份/准确PG版本、历史行数/hash必须与快照前原件一致，配置文件和默认表空间必须落在既定范围。仅相同主版本不够；设备/实例/容器生命周期身份仍按新目标独立观察。共享_installation_database_history_value保留原校验语义，不修改原安装预检的HTTP/内存或其他检查。

成功返回事实摘要和私有raw二元组；摘要只含固定身份/hash/数量，不回显stdout、stderr、SQL历史明细或秘密。raw可能包含私密诊断，须由未来授权适配器在私有证据通道保存，不能直接print/写公共日志。当前没有新增文件写入或失败回执；命令异常/退出失败/截止或预算失败时立即阻断后续查询，端口所有者须先保留失败/中断原件，不能依赖函数抛错之后还返回完整包。

databaseTranscriptReviewed=true表示提供的四项原件通过范围比对；commandPortTargetAuthenticated、databaseContainerBindingProven、databaseImageIdentityProven、fullClusterContentProven、replacementHostObserved、cloudIsolationProven、snapshotLineageProven、restoreProven/recoveryReady/canExecute均false。transactionReadOnly=on只表示查询事务只读，不能证明DB全局冻结；迁移历史一致不能证明全部业务内容、WAL恢复、哨兵/数量、uploads/sounds、旧Runtime或启动门禁正确。五组实际恢复证据列交付后待办，当前只做DB原件比对；未来真实恢复验收不能用CI模型替代。

## D2 独立恢复实例目标绑定（源码已合并）

**D2_RECOVERY_REPLACEMENT_TARGET_MERGED_DEV / SOURCE_CI_VERIFIED / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

本批[PR #3048](https://github.com/sanqin888/sanqinMVP/pull/3048)最终head `41bba8678fa2d77b06a4b83f277ca9c29e00cd38` 经[CI #7787](https://github.com/sanqin888/sanqinMVP/actions/runs/40903776855)SUCCESS（4成功/6范围跳过；两条Release各1221、Runtime1080、既有C1回归412），已合并dev `ace53c9a6bf37563c44b203fa6c04aa89820e424`，无需CI修复；无生产/AWS操作。

基于[PR #3047](https://github.com/sanqin888/sanqinMVP/pull/3047)合并dev `91c242aa1b0b8b488e4943d134d15cb9ca7f5563` 创建 `feat/runtime-minimal-recovery-replacement-target-20261029`。私有 `_snapshot_recovery_replacement_review` 复用原件材料审计重算basis，将新目标输入与独立传入的八项预期上下文逐项核对；拒绝源实例ARN、源名称或源SSH路由复用。目标限原账户/区域、单系统盘及原容量；设备名和同区域可用区可以变化，不能把源机物理身份直接套到克隆机。

恢复目标使用严格规范输入封装，保留原目标JSON的准确字节及摘要，复用既有实例/SSH/磁盘校验。它是数据核对入口，不接受PASS，不连接SSH、查询AWS、执行主机命令或写磁盘，不接回原安装事务。克隆可保留原SSH公钥；相同指纹既不证明新目标正确，也不是拒绝克隆的依据，须在准确新实例上独立核对。云来源、快照到新实例的实际血缘、启动前隔离和新主机观察均未证明，全部恢复/安装/执行许可保持false。

新增19项回归测试，覆盖独立上下文/原件/索引/basis错配、源实例与路由误用、跨账户/区域、规范输入和预算、单盘容量、克隆公钥/设备身份、原件来源不可用、无IO/命令和无秘密回显。Python3.10 AST/符号/最终差异静态审阅完成；MCP-workspace未运行lint/build/test；上述19项已随最终head两条Release各1221项通过CI。下一步按准确新目标实现只读原始证据采集与比对，真实D4证据和授权仍待落实，不能提前晋级RECOVERY_READY。

本批为bootstrap同所有者内新增私有能力，无新helper/永久单元/持久记录/公开CLI或第二应用state；已审阅，依赖图和基线无变化。17+Manifest/250/300、九helper/三永久模板和三组暂停研究保持；无依赖、业务迁移、生产/AWS/root安装或DB操作。

## 独立恢复实例目标输入与采集边界（源码已合并）

私有 `_snapshot_recovery_replacement_review` 在任何恢复主机采集前核对目标材料；当前没有调用者会据其输出执行主机命令。它接受原index、intent/writers、恢复二件、原安装ID、来源fetch端口及以下目标输入，不消费自报恢复结论。

外层规范JSON（准确字段、schemaVersion原生整数1、总计≤128KiB）：

| 字段 | 含义 |
| --- | --- |
| schemaVersion / kind | 1 / sanq-minimal-recovery-replacement-target |
| basisSha256 | 用原件材料审计重算的basis规范摘要；不能只信输入 |
| indexSha256 | 实际机外index准确字节摘要 |
| targetOriginal | 字符串，保存新实例目标规范JSON的原字节；内层≤64KiB，复用既有sanq-minimal-pre-snapshot-target的严格账户/区域/ARN/名称/SSH/公钥/单盘输入格式，仅借用解析规则，不表示对新实例发起拍照或停写 |

调用方还须从独立选定/审阅的新目标上下文传入准确八字段：basisSha256、indexSha256、accountId、region、instanceArn、instanceName、sshTarget、sshHostKeySha256。不能从外层输入复制这些值后声称独立校验；当前私有函数只核准确匹配，无法认证调用者如何取得上下文。任何缺失、额外字段、类型不符或错配均拒绝；错误不回显原始输入或秘密。

先核严格输入、独立上下文、index准确摘要及新旧云身份，再用原恢复材料完整审计重算basis。新实例ARN和名称须与源不同，账户/区域保持原范围；来源包中的原SSH路由不能复用。别名不同不证明网络端点不同，SSH主机公钥也可能被快照克隆，故sshEndpointIndependentlyAuthenticated=false、requiresIndependentSshVerification=true。没有实现DNS解析/云查询/SSH连接，也没有自行刷新known_hosts或绕过主机密钥检查。

当前仅支持原单系统盘容量，扩盘/跨账户/跨区域须另审准确兼容范围；同区域可用区、Linux设备名或云盘路径可变化。仅表示声明的新目标在范围内，不能把它当作真实磁盘覆盖检查。新目标原云响应可含metadata但只投影已验证的固定身份字段和准确摘要，不输出原备注/凭据。尚未验证新实例来自该快照，snapshotLineageProven=false。

成功为RECOVERY_REPLACEMENT_BOUND_EVIDENCE_REQUIRED；replacementTargetReviewed/materialBindingsReviewed=true，但replacementHostObserved/cloudIsolationProven/restoreProven/recoveryReady/readyToInstall/canExecute/authorizedToMutateProduction均false，五组真实证据要求不减。该输出不写新文件，不恢复旧事务，不是恢复票据或安装授权。

下一阶段只读采集必须先核实际SSH端点与独立新实例、启动前隔离及允许操作范围，保留固定命令/退出码/原始输出，再比较原应用/Runtime/DB版本与历史、逻辑路径和维护不变量。目标绑定源码/CI不能补出AWS血缘、网络隔离或完整集群恢复证据；真实恢复、root安装、云对象和DB写入仍须准确计划授权。未满足时保持隔离并留原件，不自动重试或开业务。

## 材料关联审计基线（源码已合并）

本批[PR #3047](https://github.com/sanqin888/sanqinMVP/pull/3047)最终head `bc67365544f8d8e5dcaf13ee00eed3abf5d6e25e` 经[CI #7785](https://github.com/sanqin888/sanqinMVP/actions/runs/40900423458)SUCCESS（4成功/6范围跳过；两条Release各1202、Runtime1080、既有C1回归412），已合并dev `91c242aa1b0b8b488e4943d134d15cb9ca7f5563`，无需CI修复；无生产/AWS操作。

**2026-10-29（America/Toronto）｜RECOVERY_MATERIAL_REVIEW_MERGED_DEV / SOURCE_CI_VERIFIED / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

基线为PR #3046合并dev `335cb5b1a117716f993b22e3dcec03edda12d1b6`，原分支 `feat/runtime-minimal-recovery-material-review-20261029`。本批完成材料关联审计和证据边界；没有执行恢复、创建AWS对象、改生产停写范围或取得真实验收结论。所属任务仍为最小执行器第三/四批，不另建长期平台研究。

## 当前已实现与未满足门禁

私有 `_snapshot_recovery_material_review` 复用现有恢复包整体范围审计，强制目标/存储原件存在，并比较机外index与原intent、writers、recovery.tar、recovery.json的准确摘要、ID、source和retention。再从包内原件重算目标/存储、核账户/区域/原实例ARN和名称、可用区、观察摘要及当前应用SHA。它不解包到文件系统、不执行包内命令，不查询AWS或恢复数据库；旧发布来源仍使用原fetch端口，不能把它称为完全离线来源认证。

同一次VM确认调用在确认回执保存和现场复核之后调用该审计，并再次做最终现场复核；返回 `recoveryMaterialReview`，不新增磁盘记录、CLI、执行入口或第二应用state。独立数据审计可用于恢复时比对已取得的原件，但不能据此继续旧安装事务。

成功只表示 `RECOVERY_MATERIALS_BOUND_EVIDENCE_REQUIRED / materialBindingsReviewed=true`。输出basis及其规范摘要，列明原source/应用、DB镜像ID/版本/历史、Docker平台、系统Python、固定持久路径和原观察/材料摘要；它们是原机验收范围，不是恢复主机的新观察。sourceDatabaseIdentity中的transactionReadOnly=on仅描述原只读查询会话，不表示DB全局停写或恢复实例已经隔离。basis≤16KiB，其摘要用于定位适用范围，不是签名、授权或可恢复证明。

`restoreProven/snapshotAvailable/recoveryReady/readyToInstall/canExecute/authorizedToMutateProduction` 均为false，requiresIsolatedRestoreEvidence/requiresHostRecheck为true。当前没有接受“恢复PASS”的输入schema、证明加载器、D4执行器或RECOVERY_READY晋级路径，不能以手填true、hash自洽、CI全绿、SQL gzip完整或available状态放行。

## 快照内外材料边界

| 材料 | 产生时点与恢复核对 |
| --- | --- |
| intent.json、writers.json | 拍照前保存，恢复时与机外index的ID/准确hash比较；原意图还绑定停写前完整观察 |
| recovery/recovery.tar、recovery/recovery.json | 拍照前整体审计并耐久保存；保存旧17+原Manifest、配置/工具/动态材料及host/目标存储原件，但不包含完整DB/uploads/sounds数据 |
| 机外snapshot-index-<installationId>.json | 拍照后客户端独占耐久保存，定位准确账户/区域/源实例/快照及原材料。恢复前须由操作者在已认证AWS会话重新核对象，不把JSON结构当云来源认证 |
| snapshot-review.json | available核对之后生成，不在先前快照内；index中的review hash只是保留的元数据，独立材料审计明确postSnapshotReviewDigestRecomputed=false |
| snapshot-offhost.json | 客户端index保存/ack之后生成，也不在先前快照内；不能反向写进原index形成循环摘要 |
| postSnapshotReceiptsRequired=false | 仅表示材料关联审计不要求两份晚生成回执，不豁免实际机外保存、AWS对象核对、隔离或恢复证据 |

机外index不是第二发布权威；其中“原源实例”只定位快照来源，不能直接作为恢复后SSH执行目标。新恢复实例必须由独立已批准的恢复计划固定ARN/名称/SSH主机密钥，且与旧源实例明确不同。未确定新目标前不得执行恢复主机命令。

## 五组真实恢复证据（交付后待办）

下列ID对应已有恢复审计源码的requiredEvidence，均为DEFERRED/未验证。2026-10-29用户决定将该实际恢复验收整体移到交付后，首版安装/交付不消费这些flag作为阻断条件；它们仍是未来声称真实恢复通过所需证据，不是可以导入自报PASS的接口。

| ID | 必须保留的实际原件与结果 | 不足以通过的材料 |
| --- | --- | --- |
| PLATFORM_AND_SNAPSHOT_CONSISTENCY | 准确源平台/内核/文件系统、Docker/PG镜像及版本、单系统盘和完整集群/WAL/表空间/配置位置；所选Lightsail快照路线的实际完整覆盖与一致性验证，绑定basis/准确对象 | 名称/容量相同、单看st_dev、state=available或只停应用 |
| ISOLATED_REPLACEMENT_FENCING | 新实例独立身份及SSH对应，启动前云侧隔离；真实启动/重启后门禁、原三应用和后台外部写入者保持禁止，旧机不被误操作；DB的受控恢复观察与业务放行分开 | 只关网页入口、只停daemon、进程finally或口头“不营业” |
| COMPLETE_CLUSTER_RESTORE | 在已批准的可丢弃隔离数据集/拓扑上，准确快照→新实例实际恢复；完整集群/WAL可恢复，固定只读身份/迁移历史、已提交哨兵/约定数量或内容对照正确，保留DB启动/恢复日志及原始输出 | gzip可读、HTTP 200、只恢复单表、仅比较文件夹或自报restoreProven |
| PERSISTENT_CONTENT_AND_RUNTIME_RESTORE | 实际DB卷、uploads/sounds/备份及所需工具/config/state材料的准确内容核对；旧17+原Manifest与原应用版本、秘密权限、原维护状态读回；晚生成回执缺失按上节处理 | 工具tar覆盖了所有业务数据、只比较mtime/目录存在、只保存摘要而没有可取得原件 |
| OFFHOST_ONLY_RETRIEVAL | 在原机不可访问的受控情景，仅用已保存机外index/授权AWS会话定位准确快照和新目标，并从恢复环境取得原intent/writers/恢复包成功关联；保留实际取得/读回记录 | 继续从原VM取最终回执、依赖latest/猜测名字、索引“已生成”但无机外读回 |

PG15官方[文件系统备份说明](https://www.postgresql.org/docs/15/backup-file.html)（2026-10-29复核）区分普通文件复制与完整、一致快照；运行中一致快照的恢复会涉及WAL重放，完整集群和相关存储覆盖不可省略。本项目保持DB运行的既定范围，不能顺手增加DB stop/CHECKPOINT/数据写入；若选定现场路线需要改变操作范围，须先审阅准确对象和授权。这里未对实际Lightsail平台的一致性或恢复作通过结论。

## 交付后完整恢复演练的执行前置与证据包

实际执行前，先将最终代码/工具交付状态、独立新目标、可丢弃数据集、网络/业务隔离、操作范围和回收/失败保持方式做成准确计划供用户授权。仓库源码授权和CI不包含AWS创建/恢复、生产停写、root安装或DB写入；本批仅明确计划所需材料，没有要求用户现在执行未准备好的命令。

一次完整可复用演练按以下顺序保留原始证据：

1. 固定basis/index及源平台、工具/应用/PG版本，准备已批准的隔离测试数据和对照清单；只在该隔离数据集生成哨兵，不在生产库插测试订单/付款。
2. 在拍照前完成原意图/停写/恢复包链，手动生成并核准确快照；保留原AWS响应及操作者的对象/顺序核对。没有独立云/时间认证时如实标明。
3. 在云侧先限制新实例访问和外部写入能力，再在独立新目标启动；先验证启动门禁、业务禁止、维护原件和全量路径，不能先启动业务再补隔离。
4. 按受控方案观察完整PG恢复和固定只读查询，核数据与持久内容；先做材料关联，再做真实恢复结论，不能倒过来拿一个PASS字段替代原输出。
5. 模拟原机不可访问，完成机外定位、材料取得与核对；再覆盖SSH断连、保存中断/VM重启等已列D4矩阵，失败保留实际证据和隔离，不自动重开业务。
6. 最终源代码基线、原始对象/命令输出/退出码、脱敏内容清单、差异解释、操作者结果与未解决项共同审阅。当前尚未定义可被执行器消费的最终验收receipt schema，需在真实采集边界明确后实现严格验证/适用范围加载器；本合同不提前接受手填结论。

新实例的设备名、st_dev/inode、云实例身份、容器生命周期可能与源机不同。不能把sourceStorageLayoutSha256或原目录inode机械地当作新机相等条件；应在准确新目标重新核完整物理映射与逻辑不变量。DB镜像/版本、应用与迁移历史、持久路径覆盖、旧Runtime/config/state及维护不变量必须按准确范围核；变化需要明确兼容审阅，不能只以“同主版本”继承恢复证明。

上述真实证据仅约束未来恢复能力的验收结论，已不作为首版工具安装/交付的前置。安装材料阶段改用SNAPSHOT_MATERIALS_READY，核准确快照available、原件/机外索引及现场不变量；restoreProven保持false，完整恢复演练完成前不宣称恢复已验证。该范围调整不自动授权root安装或生产发布。Mac薄入口、真实工具过渡/故障与生产应用更新仍按[实现方案](Runtime最小更新执行器实现方案.md)及[暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)执行。C1/自建CPython/R2研究继续暂停、不取消。
