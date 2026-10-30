---
name: "Domain_Test_Design_Skill-App-Desktop"
description: "Desktop application (Windows, macOS, Linux thick clients, Electron, WPF, WinForms, Java Swing, Qt) test design sub-skill of Domain_Test_Design_Skill: detection signals, focus areas, OS/DPI matrix, checklist, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories (install/upgrade, permissions, file system, peripherals, offline, auto-update), test-type applicability, tooling and pitfalls. Use when the application under test is installed on a workstation, or when Domain_Test_Design_Skill routes a desktop application here."
---

# Desktop application (sub-skill of Domain_Test_Design_Skill)

Platform-specific test design for installed, thick-client applications. Combine with a domain sub-skill and test-type sub-skills.

## Detection signals
- Installers (`.msi`, `.exe`, `.dmg`, `.pkg`, `.deb`, `.rpm`, MSIX), Electron/WPF/WinForms/Swing/Qt code.
- Local databases or files, registry/plist settings, printer or device integration.

## Focus areas
Installation/upgrade/repair/uninstall, OS compatibility, local file system and registry, permissions (admin vs standard), printers and peripherals (scanners, card readers, barcode), offline operation, multi-monitor and DPI scaling, keyboard shortcuts, auto-update, local data security, integration with Office/ERP, licensing.

## Default matrix
| Dimension | Values |
|---|---|
| OS | Windows 11 (and 10 if supported), macOS latest and latest-1, Linux distro(s) in scope |
| Architecture | x64, ARM64 (Apple silicon, Windows on ARM) |
| User | Administrator, standard user, roaming profile / domain user |
| Display | 1080p 100 %, 4K 150 %/200 %, multi-monitor with mixed DPI |
| Locale | en-US plus a comma-decimal locale (de-DE) and a non-Latin locale |

## Checklist
- [ ] Clean install, upgrade over each supported previous version, repair, uninstall leaves no residue (files, registry, services).
- [ ] Silent/managed install (MSI parameters, MDM) works.
- [ ] Runs as standard user; elevation prompted only when needed.
- [ ] Auto-update: download, signature check, rollback on failure, deferral.
- [ ] Files: open/save/save-as, unsupported formats, read-only and locked files, network drives, long paths, Unicode names.
- [ ] Autosave and crash recovery.
- [ ] Peripherals: printing (preview, paper sizes), scanners, card readers.
- [ ] Keyboard shortcuts and menus; accessibility (Narrator, VoiceOver, high contrast).
- [ ] Local data encrypted where sensitive; credentials in OS keychain, not plain files.
- [ ] Code signing / notarisation valid; antivirus does not flag.

## Scenario patterns

### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Install and launch | Install on clean Windows 11 | App launches; shortcut created; version shown |
| Open/save file | Save document and reopen | Content identical |
| Print | Print invoice to PDF printer | Layout matches preview |
| Offline work | Create records offline then sync | Records synced once |
| Keyboard flow | Complete form with keyboard only | All fields reachable; Enter submits |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| No admin rights | Install per-machine as standard user | Clear elevation prompt or per-user install |
| Locked file | Save to file opened elsewhere | Clear error; no data loss |
| Corrupt file | Open truncated project file | Error with recovery option; no crash |
| Network drive lost | Save while share disconnected | Error; autosave copy kept locally |
| Bad update package | Signature mismatch | Update refused; current version kept |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Path length | 259 / 260+ char paths (Windows) | Handled or clear message |
| File size | Max supported file and max + 1 | Opens; rejected with message |
| DPI | 100 %, 150 %, 200 % | No clipped or blurry UI |
| Window size | Minimum window size | Layout usable; no overlapping controls |
| Disk space | Install with exactly required space − 1 MB | Installer stops with message |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Install → configure → use → update → uninstall | Full lifecycle | Each stage succeeds; settings survive update |
| Desktop ↔ server | Post transaction to back end | Server shows same record |
| Office integration | Export to Excel and re-import | Data round-trips |
| Peripheral chain | Scan barcode → lookup → print label | Correct item; label printed |
| SSO | Windows-integrated login | User signed in with domain identity |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Branch operator | Day-long use with periodic offline | No data loss; sync clean |
| Accountant | Month-end report export | Totals match server |
| IT admin | Mass deploy via MDM | All machines on same version |
| Shared PC | Two users on one machine | Profiles and data isolated |
| Locale | German user enters 1.234,56 | Parsed as 1234.56 |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Two instances | Open same file twice | Lock or read-only second instance |
| Sleep/hibernate | Resume after hibernate mid-sync | Sync resumes; no duplicates |
| Monitor unplugged | Window on removed monitor | Window moves to available screen |
| Time zone change | Travel with laptop | Timestamps consistent |
| Power loss | Kill process during save | Previous version intact; recovery offered |

## Test-type applicability
| Test type | Relevance |
|---|---|
| Functional, Regression, UI/UX, Accessibility, Security, Compatibility | ● |
| Localisation | ● when multi-locale |
| Performance | ◐ (startup, large files, memory) |
| API, Integration, Resilience | ◐ (back-end sync) |

## Tools and automation
- Electron apps: Playwright `_electron` API; WinAppDriver / FlaUI (Windows), XCUITest/Appium Mac2 (macOS); Sikuli-style image automation only as last resort.
- Installer testing in disposable VMs/snapshots. In the <AppName>/ automation folder, keep desktop flows behind API-level checks where possible.

## Common pitfalls
- Testing only as administrator; skipping upgrade paths.
- Ignoring DPI and multi-monitor.
- Not cleaning state between runs (local caches, registry).

## Related sub-skills
Domain_Test_Design_Skill-Test-Compatibility, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-App-API
