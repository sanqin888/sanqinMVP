# R2-A1-HOST-READ-002 — 生产启动入口、Cron 与 Runtime 实装身份只读核验

> 审计日期：2026-10-23（America/Toronto）。本地文档审阅批次；生产取证命令**未执行**。基线：`origin/dev@d98acb089448836bdfef82fa5c498329b027ba52`（PR #2913、#2914 已合并，#2914 CI #7476 SUCCESS）。新分支 `docs/runtime-r2a1-host-read-002-20261023`。归属：Runtime / Data / CI / Ops。

## 1. 审计来源与裁定纪律

本批复核 `AGENTS.md`、`.github/workflows/ci.yml`、[R0](Runtime更新-R0冻结设计.md)、[AWS 快照与维护冻结合同](Runtime更新-AWS快照与维护冻结方案.md)、[R2-A1 §2/§7/§8](Runtime更新-R2-A1真实生产清单与接口只读核验.md)、[GHCR 发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)，及 `ops/runtime/{normal_runtime_update.py,runtime_update_contract.py,build_bundle.py}`、`ops/release/deploy_release.py`、`ops/backup/{backup-db.sh,sanq-backup.service}`、`ops/sanq-mcp/server.py` 等源码。本轮新鲜 MCP 现场只调用既有 `system_status` / `docker_status(include_stopped=true)`；不会把 MCP 的 GitHub `main` 源码读取工具误记为生产安装文件读取。

证据级别：`LIVE_MCP` 为受限现役 Compose/服务观测，`HOST_OPERATOR_HISTORICAL` 为用户此前贴回的现场文本（缺独立 rc/封存），`SOURCE` 为仓库代码合同，`NOT_OBSERVED` 为未执行的 Host/云查询。未观察内容不可升级为 VERIFIED。源码 `main@ef5caa32704dd59217b1151a5976e826c843c98f`、最新 `dev`、应用镜像 SHA、Runtime Manifest `sourceSha` 是不同身份。新一批 Host 命令均是**待操作者另外批准后执行的建议**，不是本次实测。

2026-10-23T12:20:56Z `LIVE_MCP`：Docker 与 `sanq-mcp-tunnel` active；4 个 `sanq-app` 容器（db/api/ubereats-worker/web）全部 Up(healthy)。api/worker 为 `ghcr.io/sanqin888/sanq-api:ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`，web 为相同 SHA 的 `sanq-web`；db 为 `postgres:15-alpine`。这次 Compose ps **没有**取得容器镜像 RepoDigests、systemd 全量 service、Cron 规则或磁盘 Manifest。

## 2. G02–G07 状态

| Gate | 现有已证边界 | 当前结论 | 关闭所需的最小新增证明 |
| --- | --- | --- | --- |
| G02 systemd/真实启动入口 | H06/H07 核实 docker/nginx/ssh/MCP tunnel 与备份 timer/service；H09 显示 cron、SSM、unattended-upgrades；H11 15 个 timer 全名已收齐 | **PARTIAL** | 全量 service `--full` 与 unit-files/service/socket 状态；精确关联可启动业务的 unit/trigger/drop-in；分类保留管理与阻断业务 |
| G03 Cron/自动安全更新 | `ubuntu` crontab 仅注释，系统 cron 目录已知文件名；`sanq-backup.timer` active/waiting/enabled | **PARTIAL** | `/etc/crontab`、已知 cron 文件的权限/有效执行规则、systemd apt/unattended 配置；root/其他用户 Cron 需另批授权 |
| G04 执行入口/非容器写入者 | 仓库存在 deploy `compose up/run`、备份 `docker exec/rclone`、MCP 限权、cloudflared 的容器 shim 进程痕迹 | **OPEN / SOURCE_SCOPED** | 已安装 deploy/backup/helper/rclone/Cloudflared 的实际持有者、可达命令入口与启动来源；跨周期重启/自动恢复证明 |
| G05 Runtime/Release 实装身份 | 固定 `/opt/sanq/runtime`，17 个受保护成员 + `runtime-release.json`；历史 U1 记录 `a84b72007e6b4e82c981101e56c897355757c0ff`（非本次现场） | **OPEN / HISTORICAL_ONLY** | 本次生产文件 owner/mode、全部 17 SHA256 对 Manifest、Manifest 自身摘要与来源、动态 release state + 镜像标签/digest 映射 |
| G06 救援/管理通道 | `ssh.service` active、EC2 Instance Connect drop-in 已观察；MCP Tunnel active，SSM agent running | **OPEN / REACHABILITY UNKNOWN** | SSH/EC2 Instance Connect/MCP/SSM 各自实际登录与权限/依赖的独立验证；确认维护屏障不会封锁救援 |
| G07 恢复点与外部事件 | DB `sanq-app_pgdata`、API/worker `/srv/sanq/uploads` RW、Web sounds 只读挂载已由 H04/H05 观察 | **OPEN / MOUNTS OBSERVED ONLY** | Lightsail 实际盘覆盖、PostgreSQL 一致停止/WAL、Uploads/sounds/主机配置、离机备份/恢复与外部支付/订单事件的停写和对账证据 |

**跨门禁结果：`G01 PASS_SCOPED / G02 PARTIAL / G03 PARTIAL / G04–G07 OPEN / R2-A1 OVERALL PARTIAL / R2-C4 OPEN / AWS S01–S12 OPEN / C5-G2 NO-GO`。** G06/G07 虽有管理单元、存储挂载的有限既有观察，但原有 Gate 保持 OPEN，**不**表示管理通道或恢复要求已通过；R2-A2 可先做离线接口设计，不能授予生产维护权。C2 历史隔离合成恢复 LIMITED-CLOSED、R1/C1 OPEN、S2 daily 扩充 PAUSED 状态不变。

## 3. 实际或候选启动入口清单

