import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(__dirname, "../../templates");

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeIfMissing(path: string, content: string, force: boolean) {
  if (!force && existsSync(path)) {
    console.log(`  skip (exists): ${relative(process.cwd(), path)}`);
    return false;
  }
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
  console.log(`  wrote: ${relative(process.cwd(), path)}`);
  return true;
}

function copyTemplate(rel: string, dest: string, force: boolean) {
  const src = join(TEMPLATES, rel);
  const content = readFileSync(src, "utf8");
  return writeIfMissing(dest, content, force);
}

function detectAppDir(cwd: string): string {
  if (existsSync(join(cwd, "src/app"))) return "src/app";
  if (existsSync(join(cwd, "app"))) return "app";
  return "src/app";
}

function mergePackageScripts(cwd: string) {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    console.log("  skip package.json scripts (no package.json)");
    return;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  pkg.scripts ??= {};
  const additions: Record<string, string> = {
    "test:e2e": "sheet-e2e select",
    "test:e2e:all": "sheet-e2e select --all",
    "test:e2e:tab": "sheet-e2e run",
  };
  let changed = false;
  for (const [k, v] of Object.entries(additions)) {
    if (!pkg.scripts[k]) {
      pkg.scripts[k] = v;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    console.log("  updated: package.json scripts");
  } else {
    console.log("  skip package.json scripts (already present)");
  }
}

export async function runInit(args: string[]) {
  const force = args.includes("--force");
  const cwd = process.cwd();
  const appDir = detectAppDir(cwd);

  console.log("\n@6sense/sheet-e2e init\n");

  ensureDir(join(cwd, "e2e"));
  copyTemplate("tab-suites.json", join(cwd, "e2e/tab-suites.json"), force);
  // Config lives in .env — optional JSON template kept under e2e/ for reference only
  copyTemplate("env.example", join(cwd, "e2e/env.example"), force);
  if (!existsSync(join(cwd, ".env.example"))) {
    copyTemplate("env.example", join(cwd, ".env.example"), force);
  } else {
    console.log("  tip: merge e2e/env.example into your .env (GOOGLE_SPREADSHEET_ID, …)");
  }

  copyTemplate(
    "e2e-runner-page.tsx",
    join(cwd, appDir, "e2e-runner/page.tsx"),
    force,
  );
  copyTemplate(
    "api-routes/cases/route.ts",
    join(cwd, appDir, "api/e2e/cases/route.ts"),
    force,
  );
  copyTemplate(
    "api-routes/tabs/route.ts",
    join(cwd, appDir, "api/e2e/tabs/route.ts"),
    force,
  );
  copyTemplate(
    "api-routes/run/route.ts",
    join(cwd, appDir, "api/e2e/run/route.ts"),
    force,
  );
  copyTemplate(
    "api-routes/run/stream/route.ts",
    join(cwd, appDir, "api/e2e/run/stream/route.ts"),
    force,
  );

  mergePackageScripts(cwd);

  console.log(`
Next steps:
  1. npm i -D googleapis @playwright/test   (if not already installed)
  2. Add transpilePackages: ["@6sense/sheet-e2e"] to next.config
  3. Add Tailwind content/source for node_modules/@6sense/sheet-e2e/src
  4. Copy e2e/env.example → .env and set GOOGLE_SPREADSHEET_ID (+ credentials path)
  5. Place credentials at credentials/credentials.json (or path in GOOGLE_APPLICATION_CREDENTIALS)
  6. Share the sheet with the service account email (Editor)
  7. Map tabs → specs in e2e/tab-suites.json
  8. Ensure playwright.config.ts has JSON reporter → playwright-results.json
  9. Open /e2e-runner (protect this route in production)

Sheet columns required: Test Case ID, Category, UI Status, Playwright, Comment
`);
}
