import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  CheckCircle,
  Clock,
  AlertCircle,
  Leaf,
  Droplets,
  Route,
  ChevronRight,
  ThumbsUp,
  RotateCcw,
} from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Badge from '@/components/common/Badge';
import Skeleton from '@/components/common/Skeleton';
import { campusApi } from '@/features/campus/campusApi';
import { useAuthStore } from '@/features/auth/authStore';
import { UserRole } from '@shared/types/user.types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampusRecord {
  status:
    | 'not_started'
    | 'draft'
    | 'submitted'
    | 'under_review'
    | 'verified'
    | 'revision_requested';
  version: number;
  campusName: string;
  institution: string;
  totalCampusAreaAcres?: number;
  updatedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  submittedBy?: { name: string; email: string };
  reviewedBy?: { name: string; email: string };
  reviewNotes?: string;
  data?: {
    roads: {
      segments: Array<{ lengthM: number; widthM: number; isPaved?: boolean }>;
      hasStreetLighting?: boolean;
      streetLightCount?: number;
    };
    vegetation: {
      categories: Array<{ numberOfTrees?: number; areaAcres?: number; categoryType: string }>;
      hasHeritageTrees?: boolean;
    };
    waterBodies: {
      waterBodies: Array<{
        category: string;
        surfaceAreaAcres?: number;
        lengthM?: number;
        widthM?: number;
      }>;
    };
  };
  carbonResults?: {
    roadsEmbodiedCarbon: number;
    roadLightingCarbonPerYear: number;
    vegetationSequestrationPerYear: number;
    netCampusCarbonPerYear: number;
    confidenceScore: number;
  };
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  not_started: { label: 'Not started', variant: 'default' as const, icon: Clock },
  draft: { label: 'Draft', variant: 'default' as const, icon: Clock },
  submitted: { label: 'Submitted', variant: 'warning' as const, icon: AlertCircle },
  under_review: { label: 'Under review', variant: 'warning' as const, icon: Clock },
  verified: { label: 'Verified', variant: 'success' as const, icon: CheckCircle },
  revision_requested: { label: 'Revision needed', variant: 'error' as const, icon: AlertCircle },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ElementType;
  title: string;
  items: Array<{ label: string; value: string | number }>;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-iitbhu" />
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map(({ label, value }) => (
          <li key={label} className="flex justify-between text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-gray-800">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampusOverview() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [revisionNotes, setRevisionNotes] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  const isPrivileged = user?.role === UserRole.ADMIN || user?.role === UserRole.REVIEWER;

  const { data, isLoading } = useQuery({
    queryKey: ['campus', 'record'],
    queryFn: async () => {
      const res = await campusApi.getRecord();
      return res.data?.data as CampusRecord | null;
    },
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: () => campusApi.approve(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campus'] }),
  });

  const revisionMutation = useMutation({
    mutationFn: (notes: string) => campusApi.requestRevision(notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus'] });
      setShowRevisionForm(false);
      setRevisionNotes('');
    },
  });

  const newVersionMutation = useMutation({
    mutationFn: () => campusApi.startNewVersion(),
    onSuccess: () => navigate('/campus/entry'),
  });

  if (isLoading) {
    return (
      <PageWrapper title="Campus Data">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  const record = data;
  const status = record?.status ?? 'not_started';
  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;
  const hasData = record && record.status !== 'not_started';
  const isVerified = status === 'verified';
  const isSubmitted = status === 'submitted';

  // Derived data summaries
  const segments = record?.data?.roads?.segments ?? [];
  const totalRoadLength = segments.reduce((a, s) => a + (s.lengthM ?? 0), 0);
  const pavedArea = segments
    .filter((s) => s.isPaved)
    .reduce((a, s) => a + (s.lengthM ?? 0) * (s.widthM ?? 0), 0);

  const categories = record?.data?.vegetation?.categories ?? [];
  const totalTrees = categories.reduce((a, c) => a + (c.numberOfTrees ?? 0), 0);
  const totalVegArea = categories.reduce((a, c) => a + (c.areaAcres ?? 0), 0);

  const waterBodies = record?.data?.waterBodies?.waterBodies ?? [];
  const totalWaterArea = waterBodies.reduce((a, w) => {
    if (w.surfaceAreaAcres) return a + w.surfaceAreaAcres;
    if (w.lengthM && w.widthM) return a + (w.lengthM * w.widthM) / 4047;
    return a;
  }, 0);
  const canalCount = waterBodies.filter((w) => w.category === 'canal').length;
  const lakeCount = waterBodies.filter((w) => w.category === 'lake_pond').length;

  return (
    <PageWrapper title="Campus Data">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* ── TOP CARD ───────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-forest/10 flex items-center justify-center flex-shrink-0">
                <MapPin size={24} className="text-forest" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {record?.campusName ?? 'IIT BHU Campus'}
                </h1>
                <p className="text-sm text-gray-500">
                  {record?.institution ?? 'IIT (BHU) Varanasi'}
                  {record?.totalCampusAreaAcres ? ` · ${record.totalCampusAreaAcres} acres` : ''}
                </p>
                {record?.version && record.version > 1 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Version {record.version} — updated {record.version - 1} time
                    {record.version > 2 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <StatusIcon size={14} className={isVerified ? 'text-green-600' : 'text-gray-500'} />
                <Badge variant={statusCfg.variant} label={statusCfg.label} />
              </div>
            </div>
          </div>

          {/* Submission meta */}
          {record?.submittedAt && (
            <p className="text-xs text-gray-400 mt-4">
              Submitted{' '}
              {new Date(record.submittedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              {record.submittedBy ? ` by ${record.submittedBy.name}` : ''}
            </p>
          )}
          {isVerified && record?.reviewedAt && (
            <p className="text-xs text-green-600 mt-1">
              Verified{' '}
              {new Date(record.reviewedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              {record.reviewedBy ? ` by ${record.reviewedBy.name}` : ''}
            </p>
          )}
          {record?.reviewNotes && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <span className="font-medium">Revision notes: </span>
              {record.reviewNotes}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            {!hasData && isPrivileged && (
              <button
                onClick={() => navigate('/campus/entry')}
                className="flex items-center gap-1.5 text-sm font-medium bg-iitbhu text-white px-4 py-2 rounded-lg hover:bg-iitbhu-dark transition-colors"
              >
                Enter campus data
                <ChevronRight size={14} />
              </button>
            )}
            {hasData && !isVerified && isPrivileged && (
              <button
                onClick={() => navigate('/campus/entry')}
                className="flex items-center gap-1.5 text-sm font-medium bg-iitbhu text-white px-4 py-2 rounded-lg hover:bg-iitbhu-dark transition-colors"
              >
                Continue editing
                <ChevronRight size={14} />
              </button>
            )}
            {isVerified && isPrivileged && (
              <button
                onClick={() => newVersionMutation.mutate()}
                disabled={newVersionMutation.isPending}
                className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={14} />
                Update data
              </button>
            )}
          </div>
        </div>

        {/* ── SUMMARY CARDS (when data is present) ───────────────────────── */}
        {hasData && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              icon={Route}
              title="Road infrastructure"
              items={[
                { label: 'Total road length', value: `${totalRoadLength.toFixed(0)} m` },
                { label: 'Paved area', value: `${pavedArea.toFixed(0)} m²` },
                { label: 'Segments', value: segments.length },
              ]}
            />
            <SummaryCard
              icon={Leaf}
              title="Vegetation & greenery"
              items={[
                { label: 'Total trees', value: totalTrees.toLocaleString() },
                { label: 'Green area', value: `${totalVegArea.toFixed(1)} acres` },
                {
                  label: 'Sequestration',
                  value: record?.carbonResults?.vegetationSequestrationPerYear
                    ? `${record.carbonResults.vegetationSequestrationPerYear.toFixed(1)} tCO₂e/yr`
                    : '—',
                },
              ]}
            />
            <SummaryCard
              icon={Droplets}
              title="Water bodies"
              items={[
                { label: 'Total water area', value: `${totalWaterArea.toFixed(1)} acres` },
                { label: 'Canals', value: canalCount },
                { label: 'Lakes / Ponds', value: lakeCount },
              ]}
            />
          </div>
        )}

        {/* ── CARBON RESULTS (verified only) ─────────────────────────────── */}
        {isVerified && record?.carbonResults && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Verified campus carbon results
            </h2>
            <div className="space-y-3">
              {[
                {
                  label: 'Road embodied carbon (one-time construction)',
                  value: `+${record.carbonResults.roadsEmbodiedCarbon.toFixed(1)}`,
                  unit: 'tCO₂e',
                  color: 'text-gray-700',
                },
                {
                  label: 'Annual road lighting',
                  value: `+${record.carbonResults.roadLightingCarbonPerYear.toFixed(1)}`,
                  unit: 'tCO₂e/yr',
                  color: 'text-amber-700',
                },
                {
                  label: 'Annual tree sequestration',
                  value: `${record.carbonResults.vegetationSequestrationPerYear.toFixed(1)}`,
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
                <span className="text-sm font-semibold text-gray-800">
                  Net annual campus impact
                </span>
                <span
                  className={`font-bold text-base ${
                    record.carbonResults.netCampusCarbonPerYear <= 0
                      ? 'text-green-700'
                      : 'text-amber-700'
                  }`}
                >
                  {record.carbonResults.netCampusCarbonPerYear.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-gray-400">tCO₂e/yr</span>
                </span>
              </div>
            </div>
            {/* Confidence */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Data confidence</span>
                <span>{record.carbonResults.confidenceScore}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-iitbhu h-2 rounded-full transition-all"
                  style={{ width: `${record.carbonResults.confidenceScore}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── REVIEW PANEL (admin/reviewer when submitted) ────────────────── */}
        {isPrivileged && isSubmitted && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-amber-800 mb-3">Review campus data</h2>
            <p className="text-sm text-amber-700 mb-4">
              Campus data has been submitted for review. Approve to verify or request a revision.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="flex items-center gap-1.5 text-sm font-medium bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition-colors disabled:opacity-50"
              >
                <ThumbsUp size={14} />
                Approve
              </button>
              <button
                onClick={() => setShowRevisionForm((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium border border-amber-400 text-amber-700 px-4 py-2 rounded-lg hover:bg-amber-100 transition-colors"
              >
                Request revision
              </button>
            </div>
            {showRevisionForm && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="Describe what needs to be corrected…"
                  rows={3}
                  className="w-full border border-amber-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  onClick={() => revisionMutation.mutate(revisionNotes)}
                  disabled={!revisionNotes.trim() || revisionMutation.isPending}
                  className="text-sm font-medium bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  Send revision request
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── EMPTY STATE ─────────────────────────────────────────────────── */}
        {!hasData && !isPrivileged && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <MapPin size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium mb-1">Campus data is being collected</p>
            <p className="text-sm text-gray-400">
              Outdoor infrastructure data (roads, vegetation, water bodies) will appear here once
              submitted by campus administrators.
            </p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
