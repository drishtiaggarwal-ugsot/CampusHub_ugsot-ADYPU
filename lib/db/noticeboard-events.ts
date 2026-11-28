import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/lib/db/database.types';
import { getCurrentUser } from '@/lib/auth';
import { createDbClient } from '@/lib/db/client';
import { todayISO } from '@/lib/dates';
import {
  EVENT_CATEGORIES,
  EVENT_LOCATIONS,
  EVENT_MODES,
  type EventCategory,
  type EventMode,
  type EventType,
  type EventWhere,
  type NoticeboardCampusEvent,
  type NoticeboardEventInput,
} from '@/lib/types';

type EventCatalogRow = Database['public']['Tables']['event_catalog']['Row'];

const EVENT_FIELDS =
  'id,title,category,description,mode,event_where,place,start_date,end_date,registration_deadline,capacity,is_published,event_type,image_url,team_size_min,team_size_max,theme,prize,rules';

const eventCategories = new Set<string>(EVENT_CATEGORIES);
const eventModes = new Set<string>(EVENT_MODES);
const eventLocations = new Set<string>(EVENT_LOCATIONS);

function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === 'string' && eventCategories.has(value);
}

function isEventMode(value: unknown): value is EventMode {
  return typeof value === 'string' && eventModes.has(value);
}

function isEventLocation(value: unknown): value is EventWhere {
  return typeof value === 'string' && eventLocations.has(value);
}

function isValidEventImageString(value: string): boolean {
  if (/^https?:\/\/\S+$/i.test(value) || value.startsWith('/')) {
    return value.length <= 2000;
  }
  return (
    value.length <= 450000 &&
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}

export class NoticeboardEventError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'NoticeboardEventError';
  }
}

function mapEvent(row: EventCatalogRow): NoticeboardCampusEvent {
  const category: EventCategory = isEventCategory(row.category)
    ? row.category
    : row.event_type === 'hackathon'
      ? 'Hackathon'
      : 'Workshop';
  const mode: EventMode = isEventMode(row.mode) ? row.mode : 'Offline';
  const where: EventWhere = isEventLocation(row.event_where) ? row.event_where : 'In campus';
  const fallbackDate = row.registration_deadline || todayISO();
  const start = row.start_date || fallbackDate;
  const eventType: EventType = row.event_type === 'hackathon' ? 'hackathon' : 'event';
  const base = {
    id: row.id,
    title: row.title || 'Campus Event',
    category,
    description: row.description || '',
    mode,
    where,
    place: row.place || 'ADYPU Campus',
    start,
    ...(row.end_date ? { end: row.end_date } : {}),
    registrationDeadline: row.registration_deadline || start,
    capacity: typeof row.capacity === 'number' && row.capacity > 0 ? row.capacity : 50,
    isPublished: Boolean(row.is_published),
    imageUrl: row.image_url || null,
  };

  if (eventType === 'hackathon') {
    return {
      ...base,
      type: 'hackathon',
      teamSizeMin: row.team_size_min ?? 1,
      teamSizeMax: row.team_size_max ?? 4,
      theme: row.theme ?? '',
      prize: row.prize ?? '',
      rules: Array.isArray(row.rules) ? row.rules : [],
    };
  }

  return {
    ...base,
    type: 'event',
  };
}

export async function getPublishedNoticeboardEvents(
  limit = 100,
): Promise<NoticeboardCampusEvent[]> {
  const supabase = await createDbClient();
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 100;
  // Single equality filter avoids requiring a multi-field Firestore composite index.
  const { data, error } = await supabase
    .from('event_catalog')
    .select(EVENT_FIELDS)
    .eq('is_published', true);

  if (error) {
    console.warn('Unable to load published campus events:', error.message);
    return [];
  }

  const today = todayISO();
  return (data ?? [])
    .map(mapEvent)
    .filter((event) => (event.end ?? event.start) >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, safeLimit);
}

export async function getOrganizerNoticeboardEvents(): Promise<NoticeboardCampusEvent[]> {
  await requireOrganizer();
  const supabase = await createDbClient();
  const { data, error } = await supabase
    .from('event_catalog')
    .select(EVENT_FIELDS);

  if (error) {
    console.warn('Unable to load organizer event listings:', error.message);
    return [];
  }
  return (data ?? [])
    .map(mapEvent)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new NoticeboardEventError(`${field} is required and must be at most ${maxLength} characters.`, 400);
  }
  return value.trim();
}

