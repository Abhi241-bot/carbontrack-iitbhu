import {
  ICustomField,
  SolidWasteDisposalMethod,
  WastewaterTreatmentType,
  VehicleType,
  WastewaterParameter,
  SieveSize,
} from '../types/submission.types';

export const ALLOWED_EMAIL_DOMAINS = ['@itbhu.ac.in', '@iitbhu.ac.in', '@bhu.ac.in'];

export const INDIA_GRID_EMISSION_FACTOR = 0.716; // kgCO2e/kWh, CEA 2023
export const UP_ELECTRICITY_TARIFF = 6.5; // INR per kWh average
export const MAX_WIZARD_STEPS = 8; // keep for any legacy references

// TEMPERATURE_CONTROL replaces 'cooling' — includes AC, fans, heaters, etc.

export const APPLIANCE_DEFAULTS: Record<
  string,
  { watts: number; label: string; category: string }
> = {
  LED_BULB: { watts: 9, label: 'LED bulb', category: 'lighting' },
  TUBE_LIGHT: { watts: 36, label: 'Tube light', category: 'lighting' },
  CFL: { watts: 23, label: 'CFL bulb', category: 'lighting' },
  CEILING_FAN: { watts: 75, label: 'Ceiling fan', category: 'temperature_control' },
  SPLIT_AC_1TON: { watts: 1000, label: 'Split AC (1 ton)', category: 'temperature_control' },
  SPLIT_AC_1_5TON: { watts: 1500, label: 'Split AC (1.5 ton)', category: 'temperature_control' },
  SPLIT_AC_2TON: { watts: 2000, label: 'Split AC (2 ton)', category: 'temperature_control' },
  ROOM_HEATER: { watts: 2000, label: 'Room heater (electric)', category: 'temperature_control' },
  HEAT_PUMP_1TON: { watts: 1200, label: 'Heat pump (1 ton)', category: 'temperature_control' },
  EVAPORATIVE_COOLER: {
    watts: 200,
    label: 'Evaporative cooler (desert cooler)',
    category: 'temperature_control',
  },
  EXHAUST_FAN: { watts: 55, label: 'Exhaust fan', category: 'temperature_control' },
  DESKTOP_PC: { watts: 200, label: 'Desktop PC', category: 'computing' },
  LAPTOP: { watts: 45, label: 'Laptop', category: 'computing' },
  SERVER: { watts: 500, label: 'Server (rack unit)', category: 'computing' },
  PROJECTOR: { watts: 300, label: 'Projector', category: 'misc' },
  WATER_COOLER: { watts: 150, label: 'Water cooler', category: 'misc' },
  ELEVATOR: { watts: 5000, label: 'Elevator', category: 'misc' },
  PRINTER: { watts: 400, label: 'Laser printer', category: 'misc' },
  CENTRIFUGE: { watts: 500, label: 'Centrifuge', category: 'labEquipment' },
  AUTOCLAVE: { watts: 3000, label: 'Autoclave', category: 'labEquipment' },
  FUME_HOOD: { watts: 500, label: 'Fume hood', category: 'labEquipment' },
  PCR_MACHINE: { watts: 500, label: 'PCR machine', category: 'labEquipment' },
};

export const ROOM_TEMPLATES: Record<
  string,
  {
    defaultAppliances: Array<{ type: string; count: number }>;
    avgSizeSqm: number;
    avgOccupancy: number;
    usageHoursPerDay: number;
  }
