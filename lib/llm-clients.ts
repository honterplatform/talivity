import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { settings } from './config';

export type Platform = 'openai' | 'anthropic' | 'gemini';

export const PLATFORMS: Platform[] = ['openai', 'anthropic', 'gemini'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  gemini: 'Gemini',
};

/**
 * System prompt for the candidate queries. The last sentence keeps answers
 * short enough to finish inside the token budget — previously most answers
 * were cut off mid-sentence and quoted that way in the report.
 */
export const AUDIT_SYSTEM_PROMPT =
  "You are an AI assistant helping a job candidate research employers. Only state facts you actually know about the specific company being asked about. If you do not have reliable information about this exact company, say so plainly (e.g. 'I don't have reliable information about this company') and stop — DO NOT invent benefits, programs, culture details, or any other specifics to fill space. When you do have information, cite specific sources by name (e.g., 'According to Glassdoor reviews...', 'Indeed reports...', 'Based on news coverage...'). Be honest about employee sentiment and about the limits of your knowledge. Keep your answer under 150 words.";

const AUDIT_MAX_TOKENS = 450;
const AUDIT_TEMPERATURE = 0.3;
const AUDIT_TIMEOUT_MS = 45_000;

export interface LLMCallResult {
  platform: Platform;
  model: string;
  query: string;
  response: string;
  truncated: boolean;
  latencyMs: number;
  error?: string;
  errorKind?: ErrorKind;
}

// ---------------------------------------------------------------------------
// Errors + provider health
// ---------------------------------------------------------------------------

export type ErrorKind =
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'bad_request'
  | 'timeout'
  | 'server'
  | 'network'
  | 'empty'
  | 'not_configured'
  | 'unknown';

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown })?.status;
  return typeof s === 'number' ? s : undefined;
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? 'unknown error');
}

export function classifyError(err: unknown): ErrorKind {
  const status = statusOf(err);
  const msg = messageOf(err).toLowerCase();
  const e = err as { code?: unknown; type?: unknown; name?: string; error?: { type?: unknown } };
  const code = String(e?.code ?? '').toLowerCase();
  const type = String(e?.type ?? e?.error?.type ?? '').toLowerCase();
  const name = e?.name ?? '';

  // Out of credits. OpenAI: 429 + type "insufficient_quota" (code
  // "credit_balance_exhausted"); Anthropic: 400 "credit balance is too low".
  // Deliberately NOT matching "exceeded your current quota" — Gemini uses that
  // wording for ordinary per-minute rate limits, which are transient.
  if (
    type === 'insufficient_quota' ||
    code === 'insufficient_quota' ||
    code === 'credit_balance_exhausted' ||
    /insufficient[_ ]quota|no credits remaining|credit balance/.test(msg)
  ) {
    return 'quota';
  }
  if (status === 401 || status === 403 || /api[_ ]key|unauthori[sz]ed|permission[_ ]denied/.test(msg)) return 'auth';
  if (status === 429) return 'rate_limit';
  if (name === 'TimeoutError' || name === 'AbortError' || /timed? ?out|timeout/.test(msg)) return 'timeout';
  if (status === 400 || status === 404 || status === 422) return 'bad_request';
  if (status !== undefined && status >= 500) return 'server';
  if (/fetch failed|econnreset|enotfound|econnrefused|socket|network/.test(msg)) return 'network';
  return 'unknown';
}

interface BreakerState {
  until: number;
  reason: string;
  kind: ErrorKind;
  since: number;
}

type GlobalState = {
  __talivityBreakers?: Map<Platform, BreakerState>;
  __talivityUnsupported?: Map<string, Set<string>>;
};
const g = globalThis as typeof globalThis & GlobalState;
const breakers = (g.__talivityBreakers ??= new Map());
const unsupportedParams = (g.__talivityUnsupported ??= new Map());

const BREAKER_MS = 15 * 60 * 1000;

/**
 * Auth and billing failures won't fix themselves within an audit, so once a
 * provider returns one we stop sending it traffic for a while. This is what
 * lets an audit run cleanly on the remaining providers when, for example, the
 * OpenAI account runs out of credits.
 */
