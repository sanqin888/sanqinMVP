# C5-G2 / R1 S1 — Ubuntu Archive 真实签名原件采集程序与独立信任根门禁

**日期：**2026-10-18（America/Toronto）；**基线：**S0 审批 PR #2872 / CI #7375 success / dev merge `001d7c345bff43f8c29391fdf9da45286c57fb81`。  
**分支：**`docs/c5-g2-r1-s1-real-ubuntu-signature-evidence-20261018`。  
**状态：LOCAL SOURCE/TESTS/DOC AUTHORED / TESTS NOT RUN / NO GPGV SUCCESS / NOT PUSHED / USER REVIEW PENDING。**

## 1. 从「只有同源收据」转向真实独立信任材料

B2-1B 校验调用者提供 Release/Release.gpg/Packages/deb 的内部 SHA，却**不**执行 GPG。B2-1C/D 也没有独立原件可信来源。因此不能再把合成 byte-chain 组合包装成 S1 PASS。本阶段**只**创建一个给独立可信审阅机使用的**离线提交前可审阅的采集 CLI**；未来 S1 经准确源码/权限/信任根审阅后，操作员可以在**非 Guest/非生产**网络可用环境执行，以取得真实 Canonical 官方签名的原件、原始 gpgv 输出和永久 BLOCKED 的候选审核回执。

新增：
- `ops/runtime/root_python_s1_ubuntu_archive_collector.py`：外置、直接调用才会读取本地预先批准的 Archive keyring、从严格固定的 HTTPS 域名下载 Release 和 Release.gpg、执行本机 gpgv 并把原始两份元数据、keyring 副本、stdout/stderr、结构化 receipt 放入新的私有目录。不 import 到 installer、17 文件 Runtime Bundle、B1/B3B1/B2-1B、API 或 CI 运行路径。
- `ops/runtime/tests/test_root_python_s1_ubuntu_archive_collector.py`：使用**虚构原件、mock HTTPS 和 mock gpgv** 的 22 个纯离线测试方法，测试正向亦永久 BLOCKED、错误 key SHA/owner/权限、路径重用、缺 gpgv、错 key signer、签名失败/无 VALIDSIG、多签名、错误 Suite/Architecture、Release 时效、网络异常、redirect 和日志溢出。

## 2. 实际验签时的白名单与限制

强制固定：`https://archive.ubuntu.com/ubuntu/dists/` 下的 `noble`、`noble-updates`、`noble-security` 三种 pocket，**仅** `Release` + `Release.gpg` 两个对象；不支持新的 domain、redirect、代理、Guest、APT、下载 Packages/deb、Snapshot 时光回溯或 root 访问。下载使用 Python 标准库 TLS 校验；release 限 256 KiB、signature 32 KiB、keyring 1 MiB；任何 HTTP/签名/预算异常即 BLOCKED，私有目录保存已采集原件及失败 receipt。

信任根**不能由下载本身建立**。必须在不同于被测 Guest 的、受控且预先可信的审阅环境固定：
1. 实际审阅机 OS、操作者、独立 witness、固定 Git commit + collector 源码 SHA；
2. **既有且独立认证**的 Ubuntu Archive keyring 的准确只读绝对路径、文件 owner/mode、独立 SHA-256 原件和获取/验证依据。CLI 要求显式 `--approved-keyring-sha256` 匹配真实 bytes、拒绝软链接或 group/world writable 文件；只使用本地副本，不自动下载或安装 keyring。
3. `--approved-signer-fingerprint` 必须是下面的完整 Archive key 之一，实际 gpgv `VALIDSIG` 的 signer 主键需匹配：
   - 2012 Ubuntu Archive Automatic Signing Key：`790BC7277767219C42C86F933B4FE6ACC0B21F32`
   - 2018 Ubuntu Archive Automatic Signing Key：`F6ECB3762474EDA9D21B7022871920D1991BC93C`
4. 选定精确 pocket，签名通过后仍检查 Release `Origin=Ubuntu`、`Suite` 等于所选 pocket、`Codename=noble`、`Architectures` 含 amd64、Date 不在未来、Valid-Until（若有）未过期。若老 Guest 版本需要过期历史 Release，应另审 Ubuntu Snapshot 和到期语义，**不能在本批为验过期数据而放宽**。

官方独立审阅资料：  
https://documentation.ubuntu.com/security/software-integrity/archive-verification/  
https://documentation.ubuntu.com/security/software-integrity/image-verification/  

注意第二份文档也讲 CD Image Key，**Image Signing Key 不能代替 Ubuntu Archive Signing Key**。不得只截取 16 位 key ID；不得只看 `GOODSIG` 或 `gpgv rc=0` 而不核对 `VALIDSIG` 主键和 Release Suite。

## 3. 未来待复核的最小操作合同（**不可在本批直接执行**）

审阅机必须事先具备 Python3 标准库、真实 `gpgv`、HTTPS 通道以及 0700 的私有证据父目录。没有这些条件**不安装依赖、不开生产通道、不断开 Host-only Guest**。以下是准确程序和参数结构，但 `<...>` 是**尚未取得的独立信任证据**，不能直接代入运行：

