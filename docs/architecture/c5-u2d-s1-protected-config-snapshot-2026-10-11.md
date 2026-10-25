# C5-U2D S1 — Protected Config Snapshot / old-plan retirement

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**当前适用性：**S1 是已合并但未部署的五文件独立库；本次不再强制 R3 preinstall Kit/真实 crypt 适配。未来 daily 扩充可按独立审阅复用，S2 仍后置，现役备份与 escrow 不变。下文保留 2026-10-11 库契约及旧路线原文，不是现行更新门禁。

**State:** MERGED dev PR #2789 / PR CI #7164 AND post-merge #7165 GREEN / NOT INSTALLED / NO PRODUCTION AUTHORIZATION  
**Baseline:** latest `origin/dev` at `48915a59f9262347a37c74e6339f496fc20567ad` (2026-10-11).  
**Historical decision (superseded for this update):** pre-install encrypted Runtime Recovery Kit was primary; the current AWS snapshot route above replaces it. The S1 library remains unchanged.

## 历史 S1 库契约与原路线（保留实现边界）

### Ownership and S1 boundary

`ops/backup/protected_config_snapshot.py` is a **library-only, inert** shared component. It cannot execute a backup by itself and has no CLI, shell, sudo, network calls, Docker calls, root service, production installation or deployment authority. No change is made to installed `/home/ubuntu/backup-db.sh`, systemd, rclone, sudoers, `/opt/sanq/runtime`, `ops/release/deploy_release.py`, the strict 17-member Runtime Archive or database.

It reads exactly these five fixed basename members under an already trusted Runtime directory: `.env`, `.sanq-release-state.json`, `.sanq-backup-layout-activated`, `docker-compose.yml`, `runtime-release.json`. The first four carry recovery configuration; the fifth binds to the current Runtime identity. The 17 Runtime source names are independently pinned, not supplied by the installed manifest. In-memory archive members are these five files and a separate inventory JSON containing their SHA-256, original UID/GID, mode, size and identity metadata. No plaintext file contents or sensitive hashes are sent to ordinary logs or the round-trip receipt.

Snapshot protection includes descriptor-anchored `O_NOFOLLOW` directories and files, regular-file and link-count requirements, owner/mode/size bounds, directory-entry identity and second-pass byte/inode verification, `.env`/Release State application SHA equality, settled `active` or `rolled-back` phase (never `pending`), C4 marker bytes, fixed Compose storage identity and Runtime manifest 17-member declarations/API-Web digest syntax. Runtime **source** SHA must not be equated with running **application** SHA.

`archive_snapshot` produces **plaintext in-memory bytes** that must never be written to a shared path. `verify_remote_round_trip` has only an injected `EncryptedCreateOnlyRemote` protocol; it checks create-only semantics and full readback of decrypted plaintext against archive hash and member metadata, and returns `readyToInstall=false` / `productionRemoteVerified=false`. It is **not** production-ready encryption, upload, lock or a sufficient Runtime install gate.

## Review of root privilege and mode selection

S1 creates **no new sudoers grant**. At S2, a separately reviewed root-owned immutable-location wrapper may expose **only** a fixed no-argument `daily` command to the existing `User=ubuntu` service; proposed narrow sudoers:

```text
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/sanq-protected-config-snapshot daily
```

The privileged wrapper must use fixed `/opt/sanq/runtime` and checked `gdrive_secure:config`, never accept a caller path, config, shell fragment, URL or arbitrary output name, and never make root `0600` Release State readable by ubuntu. It must be independently installed by a root operator, validate root-owned code and a trusted pinned rclone crypt configuration, and run under a cross-process maintenance contract. S3's `preinstall` command belongs exclusively to an operator-authenticated root-private installer, **never** to the ubuntu sudoers entry.

The Python library's private `_capture(..., anchor=..., ids=...)` fixture seam exists only for deterministic CI tests. Future privileged execution must call `capture_production_config()` with the fixed absolute path; tests may simulate UID/GID ownership under a disposable directory. A library API accepting an injection for tests is not an authorized root command-line option.

## Explicit deferrals and gates

- **S2:** trusted root/ubuntu helper installation, pinned rclone crypt transport, true remote creation/readback/decrypt, daily backup integration, 30-day retention isolation, fail-closed scheduled-run reporting, and shared lock participation.
- **S3:** independent current/target original Runtime Archives plus historical GitHub proof, actual Docker container and `sanq-app_pgdata`/uploads identity, maintenance barrier and status recheck after readback, immutable-per-purpose full Kit, and hard pre-install BLOCKED behavior.
- **S4:** independently authenticated operator clean-reinstall entry, same-version recovery, incident quarantine, C4 revalidation without copying stale authority, real ext4 root/ubuntu end-to-end drill.
- **S5:** individual C4-style source-vs-installed helper/sudoers/service review, operator installation and production verification/rollback approval.

## Retired old approach vs retained historical evidence

- Deleted unexecuted and unused `ops/runtime/tests/c2_cold_powerloss_probe.py`; it was outside the 17-member source allowlist, had no CI test-discovery entry and was not a production consumer.
- `ops/runtime/runtime_update_contract.py` now describes abandoned transactions and **new independently authorized clean reinstall**, not resumption from a previous journal/slot. Ordinary Runtime updates still reject the same SHA; S4 will introduce an explicitly separate recovery contract.
- At the original S1 closeout, the retired power-loss plan and prior-tree recovery design were marked **superseded**, not deleted or falsely marked passed. The separately approved 2026-10-17 documentation consolidation now carries their original decisions, bounded evidence, fixed-version originals and **NOT EXECUTED** state in the [historical evidence index](./Runtime历史决策与证据索引.md); it does not change the recovery policy or claim cold-power-loss PASS.
- Existing `offline_root_private_installer.py`, FD/kill safety tests, and journals remain **lab-only evidence** and have no production privilege. Deleting them or replacing Runtime atomic handoff semantics is a separate architecture decision, not a consequence of S1.
- S1 does not retrospectively close cold-power-loss evidence or authorize deletion of Mac/VirtualBox evidence.

## Review and tests

GitHub's existing `api-checks` lane discovers `ops/backup/tests/test_*.py` and `ops/runtime/tests/test_*.py`. New synthetic tests exercise the five-file inventory, root/ubuntu identity policy, symlink/hardlink/mode rejection, state/marker/Compose conflicts, replacement race, independent source/app SHA, remote collision, upload/readback failures, corrupt remote bytes, and fixture-only receipt semantics.

S1 当时未执行本地 lint/build/test，后经批准远端交付并通过 PR #2789 / CI #7164、#7165；此为源码/合成验收，不是生产 helper、crypt 或真实安装 PASS。S1 无 migration、package/lockfile 或 17-member Bundle 变更。当前 R0 文档批已获远端交付授权；交付/CI/合并以该批 PR 最终记录为准。

**原 2026-10-13 退出记录 / R0 更新：**S1 MERGED/CI GREEN；G2-A 已合并，当前按 R1–R5 继续；production helper/crypt/installation 仍 NO-GO。S2 新 daily 扩充在 v1/C5 后，不暂停现役 timer。
