import * as XLSX from 'xlsx';
import {
  ILoadProfileStats,
  ISubLoadStats,
  ISubLoadProfileStats,
  IDGGenerationRecord,
  IPlantGenerationMonthly,
  IPlantGenerationUploadMeta,
  ISolarResourceMonthly,
  IWindResourceMonthly,
  RenewableTechnology,
  IDataUploadMeta,
} from '@shared/types/submission.types';

export interface ParsedRow {
  [key: string]: string | number | null;
}

// ── Parse uploaded buffer (XLS/XLSX/CSV) into row objects ────────────────────
export function parseUploadedFile(
  buffer: Buffer,
  originalName: string
): { headers: string[]; rows: ParsedRow[]; totalRows: number } {
  const ext = originalName.split('.').pop()?.toLowerCase();

  let workbook: XLSX.WorkBook;
  if (ext === 'csv') {
    const csvText = buffer.toString('utf-8');
    workbook = XLSX.read(csvText, { type: 'string' });
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: null });

  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
  return { headers, rows: jsonData, totalRows: jsonData.length };
}

// ── Phase 3 shared helpers ─────────────────────────────────────────────────────

function groupByMonth<T>(items: T[], getTs: (item: T) => Date): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const ts = getTs(item);
    const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

function formatMonthLabel(monthIndex: number, year: number): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${months[monthIndex - 1]} ${year}`;
}

function normalizeTechnology(raw: string): RenewableTechnology {
  const lower = raw.toLowerCase();
  if (lower.includes('rooftop')) return 'solar_pv_rooftop';
  if (lower.includes('ground')) return 'solar_pv_ground';
  if (lower.includes('solar')) return 'solar_pv_rooftop';
  if (lower.includes('wind')) return 'wind_turbine';
  if (lower.includes('geothermal')) return 'geothermal';
  if (lower.includes('biomass')) return 'biomass';
  if (lower.includes('hydro')) return 'small_hydro';
  return 'other';
}

function getDominantDirection(degrees: number[]): number {
  const bins = new Array(8).fill(0);
  for (const d of degrees) {
    bins[Math.floor(((d + 22.5) % 360) / 45)]++;
  }
  return (bins.indexOf(Math.max(...bins)) * 45 + 22.5) % 360;
}

function parseTimestamp(value: unknown): Date | null {
  if (!value) return null;
  // Handle Excel numeric date serial
  if (typeof value === 'number') {
    // Excel date serial: days since 1900-01-01
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

function detectGranularity(timestamps: Date[]): '15min' | '30min' | 'hourly' | 'daily' {
  if (timestamps.length < 2) return 'daily';
  const diffMs = timestamps[1].getTime() - timestamps[0].getTime();
  const diffMin = diffMs / 60000;
  if (diffMin <= 16) return '15min';
  if (diffMin <= 31) return '30min';
  if (diffMin <= 61) return 'hourly';
  return 'daily';
}

// ── Column finder helper (case-insensitive, partial keyword match) ─────────────
function findCol(row: ParsedRow, keywords: string[]): string {
  return (
    Object.keys(row).find((k) =>
      keywords.some((kw) => k.toLowerCase().includes(kw.toLowerCase()))
    ) ?? ''
  );
}

function avg(vals: number[]): number | undefined {
  if (!vals.length) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── Extract load profile statistics from raw time-series rows (2.2) ──────────
export function extractLoadProfileStats(rows: ParsedRow[], fileName: string): ILoadProfileStats {
  if (rows.length === 0) return { uploadedFileName: fileName, totalReadings: 0 };

  const sample = rows[0];
  const kwCol = findCol(sample, ['kw', 'active power', ' kw']);
  const pfCol = findCol(sample, ['power factor', 'pf']);
  const vCol = findCol(sample, ['voltage', 'v l-l', 'vll']);
  const hzCol = findCol(sample, ['frequency', 'hz']);
  const tsCol = findCol(sample, ['timestamp', 'time', 'date']);

  const kwValues = rows.map((r) => Number(r[kwCol])).filter((v) => !isNaN(v) && v > 0);
  const pfValues = rows.map((r) => Number(r[pfCol])).filter((v) => !isNaN(v) && v > 0 && v <= 1);
  const vValues = rows.map((r) => Number(r[vCol])).filter((v) => !isNaN(v) && v > 0);
  const hzValues = rows.map((r) => Number(r[hzCol])).filter((v) => !isNaN(v) && v > 0);

  const peakKw = kwValues.length ? Math.max(...kwValues) : undefined;
  const meanKw = avg(kwValues);
  const minKw = kwValues.length ? Math.min(...kwValues) : undefined;
  const lf = peakKw && meanKw ? meanKw / peakKw : undefined;

  // Peak timestamp
  let peakTimestamp: string | undefined;
  if (peakKw !== undefined && kwCol && tsCol) {
    const peakRow = rows.find((r) => Number(r[kwCol]) === peakKw);
    if (peakRow) peakTimestamp = String(peakRow[tsCol]);
  }

  // Measurement granularity
  let granularityMinutes: number | undefined;
  if (tsCol && rows.length >= 2) {
    const t1 = new Date(String(rows[0][tsCol])).getTime();
    const t2 = new Date(String(rows[1][tsCol])).getTime();
    if (!isNaN(t1) && !isNaN(t2) && t2 > t1) {
      granularityMinutes = Math.round((t2 - t1) / 60000);
    }
  }

  const periodFrom = tsCol && rows.length ? String(rows[0][tsCol]) : undefined;
  const periodTo = tsCol && rows.length ? String(rows[rows.length - 1][tsCol]) : undefined;

  return {
    uploadedFileName: fileName,
    uploadedAt: new Date(),
    totalReadings: rows.length,
    measurementGranularityMinutes: granularityMinutes,
    periodFrom,
    periodTo,
    peakDemandKw: peakKw !== undefined ? parseFloat(peakKw.toFixed(2)) : undefined,
    peakDemandTimestamp: peakTimestamp,
    averageDemandKw: meanKw !== undefined ? parseFloat(meanKw.toFixed(2)) : undefined,
    minimumDemandKw: minKw !== undefined ? parseFloat(minKw.toFixed(2)) : undefined,
    loadFactor: lf !== undefined ? parseFloat(lf.toFixed(3)) : undefined,
    averagePowerFactor:
      avg(pfValues) !== undefined ? parseFloat(avg(pfValues)!.toFixed(3)) : undefined,
    averageVoltageVLL:
      avg(vValues) !== undefined ? parseFloat(avg(vValues)!.toFixed(1)) : undefined,
    averageFrequencyHz:
      avg(hzValues) !== undefined ? parseFloat(avg(hzValues)!.toFixed(2)) : undefined,
  };
}

// ── Extract sub-load statistics from uploaded sub-load profile file (2.3) ────
export function extractSubLoadStats(rows: ParsedRow[], fileName: string): ISubLoadProfileStats {
  if (rows.length === 0) {
    return { subLoads: [], uploadedFileName: fileName, uploadedAt: new Date() };
  }

  const sample = rows[0];
  const nameCol = findCol(sample, ['sub-load', 'subload', 'load name', 'name']);
  const kwCol = findCol(sample, ['kw', 'active power']);
  const pfCol = findCol(sample, ['power factor', 'pf']);
  const tsCol = findCol(sample, ['timestamp', 'time', 'date']);

  // Group rows by sub-load name
  const groups: Record<string, ParsedRow[]> = {};
  for (const row of rows) {
    const name = String(row[nameCol] ?? 'Unknown');
    if (!groups[name]) groups[name] = [];
    groups[name].push(row);
  }

  const subLoads: ISubLoadStats[] = Object.entries(groups).map(([name, subRows], idx) => {
    const kwVals = subRows.map((r) => Number(r[kwCol])).filter((v) => !isNaN(v) && v > 0);
    const pfVals = subRows.map((r) => Number(r[pfCol])).filter((v) => !isNaN(v) && v > 0 && v <= 1);
    const peakKw = kwVals.length ? Math.max(...kwVals) : undefined;
    const meanKw = avg(kwVals);
    const lf = peakKw && meanKw ? meanKw / peakKw : undefined;

    const periodFrom = tsCol && subRows.length ? String(subRows[0][tsCol]) : undefined;
    const periodTo =
      tsCol && subRows.length ? String(subRows[subRows.length - 1][tsCol]) : undefined;

    return {
      id: `sub-${idx}-${Date.now()}`,
      subLoadName: name,
      peakDemandKw: peakKw !== undefined ? parseFloat(peakKw.toFixed(2)) : undefined,
      averageDemandKw: meanKw !== undefined ? parseFloat(meanKw.toFixed(2)) : undefined,
      loadFactor: lf !== undefined ? parseFloat(lf.toFixed(3)) : undefined,
      averagePowerFactor:
        avg(pfVals) !== undefined ? parseFloat(avg(pfVals)!.toFixed(3)) : undefined,
      uploadedAt: new Date(),
      uploadedFileName: fileName,
      periodFrom,
      periodTo,
    };
  });

  // Calculate each sub-load's share of total
  const totalAvgKw = subLoads.reduce((s, l) => s + (l.averageDemandKw ?? 0), 0);
  for (const l of subLoads) {
    if (l.averageDemandKw && totalAvgKw > 0) {
      l.percentOfTotalLoad = parseFloat(((l.averageDemandKw / totalAvgKw) * 100).toFixed(1));
    }
  }

  return {
    subLoads,
    uploadedAt: new Date(),
    uploadedFileName: fileName,
    totalSubLoadsKw: parseFloat(totalAvgKw.toFixed(2)),
  };
}

// ── Aggregate DG generation log rows into monthly summaries (2.4) ─────────────
export function aggregateDGGenerationToMonthly(
  rows: ParsedRow[],
  fileName: string
): IDGGenerationRecord[] {
  if (rows.length === 0) return [];

  const sample = rows[0];
  const dgIdCol = findCol(sample, ['dg id', 'dgid', 'dg_id']);
  const tsCol = findCol(sample, ['timestamp', 'date', 'time']);
  const kwhCol = findCol(sample, ['kwh', 'energy', 'generated']);
  const runtimeCol = findCol(sample, ['runtime', 'hours', 'run']);
  const fuelCol = findCol(sample, ['fuel', 'litre', 'liter', 'consumption']);

  // Group by DG ID + month-year key
  const grouped: Record<
    string,
    {
      dgId: string;
      month: string;
      monthIndex: number;
      year: number;
      kwhTotal: number;
      runtimeTotal: number;
      fuelTotal: number;
    }
  > = {};

  for (const row of rows) {
    const dgId = String(row[dgIdCol] ?? 'Unknown');
    let monthKey = 'Unknown';
    let monthIndex = 1;
    let year = new Date().getFullYear();

    if (tsCol && row[tsCol]) {
      const d = new Date(String(row[tsCol]));
      if (!isNaN(d.getTime())) {
        monthKey = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        monthIndex = d.getMonth() + 1;
        year = d.getFullYear();
      }
    }

    const key = `${dgId}||${monthKey}`;
    if (!grouped[key]) {
      grouped[key] = {
        dgId,
        month: monthKey,
        monthIndex,
        year,
        kwhTotal: 0,
        runtimeTotal: 0,
        fuelTotal: 0,
      };
    }
    grouped[key].kwhTotal += Number(row[kwhCol] ?? 0) || 0;
    grouped[key].runtimeTotal += Number(row[runtimeCol] ?? 0) || 0;
    grouped[key].fuelTotal += Number(row[fuelCol] ?? 0) || 0;
  }

  return Object.values(grouped).map((g, idx) => ({
    id: `dg-gen-${idx}-${Date.now()}`,
    dgId: g.dgId,
    month: g.month,
    monthIndex: g.monthIndex,
    year: g.year,
    totalKwhGenerated: parseFloat(g.kwhTotal.toFixed(2)),
    totalRuntimeHours: parseFloat(g.runtimeTotal.toFixed(2)),
    totalFuelConsumptionL: parseFloat(g.fuelTotal.toFixed(2)),
    averageLoadKw:
      g.runtimeTotal > 0 ? parseFloat((g.kwhTotal / g.runtimeTotal).toFixed(2)) : undefined,
    specificFuelConsumptionActual:
      g.kwhTotal > 0 ? parseFloat((g.fuelTotal / g.kwhTotal).toFixed(3)) : undefined,
    dataSource: 'file_upload' as const,
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 PARSE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── 3.1 Renewable Plant Generation ────────────────────────────────────────────
export function parsePlantGenerationToMonthly(
  buffer: Buffer,
  originalName: string
): { monthly: IPlantGenerationMonthly[]; meta: IPlantGenerationUploadMeta } {
  const { rows } = parseUploadedFile(buffer, originalName);
  const warnings: string[] = [];

  type RawReading = {
    ts: Date;
    kwhGenerated: number;
    inverterStatus: string;
    pr?: number;
    outage: boolean;
  };
  const byPlant = new Map<
    string,
    { tech: RenewableTechnology; capacity: number; readings: RawReading[] }
  >();

  for (const row of rows) {
    const sample = row as ParsedRow;
    const plantIdRaw = String(
      sample['Plant ID'] ?? sample['PlantID'] ?? sample['plant_id'] ?? ''
    ).trim();
    const tsRaw = sample['Timestamp'] ?? sample['timestamp'] ?? sample['Date'] ?? sample['date'];
    const kwhRaw =
      sample['kWh Generated'] ?? sample['kWh'] ?? sample['kwh_generated'] ?? sample['energy_kwh'];
    const ts = parseTimestamp(tsRaw);
    const kwh = parseFloat(String(kwhRaw ?? ''));

    if (!plantIdRaw || !ts || isNaN(kwh)) {
      if (warnings.length < 20) warnings.push(`Skipped row: ${JSON.stringify(row)}`);
      continue;
    }

    if (!byPlant.has(plantIdRaw)) {
      const techRaw = String(sample['Technology'] ?? sample['technology'] ?? '');
      const capRaw = parseFloat(
        String(sample['Capacity (kW/kWp)'] ?? sample['Capacity'] ?? sample['capacity_kwp'] ?? '0')
      );
      byPlant.set(plantIdRaw, {
        tech: normalizeTechnology(techRaw),
        capacity: isNaN(capRaw) ? 0 : capRaw,
        readings: [],
      });
    }

    const statusRaw = String(
      sample['Inverter Status'] ?? sample['inverter_status'] ?? ''
    ).toLowerCase();
    const prRaw = parseFloat(
      String(sample['Performance Ratio (%)'] ?? sample['PR'] ?? sample['pr'] ?? '')
    );
    const outageRaw = String(sample['Outage Flag (Y/N)'] ?? sample['outage'] ?? '').toUpperCase();

    byPlant.get(plantIdRaw)!.readings.push({
      ts,
      kwhGenerated: kwh,
      inverterStatus: statusRaw,
      pr: isNaN(prRaw) ? undefined : prRaw,
      outage: outageRaw === 'Y' || outageRaw === 'YES' || outageRaw === '1',
    });
  }

  const allTimestamps = Array.from(byPlant.values())[0]?.readings.map((r) => r.ts) ?? [];
  const granularity = detectGranularity(allTimestamps);

  const monthly: IPlantGenerationMonthly[] = [];
  for (const [plantId, { tech, capacity, readings }] of byPlant) {
    const byMonth = groupByMonth(readings, (r) => r.ts);
    for (const [key, monthReadings] of byMonth) {
      const [yr, mo] = key.split('-').map(Number);
      const prs = monthReadings.map((r) => r.pr).filter((v): v is number => v !== undefined);
      monthly.push({
        plantId,
        technology: tech,
        capacityKwp: capacity,
        month: formatMonthLabel(mo, yr),
        monthIndex: mo,
        year: yr,
        totalKwhGenerated: parseFloat(
          monthReadings.reduce((s, r) => s + r.kwhGenerated, 0).toFixed(2)
        ),
        avgPerformanceRatio: prs.length
          ? parseFloat((prs.reduce((a, b) => a + b, 0) / prs.length).toFixed(2))
          : undefined,
        minPerformanceRatio: prs.length ? parseFloat(Math.min(...prs).toFixed(2)) : undefined,
        outageCount: monthReadings.filter((r) => r.outage).length,
        inverterNormalCount: monthReadings.filter(
          (r) => r.inverterStatus === 'normal' || r.inverterStatus === 'ok'
        ).length,
        inverterFaultCount: monthReadings.filter(
          (r) => r.inverterStatus === 'fault' || r.inverterStatus === 'alarm'
        ).length,
        dataGranularity: granularity,
        readingCount: monthReadings.length,
      });
    }
  }

  monthly.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex));

  const plantIds = Array.from(byPlant.keys());
  const technologies = [...new Set(Array.from(byPlant.values()).map((p) => p.tech))];
  const totalKwh = monthly.reduce((s, r) => s + (r.totalKwhGenerated ?? 0), 0);

  const meta: IPlantGenerationUploadMeta = {
    uploadedAt: new Date().toISOString(),
    originalFilename: originalName,
    rowCount: rows.length,
    dataGranularity: granularity,
    plantIdsFound: plantIds,
    technologiesFound: technologies as RenewableTechnology[],
    totalKwhAllPlants: parseFloat(totalKwh.toFixed(2)),
    warnings,
  };

  return { monthly, meta };
}

// ── 3.2 Solar Resource ────────────────────────────────────────────────────────
export function parseSolarResourceToMonthly(
  buffer: Buffer,
  originalName: string
): { monthly: ISolarResourceMonthly[]; meta: IDataUploadMeta } {
  const { rows } = parseUploadedFile(buffer, originalName);
  const warnings: string[] = [];

  type SolarRow = {
    ts: Date;
    ghi: number;
    poa?: number;
    ambientC?: number;
    moduleC?: number;
    windMs?: number;
  };
  const readings: SolarRow[] = [];

  for (const row of rows) {
    const sample = row as ParsedRow;
    const tsRaw = sample['Timestamp'] ?? sample['timestamp'] ?? sample['Date'];
    const ghiRaw = sample['GHI (W/m²)'] ?? sample['GHI'] ?? sample['ghi_wm2'] ?? sample['ghi'];
    const ts = parseTimestamp(tsRaw);
    const ghi = parseFloat(String(ghiRaw ?? ''));

    if (!ts || isNaN(ghi)) {
      if (warnings.length < 20) warnings.push(`Skipped row: ${JSON.stringify(row)}`);
      continue;
    }

    const poaRaw = sample['POA Irradiance (W/m²)'] ?? sample['POA'] ?? sample['poa'];
    const ambRaw =
      sample['Ambient Temp (°C)'] ?? sample['Ambient Temp'] ?? sample['ambient_temp_c'];
    const modRaw = sample['Module Temp (°C)'] ?? sample['Module Temp'] ?? sample['module_temp_c'];
    const windRaw = sample['Wind Speed (m/s)'] ?? sample['Wind Speed'] ?? sample['wind_ms'];

    readings.push({
      ts,
      ghi,
      poa: parseFloat(String(poaRaw ?? '')) || undefined,
      ambientC: parseFloat(String(ambRaw ?? '')) || undefined,
      moduleC: parseFloat(String(modRaw ?? '')) || undefined,
      windMs: parseFloat(String(windRaw ?? '')) || undefined,
    });
  }

  const granularity = detectGranularity(readings.map((r) => r.ts));
  const intervalHours =
    ({ '15min': 0.25, '30min': 0.5, hourly: 1, daily: 24 } as Record<string, number>)[
      granularity
    ] ?? 1;
  const byMonth = groupByMonth(readings, (r) => r.ts);

  const monthly: ISolarResourceMonthly[] = [];
  for (const [key, monthR] of byMonth) {
    const [yr, mo] = key.split('-').map(Number);
    const ghis = monthR.map((r) => r.ghi).filter((v) => !isNaN(v));
    const poas = monthR.map((r) => r.poa).filter((v): v is number => v !== undefined);
    const ambients = monthR.map((r) => r.ambientC).filter((v): v is number => v !== undefined);
    const modules = monthR.map((r) => r.moduleC).filter((v): v is number => v !== undefined);
    const winds = monthR.map((r) => r.windMs).filter((v): v is number => v !== undefined);

    const peakSunHours = parseFloat(
      (ghis.reduce((s, g) => s + g * intervalHours, 0) / 1000).toFixed(2)
    );

    monthly.push({
      month: formatMonthLabel(mo, yr),
      monthIndex: mo,
      year: yr,
      avgGhiWm2: ghis.length
        ? parseFloat((ghis.reduce((a, b) => a + b, 0) / ghis.length).toFixed(1))
        : undefined,
      peakGhiWm2: ghis.length ? parseFloat(Math.max(...ghis).toFixed(1)) : undefined,
      avgPoaWm2: poas.length
        ? parseFloat((poas.reduce((a, b) => a + b, 0) / poas.length).toFixed(1))
        : undefined,
      peakSunHours,
      avgAmbientTempC: ambients.length
        ? parseFloat((ambients.reduce((a, b) => a + b, 0) / ambients.length).toFixed(1))
        : undefined,
      avgModuleTempC: modules.length
        ? parseFloat((modules.reduce((a, b) => a + b, 0) / modules.length).toFixed(1))
        : undefined,
      avgWindSpeedMs: winds.length
        ? parseFloat((winds.reduce((a, b) => a + b, 0) / winds.length).toFixed(2))
        : undefined,
      dataGranularity: granularity,
      readingCount: monthR.length,
    });
  }

  monthly.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex));

  const meta: IDataUploadMeta = {
    uploadedAt: new Date().toISOString(),
    originalFilename: originalName,
    rowCount: rows.length,
    dataGranularity: granularity,
    warnings,
  };

  return { monthly, meta };
}

// ── 3.3 Wind Resource ─────────────────────────────────────────────────────────
export function parseWindResourceToMonthly(
  buffer: Buffer,
  originalName: string
): { monthly: IWindResourceMonthly[]; meta: IDataUploadMeta } {
  const { rows } = parseUploadedFile(buffer, originalName);
  const warnings: string[] = [];

  type WindRow = {
    ts: Date;
    speedMs: number;
    dirDeg?: number;
    densityKgM3?: number;
    mastH?: number;
  };
  const readings: WindRow[] = [];

  for (const row of rows) {
    const sample = row as ParsedRow;
    const tsRaw = sample['Timestamp'] ?? sample['timestamp'] ?? sample['Date'];
    const speedRaw =
      sample['Wind Speed (m/s)'] ??
      sample['Wind Speed'] ??
      sample['wind_speed_ms'] ??
      sample['wind_ms'];
    const ts = parseTimestamp(tsRaw);
    const speed = parseFloat(String(speedRaw ?? ''));

    if (!ts || isNaN(speed)) {
      if (warnings.length < 20) warnings.push(`Skipped row: ${JSON.stringify(row)}`);
      continue;
    }

    const dirRaw = sample['Direction (°)'] ?? sample['Direction'] ?? sample['wind_direction_deg'];
    const densityRaw =
      sample['Air Density (kg/m³)'] ?? sample['Air Density'] ?? sample['air_density'];
    const mastRaw = sample['Mast Height (m)'] ?? sample['Mast Height'] ?? sample['mast_height_m'];

    readings.push({
      ts,
      speedMs: speed,
      dirDeg: parseFloat(String(dirRaw ?? '')) || undefined,
      densityKgM3: parseFloat(String(densityRaw ?? '')) || undefined,
      mastH: parseFloat(String(mastRaw ?? '')) || undefined,
    });
  }

  const granularity = detectGranularity(readings.map((r) => r.ts));
  const byMonth = groupByMonth(readings, (r) => r.ts);

  const monthly: IWindResourceMonthly[] = [];
  for (const [key, monthR] of byMonth) {
    const [yr, mo] = key.split('-').map(Number);
    const speeds = monthR.map((r) => r.speedMs).filter((v) => !isNaN(v));
    const dirs = monthR.map((r) => r.dirDeg).filter((v): v is number => v !== undefined);
    const dens = monthR.map((r) => r.densityKgM3).filter((v): v is number => v !== undefined);
    const mastH = monthR.find((r) => r.mastH)?.mastH;

    monthly.push({
      month: formatMonthLabel(mo, yr),
      monthIndex: mo,
      year: yr,
      avgWindSpeedMs: speeds.length
        ? parseFloat((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(2))
        : undefined,
      maxWindSpeedMs: speeds.length ? parseFloat(Math.max(...speeds).toFixed(2)) : undefined,
      avgDirectionDeg: dirs.length
        ? parseFloat((dirs.reduce((a, b) => a + b, 0) / dirs.length).toFixed(1))
        : undefined,
      dominantDirectionDeg: dirs.length ? getDominantDirection(dirs) : undefined,
      avgAirDensityKgM3: dens.length
        ? parseFloat((dens.reduce((a, b) => a + b, 0) / dens.length).toFixed(4))
        : undefined,
      mastHeightM: mastH,
      dataGranularity: granularity,
      readingCount: monthR.length,
    });
  }

  monthly.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex));

  const meta: IDataUploadMeta = {
    uploadedAt: new Date().toISOString(),
    originalFilename: originalName,
    rowCount: rows.length,
    dataGranularity: granularity,
    warnings,
  };

  return { monthly, meta };
}
