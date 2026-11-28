'use client';

import { useState } from 'react';
import type { DashboardStats } from '@/lib/db/dashboard';
import type { Student } from '@/lib/types';
import type { UserCertificate } from '@/lib/db/events';
import type { Project } from '@/lib/types';

type Props = {
  stats: DashboardStats;
  student: Student;
  certificates: UserCertificate[];
  bookmarkedProjects: Project[];
  githubUsername: string | null;
  onSaveGitHub: (username: string) => Promise<void>;
};

const BADGE_CONFIG: Record<string, { icon: string; bg: string; text: string; desc: string }> = {
  'First Event': { icon: '🌱', bg: 'rgba(56, 189, 248, 0.12)', text: '#0284c7', desc: 'Registered or attended your first campus event' },
  'Hackathon Hero': { icon: '🚀', bg: 'rgba(239, 68, 68, 0.12)', text: '#dc2626', desc: 'Joined or created 3+ hackathon teams' },
  'Problem Solver': { icon: '💡', bg: 'rgba(234, 179, 8, 0.12)', text: '#ca8a04', desc: '5+ accepted community answers helping peers' },
  'Builder': { icon: '🛠️', bg: 'rgba(168, 85, 247, 0.12)', text: '#9333ea', desc: 'Published 3+ student projects to the showcase' },
  'Mentor': { icon: '🎓', bg: 'rgba(34, 197, 94, 0.12)', text: '#16a34a', desc: 'Completed 5+ 1:1 mentorship or review sessions' },
  'Top 10 This Month': { icon: '🏆', bg: 'rgba(245, 158, 11, 0.15)', text: '#d97706', desc: 'Ranked in the top 10 on the campus leaderboard' },
};

