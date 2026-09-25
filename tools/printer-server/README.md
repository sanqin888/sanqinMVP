# SanQ Windows printer agent

This directory is the independently deployed Windows printer boundary for SanQ POS.

## Runtime contract

- Production install path: `C:\pos-printer-server`
- Package manager: npm
- Reproducible install: `npm ci`
- Supported Node.js: `>=20.12.2`
- Observed store workstation runtime during A3 readiness: Node `v24.11.1`
- Entry point: `printer-server.js`
- Hidden startup wrapper: `start-printer-server.vbs`
- Logging/start wrapper: `start-printer-server.bat`

The BAT/VBS files are repository copies of the deployed workstation startup chain. The BAT file logs the runtime identity, Node/npm versions and directory contents before starting the agent.

## Fresh workstation install

1. Install a compatible Node.js runtime.
2. Copy this directory to `C:\pos-printer-server`.
3. Run `npm ci` inside `C:\pos-printer-server`.
4. Configure the required environment variables in the local `.env`.
5. Enroll the printer agent through the existing POS device enrollment flow, or restore authorized device credentials through the existing operational process.
6. Start `start-printer-server.vbs` (or the BAT file directly for visible diagnostics).

Do not commit `.env`, `.sanq-printer-device.json`, completed-job state, runtime logs, or other workstation credentials/state.

## CI boundary

GitHub Actions installs this package with `npm ci` and runs `npm test`. A3-A keeps the smoke test deliberately side-effect free: it syntax-checks `printer-server.js` and does not start the local health server, connect the POS WebSocket, enroll a device, or access Windows printers.

Rendering golden tests and transport/dedupe tests belong to later A3 slices.

## Static assets

`printer-server.js` optionally loads `assets/logo.png` for receipt logo output. The production logo asset is not yet repository-managed in A3-A; exact production receipt-asset reproducibility therefore remains a follow-up before rendering golden coverage is considered complete.
