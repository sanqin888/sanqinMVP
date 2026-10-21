# R1C-2C-C — C0 独立身份与保管链证据复核（历史材料优先）

**2026-10-21 / C0-EVIDENCE-RECONCILIATION-001 / LOCAL DOCUMENT REVIEW / C0 OPEN-LIMITED。**

本批从 `dev@144abbd1fb2fd1640d388e4765cca8fd515589f0` 开始，承接 [R1-C §14–§16](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)。目的不是重新做已经发生的 C0，而是在**只读、逐原件**基础上证明其实际支持范围、找出独立身份与交接证据断点；若旧件确实无法补证，为**下一次尚未获批准**的 C1-SYN 会话准备前置来源与保管审查标准。

## 1. 本次实际独立复核的材料和结果

| 对象 | 当前可直接核验的事实 | 不能据此认定 |
| --- | --- | --- |
| 独立见证人 2026-10-21 原始回邮 | 邮件记载 `R1C2C-B-004` 审核已完成、结论 `LIMITED`，声明不认证完整 Host/Guest provenance 或真实 Runtime 字节消费；附件为 3 页的见证 PDF | 并非经过验证的完整原件离机交接、SSH 身份或实际 trace |
| 见证 PDF 原始字节 | 独立环境对邮件附件 PDF 原始文件计算 SHA-256：`85440dc4d25600d7dadd5334c304d08a4cad46715b1c96136fafc89f4fccf166`；与邮件正文的 PDF digest 一致 | 邮件所述 hash 一致不是数字签名证书或可信时钟证明 |
| PDF 第 1 页 | 已填原始归档名 `R1C2C-B-004-witness.zip`、归档/expected SHA-256 同为 `d1bc78e709591eade7df67584e7340b6c6cc14edae5b9f49b597c866f544139b`；介质填写 `email`；审核环境写 `Mac OS 2026-10-20 Toronto` | 未提供独立渠道 expected SHA 的消息原件、批准发生时点及该 ZIP 每一次交接回执 |
| PDF 第 2 页 | 已按页面渲染及文本内容复查：原件收到、Host/Guest 双清单复算、receipt rc/UTC、缺口保留和介质独立性共六项核验，六项首选均采用实心圆点标记（经用户明确说明表示已选择），逐项命令/rc/缺失项栏为空；`LIMITED` 为表中保留的有限结论，见证人关系写 `employee`，签署时间只写日期/Toronto，没有精确 UTC，签名平台字段不构成明确证书链证明 | 不能因 PDF 末尾署名或文件标题声称六项已经逐项复算 `PASS`；雇佣关系本身不等于不独立，但职责和数据源的独立性没有完整证明 |
| PDF 元数据与邮件时标 | PDF 自报 `CreationDate=2026-10-21T12:41:11Z`；Gmail 邮件时间戳为 `2026-10-21T13:16:35Z`。二者记录上先后相差约 35 分钟 | PDF 本地生成时间戳可由来源端控制；邮件时间不能倒推出原件在采集前的批准和签署时间 |
| 历史 `004` 离线结构 reviewer | 既有 R1-C §13/§15 记录独立于采集机器审核 ZIP 结构：Host 23、Guest 97、payload 98；Host 自报 17/17、Guest 23 条真实 raw/decoded 一致，三项非零 rc 均保留，`OFFLINE_SELF_CONSISTENCY_CHECKED / BLOCKED` | **本轮后续已重新收到原始 witness ZIP 和 B-001～004 四批目录的打包件，并做了逐字节及清单复算**；完整结果见 §5；先前的离线自洽审核已做，但不因此覆盖采集前身份或交接认证 |
| `S1-W1/R1` 来源信任链 | 独立证人先前限定确认 Ubuntu keyring SHA-256 `80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31`，核对 PR #2876 与 Hosted Runner 指定验签证据 | 是 Ubuntu 发行来源链证据，**不是 C0 的 Mac/VM/Guest/SSH/保管链来源证明**；不重做已有软件来源工作，也不跨目的挪用授权 |

