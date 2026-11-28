import 'server-only';
import { createDbClient, isFirestoreConfigured } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { createNotification } from './notifications';
import type { CodeReview, MentorProfile, MentorshipSession } from '@/lib/types';

export async function getMentors(skillFilter?: string): Promise<MentorProfile[]> {
  if (!(await isFirestoreConfigured())) {
    return [];
  }

  try {
    const supabase = await createDbClient();
    let query = supabase.from('mentor_profiles').select('*').eq('status', 'approved');

    if (skillFilter && skillFilter !== 'All') {
      query = query.contains('skills', [skillFilter]);
    }

    const { data: rows, error } = await query;
    if (error || !rows || rows.length === 0) {
      return [];
    }

    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return rows.map((r) => {
      const p = profMap.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        name: p?.full_name?.trim() || p?.email?.split('@')[0] || 'Mentor',
        email: p?.email || '',
        bio: r.bio,
        skills: r.skills ?? [],
        areas: r.areas ?? [],
        availabilitySlots: r.availability_slots ?? [],
        status: r.status as 'pending' | 'approved' | 'rejected',
        createdAt: r.created_at,
      };
    });
  } catch (err) {
    console.error('Error fetching mentors:', err);
    return [];
  }
}

export async function getMyMentorProfile(): Promise<MentorProfile | null> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  const { data: row } = await supabase
    .from('mentor_profiles')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    name: currentUser.name,
    email: currentUser.email,
    bio: row.bio,
    skills: row.skills ?? [],
    areas: row.areas ?? [],
    availabilitySlots: row.availability_slots ?? [],
    status: row.status as 'pending' | 'approved' | 'rejected',
    createdAt: row.created_at,
  };
}

export async function applyToBeMentor(data: {
  bio: string;
  skills: string[];
  areas: string[];
  availabilitySlots: string[];
}): Promise<string> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to apply.');

  const { data: existing } = await supabase
    .from('mentor_profiles')
    .select('id')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('mentor_profiles')
      .update({
        bio: data.bio.trim(),
        skills: data.skills,
        areas: data.areas,
        availability_slots: data.availabilitySlots,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: inserted, error } = await supabase
    .from('mentor_profiles')
    .insert({
      user_id: currentUser.id,
      bio: data.bio.trim(),
      skills: data.skills,
      areas: data.areas,
      availability_slots: data.availabilitySlots,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !inserted) throw new Error(`Failed to submit application: ${error?.message || 'Unknown error'}`);
  return inserted.id;
}

export async function approveMentorProfile(
  mentorId: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== 'organizer') throw new Error('Only admins can approve mentors.');

  const { error } = await supabase
    .from('mentor_profiles')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', mentorId);

  if (error) throw new Error(`Failed to update mentor status: ${error.message}`);
}

export async function bookMentorshipSession(data: {
  mentorId: string;
  date: string;
  slot: string;
  topic: string;
  notes?: string;
}): Promise<string> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to book a mentorship session.');

  // Database unique constraint: (mentor_id, date, slot)
  const { data: row, error } = await supabase
    .from('mentorship_sessions')
    .insert({
      mentor_id: data.mentorId,
      mentee_id: currentUser.id,
      date: data.date,
      slot: data.slot.trim(),
      topic: data.topic.trim(),
      notes: data.notes?.trim() || '',
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !row) {
    if (error?.code === '23505' || error?.message.includes('unique')) {
      throw new Error('This slot is already booked for the selected date. Please pick another slot.');
    }
    throw new Error(`Failed to book session: ${error?.message || 'Unknown error'}`);
  }

  // Notify mentor of new booking
  try {
    const { data: mentorRecord } = await supabase
      .from('mentor_profiles')
      .select('user_id')
      .eq('id', data.mentorId)
      .maybeSingle();

    if (mentorRecord?.user_id) {
      await createNotification({
        userId: mentorRecord.user_id,
        actorId: currentUser.id,
        type: 'mentor_session',
        title: 'New mentorship session booked',
        message: `${currentUser.name || 'A student'} booked a session on ${data.date} (${data.slot})`,
        linkUrl: '/mentorship',
      });
    }
  } catch {
    // Non-fatal
  }

  return row.id;
}

