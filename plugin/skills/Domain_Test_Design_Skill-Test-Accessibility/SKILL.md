---
name: "Domain_Test_Design_Skill-Test-Accessibility"
description: "Accessibility testing sub-skill of Domain_Test_Design_Skill: WCAG 2.2 Level A and AA conformance (perceivable, operable, understandable, robust), keyboard and focus, screen readers (NVDA, JAWS, VoiceOver, TalkBack), colour contrast, forms and errors, ARIA, mobile accessibility, documents, legal standards (ADA, Section 508, EN 301 549, European Accessibility Act), automated (axe, Lighthouse) and manual checks, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating accessibility tests for any application or domain."
---

# Accessibility testing (sub-skill of Domain_Test_Design_Skill)

Accessibility (a11y) testing verifies that people with visual, hearing, motor, speech and cognitive disabilities can perceive, operate and understand the product with their assistive technologies, measured against WCAG 2.2 Level AA. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Conformance to WCAG 2.2 Level A and AA success criteria (the target for most regulations).
- Real assistive-technology (AT) usability: screen readers, keyboard-only, switch access, voice control, magnification.
- Legal drivers: ADA (US, courts reference WCAG), Section 508 (US federal, WCAG 2.0 AA), EN 301 549 (EU public sector, WCAG 2.1 AA), European Accessibility Act (applies from 28 June 2025 to many private-sector products and services), AODA (Ontario), UK Public Sector Bodies Accessibility Regulations.
- Covers web, mobile native, desktop, PDFs and other documents, emails, video/audio.
- Automated tools find only about 30–40 % of issues; manual and AT testing are mandatory.

## When to apply
- Every customer-facing or employee-facing UI; mandatory for public sector, banking, healthcare, education, travel, retail and telecom in most jurisdictions.
- New components, design-system changes, new content types (video, charts, maps, documents).

| Application type | Relevance |
|---|---|
| Web | ● |
| API / microservices | ○ |
| Mobile | ● (TalkBack, VoiceOver, platform settings) |
| Desktop | ● (UI Automation / MSAA, NVDA/JAWS, VoiceOver on macOS) |
| Cloud / SaaS | ● |
| Image-based / AI | ● (alt text, non-visual alternatives for results) |
| Data platform | ◐ (dashboards, charts) |

## Checklist
**1 Perceivable**
- [ ] 1.1.1 Non-text Content (A): informative images have meaningful alt; decorative images `alt=""`; icons and image buttons have accessible names; CAPTCHAs have alternatives.
- [ ] 1.2.1–1.2.5 Time-based media (A/AA): captions for prerecorded (1.2.2) and live (1.2.4) video; audio description (1.2.5); transcripts for audio-only (1.2.1).
- [ ] 1.3.1 Info and Relationships (A): headings, lists, tables (th, scope, caption), landmarks, form labels programmatically associated.
- [ ] 1.3.2 Meaningful Sequence (A); 1.3.3 Sensory Characteristics (A): instructions not only "click the green button on the right".
- [ ] 1.3.4 Orientation (AA): works in portrait and landscape; 1.3.5 Identify Input Purpose (AA): `autocomplete` on personal-data fields.
- [ ] 1.4.1 Use of Color (A): colour is not the only means (errors, required fields, chart series, links in text).
- [ ] 1.4.2 Audio Control (A): auto-playing audio > 3 s can be paused/stopped.
- [ ] 1.4.3 Contrast (Minimum) (AA): text 4.5:1; large text (≥ 24 px, or ≥ 18.66 px bold) 3:1.
- [ ] 1.4.4 Resize Text (AA): 200 % without loss of content or function.
- [ ] 1.4.5 Images of Text (AA): real text instead of images of text.
- [ ] 1.4.10 Reflow (AA): content at 320 CSS px width (400 % zoom at 1280 px) without two-dimensional scrolling.
- [ ] 1.4.11 Non-text Contrast (AA): UI component boundaries, states and graphical objects 3:1.
- [ ] 1.4.12 Text Spacing (AA): no loss with line height 1.5, paragraph spacing 2×, letter spacing 0.12×, word spacing 0.16×.
- [ ] 1.4.13 Content on Hover or Focus (AA): tooltips dismissible (Esc), hoverable, persistent.

