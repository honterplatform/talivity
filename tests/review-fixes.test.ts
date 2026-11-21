import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIp, hashIp } from '../lib/rate-limit';
import { readProfile, sanitizeCompetitors } from '../lib/company-profile';
import { generateQueries } from '../lib/query-templates';

test('IPs: IPv4 ports stripped, mapped IPv4 unwrapped, IPv6 reduced to its /64', () => {
  assert.equal(normalizeIp('203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeIp('203.0.113.7:51234'), '203.0.113.7');
  assert.equal(normalizeIp('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeIp('2001:db8:abcd:12:1:2:3:4'), '2001:db8:abcd:12::/64');
  // Rotating the interface id inside the same /64 lands in the same bucket.
  assert.equal(normalizeIp('2001:db8:abcd:12::99'), normalizeIp('2001:0db8:abcd:0012:ffff::1'));
  assert.equal(normalizeIp('[2001:db8::1]:443'), '2001:db8:0:0::/64');
});

test('IP hashes are keyed (not a plain hash anyone can brute-force)', () => {
  const prev = process.env.IP_HASH_SALT;
  process.env.IP_HASH_SALT = 'secret-a';
  const a = hashIp('203.0.113.7');
  process.env.IP_HASH_SALT = 'secret-b';
  const b = hashIp('203.0.113.7');
  if (prev === undefined) delete process.env.IP_HASH_SALT;
  else process.env.IP_HASH_SALT = prev;
  assert.ok(a && b && a !== b);
});

test('profile JSON is read leniently — one odd field no longer discards it', () => {
  const p = readProfile({
    name: 'Kaiser Permanente',
    descriptor: null,
    aliases: Array.from({ length: 20 }, (_, i) => `Alias ${i}`),
    industry: 'Healthcare',
    recognized: 'true',
    competitors: ['Sutter Health', { name: 'Dignity Health', aliases: null }, null, 42],
  });
  assert.ok(p);
  assert.equal(p.name, 'Kaiser Permanente');
  assert.equal(p.descriptor, '');
  assert.equal(p.aliases.length, 12);
  assert.equal(p.recognized, true);
  assert.deepEqual(
    p.competitors.map((c) => c.name),
    ['Sutter Health', 'Dignity Health']
  );
  assert.equal(readProfile({ name: '' }), null);
  assert.equal(readProfile('nope'), null);
});

test('"$" in a company name is inserted literally', () => {
  const [q] = generateQueries('A$&B Ke$\'ha', 'General');
  assert.equal(q, "What is it like to work at A$&B Ke$'ha?");
});

test('non-Latin competitor names are kept', () => {
  const groups = sanitizeCompetitors([{ name: 'ソニー' }, { name: 'Panasonic' }], ['Toyota']);
  assert.deepEqual(
    groups.map((g) => g.name),
    ['ソニー', 'Panasonic']
  );
});
