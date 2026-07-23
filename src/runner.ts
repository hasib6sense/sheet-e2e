import { spawn } from "node:child_process";
import { getResultsFile, getTabSuite, getTabSuites } from "./config";
import { syncSheetsForTabs } from "./google-sheets";
import type { E2eRunRequest, E2eRunResult, E2eTabSuite } from "./types";

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

  const args = rawArgs.map((a) => (opts.grep && a === opts.grep ? shellQuote(a) : a));
  teeOutput(`\n> npx ${args.join(" ")}\n\n`, opts.onOutput);

  return new Promise((resolve) => {
    if (opts.signal?.aborted) {
      resolve({ exitCode: 130, output: "\nAborted before Playwright started.\n" });
      return;
    }

    let output = "";
    let settled = false;
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      shell: true,
      env: { ...process.env, FORCE_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode, output });
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
      // Fallback if process ignores SIGTERM
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

type RunBatch = {
  specs: string[];
  project?: string;
  workers?: number;
  grep?: string;
  tabs: string[];
};

function batchesForTabs(tabs: string[]): RunBatch[] {
  const suites = tabs
    .map((tab) => getTabSuite(tab))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (!suites.length) {
    throw new Error(`No Playwright specs mapped for tabs: ${tabs.join(", ")}`);
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
      specs: [...new Set(group.flatMap((s) => s.specs))],
      project,
      tabs: group.map((s) => s.tab),
    });
  }

  for (const suite of serial) {
    batches.push({
      specs: suite.specs,
      project: suite.project,
      workers: suite.workers,
      tabs: [suite.tab],
    });
  }

  return batches;
}

function batchesForCases(cases: { tab: string; testCaseId: string }[]): RunBatch[] {
  const byTab = new Map<string, string[]>();
  for (const c of cases) {
    const list = byTab.get(c.tab) ?? [];
    list.push(c.testCaseId);
    byTab.set(c.tab, list);
  }

  const batches: RunBatch[] = [];

  for (const [tab, ids] of byTab) {
    const suite = getTabSuite(tab);
    if (!suite) {
      throw new Error(`Tab "${tab}" has no Playwright spec mapping.`);
    }
    batches.push({
      specs: suite.specs,
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
  const syncSheet = request.syncSheet !== false;
  let batches: RunBatch[];

  if (request.mode === "tabs") {
    if (!request.tabs.length) throw new Error("No tabs selected.");
    batches = batchesForTabs(request.tabs);
  } else {
    if (!request.cases.length) throw new Error("No test cases selected.");
    batches = batchesForCases(request.cases);
  }

  let exitCode = 0;
  let output = "";
  const syncedTabs = new Set<string>();
  const syncSummary: string[] = [];
  const resultsFile = getResultsFile();

  for (const batch of batches) {
    if (callbacks?.signal?.aborted) {
      exitCode = exitCode || 130;
      break;
    }

    const result = await runPlaywright(batch.specs, {
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
      const summary = await syncSheetsForTabs(batch.tabs, resultsFile);
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
