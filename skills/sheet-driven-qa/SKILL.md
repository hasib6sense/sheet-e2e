---
name: sheet-driven-qa
description: >-
  Map Google Sheet test cases to Playwright or Unit Test (Jest) work and keep
  sheet status columns consistent. Use when the user mentions Google Sheet test
  cases, TC_ IDs, updating Playwright or UI Status on the sheet, or generating
  tests from spreadsheet rows. Always use GOOGLE_SPREADSHEET_ID from .env (see
  connected-google-sheet skill).
---

# Sheet-Driven QA

## Spreadsheet (connected sheet only)

- **Source of truth:** `GOOGLE_SPREADSHEET_ID` in the project `.env` (what the e2e-runner uses).
- Follow `.cursor/skills/connected-google-sheet/SKILL.md` — always pass that ID as `spreadsheet` on Sheets MCP calls.
- Prefer Google Sheets MCP tools when configured (`sheets_read_range`, `sheets_list_tabs`, `sheets_write_range` / append).
- Credentials: project `credentials/credentials.json` (via `.cursor/mcp.json` + `.env`) — never commit keys.
- Never use a previously connected MCP default or a hardcoded spreadsheet ID from docs/chats.

## Read before write

1. Resolve connected sheet ID from `.env` (see connected-google-sheet skill).
2. `sheets_list_tabs` if tab name unknown (`spreadsheet: <id>`).
3. `sheets_read_range` for the feature tab.
   - Prefer raw rows (`skip_header: true`) starting at the header row when the tab has metadata rows above the table.
4. For **every** TC row, read and use the columns below — do not invent inputs or expectations when the sheet already provides them.

## Column usage (required for every suite)

When generating or updating **any** Playwright (or API) suite from the sheet, map columns explicitly:

| Column | How to use |
|--------|------------|
| **Test Case ID** | Test name prefix: `TC-001: …` / `TC_054: …` (keep sheet’s hyphen/underscore style). |
| **Test Case** | Human-readable title after the ID. |
| **Test Scenario** | Group related tests in `test.describe` when useful. |
| **Category** | `Playwright` (or blank/legacy) → Playwright skill. `UI` → Unit Test / `sheet-unit-test` skill. `API` → omit from Playwright/Jest generation. |
| **Pre-Conditions** | Setup: navigate to route, seed `sessionStorage`, mock expired session, etc. |
| **Test Steps** | Drive the test actions in order (fill → click → observe). |
| **Test Data** | **Required inputs.** Parse and use the exact values (emails, OTP, passwords, `N/A`, empty, quoted spaces). Prefer env overrides only for secrets that already use env in the repo (`TEST_SIGNIN_EMAIL`, etc.); otherwise use the sheet value. |
| **Endpoint** | UI route to open / assert. If the cell is multi-line like `Protected` on one line and `/leave-management/holidays` on the next line, treat the route as the real endpoint and treat `Protected` as a login/auth hint. |
| **Expected Result** | Primary assertions (visible text, URL, attributes). Prefer exact UI strings from Expected Result when they match the app; if product text differs, assert real UI and note the gap. |
| **Playwright / UI Status / Comment** | Updated by sync after runs — do not invent Passed without a green run. |

### Test Data parsing rules

- `N/A` → no input payload; visibility / navigation only.
- `Email: empty` / empty field → leave blank or clear the field.
- Quoted strings like `Email: " "` → include the spaces as written.
- Multi-value rows (`Invalid Email: …, Valid Email: …`) → use both values in sequence per Test Steps.
- JSON in Test Data on **API** rows is for API automation only — do not paste into Playwright as the main assertion.
- Never substitute a “nicer” email/password/OTP when the sheet already specifies one for that TC.

## Generation rules

| Category | Action |
|---|---|
| `Playwright` or blank | Implement in Playwright specs (`sheet-playwright-e2e`) |
| `UI` | Implement Jest unit/component tests (`sheet-unit-test`); wire `unitSpecs` |
| `API` | Omit from Playwright/Jest generation; keep out of these suites |

- Cover **all** `Playwright` (and blank/legacy) TC IDs on the tab for Playwright suites; cover **all** `UI` IDs for Unit Test suites.
- During generation, only discard a TC when the sheet explicitly marks it as **`Not Implemented`**. Do not drop rows just because they look difficult, currently fail, need auth, or need product follow-up.
- One TC → one `test`/`it("TC_XXX: ...")` unless sheet groups shared setup.
- Wire new tabs in **`e2e/tab-suites.json`** (`specs` for Playwright, `unitSpecs` for Jest). Spreadsheet id / credentials come from `.env`.
- Assert page UI for Playwright; component/hook/util behavior for Unit Test. Never treat API Expected Results as the main goal.

### Endpoint parsing rules

- If `Endpoint` is a normal route, use it directly.
- If `Endpoint` contains `Protected` plus a route on the next line, use the route as the endpoint and treat the case as authenticated.
- `Protected` is a context hint, not part of the URL.

### Pass / fail only (all suites)

- Never `test.skip` / soft-pass when data, permissions, or UI is missing.
- Missing feature or precondition → **fail** with an explicit reason string suitable for the sheet **Comment** column.
- Example: `FAIL: Add Member button not shown (permission missing or control absent).`

## After runs

When using the runner / `sheet-e2e` CLI, results sync to the sheet:

- **Playwright runs** → `Playwright` = `Passed` or `Failed` (`skipped` / `timedOut` also sync as **Failed`)
- **Unit Test runs** → `UI Status` = `Passed` or `Failed`
- **Comment** → failure / skip / timeout reason for the active engine (cleared on pass); API rows (`Category === API`) are never updated

Always leave a useful Comment on Failed rows. Prefer assertion messages that start with `FAIL:`.

Skip sync: `E2E_NO_SHEET_SYNC=1`. Requires `GOOGLE_APPLICATION_CREDENTIALS` (same service account as Cursor MCP).

## Sync with skills

- Connected sheet / MCP → `connected-google-sheet`
- Playwright / Category=`Playwright` → `sheet-playwright-e2e`
- Unit Test / Category=`UI` → `sheet-unit-test`
