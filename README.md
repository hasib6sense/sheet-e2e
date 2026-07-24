# @6sense/sheet-e2e

Reusable Playwright **e2e runner** for Next.js apps: UI page, API routes, Google Sheet sync, and CLI.

---

## 1. Installation

```bash
# Pin a release tag (prefer this over #main)
npm i -D github:hasib6sense/sheet-e2e#v0.1.6

# Full host wiring (recommended for new or reset projects)
npx sheet-e2e init

# Optional: install browser binaries
npx sheet-e2e init --browsers
# or: npx playwright install

# Verify the host
npx sheet-e2e doctor
```

**Alternative install URLs**

```bash
npm i -D git+https://github.com/hasib6sense/sheet-e2e.git#v0.1.6
# SSH:
# npm i -D git+ssh://git@github.com:hasib6sense/sheet-e2e.git#v0.1.6
```

**Init flags**

| Flag | Meaning |
|------|---------|
| *(default)* | Full wiring: runner + Playwright + Next/Tailwind + env + gitignore + skill |
| `--minimal` | Runner shell only (page, APIs, `tab-suites.json`, scripts) |
| `--force` | Overwrite existing scaffold files (careful on existing apps) |
| `--no-install` | Do not auto `npm i -D googleapis @playwright/test` |
| `--browsers` | Also run `npx playwright install` |

**Existing project tip:** If you already have `playwright.config.ts` / `auth.setup.ts`, run `init` **without** `--force` so those files are skipped and only runner routes / `tab-suites` / patches are added.

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
| Skill | Copies `.cursor/skills/sheet-playwright-e2e/` |
| Gate | Writes `e2e-gate.middleware.ts` (merge into your middleware) |

Peers are also listed in README historically as a manual `npm i -D googleapis @playwright/test` — only needed if you used `--no-install`.

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
4. **Auth setup** — edit `playwright-tests/auth.setup.ts` selectors/URL to match your sign-in page; set `TEST_SIGNIN_EMAIL` / `TEST_SIGNIN_PASSWORD` if needed.
5. **Tab map** — edit `e2e/tab-suites.json` (real sheet tab names → spec files + `project`: `chromium` or `chromium-unauth`).
6. **Specs** — write Playwright UI tests (non-`API` Category rows). Use the Cursor skill; full sheet→spec codegen is separate.
7. **Optional gate** — merge `e2e-gate.middleware.ts` into `middleware.ts` so `/e2e-runner` is off in production unless `E2E_RUNNER_ENABLED=1`.
8. **Run**
   ```bash
   npm run dev          # app on baseURL (default localhost:3000)
   # open http://localhost:3000/e2e-runner
   npm run test:e2e     # or test:e2e:all / test:e2e:tab "Tab Name"
   npx sheet-e2e doctor
   ```

### Checklist

```
- [ ] npm i -D …#v0.1.6 && npx sheet-e2e init && npx sheet-e2e doctor
- [ ] GOOGLE_SPREADSHEET_ID + credentials file
- [ ] Sheet shared with service account (Editor)
- [ ] auth.setup.ts matches your login UI
- [ ] e2e/tab-suites.json mapped
- [ ] At least one non-API Playwright suite
- [ ] /e2e-runner opens (dev)
```

---

## Host files (after init)

| Path | Role |
|------|------|
| `e2e/tab-suites.json` | Sheet tab → specs / project / workers |
| `e2e/env.example` | Env template |
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
E2E_SKIP_TABS=Summery
E2E_TAB_SUITES_PATH=e2e/tab-suites.json
E2E_NO_SHEET_SYNC=1
E2E_RUNNER_ENABLED=1
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

## Sheet contract

Required columns (aliases supported):

- Test Case ID
- Category (`API` rows skipped on sync / runner case list)
- UI Status → Passed / Failed
- Playwright → Implemented
- Comment → failure reason (cleared on pass)

## Cursor skill

- Shipped in package: `skills/sheet-playwright-e2e/SKILL.md` (copied on init)
- Personal: `~/.cursor/skills/sheet-playwright-e2e/`

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
git tag v0.1.8
git push origin main --tags
```

## Security

Protect `/e2e-runner` and `/api/e2e/*` in production (scaffold gate + `E2E_RUNNER_ENABLED`). The package does not enforce a gate until you merge middleware.
