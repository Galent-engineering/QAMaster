---
name: "Domain_Test_Design_Skill-Test-Localisation"
description: "Localisation testing sub-skill of Domain_Test_Design_Skill: internationalisation readiness (Unicode, externalised strings, pseudo-localisation), translation completeness and quality, locale formats (dates, numbers, currency, addresses, names, phone), RTL and bidirectional layout, sorting/collation, time zones, plural rules, legal and cultural content, with a locale matrix, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating localisation tests for any application or domain."
---

# Localisation testing (sub-skill of Domain_Test_Design_Skill)

Localisation (L10n) testing verifies that the product works, reads and looks right for every supported language, region and culture; internationalisation (i18n) testing verifies that the code is ready to be localised at all. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- i18n readiness: Unicode end to end, externalised strings, locale-aware formatting APIs (CLDR/ICU), no concatenated sentences, layout that expands.
- L10n correctness: translation completeness, accuracy, terminology, tone; locale formats; RTL; legal/regulatory content per market.
- Data: storage, search, sort, import/export and integrations preserve characters across scripts.
- Out of scope: translation linguistic review by native linguists (QA coordinates it and logs issues).

## When to apply
- Product shipped in more than one language or country, or with users entering non-ASCII data (almost always).
- New locale launch, new strings in a release, changes to formatting libraries, multi-currency/multi-country features.
- Regulated content per market (tax, privacy notices, terms, product labelling).

| Application type | Relevance |
|---|---|
| Web | ● |
| API / microservices | ◐ (Accept-Language, encoding, formats in payloads) |
| Mobile | ● (device locale, store listings) |
| Desktop | ● (OS locale, installers) |
| Cloud / SaaS | ● (tenant locale, multi-region) |
| Image-based / AI | ◐ (OCR scripts, text in images) |
| Data platform | ◐ (encodings, collation) |

## Checklist
**Internationalisation readiness**
- [ ] UTF-8 end to end: UI, API, database (e.g. utf8mb4 in MySQL), files, email, PDF, logs, message queues.
- [ ] All user-visible strings externalised (no hard-coded text, including error messages, emails, PDFs, images with text).
- [ ] No string concatenation for sentences; placeholders with named parameters; ICU MessageFormat for plurals/gender/select.
- [ ] Layout tolerates text expansion (+30–50 % for German/Finnish, up to +200 % for very short English strings) and contraction (CJK).
- [ ] Locale resolved correctly: user preference → tenant default → browser/OS → fallback; fallback locale shows, never raw keys.
- [ ] Fonts support all scripts (Latin extended, Cyrillic, Greek, Arabic, Hebrew, Devanagari, Thai, CJK); no tofu (□) glyphs.

**Pseudo-localisation (run before real translations exist)**
- [ ] Pseudo-locale replaces characters with accented equivalents ("Ŝåṽé"), pads strings by ~30–40 %, and brackets them ("[Ŝåṽé ~~~]").
- [ ] Reveals hard-coded strings (unbracketed text), truncation (missing closing bracket), concatenation, and encoding issues.
- [ ] Optional pseudo-RTL (mirrored) locale to test bidirectional layout early.

**Translation completeness and quality**
- [ ] No untranslated strings, no mixed languages on a screen, no raw keys like `checkout.button.pay`.
- [ ] Terminology matches the approved glossary; consistent across UI, help, emails, documents.
- [ ] Context correct (same English word, different meanings); no truncated or overlapping translations.
- [ ] Placeholders preserved and correctly ordered; no broken markup.
- [ ] Plural rules per CLDR (e.g. Arabic has 6 forms, Polish/Russian 3–4, Japanese 1).
- [ ] Gender, formality (tu/vous, du/Sie) and tone as agreed.

**Locale formats**
- [ ] Dates and times: order (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD), month/day names, 12/24-hour clock, first day of week, calendars (Gregorian, Hijri, Buddhist, Japanese era) where supported.
- [ ] Numbers: decimal and grouping separators (1,234.56; 1.234,56; 1 234,56; Indian 12,34,567.89), negative formats, percentages.
- [ ] Currency: symbol, position, spacing, decimals (JPY 0, KWD/BHD 3), ISO code display, rounding.
- [ ] Addresses: field order and required fields per country (postcode formats, states/provinces/prefectures).
- [ ] Names: given/family order, single names, long names, characters with diacritics.
- [ ] Phone numbers: E.164 storage, national display, validation per country.
- [ ] Units: metric/imperial, paper sizes (A4/Letter), temperature.

