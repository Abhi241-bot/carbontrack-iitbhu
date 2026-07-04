import { X } from 'lucide-react';
import { campusApi } from '@/features/campus/campusApi';
import { useQuery } from '@tanstack/react-query';

function Field({ label, value }: { label: string; value: string | number | undefined | null }) {
  const display = value === undefined || value === null || value === '' ? '—' : String(value);
  return (
    <div className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-100">{display}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-white/5 border-b border-white/5 font-semibold text-gray-100 text-sm">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function CampusInfraReviewPanel({
  slug,
  name,
  onClose,
}: {
  slug: string;
  name: string;
  onClose: () => void;
  onActionComplete: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['campus', 'infrastructure', 'draft', slug],
    queryFn: () => campusApi.getInfrastructureDraft(slug).then((r) => r.data.data),
  });

  const infra = data?.infrastructureData;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl bg-black/40 backdrop-blur-md shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/5 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Campus Infrastructure — Submitted Data</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-white/5/50">
          {isLoading && (
            <div className="text-center py-16 text-gray-400 text-sm">Loading submitted data…</div>
          )}
          {error && (
            <div className="text-center py-16 text-red-500 text-sm">
              Failed to load data. The server may have rejected access.
            </div>
          )}
          {!isLoading && !error && !infra && (
            <div className="text-center py-16 text-gray-400 text-sm">No infrastructure data found.</div>
          )}

          {infra && (
            <>
              {/* ── ROADS ── */}
              <Section title="Roads">
                {infra.roads?.segments?.length > 0 ? (
                  <div className="space-y-3">
                    {infra.roads.segments.map((seg: any, i: number) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/5">
                        <p className="font-medium text-sm text-gray-100 mb-2">{seg.roadName || `Road ${i + 1}`}</p>
                        <Field label="Surface type" value={seg.surfaceType?.replace(/_/g, ' ')} />
                        <Field label="Road type" value={seg.roadType} />
                        <Field label="Length" value={seg.lengthM != null ? `${seg.lengthM} m (${((seg.lengthM || 0) / 1000).toFixed(2)} km)` : seg.lengthKm != null ? `${seg.lengthKm} km` : undefined} />
                        <Field label="Width" value={seg.widthM != null ? `${seg.widthM} m` : undefined} />
                        <Field label="Lanes" value={seg.lanes} />
                        <Field label="Area" value={seg.areaM2 != null ? `${seg.areaM2} m²` : undefined} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No road segments added.</p>
                )}
              </Section>

              {/* ── STREET LIGHTING ── */}
              <Section title="Street Lighting">
                <Field label="Has street lighting" value={infra.roads?.hasStreetLighting ? 'Yes' : 'No'} />
                {infra.roads?.hasStreetLighting && (
                  <>
                    <Field label="Light count" value={infra.roads.streetLightCount} />
                    <Field label="Light type" value={infra.roads.streetLightType} />
                    <Field label="Watts per light" value={infra.roads.streetLightWattsEach != null ? `${infra.roads.streetLightWattsEach} W` : undefined} />
                    <Field label="Hours per day" value={infra.roads.streetLightHoursPerDay != null ? `${infra.roads.streetLightHoursPerDay} hr` : undefined} />
                    {infra.roads.streetLightingRemarks && (
                      <Field label="Remarks" value={infra.roads.streetLightingRemarks} />
                    )}
                  </>
                )}
              </Section>

              {/* ── VEGETATION ── */}
              <Section title="Vegetation & Green Cover">
                {infra.vegetation?.hasHeritageTrees && (
                  <div className="mb-3 pb-3 border-b border-white/5">
                    <Field label="Has heritage trees" value="Yes" />
                    <Field label="Heritage tree count" value={infra.vegetation.heritageTreeCount} />
                  </div>
                )}
                {infra.vegetation?.categories?.length > 0 ? (
                  <div className="space-y-3">
                    {infra.vegetation.categories.map((cat: any, i: number) => {
                      const hasData = cat.numberOfTrees != null || cat.areaAcres != null || cat.areaSqm != null;
                      if (!hasData) return null;
                      return (
                        <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/5">
                          <p className="font-medium text-sm text-gray-100 mb-2 capitalize">
                            {cat.customCategoryLabel || cat.categoryType?.replace(/_/g, ' ')}
                          </p>
                          {cat.definitionScope && (
                            <p className="text-xs text-gray-400 mb-2 italic">{cat.definitionScope}</p>
                          )}
                          <Field label="Number of trees" value={cat.numberOfTrees} />
                          <Field label="Area (acres)" value={cat.areaAcres} />
                          {cat.areaSqm != null && <Field label="Area (sqm)" value={cat.areaSqm} />}
                          {cat.remarks && <Field label="Remarks" value={cat.remarks} />}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No vegetation categories added.</p>
                )}
              </Section>

              {/* ── WATER BODIES ── */}
              <Section title="Water Bodies">
                <Field label="Has perennial water body" value={infra.waterBodies?.hasPerennialWaterBody ? 'Yes' : 'No'} />
                {infra.waterBodies?.waterBodies?.length > 0 ? (
                  <div className="space-y-3 mt-3">
                    {infra.waterBodies.waterBodies.map((wb: any, i: number) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/5">
                        <p className="font-medium text-sm text-gray-100 mb-2">{wb.name}</p>
                        <Field label="Category" value={wb.category?.replace(/_/g, ' ')} />
                        <Field label="Length" value={wb.lengthM != null ? `${wb.lengthM} m` : undefined} />
                        <Field label="Width" value={wb.widthM != null ? `${wb.widthM} m` : undefined} />
                        <Field label="Surface area" value={wb.surfaceAreaAcres != null ? `${wb.surfaceAreaAcres} acres` : wb.surfaceAreaM2 != null ? `${wb.surfaceAreaM2} m²` : undefined} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic mt-2">No water bodies added.</p>
                )}
              </Section>

              {/* ── COMMUTATION ── */}
              {infra.commutation && (
                <Section title="Commutation (Scope 3)">
                  <Field label="Number of occupants" value={infra.commutation.noOccupants} />
                  <Field label="Avg daily distance" value={infra.commutation.avgDailyDistanceKm != null ? `${infra.commutation.avgDailyDistanceKm} km` : undefined} />
                  <Field label="Working days/year" value={infra.commutation.workingDaysPerYear} />
                </Section>
              )}

              {/* ── AIR TRAVEL ── */}
              {infra.airTravel && (
                <Section title="Air Travel (Scope 3)">
                  <Field label="Number of travellers" value={infra.airTravel.noTravellers} />
                  <Field label="Total passenger-km" value={infra.airTravel.totalPassengerKm} />
                  <Field label="Avg distance/person" value={infra.airTravel.avgDistancePerPersonKm != null ? `${infra.airTravel.avgDistancePerPersonKm} km` : undefined} />
                </Section>
              )}

              {/* ── PURCHASED GOODS ── */}
              {infra.purchasedGoods && (
                <Section title="Purchased Goods (Scope 3)">
                  <Field label="Total population" value={infra.purchasedGoods.totalPopulation} />
                  <Field label="Cost per person (INR)" value={infra.purchasedGoods.costPerPersonINR != null ? `₹${infra.purchasedGoods.costPerPersonINR}` : undefined} />
                  <Field label="Total spend (INR)" value={infra.purchasedGoods.totalSpendINR != null ? `₹${infra.purchasedGoods.totalSpendINR}` : undefined} />
                  <Field label="Total spend (USD)" value={infra.purchasedGoods.totalSpend2022USD != null ? `$${infra.purchasedGoods.totalSpend2022USD}` : undefined} />
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
