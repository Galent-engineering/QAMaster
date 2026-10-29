---
name: "Domain_Test_Design_Skill-App-Mobile"
description: "Mobile application (native iOS/Android, hybrid, React Native, Flutter, PWA, mobile web) test design sub-skill of Domain_Test_Design_Skill: detection signals, focus areas, default device/OS matrix, checklist, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories (interruptions, offline, permissions, lifecycle, upgrades, biometrics), test-type applicability, tooling and automation with Appium / Playwright mobile emulation in the application automation folder ({AppName}/), and pitfalls. Use when the application under test runs on phones or tablets, or when Domain_Test_Design_Skill routes a mobile application here."
---

# Mobile application (sub-skill of Domain_Test_Design_Skill)

Platform-specific test design for native, hybrid and mobile-web apps. Combine with a domain sub-skill and test-type sub-skills (Security uses OWASP MASVS for mobile).

## Detection signals
- `.apk`/`.aab`/`.ipa`, Xcode / Gradle projects, React Native / Flutter / Ionic / Capacitor code.
- App store listings, push notification set-up, deep-link schemes (`myapp://`).

## Focus areas
Device fragmentation, OS versions, permissions, interruptions, network variability, offline mode and sync, push notifications, deep links, app lifecycle (background/foreground/kill), store compliance, battery/memory/storage, biometrics, accessibility (VoiceOver/TalkBack, dynamic type), orientation and foldables.

## Default device matrix
| Platform | Coverage |
|---|---|
| iOS | Latest and latest-1; one small iPhone, one large iPhone, one iPad if supported |
| Android | Latest and 2 older major versions; Samsung, Pixel and one budget device |
| Screen | Small, large, tablet, foldable (if supported); densities ldpi–xxxhdpi |
| Network | Wi-Fi, 4G/5G, 3G throttle, offline, switching networks |
Use real devices for gestures, sensors, biometrics and performance; emulators for breadth.

## Checklist
- [ ] Install, first launch, onboarding, permissions prompts.
- [ ] Upgrade from previous version keeps data and session (or re-auth per policy).
- [ ] Interruptions: call, SMS, alarm, notification, low battery during critical flows.
- [ ] Background 30 min / killed by OS → state restored per policy.
- [ ] Offline: queued actions, sync on reconnect, conflict resolution, no duplicates.
- [ ] Permission denied → graceful fallback and path to settings.
- [ ] Deep link / push tap → correct screen, login first if needed.
- [ ] Biometric login; biometric set changed → biometric login invalidated.
- [ ] Dark mode, font scaling (largest), orientation, split screen.
- [ ] Secure storage (Keychain/Keystore), no sensitive data in logs/screenshots/app switcher.
- [ ] Store guidelines (privacy labels, permissions rationale, account deletion).

## Scenario patterns

### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Login with biometrics | Enrolled face/fingerprint | Logged in; home screen shown |
| Push to screen | Tap order-shipped notification | Order detail of that order opens |
| Offline read | Open cached statements offline | Last synced data shown with timestamp |
| Camera capture | Scan document with permission granted | Image captured and uploaded |
| Rotate device | Rotate on form | Layout adapts; entered data kept |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Permission denied | Deny camera | Explanation and link to settings; no crash |
| No network on submit | Submit form offline | Queued or clear error; no data loss |
| Rooted/jailbroken device | Launch banking app on rooted device | Blocked or warned per policy |
| Expired session | Resume after timeout | Re-auth required; returns to screen |
| Invalid deep link | `myapp://order/unknown` | Friendly not-found screen |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Minimum OS | Install on min supported and min − 1 | Installs; blocked by store/min SDK |
| Storage | Device with < 50 MB free | Download/caching handled with message |
| Font scale | Largest accessibility size | Text not truncated; scrollable |
| Battery | Low power mode at 5 % | Background sync deferred per OS; app usable |
| OTP timer | Enter OTP at expiry − 1 s / + 1 s | Accepted; rejected |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Cross-channel | Start on mobile, finish on web | Same draft/state on web |
| Payment | Pay via wallet SDK | Payment confirmed; receipt and push received |
| Offline → online | Create 3 items offline, reconnect | 3 items on server once each |
| Account deletion | Delete account in app | Data removed per policy; login fails |
| Upgrade path | v1.0 → v2.0 with migration | Data migrated; no forced logout unless policy |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Field worker | Complete job offline in basement, sync later | Job closed with photos and timestamps |
| Commuter | Use app on flaky network | Retries transparent; no duplicate actions |
| Accessibility user | Complete purchase with VoiceOver | All steps operable and announced |
| Multi-device | Same account on phone and tablet | Sync consistent on both |
| Traveller | Change device locale/time zone | Formats and times adapt |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Call during payment | Incoming call at confirm step | Transaction state consistent on return |
| App killed during upload | Force-stop mid-upload | Resumes or restarts upload; no corrupt file |
| Clock changed | Device time set back 1 day | Tokens/OTP logic not bypassed |
| Biometric re-enrolled | Add new fingerprint | Biometric login disabled until password entry |
| Foldable | Fold/unfold during form entry | State kept; layout adapts |

## Test-type applicability
| Test type | Relevance |
|---|---|
| Functional, Regression, UI/UX, Accessibility, Security (MASVS), Performance (device), Compatibility | ● |
| Localisation | ● when multi-locale |
| API, Integration, Resilience | ◐ (back end, offline sync) |

## Tools and automation
- Automation folder (<AppName>/): Playwright device emulation projects for mobile web (`@mobile-web`); Appium via webdriverio for native (`@native`), screens in `src/mobile/screens`, locators in `src/mobile/locators/<screen>.screen.locators.ts`, steps in `steps/mobile/<screen>.screen.steps.ts`.
- Device clouds (BrowserStack, Sauce Labs, AWS Device Farm); Xcode Instruments / Android Profiler for performance; MobSF for static security checks.

## Common pitfalls
- Emulator-only testing; skipping interruptions and lifecycle.
- Ignoring upgrade paths and offline sync conflicts.
- Hard-coded coordinates; missing accessibility identifiers.

## Related sub-skills
Domain_Test_Design_Skill-Test-Compatibility, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-App-API
