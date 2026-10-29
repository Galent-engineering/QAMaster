# Test cases: Shop (Cart)

- Domain: Retail · generated 2026-10-29T12:00:00Z · validation: **pass** (hallucination tolerance 0, 0 findings, 0 coverage gaps)
- By category: Positive 1, Negative 1, Boundary 1, E2E 1, Business 1, Edge 1

## TC-CART-001 · Cart screen shows the Coupon field and the checkout form

**Component** Cart · **Type** Functional · **Category** Positive · **Priority** P1

**Objective** Reach /cart from the home page and see its checkout form

| # | Screen | Action | Element | Data | Expected |
|---|---|---|---|---|---|
| 1 | `/` | Open the shop home page | Products |  | The home page shows the Products link |
| 2 | `/` | Click the Products link | Products |  | The /products screen opens with its Cart link |
| 3 | `/products` | Click the Cart link | Cart |  | The /cart screen opens with the Coupon field |
| 4 | `/cart` | Look at the checkout form | Coupon |  | The Coupon text field and the checkout form are shown |

**Expected result** The /cart screen shows the Coupon text field inside the checkout form

**Traceability** `aut:AUT_Shop-Cart#Screen details`, `code:shop:src/Cart.tsx`

## TC-CART-002 · Checkout form posts with coupon SAVE10 to /checkout

**Component** Cart · **Type** Functional · **Category** E2E · **Priority** P1

**Objective** Walk journey 1 from home to checkout through the cart

**Business scenario** A shopper goes from the home page to checkout with a coupon

**Test data**
- coupon: SAVE10

| # | Screen | Action | Element | Data | Expected |
|---|---|---|---|---|---|
| 1 | `/` | Open the shop home page | Products |  | The home page shows the Products link |
| 2 | `/` | Click the Products link | Products |  | The /products screen opens with its Cart link |
| 3 | `/products` | Click the Cart link | Cart |  | The /cart screen opens with the Coupon field |
| 4 | `/cart` | Type SAVE10 in the Coupon field and submit the checkout form | Coupon | SAVE10 | The /checkout screen opens after the checkout form is posted |

**Expected result** The checkout form posts to /checkout and the /checkout screen opens

**Traceability** `aut:AUT_Shop-Cart#Screen details`, `code:shop:src/Cart.tsx`

## TC-CART-003 · Shopper checks out from the cart without a coupon

**Component** Cart · **Type** Functional · **Category** Business · **Priority** P2

**Objective** Check out from /cart leaving the Coupon field empty

**Business scenario** A shopper without a coupon checks out

| # | Screen | Action | Element | Data | Expected |
|---|---|---|---|---|---|
| 1 | `/` | Open the shop home page | Products |  | The home page shows the Products link |
| 2 | `/` | Click the Products link | Products |  | The /products screen opens with its Cart link |
| 3 | `/products` | Click the Cart link | Cart |  | The /cart screen opens with the Coupon field |
| 4 | `/cart` | Leave the Coupon field empty and submit the checkout form | Coupon |  | The /checkout screen opens without a coupon applied |

**Expected result** The /checkout screen opens from the cart when no coupon is typed

**Traceability** `aut:AUT_Shop-Cart#Screen details`, `code:shop:src/Cart.tsx`

## TC-CART-004 · Coupon field rejects the code EXPIRED-2020

**Component** Cart · **Type** Functional · **Category** Negative · **Priority** P2

**Objective** Submit the checkout form with the code EXPIRED-2020 in the Coupon field

**Test data**
- coupon: EXPIRED-2020

| # | Screen | Action | Element | Data | Expected |
|---|---|---|---|---|---|
| 1 | `/` | Open the shop home page | Products |  | The home page shows the Products link |
| 2 | `/` | Click the Products link | Products |  | The /products screen opens with its Cart link |
| 3 | `/products` | Click the Cart link | Cart |  | The /cart screen opens with the Coupon field |
| 4 | `/cart` | Type EXPIRED-2020 in the Coupon field and submit the checkout form | Coupon | EXPIRED-2020 | The /cart screen stays open with the Coupon field still showing EXPIRED-2020 |

**Expected result** The /cart screen stays open with EXPIRED-2020 still in the Coupon field

**Traceability** `aut:AUT_Shop-Cart#Screen details`, `code:shop:src/Cart.tsx`

## TC-CART-005 · Coupon field accepts a 20-character code

**Component** Cart · **Type** Functional · **Category** Boundary · **Priority** P3

**Objective** Submit the checkout form with a 20-character code in the Coupon field

**Test data**
- coupon: ABCDEFGHIJ0123456789

| # | Screen | Action | Element | Data | Expected |
|---|---|---|---|---|---|
| 1 | `/` | Open the shop home page | Products |  | The home page shows the Products link |
| 2 | `/` | Click the Products link | Products |  | The /products screen opens with its Cart link |
| 3 | `/products` | Click the Cart link | Cart |  | The /cart screen opens with the Coupon field |
| 4 | `/cart` | Type ABCDEFGHIJ0123456789 in the Coupon field and submit the checkout form | Coupon | ABCDEFGHIJ0123456789 | The /checkout screen opens after the 20-character code is posted |

**Expected result** The 20-character code ABCDEFGHIJ0123456789 is posted and /checkout opens

**Traceability** `aut:AUT_Shop-Cart#Screen details`, `code:shop:src/Cart.tsx`

## TC-CART-006 · Keep shopping link returns from the cart to /products

**Component** Cart · **Type** Functional · **Category** Edge · **Priority** P3

**Objective** Leave /cart through the Keep shopping link

| # | Screen | Action | Element | Data | Expected |
|---|---|---|---|---|---|
| 1 | `/` | Open the shop home page | Products |  | The home page shows the Products link |
| 2 | `/` | Click the Products link | Products |  | The /products screen opens with its Cart link |
| 3 | `/products` | Click the Cart link | Cart |  | The /cart screen opens with the Coupon field |
| 4 | `/cart` | Click the Keep shopping link | Keep shopping |  | The /products screen opens again from the cart |

**Expected result** The /products screen opens from the cart through Keep shopping

**Traceability** `aut:AUT_Shop-Cart#Screen details`, `code:shop:src/Cart.tsx`
