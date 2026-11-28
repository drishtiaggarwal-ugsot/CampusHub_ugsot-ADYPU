'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeAuthTokenChanges, syncSessionCookie } from '@/lib/auth-client';

export default function AuthSessionSync({ hasSession }: { hasSession: boolean }) {
  const router = useRouter();
  const sessionActiveRef = useRef(hasSession);
  const refreshedRef = useRef(false);

  useEffect(() => {
    sessionActiveRef.current = hasSession;
  }, [hasSession]);

  useEffect(() => {
    const unsubscribe = subscribeAuthTokenChanges(async (user) => {
      if (!user) {
        return;
      }

      // If user is already authenticated on server (hasSession = true),
      // avoid re-triggering router.refresh() which causes an infinite reload loop.
      if (sessionActiveRef.current) {
        return;
      }

      if (refreshedRef.current) {
        return;
      }

      try {
        const idToken = await user.getIdToken();
        await syncSessionCookie(idToken, {
          name: user.displayName || undefined,
        });

        refreshedRef.current = true;
        sessionActiveRef.current = true;
        router.refresh();
      } catch {
        // Ignore background refresh errors
      }
    });

    return unsubscribe;
  }, [router]);

  return null;
}