| 入口 | 来源与准确观察 | 维护时分类 | 尚需裁决 |
| --- | --- | --- | --- |
| Docker daemon / containerd 与四业务容器 | H03 现场 4/4 `restart=always`、RestartCount 0；本轮容器均健康；H06 docker 已启用 | **必须阻断自动业务复活，保留必要 Docker 管理能力** | 单次 stop 不充分；需要持久策略记录、禁 recreate、跨 daemon/VM 启动检验 |
| `ops/release/deploy_release.py` 与手工 `docker compose` | SOURCE：deploy 用 `compose up -d` 重建 api/worker/web；pending migration 可 `compose run --rm`；人工 `--execute` 启动 | **业务写入/重建入口，必须维护互斥与准入拒绝** | 生产脚本是否与 17 清单相同；当前实际操作者/路径、独立命令/未受管人工 Compose |
| `sanq-backup.timer` → `sanq-backup.service` → `/home/ubuntu/backup-db.sh` | H07 active/waiting/enabled、service 最近 success；SOURCE unit `User=ubuntu`、`ExecStart` 为该脚本，涉及 docker DB 操作、rclone、helper | **维护窗口必须协调/暂停有副作用的备份写入者，成功后恢复原启用状态** | 实装 unit/脚本/辅助文件内容和 sudo 受控权限；不得停用每日备份作为常态措施 |
| 系统 Cron、可能的账户私有 Cron | H12 `ubuntu` crontab 空；`/etc/cron.d` 有 `e2scrub_all`，daily 包含 `apt-compat/dpkg/apport/logrotate/man-db` 等 | **先鉴别是否能启动/恢复业务；不统一禁止系统 Cron** | 读有效规则、权限、脚本副作用；root/其它账户需单独批准 |
| `apt-daily` / `apt-daily-upgrade` / unattended-upgrades | H11 timer 精确名称已观察，H09/H10 有对应服务与进程 | **系统安全维护，默认保留；维护窗口需协调冲突** | 实际执行日程、自动重启/服务重启、是否涉及 Docker/Runtime 或可写执行链；不能未审先禁用 |
| Nginx | H06 loaded/active/enabled | **保留路由/维护响应能力；业务写入口必须有专门拒绝** | 单靠 Nginx 正常运行不能证明订单/支付停止 |
| MCP Tunnel / MCP 服务 | H06 tunnel active、`User=ubuntu`；SOURCE MCP Host 命令固定 allowlist，生产 Docker 仅 `compose ps/logs`，DB 只读；workspace 可写与生产隔离 | **保留只读运维联络，禁止任何可触发部署/写生产的路径** | 验证实际 tunnel/权限/进程是否与源码一致；不能扩大 MCP allowlist/sudo |
| SSH + EC2 Instance Connect drop-in | H06 SSH loaded/active/enabled 且 EIC drop-in 存在 | **必须保留管理/救援入口** | EIC 配置不等于已经成功接入该 Lightsail 实例；需独立验证登录 |
| Amazon SSM Agent | H09/H10 进程/服务 active | **可作候选备用管理，不属于已验证救援手段** | IAM、网络、AWS 控制台实际会话、受限命令能力未证 |
| Cloudflared | H10 进程存在，父进程为 `containerd-shim` | **按实际隧道用途分类，不能一概停掉** | 归属哪一个容器/项目、实际 unit/自动重启、管理链路是否依赖它均未证 |
| rclone / 备份 helper | SOURCE：备份可能调用 `rclone`，受控 Nginx helper 安装预期为 `/usr/local/sbin/sanq-backup-protected-nginx` | **备份副作用链的一部分，维护时拒绝新执行** | 实装二进制、脚本/调用者、是否存在独立 timer 或外部触发 |
| 应用容器内 API/Uber worker/background consumers | 4 容器运行、worker 有独立进程 | **业务写入者，停止前必须排空/保存事件；冻结后禁止新消费者** | Web/POS/Clover/Uber 回调、外部事件重放/权威对账，不能用某时点进程扫描证明长期拒绝 |

H11 15 个 timer 详情沿用 [R2-A1 §8](Runtime更新-R2-A1真实生产清单与接口只读核验.md)，不在本报告重复要求执行。实际服务全名不以截断 H09 猜测补全。

## 4. H14–H17：下一批精确 Host 只读命令候选（全部未执行、需事先批准）

**统一取证规则：**只能由操作者在**已验证的生产 SSH 会话**中，以既有非 root 身份按被批准的 ID 单独执行；无 `sudo`、无进程管理命令、无容器/网络/数据库/AWS 写操作。每条存 UTC 时间、完整 argv、退出码、必要 stdout/stderr；敏感输出原件仅保留在操作者私有位置，Git 只记脱敏摘要/摘要 hash。某路径不可读直接 `PERMISSION_BLOCKED`，不提权重试。不能把不同时间取证拼成实时连续维护屏障。

### H14：完整 service/启动器清单（无 root）

```bash
date --iso-8601=seconds
systemctl list-units --all --type=service --full --no-pager --plain --no-legend
systemctl list-unit-files --type=service --full --no-pager --no-legend
systemctl list-units --all --type=socket --full --no-pager --plain --no-legend
systemctl show docker.service containerd.service nginx.service ssh.service cron.service unattended-upgrades.service sanq-mcp-tunnel.service sanq-backup.service sanq-backup.timer -p Id -p LoadState -p ActiveState -p SubState -p UnitFileState -p FragmentPath -p DropInPaths -p User -p Result
```

预期：服务/文件实际单元全名、启用/active 状态、socket 触发候选及固定已知 unit 的 FragmentPath/DropInPaths；缺失的单元按返回错误原样记 `NOT_FOUND`，不能猜文件名。先根据完整输出锁定 SSM/Cloudflared 真实 unit 名，再**另外确认目标**查询其相同非敏感字段。禁止输出 `Environment`、未经脱敏的 `ExecStart`、token、证书、credential 或完整 unit 正文。该查询不证明 restart/admission 阻断已生效。

### H15：Cron 执行规则、权限与 apt 影响（无 root）

```bash
stat -c '%n|%U|%G|%a|%s' -- /etc/crontab /etc/cron.d/e2scrub_all /etc/cron.daily/apt-compat /etc/cron.daily/dpkg /etc/cron.daily/apport /etc/cron.daily/logrotate /etc/cron.daily/man-db /etc/cron.weekly/man-db
run-parts --test /etc/cron.hourly
run-parts --test /etc/cron.daily
run-parts --test /etc/cron.weekly
run-parts --test /etc/cron.monthly
systemctl show apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service unattended-upgrades.service -p Id -p LoadState -p ActiveState -p UnitFileState -p LastTriggerUSec -p NextElapseUSecRealtime -p Result
```

预期：确认目录脚本的 owner/mode 与 `run-parts` 实际会选中的脚本名；`--test` **不执行**定时脚本。`stat` 可能因文件不存在返回非零，须独立记录。系统 Cron **规则正文**需要操作者先在本机逐文件只读审阅 `/etc/crontab`、`/etc/cron.d/e2scrub_all` 以及上面实际可执行的脚本内容，确认启动目标、调用链、权限和未使用秘密；对话/仓库只回传“非注释 schedule、命令 basename、权限、是否触及 SanQ/Docker/网络”的脱敏矩阵，**不要原样贴含秘参的正文**。如需在终端打开，候选限定为 `sed -n '1,160p' /etc/crontab` 与 `sed -n '1,160p' /etc/cron.d/e2scrub_all`，**仍属本批待批准命令**；不会自动执行 Cron。

apt 的 `APT::Periodic`、`Unattended-Upgrade::Automatic-Reboot`、blacklist、service restart 策略以及对应已安装配置文件必须另做非敏感定向摘录，未取前保持 `UNKNOWN`；禁止因为 timer 存在就认定它会升级 Docker/重启服务，也不得擅自停止 Ubuntu 安全更新。

