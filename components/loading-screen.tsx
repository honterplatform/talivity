'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/chrome';
import { IconCheck } from '@/components/icons';

interface Step {
  dur: number;
  label: string;
  sub: string;
  model: string;
}

export default function LoadingScreen({
  company,
  auditId,
}: {
  company: string;
  auditId?: string;
}) {
  const router = useRouter();

  const STEPS: Step[] = useMemo(
    () => [
      {
        dur: 6000,
        label: `Asking ChatGPT about ${company}`,
        sub: 'Pulling top 30 candidate queries...',
        model: 'ChatGPT',
      },
      {
        dur: 6000,
        label: `Now querying Claude`,
        sub: `Cross-checking what Claude says about ${company}...`,
        model: 'Claude',
      },
      {
        dur: 6000,
        label: `Now checking Gemini`,
        sub: 'Last frontier model. Comparing answers.',
        model: 'Gemini',
      },
      {
        dur: 6000,
        label: `Analyzing citations and sentiment`,
        sub: 'Bucketing sources. Scoring share-of-voice.',
        model: 'Engine',
      },
      {
        dur: 6000,
        label: `Building your report`,
        sub: 'Almost there.',
        model: 'Engine',
      },
    ],
    [company]
  );

  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number>(0);

  // Step + progress animation — caps at 95% so the bar doesn't sit at 100% while we keep waiting.
  useEffect(() => {
    startedRef.current = performance.now();
    const total = STEPS.reduce((s, x) => s + x.dur, 0);

    const tick = setInterval(() => {
      const now = performance.now();
      const el = Math.min(now - startedRef.current, total * 0.95);
      setElapsed(el);

      let acc = 0;
      let idx = 0;
      for (let i = 0; i < STEPS.length; i++) {
        acc += STEPS[i].dur;
        if (el < acc) {
          idx = i;
          break;
        }
        idx = STEPS.length - 1;
      }
      setStepIdx(idx);
    }, 80);

    return () => clearInterval(tick);
  }, [STEPS]);

  // If an auditId is provided, poll for completion and refresh.
  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/audit/${auditId}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data?.audit?.status && data.audit.status !== 'running') {
              router.refresh();
              return;
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [auditId, router]);

  const totalDur = STEPS.reduce((s, x) => s + x.dur, 0);
  const pct = Math.min(95, (elapsed / totalDur) * 100);
  const active = STEPS[stepIdx];

  return (
    <div
      className="screen-enter min-h-screen relative overflow-hidden flex flex-col"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <TopNav tone="paper" />

      <div className="flex-1 flex items-center justify-center px-8">
        <div className="relative w-full max-w-[860px] text-center">
          <div className="relative mx-auto" style={{ width: 240, height: 240 }}>
            <div
              className="absolute inset-0 arc-spin"
              style={{
                borderRadius: 9999,
                border: '10px solid var(--accent)',
                borderTopColor: 'transparent',
                borderLeftColor: 'transparent',
              }}
            />
            <div
              className="absolute"
              style={{
                width: 14,
                height: 14,
                borderRadius: 99,
                background: 'var(--accent)',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="rounded-full border"
                style={{ width: 320, height: 320, borderColor: 'rgba(14,23,20,0.10)' }}
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="rounded-full border"
                style={{ width: 420, height: 420, borderColor: 'rgba(14,23,20,0.06)' }}
              />
            </div>
          </div>

          <div className="mt-12 eyebrow" style={{ color: 'var(--accent)' }}>
            Step {stepIdx + 1} of {STEPS.length} · {active.model}
          </div>

          <h2
            className="serif mt-3"
            style={{
              fontSize: 'clamp(34px, 4.6vw, 56px)',
              lineHeight: 1.05,
              letterSpacing: '-0.015em',
            }}
          >
            <span className="blink">{active.label}</span>
          </h2>

          <p className="mt-4 text-[16px]" style={{ color: 'rgba(14,23,20,0.65)' }}>
            {active.sub}
          </p>

          <div className="mt-12 max-w-[640px] mx-auto">
            <div className="progress-track" style={{ background: 'rgba(14,23,20,0.08)' }}>
              <div className="progress-fill" style={{ width: pct + '%' }} />
            </div>
            <div
              className="flex justify-between mt-3 text-[11px] mono uppercase tracking-wider"
              style={{ color: 'rgba(14,23,20,0.55)' }}
            >
              <span>{Math.round(pct)}%</span>
              <span>
                ~{Math.max(0, Math.ceil((totalDur - elapsed) / 1000))}s remaining
              </span>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <span
                key={i}
                className="pill"
                style={{
                  opacity: i <= stepIdx ? 1 : 0.45,
                  borderColor: i === stepIdx ? 'var(--accent)' : 'var(--paper-line)',
                }}
              >
                {i < stepIdx && <IconCheck size={11} />}
                {i === stepIdx && (
                  <span
                    style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--accent)' }}
                  />
                )}
                {s.model}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className="px-8 md:px-14 pb-10 text-center text-[12px]"
        style={{ color: 'rgba(14,23,20,0.5)' }}
      >
        <span className="mono">
          Audit ID · {auditId ? auditId.slice(-10).toUpperCase() : 'PENDING'}
        </span>
      </div>
    </div>
  );
}