```sh
python3 ops/runtime/root_python_s1_ubuntu_archive_collector.py \
  --pocket noble-security \
  --keyring /ABSOLUTE/TRUSTED/ubuntu-archive-keyring.gpg \
  --approved-keyring-sha256 <INDEPENDENTLY-APPROVED-64-HEX> \
  --approved-signer-fingerprint F6ECB3762474EDA9D21B7022871920D1991BC93C \
  --evidence-dir /ABSOLUTE/PRIVATE-PARENT/NEW-S1-RECEIPT
```

**`noble-security` 在上述命令只是示例，尚未证明 Guest 的准确包来源属于该 pocket**。必须由用户审阅代码的最终 commit/file SHA、审阅机与可信 keyring/目录的真实条件、目标 pocket 后再允许执行；即使此前用户已批准 S1「范围」，仍不把待审的这份**新程序**冒充已经冻结/已部署的准确执行器。

程序即使 `collectionCompleted=true` 且 `gpgvExitCode=0`，输出字段 `trustedKeyringAuthenticatedByIndependentWitness=false`、`officialArchiveMetadataAuthenticated=false`、`decision=BLOCKED`、`readyToInstall=false`；这意味着只验证了**在预期键环下的密码学签名**，还需非采集者独立核对 keyring 信任根及原始文件/rc/UTC/物理来源后才可裁定 S1 的特定范围。禁止修改该标志伪装 S1 PASS。

**必要交付材料**：存于用户侧私有目录的 `trusted-keyring.gpg`（公钥副本）、`Release`、`Release.gpg`、`gpgv.stdout`、`gpgv.stderr`、`receipt.json`；对每个原件在另个审阅主体独立重算 SHA。CLI 本身不在日志写出机密 key，不保存任何私钥；证据路径与 Host 身份不应直接进 Git/公开聊天。

## 4. 失败闭包和当前实际环境

本次 ChatGPT 独立容器为 Debian 13，`gpgv` 已存在，但**没有可作为此前可信根的 Ubuntu Archive keyring**，官方 URL DNS 实测 `curl: (6) Could not resolve host`；独立下载接口也无法拿到 keyring 原始 bytes。故本次未运行任何真实 S1 密钥验真，`signatureCryptographicallyValidUnderProvidedKeyring` 不是真实 true，未生成 S1 原件。不要把合成 CI 成功迁移到真实签名结论。

**本次交付仅限 MCP-workspace 本地源文件/离线测试/文档静态审阅**；不能在 workspace 执行 build/test/lint。下一步先向用户报告本地变化，取得单独远端 PR 授权后由 `.github/workflows/ci.yml` 的 `ops-checks` 跑全部 Runtime tests；再按独立信任根与可达性条件申请操作员真实 S1 执行材料的审阅/授权。

任何扩大 Archive 源站、支持 InRelease cleartext 签名、Ubuntu Snapshot 过期历史验证、下载 Packages/deb 或修改 B2-1B 预算，均须形成后续明确独立审议，而不偷偷纳入此批。

## 5. 既有 Gate 不变

C2 LIMITED CLOSED；S0 = IDENTITY MATCHED (OPERATOR OBSERVED) / EVIDENCE LIMITED；S1 = **AWAITING REAL VERIFIED SIGNATURE**；C1 OPEN；C5-G2 NO-GO；S2 PAUSED。S3 Guest、S4/S5 root 取证、S6 动态消费、R2–R5、AWS/生产权限均不被本 S1 CLI 授予。

## 6. 2026-10-18 — MacBook 候选可信根与 Runner 验签交付顺序（用户确认）

**本节是后续追加状态，不改变上文历史采集器签名和合成测试结论。** 用户选择 Google Drive 方案 B：继续复用现有 gdrive_secure 存储，MacBook 保存**完整原始证据离机副本**。现有生产 OAuth scope=drive/owner 对 Drive 对象仍具有写删能力，此已明确接受；crypt/目录约束不等同于 WORM 或独立 ACL。现有定时备份、配置与保留策略不改。

**S1-M0：**MacBook 专用公开公钥候选采集脚本 sanq_mac_ubuntu_keyring_candidate.py 通过聊天单独交付，**不提交仓库或 CI**；与它配套的 12 项 mock 模拟测试也不单独进入仓库，避免未提交的 import 造成 CI 错误。该脚本下载固定 Canonical 官方 URL https://archive.ubuntu.com/ubuntu/project/ubuntu-archive-keyring.gpg，检查本机 GnuPG gpg 导出主指纹与 2018 Ubuntu Archive 主指纹，保管原始 keyring、公钥 SHA256、原始 gpg stdout/stderr 和私有 candidate.json。它永久 decision=BLOCKED、独立认证和 witness 为 false；成功下载不代表公钥可信。用户 Mac 实测 Python=/usr/bin/python3、尚无 gpg，可自行安装 Homebrew gnupg，不能由采集脚本自动安装。

MacBook Terminal 示例（若文件已经下载到 Downloads，且操作者已独立安装 gpg）：

    command -v python3
    command -v gpg
    umask 077
    mkdir -p "$HOME/sanq-s1-private"
    chmod 700 "$HOME/sanq-s1-private"
    python3 "$HOME/Downloads/sanq_mac_ubuntu_keyring_candidate.py" \
      --evidence-dir "$HOME/sanq-s1-private/T1-candidate-001"

