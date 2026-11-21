import { NextResponse } from 'next/server';
import { Audit } from '@/models/audit';
import { findAuditByKey } from '@/lib/audit-lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Records a click on "Book your strategy session" so sales can see hot leads
 * in /admin. Previously the click went nowhere.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const audit = await findAuditByKey(id);
    if (!audit) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    await Audit.updateOne({ _id: audit._id }, { $inc: { ctaClicks: 1 } });
    // `null` sorts before dates in MongoDB, so $min can't set a first value — filter instead.
    await Audit.updateOne({ _id: audit._id, ctaClickedAt: null }, { $set: { ctaClickedAt: new Date() } });

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api/audit/:id/cta] failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
