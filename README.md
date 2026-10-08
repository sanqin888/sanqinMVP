# sanqinMVP

Monorepo (pnpm workspace) for **Sanqin Roujiamo** web + API, deployed with Docker Compose.

## Stack
- Node.js 20 (Alpine)
- pnpm workspace
- Next.js (web) built as **standalone**
- API (Node) built to `apps/api/dist`
- Postgres 15

---

## Repository Structure

- `apps/api` — Backend API (build output: `apps/api/dist`)
- `apps/web` — Next.js web (standalone output: `apps/web/.next/standalone`)
- `libs/*` — Shared libraries
- `tools/printer-server` — **Windows local ESC/POS printer server** (NOT deployed on VM)

> **Important:** `tools/printer-server` is designed to run on a Windows POS machine (uses `cmd /C copy /B` and printer shares). Do **not** run it on the Linux VM.

---

## Local Development

### 1) Install dependencies
```bash
pnpm install
2) Run DB (optional)
If you prefer Docker for Postgres:

bash
复制代码
docker compose up -d db
3) Run API/Web locally
Example (adjust to your scripts):

bash
复制代码
pnpm --filter api dev
pnpm --filter web dev
Production Deployment (VM)
1) Use the production VM's existing Compose environment source.

Do not assume a fixed path such as `/etc/sanqin/sanqin.env`. The active
production VM verified on 2026-09-29 does not have that path; its existing
Compose environment resolves correctly when `docker compose` is run from the
production repository directory.

2) Pull and run a validated release

The production Compose environment must define `GOOGLE_MAPS_BROWSER_KEY`, `CLOVER_WEB_PUBLIC_TOKEN`, and `CLOVER_WEB_SDK_URL` before the runtime-config slices are deployed. `GOOGLE_MAPS_BROWSER_KEY` remains distinct from the server-side `GOOGLE_MAPS_API_KEY` used for geocoding; Clover Web Ecommerce browser configuration is supplied by the API at runtime while `CLOVER_MERCHANT_ID` remains the existing server-side merchant identity. The Web image is environment-neutral and must not receive production `NEXT_PUBLIC_*` build args.

Production must also define `SANQ_IMAGE_SHA` as the full 40-character commit SHA of a `main` release whose `ci` and `publish-images` workflows both completed successfully. API and Uber worker intentionally use the same API image tag.

Pull only the application images so deployment does not refresh the mutable PostgreSQL base image unintentionally:

```bash
docker compose pull api ubereats-worker web
docker compose up -d --no-build
```

Do not use `docker compose up -d --build` on production. Production application images are built by GitHub Actions and pulled from GHCR; the Lightsail VM is runtime-only.

Do not treat container start alone as deployment success. Apply any explicitly
authorized production Prisma migrations through the normal controlled migration
gate, then verify migration parity plus local/public runtime readiness.

For rollback after a GHCR-based release, set `SANQ_IMAGE_SHA` back to the full SHA of the previously verified published release, pull the three application services again, run `docker compose up -d --no-build`, and repeat runtime-readiness verification. For the first GHCR cutover, keep the pre-cutover local images and prior Compose revision available until the new release is verified; do not prune them during the cutover window.

GHCR image publishing foundation:

After the authoritative `ci` workflow succeeds for a push to `main`, GitHub Actions builds the validated commit with `Dockerfile.api` and `Dockerfile.web` and publishes immutable images tagged with the full commit SHA:

```text
ghcr.io/sanqin888/sanq-api:<full-git-sha>
ghcr.io/sanqin888/sanq-web:<full-git-sha>
```

The publishing workflow does not deploy to production, run Prisma migrations, or move a mutable `latest` / `main` tag. The first GHCR pull-only cutover was production-verified on 2026-10-04; the above explicit SHA deployment remains the production process.

Batch A adds a post-publish paired-image seal: once both image jobs finish successfully, CI checks both registry manifest digests and linux/amd64 availability, uploads a release proof artifact and seals the validated **source commit SHA** with `sanq/paired-images-published`. Batch B also embeds both image digests in this status so the pull-only VM can compare them without a GitHub artifact-access token. Discover the latest eligible main release without changing the VM using `python3 ops/release/release_contract.py discover --pretty`.

Batch B provides a separately gated, **manual-only** deployment controller: `python3 ops/release/deploy_release.py plan` (read-only) or, **only after explicit production authorization**, `python3 ops/release/deploy_release.py deploy --execute`. It has not been installed or verified on the production VM. See `docs/architecture/postmod-ghcr-batch-b-manual-deploy.md`. The existing manual GHCR deployment instructions remain valid.

Batch C1 adds a **source-locked Runtime artifact** to the successful `publish-images` run: `sanq-runtime-<full-source-SHA>`. It contains only reviewed Compose/ops code plus a manifest matching the exact published API/Web image digests; no `.env`, uploads, backups or credentials. The archive is deliberately **not yet a deployable standalone /opt/sanq installation**, and it is not installed on production. See `docs/architecture/postmod-ghcr-batch-c1-runtime-bundle.md`.

Docker/image-workflow and dependency-manifest changes targeting `dev` also run the independent `image-build-checks` workflow. It builds and loads API/Web images on hosted runners, checks API runtime packaging and Web standalone health, and records build duration, local uncompressed size and cache details. It does not publish or deploy and does not run for ordinary source-only PRs. Its build/load timing is separate from release build/push timing; API packaging smoke does not establish database-backed runtime readiness. See [CI and image-build performance](docs/architecture/postmod-ci-performance.md).

`ops/verify-runtime-readiness.sh` currently accepts an explicit env-file path
as its first argument. Supply the actual production env-file path when one is
used; do not substitute the stale `/etc/sanqin/sanqin.env` example.

The verification script is read-only with respect to Prisma: it runs
`prisma migrate status`, then checks API readiness, Uber worker readiness,
Web-local health, public Web reachability, Web BFF -> API readiness, and the
public menu smoke path. A pending/failed migration or failed readiness/smoke
check must block deployment completion.

Services:

web : port 3000

api : port 4000

db : port 5432 (bound to 127.0.0.1 in compose)

Docker Build Notes
API Dockerfile (multi-stage)
Builder:

installs deps

runs npx prisma generate

builds API via pnpm --filter api build

Runner:

copies node_modules, libs, and apps/api/dist (plus prisma)

starts node apps/api/dist/main.js

Web Dockerfile (Next.js standalone)
Builder:

installs deps

pnpm --filter web build to produce .next/standalone

Runner:

copies .next/standalone as runtime

copies public + .next/static

starts node apps/web/server.js

Because you COPY . . in Dockerfiles, .dockerignore is critical for smaller, faster builds.

POS Local Printing (Windows)
The printer server runs on the POS Windows machine:

HTTP server listening on http://127.0.0.1:19191

endpoints:

GET /ping

POST /print-pos

POST /print-summary

Location in repo:

tools/printer-server/printer-server.js

Run (Windows)
bash
复制代码
cd tools/printer-server
npm i
node printer-server.js
Environment:

API_URL (default: http://localhost:3000; remote device authentication requires HTTPS)

POS_FRONT_PRINTER (default: POS80)

POS_KITCHEN_PRINTER (default: KC80)

POS_LABEL_PRINTER (Windows printer name for the 70x30mm food label printer; required only when label printing is enabled)

POS_LABEL_FONT (optional Windows font name; default: Microsoft YaHei UI)

The label path uses the installed Windows printer driver through `tools/printer-server/print-label.ps1`, so it does not depend on a specific TSPL/ZPL command language. The label printer/driver should have a usable 70x30mm stock configured; the script also requests a 70x30mm custom paper size for each label job. Food labels use a bilingual two-column layout: English is printed in the wider left column and product names are measured against the real font width, wrapped at word boundaries to at most two lines, then reduced from 9pt down to 7.5pt only when two lines still do not fit; ellipsis remains the final fallback at the minimum size. Chinese is printed in the right column; localized menu options follow the same column language and free-form special instructions are preserved verbatim in both columns.

STORE_ID (optional consistency check only; store authorization comes from the authenticated POS device)

For first-time cloud auto-print enrollment, create a dedicated POS device for the printer agent in Admin (do not reuse the browser POS device). Copy its one-time enrollment code. If `printer-server.js` is already running from Windows startup, stop that running instance first so port 19191 is free. Then open Windows Command Prompt (`cmd.exe`) in `tools/printer-server` and run one manual enrollment start:

```bat
set "POS_DEVICE_ENROLLMENT_CODE=<one-time-enrollment-code>"
node printer-server.js
```

If the normal startup environment does not already provide `API_URL`, set it in the same CMD window before starting:

```bat
set "API_URL=https://<your-sanq-api-origin>"
```

The agent exchanges the enrollment code through the existing POS device claim endpoint, stores the resulting `posDeviceId` and `posDeviceKey` in `%USERPROFILE%\.sanq-printer-device.json`, and uses that local credential file for all subsequent Socket.IO reconnects. A successful first enrollment logs the device id and credential-file path, but never the device key. After the first successful claim, close that CMD window (which also discards the temporary enrollment-code environment variable) and restart the normal auto-start printer-server process. Future Windows boots do not require the enrollment code.

Alternatively, a managed installation may provide `POS_DEVICE_ID` and `POS_DEVICE_KEY` together. Do not place the device key in browser JavaScript, URLs, or logs. `POS_DEVICE_CREDENTIALS_FILE` may override the default local credential file path.

POS_PRINTER_PORT (default: 19191)

Security note:

This service is intended for local / LAN usage only.

Do not expose port 19191 to the public Internet.
