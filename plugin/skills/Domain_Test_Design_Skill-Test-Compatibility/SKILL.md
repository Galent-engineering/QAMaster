---
name: "Domain_Test_Design_Skill-Test-Compatibility"
description: "Compatibility testing sub-skill of Domain_Test_Design_Skill: browsers and engines, operating systems, mobile devices and OS versions, screen sizes and densities, assistive and input devices, networks, databases and runtimes, third-party software and peripherals, backward and forward compatibility of data, APIs, clients and file formats, coverage matrices built from analytics and risk, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating compatibility tests for any application or domain."
---

# Compatibility testing (sub-skill of Domain_Test_Design_Skill)

Compatibility testing verifies that the product works correctly across the environments its users and connected systems actually have: browsers, operating systems, devices, screen sizes, runtimes, versions of itself and of its dependencies. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- **Cross-browser**: Chromium (Chrome, Edge), Gecko (Firefox), WebKit (Safari macOS/iOS; all iOS browsers use WebKit).
- **Cross-platform**: Windows, macOS, Linux, iOS/iPadOS, Android (including OEM skins), ChromeOS.
- **Devices**: phones, tablets, foldables, desktops, kiosks, POS terminals, smart TVs, wearables where relevant.
- **Screen and display**: resolutions, densities (1×, 2×, 3×), orientation, multi-monitor, dark mode, high contrast.
- **Backward/forward compatibility**: older clients with newer servers and vice versa, data created by older versions, API versions, file formats, upgrades/downgrades.
- **Software/hardware environment**: databases, runtimes (Java, .NET, Node), office suites, PDF readers, antivirus, proxies, printers, scanners, card readers, barcode scanners.
- Visual and usability depth: Domain_Test_Design_Skill-Test-UIUX; accessibility tooling: Domain_Test_Design_Skill-Test-Accessibility.

## When to apply
- Any user-facing product; before go-live and every release with front-end, dependency or platform changes.
- New browser/OS major versions (betas: Chrome Beta, Safari Technology Preview, iOS/Android betas), device launches, deprecation of old versions.
- Mobile apps with long-lived installed versions; desktop software with mixed client versions; public APIs with many consumers.

| Application type | Relevance |
|---|---|
| Web | ● (browsers, viewports) |
| API / microservices | ● (version compatibility, client SDKs) |
| Mobile | ● (devices, OS versions, OEMs) |
| Desktop | ● (OS versions, architectures, DPI) |
| Cloud / SaaS | ● (browsers, integrations, API versions) |
| Image-based / AI | ◐ (camera hardware, image formats) |
| Data platform | ◐ (driver/BI tool versions, file formats) |

## Checklist
**Coverage matrix**
- [ ] Build the matrix from production analytics (browser/OS/device share), contractual support policy, market (e.g. Samsung Internet in some regions, older Android in emerging markets) and risk.
- [ ] Tiering: Tier 1 (full regression; e.g. ≥ 5 % share or contractual), Tier 2 (smoke + key journeys), Tier 3 (best effort / visual spot checks).
- [ ] Support policy published (e.g. "last 2 major versions of evergreen browsers; iOS N-2; Android API 26+").
- [ ] Matrix reviewed each quarter.

**Example web matrix**
| Browser | OS | Tier |
|---|---|---|
| Chrome latest, latest-1 | Windows 11, macOS | 1 |
| Edge latest | Windows 11 | 1 |
| Safari latest, latest-1 | macOS, iOS/iPadOS | 1 |
| Firefox latest, ESR | Windows, Linux | 2 |
| Chrome Android latest | Android 13–15 | 1 |
| Samsung Internet latest | Android (Samsung) | 2 |

**Example mobile device matrix**
| Device class | Examples | Why |
|---|---|---|
| iOS current flagship | iPhone 16/17 | Latest OS, Dynamic Island, ProMotion |
| iOS oldest supported | iPhone SE (2nd/3rd gen) | Small screen, oldest supported iOS |
| Android flagship | Pixel 9, Galaxy S24/S25 | Latest Android, OEM skin |
| Android mid/low-end | Galaxy A-series, Redmi | Low RAM, slow CPU, high market share |
| Tablet / foldable | iPad, Galaxy Z Fold/Flip | Large/split screens, posture changes |

