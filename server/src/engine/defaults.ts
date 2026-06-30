export interface EmissionFactors {
  electricityKgCo2PerKwh: number;
  dieselKgCo2PerLitre: number;
  steelKgCo2PerKg: number;
  concreteKgCo2PerKg: number;
  woodKgCo2PerKg: number;
  glassKgCo2PerKg: number;
  plasticKgCo2PerKg: number;
  solidWasteUnmanagedDump: number;
  solidWasteComposting: number;
  solidWasteRecycling: number;
  solidWasteBurning: number;
  liquidWasteUnmanaged: number;
  liquidWasteMunicipalSTP: number;
  liquidWasteCampusSTP: number;
}

export const HARDCODED_DEFAULTS: EmissionFactors = {
  electricityKgCo2PerKwh: 0.716,
  dieselKgCo2PerLitre: 2.68,
  steelKgCo2PerKg: 1.85,
  concreteKgCo2PerKg: 0.159,
  woodKgCo2PerKg: 0.72,
  glassKgCo2PerKg: 0.91,
  plasticKgCo2PerKg: 2.41,
  solidWasteUnmanagedDump: 0.52,
  solidWasteComposting: 0.1,
  solidWasteRecycling: 0.021,
  solidWasteBurning: 0.98,
  liquidWasteUnmanaged: 0.068,
  liquidWasteMunicipalSTP: 0.012,
  liquidWasteCampusSTP: 0.008,
};

export const HARDCODED_DEFAULT_MAP: Record<string, number> = {
  electricity: 0.716,
  diesel: 2.68,
  steel: 1.85,
  concrete: 0.159,
  wood: 0.72,
  glass: 0.91,
  plastic: 2.41,
  solid_waste: 0.52,
  solid_waste_composting: 0.1,
  solid_waste_recycling: 0.021,
  solid_waste_burning: 0.98,
  // liquid_waste: multiple records — handled by name matching in loadEmissionFactors
};

// ─── Grid & Electricity ─────────────────────────────────────────────────────
// Source: CEA + Low Carbon Lifestyles, MoEFCC, GoI (Annexure 8 / Energy sheet)
export const GRID_EMISSION_FACTOR_KG_KWH = 0.82; // kg CO2e/kWh
// Legacy fallback kept for backward compat
export const INDIA_GRID_EMISSION_FACTOR = 0.716; // kg CO2e/kWh (CEA 2020)

// CEA year-specific table (kept for backward compat, secondary priority)
export const CEA_EMISSION_FACTORS_BY_YEAR: Record<number, number> = {
  2019: 0.74,
  2020: 0.716,
  2021: 0.708,
  2022: 0.706,
  2023: 0.706,
  2024: 0.706,
  2025: 0.706,
};

// ─── Fuel Emission Factors ───────────────────────────────────────────────────
// Source: IPCC Guidelines for National GHG Inventories (Annexure 8 / Vehicle sheet)
export const DIESEL_EF_KG_L = 2.65; // kg CO2e/litre
export const PETROL_EF_KG_L = 2.31; // kg CO2e/litre
// Source: Low Carbon Lifestyles, MoEFCC, GoI (Annexure 8 / Cooking fuel sheet)
export const LPG_EF_KG_KG = 3.13; // kg CO2e/kg LPG
export const LPG_CYLINDER_KG = 14.2; // kg per standard cylinder

// ─── Refrigerant GWP Emission Factors (AR6, 100-year) ───────────────────────
// Source: IPCC Sixth Assessment Report (Fugitive_Emission.xlsx EF sheet)
export const REFRIGERANT_EF: Record<string, number> = {
  R22: 1960,
  R32: 771,
  R134A: 1530,
  R407C: 1908,
  R410A: 2256,
  R404A: 4728,
  r22: 1960,
  r32: 771,
  r134a: 1530,
  r407c: 1908,
  r410a: 2256,
  r404a: 4728,
};
export const DEFAULT_REFRIGERANT_LEAKAGE_RATE = 0.1; // 10% per year

// ─── GWP Values (AR6, 100-year) ─────────────────────────────────────────────
// Source: IPCC Sixth Assessment Report (used in all provided calculation sheets)
export const GWP_CH4 = 27; // AR6 (sheets use 27, not 28)
export const GWP_N2O = 265; // AR6

