import type { SourceKey } from './citation-parser';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface ScoringInput {
  sourceMix: Record<SourceKey, number>;
  competitorMentions: Record<string, number>;
  totalResponses: number;
  sentiment: Sentiment;
}

export interface ScoringOutput {
  score: number;
  citationsOwned: number;
  citationsTotal: number;
  topCompetitor: string | null;
  competitorCitations: number;
  breakdown: {
    ownedRatio: number;       // 0-50
    sentiment: number;        // 0-25
    competitiveDominance: number; // 0-15
    sourceDiversity: number;  // 0-10
  };
}

/**
 * Composite formula:
 *   50 — owned-content ratio
 *   25 — sentiment skew
 *   15 — competitive dominance
 *   10 — source diversity
 * Cap at 95.
 */
export function computeScore(input: ScoringInput): ScoringOutput {
  const { sourceMix, competitorMentions, totalResponses, sentiment } = input;

  const citationsOwned = sourceMix.ownSite;
  const thirdParty =
    sourceMix.glassdoor +
    sourceMix.indeed +
    sourceMix.reddit +
    sourceMix.linkedin +
    sourceMix.wikipedia +
    sourceMix.news +
    sourceMix.other;
  const citationsTotal = citationsOwned + thirdParty;

  // 1. Owned-content ratio — 50 pts
  let ownedRatio = 0;
  if (citationsTotal > 0) {
    ownedRatio = Math.round((citationsOwned / citationsTotal) * 50);
  }

  // 2. Sentiment skew — 25 pts (positive=25, neutral=15, negative=5)
  const sentimentScore = sentiment === 'positive' ? 25 : sentiment === 'neutral' ? 15 : 5;

  // 3. Competitive dominance — 15 pts.
  // We compare total competitor mentions vs. citations involving the audited company at all.
  const competitorTotal = Object.values(competitorMentions).reduce((a, b) => a + b, 0);
  let competitorEntries = Object.entries(competitorMentions);
  competitorEntries.sort((a, b) => b[1] - a[1]);
  const top = competitorEntries[0] ?? null;
  const topCompetitor = top ? top[0] : null;
  const competitorCitations = top ? top[1] : 0;

  let competitiveDominance = 15;
  if (competitorTotal > 0) {
    // We treat the company's "presence" as citationsTotal across the 30 responses.
    const ratio = competitorTotal / Math.max(citationsTotal, 1);
    if (ratio >= 2) competitiveDominance = 0;
    else if (ratio >= 1) competitiveDominance = 5;
    else if (ratio >= 0.5) competitiveDominance = 10;
    else competitiveDominance = 15;
  }

  // 4. Source diversity — 10 pts. Penalize if any single third-party source dominates.
  let sourceDiversity = 10;
  if (thirdParty > 0) {
    const maxThirdParty = Math.max(
      sourceMix.glassdoor,
      sourceMix.indeed,
      sourceMix.reddit,
      sourceMix.linkedin,
      sourceMix.wikipedia,
      sourceMix.news,
      sourceMix.other
    );
    const concentration = maxThirdParty / thirdParty;
    if (concentration >= 0.8) sourceDiversity = 2;
    else if (concentration >= 0.6) sourceDiversity = 5;
    else if (concentration >= 0.4) sourceDiversity = 8;
    else sourceDiversity = 10;
  }

  // No citations at all → very low signal, floor the score.
  if (citationsTotal === 0 && totalResponses === 0) {
    return {
      score: 0,
      citationsOwned: 0,
      citationsTotal: 0,
      topCompetitor: null,
      competitorCitations: 0,
      breakdown: { ownedRatio: 0, sentiment: 0, competitiveDominance: 0, sourceDiversity: 0 },
    };
  }

  const raw = ownedRatio + sentimentScore + competitiveDominance + sourceDiversity;
  const score = Math.min(95, Math.max(0, Math.round(raw)));

  return {
    score,
    citationsOwned,
    citationsTotal,
    topCompetitor,
    competitorCitations,
    breakdown: {
      ownedRatio,
      sentiment: sentimentScore,
      competitiveDominance,
      sourceDiversity,
    },
  };
}
