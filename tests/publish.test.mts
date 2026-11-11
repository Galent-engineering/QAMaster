/**
 * The publish engine (Q7, Q8, Q9, Q34): loading a reviewed run, deriving tags and links from facts, and the diff against
 * the ledger and the store. Pure functions, so most tests need no files; only loadRun reads a run folder.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  derive,
  diff,
  loadRun,
  type PublishCase,
  type PublishContext,
  suggestSmoke,
} from '../plugin/src/publish/publish.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import type { Item, LedgerEntry } from '../plugin/src/shared/models.mts';
import { runHash } from '../plugin/src/testgen/run.mts';
import { item } from './fakes.mts';
import { tmpDir } from './tmp.mts';

const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);

const DSM = {
  page: {
    nodes: [
      { id: '/', files: ['shop:App.tsx'] },
      { id: '/cart', files: ['shop:src/cart/Cart.tsx', 'shop:src/cart/api/cart.ts', 'shop:src/shared/money.ts'] },
      { id: '/checkout', files: ['shop:src/checkout/Checkout.tsx', 'shop:a/b/c/d/Deep.tsx'] },
      { id: '/lonely', files: [] },
    ],
  },
};

const ctx = (more: Partial<PublishContext> = {}): PublishContext => ({
  scope: { module: 'Checkout', subModule: 'Coupon' },
  dsm: DSM,
  settings: {
    publish: { pathDepth: 3, suiteBy: 'module' },
    smoke: { max: 2, priorities: ['P1'], categories: ['Positive', 'E2E'] },
    owners: {},
  },
  scenarios: new Set<string>(),
  ...more,
});

function kase(id: string, more: Partial<PublishCase> = {}): PublishCase {
  return {
    id,
    title: `Case ${id}`,
    component: 'Checkout',
    category: 'Positive',
    priority: 'P1',
    objective: `Objective of ${id}`,
    preconditions: [],
    test_data: {},
    steps: [
      {
        screen: '/cart',
        action: 'Click Checkout',
        element: 'Checkout',
        leads_to: '/checkout',
        expected: 'The checkout opens',
      },
    ],
    expected_result: 'The order is placed',
    evidence: ['aut:AUT_Shop#Screens'],
    ...more,
  };
}

// ---- loadRun

function run(opts: { validated?: boolean; reviewed?: boolean; owner?: string } = {}) {
  const dir = path.join(tmpDir('qam-publish-'), 'testgen', 'output', '20261030-1200-checkout');
  fs.mkdirSync(dir, { recursive: true });
  const write = (f: string, v: unknown) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v));
  write('manifest.json', { app: 'Shop', scope: { module: 'Checkout', sub_module: 'Coupon' } });
  write('testcases.json', [kase('TC-CHECKOUT-001'), kase('TC-CHECKOUT-002')]);
  const hash = runHash(dir);
  if (opts.validated !== false) {
    write('validation.json', {
      status: 'pass',
      errors: [],
      gaps: [],
      dsm_generated_at: 'D1',
      run_hash: hash,
      validated_at: 'x',
    });
  }
  if (opts.reviewed !== false) write('run.json', { reviewedBy: 'Jo@Example.test', reviewedAt: 'x', run_hash: hash });
  return { dir, write };
}
const open = (dir: string, owners: Record<string, string> = {}) => loadRun(dir, { dsmGeneratedAt: 'D1', owners });

test('loadRun: a run that was never validated is refused, with the command to run', () => {
  assert.throws(
    () => open(run({ validated: false, reviewed: false }).dir),
    blocked(/not validated.*qam testgen validate/s),
  );
});

test('loadRun: a validated run nobody reviewed is refused, and the person must say yes first', () => {
  assert.throws(() => open(run({ reviewed: false }).dir), blocked(/hasn't been reviewed.*qam review/s));
});

test('loadRun: a review stands only for the files the person saw', () => {
  const r = run();
  r.write('testcases.json', [kase('TC-CHECKOUT-001', { title: 'Changed after review' })]);
  assert.throws(() => open(r.dir), blocked(/changed since/));
});

test('loadRun: a DSM rebuilt since validation refuses the run', () => {
  assert.throws(() => loadRun(run().dir, { dsmGeneratedAt: 'D2', owners: {} }), blocked(/DSM was rebuilt/));
});

test('loadRun: returns the cases, the scope and the reviewer; warns, without blocking, when the owner is someone else', () => {
  const r = run();
  const ok = open(r.dir);
  assert.deepEqual(ok.scope, { module: 'Checkout', subModule: 'Coupon' });
  assert.deepEqual(
    ok.cases.map((c) => c.id),
    ['TC-CHECKOUT-001', 'TC-CHECKOUT-002'],
  );
  assert.equal(ok.reviewedBy, 'Jo@Example.test');
  assert.equal(ok.ownerWarning, undefined);
  assert.equal(open(r.dir, { checkout: 'jo@example.test' }).ownerWarning, undefined, 'same person, ignoring case');
  assert.match(
    open(r.dir, { Checkout: 'a.rao@example.test' }).ownerWarning ?? '',
    /Checkout.*a\.rao@example\.test.*Jo@Example\.test/,
  );
});

// ---- derive: tags and links come from facts

test('derive: group tags are the module and module-submodule, as lower-case words', () => {
  const t = derive(kase('TC-1'), ctx()).tags;
  assert.deepEqual(t.slice(0, 2), ['checkout', 'checkout-coupon']);
  assert.deepEqual(derive(kase('TC-1'), ctx({ scope: { module: 'My Cart!', subModule: '' } })).tags[0], 'my-cart');
  assert.equal(
    derive(kase('TC-1'), ctx({ scope: { module: 'Cart', subModule: '' } })).tags.filter((x) => !x.startsWith('path:'))
      .length,
    1,
  );
});

test('derive: path tags are the folders behind the screens a case visits, without the repo name, with a folder inside another dropped', () => {
  const t = derive(kase('TC-1'), ctx()).tags.filter((x) => x.startsWith('path:'));
  // pathDepth 3: a folder at that depth is a glob of its subtree; a shallower folder covers only its own files (Q37)
  assert.deepEqual(t, [
    'path:a/b/c/**',
    'path:src/cart/*',
    'path:src/cart/api/**',
    'path:src/checkout/*',
    'path:src/shared/*',
  ]);
});

// From the 0.2.0 publish walkthrough: app.routing.ts gave path:frontend/src/app/**, which covers the whole app.
test("0.2.1 A4: a file in a folder shallower than pathDepth covers only that folder's files, not its subfolders", () => {
  const c = ctx({
    settings: { ...ctx().settings, publish: { pathDepth: 4, suiteBy: 'module' } },
    dsm: {
      page: {
        nodes: [
          {
            id: '/cart',
            files: [
              'shop:frontend/src/app/app.routing.ts',
              'shop:frontend/src/app/login/login.component.ts',
              'shop:frontend/src/environments/environment.ts',
            ],
          },
        ],
      },
    } as never,
  });
  assert.deepEqual(
    derive(kase('TC-1'), c).tags.filter((x) => x.startsWith('path:')),
    ['path:frontend/src/app/*', 'path:frontend/src/app/login/**', 'path:frontend/src/environments/*'],
  );
});

test('derive: a folder deeper than pathDepth is cut there, and a file at the repo root is the file itself', () => {
  const c = kase('TC-1', { steps: [{ screen: '/', action: 'Open', leads_to: '/checkout', expected: 'It opens' }] });
  const t = derive(c, ctx({ settings: { ...ctx().settings, publish: { pathDepth: 2, suiteBy: 'module' } } })).tags;
  assert.ok(t.includes('path:App.tsx'));
  assert.ok(t.includes('path:a/b/**'));
  assert.ok(!t.some((x) => x.includes('a/b/c')));
});

test('derive: files cited as code evidence count too, and a screen the DSM cannot place gives no tag and is flagged', () => {
  const cited = derive(kase('TC-1', { evidence: ['code:shop:src/rules/coupon.ts:12'] }), ctx());
  assert.ok(cited.tags.includes('path:src/rules/*'));
  const none = derive(
    kase('TC-2', { steps: [{ screen: '/lonely', action: 'Open', expected: 'It opens' }], evidence: [] }),
    ctx(),
  );
  assert.deepEqual(
    none.tags.filter((x) => x.startsWith('path:')),
    [],
  );
  assert.equal(none.notLinked, true);
  assert.equal(derive(kase('TC-3'), ctx()).notLinked, false);
});

test('derive: the automation link is bdd:@<id> only when the suite has that scenario', () => {
  assert.equal(derive(kase('TC-CHECKOUT-001'), ctx()).automatedTest, null);
  assert.equal(
    derive(kase('TC-CHECKOUT-001'), ctx({ scenarios: new Set(['TC-CHECKOUT-001']) })).automatedTest,
    'bdd:@TC-CHECKOUT-001',
  );
});

test('derive: steps keep their wording, the description lists the sources, and the hash follows the content', () => {
  const d = derive(kase('TC-1', { preconditions: ['Signed in'], test_data: { coupon: 'SAVE10' } }), ctx());
  assert.deepEqual(d.steps, [{ action: 'Click Checkout', expected: 'The checkout opens' }]);
  assert.match(d.description, /Objective of TC-1/);
  assert.match(d.description, /Signed in/);
  assert.match(d.description, /coupon = SAVE10/);
  assert.match(d.description, /Expected result: The order is placed/);
  assert.match(d.description, /Sources\n- aut:AUT_Shop#Screens/);
  assert.equal(d.suite, 'Checkout');
  assert.equal(
    derive(kase('TC-1', { preconditions: ['Signed in'], test_data: { coupon: 'SAVE10' } }), ctx()).hash,
    d.hash,
  );
  const changed = derive(
    kase('TC-1', { steps: [{ screen: '/cart', action: 'Click Pay', expected: 'It opens' }] }),
    ctx(),
  );
  assert.notEqual(changed.hash, d.hash);
});

// ---- smoke is suggested, never set

test('smoke: P1 Positive or E2E cases are suggested up to the cap, less what the store already has, and never a declined one', () => {
  const d = [
    derive(kase('A'), ctx()),
    derive(kase('B', { category: 'Negative' }), ctx()),
    derive(kase('C', { category: 'E2E' }), ctx()),
    derive(kase('D', { priority: 'P2' }), ctx()),
    derive(kase('E'), ctx()),
  ];
  const s = ctx().settings;
  assert.deepEqual(suggestSmoke(d, [], 0, s), { ids: ['A', 'C'], total: 2, max: 2, notOffered: 1 });
  assert.deepEqual(suggestSmoke(d, [], 1, s).ids, ['A']);
  assert.deepEqual(suggestSmoke(d, [], 2, s).ids, []);
  assert.equal(suggestSmoke(d, [], 2, s).notOffered, 3, 'a full plan offers none, and says how many it held back');
  const declined = [entry('A', 1, d[0].hash, { smokeDeclined: true })];
  assert.deepEqual(suggestSmoke(d, declined, 0, s).ids, ['C', 'E']);
  assert.equal(derive(kase('A'), ctx()).tags.includes('smoke'), false);
});

// ---- diff

function entry(localId: string, trackerId: number, hash: string, more: Partial<LedgerEntry> = {}): LedgerEntry {
  return { localId, trackerId, hash, ownedTags: [], smokeDeclined: false, publishedAt: 'x', trackerRev: 1, ...more };
}
const show = (...xs: Item[]) => new Map(xs.map((i) => [i.id, i]));
const input = (derived: ReturnType<typeof derive>[], ledger: LedgerEntry[], items: Item[], more = {}) => ({
  derived,
  ledger,
  items: show(...items),
  module: 'Checkout',
  confirmedSmoke: new Set<string>(),
  ...more,
});
const kinds = (r: ReturnType<typeof diff>) => r.changes.map((c) => `${c.kind} ${c.localId}`);

/** What the store holds after publishing `d`. */
function stored(d: ReturnType<typeof derive>, id: number, more: Partial<Item> = {}): Item {
  return item(id, 'test_case', d.title, {
    description: d.description,
    steps: d.steps,
    tags: [...d.tags],
    automatedTest: d.automatedTest,
    suites: [`Shop / ${d.suite}`],
    ...more,
  });
}

