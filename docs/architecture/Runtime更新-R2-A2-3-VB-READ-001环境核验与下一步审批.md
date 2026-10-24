# R2-A2-3 — VB-READ-001 VirtualBox 环境核验与首验准入审计

> 2026-10-23 / **LOCAL DOCUMENT REVIEW / HISTORICAL EVIDENCE SCOPED / CURRENT HOST CONFIG OPERATOR_TRANSCRIPT RECEIVED / GUEST READBACK NOT_RUN / P0-01 NOT_RUN**。开发基线 `origin/dev@24cc2e2efc331d8024b09ab5de1e96151f5f67be`（PR #2921，CI #7491 在失败作业因镜像仓库限流后重跑 SUCCESS）。用户本轮要求**开始 VirtualBox 环境核验**，只授权读取/审计设计；本轮不连接 MacBook、SSH/生产 VM，不执行变更、安装、重启、快照创建/删除、文件投送或 Guard 故障测试。MCP 仅能访问 SanQ 生产的**独立只读接口**和隔离源码 workspace，**没有用户 Mac/VirtualBox Host 会话**。因此历史原件/当前核验必须严格区分。

## 1. 查证来源与无需重做的历史证据

按根 `AGENTS.md`、[R2-A2-3 §9 VB-01～06](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)、[R2-A2-2 §3.1/3.2/6.1](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md) 和当前主 CI 核验。本批**优先复用**已有的相同 Mac/Guest 身份取证，而非重新建设整套 SSH pin/可信工具链。

| 历史证据来源 | 2026-10-22 已独立复核到的内容 | 对本工作包的限制 |
| --- | --- | --- |
| [A0-SITE-001 §6 Host](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md) | Mac H01–H08：8/8 rc0；17/17 SHA 对应；已登记 VM 唯一运行；`nic1=hostonlynetwork`，其余 NIC none；Clipboard/drag-and-drop disabled，无共享目录；`list hostonlynets` Enabled；macOS IPv4/IPv6 forwarding 0 | `list hostonlyifs` 为 **rc0 且输出空**，不能捏造接口；原件只在私有归档；**非当前时间现场状态** |
| [A0-GUEST-001 §2–5 Guest](R1C-2C-C-C1-SYN-001-A0-GUEST-001只读身份复核.md) | Host+Guest 13/13 rc0，28/28 SHA 清单；Guest 控制台首次 ED25519 pin 与 keyscan 相符、严格 SSH；Guest UID/GID=1000，boot/namespace/关键可执行程序 SHA 均有限定原件 | 只证明当时非 root 身份/SSH/工具；没有本轮 Docker/systemd 安装、Guest 网络或快照恢复验收；原回执 `a0Approved=false` 不可覆写 |
| [历史证据索引](Runtime历史决策与证据索引.md) | 原始 `SanQ-Linux-Test`、`SanQ-Clean-Baseline`；Ubuntu 24.04.5、kernel `6.8.0-146-generic`、`/dev/sda2` ext4；另有 `SanQ-Cold-Recovery-Test` 与不同 VDI/网络设计 | 历史 VM 名称、媒体 UUID、Guest 的 IP/SSH key **不得自动被当作今日目标** |
| [R2-A1 H14–H18、G07](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) | **生产**存在 Docker daemon+socket、四个 `restart=always` 容器、独立 Clover `unless-stopped`；数据根与卷位置已核 | 没有真实生产 Docker Engine/containerd/Compose **版本清单**可用于声称同版本；本轮不在生产执行补证 |
| [GitHub VM 探针退役](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md) | PR #2920 真实能力 `KVM_UNAVAILABLE/BLOCKED`，PR #2921 删除无用独立探针/工作流，既有 GitHub CI 保留 | GitHub Guest/QEMU 未运行，不能迁移为 VirtualBox PASS |

**初步裁定：**`HISTORICAL_HOST_PASS_SCOPED / HISTORICAL_GUEST_PASS_SCOPED`；`VB-01 CURRENT UNKNOWN / VB-02 CURRENT UNKNOWN / VB-03 OPEN / VB-04 PARTIAL-RESTORE_OPEN / VB-05 OPEN / VB-06 NOT_AUTHORIZED`。10 月 22 日已核实的身份信任链可作为本轮的可信候选，**不重新自动信任任何新 Guest SSH key**。

## 2. 第一步：Mac Host 对当前 VM 的最小只读回读（VB-01 / VB-02 / VB-04 的配置部分）

由操作者在**原 Mac** 本地 Terminal 运行，不依赖本 MCP；所有原始 stdout/stderr、rc、UTC 与原件哈希只留私有目录。**先核实实际 VBoxManage 安装与目标完整 VM UUID**，不得用 `head -1`、`latest`、匹配模糊 VM 名称代替已批准 UUID。Host 上其他业务 VM 不得更改。

```bash
# Host H0：只读确定真实 VBoxManage，不自动安装/更新 VirtualBox
VBOX=/Applications/VirtualBox.app/Contents/MacOS/VBoxManage
test -x "$VBOX" && "$VBOX" --version
"$VBOX" list vms
"$VBOX" list runningvms

# 先从以上清单及既有 A0-SITE 私有原件人工比对正确完整 UUID，再手动填写：
VM_UUID='<精确、已经核实的本次隔离测试 VM UUID>'
# 若仍是占位符、命中生产/非预期 VM，立即停止。
"$VBOX" showvminfo "$VM_UUID" --machinereadable
"$VBOX" snapshot "$VM_UUID" list --machinereadable
"$VBOX" list hostonlynets
"$VBOX" list hostonlyifs
/usr/sbin/sysctl -n net.inet.ip.forwarding
/usr/sbin/sysctl -n net.inet6.ip6.forwarding

# 仅在 showvminfo/私有旧回执能确定现用准确虚拟磁盘 UUID 后才查询（只读）：
# "$VBOX" showmediuminfo disk '<准确附着磁盘 UUID>'
```