**独立层级：**当前可直接核验的是 PDF 原件/回邮、重新提交的 witness ZIP、四批历史原始 Host/Guest 记录与归档内部 SHA 清单。该核验属于事后离线自洽性，不能替代采集前第三方身份授权或证明见证人当时的准确命令/退出码。没有重演 Host/Guest 操作，也没有见证人底稿的新增技术 PASS。

## 2. C0 逐门禁证据矩阵

| Gate | 需要明确的原始证据 | 本轮能肯定的状态 | 差额 / 后续应取得的材料 |
| --- | --- | --- | --- |
| C0-01 历史采集发生 | `004` 原始 Host/Guest 回执、SHA256SUMS、每个 argv/stdout/stderr/rc | **EXECUTED / historically CHECKED** | 本轮已重新取得 witness ZIP 与 B-001～004 批次材料并复算；未重新执行旧现场采集 |
| C0-02 独立见证声明 | 原回邮 + 完整 PDF 与 digest | **RECEIVED / LIMITED** | 六项结果标记存在，但仍缺见证人当时留存的原始复算命令/rc 和工作底稿；若不存在，保留缺失，不请见证人补签声称当时已运行 |
| C0-03 事前平台身份 | 独立批准的 Host 实例、VM UUID/VDI、网络隔离、Guest identity 与准确 UTC，采集时绑定原始证据 | **NOT ESTABLISHED** | 查验采集前的外部审批原件；后验 17/17、同 boot/ns/时间不代替事前批准 |
| C0-04 SSH host key | 事前独立批准的 SSH host key 指纹、known_hosts 源、实际连接比对与时间线 | **NOT ESTABLISHED** | 旧批若无原始审批，保持 LIMITED，不能追认；新批必须执行前独立冻结 |
| C0-05 事前独立 expected pin | 独立渠道、签认人、准确发出/接收 UTC、最迟在使用前已固定的对象/哈希 | **NOT ESTABLISHED** | PDF 中预期值与自算值相同不能证明独立来源；获取真正第二渠道原始消息并核对时间 |
| C0-06 各跳归档保管 | 每次打包封存、发送/交付、见证接收、独立复算、回邮，记录人/渠道/UTC/摘要 | **PARTIAL** | PDF 的 `email` 表述与最终回邮有据，但中间的原始交接/接收 hash 回执缺 |
| C0-07 C1-HOST-001～005 | **逐批**的 Host 原件、当次采集回执/批准会话/SSH 身份与后续 Guest boot/ns、介质保管 | **ALL FIVE HOST RAW RECEIVED / 115/115 HASH CHECKED / IDENTITY OPEN** | 五批 Host-only 只读原件已逐批核验（见 §6），但预先独立批准、实际 Guest 会话关联、交接链和见证未由这批 Host 原件证明 |
| C0-08 C0 最终独立裁定 | 上述各批原件定位、SHA/时序、独立审核人、拒绝原因和明确结论 | **OPEN / LIMITED** | 没有原始材料的不升级 `PASS`；只允许限定独立复核子项标为 CHECKED |

## 3. 现有私有材料复用与下一批动作

1. **先整理现有原件目录（独立私有介质、只读）**：已取得并复算旧 `004` ZIP、B-001～004 双 SHA256SUMS、原始 stdout/stderr/rc、邮件完整头与附件、早于现场的批准消息，以及**现已收到并独立复算**的 `C1-HOST-001～005` 五批 Host 原件。逐批单独登记原始 SHA、文件数、保管方、接收 UTC 与定位索引；Guest 及见证侧独立材料仍待查。没有取得的文件明确记 `NOT PROVIDED`。
2. **还原而非补造时间线**：把批准→采集→封存→独立 expected hash→交付→见证复算→签署→回邮逐一绑定到原始记录；记录 UTC 的实际来源与可信等级，不能将 PDF 元数据当成可靠第三方时间戳。
3. **如需向见证人取回历史工作底稿**：询问 *当时真实保存的* 两份清单复算命令、rc、统计数、收发渠道/UTC、独立 expected pin 来源、Host/Guest/SSH 核查回执；若未保存，应明确答复“未保留”，不能新补签说旧时已经做过。
4. **新会话所需身份链另行审批**：如果历史事前凭据不存在，旧 `004` 保持 LIMITED；未来 C1-SYN 批次应在操作前取得 VM/VDI/SSH host key 的第二渠道签认、准确用户名/UID/GID、boot/ns、隔离、原件交接与独立 pin，并经用户逐条批准。此文不是 SSH、Guest、strace 或文件写入许可。