> = {
  CLASSROOM: {
    defaultAppliances: [
      { type: 'LED_BULB', count: 8 },
      { type: 'CEILING_FAN', count: 4 },
      { type: 'PROJECTOR', count: 1 },
    ],
    avgSizeSqm: 60,
    avgOccupancy: 60,
    usageHoursPerDay: 8,
  },
  TUTORIAL_ROOM: {
    defaultAppliances: [
      { type: 'LED_BULB', count: 6 },
      { type: 'CEILING_FAN', count: 3 },
    ],
    avgSizeSqm: 40,
    avgOccupancy: 30,
    usageHoursPerDay: 6,
  },
  FACULTY_OFFICE: {
    defaultAppliances: [
      { type: 'LED_BULB', count: 4 },
      { type: 'CEILING_FAN', count: 1 },
      { type: 'SPLIT_AC_1TON', count: 1 },
      { type: 'DESKTOP_PC', count: 1 },
    ],
    avgSizeSqm: 20,
    avgOccupancy: 2,
    usageHoursPerDay: 8,
  },
  STAFF_OFFICE: {
    defaultAppliances: [
      { type: 'LED_BULB', count: 4 },
      { type: 'CEILING_FAN', count: 2 },
      { type: 'DESKTOP_PC', count: 2 },
    ],
    avgSizeSqm: 25,
    avgOccupancy: 4,
    usageHoursPerDay: 8,
  },
  RESEARCH_LAB: {
    defaultAppliances: [
      { type: 'TUBE_LIGHT', count: 6 },
      { type: 'SPLIT_AC_1_5TON', count: 2 },
      { type: 'DESKTOP_PC', count: 4 },
    ],
    avgSizeSqm: 50,
    avgOccupancy: 10,
    usageHoursPerDay: 12,
  },
  COMPUTER_LAB: {
    defaultAppliances: [
      { type: 'TUBE_LIGHT', count: 8 },
      { type: 'SPLIT_AC_1_5TON', count: 2 },
      { type: 'DESKTOP_PC', count: 30 },
    ],
    avgSizeSqm: 80,
    avgOccupancy: 30,
    usageHoursPerDay: 10,
  },
  WASHROOM: {
    defaultAppliances: [{ type: 'LED_BULB', count: 4 }],
    avgSizeSqm: 30,
    avgOccupancy: 0,
    usageHoursPerDay: 16,
  },
  CORRIDOR: {
    defaultAppliances: [{ type: 'LED_BULB', count: 6 }],
    avgSizeSqm: 60,
    avgOccupancy: 0,
    usageHoursPerDay: 16,
  },
  HOSTEL_ROOM: {
    defaultAppliances: [
      { type: 'LED_BULB', count: 2 },
      { type: 'CEILING_FAN', count: 1 },
      { type: 'LAPTOP', count: 2 },
    ],
    avgSizeSqm: 12,
    avgOccupancy: 2,
    usageHoursPerDay: 18,
  },
  COMMON_ROOM: {
    defaultAppliances: [
      { type: 'LED_BULB', count: 6 },
      { type: 'CEILING_FAN', count: 3 },
      { type: 'SPLIT_AC_1TON', count: 1 },
    ],
    avgSizeSqm: 60,
    avgOccupancy: 20,
    usageHoursPerDay: 12,
  },
  CONFERENCE_ROOM: {
    defaultAppliances: [
      { type: 'LED_BULB', count: 8 },
      { type: 'SPLIT_AC_1_5TON', count: 1 },
      { type: 'PROJECTOR', count: 1 },
    ],
    avgSizeSqm: 40,
    avgOccupancy: 20,
    usageHoursPerDay: 6,
  },
  STORE_ROOM: {
    defaultAppliances: [{ type: 'LED_BULB', count: 2 }],
    avgSizeSqm: 20,
    avgOccupancy: 0,
    usageHoursPerDay: 4,
  },
};

export const BUILDING_TEMPLATES: Record<
  string,
  {
    label: string;
    roomDistribution: Array<{ type: string; count: number }>;
  }
> = {
  ENGINEERING_BUILDING: {
    label: 'Engineering Building',
    roomDistribution: [
      { type: 'CLASSROOM', count: 20 },
      { type: 'TUTORIAL_ROOM', count: 10 },
      { type: 'FACULTY_OFFICE', count: 30 },
      { type: 'RESEARCH_LAB', count: 8 },
      { type: 'COMPUTER_LAB', count: 3 },
      { type: 'WASHROOM', count: 20 },
      { type: 'CORRIDOR', count: 10 },
      { type: 'CONFERENCE_ROOM', count: 3 },
    ],
  },
  HOSTEL_BLOCK: {
    label: 'Hostel Block',
    roomDistribution: [
      { type: 'HOSTEL_ROOM', count: 150 },
      { type: 'WASHROOM', count: 30 },
      { type: 'COMMON_ROOM', count: 4 },
      { type: 'CORRIDOR', count: 20 },
    ],
  },
  ADMINISTRATIVE_OFFICE: {
    label: 'Administrative Office',
    roomDistribution: [
      { type: 'STAFF_OFFICE', count: 30 },
      { type: 'FACULTY_OFFICE', count: 15 },
      { type: 'CONFERENCE_ROOM', count: 5 },
      { type: 'WASHROOM', count: 15 },
      { type: 'CORRIDOR', count: 8 },
      { type: 'STORE_ROOM', count: 5 },
    ],
  },
  LABORATORY_COMPLEX: {
    label: 'Laboratory Complex',
    roomDistribution: [
      { type: 'RESEARCH_LAB', count: 20 },
      { type: 'COMPUTER_LAB', count: 5 },
      { type: 'FACULTY_OFFICE', count: 15 },
      { type: 'WASHROOM', count: 15 },
      { type: 'CORRIDOR', count: 10 },
      { type: 'STORE_ROOM', count: 8 },
    ],
  },
};

