# Product V0 Generation Integration

## Ownership Correction

Product V0 owns the required HeyGen integration. Product V1 may add generation providers
without changing that ownership boundary. Product V2 Sakhaa does not hold generation
credentials, submit generation jobs, receive provider webhooks, or capture creator
credits.

This file documents the provider behavior V0 must expose through the stable boundary in
`../Project/Architecture/PROJECT_ARCHITECTURE_V1_V2_BOUNDARY.md`. Any previous wording that assigned direct HeyGen ownership to
Sakhaa is superseded.

## API Choice

Use HeyGen v3 with API-key authentication for automation. As of June 10, 2026, video
creation is `POST /v3/videos`; the request supports scripts or audio, callback URLs,
multiple aspect ratios, 720p/1080p/4K options, and Avatar IV/V selection.

## V0 Production Flow

1. Convert the selected V0 script, approved brand profile and avatar into a versioned
   internal generation brief.
2. Validate script length, avatar consent, voice, aspect ratio, asset accessibility and
   the configured HeyGen input limits.
3. Reserve creator credits and persist a provider operation before network I/O.
4. Submit to HeyGen with the operation's unique idempotency identity.
5. Store provider IDs, request hash, price version and estimated maximum cost.
6. Verify and de-duplicate callbacks; polling and reconciliation remain available.
7. Retain completed media in B2 and create the canonical generated asset.
8. Capture or release credits exactly once.
9. Reconcile stale or `unknown` provider jobs without blind resubmission.

Future V2 briefs enter only through the V1 production boundary described in
`../Project/Architecture/PROJECT_ARCHITECTURE_V1_V2_BOUNDARY.md`; they are not part of
V0 acceptance.

## Limits and Cost

Current official self-serve API pricing is duration-based. Avatar IV/V photo avatars are
listed at USD 0.05/second for 720p/1080p; digital twin and studio avatars at USD
0.0667/second. Treat prices as configuration, not constants. The pay-as-you-go concurrency
limit is documented as 10 active video jobs. Respect `429` and `Retry-After`.
Validate official limits at deployment time: scripts are currently limited to 5,000
characters, avatar audio to 10 minutes, input videos to 100 MB, images/audio to 50 MB,
and asynchronous pay-as-you-go generation to 10 concurrent jobs.

## Security

HeyGen secrets and raw callbacks stay inside V0. V0 webhook handlers preserve raw bytes,
compare signatures in constant time, enforce a timestamp window, respond quickly, and
process asynchronously. Provider URLs are transient; V0 owns the retained production
copy. V2 receives short-lived media access or a policy-approved analytical copy.

## Sources

- https://developers.heygen.com/reference/create-video
- https://developers.heygen.com/reference/get-video
- https://developers.heygen.com/docs/webhooks
- https://developers.heygen.com/docs/usage-limits
- https://developers.heygen.com/docs/pricing
