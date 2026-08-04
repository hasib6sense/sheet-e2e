#!/usr/bin/env node
import { checkbox, confirm } from "@inquirer/prompts";
import { clearConfigCache, getTabSuite, getTabSuites, loadConfig } from "../config";
import { syncSheetsForTabs } from "../google-sheets";
import { runE2eTests } from "../runner";
import { runDoctor } from "./doctor";
import { runInit } from "./init";
import { runUninstall } from "./uninstall";

function parseEngine(args: string[]): "playwright" | "unit-test" {
  const idx = args.indexOf("--engine");
  if (idx >= 0 && args[idx + 1]) {
    const v = args[idx + 1].trim().toLowerCase();
    if (v === "unit-test" || v === "unit" || v === "jest") return "unit-test";
    if (v === "playwright" || v === "pw") return "playwright";
    console.error(`Unknown --engine "${args[idx + 1]}". Use playwright or unit-test.`);
    process.exit(1);
  }
  return "playwright";
}

function stripEngineArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--engine") {
      i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

function printHelp() {
  console.log(`
@6sense/sheet-e2e — Playwright + Unit Test runner + Google Sheet sync

Usage:
  sheet-e2e init [--force] [--minimal] [--no-install] [--browsers] [--cursor] [--opencode]
      Full host wiring by default (runner + Playwright + Next/Tailwind + env + Cursor skills/MCP).
      --minimal     runner shell only (old behavior)
      --force       overwrite existing scaffold files
      --no-install  skip npm i -D googleapis @playwright/test
      --browsers    also run npx playwright install
      --cursor      wire Cursor MCP + skills (default when neither agent flag is set)
      --opencode    wire OpenCode MCP + skills (.opencode/skills + opencode.json)
                    use both flags to wire Cursor and OpenCode together

  sheet-e2e uninstall [-y] [--purge] [--keep-dep]
      Remove runner wiring from the host project (reverse of init).
      -y / --yes    skip confirmation
      --purge       also remove e2e/ folder and example.spec.ts
      --keep-dep    leave @6sense/sheet-e2e in package.json (files/config only)
      Removes: runner routes, tab-suites, skills, Sheets MCP entry, scripts, patches.
      Keeps Playwright/Jest specs, auth.setup, playwright.config, and .env secrets.

  sheet-e2e doctor                      Verify host is ready for the runner
  sheet-e2e run <TabName> [--engine playwright|unit-test]
  sheet-e2e select [--all] [--engine playwright|unit-test]
  sheet-e2e sync [--tabs a,b] [--report path] [--engine playwright|unit-test]

Env:
  GOOGLE_SPREADSHEET_ID
  GOOGLE_APPLICATION_CREDENTIALS
  E2E_RESULTS_FILE=playwright-results.json
  E2E_TAB_SUITES_PATH=e2e/tab-suites.json
`);
}

async function cmdRun(args: string[]) {
  clearConfigCache();
  loadConfig();
  const engine = parseEngine(args);
  const rest = stripEngineArgs(args);
  const tabArg = rest[0] ?? process.env.E2E_TABS?.split(/[,;]/)[0]?.trim();
  const suites = getTabSuites();
  if (!tabArg) {
    console.error("Usage: sheet-e2e run <SheetTabName> [--engine playwright|unit-test]");
    console.error("Available:", suites.map((s) => s.tab).join(", ") || "(none — run init)");
    process.exit(1);
  }
  const suite = getTabSuite(tabArg);
  if (!suite) {
    console.error(`No suite mapped for tab "${tabArg}".`);
    console.error("Available:", suites.map((s) => s.tab).join(", "));
    process.exit(1);
  }
  const files = engine === "unit-test" ? (suite.unitSpecs ?? []) : suite.specs;
  if (!files.length) {
    console.error(
      engine === "unit-test"
        ? `Tab "${suite.tab}" has no unitSpecs mapped in e2e/tab-suites.json`
        : `Tab "${suite.tab}" has no Playwright specs mapped`,
    );
    process.exit(1);
  }
  console.log(`Running (${engine}): ${suite.tab} → ${files.join(", ")}`);
  const result = await runE2eTests({ mode: "tabs", tabs: [suite.tab], engine });
  process.exit(result.exitCode);
}

async function cmdSelect(args: string[]) {
  clearConfigCache();
  loadConfig();
  const engine = parseEngine(args);
  const rest = stripEngineArgs(args);
  const suites = getTabSuites();
  if (!suites.length) {
    console.error("No tab suites mapped. Run: sheet-e2e init  then edit e2e/tab-suites.json");
    process.exit(1);
  }

  const runAll = rest.includes("--all");
  let selected = suites;

  if (!runAll) {
    const fromEnv = process.env.E2E_TABS?.split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (fromEnv?.length) {
      const wanted = new Set(fromEnv.map((t) => t.toLowerCase()));
      selected = suites.filter((s) => wanted.has(s.tab.toLowerCase()));
      if (!selected.length) {
        console.error(`No mapped suites for E2E_TABS="${process.env.E2E_TABS}".`);
        process.exit(1);
      }
    } else if (!process.stdin.isTTY) {
      console.error('No TTY: pass --all or set E2E_TABS. Example: E2E_TABS="Sign In,Projects"');
      process.exit(1);
    } else {
      const chosen = await checkbox({
        message: `Select Google Sheet tab(s) to run (${engine})`,
        required: true,
        choices: suites.map((s) => ({
          name: `${s.tab}  →  ${(engine === "unit-test" ? (s.unitSpecs ?? []) : s.specs).join(", ") || "(none)"}`,
          value: s.tab,
          checked: false,
        })),
      });
      if (!chosen.length) {
        console.log("Nothing selected.");
        process.exit(0);
      }
      const ok = await confirm({
        message: `Run ${chosen.length} tab suite(s): ${chosen.join(", ")}?`,
        default: true,
      });
      if (!ok) {
        console.log("Cancelled.");
        process.exit(0);
      }
      const wanted = new Set(chosen.map((t) => t.toLowerCase()));
      selected = suites.filter((s) => wanted.has(s.tab.toLowerCase()));
    }
  }

  const result = await runE2eTests({
    mode: "tabs",
    tabs: selected.map((s) => s.tab),
    engine,
  });
  process.exit(result.exitCode);
}

async function cmdSync(args: string[]) {
  clearConfigCache();
  loadConfig();
  const engine = parseEngine(args);
  let tabs: string[] = [];
  let report: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--tabs" && args[i + 1]) {
      tabs = args[i + 1].split(/[,;]/).map((t) => t.trim()).filter(Boolean);
      i += 1;
    } else if (args[i] === "--report" && args[i + 1]) {
      report = args[i + 1];
      i += 1;
    } else if (args[i] === "--engine") {
      i += 1;
    }
  }

  if (!tabs.length) {
    tabs = getTabSuites().map((s) => s.tab);
  }
  if (!tabs.length) {
    console.error("No tabs to sync. Pass --tabs or map suites in e2e/tab-suites.json");
    process.exit(1);
  }

  console.log(`\nSyncing (${engine}) ${tabs.join(", ")}…`);
  const summary = await syncSheetsForTabs(tabs, report, engine);
  for (const line of summary) console.log(line);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    printHelp();
    process.exit(0);
  }

  switch (cmd) {
    case "init":
      await runInit(rest);
      break;
    case "uninstall":
      await runUninstall(rest);
      break;
    case "doctor":
      await runDoctor();
      break;
    case "run":
      await cmdRun(rest);
      break;
    case "select":
      await cmdSelect(rest);
      break;
    case "sync":
      await cmdSync(rest);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