**S1-W1：**必须在独立于 Ubuntu 被测 Guest、Mac 本次下载和生产的既有可信包签名链（例如已认证 Debian trixie 安装的 ubuntu-keyring）交叉核对 Canonical Archive 公钥主指纹、版本和来源，记录独立 witness/UTC/stdout/stderr/rc/SHA。可能因发行包版本不同而 keyring 全文件字节不一致；须批准 **Mac 采集的准确 keyring SHA256**，不能让 Runner 自己生成可信 pin。S1-W1 尚未执行，T1 未批准。

**S1-R1：**W1 通过后另批提交只读 GitHub Hosted Runner workflow，限定 PR → dev、仅 contents:read、无生产/Drive/AWS/Mac 凭据。Runner 从已预先批准准确 SHA 的公共 keyring 开始，复用现有 root_python_s1_ubuntu_archive_collector.py 下载官方 Noble pocket Release + Release.gpg 真运行 gpgv，保存原始 bytes/rc/UTC/Runner run SHA 和独立离机副本。现有 collector decision=BLOCKED 不许更改为自动授信；CI 绿不等于独立 S1 PASS。本批不创建未确定 pin 的 Runner workflow。

**S1-D1 → S1-P1：**验签通过并完成人工授权后，再按准确 ID、create-only、读回 SHA 和 Mac 完整离机副本归档到 gdrive_secure:runtime-trust/v1；原备份系统不变。生产 Runtime 只读读取准确签认、目标源码/文件 hash、旧快照防回滚等，涉及生产可信根/特权 operator 边界；必须另行审阅并获得明确授权，**本次没有实施**。

当前：Mac 公钥没有实际采集，gpgv 真实验签/Runner workflow/Drive 证据归档/生产读回均未执行。C1 OPEN、C5-G2 NO-GO、S2 PAUSED。项目仓库本批只记录这份设计和工作日志。

## 7. 2026-10-19 — S1-W1 现场交叉核验与 S1-R1 本地准备（尚未远端执行）

> 本节是对 §6 历史「尚未执行」的后续现场记录，不改写之前状态。所有实测数据由 MacBook/Debian 操作员提供日志并经对照；MCP-workspace 本批没有执行联网 GPGV，也没有获取私有证据目录。

### 7.1 S1-W1 — 技术交叉核验 PASS / 独立审批 PENDING

- MacBook：Catalina 10.15、MacPorts GnuPG；使用非仓库的 `sanq_mac_ubuntu_keyring_candidate_macports.py` 自 Canonical 固定 HTTPS URL 获取 3,607 字节公钥文件，`T1-candidate-002/candidate.json` 的 `gpgExitCode=0`，但 `decision=BLOCKED`。
- 独立 Debian 13.7 trixie VirtualBox `SanQ-Forensic`：`debian-archive-keyring 2025.1`；APT 以 Debian 官方 trixie/main 安装 `ubuntu-keyring 2023.11.28.1-0.2`、`gpg`、`gpgv`；`dpkg -V ubuntu-keyring` 无差异输出。APT 危险跳过验签配置的指定 grep 未命中。
- Debian CD Signing Key：`DF9B9C49EAA9298432589D76DA87E80D6294BE9B`；MacPorts `gpgv --keyring ... SHA256SUMS.sign SHA256SUMS` 返回 `Good signature`（输出为中文）及 rc=0；Debian 13.7 `debian-13.7.0-amd64-netinst.iso` 的现场 SHA256 与签名清单相符：`a7ef94ac2fb9a7fec454552abd629b7cc9d5155c886165a45649f5ce6167e355`。CD Signing Key 的身份来自 Debian 官方 HTTPS 与发布指纹，**没有宣称额外独立带外身份锚**。
- Debian `ubuntu-archive-keyring.gpg` 与 Mac Canonical 候选文件的 SHA256 均为 **`80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31`**；`cmp -s` 返回 0，确认为字节相同。公钥包含 Archive 2012 `790BC7277767219C42C86F933B4FE6ACC0B21F32`、Archive 2018 `F6ECB3762474EDA9D21B7022871920D1991BC93C`，以及不同用途的 CD Image Key；**CD Image Key 不能签 Archive 来源**。
- 原始 `candidate.json`、`gpg.stdout`/`stderr`、Debian 公钥副本、Debian CD 签名清单、签名、核对文件及原始 `gpgv.stderr`、退出码保存在 MacBook `~/sanq-s1-private/`，不提交 Git。**完整原始证据的另名见证审阅、持久归档、批准签认尚未完成**，不能仅依据操作者的文本转录自动升级信任标志。

判定：**S1-W1 TECHNICAL CROSS-CHECK PASS / FORMAL INDEPENDENT WITNESS APPROVAL PENDING**。此处的精确 SHA256 为交叉核验的**候选固定 pin**，而非已经赋予生产安装权限的独立批准。

### 7.2 S1-R1 本地代码设计边界

以 `origin/dev@a36690f0576cb727513ea79b96377a766d9b9fb6` 为基线，在隔离 MCP-workspace 编写：

