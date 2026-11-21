import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore } from '../lib/scoring';
import { emptySourceMix } from '../lib/citation-parser';
import { summarizeSentiment } from '../lib/analysis';
import { cleanResponseForDisplay, stripMarkdown, trimToSentence } from '../lib/text';
import { classifyError, extractJSON } from '../lib/llm-clients';

test('score formula and cap', () => {
  const perfect = computeScore({
    sourceMix: { ...emptySourceMix(), ownSite: 10 },
    competitorMentions: {},
    sentiment: 'positive',
  });
  assert.equal(perfect.score, 95); // 50 + 25 + 15 + 10, capped
  const weak = computeScore({
    sourceMix: { ...emptySourceMix(), glassdoor: 9, reddit: 1 },
    competitorMentions: { Target: 12, Costco: 3 },
    sentiment: 'negative',
  });
  assert.deepEqual(weak.breakdown, { ownedRatio: 0, sentiment: 5, competitiveDominance: 5, sourceDiversity: 2 });
  assert.equal(weak.topCompetitor, 'Target');
  assert.equal(weak.competitorCitations, 12);
});

test('sentiment summary uses every answer that knows the company', () => {
  const s = summarizeSentiment([
    { knows: true, sentiment: 'negative' },
    { knows: true, sentiment: 'negative' },
    { knows: true, sentiment: 'mixed' },
    { knows: true, sentiment: 'positive' },
    { knows: false, sentiment: 'neutral' },
  ]);
  assert.equal(s.overall, 'negative'); // net (1 - 2) / 4 = -0.25 → threshold is inclusive
  assert.equal(
    summarizeSentiment([
      { knows: true, sentiment: 'negative' },
      { knows: true, sentiment: 'positive' },
      { knows: true, sentiment: 'mixed' },
    ]).overall,
    'neutral'
  );
  // Answers that don't know the company don't dilute the tone.
  assert.equal(
    summarizeSentiment([{ knows: true, sentiment: 'positive' }, { knows: false, sentiment: 'neutral' }]).overall,
    'positive'
  );
  assert.deepEqual(s.breakdown, { positive: 1, neutral: 0, negative: 2, mixed: 1 });
});

test('markdown is stripped for display', () => {
  assert.equal(stripMarkdown('### Pay\n**Good** pay and *great* [benefits](https://x.com).\n- one\n- two'), 'Pay\nGood pay and great benefits.\n• one\n• two');
});

test('truncated answers end cleanly', () => {
  assert.equal(trimToSentence('Pay is good. Hours are long. Management is'), 'Pay is good. Hours are long.');
  assert.equal(trimToSentence('Pay is good'), 'Pay is good…');
  assert.equal(cleanResponseForDisplay('It’s **fine**.'), "It's fine.");
});

test('JSON extraction tolerates fences and prose', () => {
  assert.deepEqual(extractJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJSON('Sure! {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.equal(extractJSON('no json here'), null);
});

test('error classification: out-of-credits trips the breaker, rate limits do not', () => {
  // Shape of the real OpenAI error returned by this project's key.
  const openaiNoCredits = Object.assign(new Error('429 You have no credits remaining.'), {
    status: 429,
    type: 'insufficient_quota',
    code: 'credit_balance_exhausted',
  });
  assert.equal(classifyError(openaiNoCredits), 'quota');
  assert.equal(
    classifyError(Object.assign(new Error('Your credit balance is too low to access the Anthropic API.'), { status: 400 })),
    'quota'
  );
  // Gemini uses "quota" wording for ordinary per-minute limits — transient.
  assert.equal(
    classifyError(Object.assign(new Error('You exceeded your current quota, please check your plan and billing details.'), { status: 429 })),
    'rate_limit'
  );
  assert.equal(classifyError(Object.assign(new Error('Incorrect API key provided'), { status: 401 })), 'auth');
  assert.equal(classifyError(Object.assign(new Error('Overloaded'), { status: 529 })), 'server');
});

test('param fallback recovers every concurrent call, not just the first (race found in e2e)', async () => {
  const { withParamFallback } = await import('../lib/llm-clients');
  const model = `race-test-${Date.now()}`;
  const fakeCall = async (skip: ReadonlySet<string>) => {
    await new Promise((r) => setTimeout(r, 5));
    if (!skip.has('temperature')) {
      throw Object.assign(new Error('400 `temperature` is deprecated for this model.'), { status: 400 });
    }
    return 'ok';
  };
  const results = await Promise.all([1, 2, 3].map(() => withParamFallback('anthropic', model, ['temperature', 'thinking'], fakeCall)));
  assert.deepEqual(results, ['ok', 'ok', 'ok']);
});

test('prompt context: no URL for recognised companies (it was being echoed back as a citation)', async () => {
  const { buildContext } = await import('../lib/audit-engine');
  const known = buildContext({ companyName: 'Walmart', recognized: true, descriptor: 'the US retailer', registrableDomain: 'walmart.com' });
  assert.equal(known, 'Context: The company is Walmart (the US retailer). Answer the following question about this specific company.');
  assert.ok(!known.includes('walmart.com'));
  const unknown = buildContext({ companyName: 'Brightloom Widgets', recognized: false, registrableDomain: 'brightloomwidgets.io' });
  assert.ok(unknown.includes('(website: brightloomwidgets.io)'));
});

test('helper steps use Claude first by default; HELPER_PROVIDERS overrides', async () => {
  const { helperOrder } = await import('../lib/llm-clients');
  const prev = process.env.HELPER_PROVIDERS;
  delete process.env.HELPER_PROVIDERS;
  assert.deepEqual(helperOrder(), ['anthropic', 'openai', 'gemini']);
  process.env.HELPER_PROVIDERS = 'gemini, anthropic, bogus';
  assert.deepEqual(helperOrder(), ['gemini', 'anthropic', 'openai']);
  if (prev === undefined) delete process.env.HELPER_PROVIDERS;
  else process.env.HELPER_PROVIDERS = prev;
});
