import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createDbClient } from '@/lib/db/client';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(currentUser)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = await createDbClient();
    const [certsRes, profilesRes, eventsRes] = await Promise.all([
      db.from('event_certificates').select('*').order('issued_at', { ascending: false }).limit(150),
      db.from('profiles').select('id, full_name, email, course_year'),
      db.from('event_catalog').select('id, title, start_date'),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
    const eventMap = new Map((eventsRes.data || []).map((e) => [e.id, e]));

    const certificates = (certsRes.data || []).map((c) => {
      const p = profileMap.get(c.user_id);
      const e = eventMap.get(c.event_id);
      return {
        id: c.id,
        certificateId: c.id,
        certificateNumber: (c as { certificate_number?: string }).certificate_number || c.id.slice(0, 8).toUpperCase(),
        eventId: c.event_id,
        eventTitle: e?.title || c.event_id,
        userId: c.user_id,
        attendeeName: p?.full_name || 'Student',
        attendeeEmail: p?.email || '',
        courseYear: p?.course_year || '',
        issuedAt: c.issued_at,
      };
    });

    return NextResponse.json({ certificates });
  } catch (error) {
    console.error('Error fetching certificates:', error);
    return NextResponse.json({ error: 'Failed to load certificates.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(currentUser)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Payload must be an object' }, { status: 400 });
  }

  const { eventId, userId, certificateNumber } = body as {
    eventId?: unknown;
    userId?: unknown;
    certificateNumber?: unknown;
  };

  if (typeof eventId !== 'string' || !eventId.trim()) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  }
  if (typeof userId !== 'string' || !userId.trim()) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const cleanEventId = eventId.trim();
  const cleanUserId = userId.trim();

  try {
    const db = await createDbClient();

    // Verify user exists
    const { data: profile } = await db
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', cleanUserId)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Student profile not found.' }, { status: 404 });
    }

    // Verify event exists
    const { data: eventItem } = await db
      .from('event_catalog')
      .select('id, title')
      .eq('id', cleanEventId)
      .maybeSingle();

    if (!eventItem) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    // Check if certificate already exists
    const { data: existing } = await db
      .from('event_certificates')
      .select('id, certificate_number')
      .eq('event_id', cleanEventId)
      .eq('user_id', cleanUserId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error: `A certificate is already issued for this student for "${eventItem.title}". ID: ${existing.id}`,
          certificateId: existing.id,
        },
        { status: 409 },
      );
    }

    // Generate unique certificate ID & Certificate Number
    const certUuid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `cert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const certNum = typeof certificateNumber === 'string' && certificateNumber.trim()
      ? certificateNumber.trim().toUpperCase()
      : `CERT-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const nowIso = new Date().toISOString();

    const { data, error } = await db
      .from('event_certificates')
      .insert({
        id: certUuid,
        event_id: cleanEventId,
        user_id: cleanUserId,
        certificate_number: certNum,
        issued_at: nowIso,
      })
      .select('id, certificate_number, issued_at')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to insert certificate into database.' },
        { status: 500 },
      );
    }

    // Send in-app notification to the student
    try {
      const { createNotification } = await import('@/lib/db/notifications');
      await createNotification({
        userId: cleanUserId,
        type: 'system',
        title: 'New Certificate Issued',
        message: `Your certificate for "${eventItem.title}" has been issued (Certificate No: ${certNum}).`,
        linkUrl: `/certificates/${data.id}`,
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      certificate: {
        id: data.id,
        certificateId: data.id,
        certificateNumber: certNum,
        eventId: cleanEventId,
        eventTitle: eventItem.title,
        userId: cleanUserId,
        attendeeName: profile.full_name || profile.email,
        issuedAt: nowIso,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to issue certificate.' },
      { status: 500 },
    );
  }
}
