# Runtime 最小执行器工具交付与安装合同

## D2 预检A有效容器配置（本地待审）

**2026-10-27 当前进度：D2_EFFECTIVE_CONFIGURATION_LOCAL / TESTS_NOT_RUN / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

审计文档[PR #3021](https://github.com/sanqin888/sanqinMVP/pull/3021) head `8d6ea058fcfc525b832845de105c7aec645a462c` 经[CI #7729](https://github.com/sanqin888/sanqinMVP/actions/runs/40590497085)成功（仅scope成功，其余9项范围跳过，未运行项目测试），合并dev `1fa95bbc7253a3a7ca0278207b410e97e13b8898`。

本批从该dev建立feat/runtime-minimal-effective-configuration-20261027，实现审计A的端口/healthcheck/AutoRemove只读核对。固定角色只允许127.0.0.1上的同号TCP端口：API4000/5555、worker4001、web3000、DB5432；Compose ports、HostConfig.PortBindings与NetworkSettings.Ports的实际发布项逐项一致，拒绝缺多/重复/公开地址/UDP或错端口。镜像暴露但未发布的Ports=null不当成对外端口，不生成端口修复。

保存完整容器ID/image/config摘要重新核对，AutoRemove/PublishAllPorts/Privileged须严格false。healthcheck从已观察image默认值合并Compose准确覆盖，核Test/Interval/Timeout/Retries/StartPeriod/StartInterval及类型；禁止disable/NONE/未知字段，显式时长只接受整数ns/us/ms/s/m/h，非支持格式阻断不猜测。Compose导出test中的美元按原规则只解码一次，实际/image默认不改；不执行healthcheck命令或改容器。

新严格bool include_effective_configuration要求此前直到migrations全部启用，内部_observe_installed_effective_configuration在原两锁/同截止/全局双读内调用新阶段；旧入口默认不调用。结果仅effectiveContainerConfigurationObserved=true与各角色端口/health摘要及保存ID，applicationConfigurationObserved/hostPreflightComplete/readyToInstall/canExecute等整体许可继续false。当前明确依赖的HostConfig检查为原restart策略、实际挂载/网络与解析覆盖、Privileged，加本批AutoRemove/PublishAllPorts/PortBindings；并不声称已比较所有Docker可选HostConfig字段或证明全应用配置。

新增8项离线Docker模型测试：合法摘要/输入不变、自动删除/自动发布/提权、缺多/公开/不一致实际端口、Compose端口/协议/重复、health命令/时长/整数类型/disable漂移、美元一次解码与未发布端口、保存config与时长格式、旧入口/前置开关/无CLI。仅Python3.10 AST、全局名字/方法/空白审阅及准确读回，项目测试待CI。组合全阶段故障与真实Compose导出差异留C/D4，不将模型等同真实Docker验收。

A源码本地完成，尚未提交；下一批B补外部备份脚本/helper/sudoers绑定，之后C统一组合及预检合同收口。安装意图、临时拒绝门禁、完整恢复实物与准确停写/快照、逐文件安装/交接、Mac入口和统一真实隔离验收仍OPEN。无新依赖包/九helper导入/持久化格式/公开CLI或业务schema变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner；固定17+Manifest/250/300、私有四文件及三永久门禁保持，三组研究继续暂停、不取消。未执行现场预检或生产安装。

## D2 剩余预检缺口审计（已合并）

**2026-10-27 当前进度：D2_PREFLIGHT_GAP_AUDIT_MERGED_DEV / DOCUMENTATION_ONLY / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**

原两锁迁移接线批[PR #3020](https://github.com/sanqin888/sanqinMVP/pull/3020) head `e4d1dd8dc333832d605dc757d2db60de99d8b831` 经[CI #7727](https://github.com/sanqin888/sanqinMVP/actions/runs/40589684080)全绿（4成功/6范围跳过；Release默认Python与3.10各779项、Runtime1080、既有C1回归412），合并dev `6a1e423bcf4b0c1f74c6937d5a60cb6638ed0653`；无CI修复，未执行现场预检或安装。

本批基于该dev，在docs/runtime-minimal-preflight-gap-audit-20261027完成剩余预检源码审计。结论：现有来源/17原件/私有材料/环境/挂载/网络/资源/备份gzip/systemd/迁移观察已接线，但完整有效应用配置和外部备份执行文件绑定仍未齐全，不能将hostPreflightComplete、applicationConfigurationObserved或readyToInstall改为true。审计仅静态事实，无生产故障判断。

后续只读预检收敛为三批：A补端口/healthcheck/AutoRemove及保存身份漂移；B补固定外部备份脚本/helper/sudoers原件与旧封存源码绑定；C统一组合回归并逐条核对预检合同，明确真实隔离验收边界，再进入既定安装意图/临时拒绝门禁。完整表及退出条件见交付合同本节。不能仅因本地测试条目增加或多个观察flag为true而宣布预检完成。

本批只更新六份文档；无代码/测试/依赖/业务schema/持久化格式/CLI变化，无12上下文owner/SCC/债务/依赖图基线变化，未重跑scanner或项目测试。三组研究继续暂停、不取消；固定17+Manifest/250/300、九helper、私有四文件和三永久门禁不变。所有安装写入、准确原ID停写、手动快照available/恢复实物、Mac入口、统一真实隔离验收与生产交付仍OPEN。

### 剩余预检审计：范围、批次与退出条件

核对依据：install_minimal_executor.py的_docker_snapshot、_application_binding_snapshot、_systemd_disk_snapshot与_observe_installed_migrations；ops/backup/sanq-backup.service、backup-db.sh、sanq-backup.sudoers，以及C4路径合同runbook。此处路径来自源码/历史安装合同，未声称已观察当前VM。

| 批次 | 已有证据与实际缺口 | 有限实现范围 | 退出条件 |
| --- | --- | --- | --- |
| A：有效容器配置 | 已核image/命令/Env/挂载/网络、Running/healthy/Privileged=false；未把端口与healthcheck绑定到已核Compose/镜像，未拒绝AutoRemove | 将固定角色端口的HostConfig.PortBindings及NetworkSettings.Ports、Config.Healthcheck、AutoRemove纳入只读核对和稳定摘要；同时列清该安装流程实际依赖的其他HostConfig字段，拒绝未经合同支持的偏差，不泛化成全Docker配置框架 | 错端口/公开绑定、伪healthcheck、AutoRemove=true、实际端点或保存身份中途变化均阻断；合法原配置通过；两锁/无写/无新CLI回归通过实际CI |
| B：外部备份执行实物 | 已核备份unit字节/加载属性，ExecStart=/home/ubuntu/backup-db.sh；仅核Runtime内模板不证明这个外部可执行原件相同 | 对/home/ubuntu/backup-db.sh、/usr/local/sbin/sanq-backup-protected-nginx、/etc/sudoers.d/sanq-backup做固定路径nofollow/普通单链接/有界读取与前后身份核对，逐字绑定旧封存17中的对应成员；按既有安装合同核owner/mode，主脚本仍ubuntu执行，root helper/sudoers仍窄权限 | 缺失、链接、坏权限、任一字节/原路径inode变化阻断且保留原件；不执行备份、sudo或rclone，不修权限、不装文件，不将三外部对象加入17；原模型及新增回归实际CI通过 |
| C：预检合同收口 | 当前多个局部观察成功仍缺整体资格；databaseLoginVerified/fullApplicationConfigurationProven等false不是可被静默忽略的完成证据 | 逐条对照REVIEW_INPUTS和后续阶段的责任；将A/B接入同一锁/截止/双读，添加有代表性的整体故障组合；明确DB目标/读取历史与实际登录验证的差别，必要检查以固定只读方式实现或写明仍阻断 | 所有必需项均有准确实现与失败测试；未证明项明确保持阻断，不能靠聚合flag或替身宣布通过；形成下一阶段可审阅的安装意图记录合同，真实隔离测试留D4且不得标已验收 |

A的端口/healthcheck比较须采用已有Compose导出语义：美元只在对应导出值上按准确规则比较，不能改写原文件/创建配置或再次全局转义。B的/home/ubuntu脚本位于用户目录，按既有运行身份与前后路径身份核验，不擅自改为root所有；root helper/sudoers的父目录须保护。实际元数据不符只能阻断并审阅，历史runbook中的安装命令不能重跑。

C还须量化一次完整观察的Git请求数、字节量与命令时间预算。当前迁移阶段内部两次、整体再两次会重复读取Git对象，是否触发速率/时限尚未实测，属于交付可用性待验，不是已经发生的生产问题。若需优化，只考虑本次受锁观察内准确不可变对象的复用；最新CI/发布状态与主机观察仍须新鲜，禁止跨调用“通过”缓存或新建版本权威。

快照与恢复责任保持既定顺序：安装前先确认恢复材料的可获得性及保存方案，完整旧原件需在覆盖前耐久保存；手动快照的available确认属于保存原ID停写并抑制重启之后的RECOVERY_READY，不要求在仍营业时提前拍一份来满足只读预检。恢复实物、临时拒绝门禁、安装kind/journal、逐项安装与完成交接仍是D2后续实现，不能用预检报告代替。

本审计不要求实现OS供应链/系统Python来源、自建CPython完整依赖证明、离机CAS/CA/CRL/enrollment/可信时间/跨克隆防护；这些继续暂停。也不新增timer、常驻服务、云凭据、常规helper或第二发布入口。下一批从A开始，A/B/C收口后沿现有D2安装阶段继续，不另起一轮无限预检设计。


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

未安装源码接口：pack --source-sha S --runtime-archive <原归档> --output <新材料文件>；verify --source-sha S --kit <材料文件>；plan --source-sha S --kit <材料文件> --current-source-sha <旧Runtime来源> --current-runtime-archive <旧原归档>。它们仅准备或审阅操作者材料，不提供host apply；实际生产S/归档尚未选定，不能据此在现役VM复制单个源码运行。

新增30项离线模型测试，覆盖确定性材料/17+9+bootstrap与三模板、实际checkout清单/guard语法一致、原CI与最新CI、封存晚期漂移、错/重包归档、严格Manifest整数/重复键、Git树/普通文件/完整blob/350个无关文件、模板变化、自洽篡改kit无效、多缺/重复/路径/链接与预算、差异范围/工具降级拒绝、0600/create-only/链接/不安全父目录/生产路径/同步未知，以及CLI只路由材料、拒绝root pack和install/apply/execute、错误脱敏。GitHub/CI为替身，临时文件实物；未访问实际网络/容器/DB/管理器。仅Python3.10 AST、静态名字/重复方法/空白/guard常量语法与差异读回核对，项目测试未运行，不把前批544或CI #7700作为本批测试结果。

独立交付工具归Runtime/Ops材料清点与只读核验，依赖已审阅build_bundle/versioned_release_contract/release_contract，不导入九辅助件，不由task导入或自更新。未修改既有执行主体、Bundle/schema/CI/publish/权限，无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。

D1本地源码尚未远端交付；D2主机安装、独立bootstrap root落地/临时门禁/恢复材料/逐文件交接、D3 Mac薄入口、D4统一真实隔离验收及生产材料仍OPEN。当前打包器来自操作者独立审阅的bootstrap，材料包不能认证正在运行的验证器自身；后续root阶段必须重新验真，不能提权运行用户staging。17+Manifest、250/300旧guard、九常规helper/三永久drop-in数量保持，无新依赖/业务schema/迁移或生产操作，三组研究继续暂停、不取消。

## 原交付合同审计记录

以下为原合同审计时点；D1当前进展以上文为准，主机安装阶段尚未实现。

日期：2026-10-27。审计基线：dev `d1768dbd5af4375467d6e998dd7e031665b6f306`。

**CONTRACT_MERGED_DEV / SOURCE_AUDITED / INSTALLER_NOT_IMPLEMENTED / NOT_INSTALLED。**

本合同完成第三批开始前的文件边界和过渡顺序核对，供后续 pack/verify/plan 与有限 installer 实现使用；本文描述的安装阶段、目录、临时门禁和材料格式均尚未实现或执行。本次没有读取生产主机现状，没有选定生产目标 main SHA、归档摘要或快照 ID。生产动作仍需按准确材料另行授权。

普通应用发布、工具安装分开进行。日常发布继续以计划与确认的 1–2 次操作为目标；以下一次性平台过渡不会被塞进每次应用更新。C1 来源/输入固定/受保护加载研究、自建 CPython 3.12.15 完整依赖证明、R2 离机 CAS/CA/CRL/Enrollment/可信时间/跨克隆防护继续暂停、不取消。

## 1. 已核实的代码事实

| 证据 | 核实结果 | 交付含义 |
| --- | --- | --- |
| [build_bundle.py](../../ops/runtime/build_bundle.py) 的 SOURCE_FILES、manifest_for_proof、verify_bundle_bytes | Bundle 固定 17 个源码成员加 runtime-release.json；manifest 内 sourceSha、两镜像与 CI/publish 绑定 | 不加第 18 成员，不把辅助件伪装成旧 Manifest 成员 |
| [publish-images.yml](../../.github/workflows/publish-images.yml) | 准确 main CI head 构建镜像及原 Runtime 归档，上传后封存归档 SHA256，再发布成对 seal | dev CI 通过不是可安装来源；原归档必须保持原字节 |
| [runtime_trust.py](../../ops/runtime/runtime_trust.py)、[versioned_release_contract.py](../../ops/runtime/versioned_release_contract.py) | 前者公共 verify 当前绑定最新发布，后者有历史 exact 版本校验 | 已审阅目标被更新的 latest 超越时不得换包；准确历史验证须复用已有规则 |
| [stage_bundle.py](../../ops/runtime/stage_bundle.py) | plan/stage 只做惰性 staging，不切换现役树、不安装外部 units | staging 成功不能宣称已安装或取得生产写入许可 |
| [plan_versioned_install.py](../../ops/runtime/plan_versioned_install.py) | 返回非执行提案，含 /opt/sanq/releases 的旧提议 | 不能把旧提案当现成 installer；本项目保持真实 /opt/sanq/runtime，禁止改为 symlink |
| [deploy_release.py](../../ops/release/deploy_release.py) 的 runtime_manifest、ensure_repo_location | 全验 root-owned 17+Manifest；Runtime 来源与当前应用 SHA 独立 | 安装工具不改当前应用 SHA/.env/state；至少 controller 与 release_contract 的受保护源变更必须走正式归档过渡 |
| [protected_config_snapshot.py](../../ops/backup/protected_config_snapshot.py) | 固定 RUNTIME_SOURCE_MEMBERS 为原 17；配置材料不是九辅助件和 systemd 外部文件的完整恢复包 | 一次性安装必须另外保存辅助件/三 drop-in/状态目录实物和“原先不存在”事实，不改其固定清单来假报全量恢复 |
| [deployment_plan_store.py](../../ops/release/deployment_plan_store.py)、[release_job.py](../../ops/release/release_job.py) | 运行时不 mkdir/chown；私有目录 root:0700、记录/锁 0600，锁 inode 不主动删除 | 目录由 installer 显式建立/核对；既有状态和锁不得重置 |
| [maintenance_guard.py](../../ops/release/maintenance_guard.py) 的 DROPINS、check_startup、_installed_gate | 三份准确永久门禁；启动检查遇任意维护目录残留拒绝；正式 gate 校验已加载属性及 live-restore/swarm | 安装过程不能假定尚未齐备的工具已经提供完整门禁；临时拒绝门禁须先独立生效 |

以上为准确源码静态核对。现场系统 Python、Docker/Compose/systemd 版本、现役 17 差异、override、真实挂载与服务状态仍须在隔离验收和生产预检时实测。

## 2. 固定交付集合

### 2.1 原 Runtime 归档：17+Manifest

保持原 build_bundle.SOURCE_FILES 全集和 runtime-release.json 字段合同。以一个已经 main CI、成对镜像发布及归档封存成功的准确 SHA **S** 为目标，保留原归档原字节、归档独立 SHA256、CI/publish run 和全部来源响应。

首次最小工具过渡按“工具变更”审阅：允许的受保护执行源变更先限于 ops/release/deploy_release.py 和 ops/release/release_contract.py。必须逐项比较真实旧 17 与目标准确 17，不能据此前源码批次推断只有这两项差异。其余成员若有不同，停止并列出准确对象及影响后另审；尤其 Compose/readiness、备份脚本/unit/sudoers变化不自动随工具更新放行。不能手改新旧 Manifest 或扩大 250/300 阈值。

### 2.2 九个常规运行辅助件

以下各文件均来自同一准确提交 S，安装在 /opt/sanq/runtime/ops/release/，不进入原 17 清单：

| 文件 | 所有职责 |
| --- | --- |
| deployment_plan.py | 纯计划、SQL/兼容确认和运行合同 |
| deployment_plan_store.py | 私有 typed 原件存取、计划锁 |
| collect_deployment_plan.py | 现场采集、准确来源/镜像/SQL及审阅 CLI |
| release_job.py | 只读预检 job、原任务锁 |
| maintenance_guard.py | 维护记录、门禁和保存 ID 的失败收尾 |
| migration_container.py | 单一迁移对象配置、退出与历史校验 |
| start_candidates.py | 保存候选 ID 启动及就绪 |
| finalize_candidates.py | 唯一发布状态交接、原策略恢复与最后清标记 |
| release_task.py | 异步提交、管理器上下文、阶段编排和联合观察 |

文件目标 root:root、0644，父目录 root-owned 且无组/其他写权限，不允许链接、额外硬链接或路径重定向。用 /usr/bin/python3 -B 调用，无需赋予脚本可执行位。固定路径、辅助件互相导入、API 签名与同版本字节须一起验真；签名检查只是额外门禁，不能替代完整文件哈希。

一次性 installer/Mac 薄入口属于独立交付工具，不算第十个常规辅助件，不进原 17，也不由普通发布任务调用或自更新。

### 2.3 三个永久 systemd drop-in

固定文件名均为 80-sanq-maintenance.conf，目标目录为 /etc/systemd/system/<unit>.d/，root:root、0644；父目录 root:root、0755。永久内容逐字采用同提交 maintenance_guard.DROPINS，不从不受信输入指定 unit、路径或命令。

| unit | 永久作用 |
| --- | --- |
| docker.service | ExecStartPre=/usr/bin/python3 -B /opt/sanq/runtime/ops/release/maintenance_guard.py check-startup |
| docker.socket | ConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json |
| sanq-backup.service | 同一 ConditionPathExists；ExecStartPre=+ 加固定 startup guard |

不新增常驻服务、timer、sudoers/NOPASSWD、远程 root launcher 或生产云凭据。应用任务仍为原 transient unit。未知额外 drop-in、完整 unit override 或同名文件冲突均阻断，不覆盖它们来迎合门禁。

### 2.4 私有状态与恢复材料

| 固定位置/对象 | 安装规则 |
| --- | --- |
| /opt/sanq/deploy-state 与 plans、jobs、maintenance 子目录 | root:root、0700；不存在才在已核验真实父目录中显式创建；已有权限/类型不符先拒绝，不自动修权限 |
| plans/.prepare.lock、jobs/.release.lock | 运行时按原合同建 0600；共享目录就绪后，从锁内业务基线复核至交接结束持原两锁，保留 inode，不 unlink/重置 |
| 原计划/job/维护残件 | 不覆盖、清空或迁移成“成功”；未完结记录阻断正常安装 |
| /opt/sanq/deploy-state/installations/<安装身份>/（拟定） | root:0700，固定安装材料/阶段记录 0600；只记录交付摘要、前置观察、恢复实物与安装阶段，不成为应用 current/previous 权威 |
| 原 .env、.sanq-release-state.json、C4 marker | 原字节/owner/gid/mode及可恢复实物保存；工具安装保持原内容 |
| sanq-app_pgdata、/srv/sanq/uploads、sounds、备份根 | 核对实际身份和原权限；不复制替换数据库卷、迁移数据或重新布置挂载 |

安装材料要保存完整旧 17+Manifest、原归档（若尚无法取得则阻断正式恢复就绪）、九辅助件和三个外部文件的旧字节/元数据或原本不存在的事实、私有状态原件、容器完整 ID/image ID/声明/digest/挂载/原 restart 策略、实际 unit 状态与加载配置。旧源码 checkout、旧证据、快照和日常备份保留。安装记录中的观察值与旧 state 实物不取得第二份发布选择权。

## 3. 来源方案：复用 GitHub 精确对象，不新增发布权威

本合同选择“原已封存 17 归档 + 同准确 S 的固定源码对象 + 固定模板”作为最小输入，不先增设另一个发布 workflow、状态 seal、CA 或签名服务。

1. 复用 release_contract.verify_exact_candidate(S, S) 核同 S 的 seal、谱系、发布及最新准确 main CI，再复用历史 Runtime 归档校验核独立压缩摘要、17+Manifest和同 publish run/两 digest。manifest 的原 ciRunId另核其原始 main/push、准确 head及成功结果；不要把后续成功 CI 的新 ID 直接写入或等同原归档 ciRunId。既有历史归档函数本身未核最新 CI，不能单独作为全部来源门禁。包内 manifest 自报的 hash 不构成来源证明。
2. 九辅助件和未来 installer/Mac 工具逐项读取 S 的完整 Git commit/tree/blob：路径、普通文件类型、blob 身份、字节数、完整原文及 SHA256都核对；不能用 compare/files 的截断列表、可变分支名、工作区文件或 kit 内自报摘要代替。
3. 三永久 drop-in 是已审阅固定文本，必须与已验真 S 的 DROPINS 一致；不通过 import/exec 未验证目标 Python 来生成或验证文本。后续实现对模板的静态表达/一致性采用聚焦测试，不引入通用代码求值。
4. transport kit 可缓存原归档、固定源码字节和清单。清单绑定 S、原归档独立摘要、每项路径/大小/hash、格式版本与模板摘要，属于传输清点材料，不能自证可信、设置 readyToInstall 或授权 root 写入。根信任核对失败或原件不可得则阻断，不离线猜测通过。
5. 第一次 root 验证由操作者独立审阅、从可信准确 Git 对象核过的有限 bootstrap 实现；期望 hash 不能来自同一未验证 kit。bootstrap 仅标准库、固定路径和操作，不 import/exec staging 中目标文件；核验完成后复制到 root 私有位置、同步读回，再进入明确授权的安装阶段。
6. 日后应用发布不重新投递九工具；其完整性随已安装工具核对。工具低频升级另走同一准确交付路径，不能让正在运行的任务替换自身依赖。

此处是普通 GitHub 精确来源与文件权限合同，不恢复暂停的 C1 加载研究。它不声称抵抗恶意 root、跨克隆回退或没有外部证明的可信时间问题。

## 4. 安装顺序与中断边界

这是未来 installer 的固定顺序，不是本批已具备的命令。真正写入前须有明确授权、隔离验收及可审阅材料。

| 阶段 | 达到后才能继续 | 中断/未知结果 |
| --- | --- | --- |
| REVIEW_INPUTS | 精确来源/全清单/主机身份/旧 17/原配置与资源、系统 Python/依赖、units/挂载/备份/恢复实物齐全；无未完结 job/维护 | 只读阻断，不能声称已冻结 |
| PROVISION_AND_LOCK | 仅对原先不存在的固定私有目录显式建目录；随后持原 job/计划锁，重核业务基线、无 pending job及维护为空；既有 owner/mode/类型不符拒绝 | 只产生私有目录/原锁文件，不宣称维护生效，不清理或重置既有记录 |
| RECORD_INSTALL_INTENT | 独立安装记录及 maintenance/active.json 安装意图先同步读回；该 marker 与普通应用维护记录分 kind，不冒充 v1–v6 | 保留原件；普通 guard 拒绝不识别的 kind，startup 仍因非空维护目录拒绝 |
| LOAD_DENY_GATES | 三固定 drop-in 先用下述独立拒绝形态安装，daemon-reload后核有效加载属性和来源；仍不重启 daemon | 全部未确认前不改容器策略、不停业务、不覆盖 Runtime；此时不能声称跨重启已冻结 |
| FREEZE_SAVED_WRITERS | 持原两锁，先耐久保存完整三 ID/image/策略；仅对保存对象设 restart=no 并 stop，复核角色全集/DB/挂载/备份 | 只尽力处理保存 ID，无法确认则 FENCE_UNCONFIRMED；不推断新 ID 或自动恢复策略 |
| RECOVERY_READY | 已停写/抑制重启的准确 Lightsail 手动快照 available及原工具恢复材料核对；不自动调用 AWS | 未核实不能覆盖受保护执行源；恢复资格依准确对象，不靠裸 hash |
| WRITE_TOOLS | 在拒绝门禁和两锁下安装已验真九工具、正式 17+原 Manifest及元数据；按明确逐文件顺序同步/读回 | 保留安装意图、实际新旧字节和拒绝门禁，不继续执行混装工具或自动退回 |
| LOAD_PERMANENT_GATES | 全部新字节核对后把同三文件换为永久准确文本，daemon-reload并核 _installed_gate、API/签名/权限 | 旧加载拒绝形态与新非空目录 guard 都阻断冷启动；加载未知不清 marker |
| VERIFY_OLD_APPLICATION | 原 .env/state/C4 marker逐字不变；仅在前序已知成功后启动保存的原应用 ID，核实际 image/挂载/DB/HTTP/readiness，恢复准确原策略 | 启动可能写业务数据；失败停保存 ID 并保留真实证据，不据快照自动恢复旧盘 |
| COMPLETE_INSTALL | 全清单/有效 units/原应用/元数据读回、耐久安装完成记录；最后清理准确本次安装 marker并同步读回 | 完成记录或清理未知不重写/重放。marker可能仍在或已消失，按实际状态审阅 |

临时拒绝形态只占用上述同三个固定文件路径：

- docker.service：固定 [Service] 与 ExecStartPre=/usr/bin/false。
- sanq-backup.service：固定 [Service] 与 ExecStartPre=+/usr/bin/false。
- docker.socket：保持固定 ConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json，且安装 marker已耐久存在。

这些内容只用于一次性安装，正式 _installed_gate 必须拒绝它们。独立 bootstrap 核验它们已有效加载后才能进入 FREEZE。不以 drop-in 文件存在代替加载生效；不 stop/restart Docker 来充当停完写入者，不把 socket拒绝等同现役容器已停。永久 guard上线后仍在非空维护目录中拒绝启动，因此转换时不需要删除 marker制造窗口。

首版不重启或重建 DB/无关隧道、不迁移业务、不更新应用镜像。若真实源差异超出工具范围或旧应用无法在新工具下证明一致，停止并另审平台维护。/opt/sanq/runtime保持真实目录，17 与外部文件逐项变更不被描述为一个原子事务。安装期间不得从另一终端手工发布或更换工具。

## 5. 后续实现切片与退出条件

| 切片 | 必须交付 | 退出条件 |
| --- | --- | --- |
| D1：惰性材料与只读核验/计划 | 在拟定 install_minimal_executor.py 内固定清单、精确对象/原归档输入校验、无执行权的材料清点和安装差异；不接 host apply | 合法完整输入通过模型，错 source/hash/类型/链接/多缺成员/原件变更拒绝；不 import未验目标、不调用 Docker/systemd/AWS或写生产；实际 CI 通过 |
| D2：受限安装与失败保持 | 固定 root 读写目标、两锁、安装意图/临时门禁/旧工具实物保存、逐项同步与最终读回、明确人工恢复材料 | 故障注入覆盖每个耐久边界；未知不续跑、不自动重开，不写 DB；实际 CI 通过 |
| D3：Mac薄入口与一页 runbook | 固定 SSH 主机验证、准确子命令/参数、计划/SQL/回退摘要转交、重连 status/logs | 普通无迁移发布两次操作内；无任意 shell/URL/路径拼接，无新常驻设施；实际 CI 通过 |
| D4：统一真实隔离验收与生产材料 | 旧→新安装、Compose美元往返、系统Python/Prisma/Docker/PID1、SSH/SIGKILL/socket/daemon/reboot、连续双发布与恢复 | 覆盖准确最终版本全部场景，恢复对象/证据可复核；通过后才提交准确生产安装与 main 晋级材料 |

D1–D4是第三批内部切片，不新增项目目标。当前第一/二批源码及 CI 已推进，不把真实隔离验收记成完成。完成 D1/D2 不等于已获生产 root 写入授权；不会为每个模型测试要求生产主动演练。

## 6. 本批结束位置

本批只完成源码审计与交付/安装合同，未修改 build_bundle、publish workflow、17 清单、guard、备份清单、权限或生产文件；没有运行项目测试、installer或系统操作。文档中的临时拒绝门禁、安装 marker/记录和 kit 均为后续实现合同。

下一步实现 D1 惰性材料与只读核验/计划。真实安装、Mac入口、隔离验收、生产过渡仍 OPEN；满足最小执行器最终条件并恢复正常代码更新后，再返回三组暂停研究。