**证据重点：**VM UUID、VMState、NIC1–8、Host-only network 名称、SharedFolder/Clipboard/DragDrop、当前 Attached Medium 与 Snapshot 链、系统 IP forwarding。`snapshot list` 证明**快照记录存在**而**不是可独立恢复**；VB-04 的恢复证据仍需在随后经单独授权的可丢弃 Clone 验证。现有 `hostonlyifs` 可能返回 rc0/空输出，必须保留原值和真实命令 rc、判断 `PARTIAL` 而不是当作新增接口存在。

**安全注意：**这些原始输出可包含 Mac 本地路径、VM UUID、虚拟 MAC/私有 IP、可能的共享目录；默认不向公开 GitHub/聊天贴完整文本，只允许**脱敏版关键属性与原件 SHA**供后续审阅。拒绝在此阶段执行 `startvm/controlvm/modifyvm/snapshot take/delete/restore/clonevm`、`sudo` 或 host 网络探测。

## 3. 第二步：Guest 控制台非 root 只读版本/守护进程清单（VB-01 / VB-03 / VB-05）

只有**第一步准确对象和 Host-only 配置复核后**才能在对应**已运行的 Guest VirtualBox 控制台**执行下面的命令（不用 SSH、无需新增 host-key 首次信任）。不是让助手在生产 VM/新的未知 IP 上执行。读写副作用风险限定于 Guest 终端会话自己的日志，不触及配置。

```bash
# Guest G0：身份、Ubuntu / systemd / root 磁盘，非 root 身份
id -u; id -g; hostname
cat /etc/os-release | grep -E '^(PRETTY_NAME|VERSION_ID)='
uname -srm
systemctl --version | head -n 1
findmnt -no SOURCE,FSTYPE,TARGET /
lsblk -ndo NAME,SIZE,TYPE

# Guest G1：Docker/Compose/containerd/runc 工具与准确版本；缺少任一命令如实记 rc
command -v docker
docker version --format '{{.Server.Version}}|{{.Server.APIVersion}}'
docker compose version
command -v containerd
containerd --version
command -v runc
runc --version | head -n 1

# Guest G2：Docker daemon/socket/重启行为；不读所有 env、token、daemon 配置原文
systemctl show docker.service docker.socket \
  -p LoadState -p ActiveState -p UnitFileState -p FragmentPath \
  -p DropInPaths -p ExecStart -p TriggeredBy -p Requires -p After
docker info --format '{{.ServerVersion}}|{{.DockerRootDir}}|{{.LiveRestoreEnabled}}'
stat -Lc '%n|%a|%U|%G|%F' /var/run/docker.sock

# Guest G3：仅列名称/状态、卷名称用于确认没有生产数据混入；原输出留私有
docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}'
docker volume ls --format '{{.Name}}'
```

`docker` / `containerd` / `runc` 在该 Guest 上是否已安装**当前未知**；若命令不存在返回 `127` 或 Docker daemon 不运行而返回非零，记录为 **ENVIRONMENT_NOT_READY**，**不得偷偷 sudo、apt install、启用 daemon、修改 socket/权限**。不要展示整个 `docker inspect` 的 `Config.Env`，也不要读/上传 `/etc/docker/daemon.json`（可能含敏感端点）、SSH 私钥或 rclone 配置。若 G3 发现实际生产业务、含真实数据库的 Volume、Cloudflare Token/业务数据痕迹，立即阻断而非清理。

## 4. VB-01～VB-06 本批门禁

| Gate | 已继承证据 / 此批新证据需求 | 截至本地编制 |
| --- | --- | --- |
| VB-01 | A0-SITE/GUEST 十月二十二日 scoped；当前 VM/磁盘 exact UUID、Guest rootdisk/身份再比对 | **HISTORICAL PASS_SCOPED / CURRENT UNKNOWN** |
| VB-02 | A0 host-only/forwarding scoped；当前 NIC/share/hostonlynet/转发回读，Guest 不进行公网连通探测 | **HISTORICAL PASS_SCOPED / CURRENT UNKNOWN** |
| VB-03 | Guest systemd/Engine API/containerd/runc/Compose/live-restore/units/drop-ins；再与生产真实版本对齐 | **OPEN**，生产具体版本仍缺 |
| VB-04 | Snapshot/VM clone 历史存在；本次 attached VDI/当前 snapshot 链/独立控制台能力；实际恢复测试独立授权 | **PARTIAL / RESTORE NOT_VERIFIED** |
| VB-05 | G3 与 Host 共享目录/网络准入核对；合成 4 服务/Clover 替身尚未建立 | **OPEN** |
| VB-06 | 实际 VM UUID、数据/快照完整身份、策略/事故权限/受控撤回审批；随后才可安装 Guard/断电 | **NOT_AUTHORIZED** |

