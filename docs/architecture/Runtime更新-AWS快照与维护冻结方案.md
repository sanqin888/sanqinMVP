# Runtime 更新：AWS 整机快照与维护冻结方案

**状态：DESIGN APPROVED / DOCUMENTATION DELIVERY AUTHORIZED / IMPLEMENTATION NOT STARTED / AWS ACCEPTANCE NOT RUN / C5-G2 NO-GO。**
**批准日期：**2026-10-18（America/Toronto）；用户明确批准“采用这两个方式（AWS整机快照+docker容器在更新前改为不自动重启并生成快照），更新现有文档”。
**本批基线：**`origin/dev@a76d526592b7a46e4659f485a3089d753e267b3c`；分支 `docs/runtime-aws-snapshot-recovery-20261018`。本批只更新文档；用户于 2026-10-18 明确授权提交远端，按功能分支→dev PR→最终 head CI 全绿→合并交付。没有 AWS/IAM/Guest/root/生产执行授权。同步保留共享工作区已提交的 C2-CHANGE-02 文档 `4eabfa2b16d0306e6c43bfc4e8ca0f586fb0b44b` 的既有规则/复核登记；这不是本批新实测，也不宣称该提交已合并远端。

## 1. 两项已批准变更与替代关系

| 决策 | 现行要求 | 被替代的更新必做项 |
| --- | --- | --- |
| RUNTIME-SNAPSHOT-01 | 本次更新进入持续维护停写后，由受限更新协调程序调用 Lightsail API 创建唯一手动实例快照；等待 `available` 并核对来源、覆盖磁盘和本次事务，之后才开始 Runtime 活跃写。更新中断/失败经操作者确认，用这份准确快照创建独立替代实例 | 不再为同一次 Runtime 更新强制另做 crypt/Drive mandatory preinstall Kit、下载解密双原 Archive 后的故障主机自举 clean reinstall |
| MAINT-RESTART-01 | 拍快照前记录原策略，临时将准确范围内现有容器的 restart policy 改为 `no`，停止业务容器，并禁用可重新启动它们的真实入口；停用状态及恢复清单必须进入快照且跨重启有效。成功后按记录恢复，恢复实例仍先维护再放行 | 不依赖 `always` 下的单次 stop，也不将 `unless-stopped` 当作本批选定方案；不永久取消生产自动恢复能力 |

两项变更更新 [R0](Runtime更新-R0冻结设计.md) 的 D2/D3/D4/D5 相关执行方式与 C4–C7 验收；D1 对正常更新执行器、目标发布包和实际平台的来源验证继续有效。C2-CHANGE-01（PR #2863）的“指定快照→新实例”恢复机制继续有效；它未自动通过真实 AWS 恢复验收。

本文件是这两项变更的操作合同。与旧 Kit/原事务恢复文字冲突时，以本文件及更新后的 R0 为准。旧源码、lab-only guard、合成清单、原始证据和已登记的有限 PASS 保留，不因文档变更被启用、删除或升级状态。

## 2. 恢复材料分工

- **每日定时备份保持：**既有 DB、Uploads、配置、TLS、roles/凭据 escrow 等备份与保管要求按各自真实状态继续；日常备份健康仍是更新前置。S2 新 daily 扩充继续后置，未部署状态不变。
- **本次更新专用备份：**AWS 整机手动快照承担主要恢复点；代码创建的“手动快照”不要求人去控制台点按钮。不重复强制再打一套同用途关键数据包或再实现旧 Kit 传输链。
- **轻量恢复清单：**在故障 VM 外记录账户/Region、源实例 ARN、快照 ARN/名称/时间/磁盘、事务 ID、已安装/目标 Runtime SHA、原应用 SHA/digests、状态/挂载摘要、原服务/容器策略、维护状态、API 操作 ID 和独立验证结果。保留现有凭据取回路径；secret、私钥、token 和原始配置不进 Git/聊天。
- **新版本发布资料：**目标 Runtime 原 Archive、准确 main SHA、CI/publish proof、配对镜像 digest 和 17+Manifest 验证保留。AWS 快照不能替代“准备执行的新代码”的来源校验。
- **旧版来源：**拍快照前确认当前安装完整性/健康/版本，建立其与准确 AWS 恢复点的关系。整机恢复不再要求故障主机先取回旧 tar.gz 或运行一个独立 Python 自举恢复器；相关历史 verifier 留作辅助，不自动成为每次云恢复的必做链。