export const WASTE_DEFAULTS_BY_BUILDING_TYPE: Record<
  string,
  {
    solidWasteKgPerDayPerOccupant: number;
    wasteStreams: Array<{ disposalMethod: SolidWasteDisposalMethod; fractionPercent: number }>;
    wastewaterTreatmentType: WastewaterTreatmentType;
    wastewaterLitresPerPersonPerDay: number;
  }
> = {
  hostel: {
    solidWasteKgPerDayPerOccupant: 0.45,
    wasteStreams: [
      { disposalMethod: SolidWasteDisposalMethod.UNMANAGED_DUMP, fractionPercent: 60 },
      { disposalMethod: SolidWasteDisposalMethod.RECYCLING, fractionPercent: 20 },
      { disposalMethod: SolidWasteDisposalMethod.COMPOSTING, fractionPercent: 20 },
    ],
    wastewaterTreatmentType: WastewaterTreatmentType.UNMANAGED_SEPTIC,
    wastewaterLitresPerPersonPerDay: 120,
  },
  academic: {
    solidWasteKgPerDayPerOccupant: 0.2,
    wasteStreams: [
      { disposalMethod: SolidWasteDisposalMethod.UNMANAGED_DUMP, fractionPercent: 50 },
      { disposalMethod: SolidWasteDisposalMethod.RECYCLING, fractionPercent: 40 },
      { disposalMethod: SolidWasteDisposalMethod.COMPOSTING, fractionPercent: 10 },
    ],
    wastewaterTreatmentType: WastewaterTreatmentType.MUNICIPAL_STP,
    wastewaterLitresPerPersonPerDay: 80,
  },
  lab: {
    solidWasteKgPerDayPerOccupant: 0.3,
    wasteStreams: [
      { disposalMethod: SolidWasteDisposalMethod.UNMANAGED_DUMP, fractionPercent: 50 },
      { disposalMethod: SolidWasteDisposalMethod.RECYCLING, fractionPercent: 50 },
    ],
    wastewaterTreatmentType: WastewaterTreatmentType.CAMPUS_STP,
    wastewaterLitresPerPersonPerDay: 100,
  },
  administrative: {
    solidWasteKgPerDayPerOccupant: 0.18,
    wasteStreams: [
      { disposalMethod: SolidWasteDisposalMethod.UNMANAGED_DUMP, fractionPercent: 40 },
      { disposalMethod: SolidWasteDisposalMethod.RECYCLING, fractionPercent: 60 },
    ],
    wastewaterTreatmentType: WastewaterTreatmentType.MUNICIPAL_STP,
    wastewaterLitresPerPersonPerDay: 80,
  },
};

export const EMPTY_CUSTOM_FIELD = (): ICustomField => ({
  id: '', // caller must supply a UUID
  label: '',
  value: 0,
  unit: undefined,
  notes: undefined,
});

// ── DG Set defaults ───────────────────────────────────────────────────────────
export const DG_DEFAULTS = {
  emissionFactorKgCo2PerL: 2.68, // IPCC AR6 diesel
  specificFuelConsumptionLPerKwh: 0.25, // L/kWh at typical load
  loadFactor: 0.75, // assume 75% loading when estimating
};

// ── Transformer loss defaults ─────────────────────────────────────────────────
export const TRANSFORMER_DEFAULTS = {
  noLoadLossKwPer100Kva: 0.15, // typical 0.15 kW no-load per 100 kVA
  loadLossKwPer100Kva: 1.0, // typical 1 kW load loss per 100 kVA
};

