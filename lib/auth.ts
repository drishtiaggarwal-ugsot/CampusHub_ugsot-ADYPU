import { createVerify } from 'node:crypto';
import { cookies } from 'next/headers';
import { firebaseConfig } from '@/lib/firebase';
import { AuthServiceError, type CurrentUser, type VerifiedFirebaseUser } from '@/lib/auth-types';
import { firestoreGetDoc, firestoreSetDoc, isFirestoreAvailable } from '@/lib/db/firestore-rest';

export type { CurrentUser, VerifiedFirebaseUser };
export { AuthServiceError };

export const SESSION_COOKIE_NAME = 'campushub_session';

export const ADMIN_EMAILS: readonly string[] = [
  'sahildehadray157@gmail.com',
];

export function isAdmin(user: CurrentUser | null): boolean {
  if (!user || !user.email) return false;
  return user.role === 'organizer' || ADMIN_EMAILS.includes(user.email.toLowerCase());
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1';

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google public certs: ${res.status}`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600_000;

  cachedCerts = { certs, expiresAt: now + maxAgeMs };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

function decodeBase64UrlBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(parts[0]);
    const payload = decodeBase64UrlJson<{
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    }>(parts[1]);

    const nowSec = Math.floor(Date.now() / 1000);
    const expectedIss = `https://securetoken.google.com/${firebaseConfig.projectId}`;

    if (
      header.alg !== 'RS256' ||
      !header.kid ||
      payload.aud !== firebaseConfig.projectId ||
      payload.iss !== expectedIss ||
      !payload.sub ||
      !payload.exp ||
      payload.exp <= nowSec
    ) {
      return null;
    }

    const certs = await getGooglePublicCerts();
    const cert = certs[header.kid];
    if (!cert) {
      return await verifyTokenViaIdentityToolkit(idToken);
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const signature = decodeBase64UrlBuffer(parts[2]);

    if (!verifier.verify(cert, signature)) {
      return null;
    }

    return {
      uid: payload.sub,
      email: (payload.email || '').trim().toLowerCase(),
      name: (payload.name || '').trim(),
      picture: payload.picture || null,
      emailVerified: Boolean(payload.email_verified),
    };
  } catch {
    return await verifyTokenViaIdentityToolkit(idToken);
  }
}

