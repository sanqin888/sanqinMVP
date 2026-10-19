# C5-G2 / R1 — Ubuntu 独立来源与隔离 Guest/root 真实取证审批（第一轮）

**2026-10-18 America/Toronto。基线：**B2-1D PR #2871 / CI #7373 success / dev merge e5f2e64376251f9f03edb1ebf337f74fab820d90。
**首次审批文档编写：**docs/c5-g2-r1-b21-real-provenance-root-approval-20261018；**LOCAL DOCUMENT REVIEW ONLY / NOT PUSHED / NO REAL SOURCE SIGNATURE VERIFIED / NO HOST/GUEST/ROOT EXECUTED**。用户随后明确批准 S0 身份预核对及 S1 独立 Ubuntu 来源验签的范围，执行结果见第 8 节；**S2/S3/S4–S6 不在本次批准内**。

## 1. 当前事实与可信性边界

B2-0、B2-1A/B/C/D 分别提供声明式 Guest/Host 回执、Release→Packages→deb 字节候选、包内文件/链接候选和跨包归属候选。即使所有合成测试 CI 全绿，仍只能断言调用方材料内部一致，**不能**证明官方 Ubuntu 签名、实际发行包来源、真实 Mac Host/Guest 身份、Guest root-held FD 或 Python/ELF/dlopen 实际动态消费。本次不得改变任何现有 BLOCKED、C1 OPEN、G2 NO-GO 语义。

Canon­ical 官方文档确认 Ubuntu Archive 信任链为可信 Archive key 验证签名的 InRelease（或同 pocket 的 Release + Release.gpg）→ 签名 Release 的 SHA256 表 → component/amd64 Packages 索引 → 精确 Filename/Size/SHA256 的 .deb → 包内成员。官方说明现行 Packages 滚动替换旧版，历史包应考虑 Ubuntu Snapshot。来源：
- https://documentation.ubuntu.com/security/software-integrity/archive-verification/
- https://documentation.ubuntu.com/security/software-integrity/image-verification/
- https://archive.ubuntu.com/ubuntu/dists/noble/
- https://archive.ubuntu.com/ubuntu/dists/noble-updates/
- https://archive.ubuntu.com/ubuntu/dists/noble-security/
- https://snapshot.ubuntu.com/

官方文档记载 2018 Ubuntu Archive Automatic Signing Key 完整指纹为 F6ECB3762474EDA9D21B7022871920D1991BC93C，同时也载有 2012 Archive Key。**该指纹只是官方资料核对线索，不是本轮已验证签名的证据**；须独立见证干净审阅机可信 keyring、检查实际签名和对应 key fingerprint。不能拿 Guest 自身信任库、Guest sha256sum 或 dpkg -V 直接充作独立外部发行信任根。

## 2. 目标冻结（历史仓库登记，非本批复测）

| 对象 | 原记录 ID | 局限 |
| --- | --- | --- |
| Mac Host | macOS + VirtualBox 7.0.26r168464 | 历史操作员观察，MCP 无 Mac 直连 |
| C2 Source VM | SanQ-Linux-Test-02 / 4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033 | 必须 Host 再核对 |
| Source Snapshot | SanQ-Runtime-B4B2-Clean-Baseline-20261017 / 028a681b-18b9-4dc7-a67f-69257e7cf85b | 必须核对归属 source |
| Recovered VM | SanQ-C2-1-Recovered-20261018 / 162701f1-bf68-413d-9f2d-76c513554881 | 只能是隔离可丢弃 Guest，非 AWS |
| Recovered VDI | 39381cc9-f526-4e35-8a09-3a265cfe79f4 | 历史 Parent=base，需核对 |
| Guest | Ubuntu 24.04.5 x86_64，Python 3.12.3，rootfs ext4 UUID 24895113-d19d-4b65-84ea-ca5098f95ae5 | Guest 自报、非 Host 独立 rootfs pin |
| usrmerge | /lib → usr/lib；/lib64 → usr/lib64；loader leaf → ../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 | 未认证 FD 链 |