export default function DashboardTab({
  stats,
  student,
  certificates,
  bookmarkedProjects,
  githubUsername,
  onSaveGitHub,
}: Props) {
  const [ghInput, setGhInput] = useState(githubUsername || '');
  const [savingGh, setSavingGh] = useState(false);
  const [ghMsg, setGhMsg] = useState<string | null>(null);

  const handleUpdateGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGh(true);
    setGhMsg(null);
    try {
      await onSaveGitHub(ghInput);
      setGhMsg('GitHub username saved!');
    } catch (err) {
      setGhMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingGh(false);
    }
  };

  const handlePrintBragSheet = () => {
    window.print();
  };

  // Find max monthly activity for scaling SVG bars
  const maxActivity = Math.max(1, ...stats.monthlyActivity.map((m) => m.count));

  return (
    <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Action Bar for Brag Sheet */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Developer Activity & Insights</h2>
          <p style={{ margin: '3px 0 0 0', fontSize: 13, color: 'var(--muted)', opacity: 0.9 }}>
            Live metrics from your campus events, projects, community contributions, and GitHub.
          </p>
        </div>
        <button
          onClick={handlePrintBragSheet}
          type="button"
          style={{
            padding: '9px 18px',
            backgroundColor: 'var(--ink)',
            color: 'var(--canvas)',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'opacity 150ms ease',
          }}
        >
          <span>📄</span> Export Resume / Brag Sheet (PDF)
        </button>
      </div>

      {/* Primary Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {/* Leaderboard Rank & Points */}
        <div
          style={{
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 12,
            padding: '16px 18px',
            backgroundColor: 'rgba(245, 158, 11, 0.06)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Leaderboard
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px 0' }}>
            {stats.leaderboardRank ? `#${stats.leaderboardRank}` : 'Unranked'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {stats.leaderboardPoints ?? 0} pts earned ·{' '}
            <a href="/leaderboard" style={{ color: 'var(--electric-blue)', textDecoration: 'none', fontWeight: 600 }}>
              View Board →
            </a>
          </div>
        </div>

        {/* Streak Counter */}
        <div
          style={{
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 12,
            padding: '16px 18px',
            backgroundColor: 'rgba(239, 68, 68, 0.06)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Dev Streak
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px 0' }}>{stats.streakDays} Days</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Consecutive activity streak</div>
        </div>

        {/* Projects Posted */}
        <div
          style={{
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 12,
            padding: '16px 18px',
            backgroundColor: 'rgba(59, 130, 246, 0.06)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Projects Posted
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px 0' }}>{stats.projectsCount}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Shared in Showcase</div>
        </div>

        {/* Events Attended vs Registered */}
        <div
          style={{
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 12,
            padding: '16px 18px',
            backgroundColor: 'rgba(16, 185, 129, 0.06)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Events Attended
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px 0' }}>
            {stats.eventsAttendedCount}
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)' }}> / {stats.eventsRegisteredCount}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Attended vs Registered</div>
        </div>

        {/* Certificates Earned */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            backgroundColor: 'var(--card)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Certificates
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px 0' }}>{stats.certificatesCount}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Verified event completions</div>
        </div>

        {/* Forum Answers Accepted */}
        <div
          style={{
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: 12,
            padding: '16px 18px',
            backgroundColor: 'rgba(168, 85, 247, 0.06)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Accepted Answers
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px 0' }}>{stats.acceptedAnswersCount}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Community solutions</div>
        </div>

        {/* Mentorship Completed */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
            backgroundColor: 'var(--card)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Mentorships
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px 0' }}>{stats.completedMentorshipCount}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>1:1 sessions completed</div>
        </div>
      </div>

      {/* Badges Earned Section */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
          backgroundColor: 'var(--card)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Activity Badges Earned</h3>
            <p style={{ margin: '3px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Badges unlocked automatically from your verified campus activity.
            </p>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: 'var(--panel)',
              padding: '4px 10px',
              borderRadius: 20,
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          >
            {stats.badges?.length || 0} Unlocked
          </span>
        </div>

        {stats.badges && stats.badges.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {stats.badges.map((badgeName) => {
              const info = BADGE_CONFIG[badgeName] || {
                icon: '⭐',
                bg: 'var(--panel)',
                text: 'var(--ink)',
                desc: 'Active contributor',
              };
              return (
                <div
                  key={badgeName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    backgroundColor: info.bg,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{info.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: info.text }}>{badgeName}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.3, marginTop: 2 }}>{info.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: 20,
              backgroundColor: 'var(--panel)',
              border: '1px dashed var(--border)',
              borderRadius: 10,
              fontSize: 13,
              color: 'var(--muted)',
              textAlign: 'center',
            }}
          >
            No badges unlocked yet. Register for an event, publish a project, or answer questions in the community to earn your first badge!
          </div>
        )}
      </div>

      {/* Monthly Activity SVG Chart */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
          backgroundColor: 'var(--card)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Monthly Activity Breakdown (Last 6 Months)</h3>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Verified platform actions</span>
        </div>

        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg
            viewBox="0 0 600 200"
            style={{ width: '100%', height: 'auto', maxHeight: 220, display: 'block' }}
            aria-label="Monthly activity bar chart"
          >
            {/* Grid lines */}
            <line x1="40" y1="30" x2="580" y2="30" stroke="var(--border)" strokeDasharray="4" strokeOpacity="0.6" />
            <line x1="40" y1="85" x2="580" y2="85" stroke="var(--border)" strokeDasharray="4" strokeOpacity="0.6" />
            <line x1="40" y1="140" x2="580" y2="140" stroke="var(--border)" strokeDasharray="4" strokeOpacity="0.6" />
            <line x1="40" y1="165" x2="580" y2="165" stroke="var(--border)" strokeWidth="1" />

            {/* Bars */}
            {stats.monthlyActivity.map((item, index) => {
              const barWidth = 40;
              const xPos = 70 + index * 85;
              const barHeight = Math.max(8, (item.count / maxActivity) * 125);
              const yPos = 165 - barHeight;

              return (
                <g key={item.month}>
                  {/* The Bar */}
                  <rect
                    x={xPos}
                    y={yPos}
                    width={barWidth}
                    height={barHeight}
                    fill="var(--electric-blue)"
                    opacity="0.85"
                    rx="6"
                  />
                  {/* Count Label */}
                  <text
                    x={xPos + barWidth / 2}
                    y={yPos - 6}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill="var(--ink)"
                  >
                    {item.count}
                  </text>
                  {/* Month Label */}
                  <text
                    x={xPos + barWidth / 2}
                    y="185"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="600"
                    fill="var(--muted)"
                  >
                    {item.month}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* GitHub Integration Section */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
          backgroundColor: 'var(--card)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>GitHub Activity & Insights</h3>
          {stats.githubData?.username && (
            <a
              href={`https://github.com/${stats.githubData.username}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--electric-blue)', textDecoration: 'none' }}
            >
              @{stats.githubData.username} on GitHub ↗
            </a>
          )}
        </div>

        {stats.githubData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stats.githubData.error ? (
              <p style={{ margin: 0, color: '#dc2626', fontSize: 13 }}>{stats.githubData.error}</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 10,
                }}
              >
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--panel)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>PUBLIC REPOS</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.githubData.publicRepos}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--panel)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>FOLLOWERS</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.githubData.followers}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--panel)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>RECENT COMMITS</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.githubData.recentCommits}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--panel)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>PUBLIC EVENTS</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.githubData.recentEventsCount}</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            No GitHub username linked yet. Connect your GitHub profile below to automatically pull repository stats and public contribution insights!
          </p>
        )}

        {/* Update GitHub input */}
        <form onSubmit={handleUpdateGitHub} style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Your GitHub username (e.g. aditya-dev)"
            value={ghInput}
            onChange={(e) => setGhInput(e.target.value)}
            style={{
              padding: '9px 14px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              width: 260,
              background: 'var(--panel)',
              color: 'var(--ink)',
            }}
          />
          <button
            type="submit"
            disabled={savingGh}
            style={{
              padding: '9px 18px',
              backgroundColor: 'var(--ink)',
              color: 'var(--canvas)',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              opacity: savingGh ? 0.7 : 1,
            }}
          >
            {savingGh ? 'Saving...' : 'Link GitHub'}
          </button>
          {ghMsg && <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>{ghMsg}</span>}
        </form>
      </div>

      {/* Skills Radar / Tags Cloud */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 20,
          backgroundColor: 'var(--card)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Skills Cloud & Technical Strengths</h3>
        {student.skills.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {student.skills.map((skill) => (
              <span
                key={skill}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'var(--ink)',
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            No skills added yet. Use the Edit Profile form on the Overview tab to add your languages and frameworks!
          </p>
        )}
      </div>

      {/* Printable Brag Sheet / Resume Layout (Displayed when printing) */}
      <div
        className="print-only-brag-sheet"
        style={{
          display: 'none',
        }}
      >
        <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#1a1a1a' }}>
          <header style={{ borderBottom: '2px solid #1a1a1a', paddingBottom: 16, marginBottom: 20 }}>
            <h1 style={{ margin: '0 0 4px 0', fontSize: 26, fontWeight: 800 }}>{student.name}</h1>
            <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#444' }}>
              {student.branch} · {student.year} · ADYPU UGSOT · @{student.handle}
            </p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>{student.bio}</p>
          </header>

          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
              TECHNICAL SKILLS
            </h2>
            <p style={{ fontSize: 13, marginTop: 6 }}>{student.skills.join(' • ')}</p>
          </section>

          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
              CAMPUS & DEVELOPER STATS
            </h2>
            <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, marginTop: 6 }}>
              <li>
                <strong>Projects Showcase:</strong> {stats.projectsCount} technical projects posted
              </li>
              <li>
                <strong>Event Attendance:</strong> {stats.eventsAttendedCount} events attended (out of {stats.eventsRegisteredCount} registered)
              </li>
              <li>
                <strong>Official Certificates:</strong> {stats.certificatesCount} verified certificates earned
              </li>
              <li>
                <strong>Peer Mentorship & Solutions:</strong> {stats.acceptedAnswersCount} accepted answers, {stats.completedMentorshipCount} mentorship sessions
              </li>
              {stats.githubData?.username && (
                <li>
                  <strong>GitHub ({stats.githubData.username}):</strong> {stats.githubData.publicRepos} public repos, {stats.githubData.recentCommits} recent commits
                </li>
              )}
            </ul>
          </section>

          {certificates.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
                VERIFIED EVENT CERTIFICATES
              </h2>
              <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, marginTop: 6 }}>
                {certificates.map((c) => (
                  <li key={c.id}>
                    <strong>{c.eventTitle}</strong> — Issued {new Date(c.issuedAt).toLocaleDateString()} (ID: {c.id})
                  </li>
                ))}
              </ul>
            </section>
          )}

          {bookmarkedProjects.length > 0 && (
            <section>
              <h2 style={{ fontSize: 16, fontWeight: 800, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
                FEATURED COLLABORATIONS & PROJECTS
              </h2>
              <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, marginTop: 6 }}>
                {bookmarkedProjects.map((p) => (
                  <li key={p.id}>
                    <strong>{p.title}</strong>: {p.shortDescription}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* Global Print Style for clean PDF output */}
      <style jsx global>{`
        @media print {
          nav, header, footer, .no-print, .profile-card, .profile-page__heading, .back-link {
            display: none !important;
          }
          .dashboard-container {
            display: block !important;
          }
          .print-only-brag-sheet {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
