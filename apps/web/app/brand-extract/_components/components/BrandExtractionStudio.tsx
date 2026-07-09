"use client";

import { useState, useEffect } from 'react';
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
  buildApprovalDraftFromCandidates,
  type UiCandidate
} from '../candidate-adapter';
import { createGeneratedWorkflowClient, makeIdempotencyKey } from '../../../../src/workflow/v0-actions';

interface BrandExtractionStudioProps {
  activeBrand: BrandData;
  onUpdateBrandData: (updated: BrandData) => void;
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

export default function BrandExtractionStudio({ activeBrand, onUpdateBrandData, onProceedWorkflow }: BrandExtractionStudioProps) {
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
  const [readinessScore, setReadinessScore] = useState<number>(78);
  const [basisBreakdown, setBasisBreakdown] = useState<any>({ identity: 80, visuals: 70, copy: 80, proof: 80 });
  const [dossierFilter, setDossierFilter] = useState<'all' | 'approved' | 'rejected' | 'conflict' | 'low-confidence'>('all');
  const [activeCandidateSection, setActiveCandidateSection] = useState<string>('identity');
  const [selectedCandidateForEvidence, setSelectedCandidateForEvidence] = useState<any | null>(null);
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Record<string, boolean>>({});

  // STEP 5 State: Asset Pack
  const [assetPack, setAssetPack] = useState<any[]>([]);

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
      layout_rules: ''
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
    hash: string | null;
    version: string | null;
  }>({ submitted: false, timestamp: null, hash: null, version: null });

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
    setApprovalStatus({ submitted: false, timestamp: null, hash: null, version: null });
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
          sha256
        },
        { idempotencyKey: makeIdempotencyKey('brand-asset-upload') }
      );
      const initiatedBody = initiated.body as any;
      if (initiated.status >= 400 || !initiatedBody?.artifact?.id) {
        throw new Error(initiatedBody?.detail || initiatedBody?.title || 'Asset upload initiation failed.');
      }
      const artifactId = initiatedBody.artifact.id;
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
        if (apiContext.source === 'local-demo' && body?.job?.id) {
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
          setDetectedVertical(adapted.detectedBrandType || setupForm.brandType);
          setCandidates(adapted.candidates);
          setAssetPack(adapted.assetPack);
          setReadinessScore(adapted.readinessScore);
          setBasisBreakdown(adapted.basisBreakdown);
          
          // Auto resolve conflict choice if matching
          if ((adapted.detectedBrandType || setupForm.brandType) === setupForm.brandType) {
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

  // Approve/Reject candidates
  const handleUpdateCandidateStatus = async (candidateId: string, status: 'approved' | 'rejected') => {
    // Optimistically update
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, status } : c));
    
    if (crawlRunId) {
      try {
        await fetch(`/api/brand-crawl-run/${crawlRunId}/candidates/${candidateId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
      } catch (err) {
        // Safe console fail, state is updated locally
      }
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

      setApprovalDraft(draft);
    }
  }, [currentStep]);

  // Submit final approval
  const handleApproveProfile = async () => {
    if (!approvalDraft.rightsAttestationChecked) {
      setApiError('You must check and confirm the rights attestation to lock in approval.');
      return;
    }

    setLoading(true);
    setApiError(null);

    const payload = {
      ...approvalDraft,
      version: approvalDraft.version,
      approvedBy: 'Client Manager (' + onboardingForm.brandName.trim() + ' Host)',
      timestamp: new Date().toISOString()
    };

    try {
      const res = await fetch(`/api/brands/${activeBrand.id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setApprovalStatus({
          submitted: true,
          timestamp: json.data.approvedAt,
          hash: json.data.approvalHash,
          version: json.data.version
        });

        // Trigger parent state update to reflect approved brand data
        onUpdateBrandData({
          ...activeBrand,
          name: approvalDraft.name.public,
          niche: approvalDraft.products[0]?.title || activeBrand.niche,
          guidelines: [
            ...approvalDraft.rules.required_phrases,
            ...approvalDraft.rules.prohibited_phrases.map((p: string) => `PROHIBITED: Do not use "${p}"`)
          ],
          reviewItem: {
            version: 'v' + json.data.version + ' (Approved)',
            thumbnailUrl: activeBrand.reviewItem.thumbnailUrl,
            comments: [
              { user: 'Forge System', text: 'Brand extraction approved and synchronized with Creative Ancestry.', time: 'Just now' }
            ],
            status: 'Approved',
            hash: json.data.approvalHash
          }
        });
      } else {
        setApiError(json.error || 'Failed to submit final profile approval.');
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to submit final profile approval.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle single evidence accordion
  const toggleEvidenceExpanded = (id: string) => {
    setExpandedEvidenceIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-6 lg:py-8 flex flex-col space-y-6" id="brand-extraction-studio-core">
      
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
                      <span className="text-[10px] font-mono text-zinc-400 uppercase">Field Evidence items</span>
                      
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
                                      className={`px-2 py-1 rounded transition-colors ${
                                        isRejected ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-transparent'
                                      }`}
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => handleUpdateCandidateStatus(cand.id, 'approved')}
                                      className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                                        isApproved ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-transparent'
                                      }`}
                                    >
                                      {isApproved && <Check className="h-3.5 w-3.5" />} Approve
                                    </button>
                                  </div>
                                </div>

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
                                  ) : cand.fieldType === 'rights_asset' && typeof cand.value === 'object' && cand.value !== null ? (
                                    <div className="grid grid-cols-3 gap-2">
                                      {[cand.value as any].map((img: any, i: number) => (
                                        <div key={i} className="relative rounded overflow-hidden border border-white/10 group bg-zinc-950">
                                          <img src={img.locator} alt={img.type ?? 'Brand asset'} className="h-14 w-full object-cover" referrerPolicy="no-referrer" />
                                          <div className="absolute inset-0 bg-black/40 flex items-end p-1">
                                            <span className="text-[8px] font-mono text-white truncate">{img.type ?? 'Asset'}</span>
                                          </div>
                                        </div>
                                      ))}
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

                {assetPack.length === 0 ? (
                  <div className="py-16 text-center space-y-4 rounded-xl border border-dashed border-white/10 bg-zinc-950/20 max-w-lg mx-auto">
                    <UploadCloud className="h-10 w-10 text-zinc-600 mx-auto" />
                    <div className="space-y-1">
                      <p className="font-mono text-sm text-zinc-400">No assets were extracted yet</p>
                      <p className="text-xs text-zinc-500">Provide direct uploads or run depth crawls to harvest high-resolution visual anchors.</p>
                    </div>
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-xs font-mono text-white border border-white/10"
                    >
                      Return to Crawl Setup
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {assetPack.map((asset) => (
                      <div
                        key={asset.id}
                        className="group bg-zinc-900/60 rounded-xl border border-white/5 overflow-hidden transition-all duration-300 hover:border-white/10 flex flex-col justify-between"
                      >
                        {/* Thumbnail / image placeholder */}
                        <div className="relative h-28 bg-zinc-950 flex items-center justify-center overflow-hidden">
                          <img
                            src={asset.locator}
                            alt={asset.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur border border-white/10 text-[8px] font-mono text-zinc-400">
                            {asset.category}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="p-3 space-y-1.5 text-left font-mono text-[9px] leading-tight border-t border-white/5">
                          <p className="text-white font-sans font-medium truncate text-[10px]">{asset.name}</p>
                          <p className="text-zinc-500">BASIS: <span className="text-zinc-300">{asset.rightsBasis}</span></p>
                          <p className="text-zinc-500">USE: <span className="text-zinc-300">{asset.permittedUse}</span></p>
                          
                          <div className="pt-2 flex justify-between items-center text-[8px]">
                            <span className="text-emerald-400 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 uppercase font-semibold">
                              CLEAN
                            </span>
                            <a
                              href={asset.locator}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-500 hover:text-white flex items-center gap-1 font-mono"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
                    Verify and modify approved fields prior to cryptographic lineage commitment. Once approved, downstream video generators refer exclusively to these parameters.
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
                        disabled={loading || !approvalDraft.rightsAttestationChecked || !approvalDraft.reviewerSignature || !approvalDraft.name.public}
                        className="px-6 py-2.5 rounded-lg text-xs font-mono tracking-wider uppercase font-semibold text-black transition-all hover:opacity-90 disabled:opacity-30 flex items-center gap-1.5 shadow"
                        style={{ backgroundColor: activeBrand.primaryColor }}
                        id="submit-final-approval-btn"
                      >
                        {loading ? 'Submitting approval...' : 'Submit Brand Approval'} <CheckCircle className="h-4 w-4" />
                      </button>
                    </div>

                  </div>
                ) : (
                  // Approval Success Card
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 text-center space-y-6 max-w-lg mx-auto"
                  >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <CheckCircle2 className="h-8 w-8 animate-pulse" />
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xl font-display font-medium text-white">Brand Profile Approved & Synchronized</h4>
                      <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
                        The approved parameters for <strong className="text-white">{approvalDraft.name.public}</strong> have been cryptographically bound as version <strong className="text-white">v{approvalStatus.version}</strong>.
                      </p>
                    </div>

                    {/* Evidence Sync Card */}
                    <div className="p-4 bg-zinc-950/60 rounded-xl border border-white/5 text-left font-mono text-[10px] space-y-2 max-w-md mx-auto">
                      <div className="flex justify-between text-zinc-500 uppercase border-b border-white/5 pb-1.5">
                        <span>Creative Ancestry ledger sync</span>
                        <span className="text-emerald-400">STATUS: OK</span>
                      </div>
                      <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Approval Stamp:</span> <span className="text-white">{approvalStatus.timestamp}</span></p>
                      <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Cryptographic Hash:</span> <span className="text-zinc-300 select-all">{approvalStatus.hash}</span></p>
                      <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Signatory:</span> <span className="text-white italic">{approvalDraft.reviewerSignature}</span></p>
                    </div>

                    <div className="pt-4 flex gap-4 justify-center">
                      <button
                        onClick={() => {
                          setApprovalStatus({ submitted: false, timestamp: null, hash: null, version: null });
                          setApprovalDraft(prev => ({ ...prev, rightsAttestationChecked: false, reviewerSignature: '' }));
                          setCurrentStep(1);
                        }}
                        className="px-4 py-2.5 rounded-lg border border-white/10 bg-white/2 hover:bg-white/5 text-xs font-mono text-zinc-300 hover:text-white"
                      >
                        Recrawl Brand Website
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

    </div>
  );
}