## 4. 决策

- `C0 OLD EXECUTION = EVIDENCED`；`C0 OFFLINE STRUCTURE = HISTORICALLY CHECKED`。
- `C0 WITNESS ORIGINAL PDF = CONTENT/HASH CHECKED; WITNESS SCOPE LIMITED`。
- `C0 IDENTITY + END-TO-END CUSTODY = OPEN / LIMITED`；`C1 DYNAMIC OPEN`、`C2 LIVE TRACE NOT AUTHORIZED`、`C5-G2 NO-GO`、`S2 DAILY PAUSED`。
- 本轮 **不**授权发信、安装、Guest/Host/SSH、动态 trace、root、VM/AWS 或生产改动；不更改 `sanq.runtime.r1c2-consumption-evidence.v1`、Runtime 来源/owner、CI、依赖、数据库。完整敏感原件/个人信息不纳入 Git。

## 5. 2026-10-21 补充收到的 B-001～004 四批原件复算

收到由用户上传的 `归档.zip`（SHA256 `c439ff939efb91ec5b85c18363fa82ee04169b553e8ca99519caf6eee0a8fcb4`；237 个 ZIP 条目；总解压大小 135332 B；无重复名称、路径穿越、symlink、CRC 错误）。**本包包含 `R1C2C-B-001`～`R1C2C-B-004`，不包含最初申请的 `R1C2C-C1-HOST-001`～`005`，不能替代这些后续会话的 C0 审阅。**原始识别符与敏感字段仍仅存用户私有资料，Git 记录有限摘要。

| 批次 | Host SHA256SUMS | Guest SHA256SUMS | 现场原始结果 | 本轮离线比对 |
| --- | ---: | ---: | --- | --- |
| `B-001` | `20/20` | 不存在 | 6 个 Host 命令 rc0；自动门禁未通过：NIC1 Host-only 检查 false | Host receipt 与原始 stdout/stderr 的长度与 SHA 一致 |
| `B-002` | `23/23` | 不存在 | 7 个 Host 命令 rc0；Host-only 网络列表绑定检查 false | Host receipt 与原始 stdout/stderr 的长度与 SHA 一致 |
| `B-003` | `23/23` | `28/28` | Host `17/17` true；Guest SSH `rc=255`、本次未成功取得 23 个 Guest 命令；失败原始回执存在 | Host/SSH 原始输出及摘要一致，未重演 SSH |
| `B-004` | `23/23` | `97/97` | Host `17/17` true；Guest SSH `rc=0`，23 个远端命令中 20×rc0、DMI×rc1、readelf×rc127 两条 | Host/Guest 各原始回执的字节/长度/哈希匹配；Guest SSH JSON 与 23 组解码后的原始字节逐项吻合 |

另外复读用户早前上传的 `R1C2C-B-004-witness.zip`，实际归档 SHA256 `d1bc78e709591eade7df67584e7340b6c6cc14edae5b9f49b597c866f544139b`。新 `归档.zip` 内 `B-004` 目录 **98/98 项原始证据文件逐字节相同**，另有 Finder 附加的 `.DS_Store`（非见证归档成员）。B-003 与 B-004 的 Host 输出中 VM 身份、硬件 UUID、磁盘 UUID、核心 NIC 配置一致，VM State/Guest Additions 的动态状态细节有变化；这里只构成两批**操作员提供的原始输出之间**的一致性，不是第三方事前来源认证。旧 B-001/B-002 的失败不可由后续成功覆盖或改写。