- `.github/workflows/runtime-s1-r1-ubuntu-archive-evidence.yml`：仅 `pull_request → dev`，且限定同仓库 PR；`permissions: contents: read`；`actions/checkout@v6` 不保留凭据；Ubuntu GitHub-hosted runner、无 secrets、AWS、Drive、生产 SSH/部署权限；失败仍上传公开原件 artifact（GitHub Artifact 有保留期限，不是 WORM）。
- `ops/runtime/root_python_s1_r1_runner_evidence.py`：仅在上述精确 Runner PR 上运行，固定候选 keyring SHA256、Canonical HTTPS 公开公钥 URL、Archive 2018 完整指纹、`noble` pocket；拒绝 redirect、超限下载、哈希不符、覆盖既有目录，使用独立 0700 私有目录/0600 文件。**无新依赖，不调用 apt、无 root/Guest/生产/云控制面动作**。
- 完整调用**现有** `root_python_s1_ubuntu_archive_collector.py` 的 `collect()` 执行真实 `gpgv`；不修改 Collector 的单签名、Release Suite/时间、下载域名或 `decision=BLOCKED` 防线。保留 `Release`/`Release.gpg`、原始 GPGV stdout/stderr、Collector receipt、候选公钥、Runner JSON（run id/attempt、PR HEAD、checkout merge SHA、源文件 SHA256、UTC、自报 Runner image）、sha256-manifest；不在 Git 保存任何运行产物。
- 新离线 unittest 覆盖 PR/仓库/事件约束、固定 hash 和创建目录、不匹配/网络失败、Collector FAIL 或企图升级 authority、来源/预算/redirect 和 workflow 权限约束。实际 CI 以已授权 PR 的 `ci.yml` `ops-checks` 等真实 Actions 为准；MCP-workspace 不执行测试。

Runner 若真实验签成功，**只代表候选公钥下的签名与限定 Release 元数据核验完成**；`independentWitnessApproved=false`、`readyToInstall=false`、`authorizedToMutateProduction=false`、`decision=BLOCKED` 均不变。失败及外部签名多签等不兼容情况都必须如实 FAIL，不临时扩大允许签名或调整预算以求 CI 绿。

**本地改动完成后停在用户审阅门禁**；用户另行批准才可推送 PR→dev，等待 CI 和真正公网 GPGV evidence。下一阶段由用户在 MacBook 下载 GitHub 原始 artifact，与准确 PR/head/merge SHA、原始数据和 file digest 重新独立核对，再决定是否申请 S1 独立信任审批和独立 Drive 归档。无此审批不触碰生产；C1 OPEN、C5-G2 NO-GO、S2 PAUSED。

## 8. 2026-10-19 — S1-W1 / S1-R1 / S1-D1 限定收口和 R1 剩余门禁（后续续记）

> **最新有限结论：W1 TRUST ROOT LIMITED APPROVED / S1-R1 HOSTED EVIDENCE VERIFIED / D1 ENCRYPTED ARCHIVE READBACK VERIFIED（操作员回传）；Runtime R1 与 C1 仍 OPEN。** 本节是 §6–7 当时“未执行/PENDING”的后续记录，不追溯改写历史事实。GitHub 公开记录经只读检查；MacBook、Debian、独立见证审批、Google Drive 的私有证据来自操作员回传的原始终端/文件摘要，本仓库没有取得私有原件。任何 LIMITED 证据不能自动提升程序的 BLOCKED 权限标志。

### 8.1 W1 可信公钥与限定审批

- 独立 Debian 13.7 “SanQ-Forensic” 使用 Debian 签名 ISO 与官方 APT 来源安装 ubuntu-keyring 2023.11.28.1-0.2；经既有 SSH 连接复制 Guest 的 /usr/share/keyrings/ubuntu-archive-keyring.gpg 原始文件到 MacBook，不改变 Debian 系统文件。该文件与 MacBook 从 Canonical 固定 HTTPS 获取的候选 keyring 均为 **3,607 bytes**，SHA-256 **`80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31`**；先前的 0-byte Mac 本地副本已由正确原件替换。
- 指定 Ubuntu Archive 2018 signer 完整指纹 **`F6ECB3762474EDA9D21B7022871920D1991BC93C`**。操作员回传独立见证人的**限定审批邮件**；非空审批原件 “SanQ S1-W1_R1 Independent Witness Approval.eml” 的本地 SHA-256 **`9eccc8f068213d5e64d87423049e0528cd95e662f3be40a578b6c0f55f6770d4`**，已收入私有归档。尚未对本地 .eml 与 Gmail 服务器原始 MIME 做字节级同源复核，不将邮件身份核实或存储可用性夸称为独立数字签名/WORM。
- 批准只限定上述**准确公钥 pin + 指定 S1-R1 Runner 的 noble Release 取证**；不扩展为 noble-updates/noble-security 的实际包来源、Guest/root FD、动态加载闭包、生产执行/安装许可。

### 8.2 S1-R1 Hosted Runner 实测与离机文件

