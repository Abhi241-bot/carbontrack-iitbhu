import { BuildingType } from './building.types';

// ── ENTRY MODE (applies to every section) ──────────────────────────────────
export enum EntryMode {
  CUMULATIVE = 'cumulative', // totals for the whole building
  ROOM_LEVEL = 'room_level', // detail per room type or zone
}

// ── SECTION STATUS (each section has its own review lifecycle) ─────────────
export enum SectionStatus {
  NOT_STARTED = 'not_started',
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  VERIFIED = 'verified',
  REVISION_REQUESTED = 'revision_requested',
}

// ── CUSTOM FIELD — used everywhere to allow freeform additions ─────────────
export interface ICustomField {
  id: string; // client-generated UUID (nanoid)
  label: string; // user-supplied name
  value: number;
  unit?: string;
  notes?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// BUILDING OVERVIEW (static — locked after first admin verification)
// Usage pattern MOVES HERE from the old Step 6
// ══════════════════════════════════════════════════════════════════════════════

export interface IBuildingOverview {
  // ── IDENTITY (from building master list) ──
  buildingName: string;
  buildingType: BuildingType;
  numberOfFloors: number;
  yearOfConstruction?: number;
  primaryPurpose?: string;
  description?: string;

  // ── USAGE & OCCUPANCY (Building_Information_format cols 3-6) ──
  usagesOfBuilding?: string; // Col 3
  frequencyOfUsagePerDay?: number; // Col 4
  numberOfBuildings?: number; // Col 5: identical blocks/wings
  numberOfOccupantsPerBuilding?: number; // Col 6

  // Operational pattern (alias fields kept for backward compat)
  operatingHoursPerDay: number;
  operatingDaysPerWeek: number;
  peakMonths: string[];
  acUsageMonths: string[];
  occupancyDuringBreaks: 'closed' | 'partial' | 'normal';
  averageDailyOccupants?: number; // alias to numberOfOccupantsPerBuilding

  // ── FLOOR AREA ──
  totalFloorArea?: number; // sqm
  areaOfOneBuildingSqFt?: number; // Col 7: sq ft (research format)

  // ── ENVIRONMENTAL DESIGN ──
  ventilationType?: 'natural' | 'mechanical' | 'mixed'; // Col 23
  buildingNature?: 'temporary' | 'permanent'; // Col 24

  // ── BUILDING ORIENTATION (cols 25-28) ──
  orientationNorthPct?: number;
  orientationEastPct?: number;
  orientationSouthPct?: number;
  orientationWestPct?: number;

  // ── LAND USE (Land_Use_Format.xlsx) ──
  landUseOpenPlayAreaAcres?: number;
  landUseGreenPermeableAcres?: number;
  landUsePavedAcres?: number;
  landUseCoveredBuiltUpAcres?: number;
  landUseCustomCategories?: Array<{
    categoryName: string;
    areaAcres: number;
    remarks?: string;
  }>;

  // ── REMARKS ──
  remarks?: string; // Col 31
}

// ══════════════════════════════════════════════════════════════════════════════
// CIVIL SECTION — structure, rooms, materials
// Typically filled once (static), but admin can unlock for major renovations.
// ══════════════════════════════════════════════════════════════════════════════

export enum RoomInputMode {
  QUICK = 'quick',
  TEMPLATE = 'template',
  MANUAL = 'manual',
}

export interface IAppliance {
  id: string; // stable UUID
  type: string; // from APPLIANCE_DEFAULTS keys OR a custom label
  isCustom: boolean; // true if user-added beyond the predefined list
  customLabel?: string; // displayed when isCustom = true
  category: ApplianceCategory;
  count: number; // total quantity of this appliance type
  wattsEach?: number;
  hoursPerDay?: number;
  isDefault?: boolean; // true if auto-populated from ROOM_TEMPLATES
  notes?: string;

  // NEW EFFICIENCY FIELDS (from 1.6_Appliance_Type_F.xls):
  isEnergyEfficientType?: boolean; // Energy Efficient Type (Yes/No)
  efficientTypeRating?: string; // e.g. "LED", "BLDC", "5-Star", "BEE 4-star"
  qtyEfficientUnits?: number; // number already upgraded to efficient type
  percentEfficientUnits?: number; // auto-derived: qtyEfficientUnits/count×100
  qtyNonEfficientUnits?: number; // auto-derived: count - qtyEfficientUnits
  plannedUpgradeDate?: string; // "March 2026" or "Q2 2025"
  expectedMonthsToFullEfficiency?: string; // "18 months", "2 years", etc.
}

export interface IRoom {
  id: string; // client-generated UUID — stable reference
  type: string; // from ROOM_TEMPLATES keys OR a custom label
  isCustomType: boolean; // true if not in the predefined template list
  customTypeLabel?: string; // only used when isCustomType = true
  count: number;
  avgSizeSqm?: number;
  avgOccupancy?: number;
  usageHoursPerDay?: number;
  furnitureDensity?: 'low' | 'medium' | 'high'; // per-room material density (room_level mode)
  // Per-room-type furniture totals (auto-filled from density, or entered manually)
  woodenFurnitureKg?: number;
  steelFurnitureKg?: number;
  plasticKg?: number;
  glassKg?: number;
  notes?: string;
  // Appliance overrides for this room type (used in room_level entry mode)
  // These override the building-level appliance defaults
  applianceOverrides?: IAppliance[];
}

export interface ICivilStructure {
  entryMode: EntryMode; // cumulative or room_level
  roomInputMode: RoomInputMode;
  rooms: IRoom[];
  // Cumulative mode fields (filled instead of rooms when entryMode=CUMULATIVE)
  totalRooms?: number;
  totalUsableArea?: number;
  customRoomTypes?: string[]; // labels for any non-standard room categories recorded
}

export interface ICivilMaterials {
  estimationMode: 'bulk' | 'detailed';
  furnitureDensity?: 'low' | 'medium' | 'high';
  // Detailed mode — furniture
  woodenFurnitureKg?: number;
  steelFurnitureKg?: number;
  plasticKg?: number;
  glassKg?: number;
  // Custom material entries — freeform additions beyond the standard list
  customMaterials: ICustomField[];

  // ── Annexure 8 extended structural materials ──────────────────────────────
  // Concrete
  concretePCC_m3?: number; // PCC M15 concrete volume (m³)
  concreteRCC_m3?: number; // RCC M20 concrete volume (m³)
  // Masonry
  rebar_kg?: number; // Rebar / TMT steel (kg)
  brickMasonry_kg?: number; // Brick masonry (kg)
  ceramicTile_kg?: number; // Ceramic tile 10mm (kg)
  kotaStone_kg?: number; // Kota stone 15mm (kg)
  plaster_kg?: number; // Plaster CS (kg)
  paint_m2?: number; // Painted area (m²)
  stoneMasonry_kg?: number; // Stone masonry (kg)
  // Wood & boards
  woodFrame_kg?: number; // Wood frame (kg)
  plywood_kg?: number; // Plywood panel (kg)  — negative EF (carbon-storing)
  particleBoard_kg?: number; // Pre-laminated particle board (kg) — negative EF
  puffPanel_kg?: number; // Pre-fabricated puff panel (kg)
  // Metals
  steelFrame_kg?: number; // Steel frame (kg)
  steelSection_kg?: number; // Steel section (kg)
  aluminum_kg?: number; // Aluminum (kg)
  // Cladding & finishes
  upvc_kg?: number; // uPVC (kg)
  cgiSheet_kg?: number; // CGI sheet (kg)
  gypsum_kg?: number; // Gypsum sheet (kg)
  asbestos_m2?: number; // Asbestos sheet (m²)
}

// ── Opening elements (Doors_and_windows_format.xlsx) ──────────────────────────

export interface IOpeningElement {
  id: string;
  elementType: 'window' | 'door' | 'clerestory_window' | 'sunshade_chajja' | 'custom';
  customElementLabel?: string;
  dimensionsWxHFt?: string;
  widthFt?: number;
  heightFt?: number;
  count?: number;
  frameMaterial?: string;
  glassType?: string;
  surfaceFinish?: string;
  remarks?: string;
}

export interface ICivilDimensions {
  wallThicknessMm?: number; // Col 8
  internalPartitionMm?: number; // Col 9
  slabThicknessMm?: number; // Col 10
  beamSize?: string; // Col 11
  columnSize?: string; // Col 12
  numberOfRooms?: number; // Col 13
  numberOfWindows?: number; // Col 14
  clearRoomHeightFt?: number; // Col 15
}

export interface ICivilRoof {
  roofMaterials?: string; // Col 16
  roofThicknessMm?: number; // Col 17
}

export interface ICivilConstruction {
  constructionType?: 'load_bearing' | 'rcc' | 'steel_frame' | 'other'; // Col 18
  constructionTypeOther?: string;
  localConstructionPractices?: boolean; // Col 19
  materialSourceDistance?: string; // Col 20
  localMaterialsPercent?: number; // Col 21
  insulationMaterial?: string; // Col 22
  scrapMaterialsUsed?: string; // Col 29
  reusePolicy?: string; // Col 30
}

export interface IRoomOpenings {
  roomId: string; // matches IRoom.id
  elements: IOpeningElement[]; // counts here are per individual room of this type
}

export interface ICivilOpenings {
  elements: IOpeningElement[]; // building-total mode
  roomOpenings?: IRoomOpenings[]; // room-by-room mode
}

export interface ICivilSectionData {
  structure: ICivilStructure;
  dimensions: ICivilDimensions;
  roof: ICivilRoof;
  construction: ICivilConstruction;
  openings: ICivilOpenings;
  materials: ICivilMaterials;
}

// ══════════════════════════════════════════════════════════════════════════════
// ELECTRICAL SECTION — energy sources + appliances
// Dynamic — can be updated after approval (e.g. after a solar panel installation).
// ══════════════════════════════════════════════════════════════════════════════

export enum EnergySource {
  GRID = 'grid',
  SOLAR = 'solar',
  DIESEL = 'diesel',
  MIXED = 'mixed',
}

export interface IElectricalEnergy {
  entryMode: EntryMode;
  primarySource: EnergySource;
  // Cumulative mode
  monthlyConsumptionKwh?: number;
  isEstimated: boolean;
  solarCapacityKw?: number;
  dieselLitersPerMonth?: number; // kept for backward compat — new data uses IDGSet[]
  // Room-level mode: energy per room type
  roomLevelEnergy?: Array<{
    roomType: string;
    count: number;
    monthlyKwhPerRoom: number;
  }>;
  // Custom energy sources (e.g. biogas, wind) — freeform
  customEnergySources: ICustomField[];
}

// TEMPERATURE_CONTROL replaces the old 'cooling' category — includes both
// cooling (ACs, fans, evaporative coolers) and heating equipment.
export enum ApplianceCategory {
  LIGHTING = 'lighting',
  TEMPERATURE_CONTROL = 'temperature_control', // renamed from 'cooling'
  COMPUTING = 'computing',
  LAB_EQUIPMENT = 'lab_equipment',
  MISC = 'misc',
  CUSTOM = 'custom', // for appliances that don't fit any category
}

export interface IElectricalAppliances {
  entryMode: EntryMode;
  // In cumulative mode: flat list of all appliances for the whole building
  // In room_level mode: appliances defined per IRoom (stored in rooms[].applianceOverrides)
  appliances: IAppliance[]; // always populated in cumulative mode
  // Custom appliances added by user beyond standard list
  // Note: custom appliances are stored within appliances[] with isCustom=true.
  // This field just tracks their count for display purposes.
  customApplianceCount: number;
}

// ══════════════════════════════════════════════════════════════════
// PHASE 2 — OPERATIONAL TIME-SERIES DATA TYPES
// ══════════════════════════════════════════════════════════════════

// ── 2.1 UTILITY BILL RECORD ───────────────────────────────────────
// One row = one monthly utility bill for one consumer account.
// STORED AS ARRAY (12 rows × N consumers per year — manageable).
export interface IUtilityBillRecord {
  id: string; // client UUID
  consumerNumber: string; // electricity account / consumer number
  month: string; // "April 2024" — stored as-is
  monthIndex: number; // 1-12 for sorting (Jan=1)
  year: number; // 4-digit year

