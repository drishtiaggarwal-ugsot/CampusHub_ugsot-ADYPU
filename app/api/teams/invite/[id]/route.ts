import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getInvitationById, respondToTeamInvitation } from '@/lib/db/teams';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const invite = await getInvitationById(id);
    if (!invite) {
      return NextResponse.json({ error: 'Squad invitation not found' }, { status: 404 });
    }
    const userEmail = currentUser.email.toLowerCase();
    const isParticipant =
      invite.senderId === currentUser.id ||
      invite.receiverId === currentUser.id ||
      invite.receiverEmail.toLowerCase() === userEmail ||
      currentUser.role === 'organizer';
    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(invite);
  } catch (error) {
    console.error('Failed to get invitation details:', error);
    return NextResponse.json({ error: 'Failed to retrieve invitation' }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Sign in to accept or decline squad invites.' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = await request.json().catch(() => null);
    const action = body?.action;
    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ error: "Action must be 'accept' or 'decline'" }, { status: 400 });
    }

    const result = await respondToTeamInvitation(id, action);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to respond to squad invitation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update invitation.' },
      { status: 400 },
    );
  }
}
