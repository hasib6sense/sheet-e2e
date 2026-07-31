/** Remove ANSI SGR / OSC sequences from Playwright terminal output. */
export function stripAnsi(text: string): string {
  return String(text)
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\u001b\[[0-9;]*$/g, "")
    .replace(/\[[0-9;]*m/g, "");
}

function truncateComment(text: string, max = 450): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 3)}...`;
}

function meaningfulLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith("Call log:") &&
        !/^at /.test(l) &&
        !/^\d+\s*\|/.test(l) &&
        !/^>/.test(l),
    );
}

/**
 * Plain-text failure reason for sheet Comment column and e2e-runner table.
 * Strips ANSI codes and collapses Playwright noise into one readable sentence.
 * Never falls back to the test title — that looks like a sync bug in the Comment column.
 */
export function formatErrorForSheet(error: string, _title?: string): string {
  const raw = stripAnsi(error || "").trim();
  if (!raw) return "Unknown failure";

  const didNotRun = raw.match(/^(Did not run[^\n:]*(?::\s*)?)/i)?.[1]?.trim() ?? "";
  const body = didNotRun ? raw.slice(didNotRun.length).trim() : raw;
  const prefix = didNotRun ? `${didNotRun.replace(/:\s*$/, "")}: ` : "";

  const failLine = body.match(/FAIL:[^\n]+/) || raw.match(/FAIL:[^\n]+/);
  if (failLine) return truncateComment(`${prefix}${failLine[0]}`);

  const precondition = body.match(/Precondition not met:[^\n]+/);
  if (precondition) return truncateComment(`${prefix}FAIL: ${precondition[0]}`);

  const timeout = body.match(/TimeoutError:[^\n]+/);
  if (timeout) {
    const waiting = body.match(/waiting for ([^\n]+)/)?.[1]?.trim();
    if (waiting) {
      return truncateComment(`${prefix}${timeout[0].trim()} — waiting for ${waiting}`);
    }
    return truncateComment(`${prefix}${timeout[0].trim()}`);
  }

  const expectedPattern = body.match(/Expected pattern:\s*([^\n]+)/)?.[1]?.trim();
  const expectedValue = body.match(/Expected(?: pattern)?:\s*([^\n]+)/)?.[1]?.trim();
  const received = body.match(/Received(?: string)?:\s*([^\n]+)/)?.[1]?.trim();
  const locator = body.match(/Locator:\s*([^\n]+)/)?.[1]?.trim();

  if (expectedPattern && received) {
    return truncateComment(`${prefix}Expected ${expectedPattern}, got ${received}`);
  }

  if (locator && expectedValue && received) {
    return truncateComment(
      `${prefix}Assertion failed on ${locator} — expected ${expectedValue}, got ${received}`,
    );
  }

  if (locator && expectedValue) {
    return truncateComment(`${prefix}Assertion failed on ${locator} — expected ${expectedValue}`);
  }

  if (expectedValue && received) {
    return truncateComment(`${prefix}Expected ${expectedValue}, got ${received}`);
  }

  if (/^Error:\s*expect\(/.test(body) || body.includes("expect(")) {
    const headline = meaningfulLines(body)[0];
    if (headline) return truncateComment(`${prefix}${headline.replace(/^Error:\s*/, "")}`);
  }

  const lines = meaningfulLines(body);
  if (lines[0]) return truncateComment(`${prefix}${lines[0]}`);

  if (didNotRun) return truncateComment(didNotRun.replace(/:\s*$/, ""));
  return "Unknown failure";
}