**2 Operable**
- [ ] 2.1.1 Keyboard (A): every function operable by keyboard; 2.1.2 No Keyboard Trap (A); 2.1.4 Character Key Shortcuts (A): single-key shortcuts can be turned off/remapped.
- [ ] 2.2.1 Timing Adjustable (A): session timeouts warned and extendable (≥ 20 s to respond); 2.2.2 Pause, Stop, Hide (A): carousels and auto-updating content.
- [ ] 2.3.1 Three Flashes or Below Threshold (A).
- [ ] 2.4.1 Bypass Blocks (A): skip link / landmarks; 2.4.2 Page Titled (A): unique, descriptive titles.
- [ ] 2.4.3 Focus Order (A): logical; modals trap focus while open and return it on close.
- [ ] 2.4.4 Link Purpose (In Context) (A): no ambiguous "click here" without context.
- [ ] 2.4.5 Multiple Ways (AA); 2.4.6 Headings and Labels (AA): descriptive.
- [ ] 2.4.7 Focus Visible (AA): visible focus indicator on every focusable element.
- [ ] 2.4.11 Focus Not Obscured (Minimum) (AA, new in 2.2): focused element not entirely hidden by sticky headers, cookie banners, chat widgets.
- [ ] 2.5.1 Pointer Gestures (A): multipoint/path gestures have single-pointer alternatives; 2.5.2 Pointer Cancellation (A): action on up-event.
- [ ] 2.5.3 Label in Name (A): accessible name contains the visible label text (voice control).
- [ ] 2.5.4 Motion Actuation (A): shake/tilt functions have UI alternatives and can be disabled.
- [ ] 2.5.7 Dragging Movements (AA, new in 2.2): drag-and-drop has a single-pointer alternative (buttons, menus).
- [ ] 2.5.8 Target Size (Minimum) (AA, new in 2.2): targets at least 24 × 24 CSS px or sufficient spacing.

**3 Understandable**
- [ ] 3.1.1 Language of Page (A): `lang` attribute; 3.1.2 Language of Parts (AA).
- [ ] 3.2.1 On Focus (A) / 3.2.2 On Input (A): no unexpected context change.
- [ ] 3.2.3 Consistent Navigation (AA); 3.2.4 Consistent Identification (AA).
- [ ] 3.2.6 Consistent Help (A, new in 2.2): help mechanisms in the same relative order across pages.
- [ ] 3.3.1 Error Identification (A): errors described in text; 3.3.2 Labels or Instructions (A).
- [ ] 3.3.3 Error Suggestion (AA); 3.3.4 Error Prevention (Legal, Financial, Data) (AA): reversible, checked or confirmed submissions.
- [ ] 3.3.7 Redundant Entry (A, new in 2.2): previously entered information auto-populated or selectable in the same process.
- [ ] 3.3.8 Accessible Authentication (Minimum) (AA, new in 2.2): no cognitive function test (memorising, transcribing, puzzles) without alternative; allow paste and password managers.

**4 Robust**
- [ ] 4.1.2 Name, Role, Value (A): custom widgets expose correct role, name, state (ARIA patterns per WAI-ARIA Authoring Practices).
- [ ] 4.1.3 Status Messages (AA): success/error/progress messages announced via live regions without moving focus.
- [ ] Note: 4.1.1 Parsing is obsolete and removed in WCAG 2.2.

