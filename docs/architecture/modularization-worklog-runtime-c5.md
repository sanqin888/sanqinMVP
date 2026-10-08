# Post-modularization Runtime / GHCR worklog supplement

Primary `modularization-worklog.md` exceeds the MCP workspace patch-size limit. This owner supplement records the C5 batch without truncating/replacing the original timeline.

## 2026-10-08 — Application/Runtime release SHA decoupling

**LOCAL SOURCE / USER REVIEW PENDING / CI NOT RUN / NO PRODUCTION CHANGES.** Retained the fixed root-owned Runtime file/manifest checks, removed deploy controller reliance on a Git main checkout, and permits newer sealed GHCR application releases only if a bounded GitHub source comparison shows no Runtime Bundle member changes. Runtime installation/update, MCP source-retirement and production validation remain separate gates. See `docs/architecture/postmod-ghcr-deploy-simplification-2026-10-08.md`.

## 2026-10-08 — C5-B3 independent Launcher branch retired

The user canceled the uninstalled independent root Launcher/signing/journal proposal. Related source-only code, tests and stage documents were removed. Git history preserves the original PR record; the GHCR paired-image publisher and existing deploy controller remain authoritative.

