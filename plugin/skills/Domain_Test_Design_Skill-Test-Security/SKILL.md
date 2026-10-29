---
name: "Domain_Test_Design_Skill-Test-Security"
description: "Security testing sub-skill of Domain_Test_Design_Skill: OWASP Top 10 2021, OWASP API Security Top 10 2023, OWASP ASVS and MASVS (mobile), authentication, session and authorisation test matrices, input validation and injection, cryptography and data protection, configuration and headers, business-logic abuse, file upload, supply chain, logging and privacy (GDPR, HIPAA, PCI DSS), SAST/DAST/SCA and penetration testing, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating security tests for any application or domain."
---

# Security testing (sub-skill of Domain_Test_Design_Skill)

Security testing verifies that the application protects confidentiality, integrity and availability of data and functions against misuse by unauthenticated users, authenticated users exceeding their rights, and attackers, in line with OWASP guidance and the domain's regulations. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Functional security verification by QA: authentication, session management, authorisation, input validation, data protection, error handling, logging, security headers, business-logic abuse.
- Coordinated activities: SAST, SCA, secrets scanning, DAST, container/IaC scanning, penetration testing by authorised specialists.
- Standards: OWASP Top 10 2021 (web), OWASP API Security Top 10 2023, OWASP ASVS 4.0.3 (verification levels L1–L3), OWASP MASVS v2 with MASTG (mobile), CWE Top 25; regulations PCI DSS v4.0, HIPAA Security Rule, GDPR, SOC 2, ISO 27001, DORA (EU financial), 21 CFR Part 11 (life sciences).
- Only test systems you are authorised to test, in agreed environments, with agreed tools; never use real customer data or production credentials.

## When to apply
- Every release touching authentication, authorisation, personal/financial/health data, payments, file handling, integrations or configuration.
- Before go-live and periodically (pen test at least annually and after major change; PCI DSS requires it).
- After security incidents and dependency vulnerability advisories.

| Application type | Relevance |
|---|---|
| Web | ● |
| API / microservices | ● |
| Mobile | ● (MASVS) |
| Desktop | ● (local storage, updates, IPC) |
| Cloud / SaaS | ● (tenant isolation, IAM, misconfiguration) |
| Image-based / AI | ● (prompt injection, model/data poisoning, file parsing) |
| Data platform | ● (access control, masking, lineage) |

## Checklist
**OWASP Top 10 2021 (web)**
- [ ] A01 Broken Access Control: IDOR, forced browsing, missing function-level checks, CORS misconfiguration, path traversal, privilege escalation.
- [ ] A02 Cryptographic Failures: TLS 1.2+ only, HSTS, no sensitive data in URLs/logs/caches, strong hashing for passwords (bcrypt/scrypt/Argon2), encryption at rest, key management.
- [ ] A03 Injection: SQL, NoSQL, OS command, LDAP, XPath, template (SSTI), header/CRLF, and Cross-Site Scripting (reflected, stored, DOM).
- [ ] A04 Insecure Design: threat model exists; business-logic limits (quantities, prices, workflows) enforced server-side.
- [ ] A05 Security Misconfiguration: default accounts, verbose errors/stack traces, directory listing, unnecessary services/methods, XXE, missing security headers.
- [ ] A06 Vulnerable and Outdated Components: SCA scan; no known critical CVEs in dependencies, frameworks, containers.
- [ ] A07 Identification and Authentication Failures: credential stuffing protection, weak passwords, MFA, session fixation, recovery flows.
- [ ] A08 Software and Data Integrity Failures: insecure deserialisation, unsigned updates, CI/CD pipeline integrity, SRI for CDN scripts.
- [ ] A09 Security Logging and Monitoring Failures: security events logged, alerting, tamper-resistant logs, no sensitive data in logs.
- [ ] A10 Server-Side Request Forgery: URL fetchers cannot reach internal networks or cloud metadata (169.254.169.254).

**OWASP API Security Top 10 2023**: API1 BOLA, API2 Broken Authentication, API3 Broken Object Property Level Authorization, API4 Unrestricted Resource Consumption, API5 Broken Function Level Authorization, API6 Unrestricted Access to Sensitive Business Flows, API7 SSRF, API8 Security Misconfiguration, API9 Improper Inventory Management, API10 Unsafe Consumption of APIs (details in Domain_Test_Design_Skill-Test-API).

