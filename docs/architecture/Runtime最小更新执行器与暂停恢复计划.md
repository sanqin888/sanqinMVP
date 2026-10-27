# Runtime 最小更新执行器与暂停恢复计划

**2026-10-27 当前进度：ROLLBACK_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原finalizer新增内部finalize_rollback_ready，以独立准确兼容确认、原typed回退计划及同一v6/READY尝试复用原成功交接主体。先持久FINALIZING，再仅替换.env中的SHA、核目标配置/readiness和完整SQL历史，提交唯一rolled-back/rollback-verified；同步读回后只对保存三ID恢复原restart策略，重核后持久HANDOFF_COMMITTED并最后清标记。未知结果保留实际state/.env/维护证据，不重写PENDING或自动重放。

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

日常离机备份保持，必要的更新前数据备份与平台重大维护前准确 Lightsail 快照保留；普通镜像更新不重复整套整机灾备验收。AWS 快照/API 未知时按准确对象核对，不选 latest；如需云控制，可评估 Mac 侧受限协调，不默认新增 VM 长期云凭据或网络服务。账户/Region/盘覆盖及真实恢复仍须验证。

涉及原 AWS 快照维护方案的操作，继续保留准确原策略、正常停写、一致恢复点、跨常见重启的维护保护、失败冻结、旧机隔离与人工切流；离机 CAS/CA/CRL 不再是当前交付前置。恢复旧快照不能自动重开业务；移走公网 IP 不足以阻止 worker 外部副作用；营业后新订单/支付不能被旧整盘覆盖。

## 6. 实施顺序、验收与完成条件

当前顺序固定为：**最小执行器设计/实现 → CI 与隔离验收 → 受审阅的一次性工具过渡 → 明确授权的真实应用发布 → 确认可正常更新 → 返回暂停项复审继续**。不再把原 B1-0/B1-1 或 C1 下一研究切片默认为当前下一步。

最小执行器必需覆盖：

- 无迁移发布与准确批准的兼容增量迁移；未知/失败迁移、SQL 不完整时拒绝。
- 镜像/发布证明错误，环境、挂载、备份或计划身份不符时拒绝。
- 并发发布、SSH 断线、执行进程退出、健康失败及停写后的重启门禁；不得从模拟结果推断真实故障已验收。
- 与当前数据库语义兼容的受控镜像回退；一次性工具安装的失败处置。
- 与其实际恢复方式对应的一次可复用恢复验证；未执行真实 AWS 恢复时明确列未验证，不伪装已完成。

最小执行器完成且“可以正常进行代码更新”需要同时满足：源码经 CI/隔离验证；一次性过渡已获批完成；至少一次准确 main 镜像的真实发布与就绪检查成功；操作者可重复预检/执行/查询，有一页失败处置手册，且无未处置 PENDING。尚未执行的现场项保持未完成。

恢复暂停项前，先在最新 dev 上重新核对源码、安装/平台与原证据适用性，记录下一未完成步骤，再继续 C1/CPython/R2 的原目标；不从旧事务、旧证书或旧候选直接执行，不默认过期授权仍有效。本次用户决定确定了返回顺序，**无需再次询问是否永久保留这些项目**；实际源码/依赖/权限变化、远端交付及生产动作仍按各自既有审阅规则办理。完成条件不是定时提醒或自动启动后台任务。

## 7. 本批边界与历史记录

本批仅更新计划、根开发指引、现行 owner 文档、依赖图说明与单条工作日志；没有执行器实现、代码/CI/依赖/锁文件/schema/migration、17 Bundle/Manifest、Guard/CAS/Wire/证书、Docker/systemd/SSH/AWS/数据库变化。MCP-workspace 不执行 lint/build/test，当前无本批新 CI 或现场验证。

所有原 PR、SHA、限域验收和原始证据按原对象保留；不把 F4-B13 合并事实改回未完成，也不把旧正文的历史“下一步/未推送”当当前队列。本地文档完成后停在用户审阅，不自动推送、创建 PR、合并或开始执行器代码实现。
