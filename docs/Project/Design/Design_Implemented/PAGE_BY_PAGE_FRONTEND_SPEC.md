# Page-by-page frontend spec

## Foundation pages

| Page | Route | Status | Purpose | Primary action | States | Permissions |
|---|---|---|---|---|---|---|
| Product entry | `/` | Implemented shell, required public route | Entry or redirect | Sign in or open workspace | loading, redirect, public-safe | Public/authenticated |
| Sign in | `/sign-in` | Required | Supabase sign-in | Sign in | loading, provider failure, expired callback | Signed-out |
| Auth callback | `/auth/callback` | Required | Process provider response | Complete auth exchange | processing, malformed, expired, denied | Provider callback |
| No workspace | `/access-denied` | Required | No permitted workspace | Create/request access | empty, loading, forbidden | Authenticated |
| Service status | `/service-status` | Required | Sanitised health | Inspect status | healthy, degraded, unavailable | Public-safe |

## Production pages

| Page | Route | Status | Purpose | Primary action | Required components |
|---|---|---|---|---|---|
| Workspace home | `/w/{slug}` | Required | Next-action summary | Continue current production | next-action cards, recent jobs, capability status |
| Brands | `/w/{slug}/brands` | Required | Brand list | Create brand | list, filters, empty state |
| Brand intake | `/w/{slug}/brands/new` | Required | URL/upload intake | Submit permitted source | upload, rights acknowledgement, crawl scope |
| Brand review | `/w/{slug}/brands/{brandId}/profiles/{profileId}/review` | Required | Candidate approval | Approve profile | candidate evidence, diff, rules |
| Blueprints | `/w/{slug}/blueprints` | Required | Reusable library | Select/start | blueprint cards, compatibility |
| Path selection | `/w/{slug}/blueprints/new` | Required | Existing/new/default choice | Choose path | explicit choice cards |
| Discovery | `/w/{slug}/discover` | Required | Viral search | Search/select | candidate cards, rights warnings |
| Candidate detail | `/w/{slug}/discover/{candidateId}` | Required | Inspect source | Extract blueprint | metrics snapshot, media preview, rights warning |
| Blueprint detail | `/w/{slug}/blueprints/{blueprintId}` | Required | Formula/prompt detail | Use for scripts | formula slots, prompt, lineage |
| Scripts | `/w/{slug}/scripts` | Required | Tournament history | Create tournament | tournament list |
| New tournament | `/w/{slug}/scripts/new` | Required | Configure scripts | Generate scripts | constraints form |
| Tournament detail | `/w/{slug}/scripts/{tournamentId}` | Required, shell workflow exists | Observe variants | Open comparison | variants, evaluations |
| Script comparison | `/w/{slug}/scripts/{tournamentId}/compare` | Required, shell workflow exists | Select exact script | Select variant | comparison matrix, selection confirm |
| Avatars | `/w/{slug}/avatars` | Required, shell workflow exists | Eligible catalogue | Select avatar | eligibility cards |
| Credits | `/w/{slug}/credits` | Required, shell workflow exists | Wallet and ledger | Purchase/read ledger | ledger table, reconciliation banner |
| Purchase credits | `/w/{slug}/credits/purchase` | Required | Start payment | Purchase credits | provider checkout states |
| New generation | `/w/{slug}/generate/new` | Required, shell workflow exists | Estimate/reserve | Reserve credits | estimate panel, confirmation |
| Generation detail | `/w/{slug}/generations/{generationId}` | Required, shell workflow exists | Submit/reconcile/settle | Observe provider | provider operation, unknown state |
| Composition | `/w/{slug}/compositions/{compositionId}` | Required, workflow module exists | AE plan/render | Validate/render | plan validator, render attempt |
| Final video | `/w/{slug}/videos/{finalVideoId}` | Required, workflow module exists | Exact revision | Review/create revision | 9:16 player, hash, lineage |
| Reviews | `/w/{slug}/reviews` | Required, workflow module exists | Assigned reviews | Open review | queue |
| Review item | `/w/{slug}/reviews/{reviewItemId}` | Required, workflow module exists | Comment/decision | Approve/reject/request change | media player, comments, decision binder |
| Calendar | `/w/{slug}/calendar` | Required, workflow module exists | Schedule list | Create schedule | calendar/list |
| New schedule | `/w/{slug}/calendar/new` | Required, workflow module exists | Schedule/export | Schedule/export | post editor, manual export |
| Post detail | `/w/{slug}/posts/{calendarPostId}` | Required, workflow modules exist | Publish/verify | Publish or verify | publish operation, verification checklist |
| Performance | `/w/{slug}/posts/{calendarPostId}/performance` | Required, workflow module exists | Observed snapshots | Collect/read | snapshot archive |
| Lineage | `/w/{slug}/lineage/{finalVideoId}` | Required, workflow module exists | Export ancestry | Inspect/export | lineage graph, manifest hash |

Open question: the current shell lacks durable Next.js page files for these canonical routes. Implementation sequencing should not create them until the owning slice/page work is planned.

