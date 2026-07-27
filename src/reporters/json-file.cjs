/**
 * JSON reporter that always writes PLAYWRIGHT_JSON_OUTPUT_FILE (or playwright-results.json).
 * Avoids `--reporter=json` (CLI often leaves output on stdout / no file).
 */
const path = require("node:path");
const { createRequire } = require("node:module");

function loadJsonReporter() {
  // playwright package "exports" block deep requires — resolve from host cwd.
  const requireFromCwd = createRequire(path.join(process.cwd(), "package.json"));
  const pkgRoot = path.dirname(requireFromCwd.resolve("playwright/package.json"));
  const mod = requireFromCwd(path.join(pkgRoot, "lib/reporters/json.js"));
  return mod.default || mod.JSONReporter || mod;
}

const JsonReporter = loadJsonReporter();

class JsonFileReporter extends JsonReporter {
  constructor(options = {}) {
    const outputFile =
      process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ||
      path.resolve(process.cwd(), "playwright-results.json");
    super({ ...options, outputFile });
  }
}

module.exports = JsonFileReporter;
