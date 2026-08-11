"use client";

import { useState, useEffect, useMemo, useReducer, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Globe, Shield, CheckCircle2, AlertTriangle, Play, HelpCircle,
  FileText, UploadCloud, ChevronRight, Check, X, RefreshCw,
  Search, AlertCircle, Trash2, Edit3, Plus, ArrowRight, ArrowLeft, Info,
  ExternalLink, Layers, CheckCircle, Database, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { BrandData } from '../types';
import {
  adaptBrandCrawlRunResponse,
  buildCanonicalApprovalInput,
  buildApprovalDraftFromCandidates,
  shouldCompleteCrawlWithLocalDemo,
  type UiCandidate
} from '../candidate-adapter';
import { createGeneratedWorkflowClient, makeIdempotencyKey } from '../../../../src/workflow/v0-actions';
import { AcquiredBrandAssetsCupboard } from '../brand-assets/AcquiredBrandAssetsCupboard';
import { LiquidEtherBackground } from '../brand-assets/LiquidEtherBackground';
import { MagneticNextCue } from '../brand-assets/MagneticNextCue';
import { SecureArtifactThumbnail } from '../brand-assets/SecureArtifactThumbnail';
import type { ArtifactDownloadClient } from '../brand-assets/secure-artifact-media';

interface BrandExtractionStudioProps {
  activeBrand: BrandData;
  onUpdateBrandData: (updated: BrandData) => void;
  onPersistedBrands: (brands: Array<{ id: string; name: string; websiteUrl: string }>) => void;
  onProceedWorkflow: () => void;
}

type ApprovalDraft = {
  name: { public: string; legal: string };
  industry: string;
  markets: string[];
  positioning: {
    statement: string;
    differentiators: string[];
    proof_points: string[];
  };
  competitors: string[];
  visual_identity: {
    logos: string[];
    colors: Array<{ role: string; value: string; usage: string; prohibited: string }>;
    fonts: { primary: string; heading: string; code: string };
    imagery_rules: string;
    layout_rules: string;
    media_assets?: Array<{ locator: string; category: string }>;
  };
  voice: {
    attributes: string[];
    avoid_list: string[];
    formality: 'formal' | 'balanced' | 'conversational';
    languages: string[];
    approved_examples: string[];
    pronunciations: string;
  };
  products: Array<{ title: string; description: string; pricing: string }>;
  audiences: Array<{ name: string; needs: string; objections: string }>;
  offers: string[];
  calls_to_action: string[];
  claims: Array<{
    statement: string;
    status: 'approved' | 'approved_with_disclaimer' | 'pending_evidence' | 'prohibited' | 'expired';
    evidence_artifact: string;
    required_disclaimer: string;
    allowed_channels: string[];
  }>;
  rules: {
    required_phrases: string[];
    prohibited_phrases: string[];
    required_disclosures: string[];
  };
  source_summary: {
    selected_brand_type: string;
    detected_brand_type: string;
    conflict_flag: boolean;
    extraction_schema_version: string;
    crawl_run_ref: string;
  };
  rightsAttestationChecked: boolean;
  reviewerSignature: string;
  version: string;
};

// 12 verticals from the Firecrawl vertical spec
const CRAWL_VERTICALS = [
  'D2C / Ecommerce',
  'B2B SaaS',
  'Real Estate',
  'Healthcare',
  'Education',
  'Fintech / Financial Services',
  'Restaurant / F&B',
  'Fitness / Wellness',
  'Automotive',
  'Legal',
  'Hospitality',
  'Home Services'
];

const INDUSTRY_OPTIONS = CRAWL_VERTICALS;

const BACKEND_BRAND_TYPE_BY_LABEL: Record<string, string> = {
  'D2C / Ecommerce': 'd2c_ecommerce',
  'B2B SaaS': 'b2b_saas',
  'Real Estate': 'real_estate',
  'Healthcare': 'healthcare',
  'Education': 'education',
  'Fintech / Financial Services': 'financial_services',
  'Restaurant / F&B': 'restaurant_fb',
  'Fitness / Wellness': 'fitness_wellness',
  'Automotive': 'automotive',
  'Legal': 'legal_professional',
  'Hospitality': 'travel_hospitality',
  'Home Services': 'home_services'
};

type UploadedBrandAsset = {
  id: string;
  artifactId: string;
  name: string;
  category: string;
  rightsBasis: string;
  permittedUse: string;
  status: 'uploading' | 'clean' | 'failed';
  error?: string;
};

type CandidateMutation = {
  candidateId: string;
  state: 'saving' | 'saved' | 'failed' | 'stale-session';
};

function normalizeUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function validatePublicUrl(value: string): string | null {
  try {
    const parsed = new URL(normalizeUrlInput(value));
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
      return 'Enter a valid public website URL.';
    }
    return null;
  } catch {
    return 'Enter a valid public website URL.';
  }
}

function normalizePathPrefix(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === '/all') return '/';
  if (!trimmed.startsWith('/')) return null;
  return trimmed.replace(/\/{2,}/g, '/');
}

function toBackendBrandType(label: string): string | null {
  return BACKEND_BRAND_TYPE_BY_LABEL[label] ?? null;
}