历史 Source Snapshot 的 Clipboard Mode = Bidirectional；恢复 VM 历史 clipboard 和 drag-and-drop disabled。不能假定当前仍无其他共享目录、网络出口、host key/identity 重用或业务数据。任何差异先 BLOCKED，不能为继续取证现场重配 VM。

## 3. 独立审批 Gate 和退出条件

| Gate | 严格目标 | 当前授权/状态 |
| --- | --- | --- |
| S0 | 操作员现场确认上述准确 Host/VM/snapshot/VDI、Host-only、无共享可写目录/业务资产/意外外联；确定 Witness、离机目录及保留 | **用户已通过聊天提供五条批准的 Host VBoxManage 命令输出，关键 UUID/盘链/虚拟网卡/恢复机 clipboard 匹配；但无逐条真实 rc、stderr、UTC、独立 Host witness 与离机原始摘要，S0 IDENTITY MATCHED / EVIDENCE LIMITED，未达到完全 VERIFIED** |
| S1 | 独立于 Guest 的可信审阅机和 archive keyring 固定后，按准确 Ubuntu pocket 取签名 Release + Release.gpg 或 InRelease 原始 bytes，以 gpgv 验 signer/rc、有效时间 | **用户已授权核查范围；官方文档已独立检索，但当前执行环境无可信 Ubuntu keyring / DNS 不通，gpgv 未运行，故仍 BLOCKED** |
| S2 | 基于已认证 Release SHA256 精确读取 Packages[.xz]、逐个 package 的准确 Filename/SHA/size/version、原始 .deb；由真实数据重跑 B2-1B/C/D，不选 latest 代替旧版 | 未下载/未取证 |
| S3 | 独立 Mac Host 五条 + 指定非 root Guest 九条只读命令、每条 stdout/stderr bytes、内/外 rc、UTC、operator/Witness、独立 SHA 复核 | 有冻结命令清单，未执行 |
| S4 | 审阅并固定真正的 Guest root collector 完整源码 commit/SHA、root:root 祖先、具体执行脚本、exact argv/env/sudo 策略/受控私有原件目录及失败规则 | 无 collector 源码/CLI，**NOT READY** |
| S5 | **另获精确 root 命令执行授权后**在同一个已认证 mount namespace 会话持有 read-only 斜杠 FD，将借来的 nofollow alias-file FDs 传给 B3B1 observer，不 realpath→open | **NOT APPROVED / NOT RUN** |
| S6 | 另行 B4B-3C 的真实 CPython import 与 ELF PT_INTERP、DT_NEEDED、RUNPATH、dlopen 消费闭包独立见证 | DEFERRED |

建议执行顺序：S0→S3（核实准确 Guest 版本与隔离）并行准备 S1 的可信 keyring；只有准确包版本/历史对应 pocket 定稿，才逐项执行 S1→S2；S0–S3 各自通过后才提出 S4 的 root collector 源码执行门禁。不能把「用户授权开始审批」理解为批准实际 sudo、VM 写操作或生产工作。

## 4. S3 精确只读 argv 清单（仅供审阅，未执行）

Mac Host，五条均无 sudo：
    VBoxManage snapshot 4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033 list --machinereadable
    VBoxManage snapshot 4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033 showvminfo 028a681b-18b9-4dc7-a67f-69257e7cf85b
    VBoxManage showvminfo 4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033 --machinereadable
    VBoxManage showvminfo 162701f1-bf68-413d-9f2d-76c513554881 --machinereadable
    VBoxManage showmediuminfo disk 39381cc9-f526-4e35-8a09-3a265cfe79f4

