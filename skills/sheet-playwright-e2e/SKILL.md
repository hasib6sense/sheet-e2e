---
name: sheet-playwright-e2e
description: >-
  Generate sheet-driven Playwright UI E2E suites with @6sense/sheet-e2e: map
  Google Sheet TC rows to specs, omit Category API, wire auth.setup for logged-in
  tabs, and sync UI Status. Use when bootstrapping Playwright in a new Next.js
  project, generating or fixing e2e from a spreadsheet, tab-suites.json,
  auth.setup, or the e2e-runner.
---

# Sheet-Driven Playwright E2E (generic)

Project-agnostic rules for Google Sheet → Playwright UI suites using `@6sense/sheet-e2e`.
Override paths, base URL, and spreadsheet ID from the host repo / `.env` — do not hardcode product names.

**Connected sheet:** Before reading any TC rows, follow `.cursor/skills/connected-google-sheet/SKILL.md`. Use `GOOGLE_SPREADSHEET_ID` from `.env` on every Sheets MCP call — never a previously connected MCP default.

## When this skill applies

- New project: install runner + generate first suites from a sheet tab
- Any project: map sheet TCs to Playwright, fix flakes, wire auth, update `tab-suites.json`

## Bootstrap (new project)

### Installation

```bash
npm i -D github:hasib6sense/sheet-e2e#main
npx sheet-e2e init              # full host wiring (default)
# npx sheet-e2e init --browsers # also install Playwright browsers
npx sheet-e2e doctor
```

Do **not** use `--force` if the host already has `playwright.config.ts` / `auth.setup.ts` you want to keep — init skips existing files.

### After installation (manual)

1. Set `GOOGLE_SPREADSHEET_ID` + `GOOGLE_APPLICATION_CREDENTIALS` in `.env`
2. Place service-account JSON at `credentials/credentials.json`; share the sheet as **Editor**
3. Sheets MCP: `init` writes `.cursor/mcp.json` via `@6sense/sheet-e2e` launcher (see `connected-google-sheet` skill); reload Cursor MCP
4. Tweak `playwright-tests/auth.setup.ts` for your sign-in UI
5. Map tabs in `e2e/tab-suites.json` (`chromium` vs `chromium-unauth`)
6. Write non-API Playwright specs (this skill)
7. Open `/e2e-runner` or `npm run test:e2e`

### Uninstall

```bash
npx sheet-e2e uninstall -y
# or: npx sheet-e2e uninstall -y --purge
```

Removes runner routes/config patches/scripts/package; keeps Playwright specs and `.env`.

`init` already wires: runner page/APIs, scripts, peers, Playwright scaffold, Next `transpilePackages`, Tailwind scan, `.env` keys, `.gitignore`, Cursor skills (`connected-google-sheet`, `sheet-driven-qa`, `sheet-playwright-e2e`, `sheet-unit-test`), optional e2e gate template.

Flags: `--minimal`, `--force`, `--no-install`, `--browsers`.

Host layout after init:

