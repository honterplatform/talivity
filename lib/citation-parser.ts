import type { CompetitorGroup } from './query-templates';
import { escapeRegex, normalizeText } from './text';

export type SourceKey =
  | 'ownSite'
  | 'glassdoor'
  | 'indeed'
  | 'reddit'
  | 'linkedin'
  | 'wikipedia'
  | 'news'
  | 'other';

export const SOURCE_KEYS: SourceKey[] = ['ownSite', 'glassdoor', 'indeed', 'reddit', 'linkedin', 'wikipedia', 'news', 'other'];

export const THIRD_PARTY_KEYS: Exclude<SourceKey, 'ownSite'>[] = [
  'glassdoor',
  'indeed',
  'reddit',
  'linkedin',
  'wikipedia',
  'news',
  'other',
];

export const SOURCE_LABELS: Record<SourceKey, string> = {
  ownSite: 'Company site',
  glassdoor: 'Glassdoor',
  indeed: 'Indeed',
  reddit: 'Reddit',
  linkedin: 'LinkedIn',
  wikipedia: 'Wikipedia',
  news: 'News outlets',
  other: 'Other third-party',
};

export function emptySourceMix(): Record<SourceKey, number> {
  return { ownSite: 0, glassdoor: 0, indeed: 0, reddit: 0, linkedin: 0, wikipedia: 0, news: 0, other: 0 };
}

// News outlets. Names that are also ordinary words are matched case-sensitively
// and with guards: "Fortune 500" is a list, not coverage; "on the verge of" is
// not The Verge.
const NEWS_PATTERNS: RegExp[] = [
  /\bBloomberg\b/,
  /\bReuters\b/i,
  /\bNew York Times\b|\bNYT\b|\bnytimes\.com\b/i,
  /\bWall Street Journal\b|\bWSJ\b/,
  /\bForbes\b/,
  /\bCNBC\b/,
  /\bCNN\b/,
  /\bBBC\b/,
  /\bBusiness Insider\b/i,
  /\bFortune\b(?!\s*(?:Global\s*)?\d)/,
  /\bFast Company\b/,
  /\bWired\b/,
  /\bTechCrunch\b/i,
  /\bThe Verge\b/,
  /\bAxios\b/,
  /\bAssociated Press\b|\bAP News\b/,
  /\bUSA Today\b/i,
  /\bWashington Post\b/i,
  /\bThe Guardian\b/,
  /\bFinancial Times\b|\bft\.com\b/,
  /\bLos Angeles Times\b|\bLA Times\b/,
  /\bU\.?S\.? News\b/,
  /\bModern Healthcare\b|\bBecker'?s\b|\bFierce Healthcare\b/,
  /\b(?:news|press|media) (?:coverage|reports?|articles?|outlets?|stories|investigations?)\b/i,
];

// Named third-party sources that don't have their own bucket.
const OTHER_NAMED_PATTERNS: RegExp[] = [
  /\bComparably\b/i,
  /\bPayScale\b/i,
  /\bLevels\.fyi\b/i,
  /\bBuilt In\b/,
  /\bGreat Place to Work\b/i,
  /\bTeam\s?Blind\b|\b(?:on|from|via) Blind\b|\bBlind (?:app|users?|posts?|threads?)\b/,
  /\bKununu\b/i,
  /\bFishbowl\b/,
  /\bZipRecruiter\b/i,
  /\bMonster\.com\b|\bMonster (?:reviews?|jobs)\b/,
  /\bThe Muse\b/,
  /\bFairygodboss\b/i,
  /\bSalary\.com\b/i,
  /\bCareerBliss\b/i,
  /\bSimplyHired\b/i,
  /\bTrustpilot\b/i,
  /\bBetter Business Bureau\b|\bBBB\b/,
  /\bVault\b(?= (?:rankings?|reviews?|guides?))/,
];

const GENERIC_ATTRIBUTION =
  /\b(?:according to|reports (?:indicate|suggest|show)|sources (?:say|indicate)|reviews (?:indicate|suggest|mention|often mention|frequently mention|note)|reviewers (?:note|mention|say|report)|employees (?:report|say|mention|describe|often cite|frequently cite|note)|employee reviews|online reviews)\b/i;

/**
 * "Indeed" the job site vs "indeed" the adverb. Lower-case is always the word.
 * Capitalised at the start of a sentence ("Indeed, many employees…") it's the
 * word too — unless followed by something site-like ("Indeed reviews…").
 */
