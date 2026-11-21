import { completeJSON, type Platform } from './llm-clients';
import { COMPETITORS_BY_INDUSTRY, INDUSTRIES, type CompetitorGroup, type Industry } from './query-templates';
import { heuristicCompanyName, type DomainInfo } from './domain';
import { normalizeText } from './text';

export interface CompanyProfile {
  name: string;
  /** Short disambiguating phrase, e.g. "the US integrated healthcare system". */
  descriptor: string;
  aliases: string[];
  industry: Industry;
  competitors: CompetitorGroup[];
  /** Whether the model recognised the company; null when we fell back to heuristics. */
  recognized: boolean | null;
  source: 'llm' | 'heuristic';
  via?: Platform;
}

/**
 * Lenient reader for the model's JSON: one odd field (a null, an extra alias)
 * must not throw away the whole profile. Only a missing name is fatal.
 */
interface RawProfile {
  name: string;
  descriptor: string;
  aliases: string[];
  industry: string;
  recognized: boolean | null;
  competitors: CompetitorGroup[];
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function asStringArray(v: unknown, max: number): string[] {
  if (typeof v === 'string') v = [v];
  return Array.isArray(v) ? v.map(asString).filter(Boolean).slice(0, max) : [];
}

function asBool(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 'yes') return true;
  if (v === false || v === 'false' || v === 'no') return false;
  return null;
}

export function readProfile(data: unknown): RawProfile | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const name = asString(d.name).trim();
  if (!name) return null;
  const competitors: CompetitorGroup[] = (Array.isArray(d.competitors) ? d.competitors : [])
    .slice(0, 20)
    .map((c): CompetitorGroup | null => {
      if (typeof c === 'string') return { name: c };
      if (c && typeof c === 'object') {
        const obj = c as Record<string, unknown>;
        const n = asString(obj.name);
        return n ? { name: n, aliases: asStringArray(obj.aliases, 8) } : null;
      }
      return null;
    })
    .filter((c): c is CompetitorGroup => c !== null);
  return {
    name: name.slice(0, 120),
    descriptor: asString(d.descriptor).slice(0, 160),
    aliases: asStringArray(d.aliases, 12),
    industry: asString(d.industry),
    recognized: asBool(d.recognized),
    competitors,
  };
}

const SYSTEM = 'You are a business research assistant. You identify companies from their website and the employers they compete with for talent. Respond with a single JSON object and nothing else.';

function userPrompt(domain: DomainInfo): string {
  return `Website: ${domain.url}
Domain: ${domain.registrableDomain}

Return a JSON object with these fields:
- "name": the company's common brand name, as a job candidate would say it (e.g. "Kaiser Permanente", "JPMorgan Chase", "Chick-fil-A"). If you do not recognize this company, derive a clean, human-readable name from the domain.
- "descriptor": a few words that identify this specific company unambiguously (e.g. "the US integrated healthcare system", "the online bank for startups"). Use "" if you do not recognize the company.
- "aliases": other names or abbreviations people commonly use for it (e.g. ["Kaiser", "KP"]). Use [] if none.
- "industry": exactly one of: ${INDUSTRIES.join(', ')}. Use "General" if none fits well.
- "recognized": true only if you have real knowledge of this specific company; otherwise false.
- "competitors": up to 8 employers that compete with this company for the same candidates (same industry and, where relevant, the same region), most relevant first, as objects like {"name": "Sutter Health", "aliases": ["Sutter"]}. Use [] if you do not recognize the company. Never include the company itself or its subsidiaries.`;
}

/** Lower-case alphanumerics only — for comparing names ("Lowe's" == "lowes"). */
export function nameKey(s: string): string {
  return normalizeText(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function cleanName(s: string): string {
  return normalizeText(s)
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'.,;:-]+|[\s"',;:-]+$/g, '')
    .trim()
    .slice(0, 80);
}