**H15-ROOT（单独授权，当前不得执行）：**在明确批准生产账号、既有 sudo 权限和私有回执处理后，唯一候选 `sudo -n crontab -u root -l`；只回传任务数、schedule、调用程序 basename、受影响服务、stderr/rc，不回传变量、token 或含密参数。其他用户先从 H14/H15 发现**具体账户名和风险**，为每一个指定 `crontab -u <批准账户> -l` 单独申请许可。不得批量 dump `/var/spool/cron`、枚举所有用户的私有任务或任意 sudo。

### H16：17+Manifest、Release 状态的已安装身份（无 root）

针对 `/opt/sanq/runtime`，预期 Manifest `runtime-release.json` 的 `schemaVersion=1`、`sourceBranch=main`、`productionActivationAuthorized=false` 与准确的 17 个 `files[path]` SHA256/bytes；检查 root-owned、不可由 group/other 写入、无 symlink 组件。动态文件 `.sanq-release-state.json` 只允许解析 `phase/current/previous` 三个字段，`.env` 只能看 owner/mode，**不能 cat、grep、输出变量、对外回传原文或全文件 hash**。

```bash
stat -c '%n|%U|%G|%a|%s' -- /opt /opt/sanq /opt/sanq/runtime /opt/sanq/runtime/runtime-release.json /opt/sanq/runtime/.sanq-release-state.json /opt/sanq/runtime/.env
sha256sum -- /opt/sanq/runtime/runtime-release.json
```

第二步是以下**待审阅、待批准、未执行**的固定只读脚本。它只接受源码冻结的 17 个相对路径，拒绝 symlink/非普通文件/超额文件，计算真实哈希并与 Manifest 比对；仅打印非敏感 release-state 三字段，不读取 `.env` 内容或 secrets。执行前操作者必须独立审阅并封存**准确脚本摘要**，不得从 Manifest 任意扩展待读路径。

```bash
python3 -I -S -B - <<'PY'
import hashlib
import json
from pathlib import Path
import re
import stat

root = Path("/opt/sanq/runtime")
members = (
    "docker-compose.yml",
    "ops/backup/backup-db.sh",
    "ops/backup/sanq-backup-protected-nginx",
    "ops/backup/sanq-backup.service",
    "ops/backup/sanq-backup.sudoers",
    "ops/release/deploy_release.py",
    "ops/release/release_contract.py",
    "ops/runtime/build_bundle.py",
    "ops/runtime/audit_compose_cutover.py",
    "ops/runtime/audit_release_provenance.py",
    "ops/runtime/inspect_layout.py",
    "ops/runtime/stage_bundle.py",
    "ops/runtime/runtime_trust.py",
    "ops/runtime/versioned_release_contract.py",
    "ops/runtime/plan_versioned_install.py",
    "ops/runtime/runtime-layout.v1.json",
    "ops/verify-runtime-readiness.sh",
)
assert len(members) == 17

def safe_regular(path):
    current = Path("/")
    for part in path.parts[1:]:
        current = current / part
        info = current.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise ValueError("symlink: " + str(current))
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("not regular: " + str(path))
    return info

for path in (Path("/opt"), Path("/opt/sanq"), root):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o022:
        raise ValueError("untrusted root: " + str(path))

manifest_path = root / "runtime-release.json"
mi = safe_regular(manifest_path)
if mi.st_uid != 0 or stat.S_IMODE(mi.st_mode) & 0o022:
    raise ValueError("untrusted manifest")
manifest_bytes = manifest_path.read_bytes()
manifest = json.loads(manifest_bytes)
if (manifest.get("schemaVersion") != 1 or manifest.get("sourceBranch") != "main"
    or manifest.get("productionActivationAuthorized") is not False
    or set(manifest.get("files", {})) != set(members)):
    raise ValueError("manifest contract mismatch")
source = manifest.get("sourceSha")
if not isinstance(source, str) or re.fullmatch("[0-9a-f]{40}", source) is None:
    raise ValueError("invalid manifest source SHA")
images = manifest.get("applicationImages")
if not isinstance(images, dict) or set(images) != {"sanq-api", "sanq-web"}:
    raise ValueError("invalid runtime image-pair identity")
for name in ("sanq-api", "sanq-web"):
    pair = images[name]
    if (not isinstance(pair, dict)
        or pair.get("ref") != "ghcr.io/sanqin888/" + name + ":" + source
        or not isinstance(pair.get("digest"), str)
        or re.fullmatch("sha256:[0-9a-f]{64}", pair["digest"]) is None):
        raise ValueError("runtime image-pair binding invalid")
    print("RUNTIME_PAIR", name, pair["ref"], pair["digest"])
print("MANIFEST", source,
      hashlib.sha256(manifest_bytes).hexdigest(), "uid", mi.st_uid,
      "mode", oct(stat.S_IMODE(mi.st_mode)))
for relative in members:
    path = root / relative
    info = safe_regular(path)
    if info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o022 or info.st_size > 2*1024*1024:
        raise ValueError("untrusted member: " + relative)
    payload = path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    reference = manifest["files"][relative]
    matched = (reference.get("sha256") == digest
               and type(reference.get("bytes")) is int
               and reference["bytes"] == len(payload))
    print("MEMBER", relative, "uid", info.st_uid,
          "mode", oct(stat.S_IMODE(info.st_mode)),
          "sha256", digest, "manifestMatch", matched)
    if not matched:
        raise ValueError("member does not match manifest")
state_path = root / ".sanq-release-state.json"
safe_regular(state_path)
state = json.loads(state_path.read_bytes())
fields = tuple(state.get(key) for key in ("phase", "current", "previous"))
if (fields[0] not in ("active", "pending", "rolled-back")
    or not all(isinstance(s, str) and re.fullmatch("[0-9a-f]{40}", s) for s in fields[1:])):
    raise ValueError("release state invalid")
print("RELEASE_STATE", fields[0], fields[1], fields[2])
PY
```

预期：`MANIFEST sourceSha manifest_sha256 uid/mode`、**17 条** `MEMBER ... manifestMatch True`、`RELEASE_STATE phase/current/previous`；任意异常、权限不足、Hash 差异立刻非零终止且不得提权重试。该脚本不是独立来源认证，也不能代替当前 Docker RepoDigests 或未来的受信任执行器。上述 stat/hash/script **本次尚未运行**，不能将旧 U1 `a84b7200…` 标为现役安装 SHA。

同批允许的镜像元数据只读候选：

```bash
docker inspect --type container --format '{{.Name}}|{{.Config.Image}}|{{.Image}}' sanq-app-db-1 sanq-app-api-1 sanq-app-ubereats-worker-1 sanq-app-web-1
docker image inspect --format '{{.RepoTags}}|{{.RepoDigests}}|{{.Id}}' ghcr.io/sanqin888/sanq-api:ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8 ghcr.io/sanqin888/sanq-web:ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8
```

