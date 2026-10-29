# Runtime 最小执行器恢复前置证据合同

**2026-10-29（America/Toronto）｜RECOVERY_MATERIAL_REVIEW_LOCAL / REAL_RESTORE_EVIDENCE_OPEN / NOT_INSTALLED。**

基线为PR #3046合并dev `335cb5b1a117716f993b22e3dcec03edda12d1b6`，本地分支 `feat/runtime-minimal-recovery-material-review-20261029`。本批完成材料关联审计和证据边界；没有执行恢复、创建AWS对象、改生产停写范围或取得真实验收结论。所属任务仍为最小执行器第三/四批，不另建长期平台研究。

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

## 五组真实恢复前置证据

下列ID对应当前源码requiredEvidence，均OPEN。它们是证据要求，不是可以导入自报PASS的接口。

| ID | 必须保留的实际原件与结果 | 不足以通过的材料 |
| --- | --- | --- |
| PLATFORM_AND_SNAPSHOT_CONSISTENCY | 准确源平台/内核/文件系统、Docker/PG镜像及版本、单系统盘和完整集群/WAL/表空间/配置位置；所选Lightsail快照路线的实际完整覆盖与一致性验证，绑定basis/准确对象 | 名称/容量相同、单看st_dev、state=available或只停应用 |
| ISOLATED_REPLACEMENT_FENCING | 新实例独立身份及SSH对应，启动前云侧隔离；真实启动/重启后门禁、原三应用和后台外部写入者保持禁止，旧机不被误操作；DB的受控恢复观察与业务放行分开 | 只关网页入口、只停daemon、进程finally或口头“不营业” |
| COMPLETE_CLUSTER_RESTORE | 在已批准的可丢弃隔离数据集/拓扑上，准确快照→新实例实际恢复；完整集群/WAL可恢复，固定只读身份/迁移历史、已提交哨兵/约定数量或内容对照正确，保留DB启动/恢复日志及原始输出 | gzip可读、HTTP 200、只恢复单表、仅比较文件夹或自报restoreProven |
| PERSISTENT_CONTENT_AND_RUNTIME_RESTORE | 实际DB卷、uploads/sounds/备份及所需工具/config/state材料的准确内容核对；旧17+原Manifest与原应用版本、秘密权限、原维护状态读回；晚生成回执缺失按上节处理 | 工具tar覆盖了所有业务数据、只比较mtime/目录存在、只保存摘要而没有可取得原件 |
| OFFHOST_ONLY_RETRIEVAL | 在原机不可访问的受控情景，仅用已保存机外index/授权AWS会话定位准确快照和新目标，并从恢复环境取得原intent/writers/恢复包成功关联；保留实际取得/读回记录 | 继续从原VM取最终回执、依赖latest/猜测名字、索引“已生成”但无机外读回 |

PG15官方[文件系统备份说明](https://www.postgresql.org/docs/15/backup-file.html)（2026-10-29复核）区分普通文件复制与完整、一致快照；运行中一致快照的恢复会涉及WAL重放，完整集群和相关存储覆盖不可省略。本项目保持DB运行的既定范围，不能顺手增加DB stop/CHECKPOINT/数据写入；若选定现场路线需要改变操作范围，须先审阅准确对象和授权。这里未对实际Lightsail平台的一致性或恢复作通过结论。

## D4统一隔离验收的执行前置与证据包

实际执行前，先将最终代码/工具交付状态、独立新目标、可丢弃数据集、网络/业务隔离、操作范围和回收/失败保持方式做成准确计划供用户授权。仓库源码授权和CI不包含AWS创建/恢复、生产停写、root安装或DB写入；本批仅明确计划所需材料，没有要求用户现在执行未准备好的命令。

一次完整可复用演练按以下顺序保留原始证据：

1. 固定basis/index及源平台、工具/应用/PG版本，准备已批准的隔离测试数据和对照清单；只在该隔离数据集生成哨兵，不在生产库插测试订单/付款。
2. 在拍照前完成原意图/停写/恢复包链，手动生成并核准确快照；保留原AWS响应及操作者的对象/顺序核对。没有独立云/时间认证时如实标明。
3. 在云侧先限制新实例访问和外部写入能力，再在独立新目标启动；先验证启动门禁、业务禁止、维护原件和全量路径，不能先启动业务再补隔离。
4. 按受控方案观察完整PG恢复和固定只读查询，核数据与持久内容；先做材料关联，再做真实恢复结论，不能倒过来拿一个PASS字段替代原输出。
5. 模拟原机不可访问，完成机外定位、材料取得与核对；再覆盖SSH断连、保存中断/VM重启等已列D4矩阵，失败保留实际证据和隔离，不自动重开业务。
6. 最终源代码基线、原始对象/命令输出/退出码、脱敏内容清单、差异解释、操作者结果与未解决项共同审阅。当前尚未定义可被执行器消费的最终验收receipt schema，需在真实采集边界明确后实现严格验证/适用范围加载器；本合同不提前接受手填结论。

新实例的设备名、st_dev/inode、云实例身份、容器生命周期可能与源机不同。不能把sourceStorageLayoutSha256或原目录inode机械地当作新机相等条件；应在准确新目标重新核完整物理映射与逻辑不变量。DB镜像/版本、应用与迁移历史、持久路径覆盖、旧Runtime/config/state及维护不变量必须按准确范围核；变化需要明确兼容审阅，不能只以“同主版本”继承恢复证明。

只有上述真实证据经严格、可重复核验并被绑定到适用平台/拓扑/代码范围，才能再实现/启用RECOVERY_READY晋级；达到恢复前置不等于授权工具安装或完成整个最小执行器。Mac薄入口、真实工具过渡/故障与生产应用更新仍按[实现方案](Runtime最小更新执行器实现方案.md)及[暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)执行。C1/自建CPython/R2研究继续暂停、不取消。