function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseNoticeboardEventInput(value: unknown): NoticeboardEventInput {
  if (!isRecord(value)) {
    throw new NoticeboardEventError('Event details must be sent as an object.', 400);
  }

  const title = requiredText(value.title, 'Title', 160);
  const description = requiredText(value.description, 'Description', 1200);
  const place = requiredText(value.place, 'Location', 160);
  const category = value.category;
  const mode = value.mode;
  const where = value.where;
  const start = value.start;
  const end = value.end;
  const registrationDeadline = value.registrationDeadline;
  const capacity = value.capacity;
  const isPublished = value.isPublished;
  const rawType = value.type;
  const rawImage = value.imageUrl;

  if (!isEventCategory(category)) {
    throw new NoticeboardEventError('Choose a valid event category.', 400);
  }
  if (!isEventMode(mode)) {
    throw new NoticeboardEventError('Choose a valid event mode.', 400);
  }
  if (!isEventLocation(where)) {
    throw new NoticeboardEventError('Choose a valid campus location type.', 400);
  }
  if (!isISODate(start) || !isISODate(registrationDeadline)) {
    throw new NoticeboardEventError('Enter a valid event date and registration deadline.', 400);
  }
  if (end !== undefined && end !== null && end !== '' && !isISODate(end)) {
    throw new NoticeboardEventError('Enter a valid event end date.', 400);
  }
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
    throw new NoticeboardEventError('Capacity must be a whole number between 1 and 10,000.', 400);
  }
  if (typeof isPublished !== 'boolean') {
    throw new NoticeboardEventError('Choose whether to publish this event.', 400);
  }

  let imageUrl: string | null = null;
  if (typeof rawImage === 'string' && rawImage.trim()) {
    const cleanedImage = rawImage.trim();
    if (!isValidEventImageString(cleanedImage)) {
      throw new NoticeboardEventError(
        'Image must be a valid https:// URL or an uploaded PNG/JPEG/WebP image under 450 KB.',
        400,
      );
    }
    imageUrl = cleanedImage;
  }

  const endDate = typeof end === 'string' && end ? end : undefined;
  if (endDate && endDate < start) {
    throw new NoticeboardEventError('The event end date cannot be before its start date.', 400);
  }
  if (registrationDeadline > start) {
    throw new NoticeboardEventError('The registration deadline cannot be after the event starts.', 400);
  }
  if (isPublished && (endDate ?? start) < todayISO()) {
    throw new NoticeboardEventError('Past events cannot be published as upcoming listings.', 400);
  }

  const type: EventType =
    rawType === 'hackathon' || (rawType === undefined && category === 'Hackathon')
      ? 'hackathon'
      : 'event';

  const teamSizeMin =
    type === 'hackathon' && typeof value.teamSizeMin === 'number' && Number.isInteger(value.teamSizeMin)
      ? Math.max(1, Math.min(20, value.teamSizeMin))
      : type === 'hackathon'
        ? 1
        : null;
  const teamSizeMax =
    type === 'hackathon' && typeof value.teamSizeMax === 'number' && Number.isInteger(value.teamSizeMax)
      ? Math.max(teamSizeMin ?? 1, Math.min(20, value.teamSizeMax))
      : type === 'hackathon'
        ? 4
        : null;

  return {
    title,
    type,
    category,
    description,
    mode,
    where,
    place,
    start,
    ...(endDate ? { end: endDate } : {}),
    registrationDeadline,
    capacity,
    isPublished,
    imageUrl,
    teamSizeMin,
    teamSizeMax,
    theme: type === 'hackathon' && typeof value.theme === 'string' ? value.theme.trim() || null : null,
    prize: type === 'hackathon' && typeof value.prize === 'string' ? value.prize.trim() || null : null,
    rules:
      type === 'hackathon' && Array.isArray(value.rules)
        ? value.rules.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((r) => r.trim())
        : [],
  };
}

async function requireOrganizer(): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new NoticeboardEventError('Sign in to manage event listings.', 401);
  if (currentUser.role !== 'organizer') {
    throw new NoticeboardEventError('Only organizers can manage event listings.', 403);
  }
}

function toCatalogFields(input: NoticeboardEventInput) {
  const eventType = input.type ?? (input.category === 'Hackathon' ? 'hackathon' : 'event');
  return {
    title: input.title,
    capacity: input.capacity,
    registration_deadline: input.registrationDeadline,
    event_type: eventType,
    noticeboard_managed: true,
    category: input.category,
    description: input.description,
    mode: input.mode,
    event_where: input.where,
    place: input.place,
    start_date: input.start,
    end_date: input.end ?? null,
    image_url: input.imageUrl ?? null,
    team_size_min: eventType === 'hackathon' ? (input.teamSizeMin ?? 1) : null,
    team_size_max: eventType === 'hackathon' ? (input.teamSizeMax ?? 4) : null,
    theme: eventType === 'hackathon' ? (input.theme ?? null) : null,
    prize: eventType === 'hackathon' ? (input.prize ?? null) : null,
    rules: eventType === 'hackathon' ? (input.rules ?? []) : [],
    is_published: input.isPublished,
    noticeboard_updated_at: new Date().toISOString(),
  };
}

export async function createNoticeboardEvent(
  input: NoticeboardEventInput,
): Promise<NoticeboardCampusEvent> {
  await requireOrganizer();
  const supabase = await createDbClient();
  const { data, error } = await supabase
    .from('event_catalog')
    .insert({ id: randomUUID(), ...toCatalogFields(input) })
    .select(EVENT_FIELDS)
    .single();

  if (error || !data) throw new Error(`Unable to create campus event: ${error?.message || 'Unknown error'}`);
  return mapEvent(data);
}

export async function updateNoticeboardEvent(
  id: string,
  input: NoticeboardEventInput,
): Promise<NoticeboardCampusEvent> {
  await requireOrganizer();
  const supabase = await createDbClient();
  const { data, error } = await supabase
    .from('event_catalog')
    .update(toCatalogFields(input))
    .eq('id', id)
    .select(EVENT_FIELDS)
    .maybeSingle();

  if (error) throw new Error(`Unable to update campus event: ${error.message}`);
  if (!data) throw new NoticeboardEventError('This event listing no longer exists.', 404);
  return mapEvent(data);
}

export async function deleteNoticeboardEvent(id: string): Promise<void> {
  await requireOrganizer();
  const supabase = await createDbClient();
  const { error } = await supabase.from('event_catalog').delete().eq('id', id);
  if (error) throw new Error(`Unable to delete campus event: ${error.message}`);
}
