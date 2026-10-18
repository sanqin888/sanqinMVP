# sanqinMVP

> Runtime 更新当前路线：[R0 冻结设计](docs/architecture/Runtime更新-R0冻结设计.md)。D1–D5 已批准，R0 文档完成；下一批 R1 真实执行闭包，随后 R2–R5 补维护、Kit、安装/恢复与同候选验收。**C5-G2 NO-GO**，S2 指后续 daily 扩充暂缓，不是停止现役备份。

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

Use the pinned pnpm workspace and committed dependency state:

```bash
pnpm install --frozen-lockfile --prefer-offline
```

Run API/Web through their workspace scripts in a development environment with the required configuration. MCP-workspace does not expose lint/build/test execution; follow [AGENTS.md](AGENTS.md).

## Documentation

Start with the [project document index](docs/文档索引.md). It links the current architecture, product queue, payment/Uber contracts, operations and continuous worklog. Historical phase records are evidence for their stated dates and scopes.

## Production Publishing and Runtime

The VM runs immutable GHCR API/Web images published for a full `main` commit SHA after authoritative CI. API and Uber worker share the same API image. Paired-image publication does not deploy, apply migrations or authorize a production change. Production must not build application images locally.

Production paths were cut over to `/opt/sanq/runtime`, `/srv/sanq/uploads` and `/srv/sanq/backups`; the Compose project and existing DB volume remain `sanq-app` and `sanq-app_pgdata`. An installed Runtime has already been recorded. Its source SHA is distinct from the running application image SHA, and newer `dev` controller fixes are not automatically installed. Verify the exact live versions before operating.

The environment must define `GOOGLE_MAPS_BROWSER_KEY`, `CLOVER_WEB_PUBLIC_TOKEN`, `CLOVER_WEB_SDK_URL` and the full application `SANQ_IMAGE_SHA`. `GOOGLE_MAPS_BROWSER_KEY` remains distinct from server-side `GOOGLE_MAPS_API_KEY`; `CLOVER_MERCHANT_ID` stays server-side. Web browser configuration comes from the API at runtime; do not pass production `NEXT_PUBLIC_*` build args into the environment-neutral Web image.

Use [GHCR 发布与 Runtime 状态](docs/runbooks/GHCR发布与Runtime状态.md) for the existing publication, migration, readiness and manual recovery contracts, the distinction between installed Runtime and source, and links to detailed evidence. It replaces obsolete pre-C4 command/context guidance; it does not authorize production execution. New Runtime installation, pending migrations, rollback and eventual legacy-checkout deletion retain their separate gates. Do not prune previous images, data, backups or the old checkout during documentation cleanup.

Docker/image-workflow and dependency-manifest changes targeting `dev` also run independent `image-build-checks`: API/Web image builds and runtime packaging/smoke validation, without publication or deployment. See [CI and image-build performance](docs/architecture/postmod-ci-performance.md).

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