Recovered Ubuntu Guest，九条非 root 命令，必须先由操作员通过 Host-only 管理通道确认准确目标：
    id -u
    uname -srmo
    cat /etc/os-release
    findmnt -n -o SOURCE,FSTYPE,OPTIONS /
    stat -c '%n uid=%u gid=%g mode=%a dev=%d inode=%i type=%F' / /lib /lib64 /usr/bin/python3.12
    readlink /lib
    readlink /lib64
    readlink /lib64/ld-linux-x86-64.so.2
    readlink /proc/self/ns/mnt

上述 argv 正好是 B2-1A 已冻结 Host/Guest 5+9 只读审阅合同。严禁隐含 snapshot take/restore/clone、mount、apt update、sudo、安装、重启、权限更改或 ssh|tee 丢失外层 rc。后续准确版本定位用 dpkg-query、查询 boot-id、网络拓扑读回或新增 procfs 读取，不包含在这 14 条白名单，**另行逐条审批**。如果 Guest ID、UID、link text 与 C2 历史值不符即停，不悄然换目标。

## 5. S1–S2 官方证据对象与命令审批草案

审阅机：必须是和被测 Guest 独立的、预先可信的系统。先登记 OS/操作者/独立 witness、受保护只读 keyring 的**真实绝对路径与 SHA256**、该 keyring 的信任来源和版本、实际 signer fingerprint；禁止从本轮待验证 Guest 获取被称为可信的 keyring。

候选 Ubuntu 24.04 amd64 pocket metadata URI，先根据实际 Guest package/version/pocket 选取必要的一个或多个：
- https://archive.ubuntu.com/ubuntu/dists/noble/Release 与同目录 Release.gpg
- https://archive.ubuntu.com/ubuntu/dists/noble-updates/Release 与同目录 Release.gpg
- https://archive.ubuntu.com/ubuntu/dists/noble-security/Release 与同目录 Release.gpg

审阅机上后续**拟批准命令模板**（下面的 keyring/本地相对路径仅是占位符，**未确定，不能直接执行**）：
    gpgv --keyring /APPROVED-TRUSTED-KEYRING.gpg ./approved-pocket/Release.gpg ./approved-pocket/Release
    sha256sum ./approved-pocket/Release.gpg ./approved-pocket/Release

实际执行需独立收集 gpgv stdout/stderr/rc、可信 keyring 的指纹/SHA 和 trust chain、Release Date/Valid-Until（如果有）、文件名/UTC 原件。未得到 gpgv rc=0 和已批准 fingerprint 则 BLOCKED；不能使用 insecure/trusted=yes、allow-unauthenticated 或取未认证 fingerprint 后强行验收。若 Guest 历史包版本不在当前 Packages 中，只能另审 Ubuntu Snapshot 的准确 immutable capture/time/pocket 来源；不编造 package SHA，不自动扩大数据预算或放宽 B2-1B xz/.deb parser。

S2 在 S1 PASS 之后才按所选签名 Release 的 SHA256 表下载**准确索引路径**（例如 main/binary-amd64/Packages.xz，须被 Release 实际列出），从索引准确 Package/Version/Architecture=amd64/Size/SHA256/relative Filename 选择 .deb 对象；逐个固定对象 URI、大小、原件 hash、member hash/link text 与 Manifest 的 route。禁止按当前镜像 newest 包名猜版本。所有 SHA 一致但 Release 实际 signer 失信时仍不能提升独立来源权威。

## 6. S4 root collector 必须在代码完成并固定 SHA 后二次审批

仓库现有 borrow_candidate_alias_fds(root_anchor_fd, manifest, ...) 与 capture_preopened_dependency_fds(..., opened_file_fds=...) 都依赖**调用方提供的 root read-only FD 与外部 pin**，原返回值及权限仍 BLOCKED。当前没有获批准的真正 Guest root collector CLI，也没有该 collector 的已冻结 commit/hash、Guest root-only 安装目录、命令 argv，因此**本文件不提供任何可以立即运行的 sudo 命令**。

