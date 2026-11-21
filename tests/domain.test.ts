import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heuristicCompanyName, parseCompanyUrl } from '../lib/domain';

test('registrable domain ignores careers/jobs/www subdomains', () => {
  assert.equal(parseCompanyUrl('careers.walmart.com')?.registrableDomain, 'walmart.com');
  assert.equal(parseCompanyUrl('https://jobs.target.com/search?utm=x')?.registrableDomain, 'target.com');
  assert.equal(parseCompanyUrl('www.kp.org')?.registrableDomain, 'kp.org');
  assert.equal(parseCompanyUrl('WWW.Example.COM')?.hostname, 'example.com');
});

test('handles multi-part public suffixes', () => {
  const d = parseCompanyUrl('careers.tesco.co.uk');
  assert.equal(d?.registrableDomain, 'tesco.co.uk');
  assert.equal(d?.label, 'tesco');
});

test('label comes from the registrable domain, not the first hostname label', () => {
  // Old code named this company "Careers".
  assert.equal(parseCompanyUrl('careers.walmart.com')?.label, 'walmart');
});

test('normalised URL drops query string and hash', () => {
  assert.equal(parseCompanyUrl('https://walmart.com/careers/?utm_source=x#top')?.url, 'https://walmart.com/careers');
  assert.equal(parseCompanyUrl('walmart.com')?.url, 'https://walmart.com');
});

test('rejects things that are not company websites', () => {
  for (const bad of ['', 'walmart', 'localhost:3000', '192.168.0.1', 'javascript:alert(1)', 'ftp://x.com', 'a b.com', 'http://user:pw@x.com']) {
    assert.equal(parseCompanyUrl(bad), null, bad);
  }
});

test('heuristic names', () => {
  assert.equal(heuristicCompanyName('kp'), 'KP');
  assert.equal(heuristicCompanyName('walmart'), 'Walmart');
  assert.equal(heuristicCompanyName('chick-fil-a'), 'Chick Fil A');
});
