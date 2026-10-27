# GHCR 发布与 Runtime 状态

**2026-10-27 当前进度：D2_APPLICATION_BINDING_LOCAL / TESTS_NOT_RUN / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增四容器有效环境与保存DB网络目标的只读比较，接原双锁、来源和主机双读；尚未提交远端。

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

详见[交付合同及D2运行前置](../architecture/Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_BACKUP_FILESYSTEM_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增宿主固定目录、部署磁盘余量及最新本地DB备份的只读核对，沿原两锁和来源/源码/配置/Docker/systemd双读；不备份、恢复、复制业务数据或写安装意图。

systemd预检批已由[PR #3013](https://github.com/sanqin888/sanqinMVP/pull/3013) 最终head `359a1c22400a222f90facbe78480dee914c425ae` 经 [CI #7713](https://github.com/sanqin888/sanqinMVP/actions/runs/40578976996) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各685、Runtime1080、准确CPython3.12.15回归412），无本批CI修复，合并dev `fbbee891fba9820f31f3cf1d859d745286ee49f3`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或真实隔离验收。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增hostPersistentDirectoriesObserved/backupIntegrityObserved=true及filesystem摘要；backupRestoreProven=false，内部restoreProven=false。hostPreflightComplete/installedBaselineObserved/c4StorageObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。gzip完整和26h时效不等于SQL可恢复、全量VM恢复、DB业务一致性或AWS快照available；DB卷的Docker绑定观察不扩称宿主卷inode/全部C4证明。内存/系统Python与剩余就绪/DB只读前置尚未完成，观察结果不持久化成安装票据或第二版本权威。

新增20项离线模型测试：原两锁下组合只读/无写同步/秘密不输出、最新选择与坏最新不回退、旧/未来/缺备份、截断/坏CRC/空payload/尾部损坏、多gzip member完整摘要、压缩/展开/目录项预算、同名目录/FIFO/软硬链接、私有权限/只读/owner/gid、root/ubuntu/data目录权限与缺失/链接不修复、低磁盘、正常上传及余量波动不致误报、起始/块间monotonic耗尽、同字节备份替换/读中新清单、两次目录替换、原锁与晚期维护保留、默认路径不读数据/严格开关/无CLI及固定根元数据。临时真实文件/gzip/目录/锁，Docker/systemd/GitHub/root/anchor/容量为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法/unittest钩子、55个既有定义不变及唯一观察函数接线、差异/准确读回，不把前批685当本批通过。

下一步补本机运行环境/内存及剩余就绪与DB只读前置，完成主机预检收口后接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移或现场生产操作。

详见[交付合同及D2备份/目录预检](../architecture/Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_SYSTEMD_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部systemd初次安装预检，沿原两锁、来源/源码/配置/Docker双读流程，核四个有效unit、未决reload/override和旧备份unit实物；没有安装/重载/停启服务或维护marker写入。

Docker/挂载批已由[PR #3012](https://github.com/sanqin888/sanqinMVP/pull/3012) 最终head `f20ede98945ae6ea2f740804f389d59410b7ac9c` 经 [CI #7711](https://github.com/sanqin888/sanqinMVP/actions/runs/40577327857) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各664、Runtime1080、准确CPython3.12.15回归412），合并dev `ca0507f522a6bb10f982f0e0e9746a6d902a62fc`。首次CI #7710因测试夹具run覆盖unittest.TestCase.run而中断；同分支仅将模拟方法及引用改名observe_command，生产代码/门禁未放宽。下文原LOCAL/未运行或修复待核仅为原审阅时点，仍未安装/真实隔离验收。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅新增systemdObserved=true及四unit稳定属性/摘要、两备份unit原件摘要和预留门禁不存在的事实；maintenanceGatesLoaded/backupIntegrityObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。vendorUnitBytesAuthenticated/backupTimerSourceAuthenticated=false：只观察加载路径/属性及本地timer实物，未扩展到OS来源研究或宣称timer有封存Git来源。尚未核备份gzip/时效、宿主挂载目录/资源及剩余就绪/DB项，不把unit空闲当成停写/快照或恢复就绪证明。

新增21项离线模型测试，使用临时真实root模型文件/目录及原锁，覆盖组合只读/无写同步、vendor路径别名和空闲timer、load/reload/masked/未知loaded drop-in、完整override、Docker稳定状态与socket触发目标、忙碌backup与timer错误、有效用户/组/UMask/Type/单一命令/hooks、属性重复/缺失/未知/预算、service旧归档字节匹配、缺失/链接/硬链接/权限、三预留或其他/类型级/前缀drop-in残件与可信空目录、悬空本地Docker override、同字节替换/两次有效状态漂移、原两锁跨度与晚期维护、默认路径不查询systemd、严格开关/读白名单/无新CLI、固定anchor走向/元数据及共享真实pipe客户端最小环境。systemd/Docker/GitHub/root/固定anchor为模型，未实际调用管理器或运行项目测试；仅Python3.10 AST、静态名字/重复方法/禁止覆盖unittest.run钩子、43个既有定义不变、root读取主体及有界客户端主体AST等价、差异/准确读回，不把前批664当本批通过。

下一步接备份完整性/26h时效、宿主uploads/sounds/backup目录实物与资源及剩余就绪/DB只读项；全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无业务schema/迁移、现场预检或生产操作。

详见[交付合同及D2 systemd预检](../architecture/Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_DOCKER_BASELINE_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部Docker/Compose只读观察，在原两锁与来源/源码/配置双读流程内，核当前四容器角色、健康和完整身份、实际应用镜像封存digest/OCI revision，以及DB卷和持久挂载。没有安装入口、维护意图或生产操作。

本批首次[CI #7710](https://github.com/sanqin888/sanqinMVP/actions/runs/40577015596) 在默认Python离线Release套件发现测试夹具将模拟Docker方法命名run，覆盖unittest.TestCase.run，套件于该类前中断。同分支仅将夹具方法及引用改为observe_command，生产代码/门禁不变；最终修复head与CI #7711/合并记录见上文；原待核仅为修复提交前时点，不把640或静态检查当本批通过。

配置原件核对批已由[PR #3011](https://github.com/sanqin888/sanqinMVP/pull/3011) 最终head `2c785b95396dfe88bff45840f8e3d95bb6f378b3` 经 [CI #7708](https://github.com/sanqin888/sanqinMVP/actions/runs/40575133829) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各640、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `12f3f840387229a22adf62035f486bcb63ae36e4`。下文该批原LOCAL/未运行仅为原审阅时点，仍未安装或完成真实隔离验收。

结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅containersObserved/composeExpansionObserved/containerMountsObserved/currentImagePairBound=true并返回稳定观察/摘要；applicationConfigurationObserved/applicationReleaseAuthenticated/c4StorageObserved/systemdObserved、hostPreflightComplete/installedBaselineObserved/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven保持false、requiresHostRecheck=true。当前镜像仅沿原paired seal绑定，不等于全套当前main/CI/就绪证明；未核容器环境与Compose美元插值完整等价，未核宿主路径实物/资源/备份/systemd/SQL历史或公共就绪。返回结果不是第二版本权威、恢复包、停写证明或安装票据。

新增24项离线模型测试，覆盖锁内组合及秘密不输出/无写同步、当前digest声明、engine/live-restore/swarm/platform、Compose必要环境/重复/SHA/角色与镜像、额外/缺失/短/重复ID、错role/project/ID、健康/运行/privileged、实际digest/revision/image平台、API/worker同image、命令/策略、挂载目标/源/RW/额外对象、卷选项/身份、忽略健康日志但比较lifetime、双读健康替换、原两锁与晚期维护/paired seal变化、重复/非有限JSON与预算、默认文件路径不读Docker/严格开关和无CLI；客户端用真实可丢弃pipe/selectors、Popen/clock/root模型核白名单、最小环境、端点拒绝、输出超限/错误/编码/超时与仅kill自身CLI组。Docker/GitHub及固定anchor为模型，没有运行真实Docker/systemd/SSH或测试项目；仅Python3.10 AST、静态名字/重复方法、40个原定义不变及原观察函数接线审阅、差异/准确读回，不把前批640计作本批通过。

下一步补systemd有效units/override和原三外部文件事实、备份完整性/新鲜度、宿主挂载目录与资源及剩余就绪/DB只读项，全部前置满足后再接安装意图/临时拒绝门禁。准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离/生产材料仍OPEN。三组研究继续暂停、不取消；无新依赖包/业务schema/迁移或现场生产操作。

详见[交付合同及D2 Docker预检](../architecture/Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_CONFIGURATION_FILES_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部配置原件只读观察：与原17源码核对共用原job/计划锁和来源前后复核，新增.env、唯一发布state及C4标记的原字节/元数据一致性检查。只返回摘要，不写安装意图、不安装或停服务。

现役Runtime源码核对批已由[PR #3010](https://github.com/sanqin888/sanqinMVP/pull/3010) 最终head `0824f2a0e14c956673903ae911f24a252b23de07` 经 [CI #7706](https://github.com/sanqin888/sanqinMVP/actions/runs/40573749428) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各620、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `b5bdddf4dba5fe0ee06ef781619c32b03d559093`。下文该批原LOCAL/未运行仅为原审阅时点，仍未现场安装或真实隔离验收。

配置与源码在同一原两锁内经来源刷新前后双读，原字节、inode、权限、账户身份变化均阻断，即使.env/state同时变成另一组相互一致值也不能沿用旧观察。结果仍INSTALLED_RUNTIME_FILES_OBSERVED，仅增加configurationFilesObserved=true及三个文件摘要/元数据、state中的应用SHA/phase；不返回原秘密、state正文或完整环境。applicationConfigurationObserved/composeExpansionObserved/applicationReleaseAuthenticated/c4StorageObserved/containersObserved/systemdObserved、installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven均false、requiresHostRecheck=true。C4标记内容正确不等于真实卷/目录已验证，观察结果不持久保存为安装许可/恢复包。

新增20项离线模型测试：三版本身份独立与秘密不输出/无写同步、原CRLF/$/$$不变、rolled-back与两种UTC、环境重复/别名/引用/坏编码、配置缺失及无修复、state未决/不一致/坏整数/原因/时间/缺字段/重复键、C4内容、私有权限/只读/特殊位、三文件链接/硬链接、ubuntu账户/owner/gid、空/超限、同字节替换及一致配置成组变化、读中秘密变化、原锁跨度与竞争、晚期来源/维护残件、默认源码观察不读配置、严格bool与无新CLI/任意路径。临时真实文件与锁，GitHub/账户/anchor/root为模型；项目测试未运行，仅Python3.10 AST、静态名字/重复方法、37个既有定义不变及唯一观察函数接线审阅、差异/准确读回核对，不把前批620用作本批结果。

下一步接真实Docker/Compose展开、容器完整ID/镜像/挂载、备份与systemd/本机环境的只读预检；全部前置完成后再写安装意图并加载临时拒绝门禁。准确原ID停写、手动快照available/完整恢复实物、逐文件安装与成功交接、D3 Mac薄入口、D4统一真实隔离及生产材料仍OPEN。三组研究继续暂停、不取消；本批无依赖包/业务schema/迁移变更、实际主机预检或生产操作。

详见[交付合同及D2配置原件](../architecture/Runtime最小执行器工具交付与安装合同.md)。

**2026-10-27 当前进度：D2_INSTALLED_RUNTIME_OBSERVATION_MERGED_DEV / SOURCE_CI_VERIFIED / HOST_PREFLIGHT_PARTIAL / NOT_INSTALLED。**独立bootstrap新增内部只读现役源码核对：持原job/计划锁，刷新保留材料的来源与工具差异，逐字节核现役17+Manifest并重读身份。仅首次工具安装基线，已有九辅助件或Runtime目录内bootstrap（含悬空链接）要求另审，不覆盖；尚无主机安装或root CLI。

D2私有材料交接批已由[PR #3009](https://github.com/sanqin888/sanqinMVP/pull/3009) 最终head `078306e9e0dda594d283ee133129027c5832f4c8` 经 [CI #7704](https://github.com/sanqin888/sanqinMVP/actions/runs/40570561979) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各600、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `6f2378f23bfb80192f8f4f965daefccee98f8d4d`。下文原LOCAL/未运行仅为该批原审阅时点；源码CI不代表安装或真实隔离验收。

结果仅INSTALLED_RUNTIME_FILES_OBSERVED、installedRuntimeFilesObserved=true；installedBaselineObserved/hostPreflightComplete/readyToInstall/canExecute/authorizedToMutateProduction/operationSuccessProven仍false、requiresHostRecheck=true。旧Runtime sourceSha独立于当前应用SHA；不读取.env/唯一state/C4、不观察Docker/DB/挂载/备份/systemd或宣布无override。三drop-in原件/缺失事实仍待系统预检，九辅助件不存在只是初次安装冲突检查，不能充作完整恢复包或安装票据。函数只返回摘要/元数据，不保存或清理记录，不新建目录、不fsync、不停服务。

新增20项离线模型测试，临时真实文件/目录/锁覆盖旧17逐项变更、目标字节冒充旧字节、Manifest错值/布尔/重复键及原排版、缺失/超限/空文件、目录/文件/悬空链接和硬链接、权限/owner/gid/root、已有辅助件/安装器冲突、同字节换inode/读中改写/目录换位、晚期来源/保留原件/维护/job变化、两原锁覆盖及竞争、缺失身份不建目录、无写入/同步和无CLI。GitHub/root身份与固定anchor为模型；未运行项目测试，仅Python3.10 AST、静态名字/重复方法、原函数等价及差异/读回核对，不将前批600用作本批结果。

下一步补.env/唯一state/C4、实际容器完整ID/镜像/挂载/备份及systemd/本机运行环境预检，全部前置满足后才接安装意图/临时拒绝门禁；后续准确原ID停写、手动快照available与完整恢复实物、逐文件安装及成功交接、D3 Mac薄入口、D4统一真实隔离和生产材料仍OPEN。三组研究继续暂停、不取消；无依赖/业务schema/迁移、现场预检或生产操作。

详见[交付合同与当前D2进展](../architecture/Runtime最小执行器工具交付与安装合同.md)。

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

> **2026-10-26 当前源码进度：SUCCESS_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**前批由[PR #2988](https://github.com/sanqin888/sanqinMVP/pull/2988) 最终head `6ca86a55d1aadef814f37d97d9f999212f55608f` 经 [CI #7658](https://github.com/sanqin888/sanqinMVP/actions/runs/40427556642) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各234、Runtime1080、准确CPython3.12.15回归412），合并dev `d87c98b50582fc2ff58165921926433d4710776b`，首次CI #7657测试夹具缺COMPOSE已最小修复。本地新增成功交接：目标.env/唯一ACTIVE/原策略逐项核验，最后HANDOFF_COMMITTED→clear；ACTIVE+维护记录仍是未完结交接/事故，末尾clear未知可能已营业，不能重跑或自动回退旧盘。新增21项离线测试未运行，八helper待统一验真安装；任务/CLI尚未贯通，SQL/回退/联合status/隔离/安装/真实发布仍OPEN，见[当前成功与未知边界](../architecture/Runtime最小更新执行器实现方案.md)。本批未推送/安装，无真实Docker/HTTP/SQL/AWS，固定17成员/现役文件不变。

> **2026-10-26 当前主线：**依用户决定先完成[最小更新执行器与暂停恢复计划](../architecture/Runtime最小更新执行器与暂停恢复计划.md)，以 MacBook/SSH 上“预检一次、确认执行一次”恢复正常代码更新。C1 来源/输入固定/受保护加载、自建 CPython 3.12.15 及完整依赖证明、R2 离机 CAS/CA/CRL/Enrollment/可信时间/跨克隆防护均 **PAUSED_NOT_CANCELLED**；待最小执行器完成且真实发布成功后复审继续。下文描述现役发布器与原高保证路线，不能据此把三项暂停工作重新设为最小执行器前置；现役校验未改，新执行器/工具过渡未完成，本批无部署或生产放行。

原高保证路线进度：已有源码/合成证据按各 PR 原范围保留；仍缺正常执行基线、持续维护、代码快照及真实 AWS 替代恢复组合，C5-G2 NO-GO。当前先完成顶部最小执行器计划，三组暂停工作保留 OPEN；其历史 R1–R5 未完成项不能被误记为最小执行器已经实现/部署。

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](../architecture/Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。

本文汇总截至 2026-10-17 已提交仓库中的发布合同和历史现场证据，不替代操作前对真实主机、已安装源码版本及备份状态的重新核实，也不构成生产变更授权。

## 已记录的现场事实与尚未完成的工作

| 项目 | 仓库已记录的事实 | 限制与后续门禁 |
| --- | --- | --- |
| Runtime / 数据路径 | C4-P2-C 已记录 `/opt/sanq/runtime`、`/srv/sanq/uploads`、`/srv/sanq/backups` 的实际切换 | P2-D 区分有限范围验收与完整服务冷恢复，不能把路径切换等同完整灾备验收 |
| 已安装 Runtime | U1 记录已安装 root-owned Runtime source `a84b72007e6b4e82c981101e56c897355757c0ff`，当时应用镜像已前进到 `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8` | 这是历史现场证据，本文未重新读取主机；Runtime source SHA 与应用 image SHA 是不同身份，不能互换 |
| 应用发布 | 已记录 checkout-independent GHCR 发布与人工 `PENDING → ACTIVE` 对账 | 曾出现启动 readiness 竞态；其源码修复不等于已更新受保护的生产 Runtime |
| 惰性 staging | C5-B2A 使用外部发布的原始 Archive SHA256 验证及暂存，不要求本地 main 源码逐字节比较 | staging 不安装、不执行、不授权生产写入；其 newest-release 规则不能替代历史版本真实性验证 |
| Runtime 更新与恢复 | 已批准代码生成 AWS 手动快照 + 拍快照前容器 no/停服/持续禁入，失败由本次准确快照创建新实例 | 尚未实现/验收；成功按原策略恢复，事故保持冻结。旧 Kit 自举退出必做；设计/CI 不等于生产权限 |
| 旧生产 Git checkout | 目标是解除生产依赖后退役 `/home/ubuntu/sanq-app` | 未完成全部部署/回退、备份、MCP、进程及挂载依赖验证前不得删除；删除必须独立授权 |

事实来源：[C4 路径切换记录](./runtime-backup-cutover-c4-prep.zh-CN.md)、[P2-D 有限范围验收](./runtime-backup-cutover-c4p2d-acceptance.zh-CN.md)、[U2C 历史现场证据](../architecture/Runtime历史决策与证据索引.md#u2c-evidence)、[启动竞态与 Runtime 激活门禁](../architecture/c5-startup-readiness-race-2026-10-09.md)。

## 应用发布合同

- GitHub `main` push 的权威 CI 成功后，`publish-images` 才发布同一完整提交 SHA 的 API/Web 镜像；Uber worker 使用同一 API 镜像。成对发布证明必须包含两个实际 digest；不得用可变标签、单个镜像或未经证明的历史标签替代。
- 生产只拉取经过证明的应用镜像，不在 VM 构建，也不顺带刷新 DB 镜像或重建 PostgreSQL。Compose project 保持 `sanq-app`，DB volume 保持 `sanq-app_pgdata`，API/worker 共享 `/srv/sanq/uploads`，公共 sounds 路径保持不变。
- `.env` 中的 `SANQ_IMAGE_SHA` 是应用 SHA 的单一配置来源；发布状态另记在受保护的 `.sanq-release-state.json`。更新 SHA 不得重写其他配置、泄露凭据或改变 `.env` 的 UID/GID 与限制性权限。
- 应用镜像可以独立前进，仅限已安装 Runtime 的校验、GitHub 来源/祖先关系及 Runtime Bundle 成员无变化等既有条件通过。Runtime 文件变化或比较不完整时阻止发布，先完成独立审阅的 Runtime 安装；不得直接覆写控制器或修改 Manifest 掩盖不一致。
- 变更前核对已安装控制器版本、Runtime Manifest/文件、C4 marker、当前镜像 digest、真实 DB/uploads 挂载、readiness、维护窗口和备份。控制器的本地 DB 备份检查包含不超过 26 小时及 gzip 完整性；操作员仍须独立确认离机备份和恢复可用性，不能仅凭本地文件通过。
- 发布只重建 `api`、`ubereats-worker`、`web`，以 migration parity、容器健康、本地/公网 Web、BFF/API、worker readiness 和公共菜单 smoke 作为完成证据。容器启动不等于部署成功。
- 控制器不自动调 sudo。生产执行、停写、发布和迁移均须明确授权；不新增常驻部署服务、自动拉取、镜像清理、开放 sudo 或新生产目录写权限。

## Prisma 与失败恢复合同

- 候选镜像报告完整且可识别的 clean migration status 时跳过迁移。严格识别的 pending-only 集合默认阻止；只有独立审阅全部 SQL、备份、兼容/数据保留和维护方案后，才可明确授权既有 `--apply-migrations` 路径。未知输出、drift、失败迁移或历史不一致继续阻止。
- `--apply-migrations` 不负责判断 SQL 是否具有破坏性，不适用于 plan/rollback。授权 pending 路径先持久化 PENDING，再停止应用写入者（不停止 DB）、执行候选迁移、确认 parity 后推进应用状态；无 pending 时不为该标记额外停写或迁移。
- 发布或 readiness 失败保留 PENDING，先保存证据并人工处置；不自动回滚数据库、推断财务结果或把迟到成功改成失败。
- 手动 rollback 仍需明确批准、受信任且可用的 previous 本地镜像、备份及 previous-image migration parity。历史 digest/无 checkout 回退验收尚未完成时不得声称回退闭环；不自动拉取未知历史镜像或反向执行 schema 迁移。
- Runtime 更新使用 [AWS 快照与维护冻结方案](../architecture/Runtime更新-AWS快照与维护冻结方案.md)：拍快照前准确容器 no/停服/禁入，代码等本次准确快照 available 才安装；故障保持维护，人工确认快照→新实例。成功按原策略恢复；业务放行后的新写入/支付未知转独立 DR/向前修复。普通重启不是强制恢复触发条件。
- 不执行 `migrate reset`、`db push`，不删除数据卷、备份、Uploads、VM 快照或历史迁移。

## 当前详细入口

- [最小更新执行器实现方案（范围、流程、四批与完结条件）](../architecture/Runtime最小更新执行器实现方案.md)：基于 PR #2978 合并后 dev343fefc7 的本地方案；未实现/未部署。
- [当前优先级与三组研究暂停恢复规则](../architecture/Runtime最小更新执行器与暂停恢复计划.md)：暂停、不取消，正常代码更新恢复后复审继续。

- [Runtime 交付与安装约束](../architecture/Runtime交付与安装约束.md)
- [Runtime 历史决策与证据索引](../architecture/Runtime历史决策与证据索引.md)

- [应用发布与迁移状态解析、旧 Launcher 退役记录](../architecture/postmod-ghcr-deploy-simplification-2026-10-08.md)
- [惰性 Archive staging 约束](../architecture/Runtime交付与安装约束.md#staging)
- [固定布局与外部消费者约束](../architecture/Runtime交付与安装约束.md#layout)
- [G2 当前可信 Runtime 合同与未完成门禁](../architecture/c5-g2-trusted-runtime-contract-2026-10-13.md)
- [旧 Recovery Kit 的替代关系与历史证据](../architecture/c5-u2d-abort-clean-reinstall-recovery-kit-2026-10-11.md)
- [源码 checkout 退役依赖与独立删除门禁](../architecture/postmod-ghcr-source-retirement-phase2-2026-10-08.md)
- [备份恢复手册](./backup-recovery.zh-CN.md)

各日期化方案只证明其注明时点的设计或验收。冲突时，先区分源码能力、准确已安装版本、历史现场证据与待验收事项；不能直接把较新的源码描述当作生产已部署事实。
