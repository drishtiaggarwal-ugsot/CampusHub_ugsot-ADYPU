'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, type FormEvent } from 'react';
import type { CampusEvent, Project, Student, TeamInvitation } from '@/lib/types';
import type { MyEventRegistration, UserCertificate } from '@/lib/db/events';
import type { DashboardStats } from '@/lib/db/dashboard';
import { typeColors } from '@/lib/colors';
import { dayRange, MONTHS_SHORT, parseDate } from '@/lib/dates';
import Avatar from './Avatar';
import { LinkIcon, Trophy } from './icons';
import Button from './ui/Button';
import Card from './ui/Card';
import Input from './ui/Input';
import DashboardTab from './DashboardTab';
import ForkButton from './ForkButton';
import DockersModal from './DockersModal';
import ShaderBackground from './effects/ShaderBackground';
import SquadUpModal from './teams/SquadUpModal';

const LINK_LABELS: { key: keyof Student['links']; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'github', label: 'GitHub' },
  { key: 'x', label: 'X' },
  { key: 'portfolio', label: 'Portfolio' },
];

type Props = {
  student: Student;
  isOwn: boolean;
  isAdminView?: boolean;
  currentUserEmail?: string | null;
  registrations?: MyEventRegistration[];
  registrationsError?: string;
  certificates?: UserCertificate[];
  bookmarkedProjects?: Project[];
  dashboardStats?: DashboardStats;
  initialGithubUsername?: string | null;
  initialInvitations?: { received: TeamInvitation[]; sent: TeamInvitation[] };
};

function computeCompleteness(p: {
  name?: string;
  year?: string;
  skills?: string[];
  bio?: string;
  github?: string | null;
  links?: Record<string, string | undefined>;
}): number {
  let score = 0;
  if (p.name?.trim()) score += 20;
  if (p.year?.trim()) score += 15;
  if (Array.isArray(p.skills) && p.skills.length > 0) score += 20;
  if (p.bio?.trim()) score += 20;
  if (p.github?.trim()) score += 15;
  const hasSocial = Boolean(
    (p.links?.linkedin && !p.links.linkedin.includes('[')) ||
    (p.links?.x && !p.links.x.includes('[')) ||
    (p.links?.portfolio && !p.links.portfolio.includes('['))
  );
  if (hasSocial) score += 10;
  return Math.min(100, score);
}

