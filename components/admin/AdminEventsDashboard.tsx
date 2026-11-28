'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatEventDateRange } from '@/lib/dates';
import {
  type NoticeboardCampusEvent,
  type EventMode,
  type EventWhere,
  PUBLISHABLE_EVENT_CATEGORIES,
} from '@/lib/types';
import type { CurrentUser } from '@/lib/auth-types';
import styles from '../noticeboard/organizer.module.css';

type Props = {
  events: NoticeboardCampusEvent[];
  stats: { 
    eventId: string; 
    totalRegistrations: number; 
    teamRegistrations: number; 
    individualRegistrations: number; 
    attendanceCount: number; 
  }[];
  currentUser: CurrentUser;
};

type FormState = {
  title: string;
  description: string;
  category: string;
  mode: EventMode;
  where: EventWhere;
  place: string;
  start: string;
  end: string;
  registrationDeadline: string;
  capacity: number;
  event_type: 'event' | 'hackathon';
  teamSizeMin: number | null;
  teamSizeMax: number | null;
  theme: string;
  prize: string;
  rules: string;
  isPublished: boolean;
};

function emptyForm(): FormState {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  return {
    title: '',
    description: '',
    category: 'Workshop',
    mode: 'Offline',
    where: 'In campus',
    place: '',
    start: tomorrow.toISOString().split('T')[0],
    end: nextWeek.toISOString().split('T')[0],
    registrationDeadline: tomorrow.toISOString().split('T')[0],
    capacity: 50,
    event_type: 'event',
    teamSizeMin: null,
    teamSizeMax: null,
    theme: '',
    prize: '',
    rules: '',
    isPublished: false,
  };
}

const typeColors: Record<string, string> = {
  hackathon: '#8b5cf6',
  event: '#3b82f6',
};

type TabId = 'overview' | 'create' | 'registrations';

