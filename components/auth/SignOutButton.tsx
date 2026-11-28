'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOutClient } from '@/lib/auth-client';

export default function SignOutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSignOut() {
    setSubmitting(true);
    setError('');
    try {
      await signOutClient();
      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not sign out. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-signout">
      <button type="button" className="btn btn--outline" onClick={handleSignOut} disabled={submitting}>
        {submitting ? 'Signing out…' : 'Sign out'}
      </button>
      {error && <span role="alert" className="form-error">{error}</span>}
    </div>
  );
}
