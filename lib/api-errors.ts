import { NextResponse } from 'next/server';

/**
 * Map common service error messages to accurate HTTP status codes without leaking internals.
 */
export function apiErrorResponse(err: unknown, fallbackMessage: string, defaultStatus = 500) {
  const message = err instanceof Error ? err.message : fallbackMessage;
  const lower = message.toLowerCase();

  let status = defaultStatus;
  if (lower.includes('unauthorized') || lower.includes('must be signed in') || lower.includes('sign in')) {
    status = 401;
  } else if (lower.includes('forbidden') || lower.includes('only ') || lower.includes('suspended') || lower.includes('eligible')) {
    status = 403;
  } else if (lower.includes('not found') || lower.includes('no longer exists')) {
    status = 404;
  } else if (lower.includes('rate limit') || lower.includes('cooldown')) {
    status = 429;
  } else if (lower.includes('required') || lower.includes('invalid') || lower.includes('already')) {
    status = 400;
  }

  return NextResponse.json({ error: message }, { status });
}
