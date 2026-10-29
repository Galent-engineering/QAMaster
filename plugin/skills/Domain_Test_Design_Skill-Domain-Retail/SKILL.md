---
name: "Domain_Test_Design_Skill-Domain-Retail"
description: "Retail and eCommerce domain test design sub-skill of Domain_Test_Design_Skill: B2C / B2B eCommerce storefronts, marketplaces, omnichannel (BOPIS, ship-from-store), store POS, order management, inventory, pricing and promotions, loyalty, payments, returns and customer service, key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is an online store, shopping cart, checkout, marketplace, POS, OMS, PIM, loyalty or promotions engine, or when TestGen / Domain_Test_Design_Skill routes a retail or eCommerce application here."
---

# Retail and eCommerce — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for retail and eCommerce systems: catalogue and search, cart and checkout, pricing and promotions, payments, order management and fulfilment, inventory, store POS, loyalty, returns and customer service across web, app and store channels. Money, stock and customer trust are the main risks; peak trading days drive performance testing. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Sub-domains:** B2C storefront (web, mobile app, PWA), B2B commerce (account pricing, quotes, punch-out), marketplace (third-party sellers, commission, payouts), omnichannel (BOPIS / click-and-collect, ship-from-store, endless aisle), store POS and mPOS, order management system (OMS), warehouse / fulfilment, product information management (PIM), pricing and promotions engine, loyalty and gift cards, subscriptions, customer service / returns (RMA).
- **Users:** guest shopper, registered customer, B2B buyer and approver, store associate, store manager, merchandiser, pricing analyst, marketplace seller, customer-service agent, warehouse picker, finance.
- **Business drivers:** conversion rate, average order value, cart abandonment, stock accuracy, fulfilment SLA, return rate, chargeback rate, peak events (Black Friday, Cyber Monday, festive sales, flash sales).

## Detection signals
- UI: product listing pages with facets and sort, product detail page (PDP) with variants (size, colour), "Add to cart", mini-cart, wishlist, checkout steps (shipping, delivery method, payment, review), order confirmation, "Track order", "Return item", store locator, loyalty points balance.
- Terms: SKU, variant, catalogue, category, price book, promotion / coupon / voucher, basket / cart, checkout, order, shipment, fulfilment, BOPIS, RMA, gift card, loyalty tier, PLU, tender, till, Z-report.
- Platforms: Shopify, Salesforce Commerce Cloud, Adobe Commerce (Magento), SAP Commerce (Hybris), commercetools, BigCommerce, WooCommerce, VTEX, Oracle Retail, Manhattan / Blue Yonder OMS.
- APIs: `/cart`, `/checkout`, `/orders`, `/products`, `/inventory`, `/promotions`, payment gateway webhooks (Stripe, Adyen, Braintree, Razorpay).

## Business objects and workflows

### Business objects
Product, variant / SKU, category, catalogue, price book and price, promotion, coupon code, cart / basket, cart line, customer, address, wishlist, order, order line, payment (authorisation, capture, refund), tender, shipment, fulfilment order, inventory record (on hand, reserved, available to promise), store, warehouse / DC, return (RMA), refund, gift card, loyalty account, points transaction, tax line, invoice, review / rating, seller (marketplace), payout.