// ── Appliance efficiency penalty for non-efficient units ──────────────────────
export const EFFICIENCY_PENALTY_FACTOR = 1.4; // non-efficient uses 40% more power

// ── Projection time horizons ──────────────────────────────────────────────────
export const PROJECTION_HORIZONS = [
  { key: 'thisYear', label: 'This year' },
  { key: 'nextYear', label: 'Next year' },
  { key: 'threeYears', label: '3 years' },
  { key: 'fiveYears', label: '5 years' },
  { key: 'tenYears', label: '10 years' },
] as const;

// ── DG fuel types ─────────────────────────────────────────────────────────────
export const DG_FUEL_TYPES = [
  { value: 'diesel', label: 'Diesel (HSD)' },
  { value: 'hsd', label: 'High Speed Diesel' },
  { value: 'natural_gas', label: 'Natural Gas (CNG/PNG)' },
  { value: 'lpg', label: 'LPG' },
  { value: 'biogas', label: 'Biogas' },
  { value: 'other', label: 'Other' },
] as const;

// ── Cooling type options for transformers ─────────────────────────────────────
export const TRANSFORMER_COOLING_TYPES = [
  'ONAN',
  'ONAF',
  'OFAF',
  'ODAN',
  'ODAF',
  'AN',
  'AF',
  'Other',
] as const;

// ── Capacitor bank control types ──────────────────────────────────────────────
export const CAPACITOR_CONTROL_TYPES = ['manual', 'automatic', 'other'] as const;

// ── IEC motor efficiency correction factors vs IE3 reference ─────────────────
// Applied to nameplate kW to get actual power draw at typical 75% loading
export const IE_CLASS_CORRECTION: Record<string, number> = {
  IE1: 1.08, // 8% more than nameplate (old standard efficiency)
  IE2: 1.04, // 4% more
  IE3: 1.0, // reference (premium efficiency)
  IE4: 0.97, // 3% less (super premium)
  unknown: 1.05, // conservative estimate for unlabelled motors
};

// ── Lighting seasonal month split (India context) ─────────────────────────────
export const LIGHTING_SEASONAL_MONTHS = {
  summerMonths: 6, // April–September
  winterMonths: 6, // October–March
  daysPerMonth: 30, // approximation for energy calculation
};

// ── PF thresholds for status classification ───────────────────────────────────
export const PF_THRESHOLDS = {
  good: 0.95, // PF >= 0.95 → good, usually earns incentive
  acceptable: 0.9, // PF 0.90–0.95 → acceptable, no penalty
  poor: 0.9, // PF < 0.90 → poor, incurs penalty
};

// ── Lighting fixture type labels ──────────────────────────────────────────────
export const LIGHTING_FIXTURE_LABELS: Record<string, string> = {
  fluorescent_tube: 'Fluorescent tube (T8/T5)',
  cfl: 'CFL (Compact fluorescent)',
  led_tube: 'LED tube replacement',
  led_panel: 'LED panel / troffer',
  led_downlight: 'LED downlight / spotlight',
  incandescent: 'Incandescent bulb',
  metal_halide: 'Metal halide (high-bay)',
  sodium_vapour: 'Sodium vapour (outdoor)',
  high_bay_led: 'LED high-bay',
  emergency_light: 'Emergency / exit light',
  outdoor_floodlight: 'Outdoor flood / area light',
  other: 'Other',
};

// ── Lighting control type labels ──────────────────────────────────────────────
export const LIGHTING_CONTROL_LABELS: Record<string, string> = {
  manual_switch: 'Manual switch',
  timer: 'Timer',
  occupancy_sensor: 'Occupancy / PIR sensor',
  daylight_sensor: 'Daylight / photocell sensor',
  dimmer: 'Dimmer',
  bms_controlled: 'BMS controlled',
  none: 'No control',
  other: 'Other',
};

// ── Motor duty labels ─────────────────────────────────────────────────────────
export const MOTOR_DUTY_LABELS: Record<string, string> = {
  continuous: 'Continuous (24/7)',
  intermittent: 'Intermittent (demand-based)',
  standby: 'Standby (backup only)',
  primary: 'Primary (has standby backup)',
};

// ── VFD savings range by duty type ───────────────────────────────────────────
export const VFD_SAVINGS_TYPICAL: Record<string, number> = {
  pump_variable_load: 35,
  fan_variable_speed: 40,
  conveyor: 20,
  compressor: 25,
  default: 25,
};

