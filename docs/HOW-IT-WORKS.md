# How our E2E process works

A simple guide for developers and QA.

**Need install + sheet connection steps?** See [GETTING-STARTED.md](./GETTING-STARTED.md).

---

## The big picture

We keep test cases in a **Google Sheet**.  
Developers turn those cases into **Playwright** tests.  
QA runs those tests from a **web page (the Runner)** — no need to use the terminal.

```mermaid
flowchart LR
  Sheet[Google Sheet<br/>test cases] --> Dev[Developer<br/>writes Playwright]
  Dev --> App[Next.js app<br/>with Runner page]
  App --> QA[QA runs tests<br/>module by module]
  QA --> Sheet
```

After a run, results can go back to the sheet (Passed / Failed + comment).

---

## Who does what

| Role | Responsibility |
|------|----------------|
| **Developer** | Connects to the sheet, writes/updates Playwright tests, keeps the Runner working in the app |
| **QA** | Opens the Runner page, picks modules or cases, clicks Run, checks status and comments |

QA does **not** need to write Playwright. Developers own the automation; QA owns running and reviewing results.

---

## Step-by-step flow

### 1. Test cases live in Google Sheets

Each feature (Sign In, Projects, Apply Leave, …) has a tab with columns like:

- Test Case ID  
- Test Case (description)  
- Steps / data / expected result  
- Category (`Playwright` = browser E2E, `UI` = Jest unit/component, `API` = not in this Runner)  
- UI Status / Playwright / Comment  

### 2. Developer connects the sheet in Cursor

`sheet-e2e init` writes **`.cursor/mcp.json`** so Cursor uses the package’s Google Sheets MCP launcher (`google-sheet-mcp` is bundled — no separate install).  

Set `GOOGLE_SPREADSHEET_ID` + credentials in `.env`, then **reload Cursor MCP**. Agents should always pass that spreadsheet ID (see the `connected-google-sheet` skill).

### 3. Developer generates tests from the sheet

From the sheet rows:

- **Category=`Playwright`** (or blank/legacy) → Playwright specs under `playwright-tests/`  
- **Category=`UI`** → Jest unit/component tests (`unitSpecs` in `tab-suites.json`)  
- **Category=`API`** → omit from this Runner  

Use the copied Cursor skills (`sheet-playwright-e2e`, `sheet-unit-test`, `sheet-driven-qa`).

### 4. QA uses the Runner page

The app includes a page at **`/e2e-runner`** (default **`http://localhost:3000/e2e-runner`** — also printed by `init` / `doctor` and documented in `e2e/README.md`) where QA can:

- Choose engine (**Playwright** or **Unit Test**) and **module(s)** (including Select all)  
- See which cases are implemented  
- See **UI Status**, **Playwright**, and **Comment** from the sheet  
- Run one case, several cases, or whole module(s)  
- Watch the run log  
- Optionally sync results back to the sheet  

---

## What we built (story so far)

### First: Runner inside one product (Ops4)

We needed a way for QA to run Playwright **by module**, with statuses visible next to the sheet cases — not only via command line.

So we built a **Runner** inside the Ops4 Next.js app:

- Lists cases from the sheet + local Playwright files  
- Runs them module-wise  
- Shows pass/fail and comments  

### Then: A reusable package

Setting up that Runner in every new project by hand was slow (pages, APIs, config, sheet sync, etc.).

So we moved the Runner into a shared package:

**`@6sense/sheet-e2e`**

Any Next.js app can install it and get the same Runner experience with much less setup.

```mermaid
flowchart TB
  subgraph before [Before]
    A1[Copy Runner code<br/>into each project]
  end
  subgraph after [Now]
    P[@6sense/sheet-e2e package]
    P --> App1[Project A]
    P --> App2[Project B]
    P --> App3[Project C]
  end
```

---

## How to use the package (developers)

### Add the Runner to a Next.js app

```bash
npm i -D github:hasib6sense/sheet-e2e#main
npx sheet-e2e init
npx sheet-e2e doctor
```

`init` wires the Runner page, APIs, scripts, Cursor skills, Sheets MCP config, `e2e/README.md`, and common config.  
It also **prints the Runner URL** (default `http://localhost:3000/e2e-runner`).

You still need to:

1. Put the spreadsheet ID and Google credentials in `.env`  
2. Share the spreadsheet with the service account  
3. Reload Cursor MCP so Sheets tools work  
4. Map sheet tabs → `specs` / `unitSpecs` in `e2e/tab-suites.json`  
   (use the **exact** tab names from the sheet, e.g. `Apply_Leave`)  
5. Adjust login setup if the app needs signed-in Playwright tests  
6. Write or update Playwright and/or Unit Test specs from the sheet  

### Remove the Runner from a project

```bash
npx sheet-e2e uninstall -y

# Also remove e2e/ leftovers + example.spec.ts
npx sheet-e2e uninstall -y --purge
```

This removes Runner files, config patches, copied skills, and the Sheets MCP entry from `.cursor/mcp.json`. Playwright / Jest specs can stay. See the [README uninstall section](../README.md#4-uninstall-remove-from-a-project).

### Day-to-day for developers

- Keep Playwright / Unit tests in sync with the sheet  
- Keep `tab-suites.json` accurate  
- Fix failures QA reports from the Runner  
- Improve selectors / stability when tests flake  

More detail (install flags, env vars, MCP): see the package [README](../README.md).

---

## How to use the Runner (QA)

1. Ask the developer for the Runner URL (printed by `init` / `doctor`; often `http://localhost:3000/e2e-runner`, also in `e2e/README.md`).  
2. Select the **engine** (Playwright or Unit Test) and **module(s)** you care about.  
3. Check the list: case titles and sheet statuses should appear.  
4. Run one test, selected tests, or the module.  
5. Read the log if something fails.  
6. Confirm the sheet (or the Status / Comment columns on the page) after sync.

If Status shows only “—” and titles look like `TC_001` instead of a real sentence, tell the developer — usually the sheet tab name in config does not match the spreadsheet, or credentials are missing.

---

## End-to-end checklist

**Developer – first time on a project**

- [ ] Sheet exists with Playwright and/or UI (unit) test cases  
- [ ] Package installed + `init` + `doctor` (Runner URL printed)  
- [ ] Credentials and spreadsheet ID set  
- [ ] Cursor MCP reloaded (package Sheets launcher)  
- [ ] Tabs mapped in `tab-suites.json` (`specs` / `unitSpecs`)  
- [ ] Specs written for the relevant Category rows  
- [ ] Runner page opens and shows statuses  

**QA – each cycle**

- [ ] Open Runner (URL from developer / `e2e/README.md`)  
- [ ] Pick engine + module  
- [ ] Run tests  
- [ ] Review pass/fail and comments  
- [ ] Report gaps to developers  

---

## Short summary

| Piece | Purpose |
|-------|---------|
| **Google Sheet** | Source of truth for test cases and statuses |
| **Playwright** | Automated browser tests (Category=`Playwright`) |
| **Unit Test (Jest)** | Component/unit tests (Category=`UI`) |
| **Runner page** | Simple UI so QA can run tests by module (`/e2e-runner`) |
| **Sheets MCP** | Cursor agents read/write the same sheet (`init` wires it) |
| **`@6sense/sheet-e2e` package** | Same Runner + sync + CLI, easy to add to any Next.js project |

We started with a Runner in one app, then packaged it so every project can give QA the same experience without rebuilding the engine each time.
