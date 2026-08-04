#!/usr/bin/env node
/**
 * MCP entry for Google Sheets — resolves `google-sheet-mcp` from
 * this package (or the host hoist) so hosts do not need a separate install.
 *
 * Wired by `sheet-e2e init` for Cursor (`.cursor/mcp.json`) and/or OpenCode (`opencode.json`).
 * Loads project `.env` so GOOGLE_SPREADSHEET_ID works without Cursor's envFile.
 */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

function loadProjectEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadProjectEnv();

function resolveServer() {
  try {
    return require.resolve("google-sheet-mcp/src/server/server.mjs");
  } catch {
    // fall through
  }
  try {
    const pkgJson = require.resolve("google-sheet-mcp/package.json");
    const candidate = join(dirname(pkgJson), "src/server/server.mjs");
    if (existsSync(candidate)) return candidate;
  } catch {
    // fall through
  }
  return null;
}

const serverPath = resolveServer();
if (!serverPath) {
  console.error(
    "[@6sense/sheet-e2e] google-sheet-mcp not found.\n" +
      "Reinstall the package: npm i -D github:hasib6sense/sheet-e2e#main",
  );
  process.exit(1);
}

await import(pathToFileURL(serverPath).href);
