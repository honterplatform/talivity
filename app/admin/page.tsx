import Link from 'next/link';
import type { Metadata } from 'next';
import { connectDB } from '@/lib/mongodb';
import { Audit } from '@/models/audit';
import { providerStatus } from '@/lib/llm-clients';
import { publicKeyOf } from '@/lib/audit-lookup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Admin · Audits',
  robots: { index: false, follow: false },
};

interface PlatformStatRow {
  label?: string;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  sampleError?: string | null;
}

interface AuditRow {
  key: string;
  companyName: string;
  companyUrl: string | null;
  industry: string;
  email: string;
  status: string;
  score: number | null;
  citationsOwned: number | null;
  totalResponses: number | null;
  platforms: string[];
  failures: string[];
  notRecognized: boolean;
  hotLead: boolean;
  internalError: string | null;
  createdAt: string;
}

export default async function AdminAuditsPage() {
  await connectDB();
  const docs = await Audit.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .select({
      publicId: 1,
      companyName: 1,
      companyUrl: 1,
      industry: 1,
      email: 1,
      status: 1,
      score: 1,
      citationsOwned: 1,
      totalResponses: 1,
      platforms: 1,
      platformStats: 1,
      notRecognized: 1,
      ctaClickedAt: 1,
      internalError: 1,
      createdAt: 1,
    })
    .lean();

  const audits: AuditRow[] = docs.map((d) => {
    const stats = (d.platformStats ?? {}) as Record<string, PlatformStatRow>;
    const failures = Object.values(stats)
      .filter((s) => (s.failed ?? 0) > 0)
      .map((s) => `${s.label}: ${s.failed}/${s.attempted} failed${s.sampleError ? ` — ${s.sampleError}` : ''}`);
    return {
      key: publicKeyOf(d),
      companyName: d.companyName,
      companyUrl: d.companyUrl ?? null,
      industry: d.industry,
      email: d.email,
      status: d.status ?? 'running',
      score: d.score ?? null,
      citationsOwned: d.citationsOwned ?? null,
      totalResponses: d.totalResponses ?? null,
      platforms: d.platforms ?? [],
      failures,
      notRecognized: d.notRecognized ?? false,
      hotLead: !!d.ctaClickedAt,
      internalError: d.internalError ?? null,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
    };
  });

  const totals = {
    all: audits.length,
    complete: audits.filter((a) => a.status === 'complete').length,
    running: audits.filter((a) => a.status === 'running').length,
    failed: audits.filter((a) => a.status === 'failed').length,
    hot: audits.filter((a) => a.hotLead).length,
  };

  const providers = providerStatus();
  const providerIssues = providers.filter((p) => !p.configured || p.issue);

  return (
    <main className="min-h-screen px-6 md:px-12 py-10" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="eyebrow" style={{ color: '#03444A', fontWeight: 700 }}>
              Admin · Audits
            </div>
            <h1 className="serif mt-2" style={{ fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.02em' }}>
              All audits
            </h1>
            <p className="mt-2 text-[14px] opacity-70">Latest {audits.length} audits, newest first. Times in UTC.</p>
          </div>
          <div className="flex gap-3 text-[12px] flex-wrap">
            <Stat label="Total" value={totals.all} />
            <Stat label="Complete" value={totals.complete} />
            <Stat label="Running" value={totals.running} />
            <Stat label="Failed" value={totals.failed} />
            <Stat label="Hot leads" value={totals.hot} />
          </div>
        </div>

        <div
          className="rounded-[18px] p-5 mb-6"
          style={{ background: '#FFFFFF', border: '1px solid var(--paper-line)' }}
        >
          <div className="mono uppercase tracking-wider text-[10px] opacity-60 mb-3">AI providers (this server)</div>
          <div className="flex flex-wrap gap-3">
            {providers.map((p) => (
              <div key={p.platform} className="text-[13px] flex items-center gap-2">
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: !p.configured ? 'rgba(14,23,20,0.25)' : p.available ? '#1D837E' : '#D97757',
                  }}
                />
                <span className="font-medium">{p.label}</span>
                <span className="opacity-60 mono">{p.model}</span>
                <span className="opacity-70">
                  {!p.configured ? '· no API key' : p.issue ? `· paused (${p.issue.kind})` : '· ok'}
                </span>
              </div>
            ))}
          </div>
          {providerIssues
            .filter((p) => p.issue)
            .map((p) => (
              <p key={p.platform} className="mt-3 text-[12px]" style={{ color: '#B5502F' }}>
                {p.label} is paused until {p.issue!.retryAt.replace('T', ' ').slice(0, 16)} UTC after: {p.issue!.reason}
              </p>
            ))}
        </div>

        <div className="rounded-[18px] overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid var(--paper-line)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead
                className="text-[11px] mono uppercase tracking-wider"
                style={{ background: 'rgba(51,211,201,0.08)', color: '#03444A' }}
              >
                <tr>
                  <Th>Date</Th>
                  <Th>Company</Th>
                  <Th>Industry</Th>
                  <Th>Email</Th>
                  <Th align="right">Score</Th>
                  <Th align="right">Cited</Th>
                  <Th>Models</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {audits.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center opacity-60">
                      No audits yet.
                    </td>
                  </tr>
                )}
                {audits.map((a) => (
                  <tr key={a.key} className="border-t" style={{ borderColor: 'rgba(14,23,20,0.06)' }}>
                    <Td>
                      <span className="mono opacity-70 whitespace-nowrap">
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZone: 'UTC',
                            })
                          : '—'}
                      </span>
                    </Td>
                    <Td>
                      <div className="font-medium">{a.companyName}</div>
                      {a.companyUrl && (
                        <a
                          href={a.companyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] opacity-60 hover:opacity-100 hover:underline"
                        >
                          {prettyUrl(a.companyUrl)}
                        </a>
                      )}
                    </Td>
                    <Td>
                      <span className="opacity-80">{a.industry}</span>
                    </Td>
                    <Td>
                      <a href={`mailto:${a.email}`} className="hover:underline opacity-80">
                        {a.email}
                      </a>
                    </Td>
                    <Td align="right">
                      {a.notRecognized || a.score === null || a.status !== 'complete' ? (
                        <span className="opacity-50">—</span>
                      ) : (
                        <span className="serif num" style={{ fontSize: 18 }}>
                          {a.score}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      {a.totalResponses ? (
                        <span className="mono opacity-70">
                          {a.citationsOwned ?? 0}/{a.totalResponses}
                        </span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="opacity-80 whitespace-nowrap">{a.platforms.length ? a.platforms.join(' · ') : '—'}</span>
                      {a.failures.length > 0 && (
                        <div className="text-[11px] mt-0.5" style={{ color: '#B5502F' }} title={a.failures.join('\n')}>
                          {a.failures.length === 1 ? a.failures[0].split(' — ')[0] : `${a.failures.length} providers had failures`}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusPill status={a.status} notRecognized={a.notRecognized} />
                        {a.hotLead && (
                          <span
                            className="pill"
                            style={{ background: 'rgba(240,197,85,0.35)', borderColor: 'rgba(240,197,85,0.7)' }}
                            title="Clicked “Book your strategy session”"
                          >
                            Hot lead
                          </span>
                        )}
                      </div>
                      {a.status === 'failed' && a.internalError && (
                        <div className="text-[11px] mt-1 opacity-60 max-w-[260px] truncate" title={a.internalError}>
                          {a.internalError}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Link
                        href={`/audit/${a.key}`}
                        className="text-[12px] font-medium hover:underline whitespace-nowrap"
                        style={{ color: '#1D837E' }}
                      >
                        View →
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] px-4 py-3" style={{ background: '#FFFFFF', border: '1px solid var(--paper-line)' }}>
      <div className="mono uppercase tracking-wider text-[10px] opacity-60">{label}</div>
      <div className="serif num mt-1" style={{ fontSize: 22, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function Td({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return <td className={`px-4 py-3 align-top ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>;
}

function StatusPill({ status, notRecognized }: { status: string; notRecognized?: boolean }) {
  if (notRecognized) {
    return (
      <span className="pill" style={{ background: 'rgba(240,197,85,0.25)', borderColor: 'rgba(240,197,85,0.5)' }}>
        Not recognized
      </span>
    );
  }
  const map: Record<string, { bg: string; border: string; label: string }> = {
    complete: { bg: 'rgba(51,211,201,0.25)', border: 'rgba(51,211,201,0.5)', label: 'Complete' },
    running: { bg: 'rgba(14,23,20,0.06)', border: 'rgba(14,23,20,0.15)', label: 'Running' },
    failed: { bg: 'rgba(217,119,87,0.18)', border: 'rgba(217,119,87,0.45)', label: 'Failed' },
  };
  const m = map[status] ?? { bg: 'transparent', border: 'var(--paper-line)', label: status };
  return (
    <span className="pill" style={{ background: m.bg, borderColor: m.border }}>
      {m.label}
    </span>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}
