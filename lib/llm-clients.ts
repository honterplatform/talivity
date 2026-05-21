import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type Platform = 'openai' | 'anthropic' | 'gemini';

export const PLATFORM_LABELS: Record<Platform, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  gemini: 'Gemini',
};

const SYSTEM_PROMPT =
  "You are an AI assistant helping a job candidate research employers. Only state facts you actually know about the specific company being asked about. If you do not have reliable information about this exact company, say so plainly (e.g. 'I don't have reliable information about this company') and stop — DO NOT invent benefits, programs, culture details, or any other specifics to fill space. When you do have information, cite specific sources by name (e.g., 'According to Glassdoor reviews...', 'Indeed reports...', 'Based on news coverage...'). Be honest about employee sentiment and about the limits of your knowledge.";

const MAX_TOKENS = 300;
const TEMPERATURE = 0.3;

export interface LLMCallResult {
  platform: Platform;
  query: string;
  response: string;
  error?: string;
}

let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;
let _gemini: GoogleGenerativeAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    if (!process.env.GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY missing');
    _gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  }
  return _gemini;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const isRetryable = isTransientError(err);
    if (!isRetryable) throw err;
    await sleep(750);
    return fn();
  }
}

function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: string; message?: string };
  if (anyErr.status && [429, 500, 502, 503, 504].includes(anyErr.status)) return true;
  if (anyErr.code && ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(anyErr.code)) return true;
  if (anyErr.message && /timeout|ECONNRESET|fetch failed/i.test(anyErr.message)) return true;
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildUserMessage(query: string, context?: string): string {
  return context ? `${context}\n\n${query}` : query;
}

export async function callOpenAI(query: string, context?: string): Promise<LLMCallResult> {
  try {
    const client = getOpenAI();
    const result = await withRetry('openai', () =>
      client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(query, context) },
        ],
      })
    );
    const text = result.choices[0]?.message?.content?.trim() ?? '';
    return { platform: 'openai', query, response: text };
  } catch (err) {
    return {
      platform: 'openai',
      query,
      response: '',
      error: (err as Error).message ?? 'unknown openai error',
    };
  }
}

export async function callAnthropic(query: string, context?: string): Promise<LLMCallResult> {
  try {
    const client = getAnthropic();
    const result = await withRetry('anthropic', () =>
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(query, context) }],
      })
    );
    const text = result.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { platform: 'anthropic', query, response: text };
  } catch (err) {
    return {
      platform: 'anthropic',
      query,
      response: '',
      error: (err as Error).message ?? 'unknown anthropic error',
    };
  }
}

export async function callGemini(query: string, context?: string): Promise<LLMCallResult> {
  try {
    const client = getGemini();
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_TOKENS },
    });
    const result = await withRetry('gemini', () => model.generateContent(buildUserMessage(query, context)));
    const text = result.response.text().trim();
    return { platform: 'gemini', query, response: text };
  } catch (err) {
    return {
      platform: 'gemini',
      query,
      response: '',
      error: (err as Error).message ?? 'unknown gemini error',
    };
  }
}

/**
 * Single-shot sentiment classification across the aggregated mentions.
 * Uses the OpenAI client (cheapest, fastest); falls back to 'neutral' on error.
 */
export async function classifySentiment(aggregatedText: string): Promise<'positive' | 'neutral' | 'negative'> {
  try {
    const client = getOpenAI();
    const result = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 5,
      messages: [
        {
          role: 'system',
          content:
            'Classify the overall employee sentiment toward the company described in the following text. Respond with exactly one word: positive, neutral, or negative.',
        },
        { role: 'user', content: aggregatedText.slice(0, 6000) },
      ],
    });
    const raw = (result.choices[0]?.message?.content ?? '').toLowerCase().trim();
    if (raw.startsWith('positive')) return 'positive';
    if (raw.startsWith('negative')) return 'negative';
    return 'neutral';
  } catch {
    return 'neutral';
  }
}
