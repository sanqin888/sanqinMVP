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


