import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Users,
  Building2,
  FileText,
  Zap,
  BarChart3,
  CheckCircle,
  UserCheck,
  Search,
  ExternalLink,
  Plus,
  Inbox,
  Lock,
  Unlock,
  Globe,
  Trash2,
} from 'lucide-react';
import { submissionsApi } from '@/features/submissions/submissionsApi';
import { SectionType } from '@shared/types/submission.types';
import { BuildingType } from '@shared/types/building.types';
import { UserRole } from '@shared/types/user.types';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import Skeleton from '@/components/common/Skeleton';
import Modal from '@/components/common/Modal';
import { adminApi } from '@/features/admin/adminApi';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';
import { DataReviewPanel } from '@/components/admin/DataReviewPanel';
import { EmissionFactorsPanel } from '@/components/admin/EmissionFactorsPanel';
import { CampusCarbonPanel } from '@/components/admin/CampusCarbonPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ICampusWithStats {
  _id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  buildingCount: number;
  pendingCount: number;
  overviewStatus: string;
  infrastructureStatus: string;
  isActive: boolean;
}

interface ISectionCell {
  status: string;
  version?: number;
  submissionId?: string;
}

interface IBuildingWithMatrix {
  _id: string;
  name: string;
  type: string;
  floors: number;
  totalArea?: number;
  carbonTotalPerYear?: number | null;
  sectionMatrix: {
    overview: ISectionCell;
    civil: ISectionCell;
    electrical: ISectionCell;
    waste: ISectionCell;
  };
}

interface IPendingSubmission {
  _id: string;
  buildingId: { _id: string; name: string; type: string; campusId: unknown } | null;
  section: string;
  version: number;
  submittedAt?: string;
  createdAt: string;
  completionScore?: number;
  estimatedFields?: string[];
  status: string;
}

interface ICampusStats {
  totalBuildings: number;
  verifiedBuildings: number;
  pendingReview: number;
  carbon: { total: number; scope1: number; scope2: number };
}

interface AdminStats {
  totalUsers: number;
  submissionsByStatus: Record<string, number>;
  buildingsWithoutMembers: number;
  recentLogs: AuditLogEntry[];
}

interface AuditLogEntry {
  _id: string;
  action: string;
  entityType: string;
  performedBy?: { name: string; email: string };
  changes?: Record<string, unknown>;
  timestamp: string;
}

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  createdAt: string;
  assignedBuildings: string[];
}

interface BuildingRow {
  _id: string;
  name: string;
  shortName?: string;
  type: string;
  submissionStatus: string;
  assignedMembers: Array<{ _id: string; name: string; email: string }>;
  overviewStatus?: string;
  civilStatus?: string;
  electricalStatus?: string;
  wasteStatus?: string;
  electricalVersion?: number;
  wasteVersion?: number;
}

interface SubmissionRow {
  _id: string;
  buildingId: { _id: string; name: string; shortName?: string } | null;
  submittedBy: { name: string; email: string } | null;
  status: string;
  section?: string;
  version?: number;
  confidenceScore: number;
  updatedAt: string;
}

interface MembershipRequestRow {
  _id: string;
  userId: { _id: string; name: string; email: string; department?: string } | null;
  targetType?: string;
  buildingId?: { _id: string; name: string; shortName?: string; type: string } | null;
  campusId?: { _id: string; name: string; slug: string; institution: string } | null;
  status: string;
  message?: string;
  reviewedBy?: { name: string; email: string } | null;
  reviewedAt?: string;
  createdAt: string;
}

type CampusTab = 'overview' | 'buildings' | 'pending' | 'reports' | 'carbon';
type SystemTab = 'stats' | 'submissions' | 'users' | 'requests' | 'factors' | 'locks';
type ViewMode = 'all_campuses' | 'campus' | 'system';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    verified: 'bg-green-100 text-green-700',
    submitted: 'bg-blue-100 text-blue-700',
    under_review: 'bg-purple-100 text-purple-700',
    revision_requested: 'bg-amber-100 text-amber-700',
    draft: 'bg-gray-100 text-gray-600',
    not_started: 'bg-gray-100 text-gray-500',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function roleBadge(role: UserRole) {
  const map: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'bg-red-100 text-red-700',
    [UserRole.REVIEWER]: 'bg-purple-100 text-purple-700',
    [UserRole.MEMBER]: 'bg-blue-100 text-blue-700',
    [UserRole.VIEWER]: 'bg-gray-100 text-gray-600',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[role] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {role}
    </span>
  );
}

// ── Stat card helper ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 ${highlight ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'}`}
    >
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Section status colours ────────────────────────────────────────────────────

