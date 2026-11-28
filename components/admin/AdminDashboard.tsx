'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TeamRoster } from '@/lib/db/teams';
import type { Database } from '@/lib/db/database.types';

type InvitationRow = Database['public']['Tables']['team_invitations']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type AdminCertificateItem = {
  id: string;
  certificateId: string;
  certificateNumber: string;
  eventId: string;
  eventTitle: string;
  userId: string;
  attendeeName: string;
  attendeeEmail: string;
  courseYear?: string;
  issuedAt: string;
};

type Props = {
  initialTeams: TeamRoster[];
  initialInvitations: InvitationRow[];
  initialProfiles: ProfileRow[];
  initialCertificates?: AdminCertificateItem[];
  eventsList?: { id: string; title: string }[];
  currentUserId?: string | null;
  currentUserEmail?: string | null;
};

export default function AdminDashboard({
  initialTeams,
  initialInvitations,
  initialProfiles,
  initialCertificates = [],
  eventsList = [],
  currentUserId,
  currentUserEmail,
}: Props) {
  const [activeTab, setActiveTab] = useState<'teams' | 'invites' | 'students' | 'certificates'>('teams');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'organizer' | 'student'>('all');
  const [profiles, setProfiles] = useState<ProfileRow[]>(initialProfiles);
  const [certificates, setCertificates] = useState<AdminCertificateItem[]>(initialCertificates);
  const [certSearch, setCertSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [roleActionMessage, setRoleActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    profile: ProfileRow;
    targetRole: 'organizer' | 'student';
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Add certificate modal state
  const [showAddCertModal, setShowAddCertModal] = useState(false);
  const [certFormEventId, setCertFormEventId] = useState('');
  const [certFormUserId, setCertFormUserId] = useState('');
  const [certFormCustomNumber, setCertFormCustomNumber] = useState('');
  const [isSubmittingCert, setIsSubmittingCert] = useState(false);
  const [certModalError, setCertModalError] = useState<string | null>(null);

  // Edit profile modal state
  const [editingProfile, setEditingProfile] = useState<ProfileRow | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<'organizer' | 'student'>('student');
  const [editCourseYear, setEditCourseYear] = useState('');
  const [editGithubUsername, setEditGithubUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [editLookingForTeam, setEditLookingForTeam] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  function openEditProfile(p: ProfileRow) {
    setEditingProfile(p);
    setEditFullName(p.full_name || '');
    setEditRole(p.role === 'organizer' ? 'organizer' : 'student');
    setEditCourseYear(p.course_year || '');
    setEditGithubUsername(p.github_username || '');
    setEditBio(p.bio || '');
    setEditSkills(Array.isArray(p.skills) ? p.skills.join(', ') : '');
    setEditLookingForTeam(Boolean(p.looking_for_team));
    setEditModalError(null);
  }

  // Exact live counts from real Firestore data
  const totalTeamsCount = initialTeams.length;
  const totalMembersCount = initialTeams.reduce((acc, t) => acc + (t.membersCount || 0), 0);
  const totalStudentsCount = profiles.length;
  const totalAdminsCount = profiles.filter((p) => p.role === 'organizer').length;
  const totalInvitesCount = initialInvitations.length;
  const acceptedInvitesCount = initialInvitations.filter((i) => i.status === 'accepted').length;
  const pendingInvitesCount = initialInvitations.filter((i) => i.status === 'pending').length;

  // Filtered teams
  const filteredTeams = initialTeams.filter((t) => {
    const matchesSearch =
      !teamSearch ||
      t.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
      t.leaderEmail.toLowerCase().includes(teamSearch.toLowerCase()) ||
      t.leaderName.toLowerCase().includes(teamSearch.toLowerCase());
    const matchesEvent = selectedEvent === 'all' || t.eventId === selectedEvent;
    return matchesSearch && matchesEvent;
  });

  // Filtered students
  const filteredStudents = profiles.filter((p) => {
    const q = studentSearch.toLowerCase();
    const name = (p.full_name || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    const skills = Array.isArray(p.skills) ? p.skills.join(' ').toLowerCase() : '';
    const matchesQuery = !q || name.includes(q) || email.includes(q) || skills.includes(q);
    const matchesRole =
      roleFilter === 'all' ||
      (roleFilter === 'organizer' && p.role === 'organizer') ||
      (roleFilter === 'student' && p.role !== 'organizer');
    return matchesQuery && matchesRole;
  });

  async function handleRoleChange(profile: ProfileRow, newRole: 'organizer' | 'student') {
    setUpdatingUserId(profile.id);
    setRoleActionMessage(null);
    try {
      const res = await fetch('/api/admin/users/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user role');
      }
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, role: newRole } : p)),
      );
      setRoleActionMessage({
        type: 'success',
        text: data.message || `Role updated to ${newRole}`,
      });
      setConfirmDialog(null);
    } catch (err) {
      setRoleActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update user role',
      });
    } finally {
      setUpdatingUserId(null);
    }
  }

  // Export to CSV
  function exportTeamsCSV() {
    if (filteredTeams.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Team ID', 'Team Name', 'Event', 'Leader Name', 'Leader Email', 'Member Count', 'Member Emails', 'Created At'];
      const rows = filteredTeams.map((t) => [
        t.id,
        `"${t.name.replace(/"/g, '""')}"`,
        `"${t.eventTitle.replace(/"/g, '""')}"`,
        `"${t.leaderName.replace(/"/g, '""')}"`,
        t.leaderEmail,
        t.membersCount,
        `"${t.memberEmails.join(', ')}"`,
        t.createdAt,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `campushub_teams_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      {/* KPI Cards */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        <div className="card" style={{ padding: 20, borderRadius: 14 }}>
          <p className="mono" style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>TOTAL TEAMS</p>
          <p style={{ fontSize: 32, fontWeight: 800, margin: '6px 0 2px', color: 'var(--electric-blue)' }}>
            {totalTeamsCount}
          </p>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Registered hackathon squads</span>
        </div>

        <div className="card" style={{ padding: 20, borderRadius: 14 }}>
          <p className="mono" style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>TEAM MEMBERS</p>
          <p style={{ fontSize: 32, fontWeight: 800, margin: '6px 0 2px', color: '#10b981' }}>
            {totalMembersCount}
          </p>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Students in active teams</span>
        </div>

        <div className="card" style={{ padding: 20, borderRadius: 14 }}>
          <p className="mono" style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>STUDENT PROFILES</p>
          <p style={{ fontSize: 32, fontWeight: 800, margin: '6px 0 2px', color: 'var(--ink)' }}>
            {totalStudentsCount}
          </p>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Registered builders on platform</span>
        </div>

        <div
          className="card"
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('students')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('students');
            }
          }}
          style={{ padding: 20, borderRadius: 14, cursor: 'pointer', border: activeTab === 'students' ? '2px solid #f59e0b' : undefined }}
          title="Click to view and manage Admin Privileges"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="mono" style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>ADMINS & ORGANIZERS</p>
            <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Manage ↗</span>
          </div>
          <p style={{ fontSize: 32, fontWeight: 800, margin: '6px 0 2px', color: '#f59e0b' }}>
            {totalAdminsCount}
          </p>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Active campus coordinators</span>
        </div>

        <div className="card" style={{ padding: 20, borderRadius: 14 }}>
          <p className="mono" style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>SQUAD INVITATIONS</p>
          <p style={{ fontSize: 32, fontWeight: 800, margin: '6px 0 2px', color: '#8b5cf6' }}>
            {totalInvitesCount}
          </p>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {acceptedInvitesCount} accepted · {pendingInvitesCount} pending
          </span>
        </div>

        <div
          className="card"
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('certificates')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('certificates');
            }
          }}
          style={{ padding: 20, borderRadius: 14, cursor: 'pointer', border: activeTab === 'certificates' ? '2px solid #059669' : undefined }}
          title="Click to view and issue official certificates"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="mono" style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>OFFICIAL CERTIFICATES</p>
            <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>Manage ↗</span>
          </div>
          <p style={{ fontSize: 32, fontWeight: 800, margin: '6px 0 2px', color: '#059669' }}>
            {certificates.length}
          </p>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Issued student certificates</span>
        </div>
      </section>

      {/* Tabs navigation */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('teams')}
          className={`btn ${activeTab === 'teams' ? 'btn--dark' : 'btn--outline'}`}
          style={{ minHeight: 38, fontSize: 13, padding: '0 16px' }}
        >
          Teams & Members ({filteredTeams.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('invites')}
          className={`btn ${activeTab === 'invites' ? 'btn--dark' : 'btn--outline'}`}
          style={{ minHeight: 38, fontSize: 13, padding: '0 16px' }}
        >
          Squad-Up Invites ({initialInvitations.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`btn ${activeTab === 'students' ? 'btn--dark' : 'btn--outline'}`}
          style={{ minHeight: 38, fontSize: 13, padding: '0 16px' }}
        >
          Students & Admins ({profiles.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('certificates')}
          className={`btn ${activeTab === 'certificates' ? 'btn--dark' : 'btn--outline'}`}
          style={{ minHeight: 38, fontSize: 13, padding: '0 16px' }}
        >
          Certificates ({certificates.length}) 🎓
        </button>
      </div>

      {/* TAB 1: TEAMS TABLE */}
      {activeTab === 'teams' && (
        <section className="card" style={{ padding: 24, borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
              <input
                type="search"
                placeholder="Search team name, leader email..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  fontSize: 13,
                  minWidth: 260,
                }}
              />
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  fontSize: 13,
                }}
              >
                <option value="all">All Events</option>
                <option value="campus-hackathon">Campus Hackathon 2026</option>
                <option value="global-ai-hackathon">Global AI Hackathon</option>
              </select>
            </div>

            <button
              type="button"
              disabled={exporting || filteredTeams.length === 0}
              onClick={exportTeamsCSV}
              className="btn btn--dark"
              style={{ minHeight: 36, fontSize: 13, padding: '0 14px' }}
            >
              📥 Export to CSV
            </button>
          </div>

          {filteredTeams.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', opacity: 0.8 }}>
                    <th style={{ padding: '10px 12px' }}>Team Name</th>
                    <th style={{ padding: '10px 12px' }}>Event</th>
                    <th style={{ padding: '10px 12px' }}>Leader</th>
                    <th style={{ padding: '10px 12px' }}>Members</th>
                    <th style={{ padding: '10px 12px' }}>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((team) => (
                    <tr key={team.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 12px', fontWeight: 700 }}>
                        {team.name}
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span className="mono" style={{ fontSize: 12, background: 'var(--panel)', padding: '3px 8px', borderRadius: 4 }}>
                          {team.eventTitle}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div>
                          <strong>{team.leaderName}</strong>
                          <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>{team.leaderEmail}</p>
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 14 }}>{team.membersCount}</span>
                          {team.memberEmails.map((email) => (
                            <span
                              key={email}
                              style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--panel)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {email.split('@')[0]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px', opacity: 0.8, fontSize: 12 }}>
                        {new Date(team.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', opacity: 0.7 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No teams registered yet.</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                Teams created for hackathons or accepted via squad-up invites in Firestore will appear here.
              </p>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: SQUAD-UP INVITATIONS */}
      {activeTab === 'invites' && (
        <section className="card" style={{ padding: 24, borderRadius: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Squad-Up Invitations</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
              Track all team invitation links and responses recorded in Firestore.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', opacity: 0.8 }}>
                  <th style={{ padding: '10px 12px' }}>Team Name</th>
                  <th style={{ padding: '10px 12px' }}>Invited By</th>
                  <th style={{ padding: '10px 12px' }}>Target Student</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Message</th>
                  <th style={{ padding: '10px 12px' }}>Link</th>
                </tr>
              </thead>
              <tbody>
                {initialInvitations.length > 0 ? (
                  initialInvitations.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 12px', fontWeight: 700 }}>{inv.team_name}</td>
                      <td style={{ padding: '12px 12px' }}>{inv.sender_name}</td>
                      <td style={{ padding: '12px 12px' }}>
                        <div>
                          <strong>{inv.receiver_name}</strong>
                          <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>{inv.receiver_email}</p>
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background:
                              inv.status === 'accepted'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : inv.status === 'declined'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(245, 158, 11, 0.15)',
                            color:
                              inv.status === 'accepted'
                                ? '#059669'
                                : inv.status === 'declined'
                                ? 'var(--coral)'
                                : '#d97706',
                          }}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.message || '—'}
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <Link href={`/squad-up/${inv.id}`} className="link-more" style={{ fontSize: 12 }}>
                          View link →
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>
                      No squad-up invitations recorded yet. When students invite peers from /students, they appear here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: REGISTERED STUDENTS & ADMINS */}
      {activeTab === 'students' && (
        <section className="card" style={{ padding: 24, borderRadius: 16 }}>
          {roleActionMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                marginBottom: 16,
                background: roleActionMessage.type === 'success' ? '#e6f7ed' : '#fee2e2',
                color: roleActionMessage.type === 'success' ? '#0e7a41' : '#b91c1c',
                border: `1px solid ${roleActionMessage.type === 'success' ? '#a3e6be' : '#fca5a5'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span>{roleActionMessage.text}</span>
              <button
                type="button"
                onClick={() => setRoleActionMessage(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Registered Campus Students & Admins</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                Manage student profiles and grant or revoke organizer/admin privileges.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="segmented" role="group" aria-label="Role Filter">
                <button
                  type="button"
                  aria-pressed={roleFilter === 'all'}
                  onClick={() => setRoleFilter('all')}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  All ({profiles.length})
                </button>
                <button
                  type="button"
                  aria-pressed={roleFilter === 'organizer'}
                  onClick={() => setRoleFilter('organizer')}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  Admins ({totalAdminsCount})
                </button>
                <button
                  type="button"
                  aria-pressed={roleFilter === 'student'}
                  onClick={() => setRoleFilter('student')}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  Students ({profiles.length - totalAdminsCount})
                </button>
              </div>

              <input
                type="search"
                placeholder="Search name, email, or skill..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  fontSize: 13,
                  minWidth: 240,
                }}
              />
            </div>
          </div>

          {filteredStudents.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', opacity: 0.8 }}>
                    <th style={{ padding: '10px 12px' }}>Student</th>
                    <th style={{ padding: '10px 12px' }}>Role</th>
                    <th style={{ padding: '10px 12px' }}>Skills</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Profile</th>
                    <th style={{ padding: '10px 12px' }}>Admin Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((p) => {
                    const isBootstrapAdmin = (p.email || '').toLowerCase() === 'sahildehadray157@gmail.com';
                    const isSelf = p.id === currentUserId || (currentUserEmail && (p.email || '').toLowerCase() === currentUserEmail.toLowerCase());
                    const isOrganizer = p.role === 'organizer';

                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 12px' }}>
                          <strong>{p.full_name || 'Anonymous'}</strong>
                          <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>{p.email}</p>
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: isOrganizer ? 'var(--electric-blue)' : 'var(--panel)',
                              color: isOrganizer ? '#fff' : 'var(--ink)',
                              fontWeight: isOrganizer ? 700 : 400,
                            }}
                          >
                            {p.role || 'student'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {Array.isArray(p.skills) && p.skills.length > 0 ? (
                              p.skills.slice(0, 4).map((s: string) => (
                                <span key={s} style={{ fontSize: 11, background: 'var(--panel)', padding: '2px 6px', borderRadius: 4 }}>
                                  {s}
                                </span>
                              ))
                            ) : (
                              <span style={{ opacity: 0.5 }}>No skills listed</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          {p.looking_for_team ? (
                            <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>🤝 Looking for team</span>
                          ) : (
                            <span style={{ opacity: 0.6, fontSize: 11 }}>Active builder</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <Link href={`/students/${p.id}`} className="link-more" style={{ fontSize: 12 }}>
                            View profile →
                          </Link>
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => openEditProfile(p)}
                              className="btn btn--outline"
                              style={{ fontSize: 11, padding: '4px 8px', minHeight: 28 }}
                              title="Edit user profile details and role"
                            >
                              ✏️ Edit
                            </button>
                            {isBootstrapAdmin ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#b45309',
                                  background: '#fef3c7',
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                }}
                                title="Primary platform bootstrap administrator cannot be revoked"
                              >
                                👑 Super Admin
                              </span>
                            ) : isSelf ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  opacity: 0.8,
                                }}
                                title="You cannot revoke your own admin privilege"
                              >
                                🛡️ Admin (You)
                              </span>
                            ) : isOrganizer ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDialog({ profile: p, targetRole: 'student' })}
                                disabled={updatingUserId === p.id}
                                className="btn btn--outline"
                                style={{
                                  fontSize: 12,
                                  padding: '4px 10px',
                                  minHeight: 28,
                                  color: 'var(--coral, #ef4444)',
                                  borderColor: 'rgba(239, 68, 68, 0.4)',
                                }}
                              >
                                {updatingUserId === p.id ? 'Revoking...' : 'Revoke Admin ✕'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDialog({ profile: p, targetRole: 'organizer' })}
                                disabled={updatingUserId === p.id}
                                className="btn btn--dark"
                                style={{ fontSize: 12, padding: '4px 10px', minHeight: 28 }}
                              >
                                {updatingUserId === p.id ? 'Granting...' : 'Make Admin 🛡️'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', opacity: 0.7 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No profiles match this filter.</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                Try adjusting your search terms or role filter above.
              </p>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: CERTIFICATES MANAGEMENT */}
      {activeTab === 'certificates' && (
        <section className="card" style={{ padding: 24, borderRadius: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Official Event Certificates</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                Issue official certificates to students and manage certificate numbers for verification.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search recipient, event, or cert number..."
                value={certSearch}
                onChange={(e) => setCertSearch(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  fontSize: 13,
                  minWidth: 260,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setCertModalError(null);
                  setShowAddCertModal(true);
                }}
                className="btn btn--primary"
                style={{ fontSize: 13, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                + Issue New Certificate
              </button>
            </div>
          </div>

          {certificates.filter((c) => {
            const q = certSearch.toLowerCase();
            return (
              !q ||
              c.attendeeName.toLowerCase().includes(q) ||
              c.attendeeEmail.toLowerCase().includes(q) ||
              c.eventTitle.toLowerCase().includes(q) ||
              c.certificateNumber.toLowerCase().includes(q) ||
              c.certificateId.toLowerCase().includes(q)
            );
          }).length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', opacity: 0.8 }}>
                    <th style={{ padding: '10px 12px' }}>Certificate No.</th>
                    <th style={{ padding: '10px 12px' }}>Recipient</th>
                    <th style={{ padding: '10px 12px' }}>Event</th>
                    <th style={{ padding: '10px 12px' }}>Issued On</th>
                    <th style={{ padding: '10px 12px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates
                    .filter((c) => {
                      const q = certSearch.toLowerCase();
                      return (
                        !q ||
                        c.attendeeName.toLowerCase().includes(q) ||
                        c.attendeeEmail.toLowerCase().includes(q) ||
                        c.eventTitle.toLowerCase().includes(q) ||
                        c.certificateNumber.toLowerCase().includes(q) ||
                        c.certificateId.toLowerCase().includes(q)
                      );
                    })
                    .map((cert) => (
                      <tr key={cert.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 12px' }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              background: 'rgba(5, 150, 105, 0.1)',
                              color: '#059669',
                              padding: '3px 8px',
                              borderRadius: 6,
                            }}
                          >
                            {cert.certificateNumber}
                          </span>
                          <p style={{ margin: '3px 0 0', fontSize: 10, opacity: 0.6, fontFamily: 'monospace' }}>
                            {cert.certificateId.slice(0, 18)}...
                          </p>
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <strong>{cert.attendeeName}</strong>
                          <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>{cert.attendeeEmail}</p>
                        </td>
                        <td style={{ padding: '12px 12px', fontWeight: 600 }}>{cert.eventTitle}</td>
                        <td style={{ padding: '12px 12px' }}>
                          {new Date(cert.issuedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Link
                              href={`/certificates/${cert.certificateId}`}
                              target="_blank"
                              className="btn btn--outline"
                              style={{ fontSize: 11, padding: '4px 8px', minHeight: 28 }}
                            >
                              View / Print ↗
                            </Link>
                            <Link
                              href={`/verify?id=${encodeURIComponent(cert.certificateNumber)}`}
                              target="_blank"
                              className="btn btn--ghost"
                              style={{ fontSize: 11, padding: '4px 8px', minHeight: 28 }}
                            >
                              Verify record 🔍
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', opacity: 0.7 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No certificates found.</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                Click &ldquo;+ Issue New Certificate&rdquo; above to issue a certificate to any registered student.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Modal: Issue Certificate Directly */}
      {showAddCertModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-cert-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 500,
              width: '100%',
              padding: 24,
              borderRadius: 16,
              background: 'var(--card, #fff)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <h3 id="issue-cert-title" style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
              Issue Official Event Certificate
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, opacity: 0.8 }}>
              Select the student and event. The student will be able to access and verify this certificate using either the unique Certificate ID or Certificate Number.
            </p>

            {certModalError && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  marginBottom: 14,
                  background: '#fee2e2',
                  color: '#b91c1c',
                  border: '1px solid #fca5a5',
                  fontSize: 13,
                }}
              >
                {certModalError}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!certFormEventId || !certFormUserId) {
                  setCertModalError('Please select both an event and a student.');
                  return;
                }
                setIsSubmittingCert(true);
                setCertModalError(null);

                try {
                  const res = await fetch('/api/admin/certificates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      eventId: certFormEventId,
                      userId: certFormUserId,
                      certificateNumber: certFormCustomNumber.trim() || undefined,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    throw new Error(data.error || 'Failed to issue certificate');
                  }

                  if (data.certificate) {
                    setCertificates((prev) => [data.certificate, ...prev]);
                  }
                  setShowAddCertModal(false);
                  setCertFormCustomNumber('');
                  setRoleActionMessage({
                    type: 'success',
                    text: `Successfully issued certificate ${data.certificate?.certificateNumber} to ${data.certificate?.attendeeName}!`,
                  });
                } catch (err) {
                  setCertModalError(err instanceof Error ? err.message : 'Failed to issue certificate');
                } finally {
                  setIsSubmittingCert(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Select Event *
                </label>
                <select
                  value={certFormEventId}
                  onChange={(e) => setCertFormEventId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                  }}
                >
                  <option value="">-- Choose an Event --</option>
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                  {eventsList.length === 0 && (
                    <>
                      <option value="campus-hackathon">Smart Campus 48H Hackathon 2026</option>
                      <option value="global-ai-hackathon">Global AI Hackathon</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Select Student *
                </label>
                <select
                  value={certFormUserId}
                  onChange={(e) => setCertFormUserId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                  }}
                >
                  <option value="">-- Choose a Student --</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || 'Anonymous'} ({p.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Certificate Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CERT-2026-001 (auto-generated if empty)"
                  value={certFormCustomNumber}
                  onChange={(e) => setCertFormCustomNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                />
                <span style={{ fontSize: 11, opacity: 0.6, marginTop: 2, display: 'block' }}>
                  Students can enter this exact number on /verify to view and access their certificate.
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setShowAddCertModal(false)}
                  disabled={isSubmittingCert}
                  style={{ fontSize: 13, minHeight: 36 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={isSubmittingCert}
                  style={{ fontSize: 13, minHeight: 36 }}
                >
                  {isSubmittingCert ? 'Issuing...' : 'Issue Certificate 🎓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-role-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 480,
              width: '100%',
              padding: 24,
              borderRadius: 16,
              background: 'var(--card, #fff)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <h3 id="confirm-role-title" style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>
              {confirmDialog.targetRole === 'organizer'
                ? 'Grant Admin Privileges?'
                : 'Revoke Admin Privileges?'}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
              {confirmDialog.targetRole === 'organizer' ? (
                <>
                  Are you sure you want to promote <strong>{confirmDialog.profile.full_name || 'this user'}</strong> (
                  <code>{confirmDialog.profile.email}</code>) to <strong>Admin / Organizer</strong>?
                  <br />
                  <br />
                  They will gain access to the Admin Panel, Noticeboard Event Manager, and Attendance Roll Call tools.
                </>
              ) : (
                <>
                  Are you sure you want to revoke Admin privileges from <strong>{confirmDialog.profile.full_name || 'this user'}</strong> (
                  <code>{confirmDialog.profile.email}</code>)?
                  <br />
                  <br />
                  Their role will be changed back to <strong>Student</strong>, and they will immediately lose access to the Admin Panel and event management tools.
                </>
              )}
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setConfirmDialog(null)}
                disabled={Boolean(updatingUserId)}
                style={{ fontSize: 13, minHeight: 36 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${confirmDialog.targetRole === 'organizer' ? 'btn--dark' : 'btn--outline'}`}
                style={{
                  fontSize: 13,
                  minHeight: 36,
                  color: confirmDialog.targetRole === 'student' ? 'var(--coral, #ef4444)' : undefined,
                  borderColor: confirmDialog.targetRole === 'student' ? 'rgba(239, 68, 68, 0.4)' : undefined,
                }}
                onClick={() => handleRoleChange(confirmDialog.profile, confirmDialog.targetRole)}
                disabled={Boolean(updatingUserId)}
              >
                {updatingUserId
                  ? 'Updating...'
                  : confirmDialog.targetRole === 'organizer'
                  ? 'Confirm Promotion'
                  : 'Confirm Revocation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit User Profile */}
      {editingProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 540,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              borderRadius: 16,
              background: 'var(--card, #fff)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 id="edit-profile-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  Edit User Profile & Role ✏️
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                  {editingProfile.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: 4,
                  lineHeight: 1,
                  opacity: 0.6,
                }}
                aria-label="Close edit modal"
              >
                ✕
              </button>
            </div>

            {editModalError && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  marginBottom: 14,
                  background: '#fee2e2',
                  color: '#b91c1c',
                  border: '1px solid #fca5a5',
                  fontSize: 13,
                }}
              >
                {editModalError}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editFullName.trim()) {
                  setEditModalError('Full name cannot be empty.');
                  return;
                }
                setIsSubmittingEdit(true);
                setEditModalError(null);

                try {
                  const parsedSkills = editSkills
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);

                  const res = await fetch('/api/admin/users/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: editingProfile.id,
                      fullName: editFullName.trim(),
                      role: editRole,
                      courseYear: editCourseYear.trim() || null,
                      githubUsername: editGithubUsername.trim() || null,
                      bio: editBio.trim() || null,
                      skills: parsedSkills,
                      lookingForTeam: editLookingForTeam,
                    }),
                  });

                  const data = await res.json();
                  if (!res.ok) {
                    throw new Error(data.error || 'Failed to update user profile');
                  }

                  setProfiles((prev) =>
                    prev.map((p) =>
                      p.id === editingProfile.id
                        ? {
                            ...p,
                            full_name: editFullName.trim(),
                            role: editRole,
                            course_year: editCourseYear.trim() || null,
                            github_username: editGithubUsername.trim() || null,
                            bio: editBio.trim() || null,
                            skills: parsedSkills,
                            looking_for_team: editLookingForTeam,
                          }
                        : p,
                    ),
                  );

                  setRoleActionMessage({
                    type: 'success',
                    text: data.message || `Profile updated successfully!`,
                  });
                  setEditingProfile(null);
                } catch (err) {
                  setEditModalError(err instanceof Error ? err.message : 'Failed to update profile');
                } finally {
                  setIsSubmittingEdit(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  maxLength={80}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Role & Permissions *
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'organizer' | 'student')}
                  disabled={editingProfile.email === 'sahildehadray157@gmail.com' || editingProfile.id === currentUserId}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                  }}
                >
                  <option value="student">Normal Student (Participant)</option>
                  <option value="organizer">Admin / Organizer 🛡️ (Full Access)</option>
                </select>
                {editingProfile.email === 'sahildehadray157@gmail.com' && (
                  <span style={{ fontSize: 11, opacity: 0.7, marginTop: 4, display: 'block' }}>
                    Primary super admin cannot be demoted.
                  </span>
                )}
                {editingProfile.id === currentUserId && editingProfile.email !== 'sahildehadray157@gmail.com' && (
                  <span style={{ fontSize: 11, opacity: 0.7, marginTop: 4, display: 'block' }}>
                    You cannot change your own role here.
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Course & Year
                </label>
                <input
                  type="text"
                  value={editCourseYear}
                  onChange={(e) => setEditCourseYear(e.target.value)}
                  placeholder="e.g. B.Tech Computer Engineering · Year 3"
                  maxLength={60}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={editGithubUsername}
                  onChange={(e) => setEditGithubUsername(e.target.value)}
                  placeholder="e.g. aditya-dev"
                  maxLength={50}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Short Bio
                </label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  maxLength={240}
                  placeholder="User bio..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Skills (comma-separated)
                </label>
                <input
                  type="text"
                  value={editSkills}
                  onChange={(e) => setEditSkills(e.target.value)}
                  placeholder="React, Python, TypeScript, Figma"
                  maxLength={200}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editLookingForTeam}
                    onChange={(e) => setEditLookingForTeam(e.target.checked)}
                  />
                  <span>Looking for a team (Recruitment badge visible to squads)</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setEditingProfile(null)}
                  disabled={isSubmittingEdit}
                  style={{ fontSize: 13, minHeight: 36 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={isSubmittingEdit}
                  style={{ fontSize: 13, minHeight: 36 }}
                >
                  {isSubmittingEdit ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