**Bidirectional (RTL) languages**
- [ ] Arabic, Hebrew, Persian, Urdu: `dir="rtl"`, mirrored layout (navigation, icons with direction, progress bars), text alignment.
- [ ] Mixed LTR/RTL content (numbers, emails, product codes inside RTL text) renders correctly.
- [ ] Non-directional icons not mirrored (e.g. clock, play logos per guidelines).

**Input, search and sorting**
- [ ] Input methods (IME) for Chinese, Japanese, Korean; composition events do not trigger premature validation/submit.
- [ ] Search is accent/case-insensitive as specified; supports scripts without spaces (CJK, Thai).
- [ ] Collation per locale (German ä, Swedish å/ä/ö after z, Spanish ñ); Turkish dotted/dotless i casing.
- [ ] Validation regexes accept non-ASCII letters in names and addresses.

**Time zones and calendars**
- [ ] Store UTC, display in user time zone; DST transitions; half-hour/45-minute offsets (India +5:30, Nepal +5:45).
- [ ] Business days and holidays per country; week numbering (ISO 8601).

**Legal, cultural and market content**
- [ ] Privacy notices, terms, consent texts, tax labels, invoice mandatory fields per country.
- [ ] Images, colours, symbols and examples culturally appropriate; flags not used for languages.
- [ ] Store listings, emails, SMS, push notifications, PDFs and exports localised.

**Locale matrix (choose by market and risk)**
| Locale | Script / direction | Key checks |
|---|---|---|
| en-US | Latin, LTR | Baseline; MM/DD/YYYY; Letter paper; imperial units |
| en-GB / en-IN | Latin, LTR | DD/MM/YYYY; £ / ₹; Indian lakh/crore grouping |
| de-DE | Latin, LTR | Long words (expansion); 1.234,56 €; formal "Sie" |
| fr-FR / fr-CA | Latin, LTR | Space before ! ? : ; ; 1 234,56 € ; Canadian formats |
| es-ES / es-MX | Latin, LTR | ñ collation; inverted ¿ ¡ ; currency differences |
| pt-BR | Latin, LTR | R$ 1.234,56; CPF/CEP formats |
| ar-SA / ar-AE | Arabic, RTL | Mirroring; Arabic-Indic digits option; Hijri calendar; 6 plural forms |
| he-IL | Hebrew, RTL | Mirroring; Sunday-first week |
| ja-JP | CJK, LTR | IME; no spaces; era calendar; ¥ 0 decimals; family name first |
| zh-CN / zh-TW | CJK, LTR | Simplified vs Traditional; fonts; pinyin/stroke sorting |
| ko-KR | Hangul, LTR | IME; ₩ 0 decimals |
| hi-IN | Devanagari, LTR | Conjunct rendering; font support |
| th-TH | Thai, LTR | No word spaces (line breaking); Buddhist calendar |
| tr-TR | Latin, LTR | Dotted/dotless i casing (İ/ı) |
| ru-RU / pl-PL | Cyrillic / Latin, LTR | 3–4 plural forms; long words |

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Equivalence partitioning** of locales into classes (LTR Latin, RTL, CJK, complex scripts, expansion-heavy) and test one representative per class plus all launch markets.
- **Pairwise** for locale × time zone × currency × device combinations.
- **Boundary value analysis** for field lengths with multi-byte characters (characters vs bytes), DST boundaries, date-format edges (31/12, 01/01).
- **Checklist-based testing** with the i18n/L10n checklist and the glossary.
- **Pseudo-localisation** as an automated oracle for hard-coded and truncated strings.
- **Error guessing**: Turkish i, emoji (surrogate pairs), combining characters, zero-width joiners.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Language switch | Change language to de-DE in profile | All UI strings, emails and PDFs in German; no English remnants |
| Date format | View order date in en-GB and en-US | 31/12/2026 vs 12/31/2026 for the same stored date |
| Currency format | Price 1234.5 EUR in de-DE and fr-FR | "1.234,50 €" and "1 234,50 €" |
| RTL layout | Switch to ar-SA | Layout mirrored; text right-aligned; navigation order reversed |
| Non-ASCII data | Save customer "Zoë Ångström-Łódź 李雷" | Stored and shown unchanged in UI, search, export and email |
| Plurals | 0, 1, 2, 5 items in pl-PL | Correct plural forms for each count |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Missing translation | Key missing in fr-FR resource file | Fallback language string shown (not raw key); missing key logged |
| Invalid locale | Accept-Language: xx-YY | Default locale used; no error |
| Wrong-format input | Enter 12/31/2026 in a DD/MM/YYYY locale | Validation message in the user's language with expected format |
| Unsupported characters in legacy integration | Send Arabic name to an ASCII-only downstream | Documented handling (transliteration or clear error), no silent corruption ("???") |
| Name validation | Hyphen/apostrophe/diacritics in names | Accepted (not rejected as "invalid characters") |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Text expansion | Longest German/Finnish label in a button | No truncation or overlap; wraps or resizes |
| Multi-byte length | 50-character limit with 50 CJK characters / emoji | Limit counted in characters as specified; DB column holds the bytes |
| DST change | Appointment at 02:30 on spring-forward day | Handled per rule (shifted or rejected) with clear message |
| Year/month boundaries | 31 Dec 23:30 UTC viewed in UTC+5:30 | Shown as 1 Jan 05:00 local; reports use the specified time zone |
| Currency decimals | JPY 0 and KWD 3 decimal amounts | Correct rounding and display |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Localised purchase | fr-CA user orders, pays, receives email and invoice | Every touchpoint in French; CAD formats; tax labels per province |
| Cross-locale collaboration | ja-JP user creates record; en-US user views | Content unchanged; formats per viewer locale |
| Import/export round trip | Export CSV with Arabic and Chinese data, re-import | Characters preserved (UTF-8 with BOM if Excel is target) |
| Notifications | SMS in Hindi | Unicode SMS sent; segment count as expected; text intact |
| Search | Search "muller" finds "Müller" (if accent-insensitive) | Results as specified |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Market launch | Launch in Brazil | pt-BR UI, BRL prices, CPF validation, local terms and privacy notice |
| Statutory documents | Invoice in Germany vs India | Mandatory fields per country (VAT id, GSTIN, HSN codes) present |
| Multi-country payroll/HR | Employees in UK and Saudi Arabia | Correct calendars, weekends (Fri–Sat), holidays and formats per country |
| Regional pricing | Same product in US and EU | Prices, tax-inclusive display and currency per region |
| Customer support | Agent sees customer's preferred language | Templates sent in that language |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Turkish casing | Uppercase "istanbul" in tr-TR | "İSTANBUL" (dotted capital İ) |
| Emoji and ZWJ sequences | Family emoji in name/comment | Counted, stored and rendered as one grapheme |
| Bidi with numbers | Arabic text containing order id "AB-123" | Id displayed in correct order |
| Locale switch mid-session | Change language during a wizard | Entered data preserved; labels switch |
| Browser locale differs from profile | Browser fr, profile de | Profile preference wins (as specified) |