function tripBreaker(platform: Platform, kind: ErrorKind, reason: string) {
  const existing = breakers.get(platform);
  const wasOpen = !!existing && existing.until > Date.now();
  breakers.set(platform, {
    until: Date.now() + BREAKER_MS,
    reason,
    kind,
    since: existing?.since ?? Date.now(),
  });
  if (!wasOpen) console.error(`[llm] ${PLATFORM_LABELS[platform]} paused for 15 min (${kind}): ${reason}`);
}

function noteFailure(platform: Platform, err: unknown): ErrorKind {
  const kind = classifyError(err);
  if (kind === 'auth' || kind === 'quota') tripBreaker(platform, kind, messageOf(err).slice(0, 300));
  return kind;
}

function noteSuccess(platform: Platform) {
  breakers.delete(platform);
}

function keyFor(platform: Platform): string {
  if (platform === 'openai') return settings.openaiKey();
  if (platform === 'anthropic') return settings.anthropicKey();
  return settings.geminiKey();
}

export function isConfigured(platform: Platform): boolean {
  return keyFor(platform).length > 0;
}

export function isAvailable(platform: Platform): boolean {
  if (!isConfigured(platform)) return false;
  const b = breakers.get(platform);
  return !b || b.until <= Date.now();
}

/** Platforms that will actually be queried by the next audit. */
export function availablePlatforms(): Platform[] {
  return PLATFORMS.filter(isAvailable);
}

export interface ProviderStatus {
  platform: Platform;
  label: string;
  model: string;
  configured: boolean;
  available: boolean;
  issue?: { kind: ErrorKind; reason: string; since: string; retryAt: string };
}

export function providerStatus(): ProviderStatus[] {
  return PLATFORMS.map((platform) => {
    const b = breakers.get(platform);
    const active = b && b.until > Date.now();
    return {
      platform,
      label: PLATFORM_LABELS[platform],
      model: auditModelFor(platform),
      configured: isConfigured(platform),
      available: isAvailable(platform),
      issue: active
        ? {
            kind: b.kind,
            reason: b.reason,
            since: new Date(b.since).toISOString(),
            retryAt: new Date(b.until).toISOString(),
          }
        : undefined,
    };
  });
}

function auditModelFor(platform: Platform): string {
  if (platform === 'openai') return settings.openaiModel();
  if (platform === 'anthropic') return settings.anthropicModel();
  return settings.geminiModel();
}

function utilityModelFor(platform: Platform): string {
  if (platform === 'openai') return settings.openaiUtilityModel();
  if (platform === 'anthropic') return settings.anthropicUtilityModel();
  return settings.geminiUtilityModel();
}

// ---------------------------------------------------------------------------
// Adaptive request parameters
// ---------------------------------------------------------------------------
//
// Providers keep changing which knobs each model accepts (Claude 5.x rejects
// `temperature`, GPT-5 rejects `max_tokens`, some Gemini models reject certain
// thinking levels). Rather than hard-failing every call, we drop the optional
// parameter a 400 complains about, retry once, and remember it per model.

function omitted(platform: Platform, model: string): Set<string> {
  const key = `${platform}:${model}`;
  let set = unsupportedParams.get(key);
  if (!set) {
    set = new Set();
    unsupportedParams.set(key, set);
  }
  return set;
}

export async function withParamFallback<T>(
  platform: Platform,
  model: string,
  optionalParams: string[],
  call: (skip: ReadonlySet<string>) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // Snapshot per attempt: concurrent calls can update the shared set while
    // this request is in flight, and we must judge the error against the
    // parameters *this* request actually sent.
    const skip = new Set(omitted(platform, model));
    try {
      return await call(skip);
    } catch (err) {
      const status = statusOf(err);
      if (attempt < 2 && (status === 400 || status === 422)) {
        const msg = messageOf(err).toLowerCase();
        const offending = optionalParams.find((p) => !skip.has(p) && msg.includes(p.toLowerCase()));
        if (offending) {
          const shared = omitted(platform, model);
          if (!shared.has(offending)) {
            shared.add(offending);
            console.warn(`[llm] ${platform}/${model} rejected "${offending}" — retrying without it`);
          }
          continue;
        }
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

interface CompletionRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  json?: boolean;
}

interface CompletionResult {
  text: string;
  truncated: boolean;
}

let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = settings.openaiKey();
    if (!apiKey) throw new HttpError('OPENAI_API_KEY missing', 401);
    // One SDK-level retry with backoff for 429/5xx; auth/quota errors trip the breaker instead.
    _openai = new OpenAI({ apiKey, maxRetries: 1 });
  }
  return _openai;
}

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = settings.anthropicKey();
    if (!apiKey) throw new HttpError('ANTHROPIC_API_KEY missing', 401);
    _anthropic = new Anthropic({ apiKey, maxRetries: 1 });
  }
  return _anthropic;
}

