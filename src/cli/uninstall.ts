import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  rmdirSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

function rel(cwd: string, path: string) {
  return relative(cwd, path);
}

function detectAppDir(cwd: string): string {
  if (existsSync(join(cwd, "src/app"))) return "src/app";
  if (existsSync(join(cwd, "app"))) return "app";
  return "src/app";
}

function removeFile(cwd: string, path: string) {
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  console.log(`  removed: ${rel(cwd, path)}`);
  return true;
}

function removeDirIfEmpty(cwd: string, path: string) {
  if (!existsSync(path)) return;
  try {
    const entries = readdirSync(path);
    if (entries.length === 0) {
      rmdirSync(path);
      console.log(`  removed empty dir: ${rel(cwd, path)}`);
      removeDirIfEmpty(cwd, dirname(path));
    }
  } catch {
    /* ignore */
  }
}

function removeTree(cwd: string, path: string) {
  if (!existsSync(path)) return false;
  rmSync(path, { recursive: true, force: true });
  console.log(`  removed: ${rel(cwd, path)}`);
  return true;
}

function stripNextTranspile(cwd: string) {
  for (const name of ["next.config.ts", "next.config.mjs", "next.config.js", "next.config.cjs"]) {
    const p = join(cwd, name);
    if (!existsSync(p)) continue;
    let content = readFileSync(p, "utf8");
    if (!content.includes("@6sense/sheet-e2e")) {
      console.log(`  skip next.config (no sheet-e2e): ${rel(cwd, p)}`);
      return;
    }

    // transpilePackages: ["@6sense/sheet-e2e"] alone
    content = content.replace(
      /^\s*transpilePackages\s*:\s*\[\s*["']@6sense\/sheet-e2e["']\s*\]\s*,?\s*\n/m,
      "",
    );
    // "@6sense/sheet-e2e", as first/middle/last in array
    content = content.replace(/\s*["']@6sense\/sheet-e2e["']\s*,?\s*/g, (m) => {
      // leave other packages; if we removed and left trailing commas, clean below
      return m.includes(",") ? "" : "";
    });
    // clean empty transpilePackages: []
    content = content.replace(/^\s*transpilePackages\s*:\s*\[\s*\]\s*,?\s*\n/m, "");
    // clean double commas / trailing commas in arrays we may have broken lightly
    content = content.replace(/\[\s*,/g, "[").replace(/,\s*,/g, ",").replace(/,\s*\]/g, "]");
    // TODO comment from init
    content = content.replace(
      /\n?\/\/ @6sense\/sheet-e2e: add transpilePackages[^\n]*\n?/g,
      "\n",
    );

    writeFileSync(p, content, "utf8");
    console.log(`  updated: ${rel(cwd, p)} (removed transpilePackages entry)`);
    return;
  }
  console.log("  skip next.config (not found)");
}

function stripTailwind(cwd: string, appDir: string) {
  const globalsCandidates = [
    join(cwd, appDir, "globals.css"),
    join(cwd, "src/app/globals.css"),
    join(cwd, "app/globals.css"),
    join(cwd, "src/styles/globals.css"),
    join(cwd, "styles/globals.css"),
  ];
  for (const p of globalsCandidates) {
    if (!existsSync(p)) continue;
    let css = readFileSync(p, "utf8");
    if (!css.includes("@6sense/sheet-e2e")) continue;
    css = css.replace(/\n?@source\s+["'][^"']*@6sense\/sheet-e2e[^"']*["']\s*;?\s*\n?/g, "\n");
    writeFileSync(p, css, "utf8");
    console.log(`  updated: ${rel(cwd, p)} (removed @source)`);
  }

  for (const name of [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.cjs",
  ]) {
    const p = join(cwd, name);
    if (!existsSync(p)) continue;
    let content = readFileSync(p, "utf8");
    if (!content.includes("@6sense/sheet-e2e")) continue;
    content = content.replace(
      /\s*["']\.\/node_modules\/@6sense\/sheet-e2e\/src\/\*\*\/\*\.\{js,ts,jsx,tsx\}["']\s*,?\s*/g,
      "",
    );
    content = content.replace(/\[\s*,/g, "[").replace(/,\s*,/g, ",").replace(/,\s*\]/g, "]");
    writeFileSync(p, content, "utf8");
    console.log(`  updated: ${rel(cwd, p)} (removed content entry)`);
  }
}

function stripPackageScripts(cwd: string) {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  if (!pkg.scripts) return;

  const keys = ["test:e2e", "test:e2e:all", "test:e2e:tab", "test:e2e:doctor"];
  let changed = false;
  for (const k of keys) {
    if (pkg.scripts[k] && String(pkg.scripts[k]).includes("sheet-e2e")) {
      delete pkg.scripts[k];
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    console.log("  updated: package.json scripts (removed sheet-e2e scripts)");
  } else {
    console.log("  skip package.json scripts");
  }
}

function npmUninstallPackage(cwd: string, skipNpm: boolean) {
  if (skipNpm) {
    console.log("  skip npm uninstall (--keep-dep). Remove with: npm uninstall @6sense/sheet-e2e");
    return;
  }
  console.log("  npm uninstall @6sense/sheet-e2e …");
  const r = spawnSync("npm", ["uninstall", "@6sense/sheet-e2e"], {
    cwd,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.log("  warn: npm uninstall failed — run: npm uninstall @6sense/sheet-e2e");
  }
}

/**
 * Reverse `sheet-e2e init` host wiring.
 *
 * Default: remove runner UI/APIs, tab-suites, config patches, scripts, skill, npm package.
 * Keeps Playwright specs/config/auth and .env secrets.
 *
 * --purge  also removes scaffolded example.spec.ts and e2e/ folder leftovers
 * --keep-dep  do not run npm uninstall (only strip files/config)
 */
export async function runUninstall(args: string[]) {
  const purge = args.includes("--purge");
  const skipNpm = args.includes("--keep-dep");
  const yes = args.includes("--yes") || args.includes("-y");
  const cwd = process.cwd();
  const appDir = detectAppDir(cwd);

  console.log("\n@6sense/sheet-e2e uninstall\n");
  console.log("Removes runner wiring from this project.");
  console.log("Keeps: playwright-tests (except optional example), playwright.config.ts, .env secrets.\n");

  if (!yes && process.stdin.isTTY) {
    const { confirm } = await import("@inquirer/prompts");
    const ok = await confirm({
      message: "Remove sheet-e2e runner files and config patches from this project?",
      default: false,
    });
    if (!ok) {
      console.log("Cancelled.");
      return;
    }
  }

  console.log("Runner shell");
  removeFile(cwd, join(cwd, appDir, "e2e-runner/page.tsx"));
  removeDirIfEmpty(cwd, join(cwd, appDir, "e2e-runner"));
  removeTree(cwd, join(cwd, appDir, "api/e2e"));
  removeFile(cwd, join(cwd, appDir, "e2e-gate.middleware.ts"));
  removeFile(cwd, join(cwd, "e2e/tab-suites.json"));
  removeFile(cwd, join(cwd, "e2e/env.example"));
  removeFile(cwd, join(cwd, "e2e/README.md"));
  if (purge) {
    removeTree(cwd, join(cwd, "e2e"));
    removeFile(cwd, join(cwd, "playwright-tests/example.spec.ts"));
  } else {
    removeDirIfEmpty(cwd, join(cwd, "e2e"));
  }

  console.log("\nHost patches");
  stripNextTranspile(cwd);
  stripTailwind(cwd, appDir);
  stripPackageScripts(cwd);
  removeTree(cwd, join(cwd, ".cursor/skills/connected-google-sheet"));
  removeTree(cwd, join(cwd, ".cursor/skills/sheet-driven-qa"));
  removeTree(cwd, join(cwd, ".cursor/skills/sheet-playwright-e2e"));
  removeTree(cwd, join(cwd, ".cursor/skills/sheet-unit-test"));

  console.log("\nDependency");
  npmUninstallPackage(cwd, skipNpm);

  console.log(`
Done. Left in place (on purpose):
  - playwright.config.ts / playwright-tests / auth.setup.ts
  - .env sheet credentials (remove manually if desired)
  - .gitignore sheet-e2e entries (harmless)

Re-install later:
  npm i -D github:hasib6sense/sheet-e2e#main
  npx sheet-e2e init
  npx sheet-e2e doctor
`);
}
