import { NextResponse } from 'next/server';
import { findAuditByKey } from '@/lib/audit-lookup';
import { queuePosition } from '@/lib/audit-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Public status endpoint polled by the loading screen. Deliberately returns
 * no PII — it used to return the whole document, email included, to anyone
 * who knew (or guessed) the id.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const audit = await findAuditByKey(id, { statusOnly: true });
    if (!audit) return json({ error: 'not_found' }, 404);
    return json(
      {
        audit: {
          id,
          status: audit.status,
          companyName: audit.companyName,
          progress: audit.progress ?? null,
          queuePosition: queuePosition(String(audit._id)),
        },
      },
      200
    );
  } catch (err) {
    console.error('[api/audit/:id] lookup failed', err);
    return json({ error: 'unavailable' }, 503);
  }
}
