import Link from 'next/link';
import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findAuditByKey } from '@/lib/audit-lookup';
import { availablePlatforms, PLATFORM_LABELS } from '@/lib/llm-clients';
import { cleanResponseForDisplay } from '@/lib/text';
import type { AuditDoc } from '@/models/audit';
import ResultsScreen, { type AuditViewModel } from '@/components/results-screen';
import LoadingScreen, { type ProgressVM } from '@/components/loading-screen';
import { TopNav, FooterBar } from '@/components/chrome';
import { IconAlert, IconArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Dedupe the lookup between generateMetadata and the page render.
const getAudit = cache((id: string) => findAuditByKey(id));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const audit = await getAudit(id).catch(() => null);
  return {
    title: audit ? `${audit.companyName} — AI Visibility Audit · Talivity` : 'AI Visibility Audit · Talivity',
    // Reports contain prospect data; keep shared links out of search engines.
    robots: { index: false, follow: false },
  };
}

export default async function AuditPage({ params }: Params) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();

  if (audit.status === 'running') {
    return (
      <LoadingScreen
        company={audit.companyName}
        auditId={id}
        initialProgress={(audit.progress as ProgressVM | null) ?? null}
        platforms={availablePlatforms().map((p) => PLATFORM_LABELS[p])}
      />
    );
  }

  if (audit.status === 'failed') {
    return (
      <div className="screen-enter min-h-screen flex flex-col" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
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
            <Link href="/" className="btn-accent mt-8 inline-flex">
              Try again
              <IconArrowRight size={16} />
            </Link>
          </div>
        </div>
        <FooterBar tone="paper" />
      </div>
    );
  }

  return <ResultsScreen audit={toViewModel(audit, id)} />;
}

function toViewModel(audit: AuditDoc, id: string): AuditViewModel {
  const competitors = (audit.competitors ?? {}) as {
    topCompetitor?: string | null;
    competitorCitations?: number;
    breakdown?: Record<string, number>;
  };
  const samples = (audit.sampleResponses ?? []) as AuditViewModel['sampleResponses'];
  const insights = answerInsights(audit);

  // Note: no email. The view model is serialised into the page for the
  // browser, and anyone with the link can see the page.
  return {
    id,
    companyName: audit.companyName,
    companyUrl: audit.companyUrl ?? null,
    industry: audit.industry,
    score: audit.score ?? 0,
    citationsOwned: audit.citationsOwned ?? 0,
    citationsTotal: audit.citationsTotal ?? 0,
    totalResponses: audit.totalResponses || undefined,
    platformsUsed: audit.platformsUsed || undefined,
    platforms: audit.platforms?.length ? [...audit.platforms] : undefined,
    sourceMix: (audit.sourceMix ?? {}) as Record<string, number>,
    sampleResponses: samples.map((s) => ({ ...s, response: cleanResponseForDisplay(String(s.response ?? '')) })),
    competitors: {
      topCompetitor: competitors.topCompetitor ?? null,
      competitorCitations: competitors.competitorCitations ?? 0,
      breakdown: competitors.breakdown ?? {},
    },
    sentiment: (audit.sentiment as AuditViewModel['sentiment']) ?? null,
    notRecognized: audit.notRecognized ?? false,
    errorMessage: audit.errorMessage ?? null,
    createdAt: audit.createdAt ? new Date(audit.createdAt).toISOString() : undefined,
    ...insights,
  };
}

type StoredAnswer = { platform?: string; knows?: boolean; sources?: string[]; competitors?: string[] };

/**
 * Aggregates over every stored answer (not just the ones that knew the
 * company). Powers the report for companies AI doesn't recognise: how many
 * answers knew them per platform, and where AI pointed candidates instead.
 * Only these totals reach the browser — never the raw answers.
 */
function answerInsights(audit: AuditDoc): Pick<AuditViewModel, 'recognition' | 'adviceSourceMix' | 'adviceCompetitor'> {
  const answers = (audit.responses ?? []) as StoredAnswer[];
  if (!answers.length) return {};

  const order = ['ChatGPT', 'Claude', 'Gemini'];
  const byPlatform = new Map<string, { known: number; total: number }>();
  const sources: Record<string, number> = {};
  const competitors: Record<string, number> = {};
  for (const a of answers) {
    const platform = a.platform ?? 'AI';
    const entry = byPlatform.get(platform) ?? { known: 0, total: 0 };
    entry.total++;
    if (a.knows) entry.known++;
    byPlatform.set(platform, entry);
    for (const s of a.sources ?? []) sources[s] = (sources[s] ?? 0) + 1;
    for (const c of a.competitors ?? []) competitors[c] = (competitors[c] ?? 0) + 1;
  }
  const top = Object.entries(competitors).sort((x, y) => y[1] - x[1])[0];
  return {
    recognition: [...byPlatform.entries()]
      .sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0]))
      .map(([platform, v]) => ({ platform, ...v })),
    adviceSourceMix: sources,
    adviceCompetitor: { name: top?.[0] ?? null, count: top?.[1] ?? 0 },
  };
}
