# Security Review Methodology

## Review Cadence

- Threat-model review before a new trust boundary or provider integration.
- Security review on every authentication, authorization, upload, webhook, billing,
  training, export, deletion, or model-deployment change.
- Dependency and container scan on every build.
- Quarterly access, secret, backup, restore, and incident-response review.
- Independent penetration test before external SaaS launch.

## Method

### 1. Inventory

Record actors, assets, entry points, data classes, secrets, external providers, workers,
stores, queues, model artifacts, administrative paths, and trust boundaries.

### 2. Classify Data

Classify each field and artifact as public, internal, confidential, restricted, personal,
credential, payment-related, or model-sensitive. Define owner, purpose, retention,
encryption, export, deletion, and logging rules.

### 3. STRIDE Analysis

For each component and data flow evaluate:

- Spoofing: forged users, services, callbacks, or workers.
- Tampering: modified media, jobs, indices, models, or ledger entries.
- Repudiation: actions without immutable actor and timestamp evidence.
- Information disclosure: tenant, secret, media, outcome, or model leakage.
- Denial of service: upload bombs, queue flooding, provider exhaustion, GPU starvation.
- Elevation of privilege: role manipulation, object-reference abuse, admin bypass.

### 4. Abuse Cases

At minimum test cross-tenant IDs, forged JWTs, stale/replayed webhooks, duplicate paid
submissions, malicious media, SSRF, prompt injection, quota races, consent revocation,
poisoned datasets, substituted checkpoints, and deletion/restore conflicts.

### 5. Risk Scoring

Score likelihood and impact from 1-5. Risk is `likelihood x impact`.

- 20-25: Critical; blocks all affected releases.
- 12-19: High; must be fixed before production exposure.
- 6-11: Medium; mitigation owner and deadline required.
- 1-5: Low; accept only with recorded rationale.

### 6. Verification Evidence

Each mitigation links to a test, configuration check, scan, trace, screenshot, restore
record, or signed decision. Documentation without executable evidence does not close an
implementation risk.

## Required Review Outputs

- Current architecture and trust-boundary diagram.
- Data-flow diagrams including missing, empty, invalid, timeout, duplicate, and stale paths.
- Threat register with owner, risk, mitigation, test, and status.
- Permission matrix and sensitive-action audit catalog.
- Dependency, image, and model provenance report.
- Security test report and unresolved exceptions.
- Rollback and incident-response procedure.

## Release Decision

The security owner may approve, reject, or time-limit a release exception. Critical
tenant, credential, payment, integrity, and consent failures cannot receive exceptions.