test('diff: a case with no ledger entry is created, with its tags, steps, link and suite', () => {
  const d = derive(kase('TC-1'), ctx({ scenarios: new Set(['TC-1']) }));
  const r = diff(input([d], [], []));
  assert.deepEqual(kinds(r), ['create TC-1']);
  const c = r.changes[0];
  assert.deepEqual(c.change?.addTags, d.tags);
  assert.deepEqual(c.change?.steps, d.steps);
  assert.equal(c.change?.automatedTest, 'bdd:@TC-1');
  assert.equal(c.change?.suite, 'Checkout');
  assert.deepEqual(c.ownedTags, d.tags);
  assert.equal(c.hash, d.hash);
});

test('diff: publishing the same run again changes nothing', () => {
  const d = derive(kase('TC-1'), ctx());
  const r = diff(input([d], [entry('TC-1', 7, d.hash, { ownedTags: d.tags })], [stored(d, 7)]));
  assert.deepEqual(kinds(r), ['unchanged TC-1']);
  assert.equal(r.changes[0].change, undefined);
});

test("diff: changed content with the store untouched is an update of only what differs; other people's tags stay", () => {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(
    kase('TC-1', {
      steps: [{ screen: '/cart', action: 'Click Pay', leads_to: '/checkout', expected: 'It opens' }],
      title: 'New title',
    }),
    ctx(),
  );
  const old = entry('TC-1', 7, was.hash, { ownedTags: [...was.tags, 'path:gone/**'] });
  const have = stored(was, 7, { tags: [...was.tags, 'path:gone/**', 'added-by-qa'] });
  const r = diff(input([now], [old], [have]));
  assert.deepEqual(kinds(r), ['update TC-1']);
  const c = r.changes[0];
  assert.deepEqual([...c.fields].sort(), ['steps', 'tags', 'title']);
  assert.equal(c.change?.title, 'New title');
  assert.deepEqual(c.change?.removeTags, ['path:gone/**'], 'a path: tag that is no longer derived is removed');
  assert.ok(!(c.change?.removeTags ?? []).includes('added-by-qa'));
  assert.equal(c.change?.automatedTest, undefined);
});

