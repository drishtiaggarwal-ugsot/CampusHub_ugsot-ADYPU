import { NextResponse } from 'next/server';
import { updatePassword, AuthServiceError, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const password = body?.password;

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const { idToken } = await updatePassword(password);
    const response = NextResponse.json({ success: true });
    if (idToken) {
      response.cookies.set(SESSION_COOKIE_NAME, idToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return response;
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to update password.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
