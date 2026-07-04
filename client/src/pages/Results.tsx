import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  ArrowLeft,
  Lightbulb,
  Download,
  Share2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  History,
  Database,
  RefreshCw,
} from 'lucide-react';
import { UserRole } from '@shared/types/user.types';
import type {
  ICarbonResults,
  ISubmissionData,
  IStepAppliances,
  IStepEnergy,
  IStepWaste,
  WastewaterTreatmentType,
  IWasteSectionData,
} from '@shared/types/submission.types';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/common/Card';
import Skeleton from '@/components/common/Skeleton';
import ProgressBar from '@/components/common/ProgressBar';
import Button from '@/components/common/Button';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import { submissionsApi } from '@/features/submissions/submissionsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';

const FIELD_LABELS: Record<string, string> = {
  'energy.monthlyConsumptionKwh': 'Monthly electricity consumption',
  'energy.dieselLitersPerMonth': 'Monthly diesel consumption',
  'materials.furnitureDensity': 'Furniture density',
  'structure.rooms': 'Room configuration',
  'overview.totalFloorArea': 'Total floor area',
  'appliances.categories': 'Appliance inventory',
  'waste.solidWasteKgPerDay': 'Daily solid waste (estimated from occupancy)',
  'waste.wastewaterLitresPerDay': 'Daily wastewater (estimated from occupancy)',
};

