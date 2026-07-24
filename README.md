# @6sense/sheet-e2e

Reusable Playwright **e2e runner** for Next.js apps: UI page, API routes, Google Sheet sync, and CLI.

## Install (from Git)

```bash
npm i -D git+https://github.com/hasib6sense/sheet-e2e.git#v0.1.6
npm i -D googleapis @playwright/test   # also done by init unless --no-install
npx sheet-e2e init
npx sheet-e2e doctor
```

Pin a tag (`#v0.1.6`) rather than `#main` so upgrades are intentional.

### What `init` wires automatically (full, default)

| Area | Action |
|------|--------|
| Runner | `/e2e-runner` page + `/api/e2e/*` routes + `e2e/tab-suites.json` |
| Scripts | `test:e2e`, `test:e2e:all`, `test:e2e:tab`, `test:e2e:doctor` |
| Peers | `npm i -D googleapis @playwright/test` (skip with `--no-install`) |
| Playwright | `playwright.config.ts` (setup / chromium / chromium-unauth + JSON reporter), `auth.setup.ts`, example spec |
| Next | Adds `transpilePackages: ["@6sense/sheet-e2e"]` when possible |
| Tailwind | Adds `@source` (v4) or `content` entry (v3) for the package |
| Env | Creates/merges `.env` keys from template |
| Git | Appends `.gitignore` entries (auth, results, credentials) |
| Skill | Copies `.cursor/skills/sheet-playwright-e2e/` |
| Gate | Writes `e2e-gate.middleware.ts` (merge into your middleware) |

Flags: `--minimal` (runner shell only), `--force`, `--no-install`, `--browsers`.

### Still manual (secrets / product)

1. Set `GOOGLE_SPREADSHEET_ID` in `.env`
2. Place service-account JSON (`credentials/credentials.json`)
3. Share the spreadsheet with that account as **Editor**
4. Tweak `auth.setup.ts` selectors for your sign-in page
5. Map real tabs → specs in `e2e/tab-suites.json`
6. Write real Playwright specs (Cursor skill / later scaffold) — **not** part of init

## Host files (after init)

| Path | Role |
|------|------|
| `e2e/tab-suites.json` | Sheet tab → Playwright specs / project / workers |
| `e2e/env.example` | Env template |
| `playwright.config.ts` | Projects + JSON reporter for sheet sync |
| `playwright-tests/auth.setup.ts` | Logged-in `storageState` |
| `app/e2e-runner/page.tsx` | Thin re-export of `E2eRunnerPage` |
| `app/api/e2e/*/route.ts` | Thin re-exports from `@6sense/sheet-e2e/next/handlers` |

Import UI from `@6sense/sheet-e2e/next` and API handlers from `@6sense/sheet-e2e/next/handlers` (do not mix — handlers pull in `googleapis`).

## Env

```
GOOGLE_SPREADSHEET_ID=...
GOOGLE_APPLICATION_CREDENTIALS=credentials/credentials.json
TEST_SIGNIN_EMAIL=...
TEST_SIGNIN_PASSWORD=...
# Optional
E2E_RESULTS_FILE=playwright-results.json
E2E_SKIP_TABS=Summery
E2E_TAB_SUITES_PATH=e2e/tab-suites.json
E2E_NO_SHEET_SYNC=1
E2E_RUNNER_ENABLED=1
```

## Cursor skill

- Shipped: `skills/sheet-playwright-e2e/SKILL.md` (copied into the host on init)
- Personal: `~/.cursor/skills/sheet-playwright-e2e/`

## Sheet contract

Required columns (aliases supported):

- Test Case ID
- Category (rows with `API` are skipped on sync / runner case list)
- UI Status → Passed / Failed
- Playwright → Implemented
- Comment → failure reason (cleared on pass)

## CLI

```bash
sheet-e2e init [--force] [--minimal] [--no-install] [--browsers]
sheet-e2e doctor
sheet-e2e run "Sign In"
sheet-e2e select --all
sheet-e2e sync --tabs "Holiday,Projects"
```

## Develop / release

```bash
# bump version in package.json, then:
git tag v0.1.6
git push origin main --tags
```

## Security

Protect `/e2e-runner` and `/api/e2e/*` in production (use the scaffolded gate + `E2E_RUNNER_ENABLED`). The package does not enforce a gate by itself until you merge middleware.
