# @6sense/sheet-e2e

Reusable Playwright + Unit Test **runner** for Next.js apps: UI page, API routes, Google Sheet sync, Cursor skills, Sheets MCP launcher, and CLI.

**Start here (plain language):** [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md) — process, Dev vs QA, and why this package exists.

---

## 1. Installation

```bash
# Latest tip (recommended while iterating)
npm i -D github:hasib6sense/sheet-e2e#main

# Or pin a release tag when you publish one:
# npm i -D github:hasib6sense/sheet-e2e#v0.1.57

# Full host wiring (recommended for new or reset projects)
npx sheet-e2e init

# Optional: install browser binaries
npx sheet-e2e init --browsers
# or: npx playwright install

# Verify the host (also prints the Runner URL)
npx sheet-e2e doctor
```

**Alternative install URLs**

```bash
npm i -D git+https://github.com/hasib6sense/sheet-e2e.git#main
# SSH:
# npm i -D git+ssh://git@github.com:hasib6sense/sheet-e2e.git#main
```

**Init flags**

| Flag | Meaning |
|------|---------|
| *(default)* | Full wiring: runner + Playwright + Next/Tailwind + env + gitignore + Cursor skills + MCP config + `e2e/README.md` |
| `--minimal` | Runner shell only (page, APIs, `tab-suites.json`, scripts) — still prints Runner URL |
| `--force` | Overwrite existing scaffold files (careful on existing apps; also overwrites `.cursor/mcp.json`) |
| `--no-install` | Do not auto `npm i -D googleapis @playwright/test` |
| `--browsers` | Also run `npx playwright install` |

**Existing project tip:** If you already have `playwright.config.ts` / `auth.setup.ts`, run `init` **without** `--force` so those files are skipped and only runner routes / `tab-suites` / patches are added.

After `init` / `doctor`, look for the **E2E Runner UI** banner — default URL is `http://localhost:3000/e2e-runner` (from `PLAYWRIGHT_BASE_URL`). Also written to `e2e/README.md`.

---

## 2. What `init` does automatically

| Area | Action |
|------|--------|
| Runner | `/e2e-runner` page + `/api/e2e/*` + `e2e/tab-suites.json` |
| Scripts | `test:e2e`, `test:e2e:all`, `test:e2e:tab`, `test:e2e:doctor` |
| Peers | Installs `googleapis` + `@playwright/test` unless `--no-install` |
| Playwright | `playwright.config.ts` (setup / chromium / chromium-unauth + JSON reporter), `auth.setup.ts`, example spec |
| Next | Adds `transpilePackages: ["@6sense/sheet-e2e"]` when possible |
| Tailwind | Adds `@source` in `globals.css` **and** `content` in `tailwind.config.*` when present |
| Env | Creates/merges `.env` keys from template |
| Git | Appends `.gitignore` (auth, results, credentials) |
| Skills | Copies `.cursor/skills/connected-google-sheet/`, `sheet-driven-qa/`, `sheet-playwright-e2e/`, `sheet-unit-test/` |
| MCP | Writes `.cursor/mcp.json` → `bin/google-sheets-mcp.mjs` (package bundles `google-sheet-mcp`; skipped if file exists unless `--force`) |
| Docs | Writes `e2e/README.md` with Runner URL and prints access banner at end of init |
| Gate | Writes `e2e-gate.middleware.ts` (merge into your middleware) |

`google-sheet-mcp` is a **dependency of this package** — you do **not** need a separate `npm i google-sheet-mcp`. Reload Cursor MCP (or restart Cursor) after init so Sheets tools appear.

Peers `googleapis` / `@playwright/test` are still installed into the **host** unless you used `--no-install`.

---

## 3. After installation (manual — required)

Do these **after** `init` / `doctor` before using the runner:

1. **Spreadsheet ID** — set in `.env`:
   ```
   GOOGLE_SPREADSHEET_ID=your-sheet-id
   GOOGLE_APPLICATION_CREDENTIALS=credentials/credentials.json
   ```