在再次请求执行批准前，先只在 MCP-workspace 最小实现候选 collector、合成/隔离测试；经用户代码审阅后远端 PR/CI。再冻结：
1. 指定 recovered VM+VDI+Guest boot ID+rootfs/mount namespace/mount ID+root device/inode/uid/gid/mode、隔离/无业务资产证明；
2. collector 源文件和所有输入清单的 SHA256、确切 root:root 目录和全部祖先的只读/不可被普通用户修改证明、精确 Linux interpreter/argv/env/运行主体与最小提权方式；
3. 同会话根目录 O_RDONLY FD、no-follow alias FD 借用、B3B1 已打开 FD p-read，禁用字符串 realpath 重开；命中重复 inode、错误 mount/权限、可写路径、未锁定来源或超 64 MiB 时 fail-closed；
4. stdout/stderr 原始 bytes、Guest inner rc/Host SSH outer rc、所有 FD 元数据/预算/UTC、独立 witness、事故恢复和原件离机 hash；脚本异常必须保留证据，不得尝试“修复”VM 取证条件；
5. 如有真实 Linux usrmerge/loader 包路径与现有 contracts 不同，先 BLOCKED 并审议最小限定差异，**绝不现场改 B1 nofollow/observer 的拒绝语义**。

## 7. 保管链与后续审批要求

每条命令和下载对象的 stdout.bin / stderr.bin / immutable source bytes / argv / innerExitCode / outerExitCode / UTC / actorId / original SHA / 独立 Witness digest 必须分别有记录；由**非采集人**独立从离机、私有、不可在公开 Git/聊天泄露的目录重算。公开 PR 只存 opaque evidence ID、脱敏摘要与准确差异分类。不用 runner 自写 hash 再读一次假冒独立见证；不能向公开聊天或 PR 上传 SSH key、MAC/IP、机器实际路径和原始未脱敏证据。

**需要用户在下一次逐批批准的具体事项：**(A) 外部来源审阅机和可信 keyring 的准确 ID、路径/hash，以及哪几个 Ubuntu pocket 和 snapshot；(B) Mac Host/Guest C2 指定设备存续、Host-only 与完整原始收集 wrapper SHA/独立私有目录/witness；(C) 要授权 A 的下载/验签、B 的 5+9 只读实际命令中的哪一组；(D) 等 collector 真实代码/权限/命令冻结后，才另批批准 root 实际执行。

**停点：**本次仅本地文档/准备，未下载 Ubuntu 源原件、未验 GPG、未向 Mac 或 Guest 发送命令、未提权、未执行发布或 AWS 操作。C2 CLOSED（仅 VirtualBox 合成/N-07 LIMITED-ACCEPTED）、C1 OPEN、C5-G2 NO-GO、S2 PAUSED；R2–R5、生产 AWS C3–C8 一律维持原门禁。

## 8. 2026-10-18 — 用户已授权 S0/S1 的首次实际可达性检查与停点

**授权口径：**本轮新批准仅覆盖 S0 已登记 Mac/VirtualBox C2 资产的身份预核对、S1 独立于 Guest 的 Ubuntu 官方 Archive 可信来源与签名验真。**不**包括 S2 Package/.deb 真实取证、S3 Guest 九条 SSH 命令、S4–S6 root/动态消费，不包括 S0 发现偏差后为修复而更改网络、快照、VM、镜像、权限或启动状态。

**S0 实际连接器审计：**SanQ VM MCP 已披露的只读执行工具仅覆盖生产 Linux VM 系统、Docker、git、workspace；没有连接用户本地 macOS/VirtualBox 主机的安全远端接口。当前没有 Mac Host 的新鲜命令 stdout/stderr、精确 rc、当前独立 witness 或离机原件。不得将既有 2026-10-18 的 C2 Host 历史读回冒充本批实时重新取证。**判定：S0 AUTHORIZED / NO ACCESS / NOT EXECUTED / BLOCKED**。