**判据：**必须先完成 Host 身份配置门禁，再 Guest 非 root 版本发现；VB-03 的生产版本如果未知，只能 `SIMILAR_PLATFORM_ONLY` 而非同版本 PASS。Docker 尚未安装/配置不构成必须立刻安装的理由，应形成准确最小安装差异、来源与撤回影响表，另行审批。A2-3 真实持久化/双回执/CAS/boot guard 尚未实现，P0-01 仍 **NOT_RUN**。

## 5. 交付与实际执行声明

本轮**已经执行**的是：仓库规范/当前 `dev` 文档只读、两份 2026-10-22 可信实验室原件复核报告以及生产 H14 既有证据**再审阅**，归纳当前缺口与最小现场命令。**没有**远程访问 Mac/VirtualBox，没有执行上述 Host/Guest 命令，也没有创建或操作新的 VM、Docker、systemd、AWS。此文档和对应 worklog 仅留 MCP-workspace 本地分支供用户审阅，首次推送/PR→dev 需另行授权。

**本节成文当时：**`VB-READ-001 HISTORICAL SCOPED / CURRENT FIELD READBACK PENDING / VM P0-01 NOT_RUN / R2-C4 OPEN / G06 OPEN / S03 OPEN / C5-G2 NO-GO`。**后续现场续报见 §6，不将旧阶段直接改写成已验收。**

## 6. 2026-10-23 — Test-02 Host 当前配置核验（用户终端回传；限定范围）

**证据级别：`OPERATOR_TRANSCRIPT / HOST_CONFIG PASS_SCOPED / GUEST NOT_RUN`。** 操作者在原 Mac Terminal 实际回传了 VirtualBox `7.0.26r168464` 的 `list vms`（4 台登记）、`list runningvms`（只有既有 `SanQ-C2-1-Recovered-20261018` 在运行），以及准确指定的 `SanQ-Linux-Test-02` 的 `showvminfo --machinereadable`、`snapshot list --machinereadable`、`list hostonlynets`。记录中没有提供每条 `$?`、完整离机 SHA/ZIP/执行计时，因此**只按已见输出做限定的配置回读**，不可升级成 A0 原件级认证。

| 核验面 | 现场实际观察 | 判定及后续 |
| --- | --- | --- |
| VirtualBox 安装、准确对象 | `7.0.26r168464`；Test-02 的配置 UUID = hardware UUID = 本轮明确指定 VM UUID；仅 C2 恢复机正在运行，Test-02 为 `poweroff`（配置所报最后状态改变 `2026-10-18T20:23:11Z`） | `VB-01 HOST_ID PASS_SCOPED`；**不可误启动/修改 C2 恢复机** |
| NIC / 数据通道 | Test-02 `nic1=hostonlynetwork` 且 `hostonly-network1=HostNetwork`，链路 `on`；`nic2..8=none`；`clipboard=disabled`、`draganddrop=disabled`；当次输出未列 SharedFolder mapping | `VB-02 VM_CONFIG PASS_SCOPED`；无 NAT/桥接网卡配置，但**未实测 Guest 网络隔离/当前 Host forwarding/hostonlyifs** |
| Host-only Network | `HostNetwork` 返回 `Enabled`，网络 mask 为 `255.255.255.0`，地址范围属 `192.168.56.0/24`；与 Test-02 NIC1 所报名称对应 | `VB-02 HOSTONLY_NET CONFIG PASS_SCOPED`；名称吻合不能替代 Guest 网络/路由核验 |
| CPU / RAM | `cpus=1`、`memory=2048 MB`、VirtualBox BIOS / SATA | `VB-03 RESOURCE_LIMITED`；可先讨论轻量合成负载，**不承诺 4×完整生产服务容器可运行**；修改 CPU/RAM 另行审批 |
| Snapshot 注册 | `SanQ-Runtime-B4B2-Clean-Baseline-20261017`；快照 UUID 在 `showvminfo` 与 `snapshot list` 一致，标记 CurrentSnapshot | `VB-04 SNAPSHOT_REFERENCE PASS_SCOPED`；**未测试 clone/restore/断电恢复** |
| 当前附着磁盘 | `SATA-0-0` 是 Snapshots 目录中的 VDI，且 `SATA-ImageUUID-0-0` 有明确的 **磁盘** UUID；不是上表的 **快照** UUID | `VB-04 ACTIVE_MEDIUM_IDENTIFIED`；**父盘/差分链未复核**，不能把当前 child VDI 当干净基线 |
| 设备/其他 | VM 处于 `poweroff`；`recording_enabled=off`（配置同时出现个别 screen 子字段，按全局关记录）；未显示自动启动启用 | 不涉及现有 Snapshot 的任何写操作；不自动开始 Guest 取证 |

**本次新核验明确缺口：**未回传 `showmediuminfo disk` 当前附着磁盘/父盘关系、当次 `list hostonlyifs`、Mac IPv4/IPv6 forwarding；Guest 尚未启动，因此也无本轮 `systemctl/docker/containerd/Compose/live-restore`、生产同版本比对、真实 snapshot clone/SSH 救援证据。**不触发 startvm/modifyvm/snapshot take/restore/dockerd 安装或 P0-01**。

**下一项最小、只读、无 Guest 唤醒动作：**对**上述 Test-02 真实附着的 VDI UUID**执行 `VBoxManage showmediuminfo disk <exact attached medium UUID>`；另读 Host forwarding 两项；必要时重读 `list hostonlyifs`。保留原始返回与真实 rc，文件路径、磁盘 UUID、主机 MAC 等完整身份不录入公开 Git。读回结果若出现父盘丢失、`In use by VMs` 关联异常、非 hostonlynet、转发打开，则记录 BLOCKED 并停止。由于 Test-02 是 `poweroff`，即便 Host 检查通过，**开启 Guest 仍须另行确认对象与批准**。