// ── CEA published grid emission factors by year (kgCO₂/kWh) ─────────────────
// Source: CEA CO2 Baseline Database for the Indian Power Sector
export const CEA_EMISSION_FACTORS_BY_YEAR: Record<number, number> = {
  2019: 0.82,
  2020: 0.79,
  2021: 0.76,
  2022: 0.735,
  2023: 0.716, // current default
  2024: 0.7, // projected/estimated
  2025: 0.685, // projected
};

// ── IPCC fuel emission factors (kgCO₂/litre) ────────────────────────────────
export const VEHICLE_FUEL_EMISSION_FACTORS = {
  diesel: 2.68, // IPCC AR6
  kerosene: 2.54, // IPCC AR6
  petrol: 2.31, // IPCC AR6
  cng: 1.9, // per kg, converted to litre-equivalent
  lpg: 1.61, // per litre
};

// ── Vehicle type labels ──────────────────────────────────────────────────────
export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  jeep_utility: 'Jeeps / utility vehicles',
  truck: 'Trucks',
  motorcycle: 'Motorcycles',
  generator_vehicle: 'Generators (vehicle-mounted)',
  bus: 'Bus / minibus',
  car: 'Passenger car',
  tractor: 'Tractor / agricultural',
  boat: 'Boat / launch',
  other: 'Other',
};

// ── Pre-seeded vehicle types for IIT BHU (from file 9.2 structure) ───────────
export const DEFAULT_VEHICLE_TYPES: VehicleType[] = [
  'jeep_utility',
  'truck',
  'motorcycle',
  'generator_vehicle',
];

// ── EV connector type labels ─────────────────────────────────────────────────
export const EV_CONNECTOR_LABELS: Record<string, string> = {
  type2_ac: 'Type 2 AC (IEC 62196)',
  ccs2: 'CCS2 (DC fast charging)',
  chademo: 'CHAdeMO (DC fast)',
  bharat_ac001: 'Bharat AC-001 (India 3-phase)',
  bharat_dc001: 'Bharat DC-001 (India DC)',
  type1_ac: 'Type 1 AC (SAE J1772)',
  other: 'Other',
};

// ── SCADA protocol labels ────────────────────────────────────────────────────
export const SCADA_PROTOCOL_LABELS: Record<string, string> = {
  modbus_tcp: 'Modbus TCP',
  modbus_rtu: 'Modbus RTU (serial)',
  dnp3: 'DNP3',
  iec_61850: 'IEC 61850',
  bacnet: 'BACnet',
  opc_ua: 'OPC-UA',
  profibus: 'PROFIBUS',
  other: 'Other',
};

// ── Meter voltage level labels ───────────────────────────────────────────────
export const METER_VOLTAGE_LABELS: Record<string, string> = {
  lv_415v: 'LV 415V',
  mv_11kv: 'MV 11kV',
  mv_33kv: 'MV 33kV',
  hv_66kv: 'HV 66kV',
  other: 'Other',
};

// ── Water treatment energy intensity (kWh/m³) ────────────────────────────────
export const WTP_ENERGY_KWH_M3 = {
  preliminary: 0.04,
  primary: 0.09,
  secondary: 0.25,
  tertiary: 0.4,
};

// ── RO energy intensity (kWh/m³ of product water) ────────────────────────────
export const RO_ENERGY_KWH_M3: Record<string, number> = {
  standard_ro: 0.65,
  nanofiltration: 0.5,
  ultrafiltration: 0.35,
  brackish_water_ro: 0.6,
  seawater_ro: 1.5,
  other: 0.75,
};

// ── IS 10500:2012 drinking water quality limits ───────────────────────────────
export const IS10500_PARAMETER_SPECS: Record<
  string,
  {
    parameter: string;
    unit: string;
    acceptable: string;
    permissible: string;
  }