  // Primary consumption
  unitConsumedKwhr?: number; // grid units consumed (kWh) — PRIMARY for carbon
  solarUnitGeneratedKwhr?: number; // solar generation credited this month
  kvah?: number; // kVAh if measured (apparent energy)

  // Demand
  maxDemandKw?: number;
  maxDemandKva?: number;
  contractedMaxDemandKva?: number;

  // Cost
  energyChargesPerUnit?: number; // ₹/kWh
  demandChargesPerUnit?: number; // ₹/kVA
  totalEnergyChargesRs?: number;
  totalDemandChargesRs?: number;
  solarRebatePerUnit?: number;

  // Power quality
  powerFactor?: number;
  pfPenaltyIncentiveRs?: number; // positive = penalty, negative = incentive

  // Tariff
  tariffCode?: string; // e.g. "LT-2", "HT-1"
  todConsumptionSharePercent?: number; // % on Time-of-Day tariff

  remarks?: string;
}

// ── 2.2 LOAD PROFILE STATISTICS ──────────────────────────────────
// Extracted from uploaded time-series file.
// Raw data (up to 35,040 rows/year) is NOT stored — only these statistics.
export interface ILoadProfileStats {
  uploadedAt?: Date;
  uploadedFileName?: string;
  measurementGranularityMinutes?: number; // 15, 30, 60, or 1440
  periodFrom?: string; // ISO date string
  periodTo?: string;
  totalReadings?: number;

  // Derived statistics
  peakDemandKw?: number;
  peakDemandTimestamp?: string;
  averageDemandKw?: number;
  minimumDemandKw?: number;
  loadFactor?: number; // averageDemand / peakDemand

  peakApparentPowerKva?: number;
  averagePowerFactor?: number;
  averageVoltageVLL?: number;
  averageFrequencyHz?: number;

  // Monthly breakdown (derived from time-series)
  monthlyPeakKw?: Record<string, number>;
  monthlyAvgKw?: Record<string, number>;
  monthlyKwh?: Record<string, number>;

  dataQualityNote?: string;
}

// ── 2.3 SUB-LOAD PROFILE STATISTICS ─────────────────────────────
// One entry per named sub-circuit, extracted from uploaded file.
export interface ISubLoadStats {
  id: string;
  subLoadName: string; // "HVAC", "Lighting", "Lab Equipment"

  peakDemandKw?: number;
  averageDemandKw?: number;
  loadFactor?: number;
  averagePowerFactor?: number;

  percentOfTotalLoad?: number; // this sub-load as % of building total
  estimatedAnnualKwh?: number;

  uploadedAt?: Date;
  uploadedFileName?: string;
  periodFrom?: string;
  periodTo?: string;
  remarks?: string;
}

export interface ISubLoadProfileStats {
  subLoads: ISubLoadStats[];
  uploadedAt?: Date;
  uploadedFileName?: string;
  totalSubLoadsKw?: number;
  coveragePercent?: number;
  dataQualityNote?: string;
}

// ── 2.4 DG GENERATION MONTHLY RECORD ────────────────────────────
// One record = one month's aggregated generation data for one DG ID.
// Links to IDGSet.dgId from Phase 1.
export interface IDGGenerationRecord {
  id: string;
  dgId: string; // LINKS TO IDGSet.dgId
  month: string; // "April 2024"
  monthIndex: number; // 1-12
  year: number;

  totalKwhGenerated?: number;
  totalRuntimeHours?: number;
  totalFuelConsumptionL?: number; // AUTHORITATIVE — used in carbon calculation

  // Derived (auto-computed, not user-entered)
  averageLoadKw?: number; // totalKwh / totalRuntimeHours
  specificFuelConsumptionActual?: number; // totalFuelL / totalKwh (L/kWh actual)

  remarks?: string;
  dataSource?: 'manual_entry' | 'file_upload' | 'meter_reading';
}

// ── OPERATIONAL DATA SECTION ─────────────────────────────────────
export interface IElectricalOperationalData {
  utilityBills: IUtilityBillRecord[];

  loadProfileStats?: ILoadProfileStats;
  hasLoadProfileData: boolean;

  subLoadProfileStats?: ISubLoadProfileStats;
  hasSubLoadData: boolean;

  dgGenerationRecords: IDGGenerationRecord[];
}

// ══════════════════════════════════════════════════════════════════
// END PHASE 2 TYPES
// ══════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// PHASE 3 — RENEWABLE ENERGY SYSTEMS
// ════════════════════════════════════════════════════════════════

// ── SHARED UPLOAD META ────────────────────────────────────────────
export interface IDataUploadMeta {
  uploadedAt: string; // ISO string
  originalFilename: string;
  rowCount: number;
  dataGranularity?: '15min' | '30min' | 'hourly' | 'daily';
  warnings?: string[];
}

// ── 3.1 RENEWABLE PLANTS — MONTHLY AGGREGATE ─────────────────────
export type RenewableTechnology =
  | 'solar_pv_rooftop'
  | 'solar_pv_ground'
  | 'wind_turbine'
  | 'geothermal'
  | 'biomass'
  | 'small_hydro'
  | 'other';

export interface IPlantGenerationMonthly {
  plantId: string;
  technology: RenewableTechnology;
  capacityKwp: number;
  month: string; // "April 2024"
  monthIndex: number;
  year: number;

  totalKwhGenerated?: number;
  avgPerformanceRatio?: number;
  minPerformanceRatio?: number;
  outageCount?: number;
  inverterNormalCount?: number;
  inverterFaultCount?: number;
  dataGranularity?: '15min' | '30min' | 'hourly' | 'daily';
  readingCount?: number;
}

export interface IPlantGenerationUploadMeta extends IDataUploadMeta {
  plantIdsFound: string[];
  technologiesFound: RenewableTechnology[];
  totalKwhAllPlants: number;
}

// ── 3.2 SOLAR RESOURCE — MONTHLY AVERAGES ────────────────────────
export interface ISolarResourceMonthly {
  month: string;
  monthIndex: number;
  year: number;

  avgGhiWm2?: number;
  peakGhiWm2?: number;
  avgPoaWm2?: number;
  peakSunHours?: number; // kWh/m²/month derived from GHI sum
  avgAmbientTempC?: number;
  avgModuleTempC?: number;
  avgWindSpeedMs?: number;
  dataGranularity?: '15min' | '30min' | 'hourly' | 'daily';
  readingCount?: number;
}

// ── 3.3 WIND RESOURCE — MONTHLY AVERAGES ─────────────────────────
export interface IWindResourceMonthly {
  month: string;
  monthIndex: number;
  year: number;