test('diff (Q56): a republish removes every stored path: tag it no longer derives, hand-added too; no other tag', () => {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(kase('TC-1', { title: 'New title' }), ctx());
  const old = entry('TC-1', 7, was.hash, { ownedTags: [...was.tags, 'smoke', 'path:old/**'] });
  const have = stored(was, 7, {
    tags: [...was.tags, 'smoke', 'path:old/**', 'path:by-hand/**', 'added-by-qa', 'oldgroup'],
  });
  const c = diff(input([now], [old], [have])).changes[0];
  assert.equal(c.kind, 'update');
  assert.deepEqual([...(c.change?.removeTags ?? [])].sort(), ['path:by-hand/**', 'path:old/**']);
  assert.ok(c.fields.includes('tags'));
});

test('diff (Q8, Q56): a group tag QAMaster owned and no longer derives is removed; a hand-added one stays', () => {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(kase('TC-1', { title: 'New title' }), ctx());
  const old = entry('TC-1', 7, was.hash, { ownedTags: [...was.tags, 'oldgroup'] });
  const have = stored(was, 7, { tags: [...was.tags, 'oldgroup', 'added-by-qa'] });
  const c = diff(input([now], [old], [have])).changes[0];
  assert.deepEqual(c.change?.removeTags, ['oldgroup']);
});