预期：实际 image ID、RepoDigests 与应用版本映射；不能用 tag 代替 digest，不能把 Manifest 所绑定的**历史 Runtime 配对镜像**误当当前应用镜像。还应对照 release-state 的 `phase=active/current=ff5be8d5…`（**预期值，不是实测结论**），若不同须如实登记差异并暂停后续准入。不得读取 `docker inspect` 的 `Config.Env` 或全部 JSON。

### H17：deploy/backup/rclone/Cloudflared 实际启动入口（无 root）

```bash
stat -c '%n|%U|%G|%a|%s' -- /opt/sanq/runtime/ops/release/deploy_release.py /home/ubuntu/backup-db.sh /usr/local/sbin/sanq-backup-protected-nginx
sha256sum -- /opt/sanq/runtime/ops/release/deploy_release.py /home/ubuntu/backup-db.sh /usr/local/sbin/sanq-backup-protected-nginx
command -v docker
command -v rclone
command -v cloudflared
docker ps -a --no-trunc --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}'
```

预期：文件真实 owner/mode/hash、可见命令路径、容器归属候选；`command -v cloudflared` 失败不代表容器内没有 cloudflared，容器列表没有 PID 绑定也不证明 Tunnel 身份。全 Host `docker ps` 范围比 `sanq-app` 大，**需作为 H17 单独明确批准**，只保留与 Cloudflared/Runtime 相关的脱敏行；不输出 `docker inspect Env`、rclone remote 配置、隧道 token、进程 args。Backup/helper 如因权限失败，不请求 sudo；先给出准确失败目标后申请新的只读权限范围。

## 5. R2-A2 的最小接口与实现顺序（设计候选，不构成实现授权）

保留现有 `NormalUpdateFlow.UpdateCapabilities` 的 `record_original_state → freeze_maintenance → create_and_verify_snapshot → recheck_frozen → ... → restore_original_policies → verify_restored → release_business` 接口及失败 `record_abort` 行为。源码是**无真实 adapter、无 CLI、无跨进程排他**的纯流程核心；不得把合成 `StepCompletion(status=COMPLETE)` 或 `decision=BLOCKED` 混同生产验证完成。

1. **A2-0 前置清单与权限合同：**冻结准确 service/cron/容器/backup/管理通道对象，归属和准入分类；记录 Host ID、容器 ID、镜像 digest、启用状态及持久清单写入位置（机内 + 离机）和允许的最小动作。未知 unit/Cron/外部消费者时拒绝进入维护；不新增全能 root shell/MCP allowlist。
2. **A2-1 纯模型/负例测试：**新增只表达准确对象的 OriginalPolicyRecord、writer/startup registry、maintenance owner/txid、persistent fence/epoch、deny verdict、abort evidence。先用 fake Host 与合成故障测试重复调用、状态漂移、凭据不可用、半途掉电、失联/超时。不得在失败 `finally` 恢复服务。
3. **A2-2 受约束禁入边界：**最小 adapter 分别控制 Docker 现有容器实际 policy、Compose/deploy 和定时入口、独立 backup/rclone、应用业务新消费者；保留 SSH/MCP/经证管理服务。若采用 systemd drop-in、boot guard 或受保护 wrapper，均需先说明安装、权限、覆盖旧调用和撤回/恢复策略，经独立授权再落地。仅修改 `restart=no` 不能阻止 `compose up` 重建。
4. **A2-3 持久化/持续复验：**在进入维护前持久记录原策略和身份，维护锁需跨进程/daemon/VM 重启/快照新实例首启有效；持续拒绝新业务写入者，发现未知 owner、外部事件、重建容器或不可验证状态立即 INCIDENT。单时点 `ps`、`flock`、容器 stop 都不是长期屏障。
5. **A2-4 对接 NormalUpdateFlow 的离线合成矩阵：**核验 request/txid/原始状态 SHA、恢复清单、step completion 绑定，测试中断 S02/S03/S07/S08/S10/S11 与无条件不放行；快照 adapter 与正式安装仍属于后续 R3/R4，不在本批执行。
6. **A2-5 隔离同平台验收和生产批准：**只有 A2 原理测试、服务来源、独立管理通道、DB/WAL 与外部事件隔离策略和 AWS 同平台恢复机制具备受控验证方案后，才可申请准确生产对象/窗口的读写执行授权。S01–S12 的真实通过需另取证，不从设计或 CI 推导。

**架构边界：**本批不重排 Web/Orders/Payments/Uber；维护适配器归属 `ops/runtime`，部署/备份只通过各自明确的 Ops 接口协调。未来如需变更 systemd/cron/Compose/安装布局、受保护 17 成员或特权/权限模型，必须先列明原因、影响与替代方案，并取得另行授权。

## 6. 安全缺口与恢复覆盖

- **管理路径：**SSH 实际可登录已由此前操作员提供过输出，但失效/故障态连通性尚未验证；EC2 Instance Connect drop-in 是配置证据而非真实 EIC 可用性；MCP Tunnel active 不代表独立 SSH；SSM Agent running 不代表具备 IAM/网络/会话授权。至少一个与业务容器失效无关、实际经验证且可操作恢复的路径是后续硬门禁。
- **数据：**必须明确 Lightsail 快照覆盖的具体磁盘/附盘以及 `sanq-app_pgdata`、`/srv/sanq/uploads`、Web sounds `/home/ubuntu/sanq-assets/sounds`、受保护 Runtime 与动态 state、备份目录、TLS/配置/escrow 的所在位置。音频只读挂载不等于无需恢复。停止写入之后核实 PostgreSQL clean shutdown/WAL 一致性，再核对实际快照恢复；不能把 `available` 等同 DB recoverable。
- **外部事件：**Uber/Clover/订单/退款/回调可在服务器冻结期间达到外部供应商终态；必须设计 ingress 拒新、在途隔离、事件留存、去重重放、支付权威对账和重启后只允许单写者。未知资金结果绝不推断成功/失败。
- **长期 DR：**每日实际 backup timer 仍运行，但当天远端备份的完整性、rclone mirror/history、S2 所需全 VM 独立恢复仍未由本批验证。一次性更新前快照只覆盖持续停写保护窗口，不能取代放行后的 daily/DR。
- **取证：**H01–H12 为操作者回传文本，部分 rc、完整原件签名/归档未提供；R0 §4.1 允许最小必要记录与复用，但不允许臆造证据或赋予更高验证层级。

## 7. 本地交付及退出门禁

