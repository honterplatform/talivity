import { generateQueries, type Industry } from './query-templates';
import {
  callAnthropic,
  callGemini,
  callOpenAI,
  classifySentiment,
  PLATFORM_LABELS,
  type LLMCallResult,
  type Platform,
} from './llm-clients';
import {
  isNotRecognized,
  mergeCompetitorMentions,
  mergeSourceMixes,
  parseResponseCitations,
  SOURCE_LABELS,
  type SourceKey,
} from './citation-parser';
import { computeScore, type ScoringOutput } from './scoring';

export interface SampleResponse {
  platform: string;
  query: string;
  response: string;
  sourceCited: string | null;
}

export interface AuditResult {
  status: 'complete' | 'failed';
  score: number;
  citationsOwned: number;
  citationsTotal: number;
  sourceMix: Record<SourceKey, number>;
  sampleResponses: SampleResponse[];
  competitors: {
    topCompetitor: string | null;
    competitorCitations: number;
    breakdown: Record<string, number>;
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  notRecognized: boolean;
  errorMessage: string | null;
  scoreBreakdown: ScoringOutput['breakdown'];
}

export async function runAudit(companyName: string, industry: Industry): Promise<AuditResult> {
  const queries = generateQueries(companyName, industry);

  // Fire all 30 calls in parallel.
  const callPromises: Promise<LLMCallResult>[] = [];
  for (const q of queries) {
    callPromises.push(callOpenAI(q), callAnthropic(q), callGemini(q));
  }
  const allResults = await Promise.all(callPromises);
  const successful = allResults.filter((r) => !r.error && r.response.length > 0);

  // All failed → bail out cleanly.
  if (successful.length === 0) {
    return {
      status: 'failed',
      score: 0,
      citationsOwned: 0,
      citationsTotal: 0,
      sourceMix: emptySourceMix(),
      sampleResponses: [],
      competitors: { topCompetitor: null, competitorCitations: 0, breakdown: {} },
      sentiment: 'neutral',
      notRecognized: false,
      errorMessage: 'All AI platforms failed to respond. Please try again.',
      scoreBreakdown: { ownedRatio: 0, sentiment: 0, competitiveDominance: 0, sourceDiversity: 0 },
    };
  }

  // Detect "company not recognized" — if a majority of successful responses say they don't know
  // the company, we don't have enough signal to score.
  const notRecognizedCount = successful.filter((r) => isNotRecognized(r.response)).length;
  const notRecognized = notRecognizedCount >= Math.ceil(successful.length * 0.6);

  // Parse each successful response.
  const parsed = successful.map((r) => ({
    result: r,
    parsed: parseResponseCitations(r.response, companyName, industry),
  }));

  const sourceMix = mergeSourceMixes(parsed.map((p) => p.parsed.sourceMix));
  const competitorMentions = mergeCompetitorMentions(parsed.map((p) => p.parsed.competitorMentions));

  // Sentiment pass over the concatenated text.
  const concatenated = successful.map((r) => r.response).join('\n\n---\n\n');
  const sentiment = notRecognized ? 'neutral' : await classifySentiment(concatenated);

  // Score.
  const scoring = computeScore({
    sourceMix,
    competitorMentions,
    totalResponses: successful.length,
    sentiment,
  });

  // Pick 3 sample responses — one per platform, prioritizing the ones that best illustrate
  // a third-party-source-heavy or negative answer.
  const sampleResponses = pickSampleResponses(parsed);

  return {
    status: 'complete',
    score: notRecognized ? 0 : scoring.score,
    citationsOwned: scoring.citationsOwned,
    citationsTotal: scoring.citationsTotal,
    sourceMix,
    sampleResponses,
    competitors: {
      topCompetitor: scoring.topCompetitor,
      competitorCitations: scoring.competitorCitations,
      breakdown: competitorMentions,
    },
    sentiment,
    notRecognized,
    errorMessage: notRecognized
      ? "We couldn't find enough information about this company in the major AI platforms."
      : null,
    scoreBreakdown: scoring.breakdown,
  };
}

function emptySourceMix(): Record<SourceKey, number> {
  return {
    ownSite: 0,
    glassdoor: 0,
    indeed: 0,
    reddit: 0,
    linkedin: 0,
    wikipedia: 0,
    news: 0,
    other: 0,
  };
}

function pickSampleResponses(
  parsed: { result: LLMCallResult; parsed: ReturnType<typeof parseResponseCitations> }[]
): SampleResponse[] {
  const byPlatform: Record<Platform, typeof parsed> = {
    openai: [],
    anthropic: [],
    gemini: [],
  };
  for (const p of parsed) byPlatform[p.result.platform].push(p);

  const scoreCandidate = (p: typeof parsed[number]): number => {
    // Higher = better illustration of the problem (third-party-heavy, no owned site).
    const ownsHit = p.parsed.ownSiteMentioned ? -50 : 0;
    const competitorCount = Object.values(p.parsed.competitorMentions).reduce((a, b) => a + b, 0);
    const thirdPartyTotal =
      p.parsed.sourceMix.glassdoor +
      p.parsed.sourceMix.indeed +
      p.parsed.sourceMix.reddit +
      p.parsed.sourceMix.linkedin +
      p.parsed.sourceMix.wikipedia +
      p.parsed.sourceMix.news +
      p.parsed.sourceMix.other;
    return thirdPartyTotal * 10 + competitorCount * 5 + ownsHit + p.result.response.length / 200;
  };

  const samples: SampleResponse[] = [];
  for (const platform of ['openai', 'anthropic', 'gemini'] as Platform[]) {
    const list = byPlatform[platform];
    if (!list.length) continue;
    list.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const top = list[0];
    samples.push({
      platform: PLATFORM_LABELS[platform],
      query: top.result.query,
      response: top.result.response,
      sourceCited: top.parsed.primarySource ? SOURCE_LABELS[top.parsed.primarySource] : null,
    });
  }
  return samples;
}
