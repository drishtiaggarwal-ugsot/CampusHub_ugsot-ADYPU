'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Student } from '@/lib/types';
import Avatar from './Avatar';
import FilterPills from './FilterPills';
import ForkButton from './ForkButton';
import Button from './ui/Button';
import Input from './ui/Input';
import Tag from './ui/Tag';
import SquadUpModal from './teams/SquadUpModal';

const SKILLS = ['All', 'React', 'Python', 'ML', 'Figma', 'Flutter'] as const;

export default function StudentsBrowser({
  students,
  currentUserId,
  currentUserEmail,
}: {
  students: Student[];
  currentUserId?: string | null;
  currentUserEmail?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [skill, setSkill] = useState<(typeof SKILLS)[number]>('All');
  const [teamOnly, setTeamOnly] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const myEmail = currentUserEmail?.trim().toLowerCase();
    return students.filter((s) => {
      const sEmail = (s.email || '').trim().toLowerCase();
      const isSelf = Boolean(
        (currentUserId && s.id === currentUserId) ||
        (myEmail && sEmail && sEmail === myEmail),
      );
      // When looking for a team only, exclude yourself because you are seeking other teammates!
      if (teamOnly && isSelf) return false;
      return (
        (skill === 'All' || s.skills.includes(skill)) &&
        (!teamOnly || s.lookingForTeam) &&
        (!q || s.name.toLowerCase().includes(q) || s.skills.some((k) => k.toLowerCase().includes(q)))
      );
    });
  }, [students, query, skill, teamOnly, currentUserId, currentUserEmail]);

  function handleInviteSent() {
    setToastMsg('🤝 Squad invite sent & direct link copied to clipboard!');
    setTimeout(() => setToastMsg(null), 4000);
  }

  return (
    <>
      {toastMsg && (
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
          {toastMsg}
        </div>
      )}

      <section aria-label="Search and filters" className="card student-filters">
        <div className="search-row">
          <Input id="student-search" label="Search by name or skill" type="search" placeholder="e.g. React, Python, Sneha" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button variant="outline" className="toggle-btn" aria-pressed={teamOnly} onClick={() => setTeamOnly((v) => !v)}>
            Looking for a team only
          </Button>
        </div>
        <FilterPills label="Skill" options={SKILLS} value={skill} onChange={setSkill} />
      </section>

      <p className="count" aria-live="polite">{results.length === 1 ? '1 student' : `${results.length} students`}</p>

      {results.length > 0 ? (
        <div className="student-grid">
          {results.map((s) => (
            <article key={s.id} className="student-card card">
              <div className="student-card__head">
                <Avatar studentId={s.id} name={s.name} size="lg" />
                <div style={{ minWidth: 0 }}>
                  <h2 className="student-card__name">{s.name}</h2>
                  <p className="student-card__meta">{s.branch} · {s.year}</p>
                </div>
              </div>

              {s.bio && (
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: 'var(--ink)',
                    opacity: 0.85,
                    margin: '8px 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {s.bio}
                </p>
              )}

              <div className="chip-row">
                {s.skills.map((k) => <span key={k} className="chip chip--neutral">{k}</span>)}
              </div>
              <div className="student-card__foot">
                {(() => {
                  const sEmail = (s.email || '').trim().toLowerCase();
                  const myEmail = currentUserEmail?.trim().toLowerCase();
                  const isSelf = Boolean(
                    (currentUserId && s.id === currentUserId) ||
                    (myEmail && sEmail && sEmail === myEmail),
                  );

                  return (
                    <>
                      {isSelf ? (
                        <Tag className="chip" style={{ background: '#e0e7ff', color: '#3730a3', fontWeight: 700 }}>
                          Your profile
                        </Tag>
                      ) : s.lookingForTeam ? (
                        <Tag className="chip">Looking for a team</Tag>
                      ) : (
                        <span className="muted-note">Not looking right now</span>
                      )}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
                        {isSelf ? (
                          <Link href="/profile" className="btn btn--outline" style={{ minHeight: 34, fontSize: 13, padding: '0 12px' }}>
                            Edit your profile
                          </Link>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedStudent(s)}
                              className="btn btn--outline"
                              style={{ minHeight: 34, fontSize: 13, padding: '0 10px', fontWeight: 600 }}
                            >
                              🤝 Squad Up
                            </button>
                            <ForkButton targetUserId={s.id} targetName={s.name} size="sm" />
                            <Link href={`/students/${s.id}`} className="btn btn--dark" style={{ minHeight: 34, fontSize: 13, padding: '0 12px' }}>
                              View profile
                            </Link>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">No registered students found yet. When students sign in, their public profile will appear here.</p>
      )}

      {selectedStudent && (
        <SquadUpModal
          isOpen={Boolean(selectedStudent)}
          targetStudent={selectedStudent}
          currentUserEmail={currentUserEmail}
          onClose={() => setSelectedStudent(null)}
          onInviteSent={handleInviteSent}
        />
      )}
    </>
  );
}
