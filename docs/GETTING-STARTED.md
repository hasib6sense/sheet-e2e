# Getting started with `@6sense/sheet-e2e`

Full setup guide: connect a Google Sheet with a service account, install the package, configure env + tab suites, and run the E2E Runner.

**Assumes:** the spreadsheet already exists. Host app is **Next.js**.

Related docs:

- [HOW-IT-WORKS.md](./HOW-IT-WORKS.md) — Dev vs QA process overview
- Package [README](../README.md) — install flags, uninstall, API surface

---

## 0. Prerequisites

- Node.js + npm
- A Next.js app you can run with `npm run dev`
- A Google Sheet with these columns (aliases OK):

| Required | Notes |
|----------|--------|
| Test Case ID | e.g. `TC_001` |
| Category | `Playwright` / `UI` / `API` |
| UI Status | Unit Test engine results |
| Playwright | Playwright engine results |
| Comment | failure text (cleared on pass) |

- One sheet **tab per feature** (exact titles matter later, e.g. `Sign In`, `Leave_Management`)

---

## 1. Google Cloud service account + sheet access

1. In [Google Cloud Console](https://console.cloud.google.com/), open (or create) a project.
2. Enable **Google Sheets API**.
3. Create a **Service account** → create a **JSON key**.
4. Download the JSON key.
5. In your repo:

   ```bash
   mkdir -p credentials
   # save the key as:
   credentials/credentials.json
   ```

   Do **not** commit this file (`init` adds it to `.gitignore`).

6. Open the JSON and copy `client_email` (looks like `…@….iam.gserviceaccount.com`).
7. In Google Sheets: **Share** the spreadsheet with that email as **Editor**.
8. Copy the spreadsheet ID from the URL:

   ```
   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
   ```

---

## 2. Install the package

From the Next.js project root:

```bash
npm i -D github:hasib6sense/sheet-e2e#main
```

Alternative URLs:

```bash
npm i -D git+https://github.com/hasib6sense/sheet-e2e.git#main
# SSH:
# npm i -D git+ssh://git@github.com:hasib6sense/sheet-e2e.git#main
```

---

## 3. Init (wires the host)

**New / greenfield project:**

```bash
npx sheet-e2e init --browsers
```

**Existing project** (keep your Playwright config / auth):

```bash
npx sheet-e2e init
# do NOT use --force unless you intend to overwrite scaffolds
```

Verify:

```bash
npx sheet-e2e doctor
```

### What `init` adds

| Area | Action |
|------|--------|
| Runner | `/e2e-runner` page + `/api/e2e/*` |
| Config | `e2e/tab-suites.json`, `e2e/README.md`, `e2e/env.example` |
| Scripts | `test:e2e`, `test:e2e:all`, `test:e2e:tab`, `test:e2e:doctor` |
| Peers | `googleapis` + `@playwright/test` (unless `--no-install`) |
| Playwright | `playwright.config.ts`, `auth.setup.ts`, example specs (if missing) |
| Next | `transpilePackages: ["@6sense/sheet-e2e"]` when possible |
| Tailwind | package scan via `@source` / `content` when present |
| Env | creates/merges the four minimal `.env` keys |
| Git | credentials, auth state, results in `.gitignore` |
| Cursor | `.cursor/mcp.json` + skills under `.cursor/skills/` |
| Gate | `e2e-gate.middleware.ts` template (optional merge into middleware) |

### Init flags

| Flag | Meaning |
|------|---------|
| *(default)* | Full host wiring |
| `--minimal` | Runner shell only |
| `--force` | Overwrite existing scaffold files |
| `--no-install` | Skip peer install |
| `--browsers` | Also run `npx playwright install` |

---

## 4. Configure `.env` (only these four)

`init` creates or merges them. Fill in the spreadsheet ID:

```env
GOOGLE_SPREADSHEET_ID=<paste-your-spreadsheet-id>
GOOGLE_APPLICATION_CREDENTIALS=credentials/credentials.json
E2E_RESULTS_FILE=playwright-results.json
E2E_TAB_SUITES_PATH=e2e/tab-suites.json
```

That’s enough for sheet sync, Sheets MCP, and the runner.

Restart `npm run dev` after changing `.env`.

---

## 5. Reload Cursor MCP (agents → same sheet)

1. Confirm `.cursor/mcp.json` points at the package launcher (written by `init`).
2. Reload MCP / restart Cursor.
3. Agents must use **`GOOGLE_SPREADSHEET_ID` from this project’s `.env`** on every Sheets call (see the `connected-google-sheet` skill).

Do **not** rely on a previously connected MCP default or a hardcoded spreadsheet ID from docs.

---

## 6. Map tabs in `e2e/tab-suites.json`

Replace the Example entry with **exact Google Sheet tab titles**.

### Logged-in feature (most app pages)

```json
{
  "tab": "Projects",
  "specs": ["playwright-tests/projects.spec.ts"],
  "project": "chromium",
  "workers": 4,
  "unitSpecs": ["__tests__/projects-list.unit.test.tsx"]
}
```

### Logged-out auth UI (sign-in / register / forgot password)

```json
{
  "tab": "Sign In",
  "specs": ["playwright-tests/signin.spec.ts"],
  "project": "chromium-unauth",
  "unitSpecs": ["__tests__/signin.unit.test.tsx"]
}
```

| Field | Meaning |
|-------|---------|
| `tab` | Exact Google Sheet tab name |
| `specs` | Playwright files (`Category=Playwright`) |
| `unitSpecs` | Jest files (`Category=UI`) — optional |
| `project` | `chromium` = logged in via `auth.setup`; `chromium-unauth` = logged out |
| `workers` | optional parallelism |

Wrong `tab` names → runner warnings and empty status (`—`). The runner can fuzzy-match spaces↔underscores, but prefer exact titles.

---

## 7. Wire auth for logged-in suites

Edit `playwright-tests/auth.setup.ts` so it matches **your** sign-in page (URL, selectors, credentials).

- `chromium` projects depend on this and write `playwright/.auth/user.json`
- `chromium-unauth` must **not** depend on that storage (sign-in / signup / forgot-password)

Also ensure unauth spec filenames stay matched by `unauthenticatedSpecMatch` in `playwright.config.ts` (e.g. `signin.spec.ts`, `signup.spec.ts`, `forgotpassword.spec.ts`).

---

## 8. Write tests from the sheet

| Sheet `Category` | Engine | Where |
|------------------|--------|--------|
| `Playwright` (or blank) | Playwright | files listed in `specs`; title `TC_001: …` |
| `UI` | Unit Test (Jest) | files listed in `unitSpecs` |
| `API` | — | omit from the runner entirely |

Keep sheet **Test Case ID** aligned with `test("TC_001: …")` / `it("TC_001: …")`.

Skip rows whose Playwright status is **`Not Implemented`** (feature not ready — do not invent a soft-skip test).

Cursor skills (copied on `init`):

| Skill | Use for |
|-------|---------|
| `connected-google-sheet` | Always resolve spreadsheet from `.env` |
| `sheet-driven-qa` | Map sheet columns → tests + status sync |
| `sheet-playwright-e2e` | Category=`Playwright` browser suites |
| `sheet-unit-test` | Category=`UI` Jest suites |

---

## 9. Run the E2E Runner

```bash
npm run dev
```

Open:

```
http://localhost:3000/e2e-runner
```

(Also printed by `init` / `doctor` and documented in `e2e/README.md`.)

### In the UI

1. Choose engine: **Playwright** or **Unit Test**
2. Select module(s) (sheet tabs)
3. Keep **Sync to sheet** on if you want Passed/Failed written back
4. Run all / failed / checked / a single case

### CLI

```bash
npm run test:e2e:doctor
npm run test:e2e              # interactive tab select
npm run test:e2e:all
npm run test:e2e:tab "Projects"
```

### After a run (sync on)

| Engine | Sheet column | Comment |
|--------|--------------|---------|
| Playwright | **Playwright** = Passed / Failed | failure reason; cleared on pass |
| Unit Test | **UI Status** = Passed / Failed | same |

Never overwrite a status cell that is already **`Not Implemented`**.

---

## 10. Checklist

```
- [ ] Service account JSON at credentials/credentials.json
- [ ] Sheet shared with SA email as Editor
- [ ] npm i -D github:hasib6sense/sheet-e2e#main
- [ ] npx sheet-e2e init (--browsers on fresh machines)
- [ ] .env has the 4 keys + real GOOGLE_SPREADSHEET_ID
- [ ] Cursor MCP reloaded
- [ ] e2e/tab-suites.json uses exact tab names + chromium vs chromium-unauth
- [ ] auth.setup.ts matches your login UI
- [ ] Specs / unitSpecs exist for mapped TCs
- [ ] npm run dev → http://localhost:3000/e2e-runner
- [ ] npx sheet-e2e doctor is green
```

---

## Common pitfalls

| Symptom | Likely cause |
|---------|----------------|
| Sheet warnings / status `—` | Wrong spreadsheet ID, SA not Editor, or tab name ≠ `tab-suites.json` |
| Auth cases fail setup | `auth.setup.ts` selectors / credentials wrong |
| Unauth suite uses logged-in state | Tab should use `"project": "chromium-unauth"` |
| UI cases never sync | They’re `Category=UI` → use **Unit Test** engine + `unitSpecs` |
| Status stays `N/A` for reused TC IDs | Update to latest package (`#main`) — sync matches by tab spec file |
| MCP reads a different sheet | Always pass `GOOGLE_SPREADSHEET_ID` from this project’s `.env` |

---

## Uninstall

```bash
npx sheet-e2e uninstall -y
# also remove e2e/ folder:
# npx sheet-e2e uninstall -y --purge
```

Removes runner routes, config patches, scripts, and the package (unless `--keep-dep`). Keeps Playwright/Jest specs and `.env` secrets by default.