| Item | Notes |
|------|--------|
| `e2e/tab-suites.json` | Sheet tab → `specs` (Playwright), optional `unitSpecs` (Jest), `project`, `workers` |
| `.env` | `GOOGLE_SPREADSHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, optional test creds |
| `playwright.config.ts` | `setup` / `chromium` / `chromium-unauth` + JSON reporter |
| `playwright-tests/auth.setup.ts` | Logged-in storage state |
| `app/e2e-runner` + `app/api/e2e/*` | Thin re-exports from the package |

## Category filter (non-negotiable)

| Sheet `Category` | Playwright |
|------------------|------------|
| **`Playwright`** or blank/legacy | Implement UI assertions |
| **`UI`** | **Omit** — Unit Test engine; use `sheet-unit-test` skill |
| **`API`** | **Omit** from Playwright generation — belongs outside this engine |

- `Playwright` (or blank) rows → `playwright-tests/` specs only.
- `UI` rows → Jest via `unitSpecs` + `sheet-unit-test` skill — **never** add to Playwright specs.
- `API` rows → hidden from the runner entirely.
- For rows in the Playwright scope, discard a TC only when the sheet explicitly marks it **`Not Implemented`**. Do not omit rows just because they are flaky, failing, protected, or missing nearby helpers.
- Do not port API Expected Results (HTTP status / JSON) as the main Playwright assertion.
- Cover **every** `Playwright`-category TC on the tab (do not stop mid-range).
- Keep sheet TC IDs aligned with `test("TC_XXX: …")` — an off-by-one ID collides and confuses the runner.

## Pass / fail only

- Never `test.skip` / soft-pass when UI, data, or permissions are missing.
- Fail with `FAIL: <reason>` suitable for the sheet **Comment** column.
- App changes for E2E: **locators only** (`aria-label`, rare `data-testid`). Do not change product behavior to force green.

## Sheet columns → spec

Read the full tab before writing. Use sheet values; do not invent nicer emails/OTPs/passwords.

| Column | Spec usage |
|--------|------------|
| Test Case ID + Test Case | `test("TC_001: …")` (keep sheet hyphen/underscore style) |
| Test Scenario | Optional `test.describe` grouping |
| Pre-Conditions | `beforeEach` / helpers / mocks / `sessionStorage` |
| Test Steps | Action order |
| Test Data | Exact fills; `N/A` = no payload; honor quoted spaces |
| Endpoint | `page.goto` + URL asserts. If the cell is multi-line like `Protected` then `/leave-management/holidays`, use the route as the real endpoint and treat `Protected` as an auth hint. |
| Expected Result | UI text, visibility, redirects |
| Playwright / UI Status / Comment | Sync after run — never invent Passed |

Comment in the spec which tab + TC range is covered / which API IDs are omitted.

## Auth setup (logged-in suites)

| Project | Use for | Auth |
|---------|---------|------|
| `chromium-unauth` | Sign-in / register / forgot-password (must start logged out) | Empty `storageState` |
| `chromium` | Any authenticated feature | Depends on `setup` → `auth.setup.ts` → `playwright/.auth/user.json` |

When generating a suite:

1. From Pre-Conditions / Endpoint, decide logged-in vs logged-out.
2. Logged-in → `tab-suites.json` `"project": "chromium"`; create/reuse `playwright-tests/auth.setup.ts` (login once, write storage state). Credentials: `TEST_SIGNIN_EMAIL` / `TEST_SIGNIN_PASSWORD` (+ sheet defaults if the repo already uses them).
3. Do **not** invent a second login-setup file; do not put authenticated tabs on `chromium-unauth`.
4. Specs may re-login only as a **fallback** if the page lands on Sign In (expired storage).
5. Logged-out auth UI → `"project": "chromium-unauth"`; never depend on `auth.setup`.
6. If the `Endpoint` cell starts with `Protected` and the next line is a route, the route is the URL and the suite should be treated as authenticated by default.

```
- [ ] auth.setup.ts writes storage state for chromium project
- [ ] Authenticated tab → project "chromium"; unauth → "chromium-unauth"
- [ ] Category Playwright/blank only; IDs match sheet (UI → sheet-unit-test)
- [ ] tab-suites.json entry added
```

## Spec conventions

- Specs under `playwright-tests/` (or path in `tab-suites.json`).
- Import from `@playwright/test` only; relative `baseURL` paths.
- One non-API TC → one `test("TC_…")` unless the sheet groups setup.
- Locators (prefer): role/name → placeholder/label → text → justified `data-testid`.
- Avoid presentational CSS (`div.bg-blue-50`, Tailwind stacks). If needed, add `aria-label` / one `data-testid` in the app.
- Assert with `expect(…).toBeVisible()` / `toHaveURL()` — no fixed `waitForTimeout`.
- Email forms: set `novalidate` so tests hit app validation, not browser native.
- Prefer lower `workers` on slower hosts (e.g. Windows) if timeouts flake; Mac may run higher parallelism fine.

## After runs

Sync (package / CLI) updates non-API rows:

- **Playwright runs** → `Playwright` = Passed / Failed (`skipped` / `timedOut` → Failed)
- **Unit Test runs** → `UI Status` = Passed / Failed
- **Comment** → failure reason (cleared on pass); **API rows never updated**
- Status cells are formatted as centered bold badges (green Passed, red Failed, gray Not Implemented)

Skip sync: `E2E_NO_SHEET_SYNC=1`. Do not mark Passed without a green run for that TC.

## Generation checklist

```
- [ ] Read sheet tab (headers + all TC rows)
- [ ] Keep Category === Playwright (or blank); omit UI and API
- [ ] Auth: chromium vs chromium-unauth + auth.setup if needed
- [ ] Wire e2e/tab-suites.json
- [ ] Use sheet Test Data / Expected Result (UI)
- [ ] Run Chromium for that spec; fix locators or leave Failed + Comment
```

## Copy into a repo (optional)

`sheet-e2e init` copies package skills under `.cursor/skills/` (`connected-google-sheet`, `sheet-driven-qa`, `sheet-playwright-e2e`, `sheet-unit-test`).
Personal copies may also live under `~/.cursor/skills/` (all Cursor projects).