**本批：DOCUMENTATION ONLY / HOST H14–H17 PROPOSED, NOT EXECUTED / NO PRODUCTION MUTATION / NOT PUSHED。** 不改应用、Runtime 正式流程、Docker、systemd、Cron、IAM/AWS、MCP allowlist、网络、数据库、17+Manifest、CI、依赖/锁、Prisma/schema/migration。MCP workspace 无 lint/build/test 权限；仅审阅文档差异/工作区状态。下一门禁：用户审阅本报告，并分别批准所需的 Host 只读 ID；随后根据实际结果评估 G02–G07 是否满足继续实现 R2-A2 的最低条件。首次远端交付仍须另行明确授权 PR → `dev` / CI 全绿 → 合并。

## 8. 2026-10-23 — HOST-READ-002 实际现场回执续记（H14–H18、G03/G05/G07）

**时间、状态及证据层级：**本节为 §4 候选命令在 **PR #2915 经 CI #7478 SUCCESS、squash merge `3ba4ac2b2496c5b1411ff16f3d5a65499d68133f` 后**，经用户逐批授权，由 `ubuntu@sanq-web` 从生产 SSH 执行并贴回的 **OPERATOR_TRANSCRIPT**；另有 Cloudflare 控制台两张人工截图（**CONTROL_PLANE_SCREENSHOT**）和用户说明的 MacBook Sandbox 网络设计（**OPERATOR_CONTEXT**）。旧 §1–§7 中的「未执行/未推送」描述是 **PR #2915 编写时的历史快照，不表示本节追加后的现场状态**。回执没有提交完整原始 stdout/stderr/argv 的独立加密封存及 hash chain；此处只记录可见的具体字段、命令退出码、时间与推论边界，绝不伪称自动执行或端到端复验。

| 回执 ID | 时间（UTC，来自回传） | 实际结果 / rc | 结论级别 |
| --- | --- | --- | --- |
| H14-1～4 | 12:31:12 | service 完整列表、unit-file 列表、socket 列表、9 个已知 unit 的选定属性；`rc=0/0/0/0` | `SYSTEMD_INVENTORY PASS_SCOPED` |
| H14-extra | 时间未单独回传 | SSM snap unit / EIC service 选定属性，`rc=0` | `UNIT_IDENTITY PASS_SCOPED`；连通性未证 |
| H15-1～6 | 12:33:21 | Cron owner/mode、run-parts --test、apt timers/service；各 `rc=0` | `CRON_FILES/TIMERS PASS_SCOPED` |
| H15-7～8 | 12:39:08 | `/etc/crontab` 和 `/etc/cron.d/e2scrub_all` 规则原文，`rc=0/0` | `SYSTEM_CRON_RULES PASS_SCOPED` |
| H15-9 | 时间未单独回传 | `apt-config`/`grep` 均 `rc=0`；三个 APT::Periodic 键存在 | `APT_PERIODIC_CONFIG PASS_SCOPED` |
| H15-10～11 | 13:04:12 | unattended 配置/已装实现选定行，`rc=0/0` | `APT_AUTO_REBOOT_CONFIG PASS_SCOPED` |
| H16-1～4 | 12:36:03 起 | stat、Manifest SHA、容器 image IDs、RepoDigests；各 `rc=0` | `INSTALL_METADATA/IMAGE_IDS PASS_SCOPED` |
| H16-state-readable | 时间未单独回传 | `ubuntu` 对 root-owned 600 state `NO` | `PERMISSION_BLOCKED`（当时），不是损坏 |
| H16-5 | 时间未单独回传 | 固定 17 路径 Python 核验 `RESULT PASS_17_OF_17`、`rc=0` | `STATIC_BYTES PASS_SCOPED` |
| H17-1～4 | 12:51:39 | stat/hash/命令位置/Cloudflared 过滤容器列表；各 `rc=0` | `ENTRY_IDENTITY PASS_SCOPED` |
| H17-5 / H18-1～3 | H18：13:34:45；其余时间未单列 | inspect 策略/网络/挂载和 `ss :18080`，各 `rc=0` | `TUNNEL_CONTAINER PASS_SCOPED`，监听当时空 |
| H18-4～5 | 约当地 09:39 / 09:41 控制台截图 | 远端 Published application route + TLS 2 项自定义，无 CLI rc | `ROUTE/TLS_CONFIG SCREENSHOT_SCOPED` |
| G07-1～3 | 13:42:43 | 四目录 findmnt、DB local volume、lsblk，`rc=0/0/0` | `ROOT_DISK_LAYOUT PASS_SCOPED` |
| G07-4～5 | 13:44:56 | DB 目录 `findmnt rc=1` 空输出、`stat rc=1` Permission denied | `PATH_DIRECT_READ BLOCKED`（后以其他元数据交叉核验） |
| G07-6～8 | 13:46:19 | DockerRootDir/volume/mount list，`rc=0/0/(0,0)` | `DB_VOLUME_DISK INFERRED_HIGH_CONFIDENCE` |
| G07-9 | 13:47:24 | `local/local` volume、`CustomOptions=NO`、`rc=0` | `ROOT_DISK_COVERAGE PASS_SCOPED` |
| G03-ROOT-Cron | 13:50:24 | 经单独批准 `sudo -n /usr/bin/crontab -u root -l`，`no crontab for root`、`rc=1` | `ROOT_PERSONAL_CRON EMPTY`；`rc=1` 是无 crontab 的结果 |
| G05-Release-State | 13:50:29 | 经单独批准的 `sudo -n /usr/bin/python3 -I -S -B`，仅输出 3 个校验字段，`VALID`、`rc=0` | `DYNAMIC_STATE PASS_SCOPED` |

**MCP 再核验：**2026-10-23T13:33:25Z 既有只读 `system_status`/`docker_status(include_stopped=true)`：Docker 和 MCP tunnel active，4/4 `sanq-app` 容器 healthy，当前应用镜像均仍为 `ff5be8d5…`（PostgreSQL `postgres:15-alpine`）。这一瞬时健康观测不代表维护冻结或独立救援已验证。

## 9. G02 / G03 — systemd、Cron 与 unattended-upgrades 现场裁定

**H14 systemd：**`docker.service`、`containerd.service`、`nginx.service`、`ssh.service`、`cron.service`、`unattended-upgrades.service`、`sanq-mcp-tunnel.service` 均 `loaded/active/running/enabled`；`sanq-backup.service` `loaded/inactive/dead/static`，`sanq-backup.timer` `loaded/active/waiting/enabled`。`sanq-mcp-tunnel.service` 与 `sanq-backup.service` 的 `User=ubuntu`；前者 fragment `/etc/systemd/system/sanq-mcp-tunnel.service`，后者 `/etc/systemd/system/sanq-backup.service`。`ssh.service` 有 `/usr/lib/systemd/system/ssh.service.d/ec2-instance-connect.conf` drop-in。socket 完整名单包含 **`docker.socket loaded/active/running`**，属于额外可激活 Docker daemon 的入口，不得以关闭单个 daemon 或业务容器一次性 stop 代替持久冻结。已取得全量 service/unit-file/socket 的现场名单，但没有逐个打开完整 ExecStart/依赖/外部管理服务的实际重新拉起链。

