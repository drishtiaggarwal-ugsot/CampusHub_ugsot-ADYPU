import 'server-only';
import { createDbClient, isFirestoreConfigured } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth';
import { checkUserPostingEligibility } from './moderation';
import { createNotification } from './notifications';
import type { ForumAnswer, ForumPost, ForumPostType, ForumTag } from '@/lib/types';
import { FORUM_TAGS } from '@/lib/types';

export type { ForumAnswer, ForumPost, ForumPostType, ForumTag };
export type CommunityPost = ForumPost;
export type CommunityAnswer = ForumAnswer;
export type CommunityPostType = ForumPostType;
export type CommunityTag = ForumTag;
export { FORUM_TAGS };
export { FORUM_TAGS as COMMUNITY_TAGS };

// Built-in starter collections are empty to ensure all rendered community data is genuine from Cloud Firestore
const SAMPLE_POSTS: ForumPost[] = [];
const SAMPLE_ANSWERS: Record<string, ForumAnswer[]> = {};

export async function getForumPosts(options?: {
  type?: ForumPostType;
  tag?: string;
  search?: string;
}): Promise<ForumPost[]> {
  if (!(await isFirestoreConfigured())) {
    return filterSamplePosts(SAMPLE_POSTS, options);
  }

  try {
    const supabase = await createDbClient();
    const currentUser = await getCurrentUser();

    let query = supabase.from('forum_posts').select('*').order('created_at', { ascending: false });

    if (options?.type) {
      query = query.eq('type', options.type);
    }
    if (options?.tag && options.tag !== 'All') {
      query = query.contains('tags', [options.tag]);
    }

    const { data: posts, error } = await query;
    if (error || !posts) {
      console.warn('Unable to query forum_posts table, using fallback:', error?.message);
      return filterSamplePosts(SAMPLE_POSTS, options);
    }

    if (posts.length === 0) {
      return filterSamplePosts(SAMPLE_POSTS, options);
    }

    const authorIds = [...new Set(posts.map((p) => p.author_id))];
    const postIds = posts.map((p) => p.id);

    // Fetch author profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', authorIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    // Fetch answers counts
    const { data: answers } = await supabase
      .from('forum_answers')
      .select('id, post_id')
      .in('post_id', postIds);

    const answerCountMap = new Map<string, number>();
    for (const ans of answers ?? []) {
      answerCountMap.set(ans.post_id, (answerCountMap.get(ans.post_id) ?? 0) + 1);
    }

    // Fetch upvotes
    const { data: upvotes } = await supabase
      .from('forum_upvotes')
      .select('item_id, user_id')
      .eq('item_type', 'post')
      .in('item_id', postIds);

    const upvoteCountMap = new Map<string, number>();
    const userUpvotedSet = new Set<string>();

    for (const vote of upvotes ?? []) {
      upvoteCountMap.set(vote.item_id, (upvoteCountMap.get(vote.item_id) ?? 0) + 1);
      if (currentUser && vote.user_id === currentUser.id) {
        userUpvotedSet.add(vote.item_id);
      }
    }

    const isOrganizer = currentUser?.role === 'organizer';

    let result: ForumPost[] = posts.map((p) => {
      const prof = profileMap.get(p.author_id);
      return {
        id: p.id,
        type: p.type as ForumPostType,
        title: p.title,
        content: p.content,
        authorId: p.author_id,
        authorName: prof?.full_name?.trim() || prof?.email?.split('@')[0] || 'Member',
        authorEmail: prof?.email || '',
        tags: p.tags ?? [],
        acceptedAnswerId: p.accepted_answer_id,
        isReported: Boolean(p.is_reported),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        upvotesCount: upvoteCountMap.get(p.id) ?? 0,
        answersCount: answerCountMap.get(p.id) ?? 0,
        hasUpvoted: userUpvotedSet.has(p.id),
        canDelete: Boolean(currentUser && (currentUser.id === p.author_id || isOrganizer)),
      };
    });

    if (options?.search && options.search.trim()) {
      const term = options.search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.content.toLowerCase().includes(term) ||
          p.tags.some((t) => t.toLowerCase().includes(term)),
      );
    }

    return result;
  } catch (err) {
    console.error('Error fetching forum posts:', err);
    return filterSamplePosts(SAMPLE_POSTS, options);
  }
}

