import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-errors';
import { updateSessionStatus } from '@/lib/db/mentorship';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    const { status } = body || {};

    if (!['accepted', 'declined', 'completed', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
    }

    await updateSessionStatus(id, status);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error updating session status:', err);
    return apiErrorResponse(err, 'Failed to update session');
  }
}