**OWASP MASVS v2 (mobile) control groups**
- [ ] MASVS-STORAGE: no sensitive data in shared preferences/NSUserDefaults, logs, backups, clipboard, screenshots in app switcher.
- [ ] MASVS-CRYPTO: platform keystores (Android Keystore, iOS Keychain/Secure Enclave), no hard-coded keys.
- [ ] MASVS-AUTH: biometric bound to keystore, server-side session control, step-up for sensitive actions.
- [ ] MASVS-NETWORK: TLS everywhere, certificate pinning where required, no cleartext traffic.
- [ ] MASVS-PLATFORM: safe WebViews, deep links/intents validated, exported components protected, IPC secured.
- [ ] MASVS-CODE: up-to-date platform/SDKs, input validation, no debug code; forced update for vulnerable versions.
- [ ] MASVS-RESILIENCE: root/jailbreak detection, anti-tampering, obfuscation (for high-risk apps such as banking).
- [ ] MASVS-PRIVACY: data minimisation, consent, transparency, user control over data.

**Authentication test matrix**
| Check | Variants | Expected result |
|---|---|---|
| Login | Valid; wrong password; unknown user; locked; disabled; expired password | Generic error for wrong user/password (no user enumeration); correct handling per state |
| Lockout / throttling | N failed attempts, N+1; distributed attempts | Lockout or progressive delay/CAPTCHA per policy; lockout notification |
| Password policy | Min length (NIST SP 800-63B: ≥ 8, allow ≥ 64), breached-password check, paste allowed | Weak/breached rejected; long passphrases accepted |
| MFA | TOTP, SMS/email OTP, push, WebAuthn/passkey; wrong, expired, reused code | Wrong/expired/reused rejected; MFA cannot be skipped by URL manipulation |
| Password reset | Token single-use, expiry, bound to user, no account enumeration | Old/used token rejected; same message for known/unknown email |
| SSO / OIDC / SAML | State and nonce, signature validation, audience, redirect_uri allow-list | Tampered/unsigned assertions rejected; open redirect impossible |
| Remember-me / device trust | Token theft, revocation on password change | Token invalid after password change or logout-all |

**Session management test matrix**
| Check | Variants | Expected result |
|---|---|---|
| Cookie attributes | Secure, HttpOnly, SameSite=Lax/Strict, Path, Domain | All set appropriately for session cookies |
| Session id | Entropy, rotation after login and privilege change | New id after login (no session fixation) |
| Idle and absolute timeout | Idle limit (e.g. 15 min for banking), absolute limit | Session ends; next request redirects to login |
| Logout | Logout then reuse old cookie/token; back button | Old session invalid server-side; cached pages not shown |
| Concurrent sessions | Same user on two devices | Allowed/limited per policy; "log out other sessions" works |
| Token handling (JWT) | alg=none, weak secret, expired, tampered claims, missing exp | All rejected; short lifetime; refresh rotation |
| CSRF | State-changing request from another origin | Rejected (SameSite and/or anti-CSRF token) |

**Authorisation test matrix (role × object × action)**
| Check | Variants | Expected result |
|---|---|---|
| Vertical escalation | User calls admin function via UI/URL/API | 403; no state change; event logged |
| Horizontal escalation (IDOR/BOLA) | User A accesses user B's object id | 403/404; no data returned |
| Tenant isolation | Tenant A token with tenant B ids/headers | Denied; no cross-tenant data in search, exports, reports |
| Field-level | Restricted field in response or update | Masked/omitted; update ignored or rejected |
| Workflow authority | Maker approves own transaction | Blocked (segregation of duties) |
| Hidden UI only | Button hidden but endpoint callable | Server rejects; hiding is not access control |
| Data scope by role | Manager sees team only; regional admin sees region only | Lists, search, exports respect scope |

**Input validation and injection**
- [ ] Server-side validation (allow-lists) for every input including headers, cookies, file names, JSON keys.
- [ ] Output encoding per context (HTML, attribute, JavaScript, URL, CSS); Content-Security-Policy.
- [ ] Parameterised queries; no dynamic SQL from input.
- [ ] XML parsers with external entities disabled (XXE); safe YAML/JSON deserialisation.
- [ ] Open redirects and unvalidated forwards.

