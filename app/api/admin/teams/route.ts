import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getAllTeams, getAdminOverviewStats } from '@/lib/db/teams';
import { createDbClient } from '@/lib/db/client';

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!isAdmin(currentUser)) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const db = await createDbClient();
    const [stats, teams, invitesRes, profilesRes] = await Promise.all([
      getAdminOverviewStats(),
      getAllTeams(),
      db.from('team_invitations').select('*').order('created_at', { ascending: false }).limit(50),
      db.from('profiles').select('*').order('created_at', { ascending: false }).limit(100),
    ]);

    return NextResponse.json({
      stats,
      teams,
      invitations: invitesRes.data || [],
      profiles: profilesRes.data || [],
    });
  } catch (error) {
    console.error('Failed to load admin team stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load admin stats' },
      { status: 500 },
    );
  }
}
