---
name: "Domain_Test_Design_Skill-Domain-Travel"
description: "Travel and Hospitality domain test design sub-skill of Domain_Test_Design_Skill: airline reservation, departure control and loyalty, online travel agencies, hotel PMS and booking engines, channel managers, car rental, rail and bus, cruise, tours and activities, corporate travel and expense, key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a flight, hotel, car, rail or holiday booking site, GDS / NDC integration, PMS, channel manager, check-in or loyalty system, or when TestGen / Domain_Test_Design_Skill routes a travel or hospitality application here."
---

# Travel and Hospitality — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for travel and hospitality systems: search, availability, pricing and booking of flights, hotels, cars, rail and packages; ticketing, changes and refunds; check-in and boarding; property management; distribution through GDS, NDC and channel managers; loyalty. Inventory and fares change constantly, time zones and dates cross borders, and passenger data is regulated. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Sub-domains:** airline passenger service system (reservation, inventory, departure control), airline retailing (NDC offers and orders, ancillaries), online travel agency (OTA) and metasearch, hotel booking engine, property management system (PMS), central reservation system (CRS), channel manager, revenue management, car rental, rail and bus ticketing, cruise, tours and activities, packages (flight + hotel), corporate travel booking tool and expense, loyalty programmes.
- **Users:** traveller, guest, travel agent, corporate travel manager / approver, airline or hotel call-centre agent, front-desk agent, housekeeping, revenue manager, check-in / gate agent, loyalty member.
- **Business drivers:** look-to-book ratio, conversion, overbooking control, ancillary revenue, RevPAR / ADR / occupancy (hotels), load factor (airlines), disruption handling, customer satisfaction.

## Detection signals
- UI: origin / destination search with date picker and passenger counts (adult / child / infant), fare families, seat map, baggage options, hotel search with check-in / check-out dates and rooms / guests, rate plans, cancellation policy text, itinerary, e-ticket, boarding pass, "Manage booking", check-in.
- Terms: PNR / booking reference, record locator, e-ticket number (13 digits), fare basis, booking class / RBD, segment, itinerary, layover / connection, codeshare, SSR, APIS, NDC offer / order, GDS (Amadeus, Sabre, Travelport), rate plan, room type, BAR, allotment, stop-sell, no-show, folio, night audit.
- APIs: availability / shop, price, book, ticket, void, exchange, refund, NDC `AirShopping`, `OfferPrice`, `OrderCreate`; OTA / HTNG XML hotel messages; channel manager ARI (availability, rates, inventory) pushes.

## Business objects and workflows

### Business objects
Traveller / guest profile, passenger (type ADT / CHD / INF), search request, flight offer, fare, fare rule, segment, itinerary, PNR / booking, e-ticket / EMD, ancillary (seat, bag, meal, lounge), seat map, check-in record, boarding pass, hotel property, room type, rate plan, allotment, reservation, folio, payment / deposit, cancellation policy, voucher, car rental agreement, loyalty account, miles / points transaction, corporate travel policy, approval request, invoice.

### Core workflows
1. Search: origin, destination, dates, passengers / rooms, cabin, flexibility; results sorted and filtered (price, duration, stops, airline, star rating, amenities).
2. Price and select: fare families, fare rules (change / refund penalties), baggage allowance, hotel rate plans (refundable vs non-refundable, breakfast).
3. Book: traveller details (name as in passport), contact, special requests (SSR), seats and ancillaries, payment (card, 3-D Secure, points, voucher, corporate card).
4. Ticket / confirm: issue e-ticket(s) and EMDs, hotel confirmation number, itinerary email.
5. Manage booking: change dates / flights (fare difference + penalty), name correction, add ancillaries, cancel and refund, upgrade.
6. Check-in: online check-in window, APIS / passport data, seat selection, boarding pass (mobile / PDF), bag drop.
7. Disruption: schedule change, delay, cancellation, re-accommodation, compensation, vouchers.
8. Hotel stay: arrival, check-in (ID, deposit / pre-authorisation), room assignment, posting charges to folio, check-out, settlement, night audit, no-show processing.
9. Distribution: rates and availability pushed to channels (OTA, GDS, metasearch); reservations pulled into PMS; stop-sell and rate parity.
10. Loyalty: enrol, accrue miles / points by fare class or spend, tier status, redeem award, partner accrual.
11. Corporate travel: policy check (cabin, price cap), approval workflow, booking, expense reconciliation.

