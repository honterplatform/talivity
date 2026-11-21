import { createHash, createHmac } from 'crypto';
import { Audit } from '@/models/audit';
import { settings } from './config';

/**
 * Every audit costs ~20–30 paid LLM calls and the endpoint is public, so it
 * needs limits. Counted from MongoDB (not memory) so they hold across
 * replicas and restarts. Failed audits don't count against a person — they
 * shouldn't be locked out because a provider had a bad minute.
 *
 * Race-safe usage: insert the audit first, then call checkRateLimits with
 * `includesSelf: true` and delete the audit if it's over. A burst of parallel
 * requests then can't all slip through a "count, then insert" gap.
 *
 * Set RATE_LIMIT_DISABLED=true while testing.
 */

export function clientIp(req: Request): string | null {
  // Railway's edge sets X-Real-IP; fall back to the first X-Forwarded-For hop.
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || null;
}

/**
 * IPv4 as-is (port stripped); IPv6 reduced to its /64 prefix, since one
 * subscriber typically controls a whole /64 and could otherwise rotate
 * addresses to dodge the per-IP limit.
 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']') === -1 ? undefined : ip.indexOf(']'));
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (v4) return v4[1];
  if (!ip.includes(':')) return ip;

  ip = ip.split('%')[0]; // zone id
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const groups = tail !== undefined ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, '') || '0')
    .join(':')}::/64`;
}

let warnedNoSecret = false;

/**
 * Keyed hash (HMAC), so a leaked database can't be reversed by brute-forcing
 * the ~4 billion IPv4 addresses. Uses IP_HASH_SALT; if that's unset, derives a
 * key from the server's other secrets (never stored in the database).
 */
function ipHashKey(): string {
  const configured = process.env.IP_HASH_SALT?.trim();
  if (configured) return configured;
  if (!warnedNoSecret) {
    console.warn('[rate-limit] IP_HASH_SALT is not set — deriving the IP hash key from other server secrets');
    warnedNoSecret = true;
  }
  return createHash('sha256')
    .update(
      ['talivity-ip-hash', settings.anthropicKey(), settings.openaiKey(), settings.geminiKey(), process.env.ADMIN_PASSWORD ?? '', process.env.MONGO_URL ?? ''].join('|')
    )
    .digest('hex');
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac('sha256', ipHashKey()).update(normalizeIp(ip)).digest('hex').slice(0, 32);
}

export interface RateLimitHit {
  message: string;
  retryAfterSec: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function retryAfter(filter: Record<string, unknown>, windowMs: number, nthNewest: number): Promise<number> {
  // The window frees up when the oldest audit that still counts ages out.
  const counted = await Audit.find(filter).sort({ createdAt: -1 }).skip(nthNewest).limit(1).select({ createdAt: 1 }).lean();
  const created = counted[0]?.createdAt ? new Date(counted[0].createdAt).getTime() : Date.now();
  return Math.max(60, Math.ceil((created + windowMs - Date.now()) / 1000));
}

function minutes(sec: number): string {
  const m = Math.ceil(sec / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  return `about ${h} hour${h === 1 ? '' : 's'}`;
}

/**
 * @param includesSelf the audit being requested has already been inserted and
 *   is therefore part of the counts.
 */
export async function checkRateLimits(
  email: string,
  ipHash: string | null,
  includesSelf = false
): Promise<RateLimitHit | null> {
  if (settings.rateLimit.disabled()) return null;
  const now = Date.now();
  const lastHour = { $gte: new Date(now - HOUR) };
  const over = (count: number, limit: number) => count > (includesSelf ? limit : limit - 1);
  const nth = (limit: number) => (includesSelf ? limit : limit - 1);

  const perEmail = settings.rateLimit.perEmailPerHour();
  if (perEmail > 0) {
    const filter = { email, createdAt: lastHour, status: { $ne: 'failed' } };
    if (over(await Audit.countDocuments(filter), perEmail)) {
      const sec = await retryAfter(filter, HOUR, nth(perEmail));
      return {
        message: `You've run ${perEmail} audit${perEmail === 1 ? '' : 's'} in the last hour. Please try again in ${minutes(sec)} — your earlier reports are still available at their links.`,
        retryAfterSec: sec,
      };
    }
  }

  const perIp = settings.rateLimit.perIpPerHour();
  if (perIp > 0 && ipHash) {
    const filter = { ipHash, createdAt: lastHour, status: { $ne: 'failed' } };
    if (over(await Audit.countDocuments(filter), perIp)) {
      const sec = await retryAfter(filter, HOUR, nth(perIp));
      return { message: `Too many audits from your network. Please try again in ${minutes(sec)}.`, retryAfterSec: sec };
    }
  }

  const globalLimit = settings.rateLimit.globalPerDay();
  if (globalLimit > 0) {
    if (over(await Audit.countDocuments({ createdAt: { $gte: new Date(now - DAY) } }), globalLimit)) {
      return {
        message: "We're running a lot of audits right now. Please try again in a little while.",
        retryAfterSec: 30 * 60,
      };
    }
  }

  return null;
}