**File upload and download**
- [ ] Type allow-list by content (magic bytes), not only extension; size limits; malware scanning.
- [ ] Stored outside web root; random names; served with Content-Disposition and correct Content-Type; no execution.
- [ ] Archive bombs, path traversal in zip entries, SVG with script, polyglot files, image parsers (ImageTragick class).
- [ ] Download authorisation per file (no guessable URLs without checks).

**Security headers and configuration**
- [ ] Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options: nosniff, frame-ancestors (or X-Frame-Options), Referrer-Policy, Permissions-Policy; cache-control no-store on sensitive pages.
- [ ] No server/version banners; debug endpoints, admin consoles, Swagger UI not publicly exposed in production.
- [ ] Cloud: storage buckets private, least-privilege IAM, secrets in a vault, no keys in repos/images.

**Data protection and privacy**
- [ ] PII/PHI/PAN classification; masking in UI (e.g. last 4 digits), exports and logs; encryption at rest/in transit.
- [ ] PCI DSS: no storage of CVV/full track data; PAN rendered unreadable; payment pages script integrity (req 6.4.3) and change detection (11.6.1).
- [ ] GDPR: lawful basis/consent, data subject rights (access, rectification, erasure, portability), retention, data residency.
- [ ] HIPAA: minimum necessary access, audit controls, automatic logoff, emergency access.

**Business-logic abuse**
- [ ] Negative quantities/prices, coupon stacking/reuse, race conditions (double spend, limit bypass with parallel requests), workflow step skipping, replay of one-time actions.
- [ ] Anti-automation for sensitive flows (account creation, booking, ticketing, gift cards).

**AI/LLM features (if present)**
- [ ] OWASP Top 10 for LLM Applications: prompt injection (direct/indirect), sensitive information disclosure, insecure output handling, excessive agency, data/model poisoning.

**Logging and monitoring**
- [ ] Logged: logins (success/failure), lockouts, privilege changes, access denials, admin actions, data exports; with user, time, source IP, correlation id.
- [ ] Not logged: passwords, tokens, full PAN, secrets, unnecessary PII.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Threat modelling** (STRIDE per data flow; attack trees for high-value assets) to derive abuse cases.
- **Misuse/abuse cases** alongside use cases.
- **Permission matrix** (role × object × action × ownership/tenant) for authorisation.
- **Equivalence partitioning** of users (anonymous, authenticated low-privilege, other tenant, admin) and inputs (benign, malicious classes).
- **Boundary value analysis** for lockout counts, timeouts, token expiry, rate limits, file sizes.
- **State transition** for session and account states (active, locked, suspended, password-expired, MFA-pending).
- **Error guessing / fuzzing** with payload lists (OWASP, SecLists), and **syntax testing** of inputs.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Secure login with MFA | Valid password + valid TOTP | Logged in; session cookie Secure/HttpOnly/SameSite; login event logged |
| Role-appropriate access | Manager views own team's records | Only team records listed; exports limited to team |
| Password change | Change password with correct current password | Success; other sessions invalidated; notification email sent |
| Data masking | Support agent views customer card | Only last 4 digits visible; full PAN never in DOM or API response |
| Security headers | Request any page | HSTS, CSP, nosniff, frame-ancestors, Referrer-Policy present |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| SQL injection | `' OR '1'='1` in search and login | Treated as literal text; no data leak; no SQL error shown |
| Stored XSS | `<img src=x onerror=alert(1)>` in profile name | Rendered as text/encoded; no script execution in any view (including admin and email) |
| IDOR | Change /invoices/1001 to /invoices/1002 (other user) | 403/404; no data |
| Privilege escalation | Standard user submits admin API request | 403; audit log entry |
| Session after logout | Replay old session cookie after logout | 401/redirect to login |
| Malicious upload | Upload `invoice.pdf.php` / EICAR test file | Rejected; not stored or quarantined; no execution |
| CSRF | Cross-origin POST to change email | Rejected |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Lockout threshold | 4th, 5th, 6th failed login (policy 5) | Locked at the 5th; message per policy; unlock per policy |
| Idle timeout | Activity at timeout − 1 min and timeout + 1 min | Session alive before; expired after |
| Token expiry | Access token at exp − 1 s and exp + 1 s (beyond leeway) | Accepted before; 401 after |
| Rate limit | N and N+1 OTP requests per window | N+1 blocked with 429/throttle message |
| Upload size | Max size and max + 1 byte | Max accepted; above rejected cleanly |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Account takeover chain | Reset password via email link on another device | Single-use link, expires, sessions revoked, user notified |
| Payment flow integrity | Card payment through hosted payment page | No PAN touches merchant servers; tampered amount rejected |
| Tenant isolation end to end | Tenant A user searches, exports, reports, API | No tenant B data anywhere |
| SSO login/logout | IdP login → app → IdP logout | Single logout invalidates app session |
| Audit trail | Admin changes role of a user | Change logged with who/when/old/new; visible to auditors only |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Fraud via race condition | 10 parallel withdrawals exceeding balance | Only allowed amount processed; no negative balance |
| Coupon abuse | Apply same single-use coupon in two sessions | Second use rejected |
| Insider misuse | Employee bulk-exports customer data | Export limited by role; large exports alerted |
| Regulatory | Data subject erasure request (GDPR) | Personal data erased/anonymised across systems; legal holds respected |
| Healthcare break-glass | Clinician uses emergency access | Access granted with reason; flagged and audited |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Unicode normalisation | Register "admın" (dotless i) vs "admin" | Treated as distinct or blocked per policy; no account confusion |
| Parameter pollution | `?role=user&role=admin` | Server uses a safe deterministic value; no escalation |
| HTTP verb tampering | HEAD/OPTIONS to bypass checks | Same authorisation as GET/POST |
| JWT alg confusion | `alg: none` or RS256→HS256 | Rejected |
| SSRF to metadata | Image URL `http://169.254.169.254/latest/meta-data/` | Blocked |
| Cache poisoning | Sensitive page cached by proxy | Cache-Control: no-store; no cross-user content |