### Object lifecycles
- **Flight booking:** Shopping → Offer priced → Booked (held, time limit) → Ticketed → Changed / Re-issued → Checked in → Boarded → Flown (or No-show) → Refunded / Voided (void allowed same day per carrier / BSP rules).
- **Hotel reservation:** Tentative / On request → Confirmed → Modified → Checked in → In house → Checked out → Closed; or Cancelled / No-show.
- **Ticket coupon status:** Open for use → Checked in → Lifted / Boarded → Flown; or Exchanged / Refunded / Void.

## Regulations and standards
- **Passenger rights:** EU Regulation 261/2004 (and UK261) compensation for delay, cancellation and denied boarding; US DOT rules (automatic refunds for significantly changed / cancelled flights, 24-hour cancellation rule for bookings made ≥ 7 days before departure, tarmac delay rules, full-fare advertising); Canada APPR; India DGCA CAR on passenger facilitation.
- **Package travel:** EU Package Travel Directive 2015/2302 (insolvency protection, information requirements, change rights); UK ATOL protection.
- **Accessibility:** US Air Carrier Access Act and DOT website accessibility rules (WCAG 2.0 AA for primary airline websites and kiosks), ADA for hotel booking (accessible rooms described and bookable), European Accessibility Act for passenger transport services and eCommerce.
- **Data:** GDPR, CCPA; API / PNR data transfer rules (US Secure Flight, EU PNR Directive 2016/681, APIS); PCI DSS for card payments; PSD2 SCA.
- **Industry standards:** IATA standards (NDC, ONE Order, BSP settlement, Resolution 722 e-tickets, BCBP barcoded boarding pass), OpenTravel Alliance (OTA) XML, HTNG for hotel integrations.
- **Pricing transparency:** total price including mandatory taxes and fees shown upfront (EU Regulation 1008/2008 for air fares; FTC rule on unfair or deceptive fees for short-term lodging in the US from 2025).

## Risk hotspots
- Time zones: departure and arrival in local time, overnight flights, date-line crossings, DST changes affecting connection times and check-in windows.
- Price changes between search, price and book (fare no longer available); currency conversion.
- Double booking or ticketing on retry; orphan PNRs (booked but not ticketed, or ticketed without payment).
- Name rules: passport name formats, special characters, maximum length, name changes not allowed.
- Child and infant age calculated at date of travel (not booking); infant on lap per adult limit.
- Fare rules and penalties on changes; residual value and refunds of taxes.
- Hotel overbooking, allotment release, stop-sell propagation delays, rate parity across channels.
- Cancellation policy deadlines in property local time.
- Disruption flows rarely exercised but high impact.
- High look-to-book traffic and caching causing stale availability.

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Total fare | Total = Σ (base fare + carrier surcharges + taxes and fees) per passenger type + ancillaries + service fee | Mixed ADT / CHD / INF booking; compare breakdown with supplier response |
| Passenger type by age | Infant < 2, child 2–11, adult ≥ 12 years on the date of travel (carrier-specific ranges may vary) | Birthdays the day before, on, and after each travel date; return trip crossing a birthday |
| Infant limit | Infants on lap ≤ number of adults | 2 adults with 2 and 3 infants |
| Change fee | Change cost = penalty per fare rule + fare difference (if new fare higher; residual handled per rule if lower) + tax difference | Changes to higher, equal and lower fares |
| EU261 compensation | Distance ≤ 1 500 km: €250; intra-EU > 1 500 km and other 1 500–3 500 km: €400; > 3 500 km: €600 (may be reduced 50 % for re-routing with limited delay); only if arrival delay ≥ 3 h and no extraordinary circumstances | Flight distances at band edges; delays 2 h 59 min and 3 h |
| US 24-hour rule | Free cancellation within 24 h of booking if booked ≥ 7 days before departure (or carrier offers 24-h hold) | Booking at 7 days and 6 days 23 h before departure |
| Minimum connection time | Connection allowed if gap ≥ MCT for the airport / terminal / domestic-international combination | Gaps at MCT − 1 min, MCT |
| Hotel nights | Nights = check-out date − check-in date; rate applied per night (rate may differ per night) | Stay across a rate change date and weekend |
| Hotel cancellation | Free if cancelled before deadline (e.g. 48 h before check-in, property local time), else penalty (first night or %) | Cancellation 1 min before and after deadline from another time zone |
| Overbooking limit | Bookable = capacity × (1 + overbooking %) − sold | Sell up to limit and limit + 1 |
| Loyalty accrual | Miles = flown distance × fare-class accrual % (or revenue-based: spend × multiplier by tier) | Each fare class / tier; partner accrual |
| Check-in window | Online check-in opens X h and closes Y min before scheduled departure (local) | Times at open − 1 min, open, close, close + 1 min |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | Search, pricing, fare rules, booking, ticketing, changes, refunds, check-in, ancillaries, hotel reservations and folios, disruption handling, loyalty |
| Regression | Supplier / GDS / NDC schema version changes; fare and tax rule updates; seasonal schedule changes |
| API | Shop / price / book / ticket / cancel, NDC messages, ARI pushes, webhooks; idempotency, timeouts, partial failures, schema validation |
| UI/UX | Date pickers (range, past dates disabled), passenger selector, seat map, fare comparison, clear total price, mobile boarding pass |
| Localisation | Local time display, date formats, currency, airport and city names, translated fare rules, name transliteration, right-to-left |
| Accessibility | Date picker and seat map with keyboard and screen readers, special assistance requests (SSR WCHR etc.), accessible room booking |
| Security | PNR lookup by surname + locator only (enumeration protection), payment security, loyalty account takeover and points fraud, passport data protection |
| Performance | High look-to-book search load, caching, supplier latency, peak sales (fare sales, holidays), check-in surge before departures |
| Integration | GDS, NDC airlines, hotel suppliers / bed banks, PMS ↔ channel manager ↔ OTAs, payment, fraud, insurance, BSP / ARC settlement |
| Data migration | PSS or PMS migration: future bookings, tickets, loyalty balances, profiles, folios; booking reference continuity |
| Resilience | Supplier timeout during booking (book succeeded but response lost), GDS outage, channel manager sync failure, offline check-in fallback |

