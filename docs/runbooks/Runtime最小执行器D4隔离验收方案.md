# Runtime 最小执行器 D4 隔离验收方案

> **2026-10-30（America/Toronto）｜D4_PLAN_MERGED_DEV / VM_NOT_BOUND / INSTALL_ADAPTER_OPEN / NOT_EXECUTED / RESTORE_VALIDATION_DEFERRED。**本文件是第三批内部D4的执行前审计与固定验收方案，不是现场授权、执行脚本或通过回执。生产过渡仍属第四批。

D4方案已由[PR #3058](https://github.com/sanqin888/sanqinMVP/pull/3058) head `686a70f8ec2c2598ad6cd73189fb195b2e0d4a72` 经[CI #7811](https://github.com/sanqin888/sanqinMVP/actions/runs/41066304814)SUCCESS（文档范围：1成功/9跳过，未重跑Release/Runtime测试）合并dev `8f0b6f11a8b61b0f83a4888764e15b2da5642998`。

## 当前结论与准确基线

Mac入口批[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292` 后，以该准确源码树作为本方案审阅基线。源码/CI通过、隔离验证、生产安装和最终交付分别记录；任何一项都不能代替下一项。

前序Mac入口批[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)最终head `6b8d1e77cfef23228160021b37779e4eed2a3c48` 经[CI #7809](https://github.com/sanqin888/sanqinMVP/actions/runs/41054754179)SUCCESS（4成功/6范围跳过；两条Release各1416、Runtime1080、既有C1回归412），已合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292`，无需CI修复；无生产/AWS操作。

本轮只读核到：GitHub main在观察时为 `d3a896f32f1db71e49433f9e87bef534e27589bb`，与PR初始head `6b8d1e77cfef23228160021b37779e4eed2a3c48` 的compare元信息为diverged、ahead103/behind1。该数字仅说明分支关系，不用compare文件清单证明材料完整、来源通过或可直接晋级。main和目标发布必须在实际准备前重新按准确对象核验，本批不自动合main或触发发布。

### 四项必须先落实的前置

| 前置 | 已有能力与实际缺口 | 解除条件 |
| --- | --- | --- |
| G1：准确隔离目标 | 本次尚未核到并绑定新的隔离实例；当前连接提供生产只读与代码工作区，不能默认复用它作故障试验目标 | 填齐下表目标事实，独立核SSH主机key与AWS对象，确认无生产流量/凭据/真实外部写入 |
| G2：准确可验材料 | D1仅接受合格的准确main来源/成对发布/原Runtime归档；dev CI或kit自报hash不是替代物 | 用户控制main晋级后固定S_tool、发布/CI/Archive及完整Git对象；固定真实应用候选S1/S2和SQL/兼容审阅对象 |
| G3：首次安装受控入口/监督 | install_minimal_executor.py的pack/verify/plan/retain材料入口已合dev并经源码CI；manager身份观察已合dev并经CI；本地仅新增原件关联模型、尚待CI；_complete_installation及快照双帧/离机确认仍为私有能力，未有首次安装专用transient提交/独立失败收尾入口 | 在既有bootstrap内交付有限适配及故障模型、最终CI，再审准确root读写/manager/通道与失败方案；不能临时用python -c/任意导入/nohup绕过这些检查 |
| G4：隔离就绪请求目标 | 安装器六端点含127.0.0.1与固定https://sanq.ca；新VM直接运行可能把生产200误作隔离结果 | 准确审阅隔离TLS/解析/路由与外部调用阻断，证明每个请求到隔离目标；不能改生产DNS/切流、跳TLS或借生产响应补通过 |

受控入口可以是经审阅的一次性适配，复用现有私有函数，不要求另造通用公开安装API。问题是尚未落实监督、来源/目标和通道的完整调用边界，不是函数名称带下划线就不能使用。

G3不是普通发布任务的缺口：release_task.py已有固定sanq-release-apply-<plan-id>.service、Restart=no、ExecStopPost及manager PID/cgroup检查。它不能直接当首次安装监督器，因为bootstrap运行在工具交接之前/之中，不可依赖尚未完整安装的release_task/guard，也不能根据目录里任意旧writers.json发root命令。

首次安装现有_installation_application_ownership仅捕获Python异常，不能捕获SIGKILL或主机故障。准确原策略恢复后，运行中的daemon可能重启应用；最后清marker后，失败也不保证marker仍在。必须按这两个已知窗口补独立收尾及实际中断测试，不把“门禁存在”“发过stop”或FENCE_UNCONFIRMED当停写证明。这是原安装/失败保持目标的未完成适配，不新增CA、可信时间或常驻控制服务。

## 目标与材料登记（当前全部待现场填写）

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

在G1–G4未齐前，仅准备材料与只读版本/对象核查，不发安装、停容器、改策略、reload、杀进程、重启或SQL写入。当前没有提供可直接执行的安装apply命令；后续适配交付后再按准确参数登记。

## 固定执行顺序与证据

1. 先完成四项前置及准确操作范围审阅，锁定S_tool、B0、应用候选和目标实例。真实测试均从可辨认的干净基线开始，不在未知残件上重试。
2. 先只读预检与拒绝场景，再一次正常旧→新工具安装。每次写入故障/主机重启用独立可丢弃试验基线；不要把上一条事故的现场清理后冒充同一轮恢复成功。
3. 安装通过后，验证普通无迁移发布、真实增量SQL、连续双发布和兼容镜像回退；SQL批准及回退兼容批准各自绑定准确计划。
4. 最后执行SSH断线、并发、SIGKILL、Docker socket/daemon/VM重启和交接中断。每条都核实际对象，不只看日志/退出码。
5. 汇总真实结果、未处置现场及第四批生产材料；没有足够证据的项保持NOT_RUN/UNKNOWN/BLOCKED，不自动扩大范围或重新启用暂停研究。

证据目录放在操作者私有位置，不进入git。每个case保留：case-id、准确源码与目标、前置/注入时刻、实际argv/时间与退出码、unit/PID/cgroup、marker/intent/writers/completion等原件hash、前后容器/策略/DB/卷/挂载和唯一state观察、HTTP实际路由及返回、原始日志位置、结论与未决项。原件可能含配置/数据；仓库只收脱敏总结与摘要，不收.env、私钥、业务数据或恢复tar。

UTC只作审计时间，不作为可信时间证明。不要为演练新增证书权威/离机CAS服务；如需一次性隔离TLS夹具，应单独标其边界，它不能证明真实Cloudflare公网路由。公网端到端证据不足的项保留OPEN，第四批实际生产路由另验。

## 验收矩阵（当前均NOT_RUN）

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

## 本地待审：任务与原件关联模型

**INSTALL_TASK_ORIGINALS_MODEL_LOCAL / CI_PENDING / INSTALL_ADAPTER_OPEN / NOT_INSTALLED。**

基于PR #3060合并dev `f98e4f293f4f64e8e87df360f9f401eb0bbae9d6` 创建 `feat/runtime-install-task-originals-20261030`，在既有bootstrap增加任务与原件关联的惰性字节模型及准确核对。严格核本次run观察字段/native bool、sourceSha、retentionId、固定unit和非零InvocationID；复用原intent/writers解析与摘要绑定，拒绝另一材料、源码、安装ID、运行代次或改动原件。

规范JSON关联包含schemaVersion=1、独立kind、源码/材料/安装/unit/运行代次、intent/writers两摘要，installationComplete/canExecute/restoreProven始终false。核对只接受本次上下文和两原件重新计算出的准确字节，拒绝重复/额外字段、非规范编码或成功声明。它不证明上下文新鲜、来源可信、原件已经耐久存在或磁盘归属；不提供任何执行许可。

当前只有内存模型，未新增持久文件/安装schema写入、未接安装回调、未提交unit、不扫描/收养事故记录，也不执行Docker/systemd/SQL或清marker。未来必须在完整来源FD上下文、准确manager新鲜核对及原两锁内，接线原件耐久交接与独立收尾；本模型不能独立作为SIGKILL安全、成功后跳过收尾或resume依据，G3仍OPEN。

新增8项测试定义，复用惰性原容器事实夹具，核准确双摘要、严格上下文、错源码/材料/unit/运行代次、intent/writers变化、非规范/重复字段/伪造成功及输入预算。新增源码/测试Python3.10 AST、符号表与静态差异核对完成；MCP-workspace不运行lint/build/test，8项测试待本批CI，未提交/推送。

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