**H14-extra 救援候选：**`snap.amazon-ssm-agent.amazon-ssm-agent.service` = `loaded/active/running/enabled`，fragment `/etc/systemd/system/snap.amazon-ssm-agent.amazon-ssm-agent.service`；`ec2-instance-connect.service` = `loaded/inactive/dead/enabled`，fragment `/lib/systemd/system/ec2-instance-connect.service`。两者仅证明安装/运行状态；**尚无** IAM、网络、控制台实际 Session Manager/EIC 登录、事故态恢复权限证明。当前 SSH 操作员可登录也不能证明失效态独立救援可达。

**H15 文件/调度：**`/etc/crontab` root:root 644（1136 B），`/etc/cron.d/e2scrub_all` root:root 644（201 B）；`apt-compat`、`dpkg`、`apport`、`logrotate`、`man-db` daily 和 `man-db` weekly 全部 root:root 755。`run-parts --test` 的 hourly/monthly 均空（`rc=0`），daily 选择 `apport / apt-compat / dpkg / logrotate / man-db`，weekly 选择 `man-db`。`/etc/crontab` 有 `17 * * * *` hourly，`25 6 * * *` daily、`47 6 * * 7` weekly、`52 6 1 * *` monthly（后三项具 anacron 存在性判定）；`e2scrub_all` 有 `30 3 * * 0` 与 `10 3 * * *` root 任务，均先 `test -e /run/systemd/system || ...`，故在正常 systemd 环境下通常不会由该 Cron 路径实际执行。已审阅的规则**没有直接 SanQ deploy/业务复活调用**；`ubuntu` 私有 crontab 先前仅注释，root 私有 crontab 本轮 `no crontab for root (rc=1)`。**其他账户的私有 Cron、anacron 精确状态及上述脚本间接调用链未穷尽**。

**APT 定时维护：**`APT::Periodic::Update-Package-Lists "1"`、`Download-Upgradeable-Packages "0"`、`Unattended-Upgrade "1"`。`apt-daily.timer` `active/enabled`，现场下一次 2026-10-24 01:24:06 UTC，最近触发 2026-10-23 10:37:50 UTC；`apt-daily-upgrade.timer` `active/enabled`，下一次 2026-10-24 06:25:53 UTC，最近触发 06:49:38 UTC；两个 service 当时 inactive/static、`Result=success`；`unattended-upgrades.service` active/enabled。`/etc/apt/apt.conf.d/50unattended-upgrades` 的 `Automatic-Reboot` / `WithUsers` / `Time` 仅注释示例；实际 `apt-config dump` 未显示重启配置；已装 `/usr/bin/unattended-upgrade` 的 `find_b("Unattended-Upgrade::Automatic-Reboot", False)` 默认 False。因此 **unattended-upgrades 自身自动整机重启未开启（配置限定）**，**不代表**升级时不会 restart Docker 等服务，也不排除其他重启机制。

**G02 `PARTIAL` / G03 `PASS_SCOPED（非全集）`。** 保留系统安全更新默认状态，不批量禁用 systemd/Cron；未来 R2-A2 需对真实 apt/daemon/socket/Compose/手工和其他用户入口做到 fail-closed 分类。

## 10. G04 / G05 — 实装 Runtime、当前生产版本与 Clover Sandbox 入口

### 10.1 H16 / G05：17+Manifest 静态完整性及真实激活状态

| 对象 | 实测字节/权限/身份 | 裁定 |
| --- | --- | --- |
| `/opt`、`/opt/sanq`、`/opt/sanq/runtime` | 全部 root:root `755` | 受保护目录元数据 PASS |
| `runtime-release.json` | root:root `644`、3289 B、SHA256 `6f4fe7d6fcd9b819c79d153da297a950f15fd075e6553a530e87206191f40cf9` | 现场 Manifest 摘要取得 |
| Manifest `sourceSha` | `a84b72007e6b4e82c981101e56c897355757c0ff` | **Runtime Bundle 的源码身份**，不是当前业务 Image |
| `.sanq-release-state.json` | root:root `600`，265 B | `ubuntu` 非 root `test -r=no`，后经独立 sudo 只读查询成功 |
| `.env` | ubuntu:ubuntu `600`、3905 B | 只查元数据，未读取/哈希内容；部署源码有保留 ubuntu owner 支持备份的意图 |
| API / Uber Worker 实际镜像 | 均 `ghcr.io/sanqin888/sanq-api:ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`，image ID `sha256:819adfd7575c3613857b63d8e612da26a7aed63825f36ec7d5faf92ac582230d` | 与共享 API 发布 SHA 对齐 |
| Web 实际镜像 | `ghcr.io/sanqin888/sanq-web:ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`，image ID `sha256:f87a2fbf16947411cdc8473b6a9b932dc55761c092cc53be87b31e75339ed0ad` | Web 与 API 配对 tag |
| DB 实际镜像 | `postgres:15-alpine`；image ID `sha256:b3968e348b48f1198cc6de6611d055dbad91cd561b7990c406c3fc28d7095b21` | 数据库身份单独记录 |

本次 `docker image inspect` 的 RepoDigests 显示 API `ghcr.io/sanqin888/sanq-api@sha256:819adfd7575c3613857b63d8e612da26a7aed63825f36ec7d5faf92ac582230d`、Web `ghcr.io/sanqin888/sanq-web@sha256:f87a2fbf16947411cdc8473b6a9b932dc55761c092cc53be87b31e75339ed0ad`；这是运行机的当前镜像事实。Manifest 另绑定 **Runtime sourceSha `a84b7200…`** 对应配对镜像：API digest `sha256:63d4fb5029ca4194d7c6a83ebaa2db85dd57f7dbf6bd2fd59ae17ec121aab496`，Web digest `sha256:cf646d58a14b44a30156c5b8fd58dcac1313bae23924a037911257b74576adf2`。**两套 digest 不同是不同版本的事实，不能因此宣告 Runtime 漂移，也不能把前一套冒充当前生产。** 用户明确说明：当前应用停留在 `ff5be8d5…` 是因为最新 Image 涉及尚无安全执行路径的 Runtime 更新，**有意不部署**，不得以审计为理由执行升级。

H16-5 经操作者运行受限的纯只读固定路径 Python 核验，17 条 `MEMBER` 全部 `manifestMatch True`，最终 `RESULT PASS_17_OF_17`、`rc=0`。固定成员：`docker-compose.yml`；`ops/backup/{backup-db.sh,sanq-backup-protected-nginx,sanq-backup.service,sanq-backup.sudoers}`；`ops/release/{deploy_release.py,release_contract.py}`；`ops/runtime/{build_bundle.py,audit_compose_cutover.py,audit_release_provenance.py,inspect_layout.py,stage_bundle.py,runtime_trust.py,versioned_release_contract.py,plan_versioned_install.py,runtime-layout.v1.json}`；`ops/verify-runtime-readiness.sh`。输出验证各成员 sha256、长度、root owner、模式和 symlink 检查；不是完整第三方发布来源证明。

