'use client';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  type User,
} from 'firebase/auth';
import { app } from '@/lib/firebase';
import { AuthServiceError } from '@/lib/auth-types';

const auth = getAuth(app);

export async function syncSessionCookie(
  idToken: string,
  extra?: { name?: string; courseYear?: string },
): Promise<void> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, ...extra }),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { form?: string; error?: string } | null;
    throw new AuthServiceError(
      payload?.form || payload?.error || 'Could not establish your session. Please try again.',
      res.status,
    );
  }
}

export async function signInWithGoogleClient(): Promise<{ cancelled?: boolean }> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const credential = await signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken();
    await syncSessionCookie(idToken, {
      name: credential.user.displayName || undefined,
    });
    return {};
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) throw error;
    const code = (error as { code?: string } | null)?.code;

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { cancelled: true };
    }
    if (code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
      return { cancelled: true };
    }
    if (code === 'auth/unauthorized-domain') {
      throw new AuthServiceError(
        'This domain is not authorized for Google Sign-In in Firebase Console (Authentication → Settings → Authorized domains).',
        403,
      );
    }
    if (code === 'auth/operation-not-allowed') {
      throw new AuthServiceError(
        'Google Sign-In is disabled in Firebase Console. Enable Google under Authentication → Sign-in method.',
        403,
      );
    }
    if (code === 'auth/account-exists-with-different-credential') {
      throw new AuthServiceError(
        'An account already exists with this email using a different sign-in method.',
        400,
      );
    }
    throw new AuthServiceError('Google sign-in could not be completed. Please try again.', 400);
  }
}

export async function completeGoogleRedirectClient(): Promise<boolean> {
  try {
    const result = await getRedirectResult(auth);
    if (!result?.user) return false;
    const idToken = await result.user.getIdToken();
    await syncSessionCookie(idToken, {
      name: result.user.displayName || undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export async function signInWithEmailClient(email: string, password: string): Promise<void> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    const idToken = await credential.user.getIdToken();
    await syncSessionCookie(idToken);
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) throw error;
    const code = (error as { code?: string } | null)?.code;
    if (
      code === 'auth/user-not-found' ||
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-email'
    ) {
      throw new AuthServiceError('Email or password is incorrect. Please try again.', 400);
    }
    if (code === 'auth/user-disabled') {
      throw new AuthServiceError('This account has been disabled. Please contact support.', 403);
    }
    if (code === 'auth/too-many-requests') {
      throw new AuthServiceError('Too many failed attempts. Please wait a moment and try again.', 429);
    }
    throw new AuthServiceError("We couldn't sign you in. Check your details and try again.", 400);
  }
}

export async function signUpWithEmailClient(input: {
  name: string;
  email: string;
  password: string;
  courseYear: string;
}): Promise<void> {
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      input.email.trim().toLowerCase(),
      input.password,
    );
    if (input.name.trim()) {
      await updateProfile(credential.user, { displayName: input.name.trim() }).catch(() => {});
    }
    const idToken = await credential.user.getIdToken(true);
    await syncSessionCookie(idToken, {
      name: input.name.trim(),
      courseYear: input.courseYear,
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) throw error;
    const code = (error as { code?: string } | null)?.code;
    if (code === 'auth/email-already-in-use') {
      throw new AuthServiceError('An account with this email already exists. Try signing in.', 400);
    }
    if (code === 'auth/weak-password') {
      throw new AuthServiceError('Password is too weak. Use at least 8 characters.', 400);
    }
    throw new AuthServiceError("We couldn't create your account. Check your details and try again.", 400);
  }
}

export async function signOutClient(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch {
    // Continue clearing server session cookie
  }
  await fetch('/api/auth/sign-out', { method: 'POST' });
}

export function subscribeAuthTokenChanges(callback: (user: User | null) => void): () => void {
  return onIdTokenChanged(auth, callback);
}
