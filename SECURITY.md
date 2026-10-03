# Security

## Architecture and boundaries
Static research data, browser checklist/theme/quote storage and an optional same-origin /api/quotes. The pricing backend, authentication, provider keys, deployment configuration and cloud IAM are absent and remain unaudited. This app does not execute LLM tools, place trades or manage investment accounts. Trusted data.js is maintained as source; imported quote responses/localStorage are untrusted.

Expected ticker/finite numeric fields are validated; invalid custom metrics are discarded, and raw API errors are not displayed. HTML text is encoded. Browser storage is unencrypted, scoped only by origin, and must not hold account/credential data. A service worker caches only exact public shell URLs, omits credentials, refuses redirects/private/no-store responses and leaves other applications' caches alone. Only its own scoped versions and known legacy shell-cache names are removed. API/private routes always bypass the cache. Offline prices may be stale and are not suitable for execution decisions.

CSP limits scripts/connections to own origin; inline style remains for data visualization. Hosting should use a dedicated origin and supply HTTPS, nosniff, frame-ancestors and private/no-store headers for any future sensitive endpoint. Meta CSP cannot provide frame-ancestors. Stage both initial PWA installation and upgrading an existing worker before production release; do not mix authenticated data into public shell files. No actual hosted service was changed. Node 24: node --test tests/security.test.mjs.


## Reporting and maintenance
Use GitHub private vulnerability reporting if enabled for this repository, or an already established private maintainer contact. If neither is available, open an issue asking for a private contact without publishing exploit details, customer data or credentials. Never paste a secret into an issue or pull request. Potential historical credentials must be treated as compromised, rotated by the owner and audited before any history rewrite; no rotation or rewrite is automatic.

See [pre-change assessment](docs/security/ASSESSMENT.md) and [verification/review](docs/security/VERIFICATION.md). Source review and offline tests are not production certification. The prepared security workflow (not yet active; see VERIFICATION.md) is read-only, pinned by commit, uses no production credentials and never deploys. Keep action pins and scanners current through reviewed maintenance PRs.
