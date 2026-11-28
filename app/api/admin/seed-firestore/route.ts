import { NextResponse } from 'next/server';
import { getCurrentUser, getSessionIdToken, isAdmin } from '@/lib/auth';
import { firestoreSetDoc } from '@/lib/db/firestore-rest';

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!isAdmin(currentUser)) {
    return NextResponse.json({ error: 'Organizer access required' }, { status: 403 });
  }

  const idToken = await getSessionIdToken();
  const nowIso = new Date().toISOString();

  // 1. Seed system ping
  const pingRes = await firestoreSetDoc(
    'system_meta',
    'ping',
    {
      status: 'active',
      initializedAt: nowIso,
      updatedBy: currentUser.email,
    },
    idToken,
    true,
  );

  if (!pingRes.ok) {
    return NextResponse.json(
      {
        error: 'Firestore write rejected by Security Rules in Firebase Console.',
        details: pingRes.error,
        help: 'Open Firebase Console > Cloud Firestore > Security tab, and allow read/write permissions.',
      },
      { status: 403 },
    );
  }

  // 2. Seed admin profile
  await firestoreSetDoc(
    'profiles',
    currentUser.id,
    {
      id: currentUser.id,
      email: currentUser.email,
      full_name: currentUser.name || 'Sahil Dehadray',
      role: 'organizer',
      course_year: 'CSE · 3rd year',
      skills: ['React', 'TypeScript', 'Next.js', 'Firebase'],
      bio: 'Student & organizer at UGSOT ADYPU.',
      created_at: nowIso,
      updated_at: nowIso,
    },
    idToken,
    true,
  );

  // 3. Seed sample event in event_catalog
  await firestoreSetDoc(
    'event_catalog',
    'smart-campus-hackathon-2026',
    {
      id: 'smart-campus-hackathon-2026',
      title: 'Smart Campus 48H Hackathon 2026',
      category: 'Contest',
      description: 'The annual flagship UGSOT hackathon: build AI, IoT, and Web solutions for campus challenges.',
      mode: 'Offline',
      event_where: 'In campus',
      place: 'UGSOT Innovation Wing, Lab 304',
      start_date: '2026-12-05',
      end_date: '2026-12-07',
      registration_deadline: '2026-12-04',
      capacity: 120,
      is_published: true,
      event_type: 'event',
      noticeboard_managed: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
    idToken,
    true,
  );

  return NextResponse.json({
    success: true,
    message: 'Firestore collections initialized and seeded successfully.',
  });
}