export async function getMySessions(): Promise<{
  asMentee: MentorshipSession[];
  asMentor: MentorshipSession[];
}> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) return { asMentee: [], asMentor: [] };

  // Sessions as mentee
  const { data: menteeRows } = await supabase
    .from('mentorship_sessions')
    .select('*')
    .eq('mentee_id', currentUser.id)
    .order('date', { ascending: true });

  // Check if current user is an approved mentor
  const { data: mentorProf } = await supabase
    .from('mentor_profiles')
    .select('id')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  let mentorRows: typeof menteeRows = [];
  if (mentorProf) {
    const { data: mRows } = await supabase
      .from('mentorship_sessions')
      .select('*')
      .eq('mentor_id', mentorProf.id)
      .order('date', { ascending: true });
    mentorRows = mRows;
  }

  const allRows = [...(menteeRows ?? []), ...(mentorRows ?? [])];
  const mentorIds = [...new Set(allRows.map((r) => r.mentor_id))];
  const menteeIds = [...new Set(allRows.map((r) => r.mentee_id))];

  const { data: mentorProfiles } = mentorIds.length
    ? await supabase.from('mentor_profiles').select('id, user_id').in('id', mentorIds)
    : { data: [] };

  const mentorUserIds = (mentorProfiles ?? []).map((m) => m.user_id);
  const allUserIds = [...new Set([...menteeIds, ...mentorUserIds])];

  const { data: userProfiles } = allUserIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', allUserIds)
    : { data: [] };

  const userMap = new Map((userProfiles ?? []).map((u) => [u.id, u]));
  const mentorToUserMap = new Map((mentorProfiles ?? []).map((m) => [m.id, userMap.get(m.user_id)]));

  const formatSession = (r: (typeof allRows)[0]): MentorshipSession => {
    const mentorUser = mentorToUserMap.get(r.mentor_id);
    const menteeUser = userMap.get(r.mentee_id);
    return {
      id: r.id,
      mentorId: r.mentor_id,
      mentorName: mentorUser?.full_name || 'Mentor',
      mentorEmail: mentorUser?.email || '',
      menteeId: r.mentee_id,
      menteeName: menteeUser?.full_name || 'Mentee',
      menteeEmail: menteeUser?.email || '',
      slot: r.slot,
      date: r.date,
      topic: r.topic,
      notes: r.notes,
      status: r.status as MentorshipSession['status'],
      createdAt: r.created_at,
    };
  };

  return {
    asMentee: (menteeRows ?? []).map(formatSession),
    asMentor: (mentorRows ?? []).map(formatSession),
  };
}

export async function updateSessionStatus(
  sessionId: string,
  status: 'accepted' | 'declined' | 'completed' | 'cancelled',
): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Unauthorized');

  const { data: session } = await supabase
    .from('mentorship_sessions')
    .select('id, mentor_id, mentee_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) throw new Error('Session not found');

  const { data: mentorProf } = await supabase
    .from('mentor_profiles')
    .select('id')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  const isSessionMentor = Boolean(mentorProf && mentorProf.id === session.mentor_id);
  const isSessionMentee = session.mentee_id === currentUser.id;
  const isOrganizer = currentUser.role === 'organizer';

  if (status === 'cancelled') {
    if (!isSessionMentor && !isSessionMentee && !isOrganizer) {
      throw new Error('Forbidden: You cannot cancel this session.');
    }
  } else if (!isSessionMentor && !isOrganizer) {
    throw new Error('Forbidden: Only the assigned mentor can accept, decline, or complete a session.');
  }

  const { error } = await supabase
    .from('mentorship_sessions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to update session: ${error.message}`);
}

export async function getCodeReviews(): Promise<CodeReview[]> {
  if (!(await isFirestoreConfigured())) {
    return [];
  }

  try {
    const supabase = await createDbClient();
    const { data: rows, error } = await supabase
      .from('code_reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !rows || rows.length === 0) {
      return [];
    }

    const requesterIds = [...new Set(rows.map((r) => r.requester_id))];
    const mentorProfileIds = [...new Set(rows.map((r) => r.mentor_id).filter((id): id is string => Boolean(id)))];

    const { data: mentorProfiles } = mentorProfileIds.length
      ? await supabase.from('mentor_profiles').select('id, user_id').in('id', mentorProfileIds)
      : { data: [] };

    const mentorUserIds = (mentorProfiles ?? []).map((m) => m.user_id);
    const allUserIds = [...new Set([...requesterIds, ...mentorUserIds])];

    const { data: profiles } = allUserIds.length
      ? await supabase.from('profiles').select('id, full_name, email').in('id', allUserIds)
      : { data: [] };

    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const mentorUserMap = new Map((mentorProfiles ?? []).map((m) => [m.id, m.user_id]));

    return rows.map((r) => {
      const p = profMap.get(r.requester_id);
      const mentorUserId = r.mentor_id ? mentorUserMap.get(r.mentor_id) : undefined;
      const mp = mentorUserId ? profMap.get(mentorUserId) : undefined;
      return {
        id: r.id,
        requesterId: r.requester_id,
        requesterName: p?.full_name?.trim() || p?.email?.split('@')[0] || 'Student',
        requesterEmail: p?.email || '',
        title: r.title,
        githubUrl: r.github_url,
        codeSnippet: r.code_snippet,
        language: r.language,
        notes: r.notes,
        mentorId: r.mentor_id,
        mentorName: mp ? (mp.full_name?.trim() || mp.email?.split('@')[0] || 'Mentor') : (r.mentor_id ? 'Mentor' : null),
        feedback: r.feedback,
        status: r.status as CodeReview['status'],
        createdAt: r.created_at,
      };
    });
  } catch (err) {
    console.error('Error fetching code reviews:', err);
    return [];
  }
}

export async function requestCodeReview(data: {
  title: string;
  githubUrl?: string;
  codeSnippet?: string;
  language: string;
  notes: string;
}): Promise<string> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to request a code review.');

  const { data: row, error } = await supabase
    .from('code_reviews')
    .insert({
      requester_id: currentUser.id,
      title: data.title.trim(),
      github_url: data.githubUrl?.trim() || null,
      code_snippet: data.codeSnippet?.trim() || null,
      language: data.language || 'Other',
      notes: data.notes.trim(),
      status: 'open',
    })
    .select('id')
    .single();

  if (error || !row) throw new Error(`Failed to request code review: ${error?.message || 'Unknown error'}`);
  return row.id;
}

