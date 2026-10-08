# C5-B3B2G — Independent Launcher bootstrap trust boundary

**Status: LOCAL SOURCE / USER REVIEW PENDING / CI NOT RUN / NO PRODUCTION AUTHORIZATION.** Base: C5-B3B2F PR #2748 merged to dev at `7b33ad9fec1ea9f5027e38a3fb83c8e7e48cc162`.

## Existing owners and reason for this Slice

Option B authorizes the **architecture boundary** of an independent root-owned Launcher installed outside the replaceable Runtime. Existing image-only deploy owner (`ops/release/deploy_release.py`), C4 backup helper/sudoers and root/ubuntu separation stay unchanged. Previous B3B2F proves how to check archived version byte inventories and paired image digests using an injected publication API. It cannot authenticate a privileged Launcher binary or safely execute one from `/home/ubuntu/sanq-app`.

This Slice adds `ops/runtime/inert_launcher_bootstrap.py`: a strict, **non-executable manifest parser** for a candidate stable path `/usr/local/libexec/sanq-runtime/sanq-runtime-launcher`, exact root:root UID/GID, proposed mode 0500, candidate bytes SHA256 and mandatory `bootstrapApproved=false` / `productionActivationAuthorized=false`. Tests verify byte tampering, path/UID/mode spoofing, manifest shape and all authorization flags. The code never creates, installs, executes, imports or writes the package and provides **no CLI, sudo bridge or production host reader**. A matching untrusted manifest and bytes prove only their mutual consistency; a malicious caller can generate both.

## Required independent authority before a root-owned executable can exist

1. Human reviewer must freeze an immutable package source, signed/sealed provenance, reproducible artifact SHA256, explicit release version and detached ownership proof **from an independently trusted root-controlled source**, not files on the mutable Git checkout.
2. A separately approved root operator must provision fixed trusted parent directories and their owner/mode, check symlink/hardlink/race and mount identities, verify the installed inode and executable hash against independent publisher evidence. No `ubuntu`-writable ancestor and no change to the backup-helper sudoers.
3. Future code must have fixed explicitly enumerated verbs, no arbitrary path/command injection, no shell interpolation, and must refuse operations without exclusive lock, durable pending journal, independently verified archived Runtime and paired image digests, and manual C4 recovery evidence.
4. This is not a production cutover. Installer implementation, production filesystem writes, Docker operations, migrations, backup timer control, retention cleanup and removing the Git checkout remain **separate approval gates**.

The existing `.github/workflows/ci.yml` Runtime stdlib unittest discovery will cover `test_inert_launcher_bootstrap.py` once pushed with user approval. No local tests were run under AGENTS.md.

**Next recommended gate:** read-only audit of independently signed Launcher package provenance and actual bootstrap operator/host install policy. Do not convert this model into a privileged helper or deploy it to VM without the explicitly reviewed installation process.
