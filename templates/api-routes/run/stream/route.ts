import { createRunStreamHandler } from "@6sense/sheet-e2e/next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export const POST = createRunStreamHandler();
