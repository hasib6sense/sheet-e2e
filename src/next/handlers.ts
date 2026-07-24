import { NextResponse } from "next/server";
import { clearConfigCache } from "../config";
import { fetchImplementedTestCasesWithMeta, fetchTabInfo } from "../google-sheets";
import { listMappedTabs, runE2eTests } from "../runner";
import type { E2eRunRequest } from "../types";

type StreamEvent =
  | { type: "start"; mode: string }
  | { type: "log"; text: string }
  | { type: "done"; exitCode: number; syncedTabs: string[]; syncSummary: string[] }
  | { type: "error"; message: string };

function validateBody(body: E2eRunRequest): string | null {
  if (body.mode !== "tabs" && body.mode !== "cases") {
    return "Invalid mode. Use 'tabs' or 'cases'.";
  }
  if (body.mode === "tabs" && (!body.tabs || !body.tabs.length)) {
    return "tabs array is required.";
  }
  if (body.mode === "cases" && (!body.cases || !body.cases.length)) {
    return "cases array is required.";
  }
  return null;
}

export function createCasesHandler() {
  return async function GET(request: Request) {
    try {
      clearConfigCache();
      const { searchParams } = new URL(request.url);
      const tabsParam = searchParams.get("tabs");
      const tabFilter = tabsParam
        ? tabsParam
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

      const [{ cases, warnings }, tabs] = await Promise.all([
        fetchImplementedTestCasesWithMeta(tabFilter),
        fetchTabInfo(),
      ]);

      return NextResponse.json({ cases, tabs, warnings });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
  };
}

export function createTabsHandler() {
  return async function GET() {
    try {
      clearConfigCache();
      const tabs = await fetchTabInfo();
      const mapped = listMappedTabs();
      return NextResponse.json({ tabs, mapped });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
  };
}

export function createRunHandler() {
  return async function POST(request: Request) {
    try {
      const body = (await request.json()) as E2eRunRequest;
      const validationError = validateBody(body);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const result = await runE2eTests(body);
      return NextResponse.json(result, { status: result.exitCode === 0 ? 200 : 422 });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
  };
}

export function createRunStreamHandler() {
  return async function POST(request: Request) {
    const body = (await request.json()) as E2eRunRequest;
    const validationError = validateBody(body);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), { status: 400 });
    }

    const encoder = new TextEncoder();
    const abort = new AbortController();
    const onClientAbort = () => abort.abort();
    request.signal.addEventListener("abort", onClientAbort);

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;

        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by cancel / disconnect */
          }
        };

        const send = (event: StreamEvent) => {
          if (closed || abort.signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            closed = true;
            abort.abort();
          }
        };

        try {
          send({ type: "start", mode: body.mode });

          const result = await runE2eTests(body, {
            onOutput: (text) => send({ type: "log", text }),
            signal: abort.signal,
          });

          if (!abort.signal.aborted) {
            send({
              type: "done",
              exitCode: result.exitCode,
              syncedTabs: result.syncedTabs,
              syncSummary: result.syncSummary,
            });
          }
        } catch (error) {
          if (!abort.signal.aborted) {
            send({ type: "error", message: (error as Error).message });
          }
        } finally {
          request.signal.removeEventListener("abort", onClientAbort);
          safeClose();
        }
      },
      cancel() {
        abort.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  };
}