## Scenario bank
ID convention: `TRV-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TRV-FUN-POS-001 | Book a round-trip flight for 2 adults and 1 child with seat selection | PNR created; 3 e-tickets issued; seats assigned; total = fare breakdown sum | P1 |
| TRV-FUN-POS-002 | Book a refundable hotel rate for 3 nights | Confirmation number; nights = 3; cancellation deadline shown in property local time | P1 |
| TRV-FUN-POS-003 | Online check-in within the window with passport details | Boarding pass issued with barcode; APIS data stored | P1 |
| TRV-FUN-POS-004 | Add checked bag after booking | EMD issued; allowance updated on itinerary | P2 |
| TRV-FUN-POS-005 | Cancel a refundable hotel booking before the deadline | Cancellation number; no penalty; refund or no charge | P2 |
| TRV-FUN-POS-006 | Redeem loyalty points for an award flight | Points deducted; taxes paid by card; ticket issued | P2 |
| TRV-FUN-POS-007 | Corporate traveller books an in-policy fare | No approval needed; booking ticketed; cost centre recorded | P3 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TRV-FUN-NEG-001 | Return date earlier than departure date | Validation error; search not executed | P2 |
| TRV-FUN-NEG-002 | Fare no longer available at booking | Clear message with new price; booking not created without consent | P1 |
| TRV-FUN-NEG-003 | 3 infants with 2 adults | Validation error before payment | P2 |
| TRV-SEC-NEG-004 | Brute-force booking lookup with random locators | Rate-limited / CAPTCHA per policy; no booking data exposed | P1 |
| TRV-FUN-NEG-005 | Check-in attempt after the check-in window closes | Check-in refused with airport instructions | P2 |
| TRV-FUN-NEG-006 | Name with digits or exceeding the carrier maximum length | Validation error referencing passport name rules | P2 |
| TRV-FUN-NEG-007 | Cancel a non-refundable hotel rate | Penalty shown before confirmation; only taxes refunded where applicable | P2 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TRV-FUN-BVA-001 | Child turns 12 between outbound and return flights | Passenger type per carrier rule (age at each segment / at first departure); price consistent | P2 |
| TRV-FUN-BVA-002 | Maximum passengers per booking (e.g. 9) and 10 | 9 allowed; 10 → group booking message | P3 |
| TRV-FUN-BVA-003 | Hotel cancellation exactly at the deadline (local time) from a user in another time zone | Policy applied correctly by property time | P1 |
| TRV-FUN-BVA-004 | Connection time equal to MCT and MCT − 1 min | MCT offered; MCT − 1 not offered | P2 |
| TRV-FUN-BVA-005 | Arrival delay of 2 h 59 min and 3 h 00 min on an EU flight | Compensation not due / due per EU261 | P2 |
| TRV-FUN-BVA-006 | Search with departure date = today and maximum advance date (e.g. 330 / 361 days) | Today allowed if flights remain; beyond max date disabled | P3 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TRV-FUN-E2E-001 | Search → book → pay → ticket → change date → pay fare difference + penalty → check-in → board | Ticket re-issued; old coupons exchanged; boarding pass for new flight | P1 |
| TRV-FUN-E2E-002 | Airline cancels a flight → automatic re-accommodation → customer accepts or requests refund | Rebooked segment or refund processed; notifications sent; compensation assessed | P1 |
| TRV-INT-E2E-003 | Hotel books via OTA → reservation in PMS → check-in → folio charges → check-out → OTA commission invoice | Reservation consistent across channel manager, PMS and OTA; folio settles | P1 |
| TRV-FUN-E2E-004 | Package (flight + hotel) booked → flight schedule change → customer accepts change | Package updated; hotel dates adjusted where needed; package-travel information sent | P2 |
| TRV-FUN-E2E-005 | Corporate traveller books out-of-policy fare → approval → ticketing → expense report | Approval enforced; ticket issued after approval; expense auto-populated | P3 |
| TRV-FUN-E2E-006 | Car rental: reserve → pick-up with deposit → late return → final charge | Extra day / hours charged per rule; deposit released | P3 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TRV-FUN-BUS-001 | Overbooked flight: denied boarding with volunteers then involuntary | Compensation and rebooking per regulation and policy; priority rules applied | P2 |
| TRV-FUN-BUS-002 | Hotel stop-sell on a room type | Propagated to all channels within SLA; no new bookings accepted | P1 |
| TRV-FUN-BUS-003 | Revenue manager changes BAR for future dates | New rates on all channels; existing bookings keep original rate | P2 |
| TRV-FUN-BUS-004 | Hotel no-show at night audit | No-show fee charged per guarantee; room released; reservation status No-show | P2 |
| TRV-FUN-BUS-005 | Loyalty member reaches a tier threshold mid-trip | Tier upgraded per rule; benefits on subsequent segments | P3 |
| TRV-FUN-BUS-006 | US booking cancelled within 24 hours | Full refund without penalty | P1 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TRV-L10N-EDG-001 | Overnight flight crossing the date line (arrives "the day before") | Dates shown in local times with +/−1 day indicator; duration correct | P2 |
| TRV-FUN-EDG-002 | Flight on the DST change night | Times and durations correct; connections valid | P2 |
| TRV-RES-EDG-003 | Supplier times out after creating the booking | Booking reconciled; no duplicate booking on retry; customer told the final status | P1 |
| TRV-FUN-EDG-004 | Passenger with a single name (mononym) | Handled per carrier rule (e.g. repeated or FNU convention) | P3 |
| TRV-FUN-EDG-005 | Hotel stay across New Year with different nightly rates | Each night priced correctly; total = sum of nightly rates | P3 |
| TRV-FUN-EDG-006 | Ticket voided after the void window | Void refused; refund flow with applicable penalty instead | P3 |

## Integrations
GDS (Amadeus, Sabre, Travelport), airline NDC APIs, PSS / DCS, hotel CRS and PMS (Opera, Mews), channel managers (SiteMinder), bed banks, car rental suppliers, rail APIs, payment gateways and BSP / ARC settlement, fraud screening, travel insurance, visa / documentation services (Timatic), loyalty and partner programmes, expense tools (SAP Concur), messaging (email, SMS, push, wallet passes).

## Non-functional profile
- Search p95 often 2–5 s with many supplier calls; caching with freshness rules; look-to-book ratios of 1 000:1 or more.
- Peak loads on fare sales, holiday seasons and mass disruptions (re-accommodation of thousands of passengers).
- Check-in and boarding pass availability 24×7; mobile wallet passes.
- ARI updates propagated to channels within minutes.

## Test data
Routes (domestic, international, multi-city, codeshare, interline), passenger mixes (ADT / CHD / INF with birthdays near boundaries), fare classes with different rules, sandbox / test GDS PNRs, hotels in different time zones with refundable and non-refundable rates, loyalty members per tier, corporate policies, synthetic passport data only (never real documents), test payment cards.

## Automation notes
- Automate first: search-to-book per product, fare and price breakdown, cancellation / refund rules, check-in window, hotel nights and cancellation deadlines.
- Use supplier sandboxes or recorded stubs for determinism; inject schedule changes and timeouts through the stub.
- Freeze clock / time zone in tests for date logic; assert both local and UTC times.
- Oracles: independent age / passenger-type, nights, compensation and penalty calculators.
- Automation mapping (<AppName>/): page objects for search, results, passenger details, seat map, payment, manage booking, check-in; API services for shop / book / ticket / cancel; features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-Localisation, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Domain-Retail, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData.
