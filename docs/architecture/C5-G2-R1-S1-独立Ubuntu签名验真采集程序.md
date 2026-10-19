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
