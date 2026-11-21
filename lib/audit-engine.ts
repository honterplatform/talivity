import { generateQueries, type CompetitorGroup, type Industry } from './query-templates';
import { askPlatform, PLATFORMS, PLATFORM_LABELS, type ErrorKind, type LLMCallResult, type Platform } from './llm-clients';
import {
  createCitationParser,
  emptySourceMix,
  mergeCompetitorMentions,
  mergeSourceMixes,
  SOURCE_LABELS,
  THIRD_PARTY_KEYS,
  type ParsedCitations,
  type SourceKey,
} from './citation-parser';
import { analyzeResponses, summarizeSentiment, type ResponseSentiment } from './analysis';
import { computeScore, type ScoreBreakdown, type Sentiment } from './scoring';

export type AuditStage = 'queued' | 'profiling' | 'querying' | 'analyzing' | 'complete' | 'failed';

export interface PlatformProgress {
  total: number;
  done: number;
  failed: number;
}

export interface AuditProgress {
  stage: AuditStage;
  total: number;
  done: number;
  byPlatform: Partial<Record<Platform, PlatformProgress>>;
}

export interface PlatformStat {
  label: string;
  model: string;
  attempted: number;
  succeeded: number;
  failed: number;
  errorKinds: Partial<Record<ErrorKind, number>>;
  sampleError: string | null;
  avgLatencyMs: number | null;
}

export interface SampleResponse {
  platform: string;
  query: string;
  response: string;
  sourceCited: string | null;
}

export interface AuditInput {
  companyName: string;
  /** From the profile step; decides whether the prompt needs the domain. */
  recognized: boolean | null;
  descriptor?: string;
  aliases: string[];
  industry: Industry;
  competitors: CompetitorGroup[];
  companyUrl: string;
  registrableDomain: string;
}

/** Every answer collected, for transparency and admin debugging. */
export interface StoredResponse {
  platform: string;
  model: string;
  query: string;
  response: string;
  truncated: boolean;
  knows: boolean;
  sentiment: ResponseSentiment;
  sources: SourceKey[];
  competitors: string[];
}

export interface AuditResult {
  status: 'complete' | 'failed';
  score: number;
  citationsOwned: number;
  citationsTotal: number;
  /** Answers actually collected (successful calls). */
  totalResponses: number;
  /** Answers that contained real information about the company. */
  substantiveResponses: number;
  /** Platforms that returned at least one answer. */
  platformsUsed: number;
  platforms: string[];
  sourceMix: Record<SourceKey, number>;
  sampleResponses: SampleResponse[];
  competitors: {
    topCompetitor: string | null;
    competitorCitations: number;
    breakdown: Record<string, number>;
  };
  sentiment: Sentiment;
  sentimentBreakdown: Record<ResponseSentiment, number>;
  notRecognized: boolean;
  errorMessage: string | null;
  /** Admin-only diagnostic (never shown to the prospect). */
  internalError: string | null;
  scoreBreakdown: ScoreBreakdown;
  platformStats: Partial<Record<Platform, PlatformStat>>;
  analysisMethod: 'llm' | 'heuristic';
  queries: string[];
  responses: StoredResponse[];
}

/** Stop waiting for stragglers after this long and score what we have. */
const AUDIT_DEADLINE_MS = 120_000;

/** Share of answers that must say "I don't know this company" to flag it. */
const NOT_RECOGNIZED_THRESHOLD = 0.6;

export interface RunAuditHooks {
  onProgress?: (progress: AuditProgress) => void;
}

