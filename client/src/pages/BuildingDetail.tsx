import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  BookOpen,
  Zap,
  Trash2,
  Lock,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SectionStatus, DataLifecycle, SectionType } from '@shared/types/submission.types';
import { UserRole } from '@shared/types/user.types';
import { BuildingType } from '@shared/types/building.types';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';
import Modal from '@/components/common/Modal';
import ProgressBar from '@/components/common/ProgressBar';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import { submissionsApi } from '@/features/submissions/submissionsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';
import { formatNumber } from '@/utils/formatters';
import { SubmissionDataDrawer } from '@/components/SubmissionDataDrawer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssignedMember {
  _id: string;
  name: string;
  email: string;
  department?: string;
  role?: string;
}

interface CombinedCarbonResults {
  embodiedCarbon: number;
  operationalCarbonPerYear: number;
  wasteCarbonPerYear: number;
  totalLifecycle: number;
  confidenceScore: number;
}

interface BuildingData {
  _id: string;
  name: string;
  shortName?: string;
  type: BuildingType;
  campusId?: { _id: string; slug: string; name: string; shortName?: string };
  description?: string;
  floors: number;
  totalArea?: number;
  yearBuilt?: number;
  latitude?: number;
  longitude?: number;
  assignedMembers: AssignedMember[];
  tags: string[];
  overviewStatus: string;
  civilStatus: string;
  electricalStatus: string;
  wasteStatus: string;
  overallStatus: 'not_started' | 'in_progress' | 'fully_verified' | 'partial';
  combinedCarbonResults?: CombinedCarbonResults;
  lastCarbonCalculatedAt?: string;
  electricalVersion: number;
  wasteVersion: number;
}

interface SectionSummaryItem {
  status: string;
  version: number;
  submittedBy?: { _id: string; name: string; email: string } | null;
  submissionId?: string | null;
  reviewNotes?: string | null;
  verifiedAt?: string;
  updatedAt?: string;
  canUpdate?: boolean;
}

interface SectionSummary {
  overview: SectionSummaryItem;
  civil: SectionSummaryItem;
  electrical: SectionSummaryItem;
  waste: SectionSummaryItem;
}

// ── Status badge config ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  [SectionStatus.NOT_STARTED]: {
    label: 'Not started',
    className: 'bg-white/10 text-gray-300',
  },
  [SectionStatus.DRAFT]: {
    label: 'Draft in progress',
    className: 'bg-amber-100 text-amber-700',
  },
  [SectionStatus.SUBMITTED]: {
    label: 'Awaiting review',
    className: 'bg-blue-100 text-blue-700',
  },
  [SectionStatus.UNDER_REVIEW]: {
    label: 'Under review',
    className: 'bg-purple-100 text-purple-700',
  },
  [SectionStatus.VERIFIED]: {
    label: 'Verified ✓',
    className: 'bg-green-100 text-green-700',
  },
  [SectionStatus.REVISION_REQUESTED]: {
    label: 'Revision needed',
    className: 'bg-red-100 text-red-700',
  },
};

const OVERALL_STATUS: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'info' }
> = {
  not_started: { label: 'Not started', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'warning' },
  partial: { label: 'Partial data', variant: 'info' },
  fully_verified: { label: 'All sections verified', variant: 'success' },
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function MemberAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div className="h-8 w-8 rounded-full bg-iitbhu-100 flex items-center justify-center text-iitbhu text-xs font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-white">{value ?? '—'}</p>
    </div>
  );
}

function formatDate(iso?: string | Date): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Review Modal ──────────────────────────────────────────────────────────────

