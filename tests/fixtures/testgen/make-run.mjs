// Writes a TestGen run for the shop DSM fixture (component Cart) that AQE's validator passes: node make-run.mjs <run-dir>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
fs.mkdirSync(dir, { recursive: true });
const toCart = [
  { screen: '/', action: 'Open the shop home page', element: 'Products', expected: 'The home page shows the Products link', evidence: ['dsm:screen:/', 'dsm:element:/:Products'] },
  { screen: '/', action: 'Click the Products link', element: 'Products', leads_to: '/products', expected: 'The /products screen opens with its Cart link', evidence: ['dsm:relation:/->/products'] },
  { screen: '/products', action: 'Click the Cart link', element: 'Cart', leads_to: '/cart', expected: 'The /cart screen opens with the Coupon field', evidence: ['dsm:relation:/products->/cart', 'dsm:element:/products:Cart'] },
];
const report = (feature, coverage, test_data = {}) => ({ severity: 'High', sub_module: 'AUT_Shop-Cart', feature, channel: 'Web', coverage, test_data });
const base = (id, title, category, priority, objective, steps, expected_result, extra = {}) => ({
  id, title, component: 'Cart', type: 'Functional', category, priority, objective, steps, expected_result,
  evidence: ['aut:AUT_Shop-Cart#Screen details', 'code:shop:src/Cart.tsx'], ...extra,
});
const cases = [
  base('TC-CART-001', 'Cart screen shows the Coupon field and the checkout form', 'Positive', 'P1', 'Reach /cart from the home page and see its checkout form',
    [...toCart, { screen: '/cart', action: 'Look at the checkout form', element: 'Coupon', expected: 'The Coupon text field and the checkout form are shown', evidence: ['dsm:element:/cart:Coupon'] }],
    'The /cart screen shows the Coupon text field inside the checkout form', report('Cart', ['Functional', 'Navigation'])),
  base('TC-CART-002', 'Checkout form posts with coupon SAVE10 to /checkout', 'E2E', 'P1', 'Walk journey 1 from home to checkout through the cart',
    [...toCart, { screen: '/cart', action: 'Type SAVE10 in the Coupon field and submit the checkout form', element: 'Coupon', data: 'SAVE10', leads_to: '/checkout', expected: 'The /checkout screen opens after the checkout form is posted', evidence: ['dsm:relation:/cart->/checkout', 'dsm:journey:1'] }],
    'The checkout form posts to /checkout and the /checkout screen opens', { ...report('Checkout', ['Functional', 'Navigation', 'Journey'], { coupon: 'SAVE10' }), business_scenario: 'A shopper goes from the home page to checkout with a coupon' }),
  base('TC-CART-003', 'Shopper checks out from the cart without a coupon', 'Business', 'P2', 'Check out from /cart leaving the Coupon field empty',
    [...toCart, { screen: '/cart', action: 'Leave the Coupon field empty and submit the checkout form', element: 'Coupon', leads_to: '/checkout', expected: 'The /checkout screen opens without a coupon applied', evidence: ['dsm:relation:/cart->/checkout'] }],
    'The /checkout screen opens from the cart when no coupon is typed', { ...report('Checkout', ['Business Rule', 'Navigation']), business_scenario: 'A shopper without a coupon checks out' }),
  base('TC-CART-004', 'Coupon field rejects the code EXPIRED-2020', 'Negative', 'P2', 'Submit the checkout form with the code EXPIRED-2020 in the Coupon field',
    [...toCart, { screen: '/cart', action: 'Type EXPIRED-2020 in the Coupon field and submit the checkout form', element: 'Coupon', data: 'EXPIRED-2020', expected: 'The /cart screen stays open with the Coupon field still showing EXPIRED-2020', evidence: ['dsm:element:/cart:Coupon'] }],
    'The /cart screen stays open with EXPIRED-2020 still in the Coupon field', report('Coupon', ['Negative'], { coupon: 'EXPIRED-2020' })),
  base('TC-CART-005', 'Coupon field accepts a 20-character code', 'Boundary', 'P3', 'Submit the checkout form with a 20-character code in the Coupon field',
    [...toCart, { screen: '/cart', action: 'Type ABCDEFGHIJ0123456789 in the Coupon field and submit the checkout form', element: 'Coupon', data: 'ABCDEFGHIJ0123456789', leads_to: '/checkout', expected: 'The /checkout screen opens after the 20-character code is posted', evidence: ['dsm:relation:/cart->/checkout'] }],
    'The 20-character code ABCDEFGHIJ0123456789 is posted and /checkout opens', report('Coupon', ['Boundary'], { coupon: 'ABCDEFGHIJ0123456789' })),
  base('TC-CART-006', 'Keep shopping link returns from the cart to /products', 'Edge', 'P3', 'Leave /cart through the Keep shopping link',
    [...toCart, { screen: '/cart', action: 'Click the Keep shopping link', element: 'Keep shopping', leads_to: '/products', expected: 'The /products screen opens again from the cart', evidence: ['dsm:relation:/cart->/products'] }],
    'The /products screen opens from the cart through Keep shopping', report('Navigation', ['Navigation'])),
];
const manifest = {
  app: 'Shop', scope: { module: 'Cart', sub_module: '' }, components: ['Cart'], test_types: ['Functional'], required_types: ['Functional'],
  channels: ['Web'], domain: 'Retail', domain_evidence: ['domain:Domain_Test_Design_Skill-Domain-Retail#Detection signals', 'aut:AUT_Shop'],
  techniques: ['Equivalence partitioning', 'Boundary value analysis'], requirements: {}, generated_at: '2026-10-29T12:00:00Z',
};
fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
fs.writeFileSync(path.join(dir, 'testcases.json'), `${JSON.stringify(cases, null, 1)}\n`);
