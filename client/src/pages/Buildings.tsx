import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Search, Building2, BookMarked } from 'lucide-react';
import { BuildingType, SubmissionStatus } from '@shared/types/building.types';
import PageWrapper from '@/components/layout/PageWrapper';
import BuildingCard from '@/components/buildings/BuildingCard';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';
import Badge from '@/components/common/Badge';
import { buildingsApi } from '@/features/buildings/buildingsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useDebounce } from '@/hooks/useDebounce';

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  ...Object.values(BuildingType).map((t) => ({
    value: t,
    label: t.charAt(0).toUpperCase() + t.slice(1),
  })),
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: SubmissionStatus.NOT_STARTED, label: 'Not Started' },
  { value: SubmissionStatus.DRAFT, label: 'Draft' },
  { value: SubmissionStatus.SUBMITTED, label: 'Submitted' },
  { value: SubmissionStatus.UNDER_REVIEW, label: 'Under Review' },
  { value: SubmissionStatus.VERIFIED, label: 'Verified' },
  { value: SubmissionStatus.REVISION_REQUESTED, label: 'Revision Needed' },
];

export default function Buildings() {
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [assignedOnly, setAssignedOnly] = useState(searchParams.get('filter') === 'assigned');

  // Sync assignedOnly when URL param changes (e.g. Navbar "My Buildings" click)
  useEffect(() => {
    setAssignedOnly(searchParams.get('filter') === 'assigned');
  }, [searchParams]);

  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['buildings', { search: debouncedSearch, type, status, page }],
    queryFn: () =>
      buildingsApi.getAll({
        search: debouncedSearch || undefined,
        type: type || undefined,
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    staleTime: 2 * 60 * 1000,
  });

  const allBuildings = data?.data?.data ?? [];
  const pagination = data?.data?.pagination;
  const userAssignedBuildingIds: string[] = (user?.assignedBuildings as string[]) ?? [];

  // When assignedOnly, filter client-side by user's assigned buildings
  const buildings = assignedOnly
    ? allBuildings.filter((b: { _id: string }) => userAssignedBuildingIds.includes(b._id))
    : allBuildings;

  const total: number = assignedOnly ? buildings.length : (pagination?.total ?? 0);
  const totalPages: number = assignedOnly ? 1 : (pagination?.totalPages ?? 1);

  function resetFilters() {
    setSearch('');
    setType('');
    setStatus('');
    setPage(1);
    setAssignedOnly(false);
    setSearchParams({});
  }

  function toggleAssignedOnly() {
    const next = !assignedOnly;
    setAssignedOnly(next);
    setPage(1);
    if (next) {
      setSearchParams({ filter: 'assigned' });
    } else {
      setSearchParams({});
    }
  }

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    const half = 2;
    let start = Math.max(1, page - half);
    const end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    return start + i;
  }).filter((n) => n >= 1 && n <= totalPages);

  return (
    <PageWrapper title="Buildings">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {assignedOnly ? 'My Buildings' : 'Campus Buildings'}
            </h1>
            {assignedOnly && (
              <p className="text-sm text-gray-400 mt-0.5">Showing buildings assigned to you</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <button
                onClick={toggleAssignedOnly}
                className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  assignedOnly
                    ? 'bg-iitbhu text-white border-iitbhu'
                    : 'border-white/10 text-gray-300 hover:bg-white/5'
                }`}
              >
                <BookMarked size={14} />
                My Buildings
              </button>
            )}
            {total > 0 && (
              <Badge variant="default" label={`${total} buildings`} className="text-sm px-3 py-1" />
            )}
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search buildings…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu focus:border-transparent"
            />
          </div>

          <select
            value={type}
            onChange={handleFilterChange(setType)}
            className="border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={handleFilterChange(setStatus)}
            className="border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : buildings.length === 0 ? (
          <EmptyState
            title="No buildings found"
            description="Try adjusting your search or filters."
            icon={Building2}
            action={{ label: 'Reset filters', onClick: resetFilters }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {buildings.map((b: Parameters<typeof BuildingCard>[0]['building']) => (
              <BuildingCard
                key={b._id}
                building={b}
                userAssignedBuildingIds={userAssignedBuildingIds}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-sm disabled:opacity-40 hover:bg-white/5"
            >
              ← Prev
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  n === page
                    ? 'bg-iitbhu text-white border-iitbhu'
                    : 'border-white/10 hover:bg-white/5'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-sm disabled:opacity-40 hover:bg-white/5"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
