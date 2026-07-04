import { useState } from 'react';
import { DataField, DataSection, RecordCard, EmptyState } from '../ReviewPrimitives';

function fmt(v: number | null | undefined): string {
  const n = v ?? 0;
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) > 0) return n.toFixed(3);
  return '0';
}

function CivilCarbonContribution({ carbonResults }: { carbonResults: any }) {
  const [expanded, setExpanded] = useState(false);

  const embodiedTotal = carbonResults.embodiedCarbon as number | undefined;
  const embodiedPerYear = carbonResults.embodiedCarbonPerYear as number | undefined;
  const scope3 = carbonResults.breakdown?.byScope?.scope3 as number | undefined;
  const materialBreakdown = carbonResults.breakdown?.byComponent?.materialBreakdown as
    | Record<string, number>
    | undefined;

  const matEntries = materialBreakdown
    ? Object.entries(materialBreakdown)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
    : [];
  const matTotal = matEntries.reduce((s, [, v]) => s + v, 0);

  if (!embodiedTotal && !embodiedPerYear) return null;

  return (
    <div className="mt-8 border-t-2 border-dashed border-blue-100 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="text-sm font-semibold text-white">Carbon Contribution from Civil Data</h4>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
          calculated
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
          <div className="text-xs text-amber-600 mb-1">Embodied Carbon (total lifecycle)</div>
          <div className="text-lg font-bold text-amber-700">{fmt(embodiedTotal)}</div>
          <div className="text-xs text-amber-500">tCO₂e (50-year)</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <div className="text-xs text-blue-600 mb-1">Per year (÷ 50 yr amortised)</div>
          <div className="text-lg font-bold text-blue-700">{fmt(embodiedPerYear)}</div>
          <div className="text-xs text-blue-500">tCO₂e/yr</div>
        </div>
      </div>

      {scope3 != null && (
        <div className="flex items-center justify-between px-3 py-2 bg-blue-50/50 rounded-lg border border-blue-100 mb-4">
          <span className="text-xs text-blue-700 font-medium">Scope 3 (embodied)</span>
          <span className="text-xs text-blue-900 font-bold">{fmt(scope3)} tCO₂e/yr</span>
        </div>
      )}

      {matEntries.length > 0 && (
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white/5 text-xs font-semibold text-gray-300 hover:bg-white/10 transition-colors"
          >
            <span>Material Breakdown ({matEntries.length} materials with non-zero values)</span>
            <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
          </button>
          {expanded && (
            <div>
              {matEntries.map(([mat, val]) => {
                const share = matTotal > 0 ? ((val / matTotal) * 100).toFixed(1) + '%' : '—';
                return (
                  <div
                    key={mat}
                    className="flex items-center justify-between px-4 py-2 border-t border-gray-50"
                  >
                    <span className="text-xs text-gray-300 capitalize">
                      {mat
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (c) => c.toUpperCase())
                        .trim()}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-100">{fmt(val)} tCO₂e</span>
                      <span className="text-xs text-gray-400 w-12 text-right">{share}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// mode='overview' shows only the overview + land-use cards (OverviewEntry fields).
// mode='civil' (default) shows those plus structural, construction, openings, materials.
export const CivilRenderer = ({
  data,
  mode = 'civil',
  carbonResults,
}: {
  data: any;
  mode?: 'overview' | 'civil';
  carbonResults?: any;
}) => (
  <div>
    {/* ── BUILDING OVERVIEW ──────────────────────────────────────── */}
    <DataSection title="Building overview">
      <DataField label="Building name" value={data.overview?.buildingName ?? data.overview?.name} />
      <DataField label="Building type" value={data.overview?.buildingType} />
      <DataField label="Primary purpose" value={data.overview?.primaryPurpose} />
      <DataField label="Floors" value={data.overview?.numberOfFloors ?? data.overview?.floors} />
      <DataField label="Year of construction" value={data.overview?.yearOfConstruction} />
      <DataField
        label="Total floor area"
        value={data.overview?.totalFloorArea}
        unit="m²"
        highlight
      />
      <DataField label="Area (sq ft)" value={data.overview?.areaOfOneBuildingSqFt} unit="sq ft" />
      <DataField label="Operating hours/day" value={data.overview?.operatingHoursPerDay} unit="h" />
      <DataField
        label="Operating days/week"
        value={data.overview?.operatingDaysPerWeek}
        unit="days"
      />
      <DataField
        label="Avg daily occupants"
        value={data.overview?.averageDailyOccupants ?? data.overview?.numberOfOccupantsPerBuilding}
        highlight
      />
      <DataField label="Ventilation type" value={data.overview?.ventilationType} />
      <DataField label="Building nature" value={data.overview?.buildingNature} />
      <DataField label="Orientation — North" value={data.overview?.orientationNorthPct} unit="%" />
      <DataField label="Orientation — East" value={data.overview?.orientationEastPct} unit="%" />
      <DataField label="Orientation — South" value={data.overview?.orientationSouthPct} unit="%" />
      <DataField label="Orientation — West" value={data.overview?.orientationWestPct} unit="%" />
    </DataSection>

    {/* ── LAND USE ───────────────────────────────────────────────── */}
    <DataSection title="Land use">
      <DataField
        label="Open play area"
        value={data.overview?.landUseOpenPlayAreaAcres}
        unit="acres"
      />
      <DataField
        label="Green / permeable"
        value={data.overview?.landUseGreenPermeableAcres}
        unit="acres"
      />
      <DataField label="Paved" value={data.overview?.landUsePavedAcres} unit="acres" />
      <DataField
        label="Covered / built-up"
        value={data.overview?.landUseCoveredBuiltUpAcres}
        unit="acres"
      />
      {data.overview?.landUseCustomCategories?.map((cat: any, i: number) => (
        <DataField
          key={i}
          label={cat.categoryName ?? cat.label ?? `Custom ${i + 1}`}
          value={cat.areaAcres ?? cat.acres}
          unit="acres"
        />
      ))}
    </DataSection>

    {/* ── CIVIL-ONLY SECTIONS (hidden when viewing an overview submission) ─── */}
    {mode === 'civil' && (
      <>
        {/* ── STRUCTURAL DIMENSIONS ──────────────────────────────────── */}
        <DataSection title="Structural dimensions">
          <DataField label="Wall thickness" value={data.dimensions?.wallThicknessMm} unit="mm" />
          <DataField
            label="Internal partition"
            value={data.dimensions?.internalPartitionMm}
            unit="mm"
          />
          <DataField label="Slab thickness" value={data.dimensions?.slabThicknessMm} unit="mm" />
          <DataField label="Roof thickness" value={data.roof?.roofThicknessMm} unit="mm" />
          <DataField label="Beam size" value={data.dimensions?.beamSize} />
          <DataField label="Column size" value={data.dimensions?.columnSize} />
          <DataField label="Roof materials" value={data.roof?.roofMaterials} />
          <DataField label="Number of rooms" value={data.dimensions?.numberOfRooms} />
          <DataField label="Number of windows" value={data.dimensions?.numberOfWindows} />
          <DataField
            label="Clear room height"
            value={data.dimensions?.clearRoomHeightFt}
            unit="ft"
          />
        </DataSection>

        {/* ── CONSTRUCTION & PRACTICES ───────────────────────────────── */}
        <DataSection title="Construction">
          <DataField label="Construction type" value={data.construction?.constructionType} />
          <DataField
            label="Local materials %"
            value={data.construction?.localMaterialsPercent}
            unit="%"
          />
          <DataField
            label="Material source dist."
            value={data.construction?.materialSourceDistance}
            unit="km"
          />
          <DataField label="Insulation material" value={data.construction?.insulationMaterial} />
          <DataField label="Scrap materials used" value={data.construction?.scrapMaterialsUsed} />
          <DataField label="Reuse policy" value={data.construction?.reusePolicy} />
          <DataField
            label="Local practices"
            value={data.construction?.localConstructionPractices}
          />
        </DataSection>

        {/* ── OPENINGS ───────────────────────────────────────────────── */}
        <DataSection title="Openings" count={data.openings?.elements?.length ?? 0} collapsible>
          {!data.openings?.elements?.length ? (
            <EmptyState message="No openings entered" />
          ) : (
            data.openings.elements.map((op: any, i: number) => (
              <RecordCard
                key={op.id ?? i}
                title={`${op.elementType?.replace(/_/g, ' ') ?? 'Opening'} × ${op.count ?? 0}`}
                subtitle={`${op.frameMaterial ?? '—'} frame · ${op.glassType ?? '—'}`}
              >
                <DataField label="Dimensions (W×H)" value={op.dimensionsWxHFt} unit="ft" />
                <DataField label="Count" value={op.count} />
                <DataField label="Frame material" value={op.frameMaterial} />
                <DataField label="Glass type" value={op.glassType} />
                <DataField label="Surface finish" value={op.surfaceFinish} />
              </RecordCard>
            ))
          )}
        </DataSection>

        {/* ── MATERIALS (EMBODIED CARBON) ─────────────────────────────── */}
        <DataSection title="Materials — embodied carbon">
          <DataField label="Estimation mode" value={data.materials?.estimationMode} />
          <DataField label="Furniture density" value={data.materials?.furnitureDensity} />
          <DataField
            label="Wooden furniture"
            value={data.materials?.woodenFurnitureKg}
            unit="kg"
            source="measured"
          />
          <DataField
            label="Steel furniture"
            value={data.materials?.steelFurnitureKg}
            unit="kg"
            source="measured"
            highlight
          />
          <DataField label="Plastic" value={data.materials?.plasticKg} unit="kg" />
          <DataField label="Glass (kg)" value={data.materials?.glassKg} unit="kg" />
          {data.materials?.customMaterials?.map((m: any, i: number) => (
            <DataField
              key={i}
              label={m.label ?? m.name ?? `Custom material ${i + 1}`}
              value={m.value ?? m.kg}
              unit={m.unit ?? 'kg'}
            />
          ))}
        </DataSection>

        {/* ── EXTENDED STRUCTURAL MATERIALS (ANNEXURE 8) ──────────────── */}
        <ExtendedMaterialsSection materials={data.materials} />

        {/* ── CARBON CONTRIBUTION ─────────────────────────────────────── */}
        {carbonResults && <CivilCarbonContribution carbonResults={carbonResults} />}
      </>
    )}
  </div>
);

// Renders Annexure 8 extended material fields — only shows fields with data.
// If no extended fields are present, renders a single summary note.
const EXTENDED_FIELDS: Array<{ key: string; label: string; unit: string; highlight?: boolean }> = [
  { key: 'concretePCC_m3', label: 'PCC concrete', unit: 'm³', highlight: true },
  { key: 'concreteRCC_m3', label: 'RCC concrete', unit: 'm³', highlight: true },
  { key: 'rebar_kg', label: 'Rebar / TMT steel', unit: 'kg', highlight: true },
  { key: 'brickMasonry_kg', label: 'Brick masonry', unit: 'kg' },
  { key: 'stoneMasonry_kg', label: 'Stone masonry', unit: 'kg' },
  { key: 'kotaStone_kg', label: 'Kota stone', unit: 'kg' },
  { key: 'steelFrame_kg', label: 'Steel frame', unit: 'kg', highlight: true },
  { key: 'steelSection_kg', label: 'Steel sections', unit: 'kg' },
  { key: 'aluminum_kg', label: 'Aluminium', unit: 'kg' },
  { key: 'ceramicTile_kg', label: 'Ceramic tiles', unit: 'kg' },
  { key: 'plaster_kg', label: 'Plaster', unit: 'kg' },
  { key: 'paint_m2', label: 'Paint', unit: 'm²' },
  { key: 'woodFrame_kg', label: 'Wood framing', unit: 'kg' },
  { key: 'plywood_kg', label: 'Plywood', unit: 'kg' },
  { key: 'upvc_kg', label: 'uPVC', unit: 'kg' },
  { key: 'cgiSheet_kg', label: 'CGI sheet', unit: 'kg' },
  { key: 'gypsum_kg', label: 'Gypsum board', unit: 'kg' },
  { key: 'asbestos_m2', label: 'Asbestos sheet', unit: 'm²' },
  { key: 'particleBoard_kg', label: 'Particle board', unit: 'kg' },
  { key: 'puffPanel_kg', label: 'PUF panel', unit: 'kg' },
];

function ExtendedMaterialsSection({ materials }: { materials: any }) {
  if (!materials) return null;

  const entered = EXTENDED_FIELDS.filter(
    (f) => materials[f.key] !== undefined && materials[f.key] !== null
  );

  return (
    <DataSection title="Extended structural materials (Annexure 8)">
      {entered.length === 0 ? (
        <div className="text-sm text-gray-400 py-2 italic">
          No structural material data entered — engine will use bulk structural estimate.
        </div>
      ) : (
        entered.map((f) => (
          <DataField
            key={f.key}
            label={f.label}
            value={materials[f.key]}
            unit={f.unit}
            source="measured"
            highlight={f.highlight}
          />
        ))
      )}
    </DataSection>
  );
}
