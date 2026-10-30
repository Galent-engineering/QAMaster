---
name: "Domain_Test_Design_Skill-Test-UIUX"
description: "UI/UX testing sub-skill of Domain_Test_Design_Skill: visual design conformance (Figma/design system), layout and responsiveness, navigation and information architecture, forms and feedback, content and microcopy, states (empty, loading, error), usability heuristics and visual regression, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating UI/UX tests for any application or domain."
---

# UI/UX testing (sub-skill of Domain_Test_Design_Skill)

UI/UX testing verifies that the interface looks as designed, behaves consistently, and lets real users complete their tasks efficiently and without confusion. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Visual conformance to designs (Figma) and the design system (tokens, components).
- Layout, responsiveness, navigation, interaction behaviour, feedback, content and microcopy.
- Usability: learnability, efficiency, error prevention and recovery (Nielsen's 10 heuristics).
- Accessibility conformance is in Domain_Test_Design_Skill-Test-Accessibility; browser/device matrices in Domain_Test_Design_Skill-Test-Compatibility.

## When to apply
- New or redesigned screens, design-system upgrades, theme/branding changes, responsive breakpoints.
- Customer-facing journeys (sign-up, checkout, booking, claims, self-service) where drop-off costs money.
- Internal heavy-use screens (data entry, case handling) where efficiency matters.

| Application type | Relevance |
|---|---|
| Web | ● |
| API / microservices | ○ |
| Mobile | ● (platform guidelines: Material, Human Interface Guidelines) |
| Desktop | ● (OS conventions, keyboard) |
| Cloud / SaaS | ● (tenant theming) |
| Image-based / AI | ◐ (result presentation, confidence display) |
| Data platform | ◐ (dashboards) |

## Checklist
**Visual design**
- [ ] Matches Figma: spacing, typography (font, size, weight, line height), colours, icons, imagery, elevation.
- [ ] Uses design-system components and tokens (no one-off styles); consistent across pages.
- [ ] Brand/theme variants (light/dark, tenant themes) correct.
- [ ] Images sharp on high-DPI; no distortion; correct aspect ratios; fallbacks for missing images.

**Layout and responsiveness**
- [ ] Breakpoints (e.g. 320, 375, 768, 1024, 1280, 1440, 1920 px): no horizontal scroll, no overlap, no clipped text.
- [ ] Orientation change (portrait/landscape) preserves state.
- [ ] Zoom 200 % and text-only zoom; long content wraps.
- [ ] Sticky headers/footers do not hide content or focused elements.
- [ ] Tables on small screens (scroll, stack or column priority).

**Navigation and information architecture**
- [ ] Menus, breadcrumbs, tabs, back/forward browser buttons, deep links, page titles.
- [ ] Current location indicated; consistent placement of primary actions.
- [ ] No dead ends; every screen has a way back; 404 page helpful.
- [ ] Search discoverable; results relevant.

**Forms and interaction**
- [ ] Labels visible (not placeholder-only); required indicators; input masks; helpful defaults.
- [ ] Inline validation timing (on blur/submit), message near the field, clear wording, error summary on submit.
- [ ] Correct input types and mobile keyboards (email, tel, number, date).
- [ ] Buttons: states (default, hover, focus, active, disabled, loading); prevent double submit.
- [ ] Destructive actions confirmed; undo where possible.
- [ ] Autosave/unsaved-changes warning on navigation away.

**States and feedback**
- [ ] Empty states with guidance; loading indicators/skeletons; progress for long tasks.
- [ ] Success, warning, error and info messages: consistent style, placement and duration; toasts not the only channel for critical info.
- [ ] Error pages (403, 404, 500, offline, maintenance) branded and helpful.
- [ ] Timeouts and session-expiry warnings.

**Content and microcopy**
- [ ] Spelling, grammar, tone of voice, terminology consistent with the domain glossary.
- [ ] Number, date, currency formats per locale (see Localisation).
- [ ] Truncation with tooltip/full view; no "lorem ipsum", "undefined", "null", "NaN", raw keys.

**Usability heuristics (Nielsen)**
- [ ] Visibility of system status; match with real world; user control and freedom; consistency and standards; error prevention; recognition rather than recall; flexibility and efficiency (shortcuts, bulk actions); aesthetic and minimalist design; help users recover from errors; help and documentation.

**Performance perception**
- [ ] Core Web Vitals as UX signals: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (75th percentile).
- [ ] No layout shift when content loads; optimistic UI where appropriate.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Checklist-based testing** against the design system and heuristics.
- **Use-case / task-based testing**: top user tasks with time-on-task and error counts.
- **Equivalence partitioning** of viewports (mobile / tablet / desktop classes) and content lengths (short / typical / very long).
- **Boundary value analysis** at breakpoints (breakpoint − 1 px, breakpoint).
- **State transition** for UI components (collapsed/expanded, enabled/disabled, loading/loaded/error).
- **Exploratory testing** with personas and tours (feature tour, landmark tour, "bad neighbourhood" tour).
- **Visual regression** (baseline screenshots, masked dynamic regions).

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Design conformance | Compare login page with Figma frame | Spacing, fonts, colours within agreed tolerance (e.g. ±2 px); no missing elements |
| Responsive layout | Dashboard at 375, 768, 1440 px | Layout switches per design; no horizontal scroll; all actions reachable |
| Navigation | Use breadcrumbs from a detail page | Returns to the correct list with filters preserved |
| Feedback | Save a valid form | Success message visible ≥ 4 s or until dismissed; form state updated |
| Theme | Switch to dark mode | All components use dark tokens; text contrast maintained |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Inline validation | Enter invalid postcode and tab out | Message next to field in error style; field marked invalid; no page jump |
| Error summary | Submit form with 3 errors | Summary lists 3 errors with links to fields; focus moves to summary |
| Server error | Backend returns 500 | Friendly error page/message with retry; no stack trace or raw JSON |
| Unsaved changes | Navigate away from edited form | Confirmation dialog; cancel keeps data |
| Broken image | Image URL 404 | Placeholder shown; layout intact |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Breakpoint edges | 767 px and 768 px | Correct layout on each side of the breakpoint |
| Long text | 255-character name in card and table | Wraps or truncates with full text on hover/expand; no overflow |
| Minimum viewport | 320 px width | All content usable without horizontal scroll (reflow) |
| Zoom | Browser zoom 200 % / 400 % | Content reflows; no clipped controls |
| List sizes | 0, 1, many (1 000) items | Empty state; single item layout; virtualised/paginated long list |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Primary task flow | Search → select → checkout → confirmation | Completed without help; each step's state visible; confirmation shows summary |
| Multi-device continuity | Start on mobile, continue on desktop | Saved progress visible; layout appropriate on both |
| Onboarding | First-time user tour | Tour can be skipped and resumed; does not reappear after completion |
| Wizard | Multi-step form with back/next | Data preserved on back; progress indicator accurate |
| Deep link | Open a shared detail link after login | Lands on the intended page after authentication |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Conversion funnel | Guest checkout on mobile | Completed in ≤ N steps defined by UX; no forced account creation unless required |
| High-volume data entry | Agent captures 20 records | Keyboard-only entry possible; tab order logical; time per record within target |
| Tenant branding | Tenant A and B logos and colours | Each tenant sees only its branding |
| Persona with low digital literacy | Elderly customer books appointment | Plain language; large targets; task completed in usability session |
| Critical alert | Clinical/financial warning | Prominent, persistent, requires acknowledgement as specified |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Slow network | 3G throttling | Skeletons/spinners shown; no duplicate submissions; timeouts handled |
| Offline | Lose connection mid-form | Offline message; data not lost; resync on reconnect (if supported) |
| Rapid interaction | Click a button 5 times quickly | One action; button disabled while processing |
| Browser back after submit | Back after payment confirmation | No resubmission; informative page |
| Mixed content length and locale | German labels (≈30 % longer) | No truncation of buttons and labels |

## Entry and exit criteria
**Entry**: approved designs (Figma) and design-system version; content/microcopy baseline; build on test environment; target viewports and devices agreed.
**Exit**: all screens reviewed against designs at agreed breakpoints; no open high-severity UI defects in primary journeys; visual baselines approved; usability findings triaged with product/UX.

## Metrics
- Design deviations per screen (by severity); visual regression diffs approved/rejected.
- Task success rate, time on task, error rate (usability sessions); SUS score.
- Core Web Vitals (LCP, INP, CLS) at the 75th percentile.
- UI defect density and leakage.

## Tools and automation
- Figma Dev Mode / inspect; browser dev tools device mode; Percy, Applitools, Chromatic or Playwright `toHaveScreenshot` for visual regression; Lighthouse for Web Vitals; Storybook for component states.
- Automation folder (<AppName>/): run web features on the `chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari` projects; page objects expose state checks (e.g. `expectErrorSummary()`), with selectors only in `src/web/locators/<page>.page.locators.ts`; visual checks with `expect(page).toHaveScreenshot({ mask: [...] })` on stable pages; tag `@ui @feature:<Component>`; screenshots attached to Allure.
- Automate: layout at key breakpoints, component states, error summaries, visual baselines of stable pages.
- Keep manual: aesthetic judgement, usability sessions, copy tone, exploratory tours.

## Common pitfalls
- Testing only at one desktop resolution.
- Visual baselines on dynamic pages without masking, causing noisy failures.
- Treating placeholder text as labels.
- Ignoring empty, loading and error states.
- Pixel-perfect demands where the design system allows tolerance.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-Desktop, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Localisation, Domain_Test_Design_Skill-Test-Compatibility, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Core-Techniques.