## Entry and exit criteria
**Entry**: supported locale list and market priorities; string freeze for the release; glossary and style guides; pseudo-locale build; test data with multilingual samples.
**Exit**: pseudo-localisation pass with no hard-coded/truncated strings; all launch locales 100 % translated; locale-format checks pass for each locale; RTL review complete; linguistic review sign-off; no open high-severity L10n defects.

## Metrics
- Translation completeness per locale (%); untranslated/hard-coded strings found.
- L10n defects per locale by type (truncation, format, translation, encoding, layout).
- Pseudo-localisation coverage (screens checked / total).
- Linguistic review findings per 1 000 words.

## Tools and automation
- Tools: i18next/ICU/Format.js, pseudo-localisation in the build (e.g. pseudo-locale "en-XA"/"ar-XB" on Android, custom pseudo files on web), Crowdin/Lokalise/Phrase/Smartling QA checks, browser locale overrides, Lighthouse/axe for `lang` attributes.
- Automation folder (<AppName>/): set `locale` and `timezoneId` per Playwright project or `test.use({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })`; Scenario Outlines with an Examples table per locale; locale-specific expected strings and formats in `test-data/` (never computed with the same library the app uses, use fixed literals); screenshot per locale attached to Allure for review; tag `@l10n @locale:<code>`; API checks pass `Accept-Language` headers.
- Automate: pseudo-locale scans for raw keys and unbracketed strings, format assertions, RTL `dir` attribute, encoding round trips.
- Keep manual: translation quality, cultural appropriateness, visual review of complex scripts.

## Common pitfalls
- Testing only in English and one other Latin language.
- Expected values generated with the same formatting library as the app (no independent oracle).
- Validation rejecting legitimate names and addresses.
- Storing local times without zones; ignoring DST.
- Forgetting non-UI outputs: emails, PDFs, SMS, exports, push notifications.

## Related sub-skills
Domain_Test_Design_Skill-Test-UIUX, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Compatibility, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-Core-RiskAndData, Domain_Test_Design_Skill-Domain-Retail, Domain_Test_Design_Skill-Domain-Travel.
