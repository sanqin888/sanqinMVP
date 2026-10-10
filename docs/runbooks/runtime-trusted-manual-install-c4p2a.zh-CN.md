# C4-P2-A — 可信 Runtime 人工安装与失败恢复手册（方案 B）

**状态：源码级人工操作手册；不构成生产目录写入或切换授权。**
适用场景：SanQ 从旧生产路径 `/home/ubuntu/sanq-app` **首次**准备独立
`/opt/sanq/runtime`。本文是面向操作员的人工安装与恢复合同，
**不是可以直接复制整段执行的生产脚本**；任何生产目录创建、文件复制、
root 操作、timer/Compose 变更均须在 C4 生产变更审批后逐项执行。

关联文件：
- `docs/runbooks/runtime-backup-cutover-c4-prep.zh-CN.md`（全站成组切换、备份/Uploads/DB 回滚）
- `docs/runbooks/backup-recovery.zh-CN.md`（恢复与远端加密凭据）
- `ops/runtime/build_bundle.py`、`ops/runtime/runtime_trust.py`、`ops/runtime/stage_bundle.py`
- `ops/release/deploy_release.py`、`ops/verify-runtime-readiness.sh`
- `.github/workflows/publish-images.yml`

## 0. 冻结的决定与边界

**方案 B：GitHub 已发布的 Runtime Archive → 外部证明校验 → 独立暂存 →
人工 root-owned 安装 → 安装后文件清单校验。**

1. **保留严格白名单**。唯一权威是 `ops/runtime/build_bundle.py::SOURCE_FILES`，
   当前 17 个文件；打包、暂存和已安装 Runtime 的 `runtime_manifest()`
   必须对同一清单执行精确匹配。**不改** `SOURCE_FILES`、
   `build_bundle.py` 的打包/验签行为、发布 CI、镜像签章或部署控制器。
2. 不恢复已取消的独立 Root Launcher / 自动安装器 / symlink active Runtime。
   `/opt/sanq/runtime` 必须是 root 拥有的**真实目录**。
3. Runtime 初始化与应用镜像升级独立。镜像变化而固定 17 文件未变化且
   `verify_runtime_release()` 的 GitHub 前向比较通过时，无须重装 Runtime。
   若任何清单文件在两个 SHA 间变化，阻断普通镜像升级，要求另外审阅 Runtime 更新。
   白名单之外的新配置/端口/挂载依赖亦必须人工评估，不能仅靠差异清单放行。
4. 生产数据/容器不属于 P2-A：**不**创建激活标记、不启动新 Compose、
   不更新 `SANQ_IMAGE_SHA`、不停止/重启 Docker、MCP、backup timer、
   不修改 PostgreSQL `sanq-app_pgdata`、不复制/清空 Uploads、
   不安装新版 backup 脚本、helper、service 或 sudoers。
5. Runtime Archive 内的 `productionActivationAuthorized=false` **必须保持 false**。
   它是可信但惰性的发布产物；以后 C4 另行审核建立的
   `.sanq-backup-layout-activated` 才是本机布局启用标记，不能在 P2-A 建立。
6. 禁止把生产 `.env`、rclone crypt 配置、Token 或 SSL 私钥放进 Git、PR、
   Runtime Archive、日志、命令行输出、未经授权的目录或对话。

## 1. 已知生产基线（2026-10-08，只读证据）

| 不变量 | 已观察值 |
| --- | --- |
| 正在运行的应用 SHA | `a84b72007e6b4e82c981101e56c897355757c0ff` |
| Compose 项目与 DB volume | `sanq-app` / `sanq-app_pgdata` |
| API、Worker 上传挂载 | `/home/ubuntu/sanq-app/uploads`，双方相同 |
| Uploads 基线 | 本地/Google Drive 87 件、136154899 字节；`rclone check --download` 87 matching / 0 differences |
| 本地 backups | `/home/ubuntu/sanq-app/backups` |
| 当前 `.env` | 旧目录，ubuntu 拥有，0600 |
| 备份 | `sanq-backup.timer` enabled，03:30 America/Toronto，最近 2026-10-08 成功 |
| 旧 backup.service | `ExecStart=/home/ubuntu/backup-db.sh`，日志追加到旧 `backup.log` |
| MCP | 仍使用 `/home/ubuntu/sanq-app` 读取生产源码，独立 `/home/ubuntu/sanq-mcp` 安装 |
| 目标路径 | `/opt/sanq/runtime`、`/srv/sanq/uploads`、`/srv/sanq/backups` 均未安装 |

