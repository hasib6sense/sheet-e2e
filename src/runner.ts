import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getResultsFile, getTabSuite, getTabSuites, getUnitResultsFile } from "./config";
import {
  categorizeEngine,
  fetchImplementedTestCasesWithMeta,
  syncSheetsForTabs,
} from "./google-sheets";
import type { E2eRunRequest, E2eRunResult, E2eTabSuite } from "./types";

const STREAM_LIST_REPORTER = join(
  dirname(fileURLToPath(import.meta.url)),
  "reporters/stream-list.cjs",
);
const JSON_FILE_REPORTER = join(
  dirname(fileURLToPath(import.meta.url)),
  "reporters/json-file.cjs",
);

type RunEngine = "playwright" | "unit-test";

function grepPatternForIds(testCaseIds: string[]): string {
  const parts = testCaseIds.map((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `${escaped}:`;
  });
  return parts.join("|");
}

/** Quote for cmd.exe when spawn uses shell:true (| in --grep is otherwise treated as a pipe). */
function shellQuote(arg: string): string {
  if (process.platform === "win32") {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  if (/[^a-zA-Z0-9_./:=+-]/.test(arg)) {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
  }
  return arg;
}

/** Hide long TC_ID regex lists from the runner UI command echo. */
function formatCmdForDisplay(args: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    const prev = out[out.length - 1];
    const isFilterFlag =
      prev === "--testNamePattern" ||
      prev === "--grep" ||
      prev === "-t" ||
      prev === "-g";
    if (isFilterFlag && (arg.includes("TC_") || arg.includes("|") || arg.length > 80)) {
      const count = Math.max(1, arg.split("|").length);
      out.push(`<${count} cases>`);
      continue;
    }
    out.push(arg);
  }
  return out.join(" ");
}

/** Jest prints the full --testNamePattern in its summary — redact that for the UI/log. */
function sanitizeRunnerChunk(text: string): string {
  return text
    .replace(
      /with tests matching ["']([^"']{40,})["']/gi,
      (_m, pattern: string) => {
        const count = Math.max(1, String(pattern).split("|").length);
        return `with tests matching <${count} cases>`;
      },
    )
    .replace(
      /Ran all test suites matching ([^\n]{120,}?)( with tests matching|\.|$)/gi,
      (_m, files: string, tail: string) => {
        const count = Math.max(1, String(files).split("|").filter(Boolean).length);
        return `Ran all test suites matching <${count} files>${tail || ""}`;
      },
    );
}

/** Buffer partial lines so redaction still works across stream chunks. */
function createOutputSanitizer(onChunk: (text: string) => void) {
  let pending = "";
  return {
    push(chunk: string) {
      pending += chunk;
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      for (const line of parts) {
        onChunk(`${sanitizeRunnerChunk(line)}\n`);
      }
    },
    flush() {
      if (!pending) return;
      onChunk(sanitizeRunnerChunk(pending));
      pending = "";
    },
  };
}

function teeOutput(text: string, onOutput?: (chunk: string) => void) {
  onOutput?.(text);
  process.stdout.write(text);
}

function runPlaywright(
  specPaths: string[],
  opts: {
    project?: string;
    workers?: number;
    grep?: string;
    onOutput?: (chunk: string) => void;
    signal?: AbortSignal;
  },
): Promise<{ exitCode: number; output: string }> {
  const rawArgs = ["playwright", "test", ...specPaths, `--project=${opts.project ?? "chromium"}`];
  if (opts.workers != null) rawArgs.push(`--workers=${opts.workers}`);
  if (opts.grep) rawArgs.push("--grep", opts.grep);

  // Piped UI runs are non-TTY — Playwright's list reporter skips "test started" lines.
  // Use stream-list so the log can show a spinner, then tick/cross when done.
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "1" };
  if (opts.onOutput) {
    const resultsPath = resolve(process.cwd(), getResultsFile());
    // Drop stale report so sync cannot apply a previous suite's TC_IDs to this tab.
    try {
      if (existsSync(resultsPath)) unlinkSync(resultsPath);
    } catch {
      /* ignore */
    }
    // Playwright CLI keeps only the last `--reporter` flag — use a comma list.
    rawArgs.push(`--reporter=${JSON_FILE_REPORTER},${STREAM_LIST_REPORTER}`);
    env.PLAYWRIGHT_JSON_OUTPUT_FILE = resultsPath;
  }

  const args = rawArgs.map((a) => (opts.grep && a === opts.grep ? shellQuote(a) : a));
  teeOutput(`\n> npx ${formatCmdForDisplay(args)}\n\n`, opts.onOutput);

  return new Promise((resolvePromise) => {
    if (opts.signal?.aborted) {
      resolvePromise({ exitCode: 130, output: "\nAborted before Playwright started.\n" });
      return;
    }

    let output = "";
    let settled = false;
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      shell: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      resolvePromise({ exitCode, output });
    };

    const onAbort = () => {
      const text = "\nRun aborted (client disconnected).\n";
      output += text;
      teeOutput(text, opts.onOutput);
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 2000).unref?.();
    };

    opts.signal?.addEventListener("abort", onAbort);

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      teeOutput(text, opts.onOutput);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      teeOutput(text, opts.onOutput);
    });
    child.on("error", (err) => {
      const text = `\nFailed to start Playwright: ${err.message}\n`;
      output += text;
      teeOutput(text, opts.onOutput);
      finish(1);
    });
    child.on("close", (code) => {
      finish(opts.signal?.aborted ? 130 : (code ?? 1));
    });
  });
}