export async function claimCodeReview(reviewId: string): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Unauthorized');

  const { data: mentorProf } = await supabase
    .from('mentor_profiles')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!mentorProf && currentUser.role !== 'organizer') {
    throw new Error('Only approved mentors can claim code reviews.');
  }

  const { error } = await supabase
    .from('code_reviews')
    .update({
      mentor_id: mentorProf?.id || null,
      status: 'claimed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reviewId);

  if (error) throw new Error(`Failed to claim review: ${error.message}`);
}

export async function submitReviewFeedback(reviewId: string, feedback: string): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Unauthorized');

  const [{ data: rev }, { data: mentorProf }] = await Promise.all([
    supabase
      .from('code_reviews')
      .select('id, requester_id, mentor_id, title')
      .eq('id', reviewId)
      .maybeSingle(),
    supabase
      .from('mentor_profiles')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('status', 'approved')
      .maybeSingle(),
  ]);

  if (!rev) throw new Error('Code review not found');
  const isOrganizer = currentUser.role === 'organizer';
  const isApprovedMentor = Boolean(mentorProf);
  const isAssignedMentor = Boolean(mentorProf && rev.mentor_id === mentorProf.id);

  if (!isOrganizer && !(isApprovedMentor && (!rev.mentor_id || isAssignedMentor))) {
    throw new Error('Forbidden: Only the assigned approved mentor or an organizer can submit feedback.');
  }

  const { error } = await supabase
    .from('code_reviews')
    .update({
      feedback: feedback.trim(),
      mentor_id: rev.mentor_id ?? mentorProf?.id ?? null,
      status: 'reviewed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reviewId);

  if (error) throw new Error(`Failed to submit feedback: ${error.message}`);

  // Notify review requester
  try {
    if (rev.requester_id && rev.requester_id !== currentUser.id) {
      await createNotification({
        userId: rev.requester_id,
        actorId: currentUser.id,
        type: 'code_review',
        title: 'Feedback submitted on your code review',
        message: `${currentUser.name || 'A mentor'} completed your review: "${rev.title}"`,
        linkUrl: '/mentorship',
      });
    }
  } catch {
    // Non-fatal
  }
}

export async function resolveCodeReview(reviewId: string): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Unauthorized');

  const [{ data: rev }, { data: mentorProf }] = await Promise.all([
    supabase
      .from('code_reviews')
      .select('id, requester_id, mentor_id')
      .eq('id', reviewId)
      .maybeSingle(),
    supabase
      .from('mentor_profiles')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('status', 'approved')
      .maybeSingle(),
  ]);

  if (!rev) throw new Error('Code review not found');
  const isRequester = rev.requester_id === currentUser.id;
  const isAssignedMentor = Boolean(mentorProf && rev.mentor_id === mentorProf.id);
  const isOrganizer = currentUser.role === 'organizer';

  if (!isRequester && !isAssignedMentor && !isOrganizer) {
    throw new Error('Forbidden: Only the requester, assigned mentor, or organizer can resolve this review.');
  }

  const { error } = await supabase
    .from('code_reviews')
    .update({
      status: 'resolved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reviewId);

  if (error) throw new Error(`Failed to resolve review: ${error.message}`);
}
