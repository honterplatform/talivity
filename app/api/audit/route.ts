import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/mongodb';
import { Audit } from '@/models/audit';
import { runAudit } from '@/lib/audit-engine';
import { classifyIndustry } from '@/lib/llm-clients';

export const runtime = 'nodejs';
export const maxDuration = 60;

const AuditInput = z.object({
  companyUrl: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .transform((url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`))
    .refine(
      (url) => {
        try {
          const u = new URL(url);
          return /\.[a-z]{2,}/i.test(u.hostname);
        } catch {
          return false;
        }
      },
      { message: 'Enter a valid company URL (e.g. acme.com)' }
    ),
  email: z.string().trim().toLowerCase().email().max(200),
});

function deriveCompanyName(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '');
    const main = host.split('.')[0] ?? '';
    return main
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  } catch {
    return 'the company';
  }
}

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
  const { companyUrl, email } = parsed.data;
  const companyName = deriveCompanyName(companyUrl);
  const industry = await classifyIndustry(companyName, companyUrl);

  await connectDB();

  // Rate limit disabled while in testing. Re-enable before public launch.
  // const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  // const recent = await Audit.findOne({ email, createdAt: { $gte: since } }).lean();
  // if (recent) {
  //   return NextResponse.json(
  //     { error: 'rate_limited', message: "You've already run an audit recently. Please wait an hour before running another, or check your email for the previous report." },
  //     { status: 429 }
  //   );
  // }

  // Create the audit document.
  const audit = await Audit.create({
    companyName,
    companyUrl,
    industry,
    email,
    status: 'running',
  });

  try {
    const result = await runAudit(companyName, industry, companyUrl);

    audit.status = result.status;
    audit.score = result.score;
    audit.citationsOwned = result.citationsOwned;
    audit.citationsTotal = result.citationsTotal;
    audit.totalResponses = result.totalResponses;
    audit.platformsUsed = result.platformsUsed;
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
