# Project Frontend Guardrails

- Next.js browser and server components have no PostgreSQL, Redis or provider secrets.
- Use generated TypeScript clients from versioned OpenAPI; do not hand-maintain duplicate
  API types.
- Keep remote state in a query cache and local interaction state near the owning feature.
- Validate forms with shared schemas and display field-level actionable errors.
- Async operations expose queued, running, delayed, retrying, failed, cancelled and
  completed states where applicable.
- Never infer paid-operation success from a timeout or optimistic UI.
- Preserve selected workspace, objective, revision and version throughout navigation.
- Require confirmation for paid, publishing, credential, deletion and model-promotion
  actions.
- Meet keyboard, focus, contrast, screen-reader and reduced-motion requirements.
- Never use visual design to imply unsupported scientific certainty.

