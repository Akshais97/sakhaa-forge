import { BrandData, ProductionStage } from './types';

export const BRANDS: BrandData[] = [
  {
    id: 'aura',
    name: 'Aura Luxury Estates',
    niche: 'Ultra-Luxury Coastal Villas',
    url: 'auraestates.in',
    primaryColor: '#D4AF37', // Gold
    secondaryColor: '#1A1813', // Black sand
    guidelines: [
      'Focus heavily on privacy, private plunge pools, and private shore access.',
      'Always mention certified soil tests and verified property titles.',
      'Use sophisticated, slow-paced visual directions; no loud transition sounds.',
      'Required Phrase: \"An legacy of quiet luxury, certified for generations.\"'
    ],
    extractedCandidates: {
      logos: ['Aura Serif Mark v1.2', 'Aura Heritage Crest (Gold)'],
      colors: ['#D4AF37 (Metallic Gold)', '#F7F5F0 (Alabaster White)', '#1C1917 (Stone Dark)'],
      tone: 'Sophisticated, measured, highly aspirational, calming.',
      usps: [
        'Private infinity pool overlooking the Arabian Sea',
        'Fully-serviced concierge with private chef access',
        'Architectural design by studio Spazio Milan'
      ],
      ctas: [
        'Schedule a private helicopter tour',
        'Request a physical provenance dossier'
      ],
      prohibitions: [
        'Do not use generic buzzwords like \"best deal\" or \"cheap EMI\".',
        'Avoid showing fast-cut drone footage without stabilizing margins.'
      ]
    },
    sampleBlueprint: {
      sourceUrl: 'instagram.com/reel/C8xLw92pQ8',
      category: 'Cinematic Lifestyle Walkthrough',
      metrics: { views: '1.4M', engagement: '184K', ratio: '13.1%' },
      structure: {
        hook: '0-3s: Frame-in a stunning geometric silhouette of water, cutting sound abruptly to evoke silence.',
        setup: '3-7s: Fast structural sweep revealing material depth (marble vein, brushed brass, glass layers).',
        value: '7-14s: Contrast high-aerial sunset view with a human hand touching a high-end textured surface.',
        cta: '14-18s: Subtitle absolute entry requirement: \"Qualified requests only. Dossier link in bio.\"'
      }
    },
    scripts: [
      {
        id: 'script-aura-1',
        hookType: 'Quiet Contrast Hook',
        hookText: 'Most luxury villas are loud. This one begins with absolute silence.',
        setupText: 'Step into Aura Alibaug. Ten private estates carved from volcanic stone and seaside breeze.',
        valueText: 'Your private infinity pool blends directly into the Arabian Sea horizon. No tourist noise. No boundary lines.',
        ctaText: 'Aura is strictly non-public. Secure your private viewing. Request the printed provenance dossier via link.',
        score: 94,
        brandFit: '98% — Perfectly aligned with quiet luxury constraints',
        safety: 'Safe'
      },
      {
        id: 'script-aura-2',
        hookType: 'Scarcity Frame',
        hookText: 'Only four collectors will ever own a sunset in this private bay.',
        setupText: 'Welcome to Aura Estate Four. A legacy structure built to survive three generations.',
        valueText: 'Includes a private helicopter helipad, fully staffed concierge, and a private natural volcanic spa.',
        ctaText: 'Schedule a private flight. Serious enquiries only.',
        score: 89,
        brandFit: '92% — A bit aggressive on scarcity, but highly premium',
        safety: 'Safe'
      },
      {
        id: 'script-aura-3',
        hookType: 'Direct Pricing Claim',
        hookText: 'The cheapest way to buy an ultra-premium sea villa under 10 Crore.',
        setupText: 'Buy this property and get guaranteed rental ROAS of 18% right away.',
        valueText: 'Cheap EMIs and easy bank loans are available for booking today.',
        ctaText: 'Hurry up! Call now to buy.',
        score: 32,
        brandFit: '12% — VIOLATES BRAND GUIDELINES (Direct prohibited claims used)',
        safety: 'Blocked'
      }
    ],
    avatars: [
      {
        id: 'av-kabir',
        name: 'Kabir (Luxury Specialist)',
        type: 'Exclusive 3D Cast',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        consentState: 'Eligible',
        voice: 'India-English Professional Baritone (Model L-12)'
      },
      {
        id: 'av-ananya',
        name: 'Ananya (Aesthetic Anchor)',
        type: 'Exclusive 3D Cast',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        consentState: 'Eligible',
        voice: 'India-English Crisp Corporate Alt (Model L-15)'
      },
      {
        id: 'av-priya',
        name: 'Priya (Digital Host)',
        type: 'External Ambassador',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        consentState: 'Consent Expired',
        voice: 'India-English High Energy (Model H-01)'
      }
    ],
    costEstimate: {
      duration: '18.2 seconds',
      priceVersion: 'Rate Card v4.1 (Standard)',
      maxAuthorised: '12.50 Credits',
      walletBalance: '480.00 Credits',
      reservationId: 'RES-AURA-99211'
    },
    composition: {
      direction: 'Layer in the Gold Serif watermark at the top-right. Keep captions styled in elegant serif white, lower third. Ensure background music is a modern neo-classical ambient cello loop.',
      captions: 'Captions generated: [0.1s] Most luxury villas are loud... [4.2s] Welcome to Aura Alibaug...',
      assetsChecked: ['Crest_Watermark_Gold.svg', 'Concierge_Detail_Render.mp4', 'Cello_Ambient_BGM.wav'],
      validationWarnings: [],
      timeline: [
        { time: '0.0s - 3.0s', action: 'Hook scene: Silence loop + Seaside stone fade-in' },
        { time: '3.0s - 7.5s', action: 'Setup scene: Marble veining macro + Golden typography' },
        { time: '7.5s - 14.0s', action: 'Value scene: Infinity pool panorama + Concierge overlay' },
        { time: '14.0s - 18.2s', action: 'CTA scene: Custom dossier signature + Verified qr' }
      ]
    },
    reviewItem: {
      version: 'v1.4.1 (Production Ready)',
      thumbnailUrl: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400&auto=format&fit=crop&q=80',
      comments: [
        { user: 'Client Partner (Admin)', text: 'The marble details look exceptional in this render.', time: '12 min ago' },
        { user: 'Legal Council (Reviewer)', text: 'Soil test verification reference matches the ledger. Approved.', time: '2 min ago' }
      ],
      status: 'Approved',
      hash: 'sha256:7b899a22cc3ffef0192bc9310'
    },
    calendarPost: {
      platform: 'Instagram Reels',
      account: 'Aura Luxury Real Estate India (@aura.estates)',
      caption: 'Quiet luxury is not an advertising claim—it is a structure certified for generations. Aura Alibaug villas are now available for select provenance tours. Private helipad access included. Provenance ledger ID: #LE-992A.',
      time: 'July 1, 2026 — 18:30 IST',
      publishStatus: 'Published Verified',
      verificationChecklist: [
        { label: 'Verify live public-facing URL resolves', done: true },
        { label: 'Check media fingerprint matches rendering hash', done: true },
        { label: 'Verify @aura.estates ownership signature', done: true },
        { label: 'Confirm caption is exact approved v1.4.1 text', done: true }
      ],
      liveUrl: 'instagram.com/reel/C8xLw92_AuraLive'
    }
  },
  {
    id: 'soma',
    name: 'Soma Urban Living',
    niche: 'Co-Living High-Rises for Tech Leaders',
    url: 'somaliving.co',
    primaryColor: '#10B981', // Emerald Teal
    secondaryColor: '#090D16', // Cyber Space
    guidelines: [
      'Focus heavily on community workspaces, 1Gbps mesh networks, and community networking.',
      'Show physical evidence of smart home security and mobile-key access.',
      'Always include active tech hub proximity maps (e.g., ORR Bengaluru, Gurugram Cybercity).',
      'Required Phrase: \"Soma: Built for the code that runs your world.\"'
    ],
    extractedCandidates: {
      logos: ['Soma Kinetic Mono v2', 'Soma Dot Matrix Badge'],
      colors: ['#10B981 (Teal)', '#1E293B (Cyber Slate)', '#020617 (Deep Matrix)'],
      tone: 'Crisp, rapid-pacing, logical, bold, futuristic.',
      usps: [
        'Soundproof acoustic pods in the shared mesh workspace',
        'Fully-integrated gym, laundry, and daily community mixers',
        'Zero deposit, paperless smart app checkout in 4 minutes'
      ],
      ctas: [
        'Check real-time occupancy and book a guest pod',
        'Download the resident portal and secure your lease'
      ],
      prohibitions: [
        'Do not use dry corporate broker speech.',
        'Never state \"cheap rental option\"—use \"optimized micro-lease\".'
      ]
    },
    sampleBlueprint: {
      sourceUrl: 'youtube.com/shorts/Y78gDw2fQ9',
      category: 'Hyper-Paced Kinetic Solution Reel',
      metrics: { views: '2.8M', engagement: '412K', ratio: '14.7%' },
      structure: {
        hook: '0-2s: Screen flash with terminal keypress effect, popping the main question: \"Is your rent tax-deductible?\"',
        setup: '2-6s: Multi-camera rapid cut of high-tech workspaces, smart locks opening, community coffee bar.',
        value: '6-12s: Dynamic horizontal screen split showing bed space vs workspace with speed metrics floating.',
        cta: '12-15s: Scan-to-apply matrix animation with instant credit check link.'
      }
    },
    scripts: [
      {
        id: 'script-soma-1',
        hookType: 'Friction Callout Hook',
        hookText: 'Bengaluru traffic is high, but your commute can be zero.',
        setupText: 'This is Soma Outer Ring Road. A premium co-living hub with gigabit mesh and custom micro-studios.',
        valueText: 'Work in architectural acoustic pods, network with top founders, and skip deposit hassles entirely.',
        ctaText: 'Zero-deposit slots open for Q3. Scan the matrix link to verify your professional credit instantly.',
        score: 96,
        brandFit: '99% — Excellent tech focus, high pace compliance',
        safety: 'Safe'
      },
      {
        id: 'script-soma-2',
        hookType: 'Technical Contrast Hook',
        hookText: 'Most co-living spaces feel like dorms. Soma feels like a tech incubator.',
        setupText: 'Every studio features dual-monitor mounts, smart temperature nodes, and sound isolation.',
        valueText: 'Includes daily breakfast, weekly curated mixers, and a 24/7 recovery ice-bath chamber.',
        ctaText: 'Book a 2-day work trial today.',
        score: 91,
        brandFit: '95% — Highly relevant to target cohort',
        safety: 'Safe'
      },
      {
        id: 'script-soma-3',
        hookType: 'Hype Broker Style',
        hookText: 'Amazing fully furnished cheap room, broker-free, best price in town!',
        setupText: 'Super luxury bedroom with a bed and bathroom for very cheap rates.',
        valueText: 'Move in quickly, no checks, all friends allowed, unlimited parties.',
        ctaText: 'Hurry up only 2 rooms left!',
        score: 28,
        brandFit: '9% — VIOLATES BRAND STYLE (Prohibited broker terms, off-brand tone)',
        safety: 'Blocked'
      }
    ],
    avatars: [
      {
        id: 'av-ananya',
        name: 'Ananya (Aesthetic Anchor)',
        type: 'Exclusive 3D Cast',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        consentState: 'Eligible',
        voice: 'India-English Crisp Corporate Alt (Model L-15)'
      },
      {
        id: 'av-rohit',
        name: 'Rohit (Tech Evangelist)',
        type: 'Premium Generative Synth',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        consentState: 'Eligible',
        voice: 'India-English Fast Informative (Model S-04)'
      },
      {
        id: 'av-priya',
        name: 'Priya (Digital Host)',
        type: 'External Ambassador',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        consentState: 'Consent Expired',
        voice: 'India-English High Energy (Model H-01)'
      }
    ],
    costEstimate: {
      duration: '15.0 seconds',
      priceVersion: 'Rate Card v4.1 (Standard)',
      maxAuthorised: '10.00 Credits',
      walletBalance: '1,245.50 Credits',
      reservationId: 'RES-SOMA-88390'
    },
    composition: {
      direction: 'Apply neon emerald scanline overlays on hook. Captions must be styled in high-visibility monospaced font with glowing background bar. Background music: high-tempo lo-fi coding tracks.',
      captions: 'Captions generated: [0.1s] Bengaluru traffic is high... [3.0s] This is Soma Outer Ring Road...',
      assetsChecked: ['Soma_Matrix_Overlay.mp4', 'Acoustic_Pod_Detail.mp4', 'Lofi_Coding_Beats.wav'],
      validationWarnings: [],
      timeline: [
        { time: '0.0s - 2.0s', action: 'Hook scene: Gigabit speed terminal flicker + hook text' },
        { time: '2.0s - 6.0s', action: 'Setup scene: Rapid cut of smart security and keyless entrance' },
        { time: '6.0s - 12.0s', action: 'Value scene: Split-screen acoustic workspace vs co-living studio' },
        { time: '12.0s - 15.0s', action: 'CTA scene: QR overlay with instant professional score scan' }
      ]
    },
    reviewItem: {
      version: 'v2.1.0 (Production Ready)',
      thumbnailUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=400&auto=format&fit=crop&q=80',
      comments: [
        { user: 'Soma PM (Client Manager)', text: 'Mesh network latency metrics must be super imposed in frame 3.', time: '1 hr ago' },
        { user: 'Soma PM (Client Manager)', text: 'Updated mesh overlay added. Looks crisp now.', time: '10 min ago' }
      ],
      status: 'Approved',
      hash: 'sha256:4a02c981ccffef8912bc0091d'
    },
    calendarPost: {
      platform: 'YouTube Shorts',
      account: 'Soma Tech-Living (@soma.living)',
      caption: 'Is your rent working as hard as your code? Skip archaic housing security deposits and 10-month advances. Soma Outer Ring Road co-living studios are fully optimized for tech professionals. Gigabit mesh, premium workstations, and active community. Verified ID: #SOMA-88A.',
      time: 'July 1, 2026 — 12:00 IST',
      publishStatus: 'Published Verified',
      verificationChecklist: [
        { label: 'Verify live public-facing URL resolves', done: true },
        { label: 'Check media fingerprint matches rendering hash', done: true },
        { label: 'Verify @soma.living ownership signature', done: true },
        { label: 'Confirm caption is exact approved v2.1.0 text', done: true }
      ],
      liveUrl: 'youtube.com/shorts/SomaOuterRingRoadLive'
    }
  },
  {
    id: 'vedic',
    name: 'Vedic Heritage Mansions',
    niche: 'Restored Palatial Architectural Estates',
    url: 'vedichereitage.co.in',
    primaryColor: '#F97316', // Terracotta Orange
    secondaryColor: '#1E120A', // Sandalwood Dark
    guidelines: [
      'Focus heavily on dynastic history, 500-year-old structures, and manual restoration.',
      'Highlight authentic local craftsmanship (Channapatna wood, lime mortar, heritage tile).',
      'The narrator must have an elegant, deep classical Indian voice.',
      'Required Phrase: \"Where centuries of architecture become your private sanctuary.\"'
    ],
    extractedCandidates: {
      logos: ['Vedic Copper Monolith v1', 'Vedic Royal Seal (Intaglio)'],
      colors: ['#F97316 (Terracotta)', '#854D0E (Sandstone)', '#291305 (Sandalwood Dark)'],
      tone: 'Poetic, narrative, slow, epic, deeply historical.',
      usps: [
        '500-year-old arches meticulously restored with lime plastering',
        'Private courtyards with century-old banyan trees and lotus ponds',
        'Authentic copper-fitted rain-harvesting architectural system'
      ],
      ctas: [
        'Request the physical parchment history booklet',
        'Schedule a private audience with the chief conservator'
      ],
      prohibitions: [
        'Never use modern slang or flashy neon transitions.',
        'Do not describe the structures as \"renovated duplexes\"—they are preserved palaces.'
      ]
    },
    sampleBlueprint: {
      sourceUrl: 'vimeo.com/992110293',
      category: 'Historical Documentary Walkthrough',
      metrics: { views: '980K', engagement: '110K', ratio: '11.2%' },
      structure: {
        hook: '0-4s: A single drop of water hits a copper plate in slow motion, letting the reverberation resonate.',
        setup: '4-8s: Hand tracing the texture of ancient lime-mortar columns and copper door rings.',
        value: '8-15s: Slow panoramic drift through three concentric courtyards during dusk rain.',
        cta: '15-20s: Faded bronze crest fades in slowly over sandalwood paper background.'
      }
    },
    scripts: [
      {
        id: 'script-vedic-1',
        hookType: 'Poetic Legacy Hook',
        hookText: 'Most homes are built in months. This sanctuary took four hundred years.',
        setupText: 'This is the Vedic Haveli of Shekhawati. Over four concentric courtyards preserved by hand with ancient lime-mortar.',
        valueText: 'Walk beneath hand-painted frescoes, feel original copper-fit arches, and sit beneath a centennial lotus pond.',
        ctaText: 'Own a genuine piece of Indian architectural heritage. Schedule a private audience with our chief conservator.',
        score: 95,
        brandFit: '99% — Highly poetic, matches manual restoration ethos',
        safety: 'Safe'
      },
      {
        id: 'script-vedic-2',
        hookType: 'Craftsman Detail Hook',
        hookText: 'No bricks. No synthetic paints. Just stone, teak, and classical craftsmanship.',
        setupText: 'Each column was hand-carved by seventh-generation artisans from Rajasthan sandstone.',
        valueText: 'Features a natural climate ventilation chamber and historical collection vaults.',
        ctaText: 'Acquire a heritage title. Request parchment documentation via bio.',
        score: 92,
        brandFit: '97% — Beautiful focus on material origin',
        safety: 'Safe'
      },
      {
        id: 'script-vedic-3',
        hookType: 'Slick Broker Style',
        hookText: 'Wow check out this super cool old duplex with modern design!',
        setupText: 'Great heritage vibe with fast wifi and close to the subway system.',
        valueText: 'Newly painted with shiny synthetic paints, very cheap property prices.',
        ctaText: 'Hurry up buy this amazing villa today!',
        score: 25,
        brandFit: '7% — VIOLATES CORE HERITAGE POLICY (prohibited modern terminology, synthetic paints)',
        safety: 'Blocked'
      }
    ],
    avatars: [
      {
        id: 'av-devendra',
        name: 'Devendra (Classical Historian)',
        type: 'Exclusive 3D Cast',
        avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
        consentState: 'Eligible',
        voice: 'Indian Classical Deep Bass (Model H-72)'
      },
      {
        id: 'av-ananya',
        name: 'Ananya (Aesthetic Anchor)',
        type: 'Exclusive 3D Cast',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        consentState: 'Eligible',
        voice: 'India-English Crisp Corporate Alt (Model L-15)'
      },
      {
        id: 'av-karan',
        name: 'Karan (Royal Concierge)',
        type: 'Generative Ambassador',
        avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
        consentState: 'Consent Revoked',
        voice: 'India-English Polished Diplomatic (Model R-09)'
      }
    ],
    costEstimate: {
      duration: '20.0 seconds',
      priceVersion: 'Rate Card v4.1 (Standard)',
      maxAuthorised: '15.00 Credits',
      walletBalance: '150.00 Credits',
      reservationId: 'RES-VEDIC-77210'
    },
    composition: {
      direction: 'Apply slow sand-dusted vignette frames. Captions must be in classical serif sandstone italic. Ensure background music is a deep traditional sitar and ancient copper bell chime.',
      captions: 'Captions generated: [0.1s] Most homes are built in months... [4.5s] This is the Vedic Haveli...',
      assetsChecked: ['Haveli_Crest_Watermark.svg', 'Lotus_Pond_Preserved.mp4', 'Classical_Sitar_Dusk.wav'],
      validationWarnings: [],
      timeline: [
        { time: '0.0s - 4.0s', action: 'Hook scene: Copper chime slow-motion reverberation + text overlay' },
        { time: '4.0s - 8.0s', action: 'Setup scene: Sandstone pillars hand trace + sandalwood text fade' },
        { time: '8.0s - 15.0s', action: 'Value scene: Courtyard rain drift + lotus pond macro detail' },
        { time: '15.0s - 20.0s', action: 'CTA scene: Chief Conservator seal + parchment QR card' }
      ]
    },
    reviewItem: {
      version: 'v1.0.0 (Production Ready)',
      thumbnailUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&auto=format&fit=crop&q=80',
      comments: [
        { user: 'Chief Conservator', text: 'Channapatna wood details must align with the watermark timing.', time: '2 hrs ago' },
        { user: 'Archivist', text: 'Lineage trace matches original 1740 copper deed reference. Excellent.', time: '1 hr ago' }
      ],
      status: 'Approved',
      hash: 'sha256:8b091f0932bcdef00912bc88d'
    },
    calendarPost: {
      platform: 'Facebook Video',
      account: 'Vedic Conservator Trust (@vedic.heritage)',
      caption: 'Centuries of dynastic architecture, preserved manually for your modern lifestyle. The Vedic Haveli of Shekhawati features historic sandstone courtyards, rain-fed lotus ponds, and active air cooling systems from 1740. Provenance archive ledger: #HA-1740V.',
      time: 'July 1, 2026 — 09:00 IST',
      publishStatus: 'Published Verified',
      verificationChecklist: [
        { label: 'Verify live public-facing URL resolves', done: true },
        { label: 'Check media fingerprint matches rendering hash', done: true },
        { label: 'Verify @vedic.heritage ownership signature', done: true },
        { label: 'Confirm caption is exact approved v1.0.0 text', done: true }
      ],
      liveUrl: 'facebook.com/watch/VedicHaveliShekhawatiLive'
    }
  }
];

