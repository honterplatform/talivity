'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav, FooterBar, DecorArcs } from '@/components/chrome';
import {
  IconAlert,
  IconArrowRight,
  IconArrowUpRight,
  IconEye,
  IconShield,
  IconTarget,
  IconUsers,
} from '@/components/icons';

export interface AuditViewModel {
  id: string;
  companyName: string;
  companyUrl?: string | null;
  industry: string;
  score: number;
  citationsOwned: number;
  citationsTotal: number;
  totalResponses?: number;
  platformsUsed?: number;
  platforms?: string[];
  sourceMix: Record<string, number>;
  sampleResponses: Array<{
    platform: string;
    query: string;
    response: string;
    sourceCited: string | null;
  }>;
  competitors: {
    topCompetitor: string | null;
    competitorCitations: number;
    breakdown?: Record<string, number>;
  };
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  notRecognized?: boolean;
  errorMessage?: string | null;
  createdAt?: string;
}

// Horizontal gutters: generous on desktop, usable on a 375px phone.
const PAD = 'px-6 sm:px-10 md:px-16 lg:px-32';

interface MixSegment {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
  isOwn: boolean;
}

const THIRD_PARTY_SOURCES = [
  { key: 'glassdoor', label: 'Glassdoor', tagline: 'Your reviews are doing your recruiting.' },
  { key: 'reddit', label: 'Reddit', tagline: 'Anonymous threads are shaping your reputation.' },
  { key: 'indeed', label: 'Indeed', tagline: 'Indeed reviews are telling your story.' },
  { key: 'linkedin', label: 'LinkedIn', tagline: 'LinkedIn is doing the talking for you.' },
  { key: 'news', label: 'the press', tagline: 'Press coverage is framing your employer brand.' },
  { key: 'wikipedia', label: 'Wikipedia', tagline: 'Wikipedia has become your default bio.' },
  { key: 'other', label: 'a third-party site', tagline: 'Third-party sites are telling your story.' },
] as const;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Percentages that always add up to exactly 100 (largest remainder). */
function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const out = raw.map(Math.floor);
  let remainder = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    if (counts[i] > 0) {
      out[i]++;
      remainder--;
    }
  }
  return out;
}

function buildSourceMixSegments(
  sourceMix: Record<string, number>,
  competitorCitations: number,
  topCompetitor: string | null
): MixSegment[] {
  const n = (k: string) => sourceMix[k] ?? 0;
  const groups = [
    { key: 'glassdoor', label: 'Glassdoor', count: n('glassdoor'), color: 'rgba(240, 197, 85, 0.85)', isOwn: false },
    { key: 'reddit', label: 'Reddit', count: n('reddit'), color: 'rgba(240, 197, 85, 0.55)', isOwn: false },
    { key: 'indeed', label: 'Indeed', count: n('indeed'), color: 'rgba(51, 211, 201, 0.35)', isOwn: false },
    { key: 'linkedin', label: 'LinkedIn', count: n('linkedin'), color: 'rgba(3, 68, 74, 0.28)', isOwn: false },
    {
      key: 'competitor',
      label: topCompetitor ?? 'Competitors',
      count: competitorCitations,
      color: 'rgba(240, 197, 85, 0.30)',
      isOwn: false,
    },
    { key: 'news', label: 'News / Press', count: n('news') + n('wikipedia'), color: 'rgba(51, 211, 201, 0.55)', isOwn: false },
    { key: 'other', label: 'Other third-party', count: n('other'), color: 'rgba(14, 23, 20, 0.10)', isOwn: false },
    { key: 'site', label: 'Your career site', count: n('ownSite'), color: '#33D3C9', isOwn: true },
  ];
  const pcts = percentages(groups.map((g) => g.count));
  return groups.map((g, i) => ({ ...g, pct: pcts[i] }));
}

function ratioOutOf(count: number, total: number): string {
  return `${Math.min(count, total)}/${total}`;
}

