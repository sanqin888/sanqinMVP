# C5-B3B2E — Isolated archive-byte and host/Ledger evidence correlation

**Status: LOCAL SOURCE / REVIEW PENDING / CI NOT RUN.** Base: C5-B3B2D PR #2746 merged into dev at `c747f78e6342e022f03b69ad7e281821021911a4`.

## Ownership and behavior

Under the existing Runtime/Ops boundary, `ops/runtime/isolated_evidence_correlation.py` consumes three existing *inert test contracts*: a B3B2D isolated host inspection record, a B3B2C chained ledger plus its B3A journals, and a **supplied bytes object** for the final modeled active Runtime archive. It checks exact host-fixture fields with no production claims, full ledger/journal validity, and the actual SHA256 of supplied binary bytes against the validated final target archive hash. Missing bytes, wrong hash, incomplete chain, corrupted ledger and claims of real host/production authority are blocked. A test verifies the matching synthetic case, invalid archive content, tampered checkpoint and fake verified-host flags.

This is strictly an **offline consistency assertion**. All inputs can be forged by the test caller. The function does **not** verify the original GitHub release provenance, inspect the archive member inventory, authenticate publication statuses, query Docker, examine a VM, verify a mounted PostgreSQL volume, prove uploads or backups, or verify a human recovery signature. Hash chaining is not an external signature and this synthetic data does not prove immutable retention. It does not write files or execute commands. Every returned permission and production-verification flag remains `false`.

## Architecture and deferred gates

A root-owned stable Launcher outside the active Runtime tree remains the selected **architecture** (Option B). Actual installation, root-owned state writing, file replacement, Docker switching, privilege installation and production C4 cutover are outside this task and continue to require separate authorization. The next review should define an **independent, authenticated provenance reader** and isolated integration harness that verify full archived Runtime inventories plus the two independently pinned GHCR image digests. No new production host probe should execute from user-writable workspace source, and `/opt/sanq/runtime` must remain a physical directory, not a symlink.

GitHub CI discovers `ops/runtime/tests/test_isolated_evidence_correlation.py` through existing Python stdlib unittest discovery. Local tests were not run before review under `AGENTS.md`.