/** GPT-5-family and o-series models take different parameters. */
function isOpenAIReasoningModel(model: string): boolean {
  return /^(?:o\d|gpt-5)/i.test(model);
}

async function openaiComplete(model: string, req: CompletionRequest): Promise<CompletionResult> {
  const client = getOpenAI();
  return withParamFallback('openai', model, ['temperature', 'max_tokens', 'reasoning_effort', 'response_format'], async (skip) => {
    const reasoning = isOpenAIReasoningModel(model);
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    };
    if (reasoning || skip.has('max_tokens')) {
      // Reasoning tokens share this budget, so leave headroom for the answer.
      body.max_completion_tokens = Math.max(req.maxTokens * 4, 2000);
      if (reasoning && !skip.has('reasoning_effort')) body.reasoning_effort = 'low';
    } else {
      body.max_tokens = req.maxTokens;
    }
    if (req.temperature !== undefined && !reasoning && !skip.has('temperature')) {
      body.temperature = req.temperature;
    }
    if (req.json && !skip.has('response_format')) body.response_format = { type: 'json_object' };

    const res = (await client.chat.completions.create(
      body as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      { timeout: req.timeoutMs }
    )) as OpenAI.Chat.ChatCompletion;
    const choice = res.choices[0];
    return {
      text: choice?.message?.content?.trim() ?? '',
      truncated: choice?.finish_reason === 'length',
    };
  });
}

async function anthropicComplete(model: string, req: CompletionRequest): Promise<CompletionResult> {
  const client = getAnthropic();
  return withParamFallback('anthropic', model, ['temperature', 'thinking'], async (skip) => {
    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    };
    // Newer Claude models think by default, and thinking tokens come out of
    // max_tokens — with a small budget the answer can come back empty.
    if (!skip.has('thinking')) body.thinking = { type: 'disabled' };
    if (req.temperature !== undefined && !skip.has('temperature')) body.temperature = req.temperature;

    const res = (await client.messages.create(
      body as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      { timeout: req.timeoutMs }
    )) as Anthropic.Messages.Message;
    const text = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { text, truncated: res.stop_reason === 'max_tokens' };
  });
}

/**
 * Gemini via the REST API (the old @google/generative-ai SDK is deprecated and
 * its default model, gemini-1.5-flash, has been shut down).
 */
async function geminiComplete(model: string, req: CompletionRequest): Promise<CompletionResult> {
  const apiKey = settings.geminiKey();
  if (!apiKey) throw new HttpError('GOOGLE_AI_API_KEY missing', 401);
  const modelId = model.replace(/^models\//, '');

  return withParamFallback('gemini', model, ['thinking', 'responseMimeType'], async (skip) => {
    const generationConfig: Record<string, unknown> = {
      // Thinking tokens count toward maxOutputTokens on Gemini 3.x; a tight cap
      // returns truncated or empty answers. Length is governed by the prompt.
      maxOutputTokens: Math.max(req.maxTokens * 4, 2048),
    };
    if (!skip.has('thinking')) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    if (req.json && !skip.has('responseMimeType')) generationConfig.responseMimeType = 'application/json';

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: req.system }] },
              contents: [{ role: 'user', parts: [{ text: req.user }] }],
              generationConfig,
            }),
            signal: AbortSignal.timeout(req.timeoutMs),
            cache: 'no-store',
          }
        );
      } catch (err) {
        if (attempt === 0 && classifyError(err) === 'network') {
          await sleep(800);
          continue;
        }
        throw err;
      }

      type GeminiPart = { text?: string; thought?: boolean };
      type GeminiResponse = {
        candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        error?: { message?: string; status?: string };
      };
      const data = (await res.json().catch(() => null)) as GeminiResponse | null;

      if (!res.ok) {
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          await sleep(1200);
          continue;
        }
        throw new HttpError(data?.error?.message ?? `Gemini HTTP ${res.status}`, res.status, data?.error?.status);
      }

      const candidate = data?.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim();
      if (!text && data?.promptFeedback?.blockReason) {
        throw new HttpError(`Gemini blocked the prompt (${data.promptFeedback.blockReason})`, 400);
      }
      return { text, truncated: candidate?.finishReason === 'MAX_TOKENS' };
    }
  });
}

