export interface BrandData {
  id: string;
  name: string;
  niche: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  url: string;
  guidelines: string[];
  extractedCandidates: {
    logos: string[];
    colors: string[];
    tone: string;
    usps: string[];
    ctas: string[];
    prohibitions: string[];
  };
  sampleBlueprint: {
    sourceUrl: string;
    category: string;
    metrics: { views: string; engagement: string; ratio: string };
    structure: {
      hook: string;
      setup: string;
      value: string;
      cta: string;
    };
  };
  scripts: {
    id: string;
    hookType: string;
    hookText: string;
    setupText: string;
    valueText: string;
    ctaText: string;
    score: number;
    brandFit: string;
    safety: 'Safe' | 'Warning' | 'Blocked';
  }[];
  avatars: {
    id: string;
    name: string;
    type: string;
    avatarUrl: string;
    consentState: 'Eligible' | 'Consent Expired' | 'Consent Revoked' | 'Consent Missing' | 'Service Pending';
    voice: string;
  }[];
  costEstimate: {
    duration: string;
    priceVersion: string;
    maxAuthorised: string;
    walletBalance: string;
    reservationId: string;
  };
  composition: {
    direction: string;
    captions: string;
    assetsChecked: string[];
    validationWarnings: string[];
    timeline: { time: string; action: string }[];
  };
  reviewItem: {
    version: string;
    thumbnailUrl: string;
    comments: { user: string; text: string; time: string }[];
    status: 'Pending' | 'Approved' | 'Changes Requested';
    hash: string;
  };
  calendarPost: {
    platform: string;
    account: string;
    caption: string;
    time: string;
    publishStatus: 'Scheduled' | 'Publishing' | 'Published Unverified' | 'Published Verified';
    verificationChecklist: { label: string; done: boolean }[];
    liveUrl: string;
  };
}

export interface ProductionStage {
  id: number;
  key: string;
  label: string;
  title: string;
  tagline: string;
  description: string;
  nextSafeAction: string;
}