### Core workflows
1. Browse and search: category navigation, keyword search with typo tolerance, facets, sort, pagination / infinite scroll.
2. View product: variants, price (list / sale), availability by channel and store, delivery promise, reviews.
3. Add to cart and manage cart: quantity, variant change, save for later, apply coupon, cart merge on login.
4. Checkout: guest or sign-in, address and address validation, delivery method (standard, express, BOPIS, ship-from-store), shipping cost, tax calculation, payment (card with 3-D Secure, wallets, BNPL, gift card, split tender), review and place order.
5. Payment: authorisation at order, capture at shipment, partial capture for split shipments, void on cancel.
6. Order management: sourcing / routing to DC or store, inventory reservation, pick-pack-ship, split shipment, backorder, cancellation before shipment, notifications.
7. Click-and-collect: order → store picks → ready-for-pickup notification → customer collects with code → uncollected order auto-cancelled after hold period.
8. Returns and refunds: return request, return label, return in store or by post, inspection, refund to original tender, exchange, restocking.
9. Store POS: scan items, price lookup, promotions, tenders (cash, card, gift card, split), receipts, returns with / without receipt, end-of-day reconciliation (Z-report).
10. Loyalty: enrol, earn points on purchase, tier upgrade / downgrade, redeem points, points reversal on return, expiry.
11. Promotions lifecycle: create, schedule, target (segment, channel), stack / exclusivity, expire.
12. Marketplace: seller onboarding, listing approval, order split by seller, commission, seller payout.

### Object lifecycles
- **Order:** Created → Payment authorised → Released to fulfilment → Picked → Packed → Shipped (partial / full) → Delivered → Closed; or Cancelled (before shipment) / Payment failed / On hold (fraud review).
- **Return (RMA):** Requested → Approved → Label issued → In transit → Received → Inspected → Refunded / Exchanged / Rejected.
- **Payment:** Authorised → Captured (partial / full) → Settled → Refunded (partial / full); or Voided / Declined / Charged back.
- **Click-and-collect order:** Placed → Picking at store → Ready for collection → Collected; or Not collected → Cancelled and refunded.
- **Promotion:** Draft → Scheduled → Active → Expired / Paused.

## Regulations and standards
- **Payments:** PCI DSS v4.0 (cardholder data never stored or logged; tokenisation), PSD2 Strong Customer Authentication and 3-D Secure 2 (EU / UK), RBI rules on card tokenisation and recurring e-mandates (India).
- **Consumer protection:** EU Consumer Rights Directive (14-day withdrawal right for distance sales), EU Omnibus Directive (price reductions must reference the lowest price in the previous 30 days), UK Consumer Contracts Regulations, US FTC rules (Mail, Internet or Telephone Order Merchandise Rule — ship within stated time or offer cancellation), India Consumer Protection (E-Commerce) Rules 2020 (seller details, country of origin, grievance officer).
- **Privacy and marketing:** GDPR, CCPA / CPRA, India DPDP Act, ePrivacy / PECR cookie consent, CAN-SPAM, CASL.
- **Tax:** VAT / GST on destination, US sales tax economic nexus (post-Wayfair), marketplace facilitator rules, tax-inclusive (EU / UK / India MRP) vs tax-exclusive (US) display.
- **Accessibility:** WCAG 2.1 / 2.2 AA; ADA (US) litigation risk for storefronts; European Accessibility Act (applies to eCommerce from 28 June 2025).
- **Product safety and labelling:** age-restricted goods (alcohol, tobacco, knives) — age verification at checkout and delivery; unit pricing rules where applicable.

