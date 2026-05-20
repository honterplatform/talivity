import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/mongodb';
import { Audit } from '@/models/audit';
import { runAudit } from '@/lib/audit-engine';
import { INDUSTRIES, isIndustry } from '@/lib/query-templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

const AuditInput = z.object({
  companyName: z.string().trim().min(1).max(120),
  industry: z.string().refine(isIndustry, {
    message: `industry must be one of: ${INDUSTRIES.join(', ')}`,
  }),
  email: z.string().trim().toLowerCase().email().max(200),
});

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = AuditInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { companyName, industry, email } = parsed.data;

  await connectDB();

  // Rate limit: same email in the last hour
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await Audit.findOne({ email, createdAt: { $gte: since } }).lean();
  if (recent) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message:
          "You've already run an audit recently. Please wait an hour before running another, or check your email for the previous report.",
      },
      { status: 429 }
    );
  }

  // Create the audit document.
  const audit = await Audit.create({
    companyName,
    industry,
    email,
    status: 'running',
  });

  try {
    const result = await runAudit(companyName, industry as (typeof INDUSTRIES)[number]);

    audit.status = result.status;
    audit.score = result.score;
    audit.citationsOwned = result.citationsOwned;
    audit.citationsTotal = result.citationsTotal;
    audit.sourceMix = result.sourceMix;
    audit.sampleResponses = result.sampleResponses;
    audit.competitors = {
      topCompetitor: result.competitors.topCompetitor,
      competitorCitations: result.competitors.competitorCitations,
      breakdown: result.competitors.breakdown,
    };
    audit.sentiment = result.sentiment;
    audit.notRecognized = result.notRecognized;
    audit.errorMessage = result.errorMessage;
    await audit.save();

    return NextResponse.json({ auditId: audit._id.toString() }, { status: 200 });
  } catch (err) {
    audit.status = 'failed';
    audit.errorMessage = (err as Error).message ?? 'Audit failed';
    await audit.save();

    return NextResponse.json(
      { auditId: audit._id.toString(), error: 'audit_failed', message: audit.errorMessage },
      { status: 500 }
    );
  }
}
