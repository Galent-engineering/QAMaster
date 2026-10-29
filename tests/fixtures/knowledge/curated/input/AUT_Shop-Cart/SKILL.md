---
name: AUT_Shop-Cart
description: "Shop application, Cart component (AUT sub-skill of AUT_Shop). Screens: /cart. 1 form(s). Covers its UI elements, forms and fields, page navigation, dependencies on other components (from the Design Structure Matrix) and end-to-end business cases. Use for any QA task on Shop Cart: understanding the screens, writing or reviewing test cases, automation, impact analysis, defects."
---

# Shop · Cart (AUT)

Part of [AUT_Shop](../AUT_Shop/SKILL.md). Generated from the Design Structure Matrix; business sections curated from the source code.

<!-- curated:start (written by Claude / QA from the source code; kept on regeneration) -->
## Business understanding
Summary: Shoppers review and change their cart before checkout.

The cart keeps items per session (cart.js:12). Quantities are 1 to 99.
<!-- curated:end -->

<!-- generated:start (facts from the Design Structure Matrix; rewritten on regeneration, do not edit) -->
## Facts from the Design Structure Matrix
_DSM built 2026-10-29T07:21:47+00:00 from shop@cccccccc; skill generated 2026-10-29 11:16 UTC._

### Screens (1)

| Screen | Title | Reached from | Goes to | Forms · fields | Flags |
|---|---|---|---|---|---|
| `/cart` | /cart | /products, /products/:id | /checkout, /products | 1 · 1 | cycle |

### Screen details

#### `/cart` — /cart
- URL: http://shop.test/cart (HTTP 200)
- Headings: /cart
- Found by: code, ui
- Form **checkout** (post → /checkout): Coupon (text); buttons: Checkout
- Links: Keep shopping
- Reached from: `/products` via "Cart", `/products/:id` via "Add to cart"
- Leads to: `/products` via "Keep shopping", `/checkout` via "POST checkout"
- Route defined at: `shop:src/App.tsx:13`
- Source files: `shop:src/Cart.tsx`

### Dependencies on other components (from the DSM)

- Depends on (navigates to): [AUT_Shop-Products](../AUT_Shop-Products/SKILL.md) (1), [AUT_Shop-Checkout](../AUT_Shop-Checkout/SKILL.md) (1)
- Used by (navigated from): [AUT_Shop-Products](../AUT_Shop-Products/SKILL.md) (2)
- In navigation cycles: `/cart` (test back/forward and state carry-over)

### Candidate end-to-end journeys through this component

1. `/` → ("Products") `/products` → ("Cart") `/cart` → ("POST checkout") `/checkout`

### Test design notes
- No DSM flags for this component.
- Design scenarios with the `Domain_Test_Design_Skill`; check impact of code changes with `/autonomous-qe:generate-dsm`.
<!-- generated:end -->
