'use client';

import { useState } from 'react';
import { formatEventDateRange } from '@/lib/dates';
import {
  EVENT_LOCATIONS,
  EVENT_MODES,
  EVENT_CATEGORIES,
  type EventCategory,
  type EventMode,
  type EventType,
  type EventWhere,
  type NoticeboardCampusEvent,
} from '@/lib/types';
import EventImageInput from './EventImageInput';
import styles from './organizer.module.css';

type Props = {
  initialEvents: NoticeboardCampusEvent[];
  loadError: string;
};

type FormState = {
  title: string;
  type: EventType;
  category: EventCategory;
  description: string;
  mode: EventMode;
  where: EventWhere;
  place: string;
  start: string;
  end: string;
  registrationDeadline: string;
  capacity: string;
  imageUrl: string;
  teamSizeMin: string;
  teamSizeMax: string;
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
  const startIso = tomorrow.toISOString().split('T')[0];
  const endIso = nextWeek.toISOString().split('T')[0];

  return {
    title: '',
    type: 'event',
    category: 'Workshop',
    description: '',
    mode: 'Offline',
    where: 'In campus',
    place: 'ADYPU Campus',
    start: startIso,
    end: endIso,
    registrationDeadline: startIso,
    capacity: '50',
    imageUrl: '',
    teamSizeMin: '1',
    teamSizeMax: '4',
    theme: '',
    prize: '',
    rules: '',
    isPublished: true,
  };
}

function formFromEvent(event: NoticeboardCampusEvent): FormState {
  return {
    title: event.title,
    type: event.type,
    category: event.category,
    description: event.description,
    mode: event.mode,
    where: event.where,
    place: event.place,
    start: event.start,
    end: event.end ?? '',
    registrationDeadline: event.registrationDeadline,
    capacity: String(event.capacity),
    imageUrl: event.imageUrl || '',
    teamSizeMin: String(event.teamSizeMin ?? 1),
    teamSizeMax: String(event.teamSizeMax ?? 4),
    theme: event.theme ?? '',
    prize: event.prize ?? '',
    rules: Array.isArray(event.rules) ? event.rules.join('\n') : '',
    isPublished: event.isPublished,
  };
}

