#!/usr/bin/env node
import { checkbox, confirm } from "@inquirer/prompts";
import { clearConfigCache, getTabSuite, getTabSuites, loadConfig } from "../config";
import { syncSheetsForTabs } from "../google-sheets";
import { runE2eTests } from "../runner";
import { runDoctor } from "./doctor";
import { runInit } from "./init";
import { runUninstall } from "./uninstall";

function printHelp() {
  console.log(`
@6sense/sheet-e2e — Playwright e2e runner + Google Sheet sync

Usage:
  sheet-e2e init [--force] [--minimal] [--no-install] [--browsers]
      Full host wiring by default (runner + Playwright + Next/Tailwind + env + skill).
      --minimal     runner shell only (old behavior)
      --force       overwrite existing scaffold files
      --no-install  skip npm i -D googleapis @playwright/test
      --browsers    also run npx playwright install

  sheet-e2e uninstall [-y] [--purge] [--keep-dep]
      Remove runner wiring from the host project (reverse of init).
      -y / --yes    skip confirmation
      --purge       also remove e2e/ folder and example.spec.ts
      --keep-dep    leave @6sense/sheet-e2e in package.json (files/config only)
      Keeps Playwright specs, auth.setup, playwright.config, and .env secrets.

  sheet-e2e doctor                      Verify host is ready for the runner
  sheet-e2e run <TabName>               Run one mapped tab + sync
  sheet-e2e select [--all]              Interactive / all / E2E_TABS multi-tab run
  sheet-e2e sync [--tabs a,b] [--report path]   Sync report → sheet

Env:
  GOOGLE_SPREADSHEET_ID
  GOOGLE_APPLICATION_CREDENTIALS
  E2E_NO_SHEET_SYNC=1
  E2E_TABS="Sign In,Projects"
  SHEET_E2E_CONFIG=sheet-e2e.config.json
`);
}

async function cmdRun(args: string[]) {
  clearConfigCache();
  loadConfig();
  const tabArg = args[0] ?? process.env.E2E_TABS?.split(/[,;]/)[0]?.trim();
  const suites = getTabSuites();
  if (!tabArg) {
    console.error("Usage: sheet-e2e run <SheetTabName>");
    console.error("Available:", suites.map((s) => s.tab).join(", ") || "(none — run init)");
    process.exit(1);
  }
  const suite = getTabSuite(tabArg);
  if (!suite) {
    console.error(`No suite mapped for tab "${tabArg}".`);
    console.error("Available:", suites.map((s) => s.tab).join(", "));
    process.exit(1);
  }
  console.log(`Running: ${suite.tab} → ${suite.specs.join(", ")}`);
  const result = await runE2eTests({ mode: "tabs", tabs: [suite.tab] });
  process.exit(result.exitCode);
}

async function cmdSelect(args: string[]) {
  clearConfigCache();
  loadConfig();
  const suites = getTabSuites();
  if (!suites.length) {
    console.error("No tab suites mapped. Run: sheet-e2e init  then edit e2e/tab-suites.json");
    process.exit(1);
  }

  const runAll = args.includes("--all");
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
        message: "Select Google Sheet tab(s) to run Playwright for",
        required: true,
        choices: suites.map((s) => ({
          name: `${s.tab}  →  ${s.specs.join(", ")}`,
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
  });
  process.exit(result.exitCode);
}

async function cmdSync(args: string[]) {
  clearConfigCache();
  loadConfig();
  let tabs: string[] = [];
  let report: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--tabs" && args[i + 1]) {
      tabs = args[i + 1].split(/[,;]/).map((t) => t.trim()).filter(Boolean);
      i += 1;
    } else if (args[i] === "--report" && args[i + 1]) {
      report = args[i + 1];
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

  console.log(`\nSyncing ${tabs.join(", ")}…`);
  const summary = await syncSheetsForTabs(tabs, report);
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
