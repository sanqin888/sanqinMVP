# C5-U2D S1 — Protected Config Snapshot / old-plan retirement

**State:** MERGED dev PR #2789 / PR CI #7164 AND post-merge #7165 GREEN / NOT INSTALLED / NO PRODUCTION AUTHORIZATION  
**Baseline:** latest `origin/dev` at `48915a59f9262347a37c74e6339f496fc20567ad` (2026-10-11).  
**Decision:** pre-install encrypted Runtime Recovery Kit is primary, daily config backup is supplementary; interrupted Runtime installation is abandoned, never resumed.

## Ownership and current S1 boundary

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

Per `AGENTS.md`, local validation is not run before user review. GitHub CI will be the next gate **only after** the operator explicitly authorizes remote delivery to a dev PR. S1 carries no migration, package/lockfile or 17-member Bundle change.

**Exit update 2026-10-13:** S1 MERGED/CI GREEN; production helper/crypt/installation remains NO-GO. C5-G2-A local work takes precedence over S2.
