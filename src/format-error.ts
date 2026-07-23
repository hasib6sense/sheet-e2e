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
 */
export function formatErrorForSheet(error: string, title?: string): string {
  const raw = stripAnsi(error || title || "Unknown failure");

  const failLine = raw.match(/FAIL:[^\n]+/);
  if (failLine) return truncateComment(failLine[0]);

  const precondition = raw.match(/Precondition not met:[^\n]+/);
  if (precondition) return truncateComment(`FAIL: ${precondition[0]}`);

  const timeout = raw.match(/TimeoutError:[^\n]+/);
  if (timeout) {
    const waiting = raw.match(/waiting for ([^\n]+)/)?.[1]?.trim();
    if (waiting) {
      return truncateComment(`${timeout[0].trim()} — waiting for ${waiting}`);
    }
    return truncateComment(timeout[0].trim());
  }

  const locator = raw.match(/Locator:\s*([^\n]+)/)?.[1]?.trim();
  const expected = raw.match(/Expected(?: pattern)?:\s*([^\n]+)/)?.[1]?.trim();
  const received = raw.match(/Received(?: string)?:\s*([^\n]+)/)?.[1]?.trim();

  if (locator && expected && received) {
    return truncateComment(
      `Assertion failed on ${locator} — expected ${expected}, got ${received}`,
    );
  }

  if (locator && expected) {
    return truncateComment(`Assertion failed on ${locator} — expected ${expected}`);
  }

  if (/^Error:\s*expect\(/.test(raw) || raw.includes("expect(")) {
    const headline = meaningfulLines(raw)[0];
    if (headline) return truncateComment(headline.replace(/^Error:\s*/, ""));
  }

  const lines = meaningfulLines(raw);
  if (lines[0]) return truncateComment(lines[0]);

  return truncateComment(title || "Test failed");
}
