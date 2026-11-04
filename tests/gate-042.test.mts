/** 0.4.2: the gate's next-step messages (W17, W19). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appHint } from '../plugin/src/cli/gate.mts';
import type { Config } from '../plugin/src/shared/config.mts';
import type { Plan } from '../plugin/src/shared/models.mts';

const cfg = (url?: string) => ({ project: { app: { name: 'Site', ...(url ? { url } : {}) } } }) as unknown as Config;
const plan = (link: string | null, selected = true) =>
  ({ items: [{ selected, testCase: { id: 1, ...(link ? { automatedTest: link } : {}) } }] }) as unknown as Plan;

test('the approve hint names the app URL when the plan runs browser scripts (W17)', () => {
  assert.equal(
    appHint(cfg('http://127.0.0.1:8080/'), plan('bdd:@TC-HOME-001')),
    ' Its scripts open http://127.0.0.1:8080/: start the app there before qam run.',
  );
  assert.equal(appHint(cfg('http://127.0.0.1:8080/'), plan('pytest:tests/test_a.py::test_a')), '');
  assert.equal(appHint(cfg('http://127.0.0.1:8080/'), plan('bdd:@TC-HOME-001', false)), '');
  assert.equal(appHint(cfg(), plan('bdd:@TC-HOME-001')), '');
});