interface ReviewModalProps {
  submissionId: string;
  sectionTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ReviewModal({ submissionId, sectionTitle, onClose, onSuccess }: ReviewModalProps) {
  const [revisionNotes, setRevisionNotes] = useState('');
  const [mode, setMode] = useState<'summary' | 'revision'>('summary');
  const { showSuccess, showError } = useToast();

  const { data: submissionRes, isLoading: loadingSub } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => submissionsApi.getById(submissionId),
    enabled: !!submissionId,
  });

  const { data: validateRes, isLoading: loadingValidate } = useQuery({
    queryKey: ['submission-validate', submissionId],
    queryFn: () => submissionsApi.validate(submissionId),
    enabled: !!submissionId,
  });

  const approveMutation = useMutation({
    mutationFn: () => submissionsApi.approve(submissionId),
    onSuccess: () => {
      showSuccess(`${sectionTitle} approved`);
      onSuccess();
      onClose();
    },
    onError: () => showError('Approval failed — please try again'),
  });

  const revisionMutation = useMutation({
    mutationFn: () => submissionsApi.requestRevision(submissionId, revisionNotes),
    onSuccess: () => {
      showSuccess('Revision requested');
      onSuccess();
      onClose();
    },
    onError: () => showError('Failed to request revision'),
  });

  const sub = submissionRes?.data?.data;
  const validation = validateRes?.data?.data;
  const isLoading = loadingSub || loadingValidate;

  return (
    <Modal isOpen title={`Review: ${sectionTitle}`} onClose={onClose} size="lg">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Submission meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Section</p>
              <p className="font-medium text-white mt-0.5 capitalize">{sub?.section ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Version</p>
              <p className="font-medium text-white mt-0.5">v{sub?.version ?? 1}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Entry mode</p>
              <p className="font-medium text-white mt-0.5 capitalize">
                {sub?.entryMode?.replace('_', ' ') ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Submitted</p>
              <p className="font-medium text-white mt-0.5">{formatDate(sub?.updatedAt)}</p>
            </div>
          </div>

          {/* Completeness */}
          {validation && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-gray-200">Completeness score</p>
                <span className="text-sm font-semibold text-white">
                  {validation.completenessScore ?? 0}%
                </span>
              </div>
              <ProgressBar value={validation.completenessScore ?? 0} size="sm" color="green" />
              {validation.warnings?.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {validation.warnings.map((w: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              {validation.estimatedFields?.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  {validation.estimatedFields.length} estimated field
                  {validation.estimatedFields.length !== 1 ? 's' : ''} using defaults
                </p>
              )}
            </div>
          )}

          {/* Revision notes textarea */}
          {mode === 'revision' && (
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1.5">
                Revision notes <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu resize-none"
                rows={4}
                placeholder="Describe what needs to be corrected or clarified..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-white/5">
            {mode === 'summary' ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => approveMutation.mutate()}
                  isLoading={approveMutation.isPending}
                  className="flex-1"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMode('revision')}
                  className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-50"
                >
                  Request revision
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMode('summary');
                    setRevisionNotes('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => revisionMutation.mutate()}
                  isLoading={revisionMutation.isPending}
                  disabled={!revisionNotes.trim()}
                  className="flex-1"
                >
                  Send revision request
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  buildingId: string;
  title: string;
  icon: LucideIcon;
  accentColor: 'indigo' | 'teal' | 'amber' | 'rose';
  description: string;
  section: SectionType | 'overview';
  sectionItem: SectionSummaryItem;
  lifecycle: DataLifecycle;
  canEdit: boolean;
  canReview: boolean;
  isAdmin: boolean;
  onEnterData: () => void;
  onViewResults: () => void;
  onViewData: () => void;
  onReview: () => void;
  onDiscardDraft: () => void;
  onWithdraw: () => void;
  onStartNewVersion: () => void;
  onUnlockSection: () => void;
}

const ACCENT: Record<'indigo' | 'teal' | 'amber' | 'rose', string> = {
  indigo: 'border-l-indigo-500',
  teal: 'border-l-teal-500',
  amber: 'border-l-amber-500',
  rose: 'border-l-rose-500',
};

function SectionCard({
  title,
  icon: Icon,
  accentColor,
  description,
  sectionItem,
  lifecycle,
  canEdit,
  canReview,
  isAdmin,
  onEnterData,
  onViewResults,
  onViewData,
  onReview,
  onDiscardDraft,
  onWithdraw,
  onStartNewVersion,
  onUnlockSection,
}: SectionCardProps) {
  const { status, version, submittedBy, verifiedAt, updatedAt, reviewNotes } = sectionItem;
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE[SectionStatus.NOT_STARTED];
  const isVerified = status === SectionStatus.VERIFIED;
  const isDraft = status === SectionStatus.DRAFT;
  const isSubmitted = status === SectionStatus.SUBMITTED;
  const isRevision = status === SectionStatus.REVISION_REQUESTED;
  const isStatic = lifecycle === 'static';

  return (
    <Card className={`border-l-4 ${ACCENT[accentColor]}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              accentColor === 'indigo'
                ? 'bg-indigo-50'
                : accentColor === 'teal'
                  ? 'bg-teal-50'
                  : accentColor === 'amber'
                    ? 'bg-amber-50'
                    : 'bg-rose-50'
            }`}
          >
            <Icon
              className={`h-5 w-5 ${
                accentColor === 'indigo'
                  ? 'text-indigo-600'
                  : accentColor === 'teal'
                    ? 'text-teal-600'
                    : accentColor === 'amber'
                      ? 'text-amber-600'
                      : 'text-rose-600'
              }`}
            />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mb-4">
        {submittedBy ? (
          <span>
            By <span className="font-medium text-gray-200">{submittedBy.name}</span>
          </span>
        ) : (
          <span>No data submitted yet</span>
        )}
        {lifecycle === 'dynamic' && version > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-gray-300" />
            Version {version}
          </span>
        )}
        {updatedAt && (
          <span className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-gray-300" />
            {isVerified
              ? `Verified ${formatDate(verifiedAt)}`
              : `Last updated ${formatDate(updatedAt)}`}
          </span>
        )}
        {isVerified && verifiedAt && !updatedAt && (
          <span className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-gray-300" />
            Verified {formatDate(verifiedAt)}
          </span>
        )}
      </div>

      {/* Static verified lock notice */}
      {isVerified && isStatic && (
        <div className="flex items-center gap-2 mb-4 text-xs text-gray-400 bg-white/5 rounded-lg px-3 py-2">
          <Lock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Locked — admin unlock required to edit</span>
        </div>
      )}

      {/* Revision alert */}
      {isRevision && reviewNotes && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-xs mb-0.5">Revision requested</p>
            <p className="text-xs">{reviewNotes}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/5">
        {/* NOT STARTED */}
        {status === SectionStatus.NOT_STARTED && canEdit && (
          <Button size="sm" onClick={onEnterData}>
            Start submission
          </Button>
        )}

        {/* DRAFT */}
        {isDraft && canEdit && (
          <>
            <Button size="sm" onClick={onEnterData}>
              Continue draft
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDiscardDraft}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Discard draft
            </Button>
          </>
        )}

        {/* SUBMITTED — reviewer sees review button */}
        {isSubmitted && canReview && (
          <Button
            size="sm"
            onClick={onReview}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            Review submission
          </Button>
        )}

        {/* SUBMITTED — member sees pending state + withdraw option */}
        {isSubmitted && !canReview && (
          <>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
              <Clock className="h-3 w-3" />
              Review pending
            </span>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onWithdraw}
                className="text-gray-400 hover:text-gray-200"
              >
                Withdraw & re-enter
              </Button>
            )}
          </>
        )}

        {/* UNDER_REVIEW */}
        {status === SectionStatus.UNDER_REVIEW && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
            <Clock className="h-3 w-3" />
            Under review
          </span>
        )}

        {/* VERIFIED — dynamic: re-entry allowed */}
        {isVerified && !isStatic && canEdit && (
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" variant="outline" onClick={onStartNewVersion}>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-enter data
            </Button>
            <span className="text-xs text-gray-400">
              Creates a new version — previous data preserved
            </span>
          </div>
        )}

        {/* VERIFIED — static, non-admin */}
        {isVerified && isStatic && !isAdmin && (
          <span className="text-xs text-gray-400">Locked · Contact admin to update</span>
        )}

        {/* VERIFIED — static, admin */}
        {isVerified && isStatic && isAdmin && (
          <Button size="sm" variant="ghost" onClick={onUnlockSection}>
            Unlock for editing
          </Button>
        )}

        {/* REVISION REQUESTED */}
        {isRevision && canEdit && (
          <Button size="sm" onClick={onEnterData}>
            Revise submission
          </Button>
        )}

        {/* View submitted data (read-only) — shown for verified sections */}
        {isVerified && (
          <Button size="sm" variant="ghost" onClick={onViewData} className="ml-auto">
            View submitted data
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* View carbon results — shown for submitted sections awaiting review */}
        {isSubmitted && (
          <Button size="sm" variant="ghost" onClick={onViewResults} className="ml-auto">
            View results
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── Review Panel (collapsible, reviewer/admin only) ───────────────────────────

interface ReviewPanelProps {
  buildingId: string;
  sectionSummary: SectionSummary;
  onReview: (submissionId: string, sectionTitle: string) => void;
}

const SECTION_TITLES: Record<SectionType, string> = {
  civil: 'Civil & structural',
  electrical: 'Electrical & energy',
  waste: 'Waste & sanitation',
};

function ReviewPanel({ sectionSummary, onReview }: ReviewPanelProps) {
  const [open, setOpen] = useState(true);

  const submittedSections = (['civil', 'electrical', 'waste'] as SectionType[]).filter(
    (s) => sectionSummary[s]?.status === SectionStatus.SUBMITTED
  );

  if (submittedSections.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-purple-400">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h3 className="text-base font-semibold text-white">Review panel</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {submittedSections.length} section{submittedSections.length !== 1 ? 's' : ''} awaiting
            your review
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {submittedSections.map((section) => {
            const item = sectionSummary[section];
            return (
              <div
                key={section}
                className="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-white">{SECTION_TITLES[section]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.submittedBy ? `Submitted by ${item.submittedBy.name}` : 'Submitted'} · v
                    {item.version}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    item.submissionId && onReview(item.submissionId, SECTION_TITLES[section])
                  }
                  disabled={!item.submissionId}
                >
                  Review
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Results Panel ─────────────────────────────────────────────────────────────

function ResultsPanel({
  buildingId,
  results,
}: {
  buildingId: string;
  results: CombinedCarbonResults;
}) {
  return (
    <Card className="border-l-4 border-l-green-500">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-white">Combined carbon results</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            All sections verified — full calculation available
          </p>
        </div>
        <Link
          to={`/buildings/${buildingId}/results`}
          className="flex items-center gap-1 text-sm font-medium text-iitbhu hover:underline flex-shrink-0"
        >
          View full report <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-blue-50 rounded-xl">
          <p className="text-xs text-blue-600 font-medium mb-1">Embodied</p>
          <p className="text-lg font-bold text-blue-700">{results.embodiedCarbon.toFixed(1)}</p>
          <p className="text-xs text-blue-500 mt-0.5">tCO₂e</p>
        </div>
        <div className="text-center p-3 bg-amber-50 rounded-xl">
          <p className="text-xs text-amber-600 font-medium mb-1">Operational</p>
          <p className="text-lg font-bold text-amber-700">
            {results.operationalCarbonPerYear.toFixed(1)}
          </p>
          <p className="text-xs text-amber-500 mt-0.5">tCO₂e/yr</p>
        </div>
        <div className="text-center p-3 bg-rose-50 rounded-xl">
          <p className="text-xs text-rose-600 font-medium mb-1">Waste</p>
          <p className="text-lg font-bold text-rose-700">{results.wasteCarbonPerYear.toFixed(1)}</p>
          <p className="text-xs text-rose-500 mt-0.5">tCO₂e/yr</p>
        </div>
      </div>
      {results.confidenceScore !== undefined && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Data confidence</span>
            <span className="font-medium">{Math.round(results.confidenceScore)}%</span>
          </div>
          <ProgressBar value={results.confidenceScore} size="sm" color="green" />
        </div>
      )}
    </Card>
  );
}

// ── Discard confirm modal ─────────────────────────────────────────────────────

interface DiscardModalProps {
  sectionTitle: string;
  onConfirm: () => void;
  onClose: () => void;
  isLoading: boolean;
}

function DiscardModal({ sectionTitle, onConfirm, onClose, isLoading }: DiscardModalProps) {
  return (
    <Modal isOpen title="Discard draft?" onClose={onClose} size="sm">
      <p className="text-sm text-gray-300 mb-5">
        This will permanently delete the <strong>{sectionTitle}</strong> draft. Any entered data
        will be lost.
      </p>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} isLoading={isLoading} className="flex-1">
          Discard draft
        </Button>
      </div>
    </Modal>
  );
}

// ── Unlock section modal ──────────────────────────────────────────────────────

interface UnlockModalProps {
  sectionTitle: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

function UnlockModal({ sectionTitle, onConfirm, onClose, isLoading }: UnlockModalProps) {
  const [reason, setReason] = useState('');
  return (
    <Modal isOpen title="Unlock for editing?" onClose={onClose} size="sm">
      <p className="text-sm text-gray-300 mb-3">
        Unlocking <strong>{sectionTitle}</strong> will create a new draft and allow edits. A reason
        is required.
      </p>
      <textarea
        className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu resize-none mb-4"
        rows={3}
        placeholder="Reason for unlock (e.g. major renovation, data correction)..."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-3">
        <Button variant="ghost" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => onConfirm(reason)}
          isLoading={isLoading}
          disabled={!reason.trim()}
          className="flex-1"
        >
          Unlock section
        </Button>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BuildingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  // Review modal state
  const [reviewModal, setReviewModal] = useState<{ submissionId: string; title: string } | null>(
    null
  );

  // Submission data drawer state (read-only view of verified data)
  const [viewDataDrawer, setViewDataDrawer] = useState<{
    submissionId: string;
    section: string;
    title: string;
  } | null>(null);

  // Discard draft modal state
  const [discardModal, setDiscardModal] = useState<{ submissionId: string; title: string } | null>(
    null
  );

  // Unlock section modal state
  const [unlockModal, setUnlockModal] = useState<{
    section: SectionType | 'overview';
    title: string;
  } | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const {
    data: buildingRes,
    isLoading: loadingBuilding,
    isError,
  } = useQuery({
    queryKey: ['building', id],
    queryFn: () => buildingsApi.getById(id!),
    enabled: !!id,
  });

  const { data: summaryRes, isLoading: loadingSummary } = useQuery({
    queryKey: ['section-summary', id],
    queryFn: () => buildingsApi.getSectionSummary(id!),
    enabled: !!id,
  });

  const building = buildingRes?.data?.data as BuildingData | undefined;
  const sectionSummary = summaryRes?.data?.data as SectionSummary | undefined;

  // ── Auth checks ──────────────────────────────────────────────────────────────

  const isAdmin = user?.role === UserRole.ADMIN;
  const isReviewer = user?.role === UserRole.REVIEWER || isAdmin;
  const isAssigned =
    user && building ? building.assignedMembers.some((m) => m._id === user._id) : false;
  const canEdit = user?.role !== UserRole.VIEWER && (isAssigned || isAdmin);
  const canReview = isReviewer;

  // ── Mutations ────────────────────────────────────────────────────────────────

  const discardMutation = useMutation({
    mutationFn: (submissionId: string) => submissionsApi.discardDraft(submissionId),
    onSuccess: () => {
      showSuccess('Draft discarded');
      setDiscardModal(null);
      queryClient.invalidateQueries({ queryKey: ['building', id] });
      queryClient.invalidateQueries({ queryKey: ['section-summary', id] });
    },
    onError: () => showError('Failed to discard draft'),
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ submissionId, section }: { submissionId: string; section: string }) =>
      submissionsApi.withdraw(submissionId),
    onSuccess: (_data, { section }) => {
      showSuccess('Submission withdrawn — you can now edit and re-submit');
      queryClient.invalidateQueries({ queryKey: ['building', id] });
      queryClient.invalidateQueries({ queryKey: ['section-summary', id] });
      navigate(`/buildings/${id}/entry/${section}`);
    },
    onError: () => showError('Failed to withdraw submission'),
  });

  const newVersionMutation = useMutation({
    mutationFn: (section: SectionType) => submissionsApi.startNewVersion(id!, section),
    onSuccess: (_data, section) => {
      queryClient.invalidateQueries({ queryKey: ['building', id] });
      queryClient.invalidateQueries({ queryKey: ['section-summary', id] });
      navigate(`/buildings/${id}/entry/${section}`);
    },
    onError: () => showError('Failed to start new version'),
  });

  const unlockMutation = useMutation({
    mutationFn: ({ section, reason }: { section: SectionType | 'overview'; reason: string }) =>
      submissionsApi.unlockSection(id!, section, reason),
    onSuccess: (_data, { section }) => {
      showSuccess('Section unlocked — new draft created');
      setUnlockModal(null);
      queryClient.invalidateQueries({ queryKey: ['building', id] });
      queryClient.invalidateQueries({ queryKey: ['section-summary', id] });
      navigate(`/buildings/${id}/entry/${section}`);
    },
    onError: () => showError('Failed to unlock section'),
  });

  const invalidateSummary = () => {
    queryClient.invalidateQueries({ queryKey: ['building', id] });
    queryClient.invalidateQueries({ queryKey: ['section-summary', id] });
  };

  // ── Loading / error states ───────────────────────────────────────────────────

  if (loadingBuilding || loadingSummary) {
    return (
      <PageWrapper title="Building">
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
            <div className="lg:col-span-3 space-y-4">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
            <div className="lg:col-span-2">
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (isError || !building) {
    return (
      <PageWrapper title="Building Not Found">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <EmptyState
            title="Building not found"
            description="This building may have been removed or the link is invalid."
            action={{ label: '← Back to campus', onClick: () => navigate('/campus') }}
          />
        </div>
      </PageWrapper>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const overallCfg = OVERALL_STATUS[building.overallStatus] ?? OVERALL_STATUS.not_started;

  const verifiedCount = [
    building.overviewStatus,
    building.civilStatus,
    building.electricalStatus,
    building.wasteStatus,
  ].filter((s) => s === SectionStatus.VERIFIED).length;

  const allVerified = building.overallStatus === 'fully_verified';
  const hasResults = !!building.combinedCarbonResults && allVerified;

  // Fallback empty sectionSummary when still loading or not available
  const overview: SectionSummaryItem = sectionSummary?.overview ?? {
    status: building.overviewStatus,
    version: 0,
    submittedBy: null,
    submissionId: null,
    reviewNotes: null,
  };
  const civil: SectionSummaryItem = sectionSummary?.civil ?? {
    status: building.civilStatus,
    version: 0,
    submittedBy: null,
    submissionId: null,
    reviewNotes: null,
  };
  const electrical: SectionSummaryItem = sectionSummary?.electrical ?? {
    status: building.electricalStatus,
    version: building.electricalVersion,
    submittedBy: null,
    submissionId: null,
    reviewNotes: null,
  };
  const waste: SectionSummaryItem = sectionSummary?.waste ?? {
    status: building.wasteStatus,
    version: building.wasteVersion,
    submittedBy: null,
    submissionId: null,
    reviewNotes: null,
  };

  return (
    <PageWrapper title={building.name}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4 flex-wrap">
          <Link to="/campus" className="hover:text-iitbhu transition-colors">
            Campus
          </Link>
          <span>/</span>
          {building.campusId ? (
            <>
              <Link
                to={`/campus/${building.campusId.slug}`}
                className="hover:text-iitbhu transition-colors"
              >
                {building.campusId.shortName ?? building.campusId.name}
              </Link>
              <span>/</span>
            </>
          ) : null}
          <span className="text-white font-medium truncate max-w-xs">{building.name}</span>
        </nav>

        {/* Mobile back button */}
        <button
          onClick={() =>
            navigate(building.campusId ? `/campus/${building.campusId.slug}/buildings` : '/campus')
          }
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-iitbhu mb-4 lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Back to campus buildings
        </button>

        {/* Building header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">{building.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="building-type" buildingType={building.type} label={building.type} />
            <Badge variant={overallCfg.variant} label={overallCfg.label} />
            {building.tags.map((tag) => (
              <Badge key={tag} variant={tag === 'heritage' ? 'warning' : 'default'} label={tag} />
            ))}
          </div>
          {building.description && (
            <p className="mt-3 text-gray-300 text-sm max-w-2xl">{building.description}</p>
          )}
        </div>

        {/* Hero bar — all verified */}
        {hasResults && building.combinedCarbonResults && (
          <div className="mb-6 bg-gradient-to-r from-forest to-iitbhu rounded-xl px-6 py-4 text-white">
            <div className="flex flex-wrap items-center gap-6 mb-2">
              <div>
                <p className="text-xs font-medium text-white/70 mb-0.5">Embodied</p>
                <p className="text-xl font-bold">
                  {building.combinedCarbonResults.embodiedCarbon.toFixed(1)} tCO₂e
                </p>
              </div>
              <div className="h-8 w-px bg-black/40 backdrop-blur-md/20 hidden sm:block" />
              <div>
                <p className="text-xs font-medium text-white/70 mb-0.5">Operational</p>
                <p className="text-xl font-bold">
                  {building.combinedCarbonResults.operationalCarbonPerYear.toFixed(1)} tCO₂e/yr
                </p>
              </div>
              <div className="h-8 w-px bg-black/40 backdrop-blur-md/20 hidden sm:block" />
              <div>
                <p className="text-xs font-medium text-white/70 mb-0.5">Waste</p>
                <p className="text-xl font-bold">
                  {building.combinedCarbonResults.wasteCarbonPerYear.toFixed(1)} tCO₂e/yr
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Link
                to={`/buildings/${building._id}/results`}
                className="text-xs font-medium text-white/80 hover:text-white flex items-center gap-1"
              >
                View detailed report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to={`/buildings/${building._id}/carbon`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-black/40 backdrop-blur-md/15 hover:bg-black/40 backdrop-blur-md/25 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                📊 View Carbon Results
              </Link>
            </div>
          </div>
        )}

        {/* Progress bar — not all verified */}
        {!allVerified && (
          <div className="mb-6 bg-white/5 border border-white/10 rounded-xl px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-200">Carbon calculation pending</p>
              <span className="text-sm font-semibold text-white">
                {verifiedCount} of 4 sections verified
              </span>
            </div>
            <ProgressBar value={(verifiedCount / 4) * 100} size="sm" color="green" />
            {verifiedCount > 0 && (
              <div className="mt-3">
                <Link
                  to={`/buildings/${building._id}/carbon`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 border border-white/10 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  📊 View partial carbon results ({verifiedCount} section
                  {verifiedCount > 1 ? 's' : ''} verified)
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT — section cards */}
          <div className="lg:col-span-3 space-y-5">
            <SectionCard
              buildingId={building._id}
              title="Building overview"
              icon={BookOpen}
              accentColor="indigo"
              description="Basic building information, operating hours and usage patterns"
              section="overview"
              sectionItem={overview}
              lifecycle="static"
              canEdit={canEdit}
              canReview={canReview}
              isAdmin={isAdmin}
              onEnterData={() => navigate(`/buildings/${building._id}/entry/overview`)}
              onViewResults={() =>
                navigate(
                  `/buildings/${building._id}/results${overview.submissionId ? `?submission=${overview.submissionId}` : ''}`
                )
              }
              onViewData={() =>
                overview.submissionId &&
                setViewDataDrawer({
                  submissionId: overview.submissionId,
                  section: 'overview',
                  title: 'Building Overview',
                })
              }
              onReview={() =>
                overview.submissionId &&
                setReviewModal({ submissionId: overview.submissionId, title: 'Building overview' })
              }
              onDiscardDraft={() =>
                overview.submissionId &&
                setDiscardModal({ submissionId: overview.submissionId, title: 'Building overview' })
              }
              onWithdraw={() =>
                overview.submissionId &&
                withdrawMutation.mutate({
                  submissionId: overview.submissionId,
                  section: 'overview',
                })
              }
              onStartNewVersion={() => {}}
              onUnlockSection={() =>
                setUnlockModal({ section: 'overview', title: 'Building overview' })
              }
            />

            <SectionCard
              buildingId={building._id}
              title="Civil & structural data"
              icon={Building2}
              accentColor="teal"
              description="Room layout, floor areas, furniture and construction materials"
              section="civil"
              sectionItem={civil}
              lifecycle="static"
              canEdit={canEdit}
              canReview={canReview}
              isAdmin={isAdmin}
              onEnterData={() => navigate(`/buildings/${building._id}/entry/civil`)}
              onViewResults={() =>
                navigate(
                  `/buildings/${building._id}/results${civil.submissionId ? `?submission=${civil.submissionId}` : ''}`
                )
              }
              onViewData={() =>
                civil.submissionId &&
                setViewDataDrawer({
                  submissionId: civil.submissionId,
                  section: 'civil',
                  title: 'Civil & Structural Data',
                })
              }
              onReview={() =>
                civil.submissionId &&
                setReviewModal({ submissionId: civil.submissionId, title: 'Civil & structural' })
              }
              onDiscardDraft={() =>
                civil.submissionId &&
                setDiscardModal({
                  submissionId: civil.submissionId,
                  title: 'Civil & structural data',
                })
              }
              onWithdraw={() =>
                civil.submissionId &&
                withdrawMutation.mutate({ submissionId: civil.submissionId, section: 'civil' })
              }
              onStartNewVersion={() => newVersionMutation.mutate('civil')}
              onUnlockSection={() =>
                setUnlockModal({ section: 'civil', title: 'Civil & structural data' })
              }
            />

            <SectionCard
              buildingId={building._id}
              title="Electrical & energy data"
              icon={Zap}
              accentColor="amber"
              description="Energy sources, consumption, lighting, temperature control and equipment"
              section="electrical"
              sectionItem={electrical}
              lifecycle="dynamic"
              canEdit={canEdit}
              canReview={canReview}
              isAdmin={isAdmin}
              onEnterData={() => navigate(`/buildings/${building._id}/entry/electrical`)}
              onViewResults={() =>
                navigate(
                  `/buildings/${building._id}/results${electrical.submissionId ? `?submission=${electrical.submissionId}` : ''}`
                )
              }
              onViewData={() =>
                electrical.submissionId &&
                setViewDataDrawer({
                  submissionId: electrical.submissionId,
                  section: 'electrical',
                  title: 'Electrical & Energy Data',
                })
              }
              onReview={() =>
                electrical.submissionId &&
                setReviewModal({
                  submissionId: electrical.submissionId,
                  title: 'Electrical & energy',
                })
              }
              onDiscardDraft={() =>
                electrical.submissionId &&
                setDiscardModal({
                  submissionId: electrical.submissionId,
                  title: 'Electrical & energy data',
                })
              }
              onWithdraw={() =>
                electrical.submissionId &&
                withdrawMutation.mutate({
                  submissionId: electrical.submissionId,
                  section: 'electrical',
                })
              }
              onStartNewVersion={() => newVersionMutation.mutate('electrical')}
              onUnlockSection={() =>
                setUnlockModal({ section: 'electrical', title: 'Electrical & energy data' })
              }
            />

            <SectionCard
              buildingId={building._id}
              title="Waste & sanitation data"
              icon={Trash2}
              accentColor="rose"
              description="Solid waste disposal methods and wastewater treatment"
              section="waste"
              sectionItem={waste}
              lifecycle="dynamic"
              canEdit={canEdit}
              canReview={canReview}
              isAdmin={isAdmin}
              onEnterData={() => navigate(`/buildings/${building._id}/entry/waste`)}
              onViewResults={() =>
                navigate(
                  `/buildings/${building._id}/results${waste.submissionId ? `?submission=${waste.submissionId}` : ''}`
                )
              }
              onViewData={() =>
                waste.submissionId &&
                setViewDataDrawer({
                  submissionId: waste.submissionId,
                  section: 'waste',
                  title: 'Waste & Sanitation Data',
                })
              }
              onReview={() =>
                waste.submissionId &&
                setReviewModal({ submissionId: waste.submissionId, title: 'Waste & sanitation' })
              }
              onDiscardDraft={() =>
                waste.submissionId &&
                setDiscardModal({
                  submissionId: waste.submissionId,
                  title: 'Waste & sanitation data',
                })
              }
              onWithdraw={() =>
                waste.submissionId &&
                withdrawMutation.mutate({ submissionId: waste.submissionId, section: 'waste' })
              }
              onStartNewVersion={() => newVersionMutation.mutate('waste')}
              onUnlockSection={() =>
                setUnlockModal({ section: 'waste', title: 'Waste & sanitation data' })
              }
            />

            {/* Review panel — reviewer/admin only */}
            {canReview && sectionSummary && (
              <ReviewPanel
                buildingId={building._id}
                sectionSummary={sectionSummary}
                onReview={(submissionId, title) => setReviewModal({ submissionId, title })}
              />
            )}

            {/* Results panel — only when all sections verified */}
            {hasResults && building.combinedCarbonResults && (
              <ResultsPanel buildingId={building._id} results={building.combinedCarbonResults} />
            )}
          </div>

          {/* RIGHT — building info sidebar */}
          <div className="lg:col-span-2 space-y-5 lg:sticky lg:top-6 lg:self-start">
            {/* Building info */}
            <Card>
              <h2 className="text-base font-semibold text-white mb-4">Building info</h2>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Floors" value={building.floors} />
                <InfoItem
                  label="Total area"
                  value={building.totalArea ? `${formatNumber(building.totalArea)} sqm` : undefined}
                />
                <InfoItem label="Year built" value={building.yearBuilt} />
                <InfoItem
                  label="Type"
                  value={building.type.charAt(0).toUpperCase() + building.type.slice(1)}
                />
              </div>
              {building.latitude && building.longitude && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Location</p>
                  <div className="bg-white/5 rounded-xl h-24 flex flex-col items-center justify-center text-gray-400 text-sm gap-1 border border-white/5">
                    <span className="font-medium text-sm">
                      {building.latitude.toFixed(4)}° N, {building.longitude.toFixed(4)}° E
                    </span>
                    <span className="text-xs text-gray-400">Map view coming soon</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Assigned members */}
            <Card>
              <h2 className="text-base font-semibold text-white mb-4">Assigned members</h2>
              {building.assignedMembers.length === 0 ? (
                <EmptyState title="No members assigned yet" />
              ) : (
                <div className="space-y-3">
                  {building.assignedMembers.map((member) => {
                    // Derive which sections this member has submitted/is working on
                    const memberSections: string[] = [];
                    if (sectionSummary) {
                      if (sectionSummary.civil?.submittedBy?._id === member._id)
                        memberSections.push('Civil');
                      if (sectionSummary.electrical?.submittedBy?._id === member._id)
                        memberSections.push('Electrical');
                      if (sectionSummary.waste?.submittedBy?._id === member._id)
                        memberSections.push('Waste');
                    }
                    const sectionLabel =
                      memberSections.length === 3
                        ? 'All sections'
                        : memberSections.length > 0
                          ? memberSections.join(', ')
                          : null;
                    return (
                      <div key={member._id} className="flex items-center gap-3">
                        <MemberAvatar name={member.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {member.name}
                          </p>
                          {sectionLabel ? (
                            <p className="text-xs text-indigo-600 font-medium mt-0.5">
                              {sectionLabel}
                            </p>
                          ) : member.department ? (
                            <p className="text-xs text-gray-400 truncate">{member.department}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="mt-4 block text-sm text-iitbhu hover:underline font-medium"
                >
                  Manage members →
                </Link>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {viewDataDrawer && (
        <SubmissionDataDrawer
          submissionId={viewDataDrawer.submissionId}
          section={viewDataDrawer.section}
          sectionTitle={viewDataDrawer.title}
          onClose={() => setViewDataDrawer(null)}
        />
      )}

      {reviewModal && (
        <ReviewModal
          submissionId={reviewModal.submissionId}
          sectionTitle={reviewModal.title}
          onClose={() => setReviewModal(null)}
          onSuccess={invalidateSummary}
        />
      )}

      {discardModal && (
        <DiscardModal
          sectionTitle={discardModal.title}
          onConfirm={() => discardMutation.mutate(discardModal.submissionId)}
          onClose={() => setDiscardModal(null)}
          isLoading={discardMutation.isPending}
        />
      )}

      {unlockModal && (
        <UnlockModal
          sectionTitle={unlockModal.title}
          onConfirm={(reason) => unlockMutation.mutate({ section: unlockModal.section, reason })}
          onClose={() => setUnlockModal(null)}
          isLoading={unlockMutation.isPending}
        />
      )}
    </PageWrapper>
  );
}
