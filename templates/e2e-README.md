# E2E Runner

After `sheet-e2e init`, the Google Sheet–driven test runner is available at:

| | |
|--|--|
| **Path** | `/e2e-runner` |
| **Default URL** | `http://localhost:3000/e2e-runner` |

## Open it

```bash
npm run dev
# then visit http://localhost:3000/e2e-runner
```

## CLI

```bash
npm run test:e2e:doctor   # verify wiring + print runner URL
npm run test:e2e          # interactive tab select
npm run test:e2e:all      # all mapped tabs
```

Map sheet tabs in `e2e/tab-suites.json`:

- `specs` → Playwright (`Category=Playwright`)
- `unitSpecs` → Jest Unit Test (`Category=UI`)
- `project: "chromium"` → logged-in suites
- `project: "chromium-unauth"` → logged-out auth UI
