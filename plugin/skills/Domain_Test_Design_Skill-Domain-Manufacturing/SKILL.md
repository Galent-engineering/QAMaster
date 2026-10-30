---
name: "Domain_Test_Design_Skill-Domain-Manufacturing"
description: "Manufacturing domain test design sub-skill of Domain_Test_Design_Skill: discrete, process and regulated manufacturing (ERP manufacturing modules, MES / MOM, PLM and engineering change, bill of materials and routings, MRP and production planning, shop-floor execution, quality management and inspection, lot / serial traceability and genealogy, maintenance (CMMS / EAM), procurement and inventory, industrial IoT and OEE), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is an ERP (SAP PP/QM/MM, Oracle, Dynamics, Infor), MES, PLM, QMS, CMMS, shop-floor or IIoT application, or when TestGen / Domain_Test_Design_Skill routes a manufacturing application here."
---

# Manufacturing — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for manufacturing business and shop-floor systems: product definition (BOM, routings, engineering changes), planning (MRP, capacity, scheduling), execution (production orders, material issue, operations, confirmations, scrap), quality (inspections, nonconformance, CAPA), traceability, maintenance, inventory and costing, and IIoT data. Quantities, units of measure, versions and traceability across levels are the main risks; regulated industries add validation and electronic-record rules. Safety-critical control logic (PLC / DCS) is outside scope except at its business-system interfaces. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Sub-domains:** discrete (assembly, make-to-stock / make-to-order / engineer-to-order), process (batch, recipes, co-products and by-products), repetitive / flow, regulated manufacturing (pharma, medical devices, food, automotive, aerospace); systems: ERP manufacturing modules, MES / MOM, PLM, advanced planning and scheduling (APS), QMS / LIMS, CMMS / EAM, WMS for plants, SCADA / historian interfaces, IIoT platforms and OEE dashboards, supplier portals.
- **Users:** product / design engineer, manufacturing engineer, planner / scheduler, buyer, shop-floor operator, supervisor, quality inspector, quality engineer, maintenance technician, warehouse / stores, cost accountant, plant manager, supplier.
- **Business drivers:** on-time delivery, OEE, yield and scrap rate, first-pass yield, inventory turns, cost variances, traceability for recalls, compliance and audit readiness, unplanned downtime.

## Detection signals
- UI: material / item master, BOM tree (multi-level), routing with work centres and operations, production order with status, material issue / backflush, operation confirmation (yield, scrap, time), inspection lot with characteristics, nonconformance report, MRP run results (planned orders, exception messages), Gantt schedule, OEE dashboard, work order for maintenance, genealogy / where-used reports.
- Terms: BOM, routing, work centre, operation, production / work order, MRP, MPS, planned order, lead time, lot size, safety stock, backflush, scrap, yield, WIP, batch / lot, serial number, genealogy, ECO / ECN, revision, inspection plan, AQL, NCR, CAPA, OEE, downtime reason, PM (preventive maintenance), ISA-95 levels.
- Standards / interfaces: ISA-95 / IEC 62264 (B2MML), ISA-88 (batch), OPC UA, MQTT, GS1 / UDI labels, EDI with suppliers and customers.

## Business objects and workflows

### Business objects
Material / item (raw, semi-finished, finished, phantom), unit of measure and conversions, BOM (versions, effectivity, alternates), routing / recipe, work centre / resource, capacity calendar, engineering change order, demand (sales order, forecast), MPS, MRP planned order, purchase requisition / order, production order / work order, operation, material reservation, goods issue, goods receipt, confirmation, scrap record, batch / lot, serial number, genealogy record, inspection plan, inspection lot, characteristic and result, nonconformance, CAPA, deviation, certificate of analysis, equipment / asset, maintenance plan, maintenance work order, downtime event, cost estimate, variance.

### Core workflows
1. Engineering: create / revise item and BOM in PLM → engineering change order with effectivity date or serial → release to ERP / MES.
2. Planning: demand (orders and forecast) → MPS → MRP run (net requirements, lot sizing, lead-time offset) → planned orders and purchase requisitions → exception messages (expedite, defer, cancel).
3. Capacity and scheduling: load on work centres, finite scheduling, sequencing, rescheduling for rush orders or breakdowns.
4. Procurement: convert requisitions to POs, supplier confirmation, receipt with incoming inspection, supplier quality.
5. Production execution: release order (availability check) → material issue (manual or backflush) → operations performed and confirmed (yield, scrap, rework, labour / machine time) → goods receipt of finished goods → order technically complete → settlement of costs.
6. Batch / process manufacturing: recipe with phases, scaling to batch size, potency adjustments, co-products and by-products, electronic batch record.
7. Quality: in-process and final inspection with sampling (AQL), results within specification, usage decision (accept, reject, rework), nonconformance → CAPA, certificate of analysis.
8. Traceability: lot / serial genealogy forward (where-used) and backward (where-from); recall simulation.
9. Maintenance: preventive / predictive maintenance plans, breakdown work orders, spare parts, equipment status affecting scheduling.
10. Inventory and costing: stock by location / batch / status, cycle counts, standard cost roll-up, production variances.
11. IIoT and OEE: machine states and counts from PLCs / sensors → OEE calculation → downtime reasons → alerts.

