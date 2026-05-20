'use client';

import { useRouter } from 'next/navigation';
import { TopNav, FooterBar, Orb } from '@/components/chrome';
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
  industry: string;
  email: string;
  score: number;
  citationsOwned: number;
  citationsTotal: number;
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

interface MixSegment {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
  isOwn: boolean;
}

const TOTAL_RESPONSES = 30;

function buildSourceMixSegments(
  sourceMix: Record<string, number>,
  competitorCitations: number
): MixSegment[] {
  const groups: Array<{ key: string; label: string; count: number; color: string; isOwn: boolean }> = [
    { key: 'glassdoor', label: 'Glassdoor', count: sourceMix.glassdoor ?? 0, color: 'var(--peach)', isOwn: false },
    { key: 'reddit', label: 'Reddit', count: sourceMix.reddit ?? 0, color: 'var(--clay)', isOwn: false },
    { key: 'indeed', label: 'Indeed', count: sourceMix.indeed ?? 0, color: 'var(--sage)', isOwn: false },
    { key: 'competitor', label: 'Competitors', count: competitorCitations, color: 'var(--lilac)', isOwn: false },
    {
      key: 'news',
      label: 'News / Press',
      count: (sourceMix.news ?? 0) + (sourceMix.wikipedia ?? 0) + (sourceMix.linkedin ?? 0) + (sourceMix.other ?? 0),
      color: '#C8BFA6',
      isOwn: false,
    },
    { key: 'site', label: 'Your career site', count: sourceMix.ownSite ?? 0, color: 'var(--accent)', isOwn: true },
  ];

  const total = groups.reduce((s, g) => s + g.count, 0);
  if (total === 0) {
    return groups.map((g) => ({ ...g, pct: g.key === 'news' ? 100 : 0 }));
  }
  return groups.map((g) => ({ ...g, pct: Math.round((g.count / total) * 100) }));
}

function ratioOutOf(count: number, total = TOTAL_RESPONSES): string {
  const capped = Math.min(count, total);
  return `${capped}/${total}`;
}

