import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-errors';
import { createForumPost, getForumPosts, type ForumPostType } from '@/lib/db/community';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as ForumPostType | null;
  const tag = searchParams.get('tag') || undefined;
  const search = searchParams.get('search') || undefined;

  try {
    const posts = await getForumPosts({
      type: type || undefined,
      tag,
      search,
    });
    return NextResponse.json({ posts });
  } catch (err) {
    console.error('Error in GET /api/forum/posts:', err);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const { type, title, content, tags } = body as {
      type?: unknown;
      title?: unknown;
      content?: unknown;
      tags?: unknown;
    };

    if (typeof title !== 'string' || !title.trim() || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const postType: ForumPostType =
      type === 'discussion' || type === 'announcement' ? type : 'question';

    const postId = await createForumPost({
      type: postType,
      title,
      content,
      tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [],
    });

    return NextResponse.json({ success: true, postId });
  } catch (err) {
    console.error('Error in POST /api/forum/posts:', err);
    return apiErrorResponse(err, 'Failed to create post');
  }
}
