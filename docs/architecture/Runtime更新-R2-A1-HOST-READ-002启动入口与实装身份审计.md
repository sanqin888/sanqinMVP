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
