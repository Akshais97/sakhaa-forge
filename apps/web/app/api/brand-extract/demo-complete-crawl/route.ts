import { NextResponse } from 'next/server.js';

export const runtime = 'nodejs';

const LOCAL_DEV_WORKER_TOKEN = 'local-dev-worker-token';

function demoScrapeFixture(input: {
  websiteUrl: string;
  brandName: string;
  industry: string;
}) {
  const brandName = input.brandName.trim() || 'Demo Brand';
  const industry = input.industry.trim() || 'Real Estate';
  const websiteUrl = input.websiteUrl.trim();

  return {
    pages: [
      {
        url: websiteUrl,
        title: `${brandName} | Brand source`,
        text: [
          `${brandName} is a ${industry} brand serving customers in India.`,
          'USPs: Clear customer communication, retained brand evidence, rights-aware creative workflow.',
          'Book a consultation today.',
          'Avoid unsupported guarantees, assured returns, or unverifiable performance claims.'
        ].join(' '),
        branding: {
          colors: { primary: '#173B57', secondary: '#D8B46A', accent: '#0F766E' },
          typography: { fontFamilies: { heading: 'Manrope', primary: 'Source Sans 3' } },
          personality: { tone: 'professional', energy: 'medium', targetAudience: 'India-first customers' },
          images: { logo: `${websiteUrl.replace(/\/$/, '')}/logo.svg`, logoAlt: `${brandName} logo` }
        }
      }
    ]
  };
}

async function postWorker(apiBaseUrl: string, path: string, body: unknown) {
  return fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-v0-worker-token': process.env.V0_INTERNAL_WORKER_TOKEN || LOCAL_DEV_WORKER_TOKEN
    },
    body: JSON.stringify(body)
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.BRAND_EXTRACT_DEMO_AUTH_ENABLED !== '1') {
    return NextResponse.json(
      { code: 'DEMO_WORKER_DISABLED', detail: 'Local demo crawl completion is disabled in production.' },
      { status: 403 }
    );
  }

  const input = await request.json().catch(() => ({}));
  if (
    typeof input.workspaceId !== 'string' ||
    typeof input.jobId !== 'string' ||
    typeof input.websiteUrl !== 'string'
  ) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', detail: 'workspaceId, jobId and websiteUrl are required.' },
      { status: 422 }
    );
  }

  const apiBaseUrl = `${(process.env.V0_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/v0`;
  const claimed = await postWorker(apiBaseUrl, `/internal/jobs/${encodeURIComponent(input.jobId)}/claim`, {
    resourceClass: 'CPU'
  });
  const claimedBody = await claimed.json().catch(() => ({}));
  if (!claimed.ok || !claimedBody?.attempt?.leaseToken) {
    return NextResponse.json(
      {
        code: claimedBody?.code || 'DEMO_JOB_CLAIM_FAILED',
        detail: claimedBody?.detail || 'Could not claim the backend crawl job.'
      },
      { status: claimed.status || 502 }
    );
  }

  const completed = await postWorker(apiBaseUrl, `/internal/jobs/${encodeURIComponent(input.jobId)}/complete`, {
    leaseToken: claimedBody.attempt.leaseToken,
    workspaceId: input.workspaceId,
    schemaVersion: 'brand.extraction.output.v1',
    scrape: demoScrapeFixture({
      websiteUrl: input.websiteUrl,
      brandName: typeof input.brandName === 'string' ? input.brandName : '',
      industry: typeof input.industry === 'string' ? input.industry : ''
    })
  });
  const completedBody = await completed.json().catch(() => ({}));
  if (!completed.ok) {
    return NextResponse.json(
      {
        code: completedBody?.code || 'DEMO_JOB_COMPLETE_FAILED',
        detail: completedBody?.detail || 'Could not complete the backend crawl job.'
      },
      { status: completed.status || 502 }
    );
  }

  return NextResponse.json(completedBody);
}