  avgWindSpeedMs?: number;
  maxWindSpeedMs?: number;
  avgDirectionDeg?: number;
  dominantDirectionDeg?: number;
  avgAirDensityKgM3?: number;
  mastHeightM?: number;
  dataGranularity?: '15min' | '30min' | 'hourly' | 'daily';
  readingCount?: number;
}

// ── 3.4 PV SITING — STRUCTURED RECORDS ──────────────────────────
export type RoofType =
  | 'flat_rcc'
  | 'sloped_tile'
  | 'metal_sheet'
  | 'ground_mounted'
  | 'carport'
  | 'other';

export interface IPVSitingRecord {
  id: string;
  parcelRoofId: string;
  availableAreaM2: number;
  tiltDeg?: number;
  orientationDeg?: number;
  shadingPercent?: number;
  roofType?: RoofType;
  roofTypeOther?: string;
  structuralLimitKgM2?: number;
  distanceToInterconnectionM?: number;
  estimatedCapacityKwp?: number; // = availableAreaM2 × 0.15
  remarks?: string;
}

// ── 3.5 BATTERY STORAGE — PLANNING RECORDS ───────────────────────
export type BatteryApplication =
  | 'solar_storage'
  | 'backup_power'
  | 'peak_shaving'
  | 'grid_support'
  | 'ev_charging'
  | 'other';

export interface IBatteryStorageRecord {
  id: string;
  batteryId: string;
  application?: BatteryApplication;
  applicationOther?: string;
  targetAutonomyH?: number;
  maxDischargeKw?: number;
  footprintM2?: number;
  fireCodeConstraints?: string;
  preferredInterconnectionPoint?: string;
  remarks?: string;
}

// ── 3.6 RENEWABLE ASSESSMENT — FEASIBILITY RECORDS ───────────────
export type AssessedEnergySource =
  | 'solar_pv_rooftop'
  | 'solar_pv_ground'
  | 'wind_turbine'
  | 'geothermal'
  | 'biomass'
  | 'small_hydro'
  | 'other';

export interface IRenewableAssessmentRecord {
  id: string;
  energySource: AssessedEnergySource;
  energySourceOther?: string;

  // Site characteristics
  availableLandAreaM2?: number;
  landAreaLocation?: string;
  availableRoofAreaM2?: number;
  roofAreaLocation?: string;
  maxPermissibleHeightM?: number;
  shadingIssues?: boolean;
  shadingDetails?: string;

  // Resource availability
  avgAnnualResourceAvailability?: string;
  existingResourceMeasurements?: boolean;

  // Technical feasibility
  distanceToGridConnectionM?: number;
  maxLoadConnectableKw?: number;
  spaceForStorageM2?: number;
  estimatedInstallationCapacityKw?: number;
  approxAnnualGenerationPotentialMwh?: number;

  // Constraints
  policyApprovalConstraints?: string;
  environmentalConstraints?: string;

  // Economics
  estimatedCapexLakhs?: number;
  expectedPaybackYears?: number;

  remarks?: string;
}

// ── RENEWABLE DATA AVAILABILITY FLAGS ────────────────────────────
export interface IRenewableDataAvailability {
  hasPlantGenerationLog: boolean;
  plantIdsWithGenData: string[];
  hasSolarResourceData: boolean;
  hasWindResourceData: boolean;
  hasPvSitingData: boolean;
  hasBatteryStorageData: boolean;
  hasRenewableAssessment: boolean;

  solarOffsetSource:
    | 'plant_generation_log'
    | 'ghi_derived'
    | 'assessment_estimate'
    | 'utility_bill_solar'
    | 'capacity_estimate'
    | 'none';

