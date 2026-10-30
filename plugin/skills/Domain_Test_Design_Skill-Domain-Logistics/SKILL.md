---
name: "Domain_Test_Design_Skill-Domain-Logistics"
description: "Logistics and Supply Chain domain test design sub-skill of Domain_Test_Design_Skill: transportation management (TMS), warehouse management (WMS), courier / parcel and last-mile delivery, freight forwarding and customs, fleet and telematics, yard and dock management, cold chain, reverse logistics and supply-chain visibility, key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a TMS, WMS, shipment tracking, courier, last-mile delivery app, freight booking, customs filing, fleet or yard management system, or when TestGen / Domain_Test_Design_Skill routes a logistics application here."
---

# Logistics and Supply Chain — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for logistics systems: shipment booking and rating, warehouse receiving, put-away, picking, packing and shipping, transport planning and dispatch, last-mile delivery with proof of delivery, tracking and visibility, freight forwarding and customs, fleet telematics, cold chain and returns. Physical events (scans, GPS, sensors) arrive asynchronously and out of order, so state, time and quantity reconciliation dominate testing. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Sub-domains:** transportation management system (TMS: planning, tendering, carrier selection, freight audit), warehouse management system (WMS: receiving, put-away, inventory, wave / batch picking, packing, shipping), courier / express / parcel (CEP) and last-mile delivery, freight forwarding (air, ocean, road, rail; FCL / LCL, consolidation), customs brokerage and trade compliance, fleet management and telematics, yard and dock scheduling, cold chain monitoring, reverse logistics, supply-chain visibility / control tower, 3PL billing.
- **Users:** shipper, consignee, customer-service agent, planner / dispatcher, carrier, driver (mobile app), warehouse operator (RF scanner), supervisor, customs broker, finance / freight auditor.
- **Business drivers:** on-time in-full (OTIF), delivery success first attempt, cost per shipment, truck utilisation, inventory accuracy, dock-to-stock time, pick accuracy, dwell time, damage and claims rate.

## Detection signals
- UI: shipment / consignment booking form (origin, destination, packages, weights, dimensions), rate quote, label printing, tracking page with event timeline, dispatch board / map, driver app with stops and proof of delivery (signature, photo, OTP), RF-gun screens (scan location, scan item, confirm quantity), dock appointment calendar.
- Terms: AWB, bill of lading (B/L), consignment note (CMR), waybill, tracking number, SSCC, ASN, GRN, put-away, pick list, wave, cross-dock, LPN, pallet, TEU, FCL / LCL, incoterms, HS code, commercial invoice, POD, NDR (non-delivery report), RTO, dim weight, accessorial, demurrage, detention.
- Standards / messages: GS1 barcodes (GTIN, SSCC, GLN), EDI X12 204 / 214 / 210 / 856, EDIFACT IFTMIN / IFTSTA / DESADV, carrier APIs (FedEx, UPS, DHL), ELD data.

## Business objects and workflows

### Business objects
Shipment / consignment, package / handling unit, pallet / LPN, order, ASN, purchase order, receipt (GRN), item / SKU, lot / batch / serial, location (bin, zone, dock door), inventory record, wave, pick task, pack station, load, route, stop, trip, vehicle, driver, carrier, rate card, tariff, accessorial charge, freight invoice, tracking event, proof of delivery, exception (damage, shortage, delay, address issue), customs declaration, HS code, commercial invoice, temperature log, return authorisation, claim.

### Core workflows
1. Book shipment: shipper details, consignee, packages, weights / dimensions, service level, pickup slot, dangerous goods declaration, insurance.
2. Rate and quote: chargeable weight, zone, service, fuel surcharge, accessorials, discounts, taxes.
3. Label and documents: carrier label with tracking barcode, commercial invoice, B/L / AWB, dangerous-goods paperwork.
4. Inbound warehouse: ASN received → dock appointment → unload → receive against ASN / PO (quantity, lot, expiry) → discrepancies → put-away to suggested location.
5. Inventory control: cycle count, adjustments with reason codes, location moves, holds (quarantine, damaged), replenishment.
6. Outbound warehouse: order release → wave planning → pick (FIFO / FEFO) → pack → cartonisation → ship confirm → manifest.
7. Transport planning: load building, route optimisation, carrier tendering, accept / reject, dispatch.
8. Execution: pickup scan, line-haul, hub scans, out for delivery, delivery attempt, proof of delivery, exception (NDR) and re-attempt, return to origin (RTO).
9. Tracking and notifications: event ingestion from scans / carriers / telematics, ETA prediction, customer notifications.
10. Cross-border: customs declaration, duties and taxes, clearance holds, release.
11. Freight audit and billing: carrier invoice matched to rated shipment, accessorial validation, 3PL storage and handling billing.
12. Reverse logistics: return request, pickup, receive, inspect, disposition (restock, refurbish, scrap), refund trigger.

