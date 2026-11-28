import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-errors';
import { addProjectComment, deleteProjectComment } from '@/lib/db/projects';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    const content = typeof body?.content === 'string' ? body.content : '';
    if (!content.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 });

    const commentId = await addProjectComment(id, content);
    return NextResponse.json({ success: true, commentId });
  } catch (err) {
    console.error('Error adding comment:', err);
    return apiErrorResponse(err, 'Failed to add comment');
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const commentId = searchParams.get('commentId');
  if (!commentId) return NextResponse.json({ error: 'commentId is required' }, { status: 400 });

  try {
    await deleteProjectComment(commentId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting comment:', err);
    return apiErrorResponse(err, 'Failed to delete comment');
  }
}