### Object lifecycles
- **Production order:** Created → Released → In process (partially confirmed) → Confirmed (all operations) → Delivered (goods receipt) → Technically complete → Closed (after settlement); or Cancelled / On hold.
- **Engineering change:** Draft → Under review → Approved → Effective (date / serial) → Implemented → Closed.
- **Batch / lot:** Created → In quality inspection / Quarantine → Released (unrestricted) / Rejected / Blocked → Consumed / Shipped → Expired.
- **Nonconformance / CAPA:** Opened → Contained → Root cause analysis → Corrective action → Verification of effectiveness → Closed.
- **Maintenance work order:** Requested → Approved → Planned → Scheduled → In progress → Completed → Closed.

## Regulations and standards
- **Quality management:** ISO 9001 (QMS), IATF 16949 (automotive, with PPAP and APQP), AS9100 (aerospace), ISO 13485 (medical devices).
- **Regulated manufacturing (where relevant):** US FDA 21 CFR Part 11 (electronic records and signatures), 21 CFR Parts 210 / 211 (drug cGMP), 21 CFR Part 820 (medical device quality system, now aligned with ISO 13485 via the Quality Management System Regulation effective February 2026), EU GMP Annex 11 (computerised systems), GAMP 5 risk-based validation, UDI rules for devices, US DSCSA serialisation for drugs; food: FSMA, HACCP, ISO 22000.
- **Industrial integration and security:** ISA-95 / IEC 62264 (enterprise-control integration), ISA-88 (batch control), IEC 62443 (industrial automation security), OPC UA.
- **Environment, health and safety:** ISO 14001, ISO 45001, REACH and RoHS (substance compliance in BOMs), conflict minerals reporting (US Dodd-Frank Section 1502).
- **Trade and labelling:** GS1 standards for labels; export control classification for items.

## Risk hotspots
- Wrong BOM version / effectivity used for an order; engineering changes not propagated to open orders.
- Unit-of-measure conversions (each / box / kg / litre), rounding of fractional quantities, potency-adjusted quantities.
- MRP netting errors: safety stock, lead times, lot-sizing rules, pegging and exception messages.
- Backflushing at wrong time or quantity; negative stock; scrap not consumed correctly.
- Traceability gaps in genealogy (split / merged lots, rework, alternates).
- Quality holds bypassed (using quarantined material).
- Electronic signature and audit trail requirements in regulated plants.
- Shop-floor UI usability (gloves, touch screens, barcode scanners) and offline operation when network drops.
- Data volume and latency from IIoT sensors; time synchronisation between machines and systems.
- Cost roll-up and variance calculations.

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Component requirement | Required qty = order qty × component qty per parent ÷ base qty × (1 + component scrap %) ÷ (1 − operation scrap %) per configuration; converted to issue UoM | Different base quantities, scrap %, UoM conversions |
| MRP net requirement | Net = gross requirement − on hand − scheduled receipts + safety stock (+ allocated); planned order if net > 0 | Inventory at, below and above safety stock |
| Lot sizing | Lot-for-lot, fixed lot (multiples of fixed qty), min / max lot, rounding value, EOQ = √(2DS ÷ H) | Net requirement just above a multiple; min and max constraints |
| Lead-time offset | Planned order start = due date − (production / purchase lead time + safety time) on working days | Due dates after weekends / plant holidays |
| Backflush | Components consumed = confirmed yield (and scrap if configured) × qty per | Partial confirmation; scrap confirmation |
| Yield | Yield % = good qty ÷ total qty processed × 100; first-pass yield excludes reworked units | Rework scenarios |
| OEE | OEE = Availability × Performance × Quality; Availability = run time ÷ planned production time; Performance = (ideal cycle time × total count) ÷ run time; Quality = good count ÷ total count | Values with downtime, slow cycles and rejects; zero planned time |
| Sampling (AQL) | Sample size and accept / reject numbers from lot size and inspection level per ISO 2859-1 tables | Lot sizes at table boundaries; defects at accept number and +1 |
| Specification check | Result within lower and upper specification limits (inclusive per definition) → pass; else fail and NCR | Results at LSL, USL, just outside |
| Batch scaling and potency | Actual qty = recipe qty × (batch size ÷ recipe base) × (standard potency ÷ actual potency) | Potency above / below standard |
| Shelf life / expiry | Expiry date = manufacture date + shelf life; usable if remaining shelf life ≥ required minimum | Expiry today, tomorrow; minimum remaining days |
| Standard cost variance | Variance = actual cost − standard cost × actual output (split into price, usage, efficiency where configured) | Over-consumption, scrap, labour overrun |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | BOM and routing maintenance, ECO effectivity, MRP results, order release and availability check, confirmations, backflush, goods movements, inspections and usage decisions, NCR / CAPA, maintenance orders, costing |
| Regression | ERP / MES upgrades and patches; changes to MRP parameters; recipe changes; regulated change control with validation evidence |
| API | MES ↔ ERP order and confirmation messages (ISA-95 / B2MML), IIoT ingestion (MQTT / OPC UA gateways), PLM release interfaces, supplier EDI |
| UI/UX | Shop-floor terminals (large touch targets, glove use, scanning, minimal typing), supervisor dashboards, Gantt rescheduling, alarm visibility |
| Localisation | Multi-plant across countries: units, decimals, date / shift calendars, languages for operators, local labels and regulations |
| Accessibility | Office-facing portals (WCAG 2.1 AA); colour-independent status indicators on shop-floor screens |
| Security | Segregation of duties (create vs approve ECO, release batch), electronic signatures, audit trails, IT / OT network boundaries (IEC 62443), supplier portal access |
| Performance | MRP run time for full plant, scheduling optimisation time, high-frequency sensor ingestion, confirmations at shift change peaks, genealogy query time |
| Integration | PLM → ERP → MES → SCADA / historian; QMS / LIMS; WMS; CMMS; supplier and customer EDI; label printing |
| Data migration | Item masters, BOMs and routings with versions, open orders, stock by batch / serial, quality history, equipment and maintenance plans; validation evidence in GxP plants |
| Resilience | MES store-and-forward when ERP is down, shop-floor offline mode, sensor gateway loss, duplicate messages after reconnection |

