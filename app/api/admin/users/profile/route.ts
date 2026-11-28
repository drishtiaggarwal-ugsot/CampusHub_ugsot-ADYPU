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

  const {
    userId,
    fullName,
    courseYear,
    bio,
    skills,
    githubUsername,
    lookingForTeam,
    role,
  } = body as {
    userId?: unknown;
    fullName?: unknown;
    courseYear?: unknown;
    bio?: unknown;
    skills?: unknown;
    githubUsername?: unknown;
    lookingForTeam?: unknown;
    role?: unknown;
  };

  if (typeof userId !== 'string' || !userId.trim()) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const targetUserId = userId.trim();

  try {
    const db = await createDbClient();
    const { data: targetProfile, error: fetchError } = await db
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchError || !targetProfile) {
      return NextResponse.json({ error: 'User profile not found in database' }, { status: 404 });
    }

    const targetEmail = (targetProfile.email || '').toLowerCase().trim();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof fullName === 'string' && fullName.trim()) {
      updatePayload.full_name = fullName.trim();
    }

    if (typeof courseYear === 'string') {
      updatePayload.course_year = courseYear.trim() || null;
    }

    if (typeof bio === 'string') {
      updatePayload.bio = bio.trim() || null;
    }

    if (Array.isArray(skills)) {
      updatePayload.skills = skills.map((s) => String(s).trim()).filter(Boolean);
    }

    if (typeof githubUsername === 'string') {
      updatePayload.github_username = githubUsername.trim().replace(/^@/, '') || null;
    }

    if (typeof lookingForTeam === 'boolean') {
      updatePayload.looking_for_team = lookingForTeam;
    }

    // Role handling
    let roleChanged = false;
    if (role !== undefined) {
      if (role !== 'organizer' && role !== 'student') {
        return NextResponse.json({ error: "role must be either 'organizer' or 'student'" }, { status: 400 });
      }

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

      if (role !== targetProfile.role) {
        roleChanged = true;
      }
      updatePayload.role = role;
    }

    const { error: updateError } = await db
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateError) {
      return NextResponse.json({ error: `Failed to update user profile: ${updateError.message}` }, { status: 500 });
    }

    // Send notification if role changed
    if (roleChanged && typeof role === 'string') {
      try {
        const { createNotification } = await import('@/lib/db/notifications');
        await createNotification({
          userId: targetUserId,
          type: 'system',
          title: role === 'organizer' ? 'Admin Privileges Granted' : 'Admin Privileges Revoked',
          message:
            role === 'organizer'
              ? `You have been granted Organizer / Admin privileges by ${currentUser.name || currentUser.email}. You now have access to the Admin Panel and event management tools.`
              : `Your Organizer / Admin privileges have been changed to Student by ${currentUser.name || currentUser.email}.`,
          linkUrl: role === 'organizer' ? '/admin' : '/events',
        });
      } catch {
        // Non-fatal
      }
    }

    const updatedProfile = { ...targetProfile, ...updatePayload };

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      message: `Profile for ${updatedProfile.full_name || targetEmail} updated successfully.`,
    });
  } catch (error) {
    console.error('Error updating user profile by admin:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user profile' },
      { status: 500 },
    );
  }
}
