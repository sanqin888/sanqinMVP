# Runtime 最小更新执行器实现方案

## 无迁移异步任务贯通（2026-10-27，本地待审）

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

如安装失败，保持维护并人工选择经核验的工具恢复或准确快照新实例；旧机必须确认停止写入，新机默认不营业、不运行后台外部写入者。存在新订单/付款或 UNKNOWN 时先对账/向前修复，不直接恢复旧整盘。一次可复用的真实恢复验证是第三/四批交付的一部分，不重演无关旧实验。

## 8. 四个实施批次

| 批次 | 范围与交付 | 退出条件 |
| --- | --- | --- |
| **第一批：准确计划与兼容检查** | 复用两个 release 文件，实现 exact 目标、计划字段/SQL 清单、受信逐对象运行合同检查；明确系统 Python、平台辅助件固定清单和最小持久 schema。不创建生产目录或安装 unit | Release/Runtime 对最终 head 的实际 CI 通过；计划能显示准确版本、变化与拒绝原因，300+ 无关文件不再导致误判；错 digest/配置/SQL/状态拒绝；单独通过所选系统 Python 的聚焦回归。此时仍不能生产部署 |
| **第二批：受控执行与失败保护** | 单一控制器接计划；release_job、本机锁/持久阶段、SQL 授权绑定、短停写/镜像切换/验证、状态查询、失败收尾与本机重启门禁 | 模拟 + 隔离 VM 覆盖并发、SIGKILL、SSH 断线、socket/daemon/VM 重启、健康失败、迁移前后未知与 ACTIVE 交接中断；没有 finally 重开业务；外置守卫未部署生产。不能只以单元测试冒充现场保证 |
| **第三批：安装、Mac 入口与一次性过渡准备** | installer、薄 SSH 入口、辅助件交付清单、权限/目录/units 的精确安装与撤回计划、一页 runbook；验证工具与现有应用向后兼容 | 隔离环境真实完成旧→新工具安装、成功发布和中断/恢复；Mac 可在两次操作内完成普通发布并重连查询；准确快照/备份恢复验证及所需生产安装材料可审阅。生产执行仍另批授权 |
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
| 回退与恢复 | 真实验证过的兼容镜像回退；一次性工具中断恢复；与所选快照/备份路线相符的可复用恢复证据 |
| 单人操作 | Mac 普通发布 1–2 次操作，命令不会悄悄换版本；status/logs 和一页事故手册可用；现场无未处置 PENDING/INCIDENT |

**以上全部达到才能标 MINIMAL_EXECUTOR_COMPLETE。**代码合并或 CI 全绿只能标 SOURCE/CI_VERIFIED；隔离试验、生产安装、真实应用更新分别记录。两步发布不包含首次安装、破坏性迁移或事故处置，也不承诺免费/零停机/自动云灾备。

完成后即进入原定的暂停项目复审：重核最新 dev、平台、安装与证据，从原 C1/CPython/R2 的未完成点继续。它们不是最小执行器完结条件；不要求再有另一台控制服务器、独立 CA、可信时间或跨克隆证明才允许结束本项目。

## 10. 本批状态与参考

本批只制作方案并同步已有 owner 入口、依赖图说明及工作日志；没有新执行器、installer、unit、依赖、权限、持久目录、CI、Prisma/迁移、Docker/AWS 或生产变更。本地只做文档差异/相对链接/范围静态审阅，未运行项目测试。分支 `docs/runtime-minimal-executor-implementation-plan-20261026`，未提交/推送本批。

- [当前优先级与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)、[发布手册](../runbooks/GHCR发布与Runtime状态.md)、[安装约束](Runtime交付与安装约束.md)、[AWS 快照/维护合同](Runtime更新-AWS快照与维护冻结方案.md)。
- [现有发布器](../../ops/release/deploy_release.py)、[发布合同](../../ops/release/release_contract.py)、[readiness](../../ops/verify-runtime-readiness.sh)、[CI](../../.github/workflows/ci.yml)。上面新增文件仅为拟定范围，本批未创建这些源码。
- [systemd-run 官方说明](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html)：transient service 可由服务管理器异步运行；目标 Ubuntu/systemd 实际版本的参数和失败收尾行为须在第二批实测，不能用最新 man page 冒充现场兼容。
- [Docker live restore 官方说明](https://docs.docker.com/engine/daemon/live-restore/)：daemon 不可用时可配置容器继续运行，因此停止 daemon 不能单独证明业务停写。
