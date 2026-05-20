'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INDUSTRIES } from '@/lib/query-templates';
import { TopNav, FooterBar } from '@/components/chrome';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevron,
} from '@/components/icons';
import LoadingScreen from '@/components/loading-screen';

export default function LandingScreen() {
  const router = useRouter();
  const [company, setCompany] = useState('Northwind Health Systems');
  const [industry, setIndustry] = useState<string>('Healthcare');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = company.trim().length >= 2 && industry && /.+@.+\..+/.test(email);

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
          companyName: company.trim(),
          industry,
          email: email.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Something went wrong.');
        setSubmitting(false);
        return;
      }
      router.push(`/audit/${data.auditId}`);
    } catch (err) {
      setError((err as Error).message ?? 'Network error');
      setSubmitting(false);
    }
  }

  if (submitting) {
    return <LoadingScreen company={company.trim()} />;
  }

  return (
    <div
      className="screen-enter min-h-screen relative overflow-hidden flex flex-col"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <TopNav tone="paper" />

      <div className="flex-1 flex items-center justify-center px-6 py-12 md:py-16 relative z-[1]">
        <div className="w-full max-w-[520px]">
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
                  Company
                </span>
                <input
                  className="input mt-1"
                  placeholder="Northwind Health Systems"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-[12px] mono uppercase tracking-wider opacity-60">
                  Industry
                </span>
                <div className="relative mt-1">
                  <select
                    className="input appearance-none pr-10"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  >
                    {INDUSTRIES.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-60">
                    <IconChevron size={16} />
                  </span>
                </div>
              </label>

              <label className="block">
                <span className="text-[12px] mono uppercase tracking-wider opacity-60">
                  Work email
                </span>
                <input
                  className="input mt-1"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {touched && !/.+@.+\..+/.test(email) && (
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
                <IconCheck size={12} /> 30 candidate queries
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconCheck size={12} /> 3 frontier models
              </span>
            </div>
          </form>
        </div>
      </div>

      <FooterBar tone="paper" />
    </div>
  );
}
