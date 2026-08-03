---
name: sheet-unit-test
description: >-
  Generate sheet-driven Jest unit/component tests with @6sense/sheet-e2e: map
  Google Sheet Category=UI TC rows to Jest suites, wire unitSpecs in
  tab-suites.json, and sync UI Status. Use when the user mentions Unit Test
  engine, Category UI, UI Status, unitSpecs, Jest sheet cases, or writing unit
  tests from the spreadsheet.
---

# Sheet-Driven Unit Test (Jest)

Project-agnostic rules for Google Sheet → Jest unit/component suites using `@6sense/sheet-e2e`.
Override paths and spreadsheet ID from the host repo / `.env` — do not hardcode product names.

**Connected sheet:** Before reading any TC rows, follow `.cursor/skills/connected-google-sheet/SKILL.md`. Use `GOOGLE_SPREADSHEET_ID` from `.env` on every Sheets MCP call — never a previously connected MCP default.

## When this skill applies

- Generating or fixing **Category=`UI`** tests from a sheet tab
- Wiring `unitSpecs` in `e2e/tab-suites.json`
- Running / debugging the runner **Engine → Unit Test**
- Syncing results to the **UI Status** column

For browser E2E (`Category=Playwright`), use `sheet-playwright-e2e` instead.

## Category filter (non-negotiable)

| Sheet `Category` | Unit Test action |
|------------------|------------------|
| **`UI`** | **Implement** in Jest (`test` / `it` with `TC_XXX: …`) — unless UI Status is `Not Implemented` (below) |
| **`Playwright`** or blank/legacy | **Omit** from Unit Test generation — those belong in Playwright specs |
| **`API`** | **Omit** from Unit Test generation |

### Status skip — `Not Implemented` (non-negotiable)

Same omit tier as Category=`API`. Read the **UI Status** cell on every Category=`UI` row **before** writing a Jest case:

| `UI Status` value | Unit Test generation |
|-------------------|----------------------|
| **`Not Implemented`** | **Omit** — feature is not built yet. Do **not** add `it`/`test`. Leave the cell as **`Not Implemented`**. Do not sync Passed/Failed over it. |
| blank / `N/A` / `Passed` / `Failed` / other | **Implement** (or keep) the Jest case for that TC |

- **Do not** treat blank/`N/A` as “skip” — only the exact status **`Not Implemented`** means feature-not-ready.
- **Do not** invent a test and mark it skipped with `it.skip` — omit the TC from the suite entirely (like API).
- Comment in the file which UI TC IDs were omitted for **`Not Implemented`** (and which Playwright/API IDs were omitted by Category).
- Cover **every other** Category=`UI` TC on the tab (do not stop mid-range; do not drop rows just because they need mocks, setup, auth context, or component plumbing).
- Keep sheet TC IDs aligned with `it("TC_XXX: …")` or `test("TC_XXX: …")`.
- Never add Category=`UI` cases to Playwright specs.

## Sheet columns → Jest

Read the full tab before writing. Use sheet values; do not invent nicer inputs.

| Column | Spec usage |
|--------|------------|
| Test Case ID + Test Case | `it("TC_001: …")` / `test("TC_001: …")` (keep sheet hyphen/underscore style) |
| Test Scenario | Optional `describe` grouping |
| Pre-Conditions | Mocks, providers, fixtures, `beforeEach` |
| Test Steps | Arrange → act → assert order |
| Test Data | Exact inputs; `N/A` = no payload; honor quoted spaces |
| Endpoint | Component route / module under test (not browser `page.goto`). If the cell is multi-line like `Protected` then `/leave-management/holidays`, use the route for context and treat `Protected` as an auth hint for setup/mocks. |
| Expected Result | Component/DOM/hook/util assertions |
| UI Status / Comment | Sync after Unit Test run — never invent Passed. Never overwrite **`Not Implemented`**. |

Comment in the file which sheet tab + which UI TC IDs are covered / which IDs are omitted (`Not Implemented` UI Status, Category Playwright/API).

## Suite mapping

Map each sheet tab that has Category=`UI` rows:

```json
{
  "tab": "Weekend",
  "specs": ["playwright-tests/weekend.spec.ts"],
  "project": "chromium",
  "unitSpecs": ["__tests__/weekend.unit.test.tsx"]
}
```

- `specs` → Playwright engine
- `unitSpecs` → Unit Test engine (required for runnable UI cases)
- Tabs without `unitSpecs` show Category=`UI` rows as not implemented / not runnable

## Conventions

- Prefer the host’s existing Jest + Testing Library setup (`__tests__/`, `*.test.tsx`, etc.).
- One Category=`UI` TC → one `it`/`test` unless the sheet groups shared setup.
- Assert behavior of components, hooks, or pure helpers — **not** full browser E2E.
- Prefer accessible queries (`getByRole`, `getByLabelText`) over presentational CSS.
- Pass / fail only: never `it.skip` / soft-pass when UI, data, or mocks are missing.
- Fail with `FAIL: <reason>` suitable for the sheet **Comment** column.

## After runs

Unit Test engine / CLI:

```bash
# Runner UI: Engine → Unit Test, then Run
sheet-e2e run "Weekend" --engine unit-test
sheet-e2e select --engine unit-test
```

Sync updates Category=`UI` rows only:

- **UI Status** → Passed / Failed
- **Comment** → failure reason (cleared on pass)
- **Never** change rows whose **UI Status** is already **`Not Implemented`** (feature not built — not a test result)
- **Playwright** column and Category=`API` / `Playwright` rows are not updated by this engine

Skip sync: `E2E_NO_SHEET_SYNC=1`. Jest JSON report defaults to `jest-results.json` (`E2E_UNIT_RESULTS_FILE` to override).

## Generation checklist

```
- [ ] Read sheet tab (headers + all TC rows)
- [ ] Keep Category === UI only; omit Playwright and API
- [ ] Omit rows where UI Status === Not Implemented (feature not built); leave that cell unchanged
- [ ] Write Jest file(s) with matching TC_ IDs for the remaining UI rows
- [ ] Wire unitSpecs in e2e/tab-suites.json
- [ ] Use sheet Test Data / Expected Result
- [ ] Run Unit Test engine for that tab; fix assertions or leave Failed + Comment
```

## Copy into a repo (optional)

Shipped in package: `skills/sheet-unit-test/` (copied on `sheet-e2e init` with the other sheet skills).
Personal copy: `~/.cursor/skills/sheet-unit-test/`.
