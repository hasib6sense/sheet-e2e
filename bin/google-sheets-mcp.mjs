#!/usr/bin/env node
/**
 * Cursor MCP entry for Google Sheets — resolves `google-sheet-mcp` from
 * this package (or the host hoist) so hosts do not need a separate install.
 *
 * Configured by `sheet-e2e init` → `.cursor/mcp.json`.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);

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
