import { randomBytes } from 'crypto';
import { connectDB } from './mongodb';
import { Audit, type AuditDoc } from '@/models/audit';
import { INTERRUPTED_MESSAGE, isAuditActive, STALE_AFTER_MS } from './audit-runner';

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{16}$/;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** 12 random bytes → 16 URL-safe characters. */
export function newPublicId(): string {
  return randomBytes(12).toString('base64url');
}

/** The id to use in links for this audit. */
export function publicKeyOf(doc: { publicId?: string | null; _id: unknown }): string {
  return doc.publicId || String(doc._id);
}

/**
 * Resolve the id from a URL. New audits are only reachable by their random
 * publicId; ObjectId links keep working for audits created before publicId
 * existed, so links already shared with prospects don't break.
 */
export async function findAuditByKey(key: string, opts: { statusOnly?: boolean } = {}): Promise<AuditDoc | null> {
  if (!key) return null;
  await connectDB();

  // The loading screen polls every 2s — don't haul the full document (30
  // stored answers) over the wire for a status check.
  const projection = opts.statusOnly
    ? { publicId: 1, companyName: 1, status: 1, progress: 1, errorMessage: 1, createdAt: 1, updatedAt: 1, heartbeatAt: 1 }
    : undefined;

  let doc: AuditDoc | null = null;
  if (PUBLIC_ID_RE.test(key)) {
    doc = (await Audit.findOne({ publicId: key }, projection).lean()) as AuditDoc | null;
  } else if (OBJECT_ID_RE.test(key)) {
    const legacy = (await Audit.findById(key, projection).lean()) as AuditDoc | null;
    if (legacy && !legacy.publicId) doc = legacy;
  }
  return doc ? expireIfStale(doc) : null;
}

/**
 * An audit whose job died (deploy, crash) would otherwise sit on "running"
 * and the loading screen would poll forever. Same liveness rule as the
 * runner's sweeper: no heartbeat for STALE_AFTER_MS and not alive here.
 */
async function expireIfStale(doc: AuditDoc): Promise<AuditDoc> {
  if (doc.status !== 'running') return doc;
  const lastBeat = new Date(doc.heartbeatAt ?? doc.updatedAt ?? doc.createdAt ?? Date.now()).getTime();
  if (Date.now() - lastBeat < STALE_AFTER_MS || isAuditActive(String(doc._id))) return doc;

  await Audit.updateOne(
    { _id: doc._id, status: 'running' },
    {
      $set: {
        status: 'failed',
        errorMessage: INTERRUPTED_MESSAGE,
        internalError: `stale: no heartbeat since ${new Date(lastBeat).toISOString()}`,
        progress: { stage: 'failed', total: 0, done: 0, byPlatform: {} },
        completedAt: new Date(),
      },
    }
  );
  return { ...doc, status: 'failed', errorMessage: INTERRUPTED_MESSAGE };
}

/** "axel@talivity.com" → "a•••@talivity.com" */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 1) return null;
  const user = email.slice(0, at);
  return `${user[0]}${'•'.repeat(Math.min(Math.max(user.length - 1, 2), 6))}${email.slice(at)}`;
}
