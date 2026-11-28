import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-errors';
import { reportForumItem } from '@/lib/db/community';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const { itemType, itemId, reason } = body as {
      itemType?: unknown;
      itemId?: unknown;
      reason?: unknown;
    };

    if (
      (itemType !== 'post' && itemType !== 'answer') ||
      typeof itemId !== 'string' ||
      !itemId.trim()
    ) {
      return NextResponse.json({ error: 'itemType and itemId are required' }, { status: 400 });
    }

    await reportForumItem(itemType, itemId, typeof reason === 'string' ? reason : undefined);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error reporting item:', err);
    return apiErrorResponse(err, 'Failed to report item');
  }
}
