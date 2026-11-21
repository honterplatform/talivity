'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav, DecorArcs } from '@/components/chrome';
import { IconCheck } from '@/components/icons';

export type ProgressStage = 'queued' | 'profiling' | 'querying' | 'analyzing' | 'complete' | 'failed';

export interface ProgressVM {
  stage: ProgressStage;
  total: number;
  done: number;
  byPlatform: Record<string, { total: number; done: number; failed: number }>;
}

const PLATFORM_LABELS: Record<string, string> = { openai: 'ChatGPT', anthropic: 'Claude', gemini: 'Gemini' };
const PLATFORM_ORDER = ['openai', 'anthropic', 'gemini'];

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'the AI assistants';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function percentFor(p: ProgressVM | null): number {
  if (!p) return 2;
  switch (p.stage) {
    case 'queued':
      return 3;
    case 'profiling':
      return 8;
    case 'querying':
      return 12 + (p.total ? (p.done / p.total) * 76 : 0);
    case 'analyzing':
      return 92;
    default:
      return 100;
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function LoadingScreen({
  company,
  auditId,
  initialProgress,
  platforms,
}: {
  company: string;
  auditId?: string;
  initialProgress?: ProgressVM | null;
  /** Labels of the platforms that will be queried, e.g. ["ChatGPT", "Claude"]. */
  platforms: string[];
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressVM | null>(initialProgress ?? null);
  const [name, setName] = useState(company);
  const [queuePos, setQueuePos] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startedRef.current), 500);
    return () => clearInterval(t);
  }, []);

  // Poll real progress; refresh into the report (or error page) when it's done.
  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      let next = 2000;
      try {
        const res = await fetch(`/api/audit/${encodeURIComponent(auditId)}`, { cache: 'no-store' });
        if (res.status === 404) {
          router.refresh();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const a = data?.audit;
          if (a?.companyName) setName(a.companyName);
          if (a?.progress) setProgress(a.progress as ProgressVM);
          setQueuePos(typeof a?.queuePosition === 'number' ? a.queuePosition : 0);
          if (a?.status && a.status !== 'running') {
            router.refresh();
            next = 4000; // keep a slow poll alive in case the refresh is delayed
          }
        }
      } catch {
        next = 4000;
      }
      if (!cancelled) timer = setTimeout(poll, next);
    };

    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auditId, router]);

  const stage: ProgressStage = progress?.stage ?? 'queued';
  const byPlatform = progress?.byPlatform ?? {};
  const platformKeys = PLATFORM_ORDER.filter((k) => byPlatform[k]);
  const platformNames = platformKeys.length ? platformKeys.map((k) => PLATFORM_LABELS[k]) : platforms;

  const steps = [
    {
      key: 'profiling',
      title: 'Profile',
      label: `Identifying ${name}`,
      sub: 'Matching the website to the company, its industry and its talent competitors.',
    },
    {
      key: 'querying',
      title: 'Candidate queries',
      label: `Asking ${joinNames(platformNames)} about ${name}`,
      sub:
        stage === 'querying' && progress?.total
          ? `${progress.done} of ${progress.total} candidate answers collected…`
          : 'Running the questions candidates actually ask.',
    },
    {
      key: 'analyzing',
      title: 'Analysis',
      label: 'Analyzing citations and sentiment',
      sub: 'Bucketing sources. Scoring share-of-voice.',
    },
  ];

  const stepIdx =
    stage === 'queued' || stage === 'profiling' ? 0 : stage === 'querying' ? 1 : 2;
  const active =
    stage === 'queued'
      ? {
          label: 'Getting your audit ready',
          sub: queuePos > 1 ? `You're #${queuePos} in line — this usually takes a few seconds.` : 'Starting in a moment…',
          title: 'Queued',
        }
      : stage === 'complete' || stage === 'failed'
        ? { label: 'Building your report', sub: 'Almost there.', title: 'Report' }
        : steps[stepIdx];
  const pct = Math.round(percentFor(progress));

  return (
    <div
      className="screen-enter min-h-screen relative overflow-hidden flex flex-col"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <DecorArcs />
      <TopNav tone="paper" />

      <div className="flex-1 flex items-center justify-center px-6 sm:px-8">
        <div className="relative w-full max-w-[860px] text-center">
          <div className="relative mx-auto" style={{ width: 200, height: 200 }}>
            {/* Outer teal arc, clockwise */}
            <div className="absolute inset-0" style={{ animation: 'arc-drift 5s linear infinite' }} aria-hidden="true">
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="#33D3C9"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44 * 0.65} ${2 * Math.PI * 44 * 0.35}`}
                />
              </svg>
            </div>
            {/* Inner gold arc, counter-clockwise */}
            <div
              className="absolute inset-0"
              style={{ animation: 'arc-drift-reverse 7s linear infinite' }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 100 100" width="100%" height="100%">
                <circle
                  cx="50"
                  cy="50"
                  r="32"
                  fill="none"
                  stroke="#F0C555"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 32 * 0.4} ${2 * Math.PI * 32 * 0.6}`}
                  transform="rotate(180 50 50)"
                />
              </svg>
            </div>
          </div>

          <div role="status" aria-live="polite">
            <div className="mt-12 eyebrow" style={{ color: 'var(--accent)' }}>
              Step {Math.min(stepIdx + 1, steps.length)} of {steps.length} · {active.title}
            </div>

            <h2
              className="serif mt-3"
              style={{
                fontSize: 'clamp(30px, 4.6vw, 56px)',
                lineHeight: 1.05,
                letterSpacing: '-0.015em',
              }}
            >
              <span className="blink">{active.label}</span>
            </h2>

            <p className="mt-4 text-[16px]" style={{ color: 'rgba(14,23,20,0.65)' }}>
              {active.sub}
            </p>
          </div>

          <div className="mt-12 max-w-[640px] mx-auto">
            <div
              className="progress-track"
              style={{ background: 'rgba(14,23,20,0.08)' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="progress-fill" style={{ width: pct + '%' }} />
            </div>
            <div
              className="flex justify-between mt-3 text-[11px] mono uppercase tracking-wider"
              style={{ color: 'rgba(14,23,20,0.55)' }}
            >
              <span>{pct}%</span>
              <span>{formatElapsed(elapsed)} elapsed</span>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <StepPill label="Profile" state={stepIdx > 0 ? 'done' : stage === 'profiling' ? 'active' : 'todo'} />
            {(platformKeys.length ? platformKeys : []).map((k) => {
              const p = byPlatform[k];
              const finished = p.done >= p.total;
              return (
                <StepPill
                  key={k}
                  label={`${PLATFORM_LABELS[k]} ${p.done}/${p.total}`}
                  state={finished ? 'done' : stage === 'querying' ? 'active' : 'todo'}
                  warn={finished && p.failed === p.total}
                />
              );
            })}
            {!platformKeys.length &&
              platforms.map((label) => <StepPill key={label} label={label} state="todo" />)}
            <StepPill
              label="Analysis"
              state={stage === 'analyzing' ? 'active' : stage === 'complete' ? 'done' : 'todo'}
            />
          </div>
        </div>
      </div>

      <div className="px-8 md:px-14 pb-10 text-center text-[12px]" style={{ color: 'rgba(14,23,20,0.5)' }}>
        <span className="mono">Audit ID · {auditId ? auditId.slice(-10).toUpperCase() : 'PENDING'}</span>
      </div>
    </div>
  );
}

function StepPill({ label, state, warn }: { label: string; state: 'todo' | 'active' | 'done'; warn?: boolean }) {
  return (
    <span
      className="pill"
      style={{
        opacity: state === 'todo' ? 0.45 : warn ? 0.6 : 1,
        borderColor: state === 'active' ? 'var(--accent)' : 'var(--paper-line)',
        textDecoration: warn ? 'line-through' : undefined,
      }}
      title={warn ? 'This platform did not respond' : undefined}
    >
      {state === 'done' && !warn && <IconCheck size={11} />}
      {state === 'active' && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--accent)' }} />}
      {label}
    </span>
  );
}