export default function OrganizerEventManager({ initialEvents, loadError }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEditing(event: NoticeboardCampusEvent) {
    setEditingId(event.id);
    setForm(formFromEvent(event));
    setErrorMessage('');
    setSuccessMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm());
    setErrorMessage('');
    setSuccessMessage('');
  }

  async function saveEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        category: form.category,
        description: form.description.trim(),
        mode: form.mode,
        where: form.where,
        place: form.place.trim(),
        start: form.start,
        end: form.end || undefined,
        registrationDeadline: form.registrationDeadline,
        capacity: Number(form.capacity),
        imageUrl: form.imageUrl.trim() || null,
        isPublished: form.isPublished,
        teamSizeMin: form.type === 'hackathon' ? Number(form.teamSizeMin) || 1 : null,
        teamSizeMax: form.type === 'hackathon' ? Number(form.teamSizeMax) || 4 : null,
        theme: form.type === 'hackathon' ? form.theme.trim() || null : null,
        prize: form.type === 'hackathon' ? form.prize.trim() || null : null,
        rules:
          form.type === 'hackathon'
            ? form.rules
                .split('\n')
                .map((r) => r.trim())
                .filter(Boolean)
            : [],
      };

      const response = await fetch(
        editingId ? `/api/organizer/events/${editingId}` : '/api/organizer/events',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const result: { event?: NoticeboardCampusEvent; error?: string } = await response.json();
      if (!response.ok || !result.event) {
        throw new Error(result.error || 'Unable to save this event listing.');
      }

      const savedEvent = result.event;
      setEvents((current) => {
        const next = editingId
          ? current.map((item) => (item.id === savedEvent.id ? savedEvent : item))
          : [...current, savedEvent];
        return next.sort((a, b) => a.start.localeCompare(b.start));
      });
      setEditingId(null);
      setForm(emptyForm());
      setSuccessMessage(
        savedEvent.isPublished
          ? 'Event saved and published to the public listings!'
          : 'Event saved as a draft. Only organizers can see it.',
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save this event listing.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this event listing?')) return;
    setDeletingId(id);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/organizer/events/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete event.');
      }
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
      if (editingId === id) cancelEditing();
      setSuccessMessage('Event deleted successfully.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete event.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={styles.manager}>
      <section className={styles.panel} aria-labelledby="event-form-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Organizer publishing</p>
            <h2 id="event-form-title">{editingId ? 'Edit event listing' : 'Create an event listing'}</h2>
          </div>
          <p>Organizers can publish events with cover images. Published listings appear live on Events and Noticeboard.</p>
        </div>

        {loadError && <p className={styles.error} role="alert">{loadError}</p>}
        {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
        {successMessage && <p className={styles.success} role="status">{successMessage}</p>}

        <form className={styles.form} onSubmit={saveEvent}>
          <label className={styles.field}>
            <span>Event title</span>
            <input
              maxLength={160}
              required
              placeholder="e.g. Campus AI Hackathon 2026"
              value={form.title}
              onChange={(e) => updateForm('title', e.target.value)}
            />
          </label>

          {/* Event Type selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 650 }}>Event format</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className={form.type === 'event' ? 'btn btn--primary' : 'btn btn--outline'}
                onClick={() => updateForm('type', 'event')}
              >
                Standard Event / Workshop
              </button>
              <button
                type="button"
                className={form.type === 'hackathon' ? 'btn btn--primary' : 'btn btn--outline'}
                onClick={() => {
                  updateForm('type', 'hackathon');
                  updateForm('category', 'Hackathon');
                }}
              >
                Hackathon (Team-based)
              </button>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Category</span>
              <select
                value={form.category}
                onChange={(e) => {
                  const cat = EVENT_CATEGORIES.find((item) => item === e.target.value);
                  if (cat) updateForm('category', cat);
                }}
              >
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Format</span>
              <select
                value={form.mode}
                onChange={(e) => {
                  const mode = EVENT_MODES.find((item) => item === e.target.value);
                  if (mode) updateForm('mode', mode);
                }}
              >
                {EVENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Campus location</span>
              <select
                value={form.where}
                onChange={(e) => {
                  const loc = EVENT_LOCATIONS.find((item) => item === e.target.value);
                  if (loc) updateForm('where', loc);
                }}
              >
                {EVENT_LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Venue / room</span>
              <input
                maxLength={160}
                required
                placeholder="e.g. Auditorium Block B, ADYPU"
                value={form.place}
                onChange={(e) => updateForm('place', e.target.value)}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>Event details &amp; description</span>
            <textarea
              maxLength={1200}
              required
              rows={4}
              placeholder="Provide a complete description of the event..."
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
            />
          </label>

          {/* Event Cover Photo / Banner */}
          <EventImageInput
            value={form.imageUrl}
            onChange={(next) => updateForm('imageUrl', next)}
            label="Event Cover Image / Banner (Paste URL or Upload File)"
          />

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Starts</span>
              <input
                type="date"
                required
                value={form.start}
                onChange={(e) => updateForm('start', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Ends (optional)</span>
              <input
                type="date"
                min={form.start || undefined}
                value={form.end}
                onChange={(e) => updateForm('end', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Registration deadline</span>
              <input
                type="date"
                max={form.start || undefined}
                required
                value={form.registrationDeadline}
                onChange={(e) => updateForm('registrationDeadline', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Capacity (Total Seats)</span>
              <input
                type="number"
                min={1}
                max={10000}
                required
                value={form.capacity}
                onChange={(e) => updateForm('capacity', e.target.value)}
              />
            </label>
          </div>

          {form.type === 'hackathon' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: 16,
                borderRadius: 8,
                background: 'var(--panel)',
                border: '1px solid var(--border-color)',
              }}
            >
              <h4 style={{ margin: 0, fontSize: 15 }}>Hackathon settings</h4>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Min team size</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.teamSizeMin}
                    onChange={(e) => updateForm('teamSizeMin', e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Max team size</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.teamSizeMax}
                    onChange={(e) => updateForm('teamSizeMax', e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Challenge theme</span>
                  <input
                    maxLength={140}
                    placeholder="e.g. Next-Gen Student AI"
                    value={form.theme}
                    onChange={(e) => updateForm('theme', e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Prizes</span>
                  <input
                    maxLength={140}
                    placeholder="e.g. Cash Prize ₹50,000 + Goodies"
                    value={form.prize}
                    onChange={(e) => updateForm('prize', e.target.value)}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span>Rules (one per line)</span>
                <textarea
                  rows={3}
                  placeholder="Original code only&#10;Teams of 1-4 members&#10;Presentation on final day"
                  value={form.rules}
                  onChange={(e) => updateForm('rules', e.target.value)}
                />
              </label>
            </div>
          )}

          <label className={styles.publishToggle}>
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => updateForm('isPublished', e.target.checked)}
            />
            <span>Publish this event to the public Noticeboard and Events page</span>
          </label>

          <div className={styles.actions}>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : form.isPublished ? 'Save and publish' : 'Save draft'}
            </button>
            {editingId && (
              <button type="button" className="btn btn--ghost" onClick={cancelEditing} disabled={submitting}>
                Cancel editing
              </button>
            )}
          </div>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="event-list-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Your event catalog</p>
            <h2 id="event-list-title">Listings and drafts ({events.length})</h2>
          </div>
          <p>Click Edit to change dates, cover images, capacity, or publish state.</p>
        </div>
        {events.length ? (
          <ul className={styles.eventList}>
            {events.map((event) => (
              <li className={styles.eventRow} key={event.id}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
                  {event.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={event.imageUrl}
                      alt=""
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 6,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <div className={styles.eventMeta}>
                      <span data-status={event.isPublished ? 'published' : 'draft'}>
                        {event.isPublished ? 'Published' : 'Draft'}
                      </span>
                      <span>{formatEventDateRange(event.start, event.end)}</span>
                      <span>Capacity: {event.capacity}</span>
                    </div>
                    <h3>{event.title}</h3>
                    <p>{event.category} · {event.place} · {event.type}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn--ghost" onClick={() => startEditing(event)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline"
                    disabled={deletingId === event.id}
                    onClick={() => handleDelete(event.id)}
                    style={{ color: 'var(--coral, #ef4444)' }}
                  >
                    {deletingId === event.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyState}>No event listings yet. Create a draft above to get started.</p>
        )}
      </section>
    </div>
  );
}
