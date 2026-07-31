---
name: connected-google-sheet
description: >-
  Always resolve and use the Google Spreadsheet currently connected to this
  project (GOOGLE_SPREADSHEET_ID in .env). Use before any Google Sheets MCP
  read/write, sheet-driven QA, Unit Test, or Playwright work — never use a
  previously connected MCP default or a hardcoded spreadsheet ID from docs.
---

# Connected Google Sheet (project source of truth)

## Non-negotiable

**Always search / read / write the spreadsheet that is currently connected to this repo.**

Do **not** use:

- A previously connected Google Sheets MCP default spreadsheet
- Hardcoded IDs from skills, plans, old chats, or docs
- `~/.cursor/google-sheet-mcp` when the host runs Sheets MCP from project `node_modules`
- Memory of a sheet ID from an earlier conversation unless it still matches `.env`

## Resolve the connected sheet (do this first)

Before any `sheets_*` MCP call or sheet-driven TC mapping:

1. Read **`GOOGLE_SPREADSHEET_ID`** from the project `.env`.
2. Optionally confirm with `sheets_get_sheet` / `sheets_list_tabs` using that ID.
3. Pass the ID **explicitly** on every MCP call:

```text
spreadsheet: <GOOGLE_SPREADSHEET_ID from .env>
```

Example: `sheets_read_range` with `spreadsheet` + `range` like `Projects!A1:N200`.

## Project MCP (local package)

Prefer a host **`.cursor/mcp.json`** that runs Google Sheets MCP from the project:

| Setting | Value |
|---------|--------|
| Server | `${workspaceFolder}/node_modules/google-sheet-mcp/src/server/server.mjs` |
| Sheet ID | from `${workspaceFolder}/.env` → `GOOGLE_SPREADSHEET_ID` (`envFile`) |
| Credentials | `${workspaceFolder}/credentials/credentials.json` |

Requirements: `npm i -D google-sheet-mcp` (or equivalent), `.env` + `credentials/credentials.json` present. Works on Windows and Mac — no home-folder MCP install required for the host project.

Still pass `spreadsheet` explicitly on tool calls when possible.

Reload MCP / restart Cursor after changing `.cursor/mcp.json`.

## Why this matters

The e2e-runner and `@6sense/sheet-e2e` use `.env` → `GOOGLE_SPREADSHEET_ID`. MCP must use the same sheet or Category / TC mapping will be wrong (e.g. draft vs non-draft).

## Checklist

- [ ] Read `.env` → `GOOGLE_SPREADSHEET_ID` before sheet access
- [ ] Pass `spreadsheet: <that id>` on every Sheets MCP tool call
- [ ] Prefer project `.cursor/mcp.json` (local `node_modules`) over `~/.cursor/google-sheet-mcp`
- [ ] Do not fall back to skill/doc hardcoded spreadsheet IDs
- [ ] If `.env` is missing the ID, ask the user — do not invent or reuse an old ID
