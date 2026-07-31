import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCredentialsPath,
  getRunnerPageUrl,
  getSpreadsheetId,
  getTabSuites,
  loadConfig,
  clearConfigCache,
} from "../config";
import { printRunnerAccessInfo } from "./runner-access";

type Check = { ok: boolean; label: string; detail?: string };

function check(ok: boolean, label: string, detail?: string): Check {
  return { ok, label, detail };
}

export async function runDoctor() {
  const cwd = process.cwd();
  const checks: Check[] = [];

  console.log("\n@6sense/sheet-e2e doctor\n");

  const pkg = join(cwd, "package.json");
  checks.push(check(existsSync(pkg), "package.json exists"));

  if (existsSync(pkg)) {
    const p = JSON.parse(readFileSync(pkg, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const has = (n: string) => Boolean(p.dependencies?.[n] || p.devDependencies?.[n]);
    checks.push(check(has("@6sense/sheet-e2e"), "@6sense/sheet-e2e installed"));
    checks.push(check(has("googleapis"), "googleapis installed"));
    checks.push(check(has("@playwright/test"), "@playwright/test installed"));
  }

  checks.push(check(existsSync(join(cwd, "e2e/tab-suites.json")), "e2e/tab-suites.json"));
  checks.push(
    check(
      existsSync(join(cwd, "src/app/e2e-runner/page.tsx")) ||
        existsSync(join(cwd, "app/e2e-runner/page.tsx")),
      "e2e-runner page",
    ),
  );
  checks.push(
    check(
      existsSync(join(cwd, "src/app/api/e2e/cases/route.ts")) ||
        existsSync(join(cwd, "app/api/e2e/cases/route.ts")),
      "api/e2e/cases route",
    ),
  );

  const pw = join(cwd, "playwright.config.ts");
  checks.push(check(existsSync(pw), "playwright.config.ts"));
  if (existsSync(pw)) {
    const c = readFileSync(pw, "utf8");
    checks.push(check(c.includes("playwright-results.json"), "JSON reporter → playwright-results.json"));
    checks.push(check(/name:\s*["']setup["']/.test(c), "Playwright project: setup"));
    checks.push(check(/name:\s*["']chromium["']/.test(c), "Playwright project: chromium"));
    checks.push(
      check(/name:\s*["']chromium-unauth["']/.test(c), "Playwright project: chromium-unauth"),
    );
  }

  checks.push(check(existsSync(join(cwd, "playwright-tests/auth.setup.ts")), "auth.setup.ts"));

  let nextOk = false;
  for (const name of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
    const p = join(cwd, name);
    if (!existsSync(p)) continue;
    nextOk = readFileSync(p, "utf8").includes("@6sense/sheet-e2e");
    if (nextOk) break;
  }
  checks.push(check(nextOk, "next.config transpilePackages includes @6sense/sheet-e2e"));

  clearConfigCache();
  try {
    loadConfig();
    const id = getSpreadsheetId();
    checks.push(check(Boolean(id), "GOOGLE_SPREADSHEET_ID set", id ? `(${id.slice(0, 8)}…)` : "missing"));
  } catch (e) {
    checks.push(check(false, "GOOGLE_SPREADSHEET_ID set", (e as Error).message));
  }

  try {
    const creds = getCredentialsPath();
    checks.push(
      check(existsSync(creds), "credentials file exists", creds),
    );
  } catch (e) {
    checks.push(check(false, "credentials path", (e as Error).message));
  }

  try {
    const suites = getTabSuites();
    checks.push(
      check(suites.length > 0, "tab-suites mapped", `${suites.length} tab(s)`),
    );
    for (const s of suites) {
      for (const spec of s.specs) {
        checks.push(check(existsSync(join(cwd, spec)), `spec exists: ${spec}`));
      }
    }
  } catch {
    checks.push(check(false, "tab-suites readable"));
  }

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "ok" : "FAIL";
    if (!c.ok) failed += 1;
    console.log(`  [${mark}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
  }

  console.log(
    failed
      ? `\n${failed} check(s) failed. Re-run: npx sheet-e2e init\n`
      : `\nAll checks passed.\n`,
  );
  if (!failed) {
    printRunnerAccessInfo(cwd);
    console.log(`Or run from CLI: npm run test:e2e\n`);
  } else {
    console.log(`  tip: after fixing, runner UI will be at ${getRunnerPageUrl(cwd)}\n`);
  }
  process.exit(failed ? 1 : 0);
}
