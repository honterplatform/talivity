import mongoose from 'mongoose';
import { connectDB } from './mongodb';
import { Audit } from '@/models/audit';
import { settings } from './config';
import { parseCompanyUrl } from './domain';
import { profileCompany } from './company-profile';
import { availablePlatforms } from './llm-clients';
import { runAudit, type AuditProgress } from './audit-engine';

/**
 * In-process audit queue.
 *
 * POST /api/audit now returns immediately and the audit runs here, in the
 * background of the long-lived Railway Node process. The browser polls
 * GET /api/audit/[id] for progress. A small concurrency cap keeps a burst of
 * sign-ups from firing hundreds of simultaneous LLM calls into rate limits.
 *
 * Note: this relies on a persistent server (Railway / `next start`). On a
 * serverless host the work would need a real queue.
 */

type RunnerState = {
  active: number;
  queue: string[];
  running: Set<string>;
  heartbeat?: ReturnType<typeof setInterval>;
  lastSweep?: number;
};
const g = globalThis as typeof globalThis & { __talivityRunner?: RunnerState };
const state: RunnerState = (g.__talivityRunner ??= { active: 0, queue: [], running: new Set() });

class UserFacingError extends Error {}

/** Beyond this many waiting audits, new requests get a friendly "busy" (503). */
const MAX_QUEUE = 40;

/**
 * Liveness. Every process heartbeats the audits it owns (queued or running)
 * every 20s. An audit with no heartbeat for STALE_AFTER_MS belongs to a process
 * that died (deploy, crash) and is closed out as failed — by the sweeper below
 * even if nobody is looking at it, and on lookup for whoever is polling.
 * Works with several replicas: each one only keeps its own audits alive.
 */
const HEARTBEAT_MS = 20_000;
export const STALE_AFTER_MS = 90_000;
const SWEEP_EVERY_MS = 60_000;

const INTERRUPTED_MESSAGE = 'This audit was interrupted. Please run it again.';

export function queueIsFull(): boolean {
  return state.queue.length >= MAX_QUEUE;
}

async function heartbeatAndSweep() {
  if (mongoose.connection.readyState !== 1) return; // don't force a connection
  const owned = [...state.running, ...state.queue];
  try {
    if (owned.length) {
      await Audit.updateMany({ _id: { $in: owned }, status: 'running' }, { $set: { heartbeatAt: new Date() } });
    }
    if (!state.lastSweep || Date.now() - state.lastSweep >= SWEEP_EVERY_MS) {
      state.lastSweep = Date.now();
      const cutoff = new Date(Date.now() - STALE_AFTER_MS);
      const res = await Audit.updateMany(
        {
          status: 'running',
          _id: { $nin: owned },
          $or: [
            { heartbeatAt: { $lt: cutoff } },
            { heartbeatAt: null, updatedAt: { $lt: cutoff } },
            { heartbeatAt: null, updatedAt: null, createdAt: { $lt: cutoff } },
          ],
        },
        {
          $set: {
            status: 'failed',
            errorMessage: INTERRUPTED_MESSAGE,
            internalError: 'stale: no heartbeat (server restarted or crashed mid-audit)',
            progress: { stage: 'failed', total: 0, done: 0, byPlatform: {} },
            completedAt: new Date(),
          },
        }
      );
      if (res.modifiedCount) console.warn(`[audit-runner] closed ${res.modifiedCount} interrupted audit(s)`);
    }
  } catch (err) {
    console.warn('[audit-runner] heartbeat/sweep failed', (err as Error).message);
  }
}

if (!state.heartbeat) {
  state.heartbeat = setInterval(heartbeatAndSweep, HEARTBEAT_MS);
  state.heartbeat.unref?.();
}

export function enqueueAudit(id: string) {
  if (state.running.has(id) || state.queue.includes(id)) return;
  state.queue.push(id);
  pump();
}

export { INTERRUPTED_MESSAGE };

/** 1-based position in line, or 0 if not waiting. */
export function queuePosition(id: string): number {
  const i = state.queue.indexOf(id);
  return i === -1 ? 0 : i + 1;
}

export function isAuditActive(id: string): boolean {
  return state.running.has(id) || state.queue.includes(id);
}

function pump() {
  while (state.active < settings.maxConcurrentAudits() && state.queue.length) {
    const id = state.queue.shift()!;
    state.active++;
    state.running.add(id);
    processAudit(id)
      .catch((err) => console.error(`[audit ${id}] crashed`, err))
      .finally(() => {
        state.active--;
        state.running.delete(id);
        pump();
      });
  }
}

/** Persist progress at most once a second, in order, and never after completion. */
class ProgressWriter {
  private pending: AuditProgress | null = null;
  private lastWrite = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(private readonly id: string) {}

