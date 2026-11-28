import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // Firebase authentication proxy - pass through to allow auth session cookies cleanly
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};