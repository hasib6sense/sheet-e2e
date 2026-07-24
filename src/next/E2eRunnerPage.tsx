"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { E2eTabInfo, E2eTestCase } from "../types";
import { formatErrorForSheet } from "../format-error";
import { cn } from "./cn";
import { ModuleMultiSelect } from "./components/ModuleMultiSelect";
import { RunOutputPanel } from "./components/RunOutputPanel";
import { Checkbox } from "./components/Checkbox";

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "passed") return "bg-emerald-100 text-emerald-800";
  if (s === "failed") return "bg-red-100 text-red-800";
  return "bg-neutral-100 text-neutral-700";
}

function IconPlay({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function IconSpinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={cn("h-4 w-4 shrink-0 animate-spin", className)}
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

function IconXCircle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

function IconFlask({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-6 w-6 shrink-0 text-neutral-700", className)}
    >
      <path d="M10 2v7.53a4 4 0 0 1-.8 2.34L5.4 17.4A2 2 0 0 0 7 20.6h10a2 2 0 0 0 1.6-3.2l-3.8-5.53A4 4 0 0 1 14 9.53V2" />
      <path d="M8.5 2h7" />
    </svg>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  variant = "default",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "dark" | "danger" | "ghost";
  className?: string;
  title?: string;
}) {
  // Inline colors so Run buttons stay visible even if the host Tailwind
  // content paths do not scan this package (common after git install).
  const variants = {
    default:
      "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50",
    dark: "border border-neutral-900 text-white hover:opacity-90",
    danger: "border border-red-600 text-white hover:opacity-90",
    ghost:
      "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100",
  };
  const inlineStyle =
    variant === "dark"
      ? { backgroundColor: "#171717", color: "#fff" }
      : variant === "danger"
        ? { backgroundColor: "#dc2626", color: "#fff" }
        : undefined;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={inlineStyle}
      className={cn(
        "inline-flex h-9 flex-row flex-nowrap items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function E2eRunnerPage() {
  const [cases, setCases] = useState<E2eTestCase[]>([]);
  const [tabs, setTabs] = useState<E2eTabInfo[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [syncSheet, setSyncSheet] = useState(true);
  const [runLog, setRunLog] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [lastExitCode, setLastExitCode] = useState<number | null>(null);
  const [logDismissed, setLogDismissed] = useState(false);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/e2e/cases");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load test cases");
      setCases(data.cases ?? []);
      setTabs(data.tabs ?? []);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!tabs.length) return;
    setSelectedModules((prev) => {
      const valid = prev.filter((m) => tabs.some((t) => t.name === m));
      if (valid.length) return valid;
      return [tabs[0].name];
    });
  }, [tabs]);

  const moduleSet = useMemo(() => new Set(selectedModules), [selectedModules]);

  const moduleOptions = useMemo(
    () =>
      tabs.map((tab) => ({
        value: tab.name,
        label: tab.name,
        count: tab.implementedCount,
      })),
    [tabs],
  );

  const activeTabs = useMemo(
    () => tabs.filter((t) => moduleSet.has(t.name)),
    [tabs, moduleSet],
  );

  const moduleCases = useMemo(
    () => cases.filter((c) => moduleSet.has(c.tab)),
    [cases, moduleSet],
  );

  const showModuleColumn = selectedModules.length > 1;

  const visibleCases = useMemo(() => {
    if (!search.trim()) return moduleCases;
    const q = search.trim().toLowerCase();
    return moduleCases.filter(
      (c) =>
        c.testCaseId.toLowerCase().includes(q) ||
        c.testCase.toLowerCase().includes(q) ||
        c.tab.toLowerCase().includes(q) ||
        c.uiStatus.toLowerCase().includes(q),
    );
  }, [moduleCases, search]);

  const checkedInView = useMemo(
    () => moduleCases.filter((c) => checked.has(c.id)),
    [moduleCases, checked],
  );

  const failedInModules = useMemo(
    () =>
      moduleCases.filter(
        (c) => c.runnable && c.uiStatus.trim().toLowerCase() === "failed",
      ),
    [moduleCases],
  );

  const allVisibleChecked =
    visibleCases.length > 0 && visibleCases.every((c) => checked.has(c.id));

  const handleModulesChange = (modules: string[]) => {
    setSelectedModules(modules);
    setChecked((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const tc = cases.find((c) => c.id === id);
        if (tc && modules.includes(tc.tab)) next.add(id);
      }
      return next;
    });
  };

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCheckAllVisible = () => {
    if (allVisibleChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        for (const c of visibleCases) next.delete(c.id);
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        for (const c of visibleCases) next.add(c.id);
        return next;
      });
    }
  };

  const appendLog = (text: string) => {
    setRunLog((prev) => prev + text);
  };

  const executeRun = async (
    label: string,
    body: {
      mode: "tabs" | "cases";
      tabs?: string[];
      cases?: { tab: string; testCaseId: string }[];
    },
  ) => {
    setRunning(true);
    setRunLog("");
    setRunLabel(label);
    setLastExitCode(null);
    setLogDismissed(false);
    setError(null);
    appendLog(`${label}\n`);

    try {
      const res = await fetch("/api/e2e/run/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, syncSheet }),
      });

      if (!res.ok && !res.body) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Run failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream from server");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            text?: string;
            message?: string;
            exitCode?: number;
          };

          if (event.type === "log" && event.text) {
            appendLog(event.text);
          } else if (event.type === "error") {
            const msg = event.message ?? "Unknown error";
            appendLog(`\nError: ${msg}\n`);
            setError(msg);
          } else if (event.type === "done") {
            const code = event.exitCode ?? 1;
            setLastExitCode(code);
            appendLog(`\nExit code: ${code}\n`);
          }
        }
      }

      await loadCases();
      setChecked(new Set());
    } catch (err) {
      appendLog(`\nRequest failed: ${(err as Error).message}\n`);
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const runAllInModules = () => {
    if (!selectedModules.length) return;
    const label =
      selectedModules.length === 1
        ? `Running all tests in ${selectedModules[0]}…`
        : `Running all tests in ${selectedModules.join(", ")}…`;
    void executeRun(label, { mode: "tabs", tabs: selectedModules });
  };

  const runChecked = () => {
    if (!checkedInView.length) return;
    void executeRun(`Running ${checkedInView.length} checked test(s)…`, {
      mode: "cases",
      cases: checkedInView.map((c) => ({ tab: c.tab, testCaseId: c.testCaseId })),
    });
  };

  const runFailed = () => {
    if (!failedInModules.length) return;
    const label =
      selectedModules.length === 1
        ? `Running ${failedInModules.length} failed test(s) in ${selectedModules[0]}…`
        : `Running ${failedInModules.length} failed test(s) across ${selectedModules.length} modules…`;
    void executeRun(label, {
      mode: "cases",
      cases: failedInModules.map((c) => ({ tab: c.tab, testCaseId: c.testCaseId })),
    });
  };

  const runOne = (tc: E2eTestCase) => {
    void executeRun(`Running ${tc.testCaseId} (${tc.tab})…`, {
      mode: "cases",
      cases: [{ tab: tc.tab, testCaseId: tc.testCaseId }],
    });
  };

  const colSpan = showModuleColumn ? 8 : 7;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <IconFlask />
          <div>
            <h1 className="text-xl font-semibold">E2E Test Runner</h1>
            <p className="text-sm text-neutral-500">
              Select module(s), run Playwright tests, sync results to the sheet
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Sheet warnings (status may show as — until fixed)</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="mb-3 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative z-10 min-w-[220px] flex-1">
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Modules</label>
              <ModuleMultiSelect
                options={moduleOptions}
                value={selectedModules}
                onChange={handleModulesChange}
                onOpenChange={setModulePickerOpen}
                disabled={!tabs.length || running}
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Search</label>
              <input
                placeholder="TC ID, title, module…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!selectedModules.length}
                className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm shadow-sm disabled:opacity-50"
              />
            </div>

            <div className="flex items-center gap-3 pb-0.5">
              <label
                className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600"
                onClick={(e) => {
                  e.preventDefault();
                  setSyncSheet((v) => !v);
                }}
              >
                <Checkbox checked={syncSheet} onCheckedChange={setSyncSheet} />
                Sync sheet after run
              </label>
              <Btn
                variant="ghost"
                className="h-9 w-9 px-0"
                onClick={() => void loadCases()}
                disabled={loading || running}
                title="Refresh"
              >
                {loading ? <IconSpinner /> : <IconRefresh />}
              </Btn>
            </div>
          </div>
        </section>

        <div className="relative z-0 mb-3 flex flex-wrap items-center gap-2">
          <Btn
            variant="dark"
            disabled={running || !selectedModules.length}
            onClick={runAllInModules}
          >
            {running ? <IconSpinner /> : <IconPlay />}
            <span>
              Run all
              {selectedModules.length === 1
                ? ` in ${selectedModules[0]}`
                : ` (${selectedModules.length} modules)`}
            </span>
          </Btn>

          <Btn
            variant={failedInModules.length > 0 ? "danger" : "ghost"}
            disabled={running || failedInModules.length === 0}
            onClick={runFailed}
            title={
              failedInModules.length === 0
                ? "No failed tests in the selected module(s)"
                : `Re-run ${failedInModules.length} test(s) with UI Status Failed`
            }
          >
            <IconXCircle />
            <span>
              Run failed
              {failedInModules.length > 0 ? ` (${failedInModules.length})` : ""}
            </span>
          </Btn>

          <span className="text-sm text-neutral-500">
            {visibleCases.length === moduleCases.length
              ? `${visibleCases.length} tests shown`
              : `${visibleCases.length} of ${moduleCases.length} tests shown`}
            {failedInModules.length > 0 ? ` · ${failedInModules.length} failed` : ""}
          </span>

          <Btn
            className="ml-auto"
            variant={checkedInView.length > 0 ? "dark" : "ghost"}
            disabled={running || checkedInView.length === 0}
            onClick={runChecked}
          >
            <IconPlay />
            <span>
              Run checked
              {checkedInView.length > 0 ? ` (${checkedInView.length})` : ""}
            </span>
          </Btn>
        </div>

        {activeTabs.length > 0 && !modulePickerOpen && (
          <p className="mb-3 text-xs text-neutral-500">
            {activeTabs.map((t) => `${t.name} → ${t.specFiles.join(", ")}`).join(" · ")}
          </p>
        )}

        {!logDismissed && (
          <RunOutputPanel
            running={running}
            runLog={runLog}
            runLabel={runLabel}
            exitCode={lastExitCode}
            onDismiss={() => setLogDismissed(true)}
          />
        )}

        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="w-10 px-3 py-3">
                  <Checkbox
                    checked={allVisibleChecked}
                    disabled={!visibleCases.length || running}
                    onCheckedChange={() => toggleCheckAllVisible()}
                    aria-label="Select all visible tests"
                  />
                </th>
                {showModuleColumn && <th className="w-28 px-3 py-3">Module</th>}
                <th className="w-24 px-3 py-3">TC ID</th>
                <th className="px-3 py-3">Test case</th>
                <th className="w-24 px-3 py-3">UI Status</th>
                <th className="w-28 px-3 py-3">Playwright</th>
                <th className="min-w-32 px-3 py-3">Comment</th>
                <th className="w-20 px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && !visibleCases.length ? (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-12 text-center text-neutral-500">
                    Loading tests…
                  </td>
                </tr>
              ) : !selectedModules.length ? (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-12 text-center text-neutral-500">
                    Select at least one module to view tests.
                  </td>
                </tr>
              ) : visibleCases.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-12 text-center text-neutral-500">
                    No tests match your search.
                  </td>
                </tr>
              ) : (
                visibleCases.map((tc) => (
                  <tr key={tc.id} className="border-b last:border-0 hover:bg-neutral-50/80">
                    <td className="px-3 py-2 align-middle">
                      <Checkbox
                        checked={checked.has(tc.id)}
                        disabled={running}
                        onCheckedChange={() => toggleCheck(tc.id)}
                        aria-label={`Select ${tc.testCaseId}`}
                      />
                    </td>
                    {showModuleColumn && (
                      <td className="px-3 py-2 text-xs font-medium">{tc.tab}</td>
                    )}
                    <td className="px-3 py-2 font-mono text-xs font-medium">{tc.testCaseId}</td>
                    <td className="px-3 py-2" title={tc.testCase}>
                      {tc.testCase}
                    </td>
                    <td className="px-3 py-2">
                      {tc.uiStatus ? (
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                            statusClass(tc.uiStatus),
                          )}
                        >
                          {tc.uiStatus}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{tc.playwright || "—"}</td>
                    <td className="max-w-md px-3 py-2 text-xs text-neutral-600" title={tc.comment}>
                      {tc.comment ? formatErrorForSheet(tc.comment) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Btn
                        variant="ghost"
                        className="h-8 px-2.5 text-xs"
                        disabled={running}
                        onClick={() => runOne(tc)}
                      >
                        {running ? <IconSpinner className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
                        <span>Run</span>
                      </Btn>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default E2eRunnerPage;
