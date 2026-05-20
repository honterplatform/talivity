import { COMPETITORS_BY_INDUSTRY, type Industry } from './query-templates';

export type SourceKey =
  | 'ownSite'
  | 'glassdoor'
  | 'indeed'
  | 'reddit'
  | 'linkedin'
  | 'wikipedia'
  | 'news'
  | 'other';

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

const NEWS_OUTLETS = [
  'bloomberg',
  'reuters',
  'new york times',
  'nyt',
  'wall street journal',
  'wsj',
  'forbes',
  'cnbc',
  'cnn',
  'bbc',
  'business insider',
  'fortune',
  'fast company',
  'wired',
  'techcrunch',
  'the verge',
  'axios',
  'associated press',
  'ap news',
  'usa today',
  'washington post',
  'guardian',
  'financial times',
  'ft.com',
];

const OWN_SITE_PATTERNS = (company: string): RegExp[] => {
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  const looseSlug = company.toLowerCase().replace(/[^a-z0-9]/g, '.?');
  return [
    new RegExp(`careers?\\.${looseSlug}\\.com`, 'i'),
    new RegExp(`jobs?\\.${looseSlug}\\.com`, 'i'),
    new RegExp(`${looseSlug}\\.com/careers?`, 'i'),
    new RegExp(`${looseSlug}\\.com/jobs?`, 'i'),
    new RegExp(`\\b${slug}\\b.{0,40}(career|careers|website|own site|company site|hiring page|jobs page)`, 'i'),
    new RegExp(`(their|its|the company's)\\s+(career site|careers page|website|hiring page|jobs page)`, 'i'),
    new RegExp(`(according to|based on)\\s+${slug}'s?\\s+(own|website|site|career|careers|materials|communications)`, 'i'),
  ];
};

const NOT_RECOGNIZED_PATTERNS: RegExp[] = [
  /i (don't|do not) have (specific|any|enough|much|reliable) information/i,
  /i('m| am) not familiar with/i,
  /i (don't|do not) (recognize|know of)/i,
  /i (cannot|can't) find (specific|reliable) information/i,
  /i (don't|do not) have detailed information/i,
  /unable to (locate|find) (any |specific )?information/i,
  /no (public|reliable) information (is )?available/i,
  /(this|the) (company|organization) (does not appear|isn't well-known|is not well-known)/i,
  /i (don't|do not) have data/i,
];

export interface ParsedCitations {
  sourceMix: Record<SourceKey, number>;
  competitorMentions: Record<string, number>;
  ownSiteMentioned: boolean;
  primarySource: SourceKey | null;
}

function countMatches(text: string, needles: string[]): number {
  let n = 0;
  const lower = text.toLowerCase();
  for (const needle of needles) {
    let idx = lower.indexOf(needle);
    while (idx !== -1) {
      n++;
      idx = lower.indexOf(needle, idx + needle.length);
    }
  }
  return n;
}

export function parseResponseCitations(
  response: string,
  company: string,
  industry: Industry
): ParsedCitations {
  const lower = response.toLowerCase();
  const sourceMix: Record<SourceKey, number> = {
    ownSite: 0,
    glassdoor: 0,
    indeed: 0,
    reddit: 0,
    linkedin: 0,
    wikipedia: 0,
    news: 0,
    other: 0,
  };

  // Own site detection
  const ownSitePatterns = OWN_SITE_PATTERNS(company);
  const ownSiteHit = ownSitePatterns.some((re) => re.test(response));
  if (ownSiteHit) sourceMix.ownSite += 1;

  // Third-party platforms (count once per response — these are signals, not raw frequencies)
  if (/\bglassdoor\b/i.test(response)) sourceMix.glassdoor += 1;
  if (/\bindeed\b/i.test(response)) sourceMix.indeed += 1;
  if (/\breddit\b/i.test(response)) sourceMix.reddit += 1;
  if (/\blinkedin\b/i.test(response)) sourceMix.linkedin += 1;
  if (/\bwikipedia\b/i.test(response)) sourceMix.wikipedia += 1;
  if (countMatches(lower, NEWS_OUTLETS) > 0) sourceMix.news += 1;

  // Generic "third-party" framing if response cites something not in the above buckets
  if (
    /(according to|reports indicate|reports suggest|sources say|reviews indicate|reviewers note|employees report)/i.test(
      response
    ) &&
    !ownSiteHit &&
    sourceMix.glassdoor === 0 &&
    sourceMix.indeed === 0 &&
    sourceMix.reddit === 0 &&
    sourceMix.linkedin === 0 &&
    sourceMix.wikipedia === 0 &&
    sourceMix.news === 0
  ) {
    sourceMix.other += 1;
  }

  // Competitors
  const competitors = COMPETITORS_BY_INDUSTRY[industry] ?? [];
  const competitorMentions: Record<string, number> = {};
  for (const competitor of competitors) {
    if (competitor.toLowerCase() === company.toLowerCase()) continue;
    const re = new RegExp(`\\b${escapeRegex(competitor)}\\b`, 'i');
    if (re.test(response)) {
      competitorMentions[competitor] = (competitorMentions[competitor] ?? 0) + 1;
    }
  }

  // Primary source = the source bucket with the highest count (ties → owned wins)
  const primarySource = pickPrimarySource(sourceMix);

  return {
    sourceMix,
    competitorMentions,
    ownSiteMentioned: ownSiteHit,
    primarySource,
  };
}

function pickPrimarySource(sourceMix: Record<SourceKey, number>): SourceKey | null {
  const order: SourceKey[] = [
    'ownSite',
    'glassdoor',
    'indeed',
    'reddit',
    'linkedin',
    'news',
    'wikipedia',
    'other',
  ];
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

export function isNotRecognized(response: string): boolean {
  return NOT_RECOGNIZED_PATTERNS.some((re) => re.test(response));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mergeSourceMixes(mixes: Record<SourceKey, number>[]): Record<SourceKey, number> {
  const out: Record<SourceKey, number> = {
    ownSite: 0,
    glassdoor: 0,
    indeed: 0,
    reddit: 0,
    linkedin: 0,
    wikipedia: 0,
    news: 0,
    other: 0,
  };
  for (const mix of mixes) {
    (Object.keys(out) as SourceKey[]).forEach((k) => {
      out[k] += mix[k] ?? 0;
    });
  }
  return out;
}

export function mergeCompetitorMentions(mentionsList: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mentions of mentionsList) {
    for (const [k, v] of Object.entries(mentions)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}