export default function ResultsScreen({ audit }: { audit: AuditViewModel }) {
  const router = useRouter();

  if (audit.notRecognized) {
    return (
      <div
        className="screen-enter min-h-screen flex flex-col"
        style={{ background: 'var(--paper)', color: 'var(--ink)' }}
      >
        <TopNav tone="paper" />
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-[560px] text-center">
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>
              Not enough signal
            </div>
            <h1
              className="serif mt-4"
              style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              We couldn't find <em className="italic" style={{ color: 'var(--accent)' }}>{audit.companyName}</em> in the conversation.
            </h1>
            <p className="mt-5 text-[17px] opacity-75 leading-relaxed">
              {audit.errorMessage ??
                "The major AI assistants don't have enough information about this company to score visibility yet. That's a finding in itself — and it's exactly what Talivity helps fix."}
            </p>
            <a href="/" className="btn-accent mt-8 inline-flex">
              Run another audit
              <IconArrowRight size={16} />
            </a>
          </div>
        </div>
        <FooterBar tone="paper" />
      </div>
    );
  }

  const segments = buildSourceMixSegments(audit.sourceMix, audit.competitors.competitorCitations);
  const ownerSegment = segments.find((s) => s.isOwn);
  const ownedPct = ownerSegment?.pct ?? 0;
  const date = audit.createdAt
    ? new Date(audit.createdAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : 'May 2026';
  const auditIdShort = audit.id.slice(-10).toUpperCase();
  const score = audit.score;
  const topCompetitor = audit.competitors.topCompetitor;
  const competitorCount = audit.competitors.competitorCitations;
  const glassdoorCount = audit.sourceMix.glassdoor ?? 0;
  const invisibilityCount = Math.max(0, TOTAL_RESPONSES - audit.citationsOwned);
  const invisibilityRatio = `${Math.round((invisibilityCount / TOTAL_RESPONSES) * 10)} out of 10`;

  const implications = [
    {
      icon: <IconEye size={20} />,
      head: "You're not in the conversation.",
      body: `Out of ${TOTAL_RESPONSES} candidate queries, your company was the cited source in ${audit.citationsOwned}. That means candidates researching you with AI are forming opinions from third-party sources you don't control.`,
    },
    {
      icon: <IconUsers size={20} />,
      head: topCompetitor ? 'Competitors own your category.' : 'No clear competitor dominance — yet.',
      body: topCompetitor
        ? `${topCompetitor} surfaces in ${competitorCount} of the ${TOTAL_RESPONSES} responses. They're not winning on benefits — they're winning on the inputs AI assistants actually read.`
        : `No single competitor dominated the responses. That's a window: the category is still up for grabs, and the team that invests in AI-readable content first will define how candidates compare you.`,
    },
    {
      icon: <IconTarget size={20} />,
      head: 'The fix is mechanical, not magical.',
      body: "AI assistants cite a predictable set of sources. We can show you which 12 of them matter for your roles, and what to do about each one this quarter.",
    },
  ];

  return (
    <div className="screen-enter min-h-screen" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="paper-grad">
        <TopNav tone="paper" />
        <div className="px-8 md:px-14 pt-4 md:pt-8 pb-12 md:pb-20">
          <div className="flex items-center gap-3 text-[12px] mono uppercase tracking-wider opacity-70">
            <span>AI Visibility Audit for</span>
            <span style={{ width: 22, height: 1, background: 'var(--ink)', opacity: 0.4 }} />
            <span>Report · {date}</span>
          </div>

          <h1
            className="serif mt-5"
            style={{ fontSize: 'clamp(48px, 7vw, 96px)', lineHeight: 0.95, letterSpacing: '-0.025em' }}
          >
            {audit.companyName}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] opacity-70">
            <span className="pill">{audit.industry}</span>
            <span>·</span>
            <span>Audit ID {auditIdShort}</span>
            <span>·</span>
            <span>30 candidate queries · 3 frontier models</span>
          </div>
        </div>
      </div>

      <div className="px-8 md:px-14 -mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          <div className="lg:col-span-5">
            <div className="eyebrow opacity-70 flex items-center gap-3">
              <span style={{ width: 22, height: 1, background: 'var(--ink)', opacity: 0.5 }} />
              AI Visibility Score
            </div>
            <div className="relative mt-2">
              <div
                className="serif num flex items-end gap-2"
                style={{ fontSize: 'clamp(120px, 16vw, 220px)', lineHeight: 0.85, letterSpacing: '-0.04em' }}
              >
                <span>{score}</span>
                <span
                  className="serif opacity-40"
                  style={{ fontSize: 'clamp(40px, 5vw, 64px)', marginBottom: '0.5em' }}
                >
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

            <div className="mt-9 flex items-start gap-3 max-w-[480px]">
              <div
                className="mt-1.5 shrink-0"
                style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 99 }}
              />
              <p
                className="serif italic text-[22px] md:text-[26px] leading-snug"
                style={{ color: 'var(--accent)' }}
              >
                You're invisible in {invisibilityRatio} candidate searches.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
              <ResultStat
                tone="lilac"
                big={ratioOutOf(audit.citationsOwned)}
                label={`Times you were cited across ${TOTAL_RESPONSES} candidate queries`}
                sub={
                  audit.citationsOwned > 0
                    ? `${audit.citationsOwned} response${audit.citationsOwned === 1 ? '' : 's'} pointed back at your own content. The rest didn't.`
                    : `Zero responses pointed back at your own content. Candidates are hearing about you from everywhere except you.`
                }
              />
              <ResultStat
                tone="peach"
                big={ratioOutOf(competitorCount)}
                label={
                  topCompetitor
                    ? `Times ${topCompetitor} was cited`
                    : 'Times any competitor was cited'
                }
                sub={
                  topCompetitor && audit.citationsOwned > 0
                    ? `${topCompetitor} has ${Math.max(1, Math.round(competitorCount / Math.max(audit.citationsOwned, 1)))}× your share of voice.`
                    : topCompetitor
                      ? `${topCompetitor} is dominating the AI conversation about this category.`
                      : 'No single competitor dominated. The category is still open.'
                }
              />
              <ResultStat
                tone="sage"
                big={ratioOutOf(glassdoorCount)}
                label="Times Glassdoor was cited instead of you"
                sub="Your reviews are doing your recruiting."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 md:px-14 mt-20">
        <div className="dot-divider" style={{ color: 'var(--ink)' }} />
      </div>

      {/* Source mix */}
      <section className="px-8 md:px-14 mt-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-4">
            <div className="eyebrow opacity-70">02 · The pipeline</div>
            <h2
              className="serif mt-3"
              style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              Where candidates are getting their{' '}
              <em className="italic" style={{ color: 'var(--accent)' }}>
                information
              </em>
              .
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed opacity-75 max-w-[420px]">
              When candidates ask AI about working at {audit.companyName}, here's where the answers come from.
              Only {ownedPct}% of the citation mix points back at content you own.
            </p>
          </div>

          <div className="lg:col-span-8">
            <div className="flex w-full overflow-hidden rounded-[14px] border border-black/10">
              {segments
                .filter((s) => s.pct > 0)
                .map((s) => (
                  <div
                    key={s.key}
                    className="seg flex items-center justify-start px-3 text-[12px] font-medium"
                    style={{
                      width: s.pct + '%',
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
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-[13px]">
                  <span className="legend-dot" style={{ background: s.color }} />
                  <span className="font-medium">{s.label}</span>
                  <span className="mono opacity-50 ml-auto">{s.pct}%</span>
                </div>
              ))}
            </div>

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
                  background: 'var(--accent)',
                  color: 'var(--paper-warm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconAlert size={18} />
              </div>
              <div>
                <div className="text-[15px] font-medium">
                  Your career site is the {ownedPct < 15 ? 'smallest slice' : 'minority voice'}.
                </div>
                <div className="text-[13px] opacity-70 mt-1">
                  Glassdoor, Reddit, and competitor mentions account for the loudest part of what candidates hear about you. That's the part of the funnel you have the least control over — and the part that talks loudest.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="px-8 md:px-14 mt-20">
        <div className="dot-divider" style={{ color: 'var(--ink)' }} />
      </div>

      {/* What AI is saying */}
      <section className="px-8 md:px-14 mt-16">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="eyebrow opacity-70">03 · Verbatim</div>
            <h2
              className="serif mt-3"
              style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              What AI is{' '}
              <em className="italic" style={{ color: 'var(--accent)' }}>
                actually
              </em>{' '}
              saying.
            </h2>
          </div>
          <div className="text-[13px] opacity-70 max-w-[420px]">
            Raw model responses, captured during this audit. Light cleanup for length only.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          {audit.sampleResponses.map((r, i) => (
            <ResponseCard key={`${r.platform}-${i}`} r={r} />
          ))}
        </div>
      </section>

      <div className="px-8 md:px-14 mt-20">
        <div className="dot-divider" style={{ color: 'var(--ink)' }} />
      </div>

      {/* What this means */}
      <section className="px-8 md:px-14 mt-16">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="eyebrow opacity-70">04 · So what</div>
            <h2
              className="serif mt-3"
              style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}
            >
              What this means for your{' '}
              <em className="italic" style={{ color: 'var(--accent)' }}>
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
              className="rounded-[18px] p-7"
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
        className="mt-24 relative overflow-hidden"
        style={{
          background: 'var(--paper-warm)',
          color: 'var(--ink)',
          borderTop: '1px solid var(--paper-line)',
        }}
      >
        <div className="absolute -top-32 -right-32 pointer-events-none">
          <Orb size={520} />
        </div>
        <div className="absolute bottom-12 left-[44%] pointer-events-none hidden md:block">
          <div
            className="ink-circle"
            style={{ width: 22, height: 22, borderColor: 'rgba(14,23,20,0.45)' }}
          />
        </div>

        <div className="px-8 md:px-14 py-20 md:py-28 grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-[1]">
          <div className="lg:col-span-7">
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>
              Next step
            </div>
            <h2
              className="serif mt-4"
              style={{ fontSize: 'clamp(44px, 6vw, 84px)', lineHeight: 0.98, letterSpacing: '-0.02em' }}
            >
              Want the{' '}
              <em className="italic" style={{ color: 'var(--accent)' }}>
                full diagnostic
              </em>
              ?
            </h2>
            <p
              className="mt-6 text-[18px] leading-relaxed max-w-[600px]"
              style={{ color: 'rgba(14,23,20,0.72)' }}
            >
              This audit shows you have a visibility problem. Our complete four-week diagnostic shows you
              exactly which queries to win, what's broken on your site, and the roadmap to fix it.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                onClick={() =>
                  router.push(
                    `/thanks?company=${encodeURIComponent(audit.companyName)}&email=${encodeURIComponent(audit.email)}`
                  )
                }
                className="btn-accent whitespace-nowrap"
              >
                Book your strategy session
                <IconArrowRight size={18} />
              </button>
              <a
                href="#"
                className="text-[14px] inline-flex items-center gap-1.5 opacity-75 hover:opacity-100"
              >
                Or download the PDF report <IconArrowUpRight size={14} />
              </a>
            </div>

            <div className="mt-6 text-[13px]" style={{ color: 'rgba(14,23,20,0.6)' }}>
              30-minute call with Talivity's AI Search team. No pitch deck — just answers.
            </div>
          </div>

          <div className="lg:col-span-5 lg:pl-6">
            <div
              className="rounded-[18px] p-6 md:p-7"
              style={{ background: '#FFFFFF', border: '1px solid var(--paper-line)' }}
            >
              <div className="eyebrow" style={{ color: 'rgba(14,23,20,0.6)' }}>
                What you'll get
              </div>
              <ul className="mt-5 space-y-4 text-[15px]">
                {([
                  ['Query map', 'The 12 candidate queries you should be winning, ranked by hiring funnel impact.'],
                  ['Source audit', 'Which Glassdoor, Reddit, and trade-press surfaces are doing the most damage — and the lift to fix them.'],
                  ['Roadmap', 'A four-week plan with owners, copy, and a content calendar. We do the doing.'],
                ] as const).map(([h, b]) => (
                  <li key={h} className="flex gap-3">
                    <span
                      className="mt-1.5 shrink-0"
                      style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 99 }}
                    />
                    <div>
                      <div className="font-medium">{h}</div>
                      <div
                        className="text-[13px] leading-relaxed"
                        style={{ color: 'rgba(14,23,20,0.65)' }}
                      >
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
      ? 'var(--lilac)'
      : tone === 'peach'
        ? 'var(--peach)'
        : tone === 'sage'
          ? 'var(--sage)'
          : 'var(--clay)';
  return (
    <div className="rounded-[18px] p-6 flex flex-col h-full card-hover" style={{ background: bg }}>
      <div className="serif num" style={{ fontSize: 88, lineHeight: 0.88, letterSpacing: '-0.03em' }}>
        {big}
      </div>
      <div className="mt-5 text-[15px] font-medium leading-snug">{label}</div>
      <div className="mt-3 text-[13px] opacity-70 leading-relaxed">{sub}</div>
    </div>
  );
}

function ResponseCard({
  r,
}: {
  r: { platform: string; query: string; response: string; sourceCited: string | null };
}) {
  return (
    <div
      className="rounded-[18px] p-6 flex flex-col h-full"
      style={{ background: 'var(--paper-warm)', border: '1px solid var(--paper-line)' }}
    >
      <div className="flex items-center justify-between">
        <ModelBadge model={r.platform} />
        <span className="pill">Verbatim</span>
      </div>
      <div className="mt-5 text-[12px] mono uppercase tracking-wider opacity-60">Candidate query</div>
      <div className="mt-1 text-[15px] font-medium leading-snug">{r.query}</div>

      <div className="mt-5 pl-4 relative">
        <span
          className="absolute left-0 top-1 bottom-1 w-[2px]"
          style={{ background: 'var(--accent)' }}
        />
        <p className="serif italic text-[16px] leading-[1.55]" style={{ color: 'var(--ink)' }}>
          “{r.response}”
        </p>
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