上表是一次性基线，**不是执行日的新鲜证据**。操作前必须重新核实活跃镜像、
运行中的挂载、数据库卷、备份及尚未清空的 Uploads；若 main 发布了更高 SHA，
不能擅自沿用旧 SHA。

## 2. 先决条件与停机门禁

开始 P2-A **任何写入**前均需：

- 用户明确授权生产目录/暂存写入，并指定审核通过的目标 full 40-hex SHA；
  `main` 的 CI 已全绿，`publish-images` 成功，配对镜像 digest 和
  `sanq/runtime-archive-sha256` 成功。
- 从该 `publish-images` 的 GitHub Actions Artifact 获取**原始** 
  `sanq-runtime-<SHA>.tar.gz`。人工记录 run ID、源 SHA、下载方式、外部
  SHA256、API/Web digest；保留原始归档字节，不能重新 tar/gzip 制作。
  Action Artifact 保留期 90 天，历史恢复副本须独立安全保存。
- `stage_bundle.py plan` 根据**独立 GitHub 状态**验证 archive 真实字节、
  Workflow 身份、Manifest、17 文件明细和与镜像的关联。该校验默认只接受
  **当前最新且完成的**配对 main 发行版；若以后发布了新 main，旧包无法
  通过此最新版本门禁，必须重新评估并选择新目标，**不能绕过**。
- 核实原生产 Compose 的 `./uploads:/app/uploads` 仍指向旧 87 件文件的
  完整旧数据，现有生产是健康的，确认 03:30 备份任务的执行窗口。
- `/opt`、`/opt/sanq`、`/opt/sanq/runtime` 的祖先不允许 symlink、
  组/其他用户写入。目标 `runtime` 必须尚不存在（首次安装）；如果存在
  则**停止**，转入单独审批的 Runtime 版本更新/恢复流程。
- 已审阅旧布局恢复方案：保留旧 Compose、旧 `.env`、原备份脚本、
  service/helper/sudoers 和旧数据；新布局的 DB、Uploads、配置及 TLS
  异机恢复证据属于后续 C4-P2-B/C/D 门禁，不能由 P2-A 代替。
- 确认下载、暂存与 root 操作的身份隔离；**不要用 sudo 直接执行可被
  ubuntu 修改的旧 checkout、staging 或未验证的 Python 脚本**。

任一证据不全：标记 `C4-P2-A BLOCKED`，保持生产旧路径不变。

## 3. 独立、惰性暂存（需单独授权才可写 VM）

**只读、无激活前置审阅示意：**

```bash
# 示意：操作者先在 GitHub UI 或受信任客户端取得 matching publish-images artifact。
# 在受信任的验证环境使用该 release 对应、已审阅的 Python 校验源码。
# GitHub API 凭据仅通过已保护环境提供；不得回显。
SHA='<经确认的 40 位 main full SHA>'
BUNDLE='<受信任输入位置>/sanq-runtime-<SHA>.tar.gz'
python3 ops/runtime/stage_bundle.py plan --bundle "$BUNDLE" --source-sha "$SHA"
```

操作员应将这些**参数替换为实际经审核值**，不得按字面执行占位符。
`plan` 只验证输入，不把用户可写目录变为可信生产目录。

若另行授权实际暂存，预先准备固定 `/opt/sanq/staging`：
`/opt` 和 `/opt/sanq` 仍由 root 拥有且不可被普通用户写入；
`/opt/sanq/staging` 应由实际执行 staging 的**非特权账户**独占，
模式 0700。源代码里 `stage_bundle.py` 的
`ensure_private_staging_parent()` 要求 staging parent 所有者等于执行者 UID；
因此不能盲目在 root-owned staging parent 下以 ubuntu 运行。

**暂存命令格式，非本阶段执行授权：**

```bash
python3 ops/runtime/stage_bundle.py stage \
  --bundle "$BUNDLE" --source-sha "$SHA" --execute
```

只有成功通过**外部独立证明**，才会创建
`/opt/sanq/staging/<SHA>`，保留 `runtime-archive.tar.gz` 的**原始字节**、
解包得到的固定 17 文件和 `runtime-release.json`。
其输出仍是 ubuntu 可写的**不可信输入**，**不能**因此给目录加上 root 所有权
便宣称可信；也不能将 staging 当成运行目录。