export async function runAudit(input: AuditInput, platforms: Platform[], hooks: RunAuditHooks = {}): Promise<AuditResult> {
  const queries = generateQueries(input.companyName, input.industry);
  const context = buildContext(input);

  const progress: AuditProgress = {
    stage: 'querying',
    total: queries.length * platforms.length,
    done: 0,
    byPlatform: {},
  };
  for (const p of platforms) progress.byPlatform[p] = { total: queries.length, done: 0, failed: 0 };
  const emit = () => hooks.onProgress?.(structuredClone(progress));
  emit();

  // Fan out every (query × platform) call in parallel.
  const slots: { platform: Platform; query: string; result?: LLMCallResult }[] = [];
  for (const query of queries) for (const platform of platforms) slots.push({ platform, query });

  let collecting = true;
  const tasks = slots.map((slot) =>
    askPlatform(slot.platform, slot.query, context).then((result) => {
      if (!collecting) return; // arrived after the deadline — ignore
      slot.result = result;
      const bp = progress.byPlatform[slot.platform]!;
      bp.done++;
      if (result.error) bp.failed++;
      progress.done++;
      emit();
    })
  );

  let deadline: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(tasks),
    new Promise<void>((resolve) => {
      deadline = setTimeout(resolve, AUDIT_DEADLINE_MS);
    }),
  ]);
  clearTimeout(deadline);
  collecting = false;

  const all: LLMCallResult[] = slots.map(
    (s) =>
      s.result ?? {
        platform: s.platform,
        model: '',
        query: s.query,
        response: '',
        truncated: false,
        latencyMs: AUDIT_DEADLINE_MS,
        error: 'Timed out',
        errorKind: 'timeout',
      }
  );

  const platformStats = buildPlatformStats(all, platforms);
  logPlatformFailures(platformStats);

  const successful = all.filter((r) => !r.error && r.response.trim().length > 0);
  const answeredPlatforms = PLATFORMS.filter((p) => successful.some((r) => r.platform === p));

  if (successful.length === 0) {
    return {
      ...emptyResult(queries, platformStats),
      status: 'failed',
      errorMessage: 'The AI platforms did not respond. Please try again in a few minutes.',
      internalError: summarizeFailures(platformStats),
    };
  }

  progress.stage = 'analyzing';
  emit();

  // Which answers actually know the company, and with what tone.
  const analysis = await analyzeResponses(
    input.companyName,
    successful.map((r) => r.response)
  );
  const judgements = analysis.judgements;
  const unknownCount = judgements.filter((j) => !j.knows).length;
  const notRecognized = unknownCount >= Math.ceil(successful.length * NOT_RECOGNIZED_THRESHOLD);

  // Only answers that know the company can cite sources about it. "I don't
  // know them — try Glassdoor or their careers page" is advice, not a citation.
  const parse = createCitationParser({
    companyName: input.companyName,
    aliases: input.aliases,
    registrableDomain: input.registrableDomain,
    competitors: input.competitors,
  });
  const parsedAll = successful.map((result) => ({ result, parsed: parse(result.response) }));
  const substantive = parsedAll.filter((_, i) => judgements[i]?.knows);
  const responses: StoredResponse[] = parsedAll.map(({ result, parsed }, i) => ({
    platform: PLATFORM_LABELS[result.platform],
    model: result.model,
    query: result.query,
    response: result.response,
    truncated: result.truncated,
    knows: judgements[i]?.knows ?? false,
    sentiment: judgements[i]?.sentiment ?? 'neutral',
    sources: (Object.keys(parsed.sourceMix) as SourceKey[]).filter((k) => parsed.sourceMix[k] > 0),
    competitors: Object.keys(parsed.competitorMentions),
  }));

  const sourceMix = mergeSourceMixes(substantive.map((p) => p.parsed.sourceMix));
  const competitorMentions = mergeCompetitorMentions(substantive.map((p) => p.parsed.competitorMentions));
  const sentimentSummary = summarizeSentiment(judgements);
  const sentiment: Sentiment = notRecognized ? 'neutral' : sentimentSummary.overall;

  const scoring = computeScore({ sourceMix, competitorMentions, sentiment });

  return {
    status: 'complete',
    score: notRecognized ? 0 : scoring.score,
    citationsOwned: scoring.citationsOwned,
    citationsTotal: scoring.citationsTotal,
    totalResponses: successful.length,
    substantiveResponses: substantive.length,
    platformsUsed: answeredPlatforms.length,
    platforms: answeredPlatforms.map((p) => PLATFORM_LABELS[p]),
    sourceMix,
    sampleResponses: pickSampleResponses(substantive.length ? substantive : parsedAll),
    competitors: {
      topCompetitor: scoring.topCompetitor,
      competitorCitations: scoring.competitorCitations,
      breakdown: competitorMentions,
    },
    sentiment,
    sentimentBreakdown: sentimentSummary.breakdown,
    notRecognized,
    errorMessage: notRecognized
      ? "We couldn't find enough information about this company in the major AI platforms."
      : null,
    internalError: platformStatsHaveFailures(platformStats) ? summarizeFailures(platformStats) : null,
    scoreBreakdown: scoring.breakdown,
    platformStats,
    analysisMethod: analysis.method,
    queries,
    responses,
  };
}

/**
 * The context line in front of every candidate query.
 *
 * Recognised companies get their name plus a short descriptor — not the URL.
 * Handing the model the URL made it echo it back ("check careers.walmart.com"),
 * which the parser then scored as an owned citation: the tool was inflating its
 * own headline metric. The domain is only included when the model didn't
 * recognise the company and needs it to disambiguate.
 */
