import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCitationParser, looksUnrecognized } from '../lib/citation-parser';
import { COMPETITORS_BY_INDUSTRY } from '../lib/query-templates';
import { sanitizeCompetitors } from '../lib/company-profile';

const walmart = createCitationParser({
  companyName: 'Walmart',
  aliases: [],
  registrableDomain: 'walmart.com',
  competitors: [{ name: 'Target' }, { name: 'Costco' }, { name: 'Amazon' }],
});

test('"indeed" the adverb is not an Indeed citation', () => {
  assert.equal(walmart('Walmart is indeed a large employer.').sourceMix.indeed, 0);
  assert.equal(walmart('Indeed, many employees mention long hours.').sourceMix.indeed, 0);
});

test('Indeed the job site is', () => {
  assert.equal(walmart('Reviews on Glassdoor and Indeed mention long hours.').sourceMix.indeed, 1);
  assert.equal(walmart('Indeed reviews mention scheduling issues.').sourceMix.indeed, 1);
  assert.equal(walmart('Indeed and Glassdoor reviews are mixed.').sourceMix.indeed, 1);
  assert.equal(walmart('See indeed.com for salaries.').sourceMix.indeed, 1);
});

test('"Fortune 500" and "on the verge of" are not news citations', () => {
  assert.equal(walmart('Walmart is a Fortune 500 company on the verge of expanding.').sourceMix.news, 0);
  assert.equal(walmart("Fortune's list of best workplaces ranked it highly.").sourceMix.news, 1);
  assert.equal(walmart('Based on news coverage, pay has risen.').sourceMix.news, 1);
});

test('own-site: career talk is not a citation, pointing to the site is', () => {
  // Old pattern counted any "Walmart … career" within 40 chars as an owned citation.
  assert.equal(walmart('Walmart offers career advancement opportunities.').sourceMix.ownSite, 0);
  assert.equal(walmart("Walmart's site in Bentonville is its headquarters.").sourceMix.ownSite, 0);
  assert.equal(walmart("According to Walmart's careers site, benefits start day one.").sourceMix.ownSite, 1);
  assert.equal(walmart('You can apply at careers.walmart.com.').sourceMix.ownSite, 1);
  assert.equal(walmart('Check their careers page for openings.').sourceMix.ownSite, 1);
});

test('curly apostrophes match the same as straight ones', () => {
  assert.equal(walmart('According to Walmart’s careers site, benefits start day one.').sourceMix.ownSite, 1);
});

test('competitors match case-sensitively and count once per answer', () => {
  assert.deepEqual(walmart('Employees often target better pay elsewhere.').competitorMentions, {});
  assert.deepEqual(walmart('Compared with Target and Costco, Target pays slightly more.').competitorMentions, {
    Target: 1,
    Costco: 1,
  });
});

test('aliases collapse to one competitor', () => {
  const p = createCitationParser({
    companyName: 'Sutter Health',
    registrableDomain: 'sutterhealth.org',
    competitors: COMPETITORS_BY_INDUSTRY.Healthcare,
  });
  // Old lists counted this as both "Kaiser Permanente" and "Kaiser".
  assert.deepEqual(p('Kaiser Permanente pays more, and Kaiser has stronger unions.').competitorMentions, {
    'Kaiser Permanente': 1,
  });
});

test('the audited company is never its own competitor', () => {
  const groups = sanitizeCompetitors(COMPETITORS_BY_INDUSTRY.Healthcare, ['Kaiser Permanente', 'KP', 'kaiserpermanente']);
  assert.ok(!groups.some((g) => g.name.startsWith('Kaiser')), JSON.stringify(groups));
  // Short names only match exactly: auditing GE must not remove General Motors.
  const mfg = sanitizeCompetitors(COMPETITORS_BY_INDUSTRY.Manufacturing, ['GE']);
  assert.ok(mfg.some((g) => g.name === 'General Motors'));
  assert.ok(!mfg.some((g) => g.name === 'GE'));
});

// Real answers captured from claude-haiku-5-5 / claude-haiku-4-5 during testing.
const UNKNOWN_COMPANY =
  "I don't have reliable information about Brightloom Widgets. I can't browse the website you provided, and I don't have any verified details about this company's workplace, culture, benefits, or employee reviews from sources like Glassdoor, Indeed, or news coverage. I'd rather not guess, since any specifics I offered would likely be invented.\n\nHere are some ways to find out what it's really like to work there:\n\n- **Employee reviews:** Check Glassdoor, Indeed, and Comparably, and look for patterns across many reviews rather than relying on a few extreme ones.\n- **The company website:** Look at the careers or \"about\" pages.";
const KNOWN_COMPANY =
  "I have general knowledge about Kaiser Permanente as a large integrated healthcare system, but I should be honest about the limitations of what I can reliably tell you about the specific experience of working there as a nurse.\n\nWhat I can say with confidence:\n- Kaiser Permanente is a major integrated healthcare organization operating in multiple states\n- They employ nurses across various settings (hospitals, clinics, urgent care, etc.)\n\nHowever, I don't have reliable, detailed information about current working conditions or staffing levels.";

test('not-recognized fallback: long "I don\'t know them, but here is generic advice" is unrecognized', () => {
  assert.equal(looksUnrecognized(UNKNOWN_COMPANY), true);
  assert.equal(looksUnrecognized('I don’t have reliable information about this company.'), true);
});

test('not-recognized fallback: partial hedges from a model that knows the company are recognized', () => {
  assert.equal(looksUnrecognized(KNOWN_COMPANY), false);
  const pivot =
    "I don't have specific data on Kaiser Permanente's nurse ratios, but here's what is widely reported. " + 'x'.repeat(600);
  assert.equal(looksUnrecognized(pivot), false);
});

test('merged competitor lists drop overlapping entries', () => {
  const merged = sanitizeCompetitors(
    [{ name: 'Providence' }, { name: 'Sutter Health', aliases: ['Sutter'] }, { name: 'The Home Depot' }, ...COMPETITORS_BY_INDUSTRY.Healthcare],
    ['Kaiser Permanente', 'Kaiser', 'KP']
  );
  const names = merged.map((g) => g.name);
  assert.ok(names.includes('Providence') && !names.includes('Providence Health'), names.join(', '));
  assert.ok(names.includes('Mayo Clinic'));
  assert.ok(!names.some((n) => n.startsWith('Kaiser')));
  // "The Home Depot" also matches plain "Home Depot".
  const p = createCitationParser({ companyName: 'Lowe\'s', competitors: merged });
  assert.deepEqual(p('Home Depot pays a bit more.').competitorMentions, { 'The Home Depot': 1 });
});
