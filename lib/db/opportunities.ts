import 'server-only';
import { createDbClient, isFirestoreConfigured } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { getPublishedNoticeboardEvents } from '@/lib/db/noticeboard-events';
import type { Opportunity, OpportunityCategory } from '@/lib/types';
import type { Database } from './database.types';

type OpportunityRow = Database['public']['Tables']['opportunities']['Row'];

/**
 * Maps hackathons from events catalog into Opportunity format
 * so hackathons stay single-sourced from events!
 */
async function getHackathonOpportunities(): Promise<Opportunity[]> {
  try {
    const publishedEvents = await getPublishedNoticeboardEvents();
    return publishedEvents
      .filter((e) => e.type === 'hackathon')
      .map((e) => {
        const hackathon = e.type === 'hackathon' ? e : null;
        return {
          id: `event-${e.id}`,
          title: e.title,
          organization: 'CampusHub Dev Club',
          category: 'Hackathons' as OpportunityCategory,
          description: hackathon
            ? `Official Campus Hackathon. Theme: ${hackathon.theme}. Team Size: ${hackathon.teamSizeMin}-${hackathon.teamSizeMax} members. Prize Pool: ${hackathon.prize}. Mode: ${e.mode} (${e.where}).`
            : `Official Campus Hackathon. Mode: ${e.mode} (${e.where}).`,
          link: `/events/${e.id}`,
          deadline: new Date(`${e.registrationDeadline}T23:59:59Z`).toISOString(),
          location: e.place,
          eligibility: 'All ADYPU & partner college students',
          isFromEvents: true,
          eventUrl: `/events/${e.id}`,
          createdAt: '2026-10-01T00:00:00Z',
        };
      });
  } catch {
    return [];
  }
}

function computeClosingSoon(deadlineIso: string): boolean {
  const deadlineTime = new Date(deadlineIso).getTime();
  const nowTime = Date.now();
  const diff = deadlineTime - nowTime;
  // Closing soon if deadline is in the future but within 7 days
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}

export async function getOpportunities(options?: {
  category?: string;
  search?: string;
  hideExpired?: boolean;
}): Promise<Opportunity[]> {
  const currentUser = await getCurrentUser();
  let dbOpportunities: Opportunity[] = [];

  if ((await isFirestoreConfigured())) {
    try {
      const supabase = await createDbClient();
      const { data: rows, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('deadline', { ascending: true });

      if (error || !rows || rows.length === 0) {
        dbOpportunities = [];
      } else {
        dbOpportunities = rows.map((r: OpportunityRow) => ({
          id: r.id,
          title: r.title,
          organization: r.organization,
          category: r.category as OpportunityCategory,
          description: r.description,
          link: r.link,
          deadline: r.deadline,
          location: r.location,
          eligibility: r.eligibility,
          creatorId: r.creator_id,
          createdAt: r.created_at,
        }));
      }
    } catch (err) {
      console.error('Error fetching opportunities from DB:', err);
      dbOpportunities = [];
    }
  } else {
    dbOpportunities = [];
  }

  // Pull hackathons from events (Single Source of Truth)
  const hackathons = await getHackathonOpportunities();

  // Combine and deduplicate
  let all = [...dbOpportunities, ...hackathons];

  // Fetch bookmarks for signed-in user
  if (currentUser && (await isFirestoreConfigured())) {
    try {
      const supabase = await createDbClient();
      const { data: bookmarks } = await supabase
        .from('opportunity_bookmarks')
        .select('opportunity_id')
        .eq('user_id', currentUser.id);

      const bookmarkedSet = new Set((bookmarks ?? []).map((b) => b.opportunity_id));
      all = all.map((opp) => ({
        ...opp,
        isBookmarked: bookmarkedSet.has(opp.id),
      }));
    } catch {
      // Gracefully continue
    }
  }

  // Calculate closing soon
  all = all.map((opp) => ({
    ...opp,
    isClosingSoon: computeClosingSoon(opp.deadline),
  }));

  // Filtering
  if (options?.category && options.category !== 'All') {
    all = all.filter((opp) => opp.category.toLowerCase() === options.category?.toLowerCase());
  }

  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    all = all.filter(
      (opp) =>
        opp.title.toLowerCase().includes(q) ||
        opp.organization.toLowerCase().includes(q) ||
        opp.description.toLowerCase().includes(q) ||
        opp.location.toLowerCase().includes(q),
    );
  }

  if (options?.hideExpired) {
    const now = Date.now();
    all = all.filter((opp) => new Date(opp.deadline).getTime() >= now);
  }

  // Sort by deadline ascending (soonest deadline first)
  all.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  return all;
}

