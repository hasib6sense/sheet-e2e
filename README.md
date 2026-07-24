# @6sense/sheet-e2e

Reusable Playwright **e2e runner** for Next.js apps: UI page, API routes, Google Sheet sync, and CLI.

## Install (from Git)

```bash
npm i -D git+https://github.com/hasib6sense/sheet-e2e.git#v0.1.4
# or SSH:
# npm i -D git+ssh://git@github.com:hasib6sense/sheet-e2e.git#v0.1.4

npm i -D googleapis @playwright/test
npx sheet-e2e init
```

Pin a tag (`#v0.1.1`) rather than `#main` so upgrades are intentional.

Add to `next.config`:

```js
transpilePackages: ["@6sense/sheet-e2e"]
```

Scan package classes in Tailwind (required for the runner UI):

```ts
// tailwind.config.ts
content: [
  "./src/**/*.{js,ts,jsx,tsx,mdx}",
  "./node_modules/@6sense/sheet-e2e/src/**/*.{js,ts,jsx,tsx}",
],
```

Or in `globals.css` (Tailwind v4):

```css
@source "../../node_modules/@6sense/sheet-e2e/src";
```

## Host files (after init)

| Path | Role |
|------|------|
| `e2e/tab-suites.json` | Sheet tab → Playwright specs / project / workers |
| `e2e/env.example` | Env vars to copy into `.env` |
| `app/e2e-runner/page.tsx` | Thin re-export of `E2eRunnerPage` from `@6sense/sheet-e2e/next` |
| `app/api/e2e/*/route.ts` | Thin re-exports from `@6sense/sheet-e2e/next/handlers` |

Import UI from `@6sense/sheet-e2e/next` and API handlers from `@6sense/sheet-e2e/next/handlers` (do not mix — handlers pull in `googleapis`).

No root `sheet-e2e.config.json` is required.

## Env

```
GOOGLE_SPREADSHEET_ID=...
GOOGLE_APPLICATION_CREDENTIALS=credentials/credentials.json

# Optional
E2E_RESULTS_FILE=playwright-results.json
E2E_SKIP_TABS=Summery
E2E_TAB_SUITES_PATH=e2e/tab-suites.json
E2E_NO_SHEET_SYNC=1
```

Share the spreadsheet with the service account email as **Editor**.

## Playwright coupling

`playwright.config.ts` must emit JSON results at the path configured as `E2E_RESULTS_FILE` (default `playwright-results.json`):

```ts
reporter: [
  ["list"],
  ["json", { outputFile: "playwright-results.json" }],
],
```

`tab-suites.json` `project` values must match Playwright project names (e.g. `chromium`, `chromium-unauth`).

## Sheet contract

Required columns (aliases supported):

- Test Case ID
- Category (rows with `API` are skipped on sync)
- UI Status → Passed / Failed
- Playwright → Implemented
- Comment → failure reason (cleared on pass)

## CLI

```bash
sheet-e2e init [--force]
sheet-e2e run "Sign In"
sheet-e2e select --all
sheet-e2e sync --tabs "Holiday,Projects"
```

## Develop / release

```bash
# bump version in package.json, then:
git tag v0.1.1
git push origin main --tags
```

Consumers then bump their install URL to `#v0.1.1`.

## Security

Protect `/e2e-runner` and `/api/e2e/*` in production (auth / env gate). The package does not add an auth gate.
