import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createTeamInvitation, getMyTeamInvitations } from '@/lib/db/teams';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const invites = await getMyTeamInvitations();
    return NextResponse.json(invites);
  } catch (error) {
    console.error('Failed to fetch team invitations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch team invitations' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'You must be signed in to send a squad invite.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid invitation payload' }, { status: 400 });
    }

    const { teamName, teamId, eventId, eventTitle, receiverId, receiverName, receiverEmail, message } = body;

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return NextResponse.json(
        { error: 'Please select an event you are registered for before sending an invite.' },
        { status: 400 },
      );
    }
    if (!teamName || typeof teamName !== 'string' || !teamName.trim()) {
      return NextResponse.json({ error: 'Team name is required.' }, { status: 400 });
    }
    if (!receiverId || !receiverEmail) {
      return NextResponse.json({ error: 'Receiver information is incomplete.' }, { status: 400 });
    }

    const senderEmail = currentUser.email?.trim().toLowerCase();
    const cleanReceiverEmail = typeof receiverEmail === 'string' ? receiverEmail.trim().toLowerCase() : '';

    if (
      currentUser.id === receiverId ||
      (senderEmail && cleanReceiverEmail && senderEmail === cleanReceiverEmail)
    ) {
      return NextResponse.json(
        { error: 'You cannot send a team invitation to yourself.' },
        { status: 400 },
      );
    }

    const result = await createTeamInvitation({
      teamName,
      teamId,
      eventId: eventId.trim(),
      eventTitle,
      receiverId,
      receiverName: receiverName || 'Teammate',
      receiverEmail,
      message,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to create team invitation:', error);
    const msg = error instanceof Error ? error.message : 'Unable to send invitation. Please try again.';
    const status = msg.toLowerCase().includes('register for this event first')
      ? 403
      : msg.toLowerCase().includes('already sent a pending invitation') || msg.toLowerCase().includes('already on a team')
        ? 409
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