**S1 实际独立执行环境审计：**会话独立容器为 Debian GNU/Linux 13 x86_64，已有 /usr/bin/gpgv、/usr/bin/gpg、/usr/bin/sha256sum 和 curl，但**未预置 Ubuntu Archive 可信 keyring**。尝试对 Canonical 官方 Archive URL 进行 HTTPS HEAD 时，DNS 返回 curl exit=6（Could not resolve host: archive.ubuntu.com）；经容器下载接口请求官方 archive keyring 也失败，未形成可审核的原始 keyring/Release/Release.gpg bytes。不存在本次 gpgv 实际执行/rc、签名指纹、Release SHA 或 UTC 归档原件。**判定：S1 AUTHORIZED / OFFICIAL DOCUMENTATION CHECKED / RAW SIGNATURE NOT OBTAINED / GPGV NOT RUN / BLOCKED**。

经 HTTP 网页检索确认的 Canonical 官方说明：
- https://documentation.ubuntu.com/security/software-integrity/archive-verification/ （InRelease 签名及 signed index/hash chain，旧版应考虑 Ubuntu Snapshot）
- https://documentation.ubuntu.com/security/software-integrity/image-verification/ （官方 Archive keyring 下载和完整 2012/2018 Archive Key fingerprint）
- https://archive.ubuntu.com/ubuntu/project/ubuntu-archive-keyring.gpg （候选 keyring 原件位置，**本轮未下载成功**）
- 2018 Ubuntu Archive Automatic Signing Key 完整 fingerprint：F6ECB3762474EDA9D21B7022871920D1991BC93C；2012 Archive Automatic Signing Key：790BC7277767219C42C86F933B4FE6ACC0B21F32。这些是**官方文档值，不是新的 gpgv 验签结果**；Image Signing Key 不是 Archive Key 的替代品。

**接续操作界限：**
1. 仅能由准确 Mac Host 的操作员执行第 4 节的五条精确 S0 Host VBoxManage 命令；每条原始 stdout/stderr/实际 rc、精确 argv、UTC、Mac 可独立证明的 Host identity 和 witness 在非公开的受控目录内原样留存，独立读回计算 SHA。**不得执行九条 Guest 命令**（S3 未授权）。
2. 独立 Ubuntu 来源审阅必须先在网络可用的、与 C2 Guest 隔离的可信审阅机上冻结经独立信任来源确认的 keyring 路径/哈希/实际 key fingerprint；再按经批准的 pocket 与准确签名对象执行 gpgv，将原始 Release/Release.gpg/InRelease bytes、stdout/stderr/rc/status/UTC、Release Date/Valid-Until 原样封存。用户批准 S1 范围不等于凭空填入缺失的审阅机和签名对象；缺前置材料只能记录 BLOCKED。
3. S0/S1 的正向独立证据可逐个从 BLOCKED 升级为 *VERIFIED for named object/instant*，而 C1、B2-1A/B/C/D、B4B-3C、G2/S2 不因此自动过闸。
4. 原审批文档首次状态与新授权记录需同时保留；此文档仍是**本地审阅、未推送远端**，遵守仓库的用户再授权 PR→CI→dev 流程。

**本轮确认没有触碰：**Mac、VirtualBox、恢复 Guest、sudo/root、APT 安装、任何真实 Archive 下载成功、AWS/生产。没在 Git 存放 keyring、IP、MAC、机器私有路径、原始认证材料。C2 限定 CLOSED、C1 OPEN、C5-G2 NO-GO、S2 PAUSED。

## 9. 2026-10-18 — 操作员回传 S0 五条 VirtualBox 只读查询结果（候选终端转贴）

**新收到证据形态：**操作员向会话提交约 817 行 Mac Terminal Markdown 粘贴内容，按序包括第 4 节五条完整 Host `VBoxManage` 命令及所见 stdout；不是系统直接可信采集的原始 stdout.bin/stderr.bin/rc 包，也未包含每条命令的 UTC/退出码、独立 witness 和非公开原件存储证明。因 MCP 无 Mac 直连权限，本记录仅认定「操作员报告中可观察的身份/配置」，**不签认 Host 采集真实性**，也不将聊天转贴作为不可篡改离机证据。