**H16-5 逐文件 SHA256 现场清单（17/17 均 `manifestMatch=True`）：**

| 成员相对路径 | 实际 SHA256 |
| --- | --- |
| `docker-compose.yml` | `b8c5eb10300eb33242af49b9bfceedc652e93898732374d2525feb168a815ce4` |
| `ops/backup/backup-db.sh` | `fee7556667376a417a995f0a2bf4aa2c9241dac0eeb4b3022067be0467345437` |
| `ops/backup/sanq-backup-protected-nginx` | `df91e37ca252afad9bfe665d6f3e72239d957c8f11767e38dc6ce51ac5226322` |
| `ops/backup/sanq-backup.service` | `c0726fc7fadc373e151d049ef36836236e4827fbf4a7d5ceec08fb1d08f1e607` |
| `ops/backup/sanq-backup.sudoers` | `232cc78d3db075f94a54590ac9517c46e8c611f04d74d29f8ba3796ca987630c` |
| `ops/release/deploy_release.py` | `ab6c416887c08d4e66a400763722c217fc52785dcf806b1544d865f1852cd1b6` |
| `ops/release/release_contract.py` | `2b23cc91e8e23e8aabb79415b2a51a654f4f6d3f3c8a304050b3278a4df551cb` |
| `ops/runtime/build_bundle.py` | `5fc9a6dacc4ee86ca4a7d87c58df8dffb333427d90d5050e95dd4d7d65767223` |
| `ops/runtime/audit_compose_cutover.py` | `bae3249c34fc4dae72a0b44ccbcfd0f49e404a72e687894c772b369f780e5212` |
| `ops/runtime/audit_release_provenance.py` | `24810b80f90c27b848df0c0aa25c8403dd09a4d1da374973c4e9902c08d13a55` |
| `ops/runtime/inspect_layout.py` | `4f6f6ab1c680e3d9f41a7a949b7909317fe690021bf3496d118691bd8e5d70d9` |
| `ops/runtime/stage_bundle.py` | `b2f2e1398156ae04c9855ff74766a71420e886eb81a0a3b88caf70dd9e897a50` |
| `ops/runtime/runtime_trust.py` | `1ce6c7a04dc16b2bf284601ca632359f4dc2fe9765f378fbf594c40400435c30` |
| `ops/runtime/versioned_release_contract.py` | `988f2c4c1c158a25dadc53db1a0936f04b0e85bcaf1781c06141b9a68fea3637` |
| `ops/runtime/plan_versioned_install.py` | `ce1c6b5a4a51652393b09f8bbc42c4974e8c1ca18d8c47e2662c2054f44a47da` |
| `ops/runtime/runtime-layout.v1.json` | `e75712ef993f82c37497996d68cf486d2983436540337ac799767cdedc1bea91` |
| `ops/verify-runtime-readiness.sh` | `fe2d108c4093b6f1dc1ff2ef5caf3fefbfb95eb8d908944a5446f4b59e5368f8` |

本表仅复述操作者程序打印的 hash/匹配裁定，**尚未从生产完整原始文件独立二次取字节复算**；不可把逐文件静态一致性等同完整发布证明。

G05 root state **经用户另行批准**的字段限定 `sudo` 只读校验：

```text
G05-STATE phase=active
G05-STATE current=ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8
G05-STATE previous=a84b72007e6b4e82c981101e56c897355757c0ff
G05-STATE VALID
G05-Release-State rc=0
```

**对应关系 PASS_SCOPED：** `state.current` 与当前 API/Web 实际 tag 完全一致；`state.previous` 与 Manifest `sourceSha` 一致，`phase=active` 格式校验通过；这说明目前声明的应用状态内部一致，**不证明**外部 CI/Archive 签名已独立验证、当前状态的每次发布历史完整或真实更新后恢复成功。G05 整体 **`PASS_SCOPED / PUBLICATION_TRUST_OPEN`**。

### 10.2 H17–H18 / G04：实际部署/备份脚本与 Sandbox 公网转发

H17 stat/hash 的三条文件与 H16 Manifest 对应字节逐项一致：

| 实装路径 | Owner / mode | 现场 SHA256 |
| --- | --- | --- |
| `/opt/sanq/runtime/ops/release/deploy_release.py` | root:root 644，26443 B | `ab6c416887c08d4e66a400763722c217fc52785dcf806b1544d865f1852cd1b6` |
| `/home/ubuntu/backup-db.sh` | ubuntu:ubuntu 750，14016 B | `fee7556667376a417a995f0a2bf4aa2c9241dac0eeb4b3022067be0467345437` |
| `/usr/local/sbin/sanq-backup-protected-nginx` | root:root 755，5458 B | `df91e37ca252afad9bfe665d6f3e72239d957c8f11767e38dc6ce51ac5226322` |

`command -v docker` = `/usr/bin/docker`，`rclone` = `/usr/bin/rclone`，Host PATH 的 `cloudflared` 未找到。实际运行独立容器 `sanq-clover-dev-cloudflared`，镜像 `cloudflare/cloudflared:latest`，H17-4 时 `Up 12 days`；H17-5 `RestartPolicy=unless-stopped`、`com.docker.compose.project/service` 标签均空，**不能由空标签推断一定非 Compose 管理**。H18-1 `NetworkMode=host`、`Status=running`、`MountCount=2`，H18-3 两个只读 bind 目标分别为 `/run/secrets/tunnel-token` 与 `/etc/cloudflared/origin-cert.pem`（**未读取源路径/凭据/证书内容**）；H18-2 `ss -H -ltn '( sport = :18080 )'` `rc=0`、无监听者，说明该时刻没有观察到 `:18080` 的 SSH 反向监听，**不是** Cloudflare Tunnel 容器未运行或整个公网域名持续不可用的证据。

用户历史方案说明 Clover App 要求公网 URL；本地 Sandbox 在 MacBook 运行 API/Web/DB，原计划经 MacBook `127.0.0.1:8443` → SSH `-R 127.0.0.1:18080:127.0.0.1:8443` → VM Cloudflare 入口。**控制台截图新鲜证据**：名为 `sanq-clover-dev` 的 Tunnel，页面显示 **1 条 Published application 路由**，Hostname `clover-dev.sanq.ca`、Service `https://127.0.0.1:18080`，路径 UI 表达式可见 `/` 与 Clover `/clover/oauth/(start|callback|result)` 类匹配；没有逐 URL 验证匹配/404 或探测端到端 TLS/连接性，不以截图证明 OAuth 已通。另张截图显示 TLS **2 项自定义**：`Origin Server Name=clover-dev.sanq.ca`、`CA Pool=/etc/cloudflared/origin-cert.pem`；`Disable TLS certificate verification`、`Match SNI to host`、`Use HTTP/2 to origin` 均为 OFF；HTTP/Connection/Access 显示使用默认值。**CA Pool 文件名不能证明其内容确为 CA、证书链可验证**，无明文凭据进入审计。

