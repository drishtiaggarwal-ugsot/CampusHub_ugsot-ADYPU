import { NextResponse } from 'next/server';
import { getCurrentUser, getSessionIdToken } from '@/lib/auth';
import { firestoreSetDoc, isFirestoreAvailable } from '@/lib/db/firestore-rest';

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { fullName, courseYear, skills, interests, goals, githubUsername, skip } = body || {};

    const payload: Record<string, unknown> = {
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    if (!skip) {
      if (typeof fullName === 'string' && fullName.trim()) payload.full_name = fullName.trim();
      if (typeof courseYear === 'string' && courseYear.trim()) payload.course_year = courseYear.trim();
      if (Array.isArray(skills)) payload.skills = skills.map((s: unknown) => String(s).trim()).filter(Boolean);
      if (Array.isArray(interests)) payload.interests = interests.map((i: unknown) => String(i).trim()).filter(Boolean);
      if (Array.isArray(goals)) payload.goals = goals.map((g: unknown) => String(g).trim()).filter(Boolean);
      if (typeof githubUsername === 'string') {
        payload.github_username = githubUsername.trim().replace(/^@/, '') || null;
      }
    }

    const idToken = await getSessionIdToken();
    if (await isFirestoreAvailable(idToken)) {
      const res = await firestoreSetDoc('profiles', currentUser.id, payload, idToken, true);
      if (!res.ok) {
        console.warn('Profile update warning in onboarding:', res.error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