export default function ProfileView({
  student,
  isOwn,
  isAdminView = false,
  currentUserEmail = null,
  registrations = [],
  registrationsError = '',
  certificates = [],
  bookmarkedProjects = [],
  dashboardStats,
  initialGithubUsername = null,
  initialInvitations = { received: [], sent: [] },
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'dashboard'>('overview');
  const [profile, setProfile] = useState(student);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(student.name);
  const [bio, setBio] = useState(student.bio);
  const [skills, setSkills] = useState(student.skills.join(', '));
  const [role, setRole] = useState<'organizer' | 'student'>(student.role || 'student');
  const [courseYear, setCourseYear] = useState(student.year || '');
  const [lookingForTeam, setLookingForTeam] = useState(student.lookingForTeam);
  const [savedGithubUsername, setSavedGithubUsername] = useState(initialGithubUsername || '');
  const [githubUsername, setGithubUsername] = useState(initialGithubUsername || '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Team invitations state
  const [invitations, setInvitations] = useState(initialInvitations);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [inviteRespondError, setInviteRespondError] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Fork / Docking state
  const [dockersCount, setDockersCount] = useState(0);
  const [dockingCount, setDockingCount] = useState(0);
  const [isForking, setIsForking] = useState(false);
  const [modalType, setModalType] = useState<'dockers' | 'docking' | null>(null);
  const [squadUpOpen, setSquadUpOpen] = useState(false);
  const [squadUpToast, setSquadUpToast] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.id) return;
    fetch(`/api/students/${profile.id}/fork`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.dockersCount === 'number') setDockersCount(data.dockersCount);
        if (typeof data.dockingCount === 'number') setDockingCount(data.dockingCount);
        if (typeof data.isForking === 'boolean') setIsForking(data.isForking);
      })
      .catch((err) => console.error('Failed to load fork stats:', err));
  }, [profile.id]);

  const completeness = computeCompleteness({
    name: profile.name,
    year: profile.year,
    skills: profile.skills,
    bio: profile.bio,
    github: githubUsername || profile.links.github,
    links: profile.links,
  });
  const going: CampusEvent[] = [];
  const registeredEvents = registrations.flatMap((registration) => {
    const event: CampusEvent = {
      id: registration.eventId,
      title: 'Campus Event',
      type: 'event',
      category: 'Workshop',
      mode: 'Offline',
      where: 'In campus',
      place: 'ADYPU Campus',
      start: registration.registeredAt ? registration.registeredAt.slice(0, 10) : '2026-11-27',
      registrationDeadline: registration.registeredAt ? registration.registeredAt.slice(0, 10) : '2026-11-27',
      capacity: 50,
    };
    return [{ registration, event }];
  });
  const links = LINK_LABELS.flatMap((link) => {
    const value = profile.links[link.key];
    return value && !value.includes('[') ? [{ ...link, value }] : [];
  });

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updatedName = name.trim();
    const updatedBio = bio.trim();
    const updatedSkills = [...new Set(skills.split(',').map((skill) => skill.trim()).filter(Boolean))];
    if (!updatedName) {
      setError('Please enter your name.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const endpoint = (!isOwn && isAdminView) ? '/api/admin/users/profile' : '/api/profile/update';
      const payload: Record<string, unknown> = {
        fullName: updatedName,
        bio: updatedBio,
        skills: updatedSkills,
        githubUsername: githubUsername.trim() || null,
        courseYear: courseYear.trim(),
      };
      if (!isOwn && isAdminView) {
        payload.userId = profile.id;
        payload.role = role;
        payload.lookingForTeam = lookingForTeam;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      setProfile({
        ...profile,
        name: updatedName,
        bio: updatedBio,
        skills: updatedSkills,
        year: courseYear.trim(),
        role: (!isOwn && isAdminView) ? role : profile.role,
        lookingForTeam: (!isOwn && isAdminView) ? lookingForTeam : profile.lookingForTeam,
      });
      setSavedGithubUsername(githubUsername.trim());
      setSaved(true);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveGitHub(newUsername: string) {
    const clean = newUsername.trim();
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ githubUsername: clean || null }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update GitHub username');
    }
    setGithubUsername(clean);
    setSavedGithubUsername(clean);
    router.refresh();
  }

  function cancelEdit() {
    setName(profile.name);
    setBio(profile.bio);
    setSkills(profile.skills.join(', '));
    setCourseYear(profile.year);
    setRole(profile.role || 'student');
    setLookingForTeam(profile.lookingForTeam);
    setGithubUsername(savedGithubUsername);
    setError('');
    setEditing(false);
  }

  async function handleRespondInvitation(inviteId: string, action: 'accept' | 'decline') {
    setRespondingInviteId(inviteId);
    setInviteRespondError('');
    try {
      const res = await fetch(`/api/teams/invite/${encodeURIComponent(inviteId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteRespondError(data.error || `Could not ${action} invitation.`);
        return;
      }
      setInvitations((prev) => ({
        ...prev,
        received: prev.received.map((inv) =>
          inv.id === inviteId ? { ...inv, status: action === 'accept' ? 'accepted' : 'declined' } : inv,
        ),
      }));
      router.refresh();
    } catch {
      setInviteRespondError('Network error while responding to invitation.');
    } finally {
      setRespondingInviteId(null);
    }
  }

  function copyInviteLink(inviteId: string) {
    const url = `${window.location.origin}/squad-up/${inviteId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedInviteId(inviteId);
        setTimeout(() => setCopiedInviteId(null), 2000);
      }).catch(() => {});
    }
  }

  return (
    <div className="profile-layout">
      <section aria-label="Profile card" className="profile-card">
        <div aria-hidden="true" className="profile-card__banner">
          <ShaderBackground variant="mesh" className="profile-card__banner-shader" />
        </div>
        <div className="profile-card__body">
          <div className="profile-card__intro">
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Avatar studentId={profile.id} name={profile.name} size="xl" />
            </div>
            <h1 className="profile-card__name">{profile.name}</h1>
            <p className="profile-card__meta">{profile.branch} · {profile.year} · @{profile.handle}</p>
            {profile.role === 'organizer' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  borderRadius: 16,
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(234, 88, 12, 0.12)',
                  color: '#ea580c',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  marginTop: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                🛡️ Admin / Organizer
              </span>
            )}
            {profile.lookingForTeam && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'rgba(43, 80, 255, 0.08)',
                  color: 'var(--electric-blue)',
                  border: '1px solid rgba(43, 80, 255, 0.2)',
                  marginTop: 2,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--electric-blue)' }} />
                Looking for a team
              </span>
            )}

            {/* Social graph counters */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setModalType('dockers')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
                aria-label={`View ${dockersCount} Connections`}
              >
                <strong>{dockersCount}</strong> <span style={{ opacity: 0.75 }}>Connections</span>
              </button>
              <span style={{ opacity: 0.3 }}>·</span>
              <button
                type="button"
                onClick={() => setModalType('docking')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
                aria-label={`View ${dockingCount} Following`}
              >
                <strong>{dockingCount}</strong> <span style={{ opacity: 0.75 }}>Following</span>
              </button>
            </div>

            {!isOwn && (
              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setSquadUpOpen(true)}
                  className="btn btn--dark"
                  style={{ minHeight: 38, padding: '0 16px', fontSize: 13, fontWeight: 700 }}
                >
                  🤝 Send Squad-Up Invite
                </button>
                <ForkButton
                  targetUserId={profile.id}
                  targetName={profile.name}
                  initialIsForking={isForking}
                  initialDockersCount={dockersCount}
                  onCountChange={(newCount, forking) => {
                    setDockersCount(newCount);
                    setIsForking(forking);
                  }}
                />
                {isAdminView && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setSaved(false); setEditing(true); }}
                    style={{ minHeight: 38, fontSize: 13, borderColor: '#ea580c', color: '#ea580c' }}
                  >
                    🛡️ Edit User Profile
                  </Button>
                )}
              </div>
            )}

            {!editing && profile.bio && <p className="profile-card__bio">{profile.bio}</p>}
          </div>

          <DockersModal
            userId={profile.id}
            userName={profile.name}
            type={modalType || 'dockers'}
            isOpen={Boolean(modalType)}
            onClose={() => setModalType(null)}
          />

          {!editing && (
            <>
              {links.length > 0 && (
                <div className="link-list">
                  {links.map((link) => {
                    const value = link.value;
                    return (
                      <a key={link.key} href={value.startsWith('http') ? value : `https://${value}`} className="link-row" target="_blank" rel="noreferrer">
                        <span aria-hidden="true" className="icon-tile"><LinkIcon /></span>
                        <span className="link-row__label">{link.label}</span>
                        <span className="link-row__value">{value}</span>
                      </a>
                    );
                  })}
                </div>
              )}
              {links.length === 0 && <p className="empty-note">Social links haven’t been added yet.</p>}
            </>
          )}

          {(isOwn || isAdminView) && (
            <>
              {editing ? (
                <form className="profile-edit" onSubmit={saveProfile}>
                  <h2 className="card__title">
                    {isOwn ? 'Edit your profile' : 'Edit User Profile (Admin Mode)'}
                  </h2>
                  {!isOwn && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        background: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                        marginBottom: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      🛡️ <strong>Admin Controls:</strong> Updating <strong>{profile.name}</strong> ({profile.email}). You can adjust their role, profile information, or squad availability.
                    </div>
                  )}
                  <Input id="profile-name" label="Full Name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
                  <Input id="profile-course-year" label="Course & Year" value={courseYear} onChange={(event) => setCourseYear(event.target.value)} placeholder="e.g. B.Tech Computer Engineering · Year 3" maxLength={60} />
                  <Input id="profile-github" label="GitHub Username" value={githubUsername} onChange={(event) => setGithubUsername(event.target.value)} placeholder="e.g. aditya-dev" maxLength={50} />
                  <label className="field" htmlFor="profile-bio">
                    <span className="field__label">Short bio (optional)</span>
                    <textarea id="profile-bio" className="textarea" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={240} rows={3} placeholder="Tell classmates about yourself, projects you're interested in..." />
                  </label>
                  <Input id="profile-skills" label="Skills (optional, comma-separated)" value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="React, Node.js, Python, UI Design" maxLength={200} />

                  {isAdminView && !isOwn && (
                    <>
                      <div className="field" style={{ marginTop: 8 }}>
                        <label className="field__label" htmlFor="admin-role-select">
                          User Role / Permissions
                        </label>
                        <select
                          id="admin-role-select"
                          value={role}
                          onChange={(e) => setRole(e.target.value as 'organizer' | 'student')}
                          disabled={profile.email === 'sahildehadray157@gmail.com'}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--canvas)',
                            fontSize: 13,
                          }}
                        >
                          <option value="student">Normal Student</option>
                          <option value="organizer">Admin / Organizer 🛡️</option>
                        </select>
                        {profile.email === 'sahildehadray157@gmail.com' && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                            Primary bootstrap administrator cannot be demoted.
                          </span>
                        )}
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', margin: '12px 0 6px' }}>
                        <input
                          type="checkbox"
                          checked={lookingForTeam}
                          onChange={(e) => setLookingForTeam(e.target.checked)}
                        />
                        Looking for a team (Visible to event squad recruiters)
                      </label>
                    </>
                  )}

                  <p className="profile-edit__note">
                    {isOwn ? 'Update your public student details below.' : 'Changes save directly to Firestore profiles.'}
                  </p>
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <div className="btn-row">
                    <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
                    <Button type="button" variant="outline" onClick={cancelEdit}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <>
                  {isOwn && (
                    <Button type="button" onClick={() => { setSaved(false); setEditing(true); }}>Edit profile</Button>
                  )}
                  {saved && <p className="form-success" role="status">Profile has been updated.</p>}
                </>
              )}
            </>
          )}
        </div>
      </section>

      <div className="profile-main">
        {isOwn && (
          <div
            className="no-print"
            style={{
              display: 'inline-flex',
              padding: 4,
              borderRadius: 12,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              gap: 4,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: activeTab === 'overview' ? 'var(--ink)' : 'transparent',
                color: activeTab === 'overview' ? 'var(--canvas)' : 'var(--ink)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              Profile Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: activeTab === 'dashboard' ? 'var(--ink)' : 'transparent',
                color: activeTab === 'dashboard' ? 'var(--canvas)' : 'var(--ink)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              Developer Dashboard
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && dashboardStats ? (
          <DashboardTab
            stats={dashboardStats}
            student={profile}
            certificates={certificates}
            bookmarkedProjects={bookmarkedProjects}
            githubUsername={githubUsername}
            onSaveGitHub={handleSaveGitHub}
          />
        ) : (
          <>
            {isOwn && (
              <Card className="profile-completeness">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Profile Completeness</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(43, 80, 255, 0.08)',
                      color: 'var(--electric-blue)',
                    }}
                  >
                    {completeness}%
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 9999,
                    background: 'var(--border)',
                    overflow: 'hidden',
                    margin: '12px 0 10px',
                  }}
                  role="progressbar"
                  aria-valuenow={completeness}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${completeness}%`,
                      borderRadius: 9999,
                      background: 'linear-gradient(90deg, var(--electric-blue), #3b82f6)',
                      transition: 'width 400ms ease',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
                  <p className="muted-note" style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                    Add skills, interests, and projects to hit 100%. Only you can see this.
                  </p>
                  <Link href="/onboarding" style={{ fontSize: 12, fontWeight: 700, color: 'var(--electric-blue)', textDecoration: 'none' }}>
                    Quick Wizard →
                  </Link>
                </div>
              </Card>
            )}

            <Card aria-labelledby="skills-title" className="profile-section">
              <h2 id="skills-title" className="card__title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Skills</h2>
              {profile.skills.length ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        padding: '6px 14px',
                        borderRadius: 8,
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        color: 'var(--ink)',
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : <p className="empty-note">Add a few skills so teammates can find you.</p>}
            </Card>

            {dashboardStats?.badges && dashboardStats.badges.length > 0 && (
              <Card aria-labelledby="badges-title" className="profile-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 id="badges-title" className="card__title" style={{ fontSize: 18, fontWeight: 700 }}>Activity Badges ({dashboardStats.badges.length})</h2>
                  <Link href="/leaderboard" style={{ fontSize: 13, color: 'var(--electric-blue)', textDecoration: 'none', fontWeight: 600 }}>
                    Leaderboard →
                  </Link>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {dashboardStats.badges.map((b) => (
                    <span
                      key={b}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 8,
                        background: 'rgba(43, 80, 255, 0.08)',
                        color: 'var(--electric-blue)',
                        border: '1px solid rgba(43, 80, 255, 0.2)',
                      }}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            <Card aria-labelledby="ach-title" className="profile-section">
              <h2 id="ach-title" className="card__title">Achievements</h2>
              {profile.achievements.length ? profile.achievements.map((achievement) => (
                <div key={achievement.title} className="achievement">
                  <div className="achievement__icon"><Trophy /></div>
                  <div>
                    <div className="achievement__title">{achievement.title}</div>
                    <div className="achievement__meta">{achievement.date}{achievement.verified ? ' · Verified by club admin' : ''}</div>
                  </div>
                </div>
              )) : <p className="empty-note">No achievements added yet. Your next win starts here.</p>}
            </Card>

            {isOwn && (
              <Card aria-labelledby="certificates-title" className="profile-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 id="certificates-title" className="card__title">My certificates ({certificates.length})</h2>
                  <Link href="/verify" style={{ fontSize: 13, textDecoration: 'underline' }}>
                    Verify a certificate →
                  </Link>
                </div>
                {certificates.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {certificates.map((cert) => (
                      <div
                        key={cert.id}
                        className="going-row"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '12px 16px',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>🎓 {cert.eventTitle}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            Issued {new Date(cert.issuedAt).toLocaleDateString()} · ID: {cert.id.slice(0, 8)}…
                          </div>
                        </div>
                        <Link
                          href={`/certificates/${cert.id}`}
                          className="btn btn--primary"
                          style={{ fontSize: 12, padding: '4px 10px', minHeight: 32 }}
                        >
                          View & Print
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">
                    No certificates earned yet. Attend events and get marked present by the organizer to receive your official certificate!
                  </p>
                )}
              </Card>
            )}

            {isOwn && (
              <Card aria-labelledby="bookmarks-title" className="profile-section">
                <h2 id="bookmarks-title" className="card__title">My bookmarks ({bookmarkedProjects.length})</h2>
                {bookmarkedProjects.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {bookmarkedProjects.map((proj) => (
                      <div
                        key={proj.id}
                        className="going-row"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '12px 16px',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>🔖 {proj.title}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            {proj.shortDescription.slice(0, 60)}…
                          </div>
                        </div>
                        <Link
                          href={`/projects/${proj.id}`}
                          className="btn btn--primary"
                          style={{ fontSize: 12, padding: '4px 10px', minHeight: 32 }}
                        >
                          View Project
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">
                    No bookmarked projects yet. Bookmark interesting projects in the Project Showcase to view them here.
                  </p>
                )}
              </Card>
            )}

            {isOwn && (
              <Card aria-labelledby="registrations-title" className="profile-section">
                <h2 id="registrations-title" className="card__title">My registrations</h2>
                {registrationsError && <p className="form-error" role="alert">{registrationsError}</p>}
                {registeredEvents.length ? (
                  <div className="going-list">
                    {registeredEvents.map(({ registration, event }) => (
                      <Link key={registration.id} href={`/events/${event.id}`} className="going-row"
                        style={{ background: typeColors[event.category]?.bg }}>
                        <span>{event.title}</span>
                        <span>{MONTHS_SHORT[parseDate(event.start).getMonth()]} {dayRange(event)}</span>
                      </Link>
                    ))}
                  </div>
                ) : !registrationsError ? (
                  <p className="empty-note">You haven’t registered for any events yet. Browse events to find one to join.</p>
                ) : null}
              </Card>
            )}

            {isOwn && (
              <Card aria-labelledby="invitations-title" className="profile-section">
                <h2 id="invitations-title" className="card__title">
                  Team invitations ({invitations.received.filter((i) => i.status === 'pending').length} pending)
                </h2>
                {inviteRespondError && <p className="form-error" role="alert">{inviteRespondError}</p>}

                {invitations.received.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {invitations.received.map((inv) => (
                      <div
                        key={inv.id}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '12px 14px',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            🤝 {inv.teamName}
                            {inv.eventTitle ? ` · ${inv.eventTitle}` : ''}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.78 }}>
                            From {inv.senderName} ({inv.senderEmail})
                          </div>
                          {inv.message && (
                            <div style={{ fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>
                              &ldquo;{inv.message}&rdquo;
                            </div>
                          )}
                        </div>
                        {inv.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn--primary"
                              style={{ fontSize: 12, padding: '6px 12px', minHeight: 32 }}
                              disabled={respondingInviteId === inv.id}
                              onClick={() => handleRespondInvitation(inv.id, 'accept')}
                            >
                              {respondingInviteId === inv.id ? 'Saving…' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--outline"
                              style={{ fontSize: 12, padding: '6px 12px', minHeight: 32 }}
                              disabled={respondingInviteId === inv.id}
                              onClick={() => handleRespondInvitation(inv.id, 'decline')}
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="chip chip--neutral" style={{ textTransform: 'capitalize' }}>
                            {inv.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">No received team invitations yet.</p>
                )}

                {invitations.sent.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Sent invitations ({invitations.sent.length})</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {invitations.sent.map((inv) => (
                        <div
                          key={inv.id}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ fontSize: 13 }}>
                            <strong>{inv.receiverName}</strong> ({inv.teamName})
                            {inv.eventTitle ? ` · ${inv.eventTitle}` : ''}
                            <span className="chip chip--neutral" style={{ marginLeft: 8, textTransform: 'capitalize' }}>
                              {inv.status}
                            </span>
                          </div>
                          {inv.status === 'pending' && (
                            <button
                              type="button"
                              className="btn btn--outline"
                              style={{ fontSize: 12, padding: '4px 10px', minHeight: 28 }}
                              onClick={() => copyInviteLink(inv.id)}
                            >
                              {copiedInviteId === inv.id ? 'Copied ✓' : 'Copy link'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {!isOwn && (
              <Card aria-labelledby="going-title" className="profile-section">
                <h2 id="going-title" className="card__title">Going to</h2>
                {going.length ? (
                  <div className="going-list">
                    {going.map((event) => (
                      <Link key={event.id} href="/events" className="going-row" style={{ background: typeColors[event.category].bg }}>
                        <span>{event.title}</span>
                        <span>{MONTHS_SHORT[parseDate(event.start).getMonth()]} {dayRange(event)}</span>
                      </Link>
                    ))}
                  </div>
                ) : <p className="empty-note">No events saved yet. Browse events and find one to join.</p>}
              </Card>
            )}
          </>
        )}
      </div>

      {squadUpToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1100,
            background: 'var(--ink)',
            color: 'var(--canvas)',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {squadUpToast}
        </div>
      )}

      {squadUpOpen && (
        <SquadUpModal
          isOpen={squadUpOpen}
          targetStudent={profile}
          currentUserEmail={currentUserEmail}
          registrations={registrations}
          registrationsError={registrationsError}
          onClose={() => setSquadUpOpen(false)}
          onInviteSent={() => {
            setSquadUpToast('🤝 Squad invite sent & direct link copied to clipboard!');
            setTimeout(() => setSquadUpToast(null), 4000);
          }}
        />
      )}
    </div>
  );
}
