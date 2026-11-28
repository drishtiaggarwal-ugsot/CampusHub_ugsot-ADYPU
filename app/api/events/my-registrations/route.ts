import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMyRegisteredEventsWithTeams } from '@/lib/db/events';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  try {
    const registeredEvents = await getMyRegisteredEventsWithTeams();
    return NextResponse.json({
      registeredEvents,
      currentUserEmail: currentUser.email,
    });
  } catch (error) {
    console.warn('Failed to load registered events:', error);
    return NextResponse.json({
      registeredEvents: [],
      currentUserEmail: currentUser.email,
    });
  }
}
