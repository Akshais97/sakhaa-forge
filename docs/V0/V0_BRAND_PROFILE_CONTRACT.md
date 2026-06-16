# Product V0 Brand Profile Contract

**Status:** Canonical normalised brand-truth contract  
**Owners:** Brand domain, `BrandProfile`, `BrandCandidate`, `BrandApproval`, `BrandRule`

## 1. Contract Principles

- Extraction produces candidates, never approved truth.
- Every non-manual value retains source evidence and confidence.
- One exact approved profile version is active per workspace/brand.
- Approval resolves required fields and material source conflicts.
- Approved versions are immutable. Corrections create a new version.
- Historical production lineage keeps the exact profile ID/version used.
- Unsupported claims remain prohibited or pending; absence of evidence is not approval.

## 2. Top-Level Schema

```json
{
  "schema_version": "v0.brand-profile.1",
  "profile_id": "uuid",
  "workspace_id": "uuid",
  "brand_id": "uuid",
  "version": 3,
  "status": "approved",
  "name": {},
  "positioning": {},
  "visual_identity": {},
  "voice": {},
  "products": [],
  "audiences": [],
  "offers": [],
  "calls_to_action": [],
  "claims": [],
  "rules": [],
  "publishing": {},
  "source_summary": {},
  "approval": {}
}
```

## 3. Common Evidence Value

Extracted scalar/list fields use:

```json
{
  "value": "Book a site visit",
  "confidence": 0.96,
  "decision": "approved",
  "sources": [
    {
      "source_type": "website|document|upload|manual",
      "artifact_id": "uuid",
      "locator": "page URL hash, page section or document page",
      "observed_at": "2026-06-15T10:00:00Z",
      "excerpt_hash": "sha256"
    }
  ],
  "approved_by": "uuid",
  "approved_at": "2026-06-15T11:00:00Z"
}
```

Confidence is extraction confidence, not business truth. Human approval is the production
gate.

## 4. Confidence

| Range | Label | Treatment |
|---:|---|---|
| `0.90-1.00` | High | Still requires approval |
| `0.70-0.89` | Medium | Highlight source and alternatives |
| `0.00-0.69` | Low | Cannot auto-populate a required approval field without explicit confirmation |

Manual values use `confidence: 1.0`, `source_type: manual` and the responsible actor. This
means direct assertion, not independent verification.

## 5. Required Fields for Approval

- public brand name;
- primary market/industry;
- what the brand sells;
- one positioning statement;
- at least one target audience;
- at least one approved product/project;
- one approved CTA;
- tone attributes;
- primary logo or explicit no-logo decision;
- primary colour or explicit flexible-colour decision;
- claims policy with prohibited/pending claims;
- rights attestation;
- approval actor and timestamp.

For real estate, the relevant regulatory/claim-evidence state is required before using
registration, completion, price, distance, return or availability claims.

## 6. Field Contract

### Identity and Positioning

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `name.public` | evidence string | Yes | Customer-facing name |
| `name.legal` | evidence string | No | Restricted visibility |
| `industry` | enum/string | Yes | V0 initial value `real_estate` |
| `markets` | evidence string[] | Yes | Country/city/service market |
| `positioning.statement` | evidence string | Yes | One concise approved statement |
| `positioning.differentiators` | evidence string[] | No | Evidence-backed |
| `positioning.proof_points` | evidence string[] | No | Links to claims/evidence |
| `competitors` | evidence object[] | No | Includes allowed/prohibited comparison |

### Visual Identity

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `visual_identity.logos` | asset references | Conditional | primary/light/dark/icon with usage |
| `visual_identity.colors` | colour objects | Conditional | role, hex, source, prohibited contexts |
| `visual_identity.fonts` | font objects | No | family, role, licence/source, fallback |
| `visual_identity.imagery` | rules | No | approved/prohibited subjects and treatments |
| `visual_identity.layout_rules` | string[] | No | logo clearspace, safe areas, etc. |

Colour object:

```json
{
  "role": "primary",
  "value": "#173B57",
  "decision": "approved",
  "sources": [],
  "usage": ["headline", "background"],
  "prohibited_usage": ["error status"]
}
```

### Voice

| Field | Type | Required |
|---|---|:---:|
| `voice.attributes` | approved string[] | Yes |
| `voice.avoid` | string[] | Yes, may be empty after explicit review |
| `voice.formality` | enum `formal,balanced,conversational` | Yes |
| `voice.languages` | language tags | Yes |
| `voice.approved_examples` | evidence strings | No |
| `voice.pronunciations` | term/phonetic objects | No |

### Products and Offers

Product fields:

- `product_id`;
- approved name;
- category;
- description;
- audience IDs;
- evidence;
- active dates;
- geographic scope;
- required disclosures;
- status.

Offer fields:

- offer text;
- start/end;
- eligibility;
- evidence;
- required disclaimer;
- CTA IDs;
- expired behaviour.

### Audiences

- stable audience ID;
- name;
- geography;
- funnel stage;
- needs;
- objections;
- approved language;
- prohibited assumptions;
- source evidence.

Protected traits are neither inferred nor used without a separately approved lawful
basis.

### Calls to Action

- label;
- destination/action type;
- funnel stage;
- required contact/account;
- approved channels;
- urgency allowed;
- evidence/owner;
- active dates.

### Claims

```json
{
  "claim_id": "claim-rera-001",
  "text": "RERA-registered project",
  "status": "approved_with_disclaimer",
  "evidence_artifact_id": "uuid",
  "evidence_expires_at": null,
  "required_disclaimer": "Registration details available on request.",
  "allowed_channels": ["script", "caption"],
  "prohibited_rewrites": ["government guaranteed"]
}
```