**R2-A2 分类：** `sanq-app` API/Web/Uber Worker/DB 和 Compose/deploy 是受控业务写入/复活对象；`sanq-backup.timer/service` 与备份/rclone/helper 属需维护协调的副作用入口；**`sanq-clover-dev-cloudflared` 为独立 Clover Sandbox 开发通信设施，默认 PRESERVE、单独记录 `unless-stopped`，不一刀切停止或改为 `restart=no`**。它采用 Host 网络，未来仍需以实际 route/network 隔离证明不会直通生产写口；VM 重启后仅 Cloudflared running 不能证明 MacBook 反向 SSH 已恢复。`G04 PARTIAL`，入口已识别但持续禁入、未知绕过与断链恢复未验收。

## 11. G07 — Lightsail VM 数据盘/Volume 覆盖及负例

| 路径/资源 | 实测内容 | 覆盖裁定 |
| --- | --- | --- |
| `/opt/sanq/runtime` | `findmnt -T` 返回 `/ /dev/nvme0n1p1 ext4 rw,...` | 根盘 PASS |
| `/srv/sanq/uploads` | 同根 `/dev/nvme0n1p1` | 根盘 PASS |
| `/srv/sanq/backups` | 同根 `/dev/nvme0n1p1` | 根盘 PASS |
| `/home/ubuntu/sanq-assets/sounds` | 同根 `/dev/nvme0n1p1` | 根盘 PASS |
| `sanq-app_pgdata` | Docker `Driver=local`、`Scope=local`、`Mountpoint=/var/lib/docker/volumes/sanq-app_pgdata/_data`、`CustomOptions=NO` | 根盘**高可信间接证据** |
| Docker 数据根 | `DockerRootDir=/var/lib/docker` | 与卷位置对应 |
| `lsblk` / 内核挂载 | `nvme0n1` 60G；`nvme0n1p1` 59.9G ext4 `/`；另有 EFI/辅助分区及 snap loop；`findmnt --kernel` 仅见根挂载和 Docker overlay rootfs，无所列 DB volume 路径的独立挂载 | 当前观测范围无额外数据盘 / DB volume 单独挂载 |

**负例不能抹除：**先前直接在 `ubuntu` 身份下对数据库卷 mountpoint 执行 `findmnt -T` 是 `rc=1`/空输出，`stat` 是 `Permission denied, rc=1`。没有为凑齐 rc0 擅用 sudo 或调整数据库目录权限。后续 G07-6～9 才依据 Docker daemon 元数据、host 内核挂载及无自定义 Volume options 交叉核验；**这不等价于 root 身份直接穿越 DB 目录的文件系统断言或 PostgreSQL 文件级一致性检查**。

**结论：`G07 ROOT_DISK_COVERAGE PASS_SCOPED / G07 OVERALL PARTIAL`。** 当前识别的持久化对象应落在 Lightsail 实例根盘快照覆盖候选范围，未观察到单独的业务数据盘；但 AWS 控制面的准确 instance/snapshot ARN/Region/盘清单及快照真实创建/available、PostgreSQL clean shutdown/WAL/恢复验证、恢复后的业务与密钥/TLS/escrow、外部事件留存/去重/权威对账、Google Drive/rclone 离机 daily 与 S2 全量恢复都**未进行本轮验收**。不能把「磁盘位置」升级为「整机独立可恢复」或「零数据丢失」。

## 12. 本批最终 G01–G07 判定、R2-A2 前置与退出边界

| Gate | 2026-10-23 本轮只读取证后的判定 | 仍未具备的生产实施条件 |
| --- | --- | --- |
| G01 生产对象 | `PASS_SCOPED`；MCP/Host 与容器已确认 | 快照/更新前再次精确 pin 实例/Region/发布版本/健康 |
| G02 systemd/启动入口 | `PARTIAL`；完整 service/unit/socket 清单和 `docker.socket` 已证 | 全量依赖/未知触发器、业务自动复活与跨重启持久屏障 |
| G03 Cron/unattended | `PASS_SCOPED`；系统 + ubuntu + root 个人规则和 apt 默认重启行为已证 | 其他用户 crontab、脚本调用链、升级可能导致的服务重启 |
| G04 非容器写者/独立 Tunnel | `PARTIAL`；deploy/backup/helper hash、Docker/rclone、Cloudflare host-network 与 route 已证 | 独立受控执行入口、Compose/admission deny、Tunnel 生产写口隔离与恢复链 |
| G05 Runtime/Release 身份 | `PASS_SCOPED`；17/17、Manifest SHA、state 校验、运行 image ID/digest 已证 | 独立发布可信来源链/完整恢复点和正式生产新版本执行器 |
| G06 独立救援 | `OPEN`；SSH/MCP/SSM/EIC 状态已发现 | IAM/救援会话实际登陆和事故态独立恢复能力 |
| G07 数据覆盖/恢复 | `ROOT_DISK_COVERAGE PASS_SCOPED / OVERALL PARTIAL` | 真 AWS 快照→独立 VM 恢复、PG/WAL、备份/密钥/外部事件一致性 |

**综合：`R2-A1 INVENTORY SUFFICIENT FOR R2-A2-1 OFFLINE MODEL / R2-C4 OPEN / AWS S01–S12 OPEN / R1-C1 OPEN / S2 DAILY EXPANSION PAUSED / C5-G2 NO-GO`。** 可另批授权在现有 `ops/runtime` 范围进行**纯离线 Maintenance Fence 对象/原始策略/拒绝判定/持久化意图模型及 synthetic 失败测试**；这不授权上线 adapter、改 systemd/cron、容器 RestartPolicy/Compose、重启 VM、变更 Cloudflare、写生产数据库、创建 Lightsail 快照或部署任何新 Image。任何需越过架构/17 Bundle/privilege 的安装/持久重启守卫，必须先独立说明理由、影响、替代方案、测试和撤回，再获用户批准。

**本续记仅本地仓库文档同步。** 所有生产只读命令为用户在已授权 SSH/Cloudflare 控制台执行，本次文档更新没有追加任何生产 Host 命令；保留历史原件在对话/操作者私有位置，**不提交** token、证书、`.env`、release-state 原文、root crontab 全量 dump 或截图中的账号标识。首次远端交付另待用户审阅授权，PR 必须目标 `dev` 且 CI 全绿方可合并。