## 4. 人工 root-owned 首次安装（独立审批的 P2-A 写入步骤）

仅在第 2～3 节证据获审核对后安排专门的操作者执行；不得把本节改写成
未经审阅的“一键 sudo”命令。须完成以下人工事务和审计记录：

1. **复制归档进入 root 私有临时目录**。由授权 root 操作者创建固定
   `/opt/sanq` 下、模式 0700 的唯一临时目录；将暂存的
   `runtime-archive.tar.gz` 拷入其中，拒绝目标存在、symlink、
   非普通文件或同名覆盖。不得直接执行 staging 中的脚本。
2. **在 root 私有目录重验可信字节**。以外部 GitHub 状态确认的
   SHA256 比较**root 私有归档**，并复核此前通过的 archive 结构/精确文件
   白名单/Manifest。两次结果都必须和固定的源 SHA、publish run ID、
   API/Web digest 一致；若差异发生在从 ubuntu staging 复制之后，
   必须停止并人工排查，绝不使用 `--force`。
3. **受控解包**。仅从已经校验的 root 私有归档提取已审核的
   `sanq-runtime/` 子树（17 个源文件和一个 Manifest）。禁止解包任意
   路径、symlink、hardlink、特殊设备或额外成员；保留 root:root
   所有权，固定目录 0755 或更严格、源文件 0644 或更严格，
   所有文件/祖先均禁止组/其他用户写入。执行文件可按必要权限单独授予执行位。
   不将 `runtime-archive.tar.gz` 当成第 18 个 SOURCE_FILE。
4. **重新校验安装目录**。对每一个 `SOURCE_FILES`：
   验证真实普通文件、无 symlink/不可信祖先、root:root 所有权、
   非组/其他用户可写、大小限制及内容 SHA256 与 Manifest 一致。
   `runtime-release.json` 也必须 root:root，非组/其他用户可写。
   Manifest 的 `sourceSha` 和 `applicationImages` 必须对应第 2 节的
   外部可信发布证据。文件集合不能宽松匹配。
5. **配置单独移交**。从当前**确实正在被生产使用**的旧 `.env`
   安全复制到待安装目录，保持 ubuntu:ubuntu 和 0600，不打印敏感内容；
   恰有一个 `SANQ_IMAGE_SHA`，并与实际运行 API/Web 镜像 full SHA 一致。
   不从旧的 07:30 配置备份直接覆盖生产新 SHA。目录 root-owned
   不影响 ubuntu 对原样保留的私有 `.env` 的读取。
6. **首次固定目录发布**。仅在 `/opt/sanq/runtime` 不存在，且验证
   root 私有临时目录中的**已校验解包子目录** `sanq-runtime/` 与目标位于
   同一文件系统的前提下，由 root 将**该子目录**重命名到
   `/opt/sanq/runtime`（不要把含有原始归档的临时父目录改名为 Runtime）。
   重验路径属主、mode、Manifest、17 文件与 `.env`，记下输出作为审批证据。
   不可通过 symlink 做 active path，不覆盖已有 Runtime，不从 ubuntu staging
   做直接 rename。
7. **停在 INACTIVE**。`/opt/sanq/runtime/.sanq-backup-layout-activated`
   必须不存在；不得在此时执行 `deploy_release.py deploy --execute`、
   `docker compose up`、新版备份程序或
   `ops/verify-runtime-readiness.sh`（其激活标记/目标数据挂载门禁尚未满足）。
   即使手动安装成功，也只标记 `P2-A PREPARED / NOT ACTIVATED`。

**原子性边界**：目录在同一文件系统内重命名可防止出现
`/opt/sanq/runtime` 目录只复制一半的状态；**不能**为
Docker 切换、备份脚本、Uploads 或数据库提供原子性。首次安装没有原
`/opt/sanq/runtime` 时才适用；后续 Runtime 版本更替必须单独审批、
保留完整已安装版本，并在暂停写入的受控流程中完成。

## 5. P2-A 退出验收证据（缺一项不能标记 Prepared）

操作员记录**不含秘密的**证据：

