/**
 * Puts CheckMasterDemo's tests in the file store as test cases linked `pytest:<node id>`, as in the 0.3.0 end-to-end
 * run (D3). Run in the demo clone: node seed-checkmaster.mts <plugin root>
 */
const root = process.argv[2] ?? '/opt/qamaster/plugin';
const { loadConfig } = await import(`${root}/src/shared/config.mts`);
const { buildStore } = await import(`${root}/src/adapters/registry.mts`);

const store = buildStore(loadConfig(process.cwd(), { QAMASTER_STORE: 'file' }));
const t = 'pytest:tests/';
const cases: [string, string, string[], string][] = [
  [
    'Coupon',
    'A valid coupon discounts the total',
    ['coupon', 'path:site/coupon.js'],
    `${t}test_coupon.py::test_coupon_applies_discount_to_total`,
  ],
  [
    'Coupon',
    'An expired coupon shows an error',
    ['coupon', 'path:site/coupon.js'],
    `${t}test_coupon.py::test_expired_coupon_shows_an_error`,
  ],
  ['Coupon', 'An invalid coupon shows an error', ['coupon'], `${t}test_coupon.py::test_invalid_coupon_shows_an_error`],
  [
    'Cart',
    'Adding items updates the total',
    ['cart', 'path:site/cart.js'],
    `${t}test_cart.py::test_adding_items_updates_the_total`,
  ],
  [
    'Login',
    'A valid login greets the user',
    ['login', 'smoke', 'path:site/login.js'],
    `${t}test_login.py::test_valid_login_greets_the_user`,
  ],
  [
    'Login',
    'A wrong password shows an error',
    ['login', 'path:site/login.js'],
    `${t}test_login.py::test_wrong_password_shows_an_error`,
  ],
];
for (const [suite, title, tags, link] of cases) {
  await store.ensureSuite(suite);
  const made = await store.create({ title, addTags: tags, automatedTest: link });
  await store.addToSuite(made.id, suite);
  console.log(`TC${made.id} ${title} -> ${link}`);
}