async function verifyTokenViaIdentityToolkit(idToken: string): Promise<VerifiedFirebaseUser | null> {
  try {
    const res = await fetch(
      `${IDENTITY_TOOLKIT_BASE}/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{
        localId: string;
        email?: string;
        displayName?: string;
        photoUrl?: string;
        emailVerified?: boolean;
      }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;

    return {
      uid: user.localId,
      email: (user.email || '').trim().toLowerCase(),
      name: (user.displayName || '').trim(),
      picture: user.photoUrl || null,
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

export async function getSessionIdToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  } catch {
    return null;
  }
}

export async function ensureFirestoreProfile(params: {
  uid: string;
  email: string;
  name?: string;
  courseYear?: string | null;
  idToken?: string;
}): Promise<void> {
  const available = await isFirestoreAvailable(params.idToken);
  if (!available) return;

  const existing = await firestoreGetDoc('profiles', params.uid, params.idToken);
  const fallbackName = params.name?.trim() || params.email.split('@')[0] || 'Student';
  const nowIso = new Date().toISOString();
  const isUserAdmin = ADMIN_EMAILS.includes(params.email.trim().toLowerCase());
  const assignedRole = isUserAdmin ? 'organizer' : 'student';

  if (!existing) {
    await firestoreSetDoc(
      'profiles',
      params.uid,
      {
        id: params.uid,
        email: params.email.trim().toLowerCase(),
        full_name: fallbackName,
        role: assignedRole,
        course_year: params.courseYear || null,
        github_username: null,
        skills: [],
        bio: null,
        interests: [],
        goals: [],
        onboarding_completed: false,
        is_profile_private: false,
        is_suspended: false,
        warning_count: 0,
        is_hidden_from_leaderboard: false,
        suspension_reason: null,
        dockers_count: 0,
        docking_count: 0,
        created_at: nowIso,
        updated_at: nowIso,
      },
      params.idToken,
      true,
    );
  } else if (isUserAdmin && existing.role !== 'organizer') {
    await firestoreSetDoc(
      'profiles',
      params.uid,
      {
        role: 'organizer',
        updated_at: nowIso,
      },
      params.idToken,
      true,
    );
  } else if (params.name?.trim() && !existing.full_name) {
    await firestoreSetDoc(
      'profiles',
      params.uid,
      {
        full_name: params.name.trim(),
        updated_at: nowIso,
      },
      params.idToken,
      true,
    );
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const idToken = await getSessionIdToken();
  if (!idToken) return null;

  const verified = await verifyFirebaseIdToken(idToken);
  if (!verified || !verified.email) return null;

  const fallbackName = verified.name || verified.email.split('@')[0] || 'Student';

  const isUserAdmin =
    ADMIN_EMAILS.includes(verified.email.toLowerCase());

  try {
    const available = await isFirestoreAvailable(idToken);
    if (available) {
      const profile = await firestoreGetDoc('profiles', verified.uid, idToken);
      if (profile) {
        const rawName = typeof profile.full_name === 'string' && profile.full_name.trim()
          ? profile.full_name.trim()
          : fallbackName;

        return {
          id: verified.uid,
          name: rawName,
          email: verified.email,
          role: isUserAdmin || profile.role === 'organizer' ? 'organizer' : 'student',
          githubUsername: typeof profile.github_username === 'string' ? profile.github_username : null,
          skills: Array.isArray(profile.skills) ? (profile.skills as string[]) : [],
          bio: typeof profile.bio === 'string' ? profile.bio : null,
          courseYear: typeof profile.course_year === 'string' ? profile.course_year : null,
          interests: Array.isArray(profile.interests) ? (profile.interests as string[]) : [],
          goals: Array.isArray(profile.goals) ? (profile.goals as string[]) : [],
          onboardingCompleted: Boolean(profile.onboarding_completed),
          isProfilePrivate: Boolean(profile.is_profile_private),
          isSuspended: Boolean(profile.is_suspended),
          warningCount: Number(profile.warning_count || 0),
        };
      }
    }
  } catch (error) {
    console.warn('Unable to load the signed-in profile from Firestore:', error);
  }

  return {
    id: verified.uid,
    name: fallbackName,
    email: verified.email,
    role: isUserAdmin ? 'organizer' : 'student',
    githubUsername: null,
    skills: [],
    bio: null,
    courseYear: null,
    interests: [],
    goals: [],
    onboardingCompleted: false,
    isProfilePrivate: false,
    isSuspended: false,
    warningCount: 0,
  };
}

export async function signIn(email: string, password: string): Promise<{ idToken: string }> {
  const res = await fetch(
    `${IDENTITY_TOOLKIT_BASE}/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        returnSecureToken: true,
      }),
      cache: 'no-store',
    },
  );

  const data = (await res.json().catch(() => null)) as {
    idToken?: string;
    localId?: string;
    email?: string;
    displayName?: string;
    error?: { message?: string };
  } | null;

  if (!res.ok || !data?.idToken) {
    const errMsg = data?.error?.message || '';
    if (errMsg.includes('USER_DISABLED')) {
      throw new AuthServiceError('This account has been disabled. Please contact support.', 403);
    }
    throw new AuthServiceError('Email or password is incorrect. Please try again.', 400);
  }

  if (data.localId && data.email) {
    await ensureFirestoreProfile({
      uid: data.localId,
      email: data.email,
      name: data.displayName,
      idToken: data.idToken,
    }).catch(() => {});
  }

  return { idToken: data.idToken };
}

export async function signUp(
  name: string,
  email: string,
  password: string,
  courseYear: string,
): Promise<{ confirmationRequired: boolean; idToken: string }> {
  const res = await fetch(
    `${IDENTITY_TOOLKIT_BASE}/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        displayName: name.trim(),
        returnSecureToken: true,
      }),
      cache: 'no-store',
    },
  );

  const data = (await res.json().catch(() => null)) as {
    idToken?: string;
    localId?: string;
    email?: string;
    error?: { message?: string };
  } | null;

  if (!res.ok || !data?.idToken || !data.localId) {
    const errMsg = data?.error?.message || '';
    if (errMsg.includes('EMAIL_EXISTS')) {
      throw new AuthServiceError('An account with this email already exists. Try signing in.', 400);
    }
    throw new AuthServiceError("We couldn't create your account. Check your details and try again.", 400);
  }

  await ensureFirestoreProfile({
    uid: data.localId,
    email: data.email || email,
    name,
    courseYear,
    idToken: data.idToken,
  }).catch(() => {});

  return { confirmationRequired: false, idToken: data.idToken };
}

export async function signOut(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Ignore outside request context
  }
}

export async function requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
  try {
    await fetch(
      `${IDENTITY_TOOLKIT_BASE}/accounts:sendOobCode?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: email.trim().toLowerCase(),
          ...(redirectTo ? { continueUrl: redirectTo } : {}),
        }),
        cache: 'no-store',
      },
    );
  } catch {
    // Do not expose whether the email exists
  }
}

export async function updatePassword(password: string): Promise<{ idToken?: string }> {
  const idToken = await getSessionIdToken();
  if (!idToken) {
    throw new AuthServiceError('No user is currently signed in.', 401);
  }

  const res = await fetch(
    `${IDENTITY_TOOLKIT_BASE}/accounts:update?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        password,
        returnSecureToken: true,
      }),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    throw new AuthServiceError("We couldn't update your password. Please try again.", 400);
  }

  const data = (await res.json().catch(() => null)) as { idToken?: string } | null;
  return { idToken: data?.idToken };
}