export async function createOpportunity(data: {
  title: string;
  organization: string;
  category: OpportunityCategory;
  description: string;
  link: string;
  deadline: string;
  location: string;
  eligibility: string;
}): Promise<string> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();

  if (currentUser?.role !== 'organizer') {
    throw new Error('Only organizers and administrators can post opportunities.');
  }

  const { data: row, error } = await supabase
    .from('opportunities')
    .insert({
      creator_id: currentUser.id,
      title: data.title.trim(),
      organization: data.organization.trim(),
      category: data.category,
      description: data.description.trim(),
      link: data.link.trim(),
      deadline: data.deadline,
      location: data.location.trim() || 'Remote',
      eligibility: data.eligibility.trim() || 'All students',
    })
    .select('id')
    .single();

  if (error || !row) throw new Error(`Failed to create opportunity: ${error?.message || 'Unknown error'}`);
  return row.id;
}

export async function updateOpportunity(
  id: string,
  data: Partial<{
    title: string;
    organization: string;
    category: OpportunityCategory;
    description: string;
    link: string;
    deadline: string;
    location: string;
    eligibility: string;
  }>,
): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();

  if (currentUser?.role !== 'organizer') {
    throw new Error('Only organizers and administrators can edit opportunities.');
  }

  const { error } = await supabase
    .from('opportunities')
    .update({
      ...(data.title ? { title: data.title.trim() } : {}),
      ...(data.organization ? { organization: data.organization.trim() } : {}),
      ...(data.category ? { category: data.category } : {}),
      ...(data.description ? { description: data.description.trim() } : {}),
      ...(data.link ? { link: data.link.trim() } : {}),
      ...(data.deadline ? { deadline: data.deadline } : {}),
      ...(data.location ? { location: data.location.trim() } : {}),
      ...(data.eligibility ? { eligibility: data.eligibility.trim() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(`Failed to update opportunity: ${error.message}`);
}

export async function deleteOpportunity(id: string): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();

  if (currentUser?.role !== 'organizer') {
    throw new Error('Only organizers and administrators can delete opportunities.');
  }

  const { error } = await supabase.from('opportunities').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete opportunity: ${error.message}`);
}

export async function toggleOpportunityBookmark(
  opportunityId: string,
): Promise<{ isBookmarked: boolean }> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to bookmark opportunities.');

  const { data: existing } = await supabase
    .from('opportunity_bookmarks')
    .select('created_at')
    .eq('user_id', currentUser.id)
    .eq('opportunity_id', opportunityId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('opportunity_bookmarks')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('opportunity_id', opportunityId);
    return { isBookmarked: false };
  } else {
    await supabase
      .from('opportunity_bookmarks')
      .insert({ user_id: currentUser.id, opportunity_id: opportunityId });
    return { isBookmarked: true };
  }
}

export async function getMyBookmarkedOpportunities(): Promise<Opportunity[]> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) return [];

  const { data: bookmarks } = await supabase
    .from('opportunity_bookmarks')
    .select('opportunity_id')
    .eq('user_id', currentUser.id);

  if (!bookmarks || bookmarks.length === 0) return [];
  const ids = bookmarks.map((b) => b.opportunity_id);

  const { data: rows } = await supabase
    .from('opportunities')
    .select('*')
    .in('id', ids);

  if (!rows) return [];

  return rows.map((r: OpportunityRow) => ({
    id: r.id,
    title: r.title,
    organization: r.organization,
    category: r.category as OpportunityCategory,
    description: r.description,
    link: r.link,
    deadline: r.deadline,
    location: r.location,
    eligibility: r.eligibility,
    creatorId: r.creator_id,
    isBookmarked: true,
    isClosingSoon: computeClosingSoon(r.deadline),
    createdAt: r.created_at,
  }));
}