const PIE_COLORS = ['#8B1A1A', '#1a3c2e', '#d97706', '#6b7280'];

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { showSuccess, showError, showInfo } = useToast();

  const submissionIdParam = searchParams.get('submission');
  const [showEstimated, setShowEstimated] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [historySection, setHistorySection] = useState<'civil' | 'electrical' | 'waste' | null>(
    null
  );

  // Fetch building only when no ?submission= param — need lastSubmissionId
  const { data: buildingRes, isLoading: isBuildingLoading } = useQuery({
    queryKey: ['building', id],
    queryFn: () => buildingsApi.getById(id!),
    enabled: !!id && !submissionIdParam,
  });

  const submissionId =
    submissionIdParam || (buildingRes?.data?.data?.lastSubmissionId as string | undefined);

  const {
    data: res,
    isLoading: isResultsLoading,
    isError,
  } = useQuery({
    queryKey: ['results', submissionId],
    queryFn: () => submissionsApi.getResults(submissionId!),
    enabled: !!submissionId,
    retry: false,
  });

  // Section summary (section versions + submittedBy/verifiedAt)
  const { data: sectionSummaryRes } = useQuery({
    queryKey: ['section-summary', id],
    queryFn: () => buildingsApi.getSectionSummary(id!),
    enabled: !!id,
  });
  const sectionSummary = sectionSummaryRes?.data?.data as
    | Record<
        string,
        {
          status: string;
          version: number;
          submittedBy?: { name: string } | null;
          verifiedAt?: string;
        }
      >
    | undefined;

  // Fetch history inline when modal opens
  const [historyData, setHistoryData] = useState<
    Array<{
      _id: string;
      version: number;
      status: string;
      submittedBy?: { name: string } | null;
      reviewedBy?: { name: string } | null;
      createdAt: string;
      reviewedAt?: string;
      reviewNotes?: string;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function openHistoryModal(section: 'civil' | 'electrical' | 'waste') {
    setHistorySection(section);
    setHistoryLoading(true);
    try {
      const response = await submissionsApi.getHistory(id!, section);
      const data = response.data?.data;
      if (Array.isArray(data)) {
        setHistoryData(data);
      }
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const isLoading = isBuildingLoading || (!!submissionId && isResultsLoading);
  const submission = res?.data?.data;
  const carbonResults = submission?.carbonResults as ICarbonResults | undefined;
  const buildingObj = submission?.buildingId as
    | { name?: string; type?: string; totalArea?: number }
    | undefined;
  const buildingName = buildingObj?.name ?? 'Building';

  // ── Reviewer mutations ───────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: (submId: string) => submissionsApi.approve(submId),
    onSuccess: () => {
      showSuccess('Submission approved successfully');
      queryClient.invalidateQueries({ queryKey: ['results', submissionId] });
    },
    onError: () => showError('Failed to approve submission'),
  });

  const requestRevisionMutation = useMutation({
    mutationFn: ({ submId, notes }: { submId: string; notes: string }) =>
      submissionsApi.requestRevision(submId, notes),
    onSuccess: () => {
      showSuccess('Revision request sent');
      setShowRevisionModal(false);
      setRevisionNotes('');
      queryClient.invalidateQueries({ queryKey: ['results', submissionId] });
    },
    onError: () => showError('Failed to request revision'),
  });

  // ── Guard states ─────────────────────────────────────────────────────────────
  if (!submissionId && !isBuildingLoading) {
    return (
      <PageWrapper title="Results">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <p className="text-lg font-semibold text-gray-200 mb-2">No submission found</p>
          <p className="text-sm text-gray-400 mb-6">
            No submissions have been approved yet for this building.
          </p>
          <button
            className="text-iitbhu underline text-sm"
            onClick={() => navigate(`/buildings/${id}`)}
          >
            Go to building
          </button>
        </div>
      </PageWrapper>
    );
  }

  if (isLoading) {
    return (
      <PageWrapper title="Results">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-16 rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (isError || !submission) {
    return (
      <PageWrapper title="Results">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
          <p className="text-lg font-semibold text-gray-200 mb-2">Could not load results</p>
          <p className="text-sm text-gray-400 mb-6">The submission may still be processing.</p>
          <button className="text-iitbhu underline text-sm" onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
      </PageWrapper>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────────
  const isVerified = submission.status === 'verified';
  const isSubmitted = submission.status === 'submitted';
  const isReviewer = user?.role === UserRole.REVIEWER || user?.role === UserRole.ADMIN;
  const canReview = isReviewer && isSubmitted;

  const confidenceScore: number = submission.confidenceScore ?? carbonResults?.confidenceScore ?? 0;
  const estimatedFields: string[] = submission.estimatedFields ?? [];
  const confidenceLabel = confidenceScore >= 80 ? 'High' : confidenceScore >= 50 ? 'Medium' : 'Low';
  const confidenceColor: 'green' | 'amber' | 'red' =
    confidenceScore >= 80 ? 'green' : confidenceScore >= 50 ? 'amber' : 'red';
  const confidenceTextColor =
    confidenceScore >= 80
      ? 'text-green-600'
      : confidenceScore >= 50
        ? 'text-amber-600'
        : 'text-red-600';

  const submissionDate = submission.createdAt
    ? new Date(submission.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const byScope = carbonResults?.breakdown?.byScope as
    | { scope1: number; scope2: number; scope3: number }
    | undefined;
  const byCategory = carbonResults?.breakdown?.byCategory as
    | {
        energy: number;
        materials: number;
        transport: number;
        waste: number;
        solidWaste: number;
        liquidWaste: number;
        evCharging?: number;
        vehicleDiesel?: number;
        vehicleKerosene?: number;
        waterTreatment?: number;
      }
    | undefined;

  const pieData = byCategory
    ? [
        { name: 'Energy', value: byCategory.energy ?? 0 },
        { name: 'Materials', value: byCategory.materials ?? 0 },
        { name: 'Transport', value: byCategory.transport ?? 0 },
        { name: 'Waste', value: byCategory.waste ?? 0 },
      ].filter((d) => d.value > 0)
    : [];

  const barData = carbonResults
    ? [
        { name: 'Embodied', value: parseFloat((carbonResults.embodiedCarbon ?? 0).toFixed(1)) },
        {
          name: 'Annual Op.',
          value: parseFloat((carbonResults.operationalCarbonPerYear ?? 0).toFixed(1)),
        },
        {
          name: '50-yr Op.',
          value: parseFloat(((carbonResults.operationalCarbonPerYear ?? 0) * 50).toFixed(1)),
        },
        { name: 'Total', value: parseFloat((carbonResults.totalLifecycle ?? 0).toFixed(1)) },
      ]
    : [];

  // ── Recommendations ──────────────────────────────────────────────────────────
  const recs: string[] = [];
  if (carbonResults) {
    const subData = submission.data as ISubmissionData | undefined;
    const energyData = subData?.energy as Partial<IStepEnergy> | undefined;
    const applianceData = subData?.appliances as Partial<IStepAppliances> | undefined;
    const wasteStepData = subData?.waste as Partial<IStepWaste> | undefined;

    if (carbonResults.operationalCarbonPerYear > 0) {
      const annual = carbonResults.operationalCarbonPerYear;
      recs.push(
        `Electricity is your largest carbon source (${annual.toFixed(1)} tCO₂e/yr). Switching to renewable energy could reduce this by up to ${(annual * 0.4).toFixed(1)} tCO₂e/yr.`
      );
    }

    const cooling = applianceData?.categories?.cooling ?? [];
    const acCount = cooling.reduce((s, a) => s + (a.count ?? 0), 0);
    if (acCount >= 3) {
      recs.push(
        `Switching ${acCount} air conditioner${acCount > 1 ? 's' : ''} to 5-star BEE-rated models could save approximately ${(acCount * 0.12).toFixed(1)} tCO₂e/yr.`
      );
    }

    const hasSolar =
      (energyData?.solarCapacityKw ?? 0) > 0 || energyData?.primarySource === 'solar';
    if (!hasSolar) {
      const area = buildingObj?.totalArea ?? 500;
      const solarKw = Math.max(5, Math.round(area / 60));
      const saving = (solarKw * 1400 * 0.00071).toFixed(1);
      recs.push(
        `Installing ${solarKw} kW of rooftop solar could offset ~${saving} tCO₂e/yr of grid electricity emissions.`
      );
    }

    // Waste-specific recommendations
    if (wasteStepData?.wasteStreams && wasteStepData.wasteStreams.length > 0) {
      const dumpStream = wasteStepData.wasteStreams.find(
        (s) => s.disposalMethod === 'unmanaged_dump' || s.disposalMethod === 'managed_landfill'
      );
      if (dumpStream && dumpStream.fractionPercent > 50) {
        const currentDumpPct = dumpStream.fractionPercent;
        const solidWasteTonnes = byCategory?.solidWaste ?? 0;
        const saving = (((solidWasteTonnes * (currentDumpPct - 50)) / 100) * (0.52 - 0.1)).toFixed(
          1
        );
        recs.push(
          `Increasing composting from current levels to 50% could reduce solid waste carbon by ~${saving} tCO₂e/yr (replacing landfill with organic treatment).`
        );
      }
    }
    if (
      wasteStepData?.wastewaterTreatmentType === ('unmanaged_septic' as WastewaterTreatmentType) &&
      (byCategory?.liquidWaste ?? 0) > 0
    ) {
      const liquidCarbon = byCategory?.liquidWaste ?? 0;
      const saving = (liquidCarbon * (1 - 0.012 / 0.068)).toFixed(1);
      recs.push(
        `Connecting to a municipal STP would reduce wastewater emissions by ~${saving} tCO₂e/yr (from ~0.068 to ~0.012 kgCO₂e/litre).`
      );
    }

    const fallbacks = [
      'Implement occupancy-based lighting controls to reduce energy waste in unoccupied spaces.',
      'Optimize HVAC scheduling to align with actual building operating hours.',
      'Consider LED retrofits for all non-LED lighting to cut lighting energy use by 50–75%.',
    ];
    while (recs.length < 3) {
      recs.push(fallbacks[recs.length % fallbacks.length]);
    }
  }

  return (
    <PageWrapper title={`${buildingName} — Carbon Results`}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate(`/buildings/${id}`)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-iitbhu mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Building
        </button>

        {carbonResults ? (
          <>
            {/* ── Hero results bar ───────────────────────────────────────────── */}
            <div className="bg-forest text-white rounded-2xl p-8 mb-6">
              <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-12">
                {/* Left */}
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-forest-50 mb-2">
                    Carbon Footprint Report
                  </p>
                  <h1 className="text-2xl font-bold text-white mb-3">{buildingName}</h1>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-forest-50">{submissionDate}</span>
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full">
                        <CheckCircle size={11} />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 bg-blue-500 text-white text-xs font-semibold rounded-full">
                        Submitted
                      </span>
                    )}
                  </div>
                </div>
                {/* Right — three large numbers */}
                <div className="flex gap-8 flex-shrink-0 flex-wrap">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-white">
                      {(carbonResults.embodiedCarbon ?? 0).toFixed(1)}
                    </p>
                    <p className="text-sm text-forest-50 mt-1">tCO₂e</p>
                    <p className="text-xs text-forest-50 opacity-70 mt-0.5">
                      Total embodied carbon
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-4xl font-bold text-white">
                      {(carbonResults.operationalCarbonPerYear ?? 0).toFixed(1)}
                    </p>
                    <p className="text-sm text-forest-50 mt-1">tCO₂e/yr</p>
                    <p className="text-xs text-forest-50 opacity-70 mt-0.5">
                      Annual operational carbon
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-4xl font-bold text-white">
                      {(carbonResults.wasteCarbonPerYear ?? 0).toFixed(1)}
                    </p>
                    <p className="text-sm text-forest-50 mt-1">tCO₂e/yr</p>
                    <p className="text-xs text-forest-50 opacity-70 mt-0.5">Annual waste carbon</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Confidence score bar ───────────────────────────────────────── */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-gray-200 flex-shrink-0">
                  Data confidence:
                </span>
                <div className="flex-1 min-w-32">
                  <ProgressBar value={confidenceScore} color={confidenceColor} size="md" />
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${confidenceTextColor}`}>
                  {confidenceScore}% — <span className="font-semibold">{confidenceLabel}</span>
                </span>
              </div>
              {estimatedFields.length > 0 && (
                <div className="mt-3">
                  <button
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    onClick={() => setShowEstimated((v) => !v)}
                  >
                    {estimatedFields.length} field{estimatedFields.length > 1 ? 's' : ''}{' '}
                    auto-estimated
                    {showEstimated ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showEstimated && (
                    <ul className="mt-2 space-y-1 pl-1">
                      {estimatedFields.map((f) => (
                        <li key={f} className="text-xs text-gray-400">
                          • {FIELD_LABELS[f] ?? f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* ── Scope breakdown ────────────────────────────────────────────── */}
            {byScope && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                {(
                  [
                    {
                      key: 'scope1' as const,
                      label: 'Scope 1',
                      sub: 'Direct — diesel',
                      color: 'text-red-700',
                      bg: 'bg-red-50 border border-red-100',
                      def: 'On-site fuel combustion and direct emissions',
                    },
                    {
                      key: 'scope2' as const,
                      label: 'Scope 2',
                      sub: 'Indirect — electricity',
                      color: 'text-amber-700',
                      bg: 'bg-amber-50 border border-amber-100',
                      def: 'Purchased grid electricity emissions',
                    },
                    {
                      key: 'scope3' as const,
                      label: 'Scope 3',
                      sub: 'Value chain — materials + waste',
                      color: 'text-blue-700',
                      bg: 'bg-blue-50 border border-blue-100',
                      def: 'Embodied carbon in materials + waste emissions (GHG Protocol Cat. 5)',
                    },
                  ] as const
                ).map(({ key, label, sub, color, bg, def }) => (
                  <div key={key} className={`rounded-xl p-4 ${bg}`}>
                    <p className={`text-xs font-bold uppercase tracking-wide ${color}`}>{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                    <p className={`text-2xl font-bold mt-2 ${color}`}>
                      {(byScope[key] ?? 0).toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-400">tCO₂e</p>
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">{def}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Scope 3 sub-breakdown ──────────────────────────────────────── */}
            {byCategory && (byCategory.materials > 0 || byCategory.waste > 0) && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 text-xs text-blue-700">
                <span className="font-semibold">Scope 3 breakdown: </span>
                Materials {(byCategory.materials ?? 0).toFixed(1)} tCO₂e
                {' · '}
                Solid waste {(byCategory.solidWaste ?? 0).toFixed(1)} tCO₂e
                {' · '}
                Liquid waste {(byCategory.liquidWaste ?? 0).toFixed(1)} tCO₂e
              </div>
            )}

            {/* ── Phase 9: Vehicle fleet Scope 1 row ─────────────────────────── */}
            {(carbonResults?.transportCarbonPerYear ?? 0) > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl mb-3">
                <div>
                  <span className="font-medium text-white text-sm">Vehicle fleet</span>
                  <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    Scope 1
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Diesel {(byCategory?.vehicleDiesel ?? 0).toFixed(2)} tCO₂e
                    {(byCategory?.vehicleKerosene ?? 0) > 0 &&
                      ` · Kerosene ${(byCategory.vehicleKerosene ?? 0).toFixed(2)} tCO₂e`}
                  </p>
                </div>
                <span className="font-semibold text-red-600">
                  {(carbonResults?.transportCarbonPerYear ?? 0).toFixed(2)} tCO₂e/yr
                </span>
              </div>
            )}

            {/* ── Phase 9: EV charging Scope 2 row ───────────────────────────── */}
            {(byCategory?.evCharging ?? 0) > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl mb-3">
                <div>
                  <span className="font-medium text-white text-sm">EV charging</span>
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Scope 2
                  </span>
                </div>
                <span className="font-semibold text-blue-600">
                  {(byCategory.evCharging ?? 0).toFixed(2)} tCO₂e/yr
                </span>
              </div>
            )}

            {/* ── Phase 6: Grid EF data source info ──────────────────────────── */}
            {carbonResults?.dataSourceInfo && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4 text-xs space-y-1">
                <p className="font-medium text-gray-200 mb-1">Data sources used in calculation</p>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Grid emission factor:</span>
                  <span
                    className={
                      carbonResults.dataSourceInfo.gridEmissionFactorSource?.includes(
                        'user_entered'
                      )
                        ? 'text-green-600 font-medium'
                        : 'text-amber-600'
                    }
                  >
                    {carbonResults.dataSourceInfo.gridEmissionFactorValue?.toFixed(3)} kgCO₂/kWh (
                    {carbonResults.dataSourceInfo.gridEmissionFactorSource?.includes('user_entered')
                      ? 'user-entered'
                      : 'CEA default'}
                    )
                    {(carbonResults.dataSourceInfo.tdLossApplied ?? 0) > 0 && (
                      <span className="text-gray-400 ml-1">
                        (+{carbonResults.dataSourceInfo.tdLossApplied}% T&D gross-up)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Transport emissions:</span>
                  <span
                    className={
                      carbonResults.dataSourceInfo.transportDataSource === 'measured'
                        ? 'text-green-600'
                        : 'text-gray-400'
                    }
                  >
                    {carbonResults.dataSourceInfo.transportDataSource === 'measured'
                      ? 'Actual fleet fuel records'
                      : 'No vehicle data entered'}
                  </span>
                </div>
              </div>
            )}

            {/* ── Waste breakdown ────────────────────────────────────────────── */}
            {(carbonResults.wasteCarbonPerYear ?? 0) > 0 &&
              (() => {
                const subWasteData = (submission.data as ISubmissionData)?.waste as
                  | IWasteSectionData
                  | undefined;
                const wwResults = subWasteData?.wastewaterCarbonResults;
                return (
                  <div className="mb-6 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-200 mb-1">
                          Solid waste carbon
                        </p>
                        <p className="text-2xl font-bold text-white">
                          {(byCategory?.solidWaste ?? 0).toFixed(2)}
                          <span className="text-sm font-normal text-gray-400 ml-1">tCO₂e/yr</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          From landfill decomposition (CH₄) and burning — Scope 3 Cat. 5
                        </p>
                      </div>
                      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-200 mb-1">
                          Liquid waste (wastewater) carbon
                        </p>
                        <p className="text-2xl font-bold text-white">
                          {(byCategory?.liquidWaste ?? 0).toFixed(2)}
                          <span className="text-sm font-normal text-gray-400 ml-1">tCO₂e/yr</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {wwResults
                            ? 'IPCC 2006 Vol. 5 Tier 1 (BOD-flow method)'
                            : '~70% CH₄ + ~30% N₂O — IPCC 2006 Tier 1'}
                        </p>
                      </div>
                    </div>

                    {/* Phase 2 IPCC Tier 1 breakdown */}
                    {wwResults && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                          <div>
                            <span className="font-medium text-white">Wastewater — CH₄</span>
                            <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              Scope 1
                            </span>
                            <span className="ml-2 text-xs text-gray-400">IPCC Tier 1</span>
                          </div>
                          <span className="font-semibold text-red-600 font-mono">
                            {wwResults.ch4AsCo2eTco2ePerYear.toFixed(2)} tCO₂e/yr
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                          <div>
                            <span className="font-medium text-white">Wastewater — N₂O</span>
                            <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              Scope 1
                            </span>
                          </div>
                          <span className="font-semibold text-red-600 font-mono">
                            {wwResults.n2oAsCo2eTco2ePerYear.toFixed(2)} tCO₂e/yr
                          </span>
                        </div>
                        {wwResults.stpScope2Tco2ePerYear > 0 && (
                          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                            <div>
                              <span className="font-medium text-white">STP electricity</span>
                              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                Scope 2
                              </span>
                            </div>
                            <span className="font-semibold text-blue-600 font-mono">
                              {wwResults.stpScope2Tco2ePerYear.toFixed(2)} tCO₂e/yr
                            </span>
                          </div>
                        )}
                        <div className="p-3 bg-white/5 rounded-lg text-xs text-gray-400">
                          <span className="font-medium">Method:</span>{' '}
                          {wwResults.calculationMethod === 'ipcc_tier1_bod_flow'
                            ? 'IPCC 2006 Vol. 5 Tier 1 (BOD × flow)'
                            : wwResults.calculationMethod === 'ipcc_tier1_flow_only'
                              ? 'IPCC 2006 Vol. 5 Tier 1 (flow only, default BOD)'
                              : 'Phase 1 simple EF'}{' '}
                          · Flow: {wwResults.inflowKldUsed} KLD · BOD: {wwResults.bodMgLUsed} mg/L ·
                          MCF: {wwResults.mcfUsed} · {wwResults.improvementNotes.join(' · ')}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* ── Water treatment carbon ─────────────────────────────────────── */}
            {(byCategory?.waterTreatment ?? 0) > 0 && (
              <div className="mb-6 space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div>
                    <span className="font-medium text-white">Water treatment</span>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Scope 2
                    </span>
                    <span className="ml-2 text-xs text-gray-400">(WTP + RO + pumping)</span>
                  </div>
                  <span className="font-semibold text-blue-600 font-mono">
                    {(byCategory.waterTreatment ?? 0).toFixed(2)} tCO₂e/yr
                  </span>
                </div>
              </div>
            )}

            {/* ── Charts ─────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Pie — Carbon by Category */}
              <Card padding="md" shadow="sm">
                <p className="text-sm font-semibold text-white mb-1">Carbon by Category</p>
                <p className="text-xs text-gray-400 mb-3">
                  Total lifecycle: {(carbonResults.totalLifecycle ?? 0).toFixed(1)} tCO₂e
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} tCO₂e`]} />
                    <Legend iconSize={10} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              {/* Bar — Lifecycle Carbon Profile */}
              <Card padding="md" shadow="sm">
                <p className="text-sm font-semibold text-white mb-4">Lifecycle Carbon Profile</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} barSize={36}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      unit=" t"
                    />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} tCO₂e`]} />
                    <Bar dataKey="value" fill="#8B1A1A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* ── Recommendations ────────────────────────────────────────────── */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6">
              <p className="text-sm font-semibold text-white mb-4">
                Top 3 Carbon Reduction Opportunities
              </p>
              <ul className="space-y-4">
                {recs.slice(0, 3).map((rec, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Lightbulb size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-200">{rec}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Renewable Energy Potential ─────────────────────────────────── */}
            {(() => {
              const subData = submission?.data as Record<string, unknown> | undefined;
              const electricalData = subData?.electrical as Record<string, unknown> | undefined;
              const assessments = (
                electricalData?.renewableAssessment as
                  | Array<{
                      id: string;
                      energySource: string;
                      estimatedInstallationCapacityKw?: number;
                      approxAnnualGenerationPotentialMwh?: number;
                      estimatedCapexLakhs?: number;
                      expectedPaybackYears?: number;
                    }>
                  | undefined
              )?.filter((a) => a.approxAnnualGenerationPotentialMwh);

              if (!assessments || assessments.length === 0) return null;

              const sourceLabel: Record<string, string> = {
                solar_pv_rooftop: 'Solar PV (Rooftop)',
                solar_pv_ground: 'Solar PV (Ground)',
                wind_turbine: 'Wind Turbine',
                geothermal: 'Geothermal',
                biomass: 'Biomass',
                small_hydro: 'Small Hydro',
                other: 'Other',
              };
              const totalMwh = assessments.reduce(
                (s, a) => s + (a.approxAnnualGenerationPotentialMwh ?? 0),
                0
              );
              const totalKw = assessments.reduce(
                (s, a) => s + (a.estimatedInstallationCapacityKw ?? 0),
                0
              );
              const totalCo2 = (totalMwh * 1000 * 0.716) / 1000;

              return (
                <div className="mt-6 mb-6">
                  <h3 className="text-base font-semibold text-white mb-3">
                    Renewable energy potential
                  </h3>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                    <p className="text-sm text-gray-300 mb-4">
                      Based on the feasibility assessment, the following renewable sources could be
                      installed:
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-green-200">
                            <th className="text-left py-2">Technology</th>
                            <th className="text-right py-2">Capacity (kW)</th>
                            <th className="text-right py-2">Annual (MWh)</th>
                            <th className="text-right py-2">CO₂ offset (tCO₂e/yr)</th>
                            <th className="text-right py-2">CAPEX (₹ Lakhs)</th>
                            <th className="text-right py-2">Payback (yr)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assessments.map((a) => (
                            <tr key={a.id} className="border-b border-green-100 last:border-0">
                              <td className="py-2 font-medium text-gray-100">
                                {sourceLabel[a.energySource] ?? a.energySource}
                              </td>
                              <td className="text-right py-2 text-gray-200">
                                {a.estimatedInstallationCapacityKw?.toLocaleString() ?? '—'}
                              </td>
                              <td className="text-right py-2 text-gray-200">
                                {a.approxAnnualGenerationPotentialMwh?.toLocaleString() ?? '—'}
                              </td>
                              <td className="text-right py-2 text-green-700 font-medium">
                                −
                                {(
                                  ((a.approxAnnualGenerationPotentialMwh ?? 0) * 1000 * 0.716) /
                                  1000
                                ).toFixed(1)}
                              </td>
                              <td className="text-right py-2 text-gray-200">
                                {a.estimatedCapexLakhs ?? '—'}
                              </td>
                              <td className="text-right py-2 text-gray-200">
                                {a.expectedPaybackYears ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-semibold text-green-900 border-t border-green-200">
                            <td className="pt-3">Total potential</td>
                            <td className="text-right pt-3">{totalKw.toLocaleString()} kW</td>
                            <td className="text-right pt-3">{totalMwh.toLocaleString()} MWh</td>
                            <td className="text-right pt-3 text-green-700">
                              −{totalCo2.toFixed(1)} tCO₂e/yr
                            </td>
                            <td className="text-right pt-3">—</td>
                            <td className="text-right pt-3">—</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Actions ────────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => showInfo('PDF report generation coming in Phase 7')}
              >
                <Download size={16} className="mr-1.5" />
                Download PDF Report
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const rows = [
                    ['Field', 'Value', 'Unit'],
                    ['Building', buildingName, ''],
                    ['Submission Date', submissionDate, ''],
                    ['Embodied Carbon', (carbonResults.embodiedCarbon ?? 0).toFixed(3), 'tCO2e'],
                    [
                      'Annual Operational Carbon',
                      (carbonResults.operationalCarbonPerYear ?? 0).toFixed(3),
                      'tCO2e/yr',
                    ],
                    [
                      'Annual Waste Carbon',
                      (carbonResults.wasteCarbonPerYear ?? 0).toFixed(3),
                      'tCO2e/yr',
                    ],
                    ['Solid Waste Carbon', (byCategory?.solidWaste ?? 0).toFixed(3), 'tCO2e/yr'],
                    ['Liquid Waste Carbon', (byCategory?.liquidWaste ?? 0).toFixed(3), 'tCO2e/yr'],
                    ['Total Lifecycle (50yr)', (carbonResults.totalLifecycle ?? 0).toFixed(3), 'tCO2e'],
                    ['Scope 1', (byScope?.scope1 ?? 0).toFixed(3), 'tCO2e'],
                    ['Scope 2', (byScope?.scope2 ?? 0).toFixed(3), 'tCO2e'],
                    ['Scope 3', (byScope?.scope3 ?? 0).toFixed(3), 'tCO2e'],
                    ['Confidence Score', (carbonResults.confidenceScore ?? 0).toString(), '%'],
                  ];
                  const csv = rows.map((r) => r.join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${buildingName.replace(/\s+/g, '_')}_carbon_results.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={16} className="mr-1.5" />
                Export CSV
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  showSuccess('Link copied!');
                }}
              >
                <Share2 size={16} className="mr-1.5" />
                Share this report
              </Button>
              {canReview && (
                <>
                  <Button
                    variant="primary"
                    className="bg-green-600 hover:bg-green-700 border-green-600 focus:ring-green-500"
                    onClick={() => approveMutation.mutate(submission._id)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle size={16} className="mr-1.5" />
                    {approveMutation.isPending ? 'Approving…' : 'Approve Submission'}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-amber-500 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                    onClick={() => setShowRevisionModal(true)}
                  >
                    Request Revision
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          /* ── Pending review state ──────────────────────────────────────────── */
          <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-16 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-400 mb-4" />
            <p className="text-lg font-semibold text-gray-200 mb-2">Results pending review</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Your submission is under review. Carbon results will appear here once the reviewer has
              verified your data.
            </p>
          </div>
        )}
      </div>

      {/* ── Raw Data ──────────────────────────────────────────────────────────── */}
      {submission?.data && (
        <div className="max-w-5xl mx-auto px-4 pb-8">
          <Card padding="md" shadow="sm">
            <div className="flex items-center gap-2 mb-4">
              <Database size={16} className="text-gray-400" />
              <p className="text-sm font-semibold text-white">Submitted Data</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4 overflow-x-auto text-xs font-mono text-gray-200 max-h-96">
              <pre>{JSON.stringify(submission.data, null, 2)}</pre>
            </div>
          </Card>
        </div>
      )}

      {/* ── Data sources card ──────────────────────────────────────────────────── */}
      {sectionSummary && (
        <div className="max-w-5xl mx-auto px-4 pb-8">
          <Card padding="md" shadow="sm">
            <div className="flex items-center gap-2 mb-4">
              <Database size={16} className="text-gray-400" />
              <p className="text-sm font-semibold text-white">Data Sources</p>
            </div>
            <div className="space-y-3">
              {(['civil', 'electrical', 'waste'] as const).map((section) => {
                const info = sectionSummary[section];
                if (!info) return null;
                const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
                const verifiedDate = info.verifiedAt
                  ? new Date(info.verifiedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : null;
                const byName = info.submittedBy?.name ?? 'Unknown';
                return (
                  <div
                    key={section}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 border-b border-white/5 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
                        {sectionLabel}
                      </span>
                      <span className="text-sm text-gray-200">
                        Version {info.version ?? 1}
                        {verifiedDate ? (
                          <>
                            , verified by <span className="font-medium">{byName}</span> on{' '}
                            {verifiedDate}
                          </>
                        ) : (
                          <>
                            {' '}
                            — submitted by <span className="font-medium">{byName}</span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {(info.version ?? 1) > 1 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <RefreshCw size={12} />
                          Updated {(info.version ?? 1) - 1} time{(info.version ?? 1) > 2 ? 's' : ''}
                        </span>
                      )}
                      <button
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                        onClick={() => openHistoryModal(section)}
                      >
                        <History size={12} />
                        View history
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Revision modal ──────────────────────────────────────────────────────── */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Request Revision</h3>
              <button
                onClick={() => {
                  setShowRevisionModal(false);
                  setRevisionNotes('');
                }}
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Describe the changes needed for this submission.
            </p>
            <textarea
              className="w-full border border-white/20 rounded-lg p-3 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-iitbhu focus:border-iitbhu"
              rows={4}
              placeholder="Enter review notes…"
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
            />
            <div className="flex gap-2 mt-4">
              <button
                className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-sm font-medium text-gray-200 hover:bg-white/5 transition-colors"
                onClick={() => {
                  setShowRevisionModal(false);
                  setRevisionNotes('');
                }}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                onClick={() =>
                  requestRevisionMutation.mutate({ submId: submission._id, notes: revisionNotes })
                }
                disabled={!revisionNotes.trim() || requestRevisionMutation.isPending}
              >
                {requestRevisionMutation.isPending ? 'Submitting…' : 'Submit Notes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Version history modal ───────────────────────────────────────────────── */}
      {historySection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                <h3 className="text-base font-semibold text-white capitalize">
                  {historySection} — Version History
                </h3>
              </div>
              <button
                onClick={() => {
                  setHistorySection(null);
                  setHistoryData([]);
                }}
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                  ))}
                </div>
              ) : historyData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No history available.</p>
              ) : (
                <ol className="relative border-l border-white/10 space-y-6 pl-4">
                  {historyData.map((entry, i) => {
                    const isLatest = i === 0;
                    const statusColor =
                      entry.status === 'verified'
                        ? 'bg-green-500'
                        : entry.status === 'submitted'
                          ? 'bg-blue-500'
                          : entry.status === 'revision_requested'
                            ? 'bg-amber-500'
                            : 'bg-gray-400';
                    const createdDate = new Date(entry.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });
                    const reviewedDate = entry.reviewedAt
                      ? new Date(entry.reviewedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : null;
                    return (
                      <li key={entry._id} className="relative">
                        {/* Timeline dot */}
                        <span
                          className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${statusColor}`}
                        />
                        <div
                          className={`rounded-xl p-4 border ${isLatest ? 'border-indigo-200 bg-indigo-50' : 'border-white/5 bg-white/5'}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className={`text-sm font-semibold ${isLatest ? 'text-indigo-800' : 'text-gray-100'}`}
                            >
                              Version {entry.version}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                entry.status === 'verified'
                                  ? 'bg-green-100 text-green-700'
                                  : entry.status === 'submitted'
                                    ? 'bg-blue-100 text-blue-700'
                                    : entry.status === 'revision_requested'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-white/10 text-gray-300'
                              }`}
                            >
                              {entry.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            Submitted by{' '}
                            <span className="font-medium text-gray-200">
                              {entry.submittedBy?.name ?? 'Unknown'}
                            </span>{' '}
                            on {createdDate}
                          </p>
                          {entry.reviewedBy && reviewedDate && (
                            <p className="text-xs text-gray-400 mt-1">
                              Reviewed by{' '}
                              <span className="font-medium text-gray-200">
                                {entry.reviewedBy.name}
                              </span>{' '}
                              on {reviewedDate}
                            </p>
                          )}
                          {entry.reviewNotes && (
                            <p className="text-xs text-amber-700 mt-2 bg-amber-50 rounded px-2 py-1">
                              Notes: {entry.reviewNotes}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