/** True if `candidate` is the company itself under some name or alias. */
export function isSameCompany(candidate: string, selfNames: string[]): boolean {
  const c = nameKey(candidate);
  if (!c) return true;
  return selfNames.some((n) => {
    const k = nameKey(n);
    if (!k) return false;
    if (k === c) return true;
    // Containment ("Kaiser" vs "Kaiser Permanente", "Amazon" vs "Amazon
    // Logistics") — only for names long enough not to collide by accident
    // ("GE" is inside "General Motors").
    const shorter = k.length <= c.length ? k : c;
    const longer = k.length <= c.length ? c : k;
    return shorter.length >= 4 && longer.startsWith(shorter);
  });
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = nameKey(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Remove the audited company (and duplicates) from a competitor list. */
export function sanitizeCompetitors(groups: CompetitorGroup[], selfNames: string[], max = 10): CompetitorGroup[] {
  const out: CompetitorGroup[] = [];
  const seen = new Set<string>();
  const accepted: string[] = [];
  for (const group of groups) {
    const name = cleanName(group.name);
    if (name.length < 2 || isSameCompany(name, selfNames)) continue;
    const key = nameKey(name);
    // Skip duplicates and overlapping entries ("Providence" vs "Providence
    // Health") — otherwise one mention would count for two competitors.
    if (seen.has(key) || isSameCompany(name, accepted)) continue;
    const withoutThe = /^the\s+/i.test(name) ? [name.replace(/^the\s+/i, '')] : [];
    const aliases = dedupeStrings(
      [...(group.aliases ?? []), ...withoutThe].map(cleanName).filter((a) => a.length >= 2 && !isSameCompany(a, selfNames))
    ).filter((a) => nameKey(a) !== key);
    seen.add(key);
    for (const a of aliases) seen.add(nameKey(a));
    accepted.push(name, ...aliases);
    out.push({ name, aliases });
    if (out.length >= max) break;
  }
  return out;
}

function toIndustry(raw: string | undefined): Industry {
  const value = (raw ?? '').trim().toLowerCase();
  const exact = INDUSTRIES.find((i) => i.toLowerCase() === value);
  if (exact) return exact;
  const loose = INDUSTRIES.find((i) => i !== 'General' && value.includes(i.toLowerCase()));
  return loose ?? 'General';
}

export function heuristicProfile(domain: DomainInfo): CompanyProfile {
  return {
    name: heuristicCompanyName(domain.label),
    descriptor: '',
    aliases: [],
    industry: 'General',
    competitors: [],
    recognized: null,
    source: 'heuristic',
  };
}

/**
 * Work out who the company is from its URL: brand name, aliases, industry and
 * talent competitors. One structured LLM call (with provider fallback);
 * heuristics if every provider fails.
 */
export async function profileCompany(domain: DomainInfo): Promise<CompanyProfile> {
  const fallback = heuristicProfile(domain);
  const result = await completeJSON(SYSTEM, userPrompt(domain), { maxTokens: 900, label: 'company-profile' });
  if (!result) return withStaticCompetitors(fallback, domain);

  const raw = readProfile(result.data);
  if (!raw) {
    console.warn('[profile] unusable profile JSON (no name)');
    return withStaticCompetitors(fallback, domain);
  }

  const name = cleanName(raw.name) || fallback.name;
  const aliases = dedupeStrings(
    raw.aliases.map(cleanName).filter((a) => a.length >= 2 && nameKey(a) !== nameKey(name))
  ).slice(0, 8);
  const selfNames = [name, ...aliases, domain.label];
  const industry = toIndustry(raw.industry);
  const groups = raw.competitors;

  const recognized = raw.recognized;
  const profile: CompanyProfile = {
    name,
    descriptor: recognized ? cleanName(raw.descriptor).slice(0, 100) : '',
    aliases,
    industry,
    // Tailored talent competitors first, then the industry's national names
    // (answers often compare against e.g. Mayo Clinic even for a regional system).
    competitors: sanitizeCompetitors([...groups, ...(COMPETITORS_BY_INDUSTRY[industry] ?? [])], selfNames, 16),
    recognized,
    source: 'llm',
    via: result.via,
  };
  return profile.competitors.length ? profile : withStaticCompetitors(profile, domain);
}

/** Fall back to the industry's static list, minus the company itself. */
function withStaticCompetitors(profile: CompanyProfile, domain: DomainInfo): CompanyProfile {
  const selfNames = [profile.name, ...profile.aliases, domain.label];
  return {
    ...profile,
    competitors: sanitizeCompetitors(COMPETITORS_BY_INDUSTRY[profile.industry] ?? [], selfNames, 15),
  };
}
