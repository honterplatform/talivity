'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { TopNav, FooterBar } from '@/components/chrome';
import { IconAlert, IconArrowRight } from '@/components/icons';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="screen-enter min-h-screen flex flex-col" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <TopNav tone="paper" />
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-[560px] text-center">
          <div className="eyebrow inline-flex items-center gap-2" style={{ color: 'var(--accent)' }}>
            <IconAlert size={14} /> Something went wrong
          </div>
          <h1 className="serif mt-4" style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}>
            We hit a <em className="italic" style={{ color: 'var(--accent)' }}>snag</em>.
          </h1>
          <p className="mt-5 text-[17px] opacity-75 leading-relaxed">
            This is on us, not you. Please try again in a moment.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button onClick={reset} className="btn-accent inline-flex">
              Try again
              <IconArrowRight size={16} />
            </button>
            <Link href="/" className="btn-ghost inline-flex">
              Back to start
            </Link>
          </div>
          {error.digest && <p className="mt-6 text-[11px] mono opacity-40">Ref · {error.digest}</p>}
        </div>
      </div>
      <FooterBar tone="paper" />
    </div>
  );
}
