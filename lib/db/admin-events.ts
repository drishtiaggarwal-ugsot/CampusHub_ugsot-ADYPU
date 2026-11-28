'server-only';
import type { EventCategory, EventMode, EventType, EventWhere, NoticeboardCampusEvent } from '@/lib/types';
import { createDbClient } from '@/lib/db/client';

export type EventRegistrationStats = {
  eventId: string;
  totalRegistrations: number;
  teamRegistrations: number;
  individualRegistrations: number;
  attendanceCount: number;
};

export type AdminEventsData = {
  events: NoticeboardCampusEvent[];
  stats: EventRegistrationStats[];
};

/**
 * Get all events with their registration statistics for the admin dashboard
 */
export async function getAdminEventsData(): Promise<AdminEventsData> {
  const db = await createDbClient();

  let events: NoticeboardCampusEvent[] = [];
  try {
    const eventRes = await db.from('event_catalog').select('*');
    if (eventRes.data && eventRes.data.length > 0) {
      events = eventRes.data
        .map(mapEventRow)
        .sort((a, b) => a.start.localeCompare(b.start));
    }
  } catch (error) {
    console.warn('Could not load events from database:', error);
  }

  const stats: EventRegistrationStats[] = await Promise.all(
    events.map(async (event) => {
      try {
        const [regRes, teamRes, attendanceRes] = await Promise.all([
          db.from('event_registrations').select('id').eq('event_id', event.id),
          db.from('event_teams').select('id').eq('event_id', event.id),
          db.from('event_attendance').select('status').eq('event_id', event.id),
        ]);
        const totalRegistrations = regRes.data?.length ?? 0;
        const teamRegistrations = teamRes.data?.length ?? 0;
        const attendanceCount = (attendanceRes.data ?? []).filter(
          (row) => row.status === 'present',
        ).length;

        return {
          eventId: event.id,
          totalRegistrations,
          teamRegistrations,
          individualRegistrations: totalRegistrations,
          attendanceCount,
        };
      } catch (error) {
        console.warn(`Could not load stats for event ${event.id}:`, error);
        return {
          eventId: event.id,
          totalRegistrations: 0,
          teamRegistrations: 0,
          individualRegistrations: 0,
          attendanceCount: 0,
        };
      }
    }),
  );

  return { events, stats };
}

/**
 * Fetch event registrations with attendee details
 */
export async function getEventRegistrations(eventId: string, limit = 100) {
  const db = await createDbClient();

  try {
    const [regRes, profilesRes] = await Promise.all([
      db.from('event_registrations').select('id,user_id,registered_at').eq('event_id', eventId).limit(limit),
      db.from('profiles').select('id,full_name,email,skills'),
    ]);

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p]),
    );

    return (regRes.data ?? [])
      .map((reg) => {
        const prof = profileMap.get(reg.user_id);
        return {
          id: reg.id,
          userId: reg.user_id,
          registeredAt: reg.registered_at,
          name: prof?.full_name || prof?.email?.split('@')[0] || 'Student',
          email: prof?.email || '',
          skills: Array.isArray(prof?.skills) ? prof.skills : [],
        };
      })
      .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  } catch (error) {
    console.error('Failed to fetch event registrations:', error);
    return [];
  }
}

/**
 * Map event catalog row to NoticeboardCampusEvent type
 */
export function mapEventRow(row: Record<string, unknown>): NoticeboardCampusEvent {
  const type: EventType = row.event_type === 'hackathon' ? 'hackathon' : 'event';
  const start = (row.start_date as string) || (row.registration_deadline as string) || '';
  const base = {
    id: row.id as string,
    title: (row.title as string) || 'Campus Event',
    description: (row.description as string) || '',
    category: ((row.category as EventCategory) || (type === 'hackathon' ? 'Hackathon' : 'Workshop')),
    mode: ((row.mode as EventMode) || 'Offline'),
    where: ((row.event_where as EventWhere) || 'In campus'),
    place: (row.place as string) || 'ADYPU Campus',
    start,
    ...(row.end_date ? { end: row.end_date as string } : {}),
    registrationDeadline: (row.registration_deadline as string) || start,
    capacity: typeof row.capacity === 'number' ? row.capacity : 50,
    isPublished: Boolean(row.is_published),
    imageUrl: (row.image_url as string | null | undefined) ?? null,
    registerUrl: row.register_url as string | undefined,
  };

  if (type === 'hackathon') {
    return {
      ...base,
      type: 'hackathon',
      teamSizeMin: typeof row.team_size_min === 'number' ? row.team_size_min : 1,
      teamSizeMax: typeof row.team_size_max === 'number' ? row.team_size_max : 4,
      theme: (row.theme as string | undefined) || '',
      prize: (row.prize as string | undefined) || '',
      rules: Array.isArray(row.rules) ? (row.rules as string[]) : [],
    };
  }

  return {
    ...base,
    type: 'event',
  };
}