## Risk hotspots
- Promotion stacking, exclusivity and order of application producing wrong totals or negative prices.
- Price mismatch between PLP, PDP, cart, checkout, invoice and POS; stale caches after a price change.
- Overselling: inventory race conditions on low stock, flash sales and multi-channel reservation.
- Payment: double charge on retry / back button, authorisation expiry before capture, partial capture rounding, refund to wrong tender.
- Tax and shipping calculation per destination; rounding per line vs per order.
- Cart merge on login; guest cart lost; session expiry during checkout.
- Returns of promotional bundles (proration of discount), loyalty points reversal.
- Peak load: checkout and payment gateway throughput, queueing pages, bot traffic and inventory hoarding.
- Personal data and card data exposure in logs, URLs and analytics tags.
- Search relevance and zero-result handling.

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Line total | Line total = unit price × quantity − line discounts; rounding per configured rule (per line or per order) | Odd quantities and prices with three decimal intermediate values |
| Order total | Order total = Σ line totals − order-level discounts + shipping − shipping discount + tax (if tax-exclusive) + fees − gift card / store credit applied | Combine every component; compare against independent calculation |
| Percentage vs fixed discount order | Configured sequence, e.g. item-level % then item-level fixed then order-level; discount never makes line price < 0 | Two promotions in both orders; fixed discount larger than price |
| Buy X get Y | Cheapest qualifying item free (or as configured); repeats per multiple of X + Y | Quantities X+Y−1, X+Y, 2(X+Y), mixed prices |
| Free-shipping threshold | Free shipping if merchandise subtotal after discounts ≥ threshold (definition per configuration: before / after discounts, excluding gift cards) | Subtotal at threshold − 0.01, threshold, coupon pushing below threshold |
| Discount proration on return | Refund for a returned line = line price − (order discount × line price ÷ eligible subtotal) | Return one item of a discounted order; return all items; compare refunds sum to amount paid |
| Tax | Tax = taxable amount × rate for destination jurisdiction and product tax class; shipping taxable per jurisdiction | Destinations with different rates; tax-exempt product; B2B exemption certificate |
| Inventory availability | Available to promise = on hand − reserved − safety stock (per channel allocation) | Stock at safety stock, safety stock + 1, concurrent purchases of the last unit |
| Loyalty points | Points = floor(eligible spend × earn rate) (eligible spend usually excludes tax, shipping, gift cards); tier by rolling 12-month spend | Spend at tier threshold; return reducing spend below threshold; points expiry date |
| Coupon validity | Valid if active window, channel, segment, minimum spend, usage limit per customer and total not exceeded | Each condition failing individually; last allowed use |
| Click-and-collect hold | Uncollected after N days → cancel and refund | Day N and N + 1 |
| Omnibus price reference | Displayed "was" price = lowest price in previous 30 days | Price history with an earlier lower price |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | Catalogue, search, cart, promotions, checkout, tax and shipping, payments, order lifecycle, returns, loyalty, POS tenders |
| Regression | Promotion engine and checkout regression before every peak; payment gateway SDK upgrades; platform version upgrades |
| API | Cart / checkout / order APIs (headless), inventory and price APIs, payment webhooks (idempotency, signature verification), marketplace seller APIs |
| UI/UX | PDP variant selection, mini-cart updates, checkout friction, error messages near fields, mobile checkout, saved cards and wallets, consistent prices across pages |
| Localisation | Currency format and rounding, tax-inclusive display, address formats and postal-code rules, translated catalogue, size charts, right-to-left layout, local payment methods |
| Accessibility | Product images alt text, variant selectors, carousel controls, checkout forms and errors, 3-D Secure challenge frame, keyboard-only checkout |
| Security | PCI scope, card data never in logs / URLs, IDOR on orders and addresses, coupon brute force, price tampering in requests, account takeover, bot protection, gift card enumeration |
| Performance | Peak-day load (browse : cart : checkout ratio), flash-sale spike, search latency, inventory contention on hot SKUs, payment gateway latency |
| Integration | PIM, ERP, OMS, WMS, payment gateway, tax engine (Avalara, Vertex), fraud (Riskified, Signifyd), carriers, email / SMS, loyalty, marketplace connectors |
| Data migration | Re-platforming: customers (password hashes or forced reset), order history, saved addresses, gift card balances, loyalty points, SEO URL redirects |
| Resilience | Payment gateway timeout, tax engine down (fallback rate or block), inventory service outage, queue-it waiting room, CDN failure, retries without duplicate orders |