  totalCurrentRenewableCapacityKwp: number;
  totalPotentialCapacityKw: number;
  totalAnnualGenerationKwh: number;
  totalPotentialGenerationMwh: number;
}

// ════════════════════════════════════════════════════════════════
// END PHASE 3 TYPES
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// PHASE 4 — EQUIPMENT AUDIT
// ════════════════════════════════════════════════════════════════

// ── 4.1 LIGHTING SURVEY ──────────────────────────────────────────
export type LightingFixtureType =
  | 'fluorescent_tube'
  | 'cfl'
  | 'led_tube'
  | 'led_panel'
  | 'led_downlight'
  | 'incandescent'
  | 'metal_halide'
  | 'sodium_vapour'
  | 'high_bay_led'
  | 'emergency_light'
  | 'outdoor_floodlight'
  | 'other';

export type LightingControlType =
  | 'manual_switch'
  | 'timer'
  | 'occupancy_sensor'
  | 'daylight_sensor'
  | 'dimmer'
  | 'bms_controlled'
  | 'none'
  | 'other';

export interface ILightingSurveyRecord {
  id: string;
  buildingArea: string;
  fixtureType: LightingFixtureType;
  fixtureTypeOther?: string;
  quantity: number;
  wattageEach: number;
  hoursPerDaySummer: number;
  hoursPerDayWinter: number;
  controlType: LightingControlType;
  controlTypeOther?: string;
  proposedLedSpec?: string;
  proposedLedWattage?: number;
  estimatedLuxTarget?: number;
  // Derived (computed client-side):
  annualKwh?: number;
  annualKwhAfterLed?: number;
  annualCo2Kg?: number;
  remarks?: string;
}

// ── 4.2 MOTORS & PUMPS ───────────────────────────────────────────
export type MotorDuty = 'continuous' | 'intermittent' | 'standby' | 'primary';

export type IEEfficiencyClass = 'IE1' | 'IE2' | 'IE3' | 'IE4' | 'unknown';

export type MotorControlType = 'dol' | 'star_delta' | 'vfd' | 'soft_starter' | 'none' | 'other';

export interface IMotorPumpRecord {
  id: string;
  equipmentId: string;
  equipmentDescription?: string;
  duty: MotorDuty;
  ratedPowerKw: number;
  efficiencyClass: IEEfficiencyClass;
  operatingHoursPerDay: number;
  operatingDaysPerYear?: number;
  processFlowM3H?: number;
  headM?: number;
  existingControl: MotorControlType;
  existingControlOther?: string;
  vfdFeasible?: boolean;
  estimatedVfdSavingsPercent?: number;
  // Derived:
  annualKwh?: number;
  annualKwhWithVfd?: number;
  annualCo2Kg?: number;
  remarks?: string;
}

// ════════════════════════════════════════════════════════════════
// PHASE 5 — BILLING ANALYTICS & POWER QUALITY
// ════════════════════════════════════════════════════════════════

// ── 5.1 TARIFF SCHEDULE ──────────────────────────────────────────
export interface ITodBlock {
  name: string;
  startTime: string;
  endTime: string;
  ratePerKwh: number;
}

export interface ITariffSchedule {
  id: string;
  consumerNumber: string;
  tariffCode: string;
  effectiveFrom?: string;
  energyChargePerKwh?: number;
  todBlocks: ITodBlock[];
  hasTodPricing: boolean;
  demandChargePerKva?: number;
  demandChargePerKw?: number;
  pfIncentiveThreshold?: number;
  pfPenaltyThreshold?: number;
  pfIncentiveRatePercent?: number;
  pfPenaltyRatePercent?: number;
  surchargesAndTaxesPercent?: number;
  surchargesDescription?: string;
  remarks?: string;
}

// ── 5.2 CONTRACTED MAX DEMAND vs ACTUAL ──────────────────────────
export interface ICmdVsActualRecord {
  id: string;
  consumerNumber: string;
  month: string;
  monthIndex: number;
  year: number;
  contractedMdKva: number;
  billedMdKva?: number;
  intervalPeakKva?: number;
  // Derived:
  utilizationPercent?: number;
  overDraw?: boolean;
  underUtilizationPercent?: number;
  remarks?: string;
}

// ── 5.3 POWER FACTOR TREND ───────────────────────────────────────
export interface IPowerFactorTrendRecord {
  id: string;
  consumerNumber: string;
  month: string;
  monthIndex: number;
  year: number;
  averagePf: number;
  minimumPf?: number;
  penaltyOrIncentiveRs?: number;
  // Derived:
  pfStatus?: 'good' | 'acceptable' | 'poor';
  cumulativePenaltyRs?: number;
  remarks?: string;
}

// ════════════════════════════════════════════════════════════════
// END PHASE 4 & 5 TYPES
// ════════════════════════════════════════════════════════════════

// ── TRANSFORMER (from 1.2_Transformers_F.xls) ────────────────────
export interface ITransformer {
  id: string; // client UUID
  transformerId: string; // user label e.g. "TR-01", "TR-North"
  location: string; // physical location
  ratingKva: number; // transformer rating in kVA
  voltageRatio?: string; // e.g. "11kV/0.433kV"
  impedancePercent?: number; // % impedance
  noLoadLossKw?: number; // core / no-load losses in kW
  loadLossKw?: number; // copper / load losses at full load in kW
  coolingType?: string; // ONAN, ONAF, OFAF, AN, AF, etc.
  yearOfInstallation?: number;
  lastOilTestDate?: string; // ISO date string or "MM/YYYY"
  efficiencyAt50Percent?: number; // % efficiency at 50% load
  efficiencyAt100Percent?: number; // % efficiency at full load
  protectionType?: string; // e.g. "Buchholz, OTI, WTI, REF"
  remarks?: string;
}

// ── SWITCHGEAR PANEL (from 1.3_Switchgear_F.xls) ─────────────────
export interface ISwitchgearPanel {
  id: string;
  panelId: string; // user label e.g. "MDB-01", "SDB-Lab"
  voltageKv: number; // voltage level in kV e.g. 11, 0.433
  busRatingA?: number; // busbar current rating in Amperes
  shortCircuitRatingKa?: number; // fault withstand rating in kA
  protectionRelays?: string; // list of protection relay types
  meteringProvided?: string; // type of metering installed
  scadaReady?: boolean; // integrated with SCADA system?
  commissionedYear?: number;
}

// ── CAPACITOR BANK (from 1.4_Capacitor_Banks_F.xls) ──────────────
export interface ICapacitorBank {
  id: string;
  location: string; // where installed
  kvar: number; // reactive power compensation in kVAr
  steps?: number; // number of switching steps
  controlType?: 'manual' | 'automatic' | 'other';
  setPowerFactor?: number; // target power factor setting e.g. 0.95
  averageMeteredPf?: number; // actual average measured power factor
  commissionedYear?: number;
  remarks?: string;
}

// ── DG SET (from 1.5_DG_Sets_F.xls) — CRITICAL FOR CARBON ────────
export type DGFuelType = 'diesel' | 'hsd' | 'natural_gas' | 'lpg' | 'biogas' | 'other';

export interface IDGSet {
  id: string;
  dgId: string; // user label e.g. "DG-01", "DG-Emergency"
  capacityKva: number; // nameplate capacity in kVA
  purpose?: 'emergency' | 'standby' | 'prime' | 'peak_shaving' | 'other';
  purposeOther?: string;
  location?: string;
  fuelType: DGFuelType;
  fuelTypeOther?: string; // if fuelType = 'other'
  emissionReductionRetrofitPercent?: number; // % reduction from retrofitting
  // Emission factors — if provided, override engine defaults
  emissionFactorKgCo2PerKwhr?: number; // kgCO₂ per kWh generated
  emissionFactorKgCo2PerL?: number; // kgCO₂ per litre of fuel burned
  fuelPriceRs?: number; // current fuel price in Rs/litre
  specificFuelConsumptionLPerKwh?: number; // L/kWh at typical load
  // Monthly operational data (averages)
  monthlyRuntimeHours?: number; // average hours running per month
  monthlyFuelConsumptionL?: number; // average fuel consumed per month (L)
  monthlyEnergyGenerationKwhr?: number; // average electricity generated per month
  commissionedYear?: number;
  // Derived — computed by the UI:
  estimatedAnnualCo2Kg?: number; // preview of annual emissions from this DG
}

// ── PROJECTION ENTRY (one cell in the 5-horizon matrix) ──────────
export interface IProjectionEntry {
  data?: string | number; // numeric or yes/no or free text
  remark?: string; // context note
}

// Time horizon — 5 planning horizons per question
export type IProjectionHorizons = {
  thisYear?: IProjectionEntry;
  nextYear?: IProjectionEntry;
  threeYears?: IProjectionEntry;
  fiveYears?: IProjectionEntry;
  tenYears?: IProjectionEntry;
};

// ── ELECTRICAL PROJECTIONS MATRIX (from 1.7_Description_F.xls) ───
export interface IElectricalProjectionsMatrix {
  // Category 1: Contract & Current Status
  q1SanctionedLoadKva?: IProjectionHorizons;
  q2AvgUtilizationPercent?: IProjectionHorizons;
  q3AvgMonthlyConsumptionKwh?: IProjectionHorizons;
  // Category 2: Future Expansion
  q4NewBuildingsPlanned?: IProjectionHorizons;
  q5NewBuildingsAndLoadKw?: IProjectionHorizons;
  q6NewFacilitiesPlanned?: IProjectionHorizons;
  q7NewFacilitiesLoadKw?: IProjectionHorizons;
  // Category 3: Equipment Changes
  q8HighLoadEquipmentPlanned?: IProjectionHorizons;
  q9EstimatedLoadAdditionKw?: IProjectionHorizons;
  q10EfficiencyUpgradesPlanned?: IProjectionHorizons;
  q11EstimatedLoadReductionPct?: IProjectionHorizons;
  // Category 4: Renewable Integration
  q12SolarPlantPlanned?: IProjectionHorizons;
  q13SolarCapacityKw?: IProjectionHorizons;
  q14HybridSystemPlanned?: IProjectionHorizons;
  q15RenewableContributionPct?: IProjectionHorizons;
  // Category 5: Backup Power
  q16DgCapacityAndHoursPerDay?: IProjectionHorizons;
  q17DgUpgradePlanned?: IProjectionHorizons;
  q18ProjectedDieselLPerYear?: IProjectionHorizons;
  // Category 6: Load Patterns
  q19PeakDemandChangeKw?: IProjectionHorizons;
  q20BaseDemandChangeKw?: IProjectionHorizons;
  q21SeasonalEventsExpected?: IProjectionHorizons;
  // Category 7: Growth Rates (Q22 sub-parts a-h)
  q22aGridConsumptionGrowthPct?: IProjectionHorizons;
  q22bGridTariffGrowthPct?: IProjectionHorizons;
  q22cSolarGenerationGrowthPct?: IProjectionHorizons;
  q22dSolarSubsidyGrowthPct?: IProjectionHorizons;
  q22eCmdGrowthPct?: IProjectionHorizons;
  q22fDgConsumptionGrowthPct?: IProjectionHorizons;
  q22gDgFuelConsumptionGrowthPct?: IProjectionHorizons;
  q22hFuelPriceGrowthPct?: IProjectionHorizons;
  // Category 8: Other
  q23OtherDetails?: string;
}

// ════════════════════════════════════════════════════════════════
// PHASE 6 — GRID EMISSION FACTORS
// ════════════════════════════════════════════════════════════════

export type EmissionFactorSource =
  | 'cea_published'
  | 'state_discom'
  | 'iea'
  | 'ipcc'
  | 'measured'
  | 'other';

export interface IGridEmissionFactor {
  id: string;
  consumerNumber: string;
  year: number;
  source: EmissionFactorSource;
  sourceOther?: string;
  sourceReference?: string;
  emissionFactorKgCo2PerKwhr: number;
  tdLossPercent?: number;
  grossEmissionFactor?: number;
  remarks?: string;
}

// ════════════════════════════════════════════════════════════════
// PHASE 7 — PUMPING & AUTOMATION
// ════════════════════════════════════════════════════════════════

export interface IPumpingExtension {
  pumpId: string;
  monthlyKwhConsumption?: number;
  existingAutomation?: string;
  proposedAutomation?: string;
}

export type ScadaProtocol =
  | 'modbus_tcp'
  | 'modbus_rtu'
  | 'dnp3'
  | 'iec_61850'
  | 'bacnet'
  | 'opc_ua'
  | 'profibus'
  | 'other';

export interface IScadaSystem {
  id: string;
  systemName: string;
  protocol?: ScadaProtocol;
  protocolOther?: string;
  pointsCount?: number;
  dataRate?: string;
  integrations?: string;
  yearInstalled?: number;
  estimatedEnergySavingsPercent?: number;
  remarks?: string;
}

// ════════════════════════════════════════════════════════════════
// PHASE 8 — SMART METERING PLAN
// ════════════════════════════════════════════════════════════════

export type MeterVoltageLevel = 'lv_415v' | 'mv_11kv' | 'mv_33kv' | 'hv_66kv' | 'other';

export type MeterCommunicationType =
  | 'rs485'
  | 'ethernet'
  | 'gsm_gprs'
  | 'lorawan'
  | 'zigbee'
  | 'plc'
  | 'fiber'
  | 'other';

export interface ISmartMeterPlan {
  id: string;
  meterPoint: string;
  voltageLevel: MeterVoltageLevel;
  voltageLevelOther?: string;
  ctPtClass?: string;
  intervalMinutes?: number;
  communicationType?: MeterCommunicationType;
  communicationTypeOther?: string;
  dataRetentionMonths?: number;
  remarks?: string;
}

// ════════════════════════════════════════════════════════════════
// PHASE 9 — EV CHARGING & VEHICLES
// ════════════════════════════════════════════════════════════════

export type EvConnectorType =
  | 'type2_ac'
  | 'ccs2'
  | 'chademo'
  | 'bharat_ac001'
  | 'bharat_dc001'
  | 'type1_ac'
  | 'other';

export interface IEvCharger {
  id: string;
  evseId: string;
  connectorType: EvConnectorType;
  connectorTypeOther?: string;
  ratingKw: number;
  quantity: number;
  diversityFactor?: number;
  operatingHoursPerDay?: number;
  monthlyKwhConsumption?: number;
  interconnectionPoint?: string;
  peakLoadKw?: number;
  annualKwh?: number;
  remarks?: string;
}

export type VehicleType =
  | 'jeep_utility'
  | 'truck'
  | 'motorcycle'
  | 'generator_vehicle'
  | 'bus'
  | 'car'
  | 'tractor'
  | 'boat'
  | 'other';

export type VehicleFuelType =
  | 'diesel'
  | 'kerosene'
  | 'petrol'
  | 'cng'
  | 'lpg'
  | 'electric'
  | 'other';

export interface IVehicleFuelRecord {
  id: string;
  vehicleType: VehicleType;
  vehicleTypeOther?: string;
  customLabel?: string;
  totalQuantity?: number;
  qtyEvs?: number;
  percentEvs?: number;
  monthlyDieselLitres?: number;
  annualDieselLitres?: number;
  dieselPriceRsPerL?: number;
  dieselEmissionFactorKgCo2PerL?: number;
  monthlyKeroseneLitres?: number;
  annualKeroseneLitres?: number;
  kerosenepriceRsPerL?: number;
  keroseneEmissionFactorKgCo2PerL?: number;
  plannedUpgradeDate?: string;
  expectedMonthsToFullEv?: string;
  annualDieselCo2Kg?: number;
  annualKeroseneCo2Kg?: number;
  annualTransportCo2Kg?: number;
  remarks?: string;
}

// ════════════════════════════════════════════════════════════════
// END PHASE 6-9 TYPES
// ════════════════════════════════════════════════════════════════

// ── PHASE 11: SCOPE 3 ACTIVITIES ────────────────────────────────
export interface ICommuteRecord {
  id: string;
  modeOfTransport: 'bus' | 'train' | 'two_wheeler' | 'car' | 'cycle' | 'walking' | 'other';
  averageOnewayDistanceKm?: number;
  commuteDaysPerYear?: number;
  numberOfCommuters?: number;
  notes?: string;
}

export interface IAirTravelRecord {
  id: string;
  purpose: string;
  totalPassengerKm?: number;
  numberOfTrips?: number;
  averageDistanceKmPerTrip?: number;
  isRoundTrip?: boolean;
  notes?: string;
}

export interface IOfficeEquipmentRecord {
  id: string;
  description: string;
  totalSpend2022USD?: number;
  totalSpendINR?: number;
  year?: number;
  notes?: string;
}

export interface IScope3Activities {
  commuteRecords?: ICommuteRecord[];
  airTravelRecords?: IAirTravelRecord[];
  officeEquipmentRecords?: IOfficeEquipmentRecord[];
}

// ── PHASE 10: REFRIGERANTS & FIRE EXTINGUISHERS ─────────────────
export interface IRefrigerantRecord {
  id: string;
  equipmentName: string;
  refrigerantType: 'R22' | 'R407C' | 'R134A' | 'R410A' | 'R404A' | 'R32';
  installationChargeKg?: number;
  annualLeakageRatePercent?: number;
  annualTopUpKg?: number;
  notes?: string;
}

export interface IFireExtinguisherRecord {
  id: string;
  location?: string;
  co2ChargeKg?: number;
  count?: number;
  annualDischargePercent?: number;
  notes?: string;
}

export interface IElectricalSectionData {
  // ── SECTION 1: ELECTRICAL INFRASTRUCTURE ─────────────────────
  transformers: ITransformer[];
  switchgear: ISwitchgearPanel[];
  capacitorBanks: ICapacitorBank[];

