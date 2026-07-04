import React, { useState } from 'react';
import { DataField, DataSection, RecordCard, EmptyState } from '../ReviewPrimitives';

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

function EfSourceBadge({ source, value }: { source?: string; value?: number }) {
  if (!source) return null;
  let label: string;
  let cls: string;
  if (source.includes('user')) {
    label = `User entered (${value?.toFixed(3) ?? '—'})`;
    cls = 'bg-green-100 text-green-700';
  } else if (source.startsWith('cea')) {
    const year = source.replace('cea_', '');
    label = `CEA ${year} (${value?.toFixed(3) ?? '—'})`;
    cls = 'bg-amber-100 text-amber-700';
  } else {
    label = `Default (${value?.toFixed(3) ?? '—'})`;
    cls = 'bg-white/10 text-gray-300';
  }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{label}</span>;
}

function ElectricalCarbonContribution({ carbonResults }: { carbonResults: any }) {
  const bc = carbonResults.breakdown?.byComponent ?? {};
  const meta = carbonResults.meta ?? {};

  const rows: Array<{ key: string; label: string; scope: 1 | 2 | 3; details?: React.ReactNode }> = [
    {
      key: 'gridElectricity',
      label: 'Grid Electricity',
      scope: 2,
      details: (
        <div className="text-xs text-gray-400 space-y-0.5 mt-1 pl-2">
          {meta.gridKwh > 0 && (
            <div>↳ kWh consumed: {Math.round(meta.gridKwh).toLocaleString()} kWh/yr</div>
          )}
          {meta.gridEFUsed > 0 && (
            <div className="flex items-center gap-1.5">
              ↳ EF used: {meta.gridEFUsed?.toFixed(4)} kg CO₂/kWh{' '}
              <EfSourceBadge source={meta.gridEFSource} value={meta.gridEFUsed} />
            </div>
          )}
          {meta.tdLoss > 0 && <div>↳ T&D loss factor: {meta.tdLoss?.toFixed(1)}%</div>}
          {meta.solarOffsetKwh > 0 && (
            <div>
              ↳ Solar/renewable offset: {Math.round(meta.solarOffsetKwh).toLocaleString()} kWh/yr
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'dieselGenerator',
      label: 'Diesel Generator',
      scope: 1,
      details:
        meta.dgLitresYr > 0 ? (
          <div className="text-xs text-gray-400 space-y-0.5 mt-1 pl-2">
            <div>↳ Fuel consumed: {Math.round(meta.dgLitresYr).toLocaleString()} litres/yr</div>
            <div>↳ EF: 2.65 kg CO₂/litre</div>
          </div>
        ) : null,
    },
    {
      key: 'lpgCooking',
      label: 'LPG Cooking Fuel',
      scope: 1,
      details:
        meta.lpgKgYr > 0 ? (
          <div className="text-xs text-gray-400 space-y-0.5 mt-1 pl-2">
            {meta.lpgCylindersYr > 0 && (
              <div>↳ Cylinders/yr: {Math.round(meta.lpgCylindersYr).toLocaleString()}</div>
            )}
            <div>↳ Weight: {Math.round(meta.lpgKgYr).toLocaleString()} kg LPG</div>
            <div>↳ EF: 3.13 kg CO₂/kg</div>
          </div>
        ) : null,
    },
    { key: 'vehicleFleet', label: 'Vehicle Fleet', scope: 1 },
    { key: 'refrigerantLeakage', label: 'Refrigerant Leakage', scope: 1 },
    { key: 'transformerLosses', label: 'Transformer Losses', scope: 2 },
    { key: 'evCharging', label: 'EV Charging', scope: 2 },
  ];

  const visibleRows = rows.filter((r) => (bc[r.key] ?? 0) > 0);
  if (!visibleRows.length) return null;

  const scope1Total = visibleRows
    .filter((r) => r.scope === 1)
    .reduce((s, r) => s + (bc[r.key] ?? 0), 0);
  const scope2Total = visibleRows
    .filter((r) => r.scope === 2)
    .reduce((s, r) => s + (bc[r.key] ?? 0), 0);
  const electricalTotal = scope1Total + scope2Total;

  return (
    <div className="mt-8 border-t-2 border-dashed border-blue-100 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="text-sm font-semibold text-white">
          Carbon Contribution from Electrical Data
        </h4>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
          calculated
        </span>
      </div>

      <div className="space-y-1 mb-4">
        {visibleRows.map((row) => (
          <div key={row.key} className="border border-white/5 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5/40">
              <span className="flex-1 text-xs font-medium text-gray-200">{row.label}</span>
              <ScopePill scope={row.scope} />
              <span className="text-xs font-bold text-white w-24 text-right">
                {fmt(bc[row.key])} tCO₂e/yr
              </span>
            </div>
            {row.details && <div className="px-3 pb-2">{row.details}</div>}
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 pt-3 space-y-1">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-bold text-white">ELECTRICAL TOTAL</span>
          <span className="font-bold text-white">{fmt(electricalTotal)} tCO₂e/yr</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400 px-1">
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
        </div>
      </div>
    </div>
  );
}

interface Props {
  data: any;
  activePhase: string;
  carbonResults?: any;
}

function ElectricalContent({ data, activePhase }: { data: any; activePhase: string }) {
  switch (activePhase) {
    // ── PHASE 1: ASSET REGISTRY ───────────────────────────────────
    case 'phase1':
      return (
        <div>
          {/* Transformers */}
          <DataSection title="Transformers" count={data.transformers?.length ?? 0} collapsible>
            {!data.transformers?.length ? (
              <EmptyState message="No transformers entered" />
            ) : (
              data.transformers.map((tr: any, i: number) => (
                <RecordCard
                  key={tr.id ?? i}
                  title={tr.transformerId ?? `TR-${i + 1}`}
                  subtitle={`${tr.ratingKva ?? '?'} kVA · ${tr.voltageRatio ?? '?'}`}
                  sourceBadge="measured"
                >
                  <DataField label="Rating" value={tr.ratingKva} unit="kVA" highlight />
                  <DataField label="Voltage ratio" value={tr.voltageRatio} />
                  <DataField
                    label="No-load loss"
                    value={tr.noLoadLossKw}
                    unit="kW"
                    source="measured"
                    highlight
                  />
                  <DataField
                    label="Load loss"
                    value={tr.loadLossKw}
                    unit="kW"
                    source="measured"
                    highlight
                  />
                  <DataField label="Impedance" value={tr.impedancePct} unit="%" />
                  <DataField label="Cooling type" value={tr.coolingType} />
                  <DataField label="Year installed" value={tr.yearOfInstallation} />
                  <DataField label="Efficiency @50%" value={tr.efficiencyAt50Percent} unit="%" />
                  <DataField label="Efficiency @100%" value={tr.efficiencyAt100Percent} unit="%" />
                  <DataField label="Protection type" value={tr.protectionType} />
                </RecordCard>
              ))
            )}
          </DataSection>

          {/* Switchgear */}
          <DataSection title="Switchgear" count={data.switchgear?.length ?? 0} collapsible>
            {!data.switchgear?.length ? (
              <EmptyState message="No switchgear entered" />
            ) : (
              data.switchgear.map((sw: any, i: number) => (
                <RecordCard
                  key={sw.id ?? i}
                  title={sw.panelId ?? `Panel-${i + 1}`}
                  subtitle={`${sw.voltageKv ?? '?'} kV`}
                >
                  <DataField label="Voltage" value={sw.voltageKv} unit="kV" />
                  <DataField label="Bus rating" value={sw.busRatingA} unit="A" />
                  <DataField label="Short circuit" value={sw.shortCircuitRatingKa} unit="kA" />
                  <DataField label="SCADA ready" value={sw.scadaReady} />
                  <DataField label="Metering" value={sw.meteringProvided} />
                </RecordCard>
              ))
            )}
          </DataSection>

          {/* Capacitor Banks */}
          <DataSection title="Capacitor banks" count={data.capacitorBanks?.length ?? 0} collapsible>
            {!data.capacitorBanks?.length ? (
              <EmptyState message="No capacitor banks entered" />
            ) : (
              data.capacitorBanks.map((cb: any, i: number) => (
                <RecordCard
                  key={cb.id ?? i}
                  title={`${cb.kvar ?? '?'} kVAr bank`}
                  subtitle={cb.location ?? ''}
                >
                  <DataField label="Rating" value={cb.kvar} unit="kVAr" />
                  <DataField label="Steps" value={cb.steps} />
                  <DataField label="Control type" value={cb.controlType} />
                  <DataField label="Set PF" value={cb.setPowerFactor} />
                  <DataField
                    label="Avg metered PF"
                    value={cb.averageMeteredPf}
                    source="measured"
                    highlight
                  />
                </RecordCard>
              ))
            )}
          </DataSection>

          {/* DG Sets */}
          <DataSection title="DG sets" count={data.dgSets?.length ?? 0} collapsible>
            {!data.dgSets?.length ? (
              <EmptyState message="No DG sets entered" />
            ) : (
              data.dgSets.map((dg: any, i: number) => (
                <RecordCard
                  key={dg.id ?? i}
                  title={dg.dgId ?? `DG-${i + 1}`}
                  subtitle={`${dg.capacityKva ?? '?'} kVA · ${dg.fuelType ?? '?'}`}
                >
                  <DataField label="Capacity" value={dg.capacityKva} unit="kVA" highlight />
                  <DataField
                    label="Emission factor"
                    value={dg.emissionFactorKgCo2PerKwhr}
                    unit="kgCO₂/kWh"
                    source="measured"
                    highlight
                  />
                  <DataField
                    label="Fuel consumption (monthly)"
                    value={dg.monthlyFuelConsumptionL}
                    unit="L/month"
                    source="measured"
                  />
                  <DataField
                    label="Monthly runtime"
                    value={dg.monthlyRuntimeHours}
                    unit="h/month"
                  />
                  <DataField
                    label="Monthly energy"
                    value={dg.monthlyEnergyGenerationKwhr}
                    unit="kWh/month"
                  />
                  <DataField label="Purpose" value={dg.purpose} />
                </RecordCard>
              ))
            )}
          </DataSection>

          {/* Energy overview */}
          <DataSection title="Energy overview">
            <DataField
              label="Monthly grid consumption"
              value={data.energy?.monthlyConsumptionKwh}
              unit="kWh"
              source="estimated"
              highlight
            />
            <DataField
              label="Solar capacity (Phase 1)"
              value={data.energy?.solarCapacityKw}
              unit="kW"
            />
          </DataSection>
        </div>
      );

    // ── PHASE 2: MEASURED CONSUMPTION ────────────────────────────
    case 'phase2': {
      const operational = data.operational;
      const loadProfileStats = operational?.loadProfileStats;
      return (
        <div>
          <DataSection
            title="Utility bills"
            count={operational?.utilityBills?.length ?? 0}
            collapsible
          >
            {!operational?.utilityBills?.length ? (
              <EmptyState message="No utility bills uploaded" />
            ) : (
              operational.utilityBills.map((bill: any, i: number) => (
                <RecordCard
                  key={i}
                  title={bill.month ?? `Bill ${i + 1}`}
                  subtitle={`Consumer: ${bill.consumerNumber ?? '?'}`}
                  sourceBadge="measured"
                >
                  <DataField
                    label="Units consumed"
                    value={bill.unitConsumedKwhr}
                    unit="kWh"
                    highlight
                  />
                  <DataField
                    label="Solar generated"
                    value={bill.solarUnitGeneratedKwhr}
                    unit="kWh"
                  />
                  <DataField label="kVAh" value={bill.kvah} unit="kVAh" />
                  <DataField label="Max demand (billed)" value={bill.maxDemandKw} unit="kW" />
                  <DataField label="Max demand (kVA)" value={bill.maxDemandKva} unit="kVA" />
                  <DataField label="Contracted MD" value={bill.contractedMaxDemandKva} unit="kVA" />
                  <DataField label="Power factor" value={bill.powerFactor} />
                  <DataField label="PF penalty/incent" value={bill.pfPenaltyIncentiveRs} unit="₹" />
                  <DataField label="Energy charges" value={bill.totalEnergyChargesRs} unit="₹" />
                  <DataField label="Demand charges" value={bill.totalDemandChargesRs} unit="₹" />
                  <DataField label="Tariff code" value={bill.tariffCode} />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection title="Load profile">
            {operational?.hasLoadProfileData && loadProfileStats ? (
              <div>
                <div className="text-xs text-green-600 mb-3 flex items-center gap-2">
                  <span>✓ Load profile data present</span>
                  {loadProfileStats.measurementGranularityMinutes && (
                    <span className="text-gray-400">
                      ({loadProfileStats.measurementGranularityMinutes}-min interval)
                    </span>
                  )}
                </div>
                <DataField
                  label="Peak demand"
                  value={loadProfileStats.peakDemandKw}
                  unit="kW"
                  source="measured"
                  highlight
                />
                <DataField
                  label="Average demand"
                  value={loadProfileStats.averageDemandKw}
                  unit="kW"
                  source="measured"
                />
                <DataField
                  label="Load factor"
                  value={loadProfileStats.loadFactor}
                  source="measured"
                />
                <DataField
                  label="Avg power factor"
                  value={loadProfileStats.averagePowerFactor}
                  source="measured"
                />
                <DataField
                  label="Avg voltage (L-L)"
                  value={loadProfileStats.averageVoltageVLL}
                  unit="V"
                  source="measured"
                />
                {loadProfileStats.uploadedFileName && (
                  <DataField label="Uploaded file" value={loadProfileStats.uploadedFileName} />
                )}
              </div>
            ) : (
              <EmptyState message="No load profile data — using utility bill totals" />
            )}
          </DataSection>

          <DataSection
            title="DG generation log"
            count={operational?.dgGenerationRecords?.length ?? 0}
            collapsible
          >
            {!operational?.dgGenerationRecords?.length ? (
              <EmptyState message="No DG generation log uploaded" />
            ) : (
              operational.dgGenerationRecords.slice(0, 6).map((r: any, i: number) => (
                <RecordCard key={i} title={`${r.dgId} — ${r.month ?? '?'}`} sourceBadge="measured">
                  <DataField
                    label="kWh generated"
                    value={r.totalKwhGenerated}
                    unit="kWh"
                    highlight
                  />
                  <DataField label="Runtime" value={r.totalRuntimeHours} unit="h" />
                  <DataField label="Fuel consumption" value={r.totalFuelConsumptionL} unit="L" />
                </RecordCard>
              ))
            )}
          </DataSection>
        </div>
      );
    }

    // ── PHASE 3: RENEWABLE ENERGY ─────────────────────────────────
    case 'phase3':
      return (
        <div>
          <DataSection title="Plant generation log">
            {(data.plantGenerationMonthly?.length ?? 0) > 0 ? (
              <div>
                <div className="text-xs text-green-600 mb-2">
                  ✓ {data.plantGenerationMonthly!.length} monthly records ·{' '}
                  {[...new Set(data.plantGenerationMonthly!.map((r: any) => r.plantId))].length}{' '}
                  plant(s)
                </div>
                <DataField
                  label="Total annual generation (all plants)"
                  value={data
                    .plantGenerationMonthly!.reduce(
                      (s: number, r: any) => s + (r.totalKwhGenerated ?? 0),
                      0
                    )
                    .toFixed(0)}
                  unit="kWh"
                  source="measured"
                  highlight
                />
                <DataField
                  label="Avg performance ratio"
                  value={(() => {
                    const prs = data
                      .plantGenerationMonthly!.map((r: any) => r.avgPerformanceRatio)
                      .filter(Boolean) as number[];
                    return prs.length
                      ? (prs.reduce((a: number, b: number) => a + b) / prs.length).toFixed(1)
                      : undefined;
                  })()}
                  unit="%"
                  source="measured"
                />
                <DataField
                  label="Source used for carbon offset"
                  value="Actual plant generation logs"
                  source="measured"
                />
              </div>
            ) : (
              <div
                className="p-3 bg-amber-50 rounded-xl border border-amber-200
                              text-sm text-amber-700"
              >
                No plant generation logs — engine falls back to Phase 1 capacity estimate (1,200
                h/year Varanasi).
              </div>
            )}
          </DataSection>

          <DataSection
            title="Solar resource data"
            count={data.solarResourceMonthly?.length ?? 0}
            collapsible
          >
            {(data.solarResourceMonthly?.length ?? 0) > 0 ? (
              data.solarResourceMonthly!.slice(0, 4).map((m: any, i: number) => (
                <RecordCard key={i} title={m.month ?? `Month ${i + 1}`} sourceBadge="measured">
                  <DataField label="Avg GHI" value={m.avgGhiWm2} unit="W/m²" highlight />
                  <DataField label="Peak sun hours" value={m.peakSunHours} unit="kWh/m²" />
                  <DataField label="Avg POA" value={m.avgPoaWm2} unit="W/m²" />
                  <DataField label="Avg module temp" value={m.avgModuleTempC} unit="°C" />
                </RecordCard>
              ))
            ) : (
              <EmptyState message="No solar resource data uploaded" />
            )}
          </DataSection>

          <DataSection title="PV siting" count={data.pvSiting?.length ?? 0} collapsible>
            {!data.pvSiting?.length ? (
              <EmptyState message="No PV siting records" />
            ) : (
              data.pvSiting.map((pv: any, i: number) => (
                <RecordCard
                  key={pv.id ?? i}
                  title={pv.parcelRoofId}
                  subtitle={`${pv.availableAreaM2 ?? '?'} m² · ${pv.roofType ?? '?'}`}
                >
                  <DataField label="Available area" value={pv.availableAreaM2} unit="m²" />
                  <DataField label="Tilt angle" value={pv.tiltDeg} unit="°" />
                  <DataField label="Orientation" value={pv.orientationDeg} unit="°" />
                  <DataField label="Shading" value={pv.shadingPercent} unit="%" />
                  <DataField label="Struct. limit" value={pv.structuralLimitKgM2} unit="kg/m²" />
                  <DataField
                    label="Est. capacity"
                    value={pv.estimatedCapacityKwp}
                    unit="kWp"
                    source="calculated"
                  />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection title="Battery storage" count={data.batteryStorage?.length ?? 0} collapsible>
            {!data.batteryStorage?.length ? (
              <EmptyState message="No battery storage records" />
            ) : (
              data.batteryStorage.map((bs: any, i: number) => (
                <RecordCard
                  key={bs.id ?? i}
                  title={bs.batteryId}
                  subtitle={bs.application?.replace(/_/g, ' ')}
                >
                  <DataField label="Target autonomy" value={bs.targetAutonomyH} unit="h" />
                  <DataField label="Max discharge" value={bs.maxDischargeKw} unit="kW" />
                  <DataField label="Footprint" value={bs.footprintM2} unit="m²" />
                  <DataField label="Interconnection" value={bs.preferredInterconnectionPoint} />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection
            title="Renewable assessment"
            count={data.renewableAssessment?.length ?? 0}
            collapsible
          >
            {!data.renewableAssessment?.length ? (
              <EmptyState message="No renewable assessment records" />
            ) : (
              data.renewableAssessment.map((ra: any, i: number) => (
                <RecordCard
                  key={ra.id ?? i}
                  title={ra.energySource?.replace(/_/g, ' ')}
                  subtitle={`${ra.estimatedInstallationCapacityKw ?? '?'} kW · ₹${ra.estimatedCapexLakhs ?? '?'} L CAPEX`}
                >
                  <DataField
                    label="Inst. capacity"
                    value={ra.estimatedInstallationCapacityKw}
                    unit="kW"
                    highlight
                  />
                  <DataField
                    label="Annual potential"
                    value={ra.approxAnnualGenerationPotentialMwh}
                    unit="MWh"
                    highlight
                  />
                  <DataField label="CAPEX" value={ra.estimatedCapexLakhs} unit="₹ Lakhs" />
                  <DataField label="Payback" value={ra.expectedPaybackYears} unit="years" />
                  <DataField label="Resource" value={ra.avgAnnualResourceAvailability} />
                  <DataField label="Policy constraints" value={ra.policyApprovalConstraints} />
                  <DataField label="Env. constraints" value={ra.environmentalConstraints} />
                </RecordCard>
              ))
            )}
          </DataSection>
        </div>
      );

    // ── PHASE 4: EQUIPMENT AUDIT ──────────────────────────────────
    case 'phase4':
      return (
        <div>
          <DataSection title="Lighting survey" count={data.lightingSurvey?.length ?? 0} collapsible>
            {!data.lightingSurvey?.length ? (
              <EmptyState message="No lighting survey entered" />
            ) : (
              data.lightingSurvey.map((ls: any, i: number) => (
                <RecordCard
                  key={ls.id ?? i}
                  title={`${ls.buildingArea ?? '?'} — ${ls.fixtureType?.replace(/_/g, ' ') ?? '?'}`}
                  subtitle={`${ls.quantity ?? 0} units × ${ls.wattageEach ?? 0}W`}
                >
                  <DataField
                    label="Qty × wattage"
                    value={`${ls.quantity} × ${ls.wattageEach}W`}
                    highlight
                  />
                  <DataField label="Summer h/day" value={ls.hoursPerDaySummer} unit="h" />
                  <DataField label="Winter h/day" value={ls.hoursPerDayWinter} unit="h" />
                  <DataField label="Control type" value={ls.controlType?.replace(/_/g, ' ')} />
                  <DataField label="Proposed LED" value={ls.proposedLedSpec} />
                  <DataField label="Lux target" value={ls.estimatedLuxTarget} unit="lx" />
                  <DataField
                    label="Annual kWh"
                    value={ls.annualKwh?.toFixed(0)}
                    unit="kWh"
                    source="calculated"
                  />
                  <DataField
                    label="kWh after LED upgrade"
                    value={ls.annualKwhAfterLed?.toFixed(0)}
                    unit="kWh"
                    source="calculated"
                  />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection title="Motors & pumps" count={data.motorsPumps?.length ?? 0} collapsible>
            {!data.motorsPumps?.length ? (
              <EmptyState message="No motors or pumps entered" />
            ) : (
              data.motorsPumps.map((m: any, i: number) => {
                const pumpExt = data.pumpingExtensions?.find(
                  (p: any) => p.pumpId === m.equipmentId
                );
                return (
                  <RecordCard
                    key={m.id ?? i}
                    title={m.equipmentId}
                    subtitle={`${m.ratedPowerKw ?? '?'} kW · ${m.efficiencyClass ?? '?'} · ${m.duty ?? '?'}`}
                  >
                    <DataField label="Rated power" value={m.ratedPowerKw} unit="kW" highlight />
                    <DataField label="IE class" value={m.efficiencyClass} />
                    <DataField label="Duty" value={m.duty} />
                    <DataField label="Hours/day" value={m.operatingHoursPerDay} unit="h" />
                    <DataField label="Days/year" value={m.operatingDaysPerYear} unit="days" />
                    <DataField label="VFD feasible" value={m.vfdFeasible} />
                    <DataField label="VFD savings" value={m.estimatedVfdSavingsPercent} unit="%" />
                    <DataField
                      label="Annual kWh"
                      value={m.annualKwh?.toFixed(0)}
                      unit="kWh"
                      source="calculated"
                    />
                    {pumpExt && (
                      <>
                        <DataField
                          label="Metered monthly kWh"
                          value={pumpExt.monthlyKwhConsumption}
                          unit="kWh"
                          source="measured"
                          highlight
                        />
                        <DataField label="Existing automation" value={pumpExt.existingAutomation} />
                        <DataField label="Proposed automation" value={pumpExt.proposedAutomation} />
                      </>
                    )}
                  </RecordCard>
                );
              })
            )}
          </DataSection>
        </div>
      );

    // ── PHASE 5: BILLING ANALYTICS ────────────────────────────────
    case 'phase5':
      return (
        <div>
          <DataSection
            title="Tariff schedules"
            count={data.tariffSchedules?.length ?? 0}
            collapsible
          >
            {!data.tariffSchedules?.length ? (
              <EmptyState message="No tariff schedules entered" />
            ) : (
              data.tariffSchedules.map((t: any, i: number) => (
                <RecordCard
                  key={t.id ?? i}
                  title={`${t.tariffCode ?? '?'} — Consumer ${t.consumerNumber ?? '?'}`}
                >
                  <DataField
                    label="Energy charge"
                    value={t.energyChargePerKwh}
                    unit="₹/kWh"
                    highlight
                  />
                  <DataField label="Demand charge" value={t.demandChargePerKva} unit="₹/kVA" />
                  <DataField label="PF incentive threshold" value={t.pfIncentiveThreshold} />
                  <DataField label="PF penalty threshold" value={t.pfPenaltyThreshold} />
                  <DataField label="PF incentive rate" value={t.pfIncentiveRatePercent} unit="%" />
                  <DataField label="PF penalty rate" value={t.pfPenaltyRatePercent} unit="%" />
                  <DataField label="Surcharges" value={t.surchargesAndTaxesPercent} unit="%" />
                  <DataField label="TOD pricing" value={t.hasTodPricing} />
                  {t.hasTodPricing &&
                    t.todBlocks?.map((block: any, bi: number) => (
                      <DataField
                        key={bi}
                        label={`TOD block — ${block.name ?? bi + 1}`}
                        value={`${block.startTime}–${block.endTime} @ ₹${block.ratePerKwh}/kWh`}
                      />
                    ))}
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection
            title="Contracted vs actual demand"
            count={data.cmdVsActual?.length ?? 0}
            collapsible
          >
            {(data.cmdVsActual ?? []).slice(0, 6).map((cmd: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-gray-50 text-sm"
              >
                <span className="text-gray-300">{cmd.month}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span>
                    CMD: <strong>{cmd.contractedMdKva} kVA</strong>
                  </span>
                  <span
                    className={
                      cmd.billedMdKva > cmd.contractedMdKva
                        ? 'text-red-600 font-medium'
                        : 'text-gray-200'
                    }
                  >
                    Billed: {cmd.billedMdKva ?? '—'} kVA
                    {cmd.billedMdKva > cmd.contractedMdKva && ' ⚠ EXCEEDED'}
                  </span>
                  <span className="text-gray-400">Peak: {cmd.intervalPeakKva ?? '—'} kVA</span>
                </div>
              </div>
            ))}
            {!data.cmdVsActual?.length && <EmptyState message="No CMD records entered" />}
          </DataSection>

          <DataSection title="Power factor trend" count={data.pfTrend?.length ?? 0} collapsible>
            {(data.pfTrend ?? []).slice(0, 6).map((pf: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-gray-50 text-sm"
              >
                <span className="text-gray-300">{pf.month}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span
                    className={`font-medium ${
                      pf.averagePf >= 0.95
                        ? 'text-green-600'
                        : pf.averagePf >= 0.9
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                  >
                    Avg PF {pf.averagePf?.toFixed(3)}
                  </span>
                  {pf.minimumPf && (
                    <span className="text-gray-400">Min {pf.minimumPf.toFixed(3)}</span>
                  )}
                  {pf.penaltyOrIncentiveRs !== undefined && pf.penaltyOrIncentiveRs !== 0 && (
                    <span
                      className={pf.penaltyOrIncentiveRs > 0 ? 'text-red-600' : 'text-green-600'}
                    >
                      {pf.penaltyOrIncentiveRs > 0 ? '−' : '+'}₹
                      {Math.abs(pf.penaltyOrIncentiveRs).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {!data.pfTrend?.length && <EmptyState message="No power factor trend data" />}
          </DataSection>
        </div>
      );

    // ── PHASE 6: GRID EMISSION FACTORS ────────────────────────────
    case 'phase6':
      return (
        <div>
          <DataSection title="Grid emission factors" count={data.gridEmissionFactors?.length ?? 0}>
            {data.gridEmissionFactors?.length ? (
              data.gridEmissionFactors.map((ef: any, i: number) => (
                <RecordCard
                  key={ef.id ?? i}
                  title={`Year ${ef.year} — Consumer ${ef.consumerNumber}`}
                  sourceBadge="measured"
                >
                  <DataField
                    label="Emission factor"
                    value={ef.emissionFactorKgCo2PerKwhr}
                    unit="kgCO₂/kWh"
                    source="measured"
                    highlight
                  />
                  <DataField label="T&D loss" value={ef.tdLossPercent} unit="%" />
                  <DataField
                    label="Gross EF (after T&D)"
                    value={ef.grossEmissionFactor?.toFixed(5)}
                    unit="kgCO₂/kWh"
                    source="calculated"
                    highlight
                  />
                  <DataField label="Source" value={ef.source} />
                  <DataField label="Reference" value={ef.sourceReference} />
                </RecordCard>
              ))
            ) : (
              <div
                className="p-4 bg-amber-50 rounded-xl border border-amber-200
                              text-sm text-amber-700"
              >
                No user-entered emission factor. Carbon engine uses CEA 2023 default (0.716
                kgCO₂/kWh).
              </div>
            )}
          </DataSection>
        </div>
      );

    // ── PHASE 7-8: SCADA + SMART METERING ─────────────────────────
    case 'phase7_8':
      return (
        <div>
          <DataSection
            title="SCADA / BMS systems"
            count={data.scadaSystems?.length ?? 0}
            collapsible
          >
            {!data.scadaSystems?.length ? (
              <EmptyState message="No SCADA systems entered" />
            ) : (
              data.scadaSystems.map((s: any, i: number) => (
                <RecordCard key={s.id ?? i} title={s.systemName}>
                  <DataField label="Protocol" value={s.protocol} />
                  <DataField label="Data points" value={s.pointsCount} />
                  <DataField label="Data rate" value={s.dataRate} />
                  <DataField label="Integrations" value={s.integrations} />
                  <DataField label="Year installed" value={s.yearInstalled} />
                  <DataField
                    label="Energy savings est."
                    value={s.estimatedEnergySavingsPercent}
                    unit="%"
                  />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection
            title="Smart metering plan"
            count={data.smartMeterPlan?.length ?? 0}
            collapsible
          >
            {!data.smartMeterPlan?.length ? (
              <EmptyState message="No smart metering plan entered" />
            ) : (
              data.smartMeterPlan.map((m: any, i: number) => (
                <RecordCard key={m.id ?? i} title={m.meterPoint}>
                  <DataField label="Voltage level" value={m.voltageLevel?.replace(/_/g, ' ')} />
                  <DataField label="CT/PT class" value={m.ctPtClass} />
                  <DataField label="Interval" value={m.intervalMinutes} unit="min" />
                  <DataField label="Communication" value={m.communicationType} />
                  <DataField label="Data retention" value={m.dataRetentionMonths} unit="months" />
                </RecordCard>
              ))
            )}
          </DataSection>
        </div>
      );

    // ── PHASE 9: EV & VEHICLES ────────────────────────────────────
    case 'phase9':
      return (
        <div>
          <DataSection title="EV chargers" count={data.evChargers?.length ?? 0} collapsible>
            {!data.evChargers?.length ? (
              <EmptyState message="No EV chargers entered" />
            ) : (
              data.evChargers.map((ev: any, i: number) => (
                <RecordCard
                  key={ev.id ?? i}
                  title={ev.evseId}
                  subtitle={`${ev.connectorType?.replace(/_/g, ' ')} · ${ev.ratingKw}kW × ${ev.quantity}`}
                >
                  <DataField label="Connector type" value={ev.connectorType?.replace(/_/g, ' ')} />
                  <DataField label="Rating" value={ev.ratingKw} unit="kW" />
                  <DataField label="Quantity" value={ev.quantity} />
                  <DataField label="Diversity factor" value={ev.diversityFactor} />
                  <DataField label="Operating hours" value={ev.operatingHoursPerDay} unit="h/day" />
                  <DataField
                    label="Monthly kWh (metered)"
                    value={ev.monthlyKwhConsumption}
                    unit="kWh"
                    source={ev.monthlyKwhConsumption ? 'measured' : 'estimated'}
                    highlight
                  />
                  <DataField label="Interconnection" value={ev.interconnectionPoint} />
                </RecordCard>
              ))
            )}
          </DataSection>

          <DataSection
            title="Vehicle fleet"
            count={data.vehicleFuelRecords?.length ?? 0}
            collapsible
          >
            {!data.vehicleFuelRecords?.length ? (
              <EmptyState message="No vehicle fleet data entered" />
            ) : (
              data.vehicleFuelRecords.map((v: any, i: number) => (
                <RecordCard
                  key={v.id ?? i}
                  title={v.vehicleType?.replace(/_/g, ' ')}
                  subtitle={`${v.totalQuantity ?? 0} total · ${v.qtyEvs ?? 0} EVs`}
                >
                  <DataField label="Total vehicles" value={v.totalQuantity} />
                  <DataField label="EVs" value={v.qtyEvs} />
                  <DataField label="% EVs" value={v.percentEvs} unit="%" />
                  <DataField
                    label="Annual diesel"
                    value={v.annualDieselLitres}
                    unit="L"
                    source="measured"
                    highlight
                  />
                  <DataField
                    label="Annual kerosene"
                    value={v.annualKeroseneLitres}
                    unit="L"
                    source="measured"
                  />
                  <DataField
                    label="Diesel EF"
                    value={v.dieselEmissionFactorKgCo2PerL}
                    unit="kgCO₂/L"
                  />
                  <DataField
                    label="Kerosene EF"
                    value={v.keroseneEmissionFactorKgCo2PerL}
                    unit="kgCO₂/L"
                  />
                  <DataField
                    label="Annual CO₂e"
                    value={v.annualTransportCo2Kg?.toFixed(0)}
                    unit="kgCO₂e"
                    source="calculated"
                    highlight
                  />
                  <DataField label="EV upgrade target" value={v.plannedUpgradeDate} />
                  <DataField label="EV timeline" value={v.expectedMonthsToFullEv} />
                </RecordCard>
              ))
            )}
          </DataSection>
        </div>
      );

    case 'phase10': {
      const refRecords = data.refrigerantRecords ?? [];
      const fireRecords = data.fireExtinguisherRecords ?? [];
      if (!refRecords.length && !fireRecords.length) return null;

      return (
        <div>
          {/* Refrigerant systems */}
          <DataSection title="Refrigerant systems" count={refRecords.length} collapsible>
            {!refRecords.length ? (
              <EmptyState message="No refrigerant data entered" />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-white/5 mb-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/5">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">
                          Equipment
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">
                          Type
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400">
                          Annual leakage (kg)
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400">
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {refRecords.map((r: any, i: number) => {
                        const leakKg =
                          (r.annualTopUpKg ?? 0) > 0
                            ? r.annualTopUpKg
                            : (r.installationChargeKg ?? 0) *
                              ((r.annualLeakageRatePercent ?? 5) / 100);
                        return (
                          <tr key={r.id ?? i} className="hover:bg-white/5/50">
                            <td className="px-3 py-2 font-medium text-gray-100">
                              {r.equipmentName || '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-400">{r.refrigerantType}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-100">
                              {leakKg > 0 ? leakKg.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">
                              {(r.annualTopUpKg ?? 0) > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                  measured
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                  estimated
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </DataSection>

          {/* Fire extinguishers */}
          <DataSection title="Fire extinguishers (CO₂)" count={fireRecords.length} collapsible>
            {!fireRecords.length ? (
              <EmptyState message="No fire extinguisher data entered" />
            ) : (
              <>
                {fireRecords.map((r: any, i: number) => {
                  const dischKg =
                    ((r.co2ChargeKg ?? 0) * (r.count ?? 1) * (r.annualDischargePercent ?? 5)) / 100;
                  return (
                    <RecordCard
                      key={r.id ?? i}
                      title={r.location || `Record ${i + 1}`}
                      subtitle={`${r.count ?? '?'} units · ${r.co2ChargeKg ?? '?'} kg/unit`}
                    >
                      <DataField label="Location" value={r.location} />
                      <DataField
                        label="CO₂ charge/unit"
                        value={r.co2ChargeKg}
                        unit="kg"
                        source="measured"
                      />
                      <DataField label="Count" value={r.count} />
                      <DataField
                        label="Annual discharge"
                        value={r.annualDischargePercent ?? 5}
                        unit="%"
                      />
                      <DataField
                        label="Est. annual discharge"
                        value={dischKg > 0 ? dischKg.toFixed(2) : undefined}
                        unit="kg CO₂/yr"
                        source="calculated"
                        highlight
                      />
                    </RecordCard>
                  );
                })}
              </>
            )}
          </DataSection>
        </div>
      );
    }

    case 'phase11': {
      const s3 = data.scope3Activities;
      const commute = s3?.commuteRecords ?? [];
      const air = s3?.airTravelRecords ?? [];
      const equip = s3?.officeEquipmentRecords ?? [];
      if (!commute.length && !air.length && !equip.length) {
        return <EmptyState message="No Scope 3 activity data entered" />;
      }

      const commuteTco2e = commute.reduce((s: number, r: any) => {
        return (
          s +
          ((r.numberOfCommuters ?? 0) *
            2 *
            (r.averageOnewayDistanceKm ?? 0) *
            (r.commuteDaysPerYear ?? 0) *
            0.15) /
            1000
        );
      }, 0);
      const airTco2e = air.reduce((s: number, r: any) => {
        const legs = r.isRoundTrip ? 2 : 1;
        const pkm =
          (r.totalPassengerKm ?? 0) > 0
            ? r.totalPassengerKm
            : (r.numberOfTrips ?? 0) * (r.averageDistanceKmPerTrip ?? 0) * legs;
        return s + (pkm * 0.2) / 1000;
      }, 0);
      const equipTco2e = equip.reduce((s: number, r: any) => {
        const usd =
          (r.totalSpend2022USD ?? 0) > 0 ? r.totalSpend2022USD : (r.totalSpendINR ?? 0) / 83;
        return s + (usd * 0.246) / 1000;
      }, 0);

      return (
        <div>
          <DataSection title="Commute" count={commute.length} collapsible>
            {!commute.length ? (
              <EmptyState message="No commute data" />
            ) : (
              <>
                {commute.map((r: any, i: number) => (
                  <RecordCard
                    key={r.id ?? i}
                    title={r.modeOfTransport?.replace('_', ' ') ?? 'Mode'}
                    subtitle={`${r.numberOfCommuters ?? '?'} commuters · ${r.commuteDaysPerYear ?? '?'} days/yr`}
                  >
                    <DataField label="Mode" value={r.modeOfTransport?.replace(/_/g, ' ')} />
                    <DataField
                      label="One-way distance"
                      value={r.averageOnewayDistanceKm}
                      unit="km"
                      source="measured"
                    />
                    <DataField label="Commute days/yr" value={r.commuteDaysPerYear} />
                    <DataField label="Commuters" value={r.numberOfCommuters} highlight />
                  </RecordCard>
                ))}
                <div className="mt-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800 font-medium">
                  Total: {commuteTco2e.toFixed(3)} tCO₂e/yr (Scope 3)
                </div>
              </>
            )}
          </DataSection>

          <DataSection title="Air travel" count={air.length} collapsible>
            {!air.length ? (
              <EmptyState message="No air travel data" />
            ) : (
              <>
                {air.map((r: any, i: number) => {
                  const legs = r.isRoundTrip ? 2 : 1;
                  const pkm =
                    (r.totalPassengerKm ?? 0) > 0
                      ? r.totalPassengerKm
                      : (r.numberOfTrips ?? 0) * (r.averageDistanceKmPerTrip ?? 0) * legs;
                  return (
                    <RecordCard key={r.id ?? i} title={r.purpose || `Trip ${i + 1}`}>
                      <DataField label="Purpose" value={r.purpose} />
                      <DataField
                        label="Total passenger-km"
                        value={r.totalPassengerKm}
                        unit="pkm"
                        source={r.totalPassengerKm ? 'measured' : 'estimated'}
                        highlight
                      />
                      <DataField label="Trip count" value={r.numberOfTrips} />
                      <DataField
                        label="Avg distance/trip"
                        value={r.averageDistanceKmPerTrip}
                        unit="km"
                      />
                      <DataField label="Round trip" value={r.isRoundTrip ? 'Yes' : 'No'} />
                      <DataField
                        label="Derived passenger-km"
                        value={pkm > 0 ? pkm.toFixed(0) : undefined}
                        unit="pkm"
                        source="calculated"
                      />
                    </RecordCard>
                  );
                })}
                <div className="mt-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800 font-medium">
                  Total: {airTco2e.toFixed(3)} tCO₂e (Scope 3)
                </div>
              </>
            )}
          </DataSection>

          <DataSection title="Office / lab equipment procurement" count={equip.length} collapsible>
            {!equip.length ? (
              <EmptyState message="No equipment procurement data" />
            ) : (
              <>
                {equip.map((r: any, i: number) => {
                  const usd =
                    (r.totalSpend2022USD ?? 0) > 0
                      ? r.totalSpend2022USD
                      : (r.totalSpendINR ?? 0) / 83;
                  return (
                    <RecordCard
                      key={r.id ?? i}
                      title={r.description || `Record ${i + 1}`}
                      subtitle={r.year ? String(r.year) : undefined}
                    >
                      <DataField label="Description" value={r.description} />
                      <DataField
                        label="Spend (2022 USD)"
                        value={r.totalSpend2022USD}
                        unit="USD"
                        source={r.totalSpend2022USD ? 'measured' : 'estimated'}
                        highlight
                      />
                      <DataField
                        label="Spend (INR)"
                        value={r.totalSpendINR}
                        unit="₹"
                        source="measured"
                      />
                      <DataField
                        label="Effective USD"
                        value={usd > 0 ? usd.toFixed(0) : undefined}
                        unit="USD"
                        source="calculated"
                      />
                      <DataField label="Year" value={r.year} />
                    </RecordCard>
                  );
                })}
                <div className="mt-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800 font-medium">
                  Total: {equipTco2e.toFixed(3)} tCO₂e (Scope 3)
                </div>
              </>
            )}
          </DataSection>
        </div>
      );
    }

    default:
      return <EmptyState message="Select a phase from the left nav" />;
  }
}

export const ElectricalRenderer = ({ data, activePhase, carbonResults }: Props) => (
  <div>
    <ElectricalContent data={data} activePhase={activePhase} />
    {carbonResults && <ElectricalCarbonContribution carbonResults={carbonResults} />}
  </div>
);