Statuses: `approved`, `approved_with_disclaimer`, `pending_evidence`, `prohibited`,
`expired`.

### Rules

Rule types:

- `required_phrase`;
- `prohibited_phrase`;
- `required_disclosure`;
- `prohibited_claim`;
- `visual_required`;
- `visual_prohibited`;
- `competitor_reference`;
- `channel_restriction`;
- `avatar_restriction`.

Every rule has scope, severity, rationale, evidence and active dates.

## 7. Source Conflict Behaviour

Sources are ranked for presentation, not silently selected:

1. current signed/approved guideline or legal evidence;
2. explicit authorised manual assertion;
3. current official website;
4. current approved campaign asset;
5. older or third-party source.

When material values disagree:

- create separate candidates;
- mark `conflict=true`;
- show source date and authority;
- block approval for required fields;
- require an authorised actor to choose or enter a replacement;
- retain rejected alternatives and the decision reason.

## 8. Approval

Approval requires:

- actor with Owner/Admin/Brand Manager permission;
- latest profile version;
- all required fields resolved;
- no critical unresolved conflict;
- rights attestation present;
- rule/claim review completed;
- optimistic version match;
- append-only `BrandApproval` and `AuditEvent`.

Approval creates the sole active version transactionally. Rejection or request changes
does not mutate the candidate evidence.

## 9. Versioning

- `schema_version` changes when the contract changes.
- `version` increments for each brand-profile revision.
- Approved versions are immutable.
- Editing an approved profile clones it to a draft new version.
- Supersession blocks new production use but does not alter historical generations.
- Consent, claims or rights revocation can immediately block future use independent of
  profile immutability.

## 10. Golden Real-Estate Example

```json
{
  "schema_version": "v0.brand-profile.1",
  "profile_id": "21000000-0000-4000-8000-000000000003",
  "workspace_id": "10000000-0000-4000-8000-000000000001",
  "brand_id": "20000000-0000-4000-8000-000000000001",
  "version": 3,
  "status": "approved",
  "name": {
    "public": {
      "value": "Aster Heights",
      "confidence": 1.0,
      "decision": "approved",
      "sources": [{"source_type": "manual", "artifact_id": null, "locator": "intake:name"}]
    }
  },
  "industry": "real_estate",
  "markets": [{"value": "Bengaluru", "confidence": 0.99, "decision": "approved", "sources": []}],
  "positioning": {
    "statement": {
      "value": "Premium, practical homes for urban professionals and families.",
      "confidence": 0.91,
      "decision": "approved",
      "sources": []
    },
    "differentiators": [
      {"value": "Practical layouts for owner-occupied homes", "confidence": 0.84, "decision": "approved", "sources": []}
    ]
  },
  "visual_identity": {
    "logos": [{"role": "primary", "artifact_id": "fixture-logo-primary", "decision": "approved"}],
    "colors": [
      {"role": "primary", "value": "#173B57", "decision": "approved", "sources": []},
      {"role": "secondary", "value": "#D8B46A", "decision": "approved", "sources": []},
      {"role": "background", "value": "#F7F4EE", "decision": "approved", "sources": []}
    ],
    "fonts": [
      {"role": "heading", "family": "Manrope", "licence": "OFL-1.1", "decision": "approved"},
      {"role": "body", "family": "Source Sans 3", "licence": "OFL-1.1", "decision": "approved"}
    ]
  },
  "voice": {
    "attributes": ["calm", "premium", "direct", "informative"],
    "avoid": ["hype", "guaranteed return", "pressure selling"],
    "formality": "balanced",
    "languages": ["en-IN"]
  },
  "audiences": [{
    "audience_id": "aud-urban-professionals",
    "name": "Urban professionals and families",
    "geography": ["Bengaluru"],
    "funnel_stage": "consideration",
    "needs": ["practical layout", "commute clarity", "site visit"],
    "prohibited_assumptions": ["religion", "caste", "health", "family status inference"]
  }],
  "products": [{
    "product_id": "project-aster-heights",
    "name": "Aster Heights",
    "category": "residential_project",
    "status": "active"
  }],
  "calls_to_action": [{
    "cta_id": "cta-site-visit",
    "label": "Book a site visit",
    "action_type": "lead_form",
    "decision": "approved"
  }],
  "claims": [
    {
      "claim_id": "claim-rera",
      "text": "RERA-registered",
      "status": "approved_with_disclaimer",
      "evidence_artifact_id": "fixture-rera-brochure",
      "required_disclaimer": "Registration details available on request."
    },
    {
      "claim_id": "claim-appreciation",
      "text": "Guaranteed appreciation",
      "status": "prohibited",
      "evidence_artifact_id": null
    }
  ],
  "rules": [
    {"type": "prohibited_phrase", "value": "assured returns", "severity": "critical"},
    {"type": "required_phrase", "value": "Terms and availability apply", "severity": "warning"}
  ],
  "approval": {
    "actor_id": "00000000-0000-4000-8000-000000000003",
    "approved_at": "2026-06-15T11:00:00Z",
    "decision": "approve"
  }
}
```

## 11. Validation

- JSON Schema validates structure at API/worker boundaries.
- Domain validation enforces approval and conflict rules.
- Database constraints enforce one active approved version.
- Golden fixtures validate backward compatibility.
- Downstream generation receives only the immutable approved profile ID and selected
  fields required for that job.