## Entry and exit criteria
**Entry**: written authorisation and scope; threat model or risk list; test accounts for each role and tenant; environment isolated from production data; SAST/SCA results available.
**Exit**: authentication, session and authorisation matrices executed; OWASP Top 10 / API Top 10 (and MASVS for mobile) checks done; no open critical/high vulnerabilities (or formally risk-accepted with owner and date); pen-test findings retested; compliance evidence collected.

## Metrics
- Open vulnerabilities by severity (CVSS) and age; mean time to remediate.
- Coverage of authorisation matrix (role × endpoint pairs tested).
- SCA: dependencies with known critical/high CVEs.
- Security defects found pre-release vs in production / by pen test.
- Percentage of endpoints behind authentication and covered by DAST.

## Tools and automation
- SAST: Semgrep, SonarQube, CodeQL, Checkmarx; SCA: Dependabot, Snyk, OWASP Dependency-Check, npm audit; secrets: gitleaks, TruffleHog; DAST: OWASP ZAP, Burp Suite; containers/IaC: Trivy, Checkov; mobile: MobSF, Frida/Objection (authorised); TLS: testssl.sh, SSL Labs.
- Automation folder (<AppName>/): authorisation and session checks as API features (`features/api/`, tag `@security @feature:<Service>`) with a role × endpoint Scenario Outline; tokens per role from environment config via the `api` fixture (never committed); response assertions that sensitive fields are absent/masked; web checks for security headers via `page.request`/`response.headers()`; XSS payload rendering checks in page objects (assert text content, no dialog event); results to Allure with request/response evidence (secrets redacted).
- Run ZAP baseline against the test environment in CI; fail build on high alerts.
- Do not automate: exploitation, social engineering, destructive tests; these belong to authorised pen testers.

## Common pitfalls
- Relying on UI hiding for access control instead of testing the server.
- Only testing as admin.
- Running scanners without authentication (most of the app unscanned).
- Using real customer data or production credentials in tests.
- Treating a pen test as a one-off instead of continuous security testing.

## Related sub-skills
Domain_Test_Design_Skill-Test-API, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-App-AIML, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-Domain-Healthcare, Domain_Test_Design_Skill-Domain-FinancialServices, Domain_Test_Design_Skill-Core-RiskAndData.