**Assistive-technology checks**
- [ ] Screen readers: NVDA + Firefox/Chrome (Windows), JAWS + Chrome/Edge (Windows), VoiceOver + Safari (macOS, iOS), TalkBack + Chrome (Android).
- [ ] Headings list, landmarks list, form-fields list are meaningful; reading order matches visual order.
- [ ] Dynamic content (SPA route changes, modals, toasts, infinite scroll) announced; focus managed on route change.
- [ ] Keyboard-only: Tab/Shift+Tab, Enter/Space, arrow keys in composite widgets (menus, tabs, grids, listboxes), Esc closes overlays.
- [ ] Voice control (Voice Control macOS/iOS, Dragon): visible labels can be spoken.
- [ ] Magnification (ZoomText, OS zoom), Windows high-contrast / forced-colors mode, prefers-reduced-motion.

**Mobile specifics**
- [ ] Accessibility labels/traits (iOS) and contentDescription (Android); grouping; custom actions.
- [ ] Dynamic Type / font scaling up to the largest sizes; touch targets (44 × 44 pt iOS, 48 × 48 dp Android guidance).
- [ ] Rotation, external keyboard, switch control.

**Documents and media**
- [ ] PDFs tagged (PDF/UA), reading order, alt text, bookmarks; Office documents with headings and alt text; accessible emails.
- [ ] Charts and data visualisations have text alternatives or data tables.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Checklist-based testing** by WCAG success criterion (the checklist above is the oracle).
- **Use-case testing** of top user tasks with each AT (task completion, not just criterion pass).
- **Equivalence partitioning** of components: test each distinct component type once thoroughly (design-system level), then sample its usages.
- **State transition** for widgets (expanded/collapsed, selected, invalid, busy) checking announced states.
- **Boundary value analysis** for contrast ratios (4.49:1 fails, 4.5:1 passes), zoom levels (200 %, 400 %), target sizes (23 vs 24 px).
- **Exploratory testing** with AT personas (blind screen-reader user, keyboard-only user, low-vision user, user with cognitive disability).

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Keyboard completion | Complete checkout with keyboard only | All steps reachable and operable; focus visible on each element; order placed |
| Screen-reader form | Fill registration with NVDA | Each field announces label, required state and type; errors announced |
| Headings and landmarks | Open the rotor/elements list on home page | Logical h1–h3 hierarchy; banner, navigation, main, contentinfo landmarks present |
| Alt text | Product image and decorative divider | Product image has descriptive alt; divider ignored by screen reader |
| Status message | Add item to cart | "Item added to cart" announced via live region; focus unchanged |
| Reflow | 320 px viewport | No horizontal scrolling for text content; all functions available |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Error identification | Submit form with empty required email | Error text "Enter your email address" linked to the field (aria-describedby) and announced; field aria-invalid="true" |
| Colour-only cue | Required fields marked only in red | Defect: add text/symbol indicator (1.4.1) |
| Keyboard trap | Tab into an embedded widget | Defect if focus cannot leave with Tab/Shift+Tab/Esc (2.1.2) |
| Unlabelled icon button | Search icon button without name | Defect: screen reader says "button" only (4.1.2) |
| Timeout without warning | Session expires silently after 15 min | Defect: warning with option to extend required (2.2.1) |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Contrast threshold | Grey text #767676 on white (4.54:1) vs #777777 (4.48:1) | First passes 1.4.3; second fails |
| Large-text threshold | 18.66 px bold vs 18 px bold at 3.5:1 | 18.66 px bold passes (3:1 rule); 18 px bold fails (needs 4.5:1) |
| Zoom | 200 % text resize; 400 % zoom | No loss of content/function; reflow at 400 % |
| Target size | 24 × 24 px vs 20 × 20 px icon without spacing | 24 px passes 2.5.8; 20 px fails unless spacing exception applies |
| Text spacing | Apply text-spacing bookmarklet | No clipped or overlapping text |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Core journey with screen reader | Login → search → book → pay with VoiceOver on iOS | Journey completed; all controls announced correctly |
| SPA navigation | Navigate between routes | Page title updates; focus moves to main heading or announced |
| Modal flow | Open, use and close a dialog | Focus moves into dialog, is trapped, Esc closes, focus returns to trigger |
| Document download | Download statement PDF | PDF tagged; reading order correct with screen reader |
| Video content | Play onboarding video | Captions accurate and synchronised; transcript available |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Regulatory compliance | Public-sector form must meet EN 301 549 | Accessibility statement published; all AA criteria pass or documented with plan |
| Banking authentication | One-time passcode entry | Paste allowed, autocomplete="one-time-code", no puzzle CAPTCHA without alternative (3.3.8) |
| Healthcare portal | Patient views lab results chart | Results also available as a table with units and ranges |
| eCommerce checkout | Keyboard and screen-reader user buys product | Error prevention: review step before purchase (3.3.4) |
| Employee self-service | Low-vision employee uses 200 % zoom on timesheet | Grid usable; no truncated columns |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Forced colours | Windows high-contrast mode | Focus indicators, icons and borders remain visible |
| Reduced motion | prefers-reduced-motion: reduce | Non-essential animations disabled |
| Sticky header obscuring focus | Tab to element under sticky header | Element scrolled into view, not fully hidden (2.4.11) |
| Drag-and-drop | Reorder list items | Alternative move up/down buttons available (2.5.7) |
| Infinite scroll | Keyboard user reaching footer | Footer reachable or "Load more" button provided |

