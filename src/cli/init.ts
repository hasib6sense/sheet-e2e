import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { printRunnerAccessInfo } from "./runner-access";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "../..");
const TEMPLATES = join(PKG_ROOT, "templates");
const SKILL_DIRS = [
  "connected-google-sheet",
  "sheet-driven-qa",
  "sheet-playwright-e2e",
  "sheet-unit-test",
] as const;

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function rel(cwd: string, path: string) {
  return relative(cwd, path);
}

function writeIfMissing(cwd: string, path: string, content: string, force: boolean) {
  if (!force && existsSync(path)) {
    console.log(`  skip (exists): ${rel(cwd, path)}`);
    return false;
  }
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
  console.log(`  wrote: ${rel(cwd, path)}`);
  return true;
}

function copyTemplate(cwd: string, relPath: string, dest: string, force: boolean) {
  const content = readFileSync(join(TEMPLATES, relPath), "utf8");
  return writeIfMissing(cwd, dest, content, force);
}

/**
 * Older init templates shipped Example without unitSpecs. On re-init, add the
 * field when the Example entry is still present and missing it — do not touch
 * other tabs or overwrite an existing unitSpecs array.
 */
function ensureExampleTabSuiteHasUnitSpecs(cwd: string) {
  const path = join(cwd, "e2e/tab-suites.json");
  if (!existsSync(path)) return;

  let suites: unknown;
  try {
    suites = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.log("  skip e2e/tab-suites.json (invalid JSON)");
    return;
  }
  if (!Array.isArray(suites)) return;

  const exampleUnit = "__tests__/example.unit.test.tsx";
  let changed = false;
  for (const suite of suites) {
    if (
      suite &&
      typeof suite === "object" &&
      (suite as { tab?: string }).tab === "Example" &&
      !Array.isArray((suite as { unitSpecs?: unknown }).unitSpecs)
    ) {
      (suite as { unitSpecs: string[] }).unitSpecs = [exampleUnit];
      changed = true;
    }
  }
  if (!changed) return;

  writeFileSync(path, `${JSON.stringify(suites, null, 2)}\n`, "utf8");
  console.log(`  updated: ${rel(cwd, path)} (Example unitSpecs)`);
}

function detectAppDir(cwd: string): string {
  if (existsSync(join(cwd, "src/app"))) return "src/app";
  if (existsSync(join(cwd, "app"))) return "app";
  return "src/app";
}

