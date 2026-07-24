import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional gate for /e2e-runner and /api/e2e.
 * Scaffolded by @6sense/sheet-e2e init.
 *
 * Enable in production with E2E_RUNNER_ENABLED=1 (or keep disabled).
 * Merge this matcher into your existing middleware if you already have one.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isE2e =
    path.startsWith("/e2e-runner") || path.startsWith("/api/e2e");

  if (!isE2e) return NextResponse.next();

  if (process.env.NODE_ENV === "production" && process.env.E2E_RUNNER_ENABLED !== "1") {
    return new NextResponse("E2E runner disabled", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/e2e-runner/:path*", "/api/e2e/:path*"],
};