> = {
  colour: { parameter: 'Colour', unit: 'Hazen units', acceptable: '5', permissible: '15' },
  odour: {
    parameter: 'Odour',
    unit: '-',
    acceptable: 'Unobjectionable',
    permissible: 'Unobjectionable',
  },
  ph: { parameter: 'pH value', unit: '-', acceptable: '6.5–8.5', permissible: 'No relaxation' },
  taste: { parameter: 'Taste', unit: '-', acceptable: 'Agreeable', permissible: 'Agreeable' },
  turbidity_ntu: { parameter: 'Turbidity', unit: 'NTU', acceptable: '1', permissible: '5' },
  tds_mg_l: {
    parameter: 'Total Dissolved Solids',
    unit: 'mg/L',
    acceptable: '500',
    permissible: '2000',
  },
  total_coliform_mpn: {
    parameter: 'Total Coliform',
    unit: 'MPN/100ml',
    acceptable: 'Absent',
    permissible: 'Absent',
  },
  fecal_coliform_mpn: {
    parameter: 'Fecal Coliform',
    unit: 'MPN/100ml',
    acceptable: 'Absent',
    permissible: 'Absent',
  },
};

// ── Water source type labels ──────────────────────────────────────────────────
export const WATER_SOURCE_LABELS: Record<string, string> = {
  municipal: 'Municipal supply (utility)',
  groundwater_borewell: 'Groundwater (borewell / tubewell)',
  recycled_reclaimed: 'Recycled / reclaimed water',
  surface_water: 'Surface water (tank, pond, river)',
  rainwater_harvested: 'Harvested rainwater',
  other: 'Other source',
};

// ── RO technology type labels ─────────────────────────────────────────────────
export const RO_TECHNOLOGY_LABELS: Record<string, string> = {
  standard_ro: 'Standard RO',
  nanofiltration: 'Nanofiltration (NF)',
  ultrafiltration: 'Ultrafiltration (UF)',
  brackish_water_ro: 'Brackish water RO (BWRO)',
  seawater_ro: 'Seawater RO (SWRO)',
  other: 'Other membrane technology',
};

// ── Meter communication type labels ─────────────────────────────────────────
export const METER_COMM_LABELS: Record<string, string> = {
  rs485: 'RS-485',
  ethernet: 'Ethernet',
  gsm_gprs: 'GSM/GPRS',
  lorawan: 'LoRaWAN',
  zigbee: 'Zigbee',
  plc: 'Power Line Communication (PLC)',
  fiber: 'Fiber optic',
  other: 'Other',
};

// ════════════════════════════════════════════════════════════════
// WASTEWATER PHASE 2 — CPCB, IPCC, STP CONSTANTS
// ════════════════════════════════════════════════════════════════

// CPCB General Standards for discharge to inland surface waters
export const CPCB_DISCHARGE_STANDARDS: Record<
  string,
  { parameter: string; unit: string; limit: string }
> = {
  suspended_solids: { parameter: 'Suspended Solids', unit: 'mg/L', limit: '≤100' },
  ph: { parameter: 'pH', unit: '—', limit: '5.5–9.0' },
  temperature: { parameter: 'Temperature', unit: '°C', limit: '≤40' },
  oil_and_grease: { parameter: 'Oil & Grease', unit: 'mg/L', limit: '≤10' },
  ammonical_nitrogen: { parameter: 'Ammonical Nitrogen', unit: 'mg/L', limit: '≤50' },
  total_kjeldahl_nitrogen: { parameter: 'TKN', unit: 'mg/L', limit: '≤100' },
  bod: { parameter: 'BOD (5-day, 20°C)', unit: 'mg/L', limit: '≤30' },
  cod: { parameter: 'COD', unit: 'mg/L', limit: '≤250' },
  arsenic: { parameter: 'Arsenic', unit: 'mg/L', limit: '≤0.2' },
  mercury: { parameter: 'Mercury', unit: 'mg/L', limit: '≤0.01' },
  lead: { parameter: 'Lead', unit: 'mg/L', limit: '≤0.1' },
  cadmium: { parameter: 'Cadmium', unit: 'mg/L', limit: '≤2.0' },
  hexavalent_chromium: { parameter: 'Hexavalent Chromium', unit: 'mg/L', limit: '≤0.1' },
  total_residual_chlorine: { parameter: 'Total Residual Chlorine', unit: 'mg/L', limit: '≤1.0' },
  free_ammonia: { parameter: 'Free Ammonia', unit: 'mg/L', limit: '≤5.0' },
};