**Web compatibility checks**
- [ ] Layout and CSS (grid/flex, container queries, `:has()`, sticky, scroll snapping), fonts and rendering.
- [ ] JavaScript features and polyfills; build target (browserslist) matches the support policy.
- [ ] Forms: date/time pickers, autofill, input types, file upload dialogs, clipboard.
- [ ] Media: video/audio codecs, autoplay policies, camera/microphone permissions, WebRTC.
- [ ] Storage and cookies: third-party cookie restrictions (Safari ITP, Firefox ETP, Chrome changes), storage partitioning, private browsing.
- [ ] PDF viewing/download, printing, popups, new tabs, iframes, Service Workers/PWA install.
- [ ] Browser zoom, high-DPI, dark mode, reduced motion, forced colours.

**Mobile compatibility checks**
- [ ] OS versions (min to latest), OEM customisations (battery optimisation killing background work, permission UIs).
- [ ] Screen sizes, notches/cutouts, safe areas, foldable postures, split screen, orientation.
- [ ] Hardware: camera, GPS, NFC, biometrics (Face ID, fingerprint), sensors; devices without them.
- [ ] Network types (Wi-Fi, 5G/4G/3G, offline), app store builds vs side-loaded, in-app browser/WebView versions.

**Desktop compatibility checks**
- [ ] OS versions and editions, 32/64-bit, x64/ARM64 (Apple silicon, Windows on ARM), DPI scaling (100–200 %), multi-monitor with mixed DPI.
- [ ] Prerequisites/runtimes (.NET, Java, VC++ redistributables, WebView2), installer types (MSI, MSIX, PKG, DMG, DEB/RPM).
- [ ] Locked-down corporate environments: no admin rights, proxies, antivirus/EDR, group policies, Citrix/VDI.
- [ ] Peripherals: printers, scanners, card readers, barcode scanners, signature pads, receipt printers.

**Backward and forward compatibility**
- [ ] Old client ↔ new server (mobile apps not yet updated); new client ↔ old server (staged rollouts).
- [ ] API versioning and deprecation; SDK versions; webhooks payload versions.
- [ ] Data created in older versions opens/edits correctly; saved files/exports from new version readable by supported older versions where promised.
- [ ] Database/schema upgrades and rollbacks; feature-flagged rollouts with mixed versions.
- [ ] Forced/soft update prompts for unsupported app versions.
- [ ] Integration partner versions (e.g. ERP, browser extensions, Office add-ins).

