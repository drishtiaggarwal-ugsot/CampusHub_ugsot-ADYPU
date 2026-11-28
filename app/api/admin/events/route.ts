import { NextResponse } from 'next/server';
import { createDbClient, isFirestoreConfigured } from '@/lib/db/client';
import { getEventRegistrations, mapEventRow } from '@/lib/db/admin-events';
import { getCurrentUser } from '@/lib/auth';

function isValidImageValue(val: string): boolean {
  if (/^https?:\/\/\S+$/i.test(val) || val.startsWith('/')) {
    return val.length <= 2000;
  }
  return (
    val.length <= 450000 &&
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(val)
  );
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (currentUser.role !== 'organizer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId')?.trim();
  if (!eventId) {
    return NextResponse.json({ error: 'eventId query param is required.' }, { status: 400 });
  }

  const registrations = await getEventRegistrations(eventId);
  return NextResponse.json({ registrations });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (currentUser.role !== 'organizer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const available = await isFirestoreConfigured();
  if (!available) {
    return NextResponse.json({ error: 'Firestore is not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid event payload.' }, { status: 400 });
  }

  const event = body as Partial<{
    title: string;
    description: string;
    capacity: number;
    event_type: 'event' | 'hackathon';
    category: string;
    mode: 'Online' | 'Offline';
    event_where: 'In campus' | 'Out of campus';
    place: string;
    start_date: string;
    end_date: string | null;
    registration_deadline: string;
    image_url: string | null;
    team_size_min: number | null;
    team_size_max: number | null;
    theme: string | null;
    prize: string | null;
    rules: string[];
    is_published: boolean;
  }>;

  if (typeof event.title !== 'string' || !event.title.trim() || typeof event.start_date !== 'string' || !event.start_date.trim()) {
    return NextResponse.json({ error: 'Event title and start date are required.' }, { status: 400 });
  }

  let imageUrl: string | null = null;
  if (typeof event.image_url === 'string' && event.image_url.trim()) {
    const cleaned = event.image_url.trim();
    if (!isValidImageValue(cleaned)) {
      return NextResponse.json(
        { error: 'Image must be an https:// URL or uploaded PNG/JPEG/WebP image under 450 KB.' },
        { status: 400 },
      );
    }
    imageUrl = cleaned;
  }

  const db = await createDbClient();
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  try {
    const { data, error } = await db.from('event_catalog').insert({
      id,
      title: event.title.trim(),
      description: typeof event.description === 'string' ? event.description.trim() : '',
      capacity: typeof event.capacity === 'number' && event.capacity > 0 ? event.capacity : 50,
      event_type: event.event_type === 'hackathon' ? 'hackathon' : 'event',
      category: typeof event.category === 'string' ? event.category : 'Workshop',
      mode: event.mode === 'Online' ? 'Online' : 'Offline',
      event_where: event.event_where === 'Out of campus' ? 'Out of campus' : 'In campus',
      place: typeof event.place === 'string' && event.place.trim() ? event.place.trim() : 'ADYPU Campus',
      start_date: event.start_date,
      end_date: event.end_date ?? null,
      registration_deadline: typeof event.registration_deadline === 'string' && event.registration_deadline ? event.registration_deadline : event.start_date,
      image_url: imageUrl,
      team_size_min: event.team_size_min ?? null,
      team_size_max: event.team_size_max ?? null,
      theme: event.theme ?? null,
      prize: event.prize ?? null,
      rules: Array.isArray(event.rules) ? event.rules : [],
      is_published: Boolean(event.is_published),
      noticeboard_managed: true,
      noticeboard_updated_at: new Date().toISOString(),
    }).select().single();

    if (error || !data) {
      console.error('Error creating event:', error);
      return NextResponse.json({ error: error?.message || 'Failed to create event' }, { status: 500 });
    }

    return NextResponse.json({ event: mapEventRow(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    console.error('Failed to create event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (currentUser.role !== 'organizer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const available = await isFirestoreConfigured();
  if (!available) {
    return NextResponse.json({ error: 'Firestore is not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const rawBody = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const url = new URL(request.url);
  const eventId =
    url.searchParams.get('id')?.trim() ||
    (typeof rawBody.id === 'string' ? rawBody.id.trim() : '');

  if (!eventId) {
    return NextResponse.json({ error: 'Event ID is required (?id=... or body.id).' }, { status: 400 });
  }

  if ('image_url' in rawBody && typeof rawBody.image_url === 'string' && rawBody.image_url.trim()) {
    if (!isValidImageValue(rawBody.image_url.trim())) {
      return NextResponse.json(
        { error: 'Image must be an https:// URL or uploaded PNG/JPEG/WebP image under 450 KB.' },
        { status: 400 },
      );
    }
  }

  const allowedUpdates: Record<string, unknown> = {
    noticeboard_updated_at: new Date().toISOString(),
  };
  const allowedKeys = [
    'title', 'description', 'capacity', 'event_type', 'category', 'mode',
    'event_where', 'place', 'start_date', 'end_date', 'registration_deadline',
    'image_url', 'team_size_min', 'team_size_max', 'theme', 'prize', 'rules', 'is_published',
  ];
  for (const key of allowedKeys) {
    if (key in rawBody) {
      allowedUpdates[key] =
        key === 'image_url'
          ? (typeof rawBody[key] === 'string' && rawBody[key].trim() ? rawBody[key].trim() : null)
          : rawBody[key];
    }
  }

  const db = await createDbClient();

  try {
    const { data, error } = await db.from('event_catalog')
      .update(allowedUpdates)
      .eq('id', eventId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating event:', error);
      return NextResponse.json({ error: error.message || 'Failed to update event' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ event: mapEventRow(data as Record<string, unknown>) }, { status: 200 });
  } catch (error) {
    console.error('Failed to update event:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (currentUser.role !== 'organizer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const available = await isFirestoreConfigured();
  if (!available) {
    return NextResponse.json({ error: 'Firestore is not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get('id')?.trim() || '';

  if (!eventId) {
    return NextResponse.json({ error: 'Event ID is required (?id=...).' }, { status: 400 });
  }

  const db = await createDbClient();

  try {
    const { error } = await db.from('event_catalog')
      .delete()
      .eq('id', eventId);

    if (error) {
      console.error('Error deleting event:', error);
      return NextResponse.json({ error: error.message || 'Failed to delete event' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete event:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
