import { NextResponse } from 'next/server';
import { AuthServiceError, SESSION_COOKIE_NAME, signIn } from '@/lib/auth';
import { isStringRecord, validateSignIn } from '@/lib/validation';

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isStringRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ form: 'Enter your email address and password.' }, { status: 400 });
  }

  const errors = validateSignIn({ email: body.email, password: body.password });
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 400 });

  try {
    const { idToken } = await signIn(body.email, body.password);
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, idToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json({ form: error.message }, { status: error.status });
    }
    console.error('Unable to sign in with Firebase.', error);
    return NextResponse.json({ form: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