async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export default function BrandExtractionStudio({ activeBrand, onUpdateBrandData, onPersistedBrands, onProceedWorkflow }: BrandExtractionStudioProps) {
  // Navigation Steps
  const steps = [
    { id: 1, name: 'Brand Context' },
    { id: 2, name: 'Crawl Setup' },
    { id: 3, name: 'Live Scan Console' },
    { id: 4, name: 'Candidate Dossier' },
    { id: 5, name: 'Asset Pack Viewer' },
    { id: 6, name: 'Brand Approval' }
  ];

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiContext, setApiContext] = useState({
    workspaceId: '',
    authToken: '',
    source: 'pending'
  });
  const continuingBrandIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!apiContext.workspaceId.trim() || !apiContext.authToken.trim()) return;
    let cancelled = false;
    void createGeneratedWorkflowClient({ baseUrl: '/api/v0', authToken: apiContext.authToken.trim() })
      .then(client => client.listBrands(apiContext.workspaceId.trim()))
      .then(response => {
        if (!cancelled && response.status < 400 && Array.isArray((response.body as any)?.brands)) {
          onPersistedBrands((response.body as any).brands);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [apiContext.workspaceId, apiContext.authToken, onPersistedBrands]);

  // STEP 1 State: Brand Context Onboarding Form
  const [onboardingForm, setOnboardingForm] = useState({
    brandName: '',
    websiteUrl: '',
    industry: 'Real Estate',
    videoGoal: 'Drive high-conversion visual leads through kinetic social video storytelling.',
    primaryMarket: 'India',
    language: 'en-IN',
    targetPlatforms: ['Instagram Reels', 'YouTube Shorts']
  });
  const [onboardingSaved, setOnboardingSaved] = useState(false);

  // STEP 2 State: Crawl Setup
  const [setupForm, setSetupForm] = useState({
    websiteUrl: '',
    rightsAcknowledged: false,
    brandType: 'Real Estate',
    maxPages: 5,
    pathPrefixes: ['/'],
    assets: [] as UploadedBrandAsset[]
  });

  useEffect(() => {
    if (!apiContext.workspaceId.trim() || !apiContext.authToken.trim() || activeBrand.id === 'brand-extract-draft') return;
    let cancelled = false;
    void createGeneratedWorkflowClient({ baseUrl: '/api/v0', authToken: apiContext.authToken.trim() })
      .then(client => client.listBrandAssets(activeBrand.id))
      .then(response => {
        const retained = (response.body as any)?.assets;
        if (cancelled || response.status >= 400 || !Array.isArray(retained)) return;
        setSelectedAssetIds(new Set(retained.map((asset: any) => asset.id)));
        setSetupForm(current => ({
          ...current,
          assets: retained.map((asset: any) => ({
            id: asset.id,
            artifactId: asset.artifactId,
            name: asset.name,
            category: asset.category,
            rightsBasis: asset.rightsBasis,
            permittedUse: asset.permittedUse,
            status: 'clean' as const
          }))
        }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeBrand.id, apiContext.workspaceId, apiContext.authToken]);
  // Local states for adding a path prefix and real asset uploads
  const [newPrefix, setNewPrefix] = useState('');
  const [selectedAssetFile, setSelectedAssetFile] = useState<File | null>(null);
  const [assetUploadInput, setAssetUploadInput] = useState({
    category: 'Logo',
    rightsBasis: 'Owner Upload',
    permittedUse: 'All Media'
  });

  // STEP 3 State: Live Scan Console Polling
  const [crawlRunId, setCrawlRunId] = useState<string | null>(null);
  const [crawlRun, setCrawlRun] = useState<any>(null);
  const [selectedVertical, setSelectedVertical] = useState('Real Estate');
  const [detectedVertical, setDetectedVertical] = useState<string | null>(null);
  const [verticalConflictResolved, setVerticalConflictResolved] = useState(false);
  const [conflictResolvedSelection, setConflictResolvedSelection] = useState<string>('Real Estate');

  // STEP 4 State: Candidate Dossier
  const [candidates, setCandidates] = useState<UiCandidate[]>([]);
  const [readinessScore, setReadinessScore] = useState<number>(0);
  const [basisBreakdown, setBasisBreakdown] = useState<any>({ identity: 0, visual: 0, copy: 0, proof: 0 });
  const [dossierFilter, setDossierFilter] = useState<'all' | 'approved' | 'rejected' | 'conflict' | 'low-confidence'>('all');
  const [activeCandidateSection, setActiveCandidateSection] = useState<string>('identity');
  const [selectedCandidateForEvidence, setSelectedCandidateForEvidence] = useState<any | null>(null);
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Record<string, boolean>>({});
  const [candidateMutations, setCandidateMutation] = useReducer(
    (current: Record<string, CandidateMutation>, mutation: CandidateMutation) => ({
      ...current,
      [mutation.candidateId]: mutation
    }),
    {}
  );

  // STEP 5 State: Asset Pack
  const [assetPack, setAssetPack] = useState<any[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const artifactDownloadClient = useMemo<ArtifactDownloadClient>(() => ({
    async createArtifactDownload(artifactId, input) {
      const client = await createGeneratedWorkflowClient({
        baseUrl: '/api/v0',
        authToken: apiContext.authToken.trim()
      });
      return client.createArtifactDownload(artifactId, input);
    }
  }), [apiContext.authToken]);

  // STEP 6 State: Brand Profile Approval Form (fully pre-populated from approved candidates)
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft>({
    name: { public: '', legal: '' },
    industry: '',
    markets: [] as string[],
    positioning: {
      statement: '',
      differentiators: [] as string[],
      proof_points: [] as string[]
    },
    competitors: [] as string[],
    visual_identity: {
      logos: [] as string[],
      colors: [] as Array<{ role: string; value: string; usage: string; prohibited: string }>,
      fonts: { primary: 'Inter', heading: 'Space Grotesk', code: 'JetBrains Mono' },
      imagery_rules: '',
      layout_rules: '',
      media_assets: [] as Array<{ locator: string; category: string }>
    },
    voice: {
      attributes: [] as string[],
      avoid_list: [] as string[],
      formality: 'balanced' as 'formal' | 'balanced' | 'conversational',
      languages: [] as string[],
      approved_examples: [] as string[],
      pronunciations: ''
    },
    products: [] as Array<{ title: string; description: string; pricing: string }>,
    audiences: [] as Array<{ name: string; needs: string; objections: string }>,
    offers: [] as string[],
    calls_to_action: [] as string[],
    claims: [] as Array<{
      statement: string;
      status: 'approved' | 'approved_with_disclaimer' | 'pending_evidence' | 'prohibited' | 'expired';
      evidence_artifact: string;
      required_disclaimer: string;
      allowed_channels: string[];
    }>,
    rules: {
      required_phrases: [] as string[],
      prohibited_phrases: [] as string[],
      required_disclosures: [] as string[]
    },
    source_summary: {
      selected_brand_type: '',
      detected_brand_type: '',
      conflict_flag: false,
      extraction_schema_version: 'v3.0.4',
      crawl_run_ref: ''
    },
    rightsAttestationChecked: false,
    reviewerSignature: '',
    version: '1.0.0'
  });
  const [approvalStatus, setApprovalStatus] = useState<{
    submitted: boolean;
    timestamp: string | null;
    approvalId: string | null;
    version: number | null;
  }>({ submitted: false, timestamp: null, approvalId: null, version: null });
  const [approvalMutation, setApprovalMutation] = useState<'idle' | 'saving' | 'sign-in' | 'stale-session' | 'stale-version' | 'invalid' | 'failed'>('idle');

  const ensureDemoSession = async () => {
    if (apiContext.workspaceId.trim() && apiContext.authToken.trim()) {
      return apiContext;
    }
    const response = await fetch('/api/brand-extract/demo-session', { method: 'POST' });
    const body = await response.json();
    if (!response.ok || !body?.workspaceId || !body?.authToken) {
      setApiContext(prev => ({ ...prev, source: 'manual' }));
      throw new Error(body?.detail || 'Could not create a local demo API session.');
    }
    const nextContext = {
      workspaceId: body.workspaceId,
      authToken: body.authToken,
      source: 'local-demo'
    };
    setApiContext(nextContext);
    return nextContext;
  };

  // Load Brand Onboarding Context on start / change
  useEffect(() => {
    if (continuingBrandIdRef.current === activeBrand.id) {
      continuingBrandIdRef.current = null;
      return;
    }
    setOnboardingForm({
      brandName: activeBrand.name || '',
      websiteUrl: activeBrand.url || '',
      industry: activeBrand.niche || 'Real Estate',
      videoGoal: 'Drive high-conversion visual leads through kinetic social video storytelling.',
      primaryMarket: 'India',
      language: 'en-IN',
      targetPlatforms: ['Instagram Reels', 'YouTube Shorts']
    });
    setSetupForm(prev => ({
      ...prev,
      websiteUrl: activeBrand.url ? normalizeUrlInput(activeBrand.url) : '',
      brandType: activeBrand.niche || 'Real Estate'
    }));
    setOnboardingSaved(false);
    setCurrentStep(1);
    setCrawlRunId(null);
    setCrawlRun(null);
    setCandidates([]);
    setAssetPack([]);
    setApprovalStatus({ submitted: false, timestamp: null, approvalId: null, version: null });
    setApprovalMutation('idle');
  }, [activeBrand]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrapDemoSession() {
      try {
        const nextContext = await ensureDemoSession();
        if (cancelled) return;
        setApiContext(nextContext);
      } catch {
        if (!cancelled) {
          setApiContext(prev => ({ ...prev, source: 'manual' }));
        }
      }
    }
    if (!apiContext.workspaceId && !apiContext.authToken && apiContext.source === 'pending') {
      bootstrapDemoSession();
    }
    return () => {
      cancelled = true;
    };
  }, [apiContext.authToken, apiContext.source, apiContext.workspaceId]);

  // Handle Save Onboarding Brand Context
  const handleSaveOnboarding = async () => {
    setApiError(null);
    const brandName = onboardingForm.brandName.trim();
    const urlError = validatePublicUrl(onboardingForm.websiteUrl);
    if (!brandName) {
      setApiError('Brand name is required.');
      return;
    }
    if (!INDUSTRY_OPTIONS.includes(onboardingForm.industry)) {
      setApiError('Select a supported industry or niche.');
      return;
    }
    if (urlError) {
      setApiError(urlError);
      return;
    }
    setLoading(true);
    try {
      await ensureDemoSession();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Could not create a local demo API session.');
      setLoading(false);
      return;
    }
    setOnboardingSaved(true);
    setSetupForm(prev => ({
      ...prev,
      websiteUrl: normalizeUrlInput(onboardingForm.websiteUrl),
      brandType: onboardingForm.industry
    }));
    setSelectedVertical(onboardingForm.industry);
    setCurrentStep(2);
    setLoading(false);
  };

  // Crawl Setup path list controls
  const handleAddPrefix = () => {
    setApiError(null);
    const normalized = normalizePathPrefix(newPrefix);
    if (!normalized) {
      setApiError('Path prefixes must start with /. Enter /all to allow all pages.');
      return;
    }
    setSetupForm(prev => ({
      ...prev,
      pathPrefixes: normalized === '/' ? ['/'] : [...prev.pathPrefixes.filter(p => p !== '/'), normalized]
    }));
    setNewPrefix('');
  };

  const handleRemovePrefix = (prefix: string) => {
    setSetupForm(prev => ({
      ...prev,
      pathPrefixes: prev.pathPrefixes.filter(p => p !== prefix)
    }));
  };

  // Upload asset with rights metadata through the backend artifact contract.
  const handleAddAsset = async () => {
    setApiError(null);
    if (!selectedAssetFile) {
      setApiError('Choose an asset file to upload.');
      return;
    }
    const file = selectedAssetFile;
    if (!apiContext.workspaceId.trim() || !apiContext.authToken.trim()) {
      setApiError('Workspace ID and API bearer token are required before uploading assets.');
      return;
    }
    if (!assetUploadInput.rightsBasis.trim() || !assetUploadInput.permittedUse.trim()) {
      setApiError('Each asset needs a rights basis and permitted use.');
      return;
    }

    const client = await createGeneratedWorkflowClient({
      baseUrl: '/api/v0',
      authToken: apiContext.authToken.trim()
    });
    const sha256 = await sha256File(file);
    const localId = `upload-${file.name}-${file.size}`;

    setSetupForm(prev => ({
      ...prev,
      assets: [
        ...prev.assets,
        {
          id: localId,
          artifactId: '',
          name: file.name,
          category: assetUploadInput.category,
          rightsBasis: assetUploadInput.rightsBasis.trim(),
          permittedUse: assetUploadInput.permittedUse.trim(),
          status: 'uploading'
        }
      ]
    }));

    try {
      const initiated = await client.initiateBrandAssetUpload(
        {
          workspaceId: apiContext.workspaceId.trim(),
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          byteSize: file.size,
          sha256,
          ...(activeBrand.id !== 'brand-extract-draft' ? {
            brandId: activeBrand.id,
            rightsBasis: assetUploadInput.rightsBasis.trim(),
            permittedUse: assetUploadInput.permittedUse.trim()
          } : {})
        },
        { idempotencyKey: makeIdempotencyKey('brand-asset-upload') }
      );
      const initiatedBody = initiated.body as any;
      if (initiated.status >= 400 || !initiatedBody?.artifact?.id) {
        throw new Error(initiatedBody?.detail || initiatedBody?.title || 'Asset upload initiation failed.');
      }
      const artifactId = initiatedBody.artifact.id;
      if (!initiatedBody?.upload?.url) {
        throw new Error('The storage service did not return an upload destination.');
      }
      const uploadResponse = await fetch(initiatedBody.upload.url, {
        method: initiatedBody.upload.method || 'PUT',
        headers: initiatedBody.upload.headers || { 'content-type': file.type || 'application/octet-stream' },
        body: file
      });
      if (!uploadResponse.ok) {
        throw new Error('The asset could not be retained in private storage.');
      }
      const completed = await client.completeBrandAssetUpload(artifactId, {
        workspaceId: apiContext.workspaceId.trim(),
        byteSize: file.size,
        sha256
      });
      const completedBody = completed.body as any;
      if (completed.status >= 400 || completedBody?.artifact?.status !== 'CLEAN') {
        throw new Error(completedBody?.detail || completedBody?.title || 'Asset upload completion failed.');
      }
      setSetupForm(prev => ({
        ...prev,
        assets: prev.assets.map(asset =>
          asset.id === localId ? { ...asset, artifactId, status: 'clean' } : asset
        )
      }));
      setSelectedAssetIds(current => new Set(current).add(localId));
      setSelectedAssetFile(null);
      setAssetUploadInput({
        category: 'Logo',
        rightsBasis: 'Owner Upload',
        permittedUse: 'All Media'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Asset upload failed.';
      setSetupForm(prev => ({
        ...prev,
        assets: prev.assets.map(asset =>
          asset.id === localId ? { ...asset, status: 'failed', error: message } : asset
        )
      }));
      setApiError(message);
    }
  };

  const handleRemoveAsset = (id: string) => {
    setSetupForm(prev => ({
      ...prev,
      assets: prev.assets.filter(a => a.id !== id)
    }));
  };

  // Submit brand crawl run
  const handleStartCrawl = async () => {
    setApiError(null);
    const urlError = validatePublicUrl(setupForm.websiteUrl);
    if (!apiContext.workspaceId.trim() || !apiContext.authToken.trim()) {
      setApiError('Workspace ID and API bearer token are required to start a backend crawl.');
      return;
    }
    if (urlError) {
      setApiError(urlError);
      return;
    }
    if (!setupForm.rightsAcknowledged) {
      setApiError('Acknowledge crawl and lineage rights before starting.');
      return;
    }
    if (setupForm.pathPrefixes.length === 0) {
      setApiError('At least one path prefix is required. Enter /all to allow all pages.');
      return;
    }
    const failedAsset = setupForm.assets.find(asset => asset.status !== 'clean');
    if (failedAsset) {
      setApiError('Only clean uploaded assets can be attached to a crawl run.');
      return;
    }
    setLoading(true);
    setSelectedVertical(setupForm.brandType);

    const payload = {
      workspaceId: apiContext.workspaceId.trim(),
      brandName: onboardingForm.brandName.trim() || undefined,
      websiteUrl: setupForm.websiteUrl,
      rightsAcknowledged: setupForm.rightsAcknowledged,
      brandType: toBackendBrandType(setupForm.brandType),
      crawlScope: {
        maxPages: setupForm.maxPages,
        permittedPathPrefixes: setupForm.pathPrefixes
      },
      assets: setupForm.assets.filter(a => a.status === 'clean').map(a => ({
        artifactId: a.artifactId,
        rightsBasis: a.rightsBasis,
        permittedUse: a.permittedUse
      }))
    };

    try {
      const client = await createGeneratedWorkflowClient({
        baseUrl: '/api/v0',
        authToken: apiContext.authToken.trim()
      });
      const response = await client.createBrandCrawlRun(payload, {
        idempotencyKey: makeIdempotencyKey('brand-crawl-run')
      });
      const body = response.body as any;
      const createdRunId = body?.crawlRun?.id;
      if (createdRunId) {
        if (body?.brand?.id) {
          continuingBrandIdRef.current = body.brand.id;
          onPersistedBrands([{ id: body.brand.id, name: body.brand.name, websiteUrl: body.brand.websiteUrl }]);
        }
        if (shouldCompleteCrawlWithLocalDemo({
          source: apiContext.source,
          jobId: body?.job?.id,
          crawlProvider: body?.crawlRun?.crawlProvider
        })) {
          const demoCompletion = await fetch('/api/brand-extract/demo-complete-crawl', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workspaceId: apiContext.workspaceId.trim(),
              jobId: body.job.id,
              websiteUrl: setupForm.websiteUrl,
              brandName: onboardingForm.brandName,
              industry: setupForm.brandType
            })
          });
          if (!demoCompletion.ok) {
            const demoBody = await demoCompletion.json().catch(() => ({}));
            throw new Error(demoBody?.detail || 'Local demo crawl completion failed.');
          }
        }
        const adapted = adaptBrandCrawlRunResponse(body);
        setCrawlRun(adapted);
        setCrawlRunId(createdRunId);
        setCurrentStep(3);
        startPollingCrawl(createdRunId);
      } else {
        setApiError(body?.detail || body?.title || 'Failed to trigger crawl run.');
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to trigger crawl run.');
    } finally {
      setLoading(false);
    }
  };

  // Polling Crawl Status
  const startPollingCrawl = (runId: string) => {
    let interval = setInterval(async () => {
      try {
        const client = await createGeneratedWorkflowClient({
          baseUrl: '/api/v0',
          authToken: apiContext.authToken.trim()
        });
        const response = await client.getBrandCrawlRun(runId);
        const body = response.body as any;
        if (response.status >= 400) {
          clearInterval(interval);
          setApiError(body?.detail || body?.title || 'Failed to read crawl run status.');
          return;
        }
        const adapted = adaptBrandCrawlRunResponse(body);
        setCrawlRun(adapted);
        if (adapted.status === 'ready') {
          clearInterval(interval);
          setDetectedVertical(adapted.detectedBrandType || 'Unknown');
          setCandidates(adapted.candidates);
          // Merge the dedicated grouped asset pack (getBrandAssetPack) with candidate-derived
          // assets so harvested logos and visual identity render in the Asset Pack Viewer.
          let mergedAssetPack = adapted.assetPack;
          try {
            const assetPackResponse = await client.getBrandAssetPack(runId);
            if (assetPackResponse.status < 400 && assetPackResponse.body) {
              mergedAssetPack = adaptBrandCrawlRunResponse({
                ...body,
                assetPack: (assetPackResponse.body as any).assetPack
              }).assetPack;
            }
          } catch {
            // Best-effort: candidate-derived assets still render if the grouped pack is unavailable.
          }
          setAssetPack(mergedAssetPack);
          setReadinessScore(adapted.readinessScore);
          setBasisBreakdown(adapted.basisBreakdown);
          
          // Auto resolve conflict choice if matching
          if (adapted.detectedBrandType === setupForm.brandType) {
            setVerticalConflictResolved(true);
            setConflictResolvedSelection(setupForm.brandType);
          } else {
            setVerticalConflictResolved(false);
            setConflictResolvedSelection(setupForm.brandType);
          }
        } else if (adapted.status === 'failed') {
          clearInterval(interval);
          setApiError('Crawl process returned a failure status.');
        }
      } catch (error) {
        clearInterval(interval);
        setApiError(error instanceof Error ? error.message : 'Failed to poll crawl run.');
      }
    }, 1000);
  };

  // Candidate decisions remain pending until the authenticated domain API confirms them.
  const persistCandidateDecision = async (candidateId: string, status: 'approved' | 'rejected') => {
    if (!crawlRunId) return false;
    setCandidateMutation({ candidateId, state: 'saving' });

    try {
      const client = await createGeneratedWorkflowClient({
        baseUrl: '/api/v0',
        authToken: apiContext.authToken.trim()
      });
      const response = await client.updateBrandCandidateDecision(crawlRunId, candidateId, { status });
      if (response.status === 200) {
        setCandidates(current => current.map(candidate => candidate.id === candidateId ? { ...candidate, status } : candidate));
        setCandidateMutation({ candidateId, state: 'saved' });
        return true;
      }

      setCandidateMutation({
        candidateId,
        state: response.status === 404 ? 'stale-session' : 'failed'
      });
    } catch {
      setCandidateMutation({ candidateId, state: 'failed' });
    }
    return false;
  };

  const handleUpdateCandidateStatus = async (candidateId: string, status: 'approved' | 'rejected') => {
    await persistCandidateDecision(candidateId, status);
  };

  const handleRecategorizeImage = (candidateId: string, newCategory: 'logo' | 'product' | 'lifestyle' | 'uncategorised') => {
    setCandidates(current => current.map(cand => {
      if (cand.id !== candidateId) return cand;
      
      let fieldType = 'rights_asset';
      if (newCategory === 'logo') {
        fieldType = 'logo';
      } else if (newCategory === 'product') {
        fieldType = 'product';
      } else if (newCategory === 'lifestyle') {
        fieldType = 'media_asset';
      }
      
      const fieldLabelsMap: Record<string, string> = {
        logo: 'Logo',
        product: 'Product',
        media_asset: 'Media asset',
        rights_asset: 'Rights asset'
      };

      const fieldTypeToSectionMap: Record<string, any> = {
        logo: 'visual',
        product: 'products',
        media_asset: 'visual',
        rights_asset: 'visual'
      };

      const val = typeof cand.value === 'object' && cand.value !== null 
        ? { ...cand.value, type: newCategory } 
        : { locator: cand.displayValue, type: newCategory };
      
      return {
        ...cand,
        fieldType,
        field: fieldLabelsMap[fieldType] || cand.field,
        section: fieldTypeToSectionMap[fieldType] || cand.section,
        value: val
      };
    }));
  };

  const handleApproveAllSection = async (section: string) => {
    const sectionCandidates = candidates.filter(c => c.section === section && c.status !== 'approved');
    if (sectionCandidates.length === 0) return;

    for (const candidate of sectionCandidates) {
      await persistCandidateDecision(candidate.id, 'approved');
    }
  };

  // When progressing to step 6, pre-populate the full editable approved brand profile from approved candidates
  useEffect(() => {
    if (currentStep === 6) {
      const draft = buildApprovalDraftFromCandidates(candidates, approvalDraft, {
        selectedBrandType: selectedVertical,
        detectedBrandType: detectedVertical,
        extractionSchemaVersion: crawlRun?.extractionSchemaVersion ?? 'unknown',
        crawlRunId
      });

      // Populate rules
      draft.rules.required_phrases = [activeBrand.guidelines[3] || 'Legacy of quiet luxury.'];
      draft.rules.prohibited_phrases = ['Cheap EMI', 'Flash Sale', 'Broker-free discount'];
      draft.visual_identity.logos = setupForm.assets
        .filter(asset => asset.status === 'clean' && asset.artifactId && selectedAssetIds.has(asset.id))
        .map(asset => `artifact:${asset.artifactId}`);

      setApprovalDraft(draft);
    }
  }, [currentStep]);

  const removeFromProfile = (assetId: string) => {
    setSelectedAssetIds(current => {
      const next = new Set(current);
      next.delete(assetId);
      return next;
    });
  };

  const restoreToProfile = (assetId: string) => {
    setSelectedAssetIds(current => new Set(current).add(assetId));
  };

  // Submit final approval
  const handleApproveProfile = async () => {
    if (!crawlRunId) {
      setApprovalMutation('stale-session');
      setApiError('This brand review session is no longer current. Reload the crawl before approving the profile.');
      return;
    }
    if (!approvalDraft.rightsAttestationChecked) {
      setApprovalMutation('invalid');
      setApiError('Check the highlighted approval fields, including the rights attestation.');
      return;
    }

    setApprovalMutation('saving');
    setApiError(null);

    try {
      const client = await createGeneratedWorkflowClient({
        baseUrl: '/api/v0',
        authToken: apiContext.authToken.trim()
      });
      const response = await client.approveBrandProfile(
        activeBrand.id,
        buildCanonicalApprovalInput(approvalDraft, {
          workspaceId: apiContext.workspaceId.trim(),
          crawlRunId
        })
      );

      if (response.status !== 201) {
        const mutation = response.status === 401
          ? 'sign-in'
          : response.status === 404
          ? 'stale-session'
          : response.status === 409
          ? 'stale-version'
          : response.status === 422
          ? 'invalid'
          : 'failed';
        setApprovalMutation(mutation);
        setApiError({
          'sign-in': 'Your session expired. Sign in again before approving this profile.',
          'stale-session': 'This brand review session is no longer current. Reload the crawl before approving the profile.',
          'stale-version': 'The brand profile changed. Refresh the current profile version and review it again.',
          'invalid': 'Check the highlighted approval fields and try again.',
          'failed': 'The brand profile could not be approved. Try again.'
        }[mutation]);
        return;
      }

      const body = response.body as {
        profile: { id: string; version: number; approvedAt: string };
        approval: { id: string; decision: 'approve' };
      };
      setApprovalStatus({
        submitted: true,
        timestamp: body.profile.approvedAt,
        version: body.profile.version,
        approvalId: body.approval.id
      });
      setApprovalMutation('idle');

      onUpdateBrandData({
        ...activeBrand,
        name: approvalDraft.name.public,
        niche: approvalDraft.products[0]?.title || activeBrand.niche,
        guidelines: [
          ...approvalDraft.rules.required_phrases,
          ...approvalDraft.rules.prohibited_phrases.map((p: string) => `PROHIBITED: Do not use "${p}"`)
        ],
        reviewItem: {
          version: 'v' + body.profile.version + ' (Approved)',
          thumbnailUrl: activeBrand.reviewItem.thumbnailUrl,
          comments: [
            { user: 'Forge System', text: 'Brand profile approval was retained with its audit record.', time: 'Just now' }
          ],
          status: 'Approved',
          hash: activeBrand.reviewItem.hash
        }
      });
    } catch {
      setApprovalMutation('failed');
      setApiError('The brand profile could not be approved. Try again.');
    }
  };

  // Toggle single evidence accordion
  const toggleEvidenceExpanded = (id: string) => {
    setExpandedEvidenceIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const canAdvanceWithNextCue = currentStep === 3
    ? crawlRun?.status === 'ready' && verticalConflictResolved
    : currentStep === 4 || currentStep === 5;

  const handleNextCue = () => {
    if (!canAdvanceWithNextCue) return;
    setCurrentStep(current => Math.min(6, current + 1));
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#050507]">
      <LiquidEtherBackground />
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 lg:py-8 flex flex-col space-y-6" id="brand-extraction-studio-core">
      
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Brand Extraction Studio // Guided Pipeline
            </span>
          </div>
          <h2 className="text-2xl font-display font-medium text-white tracking-tight">
            Configure Brand Truth: <span style={{ color: activeBrand.primaryColor }}>{onboardingForm.brandName.trim() || 'Unspecified brand'}</span>
          </h2>
        </div>

        {/* Vertical Stepper Nodes */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full no-scrollbar pb-2">
          {steps.map((st) => {
            const isCurrent = st.id === currentStep;
            const isPassed = st.id < currentStep;
            return (
              <div key={st.id} className="flex items-center">
                <button
                  disabled={isCurrent || (!isPassed && !crawlRunId && st.id > 2)}
                  onClick={() => setCurrentStep(st.id)}
                  className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono tracking-wider transition-all duration-300 flex items-center gap-1.5 ${
                    isCurrent
                      ? 'text-white border-white/10 bg-white/5 font-semibold shadow-lg'
                      : isPassed
                      ? 'text-zinc-300 hover:text-white border-transparent bg-white/2'
                      : 'text-zinc-600 border-transparent bg-transparent pointer-events-none'
                  }`}
                  style={{
                    borderColor: isCurrent ? `${activeBrand.primaryColor}33` : '',
                    color: isCurrent ? activeBrand.primaryColor : ''
                  }}
                >
                  <span className={`h-4 w-4 rounded-full text-[8px] font-mono flex items-center justify-center ${
                    isCurrent ? 'bg-amber-500 text-black' : isPassed ? 'bg-white/10 text-white' : 'bg-white/2 text-zinc-600'
                  }`}
                  style={{
                    backgroundColor: isCurrent ? activeBrand.primaryColor : '',
                    color: isCurrent ? '#000' : ''
                  }}
                  >
                    {st.id}
                  </span>
                  {st.name}
                </button>
                {st.id < 6 && <ChevronRight className="h-3.5 w-3.5 text-zinc-700 mx-1 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Banners */}
      {apiError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs flex items-start gap-3"
          id="studio-error-banner"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="space-y-1 flex-1">
            <p className="font-semibold">Action Prevented by Guardrail</p>
            <p className="text-zinc-400 font-mono leading-relaxed">{apiError}</p>
          </div>
          <button onClick={() => setApiError(null)} className="text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Main Studio Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-h-[500px]">
        
        {/* Step Interactive Forms Area (Left / Center) */}
        <div className="lg:col-span-8 bg-zinc-950/40 rounded-2xl border border-white/5 p-6 min-h-[480px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            
            {/* SCREEN 1: Brand Onboarding Context */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6 text-left"
              >
                <div>
                  <h4 className="text-lg font-display text-white font-medium">Verify Base Onboarding Context</h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Provide default parameters representing the brand niche and core goals. These anchor the automatic crawl constraints.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-xs">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Brand Name</label>
                    <input
                      data-testid="brand-name-input"
                      type="text"
                      required
                      placeholder="e.g., Aura Luxury Estates"
                      value={onboardingForm.brandName}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, brandName: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Website Root URL</label>
                    <input
                      data-testid="website-url-input"
                      type="text"
                      placeholder="e.g., auraestates.in"
                      value={onboardingForm.websiteUrl}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, websiteUrl: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Industry / Niche</label>
                    <select
                      data-testid="industry-select"
                      value={onboardingForm.industry}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, industry: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-sans"
                    >
                      {INDUSTRY_OPTIONS.map(industry => (
                        <option key={industry} value={industry}>{industry}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Primary Target Market</label>
                    <input
                      type="text"
                      value={onboardingForm.primaryMarket}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, primaryMarket: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-sans"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Primary Video Creative Goal</label>
                    <textarea
                      rows={2}
                      value={onboardingForm.videoGoal}
                      onChange={(e) => setOnboardingForm(prev => ({ ...prev, videoGoal: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-sans resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Workspace ID</label>
                    <input
                      data-testid="workspace-id-input"
                      type="text"
                      placeholder="Backend workspace UUID"
                      value={apiContext.workspaceId}
                      onChange={(e) => setApiContext(prev => ({ ...prev, workspaceId: e.target.value, source: 'manual' }))}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">API Bearer Token</label>
                    <input
                      data-testid="api-token-input"
                      type="password"
                      placeholder="Supabase/V0 bearer token"
                      value={apiContext.authToken}
                      onChange={(e) => setApiContext(prev => ({ ...prev, authToken: e.target.value, source: 'manual' }))}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/20 transition-all font-mono"
                    />
                  </div>
                  {apiContext.source === 'local-demo' && (
                    <div className="md:col-span-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-2 text-[10px] font-mono text-emerald-300">
                      Local demo API context is ready. This workspace and token are generated for this browser session.
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    data-testid="save-brand-context-button"
                    onClick={handleSaveOnboarding}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-black transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
                    style={{ backgroundColor: activeBrand.primaryColor }}
                  >
                    {loading ? 'Saving context...' : 'Save & Continue'} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* SCREEN 2: Crawl Setup */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6 text-left"
              >
                <div>
                  <h4 className="text-lg font-display text-white font-medium">Configure Firecrawl Parameters</h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Set up path restrictions, verify crawl rights authorization, and upload brand files to integrate in the dossier compile.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-sans text-xs">
                  
                  {/* Left Form controls */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Website Crawl URL (Required)</label>
                      <input
                        data-testid="crawl-website-url-input"
                        type="url"
                        required
                        placeholder="https://auraestates.in"
                        value={setupForm.websiteUrl}
                        onChange={(e) => setSetupForm(prev => ({ ...prev, websiteUrl: e.target.value }))}
                        className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-white outline-none focus:border-white/20 transition-all font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Brand Type Vertical Spec</label>
                      <select
                        value={setupForm.brandType}
                        onChange={(e) => setSetupForm(prev => ({ ...prev, brandType: e.target.value }))}
                        className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-white outline-none focus:border-white/20 transition-all font-sans"
                      >
                        {CRAWL_VERTICALS.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
                        <span>Crawl Depth Limits (maxPages)</span>
                        <span className="text-white font-bold">{setupForm.maxPages} pages</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="50"
                        value={setupForm.maxPages}
                        onChange={(e) => setSetupForm(prev => ({ ...prev, maxPages: parseInt(e.target.value) }))}
                        className="w-full accent-amber-500 h-1.5 rounded-lg bg-zinc-800"
                        style={{ accentColor: activeBrand.primaryColor }}
                      />
                      <span className="text-[10px] text-zinc-500 leading-none block mt-1">Increasing limits gathers deep blog/claims context, but raises latency.</span>
                    </div>

                    {/* Path prefixes */}
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Permitted Path Prefixes</label>
                      <div className="flex gap-2">
                        <input
                          data-testid="path-prefix-input"
                          type="text"
                          placeholder="e.g., /about or /all"
                          value={newPrefix}
                          onChange={(e) => setNewPrefix(e.target.value)}
                          className="flex-1 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-white outline-none"
                        />
                        <button
                          data-testid="add-path-prefix-button"
                          onClick={handleAddPrefix}
                          className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-mono flex items-center justify-center border border-white/5"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {setupForm.pathPrefixes.map(p => (
                          <span key={p} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-[9px] font-mono text-zinc-300">
                            {p}
                            <button onClick={() => handleRemovePrefix(p)} className="text-zinc-500 hover:text-white">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Form: File uploads / Rights metadata */}
                  <div className="space-y-4 border-l border-white/5 pl-5">
                    <div>
                      <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Incorporate Approved Assets</span>
                      <div className="bg-zinc-950/60 border border-dashed border-white/10 rounded-xl p-4 text-center space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-left">
                          <input
                            type="file"
                            onChange={(e) => setSelectedAssetFile(e.target.files?.[0] ?? null)}
                            className="col-span-2 w-full rounded border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[10px] text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[10px] file:text-white"
                          />
                          <select
                            value={assetUploadInput.category}
                            onChange={(e) => setAssetUploadInput(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-[10px]"
                          >
                            <option value="Logo">Logo</option>
                            <option value="Guidelines PDF">Guidelines PDF</option>
                            <option value="Product Photo">Product Photo</option>
                            <option value="Lifestyle Image">Lifestyle Image</option>
                          </select>
                          <select
                            value={assetUploadInput.rightsBasis}
                            onChange={(e) => setAssetUploadInput(prev => ({ ...prev, rightsBasis: e.target.value }))}
                            className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-[10px]"
                          >
                            <option value="Owner Upload">Owner Upload</option>
                            <option value="Copyright Assigned">Copyright Assigned</option>
                            <option value="Licensed">Licensed</option>
                            <option value="Fair Use">Fair Use</option>
                          </select>
                          <select
                            value={assetUploadInput.permittedUse}
                            onChange={(e) => setAssetUploadInput(prev => ({ ...prev, permittedUse: e.target.value }))}
                            className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-[10px]"
                          >
                            <option value="All Media">All Media</option>
                            <option value="Digital Only">Digital Only</option>
                            <option value="Campaign Specific">Campaign Spec</option>
                          </select>
                        </div>

                        <button
                          onClick={handleAddAsset}
                          disabled={loading || !selectedAssetFile}
                          className="w-full py-1.5 rounded bg-white/10 hover:bg-white/15 text-[10px] font-mono uppercase tracking-wider text-white border border-white/5 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <UploadCloud className="h-3 w-3" /> Upload approved asset
                        </button>
                      </div>
                    </div>

                    {/* Asset list */}
                    <div className="space-y-1.5">
                      <span className="block text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Incorporate Queue ({setupForm.assets.length})</span>
                      <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 font-mono">
                        {setupForm.assets.length === 0 ? (
                          <div className="text-[10px] text-zinc-600 italic">No assets incorporated yet.</div>
                        ) : (
                          setupForm.assets.map(a => (
                            <div key={a.id} className="flex justify-between items-center bg-white/2 border border-white/5 p-2 rounded text-[10px]">
                              <div>
                                <p className="text-white font-medium">{a.name} <span className="text-[8px] text-zinc-500">[{a.category}]</span></p>
                                <p className="text-[8px] text-zinc-400 mt-0.5">{a.rightsBasis} // {a.permittedUse}</p>
                                {a.error && <p className="text-[8px] text-red-400 mt-0.5">{a.error}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[8px] px-1.5 py-0.5 rounded border uppercase ${
                                  a.status === 'clean'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : a.status === 'failed'
                                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
                                }`}>
                                  {a.status}
                                </span>
                                <button onClick={() => handleRemoveAsset(a.id)} className="text-zinc-500 hover:text-red-400">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rights checkbox */}
                <div className="p-4 rounded-xl border border-white/5 bg-zinc-950/60 flex items-start gap-3">
                  <input
                    data-testid="rights-acknowledgement"
                    type="checkbox"
                    id="rights-acknowledgement"
                    checked={setupForm.rightsAcknowledged}
                    onChange={(e) => setSetupForm(prev => ({ ...prev, rightsAcknowledged: e.target.checked }))}
                    className="mt-1 h-4 w-4 accent-amber-500 border border-white/10 rounded"
                    style={{ accentColor: activeBrand.primaryColor }}
                  />
                  <div className="space-y-1 leading-snug">
                    <label htmlFor="rights-acknowledgement" className="text-xs font-semibold text-white cursor-pointer select-none">
                      Acknowledge Crawl & Lineage Rights
                    </label>
                    <p className="text-[10px] text-zinc-400 leading-normal">
                      I confirm and warrant that I have the explicit lawful right, authority, and proper license permissions to scan this brand url, retrieve digital assets, and process associated media claims for video generation workflows.
                    </p>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 text-xs font-mono tracking-wider uppercase text-zinc-400 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    data-testid="start-brand-crawl-button"
                    onClick={handleStartCrawl}
                    disabled={loading || !setupForm.websiteUrl || !setupForm.rightsAcknowledged}
                    className="px-6 py-2.5 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 shadow"
                    style={{ backgroundColor: activeBrand.primaryColor }}
                    id="trigger-crawl-btn"
                  >
                    {loading ? 'Initializing run...' : 'Start Brand Crawl'} <Play className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* SCREEN 3: Live Scan Console */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6 text-left"
              >
                <div>
                  <h4 className="text-lg font-display text-white font-medium">Live Scan Command Console</h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Firecrawl v3 is actively scanning public interfaces. Tracking true server responses in real time.
                  </p>
                </div>

                {crawlRun ? (
                  <div className="space-y-5">
                    {/* Progress details */}
                    <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-4 space-y-3 font-mono text-xs">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-zinc-500 uppercase text-[10px]">Crawl Run Reference</span>
                        <span className="text-white select-all">{crawlRun.id}</span>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-zinc-400">
                        <span>CRAWLING NODES: <span className="text-white">{crawlRun.websiteUrl}</span></span>
                        <span
                          data-testid="crawl-run-status"
                          className="uppercase text-amber-400"
                          style={{ color: crawlRun.status === 'ready' ? '#34d399' : activeBrand.primaryColor }}
                        >
                          {crawlRun.status}...
                        </span>
                      </div>

                      {/* Real Progress Bar */}
                      <div className="relative w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full transition-all duration-300"
                          style={{
                            width: `${crawlRun.progress}%`,
                            backgroundColor: activeBrand.primaryColor
                          }}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] text-zinc-500 uppercase leading-none">
                        <span>Pass Complete Progress</span>
                        <span>{crawlRun.progress}%</span>
                      </div>
                    </div>

                    {/* Timeline Passes Logs */}
                    <div className="space-y-2">
                      <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Polled Scan Passes history</span>
                      <div className="max-h-40 overflow-y-auto bg-black/40 border border-white/5 p-3 rounded-xl font-mono text-[10px] space-y-2">
                        {crawlRun.history?.length === 0 ? (
                          <p className="text-zinc-600 italic">Listening for server telemetry...</p>
                        ) : (
                          crawlRun.history?.map((log: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-zinc-400 border-b border-white/2 pb-1.5 last:border-0 leading-tight">
                              <span className="text-emerald-400">✓ {log.message}</span>
                              <span className="text-zinc-500">[{log.progress}%]</span>
                            </div>
                          ))
                        )}
                        {crawlRun.status !== 'ready' && (
                          <div className="flex items-center gap-2 text-amber-400 animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                            <span>Awaiting next telemetry dispatch block...</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vertical mismatch conflict resolution */}
                    {crawlRun.status === 'ready' && !verticalConflictResolved && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-3"
                        id="vertical-conflict-box"
                      >
                        <div className="flex items-start gap-3 text-amber-400 text-xs leading-normal">
                          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                          <div className="space-y-1">
                            <p className="font-semibold">Vertical Conflict Flag Detected</p>
                            <p className="text-zinc-400 leading-snug">
                              Crawl scope selected vertical: <span className="text-white font-mono">{selectedVertical}</span>. Detected backend schema: <span className="text-white font-mono">{detectedVertical}</span>. Please resolve conflict path before final lock.
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-1 font-mono text-[10px]">
                          <button
                            onClick={() => {
                              setConflictResolvedSelection(selectedVertical);
                              setVerticalConflictResolved(true);
                            }}
                            className="px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:text-white"
                          >
                            Use Selected: {selectedVertical}
                          </button>
                          <button
                            onClick={() => {
                              setConflictResolvedSelection(detectedVertical || selectedVertical);
                              setVerticalConflictResolved(true);
                            }}
                            className="px-3 py-1.5 rounded bg-amber-500 text-black font-semibold uppercase tracking-wider"
                            style={{ backgroundColor: activeBrand.primaryColor }}
                          >
                            Use Detected: {detectedVertical}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500 font-mono text-xs">
                    <RefreshCw className="h-6 w-6 animate-spin mb-2 text-zinc-500" />
                    Connecting to server crawl thread, establishing handshake...
                  </div>
                )}

                <div className="flex justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 text-xs font-mono tracking-wider uppercase text-zinc-400 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    data-testid="review-dossier-button"
                    onClick={() => setCurrentStep(4)}
                    disabled={!crawlRun || crawlRun.status !== 'ready' || !verticalConflictResolved}
                    className="px-6 py-2.5 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                    style={{ backgroundColor: activeBrand.primaryColor }}
                  >
                    Review Dossier <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* SCREEN 4: Candidate Dossier */}
            {currentStep === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6 text-left"
              >
                {/* Score badge & Title */}
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div>
                    <h4 className="text-lg font-display text-white font-medium">Extracted Candidate Dossier</h4>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Confirm or discard facts extracted by Firecrawl. Only approved entries map into the Brand Profile.
                    </p>
                  </div>
                  
                  {/* Readiness rating */}
                  <div className="text-right flex items-center gap-3 bg-white/2 border border-white/5 p-2 rounded-lg">
                    <div className="leading-none text-left">
                      <span className="text-[8px] font-mono text-zinc-500 uppercase block">Readiness Score</span>
                      <span className="text-xs font-mono text-white font-bold">{readinessScore}% basis</span>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="grid grid-cols-4 gap-1 text-[8px] font-mono leading-none">
                      {Object.entries(basisBreakdown).map(([k, v]: any) => (
                        <div key={k} className="text-center">
                          <span className="text-zinc-500 uppercase block mb-0.5">{k.substring(0, 4)}</span>
                          <span className="text-white font-semibold">{v}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Filter and sections layout */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                  
                  {/* Sections side selector */}
                  <div className="md:col-span-3 space-y-1">
                    <span className="block text-[8px] font-mono text-zinc-500 uppercase tracking-widest pl-2 mb-1.5">Dossier Sections</span>
                    {[
                      { id: 'identity', name: 'Identity & Positioning', count: candidates.filter(c => c.section === 'identity').length },
                      { id: 'visual', name: 'Visual Identity', count: candidates.filter(c => c.section === 'visual').length },
                      { id: 'copy', name: 'Copy & Messaging', count: candidates.filter(c => c.section === 'copy').length },
                      { id: 'voice', name: 'Voice & Tone', count: candidates.filter(c => c.section === 'voice').length },
                      { id: 'proof', name: 'Social Proof', count: candidates.filter(c => c.section === 'proof').length },
                      { id: 'products', name: 'Products & Services', count: candidates.filter(c => c.section === 'products').length },
                      { id: 'offers', name: 'Offers & Pricing', count: candidates.filter(c => c.section === 'offers').length },
                      { id: 'compliance', name: 'Compliance', count: candidates.filter(c => c.section === 'compliance').length },
                      { id: 'audiences', name: 'Audiences', count: candidates.filter(c => c.section === 'audiences').length },
                      { id: 'social', name: 'Publishing Social', count: candidates.filter(c => c.section === 'social').length },
                      { id: 'metadata', name: 'Metadata & Conflict', count: candidates.filter(c => c.section === 'metadata').length },
                      { id: 'missing', name: 'Missing Assets', count: candidates.filter(c => c.section === 'missing').length }
                    ].map(sec => (
                      <button
                        key={sec.id}
                        onClick={() => setActiveCandidateSection(sec.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all duration-200 flex justify-between items-center ${
                          activeCandidateSection === sec.id
                            ? 'bg-white/10 text-white'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/2'
                        }`}
                        style={{
                          borderLeft: activeCandidateSection === sec.id ? `2px solid ${activeBrand.primaryColor}` : '2px solid transparent'
                        }}
                      >
                        <span>{sec.name}</span>
                        <span className="text-[10px] text-zinc-500">({sec.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Candidates List centered */}
                  <div className="md:col-span-9 space-y-3 min-h-[300px]">
                    <div className="flex justify-between items-center mb-1 bg-zinc-900/40 p-2 rounded-lg border border-white/5">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase">Field Evidence items</span>
                        {candidates.filter(c => c.section === activeCandidateSection && c.status !== 'approved').length > 0 && (
                          <button
                            onClick={() => handleApproveAllSection(activeCandidateSection)}
                            className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-mono uppercase transition-colors"
                          >
                            Approve All
                          </button>
                        )}
                      </div>
                      
                      {/* Filter tabs */}
                      <div className="flex gap-1 bg-black/40 p-1 rounded font-mono text-[9px]">
                        {(['all', 'approved', 'rejected', 'conflict', 'low-confidence'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setDossierFilter(tab)}
                            className={`px-2 py-0.5 rounded uppercase ${
                              dossierFilter === tab ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {candidates
                        .filter(c => c.section === activeCandidateSection)
                        .filter(c => dossierFilter === 'all' || c.status === dossierFilter)
                        .length === 0 ? (
                        <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                          No {dossierFilter !== 'all' ? dossierFilter : ''} candidate items found in this section.
                        </div>
                      ) : (
                        candidates
                          .filter(c => c.section === activeCandidateSection)
                          .filter(c => dossierFilter === 'all' || c.status === dossierFilter)
                          .map((cand) => {
                            const isApproved = cand.status === 'approved';
                            const isRejected = cand.status === 'rejected';
                            const isConflict = cand.status === 'conflict';
                            const isExpanded = expandedEvidenceIds[cand.id];
                            const mutation = candidateMutations[cand.id];
                            const isSaving = mutation?.state === 'saving';

                            return (
                              <div
                                key={cand.id}
                                className={`rounded-xl border p-4 space-y-3 transition-all duration-300 ${
                                  isApproved
                                    ? 'border-emerald-500/20 bg-emerald-500/2'
                                    : isRejected
                                    ? 'border-red-500/10 bg-red-500/1 opacity-55'
                                    : isConflict
                                    ? 'border-amber-500/20 bg-amber-500/5'
                                    : 'border-white/5 bg-white/2'
                                }`}
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-400 uppercase">
                                      {cand.field}
                                    </span>
                                    <span className="text-[9px] font-mono text-zinc-500 pl-2">
                                      Confidence: <span className={cand.confidence > 90 ? 'text-emerald-400' : 'text-amber-400'}>{cand.confidence}%</span>
                                      {cand.conflict && <span className="pl-2 text-amber-400">Conflict retained</span>}
                                    </span>
                                  </div>

                                  <div className="flex gap-1.5 font-mono text-[9px]">
                                    <button
                                      onClick={() => handleUpdateCandidateStatus(cand.id, 'rejected')}
                                      disabled={isSaving}
                                      className={`px-2 py-1 rounded transition-colors ${
                                        isRejected ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-transparent'
                                      }`}
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => handleUpdateCandidateStatus(cand.id, 'approved')}
                                      disabled={isSaving}
                                      className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                                        isApproved ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-transparent'
                                      }`}
                                    >
                                      {isApproved && <Check className="h-3.5 w-3.5" />} Approve
                                    </button>
                                  </div>
                                </div>

                                {mutation?.state === 'saving' && (
                                  <p role="status" className="text-[10px] text-zinc-400">Saving decision…</p>
                                )}
                                {mutation?.state === 'failed' && (
                                  <p role="alert" className="text-[10px] text-amber-300">The decision could not be saved. Try again.</p>
                                )}
                                {mutation?.state === 'stale-session' && (
                                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-amber-200">
                                    <span>This review session is no longer current. Reload the crawl before changing decisions.</span>
                                    <button
                                      type="button"
                                      onClick={() => crawlRunId && startPollingCrawl(crawlRunId)}
                                      className="rounded border border-amber-400/30 px-2 py-1 font-mono uppercase text-amber-200 hover:bg-amber-400/10"
                                    >
                                      Reload crawl
                                    </button>
                                  </div>
                                )}

                                <div className="text-left font-sans">
                                  {cand.fieldType === 'visual_identity' && typeof cand.value === 'object' && cand.value !== null && (cand.value as any).colors ? (
                                    <div className="flex gap-2">
                                      {Object.entries((cand.value as any).colors).filter(([, hex]) => Boolean(hex)).map(([role, hex]: any) => (
                                        <div key={role} className="flex items-center gap-1.5 bg-zinc-900/60 p-1 px-2 border border-white/5 rounded">
                                          <div className="h-3 w-3 rounded-sm border border-white/20" style={{ backgroundColor: hex }} />
                                          <span className="text-[10px] font-mono text-zinc-300 uppercase">{role}: {hex}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : cand.fieldType === 'color' && typeof cand.value === 'object' && cand.value !== null ? (
                                    <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 px-2 border border-white/5 rounded w-fit">
                                      <div className="h-3.5 w-3.5 rounded-sm border border-white/20" style={{ backgroundColor: (cand.value as any).value || '#FFFFFF' }} />
                                      <span className="text-[10px] font-mono text-zinc-300 uppercase">{(cand.value as any).role || 'color'}: <span className="text-white font-bold">{(cand.value as any).value}</span></span>
                                    </div>
                                  ) : ['rights_asset', 'logo', 'media_asset'].includes(cand.fieldType) ? (
                                    <div className="space-y-3">
                                      <div className="relative rounded-lg overflow-hidden border border-white/10 bg-zinc-950 w-36 h-28">
                                        <img
                                          src={(cand.value as any)?.locator || (cand.value as any)?.src || cand.displayValue}
                                          alt={cand.field}
                                          className="h-full w-full object-cover"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute inset-0 bg-black/40 flex items-end p-1.5">
                                          <span className="text-[8px] font-mono text-white bg-black/55 px-1 py-0.5 rounded uppercase">
                                            {(cand.value as any)?.type || cand.fieldType}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Manual category switcher UI */}
                                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/5 flex-wrap">
                                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Categorize as:</span>
                                        {(['logo', 'product', 'lifestyle', 'uncategorised'] as const).map(cat => {
                                          const isActive = (cand.value as any)?.type === cat || 
                                            (cand.fieldType === 'logo' && cat === 'logo') ||
                                            (cand.fieldType === 'product' && cat === 'product') ||
                                            (cand.fieldType === 'media_asset' && cat === 'lifestyle') ||
                                            (cand.fieldType === 'rights_asset' && cat === 'uncategorised');
                                          return (
                                            <button
                                              key={cat}
                                              type="button"
                                              onClick={() => handleRecategorizeImage(cand.id, cat)}
                                              className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-all ${
                                                isActive
                                                  ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                                                  : 'bg-zinc-900 border-transparent text-zinc-400 hover:text-white hover:bg-zinc-800'
                                              }`}
                                            >
                                              {cat === 'uncategorised' ? 'Compliance/Uncat' : cat}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : typeof cand.value === 'object' && cand.value !== null ? (
                                    <pre className="text-[10px] text-white leading-relaxed whitespace-pre-wrap select-all bg-black/30 border border-white/5 rounded-lg p-2 max-h-40 overflow-auto">{cand.displayValue}</pre>
                                  ) : (
                                    <p className="text-xs text-white leading-relaxed select-all">"{cand.displayValue}"</p>
                                  )}
                                </div>

                                {/* Source evidence block */}
                                <div className="border-t border-white/2 pt-2 text-[9px] font-mono flex flex-col space-y-1.5">
                                  <button
                                    onClick={() => toggleEvidenceExpanded(cand.id)}
                                    className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 self-start"
                                  >
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    <span>{isExpanded ? 'Hide Evidence Source' : 'View Source Evidence'}</span>
                                  </button>
                                  
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      className="bg-black/50 p-2.5 rounded border border-white/5 space-y-1 text-[9px] leading-relaxed text-zinc-400"
                                    >
                                      <p>• <span className="text-zinc-500 uppercase">Source type:</span> <span className="text-zinc-300">{cand.evidence.type}</span></p>
                                      <p>• <span className="text-zinc-500 uppercase">Locator node:</span> <span className="text-zinc-300 select-all">{cand.evidence.locator}</span></p>
                                      <p>• <span className="text-zinc-500 uppercase">Excerpt block:</span> <span className="text-zinc-300 italic">"{cand.evidence.excerpt}"</span></p>
                                      <p>• <span className="text-zinc-500 uppercase">Evidence hash:</span> <span className="text-zinc-500 select-all">{cand.evidence.hash}</span></p>
                                      {cand.evidence.observedAt && <p>• <span className="text-zinc-500 uppercase">Observed at:</span> <span className="text-zinc-300">{cand.evidence.observedAt}</span></p>}
                                    </motion.div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <button onClick={() => setCurrentStep(3)} className="px-4 py-2 text-xs font-mono uppercase text-zinc-400 hover:text-white">Back</button>
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="px-6 py-2.5 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-black transition-all hover:opacity-90 flex items-center gap-1.5"
                    style={{ backgroundColor: activeBrand.primaryColor }}
                  >
                    View Asset Pack <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* SCREEN 5: Asset Pack Viewer */}
            {currentStep === 5 && (
              <motion.div
                key="step-5"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6 text-left"
              >
                <div>
                  <h4 className="text-lg font-display text-white font-medium">Extracted Asset Pack Viewer</h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Visual library harvested directly from brand source nodes. Download and proxy assets safely under short-lived URIs.
                  </p>
                </div>

                <p className="text-[10px] text-zinc-500">Remove from profile changes only the pending profile selection. Retained evidence is not deleted.</p>
                {setupForm.assets.every(asset => asset.status !== 'clean') && (
                  <p className="rounded-lg border border-dashed border-white/10 bg-zinc-950/20 p-3 text-xs text-zinc-500">
                    No retained assets are available. Add a direct upload, or configure the crawl provider before harvesting source visuals.
                  </p>
                )}
                <AcquiredBrandAssetsCupboard
                  assets={setupForm.assets
                    .filter(asset => asset.status === 'clean' && asset.artifactId)
                    .map(asset => ({
                      id: asset.id,
                      artifactReference: `artifact:${asset.artifactId}` as `artifact:${string}`,
                      name: asset.name,
                      category: asset.category,
                      provenance: crawlRunId ? `Crawl run ${crawlRunId}` : 'Client upload',
                      rights: `${asset.rightsBasis} · ${asset.permittedUse}`,
                      status: 'ready' as const,
                      selected: selectedAssetIds.has(asset.id)
                    }))}
                  renderThumbnail={asset => asset.status === 'rejected' ? null : asset.selected ? (
                    <SecureArtifactThumbnail
                      artifactReference={asset.artifactReference}
                      workspaceId={apiContext.workspaceId.trim()}
                      client={artifactDownloadClient}
                      label={asset.name}
                      status="ready"
                    />
                  ) : (
                    <SecureArtifactThumbnail label={asset.name} status="removed" />
                  )}
                  onAdd={() => setCurrentStep(2)}
                  onRemove={removeFromProfile}
                  onRestore={restoreToProfile}
                />

                {assetPack.length > 0 && (
                  <section aria-labelledby="source-asset-candidates" className="rounded-xl border border-white/5 bg-zinc-950/30 p-4">
                    <h5 id="source-asset-candidates" className="text-xs font-mono uppercase tracking-wider text-zinc-400">Source candidates not retained</h5>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {assetPack.map(asset => (
                        <div key={asset.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs text-zinc-400">
                          <p className="font-medium text-zinc-200">{asset.name}</p>
                          <p className="mt-1">{asset.category} · Candidate evidence only</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <div className="flex justify-between pt-4">
                  <button onClick={() => setCurrentStep(4)} className="px-4 py-2 text-xs font-mono uppercase text-zinc-400 hover:text-white">Back</button>
                  <button
                    onClick={() => setCurrentStep(6)}
                    className="px-6 py-2.5 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-black transition-all hover:opacity-90 flex items-center gap-1.5"
                    style={{ backgroundColor: activeBrand.primaryColor }}
                  >
                    Lock Approval Profile <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* SCREEN 6: Brand Approval Profile Form */}
            {currentStep === 6 && (
              <motion.div
                key="step-6"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6 text-left"
              >
                <div>
                  <h4 className="text-lg font-display text-white font-medium">Approved Brand Profile Constructor</h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Verify and modify approved fields before retaining a new approved profile version. Downstream video generators use only the active approved version.
                  </p>
                </div>

                {!approvalStatus.submitted ? (
                  <div className="space-y-5 font-sans text-xs">
                    
                    {/* Collapsible details list */}
                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-2 border-b border-white/5 pb-4">
                      
                      {/* Section 1: Name */}
                      <div className="bg-zinc-900/20 border border-white/5 rounded-xl p-4 space-y-3">
                        <h5 className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Layers className="h-4 w-4" style={{ color: activeBrand.primaryColor }} /> 1. Brand Naming
                        </h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Public Display Name</label>
                            <input
                              type="text"
                              value={approvalDraft.name.public}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, name: { ...prev.name, public: e.target.value } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Legal Registered Entity</label>
                            <input
                              type="text"
                              value={approvalDraft.name.legal}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, name: { ...prev.name, legal: e.target.value } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Positioning statement & differentiators */}
                      <div className="bg-zinc-900/20 border border-white/5 rounded-xl p-4 space-y-3">
                        <h5 className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Layers className="h-4 w-4" style={{ color: activeBrand.primaryColor }} /> 2. Market Positioning
                        </h5>
                        <div>
                          <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Core Tagline / Mission Hook</label>
                          <textarea
                            rows={2}
                            value={approvalDraft.positioning.statement}
                            onChange={(e) => setApprovalDraft(prev => ({ ...prev, positioning: { ...prev.positioning, statement: e.target.value } }))}
                            className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Differentiators & Proof Points (One per line)</label>
                          <textarea
                            rows={2}
                            value={approvalDraft.positioning.proof_points?.join('\n')}
                            onChange={(e) => setApprovalDraft(prev => ({ ...prev, positioning: { ...prev.positioning, proof_points: e.target.value.split('\n') } }))}
                            className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white font-mono text-[10px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Unique Selling Propositions (USPs / Differentiators) (One per line)</label>
                          <textarea
                            rows={3}
                            value={approvalDraft.positioning.differentiators?.join('\n') || ''}
                            onChange={(e) => setApprovalDraft(prev => ({ ...prev, positioning: { ...prev.positioning, differentiators: e.target.value.split('\n') } }))}
                            className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white font-mono text-[10px]"
                          />
                        </div>
                      </div>

                      {/* Section 3: Color roles & Fonts */}
                      <div className="bg-zinc-900/20 border border-white/5 rounded-xl p-4 space-y-3">
                        <h5 className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Layers className="h-4 w-4" style={{ color: activeBrand.primaryColor }} /> 3. Visual Identity Rules
                        </h5>
                        <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                          <div>
                            <label className="block text-[8px] uppercase text-zinc-500 mb-1">Primary Font</label>
                            <input
                              type="text"
                              value={approvalDraft.visual_identity.fonts.primary}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, visual_identity: { ...prev.visual_identity, fonts: { ...prev.visual_identity.fonts, primary: e.target.value } } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-zinc-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase text-zinc-500 mb-1">Heading Font</label>
                            <input
                              type="text"
                              value={approvalDraft.visual_identity.fonts.heading}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, visual_identity: { ...prev.visual_identity, fonts: { ...prev.visual_identity.fonts, heading: e.target.value } } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-zinc-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] uppercase text-zinc-500 mb-1">Mono/Data Font</label>
                            <input
                              type="text"
                              value={approvalDraft.visual_identity.fonts.code}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, visual_identity: { ...prev.visual_identity, fonts: { ...prev.visual_identity.fonts, code: e.target.value } } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-zinc-300"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-1.5 pt-1">
                          <label className="block text-[8px] font-mono uppercase text-zinc-500">Extracted Palette Colors & Guidelines</label>
                          <div className="grid grid-cols-1 gap-2">
                            {approvalDraft.visual_identity.colors?.map((col: any, i: number) => (
                              <div key={i} className="flex gap-2 items-center bg-zinc-950 p-2 rounded border border-white/5">
                                <div className="h-5 w-5 rounded border border-white/10 flex-shrink-0" style={{ backgroundColor: col.value }} />
                                <input
                                  type="text"
                                  value={col.value}
                                  onChange={(e) => {
                                    const cols = [...approvalDraft.visual_identity.colors];
                                    cols[i].value = e.target.value;
                                    setApprovalDraft(prev => ({ ...prev, visual_identity: { ...prev.visual_identity, colors: cols } }));
                                  }}
                                  className="w-20 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] font-mono"
                                />
                                <input
                                  type="text"
                                  value={col.role}
                                  onChange={(e) => {
                                    const cols = [...approvalDraft.visual_identity.colors];
                                    cols[i].role = e.target.value;
                                    setApprovalDraft(prev => ({ ...prev, visual_identity: { ...prev.visual_identity, colors: cols } }));
                                  }}
                                  className="flex-1 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-[10px]"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Voice, tone and approved/prohibited guidelines */}
                      <div className="bg-zinc-900/20 border border-white/5 rounded-xl p-4 space-y-3">
                        <h5 className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Layers className="h-4 w-4" style={{ color: activeBrand.primaryColor }} /> 4. Voice, Tone & Script Rules
                        </h5>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Formality Style</label>
                            <select
                              value={approvalDraft.voice.formality}
                              onChange={(e: any) => setApprovalDraft(prev => ({ ...prev, voice: { ...prev.voice, formality: e.target.value } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-zinc-300"
                            >
                              <option value="formal">Formal</option>
                              <option value="balanced">Balanced</option>
                              <option value="conversational">Conversational</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Tone Attributes (comma separated)</label>
                            <input
                              type="text"
                              value={approvalDraft.voice.attributes?.join(', ')}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, voice: { ...prev.voice, attributes: e.target.value.split(',').map(s => s.trim()) } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-zinc-300"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Required Slogan Phrases (One per line)</label>
                            <textarea
                              rows={2}
                              value={approvalDraft.rules.required_phrases?.join('\n')}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, rules: { ...prev.rules, required_phrases: e.target.value.split('\n') } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Prohibited Terms & Claims (One per line)</label>
                            <textarea
                              rows={2}
                              value={approvalDraft.rules.prohibited_phrases?.join('\n')}
                              onChange={(e) => setApprovalDraft(prev => ({ ...prev, rules: { ...prev.rules, prohibited_phrases: e.target.value.split('\n') } }))}
                              className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-300"
                            />
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Source summary details */}
                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5 font-mono text-[9px] text-zinc-500 grid grid-cols-2 md:grid-cols-4 gap-4 leading-relaxed">
                      <div>
                        <span>SELECTED TYPE:</span>
                        <p className="text-zinc-300 mt-0.5">{approvalDraft.source_summary.selected_brand_type}</p>
                      </div>
                      <div>
                        <span>DETECTED TYPE:</span>
                        <p className="text-zinc-300 mt-0.5">{approvalDraft.source_summary.detected_brand_type || 'Unknown'}</p>
                      </div>
                      <div>
                        <span>CRAWL RUN ID:</span>
                        <p className="text-zinc-300 mt-0.5 select-all">{approvalDraft.source_summary.crawl_run_ref}</p>
                      </div>
                      <div>
                        <span>SCHEMA VERSION:</span>
                        <p className="text-zinc-300 mt-0.5">{approvalDraft.source_summary.extraction_schema_version}</p>
                      </div>
                    </div>

                    {/* Final warning rights attestation checkbox */}
                    <div className="p-4 rounded-xl border border-amber-500/10 bg-amber-500/2 space-y-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="final-profile-attestation"
                          checked={approvalDraft.rightsAttestationChecked}
                          onChange={(e) => setApprovalDraft(prev => ({ ...prev, rightsAttestationChecked: e.target.checked }))}
                          className="mt-1 h-4 w-4 accent-amber-500 border border-white/10 rounded"
                          style={{ accentColor: activeBrand.primaryColor }}
                        />
                        <div className="space-y-1 leading-snug">
                          <label htmlFor="final-profile-attestation" className="text-xs font-semibold text-white cursor-pointer select-none">
                            Cryptographic Consent & Verification Attestation
                          </label>
                          <p className="text-[10px] text-zinc-400 leading-normal">
                            I verify and certify that the extracted brand values, color palettes, slogans, logo configurations, and claim compliance gates above have been human-reviewed and represent the absolute source of truth. Lock this profile for future social video compilation runs.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-[10px] font-mono">
                        <div>
                          <label className="block text-zinc-500 uppercase mb-1">Approval Actor Signature (Type full name to sign)</label>
                          <input
                            type="text"
                            placeholder="Type Rohan Malhotra"
                            value={approvalDraft.reviewerSignature}
                            onChange={(e) => setApprovalDraft(prev => ({ ...prev, reviewerSignature: e.target.value }))}
                            className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-500 uppercase mb-1">Approved Profile Version</label>
                          <input
                            type="text"
                            value={approvalDraft.version}
                            onChange={(e) => setApprovalDraft(prev => ({ ...prev, version: e.target.value }))}
                            className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-zinc-400 cursor-not-allowed"
                            disabled
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between pt-2">
                      <button onClick={() => setCurrentStep(5)} className="px-4 py-2 text-xs font-mono uppercase text-zinc-400 hover:text-white">Back</button>
                      
                      <button
                        onClick={handleApproveProfile}
                        disabled={approvalMutation === 'saving'}
                        className="px-6 py-2.5 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-black transition-all hover:opacity-90 disabled:opacity-30 flex items-center gap-1.5 shadow"
                        style={{ backgroundColor: activeBrand.primaryColor }}
                        id="submit-final-approval-btn"
                      >
                        {approvalMutation === 'saving' ? 'Submitting approval...' : 'Submit Brand Approval'} <CheckCircle className="h-4 w-4" />
                      </button>
                    </div>

                  </div>
                ) : (
                  // Approval Success Card Redesign
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-6 space-y-6 w-full text-left"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <CheckCircle2 className="h-6 w-6 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-xl font-display font-medium text-white">Brand Profile Approved & Synchronized</h4>
                          <p className="text-xs text-zinc-400">
                            Version <strong className="text-white">v{approvalStatus.version}</strong> saved as the downstream production standard for ad/reel generation.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setApprovalStatus({ submitted: false, timestamp: null, approvalId: null, version: null });
                            setApprovalMutation('idle');
                            setApprovalDraft(prev => ({ ...prev, rightsAttestationChecked: false, reviewerSignature: '' }));
                            setCurrentStep(1);
                          }}
                          className="px-4 py-2.5 rounded-lg border border-white/10 bg-white/2 hover:bg-white/5 text-xs font-mono text-zinc-300 hover:text-white"
                        >
                          Recrawl Website
                        </button>
                        <button
                          onClick={onProceedWorkflow}
                          className="px-6 py-2.5 rounded-lg text-xs font-mono font-semibold text-black uppercase tracking-wider transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
                          style={{ backgroundColor: activeBrand.primaryColor }}
                          id="proceed-video-workflow-btn"
                        >
                          Launch Video Pipeline <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* COLUMN 1: Visual Identity & Creative Ingredients */}
                      <div className="space-y-4">
                        
                        {/* Core Identity */}
                        <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-2">
                          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Brand Identity</span>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] text-zinc-400 block leading-tight">Public Name</span>
                              <span className="text-sm font-semibold text-white">{approvalDraft.name.public}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 block leading-tight">Industry / Niche</span>
                              <span className="text-sm font-semibold text-white capitalize">{approvalDraft.industry}</span>
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 block leading-tight">Target Markets</span>
                            <span className="text-xs text-zinc-300 font-mono">{approvalDraft.markets?.join(', ') || 'Global'}</span>
                          </div>
                        </div>

                        {/* Visual Identity */}
                        <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Visual identity</span>
                          
                          {/* Logos Shelf */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-zinc-400 block leading-tight">Approved Logos</span>
                            <div className="flex flex-wrap gap-3">
                              {approvalDraft.visual_identity.logos?.length > 0 ? (
                                approvalDraft.visual_identity.logos.map((logo: string, idx: number) => {
                                  const isArtifact = logo.startsWith("artifact:");
                                  return (
                                    <div key={idx} className="relative rounded-lg overflow-hidden border border-white/10 bg-zinc-950 w-24 h-20 flex items-center justify-center">
                                      {isArtifact ? (
                                        <SecureArtifactThumbnail
                                          artifactReference={logo as `artifact:${string}`}
                                          workspaceId={apiContext.workspaceId.trim()}
                                          client={artifactDownloadClient}
                                          label={`Approved Logo ${idx + 1}`}
                                          status="ready"
                                        />
                                      ) : (
                                        <img src={logo} alt={`Approved Logo ${idx + 1}`} className="h-full w-full object-contain p-1" referrerPolicy="no-referrer" />
                                      )}
                                    </div>
                                  );
                                })
                              ) : (
                                <span className="text-xs text-zinc-500 italic">No approved logos attached.</span>
                              )}
                            </div>
                          </div>

                          {/* Swatches */}
                          <div className="space-y-1.5 pt-1.5">
                            <span className="text-[10px] text-zinc-400 block leading-tight">Color Palette</span>
                            <div className="flex flex-wrap gap-2">
                              {approvalDraft.visual_identity.colors?.map((col: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1.5 bg-zinc-900/60 p-1.5 px-2.5 border border-white/5 rounded-lg">
                                  <div className="h-4 w-4 rounded border border-white/20" style={{ backgroundColor: col.value }} />
                                  <div className="leading-none flex flex-col">
                                    <span className="text-[9px] font-mono text-zinc-400 uppercase">{col.role}</span>
                                    <span className="text-[10px] font-mono text-white font-bold">{col.value}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Other Approved Media Assets */}
                          {approvalDraft.visual_identity.media_assets && approvalDraft.visual_identity.media_assets.length > 0 && (
                            <div className="space-y-1.5 pt-2">
                              <span className="text-[10px] text-zinc-400 block leading-tight">Other Approved Images</span>
                              <div className="flex flex-wrap gap-2">
                                {approvalDraft.visual_identity.media_assets.map((m: any, idx: number) => {
                                  const isArtifact = m.locator.startsWith("artifact:");
                                  return (
                                    <div key={idx} className="relative rounded-lg overflow-hidden border border-white/10 bg-zinc-950 w-20 h-16 flex items-center justify-center" title={`Category: ${m.category}`}>
                                      {isArtifact ? (
                                        <SecureArtifactThumbnail
                                          artifactReference={m.locator as `artifact:${string}`}
                                          workspaceId={apiContext.workspaceId.trim()}
                                          client={artifactDownloadClient}
                                          label={`Media ${idx + 1}`}
                                          status="ready"
                                        />
                                      ) : (
                                        <img src={m.locator} alt={`Media ${idx + 1}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Core Positioning */}
                        <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-2">
                          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Core Positioning</span>
                          <blockquote className="border-l-2 pl-3 py-1 text-sm text-zinc-200 italic" style={{ borderColor: activeBrand.primaryColor }}>
                            "{approvalDraft.positioning.statement}"
                          </blockquote>
                          
                          {approvalDraft.positioning.differentiators?.length > 0 && (
                            <div className="pt-2 space-y-1">
                              <span className="text-[10px] text-zinc-400 block leading-tight font-medium">USPs / Differentiators</span>
                              <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1">
                                {approvalDraft.positioning.differentiators.map((diff: string, idx: number) => (
                                  <li key={idx} className="truncate">{diff}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* COLUMN 2: Voice Guidelines & Reel Rules */}
                      <div className="space-y-4">
                        
                        {/* Voice & Personality */}
                        <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Voice & Personality</span>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Formality Level</span>
                              <span className="text-xs font-semibold text-white capitalize">{approvalDraft.voice.formality}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Languages</span>
                              <span className="text-xs font-semibold text-white">{approvalDraft.voice.languages?.join(', ') || 'English'}</span>
                            </div>
                          </div>
                          
                          {approvalDraft.voice.attributes?.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Tone Attributes</span>
                              <div className="flex flex-wrap gap-1.5">
                                {approvalDraft.voice.attributes.map((attr: string) => (
                                  <span key={attr} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-zinc-300">
                                    {attr}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Products, Target Audience & CTAs */}
                        <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Offerings & CTAs</span>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Active Products</span>
                              <div className="space-y-1">
                                {approvalDraft.products?.map((p: any, idx: number) => (
                                  <span key={idx} className="block text-xs text-white font-medium truncate">{p.title}</span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Approved CTAs</span>
                              <div className="space-y-1">
                                {approvalDraft.calls_to_action?.map((c: any, idx: number) => (
                                  <span key={idx} className="block text-xs text-white font-medium truncate">{c.label}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Rules & Claims */}
                        <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                          <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Reel Guardrails & Compliance</span>
                          
                          {approvalDraft.rules.required_phrases?.length > 0 && (
                            <div>
                              <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Required Phrases</span>
                              <div className="space-y-1">
                                {approvalDraft.rules.required_phrases.map((p: string, idx: number) => (
                                  <span key={idx} className="block text-xs text-zinc-300 font-mono">• "{p}"</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {approvalDraft.rules.prohibited_phrases?.length > 0 && (
                            <div>
                              <span className="text-[10px] text-red-400 block leading-tight font-semibold">Prohibited Phrases</span>
                              <div className="space-y-1">
                                {approvalDraft.rules.prohibited_phrases.map((p: string, idx: number) => (
                                  <span key={idx} className="block text-xs text-red-300 font-mono">• "{p}"</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Creative Ancestry Ledger */}
                        <div className="p-4 bg-zinc-950/60 rounded-xl border border-white/5 text-left font-mono text-[10px] space-y-2">
                          <div className="flex justify-between text-zinc-500 uppercase border-b border-white/5 pb-1.5">
                            <span>Creative Ancestry ledger sync</span>
                            <span className="text-emerald-400">STATUS: SYNCHRONIZED</span>
                          </div>
                          <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Approval Stamp:</span> <span className="text-white">{approvalStatus.timestamp}</span></p>
                          <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Approval Record:</span> <span className="text-zinc-300 select-all">{approvalStatus.approvalId}</span></p>
                          <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Signatory:</span> <span className="text-white italic">{approvalDraft.reviewerSignature}</span></p>
                        </div>

                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Dynamic Contextual Drawer / Inspector (Right) */}
        <div className="lg:col-span-4 bg-zinc-950/80 rounded-2xl border border-white/10 p-5 space-y-5 h-full backdrop-blur">
          
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Traceability Inspector
            </span>
            <span className="text-[9px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-zinc-400 uppercase flex items-center gap-1">
              <Database className="h-3 w-3 text-zinc-500" /> Ledger: Linked
            </span>
          </div>

          {/* Render context based on current step */}
          <div className="space-y-4 text-xs text-left font-sans leading-relaxed">
            
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-900/40 rounded-xl border border-white/5 space-y-1.5">
                  <p className="font-mono text-[9px] text-zinc-500 uppercase leading-none">Status Code Check</p>
                  <p className="font-display font-medium text-white text-sm">Onboarding context verified</p>
                  <p className="text-zinc-400 text-[11px]">
                    The onboarding database is actively synchronized. These values will automatically populate future crawl structures to validate output guidelines.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <span className="block text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Workspace Context</span>
                  <div className="bg-black/40 border border-white/2 p-3 rounded-lg font-mono text-[9px] text-zinc-400 space-y-1 leading-tight">
                    <p>• brandId: <span className="text-white">{activeBrand.id}</span></p>
                    <p>• primary_market: <span className="text-white">India</span></p>
                    <p>• language_code: <span className="text-white">en-IN</span></p>
                    <p>• session_actor: <span className="text-white">Client Partner</span></p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-900/40 rounded-xl border border-white/5 space-y-1.5">
                  <p className="font-mono text-[9px] text-zinc-500 uppercase leading-none">Guardrail Verification</p>
                  <p className="font-display font-medium text-white text-sm">Lawful rights acknowledgment</p>
                  <p className="text-zinc-400 text-[11px]">
                    Submission is disabled until the rights attestation is explicitly verified. Firecrawl will follow robots.txt exclusions and limit crawl depth dynamically.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="block text-[8px] font-mono text-zinc-500 uppercase tracking-widest font-semibold text-zinc-400">Firecrawl API Specs</span>
                  <div className="bg-black/40 border border-white/2 p-3 rounded-lg font-mono text-[9px] text-zinc-400 space-y-1 leading-normal">
                    <p>• Endpoint: <span className="text-zinc-500">v3/crawl</span></p>
                    <p>• Max depth: <span className="text-white">{setupForm.maxPages} nodes</span></p>
                    <p>• Allowed paths: <span className="text-white">{setupForm.pathPrefixes.join(', ')}</span></p>
                    <p>• Rights Check: <span className={setupForm.rightsAcknowledged ? 'text-emerald-400' : 'text-red-400'}>{setupForm.rightsAcknowledged ? 'VERIFIED_OK' : 'PENDING_USER_INPUT'}</span></p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-900/40 rounded-xl border border-white/5 space-y-1.5">
                  <p className="font-mono text-[9px] text-zinc-500 uppercase leading-none">Active Polling</p>
                  <p className="font-display font-medium text-white text-sm">Handshake telemetry established</p>
                  <p className="text-zinc-400 text-[11px]">
                    The Live Scan dashboard queries the crawl run API asynchronously. No synthetic setTimeouts are applied; every status update represents actual backend responses.
                  </p>
                </div>

                {crawlRun && (
                  <div className="space-y-2 font-mono text-[9px]">
                    <span className="block text-[8px] uppercase tracking-widest text-zinc-500">Live Server Payloads</span>
                    <div className="bg-black/40 border border-white/2 p-3 rounded-lg text-zinc-400 space-y-1">
                      <p>• run_status: <span className="text-white">{crawlRun.status}</span></p>
                      <p>• progress_weight: <span className="text-white">{crawlRun.progress}%</span></p>
                      <p>• detected_schema: <span className="text-white">{detectedVertical || 'Awaiting pass...'}</span></p>
                      <p>• vertical_conflict: <span className="text-white">{selectedVertical !== detectedVertical ? 'TRUE_WARN' : 'FALSE_OK'}</span></p>
                      <p>• provider_credit_estimate: <span className="text-white">{crawlRun.providerCreditTelemetry?.estimatedCredits ?? 'unknown'}</span></p>
                      <p>• provider_credit_observed: <span className="text-white">{crawlRun.providerCreditTelemetry?.observedCredits ?? 'pending'}</span></p>
                      <p>• extraction_schema: <span className="text-white">{crawlRun.extractionSchemaVersion ?? 'unknown'}</span></p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-900/40 rounded-xl border border-white/5 space-y-1.5">
                  <p className="font-mono text-[9px] text-zinc-500 uppercase leading-none">Fact verification</p>
                  <p className="font-display font-medium text-white text-sm">Evidence-backed entries</p>
                  <p className="text-zinc-400 text-[11px]">
                    Every extracted block shows clear source references: the origin URL page, specific scraped paragraph segment, and verification timestamp.
                  </p>
                </div>

                <div className="bg-black/40 border border-white/2 p-3 rounded-lg font-mono text-[9px] text-zinc-500 space-y-1 leading-relaxed">
                  <span className="text-white font-medium block uppercase tracking-wider mb-1">Approved Dossier stats</span>
                  <p>• Active section: <span className="text-white uppercase">{activeCandidateSection}</span></p>
                  <p>• Total candidates: <span className="text-white">{candidates.length} items</span></p>
                  <p>• Approved facts: <span className="text-emerald-400">{candidates.filter(c => c.status === 'approved').length} verified</span></p>
                  <p>• Rejected facts: <span className="text-red-400">{candidates.filter(c => c.status === 'rejected').length} ignored</span></p>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-900/40 rounded-xl border border-white/5 space-y-1.5">
                  <p className="font-mono text-[9px] text-zinc-500 uppercase leading-none">Visual audit</p>
                  <p className="font-display font-medium text-white text-sm">Secure artifact caching</p>
                  <p className="text-zinc-400 text-[11px]">
                    Harvested assets are checked through security analysis and metadata matching. Exposes clean digital references under secure sandbox constraints.
                  </p>
                </div>

                <div className="bg-black/40 border border-white/2 p-3 rounded-lg font-mono text-[9px] text-zinc-500 space-y-1.5">
                  <span className="text-white font-medium block uppercase tracking-wider">Asset Registry breakdown</span>
                  <p>• Logos: <span className="text-white">{assetPack.filter(a => a.category === 'Logos').length}</span></p>
                  <p>• Screenshots: <span className="text-white">{assetPack.filter(a => a.category?.includes('Screenshots')).length}</span></p>
                  <p>• Product Images: <span className="text-white">{assetPack.filter(a => a.category?.includes('Product')).length}</span></p>
                  <p>• Lifestyle Images: <span className="text-white">{assetPack.filter(a => a.category?.includes('Lifestyle')).length}</span></p>
                </div>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-900/40 rounded-xl border border-white/5 space-y-1.5">
                  <p className="font-mono text-[9px] text-zinc-500 uppercase leading-none">Security Approval Gates</p>
                  <p className="font-display font-medium text-white text-sm">Irreversible Ledger Commit</p>
                  <p className="text-zinc-400 text-[11px]">
                    Once submitted, the approved Brand Profile is locked as version {approvalDraft.version}. The production command center downstreams will require high-impact approvals to override this.
                  </p>
                </div>

                <div className="bg-black/40 border border-white/2 p-3 rounded-lg font-mono text-[9px] text-zinc-500 space-y-1">
                  <span className="text-white font-medium block uppercase tracking-wider mb-1">Approval checklist</span>
                  <p>• Brand Name: <span className={approvalDraft.name.public ? 'text-emerald-400' : 'text-red-400'}>{approvalDraft.name.public ? 'SET' : 'MISSING'}</span></p>
                  <p>• Color Palette: <span className={approvalDraft.visual_identity.colors?.length > 0 ? 'text-emerald-400' : 'text-red-400'}>{approvalDraft.visual_identity.colors?.length > 0 ? 'SET' : 'MISSING'}</span></p>
                  <p>• Slogan Rules: <span className={approvalDraft.rules.required_phrases?.length > 0 ? 'text-emerald-400' : 'text-red-400'}>{approvalDraft.rules.required_phrases?.length > 0 ? 'SET' : 'MISSING'}</span></p>
                  <p>• Rights Checkbox: <span className={approvalDraft.rightsAttestationChecked ? 'text-emerald-400' : 'text-red-400'}>{approvalDraft.rightsAttestationChecked ? 'VERIFIED' : 'PENDING'}</span></p>
                  <p>• Reviewer Signature: <span className={approvalDraft.reviewerSignature ? 'text-emerald-400' : 'text-red-400'}>{approvalDraft.reviewerSignature ? 'SIGNED' : 'UNSIGNED'}</span></p>
                </div>
              </div>
            )}

          </div>

          {/* Persistent security metadata at bottom of drawer */}
          <div className="pt-4 border-t border-white/5 text-[9px] font-mono text-zinc-600 space-y-1 text-left leading-tight">
            <p>CRITICAL PROTOCOL: VERIFY_OK</p>
            <p>API LAYER: FIRECRAWL_V3_READY</p>
            <p>SECURE SECRETS CONTEXT ACTIVE</p>
          </div>

        </div>

      </div>

      <div className="sticky bottom-4 z-20 flex justify-end">
        <MagneticNextCue
          disabled={!canAdvanceWithNextCue}
          onClick={handleNextCue}
        />
      </div>

      </div>
    </div>
  );
}