### Object lifecycles
- **Shipment:** Booked → Label created → Picked up → In transit (hub events) → Out for delivery → Delivered; or Delivery attempted → Re-scheduled / Held at location → Returned to origin; or Cancelled (before pickup); Exception states (Damaged, Lost, Customs hold).
- **Inbound receipt:** Expected (ASN) → Arrived → Receiving → Received (with or without discrepancy) → Put away → Closed.
- **Outbound order (WMS):** Released → Allocated → Picking → Picked → Packed → Loaded → Shipped; Short-picked → Backorder.
- **Load / trip:** Planned → Tendered → Accepted (or Rejected → re-tendered) → Dispatched → In progress → Completed → Invoiced → Audited.

## Regulations and standards
- **Dangerous goods:** IATA Dangerous Goods Regulations (air), IMDG Code (sea), ADR (road, Europe), US 49 CFR (hazmat) — classification, UN number, packaging, quantity limits, documentation, segregation.
- **Driver and vehicle:** US FMCSA Hours of Service and ELD mandate; EU drivers' hours (Regulation 561/2006) and tachograph rules; India Motor Vehicles Act e-way bill rules for goods movement under GST.
- **Customs and trade:** WCO Harmonized System, Incoterms 2020, US ACE / ISF (10+2), EU Import Control System 2 (ICS2), Union Customs Code, export controls and denied-party screening (EAR, OFAC sanctions lists).
- **Cold chain and pharma:** EU Good Distribution Practice (GDP) guidelines, US FDA Food Safety Modernization Act (FSMA) sanitary transportation rule, US DSCSA serialisation for prescription drug supply chain.
- **Contracts and liability:** CMR Convention (road), Montreal Convention (air), Hague-Visby rules (sea) for liability limits; carrier claims time limits.
- **Data and standards:** GS1 identification keys and barcodes, EDI X12 / EDIFACT, GDPR / CCPA for consignee personal data, driver location privacy.

## Risk hotspots
- Out-of-order, duplicate and late scan events corrupting status and ETA.
- Dimensional weight and chargeable weight calculations, rounding and unit conversions (kg / lb, cm / in).
- Inventory accuracy: concurrent picks, partial picks, negative stock, lot / expiry handling (FEFO).
- Time zones across legs; cut-off times for same-day / next-day services; holidays per country.
- Offline mobile apps (driver, RF scanner) syncing later; conflicting updates.
- Proof of delivery integrity (photo, signature, geofence, OTP); delivery fraud.
- Dangerous goods acceptance and segregation rules.
- Customs data quality (HS codes, values, currencies) causing holds.
- EDI mapping errors between partners; carrier API version changes.
- Billing disputes from accessorial charges.

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Volumetric weight | Volumetric weight (kg) = L × W × H (cm) ÷ divisor (5 000 common for express / courier, 6 000 for some air / road; air cargo standard 6 000 cm³ per kg) | Box dims giving volumetric < actual, = actual, > actual; per-carrier divisor |
| Chargeable weight | Chargeable weight = max(actual weight, volumetric weight), rounded up to the carrier increment (e.g. 0.5 kg) | Weights at 0.49, 0.5, 0.51 kg |
| Freight charge | Charge = base rate (zone, service, chargeable weight) + fuel surcharge % × base + accessorials (residential, liftgate, remote area, Saturday) − discount; tax per jurisdiction | Each accessorial on and off; surcharge % change date |
| LTL density class | Density = weight (lb) ÷ volume (ft³); NMFC class derived from density bands | Values at band edges |
| Cut-off time | Shipment booked before service cut-off (origin local time) ships today; else next business day | Booking at cut-off − 1 min, at cut-off, on a holiday |
| Delivery promise (ETA) | ETA = pickup date + transit days (business days, excluding origin / destination holidays) | Pickups before weekends and holidays; cross-border holidays |
| FEFO allocation | Pick lot with earliest expiry first that still meets minimum remaining shelf life for the customer | Lots with expiry before, at and after the shelf-life threshold |
| Put-away rule | Suggested location by product attributes (size, weight, hazmat class, temperature) and capacity | Full location, mixed SKU restriction, hazmat segregation |
| Receiving tolerance | Accept if received qty within ASN qty ± tolerance %; over / under beyond tolerance needs supervisor | Quantities at tolerance edge and just outside |
| Hours of Service (US property carriers) | 11 h driving limit after 10 h off duty; 14-h driving window; 30-min break after 8 h cumulative driving; 60 / 70 h in 7 / 8 days | Trip plans just within and just over each limit |
| Detention / demurrage | Charge = (dwell time − free time) × hourly / daily rate when positive | Dwell at free time, free time + 1 unit |
| Cold chain excursion | Excursion if temperature outside range for > allowed duration | Readings at limits; short spike vs sustained deviation |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | Booking, rating, labels, warehouse receiving / picking / packing / shipping, inventory adjustments, dispatch, POD, exceptions, returns, freight audit |
| Regression | Rate card updates, carrier service changes, EDI map changes, WMS rule changes before peak season |
| API | Carrier APIs (rate, ship, track, cancel), tracking event webhooks (idempotency, ordering), EDI translation, customs filing APIs |
| UI/UX | RF scanner screens (large targets, scan-first flow, audible feedback), driver app one-handed use, dispatch board map, tracking page clarity |
| Localisation | Addresses and postal formats per country, units (metric / imperial), date / time per leg, languages for drivers and customers, customs documents per country |
| Accessibility | Customer tracking and booking portals (WCAG 2.1 AA), notification content, accessible delivery preferences |
| Security | Tracking-number enumeration exposing addresses, IDOR on shipments, driver app tampering (fake GPS, POD photos), EDI / API credential protection, sanctions screening bypass |
| Performance | Peak-season scan event throughput, label generation rate per minute, wave release on large order volumes, route optimisation time, tracking page load during peaks |
| Integration | ERP / OMS order feed, carriers, EDI partners, telematics, customs systems, payment / COD reconciliation, marketplaces |
| Data migration | WMS cut-over (inventory by location / lot / serial, open orders, open ASNs), TMS rate cards and carrier master, historic shipments for claims |
| Resilience | Offline RF / driver app operation and sync, carrier API outage (fallback carrier or queued labels), message queue backlog, hub network outage |

