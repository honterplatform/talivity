import { completeJSON, type Platform } from './llm-clients';
import { looksUnrecognized } from './citation-parser';
import { normalizeText } from './text';

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type ResponseSentiment = Sentiment | 'mixed';

export interface ResponseJudgement {
  /** The answer contains real, company-specific information. */
  knows: boolean;
  sentiment: ResponseSentiment;
}

export interface AnalysisResult {
  judgements: ResponseJudgement[];
  method: 'llm' | 'heuristic';
  via?: Platform;
}

const MAX_CHARS_PER_ANSWER = 1500;

const SYSTEM =
  'You are a careful analyst. You read answers that AI assistants gave to job candidates asking about a specific employer, and you label each answer. Respond with a single JSON object and nothing else.';

function buildPrompt(companyName: string, answers: string[]): string {
  const blocks = answers
    .map((a, i) => {
      const body = normalizeText(a).slice(0, MAX_CHARS_PER_ANSWER).replace(/<\/?answer[^>]*>/gi, '');
      return `<answer id="${i + 1}">\n${body}\n</answer>`;
    })
    .join('\n\n');

  return `Employer: ${companyName}

Label each answer below:
- "knows": true if the answer contains substantive, company-specific information about ${companyName} (facts, reputation, pay, culture, programs, employee sentiment). false if the assistant says it lacks information about this company, or only gives generic advice (e.g. "check Glassdoor and their careers page") without anything specific to ${companyName}.
- "sentiment": the answer's overall tone about ${companyName} as an employer: "positive", "negative", "mixed", or "neutral". Use "neutral" when "knows" is false.

Return exactly this shape, one entry per answer, in order:
{"results":[{"id":1,"knows":true,"sentiment":"mixed"}]}

${blocks}`;
}

function toSentiment(raw: string): ResponseSentiment {
  const v = raw.trim().toLowerCase();
  if (v.startsWith('pos')) return 'positive';
  if (v.startsWith('neg')) return 'negative';
  if (v.startsWith('mix')) return 'mixed';
  return 'neutral';
}

function heuristicJudgements(answers: string[]): ResponseJudgement[] {
  return answers.map((a) => ({ knows: !looksUnrecognized(a), sentiment: 'neutral' as const }));
}

/**
 * Judge every answer in one batched call: does the assistant actually know the
 * company, and what's the tone? Falls back to regex recognition (and neutral
 * sentiment) if no provider can do it.
 */
export async function analyzeResponses(companyName: string, answers: string[]): Promise<AnalysisResult> {
  if (!answers.length) return { judgements: [], method: 'heuristic' };

  const result = await completeJSON(SYSTEM, buildPrompt(companyName, answers), {
    maxTokens: Math.min(4000, 400 + answers.length * 40),
    timeoutMs: 60_000,
    label: 'analysis',
  });
  if (!result) return { judgements: heuristicJudgements(answers), method: 'heuristic' };

  // Read entries one by one: a single malformed item shouldn't discard the batch.
  const rawResults = (result.data as { results?: unknown }).results;
  const byId = new Map<number, { knows: boolean; sentiment: string }>();
  if (Array.isArray(rawResults)) {
    for (const item of rawResults) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const id = Number(r.id);
      const knows = r.knows === true || r.knows === 'true' || r.knows === 'yes' ? true : r.knows === false || r.knows === 'false' || r.knows === 'no' ? false : null;
      if (!Number.isInteger(id) || knows === null) continue;
      byId.set(id, { knows, sentiment: typeof r.sentiment === 'string' ? r.sentiment : 'neutral' });
    }
  }
  const fallback = heuristicJudgements(answers);
  let missing = 0;
  const judgements = answers.map((_, i) => {
    const r = byId.get(i + 1);
    if (!r) {
      missing++;
      return fallback[i];
    }
    return { knows: r.knows, sentiment: r.knows ? toSentiment(r.sentiment) : 'neutral' };
  });

  // If the model skipped most items, don't pretend the labels are LLM-grade.
  if (missing > answers.length / 2) return { judgements: fallback, method: 'heuristic' };
  return { judgements, method: 'llm', via: result.via };
}

export interface SentimentSummary {
  overall: Sentiment;
  breakdown: Record<ResponseSentiment, number>;
}

/**
 * Overall sentiment across the answers that actually knew the company.
 * Net score = (positive − negative) / known; mixed and neutral count as zero.
 */
export function summarizeSentiment(judgements: ResponseJudgement[]): SentimentSummary {
  const breakdown: Record<ResponseSentiment, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  const known = judgements.filter((j) => j.knows);
  for (const j of known) breakdown[j.sentiment]++;
  if (!known.length) return { overall: 'neutral', breakdown };
  const net = (breakdown.positive - breakdown.negative) / known.length;
  const overall: Sentiment = net >= 0.25 ? 'positive' : net <= -0.25 ? 'negative' : 'neutral';
  return { overall, breakdown };
}
