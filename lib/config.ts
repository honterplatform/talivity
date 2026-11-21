/**
 * Central place for environment-driven settings.
 *
 * Everything is read lazily (functions, not constants) so values are picked up
 * at request time on Railway instead of being frozen into the build.
 */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const items = raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return items.length ? items : fallback;
}

function flag(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[name]?.trim() ?? '');
}

export const settings = {
  // Models used to answer the candidate queries. Override per provider when a
  // model is retired — no code deploy needed.
  openaiModel: () => str('OPENAI_MODEL', 'gpt-4o-mini'),
  anthropicModel: () => str('ANTHROPIC_MODEL', 'claude-haiku-5-5'),
  geminiModel: () => str('GEMINI_MODEL', 'gemini-3.8-flash'),

  // Models used for the internal helper steps (company profile + answer analysis).
  openaiUtilityModel: () => str('OPENAI_UTILITY_MODEL', 'gpt-4o-mini'),
  anthropicUtilityModel: () => str('ANTHROPIC_UTILITY_MODEL', 'claude-haiku-5-5'),
  geminiUtilityModel: () => str('GEMINI_UTILITY_MODEL', 'gemini-3.8-flash'),
  /** Provider order for those helper steps: Claude first; others are fallbacks. */
  helperProviders: () => list('HELPER_PROVIDERS', ['anthropic', 'openai', 'gemini']),

  openaiKey: () => process.env.OPENAI_API_KEY?.trim() || '',
  anthropicKey: () => process.env.ANTHROPIC_API_KEY?.trim() || '',
  geminiKey: () => (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '').trim(),

  /** How many audits may run at once in this process; the rest wait in line. */
  maxConcurrentAudits: () => Math.max(1, int('AUDIT_MAX_CONCURRENCY', 4)),

  rateLimit: {
    disabled: () => flag('RATE_LIMIT_DISABLED'),
    perEmailPerHour: () => int('RATE_LIMIT_PER_EMAIL_PER_HOUR', 3),
    perIpPerHour: () => int('RATE_LIMIT_PER_IP_PER_HOUR', 10),
    globalPerDay: () => int('RATE_LIMIT_GLOBAL_PER_DAY', 500),
  },

};
