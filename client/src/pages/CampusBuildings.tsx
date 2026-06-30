import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2 } from 'lucide-react';
import { BuildingType } from '@shared/types/building.types';
import PageWrapper from '@/components/layout/PageWrapper';
import BuildingCard from '@/components/buildings/BuildingCard';
import Skeleton from '@/components/common/Skeleton';
import EmptyState from '@/components/common/EmptyState';
import Badge from '@/components/common/Badge';
import { campusApi } from '@/features/campus/campusApi';
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

interface CampusInfo {
  _id: string;
  slug: string;
  name: string;
  institution: string;
}

export default function CampusBuildings() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 400);

  // Fetch campus info for the breadcrumb
  const { data: campusData } = useQuery({
    queryKey: ['campus', campusSlug],
    queryFn: () => campusApi.getBySlug(campusSlug!).then((r) => r.data.data as CampusInfo),
    enabled: !!campusSlug,
    staleTime: 5 * 60_000,
  });

  // Fetch buildings for this campus
  const { data, isLoading } = useQuery({
    queryKey: ['campus-buildings', campusSlug, page, type, debouncedSearch],
    queryFn: () =>
      campusApi
        .getBuildingsByCampus(campusSlug!, {
          page,
          limit: PAGE_SIZE,
          type: type || undefined,
          search: debouncedSearch || undefined,
        } as Record<string, unknown>)
        .then((r) => r.data.data),
    enabled: !!campusSlug,
    staleTime: 2 * 60_000,
  });

  const buildings = data?.buildings ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const userAssignedBuildingIds: string[] = (user?.assignedBuildings as string[]) ?? [];

  function resetFilters() {
    setSearch('');
    setType('');
    setPage(1);
  }

  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    const half = 2;
    let start = Math.max(1, page - half);
    const end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    return start + i;
  }).filter((n) => n >= 1 && n <= totalPages);

  const campusName = campusData?.name ?? campusSlug;

  return (
    <PageWrapper title={`${campusName} — Buildings`}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-5">
          <Link to="/campus" className="hover:text-iitbhu transition-colors">
            Campus
          </Link>
          <span>/</span>
          <Link to={`/campus/${campusSlug}`} className="hover:text-iitbhu transition-colors">
            {campusName}
          </Link>
          <span>/</span>
          <span className="text-gray-700">Buildings</span>
        </nav>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{campusName} — Buildings</h1>
            {total > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">{total} buildings in this campus</p>
            )}
          </div>
          {total > 0 && (
            <Badge variant="default" label={`${total} buildings`} className="text-sm px-3 py-1" />
          )}
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
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu focus:border-transparent"
            />
          </div>

          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
          >
            {TYPE_OPTIONS.map((o) => (
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
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50"
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
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
