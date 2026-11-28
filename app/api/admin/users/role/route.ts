import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin, ADMIN_EMAILS } from '@/lib/auth';
import { createDbClient } from '@/lib/db/client';

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!isAdmin(currentUser)) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Payload must be an object' }, { status: 400 });
  }

  const { userId, role } = body as { userId?: unknown; role?: unknown };

  if (typeof userId !== 'string' || !userId.trim()) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  if (role !== 'organizer' && role !== 'student') {
    return NextResponse.json({ error: "role must be either 'organizer' or 'student'" }, { status: 400 });
  }

  const targetUserId = userId.trim();

  try {
    const db = await createDbClient();
    const { data: targetProfile, error: fetchError } = await db
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: `Failed to fetch profile: ${fetchError.message}` }, { status: 500 });
    }

    if (!targetProfile) {
      return NextResponse.json({ error: 'User profile not found in database' }, { status: 404 });
    }

    const targetEmail = (targetProfile.email || '').toLowerCase().trim();

    // Protection 1: Primary bootstrap admin cannot be demoted
    if (ADMIN_EMAILS.includes(targetEmail) && role !== 'organizer') {
      return NextResponse.json(
        { error: `Cannot revoke admin privileges from primary platform administrator (${targetEmail}).` },
        { status: 400 },
      );
    }

    // Protection 2: Admin cannot revoke their own privileges
    if (currentUser.id === targetUserId && role !== 'organizer') {
      return NextResponse.json(
        { error: 'You cannot revoke your own admin privileges.' },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await db
      .from('profiles')
      .update({
        role,
        updated_at: nowIso,
      })
      .eq('id', targetUserId);

    if (updateError) {
      return NextResponse.json({ error: `Failed to update user role: ${updateError.message}` }, { status: 500 });
    }

    // Attempt notification for the target user (non-fatal if it fails)
    try {
      const { createNotification } = await import('@/lib/db/notifications');
      await createNotification({
        userId: targetUserId,
        type: 'system',
        title: role === 'organizer' ? 'Admin Privileges Granted' : 'Admin Privileges Revoked',
        message:
          role === 'organizer'
            ? `You have been granted Organizer / Admin privileges by ${currentUser.name || currentUser.email}. You now have access to the Admin Panel, Attendance, and Event Manager.`
            : `Your Organizer / Admin privileges have been changed to Student by ${currentUser.name || currentUser.email}.`,
        linkUrl: role === 'organizer' ? '/admin' : '/events',
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      userId: targetUserId,
      role,
      userEmail: targetEmail,
      message:
        role === 'organizer'
          ? `Successfully granted admin privileges to ${targetProfile.full_name || targetEmail}.`
          : `Successfully revoked admin privileges from ${targetProfile.full_name || targetEmail}.`,
    });
  } catch (error) {
    console.error('Error changing user role:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user role' },
      { status: 500 },
    );
  }
}