function filterSamplePosts(
  posts: ForumPost[],
  options?: { type?: ForumPostType; tag?: string; search?: string },
): ForumPost[] {
  let list = [...posts];
  if (options?.type) {
    list = list.filter((p) => p.type === options.type);
  }
  if (options?.tag && options.tag !== 'All') {
    list = list.filter((p) => p.tags.some((t) => t.toLowerCase() === options.tag!.toLowerCase()));
  }
  if (options?.search && options.search.trim()) {
    const term = options.search.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        p.content.toLowerCase().includes(term) ||
        p.tags.some((t) => t.toLowerCase().includes(term)),
    );
  }
  return list;
}

export async function getForumPostWithAnswers(
  postId: string,
): Promise<{ post: ForumPost; answers: ForumAnswer[] } | null> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  const isOrganizer = currentUser?.role === 'organizer';

  // 1. Fetch post
  const { data: postRow, error: postErr } = await supabase
    .from('forum_posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (postErr || !postRow) {
    const sample = SAMPLE_POSTS.find((p) => p.id === postId);
    if (sample) {
      const answers = SAMPLE_ANSWERS[postId] || [];
      return { post: sample, answers };
    }
    return null;
  }

  // Fetch author profile
  const { data: authorProfile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', postRow.author_id)
    .maybeSingle();

  // Fetch post upvotes
  const { data: postUpvotes } = await supabase
    .from('forum_upvotes')
    .select('user_id')
    .eq('item_type', 'post')
    .eq('item_id', postId);

  // 2. Fetch answers
  const { data: answerRows } = await supabase
    .from('forum_answers')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  const answersList = answerRows ?? [];
  const answerAuthorIds = [...new Set(answersList.map((a) => a.author_id))];

  const { data: answerProfiles } = answerAuthorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', answerAuthorIds)
    : { data: [] };

  const answerProfileMap = new Map((answerProfiles ?? []).map((p) => [p.id, p]));

  // Fetch answer upvotes
  const answerIds = answersList.map((a) => a.id);
  const { data: answerUpvotes } = answerIds.length
    ? await supabase
        .from('forum_upvotes')
        .select('item_id, user_id')
        .eq('item_type', 'answer')
        .in('item_id', answerIds)
    : { data: [] };

  const answerVotesCount = new Map<string, number>();
  const answerUserVoted = new Set<string>();

  for (const vote of answerUpvotes ?? []) {
    answerVotesCount.set(vote.item_id, (answerVotesCount.get(vote.item_id) ?? 0) + 1);
    if (currentUser && vote.user_id === currentUser.id) {
      answerUserVoted.add(vote.item_id);
    }
  }

  const post: ForumPost = {
    id: postRow.id,
    type: postRow.type as ForumPostType,
    title: postRow.title,
    content: postRow.content,
    authorId: postRow.author_id,
    authorName: authorProfile?.full_name?.trim() || authorProfile?.email?.split('@')[0] || 'Member',
    authorEmail: authorProfile?.email || '',
    tags: postRow.tags ?? [],
    acceptedAnswerId: postRow.accepted_answer_id,
    isReported: Boolean(postRow.is_reported),
    createdAt: postRow.created_at,
    updatedAt: postRow.updated_at,
    upvotesCount: (postUpvotes ?? []).length,
    answersCount: answersList.length,
    hasUpvoted: Boolean(currentUser && (postUpvotes ?? []).some((v) => v.user_id === currentUser.id)),
    canDelete: Boolean(currentUser && (currentUser.id === postRow.author_id || isOrganizer)),
  };

  const isPostAuthor = Boolean(currentUser && currentUser.id === postRow.author_id);

  let answers: ForumAnswer[] = answersList.map((a) => {
    const prof = answerProfileMap.get(a.author_id);
    const isAccepted = postRow.accepted_answer_id === a.id;
    return {
      id: a.id,
      postId: a.post_id,
      authorId: a.author_id,
      authorName: prof?.full_name?.trim() || prof?.email?.split('@')[0] || 'Member',
      authorEmail: prof?.email || '',
      content: a.content,
      isAccepted,
      isReported: Boolean(a.is_reported),
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      upvotesCount: answerVotesCount.get(a.id) ?? 0,
      hasUpvoted: answerUserVoted.has(a.id),
      canDelete: Boolean(currentUser && (currentUser.id === a.author_id || isOrganizer)),
      canAccept: isPostAuthor && post.type === 'question',
    };
  });

  // Sort accepted answer first
  answers = answers.sort((a, b) => {
    if (a.isAccepted) return -1;
    if (b.isAccepted) return 1;
    return b.upvotesCount - a.upvotesCount;
  });

  return { post, answers };
}

