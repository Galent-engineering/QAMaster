---
name: "Domain_Test_Design_Skill-Domain-Education"
description: "Education domain test design sub-skill of Domain_Test_Design_Skill: K-12 and higher education, EdTech and corporate learning (student information systems, admissions and enrolment, timetabling, learning management systems, online assessments and proctoring, gradebooks and transcripts, fees and financial aid, attendance, parent and student portals, library, credentials and certificates), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is an SIS, LMS (Moodle, Canvas, Blackboard, D2L), admissions portal, exam or proctoring platform, gradebook, fee or financial aid system, learning app or corporate LMS, or when TestGen / Domain_Test_Design_Skill routes an education application here."
---

# Education — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for education systems: admissions and enrolment, student records, course catalogue and timetabling, learning management (content, assignments, discussions), assessments and proctoring, grading, GPA and transcripts, attendance, fees and financial aid, communication with students and parents, and credentials. Users include minors, so privacy and safeguarding rules are strict; academic calendars create sharp load peaks (registration day, exam windows, results day). Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Sub-domains:** student information system (SIS), admissions and enrolment management, course catalogue, scheduling and timetabling, learning management system (LMS), online assessment and e-proctoring, gradebook and academic records (GPA, transcripts, degree audit), attendance, fees, billing and financial aid / scholarships, parent and student portals, communication (announcements, messaging), library, alumni and advancement, credentials and digital badges, corporate learning (LXP, compliance training), EdTech consumer apps.
- **Users:** applicant, student (including minors), parent / guardian, instructor / teacher, teaching assistant, advisor, registrar, admissions officer, bursar / finance, financial aid officer, exam proctor, school administrator, district / institution admin, corporate learner and manager.
- **Business drivers:** enrolment and retention, learning outcomes, timely and accurate grades, compliance with privacy and accessibility, fee collection, accreditation reporting, exam integrity.

## Detection signals
- UI: application form with programme choice and document upload, course search and registration with sections and seats, timetable view, course pages with modules, assignments and due dates, quiz player with timer, gradebook, transcript download, attendance register, fee statement and payment, parent dashboard.
- Terms: term / semester / academic year, course, section, credit hours, prerequisite, co-requisite, waitlist, add / drop deadline, GPA / CGPA, grade scale, transcript, degree audit, rubric, submission, plagiarism / similarity score, proctoring, accommodation (extra time), enrolment status (full-time / part-time), FAFSA, Title IV, cohort, roster.
- Standards / APIs: IMS Global / 1EdTech LTI 1.3 (tool launch), OneRoster (rosters and grades), QTI (assessment items), Caliper / xAPI (learning analytics), SCORM / cmi5 (e-learning packages), Open Badges, CEDS data standards, Ed-Fi (K-12 data).

## Business objects and workflows

### Business objects
Applicant, application, document, offer / decision, student, guardian, programme / degree, curriculum / degree requirements, course, section / class, term, timetable slot, room, instructor, enrolment / registration, waitlist entry, prerequisite rule, attendance record, assignment, submission, rubric, quiz / exam, question bank item, attempt, grade item, final grade, grade scale, GPA, transcript, academic standing, accommodation, fee item, invoice, payment, financial aid award, scholarship, refund, certificate / badge, announcement, message.

### Core workflows
1. Admissions: application → fee payment → document verification → evaluation / interview → decision → offer acceptance and deposit → matriculation.
2. Enrolment and registration: course search → prerequisite / co-requisite / credit-limit checks → seat or waitlist → add / drop within deadlines → timetable clash detection → enrolment confirmed.
3. Timetabling: sections, rooms, instructors and time slots scheduled without conflicts; room capacity respected.
4. Teaching in the LMS: publish modules and content, release conditions, assignments with due dates and late policy, discussions, announcements.
5. Assessment: create quiz / exam from question bank, time limits and attempts, accommodations (extra time), proctoring (identity check, monitoring), submission, auto-grading and manual grading, plagiarism / similarity check.
6. Grading: gradebook weighting, rubrics, grade release, final grade submission to SIS, grade changes with approval, incomplete grades.
7. Academic records: GPA / CGPA calculation, academic standing (good standing, probation), degree audit, transcript request and issue, graduation clearance.
8. Attendance: daily / period attendance, absence notifications to guardians, attendance thresholds for exam eligibility.
9. Fees and financial aid: fee assessment by programme and credits, instalments, scholarships and waivers, aid disbursement, refunds on withdrawal per schedule.
10. Communication: announcements, messaging between teacher, student and guardian, emergency notifications.
11. Credentials: certificates, digital badges, verification by third parties.