export function buildContext(input: Pick<AuditInput, 'companyName' | 'recognized' | 'descriptor' | 'registrableDomain'>): string {
  const who = input.recognized
    ? `${input.companyName}${input.descriptor ? ` (${input.descriptor})` : ''}`
    : `${input.companyName} (website: ${input.registrableDomain})`;
  return `Context: The company is ${who}. Answer the following question about this specific company.`;
}

function emptyResult(queries: string[], platformStats: Partial<Record<Platform, PlatformStat>>): AuditResult {
  return {
    status: 'failed',
    score: 0,
    citationsOwned: 0,
    citationsTotal: 0,
    totalResponses: 0,
    substantiveResponses: 0,
    platformsUsed: 0,
    platforms: [],
    sourceMix: emptySourceMix(),
    sampleResponses: [],
    competitors: { topCompetitor: null, competitorCitations: 0, breakdown: {} },
    sentiment: 'neutral',
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0, mixed: 0 },
    notRecognized: false,
    errorMessage: null,
    internalError: null,
    scoreBreakdown: { ownedRatio: 0, sentiment: 0, competitiveDominance: 0, sourceDiversity: 0 },
    platformStats,
    analysisMethod: 'heuristic',
    queries,
    responses: [],
  };
}

function buildPlatformStats(all: LLMCallResult[], platforms: Platform[]): Partial<Record<Platform, PlatformStat>> {
  const stats: Partial<Record<Platform, PlatformStat>> = {};
  for (const platform of platforms) {
    const rows = all.filter((r) => r.platform === platform);
    const ok = rows.filter((r) => !r.error);
    const failed = rows.filter((r) => r.error);
    const errorKinds: Partial<Record<ErrorKind, number>> = {};
    for (const f of failed) {
      const k = f.errorKind ?? 'unknown';
      errorKinds[k] = (errorKinds[k] ?? 0) + 1;
    }
    stats[platform] = {
      label: PLATFORM_LABELS[platform],
      model: rows.find((r) => r.model)?.model ?? '',
      attempted: rows.length,
      succeeded: ok.length,
      failed: failed.length,
      errorKinds,
      sampleError: failed[0]?.error?.slice(0, 300) ?? null,
      avgLatencyMs: ok.length ? Math.round(ok.reduce((a, r) => a + r.latencyMs, 0) / ok.length) : null,
    };
  }
  return stats;
}

function platformStatsHaveFailures(stats: Partial<Record<Platform, PlatformStat>>): boolean {
  return Object.values(stats).some((s) => s && s.failed > 0);
}

function summarizeFailures(stats: Partial<Record<Platform, PlatformStat>>): string {
  return Object.values(stats)
    .filter((s): s is PlatformStat => !!s && s.failed > 0)
    .map((s) => {
      const kinds = Object.entries(s.errorKinds)
        .map(([k, n]) => `${k}×${n}`)
        .join(', ');
      return `${s.label}: ${s.failed}/${s.attempted} failed (${kinds})${s.sampleError ? ` — ${s.sampleError}` : ''}`;
    })
    .join(' | ');
}

function logPlatformFailures(stats: Partial<Record<Platform, PlatformStat>>) {
  for (const s of Object.values(stats)) {
    if (s && s.failed > 0) {
      console.error(
        `[audit] ${s.label} (${s.model || 'n/a'}): ${s.failed}/${s.attempted} calls failed — ${JSON.stringify(s.errorKinds)}${s.sampleError ? ` — e.g. ${s.sampleError}` : ''}`
      );
    }
  }
}

/**
 * One sample per platform, preferring the answer that best illustrates the
 * problem (third-party-heavy, competitors named, no owned citation).
 */
function pickSampleResponses(parsed: { result: LLMCallResult; parsed: ParsedCitations }[]): SampleResponse[] {
  const scoreCandidate = (p: (typeof parsed)[number]): number => {
    const thirdParty = THIRD_PARTY_KEYS.reduce((a, k) => a + p.parsed.sourceMix[k], 0);
    const competitorCount = Object.values(p.parsed.competitorMentions).reduce((a, b) => a + b, 0);
    return (
      thirdParty * 10 +
      competitorCount * 5 +
      (p.parsed.ownSiteMentioned ? -50 : 0) +
      (p.result.truncated ? 0 : 3) +
      Math.min(p.result.response.length, 1200) / 200
    );
  };

  const samples: SampleResponse[] = [];
  for (const platform of PLATFORMS) {
    const list = parsed.filter((p) => p.result.platform === platform);
    if (!list.length) continue;
    const top = [...list].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
    samples.push({
      platform: PLATFORM_LABELS[platform],
      query: top.result.query,
      response: top.result.response,
      sourceCited: top.parsed.primarySource ? SOURCE_LABELS[top.parsed.primarySource] : null,
    });
  }
  return samples;
}
