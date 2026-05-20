import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { Audit } from '@/models/audit';
import ResultsScreen, { type AuditViewModel } from '@/components/results-screen';
import LoadingScreen from '@/components/loading-screen';
import { TopNav, FooterBar } from '@/components/chrome';
import { IconAlert, IconArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ params }: { params: { id: string } }) {
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    notFound();
  }

  await connectDB();
  const audit = await Audit.findById(params.id).lean();
  if (!audit) notFound();

  if (audit.status === 'running') {
    return <LoadingScreen company={audit.companyName} auditId={params.id} />;
  }

  if (audit.status === 'failed') {
    return (
      <div
        className="screen-enter min-h-screen flex flex-col"
        style={{ background: 'var(--paper)', color: 'var(--ink)' }}
      >
        <TopNav tone="paper" />
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-[560px] text-center">
            <div className="eyebrow inline-flex items-center gap-2" style={{ color: 'var(--accent)' }}>
              <IconAlert size={14} /> Audit failed
            </div>
            <h1
              className="serif mt-4"
              style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              Something went <em className="italic" style={{ color: 'var(--accent)' }}>wrong</em>.
            </h1>
            <p className="mt-5 text-[17px] opacity-75 leading-relaxed">
              {audit.errorMessage ?? 'We could not finish your audit. Please try again in a moment.'}
            </p>
            <a href="/" className="btn-accent mt-8 inline-flex">
              Try again
              <IconArrowRight size={16} />
            </a>
          </div>
        </div>
        <FooterBar tone="paper" />
      </div>
    );
  }

  const competitors = (audit.competitors ?? {}) as {
    topCompetitor?: string | null;
    competitorCitations?: number;
    breakdown?: Record<string, number>;
  };

  const vm: AuditViewModel = {
    id: String(audit._id),
    companyName: audit.companyName,
    industry: audit.industry,
    email: audit.email,
    score: audit.score ?? 0,
    citationsOwned: audit.citationsOwned ?? 0,
    citationsTotal: audit.citationsTotal ?? 0,
    sourceMix: (audit.sourceMix ?? {}) as Record<string, number>,
    sampleResponses: (audit.sampleResponses ?? []) as AuditViewModel['sampleResponses'],
    competitors: {
      topCompetitor: competitors.topCompetitor ?? null,
      competitorCitations: competitors.competitorCitations ?? 0,
      breakdown: competitors.breakdown ?? {},
    },
    sentiment: audit.sentiment as AuditViewModel['sentiment'],
    notRecognized: audit.notRecognized ?? false,
    errorMessage: audit.errorMessage,
    createdAt: audit.createdAt ? new Date(audit.createdAt).toISOString() : undefined,
  };

  return <ResultsScreen audit={vm} />;
}