### Object lifecycles
- **Application:** Draft → Submitted → Under review → Interview → Decision (Admitted / Waitlisted / Rejected) → Offer accepted / Declined → Enrolled.
- **Course registration:** Not registered → Waitlisted → Registered → Dropped (before deadline, no record) / Withdrawn (after deadline, W grade) → Completed (graded).
- **Submission:** Not submitted → Draft → Submitted (on time / late) → Graded → Returned → Resubmitted (if allowed).
- **Grade:** Not entered → Entered → Released to student → Final submitted to SIS → Changed (with approval) → Locked on term close.

## Regulations and standards
- **Student privacy:** US FERPA (education records; parental rights transfer to the student at 18 or on entering post-secondary; directory information opt-out), COPPA (online collection from children under 13 needs verifiable parental consent), state student-privacy laws (e.g. California SOPIPA); GDPR (and UK Age Appropriate Design Code for services likely accessed by children); India DPDP Act (verifiable parental consent for children under 18).
- **Safeguarding:** US Children's Internet Protection Act (CIPA) for schools / libraries receiving E-rate; institutional safeguarding policies for communication with minors.
- **Accessibility:** ADA Title II (US public institutions; 2024 DOJ rule requires WCAG 2.1 AA for web content and mobile apps of state and local governments, including public schools and universities), Section 504 and Section 508, EN 301 549 / European Accessibility Act, accommodations in assessments.
- **Financial aid (US):** Title IV Higher Education Act rules (satisfactory academic progress, Return of Title IV Funds on withdrawal), FAFSA processing.
- **Accreditation and reporting:** institutional accreditation bodies, US IPEDS reporting, state reporting (Ed-Fi), India UGC / AICTE / NAAC norms.
- **Interoperability:** 1EdTech standards (LTI 1.3 with OAuth2 / OIDC, OneRoster, QTI, Caliper, Open Badges), SCORM / xAPI / cmi5.
- **Payments:** PCI DSS for fee payments.

## Risk hotspots
- Grade and GPA calculation errors (weights, dropped lowest scores, repeated courses, pass / fail, rounding) and grade changes after release.
- Privacy of minors: guardian vs student access, FERPA directory opt-outs, data shared with LTI tools.
- Registration concurrency on popular sections; waitlist promotion order; seat over-allocation.
- Deadline logic in time zones (online students worldwide), DST, server vs user local time for due dates.
- Exam integrity: timer accuracy, auto-submit, reconnection after network loss, proctoring false flags, question shuffling, answer leakage via API.
- Accommodations (extra time, alternative formats) not applied consistently.
- Academic calendar peaks: registration opening, exam windows, results release.
- Integration sync errors between SIS and LMS (rosters, grade pass-back).
- Fee refunds on withdrawal and financial aid return calculations.

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Weighted course grade | Course % = Σ (category average × category weight) ÷ Σ weights of graded categories | Categories with no grades yet; weights not summing to 100 |
| Drop lowest | Category average excludes the N lowest scores (when count > N) | Count = N, N + 1; ties for lowest |
| Letter grade mapping | Letter from grade scale (e.g. A ≥ 93, A− ≥ 90 …); rounding rule applied before mapping | Scores at 89.49, 89.5, 89.99, 90 |
| GPA / CGPA | GPA = Σ (grade points × credit hours) ÷ Σ credit hours of GPA-bearing courses; pass / fail and withdrawals excluded; repeated course per policy (latest or highest) | Mixed credits, P/F, W, repeated course |
| Late penalty | Score = raw score × (1 − penalty % per day late), floored at 0 or capped days; grace period | Submissions at due time, due + 1 s, after cap |
| Registration eligibility | Allowed if prerequisites met (or concurrent co-requisite), no hold, within credit limit, no time clash, seat available | Each condition failing alone |
| Waitlist promotion | When a seat frees, first eligible waitlisted student is offered / enrolled in order; offer expires after N hours | Ineligible first student; expired offer |
| Attendance eligibility | Exam eligible if attendance % = attended ÷ held × 100 ≥ threshold (e.g. 75 %) | Attendance at 74.9 %, 75 %; excused absences treatment |
| Quiz time with accommodation | Allowed time = base time × multiplier (e.g. 1.5×) ; end time = start + allowed (capped by window close if configured) | Start near window close with extra time |
| Academic standing | Probation if term GPA or CGPA < threshold (e.g. 2.0); dismissal after consecutive probation terms | GPA at 1.99, 2.00 |
| Tuition refund on withdrawal | Refund % by withdrawal date per schedule (e.g. 100 % week 1, 50 % week 2, 0 % after) | Dates at each schedule boundary |
| Age-based consent | Under-13 account (COPPA) needs verified parental consent before data collection | Ages 12 and 13 at sign-up date |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | Admissions, registration rules, timetabling, LMS content and release conditions, assignments, quizzes, grading, GPA, transcripts, attendance, fees and refunds |
| Regression | Start-of-term regression (registration, rosters, LMS course copy), end-of-term regression (grading, GPA, transcripts), LMS version upgrades |
| API | LTI 1.3 launches and grade pass-back, OneRoster sync, SIS APIs, payment gateways, proctoring vendor APIs, xAPI statements |
| UI/UX | Student dashboard clarity (due dates, grades), mobile LMS, quiz player (timer visibility, saving answers), parent view, low-bandwidth use |
| Localisation | Languages of instruction, date formats and academic calendars, grade scales per country, names and scripts, RTL |
| Accessibility | WCAG 2.1 / 2.2 AA for LMS, quizzes (keyboard, screen reader, time extensions), course content (captions, alt text, accessible documents), math notation |
| Security | Role-based access (student, guardian, instructor, TA), IDOR on grades and submissions, quiz answer leakage, exam cheating vectors, account sharing, minors' data protection |
| Performance | Registration day concurrency, exam start spikes (thousands starting at the same minute), results day, video streaming in LMS |
| Integration | SIS ↔ LMS rosters and grades, identity (SSO, SAML / OIDC), payment, proctoring, plagiarism detection, library, video platforms, state / national reporting |
| Data migration | SIS / LMS migration: student records, historic transcripts and GPAs, course shells and content, question banks, grades and submissions |
| Resilience | Network loss during exams (autosave and resume), proctoring service outage, LMS outage near deadlines (deadline extension procedures), SIS sync failures |