test('diff (Q56): a derived path: tag stays; a stored one that is derived again is not removed', () => {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(kase('TC-1', { title: 'New title' }), ctx());
  const have = stored(was, 7);
  const c = diff(input([now], [entry('TC-1', 7, was.hash, { ownedTags: was.tags })], [have])).changes[0];
  assert.equal(c.change?.removeTags, undefined);
});

test('diff: something the person changed in the store since the last publish is a conflict, and nothing is written', () => {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(kase('TC-1', { title: 'Mine' }), ctx());
  const r = diff(input([now], [entry('TC-1', 7, was.hash)], [stored(was, 7, { rev: 3 })]));
  assert.deepEqual(kinds(r), ['conflict TC-1']);
  assert.match(r.changes[0].reason, /7.*rev 1 → 3|changed.*7/);
  assert.equal(r.changes[0].change, undefined);
});

test('diff: a store edit with nothing of ours to write is not a conflict', () => {
  const d = derive(kase('TC-1'), ctx());
  const r = diff(input([d], [entry('TC-1', 7, d.hash)], [stored(d, 7, { rev: 3, title: 'Renamed in the store' })]));
  assert.deepEqual(kinds(r), ['unchanged TC-1']);
});

// 0.6.0 item 11 (K6, K7): a conflict shows its fields, and an edit made only in the store is reported
test('diff K6: a conflict shows each field, the store value beside the run value', () => {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(kase('TC-1', { title: 'Mine' }), ctx());
  const r = diff(input([now], [entry('TC-1', 7, was.hash)], [stored(was, 7, { rev: 3, title: 'Edited by QA' })]));
  assert.deepEqual(kinds(r), ['conflict TC-1']);
  assert.deepEqual(r.changes[0].differences, [{ field: 'title', store: 'Edited by QA', run: 'Mine' }]);
});