export async function createForumPost(post: {
  type: ForumPostType;
  title: string;
  content: string;
  tags: string[];
}): Promise<string> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to create a post.');

  // Rate-limit, spam cooldown, and suspension check
  const eligibility = await checkUserPostingEligibility(currentUser.id, post.content);
  if (!eligibility.allowed) {
    throw new Error(eligibility.reason || 'You are not eligible to post right now.');
  }

  if (post.type === 'announcement' && currentUser.role !== 'organizer') {
    throw new Error('Only organizers and admins can post announcements.');
  }

  const { data, error } = await supabase
    .from('forum_posts')
    .insert({
      type: post.type,
      title: post.title.trim(),
      content: post.content.trim(),
      author_id: currentUser.id,
      tags: post.tags,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Failed to create post: ${error?.message || 'Unknown error'}`);
  return data.id;
}

export async function createForumAnswer(postId: string, content: string): Promise<string> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to reply.');

  // Rate-limit, spam cooldown, and suspension check
  const eligibility = await checkUserPostingEligibility(currentUser.id, content);
  if (!eligibility.allowed) {
    throw new Error(eligibility.reason || 'You are not eligible to reply right now.');
  }

  const { data, error } = await supabase
    .from('forum_answers')
    .insert({
      post_id: postId,
      author_id: currentUser.id,
      content: content.trim(),
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Failed to submit reply: ${error?.message || 'Unknown error'}`);

  // Notify question author about the new answer
  try {
    const { data: post } = await supabase
      .from('forum_posts')
      .select('id, title, author_id')
      .eq('id', postId)
      .maybeSingle();

    if (post && post.author_id && post.author_id !== currentUser.id) {
      await createNotification({
        userId: post.author_id,
        actorId: currentUser.id,
        type: 'answer_received',
        title: 'New reply to your community post',
        message: `${currentUser.name || 'A student'} replied to "${post.title}"`,
        linkUrl: `/community?post=${post.id}`,
      });
    }
  } catch {
    // Non-fatal
  }

  return data.id;
}

export async function toggleUpvote(
  itemType: 'post' | 'answer',
  itemId: string,
): Promise<{ upvoted: boolean; count: number }> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to upvote.');

  const { data: existing } = await supabase
    .from('forum_upvotes')
    .select('user_id')
    .eq('user_id', currentUser.id)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('forum_upvotes')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('item_type', itemType)
      .eq('item_id', itemId);
  } else {
    await supabase.from('forum_upvotes').upsert(
      {
        user_id: currentUser.id,
        item_type: itemType,
        item_id: itemId,
      },
      { onConflict: 'user_id,item_type,item_id' },
    );
  }

  const { data: total } = await supabase
    .from('forum_upvotes')
    .select('user_id')
    .eq('item_type', itemType)
    .eq('item_id', itemId);

  return { upvoted: !existing, count: total?.length ?? 0 };
}