  // ── SECTION 2: DG SETS / BACKUP POWER ────────────────────────
  dgSets: IDGSet[];

  // ── SECTION 3: GRID ENERGY SOURCES ───────────────────────────
  energy: {
    entryMode: EntryMode;
    primarySource: EnergySource;
    monthlyConsumptionKwh?: number;
    isEstimated: boolean;
    solarCapacityKw?: number;
    customEnergySources: ICustomField[];
    // kept for backward compat migration path only:
    dieselLitersPerMonth?: number;
  };

  // ── SECTION 4: APPLIANCES ─────────────────────────────────────
  appliances: {
    entryMode: EntryMode;
    appliances: IAppliance[];
    customApplianceCount: number;
  };

  // ── SECTION 5: DEMAND PROJECTIONS ────────────────────────────
  projections: IElectricalProjectionsMatrix;

  // ── SECTION 6: OPERATIONAL DATA (Phase 2) ─────────────────────
  operational: IElectricalOperationalData;

  // ── PHASE 3 FIELDS ──────────────────────────────────────────────

  // 3.1: Plant generation — monthly aggregates per plant from CSV
  plantGenerationMonthly: IPlantGenerationMonthly[];
  plantGenerationUploadMeta?: IPlantGenerationUploadMeta;

  // 3.2: Solar resource — monthly averages from CSV
  solarResourceMonthly: ISolarResourceMonthly[];
  solarResourceUploadMeta?: IDataUploadMeta;

  // 3.3: Wind resource — monthly averages from CSV
  windResourceMonthly: IWindResourceMonthly[];
  windResourceUploadMeta?: IDataUploadMeta;

  // 3.4: PV siting records — low volume, manual entry
  pvSiting: IPVSitingRecord[];

  // 3.5: Battery storage planning — low volume, manual entry
  batteryStorage: IBatteryStorageRecord[];

  // 3.6: Renewable assessment — feasibility per technology
  renewableAssessment: IRenewableAssessmentRecord[];

  // Availability flags computed when Phase 3 data changes
  renewableDataAvailability?: IRenewableDataAvailability;

  // ── PHASE 4 FIELDS ──────────────────────────────────────────────
  lightingSurvey: ILightingSurveyRecord[];
  motorsPumps: IMotorPumpRecord[];

  // ── PHASE 5 FIELDS ──────────────────────────────────────────────
  tariffSchedules: ITariffSchedule[];
  cmdVsActual: ICmdVsActualRecord[];
  pfTrend: IPowerFactorTrendRecord[];

  // ── PHASE 6 FIELDS ──────────────────────────────────────────────
  gridEmissionFactors: IGridEmissionFactor[];

  // ── PHASE 7 FIELDS ──────────────────────────────────────────────
  pumpingExtensions: IPumpingExtension[];
  scadaSystems: IScadaSystem[];

  // ── PHASE 8 FIELDS ──────────────────────────────────────────────
  smartMeterPlan: ISmartMeterPlan[];

  // ── PHASE 9 FIELDS ──────────────────────────────────────────────
  evChargers: IEvCharger[];
  vehicleFuelRecords: IVehicleFuelRecord[];

  // ── PHASE 10 FIELDS ─────────────────────────────────────────────
  refrigerantRecords?: IRefrigerantRecord[];
  fireExtinguisherRecords?: IFireExtinguisherRecord[];

  // ── PHASE 11 FIELDS ─────────────────────────────────────────────
  scope3Activities?: IScope3Activities;
}

// ══════════════════════════════════════════════════════════════════════════════
// WASTE SECTION — solid waste streams + liquid waste (wastewater)
// Dynamic — waste practices can change.
// ══════════════════════════════════════════════════════════════════════════════

export enum SolidWasteDisposalMethod {
  UNMANAGED_DUMP = 'unmanaged_dump',
  COMPOSTING = 'composting',
  RECYCLING = 'recycling',
  OPEN_BURNING = 'open_burning',
  MANAGED_LANDFILL = 'managed_landfill',
}

export enum WastewaterTreatmentType {
  UNMANAGED_SEPTIC = 'unmanaged_septic',
  MUNICIPAL_STP = 'municipal_stp',
  CAMPUS_STP = 'campus_stp',
}

export interface ISolidWasteStream {
  id: string; // stable UUID
  disposalMethod: SolidWasteDisposalMethod | string; // string allows custom methods
  isCustomMethod: boolean;
  customMethodLabel?: string;
  fractionPercent: number; // must sum to 100 across all streams
}

// ════════════════════════════════════════════════════════════════
// SOLID WASTE PHASE 3 — Files 4.1, 4.2, 4.3, 4.4
// ════════════════════════════════════════════════════════════════

// ── 4.1 SOLID WASTE GENERATION BY CATEGORY ───────────────────────

export interface ISolidWasteHorizon {
  current?: number;
  inFiveYears?: number;
  inTenYears?: number;
}

export interface ISolidWasteGeneration {
  // ── DOMESTIC WASTE ──
  domesticWetWasteTonsPerAnnum?: ISolidWasteHorizon;
  domesticDryWasteTonsPerAnnum?: ISolidWasteHorizon;
  domesticEWasteTonsPerAnnum?: ISolidWasteHorizon;
  domesticBulkyWasteTonsPerAnnum?: ISolidWasteHorizon;

  // ── GARDEN AND HORTICULTURE WASTE ──
  gardenGrassCuttingsLeaves?: ISolidWasteHorizon;
  gardenFruitsVegetables?: ISolidWasteHorizon;
  gardenTwigsBranches?: ISolidWasteHorizon;
  gardenMiscGreenWaste?: ISolidWasteHorizon;

  // ── HOSPITAL AND BIOMEDICAL WASTE ──
  hospitalNonBiomedicalWaste?: ISolidWasteHorizon;
  hospitalBiomedicalWaste?: ISolidWasteHorizon;
  hospitalCollectionSystem?: 'manual' | 'mechanical';
  hospitalSegregationSystem?: boolean;
  hospitalTotalBiomedicalWaste?: ISolidWasteHorizon;

  // ── KITCHEN AND FOOD WASTE ──
  kitchenLiquidWasteKld?: ISolidWasteHorizon; // KLD
  kitchenSolidFoodWaste?: ISolidWasteHorizon;

  // ── CONSTRUCTION & DEMOLITION WASTE ──
  constructionGeneratedWaste?: ISolidWasteHorizon;
  constructionRecyclableContent?: ISolidWasteHorizon;

  // ── OTHER ORGANIC WASTE ──
  otherSlaughterWaste?: ISolidWasteHorizon;
  otherAnimalWaste?: ISolidWasteHorizon;
  otherCompostWaste?: ISolidWasteHorizon;

  // ── SCRAP YARD WASTE ──
  scrapVehicle?: ISolidWasteHorizon;
  scrapEWaste?: ISolidWasteHorizon;
  scrapMachinery?: ISolidWasteHorizon;