function mentionsIndeed(text: string): boolean {
  if (/\bindeed\.com\b/i.test(text)) return true;
  const re = /\bIndeed\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 8), m.index);
    const after = text.slice(m.index + 6, m.index + 48);
    const atSentenceStart = m.index === 0 || /(?:[.!?:]\s+|\n\s*(?:[-*•]\s*)?|^\s*)$/.test(before);
    const siteLike =
      /^\s*(?:'s\s+)?(?:reviews?|ratings?|users?|reviewers?|data|reports?|shows?|lists?|postings?|jobs|salary|salaries|profiles?|pages?|scores?|surveys?|employees)\b/i.test(after) ||
      /^\s*(?:and|or|&|\/)\s+[A-Z]/.test(after); // "Indeed and Glassdoor reviews…"
    if (!atSentenceStart || siteLike) return true;
  }
  return false;
}

const NOT_RECOGNIZED_PATTERNS: RegExp[] = [
  /\bI (?:don't|do not) have (?:any |much |enough |specific |reliable |detailed |verified |verifiable |current |up-to-date |concrete |solid |trustworthy |accurate |firsthand |direct )*(?:information|details|data|knowledge|insights?)\b/i,
  /\bI(?:'m| am) not (?:familiar with|aware of)\b/i,
  /\bI (?:don't|do not) (?:recognize|know (?:of|about|much about|anything about))\b/i,
  /\bI (?:cannot|can't|couldn't|could not|wasn't able to|was not able to|am unable to|'m unable to) (?:find|locate|verify|confirm) (?:any |specific |reliable |verified )*(?:information|details|data)\b/i,
  /\bI have no (?:specific |reliable |verified |detailed )*(?:information|knowledge|data|details)\b/i,
  /\bunable to (?:locate|find|verify) (?:any |specific |reliable )*information\b/i,
  /\bno (?:public|publicly available|reliable|verified) information\b/i,
  /\b(?:this|the) (?:company|organization|employer) (?:does not|doesn't) appear\b/i,
  /\b(?:isn't|is not) (?:a )?(?:well[- ]known|widely known|widely covered)\b/i,
  /\b(?:beyond|outside(?: of)?) my (?:knowledge|training data)\b/i,
];

/**
 * Regex fallback for "the assistant doesn't know this company". Used only when
 * the LLM analysis step fails. A hedge in the opening sentences counts; a hedge
 * followed by "but…" and real content doesn't ("I don't have specific data on
 * nurse ratios, but…" is a model that knows the company).
 */
export function looksUnrecognized(response: string): boolean {
  const text = normalizeText(response).trim();
  if (!text) return true;
  const lead = text.slice(0, 260);
  const leadHedge = NOT_RECOGNIZED_PATTERNS.some((re) => re.test(lead));
  if (leadHedge) {
    const pivots = /\b(?:but|however|that said|although|though)\b/i.test(lead);
    return !(pivots && text.length > 600);
  }
  return text.length < 500 && NOT_RECOGNIZED_PATTERNS.some((re) => re.test(text));
}

export interface ParsedCitations {
  sourceMix: Record<SourceKey, number>;
  competitorMentions: Record<string, number>;
  ownSiteMentioned: boolean;
  primarySource: SourceKey | null;
}

export interface CitationContext {
  companyName: string;
  aliases?: string[];
  /** e.g. "walmart.com" — matches walmart.com, careers.walmart.com, … */
  registrableDomain?: string | null;
  competitors: CompetitorGroup[];
}

function namePattern(names: string[]): string | null {
  const variants = Array.from(
    new Set(
      names
        .map((n) => normalizeText(n).trim())
        .filter((n) => n.length >= 2)
        .map((n) => escapeRegex(n).replace(/\s+/g, '\\s+'))
    )
  ).sort((a, b) => b.length - a.length);
  return variants.length ? `(?:${variants.join('|')})` : null;
}

function buildOwnSitePatterns(ctx: CitationContext): RegExp[] {
  const patterns: RegExp[] = [];

  if (ctx.registrableDomain) {
    patterns.push(new RegExp(`(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*${escapeRegex(ctx.registrableDomain)}(?![a-z0-9-])`, 'i'));
  }

  const N = namePattern([ctx.companyName, ...(ctx.aliases ?? [])]);
  const owned = `(?:own\\s+|official\\s+|corporate\\s+)?`;
  if (N) {
    // "Walmart's careers site", "Kaiser Permanente careers page", "Acme's official jobs portal"
    patterns.push(
      new RegExp(
        `(?<![A-Za-z0-9])${N}(?:'s|s')?\\s+${owned}(?:careers?|jobs?|employment|recruiting|hiring)\\s+(?:site|page|portal|website|web\\s*site|center|hub)\\b`,
        'i'
      )
    );
    // "Walmart's website", "Walmart's newsroom", "Walmart's annual report".
    // Plain "site" is excluded on purpose: "Walmart's site in Bentonville" is a building.
    patterns.push(
      new RegExp(
        `(?<![A-Za-z0-9])${N}(?:'s|s')\\s+${owned}(?:website|web\\s*site|newsroom|blog|press\\s+releases?|annual\\s+report|(?:impact|sustainability|esg|corporate\\s+responsibility)\\s+report)\\b`,
        'i'
      )
    );
    // "according to Walmart's own …", "based on Walmart materials"
    patterns.push(
      new RegExp(
        `\\b(?:according\\s+to|per|based\\s+on|as\\s+stated\\s+(?:on|in|by)|as\\s+listed\\s+on)\\s+(?:the\\s+)?${N}(?:'s)?\\s+(?:own|official|website|site|careers?|jobs?|materials|communications|statements?|disclosures?|filings?)\\b`,
        'i'
      )
    );
  }

  // "their careers page", "the company's official website"
  patterns.push(
    /\b(?:the\s+company's|their|its)\s+(?:own\s+|official\s+|corporate\s+)?(?:careers?\s+(?:site|page|portal|website)|jobs?\s+(?:site|page|portal|board)|hiring\s+page|website|web\s*site|newsroom)\b/i
  );

  return patterns;
}

function buildCompetitorMatchers(ctx: CitationContext): { name: string; re: RegExp }[] {
  return ctx.competitors
    .map((group) => {
      const p = namePattern([group.name, ...(group.aliases ?? [])]);
      // Case-sensitive on purpose: brand names are capitalised; "target",
      // "subway", "ascension" as ordinary words are not.
      return p ? { name: group.name, re: new RegExp(`(?<![A-Za-z0-9])${p}(?![A-Za-z0-9])`) } : null;
    })
    .filter((m): m is { name: string; re: RegExp } => m !== null);
}

/**
 * Compile the matchers once per audit, then parse each response.
 * Every source/competitor counts at most once per response — these are
 * signals ("this answer leaned on Glassdoor"), not word frequencies.
 */
export function createCitationParser(ctx: CitationContext) {
  const ownSitePatterns = buildOwnSitePatterns(ctx);
  const competitorMatchers = buildCompetitorMatchers(ctx);

  return function parse(response: string): ParsedCitations {
    const text = normalizeText(response);
    const sourceMix = emptySourceMix();

    const ownSiteHit = ownSitePatterns.some((re) => re.test(text));
    if (ownSiteHit) sourceMix.ownSite = 1;

    if (/\bglassdoor\b/i.test(text)) sourceMix.glassdoor = 1;
    if (mentionsIndeed(text)) sourceMix.indeed = 1;
    if (/\breddit\b|(?<![a-z0-9])r\/[A-Za-z0-9_]{2,}/i.test(text)) sourceMix.reddit = 1;
    if (/\blinked\s?in\b/i.test(text)) sourceMix.linkedin = 1;
    if (/\bwikipedia\b/i.test(text)) sourceMix.wikipedia = 1;
    if (NEWS_PATTERNS.some((re) => re.test(text))) sourceMix.news = 1;

    const namedThirdParty =
      sourceMix.glassdoor + sourceMix.indeed + sourceMix.reddit + sourceMix.linkedin + sourceMix.wikipedia + sourceMix.news > 0;
    if (OTHER_NAMED_PATTERNS.some((re) => re.test(text))) {
      sourceMix.other = 1;
    } else if (!ownSiteHit && !namedThirdParty && GENERIC_ATTRIBUTION.test(text)) {
      // Attributed to "reviews"/"employees" without naming a source.
      sourceMix.other = 1;
    }

    const competitorMentions: Record<string, number> = {};
    for (const { name, re } of competitorMatchers) {
      if (re.test(text)) competitorMentions[name] = 1;
    }

    return {
      sourceMix,
      competitorMentions,
      ownSiteMentioned: ownSiteHit,
      primarySource: pickPrimarySource(sourceMix),
    };
  };
}

export function parseResponseCitations(response: string, ctx: CitationContext): ParsedCitations {
  return createCitationParser(ctx)(response);
}

function pickPrimarySource(sourceMix: Record<SourceKey, number>): SourceKey | null {
  // Ties resolve in this order (owned first).
  const order: SourceKey[] = ['ownSite', 'glassdoor', 'indeed', 'reddit', 'linkedin', 'news', 'wikipedia', 'other'];
  let best: SourceKey | null = null;
  let bestN = 0;
  for (const key of order) {
    if (sourceMix[key] > bestN) {
      best = key;
      bestN = sourceMix[key];
    }
  }
  return best;
}

export function mergeSourceMixes(mixes: Record<SourceKey, number>[]): Record<SourceKey, number> {
  const out = emptySourceMix();
  for (const mix of mixes) {
    for (const k of SOURCE_KEYS) out[k] += mix[k] ?? 0;
  }
  return out;
}

export function mergeCompetitorMentions(mentionsList: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mentions of mentionsList) {
    for (const [k, v] of Object.entries(mentions)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
