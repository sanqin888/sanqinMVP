# C5-G2-B2B2 — Independent process census corroboration

**Date:** 2026-10-13 America/Toronto  
**Baseline:** `origin/dev@9fdff22f1df8363bf8da98604648f663ffc50119`; prior B2B PR #2794 merged, CI #7176 seven of seven green (initial CI #7175 failed and was fixed).  
**Status:** LOCAL SOURCE REVIEW ONLY / NO ROOT HOST ACTION / NO PROD INSTALL / S2 PAUSED.

## Scope and design

`ops/runtime/isolated_maintenance_revalidation.py` is an offline **negative-only** two-census corroborator. It checks exact result shape, path identity, most importantly zero Runtime-reference PID and zero unknown PID in **both** G2-B2A-style bounded process census reports. It validates count consistency, PID type/uniqueness/ordering, untrusted privilege flags, and missing/extra fields. If a reference exists in either report, the condition is blocked. It does not accept a `clear=true` token.

The only output after internally consistent observations is an explicitly untrusted receipt: `realHostObservationAuthenticated=false`, `mountNamespaceAndAliasesVerified=false`, `liveActorExclusionVerified=false`, `crossProcessQuiescenceVerified=false`, `readyToInstall=false`, `authorizedToMutateProduction=false`.

Added synthetic negative tests at `ops/runtime/tests/test_isolated_maintenance_revalidation.py` under GitHub `api-checks` Python unittest discovery. Per AGENTS.md, local tests have not run; source/diff status only until user review.

## Architectural limits and next gated stages

Two clear textual `/proc` scans **cannot prove** that a new MCP, Deploy, Backup or SSH actor is unable to appear afterward. Nor do they resolve mount namespaces, bind aliases, mmap, device/inode references or root authority. This component deliberately does not import/execute the B2B synthetic operator, host systemctl, Docker, live `/proc` or any privilege-capable function. The source remains excluded from the fixed 17-file Runtime Archive.

**G2-B2B3 independent isolated Linux ext4 acceptance** must test real root-owned source delivery, independent hashes, live disposable systemd units and non-cooperating subprocesses, complete /proc and mount identity observation, enforced stop/start barrier, fail-closed behavior and original state restoration. No such VM test has been executed under this change; no production root/operator installation is authorized.

The original historical Runtime Archives + true create-only encrypted off-VM Recovery Kit remain separate G2-B3, blocked; S2 daily backup remains paused.
