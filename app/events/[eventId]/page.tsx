import Link from 'next/link';
import { notFound } from 'next/navigation';
import EventRegistrationControl from '@/components/EventRegistrationControl';
import HackathonAnnouncements from '@/components/HackathonAnnouncements';
import HackathonTeamRegistration from '@/components/HackathonTeamRegistration';
import PageHero from '@/components/PageHero';
import { getCurrentUser } from '@/lib/auth';
import { getPublicStudents } from '@/lib/db/dashboard';
import { dayRange, formatShort, parseDate, MONTHS_SHORT } from '@/lib/dates';
import {
  findEventMeta,
  getEventRegistrationStatuses,
  getHackathonPageData,
  type EventRegistrationStatus,
  type HackathonPageData,
} from '@/lib/db/events';
import { getMyTeamInvitations } from '@/lib/db/teams';
import type { CampusEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ eventId: string }> };

function getTodayInIndia(): string {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = dateParts.find((item) => item.type === 'year')?.value;
  const month = dateParts.find((item) => item.type === 'month')?.value;
  const day = dateParts.find((item) => item.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Unable to determine today’s date in India.');
  return `${year}-${month}-${day}`;
}

export async function generateMetadata({ params }: Props) {
  const { eventId } = await params;
  const event = await findEventMeta(eventId);
  return { title: event ? `${event.title} · CampusHub · UGSOT` : 'Event · CampusHub · UGSOT' };
}

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const event = await findEventMeta(eventId);
  if (!event) notFound();

  const [currentUser, registeredStudents, myInvites] = await Promise.all([
    getCurrentUser(),
    getPublicStudents().catch(() => []),
    getMyTeamInvitations().catch(() => ({ received: [], sent: [] })),
  ]);

  let registrationStatus: EventRegistrationStatus | undefined;
  let registrationUnavailable = false;
  try {
    const statuses = await getEventRegistrationStatuses([eventId]);
    registrationStatus = statuses[0];
  } catch (error) {
    console.error('Unable to load event registration status.', error);
    registrationUnavailable = true;
  }

  let data: HackathonPageData | null = null;
  let dataError = '';
  try {
    data = await getHackathonPageData(eventId);
  } catch (error) {
    console.error('Unable to load event details.', error);
    dataError = 'Event announcements and team formation are temporarily unavailable. Please try again shortly.';
  }

  const teamSizeMin = data?.teamSizeMin ?? event.teamSizeMin ?? 1;
  const teamSizeMax = data?.teamSizeMax ?? event.teamSizeMax ?? 4;
  const rules = data?.rules ?? event.rules ?? [];
  const theme = data?.theme ?? event.theme ?? '';
  const prize = data?.prize ?? event.prize ?? '';
  const showHackathonDetails = event.type === 'hackathon' || Boolean(theme || prize || rules.length);

  const registrationEvent: CampusEvent = event.type === 'hackathon'
    ? {
        id: event.id,
        title: event.title,
        type: 'hackathon',
        category: event.category as CampusEvent['category'],
        mode: event.mode as CampusEvent['mode'],
        where: event.where as CampusEvent['where'],
        place: event.place,
        start: event.start,
        end: event.end,
        registrationDeadline: data?.registrationDeadline ?? event.registrationDeadline,
        capacity: data?.capacity ?? event.capacity,
        teamSizeMin,
        teamSizeMax,
        theme,
        prize,
        rules,
      }
    : {
        id: event.id,
        title: event.title,
        type: 'event',
        category: event.category as CampusEvent['category'],
        mode: event.mode as CampusEvent['mode'],
        where: event.where as CampusEvent['where'],
        place: event.place,
        start: event.start,
        end: event.end,
        registrationDeadline: data?.registrationDeadline ?? event.registrationDeadline,
        capacity: data?.capacity ?? event.capacity,
      };

  const eventReceivedInvites = myInvites.received.filter((inv) => inv.eventId === eventId);
  const eventSentInvites = myInvites.sent.filter((inv) => inv.eventId === eventId);

  return (
    <main className="container page hackathon-page">
      <Link href="/events" className="back-link">← All events</Link>
      {event.imageUrl && (
        <div
          style={{
            marginBottom: 20,
            borderRadius: 12,
            overflow: 'hidden',
            maxHeight: 380,
            width: '100%',
            background: 'var(--border, #eee)',
            border: '1px solid var(--border, #ddd)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.imageUrl}
            alt={event.title}
            style={{ width: '100%', maxHeight: 380, objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}
      <PageHero
        tag={event.type === 'hackathon' ? 'Hackathon' : event.category}
        before=""
        highlight={event.title}
        sub={`${event.category} · ${event.mode} · ${event.where} · ${event.place}`}
      />
      {currentUser?.role === 'organizer' && (
        <section
          className="card"
          style={{
            marginBottom: 20,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            background: 'var(--card)',
            border: '2px solid var(--accent)',
          }}
        >
          <div>
            <span className="eyebrow" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              Organizer Tools
            </span>
            <h3 style={{ margin: '2px 0 0', fontSize: 18 }}>Attendance & Check-in</h3>
          </div>
          <Link
            href={`/events/${eventId}/attendance`}
            className="btn btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span>📋</span> Take Attendance & Roll Call
          </Link>
        </section>
      )}
      {dataError && <p className="form-error" role="alert">{dataError}</p>}

      <section className="card hackathon-overview" aria-labelledby="hackathon-overview-title">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <h2 id="hackathon-overview-title" className="card__title" style={{ margin: 0 }}>
            Step 1 · Event Registration & Details
          </h2>
          <EventRegistrationControl
            event={registrationEvent}
            status={registrationStatus}
            signedIn={Boolean(currentUser)}
            unavailable={registrationUnavailable}
          />
        </div>
        <dl className="hackathon-facts">
          <div>
            <dt>Date</dt>
            <dd>{MONTHS_SHORT[parseDate(event.start).getMonth()]} {dayRange(event)}, {parseDate(event.start).getFullYear()}</dd>
          </div>
          <div>
            <dt>Registration deadline</dt>
            <dd>{formatShort(data?.registrationDeadline ?? event.registrationDeadline)}</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>{data?.capacity ?? event.capacity} participants</dd>
          </div>
          <div>
            <dt>Slots left</dt>
            <dd style={{ fontWeight: 700, color: (registrationStatus?.seatsLeft ?? 0) > 0 ? '#0e7a41' : '#c0392b' }}>
              {registrationStatus ? `${registrationStatus.seatsLeft} of ${data?.capacity ?? event.capacity} remaining` : `${data?.capacity ?? event.capacity} remaining`}
            </dd>
          </div>
          <div>
            <dt>Team size</dt>
            <dd>{teamSizeMin}–{teamSizeMax} members, including the leader</dd>
          </div>
        </dl>
      </section>

      {showHackathonDetails && (
        <section className="hackathon-details-grid" aria-label="Event theme, prize and rules">
          <article className="card hackathon-panel">
            <p className="eyebrow">The challenge</p>
            <h2 className="card__title">Theme</h2>
            <p>{theme || 'Open campus innovation'}</p>
          </article>
          <article className="card hackathon-panel">
            <p className="eyebrow">What you can win</p>
            <h2 className="card__title">Prizes</h2>
            <p>{prize || 'Certificates & campus recognition'}</p>
          </article>
          <article className="card hackathon-panel">
            <p className="eyebrow">Before you build</p>
            <h2 className="card__title">Rules</h2>
            {rules.length ? (
              <ul className="hackathon-rules">
                {rules.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
            ) : (
              <p className="empty-note">No specific rules have been published yet.</p>
            )}
          </article>
        </section>
      )}

      {data ? (
        <>
          <HackathonAnnouncements eventId={eventId} announcements={data.announcements}
            isOrganizer={currentUser?.role === 'organizer'} />
          <HackathonTeamRegistration
            eventId={eventId}
            eventTitle={event.title}
            registrationDeadline={data.registrationDeadline}
            registrationClosed={data.registrationDeadline < getTodayInIndia()}
            isRegistered={registrationStatus?.isRegistered ?? false}
            teamSizeMin={teamSizeMin}
            teamSizeMax={teamSizeMax}
            teams={data.teams}
            studentsLookingForTeam={registeredStudents.filter((student) => {
              const sEmail = (student.email || '').toLowerCase().trim();
              const myEmail = (currentUser?.email || '').toLowerCase().trim();
              const isSelf = Boolean(
                (currentUser && student.id === currentUser.id) ||
                (myEmail && sEmail && sEmail === myEmail),
              );
              return student.lookingForTeam && !isSelf;
            })}
            invitableStudents={registeredStudents.filter((student) => {
              const sEmail = (student.email || '').toLowerCase().trim();
              const myEmail = (currentUser?.email || '').toLowerCase().trim();
              const isSelf = Boolean(
                (currentUser && student.id === currentUser.id) ||
                (myEmail && sEmail && sEmail === myEmail),
              );
              return !isSelf;
            })}
            receivedInvites={eventReceivedInvites}
            sentInvites={eventSentInvites}
            currentUserEmail={currentUser?.email ?? null}
          />
        </>
      ) : (
        <section className="card hackathon-panel" aria-label="Announcements and team registration unavailable">
          <p>Announcements and team formation could not be loaded right now. Check your Firestore connection and try again.</p>
        </section>
      )}
    </main>
  );
}
