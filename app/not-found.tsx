import Link from 'next/link';
import { TopNav, FooterBar } from '@/components/chrome';
import { IconArrowRight } from '@/components/icons';

export default function NotFound() {
  return (
    <div className="screen-enter min-h-screen flex flex-col" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <TopNav tone="paper" />
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-[560px] text-center">
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>
            Not found
          </div>
          <h1 className="serif mt-4" style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', lineHeight: 1.0, letterSpacing: '-0.02em' }}>
            We couldn't find that <em className="italic" style={{ color: 'var(--accent)' }}>report</em>.
          </h1>
          <p className="mt-5 text-[17px] opacity-75 leading-relaxed">
            The link may be incomplete. Run a fresh audit — it takes about a minute.
          </p>
          <Link href="/" className="btn-accent mt-8 inline-flex">
            Run an audit
            <IconArrowRight size={16} />
          </Link>
        </div>
      </div>
      <FooterBar tone="paper" />
    </div>
  );
}
