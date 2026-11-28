import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-errors';
import { sendCollaborationRequest, updateCollaborationStatus } from '@/lib/db/projects';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message : '';
    const roleInterested = typeof body?.roleInterested === 'string' ? body.roleInterested : '';
    if (!message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const requestId = await sendCollaborationRequest(id, message, roleInterested);
    return NextResponse.json({ success: true, requestId });
  } catch (err) {
    console.error('Error sending collaboration request:', err);
    return apiErrorResponse(err, 'Failed to send collaboration request');
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
    const status = body?.status;
    if (!requestId || !['accepted', 'declined'].includes(status)) {
      return NextResponse.json({ error: 'Valid requestId and status are required' }, { status: 400 });
    }

    await updateCollaborationStatus(requestId, status, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error updating collaboration status:', err);
    return apiErrorResponse(err, 'Failed to update collaboration status');
  }
}