  update(p: AuditProgress, immediate = false) {
    if (this.closed) return;
    this.pending = p;
    const wait = immediate ? 0 : 1000 - (Date.now() - this.lastWrite);
    if (wait <= 0) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, wait);
    }
  }

  private flush() {
    if (!this.pending) return;
    const progress = this.pending;
    this.pending = null;
    this.lastWrite = Date.now();
    this.chain = this.chain
      .then(() => Audit.updateOne({ _id: this.id, status: 'running' }, { $set: { progress } }))
      .catch((err) => console.warn(`[audit ${this.id}] progress write failed`, (err as Error).message));
  }

  async close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    await this.chain;
  }
}

async function processAudit(id: string) {
  await connectDB();
  const doc = await Audit.findById(id).lean();
  if (!doc || doc.status !== 'running') return;

  const startedAt = Date.now();
  const writer = new ProgressWriter(id);
  try {
    const domain = parseCompanyUrl(doc.companyUrl ?? '');
    if (!domain) throw new UserFacingError('We could not read that website address. Please check it and try again.');
    if (!availablePlatforms().length) {
      throw new UserFacingError('Our AI providers are unavailable right now. Please try again in a few minutes.');
    }

    writer.update({ stage: 'profiling', total: 0, done: 0, byPlatform: {} }, true);
    const profile = await profileCompany(domain);
    const profiledAt = Date.now();
    await Audit.updateOne(
      { _id: id },
      {
        $set: {
          companyName: profile.name,
          aliases: profile.aliases,
          industry: profile.industry,
          competitorSet: profile.competitors.map((c) => c.name),
          profileSource: profile.source,
          companyDomain: domain.registrableDomain,
        },
      }
    );

    // Re-check after profiling: that call may have just discovered a provider
    // is out of credits, and there is no point sending it ten more requests.
    const platforms = availablePlatforms();
    if (!platforms.length) {
      throw new UserFacingError('Our AI providers are unavailable right now. Please try again in a few minutes.');
    }

    const result = await runAudit(
      {
        companyName: profile.name,
        recognized: profile.recognized,
        descriptor: profile.descriptor,
        aliases: profile.aliases,
        industry: profile.industry,
        competitors: profile.competitors,
        companyUrl: domain.url,
        registrableDomain: domain.registrableDomain,
      },
      platforms,
      { onProgress: (p) => writer.update(p) }
    );
    await writer.close();

    // Deliberately not filtered on status:'running': if this audit was closed
    // as stale by mistake (e.g. a very slow step) the finished report still wins.
    await Audit.updateOne(
      { _id: id },
      {
        $set: {
          status: result.status,
          score: result.score,
          citationsOwned: result.citationsOwned,
          citationsTotal: result.citationsTotal,
          totalResponses: result.totalResponses,
          substantiveResponses: result.substantiveResponses,
          platformsUsed: result.platformsUsed,
          platforms: result.platforms,
          sourceMix: result.sourceMix,
          sampleResponses: result.sampleResponses,
          competitors: result.competitors,
          sentiment: result.sentiment,
          sentimentBreakdown: result.sentimentBreakdown,
          scoreBreakdown: result.scoreBreakdown,
          platformStats: result.platformStats,
          analysisMethod: result.analysisMethod,
          queries: result.queries,
          responses: result.responses,
          notRecognized: result.notRecognized,
          errorMessage: result.errorMessage,
          internalError: result.internalError,
          progress: { stage: result.status, total: 0, done: 0, byPlatform: {} },
          completedAt: new Date(),
        },
      }
    );

    const secs = (from: number, to: number) => ((to - from) / 1000).toFixed(1);
    console.log(
      `[audit ${id}] ${result.status} in ${secs(startedAt, Date.now())}s (profile ${secs(startedAt, profiledAt)}s) — ${profile.name} (${profile.industry}, profile:${profile.source}) score=${result.score} answers=${result.totalResponses} platforms=${result.platforms.join('+') || 'none'} analysis=${result.analysisMethod}${result.notRecognized ? ' NOT_RECOGNIZED' : ''}`
    );
  } catch (err) {
    await writer.close();
    const message =
      err instanceof UserFacingError ? err.message : 'We could not finish your audit. Please try again in a moment.';
    console.error(`[audit ${id}] failed`, err);
    await Audit.updateOne(
      { _id: id },
      {
        $set: {
          status: 'failed',
          errorMessage: message,
          internalError: (err as Error)?.message?.slice(0, 500) ?? String(err),
          progress: { stage: 'failed', total: 0, done: 0, byPlatform: {} },
          completedAt: new Date(),
        },
      }
    ).catch((e) => console.error(`[audit ${id}] could not record failure`, e));
  }
}