export async function acceptAnswer(postId: string, answerId: string): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to accept an answer.');

  const { data: post } = await supabase
    .from('forum_posts')
    .select('author_id')
    .eq('id', postId)
    .single();

  if (post?.author_id !== currentUser.id) {
    throw new Error('Only the author of the question can accept an answer.');
  }

  const { error } = await supabase
    .from('forum_posts')
    .update({ accepted_answer_id: answerId })
    .eq('id', postId);

  if (error) throw new Error(`Failed to accept answer: ${error.message}`);

  // Notify answer author that their solution was accepted
  try {
    const { data: answer } = await supabase
      .from('forum_answers')
      .select('id, author_id')
      .eq('id', answerId)
      .maybeSingle();

    if (answer && answer.author_id && answer.author_id !== currentUser.id) {
      await createNotification({
        userId: answer.author_id,
        actorId: currentUser.id,
        type: 'answer_accepted',
        title: 'Your answer was accepted!',
        message: `${currentUser.name || 'The author'} marked your reply as the accepted solution!`,
        linkUrl: `/community?post=${postId}`,
      });
    }
  } catch {
    // Non-fatal
  }
}

export async function deleteForumPost(postId: string): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Unauthorized');

  const { data: post } = await supabase
    .from('forum_posts')
    .select('id, author_id')
    .eq('id', postId)
    .maybeSingle();

  if (!post) throw new Error('Post not found');
  if (post.author_id !== currentUser.id && currentUser.role !== 'organizer') {
    throw new Error('Forbidden: You can only delete your own posts.');
  }

  const { error } = await supabase.from('forum_posts').delete().eq('id', postId);
  if (error) throw new Error(`Failed to delete post: ${error.message}`);
}

export async function deleteForumAnswer(answerId: string): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Unauthorized');

  const { data: answer } = await supabase
    .from('forum_answers')
    .select('id, author_id')
    .eq('id', answerId)
    .maybeSingle();

  if (!answer) throw new Error('Answer not found');
  if (answer.author_id !== currentUser.id && currentUser.role !== 'organizer') {
    throw new Error('Forbidden: You can only delete your own answers.');
  }

  const { error } = await supabase.from('forum_answers').delete().eq('id', answerId);
  if (error) throw new Error(`Failed to delete answer: ${error.message}`);
}

export async function reportForumItem(
  itemType: 'post' | 'answer',
  itemId: string,
  reason = 'Flagged by user',
): Promise<void> {
  const supabase = await createDbClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('You must be signed in to report content.');

  const reportItemType = itemType === 'post' ? 'forum_post' : 'forum_answer';
  await Promise.all([
    supabase.from('forum_reports').insert({
      reporter_id: currentUser.id,
      item_type: itemType,
      item_id: itemId,
      reason,
    }),
    supabase.from('reports').insert({
      reporter_id: currentUser.id,
      item_type: reportItemType,
      item_id: itemId,
      reason: reason.trim().slice(0, 200) || 'Flagged by user',
      details: null,
      status: 'pending',
    }),
  ]);

  const table = itemType === 'post' ? 'forum_posts' : 'forum_answers';
  await supabase.from(table).update({ is_reported: true }).eq('id', itemId);
}

// Community alias exports
export const getCommunityPosts = getForumPosts;
export const getCommunityPostWithAnswers = getForumPostWithAnswers;
export const createCommunityPost = createForumPost;
export const createCommunityAnswer = createForumAnswer;
export const deleteCommunityPost = deleteForumPost;
export const deleteCommunityAnswer = deleteForumAnswer;
export const reportCommunityItem = reportForumItem;

