# Definition of Done

A change is done when:

- acceptance behavior is implemented;
- targeted tests failed first and now pass;
- relevant unit, contract, integration, and end-to-end tests pass;
- tenant and authorization impact is reviewed;
- observability and error handling cover new failure modes;
- schemas, migrations, fixtures, generated clients, and docs are updated;
- secrets and personal data are not introduced;
- performance and cost impact are measured when relevant;
- model/data changes include evaluation and lineage;
- scientific claims match `../../V2/V2_SCIENTIFIC_CLAIMS_REGISTER.md`;
- acceptance evidence links to the owning metric and release gate;
- migrations include RLS impact and use Prisma only;
- any raw SQL is named, parameterized, typed and query-plan reviewed;
- queue changes prove PostgreSQL recovery after Redis loss or duplicate delivery;
- Python-worker changes prove authenticated completion and artifact integrity;
- rollback or forward recovery is documented;
- no placeholders, unsupported atlas assumptions, or non-A-Q cluster contracts enter current code.

For a release, add staging verification, backup/restore confidence, dependency and license
review, operational ownership, and signed-off release notes.
Model release additionally requires dataset/model cards, pre-registration, eligible
consent, cost evidence, and rollback rehearsal.
