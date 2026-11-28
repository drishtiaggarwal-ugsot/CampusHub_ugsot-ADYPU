import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  ensureFirestoreProfile,
  verifyFirebaseIdToken,
} from '@/lib/auth';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    idToken?: unknown;
    name?: unknown;
    courseYear?: unknown;
  } | null;

  const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
  if (!idToken) {
    return NextResponse.json({ error: 'Missing Firebase ID token.' }, { status: 400 });
  }

  const verified = await verifyFirebaseIdToken(idToken);
  if (!verified || !verified.email) {
    return NextResponse.json({ error: 'Invalid or expired authentication token.' }, { status: 401 });
  }

  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : verified.name;
  const courseYear = typeof body?.courseYear === 'string' && body.courseYear.trim() ? body.courseYear.trim() : null;

  await ensureFirestoreProfile({
    uid: verified.uid,
    email: verified.email,
    name,
    courseYear,
    idToken,
  }).catch((err) => {
    console.warn('Could not sync profile to Firestore:', err);
  });

  const response = NextResponse.json({
    success: true,
    user: {
      id: verified.uid,
      email: verified.email,
      name: name || verified.email.split('@')[0],
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, idToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
