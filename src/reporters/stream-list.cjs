/**
 * Minimal Playwright reporter for the sheet-e2e UI stream.
 * Prints a running line on begin (list reporter skips this when not a TTY),
 * then pass/fail on end so the log can show spinner → tick.
 */
class StreamListReporter {
  constructor() {
    this._resultIndex = new Map();
    this._n = 0;
  }

  printsToStdio() {
    return true;
  }

  onTestBegin(test, result) {
    const index = String(++this._n);
    this._resultIndex.set(result, index);
    process.stdout.write(`  …  ${index} ${this._title(test)}\n`);
  }

  onTestEnd(test, result) {
    const index = this._resultIndex.get(result) ?? "?";
    const title = this._title(test);
    const retry = result.retry ? ` (retry #${result.retry})` : "";
    const duration =
      typeof result.duration === "number" ? ` (${this._ms(result.duration)})` : "";

    let mark = "✘";
    if (result.status === "passed") mark = "✓";
    else if (result.status === "skipped") mark = "-";

    process.stdout.write(`  ${mark}  ${index} ${title}${retry}${duration}\n`);
  }

  _title(test) {
    let project = "";
    try {
      project = test.parent?.project?.()?.name || "";
    } catch {
      project = "";
    }
    const pathTitle = (test.titlePath?.() || [test.title]).filter(Boolean).join(" › ");
    const file = test.location?.file
      ? require("node:path").relative(process.cwd(), test.location.file)
      : "";
    const loc =
      file && test.location
        ? `${file}:${test.location.line}:${test.location.column} › `
        : "";
    const projectBit = project ? `[${project}] › ` : "";
    return `${projectBit}${loc}${pathTitle}`;
  }

  _ms(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}

module.exports = StreamListReporter;
