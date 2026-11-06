/**
 * The playwright-bdd framework (0.3.0 C2): qam app create and the static gates of qam check-scripts, ported from AQE
 * 0.2.0's scaffold and check_scripts. bddgen and playwright --list need the folder's node_modules; without them the
 * check fails with the install step, which is tested here. The run with real packages is in the end-to-end check.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { playwrightBdd } from '../plugin/src/adapters/framework-bdd.mts';
import { reuseFindings, staticFindings } from '../plugin/src/automation/quality.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const HOME = tmpDir('qam-home-');
const qam = (dir: string, ...args: string[]) => {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
};
function write(dir: string, files: Record<string, string>) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
}

const GOOD = {
  'features/web/login.feature':
    '@web\nFeature: Login\n\n  @TC-LOGIN-001\n  Scenario: Valid login\n    Given I open the path "/#/login"\n    When I sign in as "the registered user"\n    Then I should see the text "Welcome"\n',
  'src/web/locators/login.page.locators.ts': "export const LoginLocators = { email: '#email' } as const;\n",
  'src/web/pages/LoginPage.ts':
    "import { BasePage } from './BasePage';\nimport { LoginLocators } from '../locators/login.page.locators';\nexport class LoginPage extends BasePage {\n  readonly path = '/#/login';\n  email() { return this.find(LoginLocators.email); }\n}\n",
  'steps/pages/login.page.steps.ts':
    "import { When } from '../../src/fixtures';\nWhen('I sign in as {string}', async ({ page }, who: string) => {});\n",
};

test('app create copies the template into <App>/ with app.json, and never overwrites', () => {
  const qa = tmpDir('qam-app-');
  write(qa, { 'config/qamaster.json': JSON.stringify({ app: { name: 'Juice Shop', url: 'http://localhost:3000' } }) });
  const r = qam(qa, 'app', 'create');
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /Created JuiceShop\/ from the playwright-bdd template for http:\/\/localhost:3000/);
  const dir = path.join(qa, 'JuiceShop');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8')), {
    name: 'Juice Shop',
    webUrl: 'http://localhost:3000',
  });
  for (const f of ['playwright.config.ts', 'package.json', 'src/fixtures.ts', 'steps/shared/common.steps.ts'])
    assert.ok(fs.existsSync(path.join(dir, f)), f);
  fs.writeFileSync(path.join(dir, 'app.json'), '{"mine":true}');
  assert.match(qam(qa, 'app', 'create').out, /already exists; left as it is/);
  assert.equal(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'), '{"mine":true}');
});

test('the static gates pass a well-formed folder, and scripts() maps TC IDs to features', () => {
  const dir = tmpDir('qam-bdd-');
  write(dir, GOOD);
  assert.deepEqual(staticFindings(dir, new Set(['TC-LOGIN-001'])), {});
  assert.deepEqual([...playwrightBdd.scripts(dir)], [['TC-LOGIN-001', ['features/web/login.feature']]]);
  assert.equal(playwrightBdd.link('TC-LOGIN-001'), 'bdd:@TC-LOGIN-001');
});

test('the static gates catch inline selectors, missing locator files, misplaced steps, untagged and unknown features', () => {
  const dir = tmpDir('qam-bdd-');
  write(dir, {
    ...GOOD,
    'features/web/cart.feature': 'Feature: Cart\n  @TC-NOPE-001\n  Scenario: x\n    Given I open the path "/"\n',
    'src/web/pages/CartPage.ts': "export class CartPage { total(p) { return p.locator('#total'); } }\n",
    'src/web/locators/orphan.page.locators.ts': 'export const O = {};\n',
    'steps/cart.ts':
      "import { Then } from '../src/fixtures';\nThen('the total is shown', async ({ page }) => { await page.getByText('Total'); });\n",
  });
  const f = staticFindings(dir, new Set(['TC-LOGIN-001']));
  assert.match(f.selectors.join('\n'), /src\/web\/pages\/CartPage\.ts:1: inline selector/);
  assert.match(f.selectors.join('\n'), /steps\/cart\.ts:2: inline selector/);
  assert.match(
    f.selectors.join('\n'),
    /role and name both: `page\.getByRole\(L\.save\.role, \{ name: L\.save\.name \}\)`/,
  );
  assert.match(f.locators.join('\n'), /CartPage\.ts: does not import a locator file/);
  assert.match(f.locators.join('\n'), /orphan\.page\.locators\.ts: no page object uses it/);
  assert.match(f.placement.join('\n'), /steps\/cart\.ts: put screen steps in steps\/pages/);
  assert.match(f.features.join('\n'), /cart\.feature: the feature has no platform tag/);
  assert.match(f.features.join('\n'), /@TC-NOPE-001 is not a test case in any TestGen run/);
});

test('reuse: duplicate and copy-paste steps, and scenarios that differ only in values', () => {
  const r = reuseFindings([
    { pattern: 'I add {string} to the cart', file: 'a.ts', line: 1 },
    { pattern: 'I add {string} to the cart', file: 'b.ts', line: 2 },
    { pattern: 'the total is "10.00" in the cart', file: 'a.ts', line: 3 },
    { pattern: 'the total is "20.00" in the cart', file: 'a.ts', line: 4 },
  ]);
  assert.match(r[0], /duplicate step "I add \{string\} to the cart" defined 2 times/);
  assert.match(r[1], /copy-paste steps .* make one reusable step "the total is \{string\} in the cart"/);
  const dir = tmpDir('qam-bdd-');
  write(dir, {
    ...GOOD,
    'features/web/login.feature':
      '@web\nFeature: Login\n  @TC-LOGIN-001\n  Scenario: A\n    Given I open the path "/a"\n  @TC-LOGIN-001\n  Scenario: B\n    Given I open the path "/b"\n',
  });
  assert.match(
    staticFindings(dir, new Set(['TC-LOGIN-001'])).reuse.join('\n'),
    /differ only in their values: make one Scenario Outline/,
  );
});

test('check-scripts is blocked with the install step when the folder has no node_modules', () => {
  const qa = tmpDir('qam-app-');
  write(qa, { 'config/qamaster.json': JSON.stringify({ app: { name: 'Shop', url: 'http://localhost:3000' } }) });
  qam(qa, 'app', 'create');
  write(path.join(qa, 'Shop'), GOOD);
  write(qa, { 'testgen/output/r1/testcases.json': JSON.stringify([{ id: 'TC-LOGIN-001', steps: [] }]) });
  const r = qam(qa, 'check-scripts', '--quick');
  assert.equal(r.status, 2, 'a setup problem, not a failed check (0.3.1 F8)');
  assert.match(r.out, /Script check: blocked \(Shop\/\)\n\s+install\s+playwright-bdd isn't installed/);
});