// IPCC 2006 defaults for wastewater
export const IPCC_WASTEWATER = {
  Bo: 0.6,
  GWP_CH4: 28,
  GWP_N2O: 265,
  EF_N2O: 0.005,
  defaultBOD: {
    domestic_sewage: 250,
    hospital_effluent: 350,
    kitchen_wastewater: 600,
    vehicle_wash: 80,
    mixed: 280,
  },
  defaultTKN: {
    domestic_sewage: 40,
    hospital_effluent: 55,
    kitchen_wastewater: 25,
    mixed: 40,
  },
};

// STP/ETP energy intensity (kWh/m³) by treatment stage
export const STP_ENERGY_KWH_M3 = {
  preliminary: 0.05,
  primary: 0.1,
  secondary: 0.35,
  tertiary: 0.45,
};

// MCF values by treatment pathway (IPCC 2006 Table 6.8)
export const WASTEWATER_MCF: Record<string, number> = {
  no_treatment: 1.0,
  preliminary_only: 0.9,
  primary_only: 0.6,
  aerobic_secondary: 0.1,
  aerobic_secondary_tertiary: 0.1,
  anaerobic_lagoon: 0.8,
  anaerobic_reactor: 0.8,
  septic_tank: 0.5,
};

// IS 3025 wastewater parameter labels
export const WASTEWATER_PARAMETER_LABELS: Record<string, string> = {
  colour: 'Colour',
  odour: 'Odour',
  suspended_solids: 'Suspended Solids',
  particulate_size_ss: 'Particulate size of Suspended Solids',
  ph: 'pH Value',
  temperature: 'Temperature',
  oil_and_grease: 'Oil and Grease',
  total_residual_chlorine: 'Total Residual Chlorine',
  ammonical_nitrogen: 'Ammonical Nitrogen (NH3-N)',
  total_kjeldahl_nitrogen: 'Total Kjeldahl Nitrogen (TKN)',
  free_ammonia: 'Free Ammonia (as NH3)',
  bod: 'Biochemical Oxygen Demand (BOD)',
  cod: 'Chemical Oxygen Demand (COD)',
  arsenic: 'Arsenic (as As)',
  mercury: 'Mercury (as Hg)',
  lead: 'Lead (as Pb)',
  cadmium: 'Cadmium (as Cd)',
  hexavalent_chromium: 'Hexavalent Chromium (Cr⁶⁺)',
};

// IS 3025 wastewater parameter units
export const WASTEWATER_PARAMETER_UNITS: Record<string, string> = {
  colour: 'Hazen / TCU',
  odour: '—',
  suspended_solids: 'mg/L',
  particulate_size_ss: 'µm',
  ph: '—',
  temperature: '°C',
  oil_and_grease: 'mg/L',
  total_residual_chlorine: 'mg/L',
  ammonical_nitrogen: 'mg/L',
  total_kjeldahl_nitrogen: 'mg/L',
  free_ammonia: 'mg/L',
  bod: 'mg/L',
  cod: 'mg/L',
  arsenic: 'mg/L',
  mercury: 'mg/L',
  lead: 'mg/L',
  cadmium: 'mg/L',
  hexavalent_chromium: 'mg/L',
};

// Default 18 IS 3025 parameter records for initialization
export const DEFAULT_WASTEWATER_CHARACTERISTICS: Array<{
  parameter: WastewaterParameter;
  unit: string;
  cpcbLimit?: string;
}> = [
  { parameter: 'colour', unit: 'TCU', cpcbLimit: undefined },
  { parameter: 'odour', unit: '—', cpcbLimit: undefined },
  { parameter: 'suspended_solids', unit: 'mg/L', cpcbLimit: '≤100' },
  { parameter: 'particulate_size_ss', unit: 'µm', cpcbLimit: undefined },
  { parameter: 'ph', unit: '—', cpcbLimit: '5.5–9.0' },
  { parameter: 'temperature', unit: '°C', cpcbLimit: '≤40' },
  { parameter: 'oil_and_grease', unit: 'mg/L', cpcbLimit: '≤10' },
  { parameter: 'total_residual_chlorine', unit: 'mg/L', cpcbLimit: '≤1.0' },
  { parameter: 'ammonical_nitrogen', unit: 'mg/L', cpcbLimit: '≤50' },
  { parameter: 'total_kjeldahl_nitrogen', unit: 'mg/L', cpcbLimit: '≤100' },
  { parameter: 'free_ammonia', unit: 'mg/L', cpcbLimit: '≤5.0' },
  { parameter: 'bod', unit: 'mg/L', cpcbLimit: '≤30' },
  { parameter: 'cod', unit: 'mg/L', cpcbLimit: '≤250' },
  { parameter: 'arsenic', unit: 'mg/L', cpcbLimit: '≤0.2' },
  { parameter: 'mercury', unit: 'mg/L', cpcbLimit: '≤0.01' },
  { parameter: 'lead', unit: 'mg/L', cpcbLimit: '≤0.1' },
  { parameter: 'cadmium', unit: 'mg/L', cpcbLimit: '≤2.0' },
  { parameter: 'hexavalent_chromium', unit: 'mg/L', cpcbLimit: '≤0.1' },
];

