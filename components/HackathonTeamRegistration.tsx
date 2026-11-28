'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { HackathonTeam } from '@/lib/db/events';
import type { Student, TeamInvitation } from '@/lib/types';

type Props = {
  eventId: string;
  eventTitle?: string;
  registrationDeadline: string;
  registrationClosed: boolean;
  isRegistered?: boolean;
  teamSizeMin: number;
  teamSizeMax: number;
  teams: HackathonTeam[];
  studentsLookingForTeam: Student[];
  invitableStudents?: Student[];
  receivedInvites?: TeamInvitation[];
  sentInvites?: TeamInvitation[];
  currentUserEmail: string | null;
};

function readFormError(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('form' in payload)) return null;
  return typeof payload.form === 'string' ? payload.form : null;
}

export default function HackathonTeamRegistration({
  eventId,
  eventTitle = '',
  registrationDeadline,
  registrationClosed,
  isRegistered = false,
  teamSizeMin,
  teamSizeMax,
  teams,
  studentsLookingForTeam,
  invitableStudents = [],
  receivedInvites = [],
  sentInvites = [],
  currentUserEmail,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Invite form state (once user has formed/joined a team)
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Incoming invite response state
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState('');

  // Join request state
  const [requestingTeamId, setRequestingTeamId] = useState<string | null>(null);
  const [joinRequestError, setJoinRequestError] = useState('');
  const [joinRequestSuccess, setJoinRequestSuccess] = useState('');

  const normalizedEmail = currentUserEmail?.trim().toLowerCase() ?? '';
  const myTeam = normalizedEmail
    ? teams.find(
        (t) =>
          t.leaderEmail.toLowerCase() === normalizedEmail ||
          t.memberEmails.some((m) => m.toLowerCase() === normalizedEmail),
      )
    : undefined;

  const pendingReceivedInvites = receivedInvites.filter((inv) => inv.status === 'pending');

  // Exclude people already in myTeam, already having a pending invite from me, or currentUser
  const candidateStudents = invitableStudents.filter((s) => {
    const candidateEmail = (s.email || '').trim().toLowerCase();
    if (!candidateEmail) return false;
    if (normalizedEmail && candidateEmail === normalizedEmail) return false;
    if (myTeam && myTeam.memberEmails.some((m) => m.toLowerCase() === candidateEmail)) {
      return false;
    }
    const alreadyInvited = sentInvites.some(
      (inv) =>
        inv.status === 'pending' &&
        (inv.receiverId === s.id || inv.receiverEmail.toLowerCase() === candidateEmail),
    );
    return !alreadyInvited;
  });

  async function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nameValue = formData.get('teamName');
    const name = typeof nameValue === 'string' ? nameValue.trim() : '';
    if (!name || name.length > 80) {
      setError('Team names must be between 1 and 80 characters.');
      return;
    }
    if (!currentUserEmail) {
      setError('Sign in before forming a team.');
      return;
    }
    if (!isRegistered) {
      setError('Register for this event first before forming a team.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, memberEmails: [] }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(readFormError(payload) ?? 'We couldn’t create the team. Please try again.');
        return;
      }

      form.reset();
      setMessage('Your team has been formed! Now invite teammates below.');
      router.refresh();
    } catch (requestError) {
      console.error('Event team formation request failed.', requestError);
      setError('We couldn’t reach CampusHub. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function sendInvite(student: Student, customMessage: string) {
    if (!myTeam) {
      setInviteError('Form your team first before sending invitations.');
      return;
    }
    const receiverEmail = (student.email || '').trim().toLowerCase();
    if (!receiverEmail) {
      setInviteError('This student does not have a public CampusHub email on file.');
      return;
    }

    setSendingInvite(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      const res = await fetch('/api/teams/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: myTeam.id,
          teamName: myTeam.name,
          eventId,
          eventTitle,
          receiverId: student.id,
          receiverName: student.name,
          receiverEmail,
          message: customMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Could not send team invitation.');
        return;
      }

      const fullLink = data.shareUrl?.startsWith('http')
        ? data.shareUrl
        : `${window.location.origin}/squad-up/${data.id}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fullLink).catch(() => {});
      }

      setSelectedStudentId('');
      setInviteMessage('');
      setInviteSuccess(`Invitation sent to ${student.name}! Invite link copied to clipboard.`);
      router.refresh();
    } catch {
      setInviteError('Network error while sending team invitation.');
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleInviteFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const student = candidateStudents.find((s) => s.id === selectedStudentId);
    if (!student) {
      setInviteError('Select a student to invite.');
      return;
    }
    await sendInvite(student, inviteMessage);
  }

  async function handleRespondInvite(inviteId: string, action: 'accept' | 'decline') {
    setRespondingInviteId(inviteId);
    setRespondError('');
    try {
      const res = await fetch(`/api/teams/invite/${encodeURIComponent(inviteId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRespondError(data.error || `Unable to ${action} this invitation.`);
        return;
      }
      router.refresh();
    } catch {
      setRespondError('Network error while responding to the invitation.');
    } finally {
      setRespondingInviteId(null);
    }
  }

  async function handleSendJoinRequest(team: HackathonTeam) {
    if (!currentUserEmail) {
      setJoinRequestError('Sign in to request to join this team.');
      return;
    }
    if (!isRegistered) {
      setJoinRequestError('Please register for this event first before requesting to join a team.');
      return;
    }
    setRequestingTeamId(team.id);
    setJoinRequestError('');
    setJoinRequestSuccess('');

    try {
      const res = await fetch('/api/teams/join-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          eventId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinRequestError(data.error || 'Failed to send join request.');
        return;
      }
      setJoinRequestSuccess(`Join request sent to team "${team.name}"! The team leader will review your request.`);
      router.refresh();
    } catch {
      setJoinRequestError('Network error while sending join request.');
    } finally {
      setRequestingTeamId(null);
    }
  }

  function copyShareLink(inviteId: string) {
    const url = `${window.location.origin}/squad-up/${inviteId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedInviteId(inviteId);
        setTimeout(() => setCopiedInviteId(null), 2000);
      }).catch(() => {});
    }
  }

  const canInviteMore = Boolean(myTeam && myTeam.memberEmails.length < teamSizeMax && !registrationClosed);

  return (
    <section className="card hackathon-panel" aria-labelledby="team-registration-title">
      <div>
        <p className="eyebrow">Step 2 · Form a team &amp; invite teammates</p>
        <h2 id="team-registration-title" className="card__title">Team formation &amp; invites</h2>
        <p className="muted-note">
          Register for the event first, form your team with a team name, then invite another student. Invitees can accept or decline. (Team size: {teamSizeMin}–{teamSizeMax} members.)
        </p>
      </div>

      {pendingReceivedInvites.length > 0 && (
        <div
          className="team-card"
          style={{ border: '2px solid var(--accent)', background: 'var(--canvas)' }}
        >
          <p className="eyebrow" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
            Incoming team invitations ({pendingReceivedInvites.length})
          </p>
          {respondError && <p className="form-error" role="alert">{respondError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendingReceivedInvites.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div>
                  <strong style={{ fontSize: 15 }}>Team &ldquo;{inv.teamName}&rdquo;</strong>
                  <p className="muted-note" style={{ margin: '2px 0' }}>
                    {myTeam && myTeam.leaderEmail.toLowerCase() === normalizedEmail
                      ? `Join Request from ${inv.senderName} (${inv.senderEmail})`
                      : `Invited by ${inv.senderName} (${inv.senderEmail})`}
                  </p>
                  {inv.message && (
                    <p style={{ margin: '4px 0 0', fontSize: 13, fontStyle: 'italic' }}>
                      &ldquo;{inv.message}&rdquo;
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={respondingInviteId === inv.id}
                    onClick={() => handleRespondInvite(inv.id, 'accept')}
                  >
                    {respondingInviteId === inv.id ? 'Updating…' : 'Accept Invite'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline"
                    disabled={respondingInviteId === inv.id}
                    onClick={() => handleRespondInvite(inv.id, 'decline')}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!currentUserEmail ? (
        <div className="hackathon-sign-in">
          <p>Sign in and register for this event first to form a team and send invitations.</p>
          <Link href={`/auth/sign-in?next=${encodeURIComponent(`/events/${eventId}`)}`} className="btn btn--dark">
            Sign in to continue
          </Link>
        </div>
      ) : myTeam ? (
        <div className="hackathon-team-list" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p className="form-success" role="status">
            Your team is active for this event. Invite teammates below so they can accept or decline.
          </p>
          <article className="team-card">
            <h3>{myTeam.name}</h3>
            <p><strong>Team leader:</strong> {myTeam.leaderEmail}</p>
            <p><strong>Members ({myTeam.memberEmails.length} / {teamSizeMax}):</strong></p>
            <ul>
              {myTeam.memberEmails.map((email) => (
                <li key={email}>{email}{email.toLowerCase() === myTeam.leaderEmail.toLowerCase() ? ' · Leader' : ''}</li>
              ))}
            </ul>
          </article>

          {canInviteMore && (
            <form className="hackathon-form" onSubmit={handleInviteFormSubmit}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Step 2b · Invite a teammate</h3>
              <label className="field" htmlFor={`invite-student-${eventId}`}>
                <span className="field__label">Select student</span>
                <select
                  id={`invite-student-${eventId}`}
                  className="input"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  required
                >
                  <option value="">Choose a student…</option>
                  {candidateStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor={`invite-msg-${eventId}`}>
                <span className="field__label">Note (optional)</span>
                <input
                  id={`invite-msg-${eventId}`}
                  className="input"
                  maxLength={240}
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Hey! Want to squad up with us for this event?"
                />
              </label>
              {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
              {inviteSuccess && <p className="form-success" role="status">{inviteSuccess}</p>}
              <button
                type="submit"
                className="btn btn--primary"
                disabled={sendingInvite || candidateStudents.length === 0}
              >
                {sendingInvite ? 'Sending invite…' : 'Send Team Invite'}
              </button>
            </form>
          )}

          {sentInvites.length > 0 && (
            <div className="team-card">
              <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Sent invitations ({sentInvites.length})</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sentInvites.map((inv) => (
                  <li
                    key={inv.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      paddingTop: 6,
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <strong>{inv.receiverName}</strong> ({inv.receiverEmail})
                      <span
                        className="chip chip--neutral"
                        style={{ marginLeft: 8, textTransform: 'capitalize' }}
                      >
                        {inv.status}
                      </span>
                    </div>
                    {inv.status === 'pending' && (
                      <button
                        type="button"
                        className="btn btn--outline"
                        style={{ fontSize: 12, padding: '4px 10px', minHeight: 30 }}
                        onClick={() => copyShareLink(inv.id)}
                      >
                        {copiedInviteId === inv.id ? '✓ Link copied' : 'Copy invite link'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : !isRegistered ? (
        <div className="team-card" style={{ border: '1px dashed var(--border)' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Registration required before team formation</p>
          <p className="muted-note" style={{ marginTop: 6, marginBottom: 0 }}>
            Complete <strong>Step 1: Register for this event</strong> in the overview card above. Once registered, you can form a team with your team name and invite other students.
          </p>
        </div>
      ) : registrationClosed ? (
        <p className="empty-note">Team formation closed on {registrationDeadline}.</p>
      ) : (
        <form className="hackathon-form" onSubmit={submitTeam}>
          <label className="field" htmlFor={`team-name-${eventId}`}>
            <span className="field__label">Team name</span>
            <input
              id={`team-name-${eventId}`}
              name="teamName"
              className="input"
              maxLength={80}
              placeholder="e.g. Quantum Rogues"
              required
            />
          </label>
          <p className="muted-note">
            You’ll be the team leader ({currentUserEmail}). After creating the team, you can send invites to teammates.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button type="submit" className="btn btn--dark" disabled={submitting}>
            {submitting ? 'Creating team…' : 'Create team'}
          </button>
        </form>
      )}

      {/* List of formed teams & Join Request section */}
      <div className="team-suggestions" style={{ marginTop: 20 }}>
        <div>
          <h3>Active Event Teams ({teams.length})</h3>
          <p className="muted-note">
            Browse squads formed for this event. If a team has open slots, you can send a request to the team leader to join their squad.
          </p>
        </div>

        {joinRequestError && <p className="form-error" role="alert">{joinRequestError}</p>}
        {joinRequestSuccess && <p className="form-success" role="status">{joinRequestSuccess}</p>}

        {teams.length === 0 ? (
          <p className="empty-note">
            No teams have formed yet for this event. Be the first to create one!
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {teams.map((team) => {
              const isMyTeam = Boolean(
                myTeam && (myTeam.id === team.id || myTeam.name.toLowerCase() === team.name.toLowerCase()),
              );
              const isLeader = team.leaderEmail.toLowerCase() === normalizedEmail;
              const membersCount = team.memberEmails.length;
              const hasOpenSlot = membersCount < teamSizeMax;
              const pendingJoinSent = sentInvites.some(
                (inv) =>
                  inv.status === 'pending' &&
                  (inv.teamId === team.id || (inv.teamName && inv.teamName.toLowerCase() === team.name.toLowerCase())) &&
                  inv.senderEmail.toLowerCase() === normalizedEmail,
              );

              return (
                <div
                  key={team.id}
                  className="card"
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: isMyTeam ? '2px solid var(--accent, #3b82f6)' : '1px solid var(--border)',
                    background: isMyTeam ? 'rgba(59, 130, 246, 0.04)' : 'var(--canvas)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: 16 }}>{team.name}</strong>
                      <span
                        className="chip chip--neutral"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: hasOpenSlot ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: hasOpenSlot ? '#059669' : '#dc2626',
                        }}
                      >
                        {membersCount} / {teamSizeMax} Members
                      </span>
                    </div>

                    <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.8 }}>
                      Leader: <strong>{team.leaderEmail.split('@')[0]}</strong> ({team.leaderEmail})
                    </p>

                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {team.memberEmails.map((email) => (
                        <span
                          key={email}
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: email.toLowerCase() === team.leaderEmail.toLowerCase() ? 'rgba(59, 130, 246, 0.15)' : 'var(--panel)',
                            color: email.toLowerCase() === team.leaderEmail.toLowerCase() ? '#2563eb' : 'inherit',
                            fontWeight: email.toLowerCase() === team.leaderEmail.toLowerCase() ? 700 : 400,
                          }}
                        >
                          {email.split('@')[0]}
                          {email.toLowerCase() === team.leaderEmail.toLowerCase() ? ' 👑' : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    {isMyTeam ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                        ✓ {isLeader ? 'You are the leader' : 'You are in this team'}
                      </span>
                    ) : myTeam ? (
                      <span style={{ fontSize: 12, opacity: 0.6 }}>
                        Already in a team
                      </span>
                    ) : pendingJoinSent ? (
                      <span className="chip chip--neutral" style={{ fontWeight: 600 }}>
                        ⏳ Join Request Pending
                      </span>
                    ) : !hasOpenSlot ? (
                      <span style={{ fontSize: 12, opacity: 0.6 }}>
                        Team is Full
                      </span>
                    ) : !isRegistered ? (
                      <span style={{ fontSize: 12, color: 'var(--coral, #ef4444)' }}>
                        Register first to join
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendJoinRequest(team)}
                        disabled={requestingTeamId === team.id || registrationClosed}
                        className="btn btn--outline"
                        style={{ fontSize: 12, padding: '5px 12px', minHeight: 32 }}
                      >
                        {requestingTeamId === team.id ? 'Sending...' : 'Request to Join 🙋'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="team-suggestions">
        <div>
          <h3>Looking for a team</h3>
          <p className="muted-note">
            Browse students looking for teammates, view their profile, or invite them once your team is formed.
          </p>
        </div>
        {(() => {
          const suggestions = studentsLookingForTeam.filter((student) => {
            const studentEmail = (student.email || '').trim().toLowerCase();
            return !normalizedEmail || studentEmail !== normalizedEmail;
          });

          if (!suggestions.length) {
            return (
              <p className="empty-note">
                No other classmates are currently marked as looking for a team.
              </p>
            );
          }

          return (
            <ul className="team-suggestions__list">
              {suggestions.map((student) => {
                const studentEmail = (student.email || '').trim().toLowerCase();
                const alreadyOnTeam = Boolean(
                  myTeam && studentEmail && myTeam.memberEmails.some((m) => m.toLowerCase() === studentEmail),
                );
                const pendingSent = sentInvites.find(
                  (inv) =>
                    inv.status === 'pending' &&
                    (inv.receiverId === student.id || (studentEmail && inv.receiverEmail.toLowerCase() === studentEmail)),
                );
                return (
                  <li key={student.id} className="team-suggestion">
                    <div>
                      <strong>{student.name}</strong>
                      <p>{student.skills.join(' · ') || 'CampusHub builder'}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      {canInviteMore && studentEmail && !alreadyOnTeam && !pendingSent && (
                        <button
                          type="button"
                          className="btn btn--primary"
                          style={{ fontSize: 12, padding: '6px 12px', minHeight: 32 }}
                          disabled={sendingInvite}
                          onClick={() => sendInvite(student, '')}
                        >
                          Invite to {myTeam?.name}
                        </button>
                      )}
                      {pendingSent && (
                        <span className="chip chip--neutral">Invited</span>
                      )}
                      <Link href={`/students/${student.id}`} className="link-more">
                        View profile
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </div>
    </section>
  );
}