## Scenario bank
ID convention: `RTL-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| RTL-FUN-POS-001 | Guest checkout with a valid card and 3-D Secure challenge passed | Order confirmed; confirmation email sent; payment authorised; stock reserved | P1 |
| RTL-FUN-POS-002 | Apply a valid 10 % coupon to an eligible cart | Discount shown on the eligible lines; total recalculated; tax on discounted amount | P1 |
| RTL-FUN-POS-003 | Registered customer logs in with items in a guest cart | Guest and saved carts merged per rule; quantities combined; no duplicates | P2 |
| RTL-FUN-POS-004 | Click-and-collect order at a store with stock | Store selected; ready-for-pickup notification; collection with code closes the order | P2 |
| RTL-FUN-POS-005 | Return one item within the return window to original card | RMA created; refund equals prorated amount; loyalty points reversed | P1 |
| RTL-FUN-POS-006 | Search "running shoes" and filter by size and price | Relevant results; facet counts update; filters reflected in URL and kept on back navigation | P2 |
| RTL-FUN-POS-007 | POS sale with split tender (gift card + card) | Gift card balance reduced; card charged remainder; receipt shows both tenders | P2 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| RTL-FUN-NEG-001 | Apply an expired coupon | "Coupon expired" message; cart total unchanged | P2 |
| RTL-FUN-NEG-002 | Card declined at authorisation | Clear decline message; no order created; cart retained; stock reservation released | P1 |
| RTL-SEC-NEG-003 | Change price or quantity field in the checkout request body | Server recalculates from catalogue; tampered value ignored; event logged | P1 |
| RTL-SEC-NEG-004 | Customer requests another customer's order by changing the order ID | 403 / 404; no order data exposed | P1 |
| RTL-FUN-NEG-005 | Ship to an address in a non-serviceable postal code | Delivery method unavailable message before payment | P2 |
| RTL-FUN-NEG-006 | Return request after the return window | Request rejected with the policy message (or routed to manual approval per policy) | P3 |
| RTL-FUN-NEG-007 | Coupon used beyond its per-customer limit | "Limit reached" message; discount not applied | P2 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| RTL-FUN-BVA-001 | Subtotal at free-shipping threshold − 0.01, at threshold, at threshold + 0.01 | Shipping charged below; free at and above | P2 |
| RTL-FUN-BVA-002 | Quantity at max per order (e.g. 10) and max + 1 | 10 accepted; 11 blocked with message | P3 |
| RTL-FUN-BVA-003 | Buy 2 get 1 free with quantities 2, 3, 5, 6 | Free items 0, 1, 1, 2 | P2 |
| RTL-FUN-BVA-004 | Last unit in stock purchased by two customers simultaneously | One succeeds; other gets out-of-stock before payment capture; no oversell | P1 |
| RTL-FUN-BVA-005 | Gift card balance exactly equal to order total, and 0.01 less | Equal: no other tender needed; less: remaining 0.01 requested on another tender | P2 |
| RTL-FUN-BVA-006 | Return on the last day of the return window and the day after | Last day accepted; day after rejected | P3 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| RTL-FUN-E2E-001 | Browse → add to cart → coupon → checkout → pay → split shipment → partial capture → delivery → partial return → refund | Captures equal shipped value; refund prorated; inventory and loyalty updated; finance reconciles | P1 |
| RTL-FUN-E2E-002 | BOPIS order → store pick → customer does not collect → auto-cancel → refund | Order cancelled after hold period; authorisation voided or refund issued; stock returned to store | P2 |
| RTL-INT-E2E-003 | Order placed online → OMS routes to DC → WMS ships → carrier tracking → delivered status in customer account | Status and tracking consistent across systems and notifications | P1 |
| RTL-FUN-E2E-004 | Buy online, return in store | Store POS finds the order; refund to original tender; inventory added to store stock | P2 |
| RTL-FUN-E2E-005 | Marketplace order with items from two sellers | Order split by seller; each seller ships; commission deducted; payouts correct | P2 |
| RTL-FUN-E2E-006 | Subscription order: initial order → recurring order on schedule → card updated → skip → cancel | Recurring charges on schedule; skipped cycle not charged; cancellation stops future orders | P3 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| RTL-PERF-BUS-001 | Flash sale: 10× normal traffic on a limited-stock SKU | No oversell; fair queueing; checkout response within SLA; bot traffic throttled | P1 |
| RTL-FUN-BUS-002 | Price change scheduled at midnight during an active session | Cart price updated with a notice before payment; order charged at current price | P2 |
| RTL-FUN-BUS-003 | Promotion stacking: sitewide 20 % + category 10 % + coupon (exclusivity rules) | Only allowed combinations applied in configured order; totals correct | P1 |
| RTL-FUN-BUS-004 | Loyalty tier upgrade crosses threshold on a purchase | New tier and earn rate applied from the next eligible transaction per rule | P3 |
| RTL-FUN-BUS-005 | EU customer withdraws from a distance contract within 14 days | Withdrawal accepted; refund including standard outbound shipping within the legal timeframe | P2 |
| RTL-FUN-BUS-006 | Product recall: SKU blocked from sale | Removed from search and PDP add-to-cart; open orders flagged; POS blocks scan | P2 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| RTL-FUN-EDG-001 | Customer double-clicks "Place order" or refreshes during payment | Exactly one order and one authorisation (idempotency key) | P1 |
| RTL-FUN-EDG-002 | Authorisation expires (e.g. 7 days) before backordered item ships | Re-authorisation attempted; on failure customer asked to update payment; no shipment without payment | P2 |
| RTL-FUN-EDG-003 | Order discount that exceeds one cheap line | No negative line prices; discount distributed per rule | P2 |
| RTL-L10N-EDG-004 | Currency with no minor unit (JPY) and with three decimals (KWD) | Correct rounding and display; payment amount in correct minor units | P3 |
| RTL-FUN-EDG-005 | Session expires on the payment step | Cart preserved; user re-authenticates and resumes without losing entered address | P3 |
| RTL-RES-EDG-006 | Payment gateway times out after charging the card | Order reconciled through webhook / status query; no duplicate charge; customer informed | P1 |

## Integrations
Payment gateways and acquirers, 3-D Secure servers, wallets (Apple Pay, Google Pay, PayPal), BNPL (Klarna, Afterpay), tax engine, fraud screening, PIM, ERP, OMS, WMS, carriers (label, rate, tracking), address validation, search (Algolia, Elasticsearch), CMS, CDP / email / SMS marketing, loyalty platform, review platform, marketplace connectors (Amazon, eBay), POS and store systems, analytics and tag manager.

## Non-functional profile
- Peak traffic of 5–20× normal on sale days; checkout p95 typically < 2 s excluding the 3-D Secure challenge.
- Search and PLP p95 < 1 s; PDP Core Web Vitals (LCP < 2.5 s, INP < 200 ms, CLS < 0.1).
- Inventory accuracy under concurrency (zero oversell on reserved stock).
- Availability 99.9 %+ during peak; graceful waiting room.
- Order throughput per minute for the largest planned event, with headroom.

## Test data
Catalogue with simple products, variants, bundles, gift cards, digital goods, age-restricted and tax-exempt items; SKUs at zero, low and high stock; price books and scheduled price changes; promotions of every type with stacking rules; payment provider test cards (success, decline, 3-D Secure challenge, insufficient funds) used only in sandbox / test mode; addresses per supported country; customers per loyalty tier; historic orders for return testing.

## Automation notes
- Automate first: checkout happy paths per payment method, promotion calculations (API-level), cart merge, returns and refunds, inventory reservation.
- Oracles: independent price / tax / promotion calculator; reconcile captured payments vs shipped lines and refunds vs returned lines.
- Data setup through admin / platform APIs (products, stock, promotions); reset stock after each run; use unique coupon codes per test.
- Run peak load tests against a production-like environment with gateway sandboxes or stubs.
- Automation mapping (<AppName>/): page objects for PLP, PDP, cart, checkout steps, order history; API services for cart, checkout, orders, inventory; features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Localisation, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Domain-Logistics, Domain_Test_Design_Skill-Domain-CRM, Domain_Test_Design_Skill-Core-Techniques.