// ════════════════════════════════════════════════════════════════
// SOLID WASTE PHASE 3 CONSTANTS (IPCC 2006 Vol. 5)
// ════════════════════════════════════════════════════════════════

// IPCC 2006 Table 2.4 — DOC by waste category
export const SOLID_WASTE_DOC: Record<string, { doc: number; label: string }> = {
  domestic_wet_food: { doc: 0.15, label: 'Wet domestic/food waste' },
  domestic_dry: { doc: 0.05, label: 'Dry recyclables' },
  domestic_ewaste: { doc: 0.0, label: 'E-waste (inert)' },
  domestic_bulky: { doc: 0.05, label: 'Bulky waste' },
  garden_grass_leaves: { doc: 0.2, label: 'Grass cuttings & leaves' },
  garden_fruits_veg: { doc: 0.15, label: 'Fruits & vegetables' },
  garden_twigs: { doc: 0.3, label: 'Twigs & branches (woody)' },
  garden_misc: { doc: 0.2, label: 'Miscellaneous green waste' },
  hospital_nonbiomedical: { doc: 0.15, label: 'Hospital non-biomedical waste' },
  kitchen_solid: { doc: 0.15, label: 'Kitchen/food solid waste' },
  construction: { doc: 0.03, label: 'Construction & demolition (mostly inert)' },
  other_organic: { doc: 0.15, label: 'Other organic waste' },
  scrap_inert: { doc: 0.0, label: 'Scrap/e-waste (inert)' },
};

// MCF by landfill type (IPCC 2006 Table 3.1)
export const LANDFILL_MCF: Record<string, number> = {
  managed_sanitary: 1.0,
  semi_controlled: 0.5,
  uncontrolled_open_dump: 0.4,
};

// Incineration emission factors (tCO2/tonne)
export const INCINERATION_EF: Record<string, number> = {
  msw_incinerator: 0.91,
  biomedical_incinerator: 0.8,
  industrial_incinerator: 0.95,
  waste_to_energy: 0.84,
  other: 0.91,
};

// Sieve size display labels
export const SIEVE_SIZE_LABELS: Record<SieveSize, string> = {
  lt_4mm: '< 4 mm',
  '4_10mm': '4 – 10 mm',
  '10_20mm': '10 – 20 mm',
  '20_50mm': '20 – 50 mm',
  '50_100mm': '50 – 100 mm',
  '100_150mm': '100 – 150 mm',
  '150_200mm': '150 – 200 mm',
  gt_200mm: '> 200 mm',
};

// Placeholder suggestions for sieve fraction waste type field
export const SIEVE_WASTE_TYPE_HINTS: Record<SieveSize, string> = {
  lt_4mm: 'Fine inerts, soil, ash, putrescibles',
  '4_10mm': 'Fine organics, small stones',
  '10_20mm': 'Mixed organics and plastics',
  '20_50mm': 'Paper, cardboard, organics',
  '50_100mm': 'Plastics, metals, textiles',
  '100_150mm': 'Large cardboard, hard plastics',
  '150_200mm': 'Bulky items, wood pieces',
  gt_200mm: 'Oversized items, bulky waste',
};

// Default 8 sieve fractions for a new MSW plant entry
export const DEFAULT_SIEVE_FRACTIONS: Array<{ sieveSize: SieveSize }> = [
  { sieveSize: 'lt_4mm' },
  { sieveSize: '4_10mm' },
  { sieveSize: '10_20mm' },
  { sieveSize: '20_50mm' },
  { sieveSize: '50_100mm' },
  { sieveSize: '100_150mm' },
  { sieveSize: '150_200mm' },
  { sieveSize: 'gt_200mm' },
];