test('diff K7: an edit made only in the store is reported with its fields, and still not written', () => {
  const d = derive(kase('TC-1'), ctx());
  const r = diff(input([d], [entry('TC-1', 7, d.hash)], [stored(d, 7, { rev: 3, title: 'Renamed in the store' })]));
  assert.deepEqual(kinds(r), ['unchanged TC-1']);
  assert.equal(r.changes[0].change, undefined);
  assert.deepEqual(r.changes[0].differences, [{ field: 'title', store: 'Renamed in the store', run: d.title }]);
});

test('diff K7: a store with nothing edited reports no differences', () => {
  const d = derive(kase('TC-1'), ctx());
  const r = diff(input([d], [entry('TC-1', 7, d.hash, { ownedTags: d.tags })], [stored(d, 7)]));
  assert.equal(r.changes[0].differences, undefined);
});

test('diff K7: a read-back that differs at the revision we wrote is not reported as a store edit', () => {
  // a store that formats what it was given (ADO's HTML steps, say) reads back differently with nobody editing it
  const d = derive(kase('TC-1'), ctx());
  const r = diff(input([d], [entry('TC-1', 7, d.hash)], [stored(d, 7, { title: 'Reformatted by the store' })]));
  assert.deepEqual(kinds(r), ['unchanged TC-1']);
  assert.equal(r.changes[0].differences, undefined);
});

