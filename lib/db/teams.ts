import { randomUUID } from 'node:crypto';
import { createDbClient } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { findEventMeta } from '@/lib/db/events';
import type { TeamInvitation, TeamInvitationStatus } from '@/lib/types';
import type { Database } from '@/lib/db/database.types';

export type TeamRoster = {
  id: string;
  eventId: string;
  eventTitle: string;
  name: string;
  leaderId: string;
  leaderEmail: string;
  leaderName: string;
  memberEmails: string[];
  membersCount: number;
  createdAt: string;
};

export type AdminOverviewStats = {
  totalTeams: number;
  totalTeamMembers: number;
  totalStudents: number;
  totalEvents: number;
  totalInvitations: number;
  pendingInvitations: number;
  acceptedInvitations: number;
};

export async function createTeamInvitation(params: {
  teamName: string;
  teamId?: string | null;
  eventId?: string | null;
  eventTitle?: string | null;
  receiverId: string;
  receiverName: string;
  receiverEmail: string;
  message?: string;
}): Promise<{ id: string; shareUrl: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('You must be signed in to send squad invitations.');
  }

  const targetEventId = params.eventId?.trim();
  if (!targetEventId) {
    throw new Error('Please choose a registered event before sending a team invite.');
  }

  if (currentUser.id === params.receiverId || currentUser.email.toLowerCase() === params.receiverEmail.toLowerCase()) {
    throw new Error('You cannot send a team invitation to yourself.');
  }

  const cleanTeamName = params.teamName.trim();
  if (!cleanTeamName || cleanTeamName.length > 80) {
    throw new Error('Team name must be between 1 and 80 characters.');
  }

  const db = await createDbClient();
  const senderEmail = currentUser.email.trim().toLowerCase();
  const cleanReceiverEmail = params.receiverEmail.trim().toLowerCase();

  // Step 1 gate: sender MUST be registered for this event
  const expectedSenderRegId = `${targetEventId}__${currentUser.id}`;
  const { data: senderRegById } = await db
    .from('event_registrations')
    .select('id')
    .eq('id', expectedSenderRegId)
    .maybeSingle();

  let isSenderRegistered = Boolean(senderRegById?.id);
  if (!isSenderRegistered) {
    const { data: senderReg } = await db
      .from('event_registrations')
      .select('id')
      .eq('event_id', targetEventId)
      .eq('user_id', currentUser.id)
      .maybeSingle();
    isSenderRegistered = Boolean(senderReg?.id);
  }

  if (!isSenderRegistered) {
    throw new Error('Register for this event first before forming a team and sending invites.');
  }

  // Check if receiver is already on a team for this event
  const { data: receiverMembership } = await db
    .from('event_team_members')
    .select('team_id')
    .eq('event_id', targetEventId)
    .eq('member_email', cleanReceiverEmail)
    .maybeSingle();

  if (receiverMembership?.team_id) {
    throw new Error('This student is already on a team for this event.');
  }

  // Check for existing pending invitation from this sender to this receiver for same event
  const { data: existingInvite } = await db
    .from('team_invitations')
    .select('id')
    .eq('sender_id', currentUser.id)
    .eq('receiver_id', params.receiverId)
    .eq('event_id', targetEventId)
    .in('status', ['pending'])
    .maybeSingle();

  if (existingInvite?.id) {
    throw new Error('You have already sent a pending invitation to this person for this event.');
  }

  const nowIso = new Date().toISOString();

  // Ensure sender has a real event_teams record for this event
  const { data: existingMembership } = await db
    .from('event_team_members')
    .select('team_id')
    .eq('event_id', targetEventId)
    .eq('member_email', senderEmail)
    .maybeSingle();

  let resolvedTeamId = existingMembership?.team_id || params.teamId?.trim() || '';
  let resolvedTeamName = cleanTeamName;

  if (resolvedTeamId) {
    const { data: existingTeam } = await db
      .from('event_teams')
      .select('id, name, event_id')
      .eq('id', resolvedTeamId)
      .maybeSingle();
    if (existingTeam && existingTeam.event_id === targetEventId) {
      resolvedTeamName = existingTeam.name || cleanTeamName;
    } else if (!existingMembership?.team_id) {
      resolvedTeamId = '';
    }
  }

  if (!resolvedTeamId) {
    const newTeamId = randomUUID();
    const { error: teamInsertError } = await db.from('event_teams').insert({
      id: newTeamId,
      event_id: targetEventId,
      name: cleanTeamName,
      leader_id: currentUser.id,
      leader_email: senderEmail,
      created_at: nowIso,
    });
    if (teamInsertError) {
      throw new Error(`Unable to form your team: ${teamInsertError.message}`);
    }

    const { error: memberError } = await db.from('event_team_members').upsert(
      {
        id: `${targetEventId}__${senderEmail}`,
        event_id: targetEventId,
        team_id: newTeamId,
        member_email: senderEmail,
        email_key: senderEmail,
        created_at: nowIso,
      },
      { onConflict: 'event_id,email_key' },
    );
    if (memberError) {
      throw new Error(`Unable to add you to team "${cleanTeamName}": ${memberError.message}`);
    }

    resolvedTeamId = newTeamId;
  }

  const inviteId = randomUUID();
  const eventMeta = await findEventMeta(targetEventId);
  const eventTitle =
    params.eventTitle ||
    eventMeta?.title ||
    'Campus Event';

  const { error } = await db.from('team_invitations').insert({
    id: inviteId,
    team_id: resolvedTeamId,
    team_name: resolvedTeamName,
    event_id: targetEventId,
    event_title: eventTitle,
    sender_id: currentUser.id,
    sender_name: currentUser.name,
    sender_email: senderEmail,
    receiver_id: params.receiverId,
    receiver_name: params.receiverName,
    receiver_email: cleanReceiverEmail,
    message: (params.message || '').trim(),
    status: 'pending',
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (error) {
    throw new Error(`Failed to create squad-up invitation: ${error.message}`);
  }

  // Create real-time notification for recipient
  try {
    await db.from('notifications').insert({
      id: randomUUID(),
      user_id: params.receiverId,
      type: 'team_invite',
      title: `🤝 Squad-Up Invite: ${resolvedTeamName}`,
      message: `${currentUser.name} invited you to join team "${resolvedTeamName}" for ${eventTitle}.`,
      link: `/squad-up/${inviteId}`,
      is_read: false,
      created_at: nowIso,
    });
  } catch (notifErr) {
    console.warn('Unable to create notification record:', notifErr);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  return {
    id: inviteId,
    shareUrl: `${baseUrl}/squad-up/${inviteId}`,
  };
}

export async function getInvitationById(id: string): Promise<TeamInvitation | null> {
  const db = await createDbClient();
  const { data, error } = await db
    .from('team_invitations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    teamId: data.team_id || undefined,
    teamName: data.team_name,
    eventId: data.event_id || undefined,
    eventTitle: data.event_title || undefined,
    senderId: data.sender_id,
    senderName: data.sender_name,
    senderEmail: data.sender_email,
    receiverId: data.receiver_id,
    receiverName: data.receiver_name,
    receiverEmail: data.receiver_email,
    message: data.message || '',
    status: (data.status as TeamInvitationStatus) || 'pending',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getMyTeamInvitations(): Promise<{
  received: TeamInvitation[];
  sent: TeamInvitation[];
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { received: [], sent: [] };

  const db = await createDbClient();
  const [byIdRes, byEmailRes, sentRes] = await Promise.all([
    db
      .from('team_invitations')
      .select('*')
      .eq('receiver_id', currentUser.id)
      .order('created_at', { ascending: false }),
    db
      .from('team_invitations')
      .select('*')
      .eq('receiver_email', currentUser.email.toLowerCase())
      .order('created_at', { ascending: false }),
    db
      .from('team_invitations')
      .select('*')
      .eq('sender_id', currentUser.id)
      .order('created_at', { ascending: false }),
  ]);

  type TeamInvitationRow = Database['public']['Tables']['team_invitations']['Row'];

  const receivedMap = new Map<string, TeamInvitationRow>();
  for (const row of [...(byIdRes.data || []), ...(byEmailRes.data || [])]) {
    receivedMap.set(row.id, row);
  }
  const receivedRows = Array.from(receivedMap.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  
  const mapRow = (d: TeamInvitationRow): TeamInvitation => ({
    id: d.id,
    teamId: d.team_id || undefined,
    teamName: d.team_name,
    eventId: d.event_id || undefined,
    eventTitle: d.event_title || undefined,
    senderId: d.sender_id,
    senderName: d.sender_name,
    senderEmail: d.sender_email,
    receiverId: d.receiver_id,
    receiverName: d.receiver_name,
    receiverEmail: d.receiver_email,
    message: d.message || '',
    status: (d.status as TeamInvitationStatus) || 'pending',
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  });

  return {
    received: receivedRows.map(mapRow),
    sent: (sentRes.data || []).map(mapRow),
  };
}

export async function respondToTeamInvitation(
  inviteId: string,
  action: 'accept' | 'decline',
): Promise<{ success: boolean; teamName: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('You must be signed in to respond to an invitation.');
  }

  const db = await createDbClient();
  const invite = await getInvitationById(inviteId);
  if (!invite) {
    throw new Error('Squad-up invitation not found or expired.');
  }

  const isTargetReceiver =
    invite.receiverId === currentUser.id ||
    invite.receiverEmail.toLowerCase() === currentUser.email.toLowerCase();

  if (!isTargetReceiver) {
    throw new Error('You are not authorized to respond to this invitation.');
  }

  if (invite.status !== 'pending') {
    throw new Error(`This invitation has already been ${invite.status}.`);
  }

  const nowIso = new Date().toISOString();
  const newStatus: TeamInvitationStatus = action === 'accept' ? 'accepted' : 'declined';

  if (action === 'decline') {
    const { error: declineError } = await db
      .from('team_invitations')
      .update({
        status: 'declined',
        updated_at: nowIso,
      })
      .eq('id', inviteId);

    if (declineError) {
      throw new Error(`Failed to decline invitation: ${declineError.message}`);
    }

    try {
      await db.from('notifications').insert({
        id: randomUUID(),
        user_id: invite.senderId,
        type: 'team_invite',
        title: `Squad-Up Invite Declined`,
        message: `${currentUser.name} declined your invitation to join "${invite.teamName}".`,
        link: invite.eventId ? `/events/${invite.eventId}` : '/profile',
        is_read: false,
        created_at: nowIso,
      });
    } catch (notifErr) {
      console.warn('Could not notify sender of decline:', notifErr);
    }

    return { success: true, teamName: invite.teamName };
  }

  // Pre-check if user is already on a team for this event before accepting
  const eventId = invite.eventId;
  const targetEventId = eventId || 'campus-hackathon';
  const emailKey = currentUser.email.toLowerCase();

  const { data: existingMembership } = await db
    .from('event_team_members')
    .select('team_id, member_email')
    .eq('event_id', targetEventId)
    .eq('member_email', emailKey)
    .maybeSingle();

  if (existingMembership?.team_id && existingMembership.team_id !== invite.teamId) {
    await db
      .from('team_invitations')
      .update({
        status: 'declined',
        updated_at: nowIso,
      })
      .eq('id', inviteId);

    await db.from('notifications').insert({
      id: randomUUID(),
      user_id: currentUser.id,
      type: 'team_invite',
      title: '⚠️ Team Registration Limit',
      message: `You are already on a team for this event. This invitation has been declined.`,
      link: `/events/${targetEventId}`,
      is_read: false,
      created_at: nowIso,
    });

    throw new Error('You are already a member of a team for this event. This invitation has been declined.');
  }

  const { error } = await db
    .from('team_invitations')
    .update({
      status: newStatus,
      updated_at: nowIso,
    })
    .eq('id', inviteId);

  if (error) {
    throw new Error(`Failed to update invitation status: ${error.message}`);
  }

  const teamId = invite.teamId || inviteId;

  // Ensure accepting student also has an event registration record for consistency
  try {
    const { data: existingReg } = await db
      .from('event_registrations')
      .select('id')
      .eq('event_id', targetEventId)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (!existingReg?.id) {
      await db.from('event_registrations').insert({
        id: `${targetEventId}__${currentUser.id}`,
        event_id: targetEventId,
        user_id: currentUser.id,
        registered_at: nowIso,
      });
    }
  } catch (regErr) {
    console.warn('Could not auto-register invitee for event:', regErr);
  }

  // Add to event_team_members with composite primary key + invite_id for security rule verification
  const { error: memberError } = await db.from('event_team_members').upsert(
    {
      id: `${targetEventId}__${emailKey}`,
      event_id: targetEventId,
      team_id: teamId,
      member_email: emailKey,
      email_key: emailKey,
      invite_id: inviteId,
      created_at: nowIso,
    },
    { onConflict: 'event_id,email_key' },
  );

  if (memberError) {
    // Roll back invitation status so user can retry cleanly
    await db
      .from('team_invitations')
      .update({
        status: 'pending',
        updated_at: nowIso,
      })
      .eq('id', inviteId);
    throw new Error(`Could not add you to team "${invite.teamName}": ${memberError.message}`);
  }

  try {
    await db.from('notifications').insert({
      id: randomUUID(),
      user_id: invite.senderId,
      type: 'team_invite',
      title: '🎉 Squad-Up Invitation Accepted!',
      message: `${currentUser.name} accepted your squad invitation to join "${invite.teamName}"!`,
      link: `/events/${targetEventId}`,
      is_read: false,
      created_at: nowIso,
    });

    await db.from('notifications').insert({
      id: randomUUID(),
      user_id: currentUser.id,
      type: 'team_invite',
      title: '✅ Joined Team',
      message: `You have successfully joined team "${invite.teamName}"!`,
      link: `/events/${targetEventId}`,
      is_read: false,
      created_at: nowIso,
    });
  } catch (notifErr) {
    console.warn('Could not create acceptance notifications:', notifErr);
  }

  return { success: true, teamName: invite.teamName };
}

export async function getAllTeams(): Promise<TeamRoster[]> {
  const db = await createDbClient();
  const [teamsRes, membersRes, profilesRes] = await Promise.all([
    db.from('event_teams').select('*').order('created_at', { ascending: false }),
    db.from('event_team_members').select('*'),
    db.from('profiles').select('id, full_name, email'),
  ]);

  const teams = (teamsRes.data ?? []) as Database['public']['Tables']['event_teams']['Row'][];
  const members = (membersRes.data ?? []) as Database['public']['Tables']['event_team_members']['Row'][];
  const profiles = (profilesRes.data ?? []) as Database['public']['Tables']['profiles']['Row'][];

  const profileMap = new Map<string, string>();
  for (const p of profiles) {
    if (p.email) profileMap.set(p.email.toLowerCase(), p.full_name || 'Member');
    if (p.id) profileMap.set(p.id, p.full_name || 'Member');
  }

  if (teams.length === 0) {
    return [];
  }

  const { data: catalogRows } = await db.from('event_catalog').select('id, title');
  const eventTitleMap = new Map((catalogRows ?? []).map((e) => [e.id, e.title]));

  return teams.map((t) => {
    const teamMembers = members.filter((m) => m.team_id === t.id);
    const memberEmails = [
      ...new Set([t.leader_email, ...teamMembers.map((m) => m.member_email)].filter(Boolean)),
    ];
    const eventTitle = eventTitleMap.get(t.event_id) || t.event_id || 'Campus Hackathon';

    return {
      id: t.id,
      eventId: t.event_id,
      eventTitle,
      name: t.name,
      leaderId: t.leader_id,
      leaderEmail: t.leader_email,
      leaderName: profileMap.get(t.leader_email?.toLowerCase()) || profileMap.get(t.leader_id) || t.leader_email || 'Leader',
      memberEmails,
      membersCount: memberEmails.length,
      createdAt: t.created_at,
    };
  });
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const db = await createDbClient();
  const [teamsRes, membersRes, profilesRes, invitesRes, eventsRes] = await Promise.all([
    db.from('event_teams').select('id', { count: 'exact' }),
    db.from('event_team_members').select('id', { count: 'exact' }),
    db.from('profiles').select('id', { count: 'exact' }),
    db.from('team_invitations').select('id, status'),
    db.from('event_catalog').select('id', { count: 'exact' }),
  ]);

  const teamsCount = teamsRes.count ?? teamsRes.data?.length ?? 0;
  const membersCount = membersRes.count ?? membersRes.data?.length ?? 0;
  const studentsCount = profilesRes.count ?? profilesRes.data?.length ?? 0;
  const eventsCount = eventsRes.count ?? eventsRes.data?.length ?? 0;
  const invites = invitesRes.data || [];

  return {
    totalTeams: teamsCount,
    totalTeamMembers: membersCount,
    totalStudents: studentsCount,
    totalEvents: eventsCount,
    totalInvitations: invites.length,
    pendingInvitations: invites.filter((i) => i.status === 'pending').length,
    acceptedInvitations: invites.filter((i) => i.status === 'accepted').length,
  };
}

export async function sendTeamJoinRequest(params: {
  teamId: string;
  eventId: string;
  message?: string;
}): Promise<TeamInvitation> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('You must be signed in to request to join a team.');
  }

  const db = await createDbClient();
  const applicantEmail = currentUser.email.toLowerCase().trim();
  const targetEventId = params.eventId.trim();

  // 1. Verify user is registered for the event
  const expectedRegId = `${targetEventId}__${currentUser.id}`;
  const { data: regById } = await db
    .from('event_registrations')
    .select('id')
    .eq('id', expectedRegId)
    .maybeSingle();

  let isRegistered = Boolean(regById?.id);
  if (!isRegistered) {
    const { data: reg } = await db
      .from('event_registrations')
      .select('id')
      .eq('event_id', targetEventId)
      .eq('user_id', currentUser.id)
      .maybeSingle();
    isRegistered = Boolean(reg?.id);
  }

  if (!isRegistered) {
    throw new Error('Register for this event first before requesting to join a team.');
  }

  // 2. Verify user is not already on a team for this event
  const { data: existingMembership } = await db
    .from('event_team_members')
    .select('team_id')
    .eq('event_id', targetEventId)
    .eq('member_email', applicantEmail)
    .maybeSingle();

  if (existingMembership?.team_id) {
    throw new Error('You are already a member of a team for this event.');
  }

  // 3. Verify target team exists
  const { data: targetTeam } = await db
    .from('event_teams')
    .select('id, name, event_id, leader_id, leader_email')
    .eq('id', params.teamId)
    .maybeSingle();

  if (!targetTeam) {
    throw new Error('The target team could not be found.');
  }

  if (targetTeam.leader_email?.toLowerCase() === applicantEmail || targetTeam.leader_id === currentUser.id) {
    throw new Error('You are already the leader of this team.');
  }

  // 4. Verify team capacity
  const { data: catalogDoc } = await db
    .from('event_catalog')
    .select('team_size_max, title')
    .eq('id', targetEventId)
    .maybeSingle();

  const maxMembers = catalogDoc?.team_size_max || 4;
  const { data: teamMembers } = await db
    .from('event_team_members')
    .select('id')
    .eq('team_id', targetTeam.id);

  if ((teamMembers?.length || 0) >= maxMembers) {
    throw new Error(`Team "${targetTeam.name}" has already reached the maximum capacity of ${maxMembers} members.`);
  }

  // 5. Check if a pending join request already exists from this user to this team
  const { data: existingInvite } = await db
    .from('team_invitations')
    .select('id, status')
    .eq('team_id', targetTeam.id)
    .eq('sender_id', currentUser.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingInvite) {
    throw new Error('You already have a pending join request for this team.');
  }

  // 6. Resolve team leader's profile for receiver details
  const { data: leaderProfile } = await db
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', targetTeam.leader_id)
    .maybeSingle();

  const leaderName = leaderProfile?.full_name || targetTeam.leader_email || 'Team Leader';
  const leaderEmail = (leaderProfile?.email || targetTeam.leader_email || '').toLowerCase().trim();

  const requestId = randomUUID();
  const nowIso = new Date().toISOString();
  const eventTitle = catalogDoc?.title || targetEventId;

  const { error } = await db.from('team_invitations').insert({
    id: requestId,
    team_id: targetTeam.id,
    team_name: targetTeam.name,
    event_id: targetEventId,
    event_title: eventTitle,
    sender_id: currentUser.id,
    sender_name: currentUser.name,
    sender_email: applicantEmail,
    receiver_id: targetTeam.leader_id,
    receiver_name: leaderName,
    receiver_email: leaderEmail,
    message: (params.message || '').trim() || `Hi! I would like to join your team "${targetTeam.name}" for ${eventTitle}.`,
    status: 'pending',
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (error) {
    throw new Error(`Failed to send join request: ${error.message}`);
  }

  // Notify team leader
  try {
    await db.from('notifications').insert({
      id: randomUUID(),
      user_id: targetTeam.leader_id,
      type: 'team_invite',
      title: '🙋 New Team Join Request',
      message: `${currentUser.name} requested to join your team "${targetTeam.name}"!`,
      link: `/events/${targetEventId}`,
      is_read: false,
      created_at: nowIso,
    });
  } catch (notifErr) {
    console.warn('Could not notify team leader:', notifErr);
  }

  return {
    id: requestId,
    teamId: targetTeam.id,
    teamName: targetTeam.name,
    eventId: targetEventId,
    eventTitle,
    senderId: currentUser.id,
    senderName: currentUser.name,
    senderEmail: applicantEmail,
    receiverId: targetTeam.leader_id,
    receiverName: leaderName,
    receiverEmail: leaderEmail,
    message: params.message || '',
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