**经本轮实际文件复算更新：** `C0 HISTORICAL RAW B-001..004 OFFLINE INTEGRITY RECHECKED`；`B-004 WITNESS ZIP MEMBERS 98/98 BYTE MATCHED`；`C0 IDENTITY-CUSTODY OPEN/LIMITED`。已另批取得 `C1-HOST-001～005`（见 §6），但尚未取得既存 SSH known_hosts 事前第二渠道批准、当时见证人清单复算的确切 stdout/rc、各跳保管 UTC/独立 expected pin 的原始记录。上述任何缺失都不得因 ZIP hash 完全匹配而自动视为已补足。

## 6. 2026-10-21 新收 C1-HOST-001～005 五批原件复核

用户上传 `归档 2.zip`，只读核验原件 SHA-256：

`2ef869603ae00cf62b195fe9b0d59abdf5c8978c89827a6a38bf443749acb0b8`

该 ZIP 恰好包含五个 `R1C2C-C1-HOST-001`～`005` 目录，各 33 个条目，共 165 个条目、解压大小 119116 字节；无重复成员、非法路径、symlink 或 CRC 错误。每批 `SHA256SUMS.host` 各 23 项逐文件复算全部匹配（总计 **115/115**）；每批包含 7 组命令 stdout/stderr/receipt、`host-review.json` 与 `remote-guest-source.py.txt`，清单覆盖后两者。每批 7 条 receipt 与各 stdout/stderr 的长度、SHA256、命令记录逐项一致；每批 7 个 exitCode 均为 0，且没有 timeout/overBudget。五批仅有 **Host 预检**，不含 Guest SSH/raw 动态观察原件。

| 批次 | 现场记录 UTC（Host 自报） | 自动门禁 | 独立离线复核 |
| --- | --- | --- | --- |
| `C1-HOST-001` | `2026-10-21T14:06:20Z` | **16/17，未通过**；唯一 false `vmRunning`，`VMState=poweroff` | `23/23` 清单 + 7/7 原始命令 receipt/双标准流匹配；保留机器关机状态，不倒填 PASS |
| `C1-HOST-002` | `2026-10-21T14:10:24Z` | `17/17`，`VMState=running` | `23/23` + 7/7 匹配 |
| `C1-HOST-003` | `2026-10-21T16:55:40Z` | `17/17`，`VMState=running` | `23/23` + 7/7 匹配；后续 Native-001 SSH 超时不得由此覆盖 |
| `C1-HOST-004` | `2026-10-21T17:03:40Z` | `17/17`，`VMState=running` | `23/23` + 7/7 匹配 |
| `C1-HOST-005` | `2026-10-21T17:27:26Z` | `17/17`，`VMState=running` | `23/23` + 7/7 匹配；不把 Native-003 的独立单 ELF raw 核验自动继承为 Host 身份见证 |

五批原始 Host `VBoxManage` 回执中的 VM UUID、VDI UUID、MAC/NIC 和 Host-only 网络配置线索彼此一致；`001` 与后四批运行状态不同，符合原始时间线。五批自报相同的 `sourceSha256=c7a5d712…b32781`（Mac 采集器候选），`remoteSourceSha256=a7def6d8…70d13b` 与每批 `remote-guest-source.py.txt` 的原始字节 SHA256 一致；但这仍属同批操作者/工具提供的线索。每批 `host-review.json` 均明确 `historicalPinsAreComparisonOnly=true`、`operatorIsolationAndHostIdentityReviewStillRequired=true`、`authorizationGranted=false` 和 `classification=DISCOVERY_ONLY`。17/17 **不等于独立的身份签认或 Guest 观察授权**。

**更新后的证据裁定：** `C1-HOST-001..005 RAW OFFLINE SELF-CONSISTENCY CHECKED`、`C1-HOST-001 CONDITION FAILURE PRESERVED`；原先因未获得五批 Host 原件而开放的“Host 文件缺失/逐项原始 rc 未核验”子项可以标记 **已补齐/已技术复核**。但仍缺各批**现场之前的独立 VM/VDI/SSH host key 批准凭据**、准确 Host/Guest boot/ns/SSH 连接会话绑定原件、独立于操作者的 expected pin 与离机各跳交接/见证记录；`C0 IDENTITY-CUSTODY OPEN / LIMITED` 不变。未执行任何 Guest/SSH/strace/VM/AWS 或生产动作。

83:
