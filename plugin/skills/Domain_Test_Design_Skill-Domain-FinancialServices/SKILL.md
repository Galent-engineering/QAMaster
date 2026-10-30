---
name: "Domain_Test_Design_Skill-Domain-FinancialServices"
description: "Financial Services domain test design sub-skill of Domain_Test_Design_Skill: capital markets, brokerage and trading, wealth and asset management, mutual funds, payment processors and acquiring, wallets, lending fintech and crypto platforms (OMS/EMS, market data, portfolio, risk, clearing and settlement, corporate actions, fund accounting/NAV, robo-advisory, payment gateway, reconciliation, regulatory reporting), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a trading platform, broker app, OMS, FIX gateway, portfolio or fund system, payment gateway, wallet or fintech lending app, or when TestGen / Domain_Test_Design_Skill routes a financial services application here."
---

# Financial Services — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers capital markets, investment and payments businesses outside core deposit banking: orders, trades, positions, funds, payments and wallets, where latency, precision and reconciliation dominate. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Sub-domains:** retail and institutional brokerage (equities, derivatives, fixed income, FX), trading venues and market data, wealth management and robo-advisory, asset management and fund administration (NAV, transfer agency), payments (gateway, acquiring, issuing processors, payouts), wallets and stored value, digital lending (BNPL, personal loans), crypto exchanges and custody.
- **Users:** retail investors, traders, portfolio managers, advisors, operations (middle and back office), risk and compliance, merchants, payment operations, finance and reconciliation teams.

## Detection signals

- Terms: order, trade, fill, partial fill, limit, stop-loss, GTC, IOC, FOK, AMO, lot size, tick size, circuit / price band, margin, P&L, holdings, positions, NAV, SIP, redemption, corporate action, settlement T+1, FIX, ISIN, ticker, authorisation, capture, refund, chargeback, MDR, payout, wallet, KYC.
- Screens/routes: `/watchlist`, `/order`, `/positions`, `/holdings`, `/portfolio`, `/funds`, `/sip`, `/payments`, `/refunds`, `/settlements`, `/wallet`.
- Fields: quantity, price, trigger price, product type (delivery / intraday), validity, NAV date, units, folio, merchant id, transaction id, idempotency key.

## Business objects and workflows

### Business objects
Client, Trading / demat / custody account, Instrument (equity, bond, option, future, fund, ETF, crypto asset), Instrument master, Order, Execution / Fill, Trade, Allocation, Position, Holding, Cash ledger, Margin, Collateral, Corporate action, Fund, NAV, Folio, Unit transaction, SIP mandate, Fee, Contract note, Payment, Refund, Chargeback, Settlement batch, Merchant, Wallet, Payout, Reconciliation break.

### Core workflows
1. Onboard client with KYC, risk profiling and suitability / appropriateness.
2. Place order → pre-trade risk checks → routing → execution → confirmation.
3. Allocate block trades; issue contract notes.
4. Clear and settle trades (T+1 / T+0); update holdings and cash.
5. Calculate and call margin; liquidate on margin shortfall.
6. Process corporate actions (dividend, split, bonus, rights, merger).
7. Rebalance portfolios / model portfolios.
8. Subscribe, redeem and switch mutual fund units at applicable NAV; run SIPs.
9. Compute NAV and fees (management, performance).
10. Authorise, capture, settle, refund and charge back card / alternative payments.
11. Load, spend, transfer and withdraw wallet balances.
12. Reconcile trades, cash, positions and payments across internal and external sources.
13. Report to regulators and tax authorities (trade reporting, FATCA / CRS, capital-gains statements).

### Object lifecycles
- **Order:** New → Validated → Open / Pending → Partially filled → Filled / Cancelled / Rejected / Expired → Modified (re-validated).
- **Trade:** Executed → Confirmed → Allocated → Cleared → Settled / Failed → Corrected / Cancelled.
- **Payment:** Created → Authorised → Captured (full / partial) → Settled → Refunded (full / partial) → Charged back → Representment → Closed; Voided before capture.
- **SIP:** Registered → Mandate approved → Active → Skipped / Paused → Ceased / Completed.

## Regulations and standards

- Securities: SEC and FINRA rules (e.g. Reg NMS, Reg BI, Reg SHO, net capital), SEBI regulations (India), ESMA / MiFID II and MiFIR (EU, incl. best execution and transaction reporting), FCA COBS (UK).
- Market abuse: EU MAR, SEC/FINRA surveillance obligations.
- Derivatives reporting: EMIR, Dodd-Frank Title VII.
- KYC / AML (FATF, BSA, PMLA), FATCA and CRS tax reporting.
- Investment funds: UCITS / AIFMD, SEBI mutual fund regulations (cut-off and applicable NAV rules), Investment Company Act of 1940.
- Payments: PCI DSS, PSD2 / SCA, card scheme rules (Visa, Mastercard), NACHA, RBI payment aggregator guidelines, EMV 3-D Secure.
- Standards: FIX protocol, ISO 20022, ISO 4217 currencies, ISO 10383 MIC codes, ISO 6166 ISIN.
- SOX, GDPR / DPDP / GLBA for client data.

## Risk hotspots

- Order validation: price bands, lot size, tick size, circuit limits, quantity freeze.
- Pre-trade risk checks and margin sufficiency.
- Rounding and precision (prices, quantities, NAV, units, FX).
- Partial fills, average price and fees.
- Corporate action adjustments to positions, cost basis and open orders.
- Market open / close and session transitions; holiday calendars across exchanges.
- Latency and throughput at bursts.
- Reconciliation breaks (trade, cash, position, payments).
- Payment double capture, refund > captured amount, duplicate webhooks.
- Applicable NAV and cut-off rules for fund transactions.

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Average fill price | Avg = Σ(fill qty × fill price) / Σ fill qty | Multiple partial fills with different prices |
| Realised P&L | (Sell price − Buy cost per unit) × qty − fees (cost method FIFO / weighted average per configuration) | Multiple lots; partial sells |
| Tick and lot validation | Price mod tick size = 0; quantity mod lot size = 0; price within band | Values on and off tick / lot; band edges |
| Margin requirement | Required = Σ(position value × margin %) (or SPAN / exchange model); shortfall = required − collateral | Collateral exactly at, above and below required |
| Units allotted | Units = (amount − applicable charges) / NAV, rounded per fund rule (e.g. 3 decimals) | Amounts producing rounding at the last decimal |
| Applicable NAV | Valid application before cut-off on business day → that day's NAV; after → next business day (per fund-type rules) | Cut-off ± 1 second; holidays |
| Stock split | New qty = old qty × ratio; new price = old price / ratio; total cost unchanged | 1:2, 1:5, odd quantities |
| Merchant settlement | Net = Σ captures − Σ refunds − MDR − taxes (± chargebacks) | Mixed day with refunds and chargebacks |
| Refund limit | Σ refunds ≤ captured amount | Refund equal to and above remaining captured |
| Expense ratio / fee accrual | Daily fee = AUM × annual rate / days in year | Leap year, AUM changes |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Order types and validations, margin, P&L, corporate actions, NAV, fees, payment states, wallet limits |
| Regression | Calculation engines, FIX message regression, reconciliation, fee schedules |
| API | FIX sessions (logon, heartbeat, resend, sequence reset), broker APIs, payment gateway APIs, webhooks, market data feeds |
| UI/UX | Real-time price updates, order ticket clarity, risk disclosures, confirmation before irreversible actions |
| Localisation | Multi-currency, multi-exchange time zones, local tax statements, number formats (lakh/crore vs thousand/million) |
| Accessibility | Trading apps and statements WCAG 2.2 AA; colour-only gain/loss indicators avoided |
| Security | Order tampering, account takeover, API key abuse, PCI scope, IDOR on portfolios, withdrawal fraud |
| Performance | Market open burst, latency (ms/µs), market data throughput, payment peak (sale days) |
| Integration | OMS ↔ exchanges / brokers ↔ clearing ↔ depository ↔ banks; payment gateway ↔ acquirer ↔ schemes |
| Data migration | Holdings, cost basis and transaction history migration; folio migration between RTAs |
| Resilience | Exchange disconnect and reconnect with sequence recovery; gateway timeout without double charge; DR during trading hours |

## Scenario bank

ID convention `FIN-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| FIN-FUN-POS-001 | Place limit buy order within price band and sufficient funds | Order accepted, routed, executed when price matches; holdings and cash updated; contract note issued | P1 |
| FIN-FUN-POS-002 | Card payment authorise → capture → settle | Status transitions correct; merchant settlement amount = capture − fees | P1 |
| FIN-PERF-POS-001 | 10× order burst at market open | Latency within SLA; no dropped orders; sequence numbers intact | P1 |
| FIN-FUN-POS-003 | Modify an open limit order's price | Order re-validated; exchange acknowledges modification; history shows both versions | P2 |
| FIN-FUN-POS-004 | Lump-sum mutual fund purchase before cut-off | Units allotted at that day's NAV; folio statement updated | P1 |
| FIN-FUN-POS-005 | Partial refund of a captured payment | Refund processed; remaining refundable amount reduced; customer notified | P2 |
| FIN-API-POS-001 | FIX logon, heartbeat exchange and orderly logout | Sequence numbers increment correctly; session state clean | P2 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| FIN-FUN-NEG-001 | Order price outside circuit limit / invalid tick size | Rejected pre-trade with reason | P1 |
| FIN-FUN-NEG-002 | Refund amount greater than captured amount | Rejected | P1 |
| FIN-FUN-NEG-003 | Place order for a client failing suitability for derivatives | Blocked with suitability message | P1 |
| FIN-FUN-NEG-004 | Buy order exceeding available margin | Rejected by risk check; no exchange submission | P1 |
| FIN-SEC-NEG-005 | Withdraw funds to a newly added bank account without verification | Blocked until penny-drop / verification and cooling period | P1 |
| FIN-API-NEG-006 | Capture a payment that was already voided | Error response; no money movement | P2 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| FIN-FUN-BVA-001 | Order quantity = 0, 1 lot, max quantity, max + 1 | 0 and max + 1 rejected | P1 |
| FIN-FUN-BVA-002 | Order at exactly market close time | Accepted / queued for next session per rule (AMO) | P2 |
| FIN-FUN-BVA-003 | Fund purchase at cut-off − 1 s, cut-off, cut-off + 1 s | Applicable NAV changes exactly at the cut-off rule | P1 |
| FIN-FUN-BVA-004 | Limit price at upper band, band + 1 tick | Upper band accepted; beyond rejected | P1 |
| FIN-FUN-BVA-005 | Collateral value exactly at maintenance margin vs 0.01 below | Margin call only below the threshold | P1 |
| FIN-FUN-BVA-006 | Wallet load at monthly limit and limit + 0.01 | Above limit rejected; message shows remaining limit | P2 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| FIN-FUN-E2E-001 | Order → partial fill → remaining fill → allocation → settlement T+1 → statement | Average price correct; fees correct; settlement and holdings reconcile | P1 |
| FIN-FUN-E2E-002 | SIP setup → auto-debit mandate → units allotted at NAV → statement | Units = amount / NAV (rounded per rule); allotted on correct date | P1 |
| FIN-FUN-E2E-003 | Onboarding → KYC → funding → first trade → contract note → capital-gains report | Records consistent across systems; tax report matches trades | P2 |
| FIN-INT-E2E-004 | Payment → settlement file from acquirer → reconciliation → merchant payout | All transactions matched; breaks listed; payout equals net settlement | P1 |
| FIN-FUN-E2E-005 | Chargeback received → evidence submitted → representment → outcome | Funds held and released / debited per outcome; merchant ledger updated | P2 |
| FIN-FUN-E2E-006 | Redemption request → NAV applied → payout to bank → statement | Amount = units × NAV − exit load − taxes; credited within regulatory timeline | P2 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| FIN-FUN-BUS-001 | 1:2 stock split on held position | Quantity doubled, price halved, cost basis adjusted; open orders handled per exchange rule | P1 |
| FIN-FUN-BUS-002 | Margin call when collateral value falls | Alert; trading restricted; auto square-off at threshold per policy | P1 |
| FIN-FUN-BUS-003 | Cash dividend on holdings with tax withholding | Net dividend credited on pay date; withholding per tax residency | P2 |
| FIN-FUN-BUS-004 | Portfolio drifts beyond rebalancing tolerance | Rebalance orders proposed to restore target weights; client approval captured | P2 |
| FIN-FUN-BUS-005 | Switch between two schemes of the same fund house | Redemption and purchase at correct NAVs; exit load applied if within period | P2 |
| FIN-FUN-BUS-006 | Intraday position not squared off by the cut-off time | Auto square-off at market; charges applied per policy | P2 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| FIN-FUN-EDG-001 | Exchange holiday in one market, open in another, for cross-listed instrument | Settlement dates per market calendar; FX settlement aligned | P2 |
| FIN-FUN-EDG-002 | Duplicate webhook for same payment capture | Processed once (idempotent); ledger not double-credited | P1 |
| FIN-RES-EDG-003 | Exchange connection drops with open orders, then reconnects | Resend / gap-fill recovers missed execution reports; order states correct | P1 |
| FIN-FUN-EDG-004 | Cancel request crosses with a full fill | Order ends Filled; cancel rejected as too late; positions correct | P1 |
| FIN-FUN-EDG-005 | Payment gateway timeout after the customer's bank debited | Status inquiry resolves; captured once or auto-refunded within TAT | P1 |
| FIN-FUN-EDG-006 | Corporate action ex-date with an order already pending | Order adjusted or cancelled per exchange rule; client notified | P3 |

## Integrations

OMS / EMS ↔ exchanges and brokers (FIX), market data vendors, clearing corporations and CCPs, depositories / custodians, banks for funds pay-in and pay-out, KYC registries, RTAs and fund administrators, payment gateway ↔ acquirers ↔ card schemes ↔ 3-D Secure, UPI / ACH / SEPA rails, fraud engines, tax reporting, GL and reconciliation tools, CRM and advisor platforms.

## Non-functional profile

- **Performance:** order-to-acknowledgement latency (milliseconds or microseconds for low-latency venues); market open bursts; market data fan-out; payment peaks on sale days; NAV computation within the evening window.
- **Security:** order and payment tampering, API keys and OAuth for trading APIs, withdrawal controls, PCI DSS scope, fraud scoring.
- **Resilience:** session recovery, idempotent payment APIs, DR during market hours, graceful handling of exchange halts.
- **Accessibility and localisation:** accessible charts and tables, non-colour indicators, local number formats, multi-currency.

## Test data

Market data replay files; instrument master with edge instruments (penny stocks, illiquid bonds, instruments under price bands); exchange simulators; corporate action calendars; fund NAV history; payment gateway sandbox test cards and scheme test scenarios; clients with different risk profiles and margin states.

## Automation notes

- Automate first: order placement and validation, positions and holdings, fund purchase/redemption, payment authorise/capture/refund, webhook idempotency.
- Oracles: independent average-price, P&L, units and settlement calculators; reconciliation scripts comparing ledgers.
- Use exchange simulators and gateway sandboxes; control market time where possible.
- In the application's automation folder (<AppName>/): page objects for watchlist, order ticket, positions, portfolio and checkout; API services for orders, payments and webhooks; features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-API, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Core-Techniques.
