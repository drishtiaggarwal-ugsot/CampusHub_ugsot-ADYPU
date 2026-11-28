import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sendTeamJoinRequest } from '@/lib/db/teams';

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Sign in to request to join a team.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload must be an object' }, { status: 400 });
  }

  const { teamId, eventId, message } = body as {
    teamId?: unknown;
    eventId?: unknown;
    message?: unknown;
  };

  if (typeof teamId !== 'string' || !teamId.trim()) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }
  if (typeof eventId !== 'string' || !eventId.trim()) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  }

  try {
    const invite = await sendTeamJoinRequest({
      teamId: teamId.trim(),
      eventId: eventId.trim(),
      message: typeof message === 'string' ? message.trim() : undefined,
    });
    return NextResponse.json({ success: true, invite }, { status: 201 });
  } catch (error) {
    console.error('Failed to send join request:', error);
    const msg = error instanceof Error ? error.message : 'Unable to send join request.';
    const status = msg.toLowerCase().includes('register for this event first')
      ? 403
      : msg.toLowerCase().includes('already')
      ? 409
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
