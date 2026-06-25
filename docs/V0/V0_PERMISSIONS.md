# Product V0 Permissions

V0 uses four workspace roles:

- `OWNER`: workspace owner with all workspace, billing, recovery and export authority.
- `ADMIN`: trusted administrator for workspace settings, credentials, recovery,
  reconciliation and production support.
- `CLIENT_MANAGER`: the end-user production role. This role combines brand,
  strategy and wallet responsibilities so a customer can approve brand truth,
  run creation, authorise paid generation, manage wallet purchases, approve media and
  publish without switching roles.
- `REVIEWER`: limited review participant who can inspect assigned review context and
  submit comments.

The dedicated `OPERATOR`, `BRAND_MANAGER`, `STRATEGIST` and `FINANCE` roles are removed.
Break-glass recovery controls, provider reconciliation, credential rotation and
compensating credit adjustments are assigned to Owner/Admin because they are system
control actions, not normal client workflow actions.

| Capability | Owner | Admin | Client Manager | Reviewer |
|---|:---:|:---:|:---:|:---:|
| Manage workspace/members | Yes | Yes | No | No |
| Manage provider credentials | Yes | Yes | No | No |
| Manage workspace capabilities | Yes | Yes | No | No |
| Approve brand profile/assets | Yes | Yes | Yes | No |
| Select blueprint and run scripts | Yes | Yes | Yes | No |
| Confirm paid generation | Yes | Yes | Yes | No |
| Manage avatars/consent | Yes | Yes | Yes | No |
| Submit review comments | Yes | Yes | Yes | Yes |
| Approve/reject final video | Yes | Yes | Yes | No |
| Schedule/publish approved media | Yes | Yes | Yes | No |
| Purchase credits and view wallet ledger | Yes | Yes | Yes | No |
| Adjust credits | Yes | Yes | No | No |
| View provider/financial reconciliation | Yes | Yes | No | No |
| Retry/reconcile provider jobs | Yes | Yes | No | No |
| Export/delete workspace | Yes | Yes | No | No |
| View operational traces and metrics | Yes | Yes | No | No |
| Run restore drills | Yes | Yes | No | No |
| Configure simulator modes | Yes | Yes | No | No |

Every action remains workspace-scoped and audited. Ownership does not bypass consent,
brand approval, credit, review or publication gates. Break-glass access requires a
reason, expiry and separate audit event.