export default function AdminEventsDashboard({ events, stats }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(events[0]?.id ?? null);

  // Calculate overview stats
  const todayStr = new Date().toISOString().split('T')[0];
  const statsSummary = {
    totalEvents: events.length,
    publishedEvents: events.filter(e => e.isPublished).length,
    draftEvents: events.filter(e => !e.isPublished).length,
    totalRegistrations: stats.reduce((sum, s) => sum + s.totalRegistrations, 0),
    upcomingEvents: events.filter(e => e.start >= todayStr).length,
  };

  // Get stats for a specific event
  const eventStats = stats.find(s => s.eventId === selectedEventId);
  const selectedEvent = events.find(e => e.id === selectedEventId);

  async function createEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: form.category,
          mode: form.mode,
          event_where: form.where,
          place: form.place || 'ADYPU Campus',
          capacity: Number(form.capacity),
          event_type: form.event_type,
          start_date: form.start,
          end_date: form.end || null,
          registration_deadline: form.registrationDeadline,
          is_published: form.isPublished,
          team_size_min: form.event_type === 'hackathon' ? form.teamSizeMin : null,
          team_size_max: form.event_type === 'hackathon' ? form.teamSizeMax : null,
          theme: form.event_type === 'hackathon' ? form.theme : null,
          prize: form.event_type === 'hackathon' ? form.prize : null,
          rules: form.rules ? form.rules.split('\n').map(r => r.trim()).filter(Boolean) : [],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create event');
      }

      setSuccessMessage('Event created successfully!');
      setForm(emptyForm());
      setActiveTab('overview');
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  }

  const handleEventTypeChange = (type: 'event' | 'hackathon') => {
    setForm(prev => ({
      ...prev,
      event_type: type,
      teamSizeMin: type === 'hackathon' ? 1 : null,
      teamSizeMax: type === 'hackathon' ? 4 : null,
      theme: type === 'hackathon' ? '' : prev.theme,
      prize: type === 'hackathon' ? '' : prev.prize,
      rules: type === 'hackathon' ? '' : prev.rules,
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--ink)', paddingBottom: 12 }}>
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'create', label: 'Create Event' },
            { id: 'registrations', label: 'View Registrations' },
          ] as const
        ).map(tab => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'btn btn--primary' : 'btn btn--ghost'}
            onClick={() => setActiveTab(tab.id)}
            style={{ fontSize: 14, fontWeight: 500 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {successMessage && activeTab === 'overview' && (
        <div className="ui-toast ui-toast--status" role="status">
          <span>{successMessage}</span>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Stats Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
            }}
          >
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{statsSummary.totalEvents}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Total Events</div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{statsSummary.publishedEvents}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Published</div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{statsSummary.draftEvents}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Drafts</div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{statsSummary.totalRegistrations}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Total Registrations</div>
            </div>
          </div>

          {/* Events List with Stats */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Events</h3>
            {events.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {events.map(event => {
                  const regStats = stats.find(stat => stat.eventId === event.id);
                  const participation = event.capacity > 0 
                    ? Math.round((regStats?.totalRegistrations || 0) / event.capacity * 100) 
                    : 0;
                  
                  return (
                    <li 
                      key={event.id} 
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: 16,
                        borderBottom: '1px solid var(--ink)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span 
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              backgroundColor: typeColors[event.type] + '20',
                              color: typeColors[event.type],
                            }}
                          >
                            {event.type}
                          </span>
                          <h4 style={{ margin: 0, fontSize: 16 }}>{event.title}</h4>
                        </div>
                        <p style={{ margin: '4px 0 8px', opacity: 0.7, fontSize: 13 }}>
                          {event.category} · {formatEventDateRange(event.start, event.end)} · {event.place}
                        </p>
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, opacity: 0.7 }}>
                          <span>Capacity: {event.capacity}</span>
                          <span>Deadline: {event.registrationDeadline}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 120 }}>
                        {regStats && (
                          <>
                            <div style={{ fontSize: 18, fontWeight: 600 }}>{regStats.totalRegistrations}</div>
                            <div style={{ fontSize: 11, opacity: 0.7 }}>Registrations</div>
                            <div style={{ fontSize: 11, opacity: 0.5 }}>
                              {participation}% filled
                            </div>
                          </>
                        )}
                        <button
                          className="btn btn--ghost"
                          onClick={() => {
                            setSelectedEventId(event.id);
                            setActiveTab('registrations');
                          }}
                          style={{ marginTop: 8, fontSize: 12 }}
                        >
                          View Details
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>
                No events found. Create your first event below!
              </p>
            )}
          </div>
        </section>
      )}

      {/* Create Event Tab */}
      {activeTab === 'create' && (
        <section className={styles.eventFormContainer}>
          <h3 style={{ margin: '0 0 16px' }}>Create New Event</h3>
          
          {errorMessage && (
            <div className="ui-toast ui-toast--error" role="alert" style={{ marginBottom: 16 }}>
              <span>{errorMessage}</span>
            </div>
          )}
          
          {successMessage && (
            <div className="ui-toast ui-toast--status" style={{ marginBottom: 16 }}>
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={createEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Basic Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Event Title</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Enter event title"
                required
                style={{ padding: 10, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Event description..."
                rows={3}
                style={{ padding: 10, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)', resize: 'vertical' }}
              />
            </div>

            {/* Event Type Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Event Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={form.event_type === 'event' ? 'btn btn--primary' : 'btn btn--ghost'}
                  onClick={() => handleEventTypeChange('event')}
                >
                  Event
                </button>
                <button
                  type="button"
                  className={form.event_type === 'hackathon' ? 'btn btn--primary' : 'btn btn--ghost'}
                  onClick={() => handleEventTypeChange('hackathon')}
                >
                  Hackathon
                </button>
              </div>
            </div>

            {/* Common Options */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                >
                  {PUBLISHABLE_EVENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Mode</label>
                <select
                  value={form.mode}
                  onChange={e => setForm({ ...form, mode: e.target.value as EventMode })}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                >
                  <option value="Offline">Offline</option>
                  <option value="Online">Online</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Location</label>
                <select
                  value={form.where}
                  onChange={e => setForm({ ...form, where: e.target.value as EventWhere })}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                >
                  <option value="In campus">In campus</option>
                  <option value="Out of campus">Out of campus</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Capacity</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={form.capacity}
                  onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 50 })}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                />
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Start Date</label>
                <input
                  type="date"
                  value={form.start}
                  onChange={e => setForm({ ...form, start: e.target.value })}
                  required
                />
              </div>

              {form.event_type === 'hackathon' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>End Date</label>
                  <input
                    type="date"
                    value={form.end}
                    onChange={e => setForm({ ...form, end: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Registration Deadline</label>
              <input
                type="date"
                value={form.registrationDeadline}
                onChange={e => setForm({ ...form, registrationDeadline: e.target.value })}
                required
              />
            </div>

            {/* Hackathon-specific fields */}
            {form.event_type === 'hackathon' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Min Team Size</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.teamSizeMin ?? 1}
                    onChange={e => setForm({ ...form, teamSizeMin: parseInt(e.target.value) || 1 })}
                    style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Max Team Size</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.teamSizeMax ?? 4}
                    onChange={e => setForm({ ...form, teamSizeMax: parseInt(e.target.value) || 4 })}
                    style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Theme</label>
                  <input
                    type="text"
                    value={form.theme}
                    onChange={e => setForm({ ...form, theme: e.target.value })}
                    placeholder="Hackathon theme"
                    style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Prize</label>
                  <input
                    type="text"
                    value={form.prize}
                    onChange={e => setForm({ ...form, prize: e.target.value })}
                    placeholder="Prize description"
                    style={{ padding: 8, borderRadius: 6, border: '1px solid var(--ink)', background: 'var(--canvas)' }}
                  />
                </div>
              </div>
            )}

            <button type="submit" disabled={submitting} style={{ marginTop: 8 }}>
              {submitting ? 'Creating...' : 'Create Event'}
            </button>
          </form>
        </section>
      )}

      {/* Registrations Tab */}
      {activeTab === 'registrations' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!selectedEventId || !selectedEvent ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ margin: '0 0 12px', opacity: 0.75 }}>
                {events.length > 0 ? 'Select an event from the Overview tab to inspect registrations.' : 'No events created yet.'}
              </p>
              <button type="button" className="btn btn--outline" onClick={() => setActiveTab('overview')}>
                Go to Overview
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  {selectedEvent.title}
                </h3>
                <button type="button" className="btn btn--ghost" onClick={() => setActiveTab('overview')}>
                  ← Back to Overview
                </button>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{eventStats?.totalRegistrations || 0}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Total Registrations</div>
                  </div>
                  {selectedEvent.type === 'hackathon' && eventStats && (
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 600 }}>{eventStats.teamRegistrations}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Teams</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{eventStats?.individualRegistrations || 0}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Individual</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{eventStats?.attendanceCount || 0}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Attended</div>
                  </div>
                </div>

                {selectedEvent.capacity > 0 && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--stone)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Participation Rate</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, height: 8, background: 'var(--ink)', opacity: 0.1, borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, ((eventStats?.totalRegistrations || 0) / selectedEvent.capacity) * 100)}%`,
                            background: (eventStats?.totalRegistrations || 0) > selectedEvent.capacity * 0.8 ? '#10b981' : '#3b82f6',
                          }}
                        />
                      </div>
                      <span>{Math.min(100, Math.round(((eventStats?.totalRegistrations || 0) / selectedEvent.capacity) * 100))}%</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}