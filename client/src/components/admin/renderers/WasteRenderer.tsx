import React from 'react';
import { DataField, DataSection, RecordCard, EmptyState, MonthlyMatrix } from '../ReviewPrimitives';

function fmt(v: number | null | undefined): string {
  const n = v ?? 0;
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) > 0) return n.toFixed(3);
  return '0';
}

function ScopePill({ scope }: { scope: 1 | 2 | 3 }) {
  const cfg: Record<number, string> = {
    1: 'bg-red-50 text-red-700 border border-red-200',
    2: 'bg-amber-50 text-amber-700 border border-amber-200',
    3: 'bg-blue-50 text-blue-700 border border-blue-200',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg[scope]}`}>
      Scope {scope}
    </span>
  );
}

function WasteCarbonContribution({ carbonResults }: { carbonResults: any }) {
  const bc = carbonResults.breakdown?.byComponent ?? {};
  const meta = carbonResults.meta ?? {};

  const solidRows: Array<{
    key: string;
    label: string;
    scope: 1 | 2 | 3;
    details?: React.ReactNode;
  }> = [
    {
      key: 'landfillCH4',
      label: 'Landfill CH₄',
      scope: 1,
      details: (
        <div className="text-xs text-gray-500 space-y-0.5 mt-1 pl-2">
          {meta.landfillTonnesTotalYr > 0 && (
            <div>
              ↳ Total to landfill: {Math.round(meta.landfillTonnesTotalYr).toLocaleString()}{' '}
              tonnes/yr
            </div>
          )}
          {meta.ch4KgYr > 0 && <div>↳ CH₄ generated: {fmt(meta.ch4KgYr / 1000)} tonnes/yr</div>}
          <div>
            ↳ Method: IPCC FOD (k=0.065, DOC=0.11
            {meta.landfillMCFUsed > 0 ? `, MCF=${meta.landfillMCFUsed?.toFixed(2)}` : ''})
          </div>
        </div>
      ),
    },
    {
      key: 'wasteIncineration',
      label: 'Waste Incineration',
      scope: 1,
      details: (
        <div className="text-xs text-gray-500 mt-1 pl-2">
          <div>↳ Formula: CC×FCF×BOE×(44/12) = 0.6×0.25×0.95×3.667</div>
        </div>
      ),
    },
    { key: 'mswPlantElectricity', label: 'MSW Plant Electricity', scope: 2 },
  ];

  const wwRows: Array<{ key: string; label: string; scope: 1 | 2 | 3; details?: React.ReactNode }> =
    [
      {
        key: 'wastewaterCH4',
        label: 'Wastewater CH₄',
        scope: 1,
        details: (
          <div className="text-xs text-gray-500 space-y-0.5 mt-1 pl-2">
            {meta.bodLoadKgYr > 0 && (
              <div>↳ BOD load: {Math.round(meta.bodLoadKgYr).toLocaleString()} kg BOD/yr</div>
            )}
            {meta.ch4KgYr > 0 && <div>↳ CH₄: {fmt(meta.ch4KgYr)} kg/yr</div>}
            <div>
              ↳ Bo=0.6{meta.wwMCFUsed > 0 ? `, MCF=${meta.wwMCFUsed?.toFixed(2)}` : ''}, GWP_CH₄=27
            </div>
          </div>
        ),
      },
      {
        key: 'wastewaterN2O',
        label: 'Wastewater N₂O',
        scope: 1,
        details:
          meta.n2oKgYr > 0 ? (
            <div className="text-xs text-gray-500 mt-1 pl-2">
              <div>↳ N₂O: {fmt(meta.n2oKgYr)} kg/yr · GWP_N₂O=265</div>
            </div>
          ) : null,
      },
      { key: 'stpElectricity', label: 'STP Electricity', scope: 2 },
      { key: 'wtpElectricity', label: 'WTP Electricity', scope: 2 },
      { key: 'roElectricity', label: 'RO Electricity', scope: 2 },
      { key: 'chemicalUsage', label: 'Chemical Usage', scope: 3 },
      { key: 'municipalWaterScope3', label: 'Municipal Water (scope 3)', scope: 3 },
    ];

  const allRows = [...solidRows, ...wwRows];
  const visibleAll = allRows.filter((r) => (bc[r.key] ?? 0) > 0);
  if (!visibleAll.length) return null;

  const solidVisible = solidRows.filter((r) => (bc[r.key] ?? 0) > 0);
  const wwVisible = wwRows.filter((r) => (bc[r.key] ?? 0) > 0);

  const scope1Total = visibleAll
    .filter((r) => r.scope === 1)
    .reduce((s, r) => s + (bc[r.key] ?? 0), 0);
  const scope2Total = visibleAll
    .filter((r) => r.scope === 2)
    .reduce((s, r) => s + (bc[r.key] ?? 0), 0);
  const scope3Total = visibleAll
    .filter((r) => r.scope === 3)
    .reduce((s, r) => s + (bc[r.key] ?? 0), 0);
  const wasteTotal = scope1Total + scope2Total + scope3Total;

  function RowGroup({ rows, title }: { rows: typeof solidRows; title: string }) {
    const visible = rows.filter((r) => (bc[r.key] ?? 0) > 0);
    if (!visible.length) return null;
    return (
      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 py-1.5">
          {title}
        </div>
        <div className="space-y-1">
          {visible.map((row) => (
            <div key={row.key} className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/40">
                <span className="flex-1 text-xs font-medium text-gray-700">{row.label}</span>
                <ScopePill scope={row.scope} />
                <span className="text-xs font-bold text-gray-900 w-24 text-right">
                  {fmt(bc[row.key])} tCO₂e/yr
                </span>
              </div>
              {row.details && <div className="px-3 pb-2">{row.details}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t-2 border-dashed border-blue-100 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="text-sm font-semibold text-gray-900">Carbon Contribution from Waste Data</h4>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
          calculated
        </span>
      </div>

      <div className="space-y-4 mb-4">
        {solidVisible.length > 0 && <RowGroup rows={solidRows} title="Solid Waste" />}
        {wwVisible.length > 0 && <RowGroup rows={wwRows} title="Wastewater" />}
      </div>

      <div className="border-t border-gray-200 pt-3 space-y-1">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-bold text-gray-900">WASTE TOTAL</span>
          <span className="font-bold text-gray-900">{fmt(wasteTotal)} tCO₂e/yr</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 px-1 flex-wrap">
          {scope1Total > 0 && (
            <span>
              Scope 1: <strong className="text-red-700">{fmt(scope1Total)}</strong>
            </span>
          )}
          {scope2Total > 0 && (
            <span>
              Scope 2: <strong className="text-amber-700">{fmt(scope2Total)}</strong>
            </span>
          )}
          {scope3Total > 0 && (
            <span>
              Scope 3: <strong className="text-blue-700">{fmt(scope3Total)}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  data: any;
  activeSubSection: string;
  carbonResults?: any;
}

function WasteContent({ data, activeSubSection }: { data: any; activeSubSection: string }) {
  switch (activeSubSection) {
    // ── 4.1 SOLID WASTE GENERATION ───────────────────────────────
    case 'solid_generation': {
      const g = data.solidWasteGeneration;
      return (
        <div>
          <DataSection title="Domestic waste">
            <DataField
              label="Wet waste"
              value={g?.domesticWetWasteTonsPerAnnum?.current}
              unit="t/yr"
              source="measured"
              highlight
            />
            <DataField
              label="Dry waste"
              value={g?.domesticDryWasteTonsPerAnnum?.current}
              unit="t/yr"
              source="measured"
            />
            <DataField label="E-waste" value={g?.domesticEWasteTonsPerAnnum?.current} unit="t/yr" />
            <DataField
              label="Bulky waste"
              value={g?.domesticBulkyWasteTonsPerAnnum?.current}
              unit="t/yr"
            />
            <DataField
              label="Wet waste in 5 yr"
              value={g?.domesticWetWasteTonsPerAnnum?.inFiveYears}
              unit="t/yr"
            />
            <DataField
              label="Wet waste in 10 yr"
              value={g?.domesticWetWasteTonsPerAnnum?.inTenYears}
              unit="t/yr"
            />
          </DataSection>

          <DataSection title="Garden & horticulture waste">
            <DataField
              label="Grass cuttings & leaves"
              value={g?.gardenGrassCuttingsLeaves?.current}
              unit="t/yr"
            />
            <DataField
              label="Fruits & vegetables"
              value={g?.gardenFruitsVegetables?.current}
              unit="t/yr"
            />
            <DataField
              label="Twigs & branches"
              value={g?.gardenTwigsBranches?.current}
              unit="t/yr"
            />
            <DataField
              label="Misc green waste"
              value={g?.gardenMiscGreenWaste?.current}
              unit="t/yr"
            />
          </DataSection>

          <DataSection title="Hospital & biomedical">
            <DataField
              label="Non-biomedical"
              value={g?.hospitalNonBiomedicalWaste?.current}
              unit="t/yr"
            />
            <DataField
              label="Biomedical waste"
              value={g?.hospitalBiomedicalWaste?.current}
              unit="t/yr"
              highlight
            />
            <DataField label="Collection system" value={g?.hospitalCollectionSystem} />
            <DataField label="Segregation system" value={g?.hospitalSegregationSystem} />
          </DataSection>

          <DataSection title="Kitchen & food waste">
            <DataField
              label="Liquid kitchen waste"
              value={g?.kitchenLiquidWasteKld?.current}
              unit="KLD"
            />
            <DataField
              label="Solid food waste"
              value={g?.kitchenSolidFoodWaste?.current}
              unit="t/yr"
              highlight
            />
          </DataSection>

          <DataSection title="Construction & demolition">
            <DataField
              label="Generated"
              value={g?.constructionGeneratedWaste?.current}
              unit="t/yr"
            />
            <DataField
              label="Recyclable content"
              value={g?.constructionRecyclableContent?.current}
              unit="t/yr"
            />
          </DataSection>

          <DataSection title="Scrap yard waste">
            <DataField label="Vehicle scrap" value={g?.scrapVehicle?.current} unit="t/yr" />
            <DataField label="E-waste" value={g?.scrapEWaste?.current} unit="t/yr" />
            <DataField label="Machinery scrap" value={g?.scrapMachinery?.current} unit="t/yr" />
          </DataSection>
        </div>
      );
    }

    // ── 4.2 LANDFILL RECORDS ─────────────────────────────────────
    case 'landfill':
      return (
        <div>
          <DataSection title="Landfill sites" count={data.landfillSites?.length ?? 0}>
            {!data.landfillSites?.length ? (
              <div
                className="p-4 bg-amber-50 rounded-xl border border-amber-200
                              text-sm text-amber-700"
              >
                No landfill site records. Engine uses total generation categories with managed
                sanitary MCF = 1.0.
              </div>
            ) : (
              data.landfillSites.map((site: any, i: number) => {
                const lastYearTotal = site.yearWiseAnnualTotals?.length
                  ? site.yearWiseAnnualTotals[site.yearWiseAnnualTotals.length - 1]?.totalTonnes
                  : undefined;
                const annual = site.monthlyRecords?.length
                  ? site.monthlyRecords.reduce((s: number, r: any) => s + (r.wasteTonnes ?? 0), 0)
                  : lastYearTotal;
                const mcf: Record<string, number> = {
                  managed_sanitary: 1.0,
                  semi_controlled: 0.5,
                  uncontrolled_open_dump: 0.4,
                };
                return (
                  <RecordCard
                    key={site.id ?? i}
                    title={site.siteLocationName}
                    subtitle={`${site.landfillType?.replace(/_/g, ' ')} · Start: ${site.startYear ?? '?'}`}
                  >
                    <DataField
                      label="Landfill type"
                      value={site.landfillType?.replace(/_/g, ' ')}
                      highlight
                    />
                    <DataField label="Start year" value={site.startYear} />
                    <DataField label="Biogas capture" value={site.hasBiogasCapture} />
                    {site.hasBiogasCapture && (
                      <DataField
                        label="Capture efficiency"
                        value={site.biogasCaptureEfficiency}
                        unit="%"
                      />
                    )}
                    <DataField
                      label="Monthly records"
                      value={site.monthlyRecords?.length ?? 0}
                      unit="months"
                      source="measured"
                    />
                    <DataField
                      label="Annual total (latest)"
                      value={typeof annual === 'number' ? annual.toFixed(0) : annual}
                      unit="tonnes"
                      source="measured"
                      highlight
                    />
                    <div className="mt-2 px-2 py-1 bg-gray-50 rounded text-xs text-gray-500">
                      MCF applied: {mcf[site.landfillType] ?? 1.0} (
                      {site.landfillType?.replace(/_/g, ' ')})
                    </div>
                  </RecordCard>
                );
              })
            )}
          </DataSection>
        </div>
      );

    // ── 4.3 INCINERATION RECORDS ─────────────────────────────────
    case 'incineration':
      return (
        <div>
          <DataSection
            title="Incineration facilities"
            count={data.incinerationFacilities?.length ?? 0}
          >
            {!data.incinerationFacilities?.length ? (
              <EmptyState message="No incineration facility records" />
            ) : (
              data.incinerationFacilities.map((f: any, i: number) => {
                const annual = f.monthlyRecords?.length
                  ? f.monthlyRecords.reduce((s: number, r: any) => s + (r.wasteTonnes ?? 0), 0)
                  : undefined;
                return (
                  <RecordCard
                    key={f.id ?? i}
                    title={f.facilityNameLocation}
                    subtitle={`${f.incineratorType?.replace(/_/g, ' ')} · ${f.capacityTpd ?? '?'} TPD`}
                  >
                    <DataField
                      label="Incinerator type"
                      value={f.incineratorType?.replace(/_/g, ' ')}
                      highlight
                    />
                    <DataField label="Capacity" value={f.capacityTpd} unit="TPD" />
                    <DataField
                      label="Operating hours"
                      value={f.operatingHoursPerDay}
                      unit="h/day"
                    />
                    <DataField
                      label="Emission factor"
                      value={f.emissionFactorTco2PerTonne}
                      unit="tCO₂/tonne"
                      source={f.emissionFactorTco2PerTonne ? 'measured' : 'estimated'}
                    />
                    <DataField label="Flue gas treatment" value={f.hasFlueGasTreatment} />
                    <DataField
                      label="Monthly records"
                      value={f.monthlyRecords?.length ?? 0}
                      unit="months"
                    />
                    {annual !== undefined && (
                      <DataField
                        label="Annual total"
                        value={annual.toFixed(0)}
                        unit="tonnes"
                        source="measured"
                        highlight
                      />
                    )}
                  </RecordCard>
                );
              })
            )}
          </DataSection>
        </div>
      );

    // ── 4.4 MSW PLANT ────────────────────────────────────────────
    case 'msw_plant':
      return (
        <div>
          <DataSection title="Solid waste management plants" count={data.mswPlants?.length ?? 0}>
            {!data.mswPlants?.length ? (
              <EmptyState message="No MSW plant records" />
            ) : (
              data.mswPlants.map((plant: any, i: number) => (
                <RecordCard
                  key={plant.id ?? i}
                  title={plant.plantName ?? `MSW Plant ${i + 1}`}
                  subtitle={`${plant.plantCapacityTpd ?? '?'} TPD capacity`}
                >
                  <DataField label="Design capacity" value={plant.plantCapacityTpd} unit="TPD" />
                  <DataField
                    label="Actual throughput"
                    value={plant.actualThroughputTpd}
                    unit="TPD"
                    source="measured"
                  />
                  <DataField
                    label="Energy"
                    value={plant.energyConsumptionKwhPerTonne}
                    unit="kWh/tonne"
                    source={plant.energyConsumptionKwhPerTonne ? 'measured' : 'estimated'}
                  />
                  <div className="mt-3">
                    <div className="text-xs font-medium text-gray-600 mb-1.5">
                      Sieve fractions (8 particle-size bands)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500">
                            <th className="text-left py-1.5 px-2">Sieve</th>
                            <th className="text-left py-1.5 px-2">Waste type</th>
                            <th className="text-left py-1.5 px-2">End product</th>
                            <th className="text-right py-1.5 px-2">% of total</th>
                            <th className="text-right py-1.5 px-2">% remaining</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {(plant.sieveFractions ?? []).map((fr: any, fi: number) => (
                            <tr key={fi}>
                              <td className="py-1.5 px-2 font-medium text-gray-700">
                                {fr.sieveSize?.replace(/_/g, ' ')}
                              </td>
                              <td className="py-1.5 px-2 text-gray-600">
                                {fr.typeOfWasteSegregated ?? '—'}
                              </td>
                              <td className="py-1.5 px-2">
                                {fr.endProduct ? (
                                  <span
                                    className={`px-1.5 py-0.5 rounded ${
                                      fr.endProduct.toLowerCase().includes('compost')
                                        ? 'bg-green-100 text-green-700'
                                        : fr.endProduct.toLowerCase().includes('rdf')
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {fr.endProduct}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {fr.percentOfTotalWaste ?? '—'}
                                {fr.percentOfTotalWaste ? '%' : ''}
                              </td>
                              <td className="py-1.5 px-2 text-right text-gray-500">
                                {fr.percentRemainingWaste ?? '—'}
                                {fr.percentRemainingWaste ? '%' : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </RecordCard>
              ))
            )}
          </DataSection>
        </div>
      );

    // ── WASTEWATER GENERATION (3.1) ───────────────────────────────
    case 'ww_generation': {
      const wg = data.wastewaterGeneration;
      return (
        <div>
          <DataSection title="Wastewater generation by source">
            <DataField
              label="Total sewage"
              value={wg?.totalSewageKld?.current}
              unit="KLD"
              source="measured"
              highlight
            />
            <DataField
              label="Sewage in 5 years"
              value={wg?.totalSewageKld?.inFiveYears}
              unit="KLD"
            />
            <DataField
              label="Hospital effluent"
              value={wg?.hospitalEffluentKld?.current}
              unit="KLD"
              source="measured"
              highlight
            />
            <DataField
              label="Kitchen wastewater"
              value={wg?.kitchenWastewaterKld?.current}
              unit="KLD"
              source="measured"
            />
            <DataField
              label="Vehicle wash WW"
              value={wg?.vehicleWashWastewaterKld?.current}
              unit="KLD"
            />
            <DataField label="Greywater reuse feasible" value={wg?.greywaterReuseFeasible} />
            {wg?.greywaterReuseFeasible && (
              <DataField
                label="Greywater reuse capacity"
                value={wg.greywaterReuseCapacityKld}
                unit="KLD"
                highlight
              />
            )}
          </DataSection>
          {(wg?.totalSewageKld?.current ?? 0) > 0 && (
            <div className="mt-2 p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
              Total net WW to treatment:{' '}
              {Math.max(
                (wg?.totalSewageKld?.current ?? 0) +
                  (wg?.hospitalEffluentKld?.current ?? 0) +
                  (wg?.kitchenWastewaterKld?.current ?? 0) -
                  (wg?.greywaterReuseFeasible ? (wg.greywaterReuseCapacityKld ?? 0) : 0),
                0
              ).toFixed(0)}{' '}
              KLD — used in IPCC Tier 1 CH₄ / N₂O calculation
            </div>
          )}
        </div>
      );
    }

    // ── WASTEWATER CHARACTERISTICS (3.2) ─────────────────────────
    case 'ww_characteristics':
      return (
        <div>
          <DataSection title="IS 3025 wastewater characteristics — monthly values">
            <p className="text-xs text-gray-500 mb-4">
              BOD and TKN drive the IPCC Tier 1 methane and nitrous oxide calculations. Cells in red
              exceed CPCB discharge standards.
            </p>
            {(data.wastewaterCharacteristics ?? []).length === 0 ? (
              <EmptyState message="No characteristics data entered" />
            ) : (
              (data.wastewaterCharacteristics ?? []).map((rec: any, i: number) => {
                const isCarbonKey = [
                  'bod',
                  'total_kjeldahl_nitrogen',
                  'ammonical_nitrogen',
                ].includes(rec.parameter);

                const cpcbLimitNum = rec.cpcbLimit
                  ? parseFloat(rec.cpcbLimit.replace(/[≤≥]/g, ''))
                  : undefined;

                return (
                  <div
                    key={rec.id ?? i}
                    className={`mb-4 ${
                      isCarbonKey ? 'bg-blue-50/40 -mx-4 px-4 py-2 rounded-lg' : ''
                    }`}
                  >
                    {isCarbonKey && (
                      <div className="text-xs text-blue-700 font-medium mb-1">
                        ★ Used in CH₄ / N₂O calculation
                      </div>
                    )}
                    <MonthlyMatrix
                      label={rec.parameter?.replace(/_/g, ' ')}
                      unit={rec.unit}
                      monthlyValues={rec.monthlyValues ?? {}}
                      limitValue={
                        cpcbLimitNum !== undefined && !isNaN(cpcbLimitNum)
                          ? cpcbLimitNum
                          : undefined
                      }
                    />
                  </div>
                );
              })
            )}
          </DataSection>
        </div>
      );

    // ── STP / ETP PLANTS (3.3) ────────────────────────────────────
    case 'stp_plants':
      return (
        <div>
          <DataSection title="STP / ETP plants" count={data.stpEtpPlants?.length ?? 0}>
            {!data.stpEtpPlants?.length ? (
              <div
                className="p-4 bg-amber-50 rounded-xl border border-amber-200
                              text-sm text-amber-700"
              >
                No STP/ETP records. MCF = 1.0 (no treatment) applied — maximum methane emission.
              </div>
            ) : (
              data.stpEtpPlants.map((stp: any, i: number) => {
                const m = stp.treatmentMethods ?? {};
                const mcf =
                  m.secondary && !m.isAnaerobic
                    ? 0.1
                    : m.primary && !m.secondary
                      ? 0.6
                      : m.isAnaerobic
                        ? 0.8
                        : 0.9;
                return (
                  <RecordCard
                    key={stp.id ?? i}
                    title={`Plant ${stp.serialNo ?? i + 1} — ${stp.sourceOfWastewater?.replace(/_/g, ' ') ?? '?'}`}
                    subtitle={`${stp.plantCapacityMld ?? '?'} MLD capacity · MCF: ${mcf}`}
                  >
                    <DataField label="Capacity" value={stp.plantCapacityMld} unit="MLD" highlight />
                    <DataField
                      label="Actual inflow"
                      value={stp.actualInflowMld}
                      unit="MLD"
                      source={stp.actualInflowMld ? 'measured' : 'estimated'}
                    />
                    <DataField label="Preliminary stage" value={m.preliminary} />
                    <DataField label="Primary stage" value={m.primary} />
                    <DataField
                      label="Secondary stage"
                      value={
                        m.secondary
                          ? m.isAnaerobic
                            ? 'Yes — anaerobic'
                            : 'Yes — aerobic'
                          : undefined
                      }
                      highlight
                    />
                    <DataField label="Tertiary stage" value={m.tertiary} />
                    <DataField label="Biogas capture" value={m.hasBiogasCapture} />
                    {m.hasBiogasCapture && (
                      <DataField
                        label="Capture efficiency"
                        value={m.biogasCaptureEfficiency}
                        unit="%"
                      />
                    )}
                    <DataField
                      label="Energy (kWh/m³)"
                      value={stp.energyConsumptionKwhPerM3}
                      source={stp.energyConsumptionKwhPerM3 ? 'measured' : 'estimated'}
                    />
                    <DataField
                      label="Effluent BOD"
                      value={stp.effluentBodMgL}
                      unit="mg/L"
                      source="measured"
                    />
                    <DataField
                      label="Effluent disposal"
                      value={stp.effluentDisposalMethod?.replace(/_/g, ' ')}
                    />
                    <div
                      className={`mt-2 px-2 py-1.5 rounded text-xs ${
                        mcf <= 0.1
                          ? 'bg-green-50 text-green-700'
                          : mcf >= 0.8
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      Applied MCF: {mcf} —{' '}
                      {mcf <= 0.1
                        ? 'Aerobic secondary (lowest CH₄)'
                        : mcf >= 0.8
                          ? 'Anaerobic / no treatment (highest CH₄)'
                          : 'Primary treatment only (moderate CH₄)'}
                    </div>
                  </RecordCard>
                );
              })
            )}
          </DataSection>
        </div>
      );

    // ── WATER DEMAND (2.1) ────────────────────────────────────────
    case 'water_demand': {
      const wd = data.water?.demand;
      const rows: [string, any, string][] = [
        ['Residential total', wd?.residentialTotalDemandKld, 'KLD'],
        ['Office total', wd?.officeTotalDemandKld, 'KLD'],
        ['Hospital', wd?.hospitalDemandKld, 'KLD'],
        ['Kitchen & canteen', wd?.kitchenCanteenDemandKld, 'KLD'],
        ['Laundry', wd?.laundryDemandKld, 'KLD'],
        ['Vehicle washing', wd?.vehicleWashingDemandKld, 'KLD'],
        ['Gardening', wd?.gardeningHorticultureDemandKld, 'KLD'],
        ['Fire fighting', wd?.fireFightingStorageKl, 'KL'],
        ['Special uses', wd?.specialUsesDemandKld, 'KLD'],
      ];
      return (
        <div>
          <DataSection title="Water demand by category">
            {!wd ? (
              <EmptyState message="No water demand data entered" />
            ) : (
              <div>
                <div
                  className="grid grid-cols-4 gap-1 mb-2 text-xs text-gray-400
                                font-medium px-0.5"
                >
                  <span className="col-span-2">Category</span>
                  <span className="text-center">Current</span>
                  <span className="text-center">10 yr</span>
                </div>
                {rows.map(([label, val, unit]) =>
                  val?.current !== undefined || val?.inTenYears !== undefined ? (
                    <div
                      key={label}
                      className="grid grid-cols-4 gap-1 py-2 border-b border-gray-50 text-sm"
                    >
                      <span className="col-span-2 text-gray-600">{label}</span>
                      <span className="text-center font-medium">
                        {val?.current ?? '—'}
                        <span className="text-gray-400 text-xs ml-1">{unit}</span>
                      </span>
                      <span className="text-center text-gray-400">{val?.inTenYears ?? '—'}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </DataSection>
        </div>
      );
    }

    // ── WATER SUPPLY & STORAGE (2.2) ─────────────────────────────
    case 'water_supply': {
      const ws = data.water?.supply;
      return (
        <div>
          <DataSection title="Supply sources" count={ws?.sources?.length ?? 0}>
            {!ws?.sources?.length ? (
              <EmptyState message="No supply sources entered" />
            ) : (
              ws.sources.map((src: any, i: number) => (
                <RecordCard
                  key={src.id ?? i}
                  title={src.sourceType?.replace(/_/g, ' ')}
                  subtitle={src.remarks}
                >
                  <DataField label="Current supply" value={src.currentKld} unit="KLD" highlight />
                  <DataField label="In 5 years" value={src.inFiveYearsKld} unit="KLD" />
                  <DataField label="In 10 years" value={src.inTenYearsKld} unit="KLD" />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection title="Storage tanks" count={ws?.storageTanks?.length ?? 0} collapsible>
            {!ws?.storageTanks?.length ? (
              <EmptyState message="No storage tanks entered" />
            ) : (
              ws.storageTanks.map((t: any, i: number) => (
                <RecordCard
                  key={t.id ?? i}
                  title={`${t.typeLabel ?? `Tank ${i + 1}`} (${t.tankCategory})`}
                  subtitle={`${t.capacityKl} KL × ${t.quantity}`}
                >
                  <DataField label="Category" value={t.tankCategory} />
                  <DataField label="Capacity" value={t.capacityKl} unit="KL" />
                  <DataField label="Quantity" value={t.quantity} />
                  <DataField
                    label="Total"
                    value={t.capacityKl * t.quantity}
                    unit="KL"
                    source="calculated"
                    highlight
                  />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection title="Supply frequency">
            <DataField label="Hours/day (current)" value={ws?.supplyHoursPerDay} unit="h" />
            <DataField
              label="Hours/day (in 5 years)"
              value={ws?.supplyHoursPerDayInFiveYears}
              unit="h"
            />
            <DataField
              label="Hours/day (in 10 years)"
              value={ws?.supplyHoursPerDayInTenYears}
              unit="h"
            />
          </DataSection>
        </div>
      );
    }

    // ── WATER TREATMENT PLANTS (2.3) ─────────────────────────────
    case 'wtp':
      return (
        <div>
          <DataSection
            title="Water treatment plants"
            count={data.water?.treatmentPlants?.length ?? 0}
          >
            {!data.water?.treatmentPlants?.length ? (
              <EmptyState message="No WTP records entered" />
            ) : (
              data.water.treatmentPlants.map((wtp: any, i: number) => (
                <RecordCard
                  key={wtp.id ?? i}
                  title={`WTP ${wtp.serialNo ?? i + 1}`}
                  subtitle={`Source: ${wtp.sourceOfWater ?? '?'} · ${wtp.plantCapacityMld} MLD`}
                >
                  <DataField label="Capacity" value={wtp.plantCapacityMld} unit="MLD" highlight />
                  <DataField
                    label="Actual treatment"
                    value={wtp.actualTreatmentMld}
                    unit="MLD"
                    source="measured"
                  />
                  <DataField label="Preliminary" value={wtp.treatmentMethods?.preliminary} />
                  <DataField label="Primary" value={wtp.treatmentMethods?.primary} />
                  <DataField label="Secondary" value={wtp.treatmentMethods?.secondary} />
                  <DataField label="Tertiary" value={wtp.treatmentMethods?.tertiary} />
                  <DataField label="Method details" value={wtp.treatmentMethods?.methodDetails} />
                  <DataField
                    label="Energy (kWh/m³)"
                    value={wtp.energyConsumptionKwhPerM3}
                    source={wtp.energyConsumptionKwhPerM3 ? 'measured' : 'estimated'}
                    highlight
                  />
                </RecordCard>
              ))
            )}
          </DataSection>
        </div>
      );

    // ── RO PLANTS (2.4) ───────────────────────────────────────────
    case 'ro_plants':
      return (
        <div>
          <DataSection title="RO water treatment plants" count={data.water?.roPlants?.length ?? 0}>
            {!data.water?.roPlants?.length ? (
              <EmptyState message="No RO plant records entered" />
            ) : (
              data.water.roPlants.map((ro: any, i: number) => {
                const recovery =
                  ro.inletFlowRateMld && ro.treatedWaterOutputMld
                    ? ((ro.treatedWaterOutputMld / ro.inletFlowRateMld) * 100).toFixed(1)
                    : undefined;
                return (
                  <RecordCard
                    key={ro.id ?? i}
                    title={`RO Plant ${ro.serialNo ?? i + 1}`}
                    subtitle={`Source: ${ro.sourceOfWater ?? '?'} · ${ro.plantCapacityMld} MLD`}
                  >
                    <DataField label="Capacity" value={ro.plantCapacityMld} unit="MLD" highlight />
                    <DataField label="Technology" value={ro.roTechnologyType?.replace(/_/g, ' ')} />
                    <DataField
                      label="Inlet flow"
                      value={ro.inletFlowRateMld}
                      unit="MLD"
                      source="measured"
                    />
                    <DataField
                      label="Product output"
                      value={ro.treatedWaterOutputMld}
                      unit="MLD"
                      source="measured"
                      highlight
                    />
                    <DataField
                      label="Reject flow"
                      value={ro.rejectWaterFlowMld}
                      unit="MLD"
                      source="measured"
                    />
                    <DataField
                      label="Recovery rate"
                      value={recovery}
                      unit="%"
                      source="calculated"
                    />
                    <DataField label="Rejection rate" value={ro.rejectionRatePercent} unit="%" />
                    <DataField
                      label="Energy (kWh/m³)"
                      value={ro.energyConsumptionKwhPerM3}
                      source={ro.energyConsumptionKwhPerM3 ? 'measured' : 'estimated'}
                      highlight
                    />
                  </RecordCard>
                );
              })
            )}
          </DataSection>
        </div>
      );

    // ── WATER QUALITY (2.5) ───────────────────────────────────────
    case 'water_quality':
      return (
        <div>
          <DataSection title="IS 10500:2012 water quality parameters">
            <p className="text-xs text-gray-500 mb-4">
              Compliance tracking — does not affect carbon calculations. Red cells exceed IS 10500
              permissible limits.
            </p>
            {(data.water?.qualityRecords ?? []).length === 0 ? (
              <EmptyState message="No water quality data entered" />
            ) : (
              (data.water?.qualityRecords ?? []).map((rec: any, i: number) => {
                const rawLimit = rec.is10500Limit
                  ? parseFloat(rec.is10500Limit.replace(/[≤≥]/g, '').split('–')[0])
                  : undefined;
                const limitNum = rawLimit !== undefined && !isNaN(rawLimit) ? rawLimit : undefined;
                return (
                  <div key={rec.id ?? i} className="mb-4">
                    <MonthlyMatrix
                      label={rec.parameter?.replace(/_/g, ' ')}
                      unit={rec.unit}
                      monthlyValues={rec.monthlyValues ?? {}}
                      limitValue={limitNum}
                    />
                  </div>
                );
              })
            )}
          </DataSection>
        </div>
      );

    default:
      return <EmptyState message="Select a sub-section from the left nav" />;
  }
}

export const WasteRenderer = ({ data, activeSubSection, carbonResults }: Props) => (
  <div>
    <WasteContent data={data} activeSubSection={activeSubSection} />
    {carbonResults && <WasteCarbonContribution carbonResults={carbonResults} />}
  </div>
);
