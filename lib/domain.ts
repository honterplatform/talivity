/**
 * URL / domain helpers.
 *
 * People paste all kinds of things into the "company website" field:
 * `walmart.com`, `https://careers.walmart.com/jobs?utm=…`, `www.kp.org`,
 * `tesco.co.uk`. We need the *registrable* domain (walmart.com, tesco.co.uk)
 * both to name the company and to recognise when an AI answer points at the
 * company's own site.
 */

// Common two-part public suffixes. Not the full Public Suffix List, but covers
// the markets this tool realistically sees.
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk', 'nhs.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'ac.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.mx', 'org.mx', 'gob.mx',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'co.za', 'org.za', 'gov.za',
  'com.sg', 'edu.sg', 'gov.sg',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'com.hk', 'org.hk', 'com.tw', 'org.tw',
  'co.kr', 'or.kr',
  'co.il', 'org.il', 'ac.il',
  'co.id', 'or.id', 'ac.id',
  'com.ar', 'com.co', 'com.pe', 'com.tr', 'com.my', 'com.ph', 'com.vn', 'com.pk',
  'com.ng', 'com.eg', 'com.sa', 'com.es', 'com.pl', 'co.at', 'or.at', 'co.th', 'in.th',
]);

export interface DomainInfo {
  /** Normalised URL: protocol + host + path, no query string or hash. */
  url: string;
  /** Hostname without a leading `www.` — e.g. `careers.walmart.com`. */
  hostname: string;
  /** Registrable domain — e.g. `walmart.com`, `tesco.co.uk`. */
  registrableDomain: string;
  /** The brand-ish label of the registrable domain — e.g. `walmart`. */
  label: string;
}

export function parseCompanyUrl(input: string): DomainInfo | null {
  const raw = (input ?? '').trim();
  if (!raw || raw.length > 300 || /\s/.test(raw)) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withProtocol);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;

  const hostname = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\d*\./, '');
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const tld = parts[parts.length - 1];
  // Real TLDs are alphabetic (or punycode). This also rejects bare IP addresses.
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) return null;
  if (parts.some((p) => p.startsWith('-') || p.endsWith('-'))) return null;

  const lastTwo = parts.slice(-2).join('.');
  const regPartCount = MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3 ? 3 : 2;
  const registrableDomain = parts.slice(-regPartCount).join('.');
  const label = parts[parts.length - regPartCount];

  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '');
  return {
    url: `${u.protocol}//${u.host.toLowerCase()}${path}`,
    hostname,
    registrableDomain,
    label,
  };
}

/**
 * Best-effort company name from a domain label, used until (or if) the LLM
 * profile step gives us the real name. `kp` → `KP`, `chick-fil-a` → `Chick Fil A`.
 */
export function heuristicCompanyName(label: string): string {
  const words = label.split(/[-_]+/).filter(Boolean);
  if (!words.length) return 'This company';
  // A lone short label is almost always an acronym (kp.org, ge.com, ibm.com).
  if (words.length === 1 && words[0].length <= 3) return words[0].toUpperCase();
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
