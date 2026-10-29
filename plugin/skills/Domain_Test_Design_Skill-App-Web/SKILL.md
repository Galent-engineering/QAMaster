---
name: "Domain_Test_Design_Skill-App-Web"
description: "Web application (browser UI, SPA, MPA, PWA, portals) test design sub-skill of Domain_Test_Design_Skill: detection signals, focus areas, default browser/OS/viewport matrix, checklist, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, test-type applicability, tooling and automation with Playwright in the application automation folder ({AppName}/), and common pitfalls. Use when the application under test runs in a browser, or when Domain_Test_Design_Skill routes a web application here."
---

# Web application (sub-skill of Domain_Test_Design_Skill)

Platform-specific test design for browser-based applications: single-page apps (React, Angular, Vue), server-rendered multi-page apps (ASP.NET, JSP, Django, Rails), portals and progressive web apps. Combine with a domain sub-skill and the test-type sub-skills.

## Detection signals
- URL with `http(s)://`, login page in a browser, HTML/JS front-end repository (React, Angular, Vue, Svelte, Razor, JSP).
- Routes like `/#/dashboard`, `/app/...`; `index.html`, `package.json` with a front-end framework.

## Focus areas
- Cross-browser and responsive behaviour; client-side vs server-side validation (bypass client checks).
- Navigation: menus, breadcrumbs, deep links, back/forward, refresh, 404/500 pages.
- Session: login, idle/absolute timeout, multi-tab, logout, remember-me, SSO redirects.
- Forms and wizards: validation timing, draft save, multi-step state, file upload/download, printing.
- State and caching: stale data after update, optimistic UI, browser cache of sensitive pages.
- Front-end performance: Core Web Vitals, bundle size, lazy loading.

## Default compatibility matrix
| Dimension | Values |
|---|---|
| Browsers | Chrome, Edge, Firefox, Safari (latest, latest-1) |
| OS | Windows 11, macOS latest; iOS Safari, Android Chrome for mobile web |
| Viewports | 320, 375, 768, 1024, 1280, 1920 px |
| Zoom | 100 %, 200 %, 400 % (reflow) |
| Network | Fast, slow 3G profile, offline (PWA) |
Use pairwise (Domain_Test_Design_Skill-Core-Techniques T7) to reduce combinations.

## Checklist
- [ ] Every page reachable by navigation and by deep link (with and without session).
- [ ] Server rejects invalid data when client validation is bypassed (request tampering).
- [ ] Double submit and back-then-resubmit do not duplicate transactions (PRG pattern, idempotency).
- [ ] Two tabs editing the same record → conflict detected or last-write policy is explicit.
- [ ] Session expiry mid-wizard → data preserved or user clearly informed; re-login returns to the page.
- [ ] Browser refresh on each step keeps or safely resets state.
- [ ] File upload/download: types, sizes, names, authorisation of download links.
- [ ] Printing / PDF export layout.
- [ ] Error pages (404, 403, 500) are friendly and leak no internals.
- [ ] Cookies: Secure, HttpOnly, SameSite; no sensitive data in localStorage or URL.
- [ ] Console free of errors; no mixed content.
- [ ] Core Web Vitals within targets (LCP < 2.5 s, INP < 200 ms, CLS < 0.1).

## Scenario patterns

### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Happy-path form submit | Create a record with all valid fields | Success message; record listed with the entered values |
| Deep link with session | Open `/orders/123` while logged in | Order 123 detail page renders |
| Responsive layout | Open dashboard at 375 px | Navigation collapses to menu; no horizontal scroll |
| Search, sort, paginate | Search "smith", sort by date | Only matching rows, ordered by date, correct page count |
| Export | Export grid to CSV | File rows equal grid rows and filters |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Client validation bypassed | Submit API request with invalid email | 400/422 and no record created |
| Deep link without session | Open `/orders/123` logged out | Redirect to login, then back to order 123 |
| Unauthorised URL | Standard user opens `/admin` | 403 page or redirect; no admin data in response |
| Invalid upload | Upload `.exe` renamed `.pdf` | Rejected with clear message |
| Expired session action | Click Save after idle timeout | Login prompt; no silent data loss |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Field length | Name 1, 100, 101 chars (max 100) | 1 and 100 accepted; 101 blocked with message |
| Viewport breakpoints | 767 vs 768 px | Correct layout on each side of the breakpoint |
| Pagination | 0, 1, page size, page size + 1 rows | Empty state; 1 page; 1 page; 2 pages |
| Upload size | max − 1 KB, max, max + 1 KB | Accepted, accepted, rejected |
| Idle timeout | Act at timeout − 1 s and + 1 s | Session kept; session expired |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Create → approve → report | Raise request, manager approves, report shows it | Status Approved; report row and totals updated |
| UI ↔ API consistency | Create in UI, read via API | Same values in API response |
| Notification | Submit form that sends email | Email received with correct content and link |
| SSO journey | Login via IdP, use app, logout | Session ends in app and IdP per policy |
| Multi-role flow | Maker creates, checker approves | Each role sees only its actions |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Persona daily task | Manager approves 10 pending items in bulk | All 10 approved; audit entries per item |
| Draft and resume | User saves draft, returns next day | Draft restored exactly |
| Correction | User edits a submitted record allowed by policy | New version saved; history kept |
| Self-service | Customer resets own password | Can log in with new password; old one rejected |
| Bulk import | Import 500 valid rows | 500 records created; summary shown |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Back after submit | Press Back after payment and resubmit | No second payment; user shown status |
| Concurrent edit | Two users save same record | Second gets conflict warning |
| Refresh mid-wizard | Refresh on step 3 | Stays on step 3 with data, or restarts safely |
| Browser autofill | Autofill fills hidden fields | No unintended values submitted |
| Clock / time zone | User TZ differs from server | Dates shown in user TZ; cut-offs correct |

## Test-type applicability
| Test type | Relevance | Notes |
|---|---|---|
| Functional, Regression, UI/UX, Accessibility, Security, Compatibility | ● | Core for every web app |
| Localisation | ● when multi-locale | RTL, text expansion |
| API | ◐ | Backing APIs; test below the UI |
| Performance | ● | Back-end load + front-end vitals |
| Integration, Resilience | ◐ | SSO, payment, third-party widgets |

## Tools and automation
- Playwright (application automation folder <AppName>/): page objects in `src/web/pages`, page-wise locators in `src/web/locators/<page>.page.locators.ts` (UI-Locator-Sync), features tagged `@web`, steps in `steps/pages/<page>.page.steps.ts`.
- Prefer role/label/test-id locators; set up data via API services; assert via UI and API.
- axe-core for accessibility scans, Lighthouse for vitals, visual comparison (`toHaveScreenshot`) for stable layouts.

## Common pitfalls
- Testing only client-side validation.
- Ignoring back/refresh/multi-tab behaviour.
- Brittle CSS/XPath locators; sleeps instead of web-first assertions.
- Running every test in every browser instead of a pairwise matrix.

## Related sub-skills
Domain_Test_Design_Skill-Test-UIUX, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Compatibility, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-App-CloudSaaS
