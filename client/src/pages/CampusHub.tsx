import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  MapPin,
  Building2,
  Landmark,
  ChevronRight,
  Globe,
  Mail,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Badge from '@/components/common/Badge';
import Skeleton from '@/components/common/Skeleton';
import { campusApi } from '@/features/campus/campusApi';
import { membershipRequestsApi } from '@/features/membershipRequests/membershipRequestsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';
import { UserRole } from '@shared/types/user.types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampusFull {
  _id: string;
  slug: string;
  name: string;
  institution: string;
  shortName?: string;
  city: string;
  state: string;
  country: string;
  totalAreaAcres?: number;
  establishedYear?: number;
  website?: string;
  contactEmail?: string;
  description?: string;
  overviewStatus: string;
  overviewVersion: number;
  infrastructureStatus: string;
  infrastructureVersion: number;
  infrastructureAssignedMembers?: Array<{ _id: string } | string>;
  infrastructureCarbonResults?: {
    roadsEmbodiedCarbon: number;
    roadLightingCarbonPerYear: number;
    vegetationSequestrationPerYear: number;
    netCampusCarbonPerYear: number;
    confidenceScore: number;
  };
  buildingCount?: number;
  verifiedBuildingCount?: number;
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: 'default' | 'warning' | 'success' | 'error';
    icon: React.ElementType;
  }
> = {
  not_started: { label: 'Not started', variant: 'default', icon: Clock },
  draft: { label: 'Draft', variant: 'default', icon: Clock },
  submitted: { label: 'Submitted', variant: 'warning', icon: AlertCircle },
  under_review: { label: 'Under review', variant: 'warning', icon: Clock },
  verified: { label: 'Verified', variant: 'success', icon: CheckCircle },
  revision_requested: { label: 'Revision needed', variant: 'error', icon: AlertCircle },
};

