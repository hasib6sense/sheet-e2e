#!/usr/bin/env node
/**
 * CLI entry — runs TypeScript via tsx.
 * Usage: sheet-e2e <init|run|select|sync> [...]
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "../src/cli/index.ts");
const require = createRequire(import.meta.url);

let tsxLoader;
try {
  tsxLoader = pathToFileURL(require.resolve("tsx/esm")).href;
} catch {
  console.error("Missing dependency: tsx. Run: npm i -D @6sense/sheet-e2e");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["--import", tsxLoader, entry, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: process.cwd(), env: process.env },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