## Entry and exit criteria
**Entry**: target standard agreed (WCAG 2.2 AA unless stated); AT/browser matrix agreed; components and pages in scope listed; design reviewed for contrast, focus and target sizes.
**Exit**: automated scan with zero critical/serious violations on in-scope pages; manual checklist completed for each page template and component; core journeys completed with each AT in the matrix; open issues logged with WCAG criterion and severity; accessibility statement/VPAT (ACR) updated.

## Metrics
- WCAG success criteria pass/fail per page template; violations by impact (critical, serious, moderate, minor).
- Automated violation trend per build (axe).
- Task completion rate per AT persona.
- Accessibility defects found in production / by users.

## Tools and automation
- Automated: axe-core (`@axe-core/playwright`), Lighthouse accessibility audit, WAVE, Pa11y, Accessibility Insights for Web (FastPass and Assessment), Android Accessibility Scanner, Xcode Accessibility Inspector, PAC 2024 for PDFs, Colour Contrast Analyser.
- Manual: keyboard, NVDA, JAWS, VoiceOver, TalkBack, zoom/reflow, text-spacing bookmarklet, forced colours.
- Automation folder (<AppName>/): a shared step in `steps/shared/` that runs `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()` and attaches the results JSON to Allure, failing on critical/serious; keyboard-navigation checks via `page.keyboard.press('Tab')` and focused-element assertions in page objects; `toMatchAriaSnapshot` for accessibility-tree regression on stable components; tag `@a11y @feature:<Component>`; run on chromium + webkit.
- Automate: axe scans on every page in smoke/regression, focus-order and accessible-name checks for key components.
- Keep manual: screen-reader usability, meaningful alt text quality, captions accuracy, cognitive clarity.

## Common pitfalls
- Treating a clean axe scan as conformance.
- Adding ARIA instead of using native HTML elements (no ARIA is better than bad ARIA).
- Testing screen readers with the wrong browser pairing.
- Ignoring documents, emails, and third-party widgets (chat, payment iframes, maps).
- Fixing issues page by page instead of in the design-system components.

## Related sub-skills
Domain_Test_Design_Skill-Test-UIUX, Domain_Test_Design_Skill-Test-Localisation, Domain_Test_Design_Skill-Test-Compatibility, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-Desktop, Domain_Test_Design_Skill-Domain-PublicSector, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-Domain-Healthcare, Domain_Test_Design_Skill-Core-OutputAndQuality.