export const PRODUCTION_STAGES: ProductionStage[] = [
  {
    id: 0,
    key: 'hero',
    label: 'Hero',
    tagline: 'Trend-to-calendar engine',
    title: 'Turn discovered trends into campaign calendars.',
    description: 'Sakhaa Forge finds high-performing videos and market signals, learns your brand from its URL, creates avatar-led UGC, and turns it into a review-ready publishing calendar.'
  },
  {
    id: 1,
    key: 'extraction',
    label: 'Extraction',
    tagline: 'Blueprint + brand fit',
    title: 'Sakhaa finds what is moving. Then fits it to your brand.',
    description: 'Sakhaa Forge scans high-performing videos, trend signals, and your brand URL, then maps the hook, pacing, CTA, offer language, audience, USPs, and visual rules.',
    body: 'The market gives the signal. Your brand gives the reason to buy. The output is a campaign angle that feels native, not copied.',
    uiLabels: [
      'Trend video found',
      'Hook mapped',
      'Pattern interrupts found',
      'Brand URL scanned',
      'USPs extracted',
      'Audience matched',
      'Angle ready'
    ],
    nextSafeAction: 'Proceed to avatar selector'
  },
  {
    id: 2,
    key: 'avatars',
    label: 'UGC Avatars',
    tagline: 'Avatar-led UGC',
    title: 'Generate UGC without casting delays.',
    description: 'Choose a Sakhaa-owned avatar for explainers, walkthroughs, testimonials, product guides, and offer-led videos.',
    body: 'Pick the role, tone, language, voice, and campaign style. The approved blueprint becomes campaign-ready UGC.',
    uiLabels: [
      'Avatar selected',
      'Voice chosen',
      'UGC style applied',
      'Provider route selected',
      'Video generating',
      'Creative ready'
    ],
    nextSafeAction: 'Generate calendar sequence'
  },
  {
    id: 3,
    key: 'calendar',
    label: 'Calendar Builder',
    tagline: 'Campaign calendar',
    title: 'Build campaigns, not random posts.',
    description: 'Turn discovered trends, brand intelligence, avatars, and goals into a calendar with videos, hooks, captions, CTAs, and posting slots.',
    body: 'Plan launches, awareness pushes, retargeting, or monthly content. Every post stays tied to a goal, audience stage, angle, and asset.',
    uiLabels: [
      'Objective selected',
      'Content pillars created',
      'Videos assigned',
      'Captions prepared',
      'Slots created',
      'Calendar ready'
    ],
    nextSafeAction: 'Verify social connections'
  },
  {
    id: 4,
    key: 'publishing',
    label: 'Publishing',
    tagline: 'Approve, schedule, publish',
    title: 'Ship only what your team approves.',
    description: 'Review videos, approve captions, choose platforms, confirm slots, and move the campaign into publishing.',
    body: 'Each asset gets a final human check. Use official platform APIs where available, with manual export when a platform requires it.',
    uiLabels: [
      'Video approved',
      'Caption approved',
      'Platform selected',
      'Time confirmed',
      'Synced',
      'Ready'
    ],
    nextSafeAction: 'Access V2 simulation arena'
  },
  {
    id: 5,
    key: 'v2-simulation',
    label: 'V2 Simulation',
    tagline: 'V2 creative learning',
    title: 'Improve creatives before you scale spend.',
    description: 'V2 combines neuroscience tests, campaign memory, PPC learning, social data, recommendations, and plain-text video edits.',
    body: 'Tell the editor what to change. Sakhaa converts it into an After Effects script, updates the variant, and compares marketing plus attention signals. Campaign memory starts on Day 1; paid signals sharpen the next hooks, offers, audiences, CTAs, and formats.',
    examplePrompts: [
      'Make the hook faster in the first 3 seconds.',
      'Move the CTA earlier.',
      'Make the captions bolder.',
      'Replace the second clip with a more premium visual.',
      'Make this version feel more urgent.'
    ],
    uiLabels: [
      'Plain-text edit received',
      'After Effects script prepared',
      'Variant updated',
      'Neuroscience test running',
      'Marketing model synced',
      'Winning patterns detected',
      'Next recommendations ready'
    ],
    nextSafeAction: 'Restart the tour to explore again'
  }
];
