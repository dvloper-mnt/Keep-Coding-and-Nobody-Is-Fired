import { NextResponse } from 'next/server';

const IS_DEV = process.env.NODE_ENV !== 'production';

// React's dev build uses eval() for debugging (hot reload, callstacks); it
// never does in production. So 'unsafe-eval' is allowed ONLY in development —
// production keeps the strict policy. 'unsafe-inline' on scripts is needed by
// Next's bootstrap inline script in both modes.
const SCRIPT_SRC = IS_DEV
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

// Baseline security headers on every response. The app is served over HTTPS
// behind the ALB, so HSTS is safe; the CSP is tight because the game ships no
// third-party scripts and inlines its own styles via Tailwind.
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    SCRIPT_SRC,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

export function proxy() {
  const response = NextResponse.next();

  // Only apply strict security headers (incl. tight CSP) in production.
  // In development (pnpm dev) we skip it so React can use eval() for
  // call stack reconstruction, Fast Refresh, error overlays, etc.
  if (process.env.NODE_ENV === 'production') {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
  }

  return response;
}

// Apply to everything except Next's static assets (no headers needed there).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
