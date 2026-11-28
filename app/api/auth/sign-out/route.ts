import { NextResponse } from 'next/server';
import { AuthServiceError, SESSION_COOKIE_NAME, signOut } from '@/lib/auth';

export async function POST() {
  try {
    await signOut();
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json({ form: error.message }, { status: error.status });
    }
    console.error('Unable to sign out from Firebase.', error);
    return NextResponse.json({ form: 'Sign out is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