**最新状态（截至 §6 回读）：**`VB-01 HOST_CONFIG PASS_SCOPED / GUEST CURRENT NOT_RUN; VB-02 HOSTONLY CONFIG PASS_SCOPED / FORWARDING CURRENT OPEN; VB-03 OPEN; VB-04 SNAPSHOT_REFERENCE PASS_SCOPED / CHAIN+RESTORE OPEN; VB-05 OPEN; VB-06 NOT_AUTHORIZED; P0-01 NOT_RUN / S03/G06 OPEN / C5-G2 NO-GO`.

## 7. 2026-10-23 — Test-02 当前差分 VDI 与 Host 转发续报

**证据类型：`OPERATOR_TRANSCRIPT / READ-ONLY MEDIA_METADATA`。** 用户在原 Mac 继续回传 `VBoxManage showmediuminfo disk`（精确目标为 §6 已附着 Test-02 的差分 VDI）、`list hostonlyifs`，以及 macOS IPv4/IPv6 `sysctl`。四条命令均有正常 stdout 或空 stdout、未附逐条 `$?`，故继续标 `PASS_SCOPED` 而非完整原件独立认证；没有文件级哈希、读盘校验或实际 VM 启动。

| 范围 | 当前用户输出 | 判定 |
| --- | --- | --- |
| 正确附着关系 | `showmediuminfo` 的介质 UUID 与 `showvminfo SATA-ImageUUID-0-0` 完全一致，`In use by VMs` 只指向准确 Test-02 UUID | **ACTIVE_CHILD_BOUND_TO_TEST02 PASS_SCOPED**；不是误选 C2 恢复 VM |
| 差分父链 | 介质 `Type=normal (differencing)`、`Format variant=differencing default`、`State=created`；`Parent UUID` 为**非 base** 的登记父盘 UUID | **CHILD_PARENT_UUID_PRESENT / PARENT_METADATA NOT_READ**；证明引用了父盘身份，不证明父盘存在、内容有效或整个差分链可恢复 |
| 容量 | 虚拟容量 `25600 MBytes`（25 GiB 级），当前差分 VDI 物理占用 `92 MBytes`，`Auto-Reset=off` | 合理的轻量差分盘元数据；**92 MB 只是子盘已分配空间**，不能当整个 Guest 磁盘大小或恢复证据 |
| `list hostonlyifs` | stdout **空**，与 10 月 22 日 A0-SITE 原始报告一致 | VirtualBox 7 在部分 macOS Host 使用 Host-only **Network**，不同于传统 Host-only Adapter；空接口列表**不能单独推断隔离失败或当前 Guest 可联通**，只保留证据 |
| Host 网络转发 | `net.inet.ip.forwarding=0`、`net.inet6.ip6.forwarding=0` | **IP_FORWARDING_DISABLED PASS_SCOPED**；与仅 NIC1 HostNetwork、其他网卡 none 共同支持受限隔离配置；**不能排除宿主用户态代理/共享路由等旁路** |

