import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MapPin, Building2, Plus, X } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Badge from '@/components/common/Badge';
import Skeleton from '@/components/common/Skeleton';
import { campusApi } from '@/features/campus/campusApi';
import { useAuthStore } from '@/features/auth/authStore';
import { UserRole } from '@shared/types/user.types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampusSummary {
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
  overviewStatus: string;
  infrastructureStatus: string;
  isActive: boolean;
  buildingCount?: number;
  verifiedBuildingCount?: number;
}

const STATUS_BADGE: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  not_started: 'default',
  draft: 'default',
  submitted: 'warning',
  under_review: 'warning',
  verified: 'success',
  revision_requested: 'error',
};

// ── New Campus Modal ──────────────────────────────────────────────────────────

interface NewCampusModalProps {
  onClose: () => void;
}

function NewCampusModal({ onClose }: NewCampusModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    institution: '',
    shortName: '',
    city: '',
    state: '',
    country: 'India',
    totalAreaAcres: '',
    establishedYear: '',
    website: '',
    contactEmail: '',
    description: '',
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => campusApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['campuses'] });
      const slug = res.data?.data?.slug;
      onClose();
      if (slug) navigate(`/campus/${slug}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name,
      institution: form.institution,
      city: form.city,
      state: form.state,
      country: form.country,
    };
    if (form.shortName.trim()) payload.shortName = form.shortName.trim();
    if (form.totalAreaAcres) payload.totalAreaAcres = parseFloat(form.totalAreaAcres);
    if (form.establishedYear) payload.establishedYear = parseInt(form.establishedYear);
    if (form.website.trim()) payload.website = form.website.trim();
    if (form.contactEmail.trim()) payload.contactEmail = form.contactEmail.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    createMutation.mutate(payload);
  }

  const field = (
    key: keyof typeof form,
    label: string,
    opts?: { required?: boolean; type?: string; placeholder?: string }
  ) => (
    <div>
      <label className="block text-xs font-medium text-gray-300 mb-1">
        {label}
        {opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={opts?.type ?? 'text'}
        required={opts?.required}
        placeholder={opts?.placeholder}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-semibold text-white">New campus</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {field('name', 'Campus name', { required: true, placeholder: 'e.g. Main Campus' })}
          {field('institution', 'Institution', {
            required: true,
            placeholder: 'e.g. Indian Institute of Technology',
          })}
          {field('shortName', 'Short name', { placeholder: 'e.g. IIT' })}
          <div className="grid grid-cols-2 gap-3">
            {field('city', 'City', { required: true, placeholder: 'City' })}
            {field('state', 'State', { required: true, placeholder: 'Uttar Pradesh' })}
          </div>
          {field('country', 'Country', { required: true })}
          <div className="grid grid-cols-2 gap-3">
            {field('totalAreaAcres', 'Total area (acres)', { type: 'number' })}
            {field('establishedYear', 'Year established', { type: 'number', placeholder: '1919' })}
          </div>
          {field('website', 'Website', { type: 'url', placeholder: 'https://' })}
          {field('contactEmail', 'Contact email', { type: 'email' })}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-iitbhu"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-white/10 text-gray-300 py-2 rounded-lg text-sm hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-iitbhu text-white py-2 rounded-lg text-sm hover:bg-iitbhu-dark disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create campus'}
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-600 text-center">
              Failed to create campus. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

// ── Campus Card ───────────────────────────────────────────────────────────────

function CampusCard({ campus }: { campus: CampusSummary }) {
  const navigate = useNavigate();
  const buildingCount = campus.buildingCount ?? 0;
  const verifiedCount = campus.verifiedBuildingCount ?? 0;
  const coveragePct = buildingCount > 0 ? Math.round((verifiedCount / buildingCount) * 100) : 0;

  return (
    <div
      onClick={() => navigate(`/campus/${campus.slug}`)}
      className="relative overflow-hidden bg-[#121212]/70 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ring-1 ring-inset ring-white/5 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-iitbhu/50 transition-all group"
    >
      <div 
        className="absolute -bottom-16 -right-16 w-40 h-40 rounded-full blur-[50px] opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none bg-iitbhu" 
      />
      
      <div className="relative z-10 flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{campus.name}</h3>
          <p className="text-sm text-gray-400 truncate">{campus.institution}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 text-xs text-gray-400">
          <MapPin size={12} />
          <span>{campus.city}</span>
        </div>
      </div>

      <div className="relative z-10 flex flex-wrap gap-1.5 mb-3">
        {campus.totalAreaAcres && (
          <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded-full border border-white/5 shadow-inner">
            {campus.totalAreaAcres.toLocaleString()} acres
          </span>
        )}
        {campus.establishedYear && (
          <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded-full border border-white/5 shadow-inner">
            Est. {campus.establishedYear}
          </span>
        )}
      </div>

      <div className="relative z-10 flex items-center gap-2 mb-3">
        <Building2 size={13} className="text-gray-400" />
        <span className="text-sm text-gray-300">{buildingCount} buildings</span>
        {verifiedCount > 0 && (
          <span className="text-xs text-green-600">· {verifiedCount} fully verified</span>
        )}
      </div>

      {buildingCount > 0 && (
        <div className="relative z-10 mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Data coverage</span>
            <span>{coveragePct}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 shadow-inner">
            <div
              className="bg-iitbhu h-1.5 rounded-full transition-all shadow-[0_0_8px_rgba(235,51,73,0.6)]"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-wrap gap-1.5 pt-2 border-t border-white/5 mt-auto">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Overview:</span>
          <Badge
            variant={STATUS_BADGE[campus.overviewStatus] ?? 'default'}
            label={campus.overviewStatus.replace('_', ' ')}
            className="text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Infra:</span>
          <Badge
            variant={STATUS_BADGE[campus.infrastructureStatus] ?? 'default'}
            label={campus.infrastructureStatus.replace('_', ' ')}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampusList() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === UserRole.ADMIN;
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => campusApi.getAll().then((r) => r.data.data as CampusSummary[]),
    staleTime: 2 * 60 * 1000,
  });

  const campuses = data ?? [];

  return (
    <PageWrapper title="University campuses">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">University campuses</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Select a campus to view or enter carbon data
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 bg-iitbhu text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-iitbhu-dark transition-colors"
            >
              <Plus size={14} />
              New campus
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
            <MapPin size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-300 font-medium mb-1">Could not load campuses</p>
            <p className="text-sm text-gray-400 mb-4">
              The server may be starting up. Please wait a moment.
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 bg-iitbhu text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-iitbhu-dark"
            >
              Retry
            </button>
          </div>
        ) : campuses.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
            <MapPin size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-300 font-medium mb-1">No campuses have been set up yet</p>
            <p className="text-sm text-gray-400 mb-4">Create the first campus to get started.</p>
            {isAdmin && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 bg-iitbhu text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-iitbhu-dark"
              >
                <Plus size={14} />
                Create campus
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {campuses.map((c) => (
              <CampusCard key={c._id} campus={c} />
            ))}
          </div>
        )}
      </div>

      {showModal && <NewCampusModal onClose={() => setShowModal(false)} />}
    </PageWrapper>
  );
}
