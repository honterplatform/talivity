import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/mongodb';
import { Audit } from '@/models/audit';
import { heuristicCompanyName, parseCompanyUrl } from '@/lib/domain';
import { checkRateLimits, clientIp, hashIp } from '@/lib/rate-limit';
import { newPublicId } from '@/lib/audit-lookup';
import { enqueueAudit, queueIsFull } from '@/lib/audit-runner';
import { availablePlatforms } from '@/lib/llm-clients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AuditInput = z.object({
  companyUrl: z.string({ required_error: 'Enter your company website' }).trim().min(3, 'Enter your company website (e.g. acme.com)').max(300),
  email: z
    .string({ required_error: 'Enter your work email' })
    .trim()
    .toLowerCase()
    .max(200, 'That email is too long')
    .email('Enter a valid email address'),
});

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/**
 * Starts an audit and returns its id right away (202). The audit itself runs
 * in the background; the client polls GET /api/audit/[id].
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json', message: 'Invalid request.' }, 400);
  }

  const parsed = AuditInput.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input', details: parsed.error.flatten() },
      400
    );
  }
  const { email } = parsed.data;
  const domain = parseCompanyUrl(parsed.data.companyUrl);
  if (!domain) {
    return json({ error: 'invalid_input', message: 'Enter a valid company website (e.g. acme.com)' }, 400);
  }

  if (!availablePlatforms().length) {
    console.error('[api/audit] no AI providers configured/available');
    return json(
      { error: 'unavailable', message: 'Audits are temporarily unavailable. Please try again in a few minutes.' },
      503
    );
  }

  try {
    await connectDB();
  } catch (err) {
    console.error('[api/audit] database unavailable', err);
    return json({ error: 'unavailable', message: 'Service temporarily unavailable. Please try again shortly.' }, 503);
  }

  if (queueIsFull()) {
    return json(
      { error: 'busy', message: "We're running a lot of audits right now. Please try again in a few minutes." },
      503,
      { 'Retry-After': '120' }
    );
  }

  try {
    const ipHash = hashIp(clientIp(req));
    // Insert first, then count (including this one) — race-safe against
    // bursts of parallel requests, unlike count-then-insert.
    const audit = await Audit.create({
      publicId: newPublicId(),
      companyName: heuristicCompanyName(domain.label),
      companyUrl: domain.url,
      companyDomain: domain.registrableDomain,
      industry: 'General',
      email,
      ipHash,
      status: 'running',
      progress: { stage: 'queued', total: 0, done: 0, byPlatform: {} },
    });

    const limited = await checkRateLimits(email, ipHash, true);
    if (limited) {
      await Audit.deleteOne({ _id: audit._id });
      return json({ error: 'rate_limited', message: limited.message }, 429, { 'Retry-After': String(limited.retryAfterSec) });
    }

    enqueueAudit(String(audit._id));
    return json({ auditId: audit.publicId }, 202);
  } catch (err) {
    console.error('[api/audit] could not start audit', err);
    return json({ error: 'audit_failed', message: 'We could not start your audit. Please try again.' }, 500);
  }
}
