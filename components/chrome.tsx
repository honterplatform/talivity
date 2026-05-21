'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

type Tone = 'paper' | 'ink';

export function Wordmark({ size = 'md' }: { tone?: 'ink' | 'paper'; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 64 : size === 'sm' ? 36 : 50;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/talivity.svg"
      alt="Talivity"
      style={{ height: h, width: 'auto', display: 'block' }}
    />
  );
}

export function TopNav({ tone = 'paper' }: { tone?: Tone }) {
  const dark = tone === 'ink';
  return (
    <div className="flex items-center justify-center px-8 md:px-14 py-6 relative z-10">
      <Link href="/" className="flex items-center gap-2">
        <Wordmark tone={dark ? 'paper' : 'ink'} />
      </Link>
    </div>
  );
}

export function FooterBar({ tone = 'paper' }: { tone?: Tone }) {
  const dark = tone === 'ink';
  return (
    <footer className="px-8 md:px-14 py-10 mt-16">
      <div
        className={`flex flex-col items-center gap-3 md:flex-row md:justify-center md:gap-10 text-[12px] ${
          dark ? 'text-white/60' : 'text-black/60'
        }`}
      >
        <span className="mono">© Copyright 2026 Talivity LLC</span>
        <div className="flex gap-6">
          <a href="#" className="hover:underline">
            Privacy
          </a>
          <a href="#" className="hover:underline">
            Terms
          </a>
          <a href="#" className="hover:underline">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

export function DecorArcs({
  position = 'fixed',
  corners = 'both',
}: {
  position?: 'fixed' | 'absolute';
  corners?: 'both' | 'top-right' | 'bottom-left';
} = {}) {
  const pos = position === 'absolute' ? 'absolute' : 'fixed';
  const Couter = 2 * Math.PI * 44;
  const outerVisible = Couter * 0.65;
  const outerGap = Couter - outerVisible;

  const Cinner = 2 * Math.PI * 36;
  const innerVisible = Cinner * 0.4;
  const innerGap = Cinner - innerVisible;

  const showTopRight = corners === 'both' || corners === 'top-right';
  const showBottomLeft = corners === 'both' || corners === 'bottom-left';

  return (
    <>
      {showTopRight && (<>
      {/* Top-right outer: teal, clockwise */}
      <div
        aria-hidden="true"
        className={`pointer-events-none ${pos} -top-[60px] -right-[60px] md:-top-[115px] md:-right-[115px] w-[280px] h-[280px] md:w-[560px] md:h-[560px] z-0`}
        style={{
          animation: 'arc-drift 60s linear infinite',
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#33D3C9"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${outerVisible} ${outerGap}`}
          />
        </svg>
      </div>

      {/* Top-right inner: gold, counter-clockwise — starts mirrored */}
      <div
        aria-hidden="true"
        className={`pointer-events-none ${pos} -top-[60px] -right-[60px] md:-top-[115px] md:-right-[115px] w-[280px] h-[280px] md:w-[560px] md:h-[560px] z-0`}
        style={{
          animation: 'arc-drift-reverse 70s linear infinite',
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke="#F0C555"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${innerVisible} ${innerGap}`}
            transform="rotate(180 50 50)"
          />
        </svg>
      </div>

      </>)}
      {showBottomLeft && (<>
      {/* Bottom-left outer: gold, counter-clockwise */}
      <div
        aria-hidden="true"
        className={`pointer-events-none ${pos} -bottom-[55px] -left-[55px] md:-bottom-[115px] md:-left-[115px] w-[250px] h-[250px] md:w-[500px] md:h-[500px] z-0`}
        style={{
          animation: 'arc-drift-reverse 90s linear infinite',
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#F0C555"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${outerVisible} ${outerGap}`}
          />
        </svg>
      </div>

      {/* Bottom-left inner: teal, clockwise — starts mirrored */}
      <div
        aria-hidden="true"
        className={`pointer-events-none ${pos} -bottom-[55px] -left-[55px] md:-bottom-[115px] md:-left-[115px] w-[250px] h-[250px] md:w-[500px] md:h-[500px] z-0`}
        style={{
          animation: 'arc-drift 80s linear infinite',
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke="#33D3C9"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${innerVisible} ${innerGap}`}
            transform="rotate(180 50 50)"
          />
        </svg>
      </div>
      </>)}
    </>
  );
}

export function Orb({
  size = 360,
  className = '',
  style,
  children,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const stroke = Math.max(6, Math.round(size * 0.04));
  return (
    <div
      className={'decor relative ' + className}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          borderRadius: 9999,
          border: `${stroke}px solid var(--accent)`,
          borderTopColor: 'transparent',
          borderRightColor: 'transparent',
          transform: 'rotate(45deg)',
        }}
      />
      <div
        className="absolute"
        style={{
          width: stroke * 1.4,
          height: stroke * 1.4,
          background: 'var(--accent)',
          borderRadius: 9999,
          top: size * 0.08,
          right: size * 0.08,
        }}
      />
      {children}
    </div>
  );
}
