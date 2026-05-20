'use client';

import { useRouter } from 'next/navigation';
import { TopNav, FooterBar, DecorArcs } from '@/components/chrome';
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconClock,
} from '@/components/icons';

export default function ConfirmationScreen({
  company,
  email,
}: {
  company?: string;
  email?: string;
}) {
  const router = useRouter();

  return (
    <div
      className="screen-enter min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <DecorArcs />
      <TopNav tone="paper" />

      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-[720px] relative">
          <div className="relative mx-auto" style={{ width: 120, height: 120 }}>
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: 'var(--accent)',
                borderRadius: 9999,
                color: 'var(--paper-warm)',
              }}
            >
              <IconCheck size={48} strokeWidth={1.8} />
            </div>
            <div
              className="absolute"
              style={{
                inset: -18,
                border: '1px solid var(--paper-line)',
                borderRadius: 9999,
              }}
            />
            <div
              className="absolute"
              style={{
                inset: -42,
                border: '1px solid var(--paper-line)',
                borderRadius: 9999,
                opacity: 0.5,
              }}
            />
          </div>

          <div className="text-center mt-10">
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>
              Request received
            </div>
            <h1
              className="serif mt-4"
              style={{
                fontSize: 'clamp(40px, 5.4vw, 72px)',
                lineHeight: 1.0,
                letterSpacing: '-0.02em',
              }}
            >
              Your report is{' '}
              <em className="italic" style={{ color: 'var(--accent)' }}>
                on its way
              </em>
              .
            </h1>
            <p className="mt-5 text-[17px] opacity-75 max-w-[520px] mx-auto leading-relaxed">
              Check{' '}
              {email ? (
                <span className="font-medium" style={{ color: 'var(--ink)' }}>
                  {email}
                </span>
              ) : (
                'your inbox'
              )}{' '}
              in the next 2 minutes. The full PDF includes every cited source and the raw model
              responses we collected{company ? ` for ${company}` : ''}.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className="rounded-[18px] p-6"
              style={{ background: 'var(--paper-warm)', border: '1px solid var(--paper-line)' }}
            >
              <div className="eyebrow opacity-70">While you wait</div>
              <div className="serif mt-3 text-[24px] leading-tight">Want to talk now?</div>
              <p className="text-[13px] opacity-70 mt-2 leading-relaxed">
                Skip the wait — grab a 30-minute slot with our AI Search team this week.
              </p>
              <button className="btn-ink mt-5 w-full justify-center">
                Book a call directly
                <IconArrowRight size={16} />
              </button>
            </div>

            <div className="rounded-[18px] p-6" style={{ background: 'var(--peach)' }}>
              <div className="eyebrow opacity-70">Read next</div>
              <div className="serif mt-3 text-[24px] leading-tight">
                The 2026 AI &amp; Talent report.
              </div>
              <p className="text-[13px] opacity-75 mt-2 leading-relaxed">
                The 60-page deep dive on how frontier models source candidate-facing answers.
              </p>
              <a
                href="#"
                className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium hover:opacity-80"
              >
                Download the report <IconArrowUpRight size={14} />
              </a>
            </div>
          </div>

          <div className="mt-12 flex items-center justify-center gap-2 text-[12px] opacity-60">
            <IconClock size={12} />
            <span className="mono">Average delivery time · 1m 48s</span>
            <span>·</span>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="underline hover:opacity-80"
            >
              Run another audit
            </button>
          </div>
        </div>
      </div>

      <FooterBar tone="paper" />
    </div>
  );
}