function complete(platform: Platform, model: string, req: CompletionRequest): Promise<CompletionResult> {
  if (platform === 'openai') return openaiComplete(model, req);
  if (platform === 'anthropic') return anthropicComplete(model, req);
  return geminiComplete(model, req);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function buildUserMessage(query: string, context?: string): string {
  return context ? `${context}\n\n${query}` : query;
}

/** Ask one platform one candidate query. Never throws — failures are returned. */
export async function askPlatform(platform: Platform, query: string, context?: string): Promise<LLMCallResult> {
  const model = auditModelFor(platform);
  const started = Date.now();
  const base = { platform, model, query };

  if (!isAvailable(platform)) {
    return {
      ...base,
      response: '',
      truncated: false,
      latencyMs: 0,
      error: isConfigured(platform) ? 'Provider temporarily disabled after an auth/billing error' : 'API key not configured',
      errorKind: isConfigured(platform) ? breakers.get(platform)?.kind ?? 'unknown' : 'not_configured',
    };
  }

  try {
    const { text, truncated } = await complete(platform, model, {
      system: AUDIT_SYSTEM_PROMPT,
      user: buildUserMessage(query, context),
      maxTokens: AUDIT_MAX_TOKENS,
      temperature: AUDIT_TEMPERATURE,
      timeoutMs: AUDIT_TIMEOUT_MS,
    });
    if (!text) {
      return { ...base, response: '', truncated, latencyMs: Date.now() - started, error: 'Empty response', errorKind: 'empty' };
    }
    noteSuccess(platform);
    return { ...base, response: text, truncated, latencyMs: Date.now() - started };
  } catch (err) {
    const kind = noteFailure(platform, err);
    return {
      ...base,
      response: '',
      truncated: false,
      latencyMs: Date.now() - started,
      error: messageOf(err).slice(0, 500),
      errorKind: kind,
    };
  }
}

/**
 * Pull the first JSON object out of a model reply (handles ```json fences and
 * stray prose around the object).
 */
export function extractJSON(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Provider order for the helper steps (company profile, answer analysis):
 * HELPER_PROVIDERS first (default: Claude), then any others as fallbacks.
 */
export function helperOrder(): Platform[] {
  const wanted = settings
    .helperProviders()
    .filter((p): p is Platform => (PLATFORMS as string[]).includes(p))
    .filter((p, i, arr) => arr.indexOf(p) === i);
  return [...wanted, ...PLATFORMS.filter((p) => !wanted.includes(p))];
}

/**
 * Helper-step call that must return JSON (company profile, answer analysis).
 * Tries each available provider in turn, so these steps no longer silently
 * degrade when one provider is down — previously an OpenAI outage meant every
 * company was classified as "Sales" with "neutral" sentiment.
 */
export async function completeJSON(
  system: string,
  user: string,
  opts: { maxTokens: number; timeoutMs?: number; label: string }
): Promise<{ data: unknown; via: Platform } | null> {
  for (const platform of helperOrder().filter(isAvailable)) {
    const model = utilityModelFor(platform);
    try {
      const { text } = await complete(platform, model, {
        system,
        user,
        maxTokens: opts.maxTokens,
        temperature: 0,
        timeoutMs: opts.timeoutMs ?? 30_000,
        json: true,
      });
      const data = extractJSON(text);
      if (data && typeof data === 'object') {
        noteSuccess(platform);
        return { data, via: platform };
      }
      console.warn(`[llm] ${opts.label}: ${platform} returned unparseable JSON`);
    } catch (err) {
      const kind = noteFailure(platform, err);
      console.warn(`[llm] ${opts.label}: ${platform} failed (${kind}): ${messageOf(err).slice(0, 200)}`);
    }
  }
  return null;
}