function runJest(
  unitSpecPaths: string[],
  opts: {
    workers?: number;
    grep?: string;
    onOutput?: (chunk: string) => void;
    signal?: AbortSignal;
  },
): Promise<{ exitCode: number; output: string }> {
  const resultsPath = resolve(process.cwd(), getUnitResultsFile());
  try {
    if (existsSync(resultsPath)) unlinkSync(resultsPath);
  } catch {
    /* ignore */
  }

  const rawArgs = [
    "jest",
    ...unitSpecPaths,
    "--json",
    `--outputFile=${resultsPath}`,
    "--reporters=default",
    "--coverage=false",
    "--colors",
  ];
  if (opts.workers != null) rawArgs.push(`--maxWorkers=${opts.workers}`);
  if (opts.grep) rawArgs.push("--testNamePattern", opts.grep);

  const args = rawArgs.map((a) => (opts.grep && a === opts.grep ? shellQuote(a) : a));
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "1" };
  teeOutput(`\n> npx ${formatCmdForDisplay(args)}\n\n`, opts.onOutput);

  return new Promise((resolvePromise) => {
    if (opts.signal?.aborted) {
      resolvePromise({ exitCode: 130, output: "\nAborted before Jest started.\n" });
      return;
    }

    let output = "";
    let settled = false;
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      shell: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      sanitizer.flush();
      opts.signal?.removeEventListener("abort", onAbort);
      resolvePromise({ exitCode, output });
    };

    const onAbort = () => {
      const text = "\nRun aborted (client disconnected).\n";
      output += text;
      teeOutput(text, opts.onOutput);
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 2000).unref?.();
    };

    opts.signal?.addEventListener("abort", onAbort);

    const sanitizer = createOutputSanitizer((text) => {
      output += text;
      teeOutput(text, opts.onOutput);
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      sanitizer.push(chunk.toString());
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      sanitizer.push(chunk.toString());
    });
    child.on("error", (err) => {
      const text = `\nFailed to start Jest: ${err.message}\n`;
      output += text;
      teeOutput(text, opts.onOutput);
      finish(1);
    });
    child.on("close", (code) => {
      finish(opts.signal?.aborted ? 130 : (code ?? 1));
    });
  });
}

type RunBatch = {
  specs: string[];
  project?: string;
  workers?: number;
  grep?: string;
  tabs: string[];
};

function filesForSuite(suite: E2eTabSuite, engine: RunEngine): string[] {
  if (engine === "unit-test") return suite.unitSpecs ?? [];
  return suite.specs ?? [];
}

function batchesForTabs(tabs: string[], engine: RunEngine): RunBatch[] {
  const suites = tabs
    .map((tab) => getTabSuite(tab))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .filter((s) => filesForSuite(s, engine).length > 0);

  if (!suites.length) {
    const label = engine === "unit-test" ? "unitSpecs" : "Playwright specs";
    throw new Error(`No ${label} mapped for tabs: ${tabs.join(", ")}`);
  }

  if (engine === "unit-test") {
    return suites.map((suite) => ({
      specs: filesForSuite(suite, engine),
      workers: suite.workers,
      tabs: [suite.tab],
    }));
  }

  const serial = suites.filter((s) => s.workers === 1);
  const parallel = suites.filter((s) => s.workers !== 1);
  const batches: RunBatch[] = [];

  const parallelByProject = new Map<string, typeof parallel>();
  for (const suite of parallel) {
    const project = suite.project ?? "chromium";
    const list = parallelByProject.get(project) ?? [];
    list.push(suite);
    parallelByProject.set(project, list);
  }
  for (const [project, group] of parallelByProject) {
    batches.push({
      specs: [...new Set(group.flatMap((s) => filesForSuite(s, engine)))],
      project,
      tabs: group.map((s) => s.tab),
    });
  }

  for (const suite of serial) {
    batches.push({
      specs: filesForSuite(suite, engine),
      project: suite.project,
      workers: suite.workers,
      tabs: [suite.tab],
    });
  }

  return batches;
}

