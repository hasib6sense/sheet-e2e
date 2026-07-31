import { getAppBaseUrl, getRunnerPageUrl } from "../config";

/** Print where to open the hosted runner UI after init / doctor. */
export function printRunnerAccessInfo(cwd = process.cwd()) {
  const base = getAppBaseUrl(cwd);
  const url = getRunnerPageUrl(cwd);
  console.log(`
┌─────────────────────────────────────────────────────────────
│  E2E Runner UI
│
│  Path:  /e2e-runner
│  URL:   ${url}
│
│  1. Start the app:  npm run dev
│  2. Open the URL above in your browser
│
│  Origin comes from PLAYWRIGHT_BASE_URL in .env
│  (currently ${base}; default http://localhost:3000)
│
│  Also documented in: e2e/README.md
│  Verify setup:       npm run test:e2e:doctor
│  CLI runs:           npm run test:e2e
└─────────────────────────────────────────────────────────────
`);
}