AWS 控制面和受控账户权限属于已批准 D1 的信任前提。快照 ARN 不是 tar.gz SHA256，也不虚构整盘摘要、独立数字签名或 WORM。若有外置盘/远端存储未被该快照覆盖，必须明确对应恢复资产及同一恢复点策略；无法覆盖关键数据则阻止更新。

## 3. 操作分工与实现边界

**推荐实现分工：**故障 VM 外的协调程序负责受限 AWS API、快照身份和恢复记录；经准确授权的生产侧执行器负责维护与 Runtime 安装。由代码创建快照、等待和核对是已批准的实现方向；恢复切流仍须操作者确认。精确执行位置、认证方式、最小 IAM、命令/对象和独立管理通道在实现前审阅；本文件不创建账户权限、不在 VM 放长期 AWS 密钥。

正常更新只安装所审 Runtime，不变更应用发布 SHA、DB schema/卷、Uploads 内容或业务协议。暂停/恢复容器和任务是本次维护合同的一部分，不能再引用旧“安装器绝不操作 Docker/service”文字将它排除；必须限制为清单内准确对象，禁止任意命令/路径或放宽 MCP sudo。

**不得临时手改已认证 `/opt/sanq/runtime/docker-compose.yml` 来实现 restart:no。**该文件属于固定 17 成员/Manifest。维护程序应控制现有容器的实际 restart metadata，以及 systemd/cron/Compose 启动入口；记录预期 Compose/容器 ID。任何 recreate、外部 `compose up` 或新容器都可能重新带入原 `always` 策略，必须被维护入口阻止并持续复查。本批不修改 Compose、代码、17 文件、依赖、CI 或 sudoers。

## 4. 更新状态与准确顺序

以下为待实现状态合同，不是已可执行脚本；不与应用 release-state 的 `PENDING/ACTIVE` 混用。

1. **PREFLIGHT：**核对实际生产 OS/kernel/arch/Python/loader、Docker/Compose、内存/磁盘/FD 预算、卷与 bind、当前安装/应用/备份健康、无未明事故；验证目标发布和向后兼容。先确认保留的管理通道与外部协调记录可用。
2. **MAINTENANCE：**阻止新下单/支付发起/后台业务写入，排空或明确隔离在途任务；按真实清单暂停 worker、backup timer/service/helper、Messaging、deploy/Compose/MCP 生产调用和可重新启服务的入口。已发往外部的支付/订单可能仍完成，必须有独立事件保留、重放/权威对账安排；未知资金结果不能强制结案。
3. **FROZEN：**在策略变更前持久化原容器 restart policy、容器/服务身份、enabled/active 与任务状态，并离机记录；将批准容器实际策略设为 `no`，正常停止、确认无残留写入者。形成并记录 DB/文件一致恢复点；首版采用经批准的正常停止相关服务/数据库路线，或另证一致快照方法，不擅自强断电。维护停用状态跨 daemon/VM 重启必须有效，包含各启动入口，系统/SSH 管理入口仍可用。
4. **SNAPSHOT_PENDING：**针对批准账户/Region/源实例与唯一事务名调用 `CreateInstanceSnapshot`，记录操作；用 `GetInstanceSnapshot` 核对准确对象、fromInstanceArn/name、时间、覆盖磁盘和 `state=available`。请求返回 200、只看到名字或旧快照同名均不够。调用超时/结果未知先按准确操作/对象查询，不盲目创建多份或选 latest；碰撞/来源错/失败/超时无合格快照则不安装。
5. **SNAPSHOT_READY：**快照与故障 VM 外轻量清单均完成，预先在同平台/AWS 隔离环境证明此类恢复可用；再复查整个冻结窗口未破坏。自动快照不能替代本次准确手动快照；不自动删旧验证集。
6. **UPDATING：**只由准确受信任执行器安装目标 Runtime。正常安装的 FD/权限、候选、同设备交接与持久化校验继续；不得靠放宽旧 lab guard 开启生产。快照之后至最终放行业务前，持续停写，不并行应用 rollout、迁移或密钥/配置变更。
7. **VERIFYING：**先验证完整文件/Manifest、动态 bytes/owner/mode、原应用/卷/Uploads 与外部安装件兼容。需要启动服务做健康检查时仍保留业务入口/后台副作用/出网屏障，只做准确受控启动并记录当前策略，不能借健康启动提前接单。冻结被破坏、外部状态不明或原状态无法核对即 INCIDENT。
8. **RELEASED：**全部验收及必要外部对账成功后，按清单恢复原 restart policies 与原任务状态，受控启动并独立复查服务/路由/单写者，最后放行业务。恢复失败不标成功；不要一律 enable/start，也不要永久将所有生产容器设为 no。
9. **INCIDENT：**活跃更新已开始、是否写入未知或验收失败时，保持维护、不自动恢复写入。记录事故并由操作者决定准确快照→替代实例恢复；旧 journal 不 replay。仅在已独立证明活跃树未改、原状态完整且单独允许取消时，才可在受控核对后退出维护；禁止 `finally` 无条件启动一切。