- [PR #2876](https://github.com/sanqin888/sanqinMVP/pull/2876) 已 merge 至 dev；PR head **`7fc97e0ea8c7e8f1b59091cd8c581ab52e5c9185`**，merge **`c2e33af27bb15ad5ba209dd3831a2aae5a462d4a`**。[Actions run 39285377503](https://github.com/sanqin888/sanqinMVP/actions/runs/39285377503) 的 pull_request 工作流整体 success，固定 Ubuntu Archive 2018 keyring 的 noble Release/Release.gpg 原件采集和 artifact 上传步骤均 success。
- 原始 artifact：`runtime-s1-r1-archive-evidence-39285377503-1`（ID **`12202742878`**）；操作员离机 ZIP **95,238 bytes**，SHA-256 **`bfe1ef28fa60a6479b8b90c53f3253de5ff1f8ae4e6fa7fa888fa980f25addce`**。MacBook 原件 ZIP 和内部八份证据对 manifest 的检查完成，操作员用 MacPorts gpgv 对保留的 noble 签名验证得到 rc=0。它仅证明**对应 keyring 与准确 noble Release 元数据**的签名链，不能证明 Packages/deb、具体 Guest 运行字节或实际依赖消费。
- 既有 Collector/Runner 的 `decision=BLOCKED`、`readyToInstall=false`、`authorizedToMutateProduction=false`、`independentWitnessApproved=false` **不变**；外部人工审批不通过修改机器自报权限标志实现。GitHub Artifact 的保留期限不能代替离机归档。

### 8.3 S1-D1 加密归档与读回

- 本地 `D1-archive-20261019/` 共有 **15 个证据文件 + SHA256SUMS**；操作员执行清单核对 **15/15 OK**。`SHA256SUMS` 文件 SHA-256 **`52add45e4c9da86a5ce1a0458fc91fc49c9cbf5d1250d26dc55668670cbb97c4`**。单包 `D1-archive-20261019.tar.gz` **176,044 bytes**、SHA-256 **`0f0683a2a9ae2c68c572d28864d66c6e9646cd7da9d287c9423e1574fd282600`**。MacBook 到 SanQ VM 私有暂存经 SSH/scp 后的摘要相同；原备份程序/配置未改变。
- 已按操作员回传执行，目标 **`gdrive_secure:runtime-trust/v1/S1-W1R1-D1-20261019-0f0683a2/D1-archive-20261019.tar.gz`**；`rclone lsjson --original` 回传单个对象、size 176,044、**Google Drive ID=OrigID=`1cOiq-V7wjef-F5kOivVsD5uC1Ct5QA-y`**；`rclone cat` 解密读回 SHA-256 **`0f0683a2a9ae2c68c572d28864d66c6e9646cd7da9d287c9423e1574fd282600`**，结果 “D1 UPLOAD AND READBACK SHA256 PASS”。
- 这是**准确对象在本次读回时与原件一致**的证据，不是持续不可篡改证明：Drive 允许同名文件，预检查加新建不提供原子 create-only，现有 OAuth/crypt 也不是 WORM。MacBook 完整 tar.gz 已保留；用户计划再复制 U 盘，**U 盘副本实际写入/独立哈希尚无验收记录，不能标 PASS**。早期 `T1-candidate-001` 未纳入 D1 归档，不能作为可清理的已归档原件；.eml/私有原件不进入 Git。

### 8.4 R1 整体剩余的证明与阶段顺序

最新只读 GitHub dev HEAD **`58e317b79024a027644be7ec55e5eb7b9ad71143`**。R0 的 R1 是 **B4B-3B/3C 全部真实来源、真实执行闭包和独立消费见证**；内部名称 “S1-R1” 仅表示 S1 Hosted Runner，**不等于 Runtime R1 CLOSED**。

| 子门禁 | 当前裁定 | 仍需完成 |
| --- | --- | --- |
| S0 | IDENTITY MATCHED / EVIDENCE LIMITED | 复用 C2 N-07 有界接受，只补 root 取证必需的新鲜 Host/Guest 身份、rc/UTC/原件/独立 witness 和隔离/namespace，不重做 C2 |
| S1 | LIMITED APPROVED / EVIDENCE VERIFIED | 仅上述准确 noble Release 与 keyring，不能外推到真实包 |
| **R1-S2**（Ubuntu 来源，不是 S2 daily） | OPEN | 取得目标 Ubuntu 实际版本/pocket 的认证 Release → Packages[.xz] → 准确 .deb → member/symlink 原始证据与外部 pins，复用 B2-1B/C/D |
| S3 | PARTIAL | 准确 Host 5 / Guest 9 只读命令输出/rc/UTC/独立保管；额外命令逐条另审 |
| S4 | NOT READY | 冻结准确 Guest root collector 源码、commit/file SHA、root-only 路径、argv/env、权限、失败保留和独立审阅方案 |
| S5 | NOT RUN | 经单独 root 命令批准后在隔离 Guest 验真实根锚 /、mount namespace、alias/FD/inode、实际文件 SHA 与原始离机 witness |
| S6 / B4B-3C | NOT IMPLEMENTED | 正式**正常更新执行器**的真实 CPython import、ELF PT_INTERP/DT_NEEDED/RUNPATH、dlopen 与完整传递依赖消费见证，和认证字节逐项对照；静态 AST/ELF 线索不构成 PASS |

建议 **R1-A（来源 R1-S2 + 必要 S0/S3）→ R1-B（S4/S5）→ R1-C（S6 + 独立 C1 裁定）**。依 R0 D1/D5，旧故障机自举 clean reinstall 的专用完整依赖重建链已退出首版关键路径，无需重复；正式正常更新执行器的来源、完整依赖和实际消费仍是强制门禁。R2 只读 readiness 可并行，正式批次仍按 R1 → R2 → R3 → R4 → R5；新的 Guest/root/生产/AWS 实测与源码扩权必须另获批准。

**总状态：R1 OPEN / C1 OPEN；C2 CLOSED（isolated synthetic / N-07 limited accepted）；R2–R5 未开始正式实施；C5-G2 NO-GO；S2 daily 扩充 PAUSED。** 本次仅补文档与证据索引，不变更 17 Bundle、CI、Ops 源码、凭据、运行环境或机器权限。

> 本节为 2026-10-19 历史停点；2026-10-20 的原件重算与有限人工确认见下方 §9。

## 9. 2026-10-20 — R1-A 七包来源原件离机重算与有限人工文档确认

**当前有限结论：R1-A EXACT-OBJECT SOURCE BYTES TECHNICALLY VERIFIED / HUMAN DOCUMENT REVIEW LIMITED；R1-A 整体正式验收仍 OPEN，Runtime R1/C1 OPEN、C5-G2 NO-GO。** 本节更新 §8.4 的历史停点，不追溯修改旧回执、既有 W1 限定审批或 B2-1A/B/C/D 永久 BLOCKED 语义。可以继续 B2-1C 格式适配及 R1-B 源码/审批材料准备；没有新增 Guest/root/生产执行许可。

### 9.1 取得原件、审阅方法与证据索引

操作员在原审批包冻结的恢复实验资产上完成 Host 五条、Guest 原九条及八条补充非 root 只读查询，随后在 Mac 外置材料中保留签名、完整索引、七包和指定成员。采集、封存工具按用户要求只通过独立下载交付，**不进入仓库、CI 或 Runtime Bundle**。原始归档、完整审阅报告与 .eml 继续私有保存；公开仓库仅登记以下摘要及范围，不存 IP/MAC、机器实际路径、邮件地址、原始终端或凭据。

| 对象 / 有界证据 ID | bytes / SHA256 |
| --- | --- |
| R1A-20261020-ARCHIVE-001（私有封存归档） | 53,612,982 bytes；`7ebd8a8fabf78c586ad0055b4c4049f0f99e14f06d91020e2150d7ec802e453a` |
| operator seal | `904afb5d7f15b9729415aa07e7fa27f08416fbcfc0f4dfda5284fedc349f727f` |
| frozen review scope | `c22c545080fe23db105c976b75a6d46a16ebbd10b2bcd7af53adac6565325550` |
| R1A-20261020-CODEX-BYTE-REVIEW-001（私有技术报告） | `38ceafc2b04f8b9487a06d61faf0528d479c3d2caf15bf769ab37ecc73bb81e3` |
| R1A-DOC-CONFIRM-ORIGINAL（原邮件，正文日期笔误） | 14,461 bytes；`e61dc05c5d4e1c71a10a36f0c2cede8eb1fdc47f7a340e1c4e2a403669d456d7` |
| R1A-DOC-CONFIRM-CORRECTION（更正邮件） | 22,438 bytes；`0358dd3c394ba2eb274897bf63059a64dbfcd5a81d4fca8f51d2ba021a4205bb` |

助手实际收到并读取归档，整体 SHA 与上传前操作员提供值一致；268 个归档载荷均为安全相对路径普通文件。六批原件共 **261 files / 92,751,937 bytes**，逐批原 SHA256SUMS、回执、来源代码 digest、跨阶段引用和副本一致性均已重算，未发现缺件或清单外文件。外层 PAYLOAD-SHA256SUMS 的 266 项与另绑定的自身/operator seal 共构成 268 个文件，不把此清单称为数字签名或 WORM。

| 原批次 | 清单匹配项（不含 SHA256SUMS 自身） | receipt.json SHA256 |
| --- | ---: | --- |
| HOST-RUNNING-001 | 15 | `453f22f3e107042cab52cffb6529f2206f09564eeb0c39661f06ea1f0faae901` |
| GUEST-RUNNING-001 | 45 | `cb618ce3f1ee90dbbe2598e6efe4a3ec8d0b97725b8fbc7c5361b4311de67952` |
| SOURCE-INDEX-UPDATES-001 | 18 | `5a0e54e9b5a07f85d9ed42766316ee63b607b2abe87bdaaf41b76f448dc30435` |
| DEBS-UPDATES-001 | 35 | `9429d9b1af3dd929a09ff6933b2f004611ee77be1dd7b98a65c9c6074d156881` |
| MEMBERS-UPDATES-001 | 92 | `1e1a2c4500efabfba00c821b7a1340adbaa5664bd34513112a84ce96ff5d060d` |
| BASEFILES-001 | 50 | `35255ccdef262979f017d08c2b8aced81448fd4bcc62cc8610f5bb259ad47374` |

本次技术重算发生在独立于采集 Mac/被测 Guest 的会话审阅环境，使用另写的解析代码，**未执行上传的采集程序或 Guest ELF**。采集辅助程序与本轮审阅代码均由同一 Codex 助手编写，不称为另一个主体的独立技术见证。环境 Python 3.12.14、gpgv 2.4.4、python-zstandard 0.25.0 / libzstd 1.5.7、dpkg-deb 1.22.6、readelf 2.42。七包 control/data 的 14 条 tar 流另用 dpkg-deb 只读接口交叉核对，均逐字节相同；不安装软件、不执行包控制脚本。该检查不是 MCP-workspace 项目测试，不冒称运行了仓库测试或原 B2-1C。

### 9.2 精确 Ubuntu 来源链

沿用 §8.1 准确 keyring SHA `80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31`。本次用独立新建私有 homedir、显式 keyring 重新运行 gpgv，rc=0，实际单一 VALIDSIG 指纹为 `F6ECB3762474EDA9D21B7022871920D1991BC93C`；另与 Ubuntu 官方 HTTPS 文档公布的完整 Archive 2018 指纹核对。没有重新建立或扩大旧 W1 的人工批准范围。

| 签名链对象 | 本次原件重算 |
| --- | --- |
| Release / Release.gpg SHA256 | `5657d348e3ee3de1ab63346ffc48661ed67398783c0b00f9d988a935ce72bf39` / `cc82339ef3f88e743952ca235ee097c81fb783e1a764fc4bf7a8273203875c75` |
| Suite / Codename / Release Date | noble-updates / noble / 2026-10-20 02:31:53 UTC；采集开始 03:25:05 UTC，晚于签发时间 |
| main/binary-amd64/Packages.xz | 1,397,112 bytes；`424e9966d4d549da3f08f0737b0cefbcfffd76464ba25efee146647b198bd6f5` |
| 完整解压 Packages | 7,559,949 bytes / 6,993 stanza；`adb6cd7b58823ed0d7b4d2cf2859c29e47a9696942196c14a4a0513e4946b5df` |

压缩与完整解压索引的 Size/SHA 均匹配签名 Release，七个精确版本/amd64 分别唯一命中，未使用筛选 stanza 摘录冒充完整索引。保留 Release 无 Valid-Until 字段；核对了签发与采集时间，不虚构到期字段，不代表未来安装新鲜度已批准。此次准确版本均命中该冻结索引，无须为这七个对象另找 Snapshot。

| 包 | 版本 | deb bytes | deb SHA256 |
| --- | --- | ---: | --- |
| python3.12 | 3.12.3-1ubuntu0.17 | 650732 | `6745c9463432e619d7402b117ad4ac86c31dcd3999ba20daa9e395f6f9909d86` |
| python3.12-minimal | 3.12.3-1ubuntu0.17 | 2334634 | `d452689b9660845345a4c3e05e4ad82c082d5474e04031b7aa47f1a6d5610a6e` |
| libpython3.12-minimal | 3.12.3-1ubuntu0.17 | 838536 | `d646ad7112b5adec21ba0e1af015f04ae8ca7f5efdc619622547dd6673c4c14b` |
| libpython3.12-stdlib | 3.12.3-1ubuntu0.17 | 2070530 | `45d3f530ba1f9d6e879ad46b92046fabab13fe50a82450e4f65557a3bbad1489` |
| libc6 | 2.39-0ubuntu8.9 | 3264314 | `ff5557d99b51f761c4b7c92368b9cc45565eda17df9bf9eb4b134d09825008be` |
| libc-bin | 2.39-0ubuntu8.9 | 682164 | `066398a06ef1a218d4109461d4c636eafe83322ad19b179de9ef7af42b3fec58` |
| base-files | 13ubuntu10.5 | 73220 | `87e8c41e62f61625fb78a982d0bc0a70f40ef8375bc313b154914d1b3759c823` |

合计 **9,914,130 bytes**。各原始 deb 的 Filename、Size、SHA、control Package/Version/Architecture 均匹配完整索引与冻结范围，包成员路径没有被重打包或重新压缩来适应旧解析器。

### 9.3 三个普通成员、根别名与 Guest 关联

| 角色 / 包内路径 | 来源包 | bytes / uid:gid:mode | 原始成员 SHA256 |
| --- | --- | --- | --- |
| Python / usr/bin/python3.12 | python3.12-minimal | 8020928 / 0:0:0755 | `e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f` |
| os.py / usr/lib/python3.12/os.py | libpython3.12-minimal | 39786 / 0:0:0644 | `316d1b7307fd851bded3423c9d437e0a383c725d993f0fcff2e8b749fe560b62` |
| loader / usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 | libc6 | 236616 / 0:0:0755 | `c20a2dc8917c755f02b94049356320fe1f62ac7d9f8994731f807d9df39302da` |

三个 regular 成员在本次七包范围内各有唯一归属，共 8,297,330 bytes，重算字节与保存的 selected 副本一致。**这不是从 Guest root-held FD 读出的 SHA，也不是全系统唯一归属证明。**

| 包内 symlink | 来源包 | 原始 link text / SHA256（不含换行） |
| --- | --- | --- |
| lib | base-files | `usr/lib` / `bb40df61b3e0947109adb2e4d4ec41261d2c50580463391f34d67b5f30712176` |
| lib64 | base-files | `usr/lib64` / `1a8dcebf89cf73748aa1a3c88dd1ecc2a040ffabb45a10d9231a642e1a89913b` |
| usr/lib64/ld-linux-x86-64.so.2 | libc6 | `../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2` / `bb9802014f1e2bee7c7edb539ab3cbe7f3ebcfaa7921cc321b81169602cc5768` |

三者 0:0:0777，与 Guest 保留的 readlink 输出文本相符；包内无换行 link text 与命令 stdout 的换行分开处理。base-files 前缀链接 + libc6 叶链接归一到上述 loader regular member；不用伪造 `lib64/ld-linux-x86-64.so.2` 包内成员。readelf 只读确认包内 Python 为 ELF64/x86-64，PT_INTERP 正是 `/lib64/ld-linux-x86-64.so.2`。

已核对五条 Host、十七条 Guest 记录的原始字节/rc/UTC/摘要与 wire packet：Host 直接执行 inner rc=0、outer rc=null；Guest inner/SSH outer rc 均为 0。冻结恢复资产关联匹配，Host 原始及 Guest 前后记录的 running/hostonlynetwork、其余 NIC none、clipboard/draganddrop disabled、无报告共享文件夹一致；旧源快照的双向 clipboard 仍单列历史事实。会话内 boot-id/mount namespace 文本相同；完整 installed inventory 695 行，七包 installed 身份一致。准确包归属和版本不能单独证明 Guest 文件未被改写；Host/Guest 原件自报与 SSH 关联不等于物理来源或受损内核的独立认证。`guestRouteAuthenticated=false` 继续保留。

base-files 控制脚本只作为数据读取，未运行，也不从 dpkg-divert/安装脚本提示推断历史现场行为。Python 静态 DT_NEEDED 见 libm.so.6、libz.so.1、libexpat.so.1、libc.so.6；七包与这三个起始成员不是完整 CPython/ELF/dlopen 依赖闭包，后续属于 R1-C，不在此扩展采集。

### 9.4 邮件确认的准确性质及下一步

更正邮件于 2026-10-20 10:25:17 -0400 发出，明确上一封日期有误，正文署名日期从未来的 2026-10-26 更正为 2026-10-20；两份原件分别保存，归档 hash 引用正确。原邮件 SHA 与操作员 Mac 回传一致；更正邮件 SHA 由助手对上传原件计算，**尚无更正件 Mac 端单独 hash 回传，不冒称双端重算已核对**。

邮件明确「人工文档审阅」「技术结果依据报告」「未自行运行验签或软件包校验」，并排除 root/生产安装/上线批准。故只登记 **HUMAN DOCUMENT REVIEW LIMITED / ACKNOWLEDGED FOR DEVELOPMENT PREPARATION**；不是另一主体已独立重验七包/签名的证明，不能填为 FULL INDEPENDENT TECHNICAL WITNESS PASS。没有另证发件人与采集人的主体独立性、服务端 MIME 同源或数字签章；邮箱头认证声明不在本批冒充独立验证。

| 门禁 / 实施项 | 最新有限状态与接续 |
| --- | --- |
| 本批指定来源对象的原件技术检查 | PASS FOR EXACT FROZEN OBJECTS；补齐“未取得并重算原件”的缺口，不自动扩大旧 W1 |
| 必要 S0/S3 | 原始回执 COLLECTED / TECHNICALLY CROSS-CHECKED；平台真实性及独立 Host witness 仍 LIMITED |
| 人工确认 | 文档审阅 LIMITED；只同意作为后续开发准备依据 |
| B2-1C 真实格式兼容 | OPEN；七包实为无尾斜杠 ar + control/data.tar.zst，旧解析器拒绝；Mac 外置读取不代表 Runtime 已适配 |
| R1-B S4/S5 | 可准备有限源码、测试与准确权限/命令包；真正 root/FD collector 尚未实施/执行，执行仍需另批精确命令 |
| R1-C / C1 | OPEN；真实正常更新执行器的完整依赖与实际消费尚未验证 |
| Runtime R1 / G2 / S2 daily | OPEN / NO-GO / PAUSED；C2 维持既有有限 CLOSED，R2–R5 门禁不变 |

先提交本次 doc-only 续记并经 PR/CI 合并，再开始 B2-1C 最小格式适配；保留 budgets、拒绝边界与永久 BLOCKED 权限语义。格式/解码依赖与纯内存 owner 边界须在实施前核对，不能静默引入第三方依赖或外部执行。原件、Mac 辅助脚本及实际 Guest/root/生产行为均不属于本次仓库交付。

参考：[Ubuntu 指纹核验](https://documentation.ubuntu.com/security/software-integrity/image-verification/)、[Noble Archive key 示例](https://ubuntu.com/chisel/docs/latest/reference/chisel-releases/chisel.yaml/)、[Debian deb(5)](https://manpages.debian.org/unstable/dpkg-dev/deb.5.en.html)。网页用于身份/格式佐证，本次包事实来自上传原件重算。

