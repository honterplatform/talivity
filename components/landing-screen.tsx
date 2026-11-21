'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wordmark, FooterBar, DecorArcs } from '@/components/chrome';
import { IconAlert, IconArrowRight, IconCheck } from '@/components/icons';
import LoadingScreen from '@/components/loading-screen';

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export default function LandingScreen({
  platforms,
  queriesPerPlatform,
}: {
  platforms: string[];
  queriesPerPlatform: number;
}) {
  const router = useRouter();
  const [companyUrl, setCompanyUrl] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlValid = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#:].*)?$/i.test(companyUrl.trim());
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const valid = urlValid && emailValid;
  const modelCount = platforms.length;
  const queryCount = queriesPerPlatform * Math.max(modelCount, 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyUrl: companyUrl.trim(),
          email: email.trim(),
        }),
      });
      // A proxy timeout or crash can return HTML; don't surface "Unexpected token <".
      const data = (await res.json().catch(() => null)) as { auditId?: string; message?: string } | null;

      if (!res.ok || !data?.auditId) {
        setError(data?.message ?? 'Something went wrong starting your audit. Please try again.');
        setSubmitting(false);
        return;
      }
      router.push(`/audit/${encodeURIComponent(data.auditId)}`);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (submitting) {
    return <LoadingScreen company="your company" platforms={platforms} />;
  }

  return (
    <div
      className="screen-enter min-h-screen relative overflow-hidden flex flex-col"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <DecorArcs />
      <div className="flex-1 flex items-center px-6 relative z-[1]">
        <div className="max-w-[520px] mx-auto w-full">
          <Link href="/" className="inline-flex items-center">
            <Wordmark />
          </Link>
        </div>
      </div>

      <div className="px-6 relative z-[1]">
        <div className="w-full max-w-[520px] mx-auto">
          <form noValidate onSubmit={submit} className="relative" style={{ color: 'var(--ink)' }}>
            <div className="eyebrow" style={{ color: '#1D837E', fontWeight: 700 }}>
              Start your audit
            </div>
            <div
              className="serif mt-3"
              style={{
                fontSize: 'clamp(44px, 6vw, 64px)',
                lineHeight: 1.0,
                letterSpacing: '-0.025em',
              }}
            >
              Two minutes. <em className="italic">Brutal clarity.</em>
            </div>

            <div className="mt-7 space-y-3">
              <label className="block">
                <span className="text-[12px] mono uppercase tracking-wider opacity-60">
                  Company website
                </span>
                <input
                  className="input mt-1"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="yourcompany.com"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                />
                {touched && !urlValid && (
                  <span
                    className="text-[12px] mt-1 inline-flex items-center gap-1.5"
                    style={{ color: '#1D837E' }}
                  >
                    <IconAlert size={12} /> Enter a valid URL (e.g. acme.com)
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-[12px] mono uppercase tracking-wider opacity-60">
                  Work email
                </span>
                <input
                  className="input mt-1"
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {touched && !emailValid && (
                  <span
                    className="text-[12px] mt-1 inline-flex items-center gap-1.5"
                    style={{ color: 'var(--accent)' }}
                  >
                    <IconAlert size={12} /> Use the email you'd want the report sent to.
                  </span>
                )}
              </label>
            </div>

            {error && (
              <div
                className="mt-4 text-[13px] inline-flex items-center gap-2 rounded-md px-3 py-2"
                style={{
                  color: 'var(--accent)',
                  background: 'rgba(31,94,84,0.06)',
                  border: '1px solid rgba(31,94,84,0.2)',
                }}
              >
                <IconAlert size={14} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-accent mt-6 w-full justify-center whitespace-nowrap"
            >
              Run my audit
              <IconArrowRight size={18} />
            </button>

            <div
              className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px]"
              style={{ color: '#02424C' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <IconCheck size={12} /> ~60 seconds
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconCheck size={12} /> {queryCount} candidate queries
              </span>
              {modelCount > 0 && (
                <span className="inline-flex items-center gap-1.5" title={joinNames(platforms)}>
                  <IconCheck size={12} /> {modelCount} frontier model{modelCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="flex-1" />

      <FooterBar tone="paper" />
    </div>
  );
}