// ─── Solid Waste FOD Parameters ─────────────────────────────────────────────
// Source: Carbon_Calculation_Solidwaste.xlsx (IPCC FOD method)
export const SOLID_WASTE_K = 0.065; // methane generation rate constant (1/yr)
export const SOLID_WASTE_DOC = 0.11; // degradable organic carbon fraction
export const SOLID_WASTE_DOCf = 0.5; // fraction of DOC that decomposes
export const SOLID_WASTE_F = 0.4; // fraction CH4 in LFG
export const LANDFILL_MCF: Record<string, number> = {
  managed_anaerobic: 1.0,
  anaerobic: 0.8,
  semi_aerobic: 0.5,
  unmanaged_shallow: 0.5,
  unmanaged_deep: 0.8,
  // Legacy landfill type aliases
  managed_sanitary: 1.0,
  semi_controlled: 0.5,
  uncontrolled_open_dump: 0.5,
};
export const DEFAULT_LANDFILL_MCF = 0.5;

// ─── Incineration Parameters ─────────────────────────────────────────────────
// Source: Carbon_Calculation_Solidwaste.xlsx (Waste Incineration sheet)
export const INCINERATION_CC = 0.6; // fraction of carbon content in waste
export const INCINERATION_FCF = 0.25; // fraction of fossil carbon in waste
export const INCINERATION_BOE = 0.95; // burn-out efficiency of combustion
// CO2 formula: tonnes × CC × FCF × BOE × (44/12)

// ─── Wastewater Parameters ───────────────────────────────────────────────────
// Source: carbon_emission_calculation_wastewater.xlsx (IPCC Ch6)
export const WASTEWATER_Bo = 0.6; // kg CH4/kg BOD (IPCC Table 6.2)
export const WASTEWATER_MCF: Record<string, number> = {
  activated_sludge: 0.3,
  trickling_filter: 0.3,
  lagoon_aerobic: 0.2,
  lagoon_anaerobic: 0.8,
  lagoon_facultative: 0.5,
  septic: 0.5,
  centralized_stp: 0.3,
  none: 1.0,
};
export const DEFAULT_WASTEWATER_MCF = 0.5;

// N2O parameters (IPCC Ch6)
export const WASTEWATER_N2O_EF_CENTRALIZED = 0.016; // kg N2O-N/kg N (centralized STP)
export const WASTEWATER_N2O_EF_DISCHARGE = 0.005; // kg N2O-N/kg N (river discharge)
export const WASTEWATER_BFCX = 0.06; // India fraction in income group i
export const WASTEWATER_Tj = 0.67; // degree of utilisation of treatment pathway
// Protein/nitrogen constants (from sheet BOD Load / N2O sheets)
export const PROTEIN_FPC_KG_PERSON_YR = 19.69; // kg protein/person/yr
export const PROTEIN_DIGESTIBILITY = 0.96; // digestible fraction
export const PROTEIN_N_FRACTION = 0.16; // kg N per kg protein
export const PROTEIN_NPRC = 1.13; // non-protein nitrogen correction factor
export const N2O_N_TO_N2O = 44 / 28;

// ─── Road Infrastructure ─────────────────────────────────────────────────────
// Source: Road_Infra_.xlsx (amortized construction + maintenance per lane per km)
export const ROAD_CONSTRUCTION_EF_T_LANE_KM_YR = 29; // tCO2/lane/km/yr (amortized)
export const ROAD_MAINTENANCE_EF_T_LANE_KM_YR = 6; // tCO2/lane/km/yr
export const ROAD_TOTAL_EF_T_LANE_KM_YR = 35; // construction + maintenance

// ─── Transport / Scope 3 ─────────────────────────────────────────────────────
// Source: Emission_due_to_Commutation.xlsx
export const COMMUTE_EF_KG_KM = 0.15; // kg CO2e/km
export const AIR_TRAVEL_EF_KG_KM = 0.2; // kg CO2e/km
export const PURCHASED_GOODS_EF_KG_USD = 0.246; // kg CO2e/2022 USD
export const INR_TO_USD_2022 = 83; // INR/USD (2022 rate)

// ─── Water Treatment Defaults ────────────────────────────────────────────────
export const WTP_ENERGY_KWH_M3 = 0.4; // kWh/m³
export const RO_ENERGY_KWH_M3 = 1.5; // kWh/m³
export const STP_ENERGY_KWH_M3_DEFAULT = 0.3; // kWh/m³

// ─── Default BOD/TKN concentrations ─────────────────────────────────────────
export const DEFAULT_BOD_MG_L = 250; // typical domestic wastewater (mg/L)
export const DEFAULT_TKN_MG_L = 40; // typical TKN (mg/L)

// ─── Vegetation sequestration (tCO2/ha/yr, negative = sink) ─────────────────
// Source: IPCC/India NATCOM estimates
export const VEGETATION_SEQUESTRATION_T_HA_YR: Record<string, number> = {
  dense_forest: -8.5,
  light_forest: -4.2,
  grassland: -1.8,
  shrubland: -2.1,
  wetland: -6.3,
};