2. **Credentials** — place the Google service-account JSON at that path (never commit it).
3. **Share sheet** — invite the service account email as **Editor**.
4. **Cursor MCP** — reload MCP / restart Cursor so `.cursor/mcp.json` loads the package Sheets launcher. Agents must pass `spreadsheet: <GOOGLE_SPREADSHEET_ID>` (see `connected-google-sheet` skill).
5. **Auth setup** — edit `playwright-tests/auth.setup.ts` selectors/URL to match your sign-in page; set `TEST_SIGNIN_EMAIL` / `TEST_SIGNIN_PASSWORD` if needed.
6. **Tab map** — edit `e2e/tab-suites.json` using **exact Google Sheet tab titles** (e.g. `Apply_Leave`, `Forget_Password`). Map `specs` (Playwright) and optional `unitSpecs` (Jest / Category=`UI`). Wrong tab names show empty Status / Comment (local-only fallback). The runner also fuzzy-matches spaces↔underscores and shows a warning banner.
7. **Specs** — write Playwright (`Category=Playwright`) and/or Jest unit tests (`Category=UI`). Use the Cursor skills; full sheet→spec codegen is separate.
8. **Optional gate** — merge `e2e-gate.middleware.ts` into `middleware.ts` so `/e2e-runner` is off in production unless `E2E_RUNNER_ENABLED=1`.
9. **Run**
   ```bash
   npm run dev          # app on baseURL (default localhost:3000)
   # open the Runner URL printed by init (default http://localhost:3000/e2e-runner)
   # see e2e/README.md
   npm run test:e2e     # or test:e2e:all / test:e2e:tab "Tab Name"
   npx sheet-e2e doctor # also prints the Runner URL + MCP checks
   ```

### Checklist

```
- [ ] npm i -D github:hasib6sense/sheet-e2e#main && npx sheet-e2e init && npx sheet-e2e doctor
- [ ] GOOGLE_SPREADSHEET_ID + credentials file
- [ ] Sheet shared with service account (Editor)
- [ ] Cursor MCP reloaded (Sheets tools via package launcher)
- [ ] auth.setup.ts matches your login UI
- [ ] e2e/tab-suites.json mapped (specs + unitSpecs as needed)
- [ ] At least one Playwright and/or Unit Test suite
- [ ] Runner URL opens (dev) — see e2e/README.md
```

---

## 4. Uninstall (remove from a project)

Proper cleanup (not only `npm uninstall`):

```bash
npx sheet-e2e uninstall -y

# Also remove e2e/ folder + example.spec.ts
npx sheet-e2e uninstall -y --purge
```

| Flag | Meaning |
|------|---------|
| `-y` / `--yes` | Skip confirmation |
| `--purge` | Also delete `e2e/` and `playwright-tests/example.spec.ts` |
| `--keep-dep` | Strip files/config only; leave `@6sense/sheet-e2e` in package.json |

**Removes:**

- `/e2e-runner`, `/api/e2e/*`, `e2e-gate.middleware.ts`
- `e2e/tab-suites.json`, `e2e/env.example`, `e2e/README.md` (whole `e2e/` with `--purge`)
- Next `transpilePackages` entry, Tailwind `@source` + `content` entry
- `test:e2e*` scripts that call `sheet-e2e`
- Copied Cursor skills (`connected-google-sheet`, `sheet-driven-qa`, `sheet-playwright-e2e`, `sheet-unit-test`)
- Sheets MCP entry from `.cursor/mcp.json` (deletes the file if it only contained `google-sheets`)
- npm package `@6sense/sheet-e2e` (unless `--keep-dep`)

**Keeps:** `playwright.config.ts`, real `playwright-tests/*`, `auth.setup.ts`, Jest unit tests, `.env` secrets (delete those yourself if desired), other MCP servers in `.cursor/mcp.json` if present.

If the CLI is already gone:

