'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { RegisteredEventWithTeam, MyEventRegistration } from '@/lib/db/events';
import type { Student } from '@/lib/types';
import Avatar from '../Avatar';

type Props = {
  isOpen: boolean;
  targetStudent: Student | { id: string; name: string; email?: string; skills?: string[] } | null;
  currentUserEmail?: string | null;
  registrations?: MyEventRegistration[];
  registrationsError?: string;
  onClose: () => void;
  onInviteSent?: (shareUrl: string) => void;
};

export default function SquadUpModal(props: Props) {
  if (!props.isOpen || !props.targetStudent) return null;
  return (
    <SquadUpModalInner
      key={props.targetStudent.id}
      targetStudent={props.targetStudent}
      currentUserEmail={props.currentUserEmail}
      registrationsError={props.registrationsError}
      onClose={props.onClose}
      onInviteSent={props.onInviteSent}
    />
  );
}

function SquadUpModalInner({
  targetStudent,
  currentUserEmail,
  registrationsError = '',
  onClose,
  onInviteSent,
}: {
  targetStudent: NonNullable<Props['targetStudent']>;
  currentUserEmail?: string | null;
  registrationsError?: string;
  onClose: () => void;
  onInviteSent?: (shareUrl: string) => void;
}) {
  const [registeredEvents, setRegisteredEvents] = useState<RegisteredEventWithTeam[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadEventsError, setLoadEventsError] = useState(registrationsError);
  const [reloadKey, setReloadKey] = useState(0);
  const [eventChoice, setEventChoice] = useState('');
  const [teamName, setTeamName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdShareUrl, setCreatedShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Effect for keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Fetch registered events from API - this is the reliable source of truth
  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingEvents(true);
      setLoadEventsError('');
      try {
        const res = await fetch('/api/events/my-registrations', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Unable to load your registered events.');
        }
        const list = (data.registeredEvents ?? []) as RegisteredEventWithTeam[];
        if (!active) return;
        setRegisteredEvents(list);
        if (list.length > 0) {
          const first = list[0];
          setEventChoice((prev) => prev || first.eventId);
          setTeamName((prev) => prev || first.team?.name || '');
        }
      } catch (err) {
        if (!active) return;
        setLoadEventsError(err instanceof Error ? err.message : 'Unable to load your registered events.');
      } finally {
        if (active) {
          setLoadingEvents(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUserEmail, reloadKey]);

  const selectedEvent = registeredEvents.find((ev) => ev.eventId === eventChoice);
  const lockedTeamName = selectedEvent?.team?.name || '';

  function handleEventChange(nextEventId: string) {
    setEventChoice(nextEventId);
    const matched = registeredEvents.find((ev) => ev.eventId === nextEventId);
    setTeamName(matched?.team?.name || '');
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!targetStudent) return;
    if (!selectedEvent) {
      setError('Register for an event first before forming a team or sending an invite.');
      return;
    }

    const effectiveTeamName = (lockedTeamName || teamName).trim();
    if (!effectiveTeamName) {
      setError('Please provide a name for your team or squad.');
      return;
    }

    setSubmitting(true);
    setError('');

    const targetEmail =
      ('email' in targetStudent && targetStudent.email) ||
      `${targetStudent.id}@adypu.edu.in`;

    if (currentUserEmail && targetEmail.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) {
      setError('You cannot send a team invitation to yourself.');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/teams/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedEvent.team?.id || null,
          teamName: effectiveTeamName,
          eventId: selectedEvent.eventId,
          eventTitle: selectedEvent.title,
          receiverId: targetStudent.id,
          receiverName: targetStudent.name,
          receiverEmail: targetEmail,
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send squad invitation');
      }

      const shareLink = data.shareUrl || `${window.location.origin}/squad-up/${data.id}`;
      setCreatedShareUrl(shareLink);

      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareLink).catch(() => {});
      }

      onInviteSent?.(shareLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sending invite');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    if (!createdShareUrl) return;
    navigator.clipboard.writeText(createdShareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="squadup-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--canvas)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          padding: 24,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--electric-blue)' }}>SQUAD UP · TEAM INVITE</span>
            <h2 id="squadup-title" style={{ fontSize: 20, margin: '4px 0 0', fontWeight: 700 }}>
              Invite {targetStudent.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              color: 'var(--ink)',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Target summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            background: 'var(--panel)',
            borderRadius: 12,
            marginBottom: 16,
            border: '1px solid var(--border)',
          }}
        >
          <Avatar studentId={targetStudent.id} name={targetStudent.name} size="md" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: 14 }}>{targetStudent.name}</strong>
            {targetStudent.skills && (
              <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.8 }} className="mono">
                {targetStudent.skills.slice(0, 4).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {createdShareUrl ? (
          <div>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#059669',
                padding: 14,
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>🎉 Squad Invitation Created!</h3>
              <p style={{ margin: 0, fontSize: 13 }}>
                We notified {targetStudent.name}. They can accept or decline using this invite link:
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input
                type="text"
                readOnly
                value={createdShareUrl}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontSize: 13,
                  color: 'var(--ink)',
                }}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn--dark"
                style={{ minHeight: 38, fontSize: 13, padding: '0 16px' }}
              >
                {copied ? 'Copied! ✓' : 'Copy link'}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn--outline"
              style={{ width: '100%', minHeight: 40 }}
            >
              Done
            </button>
          </div>
        ) : !currentUserEmail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 14, color: 'var(--coral)', margin: 0 }}>
              ⚠️ Sign in and register for an event first before sending team invites.
            </p>
            <Link href="/auth/sign-in" className="btn btn--primary" onClick={onClose}>
              Sign in to continue
            </Link>
          </div>
        ) : loadingEvents ? (
          <p className="muted-note" style={{ margin: 0 }}>Checking your registered events…</p>
        ) : loadEventsError ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="form-error" style={{ margin: 0 }}>{loadEventsError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadEventsError('');
                setReloadKey((k) => k + 1);
              }}
              className="btn btn--outline"
              style={{ alignSelf: 'flex-start', minHeight: 34, fontSize: 13 }}
            >
              🔄 Retry
            </button>
          </div>
        ) : registeredEvents.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              <strong>Register for an event first</strong> before forming a team or inviting teammates.
            </p>
            <p className="muted-note" style={{ margin: 0 }}>
              Step 1: Register for any event on CampusHub. Step 2: Form your team with a team name and invite peers.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/events" className="btn btn--primary" onClick={onClose}>
                Browse &amp; Register for Events
              </Link>
              <button type="button" onClick={onClose} className="btn btn--outline">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="event-choice" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Your Registered Event <span style={{ color: 'var(--coral)' }}>*</span>
              </label>
              <select
                id="event-choice"
                value={eventChoice}
                onChange={(e) => handleEventChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              >
                {registeredEvents.map((ev) => (
                  <option key={ev.eventId} value={ev.eventId}>
                    {ev.title}{ev.team ? ` (Team: ${ev.team.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="team-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Team / Squad Name <span style={{ color: 'var(--coral)' }}>*</span>
              </label>
              <input
                id="team-name"
                type="text"
                required
                maxLength={80}
                readOnly={Boolean(lockedTeamName)}
                placeholder="e.g. Quantum Rogues, DevDynasty"
                value={lockedTeamName || teamName}
                onChange={(e) => setTeamName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: lockedTeamName ? 'var(--panel)' : 'var(--canvas)',
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              />
              {lockedTeamName ? (
                <p className="muted-note" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Inviting into your existing team for this event.
                </p>
              ) : (
                <p className="muted-note" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  This creates your team for the selected event and sends the invite.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="invite-msg" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Personal Message (Optional)
              </label>
              <textarea
                id="invite-msg"
                rows={3}
                placeholder="Hey! Saw your profile & skills, would love to team up for this event."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  resize: 'vertical',
                }}
              />
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--coral)', fontWeight: 600 }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn--outline"
                style={{ flex: 1, minHeight: 42 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn--primary"
                style={{ flex: 2, minHeight: 42, fontWeight: 700 }}
              >
                {submitting ? 'Sending Invite…' : 'Send Squad Invite →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
