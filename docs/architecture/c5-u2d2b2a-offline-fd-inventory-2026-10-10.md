# C5-U2D-2B2-A — Offline FD-anchored Inventory

**Status: LOCAL IMPLEMENTATION FOR REVIEW / NOT CI-VERIFIED / PRODUCTION NO-GO**  
**Baseline:** dev merge `d07ca95b22d65191c724dfddf412b848ca41d9f3`, U2D-2B1 PR #2782 GitHub Actions 7/7 green. Worktree `audit/c5-u2d2b-root-cold-recovery-readiness`.

## Scope and design

Following `AGENTS.md`, `.github/workflows/ci.yml`, U2D-2B2 readiness audit and U2D-2A/2B1 existing implementation, introduce a **separate, read-only offline helper** at `ops/runtime/offline_fd_inventory.py` and unit tests at `ops/runtime/tests/test_offline_fd_inventory.py`. The U2D-2A installer kernel is **unchanged**: the helper is not wired into any installation, recovery, backup, MCP, Docker, or deploy action.

The helper accepts **only** a mode-0700 current-operator-owned direct `/tmp/sanq-u2d2a-lab-*` directory with an existing exact lab marker. Target slots are restricted to `live/runtime`, `stage/candidate`, `retained/previous`, and `recovery/preimage`. It opens a stable descriptor for `/tmp`, and follows each component via `os.open(..., dir_fd=parent_fd, O_DIRECTORY|O_NOFOLLOW)`; checks `fstat` against `stat(..., follow_symlinks=False)`, owner/group, mode and same device. Directory content enumeration comes from separately opened directory FDs, not Python `Path.rglob()`. Parent names and exact allowlisted entries are checked before and again after inventory.

Every one of the **17 source members**, the Manifest, and the three preserved dynamic files is opened relative to a pinned directory fd, with `O_NOFOLLOW|O_NONBLOCK`; each requires regular file, single link, expected user/group, non-writable group/other, maximum bound, same device, and stable inode/path identity. Dynamic file permissions follow existing contract: `.env` 0600 (ubuntu owner when running as root), release-state 0600, C4 marker 0644; ordinary source files retain valid executable bits. Exact declared directory/member names only; unexpected sibling or mount crossing is rejected. A point-in-time inventory returns digest and metadata for 21 files plus target directory inode/device without emitting the dynamic file **contents**.

The deterministic test callback is restricted to the `docker-compose.yml` read, enabling unit tests to change a leaf, modify an open file or rename an intermediate directory in the check/use window. Additional tests reject an intermediate symlink, unexpected file, hardlink, insecure permissions, non-lab path and production path.

## Deliberate limitations

- This is a **read-only, detached evidence helper**. It does not validate the Manifest's own 17-member file digests against a genuinely authenticated original Archive. It is **not** an external GitHub provenance verifier, app image/version match, running-process FD/cwd probe or exclusive maintenance barrier.
- Pinned FDs and repeated checks narrow path-swap risk; they **cannot** guarantee that a competing writer did not transiently replace and restore an inode between observations (ABA) or modify a file immediately after the scan. The future privileged installer still needs a maintenance exclusion barrier, stable root-private publication, and further descriptor-safe transaction integration following a separate review.
- Tests rely on ordinary-user temporary Linux filesystem semantics; no production `/opt/sanq/runtime` access, root+ubuntu separated UID, bind mount/cross-device exercise or independent cold power-failure evidence is claimed. The latter require an explicitly approved, disposable isolated VM stage.
- The result always declares `readyToInstall=false`, `productionActivationAuthorized=false`, and `quiescenceVerified=false`.
- No new dependency, schema, CI workflow change, Runtime `SOURCE_FILES` change, production installer entry, or automatic rollback.

## Validation/delivery

Test discovery: `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'` under existing GitHub Actions `api-checks`. Per `AGENTS.md`, tests/lint/build are **not run locally** in this initial MCP review phase. Next steps: user review; separately authorize remote push/PR; all CI green before merge; then plan the isolated real-root UID/GID and reboot/power-loss evidence.

**Exit state: `2B2-A LOCAL REVIEW / PRODUCTION INSTALL BLOCKED`.**