```bash
npm uninstall @6sense/sheet-e2e
# then manually delete e2e-runner / api/e2e, .cursor MCP/skills, and reverse Next/Tailwind patches
```

---

## Host files (after init)

| Path | Role |
|------|------|
| `e2e/tab-suites.json` | Sheet tab → `specs` / `unitSpecs` / project / workers |
| `e2e/env.example` | Env template |
| `e2e/README.md` | Runner URL + quick open instructions |
| `.cursor/mcp.json` | Cursor Google Sheets MCP → package launcher |
| `.cursor/skills/*` | Sheet-driven Cursor skills (copied from package) |
| `playwright.config.ts` | Projects + JSON reporter for sheet sync |
| `playwright-tests/auth.setup.ts` | Logged-in `storageState` |
| `app` or `src/app` `/e2e-runner/page.tsx` | Re-export of `E2eRunnerPage` |
| `…/api/e2e/*/route.ts` | Re-exports from `@6sense/sheet-e2e/next/handlers` |

Import UI from `@6sense/sheet-e2e/next` and handlers from `@6sense/sheet-e2e/next/handlers` (do not mix — handlers pull in `googleapis`).

## Env

```
GOOGLE_SPREADSHEET_ID=...
GOOGLE_APPLICATION_CREDENTIALS=credentials/credentials.json
TEST_SIGNIN_EMAIL=...
TEST_SIGNIN_PASSWORD=...
# Optional
E2E_RESULTS_FILE=playwright-results.json
E2E_UNIT_RESULTS_FILE=jest-results.json
E2E_SKIP_TABS=Summery
E2E_TAB_SUITES_PATH=e2e/tab-suites.json
E2E_NO_SHEET_SYNC=1
E2E_RUNNER_ENABLED=1
PLAYWRIGHT_BASE_URL=http://localhost:3000
# → Runner UI: $PLAYWRIGHT_BASE_URL/e2e-runner
```

## Sheet contract

Required columns (aliases supported):

- Test Case ID
- Category (`API` rows skipped; `UI` = Unit Test / Jest engine; `Playwright` or blank = browser E2E)
- UI Status → Passed / Failed (Unit Test engine; styled badge)
- Playwright → Passed / Failed (Playwright engine; styled badge)
- Comment → failure reason for the active engine (cleared on pass)

## Cursor skills & Sheets MCP

Copied on `sheet-e2e init`:

- `skills/connected-google-sheet/` — always use `.env` → `GOOGLE_SPREADSHEET_ID` for Sheets MCP
- `skills/sheet-driven-qa/` — sheet columns → Playwright / Unit Test mapping
- `skills/sheet-playwright-e2e/` — Category=`Playwright` → browser E2E
- `skills/sheet-unit-test/` — Category=`UI` → Jest unit/component tests

Sheets MCP is provided by this package:

- Dependency: `google-sheet-mcp`
- Launcher: `bin/google-sheets-mcp.mjs` (bin name `sheet-e2e-google-sheets-mcp`)
- Host config: `.cursor/mcp.json` (written by `init`)

Prefer the project MCP config over a home-folder `~/.cursor/google-sheet-mcp` install.

## CLI

```bash
sheet-e2e init [--force] [--minimal] [--no-install] [--browsers]
sheet-e2e uninstall [-y] [--purge] [--keep-dep]
sheet-e2e doctor
sheet-e2e run "Sign In"
sheet-e2e run "Weekend" --engine unit-test
sheet-e2e select --all
sheet-e2e select --engine unit-test
sheet-e2e sync --tabs "Holiday,Projects"
sheet-e2e sync --tabs "Weekend" --engine unit-test
```

## Develop / release

```bash
# bump version in package.json, then:
git tag v0.1.57
git push origin main --tags
```

## Security

Protect `/e2e-runner` and `/api/e2e/*` in production (scaffold gate + `E2E_RUNNER_ENABLED`). The package does not enforce a gate until you merge middleware.
