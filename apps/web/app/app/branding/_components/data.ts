// Demo fixture for the Brand Evidence Atelier mockup.
// In production this would be hydrated from the generated V0 client.

export type ScanState =
  | "idle"
  | "sourceLocked"
  | "crawling"
  | "extracting"
  | "candidatesReady"
  | "approved";

export interface ExtractedColor {
  hex: string;
  label: string;
}

export interface USPCard {
  id: string;
  title: string;
  evidence: string;
}

export interface Prohibition {
  id: string;
  rule: string;
}

export interface ComplianceNote {
  id: string;
  label: string;
  detail: string;
  severity: "info" | "warning";
}

export interface MissingAsset {
  id: string;
  name: string;
  reason: string;
}

export interface BrandIntakeFixture {
  id: string;
  name: string;
  url: string;
  primaryColor: string;
  secondaryColor: string;
  logoMark: string;
  tagline: string;
  description: string;
  extractedColors: ExtractedColor[];
  toneLabels: string[];
  usps: USPCard[];
  ctas: string[];
  prohibitions: Prohibition[];
  complianceNotes: ComplianceNote[];
  missingAssets: MissingAsset[];
  readinessScore: number;
  reviewHash: string;
}

export const DEMO_BRAND: BrandIntakeFixture = {
  id: "aura",
  name: "Aura Luxury Estates",
  url: "https://auraestates.in",
  primaryColor: "#D4AF37",
  secondaryColor: "#1A1813",
  logoMark: "Aura",
  tagline: "Ultra-Luxury Coastal Villas",
  description:
    "Aura Alibaug. Ten private estates carved from volcanic stone and seaside breeze. Private infinity pools, fully serviced concierge, and architectural provenance.",
  extractedColors: [
    { hex: "#D4AF37", label: "Metallic Gold" },
    { hex: "#F7F5F0", label: "Alabaster White" },
    { hex: "#1C1917", label: "Stone Dark" },
    { hex: "#8B7355", label: "Bronze Sand" }
  ],
  toneLabels: [
    "Sophisticated",
    "Measured",
    "Aspirational",
    "Calming",
    "Heritage-grounded"
  ],
  usps: [
    {
      id: "usp-1",
      title: "Private infinity pool overlooking the Arabian Sea",
      evidence: "Hero section + amenities page"
    },
    {
      id: "usp-2",
      title: "Fully-serviced concierge with private chef access",
      evidence: "Services page"
    },
    {
      id: "usp-3",
      title: "Architectural design by studio Spazio Milan",
      evidence: "About / story page"
    },
    {
      id: "usp-4",
      title: "Certified soil tests and verified property titles",
      evidence: "Legal / RERA page"
    }
  ],
  ctas: [
    "Schedule a private helicopter tour",
    "Request a physical provenance dossier"
  ],
  prohibitions: [
    {
      id: "pro-1",
      rule: 'Do not use generic buzzwords like "best deal" or "cheap EMI".'
    },
    {
      id: "pro-2",
      rule: "Avoid fast-cut drone footage without stabilizing margins."
    },
    {
      id: "pro-3",
      rule: "No unsupported rental ROAS or investment-yield claims."
    }
  ],
  complianceNotes: [
    {
      id: "com-1",
      label: "RERA registration retained",
      detail: "Registration number extracted and linked.",
      severity: "info"
    },
    {
      id: "com-2",
      label: "Image rights flagged",
      detail: "Hero imagery rights status is unknown; verify before publish.",
      severity: "warning"
    }
  ],
  missingAssets: [
    {
      id: "miss-1",
      name: "High-resolution facade twilight render",
      reason: "Only daytime hero image found."
    },
    {
      id: "miss-2",
      name: "Concierge service walkthrough video",
      reason: "No service motion assets discovered."
    }
  ],
  readinessScore: 78,
  reviewHash: "sha256:7b899a22cc3ffef0192bc9310"
};

export const PIPELINE_STAGES = [
  { id: "source", label: "Source", key: "idle" },
  { id: "scan", label: "Scan", key: "crawling" },
  { id: "evidence", label: "Evidence", key: "extracting" },
  { id: "approve", label: "Approve", key: "candidatesReady" }
] as const;

export const SCAN_LOGS: Record<Exclude<ScanState, "idle" | "approved">, string[]> = {
  sourceLocked: [
    "URL normalised: https://auraestates.in",
    "Allowed domain confirmed: auraestates.in",
    "Crawl scope preview accepted",
    "Source rights acknowledgement recorded"
  ],
  crawling: [
    "Homepage captured (screenshot + markdown)",
    "URL inventory mapped: 12 priority pages",
    "About, amenities, legal, gallery, contact queued",
    "Media harvest in progress..."
  ],
  extracting: [
    "Brand colors extracted from CSS and hero imagery",
    "Logos and crest variants classified",
    "USP candidates validated against page evidence",
    "Tone calibration and prohibitions applied",
    "Compliance warnings generated"
  ],
  candidatesReady: [
    "Evidence wrapper complete",
    "Candidate group prepared for human review",
    "Readiness score calculated: 78/100",
    "Missing asset request generated"
  ]
};
