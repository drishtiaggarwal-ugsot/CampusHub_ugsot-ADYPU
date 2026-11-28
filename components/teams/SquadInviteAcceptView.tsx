'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TeamInvitation } from '@/lib/types';
import type { CurrentUser } from '@/lib/auth';

type Props = {
  invite: TeamInvitation;
  currentUser: CurrentUser | null;
};

export default function SquadInviteAcceptView({ invite, currentUser }: Props) {
  const [status, setStatus] = useState(invite.status);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isReceiver =
    currentUser &&
    (currentUser.id === invite.receiverId ||
      currentUser.email.toLowerCase() === invite.receiverEmail.toLowerCase());

  async function handleResponse(action: 'accept' | 'decline') {
    if (!currentUser) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/teams/invite/${invite.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update invitation');
      }

      setStatus(action === 'accept' ? 'accepted' : 'declined');
      if (action === 'accept') {
        setSuccessMsg(`🎉 You have officially joined team "${invite.teamName}"!`);
      } else {
        setSuccessMsg('You have declined this squad invitation.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error processing request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 580, margin: '24px auto', width: '100%' }}>
      <article
        className="card"
        style={{
          padding: 32,
          borderRadius: 20,
          border: '1px solid var(--border)',
          background: 'var(--canvas)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span
            style={{
              display: 'inline-flex',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--electric-blue)',
            }}
          >
            Squad-Up Invitation
          </span>
          <span style={{ fontSize: 13, color: 'var(--ink)', opacity: 0.6 }} className="mono">
            {new Date(invite.createdAt).toLocaleDateString()}
          </span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          {invite.teamName}
        </h1>

        {invite.eventTitle && (
          <p style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--electric-blue)', fontWeight: 600 }}>
            🏆 For: {invite.eventTitle}
          </p>
        )}

        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.7 }}>Invited by:</span>
            <strong>{invite.senderName} ({invite.senderEmail})</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ opacity: 0.7 }}>Recipient:</span>
            <strong>{invite.receiverName}</strong>
          </div>
          {invite.message && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 14, fontStyle: 'italic', opacity: 0.9 }}>
              &ldquo;{invite.message}&rdquo;
            </div>
          )}
        </div>

        {/* Status display */}
        {status === 'accepted' ? (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#059669',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>🎉 Squad Up Accepted!</h2>
            <p style={{ margin: 0, fontSize: 14 }}>
              You are an active member of <strong>{invite.teamName}</strong>. Check your event team page or notifications for updates.
            </p>
            <div style={{ marginTop: 16 }}>
              <Link href="/events" className="btn btn--dark" style={{ minHeight: 38, padding: '0 18px', fontSize: 13 }}>
                Go to Events
              </Link>
            </div>
          </div>
        ) : status === 'declined' ? (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--coral)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Invitation Declined</h2>
            <p style={{ margin: 0, fontSize: 13 }}>You declined the invitation to join this squad.</p>
          </div>
        ) : (
          <div>
            {successMsg && (
              <p style={{ color: '#059669', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>{successMsg}</p>
            )}
            {error && (
              <p style={{ color: 'var(--coral)', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>{error}</p>
            )}

            {currentUser ? (
              isReceiver ? (
                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleResponse('accept')}
                    className="btn btn--dark"
                    style={{ flex: 1, minHeight: 44, fontSize: 14, fontWeight: 700 }}
                  >
                    {submitting ? 'Joining squad...' : '🤝 Accept & Join Squad'}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleResponse('decline')}
                    className="btn btn--outline"
                    style={{ minHeight: 44, padding: '0 20px', fontSize: 14 }}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <div style={{ padding: 12, background: 'var(--panel)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', opacity: 0.8 }}>
                  <p style={{ margin: 0 }}>
                    You are signed in as <strong>{currentUser.email}</strong>. This invitation was addressed to <strong>{invite.receiverName}</strong>.
                  </p>
                </div>
              )
            ) : (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <p style={{ fontSize: 14, marginBottom: 14, opacity: 0.85 }}>
                  Sign in to accept this squad invitation and join the team.
                </p>
                <Link
                  href={`/auth/sign-in?redirect=${encodeURIComponent(`/squad-up/${invite.id}`)}`}
                  className="btn btn--dark"
                  style={{ minHeight: 42, padding: '0 24px', fontSize: 14, fontWeight: 700 }}
                >
                  Sign In with Google to Accept
                </Link>
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
