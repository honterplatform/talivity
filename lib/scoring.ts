import { THIRD_PARTY_KEYS, type SourceKey } from './citation-parser';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface ScoringInput {
  sourceMix: Record<SourceKey, number>;
  competitorMentions: Record<string, number>;
  sentiment: Sentiment;
}

export interface ScoreBreakdown {
  ownedRatio: number; // 0-50
  sentiment: number; // 0-25
  competitiveDominance: number; // 0-15
  sourceDiversity: number; // 0-10
}

export interface ScoringOutput {
  score: number;
  citationsOwned: number;
  citationsTotal: number;
  topCompetitor: string | null;
  competitorCitations: number;
  breakdown: ScoreBreakdown;
}

export const SCORE_CAP = 95;

/**
 * Composite formula:
 *   50 — owned-content ratio (owned citations / all citations)
 *   25 — sentiment (positive 25 · neutral 15 · negative 5)
 *   15 — competitive dominance (competitor mentions vs. citations)
 *   10 — source diversity (penalise one third-party source dominating)
 * Capped at 95 — no perfect scores.
 */
export function computeScore(input: ScoringInput): ScoringOutput {
  const { sourceMix, competitorMentions, sentiment } = input;

  const citationsOwned = sourceMix.ownSite;
  const thirdPartyCounts = THIRD_PARTY_KEYS.map((k) => sourceMix[k] ?? 0);
  const thirdParty = thirdPartyCounts.reduce((a, b) => a + b, 0);
  const citationsTotal = citationsOwned + thirdParty;

  // 1. Owned-content ratio — 50 pts
  const ownedRatio = citationsTotal > 0 ? Math.round((citationsOwned / citationsTotal) * 50) : 0;

  // 2. Sentiment — 25 pts
  const sentimentScore = sentiment === 'positive' ? 25 : sentiment === 'neutral' ? 15 : 5;

  // 3. Competitive dominance — 15 pts
  const competitorEntries = Object.entries(competitorMentions).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const competitorTotal = competitorEntries.reduce((a, [, n]) => a + n, 0);
  const top = competitorEntries[0] ?? null;

  let competitiveDominance = 15;
  if (competitorTotal > 0) {
    const ratio = competitorTotal / Math.max(citationsTotal, 1);
    if (ratio >= 2) competitiveDominance = 0;
    else if (ratio >= 1) competitiveDominance = 5;
    else if (ratio >= 0.5) competitiveDominance = 10;
  }

  // 4. Source diversity — 10 pts
  let sourceDiversity = 10;
  if (thirdParty > 0) {
    const concentration = Math.max(...thirdPartyCounts) / thirdParty;
    if (concentration >= 0.8) sourceDiversity = 2;
    else if (concentration >= 0.6) sourceDiversity = 5;
    else if (concentration >= 0.4) sourceDiversity = 8;
  }

  const raw = ownedRatio + sentimentScore + competitiveDominance + sourceDiversity;
  return {
    score: Math.min(SCORE_CAP, Math.max(0, Math.round(raw))),
    citationsOwned,
    citationsTotal,
    topCompetitor: top ? top[0] : null,
    competitorCitations: top ? top[1] : 0,
    breakdown: { ownedRatio, sentiment: sentimentScore, competitiveDominance, sourceDiversity },
  };
}