快照未成功前不得发生 Runtime 活跃更新；维护策略/合成标记等前置写与 Runtime 安装写必须分别登记。快照包含“业务停止、restart=no”的状态和原策略清单，而不是正常营业态。故障机以外也必须能取得恢复记录，不能只写在将损坏的 VM 里。

## 5. 故障恢复与保护窗口

- 精确选择本次已验证手动快照，在 AWS 创建**独立替代实例**；保留故障实例和原证据，先 fence 原机写入/worker，防止复活双写。不是原机磁盘回退，也不续跑原 Runtime 安装事务。
- 新实例启动后仍是快照内的维护态；验证所有准确容器 `restart=no`、启动入口/任务禁用与管理通道。不能只靠未转移 Static IP 或关闭公网防火墙；Lightsail firewall 不控制全部出站/私网流量。
- 核对恢复点来源与可用基线、Runtime/应用身份、DB/WAL/卷、Uploads、配置权限、机器身份、TLS/roles/凭据取回、backup/MCP/tunnel、恢复清单；自定义 firewall、Static IP/IPv6/DNS/Cloudflare 作为外部资源单独恢复，不能假定随盘复制。
- 仅在准确数据恢复点、外部付款/订单事件和后台去重核对完成后，由操作者确认恢复原策略、受控启动与切流。AWS 新实例部署/切流仍需对应具体授权；不是失败超时就自动换机。
- **保护窗口是快照形成后至业务重新放行前。**窗口内完整持续停写，才可用本次快照作为更新失败的主要回退点。业务已放行后出现的新订单/付款/上传、密钥变化或未明写入不能直接回退；转独立 DR/向前修复与外部对账方案。
- 恢复自身再次失败/中断：新事故、新对象/新操作审批，旧资料保留；不回放旧更新 journal、不覆盖故障机或上一个替代实例。
- 日常/长期 DR、snapshot 丢失/账户或 Region 不可用仍依赖已有独立备份/escrow；不据此承诺零损失、固定 RTO 或已验证物理掉电持久性。

## 6. 现行验收与证据复用