const CELL_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-400',
  draft: 'bg-blue-100 text-blue-600',
  submitted: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300',
  verified: 'bg-green-100 text-green-700',
  revision_requested: 'bg-red-100 text-red-600',
};
const CELL_LABELS: Record<string, string> = {
  not_started: '—',
  draft: 'Draft',
  submitted: 'Review ★',
  verified: 'Verified',
  revision_requested: 'Revision',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  // ── Navigation state ──────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('all_campuses');
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CampusTab>('overview');
  const [systemTab, setSystemTab] = useState<SystemTab>('stats');
  const [reviewPanel, setReviewPanel] = useState<{
    buildingId: string;
    buildingName: string;
    initialSection?: string;
  } | null>(null);

  const openReviewPanel = (building: any, sectionOrSubmission: any) => {
    const initialSection =
      typeof sectionOrSubmission === 'string' ? sectionOrSubmission : sectionOrSubmission.section;
    const buildingId = String(building._id ?? building.id ?? '');
    if (!buildingId) return;
    setReviewPanel({ buildingId, buildingName: building.name, initialSection });
  };

  // ── Campus data state ─────────────────────────────────────────────────────
  const [campuses, setCampuses] = useState<ICampusWithStats[]>([]);
  const [buildings, setBuildings] = useState<IBuildingWithMatrix[]>([]);
  const [pendingQueue, setPendingQueue] = useState<IPendingSubmission[]>([]);
  const [campusStats, setCampusStats] = useState<ICampusStats | null>(null);
  const [campusLoading, setCampusLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleReviewComplete = useCallback(() => {
    if (!selectedCampusId) return;
    adminApi
      .getCampusBuildings(selectedCampusId, { search: searchQuery || undefined })
      .then((res) => setBuildings(res.data?.data?.buildings ?? []));
    adminApi
      .getCampusPendingQueue(selectedCampusId)
      .then((res) => setPendingQueue(res.data?.data?.pending ?? []));
    adminApi.getCampuses().then((r) => setCampuses(r.data?.data?.campuses ?? []));
  }, [selectedCampusId, searchQuery]);

  // ── Create building modal state ───────────────────────────────────────────
  const [showCreateBuilding, setShowCreateBuilding] = useState(false);
  const [newBuildingForm, setNewBuildingForm] = useState({
    name: '',
    shortName: '',
    type: BuildingType.ACADEMIC,
    description: '',
    floors: '1',
    totalArea: '',
    yearBuilt: '',
    campusId: '',
  });

  // ── Navigation helpers ────────────────────────────────────────────────────
  const selectCampus = useCallback((campusId: string) => {
    setSelectedCampusId(campusId);
    setViewMode('campus');
    setActiveTab('overview');
    setSearchQuery('');
    setCampusStats(null);
    setBuildings([]);
    setPendingQueue([]);
  }, []);

  const selectAllCampuses = useCallback(() => {
    setSelectedCampusId(null);
    setViewMode('all_campuses');
  }, []);

  const selectSystem = useCallback((tab: SystemTab) => {
    setSelectedCampusId(null);
    setViewMode('system');
    setSystemTab(tab);
  }, []);

  // ── Fetch campuses on mount ────────────────────────────────────────────────
  useEffect(() => {
    adminApi
      .getCampuses()
      .then((r) => setCampuses(r.data?.data?.campuses ?? []))
      .catch(() => {});
  }, []);

  // ── Fetch campus-scoped data on campus/tab/search change ──────────────────
  useEffect(() => {
    if (!selectedCampusId || viewMode !== 'campus') return;
    setCampusLoading(true);

    const fetchAll = async () => {
      try {
        if (activeTab === 'overview') {
          const [statsRes, buildingsRes] = await Promise.all([
            adminApi.getCampusStats(selectedCampusId),
            adminApi.getCampusBuildings(selectedCampusId),
          ]);
          setCampusStats(statsRes.data?.data ?? null);
          setBuildings(buildingsRes.data?.data?.buildings ?? []);
        } else if (activeTab === 'buildings') {
          const res = await adminApi.getCampusBuildings(selectedCampusId, {
            search: searchQuery || undefined,
          });
          setBuildings(res.data?.data?.buildings ?? []);
        } else if (activeTab === 'pending') {
          const res = await adminApi.getCampusPendingQueue(selectedCampusId);
          setPendingQueue(res.data?.data?.pending ?? []);
        }
      } finally {
        setCampusLoading(false);
      }
    };

    fetchAll();
  }, [selectedCampusId, activeTab, searchQuery, viewMode]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedCampus = campuses.find((c) => c._id === selectedCampusId);

  const openCreateBuildingModal = useCallback((campusId: string | null) => {
    setNewBuildingForm({
      name: '',
      shortName: '',
      type: BuildingType.ACADEMIC,
      description: '',
      floors: '1',
      totalArea: '',
      yearBuilt: '',
      campusId: campusId ?? '',
    });
    setShowCreateBuilding(true);
  }, []);

  const createBuildingMutation = useMutation({
    mutationFn: (form: typeof newBuildingForm) => {
      if (!form.campusId) throw new Error('Campus is required');
      return adminApi.createBuilding({
        name: form.name.trim(),
        shortName: form.shortName.trim() || undefined,
        type: form.type,
        description: form.description.trim() || undefined,
        floors: parseInt(form.floors) || 1,
        totalArea: form.totalArea ? parseFloat(form.totalArea) : undefined,
        yearBuilt: form.yearBuilt ? parseInt(form.yearBuilt) : undefined,
        ...(form.campusId ? { campusId: form.campusId } : {}),
      } as Parameters<typeof adminApi.createBuilding>[0]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'buildings'] });
      showToast({ type: 'success', message: 'Building created successfully' });
      setShowCreateBuilding(false);
      // Refresh campus buildings list, stats, and sidebar counts
      if (selectedCampusId) {
        adminApi
          .getCampusBuildings(selectedCampusId)
          .then((r) => setBuildings(r.data?.data?.buildings ?? []));
        adminApi.getCampusStats(selectedCampusId).then((r) => setCampusStats(r.data?.data ?? null));
      }
      adminApi.getCampuses().then((r) => setCampuses(r.data?.data?.campuses ?? []));
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      showToast({
        type: 'error',
        message: err.response?.data?.message ?? err.message ?? 'Failed to create building',
      });
    },
  });

  // ── Delete building ───────────────────────────────────────────────────────
  const [buildingToDelete, setBuildingToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const deleteBuildingMutation = useMutation({
    mutationFn: (buildingId: string) => adminApi.deleteBuilding(buildingId),
    onSuccess: (_data, buildingId) => {
      showToast({ type: 'success', message: 'Building deleted' });
      setBuildingToDelete(null);
      setBuildings((prev) => prev.filter((b) => b._id !== buildingId));
      if (selectedCampusId) {
        adminApi
          .getCampusBuildings(selectedCampusId, { search: searchQuery || undefined })
          .then((r) => setBuildings(r.data?.data?.buildings ?? []));
        adminApi.getCampusStats(selectedCampusId).then((r) => setCampusStats(r.data?.data ?? null));
      }
      adminApi.getCampuses().then((r) => setCampuses(r.data?.data?.campuses ?? []));
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      showToast({
        type: 'error',
        message: err.response?.data?.message ?? err.message ?? 'Failed to delete building',
      });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageWrapper title="Admin Panel">
      <div className="flex" style={{ height: 'calc(100vh - 4rem)' }}>
        {/* ── CAMPUS SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 border-r border-gray-100 flex flex-col h-full bg-white overflow-y-auto">
          {/* Brand */}
          <div className="p-4 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">Admin panel</h2>
            <p className="text-xs text-gray-500 mt-0.5">CarbonTrack IIT BHU</p>
          </div>

          {/* Campus nav */}
          <div className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-2 pt-1">
              Campuses
            </p>

            {/* All campuses */}
            <button
              onClick={selectAllCampuses}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${
                viewMode === 'all_campuses'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Globe size={15} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div>All campuses</div>
                <div className="text-xs text-gray-400 mt-0.5 font-normal">
                  {campuses.reduce((s, c) => s + c.buildingCount, 0)} buildings total
                </div>
              </div>
            </button>

            {/* Individual campus items */}
            {campuses.map((campus) => (
              <button
                key={campus._id}
                onClick={() => selectCampus(campus._id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${
                  selectedCampusId === campus._id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Building2 size={15} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{campus.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 font-normal">
                    {campus.buildingCount} buildings
                  </div>
                </div>
                {campus.pendingCount > 0 && (
                  <span className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                    {campus.pendingCount}
                  </span>
                )}
              </button>
            ))}

            {/* Add campus */}
            <button
              onClick={() => navigate('/campus')}
              className="w-full flex items-center gap-2 px-3 py-2 mt-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <Plus size={14} /> Manage campuses
            </button>

            {/* System section */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-2">
                System
              </p>
              {(
                [
                  { id: 'stats', label: 'Overview', icon: BarChart3 },
                  { id: 'submissions', label: 'Submissions', icon: FileText },
                  { id: 'users', label: 'Users', icon: Users },
                  { id: 'requests', label: 'Requests', icon: Inbox },
                  { id: 'factors', label: 'Emission Factors', icon: Zap },
                  { id: 'locks', label: 'Static Locks', icon: Lock },
                ] as { id: SystemTab; label: string; icon: React.ElementType }[]
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => selectSystem(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                    viewMode === 'system' && systemTab === id
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={14} className="flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* User info */}
          <div className="p-3 border-t border-gray-100 flex-shrink-0">
            <div className="text-xs font-medium text-gray-700 truncate">{user?.email}</div>
            <div className="text-xs text-gray-400 mt-0.5 capitalize">{user?.role}</div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {viewMode === 'all_campuses' && (
            <AllCampusesView campuses={campuses} onSelectCampus={selectCampus} />
          )}

          {viewMode === 'campus' && selectedCampus && (
            <CampusView
              campus={selectedCampus}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              buildings={buildings}
              pendingQueue={pendingQueue}
              campusStats={campusStats}
              loading={campusLoading}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onAddBuilding={() => openCreateBuildingModal(selectedCampusId)}
              onOpenReview={openReviewPanel}
              onDeleteBuilding={(id, name) => setBuildingToDelete({ id, name })}
            />
          )}

          {viewMode === 'system' && (
            <SystemView tab={systemTab} showToast={showToast} qc={qc} navigate={navigate} />
          )}
        </div>
      </div>

      {/* ── Data Review Panel ───────────────────────────────────────────────── */}
      {reviewPanel && (
        <DataReviewPanel
          buildingId={reviewPanel.buildingId}
          buildingName={reviewPanel.buildingName}
          initialSection={reviewPanel.initialSection}
          onClose={() => setReviewPanel(null)}
          onReviewComplete={handleReviewComplete}
        />
      )}

      {/* ── Create Building Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={showCreateBuilding}
        onClose={() => setShowCreateBuilding(false)}
        title="Add New Building"
        size="lg"
      >
        <div className="space-y-4">
          {/* Campus field */}
          {newBuildingForm.campusId ? (
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-500">Campus:</span>
              <span className="font-medium text-gray-900 ml-1.5">
                {campuses.find((c) => c._id === newBuildingForm.campusId)?.name ?? '—'}
              </span>
              <span className="text-xs text-gray-400 ml-1">(from current view)</span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Campus <span className="text-red-500">*</span>
              </label>
              <select
                value={newBuildingForm.campusId}
                onChange={(e) => setNewBuildingForm((f) => ({ ...f, campusId: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Select a campus…</option>
                {campuses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newBuildingForm.name}
                onChange={(e) => setNewBuildingForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Lecture Hall Complex"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Short Name
              </label>
              <input
                type="text"
                value={newBuildingForm.shortName}
                onChange={(e) => setNewBuildingForm((f) => ({ ...f, shortName: e.target.value }))}
                placeholder="e.g. LHC"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={newBuildingForm.type}
                onChange={(e) => setNewBuildingForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {Object.values(BuildingType).map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Floors <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={newBuildingForm.floors}
                onChange={(e) => setNewBuildingForm((f) => ({ ...f, floors: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Total Area (sqm)
              </label>
              <input
                type="number"
                min={0}
                value={newBuildingForm.totalArea}
                onChange={(e) => setNewBuildingForm((f) => ({ ...f, totalArea: e.target.value }))}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Year Built
              </label>
              <input
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                value={newBuildingForm.yearBuilt}
                onChange={(e) => setNewBuildingForm((f) => ({ ...f, yearBuilt: e.target.value }))}
                placeholder="e.g. 1998"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {!newBuildingForm.campusId && (
            <p className="text-xs text-red-500">
              Please select a campus before creating a building.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreateBuilding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              isLoading={createBuildingMutation.isPending}
              disabled={
                !newBuildingForm.name.trim() || !newBuildingForm.floors || !newBuildingForm.campusId
              }
              onClick={() => createBuildingMutation.mutate(newBuildingForm)}
            >
              Create Building
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Building Confirmation Modal ─────────────────────────────── */}
      <Modal
        isOpen={!!buildingToDelete}
        onClose={() => setBuildingToDelete(null)}
        title="Delete building?"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-5">
          This will permanently delete{' '}
          <strong className="text-gray-900">{buildingToDelete?.name}</strong> and all its associated
          submissions. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setBuildingToDelete(null)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
            isLoading={deleteBuildingMutation.isPending}
            onClick={() => buildingToDelete && deleteBuildingMutation.mutate(buildingToDelete.id)}
          >
            Delete building
          </Button>
        </div>
      </Modal>
    </PageWrapper>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// All Campuses View
// ══════════════════════════════════════════════════════════════════════════════

function AllCampusesView({
  campuses,
  onSelectCampus,
}: {
  campuses: ICampusWithStats[];
  onSelectCampus: (id: string) => void;
}) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">All campuses</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Select a campus to view buildings, pending reviews, and carbon stats
        </p>
      </div>

      {campuses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Globe size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No campuses found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campuses.map((campus) => (
            <button
              key={campus._id}
              onClick={() => onSelectCampus(campus._id)}
              className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Building2 size={18} className="text-blue-600" />
                </div>
                {campus.pendingCount > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {campus.pendingCount} pending
                  </span>
                )}
              </div>
              <div className="font-semibold text-gray-900 text-sm">{campus.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {campus.city}, {campus.country}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                <span>{campus.buildingCount} buildings</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Campus View (4 tabs)
// ══════════════════════════════════════════════════════════════════════════════

function CampusView({
  campus,
  activeTab,
  setActiveTab,
  buildings,
  pendingQueue,
  campusStats,
  loading,
  searchQuery,
  setSearchQuery,
  onAddBuilding,
  onOpenReview,
  onDeleteBuilding,
}: {
  campus: ICampusWithStats;
  activeTab: CampusTab;
  setActiveTab: (tab: CampusTab) => void;
  buildings: IBuildingWithMatrix[];
  pendingQueue: IPendingSubmission[];
  campusStats: ICampusStats | null;
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddBuilding: () => void;
  onOpenReview: (building: any, sectionOrSubmission: any) => void;
  onDeleteBuilding: (id: string, name: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 pt-5 pb-0">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-900">{campus.name}</h2>
          <p className="text-xs text-gray-500">
            {campus.city}, {campus.country}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex">
          {(['overview', 'buildings', 'pending', 'reports', 'carbon'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize -mb-px ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'carbon' ? 'Carbon' : tab}
              {tab === 'pending' && pendingQueue.length > 0 && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                  {pendingQueue.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <CampusOverviewTab
                buildings={buildings}
                campusStats={campusStats}
                onOpenReview={onOpenReview}
              />
            )}
            {activeTab === 'buildings' && (
              <CampusBuildingsTab
                buildings={buildings}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onAddBuilding={onAddBuilding}
                onOpenReview={onOpenReview}
                onDeleteBuilding={onDeleteBuilding}
              />
            )}
            {activeTab === 'pending' && (
              <CampusPendingTab pendingQueue={pendingQueue} onOpenReview={onOpenReview} />
            )}
            {activeTab === 'reports' && <CampusReportsTab />}
            {activeTab === 'carbon' && <CampusCarbonPanel slug={campus.slug} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function CampusOverviewTab({
  buildings,
  campusStats,
  onOpenReview,
}: {
  buildings: IBuildingWithMatrix[];
  campusStats: ICampusStats | null;
  onOpenReview: (building: IBuildingWithMatrix, section: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total buildings" value={campusStats?.totalBuildings ?? '—'} />
        <StatCard
          label="Verified buildings"
          value={campusStats?.verifiedBuildings ?? '—'}
          sub="at least 1 section"
        />
        <StatCard
          label="Pending review"
          value={campusStats?.pendingReview ?? '—'}
          highlight={(campusStats?.pendingReview ?? 0) > 0}
        />
        <StatCard
          label="Total carbon"
          value={
            campusStats?.carbon.total != null
              ? `${campusStats.carbon.total.toFixed(0)} tCO₂e/yr`
              : '—'
          }
        />
      </div>

      {/* Section completion matrix */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Section completion matrix</h3>
          <p className="text-xs text-gray-500 mt-0.5">Click any cell to review that section</p>
        </div>
        {buildings.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No buildings in this campus yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Building</th>
                  {['Overview', 'Civil', 'Electrical', 'Waste'].map((s) => (
                    <th key={s} className="px-3 py-3 text-xs font-medium text-gray-500 text-center">
                      {s}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-center">
                    Carbon
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {buildings.map((building) => (
                  <tr key={building._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{building.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {building.type} · {building.floors} floors
                      </div>
                    </td>
                    {(['overview', 'civil', 'electrical', 'waste'] as const).map((section) => {
                      const cell = building.sectionMatrix[section];
                      return (
                        <td key={section} className="px-3 py-3 text-center">
                          <button
                            onClick={() => onOpenReview(building, section)}
                            disabled={cell.status === 'not_started'}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-opacity ${CELL_COLORS[cell.status] ?? CELL_COLORS.not_started} ${
                              cell.status !== 'not_started'
                                ? 'hover:opacity-80 cursor-pointer'
                                : 'cursor-default'
                            }`}
                          >
                            {CELL_LABELS[cell.status] ?? '—'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      {building.carbonTotalPerYear != null ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-medium">
                          {building.carbonTotalPerYear < 1
                            ? `${(building.carbonTotalPerYear * 1000).toFixed(0)} kg`
                            : `${building.carbonTotalPerYear.toFixed(1)} t`}
                          <span className="text-emerald-500 font-normal">CO₂e/yr</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Buildings tab ─────────────────────────────────────────────────────────────

function CampusBuildingsTab({
  buildings,
  searchQuery,
  setSearchQuery,
  onAddBuilding,
  onOpenReview,
  onDeleteBuilding,
}: {
  buildings: IBuildingWithMatrix[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddBuilding: () => void;
  onOpenReview: (building: IBuildingWithMatrix, section: string) => void;
  onDeleteBuilding: (id: string, name: string) => void;
}) {
  const ABBREV: Record<string, string> = {
    overview: 'OVW',
    civil: 'CIV',
    electrical: 'ELEC',
    waste: 'WST',
  };
  const CHIP_COLORS: Record<string, string> = {
    not_started: 'bg-gray-100 text-gray-400',
    draft: 'bg-blue-100 text-blue-600',
    submitted: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300',
    verified: 'bg-green-100 text-green-700',
    revision_requested: 'bg-red-100 text-red-600',
  };

  return (
    <div>
      {/* Search + add */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search buildings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <button
          onClick={onAddBuilding}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> Add building
        </button>
      </div>

      {buildings.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No buildings found</div>
      ) : (
        <div>
          {buildings.map((building) => (
            <div
              key={building._id}
              className="bg-white rounded-xl border border-gray-100 p-4 mb-3 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-gray-900">{building.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {building.type} · {building.floors} floors
                    {building.totalArea ? ` · ${building.totalArea} m²` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                  {(['overview', 'civil', 'electrical', 'waste'] as const).map((section) => {
                    const cell = building.sectionMatrix[section];
                    return (
                      <button
                        key={section}
                        onClick={() => onOpenReview(building, section)}
                        disabled={cell.status === 'not_started'}
                        className={`px-2 py-1 rounded text-xs font-medium ${CHIP_COLORS[cell.status] ?? CHIP_COLORS.not_started} ${
                          cell.status !== 'not_started'
                            ? 'hover:opacity-75 cursor-pointer'
                            : 'cursor-default'
                        }`}
                        title={`${section} — ${cell.status}`}
                      >
                        {ABBREV[section]}
                        {cell.status === 'submitted' ? ' ★' : ''}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => onDeleteBuilding(building._id, building.name)}
                    className="ml-1.5 p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete building"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pending tab ───────────────────────────────────────────────────────────────

function CampusPendingTab({
  pendingQueue,
  onOpenReview,
}: {
  pendingQueue: IPendingSubmission[];
  onOpenReview: (
    building: NonNullable<IPendingSubmission['buildingId']>,
    submission: IPendingSubmission
  ) => void;
}) {
  if (pendingQueue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <CheckCircle size={32} className="mb-3 text-green-400" />
        <div className="text-sm font-medium">All caught up</div>
        <div className="text-xs mt-1">No submissions awaiting review</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingQueue.map((submission) => {
        const submittedDate = submission.submittedAt ?? submission.createdAt;
        return (
          <div
            key={submission._id}
            className="bg-white rounded-xl border border-amber-200 p-4 hover:border-amber-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">
                    {submission.buildingId?.name ?? '—'}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize flex-shrink-0">
                    {submission.section}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">v{submission.version}</span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Submitted {formatDistanceToNow(new Date(submittedDate))} ago
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                  {submission.completionScore != null && (
                    <span>Completeness: {submission.completionScore}%</span>
                  )}
                  {(submission.estimatedFields?.length ?? 0) > 0 && (
                    <span className="text-amber-600">
                      {submission.estimatedFields!.length} estimated field(s)
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() =>
                  submission.buildingId && onOpenReview(submission.buildingId, submission)
                }
                className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Review data →
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────

function CampusReportsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <BarChart3 size={32} className="mb-3" />
      <div className="text-sm font-medium">Campus reports</div>
      <div className="text-xs mt-1">PDF and Excel export coming in a future update</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// System View (existing admin tools)
// ══════════════════════════════════════════════════════════════════════════════

function SystemView({
  tab,
  showToast,
  qc,
  navigate,
}: {
  tab: SystemTab;
  showToast: ReturnType<typeof useToast>['showToast'];
  qc: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="p-6">
      {tab === 'stats' && <OverviewTab />}
      {tab === 'submissions' && (
        <SubmissionsTab showToast={showToast} qc={qc} navigate={navigate} />
      )}
      {tab === 'users' && <UsersTab showToast={showToast} qc={qc} />}
      {tab === 'requests' && <RequestsTab showToast={showToast} qc={qc} />}
      {tab === 'factors' && <EmissionFactorsPanel />}
      {tab === 'locks' && <StaticLocksTab showToast={showToast} qc={qc} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// System — Overview
// ══════════════════════════════════════════════════════════════════════════════

function SectionMatrixCell({ status }: { status: string }) {
  const map: Record<string, string> = {
    verified: 'bg-green-100 text-green-700',
    submitted: 'bg-blue-100 text-blue-700',
    under_review: 'bg-purple-100 text-purple-700',
    revision_requested: 'bg-amber-100 text-amber-700',
    draft: 'bg-gray-100 text-gray-600',
    not_started: 'bg-gray-50 text-gray-400',
  };
  const short: Record<string, string> = {
    verified: '✓',
    submitted: 'Sub',
    under_review: 'Rev',
    revision_requested: 'Req',
    draft: 'Dft',
    not_started: '—',
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-6 rounded text-xs font-medium ${map[status] ?? 'bg-gray-50 text-gray-400'}`}
    >
      {short[status] ?? '—'}
    </span>
  );
}

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.getStats(),
  });

  const { data: buildingsData } = useQuery({
    queryKey: ['admin', 'buildings'],
    queryFn: () => buildingsApi.getAll({ limit: 100 }),
  });

  const stats = data?.data?.data as AdminStats | undefined;
  const allBuildings: BuildingRow[] = buildingsData?.data?.data ?? [];

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers ?? 0, color: 'text-blue-600 bg-blue-50' },
    {
      label: 'Verified Submissions',
      value: stats?.submissionsByStatus?.verified ?? 0,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Pending Review',
      value: stats?.submissionsByStatus?.submitted ?? 0,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Buildings w/o Members',
      value: stats?.buildingsWithoutMembers ?? 0,
      color: 'text-red-600 bg-red-50',
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-900">System overview</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, color }) => (
          <Card key={label} padding="md">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
              )}
              <div
                className={`mt-1 w-8 h-8 rounded-lg ${color} flex items-center justify-center`}
              />
            </div>
          </Card>
        ))}
      </div>

      {stats?.submissionsByStatus && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Submissions by Status</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.submissionsByStatus).map(([s, count]) => (
              <div key={s} className="flex items-center gap-2">
                {statusBadge(s)}
                <span className="text-sm font-semibold text-gray-700">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {allBuildings.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Section Completion Matrix</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['Building', 'Overview', 'Civil', 'Electrical', 'Waste', 'Combined'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {allBuildings.map((b) => (
                  <tr key={b._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{b.name}</p>
                      {b.shortName && <p className="text-gray-400">{b.shortName}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <SectionMatrixCell status={b.overviewStatus ?? 'not_started'} />
                    </td>
                    <td className="px-3 py-2">
                      <SectionMatrixCell status={b.civilStatus ?? 'not_started'} />
                    </td>
                    <td className="px-3 py-2">
                      <SectionMatrixCell status={b.electricalStatus ?? 'not_started'} />
                    </td>
                    <td className="px-3 py-2">
                      <SectionMatrixCell status={b.wasteStatus ?? 'not_started'} />
                    </td>
                    <td className="px-3 py-2">
                      <SectionMatrixCell
                        status={
                          b.submissionStatus === 'fully_verified'
                            ? 'verified'
                            : (b.submissionStatus ?? 'not_started')
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card padding="md">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (stats?.recentLogs?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400">No audit logs yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats!.recentLogs.map((log) => (
              <div key={log._id} className="py-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {log.action.replace(/\./g, ' › ')}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {log.performedBy
                      ? `${log.performedBy.name} (${log.performedBy.email})`
                      : 'System'}
                  </p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                  {new Date(log.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// System — Requests
// ══════════════════════════════════════════════════════════════════════════════

function RequestsTab({
  showToast,
  qc,
}: {
  showToast: ReturnType<typeof useToast>['showToast'];
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [statusFilter, setStatusFilter] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'membership-requests', statusFilter],
    queryFn: () =>
      adminApi.listMembershipRequests({ status: statusFilter || undefined, limit: 50 }),
  });

  const requests: MembershipRequestRow[] = data?.data?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveMembershipRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'membership-requests'] });
      showToast({ type: 'success', message: 'Request approved — user assigned' });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast({ type: 'error', message: err.response?.data?.message ?? 'Failed to approve' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => adminApi.rejectMembershipRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'membership-requests'] });
      showToast({ type: 'success', message: 'Request rejected' });
    },
    onError: () => showToast({ type: 'error', message: 'Failed to reject' }),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Membership Requests</h2>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Filter:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['User', 'Target', 'Message', 'Date', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    No requests found.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{r.userId?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{r.userId?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.targetType === 'campus_infrastructure' ? (
                        <>
                          <p className="text-sm font-medium text-gray-900">
                            {r.campusId?.name ?? '—'}
                          </p>
                          <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium mt-0.5">
                            Campus infra
                          </span>
                        </>
                      ) : (
                        <p className="text-sm font-medium text-gray-900">
                          {r.buildingId?.name ?? '—'}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
                      <span className="line-clamp-2">
                        {r.message || <span className="italic text-gray-300">No message</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          r.status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : r.status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => approveMutation.mutate(r._id)}
                            disabled={approveMutation.isPending}
                            className="text-xs font-medium text-green-600 hover:text-green-800 hover:bg-green-50 px-2 py-1 rounded-lg transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(r._id)}
                            disabled={rejectMutation.isPending}
                            className="text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString() : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 4 — Submissions
// ══════════════════════════════════════════════════════════════════════════════

function SubmissionsTab({
  showToast,
  qc,
  navigate,
}: {
  showToast: ReturnType<typeof useToast>['showToast'];
  qc: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [statusFilter, setStatusFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [revisionModal, setRevisionModal] = useState<{ id: string; buildingName: string } | null>(
    null
  );
  const [revisionNotes, setRevisionNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'submissions', statusFilter, sectionFilter],
    queryFn: () =>
      adminApi.listSubmissions({
        status: statusFilter || undefined,
        section: sectionFilter || undefined,
        limit: 50,
      }),
  });

  const submissions: SubmissionRow[] = data?.data?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveSubmission(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'submissions'] });
      showToast({ type: 'success', message: 'Submission approved' });
    },
    onError: () => showToast({ type: 'error', message: 'Failed to approve' }),
  });

  const revisionMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      adminApi.requestRevision(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'submissions'] });
      showToast({ type: 'success', message: 'Revision requested' });
      setRevisionModal(null);
      setRevisionNotes('');
    },
    onError: () => showToast({ type: 'error', message: 'Failed to request revision' }),
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-iitbhu/20 focus:border-iitbhu"
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="verified">Verified</option>
            <option value="revision_requested">Revision Requested</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Section:</label>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-iitbhu/20 focus:border-iitbhu"
          >
            <option value="">All</option>
            <option value="overview">Overview</option>
            <option value="civil">Civil</option>
            <option value="electrical">Electrical</option>
            <option value="waste">Waste</option>
          </select>
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {[
                  'Building',
                  'Section',
                  'Submitted By',
                  'Date',
                  'Status',
                  'Confidence',
                  'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : submissions.map((s) => (
                    <tr key={s._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {s.buildingId?.name ?? '—'}
                        {s.buildingId?.shortName && (
                          <p className="text-xs text-gray-400">{s.buildingId.shortName}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.section && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize bg-indigo-50 text-indigo-700">
                            {s.section}
                          </span>
                        )}
                        {(s.version ?? 1) > 1 && (
                          <span className="ml-1 text-xs text-gray-400">v{s.version}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{s.submittedBy?.name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{s.submittedBy?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(s.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">{statusBadge(s.status)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {s.confidenceScore != null ? `${Math.round(s.confidenceScore)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {s.buildingId && (
                            <button
                              onClick={() =>
                                navigate(
                                  `/buildings/${s.buildingId!._id}/results?submission=${s._id}`
                                )
                              }
                              className="inline-flex items-center gap-1 text-xs text-iitbhu hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View Results
                            </button>
                          )}
                          {s.status === 'submitted' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                isLoading={approveMutation.isPending}
                                onClick={() => approveMutation.mutate(s._id)}
                                className="!bg-green-600 hover:!bg-green-700"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="!border-amber-400 !text-amber-600 hover:!bg-amber-50"
                                onClick={() =>
                                  setRevisionModal({
                                    id: s._id,
                                    buildingName: s.buildingId?.name ?? 'submission',
                                  })
                                }
                              >
                                Request Revision
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Revision notes modal */}
      <Modal
        isOpen={!!revisionModal}
        onClose={() => {
          setRevisionModal(null);
          setRevisionNotes('');
        }}
        title={`Request Revision — ${revisionModal?.buildingName}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Provide notes explaining what needs to be corrected.
          </p>
          <textarea
            rows={4}
            value={revisionNotes}
            onChange={(e) => setRevisionNotes(e.target.value)}
            placeholder="Describe the required changes…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-iitbhu/20 focus:border-iitbhu"
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setRevisionModal(null);
                setRevisionNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="!border-amber-400 !text-amber-600 hover:!bg-amber-50"
              isLoading={revisionMutation.isPending}
              disabled={!revisionNotes.trim()}
              onClick={() =>
                revisionModal &&
                revisionMutation.mutate({ id: revisionModal.id, notes: revisionNotes })
              }
            >
              Send Request
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// System — Users
// ══════════════════════════════════════════════════════════════════════════════

function UsersTab({
  showToast,
  qc,
}: {
  showToast: ReturnType<typeof useToast>['showToast'];
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [roleFilter, setRoleFilter] = useState('');
  const [buildingsModal, setBuildingsModal] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', roleFilter],
    queryFn: () => adminApi.listUsers({ role: roleFilter || undefined, limit: 100 }),
  });

  const users: UserRow[] = data?.data?.data ?? [];

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminApi.changeUserRole(userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      showToast({ type: 'success', message: 'Role updated' });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast({
        type: 'error',
        message: err.response?.data?.message ?? 'Failed to update role',
      });
    },
  });

  const { data: allBuildingsData } = useQuery({
    queryKey: ['admin', 'buildings'],
    queryFn: () => buildingsApi.getAll({ limit: 100 }),
    enabled: !!buildingsModal,
  });

  const allBuildings: BuildingRow[] = allBuildingsData?.data?.data ?? [];

  function userBuildings(u: UserRow): BuildingRow[] {
    return allBuildings.filter((b) => u.assignedBuildings.includes(b._id));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Users</h2>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Filter by role:</label>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All</option>
          {Object.values(UserRole).map((r) => (
            <option key={r} value={r} className="capitalize">
              {r}
            </option>
          ))}
        </select>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Email', 'Role', 'Department', 'Joined', 'Buildings', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : users.map((u) => (
                    <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-700">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                      <td className="px-4 py-3">{roleBadge(u.role)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.department ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setBuildingsModal(u)}
                          className="text-sm text-blue-600 hover:underline font-medium"
                        >
                          {u.assignedBuildings?.length ?? 0}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-gray-400" />
                          <select
                            value={u.role}
                            onChange={(e) =>
                              roleMutation.mutate({ userId: u._id, role: e.target.value })
                            }
                            className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                          >
                            {Object.values(UserRole).map((r) => (
                              <option key={r} value={r} className="capitalize">
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={!!buildingsModal}
        onClose={() => setBuildingsModal(null)}
        title={`Buildings — ${buildingsModal?.name ?? ''}`}
        size="md"
      >
        {buildingsModal && (
          <div>
            {userBuildings(buildingsModal).length === 0 ? (
              <p className="text-sm text-gray-400">No buildings assigned.</p>
            ) : (
              <div className="space-y-2">
                {userBuildings(buildingsModal).map((b) => (
                  <div
                    key={b._id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{b.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{b.type}</p>
                    </div>
                    {statusBadge(b.submissionStatus)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// System — Static Locks
// ══════════════════════════════════════════════════════════════════════════════

function StaticLocksTab({
  showToast,
  qc,
}: {
  showToast: ReturnType<typeof useToast>['showToast'];
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'buildings'],
    queryFn: () => buildingsApi.getAll({ limit: 100 }),
  });

  const buildings: BuildingRow[] = data?.data?.data ?? [];
  const lockedBuildings = buildings.filter((b) => b.civilStatus === 'verified');

  const unlockMutation = useMutation({
    mutationFn: ({ buildingId, reason }: { buildingId: string; reason: string }) =>
      submissionsApi.unlockSection(buildingId, 'civil' as SectionType, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'buildings'] });
      showToast({ type: 'success', message: 'Civil section unlocked' });
      setUnlockId(null);
      setUnlockReason('');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast({
        type: 'error',
        message: err.response?.data?.message ?? 'Failed to unlock',
      });
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Static Section Locks</h2>
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Civil sections are locked after first approval. Use this panel to unlock a building's
          civil section for major structural updates.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : lockedBuildings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Lock className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No buildings with verified civil sections yet.</p>
        </div>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Building', 'Civil Status', 'Action'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {lockedBuildings.map((b) => (
                  <tr key={b._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{b.name}</p>
                      {b.shortName && <p className="text-xs text-gray-400">{b.shortName}</p>}
                      <p className="text-xs text-gray-400 capitalize">{b.type}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <Lock className="w-3 h-3" />
                        Verified (locked)
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {unlockId === b._id ? (
                        <div className="space-y-2 min-w-[200px]">
                          <textarea
                            rows={2}
                            value={unlockReason}
                            onChange={(e) => setUnlockReason(e.target.value)}
                            placeholder="Reason for unlock…"
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() =>
                                unlockMutation.mutate({
                                  buildingId: b._id,
                                  reason: unlockReason,
                                })
                              }
                              disabled={!unlockReason.trim() || unlockMutation.isPending}
                              className="text-xs font-medium bg-amber-600 text-white px-2 py-1 rounded hover:bg-amber-700 disabled:opacity-50 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => {
                                setUnlockId(null);
                                setUnlockReason('');
                              }}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setUnlockId(b._id)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors border border-amber-200"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Unlock for editing
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
