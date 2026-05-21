import Link from 'next/link';
import { connectDB } from '@/lib/mongodb';
import { Audit } from '@/models/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AuditRow {
  _id: string;
  companyName: string;
  companyUrl?: string | null;
  industry: string;
  email: string;
  status: string;
  score: number | null;
  citationsOwned?: number | null;
  citationsTotal?: number | null;
  totalResponses?: number | null;
  notRecognized?: boolean;
  createdAt: string;
}

export default async function AdminAuditsPage() {
  await connectDB();
  const docs = await Audit.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const audits: AuditRow[] = docs.map((d) => ({
    _id: String(d._id),
    companyName: d.companyName,
    companyUrl: d.companyUrl ?? null,
    industry: d.industry,
    email: d.email,
    status: d.status,
    score: d.score ?? null,
    citationsOwned: d.citationsOwned ?? null,
    citationsTotal: d.citationsTotal ?? null,
    totalResponses: (d as { totalResponses?: number }).totalResponses ?? null,
    notRecognized: d.notRecognized ?? false,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
  }));

  const totals = {
    all: audits.length,
    complete: audits.filter((a) => a.status === 'complete').length,
    running: audits.filter((a) => a.status === 'running').length,
    failed: audits.filter((a) => a.status === 'failed').length,
  };

  return (
    <main
      className="min-h-screen px-6 md:px-12 py-10"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="eyebrow" style={{ color: '#03444A', fontWeight: 700 }}>
              Admin · Audits
            </div>
            <h1
              className="serif mt-2"
              style={{ fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.02em' }}
            >
              All audits
            </h1>
            <p className="mt-2 text-[14px] opacity-70">
              Latest {audits.length} audits, newest first.
            </p>
          </div>
          <div className="flex gap-3 text-[12px]">
            <Stat label="Total" value={totals.all} />
            <Stat label="Complete" value={totals.complete} />
            <Stat label="Running" value={totals.running} />
            <Stat label="Failed" value={totals.failed} />
          </div>
        </div>

        <div
          className="rounded-[18px] overflow-hidden"
          style={{ background: '#FFFFFF', border: '1px solid var(--paper-line)' }}
        >
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
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {audits.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center opacity-60"
                    >
                      No audits yet.
                    </td>
                  </tr>
                )}
                {audits.map((a) => (
                  <tr
                    key={a._id}
                    className="border-t"
                    style={{ borderColor: 'rgba(14,23,20,0.06)' }}
                  >
                    <Td>
                      <span className="mono opacity-70">
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
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
                      <a
                        href={`mailto:${a.email}`}
                        className="hover:underline opacity-80"
                      >
                        {a.email}
                      </a>
                    </Td>
                    <Td align="right">
                      {a.notRecognized ? (
                        <span className="opacity-50">—</span>
                      ) : a.score !== null ? (
                        <span className="serif num" style={{ fontSize: 18 }}>
                          {a.score}
                        </span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      {a.citationsTotal !== null && a.totalResponses ? (
                        <span className="mono opacity-70">
                          {a.citationsOwned ?? 0}/{a.totalResponses}
                        </span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </Td>
                    <Td>
                      <StatusPill status={a.status} notRecognized={a.notRecognized} />
                    </Td>
                    <Td>
                      <Link
                        href={`/audit/${a._id}`}
                        className="text-[12px] font-medium hover:underline"
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
    <div
      className="rounded-[12px] px-4 py-3"
      style={{ background: '#FFFFFF', border: '1px solid var(--paper-line)' }}
    >
      <div className="mono uppercase tracking-wider text-[10px] opacity-60">{label}</div>
      <div className="serif num mt-1" style={{ fontSize: 22, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className={`px-4 py-3 align-top ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </td>
  );
}

function StatusPill({ status, notRecognized }: { status: string; notRecognized?: boolean }) {
  if (notRecognized) {
    return (
      <span
        className="pill"
        style={{ background: 'rgba(240,197,85,0.25)', borderColor: 'rgba(240,197,85,0.5)' }}
      >
        Not recognized
      </span>
    );
  }
  const map: Record<string, { bg: string; border: string; label: string }> = {
    complete: {
      bg: 'rgba(51,211,201,0.25)',
      border: 'rgba(51,211,201,0.5)',
      label: 'Complete',
    },
    running: {
      bg: 'rgba(14,23,20,0.06)',
      border: 'rgba(14,23,20,0.15)',
      label: 'Running',
    },
    failed: {
      bg: 'rgba(217,119,87,0.18)',
      border: 'rgba(217,119,87,0.45)',
      label: 'Failed',
    },
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