**五项逐条审核：**

| 命令序号 | 核查关键字段 | 候选观察及历史冻结值对照 |
| --- | --- | --- |
| S0-H1 snapshot list | Source Snapshot name、UUID、CurrentSnapshotUUID | `SanQ-Runtime-B4B2-Clean-Baseline-20261017` / `028a681b-18b9-4dc7-a67f-69257e7cf85b`：一致 |
| S0-H2 snapshot showvminfo | Source VM UUID、snapshot base VDI、NIC/隔离、快照配置 | Source VM `4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033`，snapshot SATA base `66ad835f-8e92-4e9f-96e0-5907f6296169`，NIC1 Host Only/其余 disabled，snapshot shared folders none；Snapshot Clipboard **Bidirectional**（保持有限风险，不隐瞒） |
| S0-H3 Source showvminfo | Source 当前 UUID/state、active VDI、NIC、Clipboard | Source powered off，NIC1 Host-only，其余 disabled、当前 Clipboard disabled；当前 active image 是 `dec27e4f-b4ef-4e0f-9cfb-612931fd2aca` 差分盘，不等于 Snapshot base VDI 并非自动异常，二者各自时间范围应保留 |
| S0-H4 Recovered showvminfo | Recovered VM UUID、独立 VDI、NIC、Clipboard/Dragdrop | UUID `162701f1-bf68-413d-9f2d-76c513554881`，SATA `39381cc9-f526-4e35-8a09-3a265cfe79f4`，VM running、NIC1 Host-only、其余 disabled、clipboard/drag-and-drop disabled；机器可见属性未显示 shared-folder 当前明细，不据此宣布不存在全部 Host/Guest 通道 |
| S0-H5 showmediuminfo | Recovered VDI UUID、Parent、格式和消费者 | `39381cc9-f526-4e35-8a09-3a265cfe79f4`，`Parent UUID: base`、normal/base VDI、`In use by VMs` 仅指定 Recovered VM；VM running 时 `State: locked write` 是观察值，本身不是损坏或已验证字节一致性 |

**证据缺口分级：**
- **MATCHED (operator-terminal excerpt)：**5/5 批准的 Host 命令文本、精确 Source/Snapshot/Recovered/VDI UUID、快照 base 盘来源、恢复盘独立 base、报告的 host-only NIC/clipboard 配置，没有发现当前观测的核心身份矛盾。
- **LIMITED：**无每条 shell 真正 rc、独立 stdout.bin/stderr.bin/UTC、Mac Host 身份独立签认、离机摘要/保管证明；无法验证输出是否截断或经历编辑。Source Snapshot clipboard 为 Bidirectional，不能声称快照隔离与当前 VM 设置完全相同。
- **UNKNOWN：**恢复 VM 的当前共享文件夹完整清单、所有 Host/Guest 实际网卡外联/路由状态、外设传输、取证前后是否改变状态，以及 Guest 内部 rootfs/mount 身份。这些不能由五项 Host 文本完全证明；Guest 九条命令属于未授权 S3，**不得为了补全而运行**。

**S0 当前裁定：`IDENTITY MATCHED (OPERATOR-OBSERVED) / EVIDENCE LIMITED / FULL S0 GATE NOT YET VERIFIED`**。无需重做已关闭的 C2，也不因为活跃差分盘和快照 base UUID 不同而要求 restore/snapshot；先收齐 Host 原始回执和独立见证、确认其余必要隔离字段。**S1 独立 Ubuntu Archive key/签名原件仍未取得/未运行 gpgv，保持 BLOCKED；S2–S6 均不启动。** 未触发任何生产/AWS 操作，C1 OPEN、G2 NO-GO、S2 PAUSED。