## Scenario bank
ID convention: `LOG-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LOG-FUN-POS-001 | Book a domestic parcel with dimensions and weight | Rate = chargeable weight × zone rate + surcharges; label with tracking number generated | P1 |
| LOG-FUN-POS-002 | Receive an inbound ASN with matching quantities and lots | GRN created; inventory increased by lot; put-away tasks generated to valid locations | P1 |
| LOG-FUN-POS-003 | Pick, pack and ship an order with two SKUs | Pick confirmed by scan; carton label; ship confirm sends tracking to OMS | P1 |
| LOG-FUN-POS-004 | Driver delivers with signature and photo POD inside the geofence | Status Delivered with timestamp, GPS and POD images; customer notified | P1 |
| LOG-FUN-POS-005 | Customer tracks a shipment by tracking number | Timeline with events in correct order and local times; ETA shown | P2 |
| LOG-FUN-POS-006 | Cycle count with no variance | Count confirmed; no adjustment posted | P3 |
| LOG-FUN-POS-007 | Carrier invoice matches rated shipments | Invoice auto-approved for payment | P2 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LOG-FUN-NEG-001 | Book a shipment to a non-serviceable postal code | Validation error with serviceability message; no label | P2 |
| LOG-FUN-NEG-002 | Scan the wrong SKU at pick | Error tone and message; pick not confirmed | P1 |
| LOG-FUN-NEG-003 | Dangerous goods declared for a service that does not accept them | Booking blocked with DG rule message | P1 |
| LOG-SEC-NEG-004 | Iterate tracking numbers on the public tracking page | Rate limited; only non-sensitive status shown; no full address or phone | P1 |
| LOG-FUN-NEG-005 | Put-away to a location reserved for another temperature zone | Rejected with reason; alternative location suggested | P2 |
| LOG-FUN-NEG-006 | Driver tries POD outside the delivery geofence | Warning / block per policy; exception logged | P2 |
| LOG-FUN-NEG-007 | Consignee on a denied-party list | Shipment held for compliance review; no label until cleared | P1 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LOG-FUN-BVA-001 | Package at the maximum weight per piece (e.g. 70 kg) and 70.1 kg | 70 accepted; 70.1 → freight service or rejection | P2 |
| LOG-FUN-BVA-002 | Volumetric weight equal to actual weight | Chargeable weight = that value; no double counting | P3 |
| LOG-FUN-BVA-003 | Booking at service cut-off and one minute after | Ships today vs next business day | P2 |
| LOG-FUN-BVA-004 | Received quantity at ASN + tolerance and + tolerance + 1 | Auto-accept vs supervisor approval | P2 |
| LOG-FUN-BVA-005 | Lot with remaining shelf life exactly at customer minimum | Allocated per rule (≥ minimum) | P2 |
| LOG-FUN-BVA-006 | Driver at 11 h driving and 11 h 1 min | Within limit; violation flagged | P2 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LOG-FUN-E2E-001 | Order from ERP → WMS wave → pick / pack → TMS load → carrier tender → pickup → delivery → POD → invoice → freight audit | Status and quantities consistent end to end; invoice matched | P1 |
| LOG-FUN-E2E-002 | Failed delivery attempt → NDR → customer reschedules → second attempt → delivered | Exception and reattempt recorded; notifications sent; no extra charge unless configured | P1 |
| LOG-FUN-E2E-003 | International shipment → export filing → customs hold → documents supplied → release → duties invoiced → delivered | Holds and release reflected in tracking; duties billed to correct party per incoterm | P1 |
| LOG-FUN-E2E-004 | Customer return → pickup → receive at returns centre → inspect → restock → refund trigger to OMS | Inventory status by disposition; refund event sent once | P2 |
| LOG-FUN-E2E-005 | Cold chain shipment with sensor; excursion during transit | Alert raised; shipment flagged; quality hold on receipt | P2 |
| LOG-FUN-E2E-006 | Cross-dock: inbound pallet allocated directly to outbound load | No put-away; outbound shipped within dock time | P3 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LOG-FUN-BUS-001 | Carrier rejects tender | Auto-tender to next carrier in routing guide; cost difference recorded | P2 |
| LOG-FUN-BUS-002 | Fuel surcharge percentage changes weekly | New % applied to shipments booked from the effective date | P2 |
| LOG-FUN-BUS-003 | Short pick: only 3 of 5 units available | Partial ship or backorder per customer rule; OMS informed | P1 |
| LOG-FUN-BUS-004 | Cash-on-delivery shipment | Amount collected recorded on POD; remittance reconciled to shipper | P2 |
| LOG-FUN-BUS-005 | Carrier invoice includes an unapproved accessorial | Line disputed; invoice held for that amount | P2 |
| LOG-FUN-BUS-006 | 3PL monthly billing for storage and handling | Storage per pallet-day and handling per unit billed from activity data | P3 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LOG-FUN-EDG-001 | "Delivered" scan received before "Out for delivery" scan | Status remains Delivered; timeline ordered by event time; no regression | P1 |
| LOG-FUN-EDG-002 | Duplicate tracking event from carrier webhook | Processed once (idempotent) | P2 |
| LOG-RES-EDG-003 | Driver app offline for the whole route, syncs at end of day | All POD events uploaded with original timestamps; conflicts resolved | P1 |
| LOG-FUN-EDG-004 | Shipment crossing time zones and DST change | Event times shown in local time of each location; ETA correct | P3 |
| LOG-FUN-EDG-005 | Two pickers pick the last unit of the same location concurrently | One succeeds; the other gets a short-pick task; no negative stock | P1 |
| LOG-L10N-EDG-006 | Addresses with non-Latin scripts and no postal code (e.g. some countries) | Accepted per country rules; label printed with transliteration if required | P3 |

## Integrations
ERP / OMS order and inventory feeds, carrier APIs (rate, label, track), EDI partners (X12 / EDIFACT through VAN or AS2), telematics / ELD, IoT sensors (temperature, shock), customs platforms, denied-party screening, address validation and geocoding, route optimisation engines, payment and COD reconciliation, marketplace and eCommerce platforms, notification services (SMS, email, WhatsApp).

## Non-functional profile
- Peak season scan events of several thousand per second for large carriers; tracking API p95 < 1 s.
- Label generation SLA (e.g. < 2 s per label) and throughput per pack station.
- Wave planning and route optimisation completing within the operational window.
- Offline-first mobile apps with reliable sync; RF scanners on low bandwidth.
- Event latency from scan to customer notification within minutes.

## Test data
Locations with serviceable / non-serviceable postal codes and remote-area flags, rate cards and zones, package profiles (small, heavy, oversized, dimensional), dangerous goods examples by class (test data only), SKUs with lots and expiry dates, warehouse layout with zones and temperature areas, carriers with routing guides, drivers with HOS histories, international shipments with HS codes and incoterms, synthetic consignee personal data.

## Automation notes
- Automate first: rating and chargeable weight, booking / label, tracking event state machine (order, duplicates), WMS receive-pick-ship, POD flow.
- Simulate scan and carrier events through APIs / message queues with controlled timestamps; replay out-of-order sequences.
- Oracles: independent rate calculator; inventory reconciliation (receipts − shipments ± adjustments = on hand).
- Mobile (driver / RF) flows through the mobile project with network throttling and offline toggles.
- Automation mapping (<AppName>/): page objects for booking, tracking, dispatch board; screens for driver app; API services for shipments, tracking events, inventory; features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Domain-Retail, Domain_Test_Design_Skill-Domain-Manufacturing, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData.