| ID | 必验行为 | 拒绝/通过边界 |
| --- | --- | --- |
| S01 | 准确生产/同平台清单与目标包来源 | 平台、发行来源、安装/应用/存储不符即阻止；保留正常更新执行器来源与权限验证 |
| S02 | 原容器/任务策略可靠记录、设置 no、正常停止 | 记录先于改变；错误对象、不完整、未排空即阻止 |
| S03 | 冻结跨 Docker/VM 重启且不会被 Compose/任务绕过 | 快照恢复首启仍无业务容器/worker/定时副作用，管理通道可用；单次 stop 不算通过 |
| S04 | 自动创建本次准确快照并等 available | 覆盖实例/Region/盘、冲突、拒绝权限、失败/超时/不明结果；无合格快照绝不安装 |
| S05 | 清单离机可取回、快照保留与来源绑定 | 故障机不可用仍能由受控账户定位；不接受旧/错实例快照或猜造 hash |
| S06 | 持续冻结下正常安装与完整独立复验 | 同一候选、同平台、准确 17+Manifest/动态状态/卷/外部副本一致，无隐藏 rollout |
| S07 | 准备/策略/快照阶段失败 | 未发生 Runtime 活跃写；精确错误/原状态记录，不自动取消维护或删唯一恢复点 |
| S08 | I1–I5 更新/验证窗口中断 | 旧事务 ABORT、维护保留；准确快照→新实例恢复，不执行旧自举 clean reinstall |
| S09 | 真 AWS 新实例恢复、首启冻结及恢复点证明 | 指定对象、恢复点来源链/选定版本与数据/策略对照；VirtualBox 克隆/合成 HTTP 不是 AWS 控制面验收 |
| S10 | 恢复失败/再次中断 I6 | 新事故、不重入旧事务、不覆盖唯一资产；维护和单写者不失效 |
| S11 | 成功恢复原策略、受控启动和最后放行 | 兼容原 enabled/active；恢复失败拒绝关闭，旧机不双写 |
| S12 | 快照后意外写入/外部未知态/放行后故障 | 不直接回退并猜测资金终态；保存事件并进入独立 DR/向前修复 |

C2 指定快照→新实例机制与所属 B2B2 最新 N-01–N-07 证据合同保持；先复用现有来源链与有限 A/B 原件，不因旧 marker 缺失默认重演。同一轮真实 AWS 隔离验收可共同提供 C2/S03–S05/S09 等证据，不能强迫重复做内容相同的演练。当前 C2 尚未关闭，既有 clone/HTTP 观察、历史 rc/来源 witness 等限制按最新独立复核保留准确范围。

H06/H07/H08、FD/来源/权限/Archive 合成检查和现有 CI 可按原范围复用；只有影响到的代码、平台、合同或真实组合缺口补验。旧恢复自举器的专用 Python/ELF 重建/消费闭包不再为 AWS 控制面恢复设置重复门禁；正常更新所执行的新代码仍须按准确来源/平台验证。现有模型若不参与最终实现，不为“全部做过”而额外部署。

原 mandatory crypt/Drive preinstall Kit 的 create-only 适配、双旧/新 Archive 解密取回、故障 VM 上 same-version clean reinstall 验收退出本次更新关键路径；没有被标 PASS，源码/历史材料保留。S1 和 S2 daily 扩充继续各自后继审阅，不删除长期独立备份。

## 7. 下一批及批准边界

下一批先冻结真实生产清单、准确 AWS 认证/最小权限、协调器/生产执行器接口、可跨重启的维护动作表和轻量清单；设计状态/恢复持久化位置与失败分类，然后实现、合成测试和同平台 AWS 隔离验收。不得继续套用旧 R3 Kit/旧 R4 故障自举任务，也不以本次文档批准开放任意 root/AWS 写入。

本批没有部署代码、改变 `restart: always` 的现行 Compose、创建快照、停止业务、改 IAM/凭据/CI/依赖/Prisma。新功能的首次远端交付仍按 AGENTS 审阅流程；生产/云/实例/策略变更按准确对象授权。C1–C8 无门禁因设计批准自动关闭。

## 8. 官方接口与依据

- [CreateInstanceSnapshot](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_CreateInstanceSnapshot.html)：程序创建手动实例快照。
- [GetInstanceSnapshot](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_GetInstanceSnapshot.html) 与 [snapshot state](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_InstanceSnapshot.html)：available/source/Region/覆盖盘核对；请求成功不等于快照完成。
- [从快照创建新实例](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-create-instance-from-snapshot.html)：替代实例，支持同级或更大规格；自定义 firewall 不自动复制。
- [快照保留](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-keeping-automatic-snapshots.html)：自动快照滚动且随源删除，手动快照另保留；本次不自动清理。
- [Docker restart policy](https://docs.docker.com/engine/containers/start-containers-automatically/)：no/always/unless-stopped 的不同语义；独立启动入口须另控。
- [PG15 一致快照与 WAL](https://www.postgresql.org/docs/15/backup-file.html)：数据库/文件一致性不能从可启动或 available 推断。

