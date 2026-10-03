# Security assessment before changes

Date: 2026-10-03. Baseline: d894f80. Source/configuration, all fetched refs and offline fixtures reviewed. No production mutation or network exploit testing.

## Threat model

Public frontend mirror of the investment map: trusted data.js, local browser checklist and optional /api/quotes; browser service-worker cache is the major shared-origin boundary. Backend, credentials, trading and cloud deployment are not present.

## Findings

| ID | Severity | Evidence and impact | Remediation |
|---|---|---|---|
| VC-01 | Medium | Service worker persists arbitrary same-origin GETs/navigations and deletes caches belonging to other applications. | Exact shell allowlist, refuse private/API/redirect caching, own-cache cleanup only. |
| VC-02 | Low | Loose quote/localStorage validation and raw API error display. | Expected ticker/numeric schema, persisted input bounds, fixed diagnostics and timeout. |
| VC-03 | Low | No static CSP, tests or security guidance. | Add minimal policy and offline CI. |

No Critical or High finding confirmed within this repository scope. Gitleaks 8.30.1 redacted full fetched-history scan found no secret. No package manifest/lockfile or third-party executable JS dependencies are present. SQL/command injection, server CSRF/SSRF, container security, database grants, cloud IAM and production encryption are not assessable where those components are absent. Browser storage is neither encrypted nor an authorization boundary. Deployment headers, domain isolation and backend controls require owner verification. No existing automated test/build command was provided; browser scripts can be syntax checked and focused offline regressions added.