| 证据项 | 验收条件 |
| --- | --- |
| 发布来源 | `main` full SHA、CI run、publish run、两个 GHCR Digest 和 Runtime 外部 archive SHA256 均匹配 |
| Archive | 原始压缩包字节匹配独立 GitHub SHA256；未经重新打包 |
| allowlist | 完整且只有 17 个 `SOURCE_FILES`；没有新增例外 |
| 安装 | 真实目录 root-owned、无 symlink、无宽松写权限；每个文件与 Manifest SHA256/bytes 一致 |
| `.env` | 仅 ubuntu 可读写，镜像 full SHA 与实际线上一致；不得输出内容 |
| C4 Marker | **不存在** |
| 生产现状 | Docker 服务、旧 Uploads 绑定、原数据库 volume 与 backup timer 均未改变 |
| 回退材料 | 当前旧目录/配置/备份脚本/恢复方案保留；可信 Archive 在 Actions 过期前另行安全留存 |

这批人工安装后仍需要 P2-B（数据复制/恢复门禁）、P2-C（维护窗口成组
切换）和 P2-D（实际容器挂载、备份恢复、健康和业务实测）。
**P2-A 不等于 C4 PRODUCTION VERIFIED。**

## 6. 停止点与人工回滚矩阵

| 时点 | 错误/中断时的必需动作 |
| --- | --- |
| 可信归档检查失败 | 不解包、不创建 active Runtime；不修改生产 |
| staging 写入中断 | 不信任半成品；保留日志并人工隔离失败目录；旧生产不变 |
| root 私有准备/Manifest 校验失败 | 不 publish `/opt/sanq/runtime`；人工保留或隔离取证；旧生产不变 |
| P2-A 目录发布后、C4 激活前 | 仅把新 Runtime 标为 **未激活待恢复**；旧 Compose/备份/Uploads 正常。不自动删除 `runtime` |
| C4 维护窗口中途 | **禁止只改一个路径**。先停止新写入与 backup timer，核对新旧 Uploads 差量、Compose 容器挂载及原 DB volume，按 `runtime-backup-cutover-c4-prep.zh-CN.md` 成组恢复旧布局 |
| C4 切换后发现新文件写入 | 不直接重启旧 API/Worker 指向旧 Uploads；先停止写入、比较两侧及 DB 引用，将未合并的新增/更新文件受控恢复，拒绝盲目 `rclone sync` |
| 备份失败 | 先禁用新备份任务及 C4 marker（经审阅操作），避免从空目录更新云端镜像；恢复匹配的旧脚本、helper、unit 和日志路径，校验后才恢复 timer |
| Runtime 升级失败或部分覆盖 | 中止后续发布；使用保存的**完整匹配**的 Runtime 和镜像证明人工恢复；不得仅修改 Manifest 的 SHA 伪装恢复 |
| 任何 DB/schema 不一致 | 不恢复旧 DB 卷、不自动逆转 Migration；人工评估兼容性和恢复时间点 |

清理失败暂存目录、Root 私有目录或以后删除旧 checkout，均需独立审阅
**准确的目标路径、owner/mount/symlink**，不得用通配符
`rm -rf` 或全目录覆盖替代恢复。

## 7. 与现有控制器的接口和剩余工作

- `stage_bundle.py` 的 `plan` / `stage --execute` 负责**外部证明、
  安全暂存**，不负责安装或激活。
- `deploy_release.py::runtime_manifest()` 负责已安装
  17 文件 + Manifest 校验；`ensure_repo_location()`、
  `require_c4_activation()` 和 `check_live_storage()` 要求 **C4
  布局已切换** 才能进行完整部署 preflight。不要在 P2-A 人工制造
  激活标记来通过 preflight。
- `verify_runtime_release()` 当前以**严格 17 文件差异**决定已有 Runtime
  是否可复用于新应用 SHA，并保留先行 GitHub 发布 proof 的校验。
- C4-P2 首次安装**不**新增独立 Root Launcher/自动版本安装器、
  不修改 `SOURCE_FILES`、CI、`ops/runtime/runtime-layout.v1.json`、
  数据库或 API/Web 业务代码。
- C4-P2-B/C/D 需另行形成生产数据迁移和完整恢复的逐步命令手册。
  MCP 的独立 `server.py` 更新与最终 `/home/ubuntu/sanq-app` checkout
  删除属于后续验证/明确授权，不在 P2-A。