**Third-party and data formats**
- [ ] Office formats (DOCX/XLSX/CSV opened in Excel, LibreOffice, Google Sheets), PDF readers, email clients rendering HTML emails (Outlook desktop, Gmail, Apple Mail, mobile clients).
- [ ] Image formats (JPEG, PNG, HEIC, WebP, AVIF), video formats, character encodings.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Equivalence partitioning** of environments: group by engine, OS family, screen class, capability; test one representative per class plus Tier 1 explicitly.
- **Pairwise / combinatorial testing** for browser × OS × resolution × locale combinations (classification tree to model the dimensions).
- **Risk-based selection** using analytics share and business impact.
- **Boundary value analysis** on supported versions (oldest supported, oldest − 1, newest, beta) and screen widths.
- **Checklist-based testing** per platform.
- **Metamorphic checks**: same journey on two environments must yield the same business result.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Tier 1 browser journey | Checkout on Safari iOS latest | Order placed; layout per design; payment sheet works |
| Device class | Booking on low-end Android (2 GB RAM) | Flow completes; no crashes; acceptable responsiveness |
| OS version | App on oldest supported iOS | All core features work; no missing APIs crash |
| Office export | Export XLSX opened in Excel and Google Sheets | Same values, formats and formulas in both |
| HTML email | Order confirmation email in Outlook desktop and Gmail mobile | Readable layout; links and buttons work; images have alt text |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Unsupported browser | Open app in Internet Explorer 11 / very old Safari | Clear "unsupported browser" message with alternatives; no broken half-page |
| Unsupported OS version | Install app on Android below minSdk | Store prevents install or app shows upgrade message |
| Missing capability | Device without NFC/biometrics | Feature hidden or alternative offered; no crash |
| Blocked third-party cookies | Embedded SSO widget in Safari | Fallback flow (redirect/storage access API) works |
| Old app vs new API | App version N-3 calls changed API | Works via compatible version or receives forced-update response |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Oldest supported version | Chrome latest-1 / iOS N-2 | Fully functional |
| Just below support | Chrome latest-3 / iOS N-3 | Behaves per policy (warning or best effort) |
| Smallest screen | 320 px width / iPhone SE | No clipped content or unreachable actions |
| Largest screen | 2560 px / 4K at 100 % | Layout scales; no stretched or tiny content |
| DPI scaling | Windows 100 %, 150 %, 200 % | Crisp rendering; no overlapping controls |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Cross-device continuity | Start on Android tablet, finish on Windows Edge | Saved state consistent; same outcome |
| Mixed version rollout | 50 % users on new web build, 50 % on old during canary | Both talk to backend correctly; no data incompatibility |
| Upgrade path | Desktop app v3 → v4 with existing data | Data migrated; settings preserved; rollback to v3 possible if promised |
| Print / PDF | Generate and print invoice from Firefox on Linux | Printed layout correct; page breaks sensible |
| Peripheral flow | POS scan → payment terminal → receipt printer | Each device works with supported driver versions |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Corporate customers | Enterprise users on locked-down Windows + Edge with proxy | SSO, downloads and uploads work through the proxy |
| Field workforce | Rugged Android devices with old OS | Core field app functions work offline and online |
| Emerging market | Low-end Android on 3G | Lightweight flow usable; data usage within budget |
| Retail store hardware | New POS terminal model | Certified with scanners, printers and payment terminal |
| Regulatory portal | Citizens on any common browser | Service usable on all Tier 1/2 browsers (public-sector obligation) |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Browser beta | Next Chrome/Safari beta | No blocking issues found ahead of release (early warning) |
| Foldable posture change | Unfold device mid-checkout | State preserved; layout adapts |
| In-app browser | Link opened inside social-media in-app browser | Login and payment still work or prompt to open in default browser |
| Multi-monitor mixed DPI | Drag desktop app between 100 % and 200 % monitors | Re-renders correctly |
| Rosetta / emulation | x64 build on Apple silicon or Windows on ARM | Works per support policy; performance acceptable |

## Entry and exit criteria
**Entry**: support policy and tiered matrix approved; device lab/cloud access; functionally stable build; key journeys defined for Tier 2/3.
**Exit**: Tier 1 full suite passed; Tier 2 smoke and key journeys passed; Tier 3 spot checks done; environment-specific defects triaged (fix, workaround, or documented limitation); matrix and known issues published.

## Metrics
- Matrix coverage (environments tested ÷ planned per tier).
- Environment-specific defect count and distribution by browser/OS/device.
- Pass rate per environment; production incidents linked to unsupported/untested environments.
- Analytics share covered by Tier 1 + Tier 2 (target ≥ 95 % of users).

## Tools and automation
- Cloud device/browser labs: BrowserStack, Sauce Labs, LambdaTest, AWS Device Farm, Firebase Test Lab; local emulators/simulators (Android Studio, Xcode); real-device labs for Tier 1 mobile.
- Feature support: caniuse.com, MDN browser-compat-data, browserslist.
- Automation folder (<AppName>/): Playwright projects `chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari` in `playwright.config.ts` (add `channel: 'msedge'` / `'chrome'` projects for branded browsers); native apps on `native-android` / `native-ios` via Appium; run the same features across projects (`npx playwright test --project=webkit`); environment recorded in Allure environment info; tag `@compat` for the cross-environment subset. Remote browsers via `connectOptions` to a cloud grid when needed.
- Automate: Tier 1 regression and smoke across browser engines; visual snapshots per engine.
- Keep manual: real-device gestures and sensors, peripherals, emulated vs real differences, email client rendering (use Litmus/Email on Acid).

## Common pitfalls
- Matrix based on habit, not analytics.
- Testing only Chromium and assuming Safari/iOS behave the same.
- Relying solely on emulators for mobile.
- Forgetting older installed app versions and API backward compatibility.
- Ignoring corporate environments (proxies, VDI, no admin rights).

## Related sub-skills
Domain_Test_Design_Skill-Test-UIUX, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Test-Localisation, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-Desktop, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Domain-Retail, Domain_Test_Design_Skill-Domain-PublicSector.