function multiple(x: number): string {
  return x >= 1.95 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`;
}

export default function ResultsScreen({ audit }: { audit: AuditViewModel }) {
  const router = useRouter();
  const [booking, setBooking] = useState(false);

  async function bookSession() {
    setBooking(true);
    try {
      await fetch(`/api/audit/${encodeURIComponent(audit.id)}/cta`, { method: 'POST', keepalive: true });
    } catch {
      // Recording the click is best-effort; never block the prospect.
    }
    router.push(`/thanks?audit=${encodeURIComponent(audit.id)}`);
  }

  if (audit.notRecognized) {
    return (
      <div className="screen-enter min-h-screen flex flex-col" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
        <TopNav tone="paper" />
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-[560px] text-center">
            <div className="eyebrow" style={{ color: '#33D3C9' }}>
              Not enough signal
            </div>
            <h1
              className="serif mt-4"
              style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              We couldn't find <em className="italic" style={{ color: '#33D3C9' }}>{audit.companyName}</em> in the
              conversation.
            </h1>
            <p className="mt-5 text-[17px] opacity-75 leading-relaxed">
              {audit.errorMessage ??
                "The major AI assistants don't have enough information about this company to score visibility yet."}{' '}
              That's a finding in itself — and it's exactly what Talivity helps fix.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button onClick={bookSession} disabled={booking} className="btn-accent inline-flex">
                Talk to our AI Search team
                <IconArrowRight size={16} />
              </button>
              <Link href="/" className="btn-ghost inline-flex">
                Run another audit
              </Link>
            </div>
          </div>
        </div>
        <FooterBar tone="paper" />
      </div>
    );
  }

  const score = audit.score;
  const totalResponses = audit.totalResponses ?? 30;
  const platformsUsed = audit.platformsUsed ?? audit.platforms?.length ?? 3;
  const topCompetitor = audit.competitors.topCompetitor;
  const competitorCount = audit.competitors.competitorCitations;
  const owned = audit.citationsOwned;

  const segments = buildSourceMixSegments(audit.sourceMix, competitorCount, topCompetitor);
  const mixTotal = segments.reduce((a, s) => a + s.count, 0);
  const ownedPct = segments.find((s) => s.isOwn)?.pct ?? 0;
  const loudest = segments
    .filter((s) => !s.isOwn && s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((s) => s.label);

  const date = audit.createdAt
    ? new Date(audit.createdAt).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : null;
  const auditIdShort = audit.id.slice(-10).toUpperCase();

  // Top third-party source (ties resolve in display order).
  const topSource = THIRD_PARTY_SOURCES.map((s) => ({ ...s, count: audit.sourceMix[s.key] ?? 0 })).reduce(
    (best, s) => (s.count > best.count ? s : best),
    { key: 'none', label: '', tagline: '', count: 0 } as { key: string; label: string; tagline: string; count: number }
  );

  const visibleShare = totalResponses ? Math.min(owned, totalResponses) / totalResponses : 0;
  const invisibleTenths = Math.round((1 - visibleShare) * 10);
  const visibilityLine =
    invisibleTenths >= 5
      ? `You're invisible in ${invisibleTenths} out of 10 candidate searches.`
      : `You're cited in ${10 - invisibleTenths} out of 10 candidate searches — competitors are working to close that gap.`;

  const competitorSub = !topCompetitor
    ? 'No single competitor dominated. The category is still open.'
    : owned === 0
      ? `${topCompetitor} is dominating the AI conversation about this category.`
      : competitorCount > owned
        ? `${topCompetitor} has ${multiple(competitorCount / owned)} your share of voice.`
        : competitorCount === owned
          ? `${topCompetitor} matches your share of voice — one content push decides who leads.`
          : `You out-cite ${topCompetitor} ${owned} to ${competitorCount}. For now.`;

  const callout =
    mixTotal === 0
      ? {
          head: "AI isn't citing anyone — including you.",
          body: 'None of the answers pointed to a source. Candidates get generic answers, and the first employer to publish AI-readable content will own the narrative.',
        }
      : ownedPct >= 50
        ? {
            head: 'Your career site leads the conversation.',
            body: `${ownedPct}% of the citation mix points back at content you own. Keep it current — AI assistants re-rank sources constantly${loudest.length ? `, and ${joinNames(loudest)} are close behind` : ''}.`,
          }
        : {
            head:
              ownedPct === 0
                ? "Your career site isn't in the mix."
                : `Your career site is the ${ownedPct < 15 ? 'smallest slice' : 'minority voice'}.`,
            body: `${joinNames(loudest)} account for the loudest part of what candidates hear about you. That's the part of the funnel you have the least control over — and the part that talks loudest.`,
          };

  const implications = [
    {
      icon: <IconEye size={20} />,
      head:
        owned === 0
          ? "You're not in the conversation."
          : visibleShare < 0.5
            ? "You're barely in the conversation."
            : "You're in the conversation — protect it.",
      body:
        owned === 0
          ? `Out of ${totalResponses} candidate answers, none cited your own content. Candidates researching you with AI are forming opinions from third-party sources you don't control.`
          : visibleShare < 0.5
            ? `Out of ${totalResponses} candidate answers, your own content was cited in ${owned}. The rest leaned on third-party sources you don't control.`
            : `Your own content was cited in ${owned} of ${totalResponses} answers. That share is fragile: AI assistants re-rank sources constantly, and competitors are publishing to win the same queries.`,
    },
    {
      icon: <IconUsers size={20} />,
      head: topCompetitor ? 'Competitors own your category.' : 'No clear competitor dominance — yet.',
      body: topCompetitor
        ? `${topCompetitor} surfaces in ${competitorCount} of the ${totalResponses} answers about you. They're not winning on benefits — they're winning on the inputs AI assistants actually read.`
        : `No single competitor dominated the answers. That's a window: the category is still up for grabs, and the team that invests in AI-readable content first will define how candidates compare you.`,
    },
    {
      icon: <IconTarget size={20} />,
      head: 'The fix is mechanical, not magical.',
      body: 'AI assistants cite a predictable set of sources. We can show you which 12 of them matter for your roles, and what to do about each one this quarter.',
    },
  ];

  return (
    <div className="screen-enter min-h-screen relative overflow-x-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <DecorArcs corners="top-right" position="absolute" />
      <div className="paper-grad">
        <TopNav tone="paper" />
        <div className={`${PAD} max-w-[1600px] mx-auto pt-6 md:pt-12 pb-16 md:pb-28`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] mono uppercase tracking-wider opacity-70">
            <span>AI Visibility Audit for</span>
            {date && (
              <>
                <span style={{ width: 22, height: 1, background: 'var(--ink)', opacity: 0.4 }} />
                <span>Report · {date}</span>
              </>
            )}
          </div>

          <h1
            className="serif mt-5 break-words"
            style={{ fontSize: 'clamp(44px, 7vw, 96px)', lineHeight: 0.95, letterSpacing: '-0.025em' }}
          >
            {audit.companyName}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] opacity-70">
            <span className="pill">{audit.industry}</span>
            <span>·</span>
            <span>Audit ID {auditIdShort}</span>
            <span>·</span>
            <span title={audit.platforms?.join(', ')}>
              {totalResponses} candidate queries · {platformsUsed} frontier model{platformsUsed === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      <div className={`${PAD} max-w-[1600px] mx-auto`}>
        <div
          className="rounded-[28px] p-6 sm:p-8 md:p-14 print-avoid-break"
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(14,23,20,0.06)',
            boxShadow: '0 20px 60px -32px rgba(14,23,20,0.12)',
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
            <div className="lg:col-span-5">
              <div className="eyebrow opacity-70 flex items-center gap-3">
                <span style={{ width: 22, height: 1, background: 'var(--ink)', opacity: 0.5 }} />
                AI Visibility Score
              </div>
              <div className="relative mt-2">
                <div
                  className="serif num flex items-end gap-2"
                  style={{ fontSize: 'clamp(104px, 16vw, 220px)', lineHeight: 0.85, letterSpacing: '-0.04em' }}
                >
                  <span>{score}</span>
                  <span className="serif opacity-40" style={{ fontSize: 'clamp(36px, 5vw, 64px)', marginBottom: '0.5em' }}>
                    /100
                  </span>
                </div>
              </div>

              <div className="mt-8 max-w-[480px]">
                <div className="scale-track">
                  <div className="scale-fill" style={{ width: score + '%' }} />
                  {[0, 25, 50, 75, 100].map((p) => (
                    <div
                      key={p}
                      className="scale-marker"
                      style={{
                        left: p + '%',
                        background: p <= score ? 'var(--paper-warm)' : 'var(--ink)',
                        opacity: p === 0 || p === 100 ? 0 : 0.5,
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-3 text-[11px] mono uppercase tracking-wider opacity-60">
                  <span>Invisible</span>
                  <span>Emerging</span>
                  <span>Visible</span>
                  <span>Dominant</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                <ResultStat
                  tone="lilac"
                  big={ratioOutOf(owned, totalResponses)}
                  label={`Times you were cited across ${totalResponses} candidate queries`}
                  sub={
                    owned > 0
                      ? `${owned} answer${owned === 1 ? '' : 's'} pointed back at your own content. The rest didn't.`
                      : `Zero answers pointed back at your own content. Candidates are hearing about you from everywhere except you.`
                  }
                />
                <ResultStat
                  tone="peach"
                  big={ratioOutOf(competitorCount, totalResponses)}
                  label={topCompetitor ? `Times ${topCompetitor} was cited` : 'Times any competitor was cited'}
                  sub={competitorSub}
                />
                <ResultStat
                  tone="sage"
                  big={ratioOutOf(topSource.count, totalResponses)}
                  label={
                    topSource.count > 0
                      ? `Times ${topSource.label} was cited instead of you`
                      : 'Times a review site was cited instead of you'
                  }
                  sub={
                    topSource.count > 0
                      ? topSource.tagline
                      : 'AI leaned on general knowledge rather than review sites for these answers.'
                  }
                />
              </div>

              <div className="mt-6 md:mt-8 flex items-start gap-3">
                <div className="mt-1.5 shrink-0" style={{ width: 7, height: 7, background: '#33D3C9', borderRadius: 99 }} />
                <p className="serif italic text-[16px] md:text-[18px] leading-snug" style={{ color: '#33D3C9' }}>
                  {visibilityLine}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${PAD} max-w-[1600px] mx-auto mt-24`}>
        <div className="dot-divider" style={{ color: 'var(--ink)' }} />
      </div>

      {/* Source mix */}
      <section className={`${PAD} max-w-[1600px] mx-auto mt-24 print-avoid-break`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-4">
            <div className="eyebrow" style={{ color: '#03444A', fontWeight: 700 }}>
              02 · The pipeline
            </div>
            <h2
              className="serif mt-3"
              style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              Where candidates are getting their{' '}
              <em className="italic" style={{ color: '#33D3C9' }}>
                information
              </em>
              .
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed opacity-75 max-w-[420px]">
              When candidates ask AI about working at {audit.companyName}, here's where the answers come from.{' '}
              {mixTotal === 0
                ? 'None of the answers cited a source — including yours.'
                : ownedPct === 0
                  ? 'None of the citation mix points back at content you own.'
                  : `${ownedPct >= 50 ? '' : 'Only '}${ownedPct}% of the citation mix points back at content you own.`}
            </p>
          </div>

          <div className="lg:col-span-8">
            {mixTotal > 0 ? (
              <>
                <div className="flex w-full overflow-hidden rounded-[14px] border border-black/10">
                  {segments
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <div
                        key={s.key}
                        className="seg flex items-center justify-start px-3 text-[12px] font-medium min-w-0"
                        style={{
                          flexGrow: s.count,
                          flexBasis: 0,
                          background: s.color,
                          color: s.isOwn ? 'var(--paper-warm)' : 'var(--ink)',
                        }}
                        title={`${s.label} — ${s.pct}%`}
                      >
                        <span className="truncate">{s.pct}%</span>
                      </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 mt-5">
                  {segments
                    .filter((s) => s.count > 0 || s.isOwn)
                    .map((s) => (
                      <div key={s.key} className="flex items-center gap-2 text-[13px] min-w-0">
                        <span className="legend-dot shrink-0" style={{ background: s.color }} />
                        <span className="font-medium truncate">{s.label}</span>
                        <span className="mono opacity-50 ml-auto">{s.pct}%</span>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div
                className="rounded-[14px] px-5 flex items-center text-[13px] opacity-70"
                style={{ height: 56, border: '1px dashed rgba(14,23,20,0.2)', background: 'var(--paper-warm)' }}
              >
                No sources were cited in these answers.
              </div>
            )}

            <div
              className="mt-8 rounded-[14px] p-5 flex items-start gap-4"
              style={{ background: 'var(--paper-warm)', border: '1px solid var(--paper-line)' }}
            >
              <div
                className="shrink-0 mt-1"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#33D3C9',
                  color: 'var(--paper-warm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconAlert size={18} />
              </div>
              <div>
                <div className="text-[15px] font-medium">{callout.head}</div>
                <div className="text-[13px] opacity-70 mt-1">{callout.body}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={`${PAD} max-w-[1600px] mx-auto mt-24`}>
        <div className="dot-divider" style={{ color: 'var(--ink)' }} />
      </div>

      {/* What AI is saying */}
      <section className={`${PAD} max-w-[1600px] mx-auto mt-24`}>
        <div>
          <div className="eyebrow" style={{ color: '#03444A', fontWeight: 700 }}>
            03 · Verbatim
          </div>
          <h2
            className="serif mt-3"
            style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
          >
            What AI is{' '}
            <em className="italic" style={{ color: '#33D3C9' }}>
              actually
            </em>{' '}
            saying.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed opacity-75 max-w-[560px]">
            Raw model responses, captured during this audit. Formatting removed; otherwise word for word.
          </p>
        </div>

        <div
          className={`grid grid-cols-1 gap-5 mt-10 ${
            audit.sampleResponses.length >= 3
              ? 'md:grid-cols-3'
              : audit.sampleResponses.length === 2
                ? 'md:grid-cols-2'
                : 'md:grid-cols-1'
          }`}
        >
          {audit.sampleResponses.map((r, i) => (
            <ResponseCard key={`${r.platform}-${i}`} r={r} />
          ))}
        </div>
      </section>

      <div className={`${PAD} max-w-[1600px] mx-auto mt-24`}>
        <div className="dot-divider" style={{ color: 'var(--ink)' }} />
      </div>

      {/* What this means */}
      <section className={`${PAD} max-w-[1600px] mx-auto mt-24`}>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="eyebrow" style={{ color: '#03444A', fontWeight: 700 }}>
              04 · So what
            </div>
            <h2
              className="serif mt-3"
              style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              What this means for your{' '}
              <em className="italic" style={{ color: '#33D3C9' }}>
                hiring
              </em>
              .
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          {implications.map((it, i) => (
            <div
              key={i}
              className="rounded-[18px] p-7 print-avoid-break"
              style={{ background: 'var(--paper-warm)', border: '1px solid var(--paper-line)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'var(--ink)',
                    color: 'var(--paper-warm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {it.icon}
                </div>
                <div className="mono text-[11px] uppercase tracking-wider opacity-60">
                  Finding {String(i + 1).padStart(2, '0')}
                </div>
              </div>
              <div className="serif mt-5 text-[24px] leading-tight" style={{ letterSpacing: '-0.01em' }}>
                {it.head}
              </div>
              <p className="text-[14px] leading-relaxed opacity-75 mt-3">{it.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section
        className="mt-48 relative overflow-hidden no-print"
        style={{
          background: 'var(--paper-warm)',
          color: 'var(--ink)',
          borderTop: '1px solid var(--paper-line)',
        }}
      >
        <DecorArcs corners="bottom-left" position="absolute" />

        <div className={`${PAD} max-w-[1600px] mx-auto py-20 md:py-28 grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-[1]`}>
          <div className="lg:col-span-7">
            <div className="eyebrow" style={{ color: '#33D3C9' }}>
              Next step
            </div>
            <h2
              className="serif mt-4"
              style={{ fontSize: 'clamp(44px, 6vw, 84px)', lineHeight: 0.98, letterSpacing: '-0.02em' }}
            >
              Want the{' '}
              <em className="italic" style={{ color: '#33D3C9' }}>
                full diagnostic
              </em>
              ?
            </h2>
            <p className="mt-6 text-[18px] leading-relaxed max-w-[600px]" style={{ color: 'rgba(14,23,20,0.72)' }}>
              This audit shows where you stand. Our complete four-week diagnostic shows you exactly which queries to
              win, what's broken on your site, and the roadmap to fix it.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button onClick={bookSession} disabled={booking} className="btn-accent whitespace-nowrap">
                Book your strategy session
                <IconArrowRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="text-[14px] inline-flex items-center gap-1.5 opacity-75 hover:opacity-100"
              >
                Or save this report as a PDF <IconArrowUpRight size={14} />
              </button>
            </div>

            <div className="mt-6 text-[13px]" style={{ color: 'rgba(14,23,20,0.6)' }}>
              30-minute call with Talivity's AI Search team. No pitch deck — just answers.
            </div>
          </div>

          <div className="lg:col-span-5 lg:pl-6">
            <div className="rounded-[18px] p-6 md:p-7" style={{ background: '#FFFFFF', border: '1px solid var(--paper-line)' }}>
              <div className="eyebrow" style={{ color: 'rgba(14,23,20,0.6)' }}>
                What you'll get
              </div>
              <ul className="mt-5 space-y-4 text-[15px]">
                {(
                  [
                    ['Query map', 'The 12 candidate queries you should be winning, ranked by hiring funnel impact.'],
                    [
                      'Source audit',
                      'Which Glassdoor, Reddit, and trade-press surfaces are doing the most damage — and the lift to fix them.',
                    ],
                    ['Roadmap', 'A four-week plan with owners, copy, and a content calendar. We do the doing.'],
                  ] as const
                ).map(([h, b]) => (
                  <li key={h} className="flex gap-3">
                    <span className="mt-1.5 shrink-0" style={{ width: 8, height: 8, background: '#33D3C9', borderRadius: 99 }} />
                    <div>
                      <div className="font-medium">{h}</div>
                      <div className="text-[13px] leading-relaxed" style={{ color: 'rgba(14,23,20,0.65)' }}>
                        {b}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div
                className="mt-7 pt-5 flex items-center justify-between text-[12px]"
                style={{ borderTop: '1px solid var(--paper-line)', color: 'rgba(14,23,20,0.6)' }}
              >
                <span className="inline-flex items-center gap-2">
                  <IconShield size={14} /> Mutual NDA on request
                </span>
                <span className="mono">~4 wks</span>
              </div>
            </div>
          </div>
        </div>

        <FooterBar tone="paper" />
      </section>
    </div>
  );
}

function ResultStat({
  tone,
  big,
  label,
  sub,
}: {
  tone: 'lilac' | 'peach' | 'sage' | 'clay';
  big: string;
  label: string;
  sub: string;
}) {
  const bg =
    tone === 'lilac'
      ? 'rgba(51, 211, 201, 0.25)'
      : tone === 'peach'
        ? 'rgba(240, 197, 85, 0.30)'
        : tone === 'sage'
          ? 'rgba(51, 211, 201, 0.15)'
          : 'rgba(240, 197, 85, 0.20)';
  return (
    <div className="rounded-[18px] p-6 flex flex-col h-full card-hover print-avoid-break" style={{ background: bg }}>
      <div className="serif num" style={{ fontSize: 'clamp(40px, 4vw, 56px)', lineHeight: 0.95, letterSpacing: '-0.03em' }}>
        {big}
      </div>
      <div className="mt-5 text-[15px] font-medium leading-snug">{label}</div>
      <div className="mt-3 text-[13px] opacity-70 leading-relaxed">{sub}</div>
    </div>
  );
}

/** Shorten long answers at a sentence boundary; null if no shortening needed. */
function previewOf(text: string, max = 460): string | null {
  if (text.length <= max + 120) return null;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '')).trim() + ' …';
}

function ResponseCard({ r }: { r: { platform: string; query: string; response: string; sourceCited: string | null } }) {
  const [expanded, setExpanded] = useState(false);
  const preview = previewOf(r.response);
  return (
    <div
      className="rounded-[18px] p-6 flex flex-col h-full print-avoid-break"
      style={{ background: 'var(--paper-warm)', border: '1px solid var(--paper-line)' }}
    >
      <div className="flex items-center justify-between">
        <ModelBadge model={r.platform} />
        <span className="pill">Verbatim</span>
      </div>
      <div className="mt-5 text-[12px] mono uppercase tracking-wider opacity-60">Candidate query</div>
      <div className="mt-1 text-[15px] font-medium leading-snug">{r.query}</div>

      <div className="mt-5 pl-4 relative">
        <span className="absolute left-0 top-1 bottom-1 w-[2px]" style={{ background: '#33D3C9' }} />
        <p className="serif italic text-[16px] leading-[1.55] verbatim" style={{ color: 'var(--ink)' }}>
          “
          {preview ? (
            <>
              <span className={expanded ? '' : 'hidden print:inline'}>{r.response}</span>
              <span className={expanded ? 'hidden' : 'print:hidden'}>{preview}</span>
            </>
          ) : (
            r.response
          )}
          ”
        </p>
        {preview && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="no-print mt-3 text-[12px] mono uppercase tracking-wider opacity-60 hover:opacity-100 underline"
          >
            {expanded ? 'Show less' : 'Show full answer'}
          </button>
        )}
      </div>

      <div className="mt-auto pt-5 border-t border-black/10 flex items-center justify-between text-[12px]">
        <span className="mono uppercase tracking-wider opacity-55">Source cited</span>
        <span className="pill">{r.sourceCited ?? 'No clear source'}</span>
      </div>
    </div>
  );
}

function ModelBadge({ model }: { model: string }) {
  const map: Record<string, { dot: string; label: string }> = {
    ChatGPT: { dot: '#10A37F', label: 'ChatGPT' },
    Claude: { dot: '#D97757', label: 'Claude' },
    Gemini: { dot: '#4285F4', label: 'Gemini' },
  };
  const m = map[model] ?? { dot: '#888', label: model };
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium">
      <span style={{ width: 10, height: 10, borderRadius: 99, background: m.dot }} />
      {m.label}
    </div>
  );
}
