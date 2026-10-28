# Runtime 手动快照内容核验合同

状态：CONTENT_REVIEW_CONTRACT_LOCAL / NOT_IMPLEMENTED / NOT_INSTALLED。2026-10-28。
本合同续接有界输入，定义下一段源码的核验边界；不将已有输入接收结果升级为 RECOVERY_READY。

## 基线与源码审计

已 fetch 核对，工作分支 `docs/runtime-snapshot-content-contract-20261028` 的 HEAD 与最新 `origin/dev` 均为 `d6484c6d7216c32bacd9eb36a980296a25ed2152`。本批接续已有未提交文档，不混入下一段执行器源码。

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

独立目标材料必须说明操作者核对的账户、区域、实例 ARN/名称、已验证的 SSH 目标/主机密钥及核对方式，绑定本轮停写前观察；实现时在原 observation 中明确承载并重核这些事实，不能只加入无原件的摘要。当前 observation 尚无这些字段。该人工绑定不是云签名证明，也不能事后补写旧意图、修改旧 schema 记录或从 reply 倒灌目标。

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

1. 先实现停写前的独立目标绑定及固定路径设备/挂载观察，明确系统盘范围及完整 DB/WAL/表空间覆盖。字段/身份缺失、同名不同 ARN、路径分盘、隐藏 WAL/表空间和源数据不一致均须有拒绝测试。
2. 再在现有单次输入内核快照字段、challenge 关联、人工核验声明及创建顺序；声明属于人工操作证据，不能标成服务端来源认证。覆盖 `all` 可用区、错区域、缺失/空/非空磁盘清单、错误字段类型与时间格式；默认保持所有安装许可为 false。
3. 设计并实现本轮核验回执的独占耐久保存与读回、离机索引及恢复前置门禁，再接 RECOVERY_READY。失败不补写、不重放、不自动开启业务。不得改变原 PRIVATE_FILES 四材料或手改 Manifest；不把“回执已保存”单独当成整套恢复验收完成。
4. 通过 CI 后，在 D4 统一真实隔离验收中验证准确 AWS 对象、真实根盘/挂载、完整集群恢复、SSH/TTY、超时、中断和恢复。未完成这些步骤前，不能标记为生产可用。

这一步先完成可审阅合同及实施顺序；目标绑定、存储观察、快照实质核验和耐久回执均尚未实现。既有 17+Manifest/250/300、唯一应用 state 和三组研究暂停决定保持。本批无源码、依赖、业务 schema/迁移、生产预检、停写、安装或 AWS 操作。