function findNextConfig(cwd: string): string | null {
  for (const name of ["next.config.ts", "next.config.mjs", "next.config.js", "next.config.cjs"]) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function ensureTranspilePackages(cwd: string) {
  const configPath = findNextConfig(cwd);
  if (!configPath) {
    console.log("  skip next.config (not found — add transpilePackages manually)");
    return;
  }

  let content = readFileSync(configPath, "utf8");
  if (content.includes("@6sense/sheet-e2e")) {
    console.log(`  skip transpilePackages (already set): ${rel(cwd, configPath)}`);
    return;
  }

  if (/transpilePackages\s*:\s*\[/.test(content)) {
    content = content.replace(
      /transpilePackages\s*:\s*\[/,
      'transpilePackages: ["@6sense/sheet-e2e", ',
    );
  } else if (/export\s+default\s+(?:defineConfig\s*)?\(\s*\{/.test(content)) {
    content = content.replace(
      /(export\s+default\s+(?:defineConfig\s*)?\(\s*\{)/,
      '$1\n  transpilePackages: ["@6sense/sheet-e2e"],',
    );
  } else if (/const\s+\w*[Cc]onfig\w*\s*[:=]\s*\{/.test(content)) {
    content = content.replace(
      /(const\s+\w*[Cc]onfig\w*\s*[:=]\s*\{)/,
      '$1\n  transpilePackages: ["@6sense/sheet-e2e"],',
    );
  } else {
    content +=
      '\n// @6sense/sheet-e2e: add transpilePackages: ["@6sense/sheet-e2e"] to your Next config\n';
    writeFileSync(configPath, content, "utf8");
    console.log(`  noted: ${rel(cwd, configPath)} (add transpilePackages manually)`);
    return;
  }

  writeFileSync(configPath, content, "utf8");
  console.log(`  updated: ${rel(cwd, configPath)} (transpilePackages)`);
}

function findGlobalsCss(cwd: string, appDir: string): string | null {
  const candidates = [
    join(cwd, appDir, "globals.css"),
    join(cwd, "src/app/globals.css"),
    join(cwd, "app/globals.css"),
    join(cwd, "src/styles/globals.css"),
    join(cwd, "styles/globals.css"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function ensureTailwindConfigContent(cwd: string): boolean {
  const marker = "@6sense/sheet-e2e";
  const entry = '"./node_modules/@6sense/sheet-e2e/src/**/*.{js,ts,jsx,tsx}"';

  for (const name of [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.cjs",
  ]) {
    const p = join(cwd, name);
    if (!existsSync(p)) continue;

    let content = readFileSync(p, "utf8");
    if (content.includes(marker)) {
      console.log(`  skip Tailwind content (already set): ${rel(cwd, p)}`);
      return true;
    }
    if (!/content\s*:\s*\[/.test(content)) {
      console.log(`  skip Tailwind content (no content array): ${rel(cwd, p)}`);
      return false;
    }

    content = content.replace(/content\s*:\s*\[/, `content: [${entry}, `);
    writeFileSync(p, content, "utf8");
    console.log(`  updated: ${rel(cwd, p)} (Tailwind content)`);
    return true;
  }
  return false;
}

function ensureTailwindGlobalsSource(cwd: string, appDir: string): boolean {
  const marker = "@6sense/sheet-e2e";
  const globals = findGlobalsCss(cwd, appDir);
  if (!globals) return false;

  let css = readFileSync(globals, "utf8");
  if (css.includes(marker)) {
    console.log(`  skip Tailwind @source (already set): ${rel(cwd, globals)}`);
    return true;
  }
  if (!/@import\s+["']tailwindcss["']/.test(css) && !/@tailwind/.test(css)) {
    return false;
  }

  // Path from globals.css → repo root → node_modules
  const depth = relative(dirname(globals), cwd).split(/[/\\]/).filter(Boolean).length;
  const up = depth === 0 ? "./" : "../".repeat(depth);
  const sourceLine = `@source "${up}node_modules/@6sense/sheet-e2e/src";`;

  if (/@import\s+["']tailwindcss["']/.test(css)) {
    css = css.replace(/(@import\s+["']tailwindcss["']\s*;?)/, `$1\n${sourceLine}`);
  } else {
    css = `${sourceLine}\n${css}`;
  }
  writeFileSync(globals, css, "utf8");
  console.log(`  updated: ${rel(cwd, globals)} (Tailwind @source)`);
  return true;
}

/** Patch both globals.css @source (v4) and tailwind.config content (v3 / @config apps). */
function ensureTailwindSource(cwd: string, appDir: string) {
  const cssOk = ensureTailwindGlobalsSource(cwd, appDir);
  const configOk = ensureTailwindConfigContent(cwd);
  if (!cssOk && !configOk) {
    console.log(
      "  skip Tailwind (no globals.css @source and no tailwind.config content — add package scan manually)",
    );
  }
}

function mergeEnvKeys(cwd: string) {
  const example = readFileSync(join(TEMPLATES, "env.example"), "utf8");
  const keys = example
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => l.split("=")[0]!.trim());

  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${example.trim()}\n`, "utf8");
    console.log(`  wrote: ${rel(cwd, envPath)} (fill GOOGLE_SPREADSHEET_ID)`);
    return;
  }

  const existing = readFileSync(envPath, "utf8");
  const missing = keys.filter((k) => !new RegExp(`^\\s*${k}\\s*=`, "m").test(existing));
  if (!missing.length) {
    console.log(`  skip .env (keys present)`);
    return;
  }

  const block = [
    "",
    "# --- added by @6sense/sheet-e2e init ---",
    ...missing.map((k) => {
      const line = example.split("\n").find((l) => l.trim().startsWith(`${k}=`));
      return line?.trim() ?? `${k}=`;
    }),
    "",
  ].join("\n");
  writeFileSync(envPath, existing.trimEnd() + block, "utf8");
  console.log(`  updated: .env (+ ${missing.join(", ")})`);
}

function mergeGitignore(cwd: string) {
  const snippet = readFileSync(join(TEMPLATES, "gitignore-snippet.txt"), "utf8").trim();
  const gi = join(cwd, ".gitignore");
  if (!existsSync(gi)) {
    writeFileSync(gi, `${snippet}\n`, "utf8");
    console.log("  wrote: .gitignore");
    return;
  }
  const existing = readFileSync(gi, "utf8");
  if (existing.includes("@6sense/sheet-e2e")) {
    console.log("  skip .gitignore (already marked)");
    return;
  }
  const lines = snippet.split("\n").filter((l) => l && !l.startsWith("#"));
  const toAdd = lines.filter((l) => !existing.split("\n").some((e) => e.trim() === l.trim()));
  if (!toAdd.length) {
    writeFileSync(gi, `${existing.trimEnd()}\n\n# @6sense/sheet-e2e\n`, "utf8");
    console.log("  updated: .gitignore (marker)");
    return;
  }
  writeFileSync(
    gi,
    `${existing.trimEnd()}\n\n# @6sense/sheet-e2e\n${toAdd.join("\n")}\n`,
    "utf8",
  );
  console.log(`  updated: .gitignore (+ ${toAdd.length} entries)`);
}

function copySkills(cwd: string, force: boolean) {
  for (const name of SKILL_DIRS) {
    const src = join(PKG_ROOT, "skills", name);
    const dest = join(cwd, ".cursor/skills", name);
    if (!existsSync(src)) {
      console.log(`  skip skill ${name} (not in package)`);
      continue;
    }
    if (!force && existsSync(join(dest, "SKILL.md"))) {
      console.log(`  skip (exists): ${rel(cwd, dest)}`);
      continue;
    }
    ensureDir(dest);
    cpSync(src, dest, { recursive: true });
    console.log(`  wrote: ${rel(cwd, dest)}`);
  }
}

function mergePackageScripts(cwd: string) {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    console.log("  skip package.json scripts (no package.json)");
    return;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  pkg.scripts ??= {};
  const additions: Record<string, string> = {
    "test:e2e": "sheet-e2e select",
    "test:e2e:all": "sheet-e2e select --all",
    "test:e2e:tab": "sheet-e2e run",
    "test:e2e:doctor": "sheet-e2e doctor",
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

function hasDep(cwd: string, name: string): boolean {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function ensurePeers(cwd: string, skipInstall: boolean) {
  const need = ["googleapis", "@playwright/test"].filter((n) => !hasDep(cwd, n));
  if (!need.length) {
    console.log("  skip peer install (googleapis + @playwright/test present)");
    return;
  }
  if (skipInstall) {
    console.log(`  skip peer install (--no-install). Still need: npm i -D ${need.join(" ")}`);
    return;
  }
  console.log(`  installing: ${need.join(", ")}`);
  const r = spawnSync("npm", ["i", "-D", ...need], {
    cwd,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.log(`  warn: peer install failed — run: npm i -D ${need.join(" ")}`);
  }
}

function ensurePlaywrightBrowsers(cwd: string, want: boolean) {
  if (!want) return;
  console.log("  installing Playwright browsers…");
  const r = spawnSync("npx", ["playwright", "install"], {
    cwd,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.log("  warn: playwright install failed — run: npx playwright install");
  }
}

function ensureJsonReporter(cwd: string) {
  const configPath = join(cwd, "playwright.config.ts");
  if (!existsSync(configPath)) return;
  const content = readFileSync(configPath, "utf8");
  if (content.includes("playwright-results.json")) {
    console.log("  skip playwright JSON reporter (already configured)");
    return;
  }
  // Only auto-patch if we didn't just write our template; existing configs get a tip
  console.log("  tip: ensure playwright.config.ts JSON reporter → playwright-results.json");
}

export async function runInit(args: string[]) {
  const force = args.includes("--force");
  const minimal = args.includes("--minimal");
  const skipInstall = args.includes("--no-install");
  const browsers = args.includes("--browsers");
  const cwd = process.cwd();
  const appDir = detectAppDir(cwd);

  console.log(`\n@6sense/sheet-e2e init${minimal ? " (minimal)" : " (full host wiring)"}\n`);

  // --- always: runner shell ---
  console.log("Runner shell");
  ensureDir(join(cwd, "e2e"));
  copyTemplate(cwd, "tab-suites.json", join(cwd, "e2e/tab-suites.json"), force);
  ensureExampleTabSuiteHasUnitSpecs(cwd);
  copyTemplate(cwd, "env.example", join(cwd, "e2e/env.example"), force);
  copyTemplate(cwd, "e2e-README.md", join(cwd, "e2e/README.md"), force);
  if (!existsSync(join(cwd, ".env.example"))) {
    copyTemplate(cwd, "env.example", join(cwd, ".env.example"), force);
  }

  copyTemplate(cwd, "e2e-runner-page.tsx", join(cwd, appDir, "e2e-runner/page.tsx"), force);
  copyTemplate(cwd, "api-routes/cases/route.ts", join(cwd, appDir, "api/e2e/cases/route.ts"), force);
  copyTemplate(cwd, "api-routes/tabs/route.ts", join(cwd, appDir, "api/e2e/tabs/route.ts"), force);
  copyTemplate(cwd, "api-routes/run/route.ts", join(cwd, appDir, "api/e2e/run/route.ts"), force);
  copyTemplate(
    cwd,
    "api-routes/run/stream/route.ts",
    join(cwd, appDir, "api/e2e/run/stream/route.ts"),
    force,
  );
  mergePackageScripts(cwd);

  if (minimal) {
    printRunnerAccessInfo(cwd);
    console.log(`Minimal init done. For full host wiring run:
  npx sheet-e2e init
`);
    return;
  }

  // --- full: host wiring ---
  console.log("\nHost wiring");
  ensurePeers(cwd, skipInstall);
  ensurePlaywrightBrowsers(cwd, browsers);

  copyTemplate(cwd, "playwright.config.ts", join(cwd, "playwright.config.ts"), force);
  ensureDir(join(cwd, "playwright-tests"));
  copyTemplate(cwd, "auth.setup.ts", join(cwd, "playwright-tests/auth.setup.ts"), force);
  copyTemplate(cwd, "example.spec.ts", join(cwd, "playwright-tests/example.spec.ts"), force);
  ensureDir(join(cwd, "__tests__"));
  copyTemplate(cwd, "example.unit.test.tsx", join(cwd, "__tests__/example.unit.test.tsx"), force);
  ensureDir(join(cwd, "playwright/.auth"));
  writeIfMissing(cwd, join(cwd, "playwright/.auth/.gitkeep"), "", force);
  ensureJsonReporter(cwd);

  ensureTranspilePackages(cwd);
  ensureTailwindSource(cwd, appDir);
  mergeEnvKeys(cwd);
  mergeGitignore(cwd);
  copySkills(cwd, force);
  copyTemplate(cwd, "mcp.google-sheets.json", join(cwd, ".cursor/mcp.json"), force);
  console.log(
    "  tip: reload Cursor MCP after init — Sheets MCP is started via @6sense/sheet-e2e/bin/google-sheets-mcp.mjs",
  );

  copyTemplate(
    cwd,
    "e2e-gate.middleware.ts",
    join(cwd, appDir, "e2e-gate.middleware.ts"),
    force,
  );
  console.log(
    `  tip: merge ${appDir}/e2e-gate.middleware.ts into middleware.ts (or rename) to gate /e2e-runner in production`,
  );

  printRunnerAccessInfo(cwd);

  console.log(`Done. Only human steps left:
  1. Set GOOGLE_SPREADSHEET_ID in .env
  2. Place service-account JSON at credentials/credentials.json (or path in GOOGLE_APPLICATION_CREDENTIALS)
  3. Share the spreadsheet with that service account as Editor
  4. Adjust playwright-tests/auth.setup.ts selectors to your sign-in page
  5. Map real sheet tabs → specs + unitSpecs in e2e/tab-suites.json
  6. npm run dev → open the Runner URL printed above (also documented in e2e/README.md)
  7. Or verify with: npm run test:e2e:doctor

Sheet columns: Test Case ID, Category, UI Status, Playwright, Comment
Spec generation from sheet rows is separate (Cursor skills) — not part of init.
`);
}
