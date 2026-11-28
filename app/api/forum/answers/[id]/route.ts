import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-errors';
import { acceptAnswer, deleteForumAnswer } from '@/lib/db/community';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await deleteForumAnswer(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting answer:', err);
    return apiErrorResponse(err, 'Failed to delete answer');
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body: unknown = await request.json().catch(() => null);
    const { postId } = (body || {}) as { postId?: unknown };
    if (typeof postId !== 'string' || !postId.trim()) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 });
    }

    await acceptAnswer(postId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error accepting answer:', err);
    return apiErrorResponse(err, 'Failed to accept answer');
  }
}