  // Derived totals (computed client-side):
  totalOrganicTonsPerAnnum?: number;
  totalInertTonsPerAnnum?: number;
  totalCurrentTonsPerAnnum?: number;
}

// ── 4.2 LANDFILL DEPOSITION RECORDS ──────────────────────────────

export interface ILandfillMonthlyRecord {
  month: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  year: number;
  wasteTonnes?: number;
  remarks?: string;
}

export interface ILandfillSite {
  id: string;
  siteLocationName: string;
  startYear?: number;
  landfillType?: 'managed_sanitary' | 'semi_controlled' | 'uncontrolled_open_dump';
  hasBiogasCapture?: boolean;
  biogasCaptureEfficiency?: number; // 0-100
  yearWiseAnnualTotals?: Array<{
    year: number;
    totalTonnes: number;
    remarks?: string;
  }>;
  monthlyRecords: ILandfillMonthlyRecord[];
  remarks?: string;
}

// ── 4.3 INCINERATION RECORDS ──────────────────────────────────────

export interface IIncinerationMonthlyRecord {
  month: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  year: number;
  wasteTonnes?: number;
  remarks?: string;
}

export type IncineratorType =
  | 'msw_incinerator'
  | 'biomedical_incinerator'
  | 'industrial_incinerator'
  | 'waste_to_energy'
  | 'other';

export interface IIncinerationFacility {
  id: string;
  facilityNameLocation: string;
  incineratorType?: IncineratorType;
  capacityTpd?: number;
  operatingHoursPerDay?: number;
  emissionFactorTco2PerTonne?: number;
  hasFlueGasTreatment?: boolean;
  monthlyRecords: IIncinerationMonthlyRecord[];
  remarks?: string;
}

// ── 4.4 SOLID WASTE MANAGEMENT PLANT (MSW SIEVE ANALYSIS) ────────

export type SieveSize =
  | 'lt_4mm'
  | '4_10mm'
  | '10_20mm'
  | '20_50mm'
  | '50_100mm'
  | '100_150mm'
  | '150_200mm'
  | 'gt_200mm';

export interface ISieveFraction {
  sieveSize: SieveSize;
  typeOfWasteSegregated?: string;
  typicalUseDestination?: string;
  processingTechnology?: string;
  endProduct?: string;
  percentOfTotalWaste?: number;
  percentRemainingWaste?: number;
}

export interface IMswPlant {
  id: string;
  plantName?: string;
  plantCapacityTpd?: number;
  actualThroughputTpd?: number;
  energyConsumptionKwhPerTonne?: number;
  sieveFractions: ISieveFraction[];
  remarks?: string;
}

// ── SOLID WASTE CARBON RESULTS (Phase 3) ─────────────────────────

export interface ISolidWasteCarbonResults {
  totalLandfillTonnesPerYear: number;
  landfillCh4TonnesPerYear: number;
  landfillCh4Co2eTco2ePerYear: number;
  landfillMcfUsed: number;
  landfillDocUsed: number;
  totalIncinerationTonnesPerYear: number;
  incinerationCo2Tco2ePerYear: number;
  incinerationN2oTco2ePerYear: number;
  mswPlantAnnualKwh: number;
  mswPlantScope2Tco2ePerYear: number;
  avoidedLandfillFromComposting: number;
  avoidedLandfillFromRdf: number;
  totalSolidWasteScope1: number;
  totalSolidWasteScope2: number;
  totalSolidWaste: number;
  calculationMethod: 'ipcc_fod_monthly' | 'ipcc_fod_annual' | 'phase1_simple_ef';
  estimatedFields: string[];
}

export interface IWasteSectionData {
  entryMode: EntryMode; // cumulative (building total) or zone_level

  // SOLID WASTE
  solidWasteKgPerDay?: number;
  solidWasteIsEstimated: boolean;
  wasteStreams: ISolidWasteStream[];
  // Custom streams (e.g. "hazardous chemical waste", "e-waste")
  // Stored as streams with isCustomMethod=true
  // Zone-level: breakdown by building zone (e.g. north wing, labs block)
  zoneLevelSolidWaste?: Array<{
    zoneName: string;
    kgPerDay: number;
    streams: ISolidWasteStream[];
  }>;

  // LIQUID WASTE
  wastewaterTreatmentType: WastewaterTreatmentType;
  wastewaterLitresPerDay?: number;
  wastewaterIsEstimated: boolean;
  // Custom discharge points (e.g. "lab chemical drain" handled separately)
  customDischargePoints: ICustomField[];
  hasWasteData: boolean;

  // WATER SYSTEMS (Phase 1 — files 2.1-2.5)
  water?: IWaterSectionData;

  // WASTEWATER PHASE 2 (files 3.1-3.3)
  wastewaterGeneration?: IWastewaterGeneration;
  wastewaterCharacteristics?: IWastewaterCharacteristicsRecord[];
  stpEtpPlants?: IStpEtpPlant[];
  wastewaterCarbonResults?: IWastewaterCarbonResults;

  // SOLID WASTE PHASE 3 (files 4.1-4.4)
  solidWasteGeneration?: ISolidWasteGeneration;
  landfillSites?: ILandfillSite[];
  incinerationFacilities?: IIncinerationFacility[];
  mswPlants?: IMswPlant[];
  solidWasteCarbonResults?: ISolidWasteCarbonResults;
}

// ════════════════════════════════════════════════════════════════
// WATER SYSTEMS — Phase 1 (files 2.1 – 2.5)
// ════════════════════════════════════════════════════════════════

// ── 2.1 WATER DEMAND ─────────────────────────────────────────────

export interface IWaterDemandHorizon {
  current?: number;
  inFiveYears?: number;
  inTenYears?: number;
  unit: string;
}

export interface IWaterDemand {
  residentialPopulationThousands?: IWaterDemandHorizon;
  residentialHouseholdsThousands?: IWaterDemandHorizon;
  residentialPerCapitaDemandLpcd?: IWaterDemandHorizon;
  residentialTotalDemandKld?: IWaterDemandHorizon;

  officePopulationThousands?: IWaterDemandHorizon;
  officePerCapitaDemandLpcd?: IWaterDemandHorizon;
  officeTotalDemandKld?: IWaterDemandHorizon;

  hospitalDemandKld?: IWaterDemandHorizon;
  constructionMaintenanceDemandKld?: IWaterDemandHorizon;
  kitchenCanteenDemandKld?: IWaterDemandHorizon;
  laundryDemandKld?: IWaterDemandHorizon;
  vehicleWashingDemandKld?: IWaterDemandHorizon;
  commercialAreaSqFt?: IWaterDemandHorizon;
  commercialDemandKld?: IWaterDemandHorizon;
  gardeningHorticultureDemandKld?: IWaterDemandHorizon;
  fireFightingStorageKl?: IWaterDemandHorizon;
  specialUsesDemandKld?: IWaterDemandHorizon;
  specialUsesDescription?: string;

