/** 0.7.2 item 13: feedback names the verdict's commit and HEAD, and drafts no defect from a missing setting. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propose } from '../plugin/src/feedback/feedback.mts';
import type { Verdict } from '../plugin/src/shared/models.mts';

const verdict = (error: string): Verdict => ({
  result: 'fail',
  head: 'abcdef0123456789',
  planId: 'p1',
  reasons: [],
  warnings: [],
  results: [{ testCaseId: 1, status: 'failed', durationS: 1, error, testIds: [], evidence: [] }],
});
const input = (v: Verdict, headNow?: string) => ({
  verdict: v,
  plan: null,
  runs: [],
  ledger: new Map<string, number>(),
  screens: null,
  ...(headNow ? { headNow } : {}),
});

test('a verdict commit that is not HEAD is a warning naming both', () => {
  const fb = propose(input(verdict('E boom'), '1234567890abcdef'));
  const note = fb.notes.find((n) => /abcdef01/.test(n));
  assert.ok(note, fb.notes.join('\n'));
  assert.match(note, /12345678/);
  assert.match(note, /HEAD/);
  assert.ok(fb.notes.some((n) => /differ|isn't|not/i.test(n)));
});

test('a verdict for HEAD says only the commit; no HEAD known says nothing about a mismatch', () => {
  assert.ok(
    !propose(input(verdict('E boom'), 'abcdef0123456789')).notes.some((n) => /HEAD/.test(n) && /not|differ/.test(n)),
  );
  assert.ok(!propose(input(verdict('E boom'))).notes.some((n) => /HEAD/.test(n)));
});

test('an error that names a missing setting makes no defect draft and says what to do', () => {
  const fb = propose(input(verdict('Error: Set TODO_USER in .env and run again')));
  assert.equal(fb.defects.length, 0);
  assert.ok(fb.notes.some((n) => /TC1/.test(n) && /setting/i.test(n) && /TODO_USER|\.env/.test(n)));
  assert.equal(propose(input(verdict('E assert 1 == 2'))).defects.length, 1);
});