## Scenario bank
ID convention: `EDU-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| EDU-FUN-POS-001 | Applicant submits a complete application and pays the fee | Status Submitted; acknowledgement sent; documents listed for verification | P1 |
| EDU-FUN-POS-002 | Student registers for a section with prerequisites met and seats available | Enrolled; timetable updated; roster synced to LMS | P1 |
| EDU-FUN-POS-003 | Student submits an assignment before the due date | Submission time-stamped On time; confirmation shown; instructor sees it | P1 |
| EDU-FUN-POS-004 | Instructor grades with a rubric and releases grades | Score = rubric total; student sees grade and feedback after release only | P1 |
| EDU-FUN-POS-005 | Term GPA calculated after final grades submitted | GPA = Σ (points × credits) ÷ Σ credits; transcript updated | P1 |
| EDU-FUN-POS-006 | Guardian views attendance and grades of their child (under 18) | Only linked child's data visible | P2 |
| EDU-FUN-POS-007 | Student pays fees in instalments | Each instalment posted; balance and receipts correct | P2 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| EDU-FUN-NEG-001 | Register without the prerequisite | Blocked with prerequisite message (unless override granted) | P1 |
| EDU-FUN-NEG-002 | Register for two sections with overlapping times | Time-clash error | P2 |
| EDU-SEC-NEG-003 | Student opens another student's submission or grade by changing the ID | 403 / 404; no data exposed | P1 |
| EDU-SEC-NEG-004 | Student retrieves quiz answers from the API before submission | Correct answers not present in any response before release | P1 |
| EDU-FUN-NEG-005 | Submit after the hard close date | Submission blocked with message (or late per policy) | P2 |
| EDU-SEC-NEG-006 | Guardian of an adult (18+) post-secondary student without student consent | No access to education records (FERPA) | P1 |
| EDU-FUN-NEG-007 | Under-13 sign-up without parental consent | Account limited / pending; no personal data collected beyond consent flow | P1 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| EDU-FUN-BVA-001 | Score of 89.49 and 89.5 with round-half-up to integer and A− ≥ 90 | B+ vs A− per rounding rule | P1 |
| EDU-FUN-BVA-002 | Credit load at maximum (e.g. 18) and maximum + 1 | 18 allowed; 19 needs approval | P2 |
| EDU-FUN-BVA-003 | Submission at exactly the due time and 1 second after | On time vs Late | P1 |
| EDU-FUN-BVA-004 | Attendance at 74.9 % and 75 % for exam eligibility | Not eligible vs eligible | P2 |
| EDU-FUN-BVA-005 | Last seat in a section taken by two students simultaneously | One enrolled; one waitlisted; no over-enrolment | P1 |
| EDU-FUN-BVA-006 | Withdrawal on the last day of the 100 % refund period and the day after | 100 % vs next tier refund | P2 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| EDU-FUN-E2E-001 | Application → admission → offer acceptance → student record → registration → LMS access | Student created once; rosters and LMS access on term start | P1 |
| EDU-FUN-E2E-002 | Assignment created → submitted → similarity check → graded → grade released → final grade to SIS → transcript | Grade consistent in LMS, SIS and transcript | P1 |
| EDU-FUN-E2E-003 | Proctored exam: identity check → timed attempt with accommodation → auto-submit at time end → grading → result | Extra time applied; attempt submitted automatically; result published on schedule | P1 |
| EDU-FUN-E2E-004 | Student withdraws mid-term → W grade → refund per schedule → financial aid recalculated | Records, refund and aid adjustments correct | P2 |
| EDU-FUN-E2E-005 | Degree audit → all requirements met → graduation clearance → certificate / badge issued → third-party verification | Credential verifiable and matches record | P2 |
| EDU-INT-E2E-006 | External tool launched via LTI 1.3 → activity completed → score passed back to gradebook | Launch authenticated; score appears in correct grade item | P2 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| EDU-FUN-BUS-001 | Repeated course with "latest grade counts" policy | Only latest attempt in GPA; both shown on transcript per policy | P2 |
| EDU-FUN-BUS-002 | Grade change after term close | Requires approval; audit trail; GPA and standing recalculated | P1 |
| EDU-FUN-BUS-003 | Waitlisted student promoted when a seat frees | Offer sent; enrolled on acceptance within the window; next student offered on expiry | P2 |
| EDU-FUN-BUS-004 | Academic probation after term GPA below 2.0 | Standing updated; advisor notified; registration hold if configured | P2 |
| EDU-FUN-BUS-005 | Directory-information opt-out (FERPA) | Student excluded from directories and public lists | P2 |
| EDU-FUN-BUS-006 | Course copy from previous term | Content and settings copied; due dates shifted; no student data copied | P3 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| EDU-RES-EDG-001 | Network drops during a timed quiz and returns after 2 minutes | Answers autosaved; timer behaviour per policy; attempt resumes | P1 |
| EDU-L10N-EDG-002 | Student in another time zone with due date 23:59 course time | Due date shown in student local time with course time zone noted; lateness computed correctly | P2 |
| EDU-FUN-EDG-003 | Due date on the DST change night | No 1-hour error in due time or lateness | P3 |
| EDU-FUN-EDG-004 | Category with all items excused | Category excluded from weighted grade; no division by zero | P2 |
| EDU-FUN-EDG-005 | Student turns 18 mid-year (K-12) | Access rules per institution policy and law; guardian access changes accordingly | P3 |
| EDU-PERF-EDG-006 | 5 000 students start an exam at the same minute | Exam loads within SLA; no lost attempts | P1 |

## Integrations
SIS ↔ LMS (OneRoster / vendor APIs), identity providers (SAML, OIDC, Google / Microsoft education tenants), LTI tools (publishers, video, plagiarism detection, proctoring), payment gateways, financial aid systems and government portals, library systems, timetabling engines, communication tools (email, SMS, push), credential platforms (Open Badges, blockchain certificates), state / national reporting (Ed-Fi, IPEDS), HR / payroll for staff.

## Non-functional profile
- Registration opening: very high concurrency within minutes; fair queueing.
- Exam windows: synchronised starts; autosave every few seconds; low-bandwidth support.
- Results day: high read load on grades and transcripts.
- LMS availability around deadlines; video streaming capacity.
- Long-term retention of academic records (often permanent for transcripts).

## Test data
Synthetic students across ages (under 13, 13–17, 18+), guardians linked to students, programmes with requirements, courses with prerequisites and sections with limited seats, grade scales and weighting schemes, accommodation profiles, question banks, fee schedules and refund tables, financial aid awards, historic grades for GPA and repeat scenarios. Never use real student records.

## Automation notes
- Automate first: registration rule checks, grade and GPA calculations (API / data-driven), submission lateness, quiz timer and auto-submit, role-based access.
- Oracles: independent grade / GPA calculator from grade scales and weights; roster comparison SIS vs LMS.
- Use frozen clocks and multiple time zones for due-date logic; generate per-test students and sections.
- Load-test exam starts and registration openings separately.
- Automation mapping (<AppName>/): page objects for application, registration, course page, assignment, quiz player, gradebook, transcript; API services for enrolments, grades, rosters; features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Domain-PublicSector, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData.