function batchesForCases(
  cases: { tab: string; testCaseId: string }[],
  engine: RunEngine,
): RunBatch[] {
  const byTab = new Map<string, string[]>();
  for (const c of cases) {
    const list = byTab.get(c.tab) ?? [];
    list.push(c.testCaseId);
    byTab.set(c.tab, list);
  }

  const batches: RunBatch[] = [];
  const label = engine === "unit-test" ? "unitSpecs" : "Playwright spec";

  for (const [tab, ids] of byTab) {
    const suite = getTabSuite(tab);
    const files = suite ? filesForSuite(suite, engine) : [];
    if (!suite || !files.length) {
      throw new Error(`Tab "${tab}" has no ${label} mapping.`);
    }
    batches.push({
      specs: files,
      project: suite.project,
      workers: suite.workers,
      grep: grepPatternForIds(ids),
      tabs: [tab],
    });
  }

  return batches;
}

export type E2eRunCallbacks = {
  onOutput?: (chunk: string) => void;
  signal?: AbortSignal;
};

export async function runE2eTests(
  request: E2eRunRequest,
  callbacks?: E2eRunCallbacks,
): Promise<E2eRunResult> {
  const engine: RunEngine = request.engine ?? "playwright";
  if (engine !== "playwright" && engine !== "unit-test") {
    throw new Error(`"${engine}" runner is not implemented yet.`);
  }
  const syncSheet = request.syncSheet !== false;
  let batches: RunBatch[];

  if (request.mode === "tabs") {
    if (!request.tabs.length) throw new Error("No tabs selected.");
    if (engine === "unit-test") {
      // Run only sheet Category=UI cases for the selected tabs (match Modules count).
      const { cases } = await fetchImplementedTestCasesWithMeta(request.tabs);
      const tabSet = new Set(request.tabs);
      const uiCases = cases.filter(
        (c) =>
          tabSet.has(c.tab) &&
          categorizeEngine(c.category) === "unit-test" &&
          (c.runnable || c.implemented || c.hasSpec),
      );
      if (!uiCases.length) {
        throw new Error(
          `No Category=UI unit tests mapped for tabs: ${request.tabs.join(", ")}`,
        );
      }
      batches = batchesForCases(
        uiCases.map((c) => ({ tab: c.tab, testCaseId: c.testCaseId })),
        engine,
      );
    } else {
      batches = batchesForTabs(request.tabs, engine);
    }
  } else {
    if (!request.cases.length) throw new Error("No test cases selected.");
    batches = batchesForCases(request.cases, engine);
  }

  let exitCode = 0;
  let output = "";
  const syncedTabs = new Set<string>();
  const syncSummary: string[] = [];
  const resultsFile = engine === "unit-test" ? getUnitResultsFile() : getResultsFile();

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i]!;
    if (callbacks?.signal?.aborted) {
      exitCode = exitCode || 130;
      break;
    }

    const tabLabel = batch.tabs.join(", ") || "tests";
    callbacks?.onOutput?.(
      `\n--- [${i + 1}/${batches.length}] ${tabLabel} ---\n`,
    );

    const result =
      engine === "unit-test"
        ? await runJest(batch.specs, {
            workers: batch.workers,
            grep: batch.grep,
            onOutput: callbacks?.onOutput,
            signal: callbacks?.signal,
          })
        : await runPlaywright(batch.specs, {
            project: batch.project,
            workers: batch.workers,
            grep: batch.grep,
            onOutput: callbacks?.onOutput,
            signal: callbacks?.signal,
          });

    output += result.output;
    if (result.exitCode !== 0) exitCode = result.exitCode;

    if (callbacks?.signal?.aborted) break;

    if (syncSheet) {
      for (const tab of batch.tabs) syncedTabs.add(tab);
      callbacks?.onOutput?.("\n--- Syncing results to Google Sheet ---\n");
      const summary = await syncSheetsForTabs(batch.tabs, resultsFile, engine);
      syncSummary.push(...summary);
      for (const line of summary) {
        callbacks?.onOutput?.(`${line}\n`);
      }
    }
  }

  return {
    exitCode,
    output,
    syncedTabs: [...syncedTabs],
    syncSummary,
  };
}

export function listMappedTabs(): E2eTabSuite[] {
  return getTabSuites();
}