  totalCurrentDemandKld?: number;
  totalFiveYearDemandKld?: number;
  totalTenYearDemandKld?: number;
}

// ── 2.2 WATER SUPPLY ─────────────────────────────────────────────

export type WaterSourceType =
  | 'municipal'
  | 'groundwater_borewell'
  | 'recycled_reclaimed'
  | 'surface_water'
  | 'rainwater_harvested'
  | 'other';

export interface IWaterSourceRecord {
  id: string;
  sourceType: WaterSourceType;
  sourceTypeOther?: string;
  currentKld?: number;
  inFiveYearsKld?: number;
  inTenYearsKld?: number;
  remarks?: string;
}

export interface IStorageTank {
  id: string;
  tankCategory: 'overhead' | 'underground';
  typeLabel?: string;
  capacityKl: number;
  quantity: number;
  remarks?: string;
}

export interface IWaterSupply {
  sources: IWaterSourceRecord[];
  storageTanks: IStorageTank[];
  supplyHoursPerDay?: number;
  supplyHoursPerDayInFiveYears?: number;
  supplyHoursPerDayInTenYears?: number;
  totalOverheadCapacityKl?: number;
  totalUndergroundCapacityKl?: number;
  totalStorageCapacityKl?: number;
}

// ── 2.3 WATER TREATMENT PLANT ────────────────────────────────────

export type WTPTreatmentLevel = 'preliminary' | 'primary' | 'secondary' | 'tertiary' | 'none';

export interface IWaterTreatmentPlant {
  id: string;
  serialNo?: number;
  sourceOfWater?: string;
  plantCapacityMld: number;
  treatmentMethods: {
    preliminary?: boolean;
    primary?: boolean;
    secondary?: boolean;
    tertiary?: boolean;
    methodDetails?: string;
  };
  actualTreatmentMld?: number;
  operatingHoursPerDay?: number;
  energyConsumptionKwhPerM3?: number;
  remarks?: string;
}

// ── 2.4 RO WATER TREATMENT PLANT ─────────────────────────────────

export type ROTechnologyType =
  | 'standard_ro'
  | 'nanofiltration'
  | 'ultrafiltration'
  | 'brackish_water_ro'
  | 'seawater_ro'
  | 'other';

export interface IROPlant {
  id: string;
  serialNo?: number;
  sourceOfWater?: string;
  plantCapacityMld: number;
  roTechnologyType?: ROTechnologyType;
  roTechnologyOther?: string;
  inletFlowRateMld?: number;
  treatedWaterOutputMld?: number;
  rejectWaterFlowMld?: number;
  rejectionRatePercent?: number;
  energyConsumptionKwhPerM3?: number;
  remarks?: string;
}

// ── 2.5 WATER QUALITY PARAMETERS ─────────────────────────────────

export interface IWaterQualityMonthlyValues {
  jan?: number | string;
  feb?: number | string;
  mar?: number | string;
  apr?: number | string;
  may?: number | string;
  jun?: number | string;
  jul?: number | string;
  aug?: number | string;
  sep?: number | string;
  oct?: number | string;
  nov?: number | string;
  dec?: number | string;
}

export type WaterQualityParameter =
  | 'colour'
  | 'odour'
  | 'ph'
  | 'taste'
  | 'turbidity_ntu'
  | 'tds_mg_l'
  | 'total_coliform_mpn'
  | 'fecal_coliform_mpn'
  | 'custom';

export const IS10500_LIMITS: Record<string, { acceptable: string; permissible: string }> = {
  ph: { acceptable: '6.5–8.5', permissible: 'No relaxation' },
  turbidity_ntu: { acceptable: '1', permissible: '5' },
  tds_mg_l: { acceptable: '500', permissible: '2000' },
  total_coliform_mpn: { acceptable: 'Absent/100ml', permissible: 'Absent/100ml' },
  fecal_coliform_mpn: { acceptable: 'Absent/100ml', permissible: 'Absent/100ml' },
};

export interface IWaterQualityRecord {
  id: string;
  parameter: WaterQualityParameter;
  customParameterLabel?: string;
  unit?: string;
  monthlyValues: IWaterQualityMonthlyValues;
  is10500Limit?: string;
  remarks?: string;
}

// ── WATER CARBON RESULTS ──────────────────────────────────────────

export interface IWaterCarbonResults {
  wtpAnnualKwh: number;
  wtpCarbonTco2ePerYear: number;
  roAnnualKwh: number;
  roCarbonTco2ePerYear: number;
  groundwaterPumpingAnnualKwh: number;
  groundwaterPumpingTco2ePerYear: number;
  municipalSupplyScope3Tco2ePerYear: number;
  totalScope2WaterTco2ePerYear: number;
  estimatedFields: string[];
  gridEfUsed: number;
}

// ── WATER SECTION DATA ────────────────────────────────────────────

export interface IWaterSectionData {
  demand: IWaterDemand;
  supply: IWaterSupply;
  treatmentPlants: IWaterTreatmentPlant[];
  roPlants: IROPlant[];
  qualityRecords: IWaterQualityRecord[];
  carbonResults?: IWaterCarbonResults;
}

// ════════════════════════════════════════════════════════════════
// WASTEWATER PHASE 2 — Files 3.1, 3.2, 3.3
// ════════════════════════════════════════════════════════════════

// ── 3.1 WASTEWATER GENERATION ────────────────────────────────────

export interface IWastewaterHorizon {
  current?: number;
  inFiveYears?: number;
  inTenYears?: number;
}

export interface IWastewaterGeneration {
  totalSewageKld?: IWastewaterHorizon;
  vehicleWashWastewaterKld?: IWastewaterHorizon;
  hospitalEffluentKld?: IWastewaterHorizon;
  kitchenWastewaterKld?: IWastewaterHorizon;
  greywaterReuseFeasible?: boolean;
  greywaterReuseCapacityKld?: number;
  greywaterReuseDescription?: string;
  totalCurrentWastewaterKld?: number;
  totalFiveYearKld?: number;
  totalTenYearKld?: number;
}

// ── 3.2 WASTEWATER CHARACTERISTICS ───────────────────────────────

export type WastewaterParameter =
  | 'colour'
  | 'odour'
  | 'suspended_solids'
  | 'particulate_size_ss'
  | 'ph'
  | 'temperature'
  | 'oil_and_grease'
  | 'total_residual_chlorine'
  | 'ammonical_nitrogen'
  | 'total_kjeldahl_nitrogen'
  | 'free_ammonia'
  | 'bod'
  | 'cod'
  | 'arsenic'
  | 'mercury'
  | 'lead'
  | 'cadmium'
  | 'hexavalent_chromium'
  | 'custom';

export interface IWastewaterCharacteristicsRecord {
  id: string;
  parameter: WastewaterParameter;
  customParameterLabel?: string;
  unit?: string;
  monthlyValues: {
    jan?: number | string;
    feb?: number | string;
    mar?: number | string;
    apr?: number | string;
    may?: number | string;
    jun?: number | string;
    jul?: number | string;
    aug?: number | string;
    sep?: number | string;
    oct?: number | string;
    nov?: number | string;
    dec?: number | string;
  };
  cpcbLimit?: string;
  remarks?: string;
}

// ── 3.3 STP / ETP PLANT RECORDS ──────────────────────────────────

export type WastewaterSourceType =
  | 'domestic_sewage'
  | 'hospital_effluent'
  | 'kitchen_wastewater'
  | 'vehicle_wash'
  | 'industrial_effluent'
  | 'mixed_sewage_effluent'
  | 'other';

export type STPTreatmentStage = 'preliminary' | 'primary' | 'secondary' | 'tertiary';

export interface IStpEtpPlant {
  id: string;
  serialNo?: number;
  sourceOfWastewater: WastewaterSourceType;
  sourceOfWastewaterOther?: string;
  sourceDescription?: string;
  plantCapacityMld: number;
  actualInflowMld?: number;
  treatmentMethods: {
    preliminary?: boolean;
    primary?: boolean;
    secondary?: boolean;
    tertiary?: boolean;
    methodDetails?: string;
    isAnaerobic?: boolean;
    hasBiogasCapture?: boolean;
    biogasCaptureEfficiency?: number;
  };
  operatingHoursPerDay?: number;
  energyConsumptionKwhPerM3?: number;
  effluentDisposalMethod?:
    | 'reuse_irrigation'
    | 'reuse_flushing'
    | 'surface_discharge'
    | 'sewer_discharge'
    | 'other';
  effluentBodMgL?: number;
  effluentCodMgL?: number;
  effluentTknMgL?: number;
  remarks?: string;
}

// ── WASTEWATER CARBON RESULTS (Phase 2) ──────────────────────────

export interface IWastewaterCarbonResults {
  inflowKldUsed: number;
  bodMgLUsed: number;
  tknMgLUsed: number;
  mcfUsed: number;
  calculationMethod: 'ipcc_tier1_bod_flow' | 'ipcc_tier1_flow_only' | 'phase1_simple_ef';
  towKgBodPerYear: number;
  ch4KgPerYear: number;
  ch4AsCo2eTco2ePerYear: number;
  nEffluentKgNPerYear: number;
  n2oKgPerYear: number;
  n2oAsCo2eTco2ePerYear: number;
  stpAnnualKwh: number;
  stpScope2Tco2ePerYear: number;
  totalLiquidWasteTco2ePerYear: number;
  scope1LiquidWaste: number;
  scope2LiquidWaste: number;
  phase1SimpleEfTco2e?: number;
  improvementNotes: string[];
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION RECORD — wraps any section's data with metadata
// This replaces the flat ISubmissionData in the Submission model.
// ══════════════════════════════════════════════════════════════════════════════

export type SectionType = 'civil' | 'electrical' | 'waste';
export type DataLifecycle = 'static' | 'dynamic';

export interface ISectionRecord<T> {
  section: SectionType;
  lifecycle: DataLifecycle; // 'static' (civil/overview) or 'dynamic' (electrical/waste)
  entryMode: EntryMode;
  data: T;
  version: number; // increments each time the section is re-submitted
  status: SectionStatus;
  estimatedFields: string[]; // dot-paths of fields using defaults
  confidenceScore: number; // 0-100
  carbonResults?: ISectionCarbonResults;
  submittedBy?: string; // userId
  submittedAt?: Date;
  verifiedBy?: string; // userId of reviewer
  verifiedAt?: Date;
  reviewNotes?: string;
  previousVersionId?: string; // link to the previous submission for diff view
}

// Carbon results scoped to a single section
export interface ISectionCarbonResults {
  embodiedCarbon?: number; // civil section only
  operationalCarbonPerYear?: number; // electrical section only
  wasteCarbonPerYear?: number; // waste section only
  breakdown: {
    byScope?: { scope1: number; scope2: number; scope3: number };
    byCategory?: Record<string, number>;
  };
}

// Full combined results (computed by rolling up all verified sections)
export interface ICarbonResults {
  embodiedCarbon: number;
  embodiedCarbonPerYear?: number; // tCO2e/yr (embodiedCarbon ÷ 50)
  operationalCarbonPerYear: number;
  wasteCarbonPerYear: number;
  transportCarbonPerYear: number; // Scope 1 vehicle fleet emissions
  totalLifecycle: number;
  breakdown: {
    byScope: { scope1: number; scope2: number; scope3: number };
    byCategory: {
      energy: number;
      materials: number;
      transport: number;
      waste: number;
      solidWaste: number;
      liquidWaste: number;
      evCharging: number; // EV charging electricity (Scope 2)
      vehicleDiesel: number; // Vehicle fleet diesel (Scope 1)
      vehicleKerosene: number; // Vehicle kerosene (Scope 1)
      waterTreatment?: number; // WTP + RO + pumping (Scope 2)
      commute?: number; // Employee/student commute (Scope 3)
      airTravel?: number; // Domestic air travel (Scope 3)
      officeEquipment?: number; // Equipment procurement (Scope 3)
    };
    // Granular per-source breakdown from new calculation engine
    byComponent?: {
      // Operational (Scope 1 & 2)
      gridElectricity: number;
      dieselGenerator: number;
      lpgCooking: number;
      vehicleFleet: number;
      refrigerantLeakage: number;
      transformerLosses: number;
      evCharging: number;
      // Waste (Scope 1, 2 & 3)
      landfillCH4: number;
      wasteIncineration: number;
      mswPlantElectricity: number;
      wastewaterCH4: number;
      wastewaterN2O: number;
      stpElectricity: number;
      wtpElectricity: number;
      roElectricity: number;
      chemicalUsage: number;
      municipalWaterScope3: number;
      // Embodied (amortised, Scope 3)
      embodiedMaterials: number;
      materialBreakdown: Record<string, number>;
    };
    // Legacy source-level aggregates
    bySource?: {
      gridElectricity: number;
      diesel: number;
      lpg: number;
      vehicles: number;
      refrigerants: number;
      solidWaste: number;
      wastewater: number;
      embodied: number;
    };
  };
  estimatedFields: string[];
  confidenceScore: number;
  computedAt?: Date;
  // Engine meta — present when new sub-engines ran
  meta?: {
    gridKwh?: number;
    solarOffsetKwh?: number;
    windOffsetKwh?: number;
    netGridKwh?: number;
    gridEFUsed?: number;
    gridEFSource?: string;
    dgLitres?: number;
    dgFuelSource?: string;
    totalWasteToLandfill?: number;
    totalWasteIncinerated?: number;
    wastewaterVolumeM3yr?: number;
    bodLoadKgYr?: number;
    ch4KgYr?: number;
    n2oKgYr?: number;
    landfillMCFUsed?: number;
    wwMCFUsed?: number;
    dataPath?: string;
    embodiedFallbacksApplied?: string[];
  };
  dataSourceInfo?: {
    gridEmissionFactorSource: string;
    gridEmissionFactorValue: number;
    tdLossApplied: number;
    solarOffsetSource: string;
    dgEmissionSource: string;
    transportDataSource: 'measured' | 'estimated' | 'none';
  };
  // Which section versions were used for this calculation
  sectionVersions?: {
    civil?: number;
    electrical?: number;
    waste?: number;
  };
}

// ── Legacy ISubmissionData — keep for backward compatibility during migration ──
// New code should use ISectionRecord<T> instead.
// Old flat fields kept optional so existing engine code compiles without changes.
export interface ISubmissionData {
  overview: IBuildingOverview;
  civil?: ICivilSectionData;
  electrical?: IElectricalSectionData | null;
  waste?: IWasteSectionData;
  // --- legacy flat fields (Phase 1 compat — engine still reads these) ---
  structure?: IStepStructure;
  energy?: IStepEnergy;
  appliances?: IStepAppliances;
  materials?: IStepMaterials;
  usage?: IStepUsage;
}

// ── Legacy types (kept for engine backward compat during migration) ──
export interface IStepOverview extends IBuildingOverview {}

export interface IStepStructure extends ICivilStructure {}

export interface IStepEnergy extends IElectricalEnergy {}

export interface IStepAppliances {
  categories: {
    lighting: IAppliance[];
    temperature_control: IAppliance[]; // renamed from 'cooling'
    cooling?: IAppliance[]; // deprecated alias — engine still reads this
    computing: IAppliance[];
    labEquipment: IAppliance[];
    misc: IAppliance[];
    custom: IAppliance[];
  };
}

export interface IStepMaterials extends ICivilMaterials {}

// IStepUsage — usage fields now live in IBuildingOverview, but kept here
// as a standalone interface so existing engine imports continue to compile.
export interface IStepUsage {
  operatingHoursPerDay: number;
  operatingDaysPerWeek: number;
  peakMonths?: string[];
  acUsageMonths?: string[];
  occupancyDuringBreaks?: 'closed' | 'partial' | 'normal';
}

// IStepWaste — kept as the old flat shape so engine/waste.ts compiles
// without changes. dailyOccupants was a top-level field in the old wizard;
// in the new model it lives in IBuildingOverview.averageDailyOccupants.
export interface IStepWaste {
  solidWasteKgPerDay?: number;
  solidWasteIsEstimated: boolean;
  wasteStreams: ISolidWasteStream[];
  wastewaterTreatmentType: WastewaterTreatmentType;
  wastewaterLitresPerDay?: number;
  wastewaterIsEstimated: boolean;
  dailyOccupants?: number; // deprecated — use IBuildingOverview.averageDailyOccupants
  hasWasteData: boolean;
}

// ════════════════════════════════════════════════════════════════════
// CAMPUS-LEVEL TYPES
// ════════════════════════════════════════════════════════════════════

// ── ROADS ──────────────────────────────────────────────────────────

export type RoadSurfaceType =
  | 'paved_concrete'
  | 'paved_asphalt'
  | 'paved_brick'
  | 'unpaved_gravel'
  | 'unpaved_dirt'
  | 'mixed'
  | 'other';

export interface IRoadSegment {
  id: string; // client UUID
  roadName: string; // user-named: "Main avenue", "Service lane", etc.
  lengthM: number; // length in metres
  widthM: number; // width in metres
  lengthKm: number; // length in km (= lengthM / 1000)
  lanes: number; // number of lanes (default 2)
  surfaceType: RoadSurfaceType;
  surfaceTypeOther?: string; // if surfaceType = 'other'
  roadType?: string; // e.g. 'arterial', 'collector', 'local', 'service'
  isPaved: boolean; // derived from surfaceType for quick filtering
  lightsPerKm?: number; // street lights per km of road
  wattsPerLight?: number; // wattage per light (W)
  hoursPerDay?: number; // operating hours per day
  remarks?: string;
  // Computed (not user-entered):
  areaM2?: number; // = lengthM × widthM
}

export interface ICampusRoads {
  segments: IRoadSegment[];
  // Summary (auto-computed from segments):
  totalLengthM?: number;
  totalAreaM2?: number;
  pavedAreaM2?: number;
  unpavedAreaM2?: number;
  // Road lighting (added here as it relates to roads):
  hasStreetLighting?: boolean;
  streetLightCount?: number;
  streetLightType?: 'sodium_vapour' | 'led' | 'cfl' | 'metal_halide' | 'mixed' | 'other';
  streetLightWattsEach?: number;
  streetLightHoursPerDay?: number;
  streetLightingRemarks?: string;
}

// ── VEGETATION ─────────────────────────────────────────────────────

export type VegetationCategoryType =
  | 'native_trees'
  | 'ornamental_trees'
  | 'shrubs_grassland'
  | 'agroforestry'
  | 'arboriculture'
  | 'custom';

export interface IVegetationCategory {
  id: string;
  categoryType: VegetationCategoryType;
  customCategoryLabel?: string; // only when categoryType = 'custom'
  definitionScope?: string; // the definition/scope description
  numberOfTrees?: number; // not applicable for shrubs_grassland
  areaAcres?: number; // area covered in acres
  areaSqm?: number; // area in m² (= areaAcres × 4047), used by carbon engine
  remarks?: string;
}

export interface ICampusVegetation {
  categories: IVegetationCategory[];
  // Summary stats (auto-computed):
  totalTrees?: number;
  totalAreaAcres?: number;
  // Additional context:
  hasHeritageTrees?: boolean;
  heritageTreeCount?: number;
  heritageTreeRemarks?: string;
}

// ── WATER BODIES ───────────────────────────────────────────────────

export type WaterBodyCategory = 'canal' | 'lake_pond' | 'river' | 'reservoir' | 'other';

export interface IWaterBody {
  id: string;
  category: WaterBodyCategory;
  customCategoryLabel?: string; // if category = 'other'
  name: string; // e.g. "North campus canal", "Swimming pool pond"
  // Dimensional data — which fields apply depends on category:
  // canals: length + width; lakes/ponds: surface area
  lengthM?: number; // applicable to canals and rivers
  widthM?: number; // applicable to canals
  surfaceAreaAcres?: number; // applicable to lakes, ponds, reservoirs
  remarks?: string;
  // Derived:
  surfaceAreaM2?: number; // computed: lengthM × widthM OR surfaceAreaAcres × 4047
}

export interface ICampusWaterBodies {
  waterBodies: IWaterBody[];
  // Summary:
  totalWaterAreaAcres?: number;
  hasPerennialWaterBody?: boolean;
  waterManagementRemarks?: string;
}

// ── CAMPUS RECORD (top-level document) ─────────────────────────────

export interface ICampusCommutation {
  noOccupants: number; // total commuting occupants (students + staff)
  avgDailyDistanceKm: number; // average one-way commute distance (km)
  workingDaysPerYear: number; // days per year they commute
}

export interface ICampusAirTravel {
  noTravellers: number; // number of people who travel by air per year
  totalPassengerKm?: number; // direct entry in passenger-km (overrides avgDistancePerPersonKm)
  avgDistancePerPersonKm?: number; // average flight distance per person per year (km)
}

export interface ICampusPurchasedGoods {
  totalPopulation?: number; // campus population for per-capita estimation
  costPerPersonINR?: number; // annual procurement spend per person (INR)
  totalSpendINR?: number; // total annual procurement spend (INR) — overrides per-capita
  totalSpend2022USD?: number; // pre-converted USD value (overrides INR)
}

export interface ICampusData {
  roads: ICampusRoads;
  vegetation: ICampusVegetation;
  waterBodies: ICampusWaterBodies;
  commutation?: ICampusCommutation;
  airTravel?: ICampusAirTravel;
  purchasedGoods?: ICampusPurchasedGoods;
}

export interface ICampusCarbonResults {
  // Roads embodied carbon (one-time, construction)
  roadsEmbodiedCarbon: number; // tCO₂e — from paved surface construction
  // Road lighting operational carbon
  roadLightingCarbonPerYear: number; // tCO₂e/yr
  // Vegetation sequestration (negative = carbon absorbed)
  vegetationSequestrationPerYear: number; // tCO₂e/yr — negative value
  // Scope 3 operational sources
  commutationCarbonPerYear?: number; // tCO₂e/yr — occupant commuting
  airTravelCarbonPerYear?: number; // tCO₂e/yr — air travel
  purchasedGoodsCarbonPerYear?: number; // tCO₂e/yr — purchased goods (EEIO)
  // Net campus carbon from these sources
  netCampusCarbonPerYear: number; // sum of all operational + embodied (÷50 yr) - sequestration
  totalCampusEmbodied: number; // roadsEmbodied
  breakdown: {
    roadConstruction: number;
    roadLighting: number;
    vegetation: number; // negative
    commutation?: number;
    airTravel?: number;
    purchasedGoods?: number;
  };
  estimatedFields: string[];
  confidenceScore: number;
  computedAt: Date;
}

// Re-export ISubmission for backward compat
export interface ISubmission {
  _id: string;
  buildingId: string;
  section: SectionType;
  submittedBy: string;
  status: SectionStatus;
  lifecycle: DataLifecycle;
  data:
    | ICivilSectionData
    | IElectricalSectionData
    | IWasteSectionData
    | { overview: IBuildingOverview };
  entryMode: EntryMode;
  estimatedFields: string[];
  confidenceScore: number;
  carbonResults?: ISectionCarbonResults;
  version: number;
  reviewNotes?: string;
  previousVersionId?: string;
  createdAt: Date;
  updatedAt: Date;
}