Oracle VirtualBox 7.0 文档将 *differencing images* 定义为只存相对父介质的变更，且允许多级父子链；必须存在有效父链才可能还原完整虚拟磁盘。官方也区分 macOS Host-only Networks 与旧 Host-only Adapters，网络接口可动态创建。参见 [VirtualBox 7.0 Storage](https://docs.oracle.com/en/virtualization/virtualbox/7.0/user/storage.html) 与 [Networking](https://docs.oracle.com/en/virtualization/virtualbox/7.0/user/networkingdetails.html)。在 Test-02 当前 `poweroff` 状态下，`list hostonlyifs` 为空不能据此宣布网络损坏。

**接下来唯一需要优先补齐的 Host 只读项目：**对当前子盘在输出中**明确声明的 `Parent UUID` 调用 `VBoxManage showmediuminfo disk <parent-uuid>`，比对该父盘 State、Type、Location、In use by VMs、Capacity 与是否还存在上层 Parent UUID；若仍非 `base` 则沿实际父链逐级只读检查，直到基盘。**不运行** `clonevm` / `snapshot restore/delete/take` / `startvm` / `modifyvm`，不借修复需求修改父 UUID 或合并 VDI。若找不到父盘、归属矛盾或可疑状态，`VB-04 CHAIN BLOCKED`，应停止 Guest 启动。

**本次续报结论：**`VB-01 HOST_ID+CHILD_BIND PASS_SCOPED / VB-02 HOSTONLY+FORWARDING_CONFIG PASS_SCOPED / VB-03 GUEST_NOT_RUN / VB-04 CHILD_METADATA PASS_SCOPED + PARENT_CHAIN OPEN + RESTORE NOT_VERIFIED / VB-05 OPEN / VB-06 NOT_AUTHORIZED / P0-01 NOT_RUN / G06-S03 OPEN / C5-G2 NO-GO`。本地文档仅续写证据，未操作 VirtualBox/生产/VM 文件，也未推远端。

## 8. 2026-10-23 — Test-02 父盘只读核验：完整两级元数据链

**证据级别：`OPERATOR_TRANSCRIPT / VDI_PARENT_METADATA PASS_SCOPED`。** 用户在原 Mac 对 §7 现役子盘声明的**准确父盘 UUID** 执行了 `VBoxManage showmediuminfo disk`，回传：

| 校验项 | 实际字段 | 判定 |
| --- | --- | --- |
| 父盘 UUID | 与子盘原 `Parent UUID` 完全一致 | `PARENT_REFERENCE_MATCH` |
| 父盘的父盘 | `Parent UUID: base` | 两级链到此为止，没有第二级上游父盘 |
| 类型/状态 | `Type: normal (base)`、`State: created`、`Format: VDI`、`dynamic default` | `BASE_MEDIUM_REGISTERED`；**不等于读盘/文件哈希或操作系统启动验证** |
| 容量/占用 | `Capacity: 25600 MBytes`，`Size on disk: 4345 MBytes` | 与子盘 25 GiB 虚拟容量一致；物理文件已分配空间不等于内容完整性 |
| VM/Snapshot 归属 | `In use by VMs` 指向已指定 Test-02，括号内显示其 `SanQ-Runtime-B4B2-Clean-Baseline-20261017` Snapshot | `PARENT_BOUND_TO_EXPECTED_VM_SNAPSHOT` |
| 子盘反向引用 | `Child UUIDs` 唯一列出 §7 已确认、Test-02 正在附着的差分 VDI UUID | **双向父子关联一致**，未见交叉关联到 C2 恢复机 |
| 文件位置 | 父盘位于 Test-02 VM 目录下的独立 `SanQ-H05-Restore-Check-20261015.vdi` 文件，子盘在其 `Snapshots` 子目录 | 结构符合当前两级差分映射；路径仅为元数据，**不是验证文件内容可读** |

**VB-04 判定更新：**`MEDIA_METADATA_CHAIN PASS_SCOPED`，包含 parent→base 与 child→parent 及反向子引用、VM/Snapshot 归属一致；`FILE_BYTES_INTEGRITY NOT_VERIFIED / SNAPSHOT_CLONE_RESTORE NOT_RUN`。可以结束本次 **Mac Host 的静态磁盘拓扑**回读，**不能**宣布整个 VB-04 恢复门禁已 PASS。

**下一门禁 VB-03：**Test-02 仍 `poweroff`，且 §3 的 Guest 命令尚未执行。仅在用户**单独明确批准对准确 UUID 的 Test-02 开机**，且再次核对它仍是 Host-only/NIC2..8 none 时，才启动这一台 VM，通过其本地控制台执行普通用户的**只读** OS/systemd/Docker/Compose/containerd/runc/daemon/socket 探测。必须明确开机产生 Guest 磁盘日志/状态写入，不属于纯 Host 只读；不操作正在运行的 C2 恢复 VM。开机授权不包括 Docker 安装或启动、修改 unit/网络、创建快照或进行 P0-01 断电实验。

**退出状态：**`VB-01 HOST_ID PASS_SCOPED / VB-02 HOST_NETWORK_CONFIG PASS_SCOPED / VB-03 GUEST_NOT_RUN / VB-04 MEDIA_METADATA_CHAIN PASS_SCOPED, RECOVERY_OPEN / VB-05 OPEN / VB-06 NOT_AUTHORIZED / P0-01 NOT_RUN / S03-G06 OPEN / C5-G2 NO-GO`。本批只将用户已提供的 Host 回执总结于 MCP 本地文档，没有执行 VirtualBox 命令或向远端提交。

## 9. 2026-10-23 — Test-02 开机与 Guest 非 root 读取获得明确授权（执行回执待回）

用户在本次对话明确授权：**只启动指定 `SanQ-Linux-Test-02` VM（原有完整 UUID 已由此前 Host 输出核实）并进行 VB-03 Guest 只读环境检查**。这属于此前 §8 单独要求的开机权限，**现在授权已满足**，但由于 MCP-workspace 不具备用户 Mac/VirtualBox 控制通道，**截至本记录实际命令仍未执行、VM 是否已启动未知，不得宣称 `VM_RUNNING` 或 Guest 已验收**。启动 Test-02 有 Guest 磁盘/日志写入副作用，用户已就这个准确对象明确批准；对正在运行的 C2 恢复 VM 不做任何动作。

交付给操作员的实际最小范围：
- Mac `VBoxManage showvminfo <Test-02 exact UUID> --machinereadable` 并只读筛选 `name/UUID/VMState/nic1..nic8/hostonly-network1`，开机前确认目标仍为 `poweroff` 且仅 NIC1 Host-only；然后 `VBoxManage startvm <exact UUID> --type gui`。
- 仅在该 Guest 本地控制台以既有**非 root**账户读取 `id -u/-g`、hostname、`/etc/os-release`、kernel、`systemctl --version`、root findmnt；`docker version`、`docker compose version`、`containerd --version`、`runc --version`；`systemctl show docker.service docker.socket` 的限定 unit/state/fragment/drop-in/ExecStart/TriggeredBy，以及 `docker info --format` 的服务版本、DockerRootDir 与 live-restore 三字段。
- 如果 Docker 缺失、守护进程不可达、普通用户权限不足，**保留真实 stderr/退出结果**，不得为追求 PASS 使用 `sudo`、安装软件、启动/重启 Docker daemon、修改 `docker.socket`、变更 unit/网络、创建或恢复 Snapshot。当前批次不做容器运行/启动，不执行故障注入，也未批准 SSH 自动信任。
- 如发现身份、网卡配置与 Host 回执不符，**不启动并报告 BLOCKED**。Guest 结果含机器名/私有 IP 等应按最小范围脱敏，绝不放入公开代码仓库。

**本次权限/执行状态：**`VB-03 EXACT-VM GUI START AUTHORIZED / NONROOT READ AUTHORIZED / START EXECUTION NOT_REPORTED / GUEST RESULTS PENDING`；`VB-04 MEDIA_METADATA_CHAIN PASS_SCOPED / RECOVERY_OPEN`；`P0-01 NOT_RUN / S03-G06 OPEN / C5-G2 NO-GO`。本轮仅 MCP-workspace 本地文档续记，尚未 push/PR。

## 10. 2026-10-23 — VB-03 Ubuntu Guest 版本与 Docker 缺失回执（用户 SSH 输出）

**证据级别：`OPERATOR_TRANSCRIPT / NONROOT_GUEST_ENVIRONMENT_OBSERVED / SSH-TO-VM BINDING NOT_INDEPENDENTLY_VERIFIED`。** 用户回传了在 Mac 上 `ssh ubuntu@192.168.56.2` 登录后的 Ubuntu banner 和 G0～G4 stdout：`ubuntu@sanq-linux-test`，Ubuntu 24.04.5 LTS / kernel `6.8.0-146-generic x86_64`；`id -u/-g` 均 `1000`；`systemd 255 (255.4-1ubuntu8.17)`；根盘 `/dev/sda2 ext4 /`。远端 Ubuntu 的 Host-only 地址与预期候选兼容，但**本次展示的是 SSH 而不是 §9 预定的 Guest Console**，没有提供 VBoxManage 当前运行 VM UUID、Guest 控制台身份/SSH 主机 ED25519 pin 的当次交叉复核及逐条退出码。因此可作为**自报的当前 Guest 环境版本**，不得由 SSH 登录成功自动推断与已批准 Test-02 完整 UUID 强绑定。用户此前已提供 C1 A0 有界 SSH pin 的历史证据，本次不重做 A0，也不据此自签新的信任。

| 检查项 | 2026-10-23 已见原始结果 | VB-03 门禁 |
| --- | --- | --- |
| Guest OS / Kernel | `Ubuntu 24.04.5 LTS` / `6.8.0-146-generic` / `x86_64` | **OS_VERSION_OBSERVED** |
| systemd | `255 (255.4-1ubuntu8.17)`，G0 命令成功打印版本 | **SYSTEMD_VERSION_OBSERVED**，未对照生产实际版本/配置 |
| 用户与根盘 | UID/GID `1000/1000`，`/dev/sda2 ext4 /` | **NONROOT + ROOTFS OBSERVED** |
| Docker CLI / Engine | `command -v docker` 无可执行路径，`docker version` 和 `docker info` 输出 `Command 'docker' not found` | **DOCKER_MISSING / FAIL-CLOSED** |
| Docker Compose | `docker compose version` 报 `docker` 命令不存在 | **COMPOSE_NOT_AVAILABLE**；不可得出组件独立精确安装来源 |
| containerd / runc | 二者查询分别提示 `Command 'containerd' not found`、`Command 'runc' not found` | **CONTAINERD_RUNC_MISSING** |
| docker.service / socket | `systemctl show` 打印两份 `LoadState=not-found / ActiveState=inactive` 且 `FragmentPath/DropInPaths/UnitFileState` 空；G3 命令在回传粘贴过程中有拼接/错位 | **DOCKER_UNIT_NOT_FOUND_OBSERVED**，必要时以精确独立命令再确认，不标记 unit 入口已精确验证 |
| VM 启动、Host-only SSH | 用户实际到达此 Guest 的 SSH Shell；未回传指定 Test-02 `startvm` 的 stdout/rc、`list runningvms` 或本次 Guest Console 指纹 | **GUEST_RUNNING_INFERRED / EXACT_VM_SESSION_BINDING_PENDING** |
| Ubuntu 更新提示 | 登录 banner 显示有 15 项 update 可安装 | **NOT_INSTALLED / NO APT ACTION AUTHORIZED** |

**总体裁定：`VB-03 OS-SYSTEMD SCOPED / DOCKER_STACK_NOT_PRESENT / SAME_VERSION_NOT_VERIFIED / INSTALL_NOT_AUTHORIZED`。** 现有 Guest 缺乏用于 P0-01 的 Docker daemon、restart manager、socket activation 和 Compose 真实机制；不能运行真实 Boot Barrier PoC，不能把 Ubuntu 提示的 `docker.io` 候选版本自动选为生产版本。若后续确需在这台隔离 Guest 安装 Docker/containerd/Compose/runc，属于**新增 Guest 软件/服务/systemd unit/权限边界**，必须先进行只读生产版本/安装来源比对、网络软件来源可达性与可回滚容量/备份计划、独立明确授权；不可自行 sudo/apt/启用 Docker。

**最小下一步（只读/不破坏）：**由 Mac 操作者对**本次唯一批准的 Test-02 UUID**执行 `VBoxManage list runningvms` 和 `VBoxManage showvminfo <exact UUID> --machinereadable` 的少量身份/网络字段回读；必要时通过其真实 VirtualBox Console 复核既有 Guest host key 或 Boot ID，以将 SSH 会话绑定到批准目标。另由生产独立只读授权通道分别采集 `docker version --format`、`docker compose version`、`containerd --version`、`runc --version`、`systemctl --version` 与 docker service/socket 状态，**不读取环境变量或私有 Docker 配置，不运行服务启停**。生产侧新读取如超出既有授权，须另行审批再执行。此处列的是未来命令候选，**没有执行**。

本轮没有 sudo、apt、Docker 安装、系统服务启停、快照写操作、故障注入或生产操作；历史磁盘链仍 `VB-04 MEDIA_METADATA_CHAIN PASS_SCOPED / RESTORE OPEN`，其他门禁 `P0-01 NOT_RUN / S03-G06 OPEN / C5-G2 NO-GO`。本地文档更新，未推远端。

## 11. 2026-10-23 — Mac Host 对 Test-02 当前 running 与 NIC 的再次绑定

**证据级别：`OPERATOR_TRANSCRIPT / HOST-VM-RUNNING-CONFIG PASS_SCOPED`。** 用户在 Mac Host 重新执行 `VBoxManage list runningvms` 与 `showvminfo <exact Test-02 UUID> --machinereadable`（仅 grep 精确身份与网络字段）。本次 `list runningvms` **仅列出 Test-02**，完整 UUID 严格匹配前述 Host/VDI 核验对象；`showvminfo` 再次验证 `name=SanQ-Linux-Test-02`、同一 UUID、`VMState=running`、`hostonly-network1=HostNetwork`、`nic1=hostonlynetwork` 和 `nic2..8=none`。用户先前 `ssh ubuntu@192.168.56.2` 取得 Ubuntu 24.04.5 / kernel 6.8.0-146 / systemd255 和缺失 Docker 的输出，现 Mac VM 唯一运行对象/Host-only 配置与这组结果**互相支持**；但没有此次 Guest 控制台 SSH key/Boot ID 交叉证据，**不提升为独立密码学绑定证明**。

**重要运行状态差异：**本次 `list runningvms` 中此前运行的 C2 恢复 VM **已不在列表**；仅能说它当时未运行，**不能猜测谁关闭或何时停止**，更不授权任何恢复机操作。对 Test-02 未观察到其它活动 NIC，原 Host forwarding 的 0/0 属前批证据，没有本批重复读取。

**阶段裁定：**`VB-01 CURRENT VM_ID/RUNNING PASS_SCOPED`、`VB-02 CURRENT VM_HOSTONLY_CONFIG PASS_SCOPED`、`VB-03 GUEST_OS_SYSTEMD OBSERVED / DOCKER_STACK_NOT_PRESENT`、`VB-04 MEDIA_METADATA_CHAIN PASS_SCOPED / RECOVERY_NOT_VERIFIED`。本次没有改变系统/服务/快照，**VB-03 不具备 P0-01 的真实 Docker 前提**。下一步需要先提出**生产版本/来源的只读候选命令**并依既定生产独立授权门禁采集，最后选择隔离 Guest 的 Docker 源/精确版本、容量与回退方案，用户进一步授权后方可安装。持续保持 `P0-01 NOT_RUN / S03-G06 OPEN / C5-G2 NO-GO`，本地文档不 push/PR。

## 12. 2026-10-24 — 新建 Jammy 实验 VM 的 Docker 安装和双快照（最新进度）

> **对象切换：本节仅指独立新建的 `SanQ-Runtime-Lab-Jammy-01`，不是上文 Ubuntu 24.04 的 `SanQ-Linux-Test-02`。** §§6–11 保留原日期的历史事实与当时审批结论。证据来源为用户在 Mac Terminal / Guest SSH 运行并回传的实际 stdout、安装日志和 VirtualBox GUI（`OPERATOR_TRANSCRIPT / PASS_SCOPED`）；MCP 没有直接连接 Mac。准确 VM/VDI/Snapshot UUID、私有 SSH 指纹/IP/文件路径和完整命令原件只留在操作者私有材料，不复制到公共仓库。

### 12.1 VM 基线与第一份快照

| 检查面 | 2026-10-24 已获现场结果 | 有界判定 |
| --- | --- | --- |
| Host VM 身份 | `VBoxManage showvminfo --machinereadable` 核对唯一目标 VM 名称、完整 VM UUID、独立 VDI，NIC1 为 `hostonlynetwork / HostNetwork`，NIC2–8 `none`；Mac 安装前可用约 43 GiB | `VB-01 HOST_ID PASS_SCOPED / VB-02 NIC CONFIG PASS_SCOPED`；不等于已排除全部 Host 转发/代理绕路 |
| Guest OS | `sanq-runtime-lab`，Ubuntu 22.04.5 LTS / amd64、Kernel `5.15.0-119-generic`、systemd `249 (249.11-0ubuntu3.12)`、根分区 ext4/30 GB、1 vCPU、约 1.9 GiB 内存/2 GiB Swap | 系统版本实测记录；不能由此推断与生产 Kernel/配置完全同版 |
| 网络与 SSH | Guest 单 Host-only 网卡、无 IPv4 默认路由；OpenSSH `active`；Guest Console 的 ED25519 SSH 主机指纹与 Mac 独立 `ssh-keyscan` 相符，并完成 Mac → Guest SSH 登录 | `GUEST ID/SSH PASS_SCOPED`；不是独立 VDI 内容/云端身份认证 |
| Ubuntu 干净快照 | 正常关机后 `snapshot take` 100%，`VBoxManage snapshot list` 的名称/UUID/CurrentSnapshot 与 VirtualBox GUI 一致，命名 `SanQ-Jammy-Clean-Baseline-20261024` | `SNAPSHOT REGISTERED PASS_SCOPED`；未测试 clone/restore 或盘块完整性 |

### 12.2 12 包受控离线安装：实际完成

- 经过官方发布签名与哈希链验证：Docker Jammy amd64 的四包 `docker-ce 5:29.2.1-1~ubuntu.22.04~jammy`、同版本 `docker-ce-cli`、`containerd.io 2.2.1-1~ubuntu.22.04~jammy`、`docker-compose-plugin 5.0.2-1~ubuntu.22.04~jammy`；Docker `InRelease` GPG good、`Packages.gz` SHA256 匹配，四包 SHA256/size 匹配；Ubuntu `jammy` / `jammy-updates` 的 `InRelease` 验签、`Packages.xz` 哈希匹配。
- 另外八包 `iptables`、`libip6tc2`、`nftables`、`libnftables1`、`libnftnl11`、`libnetfilter-conntrack3`、`libnfnetlink0`、`libjansson4` 来自经验证的 Ubuntu 包索引。Mac 通过独立 Guest 的 strict-host-key SSH 传输 **12 个本地 .deb**；Guest `sha256sum -c` **12/12 OK**，包架构均 amd64。
- APT 最终采用真实空 source/list 目录的**离线模拟**，确认 `0 upgraded, 12 newly installed, 0 to remove and 0 not upgraded`，所有 `Inst` 来自 `local-deb`。较早使用 `--no-download` 的模拟失败、另一次空源选项产生 warning，均在真实安装前修正；不得以当时的失败/警告代替最终成功回执。
- 用户明确批准**仅此准确新 VM** 的离线安装与禁用服务。实际安装前重新确认 Guest 名称/版本、Host-only 地址、SSH 指纹、12 包 SHA256 和精确 APT 计划；临时 `/usr/sbin/policy-rc.d` 返回 101，`postinst` 输出证实标准 `containerd.service` 与 `docker.service/docker.socket` 启动请求被拒。安装生成的 enable symlink 随后由 `systemctl disable --now` 移除；成功后临时 `policy-rc.d` 被清理。未运行 `docker.io` / `podman-docker`，未安装可选 Buildx，未升级 Guest 全系统。
- 完整日志出现 `CONTROLLED INSTALLATION COMPLETED / DOCKER SERVICES INACTIVE AND DISABLED / BOOT GUARD NOT INSTALLED`。Guest 只读核验：Docker `29.2.1 (a5c7197)`，Compose `v5.0.2`，containerd.io `v2.2.1`，runc `1.3.4`；`docker.service`、`docker.socket`、`containerd.service` 均 `LoadState=loaded / ActiveState=inactive / UnitFileState=disabled`，`dpkg --audit` 空，相关服务本次 boot 的 journal 查询 `No entries`。这**不构成跨 boot/直接进程启动的 fail-closed 证据**。

### 12.3 第二份快照、范围与下一门禁

操作者在安装完成后再次核验准确 Guest、四包 dpkg 版本、三 unit `inactive/disabled`、无临时策略和 `dpkg --audit` 空，再执行正常 `poweroff`；Mac 确认 `VMState=poweroff`。之后的 `VBoxManage snapshot list --machinereadable` 显示 **两份**快照且当前指向 `SanQ-Jammy-Docker-Baseline-20261024`，上一份 `SanQ-Jammy-Clean-Baseline-20261024` 保留。重复运行创建脚本因预期“当前仍是旧快照”而 `BLOCKED`，只读检查确认第二份已实际存在，**未重复创建**。两份仅达 `SNAPSHOT REGISTERED PASS_SCOPED`；新 VM 媒介父子全链、真实 clone/restore/开机恢复仍 OPEN。最近一次操作员现场回执 VM 为 `poweroff`。

**现行裁定（仅新 VM）：**`VB-01 HOST/GUEST_ID PASS_SCOPED / VB-02 HOSTONLY_CONFIG+GUEST_NO_DEFAULT_ROUTE PASS_SCOPED / VB-03 DOCKER_INSTALL+VERSIONS+SERVICE_DISABLED PASS_SCOPED / VB-04 TWO_SNAPSHOTS_REGISTERED_PASS_SCOPED, MEDIA_CHAIN+RESTORE_OPEN / VB-05 SYNTHETIC_LOAD NOT_RUN / VB-06 BOOT_GUARD+FAILURE_INJECTION NOT_AUTHORIZED`。生产 Kernel/runc/systemd 精确包与 daemon/unit/drop-ins/socket/`live-restore` 配置仍未取得同次对照证据，**不得宣布 `SAME_VERSION FULL PASS`**。失效风险仍在：`disabled` 不等于启动屏障，Boot Guard/真实双回执/CAS/epoch 尚未安装或实证。

**下一任务 VB-04：**先在 Mac 绑定准确 VM/网络/当前快照，再按后续明确批准的范围启动 Guest 做 Docker/systemd **只读**入口审计：`docker.service/docker.socket/containerd.service` 的 `ExecStart/Requires/Wants/After/TriggeredBy/DropInPaths`、SysV/直接 `dockerd`、socket activation、`live-restore` 与存活 shim/writer 的待证边界；形成 P0-01A–F 最小 PoC/救援与撤回方案。**本批没有授权启动 daemon、合成容器、修改 unit、安装 Guard、恢复快照、断电故障或生产操作**。保持 `P0-01 NOT_RUN / S03-G06-S09 OPEN / R2-C4 OPEN / C5-G2 NO-GO`；本轮 MCP 只更新本地文档，不推送远端。

