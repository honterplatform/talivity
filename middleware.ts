import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const expectedPass = process.env.ADMIN_PASSWORD;
  const expectedUser = process.env.ADMIN_USER ?? 'admin';

  if (!expectedPass) {
    return new NextResponse(
      'Admin not configured. Set ADMIN_PASSWORD in your environment.',
      { status: 500 }
    );
  }

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === expectedUser && pass === expectedPass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Talivity Admin"' },
  });
}

export const config = {
  matcher: ['/admin/:path*'],
};