test('diff: a test case that is gone from the store is reported, never silently created again', () => {
  const d = derive(kase('TC-1'), ctx());
  const r = diff(input([d], [entry('TC-1', 7, d.hash)], []));
  assert.deepEqual(kinds(r), ['conflict TC-1']);
  assert.match(r.changes[0].reason, /7.*(no longer|gone|isn't in)/);
});

test('diff: a case no longer generated is listed for retiring, but only within this module', () => {
  const d = derive(kase('TC-1'), ctx());
  const ledger = [
    entry('TC-1', 7, d.hash, { ownedTags: d.tags }),
    entry('TC-OLD', 8, 'x', { ownedTags: ['checkout', 'checkout-coupon'] }),
    entry('TC-CART-1', 9, 'y', { ownedTags: ['cart'] }),
  ];
  const r = diff(
    input([d], ledger, [
      stored(d, 7),
      item(8, 'test_case', 'Old', { tags: ['checkout'] }),
      item(9, 'test_case', 'Cart'),
    ]),
  );
  assert.deepEqual(kinds(r), ['unchanged TC-1', 'retire TC-OLD']);
  assert.equal(r.changes[1].trackerId, 8);
  assert.match(r.changes[1].reason, /no longer generated.*--retire/);
});

test('diff: confirmed smoke is part of the tags; one QA removed in the store is reported as declined', () => {
  const d = derive(kase('TC-1'), ctx());
  const withSmoke = diff(input([d], [], [], { confirmedSmoke: new Set(['TC-1']) }));
  assert.ok(withSmoke.changes[0].ownedTags.includes('smoke'));
  assert.deepEqual(withSmoke.changes[0].change?.addTags?.slice(-1), ['smoke']);

  const owned = [...d.tags, 'smoke'];
  const removed = stored(d, 7, { rev: 2, tags: d.tags }); // QA took smoke off in the store
  const r = diff(input([d], [entry('TC-1', 7, d.hash, { ownedTags: owned })], [removed]));
  assert.deepEqual(r.declinedSmoke, ['TC-1']);
  assert.deepEqual(kinds(r), ['unchanged TC-1']);
});

// From the 0.2.1 verification (B1): ADO drops blank lines, so every update rewrote the description.
test('0.2.2 B1: a description that differs only in blank lines or trailing spaces is not a change', () => {
  const was = derive(kase('TC-1', { preconditions: ['Signed in'] }), ctx());
  const roundTripped = was.description.replace(/\n{2,}/g, '\n').replace(/\n/g, '  \n');
  const now = derive(kase('TC-1', { preconditions: ['Signed in'], title: 'New title' }), ctx());
  const have = stored(was, 7, { description: roundTripped });
  const r = diff(input([now], [entry('TC-1', 7, was.hash, { ownedTags: was.tags })], [have]));
  assert.deepEqual(r.changes[0].fields, ['title']);
  const reworded = derive(kase('TC-1', { preconditions: ['Signed out'] }), ctx());
  const r2 = diff(input([reworded], [entry('TC-1', 7, was.hash, { ownedTags: was.tags })], [have]));
  assert.deepEqual(r2.changes[0].fields, ['description']);
});

// From the 0.2.1 verification (B4): "- password = Qa-Cust#2026a" went to ADO in the description.
test('0.2.2 B4: credential-like test data is masked in the published description; the rest is kept', () => {
  const d = derive(
    kase('TC-1', {
      test_data: {
        email: 'qa.customer01@example.test',
        password: 'pw',
        otp_secret: 'x',
        note: 'Reg#Pass2026',
        coupon: 'SAVE10',
      },
    }),
    ctx(),
  );
  assert.match(d.description, /- email = qa\.customer01@example\.test/);
  assert.match(d.description, /- coupon = SAVE10/);
  for (const key of ['password', 'otp_secret', 'note'])
    assert.match(d.description, new RegExp(`- ${key} = \\(kept in the run's test data, not published\\)`));
  assert.doesNotMatch(d.description, /Reg#Pass2026|= pw\b/);
});

// Q40: the Script line is the feature's web address at the pushed commit, for the hosts teams use.
test('webUrl: GitHub, Bitbucket and Azure Repos addresses; none for an unknown host', async () => {
  const { webUrl } = await import('../plugin/src/publish/scripts.mts');
  const f = 'Shop/features/cart.feature';
  assert.equal(webUrl('git@github.com:acme/shop-qa.git', f, 'abc'), `https://github.com/acme/shop-qa/blob/abc/${f}`);
  assert.equal(
    webUrl('https://bitbucket.org/acme/shop-qa.git', f, 'abc'),
    `https://bitbucket.org/acme/shop-qa/src/abc/${f}`,
  );
  assert.equal(
    webUrl('https://acme@dev.azure.com/acme/Shop/_git/shop-qa', f, 'abc'),
    `https://dev.azure.com/acme/Shop/_git/shop-qa?path=/${f}&version=GCabc`,
  );
  assert.equal(
    webUrl('git@ssh.dev.azure.com:v3/acme/Shop/shop-qa', f, 'abc'),
    `https://dev.azure.com/acme/Shop/_git/shop-qa?path=/${f}&version=GCabc`,
  );
  assert.equal(webUrl('/srv/git/shop-qa.git', f, 'abc'), null);
});

// ---- 0.8.0 item 15 (D17): req:<id> tags from TestGen evidence

test('0.8.0 item 15: a story cited as req:<id> on the case or a step becomes a req:<id> tag, once, after the group tags', () => {
  const d = derive(
    kase('TC-1', {
      evidence: ['aut:AUT_Shop#Screens', 'req:AB-12', 'req:1234'],
      steps: [
        {
          screen: '/cart',
          action: 'Click Checkout',
          leads_to: '/checkout',
          expected: 'It opens',
          evidence: ['req:1234', 'req:77'],
        },
      ],
    }),
    ctx(),
  );
  assert.deepEqual(d.requirements, ['1234', '77', 'AB-12']);
  assert.deepEqual(
    d.tags.filter((t) => !t.startsWith('path:')),
    ['checkout', 'checkout-coupon', 'req:1234', 'req:77', 'req:AB-12'],
  );
  assert.deepEqual(derive(kase('TC-2'), ctx()).requirements, []);
  assert.ok(!derive(kase('TC-2'), ctx()).tags.some((t) => t.startsWith('req:')));
});

test('0.8.0 item 15: the req: tags are created with the case, and the hash moves when the story set does', () => {
  const none = derive(kase('TC-1'), ctx());
  const some = derive(kase('TC-1', { evidence: ['req:5'] }), ctx());
  assert.notEqual(none.hash, some.hash);
  const c = diff(input([some], [], [])).changes[0];
  assert.ok(c.change?.addTags?.includes('req:5'));
  assert.ok(c.ownedTags.includes('req:5'));
});

test('0.8.0 item 15: a republish adds a newly cited req: tag, removes an owned one no longer cited, and keeps a hand-added one', () => {
  const was = derive(kase('TC-1', { evidence: ['req:1', 'req:2'] }), ctx());
  const now = derive(kase('TC-1', { evidence: ['req:2', 'req:3'] }), ctx());
  const old = entry('TC-1', 7, was.hash, { ownedTags: was.tags });
  const have = stored(was, 7, { tags: [...was.tags, 'req:by-hand'] });
  const c = diff(input([now], [old], [have])).changes[0];
  assert.equal(c.kind, 'update');
  assert.deepEqual(c.change?.addTags, ['req:3']);
  assert.deepEqual(c.change?.removeTags, ['req:1']);
  assert.ok(c.ownedTags.includes('req:3') && !c.ownedTags.includes('req:1'));
});

test('0.8.0 item 15: every case that cites a story is updated when the tags first arrive', () => {
  // cases published before 0.8.0 carry no req: tag: the first republish writes it on each one that cites a story
  const plain = (id: string) => derive(kase(id), ctx());
  const cites = (id: string) => derive(kase(id, { evidence: ['req:9'] }), ctx());
  const was = [plain('TC-1'), plain('TC-2'), plain('TC-3')];
  const now = [cites('TC-1'), cites('TC-2'), plain('TC-3')];
  const r = diff(
    input(
      now,
      was.map((w, i) => entry(w.id, 10 + i, w.hash, { ownedTags: w.tags })),
      was.map((w, i) => stored(w, 10 + i)),
    ),
  );
  assert.deepEqual(kinds(r), ['update TC-1', 'update TC-2', 'unchanged TC-3']);
  assert.ok(r.changes.slice(0, 2).every((c) => c.change?.addTags?.includes('req:9')));
});

// ---- 0.8.0 item 14: --take-store

/** A case published, then edited in the store (rev 1 → 2), then changed in the run: the conflict. */
function edited() {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(kase('TC-1', { title: 'Mine' }), ctx());
  const old = entry('TC-1', 7, was.hash, { ownedTags: was.tags, trackerRev: 1 });
  const have = stored(was, 7, { title: 'Edited by hand', rev: 2 });
  return { was, now, old, have };
}

test('0.8.0 item 14: without --take-store the store edit is a conflict; with it the case is unchanged and takes the revision', () => {
  const { now, old, have } = edited();
  assert.deepEqual(kinds(diff(input([now], [old], [have]))), ['conflict TC-1']);
  const r = diff(input([now], [old], [have], { takeStore: new Set(['TC-1']) }));
  assert.deepEqual(kinds(r), ['unchanged TC-1']);
  const c = r.changes[0];
  assert.deepEqual(c.take, { rev: 2 });
  assert.equal(c.hash, now.hash);
  assert.equal(c.change, undefined, 'nothing is written to the store');
  assert.deepEqual(c.differences, [{ field: 'title', store: 'Edited by hand', run: 'Mine' }]);
  assert.deepEqual(c.ownedTags, old.ownedTags);
});

test("0.8.0 item 14: taking only clears the case named, and a case the store didn't edit is left alone", () => {
  const { now, old, have } = edited();
  const other = derive(kase('TC-2', { title: 'Also mine' }), ctx());
  const otherWas = derive(kase('TC-2'), ctx());
  const r = diff(
    input(
      [now, other],
      [old, entry('TC-2', 8, otherWas.hash, { ownedTags: otherWas.tags })],
      [have, stored(otherWas, 8)],
      { takeStore: new Set(['TC-1', 'TC-2']) },
    ),
  );
  assert.deepEqual(kinds(r), ['unchanged TC-1', 'update TC-2']);
  assert.equal(r.changes[1].take, undefined);
});

test("0.8.0 item 14: after the ledger takes the store's revision and the run's hash, the next diff is clean", () => {
  const { now, have } = edited();
  const taken = entry('TC-1', 7, now.hash, { ownedTags: have.tags, trackerRev: 2 });
  assert.deepEqual(kinds(diff(input([now], [taken], [have]))), ['unchanged TC-1']);
  assert.equal(diff(input([now], [taken], [have])).changes[0].differences, undefined);
});

test('0.8.0 item 14: an update row carries the store value beside the run value for each field it writes', () => {
  const was = derive(kase('TC-1'), ctx());
  const now = derive(kase('TC-1', { title: 'New title' }), ctx());
  const r = diff(input([now], [entry('TC-1', 7, was.hash, { ownedTags: was.tags })], [stored(was, 7)]));
  assert.equal(r.changes[0].kind, 'update');
  assert.deepEqual(r.changes[0].differences, [{ field: 'title', store: 'Case TC-1', run: 'New title' }]);
});
