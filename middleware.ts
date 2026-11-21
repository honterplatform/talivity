import { NextResponse, type NextRequest } from 'next/server';

/** Constant-time string comparison (Edge runtime has no crypto.timingSafeEqual). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function decodeBasic(header: string | null): { user: string; pass: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const sep = decoded.indexOf(':');
    if (sep === -1) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const expectedPass = process.env.ADMIN_PASSWORD;
  const expectedUser = process.env.ADMIN_USER ?? 'admin';

  if (!expectedPass) {
    return new NextResponse('Admin not configured. Set ADMIN_PASSWORD in your environment.', { status: 500 });
  }

  const creds = decodeBasic(req.headers.get('authorization'));
  // Evaluate both comparisons so timing doesn't reveal which one failed.
  const userOk = safeEqual(creds?.user ?? '', expectedUser);
  const passOk = safeEqual(creds?.pass ?? '', expectedPass);
  if (creds && userOk && passOk) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Talivity Admin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/admin/:path*'],
};