## Scenario bank
ID convention: `MFG-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| MFG-FUN-POS-001 | Create a production order for a finished good with a two-level BOM | Components reserved with correct quantities; operations from routing; dates scheduled | P1 |
| MFG-FUN-POS-002 | Run MRP for a sales order with stock below requirement | Planned orders and purchase requisitions for the net requirement with lead-time offsets | P1 |
| MFG-FUN-POS-003 | Confirm an operation with yield and scrap | Order progress updated; components backflushed for yield + scrap per config; activity times recorded | P1 |
| MFG-FUN-POS-004 | Inspection lot results within specification | Usage decision Accept; batch released to unrestricted stock | P1 |
| MFG-FUN-POS-005 | Approve an ECO with an effectivity date | New BOM version used for orders created on / after the date | P2 |
| MFG-FUN-POS-006 | Backward genealogy for a finished serial number | All component lots and suppliers listed | P1 |
| MFG-FUN-POS-007 | Preventive maintenance plan generates a work order on schedule | Work order created on due date; equipment capacity reduced during maintenance | P3 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| MFG-FUN-NEG-001 | Release an order when a component is short | Availability check warning / block per configuration; missing parts list | P1 |
| MFG-FUN-NEG-002 | Issue material from a batch in quality inspection / blocked | Goods issue rejected | P1 |
| MFG-FUN-NEG-003 | Confirm more yield than order quantity beyond tolerance | Error or approval required per over-delivery tolerance | P2 |
| MFG-SEC-NEG-004 | Same user creates and approves an ECO | Blocked by segregation-of-duties rule | P1 |
| MFG-FUN-NEG-005 | Result outside specification limits | Inspection fails; NCR created; batch not released | P1 |
| MFG-FUN-NEG-006 | Scan a component lot that is not on the order's BOM | Rejected with message; no consumption posted | P2 |
| MFG-SEC-NEG-007 | Electronic signature with wrong password for batch release (Part 11 system) | Signature rejected; attempt logged; release not performed | P1 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| MFG-FUN-BVA-001 | Net requirement just above a fixed lot size multiple (e.g. 101 with lot 100) | Planned quantity 200 (two lots) per rule | P2 |
| MFG-FUN-BVA-002 | Stock exactly at safety stock | No planned order generated (net = 0) | P2 |
| MFG-FUN-BVA-003 | Measured value equal to USL and USL + smallest increment | Pass vs fail | P1 |
| MFG-FUN-BVA-004 | Over-delivery tolerance of 5 %: confirm 105 and 106 on an order of 100 | 105 allowed; 106 blocked | P2 |
| MFG-FUN-BVA-005 | Lot expiring today with minimum remaining shelf life of 0 and 1 day | Allocation allowed / blocked per rule | P2 |
| MFG-FUN-BVA-006 | AQL lot size at a sampling table boundary | Sample size code changes as per the table | P3 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| MFG-FUN-E2E-001 | Sales order → MRP → purchase order → receipt with incoming inspection → production order → confirmations → final inspection → goods receipt → delivery → costing | Quantities, batches and costs consistent across modules; variance posted | P1 |
| MFG-INT-E2E-002 | ERP releases order to MES → operator executes on the shop floor → MES confirmations back to ERP | Statuses and quantities synchronised; no duplicate confirmations | P1 |
| MFG-FUN-E2E-003 | Supplier lot found defective → backward / forward genealogy → recall list of shipped finished goods | All affected batches and customers identified | P1 |
| MFG-FUN-E2E-004 | ECO changes a component → open orders identified → stock of old component used up → new component effective | Orders follow effectivity; obsolete stock handled per decision | P2 |
| MFG-FUN-E2E-005 | Machine breakdown → maintenance work order → schedule rescheduled → order dates updated → customer promise date revised | Capacity and dates updated consistently | P2 |
| MFG-FUN-E2E-006 | Nonconformance → containment (block lots) → CAPA → effectiveness check → closure | All steps recorded with signatures and dates | P2 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| MFG-FUN-BUS-001 | Rush order inserted into a full schedule | Schedule re-sequenced; impacted orders flagged; overtime / alternate work centre proposed | P2 |
| MFG-FUN-BUS-002 | Rework of a defective batch | Rework order consumes and returns the batch; genealogy keeps both | P2 |
| MFG-FUN-BUS-003 | Process batch with potency-adjusted active ingredient | Ingredient quantity scaled by potency; filler adjusted | P1 |
| MFG-FUN-BUS-004 | Co-product and by-product from one process order | Goods receipts for each output with cost apportioned per rule | P3 |
| MFG-FUN-BUS-005 | OEE for a shift with planned and unplanned downtime | OEE = A × P × Q matches independently computed values | P2 |
| MFG-FUN-BUS-006 | Substance compliance (RoHS) check on a new BOM | Non-compliant component flagged before release | P3 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| MFG-FUN-EDG-001 | UoM conversion with fractional result (e.g. 1 box = 12 each; need 13 each) | Rounded per rule (2 boxes or 1.0833 if allowed) without loss | P2 |
| MFG-RES-EDG-002 | ERP unavailable for 30 minutes; MES continues | Confirmations stored and forwarded once in order; no duplicates | P1 |
| MFG-FUN-EDG-003 | Order spanning a shift change and plant holiday | Scheduled times skip non-working periods | P3 |
| MFG-FUN-EDG-004 | Lot split into two and later merged | Genealogy shows parent-child relationships correctly | P2 |
| MFG-FUN-EDG-005 | Phantom assembly in BOM | Phantom exploded; its components reserved directly; phantom not stocked | P3 |
| MFG-INT-EDG-006 | Sensor timestamps out of sync with MES clock | Events aligned by configured source; OEE not double-counted | P3 |

## Integrations
PLM (engineering data), ERP (planning, procurement, inventory, costing), MES / MOM, APS, WMS, QMS / LIMS, CMMS / EAM, SCADA / historian / IIoT platforms (OPC UA, MQTT), label printing and serialisation systems, supplier and customer EDI / portals, transport management, regulatory submission systems (for devices / drugs), BI and analytics.

## Non-functional profile
- MRP runs for tens of thousands of items within the planning window (often overnight or net-change runs hourly).
- Shop-floor transactions with sub-second response at terminals; offline tolerance.
- IIoT ingestion of many signals per machine per second; data retention in historians.
- Genealogy queries over years of production in seconds for recalls.
- High availability during production shifts; planned downtime only in maintenance windows.

## Test data
Item masters across types with UoM conversions, multi-level BOMs with versions, alternates and phantoms, routings with work centres and calendars, stock by batch / serial and status, suppliers with lead times, inspection plans with specifications, recipes with potency, equipment with maintenance plans, simulated sensor streams, users per role for segregation-of-duties tests.

## Automation notes
- Automate first: component requirement and MRP calculations (API / data-driven), order lifecycle, inspection decisions, genealogy queries, ERP ↔ MES message exchange.
- Oracles: independent MRP / requirement calculator; stock reconciliation (opening + receipts − issues ± adjustments = closing); OEE calculator.
- Simulate machines and sensors with message generators; control clocks for shift and calendar logic.
- In regulated environments, keep test evidence (screenshots, audit trails) per validation protocol.
- Automation mapping (<AppName>/): page objects for item / BOM, production order, confirmation terminal, inspection, maintenance order; API services for orders, confirmations, inventory, quality results; features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Desktop, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-App-DataPlatform, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Domain-LifeSciences, Domain_Test_Design_Skill-Domain-Logistics, Domain_Test_Design_Skill-Core-Techniques.