// ── Section Card ──────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  status,
  version,
  accent = '#8B1A1A',
  cta,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  status: string;
  version: number;
  accent?: string;
  cta?: { label: string; onClick: () => void };
  children?: React.ReactNode;
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;
  const StatusIcon = cfg.icon;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col min-h-[200px]">
      <div className="flex items-start gap-4 flex-1">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accent}15` }}
        >
          <Icon size={20} style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {version > 0 && <span className="text-xs text-gray-400">v{version}</span>}
          </div>
          <p className="text-sm text-gray-500 mb-3">{description}</p>

          <div className="flex items-center gap-1.5 mb-3">
            <StatusIcon
              size={13}
              className={cfg.variant === 'success' ? 'text-green-600' : 'text-gray-400'}
            />
            <Badge variant={cfg.variant} label={cfg.label} className="text-xs" />
          </div>

          <div className="flex-1">{children}</div>

          {cta && (
            <button
              onClick={cta.onClick}
              className="flex items-center gap-1 text-sm font-medium text-iitbhu hover:underline mt-3"
            >
              {cta.label}
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampusHub() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { showToast } = useToast();
  const [requestSent, setRequestSent] = useState(false);
  const canEdit = user?.role === UserRole.ADMIN || user?.role === UserRole.REVIEWER;

  const requestMutation = useMutation({
    mutationFn: (campusId: string) => membershipRequestsApi.createCampusRequest(campusId),
    onSuccess: () => {
      setRequestSent(true);
      showToast({ type: 'success', message: 'Access request sent to admin' });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast({
        type: 'error',
        message: err.response?.data?.message ?? 'Failed to send request',
      });
    },
  });

  const { data: campus, isLoading } = useQuery({
    queryKey: ['campus', campusSlug],
    queryFn: () => campusApi.getBySlug(campusSlug!).then((r) => r.data.data as CampusFull),
    enabled: !!campusSlug,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <PageWrapper title="Campus">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </PageWrapper>
    );
  }

  if (!campus) {
    return (
      <PageWrapper title="Not Found">
        <div className="text-center py-24">
          <p className="text-gray-500">Campus not found.</p>
          <Link to="/campus" className="text-iitbhu text-sm mt-2 inline-block">
            ← All campuses
          </Link>
        </div>
      </PageWrapper>
    );
  }

  const buildingCount = campus.buildingCount ?? 0;
  const verifiedCount = campus.verifiedBuildingCount ?? 0;
  const coveragePct = buildingCount > 0 ? Math.round((verifiedCount / buildingCount) * 100) : 0;
  const carbonResults = campus.infrastructureCarbonResults;
  const infraVerified = campus.infrastructureStatus === 'verified';

  // Can this user edit infrastructure? Admin/reviewer always can; members if they're assigned.
  const isInfraAssigned =
    user &&
    campus.infrastructureAssignedMembers?.some((m) => {
      const id = typeof m === 'string' ? m : m._id;
      return id === user.userId;
    });
  const canEditInfra = canEdit || !!isInfraAssigned;

  // A non-admin, non-assigned, logged-in user can request access
  const canRequestInfra = !!user && !canEditInfra && user.role === UserRole.MEMBER;

  return (
    <PageWrapper title={campus.name}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        {/* ── BREADCRUMB ───────────────────────────────────────────────────── */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400">
          <Link to="/campus" className="hover:text-iitbhu transition-colors">
            Campus
          </Link>
          <span>/</span>
          <span className="text-gray-700">{campus.name}</span>
        </nav>

        {/* ── HEADER CARD ──────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-iitbhu/10 flex items-center justify-center flex-shrink-0">
              <MapPin size={24} className="text-iitbhu" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{campus.name}</h1>
              <p className="text-sm text-gray-500">{campus.institution}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                <span>
                  {campus.city}, {campus.state}, {campus.country}
                </span>
                {campus.totalAreaAcres && (
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                    {campus.totalAreaAcres.toLocaleString()} acres
                  </span>
                )}
                {campus.establishedYear && (
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                    Est. {campus.establishedYear}
                  </span>
                )}
              </div>
              {campus.description && (
                <p className="text-sm text-gray-500 mt-2">{campus.description}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-3">
                {campus.website && (
                  <a
                    href={campus.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-iitbhu hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Globe size={11} /> {campus.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {campus.contactEmail && (
                  <a
                    href={`mailto:${campus.contactEmail}`}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-iitbhu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Mail size={11} /> {campus.contactEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION CARD 1: OVERVIEW — admin/reviewer only ───────────────── */}
        {canEdit && (
          <SectionCard
            icon={MapPin}
            title="Campus overview"
            description="Basic information — name, location, area, and institutional details"
            status={campus.overviewStatus}
            version={campus.overviewVersion}
            accent="#1d4ed8"
            cta={{
              label:
                campus.overviewStatus === 'not_started' ? 'Fill overview data' : 'Edit overview',
              onClick: () => navigate(`/campus/${campusSlug}/overview/entry`),
            }}
          >
            {campus.overviewStatus === 'verified' && (
              <p className="text-xs text-gray-400">
                {[campus.city, campus.state, campus.country].filter(Boolean).join(', ')}
                {campus.totalAreaAcres ? ` · ${campus.totalAreaAcres} acres` : ''}
                {campus.establishedYear ? ` · Est. ${campus.establishedYear}` : ''}
              </p>
            )}
          </SectionCard>
        )}

        {/* ── SECTION CARDS 2 & 3: uniform grid ───────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Infrastructure */}
          <SectionCard
            icon={Landmark}
            title="Campus infrastructure"
            description="Roads, vegetation, water bodies and street lighting"
            status={campus.infrastructureStatus}
            version={campus.infrastructureVersion}
            accent="#166534"
            cta={
              canEditInfra
                ? {
                    label: 'Enter infrastructure data',
                    onClick: () => navigate(`/campus/${campusSlug}/infrastructure/entry`),
                  }
                : undefined
            }
          >
            {canRequestInfra && (
              <div className="mb-2">
                {requestSent ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                    <Clock size={12} />
                    Request pending review
                  </span>
                ) : (
                  <button
                    onClick={() => requestMutation.mutate(campus._id)}
                    disabled={requestMutation.isPending}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {requestMutation.isPending ? 'Sending…' : 'Request Access'}
                  </button>
                )}
              </div>
            )}
            {infraVerified && carbonResults && (
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>
                  Road embodied:{' '}
                  <span className="font-medium text-gray-700">
                    +{carbonResults.roadsEmbodiedCarbon.toFixed(1)} tCO₂e
                  </span>
                </div>
                <div>
                  Sequestration:{' '}
                  <span className="font-medium text-green-700">
                    {carbonResults.vegetationSequestrationPerYear.toFixed(1)} tCO₂e/yr
                  </span>
                </div>
                <div>
                  Net annual:{' '}
                  <span
                    className={`font-medium ${carbonResults.netCampusCarbonPerYear <= 0 ? 'text-green-700' : 'text-amber-700'}`}
                  >
                    {carbonResults.netCampusCarbonPerYear.toFixed(1)} tCO₂e/yr
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Buildings */}
          <SectionCard
            icon={Building2}
            title="Campus buildings"
            description="Individual buildings with civil, electrical and waste data"
            status={buildingCount > 0 ? 'draft' : 'not_started'}
            version={0}
            accent="#8B1A1A"
            cta={{
              label: 'View all buildings',
              onClick: () => navigate(`/campus/${campusSlug}/buildings`),
            }}
          >
            <p className="text-sm text-gray-600 mb-2">
              {buildingCount} building{buildingCount !== 1 ? 's' : ''}
              {verifiedCount > 0 ? ` · ${verifiedCount} fully verified` : ''}
            </p>
            {buildingCount > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Data coverage</span>
                  <span>{coveragePct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-iitbhu h-1.5 rounded-full"
                    style={{ width: `${coveragePct}%` }}
                  />
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── CAMPUS CARBON SUMMARY (infrastructure verified) ──────────────── */}
        {infraVerified && carbonResults && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Campus carbon results</h2>
            <div className="space-y-2">
              {[
                {
                  label: 'Road construction (one-time)',
                  value: `+${carbonResults.roadsEmbodiedCarbon.toFixed(1)}`,
                  unit: 'tCO₂e',
                  color: 'text-gray-700',
                },
                {
                  label: 'Road lighting (annual)',
                  value: `+${carbonResults.roadLightingCarbonPerYear.toFixed(1)}`,
                  unit: 'tCO₂e/yr',
                  color: 'text-amber-700',
                },
                {
                  label: 'Tree sequestration (annual)',
                  value: `${carbonResults.vegetationSequestrationPerYear.toFixed(1)}`,
                  unit: 'tCO₂e/yr',
                  color: 'text-green-700',
                },
              ].map(({ label, value, unit, color }) => (
                <div
                  key={label}
                  className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
                >
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className={`font-semibold ${color}`}>
                    {value} <span className="text-xs font-normal text-gray-400">{unit}</span>
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-semibold text-gray-800">Net annual impact</span>
                <span
                  className={`font-bold text-base ${carbonResults.netCampusCarbonPerYear <= 0 ? 'text-green-700' : 'text-amber-700'}`}
                >
                  {carbonResults.netCampusCarbonPerYear.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-gray-400">tCO₂e/yr</span>
                </span>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Data confidence</span>
                <span>{carbonResults.confidenceScore}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-iitbhu h-2 rounded-full"
                  style={{ width: `${carbonResults.confidenceScore}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
